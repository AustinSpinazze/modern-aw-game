# AI Harnesses — Modern AW

Modern AW supports four AI controller types for non-human players. You set a player's controller
in the Match Setup screen before starting a game.

---

## Heuristic (Built-in)

**No setup required.**

The heuristic AI runs entirely offline with no external dependencies. It evaluates each unit each
turn using a scoring function and picks the best move/attack/capture.

**Strategy priorities (per unit, in order):**
1. Attack the highest-value target in range (maximises damage × target cost; instant kill bonus)
2. Capture the current tile if it's a non-owned property
3. Move toward the nearest objective (enemy/neutral property for infantry-class, enemy units for combat units)
4. Attack after moving, if a target is now in range
5. Capture after moving, if on a capturable tile
6. Wait

**Purchases:** factories/airports/ports are used every turn if funds allow, buying in priority order:
infantry → mech → tank → recon → fighter → b_copter

**When to use:** local games where you want fast, instant turns with no latency.

---

## Anthropic (Claude)

**Requires:** Anthropic API key.

The Claude AI uses a step-by-step conversation loop. Each step the game state is serialized to
text and sent to the model; the model returns 1–2 JSON commands; those commands are validated,
animated, and applied; then the updated state is sent back. The loop continues until the model
sends `END_TURN` or all units have acted.

### Setup

1. Open **Settings** in the app.
2. Paste your Anthropic API key. It is stored encrypted via Electron's `safeStorage` (never in
   localStorage or plain text).
3. Optionally change the model (default: `claude-sonnet-4-6`). Any Claude model that supports
   the Messages API works.

### Supported models

Any model ID accepted by `POST https://api.anthropic.com/v1/messages`, e.g.:
- `claude-opus-4-6` — most capable, slower
- `claude-sonnet-4-6` — balanced (default)
- `claude-haiku-4-5-20251001` — fastest, cheapest

### How it works

- API calls are made from the Electron **main process** via IPC (`ai:run`), keeping your key
  out of the renderer.
- The conversation history is kept in memory for the duration of the turn, giving the model
  context about commands it already issued.
- On parse failure or validation error the runner retries up to 3 times per step (9 total).
- If the retry budget is exhausted the turn falls back to the **Heuristic AI**.

---

## OpenAI (GPT)

**Requires:** OpenAI API key.

Identical loop to Anthropic — serialize state → send messages → parse JSON commands → animate →
repeat. Same retry/fallback logic.

### Setup

1. Open **Settings** in the app.
2. Paste your OpenAI API key. Stored encrypted via Electron `safeStorage`.
3. Optionally change the model (default: `gpt-4o`). Any model that supports the Chat Completions
   API works.

### Supported models

Any model ID accepted by `POST https://api.openai.com/v1/chat/completions`, e.g.:
- `gpt-4o` — default, good balance
- `gpt-4o-mini` — faster, cheaper
- `o3-mini` — reasoning model (slower)

### How it works

- API calls go through Electron main process IPC, same as Anthropic.
- Uses `Authorization: Bearer <key>` header against the OpenAI REST endpoint.
- Falls back to **Heuristic AI** on repeated failure.

---

## Local HTTP (OpenAI-compatible)

**Requires:** Any locally-running server that exposes an OpenAI-compatible
`/v1/chat/completions` endpoint.

This harness is model-agnostic — it works with any open-weight model you can run locally,
whether that's a Meta Llama variant, DeepSeek, Kimi, Mistral, Qwen, or anything else.
No data leaves your machine and no API key is required.

### Setup

1. Install a local inference server (see table below) and pull the model you want.
2. Start the server — it will expose an HTTP endpoint locally.
3. In the app's **Settings**, set:
   - **Local HTTP URL:** the server's base URL (e.g. `http://localhost:11434`)
   - **Local Model:** the exact model name the server expects (e.g. `deepseek-r1:7b`)

### Compatible servers

| Server | Default URL | Install |
|--------|-------------|---------|
| [Ollama](https://ollama.com) | `http://localhost:11434` | `brew install ollama` |
| [LM Studio](https://lmstudio.ai) | `http://localhost:1234` | Download from lmstudio.ai |
| [llama.cpp server](https://github.com/ggerganov/llama.cpp) | `http://localhost:8080` | Build from source |
| Any OpenAI-compatible proxy | custom | — |

### Example: running DeepSeek via Ollama

```bash
ollama pull deepseek-r1:7b
ollama serve
# In Settings → Local HTTP URL: http://localhost:11434
# In Settings → Local Model:    deepseek-r1:7b
```

### Example: running Kimi (Moonshot) via Ollama

Kimi K2 is open-weight and available through Ollama:

```bash
ollama pull kimi-k2
ollama serve
# In Settings → Local Model: kimi-k2
```

### Recommended models for game playing

The harness sends structured JSON prompts, so models with strong instruction-following
and reliable JSON output work best.

| Model (Ollama name) | Size | Notes |
|---------------------|------|-------|
| `deepseek-r1:7b` | 7B | Reasoning model, good JSON, slightly slower |
| `deepseek-r1:14b` | 14B | More capable, needs ~10 GB VRAM |
| `kimi-k2` | — | Strong reasoning; check Ollama registry for latest tag |
| `qwen2.5:7b` | 7B | Strong structured output |
| `mistral` | 7B | Good instruction following |
| `llama3.2` | 3B | Fast default; lower quality JSON |
| `llama3.1:8b` | 8B | Better than 3.2 for complex prompts |

> Models smaller than 7B may produce malformed JSON more often. The runner retries up to
> 9 times total before falling back to the **Heuristic AI**.

### How it works

- Calls go **directly from the renderer** via `fetch` (not through Electron IPC). This is
  safe for localhost servers — no API keys to protect, no CORS restrictions in Electron.
- Uses the same step-by-step loop and retry/fallback logic as the cloud providers.
- The request body is standard OpenAI format: `{ model, messages, max_tokens: 1024, stream: false }`.

---

## Fallback Behaviour

All three LLM providers fall back to the **Heuristic AI** automatically when:
- The API call fails (network error, invalid key, rate limit)
- The model produces invalid JSON three times in a row for the same step
- The total retry budget (9 retries) across all steps is exhausted

A warning is logged to the browser console when a fallback occurs:
```
[LLM AI] Too many retries, falling back to heuristic
```

---

## State Serialization

All LLM providers receive the same compact text representation of game state each step.
It includes:

- Turn number and map dimensions
- Player funds and defeat status
- All units on the map: position, HP, owner, moved/acted flags
- All property tiles: type, position, owner, capture progress
- A filtered list of your units that can still act this turn

Example snippet:
```
=== GAME STATE (Turn 3) ===
Map: 15x10
Current player: 0

--- PLAYERS ---
Player 0 (team 0): funds=2000 <YOU>
Player 1 (team 1): funds=1500

--- YOUR UNITS THAT CAN STILL ACT ---
  Unit 3 infantry @(4,6) hp=10 can-move
  Unit 5 tank @(7,3) hp=10 can-move
```

The LLM is instructed to return only a JSON array of 1–2 commands per response.
