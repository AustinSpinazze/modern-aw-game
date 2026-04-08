/**
 * **Token usage history** for analytics (Zustand + localStorage): per-call provider, model, tokens,
 * context (`game_turn`, `map_gen`, …). Settings UI reads this; no dollar estimates.
 */

import { create } from "zustand";

import type { LlmHarnessMode } from "./configStore";

export interface UsageEntry {
  timestamp: number;
  provider: string;
  model: string;
  playerId?: number;
  inputTokens: number;
  outputTokens: number;
  context: string; // "game_turn" | "map_gen" | "unknown"
  matchId?: string;
  gameResult?: "win" | "loss";
  harnessMode?: LlmHarnessMode;
  failureCategory?: "provider" | "parse" | "quality" | "simulation" | "playback" | "unknown";
  failureMessage?: string;
  failureAttempts?: number;
  tacticalMetrics?: UsageTacticalMetrics;
  policyViolations?: string[];
}

export interface UsageRecordMeta {
  harnessMode?: LlmHarnessMode;
  playerId?: number;
}

export interface UsageTacticalMetrics {
  bundleRouteEmergency?: boolean;
  bundleRouteCapture?: boolean;
  bundleRouteCombat?: boolean;
  bundleRouteDevelopment?: boolean;
  bundleSelectedScore?: number;
  bundleTopScore?: number;
  bundleScoreGap?: number;
  bundleSkippedBetterOptions?: number;
  startedCaptureCommitments?: number;
  completedStartedCaptures?: number;
  missedEasyCaptures?: number;
  missedPostMoveAttacks?: number;
  badTradeAttacks?: number;
  purposelessTransportActions?: number;
  purposelessMoves?: number;
  untouchedActionableUnits?: number;
  ignoredFacilityEmergencies?: number;
  deadProductionBuilds?: number;
  movedOffCriticalBlockers?: number;
  missedFactoryBuilds?: number;
  unjustifiedBlockedProductionTiles?: number;
  speculativeTransportBuilds?: number;
  speculativeNavalBuilds?: number;
  unsupportedAdvanceWarnings?: number;
  missedInfantryWallBuilds?: number;
  passiveCapturerWarnings?: number;
  brokenWallWarnings?: number;
  ignoredRepairRetreats?: number;
  ignoredHighValueMerges?: number;
  idleAirDefenseUnits?: number;
  ignoredCaptureDenials?: number;
  ignoredOverextensionPunishes?: number;
  correctCounterBuy?: boolean;
  freeHitConversions?: number;
  terrainDisciplineWarnings?: number;
  threatenedUnitPreservationWarnings?: number;
  frontWeaknesses?: number;
  averageUnspentFundsWhenProductionExists?: number;
  strategyLabel?: string;
  directiveCount?: number;
  directivesFulfilled?: number;
  planCoherenceScore?: number;
  autonomousBundlesExecuted?: number;
  planParseRetries?: number;
}

interface UsageState {
  entries: UsageEntry[];
  record: (
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    context: string,
    matchId?: string,
    meta?: UsageRecordMeta
  ) => void;
  /** Stamp a win/loss result onto all entries for the given matchId. */
  recordGameResult: (matchId: string, result: "win" | "loss") => void;
  recordGameTurnFailure: (details: {
    provider: string;
    model: string;
    matchId: string;
    playerId: number;
    harnessMode?: LlmHarnessMode;
    category: UsageEntry["failureCategory"];
    message: string;
    attempts: number;
  }) => void;
  annotateLatestGameTurn: (
    matchId: string,
    model: string,
    playerId: number,
    details: { tacticalMetrics?: UsageTacticalMetrics; policyViolations?: string[] }
  ) => void;
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
  const playerId = Number.isFinite(Number(e.playerId)) ? Number(e.playerId) : undefined;
  const context = typeof e.context === "string" ? e.context : "unknown";
  const gr = e.gameResult === "win" || e.gameResult === "loss" ? e.gameResult : undefined;
  const matchId = typeof e.matchId === "string" ? e.matchId : undefined;
  const harnessMode =
    e.harnessMode === "llm_only" || e.harnessMode === "llm_scaffolded" || e.harnessMode === "hybrid"
      ? e.harnessMode
      : undefined;
  const tacticalMetrics =
    e.tacticalMetrics && typeof e.tacticalMetrics === "object"
      ? (e.tacticalMetrics as UsageTacticalMetrics)
      : undefined;
  const policyViolations = Array.isArray(e.policyViolations)
    ? e.policyViolations.filter((v): v is string => typeof v === "string")
    : undefined;
  const failureCategory =
    e.failureCategory === "provider" ||
    e.failureCategory === "parse" ||
    e.failureCategory === "quality" ||
    e.failureCategory === "simulation" ||
    e.failureCategory === "playback" ||
    e.failureCategory === "unknown"
      ? e.failureCategory
      : undefined;
  const failureMessage = typeof e.failureMessage === "string" ? e.failureMessage : undefined;
  const failureAttempts = Number.isFinite(Number(e.failureAttempts))
    ? Number(e.failureAttempts)
    : undefined;
  return {
    timestamp: ts,
    provider,
    model,
    playerId,
    inputTokens: input,
    outputTokens: output,
    context,
    matchId,
    gameResult: gr,
    harnessMode,
    failureCategory,
    failureMessage,
    failureAttempts,
    tacticalMetrics,
    policyViolations,
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

  record: (provider, model, inputTokens, outputTokens, context, matchId, meta) => {
    const normalized =
      typeof matchId === "string" && matchId.trim().length > 0 ? matchId.trim() : undefined;
    const entry: UsageEntry = {
      timestamp: Date.now(),
      provider,
      model,
      playerId: meta?.playerId,
      inputTokens,
      outputTokens,
      context,
      matchId: normalized,
      harnessMode: meta?.harnessMode,
    };
    const updated = [...get().entries, entry];
    saveEntries(updated);
    set({ entries: updated });
  },

  recordGameResult: (matchId, result) => {
    const key = matchId.trim();
    const updated = get().entries.map((e) =>
      e.matchId?.trim() === key ? { ...e, gameResult: result } : e
    );
    saveEntries(updated);
    set({ entries: updated });
  },

  recordGameTurnFailure: ({
    provider,
    model,
    matchId,
    playerId,
    harnessMode,
    category,
    message,
    attempts,
  }) => {
    const entry: UsageEntry = {
      timestamp: Date.now(),
      provider,
      model,
      playerId,
      inputTokens: 0,
      outputTokens: 0,
      context: "game_turn_failure",
      matchId: matchId.trim(),
      harnessMode,
      failureCategory: category ?? "unknown",
      failureMessage: message,
      failureAttempts: attempts,
    };
    const updated = [...get().entries, entry];
    saveEntries(updated);
    set({ entries: updated });
  },

  annotateLatestGameTurn: (matchId, model, playerId, details) => {
    const key = matchId.trim();
    const updated = [...get().entries];
    for (let i = updated.length - 1; i >= 0; i--) {
      const entry = updated[i];
      if (
        entry.context === "game_turn" &&
        entry.matchId?.trim() === key &&
        entry.model === model &&
        entry.playerId === playerId
      ) {
        updated[i] = {
          ...entry,
          tacticalMetrics: details.tacticalMetrics ?? entry.tacticalMetrics,
          policyViolations: details.policyViolations ?? entry.policyViolations,
        };
        saveEntries(updated);
        set({ entries: updated });
        return;
      }
    }
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
