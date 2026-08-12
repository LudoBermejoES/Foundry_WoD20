/**
 * Trait -> compendium document matching, for the eye icon on traits the sheet holds by a stable
 * key OR (add-faction-sect-entities) by the field's own free-text value.
 *
 * Was `attribute-enrichment.js` (renamed in 7.5.29, add-sphere-descriptions). It resolved one kind
 * of trait; it now resolves any trait whose row carries a stable key, because a second block needed
 * exactly the same lookup and a second copy of it would have been two degradation contracts to keep
 * in agreement forever. The kinds today:
 *
 *   - `attribute` - `actor.system.attributes.<key>`, a plain system field with no description field
 *     of its own (see open-item-window-from-eye-icon design.md Decision 5).
 *   - `sphere`    - a `Sphere` Item, but one the SYSTEM creates (nine per mage, never dragged from a
 *     compendium), so it carries neither a description nor any provenance.
 *   - `sect`      - `actor.system.bio.splatfields.sect`, a free-text Mage bio field (add-faction-
 *     sect-entities) with no per-row key at all: the field's OWN value is the match target, via
 *     `matchNameDirectly` (see `TRAIT_KINDS` below and `localizedLabel`).
 *   - `affiliation` - `actor.system.bio.splatfields.affiliation`, the same shape as `sect` one
 *     splatfield over (add-affiliation-eye-icon), matched against the separate `mage-affiliation`
 *     pack so the two free-text fields can never cross-match each other's documents.
 *
 * WHY NOT `compendium-description.js`. That resolver is the other half of the same problem and is
 * NOT a duplicate of this one: it resolves by the `(id, line, source_type)` provenance triple that
 * both exporters stamp, which is the right key for an Item that CAME from the compendium. It cannot
 * serve these rows, in either direction: an attribute is not an Item at all, and a system-created
 * Sphere Item carries no `flags["wod20-char"]`/`flags["wod20-compendium-es"]` for its
 * `provenanceOf()` to read - it returns `null` and the row resolves to nothing. The Sphere
 * DOCUMENTS do carry that triple (`webgen/foundry_export.py`'s `_flags()`), which is why the two
 * resolvers can reach the same document from opposite ends; only this one can start from the
 * actor's row.
 *
 * Nothing here is ever written to the actor: the eye opens a READ-ONLY compendium document
 * (`applications/item-viewer.js`), never an embedded Item, and the match is the trait's own stable
 * key - a localized name IS tried, but only as a last resort after both key paths (see
 * `matchInPack`).
 *
 * DEGRADE, NEVER THROW. The content packs and this system fork deploy independently and in either
 * order, so every path here must survive the pack simply not being there: a missing module, a
 * missing pack, an unreadable pack and an unmatched key all end as "no uuid for that key", the
 * template then renders no eye on that row (`stats_attributes.hbs`, `power_spheres.hbs`), and the
 * sheet is otherwise untouched. Fewer eyes, never a broken sheet, never a dead click.
 */

const MODULE_ID = "wod20-compendium-es";

/**
 * The only per-kind knowledge in this file: where to look, which flag carries the key, and which
 * `CONFIG.worldofdarkness` table holds that kind's localized label for the last-resort name match.
 * The resolution ORDER and the degradation behaviour are deliberately NOT per kind - they are the
 * one thing every keyed trait must agree on, and they live once, in `matchInPack` and
 * `buildTraitCompendiumUuidMap` below.
 *
 * THE PACK NAMES ARE A CONTRACT with `webgen/foundry_export.py` (`ATTRIBUTE_PACK_SUFFIX`, and
 * `SPHERE_LINE`/`SPHERE_PACK_SUFFIX`, which carry the same warning on the producing side).
 * Renaming a pack on either side does not fail, log or throw: the lookup finds no pack, every key
 * degrades to "no match", and the change reaches a player as "the eyes vanished", with nothing in
 * the console. The second name in each list is a plain fallback, kept for the reason it was written
 * for attributes: a pack shipped under the bare type slug rather than this module's
 * `<line>-`/`shared-` convention still resolves.
 */
