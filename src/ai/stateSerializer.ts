/**
 * Flattens {@link GameState} into a **text** digest for LLM system/user prompts (not full JSON).
 * Respects fog-of-war like a human player; includes ammo, fuel, match economy/luck, and combat-relevant detail.
 */

import type { GameState, UnitState } from "../game/types";
import {
  calculateDamage,
  canAttack,
  canCounterattack,
  getCounterWeaponIndex,
} from "../game/combat";
import { getTerrainData, getUnitData, getAllUnitData } from "../game/dataLoader";
import { getTile, getUnitAt, getPlayer, incrementAttackCounter } from "../game/gameState";
import { manhattanDistance } from "../game/pathfinding";
import { computeVisibility } from "../game/visibility";
import { getHeuristicMoveSuggestion } from "./heuristic";

const MAX_COMBAT_PREVIEW_LINES = 48;
const MAX_PROPERTY_LINES = 80;
const MAX_SERIALIZED_CHARS = 24_000; // ~6K tokens — safe for most models

function isAlly(state: GameState, observerId: number, ownerId: number): boolean {
  const o = state.players.find((p) => p.id === observerId);
  const u = state.players.find((p) => p.id === ownerId);
  if (!o || !u) return false;
  return o.team === u.team;
}

/** Enemy/neutral units only appear if their tile is visible when fog is on. */
function canSeeUnitTile(
  state: GameState,
  observerId: number,
  unit: UnitState,
  vis: boolean[][] | null
): boolean {
  if (unit.is_loaded) return false;
  if (isAlly(state, observerId, unit.owner_id)) return true;
  if (!vis) return true;
  return vis[unit.y]?.[unit.x] ?? false;
}

function canSeeTile(
  state: GameState,
  observerId: number,
  x: number,
  y: number,
  vis: boolean[][] | null
): boolean {
  if (!vis) return true;
  const tile = getTile(state, x, y);
  if (tile && isAlly(state, observerId, tile.owner_id)) return true;
  return vis[y]?.[x] ?? false;
}

function formatWeaponsAmmo(unit: UnitState): string {
  const ud = getUnitData(unit.unit_type);
  if (!ud || ud.weapons.length === 0) return "no weapons";
  const parts = ud.weapons.map((w, i) => {
    const rng = `r${w.min_range}-${w.max_range}`;
    if (w.ammo < 0) return `[${i}]${w.id} ${rng} =∞`;
    const cur = unit.ammo[w.id] ?? w.ammo;
    return `[${i}]${w.id} ${rng} =${cur}`;
  });
  return parts.join(", ");
}

function formatUnitLine(
  state: GameState,
  unit: UnitState,
  tag: "yours" | "ally" | "enemy"
): string {
  const ud = getUnitData(unit.unit_type);
  const statusParts: string[] = [];
  if (unit.has_moved) statusParts.push("moved");
  if (unit.has_acted) statusParts.push("acted");
  const status = statusParts.length > 0 ? statusParts.join(",") : "ready";

  const extras: string[] = [];
  extras.push(`hp=${unit.hp}/10`);
  extras.push(formatWeaponsAmmo(unit));
  if (unit.fuel !== undefined) extras.push(`fuel=${unit.fuel}`);
  if (ud) extras.push(`move=${ud.move_points} vision=${ud.vision} domain=${ud.domain}`);
  if (unit.cargo.length > 0) extras.push(`cargo=[${unit.cargo.join(",")}]`);
  if (unit.is_submerged) extras.push("submerged");
  if (unit.is_hidden) extras.push("hidden");

  const who =
    tag === "yours"
      ? "YOU"
      : tag === "ally"
        ? `ally(p${unit.owner_id})`
        : `enemy(p${unit.owner_id})`;
  return `  Unit ${unit.id} ${unit.unit_type} @(${unit.x},${unit.y}) ${who} ${extras.join(" | ")} [${status}]`;
}

