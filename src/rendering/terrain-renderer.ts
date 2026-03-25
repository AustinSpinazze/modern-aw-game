// Terrain renderer using WarsWorld sprite sheets.
// Terrain tiles are 16x16 in the sprite sheets, scaled up for display.
// Buildings use AnimatedSprite for idle animations.

import { AnimatedSprite, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { GameState, TileState } from "../game/types";
import { getTile } from "../game/game-state";
import { TILE_SIZE, TILE_SCALE, getSprite, getAnimation, fitMapToStage } from "./pixi-app";
import {
  TERRAIN_SPRITES,
  ROAD_SPRITE_MAP,
  RIVER_SPRITE_MAP,
  BRIDGE_SPRITES,
  BUILDING_ANIMATIONS,
  BUILDING_STATIC_FRAMES,
  BUILDING_ANIMATION_SPEED,
  FALLBACK_COLORS,
  getArmySheet,
} from "./sprite-mapping";

// Max capture points for a building
const MAX_CAPTURE_POINTS = 20;

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px per tile on screen

// Shallow-water sea colour used as the base layer under shoal direction sprites.
// Matches the sea-area colour of the patched shoal sprites (approx RGB 99,146,252).
const SHOAL_SEA_BG = 0x6392fc;

// Dark blue-grey tint applied to sprites on tiles that are in fog of war.
// Tinting multiplies each pixel channel, so 0x4a4a6e ≈ 29–43 % brightness with a
// slight blue cast — visually equivalent to the old 65 % dark overlay approach.
const FOG_TINT = 0x4a4a6e;

// ─── Bitmask direction constants ───────────────────────────────────────────
const N = 1,
  E = 2,
  S = 4,
  W = 8;

// ─── Auto-tiling helpers ────────────────────────────────────────────────────

function neighbors(
  state: GameState,
  x: number,
  y: number
): { n: TileState | null; e: TileState | null; s: TileState | null; w: TileState | null } {
  return {
    n: getTile(state, x, y - 1),
    e: getTile(state, x + 1, y),
    s: getTile(state, x, y + 1),
    w: getTile(state, x - 1, y),
  };
}

function bitmask(nb: ReturnType<typeof neighbors>, test: (t: TileState) => boolean): number {
  let m = 0;
  if (nb.n && test(nb.n)) m |= N;
  if (nb.e && test(nb.e)) m |= E;
  if (nb.s && test(nb.s)) m |= S;
  if (nb.w && test(nb.w)) m |= W;
  return m;
}

// Road tiles connect to roads and bridges
function isRoadLike(t: TileState): boolean {
  return t.terrain_type === "road" || t.terrain_type === "bridge";
}

// River tiles connect to river, sea, port (outlets to water)
function isRiverLike(t: TileState): boolean {
  return t.terrain_type === "river" || t.terrain_type === "sea" || t.terrain_type === "port";
}

// Sand only appears on the edge of a shoal tile that faces actual land.
// Water-type neighbors (sea, river, shoal, reef) do NOT get a sand strip —
// shoal-to-shoal edges are continuous shallow water; reef is in-water terrain.
// Port IS treated as land — it's a coastal building that sits on land at the shore.
function isLandForShoal(t: TileState): boolean {
  const tt = t.terrain_type;
  return tt !== "sea" && tt !== "river" && tt !== "shoal" && tt !== "reef";
}

// ─── Sprite key resolvers ───────────────────────────────────────────────────

function getRoadSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const mask = bitmask(nb, isRoadLike);
  return ROAD_SPRITE_MAP[mask] ?? "road-top-bottom.png";
}

function getRiverSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const mask = bitmask(nb, isRiverLike);
  return RIVER_SPRITE_MAP[mask] ?? "river-top-bottom.png";
}

function getBridgeSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const vConn = (nb.n && isRoadLike(nb.n)) || (nb.s && isRoadLike(nb.s));
  return vConn ? BRIDGE_SPRITES.vertical : BRIDGE_SPRITES.horizontal;
}

// ─── Shoal tile renderer ────────────────────────────────────────────────────

// ─── Building helpers ───────────────────────────────────────────────────────

const BUILDING_TYPES = new Set(["hq", "city", "factory", "airport", "port"]);

function isBuilding(terrainType: string): boolean {
  return BUILDING_TYPES.has(terrainType);
}

