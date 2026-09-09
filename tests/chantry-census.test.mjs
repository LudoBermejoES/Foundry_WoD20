/**
 * add-chantry-roster-tab, updated by rebuild-chantry-book-of-chantries-only — EL CENSO DE LA
 * CAPILLA, en la parte que se puede EJECUTAR.
 *
 *     node --test tests/*.test.mjs        <- pasa el GLOB. `node --test tests/` falla en Node 25 y se
 *                                            lee como suite roja.
 *     node tests/chantry-census.test.mjs  <- este fichero solo
 *
 * rebuild-chantry-book-of-chantries-only estrecha el censo VIVO de las ocho claves del Dossier
 * (allies/retainers/spies/backup/elders/cult-sympathizers/library/node) a TRES
 * (guardian/staffTier/node) — y el `node` de hoy es el Nodo del libro, no el del Dossier: mismo
 * nombre, otra economía (design.md D1). El resolvedor de grupo (`chantryGroupResolver`) deja de leer
 * `system.traits` a secas: lee el mapa PLANO `{guardian, staffTier, node}` que
 * `rosterAllowedValues()` construye a partir de `system.traits`/`system.personnel`/`system.realm`,
 * porque los tres viven en tres sitios distintos del actor ahora.
 *
 * El cierre de importación sigue siendo deliberadamente mínimo: `chantry-census.js` no importa
 * Foundry ni el constructor de grupos (ver su cabecera), así que aquí basta con `game.i18n`.
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
	rosterAllowedValues
} = await import(pathToFileURL(path.join(ROOT, "module", "scripts", "chantry-effects.js")).href);

const {
	CENSUS_PERSON_PLACEHOLDER,
	CENSUS_HOLDING_PLACEHOLDER,
	NON_PERSON_ROSTER_TRAITS,
	ROSTER_LABEL_KEYS,
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
	assert.equal(normalisePoints("lo que sea"), 0, "el comportamiento embarcado para un valor basura cambió");
});

test("cinco entradas de 0 puntos en staffTier ●●● no consumen ningún círculo", () => {
	// expand-chantry-node-personnel-and-roster-linking, design.md D2: el aforo de staffTier ●●●
	// (nivel 3) es 12 (STAFF_TIER_ROSTER_CAPACITY), NUNCA el nivel 3 en sí.
	const values = rosterAllowedValues({ personnel: { staffTier: 3 } });
	const summary = evaluateItemRosters(
		Array.from({ length: 5 }, () => ({ relation: "staffTier", points: 0 })),
		values).groups.staffTier;

	assert.equal(summary.entries.length, 5);
	assert.equal(summary.used, 0, "un censo de entradas descriptivas consumió círculos");
	assert.equal(summary.allowed, 12);
	assert.equal(summary.over, false, "un censo dentro de presupuesto salió marcado como sobrecoste");
});

test("el sobrecoste se REPORTA y las entradas se siguen contando (no se bloquea)", () => {
	// El aforo del Nodo es `nodeCount` directamente (design.md D2) — `nodeSize` ya no interviene.
	const values = rosterAllowedValues({ realm: { nodeCount: 1 } });
	const summary = evaluateItemRosters([{ relation: "node", points: 3 }], values).groups.node;

	assert.equal(summary.over, true, "3 puntos sobre 1 círculo no salió como sobrecoste");
	assert.equal(summary.used, 3);
	assert.equal(summary.entries.length, 1, "la entrada en sobrecoste desapareció");
});

/* ---- 2. EL RELATION MAL TECLEADO: se ve, y no cuenta contra nada ---- */

test("una entrada con un relation fuera de las tres no desaparece y no suma a ningún Rasgo", () => {
	const values = rosterAllowedValues({ traits: { guardian: 2 } });
	const summary = evaluateItemRosters([
		{ relation: "guardian", points: 1 },
		{ relation: "guardain", points: 5 }          // el error de tecleo
	], values);

	assert.equal(summary.groups.guardian.used, 1, "la entrada mal keyada se contó contra guardian");
	assert.equal(summary.unassigned.entries.length, 1, "la entrada mal keyada se perdió");
	assert.equal(summary.unassigned.used, 0, "la entrada mal keyada consume de algo");
	assert.equal(summary.unassigned.over, false, "el grupo sin Rasgo sale como sobrecoste");

	for (const key of ROSTER_TRAIT_KEYS) {
		assert.ok(summary.groups[key].entries.every((e) => e.relation !== "guardain"),
			`la entrada mal keyada apareció en ${key}`);
	}
});

test("una entrada bajo una clave RETIRADA del Dossier (allies, library…) también cae en «sin Rasgo»", () => {
	const values = rosterAllowedValues({});
	const summary = evaluateItemRosters([{ relation: "allies", points: 1 }, { relation: "library", points: 1 }], values);

	assert.equal(summary.unassigned.entries.length, 2,
		"las claves retiradas del Dossier deben caer en «sin Rasgo asignado», no en un grupo propio");
	for (const key of ROSTER_TRAIT_KEYS) assert.equal(summary.groups[key].used, 0, key);
});

