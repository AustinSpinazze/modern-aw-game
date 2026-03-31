"use client";

// Tile/building/unit picker sidebar for the map editor.
// Shows actual sprite previews from the WarsWorld sprite sheets.

import { useState, useEffect, useRef, useCallback } from "react";
import { useEditorStore, type BrushCategory } from "../../store/editor-store";

// ── Data ─────────────────────────────────────────────────────────────────────

const TERRAIN_TYPES = [
  { id: "plains", label: "Plains" },
  { id: "forest", label: "Forest" },
  { id: "mountain", label: "Mountain" },
  { id: "road", label: "Road" },
  { id: "river", label: "River" },
  { id: "bridge", label: "Bridge" },
  { id: "sea", label: "Sea" },
  { id: "shoal", label: "Shoal" },
  { id: "reef", label: "Reef" },
];

const BUILDING_TYPES = [
  { id: "city", label: "City" },
  { id: "factory", label: "Factory" },
  { id: "airport", label: "Airport" },
  { id: "port", label: "Port" },
  { id: "hq", label: "HQ" },
];

const UNIT_TYPES = [
  { id: "infantry", label: "Infantry" },
  { id: "mech", label: "Mech" },
  { id: "recon", label: "Recon" },
  { id: "apc", label: "APC" },
  { id: "tank", label: "Tank" },
  { id: "md_tank", label: "Md Tank" },
  { id: "artillery", label: "Artillery" },
  { id: "rocket", label: "Rocket" },
  { id: "anti_air", label: "Anti-Air" },
  { id: "missile", label: "Missile" },
  { id: "t_copter", label: "T Copter" },
  { id: "b_copter", label: "B Copter" },
  { id: "fighter", label: "Fighter" },
  { id: "bomber", label: "Bomber" },
  { id: "stealth", label: "Stealth" },
  { id: "lander", label: "Lander" },
  { id: "cruiser", label: "Cruiser" },
  { id: "submarine", label: "Sub" },
  { id: "battleship", label: "B.ship" },
  { id: "carrier", label: "Carrier" },
];

// Faction names matching Advance Wars lore
const PLAYER_OPTIONS = [
  { id: -1, label: "Neutral", shortLabel: "Neutral", color: "bg-gray-400", sheet: "neutral" },
  { id: 0, label: "Orange Star", shortLabel: "OS", color: "bg-red-500", sheet: "orange-star" },
  { id: 1, label: "Blue Moon", shortLabel: "BM", color: "bg-blue-500", sheet: "blue-moon" },
  { id: 2, label: "Green Earth", shortLabel: "GE", color: "bg-green-500", sheet: "green-earth" },
  { id: 3, label: "Yellow Comet", shortLabel: "YC", color: "bg-yellow-500", sheet: "yellow-comet" },
];

const UNIT_PLAYER_OPTIONS = PLAYER_OPTIONS.filter((p) => p.id >= 0);

// ── Sprite frame name mappings ──────────────────────────────────────────────

// Terrain sprites (neutral sheet)
const TERRAIN_FRAME_NAMES: Record<string, string> = {
  plains: "plain.png",
  forest: "forest.png",
  mountain: "mountain.png",
  road: "road-top-bottom.png",
  river: "river-top-bottom.png",
  bridge: "bridge-top-bottom.png",
  sea: "sea.png",
  shoal: "shoal-top.png",
  reef: "reef.png",
};

// Building sprites (per-army sheet, frame 0)
const BUILDING_FRAME_NAMES: Record<string, string> = {
  city: "city-0.png",
  factory: "base-0.png",
  airport: "airport-0.png",
  port: "port-0.png",
  hq: "hq-0.png",
};

