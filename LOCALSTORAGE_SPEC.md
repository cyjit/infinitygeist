# Mission Geist — Client-Side Persistence Spec

**Status:** Proposed  
**Date:** March 22, 2026  
**Applies to:** `index.html` in the `cyjit/infinitygeist` repo (GitHub Pages)

---

## 1. Problem Statement

Mission Geist is a single-file HTML webapp for Infinity the Game's ITS Season 17 tournament system. It runs entirely client-side on GitHub Pages — no server, no build step, no backend. The app has grown beyond its original scope as a static reference tool. It now includes interactive game-tracking features: objective scoring with checkboxes and counters, classified objective drawing from a simulated deck, per-round scoring checkboxes, and a dice roller widget.

All of this mutable state currently lives exclusively in the JavaScript runtime and the DOM. There is no backing data model — checkbox states exist only as DOM attributes, drawn classifieds exist only in the `drawnClassifieds` array, and score totals are computed on-the-fly by walking the DOM.

This causes two categories of problems:

### 1.1 Refresh Fragility

The app uses hash-based routing. Every call to `renderRoute()` (the central router, triggered by `hashchange` and on initial load) explicitly resets `drawnClassifieds = []` and rebuilds the entire `#content` div from scratch via `innerHTML`. A browser refresh, an accidental back-navigation, or any hash change during a game wipes all in-progress state: score, checked objectives, drawn classifieds, round tracking. The user has to start over.

This is not a single bug — it's a structural issue. The app assumes state is set during a navigation flow (clicking into a mission) and never needs to survive that flow being interrupted.

### 1.2 No Foundation for User Preferences

Community feedback has included requests for: alternative themes, favorite missions that pin to the top of the grid, and curated mission lists for upcoming events (e.g., the existing Adepticon filter, but user-defined). The predecessor app (ComLog) provided these via native phone storage. Mission Geist's architecture currently has no mechanism for remembering anything about the user across sessions.

---

## 2. Design Constraints

These constraints are non-negotiable and come from the project's founding design philosophy:

- **Single HTML file.** The entire app ships as one `index.html` with embedded CSS and JS. No build step, no bundler, no external JS dependencies.
- **Static hosting only.** GitHub Pages. No server-side anything. No databases, no APIs, no auth.
- **Lightweight.** The full app including inline images is ~300KB. The persistence layer must add negligible weight — ideally under 1KB of code.
- **No mandatory persistence.** The app must function perfectly with localStorage unavailable (incognito, disabled, full). Persistence is a progressive enhancement.

---

## 3. Proposed Solution: localStorage

Use the browser's `localStorage` API. It requires zero infrastructure, adds no dependencies, works on every browser the app targets, and is available to any static HTML file. Data is per-origin (protocol + domain + port), persists across browser restarts, and is scoped to `https://cyjit.github.io`.

### 3.1 Why Not IndexedDB / Other Options

- **IndexedDB** is async, more complex, and designed for large structured datasets. Mission Geist's persistence needs are measured in low single-digit kilobytes. localStorage is the right tool.
- **sessionStorage** dies with the tab. Doesn't solve the refresh problem for game state, and is useless for preferences.
- **Cookies** are sent with HTTP requests and size-limited to ~4KB. Wrong tool for client-side app state.
- **Cache API / Service Workers** are for asset caching (PWA offline), not application data.

### 3.2 Storage Budget

localStorage provides ~5–10MB per origin. The app's total footprint including images is ~300KB. Even aggressive game state + preferences will occupy well under 10KB. The ceiling is irrelevant here.

---

## 4. Persistence Tiers

Two tiers with different lifecycles and expectations.

### 4.1 Tier 1 — Game Session State

**Purpose:** Survive refreshes and accidental navigations during an active game.  
**Lifecycle:** Written on every state-changing interaction. Cleared explicitly by user action ("New Game" button) or optionally by a staleness heuristic.  
**User expectation:** "I refreshed and my game is still there."

**localStorage key:** `geist_game`

**Schema:**

```json
{
  "missionId": "b_pong",
  "objectives": {
    "obj-0": true,
    "obj-1": false,
    "obj-3": true
  },
  "counters": {
    "counter-0": 2,
    "counter-1": 0
  },
  "roundChecks": {
    "round-0-r1": true,
    "round-0-r2": false,
    "round-0-r3": false,
    "round-1-r1": true,
    "round-1-r2": true,
    "round-1-r3": false
  },
  "classifiedChecks": [true, false],
  "drawnClassifieds": [3, 17, 8],
  "timestamp": 1711152000000
}
```

