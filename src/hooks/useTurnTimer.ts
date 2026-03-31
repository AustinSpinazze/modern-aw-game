/**
 * @file Per-turn countdown for timed matches; pauses when menus open, can auto–end turn.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { GameState } from "../game/types";
import { useGameStore } from "../store/game-store";

/** Parameters for the {@link useTurnTimer} hook. */
interface UseTurnTimerParams {
  /** Current game state, or null if no match is active. */
  gameState: GameState | null;
  /** Current application view (e.g. "game", "menu"). */
  view: string;
  /** Whether the menu overlay is currently open (pauses the timer). */
  menuOpen: boolean;
}

interface UseTurnTimerReturn {
  timeRemaining: number | null;
  turnStartTime: number | null;
  setTurnStartTime: (v: number | null) => void;
  timerPaused: boolean;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimerState: () => void;
  timeRemainingRef: React.MutableRefObject<number | null>;
  pendingCarryoverRef: React.MutableRefObject<Record<number, number>>;
  timerAutoEndedRef: React.MutableRefObject<boolean>;
}

/**
 * Manages the per-turn countdown timer for timed matches.
 *
 * Handles timer initialization when entering game view, countdown ticking,
 * auto-ending the turn when time expires, and pausing/resuming the timer
 * (e.g. when the menu overlay is open). Only counts down on human turns;
 * AI turns are ignored since the AI ends its own turn.
 *
 * Exposes refs (`timeRemainingRef`, `pendingCarryoverRef`, `timerAutoEndedRef`)
 * so that the turn-transition banner logic can read/write carryover banks and
 * the latest remaining time without stale closures.
 */
export function useTurnTimer({
  gameState,
  view,
  menuOpen,
}: UseTurnTimerParams): UseTurnTimerReturn {
  // ── State ──────────────────────────────────────────────────────────────
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null); // null = not yet ticking
  // Mirror of timeRemaining as a ref so the turn-change effect always reads the
  // latest value without needing it in the dependency array (avoids stale closure).
  const timeRemainingRef = useRef<number | null>(null);
  // Per-player carryover bank: seconds saved from ending a turn early.
  // Keyed by player ID so each player accumulates their own unused time.
  const pendingCarryoverRef = useRef<Record<number, number>>({});
  // Prevents the auto-end-turn from firing more than once per turn
  const timerAutoEndedRef = useRef(false);
  // Timer pause state
  const [timerPaused, setTimerPaused] = useState(false);
  const pausedAtRef = useRef<number | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────
  const resetTimerState = useCallback(() => {
    pausedAtRef.current = null;
    timeRemainingRef.current = null;
    pendingCarryoverRef.current = {};
    timerAutoEndedRef.current = false;
    setTimerPaused(false);
    setTimeRemaining(null);
    setTurnStartTime(null);
  }, []);

  const pauseTimer = useCallback(() => {
    if (pausedAtRef.current !== null) return; // already paused
    pausedAtRef.current = Date.now();
    setTimerPaused(true);
  }, []);

  const resumeTimer = useCallback(() => {
    if (pausedAtRef.current === null) return; // not paused
    const pauseDuration = Date.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    // Shift turnStartTime forward by however long we were paused so elapsed
    // time doesn't count the pause duration.
    setTurnStartTime((prev) => (prev !== null ? prev + pauseDuration : null));
    setTimerPaused(false);
  }, []);

  // ── Auto-pause timer while the menu dropdown is open ──────────────────
  useEffect(() => {
    if (view !== "game") return;
    if (menuOpen) {
      pauseTimer();
    } else {
      resumeTimer();
    }
  }, [menuOpen, view, pauseTimer, resumeTimer]);

  // ── Initialize timer when game view first loads (turn 1) ──────────────
  useEffect(() => {
    if (view !== "game" || !gameState) return;
    const limit = gameState.turn_time_limit ?? 0;
    if (limit <= 0) return;
    const player = gameState.players[gameState.current_player_index];
    if (player?.controller_type !== "human") return;
    timerAutoEndedRef.current = false;
    timeRemainingRef.current = null;
    pendingCarryoverRef.current = {};
    setTimeRemaining(null);
    setTurnStartTime(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]); // only fire when entering game view, not on every state update

  // ── Turn timer countdown ──────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || !turnStartTime || timerPaused) return;
    const limit = gameState.turn_time_limit ?? 0;
    if (limit <= 0) return;

    const currentPlayer = gameState.players[gameState.current_player_index];
    // Only count down on human turns — AI ends its own turn
    if (currentPlayer?.controller_type !== "human") return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
      const remaining = Math.max(0, limit - elapsed);
      timeRemainingRef.current = remaining;
      setTimeRemaining(remaining);
      if (remaining === 0 && !timerAutoEndedRef.current) {
        timerAutoEndedRef.current = true; // fire only once per turn
        const store = useGameStore.getState();
        if (!store.isAnimating && !store.processingQueue) {
          const player = gameState.players[gameState.current_player_index];
          if (player) {
            store.submitCommand({ type: "END_TURN", player_id: player.id });
          }
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState, turnStartTime, timerPaused]);

  return {
    timeRemaining,
    turnStartTime,
    setTurnStartTime,
    timerPaused,
    pauseTimer,
    resumeTimer,
    resetTimerState,
    timeRemainingRef,
    pendingCarryoverRef,
    timerAutoEndedRef,
  };
}
