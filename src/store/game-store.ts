"use client";
// Zustand game store: holds GameState and drives the game loop.

import { create } from "zustand";
import type { GameState, GameCommand, UnitState, Vec2 } from "../game/types";
import { createGameState, getCurrentPlayer, getUnit, getUnitAt, duplicateState } from "../game/game-state";
import { validateCommand } from "../game/validators";
import { applyCommand } from "../game/apply-command";
import { getReachableTiles, getAttackableTiles, findPath } from "../game/pathfinding";

interface GameStore {
  // State
  gameState: GameState | null;
  selectedUnit: UnitState | null;
  reachableTiles: Vec2[];
  attackableTiles: Vec2[];
  hoveredTile: Vec2 | null;
  hoverPath: Vec2[]; // path preview while hovering (before click)
  pendingMove: Vec2 | null; // destination after click, before action confirmed
  pendingPath: Vec2[]; // path from unit to pendingMove (after click)

  // Actions
  setGameState: (state: GameState) => void;
  selectUnit: (unit: UnitState | null) => void;
  setHoveredTile: (pos: Vec2 | null) => void;
  setPendingMove: (dest: Vec2 | null) => void;
  confirmMoveAndAction: (actionCmd: GameCommand) => { success: boolean; error?: string };
  submitCommand: (cmd: GameCommand) => { success: boolean; error?: string };
  resetSelection: () => void;
  cancelPendingMove: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedUnit: null,
  reachableTiles: [],
  attackableTiles: [],
  hoveredTile: null,
  hoverPath: [],
  pendingMove: null,
  pendingPath: [],

  setGameState: (state) => set({ gameState: state }),

  selectUnit: (unit) => {
    const { gameState } = get();
    if (!unit || !gameState) {
      set({ selectedUnit: null, reachableTiles: [], attackableTiles: [], pendingMove: null, pendingPath: [], hoverPath: [] });
      return;
    }

    const reachable = unit.has_moved ? [] : getReachableTiles(gameState, unit);
    // Don't show attack squares initially - only show after clicking a destination
    // (or if unit has already moved and can't move further)
    const attackable: Vec2[] = [];

    set({ selectedUnit: unit, reachableTiles: reachable, attackableTiles: attackable, pendingMove: null, pendingPath: [], hoverPath: [] });
  },

  // Update hovered tile and compute hover path if over a reachable tile
  setHoveredTile: (pos) => {
    const { gameState, selectedUnit, reachableTiles, pendingMove } = get();
    
    // Don't compute hover path if we already have a pending move (clicked destination)
    if (pendingMove) {
      set({ hoveredTile: pos });
      return;
    }

    if (!pos || !gameState || !selectedUnit) {
      set({ hoveredTile: pos, hoverPath: [] });
      return;
    }

    // Check if hovered tile is reachable
    const isReachable = reachableTiles.some((t) => t.x === pos.x && t.y === pos.y);
    if (isReachable) {
      const path = findPath(gameState, selectedUnit, pos.x, pos.y);
      set({ hoveredTile: pos, hoverPath: path });
    } else {
      set({ hoveredTile: pos, hoverPath: [] });
    }
  },

  // Set pending move destination and compute path (called on click)
  setPendingMove: (dest) => {
    const { gameState, selectedUnit } = get();
    if (!dest || !gameState || !selectedUnit) {
      set({ pendingMove: null, pendingPath: [], hoverPath: [] });
      return;
    }
    const path = findPath(gameState, selectedUnit, dest.x, dest.y);
    
    // Compute attackable tiles from the pending destination
    const allAttackable = getAttackableTiles(gameState, selectedUnit, dest.x, dest.y, 0);
    
    // Only keep tiles that have an enemy unit on them
    const currentPlayer = gameState.players[gameState.current_player_index];
    const attackableWithEnemies = allAttackable.filter((tile) => {
      const unitOnTile = getUnitAt(gameState, tile.x, tile.y);
      return unitOnTile && unitOnTile.owner_id !== currentPlayer?.id;
    });
    
    set({ 
      pendingMove: dest, 
      pendingPath: path,
      hoverPath: [], // Clear hover path once we have a pending move
      reachableTiles: [], // Hide reachable overlay once destination picked
      attackableTiles: attackableWithEnemies, // Only show attack tiles with enemies
    });
  },

  // Confirm the pending move and execute an action (WAIT, ATTACK, CAPTURE, etc.)
  confirmMoveAndAction: (actionCmd) => {
    const { gameState, selectedUnit, pendingMove } = get();
    if (!gameState || !selectedUnit) return { success: false, error: "No game state or unit" };

    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer) return { success: false, error: "No current player" };

    let state = gameState;

    // If there's a pending move and unit hasn't moved yet, apply MOVE first
    if (pendingMove && !selectedUnit.has_moved) {
      const moveCmd = {
        type: "MOVE" as const,
        player_id: currentPlayer.id,
        unit_id: selectedUnit.id,
        dest_x: pendingMove.x,
        dest_y: pendingMove.y,
      };

      const moveResult = validateCommand(moveCmd, state);
      if (!moveResult.valid) return { success: false, error: moveResult.error };

      state = applyCommand(state, moveCmd);
    }

    // Now apply the action command
    const actionResult = validateCommand(actionCmd, state);
    if (!actionResult.valid) return { success: false, error: actionResult.error };

    state = applyCommand(state, actionCmd);

    // Clear everything after confirmed action
    set({ 
      gameState: state, 
      selectedUnit: null, 
      reachableTiles: [], 
      attackableTiles: [], 
      pendingMove: null, 
      pendingPath: [],
      hoverPath: [],
    });

    return { success: true };
  },

  submitCommand: (cmd) => {
    const { gameState } = get();
    if (!gameState) return { success: false, error: "No game state" };

    const result = validateCommand(cmd, gameState);
    if (!result.valid) return { success: false, error: result.error };

    const newState = applyCommand(gameState, cmd);
    set({ gameState: newState });

    // Clear selection after action-finalizing commands
    const clearTypes = ["ATTACK", "CAPTURE", "WAIT", "END_TURN", "DIG_TRENCH", "BUILD_FOB", "SELF_DESTRUCT", "BUY_UNIT", "MOVE"];
    if (clearTypes.includes(cmd.type)) {
      set({ selectedUnit: null, reachableTiles: [], attackableTiles: [], pendingMove: null, pendingPath: [], hoverPath: [] });
    }

    return { success: true };
  },

  resetSelection: () => set({
    selectedUnit: null,
    reachableTiles: [],
    attackableTiles: [],
    pendingMove: null,
    pendingPath: [],
    hoverPath: [],
  }),

  cancelPendingMove: () => {
    const { selectedUnit, gameState } = get();
    if (!selectedUnit || !gameState) {
      set({ pendingMove: null, pendingPath: [], hoverPath: [] });
      return;
    }
    // Restore reachable tiles when canceling, but don't show attack squares
    const reachable = selectedUnit.has_moved ? [] : getReachableTiles(gameState, selectedUnit);
    set({ 
      pendingMove: null, 
      pendingPath: [],
      hoverPath: [],
      reachableTiles: reachable,
      attackableTiles: [], // Don't show attack squares until destination is clicked
    });
  },
}));
