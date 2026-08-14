/**
 * add-prism-of-focus-foundry — `PrismHelper`, the M20 Prism of Focus rules engine, mirroring
 * `BonusHelper`'s shape (a static-method helper class called from dialogs, never itself a
 * FormApplication). Consolidates: design.md D3/D4 (the Asociada/Limitada/Neutra ±1 engine), D11/C3
 * (the improvised-quick-cast +1 house rule), D12 (the 31 Prácticas' own Beneficio/Penalización, via
 * the `prism-practice-data.js` table), D13 (Fórmula-ownership resolution) and D5/D6 (Sanctum anatema
 * + Zonas de Realidad vulgarity).
 *
 * Rituales (D7/D14) and Prácticas Corruptas (D8/D16) live in their own sibling files
 * (`prism-ritual-calculator.js`, `prism-corrupted-helpers.js`) — both are large enough domains, with
 * little overlap with the rest of this file, that folding them in here would make this file the
 * single largest and hardest-to-navigate file in the change.
 */

import {
	isPracticeItem,
	isTenetItem,
	getPracticeId,
	getPracticeKind,
	getBasePracticeId,
	stateForPracticeItem,
	isSanctumBackgroundItem
} from "./prism-state-engine.js";
import { AUTO_PRACTICE_RULES, CORRUPTED_PRACTICE_RULES } from "./prism-practice-data.js";
import { getCachedDescription, resolveDescription } from "./compendium-description.js";
import { getMechanicsSync, getMechanicsAsync } from "./prism-mechanics-parser.js";
import { abyssalismSilenceFloor } from "./prism-corrupted-helpers.js";

/** The one place a "get this item's mechanics, synchronously" function is built, so every caller in
 *  this file shares the exact same live-resolve-then-parse behavior `compendium-description.js`
 *  already establishes for raw description text. */
function mechanicsOf(item) {
	return getMechanicsSync(item, getCachedDescription);
}

/** Async twin, for the one caller (`ResolvePracticeForFormula`'s Fórmula-side lookup) that can await
 *  a cold-cache resolution rather than accepting a possibly-empty synchronous cache miss. */
async function mechanicsOfAsync(item) {
	return getMechanicsAsync(item, resolveDescription);
}

function findOwnedPracticeItem(actor, practiceId) {
	if (!practiceId) return null;
	for (const item of actor?.items ?? []) {
		if (isPracticeItem(item) && getPracticeId(item) === practiceId) return item;
	}
	return null;
}

/** Base-or-specialty scan shared by `ResolvePracticeForFormula` (D13) and `ResolvePracticeRating`
 *  (followups D4): an owned Especialidad satisfies its base Práctica's id exactly like the base
 *  item itself would, per `getBasePracticeId`. */
function findPracticeOrSpecialtyItem(actor, practiceId) {
	if (!practiceId) return null;
	for (const item of actor?.items ?? []) {
		if (!isPracticeItem(item)) continue;
		const id = getPracticeId(item);
		const kind = getPracticeKind(item, mechanicsOf);
		const base = kind === "specialty" ? getBasePracticeId(item, mechanicsOf) : id;
		if (id === practiceId || base === practiceId) return item;
	}
	return null;
}

/** Maps a maneuver's `dice2` ability key to the Práctica id that can substitute for it, for
 *  followups D4's dialog-item.js branch. Only `martialarts` today (the Do → Artes Marciales case);
 *  extend here, not at the call site, if another Ability/Práctica pair needs the same treatment. */
const DICE2_PRACTICE_ID = { martialarts: "martial-arts" };

function getPermanentArete(actor) {
	if (actor?.type === "PC") {
		const arete = actor.api?.getAdvantage?.("arete");
		return parseInt(arete?.system?.value ?? arete?.value ?? 0) || 0;
	}
	return parseInt(actor?.system?.advantages?.arete?.value ?? 0) || 0;
}

function getAbilityRating(actor, abilityKey) {
	if (actor?.type === "PC") {
		const ability = actor.api?.getAbility?.(abilityKey);
		return parseInt(ability?.system?.value ?? 0) || 0;
	}
	return parseInt(actor?.system?.abilities?.[abilityKey]?.value ?? 0) || 0;
}

