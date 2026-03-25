# Sprite Generation Prompts for Nano Banana

Copy-paste these prompts in order. Each prompt generates one group of sprites.
After each generation, verify the output matches the specs before moving on.

**Important**: Feed the first prompt's style preamble into every subsequent prompt to maintain consistency. If Nano Banana supports reference images, attach the output from Group 1 as a style reference for all later groups.

---

## Style Preamble (include with every prompt)

> **Style**: GBA-era Advance Wars pixel art. 16x16 pixel tile grid. Clean 1-pixel dark outlines on all shapes. Limited color palette per sprite (8-12 colors max). No anti-aliasing, no dithering gradients, no sub-pixel detail. Colors are saturated and distinct. Viewed from a top-down perspective with slight isometric tilt (about 3/4 view — you can see the front face and top of objects). Transparent background unless specified otherwise.

---

## Group 1: Basic Terrain

**Prompt:**

> [Style preamble]
>
> Generate a horizontal sprite strip of 5 terrain tiles for a turn-based tactics game. Each tile is 16x16 pixels except where noted. Arrange them left to right with no gaps:
>
> 1. **Plains** (16x16, opaque): Flat grass tile. Bright yellow-green base color (#8BC34A range) with subtle 1-2 pixel darker green grass tufts scattered across the surface. Fully opaque — no transparency. This is the most common tile and must look clean and simple.
>
> 2. **Sea** (16x16, opaque): Deep ocean water. Dark blue base (#1A5276 range) with a repeating diagonal wave/ripple pattern in slightly lighter blue. The wave texture should be clearly visible and tile seamlessly when placed next to copies of itself. Fully opaque.
>
> 3. **Reef** (16x16, transparent bg): Coral rock formation sitting in water. Draw jagged brown/teal coral shapes (#0E6655 range) in the center of the tile. The entire background must be fully transparent — this sprite renders on top of the sea tile. The coral should have a 1px dark outline.
>
> 4. **Mountain** (16x**21** pixels, transparent bg): Rocky mountain peak. The mountain sits on the bottom 16 pixels and extends 5 pixels above the tile boundary. Grey-brown rock (#886644 range) with snow/white highlights at the peak. Strong dark outline. Entire background is transparent — this renders on top of plains.
>
> 5. **Forest** (16x16, transparent bg): Tree canopy viewed from above with slight 3/4 view. Dark green (#228822 range) rounded tree crowns with 1px dark outline. Small shadow underneath. Transparent background — renders on top of plains.
>
> Export as a single PNG strip. The strip should be exactly 80 pixels wide (5 tiles x 16px) and 21 pixels tall (tallest tile is the mountain).

**Verification**: Plains and sea should be fully opaque. Reef, mountain, and forest should have transparent backgrounds. Mountain should be taller than the others.

---

## Group 2: Roads (16 variants)

**Prompt:**

> [Style preamble]
>
> Generate 16 road tile variants for a turn-based tactics grid game. Each tile is 16x16 pixels with a plains/grass background and a grey paved road path drawn on top. The road path is about 6-8 pixels wide, centered, with a 1px dark grey border on each side of the road surface. Road color: medium grey (#888888 range) with lighter grey center line.
>
> Roads connect at tile edges using a 4-directional system: North (top), East (right), South (bottom), West (left). Generate these 16 variants arranged in a 4x4 grid (or horizontal strip), in this exact order:
>
> Row 1:
> 1. Vertical straight (exits top and bottom)
> 2. Horizontal straight (exits right and left)
> 3. Corner: top + right (L-turn)
> 4. Corner: right + bottom (L-turn)
>
> Row 2:
> 5. Corner: bottom + left (L-turn)
> 6. Corner: top + left (L-turn)
> 7. T-junction: top + right + bottom (open on left side)
> 8. T-junction: right + bottom + left (open on top)
>
> Row 3:
> 9. T-junction: top + bottom + left (open on right)
> 10. T-junction: top + right + left (open on bottom)
> 11. 4-way crossroads (exits all 4 directions)
> 12. Dead-end: exits top only (road ends in center, rest is grass)
>
> Row 4:
> 13. Dead-end: exits right only
> 14. Dead-end: exits bottom only
> 15. Dead-end: exits left only
> 16. Isolated road (no exits — small road patch in center)
>
> CRITICAL: Road paths must align perfectly at tile edges. Where a road exits the top edge, it should be centered horizontally at the same position as a road entering from the bottom of the tile above. The road surface must reach the exact pixel edge of the tile so adjacent roads connect seamlessly.

**Verification**: Place two road tiles next to each other — the road paths should connect with no gap or misalignment at the seam.

---

## Group 3: Rivers (16 variants)

**Prompt:**

> [Style preamble]
>
> Generate 16 river tile variants. Same 4-directional bitmask system as the road set. Each tile is 16x16 pixels.
>
> River tiles have green grass/dirt banks on either side and a blue water channel running through the middle. The water channel is about 6-8 pixels wide. Water color: medium blue (#4488CC range) with subtle lighter blue ripple highlights. Banks are yellow-green grass matching the plains tile color.
>
> Generate the same 16 directional variants as the roads (vertical, horizontal, 4 corners, 4 T-junctions, crossroads, 4 dead-ends, isolated) in the same order. The water channels must align at tile edges exactly like the roads do.
>
> The river visual style should be clearly distinct from roads — use organic/curved channel edges rather than the straight-edged road style. Banks should have slight irregularity (1-2 pixel variation) to look natural.

**Verification**: Rivers should seamlessly connect at tile boundaries. They should be visually distinct from roads at a glance (blue water vs grey pavement).

---

## Group 4: Bridges + Shoals

**Prompt:**

> [Style preamble]
>
> Generate 6 water-related tiles, each 16x16 pixels:
>
> **Bridges (2 tiles, opaque):**
> 1. Horizontal bridge: A wooden/concrete bridge surface running left-to-right over water. The road surface should match the road tiles' grey color and width. Water (matching sea tile color) visible above and below the bridge. The bridge has small railings (1px lines) on top and bottom edges.
> 2. Vertical bridge: Same bridge rotated 90° — road runs top-to-bottom, water visible on left and right sides.
>
> **Shoal direction sprites (4 tiles, transparent background):**
>
> These are beach/sand edge sprites that get LAYERED on top of each other. Each one only has sand pixels on ONE edge — the rest of the tile is fully transparent.
>
> 3. Shoal-North: A strip of sandy beach (tan/beige, #DDC088 range) along the TOP edge of the tile, about 3-4 pixels deep. The sand should have a slightly irregular coastline edge (not perfectly straight). Everything below the sand strip is fully transparent.
> 4. Shoal-South: Sand strip along the BOTTOM edge. Same style, fully transparent elsewhere.
> 5. Shoal-East: Sand strip along the RIGHT edge. Same style, fully transparent elsewhere.
> 6. Shoal-West: Sand strip along the LEFT edge. Same style, fully transparent elsewhere.
>
> IMPORTANT for shoals: When shoal-north and shoal-east are placed on top of each other, they should form a natural-looking corner beach in the top-right. The sand strips should slightly overlap/blend in corners. Keep sand color consistent across all 4 directions.

**Verification**: Stack shoal-n + shoal-e on a blue background — they should form a coherent NE corner beach. Each shoal alone should only have sand on its designated edge.

---

## Group 5: Neutral Buildings (static)

**Prompt:**

> [Style preamble]
>
> Generate 5 neutral (unowned) building sprites for a tactics game. Neutral buildings use a grey/white/silver color scheme — they look like the buildings have no faction banner or lights. All have transparent backgrounds and are taller than 16px — they extend UPWARD beyond the tile boundary and are anchored at the bottom.
>
> Arrange them in a horizontal strip:
>
> 1. **HQ** (16 wide x 31 tall): The tallest building. A large command center / government building with a prominent tower or antenna mast. Multiple floors visible from the 3/4 view. Grey stone walls, darker grey roof. A flag pole at the top (flag is white/grey for neutral). Strong 1px dark outline.
>
> 2. **City** (16 wide x 21 tall): A small town building — 2-3 story house/apartment with a peaked roof. Grey walls with darker window rectangles (windows are dark/unlit for neutral). Chimney or small detail on roof.
>
> 3. **Factory / Base** (16 wide x 25 tall): An industrial building with a smokestack/chimney. Flat or sawtooth factory roof. Loading dock or large door visible on the front face. Grey metal walls. The smokestack should be prominent — it's the signature feature of this building.
>
> 4. **Airport** (16 wide x 18 tall): A small control tower with a flat runway area at the base. The tower has a windowed observation deck at top. Radar dish or beacon on the roof. Grey concrete colors.
>
> 5. **Port** (16 wide x 22 tall): A harbor building with a dock/pier structure. Crane or loading arm visible. The base of the building sits at water level. Grey stone dock with darker wooden pier elements.
>
> All buildings should share a consistent grey color palette, similar roof styles, and identical outline thickness. They should look like they belong together as a set.

**Verification**: All buildings should look cohesive as a set. They should be clearly distinguishable from each other by silhouette alone.

---

## Group 6: Army Buildings — Factory (4 colors, 6 frames each)

**Prompt:**

> [Style preamble]
>
> Generate factory ("base") building animation frames for 4 army factions. The factory is 16 pixels wide and 25 pixels tall with a transparent background.
>
> The factory is an industrial building with a prominent smokestack, flat/sawtooth roof, and a large door/loading dock on the front face. The smokestack's smoke animation is the key visual feature.
>
> Generate a grid: 4 rows (one per faction) x 6 columns (animation frames).
>
> **Rows — each row uses a different army color palette:**
> - Row 1 — **Orange Star (Red)**: Primary: warm red (#DD4444). Secondary: orange (#FF8844). Highlight: cream/white. Shadow: dark red (#882222). Roof and walls in faction colors, door and details in darker shade.
> - Row 2 — **Blue Moon (Blue)**: Primary: medium blue (#4444DD). Secondary: light blue (#6688FF). Highlight: ice white. Shadow: navy (#222266).
> - Row 3 — **Green Earth (Green)**: Primary: bright green (#44DD44). Secondary: lime (#88FF44). Highlight: pale green. Shadow: dark green (#226622).
> - Row 4 — **Yellow Comet (Yellow/Gold)**: Primary: golden yellow (#DDDD44). Secondary: orange-gold (#FFCC44). Highlight: pale yellow. Shadow: dark gold (#888822).
>
> **Columns — 6 animation frames showing a smoke cycle:**
> - Frame 0: Factory idle — no smoke, chimney clear, building lights dim
> - Frame 1: Small puff of grey smoke just emerging from chimney top
> - Frame 2: Medium smoke cloud rising, building lights brightening
> - Frame 3: Large smoke plume above chimney, lights fully on
> - Frame 4: Smoke dissipating/drifting, starting to fade
> - Frame 5: Last wisps of smoke fading away, lights dimming back
>
> The building structure (walls, door, roof shape) must be IDENTICAL across all 4 colors — only the color palette changes. The smoke is grey across all factions. Each frame should have subtle differences — this animation plays very slowly (about 2 FPS).
>
> CRITICAL: The building silhouette and proportions must be exactly the same in all 24 frames (4 colors x 6 frames). Only color palette and smoke state change.

**Verification**: All 4 color variants should be pixel-identical in structure, differing only in palette. The 6-frame smoke sequence should read as a smooth slow cycle.

---

## Group 7: Army Buildings — HQ (4 colors, 3 frames each)

**Prompt:**

> [Style preamble]
>
> Generate HQ (headquarters) building animation frames for 4 army factions. The HQ is 16 pixels wide and 31 pixels tall (the tallest building) with a transparent background.
>
> The HQ is a large command center with a tower, multiple floors, and a faction flag at the top. It should look imposing and important — this is the building players must protect.
>
> Generate a grid: 4 rows (one per faction) x 3 columns (animation frames).
>
> **Rows** — same 4 faction color palettes as the factory prompt (Orange Star red, Blue Moon blue, Green Earth green, Yellow Comet gold).
>
> **Columns — 3 animation frames showing a flag/light cycle:**
> - Frame 0: Flag at rest position, building lights in state A
> - Frame 1: Flag mid-wave, some building lights toggled
> - Frame 2: Flag at opposite wave position, lights in state B
>
> The flag at the top should be colored in the faction's primary color. The animation is subtle — the flag gently waves and a few window lights toggle on/off between frames. Building structure stays completely rigid.
>
> Same rules: identical silhouette across all colors, only palette swaps. 1px dark outline on everything.

---

## Group 8: Army Buildings — City (4 colors, 3 frames each)

**Prompt:**

> [Style preamble]
>
> Generate city building animation frames for 4 army factions. The city is 16 pixels wide and 21 pixels tall with a transparent background.
>
> The city is a 2-3 story residential building with a peaked/angled roof and windows on the front face. When owned by a faction, the roof is painted in the faction's color.
>
> Generate a grid: 4 rows x 3 columns.
>
> **Rows** — same 4 faction color palettes.
>
> **Columns — 3 animation frames showing window lights:**
> - Frame 0: Windows in pattern A (e.g., top-left and bottom-right lit, others dark)
> - Frame 1: Windows in pattern B (e.g., all lit)
> - Frame 2: Windows in pattern C (e.g., top-right and bottom-left lit)
>
> The "lit" windows should be a warm yellow/white color. "Unlit" windows are dark grey/black. The building walls and roof stay the same — only window light states change between frames.

---

## Group 9: Army Buildings — Airport (4 colors, 3 frames each)

**Prompt:**

> [Style preamble]
>
> Generate airport building animation frames for 4 army factions. The airport is 16 pixels wide and 18 pixels tall with a transparent background.
>
> The airport is a small control tower with an observation deck at the top and a flat runway pad at the base. A small radar dish or beacon sits on the tower roof.
>
> Generate a grid: 4 rows x 3 columns.
>
> **Rows** — same 4 faction color palettes. The tower body and runway pad use faction colors.
>
> **Columns — 3 frames showing a beacon blink:**
> - Frame 0: Beacon light OFF (dark dot on tower top)
> - Frame 1: Beacon light ON — bright white/yellow glow pixel at tower top
> - Frame 2: Beacon light DIM — fading glow (between on and off brightness)
>
> The beacon is a single pixel or 2x2 pixel area that changes brightness. Rest of building is static.

---

## Group 10: Army Buildings — Port (4 colors, 3 frames each)

**Prompt:**

> [Style preamble]
>
> Generate port/harbor building animation frames for 4 army factions. The port is 16 pixels wide and 22 pixels tall with a transparent background.
>
> The port is a dockside building with a crane or loading arm, and a wooden pier/dock structure at the base. The building sits at water level.
>
> Generate a grid: 4 rows x 3 columns.
>
> **Rows** — same 4 faction color palettes. Building walls and crane use faction colors.
>
> **Columns — 3 frames showing dock light or water ripple:**
> - Frame 0: Dock light in position A, water at base in ripple state 1
> - Frame 1: Dock light in position B, water ripple state 2
> - Frame 2: Dock light in position A again, water ripple state 3
>
> The water at the base of the port should show subtle 1-pixel ripple changes. A small dock light toggles. Building structure is static.

---

## Group 11–29: Units

Units are the largest batch. Generate one unit type at a time, showing all 4 colors.

### Template for Each Unit

Replace `{UNIT_NAME}`, `{DESCRIPTION}`, `{IDLE_COUNT}`, `{MOVE_COUNT}`, `{WIDTH}`, `{HEIGHT}` with values from the table below.

**Prompt template:**

> [Style preamble]
>
> Generate sprite frames for the **{UNIT_NAME}** unit in a turn-based tactics game. The sprite is {WIDTH}x{HEIGHT} pixels with a transparent background.
>
> **Description**: {DESCRIPTION}
>
> Generate a grid: 4 rows (army colors) x ({IDLE_COUNT} + {MOVE_COUNT} x 3) columns.
>
> **Rows** — 4 faction colors:
> - Row 1: Orange Star — red/orange primary (#DD4444), cream highlights
> - Row 2: Blue Moon — blue primary (#4444DD), light blue highlights
> - Row 3: Green Earth — green primary (#44DD44), lime highlights
> - Row 4: Yellow Comet — gold primary (#DDDD44), pale yellow highlights
>
> **Columns** — left to right:
> - First {IDLE_COUNT} columns: **Idle animation** (facing downward/toward camera). Subtle bobbing, treads rolling, or rotors spinning depending on unit type. These loop.
> - Next {MOVE_COUNT} columns: **Move Down** (moving toward camera). Shows motion — wheels rolling, legs walking, rotors tilted forward.
> - Next {MOVE_COUNT} columns: **Move Side** (moving rightward). Profile view. This sprite gets flipped horizontally for leftward movement, so draw it facing RIGHT.
> - Last {MOVE_COUNT} columns: **Move Up** (moving away from camera). Shows the back/top of the unit in motion.
>
> All frames for one color must have the same silhouette bounding box. The unit should be clearly recognizable at 16x16 pixels — emphasize distinctive features (turret shape, rotor blades, hull profile). Use strong 1px dark outlines.

### Unit Table

| # | Unit Name | Description | Idle | Move/dir | Size | Key visual features |
|---|---|---|---|---|---|---|
| 11 | Infantry | Soldier on foot with rifle | 4 | 4 | 16x16 | Helmet, rifle, walking legs. Idle: slight march bob. Move: full walk cycle. |
| 12 | Mech | Heavy trooper with bazooka | 2 | 4 | 16x16 | Bulkier than infantry, bazooka on shoulder. Heavier walk cycle. |
| 13 | Recon | Light scout jeep | 4 | 3 | 16x16 | Small open-top jeep. Idle: engine idle wobble. Move: wheel spin. |
| 14 | APC | Armored transport truck | 4 | 3 | 16x16 | Box-shaped armored truck, no weapons visible. Larger than recon. |
| 15 | Tank | Light tank | 4 | 3 | 15x14 | Small tank with turret. Idle: turret scan. Move: treads rolling. |
| 16 | Medium Tank | Heavier tank, bigger turret | 4 | 3 | 16x16 | Larger tank, prominent cannon barrel. Beefier treads. |
| 17 | Artillery | Towed field cannon | 4 | 3 | 16x16 | Truck/platform with a long barrel cannon. Barrel is the key feature. |
| 18 | Rocket | Rocket launcher truck | 2 | 3 | 16x16 | Truck chassis with angled missile rack on back. Missiles pointing up/back. |
| 19 | Anti-Air | AA gun vehicle | 4 | 3 | 16x16 | Truck chassis with twin upward-pointing gun barrels. |
| 20 | Missile | SAM launcher vehicle | 2 | 3 | 16x16 | Large truck with big missile pod. Bulkier than rocket launcher. |
| 21 | T-Copter | Transport helicopter | 4 | 2 | 16x16 | Helicopter with cargo body, spinning rotor. Idle: rotor spin. Move: body tilts in direction. |
| 22 | B-Copter | Attack helicopter | 4 | 2 | 16x16 | Sleeker helicopter with missile pods on sides. Spinning rotor, more aggressive silhouette than T-Copter. |
| 23 | Fighter | Jet fighter | 2 | 3 | 16x16 | Swept-wing jet, single engine. Viewed from above in idle. Move: banks in travel direction. |
| 24 | Bomber | Heavy bomber | 2 | 3 | 16x16 | Wider/heavier aircraft than fighter. Broader wings, bulkier fuselage. |
| 25 | Stealth | Stealth aircraft | 2 | 3 | 16x16 | Angular/faceted stealth shape (like B-2 or F-117). Distinctive angular silhouette. |
| 26 | Lander | Landing craft | 2 | 2 | 16x15 | Flat-bottomed boat with bow ramp. Boxy naval transport shape. |
| 27 | Cruiser | Naval cruiser | 2 | 2 | 16x16 | Warship with visible deck guns and superstructure. |
| 28 | Submarine | Submarine | 4 | 2 | 16x13 | Cigar-shaped hull with conning tower. Mostly submerged look. |
| 29 | Carrier | Aircraft carrier | 2 | 2 | 16x16 | Flat flight deck, island superstructure on one side. Largest naval unit. |

---

## Post-Generation Assembly

After generating all groups, the individual outputs need to be assembled into atlas sheets:

1. **Terrain**: Combine Groups 1-5 into a single `awbw-terrain.png` horizontal strip. Generate the matching JSON atlas.
2. **Neutral buildings**: Group 5 goes into `neutral.png` along with any neutral-palette building static frames.
3. **Per-army sheets**: For each army color, combine that color's building frames (Groups 6-10) and unit frames (Groups 11-29) into a single `{army-name}.png` atlas with matching JSON.

The JSON atlas files can be generated programmatically once the sprite positions in the final packed sheet are known — see `docs/SPRITE_SPEC.md` for the JSON format.
