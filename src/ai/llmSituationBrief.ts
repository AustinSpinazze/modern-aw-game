/**
 * Briefing Generator — transforms TacticalAnalysis + game state into an LLM-readable
 * strategic situation brief. No scores, no bundle IDs — just board state described
 * in human-readable strategic terms.
 */

import type { GameState } from "../game/types";
import type { TacticalAnalysis } from "./tacticalAnalysis";
import type { ExecutionReport } from "./llmTurnPlan";

const MAX_BRIEF_CHARS = 16000;

export function buildSituationBrief(
  state: GameState,
  playerId: number,
  analysis: TacticalAnalysis,
  previousReport: ExecutionReport | null
): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "ERROR: Player not found";

  const allUnits = Object.values(state.units);
  const myUnits = allUnits.filter((u) => u.owner_id === playerId && !u.is_loaded);
  const enemyUnits = allUnits.filter((u) => u.owner_id !== playerId && !u.is_loaded);

  // Count income (owned cities + hq)
  let ownedProperties = 0;
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = state.tiles[y]?.[x];
      if (tile && tile.owner_id === playerId) {
        ownedProperties++;
      }
    }
  }
  const incomeEstimate = ownedProperties * 1000;

  const sections: string[] = [];

  // Section 1: Game State
  const gameStateParts: string[] = [
    `Turn: ${state.turn_number}`,
    `Player: ${playerId}`,
    `Funds: ${player.funds}`,
    `Income (est): ${incomeEstimate} (${ownedProperties} properties)`,
    `My units: ${myUnits.length}`,
    `Enemy units: ${enemyUnits.length}`,
  ];
  if (analysis.productionNeeds.armyDeficit >= 3) {
    gameStateParts.push(
      `*** OUTNUMBERED by ${analysis.productionNeeds.armyDeficit} units — prioritize production ***`
    );
  }
  sections.push("=== GAME STATE ===\n" + gameStateParts.join("\n"));

  // Section 2: Fronts
  if (analysis.frontBalance.length > 0) {
    const frontLines = analysis.frontBalance.map((front) => {
      const statusStr =
        front.status === "strong" ? "STRONG" : front.status === "weak" ? "WEAK" : "EVEN";
      return `${front.front.toUpperCase()} front: ${statusStr} (my value: ${front.myValue}, enemy value: ${front.enemyValue})\n  Recommendation: ${front.recommendation}`;
    });
    sections.push("=== FRONTS ===\n" + frontLines.join("\n"));
  }

  // Section 3: Active Captures
  if (analysis.captureCommitments.length > 0) {
    const captureLines = analysis.captureCommitments.map((c) => {
      const riskStr = c.abandonRisk !== "low" ? ` [${c.abandonRisk} abandon risk]` : "";
      return `Unit ${c.unitId} capturing ${c.propertyType} at (${c.x},${c.y}) — ${c.turnsToComplete} turns to complete${riskStr}`;
    });
    sections.push("=== ACTIVE CAPTURES ===\n" + captureLines.join("\n"));
  }

  // Section 4: Threats (before expansion — strategically critical)
  const threatLines: string[] = [];
  for (const fe of analysis.facilityEmergencies) {
    threatLines.push(
      `FACILITY EMERGENCY [${fe.severity}]: ${fe.terrainType} at (${fe.facilityX},${fe.facilityY}) — enemy unit ${fe.enemyUnitId} (${fe.enemyUnitType}) nearby. ${fe.recommendedResponse}`
    );
  }
  for (const ur of analysis.unitsAtRisk.slice(0, 4)) {
    threatLines.push(
      `AT RISK: Unit ${ur.unitId} — potential damage ${ur.potentialDamage}%, recommended: ${ur.recommendedAction}`
    );
  }
  for (const cd of analysis.captureDenialOpportunities.slice(0, 3)) {
    threatLines.push(
      `DENY CAPTURE [${cd.urgency}]: Enemy unit ${cd.enemyUnitId} (${cd.enemyUnitType}) capturing ${cd.propertyType} at (${cd.x},${cd.y})`
    );
  }
  for (const sr of analysis.supportRisks.slice(0, 3)) {
    threatLines.push(
      `UNSUPPORTED UNIT: Unit ${sr.unitId} (${sr.unitType}) at (${sr.x},${sr.y}) — ${sr.reason}`
    );
  }
  if (threatLines.length > 0) {
    sections.push("=== THREATS ===\n" + threatLines.join("\n"));
  }

  // Section 5: Combat Opportunities
  const combatLines: string[] = [];
  for (const hit of analysis.freeHits.slice(0, 5)) {
    combatLines.push(
      `FREE HIT: Unit ${hit.attackerId} can attack unit ${hit.targetId} for ~${hit.damage}% damage with no counter`
    );
  }
  for (const trade of analysis.goodTrades.slice(0, 5)) {
    combatLines.push(
      `GOOD TRADE: Unit ${trade.attackerId} attacks unit ${trade.targetId} — deal ${trade.damage}%, take ${trade.counterDamage}% (score: ${trade.tradeScore})`
    );
  }
  for (const opp of analysis.overextensionPunishOpportunities.slice(0, 3)) {
    combatLines.push(
      `OVEREXTENDED ENEMY: Unit ${opp.enemyUnitId} (${opp.enemyUnitType}) at (${opp.x},${opp.y}) — ${opp.reason}`
    );
  }
  if (combatLines.length > 0) {
    sections.push("=== COMBAT OPPORTUNITIES ===\n" + combatLines.join("\n"));
  }

  // Section 6: Expansion Targets (trimmed first when over limit)
  if (analysis.easyCaptures.length > 0) {
    const expansionLines = analysis.easyCaptures.slice(0, 6).map((ec) => {
      return `${ec.propertyType} at (${ec.destX},${ec.destY}) — unit ${ec.unitId} can reach in ${ec.turnsToReach} turn(s)`;
    });
    sections.push("=== EXPANSION TARGETS ===\n" + expansionLines.join("\n"));
  }

  // Section 7: Production
  const prodNeeds = analysis.productionNeeds;
  const prodLines: string[] = [];
  if (prodNeeds.needAirCounter) prodLines.push("Need air counter unit");
  if (prodNeeds.needFrontlineArmor) prodLines.push("Need frontline armor");
  if (prodNeeds.needInfantryWalls) prodLines.push("Need infantry walls");
  if (prodNeeds.factorySpendOpportunities > 0)
    prodLines.push(`${prodNeeds.factorySpendOpportunities} factory spend opportunity(ies)`);
  if (prodNeeds.blockedProductionTiles > 0)
    prodLines.push(`${prodNeeds.blockedProductionTiles} blocked production tile(s)`);
  if (prodNeeds.priorities.length > 0)
    prodLines.push("Priorities: " + prodNeeds.priorities.join(", "));
  if (analysis.productionNeeds.armyDeficit >= 3) {
    prodLines.push(
      `ARMY DEFICIT: ${analysis.productionNeeds.armyDeficit} fewer units than enemy — spend all funds`
    );
  }
  if (prodLines.length > 0) {
    prodLines.unshift(`Available funds: ${player.funds}`);
    sections.push("=== PRODUCTION ===\n" + prodLines.join("\n"));
  }

  // Section 8: Previous Turn
  if (previousReport) {
    const { plan, directiveFulfillment, summary } = previousReport;
    const fulfilled = directiveFulfillment.filter((d) => d.fulfilled).length;
    const total = directiveFulfillment.length;
    const unfulfilled = directiveFulfillment
      .filter((d) => !d.fulfilled)
      .map((d) => `  - [P${d.priority}] ${d.type}: ${d.reason}`)
      .join("\n");
    const prevLines = [
      `Previous strategy: ${plan.strategy}`,
      `Directives fulfilled: ${fulfilled}/${total}`,
    ];
    if (unfulfilled) {
      prevLines.push("Unfulfilled directives:");
      prevLines.push(unfulfilled);
    }
    prevLines.push(`Summary: ${summary}`);
    sections.push("=== PREVIOUS TURN ===\n" + prevLines.join("\n"));
  }

  // Assemble and enforce char limit
  const full = sections.join("\n\n");
  if (full.length <= MAX_BRIEF_CHARS) return full;

  // Trim from bottom sections first: production, then expansion targets
  const coreSections = sections.slice(0, 5); // game state, fronts, captures, expansion, combat
  const trimmed = coreSections.join("\n\n");
  if (trimmed.length <= MAX_BRIEF_CHARS) return trimmed;

  // Final fallback: hard truncate
  return trimmed.slice(0, MAX_BRIEF_CHARS);
}

export function buildStrategicSystemPrompt(playerId: number): string {
  return [
    `You are a strategic commander for player ${playerId} in a turn-based tactics game (Advance Wars style).`,
    "Analyze the situation briefing and produce a turn plan.",
    'Return ONLY JSON matching the schema: { "strategy": "...", "reasoning": "...", "directives": [...] }',
    "Strategy must be one of: aggressive_push, consolidate_and_counter, economic_expansion, defensive_retreat, capture_rush, tempo_trade",
    'Each directive: { "priority": 1-10, "type": "attack|capture|retreat|produce|screen|advance|hold|transport|merge|deny_capture", "reason": "...", optional fields: "unit_ids", "target_ids", "unit_type", "region", "protect_ids" }',
    "Lower priority number = more important.",
    "Max 8 directives.",
    "reasoning should be 1-3 sentences explaining the strategic situation.",
    "No prose. No markdown. No explanations outside the JSON.",
  ].join("\n");
}
