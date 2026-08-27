/**
 * LA MIGRACIÓN DEL CENSO DE LA CAPILLA: de `system.traitRosters` a Items `wod.types.connection`.
 *
 * ============================================================================================
 * LAS REGLAS, SIN FOUNDRY DENTRO
 * ============================================================================================
 * Aquí no hay `game`, ni `CONFIG`, ni `ui`, ni documentos. El PASEO por el mundo (que sí los tiene)
 * está en `module/migrations.js`, igual que la corrección de `dexpenalty` de las armaduras separa su
 * paseo de `module/scripts/armor-dexpenalty.js`. La razón es la de siempre en este proyecto: una
 * regla que vive dentro de la clase de la hoja solo se puede comprobar renderizando una hoja; una que
 * vive aquí se comprueba con aritmética, bajo `node --test`
 * (`tests/chantry-roster-migration.test.mjs`).
 *
 * ============================================================================================
 * «PRESERVAR» ES UN CONTEO, NO UN BOOLEANO
 * ============================================================================================
 * `verifyMigration` compara, POR RASGO, cuántas entradas había contra cuántos Items con ese
 * `relation` hay después, NOMBRE A NOMBRE y PUNTOS A PUNTOS. No existe una función que devuelva
 * «éxito»: la razón está registrada en este proyecto — `manage-actors` reportó `updated: 1` sobre un
 * parche que había descartado en silencio, y los dos defectos de pérdida silenciosa de aquel día
 * reportaron éxito los dos.
 *
 * El paseo solo vacía `system.traitRosters` SI la verificación cuadra. Si no cuadra, deja el mapa
 * donde está y grita: un mundo con el dato en los dos portadores es reparable, uno sin el dato no.
 *
 * ============================================================================================
 * EL PREDICADO ES LA BANDERA
 * ============================================================================================
 * Sin bandera por actor: un `system.traitRosters` con contenido no puede existir legítimamente
 * después de este cambio, así que una segunda pasada no encuentra nada y no crea ni un Item. Igual
 * que la corrección de `dexpenalty`, y por los mismos motivos (ni `setFlag` en el estado estacionario
 * ni un bump de versión que convierta un despliegue en una escritura masiva).
 *
 * El mapa original se copia a `flags.worldofdarkness.migration.traitRosters` ANTES de vaciarse, así
 * que la operación es reversible sin backup del mundo. Y `system.traitRosters` SIGUE DECLARADO en
 * `template.json`: es lo que hace que un mundo todavía sin migrar renderice en vez de explotar.
 * Retirarlo es otro cambio, con su propia decisión.
 */

import { ROSTER_TRAIT_KEYS, normaliseRosters, normalisePoints } from "./chantry-effects.js";

/** El scope y la ruta de la bandera de respaldo. Un solo sitio, para que el paseo y el test coincidan. */
export const MIGRATION_FLAG_SCOPE = "worldofdarkness";
export const MIGRATION_FLAG_KEY = "migration.traitRosters";

/**
 * La marca de INTENTO, que es distinta de la de respaldo y existe por una razon aprendida en
 * produccion: el diseño decia que esta migracion era «idempotente por construccion» porque su
 * predicado —una Capilla con `traitRosters` no vacio— no puede casar despues de migrar. Eso es
 * cierto SOLO si el vaciado ocurre, y el vaciado esta condicionado —con razon— a que la
 * verificacion cuadre. Cuando la verificacion falla, el mapa se conserva, el predicado sigue
 * casando y el arranque siguiente DUPLICA. Paso: una Capilla acabo con cada Custos por
 * triplicado.
 *
 * Con esta marca, un fallo de verificacion se convierte en «no lo vuelvo a intentar» en lugar de
 * en una copia mas. El dato queda en los dos portadores, que es recuperable, y lo dice el log.
 */
export const ATTEMPT_FLAG_KEY = "migration.traitRostersAttempted";

/**
 * ¿Tiene este mapa alguna entrada? EL PREDICADO de la migración.
 *
 * Se apoya en `normaliseRosters`, que ya tira toda clave que no sea una de las ocho, así que un
 * `traitRosters` con basura (una clave inventada, un array vacío, un no-array) responde `false` y no
 * dispara una migración que no crearía nada.
 * @param {unknown} rawRosters `system.traitRosters`
 * @returns {boolean}
 */
export function hasCensusToMigrate(rawRosters) {
	const rosters = normaliseRosters(rawRosters);
	return ROSTER_TRAIT_KEYS.some((key) => (rosters[key]?.length ?? 0) > 0);
}

/**
 * El plan: una entrada de creación por cada entrada del censo, en el orden en que estaban.
 *
 * `points` pasa por `normalisePoints`, así que la regla fina se conserva LITERAL — un 0 explícito
 * sobrevive como 0 — y una entrada sin `points` llega valiendo 1, que es lo que valía cuando la
 * pintaba `chantry_roster.hbs`.
 *
 * `note` se convierte en `description`, que es el campo por el que corre el enriquecedor: es
 * exactamente lo que (A) compra (D1). No se pierde nada, y un `@UUID[Actor.x]` que alguien hubiera
 * escrito en la Nota pasa a ser clicable en la propia fila.
 * @param {unknown} rawRosters `system.traitRosters`
 * @param {(relation: string, entry: object) => object} makeItemData normalmente `censusItemData`
 * @returns {Array<object>} datos de creación de Items, en orden
 */
export function planCensusMigration(rawRosters, makeItemData) {
	const rosters = normaliseRosters(rawRosters);
	const plan = [];

	for (const key of ROSTER_TRAIT_KEYS) {
		for (const entry of rosters[key] ?? []) {
			plan.push(makeItemData(key, entry));
		}
	}

	return plan;
}

