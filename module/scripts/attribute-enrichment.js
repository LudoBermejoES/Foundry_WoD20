/**
 * Attribute -> compendium document matching, for the eye icon on the Attributes tab.
 *
 * Owner-delegated addition to open-item-window-from-eye-icon: Attributes are NOT Items
 * (`actor.system.attributes.<key>`, a plain system field with no description field of its own -
 * see design.md Decision 5, out of scope for add-ability-descriptions-from-compendium). Nothing is
 * written to the actor here: the eye opens a READ-ONLY compendium document instead of an embedded
 * Item, using the attribute's own stable key (`strength`, `dexterity`, ... - the same keys
 * `actor.system.attributes` is keyed on and `CONFIG.worldofdarkness.attributes` enumerates) as the
 * match, never a localized name lookup.
 *
 * The projection that ships these documents (a sibling change, in `webgen/`, out of scope here)
 * may land after this code, so every lookup here must degrade to "no match" - never throw, never
 * assume a specific pack name or field is present. Two candidate pack names are tried
 * ("shared-attributes", matching this module's established "shared-<name>" convention for
 * line-agnostic content, then "attributes" as a plain fallback), and three candidate match fields
 * per document, in order: `system.id`, a `flags["wod20-compendium-es"].attribute_key` flag (the
 * same shape `project_abilities()` stamps as `ability_key`), then a normalized-name comparison
 * against this system's own localized attribute label as a last resort.
 */

const MODULE_ID = "wod20-compendium-es";
const CANDIDATE_PACK_NAMES = ["shared-attributes", "attributes"];

function normalize(s) {
	return (s ?? "").toString().trim().toLowerCase();
}

/**
 * All installed compendium packs that might carry attribute documents. Returns [] if the module
 * or none of the candidate packs are installed - the caller then finds no matches for anything,
 * which is exactly the "pack absent" degrade path.
 * @returns {CompendiumCollection[]}
 */
function candidateAttributePacks() {
	const packs = [];
	for (const name of CANDIDATE_PACK_NAMES) {
		const pack = game.packs.get(`${MODULE_ID}.${name}`);
		if (pack) packs.push(pack);
	}
	return packs;
}

/**
 * Finds the compendium document for one attribute key, trying every candidate pack and match
 * field. Never throws.
 * @param {string} key - the attribute's stable key (e.g. "strength")
 * @returns {Promise<Item|null>}
 */
export async function findAttributeCompendiumMatch(key) {
	const normalizedKey = normalize(key);
	if (!normalizedKey) return null;

	try {
		const packs = candidateAttributePacks();
		if (!packs.length) return null;

		const label = normalize(game.i18n?.localize?.(CONFIG.worldofdarkness?.attributes?.[key] ?? ""));

		for (const pack of packs) {
			let docs;
			try {
				docs = await pack.getDocuments();
			} catch (err) {
				console.warn(`WoD | Attribute description: could not load compendium pack "${pack.collection}":`, err);
				continue;
			}

			const bySystemId = docs.find(d => normalize(d.system?.id) === normalizedKey);
			if (bySystemId) return bySystemId;

			const byFlag = docs.find(d => normalize(d.flags?.[MODULE_ID]?.attribute_key) === normalizedKey);
			if (byFlag) return byFlag;

			if (label) {
				const byName = docs.find(d => normalize(d.name) === label);
				if (byName) return byName;
			}
		}

		return null;
	} catch (err) {
		console.warn(`WoD | Attribute description lookup failed for "${key}":`, err);
		return null;
	}
}

/**
 * Resolves every visible attribute key on `actor` to its matching compendium document's UUID (or
 * omits the key entirely if there is no match), for use in the sheet's render context. The
 * template only renders an eye icon where a UUID is present - see stats_attributes.hbs - so an
 * absent/incomplete pack simply means fewer (or zero) eyes, never a broken one.
 * @param {Actor} actor
 * @returns {Promise<Record<string, string>>} attribute key -> Document uuid
 */
export async function buildAttributeCompendiumUuidMap(actor) {
	const uuids = {};

	try {
		const keys = Object.keys(actor?.system?.attributes ?? {});
		for (const key of keys) {
			const match = await findAttributeCompendiumMatch(key);
			if (match) uuids[key] = match.uuid;
		}
	} catch (err) {
		console.warn("WoD | Attribute description map failed to build; attribute eyes disabled for this render:", err);
	}

	return uuids;
}

/**
 * Opens a document by uuid in a forced-read-only sheet instance. Read-only is enforced twice,
 * because this system's own item sheets (item-sheet.js, item-sheet-v2.js) gate on their own
 * `this.locked` instance flag rather than the standard Foundry `options.editable` - and
 * item-sheet-v2.js hardcodes `this.locked = false` unconditionally (a pre-existing gap, not
 * introduced here - see the report), so passing `editable: false` alone would not be respected by
 * every sheet class this document's type might resolve to. Setting `.locked` directly after
 * construction works for both sheet families in this system regardless of which one applies.
 * @param {string} uuid
 * @returns {Promise<void>}
 */
export async function openAttributeCompendiumSheet(uuid) {
	if (!uuid) return;

	const doc = await fromUuid(uuid);
	if (!doc) {
		console.warn(`WoD | Attribute description: compendium document "${uuid}" could not be resolved (pack may have been removed or updated).`);
		return;
	}

	if (!doc.sheet) {
		console.warn(`WoD | Attribute description: document "${uuid}" has no sheet.`);
		return;
	}

	const SheetClass = doc.sheet.constructor;
	const readOnlySheet = new SheetClass(doc, { editable: false });
	readOnlySheet.locked = true;
	readOnlySheet.render(true);
}
