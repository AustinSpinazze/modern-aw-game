import { applyCommand } from "../game/applyCommand";
import { calculateDamage, canAttack, canCounterattack } from "../game/combat";
import { getTerrainData, getUnitData } from "../game/dataLoader";
import { getTile, getUnitAt } from "../game/gameState";
import type { GameCommand, GameState, UnitState } from "../game/types";
import { validateCommand } from "../game/validators";
import { manhattanDistance } from "../game/pathfinding";
import { buildLegalMoveCatalog } from "./llmLegalMoves";
import type { TacticalAnalysis } from "./tacticalAnalysis";

export type DecisionRoute = "emergency" | "capture" | "combat" | "development";

export interface ActionBundle {
  id: string;
  kind:
    | "buy"
    | "attack"
    | "capture"
    | "move_attack"
    | "move_capture"
    | "move_wait"
    | "wait"
    | "end_turn";
  label: string;
  score: number;
  tags: string[];
  commands: GameCommand[];
  unitId?: number;
}

export interface ActionBundleCatalog {
  route: DecisionRoute;
  routeSummary: string[];
  bundles: ActionBundle[];
}

function estimateUnitValue(unit: UnitState): number {
  const data = getUnitData(unit.unit_type);
  return Math.round(((data?.cost ?? 0) * unit.hp) / 10);
}

function validateCommandList(state: GameState, commands: GameCommand[]): GameState | null {
  let simulated = state;
  for (const command of commands) {
    const result = validateCommand(command, simulated);
    if (!result.valid) return null;
    simulated = applyCommand(simulated, command);
  }
  return simulated;
}

function getOwnedProductionTiles(
  state: GameState,
  playerId: number
): Array<{ x: number; y: number; terrain: string }> {
  const tiles: Array<{ x: number; y: number; terrain: string }> = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      const terrain = tile ? getTerrainData(tile.terrain_type) : null;
      if (!tile || tile.owner_id !== playerId || !terrain?.can_produce?.length) continue;
      tiles.push({ x, y, terrain: tile.terrain_type });
    }
  }
  return tiles;
}

function nearestDistanceToAnyTile(
  x: number,
  y: number,
  tiles: Array<{ x: number; y: number }>
): number {
  if (tiles.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...tiles.map((tile) => manhattanDistance(x, y, tile.x, tile.y)));
}

function threatPressureWeight(unitType: string): number {
  switch (unitType) {
    case "md_tank":
      return 6;
    case "tank":
    case "anti_air":
      return 5;
    case "artillery":
    case "rocket":
    case "b_copter":
      return 4;
    case "recon":
    case "mech":
      return 3;
    case "infantry":
      return 1;
    default:
      return 2;
  }
}

function nearbyThreatCounterScore(unitType: string, threats: UnitState[]): number {
  let score = 0;
  for (const threat of threats) {
    switch (unitType) {
      case "tank":
        if (["anti_air", "recon", "artillery", "tank", "md_tank"].includes(threat.unit_type))
          score += 4;
        if (threat.unit_type === "b_copter") score -= 2;
        break;
      case "artillery":
        if (
          ["anti_air", "tank", "md_tank", "artillery", "infantry", "mech", "recon"].includes(
            threat.unit_type
          )
        )
          score += 3;
        if (threat.unit_type === "b_copter") score -= 3;
        break;
      case "anti_air":
        if (["b_copter", "fighter", "bomber", "stealth"].includes(threat.unit_type)) score += 5;
        if (["infantry", "mech", "recon"].includes(threat.unit_type)) score += 1;
        if (["tank", "md_tank", "artillery"].includes(threat.unit_type)) score -= 2;
        break;
      case "b_copter":
        if (["infantry", "mech", "artillery", "recon"].includes(threat.unit_type)) score += 3;
        if (threat.unit_type === "anti_air") score -= 8;
        if (threat.unit_type === "tank") score -= 1;
        break;
      case "infantry":
        if (["anti_air", "tank", "md_tank", "artillery", "b_copter"].includes(threat.unit_type))
          score -= 4;
        break;
      default:
        break;
    }
  }
  return score;
}

function buildRouteSummary(route: DecisionRoute, analysis: TacticalAnalysis): string[] {
  if (route === "emergency") {
    const lines: string[] = [];
    for (const emergency of analysis.facilityEmergencies.slice(0, 2)) {
      lines.push(
        `Protect ${emergency.terrainType} @(${emergency.facilityX},${emergency.facilityY}) from enemy ${emergency.enemyUnitType} ${emergency.enemyUnitId}.`
      );
    }
    for (const denial of analysis.captureDenialOpportunities.slice(0, 2)) {
      lines.push(
        `Deny capture by enemy ${denial.enemyUnitType} ${denial.enemyUnitId} on ${denial.propertyType} @(${denial.x},${denial.y}).`
      );
    }
    return lines.slice(0, 3);
  }

  if (route === "capture") {
    const lines: string[] = [];
    for (const commitment of analysis.captureCommitments.slice(0, 2)) {
      lines.push(
        `Continue capture with unit ${commitment.unitId} on ${commitment.propertyType} @(${commitment.x},${commitment.y}).`
      );
    }
    for (const capture of analysis.easyCaptures.slice(0, 2)) {
      lines.push(
        `Expand with unit ${capture.unitId} toward ${capture.propertyType} @(${capture.destX},${capture.destY}).`
      );
    }
    return lines.slice(0, 3);
  }

  if (route === "combat") {
    const lines: string[] = [];
    for (const hit of analysis.freeHits.slice(0, 2)) {
      lines.push(`Take free hit: unit ${hit.attackerId} into enemy ${hit.targetId}.`);
    }
    for (const trade of analysis.goodTrades.slice(0, 2)) {
      lines.push(`Trade up with unit ${trade.attackerId} into enemy ${trade.targetId}.`);
    }
    return lines.slice(0, 3);
  }

  return analysis.productionNeeds.priorities.slice(0, 3);
}

