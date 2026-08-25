import ActionHelper from "../../scripts/action-helpers.js";
import ItemViewer from "../../applications/item-viewer.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * rebuild-chantry-sheet-v2 — task 0
 * ----------------------------------
 * Live actor count for type "Chantry" was NOT measured against `berlin-tenebroso` before this
 * class was written: this implementation pass has no `foundry-mcp` bridge session available (no
 * GM browser connected to query through), and no owner response to ask directly either, so the
 * two inputs task 0.1 names as acceptable sources were both unavailable. This is recorded here
 * rather than silently assumed away.
 *
 * Decision (task 0.2), taken on design.md D1's own reasoning rather than on a measured count:
 * STRAIGHT REPLACEMENT. `ChantryActorSheetV2` is registered `makeDefault: true` in `wod.js`;
 * `ChantryActorSheet` (the appv1 class this file replaces) stays on disk, unmodified, and stays
 * registered `makeDefault: false` as the per-actor rollback (`flags.core.sheetClass`), exactly
 * the escape hatch `PCActorSheet`/`PCActorSheetV3` already prove out live. This is the
 * recommendation design.md D1 states for the reasons it gives (a Chantry is a per-campaign
 * communal facility, not a per-player character — there is no equivalent of PC's 88 actors — and
 * this sheet has no splat/variant/era matrix to regress across), not a measured confirmation of
 * a specific low count. If a live count is ever taken and turns out non-trivial, D1's own escape
 * hatch is unchanged by that finding: flip the two `makeDefault` booleans in `wod.js` back, no
 * code change required.
 *
 * The class name below is stored as a literal string the moment any GM pins it via Sheet
 * Configuration (`add-pc-sheet-v3`'s own recorded trap). Name it once.
 */
export default class ChantryActorSheetV2 extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

	/**
	 * The sheet OPENS LOCKED, every time, and the lock is TRANSIENT - a class field, so it resets
	 * on each construction exactly like `PCActorSheet`'s own `this.locked = true` (pc-actor-sheet.js:63)
	 * and its `_handlingLock` toggle.
	 *
	 * This REVERSES `rebuild-chantry-sheet-v2`'s D3 ("system.locked stays the source of truth"),
	 * which itself carried the appv1 sheet's persisted lock across. Recorded rather than quietly
	 * dropped: the owner asked for the sheet to open locked, and the persisted flag cannot give that
	 * - a Chantry left unlocked reopens unlocked, which is precisely what was reported. Matching the
	 * PC sheet also means one idiom for "the lock control" across this system instead of two.
	 *
	 * `system.locked` stays in `template.json` and is no longer read by this sheet. The appv1 sheet,
	 * still registered as the rollback, DOES read it, so the field is not vestigial system-wide.
	 */
	locked = true;


	static DEFAULT_OPTIONS = {
		classes: ["wod20", "wod-sheet", "chantry"],
		// No `window.icon` override - this sheet has no established icon of its own anywhere in
		// this system (unlike PCActorSheet's `fa-solid fa-dice-d10`), and design.md/tasks.md task
		// 1.2 allows omitting it to inherit Foundry's default rather than inventing one.
		window: {
			resizable: true
		},
		position: {
			width: 620,
			height: 700
		},
		form: {
			submitOnChange: true,
			handler: ChantryActorSheetV2.onSubmitActorForm
		},
		actions: {
			// The lock is TRANSIENT here (see the `locked` class field above), so this flips the
			// flag and re-renders rather than persisting to the actor. It used to call
			// `ActionHelper.OnActorLock`, which writes `system.locked` - correct while the lock was
			// persisted, wrong once the sheet must OPEN locked every time.
			actorLock: function (event, target) {
				if (this && typeof this._handlingLock === "function") {
					this._handlingLock();
				}
			},
			ratingDotChange: ChantryActorSheetV2.onRatingDotChange,
			traitDotChange: ChantryActorSheetV2.onTraitDotChange
			// Deliberately NO action entry for the Trait-description eye - it is read-only and
			// stays a manually-bound `_onRender` listener (design.md D3, task 1.3/3.1), the same
			// idiom `PCActorSheet._bindTraitDescriptionButtons` already uses for Attributes/
			// Spheres.
		}
	};

	/*
	 * task 1.4 (D4) — SINGLE part.
	 *
	 * This sheet's whole content (one header block, one Trait list, one notes field) fit the one
	 * template this Actor type has always had; there is no tab machinery anywhere in this sheet's
	 * markup and nothing about its content argues for inventing one (design.md Non-Goals, D4).
	 * `sheet-invariants.py`'s I5 (PARTS/tabs agreement) only runs `if tabs:` are declared, and this
	 * class declares no `tabs` field at all, so it sits outside I5's scope regardless of the part
	 * count - splitting into more parts would not change gate coverage (`template-structure-check.
	 * py` already scans every `.hbs`/`.html` file individually, whatever the count), only add a
	 * second template + a second `templates.js` registration for no measured benefit (D4's own
	 * analysis). One part it is.
	 */
	static PARTS = {
		content: {
			template: "systems/worldofdarkness/templates/actor/chantry-sheet-v2.hbs"
		}
	};

	/** @override */
	/* Same shape as `PCActorSheet._handlingLock` - flip the transient flag and re-render. */
	async _handlingLock() {
		this.locked = !this.locked;
		await this.render(false);
	}

	async _prepareContext(options) {
		const data = await super._prepareContext(options);
		const actor = this.actor;

		data.config = CONFIG.worldofdarkness;
		data.locked = this.locked;
		data.actor = actor;
		data.owner = actor.isOwner;
		data.isOwner = actor.isOwner;

		const traits = actor.system.traits ?? {};
		const rating = parseInt(actor.system.rating) || 0;
		const cap = rating * 2;
		const traitcost = CONFIG.worldofdarkness.chantry.traitcost;

		let spent = 0;
		const traitlist = [];

		for (const key in traitcost) {
			const value = parseInt(traits[key]) || 0;
			const cost = traitcost[key];

			spent += value * cost;

			traitlist.push({
				key: key,
				label: `wod.chantry.traits.${key}`,
				descriptionkey: `wod.chantry.traitdescriptions.${key}`,
				value: value,
				cost: cost,
				overcap: (rating > 0) && (value > cap)
			});
		}

		// Alphabetical by LOCALIZED label, in the active language - not by the key traitcost
		// enumerates them in, and not a locale-naive `localeCompare()` (no locale argument), which
		// misorders the accented labels in play (Espías, Criados, Ancianos). CONFIG.language is
		// this system's own established reflection of the active Foundry language. Kept EXACT in
		// shape from the appv1 sheet - `.github/scripts/test-chantry-trait-order.mjs` extracts and
		// executes this comparator against the real Trait keys and labels rather than
		// re-implementing it blind.
		traitlist.sort((a, b) =>
			game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), CONFIG.language || undefined));

		data.listData = { traits: traitlist };

		data.pool = {
			total: actor.system.pool?.total ?? 0,
			spent: spent
		};
		data.cap = cap;

		data.notes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.notes, { async: true });

		return data;
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);

		const element = this.element;

		ActionHelper.SetupDotCounters_v2(element);

		this._bindTraitDescriptionButtons(element);
	}

	/**
	 * Read-only Trait-description eyes: bound unconditionally in `_onRender` (never gated on
	 * `locked`), deliberately - design.md D3 keeps this OUTSIDE the declarative `actions` map for
	 * exactly the reason `PCActorSheet._bindTraitDescriptionButtons` already establishes: a
	 * read-only control must survive a locked (or, on this sheet, limited) render, matching the
	 * appv1 sheet's own "bound BEFORE the editable early-return" guarantee - appv2 has no such
	 * early-return to be before, so "bound unconditionally, every render" is its equivalent.
	 *
	 * Opens the SAME read-only `ItemViewer` popup every other description eye in this system
	 * opens (polish-chantry-sheet design.md D1). A construction Trait is still neither an Item nor
	 * a compendium document, so it is handed a plain pseudo-document shaped like the three fields
	 * `ItemViewer` actually reads (`uuid`, `name`, `system.description`). The uuid stays namespaced
	 * under the OWNING ACTOR's own uuid, unchanged, so two different Chantries' same-keyed Trait
	 * windows cannot collide into one.
	 * @param {HTMLElement} root
	 */
	_bindTraitDescriptionButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-traitkey]");
		if (!icons?.length) return;

		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";

			icon.addEventListener("click", () => {
				const traitkey = icon.dataset.traitkey;
				const labelkey = icon.dataset.labelkey;
				const descriptionkey = icon.dataset.descriptionkey;
				if (!labelkey || !descriptionkey) return;

				ItemViewer.open({
					uuid: `${this.actor.uuid}.ChantryTrait.${traitkey}`,
					name: game.i18n.localize(labelkey),
					system: { description: game.i18n.localize(descriptionkey) }
				});
			});
		});
	}

	/**
	 * Replaces the inline `.change()` binder's three branches (`flavor`/`tier`/`pool.total`) -
	 * gated on `this.locked` exactly as `_onsheetChange` did, warning on a locked write attempt.
	 * Kept as a `data-source`-driven dispatch (rather than switching to appv2's generic
	 * `submitData`/`expandObject` shape `PCActorSheet.onSubmitActorForm` uses for arbitrary named
	 * fields) because this sheet's own three writable fields already carry `data-source` in the
	 * template and there is no benefit to inventing a second wiring convention for three fields.
	 * @param {SubmitEvent} event
	 */
	static async onSubmitActorForm(event, form, formData) {
		const target = event.target;
		const dataset = target?.dataset ?? {};
		const source = dataset.source;

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		if (source === "flavor") {
			await this.actor.update({ "system.flavor": target.value });
		}
		else if (source === "tier") {
			await this.actor.update({ "system.tier": target.value });
		}
		else if (source === "pooltotal") {
			let value = parseInt(target.value);

			if (isNaN(value) || value < 0) {
				value = 0;
			}

			await this.actor.update({ "system.pool.total": value });
		}
		else if (target?.name === "name") {
			await this.actor.update({ name: target.value });
		}
	}

	/* Alter the Chantry/Construct's own rating dot (1-5). `data-action="ratingDotChange"` is only
	   ever RENDERED on the dot spans while unlocked (task 2.3) - this in-handler check stays as
	   defence in depth, not as the only gate (existing requirement, unchanged by the framework
	   migration). */
	static async onRatingDotChange(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const current = parseInt(this.actor.system.rating) || 0;

		let value = index + 1;

		if (current === value) {
			value = value - 1;
		}

		await this.actor.update({ "system.rating": value });
	}

	/* Alter a single construction Trait's dot rating and recompute the spent pool. Same
	   bind-time + in-handler double gate as the rating dots above. */
	static async onTraitDotChange(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const parent = target.parentElement;
		const key = parent?.dataset?.key;
		if (!key) return;

		const index = Number(target.dataset.index);
		const current = parseInt(this.actor.system.traits?.[key]) || 0;

		let value = index + 1;

		if (current === value) {
			value = value - 1;
		}

		const traits = foundry.utils.deepClone(this.actor.system.traits ?? {});
		traits[key] = value;

		const traitcost = CONFIG.worldofdarkness.chantry.traitcost;
		let spent = 0;

		for (const traitkey in traitcost) {
			spent += (parseInt(traits[traitkey]) || 0) * traitcost[traitkey];
		}

		await this.actor.update({
			[`system.traits.${key}`]: value,
			"system.pool.spent": spent
		});
	}
}
