# Unit Reference — Custom Units (Future)

> **Note:** These are CUSTOM units to be added AFTER the base AWBW-style game is rendering correctly.
> The current game uses 19 simplified AWBW units (see `public/data/units.json`).
> Once rendering is stable, these custom units will be added with new sprites.

All 30 custom units. Cost in credits, move points, domain. Damage values are base percentages (HP is 10 for all units).

---

## Ground — Infantry

### Infantry

**Cost:** 1,000 | **Move:** 3 (foot) | **Vision:** 2 | **Can Capture:** Yes
**Weapon:** Rifle (unlimited ammo, range 1)
**Role:** Cheapest capturing unit. The backbone of property control.
**Strengths:** Can capture cities and factories. Cheapest unit in the game. Can dig trenches (via Engineer).
**Weaknesses:** Extremely slow. Rifle does negligible damage to vehicles. Dies in one hit from most direct-fire weapons. No defense against aircraft.
**Counters:** Undefended properties (by capturing). Other infantry in close terrain.
**Countered by:** Everything with wheels, tracks, or wings. Even Recon one-shots infantry effectively.

---

### Mech Infantry

**Cost:** 3,000 | **Move:** 2 (foot) | **Vision:** 2 | **Can Capture:** Yes
**Weapons:** Submachine gun (unlimited, range 1) + Bazooka (3 shots, range 1)
**Role:** Anti-armor infantry. Slow but punches far above its cost vs vehicles.
**Strengths:** Bazooka deals 85% to APCs, 80% to Light Tanks, 55% to Tanks. Can capture. Devastates lightly armored vehicles.
**Weaknesses:** Slowest unit in the game (2 move). Still weak to aircraft and indirect fire. Bazooka has only 3 shots.
**Counters:** APCs, Light Tanks, Recon vehicles. Any armored vehicle that gets adjacent.
**Countered by:** Aircraft, artillery, any vehicle that can avoid being adjacent.

---

### Engineer

**Cost:** 2,500 | **Move:** 3 (foot) | **Vision:** 2 | **Can Capture:** Yes
**Weapon:** Pistol (unlimited, range 1) — very low damage
**Special:** Can dig trenches and build FOBs
**Role:** Utility infantry. Builds field fortifications. Does not fight effectively.
**Strengths:** Only unit that can build trenches and FOBs. Can still capture. Cheaper than Mech.
**Weaknesses:** Worst combat stats of any unit. Pistol barely scratches vehicles. Must survive long enough to build.
**Counters:** Nothing in combat. Indirectly counters enemy offense by fortifying positions.
**Countered by:** Literally everything — prioritize protecting Engineers behind your lines.

---

### Drone Team

**Cost:** 5,000 | **Move:** 2 (foot) | **Vision:** 4 | **Can Capture:** No
**Weapon:** Strike drone (3 shots, range 2–3, cannot counterattack)
**Role:** Indirect-fire infantry. High vision + ranged attack. Cannot be counterattacked.
**Strengths:** Best vision range of any infantry (4). Indirect attack means it attacks without retaliation. Effective vs soft targets and artillery at range.
**Weaknesses:** Slowest alongside Mech. Only 3 shots total. Cannot capture. Weak vs tanks and aircraft. Cannot counterattack if attacked directly.
**Counters:** Exposed artillery, clustered infantry, soft vehicles at range.
**Countered by:** Aircraft (especially fighters), direct-fire vehicles that can close to range 1.

---

## Ground — Vehicles

### Recon

**Cost:** 4,000 | **Move:** 8 (wheeled) | **Vision:** 5 | **Can Capture:** No
**Weapon:** Machine gun (unlimited, range 1)
**Role:** Fast scout. Races to key positions, spots hidden units, shreds infantry.
**Strengths:** Fastest ground vehicle (8 move on roads). Best vision (5). Destroys infantry efficiently. Cheap.
**Weaknesses:** Wheeled — terrible in forests and rivers, impassable on mountains. Thin armor: killed by almost any direct fire. No anti-armor capability.
**Counters:** Infantry, artillery in the open, undefended properties far away.
**Countered by:** Tanks, APCs, any vehicle with a cannon. Artillery. Aircraft.

---

### APC

