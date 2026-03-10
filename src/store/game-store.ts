// Zustand game store: holds GameState and drives the game loop.

import { create } from "zustand";
import type { GameState, GameCommand, UnitState, Vec2 } from "../game/types";
import {
  createGameState,
  getCurrentPlayer,
  getUnit,
  getUnitAt,
  duplicateState,
} from "../game/game-state";
import { validateCommand } from "../game/validators";
import { applyCommand } from "../game/apply-command";
import { getReachableTiles, getAttackableTiles, findPath } from "../game/pathfinding";
import { computeVisibility } from "../game/visibility";

/** Returns the player ID whose fog should be shown on screen.
 *  When it's a human's turn → that human's fog.
 *  When it's an AI's turn   → the first human player's fog (so the watcher
 *  can't see the AI's hidden movements). Falls back to current player if no
 *  human is found (shouldn't happen in normal matches). */
function getViewingPlayerId(state: GameState): number {
  const current = state.players[state.current_player_index];
  if (!current) return 0;
  if (current.controller_type === "human") return current.id;
  // AI's turn — keep rendering from the human player's perspective
  const humanPlayer = state.players.find((p) => p.controller_type === "human");
  return humanPlayer?.id ?? current.id;
}

// For external command animations (AI/enemy)
export interface QueuedCommand {
  command: GameCommand;
  unitType?: string;
  ownerId?: number;
  path?: Vec2[];
}

interface GameStore {
  // State
  gameState: GameState | null;
  visibilityMap: boolean[][] | null; // null = fog off or no game state; true[][] = fog on
  selectedUnit: UnitState | null;
  reachableTiles: Vec2[];
  attackableTiles: Vec2[];
  hoveredTile: Vec2 | null;
  hoverPath: Vec2[]; // path preview while hovering (before click)
  pendingMove: Vec2 | null; // destination after click, before action confirmed
  pendingPath: Vec2[]; // path from unit to pendingMove (after click) - for rendering arrow
  animationPath: Vec2[]; // path used for actual animation (preserved after arrow cleared)
  isAnimating: boolean; // true while a movement animation is playing
  pendingAction: GameCommand | null; // action to execute after animation

  // Command queue for external commands (AI/enemy)
  commandQueue: QueuedCommand[];
  processingQueue: boolean;

  // Actions
  setGameState: (state: GameState) => void;
  recomputeVisibility: () => void;
  selectUnit: (unit: UnitState | null) => void;
  setHoveredTile: (pos: Vec2 | null) => void;
  setPendingMove: (dest: Vec2 | null) => void;
  startMoveAnimation: (actionCmd: GameCommand) => void; // starts animation, stores pending action
  onAnimationComplete: () => void; // called when animation finishes
  confirmMoveAndAction: (actionCmd: GameCommand) => { success: boolean; error?: string };
  submitCommand: (cmd: GameCommand) => { success: boolean; error?: string };
  resetSelection: () => void;
  cancelPendingMove: () => void;

  // Queue system for AI/external commands
  queueCommands: (commands: GameCommand[]) => void;
  processNextCommand: () => QueuedCommand | null;
  onQueuedAnimationComplete: () => void;

  // Clears movement-animation state after move completes but before combat animation starts.
  // Sets gameState to post-move, clears all selection/overlay fields.
  applyPostMoveState: (newState: GameState) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  visibilityMap: null,
  selectedUnit: null,
  reachableTiles: [],
  attackableTiles: [],
  hoveredTile: null,
  hoverPath: [],
  pendingMove: null,
  pendingPath: [],
  animationPath: [],
  isAnimating: false,
  pendingAction: null,
  commandQueue: [],
  processingQueue: false,

  recomputeVisibility: () => {
    const { gameState } = get();
    if (!gameState || !gameState.fog_of_war) {
      set({ visibilityMap: null });
      return;
    }
    set({ visibilityMap: computeVisibility(gameState, getViewingPlayerId(gameState)) });
  },

  setGameState: (state) => {
    // Single atomic set — prevents a stale visibilityMap from the previous game
    // triggering a mid-render with incorrect fog before the new map is computed.
    const visibilityMap = state.fog_of_war
      ? computeVisibility(state, getViewingPlayerId(state))
      : null;
    set({ gameState: state, visibilityMap });
  },

