/**
 * Full-page **settings**: API keys, models, usage analytics (Recharts), token pricing notes, local endpoint ping.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useConfigStore } from "../../store/config-store";
import { useUsageStore } from "../../store/usage-store";
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
  LineChart,
  Line,
} from "recharts";
import { LocalEndpointPingPanel } from "./LocalEndpointPingPanel";
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  GEMINI_MODELS,
  LOCAL_MODELS,
  PROVIDER_COLORS,
  PROVIDER_TW,
  providerLabel,
} from "../../lib/ai-models";
import { formatTokens, getMonthKey } from "../../lib/format";
import {
  type DateRange,
  DATE_RANGE_OPTIONS,
  detectGameSessions,
  filterEntriesByModel,
  filterEntriesByDateRange,
  fillMonthlyGaps,
  exportUsageData,
} from "../../lib/usage-analytics";
import SummaryCard from "../shared/SummaryCard";
import ConfirmDialog from "../shared/ConfirmDialog";
import TabBar from "../shared/TabBar";

const VERSION = "v0.1.0";

// ── Types ────────────────────────────────────────────────────────────────────

type SettingsTab = "keys" | "usage" | "games" | "performance";

/** Props for the {@link SettingsPage} component. */
interface SettingsPageProps {
  /** Callback to navigate back to the main menu. */
  onBack: () => void;
}

/**
 * Filter toolbar for the analytics tabs (Usage, Per-Game, Performance).
 * Provides model selector, date range toggle buttons, export, and clear history actions.
 */
