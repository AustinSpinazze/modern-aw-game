// OpenAI GPT provider — calls /api/ai/openai server route.

import type { AIProvider } from "./types";
import type { GameState, GameCommand } from "../game/types";
import { useConfigStore } from "../store/config-store";

export class OpenAIProvider implements AIProvider {
  readonly providerName = "OpenAI";

  isConfigured(): boolean {
    return !!useConfigStore.getState().openaiApiKey;
  }

  async requestTurn(state: GameState, playerId: number): Promise<GameCommand[]> {
    const { openaiApiKey, openaiModel } = useConfigStore.getState();

    const res = await fetch("/api/ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameState: state, playerId, apiKey: openaiApiKey, model: openaiModel }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API route error: ${res.status}`);
    }

    const data = await res.json() as { commands: GameCommand[] };
    return data.commands;
  }
}
