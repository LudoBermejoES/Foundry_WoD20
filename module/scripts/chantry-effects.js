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
		// One Quintessence per effect per week, drawn from the Node.
		//
		// THE DIRECTION OF THIS COMPARISON IS DELIBERATE -- do not "fix" it. The Node Trait's own
		// description (markdown/mage/m20-the-operative-dossier.md:2797) calls it "la energía
		// sobrante que queda cada semana tras pagar los costes de mantenimiento del Constructo o
		// Capilla", which reads as though the upkeep were already deducted and makes this look
		// inverted. It is not: those are the facility's unquantified running costs, and the rule
		// that governs THIS figure is the Integrated Effects paragraph
		// (markdown/mage/m20-the-operative-dossier.md:2892), which names the Node as the SOURCE
		// the payment comes out of -- "Cada efecto requiere 1 punto de Quintaesencia por semana
		// para mantenerse, que pueden proporcionar los miembros de la Capilla/Constructo, o
		// extraerse de la puntuación de Nodo, si se ha comprado". If the Node were already net of
		// this cost you could not draw this same cost from it, and "si se ha comprado" would mean
		// nothing.
		//
		// A shortfall is a WARNING, never a legality failure: the members are the other source
		// that same sentence names, so they simply pay the difference. Nothing here feeds `valid`.
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
			points: normalisePoints(entry?.points)
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
		out[key] = summariseRoster(rosters[key] ?? [], traitValues?.[key]);
	}

	return out;
}

/**
 * LOS PUNTOS DE UNA ENTRADA, con su regla fina — extraída de `normaliseRosters` para que la lea
 * también el portador nuevo (Items `wod.types.connection`) y la migración, en vez de reimplementarla
 * tres veces.
 *
 * La regla, LITERAL Y CONTRAINTUITIVA (add-chantry-roster-tab, tarea 3.4): un `points` explícito de
 * 0 SOBREVIVE como 0 — "Biblioteca ●●● puede llevar cinco entradas descriptivas de 0 puntos sin
 * romper nada" (D5) — y solo un valor ausente, nulo o vacío pasa a 1.
 *
 * OJO CON LO QUE NO HACE, porque tanto el comentario que estaba aquí antes como la propia spec de
 * `add-chantry-roster-tab` afirman que un valor NO PARSEABLE también pasa a 1, y el código
 * embarcado nunca ha hecho eso: `toInt("lo que sea")` es 0, así que un valor basura vale CERO
 * puntos, no uno. Se conserva el comportamiento embarcado a propósito (cambiarlo movería la
 * contabilidad de puntos de todas las Capillas y no es lo que este cambio hace); queda escrito aquí
 * porque escribir el test desde la frase de la spec, en vez de desde la regla embarcada, es
 * exactamente cómo este proyecto se ha hecho seis tests que afirmaban el defecto.
 * @param {unknown} value
 * @returns {number}
 */
export function normalisePoints(value) {
	return (value === undefined) || (value === null) || (value === "")
		? 1
		: toInt(value);
}

/**
 * EL ÚNICO SITIO donde se decide `used`, `allowed` y `over` — los dos portadores del censo (el mapa
 * `system.traitRosters`, que solo queda para la migración, y los Items `wod.types.connection`, que
 * son el portador desde `add-chantry-roster-tab`) entran los dos por aquí.
 *
 * Que sea uno solo es un requisito, no una comodidad: la lectura «Puntos: 2 / 2» de la pestaña Censo
 * y el aviso de la fila del Rasgo salen de esta función, así que no pueden discrepar.
 * @param {Array<object>} entries  las entradas ya agrupadas de UN Rasgo
 * @param {unknown} allowedValue   el valor del Rasgo (`system.traits[clave]`)
 * @returns {{entries: Array, used: number, allowed: number, over: boolean}}
 */
function summariseRoster(entries, allowedValue) {
	const used = entries.reduce((sum, e) => sum + toInt(e.points), 0);
	const allowed = toInt(allowedValue);

	return {
		entries: entries,
		used: used,
		allowed: allowed,
		over: used > allowed
	};
}

