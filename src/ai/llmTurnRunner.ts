/**
 * **LLM turn runner**: one batched model call per turn → JSON commands →
 * {@link ../game/validators.validateCommand} + {@link ../game/applyCommand.applyCommand} in order.
 * Falls back to {@link ./heuristic.runHeuristicTurn} on failure; integrates with {@link ../store/gameStore}.
 */

import type { GameCommand } from "../game/types";
import { validateCommand } from "../game/validators";
import { applyCommand } from "../game/applyCommand";
import { getAllUnitData, getUnitData } from "../game/dataLoader";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { serializeStateForLLM } from "./stateSerializer";
import { runHeuristicTurn } from "./heuristic";
import type { ChatMessage } from "./llmProviders";
import {
  callAnthropicViaIPC,
  callGeminiViaIPC,
  callOpenAIViaIPC,
  callOllama,
} from "./llmProviders";

function buildUnitCostTable(): string {
  const allUnits = getAllUnitData();
  const entries = Object.values(allUnits)
    .sort((a, b) => a.cost - b.cost)
    .map((u) => `${u.id} ${u.cost}`);
  return entries.join(", ");
}

function buildSystemPrompt(playerId: number): string {
  const costTable = buildUnitCostTable();

  return `You are playing a turn-based tactics game (Advance Wars style). You control player ${playerId}.

Plan your ENTIRE turn in a single response — move all your units, then end.

COMMAND TYPES:
- MOVE: {"type":"MOVE","player_id":${playerId},"unit_id":ID,"dest_x":X,"dest_y":Y}
- ATTACK: {"type":"ATTACK","player_id":${playerId},"attacker_id":ID,"target_id":TARGET_ID,"weapon_index":0}
- CAPTURE: {"type":"CAPTURE","player_id":${playerId},"unit_id":ID}
- WAIT: {"type":"WAIT","player_id":${playerId},"unit_id":ID}
- BUY_UNIT: {"type":"BUY_UNIT","player_id":${playerId},"unit_type":"infantry","facility_x":X,"facility_y":Y}
- LOAD: {"type":"LOAD","player_id":${playerId},"unit_id":ID,"transport_id":TRANSPORT_ID} (load infantry/mech into APC/lander/t_copter on same tile)
- UNLOAD: {"type":"UNLOAD","player_id":${playerId},"transport_id":TRANSPORT_ID,"unit_index":0,"dest_x":X,"dest_y":Y} (drop cargo to adjacent tile)
- MERGE: {"type":"MERGE","player_id":${playerId},"unit_id":ID,"target_id":TARGET_ID} (merge damaged same-type units; excess HP refunded as funds)
- END_TURN: {"type":"END_TURN","player_id":${playerId}}

RULES:
- Each unit can MOVE once, then do one action (ATTACK, CAPTURE, LOAD, WAIT, etc.).
- A unit that doesn't need to move can act in place (ATTACK/CAPTURE/WAIT without MOVE first).
- Infantry/Mech on an enemy or neutral capturable property should usually CAPTURE (not WAIT) if that advances your position.
- BUY_UNIT must use facility_x/facility_y from "YOUR PRODUCTION FACILITIES" in the state (exact coordinates). Each facility lists which unit_type strings it can build. The facility tile must be empty.
- ATTACK: weapon_index matches bracketed indices in state (e.g. [0]bazooka r1-1 vs [1]machine_gun r1-1). **Indirect fire** (weapon min_range > 1, e.g. artillery): cannot MOVE and ATTACK on the same turn — if you MOVE that unit, only WAIT (or other non-attack actions if any) remains. Plan MOVE+WAIT or stay put and ATTACK.
- If base damage vs that enemy type is 0 for a weapon, try the other weapon_index.
- LOAD: the unit being loaded must be on the same tile as the transport. The transport must have cargo space.
- UNLOAD: dest_x/dest_y must be an adjacent empty tile the cargo unit can traverse.
- MERGE: both units must be the same type, same owner, and on the same tile; at least one must be damaged.
- Always end with END_TURN.

COMBAT MATH (this engine — matches the "MATCH RULES" luck range in state):
- Base damage B comes from the attacker weapon's damage table vs the defender unit_type (shown as percents in data).
- Effective damage% ≈ B × (attacker_hp/10) × (100 − defender_hp × terrain_defense_stars) / 100 + luck_add.
- terrain_defense_stars: from defender's tile (cities/woods/mountains etc.); air units ignore terrain defense. Trenches give infantry/mech +2 defense stars.
- luck_add: each attack rolls a deterministic value in [luck_min, luck_max] from state, normalized to 0–1, then scaled to 0..(attacker_hp−1) and added to damage% (integer HP loss is floor(damage% / 10)).
- HP damage cannot exceed defender's current HP. After your attack, the defender may counterattack if in range, ammo allows, and weapon deals >0 damage.
- Use enemy lines in state: low HP defenders take less from the defense term; low HP attackers deal less damage.

CAPTURE (critical — many models get this wrong):
- Properties show cp_remaining=N/20 while a capture is in progress. When N reaches 0, the property flips to the capturer.
- **If a unit MOVES off a property tile, capture progress on that building resets to full (20)**. You lose all partial progress. The game state will show this as starting over.
- Therefore: if YOUR unit is on an enemy/neutral property with N<20, you are mid-capture. **Do not issue MOVE for that unit away from the property before CAPTURE in the same turn** unless you deliberately abandon the capture. A pointless one-tile sidestep still resets progress.
- Typical order: already on the property and continuing capture → CAPTURE only (no MOVE). Walking onto a property this turn → MOVE then CAPTURE.
- If the state lists "YOUR_BUILDING_UNDER_ATTACK", prioritize killing or dislodging the enemy capturer; that is often more important than grabbing a distant neutral.

ECONOMY / BUILD MIX (critical — spend your funds EVERY turn):
- Unit costs: ${costTable}. Check your funds in state before buying.
- **NEVER hoard funds.** If you have money and empty facilities, BUY units. Unspent funds are wasted — they don't earn interest. The SUGGESTED PURCHASES section shows exact BUY_UNIT commands you can copy.
- **If funds ≥ 7000, buy tanks or md_tanks** — not infantry. Infantry are for capturing, tanks are for fighting.
- If the enemy is near your HQ or your properties, build defensive combat units (tanks, anti_air) immediately — do not save money while under pressure.
- Mix: enough infantry/mech to secure properties, plus mobile combat units to kill enemy units and defend what you took.
- After you capture a neutral or enemy property, expect counterplay: leave a defender or station units to intercept enemy infantry moving in.

AGGRESSION:
- **Attack enemies when you can.** Check COMBAT PREVIEW — if you deal more damage than you take, attack. Don't let enemies roam your territory unchallenged.
- **Capture enemy properties** — especially undefended ones. Every property you take is +1000 income/turn for you and -1000 for them.
- **Don't ignore easy captures.** If an infantry/mech is next to an undefended enemy city, MOVE onto it and CAPTURE. Don't WAIT instead.

OUTPUT FORMAT — a single JSON array containing ALL commands for this turn, no other text:
[
  {"type":"BUY_UNIT","player_id":${playerId},"unit_type":"tank","facility_x":5,"facility_y":2},
  {"type":"MOVE","player_id":${playerId},"unit_id":1,"dest_x":3,"dest_y":4},
  {"type":"CAPTURE","player_id":${playerId},"unit_id":1},
  {"type":"MOVE","player_id":${playerId},"unit_id":2,"dest_x":6,"dest_y":7},
  {"type":"ATTACK","player_id":${playerId},"attacker_id":2,"target_id":5,"weapon_index":0},
  {"type":"WAIT","player_id":${playerId},"unit_id":3},
  {"type":"END_TURN","player_id":${playerId}}
]

STRATEGY:
- Every user message starts with TURN PRIORITY, STRATEGIC MAP, and HEURISTIC ACTION PLAN — **copy those commands directly unless you have a clear better plan**. The plan uses the same pathfinding as the built-in offline AI and tells you exactly what to do after each MOVE (CAPTURE, ATTACK, or WAIT). If you ignore the plan and only MOVE+WAIT, you waste the turn.
- Use "COMBAT PREVIEW" for first-strike and estimated counter damage (same engine math as real attacks).
- Read "CAPTURE NOTES" and "YOUR PRODUCTION FACILITIES" every turn.
- If fog hides enemies, still march toward the enemy HQ coordinates listed in STRATEGIC MAP — sitting still loses.

TACTICAL PRINCIPLES (Advance Wars):
- **Economy wins games.** More properties = more income = more/better units. Rush to capture neutral properties early (infantry spam turn 1-3), then transition to combat units.
- **Attack enemies capturing YOUR properties.** Damaging a capturing unit reduces its HP, which means it captures fewer points per turn (capture reduction = unit HP). Killing it resets capture progress entirely. This is almost always the highest priority.
- **Concentrate force.** Don't spread units evenly — attack the enemy's weak side with multiple units. Two units attacking one enemy is better than two separate 1v1s.
- **Use terrain.** Cities (3★), woods (2★), mountains (4★) give defense stars that reduce damage taken. Position your units on defensive terrain when possible. Plains (0★) and roads (0★) offer no defense.
- **First-strike advantage.** The attacker always deals damage first. If you can one-shot an enemy, attack — they can't counter if dead. Check COMBAT PREVIEW for kill opportunities.
- **Screen your captures.** After moving infantry onto a property, position a tank or mech nearby to protect them. Undefended capturers get picked off.
- **Don't block your own facilities.** If a unit is sitting on your factory/airport/port and has already acted, it prevents you from building. Move units off production tiles when possible.
- **Target high-value units.** Killing a tank (7000) is worth more than killing infantry (1000). But killing a capturing infantry saves a property worth 1000/turn forever.
- **Damaged units are weak.** A 3HP tank deals ~30% of normal damage and is often better merged or retreated than left in combat.`;
}

