/**
 * Pure helpers for usage **analytics** UI: date ranges, session detection from {@link UsageEntry},
 * CSV export — no React; consumed by settings analytics tabs.
 */

import type { UsageEntry } from "../store/usage-store";

// ── Types ────────────────────────────────────────────────────────────────────

/** Preset time range for filtering usage data. */
export type DateRange = "all" | "12m" | "6m" | "3m" | "30d";

/** A contiguous group of game-turn API calls forming one play session. */
export interface GameSession {
  /** Sequential session number (1-based). */
  id: number;
  /** The usage entries belonging to this session. */
  entries: UsageEntry[];
  /** Sum of input + output tokens across all entries. */
  totalTokens: number;
  /** Distinct model identifiers used in this session. */
  models: string[];
}

// ── Date range options ───────────────────────────────────────────────────────

/** UI options for the date-range selector. */
export const DATE_RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "12m", label: "Past year" },
  { id: "6m", label: "6 months" },
  { id: "3m", label: "3 months" },
  { id: "30d", label: "30 days" },
];

// ── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the Unix-ms cutoff timestamp for a given date range.
 * For `"all"`, returns `0` (i.e. no cutoff).
 *
 * @param range - Selected date range.
 * @returns Cutoff timestamp in milliseconds.
 */
export function getDateRangeCutoff(range: DateRange): number {
  if (range === "all") return 0;
  const now = Date.now();
  const ms: Record<Exclude<DateRange, "all">, number> = {
    "12m": 365 * 24 * 60 * 60 * 1000,
    "6m": 182 * 24 * 60 * 60 * 1000,
    "3m": 91 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return now - ms[range];
}

// ── Filtering ────────────────────────────────────────────────────────────────

/**
 * Filters entries to only those matching a specific model.
 * Returns all entries when `modelFilter` is `"all"`.
 *
 * @param entries - Full list of usage entries.
 * @param modelFilter - Model id to keep, or `"all"`.
 * @returns Filtered entries.
 */
export function filterEntriesByModel(entries: UsageEntry[], modelFilter: string): UsageEntry[] {
  if (modelFilter === "all") return entries;
  return entries.filter((e) => e.model === modelFilter);
}

/**
 * Filters entries to only those within a given date range.
 * Returns all entries when `range` is `"all"`.
 *
 * @param entries - Full list of usage entries.
 * @param range - Selected date range.
 * @returns Filtered entries.
 */
export function filterEntriesByDateRange(entries: UsageEntry[], range: DateRange): UsageEntry[] {
  if (range === "all") return entries;
  const cutoff = getDateRangeCutoff(range);
  return entries.filter((e) => e.timestamp >= cutoff);
}

// ── Game session detection ───────────────────────────────────────────────────

/**
 * Builds a `GameSession` object from a group of entries.
 *
 * @param id - Session number.
 * @param entries - Entries belonging to this session.
 * @returns Populated session object.
 */
export function buildSession(id: number, entries: UsageEntry[]): GameSession {
  return {
    id,
    entries,
    totalTokens: entries.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0),
    models: [...new Set(entries.map((e) => e.model))],
  };
}

/**
 * Groups game-turn entries into logical play sessions.
 *
 * Sessions are identified primarily by `matchId` when available. Entries
 * without a `matchId` fall back to a 10-minute idle gap heuristic.
 *
 * @param entries - Usage entries (any context — only `"game_turn"` entries are used).
 * @returns Array of detected game sessions, sorted chronologically with 1-based IDs.
 */
export function detectGameSessions(entries: UsageEntry[]): GameSession[] {
  const gameTurns = entries
    .filter((e) => e.context === "game_turn")
    .sort((a, b) => a.timestamp - b.timestamp);

  if (gameTurns.length === 0) return [];

  // Group by matchId when available
  const byMatchId = new Map<string, UsageEntry[]>();
  const noMatchId: UsageEntry[] = [];

  for (const e of gameTurns) {
    if (e.matchId) {
      const list = byMatchId.get(e.matchId);
      if (list) list.push(e);
      else byMatchId.set(e.matchId, [e]);
    } else {
      noMatchId.push(e);
    }
  }

  const sessions: GameSession[] = [];

  // Sessions from matchId grouping
  for (const group of byMatchId.values()) {
    sessions.push(buildSession(sessions.length + 1, group));
  }

  // Legacy entries without matchId — fall back to 10-min gap heuristic
  if (noMatchId.length > 0) {
    let current: UsageEntry[] = [noMatchId[0]];
    for (let i = 1; i < noMatchId.length; i++) {
      if (noMatchId[i].timestamp - noMatchId[i - 1].timestamp > 10 * 60 * 1000) {
        sessions.push(buildSession(sessions.length + 1, current));
        current = [];
      }
      current.push(noMatchId[i]);
    }
    if (current.length > 0) {
      sessions.push(buildSession(sessions.length + 1, current));
    }
  }

  // Sort by earliest entry timestamp
  sessions.sort((a, b) => a.entries[0].timestamp - b.entries[0].timestamp);
  // Re-number
  sessions.forEach((s, i) => (s.id = i + 1));

  return sessions;
}

// ── Monthly data helpers ─────────────────────────────────────────────────────

/**
 * Converts a Unix-ms timestamp to a `YYYY-MM` month key.
 *
 * @param ts - Timestamp in milliseconds.
 * @returns Month key string.
 */
function getMonthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generates all `YYYY-MM` keys from `startKey` to `endKey` inclusive.
 *
 * @param startKey - First month key (e.g. `"2025-01"`).
 * @param endKey - Last month key (e.g. `"2026-03"`).
 * @returns Ordered array of month key strings.
 */
export function generateMonthKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

/**
 * Fills in zero-value months so charts show the full date range without gaps.
 *
 * @param byMonth - Map of month key to token count.
 * @param dateRange - Active date range filter.
 * @returns Array of `{ month, tokens }` covering every month in the range.
 */
export function fillMonthlyGaps(
  byMonth: Record<string, number>,
  dateRange: DateRange
): Array<{ month: string; tokens: number }> {
  const dataKeys = Object.keys(byMonth).sort();
  if (dataKeys.length === 0) return [];

  const now = new Date();
  const endKey = getMonthKey(now.getTime());

  let startKey: string;
  if (dateRange === "all") {
    startKey = dataKeys[0];
  } else {
    const cutoff = getDateRangeCutoff(dateRange);
    startKey = getMonthKey(cutoff);
  }

  return generateMonthKeys(startKey, endKey).map((key) => ({
    month: key,
    tokens: byMonth[key] ?? 0,
  }));
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of all usage entries as a JSON file.
 *
 * @param entries - The entries to export.
 */
export function exportUsageData(entries: UsageEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `modern-aw-usage-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
