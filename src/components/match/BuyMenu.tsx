/**
 * **Deploy menu** at factories/airports/ports: lists {@link ../../game/economy} producible units.
 */

import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { getTerrainData, getUnitData } from "../../game/dataLoader";
import { getTile, getPlayer } from "../../game/gameState";
import { getProducibleUnits } from "../../game/economy";
import type { WeaponData } from "../../game/types";

interface BuyMenuProps {
  facilityX: number;
  facilityY: number;
  onClose: () => void;
}

// Team color maps — match the HUD's faction palette exactly
const TEAM_HEADER_BG: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-600",
  3: "bg-yellow-500",
};
const TEAM_DEPLOY_BG: Record<number, string> = {
  0: "bg-red-500 hover:bg-red-400 active:bg-red-600",
  1: "bg-blue-500 hover:bg-blue-400 active:bg-blue-600",
  2: "bg-green-600 hover:bg-green-500 active:bg-green-700",
  3: "bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600",
};
const TEAM_SELECTED_BG: Record<number, string> = {
  0: "bg-red-50 border-l-4 border-red-400",
  1: "bg-blue-50 border-l-4 border-blue-400",
  2: "bg-green-50 border-l-4 border-green-500",
  3: "bg-yellow-50 border-l-4 border-yellow-400",
};
const TEAM_FUNDS_TEXT: Record<number, string> = {
  0: "text-red-500",
  1: "text-blue-500",
  2: "text-green-600",
  3: "text-yellow-500",
};

function weaponName(w: WeaponData): string {
  return (
    (w as any).name ?? w.id.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
  );
}

export default function BuyMenu({ facilityX, facilityY, onClose }: BuyMenuProps) {
  const gameState = useGameStore((s) => s.gameState);
  const submitCommand = useGameStore((s) => s.submitCommand);
  const [selected, setSelected] = useState<string | null>(null);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer) return null;

  const tile = getTile(gameState, facilityX, facilityY);
  if (!tile) return null;

  const producible = getProducibleUnits(tile.terrain_type);
  const player = getPlayer(gameState, currentPlayer.id)!;
  const terrainData = getTerrainData(tile.terrain_type);
  const selectedData = selected ? getUnitData(selected) : null;

  const team = currentPlayer.team;
  const headerBg = TEAM_HEADER_BG[team] ?? "bg-gray-700";
  const deployBg = TEAM_DEPLOY_BG[team] ?? "bg-gray-700 hover:bg-gray-600";
  const selectedBg = TEAM_SELECTED_BG[team] ?? "bg-gray-50 border-l-4 border-gray-400";
  const fundsText = TEAM_FUNDS_TEXT[team] ?? "text-gray-900";

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
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[75vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Faction-colored header band */}
        <div className={`${headerBg} px-6 py-4 shrink-0 flex items-center justify-between`}>
          <div>
            <div className="text-white/60 text-sm uppercase tracking-widest font-semibold">
              {terrainData?.name ?? tile.terrain_type}
            </div>
            <h2 className="text-white font-black text-2xl mt-0.5">Purchase Unit</h2>
          </div>
          <div className="text-right">
            <div className="text-white font-mono font-black text-3xl">
              ¥{player.funds.toLocaleString()}
            </div>
            <div className="text-white/60 text-sm">Available</div>
          </div>
        </div>

        {/* Unit list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {producible.map((unitType) => {
            const unitData = getUnitData(unitType);
            if (!unitData) return null;
            const canBuy = player.funds >= unitData.cost;
            const isSelected = selected === unitType;
            const primary = unitData.weapons[0];
            const secondary = unitData.weapons[1];

            return (
              <div
                key={unitType}
                className={`px-5 py-4 transition-colors ${
                  canBuy
                    ? `cursor-pointer ${isSelected ? selectedBg : "hover:bg-gray-50"}`
                    : "opacity-40 cursor-not-allowed"
                }`}
                onClick={() => canBuy && setSelected(isSelected ? null : unitType)}
              >
                {/* Row 1: name + cost */}
                <div className="flex items-baseline justify-between">
                  <div
                    className={`font-bold text-base ${canBuy ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {unitData.name}
                  </div>
                  <div
                    className={`font-mono font-bold text-base shrink-0 ml-3 ${canBuy ? "text-amber-500" : "text-gray-300"}`}
                  >
                    ¥{unitData.cost.toLocaleString()}
                  </div>
                </div>

                {/* Row 2: movement stats */}
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
                  <span className="capitalize">{unitData.move_type}</span>
                  <span>·</span>
                  <span>{unitData.move_points} MP</span>
                  <span>·</span>
                  <span>Vision {unitData.vision}</span>
                  {primary && (
                    <>
                      <span>·</span>
                      <span>
                        Rng {primary.min_range}–{primary.max_range}
                      </span>
                    </>
                  )}
                </div>

                {/* Row 3: weapons */}
                <div className="flex items-center gap-3 mt-0.5">
                  {unitData.weapons.length === 0 && (
                    <span className="text-sm text-gray-300 italic">Transport — no weapons</span>
                  )}
                  {primary && (
                    <span className="text-sm">
                      <span className="text-orange-500 font-medium">{weaponName(primary)}</span>
                      {primary.ammo > 0 ? (
                        <span className="text-gray-400"> ({primary.ammo} ammo)</span>
                      ) : (
                        <span className="text-gray-400"> (∞)</span>
                      )}
                    </span>
                  )}
                  {secondary && <span className="text-sm text-gray-300">·</span>}
                  {secondary && (
                    <span className="text-sm">
                      <span className="text-yellow-600 font-medium">{weaponName(secondary)}</span>
                      <span className="text-gray-400"> (∞)</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-2 bg-gray-50">
          {selectedData ? (
            <button
              onClick={() => handleBuy(selected!)}
              className={`flex-1 text-white font-black py-3 rounded-lg transition-colors text-base ${deployBg}`}
            >
              Deploy {selectedData.name} — ¥{selectedData.cost.toLocaleString()}
            </button>
          ) : (
            <button
              disabled
              className="flex-1 bg-gray-200 text-gray-400 font-black py-3 rounded-lg text-base cursor-not-allowed"
            >
              Select a unit
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 py-2 px-5 rounded-lg transition-colors text-base font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
