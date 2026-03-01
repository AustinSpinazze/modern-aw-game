"use client";
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
  const colorClass = teamColors[currentPlayer.team] ?? "text-white";

  const handleEndTurn = () => {
    submitCommand({ type: "END_TURN", player_id: currentPlayer.id });
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div>
        <div className="text-gray-400 text-xs uppercase tracking-wide">Turn</div>
        <div className="text-white font-bold text-lg">{gameState.turn_number}</div>
      </div>

      <div>
        <div className="text-gray-400 text-xs uppercase tracking-wide">Player</div>
        <div className={`font-bold text-lg ${colorClass}`}>
          Player {currentPlayer.id + 1}
        </div>
        <div className="text-gray-400 text-xs capitalize">{currentPlayer.controller_type}</div>
      </div>

      <div>
        <div className="text-gray-400 text-xs uppercase tracking-wide">Funds</div>
        <div className="text-yellow-300 font-mono text-lg">
          ¥{currentPlayer.funds.toLocaleString()}
        </div>
      </div>

      {gameState.phase === "game_over" && (
        <div className="text-yellow-400 font-bold text-center py-2 bg-yellow-900/30 rounded">
          Game Over!
          {gameState.winner_id >= 0 && ` Player ${gameState.winner_id + 1} wins!`}
        </div>
      )}

      {gameState.phase === "action" && currentPlayer.controller_type === "human" && (
        <button
          onClick={handleEndTurn}
          className="mt-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          End Turn
        </button>
      )}

      <div className="mt-2 border-t border-gray-700 pt-2">
        <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Players</div>
        {gameState.players.map((p) => (
          <div
            key={p.id}
            className={`flex justify-between text-xs py-0.5 ${p.is_defeated ? "opacity-40 line-through" : ""} ${p.id === currentPlayer.id ? "font-bold" : ""}`}
          >
            <span className={teamColors[p.team] ?? "text-white"}>P{p.id + 1}</span>
            <span className="text-yellow-300 font-mono">¥{p.funds.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
