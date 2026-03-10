// Fog-of-war visibility computation.
// Pure function — no side effects, no Pixi imports.
//
// Rules (AWBW-style):
//   • Each non-loaded unit reveals tiles within its vision radius (Manhattan distance).
//   • Owned properties (any tile with owner_id === playerId) reveal their own tile + 1 ring.
//   • Forest tiles are only visible from within 1 tile, regardless of viewer vision.
//   • Submerged submarines are only visible from adjacent tiles (distance ≤ 1).
//   • If fog_of_war is false, returns null (caller treats null as "all visible").

import type { GameState } from "./types";
import { getUnitData } from "./data-loader";

/** Returns a [height][width] boolean grid: true = tile is visible to playerId.
 *  Returns null when fog is disabled — callers treat null as all-visible. */
export function computeVisibility(state: GameState, playerId: number): boolean[][] | null {
  if (!state.fog_of_war) return null;

  const W = state.map_width;
  const H = state.map_height;

  // Allocate fully-false grid
  const visible: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));

  // Collect ally player IDs (same team = share vision)
  const observingPlayer = state.players.find((p) => p.id === playerId);
  const allyIds = new Set<number>();
  if (observingPlayer) {
    for (const p of state.players) {
      if (p.team === observingPlayer.team) allyIds.add(p.id);
    }
  } else {
    allyIds.add(playerId);
  }

  // Property vision: owned properties reveal within 1 tile
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = state.tiles[y][x];
      if (allyIds.has(tile.owner_id)) {
        floodVision(x, y, 1, visible, state);
      }
    }
  }

  // Unit vision
  for (const unit of Object.values(state.units)) {
    if (!allyIds.has(unit.owner_id)) continue;
    if (unit.is_loaded) continue;
    const unitData = getUnitData(unit.unit_type);
    if (!unitData) continue;
    floodVision(unit.x, unit.y, unitData.vision, visible, state);
  }

  // Post-process: submerged submarines are hidden unless an ally is adjacent
  for (const unit of Object.values(state.units)) {
    if (unit.is_submerged && !allyIds.has(unit.owner_id)) {
      // Only visible if an ally unit is within 1 tile
      let allyAdjacent = false;
      for (const ally of Object.values(state.units)) {
        if (!allyIds.has(ally.owner_id) || ally.is_loaded) continue;
        if (Math.abs(ally.x - unit.x) + Math.abs(ally.y - unit.y) <= 1) {
          allyAdjacent = true;
          break;
        }
      }
      if (!allyAdjacent) {
        visible[unit.y][unit.x] = false;
      }
    }
  }

  return visible;
}

/** Flood-fills visibility from (cx, cy) up to `range` Manhattan distance.
 *  Forest tiles can only be seen from distance ≤ 1. */
function floodVision(
  cx: number,
  cy: number,
  range: number,
  visible: boolean[][],
  state: GameState
): void {
  const W = state.map_width;
  const H = state.map_height;

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > range) continue;
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;

      // Forest tiles: only visible from adjacent range (≤ 1)
      const tile = state.tiles[ty][tx];
      if (tile.terrain_type === "forest" && dist > 1) continue;

      visible[ty][tx] = true;
    }
  }
}
