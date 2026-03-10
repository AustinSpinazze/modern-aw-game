// Mounts the Pixi.js canvas and wires game input.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  initPixiApp,
  destroyPixiApp,
  getApp,
  enablePanZoom,
  resetPanZoom,
} from "../rendering/pixi-app";
import { TerrainRenderer } from "../rendering/terrain-renderer";
import { UnitRenderer } from "../rendering/unit-renderer";
import { HighlightRenderer } from "../rendering/highlight-renderer";
import { MovementAnimator } from "../rendering/movement-animator";
import { CombatAnimator } from "../rendering/combat-animator";
import { FogRenderer } from "../rendering/fog-renderer";
import { InputHandler } from "../rendering/input-handler";
import { useGameStore } from "../store/game-store";
import type { Vec2, GameState, CmdAttack } from "../game/types";
import { getUnitAt, getTile, getUnit } from "../game/game-state";
import { getTerrainData, getUnitData } from "../game/data-loader";
import { applyCommand } from "../game/apply-command";
import { validateCommand } from "../game/validators";
import { getAttackableTiles } from "../game/pathfinding";
import { canAttack } from "../game/combat";

interface GameCanvasProps {
  onFacilityClick?: (x: number, y: number) => void;
}

/** Runs the combat animation sequence and applies the final post-combat state.
 *  movedState: state after MOVE has been pre-applied (attacker is at attack position).
 *  attackCmd: the ATTACK command to execute. */
function runCombatAnimation(
  combatAnim: CombatAnimator,
  movedState: GameState,
  attackCmd: CmdAttack,
  onCombatComplete: (postState: GameState) => void
): boolean {
  const attacker = getUnit(movedState, attackCmd.attacker_id);
  const defender = getUnit(movedState, attackCmd.target_id);
  if (!attacker || !defender) return false;

  const postState = applyCommand(movedState, attackCmd);
  const attackerDestroyed = !getUnit(postState, attackCmd.attacker_id);
  const defenderDestroyed = !getUnit(postState, attackCmd.target_id);

  combatAnim.animate({
    attackerPos: { x: attacker.x, y: attacker.y },
    defenderPos: { x: defender.x, y: defender.y },
    attackerDestroyed,
    defenderDestroyed,
    onComplete: () => onCombatComplete(postState),
  });
  return true;
}

