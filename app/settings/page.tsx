"use client";

import Link from "next/link";
import { useConfigStore } from "../../src/store/config-store";

export default function SettingsPage() {
  const {
    anthropicApiKey, setAnthropicApiKey,
    openaiApiKey, setOpenaiApiKey,
    localHttpUrl, setLocalHttpUrl,
    anthropicModel, setAnthropicModel,
    openaiModel, setOpenaiModel,
  } = useConfigStore();

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">← Back</Link>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Anthropic */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
            <h2 className="text-white font-semibold mb-4">Anthropic (Claude)</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">API Key</label>
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Model</label>
                <select
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                  <option value="claude-opus-4-6">claude-opus-4-6</option>
                  <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                </select>
              </div>
            </div>
          </div>

          {/* OpenAI */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
            <h2 className="text-white font-semibold mb-4">OpenAI (GPT)</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">API Key</label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Model</label>
                <select
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Local HTTP */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
            <h2 className="text-white font-semibold mb-4">Local LLM (Ollama etc.)</h2>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">URL</label>
              <input
                type="text"
                value={localHttpUrl}
                onChange={(e) => setLocalHttpUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <p className="text-gray-500 text-xs">
            API keys are stored locally in your browser and never sent to our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
