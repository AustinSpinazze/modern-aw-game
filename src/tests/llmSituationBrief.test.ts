import { beforeAll, describe, it, expect, vi } from "vitest";

vi.mock("../game/dataLoader");

import { getUnitData, getTerrainData } from "../game/dataLoader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mockData";
import { makeState, addTestUnit, setTerrain } from "./fixtures";
import { analyzeTacticalState } from "../ai/tacticalAnalysis";
import { buildSituationBrief, buildStrategicSystemPrompt } from "../ai/llmSituationBrief";
import type { ExecutionReport } from "../ai/llmTurnPlan";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

describe("buildSituationBrief", () => {
  it("includes turn number and funds in briefing", () => {
    let state = makeState(8, 8);
    state = { ...state, turn_number: 5 };
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 3000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1 });

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, null);

    expect(brief).toContain("Turn:");
    expect(brief).toContain("Funds:");
  });

  it("includes front status", () => {
    let state = makeState(12, 6);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 2 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 10, y: 2 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 1, x: 10, y: 3 });

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, null);

    expect(brief).toContain("FRONTS");
  });

  it("includes capture opportunities", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 2, 1, "city", { owner_id: -1, capture_points: 20 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1 });

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, null);

    expect(brief.includes("EXPANSION TARGETS") || brief.includes("ACTIVE CAPTURES")).toBe(true);
  });

  it("includes threats section when facility emergency exists", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 2, 2, "factory", { owner_id: 0, capture_points: 20 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 1, x: 2, y: 3 });

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, null);

    expect(brief).toContain("THREATS");
  });

  it("respects character limit", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1 });

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, null);

    expect(brief.length).toBeLessThanOrEqual(16000);
  });

  it("includes previous turn report when provided", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1 });

    const mockReport: ExecutionReport = {
      plan: { strategy: "aggressive_push", reasoning: "test", directives: [] },
      executedBundles: [],
      directiveFulfillment: [],
      unplannedActions: [],
      summary: "test summary",
    };

    const analysis = analyzeTacticalState(state, 0);
    const brief = buildSituationBrief(state, 0, analysis, mockReport);

    expect(brief).toContain("PREVIOUS TURN");
  });

  it("system prompt includes player id", () => {
    const prompt = buildStrategicSystemPrompt(0);
    expect(prompt).toContain("player 0");
  });

  it("system prompt mentions JSON format", () => {
    const prompt = buildStrategicSystemPrompt(1);
    expect(prompt).toContain("JSON");
  });
});
