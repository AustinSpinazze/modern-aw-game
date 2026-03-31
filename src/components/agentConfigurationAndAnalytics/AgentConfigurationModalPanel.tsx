import { ANTHROPIC_MODELS, OPENAI_MODELS, GEMINI_MODELS } from "../../lib/aiModels";
import { LocalEndpointPingPanel } from "./LocalEndpointPingPanel";
import { AgentProviderSection } from "./AgentProviderSection";

export function AgentConfigurationModalPanel({
  anthropicKey,
  setAnthropicKey,
  showAnthropicKey,
  setShowAnthropicKey,
  openaiKey,
  setOpenaiKey,
  showOpenaiKey,
  setShowOpenaiKey,
  geminiKey,
  setGeminiKey,
  showGeminiKey,
  setShowGeminiKey,
  anthropicModel,
  setAnthropicModel,
  openaiModel,
  setOpenaiModel,
  geminiModel,
  setGeminiModel,
  localHttpEnabled,
  setLocalHttpEnabled,
  localHttpUrl,
  setLocalHttpUrl,
  localModel,
  setLocalModel,
}: {
  anthropicKey: string;
  setAnthropicKey: (v: string) => void;
  showAnthropicKey: boolean;
  setShowAnthropicKey: (v: boolean) => void;
  openaiKey: string;
  setOpenaiKey: (v: string) => void;
  showOpenaiKey: boolean;
  setShowOpenaiKey: (v: boolean) => void;
  geminiKey: string;
  setGeminiKey: (v: string) => void;
  showGeminiKey: boolean;
  setShowGeminiKey: (v: boolean) => void;
  anthropicModel: string;
  setAnthropicModel: (v: string) => void;
  openaiModel: string;
  setOpenaiModel: (v: string) => void;
  geminiModel: string;
  setGeminiModel: (v: string) => void;
  localHttpEnabled: boolean;
  setLocalHttpEnabled: (v: boolean) => void;
  localHttpUrl: string;
  setLocalHttpUrl: (v: string) => void;
  localModel: string;
  setLocalModel: (v: string) => void;
}) {
  const isElectron = !!window.electronAPI;

  return (
    <div className="space-y-5">
      <AgentProviderSection
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
      <AgentProviderSection
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
      <AgentProviderSection
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
            <LocalEndpointPingPanel url={localHttpUrl} accent="red" />
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
