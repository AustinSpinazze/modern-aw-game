/**
 * Command validation: checks whether a {@link GameCommand} is legal for the current
 * {@link GameState} (ownership, phase, ranges, terrain, funds, etc.).
 *
 * Every path that accepts player or AI input must call this before {@link ./applyCommand.applyCommand}.
 * Returns structured errors for UI feedback; game logic stays pure.
 */

import type { GameState, GameCommand, ValidationResult } from "./types";
import type {
  CmdMove,
  CmdAttack,
  CmdCapture,
  CmdBuyUnit,
  CmdLoad,
  CmdUnload,
  CmdSelfDestruct,
  CmdFireSilo,
  CmdWait,
  CmdResupply,
  CmdSubmerge,
  CmdSurface,
  CmdMerge,
  CmdHide,
  CmdUnhide,
} from "./types";
import { getCurrentPlayer, getUnit, getUnitAt, getPlayer, getTile } from "./gameState";
import { getUnitData, getTerrainData } from "./dataLoader";
import { canAttack } from "./combat";
import { isDestinationReachable, isPassable, manhattanDistance } from "./pathfinding";
import { calculateHealCost } from "./economy";

function ok(): ValidationResult {
  return { valid: true, error: "" };
}
function fail(msg: string): ValidationResult {
  return { valid: false, error: msg };
}

export function validateCommand(cmd: GameCommand, state: GameState): ValidationResult {
  if (state.phase === "game_over") return fail("Game is over");

  const current = getCurrentPlayer(state);
  if (!current) return fail("No current player");
  if (cmd.player_id !== current.id) return fail("Not your turn");

  switch (cmd.type) {
    case "MOVE":
      return validateMove(cmd, state);
    case "ATTACK":
      return validateAttack(cmd, state);
    case "CAPTURE":
      return validateCapture(cmd, state);
    case "BUY_UNIT":
      return validateBuyUnit(cmd, state);
    case "LOAD":
      return validateLoad(cmd, state);
    case "UNLOAD":
      return validateUnload(cmd, state);
    case "SELF_DESTRUCT":
      return validateSelfDestruct(cmd, state);
    case "FIRE_SILO":
      return validateFireSilo(cmd, state);
    case "WAIT":
      return validateWait(cmd, state);
    case "END_TURN":
      return ok();
    case "RESUPPLY":
      return validateResupply(cmd, state);
    case "SUBMERGE":
      return validateSubmerge(cmd, state);
    case "SURFACE":
      return validateSurface(cmd, state);
    case "MERGE":
      return validateMerge(cmd, state);
    case "HIDE":
      return validateHide(cmd, state);
    case "UNHIDE":
      return validateUnhide(cmd, state);
    default:
      return fail("Unknown command type");
  }
}

function validateMove(cmd: CmdMove, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_moved) return fail("Unit has already moved");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  if (cmd.dest_x < 0 || cmd.dest_x >= state.map_width) return fail("Destination out of bounds");
  if (cmd.dest_y < 0 || cmd.dest_y >= state.map_height) return fail("Destination out of bounds");

  const destUnit = getUnitAt(state, cmd.dest_x, cmd.dest_y);
  if (destUnit && destUnit.id !== unit.id) {
    if (destUnit.owner_id !== unit.owner_id) return fail("Destination occupied by enemy");
    return fail("Destination occupied by friendly unit");
  }

  // Fuel-using units cannot move when out of fuel (treat missing fuel as full tank)
  const unitData = getUnitData(unit.unit_type);
  if (unitData?.fuel !== undefined) {
    const currentFuel = unit.fuel ?? unitData.fuel;
    if (currentFuel === 0) {
      return fail("Unit is out of fuel");
    }
  }

  if (!isDestinationReachable(state, unit, cmd.dest_x, cmd.dest_y)) {
    return fail("Destination not reachable");
  }

  return ok();
}

function validateAttack(cmd: CmdAttack, state: GameState): ValidationResult {
  const attacker = getUnit(state, cmd.attacker_id);
  if (!attacker) return fail("Attacker not found");
  if (attacker.owner_id !== cmd.player_id) return fail("Attacker does not belong to player");
  if (attacker.has_acted) return fail("Unit has already acted");
  if (attacker.is_loaded) return fail("Unit is loaded in transport");

  const attackerData = getUnitData(attacker.unit_type);
  const weapon = attackerData?.weapons[cmd.weapon_index];
  if (weapon && weapon.min_range > 1 && attacker.has_moved) {
    return fail("Indirect units cannot move and attack in the same turn");
  }

  const target = getUnit(state, cmd.target_id);
  if (!target) return fail("Target not found");
  if (target.owner_id === attacker.owner_id) return fail("Cannot attack friendly unit");
  if (target.is_loaded) return fail("Cannot attack unit in transport");

  if (!canAttack(attacker, target, state, cmd.weapon_index)) {
    return fail("Cannot attack target with selected weapon");
  }

  return ok();
}

