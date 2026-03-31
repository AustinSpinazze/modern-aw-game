import { DATE_RANGE_OPTIONS, type DateRange } from "../../lib/usageAnalytics";

/**
 * Filter toolbar for the analytics tabs (Usage, Per-Game, Performance).
 * Provides model selector, date range toggle buttons, export, and clear history actions.
 */
export function UsageAnalyticsFilters({
  modelFilter,
  onModelChange,
  modelsInData,
  dateRange,
  onDateRangeChange,
  onExport,
  onClear,
}: {
  modelFilter: string;
  onModelChange: (v: string) => void;
  modelsInData: string[];
  dateRange: DateRange;
  onDateRangeChange: (v: DateRange) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
      <div className="flex items-center gap-3">
        <label
          htmlFor="analytics-model-filter"
          className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] shrink-0"
        >
          Model
        </label>
        <select
          id="analytics-model-filter"
          value={modelFilter}
          onChange={(e) => onModelChange(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-mono focus:border-amber-500 focus:outline-none appearance-none"
        >
          <option value="all">All models</option>
          {modelsInData.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onDateRangeChange(opt.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              dateRange === opt.id
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onExport}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors"
        >
          Export
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
        >
          Clear History
        </button>
      </div>
    </div>
  );
}