// Unit sprites (per-army sheet, frame 0)
const UNIT_FRAME_NAMES: Record<string, string> = {
  infantry: "infantry-0.png",
  mech: "mech-0.png",
  recon: "recon-0.png",
  apc: "apc-0.png",
  tank: "tank-0.png",
  md_tank: "mediumTank-0.png",
  artillery: "artillery-0.png",
  rocket: "rocket-0.png",
  anti_air: "antiAir-0.png",
  missile: "missile-0.png",
  t_copter: "transportCopter-0.png",
  b_copter: "battleCopter-0.png",
  fighter: "fighter-0.png",
  bomber: "bomber-0.png",
  stealth: "stealth-0.png",
  lander: "lander-0.png",
  cruiser: "cruiser-0.png",
  submarine: "sub-0.png",
  battleship: "battleship-0.png",
  carrier: "carrier-0.png",
};

// Fallback colors (used while sprites load)
const TERRAIN_COLORS: Record<string, string> = {
  plains: "bg-lime-400",
  forest: "bg-green-600",
  mountain: "bg-stone-400",
  road: "bg-gray-300",
  river: "bg-blue-400",
  bridge: "bg-gray-400",
  sea: "bg-blue-700",
  shoal: "bg-amber-300",
  reef: "bg-teal-600",
};

const BUILDING_COLORS: Record<string, string> = {
  city: "bg-purple-400",
  factory: "bg-purple-500",
  airport: "bg-purple-300",
  port: "bg-cyan-500",
  hq: "bg-amber-400",
};

const PLAYER_ICON_BG: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-yellow-500",
};

const UNIT_ICONS: Record<string, string> = {
  infantry: "Inf",
  mech: "Mch",
  recon: "Rcn",
  apc: "APC",
  tank: "Tnk",
  md_tank: "MdT",
  artillery: "Art",
  rocket: "Rkt",
  anti_air: "AA",
  missile: "Msl",
  t_copter: "TCp",
  b_copter: "BCp",
  fighter: "Ftr",
  bomber: "Bmr",
  stealth: "Sth",
  lander: "Lnd",
  cruiser: "Crs",
  submarine: "Sub",
  battleship: "BSh",
  carrier: "Car",
};

// ── Sprite frame data cache ─────────────────────────────────────────────────

interface FrameInfo {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}
type SheetFrames = Record<string, FrameInfo>;

const sheetCache: Record<string, SheetFrames> = {};
const imageCache: Record<string, HTMLImageElement> = {};

async function loadSheetFrames(sheet: string): Promise<SheetFrames> {
  if (sheetCache[sheet]) return sheetCache[sheet];
  try {
    const resp = await fetch(`/sprites/warsworld/${sheet}.json`);
    const data = (await resp.json()) as { frames: Record<string, FrameInfo> };
    sheetCache[sheet] = data.frames;
    // Preload the image too
    if (!imageCache[sheet]) {
      const img = new Image();
      img.src = `/sprites/warsworld/${sheet}.png`;
      imageCache[sheet] = img;
    }
    return data.frames;
  } catch {
    return {};
  }
}

// Extract a single sprite frame onto a canvas, handling rotation and trimming.
// TexturePacker convention: frame.w/h are LOGICAL (original) dimensions.
// When rotated=true, the atlas stores the sprite rotated 90° CW,
// so the atlas region is actually frame.h wide × frame.w tall.
function renderFrameToCanvas(
  img: HTMLImageElement,
  info: FrameInfo,
  displaySize: number
): HTMLCanvasElement {
  const { frame, rotated, sourceSize, spriteSourceSize } = info;
  const logW = sourceSize.w;
  const logH = sourceSize.h;

  // Create a canvas at the logical sprite size
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = logW;
  tempCanvas.height = logH;
  const ctx = tempCanvas.getContext("2d")!;

  if (rotated) {
    // Atlas region is frame.h wide × frame.w tall (dimensions swapped)
    const atlasW = frame.h;
    const atlasH = frame.w;

    // Rotate -90° (CCW) to undo the CW rotation
    ctx.save();
    ctx.translate(spriteSourceSize.x, spriteSourceSize.y + spriteSourceSize.h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, frame.x, frame.y, atlasW, atlasH, 0, 0, atlasW, atlasH);
    ctx.restore();
  } else {
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      spriteSourceSize.x,
      spriteSourceSize.y,
      frame.w,
      frame.h
    );
  }

  // Scale to display size
  const scale = Math.min(displaySize / logW, displaySize / logH);
  const outW = Math.round(logW * scale);
  const outH = Math.round(logH * scale);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = displaySize;
  outCanvas.height = displaySize;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.imageSmoothingEnabled = false;
  const offX = Math.round((displaySize - outW) / 2);
  const offY = Math.round((displaySize - outH) / 2);
  outCtx.drawImage(tempCanvas, 0, 0, logW, logH, offX, offY, outW, outH);

  return outCanvas;
}

