/**
 * Maps **pointer events** from the Pixi canvas to grid {@link Vec2} tile coords (click, hover, right-click).
 */

import type { Application } from "pixi.js";
import { TILE_SIZE, TILE_SCALE } from "./pixi-app";
import type { Vec2 } from "../game/types";

export type TileCallback = (pos: Vec2) => void;
export type TileRightClickCallback = (pos: Vec2 | null) => void;

export class InputHandler {
  private app: Application;
  private onTileClick: TileCallback;
  private onTileHover: TileCallback;
  private onTileRightClick: TileRightClickCallback;
  private mapWidth = 0;
  private mapHeight = 0;

  constructor(
    app: Application,
    onTileClick: TileCallback,
    onTileHover: TileCallback,
    onTileRightClick: TileRightClickCallback
  ) {
    this.app = app;
    this.onTileClick = onTileClick;
    this.onTileHover = onTileHover;
    this.onTileRightClick = onTileRightClick;

    this.app.canvas.addEventListener("click", this.handleClick);
    this.app.canvas.addEventListener("mousemove", this.handleMove);
    this.app.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.app.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.app.canvas.addEventListener("contextmenu", this.suppressContextMenu);
  }

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  destroy(): void {
    this.app.canvas.removeEventListener("click", this.handleClick);
    this.app.canvas.removeEventListener("mousemove", this.handleMove);
    this.app.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.app.canvas.removeEventListener("mouseup", this.handleMouseUp);
    this.app.canvas.removeEventListener("contextmenu", this.suppressContextMenu);
  }

  private handleClick = (e: MouseEvent): void => {
    const pos = this.eventToTile(e);
    if (pos) this.onTileClick(pos);
  };

  private handleMove = (e: MouseEvent): void => {
    const pos = this.eventToTile(e);
    if (pos) this.onTileHover(pos);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 2) return;
    const pos = this.eventToTile(e);
    if (pos) this.onTileRightClick(pos);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button !== 2) return;
    this.onTileRightClick(null); // null signals "release — clear preview"
  };

  // Suppress the browser context menu while right-click is used for range preview
  private suppressContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private eventToTile(e: MouseEvent): Vec2 | null {
    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();

    // Stay in CSS logical pixel space — stage position/scale from fitMapToStage
    // are computed from renderer.width/height which (with autoDensity) are logical.
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Account for stage offset and scale set by fitMapToStage
    const stage = this.app.stage;
    const stageScale = stage.scale.x; // uniform scale
    const stageX = stage.x;
    const stageY = stage.y;

    // World pixel within the stage (before stage scale)
    const worldX = (canvasX - stageX) / stageScale;
    const worldY = (canvasY - stageY) / stageScale;

    const tileDisplaySize = TILE_SIZE * TILE_SCALE;
    const tileX = Math.floor(worldX / tileDisplaySize);
    const tileY = Math.floor(worldY / tileDisplaySize);

    // Return null if click is outside the map bounds
    if (worldX < 0 || worldY < 0 || tileX < 0 || tileY < 0) return null;
    if (this.mapWidth > 0 && tileX >= this.mapWidth) return null;
    if (this.mapHeight > 0 && tileY >= this.mapHeight) return null;

    return { x: tileX, y: tileY };
  }
}
