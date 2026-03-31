import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useUsageStore } from "../../store/usageStore";
import { formatTokens, getMonthKey } from "../../lib/format";
import {
  type DateRange,
  detectGameSessions,
  filterEntriesByModel,
  filterEntriesByDateRange,
} from "../../lib/usageAnalytics";
import { AnalyticsChartCard } from "./AnalyticsChartCard";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState";

/**
 * Model performance analytics tab: win/loss by model, per-model token usage,
 * and cumulative tokens over time.
 */
export function ModelPerformanceAnalyticsTab({
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

  const stats = useMemo(() => {
    const sessions = detectGameSessions(filtered);

    const byModel: Record<
      string,
      { games: Set<number>; tokens: number; wins: number; losses: number }
    > = {};

    for (const session of sessions) {
      for (const entry of session.entries) {
        if (!byModel[entry.model]) {
          byModel[entry.model] = { games: new Set(), tokens: 0, wins: 0, losses: 0 };
        }
        byModel[entry.model].games.add(session.id);
        byModel[entry.model].tokens += entry.inputTokens + entry.outputTokens;
        if (entry.gameResult === "win") byModel[entry.model].wins++;
        if (entry.gameResult === "loss") byModel[entry.model].losses++;
      }
    }

    const modelStats = Object.entries(byModel).map(([model, data]) => {
      const gameCount = data.games.size;
      return {
        model,
        games: gameCount,
        avgTokens: gameCount > 0 ? Math.round(data.tokens / gameCount) : 0,
        totalTokens: data.tokens,
        wins: data.wins,
        losses: data.losses,
      };
    });

    const hasWinLossData = modelStats.some((m) => m.wins > 0 || m.losses > 0);

    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
    const byMonth: Record<string, number> = {};
    let cumulative = 0;
    for (const e of sorted) {
      const key = getMonthKey(e.timestamp);
      cumulative += e.inputTokens + e.outputTokens;
      byMonth[key] = cumulative;
    }
    const tokensOverTime = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cumulativeTokens]) => ({ month, cumulativeTokens }));

    return { modelStats, hasWinLossData, tokensOverTime };
  }, [filtered]);

  if (entries.length === 0) {
    return (
      <AnalyticsEmptyState
        message="No performance data yet"
        detail="Play games with AI to track model performance"
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AnalyticsChartCard title="Win Rate by Model" subtitle="AI Opponent Effectiveness">
          {stats.hasWinLossData ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={stats.modelStats}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  type="category"
                  dataKey="model"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="wins" fill="#22c55e" name="Wins" stackId="results" />
                <Bar dataKey="losses" fill="#ef4444" name="Losses" stackId="results" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              No win/loss data recorded yet
            </div>
          )}
        </AnalyticsChartCard>

        <AnalyticsChartCard title="Usage by Model" subtitle="Tokens per game session">
          <div className="space-y-3 py-2 max-h-[300px] overflow-y-auto">
            {stats.modelStats
              .sort((a, b) => b.totalTokens - a.totalTokens)
              .map((m) => (
                <div
                  key={m.model}
                  className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-800 truncate max-w-[200px]">
                      {m.model}
                    </span>
                    <span className="text-sm font-bold text-gray-800 font-mono">
                      {formatTokens(m.totalTokens)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Games</div>
                      <div className="text-base font-bold text-gray-800">{m.games}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">
                        Avg tokens / game
                      </div>
                      <div className="text-base font-bold text-gray-800">
                        {formatTokens(m.avgTokens)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </AnalyticsChartCard>
      </div>

      {stats.tokensOverTime.length > 1 && (
        <AnalyticsChartCard title="Cumulative Tokens Over Time">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={stats.tokensOverTime}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => formatTokens(Number(v))}
              />
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
              <Line
                type="monotone"
                dataKey="cumulativeTokens"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                name="Cumulative tokens"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
      )}
    </div>
  );
}
