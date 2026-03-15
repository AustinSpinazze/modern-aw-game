// Hovered tile detail panel — shows full unit stats for both selected and hovered units.

import { useGameStore } from "../store/game-store";
import { getTile, getUnitAt, getUnit } from "../game/game-state";
import { getTerrainData, getUnitData } from "../game/data-loader";
import type { UnitState, GameState } from "../game/types";

const TEAM_TEXT: Record<number, string> = {
  0: "text-red-500",
  1: "text-blue-500",
  2: "text-green-600",
  3: "text-yellow-500",
};

const TEAM_BG: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-600",
  3: "bg-yellow-500",
};

const UNIT_ABBREV: Record<string, string> = {
  infantry: "IN",
  mech: "MC",
  recon: "RC",
  apc: "AP",
  tank: "TK",
  md_tank: "MD",
  artillery: "AR",
  rocket: "RK",
  anti_air: "AA",
  missile: "MS",
  t_copter: "TC",
  b_copter: "BC",
  fighter: "FT",
  bomber: "BM",
  stealth: "ST",
  lander: "LN",
  cruiser: "CR",
  submarine: "SB",
  battleship: "BS",
  carrier: "CV",
};

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="text-gray-400 text-sm uppercase tracking-wide mb-1">{label}</div>
      {children}
    </div>
  );
}

