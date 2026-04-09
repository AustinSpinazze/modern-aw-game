/**
 * Command serialization helpers: builds strongly-typed {@link GameCommand} objects from loose
 * `CommandDict` payloads (network, replays, AI JSON). Inverse of what logging / multiplayer send.
 */

import type { GameCommand, CommandDict } from "./types";

/** Parse a raw dictionary into a typed {@link GameCommand}, or `null` if unknown/invalid. */
export function commandFromDict(data: CommandDict): GameCommand | null {
  const type = data.type as string;
  const player_id = (data.player_id as number) ?? 0;
  const sequence = (data.sequence as number) ?? 0;

  switch (type) {
    case "MOVE":
      return {
        type: "MOVE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
        dest_x: data.dest_x as number,
        dest_y: data.dest_y as number,
      };
    case "ATTACK":
      return {
        type: "ATTACK",
        player_id,
        sequence,
        attacker_id: data.attacker_id as number,
        target_id: data.target_id as number,
        weapon_index: (data.weapon_index as number) ?? 0,
      };
    case "CAPTURE":
      return {
        type: "CAPTURE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    case "BUY_UNIT":
      return {
        type: "BUY_UNIT",
        player_id,
        sequence,
        unit_type: data.unit_type as string,
        facility_x: data.facility_x as number,
        facility_y: data.facility_y as number,
      };
    case "LOAD":
      return {
        type: "LOAD",
        player_id,
        sequence,
        transport_id: data.transport_id as number,
        unit_id: data.unit_id as number,
      };
    case "UNLOAD":
      return {
        type: "UNLOAD",
        player_id,
        sequence,
        transport_id: data.transport_id as number,
        unit_index: data.unit_index as number,
        dest_x: data.dest_x as number,
        dest_y: data.dest_y as number,
      };
    case "SELF_DESTRUCT":
      return {
        type: "SELF_DESTRUCT",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
        target_id: data.target_id as number,
      };
    case "WAIT":
      return {
        type: "WAIT",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    case "END_TURN":
      return { type: "END_TURN", player_id, sequence };
    case "RESUPPLY":
      return {
        type: "RESUPPLY",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
        target_id: data.target_id as number,
      };
    case "SUBMERGE":
      return {
        type: "SUBMERGE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    case "SURFACE":
      return {
        type: "SURFACE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    case "MERGE":
      return {
        type: "MERGE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
        target_id: data.target_id as number,
      };
    case "HIDE":
      return {
        type: "HIDE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    case "UNHIDE":
      return {
        type: "UNHIDE",
        player_id,
        sequence,
        unit_id: data.unit_id as number,
      };
    default:
      console.warn("Unknown command type:", type);
      return null;
  }
}

// Convert a typed command back to a plain dict
export function commandToDict(cmd: GameCommand): CommandDict {
  return cmd as unknown as CommandDict;
}
