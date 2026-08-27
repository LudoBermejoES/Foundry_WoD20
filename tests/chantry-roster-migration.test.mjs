/**
 * add-chantry-roster-tab — LA MIGRACIÓN DEL CENSO, verificada POR CONTEO.
 *
 *     node --test tests/*.test.mjs                   <- pasa el GLOB. `node --test tests/` falla en
 *                                                       Node 25 y se lee como suite roja.
 *     node tests/chantry-roster-migration.test.mjs    <- este fichero solo
 *
 * ============================================================================================
 * POR QUÉ ESTA MIGRACIÓN SE PRUEBA CONTRA UN ACTOR SINTÉTICO Y NO CONTRA PRODUCCIÓN
 * ============================================================================================
 * Hay censo en producción: el actor `Chantry` `fRLzeQknTkx2Y6tn` («Capilla de Mekarchitek», carpeta
 * «Capillas») tiene CUATRO entradas en `system.traitRosters.allies` — Jim Haus, Raffela Diemer, John
 * Staub y Tzippi Jessel, `points: 1` cada una — y ninguna en los otros siete Rasgos. Es la única
 * Capilla del mundo con censo. Esa cifra la MIDIÓ el operador, no este fichero.
 *
 * La fixture de abajo es EXACTAMENTE esa forma, con esos cuatro nombres, para que lo que se prueba
 * aquí sea lo que va a pasar allí; pero la migración NO se ejecuta contra producción desde aquí. La
 * ejecución en vivo es un paso aparte y su verificación es la misma que ésta: por CONTEO.
 *
 * ============================================================================================
 * «PRESERVAR» ES UN CONTEO, NUNCA UN «ÉXITO»
 * ============================================================================================
 * Los dos defectos de pérdida silenciosa registrados en este proyecto REPORTARON ÉXITO los dos
 * (`manage-actors` devolvió `updated: 1` sobre un parche que había descartado, y una llamada zod
 * «válida» que había tirado la mitad del cuerpo). Así que no se prueba que la migración diga que fue
 * bien: se prueba que, Rasgo por Rasgo, salen los mismos nombres con los mismos puntos, y que un
 * nombre perdido, un punto cambiado o una entrada de más aparecen como DISCREPANCIA.
 *
 * `verifyCensusMigration` se prueba en las dos direcciones, que es lo que impide que sea un sello de
 * goma: primero contra una migración correcta (tiene que decir que cuadra) y después contra cuatro
 * roturas deliberadas (tiene que cazar cada una). Un verificador que solo se prueba con datos buenos
 * es un fixture demasiado limpio para fallar.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ES = (() => {
	const flat = {};
	(function walk(node, prefix) {
		for (const [key, value] of Object.entries(node)) {
			const full = prefix ? `${prefix}.${key}` : key;
			if (value && typeof value === "object") walk(value, full);
			else flat[full] = value;
		}
	})(JSON.parse(fs.readFileSync(path.join(ROOT, "lang", "es.json"), "utf8")), "");
	return flat;
})();

globalThis.game = { i18n: { localize: (k) => ES[k] ?? String(k ?? "") } };

const {
	MIGRATION_FLAG_SCOPE,
	MIGRATION_FLAG_KEY,
	hasCensusToMigrate,
	planCensusMigration,
	snapshotFromRosters,
	snapshotFromItems,
	verifyCensusMigration,
	formatCensusVerification
} = await import(pathToFileURL(path.join(ROOT, "module", "scripts", "chantry-roster-migration.js")).href);

const { censusItemData } = await import(
	pathToFileURL(path.join(ROOT, "module", "scripts", "chantry-census.js")).href);

let failures = 0;
/* `await`, porque la mitad de estas pruebas ejercitan el paseo, que es asíncrono. Un runner sync con
   una función async no espera nada y una prueba que falla pasa como verde — que es la forma de «un
   fixture demasiado limpio para fallar» aplicada al propio runner. */
async function test(name, fn) {
	try { await fn(); console.log(`  ok - ${name}`); }
	catch (err) { failures++; console.error(`  FAIL - ${name}`); console.error(`    ${err.message}`); }
}

/* ---- LA CAPILLA DE PRODUCCIÓN, en la forma medida ---- */
const MEKARCHITEK = () => ({
	allies: [
		{ name: "Jim Haus", note: "", points: 1 },
		{ name: "Raffela Diemer", note: "", points: 1 },
		{ name: "John Staub", note: "", points: 1 },
		{ name: "Tzippi Jessel", note: "", points: 1 }
	]
});

