/**
 * Chantry/Construct construction Traits, the Realm+Node block, the Personnel block and the census —
 * the RULES ONLY.
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
 * rebuild-chantry-book-of-chantries-only — THE DOSSIER IS RETIRED
 * ============================================================================================
 * This file used to carry TWO tariff systems: the Operative Dossier's 19 linear Traits (a per-dot
 * rate, capped at 2x/1x the Chantry's rating) plus Integrated Effects (a pool keyed off one of
 * those 19 Traits), and El Libro de las Capillas' own 6 table-priced Traits + Realm block. The
 * owner retired the Dossier entirely in this session (proposal.md, design.md D1-D9): no Chantry in
 * production carries Dossier data to reconcile, and Integrated Effects depended on three of the
 * retired Traits with no equivalent in the book. What is left below is ONLY the book's own system,
 * now widened with the pieces this session's re-read of the Appendix Two found missing:
 * Laboratorios (a seventh table-priced Trait), a Node block of its own (independent of the Realm),
 * and a Personnel block (Sirvientes y Acólitos, promoted from the narrative-descriptor catalogue to
 * a proper Trait with a table, because it fixes a real number the way the other six already do).
 *
 * `traitCap()`/`SINGLE_RATING_CAP_TRAITS`/`isSingleRatingCapTrait()` are GONE: with no linear Trait
 * left, there is nothing to cap at 2x/1x any more. `INTEGRATED_EFFECTS_POOL`/`integratedEffectsPool`/
 * `computeEffectCost`/`normaliseEffects`/`evaluateEffects` are GONE with the subsystem they served.
 * `evaluateRosters` (the OLD map-based census reader, `system.traitRosters` -> render-ready groups)
 * is GONE too: it was already dead in this sheet (add-chantry-roster-tab moved the LIVE census onto
 * Items, `evaluateItemRosters` below), kept around only for its own tests. `normaliseRosters` SURVIVES
 * because the one-time migration (`chantry-roster-migration.js`) still reads the legacy
 * `system.traitRosters` map on a world that has not migrated yet — see its own section below for why
 * it takes a SEPARATE key list from the live census.
 *
 * ============================================================================================
 * expand-chantry-node-personnel-and-roster-linking — THE NODE IS REPEATABLE, THE AFORO IS REAL
 * ============================================================================================
 * Two corrections on top of the above (design.md D1/D2). First, `realm.hasNode` (boolean, 0 or 1)
 * is retired for `realm.nodeCount` (integer, 0+): the book prices it "Cada Nodo cuesta cinco
 * puntos" — "Cada" is per-unit, so `computeRealmCost` now charges `REALM_NODE_COST_PER_NODE *
 * nodeCount`. Second, and this is the real defect: `rosterAllowedValues()` used to return each
 * Trait's own dot/level as the census CAPACITY (`guardian`/`staffTier`'s table INDEX, `node`'s old
 * `nodeSize`), which measures POWER or a qualitative RATIO, never a headcount. It now returns the
 * real aforo (`guardian`: 1 if built else 0; `staffTier`: `STAFF_TIER_ROSTER_CAPACITY`, a project
 * table separate from its cost table; `node`: `nodeCount` directly). Because the header's dot
 * circles (`group.rating`) used to read the SAME map, splitting the aforo out required a second,
 * separate flat map for that purely decorative rating — `rosterRatingValues()`, right below
 * `rosterAllowedValues()` — so `staffTier`'s new capacity (up to 20) never gets fed into a
 * `{{#numLoop}}` and drawn as twenty dots.
 */

/**
 * The nine Sphere keys, in English and lower case — the contract fixed by design.md D8 of
 * `add-chantry-inventory-effects-and-roster`, and the same spelling `lang/*.json` already uses
 * under `wod.spheres.*`, so a key here localises with no translation table of its own. Still used
 * by the Realm block's `sphereShifts`.
 * @type {ReadonlyArray<string>}
 */
