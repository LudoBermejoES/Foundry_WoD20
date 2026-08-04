# PC sheet v3 — specification

Status: **proposed**, nothing implemented. Written 2026-08-04 from five parallel audits (task
analysis, information architecture, visual system, accessibility, migration engineering), each
of which read the code and cited it. This document is the synthesis: the decisions, the ones I
got wrong first, and the order to build in. Where the audits disagreed I say so and pick.

---

## 1. The decision: v3 as an opt-in subclass

```js
class PCActorSheetV3 extends PCActorSheet   // module/actor/template/pc-actor-sheet-v3.js
```

registered in `wod.js` alongside v2 with **`makeDefault: false`** and a `label`.

### Why a subclass

Every action handler, every `prepare*Context`, the drag/drop wiring and the tab machinery are
inherited unchanged. v3 overrides `static PARTS` and ships its own stylesheet. This is the same
shape that made `DialogCasting` safe: presentation forks, rules do not.

### Why `makeDefault: false` — a correction

The first version of this plan said `makeDefault: true`, on the reasoning that Foundry lets you
pick a sheet class per actor, so a rollback would be per-character. **That is backwards.**
`makeDefault` is what decides the sheet for every actor that has not been given one explicitly,
so setting it on v3 is precisely what removes the per-character choice and moves all 89 at once.

Measured 2026-08-04 against the live world: **0 of 89 PC actors carry `flags.core.sheetClass`.**
So there is nothing pinning any of them, and `makeDefault: true` would be a flag day, not a
rollout.

Opt-in instead: a GM picks v3 on one actor through the sheet-config button, which writes
`flags.core.sheetClass = "WoD.PCActorSheetV3"`. Rollback for that actor is picking v2 again —
no push, no redeploy, no ~10s outage. `makeDefault` moves to v3 only at the end (§6, Phase 4),
and actors explicitly pinned to v2 stay on v2 through that too, which is the escape hatch for
the most complicated characters.

**Consequence to respect:** the stored flag is the literal string `"WoD.PCActorSheetV3"`.
Renaming the class after anyone has opted in silently drops them back to the default. Name it
once.

### Why not reskin v2 in place

`stats_advantages.hbs` was restructured in place this week to wrap two 33% columns in a 67%
wrapper. It shipped — and the next commit was a hotfix for the Stats tab rendering **blank**,
because a new partial was not registered. That is the in-place failure mode, already observed,
on a change one-twentieth of this size, with no rollback but revert-and-redeploy.

### The coupling that actually matters

Not `data-action`, which was the first guess. The real contract is ~13 **CSS-class selectors**
hard-coded inside `_onRender`'s binders, one of them a direct-child chain:

```js
".willpower > .resource-value > .resource-value-step"   // pc-actor-sheet.js:999
"span.resource-value-step"                              // action-helpers.js:978 — element selector
```

A subclass inherits those binders, which turns them from implementation detail into hard
requirements on v3's markup: an extra wrapper div silently kills the changeling imbalance
right-click; a `<div>` where a `<span>` is expected silently stops dots persisting. Neither
throws. Invariants I3, I4 and I7 (§5) exist for exactly these.

---

## 2. Scope

**`settings.hbs` stays on the v2 template permanently.** 609 lines, 85 floats, 39 clearfixes,
22 inline styles — 15% of the template corpus and 23% of the rewrite — and it is GM
administration, not a play surface. Excluding it takes the rewrite from 2,646 to **2,037 lines**.

Of 43 templates / 4,018 lines:

| Group | Files | Lines | Treatment |
|---|---|---|---|
| A — reuse verbatim, CSS only | 16 | 802 (20%) | zero floats, zero inline styles. Includes `stats_health.hbs` (287) |
| B — near-verbatim | 9 | 570 (14%) | only `&nbsp;` spacers / ≤3 inline styles |
| C — structural rewrite | 18 | 2,646 (66%) | of which `settings.hbs` (609) is excluded |

**Estimate: two to three weeks**, and the cost is not the typing. Six game lines × two themes ×
two languages × locked/unlocked, with no test suite, means every screen has to be *looked at*.
Budget by verification, not by diff size.

### The rule that prevents fork rot

