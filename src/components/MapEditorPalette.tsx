"use client";

// Tile/building/unit picker sidebar for the map editor.

import { useEditorStore, type BrushCategory } from "../store/editor-store";

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
  { id: "battleship", label: "Battleship" },
  { id: "carrier", label: "Carrier" },
];

const PLAYER_OPTIONS = [
  { id: -1, label: "Neutral", color: "bg-gray-500" },
  { id: 0, label: "P1", color: "bg-red-500" },
  { id: 1, label: "P2", color: "bg-blue-500" },
  { id: 2, label: "P3", color: "bg-green-500" },
  { id: 3, label: "P4", color: "bg-yellow-500" },
];

const UNIT_PLAYER_OPTIONS = PLAYER_OPTIONS.filter((p) => p.id >= 0);

// Terrain type → preview color
const TERRAIN_COLORS: Record<string, string> = {
  plains: "bg-lime-400",
  forest: "bg-green-600",
  mountain: "bg-stone-500",
  road: "bg-gray-400",
  river: "bg-blue-500",
  bridge: "bg-gray-500",
  sea: "bg-blue-800",
  shoal: "bg-amber-300",
  reef: "bg-teal-700",
};

const BUILDING_COLORS: Record<string, string> = {
  city: "bg-purple-500",
  factory: "bg-purple-600",
  airport: "bg-purple-400",
  port: "bg-cyan-600",
  hq: "bg-amber-500",
};

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

  // Derive active tab from brush category
  const activeTab: PaletteTab =
    brush.category === "eraser"
      ? "terrain"
      : brush.category === "building"
        ? "building"
        : brush.category === "unit"
          ? "unit"
          : "terrain";

  const setTab = (tab: PaletteTab) => {
    setBrush({ category: TAB_TO_CATEGORY[tab] });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab headers */}
      <div className="flex border-b border-gray-700 shrink-0">
        {(["terrain", "building", "unit"] as PaletteTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`flex-1 px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
              activeTab === tab
                ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "terrain" ? "Terrain" : tab === "building" ? "Buildings" : "Units"}
          </button>
        ))}
      </div>

      {/* Eraser toggle */}
      <div className="px-3 pt-2 shrink-0">
        <button
          onClick={() =>
            setBrush({ category: brush.category === "eraser" ? "terrain" : "eraser" })
          }
          className={`w-full px-3 py-1.5 text-xs font-bold rounded transition-colors ${
            brush.category === "eraser"
              ? "bg-red-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          {brush.category === "eraser" ? "Eraser Active (D)" : "Eraser (D)"}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {activeTab === "terrain" && (
          <div className="grid grid-cols-3 gap-1.5">
            {TERRAIN_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setBrush({ category: "terrain", terrainType: t.id })}
                className={`flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                  brush.category === "terrain" && brush.terrainType === t.id
                    ? "bg-amber-500/20 ring-1 ring-amber-400"
                    : "bg-gray-800 hover:bg-gray-700"
                }`}
              >
                <div className={`w-6 h-6 rounded ${TERRAIN_COLORS[t.id] ?? "bg-gray-600"}`} />
                <span className="text-[10px] text-gray-300 leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === "building" && (
          <>
            {/* Player selector for buildings */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Owner</div>
              <div className="flex gap-1">
                {PLAYER_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setBrush({ playerId: p.id })}
                    className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${
                      brush.playerId === p.id
                        ? "ring-1 ring-amber-400 text-white " + p.color
                        : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {BUILDING_TYPES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBrush({ category: "building", buildingType: b.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                    brush.category === "building" && brush.buildingType === b.id
                      ? "bg-amber-500/20 ring-1 ring-amber-400"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <div className={`w-6 h-6 rounded ${BUILDING_COLORS[b.id] ?? "bg-gray-600"}`} />
                  <span className="text-[10px] text-gray-300 leading-tight">{b.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {activeTab === "unit" && (
          <>
            {/* Player selector for units (no neutral) */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Owner</div>
              <div className="flex gap-1">
                {UNIT_PLAYER_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setBrush({ playerId: p.id })}
                    className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${
                      brush.playerId === p.id
                        ? "ring-1 ring-amber-400 text-white " + p.color
                        : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {UNIT_TYPES.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setBrush({ category: "unit", unitType: u.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                    brush.category === "unit" && brush.unitType === u.id
                      ? "bg-amber-500/20 ring-1 ring-amber-400"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-[8px] text-gray-300 font-mono">
                    {u.id.slice(0, 3).toUpperCase()}
                  </div>
                  <span className="text-[10px] text-gray-300 leading-tight">{u.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