test("el resolvedor titula el grupo mal keyado «Sin Rasgo asignado», no con la cadena cruda", () => {
	const resolve = chantryGroupResolver({ guardian: 2 });

	assert.equal(resolve("guardian").label, ES["wod.chantry.traits.guardian"]);
	assert.equal(resolve("guardian").rating, 2, "los círculos no salen del mapa aplanado");
	assert.equal(resolve("guardain").label, ES["wod.chantry.roster.unassigned"]);
	assert.equal(resolve("guardain").rating, null, "un grupo sin Rasgo no puede tener círculos");
	assert.ok(!resolve("guardain").label.includes("wod."), "una clave sin resolver llegó a la cabecera");
});

test("el resolvedor NO devuelve la clave cruda ni rating null para las tres claves de hoy", () => {
	const resolve = chantryGroupResolver({});

	for (const key of ROSTER_TRAIT_KEYS) {
		const group = resolve(key);
		assert.notEqual(group.label, key, `el grupo ${key} sale con la clave cruda por título`);
		assert.ok(!group.label.includes("wod."), `el grupo ${key} sale con una clave i18n sin resolver: ${group.label}`);
		assert.equal(group.rating, 0, `el grupo ${key} sale con rating ${group.rating} en vez de 0`);
	}
});

test("cada una de las tres claves tiene su PROPIA clave de etiqueta, en tres sitios de contenido distintos", () => {
	assert.deepEqual(ROSTER_LABEL_KEYS, {
		guardian: "wod.chantry.traits.guardian",
		staffTier: "wod.chantry.personnel.stafftier",
		node: "wod.chantry.realm.fields.nodesize"
	});
	for (const key of Object.values(ROSTER_LABEL_KEYS)) {
		for (const [lang, flat] of [["es", ES], ["en", EN]]) {
			assert.equal(typeof flat[key], "string", `${lang}: falta ${key}`);
		}
	}
});

/* ---- 3. EL ORDEN: alfabético por la etiqueta LOCALIZADA (tarea 2.4) ---- */

test("los grupos se ordenan por la etiqueta localizada, no por la clave, y con locale", () => {
	const options = censusOptions({}, { locked: false, locale: "es" });
	assert.equal(options.locale, "es", "la hoja no pasa locale, así que el orden sería locale-naive");

	const labelFor = (key) => ES[ROSTER_LABEL_KEYS[key]];
	const byLabel = ROSTER_TRAIT_KEYS.map(labelFor).sort((a, b) => a.localeCompare(b, options.locale || undefined));

	assert.deepEqual(byLabel, ["Guardián", "Sirvientes", "Tamaño del Nodo"],
		"el orden alfabético por etiqueta cambió; si una etiqueta se ha reescrito, actualiza la lista");

	const byKey = [...ROSTER_TRAIT_KEYS].sort().map(labelFor);
	assert.notDeepEqual(byLabel, byKey,
		"ordenar por clave y por etiqueta dan lo mismo: la prueba no distinguiría un comparador roto");
});

test("desbloqueada se fuerzan los TRES grupos; bloqueada ninguno (para que caiga el estado vacío)", () => {
	assert.deepEqual(censusOptions({}, { locked: false }).alwaysGroups, [...ROSTER_TRAIT_KEYS]);
	assert.deepEqual(censusOptions({}, { locked: true }).alwaysGroups, [],
		"bloqueada se fuerzan grupos, así que una Capilla vacía nunca vería su estado vacío");
});

/* ---- 4. LOS MARCADORES DE RETRATO (tarea 1.3 / 5.4) ---- */

