# Modern AW — Project Roadmap

Last Updated: 2026-03-26

---

## 📍 Where We Are Now (from code + commit history)

- **Electron:** Vite + Electron in place; Next.js removed. Local save/load, encrypted API keys, settings (electron-store), IPC in `electron/main.ts`.
- **AI:** Local OpenAI + Anthropic + local HTTP provider; heuristic fallback; AI turn with abort; settings for API keys and model.
- **Combat:** `combatAnimator.ts` — fire/hit/destruction tile overlays; wired in GameCanvas for player and queued ATTACK.
- **Fog of War:** Full implementation — `visibility.ts` (computeVisibility), `fogRenderer.ts`, `fog_of_war` in GameState; MatchSetup option; terrain/units respect visibility.
- **Save/Load:** Save Game / Continue a Saved Game in UI; IPC save/load/list/delete; serialization tests.
- **Camera:** Pan (Ctrl/Cmd + drag) and zoom in/out/reset; **camera follow** during movement (`updateCameraFollow` in `pixiApp.ts`, driven from `GameCanvas` ticker while `MovementAnimator` runs).
- **Tests:** Vitest (unit + gameStateSerialization + visibility), E2E (Playwright), gameTest and electron.test.
- **Transport:** Load/unload (APC, T-Copter, Lander, Carrier) with UI; LOAD/UNLOAD commands.
- **Fuel:** Air/naval fuel consumption, resupply, 0 fuel = no move; fuel in UI.
- **Mechanics (Session 14):** Unit Merge command, ammo-aware counterattacks, domain-aware repair/healing costs, auto-resupply on properties, Stealth hide/unhide, and submerged/hidden targeting restrictions.
- **Tests:** 197/197 passing after adding 47 tests for new mechanics (`src/tests/newMechanics.test.ts`).

The sections below still list some of these as planned; checkmarks and "In Progress" have been updated to match the codebase.

---

## 🎯 Project Vision

A modern Advance Wars-inspired turn-based strategy game that:

- Uses AWBW/WarsWorld as a foundation for terrain, units, and sprites
- Eventually adds custom units and mechanics (see `docs/units.md`)
- Runs as a **desktop Electron app** to simplify architecture and enable local AI play
- Supports online multiplayer (PartyKit or another authoritative host — see Multiplayer Strategy; not pure P2P inside Electron alone)

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
- [x] Unit merge (AW Join mechanic) with HP cap + excess HP refund
- [x] Victory conditions (HQ capture, unit elimination)
- [x] Fog of War (visibility computation, fog renderer, match option; see `src/game/visibility.ts`, `src/rendering/fogRenderer.ts`)
- [x] Hide/Unhide support for stealth units with fog-aware visibility rules

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
- [x] Preview move animation (unit walks to destination before action menu, AW-accurate)
- [x] Unload tile highlights (teal-green tiles on map, click-to-unload)
- [x] Right-click range preview works during friendly unit selection
- [x] Combat animations (tile overlays: fire, hit, destruction; see `src/rendering/combatAnimator.ts`)
- [x] Screen shake on explosions (hit + destruction intensity levels)
- [x] Particle effects (hit sparks, destruction smoke/fire bursts)
- [x] Smooth camera transitions (eased pan to combat midpoint)
- [x] AI thinking indicator (spinner + header bar pill)
- [x] Zoom and pan (GameCanvas; zoom in/out/reset in App)
- [x] Camera follow during movement animation (safe-zone lerp; `updateCameraFollow` in `pixiApp.ts`)
- [x] Save/load game (Electron IPC; Save Game / Continue in UI)
- [x] Settings modal (API keys, AI provider, model)
- [x] Local AI (OpenAI, Anthropic, local HTTP; heuristic fallback)

### Map Import

- [x] AWBW map text import (CSV tile IDs)
- [x] Tile ID mapping to internal terrain types

### Multiplayer Foundation — Planned, not yet implemented

Full implementation plan exists (see conversation transcript / plan). Key architecture decisions:

- **PartyKit room** (`party/match.ts`) — authoritative server; validates all commands; derives player_id from connection slot
- **Sync strategy** — Full state snapshot on every command (~50KB for 20x15 map); includes `lastCommand` + `seq` for client animation
- **Message protocol** — `ClientMessage` (join, start_game, command, resign, ping) / `ServerMessage` (joined, player_joined, state_update, error, pong)
- **Client** — `partysocket` WebSocket; connection manager in `src/multiplayer/connection.ts`
- **Store** — `onlineMode` flag; `submitCommand` and `confirmMoveAndAction` route to server instead of local apply
- **Lobby** — Room code, player slots, host starts game
- **Security** — Server-side player_id derivation, rate limiting (10 msg/s), 64KB message cap, 30s disconnect timeout

