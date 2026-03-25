# Sprite Generation Specification

Technical reference for generating replacement sprites for Modern AW.
All sprites are loaded via Pixi.js Spritesheets (PNG + JSON atlas pairs).

---

## Global Rules

- **Pixel art style**: GBA-era Advance Wars aesthetic — clean pixel edges, limited color palette per sprite, strong 1px dark outlines, no anti-aliasing
- **Base tile size**: 16x16 pixels
- **Format**: PNG with transparency (RGBA8888)
- **Scale mode**: nearest-neighbor (no bilinear filtering — rendered at 3x = 48px display)
- **Transparency**: Use full transparency (#00000000), not magenta or other color keys
- Buildings extend **upward** beyond the 16x16 tile — they are anchored at the bottom edge
- All sprites in a group must share a **consistent color palette and outline style**

---

## Terrain Sprites (`awbw-terrain.png`)

All terrain frames are packed into a single horizontal strip atlas with a companion JSON file.

### Group 1: Basic Terrain (static, 16x16 each)

| Frame name     | Size      | Background      | Description                                            |
| -------------- | --------- | --------------- | ------------------------------------------------------ |
| `plain.png`    | 16x16     | Opaque          | Flat green grass tile, fully fills the frame           |
| `sea.png`      | 16x16     | Opaque          | Deep ocean with visible wave/ripple texture pattern    |
| `reef.png`     | 16x16     | **Transparent** | Coral/rock formation, rendered on top of sea.png       |
| `mountain.png` | 16x**21** | **Transparent** | Rocky peak, extends 5px above tile, anchored at bottom |
| `forest.png`   | 16x16     | **Transparent** | Tree canopy, rendered on top of plain.png              |

### Group 2: Roads (11 unique tiles, 16x16 each)

Auto-tiled via 4-bit bitmask (N=1, E=2, S=4, W=8). Only 11 unique sprites are needed — single-direction and isolated bitmask values fall back to straight tiles. Each road tile has **plains background with a grey road path**. Roads connect smoothly at tile edges.

Naming convention: `road-{directions}.png` — directions listed in order: top, right, bottom, left.

| Bitmask      | Frame name                       | Shape                    |
| ------------ | -------------------------------- | ------------------------ |
| 0 (isolated) | `road-top-bottom.png`            | Vertical straight        |
| 1 (N)        | `road-top-bottom.png`            | Vertical straight        |
| 2 (E)        | `road-right-left.png`            | Horizontal straight      |
| 3 (N+E)      | `road-top-right.png`             | Corner turn              |
| 4 (S)        | `road-top-bottom.png`            | Vertical straight        |
| 5 (N+S)      | `road-top-bottom.png`            | Vertical straight        |
| 6 (E+S)      | `road-right-bottom.png`          | Corner turn              |
| 7 (N+E+S)    | `road-top-right-bottom.png`      | T-junction (open left)   |
| 8 (W)        | `road-right-left.png`            | Horizontal straight      |
| 9 (N+W)      | `road-top-left.png`              | Corner turn              |
| 10 (E+W)     | `road-right-left.png`            | Horizontal straight      |
| 11 (N+E+W)   | `road-top-right-left.png`        | T-junction (open bottom) |
| 12 (S+W)     | `road-bottom-left.png`           | Corner turn              |
| 13 (N+S+W)   | `road-top-bottom-left.png`       | T-junction (open right)  |
| 14 (E+S+W)   | `road-right-bottom-left.png`     | T-junction (open top)    |
| 15 (all)     | `road-top-right-bottom-left.png` | 4-way crossroads         |

### Group 3: Rivers (11 unique tiles, 16x16 each)

Identical bitmask structure as roads (11 unique sprites, 16 bitmask lookups). Blue water channel with green grass banks. Rivers connect to sea and port tiles at edges.

Naming: `river-{directions}.png` — same direction naming as roads.

### Group 4: Bridges (2 variants, 16x16 each)

| Frame name              | Description                                 |
| ----------------------- | ------------------------------------------- |
| `bridge-right-left.png` | Horizontal bridge (road surface over water) |
| `bridge-top-bottom.png` | Vertical bridge (road surface over water)   |

### Group 5: Shoals (4 directional, 16x16 each)

Shoals use a **compositing/layering system**. Multiple direction sprites are stacked on the same tile. The sea-colored areas of each sprite **must be fully transparent** — only the sand/beach pixels are opaque.

| Frame name    | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `shoal-n.png` | Sand strip along the **north** edge only, rest transparent |
| `shoal-s.png` | Sand strip along the **south** edge only, rest transparent |
| `shoal-e.png` | Sand strip along the **east** edge only, rest transparent  |
| `shoal-w.png` | Sand strip along the **west** edge only, rest transparent  |

**How they render**: solid light-blue bg (#6392FC) → sea.png at 65% alpha → stack whichever direction sprites face land. A tile with land to the north and east gets shoal-n + shoal-e stacked, forming a corner beach automatically.

---

## Building Sprites

Buildings live in **per-army spritesheets** (orange-star.png, blue-moon.png, etc.) plus a neutral.json sheet. All building frames have **transparent backgrounds** and are rendered on top of plains.

Buildings are **taller than 16px** — they extend upward and are anchored at the bottom of the tile cell.

### Neutral Buildings (static, 1 frame each)

Used when no player owns the building. Grey/white color scheme.

| Frame name      | Size  | Description                          |
| --------------- | ----- | ------------------------------------ |
| `hq-0.png`      | 16x31 | Headquarters — tallest building      |
| `city-0.png`    | 16x21 | City/town                            |
| `base-0.png`    | 16x25 | Factory ("base" in WarsWorld naming) |
| `airport-0.png` | 16x18 | Airport/airfield                     |
| `port-0.png`    | 16x22 | Naval port/harbor                    |

### Army Buildings (animated, per-color)

Each building is animated with a slow idle loop (0.04 frames/tick ≈ 2.4 FPS). Same frame sizes as neutral.

**4 army colors**: orange-star (red/orange), blue-moon (blue), green-earth (green), yellow-comet (yellow/gold).

The building structure/silhouette stays **identical** across colors — only the color palette swaps. Each army uses a dominant color plus a lighter highlight and darker shadow variant of that color.

| Building            | Frames | Size  | Animation description                                                                                                     |
| ------------------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| Factory (`base`)    | 6      | 16x25 | Chimney smoke cycling: no smoke → small puff → medium puff → large puff → dissipating → clear. Building lights may shift. |
| HQ (`hq`)           | 3      | 16x31 | Flag/banner waving or antenna light blinking                                                                              |
| City (`city`)       | 3      | 16x21 | Window lights toggling on/off across floors                                                                               |
| Airport (`airport`) | 3      | 16x18 | Runway beacon or tower light blinking                                                                                     |
| Port (`port`)       | 3      | 16x22 | Dock light or water ripple at base                                                                                        |

Frame naming: `{building}-{frameIndex}.png` (e.g. `base-0.png` through `base-5.png`)

---

## Unit Sprites

Units live in the same **per-army spritesheets** as buildings. All unit frames have **transparent backgrounds**. Units are roughly 16x16 but some are slightly smaller (tank: 15x14, sub: 16x13).

Each unit has:

- **Idle animation**: facing down, looping
- **Movement animations** in 3 directions: `mdown` (toward camera), `mside` (left/right), `mup` (away from camera)
- `mside` serves both left and right — the engine **flips the sprite horizontally** for leftward movement

**4 army colors** with same palette-swap approach as buildings.

| Unit        | Game ID           | Idle frames | Move frames/dir | Size  | Description                         |
| ----------- | ----------------- | ----------- | --------------- | ----- | ----------------------------------- |
| Infantry    | `infantry`        | 4           | 4               | 16x16 | Walking soldier with rifle          |
| Mech        | `mech`            | 2           | 4               | 16x16 | Heavy trooper with bazooka          |
| Recon       | `recon`           | 4           | 3               | 16x16 | Light scout jeep                    |
| APC         | `apc`             | 4           | 3               | 16x16 | Armored transport truck             |
| Tank        | `tank`            | 4           | 3               | 15x14 | Light tank                          |
| Medium Tank | `mediumTank`      | 4           | 3               | 16x16 | Larger tank with bigger turret      |
| Artillery   | `artillery`       | 4           | 3               | 16x16 | Towed cannon                        |
| Rocket      | `rocket`          | 2           | 3               | 16x16 | Rocket launcher truck               |
| Anti-Air    | `antiAir`         | 4           | 3               | 16x16 | AA gun on truck chassis             |
| Missile     | `missile`         | 2           | 3               | 16x16 | SAM launcher vehicle                |
| T-Copter    | `transportCopter` | 4           | 2               | 16x16 | Cargo helicopter                    |
| B-Copter    | `battleCopter`    | 4           | 2               | 16x16 | Attack helicopter with missile pods |
| Fighter     | `fighter`         | 2           | 3               | 16x16 | Jet fighter plane                   |
| Bomber      | `bomber`          | 2           | 3               | 16x16 | Heavy bomber plane                  |
| Stealth     | `stealth`         | 2           | 3               | 16x16 | Stealth fighter/bomber              |
| Lander      | `lander`          | 2           | 2               | 16x15 | Beach landing craft                 |
| Cruiser     | `cruiser`         | 2           | 2               | 16x16 | Naval cruiser                       |
| Submarine   | `sub`             | 4           | 2               | 16x13 | Submarine                           |
| Carrier     | `carrier`         | 2           | 2               | 16x16 | Aircraft carrier                    |

Frame naming:

- Idle: `{unitName}-{frameIndex}.png` (e.g. `infantry-0.png` through `infantry-3.png`)
- Movement: `{unitName}-{direction}-{frameIndex}.png` (e.g. `infantry-mdown-0.png`, `tank-mside-2.png`)

---

## Atlas Packing

Each spritesheet is a single PNG with all frames packed, paired with a JSON file describing frame positions. The JSON follows the standard TexturePacker/Pixi.js Spritesheet format:

```json
{
  "frames": {
    "frame-name.png": {
      "frame": { "x": 0, "y": 0, "w": 16, "h": 16 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 16, "h": 16 },
      "sourceSize": { "w": 16, "h": 16 }
    }
  },
  "animations": {
    "animationName": ["frame-0.png", "frame-1.png", "frame-2.png"]
  },
  "meta": {
    "scale": 1,
    "image": "sheet-name.png",
    "format": "RGBA8888",
    "size": { "w": 528, "h": 21 }
  }
}
```

The `animations` block groups frames into named sequences for `AnimatedSprite`.

---

## File Inventory

| File                                                  | Contents                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `public/sprites/awbw-terrain.png` + `.json`           | All terrain tiles (plain, mountain, forest, roads, rivers, bridges, sea, shoals, reef) |
| `public/sprites/warsworld/neutral.png` + `.json`      | Neutral buildings (static) + neutral terrain fallbacks                                 |
| `public/sprites/warsworld/orange-star.png` + `.json`  | P1 (red) buildings (animated) + units (idle + movement)                                |
| `public/sprites/warsworld/blue-moon.png` + `.json`    | P2 (blue) buildings + units                                                            |
| `public/sprites/warsworld/green-earth.png` + `.json`  | P3 (green) buildings + units                                                           |
| `public/sprites/warsworld/yellow-comet.png` + `.json` | P4 (yellow) buildings + units                                                          |
