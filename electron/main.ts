import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import path from "path";
import fs from "fs";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// Only relevant for Windows NSIS installer
try {
  if (require("electron-squirrel-startup")) {
    app.quit();
  }
} catch {
  // Module not available (development or non-Windows)
}

let mainWindow: BrowserWindow | null = null;

// Config file path for storing settings
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#1a1a2e",
    // Use default title bar to avoid overlap with traffic lights
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent flicker
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development: load from Vite dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Save Directory ──────────────────────────────────────────────────────────

const SAVES_DIR = path.join(app.getPath("userData"), "saves");

function ensureSavesDir(): void {
  if (!fs.existsSync(SAVES_DIR)) {
    fs.mkdirSync(SAVES_DIR, { recursive: true });
  }
}

interface SaveMetadata {
  name: string;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
}

// ─── Config Storage ─────────────────────────────────────────────────────────

function loadConfig(): Record<string, unknown> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load config:", e);
  }
  return {};
}

function saveConfig(config: Record<string, unknown>): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save config:", e);
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// ─── Save Name Sanitizer ─────────────────────────────────────────────────────

function sanitizeSaveName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe.length > 0 && safe.length <= 64 ? safe : null;
}

// ─── Config Key Allowlist ────────────────────────────────────────────────────

const ALLOWED_CONFIG_KEYS = new Set([
  "localHttpUrl",
  "anthropicModel",
  "openaiModel",
  "ollamaModel",
]);

// Config get/set
ipcMain.handle("config:get", (_event, key: string) => {
  if (!ALLOWED_CONFIG_KEYS.has(key)) return undefined;
  const config = loadConfig();
  return config[key];
});

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
  if (!ALLOWED_CONFIG_KEYS.has(key)) return;
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
  return true;
});

// Secure API key storage (encrypted)
ipcMain.handle("secure:encrypt", (_event, text: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString("base64");
  }
  return text; // Fallback: store as-is (not recommended)
});

ipcMain.handle("secure:decrypt", (_event, encrypted: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encrypted, "base64");
    return safeStorage.decryptString(buffer);
  }
  return encrypted;
});

// ─── Game Save / Load ────────────────────────────────────────────────────────

ipcMain.handle("save:game", (_event, name: unknown, data: unknown): boolean => {
  try {
    ensureSavesDir();
    const safe = sanitizeSaveName(name);
    if (!safe) return false;
    const filePath = path.join(SAVES_DIR, `${safe}.json`);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(SAVES_DIR) + path.sep)) return false;
    fs.writeFileSync(resolved, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save game:", e);
    return false;
  }
});

ipcMain.handle("load:game", (_event, name: unknown): unknown => {
  try {
    const safe = sanitizeSaveName(name);
    if (!safe) return null;
    const filePath = path.join(SAVES_DIR, `${safe}.json`);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(SAVES_DIR) + path.sep)) return null;
    if (!fs.existsSync(resolved)) return null;
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch (e) {
    console.error("Failed to load game:", e);
    return null;
  }
});

ipcMain.handle("list:saves", (): SaveMetadata[] => {
  try {
    ensureSavesDir();
    return fs
      .readdirSync(SAVES_DIR)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, f), "utf-8")) as Record<
            string,
            unknown
          >;
          return [
            {
              name: f.replace(".json", ""),
              savedAt: (raw.savedAt as string) ?? new Date().toISOString(),
              turnNumber: (raw.turnNumber as number) ?? 0,
              playerCount: (raw.playerCount as number) ?? 0,
            },
          ];
        } catch {
          return [];
        }
      });
  } catch (e) {
    console.error("Failed to list saves:", e);
    return [];
  }
});

ipcMain.handle("delete:save", (_event, name: unknown): boolean => {
  try {
    const safe = sanitizeSaveName(name);
    if (!safe) return false;
    const filePath = path.join(SAVES_DIR, `${safe}.json`);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(SAVES_DIR) + path.sep)) return false;
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    return true;
  } catch {
    return false;
  }
});

