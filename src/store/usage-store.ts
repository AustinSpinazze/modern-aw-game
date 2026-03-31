/**
 * **Token usage history** for analytics (Zustand + localStorage): per-call provider, model, tokens,
 * context (`game_turn`, `map_gen`, …). Settings UI reads this; no dollar estimates.
 */

import { create } from "zustand";

export interface UsageEntry {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  context: string; // "game_turn" | "map_gen" | "unknown"
  matchId?: string;
  gameResult?: "win" | "loss";
}

interface UsageState {
  entries: UsageEntry[];
  record: (
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    context: string,
    matchId?: string
  ) => void;
  /** Stamp a win/loss result onto all entries for the given matchId. */
  recordGameResult: (matchId: string, result: "win" | "loss") => void;
  clearHistory: () => void;
  totalTokens: () => { input: number; output: number };
}

function normalizeEntry(raw: unknown): UsageEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const ts = Number(e.timestamp);
  const input = Number(e.inputTokens);
  const output = Number(e.outputTokens);
  if (!Number.isFinite(ts) || !Number.isFinite(input) || !Number.isFinite(output)) return null;
  const provider = typeof e.provider === "string" ? e.provider : "";
  const model = typeof e.model === "string" ? e.model : "";
  const context = typeof e.context === "string" ? e.context : "unknown";
  const gr = e.gameResult === "win" || e.gameResult === "loss" ? e.gameResult : undefined;
  const matchId = typeof e.matchId === "string" ? e.matchId : undefined;
  return {
    timestamp: ts,
    provider,
    model,
    inputTokens: input,
    outputTokens: output,
    context,
    matchId,
    gameResult: gr,
  };
}

function loadEntries(): UsageEntry[] {
  try {
    const raw = localStorage.getItem("aw_usage_history");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((x): x is UsageEntry => x !== null);
  } catch {
    return [];
  }
}

function saveEntries(entries: UsageEntry[]) {
  const trimmed = entries.slice(-2000);
  localStorage.setItem("aw_usage_history", JSON.stringify(trimmed));
}

export const useUsageStore = create<UsageState>((set, get) => ({
  entries: loadEntries(),

  record: (provider, model, inputTokens, outputTokens, context, matchId) => {
    const entry: UsageEntry = {
      timestamp: Date.now(),
      provider,
      model,
      inputTokens,
      outputTokens,
      context,
      matchId,
    };
    const updated = [...get().entries, entry];
    saveEntries(updated);
    set({ entries: updated });
  },

  recordGameResult: (matchId, result) => {
    const updated = get().entries.map((e) =>
      e.matchId === matchId ? { ...e, gameResult: result } : e
    );
    saveEntries(updated);
    set({ entries: updated });
  },

  clearHistory: () => {
    localStorage.removeItem("aw_usage_history");
    set({ entries: [] });
  },

  totalTokens: () =>
    get().entries.reduce(
      (acc, e) => ({ input: acc.input + e.inputTokens, output: acc.output + e.outputTokens }),
      { input: 0, output: 0 }
    ),
}));
