# Modern AW — Changelog

This file tracks significant changes made by AI agents (Claude Code, Cursor, etc.) to help future sessions understand the project history and continue work seamlessly.

---

## 2026-03-25 (Session 16) — Movement UX Overhaul, Unload Highlights, Bug Fixes

**Session:** Claude Code (claude-opus-4-6)
**Status:** COMPLETE

### Movement UX — Preview Animation (AW-accurate)

Completely reworked the movement flow to match official Advance Wars behavior:

1. **Preview move animation** — When selecting a destination tile, the unit now plays its walk/drive animation along the path to the destination before the ActionMenu appears (not a teleport)
2. **Arrow disappears on movement** — The path arrow and reachable tile overlay vanish as soon as the unit starts moving, matching AW behavior
3. **Cancel snaps back** — If cancelled from the ActionMenu, the unit teleports back to its original position (no reverse animation)
4. **Right-click range preview works during selection** — Can now right-click any unit to see its movement/attack range even while a friendly unit is selected
5. **No arrow during action menu** — Arrow is only visible during the hover phase, not while the action menu is open

**Technical approach:** Added `previewAnimating` boolean to the store, separate from `isAnimating` (action animation). Preview reuses the existing `MovementAnimator`. When action is later confirmed, `startMoveAnimation` sets empty `animationPath` since the unit is already at the destination.

### Unload UX Overhaul

- **Unload tiles shown as highlights** — Teal-green highlighted tiles on the map replace the old coordinate list menu
- **Click-to-unload** — Click a highlighted tile to unload cargo there (instead of selecting from a list)
- **ActionMenu repositioning** — Menu avoids covering unload highlight tiles by shifting position based on which direction unload tiles exist
- **State moved to store** — `unloadTiles` and `unloadingCargoIndex` moved from ActionMenu local state to Zustand store so GameCanvas can render highlights and handle clicks

### Bug Fixes

1. **Merge validation too permissive** — Was only blocking when BOTH units were at full HP. Now blocks when target unit is already at 10 HP (`destUnit.hp >= 10`)
2. **Thin white line artifact** — Sub-pixel gaps between tile rows at certain zoom levels. Fixed by adding `roundPixels: true` to Pixi Application init
3. **Lingering selection highlight during animation** — Selection highlight now clears immediately when action is confirmed and animation begins
4. **Unloaded units not marked as waited** — `applyCommand.ts` UNLOAD handler was missing `has_acted: true` on the cargo unit, so unloaded units didn't appear greyed out

### UI

- **Resign confirmation modal** — "Are you sure?" modal when clicking Resign, matching the existing exit confirmation style

### Files changed

| File                                 | Change                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/store/gameStore.ts`             | Added `unloadTiles`, `unloadingCargoIndex`, `previewAnimating`, `setUnloadMode`, `onPreviewAnimationComplete`; preview animation logic in `setPendingMove` and `startMoveAnimation` |
| `src/components/GameCanvas.tsx`      | Preview animation effect, unload tile click handling, arrow only during hover phase, right-click preview priority fix                                                               |
| `src/components/ActionMenu.tsx`      | Unload state from store, menu positioning to avoid unload tiles, hidden during preview animation, merge condition fix                                                               |
| `src/rendering/unitRenderer.ts`      | Added `previewPos` parameter to render unit at pending destination                                                                                                                  |
| `src/rendering/highlightRenderer.ts` | Added `drawUnloadable()` method (teal-green overlay)                                                                                                                                |
| `src/rendering/pixiApp.ts`           | Added `roundPixels: true` to fix sub-pixel gaps                                                                                                                                     |
| `src/game/validators.ts`             | Merge validation: `target.hp >= 10` check                                                                                                                                           |
| `src/game/applyCommand.ts`           | UNLOAD: added `has_acted: true` to cargo unit                                                                                                                                       |
| `src/App.tsx`                        | Resign confirmation modal                                                                                                                                                           |

### Verification

- `npx tsc --noEmit` — zero errors
- Movement preview animation plays correctly along path
- Unload tiles render as highlights, click-to-unload works
- Cancel returns unit to original position
- Right-click preview works during friendly unit selection

---

## 2026-03-24 (Session 15c) — Damage Formula Rewrite to Match Official AW Rules

**Session:** Claude Code (claude-opus-4-6)
**Status:** COMPLETE

### Problem

Terrain defense was being applied to air units (should be 0 stars always). The damage formula also had 3 other deviations from the official AW formula.

### Changes to `calculateDamage()` in `src/game/combat.ts`

| Aspect              | Before (wrong)                | After (official AW)                                 |
| ------------------- | ----------------------------- | --------------------------------------------------- |
| Air terrain defense | Air units got terrain stars   | Air units always get 0 defense stars                |
| Sea terrain defense | Applied normally              | Applied normally (ports/reefs give defense)         |
| Defense scaling     | `(1 - Dts × 0.1)` — flat %    | `(100 - Dhp × Dts) / 100` — scales with defender HP |
| Luck                | Multiplicative `× (1 + luck)` | Additive `+ floor(normalized × Ahp)` (0 to Ahp-1)   |
| Rounding            | `Math.round()`                | `Math.floor()` (matches official AW)                |

**Official AW formula implemented:**

```
damage% = B × (Ahp/10) × (100 − Dhp × Dts) / 100 + luck
HP_damage = floor(damage% / 10)
```

### Also fixed

- `executeSelfDestruct()` — same air defense and HP-scaled defense fixes

### Files changed

- `src/game/combat.ts` — Rewrote `calculateDamage()` and `executeSelfDestruct()`

### Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run` — 197/197 tests pass

---

## 2026-03-24 (Session 15b) — Bug Fixes: Pathfinding Enemy Blocking + Destruction VFX

**Session:** Claude Code (claude-opus-4-6)
**Status:** COMPLETE

