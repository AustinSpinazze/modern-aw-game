import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("../game/data-loader");

import { getUnitData, getTerrainData } from "../game/data-loader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mock-data";
import {
  calculateIncome,
  applyIncome,
  deductFunds,
  canAfford,
  getProducibleUnits,
  getUnitCost,
} from "../game/economy";
import { makeState, setTerrain } from "./fixtures";
import { updatePlayer } from "../game/game-state";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

describe("calculateIncome", () => {
  it("returns 0 for empty map", () => {
    const s = makeState(3, 3);
    expect(calculateIncome(s, 0)).toBe(0);
  });

  it("sums income from all owned properties", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    s = setTerrain(s, 1, 0, "factory", { owner_id: 0 });
    expect(calculateIncome(s, 0)).toBe(2000); // 1000 + 1000
  });

  it("ignores properties owned by other players", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = setTerrain(s, 1, 0, "city", { owner_id: 0 });
    expect(calculateIncome(s, 0)).toBe(1000);
    expect(calculateIncome(s, 1)).toBe(1000);
  });

  it("ignores neutral tiles (owner_id -1)", () => {
    let s = makeState(5, 5);
    // default tiles have no owner_id set — plain has income 0 anyway
    s = setTerrain(s, 0, 0, "city"); // no owner override — default owner_id from createTile
    expect(calculateIncome(s, 0)).toBe(0);
  });
});

describe("applyIncome", () => {
  it("adds calculated income to player funds", () => {
    let s = makeState(5, 5);
    s = updatePlayer(s, 0, { funds: 5000 });
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    const result = applyIncome(s, 0);
    expect(result.players[0].funds).toBe(6000);
  });

  it("applies income_multiplier", () => {
    let s = makeState(5, 5);
    s = { ...s, income_multiplier: 2 };
    s = updatePlayer(s, 0, { funds: 0 });
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    const result = applyIncome(s, 0);
    expect(result.players[0].funds).toBe(2000);
  });

  it("does not modify other players funds", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    const before = s.players[1].funds;
    const result = applyIncome(s, 0);
    expect(result.players[1].funds).toBe(before);
  });
});

describe("deductFunds", () => {
  it("deducts the specified amount", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 10000 });
    const result = deductFunds(s, 0, 3000)!;
    expect(result.players[0].funds).toBe(7000);
  });

  it("returns null when funds are insufficient", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 1000 });
    expect(deductFunds(s, 0, 5000)).toBeNull();
  });

  it("allows deducting exact balance", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 5000 });
    const result = deductFunds(s, 0, 5000)!;
    expect(result.players[0].funds).toBe(0);
  });

  it("returns null for unknown player", () => {
    const s = makeState();
    expect(deductFunds(s, 99, 100)).toBeNull();
  });
});

describe("canAfford", () => {
  it("returns true when funds >= unit cost", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 7000 });
    expect(canAfford(s, 0, "tank")).toBe(true);
  });

  it("returns false when funds < unit cost", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 500 });
    expect(canAfford(s, 0, "infantry")).toBe(false);
  });

  it("returns true for exact cost", () => {
    let s = makeState();
    s = updatePlayer(s, 0, { funds: 1000 });
    expect(canAfford(s, 0, "infantry")).toBe(true);
  });
});

describe("getUnitCost", () => {
  it("returns cost from unit data", () => {
    expect(getUnitCost("infantry")).toBe(1000);
    expect(getUnitCost("tank")).toBe(7000);
  });

  it("returns 0 for unknown unit", () => {
    expect(getUnitCost("nonexistent")).toBe(0);
  });
});

describe("getProducibleUnits", () => {
  it("returns can_produce list for a factory", () => {
    const units = getProducibleUnits("factory");
    expect(units).toContain("infantry");
    expect(units).toContain("tank");
  });

  it("returns empty array for non-producing terrain", () => {
    expect(getProducibleUnits("city")).toEqual([]);
  });

  it("returns empty array for unknown terrain", () => {
    expect(getProducibleUnits("unknown_terrain")).toEqual([]);
  });
});
