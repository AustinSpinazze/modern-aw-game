// All TypeScript interfaces for the game state

export type ControllerType = "human" | "heuristic" | "openai" | "anthropic" | "gemini" | "local_http";

export interface PlayerState {
  id: number;
  team: number;
  funds: number;
  is_defeated: boolean;
  controller_type: ControllerType;
  controller_config: Record<string, unknown>;
}

export interface UnitState {
  id: number;
  unit_type: string;
  owner_id: number;
  x: number;
  y: number;
  hp: number;
  has_moved: boolean;
  has_acted: boolean;
  ammo: Record<string, number>; // weapon_id -> ammo_count
  cargo: number[]; // unit IDs being transported
  is_loaded: boolean; // true if inside a transport
  is_submerged?: boolean; // true when submarine is diving
  is_hidden?: boolean; // true when stealth unit is hidden
  fuel?: number; // optional fuel tracking for air/naval units
}

export interface TileState {
  terrain_type: string;
  owner_id: number; // -1 = neutral
  capture_points: number;
  has_trench: boolean;
  has_fob: boolean;
  fob_hp: number;
}

export interface GameState {
  match_id: string;
  match_seed: number;
  map_width: number;
  map_height: number;
  players: PlayerState[];
  units: Record<number, UnitState>; // id -> UnitState
  tiles: TileState[][]; // [y][x]
  current_player_index: number;
  turn_number: number;
  attack_counter: number;
  phase: "action" | "game_over";
  winner_id: number; // -1 if no winner
  next_unit_id: number;
  command_log: CommandDict[];
  luck_min: number;
  luck_max: number;
  // Match configuration
  income_multiplier: number; // multiply each property's income by this (default 1)
  max_turns: number; // -1 = unlimited; game ends in a draw when turn_number > max_turns
  fog_of_war: boolean; // when true, each player only sees tiles in their units' vision range
  turn_time_limit: number; // seconds per turn; 0 = no limit
}

// Command types as discriminated union
export type CommandType =
  | "MOVE"
  | "ATTACK"
  | "CAPTURE"
  | "BUY_UNIT"
  | "LOAD"
  | "UNLOAD"
  | "DIG_TRENCH"
  | "BUILD_FOB"
  | "SELF_DESTRUCT"
  | "WAIT"
  | "END_TURN"
  | "RESUPPLY"
  | "SUBMERGE"
  | "SURFACE"
  | "MERGE"
  | "HIDE"
  | "UNHIDE";

export interface CmdBase {
  type: CommandType;
  player_id: number;
  sequence?: number;
}

export interface CmdMove extends CmdBase {
  type: "MOVE";
  unit_id: number;
  dest_x: number;
  dest_y: number;
}

export interface CmdAttack extends CmdBase {
  type: "ATTACK";
  attacker_id: number;
  target_id: number;
  weapon_index: number;
}

export interface CmdCapture extends CmdBase {
  type: "CAPTURE";
  unit_id: number;
}

export interface CmdBuyUnit extends CmdBase {
  type: "BUY_UNIT";
  unit_type: string;
  facility_x: number;
  facility_y: number;
}

export interface CmdLoad extends CmdBase {
  type: "LOAD";
  transport_id: number;
  unit_id: number;
}

export interface CmdUnload extends CmdBase {
  type: "UNLOAD";
  transport_id: number;
  unit_index: number;
  dest_x: number;
  dest_y: number;
}

export interface CmdDigTrench extends CmdBase {
  type: "DIG_TRENCH";
  unit_id: number;
  target_x: number;
  target_y: number;
}

export interface CmdBuildFOB extends CmdBase {
  type: "BUILD_FOB";
  unit_id: number;
  target_x: number;
  target_y: number;
}

export interface CmdSelfDestruct extends CmdBase {
  type: "SELF_DESTRUCT";
  unit_id: number;
  target_id: number;
}

export interface CmdWait extends CmdBase {
  type: "WAIT";
  unit_id: number;
}

export interface CmdEndTurn extends CmdBase {
  type: "END_TURN";
}

export interface CmdResupply extends CmdBase {
  type: "RESUPPLY";
  unit_id: number; // the support unit performing resupply (air_tanker, resupply_ship, carrier)
  target_id: number; // the unit being resupplied
}

export interface CmdSubmerge extends CmdBase {
  type: "SUBMERGE";
  unit_id: number;
}

export interface CmdSurface extends CmdBase {
  type: "SURFACE";
  unit_id: number;
}

export interface CmdMerge extends CmdBase {
  type: "MERGE";
  unit_id: number; // the unit moving into the merge
  target_id: number; // the unit being merged into
}

export interface CmdHide extends CmdBase {
  type: "HIDE";
  unit_id: number;
}

export interface CmdUnhide extends CmdBase {
  type: "UNHIDE";
  unit_id: number;
}

export type GameCommand =
  | CmdMove
  | CmdAttack
  | CmdCapture
  | CmdBuyUnit
  | CmdLoad
  | CmdUnload
  | CmdDigTrench
  | CmdBuildFOB
  | CmdSelfDestruct
  | CmdWait
  | CmdEndTurn
  | CmdResupply
  | CmdSubmerge
  | CmdSurface
  | CmdMerge
  | CmdHide
  | CmdUnhide;

// Raw dict representation used in logs and AI
export type CommandDict = Record<string, unknown>;

// Terrain and unit data shapes (from JSON)
export interface TerrainData {
  id: string;
  name: string;
  defense_stars: number;
  is_property: boolean;
  can_capture: boolean;
  income: number;
  can_produce: string[];
  can_build_trench: boolean;
  can_build_fob: boolean;
  allows_cargo_operations?: boolean;
  is_destructible?: boolean;
  default_hp?: number;
  movement_costs: Record<string, number>;
}

export interface WeaponData {
  id: string;
  name: string;
  min_range: number;
  max_range: number;
  ammo: number; // -1 = unlimited
  can_counterattack: boolean;
  damage_table: Record<string, number>; // unit_type -> base_damage
}

export interface TransportData {
  capacity: number;
  vehicle_capacity?: number;
  allowed_tags: string[];
  allowed_vehicle_tags?: string[];
  requires_airport_or_fob?: boolean;
}

export interface UnitData {
  id: string;
  name: string;
  cost: number;
  move_points: number;
  move_type: string;
  domain: string;
  tags: string[];
  can_capture: boolean;
  vision: number;
  weapons: WeaponData[];
  special_actions: string[];
  transport?: TransportData;
  self_destruct_damage?: number;
  fuel?: number; // max fuel (air/naval units)
  fuel_per_turn?: number; // fuel consumed at start of each turn
}

// Combat result
export interface CombatResult {
  attacker_damage_dealt: number;
  defender_damage_dealt: number;
  attacker_final_hp: number;
  defender_final_hp: number;
  attacker_destroyed: boolean;
  defender_destroyed: boolean;
  luck_roll_attacker: number;
  luck_roll_defender: number;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  error: string;
}

// Vector2 position
export interface Vec2 {
  x: number;
  y: number;
}