export function determineDecisionRoute(analysis: TacticalAnalysis): DecisionRoute {
  if (analysis.facilityEmergencies.length > 0) return "emergency";
  if (
    analysis.captureDenialOpportunities.some(
      (opportunity) => opportunity.responderUnitIds.length > 0
    )
  ) {
    return "emergency";
  }
  if (analysis.captureCommitments.length > 0 || analysis.easyCaptures.length > 0) return "capture";
  if (
    analysis.freeHits.length > 0 ||
    analysis.goodTrades.length > 0 ||
    analysis.supportedAttackOpportunities.length > 0
  ) {
    return "combat";
  }
  return "development";
}

function applyBuildOrderTemplate(bundles: ActionBundle[], analysis: TacticalAnalysis): void {
  const income = analysis.productionNeeds.incomeEstimate;
  const factoryCount = analysis.productionNeeds.factoryCount;
  const buyBundles = bundles.filter((b) => b.kind === "buy");
  if (buyBundles.length === 0) return;

  const infantryBuys = buyBundles.filter((b) => b.label.includes("BUY infantry"));
  const tankBuys = buyBundles.filter((b) => b.label.includes("BUY tank"));

  if (infantryBuys.length > 0) {
    infantryBuys[0].score += 30;
    infantryBuys[0].tags.push("template_infantry");
  }

  if (income >= 7000 && tankBuys.length > 0) {
    tankBuys[0].score += 25;
    tankBuys[0].tags.push("template_tank");
  }

  if (income >= 9000 && factoryCount >= 2 && infantryBuys.length >= 2) {
    infantryBuys[1].score += 20;
    infantryBuys[1].tags.push("template_infantry");
  }

  if (income >= 12000) {
    const flexBuys = buyBundles.filter(
      (b) =>
        b.label.includes("BUY b_copter") ||
        b.label.includes("BUY artillery") ||
        b.label.includes("BUY anti_air")
    );
    if (flexBuys.length > 0 && !flexBuys[0].tags.includes("counter")) {
      flexBuys[0].score += 15;
      flexBuys[0].tags.push("template_flex");
    }
  }
}

