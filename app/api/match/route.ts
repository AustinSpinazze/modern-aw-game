// POST /api/match — create a new match, return match ID
import { NextResponse } from "next/server";
import { generateMatchSeed } from "../../../src/game/rng";

export async function POST() {
  const matchId = `match_${Date.now()}_${generateMatchSeed()}`;
  return NextResponse.json({ matchId });
}
