// Unit action popup: Move/Attack/Capture/Wait/etc.
// Shown after selecting a unit with a pending move destination.

import { useGameStore } from "../store/game-store";
import { getTerrainData, getUnitData } from "../game/data-loader";
import { getTile, getUnitAt } from "../game/game-state";
import { getAttackableTiles } from "../game/pathfinding";
import { canAttack, calculateDamage } from "../game/combat";
import { TILE_SIZE, TILE_SCALE, getStageTransform } from "../rendering/pixi-app";

const DISPLAY = TILE_SIZE * TILE_SCALE;

export default function ActionMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const selectedUnit = useGameStore((s) => s.selectedUnit);
  const pendingMove = useGameStore((s) => s.pendingMove);
  const isAnimating = useGameStore((s) => s.isAnimating);
  const startMoveAnimation = useGameStore((s) => s.startMoveAnimation);
  const cancelPendingMove = useGameStore((s) => s.cancelPendingMove);

  if (!gameState || !selectedUnit) return null;
  if (!pendingMove) return null;
  if (selectedUnit.has_acted) return null;
  if (isAnimating) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer || selectedUnit.owner_id !== currentPlayer.id) return null;

  const unitData = getUnitData(selectedUnit.unit_type);
  if (!unitData) return null;

  const tile = getTile(gameState, pendingMove.x, pendingMove.y);
  const terrainData = tile ? getTerrainData(tile.terrain_type) : null;

  const canCapture =
    unitData.can_capture && terrainData?.can_capture && tile?.owner_id !== currentPlayer.id;
  const canDigTrench =
    unitData.special_actions.includes("dig_trench") &&
    terrainData?.can_build_trench &&
    !tile?.has_trench;
  const canBuildFob =
    unitData.special_actions.includes("build_fob") && terrainData?.can_build_fob && !tile?.has_fob;

  // Build a temp attacker at pending position for damage calc
  const tempAttacker = { ...selectedUnit, x: pendingMove.x, y: pendingMove.y };

  // Find attackable enemies with damage preview
  type EnemyEntry = {
    unitId: number;
    unitName: string;
    weaponIndex: number;
    attackDmg: number; // % damage we'd deal (base, no luck)
    counterDmg: number; // % damage we'd receive in counter (0 if no counter)
  };

  const attackableEnemies: EnemyEntry[] = [];
  if (unitData.weapons.length > 0) {
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

  // Position near the pending move tile, accounting for stage pan/zoom.
  const { x: stageX, y: stageY, scale } = getStageTransform();
  const tileScreenX = stageX + pendingMove.x * DISPLAY * scale;
  const tileScreenY = stageY + pendingMove.y * DISPLAY * scale;
  const tileDisplaySize = DISPLAY * scale;
  const menuW = 180;
  const menuH = 200; // approximate

  // Prefer right of tile; flip left if near right edge
  const viewportW = window.innerWidth;
  let left = tileScreenX + tileDisplaySize + 4;
  if (left + menuW > viewportW - 8) {
    left = tileScreenX - menuW - 4;
  }

  // Prefer at tile top; shift up if near bottom
  const viewportH = window.innerHeight;
  let top = tileScreenY;
  if (top + menuH > viewportH - 8) {
    top = viewportH - menuH - 8;
  }
  if (top < 8) top = 8;

  return (
    <div
      className="absolute z-10 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-sm overflow-hidden"
      style={{ left, top, minWidth: menuW }}
    >
      <div className="px-3 py-2 text-slate-400 text-xs uppercase tracking-widest font-bold border-b border-slate-700 bg-slate-800">
        {unitData.name}
      </div>

      {attackableEnemies.map((enemy, idx) => (
        <button
          key={`attack-${enemy.unitId}`}
          onClick={() => handleAttack(enemy.unitId, enemy.weaponIndex)}
          className={`w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0 ${
            idx === 0 ? "bg-amber-500/10 border-l-2 border-amber-500" : ""
          }`}
        >
          <div className="text-red-400 font-semibold">⚔ {enemy.unitName}</div>
          <div className="flex gap-3 text-xs mt-0.5">
            <span className="text-green-400">Att: {enemy.attackDmg * 10}%</span>
            {enemy.counterDmg > 0 && (
              <span className="text-orange-400">Def: {enemy.counterDmg * 10}%</span>
            )}
            {enemy.counterDmg === 0 && <span className="text-slate-500">No counter</span>}
          </div>
        </button>
      ))}

      {canCapture && (
        <button
          onClick={handleCapture}
          className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-amber-400 border-b border-slate-800/50"
        >
          🏳 Capture
        </button>
      )}

      {canDigTrench && (
        <button
          onClick={handleDigTrench}
          className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-orange-300 border-b border-slate-800/50"
        >
          ⛏ Dig Trench
        </button>
      )}

      {canBuildFob && (
        <button
          onClick={handleBuildFob}
          className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-orange-300 border-b border-slate-800/50"
        >
          🏗 Build FOB (¥5,000)
        </button>
      )}

      <button
        onClick={handleWait}
        className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-slate-400 border-b border-slate-700"
      >
        ⏸ Wait
      </button>

      <button
        onClick={cancelPendingMove}
        className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-slate-600 hover:text-slate-400"
      >
        ✕ Cancel
      </button>
    </div>
  );
}