/** Attributes (e.g. "stamina" for Vigorización's Resistencia + Meditación pool) are stored flat on
 *  `system.attributes.<key>` for every actor type alike — no PC/legacy split, unlike Ability/
 *  Advantage lookups above (verified against `dialog-generalroll.js`'s own attribute reads). */
function getAttributeRating(actor, attributeKey) {
	return parseInt(actor?.system?.attributes?.[attributeKey]?.value ?? 0) || 0;
}

/** Advantage-backed resource pools (Willpower, Quintaesencia) needed by the `prompt`-bucket
 *  Prácticas' dialogs (Vigorización, Hipertecnología, Psiónica). Mirrors `getPermanentArete`'s own
 *  PC-vs-legacy split, with a fallback for the legacy shape's occasional extra `.system.` nesting
 *  (seen on quintessence/paradox specifically, `wod-actor-base.js`). */
function getAdvantageField(actor, advantageId, field) {
	if (actor?.type === "PC") {
		const adv = actor.api?.getAdvantage?.(advantageId);
		return parseInt(adv?.system?.[field] ?? adv?.[field] ?? 0) || 0;
	}
	const adv = actor?.system?.advantages?.[advantageId];
	return parseInt(adv?.[field] ?? adv?.system?.[field] ?? 0) || 0;
}

export default class PrismHelper {
	/** Every casting-dialog call site guards on this first — a mage who has never enabled Prisma de
	 *  Foco keeps today's Focus behavior byte-identical (design.md D1/Migration Plan). */
	static IsActive(actor) {
		return actor?.system?.settings?.hasprismoffocus === true;
	}

	/**
	 * D3/D4 — the Asociada/Limitada/Neutra ±1 engine, for one owned Práctica the casting dialog's
	 * selector resolved.
	 * @param {Actor} actor
	 * @param {string} practiceId
	 * @returns {-1|0|1}
	 */
	static CheckPracticeState(actor, practiceId) {
		const item = findOwnedPracticeItem(actor, practiceId);
		if (!item) return 0;
		const state = stateForPracticeItem(item, actor, mechanicsOf);
		if (state === "associated") return -1;
		if (state === "limited") return 1;
		return 0;
	}

	/** Every owned Práctica item, with its computed state and mechanics — for the sheet's Prácticas
	 *  dot-allocator partial (task 3.3). Recomputed fresh on every call (design.md D3 — a pure
	 *  function, never a persisted cache; see `prism-state-engine.js`'s header for why).
	 * @param {Actor} actor
	 * @returns {Array<{item: Item, id: string, kind: string, state: string, mechanics: object}>}
	 */
	static ListOwnedPractices(actor) {
		const rows = [];
		for (const item of actor?.items ?? []) {
			if (!isPracticeItem(item)) continue;
			const mech = mechanicsOf(item);
			rows.push({
				item,
				id: getPracticeId(item) || mech.id || "",
				kind: getPracticeKind(item, mechanicsOf),
				state: stateForPracticeItem(item, actor, mechanicsOf),
				mechanics: mech
			});
		}
		return rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
	}

	/** Every owned Precepto (Tenet) item, grouped by category — for task 2.2's sheet partial. */
	static ListOwnedTenets(actor) {
		const rows = [];
		for (const item of actor?.items ?? []) {
			if (!isTenetItem(item)) continue;
			const mech = mechanicsOf(item);
			const category = item?.system?.category || mech.category || "";
			const associated = Array.isArray(item?.system?.associated_practices) && item.system.associated_practices.length
				? item.system.associated_practices
				: (mech.associated_practices ?? []);
			const limited = Array.isArray(item?.system?.limited_practices) && item.system.limited_practices.length
				? item.system.limited_practices
				: (mech.limited_practices ?? []);
			rows.push({ item, category, associated, limited });
		}
		return rows.sort((a, b) => a.category.localeCompare(b.category) || a.item.name.localeCompare(b.item.name));
	}

