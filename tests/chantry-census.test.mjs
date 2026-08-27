/**
 * add-chantry-roster-tab — EL CENSO DE LA CAPILLA, en la parte que se puede EJECUTAR.
 *
 *     node --test tests/*.test.mjs        <- pasa el GLOB. `node --test tests/` falla en Node 25 y se
 *                                            lee como suite roja.
 *     node tests/chantry-census.test.mjs  <- este fichero solo
 *
 * ESTE FICHERO SUSTITUYE A `chantry-roster-popup.test.mjs`, y no es un renombrado cosmético: aquel
 * afirmaba un POPUP que este cambio retira a propósito (D7). El defecto más repetido de este proyecto
 * es un test que afirma el defecto; el simétrico —y el que acecha aquí— es un test que afirma un
 * comportamiento retirado. Así que sus nueve pruebas se han repartido, no ajustado:
 *
 *   LAS CUATRO DE CONTENIDO se trasladan, y siguen midiendo lo mismo en el sitio nuevo:
 *     * el estado vacío habla EN ESPAÑOL y dice cómo añadir la primera entrada -> aquí, contra el
 *       `lang/es.json` de verdad;
 *     * el listado con sus puntos, y el 0 explícito que sobrevive -> `evaluateItemRosters`, aquí;
 *     * el aviso de sobrecoste -> `evaluateItemRosters`, aquí;
 *     * el markup tecleado que llega como TEXTO -> ya no lo escribe esta base de código: la fila la
 *       pinta Handlebars, que escapa `{{ }}` por su cuenta, así que la comprobación se midió sobre el
 *       HTML RENDERIZADO y vive en `.github/scripts/test-part-render.mjs`. Aquí se comprueba lo que
 *       queda de ese riesgo en JS: que nada de este camino construya HTML a mano.
 *
 *   LAS CINCO DEL POPUP se reescriben contra la regla nueva:
 *     * «abre UN ItemViewer» -> el binder ya no abre ninguno: navega. Se comprueba que ni el fichero
 *       de la hoja ni este camino llamen a `ItemViewer` desde el censo.
 *     * «namespace ChantryRoster», «el cuerpo escapa», «una clave desconocida no abre nada» -> las
 *       dos primeras desaparecen con el popup (registrado, no borrado en silencio); la tercera pasa a
 *       ser «una clave fuera de las ocho no navega», y su prima nueva y más importante: una ENTRADA
 *       con un `relation` fuera de las ocho no desaparece, sale en su grupo visible.
 *     * «el binder sella lo que liga» y «sin icono no hay listener» -> siguen siendo del binder y se
 *       comprueban en `test-chantry-trait-eye.mjs` (estático) y en `test-part-render.mjs` (render).
 *
 * LO QUE SE EJECUTA AQUÍ es lo que ni el render ni una lectura del fuente pueden ver: la ARITMÉTICA
 * de los puntos, el ORDEN de los grupos con las etiquetas de verdad, y que las cadenas que un DJ lee
 * estén EN SU IDIOMA en vez de ser una clave.
 *
 * El cierre de importación es deliberadamente mínimo: `chantry-census.js` no importa Foundry ni el
 * constructor de grupos (ver su cabecera), así que aquí basta con `game.i18n`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---- las traducciones REALES, aplanadas como las aplana game.i18n ---- */
function flatten(file) {
	const flat = {};
	(function walk(node, prefix) {
		for (const [key, value] of Object.entries(node)) {
			const full = prefix ? `${prefix}.${key}` : key;
			if (value && typeof value === "object") walk(value, full);
			else flat[full] = value;
		}
	})(JSON.parse(fs.readFileSync(path.join(ROOT, "lang", file), "utf8")), "");
	return flat;
}

const ES = flatten("es.json");
const EN = flatten("en.json");

// El `localize` de verdad devuelve la CLAVE cuando no hay traducción, que es lo que hace que las
// aserciones de abajo no sean tautológicas.
globalThis.game = { i18n: { localize: (k) => ES[k] ?? String(k ?? "") } };

