// Pre-game lobby: configure players, map, and match rules.

import { useState } from "react";
import type { ControllerType, GameState } from "../game/types";
import { createGameState, createPlayer, createUnit, initializeMap, addUnit, updateTile } from "../game/game-state";
import { generateMatchSeed } from "../game/rng";
import { loadGameData } from "../game/data-loader";
import { parseAwbwMapText, importAwbwMap } from "../game/awbw-import";
import { useGameStore } from "../store/game-store";

interface PlayerConfig {
  controllerType: ControllerType;
  modelId: string;
}

interface MatchConfig {
  startingFunds: number;
  incomeMultiplier: number; // multiplier on terrain income (1 = normal, 2 = double, etc.)
  luck: "off" | "normal" | "high";
  maxTurns: number; // -1 = unlimited
}

interface MatchSetupProps {
  onMatchStart: () => void;
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
  off:    { min: 0,    max: 0    },
  normal: { min: 0,    max: 0.10 },
  high:   { min: 0,    max: 0.20 },
};

export default function MatchSetup({ onMatchStart }: MatchSetupProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { controllerType: "human",    modelId: "" },
    { controllerType: "heuristic", modelId: "" },
  ]);
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [awbwText, setAwbwText] = useState("");
  const [awbwError, setAwbwError] = useState("");
  const [awbwPreview, setAwbwPreview] = useState<{ width: number; height: number } | null>(null);
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
        setAwbwError("No player properties found on map. Need at least one HQ/factory/city with an owner.");
        return;
      }
      // Apply starting funds + config to imported map players
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

  const playerColors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white">Modern AW</h1>
          <p className="text-gray-400 text-sm mt-1">Configure your match</p>
        </div>

        <div className="p-6 space-y-5">
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
                  onChange={(e) => updatePlayerConfig(i, { controllerType: e.target.value as ControllerType })}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                >
                  <option value="human">Human</option>
                  <option value="heuristic">Heuristic AI</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">GPT (OpenAI)</option>
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
                  <p className="text-xs text-gray-500 mb-2">Multiplier on base property income (default: ¥1,000/property)</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "×½  (¥500)", value: 0.5 },
                      { label: "×1  (¥1k)",  value: 1   },
                      { label: "×1.5 (¥1.5k)", value: 1.5 },
                      { label: "×2  (¥2k)",  value: 2   },
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
                  <p className="text-xs text-gray-500 mb-2">Random variance added to each attack roll</p>
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
                      { label: "20 turns",  value: 20 },
                      { label: "30 turns",  value: 30 },
                      { label: "50 turns",  value: 50 },
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
                  <span>Funds: <span className="text-yellow-300 font-mono">¥{config.startingFunds.toLocaleString()}</span></span>
                  <span>Income: <span className="text-green-300">×{config.incomeMultiplier}</span></span>
                  <span>Luck: <span className="text-purple-300 capitalize">{config.luck}</span></span>
                  <span>Turns: <span className="text-orange-300">{config.maxTurns < 0 ? "∞" : config.maxTurns}</span></span>
                </div>
              </div>
            )}
          </div>

          {/* AWBW Import */}
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
                    setAwbwPreview(mapData.width > 0 ? { width: mapData.width, height: mapData.height } : null);
                  } catch {
                    setAwbwPreview(null);
                  }
                } else {
                  setAwbwPreview(null);
                }
              }}
              placeholder="Paste AWBW map CSV (comma-separated tile IDs, one row per line)"
              className="w-full mt-2 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono h-20 resize-y"
            />
            {awbwPreview && (
              <p className="text-green-400 text-xs mt-1">
                Map detected: {awbwPreview.width}×{awbwPreview.height} tiles
              </p>
            )}
            {awbwError && (
              <p className="text-red-400 text-xs mt-1">{awbwError}</p>
            )}
            <button
              onClick={handleAwbwImport}
              disabled={loading}
              className="mt-2 w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white font-medium py-2 rounded transition-colors text-sm"
            >
              {loading ? "Importing…" : "Import & Start"}
            </button>
          </div>
        </div>

        {/* Start */}
        <div className="px-6 py-4 border-t border-gray-700">
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? "Loading…" : "Start Match"}
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
    // Forests — scattered clusters
    [2, 3, "forest"], [3, 3, "forest"], [4, 4, "forest"],
    [W - 3, H - 4, "forest"], [W - 4, H - 4, "forest"], [W - 5, H - 5, "forest"],
    [10, 3, "forest"], [11, 4, "forest"],

    // Mountains — central range
    [8, 5, "mountain"], [9, 5, "mountain"], [8, 6, "mountain"],
    [W - 7, H - 6, "mountain"], [W - 8, H - 6, "mountain"],

    // Roads — vertical road connecting both sides
    [6, 0, "road"], [6, 1, "road"], [6, 2, "road"], [6, 3, "road"],
    [6, 4, "road"], [6, 5, "road"], [6, 6, "road"], [6, 7, "road"],
    // Horizontal road
    [7, 7, "road"], [8, 7, "road"], [9, 7, "road"], [10, 7, "road"],
    [11, 7, "road"], [12, 7, "road"], [13, 7, "road"],
    // P2 side road
    [13, 8, "road"], [13, 9, "road"], [13, 10, "road"],

    // ── Water features (right coast) ────────────────────────────────────
    ...(Array.from({ length: H }, (_, row) => [W - 1, row, "sea"] as [number, number, string])),
    ...(Array.from({ length: H }, (_, row) => [W - 2, row, "shoal"] as [number, number, string])),
    [W - 1, 9, "reef"],
    [W - 4, 3, "river"], [W - 3, 3, "river"], [W - 2, 3, "river"],
    [W - 4, 7, "bridge"],

    // ── Water features (bottom edge) ────────────────────────────────────
    [0, H - 1, "sea"], [1, H - 1, "sea"], [2, H - 1, "sea"],
    [0, H - 2, "shoal"], [1, H - 2, "shoal"], [2, H - 2, "shoal"],
    [3, H - 1, "shoal"], [4, H - 1, "shoal"],
  ];

  for (const [x, y, t] of terrainPatches) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      state = updateTile(state, x, y, { terrain_type: t });
    }
  }

  // ── Player bases ────────────────────────────────────────────────────
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

  // ── Neutral properties ──────────────────────────────────────────────
  state = updateTile(state, 9, 2, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 5, 9, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 10, 10, { terrain_type: "factory", owner_id: -1 });

  // ── FOB showcase ───────
  state = updateTile(state, 4, 5, { has_fob: true, fob_hp: 15 });

  // Starting units
  const startingUnits: Array<{ unitType: string; ownerId: number; x: number; y: number }> = [
    { unitType: "infantry", ownerId: 0, x: 1, y: 3 },
    { unitType: "infantry", ownerId: 0, x: 2, y: 3 },
    { unitType: "tank",     ownerId: 0, x: 3, y: 2 },
  ];

  if (playerConfigs.length >= 2) {
    startingUnits.push(
      { unitType: "infantry", ownerId: 1, x: W - 5, y: H - 3 },
      { unitType: "infantry", ownerId: 1, x: W - 6, y: H - 3 },
      { unitType: "tank",     ownerId: 1, x: W - 5, y: H - 4 }
    );
  }

  for (const u of startingUnits) {
    const [id, s] = getNextUnitId(state);
    state = s;
    state = addUnit(state, createUnit({
      id,
      unit_type: u.unitType,
      owner_id: u.ownerId,
      x: u.x,
      y: u.y,
    }));
  }

  return state;
}

function getNextUnitId(state: GameState): [number, GameState] {
  const id = state.next_unit_id;
  return [id, { ...state, next_unit_id: id + 1 }];
}
