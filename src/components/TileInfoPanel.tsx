// Hovered tile detail panel.

import { useGameStore } from "../store/game-store";
import { getTile, getUnitAt } from "../game/game-state";
import { getTerrainData, getUnitData } from "../game/data-loader";

export default function TileInfoPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const hoveredTile = useGameStore((s) => s.hoveredTile);

  if (!gameState || !hoveredTile) return null;

  const tile = getTile(gameState, hoveredTile.x, hoveredTile.y);
  if (!tile) return null;

  const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
  const terrainData = getTerrainData(terrainType);
  const unitAtTile = getUnitAt(gameState, hoveredTile.x, hoveredTile.y);
  const unitData = unitAtTile ? getUnitData(unitAtTile.unit_type) : null;

  return (
    <div className="p-3 text-sm border-t border-gray-700">
      <div className="text-gray-400 text-xs uppercase tracking-wide mb-2">
        Tile ({hoveredTile.x}, {hoveredTile.y})
      </div>

      {terrainData && (
        <div className="mb-2">
          <div className="text-white font-medium">{terrainData.name}</div>
          <div className="text-gray-400 text-xs">
            {'★'.repeat(terrainData.defense_stars)}{'☆'.repeat(Math.max(0, 4 - terrainData.defense_stars))} Defense
          </div>
          {tile.has_trench && <div className="text-yellow-400 text-xs">⛏ Trench (+2 def)</div>}
          {tile.has_fob && <div className="text-orange-400 text-xs">🏗 FOB (HP: {tile.fob_hp})</div>}
          {terrainData.is_property && (
            <div className="text-xs mt-1">
              Owner: <span className="text-yellow-300">
                {tile.owner_id === -1 ? "Neutral" : `Player ${tile.owner_id + 1}`}
              </span>
            </div>
          )}
          {terrainData.is_property && tile.capture_points < 20 && (
            <div className="mt-1">
              <div className="text-xs text-orange-400 font-medium">⚔ Being Captured</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-2 bg-gray-700 rounded overflow-hidden">
                  <div 
                    className="h-full bg-orange-400 transition-all"
                    style={{ width: `${((20 - tile.capture_points) / 20) * 100}%` }}
                  />
                </div>
                <span className="text-orange-300 text-xs">{20 - tile.capture_points}/20</span>
              </div>
            </div>
          )}
        </div>
      )}

      {unitAtTile && unitData && (
        <div className="border-t border-gray-700 pt-2">
          <div className="text-white font-medium">{unitData.name}</div>
          <div className="text-xs text-gray-300">Player {unitAtTile.owner_id + 1}</div>
          <div className="mt-1">
            <div className="text-xs text-gray-400">HP</div>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-sm ${i < unitAtTile.hp ? "bg-green-400" : "bg-gray-600"}`}
                />
              ))}
            </div>
          </div>
          {unitAtTile.has_moved && <div className="text-xs text-gray-500 mt-1">Moved</div>}
          {unitAtTile.has_acted && <div className="text-xs text-gray-500">Acted</div>}
        </div>
      )}
    </div>
  );
}
