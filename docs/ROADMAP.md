# Modern AW — Project Roadmap

Last Updated: 2026-03-09

---

## 📍 Where We Are Now (from code + commit history)

- **Electron:** Vite + Electron in place; Next.js removed. Local save/load, encrypted API keys, settings (electron-store), IPC in `electron/main.ts`.
- **AI:** Local OpenAI + Anthropic + local HTTP provider; heuristic fallback; AI turn with abort; settings for API keys and model.
- **Combat:** `combat-animator.ts` — fire/hit/destruction tile overlays; wired in GameCanvas for player and queued ATTACK.
- **Fog of War:** Full implementation — `visibility.ts` (computeVisibility), `fog-renderer.ts`, `fog_of_war` in GameState; MatchSetup option; terrain/units respect visibility.
- **Save/Load:** Save Game / Continue a Saved Game in UI; IPC save/load/list/delete; serialization tests.
- **Camera:** Pan (Ctrl/Cmd + drag) and zoom in/out/reset in GameCanvas and App.
- **Tests:** Vitest (unit + game-state-serialization + visibility), E2E (Playwright), game-test and electron.test.
- **Transport:** Load/unload (APC, T-Copter, Lander, Carrier) with UI; LOAD/UNLOAD commands.
- **Fuel:** Air/naval fuel consumption, resupply, 0 fuel = no move; fuel in UI.

The sections below still list some of these as planned; checkmarks and "In Progress" have been updated to match the codebase.

---

## 🎯 Project Vision

A modern Advance Wars-inspired turn-based strategy game that:

- Uses AWBW/WarsWorld as a foundation for terrain, units, and sprites
- Eventually adds custom units and mechanics (see `docs/units.md`)
- Runs as a **desktop Electron app** to simplify architecture and enable local AI play
- Supports multiplayer via Partykit for online matches

### Known gaps (to address)

- **Shoals:** WarsWorld provides only one `shoal.png`; no directional coastline variants. Coastlines render as uniform yellow blocks instead of proper beach edges. Requires additional shoal sprites + bitmask auto-tiling (see Map Features).
- **Custom content:** 30 custom units and new buildings/tiles are designed in `docs/units.md` but not yet in data or sprites (see Custom Content).

---

## ✅ Completed Features

### Core Game Engine

- [x] Immutable game state architecture (Zustand store)
- [x] Turn-based gameplay with player switching
- [x] Command validation and application system
- [x] Unit movement with A\* pathfinding
- [x] Attack/combat system with damage calculations
- [x] Building capture mechanics
- [x] Unit production from factories/airports/ports
- [x] Victory conditions (HQ capture, unit elimination)
- [x] Fog of War (visibility computation, fog renderer, match option; see `src/game/visibility.ts`, `src/rendering/fog-renderer.ts`)

### Units (19 AWBW-canonical units)

- [x] Infantry, Mech
- [x] Recon, APC, Tank, Md Tank, Artillery, Rocket, Anti-Air, Missile
- [x] T-Copter, B-Copter, Fighter, Bomber, Stealth
- [x] Lander, Cruiser, Submarine, Carrier

### Terrain & Buildings

- [x] Plains, Roads, Mountains, Forests, Rivers
- [x] Bridges, Shoals, Sea, Reef
- [x] HQ, City, Factory, Airport, Port
- [x] Auto-tiling for roads and rivers (bitmask); sea and shoal use single sprite

### Rendering (Pixi.js)

- [x] WarsWorld spritesheet integration
- [x] Animated terrain (buildings)
- [x] Animated units (idle animations)
- [x] Proper sprite anchoring for tall sprites (mountains, buildings)
- [x] Plains drawn under transparent terrain

### UI/UX

- [x] Unit selection with reachable tile highlights
- [x] Path arrow following mouse hover
- [x] AWBW-style targeting cursor (corner brackets)
- [x] Action menu (Wait, Capture, Attack)
- [x] Pending move pattern (unit stays in place until action confirmed)
- [x] Attack range only shows when enemies present
- [x] Units darken (tint) when acted, not transparent
- [x] Movement animations (units walk/drive along path)
- [x] Combat animations (tile overlays: fire, hit, destruction; see `src/rendering/combat-animator.ts`)
- [x] Zoom and pan (GameCanvas; zoom in/out/reset in App)
- [x] Save/load game (Electron IPC; Save Game / Continue in UI)
- [x] Settings modal (API keys, AI provider, model)
- [x] Local AI (OpenAI, Anthropic, local HTTP; heuristic fallback)

