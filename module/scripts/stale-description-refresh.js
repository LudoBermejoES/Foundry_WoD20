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
 * Index every installed `wod20-compendium-es` Item pack ONCE: `"name|type"` -> {pack, id}.
 *
 * Line-specific packs are indexed BEFORE `shared-` ones and an existing key is never overwritten, so
 * a line's own document always wins over the cross-line fallback for the same name.
 * @returns {Promise<Map<string, {pack: CompendiumCollection, id: string}>>}
 */
async function buildCompendiumIndex() {
	const index = new Map();
	const packs = [];
	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;
		packs.push(pack);
	}
	// line packs first, shared last
	packs.sort((a, b) => {
		const aShared = a.collection.includes(".shared-") ? 1 : 0;
		const bShared = b.collection.includes(".shared-") ? 1 : 0;
		return aShared - bShared;
	});

	for (const pack of packs) {
		try {
			const entries = await pack.getIndex();
			for (const entry of entries) {
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
 * @param {Actor} actor
 * @param {Map<string, {pack: CompendiumCollection, id: string}>} index
 * @returns {Promise<{resynced: number, bonusFixed: number, skipped: number, notFound: number}>}
 */
export async function resyncActorTraits(actor, index) {
	const stats = { resynced: 0, bonusFixed: 0, skipped: 0, notFound: 0 };

	for (const item of actor.items) {
		if (!REFRESHABLE_TYPES.has(item.type)) { stats.skipped++; continue; }

		const staleText = looksLikeUnrenderedMarkdown(item.system?.description);
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

export { buildCompendiumIndex, COMPENDIUM_OWNED_FIELDS };
