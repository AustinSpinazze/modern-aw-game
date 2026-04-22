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

  it("suppresses anti-air counter bonus when own AA count meets enemy air count", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 9000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "anti_air", owner_id: 0, x: 4, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "b_copter", owner_id: 1, x: 6, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const aaBuyBundles = catalog.bundles.filter(
      (bundle) => bundle.kind === "buy" && bundle.label.includes("BUY anti_air")
    );

    expect(aaBuyBundles.every((bundle) => !bundle.tags.includes("counter"))).toBe(true);
  });

  it("boosts tank production when enemy armor pressures owned factory", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 9000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 1, x: 2, y: 1, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const factoryBuys = catalog.bundles.filter(
      (bundle) => bundle.kind === "buy" && bundle.label.includes("at (1,1)")
    );
    const tankBuy = factoryBuys.find((bundle) => bundle.label.includes("BUY tank"));
    const infantryBuys = factoryBuys.filter((bundle) => bundle.label.includes("BUY infantry"));
    const artilleryBuys = factoryBuys.filter((bundle) => bundle.label.includes("BUY artillery"));

    expect(tankBuy).toBeDefined();
    expect(tankBuy!.tags).toContain("emergency_counter");
    for (const inf of infantryBuys) {
      expect(tankBuy!.score).toBeGreaterThan(inf.score);
    }
    for (const art of artilleryBuys) {
      expect(tankBuy!.score).toBeGreaterThan(art.score);
    }
  });

  it("adds army_deficit tag to buy bundles when significantly outnumbered", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 7000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "infantry", owner_id: 0, x: 0, y: 0, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 0, x: 1, y: 0, hp: 10 });
    state = addTestUnit(state, { id: 10, unit_type: "infantry", owner_id: 1, x: 5, y: 5, hp: 10 });
    state = addTestUnit(state, { id: 11, unit_type: "infantry", owner_id: 1, x: 6, y: 5, hp: 10 });
    state = addTestUnit(state, { id: 12, unit_type: "infantry", owner_id: 1, x: 7, y: 5, hp: 10 });
    state = addTestUnit(state, { id: 13, unit_type: "infantry", owner_id: 1, x: 5, y: 6, hp: 10 });
    state = addTestUnit(state, { id: 14, unit_type: "infantry", owner_id: 1, x: 6, y: 6, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const buyBundles = catalog.bundles.filter((bundle) => bundle.kind === "buy");

    expect(buyBundles.some((bundle) => bundle.tags.includes("army_deficit"))).toBe(true);
  });

  it("applies build order template tags at 9k income with two factories", () => {
    let state = makeState(10, 10);
    for (let i = 0; i < 9; i++) {
      state = setTerrain(state, 0, i, "city", { owner_id: 0, capture_points: 20 });
    }
    state = setTerrain(state, 1, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = setTerrain(state, 3, 1, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 9000 } : p)),
    };

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const buyBundles = catalog.bundles.filter((bundle) => bundle.kind === "buy");

    expect(buyBundles.some((bundle) => bundle.tags.includes("template_infantry"))).toBe(true);
    expect(buyBundles.some((bundle) => bundle.tags.includes("template_tank"))).toBe(true);
  });

  it("offers md_tank buy when tech-up conditions are met", () => {
    let state = makeState(10, 10);
    for (let i = 0; i < 10; i++) {
      state = setTerrain(state, 0, i, "city", { owner_id: 0, capture_points: 20 });
    }
    for (let i = 0; i < 6; i++) {
      state = setTerrain(state, 1, i, "city", { owner_id: 0, capture_points: 20 });
    }
    state = setTerrain(state, 2, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = setTerrain(state, 4, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 20000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 0, x: 4, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 0, x: 5, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 4, unit_type: "infantry", owner_id: 0, x: 2, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 5, unit_type: "tank", owner_id: 0, x: 7, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 6, unit_type: "tank", owner_id: 0, x: 8, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 10, unit_type: "tank", owner_id: 1, x: 7, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 11, unit_type: "tank", owner_id: 1, x: 8, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.bundles.some((bundle) => bundle.label.includes("BUY md_tank"))).toBe(true);
  });

  it("offers neo_tank buy as counter when enemy has heavy armor", () => {
    let state = makeState(10, 10);
    for (let i = 0; i < 10; i++) {
      state = setTerrain(state, 0, i, "city", { owner_id: 0, capture_points: 20 });
    }
    for (let i = 0; i < 6; i++) {
      state = setTerrain(state, 1, i, "city", { owner_id: 0, capture_points: 20 });
    }
    state = setTerrain(state, 2, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = setTerrain(state, 4, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 25000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 0, x: 4, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 0, x: 5, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 4, unit_type: "infantry", owner_id: 0, x: 2, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 5, unit_type: "tank", owner_id: 0, x: 7, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 6, unit_type: "tank", owner_id: 0, x: 8, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 12, unit_type: "infantry", owner_id: 0, x: 1, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 13, unit_type: "infantry", owner_id: 0, x: 2, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 14, unit_type: "infantry", owner_id: 0, x: 3, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 15, unit_type: "infantry", owner_id: 0, x: 4, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 16, unit_type: "infantry", owner_id: 0, x: 5, y: 4, hp: 10 });
    state = addTestUnit(state, { id: 17, unit_type: "tank", owner_id: 0, x: 7, y: 5, hp: 10 });
    state = addTestUnit(state, { id: 18, unit_type: "tank", owner_id: 0, x: 8, y: 5, hp: 10 });
    state = addTestUnit(state, { id: 10, unit_type: "md_tank", owner_id: 1, x: 7, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 11, unit_type: "md_tank", owner_id: 1, x: 8, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);
    const neoTankBundle = catalog.bundles.find((bundle) => bundle.label.includes("BUY neo_tank"));

    expect(neoTankBundle).toBeDefined();
    expect(neoTankBundle!.tags).toContain("counter");
  });

  it("never offers mega_tank buy", () => {
    let state = makeState(10, 10);
    for (let i = 0; i < 10; i++) {
      state = setTerrain(state, 0, i, "city", { owner_id: 0, capture_points: 20 });
    }
    for (let i = 0; i < 6; i++) {
      state = setTerrain(state, 1, i, "city", { owner_id: 0, capture_points: 20 });
    }
    state = setTerrain(state, 2, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = setTerrain(state, 4, 0, "factory", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 30000 } : p)),
    };
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 0, x: 4, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "tank", owner_id: 0, x: 5, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 4, unit_type: "infantry", owner_id: 0, x: 2, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 10, unit_type: "tank", owner_id: 1, x: 7, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 11, unit_type: "tank", owner_id: 1, x: 8, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.bundles.some((bundle) => bundle.label.includes("BUY mega_tank"))).toBe(false);
  });

  it("does not skip favorable tank vs infantry attack even without support", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 2, y: 2, hp: 10 });
    // 8 HP: MG damage finishes the target (finishOff) so unsupported-chip skip does not apply
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 3, y: 2, hp: 8 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(
      catalog.bundles.some((bundle) => bundle.label.includes("ATTACK enemy 2 with unit 1"))
    ).toBe(true);
  });

  it("penalizes purposeless movement into enemy threat tiles", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 1, y: 1, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "tank", owner_id: 1, x: 5, y: 1, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "infantry", owner_id: 1, x: 5, y: 2, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const moveWaits = catalog.bundles.filter((b) => b.kind === "move_wait" && b.unitId === 1);
    const safeMoves = moveWaits.filter(
      (b) => b.tags.includes("safe") && !b.tags.includes("entering_threat")
    );
    const threatMoves = moveWaits.filter((b) => b.tags.includes("entering_threat"));
    if (safeMoves.length > 0 && threatMoves.length > 0) {
      const bestSafe = Math.max(...safeMoves.map((b) => b.score));
      const bestThreat = Math.max(...threatMoves.map((b) => b.score));
      expect(bestSafe).toBeGreaterThan(bestThreat);
    }
  });

  it("suppresses retreat when unit has a favorable attack", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 0, 2, "city", { owner_id: 0, capture_points: 20 });
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 2, y: 2, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "infantry", owner_id: 1, x: 3, y: 2, hp: 8 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const attackBundle = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 2")
    );
    expect(attackBundle).toBeDefined();

    const retreatBundles = catalog.bundles.filter(
      (b) => b.unitId === 1 && b.tags.includes("retreat")
    );
    if (retreatBundles.length > 0) {
      for (const retreat of retreatBundles) {
        expect(retreat.tags).toContain("retreat_suppressed");
        expect(attackBundle!.score).toBeGreaterThan(retreat.score);
      }
    }
  });

  it("anti-air prefers attacking b_copter over infantry when both in range", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "b_copter", owner_id: 1, x: 4, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 3, unit_type: "infantry", owner_id: 1, x: 3, y: 4, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const copterAttack = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 2")
    );
    const infantryAttack = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 3")
    );

    expect(copterAttack).toBeDefined();
    expect(copterAttack!.tags).not.toContain("skip");
    if (infantryAttack) {
      expect(copterAttack!.score).toBeGreaterThan(infantryAttack.score);
    }
  });

  it("strong anti-air vs b_copter attack is not skipped even without support", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "anti_air", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 2, unit_type: "b_copter", owner_id: 1, x: 4, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const attackBundle = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 2")
    );

    expect(attackBundle).toBeDefined();
    expect(attackBundle!.tags).toContain("combat");
    // B-Copter missile chip keeps counterDamage above dominant/hard_counter thresholds; bundle should still clear min score
    expect(attackBundle!.score).toBeGreaterThanOrEqual(20);
  });

  it("tank prefers attacking high-value target over low-value when both available", () => {
    let state = makeState(8, 8);
    state = addTestUnit(state, { id: 1, unit_type: "tank", owner_id: 0, x: 3, y: 3, hp: 10 });
    state = addTestUnit(state, {
      id: 2,
      unit_type: "artillery",
      owner_id: 1,
      x: 4,
      y: 3,
      hp: 10,
    });
    state = addTestUnit(state, { id: 3, unit_type: "infantry", owner_id: 1, x: 3, y: 4, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    const artilleryAttack = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 2")
    );
    const infantryAttack = catalog.bundles.find(
      (b) =>
        (b.kind === "attack" || b.kind === "move_attack") &&
        b.unitId === 1 &&
        b.label.includes("enemy 3")
    );

    expect(artilleryAttack).toBeDefined();
    if (infantryAttack) {
      expect(artilleryAttack!.score).toBeGreaterThan(infantryAttack.score);
    }
  });

  it("suppresses b_copter buys when enemy has 2+ anti-air", () => {
    let state = makeState(8, 8);
    state = setTerrain(state, 1, 1, "airport", { owner_id: 0, capture_points: 20 });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 0 ? { ...p, funds: 12000 } : p)),
    };
    state = addTestUnit(state, { id: 10, unit_type: "anti_air", owner_id: 1, x: 5, y: 3, hp: 10 });
    state = addTestUnit(state, { id: 11, unit_type: "anti_air", owner_id: 1, x: 6, y: 3, hp: 10 });

    const analysis = analyzeTacticalState(state, 0);
    const catalog = buildActionBundleCatalog(state, 0, analysis);

    expect(catalog.bundles.some((bundle) => bundle.label.includes("BUY b_copter"))).toBe(false);
  });
});
