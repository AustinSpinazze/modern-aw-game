// Fog-of-war overlay renderer — STUB.
//
// Fog is now rendered by tinting terrain sprites directly in TerrainRenderer
// (see FOG_TINT constant there).  A separate Pixi Graphics overlay layer was
// abandoned because setting alpha < 1 on any Container in Pixi v8 creates an
// intermediate compositing group (offscreen RenderTexture).  In Electron's
// WebGL renderer that compositing path fails silently, making the entire stage
// appear blank even though input events continue to work.
//
// This class is kept as a no-op so the GameCanvas wiring (fogRendererRef,
// fogRenderer.getContainer() added to stage) continues to compile unchanged.

import { Container } from "pixi.js";

export class FogRenderer {
  private container: Container;

  constructor() {
    this.container = new Container();
    this.container.label = "fog";
  }

  getContainer(): Container {
    return this.container;
  }

  /** No-op — fog is handled by TerrainRenderer sprite tinting. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_mapWidth: number, _mapHeight: number, _visibilityMap: boolean[][] | null): void {
    // intentionally empty
  }

  clear(): void {
    // intentionally empty
  }
}