const {
	ROSTER_TRAIT_KEYS,
	normalisePoints,
	evaluateItemRosters,
	evaluateRosters
} = await import(pathToFileURL(path.join(ROOT, "module", "scripts", "chantry-effects.js")).href);

const {
	CENSUS_PERSON_PLACEHOLDER,
	CENSUS_HOLDING_PLACEHOLDER,
	NON_PERSON_ROSTER_TRAITS,
	censusPlaceholderFor,
	chantryGroupResolver,
	censusOptions,
	decorateCensusGroups,
	censusItemData
} = await import(pathToFileURL(path.join(ROOT, "module", "scripts", "chantry-census.js")).href);

let failures = 0;
function test(name, fn) {
	try { fn(); console.log(`  ok - ${name}`); }
	catch (err) { failures++; console.error(`  FAIL - ${name}`); console.error(`    ${err.message}`); }
}

console.log("chantry census (chantry-census.js + chantry-effects.js)");

/* ---- 1. LOS PUNTOS: la regla fina, con sus cuatro casos (tarea 3.4) ---- */

test("un points explícito de 0 SOBREVIVE como 0, y solo ausente/nulo/vacío pasa a 1", () => {
	assert.equal(normalisePoints(0), 0, "un 0 explícito se convirtió en otra cosa");
	assert.equal(normalisePoints("0"), 0, "un \"0\" de un <input type=number> se convirtió en otra cosa");
	assert.equal(normalisePoints(undefined), 1, "una entrada sin points no vale 1");
	assert.equal(normalisePoints(null), 1, "un points nulo no vale 1");
	assert.equal(normalisePoints(""), 1, "un points vacío no vale 1");
	assert.equal(normalisePoints(3), 3);
	assert.equal(normalisePoints("3 "), 3, "un valor con espacios editado a mano no se parsea");
	assert.equal(normalisePoints(-2), 0, "un negativo no se acota a 0");

	/* EL CASO NO PARSEABLE VALE 0, NO 1, y esto es lo contrario de lo que dicen la spec de este cambio
	   («only an absent or unparseable value defaulting to 1») y el comentario que había en
	   `normaliseRosters`. Es el comportamiento EMBARCADO desde `add-chantry-inventory-effects-and-
	   roster` y se conserva a propósito: cambiarlo movería la contabilidad de puntos de toda Capilla ya
	   creada y no es lo que este cambio hace. Se afirma la regla EMBARCADA, no la frase de la spec —
	   escribir el test desde la frase es exactamente cómo se hacen los tests que afirman el defecto.
	   Queda anotado en design.md (tarea 10.1). */
	assert.equal(normalisePoints("lo que sea"), 0, "el comportamiento embarcado para un valor basura cambió");
});

test("los dos portadores del censo dan la MISMA forma, y el mismo veredicto de sobrecoste", () => {
	const traits = { allies: 2, library: 3 };

	// El portador viejo (el mapa), que es lo que la migración lee.
	const fromMap = evaluateRosters({
		allies: [{ name: "Nadia", note: "", points: 1 }, { name: "Otto", note: "", points: 1 }]
	}, traits).allies;

	// El portador nuevo (los Items).
	const fromItems = evaluateItemRosters([
		{ relation: "allies", points: 1 }, { relation: "allies", points: 1 }
	], traits).groups.allies;

	assert.equal(fromItems.used, fromMap.used, "los dos portadores cuentan puntos distintos");
	assert.equal(fromItems.allowed, fromMap.allowed);
	assert.equal(fromItems.over, fromMap.over);
	assert.deepEqual(Object.keys(fromItems).sort(), Object.keys(fromMap).sort(),
		"la forma de salida difiere, así que la plantilla no puede leer las dos");
});

test("cinco entradas de 0 puntos en Biblioteca ●●● no consumen ningún círculo", () => {
	const summary = evaluateItemRosters(
		Array.from({ length: 5 }, () => ({ relation: "library", points: 0 })),
		{ library: 3 }).groups.library;

	assert.equal(summary.entries.length, 5);
	assert.equal(summary.used, 0, "un censo de entradas descriptivas consumió círculos");
	assert.equal(summary.allowed, 3);
	assert.equal(summary.over, false, "un censo dentro de presupuesto salió marcado como sobrecoste");
});

