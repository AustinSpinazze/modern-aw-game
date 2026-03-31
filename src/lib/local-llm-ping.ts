/**
 * Connectivity probe for local LLM servers: `GET /api/tags` (Ollama), then `GET /v1/models` (OpenAI-compatible).
 * Used by settings UI only — not authoritative for gameplay.
 */

export async function pingLocalLlmBaseUrl(baseUrl: string): Promise<boolean> {
  const base = baseUrl.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) return false;

  async function get(path: string): Promise<Response> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(`${base}${path}`, { method: "GET", signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }
  }

  try {
    const r1 = await get("/api/tags");
    if (r1.ok) return true;
  } catch {
    // offline, CORS in browser, etc.
  }
  try {
    const r2 = await get("/v1/models");
    return r2.ok;
  } catch {
    return false;
  }
}
