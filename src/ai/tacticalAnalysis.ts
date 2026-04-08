import type { GameState, UnitState } from "../game/types";
import { canAttack, calculateDamage, canCounterattack } from "../game/combat";
import { getUnitData, getTerrainData } from "../game/dataLoader";
import { getTile, getUnitAt } from "../game/gameState";
import { getAttackableTiles, getReachableTiles, manhattanDistance } from "../game/pathfinding";
import { computeVisibility } from "../game/visibility";

export type FrontId = "west" | "center" | "east";

export interface CaptureCommitment {
  unitId: number;
  x: number;
  y: number;
  propertyType: string;
  ownerId: number;
  capturePointsRemaining: number;
  turnsToComplete: number;
  threatScore: number;
  abandonRisk: "low" | "medium" | "high";
}

export interface EasyCapture {
  unitId: number;
  destX: number;
  destY: number;
  propertyType: string;
  turnsToReach: number;
  score: number;
}

export interface AttackOpportunity {
  attackerId: number;
  targetId: number;
  weaponIndex: number;
  fromX: number;
  fromY: number;
  damage: number;
  counterDamage: number;
  targetValue: number;
  attackerValue: number;
  front: FrontId;
  finishOff: boolean;
  freeHit: boolean;
  tradeScore: number;
}

export interface BadTrade {
  attackerId: number;
  targetId: number;
  weaponIndex: number;
  fromX: number;
  fromY: number;
  damage: number;
  counterDamage: number;
  reason: string;
}

export interface FrontBalance {
  front: FrontId;
  myValue: number;
  enemyValue: number;
  enemyPressure: number;
  status: "strong" | "even" | "weak";
  recommendation: string;
}

export interface ProductionNeeds {
  needAirCounter: boolean;
  needFrontlineArmor: boolean;
  needInfantryWalls: boolean;
  desiredInfantryCount: number;
  tooManyTransports: boolean;
  avoidSpeculativeTransportBuys: boolean;
  avoidSpeculativeNavalBuys: boolean;
  techUpAllowed: boolean;
  preserveUnits: boolean;
  factorySpendOpportunities: number;
  blockedProductionTiles: number;
  armyDeficit: number;
  ownAirDefenseCount: number;
  visibleEnemyAirCount: number;
  incomeEstimate: number;
  factoryCount: number;
  ownTankCount: number;
  ownHeavyArmorCount: number;
  enemyHeavyArmorCount: number;
  ownBCopterCount: number;
  enemyAntiAirCount: number;
  priorities: string[];
}

export interface TransportMission {
  transportId: number;
  status: "pickup" | "contest_property" | "reinforce_front" | "no_mission";
  objectiveX?: number;
  objectiveY?: number;
  cargoUnitId?: number;
  front?: FrontId;
  score: number;
  reason: string;
}

export interface UnitAtRisk {
  unitId: number;
  potentialDamage: number;
  threatScore: number;
  recommendedAction: "retreat" | "merge" | "screen";
}

export interface RetreatOpportunity {
  unitId: number;
  x: number;
  y: number;
  repairX: number;
  repairY: number;
  terrainType: string;
  turnsToReach: number;
  reason: string;
}

export interface MergeOpportunity {
  unitId: number;
  targetUnitId: number;
  unitType: string;
  targetX: number;
  targetY: number;
  combinedHp: number;
  reason: string;
}

export interface FacilityEmergency {
  facilityX: number;
  facilityY: number;
  terrainType: string;
  severity: "critical" | "high";
  enemyUnitId: number;
  enemyUnitType: string;
  distance: number;
  blockingFriendlyUnitId?: number;
  recommendedResponse: string;
}

export interface IdleRearUnit {
  unitId: number;
  x: number;
  y: number;
  front: FrontId;
  objectiveX: number;
  objectiveY: number;
  recommendedFront: FrontId;
  distanceToNearestEnemy: number;
  reason: string;
}

export interface DeadProductionTrap {
  x: number;
  y: number;
  terrainType: string;
  producedUnitTypes: string[];
  reason: string;
}

export interface UnitPurposeCommitment {
  unitId: number;
  purpose: string;
  objectiveX?: number;
  objectiveY?: number;
  holdPosition: boolean;
  urgency: "high" | "medium" | "low";
}

export interface CaptureDenialOpportunity {
  enemyUnitId: number;
  enemyUnitType: string;
  x: number;
  y: number;
  propertyType: string;
  capturePointsRemaining: number;
  responderUnitIds: number[];
  urgency: "critical" | "high";
}

export interface OverextensionPunishOpportunity {
  enemyUnitId: number;
  enemyUnitType: string;
  x: number;
  y: number;
  terrainType: string;
  responderUnitIds: number[];
  supportDistance: number;
  reason: string;
}

export interface SupportRisk {
  unitId: number;
  unitType: string;
  x: number;
  y: number;
  nearbySupportCount: number;
  nearestEnemyDistance: number;
  threatScore: number;
  reason: string;
}

export interface WallIntegrityRisk {
  unitId: number;
  x: number;
  y: number;
  protectsUnitId?: number;
  protectsFacility?: string;
  nearestEnemyDistance: number;
  reason: string;
}

export interface SupportedAttackOpportunity {
  attackerId: number;
  targetId: number;
  fromX: number;
  fromY: number;
  supportCount: number;
  reason: string;
}

export interface IndirectCoverageZone {
  unitId: number;
  unitType: string;
  x: number;
  y: number;
  front: FrontId;
  screenX: number;
  screenY: number;
  reason: string;
}

export interface LaneControlObjective {
  x: number;
  y: number;
  front: FrontId;
  terrainType: string;
  reason: string;
}

export interface PassiveCapturerWarning {
  unitId: number;
  x: number;
  y: number;
  objectiveX: number;
  objectiveY: number;
  reason: string;
}

export interface TacticalAnalysis {
  playerId: number;
  visibility: boolean[][] | null;
  captureCommitments: CaptureCommitment[];
  easyCaptures: EasyCapture[];
  goodTrades: AttackOpportunity[];
  freeHits: AttackOpportunity[];
  badTrades: BadTrade[];
  enemyThreatTiles: Record<string, number>;
  safeAttackTiles: Record<string, number>;
  terrainAttackEdges: BadTrade[];
  frontBalance: FrontBalance[];
  productionNeeds: ProductionNeeds;
  transportMissions: TransportMission[];
  unitsAtRisk: UnitAtRisk[];
  retreatOpportunities: RetreatOpportunity[];
  mergeOpportunities: MergeOpportunity[];
  facilityEmergencies: FacilityEmergency[];
  idleRearUnits: IdleRearUnit[];
  deadProductionTraps: DeadProductionTrap[];
  unitPurposeCommitments: UnitPurposeCommitment[];
  openingCaptureAssignments: Array<{
    unitId: number;
    objectiveX: number;
    objectiveY: number;
    propertyType: string;
    reason: string;
  }>;
  captureDenialOpportunities: CaptureDenialOpportunity[];
  overextensionPunishOpportunities: OverextensionPunishOpportunity[];
  supportRisks: SupportRisk[];
  wallIntegrityRisks: WallIntegrityRisk[];
  supportedAttackOpportunities: SupportedAttackOpportunity[];
  indirectCoverageZones: IndirectCoverageZone[];
  laneControlObjectives: LaneControlObjective[];
  passiveCapturerWarnings: PassiveCapturerWarning[];
}

function isAllyOrSelf(state: GameState, playerId: number, otherId: number): boolean {
  if (playerId === otherId) return true;
  const p = state.players.find((pl) => pl.id === playerId);
  const o = state.players.find((pl) => pl.id === otherId);
  return !!p && !!o && p.team === o.team;
}

function getVisibleEnemies(
  state: GameState,
  playerId: number,
  vis: boolean[][] | null
): UnitState[] {
  return Object.values(state.units).filter((u) => {
    if (u.is_loaded || isAllyOrSelf(state, playerId, u.owner_id)) return false;
    if (!vis) return true;
    return vis[u.y]?.[u.x] ?? false;
  });
}

function getOwnUnits(state: GameState, playerId: number): UnitState[] {
  return Object.values(state.units).filter((u) => u.owner_id === playerId && !u.is_loaded);
}

function getUnitValue(unit: UnitState): number {
  return getUnitData(unit.unit_type)?.cost ?? 0;
}

