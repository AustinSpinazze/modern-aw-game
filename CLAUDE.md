# Modern AW — Claude Code Guide

This file is maintained in git. When a PR review catches an error or deviation from intent,
update this file so future sessions don't repeat the mistake.

---

## Project Overview

Turn-based tactics game (Advance Wars-inspired). **Stack and layer diagram:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Build:** Vite 7 + React 19 + TypeScript; desktop builds use Electron (see `vite.config.ts`, `electron/`).

- **Game logic** lives in `src/game/` — pure TypeScript, no framework dependencies
- **Rendering** lives in `src/rendering/` — Pixi.js v8, loaded only from components that mount the canvas (e.g. `GameCanvas.tsx`)
- **UI** is React + Tailwind in `src/components/` — entry is `src/App.tsx` (see `index.html` → `src/main.tsx`)
- **State** is Zustand in `src/store/`
- **AI** lives in `src/ai/` — heuristic (no network); LLM turns use **Electron IPC** via `window.electronAPI` when running in Electron (keys stay out of the renderer), or direct HTTP to providers / local Ollama in a plain browser
- **Online multiplayer** is **not** in the repo yet — PartyKit-style rooms are documented in [docs/ROADMAP.md](docs/ROADMAP.md); there is no `party/` server today

---

## Architecture Rules

### Game Logic (`src/game/`)

- **All game state is immutable.** Every mutation helper returns a new state object, never mutates in place.
- `apply-command.ts` is the only place commands are applied to state. Don't apply commands inline elsewhere.
- `validators.ts` must be called before `apply-command.ts`. Never skip validation.
- `data-loader.ts` is the shared data cache — call `loadGameData()` once on the client before any game logic runs.
- For **Node** (scripts, tests, or future tooling), use `server-data-loader.ts` to read `public/data/` via `fs`.

### Rendering (`src/rendering/`)

- The app is a **client SPA** (Vite); there is no SSR. Still keep Pixi imports **scoped** to components that own the canvas so tests and tree-shaking stay clear.
- Some components still carry a `"use client"` directive from the Next.js migration — harmless; Vite ignores it.
- `GameCanvas.tsx` is a normal import from `App.tsx` (not a framework-specific dynamic import).
- TILE_SIZE = 16px (sprite sheet resolution). TILE_SCALE = 3 (display multiplier → 48px tiles).

### Sprite System (WarsWorld)

- Sprites are in `public/sprites/warsworld/` — PNG + JSON pairs per army color
- Use `getSprite(sheetKey, frameName)` from `pixi-app.ts` to get static textures
- Use `getAnimation(sheetKey, animName)` from `pixi-app.ts` to get animation frame arrays
- Sheet keys: `"neutral"`, `"orange-star"`, `"blue-moon"`, `"green-earth"`, `"yellow-comet"`
- `sprite-mapping.ts` defines mappings for terrain, roads, rivers, buildings, units
- Roads/rivers use bitmask auto-tiling (see `ROAD_SPRITE_MAP`, `RIVER_SPRITE_MAP`)
- Buildings use `AnimatedSprite` for owned buildings, static `Sprite` for neutral

### AWBW Map Import (`src/game/awbw-import.ts`)

- **Max 4 players supported.** Maps with 5+ factions throw an error.
- **All factions remap to players 0-3 sequentially**, regardless of AWBW faction type (Grey Sky, Black Hole, Amber Blaze, etc.)
- **QUIRK: Building order varies by tile ID range!**
  - Standard factions (34-100): `city, factory, airport, port, hq`
  - Extended range (117-126): `factory, airport, city, hq, port`
  - Extended range (149+): `airport, city, factory, port, hq`
- If buildings render wrong (port instead of HQ), check which ID range the map uses and adjust `buildingTypes` array in `mapAwbwTile()`
- See detailed comments at top of `awbw-import.ts` for full documentation

### React Components

- Prefer **one-way data flow**: UI reads `useGameStore` and dispatches commands via `submitCommand` / `queueCommands`, not ad-hoc state mutation.
- The **AI turn loop** (heuristic + LLM) is driven from `App.tsx` when the current player is not human.

### State Management

- `useGameStore` is the single source of truth for game state during a match.
- `useConfigStore` persists API keys and models (localStorage in the browser; Electron can sync encrypted keys via `safeStorage` — see `config-store.ts`). Never store secrets in client env vars.
- When the AI is running its turn, set `aiRunning: true` to show the indicator.

