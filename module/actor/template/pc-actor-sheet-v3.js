import PCActorSheet, { getPowertype, countFeatureTabItems, prepareEffectContext } from "./pc-actor-sheet.js";
import { ApplyPcSheetAccessibility } from "../../scripts/sheet-accessibility.js";
import { getSplat } from "../../scripts/splat-helpers.js";

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
 * ## THIS SHEET IS NOW THE DEFAULT (7.5.67, 2026-08-05)
 *
 * The section below describes why v3 shipped OPT-IN, and it is kept because the reasoning is still
 * the reason rollback works — not because it still describes the registration. `wod.js` now sets
 * `makeDefault: true` here and `false` on `PCActorSheet`. Re-measured immediately before the flip:
 * **0 of 88 PC actors carried `flags.core.sheetClass`**, so all 88 moved at once.
 *
 * Rollback is unchanged and still needs no deploy: a GM picks the v2 entry by name in the
 * sheet-config button, which pins that one actor. Tasks 7.1-7.3 (the supervised weeks and the
 * splat x language x theme matrix walk) were NOT completed first; the flip was made ahead of them
 * at the owner's direction.
 *
 * ## Why this shipped OPT-IN first, which reversed the original plan
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
 * v3 was therefore registered with `makeDefault: false` for its first thirteen releases — PAST
 * TENSE as of 7.5.67; see the note at the top of this docstring. What has not changed is the
 * escape hatch that reasoning bought: the sheet-config button writes
 * `flags.core.sheetClass = "WoD.PCActorSheetV3"` (or the v2 class) for ONE actor, so either sheet
 * can be pinned per character with no deploy, no restart and no effect on anyone else. That is now
 * the rollback rather than the opt-in, and it works in both directions.
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
 *
 * ## Section 8 — eight tabs become five (add-pc-sheet-v3 design.md D9)
 *
 * `bio` is RETIRED as its own tab (§8.1/§8.2): `PCActorSheet.prepareBioContext`'s body was
 * extracted into `addBioContext`, which `prepareFeatureContext` now also calls, and this class's
 * own `tabs` field (below) no longer declares a `bio` entry — the merged content lives entirely in
 * `v3/feature.hbs` ("Personaje"). Confirmed on the census only 4 of 13 splats declare bio
 * splatfields at all, so a standalone Bio tab was a portrait and two prose boxes for the other
 * nine; merging it into Features gives every one of them a tab with something in it.
 *
 * `effects` is NOT retired as a tab — see the `tabs` field comment for why folding it into Ajustes
 * stopped at the RAIL rather than reaching the template, and `v3/navigation.hbs` for how it is
 * grouped and demoted there instead (§8.3/§8.4).
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
	 * add-pc-sheet-v3 §8.2 — five content tabs plus Ajustes, not eight. An INSTANCE field (not
	 * static) SHADOWS the parent's the same way `PARTS` does below: this class declares its own
	 * `tabs`, so the parent's copy (with `bio` in it) never runs for a v3 instance. `bio` is gone;
	 * `feature`'s title becomes `wod.tab.character` ("Personaje" in Spanish), since it now carries
	 * the merged bio+feature content. `effects` and `settings` are UNCHANGED from the parent — they
	 * stay real, independently-clickable tabs; only the RAIL groups and demotes them visually
	 * (`v3/navigation.hbs`, `css/pc-actor-v3.css` "NAV RAIL"). `sheet-invariants.py`'s I5 checks
	 * `PARTS` keys against these tab ids, so removing `bio` from one without the other is a gate
	 * failure, not a silent gap.
	 */
	tabs = {
		stats: {
			id: 'stats',
			group: 'primary',
			title: game.i18n.localize('wod.tab.core'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].stats
		},
		powers: {
			id: 'powers',
			group: 'primary',
			title: game.i18n.localize('wod.tab.power'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)][getPowertype(this.actor)]
		},
		combat: {
			id: 'combat',
			group: 'primary',
			title: game.i18n.localize('wod.tab.combat'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].combat
		},
		gear: {
			id: 'gear',
			group: 'primary',
			title: game.i18n.localize('wod.tab.gear'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].gear
		},
		// Was "Features"/`wod.tab.features`; now "Personaje"/`wod.tab.character`, since §8.2 folded
		// the identity content that used to be the standalone Bio tab in here.
		feature: {
			id: 'feature',
			group: 'primary',
			title: game.i18n.localize('wod.tab.character'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].note
		},
		effects: {
			id: 'effects',
			group: 'primary',
			title: game.i18n.localize('wod.tab.effect'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].effect
		},
		settings: {
			id: 'settings',
			group: 'primary',
			title: game.i18n.localize('wod.tab.settings'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].settings
		}
	}

	/**
	 * add-pc-sheet-v3 §8.2 — the limited/observer fallback (`PCActorSheet#getTabs`) redirected from
	 * `bio`, which no longer exists as a tab of its own on this sheet, to `feature`, which now
	 * carries the identity content bio used to own. Without this override a limited-permission
	 * viewer would get an EMPTY nav (`tabs.bio` is `undefined` on v3) and `tabGroups.primary` set to
	 * a tab id with no part behind it — the exact "renders nothing, no error" failure this whole
	 * change is written against, just reached through a permission path instead of a template one.
	 * @returns {string}
	 */
	get limitedTabId () {
		return 'feature';
	}

	/*
	 * A `static` class field SHADOWS the parent's, it does not merge with it, so this must list
	 * every part v3 renders — EIGHT now, not the original nine: `bio` retired into `feature`
	 * (§8.1/§8.2). Invariant I5 (`.github/scripts/sheet-invariants.py`) asserts these keys match the
	 * preparer cases AND this class's own `tabs` field above, which is what stops a part being
	 * declared here with no matching tab (or a tab with no matching part) and coming up blank — the
	 * failure this sheet has produced three times.
	 *
	 * Parts migrate one per release, easiest first, and each is revertible by pointing its one line
	 * back at the v2 template.
	 */
	static PARTS = {
		// add-pc-sheet-v3 §8.3/§8.4/§8.6 — forked from `parts/navigation.hbs` so the rail can group
		// and demote Ajustes+Effects and print a count badge (`tabs.feature.count`,
		// `tabs.effects.count`, both set in `_prepareContext` below) without touching v2's rail.
		tabs: {
			template: "systems/worldofdarkness/templates/actor/v3/navigation.hbs"
		},
		// RETIRED, add-pc-sheet-v3 §8.1/§8.2 — merged into `feature` ("Personaje") below. `bio`'s
		// content and its create-nothing header are reproduced verbatim inside `v3/feature.hbs`;
		// this class's own `tabs` field (above) declares no `bio` entry either, which is what keeps
		// I5 (`PARTS` keys == tab ids) green. `templates/actor/v3/bio.hbs` stays on disk as the
		// reference for what was merged, but nothing renders it any more.
		//
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
		// MIGRATED, then RE-PURPOSED (§8.1/§8.2): this is now "Personaje", bio's identity content
		// merged in above the item lists. Reverting is NOT simply this one line back to
		// `parts/feature.hbs` any more — that template does not carry the bio content, and this
		// class's `tabs` field titles it `wod.tab.character` — so a full revert also needs `bio`
		// restored to both `PARTS` and `tabs`. See `v3/feature.hbs`'s own header.
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

	/**
	 * add-pc-sheet-v3 §8.6 — count badges on the rail, summed HERE, in the ROOT context.
	 *
	 * This is the whole point of the task existing as its own line item: the `tabs` part (the nav
	 * rail, `v3/navigation.hbs`) has NO `case` in `_preparePartContext` — it is the one part on
	 * either sheet that never gets a preparer of its own — so a count computed inside
	 * `prepareFeatureContext` or `prepareEffectContext` would be built and then thrown away, never
	 * reaching the part that would display it. Only `_prepareContext` (this method) runs before
	 * EVERY part, `tabs` included, which is the only place a rail-wide number can live.
	 *
	 * Two badges, both plain item counts, both computed WITHOUT re-running the heavier async work
	 * their tabs already do at render time (see `countFeatureTabItems`'s own header for why that
	 * matters for connections specifically):
	 *   - `tabs.feature.count` — how many rows the Personaje item lists would print.
	 *   - `tabs.effects.count` — how many Bonus effects currently apply, surfaced here because
	 *     `effects` is visually demoted into the Ajustes cluster (§8.3/§8.4): a badge is what lets a
	 *     GM tell "nothing in there" from "something in there" without opening a smaller icon.
	 * @override
	 */
	async _prepareContext (options) {
		const data = await super._prepareContext(options);
		const actor = this.actor;

		if (data.tabs.feature) {
			data.tabs.feature.count = countFeatureTabItems(actor);
		}
		if (data.tabs.effects) {
			// `prepareEffectContext` reads `context.tabs.effects` on its very first line
			// (`context.tab = context.tabs.effects`), so it cannot be called with a bare `{}` — an
			// empty object has no `.tabs` at all, which throws `Cannot read properties of undefined
			// (reading 'effects')` on every render. `data.tabs` is exactly the collection that key
			// resolves against, so passing it through is what makes this a safe, side-effect-free
			// second call rather than a duplicate of the real one `_preparePartContext('effects', …)`
			// still makes for the part itself.
			const effectsContext = await prepareEffectContext({ tabs: data.tabs }, actor);
			data.tabs.effects.count = effectsContext.effects.length;
		}

		return data;
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
