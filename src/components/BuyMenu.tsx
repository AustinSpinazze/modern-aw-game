// Unit purchase modal shown when clicking an owned, unoccupied facility.

import { useState } from "react";
import { useGameStore } from "../store/game-store";
import { getTerrainData, getUnitData } from "../game/data-loader";
import { getTile, getPlayer } from "../game/game-state";
import { getProducibleUnits } from "../game/economy";

interface BuyMenuProps {
  facilityX: number;
  facilityY: number;
  onClose: () => void;
}

export default function BuyMenu({ facilityX, facilityY, onClose }: BuyMenuProps) {
  const gameState = useGameStore((s) => s.gameState);
  const submitCommand = useGameStore((s) => s.submitCommand);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer) return null;

  const tile = getTile(gameState, facilityX, facilityY);
  if (!tile) return null;

  const producible = getProducibleUnits(tile.terrain_type);
  const player = getPlayer(gameState, currentPlayer.id)!;
  const terrainData = getTerrainData(tile.terrain_type);

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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-600 rounded-xl shadow-2xl w-96 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-bold">Purchase Unit</h2>
            <div className="text-gray-400 text-xs capitalize">
              {terrainData?.name ?? tile.terrain_type}
            </div>
          </div>
          <div className="text-right">
            <div className="text-yellow-300 font-mono font-bold">
              ¥{player.funds.toLocaleString()}
            </div>
            <div className="text-gray-500 text-xs">Available</div>
          </div>
        </div>

        {/* Unit list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-800">
          {producible.map((unitType) => {
            const unitData = getUnitData(unitType);
            if (!unitData) return null;
            const canBuy = player.funds >= unitData.cost;
            const isExpanded = expanded === unitType;
            const primaryWeapon = unitData.weapons[0];
            const secondaryWeapon = unitData.weapons[1];

            return (
              <div key={unitType} className={`${canBuy ? "" : "opacity-50"}`}>
                <div
                  className={`flex items-center px-4 py-3 gap-3 ${canBuy ? "cursor-pointer hover:bg-gray-800 transition-colors" : "cursor-not-allowed"}`}
                  onClick={() => canBuy && setExpanded(isExpanded ? null : unitType)}
                >
                  {/* Unit info */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${canBuy ? "text-white" : "text-gray-500"}`}>
                      {unitData.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span className="capitalize">{unitData.move_type}</span>
                      <span>·</span>
                      <span>{unitData.move_points} MP</span>
                      {primaryWeapon && (
                        <>
                          <span>·</span>
                          <span>
                            Rng {primaryWeapon.min_range}–{primaryWeapon.max_range}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cost */}
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono font-bold text-sm ${canBuy ? "text-yellow-300" : "text-gray-600"}`}
                    >
                      ¥{unitData.cost.toLocaleString()}
                    </div>
                    {isExpanded && <div className="text-gray-500 text-xs">▲ Less</div>}
                    {!isExpanded && <div className="text-gray-600 text-xs">▼ More</div>}
                  </div>
                </div>

                {/* Expanded stat block */}
                {isExpanded && (
                  <div className="px-4 pb-3 bg-gray-800/50 space-y-2">
                    {/* Weapons */}
                    <div className="text-xs text-gray-400 uppercase tracking-wide pt-1">
                      Weapons
                    </div>
                    {unitData.weapons.length === 0 && (
                      <div className="text-xs text-gray-500 italic">No weapons (transport)</div>
                    )}
                    {primaryWeapon && (
                      <div className="text-xs">
                        <span className="text-orange-300 font-medium">
                          {(primaryWeapon as any).name ??
                            primaryWeapon.id
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </span>
                        {primaryWeapon.ammo > 0 && (
                          <span className="text-gray-500 ml-1">({primaryWeapon.ammo} ammo)</span>
                        )}
                        <span className="text-gray-400 ml-1">
                          · Rng {primaryWeapon.min_range}–{primaryWeapon.max_range}
                        </span>
                      </div>
                    )}
                    {secondaryWeapon && (
                      <div className="text-xs">
                        <span className="text-yellow-600 font-medium">
                          {(secondaryWeapon as any).name ??
                            secondaryWeapon.id
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </span>
                        <span className="text-gray-500 ml-1">(∞)</span>
                        <span className="text-gray-400 ml-1">
                          · Rng {secondaryWeapon.min_range}–{secondaryWeapon.max_range}
                        </span>
                      </div>
                    )}

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                      <div>
                        <div className="text-gray-500">Move</div>
                        <div className="text-white font-medium">{unitData.move_points}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Type</div>
                        <div className="text-white font-medium capitalize">
                          {unitData.move_type}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Vision</div>
                        <div className="text-white font-medium">
                          {unitData.vision ?? "—"}
                        </div>
                      </div>
                    </div>

                    {/* Buy button */}
                    <button
                      onClick={() => handleBuy(unitType)}
                      className="w-full mt-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition-colors text-sm"
                    >
                      Deploy — ¥{unitData.cost.toLocaleString()}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
