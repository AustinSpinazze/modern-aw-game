import { useState } from "react";
import { LocalEndpointPingPanel } from "./LocalEndpointPingPanel";

/**
 * Card for configuring a single AI provider (cloud or local).
 * Cloud providers show an API key input and model dropdown.
 * Local providers show an endpoint URL, a free-text model input with datalist suggestions,
 * and an embedded {@link LocalEndpointPingPanel} for connectivity testing.
 */
export function AgentProviderCard({
  name,
  subtitle,
  dotColor,
  apiKey,
  onKeyChange,
  placeholder,
  model,
  onModelChange,
  models,
  isLocal,
  localUrl,
  onLocalUrlChange,
  allowCustomModel,
}: {
  name: string;
  subtitle: string;
  dotColor: string;
  apiKey?: string;
  onKeyChange?: (v: string) => void;
  placeholder?: string;
  model: string;
  onModelChange: (v: string) => void;
  models: Array<{ id: string; label: string }>;
  isLocal?: boolean;
  localUrl?: string;
  onLocalUrlChange?: (v: string) => void;
  allowCustomModel?: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const isConfigured = isLocal
    ? (localUrl ?? "").trim().length > 0 && model.trim().length > 0
    : (apiKey ?? "").trim().length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${dotColor}`} />
            <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">{name}</h3>
          </div>
          <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-1 ml-[22px]">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {isLocal ? (
          <>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Endpoint URL
              </label>
              <input
                type="url"
                value={localUrl ?? ""}
                onChange={(e) => onLocalUrlChange?.(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-300"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Default Model
              </label>
              {allowCustomModel ? (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="e.g. llama3.2, deepseek-r1:7b"
                  list={`local-models-${name}`}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-300"
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 appearance-none"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
              {allowCustomModel && (
                <datalist id={`local-models-${name}`}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey ?? ""}
                  onChange={(e) => onKeyChange?.(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 pr-16 text-sm text-gray-900 font-mono placeholder-gray-300"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-[0.15em] block mb-1.5">
                Default Model
              </label>
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-amber-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-gray-900 appearance-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {isLocal && (
        <div className="mt-4">
          <LocalEndpointPingPanel url={localUrl ?? ""} accent="amber" />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        {isConfigured ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {isLocal ? "Endpoint & model set" : "API key set"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            Not configured
          </span>
        )}
      </div>
    </div>
  );
}
