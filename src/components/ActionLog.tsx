// Recent action log for the sidebar — shows last N commands in human-readable form.

import { useGameStore } from "../store/game-store";
import { getUnitData } from "../game/data-loader";

const TEAM_COLORS: Record<number, string> = {
  0: "text-red-400",
  1: "text-blue-400",
  2: "text-green-400",
  3: "text-yellow-400",
};

const MAX_ENTRIES = 8;

type CommandDict = Record<string, unknown>;

function formatCommand(
  cmd: CommandDict,
  players: { id: number; team: number }[]
): { text: string; playerTeam: number } | null {
  const playerId = (cmd.player_id as number) ?? -1;
  const player = players.find((p) => p.id === playerId);
  const team = player?.team ?? 0;
  const pName = `P${playerId + 1}`;

  switch (cmd.type as string) {
    case "MOVE": {
      const unitType = (cmd.unit_type as string) ?? "";
      const unitName = unitType ? (getUnitData(unitType)?.name ?? unitType) : "Unit";
      return { text: `${pName} moved ${unitName}`, playerTeam: team };
    }
    case "ATTACK":
      return { text: `${pName} attacked`, playerTeam: team };
    case "CAPTURE":
      return { text: `${pName} capturing…`, playerTeam: team };
    case "BUY_UNIT": {
      const unitType = (cmd.unit_type as string) ?? "";
      const unitName = getUnitData(unitType)?.name ?? unitType;
      return { text: `${pName} deployed ${unitName}`, playerTeam: team };
    }
    case "WAIT":
      return { text: `${pName} waited`, playerTeam: team };
    case "DIG_TRENCH":
      return { text: `${pName} dug trench`, playerTeam: team };
    case "BUILD_FOB":
      return { text: `${pName} built FOB`, playerTeam: team };
    case "END_TURN":
      return { text: `── P${playerId + 1} ended turn ──`, playerTeam: team };
    case "SUBMERGE":
      return { text: `${pName} submerged`, playerTeam: team };
    case "SURFACE":
      return { text: `${pName} surfaced`, playerTeam: team };
    case "RESUPPLY":
      return { text: `${pName} resupplied`, playerTeam: team };
    default:
      return null;
  }
}

export default function ActionLog() {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState || gameState.command_log.length === 0) return null;

  const recent = [...gameState.command_log].reverse().slice(0, MAX_ENTRIES);

  return (
    <div className="border-t border-gray-700 p-3">
      <div className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Recent Actions</div>
      <div className="space-y-0.5">
        {recent.map((cmd, i) => {
          const entry = formatCommand(cmd, gameState.players);
          if (!entry) return null;
          const colorClass = TEAM_COLORS[entry.playerTeam] ?? "text-gray-400";
          const isEndTurn = (cmd.type as string) === "END_TURN";
          return (
            <div
              key={i}
              className={`text-xs ${isEndTurn ? "text-gray-600 text-center py-0.5" : colorClass} truncate`}
            >
              {entry.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