/**
 * Un Actor sintético con lo MÍNIMO que el paseo toca: `system.traitRosters`, una colección de Items
 * a la que se puede añadir, `setFlag` y `update`. Deliberadamente NO es un mock de Foundry: es la
 * superficie exacta que `migrateChantryRostersToItems` usa, así que si el paseo empieza a pedir algo
 * más, esto revienta en vez de pasar por casualidad.
 */
function syntheticChantry(rosters) {
	let nextId = 0;
	const actor = {
		name: "Capilla sintética",
		type: "Chantry",
		system: { traitRosters: structuredClone(rosters) },
		items: [],
		flags: {},
		async setFlag(scope, key, value) {
			const parts = `${scope}.${key}`.split(".");
			let node = actor.flags;
			while (parts.length > 1) node = (node[parts.shift()] ??= {});
			node[parts[0]] = structuredClone(value);
		},
		async createEmbeddedDocuments(type, data) {
			assert.equal(type, "Item", "la migración crea algo que no es un Item");
			for (const d of data) actor.items.push({ _id: `syn${nextId++}`, ...structuredClone(d) });
			return data;
		},
		async update(changes) {
			for (const [k, v] of Object.entries(changes)) {
				if (k === "system.traitRosters") actor.system.traitRosters = structuredClone(v);
				else throw new Error(`la migración escribe una clave inesperada: ${k}`);
			}
		}
	};
	return actor;
}

/** El paseo, reducido a lo que hace con UN actor — el mismo orden que `migrations.js`. */
async function migrateOne(actor) {
	if (!hasCensusToMigrate(actor.system.traitRosters)) return { touched: false };

	const before = snapshotFromRosters(actor.system.traitRosters);
	const plan = planCensusMigration(actor.system.traitRosters, censusItemData);

	await actor.setFlag(MIGRATION_FLAG_SCOPE, MIGRATION_FLAG_KEY, actor.system.traitRosters);
	await actor.createEmbeddedDocuments("Item", plan);

	const after = snapshotFromItems(actor.items);
	const result = verifyCensusMigration(before, after);

	if (result.ok) await actor.update({ "system.traitRosters": {} });

	return { touched: true, result: result, created: plan.length };
}

console.log("chantry census migration (chantry-roster-migration.js)");

/* ---- 1. LA CAPILLA REAL: cuatro entradas, cuatro Items, nombre a nombre ---- */

await test("las 4 entradas de la Capilla de Mekarchitek llegan como 4 Items, nombre a nombre", async () => {
	const actor = syntheticChantry(MEKARCHITEK());
	const { result, created } = await migrateOne(actor);

	assert.equal(created, 4, "no se planificaron 4 Items para 4 entradas");
	assert.deepEqual(result.perTrait, { allies: { before: 4, after: 4, matched: 4 } },
		`el conteo no cuadra: ${formatCensusVerification(result)}`);
	assert.deepEqual(result.mismatches, []);

	const names = actor.items.map((i) => i.name);
	assert.deepEqual(names, ["Jim Haus", "Raffela Diemer", "John Staub", "Tzippi Jessel"],
		"los nombres no sobreviven en orden");

	for (const item of actor.items) {
		assert.equal(item.type, "Feature");
		assert.equal(item.system.type, "wod.types.connection");
		assert.equal(item.system.relation, "allies", "una entrada perdió su Rasgo");
		assert.equal(item.system.points, 1, "una entrada perdió sus puntos");
	}
});

await test("el mapa original queda en la bandera ANTES de vaciarse, y se vacía después", async () => {
	const actor = syntheticChantry(MEKARCHITEK());
	await migrateOne(actor);

	assert.deepEqual(actor.flags.worldofdarkness.migration.traitRosters, MEKARCHITEK(),
		"el original no está en flags.worldofdarkness.migration.traitRosters: la operación no es reversible");
	assert.deepEqual(actor.system.traitRosters, {},
		"el mapa no se vació: dos portadores para un dato divergen");
});

await test("una segunda pasada no crea ni un Item más (el predicado ES la bandera)", async () => {
	const actor = syntheticChantry(MEKARCHITEK());
	await migrateOne(actor);
	const afterFirst = actor.items.length;

	const second = await migrateOne(actor);
	assert.equal(second.touched, false, "la segunda pasada volvió a migrar");
	assert.equal(actor.items.length, afterFirst, "la segunda pasada creó Items de más");
});

