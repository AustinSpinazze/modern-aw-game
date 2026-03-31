import type { ReactNode } from "react";

/** White bordered card wrapper for charts and data tables with a title and optional subtitle. */
export function AnalyticsChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-[0.15em]">{title}</h3>
        {subtitle && (
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
