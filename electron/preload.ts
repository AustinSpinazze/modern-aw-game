import { contextBridge, ipcRenderer } from "electron";

export interface SaveMetadata {
  name: string;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
}

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Detection
  isElectron: true as const,

  // Platform info
  platform: process.platform,

  // Config storage
  getConfig: (key: string) => ipcRenderer.invoke("config:get", key),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke("config:set", key, value),

  // Encrypted API key storage
  saveApiKey: (name: string, key: string) => ipcRenderer.invoke("apikey:save", name, key),
  loadApiKey: (name: string) => ipcRenderer.invoke("apikey:load", name),

  // Game save / load
  saveGame: (name: string, data: unknown) => ipcRenderer.invoke("save:game", name, data),
  loadGame: (name: string) => ipcRenderer.invoke("load:game", name),
  listSaves: () => ipcRenderer.invoke("list:saves"),
  deleteSave: (name: string) => ipcRenderer.invoke("delete:save", name),

  // AI provider calls
  runAI: (
    provider: string,
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; maxTokens?: number }
  ) => ipcRenderer.invoke("ai:run", provider, messages, options),

  /** Append one NDJSON line under userData/logs/llm-{matchId}.ndjson */
  appendLlmDebugLog: (entry: unknown) =>
    ipcRenderer.invoke("llm-debug:append", entry) as Promise<boolean>,
  getLlmDebugLogsDir: () => ipcRenderer.invoke("llm-debug:logsDir") as Promise<string>,
});

// TypeScript declarations for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      platform: NodeJS.Platform;
      getConfig: (key: string) => Promise<unknown>;
      setConfig: (key: string, value: unknown) => Promise<boolean>;
      saveApiKey: (name: string, key: string) => Promise<boolean>;
      loadApiKey: (name: string) => Promise<string>;
      saveGame: (name: string, data: unknown) => Promise<boolean>;
      loadGame: (name: string) => Promise<unknown>;
      listSaves: () => Promise<SaveMetadata[]>;
      deleteSave: (name: string) => Promise<boolean>;
      runAI: (
        provider: string,
        messages: Array<{ role: string; content: string }>,
        options?: { model?: string; maxTokens?: number }
      ) => Promise<
        | { text: string; usage?: { inputTokens: number; outputTokens: number }; model?: string }
        | { error: string }
      >;
      appendLlmDebugLog: (entry: unknown) => Promise<boolean>;
      getLlmDebugLogsDir: () => Promise<string>;
    };
  }
}