await test("una Capilla sin censo no se toca: ni Item, ni bandera, ni update", async () => {
	for (const empty of [{}, undefined, null, { allies: [] }, { inventado: [{ name: "x" }] }]) {
		const actor = syntheticChantry(empty ?? {});
		actor.system.traitRosters = empty;
		const out = await migrateOne(actor);

		assert.equal(out.touched, false, `se migró un censo vacío: ${JSON.stringify(empty)}`);
		assert.equal(actor.items.length, 0);
		assert.deepEqual(actor.flags, {}, "se escribió una bandera en una Capilla sin censo");
	}
});

/* ---- 2. VARIOS RASGOS, Y EL 0 EXPLÍCITO ---- */

await test("varios Rasgos a la vez, con el 0 explícito conservado", async () => {
	const actor = syntheticChantry({
		allies: [{ name: "Nadia", note: "contacto en el puerto", points: 1 }],
		library: [{ name: "Copia del Codex", note: "", points: 0 }, { name: "Grimorio", note: "", points: 0 }],
		spies: [{ name: "Rata", note: "", points: 2 }]
	});

	const { result } = await migrateOne(actor);

	assert.deepEqual(result.perTrait, {
		allies: { before: 1, after: 1, matched: 1 },
		library: { before: 2, after: 2, matched: 2 },
		spies: { before: 1, after: 1, matched: 1 }
	}, formatCensusVerification(result));

	const codex = actor.items.find((i) => i.name === "Copia del Codex");
	assert.equal(codex.system.points, 0, "el 0 explícito se convirtió en 1 al migrar");

	// La Nota pasa a `description`, que es el campo por el que corre el enriquecedor.
	const nadia = actor.items.find((i) => i.name === "Nadia");
	assert.equal(nadia.system.description, "contacto en el puerto", "la Nota se perdió al migrar");
});

await test("una entrada sin points migra valiendo 1, como valía cuando la pintaba el bloque viejo", async () => {
	const actor = syntheticChantry({ allies: [{ name: "Sin puntos" }] });
	await migrateOne(actor);
	assert.equal(actor.items[0].system.points, 1);
});

/* ---- 3. EL VERIFICADOR, EN LA DIRECCIÓN QUE IMPORTA: ¿caza una pérdida? ---- */

await test("el verificador CAZA una entrada perdida, un nombre cambiado, un punto cambiado y una de más", () => {
	const before = snapshotFromRosters(MEKARCHITEK());

	const items = (list) => list.map((e) => ({
		name: e.name, type: "Feature",
		system: { type: "wod.types.connection", relation: "allies", points: e.points }
	}));

	const full = [
		{ name: "Jim Haus", points: 1 }, { name: "Raffela Diemer", points: 1 },
		{ name: "John Staub", points: 1 }, { name: "Tzippi Jessel", points: 1 }
	];

	// Control: sin roturas, cuadra. Si esto fallara, todo lo de abajo sería ruido.
	const good = verifyCensusMigration(before, snapshotFromItems(items(full)));
	assert.equal(good.ok, true, `el control no cuadra: ${formatCensusVerification(good)}`);
	assert.equal(good.perTrait.allies.matched, 4);

	// (a) una entrada PERDIDA — el defecto que esta migración existe para no cometer.
	const lost = verifyCensusMigration(before, snapshotFromItems(items(full.slice(0, 3))));
	assert.equal(lost.ok, false, "perder una entrada de cuatro pasó como éxito");
	assert.equal(lost.perTrait.allies.after, 3);
	assert.match(lost.mismatches.join(" "), /Tzippi Jessel/, "la discrepancia no dice QUÉ se perdió");

	// (b) un NOMBRE cambiado — un conteo a secas no lo vería.
	const renamed = verifyCensusMigration(before,
		snapshotFromItems(items([...full.slice(0, 3), { name: "Otro", points: 1 }])));
	assert.equal(renamed.ok, false, "cuatro entradas con un nombre distinto pasaron como éxito");
	assert.equal(renamed.perTrait.allies.after, 4, "el conteo por sí solo habría dicho 4 == 4");
	assert.match(renamed.mismatches.join(" "), /Tzippi Jessel/);

	// (c) unos PUNTOS cambiados — la otra mitad que un conteo no ve.
	const repointed = verifyCensusMigration(before,
		snapshotFromItems(items([...full.slice(0, 3), { name: "Tzippi Jessel", points: 3 }])));
	assert.equal(repointed.ok, false, "un cambio de puntos pasó como éxito");
	assert.match(repointed.mismatches.join(" "), /puntos 1 -> 3/);

	// (d) una entrada DE MÁS — una segunda pasada mal hecha.
	const doubled = verifyCensusMigration(before,
		snapshotFromItems(items([...full, { name: "Jim Haus", points: 1 }])));
	assert.equal(doubled.ok, false, "una entrada duplicada pasó como éxito");
	assert.equal(doubled.perTrait.allies.after, 5);
});