**Cost:** 5,000 | **Move:** 6 (wheeled) | **Vision:** 2 | **Can Capture:** No
**Weapon:** .50 Cal machine gun (unlimited, range 1)
**Transport:** Carries 2 infantry-class units
**Role:** Armored infantry bus with light suppressive fire. Gets foot soldiers where they need to be fast.
**Strengths:** Transports 2 infantry units (Infantry, Mech, Engineer, Drone Team). Has actual combat capability unlike AW's unarmed APC. Faster than infantry on foot. Decent anti-infantry firepower.
**Weaknesses:** Wheeled — poor off-road. No anti-armor capability (.50 cal scratches at tanks). Vision is only 2.
**Counters:** Infantry in the open. Useful as a blocker/shield for the units it carries.
**Countered by:** Tanks, Mech Infantry (bazooka), aircraft, artillery.

---

### Light Tank (M10 Booker)

**Cost:** 8,000 | **Move:** 7 (tread) | **Vision:** 3 | **Can Capture:** No
**Weapons:** 105mm cannon (ammo 6, range 1) + Coax MG (unlimited, range 1)
**Role:** Fast flanker. Mobile fire support that can threaten main tanks.
**Strengths:** Fastest tracked vehicle (7 move). 105mm deals 75% to APCs, 35% to Heavy Tanks. Coax MG cleans up infantry. Good mobility across all terrain.
**Weaknesses:** Thin armor compared to Abrams/heavy tank. Only 6 cannon rounds. Heavy Tank counters it hard.
**Counters:** APCs, Recon, infantry, Mobile Artillery. Can threaten standard tanks from good position.
**Countered by:** Heavy Tank (90%+ damage), Mech Infantry bazooka, anti-tank aircraft (Apache).

---

### Tank (M1A1 Abrams)

**Cost:** 12,000 | **Move:** 6 (tread) | **Vision:** 3 | **Can Capture:** No
**Weapons:** 120mm gun (ammo 6, range 1) + Coax MG (unlimited, range 1)
**Role:** Main battle tank. Core of any armored push. Balances firepower and mobility.
**Strengths:** Deals 55% to Heavy Tanks, 85% to Light Tanks, 80% to APCs. Can counterattack effectively. Solid all-rounder.
**Weaknesses:** Slower than Light Tank. Loses to Heavy Tank in a straight fight. Expensive.
**Counters:** Most ground vehicles. Infantry in the open. Light Tanks.
**Countered by:** Heavy Tank, Mech Infantry, Apache helicopter, MLRS indirect fire.

---

### Heavy Tank (new Abrams X)

**Cost:** 16,000 | **Move:** 5 (tread) | **Vision:** 2 | **Can Capture:** No
**Weapons:** Heavy cannon (ammo 5, range 1) + Coax MG (unlimited, range 1)
**Role:** Apex land predator. Wins every armored duel but costs and moves accordingly.
**Strengths:** Highest armor and firepower of any ground unit. 90% damage to APCs, 75% to standard Tanks. Coax MG handles infantry.
**Weaknesses:** Slowest tracked unit (5 move, only 2 vision). Very expensive. Apache helicopters and MLRS can still threaten it. Low ammunition (5 cannon rounds).
**Counters:** Every ground vehicle. APCs, Light Tanks, standard Tanks, infantry.
**Countered by:** Apache (Hellfire: 75%), MLRS rockets, Mech Infantry bazooka in large numbers, other Heavy Tanks.

---

### Mobile Artillery (Caesar SPH)

**Cost:** 12,000 | **Move:** 5 (wheeled) | **Vision:** 2 | **Can Capture:** No
**Weapon:** 155mm howitzer (ammo 5, range 2–4, indirect, cannot counterattack)
**Role:** Wheeled indirect fire. Repositions faster than towed but is softer.
**Strengths:** Indirect fire (attacks without moving, no counterattack). Range 2–4 reaches well behind the frontline. Deals 70% to APCs, 45% to Tanks.
**Weaknesses:** Wheeled — slow in rough terrain. Cannot fire on adjacent tiles (min range 2). Very weak defensively. Dies to direct fire fast. Cannot counterattack.
**Counters:** Stationary/slow units, clustered infantry, vehicles caught in the open.
**Countered by:** Recon, fast vehicles that can close to range 1, aircraft.

---

### Towed Artillery (M777)

