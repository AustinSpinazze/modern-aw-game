/**
 * Movement: terrain costs per move type, A* paths, reachable tiles for UI highlights, and attack
 * range helpers. Consumes {@link ./dataLoader} terrain + unit move types; no rendering.
 */

import type { GameState, UnitState, Vec2 } from "./types";
import { getTile, getUnitAt } from "./gameState";
import { getTerrainData, getUnitData } from "./dataLoader";

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

/** Max tiles of movement cost allowed: min(move_points, current fuel) when the unit tracks fuel. */
export function getEffectiveMoveBudget(state: GameState, unit: UnitState): number {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return 0;
  let budget = unitData.move_points;
  if (unitData.fuel !== undefined) {
    const currentFuel = unit.fuel ?? unitData.fuel;
    budget = Math.min(budget, Math.max(0, currentFuel));
  }
  return budget;
}

// Find path from unit position to (destX, destY). Returns [] if unreachable.
export function findPath(state: GameState, unit: UnitState, destX: number, destY: number): Vec2[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [];
  const moveType = unitData.move_type;
  const movePoints = getEffectiveMoveBudget(state, unit);

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

      if (!isPassable(tile.terrain_type, moveType)) continue;

      const moveCost = getMovementCost(tile.terrain_type, moveType);
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
  const movePoints = getEffectiveMoveBudget(state, unit);

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
      // In AW, you can pass through friendly units but NOT stop on them,
      // unless merging (same type, target damaged) or loading into a transport.
      const occupant = getUnitAt(state, cx, cy);
      if (!occupant || occupant.id === unit.id) {
        reachable.push({ x: cx, y: cy });
      } else if (occupant.owner_id === unit.owner_id) {
        // Merge target: same type, at least one unit damaged
        const canMerge =
          occupant.unit_type === unit.unit_type && (occupant.hp < 10 || unit.hp < 10);
        // Load into transport: occupant is a transport that can carry this unit
        const occupantData = getUnitData(occupant.unit_type);
        const tInfo = occupantData?.transport;
        let canLoad = false;
        if (tInfo && occupant.cargo.length < (tInfo.capacity ?? 1)) {
          const unitTags = unitData.tags ?? [];
          const allowed = tInfo.allowed_tags ?? [];
          const allowedVehicle = tInfo.allowed_vehicle_tags ?? [];
          canLoad =
            unitTags.some((t) => allowed.includes(t)) ||
            unitTags.some((t) => allowedVehicle.includes(t));
        }
        if (canMerge || canLoad) {
          reachable.push({ x: cx, y: cy });
        }
      }
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

      if (!isPassable(tile.terrain_type, moveType)) continue;

      const moveCost = getMovementCost(tile.terrain_type, moveType);
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
