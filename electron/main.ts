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

// Config get/set
ipcMain.handle("config:get", (_event, key: string) => {
  const config = loadConfig();
  return config[key];
});

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
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

ipcMain.handle("save:game", (_event, name: string, data: unknown): boolean => {
  try {
    ensureSavesDir();
    const filePath = path.join(SAVES_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save game:", e);
    return false;
  }
});

ipcMain.handle("load:game", (_event, name: string): unknown => {
  try {
    const filePath = path.join(SAVES_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

ipcMain.handle("delete:save", (_event, name: string): boolean => {
  try {
    const filePath = path.join(SAVES_DIR, `${name}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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

// AI request handler (will be expanded in Phase 5)
ipcMain.handle(
  "ai:run",
  async (_event, provider: string, state: unknown, apiKey?: string): Promise<unknown[]> => {
    // For now, just return empty array
    // Will be implemented in Phase 5
    console.log(`AI request: provider=${provider}, hasKey=${!!apiKey}`);
    return [];
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
