"use client";

/**
 * Reusable **tab strip** with underline indicator (settings-style navigation).
 */

/** Accent color for the active tab indicator and text. */
type TabAccent = "amber" | "red";

/** Props for the {@link TabBar} component. */
export interface TabBarProps<T extends string> {
  /** Array of tab definitions, each with a unique `id` and display `label`. */
  tabs: Array<{ id: T; label: string }>;
  /** The `id` of the currently active tab. */
  active: T;
  /** Callback invoked when the user clicks a tab, receiving the tab's `id`. */
  onChange: (id: T) => void;
  /**
   * Accent color for the active tab indicator and text.
   * - `"amber"` — used in SettingsPage (full-page settings)
   * - `"red"` — used in SettingsModal (compact modal)
   *
   * Defaults to `"amber"`.
   */
  accent?: TabAccent;
}

const ACCENT_ACTIVE: Record<TabAccent, string> = {
  amber: "text-amber-600",
  red: "text-red-600",
};

const ACCENT_INDICATOR: Record<TabAccent, string> = {
  amber: "bg-amber-500",
  red: "bg-red-500",
};

/**
 * A reusable horizontal tab bar with an active underline indicator.
 *
 * Renders a flex row of buttons matching the tab patterns used in
 * SettingsPage (amber accent) and SettingsModal (red accent).
 *
 * @example
 * ```tsx
 * <TabBar
 *   tabs={[
 *     { id: "providers", label: "AI Providers" },
 *     { id: "usage", label: "Usage Dashboard" },
 *   ]}
 *   active={tab}
 *   onChange={setTab}
 *   accent="red"
 * />
 * ```
 */
export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  accent = "amber",
}: TabBarProps<T>) {
  return (
    <div className="flex gap-0">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-5 py-3 text-sm font-semibold uppercase tracking-wider transition-colors relative ${
              isActive ? ACCENT_ACTIVE[accent] : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
            {isActive && (
              <span
                className={`absolute bottom-0 left-2 right-2 h-0.5 ${ACCENT_INDICATOR[accent]} rounded-full`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
