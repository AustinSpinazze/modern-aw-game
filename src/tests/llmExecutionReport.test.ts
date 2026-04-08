import { describe, it, expect } from "vitest";
import { buildExecutionReport } from "../ai/llmExecutionReport";
import type { TurnPlan, ExecutedBundleRecord } from "../ai/llmTurnPlan";
import type { TacticalAnalysis } from "../ai/tacticalAnalysis";

function makePlan(directives: TurnPlan["directives"]): TurnPlan {
  return { strategy: "aggressive_push", reasoning: "test", directives };
}

function makeBundle(
  id: string,
  matchPriority: number | null,
  matchType: string | null
): ExecutedBundleRecord {
  return {
    bundleId: id,
    kind: "attack",
    label: `test ${id}`,
    matchedDirectivePriority: matchPriority,
    matchedDirectiveType: matchType as ExecutedBundleRecord["matchedDirectiveType"],
    originalScore: 100,
    adjustedScore: 120,
  };
}

// buildExecutionReport marks its analysis param as _analysis (unused),
// so we pass a minimal stub to satisfy the type signature.
const STUB_ANALYSIS = {} as TacticalAnalysis;

describe("buildExecutionReport", () => {
  it("all directives fulfilled gives coherence info in summary", () => {
    const plan = makePlan([
      { priority: 1, type: "attack", reason: "Attack the tank" },
      { priority: 2, type: "capture", reason: "Capture the city" },
    ]);
    const executed = [makeBundle("bundle-a", 1, "attack"), makeBundle("bundle-b", 2, "capture")];
    const report = buildExecutionReport(plan, executed, STUB_ANALYSIS);

    expect(report.directiveFulfillment).toHaveLength(2);
    expect(report.directiveFulfillment.every((d) => d.fulfilled)).toBe(true);
  });

  it("no directives fulfilled", () => {
    const plan = makePlan([
      { priority: 1, type: "attack", reason: "Attack the tank" },
      { priority: 2, type: "produce", unit_type: "infantry", reason: "Build infantry" },
    ]);
    const executed = [makeBundle("bundle-a", null, null), makeBundle("bundle-b", null, null)];
    const report = buildExecutionReport(plan, executed, STUB_ANALYSIS);

    expect(report.directiveFulfillment).toHaveLength(2);
    expect(report.directiveFulfillment.every((d) => !d.fulfilled)).toBe(true);
  });

  it("mixed fulfillment", () => {
    const plan = makePlan([
      { priority: 1, type: "attack", reason: "Attack" },
      { priority: 2, type: "capture", reason: "Capture" },
      { priority: 3, type: "produce", unit_type: "tank", reason: "Produce" },
    ]);
    const executed = [
      makeBundle("bundle-a", 1, "attack"),
      makeBundle("bundle-b", 2, "capture"),
      makeBundle("bundle-c", null, null),
    ];
    const report = buildExecutionReport(plan, executed, STUB_ANALYSIS);

    expect(report.directiveFulfillment).toHaveLength(3);
    const fulfilled = report.directiveFulfillment.filter((d) => d.fulfilled);
    const unfulfilled = report.directiveFulfillment.filter((d) => !d.fulfilled);
    expect(fulfilled).toHaveLength(2);
    expect(unfulfilled).toHaveLength(1);
    expect(unfulfilled[0].priority).toBe(3);
  });

  it("unplanned actions counted", () => {
    const plan = makePlan([{ priority: 1, type: "attack", reason: "Attack" }]);
    const executed = [
      makeBundle("bundle-a", 1, "attack"),
      makeBundle("bundle-b", null, null),
      makeBundle("bundle-c", null, null),
    ];
    const report = buildExecutionReport(plan, executed, STUB_ANALYSIS);

    expect(report.unplannedActions).toHaveLength(2);
    expect(report.unplannedActions[0]).toContain("bundle-b");
    expect(report.unplannedActions[1]).toContain("bundle-c");
  });

  it("summary includes strategy label", () => {
    const plan = makePlan([{ priority: 1, type: "retreat", reason: "Fall back" }]);
    const executed = [makeBundle("bundle-a", 1, "retreat")];
    const report = buildExecutionReport(plan, executed, STUB_ANALYSIS);

    expect(report.summary).toContain("aggressive_push");
  });
});
