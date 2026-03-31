/**
 * **LLM turn runner**: one batched model call per turn → JSON commands →
 * {@link ../game/validators.validateCommand} + {@link ../game/apply-command.applyCommand} in order.
 * Falls back to {@link ./heuristic.runHeuristicTurn} on failure; integrates with {@link ../store/game-store}.
 */

import type { GameCommand } from "../game/types";
import { validateCommand } from "../game/validators";
import { applyCommand } from "../game/apply-command";
import { useGameStore } from "../store/game-store";
import { useConfigStore } from "../store/config-store";
import { serializeStateForLLM } from "./state-serializer";
import { runHeuristicTurn } from "./heuristic";
import type { ChatMessage } from "./llm-providers";
import {
  callAnthropicViaIPC,
  callGeminiViaIPC,
  callOpenAIViaIPC,
  callOllama,
} from "./llm-providers";

// Build the system prompt for the LLM
function buildSystemPrompt(playerId: number): string {
  return `You are playing a turn-based tactics game (Advance Wars style). You control player ${playerId}.

Plan your ENTIRE turn in a single response — move all your units, then end.

COMMAND TYPES:
- MOVE: {"type":"MOVE","player_id":${playerId},"unit_id":ID,"dest_x":X,"dest_y":Y}
- ATTACK: {"type":"ATTACK","player_id":${playerId},"attacker_id":ID,"target_id":TARGET_ID,"weapon_index":0}
- CAPTURE: {"type":"CAPTURE","player_id":${playerId},"unit_id":ID}
- WAIT: {"type":"WAIT","player_id":${playerId},"unit_id":ID}
- BUY_UNIT: {"type":"BUY_UNIT","player_id":${playerId},"unit_type":"infantry","facility_x":X,"facility_y":Y}
- END_TURN: {"type":"END_TURN","player_id":${playerId}}

RULES:
- Each unit can MOVE once, then do one action (ATTACK, CAPTURE, or WAIT).
- A unit that doesn't need to move can act in place (ATTACK/CAPTURE/WAIT without MOVE first).
- Infantry/Mech on an enemy or neutral property should CAPTURE.
- You can BUY_UNIT at your factories (unit_type: "infantry", "mech", "tank", "recon", "anti_air", "artillery", "rocket", "missile", "md_tank", "apc", "b_copter", "t_copter", "fighter", "bomber").
- Always end with END_TURN.

OUTPUT FORMAT — a single JSON array containing ALL commands for this turn, no other text:
[
  {"type":"BUY_UNIT","player_id":${playerId},"unit_type":"infantry","facility_x":5,"facility_y":2},
  {"type":"MOVE","player_id":${playerId},"unit_id":1,"dest_x":3,"dest_y":4},
  {"type":"CAPTURE","player_id":${playerId},"unit_id":1},
  {"type":"MOVE","player_id":${playerId},"unit_id":2,"dest_x":6,"dest_y":7},
  {"type":"ATTACK","player_id":${playerId},"attacker_id":2,"target_id":5,"weapon_index":0},
  {"type":"WAIT","player_id":${playerId},"unit_id":3},
  {"type":"END_TURN","player_id":${playerId}}
]

STRATEGY:
- Buy infantry to capture and stronger units to fight.
- Capture neutral/enemy properties for income.
- Attack weakened enemies; focus fire when possible.
- Protect your HQ — don't leave it undefended.
- Move units toward the front; don't leave them idle in the rear.`;
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
): { valid: GameCommand[]; skipped: number } {
  let simState = useGameStore.getState().gameState;
  if (!simState) return { valid: [], skipped: 0 };

  const valid: GameCommand[] = [];
  let skipped = 0;

  for (const raw of commands) {
    const cmd = raw as GameCommand;

    // Ensure all commands belong to this player
    if ("player_id" in cmd && cmd.player_id !== playerId) {
      skipped++;
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
    }
  }

  return { valid, skipped };
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

    conversation.push({ role: "assistant", content: responseText });

    // Parse JSON
    const parsed = extractJsonArray(responseText);
    if (!parsed || parsed.length === 0) {
      // Bad JSON — ask for retry
      conversation.push({
        role: "user",
        content: `Your response was not valid JSON. Output a JSON array of ALL commands for your turn, ending with END_TURN. Example: [{"type":"WAIT","player_id":${playerId},"unit_id":1},{"type":"END_TURN","player_id":${playerId}}]`,
      });
      continue;
    }

    // Validate commands sequentially against evolving state
    const { valid, skipped } = validateSequentially(parsed, playerId);

    if (valid.length === 0 && skipped > 0) {
      // All commands were invalid — ask for retry with fresh state
      conversation.push({
        role: "user",
        content: `All ${skipped} commands were invalid. Please review the game state and try again with valid commands.`,
      });
      continue;
    }

    // Ensure END_TURN is present
    const hasEndTurn = valid.some((c) => c.type === "END_TURN");
    if (!hasEndTurn) {
      valid.push({ type: "END_TURN", player_id: playerId });
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
