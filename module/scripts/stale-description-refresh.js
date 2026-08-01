/**
 * Re-sync an actor's embedded trait Items (Backgrounds, Merits, Flaws, ...) from the
 * `wod20-compendium-es` compendium, keeping each trait's RATING.
 *
 * THE DEFECT, diagnosed against the live world rather than inferred. `wod20-char`'s Foundry exporter
 * picks `entity.description_html || entity.body_es`, and its catalog ships `description_html` for
 * only 236 of 5,453 entities (weapons, armour, manoeuvres). Every Background, Merit, Flaw, Gift and
 * Discipline power therefore falls back to `body_es`, which is **Markdown** — and it lands in
 * `system.description`, which this system renders as **HTML**. So `\n\n` paragraph breaks vanish into
 * one wall of text and the dot ladder, a Markdown pipe table, prints literally as
 * `| X | ... | |-------|------`. Otto Von Grugger's "Arcano / Encubrimiento" is the case this was
 * built on.
 *
 * AND THE MECHANICS ARE MISSING TOO, which is worse because it is invisible. The exporter hardcodes
 * `bonuslist: []` in ten places and the catalog carries no `bonuslist` at all, so the compendium's
 * `{settingtype: "stealth", type: "ability_buff", value: 1, scale_with_rating: true}` never reaches
 * the actor: Otto's Arcano was adding NO dice to Sigilo. Re-exporting from wodchar cannot fix this —
 * the data is not there to export. The compendium is the only source that has both.
 *
 * MATCHING IS BY NAME + TYPE, not by `_id`. An earlier version matched on `_id`, on the evidence that
 * `webgen`'s `_fid()` is deterministic and the import preserves it — true for Otto's Arcano
 * (`wlivFqtbu8v2S5we` on both sides) and FALSE for Anne Sonnenfeld's, which is `ebk1l9bKBlK7OYlR`
 * against the same compendium document. Some imports minted fresh ids. Name + type is what actually
 * holds across the world.
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
 * `relation`. Only fields owned by the compendium are copied.
 */

const MODULE_ID = "wod20-compendium-es";

/** Item types this touches: the trait Items wodchar exports with Markdown descriptions. */
const REFRESHABLE_TYPES = new Set(["Feature", "Power", "Ability", "Item", "Fetish", "Rote"]);

/**
 * `system` fields copied FROM the compendium. Everything else on the item is left alone — most
 * importantly `value` (the rating), `relation`, `details` and `speciality`, which are per-character.
 * `bonuslist` is here because its absence is the invisible half of the defect.
 */
const COMPENDIUM_OWNED_FIELDS = ["description", "bonuslist"];

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
 * `candidateAbilityPacks(splat)`.
 *
 * `shared-` packs are indexed LAST and never overwrite an existing key, so a line's own document
 * always beats the cross-line fallback.
 * @param {string} splat - `actor.system.settings.splat` (e.g. "mage", "werewolf", "mortal")
 * @returns {Promise<Map<string, {pack: CompendiumCollection, id: string}>>}
 */
async function buildCompendiumIndex(splat) {
	const linePacks = [];
	const sharedPacks = [];
	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;
		const packName = pack.collection.slice(MODULE_ID.length + 1);
		if (packName.startsWith("shared-")) sharedPacks.push(pack);
		else if (splat && packName.startsWith(`${splat}-`)) linePacks.push(pack);
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
 * Does this description look like Markdown that was never rendered?
 *
 * Requires BOTH no HTML element at all and a Markdown marker (a pipe-table row, or a blank-line
 * paragraph break). Foundry's own editors emit HTML, so a description with no tag at all cannot be a
 * player's edit — which is what makes it safe to replace. Anything containing a tag is left alone.
 * @param {string} description
 * @returns {boolean}
 */
export function looksLikeUnrenderedMarkdown(description) {
	const text = String(description ?? "");
	if (!text.trim()) return false;                 // empty is the ability migration's business
	if (/<[a-z][^>]*>/i.test(text)) return false;   // any HTML element: not ours to touch
	return /^\s*\|.*\|\s*$/m.test(text) || /\n\s*\n/.test(text);
}

/**
 * Re-syncs one actor's trait Items from the compendium index.
 *
 * An item is re-synced when its description is un-rendered Markdown, OR when its `bonuslist` is empty
 * while the compendium document has one — the second condition is what repairs traits whose text
 * happens to be fine but which add no dice.
 * `force` re-syncs a matching item even when its description is already HTML. It exists to REPAIR the
 * wrong-line text a previous version wrote: that damage is valid HTML, so the Markdown test below
 * would skip it forever and leave 89 actors reading another game line's rules.
 * @param {Actor} actor
 * @param {object} [opts]
 * @param {boolean} [opts.force=false]
 * @returns {Promise<{resynced: number, bonusFixed: number, skipped: number, notFound: number}>}
 */
export async function resyncActorTraits(actor, { force = false } = {}) {
	const splat = actor?.system?.settings?.splat ?? "";
	const index = await buildCompendiumIndex(splat);
	if (!index.size) return { resynced: 0, bonusFixed: 0, skipped: 0, notFound: 0 };
	const stats = { resynced: 0, bonusFixed: 0, skipped: 0, notFound: 0 };

	for (const item of actor.items) {
		if (!REFRESHABLE_TYPES.has(item.type)) { stats.skipped++; continue; }

		const staleText = force || looksLikeUnrenderedMarkdown(item.system?.description);
		const emptyBonus = !(item.system?.bonuslist?.length);
		if (!staleText && !emptyBonus) { stats.skipped++; continue; }

		const hit = index.get(`${normalizeName(item.name)}|${item.type}`);
		if (!hit) {
			if (staleText) {
				console.warn(`WoD | "${item.name}" (${item.type}) on "${actor.name}" holds un-rendered Markdown but no compendium document matches its name; left as-is.`);
				stats.notFound++;
			} else {
				stats.skipped++;
			}
			continue;
		}

		try {
			const doc = await hit.pack.getDocument(hit.id);
			if (!doc) { stats.notFound++; continue; }

			const patch = {};
			if (staleText && typeof doc.system?.description === "string" && doc.system.description.trim()) {
				patch["system.description"] = doc.system.description;
			}
			// Only ever ADDS a bonuslist the actor is missing. Never replaces a non-empty one, so a
			// hand-tuned buff on a character survives.
			if (emptyBonus && doc.system?.bonuslist?.length) {
				patch["system.bonuslist"] = foundry.utils.deepClone(doc.system.bonuslist);
			}
			if (!Object.keys(patch).length) { stats.skipped++; continue; }

			await item.update(patch);
			if (patch["system.description"]) stats.resynced++;
			if (patch["system.bonuslist"]) stats.bonusFixed++;
		} catch (err) {
			// One item failing (permission, a mid-flight pack reload) must not stop the rest.
			console.error(`WoD | Trait re-sync failed for "${item.name}" on "${actor.name}":`, err);
		}
	}

	return stats;
}

export { COMPENDIUM_OWNED_FIELDS };
