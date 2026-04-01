/**
 * Offline **heuristic AI** (no network): simple scoring, move/attack/capture heuristics, runs
 * synchronously for `controller_type === "heuristic"`. Used when no API keys or as fallback.
 */

import type { GameState, GameCommand, UnitState } from "../game/types";
import {
  duplicateState,
  getUnitsByOwner,
  getTile,
  getPlayer,
  getUnit,
  getUnitAt,
} from "../game/gameState";
import { getUnitData, getTerrainData } from "../game/dataLoader";
import { getReachableTiles, getAttackableTiles, manhattanDistance } from "../game/pathfinding";
import { canAttack, calculateDamage } from "../game/combat";
import { applyCommand } from "../game/applyCommand";
import { validateCommand } from "../game/validators";

// ── Team helpers ─────────────────────────────────────────────────────────────

function isAllyOrSelf(state: GameState, playerId: number, otherId: number): boolean {
  if (playerId === otherId) return true;
  const p = state.players.find((pl) => pl.id === playerId);
  const o = state.players.find((pl) => pl.id === otherId);
  if (!p || !o) return false;
  return p.team === o.team;
}

// ── Tile evaluation ──────────────────────────────────────────────────────────

function evaluateTile(
  x: number,
  y: number,
  state: GameState,
  playerId: number,
  canCapture: boolean,
  vis: boolean[][] | null = null
): number {
  const tile = getTile(state, x, y);
  if (!tile) return 0;
  const terrainData = getTerrainData(tile.terrain_type);
  let score = (terrainData?.defense_stars ?? 0) * 5;

  if (canCapture && terrainData?.can_capture) {
    // Allied properties are not capture targets
    if (tile.owner_id !== -1 && !isAllyOrSelf(state, playerId, tile.owner_id)) score += 50;
    if (tile.terrain_type === "hq" && !isAllyOrSelf(state, playerId, tile.owner_id)) score += 200;
    else if (tile.owner_id === -1) score += 30;
  }

  // Only consider enemies we can actually see (fog-aware)
  let nearestEnemyDist = 999;
  for (const u of Object.values(state.units)) {
    if (isAllyOrSelf(state, playerId, u.owner_id) || u.is_loaded) continue;
    if (vis && !(vis[u.y]?.[u.x] ?? false)) continue;
    const d = manhattanDistance(x, y, u.x, u.y);
    if (d < nearestEnemyDist) nearestEnemyDist = d;
  }

  if (!canCapture) score += (20 - nearestEnemyDist) * 2;

  if (canCapture) {
    let nearestPropDist = 999;
    for (let py = 0; py < state.map_height; py++) {
      for (let px = 0; px < state.map_width; px++) {
        const t = getTile(state, px, py);
        const td = t ? getTerrainData(t.terrain_type) : null;
        // Don't target allied or own properties for capture
        if (td?.can_capture && t && !isAllyOrSelf(state, playerId, t.owner_id)) {
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
      if (!target || isAllyOrSelf(state, playerId, target.owner_id)) continue;
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
  vis: boolean[][] | null = null
): GameCommand | null {
  const reachable = getReachableTiles(state, unit);
  if (reachable.length === 0) return null;

  const cap = unitData?.can_capture ?? false;
  let bestTile = { x: -1, y: -1 };
  let bestScore = -Infinity;

  for (const pos of reachable) {
    if (getUnitAt(state, pos.x, pos.y)) continue;
    const score = evaluateTile(pos.x, pos.y, state, playerId, cap, vis);
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

export interface HeuristicHint {
  dest_x: number;
  dest_y: number;
  followUp: "CAPTURE" | "ATTACK" | "WAIT";
  followUpDetail?: string; // e.g. "target_id=5 weapon_index=0"
}

/**
 * Single-step MOVE + follow-up action the offline AI would pick for this unit.
 * Use in LLM prompts so models get concrete, expansion-oriented destinations
 * AND know what to do after moving. Pass `vis` for fog-fair scoring.
 */
export function getHeuristicMoveSuggestion(
  unit: UnitState,
  state: GameState,
  vis: boolean[][] | null = null
): HeuristicHint | null {
  if (unit.has_moved || unit.has_acted || unit.is_loaded) return null;
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return null;
  const moveCmd = findBestMove(unit, state, unit.owner_id, unitData, vis);
  if (!moveCmd || moveCmd.type !== "MOVE") return null;

  const hint: HeuristicHint = {
    dest_x: moveCmd.dest_x,
    dest_y: moveCmd.dest_y,
    followUp: "WAIT",
  };

  // Simulate the move and determine what the unit should do after
  try {
    const stateAfterMove = applyCommand(state, moveCmd);
    const movedUnit = getUnit(stateAfterMove, unit.id);
    if (!movedUnit) return hint;

    // Check for attack opportunity after move
    if (unitData.weapons.length > 0) {
      const attack = findBestAttack(movedUnit, stateAfterMove, unit.owner_id);
      if (attack && attack.type === "ATTACK") {
        hint.followUp = "ATTACK";
        hint.followUpDetail = `target_id=${attack.target_id} weapon_index=${attack.weapon_index}`;
        return hint;
      }
    }

    // Check for capture opportunity after move
    if (unitData.can_capture) {
      const tile = getTile(stateAfterMove, movedUnit.x, movedUnit.y);
      const td = tile ? getTerrainData(tile.terrain_type) : null;
      if (td?.can_capture && tile && !isAllyOrSelf(stateAfterMove, unit.owner_id, tile.owner_id)) {
        hint.followUp = "CAPTURE";
        return hint;
      }
    }
  } catch {
    // If simulation fails, still return the move with WAIT
  }

  return hint;
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

  // 2. Capture if on property (not allied)
  if (cap && !unit.has_acted) {
    const tile = getTile(state, unit.x, unit.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (terrainData?.can_capture && tile && !isAllyOrSelf(state, playerId, tile.owner_id)) {
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
        if (terrainData?.can_capture && tile && !isAllyOrSelf(state, playerId, tile.owner_id)) {
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
        if (!isAllyOrSelf(state, playerId, u.owner_id) && !u.is_loaded) {
          if (manhattanDistance(unit.x, unit.y, u.x, u.y) <= 5) {
            return [
              ...cmds,
              {
                type: "DIG_TRENCH" as const,
                player_id: playerId,
                unit_id: unit.id,
                target_x: unit.x,
                target_y: unit.y,
              },
            ];
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

  // Count own infantry vs combat units to decide build mix
  const ownUnits = Object.values(state.units).filter((u) => u.owner_id === playerId && !u.is_loaded);
  const infantryCount = ownUnits.filter((u) => u.unit_type === "infantry" || u.unit_type === "mech").length;
  const combatCount = ownUnits.filter((u) => u.unit_type !== "infantry" && u.unit_type !== "mech" && u.unit_type !== "apc" && u.unit_type !== "t_copter").length;

  // Count uncaptured properties to decide if we need more capturers
  let uncapturedProps = 0;
  for (let py = 0; py < state.map_height; py++) {
    for (let px = 0; px < state.map_width; px++) {
      const t = getTile(state, px, py);
      if (!t) continue;
      const td = getTerrainData(t.terrain_type);
      if (td?.can_capture && !isAllyOrSelf(state, playerId, t.owner_id)) uncapturedProps++;
    }
  }

  const needCapturers = uncapturedProps > infantryCount * 2;

  // Priority list depends on situation
  function getPriorityList(canProduce: string[]): { type: string; cost: number }[] {
    const ud = (t: string) => getUnitData(t);
    const available = (t: string) => canProduce.includes(t) && ud(t) !== null;

    if (funds >= 7000 && combatCount < infantryCount && !needCapturers) {
      // Build combat units when we have enough infantry
      return [
        available("tank") ? { type: "tank", cost: ud("tank")!.cost } : null,
        available("md_tank") && funds >= 16000 ? { type: "md_tank", cost: ud("md_tank")!.cost } : null,
        available("artillery") ? { type: "artillery", cost: ud("artillery")!.cost } : null,
        available("anti_air") ? { type: "anti_air", cost: ud("anti_air")!.cost } : null,
        available("recon") ? { type: "recon", cost: ud("recon")!.cost } : null,
        available("b_copter") ? { type: "b_copter", cost: ud("b_copter")!.cost } : null,
        available("mech") ? { type: "mech", cost: ud("mech")!.cost } : null,
        available("infantry") ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      ].filter((p): p is { type: string; cost: number } => p !== null);
    }

    // Default: capturers first, then combat
    return [
      available("infantry") ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      available("mech") ? { type: "mech", cost: ud("mech")!.cost } : null,
      available("tank") ? { type: "tank", cost: ud("tank")!.cost } : null,
      available("recon") ? { type: "recon", cost: ud("recon")!.cost } : null,
      available("b_copter") ? { type: "b_copter", cost: ud("b_copter")!.cost } : null,
      available("artillery") ? { type: "artillery", cost: ud("artillery")!.cost } : null,
    ].filter((p): p is { type: string; cost: number } => p !== null);
  }

  outer: for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      if (funds < 1000) break outer;
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      const canProduce = terrainData?.can_produce ?? [];
      if (canProduce.length === 0) continue;
      if (getUnitAt(state, x, y)) continue;

      const picks = getPriorityList(canProduce);
      for (const pick of picks) {
        if (funds >= pick.cost) {
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