### Bugs fixed

1. **Arrow/path crossing enemy tiles** — `findPath()` and `getReachableTiles()` had a domain-based bypass that let air units path through enemy air tiles (and ground through enemy air). In AW, you cannot move through ANY enemy-occupied tile regardless of domain. Removed the bypass — all enemy units now block pathfinding unconditionally.

2. **Apache attacking from enemy-occupied tile** — Consequence of bug 1. The reachable tiles included enemy air tiles, so the player could move there and attack. Fixed by the pathfinding change above.

3. **Destruction VFX not visible** — Particles were only emitted at the initial hit (frame 5), but the unit doesn't visually disappear until frame 28. Added `onDestroy` callback to `CombatAnimator` that fires at the visual "death" moment (frame ~16, when flicker ends and dark fade begins). This emits a second big particle burst + shake right as the unit dies. Also increased destruction particle count (14→20) and max particle size (5→6).

### Files changed

| File                              | Change                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/game/pathfinding.ts`         | Removed domain-based enemy bypass in `findPath()` and `getReachableTiles()` — enemy units always block |
| `src/rendering/combatAnimator.ts` | Added `onDestroy` callback + `DESTROY_VFX_FRAME` timing constant                                       |
| `src/rendering/particleSystem.ts` | Increased `PARTICLES_PER_DESTROY` (14→20) and `PARTICLE_SIZE_MAX` (5→6)                                |
| `src/components/GameCanvas.tsx`   | Wired `onDestroy` callback in both player and AI combat animation paths                                |

### Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run` — 197/197 tests pass

---

## 2026-03-24 (Session 15) — Visual Polish: Camera Transitions, Screen Shake, Particles, AI Indicator

**Session:** Claude Code (claude-opus-4-6)
**Status:** COMPLETE

### What shipped

1. **Smooth camera transitions** — New `animatePanTo(tileX, tileY)` eased pan in `pixiApp.ts`. Camera gently pans to the combat midpoint when attacks resolve. Respects existing `clampPan()` and user zoom. Cancel anytime via `cancelCameraPan()`. Lerps at 0.08/frame, snaps when <0.5px from target.

2. **Screen shake** — Triggered on combat hit (0.5x intensity) and unit destruction (1.0x). Implemented as temporary random-angle offset on the stage, not by mutating tile positions. Decays exponentially (0.85/frame) over ~18 frames (~300ms). Scales down when zoomed out to avoid looking bad on small maps. Tuning constants exported: `SHAKE_INTENSITY=6`, `SHAKE_DURATION=18`, `SHAKE_DECAY=0.85`.

3. **Particle VFX** — New `src/rendering/particleSystem.ts`. Short-lived colored quad bursts at impact tiles using Pixi Graphics. Hit = 8 orange/fire particles, Destroy = 14 fire+smoke particles. Physics: slight upward bias, gravity pull, fade in last 40% of life. Hard cap of 60 concurrent particles prevents perf issues during long AI turns. Particles sit above combat effects, below path overlay.

4. **AI thinking indicator** — Enhanced the existing bottom-of-screen pill: now has a spinning border animation, slightly larger, "AI is thinking..." text. Added a compact header-bar indicator with spinning icon + "AI TURN" label in a frosted pill, visible even when bottom UI is obscured. Both clear reliably when `processingQueue` ends or turn changes.

### Files changed

| File                              | Change                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rendering/pixiApp.ts`        | Added `animatePanTo()`, `updateCameraPan()`, `cancelCameraPan()`, `isCameraPanning()`, `startShake()`, `updateShake()`, `isShaking()` + tuning constants |
| `src/rendering/particleSystem.ts` | **New file** — `ParticleSystem` class with `emitHit()`, `emitDestroy()`, `update()`, `clear()`                                                           |
| `src/rendering/combatAnimator.ts` | Added `onHit` and `onCounterHit` callbacks to `CombatAnimParams`, fired at impact frames                                                                 |
| `src/components/GameCanvas.tsx`   | Wired particle system + shake + camera pan into ticker loop and all combat animation paths (player + AI queue)                                           |
| `src/App.tsx`                     | Enhanced AI indicator with spinner animation + added header-bar "AI TURN" pill                                                                           |

### How to tune

- **Shake**: Adjust `SHAKE_INTENSITY` (px), `SHAKE_DECAY` (0-1), and the intensity multiplier in `startShake()` calls (0.5 for hit, 1.0 for destroy)
- **Particles**: Edit constants at top of `particleSystem.ts` — `MAX_PARTICLES`, `PARTICLES_PER_HIT`, `PARTICLE_LIFETIME`, colors arrays
- **Camera pan speed**: `CAMERA_PAN_LERP` in `pixiApp.ts` (lower = slower/smoother)

### Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run` — 197/197 tests pass
- No new test files (rendering code is visual-only, not unit-testable without canvas)

---

## 2026-03-24 (Session 14) — 6 Core Game Mechanics + 47 Tests

**Session:** Claude Code (claude-opus-4-6)
**Status:** ✅ COMPLETE

### Summary

Implemented 6 missing core Advance Wars game mechanics: Unit Merging, Ammo Depletion (counter-attack fix), Domain-Aware Repair/Healing, Auto-Resupply on Properties, Stealth Hide/Unhide, and Submarine targeting restrictions. Added UI buttons for all new actions. Wrote 47 new tests covering all mechanics with zero regressions (197/197 total tests passing).

---

### 1. Unit Merging (MERGE command)

Same-type friendly units on the same tile can merge (AW "Join" mechanic).

- **HP**: Combined, capped at 10
- **Excess HP refund**: Refunded as funds at 1/10 unit cost per HP (e.g. two 6+9 HP tanks → 10 HP tank + 3,500¥ refund)
- **Ammo/Fuel**: Takes max of both units
- **Full HP merge**: A full HP unit can merge into a damaged unit (only blocked when both are 10 HP)
- **UI**: ActionMenu shows Merge button with preview of resulting HP

