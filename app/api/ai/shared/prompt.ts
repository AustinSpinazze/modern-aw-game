// Shared AI prompt builder for all providers.

import type { GameState } from "../../../../src/game/types";
import { getCurrentPlayer, getUnitsByOwner, getTile } from "../../../../src/game/game-state";
import { getTerrainData, getUnitData } from "../../../../src/game/data-loader";
import { getReachableTiles, getAttackableTiles } from "../../../../src/game/pathfinding";
import { canAttack } from "../../../../src/game/combat";
import { getUnitAt } from "../../../../src/game/game-state";

export function buildAiPrompt(state: GameState, playerId: number): string {
  const currentPlayer = getCurrentPlayer(state);
  const myUnits = getUnitsByOwner(state, playerId);

  const unitSummaries = myUnits
    .filter((u) => !u.is_loaded)
    .map((u) => {
      const ud = getUnitData(u.unit_type);
      const tile = getTile(state, u.x, u.y);
      const terrain = tile ? getTerrainData(tile.terrain_type) : null;
      const reachable = u.has_moved ? [] : getReachableTiles(state, u);
      const attackable = u.has_acted ? [] : getAttackableTiles(state, u, u.x, u.y, 0);
      const enemies = attackable
        .map((pos) => getUnitAt(state, pos.x, pos.y))
        .filter((e) => e && e.owner_id !== playerId)
        .map((e) => e!);

      return {
        id: u.id,
        type: u.unit_type,
        pos: { x: u.x, y: u.y },
        hp: u.hp,
        moved: u.has_moved,
        acted: u.has_acted,
        terrain: terrain?.name ?? tile?.terrain_type ?? "unknown",
        reachable_count: reachable.length,
        attack_targets: enemies.map((e) => ({ id: e.id, type: e.unit_type, hp: e.hp, x: e.x, y: e.y })),
      };
    });

  const enemySummaries = state.players
    .filter((p) => p.id !== playerId && !p.is_defeated)
    .flatMap((p) =>
      getUnitsByOwner(state, p.id)
        .filter((u) => !u.is_loaded)
        .map((u) => ({ id: u.id, type: u.unit_type, owner: p.id, x: u.x, y: u.y, hp: u.hp }))
    );

  const myPlayer = state.players.find((p) => p.id === playerId);
  const properties = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const td = getTerrainData(tile.terrain_type);
      if (td?.is_property) {
        properties.push({ x, y, type: tile.terrain_type, owner: tile.owner_id });
      }
    }
  }

  const stateForAi = {
    turn: state.turn_number,
    my_player_id: playerId,
    my_funds: myPlayer?.funds ?? 0,
    my_units: unitSummaries,
    enemies: enemySummaries,
    properties,
    map_size: { w: state.map_width, h: state.map_height },
  };

  return `You are an AI playing a turn-based tactics game (Advance Wars style). Analyze the game state and return a JSON array of commands for player ${playerId}.

RULES:
1. Each command must be valid given the current state
2. Units with moved=true cannot MOVE again; units with acted=true cannot ATTACK/CAPTURE/etc.
3. Your LAST command must be {"type": "END_TURN", "player_id": ${playerId}}
4. Return ONLY a valid JSON array. No explanation outside the array.

STRATEGY TIPS:
- Capture properties (income = 1000/turn per property)
- Protect your HQ — if an enemy captures it, you lose
- Use terrain for defense (forests/cities give defense stars)
- Infantry/mech/engineer units can capture; vehicles fight
- Attack weakened enemies for efficient kills

CURRENT STATE:
${JSON.stringify(stateForAi, null, 2)}

COMMAND FORMAT EXAMPLES:
[
  {"type": "MOVE", "player_id": ${playerId}, "unit_id": 1, "dest_x": 5, "dest_y": 3},
  {"type": "ATTACK", "player_id": ${playerId}, "attacker_id": 1, "target_id": 10, "weapon_index": 0},
  {"type": "CAPTURE", "player_id": ${playerId}, "unit_id": 2},
  {"type": "WAIT", "player_id": ${playerId}, "unit_id": 3},
  {"type": "BUY_UNIT", "player_id": ${playerId}, "unit_type": "infantry", "facility_x": 2, "facility_y": 2},
  {"type": "END_TURN", "player_id": ${playerId}}
]

Respond with your command array:`;
}
