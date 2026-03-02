// Applies a validated command to a GameState, returning the new state.
// IMPORTANT: validateCommand() must be called before this.

import type { GameState, GameCommand } from "./types";
import {
  getUnit, getUnitAt, getPlayer, getTile,
  updateUnit, removeUnit, addUnit, updateTile, updatePlayer,
  getNextUnitId, duplicateState,
} from "./game-state";
import { getUnitData } from "./data-loader";
import { executeCombat, executeSelfDestruct, damageFob } from "./combat";
import { applyIncome } from "./economy";
import { FOB_COST } from "./economy";

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

      state = updateUnit(state, cmd.unit_id, {
        x: cmd.dest_x,
        y: cmd.dest_y,
        has_moved: true,
      });
      break;
    }

    case "ATTACK": {
      const attacker = getUnit(state, cmd.attacker_id)!;
      const defender = getUnit(state, cmd.target_id)!;

      const { result, state: newState, attacker: newAttacker, defender: newDefender } =
        executeCombat(attacker, defender, state, cmd.weapon_index);

      state = newState;

      // Update attacker
      if (result.attacker_destroyed) {
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
        state = removeUnit(state, defender.id);
      } else {
        state = updateUnit(state, defender.id, { hp: newDefender.hp });
      }

      // Consume ammo
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
      });

      const cost = unitData?.cost ?? 0;
      const player = getPlayer(state, cmd.player_id)!;
      state = updatePlayer(state, cmd.player_id, { funds: player.funds - cost });
      break;
    }

    case "LOAD": {
      const transport = getUnit(state, cmd.transport_id)!;
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
      });
      break;
    }

    case "DIG_TRENCH": {
      state = updateTile(state, cmd.target_x, cmd.target_y, { has_trench: true });
      state = updateUnit(state, cmd.unit_id, { has_acted: true, has_moved: true });
      break;
    }

    case "BUILD_FOB": {
      const fobTerrain = getTile(state, cmd.target_x, cmd.target_y);
      const defaultHp = 10;
      state = updateTile(state, cmd.target_x, cmd.target_y, {
        has_fob: true,
        fob_hp: defaultHp,
      });
      state = updateUnit(state, cmd.unit_id, { has_acted: true, has_moved: true });
      const player = getPlayer(state, cmd.player_id)!;
      state = updatePlayer(state, cmd.player_id, { funds: player.funds - FOB_COST });
      break;
    }

    case "SELF_DESTRUCT": {
      const uav = getUnit(state, cmd.unit_id)!;
      const target = getUnit(state, cmd.target_id)!;

      const { damage, state: newState } = executeSelfDestruct(uav, target, state);
      state = newState;

      state = removeUnit(state, uav.id);

      const newHp = Math.max(0, target.hp - damage);
      if (newHp <= 0) {
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
      state = updateUnit(state, cmd.unit_id, { is_submerged: true, has_acted: true, has_moved: true });
      break;
    }

    case "SURFACE": {
      state = updateUnit(state, cmd.unit_id, { is_submerged: false, has_acted: true, has_moved: true });
      break;
    }

    case "RESUPPLY": {
      const target = getUnit(state, cmd.target_id);
      if (target) {
        const targetData = getUnitData(target.unit_type);
        if (targetData) {
          const fullAmmo: Record<string, number> = {};
          for (const w of targetData.weapons) {
            if (w.ammo > 0) fullAmmo[w.id] = w.ammo;
          }
          const patch: Partial<typeof target> = { ammo: fullAmmo };
          // Restore fuel if the unit tracks it
          if (target.fuel !== undefined && "fuel" in targetData) {
            patch.fuel = (targetData as unknown as { fuel: number }).fuel;
          }
          state = updateUnit(state, cmd.target_id, patch);
        }
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

      // Reset all units of new current player
      const newPlayerId = state.players[nextIndex].id;
      const updatedUnits = { ...state.units };
      for (const uid in updatedUnits) {
        const unit = updatedUnits[uid];
        if (unit.owner_id === newPlayerId) {
          updatedUnits[uid] = { ...unit, has_moved: false, has_acted: false };
        }
      }

      // Reset capture points to 20 for any tile where the new player is capturing
      // (capture points only tick during active action, reset means they persist)

      state = { ...state, current_player_index: nextIndex, turn_number: newTurn, units: updatedUnits };
      state = applyIncome(state, newPlayerId);
      break;
    }
  }

  // Log command
  return {
    ...state,
    command_log: [...state.command_log, cmd as unknown as Record<string, unknown>],
  };
}
