"use client";
// Unit renderer using WarsWorld sprite sheets with animations.
// Units have idle animations and movement direction animations.

import { AnimatedSprite, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { GameState, UnitState } from "../game/types";
import { TILE_SIZE, TILE_SCALE, getAnimation } from "./pixi-app";
import { UNIT_ANIMATIONS, UNIT_ANIMATION_SPEED, getArmySheet } from "./sprite-mapping";

const DISPLAY = TILE_SIZE * TILE_SCALE; // 48px per tile on screen

// Darker tint for units that have acted (like WarsWorld) - grey-ish
const ACTED_TINT = 0x666666;

export const TEAM_COLORS: Record<number, number> = {
  0: 0xcc2222, // red (orange-star)
  1: 0x2233cc, // blue (blue-moon)
  2: 0x22aa33, // green (green-earth)
  3: 0xccaa11, // yellow (yellow-comet)
};

// Darker versions for units that have acted
const TEAM_COLORS_ACTED: Record<number, number> = {
  0: 0x661111, // darker red
  1: 0x111966, // darker blue
  2: 0x115511, // darker green
  3: 0x665508, // darker yellow
};

const TEAM_BORDER_COLORS: Record<number, number> = {
  0: 0x881111,
  1: 0x112299,
  2: 0x117722,
  3: 0x997700,
};

const HP_STYLE = new TextStyle({
  fontSize: 9,
  fontFamily: "monospace",
  fontWeight: "bold",
  fill: 0xffffff,
});

export class UnitRenderer {
  private container: Container;
  private currentPlayerId: number = -1;

  constructor() {
    this.container = new Container();
    this.container.label = "units";
  }

  getContainer(): Container {
    return this.container;
  }

  render(state: GameState, animatingUnitId?: number): void {
    this.container.removeChildren();
    
    // Track current player to only darken their units that have acted
    const currentPlayer = state.players[state.current_player_index];
    this.currentPlayerId = currentPlayer?.id ?? -1;

    for (const unit of Object.values(state.units)) {
      if (unit.is_loaded) continue; // skip units inside transports
      
      // Skip the unit being animated (it's rendered by MovementAnimator)
      if (unit.id === animatingUnitId) continue;

      // Always draw unit at its current position
      // Unit only moves after action is confirmed
      const px = unit.x * DISPLAY;
      const py = unit.y * DISPLAY;
      this.drawUnit(unit, px, py);
    }
  }

  private drawUnit(unit: UnitState, px: number, py: number): void {
    const sheetKey = getArmySheet(unit.owner_id);
    const animationName = UNIT_ANIMATIONS[unit.unit_type];

    // Darken if: unit belongs to current player AND has acted
    const hasActed = unit.owner_id === this.currentPlayerId && unit.has_acted;

    let drewSprite = false;

    if (animationName) {
      const frames = getAnimation(sheetKey, animationName);
      if (frames && frames.length > 0) {
        const sprite = new AnimatedSprite(frames);
        sprite.animationSpeed = UNIT_ANIMATION_SPEED;
        sprite.play();

        sprite.x = px;
        sprite.y = py;
        sprite.width = DISPLAY;
        sprite.height = DISPLAY;

        // Use tint for darker shade (like WarsWorld) when acted
        if (hasActed) {
          sprite.tint = ACTED_TINT;
        }

        this.container.addChild(sprite);
        drewSprite = true;
      }
    }

    // Fallback: colored rounded rect
    if (!drewSprite) {
      this.drawUnitFallback(unit.owner_id, hasActed, px, py);
    }

    // HP badge — only shown when HP < 10 (damaged)
    if (unit.hp < 10) {
      const badge = new Text({ text: String(unit.hp), style: HP_STYLE });
      badge.x = px + DISPLAY - 12;
      badge.y = py + DISPLAY - 13;
      this.container.addChild(badge);
    }
  }

  private drawUnitFallback(ownerId: number, hasActed: boolean, px: number, py: number): void {
    const fill = hasActed ? (TEAM_COLORS_ACTED[ownerId] ?? 0x444444) : (TEAM_COLORS[ownerId] ?? 0x888888);
    const border = TEAM_BORDER_COLORS[ownerId] ?? 0x444444;

    const pad = 6;
    const size = DISPLAY - pad * 2;
    const radius = 5;

    const g = new Graphics();

    g.roundRect(px + pad, py + pad, size, size, radius);
    g.fill(fill);
    g.roundRect(px + pad, py + pad, size, size, radius);
    g.stroke({ color: border, width: 2 });

    this.container.addChild(g);
  }
}