test("el sobrecoste se REPORTA y las entradas se siguen contando (no se bloquea)", () => {
	const summary = evaluateItemRosters([{ relation: "spies", points: 3 }], { spies: 1 }).groups.spies;

	assert.equal(summary.over, true, "3 puntos sobre 1 círculo no salió como sobrecoste");
	assert.equal(summary.used, 3);
	assert.equal(summary.entries.length, 1, "la entrada en sobrecoste desapareció");
});

/* ---- 2. EL RELATION MAL TECLEADO: se ve, y no cuenta contra nada ---- */

test("una entrada con un relation fuera de las ocho no desaparece y no suma a ningún Rasgo", () => {
	const summary = evaluateItemRosters([
		{ relation: "allies", points: 1 },
		{ relation: "alies", points: 5 }          // el error de tecleo
	], { allies: 2 });

	assert.equal(summary.groups.allies.used, 1, "la entrada mal keyada se contó contra allies");
	assert.equal(summary.unassigned.entries.length, 1, "la entrada mal keyada se perdió");
	assert.equal(summary.unassigned.used, 0, "la entrada mal keyada consume de algo");
	assert.equal(summary.unassigned.over, false, "el grupo sin Rasgo sale como sobrecoste");

	for (const key of ROSTER_TRAIT_KEYS) {
		assert.ok(summary.groups[key].entries.every((e) => e.relation !== "alies"),
			`la entrada mal keyada apareció en ${key}`);
	}
});

test("el resolvedor titula el grupo mal keyado «Sin Rasgo asignado», no con la cadena cruda", () => {
	const resolve = chantryGroupResolver({ allies: 2 });

	assert.equal(resolve("allies").label, ES["wod.chantry.traits.allies"]);
	assert.equal(resolve("allies").rating, 2, "los círculos no salen de system.traits");
	assert.equal(resolve("alies").label, ES["wod.chantry.roster.unassigned"]);
	assert.equal(resolve("alies").rating, null, "un grupo sin Rasgo no puede tener círculos");
	assert.ok(!resolve("alies").label.includes("wod."), "una clave sin resolver llegó a la cabecera");
});

test("el resolvedor de la Capilla NO devuelve la clave cruda ni rating null para los ocho Rasgos", () => {
	// Éste es el camino que el resolvedor del PJ daría: una Capilla no tiene Items Trasfondo, así que
	// cada grupo saldría titulado «allies» y sin círculos. Ver D2.1.
	const resolve = chantryGroupResolver({});

	for (const key of ROSTER_TRAIT_KEYS) {
		const group = resolve(key);
		assert.notEqual(group.label, key, `el grupo ${key} sale con la clave cruda por título`);
		assert.ok(!group.label.includes("wod."), `el grupo ${key} sale con una clave i18n sin resolver: ${group.label}`);
		assert.equal(group.rating, 0, `el grupo ${key} sale con rating ${group.rating} en vez de 0`);
	}
});

/* ---- 3. EL ORDEN: alfabético por la etiqueta LOCALIZADA (tarea 2.4) ---- */

