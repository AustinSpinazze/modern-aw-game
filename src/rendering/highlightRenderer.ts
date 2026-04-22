/**
 * Move range, attack range, selection cursor, and path preview **overlays** (Pixi Graphics).
 */

import { Container, Graphics } from "pixi.js";
import type { Vec2 } from "../game/types";
import { TILE_SIZE, TILE_SCALE } from "./pixiApp";

const DISPLAY = TILE_SIZE * TILE_SCALE;

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
    for (const child of this.container.children) child.destroy();
    this.container.removeChildren();
  }

  drawSelected(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0xffff00, 0.5); // yellow
  }

  drawReachable(tiles: Vec2[]): void {
    // Brighter, more visible blue like AWBW
    this.drawOverlay(tiles, 0x88ccff, 0.55);
  }

  drawAttackable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0xff4444, 0.45); // red
  }

  drawUnloadable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0x44ddaa, 0.55); // teal-green
  }

  // Preview overlays (right-click range inspect) — visually distinct from selection
  drawPreviewReachable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0x44aaff, 0.35); // lighter blue
  }

  drawPreviewAttackable(tiles: Vec2[]): void {
    this.drawOverlay(tiles, 0xff8800, 0.35); // orange (distinct from attack-mode red)
  }

  /**
   * Advance Wars–style AoE frame: L-brackets on the bounding box of affected tiles
   * plus a center crosshair (no filled tile wash).
   */
  drawBlastReticle(tiles: Vec2[], color = 0xffff00): void {
    if (tiles.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
    }

    const left = minX * DISPLAY;
    const top = minY * DISPLAY;
    const wPx = (maxX - minX + 1) * DISPLAY;
    const hPx = (maxY - minY + 1) * DISPLAY;
    const inset = 3;
    const cornerLen = Math.min(
      12 * TILE_SCALE,
      Math.max(8 * TILE_SCALE, Math.floor(Math.min(wPx, hPx) * 0.2))
    );
    const lineWidth = 2;
    const cx = left + wPx / 2;
    const cy = top + hPx / 2;
    const crossArm = Math.min(10 * TILE_SCALE, Math.floor(Math.min(wPx, hPx) * 0.18));

    const g = new Graphics();

    // Top-left
    g.moveTo(left + inset, top + inset + cornerLen);
    g.lineTo(left + inset, top + inset);
    g.lineTo(left + inset + cornerLen, top + inset);

    // Top-right
    g.moveTo(left + wPx - inset - cornerLen, top + inset);
    g.lineTo(left + wPx - inset, top + inset);
    g.lineTo(left + wPx - inset, top + inset + cornerLen);

    // Bottom-left
    g.moveTo(left + inset, top + hPx - inset - cornerLen);
    g.lineTo(left + inset, top + hPx - inset);
    g.lineTo(left + inset + cornerLen, top + hPx - inset);

    // Bottom-right
    g.moveTo(left + wPx - inset - cornerLen, top + hPx - inset);
    g.lineTo(left + wPx - inset, top + hPx - inset);
    g.lineTo(left + wPx - inset, top + hPx - inset - cornerLen);

    // Center crosshair (interrupted slightly like a scope reticle)
    const gap = Math.max(3, 2 * TILE_SCALE);
    g.moveTo(cx - crossArm, cy);
    g.lineTo(cx - gap, cy);
    g.moveTo(cx + gap, cy);
    g.lineTo(cx + crossArm, cy);
    g.moveTo(cx, cy - crossArm);
    g.lineTo(cx, cy - gap);
    g.moveTo(cx, cy + gap);
    g.lineTo(cx, cy + crossArm);

    g.stroke({ width: lineWidth, color });
    this.container.addChild(g);
  }

  // Draw AWBW-style targeting cursor (corner brackets)
  drawTargetCursor(x: number, y: number): void {
    const px = x * DISPLAY;
    const py = y * DISPLAY;
    const cornerLen = 10 * TILE_SCALE; // Length of each corner bracket arm
    const inset = 3;
    const lineWidth = 2;

    const g = new Graphics();

    // Top-left corner (└ rotated)
    g.moveTo(px + inset, py + inset + cornerLen);
    g.lineTo(px + inset, py + inset);
    g.lineTo(px + inset + cornerLen, py + inset);

    // Top-right corner (┘ rotated)
    g.moveTo(px + DISPLAY - inset - cornerLen, py + inset);
    g.lineTo(px + DISPLAY - inset, py + inset);
    g.lineTo(px + DISPLAY - inset, py + inset + cornerLen);

    // Bottom-left corner (┌ rotated)
    g.moveTo(px + inset, py + DISPLAY - inset - cornerLen);
    g.lineTo(px + inset, py + DISPLAY - inset);
    g.lineTo(px + inset + cornerLen, py + DISPLAY - inset);

    // Bottom-right corner (┐ rotated)
    g.moveTo(px + DISPLAY - inset - cornerLen, py + DISPLAY - inset);
    g.lineTo(px + DISPLAY - inset, py + DISPLAY - inset);
    g.lineTo(px + DISPLAY - inset, py + DISPLAY - inset - cornerLen);

    g.stroke({ width: lineWidth, color: 0xffff00 }); // Yellow like AWBW
    this.container.addChild(g);
  }

  // Draw the movement path arrow - starts outside the unit tile, ends at edge of destination
  drawPath(path: Vec2[]): void {
    if (path.length < 2) return;

    const half = DISPLAY / 2;
    const lineWidth = 4 * TILE_SCALE; // Smaller arrow width (was 8)
    const borderWidth = 1.5;

    // Build list of center points for intermediate tiles (skip first AND last)
    const points: { x: number; y: number }[] = [];
    for (let i = 1; i < path.length - 1; i++) {
      points.push({
        x: path[i].x * DISPLAY + half,
        y: path[i].y * DISPLAY + half,
      });
    }

    // Start point is OUTSIDE unit's tile (at the border between tiles)
    const unitTile = path[0];
    const firstTile = path[1];
    const startDx = firstTile.x - unitTile.x;
    const startDy = firstTile.y - unitTile.y;

    // Start from the first path tile's edge (not unit's edge) to avoid overlap
    const startX = firstTile.x * DISPLAY + half - startDx * half;
    const startY = firstTile.y * DISPLAY + half - startDy * half;

    // End point is at the EDGE of destination tile (not center) to avoid overlap with ghost unit
    const lastTile = path[path.length - 1];
    const prevTile = path[path.length - 2];
    const endDx = lastTile.x - prevTile.x;
    const endDy = lastTile.y - prevTile.y;

    // Stop at the edge of the destination tile
    const endX = lastTile.x * DISPLAY + half - endDx * half;
    const endY = lastTile.y * DISPLAY + half - endDy * half;

    // Build full point list: start -> intermediates -> end
    const allPoints = [{ x: startX, y: startY }, ...points, { x: endX, y: endY }];

    // Draw border/outline first (underneath) - straight edges
    const gBorder = new Graphics();
    gBorder.moveTo(allPoints[0].x, allPoints[0].y);
    for (let i = 1; i < allPoints.length; i++) {
      gBorder.lineTo(allPoints[i].x, allPoints[i].y);
    }
    gBorder.stroke({
      width: lineWidth + borderWidth * 2,
      color: 0x886600,
      cap: "butt",
      join: "miter",
    });
    this.container.addChild(gBorder);

    // Draw the main path line - straight edges
    const g = new Graphics();
    g.moveTo(allPoints[0].x, allPoints[0].y);
    for (let i = 1; i < allPoints.length; i++) {
      g.lineTo(allPoints[i].x, allPoints[i].y);
    }
    g.stroke({ width: lineWidth, color: 0xffdd44, cap: "butt", join: "miter" });
    this.container.addChild(g);

    // Draw arrowhead at the edge of destination tile
    this.drawArrowhead(endX, endY, endDx, endDy, lineWidth, borderWidth);
    // Note: Targeting cursor is drawn separately by cursorOverlay
  }

  private drawArrowhead(
    x: number,
    y: number,
    dx: number,
    dy: number,
    width: number,
    borderWidth: number
  ): void {
    const size = width * 2.2;

    // Points for the triangle
    let tip: { x: number; y: number };
    let left: { x: number; y: number };
    let right: { x: number; y: number };

    if (dx === 1) {
      // Right
      tip = { x: x + size * 0.5, y: y };
      left = { x: x - size * 0.3, y: y - size * 0.5 };
      right = { x: x - size * 0.3, y: y + size * 0.5 };
    } else if (dx === -1) {
      // Left
      tip = { x: x - size * 0.5, y: y };
      left = { x: x + size * 0.3, y: y + size * 0.5 };
      right = { x: x + size * 0.3, y: y - size * 0.5 };
    } else if (dy === 1) {
      // Down
      tip = { x: x, y: y + size * 0.5 };
      left = { x: x + size * 0.5, y: y - size * 0.3 };
      right = { x: x - size * 0.5, y: y - size * 0.3 };
    } else {
      // Up
      tip = { x: x, y: y - size * 0.5 };
      left = { x: x - size * 0.5, y: y + size * 0.3 };
      right = { x: x + size * 0.5, y: y + size * 0.3 };
    }

    // Draw filled triangle
    const gFill = new Graphics();
    gFill.moveTo(tip.x, tip.y);
    gFill.lineTo(left.x, left.y);
    gFill.lineTo(right.x, right.y);
    gFill.closePath();
    gFill.fill({ color: 0xffdd44 });
    this.container.addChild(gFill);

    // Draw border on outer edges only (tip to left, tip to right) - NOT the base
    const gBorder = new Graphics();
    gBorder.moveTo(left.x, left.y);
    gBorder.lineTo(tip.x, tip.y);
    gBorder.lineTo(right.x, right.y);
    // Don't close - leave base open
    gBorder.stroke({ width: borderWidth, color: 0x886600, cap: "butt", join: "miter" });
    this.container.addChild(gBorder);
  }

  // Draw a subtle grid over the entire map to help players count tiles
  drawGrid(mapWidth: number, mapHeight: number): void {
    const g = new Graphics();
    const totalW = mapWidth * DISPLAY;
    const totalH = mapHeight * DISPLAY;

    // Vertical lines
    for (let x = 0; x <= mapWidth; x++) {
      g.moveTo(x * DISPLAY, 0);
      g.lineTo(x * DISPLAY, totalH);
    }
    // Horizontal lines
    for (let y = 0; y <= mapHeight; y++) {
      g.moveTo(0, y * DISPLAY);
      g.lineTo(totalW, y * DISPLAY);
    }
    g.stroke({ color: 0x000000, alpha: 0.015, width: 1 });
    this.container.addChild(g);
  }

  private drawOverlay(tiles: Vec2[], color: number, alpha: number): void {
    if (tiles.length === 0) return;
    const g = new Graphics();
    for (const tile of tiles) {
      g.rect(tile.x * DISPLAY, tile.y * DISPLAY, DISPLAY, DISPLAY);
      g.fill({ color, alpha });
    }
    this.container.addChild(g);
  }
}
