// Compact state serializer for LLM prompts.
// Produces a human-readable text summary instead of the full GameState JSON.

import type { GameState } from "../game/types";
import { getTerrainData } from "../game/data-loader";
import { getTile } from "../game/game-state";

export function serializeStateForLLM(state: GameState, playerId: number): string {
  const lines: string[] = [];

  // Header
  lines.push(`=== GAME STATE (Turn ${state.turn_number}) ===`);
  lines.push(`Map: ${state.map_width}x${state.map_height}`);
  lines.push(`Current player: ${playerId}`);
  lines.push("");

  // Players
  lines.push("--- PLAYERS ---");
  for (const player of state.players) {
    const marker = player.id === playerId ? " <YOU>" : "";
    lines.push(
      `Player ${player.id} (team ${player.team}): funds=${player.funds}${player.is_defeated ? " DEFEATED" : ""}${marker}`
    );
  }
  lines.push("");

  // Units
  lines.push("--- UNITS ---");
  const allUnits = Object.values(state.units).filter((u) => !u.is_loaded);
  for (const unit of allUnits) {
    const owner = unit.owner_id === playerId ? "YOURS" : `enemy(p${unit.owner_id})`;
    const statusParts: string[] = [];
    if (unit.has_moved) statusParts.push("moved");
    if (unit.has_acted) statusParts.push("acted");
    const status = statusParts.length > 0 ? ` [${statusParts.join(",")}]` : " [ready]";
    lines.push(
      `  Unit ${unit.id} ${unit.unit_type} @(${unit.x},${unit.y}) hp=${unit.hp} ${owner}${status}`
    );
  }
  lines.push("");

  // Properties (owned terrain tiles)
  lines.push("--- PROPERTIES ---");
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      if (!terrainData?.is_property) continue;

      let ownerStr: string;
      if (tile.owner_id === -1) {
        ownerStr = "neutral";
      } else if (tile.owner_id === playerId) {
        ownerStr = "YOURS";
      } else {
        ownerStr = `enemy(p${tile.owner_id})`;
      }

      const capStr =
        tile.capture_points < 20 ? ` cp=${tile.capture_points}/20` : "";
      lines.push(
        `  ${tile.terrain_type} @(${x},${y}) owner=${ownerStr}${capStr}`
      );
    }
  }
  lines.push("");

  // Available actions hint
  lines.push("--- YOUR UNITS THAT CAN STILL ACT ---");
  const yourUnits = allUnits.filter((u) => u.owner_id === playerId && !u.has_acted);
  if (yourUnits.length === 0) {
    lines.push("  (none — consider END_TURN)");
  } else {
    for (const unit of yourUnits) {
      const canMove = !unit.has_moved;
      lines.push(
        `  Unit ${unit.id} ${unit.unit_type} @(${unit.x},${unit.y}) hp=${unit.hp}${canMove ? " can-move" : " already-moved"}`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}