**What gets saved:**
- Which mission is active (`missionId`)
- Boolean state of each objective checkbox, keyed by a stable identifier
- Integer value of each repeatable counter
- Boolean state of each per-round checkbox (R1/R2/R3 per round-scored objective)
- Boolean state of each classified scoring checkbox
- The indices into the `CLASSIFIEDS` array for drawn classified cards
- A timestamp for staleness detection

**What does NOT get saved:**
- The computed score total (derived — recompute from the above on load)
- Dice roller log (ephemeral by design, has its own clear button)
- Section collapse/expand states (low value, adds complexity)

### 4.2 Tier 2 — User Preferences

**Purpose:** Remember user choices across sessions and visits.  
**Lifecycle:** Written on user action. Persists indefinitely until the user clears browser data or the app provides a reset mechanism.  
**User expectation:** "My settings are still there next week."

**localStorage key:** `geist_prefs`

**Schema (initial — extend as features ship):**

```json
{
  "version": 1,
  "favorites": ["b_pong", "hardlock"],
  "eventList": {
    "name": "My Event",
    "missions": ["evacuation", "crossing_lines", "akial_interference"]
  },
  "theme": "default",
  "missionFilter": null
}
```

**Planned preference features (not all in initial implementation):**
- **Favorite missions:** Star/pin missions to the top of the grid. Stored as an array of mission IDs.
- **Custom event lists:** User-defined filtered mission list, similar to the hardcoded Adepticon filter. One active event list at a time.
- **Theme selection:** If/when alternative themes ship. Stored as a string key.
- **Persistent mission filter:** Remember the last active filter (e.g., Adepticon) across sessions.

**The `version` field** allows future schema migrations. If the stored version doesn't match the expected version, the app can migrate or discard gracefully.

---

## 5. Architecture

### 5.1 Storage Utility Layer

A thin set of functions at the top of the `<script>` block. No classes, no framework, no abstraction beyond what's needed. These are internal utilities — they don't touch the DOM.

```
// --- Storage Utilities ---

function saveGameState(state)
  // Writes the game state object to localStorage under 'geist_game'.
  // Serializes with JSON.stringify. Silently no-ops if localStorage unavailable.

function loadGameState()
  // Reads and parses 'geist_game' from localStorage.
  // Returns the parsed object, or null if absent/corrupt/unavailable.

function clearGameState()
  // Removes 'geist_game' from localStorage.

function savePreferences(prefs)
  // Writes the preferences object to localStorage under 'geist_prefs'.

function loadPreferences()
  // Reads and parses 'geist_prefs'. Returns parsed object or default prefs.

function isLocalStorageAvailable()
  // Feature-detection test. Returns boolean.
```

All read/write operations are wrapped in try/catch. A failure in persistence never breaks the app — it just means state won't survive a refresh. The app's behavior without localStorage must be identical to its behavior today.

### 5.2 In-Memory Game State Object (Source of Truth)

**Critical design decision:** The `gameState` object — not the DOM — is the authoritative source of game state.

Currently, the app has no state model. Checkbox values exist only as DOM attributes, counter values exist only as `.textContent`, and `drawnClassifieds` is a loose global array. The DOM is the state machine. This is brittle: if a CSS class name changes, a wrapper div is added, or the rendering structure shifts in a future update, any persistence logic that reads from the DOM will silently break.

Instead, introduce a single global `gameState` object that mirrors the localStorage schema:

```js
let gameState = null; // null = no active game
```

When populated, it holds the same shape as the `geist_game` localStorage value (see Section 4.1 schema). The rules:

1. **Interactions update `gameState` AND the DOM simultaneously.** When the user checks a checkbox, the handler updates the DOM (as it does today) and also updates the corresponding field in `gameState`.
2. **Persistence reads from `gameState`, never from the DOM.** The `saveGameState()` call simply serializes `gameState` to localStorage. No DOM walking.
3. **Rehydration writes to the DOM from `gameState`.** On load, if saved state exists, populate `gameState` from localStorage, then set DOM elements to match.
4. **`recalcScore()` continues to read from the DOM** for score computation — this is fine because the DOM and `gameState` are kept in sync by the interaction handlers. The score itself is derived and not stored.

