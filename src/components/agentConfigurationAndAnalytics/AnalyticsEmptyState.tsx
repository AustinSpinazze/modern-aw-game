/** Centered placeholder when an analytics tab has no data to display. */
export function AnalyticsEmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <div className="text-5xl mb-4 opacity-30">~</div>
      <p className="text-sm font-semibold uppercase tracking-wider">{message}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}
