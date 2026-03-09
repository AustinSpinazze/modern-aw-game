/**
 * Minimal game state for E2E tests: one turn to attack and capture.
 * Map 5×5: P1 infantry (1,1) and (0,1), P2 infantry (2,1), neutral city (1,2).
 * - Attack: select (1,1), same-tile pending, click (2,1) enemy.
 * - Capture: select (0,1), click (1,2), then Capture in menu.
 */

import type { GameState } from "./types";
import {
  createGameState,
  createPlayer,
  createUnit,
  initializeMap,
  addUnit,
  updateTile,
} from "./game-state";

const W = 5;
const H = 5;

export function buildTestScenarioState(): GameState {
  let state = createGameState({
    match_id: "test-scenario",
    match_seed: 42,
    luck_min: 0,
    luck_max: 0,
    income_multiplier: 1,
    max_turns: -1,
  });
  state = initializeMap(state, W, H);

  state = {
    ...state,
    players: [
      createPlayer({ id: 0, team: 0, funds: 5000, controller_type: "human" }),
      createPlayer({ id: 1, team: 1, funds: 5000, controller_type: "heuristic" }),
    ],
    next_unit_id: 10,
  };

  // Plains everywhere, neutral city at (1,2)
  state = updateTile(state, 1, 2, {
    terrain_type: "city",
    owner_id: -1,
    capture_points: 20,
  });

  // P1 infantry at (1,1) and (0,1)
  state = addUnit(
    state,
    createUnit({
      id: 1,
      unit_type: "infantry",
      owner_id: 0,
      x: 1,
      y: 1,
      hp: 10,
      has_moved: false,
      has_acted: false,
      ammo: { "0": 99 },
      cargo: [],
      is_loaded: false,
    })
  );
  state = addUnit(
    state,
    createUnit({
      id: 2,
      unit_type: "infantry",
      owner_id: 0,
      x: 0,
      y: 1,
      hp: 10,
      has_moved: false,
      has_acted: false,
      ammo: { "0": 99 },
      cargo: [],
      is_loaded: false,
    })
  );

  // P2 infantry at (2,1)
  state = addUnit(
    state,
    createUnit({
      id: 3,
      unit_type: "infantry",
      owner_id: 1,
      x: 2,
      y: 1,
      hp: 10,
      has_moved: false,
      has_acted: false,
      ammo: { "0": 99 },
      cargo: [],
      is_loaded: false,
    })
  );

  return state;
}
