/**
 * Combat: AW2 / AWDS damage formula, deterministic luck via {@link ./rng}, counterattacks, and
 * execution hooks used from {@link ./applyCommand}. Pure where possible; reads terrain and unit
 * data from {@link ./dataLoader}.
 */

import type { GameState, UnitState, CombatResult } from "./types";
import { getTile, incrementAttackCounter } from "./gameState";
import { getUnitData, getTerrainData } from "./dataLoader";
import { hashCombine } from "./rng";
import { manhattanDistance } from "./pathfinding";

/** Count comms towers owned by a player — each gives +10% attack. */
function countCommsTowers(state: GameState, playerId: number): number {
  let count = 0;
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = state.tiles[y]?.[x];
      if (tile && tile.terrain_type === "comms_tower" && tile.owner_id === playerId) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Deterministic float in [0, 1] for luck rolls.
 * `salt` distinguishes independent rolls within the same combat.
 */
function deterministicRand(
  state: GameState,
  attackerId: number,
  defenderId: number,
  salt: number
): number {
  const h = hashCombine([
    state.match_seed,
    state.turn_number,
    state.attack_counter,
    attackerId,
    defenderId,
    salt,
  ]);
  return (h % 10001) / 10000.0;
}

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

  // ── AW2 / AWDS damage formula ──────────────────────────────────────────
  //
  //   a = 10 · matchupMultiplier · (1 + atkBoost)
  //       + 10 · Rand(0, goodLuck − 0.01)
  //       − 10 · Rand(0, badLuck  − 0.01)
  //
  //   b = 1 − defBoost − terrainStars · defenderHP / 100
  //
  //   damage = Round(attackerHP / 10 · a · b)
  //
  // matchupMultiplier = baseDamage / 100 (e.g. 75 → 0.75)
  // Round() = half-up rounding (0.5 → 1)
  // Special: Black Bomb = 5 HP flat, Oozium = 10 HP flat (bypass formula)

  const matchupMultiplier = baseDamage / 100;

  const commsTowers = countCommsTowers(state, attacker.owner_id);
  const atkBoost = commsTowers * 0.1;

  let a = 10 * matchupMultiplier * (1 + atkBoost);

  // Luck — two independent deterministic rolls (good luck and bad luck)
  const goodLuck = state.luck_max; // default 0.10
  const badLuck = Math.max(0, -state.luck_min); // default 0 (luck_min = 0)

  const goodLuckUpper = Math.max(0, goodLuck - 0.01);
  const badLuckUpper = Math.max(0, badLuck - 0.01);

  const goodLuckRoll = 10 * deterministicRand(state, attacker.id, defender.id, 1) * goodLuckUpper;
  const badLuckRoll = 10 * deterministicRand(state, attacker.id, defender.id, 2) * badLuckUpper;
  const netLuck = goodLuckRoll - badLuckRoll;
  a += netLuck;

  // Defense factor — air units never benefit from terrain stars
  const defenderData = getUnitData(defender.unit_type);
  const defBoost = 0; // no CO system yet; future CO powers plug in here
  let terrainStars = 0;

  if (defenderData && defenderData.domain !== "air") {
    const defenderTile = getTile(state, defender.x, defender.y);
    if (defenderTile) {
      const terrainData = getTerrainData(defenderTile.terrain_type);
      terrainStars = terrainData?.defense_stars ?? 0;
    }
  }

  const b = 1 - defBoost - (terrainStars * defender.hp) / 100;

  const rawDamage = (attacker.hp / 10) * a * b;
  let finalDamage = Math.round(rawDamage);
  finalDamage = Math.max(0, Math.min(finalDamage, defender.hp));

  return { damage: finalDamage, luckRoll: netLuck };
}

/** Whether the defender could counter-attack the attacker at current positions (range, ammo, damage > 0). */
export function canCounterattack(defender: UnitState, attacker: UnitState): boolean {
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
  const state = incrementAttackCounter(stateIn);

  // Black Bomb: flat 5 HP damage, ignoring formula and all stats
  if (uav.unit_type === "black_bomb") {
    return { damage: Math.min(5, target.hp), state };
  }

  // Generic self-destruct for other units
  const uavData = getUnitData(uav.unit_type);
  const baseDamage = uavData?.self_destruct_damage ?? 40;

  const targetData = getUnitData(target.unit_type);
  let defenseStars = 0;
  if (targetData && targetData.domain !== "air") {
    const targetTile = getTile(stateIn, target.x, target.y);
    if (targetTile) {
      defenseStars = getTerrainData(targetTile.terrain_type)?.defense_stars ?? 0;
    }
  }

  let scaledDamage = (baseDamage * (100 - target.hp * defenseStars)) / 100;

  const goodLuck = state.luck_max;
  const goodLuckUpper = Math.max(0, goodLuck - 0.01);
  const luckValue = deterministicRand(state, uav.id, target.id, 1) * goodLuckUpper;
  scaledDamage = scaledDamage * (1.0 + luckValue);

  let finalDamage = Math.round(scaledDamage / 10.0);
  finalDamage = Math.max(0, Math.min(finalDamage, target.hp));
  return { damage: finalDamage, state };
}
