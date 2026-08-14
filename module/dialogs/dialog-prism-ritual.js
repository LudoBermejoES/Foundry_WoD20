/**
 * add-prism-of-focus-foundry — design.md D7: a standalone Rituales calculator dialog, matching
 * `wod20-combat-multiple-actions`'s precedent (pure function first, dialog is a display/input
 * shell). Does NOT post a chat card, roll dice, or auto-drive another dialog (Non-goal) — the
 * player still opens the normal roll dialog per A12's resolved semantics.
 */
import { computeRitualGroup } from "../scripts/prism-ritual-calculator.js";

export class DialogPrismRitual extends FormApplication {
	constructor(object = {}) {
		super({
			masterPracticeRating: 0,
			masterPermanentWillpower: 0,
			masterSphereCovered: "",
			participants: [],
			requiredSpheres: "",
			...object
		}, { submitOnChange: true, closeOnSubmit: false });
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "prism-ritual-dialog",
			classes: ["wod20", "wod-dialog"],
			title: game.i18n.localize("wod.prism.section.rituals"),
			template: "systems/worldofdarkness/templates/dialogs/dialog-prism-ritual.hbs",
			width: 480,
			height: "auto",
			closeOnSubmit: false,
			submitOnChange: true
		});
	}

	getData() {
		const data = super.getData();
		const requiredSpheres = (this.object.requiredSpheres || "").split(",").map((s) => s.trim()).filter(Boolean);

		data.result = computeRitualGroup(
			{
				practiceRating: this.object.masterPracticeRating,
				permanentWillpower: this.object.masterPermanentWillpower,
				sphereCovered: this.object.masterSphereCovered
			},
			this.object.participants,
			requiredSpheres
		);

		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".prism-ritual-add-participant").click(this._onAddParticipant.bind(this));
		html.find(".prism-ritual-remove-participant").click(this._onRemoveParticipant.bind(this));
	}

	_onAddParticipant(event) {
		event.preventDefault();
		this.object.participants.push({ name: "", role: "participant-without", arete: 0, practiceRating: 0, laEscenaRating: 0, sphereCovered: "" });
		this.render();
	}

	_onRemoveParticipant(event) {
		event.preventDefault();
		const index = parseInt(event.currentTarget.dataset.index);
		this.object.participants.splice(index, 1);
		this.render();
	}

	async _updateObject(event, formData) {
		this.object.masterPracticeRating = parseInt(formData.masterPracticeRating) || 0;
		this.object.masterPermanentWillpower = parseInt(formData.masterPermanentWillpower) || 0;
		this.object.masterSphereCovered = formData.masterSphereCovered ?? "";
		this.object.requiredSpheres = formData.requiredSpheres ?? "";

		for (const [key, value] of Object.entries(formData)) {
			const match = key.match(/^participants\.(\d+)\.(\w+)$/);
			if (!match) continue;
			const [, index, field] = match;
			if (!this.object.participants[index]) continue;
			this.object.participants[index][field] = ["arete", "practiceRating", "laEscenaRating"].includes(field)
				? parseInt(value) || 0
				: value;
		}

		this.render();
	}
}

export default DialogPrismRitual;