> A v3 template may contain layout markup and `{{> …}}` includes. It may **not** contain a
> `data-action` its v2 counterpart lacks, and it may **not** contain a row renderer.

All behaviour lives in shared partials — Groups A and B, 25 files, 1,372 lines, the ones that
actually change week to week. v3 forks only *shells*: `stats.hbs` is 37 lines and 6 includes,
`combat.hbs` 65 and 9. A commit that adds a feature to `power_listpower.hbs` reaches both sheets
because it is the same file. Rot becomes structurally impossible rather than a thing to remember.
Enforced per-part by invariant I2.

---

## 3. What the audits found, ranked by value

### 3.1 Ship immediately — independent of v3, no markup change

These are defects in the sheet everyone is using today. None of them needs to wait.

| | Finding | Measured | Fix |
|---|---|---|---|
| 1 | **The dot is inverted in dark mode.** `wod.css:2541` paints empty `#ffffff` and filled `#121212`; `darkmode.css` has zero `.resource-value-step` rules | filled **1.46:1**, empty **12.82:1** on `rgb(50,50,50)` | 4 declarations. The primary data display on the sheet is backwards, ×300 per sheet |
| 2 | `--main-full-color-rgb` is consumed twice, defined nowhere | both drag highlights fall back to maroon on all six lines | 1 declaration × 11 files |
| 3 | Splat colour unusable as ink on dark | mage **1.06:1** on the block surface; six lines fail dark, three fail light | derived `--splat-line` / `--splat-text` tokens per line |
| 4 | `.information-area` `#7e7e7e` — this is the wound-penalty readout | 3.72 light / 3.16 dark | one value |
| 5 | `.wod-overbudget` `#a52019` on the live dark theme | **1.72:1**, on a warning whose own comment says colour must not stand alone | one value |
| 6 | Wound colours | `crippled` **1.17:1**, `incapacitated` **1.64:1** — the two worst levels are the two least visible boxes | §3.3 |
| 7 | Dot hit target 14px → 20px via `::after { inset: -3px }` | zero geometry change | 2 declarations |
| 8 | No `prefers-reduced-motion` block anywhere | 12 transitions, 0 guards | 1 block |
| 9 | Dead `@font-face changelingES` — 100 glyphs, **no Spanish diacritics**, zero references | | delete |
| 10 | `orpheus` `@font-face` points at `Fudge.ttf`; the file is `Fudge.otf` | broken | 1 path |
| 11 | `data-action="actorDelete"` (`settings.hbs:36`) is not among the 41 registered actions | verified — a clickable trash can that does nothing | wire or remove |

### 3.2 The frequency/prominence inversion

The task analysis ranked in-play tasks and compared them with visual weight. Both ends are
inverted simultaneously:

- **The largest control on the sheet creates items.** `.createicon` is `scale: 3`, absolutely
  positioned bottom-right of every tab. It is used a handful of times at character creation.
- **The resources consumed every turn are 14px unlabelled cells** — and `wod.css:537` gives
  `cursor: default` to every `.resource-value-step` inside a locked tab, *including* the three
  controls that deliberately stay live while locked (health boxes, temporary Willpower, the
  Quintessence wheel). The sheet renders "not clickable" on exactly the controls used every turn.
- **The Quintessence wheel is 150×150** with ± buttons; Willpower — used by every line, every
  session, and the only resource the roller auto-deducts — gets two unlabelled 10-cell rows with
  no number and no arrows.

**The single largest finding: the sheet has almost no numerals.** No numeric readout exists for
permanent Willpower, temporary Willpower, the Willpower dice pool (computed at
`wod-item-base.js:341` and never displayed), Arete, Quintessence, Paradox, or any Ability. ~310
identical 14px targets on the Stats tab, and reading any value means counting them. That is a
faithful rendering of the paper sheet and the wrong trade on a screen.

### 3.3 Health

