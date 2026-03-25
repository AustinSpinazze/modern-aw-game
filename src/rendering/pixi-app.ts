// Pixi.js Application singleton + lifecycle.
// Uses WarsWorld sprite sheets with Pixi.js Spritesheet class.

import { Application, Assets, Spritesheet, Texture, TextureSource } from "pixi.js";
import type { GameState } from "../game/types";

export const TILE_SIZE = 16;
export const TILE_SCALE = 3; // Render at 3x for a crisp 48px display tile

let app: Application | null = null;
let resizeObserver: ResizeObserver | null = null;

// Tracks any in-flight initPixiApp call so that a second concurrent call
// (React StrictMode double-effect) waits for the first to settle before
// starting. This prevents two WebGL contexts being created on the same canvas
// simultaneously, which causes shader compilation failures.
let _currentInit: Promise<Application> | null = null;

// Loaded spritesheets by army/key
const spritesheets: Record<string, Spritesheet> = {};

// ── Pan / Zoom state ──────────────────────────────────────────────────────────
// Fixed-scale rendering: tiles always render at TILE_SIZE * TILE_SCALE (48px).
// _baseScale / _baseX / _baseY are always 1 / 0 / 0.
// All camera positioning is done exclusively through _panOffsetX/Y + _userZoom.
let _panOffsetX = 0;
let _panOffsetY = 0;
let _userZoom = 1.0;

export const MAX_ZOOM = 3.0;

// Callback invoked whenever zoom changes (e.g. wheel), so React state can sync.
let _zoomChangeCallback: ((zoom: number) => void) | null = null;
export function setZoomChangeCallback(cb: ((zoom: number) => void) | null): void {
  _zoomChangeCallback = cb;
}

// Dynamic minimum zoom: zoom out until the whole map fits, but never below 0.25.
// Updated by fitMapToStage() whenever map or canvas dimensions change.
let _dynMinZoom = 0.25;
export function getMinZoom(): number {
  return _dynMinZoom;
}
// Keep MIN_ZOOM exported as a static fallback for callers that reference it directly.
export const MIN_ZOOM = 0.25;

// Snap zoom to the nearest multiple of 1/TILE_SCALE so each source texel maps
// to an exact integer number of screen pixels — eliminates moiré/grid patterns.
// Valid levels: 1/3, 2/3, 1, 4/3, 5/3, 2, 7/3, 8/3, 3 …
// At zoom k/TILE_SCALE each 16×16 texel is exactly k screen pixels wide.
function snapZoom(z: number): number {
  return Math.round(z * TILE_SCALE) / TILE_SCALE;
}

// _baseScale / _baseX / _baseY are kept for getStageTransform() compatibility
// but are always 1 / 0 / 0 under fixed-scale rendering.
let _baseScale = 1;
let _baseX = 0;
let _baseY = 0;

function applyStageTransform(): void {
  if (!app) return;
  app.stage.scale.set(_userZoom); // _baseScale is always 1
  app.stage.x = Math.round(_panOffsetX);
  app.stage.y = Math.round(_panOffsetY);
  _zoomChangeCallback?.(_userZoom);
}

/** Clamp _panOffsetX/Y so the camera never shows void outside the map. */
function clampPan(): void {
  if (!app || _lastMapW === 0 || _lastMapH === 0) return;
  const mapPixelW = _lastMapW * TILE_SIZE * TILE_SCALE;
  const mapPixelH = _lastMapH * TILE_SIZE * TILE_SCALE;
  const scaledW = mapPixelW * _userZoom;
  const scaledH = mapPixelH * _userZoom;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;

  // If map is wider than viewport: clamp so edges don't show void
  // If map is narrower: center it (user cannot pan)
  // Round to integer pixels so the tile grid never drifts sub-pixel.
  if (scaledW >= canvasW) {
    _panOffsetX = Math.round(Math.max(canvasW - scaledW, Math.min(0, _panOffsetX)));
  } else {
    _panOffsetX = Math.round((canvasW - scaledW) / 2);
  }
  if (scaledH >= canvasH) {
    _panOffsetY = Math.round(Math.max(canvasH - scaledH, Math.min(0, _panOffsetY)));
  } else {
    _panOffsetY = Math.round((canvasH - scaledH) / 2);
  }
}

