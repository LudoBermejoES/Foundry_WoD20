import ActionHelper from "../../scripts/action-helpers.js";

/**
 * Sheet for the "Chantry" Actor type - a communal Chantry (Traditions) / Construct
 * (Technocracy) group facility, per the construction-Trait rules in
 * m20-the-operative-dossier ("Estatus y el Constructo").
 *
 * Unlike the other legacy Actor types this sheet does NOT extend MortalActorSheet -
 * a Chantry has no health/attributes/advantages/items, so it is kept as a lean,
 * self-contained ActorSheet with just the fields it needs.
 */
export default class ChantryActorSheet extends foundry.appv1.sheets.ActorSheet {

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["wod20", "wod-sheet", "chantry"],
			template: "systems/worldofdarkness/templates/actor/chantry-sheet.html",
			width: 620,
			height: 700
		});
	}

	constructor(actor, options) {
		super(actor, options);

		// Source of truth is the persisted system.locked field (defaults to false in
		// template.json, so a newly-created Chantry is editable right away) rather than
		// a transient in-memory flag - this is kept in sync from getData() on every render
		// so the lock state survives closing/reopening the sheet.
		this.locked = actor.system.locked ?? false;
	}

	/** @override */
	get template() {
		return "systems/worldofdarkness/templates/actor/chantry-sheet.html";
	}

	/** @override */
	async getData() {
		const data = await super.getData();

		// Keep the sheet-instance flag in sync with the persisted actor field on every
		// render, so the lock/unlock button (and every locked-guard below) always reflects
		// the actor's actual system.locked value.
		this.locked = this.actor.system.locked ?? false;

		data.config = CONFIG.worldofdarkness;
		data.locked = this.locked;

		const traits = data.actor.system.traits ?? {};
		const rating = parseInt(data.actor.system.rating) || 0;
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
				value: value,
				cost: cost,
				overcap: (rating > 0) && (value > cap)
			});
		}

		data.actor.system.pool = data.actor.system.pool ?? {};
		data.actor.system.pool.spent = spent;
		data.actor.system.cap = cap;
		data.actor.system.notes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.actor.system.notes, { async: true });

		data.listData = { traits: traitlist };

		return data;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		ActionHelper.SetupDotCounters(html);

		if (!this.options.editable) return;

		html
			.find(".lock-btn")
			.click(this._onToggleLocked.bind(this));

		html
			.find(".inputdata")
			.change(event => this._onsheetChange(event));

		html
			.find(".chantry-rating > .resource-value-step")
			.click(this._onRatingDotChange.bind(this));

		html
			.find(".chantry-trait-value > .resource-value-step")
			.click(this._onTraitDotChange.bind(this));
	}

	/* Lock / unlock the sheet - persisted on the actor (like ActionHelper.OnActorLock) so the
	   state survives closing/reopening the sheet; the actor update automatically re-renders
	   this sheet. */
	async _onToggleLocked(event) {
		event.preventDefault();

		if (event.detail === 0) return; // detail === 0 means keyboard-triggered click

		await this.actor.update({ "system.locked": !this.actor.system.locked });
	}

	async _onsheetChange(event) {
		event.preventDefault();

		const element = event.currentTarget;
		const dataset = element.dataset;
		const source = dataset.source;

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		if (source === "flavor") {
			await this.actor.update({ "system.flavor": element.value });
		}
		else if (source === "tier") {
			await this.actor.update({ "system.tier": element.value });
		}
		else if (source === "pooltotal") {
			let value = parseInt(element.value);

			if (isNaN(value) || value < 0) {
				value = 0;
			}

			await this.actor.update({ "system.pool.total": value });
		}
	}

	/* Alter the Chantry/Construct's rating dot (1-5) */
	async _onRatingDotChange(event) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const element = event.currentTarget;
		const index = Number(element.dataset.index);
		const current = parseInt(this.actor.system.rating) || 0;

		let value = index + 1;

		if (current === value) {
			value = value - 1;
		}

		await this.actor.update({ "system.rating": value });
	}

	/* Alter a single construction Trait's dot rating and recompute the spent pool */
	async _onTraitDotChange(event) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const element = event.currentTarget;
		const parent = element.parentElement;
		const key = parent.dataset.key;
		const index = Number(element.dataset.index);
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
