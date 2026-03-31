/**
 * Post-move **action ring**: attack, capture, wait, etc., positioned from Pixi stage coords.
 */

import { useGameStore } from "../../store/gameStore";
import { getTerrainData, getUnitData } from "../../game/dataLoader";
import { getTile, getUnit, getUnitAt } from "../../game/gameState";
import { getAttackableTiles, isPassable, manhattanDistance } from "../../game/pathfinding";
import { canAttack, calculateDamage } from "../../game/combat";
import { TILE_SIZE, TILE_SCALE, getStageTransform } from "../../rendering/pixiApp";
import type { Vec2 } from "../../game/types";

const DISPLAY = TILE_SIZE * TILE_SCALE;

export default function ActionMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const selectedUnit = useGameStore((s) => s.selectedUnit);
  const pendingMove = useGameStore((s) => s.pendingMove);
  const isAnimating = useGameStore((s) => s.isAnimating);
  const previewAnimating = useGameStore((s) => s.previewAnimating);
  const startMoveAnimation = useGameStore((s) => s.startMoveAnimation);
  const cancelPendingMove = useGameStore((s) => s.cancelPendingMove);
  const unloadingCargoIndex = useGameStore((s) => s.unloadingCargoIndex);
  const unloadTiles = useGameStore((s) => s.unloadTiles);
  const setUnloadMode = useGameStore((s) => s.setUnloadMode);

  if (!gameState || !selectedUnit) return null;
  if (!pendingMove) return null;
  if (selectedUnit.has_acted) return null;
  if (isAnimating || previewAnimating) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer || selectedUnit.owner_id !== currentPlayer.id) return null;

  const unitData = getUnitData(selectedUnit.unit_type);
  if (!unitData) return null;

  const tile = getTile(gameState, pendingMove.x, pendingMove.y);
  const terrainData = tile ? getTerrainData(tile.terrain_type) : null;

  const canCapture =
    unitData.can_capture && terrainData?.can_capture && tile?.owner_id !== currentPlayer.id;

  // Merge: same-type friendly unit on the destination tile with < 10 HP
  // Merge: same-type friendly unit on the destination tile (at least one must be damaged)
  const mergeTarget = (() => {
    const destUnit = getUnitAt(gameState, pendingMove.x, pendingMove.y);
    if (!destUnit) return null;
    if (destUnit.id === selectedUnit.id) return null;
    if (destUnit.owner_id !== currentPlayer.id) return null;
    if (destUnit.unit_type !== selectedUnit.unit_type) return null;
    if (destUnit.hp >= 10) return null; // pointless if target is already full HP
    return destUnit;
  })();

  // Stealth hide/unhide
  const canHide = unitData.special_actions.includes("hide") && !selectedUnit.is_hidden;
  const canUnhide =
    (unitData.special_actions.includes("hide") || unitData.special_actions.includes("unhide")) &&
    selectedUnit.is_hidden;

  // Submarine submerge/surface
  const canSubmerge = unitData.special_actions.includes("submerge") && !selectedUnit.is_submerged;
  const canSurface =
    (unitData.special_actions.includes("submerge") ||
      unitData.special_actions.includes("surface")) &&
    selectedUnit.is_submerged;

  const canDigTrench =
    unitData.special_actions.includes("dig_trench") &&
    terrainData?.can_build_trench &&
    !tile?.has_trench;
  const canBuildFob =
    unitData.special_actions.includes("build_fob") && terrainData?.can_build_fob && !tile?.has_fob;

  // Transport: find loadable adjacent units and cargo units for unloading
  const transportInfo = unitData.transport;
  const loadableUnits: Array<{ unitId: number; unitName: string }> = [];
  const cargoUnits: Array<{ unitId: number; unitName: string; cargoIndex: number }> = [];
  // Get in: adjacent transports that can carry this unit (shown on non-transport units)
  const getInTransports: Array<{ transportId: number; transportName: string }> = [];
  if (!transportInfo && !selectedUnit.has_acted) {
    const myTags = unitData.tags ?? [];
    for (const u of Object.values(gameState.units)) {
      if (u.owner_id !== currentPlayer.id) continue;
      if (u.id === selectedUnit.id) continue;
      // Only show Load when pendingMove IS the transport's tile (AW style: you click onto the transport)
      if (u.x !== pendingMove.x || u.y !== pendingMove.y) continue;
      const uData = getUnitData(u.unit_type);
      const tInfo = uData?.transport;
      if (!tInfo) continue;
      if (u.cargo.length >= (tInfo.capacity ?? 1)) continue;
      const tAllowedTags = tInfo.allowed_tags ?? [];
      const tAllowedVehicleTags = tInfo.allowed_vehicle_tags ?? [];
      const canCarry =
        myTags.some((t) => tAllowedTags.includes(t)) ||
        myTags.some((t) => tAllowedVehicleTags.includes(t));
      if (!canCarry) continue;
      getInTransports.push({ transportId: u.id, transportName: uData?.name ?? u.unit_type });
    }
  }

  if (transportInfo && !selectedUnit.has_acted) {
    const allowedTags = transportInfo.allowed_tags ?? [];
    const allowedVehicleTags = transportInfo.allowed_vehicle_tags ?? [];

    // Find adjacent loadable friendly units (relative to pendingMove position)
    if (selectedUnit.cargo.length < (transportInfo.capacity ?? 1)) {
      for (const u of Object.values(gameState.units)) {
        if (u.owner_id !== currentPlayer.id) continue;
        if (u.is_loaded || u.has_acted) continue;
        if (u.id === selectedUnit.id) continue;
        const dist = manhattanDistance(pendingMove.x, pendingMove.y, u.x, u.y);
        if (dist > 1) continue;
        const uData = getUnitData(u.unit_type);
        const uTags = uData?.tags ?? [];
        const canCarry =
          uTags.some((t) => allowedTags.includes(t)) ||
          uTags.some((t) => allowedVehicleTags.includes(t));
        if (!canCarry) continue;
        loadableUnits.push({ unitId: u.id, unitName: uData?.name ?? u.unit_type });
      }
    }

    // Cargo slots for unloading
    for (let i = 0; i < selectedUnit.cargo.length; i++) {
      const cargoId = selectedUnit.cargo[i];
      const cargoUnit = getUnit(gameState, cargoId);
      const cargoData = cargoUnit ? getUnitData(cargoUnit.unit_type) : null;
      cargoUnits.push({
        unitId: cargoId,
        unitName: cargoData?.name ?? `Slot ${i + 1}`,
        cargoIndex: i,
      });
    }
  }

  // Compute valid unload tiles for a given cargo slot
  const computeUnloadTiles = (cargoIndex: number): Vec2[] => {
    const cargoId = selectedUnit.cargo[cargoIndex];
    const cargoUnit = getUnit(gameState, cargoId);
    const cargoData = cargoUnit ? getUnitData(cargoUnit.unit_type) : null;
    const moveType = cargoData?.move_type ?? "foot";

    const transportTile = getTile(gameState, pendingMove.x, pendingMove.y);
    if (!transportTile) return [];
    const transportTerrain = transportTile.has_fob ? "temporary_fob" : transportTile.terrain_type;
    if (!isPassable(transportTerrain, moveType)) return [];

    const tiles: Vec2[] = [];
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as [number, number][]) {
      const tx = pendingMove.x + dx;
      const ty = pendingMove.y + dy;
      if (tx < 0 || tx >= gameState.map_width || ty < 0 || ty >= gameState.map_height) continue;
      const destTile = getTile(gameState, tx, ty);
      if (!destTile) continue;
      const terrainType = destTile.has_fob ? "temporary_fob" : destTile.terrain_type;
      if (!isPassable(terrainType, moveType)) continue;
      const unitOnTile = getUnitAt(gameState, tx, ty);
      if (unitOnTile) continue;
      tiles.push({ x: tx, y: ty });
    }
    return tiles;
  };

  // Build a temp attacker at pending position for damage calc
  const tempAttacker = { ...selectedUnit, x: pendingMove.x, y: pendingMove.y };

  // Indirect units (any weapon with min_range > 1) cannot attack after moving
  const isIndirect = unitData.weapons.some((w) => w.min_range > 1);
  const unitWouldMove = pendingMove.x !== selectedUnit.x || pendingMove.y !== selectedUnit.y;

  // Find attackable enemies with damage preview
  type EnemyEntry = {
    unitId: number;
    unitName: string;
    weaponIndex: number;
    attackDmg: number; // % damage we'd deal (base, no luck)
    counterDmg: number; // % damage we'd receive in counter (0 if no counter)
  };

  const attackableEnemies: EnemyEntry[] = [];
  if (unitData.weapons.length > 0 && !(isIndirect && unitWouldMove)) {
    for (let wi = 0; wi < unitData.weapons.length; wi++) {
      const attackTiles = getAttackableTiles(
        gameState,
        selectedUnit,
        pendingMove.x,
        pendingMove.y,
        wi
      );
      for (const pos of attackTiles) {
        const target = getUnitAt(gameState, pos.x, pos.y);
        if (!target || target.owner_id === currentPlayer.id) continue;
        if (!canAttack(tempAttacker, target, gameState, wi)) continue;
        if (attackableEnemies.some((e) => e.unitId === target.id)) continue;

        const targetData = getUnitData(target.unit_type);

        const { damage: attackDmg } = calculateDamage(tempAttacker, target, gameState, wi, false);

        // Counter damage estimate (if target can counter)
        let counterDmg = 0;
        if (targetData && targetData.weapons.length > 0) {
          for (let ci = 0; ci < targetData.weapons.length; ci++) {
            const { damage } = calculateDamage(target, tempAttacker, gameState, ci, true);
            if (damage > 0) {
              counterDmg = damage;
              break;
            }
          }
        }

        attackableEnemies.push({
          unitId: target.id,
          unitName: targetData?.name ?? target.unit_type,
          weaponIndex: wi,
          attackDmg,
          counterDmg,
        });
      }
    }
  }

  const handleAttack = (targetId: number, weaponIndex: number) => {
    startMoveAnimation({
      type: "ATTACK",
      player_id: currentPlayer.id,
      attacker_id: selectedUnit.id,
      target_id: targetId,
      weapon_index: weaponIndex,
    });
  };

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

  const handleMerge = (targetId: number) => {
    startMoveAnimation({
      type: "MERGE",
      player_id: currentPlayer.id,
      unit_id: selectedUnit.id,
      target_id: targetId,
    });
  };

  const handleHide = () => {
    startMoveAnimation({ type: "HIDE", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleUnhide = () => {
    startMoveAnimation({ type: "UNHIDE", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleSubmerge = () => {
    startMoveAnimation({ type: "SUBMERGE", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleSurface = () => {
    startMoveAnimation({ type: "SURFACE", player_id: currentPlayer.id, unit_id: selectedUnit.id });
  };

  const handleLoad = (unitId: number) => {
    startMoveAnimation({
      type: "LOAD",
      player_id: currentPlayer.id,
      transport_id: selectedUnit.id,
      unit_id: unitId,
    });
  };

  // Position near the pending move tile, accounting for stage pan/zoom.
  const { x: stageX, y: stageY, scale } = getStageTransform();
  const tileScreenX = stageX + pendingMove.x * DISPLAY * scale;
  const tileScreenY = stageY + pendingMove.y * DISPLAY * scale;
  const tileDisplaySize = DISPLAY * scale;
  const menuW = 180;
  const menuH = 200; // approximate

  // Check which sides have unload tiles to avoid covering them
  const hasUnloadRight = unloadTiles.some((t) => t.x > pendingMove.x);
  const hasUnloadLeft = unloadTiles.some((t) => t.x < pendingMove.x);
  const hasUnloadBelow = unloadTiles.some((t) => t.y > pendingMove.y);

  // Prefer right of tile; flip left if near right edge or unload tiles are to the right
  const viewportW = window.innerWidth;
  const preferLeft = hasUnloadRight && !hasUnloadLeft;
  let left: number;
  if (preferLeft) {
    left = tileScreenX - menuW - 4;
    if (left < 8) left = tileScreenX + tileDisplaySize + 4;
  } else {
    left = tileScreenX + tileDisplaySize + 4;
    if (left + menuW > viewportW - 8) left = tileScreenX - menuW - 4;
  }

  // Prefer at tile top; shift up if near bottom or if unload tiles are below
  const viewportH = window.innerHeight;
  let top = tileScreenY;
  if (hasUnloadBelow) {
    // Shift menu above the tile if there are unload tiles below
    top = tileScreenY - menuH + tileDisplaySize;
  }
  if (top + menuH > viewportH - 8) {
    top = viewportH - menuH - 8;
  }
  if (top < 8) top = 8;

  return (
    <div
      className="absolute z-10 bg-white border border-gray-200 rounded-xl shadow-2xl text-sm overflow-hidden"
      style={{ left, top, minWidth: menuW }}
    >
      <div className="px-3 py-2 text-gray-500 text-xs uppercase tracking-widest font-bold border-b border-gray-100 bg-gray-50">
        {unitData.name}
      </div>

      {attackableEnemies.map((enemy, idx) => (
        <button
          key={`attack-${enemy.unitId}`}
          onClick={() => handleAttack(enemy.unitId, enemy.weaponIndex)}
          className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
            idx === 0 ? "bg-amber-50 border-l-2 border-amber-400" : ""
          }`}
        >
          <div className="text-red-500 font-semibold">⚔ {enemy.unitName}</div>
          <div className="flex gap-3 text-xs mt-0.5">
            <span className="text-green-600">Att: {enemy.attackDmg * 10}%</span>
            {enemy.counterDmg > 0 && (
              <span className="text-orange-500">Def: {enemy.counterDmg * 10}%</span>
            )}
            {enemy.counterDmg === 0 && <span className="text-gray-400">No counter</span>}
          </div>
        </button>
      ))}

      {canCapture && (
        <button
          onClick={handleCapture}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-amber-600 border-b border-gray-100"
        >
          🏳 Capture
        </button>
      )}

      {canDigTrench && (
        <button
          onClick={handleDigTrench}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-orange-500 border-b border-gray-100"
        >
          ⛏ Dig Trench
        </button>
      )}

      {canBuildFob && (
        <button
          onClick={handleBuildFob}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-orange-500 border-b border-gray-100"
        >
          🏗 Build FOB (¥5,000)
        </button>
      )}

      {mergeTarget && (
        <button
          onClick={() => handleMerge(mergeTarget.id)}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-blue-600 border-b border-gray-100"
        >
          ⊕ Merge ({mergeTarget.hp + selectedUnit.hp > 10 ? 10 : mergeTarget.hp + selectedUnit.hp}{" "}
          HP)
        </button>
      )}

      {canHide && (
        <button
          onClick={handleHide}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-purple-600 border-b border-gray-100"
        >
          👁 Hide
        </button>
      )}

      {canUnhide && (
        <button
          onClick={handleUnhide}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-purple-600 border-b border-gray-100"
        >
          👁 Unhide
        </button>
      )}

      {canSubmerge && (
        <button
          onClick={handleSubmerge}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-cyan-600 border-b border-gray-100"
        >
          ⬇ Submerge
        </button>
      )}

      {canSurface && (
        <button
          onClick={handleSurface}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-cyan-600 border-b border-gray-100"
        >
          ⬆ Surface
        </button>
      )}

      {/* Unload destination picker — tiles highlighted on map */}
      {unloadingCargoIndex !== null && (
        <>
          <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
            Click a highlighted tile to unload
          </div>
          <button
            onClick={() => setUnloadMode(null, [])}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-gray-400 border-b border-gray-200"
          >
            ← Back
          </button>
        </>
      )}

      {/* Get in: board an adjacent transport */}
      {unloadingCargoIndex === null &&
        getInTransports.map(({ transportId, transportName }) => (
          <button
            key={`getin-${transportId}`}
            onClick={() =>
              startMoveAnimation({
                type: "LOAD",
                player_id: currentPlayer.id,
                transport_id: transportId,
                unit_id: selectedUnit.id,
              })
            }
            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-teal-600 border-b border-gray-100"
          >
            ↑ Load
          </button>
        ))}

      {/* Load adjacent units */}
      {unloadingCargoIndex === null &&
        loadableUnits.map(({ unitId, unitName }) => (
          <button
            key={`load-${unitId}`}
            onClick={() => handleLoad(unitId)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-teal-600 border-b border-gray-100"
          >
            ↑ Load {unitName}
          </button>
        ))}

      {/* Unload cargo slots */}
      {unloadingCargoIndex === null &&
        cargoUnits.map(({ unitId, unitName, cargoIndex }) => (
          <button
            key={`unload-${unitId}`}
            onClick={() => setUnloadMode(cargoIndex, computeUnloadTiles(cargoIndex))}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-teal-600 border-b border-gray-100"
          >
            ↓ Unload {unitName}
          </button>
        ))}

      <button
        onClick={handleWait}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-gray-600 border-b border-gray-200"
      >
        ⏸ Wait
      </button>

      <button
        onClick={cancelPendingMove}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-gray-400 hover:text-gray-600"
      >
        ✕ Cancel
      </button>
    </div>
  );
}
