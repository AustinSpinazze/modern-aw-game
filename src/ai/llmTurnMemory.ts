/**
 * Cross-turn context for LLM players: formats executed commands so the next prompt
 * can reference what the model actually did (models have no memory unless we store it).
 */

import type { GameCommand } from "../game/types";
import type {
  CaptureCommitment,
  FrontBalance,
  TacticalAnalysis,
  TransportMission,
  UnitAtRisk,
} from "./tacticalAnalysis";

export interface LlmTurnMemoryState {
  turnNumber: number;
  executedCommands: string[];
  captureCommitments: Array<{
    unitId: number;
    x: number;
    y: number;
    turnsToComplete: number;
    abandonRisk: string;
  }>;
  transportMissions: Array<{
    transportId: number;
    status: string;
    objective?: string;
    reason: string;
  }>;
  frontAssignments: Array<{
    front: string;
    status: string;
    recommendation: string;
  }>;
  productionIntent: string[];
  retreatOrPreserve: Array<{
    unitId: number;
    recommendation: string;
    threatScore: number;
  }>;
}

export function summarizeCommand(c: GameCommand): string {
  switch (c.type) {
    case "MOVE":
      return `MOVE unit ${c.unit_id} → (${c.dest_x},${c.dest_y})`;
    case "ATTACK":
      return `ATTACK unit ${c.attacker_id} → enemy ${c.target_id} weapon_index=${c.weapon_index}`;
    case "CAPTURE":
      return `CAPTURE unit ${c.unit_id}`;
    case "BUY_UNIT":
      return `BUY ${c.unit_type} at facility (${c.facility_x},${c.facility_y})`;
    case "WAIT":
      return `WAIT unit ${c.unit_id}`;
    case "END_TURN":
      return "END_TURN";
    case "LOAD":
      return `LOAD unit ${c.unit_id} into transport ${c.transport_id}`;
    case "UNLOAD":
      return `UNLOAD transport ${c.transport_id} cargo[${c.unit_index}] → (${c.dest_x},${c.dest_y})`;
    case "MERGE":
      return `MERGE unit ${c.unit_id} into ${c.target_id}`;
    case "DIG_TRENCH":
      return `DIG_TRENCH unit ${c.unit_id} @(${c.target_x},${c.target_y})`;
    case "BUILD_FOB":
      return `BUILD_FOB unit ${c.unit_id} @(${c.target_x},${c.target_y})`;
    case "SELF_DESTRUCT":
      return `SELF_DESTRUCT unit ${c.unit_id}`;
    case "RESUPPLY":
      return `RESUPPLY support ${c.unit_id} → target ${c.target_id}`;
    case "SUBMERGE":
      return `SUBMERGE unit ${c.unit_id}`;
    case "SURFACE":
      return `SURFACE unit ${c.unit_id}`;
    case "HIDE":
      return `HIDE unit ${c.unit_id}`;
    case "UNHIDE":
      return `UNHIDE unit ${c.unit_id}`;
    default:
      return `${(c as GameCommand).type} ${JSON.stringify(c)}`;
  }
}

function toCommitmentMemory(
  commitments: CaptureCommitment[]
): LlmTurnMemoryState["captureCommitments"] {
  return commitments.slice(0, 5).map((c) => ({
    unitId: c.unitId,
    x: c.x,
    y: c.y,
    turnsToComplete: c.turnsToComplete,
    abandonRisk: c.abandonRisk,
  }));
}

function toTransportMemory(missions: TransportMission[]): LlmTurnMemoryState["transportMissions"] {
  return missions.slice(0, 4).map((m) => ({
    transportId: m.transportId,
    status: m.status,
    objective:
      m.objectiveX !== undefined && m.objectiveY !== undefined
        ? `(${m.objectiveX},${m.objectiveY})`
        : m.front,
    reason: m.reason,
  }));
}

function toFrontAssignments(fronts: FrontBalance[]): LlmTurnMemoryState["frontAssignments"] {
  return fronts.map((front) => ({
    front: front.front,
    status: front.status,
    recommendation: front.recommendation,
  }));
}

function toPreserveList(unitsAtRisk: UnitAtRisk[]): LlmTurnMemoryState["retreatOrPreserve"] {
  return unitsAtRisk.slice(0, 5).map((u) => ({
    unitId: u.unitId,
    recommendation: u.recommendedAction,
    threatScore: u.threatScore,
  }));
}

export function buildLlmTurnMemoryState(
  commands: GameCommand[],
  turnNumber: number,
  analysis: TacticalAnalysis
): LlmTurnMemoryState {
  return {
    turnNumber,
    executedCommands: commands.map(summarizeCommand),
    captureCommitments: toCommitmentMemory(analysis.captureCommitments),
    transportMissions: toTransportMemory(analysis.transportMissions),
    frontAssignments: toFrontAssignments(analysis.frontBalance),
    productionIntent: analysis.productionNeeds.priorities.slice(0, 4),
    retreatOrPreserve: toPreserveList(analysis.unitsAtRisk),
  };
}

/** Compact structured summary for the next LLM turn. */
export function renderLlmTurnMemorySummary(memory: LlmTurnMemoryState | null | undefined): string {
  if (!memory) return "";
  const lines: string[] = [];
  lines.push(
    `Last time you acted (game turn ${memory.turnNumber}), these commands actually executed:`
  );
  if (memory.executedCommands.length === 0) {
    lines.push("  (no commands recorded)");
  } else {
    memory.executedCommands.forEach((command, idx) => lines.push(`  ${idx + 1}. ${command}`));
  }
  if (memory.captureCommitments.length > 0) {
    lines.push("Continue these capture plans unless the board changed:");
    memory.captureCommitments.forEach((c) =>
      lines.push(
        `  unit ${c.unitId} @(${c.x},${c.y}) capture ETA=${c.turnsToComplete} abandon_risk=${c.abandonRisk}`
      )
    );
  }
  if (memory.transportMissions.length > 0) {
    lines.push("Transport missions:");
    memory.transportMissions.forEach((m) =>
      lines.push(
        `  transport ${m.transportId}: ${m.status}${m.objective ? ` -> ${m.objective}` : ""} (${m.reason})`
      )
    );
  }
  if (memory.frontAssignments.length > 0) {
    lines.push("Front status:");
    memory.frontAssignments.forEach((f) =>
      lines.push(`  ${f.front}: ${f.status} — ${f.recommendation}`)
    );
  }
  if (memory.productionIntent.length > 0) {
    lines.push("Production intent:");
    memory.productionIntent.forEach((p) => lines.push(`  ${p}`));
  }
  if (memory.retreatOrPreserve.length > 0) {
    lines.push("Units to preserve:");
    memory.retreatOrPreserve.forEach((u) =>
      lines.push(`  unit ${u.unitId}: ${u.recommendation} (threat=${u.threatScore})`)
    );
  }
  return lines.join("\n");
}
