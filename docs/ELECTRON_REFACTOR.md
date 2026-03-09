# Electron Refactor Plan

> **Living Document** — Update this as work progresses. Other AI agents should read this before making changes.
>
> **Last Updated:** 2026-03-09  
> **Current Phase:** Phase 5 - Local AI Integration  
> **Status:** 🟡 In Progress

---

## Table of Contents

1. [Goals & Motivation](#goals--motivation)
2. [Current Architecture](#current-architecture)
3. [Target Architecture](#target-architecture)
4. [Migration Phases](#migration-phases)
5. [Phase 1: Project Setup](#phase-1-project-setup)
6. [Phase 2: Extract Core Game](#phase-2-extract-core-game)
7. [Phase 3: React UI Migration](#phase-3-react-ui-migration)
8. [Phase 4: Electron Integration](#phase-4-electron-integration)
9. [Phase 5: Local AI Integration](#phase-5-local-ai-integration)
10. [Phase 6: Cleanup & Polish](#phase-6-cleanup--polish)
11. [Learnings & Gotchas](#learnings--gotchas)
12. [Open Questions](#open-questions)

---

## Goals & Motivation

### Why Electron?

1. **No backend needed** — Avoid server hosting costs and complexity
2. **Local API keys** — Users store their own AI API keys locally (no security concerns)
3. **Offline play** — Heuristic AI works without internet
4. **Simpler deployment** — Distribute as standalone app

### What We Keep

- ✅ All game logic (`src/game/`)
- ✅ Pixi.js rendering (`src/rendering/`)
- ✅ React UI components (`src/components/`)
- ✅ Zustand state management (`src/store/`)
- ✅ WarsWorld sprite system
- ✅ AWBW map import

### What We Remove/Change

- ❌ Next.js framework → Vite + React
- ❌ Server-side API routes → Electron main process
- ❌ Partykit multiplayer → Local-only (for now)
- ❌ Server-side data loading → Bundled assets

---

## Current Architecture

```
modern-aw-web/
├── app/                    # Next.js App Router (REMOVE)
│   ├── api/ai/            # Server-side AI routes
│   ├── match/[matchId]/   # Match page
│   └── settings/          # Settings page
├── party/                  # Partykit multiplayer (REMOVE for now)
├── public/
│   ├── data/              # Game data JSON files
│   └── sprites/           # WarsWorld spritesheets
├── src/
│   ├── components/        # React components (KEEP)
│   ├── game/              # Pure game logic (KEEP)
│   ├── rendering/         # Pixi.js rendering (KEEP)
│   ├── store/             # Zustand stores (KEEP)
│   ├── ai/                # AI providers (MODIFY)
│   └── hooks/             # React hooks (KEEP/MODIFY)
```

---

## Target Architecture

```
modern-aw-web/                 # Same repo, refactored in place
├── electron/
│   ├── main.ts            # Electron main process (NEW)
│   ├── preload.ts         # Preload script (NEW)
│   └── ipc-handlers.ts    # IPC handlers for AI (NEW)
├── src/
│   ├── components/        # React components (MODIFIED - remove "use client")
│   ├── game/              # Pure game logic (UNCHANGED)
│   ├── rendering/         # Pixi.js rendering (MODIFIED - remove dynamic imports)
│   ├── store/             # Zustand stores (UNCHANGED)
│   ├── ai/                # AI providers (MODIFIED - call via IPC)
│   └── hooks/             # React hooks (MODIFIED)
├── public/
│   ├── data/              # Game data JSON files (UNCHANGED)
│   └── sprites/           # WarsWorld spritesheets (UNCHANGED)
├── index.html             # Vite entry point (NEW)
├── vite.config.ts         # Vite config (NEW, replaces next.config.ts)
├── electron-builder.json  # Electron packaging (NEW)
├── app/                   # REMOVE after migration
├── party/                 # REMOVE after migration
└── next.config.ts         # REMOVE after migration
```

---

## Migration Phases

| Phase | Description          | Status         | Notes                                      |
| ----- | -------------------- | -------------- | ------------------------------------------ |
| 1     | Project Setup        | 🟢 Complete    | Vite + Electron working!                   |
| 2     | Extract Core Game    | 🟢 Complete    | Full game renders + AI turns!              |
| 3     | React UI Migration   | 🟢 Complete    | All components working                     |
| 4     | Electron Integration | 🟢 Complete    | Save/load, encrypted API keys, settings UI |
| 5     | Local AI Integration | 🟡 In Progress | IPC bridge ready, AI providers need wiring |
| 6     | Cleanup & Polish     | 🔴 Not Started | Testing, packaging                         |

---

## Phase 1: Project Setup

**Goal:** Create new Electron + Vite + React project with proper tooling.

### Tasks

- [x] ~~Create new directory~~ (Refactoring in place instead)
- [x] Install dependencies via pnpm
- [x] Create `vite.config.ts` with Electron plugins
- [x] Create `electron/main.ts` with basic window creation
- [x] Create `electron/preload.ts` for secure IPC bridge
- [x] Create `index.html` entry point
- [x] Create `src/main.tsx` React entry
- [x] Create `src/App.tsx` placeholder component
- [x] Create `src/styles/globals.css` with Tailwind
- [x] Verify app launches with Electron window ✅
- [x] Verify Tailwind styles work ✅
- [x] Verify Electron API bridge works (preload) ✅

### Files to Create

```
electron/main.ts
electron/preload.ts
src/main.tsx
src/App.tsx
index.html
vite.config.ts
tsconfig.json
tailwind.config.js
postcss.config.js
```

### Success Criteria

- [ ] `npm run dev` launches Electron window
- [ ] React renders in window
- [ ] Tailwind styles work
- [ ] TypeScript compiles without errors

---

## Phase 2: Extract Core Game

**Goal:** Copy all pure game logic and verify it works.

### Tasks

- [ ] Copy `src/game/` directory (unchanged)
- [ ] Copy `src/store/` directory
- [ ] Copy `public/data/` directory
- [ ] Copy `public/sprites/warsworld/` directory
- [ ] Update data loading to use bundled assets (no server fetch)
- [ ] Create `src/data-loader.ts` that loads from bundled files
- [ ] Write simple test: create game state, apply commands
- [ ] Verify all TypeScript types compile

### Files to Copy

```
src/game/*.ts           # All game logic
src/store/*.ts          # Zustand stores
public/data/*.json      # Game data
public/sprites/warsworld/*  # Sprite assets
```

### Modifications Needed

- `data-loader.ts` — Change from `fetch('/data/...')` to bundled import or Electron file read

### Success Criteria

- [ ] Can create a GameState
- [ ] Can apply MOVE, ATTACK, END_TURN commands
- [ ] Zustand store works
- [ ] No Next.js dependencies in game code

---

## Phase 3: React UI Migration

**Goal:** Migrate all React components and Pixi.js rendering.

### Tasks

- [ ] Copy `src/components/` directory
- [ ] Copy `src/rendering/` directory
- [ ] Copy `src/hooks/` directory
- [ ] Remove `"use client"` directives (not needed in Vite)
- [ ] Remove Next.js-specific imports (`next/dynamic`, `next/navigation`)
- [ ] Replace `dynamic(() => import(...), { ssr: false })` with regular imports
- [ ] Update `GameCanvas.tsx` to work without Next.js dynamic import
- [ ] Create main App component with routing (react-router-dom)
- [ ] Create pages: Home, Match, Settings

### Components to Migrate

```
src/components/GameCanvas.tsx    # Main game display
src/components/ActionMenu.tsx    # Unit action popup
src/components/MatchSetup.tsx    # Pre-game lobby
src/components/TileInfoPanel.tsx # Hover info
src/components/EndTurnButton.tsx # Turn control
```

### Routing Setup

```tsx
// src/App.tsx
import { HashRouter, Routes, Route } from "react-router-dom";

<HashRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/match" element={<Match />} />
    <Route path="/settings" element={<Settings />} />
  </Routes>
</HashRouter>;
```

### Success Criteria

- [ ] All components render without errors
- [ ] Pixi.js canvas displays terrain and units
- [ ] Can click tiles and see highlights
- [ ] Can move units
- [ ] No Next.js imports remain

---

## Phase 4: Electron Integration

**Goal:** Set up Electron main process and IPC communication.

### Tasks

- [ ] Create `electron/ipc-handlers.ts` for AI API calls
- [ ] Set up secure context bridge in preload script
- [ ] Create IPC channels:
  - `ai:heuristic` — Run heuristic AI (local)
  - `ai:anthropic` — Call Anthropic API
  - `ai:openai` — Call OpenAI API
  - `config:get` — Get stored config
  - `config:set` — Save config
- [ ] Move API key storage to Electron's secure storage
- [ ] Update AI providers to call via IPC instead of fetch

### IPC Structure

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld("electronAPI", {
  runAI: (provider: string, state: GameState, apiKey?: string) =>
    ipcRenderer.invoke("ai:run", provider, state, apiKey),
  getConfig: (key: string) => ipcRenderer.invoke("config:get", key),
  setConfig: (key: string, value: any) => ipcRenderer.invoke("config:set", key, value),
});

// src/ai/electron-provider.ts
export async function runAI(provider: string, state: GameState): Promise<GameCommand[]> {
  return window.electronAPI.runAI(provider, state);
}
```

### Success Criteria

- [ ] Heuristic AI works via IPC
- [ ] Can store/retrieve API keys securely
- [ ] Anthropic AI works with user-provided key
- [ ] OpenAI AI works with user-provided key

---

## Phase 5: Local AI Integration

**Goal:** Ensure AI providers work with locally-stored API keys.

### Tasks

- [ ] Create Settings page for API key management
- [ ] Store keys in Electron's safeStorage (encrypted)
- [ ] Add key validation (test API call)
- [ ] Show clear error messages for invalid keys
- [ ] Add "Test Connection" button for each provider
- [ ] Update match setup to show available AI providers based on configured keys

### Settings UI

```
┌─────────────────────────────────────────┐
│ AI Provider Settings                    │
├─────────────────────────────────────────┤
│ Anthropic API Key: [••••••••••] [Test]  │
│ Status: ✓ Connected                     │
│                                         │
│ OpenAI API Key: [••••••••••••] [Test]   │
│ Status: ✗ Not configured                │
│                                         │
│ Heuristic AI: Always available          │
└─────────────────────────────────────────┘
```

### Success Criteria

- [ ] Can save API keys that persist across app restarts
- [ ] Keys are stored securely (not in plain text)
- [ ] Can test API connection from settings
- [ ] Match setup shows only available AI providers

---

## Phase 6: Cleanup & Polish

**Goal:** Final testing, packaging, and cleanup.

### Tasks

- [ ] Remove all unused files from migration
- [ ] Run full TypeScript check (`tsc --noEmit`)
- [ ] Test all game features:
  - [ ] Unit movement
  - [ ] Combat
  - [ ] Capturing buildings
  - [ ] Building units
  - [ ] Turn cycling
  - [ ] AI turns (all providers)
  - [ ] AWBW map import
- [ ] Set up electron-builder for packaging
- [ ] Create app icons
- [ ] Test packaged app on macOS
- [ ] Test packaged app on Windows (if possible)
- [ ] Write user documentation

### Packaging Config

```json
// electron-builder.json
{
  "appId": "com.modernaw.app",
  "productName": "Modern AW",
  "directories": {
    "output": "dist-electron"
  },
  "mac": {
    "category": "public.app-category.games"
  },
  "win": {
    "target": "nsis"
  }
}
```

### Success Criteria

- [ ] All game features work
- [ ] App packages successfully
- [ ] Packaged app runs on clean system
- [ ] No console errors during normal gameplay

---

## Learnings & Gotchas

> **Add to this section as you discover issues during the refactor!**

### From Previous Development

1. **Pixi.js must be client-side only**
   - In Next.js we used `dynamic()` with `ssr: false`
   - In Electron/Vite, this isn't needed since there's no SSR
   - But ensure Pixi.js isn't imported at module top-level if it causes issues

2. **Game data must be loaded before use**
   - `getUnitData()` / `getTerrainData()` return null if data not loaded
   - Always call `loadGameData()` first
   - In Electron, we can bundle data as JSON imports

3. **AWBW Import has tile ID quirks**
   - Building order varies by ID range (see `src/game/awbw-import.ts` comments)
   - All factions remap to players 0-3
   - Max 4 players supported

4. **WarsWorld sprites are 16x16, scaled 3x to 48px**
   - TILE_SIZE = 16, TILE_SCALE = 3
   - Use `roundPixels: true` in Pixi.js to prevent sub-pixel artifacts

5. **Movement animations use directional sprites**
   - `infantry-mup`, `infantry-mdown`, `infantry-mside`
   - Left movement flips the `mside` sprite

### Electron-Specific

1. **E2E Testing Pipeline Available**
   - `pnpm test:quick` — Fast verification with screenshot + checks
   - `pnpm test:e2e` — Full Playwright test suite
   - Results saved to `e2e/results/` (gitignored)
   - AI agents can run tests and view screenshots to verify changes

2. **Electron Squirrel Startup**
   - `electron-squirrel-startup` is Windows-only
   - Don't import unconditionally, causes errors on macOS/Linux

3. **Vite Plugin Electron Setup**
   - Use `vite-plugin-electron/simple` for easier configuration
   - The `onstart` hook auto-launches Electron in dev mode

4. **electron-squirrel-startup is Windows-only**
   - The module is only needed for Windows NSIS installers
   - Wrap the require in try/catch to avoid errors on macOS/Linux/development

   ```typescript
   try {
     if (require("electron-squirrel-startup")) app.quit();
   } catch {
     /* Module not available */
   }
   ```

5. **pnpm requires explicit build script approval for Electron**
   - Add to `package.json`:
     ```json
     "pnpm": {
       "onlyBuiltDependencies": ["electron", "esbuild"]
     }
     ```
   - Then run `pnpm install` to trigger Electron's postinstall

---

## Open Questions

> **Add questions here that need decisions or research**

1. **Should we support multiplayer in Electron?**
   - Option A: Drop multiplayer entirely (simplest)
   - Option B: Add local network multiplayer later
   - Option C: Keep Partykit as optional online mode
   - **Current Decision:** Drop for MVP, consider later

2. **How to handle game data in Electron?**
   - Option A: Bundle as JSON imports (simpler)
   - Option B: Read from app resources at runtime (more flexible)
   - **Current Decision:** TBD

3. **Should we create a new repo or refactor in place?**
   - Option A: New repo `modern-aw-electron/`
   - Option B: Refactor this repo, remove Next.js
   - **Decision: Option B** — Refactor in place, keep git history

---

## Progress Log

> **Add dated entries as work progresses**

### 2026-03-02

- Created this planning document
- Outlined 6 phases for migration
- Documented current and target architecture

### 2026-03-02 (Phase 1 Complete! 🎉)

- Installed Electron, Vite, and related dependencies via pnpm
- Created `vite.config.ts` with vite-plugin-electron/simple
- Created `electron/main.ts` (main process with IPC handlers)
- Created `electron/preload.ts` (secure context bridge)
- Created `index.html` (Vite entry with CSP headers)
- Created `src/main.tsx` and `src/App.tsx` (React entry)
- Created `src/styles/globals.css` (Tailwind)
- Updated `package.json` with new scripts and pnpm config
- **Result:** Electron app launches successfully with:
  - React 19.2.3 rendering
  - Tailwind CSS working
  - Electron API bridge available (preload script)
  - Platform detection (darwin)
- **Run command:** `pnpm dev`

### 2026-03-02 (Phase 2+3 Complete! 🎉🎉)

- Updated `src/App.tsx` to include full game flow (Setup → Game)
- Fixed data loader to use relative paths (`import.meta.env.BASE_URL`)
- Fixed sprite loader to use relative paths for Electron file:// protocol
- Fixed CSP to allow `unsafe-eval` and `blob:` for Pixi.js shaders/workers
- Added `runHeuristicTurn()` helper to heuristic AI
- Created E2E test pipeline with Playwright for Electron
- **Result:** Full game working in Electron!
  - Map renders with WarsWorld sprites
  - Units animate and move
  - AI takes turns (heuristic AI purchases units and moves)
  - All UI components working (InfoPanel, TileInfoPanel, ActionMenu, BuyMenu)
- **Test commands:**
  - `pnpm test:quick` — Fast verification with screenshot
  - `pnpm test:game` — Full game flow test
- **Key fixes:**
  - CSP: Added `'unsafe-eval' blob:` to script-src, `worker-src 'self' blob:`
  - Vite: Set `base: "./"` for relative asset paths
  - Data/Sprites: Use `import.meta.env.BASE_URL` prefix

---

## References

- [CLAUDE.md](/CLAUDE.md) — Project coding guidelines
- [CHANGELOG.md](/CHANGELOG.md) — Development history
- [docs/ROADMAP.md](/docs/ROADMAP.md) — Feature roadmap
- [Electron Docs](https://www.electronjs.org/docs)
- [Vite Electron Plugin](https://github.com/electron-vite/vite-plugin-electron)
- [electron-builder](https://www.electron.build/)
