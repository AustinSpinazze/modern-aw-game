/**
 * User-saved maps in `localStorage` (id, name, AWBW CSV, dimensions). Shared by match setup and
 * the map editor via {@link loadSavedMaps} / {@link upsertSavedMap}.
 */

export interface PreDeployedUnit {
  unitType: string;
  ownerId: number;
  x: number;
  y: number;
}

export interface SavedMap {
  id: string;
  name: string;
  description?: string;
  csv: string;
  width: number;
  height: number;
  savedAt: number;
  /** Units that sit on building tiles — CSV can only encode one ID per cell,
   *  so building IDs win and units are stored here to survive the round-trip. */
  preDeployedUnits?: PreDeployedUnit[];
}

export const SAVED_MAPS_KEY = "modern-aw-savedMaps";

export function loadSavedMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(SAVED_MAPS_KEY);
    return raw ? (JSON.parse(raw) as SavedMap[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedMaps(maps: SavedMap[]) {
  localStorage.setItem(SAVED_MAPS_KEY, JSON.stringify(maps));
}

/** Upsert a map: if `id` matches an existing entry, replace it. Otherwise prepend. */
export function upsertSavedMap(map: SavedMap): SavedMap[] {
  const existing = loadSavedMaps();
  const idx = existing.findIndex((m) => m.id === map.id);
  let updated: SavedMap[];
  if (idx >= 0) {
    updated = existing.map((m, i) => (i === idx ? map : m));
  } else {
    updated = [map, ...existing];
  }
  persistSavedMaps(updated);
  return updated;
}

export function deleteSavedMap(id: string): SavedMap[] {
  const updated = loadSavedMaps().filter((m) => m.id !== id);
  persistSavedMaps(updated);
  return updated;
}