### Map Import

- [x] AWBW map text import (CSV tile IDs)
- [x] Tile ID mapping to internal terrain types

### Multiplayer Foundation

- [x] Partykit room setup
- [x] Basic state synchronization

---

## 🚧 In Progress / Next Up

### Electron Desktop App — Done ✅

- [x] Set up Electron + React (Vite + vite-plugin-electron)
- [x] Local save/load game state to JSON files (IPC: save:game, load:game, list:saves, delete:save)
- [x] Settings stored in electron-store; config store sync
- [x] AI API key management (encrypted local storage via main process)

### AI Opponents — Done ✅

- [x] Local AI using OpenAI/Anthropic APIs (IPC; renderer triggers, main runs)
- [x] API key input in settings (stored locally in Electron)
- [x] Basic heuristic AI fallback (no API needed)
- [ ] Multiple difficulty levels / AI personalities (future)
- [ ] AI thinking indicator (optional polish)

### Combat Animations — Done ✅

- [x] Attack/hit/destruction (tile overlays: fire flash, hit flash, destruction flicker; see combat-animator.ts)
- [ ] Damage numbers or health bar feedback (optional)
- [ ] Screen shake / particle effects (optional polish)

### Camera / Large Maps

- [x] Map panning (Ctrl/Cmd + drag) and zoom in/out/reset
- [ ] **Camera follow** — Camera follow during unit movement when map is larger than viewport; smooth transitions to keep moving unit in view.

---

## 📋 Planned Features

### Electron Desktop App — Implemented ✅

- [x] Electron + Vite + React; local save/load; settings (electron-store); encrypted API keys
- [ ] Keep web version for online multiplayer (Partykit) when desired

### AI Opponents — Implemented ✅

- [x] Local AI (OpenAI, Anthropic, local HTTP); API keys in settings; heuristic fallback
- [ ] Multiple difficulty levels / AI personalities; AI thinking indicator (optional)

### Game Modes

- [ ] Skirmish vs AI (local)
- [ ] Hot-seat multiplayer (same device)
- [ ] **Online multiplayer (Partykit)** — Full online play; create/join rooms; state sync; web or desktop client.
- [ ] Map editor

### Map Features

- [x] Larger map support with camera panning and zoom in/out (implemented)
- [ ] Minimap
- [ ] **Map preview before game start** — Show map (name, dimensions, minimap or thumbnail) before deploying so players can confirm the battlefield.
- [ ] **Shoal coastline auto-tiling** — WarsWorld only ships one `shoal.png`; AWBW uses 4+ tile IDs (29–32) for different coastline orientations. Add directional shoal sprites (or source from AWBW) and bitmask auto-tiling (like roads/rivers) so coastlines render as proper beach edges instead of uniform yellow blocks.

### Advanced Gameplay

- [x] **Transport load/unload** (APC, T-Copter, Lander, Carrier) — Load/unload UI; LOAD/UNLOAD commands; cargo/is_loaded; validators.
- [x] **Fuel mechanics** — Air/naval fuel consumption; resupply; 0 fuel = no move; per-turn consumption; fuel in UI.
- [ ] **Indirect fire** — Artillery, Rocket (and other indirect units) can attack at range (min_range > 1 or max_range > 1); no counterattack from target; line-of-fire or range-only rules per AW.
- [ ] Ammo management
- [ ] Supply from APC/cities
- [ ] Weather effects (rain, snow, clear)
- [x] Fog of War (full implementation in place; visibility + fog renderer + match option)

### Custom Content (Future)

- [ ] **Custom units** (from `docs/units.md`) — 30 designs (Engineer, Drone Team, Light/Heavy Tank, Mobile Artillery, SAMs, MLRS, Blackhawk, Chinook, Apache, Lander variants, etc.). Each needs: entry in `public/data/units.json`, damage table vs all units, movement costs in terrain data, and either new sprites or reuse/placeholder.
- [ ] **New unit sprites** — Art for custom units (16×16 or 32×32); integrate with WarsWorld-style sheet or separate atlas.
- [ ] **New terrain tiles** — Any additional terrain types beyond current AWBW set; add to `terrain.json`, renderer, and AWBW import if needed.
- [ ] **New buildings** — e.g. radar station, supply depot, repair bay. Add to `terrain.json` (is_property, income, can_produce, etc.), sprite mapping, and building-specific logic (e.g. supply range).
- [ ] Mod support (load external units/maps)

