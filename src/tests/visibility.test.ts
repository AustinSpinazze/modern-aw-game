/**
 * @file Vitest: {@link ../game/visibility} fog-of-war grids.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeVisibility } from "../game/visibility";
import * as dataLoader from "../game/dataLoader";
import { makeState, addTestUnit, setTerrain } from "./fixtures";

// Mock getUnitData to return a simple 2-vision unit
vi.mock("../game/dataLoader", () => ({
  getUnitData: vi.fn(),
  getTerrainData: vi.fn(),
  loadGameData: vi.fn(),
}));

const mockUnitData = {
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
  vi.mocked(dataLoader.getUnitData).mockReturnValue(mockUnitData as any);
});

describe("computeVisibility", () => {
  it("returns null when fog_of_war is false", () => {
    const state = makeState(5, 5, { fogOfWar: false });
    expect(computeVisibility(state, 0)).toBeNull();
  });

  it("reveals tiles within vision radius of own unit", () => {
    let state = makeState(5, 5, { fogOfWar: true });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2 });

    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    // Unit at (2,2) with vision 2 — (2,2) and adjacent tiles visible
    expect(vis![2][2]).toBe(true); // unit's own tile
    expect(vis![2][3]).toBe(true); // 1 tile right
    expect(vis![2][4]).toBe(true); // 2 tiles right (edge of vision)
    expect(vis![1][1]).toBe(true); // diagonal (distance 2 — manhattan, so visible)
  });

  it("does not reveal tiles beyond vision radius", () => {
    let state = makeState(7, 7, { fogOfWar: true });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 });

    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    // Distance 3 from (3,3) is beyond vision 2
    expect(vis![3][0]).toBe(false); // (0,3) is distance 3
    expect(vis![0][3]).toBe(false); // (3,0) is distance 3
  });

  it("does not reveal enemy units to player 0 outside vision", () => {
    let state = makeState(7, 7, { fogOfWar: true });
    // Enemy unit at far corner — not visible to player 0 (no ally near it)
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 6, y: 6 });
    // Player 0 has no units → nothing visible
    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    expect(vis![6][6]).toBe(false);
  });

  it("skips loaded units for vision computation", () => {
    let state = makeState(5, 5, { fogOfWar: true });
    // Loaded unit should not contribute vision
    state = addTestUnit(state, {
      id: 1,
      unit_type: "infantry",
      owner_id: 0,
      x: 2,
      y: 2,
      is_loaded: true,
    });
    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    // All tiles should be dark since the only unit is loaded
    expect(vis![2][2]).toBe(false);
  });

  it("forests only visible from adjacent tiles", () => {
    let state = makeState(7, 7, { fogOfWar: true });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 });
    // Forest at distance 2
    state = setTerrain(state, 3, 1, "forest");

    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    // (3,1) is distance 2 from (3,3) but is forest → NOT visible (forest blocks at dist>1)
    expect(vis![1][3]).toBe(false);
    // (3,2) is distance 1 forest → visible
    state = setTerrain(state, 3, 2, "forest");
    const vis2 = computeVisibility(state, 0);
    expect(vis2![2][3]).toBe(true); // distance 1 forest IS visible
  });

  it("ally vision is shared within same team", () => {
    let state = makeState(9, 9, { fogOfWar: true });
    // Two allied units (same team 0) at opposite sides
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 8, y: 8 });

    const vis = computeVisibility(state, 0);
    expect(vis).not.toBeNull();
    // Both corners visible to player 0
    expect(vis![0][0]).toBe(true);
    expect(vis![8][8]).toBe(true);
    // Middle should be dark (neither unit reaches it)
    expect(vis![4][4]).toBe(false);
  });
});
