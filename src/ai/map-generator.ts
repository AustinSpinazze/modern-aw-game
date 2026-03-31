// LLM-powered map generation with conversational refinement.

import type { ChatMessage } from "./llm-providers";
import {
  callAnthropicViaIPC,
  callGeminiViaIPC,
  callOpenAIViaIPC,
  callOllama,
} from "./llm-providers";
import { parseAwbwMapText } from "../game/awbw-import";
import { useConfigStore } from "../store/config-store";

interface ParsedPreview {
  width: number;
  height: number;
  tiles: number[][];
}

export interface MapGenResult {
  preview: ParsedPreview;
  csv: string;
  error?: string;
}

export const MAP_GEN_SYSTEM_PROMPT = `You are a map generator for a turn-based tactics game (Advance Wars style).
Generate maps as CSV grids of AWBW tile IDs. Output ONLY the CSV — no markdown, no code fences, no explanation.

VALID TILE IDs:
- 1: plains, 2: mountain, 3: forest (wood)
- 4-14: rivers (directional variants, use 4 for horizontal, 5 for vertical, 6 for cross)
- 15-25: roads (directional variants, use 15 for horizontal, 16 for vertical, 17 for cross)
- 26: bridge (horizontal), 27: bridge (vertical)
- 28: sea, 29-32: shoal, 33: reef
- 34: neutral city, 35: neutral factory, 36: neutral airport, 37: neutral port
- Player 1 buildings: 38=city, 39=factory, 40=airport, 41=port, 42=HQ
- Player 2 buildings: 43=city, 44=factory, 45=airport, 46=port, 47=HQ
- Player 3 buildings: 48=city, 49=factory, 50=airport, 51=port, 52=HQ
- Player 4 buildings: 53=city, 54=factory, 55=airport, 56=port, 57=HQ

RULES:
- Each row is one line of comma-separated numbers.
- Recommended size: 15x10 to 30x20 (width x height). Use the size the user requests, or default to 20x15.
- Each player MUST have exactly 1 HQ.
- Balance buildings evenly across players (same number of factories, cities, etc.).
- Use terrain (mountains, forests, rivers) to create interesting strategic choices.
- Place seas/shoals only if the map has a water theme or the user requests it.
- Neutral cities and factories should be placed in contested middle areas.
- Default to 2 players unless the user specifies more.
- Output plain CSV only. No headers, no row numbers, no blank lines.
- When the user asks for changes to an existing map, output the COMPLETE updated CSV (all rows).`;

function cleanLlmCsvOutput(raw: string): string {
  // Strip code fences
  let cleaned = raw.replace(/```(?:csv|text|plain)?\s*/gi, "").replace(/```/g, "");

  // Keep only lines that look like CSV (contain commas and digits)
  const lines = cleaned.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && /^\d[\d,\s]*\d$/.test(trimmed);
  });

  return lines.join("\n");
}

function validateGeneratedMap(preview: ParsedPreview): { valid: boolean; error?: string } {
  if (preview.width < 5 || preview.height < 5) {
    return { valid: false, error: "Map is too small (minimum 5x5)." };
  }
  if (preview.width > 50 || preview.height > 50) {
    return { valid: false, error: "Map is too large (maximum 50x50)." };
  }

  // Check for HQs and count players
  const playerHqs: Record<number, number> = {};
  for (let y = 0; y < preview.height; y++) {
    for (let x = 0; x < preview.width; x++) {
      const id = preview.tiles[y]?.[x] ?? 1;
      if (id === 42) playerHqs[1] = (playerHqs[1] ?? 0) + 1;
      else if (id === 47) playerHqs[2] = (playerHqs[2] ?? 0) + 1;
      else if (id === 52) playerHqs[3] = (playerHqs[3] ?? 0) + 1;
      else if (id === 57) playerHqs[4] = (playerHqs[4] ?? 0) + 1;
    }
  }

  const players = Object.keys(playerHqs);
  if (players.length < 2) {
    return { valid: false, error: "Map must have at least 2 players with HQs." };
  }
  if (players.length > 4) {
    return { valid: false, error: "Map has more than 4 players (max 4)." };
  }

  for (const [p, count] of Object.entries(playerHqs)) {
    if (count !== 1) {
      return { valid: false, error: `Player ${p} has ${count} HQs (must be exactly 1).` };
    }
  }

  return { valid: true };
}

// Parse raw LLM response into a MapGenResult
export function parseMapResponse(raw: string): MapGenResult {
  const csv = cleanLlmCsvOutput(raw);
  if (!csv.trim()) {
    return {
      preview: { width: 0, height: 0, tiles: [] },
      csv: "",
      error: "LLM returned no valid CSV data.",
    };
  }

  const mapData = parseAwbwMapText(csv);
  if (mapData.width === 0 || mapData.height === 0) {
    return {
      preview: { width: 0, height: 0, tiles: [] },
      csv,
      error: "Could not parse map from LLM output.",
    };
  }

  const preview: ParsedPreview = {
    width: mapData.width,
    height: mapData.height,
    tiles: mapData.tiles,
  };

  const validation = validateGeneratedMap(preview);
  if (!validation.valid) {
    return { preview, csv, error: validation.error };
  }

  return { preview, csv };
}

// Send a message in the map generation conversation and get a response
export async function sendMapGenMessage(
  messages: ChatMessage[],
  provider: string,
  model: string
): Promise<string> {
  const callOptions = { maxTokens: 4096, usageContext: "map_gen" };

  if (provider === "anthropic") {
    return await callAnthropicViaIPC(messages, model, callOptions);
  } else if (provider === "openai") {
    return await callOpenAIViaIPC(messages, model, callOptions);
  } else if (provider === "gemini") {
    return await callGeminiViaIPC(messages, model, callOptions);
  } else {
    return await callOllama(messages, model, callOptions);
  }
}

// Legacy one-shot API (kept for compatibility)
export async function generateMap(
  description: string,
  provider: string,
  model: string
): Promise<MapGenResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: MAP_GEN_SYSTEM_PROMPT },
    {
      role: "user",
      content: description || "Generate a balanced 2-player map with varied terrain.",
    },
  ];

  const raw = await sendMapGenMessage(messages, provider, model);
  return parseMapResponse(raw);
}

export function getMapGenProvider(): { provider: string; model: string } | null {
  const config = useConfigStore.getState();
  if (config.anthropicApiKey) {
    return { provider: "anthropic", model: config.anthropicModel || "claude-sonnet-4-6" };
  }
  if (config.openaiApiKey) {
    return { provider: "openai", model: config.openaiModel || "gpt-4o-mini" };
  }
  if (config.geminiApiKey) {
    return { provider: "gemini", model: config.geminiModel || "gemini-2.5-flash" };
  }
  if (config.localHttpEnabled && config.localHttpUrl) {
    return { provider: "local_http", model: config.ollamaModel || "llama3.2" };
  }
  return null;
}
