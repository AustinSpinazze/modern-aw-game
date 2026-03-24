// Combat system: damage calculation and execution.
// Direct port of combat.gd

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

  // Scale by attacker HP%
  const hpModifier = attacker.hp / 10.0;
  let scaledDamage = baseDamage * hpModifier;

  // Terrain defense
  const defenderTile = getTile(state, defender.x, defender.y);
  let defenseStars = 0;
  let trenchBonus = 0;

  if (defenderTile) {
    const terrainType = defenderTile.has_fob ? "temporary_fob" : defenderTile.terrain_type;
    const terrainData = getTerrainData(terrainType);
    defenseStars = terrainData?.defense_stars ?? 0;

    if (defenderTile.has_trench) {
      const defenderData = getUnitData(defender.unit_type);
      if (defenderData?.tags.includes("infantry_class")) {
        trenchBonus = 2;
      }
    }
  }

  const totalDefenseStars = defenseStars + trenchBonus;
  const defenseReduction = totalDefenseStars * 0.1;
  scaledDamage = scaledDamage * (1.0 - defenseReduction);

  // Luck roll
  const luckRoll = rollLuck(
    state.match_seed,
    state.turn_number,
    state.attack_counter,
    attacker.id,
    defender.id,
    state.luck_min,
    state.luck_max
  );
  scaledDamage = scaledDamage * (1.0 + luckRoll);

  // Convert to HP units (divide by 10, round)
  let finalDamage = Math.round(scaledDamage / 10.0);
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

  const targetTile = getTile(stateIn, target.x, target.y);
  let defenseStars = 0;
  if (targetTile) {
    const terrainType = targetTile.has_fob ? "temporary_fob" : targetTile.terrain_type;
    defenseStars = getTerrainData(terrainType)?.defense_stars ?? 0;
  }

  const defenseReduction = defenseStars * 0.1;
  let scaledDamage = baseDamage * (1.0 - defenseReduction);

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
