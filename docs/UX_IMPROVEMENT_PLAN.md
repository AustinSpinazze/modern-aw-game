# UX Improvement Plan — Loveable-Inspired Refinement

**Goal:** Improve the overall look and feel of Modern AW from game setup through in-game play, without changing tiles, sprites, or core game mechanics. Keep **all existing configuration options**; only improve how they are presented and how game information is communicated.

---

## ⚠️ Core constraint: map and sprites are unchanged

**The map itself and all sprites must not change.** All UX work is limited to the **menus and chrome surrounding the map** — the React UI that frames the game and surfaces information. Those surrounding elements should **enhance gameplay** (clearer turn/funds/unit info, better game log, easier setup, more obvious actions) without touching:

- The **Pixi canvas** — terrain, units, buildings, sprites, highlights, fog overlay, path arrow, cursor, movement/combat animations. No changes to `GameCanvas`, `TerrainRenderer`, `UnitRenderer`, `FogRenderer`, `HighlightRenderer`, `MovementAnimator`, `CombatAnimator`, or any rendering in `src/rendering/`.
- **Map content** — tile art, unit art, tile size, scale, or how the board is drawn.
- **Sprites** — WarsWorld assets and sprite mapping stay as-is.

**What we do change:** Setup screens (MatchSetup), in-game **sidebar** (InfoPanel, TileInfoPanel, ActionLog), **top bar** (if added), **modals** (Settings, Exit, BuyMenu), **ActionMenu** (popup styling only), zoom control **buttons** (position/styling, not canvas behavior). These menus and chrome are the only areas we refine so they better support play.

---

**Reference:** Loveable’s Advance Wars Reimagined UI (main menu, multi-step setup, in-game HUD and game log). We adopt their **presentation style** (dark theme, step indicators, card-style options, clear hierarchy, accent color, typography) while retaining our **mechanics and config** (players, controllers, funds, income, luck, turn limit, fog, AWBW import, saved maps, etc.).

---

## Design principles (from Loveable)

1. **Dark, consistent theme** — Deep navy/blue-grey background; white/light grey text; single accent (e.g. orange/amber) for selected state, primary actions, and progress.
2. **Clear hierarchy** — Section titles + short subtitles; labels and values clearly separated; primary vs secondary actions visually distinct.
3. **Step / progress indication** — For multi-part flows (e.g. setup), show steps (e.g. Opponent → Map → Options → Review) with current step highlighted.
4. **Card-style options** — Each major choice in its own bordered block with title, optional description, and clear selected state (accent background or icon).
5. **Requirements surfaced** — Prerequisites (e.g. “Requires API key”) in a noticeable color (e.g. red) so users see them before choosing.
6. **Prominent primary CTA** — One main button per screen (e.g. “Continue”, “Start Match”, “Deploy Forces”) with accent background and clear label.
7. **Information at a glance** — In-game: header bar (player, turn, funds, units); footer or panel for tile/unit details; game log for “what’s going on.”

---

## Scope (what we do **not** change)

- **The map and sprites:** The Pixi canvas and everything it draws (terrain, units, buildings, highlights, fog, path, cursor, movement/combat animations) are **unchanged**. No edits to `src/rendering/` or to `GameCanvas`’s drawing behavior. The map itself and all sprites stay as they are.
- **Game logic:** `src/game/` — no changes.
- **Config options:** Same options (player count, controller types, starting funds, income multiplier, luck, turn limit, fog of war, AWBW import, saved maps, saved games, test scenario). Same behavior and data flow.
- **Store / hooks:** No change to game state shape or config store; only which components read them and how they’re displayed.

**In short:** Only the **menus and UI surrounding the map** (setup, sidebar, top bar, modals, action menu styling) change — to enhance gameplay, not the board or the art.

---

## Phase 1: Visual system and setup shell

**Objective:** Establish a consistent visual language and a clearer “shell” for the setup screen.

### 1.1 Design tokens (Tailwind / CSS)

