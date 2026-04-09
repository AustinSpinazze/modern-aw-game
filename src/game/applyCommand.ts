/**
 * Applies a **already-validated** {@link GameCommand} to {@link GameState}, returning an updated
 * immutable snapshot. This is the **only** place game rules should mutate state after a command.
 *
 * **Contract:** {@link ./validators.validateCommand} must run first; never call `applyCommand` on
 * unvalidated input (API routes and Partykit enforce this).
 *
 * Handles movement, combat, economy side-effects (income, heals), capture, production, fog inputs,
 * and turn advancement — each `switch` arm mirrors one command type from {@link ./types}.
 */

import type { GameState, GameCommand } from "./types";
import {
  getUnit,
  getPlayer,
  getTile,
  updateUnit,
  removeUnit,
  addUnit,
  updateTile,
  updatePlayer,
  getNextUnitId,
} from "./gameState";
import { getUnitData } from "./dataLoader";
import { executeCombat, executeSelfDestruct, getCounterWeaponIndex } from "./combat";
import { applyIncome, calculateHealCost, calculateMergeRefund, deductFunds } from "./economy";
import { findPath } from "./pathfinding";

/** Reset capture progress on the tile a unit occupied when it's destroyed. */
function resetCaptureOnDeath(state: GameState, unitX: number, unitY: number): GameState {
  const tile = getTile(state, unitX, unitY);
  if (tile && tile.capture_points < 20) {
    return updateTile(state, unitX, unitY, { capture_points: 20 });
  }
  return state;
}