test("los grupos se ordenan por la etiqueta localizada, no por la clave, y con locale", () => {
	const options = censusOptions({}, { locked: false, locale: "es" });
	assert.equal(options.locale, "es", "la hoja no pasa locale, así que el orden sería locale-naive");

	// El comparador sale de las opciones que la hoja pasa de verdad, no se reimplementa aquí.
	const byLabel = ROSTER_TRAIT_KEYS
		.map((k) => ES[`wod.chantry.traits.${k}`])
		.sort((a, b) => a.localeCompare(b, options.locale || undefined));

	assert.deepEqual(byLabel, [
		"Aliados", "Ancianos/Dirección", "Biblioteca", "Criados",
		"Culto/Simpatizantes", "Espías", "Nodo", "Refuerzos"
	], "el orden alfabético por etiqueta cambió; si una etiqueta se ha reescrito, actualiza la lista");

	/* Y POR CLAVE SERÍA OTRO, que es lo que hace que esta prueba mida algo: las claves están en el
	   orden de `ROSTER_TRAIT_KEYS` («Aliados, Criados, Espías, Refuerzos, Ancianos…»), que no es
	   alfabético en pantalla. */
	const byKey = [...ROSTER_TRAIT_KEYS].sort().map((k) => ES[`wod.chantry.traits.${k}`]);
	assert.notDeepEqual(byLabel, byKey,
		"ordenar por clave y por etiqueta dan lo mismo: la prueba no distinguiría un comparador roto");

	/* Y AQUÍ UNA MEDIDA QUE CONTRADICE LO QUE ESTA PRUEBA QUERÍA AFIRMAR, anotada en vez de forzada.
	   El defecto que 7.5.125 arregló era de ACENTOS: un `sort()` crudo ordena por punto de código y
	   pone «Arcano» antes de «Ancianos». Medido sobre ESTAS ocho etiquetas, el `sort()` crudo da el
	   MISMO orden que el localizado — «Arcano/Encubrimiento» es de `arcane-cloaking`, que NO admite
	   censo, así que el par que provocaba el defecto no está en este juego. El locale se pasa igual, y
	   se afirma que se pasa (arriba): es el idioma establecido de esta hoja y cualquier reescritura de
	   una etiqueta (una con «Á», una con «Ñ») lo volvería load-bearing sin avisar. Lo que NO se hace es
	   fingir que hoy cambia el resultado. */
	const naive = ROSTER_TRAIT_KEYS.map((k) => ES[`wod.chantry.traits.${k}`]).sort();
	assert.deepEqual(naive, byLabel,
		"el sort() crudo y el localizado ya NO coinciden en este juego de etiquetas: eso significa que " +
		"el locale pasó a ser load-bearing, lo cual está bien — actualiza este comentario y conviértelo " +
		"en una aserción de que el crudo se equivoca");
});

test("desbloqueada se fuerzan los ocho grupos; bloqueada ninguno (para que caiga el estado vacío)", () => {
	assert.deepEqual(censusOptions({}, { locked: false }).alwaysGroups, [...ROSTER_TRAIT_KEYS]);
	assert.deepEqual(censusOptions({}, { locked: true }).alwaysGroups, [],
		"bloqueada se fuerzan grupos, así que una Capilla vacía nunca vería su estado vacío");
});

/* ---- 4. LOS MARCADORES DE RETRATO (tarea 1.3 / 5.4) ---- */