// ── SpritePreview component ─────────────────────────────────────────────────

function SpritePreview({
  sheet,
  frameName,
  size = 32,
  fallbackColor,
  fallbackText,
}: {
  sheet: string;
  frameName: string;
  size?: number;
  fallbackColor?: string;
  fallbackText?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  const draw = useCallback(() => {
    const frames = sheetCache[sheet];
    const info = frames?.[frameName];
    const img = imageCache[sheet];
    const canvas = canvasRef.current;
    if (!info || !img || !canvas) return;

    if (!img.complete) {
      img.onload = () => draw();
      return;
    }

    const result = renderFrameToCanvas(img, info, size);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(result, 0, 0);
    setReady(true);
  }, [sheet, frameName, size]);

  useEffect(() => {
    draw();
  }, [draw]);

  const frames = sheetCache[sheet];
  const hasFrame = !!frames?.[frameName];

  if (!hasFrame) {
    return (
      <div
        className={`rounded-md flex items-center justify-center text-white text-[9px] font-bold ${fallbackColor ?? "bg-gray-300"}`}
        style={{ width: size, height: size }}
      >
        {fallbackText ?? ""}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        display: ready ? "block" : "none",
      }}
    />
  );
}

// ── Tab type ─────────────────────────────────────────────────────────────────

type PaletteTab = "terrain" | "building" | "unit";

