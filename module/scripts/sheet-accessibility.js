/**
 * Post-render accessibility layer for `PCActorSheetV3` (add-pc-sheet-v3, section 5).
 *
 * WHY THIS IS A SEPARATE MODULE CALLED FROM `_onRender`, NOT TEMPLATE MARKUP
 * ---------------------------------------------------------------------------
 * The rating widget (the dots on attributes, abilities, spheres, backgrounds/other traits, and
 * the permanent/temporary advantage rows), the health track and the Quintessence wheel are all
 * drawn by SHARED partials (`stats_attributes.hbs`, `stats_abilities.hbs`, `power_spheres.hbs`,
 * `stats_feature_row.hbs`, `stats_virtue.hbs`, `stats_health.hbs`, `stats_quintessence.hbs`) or
 * by `getGetStatArea_v2` (`module/handlebars.js`), whose output is byte-frozen by
 * `test-statarea-identity.mjs`. D5 forbids forking a row renderer and D6 defers the advantage
 * renderer to its own phase, so none of that markup may change — and it does not, anywhere in
 * this file. What CAN change, with zero effect on the v2 sheet, is what happens to that SAME
 * markup once it has landed in the DOM of a `PCActorSheetV3` instance specifically. Hence this
 * module, called once from `PCActorSheetV3._onRender`, after `super._onRender()` has already run
 * `ActionHelper.SetupDotCounters_v2` (so `.active` is painted before anything here reads it).
 *
 * EVERY MUTATION ROUTES THROUGH THE EXISTING HANDLERS
 * -----------------------------------------------------
 * `OnDotCounterChange`, `OnSquareCounterChange`, `OnSquareCounterClear`,
 * `OnQuintessenceWheelClick`, `OnParadoxWheelClick` and `OnHandleImbalance` are the exact
 * functions the mouse/right-click binders in `pc-actor-sheet.js` already call. Every keyboard
 * handler below calls one of them with `.call(sheet, event, target)` against a REAL element
 * already in the rendered DOM — never a synthetic node and never a second write path. A keyboard
 * press picks WHICH existing dot/step to hand to the handler; it never recomputes what the
 * handler itself decides.
 *
 * `binder-selector-check.py` (I3/I4) is designed to reach this file automatically: `_onRender`
 * imports `ApplyPcSheetAccessibility` — capitalised, like every handler `pc-actor-sheet.js`
 * already imports — and the check follows any capitalised identifier used inside `_onRender`
 * back to the module that exports it. That is enough for it to pull in every selector below and
 * verify each is producible against `PCActorSheetV3`'s own rendered corpus.
 *
 * THE SETTINGS TAB IS OUT OF SCOPE, EVERYWHERE IN THIS FILE
 * ------------------------------------------------------------
 * `PCActorSheetV3` keeps `parts/settings.hbs` — v2's own template, unmodified, by decision
 * (`pc-actor-sheet-v3.js`'s class docstring: "stays on the v2 template permanently... this is a
 * decision, not an omission"). Touching its rendered DOM from here would make Settings behave
 * differently under v3 than under v2, which is exactly what that decision rules out. Every
 * function below skips anything inside `.tab[data-tab="settings"]`.
 *
 * WHAT IS NOT SOLVED HERE, STATED RATHER THAN HIDDEN
 * ----------------------------------------------------
 * - Focus is not restored to the same logical row after a keyboard-driven change re-renders the
 *   sheet (Foundry's own document-update hook re-renders the whole form; nothing here tracks
 *   "where the user was" across that). The roving tabindex for a block also resets to its first
 *   row on every render for the same reason.
 * - The Quintessence wheel's `aria-valuenow` reports the QUINTESSENCE fill only; the paradox
 *   count is folded into `aria-valuetext` instead, because the wheel is one meter carrying two
 *   numbers and ARIA `slider` only has one `valuenow`.
 */
import {
	OnDotCounterChange,
	OnSquareCounterChange,
	OnSquareCounterClear,
	OnQuintessenceWheelClick,
	OnParadoxWheelClick,
	OnHandleImbalance
} from "./action-helpers.js";

const SETTINGS_TAB_SELECTOR = '.tab[data-tab="settings"]';

/** True for anything inside the Settings tab's content — see the file header. */
function isInSettings(el) {
	return !!el.closest?.(SETTINGS_TAB_SELECTOR);
}

