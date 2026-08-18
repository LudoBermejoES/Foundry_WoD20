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

		// Stamp the SAME provenance flags a compendium-dragged Item carries
		// (`wod20-compendium-es/module.json`'s own `mage-resonance` pack, 17 documents including
		// all 7 flavor markers, source_type "resonance" on every one — verified against the
		// compiled src/). `compendium-description.js`'s `resolveDescription()` is already wired
		// into the eye icon's `ItemViewer` (`item-viewer.js`) for ANY document carrying this
		// provenance, regardless of item type — so this is the ONLY thing needed for the eye icon
		// to show the flavor's real description live from the compendium; no new
		// description-rendering code, and the text is never copied/duplicated onto the item.
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
			flags: {
				"wod20-compendium-es": { id: flavorId, line: "mage", source_type: "resonance" },
			},
		}]);
	}
}

export default DialogAddResonanceMark;
