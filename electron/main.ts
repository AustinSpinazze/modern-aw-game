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

// AI request handler (will be expanded in Phase 5)
ipcMain.handle(
  "ai:run",
  async (
    _event,
    provider: string,
    state: unknown,
    apiKey?: string
  ): Promise<unknown[]> => {
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
