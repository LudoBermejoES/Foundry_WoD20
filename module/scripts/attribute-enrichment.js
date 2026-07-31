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

// CORRECTED 2026-07-31: this module used to also export `openAttributeCompendiumSheet`, which
// opened the resolved document's own edit sheet and forced it read-only by constructing an
// instance and overriding `.locked` from outside (a workaround for item-sheet-v2.js hardcoding
// `this.locked = false`). That is gone: the click handler in pc-actor-sheet.js now resolves the
// uuid itself and hands the document straight to the shared, purpose-built ItemViewer
// (module/applications/item-viewer.js), which cannot write at all and needs no such workaround -
// see design.md Decision 1. This module's job stays exactly "find the matching document", nothing
// about how it gets displayed.
