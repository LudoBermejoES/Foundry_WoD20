/**
 * Chantry/Construct Integrated Effects, Trait rosters and the per-Trait cap — the RULES ONLY.
 *
 * ============================================================================================
 * WHY THIS IS A SEPARATE FILE WITH NO FOUNDRY IN IT
 * ============================================================================================
 * Nothing below touches `game`, `CONFIG`, `ui`, a document or a template. That is deliberate and
 * it is the whole reason the file exists: `tests/chantry-effects.test.mjs` imports it directly and
 * runs the book's own worked examples against it under plain `node --test`, with no Foundry stub
 * and no sandbox. A rule that lives inside the sheet class can only be checked by rendering a
 * sheet; a rule that lives here is checked by arithmetic.
 *
 * The sheet (`module/actor/template/chantry-actor-sheet-v2.js`) is the only caller. It formats and
 * localises; it decides nothing.
 *
 * ============================================================================================
 * THE SOURCE, AND WHY THE POOL IS A TABLE AND NOT A FORMULA
 * ============================================================================================
 * `m20-the-operative-dossier`, "Estatus y el Constructo", the Integrated Effects row — reproduced
 * verbatim in `webgen/data/entities/mage.json`'s `chantry-integrated-effects.mechanics.ratings`
 * ("Cuatro puntos.", "Ocho puntos.", "Quince puntos." …). The ten values are 4, 8, 15, 20, 25, 35,
 * 45, 55, 70, 90 and they are NOT linear (add-chantry-inventory-effects-and-roster design.md D2):
 * the first three steps are +4, +7, +5. There is no formula to interpolate, so above the tabulated
 * ten circles this THROWS instead of guessing — an explicit error beats a silently invented pool.
 *
 * The two worked examples in the same passage are the test fixtures, quoted rather than paraphrased:
 *   "un efecto de Mente 2 que calme a todos los que entren en la Capilla costaría 2 puntos"
 *   "una bola de fuego de Fuerzas 3 / Cardinal 2 / Vida 1 / Materia 1 / Tiempo 4 … costaría 11"
 */

/**
 * Points of Effect pool granted by 1…10 circles of the `integrated-effects` construction Trait.
 * Index 0 is one circle. Zero circles grants no pool at all and is not in the table.
 * @type {ReadonlyArray<number>}
 */
export const INTEGRATED_EFFECTS_POOL = Object.freeze([4, 8, 15, 20, 25, 35, 45, 55, 70, 90]);

/**
 * The nine Sphere keys, in English and lower case — the contract fixed by design.md D8, and the
 * same spelling `lang/*.json` already uses under `wod.spheres.*`, so a key here localises with no
 * translation table of its own.
 * @type {ReadonlyArray<string>}
 */
export const SPHERE_KEYS = Object.freeze([
	"correspondence", "entropy", "forces", "life", "matter", "mind", "prime", "spirit", "time"
]);

/**
 * The eight construction Traits that accept a roster (design.md D5). The other Traits are
 * MAGNITUDES, not collections: `resources` is money, `arcane-cloaking` is a penalty, `reality-zone`
 * / `enhancement` / `requisitions` are ceilings, and `integrated-effects` has its own point table
 * instead. A key that is not in this list is rejected rather than quietly stored.
 * @type {ReadonlyArray<string>}
 */
export const ROSTER_TRAIT_KEYS = Object.freeze([
	"allies", "retainers", "spies", "backup", "elders", "cult-sympathizers", "library", "node"
]);

/**
 * The Traits whose cap is the Chantry's rating ONCE, not twice (design.md D7).
 *
 * Zona de Realidad's own entry in the Dossier's table says it outright — "Este rasgo no puede ser
 * superior a la puntuación de la Capilla/Constructo" — while the general rule for every other Trait
 * is twice the rating. The sheet applied `rating * 2` to all fourteen; wodchar had it right all
 * along (`server/services/rules/chantry.ts`'s own `SINGLE_RATING_CAP_TRAITS`), and the written
 * requirement was the thing that was wrong.
 * @type {ReadonlySet<string>}
 */
export const SINGLE_RATING_CAP_TRAITS = Object.freeze(new Set(["reality-zone"]));

