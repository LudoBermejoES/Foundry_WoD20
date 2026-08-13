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

import AbilityHelper from "./ability-helpers.js";

const MODULE_ID = "wod20-compendium-es";

/**
 * IS THIS AN ABILITY, FOR ENRICHMENT PURPOSES? The ONE definition, applied to BOTH SIDES of the
 * match - the compendium document and the actor's own item - because they are the same question and
 * a second copy would be two predicates to keep in agreement forever.
 *
 * A secondary ability is a `Trait` whose `system.type` ends in `secondability`
 * (`AbilityHelper.IsSecondAbilityType`, the single definition of that, reused here rather than
 * re-spelled). It is an ability in every sense this module cares about: it has a rating, it lives in
 * the ability block of the sheet, and the compendium ships a ratings table for it - it simply is not
 * the `Ability` document type.
 *
 * WHY BOTH SIDES, AND WHY THIS WAS A BUG IN TWO DIRECTIONS.
 *
 *  - THE DOCUMENT SIDE was `d.type === "Ability"` in `abilityDocsOf` below. `wod20-compendium-es`
 *    ships its 25 secondary-ability documents in `shared-secondary-ability`, and
 *    `openspec/changes/make-secondary-abilities-secondary-everywhere` Decision B1 retypes them to
 *    `Trait` / `wod.types.*secondability`. `candidateAbilityPacks` selects that pack BY NAME, so the
 *    pack goes on being searched either way (verified: the literal `"shared-secondary-ability"` at
 *    :95 is untouched by this change) - it is the DOCUMENTS that would stop fitting the filter, and
 *    every caller would degrade to "no match": an empty description window plus a console warning.
 *  - THE ITEM SIDE was `type !== "Ability"` in `enrichAbilityItemData`, `maybeEnrichAbilityOnRename`
 *    and `migrations.js:enrichActorAbilities`. An actor's secondary ability has ALWAYS been a
 *    `Trait` (`AbilityHelper.CreateAbility` builds one for every `*secondability` type), so those
 *    three gates have never once let a secondary through. The compendium's 25 documents could only
 *    ever be reached by an item that was mis-shaped as a primary `Ability` - the population
 *    `make-secondary-abilities-secondary-everywhere` M2 measures at 17 items across 14 actors.
 *
 * So the same predicate on both sides is what makes this DEPLOY-ORDER INDEPENDENT, which is the
 * property that actually matters: this system fork and the content packs deploy separately and in
 * either order (see `trait-enrichment.js`'s header). All four combinations now resolve to the same
 * document - `Ability` item/`Ability` doc (today's working path, 183 primaries), `Ability`
 * item/`Trait` doc (post-B1, the regression this closes), `Trait` item/`Ability` doc (pre-B1, which
 * never worked and now does), `Trait` item/`Trait` doc (post-B1) - so neither repo can be deployed
 * "too early".
 *
 * NOT SIMPLY "DROP THE TYPE FILTER", and this is the part that has to stay narrow.
 * `candidateAbilityPacks` returns EVERY pack prefixed with the actor's line - armor, equipment,
 * instruments, derangements, resonance, the lot - because the pack holding a given ability is not
 * derivable from its name. The type filter is the only thing keeping that blast radius closed.
 * Measured over `wod20-compendium-es/src`: the packs hold 104 `Trait` documents, 87
 * `wod.types.maneuver` in `shared-maneuvers` and 17 `wod.types.resonance` in `mage-resonance` - and
 * `mage-resonance` IS searched for a mage. An unqualified `type === "Trait"` would put all 17
 * resonances ("Devoto", "Estatico", "Dinamico", ...) into name-matching against every mage's
 * abilities, which is the shape of the V2 cross-contamination disaster
 * `compendium-description.js` records. The `secondability` qualifier excludes all 104.
 *
 * @param {Item|object} doc - a document, an embedded item, or a plain creation payload
 * @returns {boolean}
 */
export function isEnrichableAbility(doc) {
	if (doc?.type === "Ability") return true;
	return doc?.type === "Trait" && AbilityHelper.IsSecondAbilityType(doc?.system?.type);
}