	// ---------------------------------------------------------------------------------------
	// D12 — the 31 Prácticas' own Beneficio/Penalización (auto bucket, data-driven)
	// ---------------------------------------------------------------------------------------

	/**
	 * @param {Actor} actor - the CASTER (used for computed rules; the crossActor case reads
	 *        `context.targetActor` instead, per A22 — see design.md D12/Arreglo #21)
	 * @param {string} practiceId
	 * @param {"benefit"|"penalty"} side
	 * @param {object} context - `{checked, tier, targetActor}`, built by the casting dialog
	 * @returns {{modifier: number, forcesParadojaVulgar?: boolean, forcesCoincidental?: boolean}}
	 */
	static _evaluatePracticeRule(actor, practiceId, side, context = {}) {
		// D16/task 10.6 — a Práctica Corrupta's own named Beneficio/Precio shares this same
		// dispatch, including the three genuinely non-dice-modifier shapes (Abismalismo's Silence
		// floor, Goetia's failure branch, Vamamarga's own Jhor track): these return `{modifier: 0}`
		// plus an extra, shape-specific flag (`silenceFloor`/`failureBranch`/`jhorResonance`) the
		// caller (the casting dialog) reads to drive its own chat-message/warning surface, the same
		// way `forcesCoincidental`/`forcesParadojaVulgar` already ride alongside `modifier` for the
		// checkbox/decouple-paradox-only shapes below. Unconditional (no `context.checked` gate):
		// unlike a per-cast checkbox modifier, these three describe a PERMANENT consequence of
		// holding the corrupted Práctica, not something the player attests happened on this one cast.
		const rule = AUTO_PRACTICE_RULES[practiceId]?.[side] ?? CORRUPTED_PRACTICE_RULES[practiceId]?.[side];
		if (!rule) return { modifier: 0 };

		switch (rule.kind) {
			case "silence-floor": {
				const item = findOwnedPracticeItem(actor, practiceId);
				const rating = parseInt(item?.system?.value ?? 0) || 0;
				return { modifier: 0, silenceFloor: abyssalismSilenceFloor(rating) };
			}
			case "failure-branch":
				return { modifier: 0, failureBranch: true };
			case "jhor-resonance":
				return { modifier: 0, jhorResonance: true };
			case "checkbox": {
				if (!context.checked) return { modifier: 0 };
				if (rule.crossActor) {
					// A22 — the analyst's OWN Ciencia Extraña rating gates this, never the caster's.
					const analyst = context.targetActor;
					const analystItem = analyst ? findOwnedPracticeItem(analyst, practiceId) : null;
					const analystRating = parseInt(analystItem?.system?.value ?? 0) || 0;
					if (analystRating > 0) return { modifier: 0 }; // analyst already has it: no penalty.
					return { modifier: rule.modifier };
				}
				return { modifier: rule.modifier, forcesCoincidental: !!rule.forcesCoincidental };
			}
			case "computed": {
				if (rule.compute === "martialArtsGap") {
					const gap = getAbilityRating(actor, "brawl") - getAbilityRating(actor, "martialarts");
					return { modifier: gap > 0 ? gap : 0 };
				}
				if (rule.compute === "godBondingDomains") {
					const domains = actor?.system?.practiceTraits?.godBondingDomains ?? [];
					const arete = getPermanentArete(actor);
					const reached = domains.filter((d) => arete >= parseInt(d?.areteThreshold ?? 99)).length;
					return { modifier: reached > 0 ? -reached : 0 };
				}
				return { modifier: 0 };
			}
			case "tiered": {
				const tier = rule.tiers.find((t) => t.value === context.tier);
				return { modifier: tier ? (side === "penalty" ? Math.abs(tier.value) : -Math.abs(tier.value)) : 0 };
			}
			case "decouple-paradox-only": {
				if (!context.checked) return { modifier: 0 };
				return { modifier: 0, forcesParadojaVulgar: !!rule.forcesParadojaVulgar };
			}
			case "gate":
				return { modifier: 0 }; // structural validation only — never a dice number, task 6.1.
			default:
				return { modifier: 0 };
		}
	}

