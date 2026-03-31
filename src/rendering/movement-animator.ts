/**
 * **Movement playback**: steps units along a path with directional {@link sprite-mapping} animations.
 */

import { AnimatedSprite, Container } from "pixi.js";
import type { Vec2 } from "../game/types";
import { TILE_SIZE, TILE_SCALE, getAnimation } from "./pixi-app";
import { UNIT_ANIMATIONS, UNIT_MOVE_DIRECTIONS, getArmySheet } from "./sprite-mapping";

const DISPLAY = TILE_SIZE * TILE_SCALE;

// Movement timing: frames per tile (at 60fps)
// Higher = slower movement. 12 frames = 5 tiles per second
const FRAMES_PER_TILE = 12;

type MoveDirection = "up" | "down" | "left" | "right";

interface MovementAnimation {
  unitType: string;
  ownerId: number;
  path: Vec2[];
  currentIndex: number; // which segment we're on (0 = first tile to second tile)
  progress: number; // 0 to 1 progress through current segment
  sprite: AnimatedSprite | null;
  onComplete: () => void;
}

export class MovementAnimator {
  private container: Container;
  private activeAnimation: MovementAnimation | null = null;
  private frameCount: number = 0;

  constructor() {
    this.container = new Container();
    this.container.label = "movement-animation";
  }

  getContainer(): Container {
    return this.container;
  }

  /** Check if an animation is currently playing */
  isAnimating(): boolean {
    return this.activeAnimation !== null;
  }

  /** Returns the current world-pixel position (center) of the animating unit, or null. */
  getActiveWorldPos(): { x: number; y: number } | null {
    const sprite = this.activeAnimation?.sprite;
    if (!sprite) return null;
    return { x: sprite.x + DISPLAY / 2, y: sprite.y + DISPLAY / 2 };
  }

  /** Start animating a unit along a path. Calls onComplete when done. */
  animate(unitType: string, ownerId: number, path: Vec2[], onComplete: () => void): void {
    if (path.length < 2) {
      onComplete();
      return;
    }

    // Clean up any existing animation
    this.container.removeChildren();
    this.frameCount = 0;

    // Determine initial direction
    const direction = this.getDirection(path[0], path[1]);

    // Create sprite with movement animation
    const sprite = this.createSprite(unitType, ownerId, direction);

    if (sprite) {
      sprite.x = path[0].x * DISPLAY;
      sprite.y = path[0].y * DISPLAY;
      this.container.addChild(sprite);
    }

    this.activeAnimation = {
      unitType,
      ownerId,
      path,
      currentIndex: 0, // segment 0 = from path[0] to path[1]
      progress: 0,
      sprite,
      onComplete,
    };
  }

  /** Call this every frame to update the animation */
  update(): void {
    if (!this.activeAnimation) return;

    const anim = this.activeAnimation;
    this.frameCount++;

    // Calculate progress through current segment
    anim.progress += 1 / FRAMES_PER_TILE;

    if (anim.progress >= 1) {
      // Completed this segment, move to next
      anim.progress = 0;
      anim.currentIndex++;

      // Check if we've completed all segments
      if (anim.currentIndex >= anim.path.length - 1) {
        // Snap to final position and complete
        if (anim.sprite) {
          const final = anim.path[anim.path.length - 1];
          anim.sprite.x = final.x * DISPLAY;
          anim.sprite.y = final.y * DISPLAY;
        }
        this.complete();
        return;
      }

      // Update sprite direction for next segment
      const from = anim.path[anim.currentIndex];
      const to = anim.path[anim.currentIndex + 1];
      const nextDir = this.getDirection(from, to);
      this.updateSpriteDirection(anim, nextDir);
    }

    // Interpolate position between current and next tile
    const fromTile = anim.path[anim.currentIndex];
    const toTile = anim.path[anim.currentIndex + 1];

    if (!toTile) {
      this.complete();
      return;
    }

    const fromX = fromTile.x * DISPLAY;
    const fromY = fromTile.y * DISPLAY;
    const toX = toTile.x * DISPLAY;
    const toY = toTile.y * DISPLAY;

    // Linear interpolation
    const x = fromX + (toX - fromX) * anim.progress;
    const y = fromY + (toY - fromY) * anim.progress;

    if (anim.sprite) {
      anim.sprite.x = x;
      anim.sprite.y = y;
    }
  }

  /** Cancel any active animation */
  cancel(): void {
    if (this.activeAnimation) {
      this.container.removeChildren();
      this.activeAnimation = null;
    }
  }

  private complete(): void {
    const anim = this.activeAnimation;
    if (!anim) return;

    this.container.removeChildren();
    const callback = anim.onComplete;
    this.activeAnimation = null;
    callback();
  }

  private getDirection(from: Vec2, to: Vec2): MoveDirection {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (dy < 0) return "up";
    if (dy > 0) return "down";
    if (dx < 0) return "left";
    if (dx > 0) return "right";
    return "down"; // Default
  }

  private createSprite(
    unitType: string,
    ownerId: number,
    direction: MoveDirection
  ): AnimatedSprite | null {
    const sheetKey = getArmySheet(ownerId);
    const baseAnim = UNIT_ANIMATIONS[unitType];
    if (!baseAnim) return null;

    // Get movement animation: e.g., "infantry-mup"
    const dirSuffix = UNIT_MOVE_DIRECTIONS[direction];
    const animName = `${baseAnim}-${dirSuffix}`;

    const frames = getAnimation(sheetKey, animName);
    if (!frames || frames.length === 0) {
      // Fallback to idle animation
      const idleFrames = getAnimation(sheetKey, baseAnim);
      if (!idleFrames || idleFrames.length === 0) return null;

      const sprite = new AnimatedSprite(idleFrames);
      // Sync animation to movement: complete one cycle per tile
      // 4 frames per cycle, FRAMES_PER_TILE frames per tile
      // animationSpeed = frames per game frame = 4 / FRAMES_PER_TILE
      sprite.animationSpeed = 4 / FRAMES_PER_TILE;
      sprite.width = DISPLAY;
      sprite.height = DISPLAY;
      sprite.play();
      return sprite;
    }

    const sprite = new AnimatedSprite(frames);
    // Sync animation to movement: complete one cycle per tile
    // animationSpeed = animation frames / game frames per tile
    sprite.animationSpeed = frames.length / FRAMES_PER_TILE;
    sprite.width = DISPLAY;
    sprite.height = DISPLAY;

    // Flip sprite for left movement (mside is right-facing)
    if (direction === "left") {
      sprite.scale.x = -1;
      sprite.anchor.x = 1; // Adjust anchor for flipped sprite
    }

    sprite.play();
    return sprite;
  }

  private updateSpriteDirection(anim: MovementAnimation, direction: MoveDirection): void {
    if (!anim.sprite) return;

    // Calculate current position from path and progress
    const fromTile = anim.path[anim.currentIndex];
    const toTile = anim.path[anim.currentIndex + 1];

    let x = fromTile.x * DISPLAY;
    let y = fromTile.y * DISPLAY;

    if (toTile) {
      x += (toTile.x * DISPLAY - x) * anim.progress;
      y += (toTile.y * DISPLAY - y) * anim.progress;
    }

    // Remove old sprite
    this.container.removeChildren();

    // Create new sprite with updated direction
    const newSprite = this.createSprite(anim.unitType, anim.ownerId, direction);
    if (newSprite) {
      newSprite.x = x;
      newSprite.y = y;
      this.container.addChild(newSprite);
      anim.sprite = newSprite;
    }
  }
}
