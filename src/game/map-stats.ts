/**
 * Map analytics: building/terrain counts for previews (match setup, editor) from AWBW tiles or
 * a live {@link GameState}.
 */

import type { GameState } from "./types";
import { mapAwbwTile } from "./awbw-import";

export interface MapStats {
  width: number;
  height: number;
  playerCount: number;
  buildings: Record<string, { neutral: number; players: Record<number, number> }>;
  terrain: Record<string, number>;
}

const BUILDING_TYPES = new Set(["hq", "city", "factory", "airport", "port"]);

export function computeStatsFromAwbwTiles(
  tiles: number[][],
  width: number,
  height: number
): MapStats {
  const terrain: Record<string, number> = {};
  const buildings: Record<string, { neutral: number; players: Record<number, number> }> = {};
  const playersFound = new Set<number>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = tiles[y]?.[x] ?? 1;
      const result = mapAwbwTile(id);
      const t = result.terrain;

      if (BUILDING_TYPES.has(t)) {
        if (!buildings[t]) buildings[t] = { neutral: 0, players: {} };
        if (result.owner < 0) {
          buildings[t].neutral++;
        } else {
          buildings[t].players[result.owner] = (buildings[t].players[result.owner] ?? 0) + 1;
          playersFound.add(result.owner);
        }
      } else {
        terrain[t] = (terrain[t] ?? 0) + 1;
      }
    }
  }

  return {
    width,
    height,
    playerCount: playersFound.size,
    buildings,
    terrain,
  };
}

export function computeStatsFromGameState(state: GameState): MapStats {
  const terrain: Record<string, number> = {};
  const buildings: Record<string, { neutral: number; players: Record<number, number> }> = {};
  const playersFound = new Set<number>();

  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = state.tiles[y]?.[x];
      if (!tile) continue;
      const t = tile.terrain_type;

      if (BUILDING_TYPES.has(t)) {
        if (!buildings[t]) buildings[t] = { neutral: 0, players: {} };
        if (tile.owner_id < 0) {
          buildings[t].neutral++;
        } else {
          buildings[t].players[tile.owner_id] = (buildings[t].players[tile.owner_id] ?? 0) + 1;
          playersFound.add(tile.owner_id);
        }
      } else {
        terrain[t] = (terrain[t] ?? 0) + 1;
      }
    }
  }

  return {
    width: state.map_width,
    height: state.map_height,
    playerCount: playersFound.size,
    buildings,
    terrain,
  };
}
