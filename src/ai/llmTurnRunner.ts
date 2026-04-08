import { runBundleBasedLLMTurn, runStrategicPlannerTurn } from "./llmBundleRunner";
import { useConfigStore } from "../store/configStore";

export async function runLLMTurn(
  provider: "anthropic" | "openai" | "gemini" | "local_http",
  playerId: number,
  signal?: AbortSignal
): Promise<void> {
  const mode = useConfigStore.getState().llmHarnessMode ?? "hybrid";
  if (mode === "llm_scaffolded") {
    return runStrategicPlannerTurn(provider, playerId, signal);
  }
  return runBundleBasedLLMTurn(provider, playerId, signal);
}
