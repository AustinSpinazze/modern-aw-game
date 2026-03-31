/**
 * AWBW map **import**: integer tile grids / CSV → {@link GameState} + internal terrain keys.
 * Remaps arbitrary AWBW factions to four players; building ID order varies by tile ID range.
 *
 * Tile ID reference: WarsWorld `map-importer-utilities.ts`
 * https://github.com/WarsWorld/WarsWorld/blob/main/src/server/tools/map-importer-utilities.ts
 */

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTANT: AWBW TILE ID QUIRKS (for future AI sessions)
// ═══════════════════════════════════════════════════════════════════════════════
//
// 1. AWBW supports MANY custom factions beyond the original 4 (OS, BM, GE, YC).
//    Community-created factions like Grey Sky, Black Hole, Amber Blaze, etc. have
//    their own tile ID ranges. We only have 4 spritesheets, so ALL factions get
//    remapped sequentially to players 0-3.
//
// 2. Building ID ranges and their orders are INCONSISTENT across AWBW:
//    - Standard factions (34-100): Each faction has 5 buildings
//      - Orange Star (38-42): city, factory, airport, port, hq
//      - Blue Moon (43-47): city, factory, airport, port, hq
//      - Grey Sky (86-90): city, factory, airport, port, hq
//    - Extended range (117-126): factory, airport, city, hq, port (DIFFERENT ORDER!)
//    - Extended range (149+): airport, city, factory, port, hq (ANOTHER ORDER!)
//
// 3. If maps render buildings incorrectly (e.g., port instead of HQ), check:
//    - Which tile IDs are in the map CSV
//    - What building order that ID range uses
//    - Adjust the buildingTypes array in mapAwbwTile() accordingly
//
// 4. We enforce a MAX 4 PLAYER limit. Maps with 5+ factions throw an error.
//
// 5. Neutral buildings (owner -1) use the "neutral" spritesheet.
//    Owned buildings (owner 0-3) use faction-specific animated spritesheets.
//
// ═══════════════════════════════════════════════════════════════════════════════

import type { GameState } from "./types";
import { createGameState, createPlayer, createUnit, createTile, addUnit } from "./game-state";
import { generateMatchSeed } from "./rng";

export interface AwbwMapData {
  width: number;
  height: number;
  tiles: number[][]; // [row][col] of AWBW tile IDs
}

interface TileResult {
  terrain: string;
  owner: number; // -1 = neutral/none, 0+ = player slot
  variant?: string; // For roads/rivers/bridges with directional info
}

// ─── AWBW Tile ID Mapping ───────────────────────────────────────────────────
// Based on WarsWorld's official mapping