export function resetPanZoom(): void {
  _panOffsetX = 0;
  _panOffsetY = 0;
  _userZoom = 1.0;
  clampPan();
  applyStageTransform();
}

/** Reset zoom to 1× without disturbing the pan position. */
export function resetZoom(): void {
  _userZoom = 1.0;
  clampPan();
  applyStageTransform();
}

export function zoomIn(): void {
  // Step to the next higher snap level (multiples of 1/TILE_SCALE).
  const nextLevel = (Math.round(_userZoom * TILE_SCALE) + 1) / TILE_SCALE;
  _userZoom = Math.min(MAX_ZOOM, nextLevel);
  clampPan();
  applyStageTransform();
}

export function zoomOut(): void {
  // Step to the next lower snap level.
  const prevLevel = (Math.round(_userZoom * TILE_SCALE) - 1) / TILE_SCALE;
  _userZoom = Math.max(_dynMinZoom, prevLevel);
  clampPan();
  applyStageTransform();
}

export function getZoomLevel(): number {
  return _userZoom;
}

// Pan/zoom event cleanup handle
let _panCleanup: (() => void) | null = null;

/** Wire pan (right/middle mouse drag) and zoom (wheel) onto the canvas. */
export function enablePanZoom(canvas: HTMLCanvasElement): void {
  if (_panCleanup) _panCleanup(); // remove previous listeners

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onMouseDown = (e: MouseEvent) => {
    // Cmd+drag (macOS) or Ctrl+drag (Windows/Linux) with left button to pan
    if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    _panOffsetX += dx;
    _panOffsetY += dy;
    clampPan();
    applyStageTransform();
  };

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && dragging) {
      dragging = false;
      canvas.style.cursor = "";
    }
  };

  // Show grab cursor when Cmd/Ctrl is held over the canvas
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !dragging) {
      canvas.style.cursor = "grab";
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (!e.metaKey && !e.ctrlKey && !dragging) {
      canvas.style.cursor = "";
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Step exactly one snap level in the scroll direction.
    const stepped =
      e.deltaY > 0
        ? (Math.round(_userZoom * TILE_SCALE) - 1) / TILE_SCALE
        : (Math.round(_userZoom * TILE_SCALE) + 1) / TILE_SCALE;
    const newZoom = Math.min(MAX_ZOOM, Math.max(_dynMinZoom, stepped));

    // Zoom toward cursor position
    if (app) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // World point under cursor before zoom (_baseScale=1, _baseX/Y=0)
      const worldX = (mouseX - _panOffsetX) / _userZoom;
      const worldY = (mouseY - _panOffsetY) / _userZoom;

      _userZoom = newZoom;

      // Adjust pan so the world point stays under cursor
      _panOffsetX = Math.round(mouseX - worldX * _userZoom);
      _panOffsetY = Math.round(mouseY - worldY * _userZoom);
    } else {
      _userZoom = newZoom;
    }

    clampPan();
    applyStageTransform();
  };

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  _panCleanup = () => {
    canvas.style.cursor = "";
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}

export function disablePanZoom(): void {
  _panCleanup?.();
  _panCleanup = null;
}

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

