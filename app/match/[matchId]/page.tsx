"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import MatchSetup from "../../../src/components/MatchSetup";
import InfoPanel from "../../../src/components/InfoPanel";
import TileInfoPanel from "../../../src/components/TileInfoPanel";
import ActionMenu from "../../../src/components/ActionMenu";
import BuyMenu from "../../../src/components/BuyMenu";
import { useGameStore } from "../../../src/store/game-store";
import { useGame } from "../../../src/hooks/useGame";
import { loadGameData } from "../../../src/game/data-loader";
import { HeuristicAI } from "../../../src/ai/heuristic";
import { AnthropicAI } from "../../../src/ai/anthropic";
import { OpenAIProvider } from "../../../src/ai/openai";
import type { GameState } from "../../../src/game/types";
import { applyCommand } from "../../../src/game/apply-command";
import { validateCommand } from "../../../src/game/validators";
import { commandFromDict } from "../../../src/game/commands";

// Dynamically import GameCanvas to avoid SSR issues with Pixi.js
const GameCanvas = dynamic(() => import("../../../src/components/GameCanvas"), { ssr: false });

export default function MatchPage() {
  const params = useParams();
  const matchId = params.matchId as string;
  const isOnline = matchId !== "local";

  const [matchStarted, setMatchStarted] = useState(false);
  const [buyMenuPos, setBuyMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const aiRunningRef = useRef(false);

  const { gameState, submitCommand, canBuyAt } = useGame();
  const setGameState = useGameStore((s) => s.setGameState);
  const processingQueue = useGameStore((s) => s.processingQueue);

  const queueCommands = useGameStore((s) => s.queueCommands);

  // AI turn runner — uses ref for guard to avoid stale closure / dep churn
  const runAiTurn = useCallback(async (state: GameState) => {
    if (aiRunningRef.current) return;
    const currentPlayer = state.players[state.current_player_index];
    if (!currentPlayer || currentPlayer.controller_type === "human") return;

    aiRunningRef.current = true;
    setAiRunning(true);
    try {
      let provider;
      switch (currentPlayer.controller_type) {
        case "anthropic": provider = new AnthropicAI(); break;
        case "openai": provider = new OpenAIProvider(); break;
        default: provider = new HeuristicAI(); break;
      }

      const commands = await provider.requestTurn(state, currentPlayer.id);

      // Queue commands for animated playback
      queueCommands(commands);
    } catch (err) {
      console.error("AI turn error:", err);
      aiRunningRef.current = false;
      setAiRunning(false);
    }
    // Note: aiRunning state is cleared when queue processing completes
  }, [queueCommands]);

  // Watch for AI turns
  useEffect(() => {
    if (!gameState || gameState.phase === "game_over") return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (!currentPlayer || currentPlayer.controller_type === "human") return;

    // Small delay before AI moves
    const timer = setTimeout(() => runAiTurn(gameState), 500);
    return () => clearTimeout(timer);
  }, [gameState?.current_player_index, gameState?.turn_number, runAiTurn]);

  // Reset AI running state when queue processing completes
  useEffect(() => {
    if (!processingQueue && aiRunningRef.current) {
      aiRunningRef.current = false;
      setAiRunning(false);
    }
  }, [processingQueue]);

  if (!matchStarted) {
    return <MatchSetup onMatchStart={() => setMatchStarted(true)} />;
  }

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Game canvas - fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <GameCanvas onFacilityClick={(x, y) => setBuyMenuPos({ x, y })} />
        <ActionMenu />
        {buyMenuPos && (
          <BuyMenu
            facilityX={buyMenuPos.x}
            facilityY={buyMenuPos.y}
            onClose={() => setBuyMenuPos(null)}
          />
        )}
        {aiRunning && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-900/80 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm">
            AI is thinking…
          </div>
        )}
        {gameState?.phase === "game_over" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl">
              <div className="text-3xl font-bold text-yellow-400 mb-2">Game Over</div>
              {gameState.winner_id >= 0 && (
                <div className="text-white text-lg mb-4">
                  Player {gameState.winner_id + 1} wins!
                </div>
              )}
              <a href="/" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold transition-colors">
                Main Menu
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar — always 256px, never overlaps canvas */}
      <aside className="w-64 shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col overflow-y-auto">
        <InfoPanel />
        <TileInfoPanel />
      </aside>
    </div>
  );
}
