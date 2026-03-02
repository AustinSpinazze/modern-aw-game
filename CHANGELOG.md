# Modern AW — Changelog

This file tracks significant changes made by AI agents (Claude Code, Cursor, etc.) to help future sessions understand the project history and continue work seamlessly.

---

## 2026-03-02 (Session 9) — AWBW Import Fixes + Electron Planning

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Electron Refactor — Phase 1 Complete! 🎉

**Phase 1: Project Setup** — Successfully set up Electron + Vite + React in the existing repo.

**Files Created:**
- `vite.config.ts` — Vite config with vite-plugin-electron/simple
- `electron/main.ts` — Electron main process with window creation & IPC
- `electron/preload.ts` — Secure context bridge for renderer
- `index.html` — Vite entry point with CSP headers
- `src/main.tsx` — React entry point
- `src/App.tsx` — Test component with counter
- `src/styles/globals.css` — Tailwind CSS

**Verified Working:**
- ✅ Electron window launches
- ✅ React 19.2.3 renders correctly
- ✅ Tailwind CSS styling works
- ✅ Electron API bridge available via preload
- ✅ Platform detection (darwin/macOS)

**Run:** `pnpm dev` to start the Electron app

### E2E Testing Pipeline

Added automated testing pipeline for AI agents to verify Electron app changes:

**Scripts:**
- `pnpm test:quick` — Fast verification (builds, launches, takes screenshot, runs checks)
- `pnpm test:e2e` — Full Playwright test suite
- `pnpm test:visual` — Quick check + prints text content

**Files Created:**
- `e2e/playwright.config.ts` — Playwright configuration
- `e2e/electron.test.ts` — Full test suite
- `e2e/quick-check.ts` — Fast verification script

**Output:**
- `e2e/results/quick-check.png` — Screenshot of app
- `e2e/results/quick-check-result.json` — Test results
- `e2e/results/quick-check-text.txt` — Page text content

This allows AI agents to verify changes by running tests and viewing screenshots!

**Planning Document:** `docs/ELECTRON_REFACTOR.md`

---

## 2026-03-02 (Session 9) — AWBW Import Fixes

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fixed multiple issues with AWBW map imports:
1. Custom/extended faction buildings weren't rendering with colors
2. Tile sprites were showing alignment artifacts on smaller maps
3. Extended player buildings (IDs 149+) had wrong building types

### Issues Fixed

1. **Custom Faction Support** — AWBW allows community-created custom factions beyond the original 4. Maps using factions like Grey Sky (army 5), Amber Blaze (army 10), etc. were rendering as neutral grey.

   **Fix:** All AWBW factions now remap sequentially to our 4 supported players:
   - First faction in map → Player 0 (Orange Star/red)
   - Second faction → Player 1 (Blue Moon/blue)
   - Third faction → Player 2 (Green Earth/green)
   - Fourth faction → Player 3 (Yellow Comet/yellow)
   - Maps with 5+ factions → Error with clear message

2. **Sub-Pixel Rendering** — Added `roundPixels: true` to Pixi.js to prevent tile alignment artifacts.

3. **Extended Building IDs (149+)** — AWBW's extended faction buildings (IDs 149+) were being treated as neutral cities. Fixed to properly detect owner and building type.

### IMPORTANT: AWBW Tile ID Quirks

**Building order varies by ID range:**
- Standard factions (34-100): `city, factory, airport, port, hq`
- Extended range (117-126): `factory, airport, city, hq, port` ← DIFFERENT!
- Extended range (149+): `airport, city, factory, port, hq` ← ANOTHER ORDER!

If buildings render wrong (e.g., port instead of HQ), check which tile ID range the map uses and adjust the `buildingTypes` array in `mapAwbwTile()`.

### Changes

#### `src/game/awbw-import.ts`
- Added comprehensive documentation comment block explaining AWBW quirks
- All AWBW armies now remap sequentially to players 0-3
- Extended building IDs (149+) now properly detect owner and building type
- Added validation: throws error if map has more than 4 factions
- Building order for 149+ range: `["airport", "city", "factory", "port", "hq"]`

#### `src/rendering/pixi-app.ts`
- Added `roundPixels: true` to `app.init()` to prevent sub-pixel rendering artifacts

---

## 2026-03-02 (Session 7) — Movement Animations

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Added unit movement animations that play when a move action is confirmed. Units now visually walk/drive/fly along the path instead of teleporting. **Animations work for both player AND AI/enemy units.**

### Features Added
1. **Movement Animator** — New `MovementAnimator` class that handles tweened movement along a path
2. **Directional Sprites** — Units use direction-specific animations (mup, mdown, mside) during movement
3. **Animation Flow** — Action confirms trigger animation → on complete → apply game state
4. **Sprite Flipping** — Left movement flips the mside sprite horizontally
5. **Animation-Synced Movement** — Walk/drive cycle completes once per tile (no skating effect)
6. **Command Queue** — AI/enemy commands are queued and animated one at a time