function AnalyticsFilters({
  modelFilter,
  onModelChange,
  modelsInData,
  dateRange,
  onDateRangeChange,
  onExport,
  onClear,
}: {
  modelFilter: string;
  onModelChange: (v: string) => void;
  modelsInData: string[];
  dateRange: DateRange;
  onDateRangeChange: (v: DateRange) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
      <div className="flex items-center gap-3">
        <label
          htmlFor="analytics-model-filter"
          className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] shrink-0"
        >
          Model
        </label>
        <select
          id="analytics-model-filter"
          value={modelFilter}
          onChange={(e) => onModelChange(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-mono focus:border-amber-500 focus:outline-none appearance-none"
        >
          <option value="all">All models</option>
          {modelsInData.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onDateRangeChange(opt.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              dateRange === opt.id
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onExport}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
        >
          Export
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
        >
          Clear History
        </button>
      </div>
    </div>
  );
}

/**
 * Informational callout explaining why the dashboard shows tokens instead of dollar costs,
 * with links to provider pricing pages and estimation guidance.
 */
function TokenPricingNote({ className }: { className?: string }) {
  return (
    <div
      className={`max-w-3xl border border-amber-200 bg-amber-50/60 rounded-xl px-5 py-4 ${className ?? ""}`}
    >
      <h4 className="text-xs font-bold text-amber-800 uppercase tracking-[0.15em] mb-2">
        Why tokens, not dollars?
      </h4>
      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        Prices vary by provider, plan, and change over time — so we track{" "}
        <span className="font-semibold text-gray-900">tokens</span>, which are stable and portable
        across providers. Everything below is usage from this app only, not a bill.
      </p>
      <div className="text-sm text-gray-700 leading-relaxed">
        <p className="font-semibold text-gray-800 mb-1">Estimate your cost:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600">
          <li>
            Note your <span className="font-medium text-gray-800">input</span> and{" "}
            <span className="font-medium text-gray-800">output</span> token counts from the
            dashboard below (providers charge different rates for each)
          </li>
          <li>
            You can use tools like{" "}
            <a
              href="https://pricepertoken.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2"
            >
              Price Per Token
            </a>{" "}
            to see current rates, or check your provider directly:{" "}
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
          </li>
        </ol>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Full-page AI configuration and analytics dashboard.
 * Contains four tabs: API Keys & Models, Usage Overview, Per-Game Stats, and Model Performance.
 * Used as a standalone page (not a modal) with its own header, footer, and back navigation.
 */
export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>("keys");
  const allEntries = useUsageStore((s) => s.entries);
  const clearHistory = useUsageStore((s) => s.clearHistory);
  const [analyticsModelFilter, setAnalyticsModelFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isAnalyticsTab = tab === "usage" || tab === "games" || tab === "performance";

  const modelsInUsageData = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) set.add(e.model);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  useEffect(() => {
    if (analyticsModelFilter !== "all" && !modelsInUsageData.includes(analyticsModelFilter)) {
      setAnalyticsModelFilter("all");
    }
  }, [analyticsModelFilter, modelsInUsageData]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "keys", label: "API Keys & Models" },
    { id: "usage", label: "Usage Overview" },
    { id: "games", label: "Per-Game Stats" },
    { id: "performance", label: "Model Performance" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#faf9f7" }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto px-6 pt-4 pb-0">
          {/* Breadcrumb row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-900 text-xs font-medium uppercase tracking-[0.15em] transition-colors"
            >
              &larr; Back to menu
            </button>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black tracking-wider uppercase text-gray-900">
            AI Config &amp; Analytics
          </h1>

          {/* Tabs */}
          <TabBar tabs={tabs} active={tab} onChange={setTab} accent="amber" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto px-6 py-8">
          {tab === "keys" && <TabApiKeys />}
          {isAnalyticsTab && (
            <>
              {tab === "usage" && <TokenPricingNote className="mb-6" />}
              <AnalyticsFilters
                modelFilter={analyticsModelFilter}
                onModelChange={setAnalyticsModelFilter}
                modelsInData={modelsInUsageData}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onExport={() => exportUsageData(allEntries)}
                onClear={() => setShowClearConfirm(true)}
              />
              {tab === "usage" && (
                <TabUsageOverview modelFilter={analyticsModelFilter} dateRange={dateRange} />
              )}
              {tab === "games" && (
                <TabPerGameStats modelFilter={analyticsModelFilter} dateRange={dateRange} />
              )}
              {tab === "performance" && (
                <TabModelPerformance modelFilter={analyticsModelFilter} dateRange={dateRange} />
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 uppercase tracking-[0.2em] font-medium">Modern AW</p>
          <span className="text-xs text-gray-400 font-mono">{VERSION}</span>
        </div>
      </footer>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear Usage History"
          message="This will permanently delete all token usage data, game sessions, and model performance records. This cannot be undone."
          confirmLabel="Clear All Data"
          onConfirm={() => {
            clearHistory();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
          variant="destructive"
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 1: API Keys & Models
// ═════════════════════════════════════════════════════════════════════════════

/**
 * API Keys & Models tab content.
 * Renders a 2x2 grid of provider cards (Anthropic, OpenAI, Gemini, Local) with
 * API key inputs, model selectors, and a save button that commits to the config store.
 */
function TabApiKeys() {
  const store = useConfigStore();

  const [anthropicKey, setAnthropicKey] = useState(store.anthropicApiKey);
  const [openaiKey, setOpenaiKey] = useState(store.openaiApiKey);
  const [geminiKey, setGeminiKey] = useState(store.geminiApiKey);
  const [localHttpUrl, setLocalHttpUrl] = useState(store.localHttpUrl);
  const [localModel, setLocalModel] = useState(store.ollamaModel);
  const [anthropicModel, setAnthropicModel] = useState(store.anthropicModel);
  const [openaiModel, setOpenaiModel] = useState(store.openaiModel);
  const [geminiModel, setGeminiModel] = useState(store.geminiModel);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    store.syncFromElectron().then(() => {
      const s = useConfigStore.getState();
      setAnthropicKey(s.anthropicApiKey);
      setOpenaiKey(s.openaiApiKey);
      setGeminiKey(s.geminiApiKey);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    store.setAnthropicApiKey(anthropicKey.trim());
    store.setOpenaiApiKey(openaiKey.trim());
    store.setGeminiApiKey(geminiKey.trim());
    store.setLocalHttpUrl(localHttpUrl.trim());
    store.setLocalHttpEnabled(localHttpUrl.trim().length > 0);
    store.setOllamaModel(localModel.trim());
    store.setAnthropicModel(anthropicModel);
    store.setOpenaiModel(openaiModel);
    store.setGeminiModel(geminiModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [
    anthropicKey,
    openaiKey,
    geminiKey,
    localHttpUrl,
    localModel,
    anthropicModel,
    openaiModel,
    geminiModel,
    store,
  ]);

  return (
    <div className="space-y-8">
      {/* Provider cards — 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ProviderCard
          name="Anthropic"
          subtitle="Cloud API Service"
          dotColor="bg-red-500"
          apiKey={anthropicKey}
          onKeyChange={setAnthropicKey}
          placeholder="sk-ant-..."
          model={anthropicModel}
          onModelChange={setAnthropicModel}
          models={ANTHROPIC_MODELS}
        />
        <ProviderCard
          name="OpenAI"
          subtitle="Cloud API Service"
          dotColor="bg-emerald-500"
          apiKey={openaiKey}
          onKeyChange={setOpenaiKey}
          placeholder="sk-..."
          model={openaiModel}
          onModelChange={setOpenaiModel}
          models={OPENAI_MODELS}
        />
        <ProviderCard
          name="Google Gemini"
          subtitle="Cloud API Service"
          dotColor="bg-blue-500"
          apiKey={geminiKey}
          onKeyChange={setGeminiKey}
          placeholder="AIza..."
          model={geminiModel}
          onModelChange={setGeminiModel}
          models={GEMINI_MODELS}
        />
        <ProviderCard
          name="Local Model"
          subtitle="Ollama / Local Endpoint"
          dotColor="bg-amber-500"
          isLocal
          localUrl={localHttpUrl}
          onLocalUrlChange={setLocalHttpUrl}
          model={localModel}
          onModelChange={setLocalModel}
          models={LOCAL_MODELS}
          allowCustomModel
        />
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        className={`px-8 py-3 font-black text-sm uppercase tracking-wider rounded-lg transition-colors ${
          saved ? "bg-emerald-500 text-white" : "bg-amber-500 hover:bg-amber-400 text-gray-900"
        }`}
      >
        {saved ? "Saved!" : "Save Configuration"}
      </button>
    </div>
  );
}

/**
 * Card for configuring a single AI provider (cloud or local).
 * Cloud providers show an API key input and model dropdown.
 * Local providers show an endpoint URL, a free-text model input with datalist suggestions,
 * and an embedded {@link LocalEndpointPingPanel} for connectivity testing.
 */
function ProviderCard({
  name,
  subtitle,
  dotColor,
  apiKey,
  onKeyChange,
  placeholder,
  model,
  onModelChange,
  models,
  isLocal,
  localUrl,
  onLocalUrlChange,
  allowCustomModel,
}: {
  name: string;
  subtitle: string;
  dotColor: string;
  apiKey?: string;
  onKeyChange?: (v: string) => void;
  placeholder?: string;
  model: string;
  onModelChange: (v: string) => void;
  models: Array<{ id: string; label: string }>;
  isLocal?: boolean;
  localUrl?: string;
  onLocalUrlChange?: (v: string) => void;
  allowCustomModel?: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const isConfigured = isLocal
    ? (localUrl ?? "").trim().length > 0 && model.trim().length > 0
    : (apiKey ?? "").trim().length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${dotColor}`} />
            <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">{name}</h3>
          </div>
          <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-1 ml-[22px]">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {isLocal ? (
          <>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Endpoint URL
              </label>
              <input
                type="url"
                value={localUrl ?? ""}
                onChange={(e) => onLocalUrlChange?.(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-300"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Default Model
              </label>
              {allowCustomModel ? (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="e.g. llama3.2, deepseek-r1:7b"
                  list={`local-models-${name}`}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-300"
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 appearance-none"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
              {allowCustomModel && (
                <datalist id={`local-models-${name}`}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey ?? ""}
                  onChange={(e) => onKeyChange?.(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 pr-16 text-sm text-gray-900 font-mono placeholder-gray-300"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Default Model
              </label>
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 appearance-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {isLocal && (
        <div className="mt-4">
          <LocalEndpointPingPanel url={localUrl ?? ""} accent="amber" />
        </div>
      )}

      {/* Required fields present (independent of server reachability) */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        {isConfigured ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {isLocal ? "Endpoint & model set" : "API key set"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            Not configured
          </span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 2: Usage Overview
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Usage Overview tab content.
 * Displays summary cards (total tokens, API calls, games, avg tokens/game),
 * a monthly bar chart, a provider pie chart, and a provider bar breakdown.
 */
function TabUsageOverview({
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
  }, [filtered]);

  if (entries.length === 0) {
    return (
      <EmptyState
        message="No usage data yet"
        detail="Play a game with an AI opponent to start tracking"
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
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
        <ChartCard title="Monthly Token Usage">
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
        </ChartCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ChartCard title="Usage by Provider">
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
            <EmptyState message="No provider data" />
          )}
        </ChartCard>

        <ChartCard title="Tokens by Provider">
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
        </ChartCard>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 3: Per-Game Stats
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Per-Game Stats tab content.
 * Groups API calls into game sessions (separated by 10-minute idle gaps) and displays
 * a bar chart of token usage per game plus a summary table with models used.
 */
function TabPerGameStats({
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
      <EmptyState
        message="No game data yet"
        detail="Complete a game with an AI opponent to see per-game stats"
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        message="No data for this model"
        detail="Pick another model or choose “All models”"
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
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
      <ChartCard title="Token Usage Per Game" subtitle={`Last ${sessions.length} games`}>
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
              formatter={((value: any) => formatTokens(Number(value ?? 0))) as any}
            />
            <Bar dataKey="tokens" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Table */}
      <ChartCard title="Game Summary">
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
      </ChartCard>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab 4: Model Performance
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Model Performance tab content.
 * Shows win/loss rates by model, per-model token usage breakdowns,
 * and a cumulative tokens-over-time line chart.
 */
function TabModelPerformance({
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
      <EmptyState
        message="No performance data yet"
        detail="Play games with AI to track model performance"
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        message="No data for this model"
        detail="Pick another model or choose “All models”"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ChartCard title="Win Rate by Model" subtitle="AI Opponent Effectiveness">
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
        </ChartCard>

        <ChartCard title="Usage by Model" subtitle="Tokens per game session">
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
        </ChartCard>
      </div>

      {stats.tokensOverTime.length > 1 && (
        <ChartCard title="Cumulative Tokens Over Time">
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
        </ChartCard>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared UI components
// ═════════════════════════════════════════════════════════════════════════════

/** White bordered card wrapper for charts and data tables with a title and optional subtitle. */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-[0.15em]">{title}</h3>
        {subtitle && (
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Centered placeholder shown when a tab has no data to display. */
function EmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <div className="text-5xl mb-4 opacity-30">~</div>
      <p className="text-sm font-semibold uppercase tracking-wider">{message}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}