	static CheckPracticeBenefit(actor, practiceId, context = {}) {
		return this._evaluatePracticeRule(actor, practiceId, "benefit", context);
	}

	static CheckPracticePenalty(actor, practiceId, context = {}) {
		return this._evaluatePracticeRule(actor, practiceId, "penalty", context);
	}

	/** Magia del caos's own Penalización (D11) — Fórmula-backed casts only, disjoint from C3. */
	static CheckChaosMagickFormulaPenalty(isFormulaBacked) {
		return isFormulaBacked ? 1 : 0;
	}

	/** Caridad's Penalización is a vulgarity classification ("always vulgar when taking"), not a
	 *  difficulty modifier — surfaced separately from the checkbox-modifier table above. */
	static CheckCharityForcesVulgar(context = {}) {
		return !!context.charityTaking;
	}

	// ---------------------------------------------------------------------------------------
	// D11/C3 — the general "+1 for non-Fórmula quick-casting" house rule
	// ---------------------------------------------------------------------------------------

	/**
	 * @param {boolean} isFormulaBacked - whether this cast is backed by a learned Fórmula item
	 *        (`ResolvePracticeForFormula` found one) — asked ONCE per cast, shared with D8's
	 *        corrupted-resistance trigger (design.md D11's closing paragraph).
	 * @param {string} practiceId - Etertecnología (`ethertech`) explicitly ignores this rule.
	 * @returns {number} `1` or `0` — never negative, this is a penalty only.
	 */
	static CheckImprovisedPenalty(isFormulaBacked, practiceId) {
		if (isFormulaBacked) return 0;
		if (practiceId === "ethertech") return 0;
		return 1;
	}

	// ---------------------------------------------------------------------------------------
	// D13 — Fórmula-ownership resolution
	// ---------------------------------------------------------------------------------------

	/**
	 * @param {Actor} actor
	 * @param {Item} formulaItem - the Rote/Fórmula item being cast
	 * @returns {Promise<{item: Item, rating: number, practiceId: string}|null>}
	 */
	static async ResolvePracticeForFormula(actor, formulaItem) {
		const mech = await mechanicsOfAsync(formulaItem);
		const practiceId = mech.practice_id ?? formulaItem?.system?.practice_id ?? "";
		if (!practiceId) return null;

		const item = findPracticeOrSpecialtyItem(actor, practiceId);
		return item ? { item, rating: parseInt(item?.system?.value ?? 0) || 0, practiceId } : null;
	}

	/**
	 * followups design.md D4 — the Do → Artes Marciales maneuver-resolution gap. Resolves the rating
	 * an owned Práctica (base or Especialidad) grants for a plain ability key, without a Fórmula item
	 * in hand — `dialog-item.js`'s `dice2` chain calls this for a `hasprismoffocus` actor before
	 * falling through to the ordinary Ability lookup, which never sees a Práctica Feature item.
	 * @param {Actor} actor
	 * @param {string} abilityKey - e.g. "martialarts"
	 * @returns {{item: Item, rating: number}|null}
	 */
	static ResolvePracticeRating(actor, abilityKey) {
		const practiceId = DICE2_PRACTICE_ID[abilityKey];
		if (!practiceId) return null;
		const item = findPracticeOrSpecialtyItem(actor, practiceId);
		return item ? { item, rating: parseInt(item?.system?.value ?? 0) || 0 } : null;
	}

	/**
	 * D8/task 10.3 — the resistance roll's dice pool for a cast through a corrupted-kind Práctica.
	 * For every corrupted Práctica except Ciencias Infernales, this is simply the corrupted item's
	 * own rating. Ciencias Infernales (A21) is the one exception: it derives from whichever base the
	 * player locked in (`chosen_base_practice_id` — task 10.3's adoption picker), so the pool reads
	 * THAT base item's own rating when it is resolvable, falling back to the corrupted item's own
	 * `value` only if no choice has been locked yet (task 10.3's picker is still showing).
	 * @param {Actor} actor
	 * @param {Item} corruptedItem - an owned item where `kind === "corrupted"`
	 * @returns {number}
	 */
	static ResolveCorruptedResistancePoolRating(actor, corruptedItem) {
		if (getPracticeId(corruptedItem) === "infernal-sciences") {
			const chosenBase = corruptedItem?.system?.chosen_base_practice_id || "";
			const baseItem = chosenBase ? findOwnedPracticeItem(actor, chosenBase) : null;
			if (baseItem) return parseInt(baseItem.system?.value ?? 0) || 0;
		}
		return parseInt(corruptedItem?.system?.value ?? 0) || 0;
	}

