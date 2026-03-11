// Hovered tile detail panel — shows enhanced unit stats when a unit is selected.

import { useGameStore } from "../store/game-store";
import { getTile, getUnitAt } from "../game/game-state";
import { getTerrainData, getUnitData } from "../game/data-loader";

const TEAM_TEXT: Record<number, string> = {
  0: "text-red-400",
  1: "text-blue-400",
  2: "text-green-400",
  3: "text-yellow-400",
};

const TEAM_BG: Record<number, string> = {
  0: "bg-red-600",
  1: "bg-blue-600",
  2: "bg-green-600",
  3: "bg-yellow-500",
};

const UNIT_ABBREV: Record<string, string> = {
  infantry: "IN", mech: "MC", recon: "RC", apc: "AP",
  tank: "TK", md_tank: "MD", neo_tank: "NT", mega_tank: "MG",
  artillery: "AR", rocket: "RK", anti_air: "AA", missile: "MS",
  piperunner: "PR", t_copter: "TC", b_copter: "BC",
  fighter: "FT", bomber: "BM", stealth: "ST", black_bomb: "BB",
  lander: "LN", cruiser: "CR", submarine: "SB", battleship: "BS", carrier: "CV",
};

export default function TileInfoPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnit = useGameStore((s) => s.selectedUnit);

  if (!gameState) return null;

  // === SELECTED UNIT PANEL ===
  // When a unit is selected, show its full stat block
  if (selectedUnit) {
    const unitData = getUnitData(selectedUnit.unit_type);
    if (!unitData) return null;

    const primaryWeapon = unitData.weapons[0];
    const hasAmmo = primaryWeapon && primaryWeapon.ammo > 0;
    const currentAmmo = hasAmmo ? (selectedUnit.ammo[primaryWeapon.id] ?? primaryWeapon.ammo) : null;
    const maxAmmo = hasAmmo ? primaryWeapon.ammo : null;

    // Get terrain defense at selected unit's position
    const unitTile = gameState.tiles[selectedUnit.y]?.[selectedUnit.x];
    const unitTerrainData = unitTile
      ? getTerrainData(unitTile.has_fob ? "temporary_fob" : unitTile.terrain_type)
      : null;

    return (
      <div className="p-3 text-sm border-t border-slate-700">
        {/* Unit header */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`${TEAM_BG[selectedUnit.owner_id] ?? "bg-slate-600"} w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0`}
          >
            {UNIT_ABBREV[selectedUnit.unit_type] ?? "??"}
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">{unitData.name}</div>
            <div className={`text-xs ${TEAM_TEXT[selectedUnit.owner_id] ?? "text-white"}`}>
              Player {selectedUnit.owner_id + 1}
            </div>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-px bg-slate-700 rounded-lg overflow-hidden border border-slate-700">
          {/* HP */}
          <div className="bg-slate-800 px-3 py-2">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">HP</div>
            <div className="flex items-baseline gap-1">
              <span className="text-white font-bold text-xl">{selectedUnit.hp}</span>
              <span className="text-slate-500 text-xs">/10</span>
            </div>
          </div>

          {/* Ammo */}
          <div className="bg-slate-800 px-3 py-2">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Ammo</div>
            {hasAmmo ? (
              <div className="flex items-baseline gap-1">
                <span className="text-white font-bold text-xl">{currentAmmo}</span>
                <span className="text-slate-500 text-xs">/{maxAmmo}</span>
              </div>
            ) : (
              <span className="text-slate-400 font-bold text-xl">∞</span>
            )}
          </div>

          {/* Move */}
          <div className="bg-slate-800 px-3 py-2">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Move</div>
            <div className="flex items-baseline gap-1">
              <span className="text-white font-bold text-xl">{unitData.move_points}</span>
              <span className="text-slate-500 text-xs capitalize">{unitData.move_type}</span>
            </div>
          </div>

          {/* Vision */}
          <div className="bg-slate-800 px-3 py-2">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Vision</div>
            <span className="text-white font-bold text-xl">{unitData.vision ?? "—"}</span>
          </div>
        </div>

        {/* Weapon range */}
        {primaryWeapon && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500 uppercase tracking-wide">
              {primaryWeapon.id.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </span>
            <span className="text-slate-300">
              Rng {primaryWeapon.min_range}–{primaryWeapon.max_range}
            </span>
          </div>
        )}

        {/* Terrain defense */}
        {unitTerrainData && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-500 text-xs uppercase tracking-wide">Terrain Def</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-sm ${i < unitTerrainData.defense_stars ? "bg-amber-400" : "bg-slate-700"}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status badges */}
        {(selectedUnit.has_moved || selectedUnit.has_acted) && (
          <div className="flex gap-1.5 mt-2">
            {selectedUnit.has_moved && (
              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">Moved</span>
            )}
            {selectedUnit.has_acted && (
              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">Acted</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // === TILE INFO PANEL (no unit selected) ===
  if (!hoveredTile) return null;

  const tile = getTile(gameState, hoveredTile.x, hoveredTile.y);
  if (!tile) return null;

  const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
  const terrainData = getTerrainData(terrainType);
  const unitAtTile = getUnitAt(gameState, hoveredTile.x, hoveredTile.y);
  const unitData = unitAtTile ? getUnitData(unitAtTile.unit_type) : null;

  return (
    <div className="p-3 text-sm border-t border-slate-700">
      <div className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">
        Tile{" "}
        <span className="text-slate-500 text-xs font-mono normal-case">
          ({hoveredTile.x}, {hoveredTile.y})
        </span>
      </div>

      {terrainData && (
        <div className="mb-2">
          <div className="text-white font-bold">{terrainData.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-sm ${i < terrainData.defense_stars ? "bg-amber-400" : "bg-slate-700"}`}
              />
            ))}
            <span className="text-slate-500 text-xs ml-1">Def</span>
          </div>
          {tile.has_trench && <div className="text-amber-400 text-xs">⛏ Trench (+2 def)</div>}
          {tile.has_fob && (
            <div className="text-orange-400 text-xs">🏗 FOB (HP: {tile.fob_hp})</div>
          )}
          {terrainData.is_property && (
            <div className="text-xs mt-1">
              Owner:{" "}
              <span className="text-amber-300">
                {tile.owner_id === -1 ? "Neutral" : `Player ${tile.owner_id + 1}`}
              </span>
            </div>
          )}
          {terrainData.is_property && tile.capture_points < 20 && (
            <div className="mt-1">
              <div className="text-xs text-orange-400 font-medium">⚔ Being Captured</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
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
        <div className="border-t border-slate-700 pt-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-2 h-2 rounded-full ${TEAM_BG[unitAtTile.owner_id] ?? "bg-slate-500"}`} />
            <div className="text-white font-bold text-xs">{unitData.name}</div>
            <div className={`text-xs ${TEAM_TEXT[unitAtTile.owner_id] ?? "text-white"}`}>P{unitAtTile.owner_id + 1}</div>
          </div>
          <div className="flex gap-0.5 mt-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-full rounded-sm ${i < unitAtTile.hp ? "bg-green-400" : "bg-slate-700"}`}
              />
            ))}
          </div>
          {(unitAtTile.has_moved || unitAtTile.has_acted) && (
            <div className="flex gap-1 mt-1">
              {unitAtTile.has_moved && <span className="text-xs text-slate-500">Moved</span>}
              {unitAtTile.has_acted && <span className="text-xs text-slate-500">Acted</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