function weaponDisplayName(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function UnitStatBlock({ unit, gameState }: { unit: UnitState; gameState: GameState }) {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return null;

  const primaryWeapon = unitData.weapons[0];
  const secondaryWeapon = unitData.weapons[1];
  const hasAmmo = primaryWeapon && primaryWeapon.ammo > 0;
  const currentAmmo = hasAmmo ? (unit.ammo[primaryWeapon.id] ?? primaryWeapon.ammo) : null;
  const maxAmmo = hasAmmo ? primaryWeapon.ammo : null;

  // Fuel: show when unitData defines a max fuel value
  const hasFuel = unitData.fuel !== undefined;
  const currentFuel = hasFuel ? (unit.fuel ?? unitData.fuel!) : null;

  const unitTile = gameState.tiles[unit.y]?.[unit.x];
  const unitTerrainData = unitTile
    ? getTerrainData(unitTile.has_fob ? "temporary_fob" : unitTile.terrain_type)
    : null;

  // Show row 3 (Fuel + Range) only when at least one is relevant
  const showFuelRange = hasFuel || !!primaryWeapon;

  return (
    <div className="p-3 text-sm">
      {/* Section label */}
      <div className="text-gray-400 text-sm uppercase tracking-widest font-semibold mb-3">
        Unit Info
      </div>

      {/* Unit header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`${TEAM_BG[unit.owner_id] ?? "bg-gray-400"} w-12 h-12 rounded-lg flex items-center justify-center text-white text-sm font-black shrink-0`}
        >
          {UNIT_ABBREV[unit.unit_type] ?? "??"}
        </div>
        <div>
          <div className="text-gray-900 font-bold text-base leading-tight">{unitData.name}</div>
          <div className={`text-sm font-medium ${TEAM_TEXT[unit.owner_id] ?? "text-gray-700"}`}>
            Player {unit.owner_id + 1}
          </div>
        </div>
        {/* Status badges inline with header */}
        {(unit.has_moved || unit.has_acted) && (
          <div className="flex gap-1 ml-auto">
            {unit.has_moved && (
              <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                Moved
              </span>
            )}
            {unit.has_acted && (
              <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                Acted
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
        {/* Row 1: HP | AMMO */}
        <StatCell label="HP">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-900 font-bold text-xl">{unit.hp}</span>
            <span className="text-gray-400 text-xs">/10</span>
          </div>
        </StatCell>
        <StatCell label="Ammo">
          {hasAmmo ? (
            <div className="flex items-baseline gap-1">
              <span className="text-gray-900 font-bold text-xl">{currentAmmo}</span>
              <span className="text-gray-400 text-xs">/{maxAmmo}</span>
            </div>
          ) : (
            <span className="text-gray-500 font-bold text-xl">∞</span>
          )}
        </StatCell>

        {/* Row 2: MOVE | VISION */}
        <StatCell label="Move">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-900 font-bold text-xl">{unitData.move_points}</span>
            <span className="text-gray-400 text-xs capitalize">{unitData.move_type}</span>
          </div>
        </StatCell>
        <StatCell label="Vision">
          <span className="text-gray-900 font-bold text-xl">{unitData.vision ?? "—"}</span>
        </StatCell>

        {/* Row 3: FUEL | RANGE — only rendered when at least one is relevant */}
        {showFuelRange && hasFuel && (
          <StatCell label="Fuel">
            <div className="flex items-baseline gap-1">
              <span
                className={`font-bold text-xl ${currentFuel! <= 10 ? "text-red-500" : "text-gray-900"}`}
              >
                {currentFuel}
              </span>
              <span className="text-gray-400 text-xs">/{unitData.fuel}</span>
            </div>
          </StatCell>
        )}
        {showFuelRange && primaryWeapon && (
          <StatCell label="Range">
            <span className="text-gray-900 font-bold text-xl">
              {primaryWeapon.min_range === primaryWeapon.max_range
                ? primaryWeapon.min_range
                : `${primaryWeapon.min_range}–${primaryWeapon.max_range}`}
            </span>
          </StatCell>
        )}
      </div>

      {/* Weapon display — prominent card */}
      {primaryWeapon && (
        <div className="mt-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-orange-700 font-bold text-base">
              {weaponDisplayName(primaryWeapon.id)}
            </span>
            <span className="text-orange-500 text-sm font-mono">
              {hasAmmo ? `${currentAmmo}/${maxAmmo} ammo` : "∞"}
            </span>
          </div>
          {secondaryWeapon && (
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-orange-100">
              <span className="text-yellow-700 font-medium text-sm">
                {weaponDisplayName(secondaryWeapon.id)}
              </span>
              <span className="text-yellow-600 text-sm font-mono">∞</span>
            </div>
          )}
        </div>
      )}
      {unitData.weapons.length === 0 && (
        <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-400 text-sm italic">
          Transport — no weapons
        </div>
      )}

      {/* Terrain defense */}
      {unitTerrainData && (
        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-sm uppercase tracking-wide">Terrain Def</span>
            <span className="text-gray-400 text-sm ml-1.5">{unitTerrainData.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full ${i < unitTerrainData.defense_stars ? "bg-amber-400" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cargo */}
      {unitData.transport && unitData.transport.capacity > 0 && (
        <div className="mt-2 border-t border-gray-200 pt-2">
          <div className="text-gray-400 text-sm uppercase tracking-wide mb-1.5">Cargo</div>
          {gameState.fog_of_war ? (
            <div className="flex gap-1">
              {Array.from({ length: unitData.transport.capacity }).map((_, i) => (
                <span
                  key={i}
                  className="text-sm text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded"
                >
                  {i < unit.cargo.length ? "?" : "—"}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {unit.cargo.length === 0 ? (
                <span className="text-sm text-gray-400">Empty</span>
              ) : (
                unit.cargo.map((cargoId) => {
                  const cargoUnit = getUnit(gameState, cargoId);
                  const cargoData = cargoUnit ? getUnitData(cargoUnit.unit_type) : null;
                  return (
                    <span key={cargoId} className="text-sm text-teal-600">
                      {cargoData?.name ?? cargoUnit?.unit_type ?? `Unit ${cargoId}`}
                    </span>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TileInfoPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnit = useGameStore((s) => s.selectedUnit);

  if (!gameState) return null;

  // Selected unit always takes priority — show its full stat block
  if (selectedUnit) {
    return (
      <div className="border-t-2 border-gray-100 bg-gray-50">
        <UnitStatBlock unit={selectedUnit} gameState={gameState} />
      </div>
    );
  }

  // No unit selected — show hovered tile info
  if (!hoveredTile) return null;

  const tile = getTile(gameState, hoveredTile.x, hoveredTile.y);
  if (!tile) return null;

  const terrainType = tile.has_fob ? "temporary_fob" : tile.terrain_type;
  const terrainData = getTerrainData(terrainType);
  const unitAtTile = getUnitAt(gameState, hoveredTile.x, hoveredTile.y);

  // If there's a unit on the hovered tile, show the full stat block for it
  if (unitAtTile) {
    return (
      <div className="border-t-2 border-gray-100 bg-gray-50">
        <UnitStatBlock unit={unitAtTile} gameState={gameState} />
      </div>
    );
  }

  // Empty tile — show terrain info
  return (
    <div className="border-t-2 border-gray-100 bg-gray-50 p-3">
      <div className="text-gray-400 text-sm uppercase tracking-widest font-semibold mb-3">
        Tile Info
      </div>

      <div className="text-gray-400 text-sm font-mono mb-2">
        ({hoveredTile.x}, {hoveredTile.y})
      </div>

      {terrainData && (
        <div>
          <div className="text-gray-900 font-bold text-base mb-1">{terrainData.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${i < terrainData.defense_stars ? "bg-amber-400" : "bg-gray-200"}`}
              />
            ))}
            <span className="text-gray-400 text-sm ml-1">Def</span>
          </div>
          {tile.has_trench && (
            <div className="text-amber-500 text-sm mt-1.5">⛏ Trench (+2 def)</div>
          )}
          {tile.has_fob && (
            <div className="text-orange-500 text-sm mt-1.5">🏗 FOB (HP: {tile.fob_hp})</div>
          )}
          {terrainData.is_property && (
            <div className="text-sm mt-2">
              Owner:{" "}
              <span className="text-amber-500">
                {tile.owner_id === -1 ? "Neutral" : `Player ${tile.owner_id + 1}`}
              </span>
            </div>
          )}
          {terrainData.is_property && tile.capture_points < 20 && (
            <div className="mt-2">
              <div className="text-sm text-orange-500 font-medium mb-1">⚔ Being Captured</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-orange-400 transition-all"
                    style={{ width: `${((20 - tile.capture_points) / 20) * 100}%` }}
                  />
                </div>
                <span className="text-orange-500 text-sm">{20 - tile.capture_points}/20</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
