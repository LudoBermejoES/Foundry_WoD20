/**
 * ItemViewer - a purpose-built READ-ONLY window for the eye icon.
 *
 * Corrected 2026-07-31 (see openspec/changes/open-item-window-from-eye-icon/design.md Decision 1):
 * the eye is a read affordance, not an edit affordance. The first implementation opened the
 * document's own edit sheet (`item.sheet.render(true)`), which is wrong regardless of how well its
 * permissions behave - "read-only" has to mean the form controls are ABSENT, not disabled. This
 * class contains no `<input>`, `<textarea>`, `<select>` or submit control anywhere, and never
 * calls `document.update()`.
 *
 * It reads exactly three things - `name`, `system.description`, and the document's `system`
 * mechanics - which every item type in this system already carries, and which is also why the
 * same class serves the keyed-trait compendium documents (Attributes, Spheres) opened from
 * `trait-enrichment.js`/`pc-actor-sheet.js`, which have no per-actor item sheet of their own.
 * It never needs per-type knowledge (an Advantage's fields vs a Realm's), because it never edits
 * either - see `_systemFieldRows` below for exactly what "never needs to know" means in code.
 */

import { resolveDescription } from "../scripts/compendium-description.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

// Top-level `system` keys never shown as a generic labelled row, either because they are
// rendered separately (description) or because they are implementation detail with no
// stable, generic label (nested settings/bonus objects a per-type sheet knows how to render,
// but this viewer deliberately does not).
const SKIPPED_SYSTEM_FIELDS = new Set(["description", "settings", "bonuslist", "details"]);

/**
 * One instance per open viewer, but never more than one per document at a time - see
 * `ItemViewer.open`.
 */
export default class ItemViewer extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

	/** @type {Map<string, ItemViewer>} document uuid -> the open viewer for it */
	static #openViewers = new Map();

	/**
	 * Opens (or focuses) the viewer for `document`. Idempotent per document uuid: a second call
	 * for the same document while its viewer is still open raises that window instead of creating
	 * a duplicate - this is what makes clicking the eye for the same item from two different tabs
	 * behave as one window, since both tabs resolve to the same document and therefore the same
	 * uuid.
	 * @param {foundry.abstract.Document} document - any Document with a `system` and a `name`
	 *        (an embedded Item, or a compendium document such as an attribute reference entry)
	 * @returns {ItemViewer}
	 */
	static open(document) {
		if (!document) return null;

		const existing = ItemViewer.#openViewers.get(document.uuid);
		if (existing?.rendered) {
			// RE-RENDER, not just raise. Focusing alone showed a window whatever it happened to be
			// built from, which went wrong the moment a migration rewrote item descriptions under an
			// open viewer: the owner clicked the eye, got the same window back, and saw the OLD
			// Markdown while the stored document already held the corrected HTML. A read-only window
			// that can display stale data is a worse bug than a duplicate window.
			existing.viewedDocument = document;
			existing.render();
			existing.bringToFront();
			return existing;
		}

		const viewer = new ItemViewer(document);
		ItemViewer.#openViewers.set(document.uuid, viewer);
		viewer.render(true);
		return viewer;
	}

	constructor(document, options = {}) {
		super(options);
		this.viewedDocument = document;
	}

	/** @override */
	static DEFAULT_OPTIONS = {
		id: "wod-item-viewer-{id}",
		classes: ["wod20", "wod-item-viewer"],
		tag: "div",
		window: {
			icon: "fa-solid fa-eye",
			resizable: true,
			minimizable: true
		},
		// "Space to show everything": generous defaults, both resizable per the spec. The longest
		// shipped description (14,112 characters, an 11-row ratings table) is the sizing target -
		// this is comfortably wide enough for that table's dot column and text column to both stay
		// legible, and the body scrolls internally (see the .hbs/.css) for anything longer still.
		position: {
			width: 640,
			height: 720
		}
	};

	/** @override */
	static PARTS = {
		body: {
			template: "systems/worldofdarkness/templates/dialogs/item-viewer.hbs"
		}
	};

	/** @override */
	get title() {
		return this.viewedDocument?.name ?? "";
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const doc = this.viewedDocument;

		context.name = doc?.name ?? "";

		// read-descriptions-from-compendium: resolve LIVE from `wod20-compendium-es` when `doc`
		// carries entity provenance and has no local override (see compendium-description.js).
		// `resolveDescription` degrades to `null` on every failure mode - no provenance, an
		// override, module absent, no match, empty compendium text - so the stored value is always
		// the fallback and this window never has less to show than it did before this change.
		const rawDescription = (await resolveDescription(doc)) ?? doc?.system?.description ?? "";
		context.description = rawDescription
			? await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawDescription, { async: true })
			: "";
		context.hasDescription = context.description.trim().length > 0;

		// `_systemFieldRows` and `title` (above) both stay on the ACTOR's document, never the
		// resolved compendium one - the compendium's own Background documents carry `value: 0`, and
		// resolving system fields here would display a character's rating-3 Refuerzos as unbought
		// (design.md Decision 4).
		context.systemFields = _systemFieldRows(doc);

		return context;
	}

	/**
	 * Re-renders the open viewer for `uuid`, if there is one. The `updateItem` hook at the bottom of
	 * this file calls it; nothing else needs to know the registry exists.
	 * @param {string} uuid
	 */
	static refreshFor(uuid) {
		const viewer = uuid ? ItemViewer.#openViewers.get(uuid) : null;
		if (viewer?.rendered) viewer.render();
	}

	/** @override */
	async close(options) {
		ItemViewer.#openViewers.delete(this.viewedDocument?.uuid);
		return super.close(options);
	}
}

