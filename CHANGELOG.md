# Modern AW — Changelog

This file tracks significant changes made by AI agents (Claude Code, Cursor, etc.) to help future sessions understand the project history and continue work seamlessly.

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
- [ ] Verify all 15 terrain types render correctly
- [ ] Verify all 19 units render correctly  
- [ ] Test unit movement, combat, and turn flow
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