const AWBW_TILE_MAP: Record<number, TileResult> = {
  // Basic terrain
  1: { terrain: "plains", owner: -1 },
  2: { terrain: "mountain", owner: -1 },
  3: { terrain: "forest", owner: -1 },

  // Rivers (4-14) - with directional variants
  4: { terrain: "river", owner: -1, variant: "right-left" },
  5: { terrain: "river", owner: -1, variant: "top-bottom" },
  6: { terrain: "river", owner: -1, variant: "top-right-bottom-left" },
  7: { terrain: "river", owner: -1, variant: "right-bottom" },
  8: { terrain: "river", owner: -1, variant: "bottom-left" },
  9: { terrain: "river", owner: -1, variant: "top-left" },
  10: { terrain: "river", owner: -1, variant: "top-right" },
  11: { terrain: "river", owner: -1, variant: "right-bottom-left" },
  12: { terrain: "river", owner: -1, variant: "top-bottom-left" },
  13: { terrain: "river", owner: -1, variant: "top-right-left" },
  14: { terrain: "river", owner: -1, variant: "top-right-bottom" },

  // Roads (15-25) - with directional variants
  15: { terrain: "road", owner: -1, variant: "right-left" },
  16: { terrain: "road", owner: -1, variant: "top-bottom" },
  17: { terrain: "road", owner: -1, variant: "top-right-bottom-left" },
  18: { terrain: "road", owner: -1, variant: "right-bottom" },
  19: { terrain: "road", owner: -1, variant: "bottom-left" },
  20: { terrain: "road", owner: -1, variant: "top-left" },
  21: { terrain: "road", owner: -1, variant: "top-right" },
  22: { terrain: "road", owner: -1, variant: "right-bottom-left" },
  23: { terrain: "road", owner: -1, variant: "top-bottom-left" },
  24: { terrain: "road", owner: -1, variant: "top-right-left" },
  25: { terrain: "road", owner: -1, variant: "top-right-bottom" },

  // Bridges (26-27)
  26: { terrain: "bridge", owner: -1, variant: "right-left" },
  27: { terrain: "bridge", owner: -1, variant: "top-bottom" },

  // Water terrain
  28: { terrain: "sea", owner: -1 },
  29: { terrain: "shoal", owner: -1 },
  30: { terrain: "shoal", owner: -1 },
  31: { terrain: "shoal", owner: -1 },
  32: { terrain: "shoal", owner: -1 },
  33: { terrain: "reef", owner: -1 },

  // Neutral properties
  34: { terrain: "city", owner: -1 },
  35: { terrain: "factory", owner: -1 },
  36: { terrain: "airport", owner: -1 },
  37: { terrain: "port", owner: -1 },

  // Orange Star (player 0)
  38: { terrain: "city", owner: 0 },
  39: { terrain: "factory", owner: 0 },
  40: { terrain: "airport", owner: 0 },
  41: { terrain: "port", owner: 0 },
  42: { terrain: "hq", owner: 0 },

  // Blue Moon (player 1)
  43: { terrain: "city", owner: 1 },
  44: { terrain: "factory", owner: 1 },
  45: { terrain: "airport", owner: 1 },
  46: { terrain: "port", owner: 1 },
  47: { terrain: "hq", owner: 1 },

  // Green Earth (player 2)
  48: { terrain: "city", owner: 2 },
  49: { terrain: "factory", owner: 2 },
  50: { terrain: "airport", owner: 2 },
  51: { terrain: "port", owner: 2 },
  52: { terrain: "hq", owner: 2 },

  // Yellow Comet (player 3)
  53: { terrain: "city", owner: 3 },
  54: { terrain: "factory", owner: 3 },
  55: { terrain: "airport", owner: 3 },
  56: { terrain: "port", owner: 3 },
  57: { terrain: "hq", owner: 3 },

  // Red Fire (player 5 in AWBW, we map to player 4)
  81: { terrain: "city", owner: 4 },
  82: { terrain: "factory", owner: 4 },
  83: { terrain: "airport", owner: 4 },
  84: { terrain: "port", owner: 4 },
  85: { terrain: "hq", owner: 4 },

  // Grey Sky (player 6 in AWBW, we map to player 5)
  86: { terrain: "city", owner: 5 },
  87: { terrain: "factory", owner: 5 },
  88: { terrain: "airport", owner: 5 },
  89: { terrain: "port", owner: 5 },
  90: { terrain: "hq", owner: 5 },

  // Black Hole (player 4 in AWBW, we map to player 6)
  91: { terrain: "city", owner: 6 },
  92: { terrain: "factory", owner: 6 },
  93: { terrain: "airport", owner: 6 },
  94: { terrain: "port", owner: 6 },
  95: { terrain: "hq", owner: 6 },

  // Brown Desert (player 7 in AWBW)
  96: { terrain: "city", owner: 7 },
  97: { terrain: "factory", owner: 7 },
  98: { terrain: "airport", owner: 7 },
  99: { terrain: "port", owner: 7 },
  100: { terrain: "hq", owner: 7 },

  // Pipes (not in our simplified terrain, treat as plains)
  101: { terrain: "plains", owner: -1 },
  102: { terrain: "plains", owner: -1 },
  103: { terrain: "plains", owner: -1 },
  104: { terrain: "plains", owner: -1 },
  105: { terrain: "plains", owner: -1 },
  106: { terrain: "plains", owner: -1 },
  107: { terrain: "plains", owner: -1 },
  108: { terrain: "plains", owner: -1 },
  109: { terrain: "plains", owner: -1 },
  110: { terrain: "plains", owner: -1 },

  // Silos (not in our simplified terrain, treat as plains)
  111: { terrain: "plains", owner: -1 },
  112: { terrain: "plains", owner: -1 },

  // Pipe seams (not in our simplified terrain, treat as plains)
  113: { terrain: "plains", owner: -1 },
  114: { terrain: "plains", owner: -1 },
  115: { terrain: "plains", owner: -1 },
  116: { terrain: "plains", owner: -1 },

  // More player buildings (117-126)
  117: { terrain: "factory", owner: 8 },
  118: { terrain: "airport", owner: 8 },
  119: { terrain: "city", owner: 8 },
  120: { terrain: "hq", owner: 8 },
  121: { terrain: "port", owner: 8 },
  122: { terrain: "factory", owner: 9 },
  123: { terrain: "airport", owner: 9 },
  124: { terrain: "city", owner: 9 },
  125: { terrain: "hq", owner: 9 },
  126: { terrain: "port", owner: 9 },

  // Comm towers (not in our simplified terrain, treat as city)
  127: { terrain: "city", owner: 8 },
  128: { terrain: "city", owner: 6 }, // Black Hole
  129: { terrain: "city", owner: 1 }, // Blue Moon
  130: { terrain: "city", owner: 7 }, // Brown Desert
  131: { terrain: "city", owner: 2 }, // Green Earth
  132: { terrain: "city", owner: 9 },
  133: { terrain: "city", owner: -1 }, // Neutral
  134: { terrain: "city", owner: 0 }, // Orange Star
  135: { terrain: "city", owner: 4 }, // Red Fire
  136: { terrain: "city", owner: 3 }, // Yellow Comet
  137: { terrain: "city", owner: 5 }, // Grey Sky

  // Labs (not in our simplified terrain, treat as city)
  138: { terrain: "city", owner: 8 },
  139: { terrain: "city", owner: 6 },
  140: { terrain: "city", owner: 1 },
  141: { terrain: "city", owner: 7 },
  142: { terrain: "city", owner: 2 },
  143: { terrain: "city", owner: 5 },
  144: { terrain: "city", owner: 9 },
  145: { terrain: "city", owner: -1 }, // Neutral
  146: { terrain: "city", owner: 0 },
  147: { terrain: "city", owner: 4 },
  148: { terrain: "city", owner: 3 },
};

