# Competitive Advance Wars Strategy Reference

Compiled from AWBW wiki, competitive community discussions, and high-level player analysis (notably Deejus Productions). This document serves as the source of truth for AI scoring decisions.

---

## Core Principles

### 1. Unit Count is King

Having more units is almost always better than having fewer expensive units. Cheap units screen, capture, and trade. **Build from every factory every turn** with rare exceptions.

### 2. Contextual Nuance Over Dogma

Every decision — unit composition, attack timing, positioning — must be calibrated against the specific map layout, fog status, and economic state. No fixed rule applies universally.

### 3. Economic Discipline and Force Preservation

Unit count outweighs sheer income generation. Avoid sacking units to chase marginal economic gains. Maintain a conservative stance, let the opponent overextend, then punish with preserved force.

### 4. Terrain is a Force Multiplier

Always favor engaging from forests or cities. **Rule of Three for property capture:**

- Unit 1 & 2: Coordinated strike to eliminate the enemy occupying the target
- Unit 3: Immediately occupy the cleared property
- Failure to occupy after clearing risks counter-attack attrition

### 5. Repair is a Strategic Necessity

- Units at 1-6 HP are ineffective in combat — they can't find profitable targets and are easily destroyed on counter
- Defensive terrain bonuses scale with HP — a damaged unit on a city is weaker than a full-health unit on plains
- Retreat damaged units to owned cities for 2HP/turn repair rather than suiciding them

---

## Build Order Guidelines

### Income Tiers (Standard Funds: 1000/property)

| Income | Factories | Standard Build                                                         |
| ------ | --------- | ---------------------------------------------------------------------- |
| 1-3k   | 1         | Infantry every turn                                                    |
| 4-6k   | 1         | Infantry + save for tank, or 2x infantry                               |
| 7-9k   | 1-2       | Infantry + tank baseline                                               |
| 9-12k  | 2         | 2x infantry + tank                                                     |
| 12-15k | 2-3       | 2x infantry + tank + flex (b_copter/artillery/anti_air)                |
| 16-20k | 2-3       | Infantry from 1-2 bases, tank or md_tank from another, flex from third |
| 20k+   | 3+        | Infantry ratio drops to ~30-40%, combat units from most bases          |

### Infantry Ratio by Game Phase

- Early (9k): ~70% infantry
- Mid (12k): ~60% infantry
- Late-mid (15k): ~40-50% infantry
- Late (20k+): ~30-40% infantry
- **Never drops to zero** — infantry die on the front line and need constant replacement

### First Non-Infantry Unit

Always a **tank**. It is the best unit to fight for contested properties. Never skip the tank opener for a more expensive unit.

---

## Tech-Up Rules

### Md Tank (16,000)

- Default tech-up unit
- Build when: income >= 16k, 2+ factories, 3+ tanks already on field, front is contested/strong
- **Never as the first combat unit** — saving for turn 3-4 md_tank means enemy gets 2 tanks first, and 2 tanks beat 1 md_tank
- Best on strong/contested fronts with infantry wall protection
- Md Tank + Artillery package (22k) is often more efficient than a single Neo Tank

### Neo Tank (22,000)

- Reactive counter to md_tank spam — 6 movement vs 5 gives first-strike advantage
- Reliably one-shots full HP tanks (md_tank cannot without buffs)
- Build when: income >= 22k and enemy has 2+ heavy armor (md_tank/neo_tank)
- In high funds meta (2000+/property), becomes the standard heavy armor choice

### Mega Tank (28,000)

- **Never build in standard funds.** 5 movement, easily kited. Bombers (22k, 7 movement, flight) serve the wallbreaker role better.

---

## The Unit Triangle (Midgame Meta)

**Tank <-> Anti-Air <-> B-Copter** — these three counter each other circularly:

- Tank beats Anti-Air (65% vs 25%)
- Anti-Air beats B-Copter (120% damage)
- B-Copter beats Tank (55% with zero meaningful counter — tanks do 10% with machine gun)

### B-Copter Rules

- Build when enemy has **no AA on the board** — devastating with zero counter
- Cap at 1-2 per airport, 2-3 total
- Stop building when enemy has 2+ anti-air
- B-Copter + own AA combo (17k) forces opponent into lose-lose: AA dies to your AA, B-Copter dies to their AA
- **Killer feature:** flies over infantry walls to hit artillery/rockets behind

### Anti-Air Rules

- First AA is critical when enemy has air units
- One AA per 1-2 enemy air units is sufficient
- Don't mass-produce — 1-2 is enough for zoning/denial
- **Enemy AA spam → build tanks** (hard counter)

### Artillery Rules

- Shines behind infantry walls at chokepoints — unkillable, free damage every turn
- Most cost-efficient counter to Md Tank/Neo Tank (6k for 45% damage at range, no counter)
- **Bad on offense** — can't fire after moving, slow, gets flanked on open maps
- **Bad without screen** — anything kills exposed artillery
- **Bad vs B-Copters** — they fly into dead zone (range 1)
- "Artillery Slide": move to new position this turn, fire from it next turn

---

## Counter-Building Patterns