### 2. Ammo Depletion (counter-attack fix)

- **Counter-attack ammo**: Defender's counter-attack weapon now consumes ammo (was previously free)
- **`canCounterattack`**: Now checks ammo for limited-ammo counter weapons — depleted weapons are skipped
- **`getCounterWeaponIndex`**: Same ammo check added — falls back to next valid weapon (e.g. MG when cannon is empty)

### 3. Domain-Aware Repair/Healing (costs funds)

Healing on friendly properties at turn start, matching AW rules:

- **Ground units**: Heal on City, Factory, HQ, FOB
- **Air units**: Heal on Airport only
- **Naval units**: Heal on Port only
- **Cost**: 1/10 of unit cost per HP healed (2 HP max per turn)
- **Partial heal**: If funds only cover 1 HP, heals 1 HP
- **No funds**: No healing occurs

### 4. Auto-Resupply on Properties

- Units standing on friendly buildings (City, Factory, Airport, Port, HQ) get full ammo + fuel restored at turn start
- Resupply happens before fuel consumption, so a fighter on an airport won't crash

### 5. Stealth Hide/Unhide (HIDE / UNHIDE commands)

- **`is_hidden` field**: New optional field on `UnitState`
- **HIDE**: Sets `is_hidden = true`, marks unit as acted
- **UNHIDE**: Sets `is_hidden = false`, marks unit as acted
- **Fog of war**: Hidden enemy stealth units are invisible unless an allied unit is adjacent (same logic as submerged subs)
- **Targeting restriction**: Hidden units cannot be attacked from range > 1 (only adjacent attacks allowed)
- **Fuel drain**: Hidden stealth units consume extra fuel per turn
- **UI**: ActionMenu shows Hide/Unhide buttons for units with `"hide"` special action

### 6. Submarine Submerge/Surface (UI + targeting)

Backend commands already existed; this session added:

- **UI buttons**: ActionMenu now shows Submerge/Surface buttons for submarine units
- **Targeting restriction**: Submerged subs cannot be attacked from range > 1 (added to `canAttackFromPosition`)
- **Store integration**: SUBMERGE/SURFACE added to `clearTypes` for proper selection reset

---

### Economy Helpers

- **`calculateHealCost(unitType, hpHealed)`**: Returns funds cost for healing (1/10 unit cost per HP)
- **`calculateMergeRefund(unitType, excessHp)`**: Returns funds refunded for excess merge HP

---

### Test Coverage

Added `src/tests/newMechanics.test.ts` with **47 tests**:

| Category                             | Tests |
| ------------------------------------ | ----- |
| Merge validation                     | 7     |
| Merge apply (HP, ammo, fuel, refund) | 7     |
| Counter-attack ammo depletion        | 4     |
| Domain-aware healing                 | 6     |
| Economy helpers                      | 2     |
| Auto-resupply                        | 4     |
| Hide/Unhide validation               | 5     |
| Hide/Unhide apply                    | 2     |
| Hidden stealth visibility (fog)      | 2     |
| Hidden stealth combat restriction    | 2     |
| Submerged sub targeting restriction  | 3     |
| Command parsing (MERGE/HIDE/UNHIDE)  | 3     |

Updated 2 existing tests in `applyCommand.test.ts` (healing now costs funds).
Added mock data: `stealth`, `cruiser` units; `airport`, `port`, `forest` terrain.

---

### Files Changed

| File                             | Change                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/game/types.ts`              | Added `is_hidden` to `UnitState`; `MERGE`, `HIDE`, `UNHIDE` to `CommandType`; 3 new command interfaces                               |
| `src/game/commands.ts`           | Added 3 new cases to `commandFromDict`                                                                                               |
| `src/game/economy.ts`            | Added `calculateHealCost()`, `calculateMergeRefund()`                                                                                |
| `src/game/combat.ts`             | Exported `getCounterWeaponIndex`; ammo check in `canCounterattack` + `getCounterWeaponIndex`; submerged/hidden targeting restriction |
| `src/game/validators.ts`         | Added `validateMerge`, `validateHide`, `validateUnhide`                                                                              |
| `src/game/applyCommand.ts`       | Added MERGE/HIDE/UNHIDE handlers; counter-attack ammo fix; END_TURN overhaul (domain-aware healing + auto-resupply)                  |
| `src/game/visibility.ts`         | Hidden stealth post-processing in fog                                                                                                |
| `src/components/ActionMenu.tsx`  | Merge, Hide, Unhide, Submerge, Surface buttons                                                                                       |
| `src/store/gameStore.ts`         | MERGE skip-MOVE logic; new command types in `clearTypes`                                                                             |
| `src/tests/newMechanics.test.ts` | **New** — 47 tests for all 6 mechanics                                                                                               |
| `src/tests/mockData.ts`          | Added `stealth`, `cruiser` units; `airport`, `port`, `forest` terrain                                                                |
| `src/tests/applyCommand.test.ts` | Updated 2 healing tests (healing now costs funds)                                                                                    |

---

### Verification

- [x] `npx tsc --noEmit` — zero type errors
- [x] `npx vitest run` — 197/197 tests passing (47 new + 150 existing)
- [x] Unit merge works in-game (tested 6+9 HP tanks → 10 HP + refund)
- [x] Full HP unit can merge into damaged unit

---

## 2026-03-15 (Session 13) — UX Overhaul: Cream Theme, Main Menu, Match Setup Wizard, Game View Chrome

**Session:** Claude Code (claude-sonnet-4-6)
**Status:** ✅ COMPLETE

### Summary

Full UX redesign pass inspired by Lovable mockups. Migrated the entire app from a dark `#0a0f18` palette to a warm cream `#f0ece0` parchment theme. Redesigned the Main Menu, rebuilt the Match Setup wizard, and overhauled the in-game HUD chrome (top bar, sidebar, bottom bar). All changes are limited to menus and chrome — the Pixi canvas, terrain, sprites, and game logic are untouched.