export const SPHERE_KEYS = Object.freeze([
	"correspondence", "entropy", "forces", "life", "matter", "mind", "prime", "spirit", "time"
]);

/**
 * The THREE Traits/blocks that accept a census today (rebuild-chantry-book-of-chantries-only,
 * design.md/proposal.md): `guardian` (a construction Trait, in `traitcost`), `staffTier` (the
 * Personnel block's own level) and `node` (the book's own Node, `system.realm.nodeSize`). Of the
 * Dossier's original eight (`allies`, `retainers`, `spies`, `backup`, `elders`,
 * `cult-sympathizers`, `library`, `node`), only `node` survives — and it is a DIFFERENT `node`: the
 * book's own, not the Dossier's net-Quintessence Trait, which is retired outright.
 *
 * A key that is not in this list is rejected rather than quietly stored (the "Sin Rasgo asignado"
 * group the census tab renders for it).
 * @type {ReadonlyArray<string>}
 */
export const ROSTER_TRAIT_KEYS = Object.freeze(["guardian", "staffTier", "node"]);

/**
 * The Dossier-era map-carrier's own eight keys (`system.traitRosters`, retired as a LIVE census
 * carrier by `add-chantry-roster-tab`, kept only as the one-time migration's read side). This is
 * DELIBERATELY FROZEN to what it always was, independent of `ROSTER_TRAIT_KEYS` above: the
 * migration's job is to convert whatever a world's OLD `system.traitRosters` map holds — and that
 * map was only ever written with these eight keys, never with `guardian`/`staffTier`/the book's
 * `node` — so narrowing the LIVE census vocabulary must not also narrow what the migration can
 * still find and convert. See `chantry-roster-migration.js`'s own header for the full reasoning.
 * @type {ReadonlyArray<string>}
 */
export const LEGACY_TRAITROSTERS_MAP_KEYS = Object.freeze([
	"allies", "retainers", "spies", "backup", "elders", "cult-sympathizers", "library", "node"
]);

