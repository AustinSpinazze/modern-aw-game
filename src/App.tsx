import { useState, useCallback, useEffect, useRef, Component, type ReactNode } from "react";
import { flushSync } from "react-dom";
import MatchSetup from "./components/MatchSetup";
import GameCanvas from "./components/GameCanvas";
import InfoPanel from "./components/InfoPanel";
import TileInfoPanel from "./components/TileInfoPanel";
import ActionMenu from "./components/ActionMenu";
import BuyMenu from "./components/BuyMenu";
import ActionLog from "./components/ActionLog";
import SettingsModal from "./components/SettingsModal";
import { useGameStore } from "./store/game-store";
import { useGame } from "./hooks/useGame";
import { useConfigStore } from "./store/config-store";
import { loadGameData } from "./game/data-loader";
import type { GameState } from "./game/types";

// AI turn runners
import { runHeuristicTurn } from "./ai/heuristic";
import { runLLMTurn } from "./ai/llm-turn-runner";
import {
  zoomIn,
  zoomOut,
  resetPanZoom,
  getZoomLevel,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./rendering/pixi-app";

// Error boundary to catch render errors
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
          <div className="bg-red-900/50 border border-red-600 rounded-xl p-8 max-w-lg">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <p className="text-gray-300 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => {
                useGameStore.getState().resetSelection();
                useGameStore.getState().setGameState(null as any);
                this.setState({ hasError: false, error: null });
              }}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded"
            >
              Reset & Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppView = "setup" | "game";

// Team color config shared across banner and sidebar
const TEAM_BANNER_BG: Record<number, string> = {
  0: "bg-red-900/90 border-red-500",
  1: "bg-blue-900/90 border-blue-500",
  2: "bg-green-900/90 border-green-500",
  3: "bg-yellow-900/90 border-yellow-500",
};
const TEAM_TEXT: Record<number, string> = {
  0: "text-red-300",
  1: "text-blue-300",
  2: "text-green-300",
  3: "text-yellow-300",
};

interface SavedGameFile {
  version: number;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
  state: GameState;
}

