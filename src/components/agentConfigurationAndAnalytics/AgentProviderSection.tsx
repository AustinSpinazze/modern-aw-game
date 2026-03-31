import { LocalEndpointPingPanel } from "./LocalEndpointPingPanel";

export function AgentProviderSection({
  title,
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
  placeholder,
  model,
  setModel,
  models,
  isElectron,
  dotColor,
}: {
  title: string;
  apiKey: string;
  setApiKey: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  placeholder: string;
  model: string;
  setModel: (v: string) => void;
  models: Array<{ id: string; label: string }>;
  isElectron: boolean;
  dotColor: string;
}) {
  const hasKey = apiKey.trim().length > 0;

  return (
    <section className="border-t border-gray-100 pt-5 first:border-0 first:pt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {hasKey && (
          <span className="ml-auto text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            API key set
          </span>
        )}
      </div>
      <div className="space-y-3 pl-4.5">
        <div>
          <label className="text-xs text-gray-500 block mb-1">API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400"
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {isElectron && hasKey && (
            <p className="text-[10px] text-green-600 mt-1">Encrypted on device</p>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-white border border-gray-300 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
