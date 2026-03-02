import { contextBridge, ipcRenderer } from "electron";

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Config storage
  getConfig: (key: string) => ipcRenderer.invoke("config:get", key),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke("config:set", key, value),

  // Secure storage for API keys
  encryptString: (text: string) => ipcRenderer.invoke("secure:encrypt", text),
  decryptString: (encrypted: string) =>
    ipcRenderer.invoke("secure:decrypt", encrypted),

  // AI provider calls
  runAI: (provider: string, state: unknown, apiKey?: string) =>
    ipcRenderer.invoke("ai:run", provider, state, apiKey),

  // Platform info
  platform: process.platform,
});

// TypeScript declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getConfig: (key: string) => Promise<unknown>;
      setConfig: (key: string, value: unknown) => Promise<boolean>;
      encryptString: (text: string) => Promise<string>;
      decryptString: (encrypted: string) => Promise<string>;
      runAI: (
        provider: string,
        state: unknown,
        apiKey?: string
      ) => Promise<unknown[]>;
      platform: NodeJS.Platform;
    };
  }
}
