"use client";
// Unit action popup: Move/Attack/Capture/Wait/etc.
// Shown after selecting a unit with a pending move destination.

import { useGameStore } from "../store/game-store";
import { getTerrainData, getUnitData } from "../game/data-loader";
import { getTile } from "../game/game-state";

export default function ActionMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const selectedUnit = useGameStore((s) => s.selectedUnit);
  const pendingMove = useGameStore((s) => s.pendingMove);
  const isAnimating = useGameStore((s) => s.isAnimating);
  const startMoveAnimation = useGameStore((s) => s.startMoveAnimation);
  const cancelPendingMove = useGameStore((s) => s.cancelPendingMove);

  if (!gameState || !selectedUnit) return null;

  // Show menu when there's a pending move (unit picked destination but hasn't confirmed)
  if (!pendingMove) return null;
  if (selectedUnit.has_acted) return null;
  
  // Hide menu during animation
  if (isAnimating) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer || selectedUnit.owner_id !== currentPlayer.id) return null;

  const unitData = getUnitData(selectedUnit.unit_type);
  if (!unitData) return null;

  // Get terrain at pending destination (not current position)
  const tile = getTile(gameState, pendingMove.x, pendingMove.y);
  const terrainData = tile ? getTerrainData(tile.terrain_type) : null;

  const canCapture = unitData.can_capture && terrainData?.can_capture && tile?.owner_id !== currentPlayer.id;
  const canDigTrench = unitData.special_actions.includes("dig_trench") && terrainData?.can_build_trench && !tile?.has_trench;
  const canBuildFob = unitData.special_actions.includes("build_fob") && terrainData?.can_build_fob && !tile?.has_fob;

  const handleCapture = () => {
    startMoveAnimation({ type: "CAPTURE", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleWait = () => {
    startMoveAnimation({ type: "WAIT", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleDigTrench = () => {
    startMoveAnimation({
      type: "DIG_TRENCH",
      player_id: currentPlayer.id,
      unit_id: selectedUnit.id,
      target_x: pendingMove.x,
      target_y: pendingMove.y,
    });
  };

  const handleBuildFob = () => {
    startMoveAnimation({
      type: "BUILD_FOB",
      player_id: currentPlayer.id,
      unit_id: selectedUnit.id,
      target_x: pendingMove.x,
      target_y: pendingMove.y,
    });
  };

  return (
    <div className="absolute z-10 bg-gray-900 border border-gray-600 rounded shadow-lg text-sm min-w-28"
         style={{ bottom: "4rem", right: "1rem" }}>
      <div className="px-3 py-1.5 text-gray-400 text-xs uppercase border-b border-gray-700">
        {unitData.name}
      </div>

      {canCapture && (
        <button onClick={handleCapture}
          className="w-full text-left px-3 py-2 hover:bg-gray-700 text-yellow-300">
          Capture
        </button>
      )}

      {canDigTrench && (
        <button onClick={handleDigTrench}
          className="w-full text-left px-3 py-2 hover:bg-gray-700 text-orange-300">
          Dig Trench
        </button>
      )}

      {canBuildFob && (
        <button onClick={handleBuildFob}
          className="w-full text-left px-3 py-2 hover:bg-gray-700 text-orange-300">
          Build FOB (¥5000)
        </button>
      )}

      <button onClick={handleWait}
        className="w-full text-left px-3 py-2 hover:bg-gray-700 text-gray-300">
        Wait
      </button>

      <button onClick={cancelPendingMove}
        className="w-full text-left px-3 py-2 hover:bg-gray-700 text-gray-500 border-t border-gray-700">
        Cancel
      </button>
    </div>
  );
}
