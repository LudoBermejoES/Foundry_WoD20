/**
 * EL CENSO DE LA CAPILLA/CONSTRUCTO — lo que la hoja de Capilla necesita para reutilizar el censo de
 * relaciones del PJ sin heredar su clase (add-chantry-roster-tab, D2).
 *
 * ============================================================================================
 * POR QUÉ ESTE FICHERO EXISTE, Y POR QUÉ NO IMPORTA `connection-groups.js`
 * ============================================================================================
 * `buildConnectionGroups` (`module/scripts/connection-groups.js`) construye los grupos y, desde este
 * cambio, acepta un RESOLVEDOR DE GRUPO inyectable. Aquí vive el resolvedor de la Capilla y nada
 * más: la etiqueta y los círculos, el marcador de retrato por Rasgo, y la decoración con los puntos.
 *
 * Y NO importa a `connection-groups.js` a propósito, aunque sea su único consumidor: así el cierre
 * de importación de este fichero es `chantry-effects.js` y nada más, o sea nada de Foundry salvo
 * `game.i18n.localize`. Eso es lo que permite que `tests/chantry-census.test.mjs` lo ejecute bajo
 * `node --test` con tres líneas de stub, en vez de montar media aplicación. La hoja es la que une
 * las dos mitades (`buildConnectionGroups(actor, censusOptions(...))`), que es también donde se ve
 * de un vistazo qué se comparte y qué es propio.
 *
 * ============================================================================================
 * LOS DOS MARCADORES DE RETRATO, Y POR QUÉ SON DOS
 * ============================================================================================
 * El censo del PJ tiene UN marcador, `icons/svg/mystery-man.svg`, una silueta humana — correcto para
 * sus 18 Trasfondos con forma de gente. Los ocho Rasgos con censo de una Capilla NO son ocho grupos
 * de gente: `library` es una colección de grimorios y `node` una de fuentes de Quintaesencia (D4,
 * adaptación 1), y una silueta humana para un libro es una mentira visual.
 *
 * EL SEGUNDO MARCADOR ESTÁ COMPROBADO, no supuesto, que es lo que el requisito pide («a path
 * verified to exist before it ships»):
 *   * `assets/img/items/feature.svg` EXISTE en este fork — y el `design.md` de este cambio se
 *     equivoca al decir que `assets/img/items/` tiene cuatro ficheros: tiene 36 (medido).
 *   * y no es un fichero huérfano: `assets/data/splats/*.json` lo usa ya como `img` de los Items
 *     `Feature` que siembra, así que se despliega y se sabe que se pinta.
 *   * y una entrada del censo ES un Item `Feature`, así que caer al glifo genérico de Feature de
 *     este sistema es coherente, no arbitrario.
 * `tests/chantry-census.test.mjs` comprueba con `fs.existsSync` que la ruta sigue estando ahí, para
 * que «comprobado» no dependa de que alguien se acuerde.
 */

import { ROSTER_TRAIT_KEYS, evaluateItemRosters, normalisePoints } from "./chantry-effects.js";

/** El marcador del censo del PJ: una silueta humana. Correcto para los seis Rasgos que son gente. */
export const CENSUS_PERSON_PLACEHOLDER = "icons/svg/mystery-man.svg";

/**
 * El marcador de los Rasgos que NO son gente. `systems/worldofdarkness/` porque una ruta de asset de
 * sistema se sirve desde ahí, igual que en `assets/data/splats/*.json`.
 */
export const CENSUS_HOLDING_PLACEHOLDER = "systems/worldofdarkness/assets/img/items/feature.svg";

/** Los Rasgos con censo que son colecciones de COSAS y no de personas (D4). */
export const NON_PERSON_ROSTER_TRAITS = Object.freeze(["library", "node"]);

/**
 * El marcador de retrato de una entrada sin retrato propio, POR RASGO.
 * @param {string} relation clave del Rasgo
 * @returns {string}
 */
export function censusPlaceholderFor(relation) {
	return NON_PERSON_ROSTER_TRAITS.includes(relation)
		? CENSUS_HOLDING_PLACEHOLDER
		: CENSUS_PERSON_PLACEHOLDER;
}

/**
 * EL RESOLVEDOR DE GRUPO DE LA CAPILLA (D2.1).
 *
 * El del PJ busca un Item Trasfondo con `flags["wod20-char"].id === relation` y saca de él la
 * etiqueta y los círculos. UNA CAPILLA NO TIENE NI UN SOLO ITEM TRASFONDO — sus Rasgos son números
 * bajo `system.traits` — así que por ese camino cada grupo saldría titulado con la cadena cruda
 * («allies») y con `rating: null`, o sea sin círculos.
 *
 * Aquí la etiqueta sale de `wod.chantry.traits.<clave>` (existe para las 19 claves) y los círculos de
 * `system.traits[clave]`.
 *
 * UNA CLAVE QUE NO ES NINGUNA DE LAS OCHO no devuelve la cadena cruda: devuelve la etiqueta del grupo
 * «Sin Rasgo asignado». `system.relation` se teclea a mano en la hoja de la entrada, y en la Capilla
 * un error de tecleo saca la entrada de la contabilidad de puntos — así que tiene que VERSE (D2.5).
 * @param {Record<string, unknown>} traits `system.traits`
 * @returns {(relation: string) => {label: string, rating: number|null}}
 */