export function initPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  // Serialize concurrent calls so two WebGL contexts are never created on the
  // same canvas at the same time. React StrictMode fires the init effect twice
  // (mount → cleanup → remount); without serialization both calls would call
  // `new WebGLRenderingContext(canvas)` concurrently, causing context loss and
  // shader compilation failures on the second context.
  const prev = _currentInit;
  const next = (async () => {
    // Wait for the previous init (if any) to fully settle before starting.
    if (prev) await prev.catch(() => {});

    // The previous call may have been the StrictMode "first" call that was
    // destroyed by cleanup. destroyPixiApp() here clears any stale state.
    destroyPixiApp();

    const localApp = new Application();
    app = localApp;

    const initW = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
    const initH = canvas.parentElement?.clientHeight ?? canvas.clientHeight;

    await localApp.init({
      canvas,
      width: initW,
      height: initH,
      backgroundColor: 0xf0ece0,
      antialias: false,
      roundPixels: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
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
    return localApp;
  })();

  _currentInit = next;
  return next;
}

/**
 * Load WarsWorld sprite sheets.
 * Each army has a PNG + JSON pair that defines all frames.
 */
async function loadSpritesheets(): Promise<void> {
  // Use relative paths for Electron production (file:// protocol)
  // In dev mode (Vite), BASE_URL is "/"
  // In production (Electron file://), BASE_URL is "./"
  const basePath = import.meta.env.BASE_URL || "/";

  const sheets = [
    { key: "awbw-terrain", base: `${basePath}sprites/awbw-terrain` },
    { key: "neutral", base: `${basePath}sprites/warsworld/neutral` },
    { key: "orange-star", base: `${basePath}sprites/warsworld/orange-star` },
    { key: "blue-moon", base: `${basePath}sprites/warsworld/blue-moon` },
    { key: "green-earth", base: `${basePath}sprites/warsworld/green-earth` },
    { key: "yellow-comet", base: `${basePath}sprites/warsworld/yellow-comet` },
  ];

  // All spritesheets are pixel-art — nearest-neighbor prevents GPU bilinear
  // interpolation from bleeding colors across tile boundaries in the atlas.
  TextureSource.defaultOptions.scaleMode = "nearest";

  const results = await Promise.allSettled(
    sheets.map(async ({ key, base }) => {
      const jsonUrl = `${base}.json`;
      const pngUrl = `${base}.png`;

      const jsonRes = await fetch(jsonUrl);
      if (!jsonRes.ok) throw new Error(`HTTP ${jsonRes.status} for ${jsonUrl}`);
      const jsonData = await jsonRes.json();

      const baseTexture = await Assets.load(pngUrl);

      // Force nearest-neighbor even if the texture was returned from cache
      // with a previously-set linear filter.
      if (baseTexture?.source) {
        baseTexture.source.scaleMode = "nearest";
        baseTexture.source.update();
      }

      const sheet = new Spritesheet(baseTexture, jsonData);
      await sheet.parse();

      spritesheets[key] = sheet;
      return key;
    })
  );

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[Sprites] Failed to load ${sheets[i].key}:`, result.reason);
    }
  });
}

/**
 * Register map dimensions and update the dynamic minimum zoom.
 * Under fixed-scale rendering the stage is always 1:1 — tiles render at 48px.
 * Called after terrain render and on canvas resize.
 */
export function fitMapToStage(mapW: number, mapH: number): void {
  if (!app) return;
  _lastMapW = mapW;
  _lastMapH = mapH;
  _baseScale = 1;
  _baseX = 0;
  _baseY = 0;

  // Allow zooming out until the whole map fits the viewport, floor at 0.25.
  const mapPixelW = mapW * TILE_SIZE * TILE_SCALE;
  const mapPixelH = mapH * TILE_SIZE * TILE_SCALE;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;
  // Minimum zoom = scale that makes the map fill the viewport (no void borders).
  // No upper cap: small maps can have dynMinZoom > 1 so they always fill the screen.
  // Snap to integer tile-pixel boundary to prevent seam lines at the fit zoom level.
  _dynMinZoom = snapZoom(Math.max(0.25, Math.min(canvasW / mapPixelW, canvasH / mapPixelH)));

  clampPan();
  applyStageTransform();
}

/** Returns the current stage screen-space transform for UI overlay positioning. */
export function getStageTransform(): { x: number; y: number; scale: number } {
  return {
    x: _panOffsetX,
    y: _panOffsetY,
    scale: _userZoom,
  };
}

/**
 * Pan the camera so P1's HQ (or first unit) sits at ~25% from the top-left corner.
 * Call once after the first terrain render when a match starts.
 */
export function panToP1Start(gameState: GameState): void {
  if (!app) return;
  const TILE_PX = TILE_SIZE * TILE_SCALE;

  // Start at fit-to-screen zoom so the map fills the viewport (already snapped)
  _userZoom = _dynMinZoom;
  const p1 = gameState.players[0];
  let targetX = 0;
  let targetY = 0;
  let found = false;

  outer: for (let y = 0; y < gameState.map_height; y++) {
    for (let x = 0; x < gameState.map_width; x++) {
      const tile = gameState.tiles[y]?.[x];
      if (tile && tile.terrain_type === "hq" && tile.owner_id === p1?.id) {
        targetX = x;
        targetY = y;
        found = true;
        break outer;
      }
    }
  }

  if (!found) {
    const p1Unit = Object.values(gameState.units).find((u) => u.owner_id === p1?.id);
    if (p1Unit) {
      targetX = p1Unit.x;
      targetY = p1Unit.y;
    }
  }

  const worldX = targetX * TILE_PX + TILE_PX / 2;
  const worldY = targetY * TILE_PX + TILE_PX / 2;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;

  _panOffsetX = canvasW * 0.25 - worldX * _userZoom;
  _panOffsetY = canvasH * 0.25 - worldY * _userZoom;
  clampPan();
  applyStageTransform();
}

const SAFE_ZONE_INSET = 96; // px from viewport edge before camera pans
const CAMERA_FOLLOW_LERP = 0.12;

/**
 * Call every frame during a movement animation.
 * Smoothly pans so the given stage-local coordinate stays within a safe zone
 * inset from the viewport edges.
 */
export function updateCameraFollow(worldX: number, worldY: number): void {
  if (!app) return;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;
  const screenX = _panOffsetX + worldX * _userZoom;
  const screenY = _panOffsetY + worldY * _userZoom;

  let desiredPanX = _panOffsetX;
  let desiredPanY = _panOffsetY;

  if (screenX < SAFE_ZONE_INSET) desiredPanX = SAFE_ZONE_INSET - worldX * _userZoom;
  if (screenX > canvasW - SAFE_ZONE_INSET)
    desiredPanX = canvasW - SAFE_ZONE_INSET - worldX * _userZoom;
  if (screenY < SAFE_ZONE_INSET) desiredPanY = SAFE_ZONE_INSET - worldY * _userZoom;
  if (screenY > canvasH - SAFE_ZONE_INSET)
    desiredPanY = canvasH - SAFE_ZONE_INSET - worldY * _userZoom;

  _panOffsetX += (desiredPanX - _panOffsetX) * CAMERA_FOLLOW_LERP;
  _panOffsetY += (desiredPanY - _panOffsetY) * CAMERA_FOLLOW_LERP;
  clampPan();
  applyStageTransform();
}

// ── Smooth camera pan (eased transition to a world-space point) ─────────────
// Used for combat focus, turn start, AI turn begin.
// Does NOT fight manual pan — only triggers programmatically and lerps gently.
// Call updateCameraPan() every frame from the ticker; it no-ops when idle.

const CAMERA_PAN_LERP = 0.08; // ease speed (lower = slower, smoother)
const CAMERA_PAN_THRESHOLD = 0.5; // px — snap when close enough

let _panTargetX: number | null = null;
let _panTargetY: number | null = null;

/**
 * Start an eased camera pan so that (tileX, tileY) ends up roughly centered.
 * Safe to call any time — overwrites any in-progress pan.
 */
export function animatePanTo(tileX: number, tileY: number): void {
  if (!app) return;
  const TILE_PX = TILE_SIZE * TILE_SCALE;
  const worldX = tileX * TILE_PX + TILE_PX / 2;
  const worldY = tileY * TILE_PX + TILE_PX / 2;
  const canvasW = app.renderer.width;
  const canvasH = app.renderer.height;
  _panTargetX = canvasW / 2 - worldX * _userZoom;
  _panTargetY = canvasH / 2 - worldY * _userZoom;
}

/** Call every frame from the ticker. Lerps toward the target, then stops. */
export function updateCameraPan(): void {
  if (_panTargetX === null || _panTargetY === null) return;

  const dx = _panTargetX - _panOffsetX;
  const dy = _panTargetY - _panOffsetY;

  if (Math.abs(dx) < CAMERA_PAN_THRESHOLD && Math.abs(dy) < CAMERA_PAN_THRESHOLD) {
    _panOffsetX = _panTargetX;
    _panOffsetY = _panTargetY;
    _panTargetX = null;
    _panTargetY = null;
    clampPan();
    applyStageTransform();
    return;
  }

  _panOffsetX += dx * CAMERA_PAN_LERP;
  _panOffsetY += dy * CAMERA_PAN_LERP;
  clampPan();
  applyStageTransform();
}

/** Cancel any in-progress eased pan (e.g. when user starts manual panning). */
export function cancelCameraPan(): void {
  _panTargetX = null;
  _panTargetY = null;
}

/** Whether an eased camera pan is currently in progress. */
export function isCameraPanning(): boolean {
  return _panTargetX !== null;
}

// ── Screen shake ────────────────────────────────────────────────────────────
// Implemented as a temporary offset added to pan before applyStageTransform.
// Decays exponentially. Caller triggers via startShake(), ticker calls updateShake().

// Tuning constants (exported so callers can reference them for documentation)
export const SHAKE_INTENSITY = 6; // max pixel displacement at zoom 1
export const SHAKE_DURATION = 18; // frames (~300ms at 60fps)
export const SHAKE_DECAY = 0.85; // exponential decay per frame

let _shakeFrame = 0;
let _shakeAmplitude = 0;
let _shakeOffsetX = 0;
let _shakeOffsetY = 0;

/**
 * Trigger a screen shake. `intensity` scales the default SHAKE_INTENSITY.
 * Destruction uses 1.0, regular hit uses 0.5.
 */
export function startShake(intensity = 1.0): void {
  _shakeFrame = 0;
  _shakeAmplitude = SHAKE_INTENSITY * intensity;
}

/** Call every frame from the ticker. Applies shake offset, decays, then removes. */
export function updateShake(): void {
  if (_shakeAmplitude < 0.3) {
    // Shake finished — ensure offset is zeroed
    if (_shakeOffsetX !== 0 || _shakeOffsetY !== 0) {
      _shakeOffsetX = 0;
      _shakeOffsetY = 0;
      applyStageTransform();
    }
    return;
  }

  _shakeFrame++;
  _shakeAmplitude *= SHAKE_DECAY;

  // Scale shake down when zoomed out (small maps look bad with big shake)
  const zoomScale = Math.min(1, _userZoom);

  // Random direction each frame for organic feel
  const angle = Math.random() * Math.PI * 2;
  _shakeOffsetX = Math.cos(angle) * _shakeAmplitude * zoomScale;
  _shakeOffsetY = Math.sin(angle) * _shakeAmplitude * zoomScale;

  if (!app) return;
  // Apply shake as an additional offset — don't persist into _panOffsetX/Y
  app.stage.x = Math.round(_panOffsetX + _shakeOffsetX);
  app.stage.y = Math.round(_panOffsetY + _shakeOffsetY);
}

/** Whether a shake is currently active. */
export function isShaking(): boolean {
  return _shakeAmplitude >= 0.3;
}

export function destroyPixiApp(): void {
  cancelCameraPan();
  _shakeAmplitude = 0;
  _shakeOffsetX = 0;
  _shakeOffsetY = 0;
  disablePanZoom();
  resizeObserver?.disconnect();
  resizeObserver = null;
  _panOffsetX = 0;
  _panOffsetY = 0;
  _userZoom = 1.0;
  _baseScale = 1;
  _baseX = 0;
  _baseY = 0;
  _lastMapW = 0;
  _lastMapH = 0;

  _dynMinZoom = MIN_ZOOM;

  if (app) {
    try {
      app.destroy();
    } catch {
      // Swallow any teardown errors
    }
    app = null;
  }
  // Clear spritesheet cache so tests/re-init start clean
  for (const key of Object.keys(spritesheets)) {
    delete spritesheets[key];
  }
}
