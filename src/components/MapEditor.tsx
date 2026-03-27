"use client";

// Main map editor component. Pixi.js canvas + toolbar + palette.
// Renders a draft GameState and lets the user paint tiles/buildings/units.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  initPixiApp,
  destroyPixiApp,
  getApp,
  TILE_SIZE,
  TILE_SCALE,
  fitMapToStage,
  resetPanZoom,
} from "../rendering/pixi-app";
import { TerrainRenderer } from "../rendering/terrain-renderer";
import { UnitRenderer } from "../rendering/unit-renderer";
import { useEditorStore } from "../store/editor-store";
import { useGameStore } from "../store/game-store";
import { loadGameData } from "../game/data-loader";
import { duplicateState } from "../game/game-state";
import { computeStatsFromGameState } from "../game/map-stats";
import type { MapStats } from "../game/map-stats";
import { parseAwbwMapText, importAwbwMap } from "../game/awbw-import";
import { exportToAwbwCsv } from "../game/awbw-export";
import MapEditorPalette from "./MapEditorPalette";
import { Graphics } from "pixi.js";

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px

// ── Saved maps helpers (reuse MatchSetup format) ────────────────────────────

interface SavedMap {
  id: string;
  name: string;
  description?: string;
  csv: string;
  width: number;
  height: number;
  savedAt: number;
}

const SAVED_MAPS_KEY = "modern-aw-saved-maps";

function loadSavedMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(SAVED_MAPS_KEY);
    return raw ? (JSON.parse(raw) as SavedMap[]) : [];
  } catch {
    return [];
  }
}

function persistSavedMaps(maps: SavedMap[]) {
  localStorage.setItem(SAVED_MAPS_KEY, JSON.stringify(maps));
}

