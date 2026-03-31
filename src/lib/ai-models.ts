// Shared AI model definitions and provider utilities.
// Single source of truth — used by SettingsPage, SettingsModal, and any future consumers.

/** A selectable model option for a provider dropdown. */
export interface ModelOption {
  /** Model identifier sent to the API (e.g. "claude-opus-4-6"). */
  id: string;
  /** Human-readable label shown in the UI (e.g. "Claude Opus 4.6 (most capable)"). */
  label: string;
}

// ── Model lists (verified against provider docs — March 2026) ───────────────

/** Available Anthropic (Claude) models. */
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (most capable)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5 (legacy)" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (legacy)" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1 (legacy)" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4 (legacy)" },
  { id: "claude-opus-4-0", label: "Claude Opus 4 (legacy)" },
];

/** Available OpenAI (GPT) models. */
export const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-5.4", label: "GPT-5.4 (most capable)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (fast)" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (smallest)" },
  { id: "o3", label: "o3 (reasoning)" },
  { id: "o4-mini", label: "o4-mini (reasoning, fast)" },
  { id: "o3-mini", label: "o3-mini (reasoning, budget)" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o (legacy)" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (legacy)" },
];

/** Available Google Gemini models. */
export const GEMINI_MODELS: ModelOption[] = [
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (most capable)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (frontier)" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (budget)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (reasoning)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (recommended)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (light)" },
];

/** Common local/self-hosted models (Ollama, LM Studio, etc.). */
export const LOCAL_MODELS: ModelOption[] = [
  { id: "llama3.2", label: "Llama 3.2" },
  { id: "llama3", label: "Llama 3" },
  { id: "deepseek-r1:7b", label: "DeepSeek R1 7B" },
  { id: "kimi-k2", label: "Kimi K2" },
  { id: "mistral", label: "Mistral" },
  { id: "phi3", label: "Phi-3" },
];

// ── Provider color maps ─────────────────────────────────────────────────────

/** Hex color for each provider — used in charts (Recharts, canvas, etc.). */
export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#ef4444",
  openai: "#10b981",
  gemini: "#3b82f6",
  local_http: "#f59e0b",
};

/** Tailwind background-color class for each provider — used in UI badges and dots. */
export const PROVIDER_TW: Record<string, string> = {
  anthropic: "bg-red-500",
  openai: "bg-emerald-500",
  gemini: "bg-blue-500",
  local_http: "bg-amber-500",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable display name for a provider key.
 *
 * @param provider - Internal provider identifier (e.g. "anthropic", "local_http").
 * @returns Formatted label string.
 */
export function providerLabel(provider: string): string {
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Google Gemini";
  if (provider === "local_http") return "Local Model";
  return provider;
}
