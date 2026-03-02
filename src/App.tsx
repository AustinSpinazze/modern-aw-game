import { useState, useCallback, useEffect, Component, type ReactNode } from "react";
import MatchSetup from "./components/MatchSetup";
import GameCanvas from "./components/GameCanvas";
import InfoPanel from "./components/InfoPanel";
import TileInfoPanel from "./components/TileInfoPanel";
import ActionMenu from "./components/ActionMenu";
import BuyMenu from "./components/BuyMenu";
import { useGameStore } from "./store/game-store";
import { useGame } from "./hooks/useGame";
import { loadGameData } from "./game/data-loader";

// AI turn runner
import { runHeuristicTurn } from "./ai/heuristic";

// Error boundary to catch render errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
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

function AppContent() {
  const [view, setView] = useState<AppView>("setup");
  const [buyMenuTile, setBuyMenuTile] = useState<{ x: number; y: number } | null>(null);

  const { gameState, currentPlayer, queueCommands, processingQueue } = useGame();

  // Handle AI turns
  useEffect(() => {
    if (!gameState || gameState.phase !== "action") return;
    if (!currentPlayer) return;
    if (currentPlayer.controller_type === "human") return;
    if (processingQueue) return; // Already processing

    // AI turn - run after a brief delay
    const timer = setTimeout(async () => {
      if (currentPlayer.controller_type === "heuristic") {
        const commands = runHeuristicTurn(gameState, currentPlayer.id);
        if (commands.length > 0) {
          queueCommands(commands);
        }
      }
      // TODO: Add LLM AI providers (anthropic, openai) when integrated
    }, 500);

    return () => clearTimeout(timer);
  }, [gameState, currentPlayer, processingQueue, queueCommands]);

  const handleMatchStart = useCallback(() => {
    setView("game");
  }, []);

  const handleFacilityClick = useCallback((x: number, y: number) => {
    setBuyMenuTile({ x, y });
  }, []);

  const handleCloseBuyMenu = useCallback(() => {
    setBuyMenuTile(null);
  }, []);

  const handleBackToSetup = useCallback(() => {
    // Change view FIRST to stop rendering game components
    setView("setup");
    setBuyMenuTile(null);
    // Then reset the store (components won't re-render since view changed)
    const store = useGameStore.getState();
    store.resetSelection();
    store.setGameState(null as any);
  }, []);

  if (view === "setup") {
    return <MatchSetup onMatchStart={handleMatchStart} />;
  }

  // Game view
  return (
    <div className="h-screen w-screen bg-gray-950 flex overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-700 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">Modern AW</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <InfoPanel />
          <TileInfoPanel />
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={handleBackToSetup}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm py-2 rounded transition-colors"
          >
            ← Back to Setup
          </button>
        </div>
      </aside>

      {/* Main game area */}
      <main className="flex-1 relative">
        <GameCanvas onFacilityClick={handleFacilityClick} />
        <ActionMenu />
      </main>

      {/* Buy menu modal */}
      {buyMenuTile && (
        <BuyMenu
          facilityX={buyMenuTile.x}
          facilityY={buyMenuTile.y}
          onClose={handleCloseBuyMenu}
        />
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
