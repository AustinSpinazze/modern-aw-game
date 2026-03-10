// Fog-of-war overlay renderer.
// Draws a semi-transparent dark overlay over tiles not visible to the current player.
// Terrain shows through so the map is readable; enemy units are hidden by UnitRenderer.
// Layer order: terrain → units → FOG → highlights/overlays → cursor

import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, TILE_SCALE } from "./pixi-app";

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px per tile on screen

// Dark blue-grey tint — terrain readable through it, clearly fogged
const FOG_COLOR = 0x050510;
const FOG_ALPHA = 0.65;

export class FogRenderer {
  private container: Container;

  constructor() {
    this.container = new Container();
    this.container.label = "fog";
  }

  getContainer(): Container {
    return this.container;
  }

  /** Render fog over tiles not visible to the current player.
   *  Pass null visibilityMap to clear all fog (fog disabled). */
  render(mapWidth: number, mapHeight: number, visibilityMap: boolean[][] | null): void {
    this.container.removeChildren();

    if (!visibilityMap) return; // fog off — nothing to draw

    // Use a single Graphics object with per-tile rect+fill pairs.
    // This matches the existing codebase pattern (CombatAnimator, HighlightRenderer)
    // and avoids Pixi v8 batching issues from calling fill() once after many rects.
    const g = new Graphics();
    let anyFog = false;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (visibilityMap[y][x]) continue; // visible — skip
        g.rect(x * DISPLAY, y * DISPLAY, DISPLAY, DISPLAY);
        g.fill({ color: FOG_COLOR, alpha: FOG_ALPHA });
        anyFog = true;
      }
    }

    if (anyFog) {
      this.container.addChild(g);
    }
  }

  clear(): void {
    this.container.removeChildren();
  }
}