// Map an AWBW tile ID to our terrain type + owner
export function mapAwbwTile(id: number): TileResult {
  // First check the explicit mapping
  const mapped = AWBW_TILE_MAP[id];
  if (mapped) return mapped;

  // Handle extended player building ranges (149+)
  // AWBW has many custom factions with various sprite IDs
  // Based on observed patterns: offset 1=city, 2=factory, 3=port, 4=hq
  // Each player has 5 buildings in sequence
  if (id >= 149) {
    const offset = id - 149;
    const playerOffset = Math.floor(offset / 5); // Which extended player (0, 1, 2, ...)
    const buildingType = offset % 5; // Which building type (0-4)
    const owner = 10 + playerOffset; // Player 10, 11, 12, etc.

    // AWBW extended player building order (observed from map exports)
    // 149=airport, 150=city, 151=factory, 152=port, 153=hq, then repeats for next player
    const buildingTypes = ["airport", "city", "factory", "port", "hq"];
    return {
      terrain: buildingTypes[buildingType] || "city",
      owner,
    };
  }

  // Fallback: unknown tile → plains
  return { terrain: "plains", owner: -1 };
}

// ─── AWBW Unit ID Mapping ───────────────────────────────────────────────────

// AWBW pre-deployed unit IDs (500+ range)
// Unit type index = floor((id - 500) / 16)
// Army index = (id - 500) % 16
const AWBW_UNIT_MAP: Record<number, string> = {
  0: "infantry",
  1: "mech",
  2: "md_tank",
  3: "tank",
  4: "recon",
  5: "apc",
  6: "artillery",
  7: "rocket",
  8: "anti_air",
  9: "missile",
  10: "fighter",
  11: "bomber",
  12: "b_copter",
  13: "t_copter",
  // 14: "battleship" — excluded from our roster
  15: "cruiser",
  16: "lander",
  17: "submarine",
  // 18: "piperunner" — excluded
  // 19: "black_bomb" — excluded
  20: "stealth",
  21: "carrier",
  // 22: "neo_tank" — excluded
  // 23: "mega_tank" — excluded
};

