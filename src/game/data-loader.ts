// Shared static cache for terrain.json and units.json data.
// In the browser, these are loaded once and cached.

import type { TerrainData, UnitData } from "./types";

let terrainCache: Record<string, TerrainData> | null = null;
let unitsCache: Record<string, UnitData> | null = null;

// Synchronous accessors (populated after loadGameData() resolves)
export function getTerrainData(terrainId: string): TerrainData | null {
  return terrainCache?.[terrainId] ?? null;
}

export function getUnitData(unitType: string): UnitData | null {
  return unitsCache?.[unitType] ?? null;
}

export function isDataLoaded(): boolean {
  return terrainCache !== null && unitsCache !== null;
}

// Must be called once before any game logic runs
export async function loadGameData(): Promise<void> {
  if (isDataLoaded()) return;

  const [terrainRes, unitsRes] = await Promise.all([
    fetch("/data/terrain.json"),
    fetch("/data/units.json"),
  ]);

  const terrainJson = await terrainRes.json();
  const unitsJson = await unitsRes.json();

  terrainCache = {};
  for (const t of terrainJson.terrain_types as TerrainData[]) {
    terrainCache[t.id] = t;
  }

  unitsCache = {};
  for (const u of unitsJson.units as UnitData[]) {
    unitsCache[u.id] = u;
  }
}

// Server-side loader (for API routes / Partykit which can use fs)
export function loadGameDataSync(terrainJson: unknown, unitsJson: unknown): void {
  const td = terrainJson as { terrain_types: TerrainData[] };
  const ud = unitsJson as { units: UnitData[] };

  terrainCache = {};
  for (const t of td.terrain_types) {
    terrainCache[t.id] = t;
  }

  unitsCache = {};
  for (const u of ud.units) {
    unitsCache[u.id] = u;
  }
}

// FOB build cost from terrain config
export function getFobCost(terrainJson?: { fob_config?: { build_cost?: number } }): number {
  return terrainJson?.fob_config?.build_cost ?? 5000;
}
