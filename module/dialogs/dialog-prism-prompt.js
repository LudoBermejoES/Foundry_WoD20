/**
 * add-prism-of-focus-foundry — design.md D12's 7 `prompt`-bucket Prácticas (task 6.2): one small,
 * per-Práctica calculator dialog, matching the same "pure function first, dialog is a display/input
 * shell" precedent `DialogPrismRitual` already establishes (never auto-driving another roll dialog
 * or posting a chat card, except Fe's own "claim" button, which genuinely needs to persist a
 * once-per-Historia actor flag — the one exception, called out in its own handler below).
 *
 * One class handling all 7 (rather than 7 near-identical files) — `getData()` dispatches on
 * `this.object.practiceId` to build exactly the one bucket's result the template shows.
 */
import * as Calc from "../scripts/prism-prompt-calculators.js";
import { getAbilityRating, getAttributeRating, getAdvantageField } from "../scripts/prism-helpers.js";

const FAITH_CLAIMED_FLAG = "prismFaithClaimedThisHistoria";
const FAITH_VIOLATED_FLAG = "prismFaithCreedViolated";

export class DialogPrismPrompt extends FormApplication {
	/**
	 * @param {{practiceId: string, actor?: Actor}} object
	 */
	constructor(object = {}) {
		// D4's "seed a sensible default, remain editable" convention: when an actor is provided,
		// Vigorización's own pool (Resistencia + Meditación) and Psiónica's Willpower cap default
		// from the actor's current traits — every field below stays a plain, editable input either
		// way (never locked to the seeded value).
		const actor = object?.actor ?? null;
		const seeded = actor ? {
			resistencia: getAttributeRating(actor, "stamina"),
			meditacion: getAbilityRating(actor, "meditation"),
			temporaryWillpower: getAdvantageField(actor, "willpower", "temporary")
		} : {};

		super({
			practiceId: "",
			actor: null,
			baseCost: 0,
			directCreation: false,
			resistencia: 0,
			meditacion: 0,
			successes: 0,
			baseDevices: 0,
			broadcast: false,
			permanent: false,
			baseSuccesses: 0,
			aretePool: 0,
			temporaryWillpower: 0,
			waiveMindRequirement: false,
			...seeded,
			...object
		}, { submitOnChange: true, closeOnSubmit: false });
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "prism-prompt-dialog",
			classes: ["wod20", "wod-dialog"],
			template: "systems/worldofdarkness/templates/dialogs/dialog-prism-prompt.hbs",
			width: 420,
			height: "auto",
			closeOnSubmit: false,
			submitOnChange: true
		});
	}

	get title() {
		const practiceId = this.object.practiceId;
		const key = { "alchemy": "alchemy", "maleficia": "maleficia", "invigoration": "invigoration", "hypertech": "hypertech", "media-control": "mediacontrol", "psionics": "psionics", "faith": "faith" }[practiceId];
		return key ? game.i18n.localize(`wod.prism.prompt.${key}.title`) : game.i18n.localize("wod.prism.dialog.openprompt");
	}

	getData() {
		const data = super.getData();
		const practiceId = this.object.practiceId;
		data.practiceId = practiceId;
		data.isGM = game.user?.isGM ?? false;

		// Formatted here (in JS, via `game.i18n.format`), not as Handlebars hash-arg substitution —
		// matching this codebase's own established convention for a formatted i18n string (see
		// `dialog-aretecasting.js`'s corrupted-resistance chat message), rather than assuming Foundry
		// core's `localize` helper's hash-substitution behavior, which nothing else in this repo
		// currently exercises.
		switch (practiceId) {
			case "alchemy": {
				const cost = Calc.alchemyCraftingCost(this.object.baseCost);
				data.result = { cost, text: game.i18n.format("wod.prism.prompt.alchemy.result", { cost }) };
				break;
			}
			case "maleficia": {
				const cost = Calc.maleficiaCraftingCost(this.object.baseCost);
				const modifier = Calc.maleficiaDirectCreationModifier(this.object.directCreation);
				data.result = { cost, modifier, text: game.i18n.format("wod.prism.prompt.maleficia.result", { cost, modifier }) };
				break;
			}
			case "invigoration": {
				const pool = Calc.invigorationPool(this.object.resistencia, this.object.meditacion);
				const difficulty = Calc.INVIGORATION_DIFFICULTY;
				const gained = Calc.invigorationWillpowerGained(this.object.successes);
				const cost = Calc.invigorationQuintessenceCost(this.object.successes);
				data.result = { pool, difficulty, gained, cost, text: game.i18n.format("wod.prism.prompt.invigoration.result", { pool, difficulty, gained, cost }) };
				break;
			}
			case "hypertech": {
				const devices = Calc.hypertechDevicesCreated(this.object.baseDevices);
				data.result = { devices, text: game.i18n.format("wod.prism.prompt.hypertech.result", { devices }) };
				break;
			}
			case "media-control": {
				const successes = Calc.mediaControlSuccessesRequired(this.object.baseSuccesses, this.object.broadcast, this.object.permanent);
				const modifier = Calc.mediaControlDifficultyModifier(this.object.broadcast, this.object.permanent);
				data.result = { successes, modifier, text: game.i18n.format("wod.prism.prompt.mediacontrol.result", { successes, modifier }) };
				break;
			}
			case "psionics": {
				const pool = Calc.psionicsAretePoolCap(this.object.aretePool, this.object.temporaryWillpower);
				data.result = { pool, text: game.i18n.format("wod.prism.prompt.psionics.result", { pool }) };
				break;
			}
			case "faith": {
				const actor = this.object.actor;
				const claimed = actor ? !!actor.getFlag("worldofdarkness", FAITH_CLAIMED_FLAG) : false;
				const violated = actor ? !!actor.getFlag("worldofdarkness", FAITH_VIOLATED_FLAG) : false;
				data.result = {
					claimed,
					violated,
					available: Calc.faithClaimAvailable(claimed, violated)
				};
				break;
			}
			default:
				data.result = {};
		}

		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".prism-prompt-faith-claim").click(this._onFaithClaim.bind(this));
		html.find(".prism-prompt-faith-reset").click(this._onFaithReset.bind(this));
	}

	/** Fe's Beneficio (A26) — the ONE prompt-dialog action that persists actor state rather than
	 *  just displaying a computed number, because "once per Historia" is inherently a persisted
	 *  fact, not a per-open calculation. There is no automated "Historia ended" event anywhere in
	 *  this system (matching this project's "observed, not enforced" posture) — `_onFaithReset`
	 *  below is the GM's manual equivalent. */
	async _onFaithClaim(event) {
		event.preventDefault();
		const actor = this.object.actor;
		if (!actor) {
			ui.notifications.warn(game.i18n.localize("wod.prism.prompt.faith.title"));
			return;
		}

		const claimed = !!actor.getFlag("worldofdarkness", FAITH_CLAIMED_FLAG);
		const violated = !!actor.getFlag("worldofdarkness", FAITH_VIOLATED_FLAG);
		if (!Calc.faithClaimAvailable(claimed, violated)) return;

		await actor.setFlag("worldofdarkness", FAITH_CLAIMED_FLAG, true);
		this.render();
	}

	async _onFaithReset(event) {
		event.preventDefault();
		const actor = this.object.actor;
		if (!actor) return;
		await actor.setFlag("worldofdarkness", FAITH_CLAIMED_FLAG, false);
		this.render();
	}

	async _updateObject(event, formData) {
		this.object.baseCost = parseInt(formData.baseCost) || 0;
		this.object.directCreation = !!formData.directCreation;
		this.object.resistencia = parseInt(formData.resistencia) || 0;
		this.object.meditacion = parseInt(formData.meditacion) || 0;
		this.object.successes = parseInt(formData.successes) || 0;
		this.object.baseDevices = parseInt(formData.baseDevices) || 0;
		this.object.broadcast = !!formData.broadcast;
		this.object.permanent = !!formData.permanent;
		this.object.baseSuccesses = parseInt(formData.baseSuccesses) || 0;
		this.object.aretePool = parseInt(formData.aretePool) || 0;
		this.object.temporaryWillpower = parseInt(formData.temporaryWillpower) || 0;
		this.object.waiveMindRequirement = !!formData.waiveMindRequirement;

		this.render();
	}
}

export default DialogPrismPrompt;
