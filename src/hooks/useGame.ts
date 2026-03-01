"use client";
// Convenience hook wrapping the game store + common game actions.

import { useGameStore } from "../store/game-store";
import { getCurrentPlayer, getUnitAt, getTile } from "../game/game-state";
import { getTerrainData, getUnitData } from "../game/data-loader";

export function useGame() {
  const store = useGameStore();
  const { gameState, selectedUnit, submitCommand } = store;

  const currentPlayer = gameState ? getCurrentPlayer(gameState) : null;
  const isMyTurn = (playerId: number) => currentPlayer?.id === playerId;

  const endTurn = () => {
    if (!currentPlayer) return;
    submitCommand({ type: "END_TURN", player_id: currentPlayer.id });
  };

  const selectTile = (x: number, y: number) => {
    if (!gameState || !currentPlayer) return;
    const unit = getUnitAt(gameState, x, y);
    if (unit && unit.owner_id === currentPlayer.id && !unit.is_loaded) {
      store.selectUnit(unit);
    } else {
      store.resetSelection();
    }
  };

  const canBuyAt = (x: number, y: number): boolean => {
    if (!gameState || !currentPlayer) return false;
    const tile = getTile(gameState, x, y);
    if (!tile || tile.owner_id !== currentPlayer.id) return false;
    const terrain = getTerrainData(tile.terrain_type);
    return (terrain?.can_produce.length ?? 0) > 0 && !getUnitAt(gameState, x, y);
  };

  return {
    ...store,
    currentPlayer,
    isMyTurn,
    endTurn,
    selectTile,
    canBuyAt,
  };
}