function addBuyBundles(
  bundles: ActionBundle[],
  nextId: () => string,
  state: GameState,
  playerId: number,
  analysis: TacticalAnalysis
): void {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.funds < 1000) return;
  const visibleEnemies = getVisibleEnemies(state, playerId, analysis);
  const visibleEnemyTypes = visibleEnemies.map((unit) => unit.unit_type);
  const enemyInfantryMass = visibleEnemyTypes.filter(
    (type) => type === "infantry" || type === "mech"
  ).length;
  const enemyAirThreat = visibleEnemyTypes.some((type) =>
    ["b_copter", "fighter", "bomber", "stealth"].includes(type)
  );
  const ownedProductionTiles = getOwnedProductionTiles(state, playerId);

  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      const terrain = tile ? getTerrainData(tile.terrain_type) : null;
      if (!tile || !terrain?.can_produce?.length || tile.owner_id !== playerId) continue;
      if (getUnitAt(state, x, y)) continue;

      const affordable = terrain.can_produce
        .map((unitType) => getUnitData(unitType))
        .filter((data): data is NonNullable<typeof data> => !!data && data.cost <= player.funds)
        .sort((a, b) => a.cost - b.cost);
      if (affordable.length === 0) continue;
      if (tile.terrain_type === "port" && analysis.productionNeeds.avoidSpeculativeNavalBuys)
        continue;
      const localThreats = visibleEnemies.filter(
        (unit) => manhattanDistance(unit.x, unit.y, x, y) <= 5
      );
      const facilityPressure = localThreats.reduce(
        (sum, unit) => sum + threatPressureWeight(unit.unit_type),
        0
      );
      const localAirThreat = localThreats.some((unit) =>
        ["b_copter", "fighter", "bomber", "stealth"].includes(unit.unit_type)
      );
      const localGroundPressure = localThreats.some((unit) =>
        ["anti_air", "tank", "md_tank", "artillery", "rocket", "recon", "mech"].includes(
          unit.unit_type
        )
      );

      const picks: string[] = [];
      const ownAA = analysis.productionNeeds.ownAirDefenseCount;
      const enemyAirCount = analysis.productionNeeds.visibleEnemyAirCount;
      if (ownAA < enemyAirCount) {
        if (terrain.can_produce.includes("anti_air")) picks.push("anti_air");
        if (terrain.can_produce.includes("fighter")) picks.push("fighter");
        if (terrain.can_produce.includes("missile")) picks.push("missile");
      }
      if (analysis.productionNeeds.needInfantryWalls && terrain.can_produce.includes("infantry")) {
        picks.push("infantry");
      }
      if (enemyInfantryMass >= 3 && terrain.can_produce.includes("artillery"))
        picks.push("artillery");
      if (localGroundPressure && terrain.can_produce.includes("tank")) picks.push("tank");
      if (localGroundPressure && terrain.can_produce.includes("artillery")) picks.push("artillery");
      if (terrain.can_produce.includes("tank")) picks.push("tank");
      if (terrain.can_produce.includes("artillery")) picks.push("artillery");
      if (terrain.can_produce.includes("b_copter")) picks.push("b_copter");
      if (picks.length === 0) {
        const fallback = affordable.find((data) => {
          if (
            analysis.productionNeeds.avoidSpeculativeTransportBuys &&
            ["apc", "t_copter", "lander", "black_boat"].includes(data.id)
          ) {
            return false;
          }
          if (
            analysis.productionNeeds.avoidSpeculativeNavalBuys &&
            ["submarine", "cruiser", "battleship", "carrier", "black_boat", "lander"].includes(
              data.id
            )
          ) {
            return false;
          }
          return true;
        });
        if (fallback) picks.push(fallback.id);
      }

      for (const unitType of [...new Set(picks)].slice(0, 2)) {
        const data = getUnitData(unitType);
        if (!data || data.cost > player.funds) continue;
        if (
          analysis.productionNeeds.avoidSpeculativeTransportBuys &&
          ["apc", "t_copter", "lander", "black_boat"].includes(unitType)
        ) {
          continue;
        }
        if (
          analysis.productionNeeds.avoidSpeculativeNavalBuys &&
          ["submarine", "cruiser", "battleship", "carrier", "black_boat", "lander"].includes(
            unitType
          )
        ) {
          continue;
        }
        const command: GameCommand = {
          type: "BUY_UNIT",
          player_id: playerId,
          unit_type: unitType,
          facility_x: x,
          facility_y: y,
        };
        if (!validateCommandList(state, [command])) continue;
        const tags = ["economy"];
        let score = 72;
        if (analysis.productionNeeds.factorySpendOpportunities > 0) score += 10;
        if (["anti_air", "fighter", "missile"].includes(unitType)) {
          if (ownAA === 0 && enemyAirCount > 0) {
            tags.push("counter");
            score += 45;
          } else if (ownAA < enemyAirCount && ownAA < 2) {
            tags.push("counter");
            score += 25;
          } else if (localAirThreat && ownAA < enemyAirCount) {
            tags.push("counter");
            score += 10;
          }
        }
        if (analysis.productionNeeds.needInfantryWalls && unitType === "infantry") {
          tags.push("capture");
          score += 20;
        }
        if (
          analysis.productionNeeds.needFrontlineArmor &&
          ["tank", "md_tank", "artillery", "b_copter"].includes(unitType)
        ) {
          tags.push("response");
          score += 24;
        }
        if (enemyInfantryMass >= 3 && ["tank", "artillery", "b_copter"].includes(unitType)) {
          tags.push("response");
          score += 18;
        }
        if (facilityPressure > 0) {
          const counterScore = nearbyThreatCounterScore(unitType, localThreats);
          if (counterScore > 0) {
            tags.push("local_counter");
            score += counterScore * 10 + Math.min(18, facilityPressure * 2);
          }
          if (counterScore < 0) {
            tags.push("locally_punished");
            score += counterScore * 10;
          }
        }
        if (ownedProductionTiles.length > 0) {
          const nearestProductionDist = nearestDistanceToAnyTile(x, y, ownedProductionTiles);
          if (
            nearestProductionDist <= 1 &&
            facilityPressure > 0 &&
            ["tank", "artillery", "anti_air"].includes(unitType)
          ) {
            tags.push("local_response");
            score += 14;
          }
        }
        const closeGroundArmor = localThreats.filter(
          (u) =>
            ["anti_air", "tank", "md_tank", "recon"].includes(u.unit_type) &&
            manhattanDistance(u.x, u.y, x, y) <= 3
        );
        if (closeGroundArmor.length > 0) {
          if (["tank", "md_tank"].includes(unitType)) {
            tags.push("emergency_counter");
            score += 35;
          }
          if (
            ["infantry", "mech"].includes(unitType) &&
            closeGroundArmor.some((u) => ["tank", "md_tank", "anti_air"].includes(u.unit_type))
          ) {
            score -= 20;
          }
          if (
            unitType === "artillery" &&
            closeGroundArmor.some((u) => manhattanDistance(u.x, u.y, x, y) <= 2)
          ) {
            score -= 15;
          }
        }
        const deficit = analysis.productionNeeds.armyDeficit;
        if (deficit >= 5) {
          score += 40;
          tags.push("army_deficit");
        } else if (deficit >= 3) {
          score += 25;
          tags.push("army_deficit");
        }
        addActionBundle(bundles, nextId, {
          kind: "buy",
          label: `BUY ${unitType} at (${x},${y})`,
          score,
          tags,
          commands: [command],
        });
      }
    }
  }
  applyBuildOrderTemplate(bundles, analysis);
}