	// ---------------------------------------------------------------------------------------
	// D5/D6 — Sanctum anatema + Zonas de Realidad
	// ---------------------------------------------------------------------------------------

	/** Every Sanctum-shaped Background item on the actor (design.md D5/Arreglo #7 — read via the
	 *  actor's EXISTING Background item, matched by name/provenance since a literal `system.id ===
	 *  "sanctum"` does not exist in the shipped corpus: the actual entity is "Sanctum / Laboratorio"
	 *  etc., `flags['wod20-compendium-es'].id` starting with "sanctum-"). Supports more than one
	 *  Sanctum item, per A9's "a Sanctum can enable SEVERAL Prácticas" (not "several Sanctums", but
	 *  nothing stops an actor from holding more than one Sanctum-type Background either). */
	static _sanctumItems(actor) {
		return (actor?.items ?? []).filter((item) => isSanctumBackgroundItem(item));
	}

	/**
	 * D5/D6/A8/A10 — the coupled `dificultad_vulgar`/`paradoja_vulgar` engine. Vulgar-forcing checks
	 * (anatema, negative Zona) take priority over coincidental-forcing checks (an enabled Sanctum
	 * Práctica, positive Zona) when both would otherwise apply to the same cast — a tie-break this
	 * change adopts because "OR into each flag" is not literally well-defined for two conditions that
	 * would set the SAME flag to opposite values (see this change's final report). Both flags start
	 * from the cast's own base vulgarity (the spelltype the caster chose) and are coupled by default;
	 * the three named decouplers (Medicina, Codificación de la Realidad, Tejido) are applied
	 * separately, by their own Práctica-level check, never here.
	 * @param {Actor} actor
	 * @param {{practiceId: string, sphereLevel: number, scene: Scene|null, baseDificultadVulgar: boolean, baseParadojaVulgar: boolean}} params
	 * @returns {{dificultadVulgar: boolean, paradojaVulgar: boolean}}
	 */
	static EvaluateVulgarity(actor, { practiceId, sphereLevel, scene, baseDificultadVulgar, baseParadojaVulgar }) {
		let forcesVulgar = false;
		let forcesCoincidental = false;

		for (const sanctumItem of this._sanctumItems(actor)) {
			const anathema = Array.isArray(sanctumItem?.system?.anathema) ? sanctumItem.system.anathema : [];
			const enabled = Array.isArray(sanctumItem?.system?.enabled_practices) ? sanctumItem.system.enabled_practices : [];

			const anathemaHit = anathema.find((a) => a?.practice_id === practiceId);
			if (anathemaHit && sphereLevel >= parseInt(anathemaHit.rating ?? 99)) forcesVulgar = true; // A8

			if (enabled.some((e) => e?.practice_id === practiceId)) forcesCoincidental = true;
		}

		const zones = scene?.flags?.worldofdarkness?.prismZones ?? [];
		for (const zone of zones) {
			if (zone?.practice_id !== practiceId) continue;
			const value = parseInt(zone.value ?? 0) || 0;
			if (value > 0 && sphereLevel <= value) forcesCoincidental = true; // A10
			if (value < 0 && sphereLevel >= Math.abs(value)) forcesVulgar = true; // A10
		}

		if (forcesVulgar) return { dificultadVulgar: true, paradojaVulgar: true };
		if (forcesCoincidental) return { dificultadVulgar: false, paradojaVulgar: false };
		return { dificultadVulgar: baseDificultadVulgar, paradojaVulgar: baseParadojaVulgar };
	}
}

export { mechanicsOf, mechanicsOfAsync, findOwnedPracticeItem, getPermanentArete, getAbilityRating, getAttributeRating, getAdvantageField };
