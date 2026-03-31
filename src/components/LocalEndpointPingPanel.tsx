import { useCallback, useEffect, useRef, useState } from "react";
import { pingLocalLlmBaseUrl } from "../lib/local-llm-ping";

interface LocalEndpointPingPanelProps {
  url: string;
  /** Tailwind accent for the check button */
  accent?: "amber" | "red";
}

function formatLastPing(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function LocalEndpointPingPanel({ url, accent = "amber" }: LocalEndpointPingPanelProps) {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const seq = useRef(0);

  const runPing = useCallback(async () => {
    const u = url.trim();
    if (!u) {
      setReachable(null);
      setLastPingAt(null);
      return;
    }
    const id = ++seq.current;
    setPinging(true);
    try {
      const ok = await pingLocalLlmBaseUrl(u);
      if (seq.current === id) {
        setReachable(ok);
        setLastPingAt(Date.now());
      }
    } finally {
      if (seq.current === id) setPinging(false);
    }
  }, [url]);

  useEffect(() => {
    const u = url.trim();
    if (!u) {
      setReachable(null);
      setLastPingAt(null);
      return;
    }
    const t = window.setTimeout(() => void runPing(), 500);
    return () => clearTimeout(t);
  }, [url, runPing]);

  const trimmed = url.trim();
  const btnAccent =
    accent === "red"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : "bg-amber-500 hover:bg-amber-400 text-gray-900";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wider text-gray-500">Server</span>
        {pinging ? (
          <span className="text-gray-600 inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-400" />
            Checking…
          </span>
        ) : trimmed.length === 0 ? (
          <span className="text-gray-400">Enter a URL to test</span>
        ) : reachable === true ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Reachable
          </span>
        ) : reachable === false ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Unreachable
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
      <div className="text-[11px] text-gray-500">
        Last checked:{" "}
        {lastPingAt != null ? (
          <span className="font-mono text-gray-700">{formatLastPing(lastPingAt)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
      <button
        type="button"
        disabled={trimmed.length === 0 || pinging}
        onClick={() => void runPing()}
        className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${btnAccent}`}
      >
        {pinging ? "Checking…" : "Check connection"}
      </button>
      <p className="text-[10px] text-gray-400 leading-snug">
        Sends a quick request to <span className="font-mono">/api/tags</span> (Ollama) or{" "}
        <span className="font-mono">/v1/models</span> (OpenAI-compatible). If the browser blocks
        cross-origin localhost, use the desktop app or ensure the server allows CORS.
      </p>
    </div>
  );
}
