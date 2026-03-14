// Pre-game lobby: configure players, map, and match rules.

import { useState, useEffect, useRef } from "react";
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
  fogOfWar: boolean;
  turnTimeLimit: number;
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
  fogOfWar: false,
  turnTimeLimit: 0,
};

const LUCK_SETTINGS: Record<MatchConfig["luck"], { min: number; max: number }> = {
  off: { min: 0, max: 0 },
  normal: { min: 0, max: 0.1 },
  high: { min: 0, max: 0.2 },
};

const SAVED_MAPS_KEY = "modern-aw-saved-maps";

const CONTROLLER_OPTIONS: {
  value: ControllerType;
  label: string;
  desc: string;
  req?: string;
}[] = [
  { value: "human", label: "Human", desc: "You play this army." },
  {
    value: "heuristic",
    label: "Heuristic AI",
    desc: "Built-in rule-based AI. No internet required.",
  },
  { value: "anthropic", label: "Claude", desc: "Anthropic API.", req: "Requires API key" },
  { value: "openai", label: "GPT", desc: "OpenAI API.", req: "Requires API key" },
  {
    value: "local_http",
    label: "Local AI",
    desc: "Ollama / LM Studio.",
    req: "Requires local server",
  },
];

const PLAYER_BORDER = [
  "border-red-500",
  "border-blue-500",
  "border-green-500",
  "border-yellow-500",
];

