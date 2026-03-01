"use client";
// Zustand game store: holds GameState and drives the game loop.

import { create } from "zustand";
import type { GameState, GameCommand, UnitState, Vec2 } from "../game/types";
import { createGameState, getCurrentPlayer, getUnit, getUnitAt, duplicateState } from "../game/game-state";
import { validateCommand } from "../game/validators";
import { applyCommand } from "../game/apply-command";
import { getReachableTiles, getAttackableTiles } from "../game/pathfinding";

interface GameStore {
  // State
  gameState: GameState | null;
  selectedUnit: UnitState | null;
  reachableTiles: Vec2[];
  attackableTiles: Vec2[];
  hoveredTile: Vec2 | null;
  pendingMove: Vec2 | null; // set after move before attack/wait

  // Actions
  setGameState: (state: GameState) => void;
  selectUnit: (unit: UnitState | null) => void;
  setHoveredTile: (pos: Vec2 | null) => void;
  setPendingMove: (pos: Vec2 | null) => void;
  submitCommand: (cmd: GameCommand) => { success: boolean; error?: string };
  resetSelection: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedUnit: null,
  reachableTiles: [],
  attackableTiles: [],
  hoveredTile: null,
  pendingMove: null,

  setGameState: (state) => set({ gameState: state }),

  selectUnit: (unit) => {
    const { gameState } = get();
    if (!unit || !gameState) {
      set({ selectedUnit: null, reachableTiles: [], attackableTiles: [] });
      return;
    }

    const reachable = unit.has_moved ? [] : getReachableTiles(gameState, unit);
    const attackable = unit.has_acted ? [] : getAttackableTiles(gameState, unit, unit.x, unit.y, 0);

    set({ selectedUnit: unit, reachableTiles: reachable, attackableTiles: attackable });
  },

  setHoveredTile: (pos) => set({ hoveredTile: pos }),
  setPendingMove: (pos) => set({ pendingMove: pos }),

  submitCommand: (cmd) => {
    const { gameState } = get();
    if (!gameState) return { success: false, error: "No game state" };

    const result = validateCommand(cmd, gameState);
    if (!result.valid) return { success: false, error: result.error };

    const newState = applyCommand(gameState, cmd);
    set({ gameState: newState });

    // Clear selection after action-finalizing commands
    const clearTypes = ["ATTACK", "CAPTURE", "WAIT", "END_TURN", "DIG_TRENCH", "BUILD_FOB", "SELF_DESTRUCT", "BUY_UNIT"];
    if (clearTypes.includes(cmd.type)) {
      set({ selectedUnit: null, reachableTiles: [], attackableTiles: [], pendingMove: null });
    } else if (cmd.type === "MOVE") {
      // After move: recompute attackable from new position
      const movedUnit = getUnit(newState, (cmd as { unit_id: number }).unit_id);
      if (movedUnit && !movedUnit.has_acted) {
        const attackable = getAttackableTiles(newState, movedUnit, movedUnit.x, movedUnit.y, 0);
        set({ selectedUnit: movedUnit, reachableTiles: [], attackableTiles: attackable });
      } else {
        set({ selectedUnit: null, reachableTiles: [], attackableTiles: [], pendingMove: null });
      }
    }

    return { success: true };
  },

  resetSelection: () => set({
    selectedUnit: null,
    reachableTiles: [],
    attackableTiles: [],
    pendingMove: null,
  }),
}));
