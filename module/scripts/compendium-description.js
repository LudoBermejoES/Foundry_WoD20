/**
 * Resolves an Item's DESCRIPTION from the `wod20-compendium-es` compendium at read time, instead of
 * reading the copy the exporter used to embed on the actor (openspec/changes/
 * read-descriptions-from-compendium). This is the ONE thing that changes: every other field an item
 * displays - `name`, its rating, `speciality`, `relation`, `details`, `bonuslist` - stays the
 * actor's, because those are per-character state the compendium does not carry (see design.md
 * Decision 4; the compendium's own Background documents carry `system.value: 0`).
 *
 * WHY NOT JUST COPY THE FIX FORWARD AGAIN. Four earlier migrations already tried "copy the
 * compendium's text onto the actor" (see stale-description-refresh.js's header and migrations.js
 * lines 95-119): V1 matched by `_id` and never finished (22 of 84 actors flagged done, having fixed
 * almost nothing); V2 matched by name against one global pack index and overwrote 89 live actors
 * with ANOTHER GAME LINE's rules (a mage's Mentor became Changeling's); V3 and V4 existed only to
 * repair V1/V2's damage. Every failure was a failure of COPYING. Resolving live has nothing to copy,
 * so nothing goes stale and nothing needs a version-bumped flag ever again for content fixes.
 *
 * RESOLUTION IS BY (entity id, game line, entity type) - NEVER BY NAME. Both sides already stamp
 * this triple: `wod20-char`'s exporter writes `flags['wod20-char'] = {id, line, sourceType, ...}`
 * on entity-backed Items; `webgen`'s compendium exporter writes
 * `flags['wod20-compendium-es'] = {id, line, source_type, ...}` on every compendium document. Name
 * matching is exactly what caused the V2 disaster above and is forbidden by design.md Decision 1.
 *
 * A NAMESPACE WITHOUT AN `id` IS NOT PROVENANCE. Virtue items (`export.ts:904`), pool/Advantage
 * items (`:951`), synthesized containers (`:1056`) and secondary abilities (`:674`) all carry
 * `flags['wod20-char']` with no `id` - they are per-character constructs the compendium cannot
 * resolve, and `provenanceOf` below returns `null` for them by construction (keyed on the id, not
 * the namespace), so they always keep showing their own text.
 *
 * DEGRADE, NEVER BLANK. Every failure mode - the module absent, a pack unreadable, no document
 * matching the triple, the matched document's description itself empty - makes the resolver return
 * no result; every caller then falls back to the item's own stored `system.description`, and nothing
 * here ever throws past this file's own boundary.
 */

const CHAR_MODULE = "wod20-char";
const COMPENDIUM_MODULE = "wod20-compendium-es";
const OVERRIDE_SCOPE = "worldofdarkness";
const OVERRIDE_KEY = "descriptionOverride";

/**
 * Per-line index: `line` -> `Map<"type|id", {pack, id, description}>`, built ONCE per line per
 * session and never rebuilt. This is the guard against the V1 failure (`stale-description-
 * refresh.js:26-29`): one `getIndex()` per pack, never a `getDocument()` per actor item.
 * @type {Map<string, Map<string, {pack: CompendiumCollection, id: string, description: string}>>}
 */
const lineIndexes = new Map();

/** `line` -> in-flight `Promise` for the index build above, so concurrent callers share one build. */
const lineIndexBuilds = new Map();

/**
 * The SYNCHRONOUS cache `getCachedDescription` reads: `"line|type|id"` -> resolved description
 * string. Populated as a side effect of `resolveDescription` and eagerly by `warmDescriptionCache`.
 * Session-only, exactly like `lineIndexes` - see design.md Decision 1: "A resolved compendium uuid
 * MAY be cached in memory for the session; it MUST NOT be persisted onto the document."
 * @type {Map<string, string>}
 */
const descriptionCache = new Map();