export default function GameCanvas({ onFacilityClick }: GameCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRendererRef = useRef<TerrainRenderer | null>(null);
  const unitRendererRef = useRef<UnitRenderer | null>(null);
  const highlightRendererRef = useRef<HighlightRenderer | null>(null);
  const pathOverlayRef = useRef<HighlightRenderer | null>(null); // For path arrows
  const cursorOverlayRef = useRef<HighlightRenderer | null>(null); // For targeting cursor (always on top)
  const movementAnimatorRef = useRef<MovementAnimator | null>(null); // For unit movement
  const combatAnimatorRef = useRef<CombatAnimator | null>(null); // For combat flash/destruction
  const fogRendererRef = useRef<FogRenderer | null>(null); // Fog-of-war tile overlay
  const inputHandlerRef = useRef<InputHandler | null>(null);
  const onFacilityClickRef = useRef(onFacilityClick);
  onFacilityClickRef.current = onFacilityClick;

  // Track when Pixi is ready so the render effect knows to fire
  const [pixiReady, setPixiReady] = useState(false);

  const {
    gameState,
    visibilityMap,
    selectedUnit,
    reachableTiles,
    attackableTiles,
    hoveredTile,
    hoverPath,
    pendingMove,
    pendingPath,
    animationPath,
    isAnimating,
    selectUnit,
    setHoveredTile,
    setPendingMove,
    submitCommand,
    resetSelection,
    onAnimationComplete,
    // Command queue for AI/external
    commandQueue,
    processingQueue,
    processNextCommand,
    onQueuedAnimationComplete,
  } = useGameStore();

  // Init Pixi once on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    const canvas = canvasRef.current;
    initPixiApp(canvas).then((app) => {
      if (!mounted) return;
      resetPanZoom();
      enablePanZoom(canvas);

      const terrain = new TerrainRenderer();
      const units = new UnitRenderer();
      const highlights = new HighlightRenderer();
      const pathOverlay = new HighlightRenderer(); // For path arrows
      const cursorOverlay = new HighlightRenderer(); // For targeting cursor
      const movementAnimator = new MovementAnimator();
      const combatAnimator = new CombatAnimator();
      const fogRenderer = new FogRenderer();

      // Render order:
      //   terrain → highlights (reachable/attack tiles) → units → fog → capture overlay
      //   → movement anim → combat effects → path overlay → cursor (on top)
      // Fog sits above units so enemy units on fogged tiles are hidden.
      // Highlights and cursor are above fog so the player can still interact.
      app.stage.addChild(terrain.getContainer());
      app.stage.addChild(highlights.getContainer());
      app.stage.addChild(units.getContainer());
      app.stage.addChild(fogRenderer.getContainer()); // Fog above units, below overlays
      app.stage.addChild(terrain.getCaptureOverlay()); // Capture indicators above fog
      app.stage.addChild(movementAnimator.getContainer()); // Moving unit on top
      app.stage.addChild(combatAnimator.getContainer()); // Combat flash/destruction effects
      app.stage.addChild(pathOverlay.getContainer());
      app.stage.addChild(cursorOverlay.getContainer()); // Cursor always on very top

      terrainRendererRef.current = terrain;
      unitRendererRef.current = units;
      highlightRendererRef.current = highlights;
      pathOverlayRef.current = pathOverlay;
      cursorOverlayRef.current = cursorOverlay;
      movementAnimatorRef.current = movementAnimator;
      combatAnimatorRef.current = combatAnimator;
      fogRendererRef.current = fogRenderer;

      // Wire input
      const handleTileClick = (pos: Vec2) => {
        const state = useGameStore.getState().gameState;
        if (!state) return;

        const {
          selectedUnit: selUnit,
          reachableTiles,
          attackableTiles,
          pendingMove,
          setPendingMove,
          confirmMoveAndAction,
          submitCommand,
          selectUnit,
          resetSelection,
          cancelPendingMove,
        } = useGameStore.getState();

        const currentPlayer = state.players[state.current_player_index];
        if (!currentPlayer) return;

        const clickedUnit = getUnitAt(state, pos.x, pos.y);

        if (selUnit) {
          // If we have a pending move, check for attack at pending position
          if (pendingMove) {
            const isAttackable = attackableTiles.some((t) => t.x === pos.x && t.y === pos.y);
            if (isAttackable && clickedUnit && clickedUnit.owner_id !== currentPlayer.id) {
              // Shortcut: click enemy directly while pendingMove is set.
              // Apply MOVE instantly (no movement anim), then run combat animation.
              const attackCmd = {
                type: "ATTACK" as const,
                player_id: currentPlayer.id,
                attacker_id: selUnit.id,
                target_id: clickedUnit.id,
                weapon_index: 0,
              };
              const cAnim = combatAnimatorRef.current;
              if (cAnim && !cAnim.isAnimating()) {
                // Pre-apply MOVE to get attacker at destination
                const isInPlace = pendingMove.x === selUnit.x && pendingMove.y === selUnit.y;
                let movedState = state;
                if (!selUnit.has_moved && !isInPlace) {
                  const moveCmd = {
                    type: "MOVE" as const,
                    player_id: currentPlayer.id,
                    unit_id: selUnit.id,
                    dest_x: pendingMove.x,
                    dest_y: pendingMove.y,
                  };
                  if (validateCommand(moveCmd, state).valid) {
                    movedState = applyCommand(state, moveCmd);
                  }
                }
                // Apply moved state immediately (unit jumps, selection clears)
                useGameStore.getState().applyPostMoveState(movedState);
                const ok = runCombatAnimation(cAnim, movedState, attackCmd, (postState) => {
                  useGameStore.getState().setGameState(postState);
                });
                if (ok) return;
              }
              // Fallback: no combat animator available
              confirmMoveAndAction(attackCmd);
              return;
            }
            // Clicking elsewhere cancels pending move and deselects
            cancelPendingMove();
            resetSelection();
            if (
              clickedUnit &&
              clickedUnit.owner_id === currentPlayer.id &&
              !clickedUnit.is_loaded
            ) {
              selectUnit(clickedUnit);
            }
            return;
          }

          // No pending move yet - check if clicking on a reachable tile OR the unit's own tile
          const isReachable = reachableTiles.some((t) => t.x === pos.x && t.y === pos.y);
          const isUnitTile = pos.x === selUnit.x && pos.y === selUnit.y;
          if ((isReachable || isUnitTile) && !selUnit.has_moved) {
            // Set pending move instead of immediately moving
            setPendingMove(pos);
            return;
          }
          // Unit already moved — clicking its current tile opens the action menu
          if (isUnitTile && selUnit.has_moved && !selUnit.has_acted) {
            setPendingMove(pos);
            return;
          }

          // Check if the clicked enemy is in attack range from the current position.
          // If so, open the ActionMenu (via setPendingMove on the unit's own tile) rather
          // than attacking immediately — lets the player confirm or cancel in case of misclick.
          // attackableTiles in the store is empty until setPendingMove fires, so we compute
          // range on the fly here.
          if (clickedUnit && clickedUnit.owner_id !== currentPlayer.id && !selUnit.has_acted) {
            const unitDat = getUnitData(selUnit.unit_type);
            let isInRange = false;
            for (let wi = 0; wi < (unitDat?.weapons.length ?? 0); wi++) {
              const rangeTiles = getAttackableTiles(state, selUnit, selUnit.x, selUnit.y, wi);
              if (
                rangeTiles.some((t) => t.x === pos.x && t.y === pos.y) &&
                canAttack(selUnit, clickedUnit, state, wi)
              ) {
                isInRange = true;
                break;
              }
            }
            if (isInRange) {
              // Set pendingMove to the unit's current tile — this surfaces the ActionMenu
              // showing the attackable enemies (and a Cancel button), same as clicking your
              // own tile. The player then confirms the attack from the menu.
              setPendingMove({ x: selUnit.x, y: selUnit.y });
              return;
            }
          }

          resetSelection();
          if (
            clickedUnit &&
            currentPlayer &&
            clickedUnit.owner_id === currentPlayer.id &&
            !clickedUnit.is_loaded
          ) {
            selectUnit(clickedUnit);
          }
        } else {
          if (
            clickedUnit &&
            currentPlayer &&
            clickedUnit.owner_id === currentPlayer.id &&
            !clickedUnit.is_loaded
          ) {
            selectUnit(clickedUnit);
          } else if (!clickedUnit && currentPlayer) {
            // Check if clicking on an owned facility to open buy menu
            const tile = getTile(state, pos.x, pos.y);
            if (tile && tile.owner_id === currentPlayer.id) {
              const terrainData = getTerrainData(tile.terrain_type);
              if (terrainData?.can_produce && terrainData.can_produce.length > 0) {
                onFacilityClickRef.current?.(pos.x, pos.y);
              }
            }
          }
        }
      };

      const handleTileHover = (pos: Vec2) => {
        useGameStore.getState().setHoveredTile(pos);
      };

      inputHandlerRef.current = new InputHandler(app, handleTileClick, handleTileHover);

      // Signal that Pixi is ready — this triggers the render effect below
      // with the current gameState (which is already set by the time we get here)
      setPixiReady(true);
    });

    return () => {
      mounted = false;
      inputHandlerRef.current?.destroy();
      destroyPixiApp();
      setPixiReady(false);
    };
  }, []);

  // E2E helper: programmatic tile click (used by Playwright tests)
  useEffect(() => {
    if (!pixiReady) return;
    if (import.meta.env.DEV || import.meta.env.VITE_E2E === "true") {
      const app = getApp();
      if (!app) return;
      const stage = app.stage;
      const canvas = app.canvas;
      const TILE_DISPLAY = 48;
      (window as unknown as { __clickTile?: (tx: number, ty: number) => void }).__clickTile = (
        tileX: number,
        tileY: number
      ) => {
        const rect = canvas.getBoundingClientRect();
        const worldX = tileX * TILE_DISPLAY + TILE_DISPLAY / 2;
        const worldY = tileY * TILE_DISPLAY + TILE_DISPLAY / 2;
        const canvasX = stage.x + worldX * stage.scale.x;
        const canvasY = stage.y + worldY * stage.scale.y;
        const clientX = rect.left + canvasX;
        const clientY = rect.top + canvasY;
        canvas.dispatchEvent(new MouseEvent("click", { clientX, clientY, bubbles: true }));
      };
      return () => {
        delete (window as unknown as { __clickTile?: (tx: number, ty: number) => void }).__clickTile;
      };
    }
  }, [pixiReady]);

  // Animation update loop
  useEffect(() => {
    if (!pixiReady) return;

    const app = getApp();
    if (!app) return;

    const ticker = app.ticker;
    const onTick = () => {
      const mAnimator = movementAnimatorRef.current;
      if (mAnimator?.isAnimating()) mAnimator.update();
      const cAnimator = combatAnimatorRef.current;
      if (cAnimator?.isAnimating()) cAnimator.update();
    };

    ticker.add(onTick);
    return () => {
      // Guard: destroyPixiApp() may have already destroyed the ticker before
      // this cleanup runs. Calling remove() on a destroyed ticker reads
      // ticker._head.next → "Cannot read properties of null (reading 'next')".
      if (getApp()) ticker.remove(onTick);
    };
  }, [pixiReady]);

  // Track animating unit for queue processing
  const [queueAnimatingUnitId, setQueueAnimatingUnitId] = useState<number | undefined>(undefined);

  // Start movement animation when isAnimating becomes true (player moves)
  useEffect(() => {
    if (!isAnimating || !selectedUnit) return;

    const animator = movementAnimatorRef.current;
    if (!animator) return;

    // No real movement (in-place action like Capture/Wait) — skip animation
    if (animationPath.length < 2) {
      onAnimationComplete();
      return;
    }

    // Start the animation with the path (arrow already cleared)
    animator.animate(selectedUnit.unit_type, selectedUnit.owner_id, animationPath, () => {
      // Movement done. If the pending action is ATTACK, intercept to run a combat animation
      // before the state update removes any dead units.
      const store = useGameStore.getState();
      const pendingAct = store.pendingAction;
      const cAnim = combatAnimatorRef.current;

      if (pendingAct?.type === "ATTACK" && cAnim) {
        // Apply only the MOVE portion so the unit visually snaps to its destination.
        const curState = store.gameState!;
        const selUnit = store.selectedUnit!;
        const pMove = store.pendingMove;
        const isInPlace = !pMove || (pMove.x === selUnit.x && pMove.y === selUnit.y);

        let movedState = curState;
        if (pMove && !selUnit.has_moved && !isInPlace) {
          const moveCmd = {
            type: "MOVE" as const,
            player_id: curState.players[curState.current_player_index].id,
            unit_id: selUnit.id,
            dest_x: pMove.x,
            dest_y: pMove.y,
          };
          if (validateCommand(moveCmd, curState).valid) {
            movedState = applyCommand(curState, moveCmd);
          }
        }

        // Commit post-move state (unit at destination), clear animation/selection state.
        store.applyPostMoveState(movedState);
        const ok = runCombatAnimation(cAnim, movedState, pendingAct, (postState) => {
          useGameStore.getState().setGameState(postState);
        });
        if (!ok) onAnimationComplete();
      } else {
        // Non-attack action (Capture, Wait, etc.) — standard apply path.
        onAnimationComplete();
      }
    });
  }, [isAnimating, selectedUnit, animationPath, onAnimationComplete]);

  // Track queue processing state locally to ensure re-renders
  const [queueTrigger, setQueueTrigger] = useState(0);

  // Process command queue (AI/enemy turns)
  useEffect(() => {
    if (!pixiReady || !processingQueue) return;
    if (isAnimating) return; // Wait for movement animation to finish

    const mAnimator = movementAnimatorRef.current;
    if (!mAnimator || mAnimator.isAnimating()) return;

    // Also wait for any active combat animation to finish before processing next command
    if (combatAnimatorRef.current?.isAnimating()) return;

    const queued = processNextCommand();
    if (!queued) return;

    const { command, unitType, ownerId, path } = queued;

    // Helper: is a tile visible to the human player right now?
    const vis = useGameStore.getState().visibilityMap;
    const isTileVisible = (x: number, y: number) => !vis || vis[y]?.[x] === true;

    // MOVE command with a path — play movement animation only if visible
    if (command.type === "MOVE" && path && path.length > 1 && unitType && ownerId !== undefined) {
      // Check if any tile along the path is visible to the human player.
      // If the entire path is in fog, skip the animation (AWBW behaviour: you
      // never see enemy units move while they are hidden).
      const pathVisible = path.some((t) => isTileVisible(t.x, t.y));

      if (pathVisible) {
        setQueueAnimatingUnitId(command.unit_id);
        mAnimator.animate(unitType, ownerId, path, () => {
          submitCommand(command);
          setQueueAnimatingUnitId(undefined);
          onQueuedAnimationComplete();
          setQueueTrigger((t) => t + 1);
        });
      } else {
        // Entirely in fog — apply instantly, no animation
        submitCommand(command);
        onQueuedAnimationComplete();
        setQueueTrigger((t) => t + 1);
      }
    } else if (command.type === "ATTACK") {
      // ATTACK command — play combat animation only if either combatant is visible
      const curState = useGameStore.getState().gameState;
      const cAnim = combatAnimatorRef.current;
      if (curState && cAnim) {
        const attacker = getUnit(curState, command.attacker_id);
        const defender = getUnit(curState, command.target_id);
        if (attacker && defender) {
          const attackVisible =
            isTileVisible(attacker.x, attacker.y) || isTileVisible(defender.x, defender.y);
          const postState = applyCommand(curState, command);
          const attackerDestroyed = !getUnit(postState, command.attacker_id);
          const defenderDestroyed = !getUnit(postState, command.target_id);

          if (attackVisible) {
            cAnim.animate({
              attackerPos: { x: attacker.x, y: attacker.y },
              defenderPos: { x: defender.x, y: defender.y },
              attackerDestroyed,
              defenderDestroyed,
              onComplete: () => {
                submitCommand(command);
                onQueuedAnimationComplete();
                setQueueTrigger((t) => t + 1);
              },
            });
            return;
          } else {
            // Both combatants in fog — apply instantly
            submitCommand(command);
            onQueuedAnimationComplete();
            setQueueTrigger((t) => t + 1);
            return;
          }
        }
      }
      // Fallback: no animation available
      setTimeout(() => {
        submitCommand(command);
        onQueuedAnimationComplete();
        setQueueTrigger((t) => t + 1);
      }, 100);
    } else {
      // Non-move, non-attack command — short delay for visual clarity
      setTimeout(() => {
        submitCommand(command);
        onQueuedAnimationComplete();
        setQueueTrigger((t) => t + 1);
      }, 100);
    }
  }, [
    pixiReady,
    processingQueue,
    isAnimating,
    commandQueue,
    queueTrigger,
    processNextCommand,
    submitCommand,
    onQueuedAnimationComplete,
  ]);

  // Re-render whenever game state OR pixi readiness changes.
  // pixiReady in the dep array is the key fix: when Pixi finishes initialising
  // after gameState is already set, this effect fires and draws the board.
  useEffect(() => {
    if (!pixiReady || !gameState) return;
    if (!getApp()) return;

    inputHandlerRef.current?.setMapSize(gameState.map_width, gameState.map_height);
    terrainRendererRef.current?.render(gameState, visibilityMap);
    // Pass the animating unit ID so we can hide it during movement animation
    // Could be player's unit (selectedUnit) or AI's unit (queueAnimatingUnitId)
    const animatingUnitId =
      queueAnimatingUnitId ?? (isAnimating && selectedUnit ? selectedUnit.id : undefined);
    unitRendererRef.current?.render(gameState, animatingUnitId, visibilityMap);

    // Fog of war overlay — drawn above units so fogged units are hidden
    fogRendererRef.current?.render(gameState.map_width, gameState.map_height, visibilityMap);

    const highlights = highlightRendererRef.current;
    const pathOverlay = pathOverlayRef.current;
    const cursorOverlay = cursorOverlayRef.current;
    if (!highlights || !pathOverlay || !cursorOverlay) return;

    highlights.clear();
    // Draw subtle grid lines over the entire map
    highlights.drawGrid(gameState.map_width, gameState.map_height);
    pathOverlay.clear();
    cursorOverlay.clear();

    if (selectedUnit) {
      highlights.drawSelected([{ x: selectedUnit.x, y: selectedUnit.y }]);
    }
    if (reachableTiles.length > 0) {
      highlights.drawReachable(reachableTiles);
    }
    if (attackableTiles.length > 0) {
      highlights.drawAttackable(attackableTiles);
    }

    // Draw path arrow - use pendingPath if clicked, otherwise use hoverPath
    const pathToShow = pendingPath.length > 1 ? pendingPath : hoverPath;
    if (pathToShow.length > 1) {
      pathOverlay.drawPath(pathToShow);
    }

    // Always draw targeting cursor at hovered tile
    if (hoveredTile) {
      cursorOverlay.drawTargetCursor(hoveredTile.x, hoveredTile.y);
    }
  }, [
    pixiReady,
    gameState,
    visibilityMap,
    selectedUnit,
    reachableTiles,
    attackableTiles,
    hoveredTile,
    hoverPath,
    pendingMove,
    pendingPath,
    isAnimating,
    queueAnimatingUnitId,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
