// Shared LLM call functions for all providers.

import { useConfigStore } from "../store/config-store";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  maxTokens?: number;
}

// Call Anthropic REST API via Electron IPC
export async function callAnthropicViaIPC(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }
  const result = (await window.electronAPI.runAI("anthropic", messages, {
    model,
    maxTokens: options?.maxTokens,
  })) as { text: string } | { error: string };
  if ("error" in result) throw new Error(result.error);
  return result.text;
}

// Call OpenAI REST API via Electron IPC
export async function callOpenAIViaIPC(
  messages: ChatMessage[],
  model: string,
  options?: LLMCallOptions
): Promise<string> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }
  const result = (await window.electronAPI.runAI("openai", messages, {
    model,
    maxTokens: options?.maxTokens,
  })) as { text: string } | { error: string };
  if ("error" in result) throw new Error(result.error);
  return result.text;
}

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

// Call Ollama (OpenAI-compatible) directly from renderer
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
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");
  return content;
}
