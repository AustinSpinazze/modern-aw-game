/**
 * AWBW map **export**: {@link GameState} → CSV tile ID grid compatible with AWBW-style tools.
 * Inverse direction of {@link ./awbwImport}; used when saving or sharing maps.
 */

import type { GameState } from "./types";

// ── Terrain → AWBW Tile ID mapping ──────────────────────────────────────────

// Basic terrain types (no owner)
const TERRAIN_TO_AWBW: Record<string, number> = {
  plains: 1,
  mountain: 2,
  forest: 3,
  road: 15, // horizontal road (AWBW re-autotiles)
  river: 4, // horizontal river
  bridge: 26, // horizontal bridge
  sea: 28,
  shoal: 29,
  reef: 33,
  pipe: 101, // AWBW has 101–110 for pipe shapes; 101 is a valid pipe cell for round-trip
  pipe_seam: 113,
  broken_pipe_seam: 115,
  missile_silo: 111,
  empty_silo: 112,
};

// Building type → base AWBW tile IDs per owner
// owner -1 (neutral): city=34, factory=35, airport=36, port=37
// owner 0 (OS):       city=38, factory=39, airport=40, port=41, hq=42
// owner 1 (BM):       city=43, factory=44, airport=45, port=46, hq=47
// owner 2 (GE):       city=48, factory=49, airport=50, port=51, hq=52
// owner 3 (YC):       city=53, factory=54, airport=55, port=56, hq=57

const NEUTRAL_BUILDING_IDS: Record<string, number> = {
  city: 34,
  factory: 35,
  airport: 36,
  port: 37,
};

// For owned buildings: base ID for owner 0, then +5 per owner
// Order within each owner: city, factory, airport, port, hq
const BUILDING_OFFSET: Record<string, number> = {
  city: 0,
  factory: 1,
  airport: 2,
  port: 3,
  hq: 4,
};

const OWNER_BASE = 38; // OS city starts at 38
const BUILDINGS_PER_OWNER = 5;

/** AWBW comm tower / lab IDs per owner (see {@link ./awbwImport.AWBW_TILE_MAP}). */
const COMMS_TOWER_AWBW: Record<number, number> = {
  [-1]: 133,
  0: 134,
  1: 129,
  2: 131,
  3: 136,
};

const LAB_AWBW: Record<number, number> = {
  [-1]: 145,
  0: 146,
  1: 140,
  2: 142,
  3: 148,
};

function getBuildingAwbwId(buildingType: string, ownerId: number): number {
  if (buildingType === "comms_tower") {
    return COMMS_TOWER_AWBW[ownerId] ?? COMMS_TOWER_AWBW[-1];
  }
  if (buildingType === "lab") {
    return LAB_AWBW[ownerId] ?? LAB_AWBW[-1];
  }

  if (ownerId < 0) {
    // Neutral — no HQ for neutral
    return NEUTRAL_BUILDING_IDS[buildingType] ?? 34;
  }

  const offset = BUILDING_OFFSET[buildingType];
  if (offset === undefined) return 34; // fallback to neutral city

  return OWNER_BASE + ownerId * BUILDINGS_PER_OWNER + offset;
}

// ── Unit → AWBW Unit ID mapping ─────────────────────────────────────────────
// AWBW pre-deployed units: base 500, unit_type_index * 16 + army_index

const UNIT_TYPE_INDEX: Record<string, number> = {
  infantry: 0,
  mech: 1,
  md_tank: 2,
  tank: 3,
  recon: 4,
  apc: 5,
  artillery: 6,
  rocket: 7,
  anti_air: 8,
  missile: 9,
  fighter: 10,
  bomber: 11,
  b_copter: 12,
  t_copter: 13,
  // 14: battleship in AWBW's original scheme, but we use a different index
  cruiser: 15,
  lander: 16,
  submarine: 17,
  stealth: 20,
  carrier: 21,
};

// AWBW army indices for our player IDs
const PLAYER_TO_ARMY: Record<number, number> = {
  0: 0, // Orange Star
  1: 1, // Blue Moon
  2: 2, // Green Earth
  3: 3, // Yellow Comet
};

function getUnitAwbwId(unitType: string, ownerId: number): number | null {
  const typeIndex = UNIT_TYPE_INDEX[unitType];
  if (typeIndex === undefined) return null;
  const army = PLAYER_TO_ARMY[ownerId] ?? 0;
  return 500 + typeIndex * 16 + army;
}

// ── Export function ──────────────────────────────────────────────────────────

/**
 * Convert a GameState into AWBW CSV format.
 * Each tile maps to an AWBW tile ID. Units on tiles get their own ID
 * (IDs >= 500). If a tile has both a building and a unit, the building
 * takes priority in the tile grid (AWBW encodes terrain and units
 * separately; our CSV can only hold one ID per cell).
 *
 * To preserve ALL units (including those on buildings), a `#UNITS:`
 * comment line is appended after the grid with `type,owner,x,y` entries
 * separated by `;`. The import side parses this as the authoritative
 * unit source when present, falling back to in-grid unit IDs otherwise.
 *
 * Output: one line per row (comma-separated tile IDs), then optional
 * `#UNITS:` line.
 */
export function exportToAwbwCsv(state: GameState): string {
  // Build a unit position lookup: (x,y) → UnitState
  const unitAt = new Map<string, { unitType: string; ownerId: number }>();
  for (const unit of Object.values(state.units)) {
    if (!unit.is_loaded) {
      unitAt.set(`${unit.x},${unit.y}`, { unitType: unit.unit_type, ownerId: unit.owner_id });
    }
  }

  const rows: string[] = [];

  for (let y = 0; y < state.map_height; y++) {
    const ids: number[] = [];
    for (let x = 0; x < state.map_width; x++) {
      const tile = state.tiles[y][x];
      const terrainType = tile.terrain_type;

      // Check if this is a building
      const isBuilding = [
        "city",
        "factory",
        "airport",
        "port",
        "hq",
        "comms_tower",
        "lab",
      ].includes(terrainType);

      if (isBuilding) {
        ids.push(getBuildingAwbwId(terrainType, tile.owner_id));
      } else {
        // Check for a unit on this tile
        const unit = unitAt.get(`${x},${y}`);
        if (unit) {
          const unitId = getUnitAwbwId(unit.unitType, unit.ownerId);
          if (unitId !== null) {
            ids.push(unitId);
          } else {
            // Unknown unit type — fall back to terrain
            ids.push(TERRAIN_TO_AWBW[terrainType] ?? 1);
          }
        } else {
          ids.push(TERRAIN_TO_AWBW[terrainType] ?? 1);
        }
      }
    }
    rows.push(ids.join(","));
  }

  // Append all units as a comment line so they survive the round-trip
  // even when sitting on building tiles (which the grid encodes as buildings).
  const allUnits = Object.values(state.units).filter((u) => !u.is_loaded);
  if (allUnits.length > 0) {
    const entries = allUnits.map((u) => `${u.unit_type},${u.owner_id},${u.x},${u.y}`);
    rows.push(`#UNITS:${entries.join(";")}`);
  }

  return rows.join("\n");
}
