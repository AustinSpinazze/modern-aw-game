/**
 * Loads the same terrain/units JSON as {@link ./dataLoader} but from **Node** (`fs`) for
 * `/api/*` routes and Partykit. Bridges to `loadGameDataSync` so game logic shares one cache.
 */

import { loadGameDataSync, isDataLoaded } from "./dataLoader";
import path from "path";

let loading: Promise<void> | null = null;

export async function loadGameDataForServer(): Promise<void> {
  if (isDataLoaded()) return;
  if (loading) return loading;

  loading = (async () => {
    const { readFile } = await import("fs/promises");
    const dataDir = path.join(process.cwd(), "public", "data");

    const [terrainRaw, unitsRaw] = await Promise.all([
      readFile(path.join(dataDir, "terrain.json"), "utf-8"),
      readFile(path.join(dataDir, "units.json"), "utf-8"),
    ]);

    loadGameDataSync(JSON.parse(terrainRaw), JSON.parse(unitsRaw));
  })();

  return loading;
}
