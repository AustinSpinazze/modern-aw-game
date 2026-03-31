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
 * Per-game analytics tab: groups API calls into sessions (10-minute idle gaps),
 * bar chart of tokens per game, and a summary table with models used.
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
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
        Each bar is one game session: we group{" "}
        <span className="font-medium text-gray-800">game-turn</span> API calls, and start a new
        session after about 10 minutes idle.
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

      <AnalyticsChartCard title="Game Summary">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Game
                </th>
                <th className="text-right font-bold text-gray-500 uppercase tracking-wider text-xs px-4 py-3">
                  Tokens
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
                  <td className="px-4 py-3 text-right text-gray-600 font-mono">
                    {formatTokens(session.totalTokens)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{session.models.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalyticsChartCard>
    </div>
  );
}
