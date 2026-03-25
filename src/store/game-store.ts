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
import { getUnitData } from "../game/data-loader";
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
  previewAnimating: boolean; // true while preview-move animation plays (before action menu)
  pendingAction: GameCommand | null; // action to execute after animation

  // Unload tile picking mode
  unloadTiles: Vec2[];
  unloadingCargoIndex: number | null;

  // Range preview (right-click on any visible unit)
  previewUnit: UnitState | null;
  previewReachableTiles: Vec2[];
  previewAttackableTiles: Vec2[];

  // Command queue for external commands (AI/enemy)
  commandQueue: QueuedCommand[];
  processingQueue: boolean;

  // Actions
  setGameState: (state: GameState) => void;
  clearGameState: () => void;
  recomputeVisibility: () => void;
  selectUnit: (unit: UnitState | null) => void;
  setHoveredTile: (pos: Vec2 | null) => void;
  setPendingMove: (dest: Vec2 | null) => void;
  startMoveAnimation: (actionCmd: GameCommand) => void; // starts animation, stores pending action
  onAnimationComplete: () => void; // called when animation finishes
  onPreviewAnimationComplete: () => void; // called when preview-move animation finishes
  confirmMoveAndAction: (actionCmd: GameCommand) => { success: boolean; error?: string };
  submitCommand: (cmd: GameCommand) => { success: boolean; error?: string };
  resetSelection: () => void;
  cancelPendingMove: () => void;

  setUnloadMode: (cargoIndex: number | null, tiles: Vec2[]) => void;
  setPreviewUnit: (unit: UnitState | null) => void;

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
  previewAnimating: false,
  pendingAction: null,
  unloadTiles: [],
  unloadingCargoIndex: null,
  previewUnit: null,
  previewReachableTiles: [],
  previewAttackableTiles: [],
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

  clearGameState: () => {
    set({
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
      previewAnimating: false,
      pendingAction: null,
      unloadTiles: [],
      unloadingCargoIndex: null,
      previewUnit: null,
      previewReachableTiles: [],
      previewAttackableTiles: [],
      commandQueue: [],
      processingQueue: false,
    });
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
      previewUnit: null,
      previewReachableTiles: [],
      previewAttackableTiles: [],
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

    // Compute attackable tiles from the pending destination.
    // Indirect units (min_range > 1) can only attack from their current position — no overlay when moving.
    const { visibilityMap } = get();
    const unitData = getUnitData(selectedUnit.unit_type);
    const isIndirect = unitData?.weapons.some((w) => w.min_range > 1) ?? false;
    const isMovingAway = dest.x !== selectedUnit.x || dest.y !== selectedUnit.y;

    const currentPlayer = gameState.players[gameState.current_player_index];
    let attackableWithEnemies: Vec2[] = [];
    if (!(isIndirect && isMovingAway)) {
      const allAttackable = getAttackableTiles(
        gameState,
        selectedUnit,
        dest.x,
        dest.y,
        0,
        visibilityMap ?? undefined
      );
      attackableWithEnemies = allAttackable.filter((tile) => {
        const unitOnTile = getUnitAt(gameState, tile.x, tile.y);
        return unitOnTile && unitOnTile.owner_id !== currentPlayer?.id;
      });
    }

    // Trigger preview animation if moving to a different tile
    const needsPreviewAnim = isMovingAway && path.length >= 2;

    set({
      pendingMove: dest,
      pendingPath: path,
      hoverPath: [], // Clear hover path once we have a pending move
      reachableTiles: [], // Hide reachable overlay once destination picked
      attackableTiles: attackableWithEnemies, // Only show attack tiles with enemies
      previewAnimating: needsPreviewAnim,
    });
  },

  // Start movement animation before executing the action.
  // If preview animation already played (unit at destination), skip the movement animation.
  startMoveAnimation: (actionCmd) => {
    const { pendingPath, previewAnimating } = get();
    // If preview animation already ran, the unit is visually at the destination —
    // use an empty animationPath so the action effect fires immediately.
    const alreadyMoved = !previewAnimating && pendingPath.length >= 2;
    set({
      isAnimating: true,
      pendingAction: actionCmd,
      animationPath: alreadyMoved ? [] : pendingPath, // skip anim if preview already played
      pendingPath: [], // Clear arrow immediately
      hoverPath: [],
      attackableTiles: [],
      reachableTiles: [],
      unloadTiles: [],
      unloadingCargoIndex: null,
    });
  },

  // Called when preview-move animation completes (unit arrived at destination, open action menu)
  onPreviewAnimationComplete: () => {
    set({ previewAnimating: false });
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

    // For MERGE: skip the MOVE entirely — the merging unit gets removed, target stays in place.
    // The unit just needs to be validated & the merge applied directly.
    let effectivePendingMove = pendingMove;
    if (actionCmd.type === "MERGE" && pendingMove) {
      effectivePendingMove = { x: selectedUnit.x, y: selectedUnit.y }; // stay in place, skip MOVE
    }

    // For LOAD: if pendingMove is the transport's tile, redirect movement to the tile just before
    // the transport (infantry moves adjacent, then loads). This matches the AW click-onto-transport flow.
    if (actionCmd.type === "LOAD" && pendingMove && !selectedUnit.has_moved) {
      const transport = getUnit(state, actionCmd.transport_id);
      if (transport && transport.x === pendingMove.x && transport.y === pendingMove.y) {
        const path = findPath(state, selectedUnit, transport.x, transport.y);
        effectivePendingMove =
          path.length >= 2 ? path[path.length - 2] : { x: selectedUnit.x, y: selectedUnit.y };
      }
    }

    // If there's a pending move to a different tile and unit hasn't moved yet, apply MOVE first
    const isInPlace =
      !effectivePendingMove ||
      (effectivePendingMove.x === selectedUnit.x && effectivePendingMove.y === selectedUnit.y);
    if (effectivePendingMove && !selectedUnit.has_moved && !isInPlace) {
      const moveCmd = {
        type: "MOVE" as const,
        player_id: currentPlayer.id,
        unit_id: selectedUnit.id,
        dest_x: effectivePendingMove.x,
        dest_y: effectivePendingMove.y,
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
      previewAnimating: false,
      unloadTiles: [],
      unloadingCargoIndex: null,
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
      "MERGE",
      "HIDE",
      "UNHIDE",
      "SUBMERGE",
      "SURFACE",
      "RESUPPLY",
    ];
    if (clearTypes.includes(cmd.type)) {
      set({
        selectedUnit: null,
        reachableTiles: [],
        attackableTiles: [],
        pendingMove: null,
        pendingPath: [],
        hoverPath: [],
        unloadTiles: [],
        unloadingCargoIndex: null,
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
      previewAnimating: false,
      pendingAction: null,
      unloadTiles: [],
      unloadingCargoIndex: null,
      previewUnit: null,
      previewReachableTiles: [],
      previewAttackableTiles: [],
    }),

  cancelPendingMove: () => {
    const { selectedUnit, gameState } = get();
    if (!selectedUnit || !gameState) {
      set({ pendingMove: null, pendingPath: [], hoverPath: [], previewAnimating: false });
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
      unloadTiles: [],
      unloadingCargoIndex: null,
      previewAnimating: false,
    });
  },

  setUnloadMode: (cargoIndex, tiles) => {
    set({ unloadingCargoIndex: cargoIndex, unloadTiles: tiles });
  },

  setPreviewUnit: (unit) => {
    const { gameState } = get();
    if (!unit || !gameState) {
      set({ previewUnit: null, previewReachableTiles: [], previewAttackableTiles: [] });
      return;
    }

    // Movement range — full geometric range ignoring fog
    const reachable = unit.has_moved ? [] : getReachableTiles(gameState, unit);

    // Combined attack envelope: union of attack range from every reachable position
    const unitData = getUnitData(unit.unit_type);
    const weaponCount = unitData?.weapons.length ?? 0;
    const attackableSet = new Set<string>();
    const allAttackable: Vec2[] = [];
    const positions: Vec2[] = [{ x: unit.x, y: unit.y }, ...reachable];

    for (const pos of positions) {
      for (let wi = 0; wi < (weaponCount || 1); wi++) {
        for (const t of getAttackableTiles(gameState, unit, pos.x, pos.y, wi)) {
          const key = `${t.x},${t.y}`;
          if (!attackableSet.has(key)) {
            attackableSet.add(key);
            allAttackable.push(t);
          }
        }
      }
    }

    set({
      previewUnit: unit,
      previewReachableTiles: reachable,
      previewAttackableTiles: allAttackable,
    });
  },

  // Queue commands from AI/external sources for animated playback
  queueCommands: (commands) => {
    const { gameState } = get();
    if (!gameState) return;

    const queued: QueuedCommand[] = commands.map((cmd) => {
      if (cmd.type === "MOVE") {
        const unit = getUnit(gameState, cmd.unit_id);
        if (unit) {
          return { command: cmd, unitType: unit.unit_type, ownerId: unit.owner_id };
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

    // Compute MOVE path against current (live) state so it reflects prior moves in the queue
    let queued = next;
    if (next.command.type === "MOVE" && !next.path) {
      const unit = getUnit(gameState, next.command.unit_id);
      if (unit) {
        const path = findPath(gameState, unit, next.command.dest_x, next.command.dest_y);
        queued = {
          ...next,
          path:
            path.length > 0
              ? path
              : [
                  { x: unit.x, y: unit.y },
                  { x: next.command.dest_x, y: next.command.dest_y },
                ],
        };
      }
    }

    const hasAnimation = !!(queued.path && queued.path.length > 1);
    set({ commandQueue: rest, isAnimating: hasAnimation });
    return queued;
  },

  applyPostMoveState: (newState) => {
    const visibilityMap = newState.fog_of_war
      ? computeVisibility(newState, getViewingPlayerId(newState))
      : null;
    set({
      gameState: newState,
      visibilityMap,
      isAnimating: false,
      previewAnimating: false,
      pendingAction: null,
      selectedUnit: null,
      reachableTiles: [],
      attackableTiles: [],
      pendingMove: null,
      pendingPath: [],
      animationPath: [],
      hoverPath: [],
      unloadTiles: [],
      unloadingCargoIndex: null,
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
