/**
 * Deterministic “random” for combat luck: same inputs → same outputs across clients and replays.
 * Mixes `match_seed`, `turn_number`, `attack_counter`, and entity IDs via {@link hashCombine}.
 */

export const DEFAULT_LUCK_MIN = 0.0;
export const DEFAULT_LUCK_MAX = 0.1;
export const ALTERNATE_LUCK_MIN = -0.03;
export const ALTERNATE_LUCK_MAX = 0.1;

// FNV-1a style hash mixing over an array of integers
export function hashCombine(values: number[]): number {
  let result = 0;
  for (const value of values) {
    const v = Math.trunc(value);
    result = result ^ v;
    // Multiply by FNV prime, keep within safe integer range (positive 63-bit)
    result = Math.trunc(result * 0x01000193) & 0x7fffffff;
  }
  return result;
}

// Generate a deterministic luck roll between min_luck and max_luck
export function rollLuck(
  matchSeed: number,
  turnNumber: number,
  attackCounter: number,
  attackerId: number,
  defenderId: number,
  minLuck: number = DEFAULT_LUCK_MIN,
  maxLuck: number = DEFAULT_LUCK_MAX
): number {
  const combined = hashCombine([matchSeed, turnNumber, attackCounter, attackerId, defenderId]);
  // Normalize to 0.0–1.0 range
  const normalized = (combined % 10001) / 10000.0;
  // Scale to luck range
  return minLuck + normalized * (maxLuck - minLuck);
}

// Generate a deterministic integer in [minVal, maxVal] inclusive
export function rollInt(
  matchSeed: number,
  contextValues: number[],
  minVal: number,
  maxVal: number
): number {
  const allValues = [matchSeed, ...contextValues];
  const combined = hashCombine(allValues);
  const rangeSize = maxVal - minVal + 1;
  return minVal + (combined % rangeSize);
}

// Generate a new match seed from current time + random bits
export function generateMatchSeed(): number {
  const timeComponent = Math.trunc(Date.now() * 1000) & 0x7fffffff;
  const randomComponent = Math.trunc(Math.random() * 0x7fffffff);
  return hashCombine([timeComponent, randomComponent, Math.trunc(Math.random() * 0x7fffffff)]);
}
