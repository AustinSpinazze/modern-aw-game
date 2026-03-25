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

// Minimal binary min-heap for A* open set (keyed by f score)
class MinHeap {
  private heap: PathNode[] = [];

  push(node: PathNode): void {
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  pop(): PathNode | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].f <= this.heap[i].f) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1,
        r = 2 * i + 2;
      if (l < n && this.heap[l].f < this.heap[smallest].f) smallest = l;
      if (r < n && this.heap[r].f < this.heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// Find path from unit position to (destX, destY). Returns [] if unreachable.
export function findPath(state: GameState, unit: UnitState, destX: number, destY: number): Vec2[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [];
  const moveType = unitData.move_type;
  const movePoints = unitData.move_points;

  const start: PathNode = {
    x: unit.x,
    y: unit.y,
    g: 0,
    h: heuristic(unit.x, unit.y, destX, destY),
    f: heuristic(unit.x, unit.y, destX, destY),
    parent: null,
  };

  const open = new MinHeap();
  open.push(start);

  // Best g cost seen for each coordinate
  const gScore = new Map<string, number>();
  gScore.set(`${unit.x},${unit.y}`, 0);

  // Best PathNode per coordinate (to reconstruct path)
  const bestNode = new Map<string, PathNode>();
  bestNode.set(`${unit.x},${unit.y}`, start);

  const closedSet = new Set<string>();

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = `${current.x},${current.y}`;

    if (closedSet.has(currentKey)) continue; // stale entry
    closedSet.add(currentKey);

    if (current.x === destX && current.y === destY) {
      return reconstructPath(current);
    }

    const neighbors: Vec2[] = [
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= state.map_width || n.y < 0 || n.y >= state.map_height) continue;
      const nKey = `${n.x},${n.y}`;
      if (closedSet.has(nKey)) continue;

      const tile = getTile(state, n.x, n.y);
      if (!tile) continue;

      const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
      if (!isPassable(terrainType, moveType)) continue;

      const moveCost = getMovementCost(terrainType, moveType);
      const newG = current.g + moveCost;
      if (newG > movePoints) continue;

      // Enemy units always block movement regardless of domain (AW rule)
      const blockingUnit = getUnitAt(state, n.x, n.y);
      if (blockingUnit && blockingUnit.owner_id !== unit.owner_id) continue;

      const prevG = gScore.get(nKey);
      if (prevG !== undefined && prevG <= newG) continue;

      gScore.set(nKey, newG);
      const h = heuristic(n.x, n.y, destX, destY);
      const neighbor: PathNode = { x: n.x, y: n.y, g: newG, h, f: newG + h, parent: current };
      bestNode.set(nKey, neighbor);
      open.push(neighbor);
    }
  }

  return [];
}

export function isDestinationReachable(
  state: GameState,
  unit: UnitState,
  destX: number,
  destY: number
): boolean {
  return findPath(state, unit, destX, destY).length > 0;
}

// BFS flood-fill to get all reachable tile positions (not including start).
// Optional visibility map: when provided, tiles not visible are excluded.
export function getReachableTiles(
  state: GameState,
  unit: UnitState,
  visibility?: boolean[][]
): Vec2[] {
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

      // Enemy units always block movement regardless of domain (AW rule)
      const blockingUnit = getUnitAt(state, nx, ny);
      if (blockingUnit && blockingUnit.owner_id !== unit.owner_id) continue;

      // Fog: skip tiles not visible to the moving unit's player
      if (visibility && !visibility[ny][nx]) continue;

      const nkey = `${nx},${ny}`;
      const nPrev = visited.get(nkey);
      if (nPrev === undefined || nPrev > newCost) {
        frontier.push([nx, ny, newCost]);
      }
    }
  }

  return reachable;
}

// All tiles within weapon attack range from a given position.
// Optional visibility map: when provided, only visible tiles are returned.
export function getAttackableTiles(
  state: GameState,
  unit: UnitState,
  fromX: number,
  fromY: number,
  weaponIndex = 0,
  visibility?: boolean[][]
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
          if (!visibility || visibility[ty][tx]) {
            result.push({ x: tx, y: ty });
          }
        }
      }
    }
  }
  return result;
}
