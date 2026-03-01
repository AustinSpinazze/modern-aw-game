// POST /api/ai/anthropic — runs Claude API server-side, returns validated commands.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { GameState, GameCommand } from "../../../../src/game/types";
import { validateCommand } from "../../../../src/game/validators";
import { applyCommand } from "../../../../src/game/apply-command";
import { commandFromDict } from "../../../../src/game/commands";
import { duplicateState } from "../../../../src/game/game-state";
import { loadGameDataForServer } from "../../../../src/game/server-data-loader";
import { buildAiPrompt } from "../shared/prompt";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    gameState: GameState;
    playerId: number;
    apiKey?: string;
    model?: string;
  };

  const apiKey = body.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "No Anthropic API key provided" }, { status: 400 });
  }

  await loadGameDataForServer();

  const client = new Anthropic({ apiKey });
  const model = body.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const prompt = buildAiPrompt(body.gameState, body.playerId);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    const commands = parseAndValidateCommands(text, body.gameState, body.playerId);
    return NextResponse.json({ commands });
  } catch (err) {
    console.error("Anthropic API error:", err);
    return NextResponse.json({ error: "Anthropic API call failed" }, { status: 500 });
  }
}

function parseAndValidateCommands(text: string, state: GameState, playerId: number): GameCommand[] {
  const startIdx = text.indexOf("[");
  const endIdx = text.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1) return [{ type: "END_TURN", player_id: playerId }];

  let rawCmds: unknown[];
  try {
    rawCmds = JSON.parse(text.slice(startIdx, endIdx + 1)) as unknown[];
  } catch {
    return [{ type: "END_TURN", player_id: playerId }];
  }

  const valid: GameCommand[] = [];
  let workingState = duplicateState(state);

  for (const raw of rawCmds) {
    const dict = { ...(raw as Record<string, unknown>), player_id: playerId };
    const cmd = commandFromDict(dict);
    if (!cmd) continue;

    const result = validateCommand(cmd, workingState);
    if (result.valid) {
      valid.push(cmd);
      workingState = applyCommand(workingState, cmd);
      if (cmd.type === "END_TURN") break;
    }
  }

  const hasEndTurn = valid.some((c) => c.type === "END_TURN");
  if (!hasEndTurn) valid.push({ type: "END_TURN", player_id: playerId });

  return valid;
}
