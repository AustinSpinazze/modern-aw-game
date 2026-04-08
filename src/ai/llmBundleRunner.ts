import { appendLlmDebugLog, type LlmBundleDecisionLog } from "./llmDebugLog";
import { runHeuristicTurn } from "./heuristic";
import { buildActionBundleCatalog, type ActionBundle } from "./llmActionBundles";
import type { ChatMessage } from "./llmProviders";
import {
  callAnthropicViaIPC,
  callGeminiViaIPC,
  callOpenAIViaIPC,
  callOllama,
} from "./llmProviders";
import { analyzeTacticalState } from "./tacticalAnalysis";
import { useConfigStore } from "../store/configStore";
import { useGameStore } from "../store/gameStore";
import { useUsageStore } from "../store/usageStore";
import type { GameCommand } from "../game/types";
import {
  validatePlan,
  type TurnPlan,
  type ExecutedBundleRecord,
  type DirectiveType,
} from "./llmTurnPlan";
import { buildSituationBrief, buildStrategicSystemPrompt } from "./llmSituationBrief";
import { applyPlanWeights } from "./llmPlanWeightTranslator";
import { buildExecutionReport } from "./llmExecutionReport";

function waitForQueueComplete(): Promise<void> {
  return new Promise<void>((resolve) => {
    const immediate = useGameStore.getState();
    if (!immediate.processingQueue && !immediate.isAnimating) {
      resolve();
      return;
    }
    const unsub = useGameStore.subscribe((state) => {
      if (!state.processingQueue && !state.isAnimating) {
        unsub();
        resolve();
      }
    });
  });
}

