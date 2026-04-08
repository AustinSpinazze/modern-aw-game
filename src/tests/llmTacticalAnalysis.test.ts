import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../game/dataLoader");

import { getTerrainData, getUnitData } from "../game/dataLoader";
import { analyzeTacticalState } from "../ai/tacticalAnalysis";
import { scoreTileForAiMove } from "../ai/heuristic";
import { updatePlayer } from "../game/gameState";
import { makeState, addTestUnit, setTerrain } from "./fixtures";
import { MOCK_TERRAIN, MOCK_UNITS } from "./mockData";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

describe("analyzeTacticalState", () => {
  it("flags an in-progress capture under visible threat", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 2, 2, "city", { owner_id: 1, capture_points: 10 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 4, y: 2 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.captureCommitments).toHaveLength(1);
    expect(analysis.captureCommitments[0].unitId).toBe(1);
    expect(["medium", "high"]).toContain(analysis.captureCommitments[0].abandonRisk);
  });

  it("marks infantry chip damage into armor as a bad trade", () => {
    let state = makeState(6, 6);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 2, y: 1, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    expect(
      analysis.badTrades.some(
        (trade) =>
          trade.attackerId === 1 &&
          trade.targetId === 2 &&
          (trade.reason.includes("Low-value chip attack") ||
            trade.reason.includes("Ineffective matchup"))
      )
    ).toBe(true);
  });

  it("marks ineffective anti-ground/air matchups on healthy targets as bad trades", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "stealth", owner_id: 1, x: 3, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    expect(
      analysis.badTrades.some(
        (trade) =>
          trade.attackerId === 1 &&
          trade.targetId === 2 &&
          trade.reason.includes("Ineffective matchup")
      )
    ).toBe(true);
  });

  it("identifies a weak front and gives transports an explicit mission state", () => {
    let state = makeState(12, 6);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 2 });
    state = addTestUnit(state, { id: 2, unit_type: "t_copter", owner_id: 0, x: 1, y: 1 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 1, x: 10, y: 2 });
    state = addTestUnit(state, { id: 4, unit_type: "tank", owner_id: 1, x: 10, y: 3 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.frontBalance.some((front) => front.status === "weak")).toBe(true);
    expect(analysis.transportMissions).toHaveLength(1);
    expect(["reinforce_front", "no_mission"]).toContain(analysis.transportMissions[0].status);
  });

  it("detects mandatory air-counter production needs", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 0, 0, "factory", { owner_id: 0 });
    state = updatePlayer(state, 0, { funds: 9000 });
    state = addTestUnit(state, { id: 1, unit_type: "b_copter", owner_id: 1, x: 4, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.productionNeeds.needAirCounter).toBe(true);
    expect(analysis.productionNeeds.priorities.some((line) => line.includes("anti_air"))).toBe(
      true
    );
  });

  it("tracks factory spend opportunities and blocked production tiles", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
    state = setTerrain(state, 3, 1, "factory", { owner_id: 0 });
    state = updatePlayer(state, 0, { funds: 3000 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.productionNeeds.factorySpendOpportunities).toBe(1);
    expect(analysis.productionNeeds.blockedProductionTiles).toBe(1);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes("Spend from every empty factory")
      )
    ).toBe(true);
  });

  it("discourages speculative transport buys in the early game", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 1, 1, "port", { owner_id: 0 });
    state = setTerrain(state, 2, 1, "factory", { owner_id: 0 });
    state = updatePlayer(state, 0, { funds: 12000 });
    state = { ...state, turn_number: 6 };
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.productionNeeds.avoidSpeculativeTransportBuys).toBe(true);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes("Do not buy APC/T-Copter/lander/black_boat")
      )
    ).toBe(true);
  });

  it("discourages speculative naval buys on low-sea maps", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 1, 1, "port", { owner_id: 0 });
    state = updatePlayer(state, 0, { funds: 18000 });
    state = { ...state, turn_number: 10 };
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.productionNeeds.avoidSpeculativeNavalBuys).toBe(true);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes("Avoid naval buys on low-sea maps")
      )
    ).toBe(true);
  });

  it("assigns different opening capture targets to early capturers", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 2, 4, "city", { owner_id: -1 });
    state = setTerrain(state, 9, 4, "port", { owner_id: -1 });
    state = { ...state, turn_number: 2 };
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 8, y: 2 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.openingCaptureAssignments).toHaveLength(2);
    const targets = new Set(
      analysis.openingCaptureAssignments.map(
        (assignment) => `${assignment.objectiveX},${assignment.objectiveY}`
      )
    );
    expect(targets.size).toBe(2);
  });

  it("prefers opening expansion targets over enemy-cluster pressure for rear infantry", () => {
    let state = makeState(20, 15);
    state = { ...state, turn_number: 1 };
    state = setTerrain(state, 9, 2, "city", { owner_id: -1 });
    state = setTerrain(state, 5, 9, "city", { owner_id: -1 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 3 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 2, y: 3 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 0, x: 3, y: 2 });
    state = addTestUnit(state, { id: 4, unit_type: "infantry", owner_id: 1, x: 15, y: 12 });
    state = addTestUnit(state, { id: 5, unit_type: "tank", owner_id: 1, x: 15, y: 11 });

    const analysis = analyzeTacticalState(state, 0);
    const assignment = analysis.openingCaptureAssignments.find((entry) => entry.unitId === 1);
    expect(assignment).toBeDefined();
    expect(`${assignment?.objectiveX},${assignment?.objectiveY}`).not.toBe("15,12");
    expect(["9,2", "5,9"]).toContain(`${assignment?.objectiveX},${assignment?.objectiveY}`);
  });

  it("role-aware move scoring favors forward capture progress over sitting on owned HQ tiles", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 1, 1, "hq", { owner_id: 0 });
    state = setTerrain(state, 2, 1, "factory", { owner_id: 0 });
    state = setTerrain(state, 9, 2, "city", { owner_id: -1 });

    const hqScore = scoreTileForAiMove(1, 1, state, 0, true, null, {
      objectiveX: 9,
      objectiveY: 2,
      openingTurn: true,
      avoidOwnedProduction: true,
    });
    const forwardScore = scoreTileForAiMove(4, 3, state, 0, true, null, {
      objectiveX: 9,
      objectiveY: 2,
      openingTurn: true,
      avoidOwnedProduction: true,
    });

    expect(forwardScore).toBeGreaterThan(hqScore);
  });

  it("role-aware move scoring pushes combat units off owned HQ tiles in the opening", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 1, 1, "hq", { owner_id: 0 });

    const hqScore = scoreTileForAiMove(1, 1, state, 0, false, null, {
      objectiveX: 9,
      objectiveY: 2,
      openingTurn: true,
      avoidOwnedProduction: true,
    });
    const forwardScore = scoreTileForAiMove(4, 3, state, 0, false, null, {
      objectiveX: 9,
      objectiveY: 2,
      openingTurn: true,
      avoidOwnedProduction: true,
    });

    expect(forwardScore).toBeGreaterThan(hqScore);
  });

  it("assigns anti-air units to screen visible air threats", () => {
    let state = makeState(10, 10);
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 0, x: 1, y: 1 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 0, x: 4, y: 4 });
    state = addTestUnit(state, { id: 3, unit_type: "b_copter", owner_id: 1, x: 7, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 1 && commitment.purpose === "screen_air_threat"
      )
    ).toBe(true);
  });

  it("pushes units away from a safe HQ", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 1, 1, "hq", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 2 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 8, y: 8 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.idleRearUnits.some((unit) => unit.unitId === 1)).toBe(true);
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 1 && commitment.purpose === "project_power"
      )
    ).toBe(true);
  });

  it("keeps units near HQ when a real HQ threat is present", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 1, 1, "hq", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 2 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 2 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.idleRearUnits.some((unit) => unit.unitId === 1)).toBe(false);
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 1 && commitment.purpose === "hold_hq_defense"
      )
    ).toBe(true);
  });

  it("flags punishable enemy captures on owned properties", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 4, 4, "city", { owner_id: 0, capture_points: 10 });
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 0, x: 5, y: 4 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 4, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.captureDenialOpportunities).toHaveLength(1);
    expect(analysis.captureDenialOpportunities[0].responderUnitIds).toContain(1);
  });

  it("flags overextended enemy occupiers on owned production", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 4, 4, "factory", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 5, y: 4 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 4, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.overextensionPunishOpportunities).toHaveLength(1);
    expect(analysis.overextensionPunishOpportunities[0].responderUnitIds).toContain(1);
  });

  it("flags unsupported frontline vehicles exposed to enemy threat", () => {
    let state = makeState(10, 10);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 4, y: 4 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 6, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.supportRisks.some((risk) => risk.unitId === 1)).toBe(true);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes(
          "Do not push expensive frontline units into enemy threat without nearby support"
        )
      )
    ).toBe(true);
  });

  it("calls for infantry walls when the army is too light on capturers", () => {
    let state = makeState(12, 12);
    state = updatePlayer(state, 0, { funds: 7000 });
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
    state = setTerrain(state, 2, 1, "city", { owner_id: 0 });
    state = setTerrain(state, 3, 1, "city", { owner_id: 0 });
    state = setTerrain(state, 4, 1, "city", { owner_id: 0 });
    state = setTerrain(state, 5, 1, "city", { owner_id: 0 });
    state = setTerrain(state, 6, 1, "city", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 9, y: 9 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.productionNeeds.needInfantryWalls).toBe(true);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes("Keep building infantry to take ground")
      )
    ).toBe(true);
  });

  it("flags damaged units that should retreat to owned repair tiles", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 2, 2, "city", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 4, y: 2, hp: 4 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 6, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.retreatOpportunities.some((opportunity) => opportunity.unitId === 1)).toBe(
      true
    );
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 1 && commitment.purpose === "retreat_to_repair"
      )
    ).toBe(true);
  });

  it("flags strong low-hp merge opportunities without treating them as default play", () => {
    let state = makeState(10, 10);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3, hp: 3 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 0, x: 4, y: 3, hp: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(
      analysis.mergeOpportunities.some(
        (opportunity) => opportunity.unitId === 1 && opportunity.targetUnitId === 2
      )
    ).toBe(true);
    expect(
      analysis.productionNeeds.priorities.some((line) =>
        line.includes("Only merge when both units are badly damaged")
      )
    ).toBe(true);
  });

  it("flags passive capturers lingering near HQ and bases", () => {
    let state = makeState(12, 12);
    state = setTerrain(state, 1, 1, "hq", { owner_id: 0 });
    state = setTerrain(state, 2, 1, "factory", { owner_id: 0 });
    state = setTerrain(state, 6, 6, "city", { owner_id: -1 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 2 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.passiveCapturerWarnings.some((warning) => warning.unitId === 1)).toBe(true);
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 1 && commitment.purpose === "push_capturer"
      )
    ).toBe(true);
  });

  it("identifies indirect coverage and wall integrity around artillery", () => {
    let state = makeState(12, 12);
    state = addTestUnit(state, { id: 1, unit_type: "artillery", owner_id: 0, x: 4, y: 4 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 5, y: 4 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 1, x: 7, y: 4 });

    const analysis = analyzeTacticalState(state, 0);
    expect(analysis.indirectCoverageZones.some((zone) => zone.unitId === 1)).toBe(true);
    expect(analysis.wallIntegrityRisks.some((risk) => risk.unitId === 2)).toBe(true);
  });

  it("flags contested facilities, idle rear units, and trapped ports", () => {
    let state = makeState(10, 10);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
    state = setTerrain(state, 8, 8, "port", { owner_id: 0 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 1 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 2, y: 8 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 1, x: 2, y: 1 });
    state = addTestUnit(state, { id: 4, unit_type: "tank", owner_id: 1, x: 8, y: 2 });

    const analysis = analyzeTacticalState(state, 0);
    expect(
      analysis.facilityEmergencies.some(
        (facility) => facility.facilityX === 1 && facility.facilityY === 1
      )
    ).toBe(true);
    expect(analysis.deadProductionTraps.some((trap) => trap.x === 8 && trap.y === 8)).toBe(true);
    expect(analysis.idleRearUnits.some((unit) => unit.unitId === 2)).toBe(true);
    expect(
      analysis.unitPurposeCommitments.some(
        (commitment) => commitment.unitId === 2 && commitment.purpose === "project_power"
      )
    ).toBe(true);
  });
});
