/**
 * Combat: Advance Wars–style damage formula, luck rolls via {@link ./rng}, counterattacks, and
 * execution hooks used from {@link ./apply-command}. Pure where possible; reads terrain and unit
 * data from {@link ./data-loader}.
 */

import type { GameState, UnitState, TileState, CombatResult } from "./types";
import { getTile, incrementAttackCounter } from "./game-state";
import { getUnitData, getTerrainData } from "./data-loader";
import { rollLuck } from "./rng";
import { manhattanDistance } from "./pathfinding";

export function calculateDamage(
  attacker: UnitState,
  defender: UnitState,
  state: GameState,
  weaponIndex = 0,
  _isCounter = false
): { damage: number; luckRoll: number } {
  const attackerData = getUnitData(attacker.unit_type);
  if (!attackerData || weaponIndex >= attackerData.weapons.length)
    return { damage: 0, luckRoll: 0 };

  const weapon = attackerData.weapons[weaponIndex];
  const baseDamage = weapon.damage_table[defender.unit_type] ?? 0;
  if (baseDamage <= 0) return { damage: 0, luckRoll: 0 };

  // ── Official AW damage formula ──────────────────────────────────────────
  // damage% = B × (Ahp / 10) × (100 − Dhp × Dts) / 100 + luck
  // HP_damage = floor(damage% / 10)
  //
  //   B   = base damage from damage chart
  //   Ahp = attacker HP (1–10)
  //   Dhp = defender HP (1–10)
  //   Dts = defender terrain stars (0 for air units; ground & sea get stars)
  //   luck = additive, random 0 to (Ahp − 1)

  // Step 1: Base damage scaled by attacker HP
  let damagePercent = baseDamage * (attacker.hp / 10.0);

  // Step 2: Terrain defense — air units NEVER get terrain defense;
  // ground and sea units benefit from terrain stars.
  const defenderData = getUnitData(defender.unit_type);
  let totalDefenseStars = 0;

  if (defenderData && defenderData.domain !== "air") {
    const defenderTile = getTile(state, defender.x, defender.y);
    if (defenderTile) {
      const terrainType = defenderTile.has_fob ? "temporary_fob" : defenderTile.terrain_type;
      const terrainData = getTerrainData(terrainType);
      totalDefenseStars = terrainData?.defense_stars ?? 0;

      // Trench bonus — infantry only
      if (defenderTile.has_trench && defenderData.tags.includes("infantry_class")) {
        totalDefenseStars += 2;
      }
    }
  }

  // Official: defense scales with defender HP. A 1HP unit on 3★ terrain
  // only gets 3% reduction; a 10HP unit gets 30%.
  damagePercent = (damagePercent * (100 - defender.hp * totalDefenseStars)) / 100;

  // Step 3: Luck — additive, 0 to (Ahp − 1) in official AW.
  // We use the deterministic RNG, normalize to [0, 1], then scale.
  const luckRoll = rollLuck(
    state.match_seed,
    state.turn_number,
    state.attack_counter,
    attacker.id,
    defender.id,
    state.luck_min,
    state.luck_max
  );
  const luckRange = state.luck_max - state.luck_min;
  const luckNormalized = luckRange > 0 ? (luckRoll - state.luck_min) / luckRange : 0;
  const luckValue = Math.floor(luckNormalized * attacker.hp);
  damagePercent += luckValue;

  // Step 4: Convert to HP units — floor, not round (per official AW)
  let finalDamage = Math.floor(damagePercent / 10.0);
  finalDamage = Math.max(0, Math.min(finalDamage, defender.hp));
  return { damage: finalDamage, luckRoll };
}

function canCounterattack(defender: UnitState, attacker: UnitState): boolean {
  const defenderData = getUnitData(defender.unit_type);
  if (!defenderData || defenderData.weapons.length === 0) return false;

  const dist = manhattanDistance(defender.x, defender.y, attacker.x, attacker.y);

  for (const weapon of defenderData.weapons) {
    if (weapon.can_counterattack === false) continue;
    if (dist >= weapon.min_range && dist <= weapon.max_range) {
      if ((weapon.damage_table[attacker.unit_type] ?? 0) <= 0) continue;
      // Check ammo for limited-ammo weapons
      if (weapon.ammo > 0) {
        const currentAmmo = defender.ammo[weapon.id] ?? weapon.ammo;
        if (currentAmmo <= 0) continue;
      }
      return true;
    }
  }
  return false;
}

export function getCounterWeaponIndex(defender: UnitState, attacker: UnitState): number {
  const defenderData = getUnitData(defender.unit_type);
  if (!defenderData) return 0;

  const dist = manhattanDistance(defender.x, defender.y, attacker.x, attacker.y);

  for (let i = 0; i < defenderData.weapons.length; i++) {
    const weapon = defenderData.weapons[i];
    if (weapon.can_counterattack === false) continue;
    if (dist >= weapon.min_range && dist <= weapon.max_range) {
      if ((weapon.damage_table[attacker.unit_type] ?? 0) <= 0) continue;
      // Check ammo for limited-ammo weapons
      if (weapon.ammo > 0) {
        const currentAmmo = defender.ammo[weapon.id] ?? weapon.ammo;
        if (currentAmmo <= 0) continue;
      }
      return i;
    }
  }
  return 0;
}