export function chantryGroupResolver(traits = {}) {
	return (relation) => {
		if (!ROSTER_TRAIT_KEYS.includes(relation)) {
			return { label: game.i18n.localize("wod.chantry.roster.unassigned"), rating: null };
		}

		return {
			label: game.i18n.localize(`wod.chantry.traits.${relation}`),
			rating: parseInt(traits?.[relation]) || 0
		};
	};
}

/**
 * Las opciones con las que la hoja de Capilla llama a `buildConnectionGroups`.
 * @param {Record<string, unknown>} traits `system.traits`
 * @param {{locked?: boolean, locale?: string}} [state]
 * @returns {object}
 */
export function censusOptions(traits = {}, state = {}) {
	return {
		resolveGroup: chantryGroupResolver(traits),
		placeholderFor: censusPlaceholderFor,
		/* DESBLOQUEADA se pintan los OCHO grupos aunque estén vacíos, porque cada uno lleva su propio
		   botón de crear y ésa es la única ruta de creación (no hay diálogo). BLOQUEADA solo se pintan
		   los que tienen entradas: un censo entero vacío cae así al estado vacío de la pestaña, que es
		   el que explica cómo añadir la primera entrada — el criterio de aceptación de D10. */
		alwaysGroups: state.locked ? [] : [...ROSTER_TRAIT_KEYS],
		/* Alfabético POR LA ETIQUETA LOCALIZADA y con locale: por clave saldría «Aliados, Ancianos,
		   Arcano» mal, y un `localeCompare` sin locale pone «Arcano» antes de «Ancianos» — el defecto
		   exacto que 7.5.125 arregló en la lista de Rasgos. */
		locale: state.locale
	};
}

/**
 * Añade a cada grupo su lectura de puntos y marca los que no cuentan contra ningún Rasgo, y a cada
 * entrada sus puntos ya normalizados.
 *
 * `used`, `allowed` y `over` NO se calculan aquí: los calcula `evaluateItemRosters`, que a su vez
 * llama a la única función que decide `over` en todo el sistema. Es lo que hace imposible que el
 * «Puntos: 2 / 2» de la pestaña y el aviso de la fila del Rasgo discrepen (tarea 3.3).
 * @param {Array<object>} groups lo que devuelve `buildConnectionGroups`
 * @param {Record<string, unknown>} traits `system.traits`
 * @returns {Array<object>} los mismos grupos, decorados en el sitio
 */
export function decorateCensusGroups(groups, traits = {}) {
	const list = Array.isArray(groups) ? groups : [];

	const flat = [];
	for (const group of list) {
		for (const entry of group.entries ?? []) {
			flat.push({ relation: group.relation, points: entry?.system?.points });
		}
	}

	const summary = evaluateItemRosters(flat, traits);

	for (const group of list) {
		const totals = summary.groups[group.relation];

		if (totals) {
			group.used = totals.used;
			group.allowed = totals.allowed;
			group.over = totals.over;
			group.unassigned = false;
		}
		else {
			// No suma a ningún Rasgo, y decir «0 / 0» sugeriría que consume de algo.
			group.used = 0;
			group.allowed = 0;
			group.over = false;
			group.unassigned = true;
		}

		for (const entry of group.entries ?? []) {
			entry.censuspoints = normalisePoints(entry?.system?.points);
		}
	}

	return list;
}

/**
 * Los datos de un Item de censo recién creado desde el `+` de un grupo. Separado de la hoja para que
 * la migración y el botón creen EXACTAMENTE la misma cosa.
 * @param {string} relation clave del Rasgo, estampada por el botón (nunca tecleada)
 * @param {{name?: string, note?: string, points?: unknown}} [entry]
 * @returns {object}
 */
export function censusItemData(relation, entry = {}) {
	const name = typeof entry.name === "string" && entry.name.trim() !== ""
		? entry.name
		: game.i18n.localize("wod.labels.new.connection");

	return {
		name: name,
		type: "Feature",
		system: {
			type: "wod.types.connection",
			relation: relation,
			points: normalisePoints(entry.points),
			/* La «Nota» del portador viejo era un `<input type="text">` plano. Aquí pasa a
			   `description`, que es el campo que el enriquecedor lee — que es justo lo que (A) compra
			   (D1): un `@UUID[Actor.x]` escrito en ella se vuelve clicable EN LA PROPIA FILA. */
			description: typeof entry.note === "string" ? entry.note : ""
		}
	};
}
