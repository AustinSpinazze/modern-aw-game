// Recent action log for the sidebar — shows categorised commands with filter chips.

import { useState, useMemo } from "react";
import { useGameStore } from "../store/game-store";

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

const CATEGORY_STYLE: Record<FilterCategory, { active: string; inactive: string; badge: string }> = {
  MOVE:    { active: "bg-blue-500/20 text-blue-300 border-blue-500/50",       inactive: "text-slate-600 border-slate-700 bg-transparent", badge: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  ATTACK:  { active: "bg-red-500/20 text-red-300 border-red-500/50",          inactive: "text-slate-600 border-slate-700 bg-transparent", badge: "bg-red-500/20 text-red-300 border-red-500/40" },
  CAPTURE: { active: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50", inactive: "text-slate-600 border-slate-700 bg-transparent", badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  BUILD:   { active: "bg-green-500/20 text-green-300 border-green-500/50",    inactive: "text-slate-600 border-slate-700 bg-transparent", badge: "bg-green-500/20 text-green-300 border-green-500/40" },
  SYSTEM:  { active: "bg-slate-500/20 text-slate-400 border-slate-500/50",    inactive: "text-slate-600 border-slate-700 bg-transparent", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
};

const TEAM_COLORS: Record<number, string> = {
  0: "text-red-400",
  1: "text-blue-400",
  2: "text-green-400",
  3: "text-yellow-400",
};

type CommandDict = Record<string, unknown>;

function formatEntry(cmd: CommandDict, playerName: string): string {
  const type = cmd.type as string;
  switch (type) {
    case "MOVE":
      return `${playerName} moved unit`;
    case "WAIT":
      return `${playerName} waited`;
    case "ATTACK": {
      const dmg = cmd.damage_dealt as number | undefined;
      return dmg !== undefined
        ? `${playerName} attacked — ${dmg} HP damage`
        : `${playerName} attacked`;
    }
    case "CAPTURE":
      return `${playerName} capturing property`;
    case "BUY_UNIT":
      return `${playerName} deployed unit`;
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
    <div className="border-t border-slate-600/50 flex flex-col shrink-0" style={{ height: "200px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
        <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest">
          Game Log
        </span>
        <span className="text-slate-600 text-[10px] font-mono">{filteredEntries.length} events</span>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 px-2 pb-1.5 shrink-0 flex-wrap">
        {(["MOVE", "ATTACK", "CAPTURE", "BUILD", "SYSTEM"] as FilterCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => toggleFilter(cat)}
            className={`text-[9px] px-1.5 py-0.5 rounded border font-mono transition-colors ${
              activeFilters.has(cat) ? CATEGORY_STYLE[cat].active : CATEGORY_STYLE[cat].inactive
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Scrollable entries */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 font-mono">
        {filteredEntries.length === 0 ? (
          <p className="text-slate-700 text-[10px] px-1 pt-1">No events yet</p>
        ) : (
          filteredEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] min-w-0">
              <span className="text-slate-600 shrink-0 w-5 text-right">D{entry.day}</span>
              <span
                className={`shrink-0 px-1 py-px rounded border text-[8px] leading-4 ${CATEGORY_STYLE[entry.category].badge}`}
              >
                {entry.category.slice(0, 3)}
              </span>
              <span className={`truncate ${TEAM_COLORS[entry.playerTeam] ?? "text-slate-400"}`}>
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
