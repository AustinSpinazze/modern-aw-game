/**
 * Immutable **helpers** for {@link GameState}: factories (`createGameState`, `createUnit`, …),
 * queries (`getUnit`, `getTile`), and updates that return **new** state objects (never mutate in place).
 *
 * Central place for duplicating state and ID allocation; {@link ./applyCommand} composes these helpers.
 */

import type { GameState, PlayerState, UnitState, TileState } from "./types";
import { getUnitData } from "./dataLoader";

// ---- Factories ----

export function createPlayer(partial: Partial<PlayerState> & { id: number }): PlayerState {
  return {
    team: 0,
    funds: 0,
    is_defeated: false,
    controller_type: "human",
    controller_config: {},
    ...partial,
  };
}

export function createUnit(
  partial: Partial<UnitState> & { id: number; unit_type: string; owner_id: number }
): UnitState {
  const ud = getUnitData(partial.unit_type);
  const defaultFuel = ud?.fuel !== undefined && partial.fuel === undefined ? { fuel: ud.fuel } : {};
  return {
    x: 0,
    y: 0,
    hp: 10,
    has_moved: false,
    has_acted: false,
    ammo: {},
    cargo: [],
    is_loaded: false,
    ...defaultFuel,
    ...partial,
  };
}

export function createTile(partial?: Partial<TileState>): TileState {
  return {
    terrain_type: "plains",
    owner_id: -1,
    capture_points: 20,
    has_trench: false,
    has_fob: false,
    fob_hp: 0,
    ...partial,
  };
}

/** Options for {@link ensureMatchId} when loading a save. */
export interface EnsureMatchIdOptions {
  /** Save slot name (e.g. quicksave) — used for a stable match_id if state is missing one. */
  saveSlotName?: string;
}

/**
 * Ensures non-empty `match_id` so LLM usage analytics and logs group continued games correctly.
 * Old saves or edge cases may omit it; loaded games use a stable id per save slot.
 */
export function ensureMatchId(state: GameState, options?: EnsureMatchIdOptions): GameState {
  const mid = typeof state.match_id === "string" ? state.match_id.trim() : "";
  if (mid.length > 0) return state;
  const raw = options?.saveSlotName?.trim() || "unknown";
  const safe = raw
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 96);
  return { ...state, match_id: `match_save_${safe}` };
}

export function createGameState(partial?: Partial<GameState>): GameState {
  return {
    match_id: "",
    match_seed: 0,
    map_width: 0,
    map_height: 0,
    players: [],
    units: {},
    tiles: [],
    current_player_index: 0,
    turn_number: 1,
    attack_counter: 0,
    phase: "action",
    winner_id: -1,
    next_unit_id: 1,
    command_log: [],
    luck_min: 0.0,
    luck_max: 0.1,
    income_multiplier: 1,
    max_turns: -1,
    fog_of_war: false,
    turn_time_limit: 0,
    ...partial,
  };
}

// Initialize the tiles grid
export function initializeMap(state: GameState, width: number, height: number): GameState {
  const tiles: TileState[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileState[] = [];
    for (let x = 0; x < width; x++) {
      row.push(createTile());
    }
    tiles.push(row);
  }
  return { ...state, map_width: width, map_height: height, tiles };
}

// ---- Accessors ----

export function getTile(state: GameState, x: number, y: number): TileState | null {
  if (x < 0 || x >= state.map_width || y < 0 || y >= state.map_height) return null;
  return state.tiles[y][x];
}

export function getUnit(state: GameState, unitId: number): UnitState | null {
  return state.units[unitId] ?? null;
}

// Lazy spatial index: built once per immutable state, cached via WeakMap
const _posIndexCache = new WeakMap<GameState, Map<string, UnitState>>();

function getPositionIndex(state: GameState): Map<string, UnitState> {
  let index = _posIndexCache.get(state);
  if (!index) {
    index = new Map();
    for (const unit of Object.values(state.units)) {
      if (!unit.is_loaded) {
        index.set(`${unit.x},${unit.y}`, unit);
      }
    }
    _posIndexCache.set(state, index);
  }
  return index;
}