const TRAIT_KINDS = {
	attribute: {
		packs: ["shared-attributes", "attributes"],
		flagKey: "attribute_key",
		labels: () => CONFIG.worldofdarkness?.attributes
	},
	sphere: {
		packs: ["mage-spheres", "spheres"],
		flagKey: "sphere_key",
		// The Tradition labels ON PURPOSE, even for a Technocratic mage. `wod.allSpheresTechnocracy`
		// (config.js:387) is keyed by these SAME nine ids and only swaps the label
		// (dialog-edits.js:412), so a Dimensional Science row still carries
		// `system.id === "spirit"` and matches on the key path long before this fallback is reached.
		labels: () => CONFIG.worldofdarkness?.allSpheres
	},
	// add-faction-sect-entities — a Mage's `bio.splatfields.sect` (see `bio_splatfields.hbs`) is a
	// free-text field, not a system field with a stable per-row key the way Attributes/Spheres are:
	// there is exactly one "row" (whatever the player typed or `wod20-char`'s export wrote), and its
	// own VALUE is already the display text to match, not a key into it. `matchNameDirectly` below
	// is what makes `localizedLabel` skip the "key -> CONFIG label table -> localize" indirection
	// the other two kinds need and compare the value directly, normalized, against `mage-sects`
	// pack document names. `system.id`/flag matching (the other two paths in `matchInPack`) still
	// run first and simply never hit, since a sect document carries neither for this actor-side key.
	sect: {
		packs: ["mage-sects"],
		flagKey: "sect_key",
		matchNameDirectly: true
	},
	// add-affiliation-eye-icon — the SAME shape as `sect` immediately above, one splatfield over:
	// `bio.splatfields.affiliation` is also free text whose own value IS the display name (wodchar's
	// exporter already resolves `bio.identity` to its entity's `name_es` here), matched against the
	// `mage-affiliation` pack. A SEPARATE pack from `mage-sects` on purpose — an Affiliation value
	// ("Orden de Hermes") must never accidentally match a Sect document and vice versa, even though
	// both kinds share `matchNameDirectly` and the same matching code path.
	affiliation: {
		packs: ["mage-affiliation"],
		flagKey: "affiliation_key",
		matchNameDirectly: true
	}
};

function normalize(s) {
	return (s ?? "").toString().trim().toLowerCase();
}

/**
 * All installed compendium packs that might carry documents for this kind, in preference order.
 * Returns [] if the module or none of that kind's candidate packs are installed - the caller then
 * finds no matches for anything, which is exactly the "pack absent" degrade path.
 * @param {object} spec - the `TRAIT_KINDS` entry for the kind being resolved
 * @returns {CompendiumCollection[]}
 */
function candidateTraitPacks(spec) {
	const packs = [];
	for (const name of spec.packs) {
		const pack = game.packs.get(`${MODULE_ID}.${name}`);
		if (pack) packs.push(pack);
	}
	return packs;
}

/**
 * This kind's localized label for one key, for the last-resort name comparison. "" when the kind
 * has no label table, the key is absent from it, or i18n is unavailable - the caller then simply
 * skips the name path.
 * @param {object} spec
 * @param {string} key
 * @returns {string}
 */
function localizedLabel(spec, key) {
	if (spec.matchNameDirectly) return normalize(key);
	const path = spec.labels?.()?.[key];
	return path ? normalize(game.i18n?.localize?.(path) ?? "") : "";
}

/**
 * Splits a compendium document's display name into its individual aliases, normalized. mago20
 * joins a historical/alternate name onto several `affiliation` entities this way — e.g. "Sociedad
 * del Éter / Hijos del Éter", "Euthanatoi / Chakravanti" (5 of 26, measured) — so the document's
 * own canonical name is a compound that a legacy/free-text bio value naming only ONE of the two
 * (a real case: an imported Mage's Afiliación stored as plain "Hijos del Éter") would otherwise
 * never match. A name with no " / " is a single-element list of itself, so this is a no-op for
 * every other document.
 * @param {string} name
 * @returns {string[]}
 */
