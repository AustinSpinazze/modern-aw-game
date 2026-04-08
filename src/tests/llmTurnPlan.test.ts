import { describe, it, expect } from "vitest";
import { validatePlan } from "../ai/llmTurnPlan";

describe("validatePlan", () => {
  it("validates a well-formed plan", () => {
    const raw = {
      strategy: "aggressive_push",
      reasoning: "We have superior forces and should press the advantage.",
      directives: [
        { priority: 3, type: "attack", target_ids: [2], reason: "Attack the tank" },
        { priority: 1, type: "capture", reason: "Capture the city" },
        { priority: 2, type: "produce", unit_type: "infantry", reason: "Build more capturers" },
      ],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.plan.strategy).toBe("aggressive_push");
    // Directives should be sorted by priority ascending
    expect(result.plan.directives[0].priority).toBe(1);
    expect(result.plan.directives[1].priority).toBe(2);
    expect(result.plan.directives[2].priority).toBe(3);
  });

  it("rejects null input", () => {
    const result = validatePlan(null);
    expect(result.valid).toBe(false);
  });

  it("rejects missing strategy", () => {
    const raw = { reasoning: "x", directives: [] };
    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error.toLowerCase()).toContain("strategy");
  });

  it("rejects invalid strategy label", () => {
    const raw = { strategy: "yolo", reasoning: "x", directives: [] };
    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error.toLowerCase()).toContain("strategy");
  });

  it("accepts empty directives array", () => {
    const raw = {
      strategy: "economic_expansion",
      reasoning: "Focus on income this turn.",
      directives: [],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.plan.directives).toHaveLength(0);
  });

  it("rejects directive missing priority", () => {
    const raw = {
      strategy: "capture_rush",
      reasoning: "Rush captures.",
      directives: [{ type: "capture", reason: "Get the city" }],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error.toLowerCase()).toContain("priority");
  });

  it("rejects directive with invalid type", () => {
    const raw = {
      strategy: "tempo_trade",
      reasoning: "Trade well.",
      directives: [{ priority: 1, type: "explode", reason: "Blow things up" }],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error.toLowerCase()).toContain("type");
  });

  it("rejects directive missing reason", () => {
    const raw = {
      strategy: "defensive_retreat",
      reasoning: "Fall back.",
      directives: [{ priority: 1, type: "retreat" }],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error.toLowerCase()).toContain("reason");
  });

  it("clamps directives to 8", () => {
    const directives = Array.from({ length: 10 }, (_, i) => ({
      priority: i + 1,
      type: "advance",
      reason: `Move unit ${i + 1} forward`,
    }));
    const raw = { strategy: "aggressive_push", reasoning: "Push everything.", directives };
    const result = validatePlan(raw);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.plan.directives).toHaveLength(8);
  });

  it("sorts directives by priority ascending", () => {
    const raw = {
      strategy: "consolidate_and_counter",
      reasoning: "Hold and counter.",
      directives: [
        { priority: 5, type: "hold", reason: "Hold the line" },
        { priority: 1, type: "attack", reason: "Counter-attack" },
        { priority: 3, type: "screen", unit_ids: [1], reason: "Screen the flank" },
      ],
    };
    const result = validatePlan(raw);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const priorities = result.plan.directives.map((d) => d.priority);
    expect(priorities).toEqual([1, 3, 5]);
  });
});
