// Offline heuristic AI. Port of ai_heuristic.gd.
// Runs entirely client-side with no API calls.

import type { GameState, GameCommand, UnitState } from "../game/types";
import {
  duplicateState,
  getUnitsByOwner,
  getTile,
  getPlayer,
  getUnit,
  getUnitAt,
} from "../game/game-state";
import { getUnitData, getTerrainData } from "../game/data-loader";
import { getReachableTiles, getAttackableTiles, manhattanDistance } from "../game/pathfinding";
import { canAttack, calculateDamage } from "../game/combat";
import { applyCommand } from "../game/apply-command";
import { validateCommand } from "../game/validators";

// ── Tile evaluation ──────────────────────────────────────────────────────────

function evaluateTile(
  x: number,
  y: number,
  state: GameState,
  playerId: number,
  canCapture: boolean,
): number {
  const tile = getTile(state, x, y);
  if (!tile) return 0;
  const terrainData = getTerrainData(tile.terrain_type);
  let score = (terrainData?.defense_stars ?? 0) * 5;

  if (canCapture && terrainData?.can_capture) {
    if (tile.owner_id !== playerId && tile.owner_id !== -1) score += 50;
    if (tile.terrain_type === "hq") score += 200;
    else if (tile.owner_id === -1) score += 30;
  }

  let nearestEnemyDist = 999;
  for (const u of Object.values(state.units)) {
    if (u.owner_id !== playerId && !u.is_loaded) {
      const d = manhattanDistance(x, y, u.x, u.y);
      if (d < nearestEnemyDist) nearestEnemyDist = d;
    }
  }

  if (!canCapture) score += (20 - nearestEnemyDist) * 2;

  if (canCapture) {
    let nearestPropDist = 999;
    for (let py = 0; py < state.map_height; py++) {
      for (let px = 0; px < state.map_width; px++) {
        const t = getTile(state, px, py);
        const td = t ? getTerrainData(t.terrain_type) : null;
        if (td?.can_capture && t?.owner_id !== playerId) {
          const d = manhattanDistance(x, y, px, py);
          if (d < nearestPropDist) nearestPropDist = d;
        }
      }
    }
    score += (30 - nearestPropDist) * 3;
  }

  return score;
}

// ── Combat helpers ───────────────────────────────────────────────────────────

function findBestAttack(unit: UnitState, state: GameState, playerId: number): GameCommand | null {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return null;

  let bestTarget: UnitState | null = null;
  let bestScore = 0;
  let bestWeapon = 0;

  for (let wi = 0; wi < unitData.weapons.length; wi++) {
    const attackable = getAttackableTiles(state, unit, unit.x, unit.y, wi);
    for (const pos of attackable) {
      const target = getUnitAt(state, pos.x, pos.y);
      if (!target || target.owner_id === playerId) continue;
      if (!canAttack(unit, target, state, wi)) continue;

      const { damage } = calculateDamage(unit, target, state, wi, false);
      const targetData = getUnitData(target.unit_type);
      const targetValue = targetData?.cost ?? 0;

      let score = damage * 100;
      if (damage >= target.hp) score += targetValue;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
        bestWeapon = wi;
      }
    }
  }

  if (bestTarget) {
    return {
      type: "ATTACK",
      player_id: playerId,
      attacker_id: unit.id,
      target_id: bestTarget.id,
      weapon_index: bestWeapon,
    };
  }
  return null;
}

// ── Movement ─────────────────────────────────────────────────────────────────

function findBestMove(
  unit: UnitState,
  state: GameState,
  playerId: number,
  unitData: ReturnType<typeof getUnitData>,
): GameCommand | null {
  const reachable = getReachableTiles(state, unit);
  if (reachable.length === 0) return null;

  const cap = unitData?.can_capture ?? false;
  let bestTile = { x: -1, y: -1 };
  let bestScore = -Infinity;

  for (const pos of reachable) {
    if (getUnitAt(state, pos.x, pos.y)) continue;
    const score = evaluateTile(pos.x, pos.y, state, playerId, cap);
    if (score > bestScore) {
      bestScore = score;
      bestTile = pos;
    }
  }

  if (bestTile.x >= 0) {
    return {
      type: "MOVE",
      player_id: playerId,
      unit_id: unit.id,
      dest_x: bestTile.x,
      dest_y: bestTile.y,
    };
  }
  return null;
}

// ── Per-unit decision ────────────────────────────────────────────────────────