function addResupplyAndMergeBundles(
  bundles: ActionBundle[],
  nextId: () => string,
  state: GameState,
  playerId: number
): void {
  const friendlyUnits = Object.values(state.units).filter(
    (unit) => unit.owner_id === playerId && !unit.is_loaded
  );

  for (const unit of friendlyUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData) continue;

    if (unitData.special_actions.includes("resupply") && !unit.has_acted) {
      for (const target of friendlyUnits) {
        if (target.id === unit.id) continue;
        const dist = manhattanDistance(unit.x, unit.y, target.x, target.y);
        if (dist > 1) continue;
        const targetData = getUnitData(target.unit_type);
        if (!targetData) continue;

        const resupplyCommand: GameCommand = {
          type: "RESUPPLY",
          player_id: playerId,
          unit_id: unit.id,
          target_id: target.id,
        };
        if (!validateCommandList(state, [resupplyCommand])) continue;

        let useful = false;
        if (unit.unit_type === "black_boat") {
          useful = target.hp < 10;
        } else {
          useful =
            (target.fuel !== undefined &&
              targetData.fuel !== undefined &&
              target.fuel < targetData.fuel) ||
            targetData.weapons.some(
              (weapon) => weapon.ammo > 0 && (target.ammo[weapon.id] ?? weapon.ammo) < weapon.ammo
            );
        }
        if (!useful) continue;

        addActionBundle(bundles, nextId, {
          kind: "wait",
          label: `RESUPPLY unit ${target.id} with ${unit.unit_type} ${unit.id}`,
          score: unit.unit_type === "black_boat" ? 78 : 70,
          tags: ["support", "resupply"],
          commands: [resupplyCommand],
          unitId: unit.id,
        });
      }
    }

    if (!unit.has_acted && unit.hp < 10) {
      for (const target of friendlyUnits) {
        if (target.id === unit.id) continue;
        if (target.unit_type !== unit.unit_type) continue;
        if (target.hp >= 10) continue;
        if (unit.x !== target.x || unit.y !== target.y) continue;

        const mergeCommand: GameCommand = {
          type: "MERGE",
          player_id: playerId,
          unit_id: unit.id,
          target_id: target.id,
        };
        if (!validateCommandList(state, [mergeCommand])) continue;

        addActionBundle(bundles, nextId, {
          kind: "wait",
          label: `MERGE unit ${unit.id} into unit ${target.id}`,
          score: 74,
          tags: ["preserve", "merge"],
          commands: [mergeCommand],
          unitId: unit.id,
        });
      }
    }
  }
}

function addActionBundle(
  bundles: ActionBundle[],
  nextId: () => string,
  bundle: Omit<ActionBundle, "id">
): void {
  bundles.push({ ...bundle, id: nextId() });
}

function isAllyOrSelf(state: GameState, playerId: number, otherId: number): boolean {
  if (playerId === otherId) return true;
  const player = state.players.find((entry) => entry.id === playerId);
  const other = state.players.find((entry) => entry.id === otherId);
  return !!player && !!other && player.team === other.team;
}

function getVisibleEnemies(
  state: GameState,
  playerId: number,
  analysis: TacticalAnalysis
): UnitState[] {
  return Object.values(state.units).filter((unit) => {
    if (unit.is_loaded || isAllyOrSelf(state, playerId, unit.owner_id)) return false;
    if (!analysis.visibility) return true;
    return analysis.visibility[unit.y]?.[unit.x] ?? false;
  });
}

function countAdjacentEnemies(
  state: GameState,
  playerId: number,
  analysis: TacticalAnalysis,
  x: number,
  y: number
): number {
  return getVisibleEnemies(state, playerId, analysis).filter(
    (enemy) => manhattanDistance(enemy.x, enemy.y, x, y) === 1
  ).length;
}

function countAdjacentAllies(
  state: GameState,
  playerId: number,
  unitId: number,
  x: number,
  y: number
): number {
  return Object.values(state.units).filter((unit) => {
    if (unit.id === unitId || unit.is_loaded || unit.owner_id !== playerId) return false;
    return manhattanDistance(unit.x, unit.y, x, y) === 1;
  }).length;
}

function isBadTrade(
  analysis: TacticalAnalysis,
  attackerId: number,
  targetId: number,
  weaponIndex: number,
  fromX: number,
  fromY: number
): boolean {
  return analysis.badTrades.some(
    (trade) =>
      trade.attackerId === attackerId &&
      trade.targetId === targetId &&
      trade.weaponIndex === weaponIndex &&
      trade.fromX === fromX &&
      trade.fromY === fromY
  );
}

function hasSupportedAttack(
  analysis: TacticalAnalysis,
  attackerId: number,
  targetId: number,
  fromX: number,
  fromY: number
): boolean {
  return analysis.supportedAttackOpportunities.some(
    (opportunity) =>
      opportunity.attackerId === attackerId &&
      opportunity.targetId === targetId &&
      opportunity.fromX === fromX &&
      opportunity.fromY === fromY
  );
}

