/**
 * **WarsWorld frame names** and bitmask tables: terrain IDs → PNG names, road/river autotile keys,
 * building animations, unit animation prefixes. Consumed only by renderers + palette UI.
 */

// ─── Army color mapping ─────────────────────────────────────────────────────
// Maps our player IDs (0, 1, 2, 3) to WarsWorld spritesheet keys
export const PLAYER_TO_ARMY: Record<number, string> = {
  0: "orange-star", // P1 = Red/Orange
  1: "blue-moon", // P2 = Blue
  2: "green-earth", // P3 = Green
  3: "yellow-comet", // P4 = Yellow
};

export function getArmySheet(playerId: number): string {
  return PLAYER_TO_ARMY[playerId] ?? "neutral";
}

// ─── Terrain sprite names ───────────────────────────────────────────────────
// Maps our terrain_type IDs to WarsWorld neutral sheet frame names

export const TERRAIN_SPRITES: Record<string, string> = {
  plains: "plain.png",
  forest: "forest.png",
  mountain: "mountain.png",
  sea: "sea.png",
  reef: "reef.png",
};

// ─── Road auto-tiling ───────────────────────────────────────────────────────
// WarsWorld uses directional naming: road-{directions}.png
// Directions are: top, right, bottom, left (in that order when combined)

// Bitmask: N=1, E=2, S=4, W=8
export const ROAD_SPRITE_MAP: Record<number, string> = {
  0: "road-top-bottom.png", // Isolated → vertical
  1: "road-top-bottom.png", // N only → vertical
  2: "road-right-left.png", // E only → horizontal
  3: "road-top-right.png", // N+E → corner
  4: "road-top-bottom.png", // S only → vertical
  5: "road-top-bottom.png", // N+S → vertical
  6: "road-right-bottom.png", // E+S → corner
  7: "road-top-right-bottom.png", // N+E+S → T-junction (missing left)
  8: "road-right-left.png", // W only → horizontal
  9: "road-top-left.png", // N+W → corner
  10: "road-right-left.png", // E+W → horizontal
  11: "road-top-right-left.png", // N+E+W → T-junction (missing bottom)
  12: "road-bottom-left.png", // S+W → corner
  13: "road-top-bottom-left.png", // N+S+W → T-junction (missing right)
  14: "road-right-bottom-left.png", // E+S+W → T-junction (missing top)
  15: "road-top-right-bottom-left.png", // All 4 → crossroads
};

// ─── River auto-tiling ──────────────────────────────────────────────────────
// Same pattern as roads
export const RIVER_SPRITE_MAP: Record<number, string> = {
  0: "river-top-bottom.png",
  1: "river-top-bottom.png",
  2: "river-right-left.png",
  3: "river-top-right.png",
  4: "river-top-bottom.png",
  5: "river-top-bottom.png",
  6: "river-right-bottom.png",
  7: "river-top-right-bottom.png",
  8: "river-right-left.png",
  9: "river-top-left.png",
  10: "river-right-left.png",
  11: "river-top-right-left.png",
  12: "river-bottom-left.png",
  13: "river-top-bottom-left.png",
  14: "river-right-bottom-left.png",
  15: "river-top-right-bottom-left.png",
};

// ─── Bridge sprites ─────────────────────────────────────────────────────────
export const BRIDGE_SPRITES = {
  horizontal: "bridge-right-left.png",
  vertical: "bridge-top-bottom.png",
};

// ─── Building animation names ────────────────────────────────────────────────
// Buildings are in army-specific sheets with animation frames
// These names match the animation keys in the spritesheet JSON

export const BUILDING_ANIMATIONS: Record<string, string> = {
  hq: "hq",
  city: "city",
  factory: "base", // WarsWorld calls factory "base"
  airport: "airport",
  port: "port",
  comms_tower: "city", // fallback to city sprite until dedicated sprites exist
  lab: "city", // fallback to city sprite until dedicated sprites exist
};

// Static frame names for buildings (used for neutral sheet which has no animations)
export const BUILDING_STATIC_FRAMES: Record<string, string> = {
  hq: "hq-0.png",
  city: "city-0.png",
  factory: "base-0.png",
  airport: "airport-0.png",
  port: "port-0.png",
  comms_tower: "city-0.png",
  lab: "city-0.png",
};

// Animation speed for buildings (frames per tick)
export const BUILDING_ANIMATION_SPEED = 0.04;

// ─── Unit animation names ────────────────────────────────────────────────────
// Units are in army-specific sheets with idle and movement animations
// These names match the animation keys in the spritesheet JSON

export const UNIT_ANIMATIONS: Record<string, string> = {
  infantry: "infantry",
  mech: "mech",
  recon: "recon",
  apc: "apc",
  tank: "tank",
  md_tank: "mediumTank",
  neo_tank: "neoTank",
  mega_tank: "megaTank",
  artillery: "artillery",
  rocket: "rocket",
  anti_air: "antiAir",
  missile: "missile",
  pipe_runner: "pipeRunner",
  t_copter: "transportCopter",
  b_copter: "battleCopter",
  fighter: "fighter",
  bomber: "bomber",
  stealth: "stealth",
  black_bomb: "blackBomb",
  lander: "lander",
  black_boat: "blackBoat",
  cruiser: "cruiser",
  submarine: "sub",
  battleship: "battleship",
  carrier: "carrier",
};

// Movement direction animation suffixes
// Usage: `${UNIT_ANIMATIONS[unitType]}-${UNIT_MOVE_DIRECTIONS[direction]}`
export const UNIT_MOVE_DIRECTIONS = {
  down: "mdown",
  left: "mside", // WarsWorld uses same sprite for left/right, flip for left
  right: "mside",
  up: "mup",
} as const;

// Animation speed for units (frames per tick)
export const UNIT_ANIMATION_SPEED = 0.08; // Slightly faster than buildings

// ─── Fallback colors ────────────────────────────────────────────────────────
// Used when sprites can't be loaded
export const FALLBACK_COLORS: Record<string, number> = {
  plains: 0x88aa44,
  forest: 0x228822,
  mountain: 0x886644,
  road: 0x888888,
  river: 0x4488cc,
  sea: 0x2266aa,
  shoal: 0xddcc88,
  reef: 0x448888,
  bridge: 0x666666,
  city: 0xaaaaaa,
  factory: 0x888899,
  airport: 0x9988aa,
  port: 0x558899,
  hq: 0xccaa44,
  pipe: 0x666666,
  pipe_seam: 0x888888,
  comms_tower: 0xcc8844,
  lab: 0x8844cc,
};
