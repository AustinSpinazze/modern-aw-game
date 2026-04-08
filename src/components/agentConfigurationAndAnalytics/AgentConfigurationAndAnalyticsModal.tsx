/**
 * Compact **agent configuration & analytics** modal (overlay): LLM providers, usage summary, local ping.
 * Used when the full {@link ./AgentConfigurationAndAnalyticsPage} is not shown.
 */

import { useState, useEffect, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { useConfigStore } from "../../store/configStore";
import TabBar from "../shared/TabBar";
import { AgentConfigurationModalPanel } from "./AgentConfigurationModalPanel";
import { UsageAnalyticsModalDashboard } from "./UsageAnalyticsModalDashboard";

interface AgentConfigurationAndAnalyticsModalProps {
  onClose: () => void;
}

type AgentConfigurationAndAnalyticsModalTab = "providers" | "usage";

export default function AgentConfigurationAndAnalyticsModal({
  onClose,
}: AgentConfigurationAndAnalyticsModalProps) {
  const store = useConfigStore();
  const [tab, setTab] = useState<AgentConfigurationAndAnalyticsModalTab>("providers");

  const [anthropicKey, setAnthropicKey] = useState(store.anthropicApiKey);
  const [openaiKey, setOpenaiKey] = useState(store.openaiApiKey);
  const [geminiKey, setGeminiKey] = useState(store.geminiApiKey);
  const [localHttpUrl, setLocalHttpUrl] = useState(store.localHttpUrl);
  const [localHttpEnabled, setLocalHttpEnabled] = useState(store.localHttpEnabled);
  const [localModel, setLocalModel] = useState(store.ollamaModel);
  const [anthropicModel, setAnthropicModel] = useState(store.anthropicModel);
  const [openaiModel, setOpenaiModel] = useState(store.openaiModel);
  const [geminiModel, setGeminiModel] = useState(store.geminiModel);
  const [llmHarnessMode, setLlmHarnessMode] = useState(store.llmHarnessMode);
  const [llmFailurePolicy, setLlmFailurePolicy] = useState(store.llmFailurePolicy);

  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
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
    store.setLocalHttpEnabled(localHttpEnabled);
    store.setOllamaModel(localModel.trim());
    store.setAnthropicModel(anthropicModel);
    store.setOpenaiModel(openaiModel);
    store.setGeminiModel(geminiModel);
    store.setLlmHarnessMode(llmHarnessMode);
    store.setLlmFailurePolicy(llmFailurePolicy);

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
    llmHarnessMode,
    llmFailurePolicy,
    store,
    onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <h2 className="text-gray-900 font-bold text-lg">Agent configuration &amp; analytics</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="px-5 mt-3">
            <TabBar
              tabs={[
                { id: "providers" as const, label: "Configuration" },
                { id: "usage" as const, label: "Usage analytics" },
              ]}
              active={tab}
              onChange={setTab}
              accent="red"
            />
          </div>
        </div>

        <div className="p-5 max-h-[65vh] overflow-y-auto">
          {tab === "providers" ? (
            <AgentConfigurationModalPanel
              anthropicKey={anthropicKey}
              setAnthropicKey={setAnthropicKey}
              showAnthropicKey={showAnthropicKey}
              setShowAnthropicKey={setShowAnthropicKey}
              openaiKey={openaiKey}
              setOpenaiKey={setOpenaiKey}
              showOpenaiKey={showOpenaiKey}
              setShowOpenaiKey={setShowOpenaiKey}
              geminiKey={geminiKey}
              setGeminiKey={setGeminiKey}
              showGeminiKey={showGeminiKey}
              setShowGeminiKey={setShowGeminiKey}
              anthropicModel={anthropicModel}
              setAnthropicModel={setAnthropicModel}
              openaiModel={openaiModel}
              setOpenaiModel={setOpenaiModel}
              geminiModel={geminiModel}
              setGeminiModel={setGeminiModel}
              localHttpEnabled={localHttpEnabled}
              setLocalHttpEnabled={setLocalHttpEnabled}
              localHttpUrl={localHttpUrl}
              setLocalHttpUrl={setLocalHttpUrl}
              localModel={localModel}
              setLocalModel={setLocalModel}
              llmHarnessMode={llmHarnessMode}
              setLlmHarnessMode={setLlmHarnessMode}
              llmFailurePolicy={llmFailurePolicy}
              setLlmFailurePolicy={setLlmFailurePolicy}
            />
          ) : (
            <UsageAnalyticsModalDashboard />
          )}
        </div>

        {tab === "providers" && (
          <div className="px-5 py-4 border-t border-gray-200 bg-white flex gap-3">
            <button
              onClick={handleSave}
              className={`flex-1 font-semibold py-2.5 rounded-lg transition-colors text-sm ${
                saved ? "bg-green-500 text-white" : "bg-red-500 hover:bg-red-600 text-white"
              }`}
            >
              {saved ? "Saved!" : "Save changes"}
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