/**
 * Reads a document's entity provenance, keyed on the presence of an `id` - NOT on which namespace
 * is present, because several non-entity item kinds carry `flags['wod20-char']` with no `id` at all
 * (see this file's header). Checks `wod20-char` first (an exported character Item), then
 * `wod20-compendium-es` (an Item dragged straight from the compendium onto an actor).
 * @param {foundry.abstract.Document|object} doc - any object exposing a `flags` property
 * @returns {{id: string, line: string, type: string}|null}
 */
export function provenanceOf(doc) {
	const charFlags = doc?.flags?.[CHAR_MODULE];
	if (charFlags?.id) {
		return { id: String(charFlags.id), line: String(charFlags.line ?? ""), type: String(charFlags.sourceType ?? "") };
	}

	const compendiumFlags = doc?.flags?.[COMPENDIUM_MODULE];
	if (compendiumFlags?.id) {
		return { id: String(compendiumFlags.id), line: String(compendiumFlags.line ?? ""), type: String(compendiumFlags.source_type ?? "") };
	}

	return null;
}

/**
 * Decision 3's state 1: a hand edit on a provenance-carrying item always wins, unconditionally,
 * before any lookup is attempted.
 * @param {foundry.abstract.Document|object} doc
 * @returns {boolean}
 */
function isOverridden(doc) {
	return foundry.utils.getProperty(doc, `flags.${OVERRIDE_SCOPE}.${OVERRIDE_KEY}`) === true;
}

/** Builds the one cache/index key both `lineIndexes`' per-line maps and `descriptionCache` share. */
function tripleKey({ line, type, id }) {
	return `${line}|${type}|${id}`;
}

/**
 * A pack's OWN declared game line, per design.md Decision 1: "Each pack in
 * `wod20-compendium-es/module.json` declares `flags['wod20-compendium-es'].line`... The resolver
 * SHALL prefer that declared flag over parsing the pack name." Falls back to the `<line>-`/`shared-`
 * name-prefix convention `ability-enrichment.js`'s `candidateAbilityPacks` and `stale-description-
 * refresh.js`'s `buildCompendiumIndex` already use, for a pack whose manifest entry predates the
 * flag.
 * @param {CompendiumCollection} pack
 * @returns {string}
 */
function packDeclaredLine(pack) {
	const flagged = pack?.metadata?.flags?.[COMPENDIUM_MODULE]?.line;
	if (flagged) return String(flagged);

	const packName = pack?.collection?.startsWith(`${COMPENDIUM_MODULE}.`)
		? pack.collection.slice(COMPENDIUM_MODULE.length + 1)
		: (pack?.metadata?.name ?? "");
	return packName.split("-")[0] ?? "";
}

/**
 * Every `wod20-compendium-es` Item pack worth searching for `line`: that line's own packs first,
 * then `shared` packs, in that order so a line's own document always wins a shared fallback (the
 * same "line-scoped, shared last" rule `buildCompendiumIndex` already applies). A pack declaring any
 * OTHER line is never returned - not ranked lower, not searched at all - which is the whole point of
 * Decision 1: this is what makes the V2 cross-line disaster structurally impossible here.
 * @param {string} line
 * @returns {CompendiumCollection[]}
 */
function candidateDescriptionPacks(line) {
	const ownPacks = [];
	const sharedPacks = [];

	for (const pack of game.packs) {
		if (pack.documentName !== "Item") continue;
		if (!pack.collection?.startsWith(`${COMPENDIUM_MODULE}.`)) continue;

		const declaredLine = packDeclaredLine(pack);
		if (line && declaredLine === line) ownPacks.push(pack);
		else if (declaredLine === "shared") sharedPacks.push(pack);
		// Any other line is skipped outright.
	}

	return [...ownPacks, ...sharedPacks];
}