---

### Main Menu (`src/components/MainMenu.tsx`)

- **Background**: Switched to `#f0ece0` parchment
- **Corner targeting brackets**: Amber `border-amber-500/60` accent, matching the gold title color
- **Two-tone title**: "MODERN" in `text-[#1a1f2e]` dark navy, "AW" in `text-amber-500` amber; red underline divider; "Reimagined" subtitle
- **Unified nav card**: All three menu items wrapped in a single `border border-gray-200 rounded-xl overflow-hidden shadow-sm` container — eliminates the broken border inconsistency
- **New Game button**: Dark `bg-[#1a1f2e]` fill with amber text to make it the primary CTA
- **Continue/Settings**: White fill with gray text, consistent hover states
- **Inline saves panel**: Expands below Continue with Load + Delete per save; delete uses `✕` with red hover
- **Faction squares**: Four `w-3.5 h-3.5` colored squares (red/blue/green/yellow) below the nav
- **Version string**: Moved to absolute bottom-center, `text-sm font-mono`
- **Global**: Added `button { cursor: pointer; }` to `globals.css`

---

### Match Setup Wizard (`src/components/MatchSetup.tsx`)

**Structure & Navigation**

- All step backgrounds unified to `#f0ece0` parchment
- **Header redesigned**: Breadcrumb pattern — `Main Menu › New Game` — where "Main Menu" is a button calling `onExit`, "New Game" is the static current context; always visible, no conditional back/forward logic
- **Top-right step breadcrumb**: Step labels in amber for current step, gray for others; `text-sm font-bold uppercase tracking-widest`
- **Bottom status bar**: Step name on the left, `X / 4` step counter on the right; `text-sm font-mono text-gray-400 uppercase tracking-widest`
- Removed progress fill line (was redundant with breadcrumb + bottom bar)
- Removed "Start Test Scenario" button and all associated logic

**Step 1 — Players**

- Player count selector + per-player controller type cards
- Player label colors: red/blue/green/yellow consistent throughout

**Step 2 — Map**

- Tab navigation always visible: **Default Skirmish** / **Custom AWBW** / **Saved Maps (N)**
- Saved Maps tab: empty state message when none saved; map preview with `MapMinimap` renders on selection; delete clears preview
- Map option cards: white background (`bg-white border-gray-200`) in both selected and unselected states — no dark card on light background mismatch

**Step 3 — Options**

- All labels, buttons, and descriptions bumped to `text-lg`
- Card titles `text-xl`
- Consistent amber pill for selected option, white outline for unselected

**Step 4 — Review**

- Summary card: `text-lg shadow-sm`
- All value spans given `font-semibold` — labels stay `text-gray-500` (light), values dominate visually
- Funds value in `text-amber-400 font-mono font-semibold`
- **DEPLOY FORCES** CTA: `bg-red-500 py-4 text-lg uppercase tracking-widest`, full-width

---

### Game View HUD (`src/App.tsx`, `src/components/InfoPanel.tsx`)

**Top bar**

- Kept faction-colored background (red/blue/green/yellow per current player)
- Removed the previously-added stats strip (redundant with sidebar)
- Player number + name + day display unchanged

**Sidebar (`InfoPanel.tsx`)**

- **Player card**: Added Income / Units / Cities stat strip below the `¥funds` headline
  - `+Income` in green, `Units` in dark, `Cities` in amber; separated by vertical dividers
- **End Turn button**: Full-width, faction-colored, with `E` shortcut badge — already present, kept
- **PLAYERS scoreboard**: All players' funds with turn indicator arrow — already present, kept
- **INTEL section**: Built / Alive / Props per player with faction-colored left border — already present, kept

**Bottom status bar (new)**

- White strip spanning full width below canvas + sidebar
- Left: `POS xx · yy` (hovered tile coordinates) + terrain name + defense star dots (amber filled / gray empty)
- Right: keyboard hints — `E End Turn` (human turns only) + `ESC Deselect` — using pill-style key badges
- Shows "Hover a tile" placeholder when no tile is hovered

**Canvas background**

- Pixi `backgroundColor` changed from `0x1a1a2e` (dark navy) to `0xf0ece0` (parchment) in `src/rendering/pixiApp.ts` — area outside the map tiles now matches the theme
- Outer game wrapper changed from `bg-gray-900` to `style={{ background: "#f0ece0" }}`
- Concave corner piece updated to use parchment fill

---

### Indirect Fire — Completed

The indirect fire mechanic is fully implemented (session unknown, recording here for completeness):

- Units with `min_range > 1` (artillery, rocket, missile, etc.) cannot attack after moving — enforced in `src/game/validators.ts`
- Attack range overlay shows correctly for indirect units from their current position without requiring a move — handled in `src/store/gameStore.ts`
- No counterattack triggered when an indirect unit is the attacker — enforced in `src/game/combat.ts`
- ActionMenu hides the Attack option for indirect units that have already moved — `src/components/ActionMenu.tsx`
- TileInfoPanel and BuyMenu display `min_range–max_range` for weapons with indirect range

---

### Files Changed

