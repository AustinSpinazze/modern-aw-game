import { describe, it, expect, vi, beforeEach } from "vitest";
import { findPath, getReachableTiles, manhattanDistance } from "../game/pathfinding";
import * as dataLoader from "../game/data-loader";
import { makeState, addTestUnit, setTerrain } from "./fixtures";

vi.mock("../game/data-loader", () => ({
  getUnitData: vi.fn(),
  getTerrainData: vi.fn(),
  loadGameData: vi.fn(),
}));

const plainsTerrain = {
  name: "Plains",
  defense_stars: 1,
  movement_costs: { foot: 1, mech: 1, tires: 2, tread: 1, air: 1, ship: -1, trans: -1, pipe: -1 },
  can_capture: false,
  can_produce: [],
  can_build_trench: false,
  can_build_fob: false,
};

const mountainTerrain = {
  ...plainsTerrain,
  name: "Mountain",
  movement_costs: { foot: 2, mech: 1, tires: -1, tread: -1, air: 1, ship: -1, trans: -1, pipe: -1 },
};

const seaTerrain = {
  ...plainsTerrain,
  name: "Sea",
  movement_costs: { foot: -1, mech: -1, tires: -1, tread: -1, air: 1, ship: 1, trans: 1, pipe: -1 },
};

const infantryUnit = {
  name: "Infantry",
  vision: 2,
  move_points: 3,
  move_type: "foot",
  weapons: [],
  cost: 1000,
  can_capture: true,
  special_actions: [],
  domain: "land",
};

beforeEach(() => {
  vi.mocked(dataLoader.getUnitData).mockReturnValue(infantryUnit as any);
  vi.mocked(dataLoader.getTerrainData).mockReturnValue(plainsTerrain as any);
});

describe("manhattanDistance", () => {
  it("calculates correctly", () => {
    expect(manhattanDistance(0, 0, 3, 4)).toBe(7);
    expect(manhattanDistance(2, 2, 2, 2)).toBe(0);
    expect(manhattanDistance(1, 3, 4, 0)).toBe(6);
  });
});

describe("findPath", () => {
  it("returns empty array when source equals destination", () => {
    const state = makeState(5, 5);
    const unit = { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2 };
    const s = addTestUnit(state, unit);
    const path = findPath(
      s,
      {
        ...unit,
        hp: 10,
        has_moved: false,
        has_acted: false,
        ammo: {},
        cargo: [],
        is_loaded: false,
      } as any,
      2,
      2
    );
    // Destination == source, returns single-element or empty
    expect(path.length).toBeLessThanOrEqual(1);
  });

  it("finds a direct horizontal path", () => {
    const state = makeState(5, 5);
    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 };
    const s = addTestUnit(state, unitDef);
    const unit = s.units[1];
    const path = findPath(s, unit, 3, 0);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 }); // starts at unit position
    expect(path[path.length - 1]).toEqual({ x: 3, y: 0 }); // ends at destination
  });

  it("returns empty when destination is out of move range", () => {
    const state = makeState(10, 10);
    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 };
    const s = addTestUnit(state, unitDef);
    const unit = s.units[1];
    // Infantry move_points=3, destination is 9 tiles away
    const path = findPath(s, unit, 9, 0);
    expect(path).toEqual([]);
  });

  it("navigates around impassable terrain", () => {
    let state = makeState(5, 5);
    // Block the direct path at (1,0), (1,1) with sea (impassable for foot)
    state = setTerrain(state, 1, 0, "sea");
    state = setTerrain(state, 1, 1, "sea");
    vi.mocked(dataLoader.getTerrainData).mockImplementation((type: string) => {
      if (type === "sea") return seaTerrain as any;
      return plainsTerrain as any;
    });

    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 };
    state = addTestUnit(state, unitDef);
    const unit = state.units[1];

    // Can't reach (2,0) directly through (1,0) which is sea
    // Would need to go around via row 2+ but that's more than 3 move points
    const path = findPath(state, unit, 2, 0);
    // Path should avoid sea tiles
    if (path.length > 0) {
      for (const step of path) {
        const tile = state.tiles[step.y][step.x];
        expect(tile.terrain_type).not.toBe("sea");
      }
    }
  });
});

describe("getReachableTiles", () => {
  it("returns all tiles within move range", () => {
    const state = makeState(7, 7);
    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 };
    const s = addTestUnit(state, unitDef);
    const unit = s.units[1];

    const reachable = getReachableTiles(s, unit);
    // move_points=3, all plains → all tiles within manhattan distance 3
    expect(reachable.length).toBeGreaterThan(0);

    // No tile should be beyond move range (distance > move_points)
    for (const tile of reachable) {
      const dist = manhattanDistance(unit.x, unit.y, tile.x, tile.y);
      expect(dist).toBeLessThanOrEqual(infantryUnit.move_points);
    }
  });

  it("does not include the unit's starting tile", () => {
    const state = makeState(5, 5);
    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2 };
    const s = addTestUnit(state, unitDef);
    const unit = s.units[1];

    const reachable = getReachableTiles(s, unit);
    expect(reachable.some((t) => t.x === 2 && t.y === 2)).toBe(false);
  });

  it("respects fog visibility mask", () => {
    const state = makeState(7, 7);
    const unitDef = { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 };
    const s = addTestUnit(state, unitDef);
    const unit = s.units[1];

    // Visibility mask: only (3,3) and directly adjacent tiles visible
    const visibility: boolean[][] = Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => manhattanDistance(3, 3, x, y) <= 1)
    );

    const reachable = getReachableTiles(s, unit, visibility);
    // All reachable tiles should be visible
    for (const tile of reachable) {
      expect(visibility[tile.y][tile.x]).toBe(true);
    }
  });
});
