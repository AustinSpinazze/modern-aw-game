import { describe, it } from "vitest";

// Placeholder for future runLLMTurn routing tests.
// The stepwise functions (trimCommandsForStepwise, shouldUseStepwiseTacticalEscalation)
// were removed as dead code during Phase 1 refactoring.

describe("runLLMTurn", () => {
  it("is a thin delegate to runBundleBasedLLMTurn", () => {
    // Integration tests for runLLMTurn require a live game state + mocked provider;
    // add them here when the bundle runner has testable surface area.
  });
});
