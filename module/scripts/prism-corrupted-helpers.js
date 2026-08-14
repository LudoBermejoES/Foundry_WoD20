/**
 * add-prism-of-focus-foundry — Prácticas Corruptas (design.md D8/D16). The mechanic every one of the
 * 7 shares (a "(Práctica) Corrupta" Resonance counter, modeled exactly like existing Resonance —
 * `wod-actor-base.js:201`'s `Trait`/`wod.types.resonance` shape — plus a resistance roll and a
 * substitution-at-threshold rule), and each of the 7's own named Beneficio/Precio on top
 * (`CORRUPTED_PRACTICE_RULES` in `prism-practice-data.js`).
 */

import { CORRUPTED_PRACTICE_RULES } from "./prism-practice-data.js";
import { provenanceOf } from "./prism-state-engine.js";

/**
 * Finds the "(Práctica) Corrupta" Resonance Trait item for one corrupted Práctica, matched by
 * provenance id (`<corrupted-practice-id>-resonance`, the convention this change adopts — see the
 * final report) with a name-based fallback for a hand-created item with no provenance flag.
 * @param {Actor} actor
 * @param {string} corruptedPracticeId
 * @returns {Item|null}
 */
export function findCorruptedResonanceItem(actor, corruptedPracticeId) {
	for (const item of actor?.items ?? []) {
		if (item?.type !== "Trait" || item?.system?.type !== "wod.types.resonance") continue;
		const id = provenanceOf(item)?.id ?? "";
		if (id === `${corruptedPracticeId}-resonance`) return item;
		if (new RegExp(`${corruptedPracticeId}.*corrupt`, "i").test(item?.name ?? "")) return item;
	}
	return null;
}

/**
 * @param {Actor} actor
 * @param {string} corruptedPracticeId
 * @returns {number} current Resonance value (0 if no item exists yet)
 */
export function getCorruptedResonanceValue(actor, corruptedPracticeId) {
	const item = findCorruptedResonanceItem(actor, corruptedPracticeId);
	return parseInt(item?.system?.value ?? 0) || 0;
}

/**
 * D8 — the shared resistance roll's pool/difficulty for a cast through a corrupted Práctica.
 * @param {number} practiceRating - the corrupted Práctica's own rating
 * @param {number} highestSphereUsed
 * @returns {{pool: number, difficulty: number}}
 */
export function corruptedResistanceRoll(practiceRating, highestSphereUsed) {
	return { pool: parseInt(practiceRating) || 0, difficulty: 3 + (parseInt(highestSphereUsed) || 0) };
}

/**
 * @param {number} resonanceValue
 * @param {number} practiceRating
 * @returns {"clean"|"corrupted"}
 */
export function corruptedStateFromResonance(resonanceValue, practiceRating) {
	return resonanceValue >= (parseInt(practiceRating) || 0) ? "corrupted" : "clean";
}

/** Abismalismo's Precio (D16): a Silence FLOOR, `ceil(rating/2)`. */
export function abyssalismSilenceFloor(abyssalismRating) {
	return Math.ceil((parseInt(abyssalismRating) || 0) / 2);
}

/** Vamamarga's own Jhor Resonance track resistance roll — dice pool = current Jhor rating,
 *  difficulty 6, wired ALONGSIDE (not instead of) the generic resistance roll above.
 * @param {number} currentJhorRating
 * @returns {{pool: number, difficulty: number}}
 */
export function vamamargaJhorRoll(currentJhorRating) {
	return { pool: parseInt(currentJhorRating) || 0, difficulty: 6 };
}

/**
 * @param {"failure"|"botch"} result
 * @param {number} currentJhorRating
 * @returns {number} the Jhor point delta to apply (0 on a non-triggering result)
 */
export function vamamargaJhorDelta(result, currentJhorRating) {
	if (currentJhorRating === 0) return 1; // the first Jhor point is automatic, no roll.
	if (result === "botch") return 2;
	if (result === "failure") return 1;
	return 0;
}

/** The rule metadata for one of the 7 Prácticas Corruptas, or `undefined` if `id` isn't one of them. */
export function getCorruptedPracticeRule(id) {
	return CORRUPTED_PRACTICE_RULES[id];
}