function validateCapture(cmd: CmdCapture, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.can_capture) return fail("Unit cannot capture");

  const tile = getTile(state, unit.x, unit.y);
  if (!tile) return fail("Invalid tile");

  const terrainData = getTerrainData(tile.terrain_type);
  if (!terrainData?.can_capture) return fail("Tile cannot be captured");
  if (tile.owner_id === cmd.player_id) return fail("Already own this property");

  return ok();
}

function validateBuyUnit(cmd: CmdBuyUnit, state: GameState): ValidationResult {
  const player = getPlayer(state, cmd.player_id);
  if (!player) return fail("Player not found");

  const tile = getTile(state, cmd.facility_x, cmd.facility_y);
  if (!tile) return fail("Invalid facility location");
  if (tile.owner_id !== cmd.player_id) return fail("Facility not owned by player");

  const terrainData = getTerrainData(tile.terrain_type);
  if (!terrainData?.can_produce.includes(cmd.unit_type)) {
    return fail("Facility cannot produce this unit type");
  }

  const unitData = getUnitData(cmd.unit_type);
  const cost = unitData?.cost ?? 0;
  if (player.funds < cost) return fail("Insufficient funds");

  const blockingUnit = getUnitAt(state, cmd.facility_x, cmd.facility_y);
  if (blockingUnit) return fail("Facility blocked by unit");

  return ok();
}

function validateLoad(cmd: CmdLoad, state: GameState): ValidationResult {
  const transport = getUnit(state, cmd.transport_id);
  if (!transport) return fail("Transport not found");
  if (transport.owner_id !== cmd.player_id) return fail("Transport does not belong to player");

  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.is_loaded) return fail("Unit already loaded");
  if (unit.has_acted) return fail("Unit has already acted");

  const transportData = getUnitData(transport.unit_type);
  const transportInfo = transportData?.transport;
  if (!transportInfo) return fail("Unit is not a transport");

  const dist = manhattanDistance(transport.x, transport.y, unit.x, unit.y);
  if (dist > 1) return fail("Unit not adjacent to transport");

  const unitData = getUnitData(unit.unit_type);
  const unitTags = unitData?.tags ?? [];
  const allowedTags = transportInfo.allowed_tags ?? [];
  const allowedVehicleTags = transportInfo.allowed_vehicle_tags ?? [];

  const isAllowed =
    unitTags.some((t) => allowedTags.includes(t)) ||
    unitTags.some((t) => allowedVehicleTags.includes(t));

  if (!isAllowed) return fail("Transport cannot carry this unit type");

  if (transport.cargo.length >= (transportInfo.capacity ?? 1)) return fail("Transport at capacity");

  return ok();
}

function validateUnload(cmd: CmdUnload, state: GameState): ValidationResult {
  const transport = getUnit(state, cmd.transport_id);
  if (!transport) return fail("Transport not found");
  if (transport.owner_id !== cmd.player_id) return fail("Transport does not belong to player");
  if (transport.has_acted) return fail("Transport has already acted");

  if (cmd.unit_index < 0 || cmd.unit_index >= transport.cargo.length) {
    return fail("Invalid cargo index");
  }

  if (cmd.dest_x < 0 || cmd.dest_x >= state.map_width) return fail("Destination out of bounds");
  if (cmd.dest_y < 0 || cmd.dest_y >= state.map_height) return fail("Destination out of bounds");

  const dist = manhattanDistance(transport.x, transport.y, cmd.dest_x, cmd.dest_y);
  if (dist > 1) return fail("Destination not adjacent to transport");

  const destUnit = getUnitAt(state, cmd.dest_x, cmd.dest_y);
  if (destUnit) return fail("Destination occupied");

  const cargoId = transport.cargo[cmd.unit_index];
  const cargoUnit = getUnit(state, cargoId);
  if (!cargoUnit) return fail("Cargo unit not found");

  const cargoData = getUnitData(cargoUnit.unit_type);
  const moveType = cargoData?.move_type ?? "foot";

  const transportTile = getTile(state, transport.x, transport.y);
  if (!transportTile) return fail("Invalid transport position");
  if (!isPassable(transportTile.terrain_type, moveType)) {
    return fail("Transport must be on suitable terrain to unload");
  }

  const destTile = getTile(state, cmd.dest_x, cmd.dest_y);
  if (!destTile) return fail("Invalid destination tile");

  if (!isPassable(destTile.terrain_type, moveType))
    return fail("Cargo cannot be unloaded to this terrain");

  return ok();
}