Implementation steps:

- [ ] Install `partykit` (dev) + `partysocket` (runtime); add `partykit.json`, `tsconfig.party.json`, npm scripts
- [ ] Create `src/multiplayer/types.ts` (shared message types)
- [ ] Extract `party/build-gameState.ts` from MatchSetup
- [ ] Create `party/match.ts` (room server)
- [ ] Create `src/multiplayer/connection.ts` (client WebSocket manager)
- [ ] Add online mode to `gameStore.ts` (onlineMode, sendCommand, handleServerUpdate)
- [ ] Update `useGame.ts` (isOnline, isOnlineMyTurn)
- [ ] Add game mode selector to MatchSetup (Local / Online Host / Online Join)
- [ ] Create `OnlineLobby.tsx` component
- [ ] Wire lobby view in App.tsx; disable AI turn effect when online
- [ ] Update InfoPanel, BuyMenu to use sendCommand
- [ ] Room logic tests
- [ ] Full end-to-end two-browser verification
- [ ] Deploy to Cloudflare (`pnpm partykit:deploy`)

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
- [x] AI thinking indicator (spinner animation + header bar "AI TURN" pill)
- [ ] Multiple difficulty levels / AI personalities (future)

### Core Mechanics — Done ✅

- [x] Unit merge (MERGE command): HP cap at 10, excess HP funds refund, max ammo/fuel retention
- [x] Ammo-aware counterattacks (counter weapon must have ammo; counter consumes ammo)
- [x] Domain-aware healing with funds cost (ground/city-family, air/airport, naval/port)
- [x] Auto-resupply on friendly properties (ammo + fuel at turn start)
- [x] Stealth hide/unhide (HIDE/UNHIDE) with combat/visibility constraints
- [x] Submarine submerge/surface targeting restrictions (range > 1 blocked)

### Combat Animations — Done ✅

- [x] Attack/hit/destruction (tile overlays: fire flash, hit flash, destruction flicker; see combatAnimator.ts)
- [x] Screen shake on explosions (0.5x hit, 1.0x destruction; exponential decay)
- [x] Particle effects (hit sparks, destruction smoke/fire bursts; `particleSystem.ts`)
- **Won’t do:** Damage numbers or health bar feedback — hover / tile info already exposes the relevant combat context.

### Camera / Large Maps

- [x] Map panning (Ctrl/Cmd + drag) and zoom in/out/reset
- [x] **Camera follow** — During movement animation, pan lerps so the unit stays inside a viewport safe zone (`updateCameraFollow` + `MovementAnimator.getActiveWorldPos()` in `GameCanvas`).

---

## 📋 Planned Features

### Electron Desktop App — Implemented ✅

- [x] Electron + Vite + React; local save/load; settings (electron-store); encrypted API keys
- [ ] Keep web version for online multiplayer (Partykit) when desired

### AI Opponents — Implemented ✅

- [x] Local AI (OpenAI, Anthropic, local HTTP); API keys in settings; heuristic fallback
- [x] AI thinking indicator (spinner + header bar pill)
- [ ] Multiple difficulty levels / AI personalities

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
- [x] **Indirect fire** — Artillery, Rocket (and other indirect units) can attack at range (min_range > 1 or max_range > 1); no counterattack from target; range behavior enforced.
- [x] **Ammo management (core)** — Ammo depletion applies to normal and counterattacks; counter weapon selection requires available ammo.
- [x] **Auto-resupply on properties** — Friendly properties restore ammo/fuel at turn start.
- [ ] Supply from APC/cities (active supply mechanics/range, beyond property auto-resupply)
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

### Optional polish (visual & feedback) — Mostly Done ✅