| File                            | Change                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/components/MainMenu.tsx`   | Full redesign — cream bg, two-tone title, unified nav card, faction squares                                 |
| `src/components/MatchSetup.tsx` | Full redesign — breadcrumb header, tab map selector, larger text, bold review values, removed test scenario |
| `src/App.tsx`                   | Game view wrapper to parchment, concave corner fix, bottom terrain bar added                                |
| `src/components/InfoPanel.tsx`  | Added Income/Units/Cities stat strip to player card                                                         |
| `src/rendering/pixiApp.ts`      | `backgroundColor` changed from `0x1a1a2e` to `0xf0ece0`                                                     |
| `src/styles/globals.css`        | Added `button { cursor: pointer; }` globally                                                                |

---

## 2026-03-11 (Session 12) — UI Polish: Timer Fixes, Pause, Resign, Victory Screen

**Session:** Claude Code (claude-sonnet-4-6)
**Status:** ✅ COMPLETE

### Summary

Fixed chess-style timer carryover, added timer pause support, added a resign action, and added a persistent victory/defeat screen with rematch and main menu options.

### Bug Fixes

1. **Chess-style timer carryover not accumulating** — Carryover was being consumed on the AI's turn transition instead of the human's. Fixed by introducing a per-player carryover bank (`pendingCarryoverRef: Record<number, number>`) so each player's unused time is saved and only applied when that player's next human turn starts.

2. **Timer showing 0:00 immediately / freezing game** — Three separate bugs: `timeRemaining` was initialized to `0`, auto-end-turn fired on AI turns, and the guard ref wasn't one-shot. All fixed.

3. **Timer not starting on turn 1** — The turn-change effect skipped the first turn because `prevPlayerIndexRef` started at `-1`. Fixed with a separate `useEffect` on `[view]` that initializes the clock when entering game view.

4. **Exit confirmation message inaccurate** — Changed from "All match progress will be lost" to "Any moves made this turn will be lost. The game was autosaved at the start of this turn."

### Features Added

1. **Timer pause / resume** — Players can manually pause the turn timer via a ⏸/▶ button next to the clock. Auto-pauses when the Menu dropdown is opened and resumes when it closes. Pause duration is excluded from elapsed time by shifting `turnStartTime` forward.

2. **Resign** — "Resign" option added to the in-game Menu dropdown (only shown during the human player's action phase). Marks the current player as defeated, finds the surviving winner, and transitions to game over.

3. **Persistent victory screen** — When `phase === "game_over"`, a full-screen overlay renders with the winner's faction color, "Player N Wins!" heading, and two buttons:
   - **Rematch** — restores the initial game state snapshot taken at match start
   - **Main Menu** — clears game state and returns to the main menu

4. **Timer state reset on exit/load/rematch** — Added `resetTimerState()` helper that clears all timer-related state (`timerPaused`, `pausedAtRef`, `pendingCarryoverRef`, `timeRemainingRef`, `turnStartTime`, `timeRemaining`). Called in `handleExitGame`, `handleLoadGame`, and `handleRematch` to prevent stale timer state from bleeding into subsequent games.

### Files Changed

| File          | Change                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `src/App.tsx` | Timer carryover fix, pause/resume, resign, victory screen, `resetTimerState` helper |

---

## 2026-03-11 (Session 11) — UI Overhaul: Main Menu, HUD, Timer, Fog Fixes, Game Mechanics

**Session:** Claude Code (claude-sonnet-4-6)
**Status:** ✅ COMPLETE

### Summary

Large UI and game mechanic session covering: blank canvas fix, main menu, HUD cleanup, turn timer, fog of war building fix, unit healing, resign flow groundwork, and turn transition overlay.

### Bug Fixes

1. **Blank canvas with fog of war on new game** — React StrictMode called `initPixiApp` twice concurrently, creating two WebGL contexts on the same canvas, causing shader compilation failure. Fixed with a sequential `_currentInit` promise chain in `pixiApp.ts` so the second call waits for the first to settle before starting.

2. **Enemy HQ not visible in fog** — The neutral spritesheet has no HQ frame, so `drawBuildingSprite` fell through to `drawBuildingFallback`, which had a pre-existing bug (missing `this.container.addChild(g)`). Fixed both: the building ownership masking (`effectiveOwner = fogged ? -1 : tile.owner_id`) and the missing `addChild`.

3. **Enemy captured buildings visible in fog** — Fogged buildings now always render as neutral (`effectiveOwner = -1`) so the enemy's captured properties aren't revealed through fog.

4. **Unit healing not working** — `END_TURN` handler now heals units on allied buildings (+2 HP, capped at 10) at the start of the new player's turn. Healing buildings: city, factory, airport, port, hq.

5. **Duplicate End Turn button** — Removed the End Turn button from the top bar; it exists only in the InfoPanel sidebar.

6. **Timer showing 0:00 immediately and freezing** — Stale closure bug where the auto-end-turn interval read the wrong value. Fixed with `timeRemainingRef` mirror ref and `timerAutoEndedRef` one-shot guard.

### Features Added

1. **Main Menu** (`MainMenu.tsx`) — Full-screen main menu with "MODERN AW" title, numbered navigation items (New Game, Continue, Settings). "Continue" expands inline to list saved games with Load/Delete buttons. Saves moved out of MatchSetup into App-level state.

2. **Turn Transition Overlay** (`TurnTransitionOverlay.tsx`) — Full-screen overlay with faction-colored corner brackets, player name, day number, and "Your Turn" / "Enemy Turn" label. Shown for 1.6s on each turn change.

3. **Chess-style turn timer with increment** — Turn timer configured in MatchSetup (Off / 30s / 1m / 2m / 5m). Unused time carries forward to the player's next turn (chess increment). Auto-ends turn when clock hits zero.

4. **Improved ActionLog** — Filter buttons (MOVE, ATTACK, CAPTURE, BUILD, SYSTEM), day tracking via END_TURN counting, category badges, team-colored player names.

5. **Faction border ring** — Outer game div has a team-colored `ring-2 ring-inset` that updates as the current player changes.

6. **Sidebar moved to right** — Sidebar changed from left (`border-r`) to right (`border-l`) side. Font sizes increased throughout InfoPanel.

7. **Log cleanup** — Removed all debug `console.log` calls from `pixiApp.ts` and `terrainRenderer.ts`; kept `console.error` for genuine failures.

### Files Changed

| File                                       | Change                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `src/rendering/pixiApp.ts`                 | Sequential `_currentInit` promise chain; removed debug logs              |
| `src/rendering/terrainRenderer.ts`         | Fog building ownership masking; fixed missing `addChild` in fallback     |
| `src/game/applyCommand.ts`                 | Unit healing on allied buildings in `END_TURN`                           |
| `src/game/types.ts`                        | Added `turn_time_limit: number` to `GameState`                           |
| `src/game/gameState.ts`                    | Default `turn_time_limit: 0` in `createGameState` and `stateFromDict`    |
| `src/types.ts`                             | New file — shared `SavedGameMeta` interface                              |
| `src/components/MainMenu.tsx`              | New file — main menu screen                                              |
| `src/components/TurnTransitionOverlay.tsx` | New file — turn transition overlay                                       |
| `src/components/ActionLog.tsx`             | Rewritten with filters, day tracking, badges                             |
| `src/components/InfoPanel.tsx`             | Lighter palette, larger fonts                                            |
| `src/components/MatchSetup.tsx`            | Removed saves section; added `turnTimeLimit` option                      |
| `src/components/GameCanvas.tsx`            | Added `.catch(() => {})` on StrictMode first-init rejection              |
| `src/App.tsx`                              | Main menu routing, saves state, timer logic, faction ring, sidebar right |

---

## 2026-03-09 (Session 10) — Electron Phase 2: Save/Load + Settings + Encrypted API Keys

**Session:** Cursor (Claude Sonnet 4.6)
**Status:** ✅ COMPLETE

### Summary

Implemented Electron Phase 2: local game save/load to JSON files, encrypted API key storage via `safeStorage`, and a Settings modal for managing AI provider keys and model selection.

### Features Added

1. **Game Save / Load** — `GameState` serialized to `{userData}/saves/{name}.json`
   - Auto-save on every END_TURN (saves to `autosave.json`)
   - Quick-save button in game sidebar (saves to `quicksave.json`)
   - "Continue a Saved Game" section on main menu listing all save slots
   - Delete saves from the list

2. **Encrypted API Key Storage** — New `apikey:save` / `apikey:load` IPC handlers use Electron's `safeStorage` to encrypt/decrypt API keys at rest in `config.json`. Keys never travel unencrypted outside of the main process.

3. **Settings Modal** — New `SettingsModal.tsx` component:
   - Anthropic: API key input (show/hide toggle) + model selector
   - OpenAI: API key input + model selector
   - Local HTTP (Ollama/LM Studio): server URL input
   - "Stored encrypted on device" label when running in Electron
   - Accessible from both the main menu header and the in-game sidebar

4. **Config Store Update** — `configStore.ts` now:
   - Excludes API keys from `localStorage` persist (keys live in Electron secure storage only)
   - `syncFromElectron()` loads decrypted keys from Electron on app startup
   - `setAnthropicApiKey`/`setOpenaiApiKey` auto-save encrypted to Electron when running in Electron

### Changes

#### `electron/main.ts`

- Added `SAVES_DIR` pointing to `{userData}/saves/`
- New IPC: `save:game`, `load:game`, `list:saves`, `delete:save`
- New IPC: `apikey:save` (encrypts via `safeStorage`), `apikey:load` (decrypts)

#### `electron/preload.ts`

- Exposed: `isElectron`, `saveGame`, `loadGame`, `listSaves`, `deleteSave`, `saveApiKey`, `loadApiKey`
- `window.electronAPI` is now **optional** (`?`) — enables safe feature detection in renderer
- Removed old `encryptString`/`decryptString` raw methods (replaced by `saveApiKey`/`loadApiKey`)

#### `src/store/configStore.ts`

- API keys excluded from `localStorage` persist via `partialize`
- Added `syncFromElectron()` — async, loads decrypted keys on startup
- `setAnthropicApiKey`/`setOpenaiApiKey` fire-and-forget save to Electron when available

#### `src/components/SettingsModal.tsx` (NEW)

- Anthropic + OpenAI key inputs with show/hide toggle
- Model selectors for both providers
- Local HTTP URL input
- Saves on button click, auto-closes after confirmation

#### `src/components/MatchSetup.tsx`

- Settings button (⚙) in header (calls `onOpenSettings` prop)
- "Continue a Saved Game" section at top — shows Electron save slots with turn/player/date info
- Load and delete buttons per save slot

#### `src/App.tsx`

- Calls `syncFromElectron()` on startup
- Auto-save effect: fires when `gameState.turn_number` changes while in game view
- `handleQuickSave()` — saves to `quicksave` with feedback toast
- "Save Game" button in game sidebar (Electron only)
- "Settings" button in game sidebar
- Settings modal rendered in both setup and game views

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
- `e2e/quickCheck.ts` — Fast verification script

**Output:**

- `e2e/results/quickCheck.png` — Screenshot of app
- `e2e/results/quickCheck-result.json` — Test results
- `e2e/results/quickCheck-text.txt` — Page text content

This allows AI agents to verify changes by running tests and viewing screenshots!

**Planning:** Stack and layers are documented in `docs/ARCHITECTURE.md`.

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

#### `src/game/awbwImport.ts`

- Added comprehensive documentation comment block explaining AWBW quirks
- All AWBW armies now remap sequentially to players 0-3
- Extended building IDs (149+) now properly detect owner and building type
- Added validation: throws error if map has more than 4 factions
- Building order for 149+ range: `["airport", "city", "factory", "port", "hq"]`

#### `src/rendering/pixiApp.ts`

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

#### New File: `src/rendering/movementAnimator.ts`

- `MovementAnimator` class with Pixi.js Container
- `animate(unitType, ownerId, path, onComplete)` — starts animation
- `update()` — called every frame by ticker
- `isAnimating()` — check if animation in progress
- Uses `AnimatedSprite` with directional movement frames
- **Fixed:** Animation synced to movement (no skating effect)

#### `src/store/gameStore.ts`

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

#### `src/rendering/unitRenderer.ts`

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

#### `gameStore.ts`

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

#### `highlightRenderer.ts`

- Added `drawPath(path: Vec2[])` — draws yellow arrow with corners
- Added `drawPendingDest(pos)` — green highlight on pending destination

#### `unitRenderer.ts`

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

#### `highlightRenderer.ts`

- Completely rewrote `drawPath()` to use `Graphics.lineTo()` for smooth connected lines
- Path starts from SECOND tile in path (edge of unit's tile), not covering the unit
- Added proper border/outline by drawing thicker line underneath
- Simplified arrowhead drawing
- Uses rounded caps and joins for cleaner appearance

#### `unitRenderer.ts`

- Added `currentPlayerId` tracking
- Units only fade if: `unit.owner_id === currentPlayerId && unit.has_acted`
- Enemy units always render at full opacity

#### `gameStore.ts`

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

#### `unitRenderer.ts`

- Added `ACTED_TINT = 0x666666` constant for darkening acted units
- Uses `sprite.tint` instead of `sprite.alpha` for acted units (darker shade, not transparent)
- Added `TEAM_COLORS_ACTED` for fallback rendering
- Units only darken if: owned by current player AND have acted

#### `highlightRenderer.ts`

- `drawReachable()` now uses brighter blue (0x88ccff, alpha 0.55)
- Replaced `drawPendingDest()` with AWBW-style dashed cursor
- `drawCursor()` draws dashed white border like AWBW
- Arrowhead no longer has a stroke (cleaner connection to path)
- Path automatically draws cursor at destination

#### `gameStore.ts`

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

#### `highlightRenderer.ts`

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

#### `highlightRenderer.ts`

- Path now ends at EDGE of destination tile (not center)
- Prevents arrow from overlapping the unit at destination
- Arrowhead positioned at tile edge

#### `unitRenderer.ts`

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

#### `spriteMapping.ts`

- Added `UNIT_ANIMATIONS` — maps unit type IDs to WarsWorld animation names
- Added `UNIT_MOVE_DIRECTIONS` — movement direction suffixes for future use
- Added `UNIT_ANIMATION_SPEED = 0.08` — slightly faster than buildings

#### `unitRenderer.ts`

- Updated to use `AnimatedSprite` instead of static `Sprite`
- Uses `getAnimation(sheetKey, animationName)` for frame arrays
- Falls back to colored rectangles if animation not found

### Unit Animation Mapping

| Our ID    | WarsWorld Animation |
| --------- | ------------------- |
| infantry  | infantry            |
| mech      | mech                |
| recon     | recon               |
| apc       | apc                 |
| tank      | tank                |
| md_tank   | mediumTank          |
| artillery | artillery           |
| rocket    | rocket              |
| anti_air  | antiAir             |
| missile   | missile             |
| t_copter  | transportCopter     |
| b_copter  | battleCopter        |
| fighter   | fighter             |
| bomber    | bomber              |
| stealth   | stealth             |
| lander    | lander              |
| cruiser   | cruiser             |
| submarine | sub                 |
| carrier   | carrier             |

### Future: Movement Animations

WarsWorld has directional movement animations ready:

- `{unit}-mdown` — moving down
- `{unit}-mside` — moving left/right (flip sprite for left)
- `{unit}-mup` — moving up

These can be activated when implementing unit movement visualization.

### Files Changed

| File                             | Change                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/rendering/spriteMapping.ts` | Added `UNIT_ANIMATIONS`, `UNIT_MOVE_DIRECTIONS`, `UNIT_ANIMATION_SPEED` |
| `src/rendering/unitRenderer.ts`  | Use `AnimatedSprite` for units                                          |

