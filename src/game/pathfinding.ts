// A* pathfinding and movement utilities.
// Direct port of pathfinding.gd

import type { GameState, UnitState, Vec2 } from "./types";
import { getTile, getUnitAt } from "./game-state";
import { getTerrainData, getUnitData } from "./data-loader";

// Movement cost for a terrain type + move type pair. -1 = impassable.
export function getMovementCost(terrainType: string, moveType: string): number {
  const terrain = getTerrainData(terrainType);
  if (!terrain) return -1; // unknown terrain = impassable
  const cost = terrain.movement_costs[moveType];
  return cost ?? -1; // missing move type = impassable
}

export function isPassable(terrainType: string, moveType: string): boolean {
  return getMovementCost(terrainType, moveType) > 0;
}

export function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

function heuristic(x1: number, y1: number, x2: number, y2: number): number {
  return manhattanDistance(x1, y1, x2, y2);
}

function reconstructPath(goal: PathNode): Vec2[] {
  const path: Vec2[] = [];
  let current: PathNode | null = goal;
  while (current) {
    path.unshift({ x: current.x, y: current.y });
    current = current.parent;
  }
  return path;
}

// Find path from unit position to (destX, destY). Returns [] if unreachable.
export function findPath(state: GameState, unit: UnitState, destX: number, destY: number): Vec2[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [];
  const moveType = unitData.move_type;
  const movePoints = unitData.move_points;

  const start: PathNode = { x: unit.x, y: unit.y, g: 0, h: 0, f: 0, parent: null };
  start.h = heuristic(start.x, start.y, destX, destY);
  start.f = start.h;

  const openSet: PathNode[] = [start];
  const closedSet = new Set<string>();

  while (openSet.length > 0) {
    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) bestIdx = i;
    }
    const current = openSet[bestIdx];

    if (current.x === destX && current.y === destY) {
      return reconstructPath(current);
    }

    openSet.splice(bestIdx, 1);
    closedSet.add(`${current.x},${current.y}`);

    const neighbors: Vec2[] = [
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= state.map_width || n.y < 0 || n.y >= state.map_height) continue;
      if (closedSet.has(`${n.x},${n.y}`)) continue;

      const tile = getTile(state, n.x, n.y);
      if (!tile) continue;

      const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
      if (!isPassable(terrainType, moveType)) continue;

      const moveCost = getMovementCost(terrainType, moveType);
      const newG = current.g + moveCost;
      if (newG > movePoints) continue;

      // Enemy blocking check
      const blockingUnit = getUnitAt(state, n.x, n.y);
      if (blockingUnit && blockingUnit.owner_id !== unit.owner_id) {
        const blockData = getUnitData(blockingUnit.unit_type);
        if (moveType !== "air" && blockData?.domain !== "air") continue;
      }

      const existing = openSet.find((o) => o.x === n.x && o.y === n.y);
      if (existing) {
        if (newG < existing.g) {
          existing.g = newG;
          existing.f = newG + existing.h;
          existing.parent = current;
        }
      } else {
        const neighbor: PathNode = {
          x: n.x,
          y: n.y,
          g: newG,
          h: heuristic(n.x, n.y, destX, destY),
          f: 0,
          parent: current,
        };
        neighbor.f = neighbor.g + neighbor.h;
        openSet.push(neighbor);
      }
    }
  }

  return [];
}

export function isDestinationReachable(state: GameState, unit: UnitState, destX: number, destY: number): boolean {
  return findPath(state, unit, destX, destY).length > 0;
}

// BFS flood-fill to get all reachable tile positions (not including start)
export function getReachableTiles(state: GameState, unit: UnitState): Vec2[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [];
  const moveType = unitData.move_type;
  const movePoints = unitData.move_points;

  const reachable: Vec2[] = [];
  const visited = new Map<string, number>(); // key -> lowest cost

  // frontier: [x, y, cost]
  const frontier: [number, number, number][] = [[unit.x, unit.y, 0]];

  while (frontier.length > 0) {
    const [cx, cy, cost] = frontier.shift()!;
    const key = `${cx},${cy}`;
    const prev = visited.get(key);
    if (prev !== undefined && prev <= cost) continue;
    visited.set(key, cost);

    if (cx !== unit.x || cy !== unit.y) {
      reachable.push({ x: cx, y: cy });
    }

    for (const [nx, ny] of [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ] as [number, number][]) {
      if (nx < 0 || nx >= state.map_width || ny < 0 || ny >= state.map_height) continue;

      const tile = getTile(state, nx, ny);
      if (!tile) continue;

      const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
      if (!isPassable(terrainType, moveType)) continue;

      const moveCost = getMovementCost(terrainType, moveType);
      const newCost = cost + moveCost;
      if (newCost > movePoints) continue;

      const blockingUnit = getUnitAt(state, nx, ny);
      if (blockingUnit && blockingUnit.owner_id !== unit.owner_id) {
        const blockData = getUnitData(blockingUnit.unit_type);
        if (moveType !== "air" && blockData?.domain !== "air") continue;
      }

      const nkey = `${nx},${ny}`;
      const nPrev = visited.get(nkey);
      if (nPrev === undefined || nPrev > newCost) {
        frontier.push([nx, ny, newCost]);
      }
    }
  }

  return reachable;
}

// All tiles within weapon attack range from a given position
export function getAttackableTiles(
  state: GameState,
  unit: UnitState,
  fromX: number,
  fromY: number,
  weaponIndex = 0
): Vec2[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData || weaponIndex >= unitData.weapons.length) return [];

  const weapon = unitData.weapons[weaponIndex];
  const minRange = weapon.min_range;
  const maxRange = weapon.max_range;

  const result: Vec2[] = [];
  for (let dy = -maxRange; dy <= maxRange; dy++) {
    for (let dx = -maxRange; dx <= maxRange; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist >= minRange && dist <= maxRange) {
        const tx = fromX + dx;
        const ty = fromY + dy;
        if (tx >= 0 && tx < state.map_width && ty >= 0 && ty < state.map_height) {
          result.push({ x: tx, y: ty });
        }
      }
    }
  }
  return result;
}
