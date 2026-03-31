import { useState, useMemo } from "react";
import { useUsageStore } from "../../store/usageStore";
import { PROVIDER_TW } from "../../lib/aiModels";
import { formatTokens } from "../../lib/format";
import { exportUsageData } from "../../lib/usageAnalytics";
import {
  getMonthLabel,
  ModalSummaryCard,
  ModalSectionHeader,
  ModalInsightCard,
} from "./AgentConfigurationModalWidgets";

/**
 * Compact usage analytics for {@link ./AgentConfigurationAndAnalyticsModal} (not the full-page dashboard).
 */
export function UsageAnalyticsModalDashboard() {
  const entries = useUsageStore((s) => s.entries);
  const clearHistory = useUsageStore((s) => s.clearHistory);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const stats = useMemo(() => {
    const totalInput = entries.reduce((sum, e) => sum + e.inputTokens, 0);
    const totalOutput = entries.reduce((sum, e) => sum + e.outputTokens, 0);
    const totalCalls = entries.length;

    const byModel: Record<
      string,
      {
        provider: string;
        calls: number;
        input: number;
        output: number;
        gameTurns: number;
      }
    > = {};
    for (const e of entries) {
      if (!byModel[e.model])
        byModel[e.model] = {
          provider: e.provider,
          calls: 0,
          input: 0,
          output: 0,
          gameTurns: 0,
        };
      byModel[e.model].calls++;
      byModel[e.model].input += e.inputTokens;
      byModel[e.model].output += e.outputTokens;
      if (e.context === "game_turn") byModel[e.model].gameTurns++;
    }

    const byContext: Record<string, { calls: number; tokens: number }> = {};
    for (const e of entries) {
      const ctx =
        e.context === "game_turn" ? "Game Turns" : e.context === "map_gen" ? "Map Gen" : "Other";
      if (!byContext[ctx]) byContext[ctx] = { calls: 0, tokens: 0 };
      byContext[ctx].calls++;
      byContext[ctx].tokens += e.inputTokens + e.outputTokens;
    }

    const byMonth: Record<string, { tokens: number; calls: number }> = {};
    for (const e of entries) {
      const key = getMonthLabel(e.timestamp);
      if (!byMonth[key]) byMonth[key] = { tokens: 0, calls: 0 };
      byMonth[key].tokens += e.inputTokens + e.outputTokens;
      byMonth[key].calls++;
    }

    const gameTurnEntries = entries.filter((e) => e.context === "game_turn");
    const avgTokensPerTurn =
      gameTurnEntries.length > 0
        ? Math.round(
            gameTurnEntries.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0) /
              gameTurnEntries.length
          )
        : 0;

    let sessions = 0;
    let lastTs = 0;
    for (const e of gameTurnEntries.sort((a, b) => a.timestamp - b.timestamp)) {
      if (e.timestamp - lastTs > 10 * 60 * 1000) sessions++;
      lastTs = e.timestamp;
    }

    return {
      totalInput,
      totalOutput,
      totalCalls,
      byModel,
      byContext,
      byMonth,
      avgTokensPerTurn,
      sessions,
      inputOutputRatio: totalInput > 0 ? totalOutput / totalInput : 0,
    };
  }, [entries]);

  if (stats.totalCalls === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <div className="text-4xl mb-3 opacity-50">~</div>
        <p className="text-sm font-medium">No usage data yet</p>
        <p className="text-xs text-gray-500 mt-1">
          Play a game with an AI opponent to start tracking
        </p>
      </div>
    );
  }

  const monthEntries = Object.entries(stats.byMonth);
  const maxMonthTokens = Math.max(...monthEntries.map(([, d]) => d.tokens), 1);

  return (
    <div className="space-y-5">
      <div className="border border-amber-200 bg-amber-50/60 rounded-lg px-3.5 py-3">
        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
          Why tokens, not dollars?
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Prices vary by provider and change over time. To estimate cost, note your input &amp;
          output tokens below, then enter them at{" "}
          <a
            href="https://pricepertoken.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2"
          >
            Price Per Token
          </a>{" "}
          or check{" "}
          <a
            href="https://www.anthropic.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
          >
            Anthropic
          </a>
          ,{" "}
          <a
            href="https://openai.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
          >
            OpenAI
          </a>
          ,{" "}
          <a
            href="https://ai.google.dev/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
          >
            Google
          </a>
          .
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <ModalSummaryCard
          label="Tokens"
          value={formatTokens(stats.totalInput + stats.totalOutput)}
          detail={`${formatTokens(stats.totalInput)} in / ${formatTokens(stats.totalOutput)} out`}
        />
        <ModalSummaryCard label="API Calls" value={String(stats.totalCalls)} />
        <ModalSummaryCard label="Sessions" value={String(stats.sessions)} />
        <ModalSummaryCard label="Avg tokens / turn" value={formatTokens(stats.avgTokensPerTurn)} />
      </div>

      <div>
        <ModalSectionHeader title="By Activity" />
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stats.byContext).map(([ctx, data]) => (
            <div key={ctx} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="text-xs text-gray-500 mb-1">{ctx}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {formatTokens(data.tokens)}
                </span>
                <span className="text-xs text-gray-400">{data.calls} calls</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {monthEntries.length > 0 && (
        <div>
          <ModalSectionHeader title="Monthly Usage" />
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
            {monthEntries.map(([month, data]) => (
              <div key={month} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 shrink-0">{month}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.max(4, (data.tokens / maxMonthTokens) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 w-20 text-right font-mono">
                  {formatTokens(data.tokens)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <ModalSectionHeader title="Model Comparison" />
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-500 px-3 py-2">Model</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Calls</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Tokens</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Avg/Call</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.byModel)
                .sort(([, a], [, b]) => b.input + b.output - (a.input + a.output))
                .map(([model, data]) => (
                  <tr
                    key={model}
                    className="border-t border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${PROVIDER_TW[data.provider] ?? "bg-gray-500"}`}
                        />
                        <span className="text-gray-800 font-medium truncate max-w-[130px]">
                          {model}
                        </span>
                      </div>
                    </td>
                    <td className="text-right text-gray-600 px-3 py-2">{data.calls}</td>
                    <td className="text-right text-gray-600 px-3 py-2">
                      {formatTokens(data.input + data.output)}
                    </td>
                    <td className="text-right text-gray-600 px-3 py-2">
                      {formatTokens(Math.round((data.input + data.output) / data.calls))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <ModalSectionHeader title="Insights" />
        <div className="grid grid-cols-2 gap-2">
          <ModalInsightCard
            label="Avg tokens / turn"
            value={formatTokens(stats.avgTokensPerTurn)}
            detail="Across game-turn API calls"
          />
          <ModalInsightCard
            label="Input / Output ratio"
            value={`${stats.inputOutputRatio.toFixed(1)}x`}
            detail={`${formatTokens(stats.totalInput)} in / ${formatTokens(stats.totalOutput)} out`}
          />
        </div>
      </div>

      <div className="pt-1 flex gap-3">
        <button
          onClick={() => exportUsageData(entries)}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Export JSON
        </button>
        {showClearConfirm ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-red-500 font-medium">Delete all data?</span>
            <button
              onClick={() => {
                clearHistory();
                setShowClearConfirm(false);
              }}
              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors font-semibold"
            >
              Yes
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear usage history
          </button>
        )}
      </div>
    </div>
  );
}