const STEPS = ["Players", "Map", "Options", "Review"];

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
  if (id >= 34 && id <= 37) return "#8e44ad";
  if (id >= 38 && id <= 100) {
    const faction = Math.floor((id - 38) / 5) % 8;
    return FACTION_COLORS[faction];
  }
  if (id >= 117) {
    const faction = Math.floor((id - 117) / 5) % 8;
    return FACTION_COLORS[faction];
  }
  return "#8bc34a";
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
      className="rounded border border-slate-600 block mx-auto"
      style={{ imageRendering: "pixelated", maxWidth: "100%" }}
    />
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const isCompleted = i < current;
        const isCurrent = i === current;
        const dotClass = isCompleted
          ? "w-2.5 h-2.5 rounded-full bg-amber-500/70"
          : isCurrent
            ? "w-2.5 h-2.5 rounded-full bg-amber-500"
            : "w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-600";
        const textClass = isCurrent
          ? "text-amber-400"
          : isCompleted
            ? "text-slate-400"
            : "text-slate-600";
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1 px-3">
              <div className={dotClass} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${textClass}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 h-px mb-4 ${i < current ? "bg-amber-500/50" : "bg-slate-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MatchSetup({ onMatchStart, onOpenSettings }: MatchSetupProps) {
  // Wizard state
  const [step, setStep] = useState(0);
  const [mapMode, setMapMode] = useState<"default" | "awbw" | "saved">("default");
  const [selectedSavedMapId, setSelectedSavedMapId] = useState<string | null>(null);

  // Existing state
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { controllerType: "human", modelId: "" },
    { controllerType: "heuristic", modelId: "" },
  ]);
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [awbwText, setAwbwText] = useState("");
  const [awbwError, setAwbwError] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedPreview | null>(null);
  // Saved maps
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>(() => loadSavedMaps());
  const [mapName, setMapName] = useState("");

  const setGameState = useGameStore((s) => s.setGameState);

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
      fog_of_war: config.fogOfWar,
      turn_time_limit: config.turnTimeLimit,
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

  const handleLaunch = async () => {
    if (mapMode === "awbw" && parsedPreview) {
      await handleAwbwImport();
    } else {
      await handleStart();
    }
  };

  const playerColors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];

  // ── Shared header ────────────────────────────────────────────────────────────
  const header = (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`text-sm font-semibold transition-colors ${
            step === 0
              ? "invisible pointer-events-none text-slate-700"
              : "text-slate-400 hover:text-white"
          }`}
        >
          ← BACK
        </button>
        <span className="text-white font-black tracking-widest text-lg">NEW GAME</span>
      </div>
      <div className="flex items-center gap-4">
        <StepIndicator current={step} />
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            ⚙ Settings
          </button>
        )}
      </div>
    </header>
  );

  // ── Step 0: Players ──────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-xl space-y-6">
            {/* Player count */}
            <div>
              <div className="text-white font-bold text-base mb-1">Players</div>
              <p className="text-slate-500 text-sm mb-4">
                Choose how many players and who controls each army.
              </p>
              <div className="inline-flex bg-slate-800 rounded-lg p-1 border border-slate-700 mb-6">
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
                    className={`px-5 py-2 rounded-md text-sm font-bold transition-colors ${
                      playerCount === n
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {n}P
                  </button>
                ))}
              </div>

              {/* Player controller cards */}
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black bg-slate-800 border ${PLAYER_BORDER[i]}`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-sm font-bold ${playerColors[i]}`}>Player {i + 1}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CONTROLLER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updatePlayerConfig(i, { controllerType: opt.value })}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          players[i]?.controllerType === opt.value
                            ? "bg-amber-500/10 border-amber-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <div className="font-semibold text-xs">{opt.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                          {opt.desc}
                        </div>
                        {opt.req && <div className="text-xs text-red-400 mt-1">{opt.req}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Continue button */}
            <div className="flex justify-end">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-colors text-sm"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Map ──────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-xl space-y-4">
            <div>
              <div className="text-white font-bold text-base mb-1">Map</div>
              <p className="text-slate-500 text-sm mb-4">Select a map for this match.</p>
            </div>

            {/* Option: Default Skirmish */}
            <button
              onClick={() => setMapMode("default")}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                mapMode === "default"
                  ? "bg-amber-500/10 border-amber-500"
                  : "bg-slate-800 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="font-bold text-sm text-white">Default Skirmish</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {DEFAULT_MAP_WIDTH}×{DEFAULT_MAP_HEIGHT} hand-crafted map · Always available
              </div>
            </button>

            {/* Option: Custom AWBW Map */}
            <div
              className={`rounded-xl border transition-colors ${
                mapMode === "awbw"
                  ? "bg-amber-500/10 border-amber-500"
                  : "bg-slate-800 border-slate-700"
              }`}
            >
              <button onClick={() => setMapMode("awbw")} className="w-full text-left p-4">
                <div className="font-bold text-sm text-white">Custom AWBW Map</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Paste CSV tile data from advancewars.net/maproom
                </div>
              </button>

              {mapMode === "awbw" && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50">
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
                              ? {
                                  width: mapData.width,
                                  height: mapData.height,
                                  tiles: mapData.tiles,
                                }
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
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono h-20 resize-y focus:border-amber-500 focus:outline-none mt-3"
                  />

                  {parsedPreview && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-green-400">
                          {parsedPreview.width}×{parsedPreview.height} tiles detected
                        </span>
                        <span className="text-slate-500">minimap preview</span>
                      </div>
                      <MapMinimap preview={parsedPreview} />

                      {/* Save map controls */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={mapName}
                          onChange={(e) => setMapName(e.target.value)}
                          placeholder="Map name (optional)"
                          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                          onKeyDown={(e) => e.key === "Enter" && handleSaveMap()}
                        />
                        <button
                          onClick={handleSaveMap}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors shrink-0"
                        >
                          Save Map
                        </button>
                      </div>
                    </div>
                  )}

                  {awbwError && <p className="text-red-400 text-xs">{awbwError}</p>}
                </div>
              )}
            </div>

            {/* Option: Saved Maps */}
            {savedMaps.length > 0 && (
              <div
                className={`rounded-xl border transition-colors ${
                  mapMode === "saved"
                    ? "bg-amber-500/10 border-amber-500"
                    : "bg-slate-800 border-slate-700"
                }`}
              >
                <button onClick={() => setMapMode("saved")} className="w-full text-left p-4">
                  <div className="font-bold text-sm text-white">Saved Maps</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {savedMaps.length} saved {savedMaps.length === 1 ? "map" : "maps"} · Click to
                    select
                  </div>
                </button>

                {mapMode === "saved" && (
                  <div className="border-t border-slate-700/50 divide-y divide-slate-800">
                    {savedMaps.map((map) => (
                      <div
                        key={map.id}
                        className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${
                          selectedSavedMapId === map.id
                            ? "bg-amber-500/10"
                            : "hover:bg-slate-700/30"
                        }`}
                      >
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => {
                            handleLoadSavedMap(map);
                            setSelectedSavedMapId(map.id);
                            setMapMode("awbw");
                          }}
                        >
                          <div className="text-sm text-white font-medium truncate">{map.name}</div>
                          <div className="text-xs text-slate-500">
                            {map.width}×{map.height} · {new Date(map.savedAt).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          onClick={() => handleDeleteSavedMap(map.id)}
                          className="shrink-0 px-2 py-1 bg-slate-700 hover:bg-red-800/60 text-slate-400 hover:text-red-400 text-xs rounded transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Back + Continue */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep(0)}
                className="text-slate-400 hover:text-white text-sm font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={mapMode === "awbw" && !parsedPreview}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black rounded-xl transition-colors text-sm"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Options ──────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-xl space-y-5">
            <div>
              <div className="text-white font-bold text-base mb-1">Options</div>
              <p className="text-slate-500 text-sm mb-4">Configure match rules.</p>
            </div>

            {/* Starting funds */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-2">
                Starting Funds
              </label>
              <div className="flex flex-wrap gap-2">
                {[0, 1000, 2000, 3000, 5000, 10000, 20000].map((v) => (
                  <button
                    key={v}
                    onClick={() => updateConfig({ startingFunds: v })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors ${
                      config.startingFunds === v
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {v === 0 ? "¥0" : `¥${(v / 1000).toFixed(0)}k`}
                  </button>
                ))}
              </div>
            </div>

            {/* Income per turn */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">
                Income Per Property
              </label>
              <p className="text-xs text-slate-500 mb-2">
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
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      config.incomeMultiplier === value
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Luck */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">
                Luck
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Random variance added to each attack roll
              </p>
              <div className="flex gap-2">
                {(["off", "normal", "high"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => updateConfig({ luck: v })}
                    className={`flex-1 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                      config.luck === v
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {v}
                    <span className="block text-xs opacity-70">
                      {v === "off" ? "0%" : v === "normal" ? "±10%" : "±20%"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Turn limit */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-2">
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
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      config.maxTurns === value
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fog of War toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white font-medium">Fog of War</div>
                <div className="text-xs text-slate-500">Hide enemy units outside vision range</div>
              </div>
              <button
                onClick={() => updateConfig({ fogOfWar: !config.fogOfWar })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.fogOfWar ? "bg-amber-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    config.fogOfWar ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Turn Timer */}
            <div>
              <label className="text-white font-semibold text-sm block mb-1">Turn Timer</label>
              <p className="text-slate-400 text-xs mb-2">
                Auto-end turn when time expires (0 = no limit)
              </p>
              <div className="flex gap-2 flex-wrap">
                {[0, 30, 60, 120, 300].map((s) => (
                  <button
                    key={s}
                    onClick={() => setConfig((c) => ({ ...c, turnTimeLimit: s }))}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-mono transition-colors ${
                      config.turnTimeLimit === s
                        ? "bg-amber-500/10 border-amber-500 text-amber-400"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {s === 0 ? "Off" : s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Config summary strip */}
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Funds:{" "}
                <span className="text-amber-400 font-mono">
                  ¥{config.startingFunds.toLocaleString()}
                </span>
              </span>
              <span>
                Income: <span className="text-slate-300">×{config.incomeMultiplier}</span>
              </span>
              <span>
                Luck: <span className="text-slate-300 capitalize">{config.luck}</span>
              </span>
              <span>
                Turns:{" "}
                <span className="text-slate-300">
                  {config.maxTurns < 0 ? "∞" : config.maxTurns}
                </span>
              </span>
              <span>
                Fog: <span className="text-slate-300">{config.fogOfWar ? "On" : "Off"}</span>
              </span>
              <span>
                Timer:{" "}
                <span className="text-slate-300">
                  {config.turnTimeLimit === 0
                    ? "Off"
                    : config.turnTimeLimit < 60
                      ? `${config.turnTimeLimit}s`
                      : `${config.turnTimeLimit / 60}m`}
                </span>
              </span>
            </div>

            {/* Back + Continue (Review) */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep(1)}
                className="text-slate-400 hover:text-white text-sm font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-colors text-sm"
              >
                Review →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Review ───────────────────────────────────────────────────────────
  const mapLabel =
    mapMode === "awbw" && parsedPreview
      ? `Custom AWBW Map (${parsedPreview.width}×${parsedPreview.height})`
      : mapMode === "saved" && selectedSavedMapId
        ? (savedMaps.find((m) => m.id === selectedSavedMapId)?.name ?? "Saved Map")
        : `Default Skirmish (${DEFAULT_MAP_WIDTH}×${DEFAULT_MAP_HEIGHT})`;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {header}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-xl space-y-4">
          <div>
            <div className="text-white font-bold text-base mb-1">Review</div>
            <p className="text-slate-500 text-sm mb-4">Confirm your setup and deploy.</p>
          </div>

          {/* Summary card */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2 text-sm">
            {/* Players */}
            {Array.from({ length: playerCount }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <span className={`font-medium ${playerColors[i]}`}>Player {i + 1}</span>
                <span className="text-slate-300 capitalize">
                  {CONTROLLER_OPTIONS.find((o) => o.value === players[i]?.controllerType)?.label ??
                    players[i]?.controllerType}
                </span>
              </div>
            ))}

            {/* Map */}
            <div className="border-t border-slate-700 pt-2 mt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Map</span>
                <span className="text-slate-300">{mapLabel}</span>
              </div>
            </div>

            {/* Match options */}
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-slate-500">Starting funds</span>
              <span className="text-amber-400 font-mono">
                ¥{config.startingFunds.toLocaleString()}
              </span>
              <span className="text-slate-500">Income</span>
              <span className="text-slate-300">×{config.incomeMultiplier}</span>
              <span className="text-slate-500">Luck</span>
              <span className="text-slate-300 capitalize">{config.luck}</span>
              <span className="text-slate-500">Turn limit</span>
              <span className="text-slate-300">
                {config.maxTurns < 0 ? "Unlimited" : `${config.maxTurns} turns`}
              </span>
              <span className="text-slate-500">Fog of war</span>
              <span className="text-slate-300">{config.fogOfWar ? "On" : "Off"}</span>
              <span className="text-slate-500">Turn timer</span>
              <span className="text-slate-300">
                {config.turnTimeLimit === 0
                  ? "Off"
                  : config.turnTimeLimit < 60
                    ? `${config.turnTimeLimit}s`
                    : `${config.turnTimeLimit / 60}m`}
              </span>
            </div>
          </div>

          {awbwError && (
            <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
              {awbwError}
            </p>
          )}

          {/* Deploy Forces CTA */}
          <button
            onClick={handleLaunch}
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-xl text-lg tracking-wide transition-colors shadow-lg"
          >
            {loading ? "Loading…" : "Deploy Forces"}
          </button>

          {/* Secondary actions */}
          <button
            onClick={handleStartTestScenario}
            disabled={loading}
            className="w-full mt-2 text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
          >
            Start test scenario
          </button>

          {/* Back */}
          <div className="flex justify-start pt-1">
            <button
              onClick={() => setStep(2)}
              className="text-slate-400 hover:text-white text-sm font-semibold transition-colors"
            >
              ← Back
            </button>
          </div>
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