/**
 * The comparison spelling of a canonical ability key: trimmed, lowercased, and with `-`/`_` runs
 * collapsed to a single `_` so the two SEPARATOR CONVENTIONS for the same slug compare equal.
 *
 * This exists because the two sides really do disagree, and neither can be changed:
 *
 *  - the compendium's secondary ids are webgen entity ids, HYPHENATED (`tiro-con-arco`,
 *    `sueno-lucido`, `medios-de-comunicacion` - measured: 10 of the 25 contain a hyphen);
 *  - an actor's secondary id is `AbilityHelper.GetSecondAbilityId`, UNDERSCORED (`tiro_con_arco`),
 *    and that spelling is a hard cross-repo contract with `wod20-char`'s importer - its header says
 *    in as many words that a different spelling would be strictly worse than emitting nothing.
 *
 * Without this, those 10 fall off the `system.id` path entirely and survive only by the NAME
 * fallback - which this module's own header calls reliable only within one line's pack. Normalising
 * at the COMPARATOR is the fix; normalising at either GENERATOR would break a contract.
 *
 * PROVABLY INERT FOR THE 183 PRIMARIES: their ids are the concatenated English keys
 * (`animalken`, `melee`, `firearms`) and NOT ONE of the 183 contains a `-` or a `_`, so this
 * function returns them byte-identical. It equates two spellings of one slug; it does not strip
 * separators (`animalken` still does not equal `animal-ken`), so it widens nothing else.
 * @param {unknown} value
 * @returns {string}
 */
function abilityKey(value) {
	return (value ?? "").toString().trim().toLowerCase().replace(/[-_]+/g, "_");
}

/**
 * `pack.collection` -> that pack's ability documents, memoized for the session.
 *
 * This exists because the callers are LOOPS over an actor's abilities, and without it each one
 * re-ran `pack.getDocuments()` over every candidate pack. A mage has 25 line packs plus the shared
 * one, and `candidateAbilityPacks` returns every pack whose name starts with the line - armor,
 * equipment, instruments, derangements and the rest, not only the four ability packs - because the
 * pack that holds a given ability is not derivable from its name. Filtering to `type === "Ability"`
 * happens only AFTER the whole pack is loaded, so a 27-ability actor could fully construct several
 * hundred packs' worth of documents in one pass. That is the exact shape of the V1 failure
 * `compendium-description.js` documents in its header ("one `getIndex()` per pack, never a
 * `getDocument()` per actor item"), and this module is now on the interactive splat-install path
 * where it is felt directly.
 *
 * Session-scoped and never invalidated, the same lifetime and the same trade-off
 * `compendium-description.js` takes for `lineIndexes`: a compendium module updated mid-session is
 * not picked up until reload, which is acceptable for description text and is why the cache holds
 * the DOCUMENTS rather than any resolved per-actor result.
 * @type {Map<string, Item[]>}
 */
const abilityDocsByPack = new Map();

/**
 * @param {CompendiumCollection} pack
 * @returns {Promise<Item[]>} the pack's Ability documents, or [] if it could not be read
 */
async function abilityDocsOf(pack) {
	const cached = abilityDocsByPack.get(pack.collection);
	if (cached) return cached;

	let docs;
	try {
		docs = await pack.getDocuments();
	} catch (err) {
		console.warn(`WoD | Ability enrichment: could not load compendium pack "${pack.collection}":`, err);
		// Deliberately NOT cached: a pack that failed to load once (a mid-flight module update, say)
		// should be retried, unlike a pack that simply holds no abilities.
		return [];
	}

	// `isEnrichableAbility`, NOT `d.type === "Ability"` - see that function's header for why this
	// covers `Trait`/`*secondability` documents too, and why it must not be widened any further.
	const abilities = docs.filter(isEnrichableAbility);
	abilityDocsByPack.set(pack.collection, abilities);
	return abilities;
}

/**
 * All installed compendium packs relevant to one actor's line: every Item pack whose name is
 * prefixed with the line (e.g. "mage-talents", "mage-skills", "mage-knowledges" for line
 * "mage"), plus the line-agnostic "shared-secondary-ability" pack, checked last so a
 * line-specific match always wins over the shared fallback. Returns [] if the module is absent
 * (or has no packs registered at all) rather than throwing.
 *
 * `line` is NOT `getSplat(actor)` / `actor.system.settings.splat` — see
 * `stale-description-refresh.js`'s `buildCompendiumIndex` header comment (propagate-health-bonus-
 * traits) for the full reasoning: a wodchar `mage`-line character exported as its `mortal` variant
 * has `settings.splat: "mortal"`, which has no compendium packs at all, while
 * `settings.game: "mage"` is the book line that actually has its Abilities. Callers here resolve
 * `game` before `splat`, the opposite of `getSplat()`'s priority — that function answers a
 * different question (which sheet template to render) and is right to prefer `splat` for it.
 * @param {string} line - the compendium line prefix to search (e.g. "mage", "werewolf")
 * @returns {CompendiumCollection[]}
 */
function candidateAbilityPacks(line) {
	const linePacks = [];
	const sharedPacks = [];

	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;

		const packName = pack.collection.slice(MODULE_ID.length + 1);

		if (packName === "shared-secondary-ability") {
			sharedPacks.push(pack);
		} else if (line && packName.startsWith(`${line}-`)) {
			linePacks.push(pack);
		}
	}

	return [...linePacks, ...sharedPacks];
}