---

## 🎨 UX Polish & Improvements

### Optional polish (visual & feedback)

- [ ] **Camera follow** during unit movement (see Camera / Large Maps)
- [ ] Smooth camera transitions
- [ ] Screen shake on explosions
- [ ] Damage numbers or health bar feedback during combat
- [ ] Particle effects (smoke, fire)
- [ ] AI thinking indicator (clear “AI is deciding…” state)
- [ ] Day/night cycle visual
- [ ] Weather visual effects

### Information Display

- [ ] Unit info panel (stats, HP, ammo, fuel)
- [ ] Terrain info panel (defense stars, movement cost)
- [ ] Damage preview before attacking
- [ ] Income display per turn
- [ ] Turn counter and player indicator

### Quality of Life

- [ ] Undo last move (before confirming action)
- [ ] End turn confirmation dialog
- [ ] Keyboard shortcuts (arrow keys, Enter, Escape)
- [ ] Gamepad support
- [x] Settings menu (API keys, AI provider, model)
- [x] Save/load game mid-match (Save Game / Continue a Saved Game)

### Accessibility

- [ ] Colorblind mode (different team indicators)
- [ ] High contrast mode
- [ ] Adjustable text size
- [ ] Screen reader support for menus

---

## 🏗️ Technical Debt & Refactoring

### Code Quality

- [ ] Add unit tests for game logic (validators, apply-command)
- [ ] Add integration tests for full turn cycles
- [ ] Extract magic numbers to constants
- [ ] Document public APIs with JSDoc

### Performance

- [ ] Object pooling for sprites
- [ ] Batch rendering optimizations
- [ ] Lazy load spritesheets
- [ ] Web Workers for AI computation

### Architecture

- [ ] Separate game logic from rendering completely
- [ ] Event system for game state changes
- [ ] Plugin architecture for mods

---

## 🔧 Electron Migration Plan

### Phase 1: Setup

1. Create new Electron project with Vite + React
2. Copy over existing src/ directory
3. Configure electron-builder for packaging
4. Test basic rendering works

### Phase 2: Local Features

1. Implement local save/load using fs
2. Add settings storage with electron-store
3. Create AI API key management UI
4. Test offline functionality

### Phase 3: AI Integration

1. Add OpenAI/Anthropic SDK to main process
2. Create IPC bridge for renderer to request AI moves
3. Implement AI turn with loading indicator
4. Add fallback heuristic AI

### Phase 4: Polish

1. App icon and branding
2. Auto-updater
3. Crash reporting
4. Performance profiling

### Keep Web Version For:

- Online multiplayer (Partykit)
- Quick browser access
- Mobile web (future)

---

## 📊 Priority Matrix

| Feature                 | Impact     | Effort     | Priority  | Order |
| ----------------------- | ---------- | ---------- | --------- | ----- |
| ~~Movement animations~~ | ~~High~~   | ~~Medium~~ | ✅ Done   | -     |
| ~~Electron migration~~  | ~~High~~   | ~~High~~   | ✅ Done   | -     |
| ~~AI opponents~~        | ~~High~~   | ~~Medium~~ | ✅ Done   | -     |
| ~~Save/Load~~           | ~~High~~   | ~~Low~~    | ✅ Done   | -     |
| ~~Combat animations~~   | ~~Medium~~ | ~~Low~~    | ✅ Done   | -     |
| ~~Fog of War~~          | ~~High~~   | ~~Medium~~ | ✅ Done   | -     |
| ~~Transport mechanics~~ | ~~Medium~~ | ~~Medium~~ | ✅ Done   | -     |
| ~~Fuel mechanics~~      | ~~Medium~~ | ~~Medium~~ | ✅ Done   | -     |
| Indirect fire           | High       | Medium     | 🟡 Medium | 7     |
| Camera follow           | Medium     | Low        | 🟡 Medium | 8     |
| Optional polish         | Low        | Low–Medium | 🟢 Low    | 9     |
| Online multiplayer      | High       | High       | 🟡 Medium | 10    |
| Map preview             | Medium     | Low        | 🟡 Medium | 11    |
| Map editor              | Medium     | High       | 🟢 Low    | 12    |
| Shoal coastline tiles   | Medium     | Medium     | 🟡 Medium | 13    |
| Custom units (units.md) | High       | High       | 🟢 Low    | 14    |
| New buildings/tiles     | Medium     | Medium     | 🟢 Low    | 15    |
| Audio/SFX               | Medium     | Low        | 🟢 Low    | 16    |