**Cost:** 6,000 | **Move:** 2 (foot) | **Vision:** 2 | **Can Capture:** No
**Weapon:** 155mm howitzer (ammo 6, range 2–5, indirect, cannot counterattack)
**Role:** Long-range indirect fire platform. Wider range than Mobile Artillery but almost immobile.
**Strengths:** Longest range of any artillery (2–5). More ammo than Mobile Artillery (6 shots). Highest terrain defense since it barely moves and digs in. Cheaper than Mobile Artillery.
**Weaknesses:** Foot movement speed (2) — essentially stationary once deployed. Practically unkillable by slow opponents but helpless vs fast flanks. Range 2–5 means it can't fire at adjacent tiles.
**Counters:** Anything in range. Rear-area units, slow-moving enemy lines.
**Countered by:** Fast flanking units (Recon, Light Tank), aircraft, other indirect fire.

---

### Anti-Air

**Cost:** 8,000 | **Move:** 6 (tread) | **Vision:** 3 | **Can Capture:** No
**Weapons:** AA cannon (unlimited, range 1) + AA missiles (ammo 4, range 1)
**Role:** Mobile air-denial. Keeps enemy aircraft honest anywhere along the front.
**Strengths:** Can counterattack air units. High anti-aircraft damage (70–85% vs helicopters, 65% vs fighters). Tracked — good mobility. Also decent vs infantry (AA cannon).
**Weaknesses:** Minimal anti-armor capability. Missiles and cannon are weak vs tanks. Expensive for a defensive unit.
**Counters:** All aircraft. Helicopters especially. Infantry.
**Countered by:** Tanks, Heavy Tanks, artillery. Any ground vehicle ignores it easily.

---

### Light SAM (TOR-M2)

**Cost:** 8,000 | **Move:** 6 (tread) | **Vision:** 3 | **Can Capture:** No
**Weapon:** TOR missiles (ammo 6, range 1–2, air only)
**Role:** Short-range air denial with extended reach vs Anti-Air.
**Strengths:** Range 1–2 means it can engage aircraft without moving adjacent. Tracked mobility. Good vs all aircraft types.
**Weaknesses:** Air-targets only — completely helpless vs ground threats. Ammo-limited (6 shots). Short range compared to Patriot.
**Counters:** Low-altitude aircraft at range. Better than Anti-Air against aircraft that hover just out of AA range.
**Countered by:** Any ground unit. MLRS, tanks, even infantry can destroy it unopposed.

---

### Heavy SAM (Patriot)

**Cost:** 12,000 | **Move:** 4 (wheeled) | **Vision:** 4 | **Can Capture:** No
**Weapon:** Patriot missiles (ammo 4, range 2–5, air only, indirect)
**Role:** Long-range theater air defense. Denies entire zones to enemy aircraft.
**Strengths:** Range 2–5 indirect fire means it can hit aircraft far from the frontline. Best anti-air range in the game. High air damage (85–95% vs most aircraft).
**Weaknesses:** Wheeled and slow (4 move). Completely useless vs ground. Only 4 missiles. Min range 2 — blind spot if aircraft close in. Cannot counterattack in most cases.
**Counters:** All aircraft within range 2–5. Denies airspace over a large area.
**Countered by:** Every ground unit. Fast aircraft that close to range 1. Ground vehicles of any type.

---

### MLRS (HIMARS)

**Cost:** 12,000 | **Move:** 5 (wheeled) | **Vision:** 2 | **Can Capture:** No
**Weapon:** Rocket artillery (ammo 4, range 3–5, indirect, cannot counterattack)
**Role:** Long-range precision strike. Destroys vehicles, ships, and fortifications at extreme range.
**Strengths:** Longest effective range of any ground unit (3–5). Hits vehicles hard (65% to APCs, 40% to ships). Can hit naval targets! Indirect fire means no counterattack.
**Weaknesses:** Only 4 rockets. Wheeled and slow. Min range 3 — large blind spot. Fragile if caught by fast units.
**Counters:** Vehicles in the open at range, coastal naval units, fortified positions, Heavy SAMs.
**Countered by:** Fast flankers (Recon, aircraft), anything that can close to within range 3.

---

## Air — Helicopters

### Blackhawk (UH-60)

**Cost:** 9,000 | **Move:** 6 (air) | **Vision:** 3 | **Can Capture:** No
**Weapons:** Door gun (unlimited, range 1) + Hellfires (ammo 4, range 1)
**Transport:** Carries 6 infantry-class units
**Role:** Air assault transport. Inserts troops deep into enemy territory.
**Strengths:** Flies over all terrain. Carries 6 infantry — the largest troop transport. Hellfires can threaten vehicles.
**Weaknesses:** Hellfires only do 55% vs APCs, very low vs tanks. Expensive for a transport. Vulnerable to AA.
**Counters:** Undefended territory (by delivering troops). Soft ground targets.
**Countered by:** Anti-Air, Light SAM, Heavy SAM, Fighters. Anything with AA capability.

