"use client";
// Pixi.js Application singleton + lifecycle.
// Uses WarsWorld sprite sheets with Pixi.js Spritesheet class.

import { Application, Assets, Spritesheet, Texture } from "pixi.js";

export const TILE_SIZE = 16;
export const TILE_SCALE = 3; // Render at 3x for a crisp 48px display tile

let app: Application | null = null;
let resizeObserver: ResizeObserver | null = null;

// Loaded spritesheets by army/key
const spritesheets: Record<string, Spritesheet> = {};

// Last known map dimensions (in tiles), used by the resize observer
let _lastMapW = 0;
let _lastMapH = 0;

export function getApp(): Application | null {
  return app;
}

/**
 * Get a texture from a WarsWorld spritesheet.
 * @param sheetKey - The spritesheet key (e.g. "neutral", "orange-star", "blue-moon")
 * @param frameName - The frame name in the spritesheet (e.g. "plain.png", "infantry-0.png")
 */
export function getSprite(sheetKey: string, frameName: string): Texture | null {
  const sheet = spritesheets[sheetKey];
  if (!sheet) {
    return null;
  }
  const tex = sheet.textures[frameName];
  if (!tex) {
    return null;
  }
  return tex;
}

/**
 * Get a spritesheet by key.
 */
export function getSpritesheet(key: string): Spritesheet | null {
  return spritesheets[key] ?? null;
}

/**
 * Get animation textures from a WarsWorld spritesheet.
 * @param sheetKey - The spritesheet key (e.g. "neutral", "orange-star", "blue-moon")
 * @param animationName - The animation name (e.g. "base", "infantry", "infantry-mdown")
 * @returns Array of textures for the animation frames, or null if not found
 */
export function getAnimation(sheetKey: string, animationName: string): Texture[] | null {
  const sheet = spritesheets[sheetKey];
  if (!sheet) {
    return null;
  }
  const anim = sheet.animations[animationName];
  if (!anim || anim.length === 0) {
    return null;
  }
  return anim;
}

export async function initPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  // Clean up any existing instance first
  destroyPixiApp();

  app = new Application();

  await app.init({
    canvas,
    width: canvas.parentElement?.clientWidth ?? canvas.clientWidth,
    height: canvas.parentElement?.clientHeight ?? canvas.clientHeight,
    backgroundColor: 0x1a1a2e,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    roundPixels: true, // Prevent sub-pixel rendering artifacts
  });

  // Keep the renderer sized to the container
  const container = canvas.parentElement;
  if (container) {
    const doResize = () => {
      if (app && container.clientWidth > 0 && container.clientHeight > 0) {
        app.renderer.resize(container.clientWidth, container.clientHeight);
        if (_lastMapW > 0 && _lastMapH > 0) {
          fitMapToStage(_lastMapW, _lastMapH);
        }
      }
    };

    resizeObserver = new ResizeObserver(doResize);
    resizeObserver.observe(container);

    // Trigger initial resize after DOM settles
    requestAnimationFrame(() => {
      doResize();
      // Double-check after a short delay for layout shifts
      setTimeout(doResize, 100);
    });
  }

  await loadSpritesheets();
  return app;
}

/**
 * Load WarsWorld sprite sheets.
 * Each army has a PNG + JSON pair that defines all frames.
 */
async function loadSpritesheets(): Promise<void> {
  const sheets = [
    { key: "neutral", base: "/sprites/warsworld/neutral" },
    { key: "orange-star", base: "/sprites/warsworld/orange-star" },
    { key: "blue-moon", base: "/sprites/warsworld/blue-moon" },
    { key: "green-earth", base: "/sprites/warsworld/green-earth" },
    { key: "yellow-comet", base: "/sprites/warsworld/yellow-comet" },
  ];

  await Promise.all(
    sheets.map(async ({ key, base }) => {
      try {
        const jsonUrl = `${base}.json`;
        const pngUrl = `${base}.png`;

        const [jsonData, baseTexture] = await Promise.all([
          fetch(jsonUrl).then((r) => r.json()),
          Assets.load(pngUrl),
        ]);

        const sheet = new Spritesheet(baseTexture, jsonData);
        await sheet.parse();

        spritesheets[key] = sheet;
      } catch (e) {
        console.warn(`[loadSpritesheets] Could not load spritesheet: ${base}`, e);
      }
    })
  );
}

/**
 * Scale and center the stage so the map (mapW × mapH tiles) fills the canvas.
 * Called after terrain render and on canvas resize.
 */
export function fitMapToStage(mapW: number, mapH: number): void {
  if (!app) return;
  _lastMapW = mapW;
  _lastMapH = mapH;

  const mapPixelW = mapW * TILE_SIZE * TILE_SCALE;
  const mapPixelH = mapH * TILE_SIZE * TILE_SCALE;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;

  const scaleX = canvasW / mapPixelW;
  const scaleY = canvasH / mapPixelH;
  const scale = Math.min(scaleX, scaleY);

  app.stage.scale.set(scale);
  app.stage.x = Math.round((canvasW - mapPixelW * scale) / 2);
  app.stage.y = Math.round((canvasH - mapPixelH * scale) / 2);
}

export function destroyPixiApp(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (app) {
    try {
      app.destroy();
    } catch {
      // Swallow any teardown errors
    }
    app = null;
  }
}
