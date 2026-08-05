import PCActorSheet from "./pc-actor-sheet.js";
import { ApplyPcSheetAccessibility } from "../../scripts/sheet-accessibility.js";

/**
 * The redesigned PC sheet. Presentation only — every rule is inherited.
 *
 * ## Why a subclass
 *
 * `PCActorSheet` carries 22 action handlers, eight context preparers, the drag/drop wiring and the
 * tab machinery. None of that is presentation, and forking any of it would guarantee the two sheets
 * drift the first week — five commits landed in those templates on the day this file was written.
 * So v3 overrides exactly two things, `PARTS` and its stylesheet, and inherits the rest.
 *
 * The same shape made `DialogCasting` safe: the rules live once, the markup forks.
 *
 * ## Why this is OPT-IN, which reverses the first plan
 *
 * The first plan registered v3 with `makeDefault: true`, on the reasoning that Foundry lets a GM
 * pick a sheet per actor so a rollback would be per-character. That is backwards. `makeDefault`
 * decides the sheet for every actor that has NOT been given one explicitly, so setting it is
 * precisely what removes the per-character choice.
 *
 * Measured against the live world on 2026-08-04: **0 of 88 PC actors carry
 * `flags.core.sheetClass`**. Nothing is pinned, so `makeDefault: true` would have moved all 88 in a
 * single push, on a system with no test suite that deploys to a live server.
 *
 * v3 is therefore registered with `makeDefault: false` (`wod.js`). A GM opts one actor in through
 * the sheet-config button, which writes `flags.core.sheetClass = "WoD.PCActorSheetV3"`; rolling that
 * actor back is picking v2 again — no deploy, no restart, no effect on anyone else.
 *
 * **The flag stores this class's name as a literal string.** Renaming `PCActorSheetV3` after anyone
 * has opted in silently drops them back to the default. Name it once.
 *
 * ## Why DEFAULT_OPTIONS is spread from the parent rather than restated
 *
 * ApplicationV2's merging of `DEFAULT_OPTIONS` up a prototype chain is NOT verified in this
 * codebase — there is no other ApplicationV2 subclass here to check against, and Foundry's source
 * is not vendored. The plan called for restating the whole block so the answer would not matter.
 *
 * Spreading the parent's object is the same guarantee and strictly better: it is explicit (v3
 * declares every key, so it does not depend on merging happening), and it cannot drift (a handler
 * added to `PCActorSheet.DEFAULT_OPTIONS.actions` tomorrow is in v3's too, with no edit here). A
 * hand-copied list of 22 handlers would have been the third hand-copied list in this repo to rot.
 *
 * `form.handler` is carried across unchanged: it is `PCActorSheet.onSubmitActorForm`, a static
 * invoked with `this` bound to the instance, so a v3 instance submits correctly through it.
 *
 * ## What v3 does NOT own
 *
 * `settings.hbs` — 609 lines, 85 floats, GM administration rather than a play surface. It stays on
 * the v2 template permanently. Excluding it removes 23% of the rewrite, and nothing about the
 * Settings tab is what makes the sheet hard to read at the table.
 */
export default class PCActorSheetV3 extends PCActorSheet {

	static DEFAULT_OPTIONS = {
		...PCActorSheet.DEFAULT_OPTIONS,
		// `pc-actor-v3` is the scope every rule in css/pc-actor-v3.css hangs off, and the only
		// thing that keeps that stylesheet from reaching the v2 sheet. `pc-actor` is kept so v3
		// inherits the base sheet's geometry until each part is migrated.
		classes: [...PCActorSheet.DEFAULT_OPTIONS.classes, "pc-actor-v3"]
	}

	/*
	 * PHASE 1: every part still points at the v2 template. This file changes NOTHING that renders
	 * today — that is the point of landing it on its own. What it proves, cheaply and on a real
	 * sheet, is the set of things the plan could not verify by reading:
	 *
	 *   - the sheet registers and the picker shows two named entries;
	 *   - `DEFAULT_OPTIONS` really did carry the 22 actions (click a dot; it persists or it does not);
	 *   - the `renderActorSheetV2` hook reaches a GRANDCHILD class, so `.mage`, `.langES` and
	 *     `.wod-theme-dark` still land on the root and every per-line custom property resolves;
	 *   - the new stylesheet loads.
	 *
	 * A `static` class field SHADOWS the parent's, it does not merge with it, so this must list all
	 * nine parts. Invariant I5 (`.github/scripts/sheet-invariants.py`) asserts these keys match the
	 * preparer cases and the tab ids, which is what stops a part being added here and coming up
	 * blank — the failure this sheet has produced three times.
	 *
	 * Parts migrate one per release, easiest first, and each is revertible by pointing its one line
	 * back at the v2 template.
	 */
	static PARTS = {
		tabs: {
			template: "systems/worldofdarkness/templates/actor/parts/navigation.hbs"
		},
		// MIGRATED. Reverting is this one line back to `parts/bio.hbs`.
		bio: {
			template: "systems/worldofdarkness/templates/actor/v3/bio.hbs"
		},
		// MIGRATED — the part this change exists for. Reverting is this one line back to
		// `parts/stats.hbs`; every rule under "STATS" in `css/pc-actor-v3.css` becomes dead rather
		// than wrong, because all of them are scoped to wrappers only this shell emits.
		stats: {
			template: "systems/worldofdarkness/templates/actor/v3/stats.hbs"
		},
		// MIGRATED — the last of the seven. Reverting is this one line back to `parts/powers.hbs`.
		// `preparePowersContext` keeps setting `powertype` and `haspowercontent` either way; the v2
		// template simply ignores them.
		powers: {
			template: "systems/worldofdarkness/templates/actor/v3/powers.hbs"
		},
		// MIGRATED. Reverting is this one line back to `parts/combat.hbs`.
		combat: {
			template: "systems/worldofdarkness/templates/actor/v3/combat.hbs"
		},
		// MIGRATED. Reverting is this one line back to `parts/gear.hbs`.
		gear: {
			template: "systems/worldofdarkness/templates/actor/v3/gear.hbs"
		},
		// MIGRATED. Reverting is this one line back to `parts/feature.hbs`.
		feature: {
			template: "systems/worldofdarkness/templates/actor/v3/feature.hbs"
		},
		// MIGRATED — the first part to move. Reverting is this one line back to `parts/effects.hbs`.
		effects: {
			template: "systems/worldofdarkness/templates/actor/v3/effects.hbs"
		},
		// Stays on the v2 template. See the class docstring — this is a decision, not an omission.
		settings: {
			template: "systems/worldofdarkness/templates/actor/parts/settings.hbs"
		}
	}

	/*
	 * SECTION 5 — accessibility, layered on AFTER every inherited binder has run.
	 *
	 * The rating widget (attributes/abilities/spheres/backgrounds/advantages), the health track
	 * and the Quintessence wheel are all shared partials or `getGetStatArea_v2` output that D5/D6
	 * forbid forking, so there is no template this change can edit to give them ARIA roles or
	 * keyboard behaviour. `ApplyPcSheetAccessibility` (`module/scripts/sheet-accessibility.js`)
	 * does it from the rendered DOM instead — v3 only, since it runs from THIS override and v2's
	 * `_onRender` never calls it. Same signature as the parent (`pc-actor-sheet.js:440`): no
	 * params, because the parent's own binders never read `context`/`options` either.
	 */
	async _onRender () {
		await super._onRender();

		ApplyPcSheetAccessibility(this.element, this);
	}
}
