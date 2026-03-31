/**
 * Optional **particle bursts** on hit/destroy (Pixi `Graphics` quads, pooled, capped for perf).
 */

import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, TILE_SCALE } from "./pixi-app";

const D = TILE_SIZE * TILE_SCALE; // 48px per tile

// ── Tuning constants ────────────────────────────────────────────────────────
const MAX_PARTICLES = 60; // hard cap across all active effects
const PARTICLES_PER_HIT = 8; // spawned on a normal hit
const PARTICLES_PER_DESTROY = 20; // spawned on unit destruction
const PARTICLE_LIFETIME = 24; // frames (~400ms at 60fps)
const PARTICLE_SIZE_MIN = 2;
const PARTICLE_SIZE_MAX = 6;
const PARTICLE_SPEED = 1.8; // px/frame base speed
const GRAVITY = 0.08; // px/frame² downward pull

// Color palettes
const HIT_COLORS = [0xff6600, 0xff9933, 0xffcc00, 0xffffff]; // orange-fire
const DESTROY_COLORS = [0xff3300, 0xff6600, 0x222222, 0x555555, 0xffffff]; // fire + smoke

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  graphic: Graphics;
}

export class ParticleSystem {
  private container: Container;
  private particles: Particle[] = [];

  constructor() {
    this.container = new Container();
    this.container.label = "particle-vfx";
  }

  getContainer(): Container {
    return this.container;
  }

  /** Spawn a burst of hit particles at a tile position. */
  emitHit(tileX: number, tileY: number): void {
    this.emit(tileX, tileY, PARTICLES_PER_HIT, HIT_COLORS, 1.0);
  }

  /** Spawn a larger burst for unit destruction. */
  emitDestroy(tileX: number, tileY: number): void {
    this.emit(tileX, tileY, PARTICLES_PER_DESTROY, DESTROY_COLORS, 1.4);
  }

  private emit(
    tileX: number,
    tileY: number,
    count: number,
    colors: number[],
    speedScale: number
  ): void {
    // Cap total active particles
    const available = MAX_PARTICLES - this.particles.length;
    const toSpawn = Math.min(count, available);
    if (toSpawn <= 0) return;

    const centerX = tileX * D + D / 2;
    const centerY = tileY * D + D / 2;

    for (let i = 0; i < toSpawn; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random()) * PARTICLE_SPEED * speedScale;
      const size = PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN);
      const color = colors[Math.floor(Math.random() * colors.length)];

      const g = new Graphics();
      g.rect(-size / 2, -size / 2, size, size);
      g.fill({ color, alpha: 1 });
      g.x = centerX + (Math.random() - 0.5) * D * 0.3;
      g.y = centerY + (Math.random() - 0.5) * D * 0.3;
      this.container.addChild(g);

      this.particles.push({
        x: g.x,
        y: g.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.0, // slight upward bias
        life: PARTICLE_LIFETIME + Math.floor(Math.random() * 6),
        maxLife: PARTICLE_LIFETIME + 6,
        size,
        color,
        graphic: g,
      });
    }
  }

  /** Call every frame from the ticker. Moves particles, fades, removes dead ones. */
  update(): void {
    if (this.particles.length === 0) return;

    const toRemove: number[] = [];

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life--;

      if (p.life <= 0) {
        toRemove.push(i);
        continue;
      }

      // Physics
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.graphic.x = p.x;
      p.graphic.y = p.y;

      // Fade out in the last 40% of life
      const lifeRatio = p.life / p.maxLife;
      p.graphic.alpha = lifeRatio < 0.4 ? lifeRatio / 0.4 : 1;
    }

    // Remove dead particles (reverse order to keep indices valid)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const p = this.particles[idx];
      this.container.removeChild(p.graphic);
      p.graphic.destroy();
      this.particles.splice(idx, 1);
    }
  }

  /** Whether any particles are still alive. */
  isActive(): boolean {
    return this.particles.length > 0;
  }

  /** Remove all particles immediately. */
  clear(): void {
    for (const p of this.particles) {
      this.container.removeChild(p.graphic);
      p.graphic.destroy();
    }
    this.particles = [];
  }
}
