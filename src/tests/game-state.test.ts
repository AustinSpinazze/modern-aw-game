import { describe, it, expect } from "vitest";
import {
  createGameState,
  createUnit,
  createTile,
  createPlayer,
  addUnit,
  removeUnit,
  updateUnit,
  getUnit,
  getUnitAt,
  getTile,
  getCurrentPlayer,
  initializeMap,
  duplicateState,
} from "../game/game-state";

describe("createGameState", () => {
  it("has sensible defaults", () => {
    const s = createGameState();
    expect(s.fog_of_war).toBe(false);
    expect(s.turn_number).toBe(1);
    expect(s.phase).toBe("action");
    expect(s.winner_id).toBe(-1);
  });

  it("applies partial overrides", () => {
    const s = createGameState({ fog_of_war: true, turn_number: 5 });
    expect(s.fog_of_war).toBe(true);
    expect(s.turn_number).toBe(5);
  });
});

describe("unit CRUD", () => {
  it("addUnit / getUnit / removeUnit", () => {
    let s = createGameState({ players: [createPlayer({ id: 0 })] });
    const unit = createUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 3 });
    s = addUnit(s, unit);

    expect(getUnit(s, 1)).toEqual(unit);
    expect(getUnit(s, 999)).toBeNull();

    s = removeUnit(s, 1);
    expect(getUnit(s, 1)).toBeNull();
  });

  it("updateUnit patches fields without mutation", () => {
    let s = createGameState({ players: [createPlayer({ id: 0 })] });
    const unit = createUnit({ id: 1, unit_type: "tank", owner_id: 0, hp: 10 });
    s = addUnit(s, unit);

    const original = getUnit(s, 1)!;
    s = updateUnit(s, 1, { hp: 7 });

    expect(getUnit(s, 1)!.hp).toBe(7);
    expect(original.hp).toBe(10); // immutable — original unchanged
  });
});

describe("getUnitAt", () => {
  it("finds unit by position", () => {
    let s = createGameState({ players: [createPlayer({ id: 0 })] });
    s = initializeMap(s, 5, 5);
    const unit = createUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 3 });
    s = addUnit(s, unit);

    expect(getUnitAt(s, 2, 3)).toEqual(unit);
    expect(getUnitAt(s, 0, 0)).toBeNull();
  });

  it("ignores loaded units", () => {
    let s = createGameState({ players: [createPlayer({ id: 0 })] });
    s = initializeMap(s, 5, 5);
    const unit = createUnit({
      id: 1,
      unit_type: "infantry",
      owner_id: 0,
      x: 2,
      y: 3,
      is_loaded: true,
    });
    s = addUnit(s, unit);
    expect(getUnitAt(s, 2, 3)).toBeNull();
  });
});

describe("getTile", () => {
  it("returns null for out-of-bounds", () => {
    const s = createGameState({ map_width: 3, map_height: 3 });
    expect(getTile(s, -1, 0)).toBeNull();
    expect(getTile(s, 3, 0)).toBeNull();
    expect(getTile(s, 0, 3)).toBeNull();
  });
});

describe("initializeMap", () => {
  it("creates a tiles grid of correct dimensions", () => {
    const s = initializeMap(createGameState(), 4, 6);
    expect(s.tiles).toHaveLength(6);
    expect(s.tiles[0]).toHaveLength(4);
  });

  it("all tiles default to plains with no owner", () => {
    const s = initializeMap(createGameState(), 3, 3);
    for (const row of s.tiles) {
      for (const tile of row) {
        expect(tile.terrain_type).toBe("plains");
        expect(tile.owner_id).toBe(-1);
      }
    }
  });
});

describe("duplicateState", () => {
  it("produces a deep clone (mutations don't leak)", () => {
    const s = createGameState({ turn_number: 1 });
    const clone = duplicateState(s);
    clone.turn_number = 99;
    expect(s.turn_number).toBe(1);
  });
});

describe("getCurrentPlayer", () => {
  it("returns the player at current_player_index", () => {
    const p0 = createPlayer({ id: 0 });
    const p1 = createPlayer({ id: 1 });
    const s = createGameState({ players: [p0, p1], current_player_index: 1 });
    expect(getCurrentPlayer(s)).toEqual(p1);
  });

  it("returns null when players array is empty", () => {
    const s = createGameState({ players: [] });
    expect(getCurrentPlayer(s)).toBeNull();
  });
});
