// Turn / player / funds sidebar panel.

import { useGameStore } from "../store/game-store";

export default function InfoPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const submitCommand = useGameStore((s) => s.submitCommand);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  if (!currentPlayer) return null;

  const teamColors: Record<number, string> = {
    0: "text-red-500",
    1: "text-blue-500",
    2: "text-green-600",
    3: "text-yellow-500",
  };
  const teamBgColors: Record<number, string> = {
    0: "bg-red-500 hover:bg-red-400 active:bg-red-600",
    1: "bg-blue-500 hover:bg-blue-400 active:bg-blue-600",
    2: "bg-green-600 hover:bg-green-500 active:bg-green-700",
    3: "bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600",
  };
  const colorClass = teamColors[currentPlayer.team] ?? "text-gray-900";
  const endTurnBg = teamBgColors[currentPlayer.team] ?? "bg-slate-700 hover:bg-slate-600";

  const handleEndTurn = () => {
    submitCommand({ type: "END_TURN", player_id: currentPlayer.id });
  };

  const isHumanTurn = gameState.phase === "action" && currentPlayer.controller_type === "human";

  // Combat stats (only computed when fog is off)
  let combatStats: Array<{ playerId: number; built: number; alive: number; props: number }> | null =
    null;
  if (!gameState.fog_of_war) {
    const builtByPlayer: Record<number, number> = {};
    for (const cmd of gameState.command_log) {
      if (cmd.type === "BUY_UNIT" && typeof cmd.player_id === "number") {
        builtByPlayer[cmd.player_id] = (builtByPlayer[cmd.player_id] ?? 0) + 1;
      }
    }
    const aliveByPlayer: Record<number, number> = {};
    for (const unit of Object.values(gameState.units)) {
      aliveByPlayer[unit.owner_id] = (aliveByPlayer[unit.owner_id] ?? 0) + 1;
    }
    const propsByPlayer: Record<number, number> = {};
    for (const row of gameState.tiles) {
      for (const tile of row) {
        if (tile.owner_id >= 0) {
          propsByPlayer[tile.owner_id] = (propsByPlayer[tile.owner_id] ?? 0) + 1;
        }
      }
    }
    combatStats = gameState.players.map((p) => ({
      playerId: p.id,
      built: builtByPlayer[p.id] ?? 0,
      alive: aliveByPlayer[p.id] ?? 0,
      props: propsByPlayer[p.id] ?? 0,
    }));
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-base">
      {/* Current player block */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className={`text-2xl font-black ${colorClass}`}>Player {currentPlayer.id + 1}</div>
          <div className="text-gray-500 text-sm">Turn {gameState.turn_number}</div>
        </div>
        <div className="mb-3">
          <span className="bg-gray-200 text-gray-600 text-sm px-2.5 py-0.5 rounded-full capitalize">
            {currentPlayer.controller_type}
          </span>
        </div>
        <div className="text-amber-500 font-mono font-bold text-3xl">
          ¥{currentPlayer.funds.toLocaleString()}
        </div>
      </div>

      {gameState.phase === "game_over" && (
        <div className="text-amber-600 font-bold text-center py-2 bg-amber-50 rounded border border-amber-200 text-base">
          Game Over!
          {gameState.winner_id >= 0 && (
            <div className="text-sm font-normal mt-0.5">Player {gameState.winner_id + 1} wins!</div>
          )}
        </div>
      )}

      {/* End Turn button */}
      {isHumanTurn && (
        <button
          onClick={handleEndTurn}
          className={`w-full text-white font-black py-3 px-4 rounded-lg transition-colors flex items-center justify-between text-base ${endTurnBg}`}
        >
          <span>End Turn</span>
          <span className="bg-white/20 text-white text-sm px-2 rounded">E</span>
        </button>
      )}

      {/* Match rules summary */}
      {(gameState.max_turns > 0 ||
        gameState.income_multiplier !== 1 ||
        gameState.luck_max === 0) && (
        <div className="border-t border-gray-200 pt-3 px-1">
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Rules</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
            {gameState.max_turns > 0 && (
              <span>
                ⏱ {gameState.turn_number}/{gameState.max_turns}
              </span>
            )}
            {gameState.income_multiplier !== 1 && <span>💰 ×{gameState.income_multiplier}</span>}
            {gameState.luck_max === 0 && <span>🎲 No luck</span>}
          </div>
        </div>
      )}

      {/* Player roster */}
      <div className="border-t border-gray-200 pt-3">
        <div className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Players</div>
        {gameState.players.map((p) => (
          <div
            key={p.id}
            className={`flex justify-between items-center text-sm py-1.5 px-2 rounded ${
              p.id === currentPlayer.id ? "bg-gray-100" : ""
            } ${p.is_defeated ? "opacity-40 line-through" : ""}`}
          >
            <span className={`font-semibold ${teamColors[p.team] ?? "text-gray-900"}`}>
              P{p.id + 1}
              {p.id === currentPlayer.id && (
                <span className="text-gray-400 font-normal ml-1">◀</span>
              )}
            </span>
            <span className="text-amber-500 font-mono text-sm">¥{p.funds.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Intel section (fog disabled) */}
      {combatStats && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">
            Intel <span className="normal-case text-gray-400">(fog off)</span>
          </div>
          <div className="space-y-2">
            {combatStats.map(({ playerId, built, alive, props }) => {
              const p = gameState.players.find((pl) => pl.id === playerId);
              if (!p || p.is_defeated) return null;
              return (
                <div key={playerId} className="bg-gray-100 rounded-lg px-3 py-2.5">
                  <div
                    className={`text-sm font-bold mb-1.5 ${teamColors[p.team] ?? "text-gray-900"}`}
                  >
                    P{playerId + 1}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-gray-900 font-bold text-base">{built}</div>
                      <div className="text-gray-400 text-xs">Built</div>
                    </div>
                    <div>
                      <div className="text-gray-900 font-bold text-base">{alive}</div>
                      <div className="text-gray-400 text-xs">Alive</div>
                    </div>
                    <div>
                      <div className="text-amber-500 font-bold text-base">{props}</div>
                      <div className="text-gray-400 text-xs">Props</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