async function waitForQueueAndPossibleHandoff(
  playerId: number,
  queued: GameCommand[]
): Promise<void> {
  await waitForQueueComplete();
  const hadEndTurn = queued.some((command) => command.type === "END_TURN");
  if (!hadEndTurn) return;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const state = useGameStore.getState().gameState;
    if (!state || state.phase !== "action") return;
    const current = state.players[state.current_player_index];
    if (!current || current.id !== playerId) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

function waitForSignalOrTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<never> {
  return new Promise((_, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`LLM call timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    const onAbort = () => {
      cleanup();
      reject(new Error("LLM turn aborted"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function callProvider(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  messages: ChatMessage[],
  model: string,
  matchId?: string,
  harnessMode?: "llm_only" | "llm_scaffolded" | "hybrid",
  playerId?: number
): Promise<string> {
  const options = { usageContext: "game_turn", maxTokens: 1200, matchId, harnessMode, playerId };
  if (provider === "anthropic") return callAnthropicViaIPC(messages, model, options);
  if (provider === "openai") return callOpenAIViaIPC(messages, model, options);
  if (provider === "gemini") return callGeminiViaIPC(messages, model, options);
  return callOllama(messages, model, options);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildSystemPrompt(playerId: number): string {
  return [
    `You are selecting the next legal action bundle for player ${playerId} in a turn-based tactics game.`,
    "You do not write raw commands. You must choose exactly one bundle_id from the menu provided.",
    'Return only JSON like {"bundle_id":"B7"}.',
    "No prose. No markdown. No explanations.",
  ].join("\n");
}

function buildSelectionPrompt(
  playerId: number,
  turnNumber: number,
  route: string,
  routeSummary: string[],
  bundles: ActionBundle[],
  retryMessage?: string | null
): string {
  const lines: string[] = [];
  lines.push(`TURN ${turnNumber} | player ${playerId}`);
  lines.push(`Decision route: ${route}`);
  if (routeSummary.length > 0) {
    lines.push("Route priorities:");
    for (const line of routeSummary) lines.push(`- ${line}`);
  }
  lines.push("");
  lines.push("Choose exactly one bundle_id from this legal action menu:");
  lines.push("Prefer attacking high-value targets over low-value ones when both are available.");
  for (const bundle of bundles) {
    lines.push(
      `- ${bundle.id} score=${Math.round(bundle.score)} tags=${bundle.tags.join(",")}: ${bundle.label}`
    );
  }
  lines.push("");
  lines.push('Return only {"bundle_id":"..."}');
  if (retryMessage) {
    lines.push("");
    lines.push("Previous response issue:");
    lines.push(retryMessage);
  }
  return lines.join("\n");
}

function isRouteCompliant(
  route: string,
  bundle: ActionBundle,
  bundles: ActionBundle[]
): string | null {
  const actionableNonEndBundles = bundles.filter((entry) => entry.kind !== "end_turn");
  const meaningfulNonEndBundles = actionableNonEndBundles.filter(
    (entry) => !(entry.tags.includes("fallback") && entry.kind === "wait")
  );

  if (bundle.kind === "end_turn" && meaningfulNonEndBundles.length > 0) {
    const best = meaningfulNonEndBundles[0];
    return `Do not end turn while a viable legal bundle exists. Choose a non-END bundle such as ${best.id}.`;
  }

  if (bundle.kind === "end_turn" && actionableNonEndBundles.length > 0) {
    const best = actionableNonEndBundles[0];
    return `Do not end turn while legal unit actions remain. Choose a non-END bundle such as ${best.id}.`;
  }

  if (route === "emergency") {
    const emergencyBundles = bundles.filter((entry) => entry.tags.includes("emergency"));
    if (
      emergencyBundles.length > 0 &&
      !bundle.tags.includes("emergency") &&
      bundle.kind !== "end_turn"
    ) {
      return "You must choose a bundle tagged emergency while emergency bundles are available.";
    }
    if (emergencyBundles.length > 0 && bundle.kind === "end_turn") {
      return "Do not end turn while emergency-response bundles are available.";
    }
  }
  if (route === "capture") {
    const captureBundles = bundles.filter((entry) => entry.tags.includes("capture"));
    if (captureBundles.length > 0 && bundle.kind === "end_turn") {
      return "Do not end turn while capture bundles are available.";
    }
  }
  return null;
}

function buildBundleDecisionLog(
  route: string,
  bundles: ActionBundle[],
  selectedBundle?: ActionBundle | null
): LlmBundleDecisionLog {
  const topAvailableBundles = bundles.slice(0, 5).map((bundle) => ({
    id: bundle.id,
    label: bundle.label,
    score: Math.round(bundle.score),
    tags: bundle.tags,
  }));
  const selectedScore = selectedBundle?.score ?? undefined;
  const skippedHigherScoreBundles = selectedBundle
    ? bundles
        .filter((bundle) => bundle.id !== selectedBundle.id && bundle.score > selectedBundle.score)
        .slice(0, 5)
        .map((bundle) => ({
          id: bundle.id,
          label: bundle.label,
          score: Math.round(bundle.score),
          tags: bundle.tags,
          scoreDelta: Math.round(bundle.score - selectedBundle.score),
        }))
    : [];

  return {
    route,
    selectedBundleId: selectedBundle?.id,
    selectedBundleLabel: selectedBundle?.label,
    selectedBundleScore: selectedScore !== undefined ? Math.round(selectedScore) : undefined,
    selectedBundleTags: selectedBundle?.tags,
    topAvailableBundles,
    skippedHigherScoreBundles,
  };
}

function getModelForProvider(provider: "anthropic" | "openai" | "gemini" | "local_http"): string {
  const config = useConfigStore.getState();
  if (provider === "anthropic") return config.anthropicModel || "claude-sonnet-4-6";
  if (provider === "openai") return config.openaiModel || "gpt-4o-mini";
  if (provider === "gemini") return config.geminiModel || "gemini-2.5-flash";
  return config.ollamaModel || "llama3.2";
}

function matchBundleToDirective(
  bundle: ActionBundle,
  plan: TurnPlan
): { priority: number; type: DirectiveType } | null {
  for (const directive of plan.directives) {
    if (
      directive.type === "attack" &&
      (bundle.kind === "attack" || bundle.kind === "move_attack")
    ) {
      if (!directive.target_ids?.length)
        return { priority: directive.priority, type: directive.type };
      const targetIds = bundle.commands
        .filter(
          (c): c is GameCommand & { type: "ATTACK"; target_id: number } => c.type === "ATTACK"
        )
        .map((c) => c.target_id);
      if (targetIds.some((tid) => directive.target_ids!.includes(tid)))
        return { priority: directive.priority, type: directive.type };
    }
    if (
      directive.type === "capture" &&
      (bundle.kind === "capture" || bundle.kind === "move_capture")
    ) {
      return { priority: directive.priority, type: directive.type };
    }
    if (
      directive.type === "retreat" &&
      bundle.kind === "move_wait" &&
      bundle.tags.includes("retreat")
    ) {
      if (
        !directive.unit_ids?.length ||
        (bundle.unitId && directive.unit_ids.includes(bundle.unitId))
      ) {
        return { priority: directive.priority, type: directive.type };
      }
    }
    if (directive.type === "produce" && bundle.kind === "buy") {
      if (!directive.unit_type) return { priority: directive.priority, type: directive.type };
      const buyCmd = bundle.commands.find(
        (c): c is GameCommand & { type: "BUY_UNIT"; unit_type: string } => c.type === "BUY_UNIT"
      );
      if (buyCmd && buyCmd.unit_type === directive.unit_type)
        return { priority: directive.priority, type: directive.type };
    }
    if (directive.type === "deny_capture" && bundle.tags.includes("emergency")) {
      return { priority: directive.priority, type: directive.type };
    }
    if (
      directive.type === "screen" &&
      bundle.kind === "move_wait" &&
      bundle.tags.includes("supported")
    ) {
      return { priority: directive.priority, type: directive.type };
    }
    if (
      directive.type === "advance" &&
      bundle.kind === "move_wait" &&
      !bundle.tags.includes("retreat")
    ) {
      return { priority: directive.priority, type: directive.type };
    }
    if (directive.type === "hold" && bundle.kind === "wait") {
      return { priority: directive.priority, type: directive.type };
    }
    if (directive.type === "transport" && bundle.tags.includes("transport")) {
      return { priority: directive.priority, type: directive.type };
    }
    if (directive.type === "merge" && bundle.tags.includes("merge")) {
      return { priority: directive.priority, type: directive.type };
    }
  }
  return null;
}

export async function runStrategicPlannerTurn(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  playerId: number,
  signal?: AbortSignal
): Promise<void> {
  // Initial guards
  const state = useGameStore.getState().gameState;
  if (!state || state.phase !== "action") return;
  const current = state.players[state.current_player_index];
  if (!current || current.id !== playerId) return;

  const config = useConfigStore.getState();
  const harnessMode = config.llmHarnessMode ?? "hybrid";
  const failurePolicy = config.llmFailurePolicy ?? "pause_on_failure";
  const model = getModelForProvider(provider);

  const failTurn = (matchId: string, message: string) => {
    useUsageStore.getState().recordGameTurnFailure({
      provider,
      model,
      matchId,
      playerId,
      harnessMode,
      category: "unknown",
      message,
      attempts: planRetries,
    });
    useGameStore.getState().setAiTurnFailure({
      matchId,
      playerId,
      message,
      timestamp: Date.now(),
    });
  };

  // Run tactical analysis upfront
  const analysis = analyzeTacticalState(state, playerId);

  // Get previous execution report
  const previousReport = useGameStore.getState().getLlmPlanMemory(state.match_id, playerId);

  // Build briefing and system prompt
  const brief = buildSituationBrief(state, playerId, analysis, previousReport);
  const systemPrompt = buildStrategicSystemPrompt(playerId);

  // LLM call with retry loop (max 3 attempts)
  const MAX_PLAN_RETRIES = 3;
  let planRetries = 0;
  let plan: TurnPlan | null = null;
  let retryFeedback = "";

  for (let attempt = 1; attempt <= MAX_PLAN_RETRIES; attempt++) {
    if (signal?.aborted) return;
    planRetries = attempt;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: brief + retryFeedback },
    ];

    let responseText: string;
    try {
      responseText = await Promise.race([
        callProvider(provider, messages, model, state.match_id, harnessMode, playerId),
        waitForSignalOrTimeout(signal, 60_000),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLlmDebugLog({
        matchId: state.match_id,
        playerId,
        turnNumber: state.turn_number,
        provider,
        model,
        mode: harnessMode,
        userMessage: brief + retryFeedback,
        assistantRaw: "",
        validCommandsJson: "[]",
        skippedCount: 0,
        errorSample: message,
      });
      if (failurePolicy === "heuristic_fallback") {
        const commands = runHeuristicTurn(state, playerId);
        useGameStore.getState().queueCommands(commands);
        await waitForQueueAndPossibleHandoff(playerId, commands);
        return;
      }
      failTurn(state.match_id, message);
      return;
    }

    const parsed = extractJsonObject(responseText);
    const result = validatePlan(parsed);

    if (!result.valid) {
      retryFeedback = `\n\nPrevious response was invalid: ${result.error}. Return a valid JSON plan.`;
      appendLlmDebugLog({
        matchId: state.match_id,
        playerId,
        turnNumber: state.turn_number,
        provider,
        model,
        mode: harnessMode,
        userMessage: brief + retryFeedback,
        assistantRaw: responseText,
        validCommandsJson: "[]",
        skippedCount: 0,
        errorSample: result.error,
      });
      continue;
    }

    plan = result.plan;
    break;
  }

  // No valid plan after retries
  if (!plan) {
    if (failurePolicy === "heuristic_fallback") {
      const latestState = useGameStore.getState().gameState;
      if (!latestState) return;
      const commands = runHeuristicTurn(latestState, playerId);
      useGameStore.getState().queueCommands(commands);
      await waitForQueueAndPossibleHandoff(playerId, commands);
      return;
    }
    failTurn(state.match_id, "Strategic planner failed to produce a valid plan after retries.");
    return;
  }

  // Autonomous execution loop (max 30 iterations)
  const MAX_ITERATIONS = 30;
  const executedBundles: ExecutedBundleRecord[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return;

    const loopState = useGameStore.getState().gameState;
    if (!loopState || loopState.phase !== "action") return;

    const loopCurrent = loopState.players[loopState.current_player_index];
    if (!loopCurrent || loopCurrent.id !== playerId) return;

    // Get ready units
    const readyUnits = Object.values(loopState.units).filter(
      (u) => u.owner_id === playerId && !u.is_loaded && !u.has_acted
    );

    if (readyUnits.length === 0) {
      const endCmd: GameCommand[] = [{ type: "END_TURN", player_id: playerId }];
      useGameStore.getState().queueCommands(endCmd);
      await waitForQueueAndPossibleHandoff(playerId, endCmd);
      break;
    }

    const freshAnalysis = analyzeTacticalState(loopState, playerId);
    const catalog = buildActionBundleCatalog(loopState, playerId, freshAnalysis);
    const weighted = applyPlanWeights(catalog.bundles, plan, freshAnalysis, loopState.map_width);

    // Filter: remove end_turn bundles if non-end_turn non-fallback-wait bundles exist
    const meaningfulNonEnd = weighted.filter(
      (b) => b.kind !== "end_turn" && !(b.tags.includes("fallback") && b.kind === "wait")
    );
    const filteredWeighted =
      meaningfulNonEnd.length > 0 ? weighted.filter((b) => b.kind !== "end_turn") : weighted;

    const topBundle = filteredWeighted[0];
    if (!topBundle) break;

    // Match bundle to directive
    const matched = matchBundleToDirective(topBundle, plan);

    // Record execution
    executedBundles.push({
      bundleId: topBundle.id,
      kind: topBundle.kind,
      label: topBundle.label,
      matchedDirectivePriority: matched?.priority ?? null,
      matchedDirectiveType: matched?.type ?? null,
      originalScore: catalog.bundles.find((b) => b.id === topBundle.id)?.score ?? topBundle.score,
      adjustedScore: topBundle.score,
    });

    useGameStore.getState().queueCommands(topBundle.commands);
    await waitForQueueAndPossibleHandoff(playerId, topBundle.commands);

    if (topBundle.kind === "end_turn") break;
  }

  // Build and store execution report
  const report = buildExecutionReport(plan, executedBundles, analysis);
  useGameStore.getState().setLlmPlanMemory(state.match_id, playerId, report);

  // Compute metrics for logging
  const directivesFulfilled = report.directiveFulfillment.filter((d) => d.fulfilled).length;
  const directivesUnfulfilled = report.directiveFulfillment.filter((d) => !d.fulfilled).length;
  const planCoherenceScore =
    report.directiveFulfillment.length > 0
      ? Math.round((directivesFulfilled / report.directiveFulfillment.length) * 100)
      : 100;

  appendLlmDebugLog({
    matchId: state.match_id,
    playerId,
    turnNumber: state.turn_number,
    provider,
    model,
    mode: harnessMode,
    userMessage: brief,
    assistantRaw: report.summary,
    validCommandsJson: JSON.stringify(executedBundles.map((b) => b.bundleId)),
    skippedCount: 0,
    errorSample: "",
    tacticalAnalysis: analysis,
    turnPlan: plan,
    executionReport: report,
    planMetrics: {
      directiveCount: plan.directives.length,
      directivesFulfilled,
      directivesUnfulfilled,
      unplannedActionCount: report.unplannedActions.length,
      planCoherenceScore,
      llmCallCount: planRetries,
    },
    metrics: {
      strategic_planner: true,
      plan_directives: plan.directives.length,
      directives_fulfilled: directivesFulfilled,
      plan_coherence_score: planCoherenceScore,
      autonomous_bundles_executed: executedBundles.length,
    },
  });

  // Annotate usage store
  useUsageStore.getState().annotateLatestGameTurn(state.match_id, model, playerId, {
    tacticalMetrics: {
      strategyLabel: plan.strategy,
      directiveCount: plan.directives.length,
      directivesFulfilled,
      planCoherenceScore,
      autonomousBundlesExecuted: executedBundles.length,
      planParseRetries: planRetries - 1,
    },
  });
}

export async function runBundleBasedLLMTurn(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  playerId: number,
  signal?: AbortSignal
): Promise<void> {
  const config = useConfigStore.getState();
  const harnessMode = config.llmHarnessMode ?? "hybrid";
  const failurePolicy = config.llmFailurePolicy ?? "pause_on_failure";
  const model = getModelForProvider(provider);
  const CALL_TIMEOUT_MS = 45_000;
  const MAX_TOTAL_CALLS = 24;
  const MAX_RETRIES_PER_STEP = 3;
  let totalCalls = 0;
  let lastFailureMessage = "LLM bundle runner failed before finishing the turn.";
  let lastFailureCategory:
    | "provider"
    | "parse"
    | "quality"
    | "simulation"
    | "playback"
    | "unknown" = "unknown";

  const failTurn = (matchId: string, message: string) => {
    useUsageStore.getState().recordGameTurnFailure({
      provider,
      model,
      matchId,
      playerId,
      harnessMode,
      category: lastFailureCategory,
      message,
      attempts: totalCalls,
    });
    useGameStore.getState().setAiTurnFailure({
      matchId,
      playerId,
      message,
      timestamp: Date.now(),
    });
  };

  while (totalCalls < MAX_TOTAL_CALLS) {
    if (signal?.aborted) return;
    const state = useGameStore.getState().gameState;
    if (!state || state.phase !== "action") return;
    const current = state.players[state.current_player_index];
    if (!current || current.id !== playerId) return;

    const readyUnits = Object.values(state.units).filter(
      (unit) => unit.owner_id === playerId && !unit.is_loaded && !unit.has_acted
    );
    if (readyUnits.length === 0) {
      appendLlmDebugLog({
        matchId: state.match_id,
        playerId,
        turnNumber: state.turn_number,
        provider,
        model,
        mode: harnessMode,
        userMessage: `Pre-model exit: no ready units for player ${playerId}.`,
        assistantRaw: "",
        validCommandsJson: JSON.stringify([{ type: "END_TURN", player_id: playerId }]),
        skippedCount: 0,
        errorSample: "No ready units; auto-ending turn before model call.",
        metrics: {
          pre_model_no_ready_units: true,
          ready_unit_count: 0,
        },
      });
      const commands: GameCommand[] = [{ type: "END_TURN", player_id: playerId }];
      useGameStore.getState().queueCommands(commands);
      await waitForQueueAndPossibleHandoff(playerId, commands);
      return;
    }

    const analysis = analyzeTacticalState(state, playerId);
    const catalog = buildActionBundleCatalog(state, playerId, analysis);
    const bundles = catalog.bundles;
    if (bundles.length === 1 && bundles[0]?.kind === "end_turn") {
      appendLlmDebugLog({
        matchId: state.match_id,
        playerId,
        turnNumber: state.turn_number,
        provider,
        model,
        mode: harnessMode,
        userMessage: `Pre-model exit: only END TURN bundle was available for player ${playerId}.`,
        assistantRaw: "",
        validCommandsJson: JSON.stringify(bundles[0].commands),
        skippedCount: 0,
        errorSample: "Only END TURN bundle available; auto-ending turn before model call.",
        tacticalAnalysis: analysis,
        metrics: {
          pre_model_only_end_turn_bundle: true,
          ready_unit_count: readyUnits.length,
          bundle_count: bundles.length,
        },
        bundleDecision: buildBundleDecisionLog(catalog.route, bundles, bundles[0]),
      });
      useGameStore.getState().queueCommands(bundles[0].commands);
      await waitForQueueAndPossibleHandoff(playerId, bundles[0].commands);
      return;
    }

    let retryMessage: string | null = null;
    let selectedBundle: ActionBundle | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_STEP; attempt++) {
      if (signal?.aborted) return;
      totalCalls++;
      const prompt = buildSelectionPrompt(
        playerId,
        state.turn_number,
        catalog.route,
        catalog.routeSummary,
        bundles,
        retryMessage
      );
      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(playerId) },
        { role: "user", content: prompt },
      ];

      let responseText: string;
      try {
        responseText = await Promise.race([
          callProvider(provider, messages, model, state.match_id, harnessMode, playerId),
          waitForSignalOrTimeout(signal, CALL_TIMEOUT_MS),
        ]);
      } catch (error) {
        lastFailureCategory = "provider";
        lastFailureMessage = error instanceof Error ? error.message : String(error);
        appendLlmDebugLog({
          matchId: state.match_id,
          playerId,
          turnNumber: state.turn_number,
          provider,
          model,
          mode: harnessMode,
          userMessage: prompt,
          assistantRaw: "",
          validCommandsJson: "[]",
          skippedCount: 0,
          errorSample: lastFailureMessage,
          bundleDecision: buildBundleDecisionLog(catalog.route, bundles, null),
        });
        if (failurePolicy === "heuristic_fallback") {
          const commands = runHeuristicTurn(state, playerId);
          useGameStore.getState().queueCommands(commands);
          await waitForQueueAndPossibleHandoff(playerId, commands);
          return;
        }
        failTurn(state.match_id, lastFailureMessage);
        return;
      }

      const parsed = extractJsonObject(responseText);
      if (!parsed || typeof parsed.bundle_id !== "string") {
        retryMessage =
          'Return a single JSON object with a valid bundle_id, for example {"bundle_id":"B7"}.';
        lastFailureCategory = "parse";
        lastFailureMessage = retryMessage;
        appendLlmDebugLog({
          matchId: state.match_id,
          playerId,
          turnNumber: state.turn_number,
          provider,
          model,
          mode: harnessMode,
          userMessage: prompt,
          assistantRaw: responseText,
          validCommandsJson: "[]",
          skippedCount: 0,
          errorSample: retryMessage,
          bundleDecision: buildBundleDecisionLog(catalog.route, bundles, null),
        });
        continue;
      }

      const chosen = bundles.find((bundle) => bundle.id === parsed.bundle_id);
      if (!chosen) {
        retryMessage = `Unknown bundle_id ${String(parsed.bundle_id)}. Choose one from the menu exactly as written.`;
        lastFailureCategory = "parse";
        lastFailureMessage = retryMessage;
        appendLlmDebugLog({
          matchId: state.match_id,
          playerId,
          turnNumber: state.turn_number,
          provider,
          model,
          mode: harnessMode,
          userMessage: prompt,
          assistantRaw: responseText,
          validCommandsJson: "[]",
          skippedCount: 0,
          errorSample: retryMessage,
          bundleDecision: buildBundleDecisionLog(catalog.route, bundles, null),
        });
        continue;
      }

      const routeIssue = isRouteCompliant(catalog.route, chosen, bundles);
      if (routeIssue) {
        retryMessage = routeIssue;
        lastFailureCategory = "quality";
        lastFailureMessage = routeIssue;
        appendLlmDebugLog({
          matchId: state.match_id,
          playerId,
          turnNumber: state.turn_number,
          provider,
          model,
          mode: harnessMode,
          userMessage: prompt,
          assistantRaw: responseText,
          validCommandsJson: JSON.stringify(chosen.commands),
          skippedCount: 0,
          errorSample: routeIssue,
          bundleDecision: buildBundleDecisionLog(catalog.route, bundles, chosen),
        });
        continue;
      }

      selectedBundle = chosen;
      const bundleDecision = buildBundleDecisionLog(catalog.route, bundles, chosen);
      const topBundleScore = bundles[0]?.score ?? chosen.score;
      const scoreGap = Math.max(0, Math.round(topBundleScore - chosen.score));
      const skippedBetterOptions = bundleDecision.skippedHigherScoreBundles?.length ?? 0;
      appendLlmDebugLog({
        matchId: state.match_id,
        playerId,
        turnNumber: state.turn_number,
        provider,
        model,
        mode: harnessMode,
        userMessage: prompt,
        assistantRaw: responseText,
        validCommandsJson: JSON.stringify(chosen.commands),
        skippedCount: 0,
        errorSample: "",
        tacticalAnalysis: analysis,
        metrics: {
          route_emergency: catalog.route === "emergency",
          route_capture: catalog.route === "capture",
          route_combat: catalog.route === "combat",
          route_development: catalog.route === "development",
          bundle_selected_score: Math.round(chosen.score),
          bundle_top_score: Math.round(topBundleScore),
          bundle_score_gap: scoreGap,
          bundle_skipped_better_options: skippedBetterOptions,
        },
        policyViolations: [],
        bundleDecision,
      });
      useUsageStore.getState().annotateLatestGameTurn(state.match_id, model, playerId, {
        tacticalMetrics: {
          bundleRouteEmergency: catalog.route === "emergency",
          bundleRouteCapture: catalog.route === "capture",
          bundleRouteCombat: catalog.route === "combat",
          bundleRouteDevelopment: catalog.route === "development",
          bundleSelectedScore: Math.round(chosen.score),
          bundleTopScore: Math.round(topBundleScore),
          bundleScoreGap: scoreGap,
          bundleSkippedBetterOptions: skippedBetterOptions,
        },
      });
      break;
    }

    if (!selectedBundle) {
      if (failurePolicy === "heuristic_fallback") {
        const latest = useGameStore.getState().gameState;
        if (!latest) return;
        const commands = runHeuristicTurn(latest, playerId);
        useGameStore.getState().queueCommands(commands);
        await waitForQueueAndPossibleHandoff(playerId, commands);
        return;
      }
      const currentState = useGameStore.getState().gameState;
      if (currentState) {
        failTurn(currentState.match_id, lastFailureMessage);
      }
      return;
    }

    useGameStore.getState().queueCommands(selectedBundle.commands);
    await waitForQueueAndPossibleHandoff(playerId, selectedBundle.commands);

    if (selectedBundle.kind === "end_turn") return;

    const refreshed = useGameStore.getState().gameState;
    if (!refreshed || refreshed.phase !== "action") return;
    const currentPlayer = refreshed.players[refreshed.current_player_index];
    if (!currentPlayer || currentPlayer.id !== playerId) return;
  }

  const finalState = useGameStore.getState().gameState;
  if (!finalState) return;
  if (failurePolicy === "heuristic_fallback") {
    const commands = runHeuristicTurn(finalState, playerId);
    useGameStore.getState().queueCommands(commands);
    await waitForQueueAndPossibleHandoff(playerId, commands);
    return;
  }
  failTurn(
    finalState.match_id,
    "LLM bundle runner exhausted its call budget before completing the turn."
  );
}