function moveTagsForUnit(
  playerId: number,
  unit: UnitState,
  destX: number,
  destY: number,
  analysis: TacticalAnalysis,
  state: GameState
): { tags: string[]; score: number } {
  const tags = ["position"];
  let score = 20;
  let purposefulAdvance = false;
  const commitment = analysis.unitPurposeCommitments.find((entry) => entry.unitId === unit.id);
  if (commitment?.objectiveX !== undefined && commitment.objectiveY !== undefined) {
    const oldDistance = manhattanDistance(
      unit.x,
      unit.y,
      commitment.objectiveX,
      commitment.objectiveY
    );
    const newDistance = manhattanDistance(
      destX,
      destY,
      commitment.objectiveX,
      commitment.objectiveY
    );
    if (newDistance < oldDistance) {
      tags.push(commitment.purpose);
      score += 18 + (commitment.urgency === "high" ? 18 : commitment.urgency === "medium" ? 10 : 4);
      purposefulAdvance = true;
    }
  }

  const capture = analysis.easyCaptures.find(
    (entry) => entry.unitId === unit.id && entry.destX === destX && entry.destY === destY
  );
  if (capture) {
    tags.push("capture");
    score += 35;
    purposefulAdvance = true;
  }

  const denialResponder = analysis.captureDenialOpportunities.find((entry) =>
    entry.responderUnitIds.includes(unit.id)
  );
  if (denialResponder) {
    const oldDistance = manhattanDistance(unit.x, unit.y, denialResponder.x, denialResponder.y);
    const newDistance = manhattanDistance(destX, destY, denialResponder.x, denialResponder.y);
    if (newDistance < oldDistance) {
      tags.push("emergency");
      score += 40;
      purposefulAdvance = true;
    }
  }

  if (getTile(state, destX, destY) && analysis.enemyThreatTiles[`${destX},${destY}`] === 0) {
    tags.push("safe");
    score += 8;
  }

  const adjacentEnemies = countAdjacentEnemies(state, playerId, analysis, destX, destY);
  if (adjacentEnemies > 0) {
    tags.push("contact");
    score -= 42 * adjacentEnemies;
  }

  const adjacentAllies = countAdjacentAllies(state, playerId, unit.id, destX, destY);
  if (adjacentAllies > 0) {
    tags.push("supported");
    score += Math.min(18, adjacentAllies * 8);
  }

  const unitData = getUnitData(unit.unit_type);
  const isIndirect = !!unitData?.weapons.some((weapon) => weapon.min_range > 1);
  if (!isIndirect && adjacentEnemies > 0 && adjacentAllies === 0) {
    tags.push("unsupported_contact");
    score -= 34;
  }
  const retreat = analysis.retreatOpportunities.find((entry) => entry.unitId === unit.id);
  if (retreat) {
    const oldDistance = manhattanDistance(unit.x, unit.y, retreat.repairX, retreat.repairY);
    const newDistance = manhattanDistance(destX, destY, retreat.repairX, retreat.repairY);
    if (newDistance < oldDistance) {
      tags.push("retreat");
      score += 40;
      purposefulAdvance = true;
    }
  }

  const supportRisk = analysis.supportRisks.find((entry) => entry.unitId === unit.id);
  if (supportRisk) {
    if (adjacentAllies > 0) {
      tags.push("seek_support");
      score += 28;
      purposefulAdvance = true;
    }
    if (adjacentEnemies > 0) {
      score -= 28;
    }
  }

  if (isIndirect) {
    if (adjacentEnemies > 0) {
      tags.push("bad_indirect_exposure");
      score -= 120;
    }
    if (adjacentAllies === 0) {
      score -= 24;
    }
    const screenLane = analysis.indirectCoverageZones.find((zone) => zone.unitId === unit.id);
    if (screenLane) {
      const oldDistance = manhattanDistance(unit.x, unit.y, screenLane.screenX, screenLane.screenY);
      const newDistance = manhattanDistance(destX, destY, screenLane.screenX, screenLane.screenY);
      if (newDistance < oldDistance) {
        tags.push("screened_indirect");
        score += 26;
        purposefulAdvance = true;
      }
    }
  }

  if (adjacentEnemies > 0 && !purposefulAdvance) {
    tags.push("no_clear_contact_plan");
    score -= isIndirect ? 60 : 44;
  }

  return { tags, score };
}

function scoreAttackBundle(params: {
  unit: UnitState;
  enemy: UnitState;
  damage: number;
  counterDamage: number;
  fromX: number;
  fromY: number;
  analysis: TacticalAnalysis;
  weaponIndex: number;
  isMoveAttack: boolean;
}): { score: number; tags: string[]; skip: boolean } {
  const { unit, enemy, damage, counterDamage, fromX, fromY, analysis, weaponIndex, isMoveAttack } =
    params;
  const unitData = getUnitData(unit.unit_type);
  const tags = ["combat"];
  let score = damage * 4 - counterDamage * 2 + Math.round(estimateUnitValue(enemy) / 1000) * 5;
  if (isMoveAttack) score += 12;

  const finishOff = damage >= enemy.hp;
  const badTrade = isBadTrade(analysis, unit.id, enemy.id, weaponIndex, fromX, fromY);
  const denial = analysis.captureDenialOpportunities.find(
    (entry) => entry.enemyUnitId === enemy.id
  );
  const supported = hasSupportedAttack(analysis, unit.id, enemy.id, fromX, fromY);
  const freeHit = counterDamage === 0;

  const unsupportedFrontlineTrade =
    !supported &&
    !freeHit &&
    !finishOff &&
    !denial &&
    estimateUnitValue(unit) >= 6000 &&
    estimateUnitValue(enemy) >= estimateUnitValue(unit);
  const unsupportedMirrorArmorTrade =
    !supported &&
    !freeHit &&
    !finishOff &&
    !denial &&
    unit.unit_type === enemy.unit_type &&
    estimateUnitValue(unit) >= 6000;

  if (badTrade && !finishOff) {
    score -= 90;
    tags.push("bad_trade");
  }
  if (unitData?.can_capture && estimateUnitValue(enemy) >= 6000 && !finishOff && !denial) {
    return { score, tags, skip: true };
  }
  if (unsupportedMirrorArmorTrade) return { score, tags, skip: true };
  if (unsupportedFrontlineTrade) return { score, tags, skip: true };
  if (!supported && !freeHit && !finishOff && !denial) {
    if (counterDamage > 0 && estimateUnitValue(unit) >= 6000) return { score, tags, skip: true };
    score -= 45;
    tags.push("unsupported");
  }
  if (denial) {
    tags.push("emergency");
    score += 45;
  }
  if (supported) {
    tags.push("supported");
    score += 24;
  }
  if (freeHit) {
    tags.push("free_hit");
    score += 18;
  }
  if (finishOff) {
    tags.push("finish");
    score += 20;
  }
  const threshold = isMoveAttack ? 24 : 20;
  if (score < threshold && !denial && !finishOff) return { score, tags, skip: true };
  return { score, tags, skip: false };
}