// ─── Transparent terrain (need base layer underneath) ───────────────────────
// These terrain types have transparent pixels and need plains drawn underneath
const TRANSPARENT_TERRAIN = new Set(["mountain", "forest"]);

// ─── Renderer class ─────────────────────────────────────────────────────────

export class TerrainRenderer {
  private container: Container;
  private captureOverlay: Container; // Renders on top of units

  constructor() {
    this.container = new Container();
    this.container.label = "terrain";
    this.captureOverlay = new Container();
    this.captureOverlay.label = "capture-overlay";
  }

  getContainer(): Container {
    return this.container;
  }

  getCaptureOverlay(): Container {
    return this.captureOverlay;
  }

  render(state: GameState, visibility?: boolean[][] | null): void {
    // Stop all AnimatedSprites (building animations) before removing to release ticker references
    for (const child of this.container.children) {
      if (child instanceof AnimatedSprite) child.stop();
    }
    this.container.removeChildren();
    this.captureOverlay.removeChildren();

    // First pass: draw terrain and buildings.
    // When fog is active, tint each fogged tile's sprites with FOG_TINT so terrain
    // is dim but still readable. This avoids a separate Graphics overlay layer which
    // can trigger Pixi v8 compositing-group issues in the Electron renderer.
    for (let y = 0; y < state.map_height; y++) {
      for (let x = 0; x < state.map_width; x++) {
        const tile = getTile(state, x, y)!;
        const px = x * DISPLAY;
        const py = y * DISPLAY;
        const fogged = visibility != null && !visibility[y][x];
        const childCountBefore = fogged ? this.container.children.length : 0;
        this.drawTile(state, tile, x, y, px, py, fogged);
        if (fogged) {
          for (let i = childCountBefore; i < this.container.children.length; i++) {
            (this.container.children[i] as Sprite).tint = FOG_TINT;
          }
        }
      }
    }

    // Second pass: draw capture indicators (on separate overlay, above units).
    // Skip tiles not visible to the current player — the capture icon would
    // reveal that an enemy unit is there even through fog.
    for (let y = 0; y < state.map_height; y++) {
      for (let x = 0; x < state.map_width; x++) {
        if (visibility && !visibility[y][x]) continue; // fogged — hide indicator
        const tile = getTile(state, x, y)!;
        if (isBuilding(tile.terrain_type) && tile.capture_points < MAX_CAPTURE_POINTS) {
          const px = x * DISPLAY;
          const py = y * DISPLAY;
          this.drawCaptureIndicator(tile.capture_points, px, py);
        }
      }
    }

    fitMapToStage(state.map_width, state.map_height);
  }

  private drawTile(
    state: GameState,
    tile: TileState,
    x: number,
    y: number,
    px: number,
    py: number,
    fogged = false
  ): void {
    const terrainType = tile.terrain_type;

    if (isBuilding(terrainType)) {
      // Buildings: draw plains underneath, then the building.
      // In fog of war, render as neutral (owner_id = -1) so the enemy's
      // captured buildings aren't revealed — matching Advance Wars rules.
      const effectiveOwner = fogged ? -1 : tile.owner_id;
      this.drawTerrainSprite("plains", px, py);
      this.drawBuildingSprite(terrainType, effectiveOwner, px, py);
    } else if (terrainType === "shoal") {
      // Shoal uses AWBW's layering technique: draw one directional sprite per
      // land-adjacent neighbor. The sea-colored areas are the same opaque color
      // across all 4 sprites, so stacking them composites correctly.
      this.drawShoalTile(state, x, y, px, py);
    } else if (terrainType === "reef") {
      // Reef sprites have transparency — draw sea underneath like AWBW does
      this.drawTerrainSprite("sea", px, py, "sea.png");
      this.drawTerrainSprite("reef", px, py, "reef.png");
    } else if (TRANSPARENT_TERRAIN.has(terrainType)) {
      // Mountains/forests have transparency - draw plains first
      this.drawTerrainSprite("plains", px, py);
      const spriteName = this.getTerrainSpriteName(state, tile, x, y);
      this.drawOverlaySprite(terrainType, px, py, spriteName);
    } else {
      // Regular terrain (no base layer needed)
      const spriteName = this.getTerrainSpriteName(state, tile, x, y);
      this.drawTerrainSprite(terrainType, px, py, spriteName);
    }
  }