### Technical Details

**Animation System:**
- Speed: ~12 frames per tile at 60fps (5 tiles/second)
- Animation frames sync perfectly with movement (one walk cycle = one tile)
- Direction sprites: `infantry-mup`, `infantry-mdown`, `infantry-mside`, etc.
- Formula: `animationSpeed = animation_frames / game_frames_per_tile`

**State Flow (Player):**
1. User clicks action (Wait/Capture/etc.)
2. `startMoveAnimation(actionCmd)` sets `isAnimating=true`, stores `pendingAction`
3. `MovementAnimator.animate()` begins visual animation
4. Unit is hidden from `UnitRenderer` during animation
5. Animation completes → `onAnimationComplete()` → apply game state

**State Flow (AI/Enemy):**
1. AI returns array of `GameCommand[]`
2. `queueCommands(commands)` builds queue with paths for MOVE commands
3. `processNextCommand()` pops next command
4. If MOVE: animate → apply → continue. Otherwise: apply with small delay
5. Queue empty → `processingQueue=false` → AI turn complete

### Changes

#### New File: `src/rendering/movement-animator.ts`
- `MovementAnimator` class with Pixi.js Container
- `animate(unitType, ownerId, path, onComplete)` — starts animation
- `update()` — called every frame by ticker
- `isAnimating()` — check if animation in progress
- Uses `AnimatedSprite` with directional movement frames
- **Fixed:** Animation synced to movement (no skating effect)

#### `src/store/game-store.ts`
- Added `isAnimating: boolean` state
- Added `pendingAction: GameCommand | null` state  
- Added `startMoveAnimation(actionCmd)` — triggers animation
- Added `onAnimationComplete()` — executes pending action
- **NEW:** Added `commandQueue: QueuedCommand[]` for AI commands
- **NEW:** Added `processingQueue: boolean` to track queue state
- **NEW:** Added `queueCommands(commands)` — queues AI commands with paths
- **NEW:** Added `processNextCommand()` — pops and returns next queued command
- **NEW:** Added `onQueuedAnimationComplete()` — signals animation done

#### `src/components/GameCanvas.tsx`
- Added `MovementAnimator` to render layer (above units)
- Added animation ticker loop
- Added effect to start animation when `isAnimating` becomes true
- Passes `animatingUnitId` to UnitRenderer to hide moving unit
- **NEW:** Added `queueAnimatingUnitId` state for AI unit animations
- **NEW:** Added effect to process command queue with animations

#### `app/match/[matchId]/page.tsx`
- **CHANGED:** AI commands now queued via `queueCommands()` instead of direct apply
- Added effect to reset AI running state when queue processing completes

#### `src/components/ActionMenu.tsx`
- Changed handlers to call `startMoveAnimation()` instead of `confirmMoveAndAction()`
- Hidden during animation (`isAnimating` check)

#### `src/rendering/unit-renderer.ts`
- Added `animatingUnitId` parameter to `render()`
- Skips rendering the unit being animated

### Roadmap Updated
- Updated `docs/ROADMAP.md` priority matrix
- Electron migration prioritized before Audio (per user request)

---

## 2026-03-01 (Session 6) — Movement Path Arrow & Pending Move Fix

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fixed gameplay issues to match AWBW behavior:
1. **Movement bug** — Units were getting stuck if you clicked off instead of confirming "Wait"
2. **Path arrow** — Added visual path indicator that follows mouse like AWBW
3. **Z-order fix** — Path arrow now renders on top of terrain (mountains, buildings)

### Problem 1: Movement Bug
Previously, clicking a destination tile immediately executed the MOVE command. If the player then clicked elsewhere (not on Wait/Attack), the unit would be stuck at the new position with `has_moved=true` but `has_acted=false`, and there was no way to undo.

### Problem 2: Path Arrow Not Following Mouse
The path arrow was only shown after clicking a destination. AWBW shows the path dynamically as you hover over reachable tiles.

### Problem 3: Path Cut Off by Terrain
The path arrow was rendering behind mountains, buildings, and other tall terrain elements.

### Solution

**Pending Move Pattern:**
- Clicking a destination sets a **pending move** instead of immediately executing
- Move is only applied when player confirms an action (Wait, Attack, Capture)
- Cancel button properly returns unit to original state

**Hover Path Preview:**
- Added `hoverPath` state that updates as mouse moves over reachable tiles
- Path arrow follows cursor in real-time before clicking
- After clicking, `pendingPath` shows the confirmed path

**Z-Order Fix:**
- Created separate `pathOverlay` container that renders on top of everything
- Render order: terrain → highlights → units → path overlay

### Changes

#### `game-store.ts`
- Added `hoverPath: Vec2[]` — path preview while hovering (before click)
- Added `pendingPath: Vec2[]` — confirmed path (after click)
- Updated `setHoveredTile()` to compute path when hovering over reachable tiles
- Added `confirmMoveAndAction(cmd)` — applies MOVE + action atomically
- Added `cancelPendingMove()` — restores selection without moving