export function applyCommand(stateIn: GameState, cmd: GameCommand): GameState {
  let state = stateIn;

  switch (cmd.type) {
    case "MOVE": {
      const unit = getUnit(state, cmd.unit_id)!;
      const oldTile = getTile(state, unit.x, unit.y);

      // Reset capture progress on the tile the unit is leaving
      // (In AW, moving away from a building resets capture progress)
      if (oldTile && oldTile.capture_points < 20) {
        state = updateTile(state, unit.x, unit.y, { capture_points: 20 });
      }

      // Consume 1 fuel per tile traversed for air/naval units
      const movePatch: { x: number; y: number; has_moved: boolean; fuel?: number } = {
        x: cmd.dest_x,
        y: cmd.dest_y,
        has_moved: true,
      };
      {
        const ud = getUnitData(unit.unit_type);
        if (ud?.fuel !== undefined) {
          const currentFuel = unit.fuel ?? ud.fuel;
          const path = findPath(state, unit, cmd.dest_x, cmd.dest_y);
          const tilesTraversed = Math.max(0, path.length - 1);
          movePatch.fuel = Math.max(0, currentFuel - tilesTraversed);
        }
      }

      state = updateUnit(state, cmd.unit_id, movePatch);
      break;
    }

    case "ATTACK": {
      const attacker = getUnit(state, cmd.attacker_id)!;
      const defender = getUnit(state, cmd.target_id)!;

      const {
        result,
        state: newState,
        attacker: newAttacker,
        defender: newDefender,
      } = executeCombat(attacker, defender, state, cmd.weapon_index);

      state = newState;

      // Update attacker
      if (result.attacker_destroyed) {
        state = resetCaptureOnDeath(state, attacker.x, attacker.y);
        state = removeUnit(state, attacker.id);
      } else {
        state = updateUnit(state, attacker.id, {
          hp: newAttacker.hp,
          has_acted: true,
          has_moved: true,
        });
      }

      // Update defender
      if (result.defender_destroyed) {
        state = resetCaptureOnDeath(state, defender.x, defender.y);
        state = removeUnit(state, defender.id);
      } else {
        state = updateUnit(state, defender.id, { hp: newDefender.hp });
      }

      // Consume attacker ammo
      const attackerData = getUnitData(attacker.unit_type);
      if (attackerData && cmd.weapon_index < attackerData.weapons.length) {
        const weapon = attackerData.weapons[cmd.weapon_index];
        if (weapon.ammo > 0) {
          const currentAmmo = attacker.ammo[weapon.id] ?? weapon.ammo;
          const updatedUnit = getUnit(state, attacker.id);
          if (updatedUnit) {
            state = updateUnit(state, attacker.id, {
              ammo: { ...updatedUnit.ammo, [weapon.id]: currentAmmo - 1 },
            });
          }
        }
      }

      // Consume defender counter-attack ammo
      if (result.defender_damage_dealt > 0 && !result.defender_destroyed) {
        const defenderData = getUnitData(defender.unit_type);
        if (defenderData) {
          const counterIdx = getCounterWeaponIndex(defender, attacker);
          const counterWeapon = defenderData.weapons[counterIdx];
          if (counterWeapon && counterWeapon.ammo > 0) {
            const currentAmmo = defender.ammo[counterWeapon.id] ?? counterWeapon.ammo;
            const updatedDefender = getUnit(state, defender.id);
            if (updatedDefender) {
              state = updateUnit(state, defender.id, {
                ammo: { ...updatedDefender.ammo, [counterWeapon.id]: currentAmmo - 1 },
              });
            }
          }
        }
      }
      break;
    }

    case "CAPTURE": {
      const unit = getUnit(state, cmd.unit_id)!;
      const tile = getTile(state, unit.x, unit.y)!;
      const captureReduction = unit.hp;
      const newCapturePoints = tile.capture_points - captureReduction;

      if (newCapturePoints <= 0) {
        // Capture complete
        state = updateTile(state, unit.x, unit.y, {
          owner_id: cmd.player_id,
          capture_points: 20, // reset
        });

        // If enemy HQ captured, end game
        if (tile.terrain_type === "hq") {
          const originalOwner = tile.owner_id;
          if (originalOwner >= 0 && originalOwner !== cmd.player_id) {
            state = updatePlayer(state, originalOwner, { is_defeated: true });
            // Check win condition
            const activePlayers = state.players.filter((p) => !p.is_defeated);
            if (activePlayers.length === 1) {
              state = { ...state, phase: "game_over", winner_id: activePlayers[0].id };
            }
          }
        }
      } else {
        state = updateTile(state, unit.x, unit.y, { capture_points: newCapturePoints });
      }

      state = updateUnit(state, cmd.unit_id, { has_acted: true, has_moved: true });
      break;
    }

    case "BUY_UNIT": {
      const [newId, stateWithId] = getNextUnitId(state);
      state = stateWithId;

      const unitData = getUnitData(cmd.unit_type);
      const ammo: Record<string, number> = {};
      if (unitData) {
        for (const w of unitData.weapons) {
          if (w.ammo > 0) ammo[w.id] = w.ammo;
        }
      }

      state = addUnit(state, {
        id: newId,
        unit_type: cmd.unit_type,
        owner_id: cmd.player_id,
        x: cmd.facility_x,
        y: cmd.facility_y,
        hp: 10,
        has_moved: true,
        has_acted: true,
        ammo,
        cargo: [],
        is_loaded: false,
        ...(unitData?.fuel !== undefined ? { fuel: unitData.fuel } : {}),
      });

      const cost = unitData?.cost ?? 0;
      const player = getPlayer(state, cmd.player_id)!;
      state = updatePlayer(state, cmd.player_id, { funds: player.funds - cost });
      break;
    }

    case "LOAD": {
      const transport = getUnit(state, cmd.transport_id)!;
      // Loading does NOT consume the transport's action — it can still move and unload
      state = updateUnit(state, cmd.transport_id, {
        cargo: [...transport.cargo, cmd.unit_id],
      });
      state = updateUnit(state, cmd.unit_id, {
        is_loaded: true,
        has_moved: true,
        has_acted: true,
      });
      break;
    }

    case "UNLOAD": {
      const transport = getUnit(state, cmd.transport_id)!;
      const cargoId = transport.cargo[cmd.unit_index];
      const newCargo = transport.cargo.filter((_, i) => i !== cmd.unit_index);

      state = updateUnit(state, cmd.transport_id, {
        cargo: newCargo,
        has_acted: true,
        has_moved: true,
      });
      state = updateUnit(state, cargoId, {
        is_loaded: false,
        x: cmd.dest_x,
        y: cmd.dest_y,
        has_moved: true,
        has_acted: true,
      });
      break;
    }

    case "SELF_DESTRUCT": {
      const uav = getUnit(state, cmd.unit_id)!;
      const target = getUnit(state, cmd.target_id)!;

      const { damage, state: newState } = executeSelfDestruct(uav, target, state);
      state = newState;

      state = resetCaptureOnDeath(state, uav.x, uav.y);
      state = removeUnit(state, uav.id);

      const newHp = Math.max(0, target.hp - damage);
      if (newHp <= 0) {
        state = resetCaptureOnDeath(state, target.x, target.y);
        state = removeUnit(state, target.id);
      } else {
        state = updateUnit(state, target.id, { hp: newHp });
      }
      break;
    }

    case "WAIT": {
      state = updateUnit(state, cmd.unit_id, { has_acted: true, has_moved: true });
      break;
    }

    case "SUBMERGE": {
      state = updateUnit(state, cmd.unit_id, {
        is_submerged: true,
        has_acted: true,
        has_moved: true,
      });
      break;
    }

    case "SURFACE": {
      state = updateUnit(state, cmd.unit_id, {
        is_submerged: false,
        has_acted: true,
        has_moved: true,
      });
      break;
    }

    case "MERGE": {
      const unit = getUnit(state, cmd.unit_id)!;
      const target = getUnit(state, cmd.target_id)!;
      const combinedHp = unit.hp + target.hp;
      const finalHp = Math.min(10, combinedHp);
      const excessHp = combinedHp - finalHp;

      // Merge ammo: take max of each weapon's ammo
      const targetData = getUnitData(target.unit_type);
      const mergedAmmo: Record<string, number> = { ...target.ammo };
      if (targetData) {
        for (const w of targetData.weapons) {
          if (w.ammo > 0) {
            const unitAmmo = unit.ammo[w.id] ?? 0;
            const targetAmmo = target.ammo[w.id] ?? 0;
            mergedAmmo[w.id] = Math.min(w.ammo, Math.max(unitAmmo, targetAmmo));
          }
        }
      }

      // Merge fuel: take max
      const fuelPatch: { fuel?: number } = {};
      if (target.fuel !== undefined && unit.fuel !== undefined) {
        const maxFuel = targetData?.fuel ?? Infinity;
        fuelPatch.fuel = Math.min(maxFuel, Math.max(target.fuel, unit.fuel));
      }

      // Update target with merged stats
      state = updateUnit(state, cmd.target_id, {
        hp: finalHp,
        ammo: mergedAmmo,
        has_acted: true,
        has_moved: true,
        ...fuelPatch,
      });

      // Remove the merging unit
      state = removeUnit(state, cmd.unit_id);

      // Refund excess HP
      if (excessHp > 0) {
        const refund = calculateMergeRefund(target.unit_type, excessHp);
        const player = getPlayer(state, cmd.player_id)!;
        state = updatePlayer(state, cmd.player_id, { funds: player.funds + refund });
      }
      break;
    }

    case "HIDE": {
      state = updateUnit(state, cmd.unit_id, {
        is_hidden: true,
        has_acted: true,
        has_moved: true,
      });
      break;
    }

    case "UNHIDE": {
      state = updateUnit(state, cmd.unit_id, {
        is_hidden: false,
        has_acted: true,
        has_moved: true,
      });
      break;
    }

    case "RESUPPLY": {
      const support = getUnit(state, cmd.unit_id)!;
      const target = getUnit(state, cmd.target_id)!;
      const targetData = getUnitData(target.unit_type);

      if (support.unit_type === "black_boat") {
        if (!targetData || targetData.domain !== "sea" || target.hp >= 10) break;
        const cost = calculateHealCost(target.unit_type, 1);
        const afterPay = deductFunds(state, cmd.player_id, cost);
        if (!afterPay) break;
        state = afterPay;
        state = updateUnit(state, cmd.target_id, { hp: Math.min(10, target.hp + 1) });
      } else {
        if (!targetData || targetData.domain === "air" || targetData.domain === "sea") break;
        const fullAmmo: Record<string, number> = {};
        for (const w of targetData.weapons) {
          if (w.ammo > 0) fullAmmo[w.id] = w.ammo;
        }
        const patch: Partial<typeof target> = { ammo: fullAmmo };
        if (target.fuel !== undefined && targetData.fuel !== undefined) {
          patch.fuel = targetData.fuel;
        }
        state = updateUnit(state, cmd.target_id, patch);
      }
      state = updateUnit(state, cmd.unit_id, { has_acted: true, has_moved: true });
      break;
    }

    case "END_TURN": {
      // Advance to next active player
      let nextIndex = state.current_player_index;
      let attempts = 0;
      do {
        nextIndex = (nextIndex + 1) % state.players.length;
        attempts++;
      } while (state.players[nextIndex]?.is_defeated && attempts < state.players.length);

      // Guard: if all players are defeated, end the game
      if (state.players[nextIndex]?.is_defeated) {
        state = { ...state, phase: "game_over" };
        break;
      }

      // Increment turn when cycling back to player 0
      const newTurn = nextIndex === 0 ? state.turn_number + 1 : state.turn_number;

      // Reset all units of new current player, heal on properties, auto-resupply
      const newPlayerId = state.players[nextIndex].id;
      const HEALING_BUILDINGS = new Set(["city", "factory", "airport", "port", "hq"]);
      // Domain-aware healing: ground heals on cities/factories/HQ,
      // air heals on airports, naval heals on ports
      const AIR_HEALING = new Set(["airport"]);
      const NAVAL_HEALING = new Set(["port"]);
      const GROUND_HEALING = new Set(["city", "factory", "hq"]);

      // AWBW order: Income → Repairs → Fuel → APC resupply
      // Apply income FIRST so repair costs can be covered by this turn's income
      state = applyIncome(state, newPlayerId);
      let playerFunds = state.players.find((p) => p.id === newPlayerId)!.funds;
      const updatedUnits = { ...state.units };

      for (const uid in updatedUnits) {
        const unit = updatedUnits[uid];
        if (unit.owner_id === newPlayerId) {
          let healedHp = unit.hp;
          const standingTile = getTile(state, unit.x, unit.y);
          const unitDataForHeal = getUnitData(unit.unit_type);
          const domain = unitDataForHeal?.domain ?? "ground";

          // Domain-aware healing on friendly properties
          if (standingTile && standingTile.owner_id === newPlayerId && unit.hp < 10) {
            let canHealHere = false;
            if (domain === "air" && AIR_HEALING.has(standingTile.terrain_type)) canHealHere = true;
            else if (
              (domain === "sea" || domain === "naval") &&
              NAVAL_HEALING.has(standingTile.terrain_type)
            )
              canHealHere = true;
            else if (
              domain !== "air" &&
              domain !== "sea" &&
              domain !== "naval" &&
              GROUND_HEALING.has(standingTile.terrain_type)
            )
              canHealHere = true;

            if (canHealHere) {
              const hpToHeal = Math.min(2, 10 - unit.hp);
              const healCost = calculateHealCost(unit.unit_type, hpToHeal);
              if (playerFunds >= healCost) {
                healedHp = unit.hp + hpToHeal;
                playerFunds -= healCost;
              } else if (playerFunds > 0) {
                // Heal as much as affordable (1 HP)
                const partialCost = calculateHealCost(unit.unit_type, 1);
                if (playerFunds >= partialCost) {
                  healedHp = unit.hp + 1;
                  playerFunds -= partialCost;
                }
              }
            }
          }

          // Auto-resupply on friendly properties
          let resupplyAmmo = unit.ammo;
          let resupplyFuel = unit.fuel;
          if (
            standingTile &&
            standingTile.owner_id === newPlayerId &&
            HEALING_BUILDINGS.has(standingTile.terrain_type)
          ) {
            if (unitDataForHeal) {
              const fullAmmo: Record<string, number> = {};
              for (const w of unitDataForHeal.weapons) {
                if (w.ammo > 0) fullAmmo[w.id] = w.ammo;
              }
              resupplyAmmo = { ...unit.ammo, ...fullAmmo };
              if (unit.fuel !== undefined && unitDataForHeal.fuel !== undefined) {
                resupplyFuel = unitDataForHeal.fuel;
              }
            }
          }

          // Fuel consumption at start of turn for air/naval units
          const fuelUpdate: { fuel?: number } = {};
          let crashed = false;
          if (resupplyFuel !== undefined) {
            const fuelPerTurn = unitDataForHeal?.fuel_per_turn ?? 0;
            // Hidden stealth units consume extra fuel
            const extraFuel = unit.is_hidden ? (unitDataForHeal?.fuel_per_turn ?? 0) : 0;
            const totalFuelCost = fuelPerTurn + extraFuel;
            if (totalFuelCost > 0) {
              const newFuel = Math.max(0, resupplyFuel - totalFuelCost);
              fuelUpdate.fuel = newFuel;
              // Air / submerged subs crash at 0 fuel (including already-empty + drain)
              if (newFuel === 0 && (domain === "air" || unit.is_submerged)) {
                crashed = true;
              }
            }
          } else if (unit.fuel !== undefined) {
            const fuelPerTurn = unitDataForHeal?.fuel_per_turn ?? 0;
            if (fuelPerTurn > 0) {
              const newFuel = Math.max(0, unit.fuel - fuelPerTurn);
              fuelUpdate.fuel = newFuel;
              if (newFuel === 0 && (domain === "air" || unit.is_submerged)) {
                crashed = true;
              }
            }
          }

          if (crashed) {
            delete updatedUnits[uid];
          } else {
            updatedUnits[uid] = {
              ...unit,
              hp: healedHp,
              has_moved: false,
              has_acted: false,
              ammo: resupplyAmmo,
              ...(resupplyFuel !== undefined && fuelUpdate.fuel === undefined
                ? { fuel: resupplyFuel }
                : {}),
              ...fuelUpdate,
            };
          }
        }
      }

      // Apply healing cost deduction
      state = updatePlayer(state, newPlayerId, { funds: playerFunds });

      // APC auto-resupply: at start of turn, every friendly APC (and Black Boat)
      // automatically resupplies all adjacent friendly units (AWBW rule).
      // APCs resupply ground units; Black Boats resupply naval units.
      for (const uid in updatedUnits) {
        const supportUnit = updatedUnits[uid];
        if (supportUnit.owner_id !== newPlayerId) continue;
        const supportData = getUnitData(supportUnit.unit_type);
        if (!supportData?.special_actions.includes("resupply")) continue;

        const isBlackBoat = supportUnit.unit_type === "black_boat";

        for (const adjUid in updatedUnits) {
          if (adjUid === uid) continue;
          const adjUnit = updatedUnits[adjUid];
          if (adjUnit.owner_id !== newPlayerId) continue;
          const dist = Math.abs(adjUnit.x - supportUnit.x) + Math.abs(adjUnit.y - supportUnit.y);
          if (dist !== 1) continue;

          const adjData = getUnitData(adjUnit.unit_type);
          if (!adjData) continue;

          if (isBlackBoat) {
            // Black Boat auto-resupply: refill ammo/fuel for adjacent naval units
            if (adjData.domain !== "sea") continue;
          } else {
            // APC auto-resupply: refill ammo/fuel for adjacent ground units only
            if (adjData.domain === "air" || adjData.domain === "sea") continue;
          }

          const fullAmmo: Record<string, number> = {};
          for (const w of adjData.weapons) {
            if (w.ammo > 0) fullAmmo[w.id] = w.ammo;
          }
          const resuppliedAmmo = { ...adjUnit.ammo, ...fullAmmo };
          const resuppliedFuel =
            adjUnit.fuel !== undefined && adjData.fuel !== undefined ? adjData.fuel : adjUnit.fuel;
          updatedUnits[adjUid] = {
            ...updatedUnits[adjUid],
            ammo: resuppliedAmmo,
            ...(resuppliedFuel !== undefined ? { fuel: resuppliedFuel } : {}),
          };
        }
      }

      state = {
        ...state,
        current_player_index: nextIndex,
        turn_number: newTurn,
        units: updatedUnits,
      };

      // Check turn limit — end in a draw (or winner by property count) when exceeded
      if (state.max_turns > 0 && newTurn > state.max_turns) {
        // Count properties owned per player to find winner; tie = no winner
        const propCount: Record<number, number> = {};
        for (const p of state.players) propCount[p.id] = 0;
        for (let py = 0; py < state.map_height; py++) {
          for (let px = 0; px < state.map_width; px++) {
            const t = state.tiles[py]?.[px];
            if (t && t.owner_id >= 0) propCount[t.owner_id] = (propCount[t.owner_id] ?? 0) + 1;
          }
        }
        const entries = Object.entries(propCount).filter(
          ([id]) => !state.players.find((p) => p.id === Number(id))?.is_defeated
        );
        entries.sort((a, b) => b[1] - a[1]);
        const winnerId =
          entries.length >= 2 && entries[0][1] > entries[1][1] ? Number(entries[0][0]) : -1;
        state = { ...state, phase: "game_over", winner_id: winnerId };
      }
      break;
    }
  }

  // Log command
  return {
    ...state,
    command_log: [...state.command_log, cmd as unknown as Record<string, unknown>],
  };
}