/**
 * The v3 shell wrappers that each hold every row of ONE stat area (`templates/actor/v3/stats.hbs`
 * — `.v3-attributes`, `.v3-abilities`, `.v3-spheres`, `.v3-advantages`, `.v3-statfeatures`).
 * Layout markup a v3 shell is allowed to author (D5); nothing here reaches into a shared partial.
 */
const RATING_BLOCK_CONTAINERS = [
	".v3-attributes", ".v3-abilities", ".v3-spheres", ".v3-advantages", ".v3-statfeatures"
];

/** The name cell a rating row's label sits in, across every partial that draws one. */
const NAME_CELL_SELECTOR = ".wod-namecell-label, .ability-headlineWidth, .headlineNormal, .width-namebox";

const HEALTH_LEVEL_KEYS = {
	bruised: "wod.health.bruised", hurt: "wod.health.hurt", injured: "wod.health.injured",
	wounded: "wod.health.wounded", mauled: "wod.health.mauled", crippled: "wod.health.crippled",
	incapacitated: "wod.health.incapacitated"
};

const DAMAGE_STATE_KEYS = {
	"": "wod.health.uninjured", "/": "wod.health.bashing", "x": "wod.health.lethal", "*": "wod.health.aggravated"
};

/**
 * The one entry point, called from `PCActorSheetV3._onRender`.
 * @param {HTMLElement|jQuery} root
 * @param {PCActorSheetV3} sheet — bound as `this` into every existing handler this file calls.
 */
export function ApplyPcSheetAccessibility(root, sheet) {
	const scope = root instanceof HTMLElement ? root : root?.[0];
	if (!scope || !sheet) return;

	const blocks = collectRatingBlocks(scope);
	blocks.forEach(block => wireRatingBlock(block, sheet));

	wireQuintessenceWheel(scope, sheet);
	wireHealthTrack(scope, sheet);
	applyHeadingSemantics(scope);
	fixDeadLabelFor(scope);
	fixSpecialityGlyphs(scope);
	stripCssOnlyValidationHooks(scope);
}

/* ------------------------------------------------------------------------------------------ *
 * 5.1 / 5.4 — the rating widget's blocks, and the three-level structure (D7)
 * ------------------------------------------------------------------------------------------ */

/**
 * One "block" (D7) is a `role="grid"` container whose rows are rating widgets. `.wod-pool`
 * already contains exactly one stat's permanent/temporary rows (add-pc-sheet-v3 D6); the five
 * `.v3-*` wrappers each contain every row of one stat area. Rows are claimed in that order so a
 * pool nested inside `.v3-advantages` is not double-counted, and anything left over anywhere
 * else in the rendered root (e.g. a power's own rating on the Powers tab) still gets a working,
 * if less consolidated, singleton block rather than being silently skipped.
 */
function collectRatingBlocks(scope) {
	const claimed = new Set();
	const blocks = [];

	RATING_BLOCK_CONTAINERS.forEach(sel => {
		scope.querySelectorAll(sel).forEach(container => {
			if (isInSettings(container)) return;
			const rows = ratingRowsIn(container, claimed);
			if (rows.length) blocks.push({ container, rows });
		});
	});

	scope.querySelectorAll(".resource-value, .resource-counter.tempSquareRow").forEach(row => {
		if (claimed.has(row) || isInSettings(row) || !isRateableRow(row)) return;
		claimed.add(row);
		blocks.push({ container: row, rows: [row] });
	});

	return blocks;
}

/** A >8-max row is `stat_value_dots.hbs`'s text `<input>` branch — a real form control already,
 *  with its own native keyboard behaviour. Nothing here gives it a slider role on top of that. */
function isRateableRow(row) {
	return !row.querySelector(":scope > input.resource-value-input");
}

function ratingRowsIn(container, claimed) {
	const rows = [];
	container.querySelectorAll(".resource-value, .resource-counter.tempSquareRow").forEach(row => {
		if (claimed.has(row) || !isRateableRow(row)) return;
		claimed.add(row);
		rows.push(row);
	});
	return rows;
}

function wireRatingBlock(block, sheet) {
	const { container, rows } = block;
	if (!rows.length) return;

	if (container !== rows[0]) {
		container.setAttribute("role", "grid");
	}

	rows.forEach((row, i) => {
		row.setAttribute("role", "slider");
		row.tabIndex = i === 0 ? 0 : -1;
		hideStepsFromAT(row);
		describeSlider(row);
		bindOnce(row, "a11ySliderBound", () => bindSliderKeyboard(row, sheet));
	});

	if (container !== rows[0]) {
		bindOnce(container, "a11yRovingBound", () => bindRovingTabindex(container, rows));
	}
}

