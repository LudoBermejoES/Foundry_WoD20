/**
 * Re-sync an actor's embedded trait Items (Backgrounds, Merits, Flaws, ...) `bonuslist` from the
 * `wod20-compendium-es` compendium, keeping each trait's RATING and every other per-character field.
 *
 * DESCRIPTION IS NO LONGER PART OF THIS MODULE. read-descriptions-from-compendium retired that half:
 * an item's description now RESOLVES LIVE from the compendium at read time
 * (module/scripts/compendium-description.js) instead of being copied here, so a compendium content
 * fix reaches every actor with no migration, no version-flag bump, and no walk over the world's
 * actors. What follows is the history of WHY this file still exists at all, for the half that could
 * not move: `bonuslist`.
 *
 * THE MECHANICS ARE MISSING, which is worse than stale text because it is invisible. The exporter
 * hardcodes `bonuslist: []` in ten places and the catalog carries no `bonuslist` field at all, so the
 * compendium's `{settingtype: "stealth", type: "ability_buff", value: 1, scale_with_rating: true}`
 * never reaches the actor: Otto Von Grugger's "Arcano / Encubrimiento" was adding NO dice to Sigilo.
 * Re-exporting from wodchar cannot fix this - the data is not there to export. The compendium is the
 * only source that has it, so - unlike description - it must still be COPIED onto the actor.
 *
 * MATCHING IS BY NAME + TYPE, not by `_id`. An earlier version matched on `_id`, on the evidence that
 * `webgen`'s `_fid()` is deterministic and the import preserves it — true for Otto's Arcano
 * (`wlivFqtbu8v2S5we` on both sides) and FALSE for Anne Sonnenfeld's, which is `ebk1l9bKBlK7OYlR`
 * against the same compendium document. Some imports minted fresh ids. Name + type is what actually
 * holds across the world. (Note: this is DELIBERATELY different from the id-based `(entity id, line,
 * type)` triple `compendium-description.js` resolves descriptions on - that triple comes from
 * provenance flags most existing actors' items do not carry, which is exactly why this migration,
 * matching on name + type against a line-scoped index, still exists for `bonuslist`.)
 *
 * THE PACK INDEX IS BUILT ONCE PER RUN. The first version called `pack.getDocument(id)` across ~107
 * packs for every item of every actor, which loads each pack in full: it processed 22 of 84 actors
 * before the page moved on, flagging them as done, so the world ended up half-migrated with no error
 * anywhere. One `getIndex()` per pack up front, then one `getDocument` per matched item.
 *
 * UPDATE IN PLACE, rather than delete-and-re-add. The owner asked for the old items to be removed and
 * replaced; this achieves the same result for every field that was wrong while keeping three things a
 * delete would destroy: the trait's RATING (`system.value`, which the owner asked to preserve), the
 * item's id (anything referencing it keeps working), and per-character text such as a Mentor's
 * `relation`. Only `bonuslist`, the one field this module still owns, is ever copied.
 */

const MODULE_ID = "wod20-compendium-es";

/** Item types this touches: the trait Items wodchar exports whose `bonuslist` may be missing. */
const REFRESHABLE_TYPES = new Set(["Feature", "Power", "Ability", "Item", "Fetish", "Rote"]);

/**
 * `system` fields copied FROM the compendium. Everything else on the item is left alone — most
 * importantly `value` (the rating), `relation`, `details`, `speciality` and (since read-descriptions
 * -from-compendium) `description` itself, which now resolves live and is never copied by this or any
 * other migration. `bonuslist` is the one field left here, because its absence is the invisible half
 * of the original defect and the compendium is the only source that has it.
 */
const COMPENDIUM_OWNED_FIELDS = ["bonuslist"];

function normalizeName(name) {
	// The books print "Arcano / Encubrimiento" and an import may carry "Arcano/Encubrimiento":
	// collapse whitespace (including around a slash) so spacing alone never breaks a match.
	return String(name ?? "").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim().toLowerCase();
}

