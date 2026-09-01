/**
 * recompute-totals-on-actor-import (opción A2) -- design.md D1/D3: un `PC` recién creado por
 * `Actor.create(doc)` con Items YA embebidos (la misma llamada que hace
 * `worldofdarkness-import-actor`) no dispara `calculateTotals` por ningún camino existente --
 * `_onUpdate` y `_onUpdateDescendantDocuments` excluyen explícitamente `type === "PC"` a
 * propósito (es un mecanismo pensado para NPC/Criatura/Espíritu). `module/scripts/
 * recompute-on-create.js` espeja ese mecanismo solo para la creación, sin tocar los otros dos.
 *
 *     node --test tests/*.test.mjs               <- pasa el GLOB. `node --test tests/` falla
 *                                                    en Node 25 y se lee como suite roja.
 *     node tests/recompute-on-create.test.mjs     <- este fichero solo
 *
 * LA REGLA que este gate vigila, dicha una vez para no escribir el test desde la
 * implementación: "un `PC` recién creado que trae Items tiene sus totales derivados YA
 * calculados, sin ninguna acción posterior" (spec `wodchar-foundry-actor-import`, primer
 * Requirement). Por eso NINGÚN fixture de abajo con la etiqueta "recalcula" está vacío de
 * Items -- un fixture sin Items pasaría por vacío y no probaría nada (el defecto más repetido
 * de este proyecto, documentado en HANDOFF.md §3).
 *
 * Deliberadamente sin Foundry: `recompute-on-create.js` no importa `game`/`CONFIG`/
 * `foundry.utils`, así que se puede ejecutar la lógica real (no una réplica) con fixtures
 * planas, igual que `armor-dexpenalty.test.mjs` hace con `applyDexPenaltyCorrections`.
 *
 * MUTATION-TESTEADO, no solo escrito: se rompió cada una de las tres condiciones de
 * `shouldRecomputeTotalsOnCreate` una por una (comentando el `type !== "PC"`, el `itemCount
 * === 0`, el `permission < 3`) y las tres veces al menos un test de este fichero se puso en
 * ROJO -- reportado en el commit/informe de esta sesión, no solo afirmado aquí. También se
 * probó el cableado en `wod-actor-base.js`: quitar la llamada a `recomputeTotalsOnCreate` de
 * `_onCreate` puso en rojo el test de cableado de más abajo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
	shouldRecomputeTotalsOnCreate,
	recomputeTotalsOnCreate
} from "../module/scripts/recompute-on-create.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(join(ROOT, rel), "utf8");

let failures = 0;

function test(name, fn) {
	try {
		const result = fn();
		if (result instanceof Promise) return result.then(
			() => console.log(`  ok - ${name}`),
			err => { failures++; console.error(`  FAIL - ${name}`); console.error(`    ${err.message}`); });
		console.log(`  ok - ${name}`);
	}
	catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.message}`);
	}
	return undefined;
}

/** Un stub de Item embebido -- solo hace falta que EXISTA para que items.size/.length > 0. */
function stubItem(name = "un item") {
	return { name, type: "Armor", system: {} };
}

/**
 * Un stub de Actor `PC` con Items reales (array plano, como `armor-dexpenalty.test.mjs` usa
 * para sus Items) y un `.update()` que registra cada llamada, para poder afirmar CUÁNTAS
 * escrituras produce -- el propio coste que el diseño acota a "una por actor, nunca más".
 */
function pcActorWithItems(itemCount, { permission = 3, failing = false } = {}) {
	const actor = {
		type: "PC",
		name: "Personaje de prueba",
		items: Array.from({ length: itemCount }, (_, i) => stubItem(`item ${i}`)),
		permission,
		system: { settings: {} },
		updates: [],
		async update(data) {
			if (failing) throw new Error("simulado: sin permiso de escritura");
			actor.updates.push(data);
		}
	};
	return actor;
}

// =============================================================================================
console.log("shouldRecomputeTotalsOnCreate — la REGLA: solo PC, solo con Items, solo con OWNER");
// =============================================================================================