/** The dot/square spans are decoration once the row itself speaks its value through
 *  `aria-valuenow`/`aria-valuetext` — hidden from assistive technology, `data-action`/`data-index`/
 *  `data-itemid` untouched, so the mouse binders (`OnDotCounterChange`, `SetupDotCounters_v2`)
 *  keep working exactly as before. */
function hideStepsFromAT(row) {
	row.querySelectorAll(":scope > .resource-value-step").forEach(step => {
		step.setAttribute("aria-hidden", "true");
		step.tabIndex = -1;
	});
}

function describeSlider(row) {
	const steps = row.querySelectorAll(":scope > .resource-value-step");
	const max = steps.length;
	const value = Number(row.dataset.value ?? 0);
	row.setAttribute("aria-valuemin", "0");
	row.setAttribute("aria-valuemax", String(max));
	row.setAttribute("aria-valuenow", String(value));
	row.setAttribute("aria-valuetext", `${value} / ${max}`);

	const name = sliderName(row);
	if (name) row.setAttribute("aria-label", name);
}

/**
 * A rating row's spoken name. `.wod-pool` rows (Arete, Willpower, Renown, Virtues, every
 * `getGetStatArea_v2` call site) carry no name of their own in the DOM — the banner and the two
 * dot rows are flat siblings by design (D6) — so the pool's own banner supplies it. Every other
 * row's name is a SIBLING cell (stats_attributes.hbs / stats_abilities.hbs / power_spheres.hbs /
 * stats_feature_row.hbs / stats_virtue.hbs all put the name beside the dots, never as an
 * ancestor of them — the same invariant that keeps a name-click from also writing a rating).
 */
function sliderName(row) {
	const pool = row.closest(".wod-pool");
	if (pool) {
		const banner = pool.querySelector(".sheet-banner-text")?.textContent?.trim();
		if (banner) {
			return row.classList.contains("tempSquareRow")
				? `${banner} (${game.i18n.localize("wod.a11y.temporary")})`
				: banner;
		}
	}
	const label = row.parentElement?.querySelector(NAME_CELL_SELECTOR);
	return label?.textContent?.trim() || null;
}

/**
 * 5.2 — keyboard on ONE rating row, routed through the existing `OnDotCounterChange`.
 *
 * `OnDotCounterChange` sets the rating to `index + 1` for whichever step element it is handed,
 * except that clicking step 0 when the value is already 1 sets it to 0 — the one way this widget
 * has ever reached zero. Every case below therefore picks a REAL step element from THIS row and
 * hands it to the exact same function a mouse click already calls; nothing recomputes the rule.
 *
 * ArrowLeft/ArrowRight change the value; ArrowUp/ArrowDown are deliberately left alone here — see
 * `bindRovingTabindex`, which uses them to move between rows in the block. Splitting the two axes
 * is what lets "move to the next stat" and "change this stat's rating" both work with arrow keys
 * on the same widget, which the design (D7) asks for without spelling out which axis is which.
 */
function bindSliderKeyboard(row, sheet) {
	row.addEventListener("keydown", (event) => {
		if (event.shiftKey && (event.key === "Enter" || event.key === " ")) {
			if (tryImbalanceEquivalent(row, event, sheet)) return;
		}

		const steps = row.querySelectorAll(":scope > .resource-value-step");
		const max = steps.length;
		if (!max) return;
		const value = Number(row.dataset.value ?? 0);

		let targetIndex = null;
		if (event.key === "ArrowRight") {
			if (value < max) targetIndex = value;
		} else if (event.key === "ArrowLeft") {
			if (value > 1) targetIndex = value - 2;
			else if (value === 1) targetIndex = 0;
		} else if (event.key === "Home") {
			targetIndex = 0;
		} else if (event.key === "End") {
			targetIndex = max - 1;
		} else if (event.key >= "1" && event.key <= "9") {
			const n = Number(event.key);
			if (n <= max) targetIndex = n - 1;
		} else if (event.key === "0" && value === 1) {
			targetIndex = 0;
		}

		if (targetIndex === null) return;
		event.preventDefault();
		const target = steps[targetIndex];
		if (target) OnDotCounterChange.call(sheet, event, target);
	});
}

