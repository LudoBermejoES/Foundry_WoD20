/**
 * fix-formula-casting task 4.4 — exercises the pure pool-resolution logic in
 * `module/scripts/formula-casting-helpers.js` (the load-bearing half of D3/D5's fix: whether a
 * cast rolls Atributo+Habilidad instead of Areté, and what that pool's value is). Plain node, no
 * framework: `node tests/formula-casting.test.mjs`, following `tests/prism-of-focus.test.mjs`'s own
 * convention. `dialog-aretecasting.js`/`dialog-casting.js` themselves are NOT imported here — both
 * extend `FormApplication` at module load and this repo has no Foundry-global stub/fixture yet
 * (same boundary `prism-of-focus.test.mjs`'s own header note draws); their wiring onto these pure
 * functions is verified by manual code trace only (see this change's tasks.md 4.1-4.3).
 */
import assert from "node:assert/strict";

import {
	isFormulaRoll,
	resolveAttributeRating,
	resolveAbilityRating,
	resolveFormulaPoolValue
} from "../module/scripts/formula-casting-helpers.js";

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

console.log("formula-casting-helpers.js");

test("isFormulaRoll is true only when BOTH attribute and ability are non-empty", () => {
	assert.equal(isFormulaRoll({ attribute: "perception", ability: "cosmology" }), true);
	assert.equal(isFormulaRoll({ attribute: "perception", ability: "" }), false);
	assert.equal(isFormulaRoll({ attribute: "", ability: "cosmology" }), false);
	assert.equal(isFormulaRoll({ attribute: "", ability: "" }), false);
});

test("isFormulaRoll defaults to false for an improvised cast (no Rote at all)", () => {
	assert.equal(isFormulaRoll(undefined), false);
	assert.equal(isFormulaRoll({}), false);
});

test("resolveAttributeRating reads actor.system.attributes[key].total", () => {
	const actor = { system: { attributes: { perception: { total: 4, value: 3 } } } };
	assert.equal(resolveAttributeRating(actor, "perception"), 4);
});

test("resolveAttributeRating falls back to .value when .total is absent", () => {
	const actor = { system: { attributes: { perception: { value: 3 } } } };
	assert.equal(resolveAttributeRating(actor, "perception"), 3);
});

test("resolveAttributeRating is 0, not a throw, for an unrated/unknown Attribute", () => {
	assert.equal(resolveAttributeRating({ system: { attributes: {} } }, "perception"), 0);
	assert.equal(resolveAttributeRating({}, "perception"), 0);
	assert.equal(resolveAttributeRating(undefined, "perception"), 0);
});

test("resolveAbilityRating reads an owned PRIMARY Ability item by system.id", () => {
	const actor = {
		items: [
			{ type: "Ability", system: { id: "cosmology", total: 3, value: 2 } },
			{ type: "Ability", system: { id: "occult", total: 1 } }
		]
	};
	assert.equal(resolveAbilityRating(actor, "cosmology"), 3);
});

test("resolveAbilityRating falls back to a SECONDARY-ability Trait item by provenance flag", () => {
	const actor = {
		items: [
			{ type: "Ability", system: { id: "occult", total: 1 } },
			{
				type: "Trait",
				system: { type: "wod.types.knowledgesecondability", value: 2 },
				flags: { "wod20-compendium-es": { id: "cosmology-of-the-digital-web" } }
			}
		]
	};
	assert.equal(resolveAbilityRating(actor, "cosmology-of-the-digital-web"), 2);
});

test("resolveAbilityRating checks all three secondary-ability system.type values", () => {
	for (const type of ["wod.types.talentsecondability", "wod.types.skillsecondability", "wod.types.knowledgesecondability"]) {
		const actor = {
			items: [{ type: "Trait", system: { type, value: 4 }, flags: { "wod20-compendium-es": { id: "chapuzas" } } }]
		};
		assert.equal(resolveAbilityRating(actor, "chapuzas"), 4, `expected match for ${type}`);
	}
});

test("resolveAbilityRating is 0, not a throw, when no owned item matches", () => {
	assert.equal(resolveAbilityRating({ items: [] }, "cosmology"), 0);
	assert.equal(resolveAbilityRating({}, "cosmology"), 0);
	assert.equal(resolveAbilityRating(undefined, "cosmology"), 0);
});

test("resolveAbilityRating prefers the PRIMARY match when both a primary and an unrelated secondary exist", () => {
	const actor = {
		items: [
			{ type: "Ability", system: { id: "cosmology", total: 5 } },
			{ type: "Trait", system: { type: "wod.types.knowledgesecondability", value: 1 }, flags: { "wod20-compendium-es": { id: "other" } } }
		]
	};
	assert.equal(resolveAbilityRating(actor, "cosmology"), 5);
});

test("resolveFormulaPoolValue sums Attribute + Ability ratings (the 'Búsqueda de la Visión' shape)", () => {
	const actor = {
		system: { attributes: { perception: { total: 2 } } },
		items: [{ type: "Ability", system: { id: "cosmology", total: 3 } }]
	};
	assert.equal(resolveFormulaPoolValue(actor, "perception", "cosmology"), 5);
});

test("resolveFormulaPoolValue is 0 for an actor with neither the Attribute nor the Ability rated", () => {
	assert.equal(resolveFormulaPoolValue({ system: { attributes: {} }, items: [] }, "perception", "cosmology"), 0);
});

console.log(`\n${failures === 0 ? "All tests passed." : `${failures} test(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