export function getUnitAt(state: GameState, x: number, y: number): UnitState | null {
  return getPositionIndex(state).get(`${x},${y}`) ?? null;
}

export function getPlayer(state: GameState, playerId: number): PlayerState | null {
  return state.players.find((p) => p.id === playerId) ?? null;
}

export function getCurrentPlayer(state: GameState): PlayerState | null {
  return state.players[state.current_player_index] ?? null;
}

export function getUnitsByOwner(state: GameState, ownerId: number): UnitState[] {
  return Object.values(state.units).filter((u) => u.owner_id === ownerId);
}

// ---- Mutations (return new state objects) ----

export function setTile(state: GameState, x: number, y: number, tile: TileState): GameState {
  if (x < 0 || x >= state.map_width || y < 0 || y >= state.map_height) return state;
  const newTiles = state.tiles.map((row, ry) =>
    ry === y ? row.map((t, rx) => (rx === x ? tile : t)) : row
  );
  return { ...state, tiles: newTiles };
}

export function updateTile(
  state: GameState,
  x: number,
  y: number,
  patch: Partial<TileState>
): GameState {
  const tile = getTile(state, x, y);
  if (!tile) return state;
  return setTile(state, x, y, { ...tile, ...patch });
}

export function addUnit(state: GameState, unit: UnitState): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

export function removeUnit(state: GameState, unitId: number): GameState {
  const { [unitId]: _, ...rest } = state.units;
  return { ...state, units: rest };
}

export function updateUnit(state: GameState, unitId: number, patch: Partial<UnitState>): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;
  return { ...state, units: { ...state.units, [unitId]: { ...unit, ...patch } } };
}

export function updatePlayer(
  state: GameState,
  playerId: number,
  patch: Partial<PlayerState>
): GameState {
  const players = state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
  return { ...state, players };
}

export function getNextUnitId(state: GameState): [number, GameState] {
  const id = state.next_unit_id;
  return [id, { ...state, next_unit_id: id + 1 }];
}

export function incrementAttackCounter(state: GameState): GameState {
  return { ...state, attack_counter: state.attack_counter + 1 };
}

// Deep clone (for AI working states)
export function duplicateState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

// Serialize / deserialize
export function stateToDict(state: GameState): object {
  return JSON.parse(JSON.stringify(state));
}

export function stateFromDict(data: unknown): GameState | null {
  if (typeof data !== "object" || data === null) return null;
  const s = data as Record<string, unknown>;
  if (typeof s.match_id !== "string") return null;
  if (typeof s.map_width !== "number" || typeof s.map_height !== "number") return null;
  if (!Array.isArray(s.players) || s.players.length === 0) return null;
  if (!Array.isArray(s.tiles)) return null;
  if (typeof s.units !== "object" || s.units === null) return null;
  if (typeof s.current_player_index !== "number") return null;
  if (typeof s.turn_number !== "number") return null;
  if (typeof s.attack_counter !== "number") return null;
  if (typeof s.phase !== "string") return null;
  if (typeof s.winner_id !== "number") return null;
  if (typeof s.next_unit_id !== "number") return null;
  if (typeof s.luck_min !== "number" || typeof s.luck_max !== "number") return null;
  if (typeof s.match_seed !== "number") return null;
  if (!Array.isArray(s.command_log)) return null;
  // Default new fields for backwards-compatible deserialization (non-mutating)
  return {
    ...data,
    income_multiplier: typeof s.income_multiplier === "number" ? s.income_multiplier : 1,
    max_turns: typeof s.max_turns === "number" ? s.max_turns : -1,
    fog_of_war: typeof s.fog_of_war === "boolean" ? s.fog_of_war : false,
    turn_time_limit: typeof s.turn_time_limit === "number" ? s.turn_time_limit : 0,
  } as GameState;
}
