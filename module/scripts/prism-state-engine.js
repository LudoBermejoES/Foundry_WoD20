/**
 * add-prism-of-focus-foundry — the Asociada/Limitada/Neutra engine, design.md D3, §1.3's algorithm:
 *
 *   A = union of associated_practices across all of the actor's owned Tenet items
 *   L = union of limited_practices across all of the actor's owned Tenet items
 *   state(practice) =
 *       "associated" if practice is the actor's faction Especialidad (A4a)
 *       "neutral"    if practice ∈ A and practice ∈ L        (tie -> neutral, A3)
 *       "associated" if practice ∈ A and practice ∉ L
 *       "limited"    if practice ∈ L and practice ∉ A
 *       "neutral"    otherwise
 *
 * FACTION-OVERRIDE SIMPLIFICATION (a genuine implementation finding, not a deviation from the
 * rule): per A20(a), "el acceso a una Especialidad requiere ser miembro iniciado de la facción
 * correspondiente" — access is gated at PURCHASE time (wodchar's job, not re-validated here per
 * design.md Risks). So on the Foundry side, an owned `kind: "specialty"` item is, by construction,
 * ALWAYS the actor's own faction's Especialidad (there is no code path that lets a Foundry actor
 * hold somebody else's faction's Especialidad) — the "is this MY faction's Especialidad" check
 * A4a describes therefore always evaluates true for a Foundry-owned Especialidad item, and the
 * override collapses to an unconditional `state = "associated"` for every `kind: "specialty"` item,
 * with no faction/affiliation lookup needed on this side at all.
 *
 * A5 — a `kind: "corrupted"` item has NO faction override (Corrupted Practices are adopted, not
 * granted by faction membership) and instead inherits whatever state its BASE practice_id computes
 * under the algorithm above — looked up under the base id, never computed fresh for the corrupted
 * item's own id.
 *
 * `prism_state` IS NOT PERSISTED onto the item document (a deliberate simplification from design.md
 * D3's "cached onto each owned Practice item's derived `prism_state`" language — see this change's
 * final report): Feature-typed items have no registered Foundry DataModel class in this system (only
 * Realm/Ability/Splat/Sphere/Advantage do), so there is no `prepareDerivedData()` hook to cache onto
 * safely without either introducing a new Item DataModel (a much larger, riskier change touching
 * every Feature-typed item in the system) or re-running `item.update()` as a side effect of sheet
 * render (a stale-write/render-loop risk). `computePrismStates`/`stateForPracticeItem` below are pure
 * functions, cheap enough (an actor owns at most a handful of Tenets) to call fresh every time state
 * is needed — from the sheet's context builder AND from the roll dialog — which satisfies the same
 * "derived, never hand-editable, never authoritative independent of the algorithm" contract D3
 * requires, without the extra persistence layer.
 */

const TENET_CATEGORIES = new Set([
	"metaphysical", "personal", "ascension", "social-role", "epistemology", "openness", "afterlife"
]);

const COMPENDIUM_MODULE = "wod20-compendium-es";
const CHAR_MODULE = "wod20-char";

/**
 * Reads a document's entity provenance — the same triple `compendium-description.js`'s
 * `provenanceOf` reads, duplicated here (rather than imported) so this module has zero Foundry-
 * global dependency and can be exercised with plain node for its pure-function parts.
 * @param {object} doc
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
 * Is this a Precepto (Tenet) item? `system.type` is `"wod.types.othertraits"` on every compendium-
 * shipped Tenet (verified: `taxonomy.json`'s `tenet` entry deliberately maps to the system's generic
 * unmodeled-trait bucket, NOT a bespoke `wod.types.tenet` — a correction from this change's original
 * assumption, see the final report), so detection cannot rely on `system.type` alone. Three signals,
 * any one sufficient: an explicit `wod.types.tenet` (kept as an option for a possible future
 * from-scratch "add Precepto" button that writes its own discriminator), the compendium/wodchar
 * provenance `source_type`/`sourceType === "tenet"`, or (for a hand-created item with neither) a
 * `category` value that is one of the 7 known Tenet categories.
 * @param {Item|object} item
 * @returns {boolean}
 */
export function isTenetItem(item) {
	if (item?.type !== "Feature") return false;
	const systemType = item?.system?.type;
	if (systemType === "wod.types.tenet") return true;
	if (item?.flags?.[COMPENDIUM_MODULE]?.source_type === "tenet") return true;
	if (item?.flags?.[CHAR_MODULE]?.sourceType === "tenet") return true;
	if (systemType === "wod.types.othertraits" && TENET_CATEGORIES.has(item?.system?.category)) return true;
	return false;
}

/** Is this a Práctica (base/specialty/corrupted) item? `wod.types.practice` is unambiguous — the
 *  taxonomy mapping already matches design.md D2 exactly, verified against `foundry_type_map.json`.
 * @param {Item|object} item
 * @returns {boolean}
 */
export function isPracticeItem(item) {
	return item?.type === "Feature" && item?.system?.type === "wod.types.practice";
}

/**
 * Reads a Tenet item's `associated_practices`/`limited_practices` id arrays. Prefers literal
 * `system.associated_practices`/`limited_practices` (populated for a wodchar-exported Tenet, per the
 * canonical contract — wodchar computes these server-side and writes them as real fields on the
 * Item it exports, unconstrained by `webgen/foundry_export.py`'s display-HTML convention); falls
 * back to parsing the resolved description's `wod-kb-mech` block (populated for an item dragged
 * straight from the `wod20-compendium-es` compendium, whose mechanics are HTML-embedded only).
 * @param {Item|object} item
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {{associated: string[], limited: string[]}}
 */