// Execute full combat. Mutates units in-place on the working state copies passed in.
// Returns result and the new GameState (with updated attack_counter).
export function executeCombat(
  attackerIn: UnitState,
  defenderIn: UnitState,
  stateIn: GameState,
  weaponIndex = 0
): { result: CombatResult; state: GameState; attacker: UnitState; defender: UnitState } {
  let state = incrementAttackCounter(stateIn);
  let attacker = { ...attackerIn };
  let defender = { ...defenderIn };

  const attackResult = calculateDamage(attacker, defender, state, weaponIndex, false);
  defender = { ...defender, hp: Math.max(0, defender.hp - attackResult.damage) };

  const result: CombatResult = {
    attacker_damage_dealt: attackResult.damage,
    defender_damage_dealt: 0,
    attacker_final_hp: attacker.hp,
    defender_final_hp: defender.hp,
    attacker_destroyed: false,
    defender_destroyed: defender.hp <= 0,
    luck_roll_attacker: attackResult.luckRoll,
    luck_roll_defender: 0,
  };

  if (!result.defender_destroyed && canCounterattack(defender, attacker)) {
    state = incrementAttackCounter(state);

    const counterWeapon = getCounterWeaponIndex(defender, attacker);
    const counterResult = calculateDamage(defender, attacker, state, counterWeapon, true);
    attacker = { ...attacker, hp: Math.max(0, attacker.hp - counterResult.damage) };

    result.luck_roll_defender = counterResult.luckRoll;
    result.defender_damage_dealt = counterResult.damage;
    result.attacker_final_hp = attacker.hp;
    result.attacker_destroyed = attacker.hp <= 0;
  }

  result.attacker_final_hp = attacker.hp;
  return { result, state, attacker, defender };
}

export function canAttack(
  attacker: UnitState,
  defender: UnitState,
  state: GameState,
  weaponIndex = 0
): boolean {
  return canAttackFromPosition(attacker, defender, state, weaponIndex, attacker.x, attacker.y);
}

export function canAttackFromPosition(
  attacker: UnitState,
  defender: UnitState,
  _state: GameState,
  weaponIndex: number,
  fromX: number,
  fromY: number
): boolean {
  // Submerged subs can only attack with torpedoes (handled by weapon table);
  // but non-sub units cannot target a submerged sub unless adjacent
  if (defender.is_submerged) {
    const dist = manhattanDistance(fromX, fromY, defender.x, defender.y);
    if (dist > 1) return false;
  }

  // Hidden stealth units cannot be targeted unless adjacent
  if (defender.is_hidden) {
    const dist = manhattanDistance(fromX, fromY, defender.x, defender.y);
    if (dist > 1) return false;
  }

  const attackerData = getUnitData(attacker.unit_type);
  if (!attackerData || weaponIndex >= attackerData.weapons.length) return false;

  const weapon = attackerData.weapons[weaponIndex];
  if ((weapon.damage_table[defender.unit_type] ?? 0) <= 0) return false;

  const dist = manhattanDistance(fromX, fromY, defender.x, defender.y);
  if (dist < weapon.min_range || dist > weapon.max_range) return false;

  // Ammo check
  if (weapon.ammo > 0) {
    const currentAmmo = attacker.ammo[weapon.id] ?? weapon.ammo;
    if (currentAmmo <= 0) return false;
  }

  return true;
}

export function getBestWeapon(attacker: UnitState, defender: UnitState, state: GameState): number {
  const attackerData = getUnitData(attacker.unit_type);
  if (!attackerData) return -1;

  let bestIndex = -1;
  let bestDamage = 0;

  for (let i = 0; i < attackerData.weapons.length; i++) {
    if (canAttack(attacker, defender, state, i)) {
      const { damage: dmg } = calculateDamage(attacker, defender, state, i, false);
      if (dmg > bestDamage) {
        bestDamage = dmg;
        bestIndex = i;
      }
    }
  }
  return bestIndex;
}

export function executeSelfDestruct(
  uav: UnitState,
  target: UnitState,
  stateIn: GameState
): { damage: number; state: GameState } {
  const uavData = getUnitData(uav.unit_type);
  const baseDamage = uavData?.self_destruct_damage ?? 40;

  // Terrain defense — air units don't benefit
  const targetData = getUnitData(target.unit_type);
  let defenseStars = 0;
  if (targetData && targetData.domain !== "air") {
    const targetTile = getTile(stateIn, target.x, target.y);
    if (targetTile) {
      const terrainType = targetTile.has_fob ? "temporary_fob" : targetTile.terrain_type;
      defenseStars = getTerrainData(terrainType)?.defense_stars ?? 0;
    }
  }

  // Use HP-scaled defense like the main formula
  let scaledDamage = (baseDamage * (100 - target.hp * defenseStars)) / 100;

  let state = incrementAttackCounter(stateIn);
  const luckRoll = rollLuck(
    state.match_seed,
    state.turn_number,
    state.attack_counter,
    uav.id,
    target.id,
    state.luck_min,
    state.luck_max
  );
  scaledDamage = scaledDamage * (1.0 + luckRoll);

  let finalDamage = Math.round(scaledDamage / 10.0);
  finalDamage = Math.max(0, Math.min(finalDamage, target.hp));
  return { damage: finalDamage, state };
}

export function damageFob(
  attacker: UnitState,
  tile: TileState,
  stateIn: GameState
): { damage: number; state: GameState } {
  const attackerData = getUnitData(attacker.unit_type);
  if (!attackerData || attackerData.weapons.length === 0) return { damage: 0, state: stateIn };

  const baseDamage = 50;
  const hpModifier = attacker.hp / 10.0;
  let scaledDamage = baseDamage * hpModifier;

  let state = incrementAttackCounter(stateIn);
  const luckRoll = rollLuck(
    state.match_seed,
    state.turn_number,
    state.attack_counter,
    attacker.id,
    0,
    state.luck_min,
    state.luck_max
  );
  scaledDamage = scaledDamage * (1.0 + luckRoll);

  let finalDamage = Math.round(scaledDamage / 10.0);
  finalDamage = Math.max(0, Math.min(finalDamage, tile.fob_hp));
  return { damage: finalDamage, state };
}
