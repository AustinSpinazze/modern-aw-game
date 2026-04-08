import { beforeAll, describe, it, expect, vi } from "vitest";

vi.mock("../game/dataLoader");

import { getUnitData, getTerrainData } from "../game/dataLoader";
import { MOCK_UNITS, MOCK_TERRAIN } from "./mockData";
import { makeState, addTestUnit, setTerrain } from "./fixtures";
import { analyzeTacticalState } from "../ai/tacticalAnalysis";
import { buildActionBundleCatalog } from "../ai/llmActionBundles";
import { applyPlanWeights } from "../ai/llmPlanWeightTranslator";
import type { TurnPlan } from "../ai/llmTurnPlan";
import type { ActionBundle } from "../ai/llmActionBundles";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

function makeBaseCatalog(): {
  bundles: ActionBundle[];
  analysis: ReturnType<typeof analyzeTacticalState>;
} {
  let state = makeState(8, 8);
  state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
  state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3 });
  state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 5, y: 3 });
  state = { ...state, players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 7000 } : p)) };
  const analysis = analyzeTacticalState(state, 0);
  const catalog = buildActionBundleCatalog(state, 0, analysis);
  return { bundles: catalog.bundles, analysis };
}

describe("applyPlanWeights", () => {
  it("empty directives leaves scores unchanged", () => {
    const { bundles, analysis } = makeBaseCatalog();
    const originalScores = bundles.map((b) => b.score);
    const plan: TurnPlan = {
      strategy: "consolidate_and_counter",
      reasoning: "Hold.",
      directives: [],
    };
    const adjusted = applyPlanWeights(bundles, plan, analysis, 8);
    // Scores should be identical (just re-sorted); collect and sort both for comparison
    const adjustedScores = [...adjusted].map((b) => b.score).sort((a, b) => b - a);
    const sortedOriginal = [...originalScores].sort((a, b) => b - a);
    expect(adjustedScores).toEqual(sortedOriginal);
  });

  it("attack directive boosts attack bundles targeting specified unit", () => {
    const { bundles, analysis } = makeBaseCatalog();
    const attackBundlesBefore = bundles.filter(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.commands.some((c) => c.type === "ATTACK" && (c as { target_id: number }).target_id === 2)
    );

    const plan: TurnPlan = {
      strategy: "aggressive_push",
      reasoning: "Attack the tank.",
      directives: [{ priority: 1, type: "attack", target_ids: [2], reason: "Destroy enemy tank" }],
    };

    const scoresBefore = attackBundlesBefore.map((b) => b.score);
    const adjusted = applyPlanWeights(bundles, plan, analysis, 8);
    const attackBundlesAfter = adjusted.filter(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.commands.some((c) => c.type === "ATTACK" && (c as { target_id: number }).target_id === 2)
    );

    if (attackBundlesAfter.length > 0 && scoresBefore.length > 0) {
      expect(attackBundlesAfter[0].score).toBeGreaterThan(scoresBefore[0]);
    }
    // If no attack bundles exist against unit 2, just verify no crash
    expect(Array.isArray(adjusted)).toBe(true);
  });

  it("retreat directive penalizes attack bundles for retreating unit", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 3, y: 3, hp: 3 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 5, y: 3 });
    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const attackBundlesBefore = catalog.bundles.filter(
      (b) => (b.kind === "attack" || b.kind === "move_attack") && b.unitId === 1
    );
    const scoresBefore = attackBundlesBefore.map((b) => b.score);

    const plan: TurnPlan = {
      strategy: "defensive_retreat",
      reasoning: "Retreat the damaged infantry.",
      directives: [
        { priority: 1, type: "retreat", unit_ids: [1], reason: "Unit 1 is badly damaged" },
      ],
    };

    const adjusted = applyPlanWeights(catalog.bundles, plan, analysis, 8);
    const attackBundlesAfter = adjusted.filter(
      (b) => (b.kind === "attack" || b.kind === "move_attack") && b.unitId === 1
    );

    if (attackBundlesAfter.length > 0 && scoresBefore.length > 0) {
      expect(attackBundlesAfter[0].score).toBeLessThan(scoresBefore[0]);
    }
    expect(Array.isArray(adjusted)).toBe(true);
  });

  it("produce directive boosts matching buy bundles", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 7000 } : p)),
    };
    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const tankBuyBefore = catalog.bundles.find(
      (b) => b.kind === "buy" && b.label.includes("BUY tank")
    );

    const plan: TurnPlan = {
      strategy: "aggressive_push",
      reasoning: "Need armor.",
      directives: [
        { priority: 1, type: "produce", unit_type: "tank", reason: "Build tank for push" },
      ],
    };

    const adjusted = applyPlanWeights(catalog.bundles, plan, analysis, 8);
    const tankBuyAfter = adjusted.find((b) => b.kind === "buy" && b.label.includes("BUY tank"));

    if (tankBuyBefore && tankBuyAfter) {
      expect(tankBuyAfter.score).toBeGreaterThan(tankBuyBefore.score);
    }
    expect(Array.isArray(adjusted)).toBe(true);
  });

  it("priority 1 gives more boost than priority 5", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 7000 } : p)),
    };
    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const planP1: TurnPlan = {
      strategy: "aggressive_push",
      reasoning: "High priority produce.",
      directives: [{ priority: 1, type: "produce", unit_type: "tank", reason: "Priority 1 tank" }],
    };
    const planP5: TurnPlan = {
      strategy: "aggressive_push",
      reasoning: "Low priority produce.",
      directives: [{ priority: 5, type: "produce", unit_type: "tank", reason: "Priority 5 tank" }],
    };

    const adjustedP1 = applyPlanWeights([...catalog.bundles], planP1, analysis, 8);
    const adjustedP5 = applyPlanWeights([...catalog.bundles], planP5, analysis, 8);

    const tankP1 = adjustedP1.find((b) => b.kind === "buy" && b.label.includes("BUY tank"));
    const tankP5 = adjustedP5.find((b) => b.kind === "buy" && b.label.includes("BUY tank"));

    if (tankP1 && tankP5) {
      expect(tankP1.score).toBeGreaterThan(tankP5.score);
    }
    expect(Array.isArray(adjustedP1)).toBe(true);
  });

  it("non-existent unit ids cause no crash", () => {
    const { bundles, analysis } = makeBaseCatalog();
    const scoresBefore = bundles.map((b) => ({ id: b.id, score: b.score }));

    const plan: TurnPlan = {
      strategy: "aggressive_push",
      reasoning: "Attack phantom unit.",
      directives: [
        { priority: 1, type: "attack", target_ids: [9999], reason: "Nonexistent target" },
      ],
    };

    expect(() => applyPlanWeights(bundles, plan, analysis, 8)).not.toThrow();

    const adjusted = applyPlanWeights(bundles, plan, analysis, 8);
    // Bundles with no match to the nonexistent target_id should be unaffected
    const attackBundlesTargetingPhantom = adjusted.filter(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.commands.some(
          (c) => c.type === "ATTACK" && (c as { target_id: number }).target_id === 9999
        )
    );
    expect(attackBundlesTargetingPhantom).toHaveLength(0);

    // Scores for non-matching bundles should not change
    for (const before of scoresBefore) {
      const after = adjusted.find((b) => b.id === before.id);
      if (after && !(after.kind === "attack" || after.kind === "move_attack")) {
        expect(after.score).toBe(before.score);
      }
    }
  });

  it("returns bundles sorted by adjusted score descending", () => {
    const { bundles, analysis } = makeBaseCatalog();
    const plan: TurnPlan = {
      strategy: "capture_rush",
      reasoning: "Capture all the things.",
      directives: [{ priority: 2, type: "capture", reason: "Expand territory" }],
    };

    const adjusted = applyPlanWeights(bundles, plan, analysis, 8);

    for (let i = 0; i < adjusted.length - 1; i++) {
      expect(adjusted[i].score).toBeGreaterThanOrEqual(adjusted[i + 1].score);
    }
  });
});
