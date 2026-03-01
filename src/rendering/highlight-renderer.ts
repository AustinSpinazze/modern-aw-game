"use client";
// Selection and overlay highlights.

import { Container, Graphics } from "pixi.js";
import type { Vec2 } from "../game/types";
import { TILE_SIZE, TILE_SCALE } from "./pixi-app";

export class HighlightRenderer {
  private container: Container;

  constructor() {
    this.container = new Container();
    this.container.label = "highlights";
  }

  getContainer(): Container {
    return this.container;
  }

  clear(): void {
    this.container.removeChildren();
  }

  drawSelected(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0xffff00, 0.5); // yellow
  }

  drawReachable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0x4488ff, 0.35); // blue
  }

  drawAttackable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0xff4444, 0.35); // red
  }

  drawCursor(x: number, y: number): void {
    const size = TILE_SIZE * TILE_SCALE;
    const px = x * size;
    const py = y * size;

    const g = new Graphics();
    g.rect(px, py, size, size);
    g.stroke({ width: 2, color: 0xffffff });
    this.container.addChild(g);
  }

  private drawOverlay(tiles: Vec2[], color: number, alpha: number): void {
    const size = TILE_SIZE * TILE_SCALE;
    for (const tile of tiles) {
      const g = new Graphics();
      g.rect(tile.x * size, tile.y * size, size, size);
      g.fill({ color, alpha });
      this.container.addChild(g);
    }
  }
}