### AI integration (no separate backend)

- LLM and cloud calls are implemented in `src/ai/` — not in HTTP routes. In Electron, sensitive calls go through **IPC** to `electron/main.ts`; in the browser, providers may be called directly from the renderer (user keys in config).
- Game data must be loaded (`loadGameData()`) before any rule evaluation that uses `getUnitData()` / `getTerrainData()`.
- All proposed commands must go through `validateCommand` → `applyCommand` on duplicated state (same as human play).

---

## Known Mistakes / Don'ts

- **Don't import `fs` or Node.js builtins in files under `src/` that run in the browser.** Use `server-data-loader.ts` only from Node contexts (scripts, tests, future servers).
- **Don't use `useState` for game state.** All game state goes through `useGameStore`. Local component state is fine for UI-only concerns (modal open/closed, etc.).
- **Don't call `getUnitData()` / `getTerrainData()` before `loadGameData()` has resolved.** They return null silently, which leads to silent incorrect behavior (0 damage, units that can't move, etc.).
- **Don't remove `has_acted: true, has_moved: true` from `applyCommand` results.** Several command handlers in `apply-command.ts` must mark units as acted; missing this breaks the turn loop.
- **Pixi `Graphics.fill()` / `Graphics.stroke()` changed in Pixi v8.** The API takes an object `{ color, alpha }` not positional args. Don't revert to v7-style calls.
- **Don't change `vite.config.ts` `base` casually** — Electron production loads `dist/index.html` via `file://`; `base: "./"` keeps asset paths working.
- **UX improvements: don't change the map or sprites.** Refine only the **menus and chrome surrounding the map** (setup screens, sidebar, top bar, modals, action menu). The Pixi canvas (terrain, units, sprites, highlights, fog, animations) stays untouched; see `docs/UX_IMPROVEMENT_PLAN.md`.

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

### Imports

- Use the `@/*` path alias for `src/` (configured in `tsconfig.json` and `vite.config.ts`).
- Game logic files (`src/game/`) should only import from other `src/game/` files or `data-loader`.
- Rendering files may import from `src/game/`.

### Tailwind

- Dark UI: `bg-gray-950` for page backgrounds, `bg-gray-900` for cards/panels, `bg-gray-700` for inputs.
- Team colors: red=P1, blue=P2, green=P3, yellow=P4 — consistent across UI and rendering.
- Use `transition-colors` on all interactive elements.

---

## Data Files

- `public/data/terrain.json` — 21 terrain types (AWBW-canonical + FOB) with 8 move types: foot, mech, tires, tread, air, ship, trans, pipe.
- `public/data/units.json` — 20 units with verified damage tables. Ground: infantry, mech, recon, apc, tank, md_tank, artillery, rocket, anti_air, missile. Air: t_copter, b_copter, fighter, bomber, stealth. Sea: lander, cruiser, submarine, battleship, carrier.
- `public/sprites/aw_sprite_terrain.png` — 128×128 terrain tile atlas. Loaded as Pixi texture key `"terrain"`. Regions in `public/data/tile_mapping.json`.
- `public/sprites/aw_sprite_buildings.png` — 90×90 building atlas. Loaded as Pixi texture key `"buildings"`. Regions in `public/data/building_mapping.json`.
- `public/sprites/unit_00.png` — Unit sprite sheet. Loaded as Pixi texture key `"unit_00"`. Unit positions not yet mapped; renderer falls back to team-colored circles.

Movement cost of `-1` means **impassable** for that move type. Always check `> 0` not just truthy.

---

## Running the project

```bash
pnpm dev          # Vite + Electron (dev server URL injected; default http://localhost:5173)
pnpm build        # Production build to dist/ (must pass before merging)
npx tsc --noEmit  # Typecheck only
```

Online multiplayer: there is no PartyKit dev script yet — see roadmap when it lands.

---

## Verification checklist (run before saying "done")

1. `npx tsc --noEmit` — zero errors
2. `pnpm build` — clean build
3. Dev app: main menu renders
4. Start local match → map renders with terrain sprites + units
5. Click unit → blue reachable tiles appear
6. Move unit → unit moves, reachable tiles clear
7. Click enemy in attack range → combat resolves, HP bars update
8. End Turn → AI player takes heuristic turn automatically (unless configured otherwise)
9. Check DevTools console — no unhandled errors