test("Biblioteca y Nodo no salen con silueta humana, y su marcador EXISTE en disco", () => {
	assert.deepEqual([...NON_PERSON_ROSTER_TRAITS].sort(), ["library", "node"]);

	for (const key of NON_PERSON_ROSTER_TRAITS) {
		assert.notEqual(censusPlaceholderFor(key), CENSUS_PERSON_PLACEHOLDER,
			`${key} cae en la silueta humana del censo del PJ`);
		assert.equal(censusPlaceholderFor(key), CENSUS_HOLDING_PLACEHOLDER);
	}

	for (const key of ROSTER_TRAIT_KEYS.filter((k) => !NON_PERSON_ROSTER_TRAITS.includes(k))) {
		assert.equal(censusPlaceholderFor(key), CENSUS_PERSON_PLACEHOLDER,
			`${key} es gente y debería conservar el marcador del PJ`);
	}

	/* «Comprobado que existe antes de embarcarse» es un requisito literal de la spec, y una ruta
	   inventada renderiza un hueco roto sin ningún error. Se comprueba en DISCO, no de memoria. */
	const rel = CENSUS_HOLDING_PLACEHOLDER.replace(/^systems\/worldofdarkness\//, "");
	assert.ok(fs.existsSync(path.join(ROOT, rel)), `el marcador no existe en este checkout: ${rel}`);

	// Y el del PJ es del core de Foundry, no de este fork: no se puede comprobar en disco aquí, así
	// que al menos se fija que sigue siendo la ruta que el censo del PJ usa.
	assert.equal(CENSUS_PERSON_PLACEHOLDER, "icons/svg/mystery-man.svg");
});

/* ---- 5. LA DECORACIÓN: lo que la pestaña acaba leyendo ---- */

test("decorateCensusGroups pone puntos por grupo y por entrada, y marca el grupo sin Rasgo", () => {
	const item = (relation, points) => ({ name: `x-${relation}`, system: { relation, points } });

	const groups = [
		{ relation: "allies", entries: [item("allies", 1), item("allies", 1)] },
		{ relation: "library", entries: [item("library", 0)] },
		{ relation: "alies", entries: [item("alies", 4)] }
	];

	decorateCensusGroups(groups, { allies: 2, library: 3 });

	assert.deepEqual(
		groups.map((g) => [g.relation, g.used, g.allowed, g.over, g.unassigned]),
		[["allies", 2, 2, false, false], ["library", 0, 3, false, false], ["alies", 0, 0, false, true]]);

	// Y cada entrada lleva sus puntos ya normalizados, para que la fila los diga como TEXTO — un 0
	// incluido, que `pointValue` esconde y por eso no se reutiliza (D2.4).
	assert.equal(groups[1].entries[0].censuspoints, 0);
	assert.equal(groups[0].entries[0].censuspoints, 1);
});

test("censusItemData estampa el Rasgo y convierte la Nota en descripción enriquecible", () => {
	const data = censusItemData("spies", { name: "Rata", note: "Vive en @UUID[Actor.abc]{el muelle}", points: 0 });

	assert.equal(data.type, "Feature");
	assert.equal(data.system.type, "wod.types.connection", "el sub-tipo no es el que las dos hojas leen");
	assert.equal(data.system.relation, "spies", "el Rasgo no se estampa, así que habría que teclearlo");
	assert.equal(data.system.points, 0, "el 0 explícito no sobrevivió a la creación");
	assert.ok(data.system.description.includes("@UUID[Actor.abc]"),
		"la Nota no pasa a `description`, que es el único campo por el que corre el enriquecedor");

	// Sin nombre, un nombre localizado y no una cadena vacía que no se puede pulsar.
	const blank = censusItemData("allies");
	assert.equal(blank.name, ES["wod.labels.new.connection"]);
	assert.ok(!blank.name.includes("wod."), "el nombre por omisión es una clave sin resolver");
	assert.equal(blank.system.points, 1, "una entrada nueva no vale 1 punto por omisión");
});

/* ---- 6. LAS CADENAS QUE UN DJ LEE, en los dos idiomas ---- */

test("el estado vacío de la pestaña explica cómo añadir la primera entrada, en los dos idiomas", () => {
	for (const [lang, flat] of [["es", ES], ["en", EN]]) {
		const value = flat["wod.chantry.roster.empty"];
		assert.equal(typeof value, "string", `${lang}: falta wod.chantry.roster.empty`);
		assert.ok(value.trim().length >= 120, `${lang}: el estado vacío no explica nada (${value.trim().length} car.)`);
		assert.ok(!value.includes("wod."), `${lang}: una clave sin resolver dentro del valor`);
	}

	// Y tiene que nombrar la RUTA de verdad, que desde este cambio es «desbloquea la hoja y usa el +
	// de la cabecera de cada Rasgo DE ESTA PESTAÑA» — antes mandaba al botón «junto al Rasgo», que ya
	// no existe. Es un VALOR reescrito, no una clave nueva (tarea 6.4).
	assert.match(ES["wod.chantry.roster.empty"], /desbloquea/i, "el estado vacío no dice que hay que desbloquear");
	assert.match(ES["wod.chantry.roster.empty"], /pesta[ñn]a/i, "el estado vacío sigue sin hablar de la pestaña");
	assert.ok(!/junto al Rasgo/.test(ES["wod.chantry.roster.empty"]),
		"el estado vacío sigue mandando al botón «junto al Rasgo», que este cambio retiró");
	assert.match(EN["wod.chantry.roster.empty"], /unlock/i);
	assert.match(EN["wod.chantry.roster.empty"], /tab/i);
});

test("el título de la pestaña dice «Censo» y NO «Aliados y contactos»", () => {
	assert.equal(ES["wod.chantry.roster.headline"], "Censo");
	assert.notEqual(ES["wod.chantry.roster.headline"], ES["wod.tab.connections"],
		"la pestaña se titularía con la del PJ, que es falsa para Biblioteca y Nodo");
	assert.equal(typeof EN["wod.chantry.roster.headline"], "string");

	/* EL VALOR INGLÉS ES «Roster», NO «Census», y la spec de este cambio dice lo contrario al citar la
	   clave como «Censo» / «Census». Medido, no recordado. Se deja como está: «Roster» es inglés
	   correcto para un censo de gente, ya está embarcado desde 7.5.137 y el requisito solo obliga a la
	   lectura ESPAÑOLA. Anotado en design.md (tarea 10.1) en vez de reescrito para que la cita cuadre. */
	assert.equal(EN["wod.chantry.roster.headline"], "Roster");
});

test("todas las claves que la pestaña y el grupo sin Rasgo necesitan existen en los DOS idiomas", () => {
	const needed = [
		"wod.chantry.roster.headline", "wod.chantry.roster.empty", "wod.chantry.roster.points",
		"wod.chantry.roster.over", "wod.chantry.roster.add", "wod.chantry.roster.show",
		"wod.chantry.roster.entrypoints", "wod.chantry.roster.unassigned",
		"wod.chantry.roster.unassignedhint", "wod.connections.points",
		"wod.labels.new.connection", "wod.labels.edit.connection", "wod.labels.remove.connection",
		"wod.connections.link", "wod.connections.nolink"
	];

	for (const key of needed) {
		for (const [lang, flat] of [["es", ES], ["en", EN]]) {
			assert.equal(typeof flat[key], "string", `${lang}: falta ${key}`);
			assert.ok(flat[key].trim() !== "", `${lang}: ${key} está vacía`);
		}
	}

	// Las etiquetas de campo tienen presupuesto de 45 caracteres (label-length-check.py).
	assert.ok(ES["wod.connections.points"].length <= 45);
});

/* ---- 7. EL POPUP RETIRADO: que no vuelva por la puerta de atrás ---- */

test("el censo ya no construye HTML a mano en ninguna parte de la hoja", () => {
	const sheet = fs.readFileSync(
		path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet-v2.js"), "utf8");

	/* `_rosterDescription` era el ÚNICO sitio de esta hoja que construía HTML con cadenas escritas por
	   un DJ, y por eso tenía su propio escapador y su propia prueba. Con la pestaña, la fila la pinta
	   Handlebars y el escapado es suyo. Si alguien reintrodujera un constructor de HTML aquí, el
	   riesgo de inyección volvería SIN su prueba, porque ésta desapareció con él. */
	// Se busca la LLAMADA o la DEFINICIÓN, no la palabra: este mismo cambio la menciona en un
	// comentario para que se sepa qué se retiró, y buscar la palabra haría fallar la prueba por el
	// comentario que la explica.
	assert.ok(!/_rosterDescription\s*\(/.test(sheet), "volvió el constructor de HTML del popup del censo");
	assert.ok(!/ItemViewer\.open\(\{[\s\S]{0,400}ChantryRoster/.test(sheet),
		"el icono del censo vuelve a abrir un ItemViewer: el censo se ofrecería desde dos sitios");
	assert.ok(/_activateCensusTab/.test(sheet), "el icono del censo ya no navega a la pestaña");

	// Y las cuatro piezas del portador viejo no pueden seguir vivas en la hoja.
	for (const gone of ["onRosterAdd", "onRosterDelete", "_writeRoster", "_rostersForWrite"]) {
		assert.ok(!new RegExp(`${gone}\\s*[(=]`).test(sheet), `${gone} sigue en la hoja tras retirar el portador viejo`);
	}
});

console.log(failures ? `\n${failures} FALLO(S)` : "\nTodas las pruebas del censo de la Capilla pasan.");
process.exit(failures ? 1 : 0);