test("solo el Nodo no sale con silueta humana, y su marcador EXISTE en disco", () => {
	assert.deepEqual([...NON_PERSON_ROSTER_TRAITS], ["node"]);

	for (const key of NON_PERSON_ROSTER_TRAITS) {
		assert.notEqual(censusPlaceholderFor(key), CENSUS_PERSON_PLACEHOLDER,
			`${key} cae en la silueta humana del censo del PJ`);
		assert.equal(censusPlaceholderFor(key), CENSUS_HOLDING_PLACEHOLDER);
	}

	for (const key of ROSTER_TRAIT_KEYS.filter((k) => !NON_PERSON_ROSTER_TRAITS.includes(k))) {
		assert.equal(censusPlaceholderFor(key), CENSUS_PERSON_PLACEHOLDER,
			`${key} es gente y debería conservar el marcador del PJ`);
	}

	const rel = CENSUS_HOLDING_PLACEHOLDER.replace(/^systems\/worldofdarkness\//, "");
	assert.ok(fs.existsSync(path.join(ROOT, rel)), `el marcador no existe en este checkout: ${rel}`);
	assert.equal(CENSUS_PERSON_PLACEHOLDER, "icons/svg/mystery-man.svg");
});

/* ---- 5. LA DECORACIÓN: lo que la pestaña acaba leyendo ---- */

test("decorateCensusGroups pone puntos por grupo y por entrada, y marca el grupo sin Rasgo", () => {
	const item = (relation, points) => ({ name: `x-${relation}`, system: { relation, points } });

	const groups = [
		{ relation: "guardian", entries: [item("guardian", 1), item("guardian", 1)] },
		{ relation: "staffTier", entries: [item("staffTier", 0)] },
		{ relation: "guardain", entries: [item("guardain", 4)] }
	];

	// expand-chantry-node-personnel-and-roster-linking, design.md D2: guardian's aforo es 1 (no su
	// nivel 2), y staffTier ●●● (nivel 3) es 12 (STAFF_TIER_ROSTER_CAPACITY), no su nivel.
	const values = rosterAllowedValues({ traits: { guardian: 2 }, personnel: { staffTier: 3 } });
	decorateCensusGroups(groups, values);

	assert.deepEqual(
		groups.map((g) => [g.relation, g.used, g.allowed, g.over, g.unassigned]),
		[["guardian", 2, 1, true, false], ["staffTier", 0, 12, false, false], ["guardain", 0, 0, false, true]]);

	assert.equal(groups[1].entries[0].censuspoints, 0);
	assert.equal(groups[0].entries[0].censuspoints, 1);
});

test("censusItemData estampa el Rasgo y convierte la Nota en descripción enriquecible", () => {
	const data = censusItemData("node", { name: "Rata", note: "Vive en @UUID[Actor.abc]{el muelle}", points: 0 });

	assert.equal(data.type, "Feature");
	assert.equal(data.system.type, "wod.types.connection", "el sub-tipo no es el que las dos hojas leen");
	assert.equal(data.system.relation, "node", "el Rasgo no se estampa, así que habría que teclearlo");
	assert.equal(data.system.points, 0, "el 0 explícito no sobrevivió a la creación");
	assert.ok(data.system.description.includes("@UUID[Actor.abc]"),
		"la Nota no pasa a `description`, que es el único campo por el que corre el enriquecedor");

	const blank = censusItemData("guardian");
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

	assert.match(ES["wod.chantry.roster.empty"], /desbloquea/i, "el estado vacío no dice que hay que desbloquear");
	assert.match(ES["wod.chantry.roster.empty"], /pesta[ñn]a/i, "el estado vacío sigue sin hablar de la pestaña");
	// El estado vacío ya no debe nombrar los OCHO Rasgos del Dossier, sino los TRES de hoy.
	assert.match(ES["wod.chantry.roster.empty"], /Guardi[aá]n/i, "el estado vacío no menciona a Guardián");
	assert.match(ES["wod.chantry.roster.empty"], /Personal/i, "el estado vacío no menciona el bloque Personal");
	assert.match(ES["wod.chantry.roster.empty"], /Nodo/i, "el estado vacío no menciona el Nodo");
	assert.ok(!/aliados, criados, esp[ií]as/i.test(ES["wod.chantry.roster.empty"]),
		"el estado vacío sigue enumerando los ocho Rasgos del Dossier retirados");
	assert.match(EN["wod.chantry.roster.empty"], /unlock/i);
	assert.match(EN["wod.chantry.roster.empty"], /tab/i);
});

test("el título de la pestaña dice «Censo» y NO «Aliados y contactos»", () => {
	assert.equal(ES["wod.chantry.roster.headline"], "Censo");
	assert.notEqual(ES["wod.chantry.roster.headline"], ES["wod.tab.connections"],
		"la pestaña se titularía con la del PJ, que es falsa para Guardián/Personal/Nodo");
	assert.equal(typeof EN["wod.chantry.roster.headline"], "string");
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

	assert.ok(ES["wod.connections.points"].length <= 45);
});

/* ---- 7. EL POPUP RETIRADO: que no vuelva por la puerta de atrás ---- */

test("el censo ya no construye HTML a mano en ninguna parte de la hoja", () => {
	const sheet = fs.readFileSync(
		path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet-v2.js"), "utf8");

	assert.ok(!/_rosterDescription\s*\(/.test(sheet), "volvió el constructor de HTML del popup del censo");
	assert.ok(!/ItemViewer\.open\(\{[\s\S]{0,400}ChantryRoster/.test(sheet),
		"el icono del censo vuelve a abrir un ItemViewer: el censo se ofrecería desde dos sitios");
	assert.ok(/_activateCensusTab/.test(sheet), "el icono del censo ya no navega a la pestaña");

	for (const gone of ["onRosterAdd", "onRosterDelete", "_writeRoster", "_rostersForWrite"]) {
		assert.ok(!new RegExp(`${gone}\\s*[(=]`).test(sheet), `${gone} sigue en la hoja tras retirar el portador viejo`);
	}
});

console.log(failures ? `\n${failures} FALLO(S)` : "\nTodas las pruebas del censo de la Capilla pasan.");
process.exit(failures ? 1 : 0);
