/**
 * **App configuration** (Zustand + persist): API keys, default models, local Ollama URL.
 * In Electron, keys sync via `safeStorage`; in the browser, persisted fields are still localStorage
 * (see persist config). Consumed by match setup, settings, and {@link ../ai/llmProviders}.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConfigState {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  localHttpUrl: string;
  localHttpEnabled: boolean; // user must explicitly enable local AI
  anthropicModel: string;
  openaiModel: string;
  geminiModel: string;
  ollamaModel: string;

  setAnthropicApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
  setGeminiApiKey: (key: string) => void;
  setLocalHttpUrl: (url: string) => void;
  setLocalHttpEnabled: (enabled: boolean) => void;
  setAnthropicModel: (model: string) => void;
  setOpenaiModel: (model: string) => void;
  setGeminiModel: (model: string) => void;
  setOllamaModel: (model: string) => void;

  // Load encrypted keys from Electron's safeStorage (call once on startup)
  syncFromElectron: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      anthropicApiKey: "",
      openaiApiKey: "",
      geminiApiKey: "",
      localHttpUrl: "http://localhost:11434",
      localHttpEnabled: false,
      anthropicModel: "claude-sonnet-4-6",
      openaiModel: "gpt-4o-mini",
      geminiModel: "gemini-2.5-flash",
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

      setGeminiApiKey: (key) => {
        set({ geminiApiKey: key });
        window.electronAPI?.saveApiKey("gemini", key).catch(console.error);
      },

      setLocalHttpUrl: (url) => set({ localHttpUrl: url }),
      setLocalHttpEnabled: (enabled) => set({ localHttpEnabled: enabled }),
      setAnthropicModel: (model) => set({ anthropicModel: model }),
      setOpenaiModel: (model) => set({ openaiModel: model }),
      setGeminiModel: (model) => set({ geminiModel: model }),
      setOllamaModel: (model) => set({ ollamaModel: model }),

      syncFromElectron: async () => {
        if (!window.electronAPI) return;
        const [anthropic, openai, gemini] = await Promise.all([
          window.electronAPI.loadApiKey("anthropic"),
          window.electronAPI.loadApiKey("openai"),
          window.electronAPI.loadApiKey("gemini"),
        ]);
        // Only overwrite if we got real values (don't blank out web-fallback keys)
        if (anthropic) set({ anthropicApiKey: anthropic });
        if (openai) set({ openaiApiKey: openai });
        if (gemini) set({ geminiApiKey: gemini });
      },
    }),
    {
      name: "modern-aw-config",
      // Exclude API keys from localStorage — in Electron they live in encrypted config.json.
      // In web builds keys will be empty on reload (users re-enter per session).
      partialize: (state) => ({
        localHttpUrl: state.localHttpUrl,
        localHttpEnabled: state.localHttpEnabled,
        anthropicModel: state.anthropicModel,
        openaiModel: state.openaiModel,
        geminiModel: state.geminiModel,
        ollamaModel: state.ollamaModel,
      }),
    }
  )
);