function AppContent() {
  const [view, setView] = useState<AppView>("setup");
  const [buyMenuTile, setBuyMenuTile] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const handleZoomIn = useCallback(() => {
    zoomIn();
    setZoomLevel(getZoomLevel());
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomOut();
    setZoomLevel(getZoomLevel());
  }, []);

  const handleResetZoom = useCallback(() => {
    resetPanZoom();
    setZoomLevel(getZoomLevel());
  }, []);

  // Turn transition banner state
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [bannerTeam, setBannerTeam] = useState(0);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { gameState, currentPlayer, queueCommands, processingQueue } = useGame();

  const prevPlayerIndexRef = useRef<number>(-1);
  const prevPhaseRef = useRef<string>("");
  const prevTurnNumberRef = useRef<number>(-1);
  const llmTurnInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Sync encrypted API keys from Electron on startup ───────────────────
  useEffect(() => {
    useConfigStore.getState().syncFromElectron().catch(console.error);
  }, []);

  // ── Turn transition banner ──────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || view !== "game") return;

    const newIndex = gameState.current_player_index;
    const newPhase = gameState.phase;

    // Show banner when player index changes (turn started) or when game over
    if (
      (newIndex !== prevPlayerIndexRef.current && prevPlayerIndexRef.current !== -1) ||
      (newPhase === "game_over" && prevPhaseRef.current !== "game_over")
    ) {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);

      const player = gameState.players[newIndex];
      if (newPhase === "game_over") {
        const winner = gameState.winner_id >= 0 ? gameState.players[gameState.winner_id] : null;
        setBannerText(winner ? `Player ${winner.id + 1} Wins!` : "Draw!");
        setBannerTeam(winner?.team ?? 0);
      } else if (player) {
        setBannerText(`Player ${player.id + 1}'s Turn`);
        setBannerTeam(player.team);
      }

      setBannerVisible(true);
      bannerTimerRef.current = setTimeout(() => setBannerVisible(false), 1600);
    }

    prevPlayerIndexRef.current = newIndex;
    prevPhaseRef.current = newPhase;
  }, [gameState, view]);

  // ── Auto-save after each turn end ──────────────────────────────────────
  useEffect(() => {
    if (!gameState || view !== "game" || !window.electronAPI) return;
    if (gameState.turn_number === prevTurnNumberRef.current) return;
    prevTurnNumberRef.current = gameState.turn_number;

    const saveData: SavedGameFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      turnNumber: gameState.turn_number,
      playerCount: gameState.players.length,
      state: gameState,
    };
    window.electronAPI.saveGame("autosave", saveData).catch(console.error);
  }, [gameState, view]);

  // ── Handle AI turns ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.phase !== "action") return;
    if (!currentPlayer) return;
    if (currentPlayer.controller_type === "human") return;
    if (processingQueue) return;

    const timer = setTimeout(async () => {
      if (currentPlayer.controller_type === "heuristic") {
        const commands = runHeuristicTurn(gameState, currentPlayer.id);
        if (commands.length > 0) {
          queueCommands(commands);
        }
      } else if (
        (currentPlayer.controller_type === "anthropic" ||
          currentPlayer.controller_type === "openai" ||
          currentPlayer.controller_type === "local_http") &&
        !llmTurnInProgressRef.current
      ) {
        llmTurnInProgressRef.current = true;
        abortControllerRef.current = new AbortController();
        try {
          await runLLMTurn(
            currentPlayer.controller_type,
            currentPlayer.id,
            abortControllerRef.current.signal
          );
        } finally {
          llmTurnInProgressRef.current = false;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [gameState, currentPlayer, processingQueue, queueCommands]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "game") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in an input
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      )
        return;

      const store = useGameStore.getState();
      const state = store.gameState;
      if (!state) return;

      const player = state.players[state.current_player_index];
      const isHumanTurn = player?.controller_type === "human" && state.phase === "action";

      switch (e.key) {
        case "Escape":
          // Cancel pending move first, then deselect
          if (store.pendingMove) {
            store.cancelPendingMove();
          } else if (store.selectedUnit) {
            store.selectUnit(null);
          }
          break;

        case "e":
        case "E":
          // End turn (human only, not if selecting/pending)
          if (isHumanTurn && !store.isAnimating && !store.processingQueue) {
            store.submitCommand({ type: "END_TURN", player_id: player!.id });
          }
          break;

        case "w":
        case "W":
          // Wait with selected unit that has a pending move
          if (isHumanTurn && store.selectedUnit && store.pendingMove && !store.isAnimating) {
            store.startMoveAnimation({
              type: "WAIT",
              player_id: player!.id,
              unit_id: store.selectedUnit.id,
            });
          }
          break;

        case "+":
        case "=":
          zoomIn();
          setZoomLevel(getZoomLevel());
          break;

        case "-":
        case "_":
          zoomOut();
          setZoomLevel(getZoomLevel());
          break;

        case "0":
          resetPanZoom();
          setZoomLevel(getZoomLevel());
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  const handleMatchStart = useCallback(() => {
    prevPlayerIndexRef.current = -1;
    prevPhaseRef.current = "";
    prevTurnNumberRef.current = -1;
    setView("game");
  }, []);

  const handleQuickSave = useCallback(async () => {
    if (!gameState || !window.electronAPI) return;
    const saveData: SavedGameFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      turnNumber: gameState.turn_number,
      playerCount: gameState.players.length,
      state: gameState,
    };
    const ok = await window.electronAPI.saveGame("quicksave", saveData);
    setSaveFeedback(ok ? "Saved!" : "Save failed");
    setTimeout(() => setSaveFeedback(null), 2000);
  }, [gameState]);

  const handleFacilityClick = useCallback((x: number, y: number) => {
    setBuyMenuTile({ x, y });
  }, []);

  const handleCloseBuyMenu = useCallback(() => {
    setBuyMenuTile(null);
  }, []);

  const handleExitGame = useCallback(() => {
    // Abort any in-progress LLM turn
    abortControllerRef.current?.abort();
    llmTurnInProgressRef.current = false;

    // flushSync unmounts all game components synchronously before we touch Zustand,
    // preventing the "Cannot read properties of null (reading 'next')" crash that
    // occurred when Pixi's display-list traversal read from a null game state.
    flushSync(() => {
      setView("setup");
      setBuyMenuTile(null);
      setBannerVisible(false);
      setShowExitConfirm(false);
    });
    const store = useGameStore.getState();
    store.resetSelection();
    store.setGameState(null as any);
  }, []);

  if (view === "setup") {
    return (
      <>
        <MatchSetup onMatchStart={handleMatchStart} onOpenSettings={() => setShowSettings(true)} />
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </>
    );
  }

  const isAiTurn = currentPlayer?.controller_type !== "human";
  const isAiProcessing = processingQueue || (isAiTurn && gameState?.phase === "action");

  // Game view
  return (
    <div className="h-screen w-screen bg-gray-950 flex overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-700 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">Modern AW</h1>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col">
          <InfoPanel />
          <TileInfoPanel />
          <div className="flex-1" />
          <ActionLog />
        </div>
        <div className="p-3 border-t border-gray-700 space-y-2">
          {window.electronAPI && (
            <button
              onClick={handleQuickSave}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm py-2 rounded transition-colors relative"
            >
              {saveFeedback ?? "Save Game"}
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm py-2 rounded transition-colors"
          >
            Settings
          </button>
          <button
            onClick={() => setShowExitConfirm(true)}
            className="w-full bg-gray-700 hover:bg-red-900 hover:text-red-300 text-gray-300 text-sm py-2 rounded transition-colors"
          >
            Exit Game
          </button>
        </div>
      </aside>

      {/* Main game area */}
      <main className="flex-1 relative overflow-hidden">
        <GameCanvas onFacilityClick={handleFacilityClick} />
        <ActionMenu />

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1">
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            title="Zoom In (+)"
            className="w-8 h-8 bg-gray-900/90 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed border border-gray-600 rounded text-white font-bold text-lg leading-none transition-colors flex items-center justify-center backdrop-blur-sm"
          >
            +
          </button>
          <button
            onClick={handleResetZoom}
            title="Reset Zoom (0)"
            className="w-8 h-8 bg-gray-900/90 hover:bg-gray-700 border border-gray-600 rounded text-gray-400 text-xs font-mono leading-none transition-colors flex items-center justify-center backdrop-blur-sm"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= MIN_ZOOM}
            title="Zoom Out (-)"
            className="w-8 h-8 bg-gray-900/90 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed border border-gray-600 rounded text-white font-bold text-xl leading-none transition-colors flex items-center justify-center backdrop-blur-sm"
          >
            −
          </button>
          <div className="text-gray-600 text-xs mt-1 text-center leading-tight">
            scroll
            <br />⌘ drag
          </div>
        </div>

        {/* AI thinking overlay */}
        {isAiProcessing && (
          <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-6 z-10">
            <div className="bg-gray-900/80 border border-gray-600 rounded-full px-4 py-2 text-sm text-gray-300 flex items-center gap-2 backdrop-blur-sm">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              AI thinking…
            </div>
          </div>
        )}
      </main>

      {/* Buy menu modal */}
      {buyMenuTile && (
        <BuyMenu facilityX={buyMenuTile.x} facilityY={buyMenuTile.y} onClose={handleCloseBuyMenu} />
      )}

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-600 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-white font-bold text-lg mb-1">Exit Game?</h2>
            <p className="text-gray-400 text-sm mb-5">All match progress will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={handleExitGame}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Exit
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 rounded-lg transition-colors"
              >
                Keep Playing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Turn transition banner */}
      {bannerText && (
        <div
          className={`fixed inset-0 pointer-events-none z-50 flex items-center justify-center transition-opacity duration-300 ${
            bannerVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`border-2 rounded-2xl px-10 py-6 text-center shadow-2xl backdrop-blur-sm ${TEAM_BANNER_BG[bannerTeam] ?? "bg-gray-900/90 border-gray-500"}`}
          >
            <div
              className={`text-3xl font-black tracking-wide ${TEAM_TEXT[bannerTeam] ?? "text-white"}`}
            >
              {bannerText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrap with error boundary
function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
