import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("../game/data-loader");

import { getUnitData, getTerrainData } from "../game/data-loader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mock-data";
import { validateCommand } from "../game/validators";
import { makeState, addTestUnit, setTerrain } from "./fixtures";
import { updatePlayer } from "../game/game-state";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

// ─── helpers ────────────────────────────────────────────────────────────────

function ok(result: { valid: boolean }) {
  expect(result.valid).toBe(true);
}
function fail(result: { valid: boolean; error: string }, fragment?: string) {
  expect(result.valid).toBe(false);
  if (fragment) expect(result.error.toLowerCase()).toContain(fragment.toLowerCase());
}

// ─── MOVE ───────────────────────────────────────────────────────────────────

describe("validateMove", () => {
  it("accepts valid move to adjacent tile", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    ok(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s));
  });

  it("rejects move for unknown unit", () => {
    const s = makeState(5, 5);
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 99, dest_x: 1, dest_y: 0 }, s), "not found");
  });

  it("rejects move when unit belongs to another player", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 1, x: 0, y: 0 });
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s));
  });

  it("rejects move when unit has already moved", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, has_moved: true });
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s), "already moved");
  });

  it("rejects move when unit is out of fuel", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 0, y: 0, fuel: 0 });
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s), "fuel");
  });

  it("rejects move out of map bounds", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: -1, dest_y: 0 }, s));
  });

  it("rejects move to tile occupied by enemy", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s), "enemy");
  });

  it("rejects move to impassable terrain", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = setTerrain(s, 1, 0, "sea");
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 1, dest_y: 0 }, s));
  });

  it("rejects move beyond unit movement range", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    // Infantry move_points=3, destination is 5 tiles away
    fail(validateCommand({ type: "MOVE", player_id: 0, unit_id: 1, dest_x: 5, dest_y: 0 }, s));
  });
});

// ─── ATTACK ─────────────────────────────────────────────────────────────────

describe("validateAttack", () => {
  it("accepts valid direct attack", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    ok(validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s));
  });

  it("rejects attack when attacker has already acted", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, has_acted: true });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0 });
    fail(validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s));
  });

  it("rejects attack against friendly unit", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 1, y: 0 });
    fail(validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s), "friendly");
  });

  it("rejects attack when target is out of range", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 5, y: 0 });
    fail(validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s));
  });

  it("rejects indirect attack after moving", () => {
    let s = makeState(10, 10);
    // Artillery that has already moved (has_moved: true)
    s = addTestUnit(s, { id: 1, unit_type: "artillery", owner_id: 0, x: 1, y: 0, has_moved: true, ammo: { cannon: 9 } });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 3, y: 0 });
    fail(
      validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s),
      "indirect"
    );
  });

  it("allows indirect attack without prior movement (has_moved false)", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "artillery", owner_id: 0, x: 0, y: 0, ammo: { cannon: 9 } });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 0 });
    ok(validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s));
  });

  it("rejects attack on loaded unit", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 1, x: 1, y: 0, is_loaded: true });
    fail(
      validateCommand({ type: "ATTACK", player_id: 0, attacker_id: 1, target_id: 2, weapon_index: 0 }, s),
      "transport"
    );
  });
});

// ─── CAPTURE ────────────────────────────────────────────────────────────────

describe("validateCapture", () => {
  it("accepts valid capture", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    ok(validateCommand({ type: "CAPTURE", player_id: 0, unit_id: 1 }, s));
  });

  it("rejects capture with non-capturing unit type", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = addTestUnit(s, { id: 1, unit_type: "tank", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "CAPTURE", player_id: 0, unit_id: 1 }, s), "cannot capture");
  });

  it("rejects capture of non-capturable terrain", () => {
    let s = makeState(5, 5);
    // plain has can_capture: false
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "CAPTURE", player_id: 0, unit_id: 1 }, s));
  });

  it("rejects capture of already-owned property", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "CAPTURE", player_id: 0, unit_id: 1 }, s), "already own");
  });

  it("rejects capture when unit has already acted", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 1 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, has_acted: true });
    fail(validateCommand({ type: "CAPTURE", player_id: 0, unit_id: 1 }, s));
  });
});

// ─── BUY_UNIT ───────────────────────────────────────────────────────────────

describe("validateBuyUnit", () => {
  it("accepts valid purchase", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    ok(validateCommand({ type: "BUY_UNIT", player_id: 0, unit_type: "infantry", facility_x: 0, facility_y: 0 }, s));
  });

  it("rejects when player has insufficient funds", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 500 });
    fail(
      validateCommand({ type: "BUY_UNIT", player_id: 0, unit_type: "infantry", facility_x: 0, facility_y: 0 }, s),
      "funds"
    );
  });

  it("rejects when facility cannot produce the unit type", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "city", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    fail(
      validateCommand({ type: "BUY_UNIT", player_id: 0, unit_type: "infantry", facility_x: 0, facility_y: 0 }, s)
    );
  });

  it("rejects when facility is occupied by a unit", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 0 });
    s = updatePlayer(s, 0, { funds: 10000 });
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(
      validateCommand({ type: "BUY_UNIT", player_id: 0, unit_type: "infantry", facility_x: 0, facility_y: 0 }, s),
      "blocked"
    );
  });

  it("rejects when facility is not owned by the player", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "factory", { owner_id: 1 });
    s = updatePlayer(s, 0, { funds: 10000 });
    fail(
      validateCommand({ type: "BUY_UNIT", player_id: 0, unit_type: "infantry", facility_x: 0, facility_y: 0 }, s),
      "not owned"
    );
  });
});