Level colour and damage mark currently compete for the same 14px surface. Separating them —
colour becomes a 4px band under a neutral cell, marks draw in `currentColor` — collapses
`wod.css:2594-3160` from **566 lines to roughly 60** (7 levels × 3 marks × base = 21 near-identical
gradient blocks, including a hand-written white variant so an aggravated mark on the black
`incapacitated` box isn't black-on-black at 1.00:1). It also fixes findings 6 above directly.

Boxes 14px → 18px, contiguous with one outer radius so seven chips read as one track. The
penalty stops being a footnote and becomes a consequence: `−2 a las reservas`, not
`Penalizador por heridas: -2`.

### 3.4 Accessibility — the requirement that shapes the markup

The sheet is **mouse-only**. Keyboard-reachable today: the text inputs, one `<button>` (the lock),
the settings buttons, one `<a href>`. Everything else — every dot, health box, roll target, nav
tab and icon — is a `<span>`, `<div>` or href-less `<a>`. Measured: **44 href-less `<a>`**,
**18 `<label for=>` against zero `id=` attributes**, **zero heading elements**.

Three operations are **right-click only** with no keyboard path at all (clear a health box, add
Paradox, changeling Willpower imbalance). Combined with the dot widget having no decrement, the
sheet has no keyboard way to reduce any value.

The fix that makes density and operability compatible — and this must be designed in, not bolted
on — is a **three-level navigation model**: each stat block is one tab stop (`role="grid"`),
arrow keys move within it, and the dot row is one `role="slider"` rather than N spans. That takes
the Stats tab from ~465 potential tab stops to **~12**.

A dot group is already one control, not N toggles: `OnDotCounterChange` sets the rating to
`index + 1`. The markup just doesn't say so.

### 3.5 Information architecture

Eight navigable tabs (not nine — `tabs` is the rail itself), and they are three different kinds
of thing sharing one rail: **play** (stats, combat, powers), **character** (bio, feature, gear),
**machinery** (settings, effects). Proposed: **5 content tabs + machinery**.

- `bio` + `feature` merge into **Personaje**. Their four shared lists (backgrounds, merits, flaws,
  other traits) are **rendered twice today** — `prepareAdvantageLists` is called by both
  `prepareStatContext` and `prepareFeatureContext`, and both templates render the result.
- `effects` becomes a settings sub-tab. Its `+` must move with it or Bonus authoring is lost.
- `settings` is an application wearing a tab's clothes (609 lines, its own tab bar, its own state
  machine, a persisted `_settingsTab`). Demote now, separate window later.
- **Never hide a tab.** Hide a *block*; give the tab an empty state that names what goes there and
  keeps the create button. A tab that vanishes when empty is a tab you cannot use to make it
  non-empty — the `+` is the only in-sheet route to `DialogPowerSelection`.
- Abilities: filter to `value > 0 or has speciality` when **locked**, with a per-column
  "+N sin puntos" toggle; **always show all 33 when unlocked**, because unlocking is the act of
  "I am about to raise something". `locked` is already the play/edit switch and needs no new state.
  Do **not** filter Spheres — 9 in a bounded grid, every name is click-to-cast.

---

## 4. Corrections to earlier claims in this repo

Recorded because each was asserted as fact and was false.

1. **"`BuildPowerSections` only builds a section whose id is in `primary`."** False. It also walks
   `defaultOrder`. Fixed in 7.5.48 along with a gate; see `power-section-check.py`.
2. **"`makeDefault: true` gives per-character rollback."** Backwards; §1.
3. **"`template-structure-check` proves partial includes resolve."** It proved the file existed,
   not that it was registered. Fixed in 7.5.46.
4. **`hooks.js:99` calling `sheet.classList` directly** was flagged as possibly throwing on
   ApplicationV2, which would mean `.mage` / `.langES` / `.wod-theme-dark` never land. **Resolved:
   a live sheet dump shows `class="… pc-actor langES mage wod-theme-dark"`.** The hook works.

---

## 5. Invariants

Offline scripts in `.github/scripts/`, added to the `preflight` job. **Every one must pass — or be
explicitly allowlisted with a reason — against the v2 tree before v3 exists.** A gate that is red
on arrival gets switched off within a day.

