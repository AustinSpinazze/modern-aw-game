// Shared formatting utilities used across analytics and dashboard components.

/**
 * Formats a token count for display.
 * - Values >= 1 000 000 are shown as e.g. "1.2M"
 * - Values >= 1 000 are shown with locale-aware comma separators
 * - Smaller values are shown as plain integers
 *
 * @param n - Raw token count.
 * @returns Formatted string.
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n).toLocaleString()}`;
  return String(Math.round(n));
}

/**
 * Converts a Unix-millisecond timestamp to a `YYYY-MM` month key string.
 *
 * @param ts - Timestamp in milliseconds since epoch.
 * @returns Month key, e.g. `"2026-03"`.
 */
export function getMonthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