This decouples the storage schema from the HTML structure entirely. The persistence layer doesn't know or care what CSS classes exist or how the DOM is organized.

### 5.3 Integration Points in Existing Code

The following existing functions need modification:

#### `renderRoute()` (line ~2715)

**Current behavior:** Always sets `drawnClassifieds = []` and renders from scratch.

**New behavior:**
- If navigating to a mission detail view (`mission/{id}`):
  - Call `loadGameState()`.
  - If a saved game exists, its `missionId` matches the current route, and it passes the staleness check (see 5.5), assign it to the global `gameState` and restore `drawnClassifieds` from it.
  - After calling `renderMissionDetail(m)` and inserting the HTML, call `rehydrateDOM()` to set DOM elements to match `gameState`.
  - If no saved game exists, the mission doesn't match, or the state is stale, initialize a fresh `gameState` for the current mission with all values at defaults (unchecked, zero counters, empty classifieds).
- If navigating away from a mission detail view, do NOT clear game state (user might come back).

#### `recalcScore()` (line ~2772)

**Current behavior:** Reads DOM checkboxes/counters, computes total, updates the display.

**New behavior:** After computing and displaying the total, call `debouncedSave()` — a debounced wrapper around `saveGameState(gameState)`. This means every checkbox toggle, every counter adjustment, and every round check automatically persists, but rapid interactions (e.g., clicking a counter 4 times quickly) only write to localStorage once after a short delay.

The debounce is a simple `clearTimeout`/`setTimeout` at ~500ms. `JSON.stringify` on a 20-key object is sub-millisecond work, so this is good hygiene rather than a performance necessity.

#### Checkbox and counter `onchange`/`onclick` handlers

**Current behavior:** Checkbox `onchange` calls `recalcScore()`. Counter buttons call `adjustObj()` which calls `recalcScore()`.

**New behavior:** Each handler additionally updates the corresponding field in `gameState` before calling `recalcScore()`. For example:
- An objective checkbox toggle: `gameState.objectives['obj-' + idx] = this.checked;`
- A counter adjustment: `gameState.counters['counter-' + idx] = newValue;`
- A round checkbox toggle: `gameState.roundChecks['round-' + objIdx + '-r' + round] = this.checked;`
- A classified scoring checkbox: `gameState.classifiedChecks[idx] = this.checked;`

This is the only place where the `data-*` index attributes matter — the handler needs to know which index it corresponds to in order to update the right `gameState` field. Add `data-obj-idx`, `data-round-idx`, `data-counter-idx`, and `data-class-idx` attributes during rendering in `renderMissionDetail()`.

#### `drawClassified()` / `dismissClassified()` (lines ~2815, ~2823)

**Current behavior:** Mutates `drawnClassifieds` array, re-renders the drawn list.

**New behavior:** After mutating and re-rendering, also update `gameState.drawnClassifieds` (which should be the same reference as the global `drawnClassifieds` — or just use `gameState.drawnClassifieds` directly and retire the standalone global) and call `debouncedSave()`.

#### `adjustObj()` (line ~2801)

**Current behavior:** Updates counter display, calls `recalcScore()`.

**New behavior:** Also updates `gameState.counters['counter-' + idx]` with the new value. Persistence happens via `recalcScore()` → `debouncedSave()`.

#### New: `rehydrateDOM()` function

Called after `renderMissionDetail()` has built the DOM, only when `gameState` contains restored data. Walks `gameState` and sets DOM elements to match:
- Sets `.checked` and parent `li` classes for objective checkboxes
- Sets `.textContent` for counter spans
- Sets `.checked` and label styling for round checkboxes
- Sets `.checked` for classified scoring checkboxes
- Restores `drawnClassifieds` from `gameState.drawnClassifieds` and calls `renderDrawnClassifieds()`
- Calls `recalcScore()` once at the end to update the total display (without triggering a save, since we just loaded)

This function must be defensive — if the DOM has fewer elements than `gameState` expects (e.g., mission data changed between deploys), silently skip mismatches rather than crash.

#### New: `initGameState(missionId)` function

Creates a fresh `gameState` object for a given mission with all defaults:
```js
{
  missionId: missionId,
  objectives: {},
  counters: {},
  roundChecks: {},
  classifiedChecks: [],
  drawnClassifieds: [],
  timestamp: Date.now()
}
```

Called when entering a mission with no saved state or after clearing.

#### New: "New Game" / "Clear Game" button