export function buildActionBundleCatalog(
  state: GameState,
  playerId: number,
  analysis: TacticalAnalysis
): ActionBundleCatalog {
  const route = determineDecisionRoute(analysis);
  const bundles: ActionBundle[] = [];
  const moveCatalog = buildLegalMoveCatalog(state, playerId, analysis.visibility, analysis);
  let sequence = 1;
  const nextId = () => `B${sequence++}`;

  addBuyBundles(bundles, nextId, state, playerId, analysis);
  addResupplyAndMergeBundles(bundles, nextId, state, playerId);

  const readyUnits = Object.values(state.units).filter(
    (unit) => unit.owner_id === playerId && !unit.is_loaded && !unit.has_acted
  );
  const bundlesBeforeUnits = bundles.length;

  for (const unit of readyUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData) continue;
    const unitBundleCountBefore = bundles.length;

    const currentTile = getTile(state, unit.x, unit.y);
    const currentTerrain = currentTile ? getTerrainData(currentTile.terrain_type) : null;
    if (
      currentTerrain?.can_capture &&
      currentTile &&
      currentTile.owner_id !== playerId &&
      unitData.can_capture
    ) {
      const captureCommand: GameCommand = {
        type: "CAPTURE",
        player_id: playerId,
        unit_id: unit.id,
      };
      if (validateCommandList(state, [captureCommand])) {
        const continuing = analysis.captureCommitments.find((entry) => entry.unitId === unit.id);
        addActionBundle(bundles, nextId, {
          kind: "capture",
          label: `CAPTURE in place with unit ${unit.id} at (${unit.x},${unit.y})`,
          score: continuing ? 130 : 100,
          tags: ["capture", ...(continuing ? ["commitment"] : [])],
          commands: [captureCommand],
          unitId: unit.id,
        });
      }
    }

    for (const enemy of Object.values(state.units)) {
      if (enemy.owner_id === playerId || enemy.is_loaded) continue;
      if (!canAttack(unit, enemy, state)) continue;
      for (let weaponIndex = 0; weaponIndex < unitData.weapons.length; weaponIndex++) {
        const damage = calculateDamage(unit, enemy, state, weaponIndex).damage;
        if (damage <= 0) continue;
        const attackCommand: GameCommand = {
          type: "ATTACK",
          player_id: playerId,
          attacker_id: unit.id,
          target_id: enemy.id,
          weapon_index: weaponIndex,
        };
        if (!validateCommandList(state, [attackCommand])) continue;
        const counterDamage = canCounterattack(enemy, unit)
          ? Math.max(
              ...getUnitData(enemy.unit_type)!.weapons.map(
                (_, enemyWeaponIndex) =>
                  calculateDamage(enemy, unit, state, enemyWeaponIndex).damage
              )
            )
          : 0;
        const result = scoreAttackBundle({
          unit,
          enemy,
          damage,
          counterDamage,
          fromX: unit.x,
          fromY: unit.y,
          analysis,
          weaponIndex,
          isMoveAttack: false,
        });
        if (result.skip) continue;
        addActionBundle(bundles, nextId, {
          kind: "attack",
          label: `ATTACK enemy ${enemy.id} with unit ${unit.id} from (${unit.x},${unit.y})`,
          score: result.score,
          tags: result.tags,
          commands: [attackCommand],
          unitId: unit.id,
        });
      }
    }

    const moveOptions = moveCatalog.byUnit.get(unit.id);
    if (moveOptions) {
      for (const [, dest] of [...moveOptions.entries()].slice(0, 8)) {
        const moveCommand: GameCommand = {
          type: "MOVE",
          player_id: playerId,
          unit_id: unit.id,
          dest_x: dest.dest_x,
          dest_y: dest.dest_y,
        };
        const movedState = validateCommandList(state, [moveCommand]);
        if (!movedState) continue;
        const movedUnit = movedState.units[unit.id];
        if (!movedUnit) continue;

        const movedTile = getTile(movedState, dest.dest_x, dest.dest_y);
        const movedTerrain = movedTile ? getTerrainData(movedTile.terrain_type) : null;
        if (
          movedTerrain?.can_capture &&
          movedTile &&
          movedTile.owner_id !== playerId &&
          unitData.can_capture
        ) {
          const captureCommand: GameCommand = {
            type: "CAPTURE",
            player_id: playerId,
            unit_id: unit.id,
          };
          if (validateCommandList(movedState, [captureCommand])) {
            addActionBundle(bundles, nextId, {
              kind: "move_capture",
              label: `MOVE unit ${unit.id} to (${dest.dest_x},${dest.dest_y}) then CAPTURE`,
              score: 105,
              tags: ["capture"],
              commands: [moveCommand, captureCommand],
              unitId: unit.id,
            });
          }
        }

        for (const enemy of Object.values(movedState.units)) {
          if (enemy.owner_id === playerId || enemy.is_loaded) continue;
          if (!canAttack(movedUnit, enemy, movedState)) continue;
          for (let weaponIndex = 0; weaponIndex < unitData.weapons.length; weaponIndex++) {
            const damage = calculateDamage(movedUnit, enemy, movedState, weaponIndex).damage;
            if (damage <= 0) continue;
            const attackCommand: GameCommand = {
              type: "ATTACK",
              player_id: playerId,
              attacker_id: unit.id,
              target_id: enemy.id,
              weapon_index: weaponIndex,
            };
            if (!validateCommandList(movedState, [attackCommand])) continue;
            const counterDamage = canCounterattack(enemy, movedUnit)
              ? Math.max(
                  ...getUnitData(enemy.unit_type)!.weapons.map(
                    (_, enemyWeaponIndex) =>
                      calculateDamage(enemy, movedUnit, movedState, enemyWeaponIndex).damage
                  )
                )
              : 0;
            const tags = ["combat"];
            let score =
              damage * 4 - counterDamage * 2 + Math.round(estimateUnitValue(enemy) / 1000) * 5 + 12;
            const finishOff = damage >= enemy.hp;
            const badTrade = isBadTrade(
              analysis,
              unit.id,
              enemy.id,
              weaponIndex,
              dest.dest_x,
              dest.dest_y
            );
            const denial = analysis.captureDenialOpportunities.find(
              (entry) => entry.enemyUnitId === enemy.id
            );
            const supported = hasSupportedAttack(
              analysis,
              unit.id,
              enemy.id,
              dest.dest_x,
              dest.dest_y
            );
            const freeHit = counterDamage === 0;
            const unsupportedFrontlineTrade =
              !supported &&
              !freeHit &&
              !finishOff &&
              !denial &&
              estimateUnitValue(unit) >= 6000 &&
              estimateUnitValue(enemy) >= estimateUnitValue(unit);
            const unsupportedMirrorArmorTrade =
              !supported &&
              !freeHit &&
              !finishOff &&
              !denial &&
              unit.unit_type === enemy.unit_type &&
              estimateUnitValue(unit) >= 6000;
            if (badTrade && !finishOff) {
              score -= 90;
              tags.push("bad_trade");
            }
            if (unitData.can_capture && estimateUnitValue(enemy) >= 6000 && !finishOff && !denial) {
              continue;
            }
            if (unsupportedMirrorArmorTrade) continue;
            if (unsupportedFrontlineTrade) continue;
            if (!supported && !freeHit && !finishOff && !denial) {
              if (counterDamage > 0 && estimateUnitValue(unit) >= 6000) continue;
              score -= 45;
              tags.push("unsupported");
            }
            if (denial) {
              tags.push("emergency");
              score += 45;
            }
            if (supported) {
              tags.push("supported");
              score += 24;
            }
            if (freeHit) {
              tags.push("free_hit");
              score += 18;
            }
            if (finishOff) {
              tags.push("finish");
              score += 20;
            }
            if (score < 24 && !denial && !finishOff) continue;
            addActionBundle(bundles, nextId, {
              kind: "move_attack",
              label: `MOVE unit ${unit.id} to (${dest.dest_x},${dest.dest_y}) then ATTACK enemy ${enemy.id}`,
              score,
              tags,
              commands: [moveCommand, attackCommand],
              unitId: unit.id,
            });
          }
        }

        const { tags, score } = moveTagsForUnit(
          playerId,
          unit,
          dest.dest_x,
          dest.dest_y,
          analysis,
          state
        );
        if (score >= 32) {
          const waitCommand: GameCommand = { type: "WAIT", player_id: playerId, unit_id: unit.id };
          if (validateCommandList(movedState, [waitCommand])) {
            addActionBundle(bundles, nextId, {
              kind: "move_wait",
              label: `MOVE unit ${unit.id} to (${dest.dest_x},${dest.dest_y}) then WAIT`,
              score,
              tags,
              commands: [moveCommand, waitCommand],
              unitId: unit.id,
            });
          }
        }

        if (unitData.transport && movedUnit.cargo.length > 0 && !movedUnit.has_acted) {
          for (let unitIndex = 0; unitIndex < movedUnit.cargo.length; unitIndex++) {
            const cargoId = movedUnit.cargo[unitIndex];
            const cargoUnit = movedState.units[cargoId];
            if (!cargoUnit) continue;
            for (const [dx, dy] of [
              [0, -1],
              [1, 0],
              [0, 1],
              [-1, 0],
            ] as const) {
              const unloadX = dest.dest_x + dx;
              const unloadY = dest.dest_y + dy;
              const unloadCommand: GameCommand = {
                type: "UNLOAD",
                player_id: playerId,
                transport_id: unit.id,
                unit_index: unitIndex,
                dest_x: unloadX,
                dest_y: unloadY,
              };
              if (!validateCommandList(movedState, [unloadCommand])) continue;
              const simulated = validateCommandList(movedState, [unloadCommand]);
              if (!simulated) continue;
              const unloaded = simulated.units[cargoId];
              const tile = getTile(simulated, unloadX, unloadY);
              const terrain = tile ? getTerrainData(tile.terrain_type) : null;
              const captureReady =
                unloaded &&
                cargoUnit &&
                getUnitData(cargoUnit.unit_type)?.can_capture &&
                terrain?.can_capture &&
                tile?.owner_id !== playerId;
              addActionBundle(bundles, nextId, {
                kind: "move_wait",
                label: `MOVE transport ${unit.id} to (${dest.dest_x},${dest.dest_y}) then UNLOAD unit ${cargoId} at (${unloadX},${unloadY})`,
                score: captureReady ? 88 : 64,
                tags: ["transport", ...(captureReady ? ["capture"] : [])],
                commands: [moveCommand, unloadCommand],
                unitId: unit.id,
              });
            }
          }
        }
      }
    }

    if (unitData.transport && !unit.has_acted) {
      for (const cargoCandidate of readyUnits) {
        if (cargoCandidate.id === unit.id) continue;
        const loadCommand: GameCommand = {
          type: "LOAD",
          player_id: playerId,
          transport_id: unit.id,
          unit_id: cargoCandidate.id,
        };
        if (!validateCommandList(state, [loadCommand])) continue;
        const cargoData = getUnitData(cargoCandidate.unit_type);
        const mission = analysis.transportMissions.find((entry) => entry.transportId === unit.id);
        addActionBundle(bundles, nextId, {
          kind: "move_wait",
          label: `LOAD unit ${cargoCandidate.id} into transport ${unit.id}`,
          score: mission && mission.status !== "no_mission" ? 72 : 52,
          tags: ["transport", ...(cargoData?.can_capture ? ["capture"] : [])],
          commands: [loadCommand],
          unitId: unit.id,
        });
      }

      if (unit.cargo.length > 0) {
        for (let unitIndex = 0; unitIndex < unit.cargo.length; unitIndex++) {
          const cargoId = unit.cargo[unitIndex];
          const cargoUnit = state.units[cargoId];
          if (!cargoUnit) continue;
          for (const [dx, dy] of [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ] as const) {
            const unloadX = unit.x + dx;
            const unloadY = unit.y + dy;
            const unloadCommand: GameCommand = {
              type: "UNLOAD",
              player_id: playerId,
              transport_id: unit.id,
              unit_index: unitIndex,
              dest_x: unloadX,
              dest_y: unloadY,
            };
            if (!validateCommandList(state, [unloadCommand])) continue;
            const simulated = validateCommandList(state, [unloadCommand]);
            if (!simulated) continue;
            const tile = getTile(simulated, unloadX, unloadY);
            const terrain = tile ? getTerrainData(tile.terrain_type) : null;
            const captureReady =
              getUnitData(cargoUnit.unit_type)?.can_capture &&
              terrain?.can_capture &&
              tile?.owner_id !== playerId;
            addActionBundle(bundles, nextId, {
              kind: "move_wait",
              label: `UNLOAD unit ${cargoId} from transport ${unit.id} at (${unloadX},${unloadY})`,
              score: captureReady ? 84 : 60,
              tags: ["transport", ...(captureReady ? ["capture"] : [])],
              commands: [unloadCommand],
              unitId: unit.id,
            });
          }
        }
      }
    }

    if (bundles.length === unitBundleCountBefore) {
      const moveOptions = moveCatalog.byUnit.get(unit.id);
      const bestMove = moveOptions ? [...moveOptions.entries()][0] : null;
      if (bestMove) {
        const [, dest] = bestMove;
        const moveCommand: GameCommand = {
          type: "MOVE",
          player_id: playerId,
          unit_id: unit.id,
          dest_x: dest.dest_x,
          dest_y: dest.dest_y,
        };
        const movedState = validateCommandList(state, [moveCommand]);
        if (movedState) {
          const waitCommand: GameCommand = { type: "WAIT", player_id: playerId, unit_id: unit.id };
          if (validateCommandList(movedState, [waitCommand])) {
            addActionBundle(bundles, nextId, {
              kind: "move_wait",
              label: `MOVE unit ${unit.id} to (${dest.dest_x},${dest.dest_y}) then WAIT`,
              score: 28,
              tags: ["fallback", "position"],
              commands: [moveCommand, waitCommand],
              unitId: unit.id,
            });
            continue;
          }
        }
      }

      const waitCommand: GameCommand = { type: "WAIT", player_id: playerId, unit_id: unit.id };
      if (validateCommandList(state, [waitCommand])) {
        addActionBundle(bundles, nextId, {
          kind: "wait",
          label: `WAIT in place with unit ${unit.id} at (${unit.x},${unit.y})`,
          score: 10,
          tags: ["fallback", "wait"],
          commands: [waitCommand],
          unitId: unit.id,
        });
      }
    }
  }

  if (bundles.length === bundlesBeforeUnits && readyUnits.length > 0) {
    const fallbackUnit = readyUnits[0];
    if (fallbackUnit) {
      const waitCommand: GameCommand = {
        type: "WAIT",
        player_id: playerId,
        unit_id: fallbackUnit.id,
      };
      if (validateCommandList(state, [waitCommand])) {
        addActionBundle(bundles, nextId, {
          kind: "wait",
          label: `WAIT in place with unit ${fallbackUnit.id} at (${fallbackUnit.x},${fallbackUnit.y})`,
          score: 5,
          tags: ["fallback", "wait"],
          commands: [waitCommand],
          unitId: fallbackUnit.id,
        });
      }
    }
  }

  bundles.push({
    id: nextId(),
    kind: "end_turn",
    label: "END TURN",
    score: -10,
    tags: ["end"],
    commands: [{ type: "END_TURN", player_id: playerId }],
  });

  const routeWeight = (bundle: ActionBundle): number => {
    if (route === "emergency" && bundle.tags.includes("emergency")) return 1000;
    if (route === "capture" && bundle.tags.includes("capture")) return 800;
    if (route === "combat" && bundle.tags.includes("combat")) return 700;
    if (
      route === "development" &&
      (bundle.tags.includes("position") || bundle.tags.includes("economy"))
    )
      return 500;
    return 0;
  };

  bundles.sort(
    (a, b) => routeWeight(b) + b.score - (routeWeight(a) + a.score) || a.id.localeCompare(b.id)
  );

  const MAX_BUNDLES = 50;
  const readyUnitIds = new Set(
    Object.values(state.units)
      .filter((u) => u.owner_id === playerId && !u.is_loaded && !u.has_acted)
      .map((u) => u.id)
  );
  const guaranteed: ActionBundle[] = [];
  const rest: ActionBundle[] = [];
  const seenUnits = new Set<number>();
  for (const bundle of bundles) {
    if (
      bundle.unitId !== undefined &&
      readyUnitIds.has(bundle.unitId) &&
      !seenUnits.has(bundle.unitId)
    ) {
      guaranteed.push(bundle);
      seenUnits.add(bundle.unitId);
    } else {
      rest.push(bundle);
    }
  }
  const capped = [...guaranteed, ...rest].slice(0, MAX_BUNDLES);
  if (!capped.some((b) => b.kind === "end_turn")) {
    const endTurn = bundles.find((b) => b.kind === "end_turn");
    if (endTurn) capped.push(endTurn);
  }

  return {
    route,
    routeSummary: buildRouteSummary(route, analysis),
    bundles: capped,
  };
}
