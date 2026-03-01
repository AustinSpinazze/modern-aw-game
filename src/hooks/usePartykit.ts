"use client";
// Partykit WebSocket connection + command sync.

import { useEffect, useRef, useCallback } from "react";
import usePartySocket from "partysocket/react";
import { useGameStore } from "../store/game-store";
import type { GameCommand, GameState } from "../game/types";
import { stateFromDict } from "../game/game-state";

interface PartyMessage {
  type: "state_update" | "command" | "join";
  gameState?: unknown;
  command?: GameCommand;
  playerId?: number;
}

export function usePartykit(matchId: string | null, playerId: number) {
  const setGameState = useGameStore((s) => s.setGameState);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999",
    room: matchId ?? "lobby",
    onMessage: (event: MessageEvent) => {
      try {
        const msg: PartyMessage = JSON.parse(event.data as string);
        if (msg.type === "state_update" && msg.gameState) {
          const state = stateFromDict(msg.gameState);
          if (state) setGameState(state);
        }
      } catch {
        console.error("Failed to parse partykit message");
      }
    },
  });

  const sendCommand = useCallback(
    (cmd: GameCommand) => {
      socket.send(
        JSON.stringify({ type: "command", command: { ...cmd, player_id: playerId } })
      );
    },
    [socket, playerId]
  );

  return { sendCommand, socket };
}
