/** Small presentational pieces used only by the compact agent-configuration modal usage tab. */

export function getMonthLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("default", { month: "short", year: "2-digit" });
}

export function ModalSummaryCard({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: string;
  accent?: boolean;
  detail?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 text-center">
      <div className={`font-bold text-base ${accent ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{label}</div>
      {detail && <div className="text-[9px] text-gray-400 mt-0.5">{detail}</div>}
    </div>
  );
}

export function ModalSectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
  );
}

export function ModalInsightCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{detail}</div>
    </div>
  );
}
