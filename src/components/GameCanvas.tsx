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
import { InputHandler } from "../rendering/input-handler";
import { useGameStore } from "../store/game-store";
import type { Vec2 } from "../game/types";
import { getUnitAt, getTile } from "../game/game-state";
import { getTerrainData } from "../game/data-loader";

interface GameCanvasProps {
  onFacilityClick?: (x: number, y: number) => void;
}

export default function GameCanvas({ onFacilityClick }: GameCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRendererRef = useRef<TerrainRenderer | null>(null);
  const unitRendererRef = useRef<UnitRenderer | null>(null);
  const highlightRendererRef = useRef<HighlightRenderer | null>(null);
  const pathOverlayRef = useRef<HighlightRenderer | null>(null); // For path arrows
  const cursorOverlayRef = useRef<HighlightRenderer | null>(null); // For targeting cursor (always on top)
  const movementAnimatorRef = useRef<MovementAnimator | null>(null); // For unit movement
  const inputHandlerRef = useRef<InputHandler | null>(null);
  const onFacilityClickRef = useRef(onFacilityClick);
  onFacilityClickRef.current = onFacilityClick;

  // Track when Pixi is ready so the render effect knows to fire
  const [pixiReady, setPixiReady] = useState(false);

  const {
    gameState,
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

      // Render order: terrain -> highlights -> units -> capture overlay -> movement anim -> path overlay -> cursor (on top)
      app.stage.addChild(terrain.getContainer());
      app.stage.addChild(highlights.getContainer());
      app.stage.addChild(units.getContainer());
      app.stage.addChild(terrain.getCaptureOverlay()); // Capture indicators above units
      app.stage.addChild(movementAnimator.getContainer()); // Moving unit on top of static units
      app.stage.addChild(pathOverlay.getContainer());
      app.stage.addChild(cursorOverlay.getContainer()); // Cursor always on very top

      terrainRendererRef.current = terrain;
      unitRendererRef.current = units;
      highlightRendererRef.current = highlights;
      pathOverlayRef.current = pathOverlay;
      cursorOverlayRef.current = cursorOverlay;
      movementAnimatorRef.current = movementAnimator;

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
              // Confirm move + attack
              confirmMoveAndAction({
                type: "ATTACK",
                player_id: currentPlayer.id,
                attacker_id: selUnit.id,
                target_id: clickedUnit.id,
                weapon_index: 0,
              });
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

          // Check for direct attack from current position (no move)
          const isAttackable = attackableTiles.some((t) => t.x === pos.x && t.y === pos.y);
          if (
            isAttackable &&
            clickedUnit &&
            currentPlayer && // defensive check
            clickedUnit.owner_id !== currentPlayer.id &&
            !selUnit.has_acted
          ) {
            submitCommand({
              type: "ATTACK",
              player_id: currentPlayer.id,
              attacker_id: selUnit.id,
              target_id: clickedUnit.id,
              weapon_index: 0,
            });
            return;
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
  }, [pixiReady]);

  // Animation update loop
  useEffect(() => {
    if (!pixiReady) return;

    const app = getApp();
    if (!app) return;

    const ticker = app.ticker;
    const onTick = () => {
      const animator = movementAnimatorRef.current;
      if (animator?.isAnimating()) {
        animator.update();
      }
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
      // Animation complete - trigger the actual game state update
      onAnimationComplete();
    });
  }, [isAnimating, selectedUnit, animationPath, onAnimationComplete]);

  // Track queue processing state locally to ensure re-renders
  const [queueTrigger, setQueueTrigger] = useState(0);

  // Process command queue (AI/enemy turns)
  useEffect(() => {
    if (!pixiReady || !processingQueue) return;
    if (isAnimating) return; // Wait for current animation to finish

    const animator = movementAnimatorRef.current;
    if (!animator || animator.isAnimating()) return;

    const queued = processNextCommand();
    if (!queued) return;

    const { command, unitType, ownerId, path } = queued;

    // If this is a MOVE command with a path, animate it
    if (command.type === "MOVE" && path && path.length > 1 && unitType && ownerId !== undefined) {
      setQueueAnimatingUnitId(command.unit_id);
      animator.animate(unitType, ownerId, path, () => {
        // Animation done - apply the command
        submitCommand(command);
        setQueueAnimatingUnitId(undefined);
        onQueuedAnimationComplete();
        // Trigger next command processing
        setQueueTrigger((t) => t + 1);
      });
    } else {
      // Non-move command - just apply it with a small delay for visual effect
      setTimeout(() => {
        submitCommand(command);
        onQueuedAnimationComplete();
        // Trigger next command processing
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
    terrainRendererRef.current?.render(gameState);
    // Pass the animating unit ID so we can hide it during movement animation
    // Could be player's unit (selectedUnit) or AI's unit (queueAnimatingUnitId)
    const animatingUnitId =
      queueAnimatingUnitId ?? (isAnimating && selectedUnit ? selectedUnit.id : undefined);
    unitRendererRef.current?.render(gameState, animatingUnitId);

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