- [x] **Camera follow** during unit movement (see Camera / Large Maps)
- [x] Smooth camera transitions (eased pan to combat midpoint; `animatePanTo` in `pixiApp.ts`)
- [x] Screen shake on explosions (hit 0.5x, destruction 1.0x; exponential decay)
- [x] Particle effects (hit sparks, destruction smoke/fire; `particleSystem.ts`)
- [x] AI thinking indicator (spinner + “AI TURN” header bar pill)
- [x] Preview move animation (AW-accurate: unit walks to destination before action menu)
- [x] Unload tile highlights (teal-green map highlights, click-to-unload)
- [x] Resign confirmation modal
- **Won’t do:** Damage numbers or health bar feedback during combat — cursor hover / tile panel already shows the needed info.
- [ ] **Day/night cycle visual** — Nice-to-have; **deferred** until a deliberate pass on custom map/unit styling (may revisit with a different approach).
- [ ] **Weather visual effects** — Same as day/night: **deferred** with custom art direction; gameplay weather (if ever added) is separate from this cosmetic layer.

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

- [ ] Add unit tests for game logic (validators, applyCommand)
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

| Feature                 | Impact     | Effort      | Priority  | Order |
| ----------------------- | ---------- | ----------- | --------- | ----- |
| ~~Movement animations~~ | ~~High~~   | ~~Medium~~  | ✅ Done   | -     |
| ~~Electron migration~~  | ~~High~~   | ~~High~~    | ✅ Done   | -     |
| ~~AI opponents~~        | ~~High~~   | ~~Medium~~  | ✅ Done   | -     |
| ~~Save/Load~~           | ~~High~~   | ~~Low~~     | ✅ Done   | -     |
| ~~Combat animations~~   | ~~Medium~~ | ~~Low~~     | ✅ Done   | -     |
| ~~Fog of War~~          | ~~High~~   | ~~Medium~~  | ✅ Done   | -     |
| ~~Transport mechanics~~ | ~~Medium~~ | ~~Medium~~  | ✅ Done   | -     |
| ~~Fuel mechanics~~      | ~~Medium~~ | ~~Medium~~  | ✅ Done   | -     |
| ~~Indirect fire~~       | ~~High~~   | ~~Medium~~  | ✅ Done   | -     |
| ~~Camera follow~~       | ~~Medium~~ | ~~Low~~     | ✅ Done   | -     |
| ~~Optional polish~~     | ~~Low~~    | ~~Low–Med~~ | ✅ Done   | -     |
| Online multiplayer      | High       | Medium      | 🟡 Medium | 8     |
| Map preview             | Medium     | Low         | 🟡 Medium | 9     |
| Map editor              | Medium     | High        | 🟢 Low    | 10    |
| Shoal coastline tiles   | Medium     | Medium      | 🟡 Medium | 11    |
| Custom units (units.md) | High       | High        | 🟢 Low    | 12    |
| New buildings/tiles     | Medium     | Medium      | 🟢 Low    | 13    |
| Audio/SFX               | Medium     | Low         | 🟢 Low    | 14    |

> **Note:** Electron migration comes before Audio because it enables local AI play with secure API key storage.
> **Known gap:** WarsWorld assets only include one shoal sprite; coastlines render as uniform yellow. See Map Features → Shoal coastline auto-tiling.

---

## 📜 Feature list (planned / backlog)

Single list of all planned features for easy reference. Order follows Priority Matrix where applicable.