| Enemy Building     | Counter With                                                                                 | Reasoning                               |
| ------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| Tanks              | Tank (mirror) or Mech (3k, 55% to tank — budget counter)                                     |                                         |
| Multiple tanks     | Md Tank or Artillery behind infantry wall                                                    |                                         |
| Anti-Air spam      | Tanks (65% vs 25%)                                                                           | Stop building B-Copters                 |
| B-Copter           | Anti-Air (120% damage, 8k)                                                                   | One AA per B-Copter                     |
| Multiple B-Copters | Fighter (20k, 100% to B-Copter) if airport available                                         |                                         |
| Md Tank            | Artillery (6k, 45% at range, no counter)                                                     | Two artillery shots = 90% on a 16k unit |
| Md Tank spam       | Neo Tank (first-strike advantage with 6 movement)                                            |                                         |
| Artillery spam     | B-Copters (fly into dead zone) or aggressive tank push                                       | Do NOT try to out-artillery             |
| Mech spam          | Infantry (45% vs mech at 1k — wins value trade 3:1) or B-Copters (75% to mech, mech does 0%) | Exploit 2 movement — flank them         |
| Infantry walls     | Artillery behind your own wall, or B-Copter to bypass                                        |                                         |

---

## Attack Decision Rules

### When to Attack

- **Always attack if:** free hit (no counter), finish off (damage >= enemy HP), or capture denial (enemy capturing your property)
- **Attack if:** good trade (your damage value > their counter value), supported by nearby allies
- **Consider attacking if:** even trade but you have unit count advantage

### When NOT to Attack

- Bad trade: you lose more value than you deal
- Unsupported expensive unit into enemy blob — even if damage numbers look OK, exposed unit gets destroyed next turn
- Infantry into armor — almost never worth it unless denying a capture
- Mirror armor trades without support — first unit to attack usually loses the exchange since the defender gets counter + next turn first strike

### Attack Ordering (Critical)

1. **Artillery/Rockets first** — free damage at range, no counter risk
2. **Free hits second** — any attack where target can't counter (indirect fire, attacking from outside counter range)
3. **Finish-off attacks third** — kill shots remove the unit, preventing their next turn
4. **Supported trades fourth** — attacks where nearby allies can follow up
5. **Direct trades last** — only if favorable by value

---

## Positioning Rules

### Formation Basics

- Infantry in front, tanks/artillery behind (infantry wall)
- Artillery 2-3 tiles behind the front line, covering tiles enemies must pass through
- Never advance artillery alone — move infantry first, advance artillery behind them next turn
- Keep expensive units paired — tanks travel with infantry screen, artillery with infantry wall

### Overextension

- A unit is overextended if it's in enemy threat range without nearby support
- High-value units (tanks, md_tanks) should never push ahead of their infantry screen
- **Test: can this unit survive enemy turn if attacked?** If no, don't send it there alone

### Meatshielding

- Position cheap units (infantry) between enemy threats and expensive units (artillery, tanks)
- A 1k infantry absorbing a hit that would damage a 7k tank is always worth it
- Block lanes to your artillery/rockets with infantry — force enemy to waste actions breaking through

---

## Fund Management

### Core Rule: Spend All Funds Every Turn

Unspent funds produce zero value. An infantry on the field captures, screens, or fights. 1000 gold in the bank does nothing.

### Acceptable Exceptions

- **Saving 1 turn for Md Tank:** underspend by ~1k one turn to build Md Tank next turn
- **Saving for critical counter:** e.g., need AA (8k) but only have 7k — save 1k, still build infantry with remainder
- **All production tiles blocked:** positioning mistake, but can't spend if units are on all factories

### Never Save For

- Neo Tank or Mega Tank across multiple turns — too many turns of underspending
- "Floating" money across multiple turns — every turn you float, opponent gets +1 unit
- Unknown purpose — **when in doubt, build infantry**

---

## Common AI Mistakes to Avoid

1. **Attack-first bias** — attacking whenever possible instead of retreating/repositioning when trade is bad
2. **No formation awareness** — moving units individually instead of as infantry wall + armor formations
3. **Suiciding damaged units** — throwing 3HP units into combat instead of retreating to cities for repair
4. **No meatshielding** — leaving artillery/expensive units exposed instead of blocking with infantry
5. **Building without purpose** — filling factories without considering what the enemy built last turn
6. **Bad attack ordering** — should be: artillery first, then free hits, then finish-offs, then supported trades
7. **Ignoring counter-build cycle** — not reacting to enemy composition changes
8. **Chasing kills over positioning** — occupying key terrain is often worth more than killing a distant infantry
9. **Not blocking properties** — park infantry on enemy-contested properties to deny captures
10. **No tempo concept** — sometimes sacrificing a unit for positional advantage next turn is correct

---

## Sources

- [AWBW Wiki - Basic Strategy Guide](https://awbw.fandom.com/wiki/Basic_Strategy_Guide)
- [AWBW Wiki - Advanced Unit Tactics](https://awbw.fandom.com/wiki/Advanced_Unit_Tactics)
- [AWBW Wiki - Metagame](https://awbw.fandom.com/wiki/Metagame)
- [AWBW Wiki - Neotank](https://awbw.fandom.com/wiki/Neotank)
- [AWBW Wiki - Md. Tank](https://awbw.fandom.com/wiki/Md._Tank)
- [AWBW Wiki - High Funds](https://awbw.fandom.com/wiki/High_Funds)
- [AWBW Wiki - Tier List](https://awbw.fandom.com/wiki/Tier_List)
- Deejus Productions (high-level competitive player content)
