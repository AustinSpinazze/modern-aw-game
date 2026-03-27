// Pre-game lobby: configure players, map, and match rules.

import { useState, useEffect, useRef, lazy, Suspense } from "react";
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
import { applyIncome } from "../game/economy";
import { useGameStore } from "../store/game-store";
import { useEditorStore } from "../store/editor-store";
import { computeStatsFromAwbwTiles, computeStatsFromGameState } from "../game/map-stats";
import type { MapStats } from "../game/map-stats";
import { generateMap, getMapGenProvider } from "../ai/map-generator";

// Lazy import for MapEditor (Pixi.js is client-only)
const MapEditor = lazy(() => import("./MapEditor"));

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
  description?: string;
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
  onExit?: () => void;
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
const STEP_LABELS = ["Players", "Map", "Options", "Review"];

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

// ── Map Stats Panel ──────────────────────────────────────────────────────────
const PLAYER_COLORS_HEX = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

function MapStatsPanel({ stats }: { stats: MapStats }) {
  const buildingTypes = Object.keys(stats.buildings);
  if (buildingTypes.length === 0 && Object.keys(stats.terrain).length === 0) return null;

  return (
    <div className="text-sm space-y-2">
      <div className="flex gap-4 text-gray-500">
        <span>
          {stats.width}×{stats.height}
        </span>
        <span>{stats.playerCount} players</span>
      </div>
      {buildingTypes.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium pr-2 py-0.5">Building</th>
              <th className="font-medium px-2 py-0.5">Neutral</th>
              {Array.from({ length: stats.playerCount }).map((_, i) => (
                <th
                  key={i}
                  className="font-medium px-2 py-0.5"
                  style={{ color: PLAYER_COLORS_HEX[i] }}
                >
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buildingTypes.map((type) => {
              const b = stats.buildings[type];
              return (
                <tr key={type} className="text-gray-600">
                  <td className="pr-2 py-0.5 capitalize">{type}</td>
                  <td className="px-2 py-0.5 font-mono">{b.neutral || "—"}</td>
                  {Array.from({ length: stats.playerCount }).map((_, i) => (
                    <td key={i} className="px-2 py-0.5 font-mono">
                      {b.players[i] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {Object.keys(stats.terrain).length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
          {Object.entries(stats.terrain)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([type, count]) => (
              <span key={type} className="capitalize">
                {type}: <span className="font-mono text-gray-700">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ── GameState Minimap ───────────────────────────────────────────────────────
const GS_TERRAIN_COLORS: Record<string, string> = {
  plains: "#8bc34a",
  mountain: "#95a5a6",
  forest: "#27ae60",
  river: "#2980b9",
  road: "#bdc3c7",
  bridge: "#7f8c8d",
  sea: "#1a5276",
  shoal: "#76d7c4",
  reef: "#0e6655",
  city: "#8e44ad",
  factory: "#8e44ad",
  airport: "#8e44ad",
  port: "#8e44ad",
  hq: "#8e44ad",
};

function GameStateMinimap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const MAX_PX = 320;
    const tileSize = Math.max(
      2,
      Math.min(8, Math.floor(MAX_PX / Math.max(state.map_width, state.map_height)))
    );
    canvas.width = state.map_width * tileSize;
    canvas.height = state.map_height * tileSize;

    for (let y = 0; y < state.map_height; y++) {
      for (let x = 0; x < state.map_width; x++) {
        const tile = state.tiles[y]?.[x];
        if (!tile) continue;
        const isBuilding = ["city", "factory", "airport", "port", "hq"].includes(tile.terrain_type);
        if (isBuilding && tile.owner_id >= 0 && tile.owner_id < FACTION_COLORS.length) {
          ctx.fillStyle = FACTION_COLORS[tile.owner_id];
        } else {
          ctx.fillStyle = GS_TERRAIN_COLORS[tile.terrain_type] ?? "#8bc34a";
        }
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }, [state]);

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
              <span className={`text-sm font-semibold uppercase tracking-wide ${textClass}`}>
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

export default function MatchSetup({ onMatchStart, onOpenSettings, onExit }: MatchSetupProps) {
  // Wizard state
  const [step, setStep] = useState(0);
  const [mapMode, setMapMode] = useState<"default" | "awbw" | "saved" | "generate" | "editor">("default");
  const [selectedSavedMapId, setSelectedSavedMapId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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
  const [mapNameError, setMapNameError] = useState("");
  const [mapDescription, setMapDescription] = useState("");
  // Default map stats
  const [defaultMapState, setDefaultMapState] = useState<GameState | null>(null);
  const [defaultMapStats, setDefaultMapStats] = useState<MapStats | null>(null);
  // Generate tab
  const [genDescription, setGenDescription] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [genCooldown, setGenCooldown] = useState(false);

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
      // Apply turn-1 income to the first player (matching Advance Wars rules)
      if (state.players.length > 0) {
        state = applyIncome(state, state.players[0].id);
      }
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
    if (!mapName.trim()) {
      setMapNameError("Please enter a map name.");
      return;
    }
    const newMap: SavedMap = {
      id: `map_${Date.now()}`,
      name: mapName.trim(),
      description: mapDescription.trim() || undefined,
      csv: awbwText,
      width: parsedPreview.width,
      height: parsedPreview.height,
      savedAt: Date.now(),
    };
    const updated = [newMap, ...savedMaps];
    setSavedMaps(updated);
    persistSavedMaps(updated);
    setMapName("");
    setMapDescription("");
    setMapNameError("");
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
    if ((mapMode === "awbw" || mapMode === "saved" || mapMode === "generate") && parsedPreview) {
      await handleAwbwImport();
    } else {
      await handleStart();
    }
  };

  const handleGenerate = async () => {
    const providerInfo = getMapGenProvider();
    if (!providerInfo) {
      setGenError("No AI provider configured. Set up an API key in Settings.");
      return;
    }
    setGenLoading(true);
    setGenError("");
    try {
      const result = await generateMap(genDescription, providerInfo.provider, providerInfo.model);
      if (result.error) {
        setGenError(result.error);
        if (result.preview.width > 0) {
          setParsedPreview(result.preview);
          setAwbwText(result.csv);
        }
      } else {
        setParsedPreview(result.preview);
        setAwbwText(result.csv);
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenLoading(false);
      setGenCooldown(true);
      setTimeout(() => setGenCooldown(false), 5000);
    }
  };

  const playerColors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];

  // ── Shared header ────────────────────────────────────────────────────────────
  const header = (
    <header className="bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 text-base font-semibold uppercase tracking-wide">
          <button onClick={onExit} className="text-gray-400 hover:text-gray-700 transition-colors">
            Main Menu
          </button>
          <span className="text-gray-300">›</span>
          <span className="text-[#1a1f2e]">New Game</span>
        </div>
        {/* Step breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300" />}
              <span
                className={
                  i === step ? "text-amber-500" : i < step ? "text-gray-400" : "text-gray-300"
                }
              >
                {String(i + 1).padStart(2, "0")} {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );

  // ── Map Editor (full-screen overlay) ──────────────────────────────────────────
  if (editorOpen) {
    const handleEditorPlay = async (editorState: GameState) => {
      setEditorOpen(false);
      await loadGameData();
      // Configure players on the editor state
      const editorPlayers = editorState.players.length > 0
        ? editorState.players.map((p, i) => ({
            ...p,
            controller_type: players[i]?.controllerType ?? (i === 0 ? "human" as const : "heuristic" as const),
            funds: config.startingFunds,
          }))
        : [
            createPlayer({ id: 0, team: 0, funds: config.startingFunds, controller_type: "human" }),
            createPlayer({ id: 1, team: 1, funds: config.startingFunds, controller_type: "heuristic" }),
          ];
      let state = {
        ...editorState,
        match_id: `match_${Date.now()}`,
        match_seed: generateMatchSeed(),
        players: editorPlayers,
      };
      state = applyConfigToState(state);
      if (state.players.length > 0) {
        state = applyIncome(state, state.players[0].id);
      }
      setGameState(state);
      onMatchStart();
    };

    return (
      <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading editor...</div>}>
        <MapEditor
          onClose={() => {
            setEditorOpen(false);
            useEditorStore.getState().clearEditor();
          }}
          onPlay={handleEditorPlay}
        />
      </Suspense>
    );
  }

  // ── Step 0: Players ──────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#f0ece0" }}>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 space-y-6">
            {/* Player count */}
            <div>
              <div className="text-gray-900 font-bold text-xl mb-1">Players</div>
              <p className="text-gray-500 text-lg mb-4">
                Choose how many players and who controls each army.
              </p>
              <div className="inline-flex bg-gray-100 rounded-lg p-1 border border-gray-200 mb-6">
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
                        ? "bg-amber-500 text-white"
                        : "text-gray-500 hover:text-gray-900"
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
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black bg-white border-2 ${PLAYER_BORDER[i]}`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-base font-bold ${playerColors[i]}`}>Player {i + 1}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CONTROLLER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updatePlayerConfig(i, { controllerType: opt.value })}
                        className={`text-left p-4 rounded-xl border transition-colors ${
                          players[i]?.controllerType === opt.value
                            ? "bg-amber-50 border-amber-500 text-gray-900"
                            : "bg-white border-gray-200 text-gray-700 hover:border-gray-400 shadow-sm"
                        }`}
                      >
                        <div className="font-bold text-base">{opt.label}</div>
                        <div className="text-lg text-gray-500 mt-0.5 leading-tight">{opt.desc}</div>
                        {opt.req && <div className="text-base text-red-500 mt-1">{opt.req}</div>}
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
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-white font-black rounded-xl transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
        {/* Bottom status bar */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm font-mono text-gray-400 uppercase tracking-widest">
          <span>{STEP_LABELS[step]}</span>
          <span>{step + 1} / 4</span>
        </div>
      </div>
    );
  }

  // ── Step 1: Map ──────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#f0ece0" }}>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 space-y-4">
            <div>
              <div className="text-gray-900 font-bold text-xl mb-1">Map</div>
              <p className="text-gray-500 text-lg mb-4">Select a map for this match.</p>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-gray-200 mb-4">
              {(
                [
                  { key: "default", label: "Default" },
                  { key: "awbw", label: "AWBW" },
                  { key: "saved", label: "Saved" },
                  { key: "generate", label: "Generate" },
                  { key: "editor", label: "Editor" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setMapMode(tab.key);
                    if (tab.key === "default" && !defaultMapState) {
                      loadGameData().then(() => {
                        const s = buildDefaultGameState(
                          players.slice(0, playerCount),
                          config.startingFunds
                        );
                        setDefaultMapState(s);
                        setDefaultMapStats(computeStatsFromGameState(s));
                      });
                    }
                  }}
                  className={`px-4 py-2.5 text-base font-bold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                    mapMode === tab.key
                      ? "border-amber-500 text-amber-600"
                      : "border-transparent text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                  {tab.key === "saved" && savedMaps.length > 0 && (
                    <span className="ml-1.5 text-xs bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-bold">
                      {savedMaps.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {mapMode === "default" && (
              <div className="space-y-3 py-2">
                <div className="text-gray-500 text-base">
                  {DEFAULT_MAP_WIDTH}×{DEFAULT_MAP_HEIGHT} hand-crafted map. Always available.
                </div>
                {defaultMapState && <GameStateMinimap state={defaultMapState} />}
                {defaultMapStats && <MapStatsPanel stats={defaultMapStats} />}
              </div>
            )}

            {mapMode === "awbw" && (
              <div className="space-y-3">
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
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 font-mono h-20 resize-y focus:border-amber-500 focus:outline-none"
                />
                {parsedPreview && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-base">
                      <span className="text-green-600">
                        {parsedPreview.width}×{parsedPreview.height} tiles detected
                      </span>
                      <span className="text-gray-500">minimap preview</span>
                    </div>
                    <MapMinimap preview={parsedPreview} />
                    <MapStatsPanel
                      stats={computeStatsFromAwbwTiles(
                        parsedPreview.tiles,
                        parsedPreview.width,
                        parsedPreview.height
                      )}
                    />
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={mapName}
                          onChange={(e) => {
                            setMapName(e.target.value);
                            setMapNameError("");
                          }}
                          placeholder="Map name (required)"
                          className={`flex-1 bg-white border rounded-lg px-3 py-1.5 text-base text-gray-900 focus:outline-none ${
                            mapNameError
                              ? "border-red-400 focus:border-red-500"
                              : "border-gray-300 focus:border-amber-500"
                          }`}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveMap()}
                        />
                        <button
                          onClick={handleSaveMap}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-base rounded-lg transition-colors shrink-0"
                        >
                          Save Map
                        </button>
                      </div>
                      {mapNameError && <p className="text-red-500 text-sm">{mapNameError}</p>}
                      <input
                        type="text"
                        value={mapDescription}
                        onChange={(e) => setMapDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-base text-gray-900 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
                {awbwError && <p className="text-red-500 text-base">{awbwError}</p>}
              </div>
            )}

            {mapMode === "saved" && (
              <div className="space-y-3">
                {savedMaps.length === 0 ? (
                  <div className="text-gray-400 text-base py-4 text-center">
                    No saved maps yet. Import a map in the Custom AWBW tab and save it.
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100">
                      {savedMaps.map((map) => (
                        <div
                          key={map.id}
                          className={`flex items-center gap-2 py-2.5 transition-colors ${
                            selectedSavedMapId === map.id ? "bg-amber-50 -mx-5 px-5 rounded" : ""
                          }`}
                        >
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              handleLoadSavedMap(map);
                              setSelectedSavedMapId(map.id);
                            }}
                          >
                            <div
                              className={`text-base font-medium truncate ${selectedSavedMapId === map.id ? "text-amber-700" : "text-gray-900"}`}
                            >
                              {map.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {map.width}×{map.height} ·{" "}
                              {new Date(map.savedAt).toLocaleDateString()}
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              handleDeleteSavedMap(map.id);
                              if (selectedSavedMapId === map.id) {
                                setSelectedSavedMapId(null);
                                setParsedPreview(null);
                              }
                            }}
                            className="shrink-0 px-2 py-1 bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 text-sm rounded transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Preview for selected saved map */}
                    {selectedSavedMapId && parsedPreview && (
                      <div className="pt-1 space-y-3">
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                          <span>Map Preview</span>
                          <span className="font-mono">
                            {parsedPreview.width}×{parsedPreview.height}
                          </span>
                        </div>
                        <MapMinimap preview={parsedPreview} />
                        <MapStatsPanel
                          stats={computeStatsFromAwbwTiles(
                            parsedPreview.tiles,
                            parsedPreview.width,
                            parsedPreview.height
                          )}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {mapMode === "generate" && (
              <div className="space-y-3">
                <textarea
                  value={genDescription}
                  onChange={(e) => setGenDescription(e.target.value)}
                  placeholder="Describe the map you want (e.g., 'A 20x15 island map with 2 players, lots of forests and mountains in the center')"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 h-20 resize-y focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={handleGenerate}
                  disabled={genLoading || genCooldown}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-lg transition-colors"
                >
                  {genLoading ? "Generating…" : genCooldown ? "Wait…" : "Generate Map"}
                </button>
                {genError && <p className="text-red-500 text-base">{genError}</p>}
                {!getMapGenProvider() && (
                  <p className="text-gray-400 text-sm">
                    No AI provider configured. Set up an API key in Settings to use map generation.
                  </p>
                )}
                {parsedPreview && mapMode === "generate" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-base">
                      <span className="text-green-600">
                        {parsedPreview.width}×{parsedPreview.height} generated
                      </span>
                      <span className="text-gray-500">minimap preview</span>
                    </div>
                    <MapMinimap preview={parsedPreview} />
                    <MapStatsPanel
                      stats={computeStatsFromAwbwTiles(
                        parsedPreview.tiles,
                        parsedPreview.width,
                        parsedPreview.height
                      )}
                    />
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={mapName}
                          onChange={(e) => {
                            setMapName(e.target.value);
                            setMapNameError("");
                          }}
                          placeholder="Map name (required to save)"
                          className={`flex-1 bg-white border rounded-lg px-3 py-1.5 text-base text-gray-900 focus:outline-none ${
                            mapNameError
                              ? "border-red-400 focus:border-red-500"
                              : "border-gray-300 focus:border-amber-500"
                          }`}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveMap()}
                        />
                        <button
                          onClick={handleSaveMap}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-base rounded-lg transition-colors shrink-0"
                        >
                          Save
                        </button>
                      </div>
                      {mapNameError && <p className="text-red-500 text-sm">{mapNameError}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {mapMode === "editor" && (
              <div className="space-y-3 py-2">
                <div className="text-gray-500 text-base">
                  Open the map editor to create or modify a map from scratch.
                </div>
                <button
                  onClick={() => setEditorOpen(true)}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-black rounded-xl transition-colors"
                >
                  Open Map Editor
                </button>
              </div>
            )}

            {/* Back + Continue */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep(0)}
                className="text-gray-500 hover:text-gray-900 text-lg font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={
                  (mapMode === "awbw" && !parsedPreview) ||
                  (mapMode === "saved" && !selectedSavedMapId) ||
                  (mapMode === "generate" && !parsedPreview) ||
                  (mapMode === "editor")
                }
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl transition-colors text-lg"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
        {/* Bottom status bar */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm font-mono text-gray-400 uppercase tracking-widest">
          <span>{STEP_LABELS[step]}</span>
          <span>{step + 1} / 4</span>
        </div>
      </div>
    );
  }

  // ── Step 2: Options ──────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#f0ece0" }}>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 space-y-5">
            <div>
              <div className="text-gray-900 font-bold text-xl mb-1">Options</div>
              <p className="text-gray-500 text-lg mb-4">Configure match rules.</p>
            </div>

            {/* Starting funds */}
            <div>
              <label className="text-lg font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Starting Funds
              </label>
              <div className="flex flex-wrap gap-2">
                {[0, 1000, 2000, 3000, 5000, 10000, 20000].map((v) => (
                  <button
                    key={v}
                    onClick={() => updateConfig({ startingFunds: v })}
                    className={`px-4 py-2 rounded-lg text-lg font-mono transition-colors ${
                      config.startingFunds === v
                        ? "bg-amber-500 text-white font-bold"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {v === 0 ? "¥0" : `¥${(v / 1000).toFixed(0)}k`}
                  </button>
                ))}
              </div>
            </div>

            {/* Income per turn */}
            <div>
              <label className="text-lg font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                Income Per Property
              </label>
              <p className="text-lg text-slate-500 mb-2">
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
                    className={`px-4 py-2 rounded-lg text-lg transition-colors ${
                      config.incomeMultiplier === value
                        ? "bg-amber-500 text-white font-bold"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Luck */}
            <div>
              <label className="text-lg font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                Luck
              </label>
              <p className="text-lg text-slate-500 mb-2">
                Random variance added to each attack roll
              </p>
              <div className="flex gap-2">
                {(["off", "normal", "high"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => updateConfig({ luck: v })}
                    className={`flex-1 py-1.5 rounded-lg text-base capitalize transition-colors ${
                      config.luck === v
                        ? "bg-amber-500 text-white font-bold"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {v}
                    <span className="block text-base opacity-70">
                      {v === "off" ? "0%" : v === "normal" ? "±10%" : "±20%"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Turn limit */}
            <div>
              <label className="text-lg font-semibold text-gray-500 uppercase tracking-wide block mb-2">
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
                    className={`px-4 py-2 rounded-lg text-lg transition-colors ${
                      config.maxTurns === value
                        ? "bg-amber-500 text-white font-bold"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400"
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
                <div className="text-lg text-gray-900 font-medium">Fog of War</div>
                <div className="text-lg text-gray-500">Hide enemy units outside vision range</div>
              </div>
              <button
                onClick={() => updateConfig({ fogOfWar: !config.fogOfWar })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.fogOfWar ? "bg-amber-500" : "bg-gray-300"
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
              <label className="text-gray-900 font-semibold text-lg block mb-2">Turn Timer</label>
              <p className="text-gray-500 text-lg mb-2">
                Auto-end turn when time expires (0 = no limit)
              </p>
              <div className="flex gap-2 flex-wrap">
                {[0, 30, 60, 120, 300].map((s) => (
                  <button
                    key={s}
                    onClick={() => setConfig((c) => ({ ...c, turnTimeLimit: s }))}
                    className={`px-3 py-1.5 text-base rounded-lg border font-mono transition-colors ${
                      config.turnTimeLimit === s
                        ? "bg-amber-500/10 border-amber-500 text-amber-400"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                    }`}
                  >
                    {s === 0 ? "Off" : s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Config summary strip */}
            <div className="bg-white rounded-lg p-3 border border-gray-200 text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1 shadow-sm">
              <span>
                Funds:{" "}
                <span className="text-amber-400 font-mono">
                  ¥{config.startingFunds.toLocaleString()}
                </span>
              </span>
              <span>
                Income: <span className="text-gray-700">×{config.incomeMultiplier}</span>
              </span>
              <span>
                Luck: <span className="text-gray-700 capitalize">{config.luck}</span>
              </span>
              <span>
                Turns:{" "}
                <span className="text-gray-700">{config.maxTurns < 0 ? "∞" : config.maxTurns}</span>
              </span>
              <span>
                Fog: <span className="text-gray-700">{config.fogOfWar ? "On" : "Off"}</span>
              </span>
              <span>
                Timer:{" "}
                <span className="text-gray-700">
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
                className="text-gray-500 hover:text-gray-900 text-lg font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-white font-black rounded-xl transition-colors"
              >
                Review →
              </button>
            </div>
          </div>
        </div>
        {/* Bottom status bar */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm font-mono text-gray-400 uppercase tracking-widest">
          <span>{STEP_LABELS[step]}</span>
          <span>{step + 1} / 4</span>
        </div>
      </div>
    );
  }

  // ── Step 3: Review ───────────────────────────────────────────────────────────
  const mapLabel =
    mapMode === "generate" && parsedPreview
      ? `Generated Map (${parsedPreview.width}×${parsedPreview.height})`
      : mapMode === "awbw" && parsedPreview
        ? `Custom AWBW Map (${parsedPreview.width}×${parsedPreview.height})`
        : mapMode === "saved" && selectedSavedMapId
          ? (savedMaps.find((m) => m.id === selectedSavedMapId)?.name ?? "Saved Map")
          : `Default Skirmish (${DEFAULT_MAP_WIDTH}×${DEFAULT_MAP_HEIGHT})`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f0ece0" }}>
      {header}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 space-y-4">
          <div>
            <div className="text-gray-900 font-bold text-xl mb-1">Review</div>
            <p className="text-gray-500 text-lg mb-4">Confirm your setup and deploy.</p>
          </div>

          {/* Summary card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2 text-lg shadow-sm">
            {/* Players */}
            {Array.from({ length: playerCount }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <span className={`font-medium ${playerColors[i]}`}>Player {i + 1}</span>
                <span className="text-gray-700 font-semibold capitalize">
                  {CONTROLLER_OPTIONS.find((o) => o.value === players[i]?.controllerType)?.label ??
                    players[i]?.controllerType}
                </span>
              </div>
            ))}

            {/* Map */}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex justify-between text-lg">
                <span className="text-gray-500">Map</span>
                <span className="text-gray-700 font-semibold">{mapLabel}</span>
              </div>
            </div>

            {/* Match options */}
            <div className="grid grid-cols-2 gap-1 text-lg">
              <span className="text-gray-500">Starting funds</span>
              <span className="text-amber-400 font-mono font-semibold">
                ¥{config.startingFunds.toLocaleString()}
              </span>
              <span className="text-gray-500">Income</span>
              <span className="text-gray-700 font-semibold">×{config.incomeMultiplier}</span>
              <span className="text-gray-500">Luck</span>
              <span className="text-gray-700 font-semibold capitalize">{config.luck}</span>
              <span className="text-gray-500">Turn limit</span>
              <span className="text-gray-700 font-semibold">
                {config.maxTurns < 0 ? "Unlimited" : `${config.maxTurns} turns`}
              </span>
              <span className="text-gray-500">Fog of war</span>
              <span className="text-gray-700 font-semibold">{config.fogOfWar ? "On" : "Off"}</span>
              <span className="text-gray-500">Turn timer</span>
              <span className="text-gray-700 font-semibold">
                {config.turnTimeLimit === 0
                  ? "Off"
                  : config.turnTimeLimit < 60
                    ? `${config.turnTimeLimit}s`
                    : `${config.turnTimeLimit / 60}m`}
              </span>
            </div>
          </div>

          {/* Map preview in review */}
          {(mapMode === "awbw" || mapMode === "saved" || mapMode === "generate") &&
            parsedPreview && (
              <div className="space-y-3">
                <MapMinimap preview={parsedPreview} />
                <MapStatsPanel
                  stats={computeStatsFromAwbwTiles(
                    parsedPreview.tiles,
                    parsedPreview.width,
                    parsedPreview.height
                  )}
                />
              </div>
            )}
          {mapMode === "default" && defaultMapState && (
            <div className="space-y-3">
              <GameStateMinimap state={defaultMapState} />
              {defaultMapStats && <MapStatsPanel stats={defaultMapStats} />}
            </div>
          )}

          {awbwError && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
              {awbwError}
            </p>
          )}

          {/* Deploy Forces CTA */}
          <button
            onClick={handleLaunch}
            disabled={loading}
            className="w-full bg-red-500 hover:bg-red-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-4 rounded-xl text-lg uppercase tracking-widest transition-colors"
          >
            {loading ? "Loading…" : "DEPLOY FORCES ▶"}
          </button>

          {/* Back */}
          <div className="flex justify-start pt-1">
            <button
              onClick={() => setStep(2)}
              className="text-gray-500 hover:text-gray-900 text-lg font-semibold transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      {/* Bottom status bar */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm font-mono text-gray-400 uppercase tracking-widest">
        <span>{STEP_LABELS[step]}</span>
        <span>{step + 1} / 4</span>
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

  // Apply turn-1 income to the first player so all players collect income
  // before their first turn (matching Advance Wars rules).
  if (state.players.length > 0) {
    state = applyIncome(state, state.players[0].id);
  }

  return state;
}

function getNextUnitId(state: GameState): [number, GameState] {
  const id = state.next_unit_id;
  return [id, { ...state, next_unit_id: id + 1 }];
}