function getBestLegalWeaponWithDamage(
  att: UnitState,
  def: UnitState,
  state: GameState
): { weaponIndex: number; firstStrikeHp: number } {
  const ud = getUnitData(att.unit_type);
  if (!ud || ud.weapons.length === 0) return { weaponIndex: -1, firstStrikeHp: 0 };
  let best = -1;
  let bestDmg = -1;
  for (let i = 0; i < ud.weapons.length; i++) {
    const w = ud.weapons[i];
    if (w.min_range > 1 && att.has_moved) continue;
    if (!canAttack(att, def, state, i)) continue;
    const { damage } = calculateDamage(att, def, state, i);
    if (damage > bestDmg) {
      bestDmg = damage;
      best = i;
    }
  }
  return { weaponIndex: best, firstStrikeHp: bestDmg };
}

function buildCombatPreviewLine(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  weaponIdx: number,
  firstStrikeHp: number,
  viewerId: number
): string {
  const dmg = firstStrikeHp;
  const ud = getUnitData(attacker.unit_type);
  const wName = ud?.weapons[weaponIdx]?.id ?? `w${weaponIdx}`;

  const stateAfterFirst = incrementAttackCounter(state);
  const defHpAfter = Math.max(0, defender.hp - dmg);

  let suffix: string;
  if (defHpAfter <= 0) {
    suffix = " | defender KO (no counter)";
  } else {
    const defAfter = { ...defender, hp: defHpAfter };
    if (!canCounterattack(defAfter, attacker)) {
      suffix = " | no counter in range";
    } else {
      const cwi = getCounterWeaponIndex(defAfter, attacker);
      const { damage: cdmg } = calculateDamage(defAfter, attacker, stateAfterFirst, cwi, true);
      suffix = ` | est. counter ~${cdmg} HP`;
    }
  }

  const attTag = attacker.owner_id === viewerId ? "you" : `ally p${attacker.owner_id}`;
  return `  ${attTag} ${attacker.id} ${attacker.unit_type} → enemy ${defender.id} ${defender.unit_type}: ~${dmg} HP (${wName})${suffix}`;
}

function collectHqPositions(state: GameState): { x: number; y: number; owner_id: number }[] {
  const out: { x: number; y: number; owner_id: number }[] = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const t = getTile(state, x, y);
      if (t?.terrain_type === "hq") {
        out.push({ x, y, owner_id: t.owner_id });
      }
    }
  }
  return out;
}

function centroidOfArmy(state: GameState, ownerId: number): { x: number; y: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of Object.values(state.units)) {
    if (u.owner_id === ownerId && !u.is_loaded) {
      xs.push(u.x);
      ys.push(u.y);
    }
  }
  if (xs.length === 0) return null;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  return { x: Math.round(sx / xs.length), y: Math.round(sy / ys.length) };
}

