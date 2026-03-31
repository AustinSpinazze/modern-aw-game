import { useState, useEffect, useCallback } from "react";
import { useConfigStore } from "../../store/configStore";
import { ANTHROPIC_MODELS, OPENAI_MODELS, GEMINI_MODELS, LOCAL_MODELS } from "../../lib/aiModels";
import { AgentProviderCard } from "./AgentProviderCard";

/**
 * Agent configuration tab: LLM provider API keys, default models, and local endpoint.
 * Renders a 2x2 grid of provider cards (Anthropic, OpenAI, Gemini, Local) with
 * API key inputs, model selectors, and a save button that commits to the config store.
 */
export function AgentConfigurationTab() {
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AgentProviderCard
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
        <AgentProviderCard
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
        <AgentProviderCard
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
        <AgentProviderCard
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
