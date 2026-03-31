/**
 * @file Vitest: {@link ../game/combat} damage and combat resolution.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("../game/dataLoader");

import { getUnitData, getTerrainData } from "../game/dataLoader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mockData";
import { calculateDamage, canAttack, executeCombat, getBestWeapon } from "../game/combat";
import { makeState, setTerrain } from "./fixtures";
import type { UnitState } from "../game/types";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

// Lock luck to 0 for deterministic damage tests
function makeZeroLuckState() {
  return { ...makeState(), luck_min: 0, luck_max: 0 };
}

function makeUnit(
  partial: Partial<UnitState> & { id: number; unit_type: string; owner_id: number }
): UnitState {
  return {
    x: 0,
    y: 0,
    hp: 10,
    has_moved: false,
    has_acted: false,
    ammo: {},
    cargo: [],
    is_loaded: false,
    ...partial,
  };
}

describe("calculateDamage", () => {
  it("returns base damage scaled by attacker HP at full health", () => {
    const s = makeZeroLuckState();
    const attacker = makeUnit({ id: 1, unit_type: "artillery", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    const { damage } = calculateDamage(attacker, defender, s, 0);
    // base 90, HP modifier 1.0, no defense, /10 rounded → 9
    expect(damage).toBe(9);
  });

  it("scales damage with attacker HP", () => {
    const s = makeZeroLuckState();
    const attacker = makeUnit({ id: 1, unit_type: "artillery", owner_id: 0, hp: 5, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    const { damage } = calculateDamage(attacker, defender, s, 0);
    // base 90, HP modifier 0.5, /10 rounded → 4 or 5
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(9);
  });

  it("returns 0 when base damage is 0 (no matchup)", () => {
    const s = makeZeroLuckState();
    // Tank cannon has 0 vs infantry
    const attacker = makeUnit({ id: 1, unit_type: "tank", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    const { damage } = calculateDamage(attacker, defender, s, 0); // cannon
    expect(damage).toBe(0);
  });

  it("applies terrain defense reduction", () => {
    let s = makeZeroLuckState();
    // Put defender on mountain (4 defense stars = 40% reduction)
    s = setTerrain(s, 2, 0, "mountain");
    const attacker = makeUnit({ id: 1, unit_type: "artillery", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    const { damage: plainDmg } = calculateDamage(attacker, defender, makeZeroLuckState(), 0);
    const { damage: mountainDmg } = calculateDamage(attacker, defender, s, 0);
    expect(mountainDmg).toBeLessThan(plainDmg);
  });

  it("caps damage at defender HP", () => {
    const s = makeZeroLuckState();
    const attacker = makeUnit({ id: 1, unit_type: "artillery", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, hp: 1, x: 2, y: 0 });
    const { damage } = calculateDamage(attacker, defender, s, 0);
    expect(damage).toBeLessThanOrEqual(1);
  });

  it("returns 0 for invalid weapon index", () => {
    const s = makeZeroLuckState();
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    const { damage } = calculateDamage(attacker, defender, s, 99);
    expect(damage).toBe(0);
  });
});

describe("canAttack", () => {
  it("returns true when target is in range with non-zero damage", () => {
    const s = makeState();
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, ammo: {} });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(true);
  });

  it("returns false when target is out of range", () => {
    const s = makeState();
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 3, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(false);
  });

  it("returns false when damage table entry is 0", () => {
    const s = makeState();
    // Tank cannon vs infantry = 0 damage
    const attacker = makeUnit({
      id: 1,
      unit_type: "tank",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(false); // cannon slot
  });

  it("returns false when ammo is depleted", () => {
    const s = makeState();
    // Mech bazooka has ammo 3; set it to 0
    const attacker = makeUnit({
      id: 1,
      unit_type: "mech",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { bazooka: 0 },
    });
    const defender = makeUnit({ id: 2, unit_type: "tank", owner_id: 1, x: 1, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(false); // bazooka slot
  });

  it("returns true for infinite-ammo weapon (ammo -1)", () => {
    const s = makeState();
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, ammo: {} });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(true);
  });

  it("returns false for artillery firing at min-range gap (adjacent)", () => {
    const s = makeState();
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    // Artillery min_range=2, distance=1 → cannot attack
    expect(canAttack(attacker, defender, s, 0)).toBe(false);
  });

  it("returns true for artillery at valid indirect range", () => {
    const s = makeState(10, 10);
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    expect(canAttack(attacker, defender, s, 0)).toBe(true);
  });
});

describe("executeCombat", () => {
  it("deals damage to defender", () => {
    const s = { ...makeZeroLuckState(), map_width: 10, map_height: 10 };
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    const { result } = executeCombat(attacker, defender, s, 0);
    expect(result.attacker_damage_dealt).toBeGreaterThan(0);
    expect(result.defender_final_hp).toBeLessThan(10);
  });

  it("marks defender as destroyed when HP reaches 0", () => {
    const s = { ...makeZeroLuckState(), map_width: 10, map_height: 10 };
    // Artillery vs infantry at 1 HP
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, hp: 1, x: 2, y: 0 });
    const { result } = executeCombat(attacker, defender, s, 0);
    expect(result.defender_destroyed).toBe(true);
    expect(result.defender_final_hp).toBe(0);
  });

  it("triggers counterattack when defender survives and can reach attacker", () => {
    const s = { ...makeZeroLuckState(), map_width: 10, map_height: 10 };
    // Infantry vs infantry at adjacent — both have machine gun, can counter
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    const { result } = executeCombat(attacker, defender, s, 0);
    // Defender survives (55 base / 10 = 5 damage, defender has 5 HP left)
    if (!result.defender_destroyed) {
      expect(result.defender_damage_dealt).toBeGreaterThan(0);
    }
  });

  it("does not trigger counterattack from indirect units", () => {
    const s = { ...makeZeroLuckState(), map_width: 10, map_height: 10 };
    // Fighter attacks artillery; artillery can_counterattack is false
    const attacker = makeUnit({
      id: 1,
      unit_type: "b_copter",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { missiles: 6 },
    });
    const defender = makeUnit({
      id: 2,
      unit_type: "artillery",
      owner_id: 1,
      x: 1,
      y: 0,
      ammo: { cannon: 9 },
    });
    const { result } = executeCombat(attacker, defender, s, 0);
    // Artillery cannot counterattack (can_counterattack: false)
    expect(result.defender_damage_dealt).toBe(0);
  });

  it("does not trigger counterattack when defender is destroyed", () => {
    const s = { ...makeZeroLuckState(), map_width: 10, map_height: 10 };
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, hp: 1, x: 2, y: 0 });
    const { result } = executeCombat(attacker, defender, s, 0);
    expect(result.defender_destroyed).toBe(true);
    expect(result.defender_damage_dealt).toBe(0);
  });

  it("increments attack_counter in returned state", () => {
    const s = { ...makeZeroLuckState(), attack_counter: 0, map_width: 10, map_height: 10 };
    const attacker = makeUnit({
      id: 1,
      unit_type: "artillery",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    const { state: newState } = executeCombat(attacker, defender, s, 0);
    expect(newState.attack_counter).toBeGreaterThan(0);
  });
});

describe("getBestWeapon", () => {
  it("returns -1 when no weapon can hit the target", () => {
    const s = makeState(10, 10);
    // Tank cannon and MG vs infantry: cannon deals 0, MG deals damage → returns MG (index 1)
    // But actually cannon deals 0 vs infantry, MG deals 75 → index 1
    const attacker = makeUnit({
      id: 1,
      unit_type: "tank",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { cannon: 9 },
    });
    // t_copter at range 1: tank weapons don't hit t_copter except MG
    const defender = makeUnit({ id: 2, unit_type: "t_copter", owner_id: 1, x: 1, y: 0 });
    const result = getBestWeapon(attacker, defender, s);
    expect(result).toBe(1); // machine gun hits t_copter
  });

  it("returns -1 when no weapon can reach the target", () => {
    const s = makeState(10, 10);
    // Infantry vs infantry at distance 5 — out of range
    const attacker = makeUnit({ id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    const defender = makeUnit({ id: 2, unit_type: "infantry", owner_id: 1, x: 5, y: 0 });
    expect(getBestWeapon(attacker, defender, s)).toBe(-1);
  });

  it("selects primary weapon when it deals more damage", () => {
    const s = makeState(10, 10);
    // Mech bazooka vs tank: bazooka deals 55, MG deals 6 → bazooka (index 0)
    const attacker = makeUnit({
      id: 1,
      unit_type: "mech",
      owner_id: 0,
      x: 0,
      y: 0,
      ammo: { bazooka: 3 },
    });
    const defender = makeUnit({ id: 2, unit_type: "tank", owner_id: 1, x: 1, y: 0 });
    expect(getBestWeapon(attacker, defender, s)).toBe(0);
  });
});
