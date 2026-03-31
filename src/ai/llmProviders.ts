/**
 * Provider adapters for cloud LLMs (Anthropic, OpenAI, Gemini) and local Ollama-compatible HTTP.
 * Uses **Electron IPC** when `window.electronAPI` is present (keys stay off the renderer); otherwise
 * direct `fetch` in the browser. Records token usage via {@link ../store/usageStore}.
 */

import { useConfigStore } from "../store/configStore";
import { useUsageStore } from "../store/usageStore";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  maxTokens?: number;
  /** Context tag for usage tracking (e.g. "game_turn", "map_gen") */
  usageContext?: string;
  /** Match ID for grouping usage entries into game sessions */
  matchId?: string;
}

interface IPCResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
}

function trackUsage(
  provider: string,
  model: string,
  result: IPCResult,
  context: string,
  inputMessages?: ChatMessage[],
  matchId?: string
) {
  const usageModel = result.model ?? model;
  if (result.usage && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
    useUsageStore
      .getState()
      .record(
        provider,
        usageModel,
        result.usage.inputTokens,
        result.usage.outputTokens,
        context,
        matchId
      );
  } else {
    // Estimate tokens (~4 chars per token) when API doesn't return usage
    const inputChars = inputMessages?.reduce((sum, m) => sum + m.content.length, 0) ?? 0;
    const outputChars = result.text.length;
    const estInput = Math.ceil(inputChars / 4);
    const estOutput = Math.ceil(outputChars / 4);
    if (estInput > 0 || estOutput > 0) {
      useUsageStore.getState().record(provider, usageModel, estInput, estOutput, context, matchId);
    }
  }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropicDirect(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<IPCResult> {
  const apiKey = useConfigStore.getState().anthropicApiKey;
  if (!apiKey) throw new Error("No Anthropic API key configured");

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    max_tokens: options?.maxTokens ?? 1024,
    messages: nonSystemMsgs,
  };
  if (systemMsg) body.system = systemMsg.content;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  const usage = data?.usage
    ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
    : undefined;
  return { text, usage, model };
}

export async function callAnthropicViaIPC(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  let result: IPCResult;

  if (window.electronAPI) {
    const ipcResult = (await window.electronAPI.runAI("anthropic", messages, {
      model,
      maxTokens: options?.maxTokens,
    })) as IPCResult | { error: string };
    if ("error" in ipcResult) throw new Error(ipcResult.error);
    result = ipcResult;
  } else {
    result = await callAnthropicDirect(messages, model, options);
  }

  trackUsage(
    "anthropic",
    model,
    result,
    options?.usageContext ?? "unknown",
    messages,
    options?.matchId
  );
  return result.text;
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function callGeminiDirect(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<IPCResult> {
  const apiKey = useConfigStore.getState().geminiApiKey;
  if (!apiKey) throw new Error("No Gemini API key configured");

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");
  const contents = nonSystemMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: options?.maxTokens ?? 1024 },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usage = data?.usageMetadata
    ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      }
    : undefined;
  return { text, usage, model };
}

export async function callGeminiViaIPC(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  let result: IPCResult;

  if (window.electronAPI) {
    const ipcResult = (await window.electronAPI.runAI("gemini", messages, {
      model,
      maxTokens: options?.maxTokens,
    })) as IPCResult | { error: string };
    if ("error" in ipcResult) throw new Error(ipcResult.error);
    result = ipcResult;
  } else {
    result = await callGeminiDirect(messages, model, options);
  }

  trackUsage(
    "gemini",
    model,
    result,
    options?.usageContext ?? "unknown",
    messages,
    options?.matchId
  );
  return result.text;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAIDirect(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<IPCResult> {
  const apiKey = useConfigStore.getState().openaiApiKey;
  if (!apiKey) throw new Error("No OpenAI API key configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: options?.maxTokens ?? 1024 }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const text = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage
    ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
    : undefined;
  return { text, usage, model };
}

export async function callOpenAIViaIPC(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  let result: IPCResult;

  if (window.electronAPI) {
    const ipcResult = (await window.electronAPI.runAI("openai", messages, {
      model,
      maxTokens: options?.maxTokens,
    })) as IPCResult | { error: string };
    if ("error" in ipcResult) throw new Error(ipcResult.error);
    result = ipcResult;
  } else {
    result = await callOpenAIDirect(messages, model, options);
  }

  trackUsage(
    "openai",
    model,
    result,
    options?.usageContext ?? "unknown",
    messages,
    options?.matchId
  );
  return result.text;
}

// ── Local HTTP (Ollama / LM Studio) ─────────────────────────────────────────

export function isAllowedLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1")
    );
  } catch {
    return false;
  }
}

export async function callOllama(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  const ollamaUrl = useConfigStore.getState().localHttpUrl;
  if (!isAllowedLocalUrl(ollamaUrl)) {
    throw new Error(`Blocked request to disallowed URL: ${ollamaUrl}`);
  }
  const response = await fetch(`${ollamaUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens ?? 1024,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");

  // Track usage for local models too (no cost, but useful for token counts)
  if (data.usage) {
    useUsageStore
      .getState()
      .record(
        "local_http",
        model,
        data.usage.prompt_tokens,
        data.usage.completion_tokens,
        options?.usageContext ?? "unknown",
        options?.matchId
      );
  }

  return content;
}
