/**
 * Engine-derived **legal MOVE destinations** for the LLM harness so models pick
 * `move_option` indices instead of inventing coordinates that fail validation.
 */

import type { GameState } from "../game/types";
import { getUnitData } from "../game/dataLoader";
import { getUnitAt } from "../game/gameState";
import { getReachableTiles } from "../game/pathfinding";
import { scoreTileForAiMove } from "./heuristic";
import type { TacticalAnalysis } from "./tacticalAnalysis";

const MAX_OPTIONS_PER_UNIT = 24;

export interface LegalMoveCatalog {
  /** unit_id → option index → destination */
  byUnit: Map<number, Map<number, { dest_x: number; dest_y: number }>>;
  /** Lines already indented for the state digest */
  lines: string[];
}

function visibilityForReachable(
  state: GameState,
  vis: boolean[][] | null
): boolean[][] | undefined {
  return state.fog_of_war ? (vis ?? undefined) : undefined;
}

/**
 * Top-N reachable empty tiles per unit that can still move, sorted by the same
 * tile score the heuristic AI uses.
 */
export function buildLegalMoveCatalog(
  state: GameState,
  playerId: number,
  vis: boolean[][] | null,
  analysis?: TacticalAnalysis | null
): LegalMoveCatalog {
  const byUnit = new Map<number, Map<number, { dest_x: number; dest_y: number }>>();
  const lines: string[] = [];
  const reachVis = visibilityForReachable(state, vis);

  const candidates = Object.values(state.units).filter(
    (u) => u.owner_id === playerId && !u.is_loaded && !u.has_moved && !u.has_acted
  );

  if (candidates.length === 0) {
    lines.push(
      "  (no units can MOVE this turn — act in place with CAPTURE/ATTACK/WAIT or END_TURN)"
    );
    return { byUnit, lines };
  }

  for (const unit of candidates) {
    const ud = getUnitData(unit.unit_type);
    if (!ud) continue;
    const openingAssignment = analysis?.openingCaptureAssignments.find(
      (assignment) => assignment.unitId === unit.id
    );
    const passiveCapturer = analysis?.passiveCapturerWarnings.find(
      (warning) => warning.unitId === unit.id
    );
    const purposeCommitment = analysis?.unitPurposeCommitments.find(
      (commitment) =>
        commitment.unitId === unit.id &&
        !commitment.holdPosition &&
        commitment.objectiveX !== undefined &&
        commitment.objectiveY !== undefined
    );
    const moveScoreOptions = {
      objectiveX:
        openingAssignment?.objectiveX ??
        passiveCapturer?.objectiveX ??
        purposeCommitment?.objectiveX,
      objectiveY:
        openingAssignment?.objectiveY ??
        passiveCapturer?.objectiveY ??
        purposeCommitment?.objectiveY,
      openingTurn: state.turn_number <= 4,
      avoidOwnedProduction: true,
    };

    const reachable = getReachableTiles(state, unit, reachVis);
    const scored: { x: number; y: number; score: number }[] = [];
    for (const pos of reachable) {
      if (getUnitAt(state, pos.x, pos.y)) continue;
      const score = scoreTileForAiMove(
        pos.x,
        pos.y,
        state,
        playerId,
        ud.can_capture ?? false,
        vis,
        moveScoreOptions
      );
      scored.push({ x: pos.x, y: pos.y, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_OPTIONS_PER_UNIT);

    if (top.length === 0) {
      lines.push(
        `  Unit ${unit.id} (${unit.unit_type}) @(${unit.x},${unit.y}): no empty reachable tile — WAIT or act in place.`
      );
      continue;
    }

    const optMap = new Map<number, { dest_x: number; dest_y: number }>();
    lines.push(
      `  Unit ${unit.id} (${unit.unit_type}) @(${unit.x},${unit.y}) — PREFERRED: {"type":"MOVE","player_id":${playerId},"unit_id":${unit.id},"move_option":N} with N in 0..${top.length - 1}:`
    );
    for (let i = 0; i < top.length; i++) {
      const t = top[i];
      optMap.set(i, { dest_x: t.x, dest_y: t.y });
      const tags: string[] = [];
      if (
        analysis?.easyCaptures.some(
          (capture) => capture.unitId === unit.id && capture.destX === t.x && capture.destY === t.y
        )
      ) {
        tags.push("captures");
      }
      const threat = analysis?.enemyThreatTiles[`${t.x},${t.y}`] ?? 0;
      if (threat === 0) tags.push("safe");
      else tags.push(threat >= 5 ? "exposed" : "contested");
      const front =
        t.x < state.map_width / 3 ? "west" : t.x >= (state.map_width * 2) / 3 ? "east" : "center";
      tags.push(`front=${front}`);
      lines.push(
        `    [${i}] → (${t.x},${t.y}) score=${Math.round(t.score)}${tags.length > 0 ? ` tags=${tags.join(",")}` : ""}`
      );
    }
    byUnit.set(unit.id, optMap);
  }

  if (byUnit.size === 0) {
    lines.length = 0;
    lines.push("  (could not build move options — use WAIT/ATTACK/CAPTURE/END_TURN)");
  }

  return { byUnit, lines };
}

/** Resolve `move_option` into `dest_x`/`dest_y` before engine validation. */
export function expandLlmMoveOptions(
  parsed: unknown[],
  catalog: LegalMoveCatalog,
  playerId: number
): unknown[] {
  return parsed.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const cmd = raw as Record<string, unknown>;
    if (cmd.type !== "MOVE" || cmd.player_id !== playerId) return raw;

    const uid = cmd.unit_id;
    const opt = cmd.move_option;
    if (typeof uid !== "number" || typeof opt !== "number") return raw;

    const unitOpts = catalog.byUnit.get(uid);
    const dest = unitOpts?.get(opt);
    if (!dest) return raw;

    return {
      type: "MOVE",
      player_id: playerId,
      unit_id: uid,
      dest_x: dest.dest_x,
      dest_y: dest.dest_y,
    };
  });
}
