/**
 * add-prism-of-focus-foundry — parses the `wod-kb-mech` HTML block `webgen/foundry_export.py`
 * embeds into `system.description` for descriptive entity types (Tenets, Practices, Practice
 * Specialties, Corrupted Practices, Rotes/Fórmulas).
 *
 * CORRECTION FROM design.md's ORIGINAL ASSUMPTION (recorded here and in design.md's own
 * "Implementation correction" note, per task 0.1's instruction to reconcile a field-name mismatch
 * BEFORE coding rather than silently guess-clobber it): design.md/tasks.md assumed a Fórmula's
 * `practice_id`, and a Practice's `kind`/`base_practice_id`/`corrupted_practice_id`/
 * `faction_specialty_ids`/`benefit_es`/`penalty_es`/`price_es`, and a Tenet's `category`/
 * `associated_practices`/`limited_practices`, would be readable as literal `system.mechanics.*`
 * fields (or, for the Fórmula case, `flags['wod20-compendium-es'].practice_id`) on the shipped
 * `wod20-compendium-es` Item document. Verified against the ACTUAL shipped documents
 * (`wod20-compendium-es/src/mage-practices/*.json`, `mage-tenets/*.json`, `mage-rotes/*.json`):
 * none of this is true. Every one of those facts is instead embedded as a human-readable
 * `<ul class='wod-kb-mech'><li><strong>key:</strong> value</li>...</ul>` block appended to
 * `system.description`'s HTML — the same "_desc_html embeds a mechanics block" behavior this
 * project's own root CLAUDE.md already documents for exported entities generally. A Rote's
 * `practice_id` is `<li><strong>practice_id:</strong> faith</li>` inside ITS OWN description, not a
 * flag anywhere.
 *
 * WHY THIS IS THE RIGHT FIX, NOT A WORKAROUND. `module/scripts/compendium-description.js` already
 * resolves an owned Item's description LIVE from the compendium at read time, keyed on the
 * `(id, line, source_type)` provenance triple both `wod20-char` and `wod20-compendium-es` stamp —
 * this is the established, tested mechanism for "an owned item's compendium-sourced content reaches
 * the actor with no copy, no migration, no staleness". Since the mechanics block is PART of that
 * same description string, parsing it after resolution reuses that mechanism verbatim instead of
 * inventing a second one. `getMechanics()` below is a thin layer on top: resolve description (live,
 * cached, or the item's own stored copy as the final fallback), then parse.
 *
 * Slugs inside list-type fields (`associated_practices: alchemy, craftwork, ...`) are already the
 * SAME `id` slugs `flags['wod20-compendium-es'].id` uses elsewhere in this corpus, so no separate
 * name-normalization step is needed to key this project's Práctica/Tenet ids.
 *
 * TWO ROW SHAPES, AND THE KEY IS NO LONGER THE TEXT (`fix-mech-block-raw-keys`).
 * `models.mech_block()` used to print the RAW KEY as the visible text, so a player read
 * `common_instruments:` on the item sheet where the reading site, from the same datum, writes
 * «Instrumentos comunes». The text is now the LABEL and the key travels in `data-key`:
 *
 *   new      <li data-key='common_instruments'><strong>Instrumentos comunes:</strong> …</li>
 *   legacy   <li><strong>common_instruments:</strong> …</li>
 *
 * BOTH are accepted, and the legacy shape is not a courtesy: `getMechanicsSync` falls back, as a last
 * resort, to the `system.description` the Item itself carries copied inside an actor, and that copy
 * may predate the format change. `data-key` WINS over the text when both are present.
 *
 * WHY NOT A LABEL->KEY MAP HERE: labels are not unique. Measured over `webgen/mechanic_labels.json`
 * (253 keys, 202 distinct labels), 95 keys share a label with another (44 distinct labels affected),
 * and the collisions land exactly on what this file resolves —
 * `associated_practices`/`practicas_asociadas` are both «Prácticas asociadas»,
 * `paradigmas_asociados`/`associated_paradigms` both «Paradigmas asociados», `kind`/`tipo` both
 * «Tipo», `practice`/`practice_id` both «Práctica». Inverting the label would be ambiguous by
 * construction. The guard that crosses the two sides is
 * `wod20/webgen/tests/test_mech_block_parser_contract.py`: it renders rows with the real exporter and
 * parses them with THIS file, so a format change on either side fails in CI instead of breaking
 * Práctica resolution silently — which is the reason `add-formula-authoring` declared this change
 * out of scope in the first place.
 */

