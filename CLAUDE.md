# Modern AW — Claude Code Guide

This file is maintained in git. When a PR review catches an error or deviation from intent,
update this file so future sessions don't repeat the mistake.

---

## Project Overview

Turn-based tactics game (Advance Wars-inspired) built with Next.js 16 App Router + Pixi.js.
- **Game logic** lives in `src/game/` — pure TypeScript, no framework dependencies
- **Rendering** lives in `src/rendering/` — Pixi.js v8, always loaded client-side only
- **UI** is React + Tailwind in `src/components/`
- **State** is Zustand in `src/store/`
- **Multiplayer** is Partykit in `party/match.ts`
- **AI providers** are server-side in `app/api/ai/`

---

## Architecture Rules

### Game Logic (`src/game/`)
- **All game state is immutable.** Every mutation helper returns a new state object, never mutates in place.
- `apply-command.ts` is the only place commands are applied to state. Don't apply commands inline elsewhere.
- `validators.ts` must be called before `apply-command.ts`. Never skip validation.
- `data-loader.ts` is the shared data cache — call `loadGameData()` once on the client before any game logic runs.
- For server-side (API routes, Partykit), use `server-data-loader.ts` which reads from `public/data/` via `fs`.

### Rendering (`src/rendering/`)
- Pixi.js must never be imported at the top level of a file that could run on the server.
- All rendering files have `"use client"` at the top.
- `GameCanvas.tsx` uses `dynamic(() => import(...), { ssr: false })` — never remove the `ssr: false`.
- TILE_SIZE = 16px (sprite sheet resolution). TILE_SCALE = 3 (display multiplier → 48px tiles).

### Sprite System (WarsWorld)
- Sprites are in `public/sprites/warsworld/` — PNG + JSON pairs per army color
- Use `getSprite(sheetKey, frameName)` from `pixi-app.ts` to get static textures
- Use `getAnimation(sheetKey, animName)` from `pixi-app.ts` to get animation frame arrays
- Sheet keys: `"neutral"`, `"orange-star"`, `"blue-moon"`, `"green-earth"`, `"yellow-comet"`
- `sprite-mapping.ts` defines mappings for terrain, roads, rivers, buildings, units
- Roads/rivers use bitmask auto-tiling (see `ROAD_SPRITE_MAP`, `RIVER_SPRITE_MAP`)
- Buildings use `AnimatedSprite` for owned buildings, static `Sprite` for neutral

### React Components
- Components that use Zustand store, browser APIs, or Pixi.js need `"use client"` directive.
- Page components in `app/` are Server Components by default — only add `"use client"` when needed.
- The match page (`app/match/[matchId]/page.tsx`) is `"use client"` because it drives the AI loop.

### State Management
- `useGameStore` is the single source of truth for game state during a match.
- `useConfigStore` is persisted to localStorage (API keys, settings). Never store keys in env client-side.
- When the AI is running its turn, set `aiRunning: true` in the match page to show the indicator.

### API Routes
- AI routes (`/api/ai/*`) are server-side only. They receive `apiKey` from the client body OR fall back to `process.env.*`.
- Always call `loadGameDataForServer()` at the top of every AI route before running game logic.
- API routes validate + apply each command through `validateCommand` → `applyCommand` on a `duplicateState`.

### Partykit (`party/match.ts`)
- The room is the authoritative source for multiplayer matches.
- Every command goes through `validateCommand` in the room before being applied.
- After applying END_TURN, the room checks if the next player is AI and calls the appropriate API route.

---

## Known Mistakes / Don'ts