// ─── Encrypted API Key Storage ───────────────────────────────────────────────

ipcMain.handle("apikey:save", (_event, name: string, key: string): boolean => {
  try {
    const config = loadConfig();
    const storageKey = `apikey_${name}`;
    if (key && safeStorage.isEncryptionAvailable()) {
      config[storageKey] = safeStorage.encryptString(key).toString("base64");
    } else {
      config[storageKey] = key;
    }
    saveConfig(config);
    return true;
  } catch (e) {
    console.error("Failed to save API key:", e);
    return false;
  }
});

ipcMain.handle("apikey:load", (_event, name: string): string => {
  try {
    const config = loadConfig();
    const stored = config[`apikey_${name}`] as string | undefined;
    if (!stored) return "";
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(stored, "base64"));
      } catch {
        return stored; // stored as plain text (e.g. encryption wasn't available when saved)
      }
    }
    return stored;
  } catch (e) {
    console.error("Failed to load API key:", e);
    return "";
  }
});

// AI request handler — calls Anthropic or OpenAI REST APIs using stored encrypted keys
ipcMain.handle(
  "ai:run",
  async (
    _event,
    provider: string,
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; maxTokens?: number }
  ): Promise<
    | { text: string; usage?: { inputTokens: number; outputTokens: number }; model?: string }
    | { error: string }
  > => {
    try {
      // Load the API key from encrypted storage
      const config = loadConfig();
      const storageKey = `apikey_${provider}`;
      let apiKey = config[storageKey] as string | undefined;
      if (apiKey && safeStorage.isEncryptionAvailable()) {
        try {
          apiKey = safeStorage.decryptString(Buffer.from(apiKey, "base64"));
        } catch {
          // stored as plain text fallback
        }
      }

      if (!apiKey) {
        return { error: `No API key configured for provider: ${provider}` };
      }

      if (provider === "anthropic") {
        const model = options?.model ?? "claude-sonnet-4-6";
        // Separate system message from conversation messages
        const systemMsg = messages.find((m) => m.role === "system");
        const nonSystemMsgs = messages.filter((m) => m.role !== "system");

        const body: Record<string, unknown> = {
          model,
          max_tokens: options?.maxTokens ?? 1024,
          messages: nonSystemMsgs,
        };
        if (systemMsg) body.system = systemMsg.content;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          return { error: `Anthropic API error ${response.status}: ${errText}` };
        }

        const data = (await response.json()) as {
          content: Array<{ type: string; text: string }>;
          usage?: { input_tokens: number; output_tokens: number };
        };
        const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
        const usage = data?.usage
          ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
          : undefined;
        return { text, usage, model };
      } else if (provider === "openai") {
        const model = options?.model ?? "gpt-4o-mini";
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model, messages, max_tokens: options?.maxTokens ?? 1024 }),
        });

        if (!response.ok) {
          const errText = await response.text();
          return { error: `OpenAI API error ${response.status}: ${errText}` };
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const text = data?.choices?.[0]?.message?.content ?? "";
        const usage = data?.usage
          ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
          : undefined;
        return { text, usage, model };
      } else if (provider === "gemini") {
        const model = options?.model ?? "gemini-2.5-flash";

        // Convert chat messages to Gemini format
        const systemMsg = messages.find((m) => m.role === "system");
        const nonSystemMsgs = messages.filter((m) => m.role !== "system");
        const contents = nonSystemMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const body: Record<string, unknown> = {
          contents,
          generationConfig: {
            maxOutputTokens: options?.maxTokens ?? 1024,
          },
        };
        if (systemMsg) {
          body.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          return { error: `Gemini API error ${response.status}: ${errText}` };
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
        };
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const usage = data?.usageMetadata
          ? {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
            }
          : undefined;
        return { text, usage, model };
      } else {
        return { error: `Unknown AI provider: ${provider}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `AI request failed: ${msg}` };
    }
  }
);

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});
