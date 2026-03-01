// Local HTTP LLM provider (Ollama etc.) — calls /api/ai/heuristic with local URL.

import type { AIProvider } from "./types";
import type { GameState, GameCommand } from "../game/types";
import { useConfigStore } from "../store/config-store";

export class LocalHttpAI implements AIProvider {
  readonly providerName = "LocalHTTP";

  isConfigured(): boolean {
    return !!useConfigStore.getState().localHttpUrl;
  }

  async requestTurn(state: GameState, playerId: number): Promise<GameCommand[]> {
    const { localHttpUrl } = useConfigStore.getState();

    const res = await fetch("/api/ai/heuristic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameState: state, playerId, localHttpUrl }),
    });

    if (!res.ok) throw new Error(`Local HTTP AI error: ${res.status}`);

    const data = await res.json() as { commands: GameCommand[] };
    return data.commands;
  }
}