  /**
   * Shoal auto-tiling using AWBW's layering technique.
   * For each neighbor that isn't deep water, draw the facing directional sprite.
   * All 4 sprites share the same sea-color background, so stacking them
   * composites correctly — N+W layers produce a NW corner beach, etc.
   */
  /**
   * Shoal auto-tiling using a patched AWBW sprite sheet.
   *
   * The shoal PNG frames have had their sea-area pixels made transparent and
   * shoal-w's stray right-edge sand column replaced with sea colour before
   * transparency was applied.  With transparent sea areas the direction sprites
   * only contribute sand pixels, so multiple beaches accumulate correctly on the
   * same tile without overwriting each other.
   *
   * Rendering order for a tile with at least one land neighbour:
   *   1. Solid SHOAL_SEA_BG rectangle  — shallow-water base colour
   *   2. sea.png at 45 % alpha         — adds the deep-sea wave texture at a
   *                                      reduced intensity so it reads as shallow
   *   3. Land-facing direction sprites  — only sand pixels show (sea is transparent)
   *
   * For a tile surrounded entirely by water the same base + wave is used with
   * no direction sprites, giving a consistent shallow-water appearance.
   */
  private drawShoalTile(state: GameState, x: number, y: number, px: number, py: number): void {
    const nb = neighbors(state, x, y);

    // Shallow-water base shared by all shoal tiles
    const bg = new Graphics();
    bg.rect(px, py, DISPLAY, DISPLAY);
    bg.fill(SHOAL_SEA_BG);
    this.container.addChild(bg);

    const seaTex = getSprite("awbw-terrain", "sea.png") ?? getSprite("neutral", "sea.png");
    if (seaTex) {
      const wave = new Sprite(seaTex);
      wave.x = px;
      wave.y = py;
      wave.width = DISPLAY;
      wave.height = DISPLAY;
      wave.alpha = 0.65;
      this.container.addChild(wave);
    }

    // Draw beach direction sprites (transparent sea areas — only sand renders)
    if (nb.n && isLandForShoal(nb.n)) this.drawTerrainSprite("shoal", px, py, "shoal-n.png");
    if (nb.s && isLandForShoal(nb.s)) this.drawTerrainSprite("shoal", px, py, "shoal-s.png");
    if (nb.e && isLandForShoal(nb.e)) this.drawTerrainSprite("shoal", px, py, "shoal-e.png");
    if (nb.w && isLandForShoal(nb.w)) this.drawTerrainSprite("shoal", px, py, "shoal-w.png");
  }

  private getTerrainSpriteName(
    state: GameState,
    tile: TileState,
    x: number,
    y: number
  ): string | null {
    switch (tile.terrain_type) {
      case "road":
        return getRoadSprite(state, x, y);
      case "river":
        return getRiverSprite(state, x, y);
      case "bridge":
        return getBridgeSprite(state, x, y);
      case "plains":
        return TERRAIN_SPRITES.plains;
      case "forest":
        return TERRAIN_SPRITES.forest;
      case "mountain":
        return TERRAIN_SPRITES.mountain;
      case "sea":
        return TERRAIN_SPRITES.sea;
      case "shoal":
        return TERRAIN_SPRITES.shoal;
      case "reef":
        return TERRAIN_SPRITES.reef;
      default:
        return TERRAIN_SPRITES.plains;
    }
  }

  private drawTerrainSprite(
    terrainType: string,
    px: number,
    py: number,
    spriteName?: string | null
  ): void {
    const frameName = spriteName ?? TERRAIN_SPRITES[terrainType] ?? "plain.png";
    const tex = getSprite("awbw-terrain", frameName) ?? getSprite("neutral", frameName);

    if (tex) {
      const sprite = new Sprite(tex);
      sprite.x = px;
      sprite.y = py;
      sprite.width = DISPLAY;
      sprite.height = DISPLAY;
      this.container.addChild(sprite);
    } else {
      // Fallback: solid color
      this.drawFallback(terrainType, px, py);
    }
  }

  /**
   * Draw terrain sprites that may extend outside the 16x16 tile (mountains, forests).
   * These are anchored at the bottom of the tile so taller sprites render correctly.
   */
  private drawOverlaySprite(
    terrainType: string,
    px: number,
    py: number,
    spriteName?: string | null
  ): void {
    const frameName = spriteName ?? TERRAIN_SPRITES[terrainType] ?? "plain.png";
    const tex = getSprite("awbw-terrain", frameName) ?? getSprite("neutral", frameName);

    if (tex) {
      const sprite = new Sprite(tex);
      sprite.x = px;
      // Anchor at bottom - the sprite may be taller than TILE_SIZE
      const scaledHeight = tex.height * TILE_SCALE;
      sprite.y = py + DISPLAY - scaledHeight;
      sprite.width = DISPLAY;
      sprite.height = scaledHeight;
      this.container.addChild(sprite);
    } else {
      // Fallback: solid color
      this.drawFallback(terrainType, px, py);
    }
  }

