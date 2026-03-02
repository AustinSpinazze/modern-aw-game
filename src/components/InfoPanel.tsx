// Turn / player / funds sidebar panel.

import { useGameStore } from "../store/game-store";

export default function InfoPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const submitCommand = useGameStore((s) => s.submitCommand);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer) return null;

  const teamColors: Record<number, string> = {
    0: "text-red-400",
    1: "text-blue-400",
    2: "text-green-400",
    3: "text-yellow-400",
  };
  const teamBg: Record<number, string> = {
    0: "bg-red-900/20 border-red-700/40",
    1: "bg-blue-900/20 border-blue-700/40",
    2: "bg-green-900/20 border-green-700/40",
    3: "bg-yellow-900/20 border-yellow-700/40",
  };
  const colorClass = teamColors[currentPlayer.team] ?? "text-white";
  const bgClass = teamBg[currentPlayer.team] ?? "bg-gray-800/20 border-gray-700/40";

  const handleEndTurn = () => {
    submitCommand({ type: "END_TURN", player_id: currentPlayer.id });
  };

  const isHumanTurn = gameState.phase === "action" && currentPlayer.controller_type === "human";

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      {/* Current player highlight block */}
      <div className={`rounded-lg border p-2.5 ${bgClass}`}>
        <div className="flex items-baseline justify-between mb-1">
          <div className={`font-bold text-base ${colorClass}`}>
            Player {currentPlayer.id + 1}
          </div>
          <div className="text-gray-500 text-xs">Turn {gameState.turn_number}</div>
        </div>
        <div className="text-gray-400 text-xs capitalize mb-1.5">{currentPlayer.controller_type}</div>
        <div className="text-yellow-300 font-mono font-bold text-lg">
          ¥{currentPlayer.funds.toLocaleString()}
        </div>
      </div>

      {gameState.phase === "game_over" && (
        <div className="text-yellow-400 font-bold text-center py-2 bg-yellow-900/30 rounded border border-yellow-700/40">
          Game Over!
          {gameState.winner_id >= 0 && (
            <div className="text-sm font-normal mt-0.5">Player {gameState.winner_id + 1} wins!</div>
          )}
        </div>
      )}

      {/* End Turn button — prominent, at top of actions */}
      {isHumanTurn && (
        <button
          onClick={handleEndTurn}
          className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-between"
        >
          <span>End Turn</span>
          <span className="text-green-300 text-xs font-normal opacity-75 border border-green-600 rounded px-1">E</span>
        </button>
      )}

      {/* Player roster */}
      <div className="border-t border-gray-700 pt-2">
        <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Players</div>
        {gameState.players.map((p) => (
          <div
            key={p.id}
            className={`flex justify-between items-center text-xs py-1 px-1.5 rounded ${
              p.id === currentPlayer.id ? "bg-gray-800" : ""
            } ${p.is_defeated ? "opacity-40 line-through" : ""}`}
          >
            <span className={`font-medium ${teamColors[p.team] ?? "text-white"}`}>
              P{p.id + 1}
              {p.id === currentPlayer.id && <span className="text-gray-500 font-normal ml-1">◀</span>}
            </span>
            <span className="text-yellow-300 font-mono">¥{p.funds.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
