// Partykit authoritative game room.
// Validates + applies commands and broadcasts state to all connected clients.

import type * as Party from "partykit/server";
import type { GameState, GameCommand } from "../src/game/types";
import { stateFromDict } from "../src/game/game-state";
import { validateCommand } from "../src/game/validators";
import { applyCommand } from "../src/game/apply-command";
import { commandFromDict } from "../src/game/commands";
import { loadGameDataSync } from "../src/game/data-loader";

// Load terrain and unit data once at startup
// In Partykit, we can fetch from the public dir via fetch
async function ensureDataLoaded(party: Party.Party) {
  try {
    const [terrainRes, unitsRes] = await Promise.all([
      fetch(new URL("/data/terrain.json", party.env.NEXT_PUBLIC_BASE_URL as string ?? "http://localhost:3000").href),
      fetch(new URL("/data/units.json", party.env.NEXT_PUBLIC_BASE_URL as string ?? "http://localhost:3000").href),
    ]);
    const terrainJson = await terrainRes.json();
    const unitsJson = await unitsRes.json();
    loadGameDataSync(terrainJson, unitsJson);
  } catch {
    console.warn("Could not load game data in Partykit room");
  }
}

export default class MatchRoom implements Party.Server {
  gameState: GameState | null = null;
  dataLoaded = false;
  hostConnectionId: string | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    // Restore persisted state if any, with validation
    const stored = await this.room.storage.get<string>("gameState");
    if (stored) {
      try {
        const parsed = stateFromDict(JSON.parse(stored));
        if (parsed) this.gameState = parsed;
      } catch {
        // Corrupted storage — start fresh
      }
    }
  }

  async onConnect(conn: Party.Connection) {
    // First connection becomes the host
    if (!this.hostConnectionId) {
      this.hostConnectionId = conn.id;
    }
    // Send current state to the new joiner
    if (this.gameState) {
      conn.send(JSON.stringify({ type: "state_update", gameState: this.gameState }));
    }
  }

  async onClose(conn: Party.Connection) {
    if (conn.id === this.hostConnectionId) {
      // Reassign host to the next connected peer
      const connections = [...this.room.getConnections()];
      this.hostConnectionId = connections[0]?.id ?? null;
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: { type: string; command?: unknown; gameState?: unknown };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === "init_state" && msg.gameState) {
      // Only the host can initialize the match
      if (sender.id !== this.hostConnectionId) {
        sender.send(JSON.stringify({ type: "error", message: "Only the host can initialize the match" }));
        return;
      }
      const parsed = stateFromDict(msg.gameState);
      if (!parsed) return; // reject malformed state
      this.gameState = parsed;
      await this.persistAndBroadcast();
      return;
    }

    if (msg.type === "command" && msg.command) {
      if (!this.gameState) return;

      const cmd = commandFromDict(msg.command as Record<string, unknown>);
      if (!cmd) return;

      const result = validateCommand(cmd, this.gameState);
      if (!result.valid) {
        sender.send(JSON.stringify({ type: "error", message: result.error }));
        return;
      }

      this.gameState = applyCommand(this.gameState, cmd);
      await this.persistAndBroadcast();

      // If next player is AI and game is still active, trigger AI turn
      if (this.gameState.phase !== "game_over") {
        const nextPlayer = this.gameState.players[this.gameState.current_player_index];
        if (nextPlayer && nextPlayer.controller_type !== "human") {
          this.triggerAiTurn(nextPlayer.id, nextPlayer.controller_type);
        }
      }
    }
  }

  private async persistAndBroadcast() {
    if (!this.gameState) return;
    await this.room.storage.put("gameState", JSON.stringify(this.gameState));
    this.room.broadcast(JSON.stringify({ type: "state_update", gameState: this.gameState }));
  }

  private async triggerAiTurn(playerId: number, controllerType: string) {
    if (!this.gameState) return;

    const baseUrl = (this.room.env.NEXT_PUBLIC_BASE_URL as string) ?? "http://localhost:3000";
    const providerPath =
      controllerType === "anthropic" ? "anthropic" :
      controllerType === "openai" ? "openai" :
      "heuristic";

    try {
      const res = await fetch(`${baseUrl}/api/ai/${providerPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameState: this.gameState, playerId }),
      });

      if (!res.ok) return;
      const data = await res.json() as { commands: GameCommand[] };

      for (const cmd of data.commands) {
        if (!this.gameState) break;
        const result = validateCommand(cmd, this.gameState);
        if (result.valid) {
          this.gameState = applyCommand(this.gameState, cmd);
        }
      }

      await this.persistAndBroadcast();
    } catch (err) {
      console.error("AI turn via Partykit failed:", err);
    }
  }
}

MatchRoom satisfies Party.Worker;
