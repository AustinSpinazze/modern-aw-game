/**
 * Renders **terrain + buildings** from {@link ./spriteMapping} (bitmask roads/rivers, HQ animations).
 * Applies fog tinting when enabled — see {@link ./fogRenderer} for historical no-op overlay.
 */

import { AnimatedSprite, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { GameState, TileState } from "../game/types";
import { getTile } from "../game/gameState";
import { TILE_SIZE, TILE_SCALE, getSprite, getAnimation, fitMapToStage } from "./pixiApp";
import {
  TERRAIN_SPRITES,
  ROAD_SPRITE_MAP,
  RIVER_SPRITE_MAP,
  PIPE_SPRITE_MAP,
  BRIDGE_SPRITES,
  BUILDING_ANIMATIONS,
  BUILDING_STATIC_FRAMES,
  BUILDING_ANIMATION_SPEED,
  FALLBACK_COLORS,
  SILO_SPRITE_FRAMES,
  getArmySheet,
} from "./spriteMapping";

// Max capture points for a building
const MAX_CAPTURE_POINTS = 20;

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px per tile on screen

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

// Intact pipe network (Piperunner tiles + seams). Broken seams are passable ground, not pipe.
function isPipeNetwork(t: TileState): boolean {
  return t.terrain_type === "pipe" || t.terrain_type === "pipe_seam";
}

// AWBW base-3 shoal encoding: each cardinal neighbor gets a value
//   0 = water (sea, reef)
//   1 = transition (shoal, bridge, river-connected-edge)
//   2 = land (everything else)
// total = top*1 + left*3 + right*9 + bottom*27  → "shoalNN.png"
const WATER_TERRAIN = new Set(["sea", "reef"]);
const TRANSITION_TERRAIN = new Set(["shoal"]);

function shoalNeighborValue(t: TileState | null): number {
  if (!t) return 0;
  const tt = t.terrain_type;
  if (WATER_TERRAIN.has(tt)) return 0;
  if (TRANSITION_TERRAIN.has(tt)) return 1;
  if (tt === "bridge") return 1;
  if (tt === "river") return 2;
  return 2;
}

// Sea auto-tiling: 8-directional bitmask
// Bit layout: NW=0, N=1, NE=2, E=3, SE=4, S=5, SW=6, W=7
// Terrain types that are "water" — sea shows no coastline toward these
const SEA_WATER_TYPES = new Set(["sea", "reef", "bridge", "shoal", "river"]);

function isWaterForSea(t: TileState | null): boolean {
  if (!t) return true;
  return SEA_WATER_TYPES.has(t.terrain_type);
}

const SEA_DIRS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

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

function getPipeSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const mask = bitmask(nb, isPipeNetwork);
  return PIPE_SPRITE_MAP[mask] ?? "pipe-top-bottom.png";
}

/** Vertical seam if N/S neighbor is pipe network; else horizontal (E/W). */
function getPipeSeamSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const vConn = (nb.n && isPipeNetwork(nb.n)) || (nb.s && isPipeNetwork(nb.s));
  return vConn ? "pipeseam-top-bottom.png" : "pipeseam-right-left.png";
}

function getBrokenPipeSeamSprite(state: GameState, x: number, y: number): string {
  const nb = neighbors(state, x, y);
  const vConn = (nb.n && isPipeNetwork(nb.n)) || (nb.s && isPipeNetwork(nb.s));
  return vConn ? "plain-broken-pipe-top-bottom.png" : "plain-broken-pipe-right-left.png";
}

// ─── Shoal tile renderer ────────────────────────────────────────────────────

// ─── Building helpers ───────────────────────────────────────────────────────

const BUILDING_TYPES = new Set(["hq", "city", "factory", "airport", "port", "comms_tower", "lab"]);

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
    } else if (terrainType === "sea") {
      this.drawSeaTile(state, x, y, px, py);
    } else if (terrainType === "shoal") {
      this.drawShoalTile(state, x, y, px, py);
    } else if (terrainType === "reef") {
      this.drawSeaTile(state, x, y, px, py);
      this.drawTerrainSprite("reef", px, py, "reef.png");
    } else if (terrainType === "missile_silo" || terrainType === "empty_silo") {
      const frame = SILO_SPRITE_FRAMES[terrainType];
      if (frame) {
        this.drawTerrainSprite(terrainType, px, py, frame);
      } else {
        this.drawTerrainSprite("plains", px, py);
      }
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
   * Shoal rendering using AWBW's base-3 encoding.
   * Each cardinal neighbor contributes a ternary value (0=water, 1=transition, 2=land).
   * total = top*1 + left*3 + right*9 + bottom*27 selects one of 81 pre-rendered tiles.
   */
  private drawShoalTile(state: GameState, x: number, y: number, px: number, py: number): void {
    const nb = neighbors(state, x, y);
    const top = shoalNeighborValue(nb.n);
    const left = shoalNeighborValue(nb.w);
    const right = shoalNeighborValue(nb.e);
    const bottom = shoalNeighborValue(nb.s);
    const total = top + left * 3 + right * 9 + bottom * 27;
    this.drawTerrainSprite("shoal", px, py, `shoal${total}.png`);
  }

  /**
   * Sea auto-tiling using AWBW's 8-directional bitmask.
   * Each of 8 neighbors (NW,N,NE,E,SE,S,SW,W) contributes a bit if it's land.
   * Diagonal bits are suppressed when either adjacent cardinal is already land,
   * since the cardinal coastline already covers that edge.
   * Result selects one of 47 pre-rendered sea tiles.
   */
  private drawSeaTile(state: GameState, x: number, y: number, px: number, py: number): void {
    let total = 0;
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = SEA_DIRS[k];
      const tile = getTile(state, x + dx, y + dy);
      if (!isWaterForSea(tile)) {
        total |= 1 << k;
      }
    }
    total &= ~(((total << 1) | (total >> 1) | (total >> 7)) & 0x55);
    this.drawTerrainSprite("sea", px, py, `sea${total}.png`);
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
      case "pipe":
        return getPipeSprite(state, x, y);
      case "pipe_seam":
        return getPipeSeamSprite(state, x, y);
      case "broken_pipe_seam":
        return getBrokenPipeSeamSprite(state, x, y);
      case "plains":
        return TERRAIN_SPRITES.plains;
      case "forest":
        return TERRAIN_SPRITES.forest;
      case "mountain":
        return TERRAIN_SPRITES.mountain;
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
    const tex = getSprite("terrain", frameName) ?? getSprite("neutral", frameName);

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
    const tex = getSprite("terrain", frameName) ?? getSprite("neutral", frameName);

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
  private drawCaptureIndicator(_capturePoints: number, px: number, py: number): void {
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