| #   | Feature                    | Notes                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| –   | ~~Transport mechanics~~    | ✅ Done — Load/unload APC, T-Copter, Lander, Carrier; UI.                                                                                                                                                                                                                                                     |
| –   | ~~Fuel mechanics~~         | ✅ Done — Air/naval fuel; resupply; 0 fuel = no move.                                                                                                                                                                                                                                                         |
| –   | ~~Indirect fire~~          | ✅ Done — Artillery, Rocket, Missile range attacks; no counter from target.                                                                                                                                                                                                                                   |
| –   | ~~Camera follow~~          | ✅ Done — Pan during move animation; safe-zone lerp (`pixiApp.ts` + GameCanvas).                                                                                                                                                                                                                              |
| –   | ~~Optional polish~~        | ✅ Done — Smooth camera transitions, screen shake, particles, AI thinking indicator, preview move animation, unload highlights, resign confirmation. Day/night + weather visuals deferred.                                                                                                                    |
| 8   | Online multiplayer         | **Paused — architecture:** PartyKit is **not P2P**; match logic runs on **hosted** infra (e.g. Cloudflare via deploy) or **`partykit dev`** — not “one Electron app hosts the other” by itself. True host-on-PC needs WebSocket-in-main + NAT/LAN/VPN, WebRTC, or a relay. Pick approach, then finish wiring. |
| 9   | Map preview                | Show map (name, size, thumbnail) before game start.                                                                                                                                                                                                                                                           |
| 10  | Map editor                 | Create and edit maps in-app.                                                                                                                                                                                                                                                                                  |
| 11  | Shoal coastline tiles      | Directional shoal sprites + auto-tiling.                                                                                                                                                                                                                                                                      |
| 12  | Custom units (units.md)    | 30 designs; data + sprites.                                                                                                                                                                                                                                                                                   |
| 13  | New buildings/tiles        | Radar, supply depot, new terrain.                                                                                                                                                                                                                                                                             |
| 14  | Audio/SFX                  | In-game sounds and music. (Last.)                                                                                                                                                                                                                                                                             |
| –   | Hot-seat multiplayer       | Same device, pass-and-play.                                                                                                                                                                                                                                                                                   |
| –   | Minimap                    | In-game minimap.                                                                                                                                                                                                                                                                                              |
| –   | ~~Ammo management~~        | ✅ Done (core) — ammo depletion + counter-attack ammo checks + property resupply.                                                                                                                                                                                                                             |
| –   | Supply from APC/cities     | Supply range and mechanics.                                                                                                                                                                                                                                                                                   |
| –   | Weather effects            | Rain, snow, clear; affect movement/vision.                                                                                                                                                                                                                                                                    |
| –   | UX refinement (menus)      | Menus and chrome only; map/sprites unchanged (see CLAUDE.md).                                                                                                                                                                                                                                                 |
| –   | Multiple AI difficulty     | AI personalities / difficulty levels.                                                                                                                                                                                                                                                                         |
| –   | Unit info panel            | Stats, HP, ammo, fuel at a glance.                                                                                                                                                                                                                                                                            |
| –   | Damage preview             | Before attacking.                                                                                                                                                                                                                                                                                             |
| –   | Undo last move             | Before confirming action.                                                                                                                                                                                                                                                                                     |
| –   | Colorblind / accessibility | Team indicators, high contrast, etc.                                                                                                                                                                                                                                                                          |

---

## 📝 Notes

### Why Not Full Backend?

- Storing user API keys on a server is a security liability
- Server costs for AI API proxying
- Complexity of user authentication
- Electron allows local-first approach

### Multiplayer Strategy

- **PartyKit ≠ peer-to-peer.** Rooms are **server-authoritative**: your `party/match.ts` (or equivalent) runs on **Cloudflare’s edge** when deployed, or on **`partykit dev`** as a **separate process** on a machine that both clients can reach. Two Electron installs alone do **not** host that logic unless you add something else.
- **Why “host on my PC” felt right:** True “one player hosts” usually means **(A)** a small **WebSocket server in Electron’s main process** (guest connects to host’s IP — needs **port forwarding**, often fails on CGNAT), **(B)** **LAN** or **Tailscale/ZeroTier** so the guest has a route to the host, **(C)** **WebRTC** (signaling still needs a rendezvous server unless LAN), or **(D)** accept a **cheap always-on relay** (PartyKit, Fly.io, etc.).
- **PartyKit path (if you keep it):** Still no AI on server for v1 human vs human. Authoritative room validates commands; `partysocket` clients; full snapshots + `seq` / `lastCommand` for animations (see existing plan).
- **Sync strategy (recommended regardless of host):** Full state snapshots (not deltas) until bandwidth forces otherwise.
- **Dev workflow (PartyKit):** `pnpm partykit:dev` → local server (e.g. `localhost:1999`); production → `partykit deploy` to Cloudflare.
- **AI games:** Local-only (Electron) is fine; online can stay humans-only for v1.
- **Out of scope (v1):** Spectators, replays, matchmaking, ELO, AI players in online matches, cross-region lag compensation, rollback netcode, chat, save/load for online matches.

### Out of scope

- **Campaign mode** — Not planned. Focus is skirmish, hot-seat, and online multiplayer.

---

## 🗓️ Rough Timeline

**Q1 2026 (Now) — Largely complete**

- ✅ Core game mechanics, sprite system, basic UI/UX
- ✅ Movement and combat animations
- ✅ Electron, local AI, save/load, Fog of War, zoom/pan

**Q2 2026**

- Online multiplayer — **blocked on hosting model** (PartyKit = deployed server; or implement host-on-LAN / WebSocket-in-Electron / WebRTC)
- Audio/SFX
- Map editor; map preview

**Q3 2026**

- Shoal coastline auto-tiling
- Custom units (from docs/units.md)
- Supply from APC/cities

**Q4 2026**

- Custom units
- Map editor
- Community features

---

_This roadmap is a living document. Update as priorities change._
