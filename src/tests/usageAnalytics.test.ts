import { describe, expect, it } from "vitest";

import { buildSession, detectGameSessions } from "../lib/usageAnalytics";
import type { UsageEntry } from "../store/usageStore";

describe("usage analytics session grouping", () => {
  it("includes turn failures in the same match session without diluting tactical averages", () => {
    const entries: UsageEntry[] = [
      {
        timestamp: 1000,
        provider: "openai",
        model: "o3-mini",
        playerId: 0,
        inputTokens: 100,
        outputTokens: 50,
        context: "game_turn",
        matchId: "match_a",
        tacticalMetrics: {
          badTradeAttacks: 2,
          missedEasyCaptures: 1,
          missedFactoryBuilds: 0,
          unjustifiedBlockedProductionTiles: 0,
          freeHitConversions: 1,
          averageUnspentFundsWhenProductionExists: 1000,
          correctCounterBuy: true,
        },
        policyViolations: ["2 bad-trade attacks selected"],
      },
      {
        timestamp: 2000,
        provider: "openai",
        model: "o3-mini",
        playerId: 0,
        inputTokens: 0,
        outputTokens: 0,
        context: "game_turn_failure",
        matchId: "match_a",
        failureCategory: "parse",
        failureMessage: "Could not parse JSON array",
        failureAttempts: 3,
      },
    ];

    const sessions = detectGameSessions(entries);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tacticalSummary.turnCount).toBe(1);
    expect(sessions[0].tacticalSummary.failureCount).toBe(1);
    expect(sessions[0].tacticalSummary.avgBadTradeAttacks).toBe(2);
    expect(sessions[0].participants[0].turnCount).toBe(1);
    expect(sessions[0].participants[0].tacticalSummary.failureCategories).toContain("parse");
  });

  it("buildSession counts only successful game turns as participant turns", () => {
    const session = buildSession(1, [
      {
        timestamp: 1000,
        provider: "openai",
        model: "gpt-4o-mini",
        playerId: 1,
        inputTokens: 20,
        outputTokens: 10,
        context: "game_turn",
        matchId: "match_b",
        tacticalMetrics: {
          badTradeAttacks: 0,
          missedEasyCaptures: 0,
          missedFactoryBuilds: 1,
          unjustifiedBlockedProductionTiles: 0,
          freeHitConversions: 0,
          averageUnspentFundsWhenProductionExists: 500,
          correctCounterBuy: true,
        },
      },
      {
        timestamp: 1500,
        provider: "openai",
        model: "gpt-4o-mini",
        playerId: 1,
        inputTokens: 0,
        outputTokens: 0,
        context: "game_turn_failure",
        matchId: "match_b",
        failureCategory: "quality",
        failureMessage: "Low-purpose turn",
        failureAttempts: 2,
      },
    ]);

    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].turnCount).toBe(1);
    expect(session.participants[0].tacticalSummary.failureCount).toBe(1);
    expect(session.participants[0].tacticalSummary.avgMissedFactoryBuilds).toBe(1);
  });
});
