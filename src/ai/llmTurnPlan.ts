/**
 * Turn Plan Schema for the Strategic Planner architecture.
 * The LLM produces one TurnPlan per turn; the harness autonomously executes it.
 */

export type StrategyLabel =
  | "aggressive_push"
  | "consolidate_and_counter"
  | "economic_expansion"
  | "defensive_retreat"
  | "capture_rush"
  | "tempo_trade";

export type DirectiveType =
  | "attack"
  | "capture"
  | "retreat"
  | "produce"
  | "screen"
  | "advance"
  | "hold"
  | "transport"
  | "merge"
  | "deny_capture";

export interface Directive {
  priority: number;
  type: DirectiveType;
  unit_ids?: number[];
  target_ids?: number[];
  unit_type?: string;
  facility_preference?: string;
  region?: string;
  protect_ids?: number[];
  reason: string;
}

export interface TurnPlan {
  strategy: StrategyLabel;
  reasoning: string;
  directives: Directive[];
}

export interface ExecutedBundleRecord {
  bundleId: string;
  kind: string;
  label: string;
  matchedDirectivePriority: number | null;
  matchedDirectiveType: DirectiveType | null;
  originalScore: number;
  adjustedScore: number;
}

export interface DirectiveFulfillment {
  priority: number;
  type: DirectiveType;
  reason: string;
  fulfilled: boolean;
  executedBundleIds: string[];
}

export interface ExecutionReport {
  plan: TurnPlan;
  executedBundles: ExecutedBundleRecord[];
  directiveFulfillment: DirectiveFulfillment[];
  unplannedActions: string[];
  summary: string;
}

const VALID_STRATEGIES: StrategyLabel[] = [
  "aggressive_push",
  "consolidate_and_counter",
  "economic_expansion",
  "defensive_retreat",
  "capture_rush",
  "tempo_trade",
];

const VALID_DIRECTIVE_TYPES: DirectiveType[] = [
  "attack",
  "capture",
  "retreat",
  "produce",
  "screen",
  "advance",
  "hold",
  "transport",
  "merge",
  "deny_capture",
];

export function validatePlan(
  raw: unknown
): { valid: true; plan: TurnPlan } | { valid: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "Plan must be a non-null object" };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.strategy !== "string") {
    return { valid: false, error: "Plan must have a string 'strategy' field" };
  }
  if (!VALID_STRATEGIES.includes(obj.strategy as StrategyLabel)) {
    return {
      valid: false,
      error: `Invalid strategy '${obj.strategy}'. Must be one of: ${VALID_STRATEGIES.join(", ")}`,
    };
  }

  if (typeof obj.reasoning !== "string") {
    return { valid: false, error: "Plan must have a string 'reasoning' field" };
  }

  if (!Array.isArray(obj.directives)) {
    return { valid: false, error: "Plan must have an array 'directives' field" };
  }

  const rawDirectives = obj.directives as unknown[];

  for (let i = 0; i < rawDirectives.length; i++) {
    const d = rawDirectives[i];
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      return { valid: false, error: `Directive at index ${i} must be an object` };
    }
    const dir = d as Record<string, unknown>;
    if (typeof dir.priority !== "number") {
      return { valid: false, error: `Directive at index ${i} must have a numeric 'priority'` };
    }
    if (dir.priority < 1 || dir.priority > 10) {
      return {
        valid: false,
        error: `Directive at index ${i} priority must be 1-10, got ${dir.priority}`,
      };
    }
    if (typeof dir.type !== "string") {
      return { valid: false, error: `Directive at index ${i} must have a string 'type'` };
    }
    if (!VALID_DIRECTIVE_TYPES.includes(dir.type as DirectiveType)) {
      return {
        valid: false,
        error: `Directive at index ${i} has invalid type '${dir.type}'. Must be one of: ${VALID_DIRECTIVE_TYPES.join(", ")}`,
      };
    }
    if (typeof dir.reason !== "string") {
      return { valid: false, error: `Directive at index ${i} must have a string 'reason'` };
    }
  }

  // Clamp to 8 (matches system prompt limit) and sort
  const clamped = rawDirectives.slice(0, 8) as Array<Record<string, unknown>>;
  const directives: Directive[] = clamped
    .sort((a, b) => (a.priority as number) - (b.priority as number))
    .map((d) => {
      const directive: Directive = {
        priority: d.priority as number,
        type: d.type as DirectiveType,
        reason: d.reason as string,
      };
      if (Array.isArray(d.unit_ids)) directive.unit_ids = d.unit_ids as number[];
      if (Array.isArray(d.target_ids)) directive.target_ids = d.target_ids as number[];
      if (typeof d.unit_type === "string") directive.unit_type = d.unit_type;
      if (typeof d.facility_preference === "string")
        directive.facility_preference = d.facility_preference;
      if (typeof d.region === "string") directive.region = d.region;
      if (Array.isArray(d.protect_ids)) directive.protect_ids = d.protect_ids as number[];
      return directive;
    });

  const plan: TurnPlan = {
    strategy: obj.strategy as StrategyLabel,
    reasoning: obj.reasoning as string,
    directives,
  };

  return { valid: true, plan };
}