// ── Bresenham line interpolation ────────────────────────────────────────────

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;

  while (true) {
    points.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

// ── Stats panel ─────────────────────────────────────────────────────────────

const PLAYER_HEX = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

function EditorStatsPanel({ stats }: { stats: MapStats }) {
  const buildingTypes = Object.keys(stats.buildings);
  return (
    <div className="text-xs space-y-1">
      <div className="flex gap-3 text-gray-500">
        <span>{stats.width}x{stats.height}</span>
        <span>{stats.playerCount}P</span>
      </div>
      {buildingTypes.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="font-medium pr-1 py-0.5">Bldg</th>
              <th className="font-medium px-1 py-0.5">N</th>
              {Array.from({ length: stats.playerCount }).map((_, i) => (
                <th key={i} className="font-medium px-1 py-0.5" style={{ color: PLAYER_HEX[i] }}>
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buildingTypes.map((type) => {
              const b = stats.buildings[type];
              return (
                <tr key={type} className="text-gray-600">
                  <td className="pr-1 py-0.5 capitalize">{type}</td>
                  <td className="px-1 py-0.5 font-mono">{b.neutral || "—"}</td>
                  {Array.from({ length: stats.playerCount }).map((_, i) => (
                    <td key={i} className="px-1 py-0.5 font-mono">{b.players[i] || "—"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {Object.keys(stats.terrain).length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-gray-500">
          {Object.entries(stats.terrain)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([type, count]) => (
              <span key={type} className="capitalize">
                {type}: <span className="font-mono text-gray-400">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface MapEditorProps {
  onClose: () => void;
  onPlay?: (state: import("../game/types").GameState) => void;
}

export default function MapEditor({ onClose, onPlay }: MapEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terrainRendererRef = useRef<TerrainRenderer | null>(null);
  const unitRendererRef = useRef<UnitRenderer | null>(null);
  const highlightRef = useRef<Graphics | null>(null);
  const initedRef = useRef(false);

  const draft = useEditorStore((s) => s.draft);
  const mapName = useEditorStore((s) => s.mapName);
  const mapDescription = useEditorStore((s) => s.mapDescription);
  const brush = useEditorStore((s) => s.brush);
  const undoStack = useEditorStore((s) => s.undoStack);
  const redoStack = useEditorStore((s) => s.redoStack);

  const {
    newMap, loadDraft, paintTile, eraseTile, fillMap,
    beginGesture, endGesture, undo, redo,
    resizeMap, setMapName, setMapDescription, setBrush, clearEditor,
  } = useEditorStore.getState();

  const [dataLoaded, setDataLoaded] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [newWidth, setNewWidth] = useState(20);
  const [newHeight, setNewHeight] = useState(15);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [exportText, setExportText] = useState("");
  const [saveError, setSaveError] = useState("");
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  // Track painting state for drag
  const paintingRef = useRef(false);
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  const rightButtonRef = useRef(false);

  // Stats
  const [stats, setStats] = useState<MapStats | null>(null);

  // Compute stats when draft changes
  useEffect(() => {
    if (draft) {
      setStats(computeStatsFromGameState(draft));
    }
  }, [draft]);

  // Load game data
  useEffect(() => {
    loadGameData().then(() => setDataLoaded(true));
  }, []);

  // Create default map if none exists
  useEffect(() => {
    if (dataLoaded && !draft) {
      newMap(20, 15);
    }
  }, [dataLoaded, draft]);

  // Initialize Pixi
  useEffect(() => {
    if (!dataLoaded || !canvasRef.current || initedRef.current) return;
    initedRef.current = true;

    const canvas = canvasRef.current;

    initPixiApp(canvas).then((pixiApp) => {
      const tr = new TerrainRenderer();
      const ur = new UnitRenderer();
      terrainRendererRef.current = tr;
      unitRendererRef.current = ur;

      pixiApp.stage.addChild(tr.getContainer());
      pixiApp.stage.addChild(ur.getContainer());
      pixiApp.stage.addChild(tr.getCaptureOverlay());

      // Hover highlight
      const hl = new Graphics();
      hl.label = "editor-highlight";
      pixiApp.stage.addChild(hl);
      highlightRef.current = hl;

      // Initial render
      const currentDraft = useEditorStore.getState().draft;
      if (currentDraft) {
        tr.render(currentDraft);
        ur.render(currentDraft);
        resetPanZoom();
      }
    });

    return () => {
      initedRef.current = false;
      destroyPixiApp();
      terrainRendererRef.current = null;
      unitRendererRef.current = null;
      highlightRef.current = null;
    };
  }, [dataLoaded]);

  // Re-render when draft changes
  useEffect(() => {
    if (!draft || !terrainRendererRef.current || !unitRendererRef.current) return;
    terrainRendererRef.current.render(draft);
    unitRendererRef.current.render(draft);
  }, [draft]);

  // ── Canvas event handlers ───────────────────────────────────────────────

  const canvasToTile = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const pixiApp = getApp();
      if (!pixiApp || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      // Account for stage transform (pan/zoom)
      const stageX = pixiApp.stage.x;
      const stageY = pixiApp.stage.y;
      const stageScale = pixiApp.stage.scale.x;

      const worldX = (mouseX - stageX) / stageScale;
      const worldY = (mouseY - stageY) / stageScale;

      const tileX = Math.floor(worldX / DISPLAY);
      const tileY = Math.floor(worldY / DISPLAY);

      return { x: tileX, y: tileY };
    },
    []
  );

  const doPaint = useCallback(
    (x: number, y: number) => {
      const currentDraft = useEditorStore.getState().draft;
      if (!currentDraft) return;
      if (x < 0 || x >= currentDraft.map_width || y < 0 || y >= currentDraft.map_height) return;

      const currentBrush = useEditorStore.getState().brush;
      if (currentBrush.category === "eraser") {
        eraseTile(x, y);
      } else {
        paintTile(x, y);
      }
    },
    [paintTile, eraseTile]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only paint with left button (not when ctrl/meta held — that's pan)
      if (e.button === 2) {
        rightButtonRef.current = true;
        e.preventDefault();
        const tile = canvasToTile(e.clientX, e.clientY);
        if (tile) {
          beginGesture();
          eraseTile(tile.x, tile.y);
          paintingRef.current = true;
          lastPaintRef.current = tile;
        }
        return;
      }
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;

      const tile = canvasToTile(e.clientX, e.clientY);
      if (!tile) return;

      beginGesture();
      doPaint(tile.x, tile.y);
      paintingRef.current = true;
      lastPaintRef.current = tile;
    },
    [canvasToTile, doPaint, beginGesture, eraseTile]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const tile = canvasToTile(e.clientX, e.clientY);

      // Update hover highlight
      if (tile) {
        setHoveredTile(tile);
        const hl = highlightRef.current;
        if (hl) {
          hl.clear();
          const currentDraft = useEditorStore.getState().draft;
          if (currentDraft && tile.x >= 0 && tile.x < currentDraft.map_width &&
              tile.y >= 0 && tile.y < currentDraft.map_height) {
            hl.rect(tile.x * DISPLAY, tile.y * DISPLAY, DISPLAY, DISPLAY);
            hl.fill({ color: 0xffffff, alpha: 0.2 });
            hl.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
          }
        }
      }

      if (!paintingRef.current || !tile) return;

      // Bresenham interpolation for fast drags
      const last = lastPaintRef.current;
      if (last && (last.x !== tile.x || last.y !== tile.y)) {
        const points = bresenhamLine(last.x, last.y, tile.x, tile.y);
        for (const [px, py] of points) {
          if (rightButtonRef.current) {
            eraseTile(px, py);
          } else {
            doPaint(px, py);
          }
        }
      }
      lastPaintRef.current = tile;
    },
    [canvasToTile, doPaint, eraseTile]
  );

  const handleMouseUp = useCallback(() => {
    if (paintingRef.current) {
      paintingRef.current = false;
      lastPaintRef.current = null;
      rightButtonRef.current = false;
      endGesture();
    }
  }, [endGesture]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "t" || e.key === "T") {
        setBrush({ category: "terrain" });
      } else if (e.key === "b" || e.key === "B") {
        setBrush({ category: "building" });
      } else if (e.key === "u" || e.key === "U") {
        setBrush({ category: "unit" });
      } else if (e.key === "d" || e.key === "D") {
        const current = useEditorStore.getState().brush;
        setBrush({ category: current.category === "eraser" ? "terrain" : "eraser" });
      } else if (e.key >= "1" && e.key <= "4") {
        setBrush({ playerId: parseInt(e.key) - 1 });
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo, setBrush]);

  // ── Wire pan/zoom for editor canvas ─────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataLoaded) return;

    // Import dynamically to avoid circular issues
    import("../rendering/pixi-app").then(({ enablePanZoom, disablePanZoom }) => {
      enablePanZoom(canvas);
      return () => disablePanZoom();
    });
  }, [dataLoaded]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleNew = () => {
    newMap(newWidth, newHeight);
    setShowNewDialog(false);
    // Reset pan after creating new map
    setTimeout(() => resetPanZoom(), 50);
  };

  const handleSave = () => {
    const currentDraft = useEditorStore.getState().draft;
    const currentName = useEditorStore.getState().mapName;
    if (!currentDraft) return;
    if (!currentName.trim()) {
      setSaveError("Enter a map name first.");
      return;
    }
    setSaveError("");

    const csv = exportToAwbwCsv(currentDraft);
    const saved: SavedMap = {
      id: `map_${Date.now()}`,
      name: currentName.trim(),
      description: useEditorStore.getState().mapDescription.trim() || undefined,
      csv,
      width: currentDraft.map_width,
      height: currentDraft.map_height,
      savedAt: Date.now(),
    };

    const existing = loadSavedMaps();
    persistSavedMaps([saved, ...existing]);
    setSaveError("");
  };

  const handleImport = () => {
    setImportError("");
    if (!importText.trim()) {
      setImportError("Paste AWBW CSV data.");
      return;
    }
    try {
      const mapData = parseAwbwMapText(importText);
      if (mapData.width === 0) {
        setImportError("Could not parse map data.");
        return;
      }
      const state = importAwbwMap(mapData);
      loadDraft(state);
      setShowImportDialog(false);
      setImportText("");
      setTimeout(() => resetPanZoom(), 50);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const handleExport = () => {
    const currentDraft = useEditorStore.getState().draft;
    if (!currentDraft) return;
    setExportText(exportToAwbwCsv(currentDraft));
    setShowExportDialog(true);
  };

  const handlePlay = () => {
    const currentDraft = useEditorStore.getState().draft;
    if (!currentDraft || !onPlay) return;
    onPlay(duplicateState(currentDraft));
  };

  const handleLoad = (map: SavedMap) => {
    try {
      const mapData = parseAwbwMapText(map.csv);
      const state = importAwbwMap(mapData);
      loadDraft(state, map.name, map.description);
      setShowLoadDialog(false);
      setTimeout(() => resetPanZoom(), 50);
    } catch {
      // Silently fail for corrupted saved maps
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading game data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Toolbar */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm font-semibold transition-colors"
        >
          ← Back
        </button>
        <div className="w-px h-5 bg-gray-700 mx-1" />

        <button
          onClick={() => setShowNewDialog(true)}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          New
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => setShowLoadDialog(true)}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Load
        </button>
        <button
          onClick={() => setShowImportDialog(true)}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Export
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <button
          onClick={fillMap}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Fill
        </button>
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 rounded transition-colors"
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 rounded transition-colors"
        >
          Redo
        </button>

        <div className="flex-1" />

        {/* Map name */}
        <input
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Map name"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-40 focus:outline-none focus:border-amber-500"
        />

        {saveError && <span className="text-red-400 text-xs">{saveError}</span>}

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {onPlay && (
          <button
            onClick={handlePlay}
            className="px-4 py-1.5 text-xs font-black bg-red-600 hover:bg-red-500 text-white rounded transition-colors uppercase tracking-wide"
          >
            Play
          </button>
        )}
      </div>

      {/* Main area: sidebar + canvas + right panel */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: palette */}
        <div className="w-48 bg-gray-900 border-r border-gray-700 flex flex-col shrink-0">
          <MapEditorPalette />
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
          />

          {/* Hovered tile coords */}
          {hoveredTile && draft && hoveredTile.x >= 0 && hoveredTile.x < draft.map_width &&
            hoveredTile.y >= 0 && hoveredTile.y < draft.map_height && (
            <div className="absolute bottom-2 left-2 bg-black/60 text-gray-300 text-xs px-2 py-1 rounded font-mono">
              ({hoveredTile.x}, {hoveredTile.y})
            </div>
          )}
        </div>

        {/* Right panel: map properties + stats */}
        <div className="w-56 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0 overflow-y-auto">
          {draft && (
            <div className="p-3 space-y-3">
              {/* Map dimensions */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Size</div>
                <div className="text-sm text-gray-300 font-mono mb-2">
                  {draft.map_width} x {draft.map_height}
                </div>

                {/* Resize buttons */}
                <div className="grid grid-cols-2 gap-1">
                  {(["top", "bottom", "left", "right"] as const).map((edge) => (
                    <div key={edge} className="flex items-center gap-0.5">
                      <span className="text-[9px] text-gray-500 capitalize w-10">{edge}</span>
                      <button
                        onClick={() => resizeMap(edge, 1)}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
                      >
                        +
                      </button>
                      <button
                        onClick={() => resizeMap(edge, -1)}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
                      >
                        −
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Map description */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Description</div>
                <textarea
                  value={mapDescription}
                  onChange={(e) => setMapDescription(e.target.value)}
                  placeholder="Optional..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 h-12 resize-none focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Stats */}
              {stats && (
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Stats</div>
                  <EditorStatsPanel stats={stats} />
                </div>
              )}

              {/* Keyboard shortcuts reference */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Shortcuts</div>
                <div className="text-[10px] text-gray-600 space-y-0.5">
                  <div><kbd className="text-gray-400">T</kbd> Terrain</div>
                  <div><kbd className="text-gray-400">B</kbd> Buildings</div>
                  <div><kbd className="text-gray-400">U</kbd> Units</div>
                  <div><kbd className="text-gray-400">D</kbd> Eraser</div>
                  <div><kbd className="text-gray-400">1-4</kbd> Player</div>
                  <div><kbd className="text-gray-400">Ctrl+Z</kbd> Undo</div>
                  <div><kbd className="text-gray-400">Ctrl+Y</kbd> Redo</div>
                  <div><kbd className="text-gray-400">Ctrl+S</kbd> Save</div>
                  <div><kbd className="text-gray-400">Right-click</kbd> Erase</div>
                  <div><kbd className="text-gray-400">Ctrl+Drag</kbd> Pan</div>
                  <div><kbd className="text-gray-400">Scroll</kbd> Zoom</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      {/* New Map Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-80 space-y-4">
            <div className="text-white font-bold">New Map</div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Width</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={newWidth}
                  onChange={(e) => setNewWidth(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Height</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={newHeight}
                  onChange={(e) => setNewHeight(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNew}
                className="px-4 py-1.5 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 space-y-4">
            <div className="text-white font-bold">Import AWBW Map</div>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportError(""); }}
              placeholder="Paste AWBW CSV (comma-separated tile IDs, one row per line)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono h-32 resize-y focus:outline-none focus:border-amber-500"
            />
            {importError && <p className="text-red-400 text-xs">{importError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowImportDialog(false); setImportText(""); setImportError(""); }}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-1.5 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 space-y-4">
            <div className="text-white font-bold">Export AWBW CSV</div>
            <textarea
              readOnly
              value={exportText}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono h-32 resize-y focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExportDialog(false)}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(exportText); }}
                className="px-4 py-1.5 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 space-y-4 max-h-[80vh] flex flex-col">
            <div className="text-white font-bold">Load Saved Map</div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {loadSavedMaps().length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-4">No saved maps.</div>
              ) : (
                loadSavedMaps().map((map) => (
                  <button
                    key={map.id}
                    onClick={() => handleLoad(map)}
                    className="w-full text-left px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <div className="text-sm text-gray-200 font-medium">{map.name}</div>
                    <div className="text-xs text-gray-500">
                      {map.width}x{map.height} · {new Date(map.savedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
