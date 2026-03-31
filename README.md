# Modern AW

Turn-based tactics game (Advance Wars–style) built with **React 19**, **Vite 7**, **Pixi.js v8**, and **Electron** (desktop). Game rules live in pure TypeScript under `src/game/`; the UI is React + Tailwind 4; match rendering uses Pixi.

**Architecture overview:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
**Contributor rules and pitfalls:** [CLAUDE.md](CLAUDE.md)

## Prerequisites

- Node 20+ recommended
- [pnpm](https://pnpm.io/) (used in some test scripts) or npm

## Scripts

| Command         | Description                                    |
| --------------- | ---------------------------------------------- |
| `pnpm dev`      | Vite dev server + Electron (desktop shell)     |
| `pnpm build`    | Production bundle to `dist/`                   |
| `pnpm preview`  | Serve the production build locally             |
| `pnpm package`  | Build + package desktop app (electron-builder) |
| `pnpm test`     | Vitest unit tests                              |
| `pnpm test:e2e` | Playwright against a production build          |

## Getting started

```bash
pnpm install
pnpm dev
```

The Vite dev server defaults to **http://localhost:5173**; Electron loads that URL when running the desktop app.

## Project layout (short)

- `src/game/` — rules engine (immutable state, commands, combat, pathfinding)
- `src/rendering/` — Pixi layers and animators
- `src/components/` — React UI
- `src/store/` — Zustand
- `src/ai/` — heuristic AI + LLM turn runner (Electron IPC for cloud APIs when available)
- `electron/` — main process + preload
- `public/data/`, `public/sprites/` — JSON data and atlases

## Docs

- [docs/units.md](docs/units.md) — unit reference
- [docs/ROADMAP.md](docs/ROADMAP.md) — roadmap (including planned online multiplayer)