/**
 * Builds (or returns the in-flight build of) the index for one game line: every document across
 * that line's own packs plus `shared` packs, keyed by its OWN provenance triple - so the match below
 * is still the full `(id, line, type)` triple against the compendium document's own flags, exactly
 * as design.md Decision 1 specifies, even though the packs searched are already line-scoped.
 *
 * ONE `getIndex()` per pack, requesting the flag fields explicitly (Foundry's default compendium
 * index carries only `_id`/`name`/`img`/`type`/`sort` - flags are never in it) plus
 * `system.description` in the SAME call, so the full text is captured during the one-index-build-
 * per-line-per-session this function performs and no per-item `getDocument()` round trip is needed
 * on the common path at all.
 * @param {string} line
 * @returns {Promise<Map<string, {pack: CompendiumCollection, id: string, description: string}>>}
 */
function buildLineIndex(line) {
	if (!line) return Promise.resolve(new Map());
	if (lineIndexes.has(line)) return Promise.resolve(lineIndexes.get(line));
	if (lineIndexBuilds.has(line)) return lineIndexBuilds.get(line);

	const build = (async () => {
		const index = new Map();

		for (const pack of candidateDescriptionPacks(line)) {
			let entries;
			try {
				entries = await pack.getIndex({
					fields: [
						`flags.${COMPENDIUM_MODULE}.id`,
						`flags.${COMPENDIUM_MODULE}.line`,
						`flags.${COMPENDIUM_MODULE}.source_type`,
						"system.description"
					]
				});
			} catch (err) {
				console.warn(`WoD | Compendium description resolver: could not index pack "${pack.collection}" for line "${line}":`, err);
				continue;
			}

			for (const entry of entries) {
				const flags = entry.flags?.[COMPENDIUM_MODULE];
				if (!flags?.id) continue;

				const key = tripleKey({ line: flags.line ?? "", type: flags.source_type ?? "", id: flags.id });
				if (index.has(key)) continue; // a line's own pack was searched before `shared` - first hit wins.
				index.set(key, { pack, id: entry._id, description: entry.system?.description ?? "" });
			}
		}

		lineIndexes.set(line, index);
		lineIndexBuilds.delete(line);
		return index;
	})();

	lineIndexBuilds.set(line, build);
	return build;
}

/**
 * The real lookup - async, for callers that can `await` (the eye, `SendChat`, `_onSendChat`; see
 * design.md Decision 2). Returns the resolved description STRING, or `null` on any failure mode:
 * no provenance, an override in force, no line index entry for the triple, or an entry whose own
 * description is empty. Never throws; every failure is logged as a warning naming the item and its
 * triple, per design.md's "failed resolution degrades... never surfaces as an error".
 * @param {foundry.abstract.Document|object} doc - an embedded Item (or any document with `flags`
 *        and `system.description`)
 * @returns {Promise<string|null>}
 */
export async function resolveDescription(doc) {
	try {
		if (!doc) return null;
		if (isOverridden(doc)) return null;

		const provenance = provenanceOf(doc);
		if (!provenance) return null;

		const index = await buildLineIndex(provenance.line);
		const key = tripleKey(provenance);
		const hit = index.get(key);

		if (!hit) {
			console.warn(`WoD | Compendium description resolver: no match for "${doc?.name ?? "?"}" (id="${provenance.id}", line="${provenance.line}", type="${provenance.type}").`);
			return null;
		}

		let description = hit.description;

		// The index build already requests `system.description` as an index field (see
		// `buildLineIndex`), so this should already be populated. This is a defensive fallback for a
		// pack whose stored index predates that field being requested - ONE full-document read of the
		// single pack that already matched, never a scan across the ~10-25 packs a line owns.
		if (!description) {
			try {
				const fullDoc = await hit.pack.getDocument(hit.id);
				description = fullDoc?.system?.description ?? "";
			} catch (err) {
				console.warn(`WoD | Compendium description resolver: could not load matched document for "${doc?.name ?? "?"}" (triple "${key}"):`, err);
				return null;
			}
		}

		if (!description) return null;

		descriptionCache.set(key, description);
		return description;
	} catch (err) {
		console.warn(`WoD | Compendium description resolver failed for "${doc?.name ?? "?"}":`, err);
		return null;
	}
}

