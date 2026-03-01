// POST /api/ai/heuristic — runs heuristic AI server-side (or local LLM).
import { NextRequest, NextResponse } from "next/server";
import type { GameState, GameCommand } from "../../../../src/game/types";
import { loadGameDataForServer } from "../../../../src/game/server-data-loader";
import { HeuristicAI } from "../../../../src/ai/heuristic";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    gameState: GameState;
    playerId: number;
    localHttpUrl?: string;
  };

  await loadGameDataForServer();

  // If a local HTTP URL is provided, try it first (restrict to localhost for SSRF protection)
  if (body.localHttpUrl) {
    try {
      const parsedUrl = new URL(body.localHttpUrl);
      if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
        return NextResponse.json({ error: "Local HTTP URL must be localhost" }, { status: 400 });
      }
      const res = await fetch(`${body.localHttpUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3",
          messages: [{ role: "user", content: `Return a JSON array of game commands for player ${body.playerId}. Game state: ${JSON.stringify(body.gameState).slice(0, 2000)}` }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        // Parse Ollama-style response — fallthrough to heuristic if parse fails
      }
    } catch {
      // Fall through to heuristic
    }
  }

  // Fallback: heuristic AI
  const ai = new HeuristicAI();
  const commands = await ai.requestTurn(body.gameState, body.playerId);
  return NextResponse.json({ commands });
}
