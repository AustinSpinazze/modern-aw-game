"use client";
// Mounts the Pixi.js canvas and wires game input.

import { useEffect, useRef, useState } from "react";
import { initPixiApp, destroyPixiApp, getApp } from "../rendering/pixi-app";
import { TerrainRenderer } from "../rendering/terrain-renderer";
import { UnitRenderer } from "../rendering/unit-renderer";
import { HighlightRenderer } from "../rendering/highlight-renderer";
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
    selectUnit,
    setHoveredTile,
    submitCommand,
    resetSelection,
  } = useGameStore();

  // Init Pixi once on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    let mounted = true;

    initPixiApp(canvasRef.current).then((app) => {
      if (!mounted) return;

      const terrain = new TerrainRenderer();
      const units = new UnitRenderer();
      const highlights = new HighlightRenderer();

      app.stage.addChild(terrain.getContainer());
      app.stage.addChild(highlights.getContainer());
      app.stage.addChild(units.getContainer());

      terrainRendererRef.current = terrain;
      unitRendererRef.current = units;
      highlightRendererRef.current = highlights;

      // Wire input
      const handleTileClick = (pos: Vec2) => {
        const state = useGameStore.getState().gameState;
        if (!state) return;

        const {
          selectedUnit: selUnit,
          reachableTiles,
          attackableTiles,
          submitCommand,
          selectUnit,
          resetSelection,
        } = useGameStore.getState();

        const currentPlayer = state.players[state.current_player_index];
        if (!currentPlayer) return;

        const clickedUnit = getUnitAt(state, pos.x, pos.y);

        if (selUnit) {
          const isReachable = reachableTiles.some((t) => t.x === pos.x && t.y === pos.y);
          if (isReachable && !selUnit.has_moved) {
            submitCommand({
              type: "MOVE",
              player_id: currentPlayer.id,
              unit_id: selUnit.id,
              dest_x: pos.x,
              dest_y: pos.y,
            });
            return;
          }

          const isAttackable = attackableTiles.some((t) => t.x === pos.x && t.y === pos.y);
          if (
            isAttackable &&
            clickedUnit &&
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
          if (clickedUnit && clickedUnit.owner_id === currentPlayer.id && !clickedUnit.is_loaded) {
            selectUnit(clickedUnit);
          }
        } else {
          if (clickedUnit && clickedUnit.owner_id === currentPlayer.id && !clickedUnit.is_loaded) {
            selectUnit(clickedUnit);
          } else if (!clickedUnit) {
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

  // Re-render whenever game state OR pixi readiness changes.
  // pixiReady in the dep array is the key fix: when Pixi finishes initialising
  // after gameState is already set, this effect fires and draws the board.
  useEffect(() => {
    if (!pixiReady || !gameState) return;
    if (!getApp()) return;

    inputHandlerRef.current?.setMapSize(gameState.map_width, gameState.map_height);
    terrainRendererRef.current?.render(gameState);
    unitRendererRef.current?.render(gameState);

    const highlights = highlightRendererRef.current;
    if (!highlights) return;

    highlights.clear();

    if (selectedUnit) {
      highlights.drawSelected([{ x: selectedUnit.x, y: selectedUnit.y }]);
    }
    if (reachableTiles.length > 0) {
      highlights.drawReachable(reachableTiles);
    }
    if (attackableTiles.length > 0) {
      highlights.drawAttackable(attackableTiles);
    }
  }, [pixiReady, gameState, selectedUnit, reachableTiles, attackableTiles]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
