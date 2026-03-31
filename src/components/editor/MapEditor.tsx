"use client";

/**
 * **Map editor** view: Pixi preview, brush palette, undo/redo, AI mapgen chat, import/export AWBW CSV.
 * State lives in {@link ../../store/editorStore}.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  initPixiApp,
  destroyPixiApp,
  getApp,
  TILE_SIZE,
  TILE_SCALE,
  fitMapToStage,
  resetPanZoom,
} from "../../rendering/pixiApp";
import { TerrainRenderer } from "../../rendering/terrainRenderer";
import { UnitRenderer } from "../../rendering/unitRenderer";
import { useEditorStore } from "../../store/editorStore";
import { loadGameData } from "../../game/dataLoader";
import { duplicateState } from "../../game/gameState";
import { computeStatsFromGameState } from "../../game/mapStats";
import type { MapStats } from "../../game/mapStats";
import { parseAwbwMapText, importAwbwMap } from "../../game/awbwImport";
import { exportToAwbwCsv } from "../../game/awbwExport";
import { loadSavedMaps, upsertSavedMap, deleteSavedMap, type SavedMap } from "../../game/savedMaps";
import {
  getMapGenProvider,
  sendMapGenMessage,
  parseMapResponse,
  MAP_GEN_SYSTEM_PROMPT,
} from "../../ai/mapGenerator";
import type { ChatMessage } from "../../ai/llmProviders";
import MapEditorPalette from "./MapEditorPalette";
import { Graphics } from "pixi.js";

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px

// ── Display names for building/terrain stats ────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  hq: "HQ",
  md_tank: "Md Tank",
  anti_air: "Anti-Air",
  t_copter: "T Copter",
  b_copter: "B Copter",
};

function displayName(id: string): string {
  if (DISPLAY_NAMES[id]) return DISPLAY_NAMES[id];
  return id.charAt(0).toUpperCase() + id.slice(1);
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
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return points;
}

// ── Reusable modal backdrop ─────────────────────────────────────────────────

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

// ── Stats panel ─────────────────────────────────────────────────────────────

const PLAYER_HEX = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

function EditorStatsPanel({ stats }: { stats: MapStats }) {
  const buildingTypes = Object.keys(stats.buildings);
  return (
    <div className="text-xs space-y-1">
      <div className="flex gap-3 text-gray-500 font-medium">
        <span>
          {stats.width} &times; {stats.height}
        </span>
        <span>{stats.playerCount} players</span>
      </div>
      {buildingTypes.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium pr-1 py-0.5">Building</th>
              <th className="font-medium px-1 py-0.5">Neutral</th>
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
                <tr key={type} className="text-gray-500">
                  <td className="pr-1 py-0.5">{displayName(type)}</td>
                  <td className="px-1 py-0.5 font-mono">{b.neutral || "—"}</td>
                  {Array.from({ length: stats.playerCount }).map((_, i) => (
                    <td key={i} className="px-1 py-0.5 font-mono">
                      {b.players[i] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {Object.keys(stats.terrain).length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-gray-400">
          {Object.entries(stats.terrain)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([type, count]) => (
              <span key={type}>
                {displayName(type)}: <span className="font-mono text-gray-600">{count}</span>
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
  onPlay?: (state: import("../../game/types").GameState) => void;
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
  const dirty = useEditorStore((s) => s.dirty);
  const currentMapId = useEditorStore((s) => s.currentMapId);

  const {
    newMap,
    loadDraft,
    paintTile,
    eraseTile,
    fillMap,
    beginGesture,
    endGesture,
    undo,
    redo,
    resizeMap,
    setMapName,
    setMapDescription,
    setBrush,
    clearEditor,
    markClean,
  } = useEditorStore.getState();

  const [dataLoaded, setDataLoaded] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const [fillTerrain, setFillTerrain] = useState("plains");
  const [newWidth, setNewWidth] = useState(20);
  const [newHeight, setNewHeight] = useState(15);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [exportText, setExportText] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [savedMapsList, setSavedMapsList] = useState<SavedMap[]>([]);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [genInput, setGenInput] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  // Chat history for conversational map generation
  interface GenMessage {
    role: "user" | "assistant";
    text: string;
    csv?: string;
    mapSize?: string;
  }
  const [genMessages, setGenMessages] = useState<GenMessage[]>([]);
  const [genConversation, setGenConversation] = useState<ChatMessage[]>([]);
  const genScrollRef = useRef<HTMLDivElement>(null);

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

      if (tile) {
        setHoveredTile(tile);
        const hl = highlightRef.current;
        if (hl) {
          hl.clear();
          const currentDraft = useEditorStore.getState().draft;
          if (
            currentDraft &&
            tile.x >= 0 &&
            tile.x < currentDraft.map_width &&
            tile.y >= 0 &&
            tile.y < currentDraft.map_height
          ) {
            hl.rect(tile.x * DISPLAY, tile.y * DISPLAY, DISPLAY, DISPLAY);
            hl.fill({ color: 0xffffff, alpha: 0.2 });
            hl.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
          }
        }
      }

      if (!paintingRef.current || !tile) return;

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
      } else if (e.key === "e" || e.key === "E") {
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

    import("../../rendering/pixiApp").then(({ enablePanZoom, disablePanZoom }) => {
      enablePanZoom(canvas);
      return () => disablePanZoom();
    });
  }, [dataLoaded]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleNewConfirm = () => {
    const { dirty: isDirty } = useEditorStore.getState();
    if (isDirty && !window.confirm("You have unsaved changes. Create a new map anyway?")) return;
    newMap(newWidth, newHeight);
    setShowNewDialog(false);
    setTimeout(() => resetPanZoom(), 50);
  };

  const handleSave = useCallback(() => {
    const {
      draft: currentDraft,
      mapName: currentName,
      mapDescription: desc,
      currentMapId: mapId,
    } = useEditorStore.getState();
    if (!currentDraft) return;
    if (!currentName.trim()) {
      setSaveError("Enter a map name to save.");
      return;
    }
    setSaveError("");

    const csv = exportToAwbwCsv(currentDraft);
    const id = mapId ?? `map_${Date.now()}`;
    const saved: SavedMap = {
      id,
      name: currentName.trim(),
      description: desc.trim() || undefined,
      csv,
      width: currentDraft.map_width,
      height: currentDraft.map_height,
      savedAt: Date.now(),
    };

    upsertSavedMap(saved);

    if (!mapId) {
      useEditorStore.setState({ currentMapId: id });
    }
    markClean();

    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1500);
  }, [markClean]);

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
    setCopyFeedback(false);
    setShowExportDialog(true);
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      setCopyFeedback(false);
    }
  };

  const handleFill = () => {
    setFillTerrain(brush.category === "terrain" ? brush.terrainType : "plains");
    setShowFillConfirm(true);
  };

  const handleFillConfirm = () => {
    // Set the brush to the selected fill terrain, then fill
    setBrush({ category: "terrain", terrainType: fillTerrain });
    // Need a microtask so the store updates before fillMap reads it
    setTimeout(() => {
      fillMap();
      setShowFillConfirm(false);
    }, 0);
  };

  const handlePlay = () => {
    const currentDraft = useEditorStore.getState().draft;
    if (!currentDraft || !onPlay) return;
    onPlay(duplicateState(currentDraft));
  };

  const handleLoad = (map: SavedMap) => {
    setLoadError("");
    try {
      const mapData = parseAwbwMapText(map.csv);
      const state = importAwbwMap(mapData);
      loadDraft(state, map.name, map.description, map.id);
      setShowLoadDialog(false);
      setTimeout(() => resetPanZoom(), 50);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load map.");
    }
  };

  const handleDeleteSavedMap = (id: string) => {
    const updated = deleteSavedMap(id);
    setSavedMapsList(updated);
  };

  const handleGenSend = async () => {
    const providerInfo = getMapGenProvider();
    if (!providerInfo) {
      setGenError("No AI provider configured. Set up an API key in Settings.");
      return;
    }
    const userText = genInput.trim();
    if (!userText) return;

    // Add user message to UI
    setGenMessages((prev) => [...prev, { role: "user", text: userText }]);
    setGenInput("");
    setGenLoading(true);
    setGenError("");

    // Build conversation for the API
    const isFirstMessage = genConversation.length === 0;
    const newConvo: ChatMessage[] = [
      ...genConversation,
      { role: "user" as const, content: userText },
    ];

    // Prepend system prompt
    const apiMessages: ChatMessage[] = [
      { role: "system", content: MAP_GEN_SYSTEM_PROMPT },
      ...(isFirstMessage ? [] : genConversation),
      { role: "user", content: userText },
    ];

    try {
      const raw = await sendMapGenMessage(apiMessages, providerInfo.provider, providerInfo.model);
      const result = parseMapResponse(raw);

      // Update conversation history
      const updatedConvo: ChatMessage[] = [
        ...newConvo,
        { role: "assistant" as const, content: raw },
      ];
      setGenConversation(updatedConvo);

      if (result.error && result.preview.width === 0) {
        // Complete failure
        setGenMessages((prev) => [...prev, { role: "assistant", text: result.error! }]);
      } else {
        // Got a map (possibly with warnings)
        const sizeLabel = `${result.preview.width}×${result.preview.height}`;
        const msg = result.error
          ? `Generated ${sizeLabel} map (with warning: ${result.error}). Loaded into editor.`
          : `Generated ${sizeLabel} map. Loaded into editor.`;
        setGenMessages((prev) => [
          ...prev,
          { role: "assistant", text: msg, csv: result.csv, mapSize: sizeLabel },
        ]);

        // Load into editor
        const mapData = parseAwbwMapText(result.csv);
        const state = importAwbwMap(mapData);
        loadDraft(state);
        setTimeout(() => resetPanZoom(), 50);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Generation failed.";
      setGenMessages((prev) => [...prev, { role: "assistant", text: `Error: ${errMsg}` }]);
      setGenError(errMsg);
    } finally {
      setGenLoading(false);
      setTimeout(
        () =>
          genScrollRef.current?.scrollTo({
            top: genScrollRef.current.scrollHeight,
            behavior: "smooth",
          }),
        50
      );
    }
  };

  const handleBack = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave the editor?")) return;
    onClose();
  };

  // Cursor style based on active tool
  const cursorClass = brush.category === "eraser" ? "cursor-crosshair" : "cursor-cell";

  // ── Render ──────────────────────────────────────────────────────────────

  if (!dataLoaded) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#f0ece0" }}
      >
        <div className="text-gray-500 text-lg">Loading game data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f0ece0" }}>
      {/* Toolbar — matches app header style */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={handleBack}
          className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Back
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={() => setShowNewDialog(true)}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
        >
          New
        </button>
        <button
          onClick={handleSave}
          className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors ${
            saveFeedback
              ? "bg-green-50 border-green-300 text-green-600"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200"
          }`}
        >
          {saveFeedback ? "Saved!" : "Save"}
        </button>
        <button
          onClick={() => {
            setSavedMapsList(loadSavedMaps());
            setLoadError("");
            setShowLoadDialog(true);
          }}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
        >
          Load
        </button>
        <button
          onClick={() => setShowImportDialog(true)}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
        >
          Export
        </button>
        <button
          onClick={() => {
            setGenError("");
            setShowGenerateDialog(!showGenerateDialog);
          }}
          className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors ${
            showGenerateDialog
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"
          }`}
        >
          AI Generate
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={handleFill}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
        >
          Fill
        </button>
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 rounded-lg border border-gray-200 transition-colors"
          title={undoStack.length > 0 ? `Undo (${undoStack.length})` : "Nothing to undo"}
        >
          Undo{undoStack.length > 0 && ` (${undoStack.length})`}
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="px-3 py-1.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 rounded-lg border border-gray-200 transition-colors"
          title={redoStack.length > 0 ? `Redo (${redoStack.length})` : "Nothing to redo"}
        >
          Redo{redoStack.length > 0 && ` (${redoStack.length})`}
        </button>

        <div className="flex-1" />

        {/* Dirty indicator */}
        {dirty && <span className="text-amber-500 text-sm font-semibold">Unsaved</span>}

        {saveError && <span className="text-red-500 text-sm">{saveError}</span>}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {onPlay && (
          <button
            onClick={handlePlay}
            className="px-5 py-1.5 text-sm font-black bg-red-500 hover:bg-red-400 text-white rounded-xl transition-colors uppercase tracking-wide"
          >
            Play
          </button>
        )}
      </div>

      {/* Main area: sidebar + canvas + right panel */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: palette */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <MapEditorPalette />
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
          />

          {/* Hovered tile coords (1-based) */}
          {hoveredTile &&
            draft &&
            hoveredTile.x >= 0 &&
            hoveredTile.x < draft.map_width &&
            hoveredTile.y >= 0 &&
            hoveredTile.y < draft.map_height && (
              <div className="absolute bottom-2 left-2 bg-white/80 text-gray-700 text-sm px-2 py-1 rounded-lg font-mono shadow-sm border border-gray-200">
                Col {hoveredTile.x + 1}, Row {hoveredTile.y + 1}
              </div>
            )}
        </div>

        {/* Right panel: AI chat OR map properties */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0">
          {showGenerateDialog ? (
            /* ── AI Chat Panel ──────────────────────────────────────── */
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
                <span className="text-sm font-bold text-gray-900">AI Map Generator</span>
                <div className="flex items-center gap-2">
                  {genMessages.length > 0 && (
                    <button
                      onClick={() => {
                        setGenMessages([]);
                        setGenConversation([]);
                        setGenInput("");
                        setGenError("");
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
                    >
                      New chat
                    </button>
                  )}
                  <button
                    onClick={() => setShowGenerateDialog(false)}
                    className="text-gray-400 hover:text-gray-700 text-sm leading-none transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {!getMapGenProvider() ? (
                <div className="p-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <p className="font-semibold mb-1">No AI provider configured</p>
                    <p className="text-amber-600 text-xs">
                      Add an API key for Anthropic, OpenAI, or Gemini in Settings, or enable a local
                      AI server.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat messages */}
                  <div
                    ref={genScrollRef}
                    className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0"
                  >
                    {genMessages.length === 0 && (
                      <div className="text-center text-gray-400 text-xs py-6">
                        <p className="mb-1.5 font-medium text-gray-500 text-sm">
                          Describe the map you want
                        </p>
                        <p className="leading-relaxed max-w-[200px] mx-auto">
                          e.g. &quot;A 20x15 island map with 2 players&quot; then refine with
                          follow-ups
                        </p>
                      </div>
                    )}
                    {genMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "bg-amber-500 text-white rounded-br-sm"
                              : "bg-gray-100 text-gray-800 rounded-bl-sm"
                          }`}
                        >
                          {msg.text}
                          {msg.mapSize && (
                            <span className="block text-xs mt-1 opacity-70">
                              {msg.mapSize} tiles
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {genLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-xl rounded-bl-sm text-sm">
                          Generating...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="px-4 py-2.5 border-t border-gray-200 shrink-0">
                    {genError && <p className="text-red-500 text-xs mb-1.5">{genError}</p>}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={genInput}
                        onChange={(e) => setGenInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && !genLoading) {
                            e.preventDefault();
                            handleGenSend();
                          }
                        }}
                        placeholder={
                          genMessages.length === 0 ? "Describe your map..." : "Give feedback..."
                        }
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-amber-500"
                        disabled={genLoading}
                        autoFocus
                      />
                      <button
                        onClick={handleGenSend}
                        disabled={genLoading || !genInput.trim()}
                        className="px-3 py-1.5 text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-colors shrink-0"
                      >
                        {genLoading ? "..." : "Send"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── Map Properties Panel ──────────────────────────────── */
            <div className="overflow-y-auto">
              {draft && (
                <div className="p-4 space-y-3">
                  {/* Map name */}
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">
                      Map Name <span className="text-red-400">*</span>
                    </div>
                    <input
                      type="text"
                      value={mapName}
                      onChange={(e) => {
                        setMapName(e.target.value);
                        setSaveError("");
                      }}
                      placeholder="My Map"
                      className={`w-full bg-white border rounded-lg px-3 py-2 text-base text-gray-900 focus:outline-none focus:border-amber-500 ${
                        saveError ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                  </div>

                  {/* Map description */}
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">
                      Description
                    </div>
                    <input
                      type="text"
                      value={mapDescription}
                      onChange={(e) => setMapDescription(e.target.value)}
                      placeholder="Optional..."
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="border-t border-gray-100" />

                  {/* Map dimensions + resize */}
                  <div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                        Size
                      </span>
                      <span className="text-base text-gray-800 font-mono font-bold">
                        {draft.map_width} &times; {draft.map_height}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 w-6 text-right">Top</span>
                        <button
                          onClick={() => resizeMap("top", 1)}
                          className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => resizeMap("top", -1)}
                          className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                        >
                          &minus;
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 w-6 text-right">Left</span>
                          <button
                            onClick={() => resizeMap("left", 1)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                          >
                            +
                          </button>
                          <button
                            onClick={() => resizeMap("left", -1)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                          >
                            &minus;
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => resizeMap("right", 1)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                          >
                            +
                          </button>
                          <button
                            onClick={() => resizeMap("right", -1)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                          >
                            &minus;
                          </button>
                          <span className="text-xs text-gray-400 w-6">Right</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 w-6 text-right">Btm</span>
                        <button
                          onClick={() => resizeMap("bottom", 1)}
                          className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => resizeMap("bottom", -1)}
                          className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
                        >
                          &minus;
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100" />

                  {/* Stats */}
                  {stats && (
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">
                        Stats
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <EditorStatsPanel stats={stats} />
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-100" />

                  {/* Keyboard shortcuts — collapsed by default */}
                  <details className="group">
                    <summary className="text-xs text-gray-400 uppercase tracking-wide font-semibold cursor-pointer select-none flex items-center gap-1">
                      Shortcuts
                      <span className="text-gray-300 group-open:rotate-90 transition-transform text-[10px]">
                        &#9654;
                      </span>
                    </summary>
                    <div className="mt-1.5 text-sm text-gray-400 space-y-0.5">
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          T
                        </kbd>{" "}
                        Terrain
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          B
                        </kbd>{" "}
                        Buildings
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          U
                        </kbd>{" "}
                        Units
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          E
                        </kbd>{" "}
                        Eraser
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          1-4
                        </kbd>{" "}
                        Player
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Ctrl+Z
                        </kbd>{" "}
                        Undo
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Ctrl+Y
                        </kbd>{" "}
                        Redo
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Ctrl+S
                        </kbd>{" "}
                        Save
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Right-click
                        </kbd>{" "}
                        Erase
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Ctrl+Drag
                        </kbd>{" "}
                        Pan
                      </div>
                      <div>
                        <kbd className="bg-gray-100 text-gray-600 font-semibold px-1 py-0.5 rounded text-xs">
                          Scroll
                        </kbd>{" "}
                        Zoom
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      {/* New Map Dialog */}
      {showNewDialog && (
        <ModalBackdrop onClose={() => setShowNewDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-80 space-y-4">
            <div className="text-gray-900 font-bold text-lg">New Map</div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm text-gray-500 block mb-1">Width (5–50)</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={newWidth}
                  onChange={(e) =>
                    setNewWidth(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))
                  }
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-gray-500 block mb-1">Height (5–50)</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={newHeight}
                  onChange={(e) =>
                    setNewHeight(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))
                  }
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewConfirm}
                className="px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Fill Confirmation */}
      {showFillConfirm && (
        <ModalBackdrop onClose={() => setShowFillConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-96 space-y-4">
            <div className="text-gray-900 font-bold text-lg">Fill Entire Map</div>
            <p className="text-gray-500 text-sm">
              Choose a terrain type to fill the entire map. All existing tiles and units will be
              replaced. This can be undone.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "plains", label: "Plains" },
                { id: "forest", label: "Forest" },
                { id: "mountain", label: "Mountain" },
                { id: "road", label: "Road" },
                { id: "river", label: "River" },
                { id: "sea", label: "Sea" },
                { id: "shoal", label: "Shoal" },
                { id: "reef", label: "Reef" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFillTerrain(t.id)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    fillTerrain === t.id
                      ? "bg-amber-50 ring-2 ring-amber-500 text-amber-700"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFillConfirm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFillConfirm}
                className="px-5 py-2 text-sm font-bold bg-red-500 hover:bg-red-400 text-white rounded-xl transition-colors"
              >
                Fill with {fillTerrain.charAt(0).toUpperCase() + fillTerrain.slice(1)}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <ModalBackdrop
          onClose={() => {
            setShowImportDialog(false);
            setImportText("");
            setImportError("");
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-96 space-y-4">
            <div className="text-gray-900 font-bold text-lg">Import AWBW Map</div>
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError("");
              }}
              placeholder="Paste AWBW CSV (comma-separated tile IDs, one row per line)"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono h-32 resize-y focus:outline-none focus:border-amber-500"
            />
            {importError && <p className="text-red-500 text-sm">{importError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportText("");
                  setImportError("");
                }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <ModalBackdrop onClose={() => setShowExportDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-96 space-y-4">
            <div className="text-gray-900 font-bold text-lg">Export AWBW CSV</div>
            <textarea
              readOnly
              value={exportText}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono h-32 resize-y focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExportDialog(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 font-semibold transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleCopyExport}
                className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${
                  copyFeedback
                    ? "bg-green-50 border border-green-300 text-green-600"
                    : "bg-amber-500 hover:bg-amber-400 text-white"
                }`}
              >
                {copyFeedback ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <ModalBackdrop onClose={() => setShowLoadDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-96 space-y-4 max-h-[80vh] flex flex-col">
            <div className="text-gray-900 font-bold text-lg">Load Saved Map</div>
            {loadError && <p className="text-red-500 text-sm">{loadError}</p>}
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {savedMapsList.length === 0 ? (
                <div className="text-gray-400 text-sm text-center py-4">No saved maps.</div>
              ) : (
                savedMapsList.map((map) => (
                  <div key={map.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleLoad(map)}
                      className="flex-1 text-left px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors min-w-0"
                    >
                      <div className="text-sm text-gray-900 font-medium truncate">{map.name}</div>
                      <div className="text-xs text-gray-500">
                        {map.width}x{map.height} · {new Date(map.savedAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteSavedMap(map.id)}
                      className="shrink-0 px-2 py-1 text-gray-300 hover:text-red-500 text-sm rounded transition-colors"
                      title="Delete saved map"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Generate Dialog removed — AI chat is now in the right sidebar */}
    </div>
  );
}