  private drawBuildingSprite(buildingType: string, ownerId: number, px: number, py: number): void {
    const isOwned = ownerId >= 0;
    const sheetKey = isOwned ? getArmySheet(ownerId) : "neutral";
    const animationName = BUILDING_ANIMATIONS[buildingType];

    if (!animationName) {
      this.drawBuildingFallback(buildingType, ownerId, px, py);
      return;
    }

    // For owned buildings, try animated sprite first
    if (isOwned) {
      const frames = getAnimation(sheetKey, animationName);
      if (frames && frames.length > 0) {
        const sprite = new AnimatedSprite(frames);
        sprite.animationSpeed = BUILDING_ANIMATION_SPEED;
        sprite.play();

        sprite.x = px;
        const frameHeight = frames[0].height;
        const scaledHeight = frameHeight * TILE_SCALE;
        sprite.y = py + DISPLAY - scaledHeight;
        sprite.width = DISPLAY;
        sprite.height = scaledHeight;

        this.container.addChild(sprite);
        return;
      }
    }

    // For neutral buildings (or if animation failed), use static sprite
    const frameName = BUILDING_STATIC_FRAMES[buildingType];
    const tex = frameName ? getSprite(sheetKey, frameName) : null;

    if (tex) {
      const sprite = new Sprite(tex);
      sprite.x = px;
      const scaledHeight = tex.height * TILE_SCALE;
      sprite.y = py + DISPLAY - scaledHeight;
      sprite.width = DISPLAY;
      sprite.height = scaledHeight;
      this.container.addChild(sprite);
    } else {
      // Final fallback: colored rectangle
      this.drawBuildingFallback(buildingType, ownerId, px, py);
    }
  }

  private drawFallback(terrainType: string, px: number, py: number): void {
    const color = FALLBACK_COLORS[terrainType] ?? 0x888888;
    const g = new Graphics();
    g.rect(px, py, DISPLAY, DISPLAY);
    g.fill(color);
    g.stroke({ color: 0x000000, width: 0.5, alpha: 0.35 });
    this.container.addChild(g);
  }

  private drawBuildingFallback(
    buildingType: string,
    ownerId: number,
    px: number,
    py: number
  ): void {
    // Team colors for fallback
    const teamColors: Record<number, number> = {
      0: 0xdd4444, // Red
      1: 0x4444dd, // Blue
      2: 0x44dd44, // Green
      3: 0xdddd44, // Yellow
    };

    const baseColor = FALLBACK_COLORS[buildingType] ?? 0x888888;
    const borderColor = ownerId >= 0 ? (teamColors[ownerId] ?? 0x888888) : 0x888888;

    const g = new Graphics();
    g.rect(px + 4, py + 4, DISPLAY - 8, DISPLAY - 8);
    g.fill(baseColor);
    g.stroke({ color: borderColor, width: 3 });
    this.container.addChild(g);
  }

  /**
   * Draw capture indicator on a building being captured.
   * Shows a small "C" badge in the bottom-left corner (AWBW style).
   * Drawn on captureOverlay so it appears above units.
   */
  private drawCaptureIndicator(capturePoints: number, px: number, py: number): void {
    const g = new Graphics();

    // Small square badge in bottom-left corner
    const badgeSize = 14;
    const badgeX = px + 2;
    const badgeY = py + DISPLAY - badgeSize - 2;

    // Badge background (orange/yellow square)
    g.rect(badgeX, badgeY, badgeSize, badgeSize);
    g.fill(0xffaa00);
    g.rect(badgeX, badgeY, badgeSize, badgeSize);
    g.stroke({ color: 0x000000, width: 1.5 });

    this.captureOverlay.addChild(g);

    // "C" letter for capture
    const textStyle = new TextStyle({
      fontSize: 10,
      fontFamily: "Arial",
      fontWeight: "bold",
      fill: 0x000000,
    });
    const text = new Text({ text: "C", style: textStyle });
    text.x = badgeX + 3;
    text.y = badgeY + 1;
    this.captureOverlay.addChild(text);
  }
}
