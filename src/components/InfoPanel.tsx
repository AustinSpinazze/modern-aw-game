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

  const isHumanTurn = gameState.phase === "action" && currentPlayer.controller_type === "human";

  // Combat stats (only computed when fog is off)
  let combatStats: Array<{ playerId: number; built: number; alive: number; props: number }> | null = null;
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
    <div className="flex flex-col gap-2 p-3 text-sm">
      {/* Current player block */}
      <div className="bg-slate-700 border border-slate-600 rounded-xl p-3">
        <div className="flex items-baseline justify-between mb-1">
          <div className={`text-xl font-black ${colorClass}`}>Player {currentPlayer.id + 1}</div>
          <div className="text-slate-300 text-xs">Turn {gameState.turn_number}</div>
        </div>
        <div className="mb-2">
          <span className="bg-slate-600 text-slate-300 text-xs px-2 py-0.5 rounded-full capitalize">
            {currentPlayer.controller_type}
          </span>
        </div>
        <div className="text-amber-400 font-mono font-bold text-2xl">
          ¥{currentPlayer.funds.toLocaleString()}
        </div>
      </div>

      {gameState.phase === "game_over" && (
        <div className="text-amber-400 font-bold text-center py-2 bg-amber-900/20 rounded border border-amber-700/40">
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
          className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black py-2.5 px-4 rounded-lg transition-colors flex items-center justify-between"
        >
          <span>End Turn</span>
          <span className="bg-amber-600/50 text-amber-900 text-xs px-1.5 rounded">E</span>
        </button>
      )}

      {/* Match rules summary */}
      {(gameState.max_turns > 0 ||
        gameState.income_multiplier !== 1 ||
        gameState.luck_max === 0) && (
        <div className="border-t border-slate-600 pt-2 px-1">
          <div className="text-slate-300 text-xs uppercase tracking-wide mb-1">Rules</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
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
      <div className="border-t border-slate-600 pt-2">
        <div className="text-slate-300 text-xs uppercase tracking-wide mb-1">Players</div>
        {gameState.players.map((p) => (
          <div
            key={p.id}
            className={`flex justify-between items-center text-xs py-1 px-1.5 rounded ${
              p.id === currentPlayer.id ? "bg-slate-700" : ""
            } ${p.is_defeated ? "opacity-40 line-through" : ""}`}
          >
            <span className={`font-medium ${teamColors[p.team] ?? "text-white"}`}>
              P{p.id + 1}
              {p.id === currentPlayer.id && (
                <span className="text-slate-300 font-normal ml-1">◀</span>
              )}
            </span>
            <span className="text-amber-400 font-mono">¥{p.funds.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Intel section (fog disabled) */}
      {combatStats && (
        <div className="border-t border-slate-600 pt-2">
          <div className="text-slate-300 text-xs uppercase tracking-wide mb-1">
            Intel <span className="normal-case text-slate-400">(fog off)</span>
          </div>
          <div className="space-y-1.5">
            {combatStats.map(({ playerId, built, alive, props }) => {
              const p = gameState.players.find((pl) => pl.id === playerId);
              if (!p || p.is_defeated) return null;
              return (
                <div key={playerId} className="bg-slate-700 rounded-lg px-2.5 py-2">
                  <div className={`text-xs font-bold mb-1 ${teamColors[p.team] ?? "text-white"}`}>
                    P{playerId + 1}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-white font-bold text-sm">{built}</div>
                      <div className="text-slate-300 text-xs">Built</div>
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">{alive}</div>
                      <div className="text-slate-300 text-xs">Alive</div>
                    </div>
                    <div>
                      <div className="text-amber-400 font-bold text-sm">{props}</div>
                      <div className="text-slate-300 text-xs">Props</div>
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
