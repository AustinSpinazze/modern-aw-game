/**
 * @file Vitest: round-trip `stateToDict` / `stateFromDict` serialization.
 */

import { describe, it, expect } from "vitest";
import { stateFromDict, stateToDict, createGameState, createPlayer } from "../game/game-state";

describe("stateFromDict", () => {
  it("returns null for non-object input", () => {
    expect(stateFromDict(null)).toBeNull();
    expect(stateFromDict("string")).toBeNull();
    expect(stateFromDict(42)).toBeNull();
  });

  it("returns null for incomplete objects", () => {
    expect(stateFromDict({})).toBeNull();
    expect(stateFromDict({ match_id: "x" })).toBeNull();
  });

  it("round-trips a valid GameState", () => {
    const original = createGameState({
      match_id: "test-match",
      match_seed: 12345,
      map_width: 3,
      map_height: 3,
      players: [createPlayer({ id: 0 })],
      tiles: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({
          terrain_type: "plains",
          owner_id: -1,
          capture_points: 20,
          has_trench: false,
          has_fob: false,
          fob_hp: 0,
        }))
      ),
      units: {},
      attack_counter: 0,
      phase: "action",
      winner_id: -1,
      next_unit_id: 1,
      command_log: [],
      luck_min: 0,
      luck_max: 0.1,
    });

    const dict = stateToDict(original);
    const restored = stateFromDict(dict);

    expect(restored).not.toBeNull();
    expect(restored!.match_id).toBe("test-match");
    expect(restored!.match_seed).toBe(12345);
    expect(restored!.fog_of_war).toBe(false);
  });

  it("defaults fog_of_war to false for old saves without the field", () => {
    const base = createGameState({
      match_id: "old-save",
      match_seed: 1,
      map_width: 1,
      map_height: 1,
      players: [createPlayer({ id: 0 })],
      tiles: [
        [
          {
            terrain_type: "plains",
            owner_id: -1,
            capture_points: 20,
            has_trench: false,
            has_fob: false,
            fob_hp: 0,
          },
        ],
      ],
      units: {},
      attack_counter: 0,
      phase: "action",
      winner_id: -1,
      next_unit_id: 1,
      command_log: [],
      luck_min: 0,
      luck_max: 0.1,
    });
    const dict = stateToDict(base) as Record<string, unknown>;
    delete dict.fog_of_war; // simulate old save without this field
    const restored = stateFromDict(dict);
    expect(restored).not.toBeNull();
    expect(restored!.fog_of_war).toBe(false);
  });
});
