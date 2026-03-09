// Step-by-step LLM turn orchestrator.
// Drives a conversation loop with an LLM to execute game commands one step at a time.

import type { GameCommand } from "../game/types";
import { validateCommand } from "../game/validators";
import { useGameStore } from "../store/game-store";
import { useConfigStore } from "../store/config-store";
import { serializeStateForLLM } from "./state-serializer";
import { runHeuristicTurn } from "./heuristic";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Build the system prompt for the LLM
function buildSystemPrompt(playerId: number): string {
  return `You are playing a turn-based tactics game (Advance Wars style). Control player ${playerId}'s units.

RULES:
- Each unit can move once (MOVE) then perform one action (ATTACK/CAPTURE/WAIT), OR just act in place.
- After all units acted or you choose to, call END_TURN.
- Output exactly 1-2 commands per response as a JSON array.
- A MOVE can be combined with one action: [MOVE, CAPTURE] or [MOVE, ATTACK] or [MOVE, WAIT].
- Or just act in place: [CAPTURE] or [WAIT].
- Or end turn: [END_TURN].

OUTPUT FORMAT (JSON array only, no other text):
[{"type":"MOVE","player_id":${playerId},"unit_id":5,"dest_x":3,"dest_y":4}]
[{"type":"MOVE","player_id":${playerId},"unit_id":5,"dest_x":3,"dest_y":4},{"type":"CAPTURE","player_id":${playerId},"unit_id":5}]
[{"type":"ATTACK","player_id":${playerId},"attacker_id":5,"target_id":7,"weapon_index":0}]
[{"type":"END_TURN","player_id":${playerId}}]

STRATEGY: Capture neutral/enemy properties, protect your HQ, attack weakened enemies.`;
}

// Extract JSON array from LLM text (strips markdown code blocks)
function extractJsonArray(text: string): unknown[] | null {
  // Strip markdown code blocks
  let cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");

  // Find first [ and last ]
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

// Call Anthropic REST API via Electron IPC
async function callAnthropicViaIPC(messages: ChatMessage[], model: string): Promise<string> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }
  const result = (await window.electronAPI.runAI("anthropic", messages, { model })) as
    | { text: string }
    | { error: string };
  if ("error" in result) throw new Error(result.error);
  return result.text;
}

// Call OpenAI REST API via Electron IPC
async function callOpenAIViaIPC(messages: ChatMessage[], model: string): Promise<string> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }
  const result = (await window.electronAPI.runAI("openai", messages, { model })) as
    | { text: string }
    | { error: string };
  if ("error" in result) throw new Error(result.error);
  return result.text;
}