/**
 * The SYNCHRONOUS entry point, for callers that cannot `await` - the two chat-card builders in
 * `handlebars.js` and the power-list contexts in `demon-actor-sheet.js`/`creature-actor-sheet.js`
 * (design.md Decision 2, "The synchronous problem"). Returns a cache hit, or `null` - NEVER
 * triggers a lookup itself. A `null` here means the caller must fall back to the document's own
 * stored `system.description`; it is not, by itself, evidence that no compendium match exists (the
 * cache may simply not have been warmed yet for this item's line - a cold-start case the design
 * accepts rather than hides).
 * @param {foundry.abstract.Document|object} doc
 * @returns {string|null}
 */
export function getCachedDescription(doc) {
	try {
		if (!doc) return null;
		if (isOverridden(doc)) return null;

		const provenance = provenanceOf(doc);
		if (!provenance) return null;

		return descriptionCache.get(tripleKey(provenance)) ?? null;
	} catch (err) {
		console.warn(`WoD | Compendium description resolver (cached read) failed for "${doc?.name ?? "?"}":`, err);
		return null;
	}
}

/**
 * Warms the synchronous cache for every line in `lines`, so the synchronous callers above are
 * served from cache in normal play and the stored-value fallback is the cold-start case only (design
 * .md Decision 2). Called once from `ready`, for the lines actually present among the world's
 * actors - never for every line the module ships, and never per item.
 * @param {string[]} lines
 * @returns {Promise<void>}
 */
export async function warmDescriptionCache(lines) {
	const uniqueLines = [...new Set((lines ?? []).filter(Boolean))];

	for (const line of uniqueLines) {
		try {
			const index = await buildLineIndex(line);
			for (const [key, hit] of index) {
				if (hit.description) descriptionCache.set(key, hit.description);
			}
		} catch (err) {
			console.warn(`WoD | Compendium description resolver: warm-up failed for line "${line}":`, err);
		}
	}
}

/**
 * Decision 3's override rule, applied at the ONE place every item-edit-sheet save passes through:
 * if `updateData` changes `system.description` away from what is currently stored on a provenance-
 * carrying item, stamps `flags.worldofdarkness.descriptionOverride = true` into that SAME update so
 * the flag lands atomically with the edit. A no-op for an item with no provenance (Decision 3 rule 3
 * already always shows its own text - nothing to flag), for a re-submission that does not actually
 * change the text, and for an item that already carries the flag.
 *
 * Written to accept EITHER shape a caller may already have built: a flat dotted-key object
 * (`{"system.description": "..."}}`, what `WoDItemSheetV2.onSubmitItemForm`'s per-field branch
 * builds) or an expanded nested object (`{system: {description: "..."}}`, what `FormApplication`'s
 * `_updateObject` and `WoDItemSheetV2`'s `_prepareSubmitData` branch both build) - and writes the
 * flag back in the SAME shape, so callers can pass the result straight to `item.update()` unchanged.
 * @param {foundry.abstract.Document|object} item - the item BEFORE this update is applied
 * @param {Record<string, unknown>} updateData - the update payload about to reach `item.update()`,
 *        mutated in place
 * @returns {Record<string, unknown>} `updateData`, for convenient chaining
 */
export function stampDescriptionOverride(item, updateData) {
	try {
		if (!updateData || typeof updateData !== "object") return updateData;

		const isFlat = Object.prototype.hasOwnProperty.call(updateData, "system.description");
		const newDescription = isFlat ? updateData["system.description"] : updateData.system?.description;

		if (newDescription === undefined) return updateData;
		if (newDescription === (item?.system?.description ?? "")) return updateData;
		if (!provenanceOf(item)) return updateData;
		if (isOverridden(item)) return updateData; // already flagged; nothing new to stamp.

		if (isFlat) {
			updateData["flags.worldofdarkness.descriptionOverride"] = true;
		} else {
			foundry.utils.setProperty(updateData, "flags.worldofdarkness.descriptionOverride", true);
		}
	} catch (err) {
		console.warn(`WoD | Compendium description resolver: could not evaluate description override for "${item?.name ?? "?"}":`, err);
	}

	return updateData;
}
