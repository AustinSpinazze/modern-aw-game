import { useEffect, useRef } from "react";
import type { GameState } from "../game/types";

export interface SavedGameFile {
  version: number;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
  state: GameState;
}

/**
 * Auto-saves the game via the Electron API whenever the turn number changes.
 *
 * Tracks the previous turn number with a ref and writes an "autosave" file
 * through `window.electronAPI.saveGame` each time it detects a new turn.
 * No-ops gracefully when there is no game state, the view is not "game",
 * or the Electron API is unavailable (i.e. running in a browser).
 *
 * @param gameState - The current game state, or null if no match is active.
 * @param view - The current application view (e.g. "menu", "game").
 */
export function useAutoSave(
  gameState: GameState | null,
  view: string
): { resetTurnTracking: () => void } {
  const prevTurnNumberRef = useRef<number>(-1);

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

  return {
    resetTurnTracking: () => {
      prevTurnNumberRef.current = -1;
    },
  };
}