/**
 * Index the packs that belong to ONE game line: `"name|type"` -> {pack, id}.
 *
 * SCOPED BY LINE, and that scoping is the whole point. A first version built ONE global index across
 * all ~107 packs with "first pack wins", which meant `changeling-*` and `hunter-*` beat `mage-*` on
 * every shared trait name — so a mage's Mentor was overwritten with Changeling's ("otras hadas se
 * aprestan a proteger... al nuevo changeling"), his Estatus with Hunter's Society of Leopold text, and
 * his Adicción with one that triggers Banality. It ran against 89 live actors before it was caught.
 * The precedent for doing it right was already in this codebase: `ability-enrichment.js`'s
 * `candidateAbilityPacks(line)`.
 *
 * `shared-` packs are indexed LAST and never overwrite an existing key, so a line's own document
 * always beats the cross-line fallback.
 *
 * `line` is NOT `getSplat(actor)` / `actor.system.settings.splat` — this was the bug
 * (propagate-health-bonus-traits, found by verifying Raffela Diemer's `Corpulento` failed to
 * resync). `getSplat()`'s priority (`variantsheet` > `splat` > `game` > `actor.type`) is correct
 * for its own job, choosing which SHEET/RULES-VARIANT template an actor uses, and a wodchar
 * `mage`-line character exported as its `mortal` variant (a Sleeper) legitimately has
 * `settings.splat: "mortal"` for that purpose — there is no `mortal-merits` pack, so indexing by
 * `splat` finds nothing and every mage-line trait on that actor is silently skipped (not even
 * logged: the caller's loop counts an unindexed item as `skipped`, not `notFound`). The compendium
 * packs are organised by BOOK LINE, and `settings.game` ("the parent game line" per
 * `splat-helpers.js`) is that line whether or not the actor is playing a mortal/variant sheet of
 * it, so callers here resolve `game` first and fall back to `splat` only when `game` is genuinely
 * absent (a legacy or hand-created actor with no wodchar `game` field at all).
 * @param {string} line - the compendium line prefix to search (e.g. "mage", "werewolf") — see above
 * @returns {Promise<Map<string, {pack: CompendiumCollection, id: string}>>}
 */
async function buildCompendiumIndex(line) {
	const linePacks = [];
	const sharedPacks = [];
	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;
		const packName = pack.collection.slice(MODULE_ID.length + 1);
		if (packName.startsWith("shared-")) sharedPacks.push(pack);
		else if (line && packName.startsWith(`${line}-`)) linePacks.push(pack);
		// A pack belonging to ANOTHER line is skipped outright, not merely ranked lower.
	}

	const index = new Map();
	for (const pack of [...linePacks, ...sharedPacks]) {
		try {
			for (const entry of await pack.getIndex()) {
				const key = `${normalizeName(entry.name)}|${entry.type}`;
				if (!index.has(key)) index.set(key, { pack, id: entry._id });
			}
		} catch (err) {
			console.warn(`WoD | Trait re-sync: could not index pack "${pack.collection}":`, err);
		}
	}
	return index;
}

/**
 * Re-syncs one actor's trait Items' `bonuslist` from the compendium index. `looksLikeUnrenderedMarkdown`
 * and the `force` option that used to live here are GONE with the description half they existed
 * solely to repair (read-descriptions-from-compendium) - there is no longer any copied text on the
 * actor for either of them to find stale or force-overwrite.
 *
 * An item is re-synced when its `bonuslist` is empty while the compendium document has one - this is
 * the ONLY condition left, and it repairs traits that add no dice because the exporter never had
 * `bonuslist` to write.
 * @param {Actor} actor
 * @returns {Promise<{bonusFixed: number, skipped: number, notFound: number}>}
 */
export async function resyncActorTraits(actor) {
	// `game` first, `splat` as fallback — see buildCompendiumIndex's header comment for why this
	// deliberately does NOT match getSplat()'s priority order.
	const line = actor?.system?.settings?.game || actor?.system?.settings?.splat || "";
	const index = await buildCompendiumIndex(line);
	if (!index.size) return { bonusFixed: 0, skipped: 0, notFound: 0 };
	const stats = { bonusFixed: 0, skipped: 0, notFound: 0 };

	for (const item of actor.items) {
		if (!REFRESHABLE_TYPES.has(item.type)) { stats.skipped++; continue; }

		const emptyBonus = !(item.system?.bonuslist?.length);
		if (!emptyBonus) { stats.skipped++; continue; }

		const hit = index.get(`${normalizeName(item.name)}|${item.type}`);
		if (!hit) { stats.skipped++; continue; }

		try {
			const doc = await hit.pack.getDocument(hit.id);
			if (!doc) { stats.notFound++; continue; }

			// Only ever ADDS a bonuslist the actor is missing. Never replaces a non-empty one, so a
			// hand-tuned buff on a character survives.
			if (!doc.system?.bonuslist?.length) { stats.skipped++; continue; }

			await item.update({ "system.bonuslist": foundry.utils.deepClone(doc.system.bonuslist) });
			stats.bonusFixed++;
		} catch (err) {
			// One item failing (permission, a mid-flight pack reload) must not stop the rest.
			console.error(`WoD | Trait re-sync failed for "${item.name}" on "${actor.name}":`, err);
		}
	}

	return stats;
}

export { COMPENDIUM_OWNED_FIELDS };
