"use client";

/**
 * Small **metric card** for analytics dashboards (label, value, optional sub/detail).
 */

/** Props for the {@link SummaryCard} component. */
export interface SummaryCardProps {
  /** Upper label displayed in small uppercase text (e.g. "Total Tokens"). */
  label: string;
  /** Primary value displayed prominently (e.g. "12.5K"). */
  value: string;
  /** Secondary text below the value (e.g. "1,200 in / 800 out"). */
  sub?: string;
  /** Small detail text below sub, used for additional context (e.g. "Per session"). */
  detail?: string;
}

/**
 * A compact card for displaying a single metric with a label, value,
 * optional secondary text, and optional detail line.
 *
 * Unifies the SummaryCard patterns from AgentConfigurationAndAnalyticsPage (`label`, `value`, `sub`)
 * and the compact modal (`label`, `value`, `detail`). This component supports all
 * three optional text fields simultaneously.
 *
 * @example
 * ```tsx
 * // Full-page agent analytics style (with sub)
 * <SummaryCard label="Total Tokens" value="12.5K" sub="8K in / 4.5K out" />
 *
 * // Compact modal style (with detail)
 * <SummaryCard label="Tokens" value="12.5K" detail="8K in / 4.5K out" />
 *
 * // Full variant (all fields)
 * <SummaryCard label="Avg Tokens" value="1.2K" sub="Per turn" detail="Across 42 calls" />
 * ```
 */
export default function SummaryCard({ label, value, sub, detail }: SummaryCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <div className="text-xs text-gray-400 uppercase tracking-[0.15em] font-bold mb-2">
        {label}
      </div>
      <div className="text-3xl font-black text-gray-900">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{sub}</div>}
      {detail && <div className="text-[9px] text-gray-400 mt-0.5">{detail}</div>}
    </div>
  );
}
