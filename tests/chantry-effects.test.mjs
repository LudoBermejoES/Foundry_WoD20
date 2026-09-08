/**
 * rebuild-chantry-book-of-chantries-only — `chantry-effects.js`'s pure rules, against the book's
 * own tables and worked examples, after the Dossier's 19 linear Traits, its 2x/1x rating cap and
 * Integrated Effects are all retired outright (design.md D1/D2/D8).
 *
 *     node --test tests/*.test.mjs        <- pass the GLOB. `node --test tests/` fails on Node 25
 *                                            and reads as a red suite.
 *     node tests/chantry-effects.test.mjs <- this file alone
 *
 * Same convention as `prism-of-focus.test.mjs`/`formula-casting.test.mjs`/`resonance.test.mjs`:
 * plain node, no framework, no Foundry. `module/scripts/chantry-effects.js` imports nothing and
 * touches no global, which is what makes that possible.
 */
import assert from "node:assert/strict";

import {
	SPHERE_KEYS,
	ROSTER_TRAIT_KEYS,
	LEGACY_TRAITROSTERS_MAP_KEYS,
	hasRoster,
	normalisePoints,
	normaliseRosters,
	evaluateItemRosters,
	rosterAllowedValues,
	BOOK_OF_CHANTRIES_TRAIT_KEYS,
	BOOK_OF_CHANTRIES_LEVEL_COSTS,
	isBookOfChantriesTrait,
	bookTraitLevelCost,
	computeWardsDefensiveWards,
	LABORATORIES_PREFERENTIAL_COST,
	computeLaboratoriesPreferential,
	REALM_SIZE_LEVELS,
	REALM_NODE_SIZE_LEVELS,
	REALM_HAS_REALM_COST,
	REALM_NODE_HAS_NODE_COST,
	REALM_NODE_NAMED_COST,
	computeSphereShiftCost,
	computeRealmCost,
	realmQuintessenceUpkeepPerDay,
	PERSONNEL_STAFF_TIER_LEVELS,
	PERSONNEL_STAFF_LOYALTY_LEVELS,
	PERSONNEL_HEREDITARY_STAFF_COST,
	PERSONNEL_MILITARY_COST,
	PERSONNEL_CONSORT_COST_PER_POWER_LEVEL,
	personnelLevelCost,
	computeConsortsCost,
	computePersonnelCost
} from "../module/scripts/chantry-effects.js";

let failures = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ok - ${name}`);
	}
	catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.message}`);
	}
}

console.log("chantry-effects.js — the seven book-of-chantries Traits (design.md D6)");

test("exactly seven Traits are table-priced, laboratories included", () => {
	assert.deepEqual([...BOOK_OF_CHANTRIES_TRAIT_KEYS], [
		"guardian", "fortification", "wards", "trap-system", "alarm-system", "research-library",
		"laboratories"
	]);
	assert.equal(BOOK_OF_CHANTRIES_TRAIT_KEYS.length, 7);
	for (const key of BOOK_OF_CHANTRIES_TRAIT_KEYS) assert.equal(isBookOfChantriesTrait(key), true, key);
	assert.equal(isBookOfChantriesTrait("allies"), false, "the Dossier's Traits are retired, not table-priced");
});

test("guardian's table: Sin Guardián -10 through Ridículo +20", () => {
	assert.deepEqual([...BOOK_OF_CHANTRIES_LEVEL_COSTS.guardian], [-10, -5, 0, 5, 20]);
	assert.equal(bookTraitLevelCost("guardian", 0), -10);
	assert.equal(bookTraitLevelCost("guardian", 4), 20);
});

test("laboratories' table (design.md D6): Ninguno -10 / Inadecuados -5 / Superiores +5 / Vanguardistas +10", () => {
	assert.deepEqual([...BOOK_OF_CHANTRIES_LEVEL_COSTS.laboratories], [-10, -5, 5, 10]);
	assert.equal(bookTraitLevelCost("laboratories", 0), -10);
	assert.equal(bookTraitLevelCost("laboratories", 3), 10);
});

