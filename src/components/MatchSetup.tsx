// Pre-game lobby: configure players, map, and match rules.

import { useState, useEffect, useRef, useCallback } from "react";
import type { ControllerType, GameState } from "../game/types";
import {
  createGameState,
  createPlayer,
  createUnit,
  initializeMap,
  addUnit,
  updateTile,
} from "../game/game-state";
import { generateMatchSeed } from "../game/rng";
import { loadGameData } from "../game/data-loader";
import { parseAwbwMapText, importAwbwMap } from "../game/awbw-import";
import { buildTestScenarioState } from "../game/test-scenario";
import { useGameStore } from "../store/game-store";

interface PlayerConfig {
  controllerType: ControllerType;
  modelId: string;
}

interface MatchConfig {
  startingFunds: number;
  incomeMultiplier: number;
  luck: "off" | "normal" | "high";
  maxTurns: number;
}

interface SavedMap {
  id: string;
  name: string;
  csv: string;
  width: number;
  height: number;
  savedAt: number;
}

interface ParsedPreview {
  width: number;
  height: number;
  tiles: number[][];
}

interface SavedGameMeta {
  name: string;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
}

interface MatchSetupProps {
  onMatchStart: () => void;
  onOpenSettings?: () => void;
}

const DEFAULT_MAP_WIDTH = 20;
const DEFAULT_MAP_HEIGHT = 15;

const DEFAULT_CONFIG: MatchConfig = {
  startingFunds: 5000,
  incomeMultiplier: 1,
  luck: "normal",
  maxTurns: -1,
};

const LUCK_SETTINGS: Record<MatchConfig["luck"], { min: number; max: number }> = {
  off: { min: 0, max: 0 },
  normal: { min: 0, max: 0.1 },
  high: { min: 0, max: 0.2 },
};

const SAVED_MAPS_KEY = "modern-aw-saved-maps";

function loadSavedMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(SAVED_MAPS_KEY);
    return raw ? (JSON.parse(raw) as SavedMap[]) : [];
  } catch {
    return [];
  }
}

function persistSavedMaps(maps: SavedMap[]) {
  localStorage.setItem(SAVED_MAPS_KEY, JSON.stringify(maps));
}

// ── Tile-ID → minimap color ──────────────────────────────────────────────────
// Maps raw AWBW tile IDs to display colors without loading game data.
const FACTION_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f1c40f",
  "#e67e22",
  "#9b59b6",
  "#1abc9c",
  "#e91e63",
];

function tileIdToColor(id: number): string {
  if (id <= 0 || id === 1) return "#8bc34a"; // plains
  if (id === 2) return "#95a5a6"; // mountain
  if (id === 3) return "#27ae60"; // forest
  if (id >= 4 && id <= 14) return "#2980b9"; // river
  if (id >= 15 && id <= 25) return "#bdc3c7"; // road
  if (id === 26 || id === 27) return "#7f8c8d"; // bridge
  if (id === 28) return "#1a5276"; // sea
  if (id >= 29 && id <= 32) return "#76d7c4"; // shoal
  if (id === 33) return "#0e6655"; // reef
  // Neutral properties (34-37)
  if (id >= 34 && id <= 37) return "#8e44ad";
  // Faction-owned: groups of 5 per faction starting at 38
  if (id >= 38 && id <= 100) {
    const faction = Math.floor((id - 38) / 5) % 8;
    return FACTION_COLORS[faction];
  }
  // Extended faction ranges (117+)
  if (id >= 117) {
    const faction = Math.floor((id - 117) / 5) % 8;
    return FACTION_COLORS[faction];
  }
  return "#8bc34a"; // default plains
}

// ── Minimap canvas component ──────────────────────────────────────────────────
function MapMinimap({ preview }: { preview: ParsedPreview }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const MAX_PX = 320;
    const tileSize = Math.max(
      2,
      Math.min(8, Math.floor(MAX_PX / Math.max(preview.width, preview.height)))
    );
    canvas.width = preview.width * tileSize;
    canvas.height = preview.height * tileSize;

    for (let row = 0; row < preview.height; row++) {
      for (let col = 0; col < preview.width; col++) {
        const id = preview.tiles[row]?.[col] ?? 1;
        ctx.fillStyle = tileIdToColor(id);
        ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
  }, [preview]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-gray-600 block mx-auto"
      style={{ imageRendering: "pixelated", maxWidth: "100%" }}
    />
  );
}

