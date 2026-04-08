/**
 * Report Builder — assembles an ExecutionReport from the plan, executed bundles,
 * and tactical analysis after the autonomous execution loop completes.
 */

import type {
  TurnPlan,
  ExecutionReport,
  ExecutedBundleRecord,
  DirectiveFulfillment,
} from "./llmTurnPlan";
import type { TacticalAnalysis } from "./tacticalAnalysis";

export function buildExecutionReport(
  plan: TurnPlan,
  executedBundles: ExecutedBundleRecord[],
  _analysis: TacticalAnalysis
): ExecutionReport {
  // Build directive fulfillment by index (not priority, since priorities could overlap)
  const fulfillmentByIndex = plan.directives.map(() => ({
    bundles: [] as string[],
    fulfilled: false,
  }));

  // Match executed bundles to directives
  for (const record of executedBundles) {
    if (record.matchedDirectivePriority !== null && record.matchedDirectiveType !== null) {
      const idx = plan.directives.findIndex(
        (d) =>
          d.priority === record.matchedDirectivePriority && d.type === record.matchedDirectiveType
      );
      if (idx >= 0) {
        fulfillmentByIndex[idx].bundles.push(record.bundleId);
        fulfillmentByIndex[idx].fulfilled = true;
      }
    }
  }

  // Build DirectiveFulfillment array
  const directiveFulfillment: DirectiveFulfillment[] = plan.directives.map((directive, idx) => ({
    priority: directive.priority,
    type: directive.type,
    reason: directive.reason,
    fulfilled: fulfillmentByIndex[idx].fulfilled,
    executedBundleIds: fulfillmentByIndex[idx].bundles,
  }));

  // Collect unplanned actions (bundles not matched to any directive)
  const unplannedActions = executedBundles
    .filter((record) => record.matchedDirectivePriority === null)
    .map((record) => `${record.bundleId}: ${record.label}`);

  // Build summary
  const fulfilled = directiveFulfillment.filter((d) => d.fulfilled).length;
  const total = directiveFulfillment.length;
  const summary = `Strategy: ${plan.strategy}. ${fulfilled}/${total} directives fulfilled. ${unplannedActions.length} unplanned actions.`;

  return {
    plan,
    executedBundles,
    directiveFulfillment,
    unplannedActions,
    summary,
  };
}
