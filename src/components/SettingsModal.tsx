import { useState, useEffect, useCallback, useMemo } from "react";
import { useConfigStore } from "../store/config-store";
import { useUsageStore, type UsageEntry } from "../store/usage-store";

interface SettingsModalProps {
  onClose: () => void;
}

// Model lists verified against provider docs — March 2026

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (most capable)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5 (legacy)" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (legacy)" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1 (legacy)" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4 (legacy)" },
  { id: "claude-opus-4-0", label: "Claude Opus 4 (legacy)" },
];

const OPENAI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (most capable)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (fast)" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (cheapest)" },
  { id: "o3", label: "o3 (reasoning)" },
  { id: "o4-mini", label: "o4-mini (reasoning, fast)" },
  { id: "o3-mini", label: "o3-mini (reasoning, budget)" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o (legacy)" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (legacy)" },
];

const GEMINI_MODELS = [
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (most capable)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (frontier)" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (budget)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (reasoning)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (recommended)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (cheapest)" },
];

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getMonthLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("default", { month: "short", year: "2-digit" });
}

function getProviderColor(provider: string): string {
  if (provider === "anthropic") return "bg-orange-500";
  if (provider === "openai") return "bg-emerald-500";
  if (provider === "gemini") return "bg-blue-500";
  return "bg-gray-500";
}

function getProviderLabel(provider: string): string {
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Google";
  if (provider === "local_http") return "Local";
  return provider;
}

// ── Usage Dashboard ──────────────────────────────────────────────────────────

