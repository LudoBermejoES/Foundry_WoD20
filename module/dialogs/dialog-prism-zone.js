/**
 * add-prism-of-focus-foundry — design.md D6: a Zona de Realidad is a property of a PLACE, shared by
 * every mage casting there, so it lives on the Foundry `Scene` (`scene.flags["worldofdarkness"]
 * .prismZones = [{practice_id, value}]`, value -5..5), edited from a small GM-facing dialog opened
 * from the Scene's own controls (its Configuration sheet — see `renderSceneConfig` in
 * `module/hooks.js`), never a new sheet type or a Journal page.
 */
export class PrismZoneDialog extends FormApplication {
	constructor(scene) {
		super(scene, { submitOnChange: false, closeOnSubmit: false });
		this.scene = scene;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "prism-zone-dialog",
			classes: ["wod20", "wod-dialog"],
			title: game.i18n.localize("wod.prism.section.zones"),
			template: "systems/worldofdarkness/templates/dialogs/dialog-prism-zone.hbs",
			width: 420,
			height: "auto"
		});
	}

	getData() {
		const data = super.getData();
		data.zones = foundry.utils.deepClone(this.scene.flags?.worldofdarkness?.prismZones ?? []);
		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".prism-zone-add").click(this._onAdd.bind(this));
		html.find(".prism-zone-delete").click(this._onDelete.bind(this));
		html.find(".prism-zone-save").click(this._onSave.bind(this));
	}

	_onAdd(event) {
		event.preventDefault();
		const zones = foundry.utils.deepClone(this.scene.flags?.worldofdarkness?.prismZones ?? []);
		zones.push({ practice_id: "", value: 0 });
		this.scene.setFlag("worldofdarkness", "prismZones", zones).then(() => this.render());
	}

	_onDelete(event) {
		event.preventDefault();
		const index = parseInt(event.currentTarget.dataset.index);
		const zones = foundry.utils.deepClone(this.scene.flags?.worldofdarkness?.prismZones ?? []);
		zones.splice(index, 1);
		this.scene.setFlag("worldofdarkness", "prismZones", zones).then(() => this.render());
	}

	async _onSave(event) {
		event.preventDefault();
		const rows = this.element.find(".prism-zone-row");
		const zones = [];
		rows.each((_, row) => {
			const practiceId = row.querySelector(".prism-zone-practice")?.value ?? "";
			const value = parseInt(row.querySelector(".prism-zone-value")?.value) || 0;
			if (practiceId) zones.push({ practice_id: practiceId, value: Math.max(-5, Math.min(5, value)) });
		});
		await this.scene.setFlag("worldofdarkness", "prismZones", zones);
		this.close();
	}

	async _updateObject() {
		// Handled explicitly by `_onSave` (a multi-row dynamic form is simpler to read straight off
		// the DOM here than to coax through FormApplication's single-submit dotted-key parsing).
	}
}

export default PrismZoneDialog;
