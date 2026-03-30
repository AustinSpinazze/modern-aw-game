// Zustand store for the map editor. Holds draft GameState, brush, undo/redo.
// Does NOT touch useGameStore — only pushes to it when the user clicks "Play".

import { create } from "zustand";
import type { GameState, UnitState } from "../game/types";
import {
  createGameState,
  createPlayer,
  createTile,
  createUnit,
  initializeMap,
  setTile,
  addUnit,
  removeUnit,
  duplicateState,
} from "../game/game-state";
import { generateMatchSeed } from "../game/rng";

// ── Types ────────────────────────────────────────────────────────────────────

export type BrushCategory = "terrain" | "building" | "unit" | "eraser";

export interface BrushState {
  category: BrushCategory;
  terrainType: string;
  buildingType: string;
  unitType: string;
  playerId: number; // 0-3 for buildings/units, -1 for neutral buildings
}

export interface EditorState {
  // Draft map state
  draft: GameState | null;
  mapName: string;
  mapDescription: string;
  currentMapId: string | null; // ID of the saved map being edited (for update-in-place)
  dirty: boolean; // true if unsaved changes exist

  // Brush
  brush: BrushState;

  // Undo / redo (full state snapshots)
  undoStack: GameState[];
  redoStack: GameState[];
  maxUndoSize: number;

  // Gesture tracking — we batch all tiles painted in one click-drag into one undo entry
  isGesturing: boolean;
  gestureStartState: GameState | null;

  // Actions
  newMap: (width: number, height: number) => void;
  loadDraft: (state: GameState, name?: string, description?: string, mapId?: string) => void;
  setBrush: (patch: Partial<BrushState>) => void;
  markDirty: () => void;
  markClean: () => void;

  // Tile mutations
  paintTile: (x: number, y: number) => void;
  eraseTile: (x: number, y: number) => void;
  fillMap: () => void;

  // Gesture lifecycle
  beginGesture: () => void;
  endGesture: () => void;

  // Undo / redo
  undo: () => void;
  redo: () => void;
  pushUndo: (state: GameState) => void;

  // Map resize
  resizeMap: (edge: "top" | "bottom" | "left" | "right", delta: number) => void;

  // Map properties
  setMapName: (name: string) => void;
  setMapDescription: (desc: string) => void;

  // Clear
  clearEditor: () => void;
}

// ── Default brush ────────────────────────────────────────────────────────────