> **Note:** Electron migration comes before Audio because it enables local AI play with secure API key storage.
> **Known gap:** WarsWorld assets only include one shoal sprite; coastlines render as uniform yellow. See Map Features → Shoal coastline auto-tiling.

---

## 📜 Feature list (planned / backlog)

Single list of all planned features for easy reference. Order follows Priority Matrix where applicable.

| #   | Feature                    | Notes                                                                          |
| --- | -------------------------- | ------------------------------------------------------------------------------ |
| –   | ~~Transport mechanics~~    | ✅ Done — Load/unload APC, T-Copter, Lander, Carrier; UI.                      |
| –   | ~~Fuel mechanics~~         | ✅ Done — Air/naval fuel; resupply; 0 fuel = no move.                          |
| 7   | Indirect fire              | Artillery, Rocket range attacks; no counter from target.                       |
| 8   | Camera follow              | Camera follows moving unit when map larger than viewport.                      |
| 9   | Optional polish            | Damage numbers, screen shake, AI thinking indicator, smooth camera, particles. |
| 10  | Online multiplayer         | Partykit; create/join rooms; state sync.                                       |
| 11  | Map preview                | Show map (name, size, thumbnail) before game start.                            |
| 12  | Map editor                 | Create and edit maps in-app.                                                   |
| 13  | Shoal coastline tiles      | Directional shoal sprites + auto-tiling.                                       |
| 14  | Custom units (units.md)    | 30 designs; data + sprites.                                                    |
| 15  | New buildings/tiles        | Radar, supply depot, new terrain.                                              |
| 16  | Audio/SFX                  | In-game sounds and music. (Last.)                                              |
| –   | Hot-seat multiplayer       | Same device, pass-and-play.                                                    |
| –   | Minimap                    | In-game minimap.                                                               |
| –   | Ammo management            | Track and display ammo; resupply rules.                                        |
| –   | Supply from APC/cities     | Supply range and mechanics.                                                    |
| –   | Weather effects            | Rain, snow, clear; affect movement/vision.                                     |
| –   | UX refinement (menus)      | Per docs/UX_IMPROVEMENT_PLAN.md; map/sprites unchanged.                        |
| –   | Multiple AI difficulty     | AI personalities / difficulty levels.                                          |
| –   | Unit info panel            | Stats, HP, ammo, fuel at a glance.                                             |
| –   | Damage preview             | Before attacking.                                                              |
| –   | Undo last move             | Before confirming action.                                                      |
| –   | Colorblind / accessibility | Team indicators, high contrast, etc.                                           |

---

## 📝 Notes

### Why Not Full Backend?

- Storing user API keys on a server is a security liability
- Server costs for AI API proxying
- Complexity of user authentication
- Electron allows local-first approach

### Multiplayer Strategy

- Keep Partykit for online matches (no AI needed server-side)
- AI games are local-only (Electron desktop)
- Web version = online multiplayer only
- Desktop version = AI + local + online multiplayer

### Out of scope

- **Campaign mode** — Not planned. Focus is skirmish, hot-seat, and online multiplayer.

---

## 🗓️ Rough Timeline

**Q1 2026 (Now) — Largely complete**

- ✅ Core game mechanics, sprite system, basic UI/UX
- ✅ Movement and combat animations
- ✅ Electron, local AI, save/load, Fog of War, zoom/pan

**Q2 2026**

- Polish and bug fixes; audio
- Transport mechanics; supply (optional)

**Q3 2026**

- Advanced mechanics (transport, supply if not in Q2)
- Shoal coastline; map editor (optional)

**Q4 2026**

- Custom units
- Map editor
- Community features

---

_This roadmap is a living document. Update as priorities change._