#### `GameCanvas.tsx`
- Added `pathOverlayRef` — separate highlight layer for path arrows on top
- Render order: terrain → highlights → units → pathOverlay
- Path shows `hoverPath` during hover, `pendingPath` after click
- Ghost unit only appears after clicking (not during hover)

#### `ActionMenu.tsx`
- Shows when there's a `pendingMove` (after clicking destination)
- Uses `confirmMoveAndAction()` to apply move + action together
- Cancel calls `cancelPendingMove()` to restore selection

#### `highlight-renderer.ts`
- Added `drawPath(path: Vec2[])` — draws yellow arrow with corners
- Added `drawPendingDest(pos)` — green highlight on pending destination

#### `unit-renderer.ts`
- Ghost preview only shows after clicking destination (pendingMove set)

### AWBW-Like Behavior
1. Click unit → shows reachable tiles (blue)
2. Hover over reachable tile → path arrow follows mouse
3. Click destination → ghost unit appears, action menu shows
4. Confirm action → unit moves and acts
5. Cancel → unit stays at original position

---

## 2026-03-01 (Session 6b) — Path Arrow & UI Polish

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fixed several visual and gameplay issues with path arrows and unit rendering.

### Issues Fixed

1. **Arrow malformed/cut off** — Rewrote path drawing to use smooth connected lines instead of separate rectangles
2. **Arrow covering unit** — Path now starts from edge of unit's tile, not center (doesn't overlap unit sprite)
3. **Attack squares showing prematurely** — Red attack range only shows after clicking destination, not during initial selection
4. **Units faded when not their turn** — Units now only fade if they belong to the current player AND have already acted

### Changes

