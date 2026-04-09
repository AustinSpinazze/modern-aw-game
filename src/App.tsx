/**
 * Root **application shell**: view routing (menu, setup, match, editor, agent configuration), loads {@link ./game/dataLoader},
 * wires keyboard/timer/autosave, and hosts the Pixi {@link ./components/match/GameCanvas} match view.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
  Component,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import MatchSetup from "./components/setup/MatchSetup";

const MapEditor = lazy(() => import("./components/editor/MapEditor"));
import GameCanvas from "./components/match/GameCanvas";
import InfoPanel from "./components/match/InfoPanel";
import TileInfoPanel from "./components/match/TileInfoPanel";
import ActionMenu from "./components/match/ActionMenu";
import BuyMenu from "./components/match/BuyMenu";
import ActionLog from "./components/match/ActionLog";
import AgentConfigurationAndAnalyticsModal from "./components/agentConfigurationAndAnalytics/AgentConfigurationAndAnalyticsModal";
import AgentConfigurationAndAnalyticsPage from "./components/agentConfigurationAndAnalytics/AgentConfigurationAndAnalyticsPage";
import MainMenu from "./components/menu/MainMenu";
import TurnTransitionOverlay from "./components/match/TurnTransitionOverlay";
import type { SavedGameMeta } from "./types";
import { useGameStore } from "./store/gameStore";
import { useGame } from "./hooks/useGame";
import { useConfigStore } from "./store/configStore";
import { useUsageStore } from "./store/usageStore";
import { loadGameData, getTerrainData } from "./game/dataLoader";
import { ensureMatchId, getTile } from "./game/gameState";
import type { GameState } from "./game/types";
import { TEAM_COLORS } from "./lib/teamColors";
import ConfirmDialog from "./components/shared/ConfirmDialog";
import { useTurnTimer } from "./hooks/useTurnTimer";
import { useGameKeyboard } from "./hooks/useGameKeyboard";
import { useAutoSave, type SavedGameFile } from "./hooks/useAutoSave";

// AI turn runners
import { runHeuristicTurn } from "./ai/heuristic";
import { runLLMTurn } from "./ai/llmTurnRunner";
import {
  zoomIn,
  zoomOut,
  resetZoom,
  getZoomLevel,
  getMinZoom,
  MAX_ZOOM,
  setZoomChangeCallback,
} from "./rendering/pixiApp";

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
        <div className="min-h-screen bg-neutral-100 text-gray-900 flex items-center justify-center p-8">
          <div className="bg-white border border-red-200 rounded-xl p-8 max-w-lg shadow-lg">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <p className="text-gray-500 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => {
                useGameStore.getState().clearGameState();
                this.setState({ hasError: false, error: null });
              }}
              className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-4 py-2 rounded"
            >
              Reset &amp; Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppView = "menu" | "setup" | "game" | "editor" | "agentConfiguration";

const TEAM_BORDER: Record<number, string> = Object.fromEntries(
  TEAM_COLORS.map((c, i) => [i, c.border])
);

function AppContent() {
  const [view, setView] = useState<AppView>("menu");
  const [buyMenuTile, setBuyMenuTile] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showAgentConfigurationModal, setShowAgentConfigurationModal] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Saved games list (for main menu)
  const [gameSaves, setGameSaves] = useState<SavedGameMeta[]>([]);

  /** Increment whenever we navigate to the match view so GameCanvas remounts with a fresh canvas element.
   * Reusing the same canvas after Pixi teardown can leave Electron/Chromium with a bad GPU mailbox (map blank). */
  const [gameCanvasKey, setGameCanvasKey] = useState(0);

  // Load saves list for main menu
  useEffect(() => {
    if (window.electronAPI?.listSaves) {
      window.electronAPI.listSaves().then(setGameSaves).catch(console.error);
    }
  }, []);

  // Keep zoomLevel state in sync with Pixi zoom (including scroll/pinch).
  useEffect(() => {
    setZoomChangeCallback(setZoomLevel);
    return () => setZoomChangeCallback(null);
  }, []);

  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, []);
  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, []);
  const handleResetZoom = useCallback(() => {
    resetZoom();
    setZoomLevel(getZoomLevel());
  }, []);

  // Turn transition banner state
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [bannerTeam, setBannerTeam] = useState(0);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { gameState, currentPlayer, queueCommands, processingQueue } = useGame();
  const aiTurnFailure = useGameStore((s) => s.aiTurnFailure);
  const clearAiTurnFailure = useGameStore((s) => s.clearAiTurnFailure);
  const hoveredTile = useGameStore((s) => s.hoveredTile);

  const prevPlayerIndexRef = useRef<number>(-1);
  const prevPhaseRef = useRef<string>("");
  const llmTurnInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Extracted hooks ─────────────────────────────────────────────────────
  const {
    timeRemaining,
    setTurnStartTime,
    timerPaused,
    pauseTimer,
    resumeTimer,
    resetTimerState,
    timeRemainingRef,
    pendingCarryoverRef,
    timerAutoEndedRef,
  } = useTurnTimer({ gameState, view, menuOpen });

  const { resetTurnTracking } = useAutoSave(gameState, view);

  useGameKeyboard(view, setZoomLevel);

  // ── Sync encrypted API keys from Electron on startup ───────────────────
  useEffect(() => {
    useConfigStore.getState().syncFromElectron().catch(console.error);
  }, []);

  // ── Close menu on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

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

        // Record win/loss for AI models — from the AI's perspective
        if (winner && gameState.match_id) {
          const isAiWinner = winner.controller_type !== "human";
          useUsageStore
            .getState()
            .recordGameResult(gameState.match_id, isAiWinner ? "win" : "loss");
        }
      } else if (player) {
        setBannerText(`Player ${player.id + 1}`);
        setBannerTeam(player.team);
        timerAutoEndedRef.current = false;

        // Save whatever time the outgoing player had left into their carryover bank.
        const prevPlayer = gameState.players[prevPlayerIndexRef.current];
        if (prevPlayer && timeRemainingRef.current !== null && timeRemainingRef.current > 0) {
          pendingCarryoverRef.current[prevPlayer.id] =
            (pendingCarryoverRef.current[prevPlayer.id] ?? 0) + timeRemainingRef.current;
        }
        timeRemainingRef.current = null;

        // Only start a countdown for human turns.
        // Carry over this player's own banked seconds (chess-style increment).
        if (player.controller_type === "human") {
          const carryover = pendingCarryoverRef.current[player.id] ?? 0;
          delete pendingCarryoverRef.current[player.id];
          setTurnStartTime(Date.now() + carryover * 1000);
        } else {
          setTurnStartTime(null);
        }
      }

      setBannerVisible(true);
      bannerTimerRef.current = setTimeout(() => setBannerVisible(false), 1600);
    }

    prevPlayerIndexRef.current = newIndex;
    prevPhaseRef.current = newPhase;
  }, [gameState, view, timerAutoEndedRef, timeRemainingRef, pendingCarryoverRef, setTurnStartTime]);

  // ── Handle AI turns ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || gameState.phase !== "action") return;
    if (!currentPlayer) return;
    if (currentPlayer.controller_type === "human") return;
    if (processingQueue) return;
    if (
      aiTurnFailure &&
      aiTurnFailure.matchId === gameState.match_id &&
      aiTurnFailure.playerId === currentPlayer.id
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      if (currentPlayer.controller_type === "heuristic") {
        const commands = runHeuristicTurn(gameState, currentPlayer.id);
        if (commands.length > 0) {
          queueCommands(commands);
        }
      } else if (
        (currentPlayer.controller_type === "anthropic" ||
          currentPlayer.controller_type === "openai" ||
          currentPlayer.controller_type === "gemini" ||
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
  }, [gameState, currentPlayer, processingQueue, queueCommands, aiTurnFailure]);

  // Snapshot the game state at match start so Rematch can restore it
  const initialGameStateRef = useRef<GameState | null>(null);

  const handleMatchStart = useCallback(() => {
    prevPlayerIndexRef.current = -1;
    prevPhaseRef.current = "";
    resetTurnTracking();
    initialGameStateRef.current = useGameStore.getState().gameState;
    setGameCanvasKey((k) => k + 1);
    setView("game");
  }, [resetTurnTracking]);

  const handleRematch = useCallback(() => {
    if (!initialGameStateRef.current) return;
    useGameStore.getState().setGameState(initialGameStateRef.current);
    prevPlayerIndexRef.current = -1;
    prevPhaseRef.current = "";
    resetTurnTracking();
    resetTimerState();
    setGameCanvasKey((k) => k + 1);
    setView("game");
  }, [resetTimerState, resetTurnTracking]);

  const handleResign = useCallback(() => {
    const state = useGameStore.getState().gameState;
    if (!state) return;
    const currentPlayer = state.players[state.current_player_index];
    if (!currentPlayer) return;
    // Mark the resigning player as defeated and find remaining active players
    const updatedPlayers = state.players.map((p) =>
      p.id === currentPlayer.id ? { ...p, is_defeated: true } : p
    );
    const survivors = updatedPlayers.filter((p) => !p.is_defeated);
    const winnerId = survivors.length === 1 ? survivors[0].id : -1;
    useGameStore.getState().setGameState({
      ...state,
      players: updatedPlayers,
      phase: "game_over",
      winner_id: winnerId,
    });
    setMenuOpen(false);
  }, []);

  const handleLoadGame = useCallback(
    async (name: string) => {
      try {
        await loadGameData();
        const raw = (await window.electronAPI!.loadGame(name)) as { state?: GameState } | null;
        if (!raw?.state) return;
        const state = ensureMatchId(raw.state, { saveSlotName: name });
        useGameStore.getState().setGameState(state);
        prevPlayerIndexRef.current = -1;
        prevPhaseRef.current = "";
        resetTurnTracking();
        resetTimerState();
        setGameCanvasKey((k) => k + 1);
        setView("game");
      } catch (e) {
        console.error("Failed to load save:", e);
      }
    },
    [resetTimerState, resetTurnTracking]
  );

  const handleDeleteSave = useCallback(async (name: string) => {
    try {
      if (window.electronAPI?.deleteSave) {
        await window.electronAPI.deleteSave(name);
      }
      setGameSaves((prev) => prev.filter((s) => s.name !== name));
    } catch {
      setGameSaves((prev) => prev.filter((s) => s.name !== name));
    }
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
    resetTimerState();
    flushSync(() => {
      setView("menu");
      setBuyMenuTile(null);
      setBannerVisible(false);
      setShowExitConfirm(false);
    });
    useGameStore.getState().clearGameState();
    // Refresh save list when returning to menu
    if (window.electronAPI?.listSaves) {
      window.electronAPI.listSaves().then(setGameSaves).catch(console.error);
    }
  }, [resetTimerState]);

  // ── Menu view ──────────────────────────────────────────────────────────
  if (view === "menu") {
    return (
      <MainMenu
        onNewGame={() => setView("setup")}
        onContinue={handleLoadGame}
        onMapEditor={() => setView("editor")}
        onAgentConfigurationAndAnalytics={() => setView("agentConfiguration")}
        onDeleteSave={handleDeleteSave}
        saves={gameSaves}
      />
    );
  }

  // ── Agent configuration & analytics (full-page) ───────────────────────
  if (view === "agentConfiguration") {
    return <AgentConfigurationAndAnalyticsPage onBack={() => setView("menu")} />;
  }

  // ── Setup view ─────────────────────────────────────────────────────────
  if (view === "setup") {
    return (
      <>
        <MatchSetup onMatchStart={handleMatchStart} onExit={() => setView("menu")} />
      </>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────
  if (view === "editor") {
    return (
      <Suspense
        fallback={
          <div
            className="min-h-screen flex items-center justify-center"
            style={{ background: "#f0ece0" }}
          >
            <div className="text-gray-500 text-lg">Loading editor...</div>
          </div>
        }
      >
        <MapEditor onClose={() => setView("menu")} />
      </Suspense>
    );
  }

  const isAiTurn = currentPlayer?.controller_type !== "human";
  const isCurrentAiFailure =
    !!aiTurnFailure &&
    !!gameState &&
    aiTurnFailure.matchId === gameState.match_id &&
    aiTurnFailure.playerId === currentPlayer?.id;
  const isAiProcessing =
    processingQueue ||
    ((isAiTurn && gameState?.phase === "action" && !isCurrentAiFailure) ?? false);
  const isHumanTurn = currentPlayer?.controller_type === "human" && gameState?.phase === "action";
  const isAnimating = useGameStore.getState().isAnimating;
  const aiFailureHelpText = (() => {
    const message = aiTurnFailure?.message ?? "";
    if (message.includes("budget") || message.includes("quota") || message.includes("429")) {
      return "Increase budget/quota or wait for usage to reset, then retry the turn.";
    }
    if (message.includes("Provider call failed")) {
      return "Check provider access, API key, network availability, or model settings, then retry the turn.";
    }
    if (message.includes("parsed as a JSON")) {
      return "The model replied, but not in valid command JSON. Retrying may work, or switch models if it repeats.";
    }
    if (message.includes("low-purpose turns")) {
      return "The model kept replying, but the turns were too weak or incomplete. Review the debug logs or try another model.";
    }
    return "Review the console/debug logs, then retry the turn or adjust model/provider settings.";
  })();

  // Bottom bar — hovered tile info
  const hoveredTileData =
    hoveredTile && gameState ? getTile(gameState, hoveredTile.x, hoveredTile.y) : null;
  const hoveredTerrainType = hoveredTileData?.terrain_type;
  const hoveredTerrainData = hoveredTerrainType ? getTerrainData(hoveredTerrainType) : null;

  // Faction header uses headerBg from shared team colors
  const TEAM_HEADER_BG: Record<number, string> = Object.fromEntries(
    TEAM_COLORS.map((c, i) => [i, c.headerBg])
  );

  // Game view
  return (
    <div className="h-screen flex flex-col" style={{ background: "#f0ece0" }}>
      {/* Top bar — faction-colored background, white text */}
      <header
        className={`h-14 shrink-0 flex items-center justify-between px-5 z-20 transition-colors ${TEAM_HEADER_BG[currentPlayer?.team ?? 0] ?? "bg-gray-700"}`}
      >
        {/* Left side — player number + name + day + AI indicator */}
        <div className="flex items-center gap-4">
          {currentPlayer && (
            <div className="leading-tight">
              <div className="text-white font-black text-base tracking-wide uppercase leading-none">
                Player {currentPlayer.id + 1}
              </div>
              <div className="text-white/60 text-xs mt-0.5 uppercase tracking-widest">
                Day {gameState?.turn_number ?? 1}
              </div>
            </div>
          )}
          {isAiProcessing && (
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <span className="inline-block w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
              <span className="text-white/90 text-xs font-medium uppercase tracking-wider">
                AI Turn
              </span>
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Turn timer */}
          {(gameState?.turn_time_limit ?? 0) > 0 && isHumanTurn && timeRemaining !== null && (
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono text-base font-bold tabular-nums ${timeRemaining < 10 ? "text-white animate-pulse" : "text-white/80"}`}
              >
                {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
              </span>
              <button
                onClick={() => (timerPaused ? resumeTimer() : pauseTimer())}
                title={timerPaused ? "Resume timer" : "Pause timer"}
                className="text-white/60 hover:text-white transition-colors text-xs px-1"
              >
                {timerPaused ? "▶" : "⏸"}
              </button>
            </div>
          )}
          {/* Menu button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold text-base px-5 py-2 rounded transition-colors"
            >
              ≡ Menu
            </button>
            {menuOpen && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-xl absolute top-full right-0 mt-1 w-44 z-50 overflow-hidden">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Resume
                </button>
                {isHumanTurn && !isAnimating && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (currentPlayer) {
                        useGameStore.getState().submitCommand({
                          type: "END_TURN",
                          player_id: currentPlayer.id,
                        });
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex justify-between"
                  >
                    <span>End Turn</span>
                    <span className="text-gray-400 text-xs">E</span>
                  </button>
                )}
                <div className="border-t border-gray-100 my-0.5" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowAgentConfigurationModal(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Agent config ⚙
                </button>
                {window.electronAPI && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleQuickSave();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Save Game
                  </button>
                )}
                <div className="border-t border-gray-100 my-0.5" />
                {isHumanTurn && gameState?.phase === "action" && (
                  <button
                    onClick={() => {
                      setShowResignConfirm(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50 transition-colors"
                  >
                    Resign
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowExitConfirm(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50 transition-colors"
                >
                  Exit Game
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main game area */}
        <main className="flex-1 relative overflow-hidden">
          {/* Concave corner: faction color fills top-right, dark inner div with rounded-tr carves the curve */}
          <div
            className={`absolute top-0 right-0 w-8 h-8 pointer-events-none z-10 transition-colors ${TEAM_HEADER_BG[currentPlayer?.team ?? 0] ?? "bg-gray-700"}`}
          >
            <div className="w-full h-full rounded-tr-2xl" style={{ background: "#f0ece0" }} />
          </div>
          <GameCanvas key={gameCanvasKey} onFacilityClick={handleFacilityClick} />
          <ActionMenu />

          {isCurrentAiFailure && aiTurnFailure && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
              <div className="bg-white/95 border border-red-200 rounded-2xl shadow-lg backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-red-500">AI turn paused</div>
                    <div className="text-sm text-gray-700 mt-1">
                      Player {aiTurnFailure.playerId + 1} could not complete its LLM turn.
                    </div>
                    <div className="text-xs text-gray-500 mt-2 break-words">
                      {aiTurnFailure.message}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">{aiFailureHelpText}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowAgentConfigurationModal(true)}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Agent config
                    </button>
                    <button
                      onClick={() => clearAiTurnFailure()}
                      className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors"
                    >
                      Retry turn
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI thinking overlay */}
          {isAiProcessing && (
            <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-6 z-10">
              <div className="bg-white/95 border border-gray-200 rounded-full px-5 py-2.5 text-sm text-gray-700 font-medium flex items-center gap-2.5 backdrop-blur-sm shadow-md">
                <span className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                AI is thinking&hellip;
              </div>
            </div>
          )}

          {/* Save feedback toast */}
          {saveFeedback && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <div className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-700 shadow-sm">
                {saveFeedback}
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar */}
        <aside
          className={`w-80 bg-white border-l-4 flex flex-col shrink-0 overflow-y-auto transition-colors ${TEAM_BORDER[currentPlayer?.team ?? 0] ?? "border-gray-200"}`}
        >
          <InfoPanel />
          <TileInfoPanel />
          <div className="flex-1" />
          <ActionLog />
          {/* Zoom controls */}
          <div className="shrink-0 flex items-center justify-center gap-1 px-4 py-2 border-t border-gray-100">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= getMinZoom()}
              title="Zoom Out (-)"
              className="w-8 h-8 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded text-gray-600 font-bold text-lg transition-colors flex items-center justify-center"
            >
              −
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom (0)"
              className="h-8 px-3 bg-gray-100 hover:bg-gray-200 rounded text-gray-500 text-xs font-mono transition-colors flex items-center justify-center"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= MAX_ZOOM}
              title="Zoom In (+)"
              className="w-8 h-8 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded text-gray-600 font-bold text-lg transition-colors flex items-center justify-center"
            >
              +
            </button>
          </div>
        </aside>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 h-9 flex items-center px-4 gap-5 bg-white border-t border-gray-200 text-sm">
        {hoveredTile ? (
          <>
            <span className="text-gray-400 font-mono text-xs">
              POS{" "}
              <span className="text-gray-700 font-bold">
                {String(hoveredTile.x).padStart(2, "0")} · {String(hoveredTile.y).padStart(2, "0")}
              </span>
            </span>
            {hoveredTerrainData && (
              <>
                <span className="text-gray-700 font-semibold text-sm">
                  {hoveredTerrainData.name}
                </span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${i < hoveredTerrainData.defense_stars ? "bg-amber-400" : "bg-gray-200"}`}
                    />
                  ))}
                  <span className="text-gray-400 text-xs ml-1">Def</span>
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-gray-400 text-xs font-mono">Hover a tile</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-gray-400 text-xs font-mono">
          {isHumanTurn && (
            <span>
              <span className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 mr-1">
                E
              </span>
              End Turn
            </span>
          )}
          <span>
            <span className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 mr-1">
              ESC
            </span>
            Deselect
          </span>
        </div>
      </div>

      {/* Buy menu modal */}
      {buyMenuTile && (
        <BuyMenu facilityX={buyMenuTile.x} facilityY={buyMenuTile.y} onClose={handleCloseBuyMenu} />
      )}

      {/* Agent configuration & analytics (compact modal) */}
      {showAgentConfigurationModal && (
        <AgentConfigurationAndAnalyticsModal
          onClose={() => setShowAgentConfigurationModal(false)}
        />
      )}

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <ConfirmDialog
          title="Exit Game?"
          message="Any moves made this turn will be lost. The game was autosaved at the start of this turn."
          confirmLabel="Exit"
          cancelLabel="Keep Playing"
          onConfirm={handleExitGame}
          onCancel={() => setShowExitConfirm(false)}
          variant="destructive"
        />
      )}

      {showResignConfirm && (
        <ConfirmDialog
          title="Resign?"
          message="This will forfeit the match. Your opponent will be declared the winner."
          confirmLabel="Resign"
          onConfirm={() => {
            setShowResignConfirm(false);
            handleResign();
          }}
          onCancel={() => setShowResignConfirm(false)}
          variant="destructive"
        />
      )}

      {/* Turn transition overlay */}
      <TurnTransitionOverlay
        visible={bannerVisible && gameState?.phase !== "game_over"}
        playerName={bannerText ?? ""}
        dayNumber={gameState?.turn_number ?? 1}
        team={bannerTeam}
        isHumanTurn={isHumanTurn}
      />

      {/* Victory screen — persistent until dismissed */}
      {gameState?.phase === "game_over" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl px-14 py-12 text-center min-w-[360px]">
            {/* Decorative top line */}
            <div
              className={`h-[3px] w-full rounded-full mb-8 ${
                gameState.winner_id >= 0
                  ? (["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500"][
                      gameState.players.find((p) => p.id === gameState.winner_id)?.team ?? 0
                    ] ?? "bg-amber-500")
                  : "bg-slate-600"
              }`}
            />

            <p className="text-gray-400 tracking-[0.35em] text-xs uppercase mb-3">Game Over</p>

            {gameState.winner_id >= 0 ? (
              <>
                <h2
                  className={`text-5xl font-black tracking-wider uppercase mb-2 ${
                    ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"][
                      gameState.players.find((p) => p.id === gameState.winner_id)?.team ?? 0
                    ] ?? "text-amber-400"
                  }`}
                >
                  Player {gameState.winner_id + 1}
                </h2>
                <p className="text-gray-500 tracking-widest text-sm uppercase mb-8">Wins!</p>
              </>
            ) : (
              <>
                <h2 className="text-5xl font-black tracking-wider uppercase mb-2 text-gray-400">
                  Draw
                </h2>
                <p className="text-gray-400 text-sm uppercase tracking-widest mb-8">No winner</p>
              </>
            )}

            <div className="flex gap-3 justify-center">
              {initialGameStateRef.current && (
                <button
                  onClick={handleRematch}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-lg transition-colors"
                >
                  Rematch
                </button>
              )}
              <button
                onClick={() => {
                  useGameStore.getState().clearGameState?.();
                  setView("menu");
                }}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-lg transition-colors"
              >
                Main Menu
              </button>
            </div>

            {/* Decorative bottom line */}
            <div className="h-[3px] w-full rounded-full mt-8 bg-gray-100" />
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