/**
 * Igual que `evaluateRosters` pero desde el portador NUEVO: las entradas del censo ya leídas de los
 * Items `wod.types.connection` del actor. Devuelve la MISMA forma por Rasgo
 * (`{entries, used, allowed, over}`) porque la calcula la misma función.
 *
 * Nada de Foundry entra aquí: el llamante pasa objetos planos `{relation, points, …}` y los campos
 * de más viajan intactos dentro de `entries`, así que la hoja puede meter el propio documento y
 * recuperarlo agrupado.
 *
 * LA NOVENA CLAVE ES DELIBERADA. Una entrada cuyo `relation` no es uno de los ocho Rasgos NO se tira
 * — que es lo que hace `normaliseRosters` con el mapa, y ahí es correcto porque una clave inventada
 * no es un dato de nadie. Aquí sí lo es: es un Item que existe, con su nombre y su descripción, y
 * `system.relation` se teclea a mano en la hoja del objeto (D2.5). Perderlo de vista sería la forma
 * recurrente «un valor aceptado que silenciosamente no hace nada», así que sale en `unassigned`, no
 * suma a ningún Rasgo, y la pestaña lo pinta en un grupo visible con aviso.
 * @param {Array<{relation?: string, points?: unknown}>} entries
 * @param {Record<string, number>} traitValues  `system.traits`
 * @returns {{groups: Record<string, object>, unassigned: {entries: Array, used: number, allowed: number, over: boolean}}}
 */