- **Background:** Single dark base (e.g. `bg-gray-950` or a custom navy `#0f172a`-style) used for both setup and game views.
- **Accent:** One primary accent (e.g. amber/orange `#f59e0b` or `amber-500`) for:
  - Selected options
  - Primary buttons (Start Match, Continue, Deploy / Launch)
  - Current step in a step indicator
  - Key numbers (e.g. funds) if desired
- **Surfaces:** Slightly lighter panels (e.g. `bg-gray-900` or `gray-800`) for cards and sidebars; subtle borders (`border-gray-700`).
- **Typography:** Clear hierarchy: one “display” style for main titles (e.g. “NEW GAME”, “MODERN AW”), smaller labels for sections, and consistent body size. Optional: single sans-serif stack (e.g. system-ui or a chosen font).
- **Requirements / warnings:** Use a consistent “requirement” color (e.g. red `text-red-400`) for “Requires API key”, “Requires Ollama”, etc.

**Deliverables:** Document or extend Tailwind theme (e.g. in `tailwind.config` or a small `globals.css` layer) with these tokens. Use them across setup and in-game in later phases.

### 1.2 Setup screen shell (MatchSetup)

- **Full-bleed dark background** — MatchSetup sits on the same dark base as the rest of the app (no large white card if we can avoid it; or one clearly defined “content” card with the new surface color).
- **Header:** Top bar with “← Back” (if we add steps later) or just “NEW GAME” on the left; **Settings** on the right; optional app title “Modern AW” or “Advance Wars” style. Use new typography and accent for the active area.
- **Single primary CTA** — “Start Match” (and optionally “Import & Start” for AWBW) as the main accent button; secondary actions (test scenario, load saved map) visually secondary (outline or muted).
- **Continue a Saved Game** — Keep same behavior; present as a distinct card/section with same card style as other blocks (bordered, surface color). “Continue” stays a clear action; delete remains secondary.

No change to which controls exist (player count, controller dropdowns, match settings, AWBW textarea, saved maps); only layout and styling of the container and header.

---

## Phase 2: Game setup flow and option presentation

**Objective:** Make setup feel like a guided flow and present each option in a clearer, Loveable-like way, **without adding or removing config options**.

### 2.1 Optional step indicator (recommended)

- Introduce a **linear step indicator** at the top of the setup content (e.g. “Players & Opponents” → “Map” → “Match options” → “Review”).
- Steps can be implemented as **visual only** (single scrollable page with sections) or as **separate “pages”** with Next/Back. Recommendation: start with **single page + anchored sections** and a step bar that reflects scroll or that we “complete” sections in order (no forced wizard; just visual guidance).
- Current step gets accent color (e.g. orange underline or filled dot); completed steps muted; upcoming steps grey. Matches Loveable’s “OPPONENT | MAP | FACTIONS | OPTIONS | REVIEW”.

### 2.2 Players & opponents (current “Player count” + “Player configs”)

- **Section title:** e.g. “Players & opponents” with subtitle “Choose player count and who controls each army.”
- **Player count:** Keep 2P / 3P / 4P. Style as **segmented control** or **card row**: each option is a small card; selected one has accent background and border (Loveable’s “LOCAL HOT SEAT” selected state).
- **Per-player controller:** Keep: Human, Heuristic AI, Claude (Anthropic), GPT (OpenAI), Local HTTP. Present as **card list** instead of a single dropdown:
  - One card per player (P1, P2, …) with player color hint.
  - Inside each card: **title** (e.g. “Human”, “Heuristic AI”, “Claude (Anthropic)”) and **short description** (e.g. “You play this army.” / “Built-in rule-based AI. No internet required.” / “Use Anthropic API. Requires API key.”).
  - Selected option: accent border + background. **Requirements** (“Requires API key”, “Requires Ollama running”) in red, below the description.
- **Data:** Same `players` array and `controllerType` / `modelId`; only the UI component that edits them changes (e.g. from `<select>` to a list of clickable cards that set the same state).

### 2.3 Map (AWBW import + saved maps)

