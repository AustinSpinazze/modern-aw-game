import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useUsageStore } from "../../store/usageStore";
import { formatTokens } from "../../lib/format";
import {
  type DateRange,
  detectGameSessions,
  filterEntriesByModel,
  filterEntriesByDateRange,
} from "../../lib/usageAnalytics";
import { AnalyticsChartCard } from "./AnalyticsChartCard";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState";

/**
 * Per-game analytics tab: groups API calls into sessions by match_id,
 * bar chart of tokens per game, and a summary table with models, result, and turn count.
 */
export function PerGameAnalyticsTab({
  modelFilter,
  dateRange,
}: {
  modelFilter: string;
  dateRange: DateRange;
}) {
  const entries = useUsageStore((s) => s.entries);
  const filtered = useMemo(
    () => filterEntriesByDateRange(filterEntriesByModel(entries, modelFilter), dateRange),
    [entries, modelFilter, dateRange]
  );
  const sessions = useMemo(() => detectGameSessions(filtered), [filtered]);

  if (entries.length === 0) {
    return (
      <AnalyticsEmptyState
        message="No game data yet"
        detail="Complete a game with an AI opponent to see per-game stats"
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <AnalyticsEmptyState
        message="No data for this model"
        detail="Pick another model or choose “All models”"
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <AnalyticsEmptyState
        message="No game sessions for this filter"
        detail="This model may only appear in non–game-turn usage"
      />
    );
  }

  const chartData = sessions.map((s) => ({
    name: `Game #${s.id}`,
    tokens: s.totalTokens,
    badTrades: Number(s.tacticalSummary.avgBadTradeAttacks.toFixed(2)),
    missedCaptures: Number(s.tacticalSummary.avgMissedEasyCaptures.toFixed(2)),
    missedBuilds: Number(s.tacticalSummary.avgMissedFactoryBuilds.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
        Each bar is one match session, grouped by the game&apos;s match ID. Resuming a save keeps
        that ID; saves that never had one get a stable match_save_* ID when loaded so token totals
        stay in one session.
      </p>
      <AnalyticsChartCard title="Token Usage Per Game" subtitle={`Last ${sessions.length} games`}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={
                ((value: unknown) => formatTokens(Number(value ?? 0))) as (v: unknown) => string
              }
            />
            <Bar dataKey="tokens" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>

      <AnalyticsChartCard
        title="Tactical Quality Per Game"
        subtitle="Lower bad trades / missed captures / missed builds is better"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="badTrades"
              fill="#ef4444"
              name="Avg bad trades / turn"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="missedCaptures"
              fill="#f59e0b"
              name="Avg missed easy captures / turn"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="missedBuilds"
              fill="#3b82f6"
              name="Avg missed factory builds / turn"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>

      <AnalyticsChartCard title="Game Summary">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Game
                </th>
                <th className="text-center font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Result
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  API Calls
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Tokens
                </th>
                <th className="text-left font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Harness
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Bad Trades
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Missed Captures
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Transport Waste
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Missed Builds
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Counter-Buy
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Failures
                </th>
                <th className="text-left font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Models
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">Game #{session.id}</td>
                  <td className="px-4 py-3 text-center">
                    {session.gameResult === "win" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        AI Won
                      </span>
                    ) : session.gameResult === "loss" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        You Won
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                        In Progress
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.entries.length}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {formatTokens(session.totalTokens)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {session.harnessModes.length > 0 ? session.harnessModes.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.turnCount > 0
                      ? session.tacticalSummary.avgBadTradeAttacks.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.turnCount > 0
                      ? session.tacticalSummary.avgMissedEasyCaptures.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.turnCount > 0
                      ? session.tacticalSummary.avgPurposelessTransportActions.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.turnCount > 0
                      ? session.tacticalSummary.avgMissedFactoryBuilds.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.turnCount > 0
                      ? `${Math.round(session.tacticalSummary.counterBuyRate * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {session.tacticalSummary.failureCount > 0
                      ? session.tacticalSummary.failureCount
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{session.models.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalyticsChartCard>

      <AnalyticsChartCard title="Per-Game Tactical Detail">
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={`detail-${session.id}`}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Game #{session.id}</h3>
                  <p className="text-xs text-gray-500">
                    {session.models.join(", ")}
                    {session.harnessModes.length > 0 ? ` • ${session.harnessModes.join(", ")}` : ""}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  {session.tacticalSummary.turnCount > 0
                    ? `${session.tacticalSummary.turnCount} instrumented turns`
                    : "No tactical turn details"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Bad Trades
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgBadTradeAttacks.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg per turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Missed Captures
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgMissedEasyCaptures.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg per turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Transport Waste
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgPurposelessTransportActions.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg per turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Missed Builds
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgMissedFactoryBuilds.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg per turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Self-Blocked Prod.
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgBlockedProductionTiles.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg blocked tiles / turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Counter-Buy
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {Math.round(session.tacticalSummary.counterBuyRate * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">correct response rate</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Free Hits</div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.avgFreeHitConversions.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">avg per turn</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">
                    Unspent Funds
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {Math.round(session.tacticalSummary.avgUnspentFunds)}
                  </div>
                  <div className="text-xs text-gray-500">avg after buys</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Failures</div>
                  <div className="text-lg font-bold text-gray-900">
                    {session.tacticalSummary.failureCount}
                  </div>
                  <div className="text-xs text-gray-500">
                    {session.tacticalSummary.failureCategories.length > 0
                      ? session.tacticalSummary.failureCategories.join(", ")
                      : "none"}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Per-Participant Comparison
                </div>
                {session.participants.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr className="text-gray-500 uppercase tracking-wide">
                          <th className="px-3 py-2 text-left">Player</th>
                          <th className="px-3 py-2 text-left">Model</th>
                          <th className="px-3 py-2 text-left">Harness</th>
                          <th className="px-3 py-2 text-right">Turns</th>
                          <th className="px-3 py-2 text-right">Tokens</th>
                          <th className="px-3 py-2 text-right">Bad Trades</th>
                          <th className="px-3 py-2 text-right">Missed Captures</th>
                          <th className="px-3 py-2 text-right">Missed Builds</th>
                          <th className="px-3 py-2 text-right">Blocked Prod.</th>
                          <th className="px-3 py-2 text-right">Counter-Buy</th>
                          <th className="px-3 py-2 text-right">Failures</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.participants.map((participant) => (
                          <tr
                            key={`${session.id}-${participant.playerId ?? "unknown"}-${participant.model}`}
                            className="border-t border-gray-100"
                          >
                            <td className="px-3 py-2 font-semibold text-gray-800">
                              {participant.playerId !== undefined
                                ? `P${participant.playerId + 1}`
                                : "Unknown"}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{participant.model}</td>
                            <td className="px-3 py-2 text-gray-500">
                              {participant.harnessModes.length > 0
                                ? participant.harnessModes.join(", ")
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.turnCount}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {formatTokens(participant.totalTokens)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.tacticalSummary.avgBadTradeAttacks.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.tacticalSummary.avgMissedEasyCaptures.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.tacticalSummary.avgMissedFactoryBuilds.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.tacticalSummary.avgBlockedProductionTiles.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {Math.round(participant.tacticalSummary.counterBuyRate * 100)}%
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-600">
                              {participant.tacticalSummary.failureCount > 0
                                ? participant.tacticalSummary.failureCount
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    No per-participant turn metrics were recorded for this game yet.
                  </p>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Policy Violations Seen
                </div>
                {session.tacticalSummary.policyViolations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {session.tacticalSummary.policyViolations.map((violation) => (
                      <span
                        key={violation}
                        className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700 border border-red-100"
                      >
                        {violation}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    No policy violations were logged for this game.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </AnalyticsChartCard>
    </div>
  );
}