// ─── WAIT ───────────────────────────────────────────────────────────────────

describe("validateWait", () => {
  it("accepts wait for idle unit", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    ok(validateCommand({ type: "WAIT", player_id: 0, unit_id: 1 }, s));
  });

  it("rejects wait when unit has already acted", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, has_acted: true });
    fail(validateCommand({ type: "WAIT", player_id: 0, unit_id: 1 }, s));
  });
});

// ─── LOAD / UNLOAD ──────────────────────────────────────────────────────────

describe("validateLoad", () => {
  it("accepts loading an infantry into an APC", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    ok(validateCommand({ type: "LOAD", player_id: 0, transport_id: 1, unit_id: 2 }, s));
  });

  it("rejects loading when transport is at capacity", () => {
    let s = makeState(5, 5);
    // APC capacity=1, already has cargo
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0, cargo: [3] });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "LOAD", player_id: 0, transport_id: 1, unit_id: 2 }, s), "capacity");
  });

  it("rejects loading when unit is not adjacent", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 5, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "LOAD", player_id: 0, transport_id: 1, unit_id: 2 }, s), "adjacent");
  });

  it("rejects loading incompatible unit type (tank into APC)", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0 });
    s = addTestUnit(s, { id: 2, unit_type: "tank", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "LOAD", player_id: 0, transport_id: 1, unit_id: 2 }, s));
  });
});

describe("validateUnload", () => {
  it("accepts unloading to adjacent passable tile", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0, cargo: [2] });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 1, y: 0, is_loaded: true });
    ok(validateCommand({ type: "UNLOAD", player_id: 0, transport_id: 1, unit_index: 0, dest_x: 0, dest_y: 0 }, s));
  });

  it("rejects unloading to impassable terrain", () => {
    let s = makeState(5, 5);
    s = setTerrain(s, 0, 0, "sea");
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0, cargo: [2] });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 1, y: 0, is_loaded: true });
    fail(
      validateCommand({ type: "UNLOAD", player_id: 0, transport_id: 1, unit_index: 0, dest_x: 0, dest_y: 0 }, s),
      "cannot be unloaded"
    );
  });

  it("rejects unloading to non-adjacent tile", () => {
    let s = makeState(10, 10);
    s = addTestUnit(s, { id: 1, unit_type: "apc", owner_id: 0, x: 1, y: 0, cargo: [2] });
    s = addTestUnit(s, { id: 2, unit_type: "infantry", owner_id: 0, x: 1, y: 0, is_loaded: true });
    fail(
      validateCommand({ type: "UNLOAD", player_id: 0, transport_id: 1, unit_index: 0, dest_x: 5, dest_y: 0 }, s),
      "adjacent"
    );
  });
});

// ─── SUBMERGE / SURFACE ─────────────────────────────────────────────────────

describe("validateSubmerge / validateSurface", () => {
  it("accepts submerge for submarine", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "submarine", owner_id: 0, x: 0, y: 0 });
    ok(validateCommand({ type: "SUBMERGE", player_id: 0, unit_id: 1 }, s));
  });

  it("rejects submerge when already submerged", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "submarine", owner_id: 0, x: 0, y: 0, is_submerged: true });
    fail(validateCommand({ type: "SUBMERGE", player_id: 0, unit_id: 1 }, s), "already submerged");
  });

  it("rejects submerge for non-submarine unit", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0 });
    fail(validateCommand({ type: "SUBMERGE", player_id: 0, unit_id: 1 }, s));
  });

  it("accepts surface for submerged submarine", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "submarine", owner_id: 0, x: 0, y: 0, is_submerged: true });
    ok(validateCommand({ type: "SURFACE", player_id: 0, unit_id: 1 }, s));
  });

  it("rejects surface when not submerged", () => {
    let s = makeState(5, 5);
    s = addTestUnit(s, { id: 1, unit_type: "submarine", owner_id: 0, x: 0, y: 0, is_submerged: false });
    fail(validateCommand({ type: "SURFACE", player_id: 0, unit_id: 1 }, s), "not submerged");
  });
});

// ─── END_TURN ───────────────────────────────────────────────────────────────

describe("validateCommand END_TURN", () => {
  it("always accepts END_TURN for current player", () => {
    const s = makeState();
    ok(validateCommand({ type: "END_TURN", player_id: 0 }, s));
  });

  it("rejects END_TURN from wrong player", () => {
    const s = makeState();
    fail(validateCommand({ type: "END_TURN", player_id: 1 }, s), "not your turn");
  });
});