await test("si la verificación NO cuadra, el mapa original NO se vacía", async () => {
	const actor = syntheticChantry(MEKARCHITEK());

	// Se rompe la creación a propósito: crea una entrada de menos, que es la forma de la pérdida
	// silenciosa. El paseo tiene que dejar el dato en los dos portadores, no en ninguno.
	const realCreate = actor.createEmbeddedDocuments;
	actor.createEmbeddedDocuments = (type, data) => realCreate.call(actor, type, data.slice(0, 3));

	const { result } = await migrateOne(actor);

	assert.equal(result.ok, false, "la pérdida no se detectó");
	assert.deepEqual(actor.system.traitRosters, MEKARCHITEK(),
		"se vació el mapa con la verificación en rojo: el dato quedaría en NINGÚN portador");
});

await test("snapshotFromItems ignora lo que no es una entrada de censo", () => {
	const snapshot = snapshotFromItems([
		{ name: "Chaleco", type: "Armor", system: {} },
		{ name: "Un Trasfondo", type: "Feature", system: { type: "wod.types.background", relation: "allies" } },
		{ name: "Perdido", type: "Feature", system: { type: "wod.types.connection", relation: "alies", points: 1 } },
		{ name: "Nadia", type: "Feature", system: { type: "wod.types.connection", relation: "allies", points: 1 } }
	]);

	assert.deepEqual(snapshot, { allies: [{ name: "Nadia", points: 1 }] },
		"el conteo cuenta cosas que no son entradas del censo, o se traga las que sí");
});

/* ---- 4. QUE EL PASEO DE VERDAD SIGA HACIENDO ESTO, EN ESTE ORDEN ---- */

await test("el paseo real de migrations.js hace las cuatro escrituras en el orden que las hace migrateOne", () => {
	/* `migrateOne` de arriba es una RÉPLICA del paseo, porque el de verdad necesita `game.actors`,
	   `game.scenes` y `foundry.utils` y montar eso aquí sería montar Foundry. Una réplica puede
	   DERIVAR del original y entonces estas nueve pruebas estarían midiendo otra cosa, así que se lee
	   el fuente del paseo y se comprueba que las cuatro escrituras siguen ahí Y EN ORDEN. El orden es
	   lo load-bearing: si el `update` que vacía el mapa se adelantara al `verifyCensusMigration`, un
	   fallo entre medias dejaría el dato en NINGÚN portador. */
	const walk = fs.readFileSync(path.join(ROOT, "module", "migrations.js"), "utf8");
	const body = /export async function migrateChantryRostersToItems\(\)[\s\S]*?\n}/.exec(walk);
	assert.ok(body, "no se encuentra migrateChantryRostersToItems en module/migrations.js");

	const src = body[0];
	const steps = ["setFlag(", "createEmbeddedDocuments(", "verifyCensusMigration(", '"system.traitRosters": {}'];
	let at = -1;
	for (const step of steps) {
		const idx = src.indexOf(step, at + 1);
		assert.ok(idx > at, `el paseo no hace \`${step}\` después de lo anterior (orden roto o paso ausente)`);
		at = idx;
	}

	// Y el vaciado tiene que estar detrás de un `if (!result.ok) … continue`, no suelto.
	assert.match(src, /if \(!result\.ok\)[\s\S]{0,400}continue;/,
		"el paseo vacía el mapa sin comprobar antes que la verificación cuadre");

	// El predicado, y que sea el ÚNICO gate (sin bandera por actor).
	assert.match(src, /hasCensusToMigrate\(/, "el paseo no usa el predicado del censo");
	assert.ok(!/getFlag\(/.test(src), "el paseo lee una bandera por actor: el predicado debía ser la bandera");
});

console.log(failures ? `\n${failures} FALLO(S)` : "\nTodas las pruebas de la migración del censo pasan.");
process.exit(failures ? 1 : 0);