function getFrontForX(mapWidth: number, x: number): FrontId {
  const third = mapWidth / 3;
  if (x < third) return "west";
  if (x >= third * 2) return "east";
  return "center";
}

function getTerrainDefenseAt(state: GameState, x: number, y: number, unit: UnitState): number {
  const tile = getTile(state, x, y);
  if (!tile) return 0;
  const unitData = getUnitData(unit.unit_type);
  if (!unitData || unitData.domain === "air") return 0;
  const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
  let stars = terrain?.defense_stars ?? 0;
  if (tile.has_trench && unitData.tags.includes("infantry_class")) stars += 2;
  return stars;
}

function addThreat(threatTiles: Record<string, number>, x: number, y: number, amount: number) {
  const key = `${x},${y}`;
  threatTiles[key] = Math.max(threatTiles[key] ?? 0, amount);
}

function isProductionTile(state: GameState, x: number, y: number, playerId: number): boolean {
  const tile = getTile(state, x, y);
  if (!tile || tile.owner_id !== playerId) return false;
  const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
  return (terrain?.can_produce?.length ?? 0) > 0;
}

function getOwnProductionTiles(
  state: GameState,
  playerId: number
): Array<{ x: number; y: number; terrainType: string; producedUnitTypes: string[] }> {
  const result: Array<{ x: number; y: number; terrainType: string; producedUnitTypes: string[] }> =
    [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
      if ((terrain?.can_produce?.length ?? 0) === 0) continue;
      result.push({
        x,
        y,
        terrainType: tile.terrain_type,
        producedUnitTypes: terrain!.can_produce,
      });
    }
  }
  return result;
}

function getFrontAnchor(state: GameState, front: FrontId): { x: number; y: number } {
  const y = Math.floor(state.map_height / 2);
  if (front === "west") return { x: Math.max(0, Math.floor(state.map_width / 6)), y };
  if (front === "east")
    return { x: Math.min(state.map_width - 1, Math.floor((state.map_width * 5) / 6)), y };
  return { x: Math.floor(state.map_width / 2), y };
}

function getExpandableProperties(
  state: GameState,
  playerId: number
): Array<{ x: number; y: number; propertyType: string; ownerId: number }> {
  const result: Array<{ x: number; y: number; propertyType: string; ownerId: number }> = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
      if (!terrain?.can_capture) continue;
      if (isAllyOrSelf(state, playerId, tile.owner_id)) continue;
      result.push({ x, y, propertyType: tile.terrain_type, ownerId: tile.owner_id });
    }
  }
  return result;
}

function getEnemyFocusTarget(
  state: GameState,
  playerId: number,
  enemies: UnitState[],
  weakFront?: FrontId
): { x: number; y: number; front: FrontId } {
  if (enemies.length > 0) {
    const sx = enemies.reduce((sum, enemy) => sum + enemy.x, 0);
    const sy = enemies.reduce((sum, enemy) => sum + enemy.y, 0);
    const x = Math.round(sx / enemies.length);
    const y = Math.round(sy / enemies.length);
    return { x, y, front: getFrontForX(state.map_width, x) };
  }

  if (weakFront) {
    const anchor = getFrontAnchor(state, weakFront);
    return { ...anchor, front: weakFront };
  }

  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.terrain_type !== "hq" || isAllyOrSelf(state, playerId, tile.owner_id))
        continue;
      return { x, y, front: getFrontForX(state.map_width, x) };
    }
  }

  const x = Math.floor(state.map_width / 2);
  const y = Math.floor(state.map_height / 2);
  return { x, y, front: getFrontForX(state.map_width, x) };
}

function getOwnedHq(state: GameState, playerId: number): { x: number; y: number } | null {
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (tile?.terrain_type === "hq" && tile.owner_id === playerId) return { x, y };
    }
  }
  return null;
}

function countNavalExits(state: GameState, x: number, y: number): number {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let exits = 0;
  for (const [dx, dy] of dirs) {
    const tile = getTile(state, x + dx, y + dy);
    if (!tile) continue;
    const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
    if (!terrain) continue;
    if ((terrain.movement_costs.ship ?? -1) >= 0 || (terrain.movement_costs.trans ?? -1) >= 0) {
      exits++;
    }
  }
  return exits;
}

function getCheapestProducibleCost(producedUnitTypes: string[]): number | null {
  let best: number | null = null;
  for (const unitType of producedUnitTypes) {
    const cost = getUnitData(unitType)?.cost;
    if (typeof cost !== "number") continue;
    if (best === null || cost < best) best = cost;
  }
  return best;
}

function countCoastalProperties(
  state: GameState,
  playerId: number
): { ownPorts: number; enemyPorts: number; neutralPorts: number } {
  let ownPorts = 0;
  let enemyPorts = 0;
  let neutralPorts = 0;
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.terrain_type !== "port") continue;
      if (tile.owner_id === playerId) ownPorts++;
      else if (tile.owner_id === -1) neutralPorts++;
      else enemyPorts++;
    }
  }
  return { ownPorts, enemyPorts, neutralPorts };
}

function estimateCounterDamage(
  attacker: UnitState,
  defender: UnitState,
  state: GameState,
  weaponIndex: number
): number {
  const { damage } = calculateDamage(attacker, defender, state, weaponIndex);
  if (damage >= defender.hp) return 0;
  const defenderAfter = { ...defender, hp: defender.hp - damage };
  if (!canCounterattack(defenderAfter, attacker)) return 0;
  const defenderData = getUnitData(defender.unit_type);
  if (!defenderData) return 0;
  let best = 0;
  for (let wi = 0; wi < defenderData.weapons.length; wi++) {
    if (!canAttack(defenderAfter, attacker, state, wi)) continue;
    const { damage: counter } = calculateDamage(defenderAfter, attacker, state, wi, true);
    best = Math.max(best, counter);
  }
  return best;
}

function getBaseMatchupDamage(attacker: UnitState, defender: UnitState): number {
  const attackerData = getUnitData(attacker.unit_type);
  if (!attackerData) return 0;
  let best = 0;
  for (const weapon of attackerData.weapons) {
    best = Math.max(best, weapon.damage_table[defender.unit_type] ?? 0);
  }
  return best;
}

function canUnitRepairAt(unit: UnitState, terrainType: string): boolean {
  const unitData = getUnitData(unit.unit_type);
  if (!unitData) return false;
  if (unitData.domain === "air") return terrainType === "airport";
  if (unitData.domain === "sea") return terrainType === "port";
  return terrainType === "city" || terrainType === "factory" || terrainType === "hq";
}

