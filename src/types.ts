/**
 * Cross-cutting **UI/app types** (e.g. Electron save metadata) — not part of `src/game/types`.
 */

export interface SavedGameMeta {
  name: string;
  savedAt: string;
  turnNumber: number;
  playerCount: number;
}
