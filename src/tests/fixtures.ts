/**
 * **Test fixtures**: minimal {@link GameState} builders without loading `public/data` JSON.
 */

import type { GameState, UnitState, TileState, PlayerState } from "../game/types";
import {
  createGameState,
  createUnit,
  createTile,
  createPlayer,
  addUnit,
  initializeMap,
} from "../game/game-state";

/** Build a minimal 2-player game state with a blank map. */
export function makeState(mapWidth = 5, mapHeight = 5, opts?: { fogOfWar?: boolean }): GameState {
  let state = createGameState({
    match_id: "test",
    match_seed: 42,
    fog_of_war: opts?.fogOfWar ?? false,
    players: [
      createPlayer({ id: 0, team: 0, controller_type: "human" }),
      createPlayer({ id: 1, team: 1, controller_type: "heuristic" }),
    ],
  });
  state = initializeMap(state, mapWidth, mapHeight);
  return state;
}

/** Add a unit to a state. */
export function addTestUnit(
  state: GameState,
  partial: Partial<UnitState> & { id: number; unit_type: string; owner_id: number }
): GameState {
  return addUnit(state, createUnit({ x: 0, y: 0, hp: 10, ...partial }));
}

/** Set terrain type for a tile. */
export function setTerrain(
  state: GameState,
  x: number,
  y: number,
  terrain_type: string,
  extra?: Partial<TileState>
): GameState {
  const row = state.tiles[y].map((t, tx) => (tx === x ? { ...t, terrain_type, ...extra } : t));
  const tiles = state.tiles.map((r, ty) => (ty === y ? row : r));
  return { ...state, tiles };
}
