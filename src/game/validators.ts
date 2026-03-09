// Command validation. Direct port of validators.gd.

import type { GameState, GameCommand, ValidationResult } from "./types";
import type {
  CmdMove,
  CmdAttack,
  CmdCapture,
  CmdBuyUnit,
  CmdLoad,
  CmdUnload,
  CmdDigTrench,
  CmdBuildFOB,
  CmdSelfDestruct,
  CmdWait,
  CmdResupply,
  CmdSubmerge,
  CmdSurface,
} from "./types";
import { getCurrentPlayer, getUnit, getUnitAt, getPlayer, getTile } from "./game-state";
import { getUnitData, getTerrainData } from "./data-loader";
import { canAttack } from "./combat";
import { isDestinationReachable, isPassable, manhattanDistance } from "./pathfinding";
import { FOB_COST } from "./economy";

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
    case "DIG_TRENCH":
      return validateDigTrench(cmd, state);
    case "BUILD_FOB":
      return validateBuildFOB(cmd, state);
    case "SELF_DESTRUCT":
      return validateSelfDestruct(cmd, state);
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

  // Airport/FOB requirement
  if (transportInfo.requires_airport_or_fob) {
    const tile = getTile(state, transport.x, transport.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (!terrainData?.allows_cargo_operations && !tile?.has_fob) {
      return fail("Heavy cargo plane must be at airport or FOB to load");
    }
  }

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

  const transportData = getUnitData(transport.unit_type);
  const transportInfo = transportData?.transport;

  if (transportInfo?.requires_airport_or_fob) {
    const tile = getTile(state, transport.x, transport.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (!terrainData?.allows_cargo_operations && !tile?.has_fob) {
      return fail("Heavy cargo plane must be at airport or FOB to unload");
    }
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

  const destTile = getTile(state, cmd.dest_x, cmd.dest_y);
  if (!destTile) return fail("Invalid destination tile");
  const terrainType = destTile.has_fob ? "temporary_fob" : destTile.terrain_type;

  if (!isPassable(terrainType, moveType)) return fail("Cargo cannot be unloaded to this terrain");

  return ok();
}

function validateDigTrench(cmd: CmdDigTrench, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("dig_trench")) return fail("Unit cannot dig trenches");

  const dist = manhattanDistance(unit.x, unit.y, cmd.target_x, cmd.target_y);
  if (dist > 1) return fail("Target tile not adjacent");

  const tile = getTile(state, cmd.target_x, cmd.target_y);
  if (!tile) return fail("Invalid target tile");

  const terrainData = getTerrainData(tile.terrain_type);
  if (!terrainData?.can_build_trench) return fail("Cannot build trench on this terrain");
  if (tile.has_trench) return fail("Tile already has trench");
  if (tile.has_fob) return fail("Cannot build trench on FOB");

  return ok();
}

function validateBuildFOB(cmd: CmdBuildFOB, state: GameState): ValidationResult {
  const unit = getUnit(state, cmd.unit_id);
  if (!unit) return fail("Unit not found");
  if (unit.owner_id !== cmd.player_id) return fail("Unit does not belong to player");
  if (unit.has_acted) return fail("Unit has already acted");
  if (unit.is_loaded) return fail("Unit is loaded in transport");

  const unitData = getUnitData(unit.unit_type);
  if (!unitData?.special_actions.includes("build_fob")) return fail("Unit cannot build FOBs");

  const player = getPlayer(state, cmd.player_id);
  if (!player || player.funds < FOB_COST) return fail("Insufficient funds for FOB");

  const dist = manhattanDistance(unit.x, unit.y, cmd.target_x, cmd.target_y);
  if (dist > 1) return fail("Target tile not adjacent");

  const tile = getTile(state, cmd.target_x, cmd.target_y);
  if (!tile) return fail("Invalid target tile");

  const terrainData = getTerrainData(tile.terrain_type);
  if (!terrainData?.can_build_fob) return fail("Cannot build FOB on this terrain");
  if (tile.has_fob) return fail("Tile already has FOB");
  if (tile.has_trench) return fail("Cannot build FOB on trench");

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

  const target = getUnit(state, cmd.target_id);
  if (!target) return fail("Target not found");
  if (target.owner_id === unit.owner_id) return fail("Cannot target friendly unit");
  if (target.is_loaded) return fail("Cannot target unit in transport");

  const dist = manhattanDistance(unit.x, unit.y, target.x, target.y);
  if (dist > 1) return fail("Target not adjacent");

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
  if (!unitData?.special_actions.includes("submerge")) return fail("Unit cannot surface");

  return ok();
}
