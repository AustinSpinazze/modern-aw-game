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

function formatCost(usd: number): string {
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function UsageSection() {
  const entries = useUsageStore((s) => s.entries);
  const clearHistory = useUsageStore((s) => s.clearHistory);

  const stats = useMemo(() => {
    const totalCost = entries.reduce((sum, e) => sum + e.costUsd, 0);
    const totalInput = entries.reduce((sum, e) => sum + e.inputTokens, 0);
    const totalOutput = entries.reduce((sum, e) => sum + e.outputTokens, 0);

    // Per-model breakdown
    const byModel: Record<string, { calls: number; input: number; output: number; cost: number }> = {};
    for (const e of entries) {
      const key = e.model;
      if (!byModel[key]) byModel[key] = { calls: 0, input: 0, output: 0, cost: 0 };
      byModel[key].calls++;
      byModel[key].input += e.inputTokens;
      byModel[key].output += e.outputTokens;
      byModel[key].cost += e.costUsd;
    }

    // Per-context breakdown
    const byContext: Record<string, { calls: number; cost: number }> = {};
    for (const e of entries) {
      const ctx = e.context === "game_turn" ? "Game Turns" : e.context === "map_gen" ? "Map Generation" : "Other";
      if (!byContext[ctx]) byContext[ctx] = { calls: 0, cost: 0 };
      byContext[ctx].calls++;
      byContext[ctx].cost += e.costUsd;
    }

    return { totalCost, totalInput, totalOutput, byModel, byContext, totalCalls: entries.length };
  }, [entries]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
          Token Usage
        </h3>
        {stats.totalCalls > 0 && (
          <button
            onClick={() => { if (window.confirm("Clear all usage history?")) clearHistory(); }}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {stats.totalCalls === 0 ? (
        <p className="text-sm text-slate-600">No API calls recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800 rounded-lg p-2.5 text-center">
              <div className="text-amber-400 font-bold text-lg">{formatCost(stats.totalCost)}</div>
              <div className="text-slate-500 text-xs">Total Cost</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-2.5 text-center">
              <div className="text-white font-bold text-lg">{formatTokens(stats.totalInput + stats.totalOutput)}</div>
              <div className="text-slate-500 text-xs">Total Tokens</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-2.5 text-center">
              <div className="text-white font-bold text-lg">{stats.totalCalls}</div>
              <div className="text-slate-500 text-xs">API Calls</div>
            </div>
          </div>

          {/* By context */}
          <div className="flex gap-2">
            {Object.entries(stats.byContext).map(([ctx, data]) => (
              <div key={ctx} className="flex-1 bg-slate-800 rounded-lg px-2.5 py-2">
                <div className="text-xs text-slate-400">{ctx}</div>
                <div className="text-sm text-white font-medium">{formatCost(data.cost)}</div>
                <div className="text-xs text-slate-500">{data.calls} calls</div>
              </div>
            ))}
          </div>

          {/* Per-model table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="font-medium py-1">Model</th>
                <th className="font-medium py-1 text-right">Calls</th>
                <th className="font-medium py-1 text-right">Tokens</th>
                <th className="font-medium py-1 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.byModel)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([model, data]) => (
                  <tr key={model} className="text-slate-400 border-t border-slate-800">
                    <td className="py-1 font-mono text-slate-300 truncate max-w-[140px]">{model}</td>
                    <td className="py-1 text-right">{data.calls}</td>
                    <td className="py-1 text-right">{formatTokens(data.input + data.output)}</td>
                    <td className="py-1 text-right text-amber-400">{formatCost(data.cost)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const store = useConfigStore();

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
    anthropicKey,
    openaiKey,
    geminiKey,
    localHttpUrl,
    localHttpEnabled,
    localModel,
    anthropicModel,
    openaiModel,
    geminiModel,
    store,
    onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  const isElectron = !!window.electronAPI;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-bold text-lg">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none transition-colors"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Anthropic */}
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
              Anthropic (Claude)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 block mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showAnthropicKey ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-…"
                    className="flex-1 bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-600"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowAnthropicKey((v) => !v)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-lg transition-colors"
                  >
                    {showAnthropicKey ? "Hide" : "Show"}
                  </button>
                </div>
                {isElectron && (
                  <p className="text-green-500 text-sm mt-1">Stored encrypted on device</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Model</label>
                <select
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* OpenAI */}
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
              OpenAI (GPT)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 block mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showOpenaiKey ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-…"
                    className="flex-1 bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-600"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowOpenaiKey((v) => !v)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-lg transition-colors"
                  >
                    {showOpenaiKey ? "Hide" : "Show"}
                  </button>
                </div>
                {isElectron && (
                  <p className="text-green-500 text-sm mt-1">Stored encrypted on device</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Model</label>
                <select
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Gemini */}
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
              Google (Gemini)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 block mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza…"
                    className="flex-1 bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-600"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowGeminiKey((v) => !v)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-lg transition-colors"
                  >
                    {showGeminiKey ? "Hide" : "Show"}
                  </button>
                </div>
                {isElectron && (
                  <p className="text-green-500 text-sm mt-1">Stored encrypted on device</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Model</label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Local HTTP */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                Local AI (Ollama / LM Studio)
              </h3>
              <button
                onClick={() => setLocalHttpEnabled(!localHttpEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  localHttpEnabled ? "bg-amber-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    localHttpEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {localHttpEnabled ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Server URL</label>
                  <input
                    type="url"
                    value={localHttpUrl}
                    onChange={(e) => setLocalHttpUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Model name</label>
                  <input
                    type="text"
                    value={localModel}
                    onChange={(e) => setLocalModel(e.target.value)}
                    placeholder="e.g. llama3.2, deepseek-r1:7b, kimi-k2"
                    className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Enable to use a local OpenAI-compatible server (Ollama, LM Studio, etc.)
              </p>
            )}
          </section>

          {/* Usage Tracking */}
          <UsageSection />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={handleSave}
            className={`flex-1 font-bold py-2 rounded-lg transition-colors ${
              saved ? "bg-green-600 text-white" : "bg-amber-500 hover:bg-amber-400 text-slate-950"
            }`}
          >
            {saved ? "Saved!" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