#### `highlight-renderer.ts`
- Completely rewrote `drawPath()` to use `Graphics.lineTo()` for smooth connected lines
- Path starts from SECOND tile in path (edge of unit's tile), not covering the unit
- Added proper border/outline by drawing thicker line underneath
- Simplified arrowhead drawing
- Uses rounded caps and joins for cleaner appearance

#### `unit-renderer.ts`
- Added `currentPlayerId` tracking
- Units only fade if: `unit.owner_id === currentPlayerId && unit.has_acted`
- Enemy units always render at full opacity

#### `game-store.ts`
- `selectUnit()` no longer shows attack tiles immediately
- `cancelPendingMove()` no longer shows attack tiles
- Attack squares only appear after clicking a destination (`setPendingMove`)

---

## 2026-03-01 (Session 6c) — Visual Polish & AWBW Parity

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Multiple visual improvements to match AWBW appearance.

### Issues Fixed

1. **Units transparent instead of darker** — Now uses tint (0x666666) instead of alpha for acted units, like WarsWorld
2. **Attack squares showing with no enemies** — Only shows red attack tiles if there are actual enemy units in range
3. **Arrow triangle had bottom border** — Removed stroke from arrowhead for cleaner look
4. **Green destination highlight** — Replaced with AWBW-style dashed white cursor
5. **Reachable tiles hard to see** — Made brighter (0x88ccff, alpha 0.55) like AWBW

### Changes

#### `unit-renderer.ts`
- Added `ACTED_TINT = 0x666666` constant for darkening acted units
- Uses `sprite.tint` instead of `sprite.alpha` for acted units (darker shade, not transparent)
- Added `TEAM_COLORS_ACTED` for fallback rendering
- Units only darken if: owned by current player AND have acted

#### `highlight-renderer.ts`
- `drawReachable()` now uses brighter blue (0x88ccff, alpha 0.55)
- Replaced `drawPendingDest()` with AWBW-style dashed cursor
- `drawCursor()` draws dashed white border like AWBW
- Arrowhead no longer has a stroke (cleaner connection to path)
- Path automatically draws cursor at destination

#### `game-store.ts`
- `setPendingMove()` now filters attack tiles to only include tiles with enemy units
- No attack range shown when there are no enemies to attack

#### `GameCanvas.tsx`
- Removed `drawPendingDest()` call (cursor is drawn by path arrow now)

---

## 2026-03-01 (Session 6d) — Arrow & Cursor Polish

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fine-tuned path arrow and targeting cursor to match AWBW appearance.

### Issues Fixed

1. **Arrow triangle border** — Now has border on outer edges only (not on base where it connects to line)
2. **Targeting cursor style** — Changed to AWBW-style corner brackets (L-shaped corners)
3. **Cursor always visible** — Targeting cursor now shows constantly when hovering, not just during unit moves
4. **Line straight, not rounded** — Changed from `cap: "round"` to `cap: "butt"` for straight ends
5. **Line doesn't overlap unit** — Path now starts from edge of FIRST path tile, not from unit's tile edge

### Changes

#### `highlight-renderer.ts`
- Renamed `drawCursor()` to `drawTargetCursor()` — AWBW-style corner brackets (4 L-shaped yellow corners)
- `drawPath()` uses `cap: "butt"` and `join: "miter"` for straight lines
- Path starts from first path tile's edge (not unit tile) to avoid overlapping unit
- `drawArrowhead()` now draws border only on outer edges (tip to left, tip to right), not on base
- Arrowhead uses separate fill and stroke calls to control which edges have borders

#### `GameCanvas.tsx`
- Added `cursorOverlayRef` — separate layer for targeting cursor (always on top)
- Added `hoveredTile` to store subscriptions
- Cursor overlay always renders targeting cursor at `hoveredTile` position
- Render order: terrain → highlights → units → pathOverlay → cursorOverlay

---

## 2026-03-01 (Session 6e) — Path & Unit Polish

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fixed path arrow overlap issues and removed ghost unit preview.

### Issues Fixed

1. **Path overlapping destination unit** — Path now ends at edge of destination tile, not center
2. **Ghost unit preview removed** — Unit stays in place until action is confirmed (no ghost)

### Changes

#### `highlight-renderer.ts`
- Path now ends at EDGE of destination tile (not center)
- Prevents arrow from overlapping the unit at destination
- Arrowhead positioned at tile edge

#### `unit-renderer.ts`
- Removed ghost/pending move preview entirely
- Units always render at their current game state position
- Cleaned up unused `PendingMoveInfo` interface and ghost-related code

#### `GameCanvas.tsx`
- Simplified unit render call (no pendingMove parameter)

---

## 2026-03-01 — Roadmap Document Created

**Session:** Cursor (Claude Opus 4.5)

### Summary
Created comprehensive project roadmap at `docs/ROADMAP.md` covering:
- Completed features
- Planned features (movement animations, AI, etc.)
- Electron migration plan for local-first desktop app
- UX polish items
- Priority matrix
- Rough timeline

### Key Decisions
- **Electron migration** planned to avoid backend complexity
- **AI API keys** will be stored locally (not on server)
- **Web version** kept for online multiplayer only
- **Desktop version** for AI games + local play

---

## 2026-03-01 (Session 5) — Unit Animations

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Added idle animations to all 19 units using WarsWorld's AnimatedSprite frames.

### Changes

#### `sprite-mapping.ts`
- Added `UNIT_ANIMATIONS` — maps unit type IDs to WarsWorld animation names
- Added `UNIT_MOVE_DIRECTIONS` — movement direction suffixes for future use
- Added `UNIT_ANIMATION_SPEED = 0.08` — slightly faster than buildings

#### `unit-renderer.ts`
- Updated to use `AnimatedSprite` instead of static `Sprite`
- Uses `getAnimation(sheetKey, animationName)` for frame arrays
- Falls back to colored rectangles if animation not found

### Unit Animation Mapping
| Our ID | WarsWorld Animation |
|--------|---------------------|
| infantry | infantry |
| mech | mech |
| recon | recon |
| apc | apc |
| tank | tank |
| md_tank | mediumTank |
| artillery | artillery |
| rocket | rocket |
| anti_air | antiAir |
| missile | missile |
| t_copter | transportCopter |
| b_copter | battleCopter |
| fighter | fighter |
| bomber | bomber |
| stealth | stealth |
| lander | lander |
| cruiser | cruiser |
| submarine | sub |
| carrier | carrier |

### Future: Movement Animations
WarsWorld has directional movement animations ready:
- `{unit}-mdown` — moving down
- `{unit}-mside` — moving left/right (flip sprite for left)
- `{unit}-mup` — moving up

These can be activated when implementing unit movement visualization.

### Files Changed
| File | Change |
|------|--------|
| `src/rendering/sprite-mapping.ts` | Added `UNIT_ANIMATIONS`, `UNIT_MOVE_DIRECTIONS`, `UNIT_ANIMATION_SPEED` |
| `src/rendering/unit-renderer.ts` | Use `AnimatedSprite` for units |

---

## 2026-02-28 (Session 4) — AWBW Tile ID Mapping Fix

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Problem
Imported AWBW maps had **neutral buildings rendering as plains** and some terrain confusion.

### Root Cause
Our `awbw-import.ts` had incorrect tile ID mappings. The mapping was based on speculation rather than AWBW's actual tile ID system.

### Fix
Rewrote `awbw-import.ts` using WarsWorld's official AWBW tile ID mapping from:
`https://github.com/WarsWorld/WarsWorld/blob/main/src/server/tools/map-importer-utilities.ts`

### Key Corrections
| AWBW ID | Before (Wrong) | After (Correct) |
|---------|----------------|-----------------|
| 29-32 | shoal ✓ | shoal ✓ (4 variants) |
| 33 | reef ✓ | reef ✓ |
| 34 | plains ❌ | neutral city ✓ |
| 35 | plains ❌ | neutral factory ✓ |
| 36 | plains ❌ | neutral airport ✓ |
| 37 | plains ❌ | neutral port ✓ |
| 38-57 | (various) | OS/BM/GE/YC buildings |
| 81-100 | (missing) | RF/GS/BH/BD buildings |
| 111-112 | (missing) | silos → plains |
| 133 | comm tower ✓ | neutral comm tower → city |
| 145 | lab ✓ | neutral lab → city |

### Known Limitation
**Shoals render as single yellow tiles** instead of proper coastlines. This is a sprite sheet limitation — WarsWorld only has one `shoal.png` sprite with no directional variants for coastline auto-tiling. AWBW has many shoal variants (29, 30, 31, 32) for different coastline orientations, but we render them all the same.

### Files Changed
| File | Change |
|------|--------|
| `src/game/awbw-import.ts` | Rewritten with correct tile ID mapping |

---

## 2026-02-28 (Session 3) — WarsWorld Sprite Migration

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Replaced custom sprites with WarsWorld's official AWBW-style sprites. WarsWorld uses Pixi.js Spritesheet format (JSON + PNG pairs) with proper animation frames and army color variations.

### What Changed

#### Sprite System Architecture
- **Old:** Custom 128×128 sprite sheets with manual region extraction (`createSubTexture`)
- **New:** WarsWorld 16×16 sprites using Pixi.js Spritesheet class with auto-parsed frames

#### Downloaded WarsWorld Assets → `public/sprites/warsworld/`
- `neutral.png` + `neutral.json` — Terrain tiles (plains, roads, rivers, mountains, etc.)
- `orange-star.png` + `orange-star.json` — Player 1 buildings & units
- `blue-moon.png` + `blue-moon.json` — Player 2 buildings & units
- `green-earth.png` + `green-earth.json` — Player 3 buildings & units
- `yellow-comet.png` + `yellow-comet.json` — Player 4 buildings & units

#### New/Updated Files

**`src/rendering/pixi-app.ts`** — Rewrote sprite loading
- Added `loadSpritesheets()` — loads all WarsWorld JSON+PNG pairs
- Added `getSprite(sheetKey, frameName)` — retrieves textures from spritesheets
- Added `getSpritesheet(key)` — returns full spritesheet object
- Kept legacy `createSubTexture` for backwards compatibility (unused)

**`src/rendering/sprite-mapping.ts`** — NEW FILE
- `PLAYER_TO_ARMY` — maps player IDs (0-3) to spritesheet keys
- `TERRAIN_SPRITES` — maps terrain types to frame names
- `ROAD_SPRITE_MAP` / `RIVER_SPRITE_MAP` — bitmask-based auto-tiling
- `BUILDING_SPRITES` — maps building types to frame names
- `UNIT_SPRITES` — maps unit types to frame names
- `FALLBACK_COLORS` — fallback when sprites unavailable

**`src/rendering/terrain-renderer.ts`** — Rewrote to use WarsWorld sprites
- Uses `getSprite("neutral", frameName)` for terrain
- Uses `getSprite(armySheet, frameName)` for colored buildings
- Roads/rivers use bitmask auto-tiling from sprite-mapping
- Falls back to colored rectangles when sprites missing

**`src/rendering/unit-renderer.ts`** — Updated to use WarsWorld sprites
- Uses `getSprite(armySheet, unitFrameName)` for units
- Falls back to colored rounded rectangles when sprites missing
- HP badges still render over sprites when damaged

#### Deprecated Old Sprites → `public/sprites/deprecated/`
Moved these files to prevent confusion:
- `aw_sprite_terrain.png`, `aw_sprite_buildings.png` — old custom sheets
- `terrain_00.png`, `terrain_01.png`, `terrain_02.png`, `terrain_generated.png`
- `building_00.png`, `modern-aw-sprites-building.png`
- `tiles.png`, `unit_00.png`, `misc_00.png`

### WarsWorld Sprite Naming Convention
- **Terrain:** `plain.png`, `forest.png`, `mountain.png`, `sea.png`, etc.
- **Roads (auto-tiled):** `road-top-bottom.png`, `road-right-left.png`, `road-top-right-bottom-left.png`
- **Rivers (auto-tiled):** Same pattern as roads
- **Buildings:** `city-0.png`, `base-0.png`, `airport-0.png` (frame 0)
- **Units:** `infantry-0.png`, `tank-0.png`, `fighter-0.png` (idle frame)
- **Unit movement:** `infantry-mdown-0.png`, `infantry-mside-0.png`, `infantry-mup-0.png`

### Files Changed
| File | Change |
|------|--------|
| `src/rendering/pixi-app.ts` | Rewrote — Spritesheet loading |
| `src/rendering/sprite-mapping.ts` | New file — sprite name mappings |
| `src/rendering/terrain-renderer.ts` | Rewrote — WarsWorld terrain sprites |
| `src/rendering/unit-renderer.ts` | Updated — WarsWorld unit sprites |
| `public/sprites/warsworld/*` | New — WarsWorld sprite sheets |
| `public/sprites/deprecated/*` | Moved — old custom sprites |

### Verification
- [x] `npx tsc --noEmit` — zero type errors
- [x] Visual test — sprites rendering correctly

---

## 2026-02-28 (Session 3c) — Building Animations

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Added idle animations to buildings using WarsWorld's AnimatedSprite frames.

### Changes

#### Added Animation Support
- **`pixi-app.ts`:** Added `getAnimation(sheetKey, animationName)` function to retrieve animation frame arrays from spritesheets
- **`sprite-mapping.ts`:** Added `BUILDING_ANIMATIONS` map and `BUILDING_ANIMATION_SPEED` constant
- **`terrain-renderer.ts`:** Updated `drawBuildingSprite()` to use `AnimatedSprite` instead of static `Sprite`

#### Animation Details
| Building | Animation Name | Frames |
|----------|---------------|--------|
| Factory | `base` | 6 frames |
| City | `city` | 3 frames |
| Airport | `airport` | 3 frames |
| HQ | `hq` | 3 frames |
| Port | `port` | 3 frames |

Animation speed: 0.04 (same as WarsWorld)

### Files Changed
| File | Change |
|------|--------|
| `src/rendering/pixi-app.ts` | Added `getAnimation()` function |
| `src/rendering/sprite-mapping.ts` | Added `BUILDING_ANIMATIONS`, `BUILDING_ANIMATION_SPEED` |
| `src/rendering/terrain-renderer.ts` | Use `AnimatedSprite` for buildings |

### Future: Unit Animations
WarsWorld also has unit animations available:
- **Idle:** `{unit}-0.png` through `{unit}-3.png`
- **Movement:** `{unit}-mdown`, `{unit}-mside`, `{unit}-mup` (directional)

Unit animations will be added when implementing unit movement visualization.

---

## 2026-02-28 (Session 3d) — Codebase Cleanup

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Removed deprecated files and legacy code that is no longer used after the WarsWorld sprite migration.

### Files Removed

#### Deprecated Sprites (~4.5MB saved)
Removed entire `public/sprites/deprecated/` folder containing old custom sprites:
- `aw_sprite_terrain.png`, `aw_sprite_buildings.png`
- `terrain_00.png`, `terrain_01.png`, `terrain_02.png`, `terrain_generated.png`
- `building_00.png`, `modern-aw-sprites-building.png`
- `tiles.png`, `unit_00.png`, `misc_00.png`

#### Unused Reference Files
Removed from `public/sprites/`:
- `atlas_config.json` — old atlas config for deprecated sprites
- `TILE_REFERENCE_GRID.png`, `TILE_VISUAL_REFERENCE.png` — dev reference images
- `screen1.png`, `screen2.png`, `screen3.png` — old screenshots

#### Old Data Mappings
Removed from `public/data/`:
- `building_mapping.json` — 128×128 sprite region mappings (unused)
- `tile_mapping.json` — old terrain sprite mappings (unused)

### Code Cleaned

#### `pixi-app.ts`
Removed legacy texture system:
- Removed `textures` storage object
- Removed `getTexture()` function
- Removed `createSubTexture()` function  
- Removed unused `Rectangle` import

### Final File Structure
```
public/
├── data/
│   ├── terrain.json    # Active terrain definitions
│   └── units.json      # Active unit definitions
└── sprites/
    └── warsworld/      # Active WarsWorld spritesheets
        ├── neutral.png/json
        ├── orange-star.png/json
        ├── blue-moon.png/json
        ├── green-earth.png/json
        └── yellow-comet.png/json
```

### Also Removed (Full Audit)

#### `scripts/*.png` (~24MB)
54 debug screenshot images generated during development. Kept the utility scripts:
- `screenshot.mjs` — Playwright screenshot helper for visual validation
- `diag.mjs` — Diagnostic screenshot utility

#### `public/*.svg` (Next.js defaults)
Unused starter template files: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`

#### `.DS_Store` files
macOS system files cleaned up

### Final Project Structure
```
public/           548K
├── data/
│   ├── terrain.json
│   └── units.json
└── sprites/warsworld/
    └── (10 files: 5 PNG + 5 JSON)

scripts/          8K
├── screenshot.mjs   # Visual validation utility
└── diag.mjs         # Diagnostic utility

src/              220K
app/               76K
docs/              24K
```

### Files Changed
| File | Change |
|------|--------|
| `src/rendering/pixi-app.ts` | Removed legacy texture code |
| `CLAUDE.md` | Updated sprite system docs |
| Multiple files | Deleted (see above) |

---

## 2026-02-28 (Session 3b) — Terrain Rendering Fixes

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Fixed mountain rendering issue (black background) and improved sprite handling.

### Fixes Applied

#### Mountain Black Background
- **Issue:** Mountains showed black pixels where sprites had transparency
- **Fix:** Draw plains tile underneath mountains before rendering mountain sprite
- Added `TRANSPARENT_TERRAIN` set for terrain types needing base layer (mountain, forest)

#### Tall Sprite Anchoring
- **Issue:** Mountains are 16×21 pixels (taller than standard 16×16 tile)
- **Fix:** Added `drawOverlaySprite()` method that anchors sprites at the bottom
- Taller sprites now render correctly, extending upward from the tile

### Known Limitation: Shoal/Coastline Auto-Tiling
WarsWorld's sprite sheet only has a single `shoal.png` without directional variants. AWBW has tile IDs 29-32 for shoals, but WarsWorld maps all of them to the same sprite.

**Result:** Coastlines appear as uniform shoal tiles instead of showing beach edges where they connect to land. This matches WarsWorld's current rendering but differs from actual AWBW.

**Possible Future Fix:** Create or source directional shoal sprites (shoal-top.png, shoal-right.png, etc.) and add auto-tiling logic similar to roads/rivers.

### Files Changed
| File | Change |
|------|--------|
| `src/rendering/terrain-renderer.ts` | Added base layer for mountains/forests, added `drawOverlaySprite()` |

---

## 2026-02-28 (Session 2) — Scope Simplification

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Summary
Simplified the game scope. The goal is NOT a 1:1 AWBW clone, but to use AWBW's battle-tested patterns as a foundation for rendering/mechanics, then add custom units and buildings later.

### Scope Clarification
**Keep from AWBW:**
- Basic terrain: plains, forest, mountain, road, bridge, shoal, sea, reef, river
- Buildings: hq, city, factory, airport, port
- 19 units (simplified roster)

**Removed from AWBW:**
- Terrain: pipe, pipe_seam, com_tower, lab, missile_silo, missile_silo_empty
- Units: neo_tank, mega_tank, piperunner, battleship, black_bomb
- No CO system (intentionally out of scope)

### Changes Made

#### terrain.json
- Removed: pipe, pipe_seam, com_tower, lab, missile_silo, missile_silo_empty
- Removed `pipe` movement type from all terrain movement_costs
- Updated production lists to match simplified unit roster

#### units.json — Now 19 Units
**Ground (10):** infantry, mech, recon, apc, tank, md_tank, artillery, rocket, anti_air, missile
**Air (5):** t_copter, b_copter, fighter, bomber, stealth
**Sea (4):** lander, cruiser, submarine, carrier

#### terrain-renderer.ts
- Removed fallback colors for: pipe, pipe_seam, com_tower, lab, missile_silo, missile_silo_empty
- Removed from TERRAIN_TO_BUILDING map: com_tower, lab
- Removed getTerrainKey cases for removed terrain types

#### awbw-import.ts
- Updated to convert removed AWBW terrain to plains/city (pipes→plains, com_tower/lab→city)
- Updated AWBW_UNIT_MAP to skip excluded units during import

### Files Changed
| File | Change |
|------|--------|
| `public/data/terrain.json` | Simplified — 15 terrain types |
| `public/data/units.json` | Simplified — 19 units |
| `src/rendering/terrain-renderer.ts` | Cleanup — removed unused fallbacks |
| `src/game/awbw-import.ts` | Updated — maps removed items to equivalents |

---

## 2026-02-28 (Session 1) — AWBW Data Port & Map Import

**Session:** Claude Code (Opus 4.5)  
**Status:** ✅ COMPLETE (then simplified in Session 2)

### Summary
Ported game data to match AWBW (Advance Wars By Web) canonical standards and added AWBW map import functionality.

### Changes Made

#### Phase 1: units.json — AWBW-Canonical 26 Units ✅
- **Removed** 18 custom units (engineer, drone_team, light_tank, heavy_tank, mobile_artillery, etc.)
- **Added** 12 AWBW units: md_tank, neo_tank, mega_tank, rocket, missile, piperunner, t_copter, b_copter, bomber, stealth, black_bomb, battleship
- **Updated** all damage tables to match AWBW community-verified values
- **Standardized** movement types to 8: `foot`, `mech`, `tires`, `tread`, `air`, `ship`, `trans`, `pipe`

**Final roster (26 units):**
- Ground (13): infantry, mech, recon, apc, tank, md_tank, neo_tank, mega_tank, artillery, rocket, anti_air, missile, piperunner
- Air (6): t_copter, b_copter, fighter, bomber, stealth, black_bomb
- Sea (5): lander, cruiser, submarine, battleship, carrier

#### Phase 2: terrain.json — New Terrain Types ✅
- **Added** 6 terrain types: pipe, pipe_seam, com_tower, lab, missile_silo, missile_silo_empty
- **Updated** all movement_costs to use 8 movement types
- **Added** `is_destructible` and `default_hp` fields to pipe_seam (99 HP)

#### Phase 3: AWBW Map Import ✅
- **Created** `src/game/awbw-import.ts` with:
  - `parseAwbwMapText()` — parses CSV tile ID data
  - `importAwbwMap()` — converts AWBW tile IDs to GameState
  - Full AWBW tile ID mapping (terrain 1-164, units 500+)
  - Support for 16 AWBW armies (Orange Star through White Nova)
  - Pre-deployed unit placement

#### Phase 4: terrain-renderer.ts — Fallback Colors ✅
- **Added** fallback colors: pipe (0x666666), pipe_seam (0x888888), com_tower (0xFFAA00), lab (0xCC00CC), missile_silo (0xCC3333), missile_silo_empty (0x993333)
- **Updated** `TERRAIN_TO_BUILDING` to include com_tower and lab
- **Added** cases in `getTerrainKey()` for new terrain types

#### Phase 5: Production Lists ✅
- **Factory:** infantry, mech, recon, apc, tank, md_tank, neo_tank, mega_tank, artillery, rocket, anti_air, missile, piperunner
- **Airport:** t_copter, b_copter, fighter, bomber, stealth, black_bomb
- **Port:** lander, cruiser, submarine, battleship, carrier

#### Phase 6: MatchSetup.tsx — AWBW Import UI ✅
- **Added** textarea for pasting AWBW map CSV data
- **Added** "Import & Start" button with error handling
- **Integrated** awbw-import functions

### Files Changed
| File | Change |
|------|--------|
| `public/data/units.json` | Rewrite — 26 AWBW units |
| `public/data/terrain.json` | Major edit — 6 new terrains, 8 move types |
| `src/game/awbw-import.ts` | New file — AWBW map importer |
| `src/rendering/terrain-renderer.ts` | Edit — fallback colors, building map |
| `src/components/MatchSetup.tsx` | Edit — AWBW import UI |

### Verification Completed
- [x] `npx tsc --noEmit` — zero errors
- [x] Dev server runs without errors
- [x] AWBW import UI renders in MatchSetup

---

## Future Work / Known TODOs

### Phase 1: Verify WarsWorld Sprites (Current Focus)
- [x] Migrate to WarsWorld sprite system
- [x] Fix AWBW tile ID mapping for buildings
- [x] Add building idle animations
- [x] Add unit idle animations (all 19 units)
- [ ] Verify all 15 terrain types render correctly
- [ ] Test unit movement, combat, and turn flow
- [ ] Add unit movement animations (when moving)
- [ ] Fix any rendering bugs with terrain auto-tiling

### Known Sprite Limitations (WarsWorld)
- **Shoals** — Only one `shoal.png` sprite, no coastline auto-tiling variants. Beaches appear as yellow blocks instead of smooth coastlines.
- **Sea** — Only one `sea.png` sprite, no animated waves or directional variants.
- To fix: would need to source AWBW's actual coastline sprites or create custom auto-tiling logic.

### Phase 2: Add Custom Units (from docs/units.md)
The `docs/units.md` file contains 30 custom unit designs to be added after base game works:
- [ ] Engineer — builds trenches and FOBs
- [ ] Drone Team — indirect infantry
- [ ] Light Tank, Heavy Tank — vehicle variants
- [ ] Mobile Artillery, Towed Artillery — indirect fire
- [ ] Light SAM, Heavy SAM — specialized AA
- [ ] MLRS — long-range rocket artillery
- [ ] Blackhawk, Chinook, Apache — helicopters
- [ ] Fighter, Air Tanker, Heavy Cargo, P-8 Poseidon, UAV — fixed-wing
- [ ] Resupply Ship, Destroyer, Submarine, Cruiser, Aircraft Carrier — naval

Each custom unit needs:
1. Stats defined in units.json
2. Sprite graphics (16x16 or 32x32)
3. Damage table entries for all other units

### Phase 3: Add Custom Buildings
- [ ] Design new building types (radar station, supply depot, etc.)
- [ ] Create sprites for new buildings
- [ ] Add to terrain.json with production lists

### Low Priority / Future
- [ ] Stealth hide/unhide special actions
- [ ] Submarine submerge/surface special actions
- [ ] Fog of war
- [ ] Weather effects
- [ ] NO CO system (intentionally out of scope)

---

## Session Notes for Future Agents

### Key Architecture Points
1. **Immutable state** — All game state mutations return new objects, never mutate in place
2. **Data-driven** — Units/terrain are defined in JSON, game logic reads from data-loader
3. **Server/client split** — Use `server-data-loader.ts` in API routes, `data-loader.ts` on client
4. **Pixi.js client-only** — Never import Pixi at top level of server-compatible files

### Common Gotchas
- Movement cost `-1` means **impassable** — check `> 0`, not truthy
- Always call `loadGameData()` before accessing unit/terrain data
- Pixi v8 API uses `{ color, alpha }` objects, not positional args
- `has_acted: true, has_moved: true` must be set after unit actions

### How to Continue Work
1. Read this changelog to understand recent changes
2. Check `CLAUDE.md` for project architecture and conventions
3. Run `npx tsc --noEmit` after changes to catch type errors
4. Test in browser: start local match → verify units move/attack correctly