export function getTenetPractices(item, getMechanics) {
	const sysAssoc = item?.system?.associated_practices;
	const sysLimited = item?.system?.limited_practices;
	if (Array.isArray(sysAssoc) && sysAssoc.length || Array.isArray(sysLimited) && sysLimited.length) {
		return { associated: Array.isArray(sysAssoc) ? sysAssoc : [], limited: Array.isArray(sysLimited) ? sysLimited : [] };
	}
	const mech = getMechanics ? getMechanics(item) : {};
	return {
		associated: Array.isArray(mech.associated_practices) ? mech.associated_practices : [],
		limited: Array.isArray(mech.limited_practices) ? mech.limited_practices : []
	};
}

/**
 * Reads a Práctica item's `kind` (`"base"|"specialty"|"corrupted"`). Same literal-field-then-
 * mechanics-block fallback as `getTenetPractices`.
 * @param {Item|object} item
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {"base"|"specialty"|"corrupted"}
 */
export function getPracticeKind(item, getMechanics) {
	const sysKind = item?.system?.kind;
	if (sysKind === "base" || sysKind === "specialty" || sysKind === "corrupted") return sysKind;
	const mech = getMechanics ? getMechanics(item) : {};
	if (mech.kind === "base" || mech.kind === "specialty" || mech.kind === "corrupted") return mech.kind;
	return "base";
}

/**
 * Reads a Práctica item's `base_practice_id` (only meaningful for `specialty`/`corrupted` items).
 * @param {Item|object} item
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {string}
 */
export function getBasePracticeId(item, getMechanics) {
	const sysBase = item?.system?.base_practice_id;
	if (typeof sysBase === "string" && sysBase) return sysBase;
	const mech = getMechanics ? getMechanics(item) : {};
	return typeof mech.base_practice_id === "string" ? mech.base_practice_id : "";
}

/**
 * The Práctica's own stable id (`flags[...].id`), the key the A/L sets and Fórmula linkage both use.
 * @param {Item|object} item
 * @returns {string}
 */
export function getPracticeId(item) {
	return provenanceOf(item)?.id ?? "";
}

/**
 * Builds the union-with-cancellation A/L sets across every owned Tenet item (§1.3/A3).
 * @param {{items: Iterable<object>}} actor
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {{associated: Set<string>, limited: Set<string>}}
 */
export function computeAssociatedLimitedSets(actor, getMechanics) {
	const associated = new Set();
	const limited = new Set();

	for (const item of actor?.items ?? []) {
		if (!isTenetItem(item)) continue;
		const { associated: a, limited: l } = getTenetPractices(item, getMechanics);
		for (const id of a) associated.add(id);
		for (const id of l) limited.add(id);
	}

	return { associated, limited };
}

/**
 * The base algorithm for one practice id against already-built A/L sets — tie -> neutral (A3), no
 * category hierarchy.
 * @param {string} practiceId
 * @param {Set<string>} associated
 * @param {Set<string>} limited
 * @returns {"associated"|"limited"|"neutral"}
 */
export function baseStateForPracticeId(practiceId, associated, limited) {
	if (!practiceId) return "neutral";
	const inA = associated.has(practiceId);
	const inL = limited.has(practiceId);
	if (inA && inL) return "neutral";
	if (inA) return "associated";
	if (inL) return "limited";
	return "neutral";
}

/**
 * The full per-item state resolution (D3/D4/A4/A5), for one owned Práctica item.
 * @param {Item|object} practiceItem - an owned item where `isPracticeItem(practiceItem)` is true
 * @param {{items: Iterable<object>}} actor
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {"associated"|"limited"|"neutral"}
 */
export function stateForPracticeItem(practiceItem, actor, getMechanics) {
	const kind = getPracticeKind(practiceItem, getMechanics);

	// A4/A20a — an owned Especialidad is, by construction, always the actor's own faction's
	// Especialidad (access is gated at purchase time, not re-validated here); the override is
	// therefore unconditional on the Foundry side. See this file's header note.
	if (kind === "specialty") return "associated";

	const { associated, limited } = computeAssociatedLimitedSets(actor, getMechanics);

	// A5 — a Corrupted Practice inherits its BASE practice's state, looked up under the base id.
	// A "base"-kind item looks itself up under its own id.
	const lookupId = kind === "corrupted" ? getBasePracticeId(practiceItem, getMechanics) : getPracticeId(practiceItem);

	return baseStateForPracticeId(lookupId, associated, limited);
}

/**
 * Every owned Práctica item's state in one pass (for the sheet's context builder — avoids
 * recomputing the A/L sets once per row).
 * @param {{items: Iterable<object>}} actor
 * @param {(item: object) => Record<string, string|string[]>} getMechanics
 * @returns {Map<string, "associated"|"limited"|"neutral">} keyed by the item's `_id`
 */
export function computePrismStates(actor, getMechanics) {
	const { associated, limited } = computeAssociatedLimitedSets(actor, getMechanics);
	const states = new Map();

	for (const item of actor?.items ?? []) {
		if (!isPracticeItem(item)) continue;
		const kind = getPracticeKind(item, getMechanics);
		const lookupId = kind === "specialty"
			? null
			: kind === "corrupted"
				? getBasePracticeId(item, getMechanics)
				: getPracticeId(item);

		const state = kind === "specialty" ? "associated" : baseStateForPracticeId(lookupId, associated, limited);
		states.set(item._id ?? item.id, state);
	}

	return states;
}

export const TENET_CATEGORY_LIST = [...TENET_CATEGORIES];