// Call Ollama (OpenAI-compatible) directly from renderer
async function callOllama(messages: ChatMessage[], model: string): Promise<string> {
  const ollamaUrl = useConfigStore.getState().localHttpUrl;
  const response = await fetch(`${ollamaUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 1024, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");
  return content;
}

// Main LLM turn runner
export async function runLLMTurn(
  provider: "anthropic" | "openai" | "local_http",
  playerId: number,
  signal?: AbortSignal
): Promise<void> {
  const config = useConfigStore.getState();

  // Determine model
  let model: string;
  if (provider === "anthropic") {
    model = config.anthropicModel || "claude-sonnet-4-6";
  } else if (provider === "openai") {
    model = config.openaiModel || "gpt-4o";
  } else {
    model = config.ollamaModel || "llama3.2";
  }

  const conversation: ChatMessage[] = [];
  const systemPrompt = buildSystemPrompt(playerId);
  let totalRetries = 0;
  const MAX_TOTAL_RETRIES = 9; // 3 retries × up to 3 steps before giving up
  let stepRetries = 0;
  const MAX_STEP_RETRIES = 3;

  // Fallback helper
  const fallback = () => {
    const state = useGameStore.getState().gameState;
    if (!state) return;
    const commands = runHeuristicTurn(state, playerId);
    if (commands.length > 0) {
      useGameStore.getState().queueCommands(commands);
    }
  };

  while (true) {
    // Check abort signal
    if (signal?.aborted) break;

    // Check total retry budget
    if (totalRetries >= MAX_TOTAL_RETRIES) {
      console.warn("[LLM AI] Too many retries, falling back to heuristic");
      fallback();
      break;
    }

    // Get current game state
    const gameState = useGameStore.getState().gameState;
    if (!gameState || gameState.phase !== "action") break;

    // Check if it's still this player's turn
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer || currentPlayer.id !== playerId) break;

    // Serialize state
    const stateSummary = serializeStateForLLM(gameState, playerId);
    conversation.push({ role: "user", content: stateSummary });

    // Call LLM
    let responseText: string;
    try {
      if (provider === "anthropic") {
        responseText = await callAnthropicViaIPC(
          [{ role: "system", content: systemPrompt }, ...conversation],
          model
        );
      } else if (provider === "openai") {
        responseText = await callOpenAIViaIPC(
          [{ role: "system", content: systemPrompt }, ...conversation],
          model
        );
      } else {
        // local_http (Ollama)
        responseText = await callOllama(
          [{ role: "system", content: systemPrompt }, ...conversation],
          model
        );
      }
    } catch (err) {
      console.error("[LLM AI] API call failed:", err);
      fallback();
      break;
    }

    // Add assistant message to history
    conversation.push({ role: "assistant", content: responseText });

    // Parse JSON commands
    const parsed = extractJsonArray(responseText);
    if (!parsed) {
      stepRetries++;
      totalRetries++;
      const errorMsg = `Your response was not valid JSON. Please output only a JSON array like: [{"type":"END_TURN","player_id":${playerId}}]`;
      conversation.push({ role: "user", content: errorMsg });
      if (stepRetries >= MAX_STEP_RETRIES) {
        console.warn("[LLM AI] Failed to parse JSON after retries, falling back");
        fallback();
        break;
      }
      continue;
    }

    // Validate each command
    const freshState = useGameStore.getState().gameState;
    if (!freshState) break;

    const validCommands: GameCommand[] = [];
    const errors: string[] = [];

    for (const raw of parsed) {
      const cmd = raw as GameCommand;
      const result = validateCommand(cmd, freshState);
      if (result.valid) {
        validCommands.push(cmd);
      } else {
        errors.push(`Command ${JSON.stringify(cmd)} is invalid: ${result.error}`);
      }
    }

    if (errors.length > 0) {
      stepRetries++;
      totalRetries++;
      const errorMsg = `Some commands were invalid:\n${errors.join("\n")}\nPlease try again with valid commands.`;
      conversation.push({ role: "user", content: errorMsg });
      if (stepRetries >= MAX_STEP_RETRIES) {
        console.warn("[LLM AI] Too many validation errors, falling back");
        fallback();
        break;
      }
      continue;
    }

    // Reset step retry counter on success
    stepRetries = 0;

    if (validCommands.length === 0) {
      // Empty valid array — treat as END_TURN
      useGameStore.getState().queueCommands([{ type: "END_TURN", player_id: playerId }]);
      await waitForQueueComplete();
      break;
    }

    // Queue valid commands
    useGameStore.getState().queueCommands(validCommands);

    // Wait for queue to drain
    await waitForQueueComplete();

    // Check if signal aborted while waiting
    if (signal?.aborted) break;

    // Check if END_TURN was among the commands
    const hasEndTurn = validCommands.some((c) => c.type === "END_TURN");
    if (hasEndTurn) break;

    // Check if game state changed to a different player or phase
    const newState = useGameStore.getState().gameState;
    if (!newState || newState.phase !== "action") break;
    const newPlayer = newState.players[newState.current_player_index];
    if (!newPlayer || newPlayer.id !== playerId) break;
  }
}