export function analyzeTacticalState(
  state: GameState,
  playerId: number,
  vis: boolean[][] | null = computeVisibility(state, playerId)
): TacticalAnalysis {
  const ownUnits = getOwnUnits(state, playerId);
  const visibleEnemies = getVisibleEnemies(state, playerId, vis);
  const captureCommitments: CaptureCommitment[] = [];
  const easyCaptures: EasyCapture[] = [];
  const goodTrades: AttackOpportunity[] = [];
  const freeHits: AttackOpportunity[] = [];
  const badTrades: BadTrade[] = [];
  const enemyThreatTiles: Record<string, number> = {};
  const safeAttackTiles: Record<string, number> = {};
  const terrainAttackEdges: BadTrade[] = [];
  const unitsAtRisk: UnitAtRisk[] = [];
  const retreatOpportunities: RetreatOpportunity[] = [];
  const mergeOpportunities: MergeOpportunity[] = [];
  const facilityEmergencies: FacilityEmergency[] = [];
  const idleRearUnits: IdleRearUnit[] = [];
  const deadProductionTraps: DeadProductionTrap[] = [];
  const unitPurposeCommitments: UnitPurposeCommitment[] = [];
  const openingCaptureAssignments: TacticalAnalysis["openingCaptureAssignments"] = [];
  const captureDenialOpportunities: CaptureDenialOpportunity[] = [];
  const overextensionPunishOpportunities: OverextensionPunishOpportunity[] = [];
  const supportRisks: SupportRisk[] = [];
  const wallIntegrityRisks: WallIntegrityRisk[] = [];
  const supportedAttackOpportunities: SupportedAttackOpportunity[] = [];
  const indirectCoverageZones: IndirectCoverageZone[] = [];
  const laneControlObjectives: LaneControlObjective[] = [];
  const passiveCapturerWarnings: PassiveCapturerWarning[] = [];

  for (const enemy of visibleEnemies) {
    const enemyData = getUnitData(enemy.unit_type);
    if (!enemyData || enemy.has_acted) continue;
    const positions = enemy.has_moved
      ? [{ x: enemy.x, y: enemy.y }]
      : [{ x: enemy.x, y: enemy.y }, ...getReachableTiles(state, enemy, vis ?? undefined)];
    for (const pos of positions) {
      for (let wi = 0; wi < Math.max(enemyData.weapons.length, 1); wi++) {
        const attackTiles =
          enemyData.weapons[wi]?.min_range &&
          enemyData.weapons[wi].min_range > 1 &&
          (pos.x !== enemy.x || pos.y !== enemy.y)
            ? []
            : getAttackableTiles(state, enemy, pos.x, pos.y, wi);
        for (const tile of attackTiles) {
          const target = getUnitAt(state, tile.x, tile.y);
          if (!target || target.owner_id !== playerId) continue;
          if (!canAttack({ ...enemy, x: pos.x, y: pos.y }, target, state, wi)) continue;
          const damage = calculateDamage(
            { ...enemy, x: pos.x, y: pos.y },
            target,
            state,
            wi
          ).damage;
          addThreat(enemyThreatTiles, tile.x, tile.y, damage);
        }
      }
    }
  }

  for (const unit of ownUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData) continue;
    const tile = getTile(state, unit.x, unit.y);
    const terrain = tile ? getTerrainData(tile.terrain_type) : null;
    const front = getFrontForX(state.map_width, unit.x);

    if (
      unitData.can_capture &&
      tile &&
      terrain?.can_capture &&
      !isAllyOrSelf(state, playerId, tile.owner_id)
    ) {
      const threatScore = enemyThreatTiles[`${unit.x},${unit.y}`] ?? 0;
      captureCommitments.push({
        unitId: unit.id,
        x: unit.x,
        y: unit.y,
        propertyType: tile.terrain_type,
        ownerId: tile.owner_id,
        capturePointsRemaining: tile.capture_points,
        turnsToComplete: Math.max(1, Math.ceil(tile.capture_points / Math.max(unit.hp, 1))),
        threatScore,
        abandonRisk:
          threatScore >= unit.hp
            ? "high"
            : threatScore >= Math.max(2, Math.floor(unit.hp / 2))
              ? "medium"
              : "low",
      });
    }

    if ((enemyThreatTiles[`${unit.x},${unit.y}`] ?? 0) >= Math.max(3, Math.floor(unit.hp / 2))) {
      const threatScore = enemyThreatTiles[`${unit.x},${unit.y}`] ?? 0;
      unitsAtRisk.push({
        unitId: unit.id,
        potentialDamage: threatScore,
        threatScore,
        recommendedAction:
          unit.hp <= 4 ? "merge" : getUnitValue(unit) >= 7000 ? "retreat" : "screen",
      });
    }

    if (!unit.has_acted && unitData.weapons.length > 0) {
      const positions = unit.has_moved
        ? [{ x: unit.x, y: unit.y }]
        : [{ x: unit.x, y: unit.y }, ...getReachableTiles(state, unit, vis ?? undefined)];
      for (const pos of positions) {
        const currentDefense = getTerrainDefenseAt(state, pos.x, pos.y, unit);
        for (let wi = 0; wi < unitData.weapons.length; wi++) {
          const attackTiles =
            unitData.weapons[wi].min_range > 1 && (pos.x !== unit.x || pos.y !== unit.y)
              ? []
              : getAttackableTiles(state, unit, pos.x, pos.y, wi);
          for (const aTile of attackTiles) {
            const target = getUnitAt(state, aTile.x, aTile.y);
            if (!target || isAllyOrSelf(state, playerId, target.owner_id)) continue;
            const movedUnit = { ...unit, x: pos.x, y: pos.y };
            if (!canAttack(movedUnit, target, state, wi)) continue;
            const damage = calculateDamage(movedUnit, target, state, wi).damage;
            const counterDamage = estimateCounterDamage(movedUnit, target, state, wi);
            const targetValue = getUnitValue(target);
            const attackerValue = getUnitValue(unit);
            const baseMatchupDamage = getBaseMatchupDamage(movedUnit, target);
            const finishOff = damage >= target.hp;
            const freeHit = counterDamage === 0;
            const tradeScore = damage * 100 + (finishOff ? targetValue : 0) - counterDamage * 90;
            const opp: AttackOpportunity = {
              attackerId: unit.id,
              targetId: target.id,
              weaponIndex: wi,
              fromX: pos.x,
              fromY: pos.y,
              damage,
              counterDamage,
              targetValue,
              attackerValue,
              front,
              finishOff,
              freeHit,
              tradeScore,
            };
            if (freeHit) freeHits.push(opp);
            if (tradeScore >= 220 || finishOff) {
              goodTrades.push(opp);
              const supportCount = ownUnits.filter((ally) => {
                if (ally.id === unit.id || ally.is_loaded) return false;
                const allyData = getUnitData(ally.unit_type);
                if (!allyData || allyData.transport) return false;
                if (manhattanDistance(ally.x, ally.y, pos.x, pos.y) > 3) return false;
                if (allyData.weapons.length === 0) return allyData.can_capture;
                if (ally.has_acted) return false;
                const allyPositions = ally.has_moved
                  ? [{ x: ally.x, y: ally.y }]
                  : [{ x: ally.x, y: ally.y }, ...getReachableTiles(state, ally, vis ?? undefined)];
                return allyPositions.some((allyPos) =>
                  allyData.weapons.some((_, allyWi) => {
                    if (
                      allyData.weapons[allyWi].min_range > 1 &&
                      (allyPos.x !== ally.x || allyPos.y !== ally.y)
                    )
                      return false;
                    return canAttack(
                      { ...ally, x: allyPos.x, y: allyPos.y },
                      target,
                      state,
                      allyWi
                    );
                  })
                );
              }).length;
              if (supportCount > 0) {
                supportedAttackOpportunities.push({
                  attackerId: unit.id,
                  targetId: target.id,
                  fromX: pos.x,
                  fromY: pos.y,
                  supportCount,
                  reason:
                    "Attack has nearby friendly follow-up instead of leaving the attacker isolated.",
                });
              }
              safeAttackTiles[`${pos.x},${pos.y}`] = Math.max(
                safeAttackTiles[`${pos.x},${pos.y}`] ?? 0,
                Math.max(0, damage - counterDamage)
              );
            }

            const targetData = getUnitData(target.unit_type);
            const likelyBadChip =
              damage <= 2 &&
              counterDamage >= damage &&
              attackerValue <= 3000 &&
              (targetData?.cost ?? 0) >= 6000;
            const ineffectiveMatchup =
              baseMatchupDamage <= 15 &&
              target.hp >= 7 &&
              !finishOff &&
              targetValue >= attackerValue;
            if (tradeScore < 120 || likelyBadChip || ineffectiveMatchup) {
              badTrades.push({
                attackerId: unit.id,
                targetId: target.id,
                weaponIndex: wi,
                fromX: pos.x,
                fromY: pos.y,
                damage,
                counterDamage,
                reason: ineffectiveMatchup
                  ? "Ineffective matchup into high-health target"
                  : likelyBadChip
                    ? "Low-value chip attack into armored target"
                    : "Poor damage-to-risk trade",
              });
            }

            const betterDefenseAvailable = positions.some((candidate) => {
              if (candidate.x === pos.x && candidate.y === pos.y) return false;
              if (getTerrainDefenseAt(state, candidate.x, candidate.y, unit) <= currentDefense)
                return false;
              return getAttackableTiles(state, unit, candidate.x, candidate.y, wi).some(
                (candidateTile) => candidateTile.x === target.x && candidateTile.y === target.y
              );
            });
            if (betterDefenseAvailable) {
              terrainAttackEdges.push({
                attackerId: unit.id,
                targetId: target.id,
                weaponIndex: wi,
                fromX: pos.x,
                fromY: pos.y,
                damage,
                counterDamage,
                reason: "Higher-defense attack tile available",
              });
            }
          }
        }
      }
    }

    if (!unit.has_moved && unitData.can_capture) {
      const reachable = getReachableTiles(state, unit, vis ?? undefined);
      for (const pos of reachable) {
        const destTile = getTile(state, pos.x, pos.y);
        const destTerrain = destTile ? getTerrainData(destTile.terrain_type) : null;
        if (
          !destTile ||
          !destTerrain?.can_capture ||
          isAllyOrSelf(state, playerId, destTile.owner_id)
        )
          continue;
        const threat = enemyThreatTiles[`${pos.x},${pos.y}`] ?? 0;
        const score =
          (destTile.owner_id === -1 ? 50 : 80) +
          getTerrainDefenseAt(state, pos.x, pos.y, unit) * 8 -
          threat * 10;
        easyCaptures.push({
          unitId: unit.id,
          destX: pos.x,
          destY: pos.y,
          propertyType: destTile.terrain_type,
          turnsToReach: 1,
          score,
        });
      }
    }

    if (unit.hp <= 6) {
      const repairSites =
        ownUnits.length >= 0
          ? Array.from({ length: state.map_width * state.map_height }, (_, idx) => ({
              x: idx % state.map_width,
              y: Math.floor(idx / state.map_width),
            }))
              .map(({ x, y }) => ({ x, y, tile: getTile(state, x, y) }))
              .filter(
                (
                  entry
                ): entry is {
                  x: number;
                  y: number;
                  tile: NonNullable<ReturnType<typeof getTile>>;
                } => !!entry.tile
              )
              .filter(
                (entry) =>
                  entry.tile.owner_id === playerId && canUnitRepairAt(unit, entry.tile.terrain_type)
              )
          : [];
      const reachableNow = unit.has_moved
        ? [{ x: unit.x, y: unit.y }]
        : [{ x: unit.x, y: unit.y }, ...getReachableTiles(state, unit, vis ?? undefined)];
      const bestRepair = repairSites
        .map((site) => {
          const canReachNow = reachableNow.some((pos) => pos.x === site.x && pos.y === site.y);
          const distance = manhattanDistance(unit.x, unit.y, site.x, site.y);
          return { ...site, canReachNow, distance };
        })
        .sort(
          (a, b) => Number(b.canReachNow) - Number(a.canReachNow) || a.distance - b.distance
        )[0];
      if (bestRepair && bestRepair.distance <= 6) {
        retreatOpportunities.push({
          unitId: unit.id,
          x: unit.x,
          y: unit.y,
          repairX: bestRepair.x,
          repairY: bestRepair.y,
          terrainType: bestRepair.tile.terrain_type,
          turnsToReach: bestRepair.canReachNow
            ? 1
            : Math.max(1, Math.ceil(bestRepair.distance / Math.max(1, unitData.move_points))),
          reason:
            "Damaged unit should fall back to a friendly repair tile instead of feeding a bad trade.",
        });
      }
    }
  }

  for (const unit of ownUnits) {
    if (unit.hp > 4 || unit.has_acted) continue;
    const unitData = getUnitData(unit.unit_type);
    if (!unitData || unitData.can_capture) continue;
    const reachable = unit.has_moved
      ? [{ x: unit.x, y: unit.y }]
      : [{ x: unit.x, y: unit.y }, ...getReachableTiles(state, unit, vis ?? undefined)];
    const mergeTarget = ownUnits.find((ally) => {
      if (ally.id === unit.id || ally.unit_type !== unit.unit_type || ally.hp >= 10) return false;
      if (ally.is_loaded || ally.has_acted) return false;
      if (ally.hp > 6) return false;
      return reachable.some((pos) => pos.x === ally.x && pos.y === ally.y);
    });
    if (!mergeTarget) continue;
    mergeOpportunities.push({
      unitId: unit.id,
      targetUnitId: mergeTarget.id,
      unitType: unit.unit_type,
      targetX: mergeTarget.x,
      targetY: mergeTarget.y,
      combinedHp: Math.min(10, unit.hp + mergeTarget.hp),
      reason:
        "Both units are badly damaged; merge only to preserve value when they cannot keep useful map presence separately.",
    });
  }

  const frontBalance: FrontBalance[] = (["west", "center", "east"] as FrontId[]).map((front) => {
    const myValue = ownUnits
      .filter((u) => getFrontForX(state.map_width, u.x) === front)
      .reduce((sum, u) => sum + getUnitValue(u), 0);
    const enemyValue = visibleEnemies
      .filter((u) => getFrontForX(state.map_width, u.x) === front)
      .reduce((sum, u) => sum + getUnitValue(u), 0);
    const enemyPressure = visibleEnemies
      .filter((u) => getFrontForX(state.map_width, u.x) === front)
      .reduce((sum, u) => sum + (u.hp >= 7 ? 1 : 0), 0);
    const delta = myValue - enemyValue;
    const status = delta >= 8000 ? "strong" : delta <= -6000 ? "weak" : "even";
    const recommendation =
      status === "weak"
        ? "Reinforce this front and preserve damaged units."
        : status === "strong"
          ? "Press captures and trade up here."
          : "Keep trading efficiently and screen captures.";
    return { front, myValue, enemyValue, enemyPressure, status, recommendation };
  });

  const ownProductionTiles = getOwnProductionTiles(state, playerId);
  const player = state.players.find((p) => p.id === playerId);
  let ownPropertyCount = 0;
  for (let py = 0; py < state.map_height; py++) {
    for (let px = 0; px < state.map_width; px++) {
      const tile = getTile(state, px, py);
      if (tile && tile.owner_id === playerId) {
        const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
        if (terrain?.is_property) ownPropertyCount++;
      }
    }
  }
  const ownHq = getOwnedHq(state, playerId);
  const hqThreatened = (() => {
    if (!ownHq) return false;
    const nearbyEnemies = visibleEnemies.filter(
      (enemy) => manhattanDistance(enemy.x, enemy.y, ownHq.x, ownHq.y) <= 4
    );
    if (nearbyEnemies.length === 0) return false;
    if (
      nearbyEnemies.some(
        (enemy) =>
          (getUnitData(enemy.unit_type)?.can_capture ?? false) &&
          manhattanDistance(enemy.x, enemy.y, ownHq.x, ownHq.y) <= 2
      )
    ) {
      return true;
    }
    const nearbyValue = nearbyEnemies.reduce((sum, enemy) => sum + getUnitValue(enemy), 0);
    return nearbyValue >= 12000;
  })();
  const emptyFactories = ownProductionTiles.filter(
    (facility) => facility.terrainType === "factory" && !getUnitAt(state, facility.x, facility.y)
  );
  const blockedProductionTiles = ownProductionTiles.filter((facility) =>
    ownUnits.some((unit) => unit.x === facility.x && unit.y === facility.y)
  ).length;
  const factorySpendOpportunities = (() => {
    let remainingFunds = player?.funds ?? 0;
    let possibleBuilds = 0;
    const sortedFactories = emptyFactories
      .map((facility) => ({
        ...facility,
        cheapestCost: getCheapestProducibleCost(facility.producedUnitTypes),
      }))
      .filter(
        (facility): facility is typeof facility & { cheapestCost: number } =>
          facility.cheapestCost !== null
      )
      .sort((a, b) => a.cheapestCost - b.cheapestCost);
    for (const facility of sortedFactories) {
      if (remainingFunds < facility.cheapestCost) break;
      remainingFunds -= facility.cheapestCost;
      possibleBuilds++;
    }
    return possibleBuilds;
  })();
  const weakFront = frontBalance.find((front) => front.status === "weak")?.front;
  const strategicTarget = getEnemyFocusTarget(state, playerId, visibleEnemies, weakFront);
  const openingTurn = state.turn_number <= 4;
  const expandableProperties = getExpandableProperties(state, playerId);
  const desiredInfantryCount = Math.max(
    4,
    Math.min(
      10,
      Math.ceil(ownPropertyCount / 2) +
        Math.max(1, ownProductionTiles.filter((t) => t.terrainType === "factory").length - 1)
    )
  );

  for (const facility of ownProductionTiles) {
    const blockingFriendly = ownUnits.find(
      (unit) => unit.x === facility.x && unit.y === facility.y
    );
    for (const enemy of visibleEnemies) {
      const distance = manhattanDistance(enemy.x, enemy.y, facility.x, facility.y);
      if (distance > 1) continue;
      facilityEmergencies.push({
        facilityX: facility.x,
        facilityY: facility.y,
        terrainType: facility.terrainType,
        severity: distance === 0 ? "critical" : "high",
        enemyUnitId: enemy.id,
        enemyUnitType: enemy.unit_type,
        distance,
        blockingFriendlyUnitId: blockingFriendly?.id,
        recommendedResponse:
          distance === 0
            ? "Dislodge the enemy immediately or you lose production tempo."
            : "Contest this facility before the enemy sits on it next turn.",
      });
    }

    if (facility.terrainType === "port" && countNavalExits(state, facility.x, facility.y) === 0) {
      deadProductionTraps.push({
        x: facility.x,
        y: facility.y,
        terrainType: facility.terrainType,
        producedUnitTypes: facility.producedUnitTypes,
        reason: "This port has no naval exit. Only build here as a deliberate static blocker.",
      });
    }
  }

  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const terrain = getTerrainData(tile.has_fob ? "temporary_fob" : tile.terrain_type);
      if (!terrain) continue;
      const passableTypes = ["infantry", "mech", "tires", "treads"].filter(
        (moveType) =>
          (terrain.movement_costs as Record<string, number | undefined>)[moveType] !== undefined &&
          ((terrain.movement_costs as Record<string, number>)[moveType] ?? -1) >= 0
      );
      if (passableTypes.length === 0) continue;
      const orthogonalPassable = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => {
        const nTile = getTile(state, x + dx, y + dy);
        if (!nTile) return false;
        const nTerrain = getTerrainData(nTile.has_fob ? "temporary_fob" : nTile.terrain_type);
        if (!nTerrain) return false;
        return passableTypes.some(
          (moveType) => ((nTerrain.movement_costs as Record<string, number>)[moveType] ?? -1) >= 0
        );
      }).length;
      const interestingTerrain =
        tile.terrain_type === "bridge" ||
        tile.terrain_type === "road" ||
        tile.terrain_type === "city" ||
        tile.terrain_type === "factory" ||
        tile.terrain_type === "port";
      if (!interestingTerrain || orthogonalPassable > 2) continue;
      laneControlObjectives.push({
        x,
        y,
        front: getFrontForX(state.map_width, x),
        terrainType: tile.terrain_type,
        reason:
          "Narrow lane/chokepoint that infantry walls or indirect coverage can control efficiently.",
      });
    }
  }

  const transportMissions: TransportMission[] = ownUnits
    .filter((u) => getUnitData(u.unit_type)?.transport)
    .map((transport) => {
      const front = getFrontForX(state.map_width, transport.x);
      const nearbyCargo = ownUnits.find(
        (u) =>
          u.id !== transport.id &&
          !u.is_loaded &&
          (getUnitData(u.unit_type)?.can_capture ?? false) &&
          manhattanDistance(u.x, u.y, transport.x, transport.y) <= 2
      );
      const targetCapture = easyCaptures
        .filter((c) => nearbyCargo && c.unitId === nearbyCargo.id)
        .sort((a, b) => b.score - a.score)[0];
      if (nearbyCargo && targetCapture) {
        return {
          transportId: transport.id,
          status: "pickup",
          objectiveX: targetCapture.destX,
          objectiveY: targetCapture.destY,
          cargoUnitId: nearbyCargo.id,
          front,
          score: targetCapture.score,
          reason: "Pickup nearby capturer for property contest.",
        };
      }
      const weakFront = frontBalance.find((f) => f.status === "weak");
      if (weakFront) {
        return {
          transportId: transport.id,
          status: "reinforce_front",
          front: weakFront.front,
          score: 35,
          reason: "Redeploy cargo toward your weaker front.",
        };
      }
      return {
        transportId: transport.id,
        status: "no_mission",
        front,
        score: 0,
        reason: "No clear transport mission this turn.",
      };
    });

  const getResponderUnitIds = (enemy: UnitState): number[] =>
    ownUnits
      .filter((unit) => !unit.has_acted)
      .filter((unit) => {
        const unitData = getUnitData(unit.unit_type);
        if (!unitData || unitData.weapons.length === 0) return false;
        const positions = unit.has_moved
          ? [{ x: unit.x, y: unit.y }]
          : [{ x: unit.x, y: unit.y }, ...getReachableTiles(state, unit, vis ?? undefined)];
        return positions.some((pos) =>
          unitData.weapons.some((_, wi) => {
            if (unitData.weapons[wi].min_range > 1 && (pos.x !== unit.x || pos.y !== unit.y))
              return false;
            const movedUnit = { ...unit, x: pos.x, y: pos.y };
            return canAttack(movedUnit, enemy, state, wi);
          })
        );
      })
      .map((unit) => unit.id);

  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrain = getTerrainData(tile.terrain_type);
      if (!terrain?.can_capture) continue;
      const occ = getUnitAt(state, x, y);
      if (!occ || occ.owner_id === playerId || isAllyOrSelf(state, playerId, occ.owner_id))
        continue;
      const occData = getUnitData(occ.unit_type);
      if (!(occData?.can_capture ?? false)) continue;
      const responderUnitIds = getResponderUnitIds(occ);
      captureDenialOpportunities.push({
        enemyUnitId: occ.id,
        enemyUnitType: occ.unit_type,
        x,
        y,
        propertyType: tile.terrain_type,
        capturePointsRemaining: tile.capture_points,
        responderUnitIds,
        urgency: tile.terrain_type === "hq" || tile.capture_points <= 10 ? "critical" : "high",
      });
    }
  }

  for (const enemy of visibleEnemies) {
    const tile = getTile(state, enemy.x, enemy.y);
    if (!tile || tile.owner_id !== playerId) continue;
    const terrain = getTerrainData(tile.terrain_type);
    if (!(terrain?.can_produce?.length ?? 0) && tile.terrain_type !== "hq") continue;
    const nearestEnemySupport = visibleEnemies
      .filter((other) => other.id !== enemy.id)
      .reduce(
        (best, other) => Math.min(best, manhattanDistance(enemy.x, enemy.y, other.x, other.y)),
        Number.POSITIVE_INFINITY
      );
    const responderUnitIds = getResponderUnitIds(enemy);
    overextensionPunishOpportunities.push({
      enemyUnitId: enemy.id,
      enemyUnitType: enemy.unit_type,
      x: enemy.x,
      y: enemy.y,
      terrainType: tile.terrain_type,
      responderUnitIds,
      supportDistance: Number.isFinite(nearestEnemySupport) ? nearestEnemySupport : 99,
      reason:
        tile.terrain_type === "hq"
          ? "Enemy is threatening HQ/capture victory space without secure support."
          : "Enemy is sitting on your production/property and should be punished before it gets help.",
    });
  }

  const captureCommitmentIds = new Set(captureCommitments.map((capture) => capture.unitId));
  const transportIds = new Set(transportMissions.map((mission) => mission.transportId));
  if (openingTurn) {
    const assignedTargets = new Set<string>();
    const capturers = ownUnits
      .filter((unit) => getUnitData(unit.unit_type)?.can_capture)
      .sort((a, b) => a.id - b.id);
    for (const unit of capturers) {
      const bestOpeningCapture = expandableProperties
        .filter((property) => !assignedTargets.has(`${property.x},${property.y}`))
        .map((property) => {
          const distance = manhattanDistance(unit.x, unit.y, property.x, property.y);
          const enemyOwned = property.ownerId !== -1;
          const laneBonus = laneControlObjectives.some(
            (lane) => lane.x === property.x && lane.y === property.y
          )
            ? 6
            : 0;
          return {
            ...property,
            distance,
            score:
              (enemyOwned ? 20 : 40) -
              distance * 4 +
              laneBonus +
              (getFrontForX(state.map_width, property.x) === getFrontForX(state.map_width, unit.x)
                ? 6
                : 0),
          };
        })
        .sort((a, b) => b.score - a.score || a.distance - b.distance)[0];
      if (!bestOpeningCapture) continue;
      assignedTargets.add(`${bestOpeningCapture.x},${bestOpeningCapture.y}`);
      openingCaptureAssignments.push({
        unitId: unit.id,
        objectiveX: bestOpeningCapture.x,
        objectiveY: bestOpeningCapture.y,
        propertyType: bestOpeningCapture.propertyType,
        reason:
          "Opening turns: spread capturers toward distinct neutral/enemy properties instead of drifting toward HQ or the enemy cluster too early.",
      });
    }
  }
  for (const unit of ownUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData || !unitData.can_capture) continue;
    if (captureCommitmentIds.has(unit.id)) continue;
    const nearOwnHq = ownHq !== null && manhattanDistance(unit.x, unit.y, ownHq.x, ownHq.y) <= 3;
    const onOwnProduction = isProductionTile(state, unit.x, unit.y, playerId);
    if (!nearOwnHq && !onOwnProduction) continue;
    const directEasyCapture = easyCaptures
      .filter((capture) => capture.unitId === unit.id)
      .sort((a, b) => b.score - a.score)[0];
    const openingAssignment = openingCaptureAssignments.find(
      (assignment) => assignment.unitId === unit.id
    );
    const laneObjective = laneControlObjectives
      .filter((lane) => lane.front === getFrontForX(state.map_width, unit.x))
      .sort(
        (a, b) =>
          manhattanDistance(unit.x, unit.y, a.x, a.y) - manhattanDistance(unit.x, unit.y, b.x, b.y)
      )[0];
    const objectiveX =
      openingAssignment?.objectiveX ??
      directEasyCapture?.destX ??
      laneObjective?.x ??
      strategicTarget.x;
    const objectiveY =
      openingAssignment?.objectiveY ??
      directEasyCapture?.destY ??
      laneObjective?.y ??
      strategicTarget.y;
    const currentDistance = manhattanDistance(unit.x, unit.y, objectiveX, objectiveY);
    if (currentDistance <= 2) continue;
    passiveCapturerWarnings.push({
      unitId: unit.id,
      x: unit.x,
      y: unit.y,
      objectiveX,
      objectiveY,
      reason: nearOwnHq
        ? "Capturer is lingering near HQ instead of moving toward a neutral property, lane, or forward objective."
        : "Capturer is sitting on/near base instead of expanding or walling forward.",
    });
  }
  for (const unit of ownUnits) {
    if (captureCommitmentIds.has(unit.id) || transportIds.has(unit.id)) continue;
    if (isProductionTile(state, unit.x, unit.y, playerId)) continue;
    const nearOwnHq = ownHq !== null && manhattanDistance(unit.x, unit.y, ownHq.x, ownHq.y) <= 2;
    if (nearOwnHq && hqThreatened) {
      unitPurposeCommitments.push({
        unitId: unit.id,
        purpose: "hold_hq_defense",
        objectiveX: ownHq!.x,
        objectiveY: ownHq!.y,
        holdPosition: true,
        urgency: "high",
      });
      continue;
    }
    const nearestEnemyDistance = visibleEnemies.reduce(
      (best, enemy) => Math.min(best, manhattanDistance(unit.x, unit.y, enemy.x, enemy.y)),
      Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(nearestEnemyDistance) || nearestEnemyDistance < 6) continue;

    const directEasyCapture = easyCaptures
      .filter((capture) => capture.unitId === unit.id)
      .sort((a, b) => b.score - a.score)[0];
    const openingAssignment = openingCaptureAssignments.find(
      (assignment) => assignment.unitId === unit.id
    );
    const laneObjective = laneControlObjectives
      .filter((lane) => lane.front === getFrontForX(state.map_width, unit.x))
      .sort(
        (a, b) =>
          manhattanDistance(unit.x, unit.y, a.x, a.y) - manhattanDistance(unit.x, unit.y, b.x, b.y)
      )[0];
    const objectiveX =
      openingAssignment?.objectiveX ??
      directEasyCapture?.destX ??
      laneObjective?.x ??
      strategicTarget.x;
    const objectiveY =
      openingAssignment?.objectiveY ??
      directEasyCapture?.destY ??
      laneObjective?.y ??
      strategicTarget.y;
    const recommendedFront = directEasyCapture
      ? getFrontForX(state.map_width, openingAssignment?.objectiveX ?? directEasyCapture.destX)
      : strategicTarget.front;
    idleRearUnits.push({
      unitId: unit.id,
      x: unit.x,
      y: unit.y,
      front: getFrontForX(state.map_width, unit.x),
      objectiveX,
      objectiveY,
      recommendedFront,
      distanceToNearestEnemy: nearestEnemyDistance,
      reason: directEasyCapture
        ? openingAssignment
          ? openingAssignment.reason
          : nearOwnHq
            ? "HQ is safe; this capturer should leave HQ area and move toward an open property."
            : "Rear-area capturer should move toward an open property instead of waiting near base."
        : nearOwnHq
          ? "HQ is not under real pressure; do not park units near HQ when they could project power forward."
          : "Rear-area unit is far from visible combat and should project power forward.",
    });
  }

  const ownAirDefense = ownUnits.filter((u) =>
    ["anti_air", "missile", "fighter"].includes(u.unit_type)
  ).length;
  const enemyAirThreat = visibleEnemies.filter((u) =>
    ["b_copter", "fighter", "bomber", "stealth"].includes(u.unit_type)
  ).length;
  const enemyAirUnits = visibleEnemies.filter((u) =>
    ["b_copter", "fighter", "bomber", "stealth", "t_copter"].includes(u.unit_type)
  );
  const ownArmor = ownUnits.filter((u) =>
    ["tank", "md_tank", "neo_tank", "mega_tank"].includes(u.unit_type)
  ).length;
  const enemyArmor = visibleEnemies.filter((u) =>
    ["tank", "md_tank", "neo_tank", "mega_tank"].includes(u.unit_type)
  ).length;
  const ownCapturers = ownUnits.filter((u) => getUnitData(u.unit_type)?.can_capture).length;
  const enemyCapturers = visibleEnemies.filter((u) => getUnitData(u.unit_type)?.can_capture).length;
  const transportCount = ownUnits.filter((u) => !!getUnitData(u.unit_type)?.transport).length;
  const visibleEnemyNaval = visibleEnemies.filter(
    (u) => getUnitData(u.unit_type)?.domain === "sea"
  ).length;
  const coastalProps = countCoastalProperties(state, playerId);
  const reachableOwnPorts = ownProductionTiles.filter(
    (facility) =>
      facility.terrainType === "port" && countNavalExits(state, facility.x, facility.y) >= 2
  ).length;
  const strongTransportMission = transportMissions.some(
    (mission) => mission.status !== "no_mission" && mission.score >= 60
  );
  const portEmergency = facilityEmergencies.some(
    (facility) => facility.terrainType === "port" && facility.severity === "critical"
  );
  const preserving = unitsAtRisk.some((u) => u.recommendedAction !== "screen");
  const indirectUnits = ownUnits.filter((u) => {
    const unitData = getUnitData(u.unit_type);
    return !!unitData?.weapons.some((weapon) => weapon.min_range > 1);
  });
  indirectUnits.forEach((unit) => {
    const front = getFrontForX(state.map_width, unit.x);
    const screenX =
      front === "west"
        ? Math.min(state.map_width - 1, unit.x + 1)
        : front === "east"
          ? Math.max(0, unit.x - 1)
          : strategicTarget.x >= unit.x
            ? Math.min(state.map_width - 1, unit.x + 1)
            : Math.max(0, unit.x - 1);
    indirectCoverageZones.push({
      unitId: unit.id,
      unitType: unit.unit_type,
      x: unit.x,
      y: unit.y,
      front,
      screenX,
      screenY: unit.y,
      reason:
        "Keep an infantry/tank wall ahead of this indirect so it can zone the lane without getting exposed.",
    });
  });
  for (const unit of ownUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData || !unitData.can_capture) continue;
    const nearestEnemyDistance = visibleEnemies.reduce(
      (best, enemy) => Math.min(best, manhattanDistance(unit.x, unit.y, enemy.x, enemy.y)),
      Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(nearestEnemyDistance) || nearestEnemyDistance > 4) continue;
    const protectsIndirect = indirectCoverageZones.find(
      (zone) => manhattanDistance(unit.x, unit.y, zone.x, zone.y) <= 2
    );
    const protectsFacility = ownProductionTiles.find(
      (facility) => manhattanDistance(unit.x, unit.y, facility.x, facility.y) <= 1
    );
    if (!protectsIndirect && !protectsFacility) continue;
    wallIntegrityRisks.push({
      unitId: unit.id,
      x: unit.x,
      y: unit.y,
      protectsUnitId: protectsIndirect?.unitId,
      protectsFacility: protectsFacility?.terrainType,
      nearestEnemyDistance,
      reason: protectsIndirect
        ? `This infantry/mech is part of the screen in front of indirect unit ${protectsIndirect.unitId}.`
        : `This infantry/mech helps body-block access to your ${protectsFacility?.terrainType}.`,
    });
  }
  for (const unit of ownUnits) {
    const unitData = getUnitData(unit.unit_type);
    if (!unitData || unitData.transport || unitData.can_capture) continue;
    if (getUnitValue(unit) < 6000) continue;
    const threatScore = enemyThreatTiles[`${unit.x},${unit.y}`] ?? 0;
    if (threatScore <= 0) continue;
    const nearestEnemyDistance = visibleEnemies.reduce(
      (best, enemy) => Math.min(best, manhattanDistance(unit.x, unit.y, enemy.x, enemy.y)),
      Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(nearestEnemyDistance) || nearestEnemyDistance > 5) continue;
    const nearbySupportCount = ownUnits.filter((ally) => {
      if (ally.id === unit.id || ally.is_loaded) return false;
      const allyData = getUnitData(ally.unit_type);
      if (!allyData || allyData.transport) return false;
      if (manhattanDistance(ally.x, ally.y, unit.x, unit.y) > 2) return false;
      return (allyData.weapons.length > 0 || allyData.can_capture) && ally.hp >= 5;
    }).length;
    if (nearbySupportCount > 0) continue;
    supportRisks.push({
      unitId: unit.id,
      unitType: unit.unit_type,
      x: unit.x,
      y: unit.y,
      nearbySupportCount,
      nearestEnemyDistance,
      threatScore,
      reason: "High-value frontline unit is exposed without nearby support or walling units.",
    });
  }
  const productionNeeds: ProductionNeeds = {
    needAirCounter: enemyAirThreat > 0 && ownAirDefense === 0,
    needFrontlineArmor: enemyArmor >= Math.max(1, ownArmor + 1),
    needInfantryWalls:
      ownCapturers < Math.max(2, Math.min(6, Math.ceil(ownPropertyCount / 2))) ||
      (ownUnits.length <= visibleEnemies.length && ownCapturers <= enemyCapturers + 1),
    desiredInfantryCount,
    tooManyTransports:
      transportCount >= 2 && transportMissions.every((m) => m.status === "no_mission"),
    avoidSpeculativeTransportBuys:
      (state.turn_number <= 12 || frontBalance.some((front) => front.status === "weak")) &&
      !strongTransportMission &&
      !portEmergency,
    avoidSpeculativeNavalBuys:
      visibleEnemyNaval === 0 &&
      coastalProps.enemyPorts === 0 &&
      reachableOwnPorts <= 1 &&
      coastalProps.neutralPorts <= 1 &&
      !portEmergency,
    techUpAllowed:
      ((player?.funds ?? 0) >= 16000 || frontBalance.some((f) => f.status === "strong")) &&
      ownProductionTiles.filter((t) => t.terrainType === "factory").length >= 2 &&
      ownUnits.filter((u) => u.unit_type === "tank").length >= 3 &&
      !frontBalance.some((f) => f.status === "weak"),
    preserveUnits: preserving,
    factorySpendOpportunities,
    blockedProductionTiles,
    armyDeficit: Math.max(0, visibleEnemies.length - ownUnits.length),
    ownAirDefenseCount: ownAirDefense,
    visibleEnemyAirCount: enemyAirThreat,
    incomeEstimate: ownPropertyCount * 1000,
    factoryCount: ownProductionTiles.filter((t) => t.terrainType === "factory").length,
    ownTankCount: ownUnits.filter((u) => u.unit_type === "tank").length,
    ownHeavyArmorCount: ownUnits.filter((u) =>
      ["md_tank", "neo_tank", "mega_tank"].includes(u.unit_type)
    ).length,
    enemyHeavyArmorCount: visibleEnemies.filter((u) =>
      ["md_tank", "neo_tank", "mega_tank"].includes(u.unit_type)
    ).length,
    ownBCopterCount: ownUnits.filter((u) => u.unit_type === "b_copter").length,
    enemyAntiAirCount: visibleEnemies.filter((u) =>
      ["anti_air", "missile", "fighter"].includes(u.unit_type)
    ).length,
    priorities: [],
  };
  if (productionNeeds.factorySpendOpportunities > 0) {
    productionNeeds.priorities.push(
      `Spend from every empty factory this turn if possible (${productionNeeds.factorySpendOpportunities} build opportunities).`
    );
  }
  if (productionNeeds.blockedProductionTiles > 0) {
    productionNeeds.priorities.push(
      `Free your blocked production tiles unless they are intentionally holding an emergency chokepoint (${productionNeeds.blockedProductionTiles} blocked).`
    );
  }
  if (productionNeeds.needAirCounter)
    productionNeeds.priorities.push(
      "Build anti_air, missile, or fighter before more tanks/transports."
    );
  if (productionNeeds.needFrontlineArmor)
    productionNeeds.priorities.push(
      "Add tank, md_tank, artillery, or b_copter to stabilize armor trades."
    );
  if (productionNeeds.needInfantryWalls) {
    productionNeeds.priorities.push(
      `Keep building infantry to take ground, wall for your vehicles, and preserve capture tempo unless an urgent counter-buy is required (target ~${productionNeeds.desiredInfantryCount}).`
    );
  }
  if (retreatOpportunities.length > 0) {
    productionNeeds.priorities.unshift(
      "Pull damaged units back to nearby owned repair tiles instead of taking low-value trades."
    );
  }
  if (mergeOpportunities.length > 0) {
    productionNeeds.priorities.push(
      "Only merge when both units are badly damaged and preserving them is better than keeping separate map presence."
    );
  }
  if (productionNeeds.tooManyTransports)
    productionNeeds.priorities.push(
      "Avoid buying transports without a live capture or reinforcement mission."
    );
  if (productionNeeds.avoidSpeculativeTransportBuys) {
    productionNeeds.priorities.push(
      "Do not buy APC/T-Copter/lander/black_boat as speculative blockers. Prefer infantry, tank, artillery, anti_air, or b_copter unless a transport mission is urgent right now."
    );
  }
  if (productionNeeds.avoidSpeculativeNavalBuys) {
    productionNeeds.priorities.push(
      "Avoid naval buys on low-sea maps unless enemy naval pressure or a critical port emergency makes them necessary. Ports still give income; you do not need a boat parked on them by default."
    );
  }
  if (facilityEmergencies.length > 0)
    productionNeeds.priorities.unshift(
      "Respond to contested factories/airports/ports before low-value repositioning."
    );
  if (captureDenialOpportunities.some((opportunity) => opportunity.responderUnitIds.length > 0)) {
    productionNeeds.priorities.unshift(
      "If an enemy is capturing your property and you can hit them this turn, attack to slow or reset the capture."
    );
  }
  if (supportRisks.length > 0) {
    productionNeeds.priorities.unshift(
      "Do not push expensive frontline units into enemy threat without nearby support. Move tanks/anti-air/copters in pairs or behind infantry walls."
    );
  }
  if (passiveCapturerWarnings.length > 0) {
    productionNeeds.priorities.unshift(
      "Push idle infantry/mechs off HQ and bases toward neutral properties, chokepoints, and walling positions."
    );
  }
  if (wallIntegrityRisks.length > 0 || indirectCoverageZones.length > 0) {
    productionNeeds.priorities.unshift(
      "Protect your indirects and valuable units with infantry/tank walls; do not open lanes for free enemy hits."
    );
  }
  if (deadProductionTraps.length > 0)
    productionNeeds.priorities.push(
      "Avoid naval buys on trapped ports unless you are intentionally static-blocking the port."
    );
  if (productionNeeds.armyDeficit >= 5) {
    productionNeeds.priorities.unshift(
      `CRITICAL: You are badly outnumbered (deficit: ${productionNeeds.armyDeficit} units). Spend every available fund on production.`
    );
  } else if (productionNeeds.armyDeficit >= 3) {
    productionNeeds.priorities.unshift(
      `You are outnumbered by ${productionNeeds.armyDeficit} units. Prioritize production to close the gap.`
    );
  }
  if (productionNeeds.techUpAllowed)
    productionNeeds.priorities.push("You can tech up instead of floating funds on cheap units.");
  if (productionNeeds.techUpAllowed && productionNeeds.enemyHeavyArmorCount >= 2) {
    productionNeeds.priorities.push(
      "Enemy has heavy armor — consider neo_tank to counter their md_tanks (6 movement gives first-strike advantage)."
    );
  }
  if (productionNeeds.preserveUnits)
    productionNeeds.priorities.push("Retreat or merge units that are likely to be overwhelmed.");

  captureCommitments.forEach((capture) =>
    unitPurposeCommitments.push({
      unitId: capture.unitId,
      purpose: "finish_capture",
      objectiveX: capture.x,
      objectiveY: capture.y,
      holdPosition: true,
      urgency: capture.abandonRisk === "high" ? "high" : "medium",
    })
  );
  transportMissions.forEach((mission) =>
    unitPurposeCommitments.push({
      unitId: mission.transportId,
      purpose: mission.status,
      objectiveX: mission.objectiveX,
      objectiveY: mission.objectiveY,
      holdPosition: mission.status === "no_mission",
      urgency: mission.status === "no_mission" ? "low" : "medium",
    })
  );
  idleRearUnits.forEach((unit) =>
    unitPurposeCommitments.push({
      unitId: unit.unitId,
      purpose: "project_power",
      objectiveX: unit.objectiveX,
      objectiveY: unit.objectiveY,
      holdPosition: false,
      urgency: "medium",
    })
  );
  if (enemyAirUnits.length > 0) {
    const airDefenseUnits = ownUnits.filter((unit) =>
      ["anti_air", "missile", "fighter"].includes(unit.unit_type)
    );
    for (const defender of airDefenseUnits) {
      const threatenedFriendly = ownUnits
        .filter(
          (unit) => unit.id !== defender.id && (enemyThreatTiles[`${unit.x},${unit.y}`] ?? 0) > 0
        )
        .sort(
          (a, b) =>
            manhattanDistance(defender.x, defender.y, a.x, a.y) -
            manhattanDistance(defender.x, defender.y, b.x, b.y)
        )[0];
      const nearestEnemyAir = enemyAirUnits
        .slice()
        .sort(
          (a, b) =>
            manhattanDistance(defender.x, defender.y, a.x, a.y) -
            manhattanDistance(defender.x, defender.y, b.x, b.y)
        )[0];
      const objective = threatenedFriendly
        ? { x: threatenedFriendly.x, y: threatenedFriendly.y }
        : nearestEnemyAir
          ? { x: nearestEnemyAir.x, y: nearestEnemyAir.y }
          : undefined;
      unitPurposeCommitments.push({
        unitId: defender.id,
        purpose: "screen_air_threat",
        objectiveX: objective?.x,
        objectiveY: objective?.y,
        holdPosition: false,
        urgency: enemyAirThreat > 0 ? "high" : "medium",
      });
    }
  }
  facilityEmergencies.forEach((facility) => {
    if (facility.blockingFriendlyUnitId === undefined) return;
    unitPurposeCommitments.push({
      unitId: facility.blockingFriendlyUnitId,
      purpose: "hold_or_contest_facility",
      objectiveX: facility.facilityX,
      objectiveY: facility.facilityY,
      holdPosition: true,
      urgency: facility.severity === "critical" ? "high" : "medium",
    });
  });
  captureDenialOpportunities.forEach((opportunity) => {
    opportunity.responderUnitIds.forEach((unitId) =>
      unitPurposeCommitments.push({
        unitId,
        purpose: "deny_capture",
        objectiveX: opportunity.x,
        objectiveY: opportunity.y,
        holdPosition: false,
        urgency: opportunity.urgency === "critical" ? "high" : "medium",
      })
    );
  });
  overextensionPunishOpportunities.forEach((opportunity) => {
    opportunity.responderUnitIds.forEach((unitId) =>
      unitPurposeCommitments.push({
        unitId,
        purpose: "punish_overextension",
        objectiveX: opportunity.x,
        objectiveY: opportunity.y,
        holdPosition: false,
        urgency: "high",
      })
    );
  });
  wallIntegrityRisks.forEach((risk) =>
    unitPurposeCommitments.push({
      unitId: risk.unitId,
      purpose: "hold_wall",
      objectiveX: risk.x,
      objectiveY: risk.y,
      holdPosition: true,
      urgency: "high",
    })
  );
  passiveCapturerWarnings.forEach((warning) =>
    unitPurposeCommitments.push({
      unitId: warning.unitId,
      purpose: "push_capturer",
      objectiveX: warning.objectiveX,
      objectiveY: warning.objectiveY,
      holdPosition: false,
      urgency: "high",
    })
  );
  supportRisks.forEach((risk) => {
    unitPurposeCommitments.push({
      unitId: risk.unitId,
      purpose: "seek_support",
      objectiveX: risk.x,
      objectiveY: risk.y,
      holdPosition: false,
      urgency: "high",
    });
  });
  retreatOpportunities.forEach((opportunity) =>
    unitPurposeCommitments.push({
      unitId: opportunity.unitId,
      purpose: "retreat_to_repair",
      objectiveX: opportunity.repairX,
      objectiveY: opportunity.repairY,
      holdPosition: false,
      urgency: "high",
    })
  );
  mergeOpportunities.forEach((opportunity) =>
    unitPurposeCommitments.push({
      unitId: opportunity.unitId,
      purpose: "merge_preserve_value",
      objectiveX: opportunity.targetX,
      objectiveY: opportunity.targetY,
      holdPosition: false,
      urgency: "medium",
    })
  );

  easyCaptures.sort((a, b) => b.score - a.score);
  captureCommitments.sort((a, b) => {
    const risk = { high: 3, medium: 2, low: 1 };
    return risk[b.abandonRisk] - risk[a.abandonRisk] || a.turnsToComplete - b.turnsToComplete;
  });
  goodTrades.sort((a, b) => b.tradeScore - a.tradeScore);
  freeHits.sort((a, b) => b.damage - a.damage);
  badTrades.sort((a, b) => b.counterDamage - a.counterDamage || a.damage - b.damage);
  unitsAtRisk.sort((a, b) => b.threatScore - a.threatScore);
  retreatOpportunities.sort((a, b) => a.turnsToReach - b.turnsToReach || a.unitId - b.unitId);
  mergeOpportunities.sort((a, b) => a.combinedHp - b.combinedHp || a.unitId - b.unitId);
  facilityEmergencies.sort((a, b) => a.distance - b.distance || a.facilityX - b.facilityX);
  idleRearUnits.sort((a, b) => b.distanceToNearestEnemy - a.distanceToNearestEnemy);
  captureDenialOpportunities.sort(
    (a, b) => a.capturePointsRemaining - b.capturePointsRemaining || a.x - b.x
  );
  overextensionPunishOpportunities.sort(
    (a, b) => a.supportDistance - b.supportDistance || a.x - b.x
  );
  supportRisks.sort(
    (a, b) => b.threatScore - a.threatScore || a.nearestEnemyDistance - b.nearestEnemyDistance
  );
  wallIntegrityRisks.sort((a, b) => a.nearestEnemyDistance - b.nearestEnemyDistance || a.x - b.x);
  supportedAttackOpportunities.sort(
    (a, b) => b.supportCount - a.supportCount || a.attackerId - b.attackerId
  );
  indirectCoverageZones.sort((a, b) => a.unitId - b.unitId);
  laneControlObjectives.sort(
    (a, b) =>
      manhattanDistance(a.x, a.y, strategicTarget.x, strategicTarget.y) -
      manhattanDistance(b.x, b.y, strategicTarget.x, strategicTarget.y)
  );
  passiveCapturerWarnings.sort((a, b) => a.unitId - b.unitId);
  unitPurposeCommitments.sort((a, b) => {
    const urgency = { high: 3, medium: 2, low: 1 };
    return urgency[b.urgency] - urgency[a.urgency] || a.unitId - b.unitId;
  });

  return {
    playerId,
    visibility: vis,
    captureCommitments,
    easyCaptures,
    goodTrades,
    freeHits,
    badTrades,
    enemyThreatTiles,
    safeAttackTiles,
    terrainAttackEdges,
    frontBalance,
    productionNeeds,
    transportMissions,
    unitsAtRisk,
    retreatOpportunities,
    mergeOpportunities,
    facilityEmergencies,
    idleRearUnits,
    deadProductionTraps,
    unitPurposeCommitments,
    openingCaptureAssignments,
    captureDenialOpportunities,
    overextensionPunishOpportunities,
    supportRisks,
    wallIntegrityRisks,
    supportedAttackOpportunities,
    indirectCoverageZones,
    laneControlObjectives,
    passiveCapturerWarnings,
  };
}
