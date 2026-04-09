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
import { analyzeTacticalState } from "./tacticalAnalysis";

// ── Team helpers ─────────────────────────────────────────────────────────────

function isAllyOrSelf(state: GameState, playerId: number, otherId: number): boolean {
  if (playerId === otherId) return true;
  const p = state.players.find((pl) => pl.id === playerId);
  const o = state.players.find((pl) => pl.id === otherId);
  if (!p || !o) return false;
  return p.team === o.team;
}

// ── Tile evaluation ──────────────────────────────────────────────────────────

/** Exported for LLM harness: score a candidate MOVE destination (same scoring as offline AI). */
export function scoreTileForAiMove(
  x: number,
  y: number,
  state: GameState,
  playerId: number,
  canCapture: boolean,
  vis: boolean[][] | null = null,
  options?: {
    objectiveX?: number;
    objectiveY?: number;
    openingTurn?: boolean;
    avoidOwnedProduction?: boolean;
  }
): number {
  const tile = getTile(state, x, y);
  if (!tile) return 0;
  const terrainData = getTerrainData(tile.terrain_type);

  // Capturers care less about defense stars — movement toward properties matters more
  let score = (terrainData?.defense_stars ?? 0) * (canCapture ? 2 : 5);

  if (canCapture && terrainData?.can_capture && !isAllyOrSelf(state, playerId, tile.owner_id)) {
    // Per-property-type value: factories produce units, cities generate income,
    // airports are only useful with income to spend, ports are situational
    const propBonus: Record<string, number> = {
      hq: 300,
      factory: 120,
      city: 80,
      airport: 60,
      port: 40,
    };
    const baseBonus = propBonus[tile.terrain_type] ?? (tile.owner_id === -1 ? 60 : 80);
    score += baseBonus;

    // Capture chain: massive bonus for finishing a capture already in progress
    if (tile.capture_points < 20) {
      score += 250;
    }
  }

  // Capturers should advance toward uncaptured properties, not camp on own territory
  if (canCapture && tile.owner_id !== -1 && isAllyOrSelf(state, playerId, tile.owner_id)) {
    score -= 25;
  }

  // Anti-clustering: penalize tiles near other friendly capturers so infantry fan out
  if (canCapture) {
    let nearbyAlliedCapturers = 0;
    for (const u of Object.values(state.units)) {
      if (u.owner_id !== playerId || u.is_loaded) continue;
      if (!(getUnitData(u.unit_type)?.can_capture ?? false)) continue;
      const d = manhattanDistance(x, y, u.x, u.y);
      if (d <= 3) nearbyAlliedCapturers++;
    }
    // Each nearby capturer makes this tile less attractive — forces spreading
    score -= nearbyAlliedCapturers * 30;
  }

  // Only consider enemies we can actually see (fog-aware)
  let nearestEnemyDist = 999;
  for (const u of Object.values(state.units)) {
    if (isAllyOrSelf(state, playerId, u.owner_id) || u.is_loaded) continue;
    if (vis && !(vis[u.y]?.[u.x] ?? false)) continue;
    const d = manhattanDistance(x, y, u.x, u.y);
    if (d < nearestEnemyDist) nearestEnemyDist = d;
  }

  // Combat units: close distance to enemies AND push toward enemy-owned properties
  // to disrupt captures and income chains
  if (!canCapture) {
    score += (20 - nearestEnemyDist) * 3;

    // Pull toward enemy-owned properties — disrupt their income
    let nearestEnemyPropDist = 999;
    for (let py = 0; py < state.map_height; py++) {
      for (let px = 0; px < state.map_width; px++) {
        const t = getTile(state, px, py);
        if (!t || t.owner_id === -1 || isAllyOrSelf(state, playerId, t.owner_id)) continue;
        const td = getTerrainData(t.terrain_type);
        if (!td?.can_capture) continue;
        const d = manhattanDistance(x, y, px, py);
        if (d < nearestEnemyPropDist) nearestEnemyPropDist = d;
      }
    }
    if (nearestEnemyPropDist < 999) {
      score += (30 - nearestEnemyPropDist) * 2;
    }
  }

  if (canCapture) {
    // Measure capture urgency: how many uncaptured properties vs available capturers
    const ownCapturers = Object.values(state.units).filter(
      (u) =>
        u.owner_id === playerId && !u.is_loaded && (getUnitData(u.unit_type)?.can_capture ?? false)
    ).length;
    let uncapturedCount = 0;

    // Weight proximity by property value — pull infantry toward factories/cities first
    const propWeight: Record<string, number> = {
      hq: 3.0,
      factory: 2.5,
      city: 1.5,
      airport: 1.0,
      port: 0.6,
    };
    let bestWeightedPropScore = 0;
    for (let py = 0; py < state.map_height; py++) {
      for (let px = 0; px < state.map_width; px++) {
        const t = getTile(state, px, py);
        const td = t ? getTerrainData(t.terrain_type) : null;
        // Don't target allied or own properties for capture
        if (td?.can_capture && t && !isAllyOrSelf(state, playerId, t.owner_id)) {
          uncapturedCount++;
          const d = manhattanDistance(x, y, px, py);
          const w = propWeight[t.terrain_type] ?? 1.0;
          // In-progress captures get a huge pull so the capturer finishes the job
          const chainBonus = t.capture_points < 20 ? 2.0 : 1.0;
          const mapDiag = state.map_width + state.map_height;
          const propScore = (mapDiag - d) * w * chainBonus;
          if (propScore > bestWeightedPropScore) bestWeightedPropScore = propScore;
        }
      }
    }
    // Urgency multiplier: more uncaptured props per capturer = push harder
    const urgency = Math.min(2.0, uncapturedCount / Math.max(ownCapturers, 1));
    score += bestWeightedPropScore * 8 * urgency;
  }

  if (options?.objectiveX !== undefined && options.objectiveY !== undefined) {
    const objectiveDistance = manhattanDistance(x, y, options.objectiveX, options.objectiveY);
    score += Math.max(0, 40 - objectiveDistance) * (canCapture ? 4 : 2);
  }

  if (options?.openingTurn) {
    if (tile.owner_id === playerId) score -= canCapture ? 18 : 10;
    if (tile.terrain_type === "hq") score -= canCapture ? 40 : 25;
    if (
      tile.terrain_type === "factory" ||
      tile.terrain_type === "airport" ||
      tile.terrain_type === "port"
    ) {
      score -= canCapture ? 20 : 15;
    }
  }

  if (
    options?.avoidOwnedProduction &&
    tile.owner_id === playerId &&
    (tile.terrain_type === "factory" ||
      tile.terrain_type === "airport" ||
      tile.terrain_type === "port")
  ) {
    score -= 120;
  }

  // Repel units from own HQ area — don't camp at home
  if (options?.avoidOwnedProduction && tile.owner_id === playerId && tile.terrain_type === "hq") {
    score -= 150;
  }

  return score;
}