- **Don't import `fs` or Node.js builtins in files under `src/` that run in the browser.** Use `server-data-loader.ts` (which does the `import('fs/promises')` dynamically) only from API routes.
- **Don't use `useState` for game state.** All game state goes through `useGameStore`. Local component state is fine for UI-only concerns (modal open/closed, etc.).
- **Don't call `getUnitData()` / `getTerrainData()` before `loadGameData()` has resolved.** They return null silently, which leads to silent incorrect behavior (0 damage, units that can't move, etc.).
- **Don't remove `has_acted: true, has_moved: true` from `applyCommand` results.** Several command handlers in `apply-command.ts` must mark units as acted; missing this breaks the turn loop.
- **Pixi `Graphics.fill()` / `Graphics.stroke()` changed in Pixi v8.** The API takes an object `{ color, alpha }` not positional args. Don't revert to v7-style calls.
- **`next.config.ts` uses `turbopack: {}` to silence the webpack/turbopack conflict.** Don't add a `webpack` config block — it conflicts with Turbopack in Next.js 16.

---

## Code Conventions

### TypeScript
- Prefer `interface` over `type` for object shapes.
- Use discriminated unions for command types (see `src/game/types.ts`).
- Return `null` (not `undefined`) from accessors that may fail (`getUnit`, `getTile`, etc.).
- All game logic functions are pure: `(state, ...args) => newState`. No side effects.

### File Naming
- `kebab-case.ts` for all source files.
- `PascalCase.tsx` for React components.
- Route handlers are always `route.ts` inside the appropriate `app/api/` directory.

### Imports
- Import from `@/*` alias for all `src/` imports in `app/` files.
  - e.g. `import { useGameStore } from "@/src/store/game-store"` — but prefer relative imports when already inside `src/`.
- Game logic files (`src/game/`) should only import from other `src/game/` files or `data-loader`.
- Rendering files may import from `src/game/`.

### Tailwind
- Dark UI: `bg-gray-950` for page backgrounds, `bg-gray-900` for cards/panels, `bg-gray-700` for inputs.
- Team colors: red=P1, blue=P2, green=P3, yellow=P4 — consistent across UI and rendering.
- Use `transition-colors` on all interactive elements.

---

## Data Files

- `public/data/terrain.json` — 21 terrain types (AWBW-canonical + FOB) with 8 move types: foot, mech, tires, tread, air, ship, trans, pipe.
- `public/data/units.json` — 26 AWBW-canonical units with verified damage tables. Ground: infantry, mech, recon, apc, tank, md_tank, neo_tank, mega_tank, artillery, rocket, anti_air, missile, piperunner. Air: t_copter, b_copter, fighter, bomber, stealth, black_bomb. Sea: lander, cruiser, submarine, battleship, carrier.
- `public/sprites/aw_sprite_terrain.png` — 128×128 terrain tile atlas. Loaded as Pixi texture key `"terrain"`. Regions in `public/data/tile_mapping.json`.
- `public/sprites/aw_sprite_buildings.png` — 90×90 building atlas. Loaded as Pixi texture key `"buildings"`. Regions in `public/data/building_mapping.json`.
- `public/sprites/unit_00.png` — Unit sprite sheet. Loaded as Pixi texture key `"unit_00"`. Unit positions not yet mapped; renderer falls back to team-colored circles.

Movement cost of `-1` means **impassable** for that move type. Always check `> 0` not just truthy.

---

## Running the Project

```bash
npm run dev          # Dev server at http://localhost:3000 (or next available port)
npm run build        # Production build (must pass before merging)
npx tsc --noEmit     # Type check only
npx partykit dev     # Partykit multiplayer server (separate terminal)
```

The Next.js MCP server auto-connects when `npm run dev` is running. Use `get_errors` to check for
build/runtime errors before declaring work done.

---

## Verification Checklist (run before saying "done")

1. `npx tsc --noEmit` — zero errors
2. `npm run build` — clean build
3. Dev server: main menu renders
4. Start local match → map renders with terrain sprites + units
5. Click unit → blue reachable tiles appear
6. Move unit → unit moves, reachable tiles clear
7. Click enemy in attack range → combat resolves, HP bars update
8. End Turn → AI player takes heuristic turn automatically
9. Check browser console — no unhandled errors