- **Section title:** “Map” with subtitle “Import an AWBW map or pick a saved map.”
- **Saved maps:** Keep “Continue a Saved Game” and “Saved Maps” as-is in behavior. Present as **card grid or list**: each map is a card with name, dimensions (e.g. 12×9), optional short description or “2P”. Selected map: accent border/background. “Load” as primary action on the card or in a detail area.
- **AWBW import:** Keep textarea and “Import & Start”. Put in a card; keep “Map preview” and minimap below. Optional: “Import & Start” as primary accent button; “Save Map” as secondary.
- **Default / quick start:** If we have a “Start with default map” path, present it as one card (e.g. “Default skirmish map”) so the flow is “pick one of: saved map / paste AWBW / default”.

### 2.4 Match options (current “Match Settings” collapsible)

- **Section title:** “Match options” with subtitle “Fine-tune the rules of engagement.” (Loveable-style.)
- **Keep all options:** Starting funds, income multiplier, luck, turn limit, fog of war. Same values and defaults.
- **Presentation:**
  - **Starting funds:** Segmented row (e.g. ¥0, ¥1k, ¥2k, …) with selected in accent (like Loveable’s “Turn Timer: NONE | 30S | 1M | 2M | 5M”).
  - **Income:** Same idea; selected multiplier in accent.
  - **Luck:** Off / Normal / High as segments or cards; short hint under each (“0%”, “±10%”, “±20%”).
  - **Turn limit:** Unlimited / 20 / 30 / 50 as segments or chips; selected in accent.
  - **Fog of war:** **Toggle** (on/off) with short label “Hide enemy units outside vision range” (Loveable-style). Keep same `config.fogOfWar` and `state.fog_of_war`.
- **Summary strip:** Keep the compact “Funds / Income / Luck / Turns / Fog” summary; style as a small bar or row with muted labels and accent for values so it’s scannable.

### 2.5 Review (optional but recommended)

- **Section:** “Review & launch” with subtitle “Confirm your game configuration.”
- **Content:** Read-only list of current choices: Opponent (per player), Map (name or “AWBW import”), Match options (funds, income, luck, turns, fog). Same data we already have; just displayed as label/value rows in a card (Loveable’s “REVIEW & LAUNCH” table).
- **Actions:** “Back” (or “Edit”) to scroll/focus back to a section; **“Start match”** as single primary accent button (same `handleStart` / `handleAwbwImport` as today). No new logic; only layout and copy.

---

## Phase 3: In-game layout and information

**Objective:** Cleaner in-game chrome: header bar, sidebar, game log, and unit/tile info so “what’s going on” is clearer without changing gameplay or rendering.

### 3.1 Top bar (replacing or complementing current sidebar header)

- **Content (same data as today):** Current player (e.g. “Player 1” / “Orange Star”), “You” vs “AI” indicator, turn number (e.g. “Day 5”), funds, unit count. Optional: opponent mode “MODE AI”.
- **Layout:** Single horizontal bar across the top (full width), dark surface, thin bottom border (e.g. accent or gray). Left: player + turn; right: funds, units, **Menu** button. Use new typography; funds/units can use accent for numbers.
- **Menu button:** Opens the same actions we have today (Settings, Save, Exit). Can be a single “Menu” that opens a dropdown or modal (Loveable’s “COMMAND MENU”: Resume, Intel, End Turn, Options, Save, Quit). We keep: Settings, Save Game, Exit Game; optional: “Resume” as close, “End Turn” shortcut, “Intel” as future placeholder.

### 3.2 Sidebar (left panel)

- **Structure:** Keep left sidebar; unify under the new visual system (same dark surface, borders).
- **Sections (same content, clearer presentation):**
  - **InfoPanel:** Current player block, turn, funds, “End Turn” button, rules summary, player roster. Style as distinct cards with section titles (“Current turn”, “Rules”, “Players”). “End Turn” remains the primary action when it’s human turn; use accent button.
  - **TileInfoPanel:** Keep tile (x,y), terrain name, defense stars, unit (if any), HP, etc. Give it a clear “Tile info” or “Cursor” title; optional subtitle “Terrain and unit at cursor”.
  - **ActionLog:** Rename or style as **“Game log”** (Loveable’s “GAME LOG”). Keep same entries (move, attack, capture, deploy, end turn). Optional: small icon or color dot per action type; slightly more spacing and a max height with scroll. Same `command_log` data.