test("un PC recién creado CON Items y permiso de OWNER debe recalcular", () => {
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(48)), true);
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(1)), true);
});

test("un PC SIN Items no recalcula -- la ficha en blanco de la UI, coste cero", () => {
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(0)), false);
	assert.equal(shouldRecomputeTotalsOnCreate({ type: "PC", items: [], permission: 3 }), false);
	assert.equal(shouldRecomputeTotalsOnCreate({ type: "PC", permission: 3 }), false, "sin `items` en absoluto");
});

test("un tipo que NO es PC nunca recalcula por aquí, aunque traiga Items y OWNER -- ese es el mecanismo isupdated, sin tocar", () => {
	for (const type of ["Chantry", "creature", "NPC", "Spirit"]) {
		assert.equal(shouldRecomputeTotalsOnCreate({ type, items: [stubItem()], permission: 3 }), false, type);
	}
});

test("sin permiso de OWNER (nivel 3) no escribe, aunque traiga Items -- un observador no debe intentar un update que Foundry rechazaría", () => {
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(5, { permission: 0 })), false);
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(5, { permission: 1 })), false);
	assert.equal(shouldRecomputeTotalsOnCreate(pcActorWithItems(5, { permission: 2 })), false);
});

test("permiso AUSENTE se trata como sin permiso, no como sin restricción", () => {
	assert.equal(shouldRecomputeTotalsOnCreate({ type: "PC", items: [stubItem()] }), false);
});

test("un `items` tipo Collection (con `.size`, no `.length`) también cuenta -- el caso real de un Actor de Foundry", () => {
	const collectionLike = { size: 3 };
	assert.equal(shouldRecomputeTotalsOnCreate({ type: "PC", items: collectionLike, permission: 3 }), true);
	assert.equal(shouldRecomputeTotalsOnCreate({ type: "PC", items: { size: 0 }, permission: 3 }), false);
});

test("un actor nulo o indefinido no lanza y no recalcula", () => {
	assert.equal(shouldRecomputeTotalsOnCreate(undefined), false);
	assert.equal(shouldRecomputeTotalsOnCreate(null), false);
});

// =============================================================================================
console.log("recomputeTotalsOnCreate — el efecto real: UNA escritura, con isupdated=true, o ninguna");
// =============================================================================================

await test("un PC con Items recalcula: llama a duplicate+calculateTotals, escribe UNA vez, marca isupdated=true", async () => {
	const actor = pcActorWithItems(48);
	let duplicateCalls = 0, calculateTotalsCalls = 0;

	const did = await recomputeTotalsOnCreate(actor, {
		duplicate: (a) => { duplicateCalls++; return { ...a, system: { ...a.system, settings: { ...a.system.settings } } }; },
		calculateTotals: async (a) => { calculateTotalsCalls++; a.system.attributes = { dexterity: { total: -2 } }; return a; }
	});

	assert.equal(did, true);
	assert.equal(duplicateCalls, 1);
	assert.equal(calculateTotalsCalls, 1);
	assert.equal(actor.updates.length, 1, "exactamente UNA escritura -- coste O(actores), no O(items)");
	assert.equal(actor.updates[0].system.settings.isupdated, true);
	assert.deepEqual(actor.updates[0].system.attributes, { dexterity: { total: -2 } });
});

await test("un PC sin Items no llama a nada y no escribe -- coste cero, medido, no solo dicho", async () => {
	const actor = pcActorWithItems(0);
	let calls = 0;

	const did = await recomputeTotalsOnCreate(actor, {
		duplicate: () => { calls++; return {}; },
		calculateTotals: async (a) => { calls++; return a; }
	});

	assert.equal(did, false);
	assert.equal(calls, 0);
	assert.equal(actor.updates.length, 0);
});

