// Server-side data loader for API routes and Partykit.
// Uses Node.js fs to read from public/data/ at build/runtime.

import { loadGameDataSync, isDataLoaded } from "./data-loader";
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
