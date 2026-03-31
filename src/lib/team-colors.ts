// Single source of truth for team / player color constants.
// Indexed by player index (0 = Red/P1, 1 = Blue/P2, 2 = Green/P3, 3 = Yellow/P4).

/** Tailwind class bundle for a single team. */
export interface TeamColorClasses {
  /** Text color class (e.g. "text-red-400"). */
  text: string;
  /** Background color class (e.g. "bg-red-500"). */
  bg: string;
  /** Border color class (e.g. "border-red-500"). */
  border: string;
  /** Dot/indicator background class (e.g. "bg-red-400"). */
  dot: string;
  /** Ring color class (e.g. "ring-red-500"). */
  ring: string;
  /** Header bar background class — slightly adjusted for text legibility. */
  headerBg: string;
}

/**
 * Tailwind class objects for each team, indexed by player index (0-3).
 *
 * Consolidates TEAM_TEXT, TEAM_BG, TEAM_BORDER, TEAM_DOT, TEAM_RING,
 * and TEAM_HEADER_BG from App.tsx, TileInfoPanel, TurnTransitionOverlay,
 * BuyMenu, and MatchSetup into one canonical array.
 */
export const TEAM_COLORS: readonly TeamColorClasses[] = [
  {
    text: "text-red-400",
    bg: "bg-red-500",
    border: "border-red-500",
    dot: "bg-red-400",
    ring: "ring-red-500",
    headerBg: "bg-red-500",
  },
  {
    text: "text-blue-400",
    bg: "bg-blue-500",
    border: "border-blue-500",
    dot: "bg-blue-400",
    ring: "ring-blue-500",
    headerBg: "bg-blue-500",
  },
  {
    text: "text-green-400",
    bg: "bg-green-500",
    border: "border-green-500",
    dot: "bg-green-400",
    ring: "ring-green-500",
    headerBg: "bg-green-600",
  },
  {
    text: "text-yellow-400",
    bg: "bg-yellow-500",
    border: "border-yellow-500",
    dot: "bg-yellow-400",
    ring: "ring-yellow-500",
    headerBg: "bg-yellow-500",
  },
] as const;

/**
 * Hex color values for each player, used in canvas/Pixi rendering and chart legends.
 *
 * Matches the values from MatchSetup (PLAYER_COLORS_HEX) and MapEditor (PLAYER_HEX).
 */
export const PLAYER_COLORS_HEX: readonly string[] = [
  "#e74c3c", // Red  — Player 1
  "#3498db", // Blue — Player 2
  "#2ecc71", // Green — Player 3
  "#f1c40f", // Yellow — Player 4
] as const;

/**
 * Faction palette used for AWBW minimap rendering (supports up to 8 factions).
 *
 * Players 0-3 match PLAYER_COLORS_HEX; indices 4-7 cover additional AWBW factions.
 */
export const FACTION_COLORS: readonly string[] = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f1c40f",
  "#e67e22",
  "#9b59b6",
  "#1abc9c",
  "#e91e63",
] as const;
