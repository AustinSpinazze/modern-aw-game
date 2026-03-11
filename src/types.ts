// Shared application-level types (not game logic types).

export interface SavedGameMeta {
  name: string;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
}
