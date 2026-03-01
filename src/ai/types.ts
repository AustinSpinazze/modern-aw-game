// AI provider interface

import type { GameState, GameCommand } from "../game/types";

export interface AIProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  requestTurn(state: GameState, playerId: number): Promise<GameCommand[]>;
}
