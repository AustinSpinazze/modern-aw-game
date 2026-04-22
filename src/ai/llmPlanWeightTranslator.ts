/**
 * Directive → Score Adjustments.
 * Translates a TurnPlan's directives into score boosts/penalties on ActionBundles.
 */

import type { ActionBundle } from "./llmActionBundles";
import type { TurnPlan } from "./llmTurnPlan";
import type { TacticalAnalysis } from "./tacticalAnalysis";

function getRegionForCoords(x: number, mapWidth: number): string {
  if (x < mapWidth / 3) return "west";
  if (x >= (mapWidth * 2) / 3) return "east";
  return "center";
}

function getBundleDestX(bundle: ActionBundle): number | null {
  for (const cmd of bundle.commands) {
    if (cmd.type === "MOVE") {
      return (cmd as { type: "MOVE"; dest_x: number }).dest_x;
    }
  }
  return null;
}

function getBundleAttackerIds(bundle: ActionBundle): number[] {
  const ids: number[] = [];
  for (const cmd of bundle.commands) {
    if (cmd.type === "ATTACK") {
      ids.push((cmd as { type: "ATTACK"; attacker_id: number }).attacker_id);
    }
  }
  return ids;
}

function getBundleTargetIds(bundle: ActionBundle): number[] {
  const ids: number[] = [];
  for (const cmd of bundle.commands) {
    if (cmd.type === "ATTACK") {
      ids.push((cmd as { type: "ATTACK"; target_id: number }).target_id);
    }
  }
  return ids;
}

function getBundleUnitIds(bundle: ActionBundle): number[] {
  const ids = new Set<number>();
  if (bundle.unitId !== undefined) ids.add(bundle.unitId);
  for (const cmd of bundle.commands) {
    if ("unit_id" in cmd) ids.add((cmd as { unit_id: number }).unit_id);
    if (cmd.type === "ATTACK") {
      ids.add((cmd as { attacker_id: number }).attacker_id);
    }
  }
  return Array.from(ids);
}

function getBundleBuyUnitType(bundle: ActionBundle): string | null {
  for (const cmd of bundle.commands) {
    if (cmd.type === "BUY_UNIT") {
      return (cmd as { type: "BUY_UNIT"; unit_type: string }).unit_type;
    }
  }
  return null;
}