export function evaluateItemRosters(entries, traitValues = {}) {
	const list = Array.isArray(entries) ? entries : [];
	const byKey = new Map(ROSTER_TRAIT_KEYS.map((key) => [key, []]));
	const orphans = [];

	for (const entry of list) {
		const relation = typeof entry?.relation === "string" ? entry.relation : "";
		if (byKey.has(relation)) {
			byKey.get(relation).push(entry);
		}
		else {
			orphans.push(entry);
		}
	}

	const groups = {};

	for (const key of ROSTER_TRAIT_KEYS) {
		groups[key] = summariseRoster(byKey.get(key), traitValues?.[key]);
	}

	return {
		groups: groups,
		// `allowed` es 0 y `over` es false a propósito: estas entradas no se cuentan contra NINGÚN
		// Rasgo, y marcarlas como sobrepasadas diría que consumen algo que no consumen.
		unassigned: { entries: orphans, used: 0, allowed: 0, over: false }
	};
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

/* ================================================================================================
 * add-book-of-chantries-traits — the six NAMED-LEVEL Traits, `wards`' defensive add-on and the
 * Horizon Realm block. Mirrors `wod20-char/web/server/services/rules/chantry.ts` (design.md
 * D2/D3/D4/D8/D10/D11/D12 of that change) as CLOSELY as the two runtimes let it: same keys, same
 * signed numbers, same "index into a closed table, never extrapolated" discipline this file's own
 * `integratedEffectsPool()` already established above. This is a SEPARATE table from `traitcost`
 * (above) rather than a widening of it, on purpose: `traitcost` is a PER-DOT rate multiplied by a
 * circle count, and these six Traits have no such rate — level 0 is a real, named, priced choice
 * ("Sin Guardián", -10), not "zero dots of a linear Trait". Folding them into `traitcost` would
 * also enrol them in `test-chantry-trait-eye.mjs`'s per-key `traitdescriptions` requirement and in
 * `test-chantry-trait-order.mjs`'s alphabetical-dot-list sort, neither of which fits a level select.
 *
 * NAMES LIVE IN `lang/*.json`, NOT HERE (`wod.chantry.traitlevels.<key>.<level>`) — this table
 * carries only the numbers a rule needs, the same separation the rest of this system keeps between
 * content (localized strings) and rules (this file).
 * ================================================================================================ */

/** The six Traits `book-of-chantries-es.md`'s Appendix Two prices as named levels with a signed
 * cost (design.md D2). @type {ReadonlyArray<string>} */
export const BOOK_OF_CHANTRIES_TRAIT_KEYS = Object.freeze([
	"guardian", "fortification", "wards", "trap-system", "alarm-system", "research-library"
]);

/** `key`'s level-cost table, one signed integer per level, index === level (design.md D2/D3). Never
 * interpolated or extrapolated past the last row — see `bookTraitLevelCost` below. */
export const BOOK_OF_CHANTRIES_LEVEL_COSTS = Object.freeze({
	guardian: Object.freeze([-10, -5, 0, 5, 20]),
	fortification: Object.freeze([-5, 0, 5, 10, 15]),
	wards: Object.freeze([0, 2, 5, 10]),
	"trap-system": Object.freeze([0, 5, 10]),
	"alarm-system": Object.freeze([0, 2, 5, 10]),
	"research-library": Object.freeze([-5, 0, 5, 10, 15])
});

/** Whether `key` is one of the six book-of-chantries Traits — the ones priced by table, never by
 * the 2x/1x rating cap (design.md D3): `traitCap()` above is never called for one of these. */
export function isBookOfChantriesTrait(key) {
	return BOOK_OF_CHANTRIES_TRAIT_KEYS.includes(key);
}

/**
 * `key`'s pool cost at `level`: an index into `BOOK_OF_CHANTRIES_LEVEL_COSTS[key]`.
 *
 * Returns `undefined` for a level outside the table's own range or `null`/`undefined` itself
 * (never THROWS): unlike `integratedEffectsPool()`, which is only ever called with a value the
 * sheet already renders as a filled dot count, this is called from a `<select>` whose stored value
 * may be `null` ("not built", design.md D11/D12 — a real, distinct state from level 0) or, on a
 * hand-edited/legacy actor, an integer the table does not reach. The caller (`_prepareContext`)
 * degrades an `undefined` result to "unpriced, flagged" rather than letting the render throw.
 * @param {string} key
 * @param {number|null|undefined} level
 * @returns {number|undefined}
 */
export function bookTraitLevelCost(key, level) {
	const table = BOOK_OF_CHANTRIES_LEVEL_COSTS[key];
	if (!table || !Number.isInteger(level) || level < 0 || level >= table.length) return undefined;
	return table[level];
}

/** Pool cost per `wards.defensiveLevels` level (design.md D8: `book-of-chantries-es.md:5708-5710`,
 * "cada cinco puntos adicionales"). */
export const WARDS_DEFENSIVE_POOL_COST_PER_LEVEL = 5;

/** Aggravated damage informed per `wards.defensiveLevels` level — informational, never deducted
 * from anything (same status as any other Trait's flavor text). */
export const WARDS_DEFENSIVE_DAMAGE_PER_LEVEL = 1;

/**
 * `wards.defensiveLevels`' own pool cost and informed damage. The RATING cap (1x, design.md D8 —
 * the one figure of this whole change the book leaves unbounded, and the one finding of its own
 * cost audit) is enforced by the caller (`_prepareContext`), not here, exactly like `traitCap()`
 * above prices nothing and only says how high a Trait may legally go.
 * @param {number} defensiveLevels
 * @returns {{cost: number, aggravatedDamage: number}}
 */
export function computeWardsDefensiveWards(defensiveLevels) {
	const n = toInt(defensiveLevels);
	return {
		cost: n * WARDS_DEFENSIVE_POOL_COST_PER_LEVEL,
		aggravatedDamage: n * WARDS_DEFENSIVE_DAMAGE_PER_LEVEL
	};
}

/* ---- The Horizon Realm — a bounded block on the SAME construction pool, never a second one
   (design.md D4). "Todos los aspectos suman o restan a esta cantidad" (book-of-chantries-
   es.md:5480). ---- */

export const REALM_HAS_REALM_COST = 10;
export const REALM_INTERCONNECTED_COST = 10;
export const REALM_ADVANCED_TRANSPORT_COST = 10;
export const REALM_SPHERE_SHIFT_COST_PER_POINT = 2;
/** Quintessence/day `interconnected` adds to the upkeep formula — DISTINCT from
 * `REALM_INTERCONNECTED_COST` (pool points): the book prices the same boolean twice, once in
 * construction points (10) and once in daily upkeep (5). */
export const REALM_INTERCONNECTED_UPKEEP_PER_DAY = 5;
/** Quintessence/day `advancedTransport` adds to the upkeep formula — happens to equal
 * `REALM_ADVANCED_TRANSPORT_COST` (10) but kept as a separate constant on purpose (same reasoning
 * as `REALM_INTERCONNECTED_UPKEEP_PER_DAY`'s own comment). */
export const REALM_ADVANCED_TRANSPORT_UPKEEP_PER_DAY = 10;
/** 10x `size`'s OWN signed cost ONLY (design.md D4, corrected 2026-09-08 after a Task 4 finding: a
 * Vast Realm alone was reporting 500/day instead of the book's own 400 before this correction).
 * The book's "su coste" (book-of-chantries-es.md:5660-5661) sits inside the "Tamaño" section and
 * refers to `size`'s own cost, NOT the net cost of the whole `realm` block — see
 * `realmQuintessenceUpkeepPerDay` below for the full formula this constant feeds. */
export const REALM_UPKEEP_MULTIPLIER = 10;

/** `size`'s 6 named levels (book-of-chantries-es.md:5662-5672) — names in `lang/*.json` under
 * `wod.chantry.realm.levels.size.<level>`. */
export const REALM_SIZE_LEVELS = Object.freeze([
	{ points: -10 }, { points: -5 }, { points: 5 }, { points: 10 }, { points: 15 }, { points: 40 }
]);

/** `terrain`'s 7 named levels (book-of-chantries-es.md:5796-5806), each with its own Quintessence/
 * day upkeep figure — the ONLY field besides `size`/`population`/the two booleans that contributes
 * to `realmQuintessenceUpkeepPerDay`. */
export const REALM_TERRAIN_LEVELS = Object.freeze([
	{ points: 0, upkeep: 0 },
	{ points: 5, upkeep: 0 },
	{ points: -5, upkeep: 15 },
	{ points: 5, upkeep: 5 },
	{ points: 10, upkeep: 10 },
	{ points: 10, upkeep: 15 },
	{ points: 10, upkeep: 10 }
]);

/** `climate`'s 4 named levels (book-of-chantries-es.md:5810-5816) — no Quintessence upkeep figure
 * anywhere in the book for this field. */
export const REALM_CLIMATE_LEVELS = Object.freeze([
	{ points: -10 }, { points: -5 }, { points: 0 }, { points: 5 }
]);

/** `population`'s 6 named levels (book-of-chantries-es.md:5874-5882) — only its top level carries a
 * Quintessence/day figure. */
export const REALM_POPULATION_LEVELS = Object.freeze([
	{ points: -5 },
	{ points: -10 },
	{ points: -10 },
	{ points: 5 },
	{ points: 10 },
	{ points: 15, upkeep: 15 }
]);

/** `socialStructure`'s 4 named levels (book-of-chantries-es.md:5884-5894) — no Quintessence upkeep
 * figure anywhere in the book for this field. */
export const REALM_SOCIAL_STRUCTURE_LEVELS = Object.freeze([
	{ points: -5 }, { points: 0 }, { points: 5 }, { points: 10 }
]);

/** Signed integer parse allowing negatives, unlike this file's own `toInt()` (which floors
 * negatives to 0 — correct for a dot count, wrong for `sphereShifts[].delta`, which is explicitly
 * signed, design.md D4/D5). */
function toSignedInt(value) {
	const n = parseInt(value, 10);
	return Number.isFinite(n) ? n : 0;
}

function realmLevelPoints(table, level) {
	if (!Number.isInteger(level) || level < 0 || level >= table.length) return undefined;
	return table[level].points;
}

function realmLevelUpkeep(table, level) {
	if (!Number.isInteger(level) || level < 0 || level >= table.length) return 0;
	return table[level].upkeep ?? 0;
}

/**
 * `sphereShifts`' pool cost: 2 points per absolute point of `delta`, sign-indifferent (design.md
 * D4/D5) — the book's own worked example: Life +2, Time -1, Matter +3 = 2x2 + 2x1 + 2x3 = 12.
 * @param {Array<{sphere?: string, delta?: number}>} sphereShifts
 * @returns {number}
 */
export function computeSphereShiftCost(sphereShifts) {
	if (!Array.isArray(sphereShifts)) return 0;
	return sphereShifts.reduce((sum, s) => sum + REALM_SPHERE_SHIFT_COST_PER_POINT * Math.abs(toSignedInt(s?.delta)), 0);
}

/**
 * The Realm block's net signed cost: the sum of every PRESENT field (design.md D4). A field simply
 * absent (`null`/`undefined`) from `realm` contributes nothing — the same "presence, not value,
 * decides" reading `system.traits` already gives the six book-of-chantries Traits above.
 * @param {object|null|undefined} realm  `system.realm`
 * @returns {number}
 */
export function computeRealmCost(realm) {
	if (!realm || typeof realm !== "object") return 0;

	let cost = 0;
	if (realm.hasRealm) cost += REALM_HAS_REALM_COST;

	const sizePoints = realmLevelPoints(REALM_SIZE_LEVELS, realm.size);
	if (sizePoints !== undefined) cost += sizePoints;

	if (Array.isArray(realm.sphereShifts)) cost += computeSphereShiftCost(realm.sphereShifts);

	const terrainPoints = realmLevelPoints(REALM_TERRAIN_LEVELS, realm.terrain);
	if (terrainPoints !== undefined) cost += terrainPoints;

	const climatePoints = realmLevelPoints(REALM_CLIMATE_LEVELS, realm.climate);
	if (climatePoints !== undefined) cost += climatePoints;

	if (realm.interconnected) cost += REALM_INTERCONNECTED_COST;
	if (realm.advancedTransport) cost += REALM_ADVANCED_TRANSPORT_COST;

	const populationPoints = realmLevelPoints(REALM_POPULATION_LEVELS, realm.population);
	if (populationPoints !== undefined) cost += populationPoints;

	const socialStructurePoints = realmLevelPoints(REALM_SOCIAL_STRUCTURE_LEVELS, realm.socialStructure);
	if (socialStructurePoints !== undefined) cost += socialStructurePoints;

	return cost;
}

/**
 * The Realm block's Quintessence upkeep/day: reported, NEVER deducted (design.md D4) — same pattern
 * as `upkeep`/`upkeepshortfall` against `node` in `evaluateEffects` above.
 *
 * CORRECTED formula (design.md D4, 2026-09-08): NOT `REALM_UPKEEP_MULTIPLIER x computeRealmCost()`
 * — that folds in `hasRealm`'s flat +10 and fields the book gives no Quintessence figure for at all
 * (`sphereShifts`/`climate`/`socialStructure`). The correct reading, per book-of-chantries-
 * es.md:5660-5661 ("un Reino requiere 10 veces su coste para mantenerse", inside the "Tamaño"
 * section) plus each field's own cited upkeep column:
 *
 *   10 x max(0, `size`'s OWN cost)
 *   + `terrain`'s own Quintessence/day
 *   + `population`'s own Quintessence/day
 *   + (REALM_INTERCONNECTED_UPKEEP_PER_DAY if `interconnected`)
 *   + (REALM_ADVANCED_TRANSPORT_UPKEEP_PER_DAY if `advancedTransport`)
 *
 * `hasRealm`, `sphereShifts`, `climate` and `socialStructure` contribute NOTHING here — the book
 * never associates a Quintessence cost with any of them, only a pool-point one (`computeRealmCost`
 * still charges all four in points, unaffected by this function).
 * @param {object|null|undefined} realm  `system.realm`
 * @returns {number}
 */
export function realmQuintessenceUpkeepPerDay(realm) {
	if (!realm || typeof realm !== "object") return 0;

	let upkeep = 0;

	const sizePoints = realmLevelPoints(REALM_SIZE_LEVELS, realm.size);
	if (sizePoints !== undefined) upkeep += REALM_UPKEEP_MULTIPLIER * Math.max(0, sizePoints);

	upkeep += realmLevelUpkeep(REALM_TERRAIN_LEVELS, realm.terrain);
	upkeep += realmLevelUpkeep(REALM_POPULATION_LEVELS, realm.population);

	if (realm.interconnected) upkeep += REALM_INTERCONNECTED_UPKEEP_PER_DAY;
	if (realm.advancedTransport) upkeep += REALM_ADVANCED_TRANSPORT_UPKEEP_PER_DAY;

	return upkeep;
}
