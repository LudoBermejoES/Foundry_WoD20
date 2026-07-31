/**
 * Ability -> compendium description matching (add-ability-descriptions-from-compendium).
 *
 * Verified premise: Abilities are already embedded `Ability` Items (create-helpers.js:1671,
 * :1693, :1715), but those Items carry no description. The `wod20-compendium-es` module ships
 * per-dot ratings tables for abilities, split across per-line/per-category packs
 * ("mage-talents", "wraith-knowledges", ...) plus one line-agnostic "shared-secondary-ability"
 * pack - there is NO single "wod20-compendium-es.abilities" pack, and the same canonical ability
 * (e.g. "leadership") can be a Talent in one line's pack and a Knowledge in another's, so this
 * module does not guess a pack name from the Item's own `system.type` - it scans every pack that
 * belongs to the actor's line (by pack name prefix) plus the shared pack, and matches within
 * whichever of those actually exist.
 *
 * Matching key: primarily `system.id` (the canonical, language-independent ability key the
 * compendium exporter writes as `system.id: m.key` - see webgen/foundry_export.py
 * `project_abilities()`). `system.id` is a free-text field on the Ability sheet
 * (`wod.labels.ability.idhint`: "internal ID... used for internal hardcoded rules"), so older or
 * hand-typed Abilities may leave it empty; those fall back to a case-insensitive exact match on
 * the Item's `name`, which is reliable ONLY within the same line's pack (the same canonical
 * ability has a DIFFERENT localized name per line - "melee" prints as "Pelea con Armas" in V20 and
 * "Armas Cuerpo a Cuerpo" in Changeling), which is exactly why this module scopes the search to
 * the actor's own line before ever comparing names.
 *
 * Degrades completely if `wod20-compendium-es` is absent, older (missing a pack), or simply has
 * no entry for a given ability: every lookup returns null, callers log a warning and leave
 * `system.description` empty, and nothing here ever throws past its own boundary.
 */

const MODULE_ID = "wod20-compendium-es";

/**
 * All installed compendium packs relevant to one actor's line: every Item pack whose name is
 * prefixed with the line (e.g. "mage-talents", "mage-skills", "mage-knowledges" for splat
 * "mage"), plus the line-agnostic "shared-secondary-ability" pack, checked last so a
 * line-specific match always wins over the shared fallback. Returns [] if the module is absent
 * (or has no packs registered at all) rather than throwing.
 * @param {string} splat - actor.system.settings.splat value (e.g. "mage", "werewolf", "mortal")
 * @returns {CompendiumCollection[]}
 */
function candidateAbilityPacks(splat) {
	const linePacks = [];
	const sharedPacks = [];

	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;

		const packName = pack.collection.slice(MODULE_ID.length + 1);

		if (packName === "shared-secondary-ability") {
			sharedPacks.push(pack);
		} else if (splat && packName.startsWith(`${splat}-`)) {
			linePacks.push(pack);
		}
	}

	return [...linePacks, ...sharedPacks];
}

/**
 * Finds the compendium Ability document that matches `abilityItem`, scoped to `actor`'s line.
 * Never throws: any failure to reach/read a pack is caught, logged, and treated as "no match".
 * @param {Actor} actor - the PC actor the ability belongs to (its `system.settings.splat` picks
 *        which line's packs are searched)
 * @param {Item} abilityItem - the embedded `Ability` Item to enrich
 * @returns {Promise<Item|null>} the matching compendium Item document, or null if none was found
 */
export async function findAbilityCompendiumMatch(actor, abilityItem) {
	try {
		const splat = actor?.system?.settings?.splat ?? "";
		const canonicalId = (abilityItem?.system?.id ?? "").trim().toLowerCase();
		const abilityName = (abilityItem?.name ?? "").trim().toLowerCase();

		if (!canonicalId && !abilityName) return null;

		const packs = candidateAbilityPacks(splat);
		if (!packs.length) return null;

		for (const pack of packs) {
			let docs;
			try {
				docs = await pack.getDocuments();
			} catch (err) {
				console.warn(`WoD | Ability enrichment: could not load compendium pack "${pack.collection}":`, err);
				continue;
			}

			const abilities = docs.filter(d => d.type === "Ability");

			if (canonicalId) {
				const byId = abilities.find(d => (d.system?.id ?? "").trim().toLowerCase() === canonicalId);
				if (byId) return byId;
			}

			if (abilityName) {
				const byName = abilities.find(d => (d.name ?? "").trim().toLowerCase() === abilityName);
				if (byName) return byName;
			}
		}

		return null;
	} catch (err) {
		// The compendium module being absent, disabled, or mid-update should never surface here as
		// a thrown error - enrichment is a quality-of-life feature, not a load-bearing one.
		console.warn("WoD | Ability enrichment: compendium lookup failed:", err);
		return null;
	}
}

/**
 * Populates `itemData.system.description` in place from the compendium, if a match is found.
 * Safe to call with `itemData.system.description` already set - it will not be overwritten unless
 * explicitly empty, so this never clobbers a player's own edits.
 * @param {Actor} actor
 * @param {object} itemData - an Item creation/update payload with `type: "Ability"`
 * @returns {Promise<boolean>} true if a description was applied
 */
export async function enrichAbilityItemData(actor, itemData) {
	if (itemData?.type !== "Ability") return false;
	if (itemData.system?.description) return false;

	const match = await findAbilityCompendiumMatch(actor, {
		system: { id: itemData.system?.id ?? "" },
		name: itemData.name ?? ""
	});

	if (!match) {
		console.warn(`WoD | Ability "${itemData.name}" not found in the ${MODULE_ID} compendium; created with no description.`);
		return false;
	}

	foundry.utils.setProperty(itemData, "system.description", match.system.description ?? "");
	return true;
}

/**
 * Called from an `updateItem` hook: the "+ New Talent/Skill/Knowledge" buttons (create-helpers.js)
 * create a blank, generically-named Ability, so seed-time enrichment above is necessarily a no-op
 * for that path - there is nothing to match yet. The Ability's own sheet auto-submits on every
 * field change (`WoDItemSheetV2.onSubmitItemForm`, `submitOnChange: true`), so the moment a player
 * types the ability's canonical `system.id` or its `name`/`system.label`, this is the first point
 * a compendium match becomes possible. Only acts when `system.description` is still empty, so it
 * can never overwrite a player's own edit, and only on embedded (actor-owned) Ability Items -
 * world/compendium Ability Items are left alone.
 * @param {Item} item - the Ability Item AFTER the update has been applied
 * @param {object} changes - the diff object Foundry passed to the `updateItem` hook
 * @returns {Promise<void>}
 */
export async function maybeEnrichAbilityOnRename(item, changes) {
	if (item.type !== "Ability") return;
	if (!item.actor) return;
	if (item.system.description) return;

	const idChanged = foundry.utils.hasProperty(changes, "system.id");
	const nameChanged = foundry.utils.hasProperty(changes, "name") || foundry.utils.hasProperty(changes, "system.label");
	if (!idChanged && !nameChanged) return;

	const match = await findAbilityCompendiumMatch(item.actor, item);
	if (!match?.system?.description) return;

	await item.update({ "system.description": match.system.description });
}
