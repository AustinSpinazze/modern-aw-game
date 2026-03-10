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
  private graphics: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = "fog";
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  getContainer(): Container {
    return this.container;
  }

  /** Render fog over tiles not visible to the current player.
   *  Pass null visibilityMap to clear all fog (fog disabled). */
  render(mapWidth: number, mapHeight: number, visibilityMap: boolean[][] | null): void {
    this.graphics.clear();
    if (!visibilityMap) return;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (visibilityMap[y][x]) continue;
        this.graphics.rect(x * DISPLAY, y * DISPLAY, DISPLAY, DISPLAY);
        this.graphics.fill({ color: FOG_COLOR, alpha: FOG_ALPHA });
      }
    }
  }

  clear(): void {
    this.graphics.clear();
  }
}