/**
 * 5.3 (part) — the changeling imbalance right-click, as Shift+Enter/Shift+Space on the permanent
 * Willpower row. Mirrors `_bindImbalanceContextMenu`'s own gate (splat + the `.willpower` scope
 * `OnHandleImbalance`'s binder already relies on) so this never fires anywhere the mouse
 * equivalent would not have existed either. The dot targeted is the row's own topmost lit step —
 * the position a player marking "this much is unspendable" would reach for with a mouse too.
 */
function tryImbalanceEquivalent(row, event, sheet) {
	if (sheet?.actor?.system?.settings?.splat !== CONFIG.worldofdarkness.splat.changeling) return false;
	if (!row.classList.contains("permValueRow")) return false;
	if (!row.closest(".willpower")) return false;

	const steps = row.querySelectorAll(":scope > .resource-value-step");
	const value = Number(row.dataset.value ?? 0);
	if (value < 1) return false;
	const target = steps[value - 1];
	if (!target) return false;

	event.preventDefault();
	OnHandleImbalance.call(sheet, event, target);
	return true;
}

/**
 * 5.4 — Level 2 of the three-level nav: ArrowUp/ArrowDown move the roving tabindex between rows
 * of the SAME block, delegated at the container so it fires whichever row currently has focus.
 */
function bindRovingTabindex(container, rows) {
	container.addEventListener("keydown", (event) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const list = Array.from(rows);
		const current = list.indexOf(document.activeElement);
		if (current === -1) return;
		const next = event.key === "ArrowDown"
			? Math.min(current + 1, list.length - 1)
			: Math.max(current - 1, 0);
		if (next === current) return;
		event.preventDefault();
		list[current].tabIndex = -1;
		list[next].tabIndex = 0;
		list[next].focus();
	});
}

/* ------------------------------------------------------------------------------------------ *
 * The Quintessence wheel — its own block/row (D7's block/row distinction collapses to one
 * widget here: there is exactly one "row", so the wheel itself carries both `role="grid"`'s job
 * and `role="slider"`'s).
 * ------------------------------------------------------------------------------------------ */

function wireQuintessenceWheel(scope, sheet) {
	scope.querySelectorAll(".quintessence-wheel").forEach(wheel => {
		if (isInSettings(wheel)) return;
		const steps = wheel.querySelectorAll(":scope > .resource-value-step.wheel-step");
		if (!steps.length) return;

		wheel.setAttribute("role", "slider");
		wheel.tabIndex = 0;
		steps.forEach(step => {
			step.setAttribute("aria-hidden", "true");
			step.tabIndex = -1;
		});

		const max = steps.length;
		let quint = 0, paradox = 0;
		steps.forEach(step => {
			const state = step.dataset.state || "";
			if (state === "Ψ") quint++;
			else if (state === "x" || state === "*") paradox++;
		});

		const quintLabel = wheel.parentElement?.querySelector(".sheet-banner-text")?.textContent?.trim();
		const paradoxLabel = wheel.parentElement
			?.querySelector('.vrollable[data-key="paradox"]')?.textContent?.trim();

		wheel.setAttribute("aria-valuemin", "0");
		wheel.setAttribute("aria-valuemax", String(max));
		wheel.setAttribute("aria-valuenow", String(quint));
		wheel.setAttribute("aria-valuetext",
			paradoxLabel ? `${quint} / ${max}, ${paradoxLabel}: ${paradox}` : `${quint} / ${max}`);
		if (quintLabel) wheel.setAttribute("aria-label", quintLabel);

		bindOnce(wheel, "a11yWheelBound", () => {
			wheel.addEventListener("keydown", (event) => {
				if (event.shiftKey && (event.key === "Enter" || event.key === " ")) {
					handleWheelSecondary(wheel, steps, event, sheet);
					return;
				}
				handleWheelPrimary(steps, event, sheet);
			});
		});
	});
}

/** ArrowRight/ArrowUp adds one (the next empty step); ArrowLeft/ArrowDown removes one (the
 *  topmost quintessence-filled step) — exactly what `OnQuintessenceWheelClick` does for a click
 *  on either kind of step, because it reads the CLICKED step's own `data-state`, not its index. */
function handleWheelPrimary(steps, event, sheet) {
	let target = null;
	if (event.key === "ArrowRight" || event.key === "ArrowUp") {
		target = Array.from(steps).find(s => (s.dataset.state || "") === "");
	} else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
		target = Array.from(steps).reverse().find(s => (s.dataset.state || "") === "Ψ");
	}
	if (!target) return;
	event.preventDefault();
	OnQuintessenceWheelClick.call(sheet, event, target);
}

