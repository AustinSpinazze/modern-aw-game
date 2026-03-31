/**
 * Full-page **agent configuration and analytics**: LLM keys/models, token usage (Recharts), pricing notes, local endpoint ping.
 */

import { useState, useEffect, useMemo } from "react";
import { useUsageStore } from "../../store/usageStore";
import { type DateRange, exportUsageData } from "../../lib/usageAnalytics";
import ConfirmDialog from "../shared/ConfirmDialog";
import TabBar from "../shared/TabBar";
import { UsageAnalyticsFilters } from "./UsageAnalyticsFilters";
import { TokenPricingNote } from "./TokenPricingNote";
import { AgentConfigurationTab } from "./AgentConfigurationTab";
import { UsageAnalyticsTab } from "./UsageAnalyticsTab";
import { PerGameAnalyticsTab } from "./PerGameAnalyticsTab";
import { ModelPerformanceAnalyticsTab } from "./ModelPerformanceAnalyticsTab";

const VERSION = "v0.1.0";

/** Top-level tab ids for the agent configuration & analytics page. */
export type AgentConfigurationAndAnalyticsTab = "keys" | "usage" | "games" | "performance";

/** Props for {@link AgentConfigurationAndAnalyticsPage}. */
interface AgentConfigurationAndAnalyticsPageProps {
  /** Callback to navigate back to the main menu. */
  onBack: () => void;
}

/**
 * Full-page LLM agent configuration and token analytics dashboard.
 * Tabs: agent configuration (keys/models), usage analytics, per-game analytics, model performance.
 */
export default function AgentConfigurationAndAnalyticsPage({
  onBack,
}: AgentConfigurationAndAnalyticsPageProps) {
  const [tab, setTab] = useState<AgentConfigurationAndAnalyticsTab>("keys");
  const allEntries = useUsageStore((s) => s.entries);
  const clearHistory = useUsageStore((s) => s.clearHistory);
  const [analyticsModelFilter, setAnalyticsModelFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isAnalyticsTab = tab === "usage" || tab === "games" || tab === "performance";

  const modelsInUsageData = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) set.add(e.model);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  useEffect(() => {
    if (analyticsModelFilter !== "all" && !modelsInUsageData.includes(analyticsModelFilter)) {
      setAnalyticsModelFilter("all");
    }
  }, [analyticsModelFilter, modelsInUsageData]);

  const tabs: { id: AgentConfigurationAndAnalyticsTab; label: string }[] = [
    { id: "keys", label: "Agent configuration" },
    { id: "usage", label: "Usage analytics" },
    { id: "games", label: "Per-game analytics" },
    { id: "performance", label: "Model performance" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#faf9f7" }}>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto px-6 pt-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-900 text-xs font-medium uppercase tracking-[0.15em] transition-colors"
            >
              &larr; Back to menu
            </button>
          </div>

          <h1 className="text-2xl font-black tracking-wider uppercase text-gray-900">
            Agent configuration &amp; analytics
          </h1>

          <TabBar tabs={tabs} active={tab} onChange={setTab} accent="amber" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto px-6 py-8">
          {tab === "keys" && <AgentConfigurationTab />}
          {isAnalyticsTab && (
            <>
              {tab === "usage" && <TokenPricingNote className="mb-6" />}
              <UsageAnalyticsFilters
                modelFilter={analyticsModelFilter}
                onModelChange={setAnalyticsModelFilter}
                modelsInData={modelsInUsageData}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onExport={() => exportUsageData(allEntries)}
                onClear={() => setShowClearConfirm(true)}
              />
              {tab === "usage" && (
                <UsageAnalyticsTab modelFilter={analyticsModelFilter} dateRange={dateRange} />
              )}
              {tab === "games" && (
                <PerGameAnalyticsTab modelFilter={analyticsModelFilter} dateRange={dateRange} />
              )}
              {tab === "performance" && (
                <ModelPerformanceAnalyticsTab
                  modelFilter={analyticsModelFilter}
                  dateRange={dateRange}
                />
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 uppercase tracking-[0.2em] font-medium">Modern AW</p>
          <span className="text-xs text-gray-400 font-mono">{VERSION}</span>
        </div>
      </footer>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear Usage History"
          message="This will permanently delete all token usage data, game sessions, and model performance records. This cannot be undone."
          confirmLabel="Clear All Data"
          onConfirm={() => {
            clearHistory();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
          variant="destructive"
        />
      )}
    </div>
  );
}