// ── Combat helpers ───────────────────────────────────────────────────────────

function findBestAttack(unit: UnitState, state: GameState, playerId: number): GameCommand | null {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return null;
  const attackerCost = unitData.cost;

  let bestTarget: UnitState | null = null;
  let bestScore = -Infinity;
  let bestWeapon = 0;

  for (let wi = 0; wi < unitData.weapons.length; wi++) {
    const weapon = unitData.weapons[wi];
    const isIndirect = weapon.min_range > 1;
    const attackable = getAttackableTiles(state, unit, unit.x, unit.y, wi);
    for (const pos of attackable) {
      const target = getUnitAt(state, pos.x, pos.y);
      if (!target || isAllyOrSelf(state, playerId, target.owner_id)) continue;
      if (!canAttack(unit, target, state, wi)) continue;

      const { damage } = calculateDamage(unit, target, state, wi, false);
      const targetData = getUnitData(target.unit_type);
      const targetValue = targetData?.cost ?? 0;
      const isKill = damage >= target.hp;

      // Estimate counter-attack damage. Indirect fire and kill shots are free hits.
      let counterDamage = 0;
      if (!isKill && !isIndirect && targetData) {
        // Simulate the target surviving with reduced HP and countering
        const targetAfterHp = target.hp - damage;
        for (let twi = 0; twi < targetData.weapons.length; twi++) {
          const tw = targetData.weapons[twi];
          if (tw.min_range > 1) continue; // indirect can't counter
          const baseDmg = tw.damage_table[unit.unit_type] ?? 0;
          if (baseDmg <= 0) continue;
          // Simplified AW counter formula: base * (targetAfterHp/10)
          const est = Math.floor((baseDmg * (targetAfterHp / 10)) / 10);
          if (est > counterDamage) counterDamage = est;
        }
      }

      // Score = value dealt - value taken. Free hits and kills score highest.
      const valueDamaged = (damage / 10) * targetValue;
      const valueLost = (counterDamage / 10) * attackerCost;
      let score = valueDamaged - valueLost;

      // Bonus for kills (removes unit from board entirely)
      if (isKill) score += targetValue * 0.5;

      // Bonus for free hits (indirect fire, no counter weapon)
      if (counterDamage === 0 && !isKill) score += 500;

      // Skip bad trades: we lose more value than we deal (unless it's a kill)
      if (!isKill && valueLost > valueDamaged * 1.2) continue;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
        bestWeapon = wi;
      }
    }
  }

  if (bestTarget && bestScore > 0) {
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
  vis: boolean[][] | null = null,
  options?: {
    objectiveX?: number;
    objectiveY?: number;
    openingTurn?: boolean;
    avoidOwnedProduction?: boolean;
  }
): GameCommand | null {
  const reachable = getReachableTiles(state, unit);
  if (reachable.length === 0) return null;

  const cap = unitData?.can_capture ?? false;
  let bestTile = { x: -1, y: -1 };
  let bestScore = -Infinity;

  for (const pos of reachable) {
    if (getUnitAt(state, pos.x, pos.y)) continue;
    const score = scoreTileForAiMove(pos.x, pos.y, state, playerId, cap, vis, options);
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
  vis: boolean[][] | null = null,
  options?: {
    objectiveX?: number;
    objectiveY?: number;
    openingTurn?: boolean;
    avoidOwnedProduction?: boolean;
  }
): HeuristicHint | null {
  if (unit.has_moved || unit.has_acted || unit.is_loaded) return null;
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return null;
  const moveCmd = findBestMove(unit, state, unit.owner_id, unitData, vis, options);
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

    // Kill shots first (clear enemies off properties), then capture, then other attacks
    if (unitData.can_capture && unitData.weapons.length > 0) {
      const killShot = findKillShot(movedUnit, stateAfterMove, unit.owner_id);
      if (killShot && killShot.type === "ATTACK") {
        hint.followUp = "ATTACK";
        hint.followUpDetail = `target_id=${killShot.target_id} weapon_index=${killShot.weapon_index}`;
        return hint;
      }
    }

    if (unitData.can_capture) {
      const tile = getTile(stateAfterMove, movedUnit.x, movedUnit.y);
      const td = tile ? getTerrainData(tile.terrain_type) : null;
      if (td?.can_capture && tile && !isAllyOrSelf(stateAfterMove, unit.owner_id, tile.owner_id)) {
        hint.followUp = "CAPTURE";
        return hint;
      }
    }

    if (unitData.weapons.length > 0) {
      const attack = findBestAttack(movedUnit, stateAfterMove, unit.owner_id);
      if (attack && attack.type === "ATTACK") {
        hint.followUp = "ATTACK";
        hint.followUpDetail = `target_id=${attack.target_id} weapon_index=${attack.weapon_index}`;
        return hint;
      }
    }
  } catch {
    // If simulation fails, still return the move with WAIT
  }

  return hint;
}

