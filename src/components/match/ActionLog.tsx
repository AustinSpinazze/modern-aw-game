// Recent action log for the sidebar — shows categorised commands with filter chips.

import { useState, useMemo } from "react";
import { useGameStore } from "../../store/game-store";

type FilterCategory = "MOVE" | "ATTACK" | "CAPTURE" | "BUILD" | "SYSTEM";

const CATEGORY_MAP: Record<string, FilterCategory> = {
  MOVE: "MOVE",
  WAIT: "MOVE",
  RESUPPLY: "MOVE",
  ATTACK: "ATTACK",
  CAPTURE: "CAPTURE",
  BUY_UNIT: "BUILD",
  BUILD_FOB: "BUILD",
  DIG_TRENCH: "BUILD",
  END_TURN: "SYSTEM",
  SUBMERGE: "SYSTEM",
  SURFACE: "SYSTEM",
};

const CATEGORY_STYLE: Record<FilterCategory, { active: string; inactive: string; badge: string }> =
  {
    MOVE: {
      active: "bg-blue-100 text-blue-600 border-blue-300",
      inactive: "text-gray-400 border-gray-200 bg-transparent",
      badge: "bg-blue-100 text-blue-600 border-blue-200",
    },
    ATTACK: {
      active: "bg-red-100 text-red-600 border-red-300",
      inactive: "text-gray-400 border-gray-200 bg-transparent",
      badge: "bg-red-100 text-red-600 border-red-200",
    },
    CAPTURE: {
      active: "bg-yellow-100 text-yellow-600 border-yellow-300",
      inactive: "text-gray-400 border-gray-200 bg-transparent",
      badge: "bg-yellow-100 text-yellow-600 border-yellow-200",
    },
    BUILD: {
      active: "bg-green-100 text-green-600 border-green-300",
      inactive: "text-gray-400 border-gray-200 bg-transparent",
      badge: "bg-green-100 text-green-600 border-green-200",
    },
    SYSTEM: {
      active: "bg-gray-200 text-gray-600 border-gray-300",
      inactive: "text-gray-400 border-gray-200 bg-transparent",
      badge: "bg-gray-100 text-gray-500 border-gray-200",
    },
  };

const TEAM_COLORS: Record<number, string> = {
  0: "text-red-500",
  1: "text-blue-500",
  2: "text-green-600",
  3: "text-yellow-500",
};

type CommandDict = Record<string, unknown>;

function formatEntry(cmd: CommandDict, playerName: string): string {
  const type = cmd.type as string;
  const toX = cmd.to_x as number | undefined;
  const toY = cmd.to_y as number | undefined;
  const unitType = cmd.unit_type as string | undefined;

  const coord = toX !== undefined && toY !== undefined ? ` (${toX},${toY})` : "";
  const unitName = unitType
    ? unitType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : "unit";

  switch (type) {
    case "MOVE":
      return `${playerName} moved${coord}`;
    case "WAIT":
      return `${playerName} waited`;
    case "ATTACK": {
      const dmg = cmd.damage_dealt as number | undefined;
      return dmg !== undefined
        ? `${playerName} attacked — ${dmg} HP damage`
        : `${playerName} attacked`;
    }
    case "CAPTURE":
      return `${playerName} capturing${coord}`;
    case "BUY_UNIT":
      return `${playerName} deployed ${unitName}`;
    case "END_TURN":
      return `${playerName} ended turn`;
    case "BUILD_FOB":
      return `${playerName} built FOB`;
    case "DIG_TRENCH":
      return `${playerName} dug trench`;
    case "RESUPPLY":
      return `${playerName} resupplied`;
    case "SUBMERGE":
      return `${playerName} submerged`;
    case "SURFACE":
      return `${playerName} surfaced`;
    default:
      return `${playerName}: ${type}`;
  }
}

export default function ActionLog() {
  const gameState = useGameStore((s) => s.gameState);

  const [activeFilters, setActiveFilters] = useState<Set<FilterCategory>>(
    new Set(["MOVE", "ATTACK", "CAPTURE", "BUILD", "SYSTEM"])
  );

  function toggleFilter(cat: FilterCategory) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        // Don't allow deselecting all filters
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const entries = useMemo(() => {
    if (!gameState) return [];
    const log = gameState.command_log ?? [];
    let day = 1;
    const result: Array<{
      day: number;
      category: FilterCategory;
      text: string;
      playerTeam: number;
    }> = [];

    for (const cmd of log) {
      const type = (cmd as CommandDict).type as string;
      const playerId = (cmd as CommandDict).player_id as number;
      const player = gameState.players.find((p) => p.id === playerId);
      const playerName = player ? `P${gameState.players.indexOf(player) + 1}` : "?";
      const playerTeam = player ? player.team : 0;

      if (type === "END_TURN") {
        result.push({
          day,
          category: "SYSTEM",
          text: `${playerName} ended turn`,
          playerTeam,
        });
        day++;
      } else {
        const category = CATEGORY_MAP[type] ?? "SYSTEM";
        result.push({
          day,
          category,
          text: formatEntry(cmd as CommandDict, playerName),
          playerTeam,
        });
      }
    }

    return result.reverse();
  }, [gameState]);

  const filteredEntries = entries.filter((e) => activeFilters.has(e.category));

  if (!gameState || gameState.command_log.length === 0) return null;

  return (
    <div
      className="border-t-2 border-gray-100 bg-gray-50 flex flex-col shrink-0"
      style={{ height: "260px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <span className="text-gray-500 text-base font-bold uppercase tracking-widest">
          Game Log
        </span>
        <span className="text-gray-400 text-base font-mono">{filteredEntries.length}</span>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 px-3 pb-2 shrink-0 flex-wrap">
        {(["MOVE", "ATTACK", "CAPTURE", "BUILD", "SYSTEM"] as FilterCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => toggleFilter(cat)}
            className={`text-xs font-bold px-2.5 py-1 rounded border transition-colors ${
              activeFilters.has(cat) ? CATEGORY_STYLE[cat].active : CATEGORY_STYLE[cat].inactive
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Scrollable entries */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {filteredEntries.length === 0 ? (
          <p className="text-gray-400 text-sm px-1 pt-1">No events yet</p>
        ) : (
          filteredEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-gray-400 shrink-0 w-6 text-right font-mono">D{entry.day}</span>
              <span
                className={`shrink-0 px-1.5 py-px rounded border text-xs font-bold leading-4 ${CATEGORY_STYLE[entry.category].badge}`}
              >
                {entry.category.slice(0, 3)}
              </span>
              <span
                className={`truncate text-sm ${TEAM_COLORS[entry.playerTeam] ?? "text-gray-600"}`}
              >
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