function nearestNeutralCapturable(
  state: GameState,
  fromX: number,
  fromY: number
): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const t = getTile(state, x, y);
      if (!t || t.owner_id !== -1) continue;
      const td = getTerrainData(t.terrain_type);
      if (!td?.can_capture) continue;
      const d = manhattanDistance(fromX, fromY, x, y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

export function serializeStateForLLM(state: GameState, playerId: number): string {
  const lines: string[] = [];
  const vis = computeVisibility(state, playerId);

  const allUnits = Object.values(state.units).filter((u) => !u.is_loaded);
  const yours: UnitState[] = [];
  const allies: UnitState[] = [];
  const enemies: UnitState[] = [];
  for (const unit of allUnits) {
    if (unit.owner_id === playerId) {
      yours.push(unit);
    } else if (isAlly(state, playerId, unit.owner_id)) {
      allies.push(unit);
    } else if (canSeeUnitTile(state, playerId, unit, vis)) {
      enemies.push(unit);
    }
  }

  // Match configuration (same values the combat / economy engine uses)
  lines.push(`=== GAME STATE (Turn ${state.turn_number}) ===`);
  lines.push(`Map: ${state.map_width}x${state.map_height}`);
  lines.push(`You are player ${playerId}`);
  lines.push("");
  lines.push("=== TURN PRIORITY (read first) ===");
  lines.push(
    "  1) EXPAND: move units toward enemy HQ, visible enemies, or neutral properties — do not idle at base."
  );
  lines.push(
    "  2) Avoid pointless shuffling: do not MOVE back and forth between the same tiles without attacking, capturing, or blocking."
  );
  lines.push(
    "  3) When unsure, use the HEURISTIC MOVE HINTS section — those destinations are valid MOVE commands that push the map."
  );
  lines.push("");

  const hqs = collectHqPositions(state);
  const cx = Math.floor(state.map_width / 2);
  const cy = Math.floor(state.map_height / 2);
  lines.push("=== STRATEGIC MAP (where to go) ===");
  const myHq = hqs.find((h) => h.owner_id === playerId);
  if (myHq) {
    lines.push(
      `  Your HQ @(${myHq.x},${myHq.y}) — losing it loses the game; do not strip it of all defenders.`
    );
  }
  for (const p of state.players) {
    if (p.is_defeated || p.id === playerId || isAlly(state, playerId, p.id)) continue;
    const ehq = hqs.find((h) => h.owner_id === p.id);
    if (ehq) {
      lines.push(
        `  Enemy player ${p.id} HQ (capture to defeat them): @(${ehq.x},${ehq.y}) — primary attack objective.`
      );
    }
  }
  lines.push(`  Map center (use as direction if you have no contacts): @(${cx},${cy})`);
  const armyCenter = centroidOfArmy(state, playerId);
  const nearestNeutral = armyCenter
    ? nearestNeutralCapturable(state, armyCenter.x, armyCenter.y)
    : null;
  if (nearestNeutral) {
    lines.push(
      `  Nearest neutral capturable tile from your army centroid @(${armyCenter!.x},${armyCenter!.y}): @(${nearestNeutral.x},${nearestNeutral.y})`
    );
  }
  if (enemies.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const e of enemies) {
      sx += e.x;
      sy += e.y;
    }
    lines.push(
      `  Visible enemy cluster center: ~(${Math.round(sx / enemies.length)},${Math.round(sy / enemies.length)}) — move to engage.`
    );
  } else if (state.fog_of_war) {
    lines.push(
      "  No visible enemies — scout with infantry/recon or march toward enemy HQ / map center until you make contact."
    );
  }
  lines.push("");

  lines.push("=== HEURISTIC ACTION PLAN (copy these commands if unsure) ===");
  let hintLines = 0;
  for (const u of [...yours, ...allies]) {
    const hint = getHeuristicMoveSuggestion(u, state, vis);
    if (hint) {
      hintLines++;
      const tag = u.owner_id === playerId ? "you" : `ally p${u.owner_id}`;
      const moveJson = `{"type":"MOVE","player_id":${u.owner_id},"unit_id":${u.id},"dest_x":${hint.dest_x},"dest_y":${hint.dest_y}}`;

      let followUpJson: string;
      if (hint.followUp === "CAPTURE") {
        followUpJson = `{"type":"CAPTURE","player_id":${u.owner_id},"unit_id":${u.id}}`;
      } else if (hint.followUp === "ATTACK" && hint.followUpDetail) {
        followUpJson = `{"type":"ATTACK","player_id":${u.owner_id},"attacker_id":${u.id},${hint.followUpDetail.split(" ").map((p) => { const [k,v] = p.split("="); return `"${k}":${v}`; }).join(",")}}`;
      } else {
        followUpJson = `{"type":"WAIT","player_id":${u.owner_id},"unit_id":${u.id}}`;
      }

      lines.push(
        `  ${tag} unit ${u.id} ${u.unit_type} @(${u.x},${u.y}) → ${moveJson}, then ${followUpJson}`
      );
    }
  }
  // Also show units that can act in-place (already on a capture target, or can attack without moving)
  for (const u of yours) {
    if (u.has_acted || u.is_loaded) continue;
    if (u.has_moved) continue; // already covered or already moved
    const unitData = getUnitData(u.unit_type);
    if (!unitData) continue;

    // Can capture in place?
    if (unitData.can_capture && !u.has_moved) {
      const tile = getTile(state, u.x, u.y);
      const td = tile ? getTerrainData(tile.terrain_type) : null;
      if (td?.can_capture && tile && !isAlly(state, playerId, tile.owner_id) && tile.owner_id !== playerId) {
        hintLines++;
        lines.push(
          `  you unit ${u.id} ${u.unit_type} @(${u.x},${u.y}) → CAPTURE in place: {"type":"CAPTURE","player_id":${playerId},"unit_id":${u.id}}`
        );
        continue;
      }
    }
  }
  if (hintLines === 0) {
    lines.push("  (no action hints — units already moved/acted or no reachable tiles)");
  }
  lines.push("");

  lines.push("--- MATCH RULES (engine) ---");
  lines.push(
    `  fog_of_war=${state.fog_of_war} (when true, enemy units/properties below only appear if in vision)`
  );
  lines.push(
    `  luck: additive combat variance — roll in [${state.luck_min}, ${state.luck_max}] per attack (see system prompt for formula)`
  );
  lines.push(
    `  income_multiplier=${state.income_multiplier} (each property's base income × this each turn)`
  );
  lines.push(
    `  max_turns=${state.max_turns} (${state.max_turns < 0 ? "unlimited" : `game ends after turn ${state.max_turns}`})`
  );
  lines.push("");

  // Players + funds
  lines.push("--- PLAYERS ---");
  for (const player of state.players) {
    const marker = player.id === playerId ? " <YOU>" : "";
    lines.push(
      `Player ${player.id} (team ${player.team}): funds=${player.funds}${player.is_defeated ? " DEFEATED" : ""}${marker}`
    );
  }
  const self = state.players.find((p) => p.id === playerId);
  if (self) {
    lines.push(`Your funds this turn: ${self.funds} (see system prompt for unit costs).`);
  }
  lines.push("");

  // Property counts + income (only tiles you can see — same rules as rest)
  lines.push("--- PROPERTY / INCOME SNAPSHOT (visible tiles only if fog) ---");
  const perOwner = new Map<number, { count: number; income: number; samples: string[] }>();
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      if (!canSeeTile(state, playerId, x, y, vis)) continue;
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      if (!terrainData?.is_property) continue;
      if (tile.owner_id < 0) continue;
      const base = terrainData.income;
      const inc = Math.round(base * state.income_multiplier);
      const prev = perOwner.get(tile.owner_id) ?? { count: 0, income: 0, samples: [] };
      prev.count += 1;
      prev.income += inc;
      if (prev.samples.length < 6) prev.samples.push(`${tile.terrain_type}@(${x},${y})`);
      perOwner.set(tile.owner_id, prev);
    }
  }
  for (const p of state.players) {
    if (p.is_defeated) continue;
    const row = perOwner.get(p.id);
    if (row) {
      const lab = p.id === playerId ? "YOU" : `enemy p${p.id}`;
      lines.push(
        `  ${lab}: ${row.count} visible properties, ~+${row.income} funds/turn from them (base income × ${state.income_multiplier}) e.g. ${row.samples.join(", ")}`
      );
    } else {
      lines.push(`  Player ${p.id}: no visible owned properties (or none owned)`);
    }
  }
  lines.push("");

  lines.push("--- YOUR UNITS ---");
  if (yours.length === 0) {
    lines.push("  (none)");
  } else {
    for (const u of yours) {
      lines.push(formatUnitLine(state, u, "yours"));
    }
  }
  lines.push("");

  if (allies.length > 0) {
    lines.push("--- ALLIED UNITS (same team) ---");
    for (const u of allies) {
      lines.push(formatUnitLine(state, u, "ally"));
    }
    lines.push("");
  }

  lines.push("--- ENEMY UNITS (only if visible in fog) ---");
  if (enemies.length === 0) {
    lines.push(state.fog_of_war ? "  (none visible — scout or move forward)" : "  (none)");
  } else {
    for (const u of enemies) {
      lines.push(formatUnitLine(state, u, "enemy"));
    }
  }
  lines.push("");

  lines.push("--- COMBAT PREVIEW (engine estimates; luck can shift ± a few HP) ---");
  const attackers = [...yours, ...allies].filter((u) => {
    const ud = getUnitData(u.unit_type);
    return ud !== null && ud.weapons.length > 0 && !u.has_acted;
  });
  const previewRows: { dmg: number; line: string }[] = [];
  for (const att of attackers) {
    for (const def of enemies) {
      const { weaponIndex: w, firstStrikeHp } = getBestLegalWeaponWithDamage(att, def, state);
      if (w < 0) continue;
      previewRows.push({
        dmg: firstStrikeHp,
        line: buildCombatPreviewLine(state, att, def, w, firstStrikeHp, playerId),
      });
    }
  }
  previewRows.sort((a, b) => b.dmg - a.dmg);
  if (previewRows.length === 0) {
    lines.push(
      "  (no strikes — no acting attackers with weapons, no visible enemies, or all out of range)"
    );
  } else {
    const shown = previewRows.slice(0, MAX_COMBAT_PREVIEW_LINES);
    for (const r of shown) {
      lines.push(r.line);
    }
    if (previewRows.length > MAX_COMBAT_PREVIEW_LINES) {
      lines.push(
        `  … ${previewRows.length - MAX_COMBAT_PREVIEW_LINES} more pairs omitted (sorted by first-strike damage)`
      );
    }
  }
  lines.push("");

  // Properties — prioritize mid-capture and enemy properties, cap total lines
  lines.push("--- PROPERTIES (terrain; capturable buildings) ---");
  const propLines: { priority: number; text: string }[] = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      if (!canSeeTile(state, playerId, x, y, vis)) continue;
      const tile = getTile(state, x, y);
      if (!tile) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      if (!terrainData?.is_property) continue;

      let ownerStr: string;
      let priority = 0; // higher = more important to show
      if (tile.owner_id === -1) {
        ownerStr = "neutral";
        priority = 1;
      } else if (tile.owner_id === playerId) {
        ownerStr = "YOURS";
        priority = 0;
      } else {
        ownerStr = `enemy(p${tile.owner_id})`;
        priority = 2;
      }

      const baseInc = terrainData.income;
      const inc = Math.round(baseInc * state.income_multiplier);

      let capStr = "";
      if (tile.capture_points < 20) {
        capStr = ` cp_remaining=${tile.capture_points}/20`;
        priority = 10; // mid-capture always shown
        if (tile.owner_id === playerId) {
          capStr += " [YOUR_BUILDING_UNDER_ATTACK]";
        } else {
          capStr += " [capture_in_progress]";
        }
      }
      propLines.push({
        priority,
        text: `  ${tile.terrain_type} @(${x},${y}) owner=${ownerStr} income=+${inc}/turn (base ${baseInc}×${state.income_multiplier})${capStr}`,
      });
    }
  }
  propLines.sort((a, b) => b.priority - a.priority);
  const shownProps = propLines.slice(0, MAX_PROPERTY_LINES);
  for (const p of shownProps) lines.push(p.text);
  if (propLines.length > MAX_PROPERTY_LINES) {
    lines.push(`  … ${propLines.length - MAX_PROPERTY_LINES} more properties omitted`);
  }
  lines.push("");

  // Production: exact coordinates matter for BUY_UNIT
  lines.push("--- YOUR PRODUCTION FACILITIES (BUY_UNIT facility_x / facility_y) ---");
  const player = getPlayer(state, playerId);
  const playerFunds = player?.funds ?? 0;
  let facilityCount = 0;
  const emptyFacilities: { x: number; y: number; produces: string[] }[] = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      const tile = getTile(state, x, y);
      if (!tile || tile.owner_id !== playerId) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      const produces = terrainData?.can_produce ?? [];
      if (produces.length === 0) continue;
      facilityCount++;
      const occupant = getUnitAt(state, x, y);
      if (occupant) {
        lines.push(`  ${tile.terrain_type} @(${x},${y}) → ${produces.join(", ")} | BLOCKED by unit ${occupant.id} (${occupant.unit_type})`);
      } else {
        emptyFacilities.push({ x, y, produces });
        lines.push(`  ${tile.terrain_type} @(${x},${y}) → ${produces.join(", ")} | EMPTY — buy here!`);
      }
    }
  }
  if (facilityCount === 0) {
    lines.push("  (none — you have no factory/airport/port you own)");
  }

  // Generate concrete purchase suggestions
  if (emptyFacilities.length > 0 && playerFunds >= 1000) {
    lines.push("");
    lines.push("  SUGGESTED PURCHASES (copy these BUY_UNIT commands):");
    const allUnits = getAllUnitData();
    let remainingFunds = playerFunds;
    for (const fac of emptyFacilities) {
      if (remainingFunds < 1000) break;
      // Pick best affordable unit: prefer combat units when funds allow
      const affordable = fac.produces
        .map((id) => allUnits[id])
        .filter((u) => u && u.cost <= remainingFunds)
        .sort((a, b) => b.cost - a.cost); // most expensive first
      if (affordable.length === 0) continue;
      // Pick tank/md_tank if affordable, else best available
      const pick = affordable.find((u) => u.id === "tank" || u.id === "md_tank") ?? affordable[0];
      lines.push(
        `  → {"type":"BUY_UNIT","player_id":${playerId},"unit_type":"${pick.id}","facility_x":${fac.x},"facility_y":${fac.y}} (${pick.id} costs ${pick.cost}, leaves ${remainingFunds - pick.cost} funds)`
      );
      remainingFunds -= pick.cost;
    }
  }
  lines.push("");

  // Mid-capture reminders (game rule: MOVE off tile resets capture progress to 20)
  lines.push("--- CAPTURE NOTES (read before ordering MOVE + CAPTURE) ---");
  const captureNotes: string[] = [];
  for (let y = 0; y < state.map_height; y++) {
    for (let x = 0; x < state.map_width; x++) {
      if (!canSeeTile(state, playerId, x, y, vis)) continue;
      const tile = getTile(state, x, y);
      if (!tile || tile.capture_points >= 20) continue;
      const terrainData = getTerrainData(tile.terrain_type);
      if (!terrainData?.can_capture) continue;

      const occupant = getUnitAt(state, x, y);
      if (tile.owner_id === playerId) {
        captureNotes.push(
          `  ENEMY capturing YOUR ${tile.terrain_type} @(${x},${y}) — ${tile.capture_points}/20 left before you lose it.${occupant ? ` Unit on tile: ${occupant.id} (${occupant.unit_type}, p${occupant.owner_id}).` : ""} Attack the capturer or block adjacent tiles.`
        );
      } else if (occupant && occupant.owner_id === playerId) {
        captureNotes.push(
          `  YOUR unit ${occupant.id} (${occupant.unit_type}) on ${tile.owner_id === -1 ? "neutral" : "enemy"} ${tile.terrain_type} @(${x},${y}) — ${tile.capture_points}/20 capture remaining. Do NOT MOVE this unit off the property before CAPTURE this turn (moving off resets progress to 20). Prefer CAPTURE with no MOVE, or MOVE only if you abandon on purpose.`
        );
      }
    }
  }
  if (captureNotes.length === 0) {
    lines.push("  (no property mid-capture in view)");
  } else {
    lines.push(...captureNotes);
  }
  lines.push("");

  // Available actions hint
  lines.push("--- YOUR UNITS THAT CAN STILL ACT ---");
  const yourUnits = yours.filter((u) => !u.has_acted);
  if (yourUnits.length === 0) {
    lines.push("  (none — consider END_TURN)");
  } else {
    for (const unit of yourUnits) {
      const canMove = !unit.has_moved;
      lines.push(
        `  Unit ${unit.id} ${unit.unit_type} @(${unit.x},${unit.y}) — ${canMove ? "can MOVE then act" : "already moved — act in place only"}`
      );
    }
  }
  lines.push("");

  const result = lines.join("\n");
  if (result.length > MAX_SERIALIZED_CHARS) {
    console.warn(
      `[StateSerializer] Output ${result.length} chars exceeds budget ${MAX_SERIALIZED_CHARS}, truncating`
    );
    return result.slice(0, MAX_SERIALIZED_CHARS) + "\n… [state truncated for token budget]";
  }
  return result;
}