/**
 * Finds the compendium Ability document that matches `abilityItem`, scoped to `actor`'s line.
 * Never throws: any failure to reach/read a pack is caught, logged, and treated as "no match".
 * @param {Actor} actor - the PC actor the ability belongs to (`system.settings.game`, falling
 *        back to `system.settings.splat`, picks which line's packs are searched, unless
 *        `splatOverride` is given — see `candidateAbilityPacks`'s header comment for why `game`
 *        goes first)
 * @param {Item} abilityItem - the embedded `Ability` Item to enrich. Only `system.id` and `name`
 *        are read, so a plain creation payload works here as well as a real Document.
 * @param {string} [splatOverride] - the line to search INSTEAD of the actor's own. Required by any
 *        caller that runs BEFORE the actor's splat has been written: `DropHelper.DropSplatToActor`
 *        imports the abilities (drop-helpers.js:589) roughly 150 lines before it assigns
 *        `system.settings.splat` and calls `actor.update` (:740, :748), so during a splat install
 *        the actor still reports its PREVIOUS line. Reading it there would search a fresh PC's
 *        `mortal` (which has NO packs in wod20-compendium-es, so nothing would ever match) or, on a
 *        line change, the OLD line's packs - stamping another game line's provenance onto the
 *        abilities. That is precisely the cross-line failure `compendium-description.js` records as
 *        the V2 disaster ("overwrote 89 live actors with ANOTHER GAME LINE's rules"), so this
 *        parameter is a correctness requirement, not a convenience.
 * @returns {Promise<Item|null>} the matching compendium Item document, or null if none was found
 */
export async function findAbilityCompendiumMatch(actor, abilityItem, splatOverride) {
	try {
		const line = splatOverride || actor?.system?.settings?.game || actor?.system?.settings?.splat || "";
		const canonicalId = abilityKey(abilityItem?.system?.id);
		const abilityName = (abilityItem?.name ?? "").trim().toLowerCase();

		if (!canonicalId && !abilityName) return null;

		const packs = candidateAbilityPacks(line);
		if (!packs.length) return null;

		for (const pack of packs) {
			const abilities = await abilityDocsOf(pack);
			if (!abilities.length) continue;

			if (canonicalId) {
				const byId = abilities.find(d => abilityKey(d.system?.id) === canonicalId);
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
 * The matched document's OWN provenance flags (`flags['wod20-compendium-es']`), ready to spread
 * into an Item creation/update payload - or `{}` if the match carries none (an older compendium
 * build, say). Ability items otherwise carry no entity provenance at all (`entityFlags()` is
 * applied to entity-backed picks; a plain Ability is template-derived) - copying this flag is what
 * brings an enriched Ability into the read-descriptions-from-compendium model, per design.md
 * Decision 2, "#18, abilities": from this point on the ability resolves its description LIVE, with
 * the copied text below serving only as the offline fallback.
 * @param {Item|null} match
 * @returns {Record<string, unknown>}
 */
export function compendiumProvenanceOf(match) {
	const flags = match?.flags?.[MODULE_ID];
	return flags ? { [MODULE_ID]: flags } : {};
}

/**
 * Populates `itemData.system.description` in place from the compendium, if a match is found, and
 * copies the matched document's provenance flags alongside it. Safe to call with
 * `itemData.system.description` already set - it will not be overwritten unless explicitly empty,
 * so this never clobbers a player's own edits.
 * @param {Actor} actor
 * @param {object} itemData - an Item creation/update payload for an `Ability`, or for a `Trait`
 *        whose `system.type` makes it a secondary ability (see `isEnrichableAbility`)
 * @returns {Promise<boolean>} true if a description was applied
 */
export async function enrichAbilityItemData(actor, itemData) {
	if (!isEnrichableAbility(itemData)) return false;
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
	foundry.utils.mergeObject(itemData, { flags: compendiumProvenanceOf(match) });
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
	// Secondary-ability `Trait`s included (see `isEnrichableAbility`). This is the ONLY path by which
	// an ALREADY-LIVE secondary can acquire a description without a migration or a forced write: it
	// fires on an ordinary edit, and only ever fills an EMPTY description, so it cannot clobber a
	// player's own text. It stays a no-op whenever the compendium has nothing matching - the two live
	// "Arte" Traits, for one, whose key `arte` is not among the 25 shipped secondaries.
	if (!isEnrichableAbility(item)) return;
	if (!item.actor) return;
	if (item.system.description) return;

	const idChanged = foundry.utils.hasProperty(changes, "system.id");
	const nameChanged = foundry.utils.hasProperty(changes, "name") || foundry.utils.hasProperty(changes, "system.label");
	if (!idChanged && !nameChanged) return;

	const match = await findAbilityCompendiumMatch(item.actor, item);
	if (!match?.system?.description) return;

	await item.update({
		"system.description": match.system.description,
		flags: compendiumProvenanceOf(match)
	});
}