/** 5.3 (part) — the "add Paradox" right-click, as Shift+Enter/Shift+Space on the wheel. Mirrors
 *  `_bindQuintessenceContextMenu`'s own gate: mage only, and only with a Paradox Advantage item,
 *  which is exactly what stands between a mundane mage and a mage who tracks Paradox at all. */
function handleWheelSecondary(wheel, steps, event, sheet) {
	if (sheet?.actor?.system?.settings?.splat !== CONFIG.worldofdarkness.splat.mage) return;
	const hasParadox = sheet.actor.items?.some?.(item => item.type === "Advantage" && item.system.id === "paradox");
	if (!hasParadox) return;

	let target = Array.from(steps).find(s => (s.dataset.state || "") === "");
	if (!target) target = Array.from(steps).reverse().find(s => (s.dataset.state || "") === "Ψ");
	if (!target) return;

	event.preventDefault();
	OnParadoxWheelClick.call(sheet, event, target);
}

/* ------------------------------------------------------------------------------------------ *
 * The health track — a state-cycle widget, not a rating, so it gets its own model rather than
 * being forced into the slider shape above. `role="group"` per track (grouped by the shared
 * `.health` wrapper's parent, which is exactly how the template already groups its OWN wound
 * levels — see `stats_health.hbs`'s three tracks: normal, chimerical, corpus), `role="button"`
 * per box: Enter/Space is the left-click (cycle forward, `OnSquareCounterChange`), Delete/
 * Backspace is the right-click (clear one step back, `OnSquareCounterClear` — 5.3).
 * ------------------------------------------------------------------------------------------ */

function wireHealthTrack(scope, sheet) {
	const groups = new Map();
	scope.querySelectorAll(".resource-counter.healthbox").forEach(box => {
		if (isInSettings(box)) return;
		const group = box.closest(".health")?.parentElement;
		if (!group) return;
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group).push(box);
	});

	groups.forEach((boxes, group) => {
		group.setAttribute("role", "group");
		const cells = [];
		boxes.forEach(box => {
			const levelLabel = healthLevelLabel(box.dataset.name);
			box.querySelectorAll(":scope > .resource-value-step.healthBox").forEach(cell => {
				cell.setAttribute("role", "button");
				describeHealthCell(cell, levelLabel);
				cells.push(cell);
			});
		});
		cells.forEach((cell, i) => { cell.tabIndex = i === 0 ? 0 : -1; });
		bindOnce(group, "a11yRovingBound", () => bindRovingTabindex(group, cells));
		cells.forEach(cell => bindOnce(cell, "a11yHealthBound", () => bindHealthCellKeyboard(cell, sheet)));
	});
}

function healthLevelLabel(dataName) {
	const last = (dataName || "").split(".").pop();
	const key = HEALTH_LEVEL_KEYS[last];
	return key ? game.i18n.localize(key) : "";
}

function describeHealthCell(cell, levelLabel) {
	const stateKey = DAMAGE_STATE_KEYS[cell.dataset.state || ""] ?? DAMAGE_STATE_KEYS[""];
	const stateLabel = game.i18n.localize(stateKey);
	cell.setAttribute("aria-label", levelLabel ? `${levelLabel}: ${stateLabel}` : stateLabel);
}

function bindHealthCellKeyboard(cell, sheet) {
	cell.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			OnSquareCounterChange.call(sheet, event, cell);
		} else if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			OnSquareCounterClear.call(sheet, event);
		}
	});
}

/* ------------------------------------------------------------------------------------------ *
 * 5.5 — block banners as headings; drop the dead `label for=`.
 * ------------------------------------------------------------------------------------------ */

/**
 * `.sheet-banner`/`.sheet-banner-small` name one stat area and `.headlineGroup` names a
 * sub-group inside one (a column heading, the Shadow's two groups) — real section titles that
 * are `<div>`s because the shared partials that draw them cannot be forked (D5) to make them
 * `<h3>`/`<h4>`. `role="heading"` + `aria-level` is the standard way to give a non-heading
 * element real heading semantics without changing its tag, so a screen reader's "jump by
 * heading" command reaches every stat area on the tab, not just the ones v3 authors itself
 * (`.v3-tabtitle`/`.v3-sectiontitle`, already real `<h2>`/`<h3>` and left untouched here).
 */
