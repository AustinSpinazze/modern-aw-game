/**
 * Fog-of-war **placeholder** container (no-op draw). Actual fog tints live in `TerrainRenderer`.
 *
 * A separate Graphics overlay was dropped: low-alpha overlay groups in Pixi v8 can break Electron WebGL.
 * This class stays so `GameCanvas` stage wiring stays stable.
 */

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
