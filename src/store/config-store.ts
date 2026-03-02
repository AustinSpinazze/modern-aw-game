// Persisted settings: API keys, preferences.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConfigState {
  anthropicApiKey: string;
  openaiApiKey: string;
  localHttpUrl: string;
  anthropicModel: string;
  openaiModel: string;

  setAnthropicApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
  setLocalHttpUrl: (url: string) => void;
  setAnthropicModel: (model: string) => void;
  setOpenaiModel: (model: string) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      anthropicApiKey: "",
      openaiApiKey: "",
      localHttpUrl: "http://localhost:11434",
      anthropicModel: "claude-sonnet-4-6",
      openaiModel: "gpt-4o",

      setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),
      setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
      setLocalHttpUrl: (url) => set({ localHttpUrl: url }),
      setAnthropicModel: (model) => set({ anthropicModel: model }),
      setOpenaiModel: (model) => set({ openaiModel: model }),
    }),
    { name: "modern-aw-config" }
  )
);