export function applyPlanWeights(
  bundles: ActionBundle[],
  plan: TurnPlan,
  analysis: TacticalAnalysis,
  mapWidth: number
): ActionBundle[] {
  // Work on copies so we don't mutate
  const adjusted = bundles.map((b) => ({ ...b }));

  for (const directive of plan.directives) {
    const weight = 1.0 - (directive.priority - 1) * 0.06;

    for (const bundle of adjusted) {
      switch (directive.type) {
        case "attack": {
          const isAttackKind =
            bundle.kind === "attack" ||
            bundle.kind === "move_attack" ||
            bundle.kind === "detonate_bomb" ||
            bundle.kind === "move_detonate_bomb" ||
            bundle.kind === "fire_silo";
          if (isAttackKind) {
            const targetIds = getBundleTargetIds(bundle);
            if (directive.target_ids && directive.target_ids.length > 0) {
              const hasTarget = targetIds.some((tid) => directive.target_ids!.includes(tid));
              if (hasTarget) {
                bundle.score += 60 * weight;
              }
            } else {
              // No specific targets — boost all attack bundles
              bundle.score += 60 * weight;
            }
          }
          // Penalize retreat for the attacker units
          if (directive.unit_ids && directive.unit_ids.length > 0) {
            const bundleUnitIds = getBundleUnitIds(bundle);
            const isForDirectiveUnit = bundleUnitIds.some((uid) =>
              directive.unit_ids!.includes(uid)
            );
            if (isForDirectiveUnit && bundle.kind === "move_wait") {
              if (bundle.tags.includes("retreat")) {
                bundle.score -= 30;
              }
            }
          }
          break;
        }

        case "capture": {
          const isCaptureKind = bundle.kind === "capture" || bundle.kind === "move_capture";
          if (isCaptureKind) {
            if (directive.region) {
              const destX = getBundleDestX(bundle);
              if (destX !== null) {
                const region = getRegionForCoords(destX, mapWidth);
                if (region === directive.region) {
                  bundle.score += 40 * weight;
                }
              } else {
                // No move cmd, still a capture kind — boost it
                bundle.score += 40 * weight;
              }
            } else {
              bundle.score += 40 * weight;
            }
          }
          break;
        }

        case "retreat": {
          if (directive.unit_ids && directive.unit_ids.length > 0) {
            const bundleUnitIds = getBundleUnitIds(bundle);
            const isForDirectiveUnit = bundleUnitIds.some((uid) =>
              directive.unit_ids!.includes(uid)
            );
            if (isForDirectiveUnit) {
              if (bundle.kind === "move_wait") {
                if (bundle.tags.includes("retreat") || bundle.tags.includes("safe")) {
                  bundle.score += 60 * weight;
                }
              }
              if (
                bundle.kind === "attack" ||
                bundle.kind === "move_attack" ||
                bundle.kind === "detonate_bomb" ||
                bundle.kind === "move_detonate_bomb" ||
                bundle.kind === "fire_silo"
              ) {
                bundle.score -= 80 * weight;
              }
            }
          }
          break;
        }

        case "produce": {
          if (bundle.kind === "buy") {
            if (directive.unit_type) {
              const buyType = getBundleBuyUnitType(bundle);
              if (buyType === directive.unit_type) {
                bundle.score += 50 * weight;
              }
            } else {
              bundle.score += 50 * weight;
            }
          }
          break;
        }

        case "screen": {
          if (directive.unit_ids && directive.unit_ids.length > 0) {
            const bundleUnitIds = getBundleUnitIds(bundle);
            const isForDirectiveUnit = bundleUnitIds.some((uid) =>
              directive.unit_ids!.includes(uid)
            );
            if (isForDirectiveUnit && bundle.kind === "move_wait") {
              if (bundle.tags.includes("supported")) {
                bundle.score += 40 * weight;
              }
            }
          }
          break;
        }

        case "advance": {
          if (bundle.kind === "move_wait" && !bundle.tags.includes("retreat")) {
            if (directive.unit_ids && directive.unit_ids.length > 0) {
              const bundleUnitIds = getBundleUnitIds(bundle);
              if (bundleUnitIds.some((uid) => directive.unit_ids!.includes(uid))) {
                bundle.score += 30 * weight;
              }
            } else {
              bundle.score += 30 * weight;
            }
          }
          break;
        }

        case "hold": {
          if (directive.unit_ids && directive.unit_ids.length > 0) {
            const bundleUnitIds = getBundleUnitIds(bundle);
            const isForDirectiveUnit = bundleUnitIds.some((uid) =>
              directive.unit_ids!.includes(uid)
            );
            if (isForDirectiveUnit) {
              if (bundle.kind === "wait") {
                bundle.score += 40 * weight;
              }
              // Penalize moves away
              if (bundle.kind === "move_wait" && bundle.tags.includes("retreat")) {
                bundle.score -= 40 * weight;
              }
            }
          }
          break;
        }

        case "deny_capture": {
          if (bundle.tags.includes("emergency")) {
            if (directive.unit_ids && directive.unit_ids.length > 0) {
              const bundleUnitIds = getBundleUnitIds(bundle);
              const isForDirectiveUnit = bundleUnitIds.some((uid) =>
                directive.unit_ids!.includes(uid)
              );
              if (isForDirectiveUnit) {
                bundle.score += 70 * weight;
              }
            } else {
              // No specific units — boost all emergency bundles
              bundle.score += 70 * weight;
            }
          }
          break;
        }

        case "transport": {
          if (bundle.tags.includes("transport")) {
            bundle.score += 35 * weight;
          }
          break;
        }

        case "merge": {
          if (bundle.tags.includes("merge")) {
            if (directive.unit_ids && directive.unit_ids.length > 0) {
              const bundleUnitIds = getBundleUnitIds(bundle);
              const isForDirectiveUnit = bundleUnitIds.some((uid) =>
                directive.unit_ids!.includes(uid)
              );
              if (isForDirectiveUnit) {
                bundle.score += 45 * weight;
              }
            } else {
              bundle.score += 45 * weight;
            }
          }
          break;
        }
      }
    }
  }

  for (const bundle of adjusted) {
    if (
      bundle.tags.includes("dominant") ||
      (bundle.tags.includes("combat") && bundle.score >= 80)
    ) {
      const originalBundle = bundles.find((b) => b.id === bundle.id);
      if (originalBundle && bundle.score < originalBundle.score * 0.7) {
        bundle.score = originalBundle.score * 0.7;
      }
    }
  }

  // Sort by adjusted score descending
  return adjusted.sort((a, b) => b.score - a.score);
}
