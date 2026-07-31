/**
 * Refresh an embedded Item's description from the compendium when the stored one is UN-RENDERED
 * MARKDOWN.
 *
 * The defect this fixes, measured against the live world rather than inferred. `wod20-char`'s
 * Foundry exporter picks `entity.description_html || entity.body_es` for an item's description, and
 * `description_html` is only shipped in its catalog for entities with NO prose of their own (172
 * weapons, 39 armour, ...) — 236 of 5,453 entries. For everything else, and that includes every
 * Background, Merit, Flaw, Gift and Discipline power, it falls back to `body_es`, which is
 * **Markdown**. It then lands in `system.description`, which this system renders as **HTML**. So:
 *
 *   * `\n\n` paragraph breaks mean nothing in HTML -> one run-on wall of text
 *   * a Markdown pipe table renders literally -> `| X | ... | |-------|--------` on screen
 *
 * Otto Von Grugger's "Arcano / Encubrimiento" is the case this was diagnosed on: stored
 * `system.version` "7.3.2", raw Markdown body, and the ladder as pipe rows. The compendium document
 * for the very same trait carries `<p>` paragraphs and a real `<table class='wod-kb-ratings'>`.
 *
 * MATCHING IS EXACT, not heuristic. `webgen`'s `_fid()` derives a document's `_id` from
 * sha256("<line>/<type>/<id>"), and the wodchar import preserves it, so an imported item and its
 * compendium document share the SAME `_id` — verified on Otto's item and
 * `wod20-compendium-es.mage-backgrounds`, both `wlivFqtbu8v2S5we`. No name comparison, no key
 * table, no per-line guessing.
 *
 * THE SAFETY RULE, and why it is not the same as ability enrichment's. That migration only fills an
 * EMPTY description, so it can never destroy anything. This one must REPLACE a non-empty one, so it
 * needs to tell machine-written staleness from a human edit. The discriminator is that Foundry's own
 * editors (ProseMirror/TinyMCE) emit HTML: a description with no HTML tags at all, that carries
 * Markdown markers, cannot have come from a player editing it in Foundry. Anything containing a tag
 * is left strictly alone.
 */

const MODULE_ID = "wod20-compendium-es";

/**
 * Does this description look like Markdown that was never rendered?
 *
 * Requires BOTH: no HTML element at all, and at least one Markdown marker (a pipe-table row, or a
 * blank-line paragraph break). Deliberately conservative in both directions — a single `<p>` is
 * enough to disqualify it, and prose with neither marker is left alone rather than guessed at,
 * because a one-paragraph description is indistinguishable from correctly-rendered plain text.
 * @param {string} description
 * @returns {boolean}
 */
export function looksLikeUnrenderedMarkdown(description) {
	const text = String(description ?? "");
	if (!text.trim()) return false;                 // empty is the other migration's business
	if (/<[a-z][^>]*>/i.test(text)) return false;   // any HTML element: not ours to touch
	const hasPipeTableRow = /^\s*\|.*\|\s*$/m.test(text);
	const hasBlankLineBreak = /\n\s*\n/.test(text);
	return hasPipeTableRow || hasBlankLineBreak;
}

/**
 * Every installed `wod20-compendium-es` Item pack. Unlike `candidateAbilityPacks`, this is NOT
 * scoped by line: the match is on `_id`, which is globally unique across the module, so scoping
 * would only risk missing a pack (a mortal actor can legitimately hold a `shared-` item, and a
 * Technocratic mage's items live under `mage-`). Returns [] when the module is absent.
 * @returns {CompendiumCollection[]}
 */
function modulePacks() {
	const packs = [];
	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${MODULE_ID}.`)) continue;
		packs.push(pack);
	}
	return packs;
}

/**
 * The compendium description for `item`, found by exact `_id`, or null.
 *
 * Never throws: an unreachable pack is logged and treated as "no match", so an absent or partial
 * module means nothing is refreshed rather than a broken world.
 * @param {Item} item - an embedded Item on an actor
 * @returns {Promise<string|null>}
 */
export async function findCompendiumDescription(item) {
	const id = item?.id;
	if (!id) return null;

	for (const pack of modulePacks()) {
		try {
			// `getDocument(id)` rather than loading the whole pack: this runs per item, over ~105
			// packs, for every actor in the world.
			const doc = await pack.getDocument(id);
			const description = doc?.system?.description;
			if (typeof description === "string" && description.trim()) return description;
		} catch (err) {
			console.warn(`WoD | Stale-description refresh: could not read pack "${pack.collection}":`, err);
		}
	}
	return null;
}

/**
 * Refreshes every embedded Item on `actor` whose description is un-rendered Markdown.
 *
 * Touches `system.description` and NOTHING else — not `value`, not `max`, not `bonuslist`. The
 * `bonuslist` on these stale items is separately and often EMPTY where the compendium has one
 * (Otto's Arcano ships `stealth +1, scale_with_rating` in the compendium and `[]` on the actor,
 * so the trait adds no dice), but restoring that CHANGES DICE POOLS on live characters and is a
 * decision for the owner, not a side effect of a text fix.
 * @param {Actor} actor
 * @returns {Promise<{refreshed: number, skipped: number, notFound: number}>}
 */
export async function refreshActorStaleDescriptions(actor) {
	const stats = { refreshed: 0, skipped: 0, notFound: 0 };

	for (const item of actor.items) {
		if (!looksLikeUnrenderedMarkdown(item.system?.description)) {
			stats.skipped++;
			continue;
		}
		try {
			const description = await findCompendiumDescription(item);
			if (description) {
				await item.update({ "system.description": description });
				stats.refreshed++;
			} else {
				console.warn(`WoD | "${item.name}" on "${actor.name}" holds un-rendered Markdown but has no compendium document with id ${item.id}; left as-is.`);
				stats.notFound++;
			}
		} catch (err) {
			// One item failing (permission, a mid-flight pack reload) must not stop the rest.
			console.error(`WoD | Stale-description refresh failed for "${item.name}" on "${actor.name}":`, err);
		}
	}

	return stats;
}