function applyHeadingSemantics(scope) {
	scope.querySelectorAll(".v3-tabmain .sheet-banner, .v3-tabmain .sheet-banner-small, .v3-tabmain .headlineGroup")
		.forEach(el => {
			if (isInSettings(el)) return;
			if (el.closest("h1,h2,h3,h4,h5,h6")) return;
			if (el.getAttribute("role") === "heading") return;
			el.setAttribute("role", "heading");
			el.setAttribute("aria-level", el.classList.contains("headlineGroup") ? "4" : "3");
		});
}

/**
 * `stats_attributes.hbs`/`stats_abilities.hbs` put `for="data.system.attributes.<key>.value"` on
 * a rollable name label — a DATA PATH, not an element id, so it has pointed at nothing since it
 * was written. Verified against the live DOM rather than hard-coded: any `for` that genuinely
 * resolves is left alone, so this only removes the ones already broken.
 */
function fixDeadLabelFor(scope) {
	scope.querySelectorAll("label[for]").forEach(label => {
		if (isInSettings(label)) return;
		const target = label.getAttribute("for");
		if (target && scope.ownerDocument.getElementById(target)) return;
		label.removeAttribute("for");
	});
}

/* ------------------------------------------------------------------------------------------ *
 * 5.6 (part) — the speciality present/absent pair gets two glyphs, not two colours (D8).
 *
 * `stats_attributes.hbs`/`stats_abilities.hbs`/`power_spheres.hbs` all paint the SAME
 * `fa-circle-exclamation` glyph for "missing a speciality" (`item-warning`) and "has one"
 * (`item-notice`), distinguished only by colour. `fa-star` for the present case is a plain class
 * swap on an already-rendered icon — no markup added or removed, no `data-*` touched, safe from
 * a shared partial precisely because nothing about the partial's OWN behaviour changes.
 *
 * The OTHER double meaning 5.6 names — `fa-eye` for "show description" versus "toggle
 * visibility" — is not fixed here because it is not currently reachable on this sheet to fix:
 * `stats.hbs` passes `showvisibleicon=false` to `stats_abilities.hbs` precisely so the
 * visibility toggle renders only on the Settings tab (which this file does not touch, by
 * decision), and no other v3-reachable partial pairs `fa-eye` with `fa-eye-slash` for a second
 * meaning. Recorded here rather than solved with an invented case.
 * ------------------------------------------------------------------------------------------ */

function fixSpecialityGlyphs(scope) {
	scope.querySelectorAll(".fa-circle-exclamation.item-notice").forEach(icon => {
		if (isInSettings(icon)) return;
		icon.classList.replace("fa-circle-exclamation", "fa-star");
	});
}

/* ------------------------------------------------------------------------------------------ *
 * 5.8 — stop using `required`/`autofocus` as a CSS hook.
 *
 * `bio.hbs`/`gear.hbs` already dropped both on the fields they author directly (see those
 * files' own headers). `bio_splatfields.hbs:12,14,23` is the one place they survive on v3 today
 * — a shared partial `bio.hbs` still includes untouched, per D5 — and `required` there exists
 * only to drive `.floating-label-group input:not(:focus):valid` (`css/wod.css:1001-1029`), a
 * rule v3 never applies (its fields use `.v3-field`'s real `<label>` instead). So every EMPTY,
 * genuinely optional field on this sheet was announcing itself as invalid for no reason that
 * survives on v3; removing the attribute at render time costs the CSS hook nothing it uses.
 * ------------------------------------------------------------------------------------------ */

function stripCssOnlyValidationHooks(scope) {
	scope.querySelectorAll("input[required], input[autofocus]").forEach(input => {
		if (isInSettings(input)) return;
		input.removeAttribute("required");
		input.removeAttribute("autofocus");
	});
}

/* ------------------------------------------------------------------------------------------ *
 * Shared: guard listener attachment against running twice on the same node, the same idiom
 * every binder in `pc-actor-sheet.js` already uses (`dataset.xBound`) for the same reason —
 * `_onRender` runs on every render and this file has no way to know whether ApplicationV2 handed
 * it the same nodes back or fresh ones.
 * ------------------------------------------------------------------------------------------ */
function bindOnce(el, flag, bind) {
	if (el.dataset[flag]) return;
	el.dataset[flag] = "true";
	bind();
}