---

### Chinook (CH-47)

**Cost:** 12,000 | **Move:** 5 (air) | **Vision:** 2 | **Can Capture:** No
**Transport:** Carries 4 vehicles (wheeled/tread/indirect) + requires airport or FOB to load/unload heavy cargo
**Role:** Strategic heavy-lift. Relocates tanks and artillery over obstacles.
**Strengths:** Can transport vehicles (tanks, artillery) — unique strategic capability. Flies over terrain.
**Weaknesses:** No weapons at all — completely defenseless. Slow for an aircraft (5 move). Requires airport or FOB for vehicle loading. Very expensive.
**Counters:** Nothing in combat. Strategically counters terrain by airlifting vehicles past rivers/mountains.
**Countered by:** Any aircraft, any AA unit. Must be escorted at all times.

---

### Apache (AH-64)

**Cost:** 16,000 | **Move:** 6 (air) | **Vision:** 3 | **Can Capture:** No
**Weapons:** Chaingun (unlimited, range 1) + Hellfire missiles (ammo 4, range 1)
**Role:** Tank hunter. The most lethal anti-armor aircraft in the game.
**Strengths:** Hellfire: 75% damage to APCs, 55% to standard Tanks, 35% to Heavy Tanks. Chaingun handles infantry. Flies over terrain.
**Weaknesses:** Short range (1) means it must close in. Hellfire has only 4 shots. Vulnerable to AA. Expensive.
**Counters:** APCs, Light Tanks, standard Tanks. The answer to a tank column.
**Countered by:** Anti-Air, Light SAM, Heavy SAM, Fighters. Loses badly to dedicated AA.

---

## Air — Fixed Wing

### Fighter (F-16/F-35)

**Cost:** 20,000 | **Move:** 9 (air) | **Vision:** 5 | **Can Capture:** No
**Weapons:** Air-to-air missiles (ammo 6, range 1–2, air only) + bombs (ammo 4, range 1)
**Role:** Air superiority. Clears the sky of helicopters and other aircraft.
**Strengths:** Fastest unit in the game (9 move). Best vision (5). Devastates all aircraft. Can lightly attack ground targets with bombs.
**Weaknesses:** Air-to-air missiles can only hit aircraft. Bombs have limited ground effectiveness vs armor. Extremely expensive.
**Counters:** All helicopters, UAVs, other aircraft. Dominates the air.
**Countered by:** Heavy SAM (at range), Anti-Air in groups, other Fighters.

---

### Air Tanker (KC-135)

**Cost:** 14,000 | **Move:** 7 (air) | **Vision:** 2 | **Can Capture:** No
**Special:** Resupply action — restores ammo and fuel to adjacent friendly aircraft
**Role:** Aerial refueler. Extends air operations by resupplying fighters and helicopters mid-mission.
**Strengths:** Only unit that can resupply aircraft without returning to an airport. Dramatically extends air unit endurance.
**Weaknesses:** Completely unarmed. Useless in combat. Must survive — if it dies your air units must RTB to resupply. Low vision.
**Counters:** Nothing directly. Counters attrition against your air wing.
**Countered by:** Everything. Fighters, AA, anything. Must be heavily protected.

---

### Heavy Cargo (C-17)

**Cost:** 16,000 | **Move:** 6 (air) | **Vision:** 2 | **Can Capture:** No
**Transport:** Carries 4 units (any ground/vehicle tags) + requires airport or FOB
**Role:** Strategic heavy airlift. Moves an entire vehicle force across the map in one turn.
**Strengths:** Largest vehicle capacity of any transport. Can move tanks, artillery, and heavy vehicles. Game-changing strategic mobility.
**Weaknesses:** No weapons. Requires airport or FOB to load/unload. Slow for a plane. Very expensive.
**Counters:** Nothing in combat. Counters terrain by airlifting forces anywhere.
**Countered by:** Any unit that can reach it. Must be protected like the Chinook.

---

### P-8 Poseidon