/**
 * Builds the generic "system fields" rows: every top-level scalar (string/number/boolean) key of
 * `document.system`, skipping the ones in SKIPPED_SYSTEM_FIELDS and skipping empty/null/undefined
 * values (same "omit rather than render empty" rule the description follows). The label is the
 * field's own key, split on camelCase boundaries and title-cased - a plain, type-agnostic fallback
 * that needs no per-item-type dictionary, by design (see this file's header comment). Nested
 * objects/arrays (a Power's damage block, an Ability's settings, a bonuslist, ...) are skipped
 * entirely rather than guessed at, because rendering them meaningfully is exactly the per-type
 * knowledge this viewer is built to avoid.
 * @param {foundry.abstract.Document} doc
 * @returns {{label: string, value: string}[]}
 */
function _systemFieldRows(doc) {
	const system = doc?.system;
	if (!system || typeof system !== "object") return [];

	const rows = [];

	for (const [key, value] of Object.entries(system)) {
		if (SKIPPED_SYSTEM_FIELDS.has(key)) continue;
		if (value === null || value === undefined) continue;

		const valueType = typeof value;
		if (valueType !== "string" && valueType !== "number" && valueType !== "boolean") continue; // skip objects/arrays
		if (valueType === "string" && value.trim() === "") continue;

		let displayValue;
		if (valueType === "boolean") {
			displayValue = game.i18n.localize(value ? "wod.labels.yes" : "wod.labels.no");
		} else {
			displayValue = String(value);
		}

		rows.push({ label: _labelFromKey(key), value: displayValue });
	}

	return rows;
}

function _labelFromKey(key) {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// An open viewer must follow its document. Without this, anything that rewrites an item while its
// window is open leaves that window showing the old content indefinitely - which is precisely what
// the trait re-sync migration did: it corrected the stored description under an open viewer, and the
// window kept displaying the Markdown it had been built from. Registered at module load, once,
// alongside the registry it invalidates, so the class owns both halves.
Hooks.on("updateItem", (item) => ItemViewer.refreshFor(item?.uuid));