test("laboratories' own add-on, Trato Preferencial: -2 flat, never a scale", () => {
	assert.equal(LABORATORIES_PREFERENTIAL_COST, -2);
	assert.equal(computeLaboratoriesPreferential(true), -2);
	assert.equal(computeLaboratoriesPreferential(false), 0);
});

test("a level outside a table's own range degrades to undefined rather than throwing", () => {
	assert.equal(bookTraitLevelCost("guardian", 5), undefined);
	assert.equal(bookTraitLevelCost("guardian", -1), undefined);
	assert.equal(bookTraitLevelCost("guardian", null), undefined);
	assert.equal(bookTraitLevelCost("guardian", undefined), undefined);
});

test("wards' defensive add-on: 5 points and 1 aggravated damage per level", () => {
	assert.deepEqual(computeWardsDefensiveWards(2), { cost: 10, aggravatedDamage: 2 });
	assert.deepEqual(computeWardsDefensiveWards(0), { cost: 0, aggravatedDamage: 0 });
	assert.deepEqual(computeWardsDefensiveWards("nonsense"), { cost: 0, aggravatedDamage: 0 });
});

console.log("\nchantry-effects.js — the Realm+Node block (design.md D3/D4)");

test("the nine Sphere keys are unchanged — still used by sphereShifts", () => {
	assert.deepEqual([...SPHERE_KEYS], [
		"correspondence", "entropy", "forces", "life", "matter", "mind", "prime", "spirit", "time"
	]);
});

test("hasRealm costs 10, hasNode costs 5 — the book's own sentence: 'Cada Nodo cuesta cinco puntos, y un Reino del Horizonte cuesta 10'", () => {
	assert.equal(REALM_HAS_REALM_COST, 10);
	assert.equal(REALM_NODE_HAS_NODE_COST, 5);
	assert.equal(computeRealmCost({ hasRealm: true }), 10);
	assert.equal(computeRealmCost({ hasNode: true }), 5);
	assert.equal(computeRealmCost({ hasRealm: true, hasNode: true }), 15, "both purchases land in the SAME pool");
});

test("nodeNamed costs +5, same as the Realm's own Misceláneo refinements", () => {
	assert.equal(REALM_NODE_NAMED_COST, 5);
	assert.equal(computeRealmCost({ hasNode: true, nodeNamed: true }), 5 + 5);
});

test("nodeSize reuses the Realm's own size table WITHOUT the 6th 'Vasto' step", () => {
	assert.equal(REALM_NODE_SIZE_LEVELS.length, 5, "Vasto (+40) is Realm-only, book-of-chantries-es.md:5662-5673");
	assert.deepEqual([...REALM_NODE_SIZE_LEVELS], REALM_SIZE_LEVELS.slice(0, 5));
	assert.equal(computeRealmCost({ hasNode: true, nodeSize: 4 }), 5 + 15, "Enorme (+15), the last shared step");
});

test("nodeBattery/nodeTass are NEVER summed — informational only (design.md D3/D5)", () => {
	const withInfo = computeRealmCost({ hasNode: true, nodeSize: 2, nodeBattery: true, nodeTass: true });
	const withoutInfo = computeRealmCost({ hasNode: true, nodeSize: 2 });
	assert.equal(withInfo, withoutInfo, "battery/tass must not change the pool cost at all");
});

test("a Node-only Chantry (no Realm) still prices correctly — the two are independent purchases", () => {
	assert.equal(computeRealmCost({ hasNode: true, nodeSize: 0, nodeNamed: true }), 5 + -10 + 5);
	assert.equal(computeRealmCost({ hasRealm: true, size: 2 }), 10 + 5, "and vice-versa: Realm without Node");
});

test("the Node contributes NOTHING to the Quintessence upkeep/day figure — the book gives it none", () => {
	const realmOnly = realmQuintessenceUpkeepPerDay({ hasRealm: true, size: 3 });
	const realmPlusNode = realmQuintessenceUpkeepPerDay({ hasRealm: true, size: 3, hasNode: true, nodeSize: 4, nodeNamed: true });
	assert.equal(realmOnly, realmPlusNode, "adding a Node must not change the Realm's own upkeep figure");
});

