# Modern AW — Project Roadmap

Last Updated: 2026-03-09

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
- [x] Fog of War foundation (data structures in place)

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

### Map Import

- [x] AWBW map text import (CSV tile IDs)
- [x] Tile ID mapping to internal terrain types

### Multiplayer Foundation

- [x] Partykit room setup
- [x] Basic state synchronization

---

## 🚧 In Progress / Next Up

### Electron Desktop App Migration (High Priority)

- [ ] Set up Electron + React (electron-vite or similar)
- [ ] Move game logic to main/renderer process
- [ ] Local save/load game state to JSON files
- [ ] Settings stored in electron-store
- [ ] AI API key management (encrypted local storage)

### AI Opponents

- [ ] Local AI using OpenAI/Anthropic APIs
- [ ] API key input in settings (stored locally in Electron)
- [ ] Multiple difficulty levels / AI personalities
- [ ] Basic heuristic AI fallback (no API needed)

### Combat Animations

- [ ] Attack animation (unit shakes/flashes)
- [ ] Damage numbers or health bar feedback
- [ ] Unit destruction animation

### Camera / Large Maps

- [ ] Camera follow during movement (if map is larger than viewport)
- [ ] Map panning with mouse/keyboard

---

## 📋 Planned Features

### Electron Desktop App Migration

**Why Electron?**

- No backend server needed for single-player
- Store AI API keys locally (secure, no server storage)
- Offline play support
- Native file system access for save/load
- Easier deployment (single executable)

**Migration Tasks:**

- [ ] Set up Electron + React (electron-vite or similar)
- [ ] Move game logic to main/renderer process
- [ ] Local save/load game state to JSON files
- [ ] Settings stored in electron-store
- [ ] AI API key management (encrypted local storage)
- [ ] Keep web version for online multiplayer

### AI Opponents

- [ ] Local AI using OpenAI/Anthropic APIs
- [ ] API key input in settings (stored locally in Electron)
- [ ] Multiple difficulty levels / AI personalities
- [ ] AI thinking indicator
- [ ] Basic heuristic AI fallback (no API needed)

### Game Modes

- [ ] Skirmish vs AI (local)
- [ ] Hot-seat multiplayer (same device)
- [ ] Online multiplayer (Partykit)
- [ ] Map editor

### Map Features

- [ ] Larger map support with camera panning
- [ ] Minimap
- [ ] Zoom in/out
- [ ] Map preview before game start
- [ ] **Shoal coastline auto-tiling** — WarsWorld only ships one `shoal.png`; AWBW uses 4+ tile IDs (29–32) for different coastline orientations. Add directional shoal sprites (or source from AWBW) and bitmask auto-tiling (like roads/rivers) so coastlines render as proper beach edges instead of uniform yellow blocks.

### Advanced Gameplay

- [ ] Transport load/unload (APC, T-Copter, Lander)
- [ ] Indirect fire (Artillery, Rocket range attacks)
- [ ] Fuel consumption for air/sea units
- [ ] Ammo management
- [ ] Supply from APC/cities
- [ ] Weather effects (rain, snow, clear)
- [ ] Fog of War full implementation

### Custom Content (Future)

- [ ] **Custom units** (from `docs/units.md`) — 30 designs (Engineer, Drone Team, Light/Heavy Tank, Mobile Artillery, SAMs, MLRS, Blackhawk, Chinook, Apache, Lander variants, etc.). Each needs: entry in `public/data/units.json`, damage table vs all units, movement costs in terrain data, and either new sprites or reuse/placeholder.
- [ ] **New unit sprites** — Art for custom units (16×16 or 32×32); integrate with WarsWorld-style sheet or separate atlas.
- [ ] **New terrain tiles** — Any additional terrain types beyond current AWBW set; add to `terrain.json`, renderer, and AWBW import if needed.
- [ ] **New buildings** — e.g. radar station, supply depot, repair bay. Add to `terrain.json` (is_property, income, can_produce, etc.), sprite mapping, and building-specific logic (e.g. supply range).
- [ ] Mod support (load external units/maps)

---

## 🎨 UX Polish & Improvements

### Visual Polish

- [ ] Smooth camera transitions
- [ ] Screen shake on explosions
- [ ] Particle effects (smoke, fire)
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
- [ ] Settings menu (volume, animation speed, etc.)
- [ ] Save/load game mid-match

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

| Feature                 | Impact   | Effort     | Priority  | Order |
| ----------------------- | -------- | ---------- | --------- | ----- |
| ~~Movement animations~~ | ~~High~~ | ~~Medium~~ | ✅ Done   | -     |
| Electron migration      | High     | High       | 🔴 High   | 1     |
| AI opponents            | High     | Medium     | 🔴 High   | 2     |
| Save/Load               | High     | Low        | 🟡 Medium | 3     |
| Combat animations       | Medium   | Low        | 🟡 Medium | 4     |
| Transport mechanics     | Medium   | Medium     | 🟡 Medium | 5     |
| Audio/SFX               | Medium   | Low        | 🟡 Medium | 6     |
| Map editor              | Medium   | High       | 🟢 Low    | 7     |
| Shoal coastline tiles   | Medium   | Medium     | 🟡 Medium | 8     |
| Custom units (units.md) | High     | High       | 🟢 Low    | 9     |
| New buildings/tiles     | Medium   | Medium     | 🟢 Low    | 10    |

> **Note:** Electron migration comes before Audio because it enables local AI play with secure API key storage.
> **Known gap:** WarsWorld assets only include one shoal sprite; coastlines render as uniform yellow. See Map Features → Shoal coastline auto-tiling.

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

**Q1 2026 (Now)**

- ✅ Core game mechanics
- ✅ Sprite system
- ✅ Basic UI/UX
- Movement animations
- Combat feedback

**Q2 2026**

- Electron migration
- Local AI integration
- Save/load system
- Audio

**Q3 2026**

- Polish and bug fixes
- Advanced mechanics (transport, supply)
- Full Fog of War

**Q4 2026**

- Custom units
- Map editor
- Community features

---

_This roadmap is a living document. Update as priorities change._
