/**
 * Ring buffer of recent LLM match I/O for debugging (analyze prompts vs behavior).
 * In dev, exposed as `window.__LLM_DEBUG_LOGS__` (getLogs, clear, exportJson).
 */

import type { LlmHarnessMode } from "../store/configStore";
import type { TacticalAnalysis } from "./tacticalAnalysis";
import type { TurnPlan, ExecutionReport } from "./llmTurnPlan";

export interface LlmBundleDecisionLog {
  route: string;
  selectedBundleId?: string;
  selectedBundleLabel?: string;
  selectedBundleScore?: number;
  selectedBundleTags?: string[];
  topAvailableBundles?: Array<{
    id: string;
    label: string;
    score: number;
    tags: string[];
  }>;
  skippedHigherScoreBundles?: Array<{
    id: string;
    label: string;
    score: number;
    tags: string[];
    scoreDelta: number;
  }>;
}

export interface LlmDebugLogEntry {
  at: string;
  matchId: string;
  playerId: number;
  turnNumber: number;
  provider: string;
  model: string;
  mode?: LlmHarnessMode;
  /** Full user message sent to the model (state + memory); may be truncated for storage */
  userMessage: string;
  userMessageTruncated: boolean;
  assistantRaw: string;
  validCommandsJson: string;
  skippedCount: number;
  errorSample: string;
  tacticalAnalysis?: TacticalAnalysis;
  metrics?: Record<string, number | boolean>;
  policyViolations?: string[];
  bundleDecision?: LlmBundleDecisionLog;
  turnPlan?: TurnPlan;
  executionReport?: ExecutionReport;
  planMetrics?: {
    directiveCount: number;
    directivesFulfilled: number;
    directivesUnfulfilled: number;
    unplannedActionCount: number;
    planCoherenceScore: number;
    llmCallCount: number;
  };
}

const MAX_ENTRIES = 12;
const MAX_USER_CHARS = 120_000;

const buffer: LlmDebugLogEntry[] = [];

export function appendLlmDebugLog(
  entry: Omit<LlmDebugLogEntry, "at" | "userMessageTruncated"> & { at?: string }
): void {
  const origLen = entry.userMessage.length;
  let userMessage = entry.userMessage;
  let userMessageTruncated = false;
  if (userMessage.length > MAX_USER_CHARS) {
    userMessage =
      userMessage.slice(0, MAX_USER_CHARS) +
      `\n\n...[truncated ${origLen - MAX_USER_CHARS} chars for log size]`;
    userMessageTruncated = true;
  }
  const full: LlmDebugLogEntry = {
    at: entry.at ?? new Date().toISOString(),
    matchId: entry.matchId,
    playerId: entry.playerId,
    turnNumber: entry.turnNumber,
    provider: entry.provider,
    model: entry.model,
    userMessage,
    userMessageTruncated,
    assistantRaw: entry.assistantRaw,
    validCommandsJson: entry.validCommandsJson,
    skippedCount: entry.skippedCount,
    errorSample: entry.errorSample,
    tacticalAnalysis: entry.tacticalAnalysis,
    metrics: entry.metrics,
    policyViolations: entry.policyViolations,
    bundleDecision: entry.bundleDecision,
    turnPlan: entry.turnPlan,
    executionReport: entry.executionReport,
    planMetrics: entry.planMetrics,
  };

  buffer.push(full);
  while (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }

  persistLlmLogToDisk(full);

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    exposeDevGlobal();
  }
}

let loggedDiskPathOnce = false;

/** Electron: append same entry to `userData/logs/llm-{matchId}.ndjson` (NDJSON, one object per line). */
function persistLlmLogToDisk(full: LlmDebugLogEntry): void {
  if (typeof window === "undefined") return;
  const api = window.electronAPI;
  if (!api?.appendLlmDebugLog) return;
  void (async () => {
    try {
      const ok = await api.appendLlmDebugLog(full);
      if (ok && !loggedDiskPathOnce && api.getLlmDebugLogsDir) {
        loggedDiskPathOnce = true;
        const dir = await api.getLlmDebugLogsDir();
        const safe =
          String(full.matchId)
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 96) || "unknown";
        console.info(`[LLM AI] NDJSON logs (append): ${dir}/llm-${safe}.ndjson`);
      }
    } catch {
      // ignore disk errors
    }
  })();
}

export function getLlmDebugLogs(): readonly LlmDebugLogEntry[] {
  return buffer;
}

export function clearLlmDebugLogs(): void {
  buffer.length = 0;
}

export function exportLlmDebugLogsJson(): string {
  return JSON.stringify(buffer, null, 2);
}

function exposeDevGlobal(): void {
  const w = window as unknown as {
    __LLM_DEBUG_LOGS__?: {
      getLogs: () => readonly LlmDebugLogEntry[];
      clear: () => void;
      exportJson: () => string;
    };
  };
  w.__LLM_DEBUG_LOGS__ = {
    getLogs: getLlmDebugLogs,
    clear: clearLlmDebugLogs,
    exportJson: exportLlmDebugLogsJson,
  };
}