/**
 * Cuántas entradas había, por Rasgo y con su nombre y sus puntos. La LÍNEA BASE de la verificación.
 * @param {unknown} rawRosters
 * @returns {Record<string, Array<{name: string, points: number}>>}
 */
export function snapshotFromRosters(rawRosters) {
	const rosters = normaliseRosters(rawRosters);
	const out = {};

	for (const key of ROSTER_TRAIT_KEYS) {
		const entries = rosters[key] ?? [];
		if (entries.length === 0) continue;
		out[key] = entries.map((entry) => ({ name: entry.name, points: normalisePoints(entry.points) }));
	}

	return out;
}

/**
 * Cuántas entradas hay AHORA, leídas de los Items del actor, en la misma forma que `snapshotFromRosters`.
 * @param {Array<object>} items los Items del actor (documentos o objetos planos)
 * @returns {Record<string, Array<{name: string, points: number}>>}
 */
export function snapshotFromItems(items) {
	const out = {};

	for (const item of items ?? []) {
		if (item?.type !== "Feature") continue;
		if (item.system?.type !== "wod.types.connection") continue;

		const relation = item.system?.relation;
		if (!ROSTER_TRAIT_KEYS.includes(relation)) continue;

		(out[relation] ??= []).push({ name: item.name, points: normalisePoints(item.system?.points) });
	}

	return out;
}

/**
 * LA VERIFICACIÓN POR CONTEO. Compara la línea base con lo que hay, Rasgo por Rasgo y entrada por
 * entrada.
 *
 * Devuelve el CONTEO, no un veredicto solo: `perTrait` lleva `{before, after, matched}` por Rasgo, y
 * `mismatches` las diferencias en texto. `ok` es una comodidad para el paseo, pero lo que se
 * REPORTA son los números — de eso trata todo este fichero.
 *
 * El orden dentro de un Rasgo tiene que coincidir: la migración crea en orden y Foundry conserva el
 * orden de creación, así que una permutación sería una señal de que algo reordenó por el camino y
 * merece salir como discrepancia en vez de aceptarse.
 * @param {Record<string, Array<{name: string, points: number}>>} before
 * @param {Record<string, Array<{name: string, points: number}>>} after
 * @returns {{ok: boolean, perTrait: Record<string, {before: number, after: number, matched: number}>, mismatches: string[]}}
 */
export function verifyCensusMigration(before, after) {
	const perTrait = {};
	const mismatches = [];
	const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

	// SE COMPARA COMO MULTICONJUNTO, NO POR INDICE, y esto es el arreglo de un defecto que
	// llego a produccion: la version anterior hacia `was[i]` contra `now[i]`, pero `before`
	// sale del mapa (con su orden de insercion) y `after` sale de `actor.items`, cuyo orden
	// Foundry NO garantiza. Medido en vivo: la misma migracion devolvio una vez
	// «Jim, Raffela, John, Tzippi» y otra «Raffela, Jim, John, Tzippi», y la segunda fallo
	// reportando un cambio de nombre FANTASMA («Jim Haus» -> «Raffela Diemer»).
	//
	// Y el coste no era un mensaje feo: la verificacion en rojo impide vaciar el mapa —
	// correctamente— asi que el predicado seguia casando y el ARRANQUE SIGUIENTE volvia a
	// crear los Items. Tres arranques, tres copias de cada Custos.
	//
	// El orden no es informacion aqui: la hoja ordena cada grupo por nombre con
	// `localeCompare` antes de pintarlo. Lo que hay que preservar es el CONJUNTO de
	// entradas con sus puntos, y eso es exactamente lo que se compara.
	const claveDe = (e) => `${e.name}\u0000${normalisePoints(e.points)}`;

	for (const key of keys) {
		const was = before?.[key] ?? [];
		const now = after?.[key] ?? [];

		const pendientes = new Map();
		for (const e of was) {
			const k = claveDe(e);
			pendientes.set(k, (pendientes.get(k) ?? 0) + 1);
		}

		const sobran = [];
		let matched = 0;
		for (const e of now) {
			const k = claveDe(e);
			const n = pendientes.get(k) ?? 0;
			if (n > 0) { pendientes.set(k, n - 1); matched++; }
			else sobran.push(e);
		}

		for (const [k, n] of pendientes) {
			if (n <= 0) continue;
			const [nombre, puntos] = k.split("\u0000");
			for (let c = 0; c < n; c++) {
				mismatches.push(`${key}: falta "${nombre}" (${puntos} punto/s)`);
			}
		}
		for (const e of sobran) {
			mismatches.push(`${key}: sobra "${e.name}" (${normalisePoints(e.points)} punto/s)`);
		}

		perTrait[key] = { before: was.length, after: now.length, matched: matched };
	}

	return {
		ok: mismatches.length === 0,
		perTrait: perTrait,
		mismatches: mismatches,
	};
}

/**
 * El conteo, en una línea legible para la consola. Se imprime SIEMPRE que se migra algo, con o sin
 * discrepancias, porque un log que solo aparece cuando algo falla no deja constancia de lo que sí
 * pasó.
 * @param {ReturnType<typeof verifyCensusMigration>} result
 * @returns {string}
 */
export function formatCensusVerification(result) {
	const parts = Object.entries(result.perTrait)
		.map(([key, n]) => `${key} ${n.before}->${n.after} (${n.matched} iguales)`);

	return `${parts.join(", ") || "sin censo"}${result.ok ? "" : ` | DISCREPANCIAS: ${result.mismatches.join("; ")}`}`;
}