function UsageDashboard() {
  const entries = useUsageStore((s) => s.entries);
  const clearHistory = useUsageStore((s) => s.clearHistory);

  const stats = useMemo(() => {
    const totalCost = entries.reduce((sum, e) => sum + e.costUsd, 0);
    const totalInput = entries.reduce((sum, e) => sum + e.inputTokens, 0);
    const totalOutput = entries.reduce((sum, e) => sum + e.outputTokens, 0);
    const totalCalls = entries.length;

    // Per-model breakdown
    const byModel: Record<string, { provider: string; calls: number; input: number; output: number; cost: number; gameTurns: number }> = {};
    for (const e of entries) {
      if (!byModel[e.model]) byModel[e.model] = { provider: e.provider, calls: 0, input: 0, output: 0, cost: 0, gameTurns: 0 };
      byModel[e.model].calls++;
      byModel[e.model].input += e.inputTokens;
      byModel[e.model].output += e.outputTokens;
      byModel[e.model].cost += e.costUsd;
      if (e.context === "game_turn") byModel[e.model].gameTurns++;
    }

    // Per-context breakdown
    const byContext: Record<string, { calls: number; cost: number; tokens: number }> = {};
    for (const e of entries) {
      const ctx = e.context === "game_turn" ? "Game Turns" : e.context === "map_gen" ? "Map Gen" : "Other";
      if (!byContext[ctx]) byContext[ctx] = { calls: 0, cost: 0, tokens: 0 };
      byContext[ctx].calls++;
      byContext[ctx].cost += e.costUsd;
      byContext[ctx].tokens += e.inputTokens + e.outputTokens;
    }

    // Monthly breakdown (last 6 months max)
    const byMonth: Record<string, { cost: number; tokens: number; calls: number }> = {};
    for (const e of entries) {
      const key = getMonthLabel(e.timestamp);
      if (!byMonth[key]) byMonth[key] = { cost: 0, tokens: 0, calls: 0 };
      byMonth[key].cost += e.costUsd;
      byMonth[key].tokens += e.inputTokens + e.outputTokens;
      byMonth[key].calls++;
    }

    // Avg tokens per game turn call
    const gameTurnEntries = entries.filter((e) => e.context === "game_turn");
    const avgTokensPerTurn = gameTurnEntries.length > 0
      ? Math.round(gameTurnEntries.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0) / gameTurnEntries.length)
      : 0;
    const avgCostPerTurn = gameTurnEntries.length > 0
      ? gameTurnEntries.reduce((s, e) => s + e.costUsd, 0) / gameTurnEntries.length
      : 0;

    // Sessions (approximate: group game_turn entries with gaps > 10min into separate sessions)
    let sessions = 0;
    let lastTs = 0;
    for (const e of gameTurnEntries.sort((a, b) => a.timestamp - b.timestamp)) {
      if (e.timestamp - lastTs > 10 * 60 * 1000) sessions++;
      lastTs = e.timestamp;
    }

    return {
      totalCost, totalInput, totalOutput, totalCalls,
      byModel, byContext, byMonth,
      avgTokensPerTurn, avgCostPerTurn,
      sessions,
      inputOutputRatio: totalInput > 0 ? totalOutput / totalInput : 0,
    };
  }, [entries]);

  if (stats.totalCalls === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <div className="text-4xl mb-3 opacity-50">~</div>
        <p className="text-sm font-medium">No usage data yet</p>
        <p className="text-xs text-gray-500 mt-1">Play a game with an AI opponent to start tracking</p>
      </div>
    );
  }

  const monthEntries = Object.entries(stats.byMonth);
  const maxMonthCost = Math.max(...monthEntries.map(([, d]) => d.cost), 0.001);

  return (
    <div className="space-y-5">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="Total Cost" value={formatCost(stats.totalCost)} accent />
        <SummaryCard label="Tokens" value={formatTokens(stats.totalInput + stats.totalOutput)} />
        <SummaryCard label="API Calls" value={String(stats.totalCalls)} />
        <SummaryCard label="Sessions" value={String(stats.sessions)} />
      </div>

      {/* ── Context breakdown ── */}
      <div>
        <SectionHeader title="By Activity" />
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stats.byContext).map(([ctx, data]) => (
            <div key={ctx} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="text-xs text-gray-500 mb-1">{ctx}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-gray-900">{formatCost(data.cost)}</span>
                <span className="text-xs text-gray-400">{data.calls} calls</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{formatTokens(data.tokens)} tokens</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Monthly trend ── */}
      {monthEntries.length > 0 && (
        <div>
          <SectionHeader title="Monthly Spend" />
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
            {monthEntries.map(([month, data]) => (
              <div key={month} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 shrink-0">{month}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.max(4, (data.cost / maxMonthCost) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 w-16 text-right">{formatCost(data.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Model comparison table ── */}
      <div>
        <SectionHeader title="Model Comparison" />
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-500 px-3 py-2">Model</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Calls</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Tokens</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Avg/Call</th>
                <th className="text-right font-medium text-gray-500 px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.byModel)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([model, data]) => (
                  <tr key={model} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${getProviderColor(data.provider)}`} />
                        <span className="text-gray-800 font-medium truncate max-w-[130px]">{model}</span>
                      </div>
                    </td>
                    <td className="text-right text-gray-600 px-3 py-2">{data.calls}</td>
                    <td className="text-right text-gray-600 px-3 py-2">{formatTokens(data.input + data.output)}</td>
                    <td className="text-right text-gray-600 px-3 py-2">{formatTokens(Math.round((data.input + data.output) / data.calls))}</td>
                    <td className="text-right font-medium text-gray-900 px-3 py-2">{formatCost(data.cost)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Insights ── */}
      <div>
        <SectionHeader title="Insights" />
        <div className="grid grid-cols-2 gap-2">
          <InsightCard
            label="Avg tokens / turn"
            value={formatTokens(stats.avgTokensPerTurn)}
            detail={`~${formatCost(stats.avgCostPerTurn)} per turn`}
          />
          <InsightCard
            label="Input / Output ratio"
            value={`${stats.inputOutputRatio.toFixed(1)}x`}
            detail={`${formatTokens(stats.totalInput)} in / ${formatTokens(stats.totalOutput)} out`}
          />
        </div>
      </div>

      {/* ── Clear ── */}
      <div className="pt-1">
        <button
          onClick={() => { if (window.confirm("Clear all usage history? This cannot be undone.")) clearHistory(); }}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Clear usage history
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center">
      <div className={`font-bold text-base ${accent ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{detail}</div>
    </div>
  );
}

// ── Provider Settings ────────────────────────────────────────────────────────

function ProviderSettings({
  anthropicKey, setAnthropicKey, showAnthropicKey, setShowAnthropicKey,
  openaiKey, setOpenaiKey, showOpenaiKey, setShowOpenaiKey,
  geminiKey, setGeminiKey, showGeminiKey, setShowGeminiKey,
  anthropicModel, setAnthropicModel,
  openaiModel, setOpenaiModel,
  geminiModel, setGeminiModel,
  localHttpEnabled, setLocalHttpEnabled,
  localHttpUrl, setLocalHttpUrl,
  localModel, setLocalModel,
}: {
  anthropicKey: string; setAnthropicKey: (v: string) => void;
  showAnthropicKey: boolean; setShowAnthropicKey: (v: boolean) => void;
  openaiKey: string; setOpenaiKey: (v: string) => void;
  showOpenaiKey: boolean; setShowOpenaiKey: (v: boolean) => void;
  geminiKey: string; setGeminiKey: (v: string) => void;
  showGeminiKey: boolean; setShowGeminiKey: (v: boolean) => void;
  anthropicModel: string; setAnthropicModel: (v: string) => void;
  openaiModel: string; setOpenaiModel: (v: string) => void;
  geminiModel: string; setGeminiModel: (v: string) => void;
  localHttpEnabled: boolean; setLocalHttpEnabled: (v: boolean) => void;
  localHttpUrl: string; setLocalHttpUrl: (v: string) => void;
  localModel: string; setLocalModel: (v: string) => void;
}) {
  const isElectron = !!window.electronAPI;

  return (
    <div className="space-y-5">
      <ProviderSection
        title="Anthropic (Claude)"
        apiKey={anthropicKey}
        setApiKey={setAnthropicKey}
        showKey={showAnthropicKey}
        setShowKey={setShowAnthropicKey}
        placeholder="sk-ant-..."
        model={anthropicModel}
        setModel={setAnthropicModel}
        models={ANTHROPIC_MODELS}
        isElectron={isElectron}
        dotColor="bg-orange-500"
      />
      <ProviderSection
        title="OpenAI (GPT)"
        apiKey={openaiKey}
        setApiKey={setOpenaiKey}
        showKey={showOpenaiKey}
        setShowKey={setShowOpenaiKey}
        placeholder="sk-..."
        model={openaiModel}
        setModel={setOpenaiModel}
        models={OPENAI_MODELS}
        isElectron={isElectron}
        dotColor="bg-emerald-500"
      />
      <ProviderSection
        title="Google (Gemini)"
        apiKey={geminiKey}
        setApiKey={setGeminiKey}
        showKey={showGeminiKey}
        setShowKey={setShowGeminiKey}
        placeholder="AIza..."
        model={geminiModel}
        setModel={setGeminiModel}
        models={GEMINI_MODELS}
        isElectron={isElectron}
        dotColor="bg-blue-500"
      />

      {/* Local HTTP */}
      <section className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Local AI (Ollama / LM Studio)</h3>
          </div>
          <button
            onClick={() => setLocalHttpEnabled(!localHttpEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              localHttpEnabled ? "bg-red-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                localHttpEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {localHttpEnabled ? (
          <div className="space-y-3 pl-4.5">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Server URL</label>
              <input
                type="url"
                value={localHttpUrl}
                onChange={(e) => setLocalHttpUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Model name</label>
              <input
                type="text"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="e.g. llama3.2, deepseek-r1:7b, kimi-k2"
                className="w-full bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900 font-mono"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 pl-4.5">
            Enable to use a local OpenAI-compatible server (Ollama, LM Studio, etc.)
          </p>
        )}
      </section>
    </div>
  );
}

function ProviderSection({
  title, apiKey, setApiKey, showKey, setShowKey, placeholder,
  model, setModel, models, isElectron, dotColor,
}: {
  title: string;
  apiKey: string; setApiKey: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  placeholder: string;
  model: string; setModel: (v: string) => void;
  models: Array<{ id: string; label: string }>;
  isElectron: boolean;
  dotColor: string;
}) {
  const hasKey = apiKey.trim().length > 0;

  return (
    <section className="border-t border-gray-100 pt-5 first:border-0 first:pt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {hasKey && (
          <span className="ml-auto text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Connected
          </span>
        )}
      </div>
      <div className="space-y-3 pl-4.5">
        <div>
          <label className="text-xs text-gray-500 block mb-1">API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400"
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {isElectron && hasKey && (
            <p className="text-[10px] text-green-600 mt-1">Encrypted on device</p>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

// ── Main Settings Modal ──────────────────────────────────────────────────────

type SettingsTab = "providers" | "usage";

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const store = useConfigStore();
  const [tab, setTab] = useState<SettingsTab>("providers");

  // Local form state — only committed on Save
  const [anthropicKey, setAnthropicKey] = useState(store.anthropicApiKey);
  const [openaiKey, setOpenaiKey] = useState(store.openaiApiKey);
  const [geminiKey, setGeminiKey] = useState(store.geminiApiKey);
  const [localHttpUrl, setLocalHttpUrl] = useState(store.localHttpUrl);
  const [localHttpEnabled, setLocalHttpEnabled] = useState(store.localHttpEnabled);
  const [localModel, setLocalModel] = useState(store.ollamaModel);
  const [anthropicModel, setAnthropicModel] = useState(store.anthropicModel);
  const [openaiModel, setOpenaiModel] = useState(store.openaiModel);
  const [geminiModel, setGeminiModel] = useState(store.geminiModel);

  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Refresh from Electron secure storage on open
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
    store.setLocalHttpEnabled(localHttpEnabled);
    store.setOllamaModel(localModel.trim());
    store.setAnthropicModel(anthropicModel);
    store.setOpenaiModel(openaiModel);
    store.setGeminiModel(geminiModel);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }, [
    anthropicKey, openaiKey, geminiKey, localHttpUrl, localHttpEnabled,
    localModel, anthropicModel, openaiModel, geminiModel, store, onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header + Tabs */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <h2 className="text-gray-900 font-bold text-lg">Settings</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close settings"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="flex gap-0 px-5 mt-3">
            <TabButton label="AI Providers" active={tab === "providers"} onClick={() => setTab("providers")} />
            <TabButton label="Usage Dashboard" active={tab === "usage"} onClick={() => setTab("usage")} />
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[65vh] overflow-y-auto">
          {tab === "providers" ? (
            <ProviderSettings
              anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey}
              showAnthropicKey={showAnthropicKey} setShowAnthropicKey={setShowAnthropicKey}
              openaiKey={openaiKey} setOpenaiKey={setOpenaiKey}
              showOpenaiKey={showOpenaiKey} setShowOpenaiKey={setShowOpenaiKey}
              geminiKey={geminiKey} setGeminiKey={setGeminiKey}
              showGeminiKey={showGeminiKey} setShowGeminiKey={setShowGeminiKey}
              anthropicModel={anthropicModel} setAnthropicModel={setAnthropicModel}
              openaiModel={openaiModel} setOpenaiModel={setOpenaiModel}
              geminiModel={geminiModel} setGeminiModel={setGeminiModel}
              localHttpEnabled={localHttpEnabled} setLocalHttpEnabled={setLocalHttpEnabled}
              localHttpUrl={localHttpUrl} setLocalHttpUrl={setLocalHttpUrl}
              localModel={localModel} setLocalModel={setLocalModel}
            />
          ) : (
            <UsageDashboard />
          )}
        </div>

        {/* Footer */}
        {tab === "providers" && (
          <div className="px-5 py-4 border-t border-gray-200 bg-white flex gap-3">
            <button
              onClick={handleSave}
              className={`flex-1 font-semibold py-2.5 rounded-lg transition-colors text-sm ${
                saved
                  ? "bg-green-500 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
              }`}
            >
              {saved ? "Saved!" : "Save Changes"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
        active
          ? "text-red-600"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-red-500 rounded-full" />
      )}
    </button>
  );
}