---

## 2026-02-28 (Session 4) — AWBW Tile ID Mapping Fix

**Session:** Cursor (Claude Opus 4.5)  
**Status:** ✅ COMPLETE

### Problem

Imported AWBW maps had **neutral buildings rendering as plains** and some terrain confusion.

### Root Cause

Our `awbwImport.ts` had incorrect tile ID mappings. The mapping was based on speculation rather than AWBW's actual tile ID system.

### Fix

Rewrote `awbwImport.ts` using WarsWorld's official AWBW tile ID mapping from:
`https://github.com/WarsWorld/WarsWorld/blob/main/src/server/tools/map-importer-utilities.ts`

### Key Corrections

| AWBW ID | Before (Wrong) | After (Correct)           |
| ------- | -------------- | ------------------------- |
| 29-32   | shoal ✓        | shoal ✓ (4 variants)      |
| 33      | reef ✓         | reef ✓                    |
| 34      | plains ❌      | neutral city ✓            |
| 35      | plains ❌      | neutral factory ✓         |
| 36      | plains ❌      | neutral airport ✓         |
| 37      | plains ❌      | neutral port ✓            |
| 38-57   | (various)      | OS/BM/GE/YC buildings     |
| 81-100  | (missing)      | RF/GS/BH/BD buildings     |
| 111-112 | (missing)      | silos → plains            |
| 133     | comm tower ✓   | neutral comm tower → city |
| 145     | lab ✓          | neutral lab → city        |