test("sphereShifts still cost 2 per absolute point, sign-indifferent — the book's own worked example", () => {
	assert.equal(computeSphereShiftCost([{ delta: 2 }, { delta: -1 }, { delta: 3 }]), 12);
});

test("computeRealmCost/realmQuintessenceUpkeepPerDay never throw on absent or malformed data", () => {
	for (const raw of [undefined, null, "", 0, [], "not an object"]) {
		assert.doesNotThrow(() => computeRealmCost(raw));
		assert.doesNotThrow(() => realmQuintessenceUpkeepPerDay(raw));
	}
	assert.equal(computeRealmCost(undefined), 0);
	assert.equal(realmQuintessenceUpkeepPerDay(undefined), 0);
});

console.log("\nchantry-effects.js — the Personnel block (design.md D4)");

test("staffTier's five levels: Sin Sirvientes -10 through Innumerables +10", () => {
	assert.deepEqual([...PERSONNEL_STAFF_TIER_LEVELS], [-10, -5, 0, 5, 10]);
	assert.equal(personnelLevelCost("staffTier", 0), -10);
	assert.equal(personnelLevelCost("staffTier", 4), 10);
});

test("staffLoyalty's five levels: Espías -10 through Fanáticos +15", () => {
	assert.deepEqual([...PERSONNEL_STAFF_LOYALTY_LEVELS], [-10, -5, 5, 10, 15]);
	assert.equal(personnelLevelCost("staffLoyalty", 0), -10);
	assert.equal(personnelLevelCost("staffLoyalty", 4), 15);
});

test("hereditaryStaff costs +2, military costs +5 flat (a single non-repeatable purchase)", () => {
	assert.equal(PERSONNEL_HEREDITARY_STAFF_COST, 2);
	assert.equal(PERSONNEL_MILITARY_COST, 5);
	assert.equal(computePersonnelCost({ hereditaryStaff: true }), 2);
	assert.equal(computePersonnelCost({ military: true }), 5);
});

test("consorts cost 2 per power level each, summed, with no upper bound", () => {
	assert.equal(PERSONNEL_CONSORT_COST_PER_POWER_LEVEL, 2);
	assert.equal(computeConsortsCost([{ powerLevel: 1 }, { powerLevel: 3 }]), 2 + 6);
	assert.equal(computeConsortsCost([{ powerLevel: 50 }]), 100, "no cap the book states");
});

test("computePersonnelCost sums every present field, presence not value decides", () => {
	const personnel = {
		staffTier: 3, staffLoyalty: 0, hereditaryStaff: true, military: true,
		consorts: [{ powerLevel: 2 }]
	};
	assert.equal(computePersonnelCost(personnel), 5 + -10 + 2 + 5 + 4);
});

test("personnelLevelCost/computePersonnelCost never throw on absent or malformed data", () => {
	for (const raw of [undefined, null, "", 0, []]) {
		assert.doesNotThrow(() => computePersonnelCost(raw));
	}
	assert.equal(computePersonnelCost(undefined), 0);
	assert.equal(personnelLevelCost("staffTier", null), undefined);
	assert.equal(personnelLevelCost("nonsense", 0), undefined);
});

console.log("\nchantry-effects.js — the census (rebuild-chantry-book-of-chantries-only, roster re-homed)");

test("exactly THREE keys accept a census today: guardian, staffTier, node — down from the Dossier's eight", () => {
	assert.deepEqual([...ROSTER_TRAIT_KEYS], ["guardian", "staffTier", "node"]);
	assert.equal(ROSTER_TRAIT_KEYS.length, 3);
	for (const key of ROSTER_TRAIT_KEYS) assert.equal(hasRoster(key), true, key);
});