// Extract JSON array from LLM text (strips markdown code blocks)
function extractJsonArray(text: string): unknown[] | null {
  let cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Wait for the command queue and animations to complete
function waitForQueueComplete(): Promise<void> {
  return new Promise<void>((resolve) => {
    const immediate = useGameStore.getState();
    if (!immediate.processingQueue && !immediate.isAnimating) {
      resolve();
      return;
    }
    const unsub = useGameStore.subscribe((s) => {
      if (!s.processingQueue && !s.isAnimating) {
        unsub();
        resolve();
      }
    });
  });
}

// Call the appropriate LLM provider
async function callLLM(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  messages: ChatMessage[],
  model: string,
  matchId?: string
): Promise<string> {
  const callOpts = { usageContext: "game_turn", maxTokens: 4096, matchId };
  if (provider === "anthropic") {
    return await callAnthropicViaIPC(messages, model, callOpts);
  } else if (provider === "openai") {
    return await callOpenAIViaIPC(messages, model, callOpts);
  } else if (provider === "gemini") {
    return await callGeminiViaIPC(messages, model, callOpts);
  } else {
    return await callOllama(messages, model, callOpts);
  }
}

// Validate commands sequentially against evolving state.
// Returns [validCommands, skippedCount]. Skipped commands are silently dropped
// (e.g. attacking a unit that was already killed by an earlier command).
function validateSequentially(
  commands: unknown[],
  playerId: number
): { valid: GameCommand[]; skipped: number; errors: string[] } {
  let simState = useGameStore.getState().gameState;
  if (!simState) return { valid: [], skipped: 0, errors: [] };

  const valid: GameCommand[] = [];
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of commands) {
    const cmd = raw as GameCommand;

    // Ensure all commands belong to this player
    if ("player_id" in cmd && cmd.player_id !== playerId) {
      skipped++;
      errors.push(`Command for wrong player: ${JSON.stringify(cmd)}`);
      continue;
    }

    const result = validateCommand(cmd, simState);
    if (result.valid) {
      valid.push(cmd);
      // Advance simulation state so subsequent commands validate against updated state
      try {
        simState = applyCommand(simState, cmd);
      } catch {
        // If apply fails, the command was valid per validator but had a runtime issue — keep it
        // and let the real game store handle it
      }
    } else {
      skipped++;
      errors.push(`${cmd.type} invalid: ${result.error || "unknown"}`);
    }
  }

  return { valid, skipped, errors };
}

