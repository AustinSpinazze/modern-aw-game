import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../game/dataLoader");

import { getTerrainData, getUnitData } from "../game/dataLoader";
import { buildActionBundleCatalog, determineDecisionRoute } from "../ai/llmActionBundles";
import { analyzeTacticalState } from "../ai/tacticalAnalysis";
import { addTestUnit, makeState, setTerrain } from "./fixtures";
import { MOCK_TERRAIN, MOCK_UNITS } from "./mockData";

beforeAll(() => {
  vi.mocked(getUnitData).mockImplementation((id) => MOCK_UNITS[id] ?? null);
  vi.mocked(getTerrainData).mockImplementation((id) => MOCK_TERRAIN[id] ?? null);
});

describe("llm action bundles", () => {
  it("routes contested facility turns as emergencies and offers emergency bundles", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 2, 2, "port", { owner_id: 0, capture_points: 10 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 2, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 2, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    expect(determineDecisionRoute(analysis)).toBe("emergency");

    const catalog = buildActionBundleCatalog(state, 0, analysis);
    expect(catalog.route).toBe("emergency");
    expect(catalog.routeSummary.length).toBeGreaterThan(0);
    expect(catalog.bundles.some((bundle) => bundle.kind === "end_turn")).toBe(true);
  });

  it("routes expansion turns toward capture-focused decisions", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 2, 1, "city", { owner_id: -1, capture_points: 20 });
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.route).toBe("capture");
    expect(catalog.routeSummary.length).toBeGreaterThan(0);
  });

  it("offers at least one non-end bundle for a ready opening unit", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 1, y: 1, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.bundles.some((bundle) => bundle.kind !== "end_turn")).toBe(true);
  });

  it("avoids speculative black boat buys on quiet ports", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "port", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((player) =>
        player.id === 0 ? { ...player, funds: 8000 /* properties computed from map */ } : player
      ),
    };

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.bundles.some((bundle) => bundle.label.includes("BUY black_boat"))).toBe(false);
  });

  it("avoids low-value infantry chip attacks into armor", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 2, y: 2, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 3, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(
      catalog.bundles.some((bundle) => bundle.label.includes("ATTACK enemy 2 with unit 1"))
    ).toBe(false);
  });

  it("avoids unsupported early tank trades with no finish or emergency purpose", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 2, y: 2, hp: 8 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 3, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(
      catalog.bundles.some((bundle) => bundle.label.includes("ATTACK enemy 2 with unit 1"))
    ).toBe(false);
  });

  it("does not prefer feeding b_copters into anti-air pressure near owned production", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = setTerrain(state, 2, 1, "airport", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((player) =>
        player.id === 0 ? { ...player, funds: 9000 /* properties computed from map */ } : player
      ),
    };
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 1, x: 4, y: 1, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const buyBundles = catalog.bundles.filter((bundle) => bundle.kind === "buy");
    const bestBuy = buyBundles.sort((a, b) => b.score - a.score)[0];

    expect(bestBuy?.label.includes("BUY b_copter")).toBe(false);
  });
});