test("the Dossier's eight are all rejected today — none of them is a live census key any more", () => {
	for (const key of ["allies", "retainers", "spies", "backup", "elders", "cult-sympathizers", "library"]) {
		assert.equal(hasRoster(key), false, key);
	}
	// `node`'s name survives, but it means the book's Node now, not the Dossier's — still accepted,
	// which is correct: the KEY collides on purpose (design.md D1), the ECONOMY behind it does not.
	assert.equal(hasRoster("node"), true);
});

test("the legacy map-carrier's own eight keys are frozen and distinct from the live census vocabulary", () => {
	assert.deepEqual([...LEGACY_TRAITROSTERS_MAP_KEYS], [
		"allies", "retainers", "spies", "backup", "elders", "cult-sympathizers", "library", "node"
	]);
	assert.equal(LEGACY_TRAITROSTERS_MAP_KEYS.length, 8);
	assert.notDeepEqual([...LEGACY_TRAITROSTERS_MAP_KEYS], [...ROSTER_TRAIT_KEYS]);
});

test("normaliseRosters defaults to the LIVE vocabulary but accepts an explicit legacy key list", () => {
	const live = normaliseRosters({ guardian: [{ name: "Custos" }], allies: [{ name: "Nadia" }] });
	assert.deepEqual(Object.keys(live).sort(), ["guardian"], "allies is not a live key: dropped");

	const legacy = normaliseRosters(
		{ guardian: [{ name: "Custos" }], allies: [{ name: "Nadia" }] }, LEGACY_TRAITROSTERS_MAP_KEYS);
	assert.deepEqual(Object.keys(legacy).sort(), ["allies"], "guardian is not a LEGACY key: dropped");
});

test("normalisePoints: an explicit 0 survives, an absent/null/empty value becomes 1", () => {
	assert.equal(normalisePoints(0), 0);
	assert.equal(normalisePoints(undefined), 1);
	assert.equal(normalisePoints(null), 1);
	assert.equal(normalisePoints(""), 1);
	assert.equal(normalisePoints(2), 2);
});

test("rosterAllowedValues flattens traits/personnel/realm into {guardian, staffTier, node}", () => {
	const values = rosterAllowedValues({
		traits: { guardian: 2 }, personnel: { staffTier: 3 }, realm: { nodeSize: 0 }
	});
	assert.deepEqual(values, { guardian: 2, staffTier: 3, node: 0 });
});

test("evaluateItemRosters groups by relation and validates against the flattened allowed map", () => {
	const values = rosterAllowedValues({ traits: { guardian: 2 }, personnel: { staffTier: 3 }, realm: { nodeSize: 0 } });
	const out = evaluateItemRosters([
		{ relation: "guardian", points: 1 }, { relation: "guardian", points: 1 },
		{ relation: "staffTier", points: 0 },
		{ relation: "node", points: 3 },
		{ relation: "library", points: 1 }
	], values);

	assert.deepEqual(Object.keys(out.groups).sort(), [...ROSTER_TRAIT_KEYS].sort());
	assert.equal(out.groups.guardian.used, 2);
	assert.equal(out.groups.guardian.allowed, 2);
	assert.equal(out.groups.guardian.over, false);
	assert.equal(out.groups.staffTier.used, 0, "the explicit 0 survives as 0");
	assert.equal(out.groups.staffTier.allowed, 3);
	assert.equal(out.groups.node.used, 3);
	assert.equal(out.groups.node.allowed, 0);
	assert.equal(out.groups.node.over, true, "3 against an allowance of 0 is over budget");
	assert.equal(out.unassigned.entries.length, 1, "a retired key (library) lands in unassigned, not dropped");
	assert.equal(out.unassigned.allowed, 0);
	assert.equal(out.unassigned.over, false, "unassigned never counts against anything");
});

test("evaluateItemRosters never throws on absent or wrong-typed data", () => {
	for (const raw of [undefined, null, "", 0, {}]) {
		assert.doesNotThrow(() => evaluateItemRosters(raw, {}));
	}
});

console.log(failures
	? `\n${failures} FAILURE(S)`
	: "\nAll chantry-effects pure-function tests passed.");

process.exit(failures ? 1 : 0);