### 3.3 Unit/tile info refinement

- **TileInfoPanel:** If we show defense stars, keep the same logic; consider a short line of text (e.g. “Defense: ★★★☆”) in addition to or instead of only dots for consistency with “information at a glance.”
- **Selected unit (ActionMenu):** Keep current behavior (move, attack, capture, wait, etc.). Optionally style the popup to match the new system: bordered card, accent for primary action (e.g. “Attack” when applicable), secondary actions muted. No change to which actions exist or when they show.

### 3.4 Footer or cursor context (optional)

- If we want Loveable-style “POS 05 03 | FOREST | ★★★☆” at the bottom: add a thin footer bar that shows hovered tile coords, terrain name, and defense (read from same store as TileInfoPanel). Otherwise, leave TileInfoPanel as the single source of tile info. Optional: “CLICK SELECT” / “ESC DESELECT” hint in footer.

### 3.5 Modals (Settings, Exit confirm, Buy menu)

- **Settings modal:** Keep all fields (API keys, provider, model). Style modal container with same surface and border; primary “Save” or “Done” with accent; section titles for “AI provider”, “Model”, etc.
- **Exit confirm:** Keep copy and behavior; style buttons: “Exit” as danger (red), “Keep playing” as secondary (gray). Match border and background to design tokens.
- **Buy menu:** Keep list of units and cost. Style as a card; “Buy” or “Deploy” as primary accent; “Cancel” secondary.

---

## Phase 4: Polish and consistency

- **Turn banner:** Keep current behavior; optionally style with same team colors and a bit of accent (e.g. border) so it feels part of the system.
- **AI thinking overlay:** Keep; optionally use same surface color and accent dot.
- **Zoom controls:** Keep position and behavior; style buttons with same surface and border; optional accent for “Reset” or current %.
- **Error boundary:** Keep behavior; style error box with danger color and same card style.
- **Keyboard shortcuts:** Keep existing (E End Turn, etc.); optional: add a small “Shortcuts” or “?” tooltip in footer or menu.

---

## Implementation order (suggested)

1. **Design tokens** — Tailwind/theme and one accent; apply to one screen (e.g. MatchSetup container and one button) to validate.
2. **MatchSetup shell** — Background, header, single primary CTA, card treatment for “Continue a Saved Game” and main content area.
3. **MatchSetup options** — Step indicator (optional), then refactor each section (players, map, match options, review) into card-style blocks and segmented controls without changing state shape or handlers.
4. **In-game** — Top bar, then sidebar sections (InfoPanel, TileInfoPanel, ActionLog) with new typography and spacing; then Menu dropdown/modal; then modals (Settings, Exit, Buy).
5. **Polish** — Banners, overlays, zoom, error state.

---

## Files to touch (by phase)

- **Phase 1:** `tailwind.config.*` or `src/index.css`; `MatchSetup.tsx` (container, header, CTA).
- **Phase 2:** `MatchSetup.tsx` (step indicator, players as cards, map as cards, match options as segments/toggles, review section).
- **Phase 3:** `App.tsx` (game layout: top bar, sidebar structure); `InfoPanel.tsx`, `TileInfoPanel.tsx`, `ActionLog.tsx` (styling and labels); `ActionMenu.tsx` (styling only); new or refactored “Menu” component (dropdown or modal listing Settings, Save, Exit).
- **Phase 4:** `App.tsx` (banner, AI overlay, zoom); `SettingsModal.tsx`, `BuyMenu.tsx`, exit modal in `App.tsx`; ErrorBoundary styling.

---

## Success criteria

- All current config options remain available and behave the same (same state, same validation, same start/import/load flows).
- Setup and in-game UI feel consistent: same dark base, one accent, clear hierarchy, and (where applicable) step indicator and card-style options.
- In-game: current turn, funds, units, and game log are easy to see; primary actions (End Turn, Start Match, Continue) are visually primary.
- No changes to `src/game/*`, `src/rendering/*`, or to the data shape of `GameState` / `MatchConfig` beyond any optional additive fields (e.g. “display name” for a map) if desired later.

---

_This plan is a living document. Adjust phases and scope as you implement._