/** Fields whose value is a comma-separated list, split into a trimmed, non-empty array. */
const LIST_FIELDS = new Set([
	"associated_practices",
	"limited_practices",
	"faction_specialty_ids",
	"paradigmas_asociados",
	// `associated_abilities`, NOT `habilidades_asociadas`: that was one of the FOUR names this list
	// lived under, and `add-formula-authoring` unified them into one. The old entry was left dead here
	// — nothing read it, so nothing broke, but it declared a field that no longer exists.
	"associated_abilities",
	// `common_instruments`, NOT `instrumentos_comunes`: the SAME dead-entry defect the comment above
	// describes, in its second instance, found by the new cross-side guard — `instrumentos_comunes`
	// appears in 0 shipped documents while `common_instruments` appears in 42, carrying exactly the
	// value this line means to split (comma-separated prose: "Armas, computadoras, danzas, …").
	// Corrected here because that guard requires every member of this set to exist in what is emitted.
	"common_instruments"
]);

const MECH_BLOCK_RE = /<ul class=['"]wod-kb-mech['"]>([\s\S]*?)<\/ul>/;
//                        1: <li> attributes   2: label, or legacy raw key   3: value
const MECH_ROW_RE = /<li([^>]*)><strong>([^<]*?):<\/strong>\s*([\s\S]*?)<\/li>/g;
const DATA_KEY_RE = /\bdata-key=['"]([^'"]*)['"]/;
// The VALUE travels in `data-value` when the visible text is a READABLE rendering of it
// (`make-mechanics-values-legible`). Same contract as `data-key`, and for the same reason: this
// parser resolves Práctica from these rows, so a row whose text reads «Yoga» must still yield
// `yoga`. The attribute is emitted ONLY where text and machine value differ, so its ABSENCE means
// "the text IS the value" -- which is why the fallback below is correct and not a degradation.
const DATA_VALUE_RE = /\bdata-value=['"]([^'"]*)['"]/;

/**
 * Parses a resolved description's `wod-kb-mech` block into a plain object. Never throws: an absent
 * block, or a malformed one, simply yields `{}` — every caller degrades to "no mechanics known" the
 * same way `compendium-description.js`'s resolver degrades to "no description known".
 * @param {string|null|undefined} descriptionHtml
 * @returns {Record<string, string|string[]>}
 */
export function parseMechanicsBlock(descriptionHtml) {
	const result = {};
	if (!descriptionHtml) return result;

	const blockMatch = MECH_BLOCK_RE.exec(descriptionHtml);
	if (!blockMatch) return result;

	MECH_ROW_RE.lastIndex = 0;
	let rowMatch;
	while ((rowMatch = MECH_ROW_RE.exec(blockMatch[1])) !== null) {
		// `data-key` first, the <strong> text second: see the header note. In the new format that
		// text is the LABEL, and a label does not identify a key, so it only serves as the key when
		// no attribute is present — i.e. for a description written in the old format.
		const dataKey = DATA_KEY_RE.exec(rowMatch[1] || "");
		const key = (dataKey ? dataKey[1] : rowMatch[2]).trim();
		if (!key) continue;
		// `data-value` first, the visible text second -- the same precedence `data-key` has, and for
		// the same reason: the text is now a LABEL for the value, and a label does not identify a
		// value. Its absence is the normal case (~16,000 of 16,884 rows) and means text == value.
		const dataValue = DATA_VALUE_RE.exec(rowMatch[1] || "");
		const rawValue = (dataValue ? dataValue[1] : rowMatch[3].replace(/<[^>]+>/g, "")).trim();

		if (LIST_FIELDS.has(key)) {
			result[key] = rawValue ? rawValue.split(",").map((v) => v.trim()).filter(Boolean) : [];
		} else {
			result[key] = rawValue;
		}
	}

	return result;
}

/**
 * Resolves an item's mechanics object: prefers the live-resolved compendium description
 * (`compendium-description.js`'s synchronous cache, already warmed for the actor's line in normal
 * play), falling back to the item's own stored `system.description` — exactly the same two-tier
 * fallback `resolveDescription`/`getCachedDescription` already establish for the raw text itself.
 * Synchronous, for use from sheet context builders and dialogs that cannot await mid-render.
 * @param {Item|object} item
 * @param {(doc: object) => string|null} getCachedDescription - injected so this module never
 *        imports `compendium-description.js` directly (keeps this file testable with plain node,
 *        no Foundry globals) — callers pass the real function in production.
 * @returns {Record<string, string|string[]>}
 */
export function getMechanicsSync(item, getCachedDescription) {
	const cached = typeof getCachedDescription === "function" ? getCachedDescription(item) : null;
	const description = cached ?? item?.system?.description ?? "";
	return parseMechanicsBlock(description);
}

/**
 * Async twin of `getMechanicsSync`, for callers that CAN await (mirrors `resolveDescription`).
 * @param {Item|object} item
 * @param {(doc: object) => Promise<string|null>} resolveDescription
 * @returns {Promise<Record<string, string|string[]>>}
 */
export async function getMechanicsAsync(item, resolveDescription) {
	let description = null;
	try {
		description = typeof resolveDescription === "function" ? await resolveDescription(item) : null;
	} catch (err) {
		console.warn(`WoD | Prism mechanics parser: resolveDescription failed for "${item?.name ?? "?"}":`, err);
	}
	description = description ?? item?.system?.description ?? "";
	return parseMechanicsBlock(description);
}
