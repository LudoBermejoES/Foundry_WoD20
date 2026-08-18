/**
 * add-mage-resonance — task 5.3: a small, dedicated dialog to add ONE new Resonancia/Sinergia mark
 * (a flavor pick + a free-text mark word), matching the same "pure function first, dialog is a
 * display/input shell" FormApplication convention `DialogPrismPrompt`/`DialogPrismRitual` already
 * establish, rather than reusing the system's own generic "Resonancia" create button
 * (`create-helpers.js`'s bare `buttons.resonance`), which is a SEPARATE, internal mechanism (no
 * category, used for the Vamamarga Jhor / corrupted-Práctica counters — see
 * `prism-corrupted-helpers.js`) and must never be entangled with a player-facing mark.
 *
 * Deliberately creates the `wod.types.resonance` Item DIRECTLY here rather than going through
 * `CreateHelper` at all: every other create button in this system makes a BLANK item the player
 * then edits field-by-field on its own sheet, but a resonance mark's two defining fields (`name` =
 * the mark word, `system.category` = the flavor) are exactly what this dialog collects up front,
 * so there is nothing left to edit afterward beyond the dot rating (already editable from the
 * sheet row itself, `resonance.hbs`).
 */
import { RESONANCE_FLAVOR_IDS, RESONANCE_FLAVOR_LABEL_KEY } from "../scripts/resonance-data.js";

export class DialogAddResonanceMark extends FormApplication {
	/**
	 * @param {{actor: Actor}} object
	 */
	constructor(object = {}) {
		super({ actor: null, flavorId: RESONANCE_FLAVOR_IDS[0], mark: "", ...object }, { submitOnChange: false, closeOnSubmit: true });
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "add-resonance-mark-dialog",
			classes: ["wod20", "wod-dialog"],
			template: "systems/worldofdarkness/templates/dialogs/dialog-add-resonance-mark.hbs",
			title: game.i18n.localize("wod.resonance.dialog.title"),
			width: 380,
			height: "auto",
			closeOnSubmit: true,
			submitOnChange: false,
		});
	}

	getData() {
		const data = super.getData();
		data.flavors = RESONANCE_FLAVOR_IDS.map(id => ({
			id,
			label: game.i18n.localize(RESONANCE_FLAVOR_LABEL_KEY[id]),
		}));
		return data;
	}

	async _updateObject(event, formData) {
		const actor = this.object.actor;
		const mark = (formData.mark ?? "").trim();
		const flavorId = formData.flavorId;

		if (!mark) {
			ui.notifications.warn(game.i18n.localize("wod.resonance.dialog.markrequired"));
			return;
		}
		if (!RESONANCE_FLAVOR_IDS.includes(flavorId)) return;
		if (!actor) return;

		await actor.createEmbeddedDocuments("Item", [{
			name: mark,
			type: "Trait",
			system: {
				type: "wod.types.resonance",
				category: flavorId,
				value: 0,
				max: 5,
				isremovable: true,
			},
		}]);
	}
}

export default DialogAddResonanceMark;
