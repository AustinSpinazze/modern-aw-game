// Persisted settings: API keys, preferences.
// API keys are stored encrypted via Electron's safeStorage when running in Electron.
// Non-sensitive settings (model names, localHttpUrl) are persisted via localStorage.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConfigState {
  anthropicApiKey: string;
  openaiApiKey: string;
  localHttpUrl: string;
  anthropicModel: string;
  openaiModel: string;
  ollamaModel: string;

  setAnthropicApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
  setLocalHttpUrl: (url: string) => void;
  setAnthropicModel: (model: string) => void;
  setOpenaiModel: (model: string) => void;
  setOllamaModel: (model: string) => void;

  // Load encrypted keys from Electron's safeStorage (call once on startup)
  syncFromElectron: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      anthropicApiKey: "",
      openaiApiKey: "",
      localHttpUrl: "http://localhost:11434",
      anthropicModel: "claude-sonnet-4-6",
      openaiModel: "gpt-4o",
      ollamaModel: "llama3.2",

      setAnthropicApiKey: (key) => {
        set({ anthropicApiKey: key });
        // Persist encrypted in Electron; fall back to localStorage-only in web
        window.electronAPI?.saveApiKey("anthropic", key).catch(console.error);
      },

      setOpenaiApiKey: (key) => {
        set({ openaiApiKey: key });
        window.electronAPI?.saveApiKey("openai", key).catch(console.error);
      },

      setLocalHttpUrl: (url) => set({ localHttpUrl: url }),
      setAnthropicModel: (model) => set({ anthropicModel: model }),
      setOpenaiModel: (model) => set({ openaiModel: model }),
      setOllamaModel: (model) => set({ ollamaModel: model }),

      syncFromElectron: async () => {
        if (!window.electronAPI) return;
        const [anthropic, openai] = await Promise.all([
          window.electronAPI.loadApiKey("anthropic"),
          window.electronAPI.loadApiKey("openai"),
        ]);
        // Only overwrite if we got real values (don't blank out web-fallback keys)
        if (anthropic) set({ anthropicApiKey: anthropic });
        if (openai) set({ openaiApiKey: openai });
      },
    }),
    {
      name: "modern-aw-config",
      // Exclude API keys from localStorage — in Electron they live in encrypted config.json.
      // In web builds keys will be empty on reload (users re-enter per session).
      partialize: (state) => ({
        localHttpUrl: state.localHttpUrl,
        anthropicModel: state.anthropicModel,
        openaiModel: state.openaiModel,
        ollamaModel: state.ollamaModel,
      }),
    }
  )
);