await test("un fallo en el update (p.ej. sin permiso real pese a pasar la comprobación) se registra y se traga -- no aborta la creación", async () => {
	const actor = pcActorWithItems(3, { failing: true });
	const seen = [];

	const did = await recomputeTotalsOnCreate(actor, {
		duplicate: (a) => ({ ...a }),
		calculateTotals: async (a) => a,
		logger: (err) => seen.push(err)
	});

	assert.equal(did, false);
	assert.equal(seen.length, 1);
	assert.match(seen[0].message, /Cannot recalculate totals/);
	assert.equal(actor.updates.length, 0);
});

await test("N actores con M items cada uno cuestan N escrituras, no N*M -- el coste que el diseño acota para un import masivo", async () => {
	const actors = [pcActorWithItems(48), pcActorWithItems(20), pcActorWithItems(1)];
	for (const actor of actors) {
		await recomputeTotalsOnCreate(actor, {
			duplicate: (a) => ({ ...a }),
			calculateTotals: async (a) => a
		});
	}
	assert.deepEqual(actors.map(a => a.updates.length), [1, 1, 1]);
});

// =============================================================================================
console.log("wod-actor-base.js — el cableado: _onCreate llama a esto, y las exclusiones existentes de PC siguen intactas");
// =============================================================================================

const ACTOR_BASE = read("module/actor/data/wod-actor-base.js");

test("_onCreate importa y llama a recomputeTotalsOnCreate, DESPUÉS de super._onCreate", () => {
	const m = /async _onCreate\(data, options, userId\) \{([\s\S]*?)\n {4}\}/.exec(ACTOR_BASE);
	assert.ok(m, "_onCreate no encontrado con la forma esperada -- ¿se ha restructurado?");
	const body = m[1];
	const superIdx = body.indexOf("super._onCreate(");
	const recomputeIdx = body.indexOf("recomputeTotalsOnCreate(");
	assert.ok(superIdx >= 0, "_onCreate ya no llama a super._onCreate");
	assert.ok(recomputeIdx >= 0, "_onCreate ya no llama a recomputeTotalsOnCreate");
	assert.ok(recomputeIdx > superIdx, "recomputeTotalsOnCreate se llama ANTES que super._onCreate");
});

test("recomputeTotalsOnCreate se llama sobre `this`, con duplicate y calculateTotals reales", () => {
	const call = /recomputeTotalsOnCreate\(this,\s*\{([\s\S]*?)\}\)/.exec(ACTOR_BASE);
	assert.ok(call, "recomputeTotalsOnCreate no se llama sobre `this`");
	assert.match(call[1], /duplicate:\s*foundry\.utils\.duplicate/);
	assert.match(call[1], /calculateTotals(?!:)/, "no pasa la función calculateTotals real");
});

test("_onUpdate SIGUE excluyendo a PC de su recálculo automático -- este cambio no lo reactiva", () => {
	assert.match(ACTOR_BASE, /if \(this\.type !== "PC"\) \{/,
		"la exclusión de PC en _onUpdate ha desaparecido -- eso es un cambio DISTINTO al de este gate");
});

test("_onUpdateDescendantDocuments SIGUE excluyendo a PC (y Chantry) -- este cambio no lo toca", () => {
	assert.match(ACTOR_BASE, /if \(this\.type === "PC" \|\| this\.type === "Chantry"\) return;/,
		"la exclusión de PC/Chantry en _onUpdateDescendantDocuments ha desaparecido");
});

test("sin reentrada: recomputeTotalsOnCreate escribe SOLO con actor.update(...), nunca con updateEmbeddedDocuments/createEmbeddedDocuments -- no puede disparar _onUpdateDescendantDocuments", () => {
	const RECOMPUTE = read("module/scripts/recompute-on-create.js");
	assert.match(RECOMPUTE, /await actor\.update\(actorData\)/);
	assert.ok(!/EmbeddedDocuments/.test(RECOMPUTE),
		"recompute-on-create.js toca Items embebidos -- eso SÍ dispararía _onUpdateDescendantDocuments");
});

console.log("");
if (failures) {
	console.error(`${failures} recompute-on-create test(s) FAILED.`);
	process.exit(1);
}
console.log("All recompute-on-create tests passed.");
