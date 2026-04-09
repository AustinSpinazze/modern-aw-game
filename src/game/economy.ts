/**
 * Economy: property income, unit purchase prices, heal/merge costs.
 * Used from {@link ./applyCommand} when resolving turns, purchases, and repairs.
 */

import type { GameState } from "./types";
import { getTile, getPlayer, updatePlayer } from "./gameState";
import { getTerrainData, getUnitData } from "./dataLoader";

export function calculateIncome(state: GameState, playerId: number): number {
  let income = 0;
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (tile?.owner_id === playerId) {
        const terrainData = getTerrainData(tile.terrain_type);
        income += terrainData?.income ?? 0;
      }
    }
  }
  return income;
}

export function applyIncome(state: GameState, playerId: number): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  const income = Math.round(calculateIncome(state, playerId) * (state.income_multiplier ?? 1));
  return updatePlayer(state, playerId, { funds: player.funds + income });
}

export function getUnitCost(unitType: string): number {
  return getUnitData(unitType)?.cost ?? 0;
}

export function deductFunds(state: GameState, playerId: number, amount: number): GameState | null {
  const player = getPlayer(state, playerId);
  if (!player || player.funds < amount) return null;
  return updatePlayer(state, playerId, { funds: player.funds - amount });
}

export function getProducibleUnits(terrainType: string): string[] {
  return getTerrainData(terrainType)?.can_produce ?? [];
}

export function canAfford(state: GameState, playerId: number, unitType: string): boolean {
  const player = getPlayer(state, playerId);
  if (!player) return false;
  return player.funds >= getUnitCost(unitType);
}

/** Cost to heal a unit by the given HP amount (1/10 of unit cost per HP). */
export function calculateHealCost(unitType: string, hpHealed: number): number {
  const cost = getUnitData(unitType)?.cost ?? 0;
  return Math.round((cost / 10) * hpHealed);
}

/** Funds refunded when merging two units whose combined HP exceeds 10. */
export function calculateMergeRefund(unitType: string, excessHp: number): number {
  const cost = getUnitData(unitType)?.cost ?? 0;
  return Math.round((cost / 10) * excessHp);
}