**Cost:** 18,000 | **Move:** 7 (air) | **Vision:** 5 | **Can Capture:** No
**Weapons:** Depth torpedo (ammo 4, range 1–2, submarine-only: 95% damage) + sonar ping
**Role:** Anti-submarine warfare aircraft. The only unit that can reliably destroy submerged submarines.
**Strengths:** 95% damage to submarines — nearly one-shot kill. Range 1–2 means it doesn't need to be directly above. High vision (5).
**Weaknesses:** Depth torpedo is useless against any surface target. Sonar ping is utility, not combat. Very expensive. Fragile vs AA.
**Counters:** Submarines exclusively. Essential if enemy has a submarine.
**Countered by:** Fighters, Heavy SAM. Useless without submarines to hunt.

---

### UAV

**Cost:** 6,000 | **Move:** 8 (air) | **Vision:** 6 | **Can Capture:** No
**Weapon:** None (fragile, dies easily)
**Role:** Reconnaissance drone. Best vision in the game, expendable cost.
**Strengths:** Vision 6 — sees further than any other unit. Cheap. Flies over all terrain. Fast (8 move).
**Weaknesses:** Fragile — anything kills it easily (tagged "fragile", high damage taken from all weapons). No weapons at all.
**Counters:** Nothing in combat. Counters fog of war — reveals large areas cheaply.
**Countered by:** Everything. Treat as scouting expenditure, not a combat unit.

---

## Naval

### Lander

**Cost:** 12,000 | **Move:** 6 (naval) | **Vision:** 2 | **Can Capture:** No
**Transport:** Carries 2 ground units (infantry, vehicles, artillery, AA — all ground types)
**Role:** Amphibious transport. Moves land forces across sea tiles and deposits them at shoals and ports.
**Strengths:** Only naval unit that can transport ground vehicles (including tanks and artillery). Allows beach assaults. Load/unload at shoals or ports.
**Weaknesses:** No weapons — completely defenseless. Must unload at shore (shoal) or port. Vulnerable to Destroyers, Submarines, aircraft.
**Counters:** Nothing in combat. Strategically opens second-front amphibious assaults.
**Countered by:** Destroyers, Submarines, aircraft. Any naval unit.

---

### Resupply Ship

**Cost:** 12,000 | **Move:** 5 (naval) | **Vision:** 3 | **Can Capture:** No
**Special:** Resupply action — restores ammo and fuel to adjacent friendly naval units (surface only, not submarines)
**Role:** Naval logistics. Keeps surface ships fighting without returning to port.
**Strengths:** Essential for long naval campaigns. Prevents ships from running dry on ammo. Decent vision.
**Weaknesses:** No weapons at all. Cannot resupply submarines. Slow. Dies to Destroyers and Submarines.
**Counters:** Nothing. Sustains your fleet.
**Countered by:** Everything — Destroyers, Submarines, aircraft. Must be escorted.

---

### Destroyer (Arleigh Burke DDG)

**Cost:** 18,000 | **Move:** 6 (naval) | **Vision:** 4 | **Can Capture:** No
**Weapons:** Naval guns (unlimited, range 1–2) + Depth charges (ammo 6, range 1, submarine-only: 90%) + Destroyer SAM (ammo 4, range 1–2, air only)
**Role:** Multi-role surface combatant and sub hunter. The core naval warship.
**Strengths:** Can engage surface ships, submarines, AND aircraft. Depth charges: 90% vs submarines. SAM handles helicopters. Good vision (4).
**Weaknesses:** Outgunned by Cruiser in surface combat. No cruise missile capability.
**Counters:** Landers, Resupply Ships, Submarines (with depth charges), low-flying aircraft.
**Countered by:** Cruiser (outranges and outguns it), Submarines that dive before engagement.

---

### Submarine (Virginia class)

**Cost:** 20,000 | **Move:** 5 (sub) | **Vision:** 3 | **Can Capture:** No
**Weapons:** Torpedoes (ammo 6, range 1–2, vs surface ships) + Cruise missiles (ammo 3, range 3–5, vs ground/naval)
**Special:** Submerge (becomes invisible to enemy, can only be spotted by P-8 or adjacent units) / Surface
**Role:** Stealth predator. Ambushes surface ships and strikes deep inland with cruise missiles.
**Strengths:** Submerge makes it invisible — enemy must find it with P-8 or stumble adjacent. Torpedoes: 75% vs Destroyers, 80% vs Cruisers. Cruise missiles: 65% vs ground vehicles at range 3–5.
**Weaknesses:** Depth charges and P-8 hard-counter it. Cruise missiles only 3 shots. Slower than surface ships.
**Counters:** Surface ships (especially Landers and Resupply Ships). Inland targets via cruise missiles.
**Countered by:** P-8 Poseidon (95% per hit), Destroyers with depth charges (90%), adjacent surface detection.

