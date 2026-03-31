import { useEffect } from "react";
import { useGameStore } from "../store/game-store";
import { zoomIn, zoomOut, resetZoom, getZoomLevel } from "../rendering/pixi-app";

/**
 * Registers global keyboard shortcuts while the game view is active.
 *
 * Supported keys:
 * - **Escape** — cancel a pending move, or deselect the current unit.
 * - **E** — end the current human player's turn.
 * - **W** — wait with the selected unit after a pending move.
 * - **+ / =** — zoom in on the map.
 * - **- / _** — zoom out on the map.
 * - **0** — reset zoom to the default level.
 *
 * The listener is only attached when `view` equals `"game"` and is
 * automatically cleaned up on unmount or when `view` changes.
 *
 * @param view       - The current application view (e.g. `"game"`, `"menu"`).
 * @param setZoomLevel - Callback to sync React state with the current zoom level.
 */
export function useGameKeyboard(
  view: string,
  setZoomLevel: (level: number) => void,
): void {
  useEffect(() => {
    if (view !== "game") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in an input
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      )
        return;

      const store = useGameStore.getState();
      const state = store.gameState;
      if (!state) return;

      const player = state.players[state.current_player_index];
      const isHumanTurn = player?.controller_type === "human" && state.phase === "action";

      switch (e.key) {
        case "Escape":
          // Cancel pending move first, then deselect
          if (store.pendingMove) {
            store.cancelPendingMove();
          } else if (store.selectedUnit) {
            store.selectUnit(null);
          }
          break;

        case "e":
        case "E":
          // End turn (human only, not if selecting/pending)
          if (isHumanTurn && !store.isAnimating && !store.processingQueue) {
            store.submitCommand({ type: "END_TURN", player_id: player!.id });
          }
          break;

        case "w":
        case "W":
          // Wait with selected unit that has a pending move
          if (isHumanTurn && store.selectedUnit && store.pendingMove && !store.isAnimating) {
            store.startMoveAnimation({
              type: "WAIT",
              player_id: player!.id,
              unit_id: store.selectedUnit.id,
            });
          }
          break;

        case "+":
        case "=":
          zoomIn();
          break;

        case "-":
        case "_":
          zoomOut();
          break;

        case "0":
          resetZoom();
          setZoomLevel(getZoomLevel());
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);
}