export default function MatchSetup({ onMatchStart, onOpenSettings }: MatchSetupProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { controllerType: "human", modelId: "" },
    { controllerType: "heuristic", modelId: "" },
  ]);
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [awbwText, setAwbwText] = useState("");
  const [awbwError, setAwbwError] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedPreview | null>(null);
  // Saved maps
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>(() => loadSavedMaps());
  const [mapName, setMapName] = useState("");
  const [showSavedMaps, setShowSavedMaps] = useState(true);

  // Electron save-game slots
  const [gameSaves, setGameSaves] = useState<SavedGameMeta[]>([]);
  const [loadingGame, setLoadingGame] = useState(false);

  const setGameState = useGameStore((s) => s.setGameState);

  // Load save list from Electron on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listSaves().then(setGameSaves).catch(console.error);
  }, []);

  const handleLoadGame = useCallback(
    async (name: string) => {
      if (!window.electronAPI) return;
      setLoadingGame(true);
      try {
        await loadGameData();
        const raw = (await window.electronAPI.loadGame(name)) as { state?: GameState } | null;
        if (raw?.state) {
          setGameState(raw.state);
          onMatchStart();
        }
      } catch (e) {
        console.error("Failed to load save:", e);
      } finally {
        setLoadingGame(false);
      }
    },
    [setGameState, onMatchStart]
  );

  const handleDeleteGame = useCallback(async (name: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.deleteSave(name);
    setGameSaves((prev) => prev.filter((s) => s.name !== name));
  }, []);

  const updatePlayerConfig = (index: number, patch: Partial<PlayerConfig>) => {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const updateConfig = (patch: Partial<MatchConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const applyConfigToState = (state: GameState): GameState => {
    const luck = LUCK_SETTINGS[config.luck];
    return {
      ...state,
      luck_min: luck.min,
      luck_max: luck.max,
      income_multiplier: config.incomeMultiplier,
      max_turns: config.maxTurns,
    };
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await loadGameData();
      let state = buildDefaultGameState(players.slice(0, playerCount), config.startingFunds);
      state = applyConfigToState(state);
      setGameState(state);
      onMatchStart();
    } finally {
      setLoading(false);
    }
  };

  const handleStartTestScenario = async () => {
    setLoading(true);
    try {
      await loadGameData();
      setGameState(buildTestScenarioState());
      onMatchStart();
    } finally {
      setLoading(false);
    }
  };

  const handleAwbwImport = async () => {
    setAwbwError("");
    if (!awbwText.trim()) {
      setAwbwError("Paste AWBW map CSV data first.");
      return;
    }
    setLoading(true);
    try {
      await loadGameData();
      const mapData = parseAwbwMapText(awbwText);
      if (mapData.width === 0 || mapData.height === 0) {
        setAwbwError("Could not parse map data. Ensure it is a CSV of tile IDs.");
        return;
      }
      let state = importAwbwMap(mapData);
      if (state.players.length === 0) {
        setAwbwError(
          "No player properties found on map. Need at least one HQ/factory/city with an owner."
        );
        return;
      }
      state = {
        ...state,
        players: state.players.map((p) => ({ ...p, funds: config.startingFunds })),
      };
      state = applyConfigToState(state);
      setGameState(state);
      onMatchStart();
    } catch (e) {
      setAwbwError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMap = () => {
    if (!parsedPreview || !awbwText.trim()) return;
    const name = mapName.trim() || `Map ${parsedPreview.width}×${parsedPreview.height}`;
    const newMap: SavedMap = {
      id: `map_${Date.now()}`,
      name,
      csv: awbwText,
      width: parsedPreview.width,
      height: parsedPreview.height,
      savedAt: Date.now(),
    };
    const updated = [newMap, ...savedMaps];
    setSavedMaps(updated);
    persistSavedMaps(updated);
    setMapName("");
  };

  const handleLoadSavedMap = (map: SavedMap) => {
    setAwbwText(map.csv);
    setAwbwError("");
    try {
      const mapData = parseAwbwMapText(map.csv);
      setParsedPreview(
        mapData.width > 0
          ? { width: mapData.width, height: mapData.height, tiles: mapData.tiles }
          : null
      );
    } catch {
      setParsedPreview(null);
    }
  };

  const handleDeleteSavedMap = (id: string) => {
    const updated = savedMaps.filter((m) => m.id !== id);
    setSavedMaps(updated);
    persistSavedMaps(updated);
  };

  const playerColors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-start justify-center p-8 overflow-y-auto">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-white">Modern AW</h1>
            <p className="text-gray-400 text-sm mt-0.5">Configure your match</p>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="text-gray-400 hover:text-white text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              title="Settings"
            >
              ⚙ Settings
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* ── Saved Games (Electron only) ──────────────────────────────── */}
          {gameSaves.length > 0 && (
            <div className="border border-blue-800/50 bg-blue-950/30 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-blue-800/40">
                <h2 className="text-sm font-semibold text-blue-300">Continue a Saved Game</h2>
              </div>
              <div className="divide-y divide-blue-900/30">
                {gameSaves.map((save) => (
                  <div key={save.name} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium capitalize">
                        {save.name.replace(/-/g, " ")}
                      </div>
                      <div className="text-xs text-gray-500">
                        Turn {save.turnNumber} · {save.playerCount}P ·{" "}
                        {new Date(save.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLoadGame(save.name)}
                      disabled={loadingGame}
                      className="shrink-0 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
                    >
                      {loadingGame ? "Loading…" : "Continue"}
                    </button>
                    <button
                      onClick={() => handleDeleteGame(save.name)}
                      className="shrink-0 px-2 py-1.5 bg-gray-700 hover:bg-red-800 text-gray-400 hover:text-red-300 text-xs rounded transition-colors"
                      title="Delete save"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player count */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Players</label>
            <div className="flex gap-2 mt-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setPlayerCount(n);
                    if (players.length < n) {
                      setPlayers((prev) => [
                        ...prev,
                        ...Array.from({ length: n - prev.length }, () => ({
                          controllerType: "heuristic" as ControllerType,
                          modelId: "",
                        })),
                      ]);
                    }
                  }}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    playerCount === n
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {n}P
                </button>
              ))}
            </div>
          </div>

          {/* Player configs */}
          <div className="space-y-2">
            {Array.from({ length: playerCount }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`font-bold w-8 shrink-0 ${playerColors[i]}`}>P{i + 1}</div>
                <select
                  value={players[i]?.controllerType ?? "human"}
                  onChange={(e) =>
                    updatePlayerConfig(i, { controllerType: e.target.value as ControllerType })
                  }
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                >
                  <option value="human">Human</option>
                  <option value="heuristic">Heuristic AI</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">GPT (OpenAI)</option>
                  <option value="local_http">Local HTTP (Ollama / DeepSeek / etc.)</option>
                </select>
              </div>
            ))}
          </div>

          {/* ── Match Settings ─────────────────────────────────────────── */}
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-sm font-medium text-gray-300"
            >
              <span>Match Settings</span>
              <span className="text-gray-500 text-xs">{showAdvanced ? "▲ Hide" : "▼ Show"}</span>
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 border-t border-gray-700">
                {/* Starting funds */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-2">
                    Starting Funds
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1000, 2000, 3000, 5000, 10000, 20000].map((v) => (
                      <button
                        key={v}
                        onClick={() => updateConfig({ startingFunds: v })}
                        className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                          config.startingFunds === v
                            ? "bg-yellow-700 text-yellow-200 border border-yellow-600"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {v === 0 ? "¥0" : `¥${(v / 1000).toFixed(0)}k`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Income per turn */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">
                    Income Per Property
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Multiplier on base property income (default: ¥1,000/property)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "×½  (¥500)", value: 0.5 },
                      { label: "×1  (¥1k)", value: 1 },
                      { label: "×1.5 (¥1.5k)", value: 1.5 },
                      { label: "×2  (¥2k)", value: 2 },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => updateConfig({ incomeMultiplier: value })}
                        className={`px-3 py-1.5 rounded text-sm transition-colors ${
                          config.incomeMultiplier === value
                            ? "bg-green-800 text-green-200 border border-green-600"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Luck */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">
                    Luck
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Random variance added to each attack roll
                  </p>
                  <div className="flex gap-2">
                    {(["off", "normal", "high"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => updateConfig({ luck: v })}
                        className={`flex-1 py-1.5 rounded text-sm capitalize transition-colors ${
                          config.luck === v
                            ? "bg-purple-800 text-purple-200 border border-purple-600"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {v}
                        <span className="block text-xs opacity-60">
                          {v === "off" ? "0%" : v === "normal" ? "±10%" : "±20%"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Turn limit */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-2">
                    Turn Limit
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Unlimited", value: -1 },
                      { label: "20 turns", value: 20 },
                      { label: "30 turns", value: 30 },
                      { label: "50 turns", value: 50 },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => updateConfig({ maxTurns: value })}
                        className={`px-3 py-1.5 rounded text-sm transition-colors ${
                          config.maxTurns === value
                            ? "bg-orange-800 text-orange-200 border border-orange-600"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Config summary */}
                <div className="bg-gray-800 rounded p-3 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Funds:{" "}
                    <span className="text-yellow-300 font-mono">
                      ¥{config.startingFunds.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Income: <span className="text-green-300">×{config.incomeMultiplier}</span>
                  </span>
                  <span>
                    Luck: <span className="text-purple-300 capitalize">{config.luck}</span>
                  </span>
                  <span>
                    Turns:{" "}
                    <span className="text-orange-300">
                      {config.maxTurns < 0 ? "∞" : config.maxTurns}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── AWBW Import ─────────────────────────────────────────────── */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Import AWBW Map</label>
            <textarea
              value={awbwText}
              onChange={(e) => {
                const text = e.target.value;
                setAwbwText(text);
                setAwbwError("");
                if (text.trim()) {
                  try {
                    const mapData = parseAwbwMapText(text);
                    setParsedPreview(
                      mapData.width > 0
                        ? { width: mapData.width, height: mapData.height, tiles: mapData.tiles }
                        : null
                    );
                  } catch {
                    setParsedPreview(null);
                  }
                } else {
                  setParsedPreview(null);
                }
              }}
              placeholder="Paste AWBW map CSV (comma-separated tile IDs, one row per line)"
              className="w-full mt-2 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono h-20 resize-y"
            />

            {/* Map preview */}
            {parsedPreview && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-400">
                    {parsedPreview.width}×{parsedPreview.height} tiles detected
                  </span>
                  <span className="text-gray-500">minimap preview</span>
                </div>
                <MapMinimap preview={parsedPreview} />

                {/* Save map controls */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    placeholder="Map name (optional)"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveMap()}
                  />
                  <button
                    onClick={handleSaveMap}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors shrink-0"
                  >
                    Save Map
                  </button>
                </div>
              </div>
            )}

            {awbwError && <p className="text-red-400 text-xs mt-1">{awbwError}</p>}
            <button
              onClick={handleAwbwImport}
              disabled={loading || !parsedPreview}
              className="mt-2 w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2 rounded transition-colors text-sm"
            >
              {loading ? "Importing…" : "Import & Start"}
            </button>
          </div>

          {/* ── Saved Maps ──────────────────────────────────────────────── */}
          {savedMaps.length > 0 && (
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowSavedMaps((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-sm font-medium text-gray-300"
              >
                <span>
                  Saved Maps <span className="text-gray-500 font-normal">({savedMaps.length})</span>
                </span>
                <span className="text-gray-500 text-xs">{showSavedMaps ? "▲ Hide" : "▼ Show"}</span>
              </button>

              {showSavedMaps && (
                <div className="divide-y divide-gray-800 border-t border-gray-700">
                  {savedMaps.map((map) => (
                    <div key={map.id} className="flex items-center gap-2 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{map.name}</div>
                        <div className="text-xs text-gray-500">
                          {map.width}×{map.height} · {new Date(map.savedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleLoadSavedMap(map)}
                        className="shrink-0 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteSavedMap(map.id)}
                        className="shrink-0 px-2 py-1 bg-gray-700 hover:bg-red-800 text-gray-400 hover:text-red-300 text-xs rounded transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Start */}
        <div className="px-6 py-4 border-t border-gray-700 space-y-2">
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? "Loading…" : "Start Match"}
          </button>
          <button
            onClick={handleStartTestScenario}
            disabled={loading}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-sm py-2 rounded-lg transition-colors"
            title="Minimal 5×5 map for E2E tests (attack + capture)"
          >
            Start test scenario
          </button>
        </div>
      </div>
    </div>
  );
}

// Build a simple demo map for testing
function buildDefaultGameState(playerConfigs: PlayerConfig[], startingFunds: number): GameState {
  const W = DEFAULT_MAP_WIDTH;
  const H = DEFAULT_MAP_HEIGHT;

  let state = createGameState({
    match_id: `match_${Date.now()}`,
    match_seed: generateMatchSeed(),
  });
  state = initializeMap(state, W, H);

  // Add players
  for (let i = 0; i < playerConfigs.length; i++) {
    const cfg = playerConfigs[i];
    const player = createPlayer({
      id: i,
      team: i,
      funds: startingFunds,
      controller_type: cfg.controllerType,
    });
    state = { ...state, players: [...state.players, player] };
  }

  // ── Terrain features ──────────────────────────────────────────────────
  const terrainPatches: Array<[number, number, string]> = [
    [2, 3, "forest"],
    [3, 3, "forest"],
    [4, 4, "forest"],
    [W - 3, H - 4, "forest"],
    [W - 4, H - 4, "forest"],
    [W - 5, H - 5, "forest"],
    [10, 3, "forest"],
    [11, 4, "forest"],
    [8, 5, "mountain"],
    [9, 5, "mountain"],
    [8, 6, "mountain"],
    [W - 7, H - 6, "mountain"],
    [W - 8, H - 6, "mountain"],
    [6, 0, "road"],
    [6, 1, "road"],
    [6, 2, "road"],
    [6, 3, "road"],
    [6, 4, "road"],
    [6, 5, "road"],
    [6, 6, "road"],
    [6, 7, "road"],
    [7, 7, "road"],
    [8, 7, "road"],
    [9, 7, "road"],
    [10, 7, "road"],
    [11, 7, "road"],
    [12, 7, "road"],
    [13, 7, "road"],
    [13, 8, "road"],
    [13, 9, "road"],
    [13, 10, "road"],
    ...Array.from({ length: H }, (_, row) => [W - 1, row, "sea"] as [number, number, string]),
    ...Array.from({ length: H }, (_, row) => [W - 2, row, "shoal"] as [number, number, string]),
    [W - 1, 9, "reef"],
    [W - 4, 3, "river"],
    [W - 3, 3, "river"],
    [W - 2, 3, "river"],
    [W - 4, 7, "bridge"],
    [0, H - 1, "sea"],
    [1, H - 1, "sea"],
    [2, H - 1, "sea"],
    [0, H - 2, "shoal"],
    [1, H - 2, "shoal"],
    [2, H - 2, "shoal"],
    [3, H - 1, "shoal"],
    [4, H - 1, "shoal"],
  ];

  for (const [x, y, t] of terrainPatches) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      state = updateTile(state, x, y, { terrain_type: t });
    }
  }

  if (playerConfigs.length >= 1) {
    state = updateTile(state, 1, 1, { terrain_type: "hq", owner_id: 0 });
  }
  state = updateTile(state, 2, 1, { terrain_type: "factory", owner_id: 0 });
  state = updateTile(state, 3, 1, { terrain_type: "city", owner_id: 0 });
  state = updateTile(state, 1, 2, { terrain_type: "airport", owner_id: 0 });

  if (playerConfigs.length >= 2) {
    state = updateTile(state, W - 4, H - 2, { terrain_type: "hq", owner_id: 1 });
  }
  state = updateTile(state, W - 5, H - 2, { terrain_type: "factory", owner_id: 1 });
  state = updateTile(state, W - 6, H - 2, { terrain_type: "city", owner_id: 1 });
  state = updateTile(state, W - 4, H - 3, { terrain_type: "airport", owner_id: 1 });

  state = updateTile(state, W - 2, 6, { terrain_type: "port", owner_id: 0 });
  state = updateTile(state, 2, H - 3, { terrain_type: "port", owner_id: 1 });

  state = updateTile(state, 9, 2, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 5, 9, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 10, 10, { terrain_type: "factory", owner_id: -1 });
  state = updateTile(state, 4, 5, { has_fob: true, fob_hp: 15 });

  const startingUnits: Array<{ unitType: string; ownerId: number; x: number; y: number }> = [
    { unitType: "infantry", ownerId: 0, x: 1, y: 3 },
    { unitType: "infantry", ownerId: 0, x: 2, y: 3 },
    { unitType: "tank", ownerId: 0, x: 3, y: 2 },
  ];

  if (playerConfigs.length >= 2) {
    startingUnits.push(
      { unitType: "infantry", ownerId: 1, x: W - 5, y: H - 3 },
      { unitType: "infantry", ownerId: 1, x: W - 6, y: H - 3 },
      { unitType: "tank", ownerId: 1, x: W - 5, y: H - 4 }
    );
  }

  for (const u of startingUnits) {
    const [id, s] = getNextUnitId(state);
    state = s;
    state = addUnit(
      state,
      createUnit({
        id,
        unit_type: u.unitType,
        owner_id: u.ownerId,
        x: u.x,
        y: u.y,
      })
    );
  }

  return state;
}

function getNextUnitId(state: GameState): [number, GameState] {
  const id = state.next_unit_id;
  return [id, { ...state, next_unit_id: id + 1 }];
}