---

### Cruiser (Ticonderoga CG)

**Cost:** 24,000 | **Move:** 5 (naval) | **Vision:** 4 | **Can Capture:** No
**Weapons:** Cruise missiles (ammo 6, range 2–4, vs ground/naval) + Aegis SAM (ammo 8, range 1–4, air only)
**Role:** Capital surface combatant. Strikes anything — land, sea, or air — at range.
**Strengths:** Cruise missiles hit land AND naval targets at range 2–4. Aegis SAM range 1–4 dominates airspace. Hardest-hitting surface warship vs land targets.
**Weaknesses:** Expensive. No anti-submarine capability (no depth charges). Submarines threaten it.
**Counters:** Destroyers, ground vehicles near the coast, helicopters and aircraft (via Aegis).
**Countered by:** Submarines (70–80% torpedo damage), P-8 Poseidon if supported, MLRS (40%).

---

### Aircraft Carrier

**Cost:** 32,000 | **Move:** 4 (naval) | **Vision:** 3 | **Can Capture:** No
**Weapon:** CIWS (unlimited, range 1, air-only last-ditch defense)
**Transport:** Carries 4 aircraft (any helicopter or fixed-wing except tanker/cargo types)
**Special:** Carrier resupply — restores ammo and fuel to all embarked aircraft
**Role:** Mobile airbase. Projects air power far from land airfields.
**Strengths:** Carries 4 aircraft and resupplies them at sea. CIWS provides last-ditch AA. Enables sustained air operations over the ocean.
**Weaknesses:** Most expensive unit in the game. Slowest vessel (4 move). Losing it loses 4 aircraft and all strategic air projection. CIWS is weak AA — must have escorts.
**Counters:** Nothing directly. Strategically dominates any theater within air range.
**Countered by:** Submarines (dive before detection, torpedo for high damage), MLRS, massed aircraft that saturate CIWS.

---

## Quick Reference

| Unit             | Cost   | Move | Domain | Role Tag                |
| ---------------- | ------ | ---- | ------ | ----------------------- |
| Infantry         | 1,000  | 3    | Ground | Capture                 |
| Mech             | 3,000  | 2    | Ground | Anti-armor infantry     |
| Engineer         | 2,500  | 3    | Ground | Builder                 |
| Drone Team       | 5,000  | 2    | Ground | Indirect/Recon          |
| Recon            | 4,000  | 8    | Ground | Scout                   |
| APC              | 5,000  | 6    | Ground | Transport + suppression |
| Light Tank       | 8,000  | 7    | Ground | Fast armor              |
| Tank             | 12,000 | 6    | Ground | Main battle             |
| Heavy Tank       | 16,000 | 5    | Ground | Apex armor              |
| Mobile Artillery | 12,000 | 5    | Ground | Mobile indirect         |
| Towed Artillery  | 6,000  | 2    | Ground | Long-range indirect     |
| Anti-Air         | 8,000  | 6    | Ground | Air denial              |
| Light SAM        | 8,000  | 6    | Ground | Short-range AA          |
| Heavy SAM        | 12,000 | 4    | Ground | Theater AA              |
| MLRS             | 12,000 | 5    | Ground | Long-range strike       |
| Blackhawk        | 9,000  | 6    | Air    | Troop transport         |
| Chinook          | 12,000 | 5    | Air    | Heavy lift              |
| Apache           | 16,000 | 6    | Air    | Tank hunter             |
| Fighter          | 20,000 | 9    | Air    | Air superiority         |
| Air Tanker       | 14,000 | 7    | Air    | Aerial resupply         |
| Heavy Cargo      | 16,000 | 6    | Air    | Strategic airlift       |
| P-8 Poseidon     | 18,000 | 7    | Air    | Sub hunter              |
| UAV              | 6,000  | 8    | Air    | Recon                   |
| Lander           | 12,000 | 6    | Sea    | Amphibious transport    |
| Resupply Ship    | 12,000 | 5    | Sea    | Naval logistics         |
| Destroyer        | 18,000 | 6    | Sea    | Multi-role warship      |
| Submarine        | 20,000 | 5    | Sea    | Stealth/strike          |
| Cruiser          | 24,000 | 5    | Sea    | Capital strike          |
| Aircraft Carrier | 32,000 | 4    | Sea    | Mobile airbase          |