| | Invariant |
|---|---|
| I1 | Every `data-action` in an actor template is a registered action. **Fails today on `actorDelete`** — which is how you know it works |
| I2 | Every `data-action` in v2's template for part *P* appears in v3's, unless allowlisted |
| I3 | Every CSS selector **parsed out of** `_onRender`'s binders can be matched by a v3 template. Parse them; a hand-copied list rots |
| I4 | The `.willpower > .resource-value > .resource-value-step` chain has no intervening element |
| I5 | `keys(V3.PARTS)` ⊆ `_preparePartContext` cases, and == `keys(this.tabs)` ∪ `{tabs}` |
| I6 | Every v3 partial is registered in `templates.js` (already covered) |
| I7 | Every `resource-value-step` is on a `<span>` |
| I8 | Zero literal colours in `pc-actor-v3.css` — `darkmode.css` loads last, so a hard-coded colour yields a half-dark sheet |
| I9 | Every selector in `pc-actor-v3.css` starts with the v3 scope class |
| I10 | `!important` count ≤ 6, all in one labelled block. A hard cap is what ends an arms race |
| I11 | No `LANG:` markers; every `{{localize}}` key resolves in EN **and** ES |
| I12 | **Render every part for a fixture actor per splat; assert each expected block produced ≥1 node** |

**I12 is the one that matters and the one to be tempted to skip.** It is the only thing that
catches the failure this sheet has hit twice in one week — a part preparer not building a key its
template reads, which renders an empty block with no error and no console warning. Precedent
exists: `test-secondability-id.mjs` already copies `module/` to a temp dir, stubs the Foundry
globals and executes real system code.

### The float→grid mechanism

`float` and `clear` **have no effect on flex or grid items** — a grid item's `float` computes to
`none`. That is a computed-value rule, so it beats `!important`, specificity and source order,
because it is not a cascade contest at all. Making a container `display: grid` neutralises every
`.pullLeft` / `.clearareaBox` **direct child** with zero `!important`.

Explicitly rejected: `@layer`. It inverts for `!important`, but for **normal** declarations
unlayered styles win — and `wod.css` is entirely unlayered, so putting v3 in a layer would make
all ~700 of its normal declarations lose. It looks like a solution and is a trap.

Inline widths (71) are not covered by blockification, but they live almost entirely in the Group C
shells v3 rewrites, so they are removed rather than overridden.

---

## 6. Phases

Each phase is one push. `deploy` is `needs: preflight`, so a red gate blocks the deploy.

- **0a** — land I1, I5, I7, I8, I9, I10, I11 against the **v2 tree only**, plus I12's harness.
  *Rollback: revert a workflow file. Zero runtime effect.*
- **0b** — add the missing `label:` to the PC sheet registration (it is the only one of 14 without
  one, so the sheet picker shows a blank entry for v2 at exactly the moment a GM must choose).
- **0c** — refactor `getGetStatArea_v2` into `buildStatArea()` (data) + a renderer, proven
  byte-identical by an offline harness, and add a `.wod-pool` wrapper at all four call sites.
  *Lowest-risk item in the plan, and it removes the largest unknown.*
- **1** — the v3 skeleton pointing at the **existing** v2 templates, `makeDefault: false`.
  Nothing changes for anyone. Proves registration, `DEFAULT_OPTIONS` merging, the render hook and
  the new stylesheet load.
- **2** — one tab per push, easiest first: `effects` → `gear` → `combat` → `bio` → `feature` →
  `stats` → `powers`. *Rollback per tab is one `PARTS` line.*
- **3** — supervised opt-in. One GM character, then one volunteer. Walk 6 splats × 2 themes ×
  2 languages × locked/unlocked. This is the only thing that finds float leaks; no script can.
- **4** — flag day: move `makeDefault: true` to v3.

### Why `getGetStatArea_v2` gets its own phase

It generates Arete, Willpower, Quintessence, Renown, Virtues and Corpus for all six lines as
concatenated HTML strings, and it emits the banner and the two dot rows as **flat siblings** —
there is no element in the DOM containing exactly one stat. So CSS alone can restyle the dots and
the typography but **cannot** draw a card per stat or put the label and dots on one line: nothing
you can write creates a containing box. The fix is a one-line wrapper in the caller, not a second
generator. If the internals must later diverge, fork the *renderer* and share the *decision* —
one `buildStatArea()`, two renderers, zero duplicated logic.
