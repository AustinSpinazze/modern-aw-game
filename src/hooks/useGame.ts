/**
 * Thin wrapper around {@link ../store/gameStore}: exposes `currentPlayer`, `endTurn`, `selectTile`,
 * `canBuyAt`, and forwards the rest of the store. Use in match UI instead of importing the store directly
 * when you only need ergonomic helpers.
 */

import { useGameStore } from "../store/gameStore";
import { getCurrentPlayer, getUnitAt, getTile } from "../game/gameState";
import { getTerrainData } from "../game/dataLoader";

export function useGame() {
  const store = useGameStore();
  const { gameState, submitCommand } = store;

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
