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
	provenanceOf
} from "./prism-state-engine.js";
import { AUTO_PRACTICE_RULES, CORRUPTED_PRACTICE_RULES } from "./prism-practice-data.js";
import { getCachedDescription, resolveDescription } from "./compendium-description.js";
import { getMechanicsSync, getMechanicsAsync } from "./prism-mechanics-parser.js";

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
		// dispatch when its shape is a plain checkbox/tiered dice modifier (Feralismo, La Misa
		// Negra, Ciencias Infernales, Demonismo). The three genuinely non-dice-modifier shapes
		// (Abismalismo's Silence floor, Goetia's failure branch, Vamamarga's own Jhor track) return
		// `{modifier: 0}` here by design — `prism-corrupted-helpers.js` exposes their real mechanic.
		const rule = AUTO_PRACTICE_RULES[practiceId]?.[side] ?? CORRUPTED_PRACTICE_RULES[practiceId]?.[side];
		if (!rule) return { modifier: 0 };

		switch (rule.kind) {
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

		for (const item of actor?.items ?? []) {
			if (!isPracticeItem(item)) continue;
			const id = getPracticeId(item);
			const kind = getPracticeKind(item, mechanicsOf);
			const base = kind === "specialty" ? getBasePracticeId(item, mechanicsOf) : id;
			if (id === practiceId || base === practiceId) {
				return { item, rating: parseInt(item?.system?.value ?? 0) || 0, practiceId };
			}
		}
		return null;
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
		return (actor?.items ?? []).filter((item) => {
			if (item?.type !== "Feature" || item?.system?.type !== "wod.types.background") return false;
			const id = provenanceOf(item)?.id ?? "";
			return id.startsWith("sanctum") || /sanctuar?y|sanctum/i.test(item?.name ?? "");
		});
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

export { mechanicsOf, mechanicsOfAsync, findOwnedPracticeItem, getPermanentArete, getAbilityRating };
