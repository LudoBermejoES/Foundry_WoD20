/**
 * ghoul-is-a-mortal-with-a-vampire-sheet — node pelado, sin framework
 * (`node --test tests/*.test.mjs`, con el GLOB: pasar el DIRECTORIO falla en Node 25 y se lee como
 * suite roja).
 *
 * Cubre la mitad de FUNCIÓN PURA de la regla del Ghoul: las constantes del libro, la lectura de
 * `CONFIG` y — la que importa — de qué eje se saca «esto es un Ghoul».
 *
 * La otra mitad (que `_prepareCharacterData` de verdad NO aplique la tabla de Generación a un
 * Ghoul, y que `getPowertype` le siga dando Disciplinas) necesita cargar el árbol de módulos con
 * los globales de Foundry simulados, así que vive en la puerta del preflight,
 * `.github/scripts/test-ghoul.mjs`, que sí corre en CI. Este fichero NO corre en CI: la batería de
 * `tests/` es una puerta LOCAL.
 */
import assert from "node:assert/strict";

import {
	isGhoul,
	ghoulBloodpoolLimits,
	GHOUL_BLOODPOOL_MAX,
	GHOUL_BLOODPOOL_START,
	GHOUL_BLOOD_PERTURN,
} from "../module/actor/data/ghoul-bloodpool.js";

let failures = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ok - ${name}`);
	} catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.message}`);
	}
}

console.log("ghoul-bloodpool.js");

test("las constantes son las del libro: reserva 2, inicio 1, gasto 1", () => {
	// v20-core-rulebook-es L15366: «los Ghouls empiezan con un punto de Sangre, y tienen una
	// reserva de Sangre de 2 o más, dependiendo de su edad».
	assert.equal(GHOUL_BLOODPOOL_MAX, 2);
	// v20-core-rulebook-es L15308: «reserva de Sangre (1)».
	assert.equal(GHOUL_BLOODPOOL_START, 1);
	assert.equal(GHOUL_BLOOD_PERTURN, 1);
});

test("isGhoul lee `settings.variant`, que es el eje que dice QUÉ ES", () => {
	assert.equal(isGhoul({ system: { settings: { variant: "ghoul" } } }), true);
});

test("isGhoul NO lee `variantsheet` — un Ghoul es `variantsheet: vampire` a propósito", () => {
	// Éste es el defecto entero en una línea. Un Ghoul lleva la hoja de vampiro para que sus
	// poderes sean Disciplinas; si la regla de la Sangre preguntara por ahí, respondería «vampiro»
	// y le devolvería la tabla de Generación.
	assert.equal(isGhoul({ system: { settings: { variant: "ghoul", variantsheet: "vampire" } } }), true);
	assert.equal(isGhoul({ system: { settings: { variant: "general", variantsheet: "vampire" } } }), false);
	assert.equal(isGhoul({ system: { settings: { variant: "general", splat: "vampire" } } }), false);
});

test("isGhoul no confunde a las otras variantes de mortal, que también llevan hoja prestada", () => {
	// `kinfolk` -> werewolf, `enchanted`/`autumnpeople` -> changeling, `sorcerer` -> mage
	// (create-helpers.js, SetMortalVariant). Ninguna es un Ghoul.
	for (const variant of ["kinfolk", "enchanted", "autumnpeople", "sorcerer", "truefaith", "general"]) {
		assert.equal(isGhoul({ system: { settings: { splat: "mortal", variant } } }), false, variant);
	}
});

test("isGhoul tolera un actor a medio construir en vez de lanzar", () => {
	// Se llama desde `prepareDerivedData`, que corre sobre documentos en cualquier estado.
	for (const actor of [undefined, null, {}, { system: {} }, { system: { settings: {} } }]) {
		assert.equal(isGhoul(actor), false);
	}
});

test("ghoulBloodpoolLimits cae a las constantes cuando no hay CONFIG (fuera de Foundry)", () => {
	assert.deepEqual(ghoulBloodpoolLimits(), { max: 2, perturn: 1, start: 1 });
});

test("ghoulBloodpoolLimits prefiere CONFIG.worldofdarkness.ghoul cuando existe", () => {
	// El día que exista un campo de edad en la ficha (v20 L15432: +1 por siglo para Aparecidos,
	// +1 por cada dos siglos para los demás), éste es el único sitio donde hay que enchufarlo.
	const previous = globalThis.CONFIG;
	globalThis.CONFIG = { worldofdarkness: { ghoul: { bloodpoolmax: 6, bloodperturn: 2, bloodpoolstart: 3 } } };
	try {
		assert.deepEqual(ghoulBloodpoolLimits(), { max: 6, perturn: 2, start: 3 });
	} finally {
		if (previous === undefined) delete globalThis.CONFIG;
		else globalThis.CONFIG = previous;
	}
});

test("ghoulBloodpoolLimits ignora un CONFIG con basura y vuelve a las constantes", () => {
	const previous = globalThis.CONFIG;
	globalThis.CONFIG = { worldofdarkness: { ghoul: { bloodpoolmax: "dos", bloodperturn: null } } };
	try {
		assert.deepEqual(ghoulBloodpoolLimits(), { max: 2, perturn: 1, start: 1 });
	} finally {
		if (previous === undefined) delete globalThis.CONFIG;
		else globalThis.CONFIG = previous;
	}
});

if (failures > 0) {
	console.error(`\n${failures} comprobación(es) del Ghoul en rojo.`);
	process.exit(1);
}

console.log("\nTodas las comprobaciones puras del Ghoul en verde.");