function mapAwbwUnit(id: number): { unitType: string; army: number } | null {
  if (id < 500) return null;
  const offset = id - 500;
  const unitIndex = Math.floor(offset / 16);
  const army = offset % 16;
  const unitType = AWBW_UNIT_MAP[unitIndex];
  if (!unitType) return null;
  return { unitType, army };
}

// ─── Map Parsing ────────────────────────────────────────────────────────────

// Parse AWBW map text (CSV of tile IDs) into AwbwMapData
export function parseAwbwMapText(text: string): AwbwMapData {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const tiles: number[][] = [];

  for (const line of lines) {
    const row = line
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);
    if (row.length > 0) tiles.push(row);
  }

  if (tiles.length === 0) {
    return { width: 0, height: 0, tiles: [] };
  }

  const height = tiles.length;
  const width = Math.max(...tiles.map((r) => r.length));

  // Pad short rows with plains
  for (const row of tiles) {
    while (row.length < width) row.push(1);
  }

  return { width, height, tiles };
}

// Convert AwbwMapData into a GameState
export function importAwbwMap(data: AwbwMapData): GameState {
  if (data.width === 0 || data.height === 0) {
    return createGameState();
  }

  const armiesPresent = new Set<number>();
  const unitPlacements: Array<{ unitType: string; army: number; x: number; y: number }> = [];

  // First pass: build tiles and detect armies
  const tiles = [];
  for (let y = 0; y < data.height; y++) {
    const row = [];
    for (let x = 0; x < data.width; x++) {
      const awbwId = data.tiles[y][x];
      const { terrain, owner } = mapAwbwTile(awbwId);

      const tile = createTile({
        terrain_type: terrain,
        owner_id: owner,
      });
      row.push(tile);

      if (owner >= 0) {
        armiesPresent.add(owner);
      }

      // Check for pre-deployed units
      const unitInfo = mapAwbwUnit(awbwId);
      if (unitInfo) {
        unitPlacements.push({ ...unitInfo, x, y });
        armiesPresent.add(unitInfo.army);
      }
    }
    tiles.push(row);
  }

  // Create players for each detected army
  const sortedArmies = Array.from(armiesPresent).sort((a, b) => a - b);

  // Check for max player limit - we only support up to 4 players
  if (sortedArmies.length > 4) {
    throw new Error(
      `This map has ${sortedArmies.length} factions but we currently only support maps with up to 4 players. ` +
        `Please choose a different map or edit it to have 4 or fewer factions.`
    );
  }

  // Always remap AWBW armies to our player indices (0-3) sequentially
  // AWBW has many custom factions beyond the original 4, so we don't try to preserve colors
  // Player 0 = Orange Star (red), 1 = Blue Moon (blue), 2 = Green Earth (green), 3 = Yellow Comet (yellow)
  const armyToPlayer = new Map<number, number>();
  sortedArmies.slice(0, 4).forEach((army, idx) => {
    armyToPlayer.set(army, idx);
  });

  // Remap owner_ids in tiles to player indices
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const tile = tiles[y][x];
      if (tile.owner_id >= 0) {
        const mappedOwner = armyToPlayer.get(tile.owner_id);
        tiles[y][x] = {
          ...tile,
          owner_id: mappedOwner !== undefined ? mappedOwner : tile.owner_id,
        };
      }
    }
  }

  let state = createGameState({
    match_id: `awbw_import_${Date.now()}`,
    match_seed: generateMatchSeed(),
    map_width: data.width,
    map_height: data.height,
    tiles,
  });

  // Add players - use original army indices to preserve colors
  // Player 0 is always human, others are AI
  const players = sortedArmies.map((army, idx) =>
    createPlayer({
      id: armyToPlayer.get(army) ?? army,
      team: armyToPlayer.get(army) ?? army,
      funds: 0,
      controller_type: idx === 0 ? "human" : "heuristic",
    })
  );
  state = { ...state, players };

  // Place pre-deployed units
  for (const u of unitPlacements) {
    const playerId = armyToPlayer.get(u.army);
    if (playerId === undefined) continue;

    const unitId = state.next_unit_id;
    state = { ...state, next_unit_id: unitId + 1 };
    state = addUnit(
      state,
      createUnit({
        id: unitId,
        unit_type: u.unitType,
        owner_id: playerId,
        x: u.x,
        y: u.y,
      })
    );
  }

  return state;
}