function decideUnitActions(unit: UnitState, state: GameState, playerId: number): GameCommand[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [{ type: "WAIT", player_id: playerId, unit_id: unit.id }];

  const cap = unitData.can_capture;
  const hasWeapons = unitData.weapons.length > 0;

  // 1. Attack if in range
  if (hasWeapons && !unit.has_acted) {
    const attack = findBestAttack(unit, state, playerId);
    if (attack) return [attack];
  }

  // 2. Capture if on property
  if (cap && !unit.has_acted) {
    const tile = getTile(state, unit.x, unit.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (terrainData?.can_capture && tile?.owner_id !== playerId) {
      return [{ type: "CAPTURE", player_id: playerId, unit_id: unit.id }];
    }
  }

  // 3. Move toward objective
  const cmds: GameCommand[] = [];
  if (!unit.has_moved) {
    const moveCmd = findBestMove(unit, state, playerId, unitData);
    if (moveCmd) {
      cmds.push(moveCmd);
      const stateAfterMove = applyCommand(state, moveCmd);
      const movedUnit = getUnit(stateAfterMove, unit.id);
      if (!movedUnit) return cmds;

      if (hasWeapons) {
        const attack = findBestAttack(movedUnit, stateAfterMove, playerId);
        if (attack) {
          cmds.push(attack);
          return cmds;
        }
      }

      if (cap) {
        const tile = getTile(stateAfterMove, movedUnit.x, movedUnit.y);
        const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
        if (terrainData?.can_capture && tile?.owner_id !== playerId) {
          cmds.push({ type: "CAPTURE", player_id: playerId, unit_id: unit.id });
          return cmds;
        }
      }
    }
  }

  // 4. Dig trench if enemies nearby
  if (unitData.special_actions.includes("dig_trench") && !unit.has_acted) {
    const tile = getTile(state, unit.x, unit.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (terrainData?.can_build_trench && !tile?.has_trench && !tile?.has_fob) {
      for (const u of Object.values(state.units)) {
        if (u.owner_id !== playerId && !u.is_loaded) {
          if (manhattanDistance(unit.x, unit.y, u.x, u.y) <= 5) {
            return [...cmds, {
              type: "DIG_TRENCH" as const,
              player_id: playerId,
              unit_id: unit.id,
              target_x: unit.x,
              target_y: unit.y,
            }];
          }
        }
      }
    }
  }

  // Wait
  if (!unit.has_acted) {
    cmds.push({ type: "WAIT", player_id: playerId, unit_id: unit.id });
  }

  return cmds;
}

// ── Purchasing ───────────────────────────────────────────────────────────────

function decidePurchases(state: GameState, playerId: number): GameCommand[] {
  const commands: GameCommand[] = [];
  const player = getPlayer(state, playerId);
  if (!player) return commands;

  let funds = player.funds;

  outer: for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      if (funds < 1000) break outer;
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      const canProduce = terrainData?.can_produce ?? [];
      if (canProduce.length === 0) continue;
      if (getUnitAt(state, x, y)) continue;

      const picks = [
        { type: "infantry", cost: 1000 },
        { type: "mech", cost: 3000 },
        { type: "tank", cost: 7000 },
        { type: "recon", cost: 4000 },
        { type: "fighter", cost: 20000 },
        { type: "b_copter", cost: 9000 },
      ];

      for (const pick of picks) {
        if (canProduce.includes(pick.type) && funds >= pick.cost) {
          commands.push({
            type: "BUY_UNIT",
            player_id: playerId,
            unit_type: pick.type,
            facility_x: x,
            facility_y: y,
          });
          funds -= pick.cost;
          break;
        }
      }
    }
  }

  return commands;
}

// ── Main entry point ─────────────────────────────────────────────────────────

// Run a full heuristic turn synchronously — returns all commands the AI wants to execute
export function runHeuristicTurn(state: GameState, playerId: number): GameCommand[] {
  const commands: GameCommand[] = [];
  let currentState = duplicateState(state);

  const units = getUnitsByOwner(currentState, playerId);
  units.sort((a, b) => {
    const aCapture = getUnitData(a.unit_type)?.can_capture ?? false;
    const bCapture = getUnitData(b.unit_type)?.can_capture ?? false;
    if (aCapture && !bCapture) return -1;
    if (bCapture && !aCapture) return 1;
    return a.id - b.id;
  });

  for (const unit of units) {
    if (unit.is_loaded) continue;
    const freshUnit = getUnit(currentState, unit.id);
    if (!freshUnit || freshUnit.has_acted) continue;

    const unitCmds = decideUnitActions(freshUnit, currentState, playerId);
    for (const cmd of unitCmds) {
      const result = validateCommand(cmd, currentState);
      if (result.valid) {
        commands.push(cmd);
        currentState = applyCommand(currentState, cmd);
      }
    }
  }

  // Purchase units
  const buyCmds = decidePurchases(currentState, playerId);
  for (const cmd of buyCmds) {
    const result = validateCommand(cmd, currentState);
    if (result.valid) {
      commands.push(cmd);
      currentState = applyCommand(currentState, cmd);
    }
  }

  commands.push({ type: "END_TURN", player_id: playerId });
  return commands;
}
