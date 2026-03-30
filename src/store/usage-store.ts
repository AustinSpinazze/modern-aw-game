// Token usage tracking — persisted to localStorage.

import { create } from "zustand";

// Pricing per million tokens (input / output) — March 2026
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-6":    { input: 5,  output: 25 },
  "claude-sonnet-4-6":  { input: 3,  output: 15 },
  "claude-haiku-4-5":   { input: 1,  output: 5 },
  "claude-haiku-4-5-20251001": { input: 1,  output: 5 },
  "claude-opus-4-5":    { input: 5,  output: 25 },
  "claude-sonnet-4-5":  { input: 3,  output: 15 },
  "claude-opus-4-1":    { input: 15, output: 75 },
  "claude-sonnet-4-0":  { input: 3,  output: 15 },
  "claude-opus-4-0":    { input: 15, output: 75 },
  // OpenAI (approximate — check docs for exact)
  "gpt-5.4":       { input: 2.5, output: 10 },
  "gpt-5.4-mini":  { input: 0.4, output: 1.6 },
  "gpt-5.4-nano":  { input: 0.1, output: 0.4 },
  "o3":            { input: 2,   output: 8 },
  "o4-mini":       { input: 1.1, output: 4.4 },
  "o3-mini":       { input: 1.1, output: 4.4 },
  "gpt-5":         { input: 2,   output: 8 },
  "gpt-5-mini":    { input: 0.3, output: 1.2 },
  "gpt-4.1":       { input: 2,   output: 8 },
  "gpt-4o":        { input: 2.5, output: 10 },
  "gpt-4o-mini":   { input: 0.15, output: 0.6 },
  // Gemini
  "gemini-3.1-pro-preview":        { input: 1.25, output: 10 },
  "gemini-3-flash-preview":        { input: 0.15, output: 0.6 },
  "gemini-3.1-flash-lite-preview": { input: 0.04, output: 0.15 },
  "gemini-2.5-pro":       { input: 1.25, output: 10 },
  "gemini-2.5-flash":     { input: 0.15, output: 0.6 },
  "gemini-2.5-flash-lite":{ input: 0.04, output: 0.15 },
};

export interface UsageEntry {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  context: string; // "game_turn" | "map_gen" | "unknown"
}

interface UsageState {
  entries: UsageEntry[];
  record: (provider: string, model: string, inputTokens: number, outputTokens: number, context: string) => void;
  clearHistory: () => void;
  totalCost: () => number;
  totalTokens: () => { input: number; output: number };
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function loadEntries(): UsageEntry[] {
  try {
    const raw = localStorage.getItem("aw_usage_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: UsageEntry[]) {
  // Keep last 500 entries to avoid unbounded growth
  const trimmed = entries.slice(-500);
  localStorage.setItem("aw_usage_history", JSON.stringify(trimmed));
}

export const useUsageStore = create<UsageState>((set, get) => ({
  entries: loadEntries(),

  record: (provider, model, inputTokens, outputTokens, context) => {
    const costUsd = calcCost(model, inputTokens, outputTokens);
    const entry: UsageEntry = {
      timestamp: Date.now(),
      provider,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      context,
    };
    const updated = [...get().entries, entry];
    saveEntries(updated);
    set({ entries: updated });
  },

  clearHistory: () => {
    localStorage.removeItem("aw_usage_history");
    set({ entries: [] });
  },

  totalCost: () => get().entries.reduce((sum, e) => sum + e.costUsd, 0),

  totalTokens: () => get().entries.reduce(
    (acc, e) => ({ input: acc.input + e.inputTokens, output: acc.output + e.outputTokens }),
    { input: 0, output: 0 },
  ),
}));