Added to the mission detail header area (next to the existing "← All Missions" back button and "RAND" button). Styled consistently with `rand-btn`. On click:
- Calls `clearGameState()` (removes from localStorage)
- Calls `initGameState(currentMissionId)` (resets the in-memory object)
- Re-renders the current mission detail view (which will now render fresh since `gameState` is at defaults)

This is the explicit "reset" mechanism. Without it, stale game state would persist indefinitely.

### 5.4 Staleness Handling

The `timestamp` field enables a simple staleness check. On load, if a saved game's timestamp is older than a configurable threshold (suggest 12 hours), silently auto-clear and start fresh.

No prompt, no modal, no `confirm()` dialog. The "New Game" button is the primary user-facing mechanism for clearing state intentionally. The staleness check is just a safety net for abandoned sessions — if someone played last night and opens the app today, they get a clean slate without having to think about it. The edge case of genuinely wanting to resume a 12+ hour old game is vanishingly rare in a tournament context.

```js
const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

function isGameStateStale(state) {
  return state && (Date.now() - state.timestamp > STALE_THRESHOLD_MS);
}
```

### 5.5 Key Naming and Namespacing

All localStorage keys are prefixed with `geist_` to avoid collisions if the `cyjit.github.io` origin ever hosts other apps or pages. Current keys:
- `geist_game` — Tier 1 game session
- `geist_prefs` — Tier 2 user preferences

### 5.6 Stable Element Identification

The current DOM has no stable IDs on most interactive elements. Objective checkboxes use `id="obj-{i}"` where `i` is the index in the mission's `objectives` array. Round checkboxes and counters have no IDs.

Add `data-obj-idx`, `data-round-idx`, `data-counter-idx`, and `data-class-idx` attributes during rendering in `renderMissionDetail()`. These attributes serve two purposes:
1. **Interaction handlers** use them to know which `gameState` field to update when the user interacts with an element.
2. **`rehydrateDOM()`** uses them to map `gameState` fields back to the correct DOM elements during restore.

The index values are positional within the mission's data arrays, which are stable as long as the mission data doesn't change between save and restore. This is acceptable because:
- Mission data only changes with app updates (new deploys)
- The `missionId` check ensures we only restore state for the correct mission
- If mission data changes between deploys, stale game state will simply not match and is silently ignored

### 5.7 Debounced Save

A simple debounce wrapper to avoid redundant localStorage writes during rapid interactions:

```js
let _saveTimeout = null;
function debouncedSave() {
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    if (gameState) {
      gameState.timestamp = Date.now();
      saveGameState(gameState);
    }
  }, 500);
}
```

This is good hygiene, not a performance fix — `JSON.stringify` on a small object and `localStorage.setItem` on a ~500 byte string are sub-millisecond operations. The debounce prevents writing 4 times when someone clicks a counter 4 times in quick succession.

---

## 6. What NOT to Persist

Explicitly out of scope for this implementation:

- **Dice roller log.** Ephemeral by nature. Has its own clear button. Users don't expect dice history to survive sessions.
- **Section collapse/expand state.** Low value relative to complexity. Sections have sensible defaults (objectives and deployment open, shared rules collapsed).
- **Scroll position.** Browser handles this natively for same-page navigation.
- **Multi-game history / game log.** Would require a significantly more complex data model. If there's demand, it's a separate feature with its own spec.
- **Cross-device sync.** Requires a server. Out of scope permanently given the project's design constraints.
- **Anything requiring user accounts or authentication.**

---

## 7. Migration and Versioning

### 7.1 Game State

No versioning needed. Game state is ephemeral by nature — if the schema changes between deploys, stale state that doesn't match the current mission simply gets cleared. The `missionId` check is sufficient.

### 7.2 Preferences

The `version` field in `geist_prefs` enables forward-compatible schema changes. Migration logic:

```
const PREFS_VERSION = 1;

function loadPreferences() {
  try {
    const raw = localStorage.getItem('geist_prefs');
    if (!raw) return defaultPrefs();
    const prefs = JSON.parse(raw);
    if (prefs.version !== PREFS_VERSION) return migratePrefs(prefs);
    return prefs;
  } catch (e) {
    return defaultPrefs();
  }
}
```

Where `migratePrefs()` handles known version transitions and `defaultPrefs()` returns the base schema with sensible defaults.

---

## 8. Implementation Order