### Known Limitation

**Shoals render as single yellow tiles** instead of proper coastlines. This is a sprite sheet limitation — WarsWorld only has one `shoal.png` sprite with no directional variants for coastline auto-tiling. AWBW has many shoal variants (29, 30, 31, 32) for different coastline orientations, but we render them all the same.

### Files Changed

| File                     | Change                                 |
| ------------------------ | -------------------------------------- |
| `src/game/awbwImport.ts` | Rewritten with correct tile ID mapping |

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

**`src/rendering/pixiApp.ts`** — Rewrote sprite loading

- Added `loadSpritesheets()` — loads all WarsWorld JSON+PNG pairs
- Added `getSprite(sheetKey, frameName)` — retrieves textures from spritesheets
- Added `getSpritesheet(key)` — returns full spritesheet object
- Kept legacy `createSubTexture` for backwards compatibility (unused)

**`src/rendering/spriteMapping.ts`** — NEW FILE

- `PLAYER_TO_ARMY` — maps player IDs (0-3) to spritesheet keys
- `TERRAIN_SPRITES` — maps terrain types to frame names
- `ROAD_SPRITE_MAP` / `RIVER_SPRITE_MAP` — bitmask-based auto-tiling
- `BUILDING_SPRITES` — maps building types to frame names
- `UNIT_SPRITES` — maps unit types to frame names
- `FALLBACK_COLORS` — fallback when sprites unavailable