/** Anything to a non-negative integer, so a hand-edited "3 " or a null never becomes NaN. */
function toInt(value) {
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The cap a single construction Trait may not exceed.
 * @param {string} key   a `CONFIG.worldofdarkness.chantry.traitcost` key
 * @param {number} rating the Chantry/Construct's own rating
 * @returns {number} the highest legal value for that Trait (0 when the Chantry has no rating yet,
 *                   which the caller reads as "no cap to compare against")
 */
export function traitCap(key, rating) {
	const r = toInt(rating);
	return SINGLE_RATING_CAP_TRAITS.has(key) ? r : r * 2;
}

/**
 * Points of Effect pool for a given `integrated-effects` rating.
 * @param {number} rating 0…10
 * @returns {number} 0 for a rating of 0
 * @throws {RangeError} above 10 — the table's own ceiling. See this file's header.
 */
export function integratedEffectsPool(rating) {
	const r = toInt(rating);
	if (r === 0) return 0;
	if (r > INTEGRATED_EFFECTS_POOL.length) {
		throw new RangeError(
			`integrated-effects rating ${r} is beyond the ${INTEGRATED_EFFECTS_POOL.length} the ` +
			`Operative Dossier tabulates; the table is not linear, so there is nothing to ` +
			`extrapolate from`);
	}
	return INTEGRATED_EFFECTS_POOL[r - 1];
}

/**
 * The cost of one Effect: the SUM OF ITS SPHERE LEVELS, one point per level.
 * @param {Array<{sphere?: string, level?: number}>} spheres
 * @returns {number}
 */
export function computeEffectCost(spheres) {
	if (!Array.isArray(spheres)) return 0;
	return spheres.reduce((sum, s) => sum + toInt(s?.level), 0);
}

/**
 * Read `system.integratedEffects` into a shape the sheet can render without any `?.` of its own.
 * Tolerant on purpose: this data arrives from the wodchar exporter and from hand edits, and an
 * absent key, a null, a string where an array belongs or a Sphere outside the nine must all degrade
 * to something renderable rather than throwing on a sheet render (7.5.129's whole failure class).
 *
 * A `cost` that arrives on the stored data is DISCARDED — cost is computed, never read back, so the
 * two can never drift (spec: "SHALL NOT be stored as a second copy that can drift from them").
 * @param {unknown} raw
 * @returns {Array<{name: string, description: string, spheres: Array<{sphere: string, level: number}>}>}
 */
export function normaliseEffects(raw) {
	if (!Array.isArray(raw)) return [];

	return raw.map((entry) => ({
		name: typeof entry?.name === "string" ? entry.name : "",
		description: typeof entry?.description === "string" ? entry.description : "",
		spheres: (Array.isArray(entry?.spheres) ? entry.spheres : []).map((s) => ({
			sphere: SPHERE_KEYS.includes(s?.sphere) ? s.sphere : "",
			level: toInt(s?.level)
		}))
	}));
}

/**
 * The whole Integrated Effects picture for one Chantry, with every figure derived.
 *
 * Three rules from the same passage, all three verifiable and therefore all three enforced here
 * (design.md D2):
 *   1. SPHERE CAP = THE CHANTRY'S RATING. "Estos efectos usan la puntuación de Capilla/Constructo
 *      como Areté/Iluminación, lo que limita el acceso a las puntuaciones de Esfera que pueden
 *      emplearse normalmente." A Tiempo 4 in a rating-3 Chantry is illegal, and the offending
 *      Sphere is named rather than the row merely flagged.
 *   2. UPKEEP = 1 Quintessence per week PER EFFECT, which may come out of the `node` Trait. Shown
 *      and compared; never spent (proposal.md "Qué NO").
 *   3. REALITY ZONE 0 makes the effects VULGAR, not illegal. A warning, never a block — the book
 *      conditions coincidence, not existence.
 *
 * @param {unknown} rawEffects            `system.integratedEffects`
 * @param {object}  traits
 * @param {number}  traits.rating         the Chantry/Construct's rating (the Sphere cap)
 * @param {number}  traits.effectsRating  the `integrated-effects` Trait's own circles
 * @param {number}  traits.nodeRating     the `node` Trait's circles
 * @param {number}  traits.realityZone    the `reality-zone` Trait's circles
 * @returns {object} everything the template prints, and nothing it has to compute
 */
export function evaluateEffects(rawEffects, { rating = 0, effectsRating = 0, nodeRating = 0, realityZone = 0 } = {}) {
	const spherecap = toInt(rating);
	const effects = normaliseEffects(rawEffects);

	let pool = 0;
	let pooloverflow = false;

	try {
		pool = integratedEffectsPool(effectsRating);
	}
	catch (err) {
		// Above the tabulated ten. Report it as a state the sheet can render rather than letting it
		// take the render down — the pool is unknown, which is exactly what `pooloverflow` says.
		pooloverflow = true;
	}

	const rows = effects.map((effect, index) => {
		const spheres = effect.spheres.map((s) => ({
			sphere: s.sphere,
			level: s.level,
			overcap: spherecap > 0 && s.level > spherecap
		}));

		return {
			index: index,
			name: effect.name,
			description: effect.description,
			spheres: spheres,
			cost: computeEffectCost(spheres),
			// The row is marked when ANY of its Spheres is over the rating-derived cap.
			overcap: spheres.some((s) => s.overcap)
		};
	});

	const spent = rows.reduce((sum, row) => sum + row.cost, 0);
	const upkeep = rows.length;

	return {
		rows: rows,
		count: rows.length,
		pool: pool,
		pooloverflow: pooloverflow,
		spent: spent,
		remaining: pool - spent,
		overspent: !pooloverflow && spent > pool,
		spherecap: spherecap,
		// One Quintessence per effect per week, against whatever the Node produces.
		upkeep: upkeep,
		node: toInt(nodeRating),
		upkeepshortfall: Math.max(0, upkeep - toInt(nodeRating)),
		// Legal but vulgar (rule 3). Only worth saying when there is something to make vulgar.
		vulgar: upkeep > 0 && toInt(realityZone) === 0
	};
}

/**
 * Read `system.traitRosters` into the same kind of render-ready shape, dropping any key that is not
 * one of the eight (design.md D5 — "cualquier otra se rechaza").
 * @param {unknown} raw
 * @returns {Record<string, Array<{name: string, note: string, points: number}>>}
 */
export function normaliseRosters(raw) {
	const out = {};
	if (!raw || typeof raw !== "object") return out;

	for (const key of ROSTER_TRAIT_KEYS) {
		const entries = raw[key];
		if (!Array.isArray(entries)) continue;

		out[key] = entries.map((entry) => ({
			name: typeof entry?.name === "string" ? entry.name : "",
			note: typeof entry?.note === "string" ? entry.note : "",
			// A 0-point entry is LEGAL and load-bearing: "Biblioteca ●●● puede llevar cinco entradas
			// descriptivas de 0 puntos sin romper nada" (D5). So this is not `|| 1` — an explicit 0
			// survives, and only an absent/unparseable value defaults to one point.
			points: entry?.points === undefined || entry?.points === null || entry?.points === ""
				? 1
				: toInt(entry.points)
		}));
	}

	return out;
}

/**
 * Roster totals per Trait, validated BY POINTS rather than by row count (design.md D5): Σ points ≤
 * that Trait's circles. Aliados ●● therefore takes two one-point allies OR one exceptional
 * two-point ally, which is the reasonable reading of "un aliado excepcional por punto".
 * @param {unknown} rawRosters   `system.traitRosters`
 * @param {Record<string, number>} traitValues  `system.traits`
 * @returns {Record<string, {entries: Array, used: number, allowed: number, over: boolean}>}
 */
export function evaluateRosters(rawRosters, traitValues = {}) {
	const rosters = normaliseRosters(rawRosters);
	const out = {};

	for (const key of ROSTER_TRAIT_KEYS) {
		const entries = rosters[key] ?? [];
		const used = entries.reduce((sum, e) => sum + toInt(e.points), 0);
		const allowed = toInt(traitValues?.[key]);

		out[key] = {
			entries: entries,
			used: used,
			allowed: allowed,
			over: used > allowed
		};
	}

	return out;
}

/**
 * Whether this Trait's cap is the rating ONCE rather than twice (design.md D7). A predicate rather
 * than exporting the Set for callers to `.has()` on, so the rule reads the same everywhere and the
 * Set stays this module's own business.
 */
export function isSingleRatingCapTrait(key) {
	return SINGLE_RATING_CAP_TRAITS.has(key);
}

/** Whether a Trait key takes a roster at all — the template's own gate. */
export function hasRoster(key) {
	return ROSTER_TRAIT_KEYS.includes(key);
}