// Re-validate a merged command list (LLM + heuristic supplements) against fresh state.
// Drops commands that fail validation after prior commands changed the board.
function revalidateCommandList(commands: GameCommand[], playerId: number): GameCommand[] {
  let simState = useGameStore.getState().gameState;
  if (!simState) return commands;

  const result: GameCommand[] = [];
  for (const cmd of commands) {
    const v = validateCommand(cmd, simState);
    if (v.valid) {
      result.push(cmd);
      try {
        simState = applyCommand(simState, cmd);
      } catch {
        // keep the command, let the real store handle it
      }
    }
  }
  // Ensure END_TURN is present
  if (!result.some((c) => c.type === "END_TURN")) {
    result.push({ type: "END_TURN", player_id: playerId });
  }
  return result;
}

// Main LLM turn runner — batch-first approach
export async function runLLMTurn(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  playerId: number,
  signal?: AbortSignal
): Promise<void> {
  const config = useConfigStore.getState();

  // Determine model
  let model: string;
  if (provider === "anthropic") {
    model = config.anthropicModel || "claude-sonnet-4-6";
  } else if (provider === "openai") {
    model = config.openaiModel || "gpt-4o-mini";
  } else if (provider === "gemini") {
    model = config.geminiModel || "gemini-2.5-flash";
  } else {
    model = config.ollamaModel || "llama3.2";
  }

  const systemPrompt = buildSystemPrompt(playerId);
  const MAX_CALLS = 3; // Hard cap on API calls per turn
  let callCount = 0;

  // Fallback helper
  const fallback = () => {
    const state = useGameStore.getState().gameState;
    if (!state) return;
    const commands = runHeuristicTurn(state, playerId);
    if (commands.length > 0) {
      useGameStore.getState().queueCommands(commands);
    }
  };

  // Conversation history for retries
  const conversation: ChatMessage[] = [];

  while (callCount < MAX_CALLS) {
    if (signal?.aborted) break;

    // Get current game state
    const gameState = useGameStore.getState().gameState;
    if (!gameState || gameState.phase !== "action") break;

    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer || currentPlayer.id !== playerId) break;

    // Check if there are any units left to act
    const unitsToAct = Object.values(gameState.units).filter(
      (u) => u.owner_id === playerId && !u.has_acted && !u.is_loaded
    );
    // If no units can act and this isn't the first call, just end turn
    if (callCount > 0 && unitsToAct.length === 0) {
      useGameStore.getState().queueCommands([{ type: "END_TURN", player_id: playerId }]);
      await waitForQueueComplete();
      break;
    }

    // Serialize current state
    const stateSummary = serializeStateForLLM(gameState, playerId);
    conversation.push({ role: "user", content: stateSummary });

    // Call LLM
    let responseText: string;
    callCount++;
    try {
      responseText = await callLLM(
        provider,
        [{ role: "system", content: systemPrompt }, ...conversation],
        model,
        gameState.match_id
      );
    } catch (err) {
      console.error("[LLM AI] API call failed:", err);
      fallback();
      break;
    }

    if (signal?.aborted) break;

    console.debug(`[LLM AI] Response (${responseText.length} chars):`, responseText.slice(0, 500));
    conversation.push({ role: "assistant", content: responseText });

    // Parse JSON
    const parsed = extractJsonArray(responseText);
    if (!parsed || parsed.length === 0) {
      console.warn("[LLM AI] Failed to extract JSON from response");
      // Bad JSON — ask for retry
      conversation.push({
        role: "user",
        content: `Your response was not valid JSON. Output a JSON array of ALL commands for your turn, ending with END_TURN. Example: [{"type":"WAIT","player_id":${playerId},"unit_id":1},{"type":"END_TURN","player_id":${playerId}}]`,
      });
      continue;
    }

    // Validate commands sequentially against evolving state
    const { valid, skipped, errors } = validateSequentially(parsed, playerId);
    console.debug(`[LLM AI] Validation: ${valid.length} valid, ${skipped} skipped`);
    if (errors.length > 0) console.debug("[LLM AI] Errors:", errors.slice(0, 5));

    if (valid.length === 0 && skipped > 0) {
      // All commands were invalid — include specific errors so the model can correct
      const errorSample = errors.slice(0, 5).join("\n");
      conversation.push({
        role: "user",
        content: `All ${skipped} commands were invalid. Errors:\n${errorSample}\nPlease review the game state and try again with valid commands.`,
      });
      continue;
    }

    // Quality check: detect "do-nothing" turns (only MOVE+WAIT, no CAPTURE/ATTACK/BUY_UNIT)
    const productiveTypes = new Set(["ATTACK", "CAPTURE", "BUY_UNIT", "LOAD", "UNLOAD", "MERGE"]);
    const hasProductiveAction = valid.some((c) => productiveTypes.has(c.type));
    const hasUnitsToAct = unitsToAct.length > 0;

    if (!hasProductiveAction && hasUnitsToAct && callCount < MAX_CALLS) {
      console.warn("[LLM AI] Do-nothing turn detected — only MOVE/WAIT/END_TURN, retrying with nudge");
      conversation.push({
        role: "user",
        content: `Your commands only contain MOVE and WAIT — you did not CAPTURE any properties, ATTACK any enemies, or BUY any units. This wastes your turn. Look at the HEURISTIC ACTION PLAN above — it shows exactly which commands to use, including CAPTURE and ATTACK after MOVE. Rewrite your full turn with productive actions. If a unit is on or moves to an enemy/neutral property, add CAPTURE. If a unit can reach an enemy, add ATTACK. If you have funds and empty facilities, add BUY_UNIT.`,
      });
      continue;
    }

    // Ensure END_TURN is present
    const hasEndTurn = valid.some((c) => c.type === "END_TURN");
    if (!hasEndTurn) {
      valid.push({ type: "END_TURN", player_id: playerId });
    }

    // Supplement with heuristic commands for missing actions
    let supplemented = false;

    // 1. Supplement purchases if the LLM didn't spend funds adequately
    const llmBuyCmds = valid.filter((c) => c.type === "BUY_UNIT");
    const playerState = gameState.players.find((p) => p.id === playerId);
    if (playerState && playerState.funds >= 1000) {
      const llmSpent = llmBuyCmds.reduce((sum, c) => {
        if (c.type === "BUY_UNIT") {
          const ud = getUnitData(c.unit_type);
          return sum + (ud?.cost ?? 0);
        }
        return sum;
      }, 0);
      const remaining = playerState.funds - llmSpent;

      if (remaining >= 1000) {
        const heuristicCmds = runHeuristicTurn(gameState, playerId);
        const heuristicBuys = heuristicCmds.filter((c) => c.type === "BUY_UNIT");
        const llmFacilities = new Set(
          llmBuyCmds
            .filter((c) => c.type === "BUY_UNIT")
            .map((c) => {
              const buy = c as GameCommand & { facility_x: number; facility_y: number };
              return `${buy.facility_x},${buy.facility_y}`;
            })
        );
        const extraBuys = heuristicBuys.filter((c) => {
          if (c.type !== "BUY_UNIT") return false;
          return !llmFacilities.has(`${c.facility_x},${c.facility_y}`);
        });
        if (extraBuys.length > 0) {
          console.debug(`[LLM AI] Supplementing with ${extraBuys.length} heuristic BUY_UNIT commands (${remaining} funds unspent)`);
          valid.unshift(...extraBuys);
          supplemented = true;
        }
      }
    }

    // 2. Supplement captures/attacks if LLM produced a fully do-nothing turn
    if (!hasProductiveAction && hasUnitsToAct) {
      console.warn("[LLM AI] Still do-nothing after retries, supplementing with heuristic commands");
      const heuristicCmds = runHeuristicTurn(gameState, playerId);
      const endIdx = valid.findIndex((c) => c.type === "END_TURN");
      const productive = heuristicCmds.filter((c) => c.type === "CAPTURE" || c.type === "ATTACK");
      if (productive.length > 0 && endIdx >= 0) {
        valid.splice(endIdx, 0, ...productive);
        supplemented = true;
      }
    }

    // 3. If we supplemented, re-validate the entire command list to prevent ghost animations
    // (supplemented BUY_UNIT commands change board state, which can invalidate later MOVEs)
    if (supplemented) {
      const revalidated = revalidateCommandList(valid, playerId);
      valid.length = 0;
      valid.push(...revalidated);
    }

    // Queue all valid commands at once
    useGameStore.getState().queueCommands(valid);
    await waitForQueueComplete();

    if (signal?.aborted) break;

    // Check if the turn actually ended
    const newState = useGameStore.getState().gameState;
    if (!newState || newState.phase !== "action") break;
    const newPlayer = newState.players[newState.current_player_index];
    if (!newPlayer || newPlayer.id !== playerId) break;

    // If we're still the current player (END_TURN failed or was removed during validation),
    // loop again to handle remaining units
  }

  // If we exhausted calls without ending the turn, fall back to heuristic
  if (callCount >= MAX_CALLS) {
    const state = useGameStore.getState().gameState;
    if (state && state.phase === "action") {
      const player = state.players[state.current_player_index];
      if (player?.id === playerId) {
        console.warn("[LLM AI] Max calls reached, finishing with heuristic");
        fallback();
      }
    }
  }
}
