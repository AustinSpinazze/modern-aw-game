// Pre-game lobby: configure players, map, AI providers.

import { useState } from "react";
import type { ControllerType, GameState } from "../game/types";
import { createGameState, createPlayer, createUnit, initializeMap, addUnit, updatePlayer, getTile, updateTile } from "../game/game-state";
import { generateMatchSeed } from "../game/rng";
import { loadGameData } from "../game/data-loader";
import { parseAwbwMapText, importAwbwMap } from "../game/awbw-import";
import { useGameStore } from "../store/game-store";

interface PlayerConfig {
  controllerType: ControllerType;
  modelId: string;
}

interface MatchSetupProps {
  onMatchStart: () => void;
}

const DEFAULT_MAP_WIDTH = 20;
const DEFAULT_MAP_HEIGHT = 15;

export default function MatchSetup({ onMatchStart }: MatchSetupProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { controllerType: "human", modelId: "" },
    { controllerType: "heuristic", modelId: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [awbwText, setAwbwText] = useState("");
  const [awbwError, setAwbwError] = useState("");
  const [awbwPreview, setAwbwPreview] = useState<{ width: number; height: number } | null>(null);
  const setGameState = useGameStore((s) => s.setGameState);

  const updatePlayerConfig = (index: number, patch: Partial<PlayerConfig>) => {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await loadGameData();
      const state = buildDefaultGameState(players.slice(0, playerCount));
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
      const state = importAwbwMap(mapData);
      if (state.players.length === 0) {
        setAwbwError("No player properties found on map. Need at least one HQ/factory/city with an owner.");
        return;
      }
      setGameState(state);
      onMatchStart();
    } catch (e) {
      setAwbwError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white">Modern AW</h1>
          <p className="text-gray-400 text-sm mt-1">Configure your match</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Player count */}
          <div>
            <label className="text-sm text-gray-400 uppercase tracking-wide">Players</label>
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
          <div className="space-y-3">
            {Array.from({ length: playerCount }).map((_, i) => {
              const colors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className={`font-bold w-8 ${colors[i]}`}>P{i + 1}</div>
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
              );
            })}
          </div>

          {/* AWBW Import */}
          <div>
            <label className="text-sm text-gray-400 uppercase tracking-wide">Import AWBW Map</label>
            <textarea
              value={awbwText}
              onChange={(e) => {
                const text = e.target.value;
                setAwbwText(text);
                setAwbwError("");
                // Live preview: parse dimensions from the raw text
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
              className="w-full mt-2 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono h-24 resize-y"
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
function buildDefaultGameState(playerConfigs: PlayerConfig[]): GameState {
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
      funds: 5000,
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
    // Sea — deep water (rightmost column x=19 only)
    ...(Array.from({ length: H }, (_, row) => [W - 1, row, "sea"] as [number, number, string])),

    // Shoal — full beach column (x=18), except where port/river overrides
    ...(Array.from({ length: H }, (_, row) => [W - 2, row, "shoal"] as [number, number, string])),

    // Reef — rocky formation in the sea
    [W - 1, 9, "reef"],

    // River — flowing from inland to sea
    [W - 4, 3, "river"], [W - 3, 3, "river"], [W - 2, 3, "river"],

    // Bridge — road crossing the river
    [W - 4, 7, "bridge"],

    // ── Water features (bottom edge) ────────────────────────────────────
    // Sea — deep water (bottom row)
    [0, H - 1, "sea"], [1, H - 1, "sea"], [2, H - 1, "sea"],
    // Shoal — beach transition (row above sea + edges)
    [0, H - 2, "shoal"], [1, H - 2, "shoal"], [2, H - 2, "shoal"],
    [3, H - 1, "shoal"], [4, H - 1, "shoal"],
  ];

  for (const [x, y, t] of terrainPatches) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      state = updateTile(state, x, y, { terrain_type: t });
    }
  }

  // ── Player bases ────────────────────────────────────────────────────
  // P1 (red) — top-left
  if (playerConfigs.length >= 1) {
    state = updateTile(state, 1, 1, { terrain_type: "hq", owner_id: 0 });
  }
  state = updateTile(state, 2, 1, { terrain_type: "factory", owner_id: 0 });
  state = updateTile(state, 3, 1, { terrain_type: "city", owner_id: 0 });
  state = updateTile(state, 1, 2, { terrain_type: "airport", owner_id: 0 });

  // P2 (blue) — bottom-right
  if (playerConfigs.length >= 2) {
    state = updateTile(state, W - 4, H - 2, { terrain_type: "hq", owner_id: 1 });
  }
  state = updateTile(state, W - 5, H - 2, { terrain_type: "factory", owner_id: 1 });
  state = updateTile(state, W - 6, H - 2, { terrain_type: "city", owner_id: 1 });
  state = updateTile(state, W - 4, H - 3, { terrain_type: "airport", owner_id: 1 });

  // Port — on the coast (needs adjacent sea)
  state = updateTile(state, W - 2, 6, { terrain_type: "port", owner_id: 0 });
  state = updateTile(state, 2, H - 3, { terrain_type: "port", owner_id: 1 });

  // ── Neutral properties ──────────────────────────────────────────────
  state = updateTile(state, 9, 2, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 5, 9, { terrain_type: "city", owner_id: -1 });
  state = updateTile(state, 10, 10, { terrain_type: "factory", owner_id: -1 });

  // ── FOB showcase (temporary_fob is an overlay on any terrain) ───────
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

// Helper to get next unit id inline
function getNextUnitId(state: GameState): [number, GameState] {
  const id = state.next_unit_id;
  return [id, { ...state, next_unit_id: id + 1 }];
}