function validateSelfDestruct(cmd: CmdSelfDestruct, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("self_destruct"))
    return fail("Unit cannot self-destruct");

  // Black Bomb: 3×3 area detonation at the bomb’s tile — no adjacent-enemy target
  if (unit.unit_type === "black_bomb") {
    if (cmd.target_id !== 0) return fail("Black Bomb detonation uses target_id 0");
    return ok();
  }

  const target = getUnit(state, cmd.target_id);
  if (!target) return fail("Target not found");
  if (target.owner_id === unit.owner_id) return fail("Cannot target friendly unit");
  if (target.is_loaded) return fail("Cannot target unit in transport");

  const dist = manhattanDistance(unit.x, unit.y, target.x, target.y);
  if (dist > 1) return fail("Target not adjacent");

  return ok();
}

function validateFireSilo(cmd: CmdFireSilo, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.tags.includes("infantry_class")) return fail("Only infantry can launch silos");

  if (cmd.target_x < 0 || cmd.target_x >= state.map_width) return fail("Target out of bounds");
  if (cmd.target_y < 0 || cmd.target_y >= state.map_height) return fail("Target out of bounds");

  const siloTile = getTile(state, cmd.silo_x, cmd.silo_y);
  if (!siloTile || siloTile.terrain_type !== "missile_silo")
    return fail("No missile silo at given tile");

  const distSilo = manhattanDistance(unit.x, unit.y, cmd.silo_x, cmd.silo_y);
  if (distSilo !== 1) return fail("Unit must be adjacent to the silo");

  return ok();
}

function validateWait(cmd: CmdWait, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");
  return ok();
}

function validateResupply(cmd: CmdResupply, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("resupply")) return fail("Unit cannot resupply");

  const target = getUnit(state, cmd.target_id);
  if (!target) return fail("Target not found");
  if (target.owner_id !== unit.owner_id) return fail("Can only resupply friendly units");

  const dist = manhattanDistance(unit.x, unit.y, target.x, target.y);
  if (dist > 1) return fail("Target not adjacent");

  const targetData = getUnitData(target.unit_type);
  if (!targetData) return fail("Invalid target");

  // Black Boat (Advance Wars): pay 10% of target cost per HP repaired — adjacent naval units only.
  if (unit.unit_type === "black_boat") {
    if (targetData.domain !== "sea") return fail("Black Boat only repairs adjacent naval units");
    if (target.hp >= 10) return fail("Target already at full HP");
    const cost = calculateHealCost(target.unit_type, 1);
    const player = getPlayer(state, cmd.player_id);
    if (!player || player.funds < cost) return fail("Insufficient funds for repair");
    return ok();
  }

  // APC: refill ammo/fuel for adjacent land forces only (not air or ships).
  if (targetData.domain === "air") return fail("APC cannot resupply aircraft");
  if (targetData.domain === "sea") return fail("APC cannot resupply naval units");

  return ok();
}

function validateSubmerge(cmd: CmdSubmerge, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_submerged) return fail("Unit is already submerged");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("submerge")) return fail("Unit cannot submerge");

  return ok();
}

function validateSurface(cmd: CmdSurface, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (!unit.is_submerged) return fail("Unit is not submerged");

  const unitData = getUnitData(unit.unit_type);
  if (
    !unitData?.special_actions.includes("submerge") &&
    !unitData?.special_actions.includes("surface")
  )
    return fail("Unit cannot surface");

  return ok();
}

function validateMerge(cmd: CmdMerge, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const target = getUnit(state, cmd.target_id);
  if (!target) return fail("Target unit not found");
  if (target.owner_id !== cmd.player_id) return fail("Target does not belong to player");
  if (target.unit_type !== unit.unit_type) return fail("Cannot merge different unit types");
  if (unit.hp >= 10 && target.hp >= 10) return fail("Both units are already at full HP");
  if (target.hp >= 10) return fail("Target unit is already at full HP");

  return ok();
}

function validateHide(cmd: CmdHide, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_hidden) return fail("Unit is already hidden");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("hide")) return fail("Unit cannot hide");

  return ok();
}

function validateUnhide(cmd: CmdUnhide, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (!unit.is_hidden) return fail("Unit is not hidden");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("hide") && !unitData?.special_actions.includes("unhide"))
    return fail("Unit cannot unhide");

  return ok();
}