// ── Per-unit decision ────────────────────────────────────────────────────────

/** Check if any attack from this position is a kill shot (damage >= target HP). */
function findKillShot(unit: UnitState, state: GameState, playerId: number): GameCommand | null {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData || unitData.weapons.length === 0) return null;

  let bestCmd: GameCommand | null = null;
  let bestValue = 0;

  for (let wi = 0; wi < unitData.weapons.length; wi++) {
    const attackable = getAttackableTiles(state, unit, unit.x, unit.y, wi);
    for (const pos of attackable) {
      const target = getUnitAt(state, pos.x, pos.y);
      if (!target || isAllyOrSelf(state, playerId, target.owner_id)) continue;
      if (!canAttack(unit, target, state, wi)) continue;

      const { damage } = calculateDamage(unit, target, state, wi, false);
      if (damage >= target.hp) {
        const targetData = getUnitData(target.unit_type);
        const value = targetData?.cost ?? 0;
        if (value > bestValue) {
          bestValue = value;
          bestCmd = {
            type: "ATTACK",
            player_id: playerId,
            attacker_id: unit.id,
            target_id: target.id,
            weapon_index: wi,
          };
        }
      }
    }
  }
  return bestCmd;
}

function decideUnitActions(
  unit: UnitState,
  state: GameState,
  playerId: number,
  options?: { openingTurn?: boolean; avoidOwnedProduction?: boolean }
): GameCommand[] {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return [{ type: "WAIT", player_id: playerId, unit_id: unit.id }];

  const cap = unitData.can_capture;
  const hasWeapons = unitData.weapons.length > 0;

  // 1. Non-capturers: attack if in range (any profitable attack)
  if (hasWeapons && !unit.has_acted && !cap) {
    const attack = findBestAttack(unit, state, playerId);
    if (attack) return [attack];
  }

  // 2. Capturers: finish off enemies first (kill shots clear units off properties),
  //    then capture if on a property. Per competitive AW rules: "always attack if
  //    finish off (damage >= enemy HP)" takes priority, but don't waste turns on
  //    chip damage when there's a property to capture.
  if (cap && !unit.has_acted) {
    const killShot = hasWeapons ? findKillShot(unit, state, playerId) : null;
    if (killShot) return [killShot];

    const tile = getTile(state, unit.x, unit.y);
    const terrainData = tile ? getTerrainData(tile.terrain_type) : null;
    if (terrainData?.can_capture && tile && !isAllyOrSelf(state, playerId, tile.owner_id)) {
      return [{ type: "CAPTURE", player_id: playerId, unit_id: unit.id }];
    }
  }

  // 3. Move toward objective
  const cmds: GameCommand[] = [];
  if (!unit.has_moved) {
    const moveCmd = findBestMove(unit, state, playerId, unitData, null, options);
    if (moveCmd) {
      cmds.push(moveCmd);
      const stateAfterMove = applyCommand(state, moveCmd);
      const movedUnit = getUnit(stateAfterMove, unit.id);
      if (!movedUnit) return cmds;

      // After moving: kill shots first, then capture, then any other attack
      if (cap && hasWeapons) {
        const killShot = findKillShot(movedUnit, stateAfterMove, playerId);
        if (killShot) {
          cmds.push(killShot);
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

      if (hasWeapons) {
        const attack = findBestAttack(movedUnit, stateAfterMove, playerId);
        if (attack) {
          cmds.push(attack);
          return cmds;
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
  const analysis = analyzeTacticalState(state, playerId);

  // Count own units by role
  const ownUnits = Object.values(state.units).filter(
    (u) => u.owner_id === playerId && !u.is_loaded
  );
  const infantryCount = ownUnits.filter(
    (u) => u.unit_type === "infantry" || u.unit_type === "mech"
  ).length;
  const combatCount = ownUnits.filter(
    (u) =>
      u.unit_type !== "infantry" &&
      u.unit_type !== "mech" &&
      u.unit_type !== "apc" &&
      u.unit_type !== "t_copter"
  ).length;
  const totalUnits = infantryCount + combatCount;

  // Income = owned properties * 1000 (standard funds)
  let ownedProps = 0;
  let uncapturedProps = 0;
  for (let py = 0; py < state.map_height; py++) {
    for (let px = 0; px < state.map_width; px++) {
      const t = getTile(state, px, py);
      if (!t) continue;
      const td = getTerrainData(t.terrain_type);
      if (!td?.can_capture) continue;
      if (isAllyOrSelf(state, playerId, t.owner_id)) ownedProps++;
      else uncapturedProps++;
    }
  }
  const income = ownedProps * 1000;

  // Target infantry ratio based on income tiers from competitive AW strategy doc.
  // Early game: mostly infantry to expand. As income grows, shift to combat units.
  // "First non-infantry unit is always a tank."
  let targetInfantryRatio: number;
  if (income <= 6000) targetInfantryRatio = 0.7;
  else if (income <= 9000) targetInfantryRatio = 0.6;
  else if (income <= 15000) targetInfantryRatio = 0.45;
  else targetInfantryRatio = 0.35;

  // Are we over the infantry ratio? If so, strongly prefer combat units.
  const currentInfantryRatio = totalUnits > 0 ? infantryCount / totalUnits : 1;
  const overInfantryRatio = currentInfantryRatio > targetInfantryRatio;

  // Collect open factories, then decide what to build from each
  const openFactories: { x: number; y: number; canProduce: string[] }[] = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      const canProduce = terrainData?.can_produce ?? [];
      if (canProduce.length === 0) continue;
      if (getUnitAt(state, x, y)) continue;
      if (analysis.deadProductionTraps.some((trap) => trap.x === x && trap.y === y)) continue;
      openFactories.push({ x, y, canProduce });
    }
  }

  const ud = (t: string) => getUnitData(t);
  const available = (t: string, canProduce: string[]) => canProduce.includes(t) && ud(t) !== null;

  // Track how many infantry we're building this turn to maintain ratio
  let infantryBuiltThisTurn = 0;

  for (const fac of openFactories) {
    if (funds < 1000) break;

    const picks = getBuildPick(fac.canProduce);
    // Filter transports/naval if flagged
    const filteredPicks =
      analysis.productionNeeds.tooManyTransports ||
      analysis.productionNeeds.avoidSpeculativeTransportBuys ||
      analysis.productionNeeds.avoidSpeculativeNavalBuys
        ? picks.filter(
            (pick) =>
              ![
                "apc",
                "t_copter",
                "lander",
                "black_boat",
                "submarine",
                "cruiser",
                "battleship",
                "carrier",
              ].includes(pick.type)
          )
        : picks;

    for (const pick of filteredPicks) {
      if (funds >= pick.cost) {
        commands.push({
          type: "BUY_UNIT",
          player_id: playerId,
          unit_type: pick.type,
          facility_x: fac.x,
          facility_y: fac.y,
        });
        funds -= pick.cost;
        if (pick.type === "infantry" || pick.type === "mech") infantryBuiltThisTurn++;
        break;
      }
    }
  }

  return commands;

  function getBuildPick(canProduce: string[]): { type: string; cost: number }[] {
    // Reactive counters take top priority
    if (analysis.productionNeeds.needAirCounter) {
      return [
        available("anti_air", canProduce) ? { type: "anti_air", cost: ud("anti_air")!.cost } : null,
        available("fighter", canProduce) ? { type: "fighter", cost: ud("fighter")!.cost } : null,
        available("missile", canProduce) ? { type: "missile", cost: ud("missile")!.cost } : null,
        available("tank", canProduce) ? { type: "tank", cost: ud("tank")!.cost } : null,
        available("infantry", canProduce) ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      ].filter((p): p is { type: string; cost: number } => p !== null);
    }

    if (analysis.productionNeeds.needFrontlineArmor) {
      return [
        available("md_tank", canProduce) && funds >= (ud("md_tank")?.cost ?? Infinity)
          ? { type: "md_tank", cost: ud("md_tank")!.cost }
          : null,
        available("tank", canProduce) ? { type: "tank", cost: ud("tank")!.cost } : null,
        available("b_copter", canProduce) ? { type: "b_copter", cost: ud("b_copter")!.cost } : null,
        available("infantry", canProduce) ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      ].filter((p): p is { type: string; cost: number } => p !== null);
    }

    // Over the infantry ratio OR have enough income — build combat units.
    // Per competitive AW: "first non-infantry unit is always a tank", and
    // "build from every factory every turn" — never leave funds unspent.
    if (overInfantryRatio || (income >= 7000 && combatCount === 0)) {
      return [
        available("tank", canProduce) ? { type: "tank", cost: ud("tank")!.cost } : null,
        available("md_tank", canProduce) && funds >= 16000 && combatCount >= 3
          ? { type: "md_tank", cost: ud("md_tank")!.cost }
          : null,
        available("anti_air", canProduce) ? { type: "anti_air", cost: ud("anti_air")!.cost } : null,
        available("b_copter", canProduce) ? { type: "b_copter", cost: ud("b_copter")!.cost } : null,
        available("recon", canProduce) ? { type: "recon", cost: ud("recon")!.cost } : null,
        // Artillery only behind a tank screen
        combatCount >= 2 && available("artillery", canProduce)
          ? { type: "artillery", cost: ud("artillery")!.cost }
          : null,
        available("mech", canProduce) ? { type: "mech", cost: ud("mech")!.cost } : null,
        available("infantry", canProduce) ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      ].filter((p): p is { type: string; cost: number } => p !== null);
    }

    // Under infantry ratio — need more capturers, but still mix in combat if
    // we have multiple factories and enough income per the strategy doc tiers.
    // "Infantry + tank baseline" at 7-9k, "2x infantry + tank" at 9-12k.
    if (
      income >= 7000 &&
      infantryBuiltThisTurn >= 1 &&
      uncapturedProps <= infantryCount + infantryBuiltThisTurn
    ) {
      // Already built an infantry this turn and have enough capturers — build combat
      return [
        available("tank", canProduce) ? { type: "tank", cost: ud("tank")!.cost } : null,
        available("recon", canProduce) ? { type: "recon", cost: ud("recon")!.cost } : null,
        available("mech", canProduce) ? { type: "mech", cost: ud("mech")!.cost } : null,
        available("infantry", canProduce) ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      ].filter((p): p is { type: string; cost: number } => p !== null);
    }

    // Default: infantry first
    return [
      available("infantry", canProduce) ? { type: "infantry", cost: ud("infantry")!.cost } : null,
      available("mech", canProduce) ? { type: "mech", cost: ud("mech")!.cost } : null,
      available("tank", canProduce) ? { type: "tank", cost: ud("tank")!.cost } : null,
      available("recon", canProduce) ? { type: "recon", cost: ud("recon")!.cost } : null,
    ].filter((p): p is { type: string; cost: number } => p !== null);
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

// Run a full heuristic turn synchronously — returns all commands the AI wants to execute
export function runHeuristicTurn(state: GameState, playerId: number): GameCommand[] {
  const commands: GameCommand[] = [];
  let currentState = duplicateState(state);

  const isOpeningTurn = state.turn_number <= state.players.length * 2;
  const moveOptions = {
    openingTurn: isOpeningTurn,
    avoidOwnedProduction: true,
  };

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

    const unitCmds = decideUnitActions(freshUnit, currentState, playerId, moveOptions);
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
