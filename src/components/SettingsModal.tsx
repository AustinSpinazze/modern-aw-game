import { useState, useEffect, useCallback } from "react";
import { useConfigStore } from "../store/config-store";

interface SettingsModalProps {
  onClose: () => void;
}

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-5", label: "Claude Opus 4.5 (most capable)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
  { id: "claude-haiku-3-5", label: "Claude Haiku 3.5 (fastest)" },
];

const OPENAI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o (recommended)" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (faster)" },
  { id: "o1-mini", label: "o1-mini (reasoning)" },
];

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const store = useConfigStore();

  // Local form state — only committed on Save
  const [anthropicKey, setAnthropicKey] = useState(store.anthropicApiKey);
  const [openaiKey, setOpenaiKey] = useState(store.openaiApiKey);
  const [localHttpUrl, setLocalHttpUrl] = useState(store.localHttpUrl);
  const [localModel, setLocalModel] = useState(store.ollamaModel);
  const [anthropicModel, setAnthropicModel] = useState(store.anthropicModel);
  const [openaiModel, setOpenaiModel] = useState(store.openaiModel);

  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Refresh from Electron secure storage on open
  useEffect(() => {
    store.syncFromElectron().then(() => {
      setAnthropicKey(useConfigStore.getState().anthropicApiKey);
      setOpenaiKey(useConfigStore.getState().openaiApiKey);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    store.setAnthropicApiKey(anthropicKey.trim());
    store.setOpenaiApiKey(openaiKey.trim());
    store.setLocalHttpUrl(localHttpUrl.trim());
    store.setOllamaModel(localModel.trim());
    store.setAnthropicModel(anthropicModel);
    store.setOpenaiModel(openaiModel);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }, [
    anthropicKey,
    openaiKey,
    localHttpUrl,
    localModel,
    anthropicModel,
    openaiModel,
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

          {/* Local HTTP */}
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
              Local AI (Ollama / LM Studio / DeepSeek / Kimi / etc.)
            </h3>
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
          </section>
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
