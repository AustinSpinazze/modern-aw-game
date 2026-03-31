import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useUsageStore } from "../../store/usageStore";
import { PROVIDER_COLORS, providerLabel } from "../../lib/aiModels";
import { formatTokens, getMonthKey } from "../../lib/format";
import {
  type DateRange,
  detectGameSessions,
  filterEntriesByModel,
  filterEntriesByDateRange,
  fillMonthlyGaps,
} from "../../lib/usageAnalytics";
import SummaryCard from "../shared/SummaryCard";
import { AnalyticsChartCard } from "./AnalyticsChartCard";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState";

/**
 * Usage analytics tab: summary cards (tokens, calls, games, avg/game),
 * monthly bar chart, provider pie chart, and provider bar breakdown.
 */
export function UsageAnalyticsTab({
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
    const totalTokens = filtered.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
    const totalCalls = filtered.length;
    const sessions = detectGameSessions(filtered);
    const sessionTokenSum = sessions.reduce((s, sess) => s + sess.totalTokens, 0);
    const avgTokensPerGame =
      sessions.length > 0 ? Math.round(sessionTokenSum / sessions.length) : 0;

    const byMonth: Record<string, number> = {};
    for (const e of filtered) {
      const key = getMonthKey(e.timestamp);
      byMonth[key] = (byMonth[key] ?? 0) + e.inputTokens + e.outputTokens;
    }
    const monthlyData = fillMonthlyGaps(byMonth, dateRange);

    const byProvider: Record<string, number> = {};
    for (const e of filtered) {
      byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.inputTokens + e.outputTokens;
    }
    const totalProviderTokens = Object.values(byProvider).reduce((s, p) => s + p, 0);
    const providerData = Object.entries(byProvider).map(([provider, tokens]) => ({
      name: providerLabel(provider),
      provider,
      tokens,
      pct: totalProviderTokens > 0 ? Math.round((tokens / totalProviderTokens) * 100) : 0,
    }));

    return {
      totalTokens,
      totalCalls,
      sessions,
      avgTokensPerGame,
      monthlyData,
      providerData,
    };
  }, [filtered, dateRange]);

  if (entries.length === 0) {
    return (
      <AnalyticsEmptyState
        message="No usage data yet"
        detail="Play a game with an AI opponent to start tracking"
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Tokens"
          value={formatTokens(stats.totalTokens)}
          sub={`${formatTokens(filtered.reduce((s, e) => s + e.inputTokens, 0))} in / ${formatTokens(filtered.reduce((s, e) => s + e.outputTokens, 0))} out`}
        />
        <SummaryCard
          label="API Calls"
          value={stats.totalCalls.toLocaleString()}
          sub="All contexts"
        />
        <SummaryCard
          label="Games Played"
          value={String(stats.sessions.length)}
          sub="LLM sessions"
        />
        <SummaryCard
          label="Avg Tokens / Game"
          value={stats.avgTokensPerGame > 0 ? formatTokens(stats.avgTokensPerGame) : "—"}
          sub="Per session"
        />
      </div>

      {stats.monthlyData.length > 0 && (
        <AnalyticsChartCard title="Monthly Token Usage">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.monthlyData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
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
              <Bar dataKey="tokens" fill="#f59e0b" name="Tokens" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AnalyticsChartCard title="Usage by Provider">
          {stats.providerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.providerData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="tokens"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={
                    ((props: any) =>
                      `${props.name ?? ""} ${Math.round((props.percent ?? 0) * 100)}%`) as any
                  }
                >
                  {stats.providerData.map((entry) => (
                    <Cell
                      key={entry.provider}
                      fill={PROVIDER_COLORS[entry.provider] ?? "#9ca3af"}
                    />
                  ))}
                </Pie>
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
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <AnalyticsEmptyState message="No provider data" />
          )}
        </AnalyticsChartCard>

        <AnalyticsChartCard title="Tokens by Provider">
          <div className="space-y-4 py-4">
            {stats.providerData
              .sort((a, b) => b.tokens - a.tokens)
              .map((p) => {
                const maxT = Math.max(...stats.providerData.map((d) => d.tokens), 1);
                return (
                  <div key={p.provider} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider w-32 shrink-0">
                      {p.name}
                    </span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(3, (p.tokens / maxT) * 100)}%`,
                          backgroundColor: PROVIDER_COLORS[p.provider] ?? "#9ca3af",
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 w-20 text-right font-mono">
                      {formatTokens(p.tokens)}
                    </span>
                  </div>
                );
              })}
          </div>
        </AnalyticsChartCard>
      </div>
    </div>
  );
}