/** Anything to a non-negative integer, so a hand-edited "3 " or a null never becomes NaN. */
function toInt(value) {
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Read `system.traitRosters` into a render-ready shape, dropping any key not in `keys`.
 *
 * `keys` defaults to the LIVE census vocabulary (`ROSTER_TRAIT_KEYS`), but the migration
 * (`chantry-roster-migration.js`) passes `LEGACY_TRAITROSTERS_MAP_KEYS` explicitly: it reads the
 * OLD map carrier, which was only ever written with the Dossier's eight keys, never with the three
 * live ones above.
 * @param {unknown} raw
 * @param {ReadonlyArray<string>} [keys]
 * @returns {Record<string, Array<{name: string, note: string, points: number}>>}
 */
export function normaliseRosters(raw, keys = ROSTER_TRAIT_KEYS) {
	const out = {};
	if (!raw || typeof raw !== "object") return out;

	for (const key of keys) {
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
 * EL ÚNICO SITIO donde se decide `used`, `allowed` y `over` — para el censo de Items
 * `wod.types.connection`, que es el único portador vivo desde `add-chantry-roster-tab`.
 *
 * Que sea uno solo es un requisito, no una comodidad: la lectura «Puntos: 2 / 2» de la pestaña Censo
 * y el aviso de la fila del Rasgo salen de esta función, así que no pueden discrepar.
 * @param {Array<object>} entries  las entradas ya agrupadas de UN Rasgo
 * @param {unknown} allowedValue   el rating que fija el tope (dot count / nivel de tabla, según el Rasgo)
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
 * El censo, leído del portador vivo: entradas ya extraídas de los Items `wod.types.connection` del
 * actor. Devuelve `{entries, used, allowed, over}` por cada una de las TRES claves de
 * `ROSTER_TRAIT_KEYS`, más un cubo `unassigned` para cualquier `relation` que no sea una de ellas.
 *
 * `allowedValues` es un mapa PLANO `{guardian, staffTier, node}` con el rating relevante de cada
 * uno — nunca `system.traits` a secas, porque `staffTier` vive en `system.personnel` y el `node`
 * del libro en `system.realm.nodeSize`, no bajo `system.traits`. El llamante (la hoja) lo construye
 * con `rosterAllowedValues()`, abajo, para que este módulo no tenga que conocer la forma completa
 * del actor.
 * @param {Array<{relation?: string, points?: unknown}>} entries
 * @param {Record<string, unknown>} allowedValues  `{guardian, staffTier, node}`
 * @returns {{groups: Record<string, object>, unassigned: {entries: Array, used: number, allowed: number, over: boolean}}}
 */
export function evaluateItemRosters(entries, allowedValues = {}) {
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
		groups[key] = summariseRoster(byKey.get(key), allowedValues?.[key]);
	}

	return {
		groups: groups,
		// `allowed` es 0 y `over` es false a propósito: estas entradas no se cuentan contra NINGÚN
		// Rasgo, y marcarlas como sobrepasadas diría que consumen algo que no consumen.
		unassigned: { entries: orphans, used: 0, allowed: 0, over: false }
	};
}

/**
 * `staffTier`'s roster CAPACITY table — how many people its census may hold — SEPARATE from
 * `PERSONNEL_STAFF_TIER_LEVELS` (the field's own signed POOL COST). Mixing the two up is exactly
 * the defect `expand-chantry-node-personnel-and-roster-linking` design.md D2 corrects: the level
 * measures a qualitative RATIO ("dos sirvientes por mago", book-of-chantries-es.md:5901-5909), not
 * an absolute headcount the book never gives. This table is a PROJECT decision, requested by the
 * owner, and is never to be cited as if the book gave these numbers.
 * index === level (0 Sin Sirvientes .. 4 Innumerables).
 * @type {ReadonlyArray<number>}
 */
export const STAFF_TIER_ROSTER_CAPACITY = Object.freeze([0, 3, 6, 12, 20]);

/**
 * El mapa PLANO `{guardian, staffTier, node}` de APOROS DEL CENSO (nunca el índice de la tabla de
 * coste del Rasgo) que `evaluateItemRosters` necesita como tope de presupuesto, construido a partir
 * de los TRES bloques que hoy lo guardan.
 *
 * CORREGIDO por `expand-chantry-node-personnel-and-roster-linking` (design.md D2): el nombre y la
 * firma de esta función SOBREVIVEN de `rebuild-chantry-book-of-chantries-only`, pero su cuerpo ya
 * NO devuelve el nivel/dot crudo de cada Rasgo — ese era exactamente el defecto que motiva este
 * cambio (`guardian`/`staffTier` miden PODER o RATIO, nunca un recuento de gente). Ahora:
 *   - `guardian`: 1 si su nivel es > 0 (un guardián nombrado, sea cual sea su poder), si no 0.
 *   - `staffTier`: `STAFF_TIER_ROSTER_CAPACITY[nivel]` — la tabla de aforo del proyecto, arriba.
 *   - `node`: `realm.nodeCount` directamente — D1 ya da la cifra real, no hace falta tabla ninguna.
 * @param {{traits?: Record<string, unknown>, personnel?: Record<string, unknown>, realm?: Record<string, unknown>}} [source]
 * @returns {{guardian: number, staffTier: number, node: number}}
 */
export function rosterAllowedValues({ traits = {}, personnel = {}, realm = {} } = {}) {
	return {
		guardian: toInt(traits?.guardian) > 0 ? 1 : 0,
		staffTier: STAFF_TIER_ROSTER_CAPACITY[toInt(personnel?.staffTier)] ?? 0,
		node: toInt(realm?.nodeCount)
	};
}

/**
 * El mapa PLANO `{guardian, staffTier, node}` de RATING CRUDO — el nivel/dot que la cabecera de
 * cada grupo del censo pinta como círculos (`v3/connections.hbs`'s `group.rating`), DELIBERADAMENTE
 * distinto del aforo que `rosterAllowedValues` calcula arriba.
 *
 * DECISIÓN DE DISEÑO tomada en `expand-chantry-node-personnel-and-roster-linking` por una ambigüedad
 * que la spec no resuelve: antes de este cambio, `rosterAllowedValues` servía las DOS cosas a la vez
 * (rating Y aforo) porque, con el defecto que este cambio corrige, eran el mismo número. Separarlos
 * es OBLIGATORIO ahora que dejan de coincidir — `staffTier` en particular, cuyo aforo nuevo llega a
 * 20, pintaría 20 círculos sólidos en la cabecera si se le diera por rating, un claro roto visual que
 * ningún guard mide hoy. `node` toma `realm.nodeSize` (la magnitud del/los Nodo(s), campo cualitativo
 * sin cambios de D1) y NO `realm.nodeCount`: la etiqueta de esa cabecera es literalmente
 * `wod.chantry.realm.fields.nodesize` («Tamaño del Nodo»), así que sus círculos tienen que seguir
 * siendo el tamaño, no la cuenta — mostrar la cuenta ahí desalinearía la etiqueta del valor.
 * @param {{traits?: Record<string, unknown>, personnel?: Record<string, unknown>, realm?: Record<string, unknown>}} [source]
 * @returns {{guardian: unknown, staffTier: unknown, node: unknown}}
 */
export function rosterRatingValues({ traits = {}, personnel = {}, realm = {} } = {}) {
	return {
		guardian: traits?.guardian,
		staffTier: personnel?.staffTier,
		node: realm?.nodeSize
	};
}

/** Whether a Trait/block key takes a roster at all — the template's own gate. */
export function hasRoster(key) {
	return ROSTER_TRAIT_KEYS.includes(key);
}

/* ================================================================================================
 * EL LIBRO DE LAS CAPILLAS — los SIETE Rasgos con tabla de nivel, `wards`' add-on defensivo,
 * `laboratories`' add-on de Trato Preferencial, el bloque Reino+Nodo y el bloque Personal.
 * Mirrors `wod20-char/web/server/services/rules/chantry.ts` as CLOSELY as the two runtimes let it:
 * same keys, same signed numbers, same "index into a closed table, never extrapolated" discipline.
 *
 * NAMES LIVE IN `lang/*.json`, NOT HERE (`wod.chantry.traitlevels.<key>.<level>`) — this table
 * carries only the numbers a rule needs, the same separation the rest of this system keeps between
 * content (localized strings) and rules (this file).
 * ================================================================================================ */

/** The seven Traits `book-of-chantries-es.md`'s Appendix Two prices as named levels with a signed
 * cost. `laboratories` is new in `rebuild-chantry-book-of-chantries-only` (design.md D6): it fixes
 * a real number (the Areté difficulty to earn study points) exactly as the other six do.
 * @type {ReadonlyArray<string>} */
export const BOOK_OF_CHANTRIES_TRAIT_KEYS = Object.freeze([
	"guardian", "fortification", "wards", "trap-system", "alarm-system", "research-library", "laboratories"
]);

/** `key`'s level-cost table, one signed integer per level, index === level. Never interpolated or
 * extrapolated past the last row — see `bookTraitLevelCost` below. */
export const BOOK_OF_CHANTRIES_LEVEL_COSTS = Object.freeze({
	guardian: Object.freeze([-10, -5, 0, 5, 20]),
	fortification: Object.freeze([-5, 0, 5, 10, 15]),
	wards: Object.freeze([0, 2, 5, 10]),
	"trap-system": Object.freeze([0, 5, 10]),
	"alarm-system": Object.freeze([0, 2, 5, 10]),
	"research-library": Object.freeze([-5, 0, 5, 10, 15]),
	/* Ninguno(-10) / Inadecuados(-5) / Superiores(+5) / Vanguardistas(+10),
	   book-of-chantries-es.md:5854-5865. */
	laboratories: Object.freeze([-10, -5, 5, 10])
});

/** Whether `key` is one of the seven book-of-chantries Traits — the ones priced by table, never by
 * a per-dot rate. */
export function isBookOfChantriesTrait(key) {
	return BOOK_OF_CHANTRIES_TRAIT_KEYS.includes(key);
}

/**
 * `key`'s pool cost at `level`: an index into `BOOK_OF_CHANTRIES_LEVEL_COSTS[key]`.
 *
 * Returns `undefined` for a level outside the table's own range or `null`/`undefined` itself
 * (never THROWS): this is called from a `<select>` whose stored value may be `null` ("not built",
 * a real, distinct state from level 0) or, on a hand-edited/legacy actor, an integer the table does
 * not reach. The caller (`_prepareContext`) degrades an `undefined` result to "unpriced, flagged"
 * rather than letting the render throw.
 * @param {string} key
 * @param {number|null|undefined} level
 * @returns {number|undefined}
 */
export function bookTraitLevelCost(key, level) {
	const table = BOOK_OF_CHANTRIES_LEVEL_COSTS[key];
	if (!table || !Number.isInteger(level) || level < 0 || level >= table.length) return undefined;
	return table[level];
}

/** Pool cost per `wards.defensiveLevels` level ("cada cinco puntos adicionales",
 * book-of-chantries-es.md:5708-5710). */
export const WARDS_DEFENSIVE_POOL_COST_PER_LEVEL = 5;

/** Aggravated damage informed per `wards.defensiveLevels` level — informational, never deducted
 * from anything (same status as any other Trait's flavor text). */
export const WARDS_DEFENSIVE_DAMAGE_PER_LEVEL = 1;

/**
 * `wards.defensiveLevels`' own pool cost and informed damage. The RATING cap (1x) is enforced by
 * the caller (`_prepareContext`), not here, exactly like this whole file prices nothing and only
 * says how high a Trait may legally go.
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

/** `laboratories`' own add-on: "Trato Preferencial", -2 additional, book-of-chantries-es.md:5860. */
export const LABORATORIES_PREFERENTIAL_COST = -2;

/**
 * `laboratoriesPreferential`'s own pool cost: -2 when active, 0 otherwise. A flat boolean add-on,
 * unlike `wards.defensiveLevels` (a per-level stepper) — the book gives it no scale of its own.
 * @param {boolean} active
 * @returns {number}
 */
export function computeLaboratoriesPreferential(active) {
	return active ? LABORATORIES_PREFERENTIAL_COST : 0;
}

/* ---- The Horizon Realm + the book's own Node — a bounded block on the SAME construction pool,
   never a second one. "Todos los aspectos suman o restan a esta cantidad" (book-of-chantries-
   es.md:5480). The Node is a SEPARATE, independent purchase from the Realm (book-of-chantries-
   es.md:5656: "Cada área se compra por separado") sharing the same `system.realm` object only
   because both are optional facility blocks with the same "presence, not value, decides" reading. ---- */

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
/** 10x `size`'s OWN signed cost ONLY. The book's "su coste" (book-of-chantries-es.md:5660-5661)
 * sits inside the "Tamaño" section and refers to `size`'s own cost, NOT the net cost of the whole
 * `realm` block — see `realmQuintessenceUpkeepPerDay` below for the full formula this constant
 * feeds. */
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

/** Each Node costs 5 points ("Cada Nodo cuesta cinco puntos", book-of-chantries-es.md:5480 — the
 * same sentence that fixes `hasRealm`'s own +10, but "Cada" is the word that makes the Node's own
 * figure PER-UNIT: a Chantry may hold several Nodes, `nodeCount` counts them, and this is the
 * per-Node rate (`expand-chantry-node-personnel-and-roster-linking` design.md D1 — `hasNode`, a
 * boolean that could only ever be 0 or 1, is retired for exactly this reason). */
export const REALM_NODE_COST_PER_NODE = 5;

/** `nodeNamed` costs +5 fixed ("Nombrado", book-of-chantries-es.md:5782) — the same Misceláneo
 * refinement any Realm/Node/Chantry can take, unambiguous with a real number. */
export const REALM_NODE_NAMED_COST = 5;

/** The Node's own size table — the SAME 5 named levels `size` uses (Diminuto/Pequeño/Medio/Grande/
 * Enorme), WITHOUT the 6th "Vasto" step, which the book reserves for a Realm only
 * (book-of-chantries-es.md:5662-5673: "Cada área se compra por separado", and only the Realm's own
 * size entry lists a Vasto option). Derived from `REALM_SIZE_LEVELS` rather than a second literal,
 * so the two tables cannot drift out of sync on the four points they share. */
export const REALM_NODE_SIZE_LEVELS = Object.freeze(REALM_SIZE_LEVELS.slice(0, 5));

/** Signed integer parse allowing negatives, unlike this file's own `toInt()` (which floors
 * negatives to 0 — correct for a dot count, wrong for `sphereShifts[].delta`, which is explicitly
 * signed). */
function toSignedInt(value) {
	const n = parseInt(value, 10);
	return Number.isFinite(n) ? n : 0;
}

function tableLevelPoints(table, level) {
	if (!Number.isInteger(level) || level < 0 || level >= table.length) return undefined;
	return table[level].points;
}

function tableLevelUpkeep(table, level) {
	if (!Number.isInteger(level) || level < 0 || level >= table.length) return 0;
	return table[level].upkeep ?? 0;
}

/**
 * `sphereShifts`' pool cost: 2 points per absolute point of `delta`, sign-indifferent — the book's
 * own worked example: Life +2, Time -1, Matter +3 = 2x2 + 2x1 + 2x3 = 12.
 * @param {Array<{sphere?: string, delta?: number}>} sphereShifts
 * @returns {number}
 */
export function computeSphereShiftCost(sphereShifts) {
	if (!Array.isArray(sphereShifts)) return 0;
	return sphereShifts.reduce((sum, s) => sum + REALM_SPHERE_SHIFT_COST_PER_POINT * Math.abs(toSignedInt(s?.delta)), 0);
}

/**
 * The Realm+Node block's net signed cost: the sum of every PRESENT field — a field simply absent
 * (`null`/`undefined`) from `realm` contributes nothing, the same "presence, not value, decides"
 * reading `system.traits` already gives the seven book-of-chantries Traits above. Node fields
 * (`nodeCount`/`nodeSize`/`nodeNamed`) are summed here too — they are an independent purchase from
 * the Realm's own fields, but land in the SAME construction pool, never a second one. `nodeCount` is
 * REPEATABLE (`expand-chantry-node-personnel-and-roster-linking` design.md D1: "Cada Nodo cuesta
 * cinco puntos" prices it PER UNIT, unlike `hasRealm`'s own flat +10), so it contributes
 * `REALM_NODE_COST_PER_NODE * nodeCount`, never a flat toggle amount.
 * `nodeBattery`/`nodeTass` are NEVER summed: the book ties their discount to a Quintessence
 * performance figure it leaves to a Narrator's extended roll, never a tabulated rate — inventing
 * one here would be exactly the error `add-book-of-chantries-traits` already avoided for these two
 * exact fields.
 * @param {object|null|undefined} realm  `system.realm`
 * @returns {number}
 */
export function computeRealmCost(realm) {
	if (!realm || typeof realm !== "object") return 0;

	let cost = 0;
	if (realm.hasRealm) cost += REALM_HAS_REALM_COST;

	const sizePoints = tableLevelPoints(REALM_SIZE_LEVELS, realm.size);
	if (sizePoints !== undefined) cost += sizePoints;

	if (Array.isArray(realm.sphereShifts)) cost += computeSphereShiftCost(realm.sphereShifts);

	const terrainPoints = tableLevelPoints(REALM_TERRAIN_LEVELS, realm.terrain);
	if (terrainPoints !== undefined) cost += terrainPoints;

	const climatePoints = tableLevelPoints(REALM_CLIMATE_LEVELS, realm.climate);
	if (climatePoints !== undefined) cost += climatePoints;

	if (realm.interconnected) cost += REALM_INTERCONNECTED_COST;
	if (realm.advancedTransport) cost += REALM_ADVANCED_TRANSPORT_COST;

	const populationPoints = tableLevelPoints(REALM_POPULATION_LEVELS, realm.population);
	if (populationPoints !== undefined) cost += populationPoints;

	const socialStructurePoints = tableLevelPoints(REALM_SOCIAL_STRUCTURE_LEVELS, realm.socialStructure);
	if (socialStructurePoints !== undefined) cost += socialStructurePoints;

	cost += REALM_NODE_COST_PER_NODE * toInt(realm.nodeCount);

	const nodeSizePoints = tableLevelPoints(REALM_NODE_SIZE_LEVELS, realm.nodeSize);
	if (nodeSizePoints !== undefined) cost += nodeSizePoints;

	if (realm.nodeNamed) cost += REALM_NODE_NAMED_COST;

	return cost;
}

/**
 * The Realm block's Quintessence upkeep/day: reported, NEVER deducted. The Node contributes
 * NOTHING to this figure — the book associates a Node with a Quintessence PERFORMANCE (an extended
 * Narrator roll), never a maintenance cost, and `nodeCount`/`nodeSize`/`nodeNamed` carry no
 * Quintessence/day figure anywhere in the Appendix Two, unlike `size`/`terrain`/`population` on the
 * Realm side, which do.
 *
 * CORRECTED formula (design.md D4 of `add-book-of-chantries-traits`): NOT
 * `REALM_UPKEEP_MULTIPLIER x computeRealmCost()` — that folds in `hasRealm`'s flat +10 and fields
 * the book gives no Quintessence figure for at all (`sphereShifts`/`climate`/`socialStructure`, and
 * now the Node fields too). The correct reading, per book-of-chantries-es.md:5660-5661 ("un Reino
 * requiere 10 veces su coste para mantenerse", inside the "Tamaño" section) plus each field's own
 * cited upkeep column:
 *
 *   10 x max(0, `size`'s OWN cost)
 *   + `terrain`'s own Quintessence/day
 *   + `population`'s own Quintessence/day
 *   + (REALM_INTERCONNECTED_UPKEEP_PER_DAY if `interconnected`)
 *   + (REALM_ADVANCED_TRANSPORT_UPKEEP_PER_DAY if `advancedTransport`)
 *
 * `hasRealm`, `sphereShifts`, `climate`, `socialStructure` and every Node field contribute NOTHING
 * here — the book never associates a Quintessence cost with any of them, only a pool-point one
 * (`computeRealmCost` still charges the pool-point ones, unaffected by this function).
 * @param {object|null|undefined} realm  `system.realm`
 * @returns {number}
 */
export function realmQuintessenceUpkeepPerDay(realm) {
	if (!realm || typeof realm !== "object") return 0;

	let upkeep = 0;

	const sizePoints = tableLevelPoints(REALM_SIZE_LEVELS, realm.size);
	if (sizePoints !== undefined) upkeep += REALM_UPKEEP_MULTIPLIER * Math.max(0, sizePoints);

	upkeep += tableLevelUpkeep(REALM_TERRAIN_LEVELS, realm.terrain);
	upkeep += tableLevelUpkeep(REALM_POPULATION_LEVELS, realm.population);

	if (realm.interconnected) upkeep += REALM_INTERCONNECTED_UPKEEP_PER_DAY;
	if (realm.advancedTransport) upkeep += REALM_ADVANCED_TRANSPORT_UPKEEP_PER_DAY;

	return upkeep;
}

/* ================================================================================================
 * EL BLOQUE PERSONAL (Sirvientes y Acólitos) — rebuild-chantry-book-of-chantries-only, design.md D4.
 *
 * Sustituye a `retainers`/`backup`/`cult-sympathizers`/`elders`/`spies` del Dossier (todos
 * retirados) y promueve `staff-tier`/`staff-loyalty` de descriptor narrativo a Rasgo de pleno
 * derecho con tabla — lo único que les faltaba era un hogar para Militar/Consorte/Sirvientes
 * Hereditarios, que antes vivían como nota de censo sobre Rasgos del Dossier ya retirados.
 * ================================================================================================ */

/** `staffTier`'s 5 named levels (book-of-chantries-es.md:5901-5909): Sin Sirvientes(-10) /
 * Pocos(-5) / Funcional(0) / Muchos(+5) / Innumerables(+10). */
export const PERSONNEL_STAFF_TIER_LEVELS = Object.freeze([-10, -5, 0, 5, 10]);

/** `staffLoyalty`'s 5 named levels (book-of-chantries-es.md:5923-5931): Espías(-10) /
 * Desleales(-5) / Leales(+5) / Comprometidos(+10) / Fanáticos(+15). */
export const PERSONNEL_STAFF_LOYALTY_LEVELS = Object.freeze([-10, -5, 5, 10, 15]);

/** `hereditaryStaff` costs +2 additional (book-of-chantries-es.md:5909). */
export const PERSONNEL_HEREDITARY_STAFF_COST = 2;

/** `military` costs +5 fixed — a single, non-repeatable purchase of "una auténtica fuerza
 * militar" (book-of-chantries-es.md:5900), never a repeatable scale. */
export const PERSONNEL_MILITARY_COST = 5;

/** Each `consorts[].powerLevel` costs 2 points, with no upper bound the book states
 * (book-of-chantries-es.md:5911) — as open as the Realm's own `sphereShifts`. */
export const PERSONNEL_CONSORT_COST_PER_POWER_LEVEL = 2;

/**
 * `consorts`' pool cost: 2 points per power level, summed, with no cap.
 * @param {Array<{powerLevel?: number}>} consorts
 * @returns {number}
 */
export function computeConsortsCost(consorts) {
	if (!Array.isArray(consorts)) return 0;
	return consorts.reduce((sum, c) => sum + PERSONNEL_CONSORT_COST_PER_POWER_LEVEL * toInt(c?.powerLevel), 0);
}

/**
 * `staffTier`/`staffLoyalty`'s own pool cost at `level` — an index into the two flat level tables
 * above, mirroring `bookTraitLevelCost`'s own "never throw, degrade to unpriced" contract.
 * @param {"staffTier"|"staffLoyalty"} field
 * @param {number|null|undefined} level
 * @returns {number|undefined}
 */
export function personnelLevelCost(field, level) {
	const table = field === "staffTier" ? PERSONNEL_STAFF_TIER_LEVELS
		: field === "staffLoyalty" ? PERSONNEL_STAFF_LOYALTY_LEVELS
			: undefined;
	if (!table || !Number.isInteger(level) || level < 0 || level >= table.length) return undefined;
	return table[level];
}

/**
 * The Personnel block's net signed cost: the sum of every PRESENT field, same "presence, not
 * value, decides" reading as the Realm+Node block.
 * @param {object|null|undefined} personnel  `system.personnel`
 * @returns {number}
 */
export function computePersonnelCost(personnel) {
	if (!personnel || typeof personnel !== "object") return 0;

	let cost = 0;

	const staffTierPoints = personnelLevelCost("staffTier", personnel.staffTier);
	if (staffTierPoints !== undefined) cost += staffTierPoints;

	const staffLoyaltyPoints = personnelLevelCost("staffLoyalty", personnel.staffLoyalty);
	if (staffLoyaltyPoints !== undefined) cost += staffLoyaltyPoints;

	if (personnel.hereditaryStaff) cost += PERSONNEL_HEREDITARY_STAFF_COST;
	if (personnel.military) cost += PERSONNEL_MILITARY_COST;

	cost += computeConsortsCost(personnel.consorts);

	return cost;
}
