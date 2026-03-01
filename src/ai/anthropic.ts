// Anthropic Claude AI provider — calls /api/ai/anthropic server route.

import type { AIProvider } from "./types";
import type { GameState, GameCommand } from "../game/types";
import { useConfigStore } from "../store/config-store";

export class AnthropicAI implements AIProvider {
  readonly providerName = "Anthropic";

  isConfigured(): boolean {
    return !!useConfigStore.getState().anthropicApiKey;
  }

  async requestTurn(state: GameState, playerId: number): Promise<GameCommand[]> {
    const { anthropicApiKey, anthropicModel } = useConfigStore.getState();

    const res = await fetch("/api/ai/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameState: state, playerId, apiKey: anthropicApiKey, model: anthropicModel }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API route error: ${res.status}`);
    }

    const data = await res.json() as { commands: GameCommand[] };
    return data.commands;
  }
}
