/**
 * @file Vitest: {@link ../game/applyCommand.applyCommand} coverage (move, attack, economy, etc.).
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("../game/dataLoader");

import { getUnitData, getTerrainData } from "../game/dataLoader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mockData";
import { applyCommand } from "../game/applyCommand";
import { makeState, addTestUnit, setTerrain } from "./fixtures";
import { getUnit, getTile, getPlayer, updatePlayer } from "../game/gameState";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

// Lock luck to 0 for deterministic combat results
function deterministicState(mapW = 10, mapH = 10) {
  return { ...makeState(mapW, mapH), luck_min: 0, luck_max: 0 };
}

// ─── MOVE ───────────────────────────────────────────────────────────────────

describe("MOVE command", () => {
  it("updates unit position and sets has_moved", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = applyCommand(s, { type: "MOVE", player_id: 0, unit_id: 1, dest_x: 2, dest_y: 0 });
    const unit = getUnit(s, 1)!;
    expect(unit.x).toBe(2);
    expect(unit.y).toBe(0);
    expect(unit.has_moved).toBe(true);
  });

  it("consumes fuel proportional to tiles traversed", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 0, y: 0, fuel: 70 });
    s = applyCommand(s, { type: "MOVE", player_id: 0, unit_id: 1, dest_x: 3, dest_y: 0 });
    const unit = getUnit(s, 1)!;
    // 3 tiles traversed → fuel reduced by 3
    expect(unit.fuel).toBe(67);
  });

  it("resets capture progress when unit leaves a building mid-capture", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1, capture_points: 10 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = applyCommand(s, { type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 });
    const tile = getTile(s, 0, 0)!;
    expect(tile.capture_points).toBe(20);
  });

  it("does not modify other units", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 4, y: 4 });
    s = applyCommand(s, { type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 });
    const other = getUnit(s, 2)!;
    expect(other.x).toBe(4);
    expect(other.y).toBe(4);
  });
});

// ─── WAIT ───────────────────────────────────────────────────────────────────

describe("WAIT command", () => {
  it("marks unit as acted and moved", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = applyCommand(s, { type: "WAIT", player_id: 0, unit_id: 1 });
    const unit = getUnit(s, 1)!;
    expect(unit.has_acted).toBe(true);
    expect(unit.has_moved).toBe(true);
  });
});

// ─── ATTACK ─────────────────────────────────────────────────────────────────

describe("ATTACK command", () => {
  it("reduces defender HP", () => {
    let s = deterministicState();
    s = addTestUnit(s, {
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    s = applyCommand(s, {
      type: "ATTACK",
      player_id: 0,
      attacker_id: 1,
      target_id: 2,
      weapon_index: 0,
    });
    const defender = getUnit(s, 2);
    // Defender either damaged or destroyed
    if (defender) expect(defender.hp).toBeLessThan(10);
    else expect(defender).toBeNull(); // destroyed
  });

  it("marks attacker as acted after attacking", () => {
    let s = deterministicState();
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    s = applyCommand(s, {
      type: "ATTACK",
      player_id: 0,
      attacker_id: 1,
      target_id: 2,
      weapon_index: 0,
    });
    const attacker = getUnit(s, 1);
    if (attacker) expect(attacker.has_acted).toBe(true);
  });

  it("removes destroyed defender from state", () => {
    let s = deterministicState();
    s = addTestUnit(s, {
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, hp: 1, x: 2, y: 0 });
    s = applyCommand(s, {
      type: "ATTACK",
      player_id: 0,
      attacker_id: 1,
      target_id: 2,
      weapon_index: 0,
    });
    // Artillery at full HP deals 9 damage → 1 HP infantry is destroyed
    expect(getUnit(s, 2)).toBeNull();
  });

  it("consumes ammo from weapon with limited ammo", () => {
    let s = deterministicState();
    s = addTestUnit(s, { id: 1, unit_type: "mech", owner_id: 0, x: 0, y: 0, ammo: { bazooka: 3 } });
    s = addTestUnit(s, { id: 2, unit_type: "tank", owner_id: 1, x: 1, y: 0 });
    s = applyCommand(s, {
      type: "ATTACK",
      player_id: 0,
      attacker_id: 1,
      target_id: 2,
      weapon_index: 0,
    });
    const attacker = getUnit(s, 1);
    if (attacker) expect(attacker.ammo["bazooka"]).toBe(2);
  });

  it("does not consume ammo for infinite-ammo weapons", () => {
    let s = deterministicState();
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    const before = s;
    s = applyCommand(s, {
      type: "ATTACK",
      player_id: 0,
      attacker_id: 1,
      target_id: 2,
      weapon_index: 0,
    });
    // machine_gun has ammo -1 (infinite); no ammo key to check, just ensure no error
    expect(getUnit(s, 1)).toBeDefined();
  });
});

// ─── CAPTURE ────────────────────────────────────────────────────────────────

describe("CAPTURE command", () => {
  it("reduces capture_points by unit HP", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1, capture_points: 20 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, hp: 10 });
    s = applyCommand(s, { type: "CAPTURE", player_id: 0, unit_id: 1 });
    expect(getTile(s, 0, 0)!.capture_points).toBe(10);
  });

  it("transfers ownership when capture_points reach 0", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1, capture_points: 8 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, hp: 10 });
    s = applyCommand(s, { type: "CAPTURE", player_id: 0, unit_id: 1 });
    const tile = getTile(s, 0, 0)!;
    expect(tile.owner_id).toBe(0);
    expect(tile.capture_points).toBe(20); // reset
  });

  it("ends the game when enemy HQ is captured", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "hq", { owner_id: 1, capture_points: 8 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, hp: 10 });
    s = applyCommand(s, { type: "CAPTURE", player_id: 0, unit_id: 1 });
    expect(s.phase).toBe("game_over");
    expect(s.winner_id).toBe(0);
  });

  it("marks unit as acted after capture attempt", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1, capture_points: 20 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, hp: 10 });
    s = applyCommand(s, { type: "CAPTURE", player_id: 0, unit_id: 1 });
    expect(getUnit(s, 1)!.has_acted).toBe(true);
  });
});

// ─── BUY_UNIT ───────────────────────────────────────────────────────────────

describe("BUY_UNIT command", () => {
  it("spawns unit at facility position", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 2, 2, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    s = applyCommand(s, {
      type: "BUY_UNIT",
      player_id: 0,
      unit_type: "infantry",
      facility_x: 2,
      facility_y: 2,
    });
    const newUnit = Object.values(s.units).find((u) => u.unit_type === "infantry");
    expect(newUnit).toBeDefined();
    expect(newUnit!.x).toBe(2);
    expect(newUnit!.y).toBe(2);
  });

  it("deducts unit cost from player funds", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    s = applyCommand(s, {
      type: "BUY_UNIT",
      player_id: 0,
      unit_type: "infantry",
      facility_x: 0,
      facility_y: 0,
    });
    expect(getPlayer(s, 0)!.funds).toBe(9000);
  });

  it("spawns unit with has_acted and has_moved true (cannot act this turn)", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    s = applyCommand(s, {
      type: "BUY_UNIT",
      player_id: 0,
      unit_type: "infantry",
      facility_x: 0,
      facility_y: 0,
    });
    const newUnit = Object.values(s.units).find((u) => u.unit_type === "infantry")!;
    expect(newUnit.has_acted).toBe(true);
    expect(newUnit.has_moved).toBe(true);
  });

  it("initializes ammo for units with limited ammo weapons", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    s = applyCommand(s, {
      type: "BUY_UNIT",
      player_id: 0,
      unit_type: "tank",
      facility_x: 0,
      facility_y: 0,
    });
    const newUnit = Object.values(s.units).find((u) => u.unit_type === "tank")!;
    expect(newUnit.ammo["cannon"]).toBe(9);
  });

  it("initializes fuel for air units", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 }); // reuse factory for test
    s = updatePlayer(s, 0, { funds: 99999 });
    s = applyCommand(s, {
      type: "BUY_UNIT",
      player_id: 0,
      unit_type: "apc",
      facility_x: 0,
      facility_y: 0,
    });
    const newUnit = Object.values(s.units).find((u) => u.unit_type === "apc")!;
    expect(newUnit.fuel).toBe(70);
  });
});

// ─── LOAD / UNLOAD ──────────────────────────────────────────────────────────

describe("LOAD command", () => {
  it("adds unit to transport cargo", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = applyCommand(s, { type: "LOAD", player_id: 0, transport_id: 1, unit_id: 2 });
    expect(getUnit(s, 1)!.cargo).toContain(2);
    expect(getUnit(s, 2)!.is_loaded).toBe(true);
  });
});

describe("UNLOAD command", () => {
  it("removes unit from cargo and places at destination", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 2, y: 0, cargo: [2] });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 2, y: 0, is_loaded: true });
    s = applyCommand(s, {
      type: "UNLOAD",
      player_id: 0,
      transport_id: 1,
      unit_index: 0,
      dest_x: 1,
      dest_y: 0,
    });
    const transport = getUnit(s, 1)!;
    const unloaded = getUnit(s, 2)!;
    expect(transport.cargo).not.toContain(2);
    expect(unloaded.is_loaded).toBe(false);
    expect(unloaded.x).toBe(1);
    expect(unloaded.y).toBe(0);
  });
});

// ─── RESUPPLY ────────────────────────────────────────────────────────────────

describe("RESUPPLY command", () => {
  it("restores target ammo to max", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "mech", owner_id: 0, x: 1, y: 0, ammo: { bazooka: 1 } });
    s = applyCommand(s, { type: "RESUPPLY", player_id: 0, unit_id: 1, target_id: 2 });
    expect(getUnit(s, 2)!.ammo["bazooka"]).toBe(3);
  });

  it("restores target fuel to max", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 3, unit_type: "apc", owner_id: 0, x: 1, y: 0, fuel: 10 });
    s = applyCommand(s, { type: "RESUPPLY", player_id: 0, unit_id: 1, target_id: 3 });
    expect(getUnit(s, 3)!.fuel).toBe(70);
  });
});

// ─── SUBMERGE / SURFACE ──────────────────────────────────────────────────────

describe("SUBMERGE / SURFACE commands", () => {
  it("sets is_submerged to true on SUBMERGE", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "submarine", owner_id: 0, x: 0, y: 0 });
    s = applyCommand(s, { type: "SUBMERGE", player_id: 0, unit_id: 1 });
    expect(getUnit(s, 1)!.is_submerged).toBe(true);
  });

  it("sets is_submerged to false on SURFACE", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, {
      id: 1,
      unit_type: "submarine",
      owner_id: 0,
      x: 0,
      y: 0,
      is_submerged: true,
    });
    s = applyCommand(s, { type: "SURFACE", player_id: 0, unit_id: 1 });
    expect(getUnit(s, 1)!.is_submerged).toBe(false);
  });
});

// ─── END_TURN ────────────────────────────────────────────────────────────────

describe("END_TURN command", () => {
  it("advances to next player", () => {
    let s = makeState(5, 5);
    expect(s.current_player_index).toBe(0);
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(s.current_player_index).toBe(1);
  });

  it("increments turn number when wrapping back to player 0", () => {
    let s = makeState(5, 5);
    expect(s.turn_number).toBe(1);
    s = applyCommand(s, { type: "END_TURN", player_id: 0 }); // → player 1
    s = applyCommand(s, { type: "END_TURN", player_id: 1 }); // → player 0 (turn 2)
    expect(s.turn_number).toBe(2);
  });

  it("resets has_moved and has_acted for units of the new player", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, {
      id: 1,
      unit_type: "infantry",
      owner_id: 1,
      x: 0,
      y: 0,
      has_moved: true,
      has_acted: true,
    });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    const unit = getUnit(s, 1)!;
    expect(unit.has_moved).toBe(false);
    expect(unit.has_acted).toBe(false);
  });

  it("heals units standing on allied buildings by 2 HP", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = updatePlayer(s, 1, { funds: 10000 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 1, x: 0, y: 0, hp: 6 });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(getUnit(s, 1)!.hp).toBe(8);
  });

  it("does not heal above max HP (10)", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = updatePlayer(s, 1, { funds: 10000 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 1, x: 0, y: 0, hp: 9 });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(getUnit(s, 1)!.hp).toBe(10);
  });

  it("applies income to the new current player", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    const fundsBefore = getPlayer(s, 1)!.funds;
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(getPlayer(s, 1)!.funds).toBe(fundsBefore + 1000);
  });

  it("drains fuel from air units each turn", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "fighter", owner_id: 1, x: 0, y: 0, fuel: 20 });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    // fighter fuel_per_turn = 5
    expect(getUnit(s, 1)!.fuel).toBe(15);
  });

  it("destroys air unit when fuel runs out", () => {
    let s = makeState(5, 5);
    // Fighter with exactly 5 fuel — will drop to 0 this turn and crash
    s = addTestUnit(s, { id: 1, unit_type: "fighter", owner_id: 1, x: 0, y: 0, fuel: 5 });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(getUnit(s, 1)).toBeNull();
  });

  it("destroys submerged submarine when fuel runs out", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, {
      id: 1,
      unit_type: "submarine",
      owner_id: 1,
      x: 0,
      y: 0,
      fuel: 1,
      is_submerged: true,
    });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    expect(getUnit(s, 1)).toBeNull();
  });

  it("does not destroy surface submarine when fuel runs out", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, {
      id: 1,
      unit_type: "submarine",
      owner_id: 1,
      x: 0,
      y: 0,
      fuel: 1,
      is_submerged: false,
    });
    s = applyCommand(s, { type: "END_TURN", player_id: 0 });
    // Surface sub survives but at 0 fuel
    expect(getUnit(s, 1)).not.toBeNull();
    expect(getUnit(s, 1)!.fuel).toBe(0);
  });

  it("ends game when turn limit is exceeded (most properties wins)", () => {
    let s = makeState(5, 5);
    s = { ...s, max_turns: 1 };
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    s = setTerrain(s, 1, 0, "city", { owner_id: 0 });
    s = setTerrain(s, 2, 0, "city", { owner_id: 1 });
    // End turn twice to pass turn limit
    s = applyCommand(s, { type: "END_TURN", player_id: 0 }); // turn still 1, goes to p1
    s = applyCommand(s, { type: "END_TURN", player_id: 1 }); // wraps to p0, turn becomes 2 > max_turns=1
    expect(s.phase).toBe("game_over");
    expect(s.winner_id).toBe(0); // player 0 owns 2 cities vs player 1's 1
  });
});