  selectUnit: (unit) => {
    const { gameState } = get();
    if (!unit || !gameState) {
      set({
        selectedUnit: null,
        reachableTiles: [],
        attackableTiles: [],
        pendingMove: null,
        pendingPath: [],
        hoverPath: [],
      });
      return;
    }

    const { visibilityMap } = get();
    const reachable = unit.has_moved
      ? []
      : getReachableTiles(gameState, unit, visibilityMap ?? undefined);
    // Don't show attack squares initially - only show after clicking a destination
    // (or if unit has already moved and can't move further)
    const attackable: Vec2[] = [];

    set({
      selectedUnit: unit,
      reachableTiles: reachable,
      attackableTiles: attackable,
      pendingMove: null,
      pendingPath: [],
      hoverPath: [],
    });
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
    const { visibilityMap } = get();
    const allAttackable = getAttackableTiles(
      gameState,
      selectedUnit,
      dest.x,
      dest.y,
      0,
      visibilityMap ?? undefined
    );

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

  // Start movement animation before executing the action
  startMoveAnimation: (actionCmd) => {
    const { pendingPath } = get();
    // Copy path to animationPath for the animator, clear visual overlays
    set({
      isAnimating: true,
      pendingAction: actionCmd,
      animationPath: pendingPath, // Animator uses this
      pendingPath: [], // Clear arrow immediately
      hoverPath: [],
      attackableTiles: [],
      reachableTiles: [],
    });
  },

  // Called when animation completes - executes the pending action
  onAnimationComplete: () => {
    const { pendingAction } = get();
    set({ isAnimating: false });

    if (pendingAction) {
      // Now execute the actual move + action
      get().confirmMoveAndAction(pendingAction);
    }
  },

  // Confirm the pending move and execute an action (WAIT, ATTACK, CAPTURE, etc.)
  confirmMoveAndAction: (actionCmd) => {
    const { gameState, selectedUnit, pendingMove } = get();
    if (!gameState || !selectedUnit) return { success: false, error: "No game state or unit" };

    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer) return { success: false, error: "No current player" };

    let state = gameState;

    // If there's a pending move to a different tile and unit hasn't moved yet, apply MOVE first
    const isInPlace =
      !pendingMove || (pendingMove.x === selectedUnit.x && pendingMove.y === selectedUnit.y);
    if (pendingMove && !selectedUnit.has_moved && !isInPlace) {
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

    // Compute visibility for the new state before committing
    const newVisibility = state.fog_of_war
      ? computeVisibility(state, getViewingPlayerId(state))
      : null;

    // Clear everything after confirmed action
    set({
      gameState: state,
      visibilityMap: newVisibility,
      selectedUnit: null,
      reachableTiles: [],
      attackableTiles: [],
      pendingMove: null,
      pendingPath: [],
      animationPath: [],
      hoverPath: [],
      pendingAction: null,
    });

    return { success: true };
  },

  submitCommand: (cmd) => {
    const { gameState } = get();
    if (!gameState) return { success: false, error: "No game state" };

    const result = validateCommand(cmd, gameState);
    if (!result.valid) return { success: false, error: result.error };

    const newState = applyCommand(gameState, cmd);
    // Use setGameState so visibility is recomputed automatically
    get().setGameState(newState);

    // Clear selection after action-finalizing commands
    const clearTypes = [
      "ATTACK",
      "CAPTURE",
      "WAIT",
      "END_TURN",
      "DIG_TRENCH",
      "BUILD_FOB",
      "SELF_DESTRUCT",
      "BUY_UNIT",
      "MOVE",
    ];
    if (clearTypes.includes(cmd.type)) {
      set({
        selectedUnit: null,
        reachableTiles: [],
        attackableTiles: [],
        pendingMove: null,
        pendingPath: [],
        hoverPath: [],
      });
    }

    return { success: true };
  },

  resetSelection: () =>
    set({
      selectedUnit: null,
      reachableTiles: [],
      attackableTiles: [],
      pendingMove: null,
      pendingPath: [],
      animationPath: [],
      hoverPath: [],
      isAnimating: false,
      pendingAction: null,
    }),

  cancelPendingMove: () => {
    const { selectedUnit, gameState } = get();
    if (!selectedUnit || !gameState) {
      set({ pendingMove: null, pendingPath: [], hoverPath: [] });
      return;
    }
    // Restore reachable tiles when canceling, but don't show attack squares
    const { visibilityMap } = get();
    const reachable = selectedUnit.has_moved
      ? []
      : getReachableTiles(gameState, selectedUnit, visibilityMap ?? undefined);
    set({
      pendingMove: null,
      pendingPath: [],
      hoverPath: [],
      reachableTiles: reachable,
      attackableTiles: [], // Don't show attack squares until destination is clicked
    });
  },

  // Queue commands from AI/external sources for animated playback
  queueCommands: (commands) => {
    const { gameState } = get();
    if (!gameState) return;

    // Build queued commands with animation data for MOVE commands
    const queued: QueuedCommand[] = commands.map((cmd) => {
      if (cmd.type === "MOVE") {
        const unit = getUnit(gameState, cmd.unit_id);
        if (unit) {
          const path = findPath(gameState, unit, cmd.dest_x, cmd.dest_y);
          return {
            command: cmd,
            unitType: unit.unit_type,
            ownerId: unit.owner_id,
            path:
              path.length > 0
                ? path
                : [
                    { x: unit.x, y: unit.y },
                    { x: cmd.dest_x, y: cmd.dest_y },
                  ],
          };
        }
      }
      return { command: cmd };
    });

    set({ commandQueue: queued, processingQueue: true });
  },

  // Get the next command to process (called by GameCanvas animation system)
  processNextCommand: () => {
    const { commandQueue, processingQueue, gameState } = get();
    if (!processingQueue || commandQueue.length === 0 || !gameState) {
      set({ processingQueue: false, commandQueue: [], isAnimating: false });
      return null;
    }

    const [next, ...rest] = commandQueue;
    const hasAnimation = !!(next.path && next.path.length > 1);
    set({ commandQueue: rest, isAnimating: hasAnimation });
    return next;
  },

  applyPostMoveState: (newState) => {
    const visibilityMap = newState.fog_of_war
      ? computeVisibility(newState, getViewingPlayerId(newState))
      : null;
    set({
      gameState: newState,
      visibilityMap,
      isAnimating: false,
      pendingAction: null,
      selectedUnit: null,
      reachableTiles: [],
      attackableTiles: [],
      pendingMove: null,
      pendingPath: [],
      animationPath: [],
      hoverPath: [],
    });
  },

  // Called when a queued animation completes - applies the command and continues
  onQueuedAnimationComplete: () => {
    const { commandQueue } = get();
    // Check if there are more commands - if not, also stop processing
    if (commandQueue.length === 0) {
      set({ isAnimating: false, processingQueue: false });
    } else {
      set({ isAnimating: false });
    }
  },
}));
