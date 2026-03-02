// Unit purchase modal shown when clicking an owned, unoccupied facility.

import { useGameStore } from "../store/game-store";
import { getTerrainData, getUnitData } from "../game/data-loader";
import { getTile, getPlayer } from "../game/game-state";
import { getProducibleUnits } from "../game/economy";
import { useState } from "react";

interface BuyMenuProps {
  facilityX: number;
  facilityY: number;
  onClose: () => void;
}

export default function BuyMenu({ facilityX, facilityY, onClose }: BuyMenuProps) {
  const gameState = useGameStore((s) => s.gameState);
  const submitCommand = useGameStore((s) => s.submitCommand);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer) return null;

  const tile = getTile(gameState, facilityX, facilityY);
  if (!tile) return null;

  const producible = getProducibleUnits(tile.terrain_type);
  const player = getPlayer(gameState, currentPlayer.id)!;

  const handleBuy = (unitType: string) => {
    const result = submitCommand({
      type: "BUY_UNIT",
      player_id: currentPlayer.id,
      unit_type: unitType,
      facility_x: facilityX,
      facility_y: facilityY,
    });
    if (result.success) onClose();
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-600 rounded-lg shadow-xl w-80">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
          <h2 className="text-white font-bold">Purchase Unit</h2>
          <div className="text-yellow-300 font-mono text-sm">¥{player.funds.toLocaleString()}</div>
        </div>

        <div className="divide-y divide-gray-800">
          {producible.map((unitType) => {
            const unitData = getUnitData(unitType);
            if (!unitData) return null;
            const canBuy = player.funds >= unitData.cost;

            return (
              <button
                key={unitType}
                onClick={() => handleBuy(unitType)}
                disabled={!canBuy}
                className={`w-full flex justify-between items-center px-4 py-3 text-left transition-colors
                  ${canBuy ? "hover:bg-gray-700 text-white" : "text-gray-600 cursor-not-allowed"}`}
              >
                <div>
                  <div className="font-medium">{unitData.name}</div>
                  <div className="text-xs text-gray-400 capitalize">
                    {unitData.move_type} · {unitData.move_points} MP
                  </div>
                </div>
                <div className={`font-mono text-sm ${canBuy ? "text-yellow-300" : "text-gray-600"}`}>
                  ¥{unitData.cost.toLocaleString()}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-gray-700">
          <button onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