const TAB_TO_CATEGORY: Record<PaletteTab, BrushCategory> = {
  terrain: "terrain",
  building: "building",
  unit: "unit",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function MapEditorPalette() {
  const brush = useEditorStore((s) => s.brush);
  const setBrush = useEditorStore((s) => s.setBrush);
  const [sheetsLoaded, setSheetsLoaded] = useState(false);

  // Load all sprite sheet metadata on mount
  useEffect(() => {
    Promise.all([
      loadSheetFrames("neutral"),
      loadSheetFrames("orange-star"),
      loadSheetFrames("blue-moon"),
      loadSheetFrames("green-earth"),
      loadSheetFrames("yellow-comet"),
    ]).then(() => setSheetsLoaded(true));
  }, []);

  const activeTab: PaletteTab =
    brush.category === "eraser"
      ? "terrain"
      : brush.category === "building"
        ? "building"
        : brush.category === "unit"
          ? "unit"
          : "terrain";

  const isEraser = brush.category === "eraser";
  const visibleTab: PaletteTab = activeTab;

  const setTab = (tab: PaletteTab) => {
    const patch: Partial<typeof brush> = { category: TAB_TO_CATEGORY[tab] };
    // Units have no neutral owner — default to Orange Star (0) if currently neutral
    if (tab === "unit" && brush.playerId < 0) {
      patch.playerId = 0;
    }
    setBrush(patch);
  };

  // Get the army sheet for current player selection
  const armySheet =
    brush.playerId >= 0
      ? (PLAYER_OPTIONS.find((p) => p.id === brush.playerId)?.sheet ?? "orange-star")
      : "neutral";

  // Owner selector shared between buildings and units
  const ownerOptions = visibleTab === "unit" ? UNIT_PLAYER_OPTIONS : PLAYER_OPTIONS;

  return (
    <div className="flex flex-col h-full">
      {/* Tab headers */}
      <div className="flex border-b border-gray-200 shrink-0">
        {(["terrain", "building", "unit"] as PaletteTab[]).map((tab) => {
          const isActiveTab = !isEraser && activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={`flex-1 px-2 py-3 text-sm font-bold uppercase tracking-wide transition-colors whitespace-nowrap border-b-2 -mb-px ${
                isActiveTab
                  ? "text-amber-600 border-amber-500"
                  : "text-gray-400 hover:text-gray-700 border-transparent"
              }`}
            >
              {tab === "terrain" ? "Terrain" : tab === "building" ? "Buildings" : "Units"}
            </button>
          );
        })}
      </div>

      {/* Eraser toggle */}
      <div className="px-4 pt-2 shrink-0">
        <button
          onClick={() => setBrush({ category: brush.category === "eraser" ? "terrain" : "eraser" })}
          className={`w-full py-1.5 text-xs font-bold rounded-lg transition-colors ${
            isEraser
              ? "bg-red-500 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200"
          }`}
        >
          {isEraser ? "Eraser Active (E)" : "Eraser (E)"}
        </button>
      </div>

      {/* Owner selector (buildings & units only) */}
      {(visibleTab === "building" || visibleTab === "unit") && (
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2 font-semibold">
            Owner
          </div>
          <div className="flex gap-1.5">
            {ownerOptions.map((p) => (
              <button
                key={p.id}
                onClick={() => setBrush({ playerId: p.id })}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors leading-tight ${
                  brush.playerId === p.id
                    ? "ring-2 ring-amber-500 text-white " + p.color
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {p.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {visibleTab === "terrain" && (
          <div className="grid grid-cols-3 gap-2.5">
            {TERRAIN_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setBrush({ category: "terrain", terrainType: t.id })}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-colors ${
                  brush.category === "terrain" && brush.terrainType === t.id
                    ? "bg-amber-50 ring-2 ring-amber-500"
                    : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
                }`}
              >
                {sheetsLoaded ? (
                  <SpritePreview
                    sheet="neutral"
                    frameName={TERRAIN_FRAME_NAMES[t.id] ?? "plain.png"}
                    size={48}
                    fallbackColor={TERRAIN_COLORS[t.id]}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-md ${TERRAIN_COLORS[t.id] ?? "bg-gray-300"}`}
                  />
                )}
                <span className="text-sm text-gray-700 leading-tight font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {visibleTab === "building" && (
          <div className="grid grid-cols-3 gap-2.5">
            {BUILDING_TYPES.filter((b) => brush.playerId >= 0 || b.id !== "hq").map((b) => (
              <button
                key={b.id}
                onClick={() => setBrush({ category: "building", buildingType: b.id })}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-colors ${
                  brush.category === "building" && brush.buildingType === b.id
                    ? "bg-amber-50 ring-2 ring-amber-500"
                    : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
                }`}
              >
                {sheetsLoaded ? (
                  <SpritePreview
                    sheet={armySheet}
                    frameName={BUILDING_FRAME_NAMES[b.id] ?? "city-0.png"}
                    size={48}
                    fallbackColor={BUILDING_COLORS[b.id]}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-md ${BUILDING_COLORS[b.id] ?? "bg-gray-300"}`}
                  />
                )}
                <span className="text-sm text-gray-700 leading-tight font-medium">{b.label}</span>
              </button>
            ))}
          </div>
        )}

        {visibleTab === "unit" && (
          <div className="grid grid-cols-3 gap-2.5">
            {UNIT_TYPES.map((u) => (
              <button
                key={u.id}
                onClick={() => setBrush({ category: "unit", unitType: u.id })}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-colors ${
                  brush.category === "unit" && brush.unitType === u.id
                    ? "bg-amber-50 ring-2 ring-amber-500"
                    : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
                }`}
              >
                {sheetsLoaded ? (
                  <SpritePreview
                    sheet={armySheet}
                    frameName={UNIT_FRAME_NAMES[u.id] ?? "infantry-0.png"}
                    size={48}
                    fallbackColor={PLAYER_ICON_BG[brush.playerId] ?? "bg-red-500"}
                    fallbackText={UNIT_ICONS[u.id]}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-md flex items-center justify-center text-xs text-white font-bold ${
                      PLAYER_ICON_BG[brush.playerId] ?? "bg-red-500"
                    }`}
                  >
                    {UNIT_ICONS[u.id] ?? u.id.slice(0, 3).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-700 leading-tight text-center font-medium">
                  {u.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