### Phase 1: Game Session Persistence (ship first)

This solves the immediate, tangible pain point — the refresh bug and game state loss.

1. Add storage utility functions (`save/load/clearGameState`, `isLocalStorageAvailable`, `debouncedSave`)
2. Add `data-*` index attributes to rendered interactive elements in `renderMissionDetail()` for stable identification
3. Introduce the global `gameState` object and `initGameState(missionId)` constructor
4. Update interaction handlers (checkbox `onchange`, `adjustObj`, `drawClassified`, `dismissClassified`) to write to `gameState` in addition to the DOM
5. Wire `debouncedSave()` into `recalcScore()` and classified draw/dismiss functions
6. Implement `rehydrateDOM()` — sets DOM element states from a populated `gameState`
7. Modify `renderRoute()` to load saved state, check staleness, populate `gameState`, and call `rehydrateDOM()` when appropriate
8. Add "New Game" / "Clear" button to mission detail header
9. Test: refresh mid-game, navigate away and back, clear game, stale game auto-clear, localStorage unavailable

### Phase 2: User Preferences Foundation (ship when first preference feature is ready)

1. Add `save/loadPreferences()` utility functions with versioning
2. Load preferences on app init
3. Implement first preference feature (likely favorites — highest demand signal from feedback)
4. Wire preference saves into the relevant UI interactions

### Phase 3: Preference Features (incremental, feature-by-feature)

- Favorite missions (star toggle on mission tiles, sort favorites to top)
- Custom event lists (user-defined mission filter, replacing or supplementing hardcoded Adepticon list)
- Theme persistence (if/when themes ship)
- Filter persistence (`missionFilter` survives sessions)

---

## 9. Testing Checklist

### Game State

- [ ] Start a game, check some objectives, draw classifieds, adjust counters → refresh → all state restored
- [ ] Start a game → navigate to Rules tab → navigate back to mission → state restored
- [ ] Start a game on Mission A → navigate to Mission B → navigate back to Mission A → Mission A state restored (only if Mission A was the most recently saved game)
- [ ] Start a game → click "New Game" → all state cleared, fresh mission view
- [ ] Start a game → wait beyond staleness threshold → reload → state silently cleared, fresh start
- [ ] Open app in incognito / with localStorage disabled → app works identically to today (no errors, no state persistence)
- [ ] Corrupt `geist_game` value manually in devtools → app handles gracefully, starts fresh
- [ ] Deploy app update that changes a mission's objectives → stale game state for that mission is ignored
- [ ] Rapidly click a counter 5+ times → only one localStorage write occurs (debounce working)

### Preferences (Phase 2+)

- [ ] Star a mission → refresh → star persists, mission pinned to top
- [ ] Clear browser data → stars gone, defaults restored
- [ ] Corrupt `geist_prefs` in devtools → app loads with defaults, no errors

---

## 10. Reference: Current State Inventory

Mutable state in the current codebase that this spec addresses:

| State | Where It Lives Now | Where It Will Live | Tier | Persisted? |
|---|---|---|---|---|
| `drawnClassifieds` (array of indices) | JS variable, reset in `renderRoute()` | `gameState.drawnClassifieds` | 1 - Game | Yes |
| Objective checkbox states | DOM `.checked` attributes | `gameState.objectives` + DOM | 1 - Game | Yes |
| Counter values | DOM `.textContent` | `gameState.counters` + DOM | 1 - Game | Yes |
| Round checkbox states | DOM `.checked` attributes | `gameState.roundChecks` + DOM | 1 - Game | Yes |
| Classified scoring checkbox states | DOM `.checked` attributes | `gameState.classifiedChecks` + DOM | 1 - Game | Yes |
| Computed score total | DOM `#objScoreTotal` `.textContent` | DOM only (derived) | — | No |
| `missionFilter` | JS variable | `geist_prefs` | 2 - Prefs | Phase 2 |
| Dice log entries | DOM `#diceLog` children | DOM only (ephemeral) | — | No |
| Section open/closed states | DOM `.open` classes | DOM only (low value) | — | No |
| Favorite missions | Does not exist yet | `geist_prefs` | 2 - Prefs | Phase 2 |
| Event lists | Hardcoded `ADEPTICON_MISSIONS` | `geist_prefs` | 2 - Prefs | Phase 3 |
| Theme selection | Does not exist yet | `geist_prefs` | 2 - Prefs | Phase 3 |