const DEFAULT_BRUSH: BrushState = {
  category: "terrain",
  terrainType: "forest", // Default to forest so first paint on a blank plains map is visible
  buildingType: "city",
  unitType: "infantry",
  playerId: 0,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensurePlayers(state: GameState, upToId: number): GameState {
  const needed = upToId + 1;
  if (state.players.length >= needed) return state;
  const newPlayers = [...state.players];
  for (let i = state.players.length; i < needed; i++) {
    newPlayers.push(
      createPlayer({
        id: i,
        team: i,
        funds: 0,
        controller_type: i === 0 ? "human" : "heuristic",
      })
    );
  }
  return { ...state, players: newPlayers };
}

function getUnitAtPos(state: GameState, x: number, y: number): UnitState | null {
  for (const unit of Object.values(state.units)) {
    if (unit.x === x && unit.y === y && !unit.is_loaded) return unit;
  }
  return null;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  draft: null,
  mapName: "",
  mapDescription: "",
  currentMapId: null,
  dirty: false,
  brush: { ...DEFAULT_BRUSH },
  undoStack: [],
  redoStack: [],
  maxUndoSize: 100,
  isGesturing: false,
  gestureStartState: null,

  newMap: (width, height) => {
    let state = createGameState({
      match_id: `editor_${Date.now()}`,
      match_seed: generateMatchSeed(),
    });
    state = initializeMap(state, width, height);
    // Start with 2 players
    state = ensurePlayers(state, 1);
    set({
      draft: state,
      currentMapId: null,
      dirty: false,
      undoStack: [],
      redoStack: [],
      isGesturing: false,
      gestureStartState: null,
    });
  },

  loadDraft: (state, name, description, mapId) => {
    set({
      draft: duplicateState(state),
      mapName: name ?? "",
      mapDescription: description ?? "",
      currentMapId: mapId ?? null,
      dirty: false,
      undoStack: [],
      redoStack: [],
      isGesturing: false,
      gestureStartState: null,
    });
  },

  setBrush: (patch) => {
    set((s) => ({ brush: { ...s.brush, ...patch } }));
  },

  paintTile: (x, y) => {
    const { draft, brush } = get();
    if (!draft) return;
    if (x < 0 || x >= draft.map_width || y < 0 || y >= draft.map_height) return;

    let state = draft;
    const { category } = brush;

    if (category === "eraser") {
      // Remove unit if present, reset tile to plains
      const unitOnTile = getUnitAtPos(state, x, y);
      if (unitOnTile) {
        state = removeUnit(state, unitOnTile.id);
      }
      state = setTile(state, x, y, createTile({ terrain_type: "plains" }));
    } else if (category === "terrain") {
      // Remove any unit on the tile first if terrain is incompatible
      const unitOnTile = getUnitAtPos(state, x, y);
      if (unitOnTile) {
        state = removeUnit(state, unitOnTile.id);
      }
      state = setTile(state, x, y, createTile({ terrain_type: brush.terrainType }));
    } else if (category === "building") {
      const unitOnTile = getUnitAtPos(state, x, y);
      if (unitOnTile) {
        state = removeUnit(state, unitOnTile.id);
      }
      const ownerId = brush.playerId;
      if (ownerId >= 0) {
        state = ensurePlayers(state, ownerId);
      }
      state = setTile(state, x, y, createTile({
        terrain_type: brush.buildingType,
        owner_id: ownerId,
      }));
    } else if (category === "unit") {
      // Place unit — need a valid ground tile, not sea/river unless naval/air
      const existingUnit = getUnitAtPos(state, x, y);
      if (existingUnit) {
        state = removeUnit(state, existingUnit.id);
      }
      const ownerId = brush.playerId;
      state = ensurePlayers(state, ownerId);
      const unitId = state.next_unit_id;
      state = { ...state, next_unit_id: unitId + 1 };
      state = addUnit(
        state,
        createUnit({
          id: unitId,
          unit_type: brush.unitType,
          owner_id: ownerId,
          x,
          y,
        })
      );
    }

    set({ draft: state, dirty: true });
  },

  eraseTile: (x, y) => {
    const { draft } = get();
    if (!draft) return;
    if (x < 0 || x >= draft.map_width || y < 0 || y >= draft.map_height) return;

    let state = draft;
    const unitOnTile = getUnitAtPos(state, x, y);
    if (unitOnTile) {
      state = removeUnit(state, unitOnTile.id);
    }
    state = setTile(state, x, y, createTile({ terrain_type: "plains" }));
    set({ draft: state, dirty: true });
  },

  fillMap: () => {
    const { draft, brush } = get();
    if (!draft) return;

    // Push current state for undo
    get().pushUndo(draft);

    let state = draft;
    // Remove all units when filling
    state = { ...state, units: {}, next_unit_id: 1 };

    if (brush.category === "terrain") {
      for (let y = 0; y < state.map_height; y++) {
        for (let x = 0; x < state.map_width; x++) {
          state = setTile(state, x, y, createTile({ terrain_type: brush.terrainType }));
        }
      }
    } else if (brush.category === "building") {
      const ownerId = brush.playerId;
      if (ownerId >= 0) {
        state = ensurePlayers(state, ownerId);
      }
      for (let y = 0; y < state.map_height; y++) {
        for (let x = 0; x < state.map_width; x++) {
          state = setTile(state, x, y, createTile({
            terrain_type: brush.buildingType,
            owner_id: ownerId,
          }));
        }
      }
    }

    set({ draft: state, dirty: true, redoStack: [] });
  },

  beginGesture: () => {
    const { draft } = get();
    if (!draft) return;
    set({ isGesturing: true, gestureStartState: duplicateState(draft) });
  },

  endGesture: () => {
    const { isGesturing, gestureStartState, draft } = get();
    if (!isGesturing || !gestureStartState) {
      set({ isGesturing: false, gestureStartState: null });
      return;
    }
    // Only push undo if state actually changed
    if (draft && JSON.stringify(draft.tiles) !== JSON.stringify(gestureStartState.tiles) ||
        draft && JSON.stringify(draft.units) !== JSON.stringify(gestureStartState.units)) {
      get().pushUndo(gestureStartState);
    }
    set({ isGesturing: false, gestureStartState: null, redoStack: [] });
  },

  pushUndo: (state) => {
    set((s) => {
      const stack = [...s.undoStack, duplicateState(state)];
      if (stack.length > s.maxUndoSize) stack.shift();
      return { undoStack: stack };
    });
  },

  undo: () => {
    const { undoStack, draft } = get();
    if (undoStack.length === 0 || !draft) return;
    const prev = undoStack[undoStack.length - 1];
    set((s) => ({
      draft: prev,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, duplicateState(draft)],
    }));
  },

  redo: () => {
    const { redoStack, draft } = get();
    if (redoStack.length === 0 || !draft) return;
    const next = redoStack[redoStack.length - 1];
    set((s) => ({
      draft: next,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, duplicateState(draft)],
    }));
  },

  resizeMap: (edge, delta) => {
    const { draft } = get();
    if (!draft) return;

    get().pushUndo(draft);

    let { map_width: w, map_height: h, tiles, units } = draft;
    let newTiles = tiles.map((row) => [...row]);
    let offsetX = 0;
    let offsetY = 0;

    if (edge === "top") {
      if (delta > 0) {
        // Add rows at top
        for (let i = 0; i < delta; i++) {
          const row = Array.from({ length: w }, () => createTile());
          newTiles.unshift(row);
        }
        h += delta;
        offsetY = delta;
      } else {
        const remove = Math.min(-delta, h - 5);
        if (remove > 0) {
          newTiles = newTiles.slice(remove);
          h -= remove;
          offsetY = -remove;
        }
      }
    } else if (edge === "bottom") {
      if (delta > 0) {
        for (let i = 0; i < delta; i++) {
          newTiles.push(Array.from({ length: w }, () => createTile()));
        }
        h += delta;
      } else {
        const remove = Math.min(-delta, h - 5);
        if (remove > 0) {
          newTiles = newTiles.slice(0, h - remove);
          h -= remove;
        }
      }
    } else if (edge === "left") {
      if (delta > 0) {
        newTiles = newTiles.map((row) => [
          ...Array.from({ length: delta }, () => createTile()),
          ...row,
        ]);
        w += delta;
        offsetX = delta;
      } else {
        const remove = Math.min(-delta, w - 5);
        if (remove > 0) {
          newTiles = newTiles.map((row) => row.slice(remove));
          w -= remove;
          offsetX = -remove;
        }
      }
    } else if (edge === "right") {
      if (delta > 0) {
        newTiles = newTiles.map((row) => [
          ...row,
          ...Array.from({ length: delta }, () => createTile()),
        ]);
        w += delta;
      } else {
        const remove = Math.min(-delta, w - 5);
        if (remove > 0) {
          newTiles = newTiles.map((row) => row.slice(0, row.length - remove));
          w -= remove;
        }
      }
    }

    // Clamp dimensions
    w = Math.max(5, Math.min(50, w));
    h = Math.max(5, Math.min(50, h));

    // Shift units and remove those out of bounds
    const newUnits: Record<number, UnitState> = {};
    for (const unit of Object.values(units)) {
      const nx = unit.x + offsetX;
      const ny = unit.y + offsetY;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        newUnits[unit.id] = { ...unit, x: nx, y: ny };
      }
    }

    set({
      draft: {
        ...draft,
        map_width: w,
        map_height: h,
        tiles: newTiles,
        units: newUnits,
      },
      dirty: true,
      redoStack: [],
    });
  },

  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),

  setMapName: (name) => set({ mapName: name }),
  setMapDescription: (desc) => set({ mapDescription: desc }),

  clearEditor: () => {
    set({
      draft: null,
      mapName: "",
      mapDescription: "",
      currentMapId: null,
      dirty: false,
      brush: { ...DEFAULT_BRUSH },
      undoStack: [],
      redoStack: [],
      isGesturing: false,
      gestureStartState: null,
    });
  },
}));
