/**
 * add-mage-resonance — plain node, no framework (`node tests/resonance.test.mjs`), same convention
 * `prism-of-focus.test.mjs` established. Exercises only the PURE-FUNCTION half (the flavor-id
 * table and `isPlayerFacingResonanceMark`'s discriminator) — the dialog/sheet wiring is verified by
 * manual code trace + the deploy-gate guard scripts (template-structure-check, sheet-invariants,
 * binder-selector-check, ...), not by this file.
 */
import assert from "node:assert/strict";

import {
	RESONANCE_FLAVOR_IDS,
	RESONANCE_FLAVOR_LABEL_KEY,
	isPlayerFacingResonanceMark,
} from "../module/scripts/resonance-data.js";

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

console.log("resonance-data.js");

test("exactly the 7 flavor ids wodchar's listMageResonanceFlavors() exports as entityRef", () => {
	assert.deepEqual(RESONANCE_FLAVOR_IDS, [
		"devoted-resonance",
		"elemental-resonance",
		"stabilizing-resonance",
		"temperamental-resonance",
		"dynamic-synergy",
		"entropic-synergy",
		"static-synergy",
	]);
});

test("every flavor id has a label key", () => {
	for (const id of RESONANCE_FLAVOR_IDS) {
		assert.ok(RESONANCE_FLAVOR_LABEL_KEY[id], `missing label key for ${id}`);
		assert.match(RESONANCE_FLAVOR_LABEL_KEY[id], /^wod\.resonance\.flavor\./);
	}
});

test("isPlayerFacingResonanceMark accepts all 7 known flavors", () => {
	for (const category of RESONANCE_FLAVOR_IDS) {
		assert.equal(isPlayerFacingResonanceMark({ system: { category } }), true, category);
	}
});

test("isPlayerFacingResonanceMark rejects an internal counter with no category (the corrupted-Práctica track / a bare Jhor item)", () => {
	assert.equal(isPlayerFacingResonanceMark({ system: { category: "" } }), false);
	assert.equal(isPlayerFacingResonanceMark({ system: {} }), false);
	assert.equal(isPlayerFacingResonanceMark({ system: { category: undefined } }), false);
});

test("isPlayerFacingResonanceMark rejects an unrelated/unknown category string", () => {
	assert.equal(isPlayerFacingResonanceMark({ system: { category: "jhor" } }), false);
	assert.equal(isPlayerFacingResonanceMark({ system: { category: "vamamarga-jhor-resonance" } }), false);
});

test("isPlayerFacingResonanceMark tolerates a missing system entirely (never throws)", () => {
	assert.equal(isPlayerFacingResonanceMark({}), false);
});

console.log(`\n${failures === 0 ? "All resonance pure-function tests passed." : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
