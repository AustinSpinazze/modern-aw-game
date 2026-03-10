// Combat animation system — flat tile-overlay style matching HighlightRenderer.
// Uses simple colored rect fills with alpha transitions — no rings, no circles.
// All effects are additive tile overlays that match the existing pixel-art aesthetic.
//
// Timeline (frames at ~60fps, total 28 frames ≈ 467ms):
//   0–8    Attacker flash  — yellow tile overlay fades in then out (firing)
//   5–18   Defender flash  — white → red tile overlay (impact)
//   8–28   Destruction     — rapid triple white flicker, then dark fade-out (if unit dies)

import { Container, Graphics } from "pixi.js";
import type { Vec2 } from "../game/types";
import { TILE_SIZE, TILE_SCALE } from "./pixi-app";

const D = TILE_SIZE * TILE_SCALE; // 48px per tile

// Tile overlay inset — match drawOverlay in HighlightRenderer (no inset there, but 1px looks clean)
const INSET = 0;

const FIRE_START = 0;
const FIRE_END = 8;
const HIT_START = 5;
const HIT_END = 18;
const DESTRUCT_START = 8;
const DESTRUCT_END = 28;
const TOTAL = 28;

export interface CombatAnimParams {
  attackerPos: Vec2;
  defenderPos: Vec2;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  onComplete: () => void;
}

function prog(f: number, s: number, e: number): number {
  return Math.max(0, Math.min(1, (f - s) / (e - s)));
}

/** Draw a tile-sized flat rect overlay, same style as HighlightRenderer.drawOverlay. */
function drawTileOverlay(
  g: Graphics,
  tileX: number,
  tileY: number,
  color: number,
  alpha: number
): void {
  const px = tileX * D + INSET;
  const py = tileY * D + INSET;
  const sz = D - INSET * 2;
  g.rect(px, py, sz, sz);
  g.fill({ color, alpha });
}

export class CombatAnimator {
  private container: Container;
  private frame = 0;
  private active: CombatAnimParams | null = null;

  private fireG: Graphics | null = null;
  private hitG: Graphics | null = null;
  private defDestroyG: Graphics | null = null;
  private atkDestroyG: Graphics | null = null;

  constructor() {
    this.container = new Container();
    this.container.label = "combat-animation";
  }

  getContainer(): Container {
    return this.container;
  }
  isAnimating(): boolean {
    return this.active !== null;
  }

  animate(params: CombatAnimParams): void {
    this.cancel();
    this.active = params;
    this.frame = 0;

    this.fireG = new Graphics();
    this.hitG = new Graphics();
    this.container.addChild(this.fireG);
    this.container.addChild(this.hitG);

    if (params.defenderDestroyed) {
      this.defDestroyG = new Graphics();
      this.container.addChild(this.defDestroyG);
    }
    if (params.attackerDestroyed) {
      this.atkDestroyG = new Graphics();
      this.container.addChild(this.atkDestroyG);
    }
  }

  update(): void {
    if (!this.active) return;
    this.frame++;
    const f = this.frame;
    const p = this.active;

    // ── 1. Attacker fires — yellow tile flash ─────────────────────────────────
    // Mirrors drawSelected (yellow, 0xffff00) but brighter and quick
    if (this.fireG) {
      this.fireG.clear();
      if (f >= FIRE_START && f < FIRE_END) {
        const t = prog(f, FIRE_START, FIRE_END);
        // Ramp up fast (first 30%), then fade
        const alpha = t < 0.3 ? (t / 0.3) * 0.75 : ((1 - t) / 0.7) * 0.75;
        drawTileOverlay(this.fireG, p.attackerPos.x, p.attackerPos.y, 0xffee44, alpha);
      }
    }

    // ── 2. Defender takes hit — white → red tile flash ────────────────────────
    // Mirrors drawAttackable (red, 0xff4444) but starts white for the sharp impact moment
    if (this.hitG) {
      this.hitG.clear();
      if (f >= HIT_START && f < HIT_END) {
        const t = prog(f, HIT_START, HIT_END);
        // Ramp to peak by t=0.15 (very sharp), then fade
        const alpha = t < 0.15 ? (t / 0.15) * 0.85 : ((1 - t) / 0.85) * 0.85;

        // Color: white at impact (t<0.25), fading to red-orange as t increases
        const color = t < 0.25 ? 0xffffff : 0xff3300;
        drawTileOverlay(this.hitG, p.defenderPos.x, p.defenderPos.y, color, alpha);
      }
    }

    // ── 3. Defender destroyed — rapid triple flicker, then dark flash ─────────
    // Three quick white pulses (like AW unit death blink), then a dark overlay fades
    if (this.defDestroyG && p.defenderDestroyed) {
      this.defDestroyG.clear();
      if (f >= DESTRUCT_START && f < DESTRUCT_END) {
        const t = prog(f, DESTRUCT_START, DESTRUCT_END);

        // Triple flicker: three white pulses in the first 40% of the phase
        // Each pulse is ~3 frames wide
        const phaseFrames = f - DESTRUCT_START;
        const isFlicker = t < 0.4;

        if (isFlicker) {
          // Pulse pattern: on/off/on/off/on/off at 3-frame intervals
          const pulseAlpha = phaseFrames % 6 < 3 ? 0.85 : 0;
          if (pulseAlpha > 0) {
            drawTileOverlay(
              this.defDestroyG,
              p.defenderPos.x,
              p.defenderPos.y,
              0xffffff,
              pulseAlpha
            );
          }
        } else {
          // After flicker: dark orange-brown overlay fades out (unit gone)
          const st = (t - 0.4) / 0.6;
          const darkAlpha = (1 - st) * 0.45;
          drawTileOverlay(this.defDestroyG, p.defenderPos.x, p.defenderPos.y, 0x442200, darkAlpha);
        }
      }
    }

    // ── 4. Attacker destroyed by counterattack — same flicker pattern ─────────
    if (this.atkDestroyG && p.attackerDestroyed) {
      this.atkDestroyG.clear();
      if (f >= DESTRUCT_START && f < DESTRUCT_END) {
        const t = prog(f, DESTRUCT_START, DESTRUCT_END);
        const phaseFrames = f - DESTRUCT_START;
        const isFlicker = t < 0.4;

        if (isFlicker) {
          const pulseAlpha = phaseFrames % 6 < 3 ? 0.85 : 0;
          if (pulseAlpha > 0) {
            drawTileOverlay(
              this.atkDestroyG,
              p.attackerPos.x,
              p.attackerPos.y,
              0xffffff,
              pulseAlpha
            );
          }
        } else {
          const st = (t - 0.4) / 0.6;
          drawTileOverlay(
            this.atkDestroyG,
            p.attackerPos.x,
            p.attackerPos.y,
            0x442200,
            (1 - st) * 0.45
          );
        }
      }
    }

    if (f >= TOTAL) this.complete();
  }

  cancel(): void {
    for (const child of this.container.children) {
      child.destroy();
    }
    this.container.removeChildren();
    this.fireG = null;
    this.hitG = null;
    this.defDestroyG = null;
    this.atkDestroyG = null;
    this.active = null;
    this.frame = 0;
  }

  private complete(): void {
    const cb = this.active?.onComplete;
    this.cancel();
    cb?.();
  }
}