**`src/rendering/terrainRenderer.ts`** — Rewrote to use WarsWorld sprites

- Uses `getSprite("neutral", frameName)` for terrain
- Uses `getSprite(armySheet, frameName)` for colored buildings
- Roads/rivers use bitmask auto-tiling from spriteMapping
- Falls back to colored rectangles when sprites missing

**`src/rendering/unitRenderer.ts`** — Updated to use WarsWorld sprites

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

| File                               | Change                              |
| ---------------------------------- | ----------------------------------- |
| `src/rendering/pixiApp.ts`         | Rewrote — Spritesheet loading       |
| `src/rendering/spriteMapping.ts`   | New file — sprite name mappings     |
| `src/rendering/terrainRenderer.ts` | Rewrote — WarsWorld terrain sprites |
| `src/rendering/unitRenderer.ts`    | Updated — WarsWorld unit sprites    |
| `public/sprites/warsworld/*`       | New — WarsWorld sprite sheets       |
| `public/sprites/deprecated/*`      | Moved — old custom sprites          |

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

- **`pixiApp.ts`:** Added `getAnimation(sheetKey, animationName)` function to retrieve animation frame arrays from spritesheets
- **`spriteMapping.ts`:** Added `BUILDING_ANIMATIONS` map and `BUILDING_ANIMATION_SPEED` constant
- **`terrainRenderer.ts`:** Updated `drawBuildingSprite()` to use `AnimatedSprite` instead of static `Sprite`

#### Animation Details

| Building | Animation Name | Frames   |
| -------- | -------------- | -------- |
| Factory  | `base`         | 6 frames |
| City     | `city`         | 3 frames |
| Airport  | `airport`      | 3 frames |
| HQ       | `hq`           | 3 frames |
| Port     | `port`         | 3 frames |

Animation speed: 0.04 (same as WarsWorld)

### Files Changed

| File                               | Change                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `src/rendering/pixiApp.ts`         | Added `getAnimation()` function                         |
| `src/rendering/spriteMapping.ts`   | Added `BUILDING_ANIMATIONS`, `BUILDING_ANIMATION_SPEED` |
| `src/rendering/terrainRenderer.ts` | Use `AnimatedSprite` for buildings                      |

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

#### `pixiApp.ts`

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

| File                       | Change                      |
| -------------------------- | --------------------------- |
| `src/rendering/pixiApp.ts` | Removed legacy texture code |
| `CLAUDE.md`                | Updated sprite system docs  |
| Multiple files             | Deleted (see above)         |

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

| File                               | Change                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `src/rendering/terrainRenderer.ts` | Added base layer for mountains/forests, added `drawOverlaySprite()` |

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

#### terrainRenderer.ts

- Removed fallback colors for: pipe, pipe_seam, com_tower, lab, missile_silo, missile_silo_empty
- Removed from TERRAIN_TO_BUILDING map: com_tower, lab
- Removed getTerrainKey cases for removed terrain types

#### awbwImport.ts

- Updated to convert removed AWBW terrain to plains/city (pipes→plains, com_tower/lab→city)
- Updated AWBW_UNIT_MAP to skip excluded units during import

### Files Changed

| File                               | Change                                      |
| ---------------------------------- | ------------------------------------------- |
| `public/data/terrain.json`         | Simplified — 15 terrain types               |
| `public/data/units.json`           | Simplified — 19 units                       |
| `src/rendering/terrainRenderer.ts` | Cleanup — removed unused fallbacks          |
| `src/game/awbwImport.ts`           | Updated — maps removed items to equivalents |

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

- **Created** `src/game/awbwImport.ts` with:
  - `parseAwbwMapText()` — parses CSV tile ID data
  - `importAwbwMap()` — converts AWBW tile IDs to GameState
  - Full AWBW tile ID mapping (terrain 1-164, units 500+)
  - Support for 16 AWBW armies (Orange Star through White Nova)
  - Pre-deployed unit placement

#### Phase 4: terrainRenderer.ts — Fallback Colors ✅

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
- **Integrated** awbwImport functions

### Files Changed

| File                               | Change                                    |
| ---------------------------------- | ----------------------------------------- |
| `public/data/units.json`           | Rewrite — 26 AWBW units                   |
| `public/data/terrain.json`         | Major edit — 6 new terrains, 8 move types |
| `src/game/awbwImport.ts`           | New file — AWBW map importer              |
| `src/rendering/terrainRenderer.ts` | Edit — fallback colors, building map      |
| `src/components/MatchSetup.tsx`    | Edit — AWBW import UI                     |

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
2. **Data-driven** — Units/terrain are defined in JSON, game logic reads from dataLoader
3. **Server/client split** — Use `serverDataLoader.ts` in API routes, `dataLoader.ts` on client
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