function nameAliases(name) {
	const whole = normalize(name);
	const parts = (name ?? "").split(" / ").map(normalize).filter(Boolean);
	return [...new Set([whole, ...parts])];
}

/**
 * The match itself, for one key against one pack's already-loaded documents. Three candidate
 * fields, in this order, for every kind: `system.id` (the primary key both `project_attributes()`
 * and `project_spheres()` stamp), then `flags["wod20-compendium-es"].<flagKey>` (the same value
 * again - a flag survives any future schema tightening, because Foundry never validates flags),
 * then a normalized comparison against this system's own localized label (or, for a
 * `matchNameDirectly` kind, the field's own value) as a last resort - checked against EACH of the
 * document's `nameAliases()`, not just its name as a whole.
 * @param {Item[]} docs
 * @param {object} spec
 * @param {string} key - the trait's key, as the sheet holds it
 * @param {string} normalizedKey
 * @returns {Item|null}
 */
function matchInPack(docs, spec, key, normalizedKey) {
	const bySystemId = docs.find(d => normalize(d.system?.id) === normalizedKey);
	if (bySystemId) return bySystemId;

	const byFlag = docs.find(d => normalize(d.flags?.[MODULE_ID]?.[spec.flagKey]) === normalizedKey);
	if (byFlag) return byFlag;

	const label = localizedLabel(spec, key);
	if (label) {
		const byName = docs.find(d => nameAliases(d.name).includes(label));
		if (byName) return byName;
	}

	return null;
}

/**
 * Resolves every key in `keys` to its matching compendium document's UUID - omitting any key with
 * no match - for use in a sheet's render context. THE one resolution entry point: there is
 * deliberately no single-key sibling, so the order above and the degrade path below each exist
 * exactly once, whatever kind of trait is being resolved.
 *
 * Each candidate pack is loaded ONCE per call and matched against every still-unresolved key,
 * rather than once per key. Per key the search order is unchanged (this pack's three fields, then
 * the next pack's); a nine-attribute or nine-Sphere block now costs one `getDocuments()` per pack
 * instead of nine.
 *
 * @param {string} kind - a key of `TRAIT_KINDS` ("attribute", "sphere", "sect")
 * @param {Iterable<string>} keys - the trait keys visible on the sheet
 * @returns {Promise<Record<string, string>>} trait key -> Document uuid, for matches only
 */
export async function buildTraitCompendiumUuidMap(kind, keys) {
	const uuids = {};

	try {
		const spec = TRAIT_KINDS[kind];
		if (!spec) {
			console.warn(`WoD | Trait description: unknown trait kind "${kind}"; no eyes for it this render.`);
			return uuids;
		}

		// normalized key -> the key as the SHEET holds it, which is what the returned map (and so the
		// template's `lookup`) must be keyed on. Deduplicated: a Sphere block lists each key once,
		// but nothing guarantees a caller does.
		const pending = new Map();
		for (const key of keys ?? []) {
			const normalizedKey = normalize(key);
			if (normalizedKey && !pending.has(normalizedKey)) pending.set(normalizedKey, key);
		}
		if (!pending.size) return uuids;

		for (const pack of candidateTraitPacks(spec)) {
			if (!pending.size) break;

			let docs;
			try {
				docs = await pack.getDocuments();
			} catch (err) {
				console.warn(`WoD | Trait description: could not load compendium pack "${pack.collection}":`, err);
				continue;
			}

			for (const [normalizedKey, key] of [...pending]) {
				const match = matchInPack(docs, spec, key, normalizedKey);
				if (!match) continue;
				uuids[key] = match.uuid;
				pending.delete(normalizedKey);
			}
		}
	} catch (err) {
		console.warn(`WoD | Trait description map failed to build for kind "${kind}"; those eyes are disabled for this render:`, err);
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
