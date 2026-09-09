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
	REALM_HAS_REALM_COST,
	REALM_NODE_NAMED_COST,
	NODE_POWER_LEVELS,
	nodePowerLevelRow,
	nodePowerLevelCost,
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
	computePersonnelCost,
	STAFF_TIER_ROSTER_CAPACITY,
	rosterRatingValues
} from "../module/scripts/chantry-effects.js";
import { chantryDescriptorPointValue } from "../module/scripts/chantry-descriptors.js";

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

test("hasRealm costs 10 — the book's own sentence: 'un Reino del Horizonte cuesta 10'", () => {
	assert.equal(REALM_HAS_REALM_COST, 10);
	assert.equal(computeRealmCost({ hasRealm: true }), 10);
	assert.equal(computeRealmCost({}), 0, "an absent realm block costs nothing");
});

test("fix-chantry-foundry-sheet-parity: NODE_POWER_LEVELS matches wodchar's own REGLA DE LA CASA table exactly", () => {
	assert.equal(NODE_POWER_LEVELS.length, 10);
	assert.deepEqual([...NODE_POWER_LEVELS].map((r) => r.points), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
	assert.equal(nodePowerLevelRow(0).nameEs, "Latente");
	assert.equal(nodePowerLevelRow(9).nameEs, "Trascendental");
});

test("each realm.nodes[] entry prices independently by its own powerLevel", () => {
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 0 }] }), 5, "Latente");
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 3 }] }), 20, "Estable");
	assert.equal(computeRealmCost({ nodes: [] }), 0, "zero Nodes costs nothing");
	assert.equal(computeRealmCost({}), 0, "an absent nodes array is the same as empty, never NaN");
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 0 }, { powerLevel: 3 }] }), 5 + 20,
		"multiple Nodes each price independently and sum");
});

test("a Node with no powerLevel costs nothing — REGLA DE LA CASA, add-node-power-level-house-rule D2", () => {
	assert.equal(nodePowerLevelCost({}), 0);
	assert.equal(computeRealmCost({ nodes: [{}] }), 0);
});

test("named costs +5 PER NODE, same as the Realm's own Misceláneo refinements", () => {
	assert.equal(REALM_NODE_NAMED_COST, 5);
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 0, named: true }] }), 5 + 5);
	assert.equal(computeRealmCost({ nodes: [{ named: true }, { named: true }] }), 5 + 5, "two named Nodes, neither leveled, each pay +5 independently");
});

test("battery discounts powerLevel+1, tass discounts floor(tass/2) — add-node-battery-tass-discount", () => {
	assert.equal(nodePowerLevelCost({ powerLevel: 0, battery: true }), 5 - 1, "Latente (5) - (0+1)");
	assert.equal(nodePowerLevelCost({ powerLevel: 9, battery: true }), 50 - 10, "Trascendental (50) - (9+1)");
	assert.equal(nodePowerLevelCost({ powerLevel: 3, tass: 4 }), 20 - 2, "Estable (20) - floor(4/2)");
	assert.equal(nodePowerLevelCost({ powerLevel: 0, battery: true, tass: 10 }), 0, "floored at 0, never negative");
});

test("a Node-only Chantry (no Realm) still prices correctly — the two are independent purchases", () => {
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 0, named: true }] }), 5 + 5);
	assert.equal(computeRealmCost({ hasRealm: true, size: 2 }), 10 + 5, "and vice-versa: Realm without Node");
});

test("fix-chantry-foundry-sheet-parity: the Reino's own area-Traits/wardsDefensiveLevels price ONLY when hasRealm", () => {
	assert.equal(
		computeRealmCost({ hasRealm: true, traits: { guardian: 2 }, wardsDefensiveLevels: 2 }),
		10 + 0 + 10,
		"hasRealm(10) + guardian level 2(0) + 2 wards levels x 5",
	);
	assert.equal(
		computeRealmCost({ hasRealm: false, traits: { guardian: 2 }, wardsDefensiveLevels: 2 }),
		0,
		"with no Realm built, realm.traits/wardsDefensiveLevels are IGNORED entirely",
	);
});

test("fix-chantry-foundry-sheet-parity: each Node's own area-Traits/wardsDefensiveLevels price ALWAYS (no hasRealm gate)", () => {
	assert.equal(
		computeRealmCost({ nodes: [{ powerLevel: 0, traits: { guardian: 2 }, wardsDefensiveLevels: 1 }] }),
		5 + 0 + 5,
		"Latente(5) + guardian level 2(0) + 1 wards level x 5 — priced even though hasRealm is absent",
	);
});

test("fix-chantry-foundry-sheet-parity: an out-of-range Node powerLevel degrades to 0, never throws", () => {
	assert.doesNotThrow(() => computeRealmCost({ nodes: [{ powerLevel: 15 }] }));
	assert.equal(computeRealmCost({ nodes: [{ powerLevel: 15 }] }), 0);
	assert.equal(nodePowerLevelRow(15), undefined);
	assert.equal(nodePowerLevelRow(-1), undefined);
	// The other Nodes/fields in the SAME document are unaffected by one bad Node.
	assert.equal(
		computeRealmCost({ nodes: [{ powerLevel: 15 }, { powerLevel: 0 }], hasRealm: true }),
		10 + 0 + 5,
	);
});

test("the Node contributes NOTHING to the Quintessence upkeep/day figure — the book gives it none", () => {
	const realmOnly = realmQuintessenceUpkeepPerDay({ hasRealm: true, size: 3 });
	const realmPlusNode = realmQuintessenceUpkeepPerDay({ hasRealm: true, size: 3, nodes: [{ powerLevel: 9, named: true }] });
	assert.equal(realmOnly, realmPlusNode, "adding Nodes must not change the Realm's own upkeep figure");
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

test("STAFF_TIER_ROSTER_CAPACITY: 0/3/6/12/20 — a project decision, SEPARATE from staffTier's own cost table", () => {
	assert.deepEqual([...STAFF_TIER_ROSTER_CAPACITY], [0, 3, 6, 12, 20]);
	assert.notDeepEqual([...STAFF_TIER_ROSTER_CAPACITY], [...PERSONNEL_STAFF_TIER_LEVELS],
		"the aforo table and the cost table must never be the same array — that IS the defect this fixes");
});

test("rosterAllowedValues returns the REAL census aforo, never the Trait's own dot/level (design.md D2)", () => {
	// guardian: 1 if built (any level > 0), 0 otherwise — never the level itself.
	assert.deepEqual(rosterAllowedValues({ traits: { guardian: 1 } }), { guardian: 1, staffTier: 0, node: 0 });
	assert.deepEqual(rosterAllowedValues({ traits: { guardian: 4 } }), { guardian: 1, staffTier: 0, node: 0 },
		"Ridículo (level 4) still caps the census at 1 guardián");
	assert.deepEqual(rosterAllowedValues({ traits: { guardian: 0 } }), { guardian: 0, staffTier: 0, node: 0 });
	assert.deepEqual(rosterAllowedValues({}), { guardian: 0, staffTier: 0, node: 0 });

	// staffTier: STAFF_TIER_ROSTER_CAPACITY[level], never the level itself.
	assert.deepEqual(rosterAllowedValues({ personnel: { staffTier: 3 } }), { guardian: 0, staffTier: 12, node: 0 });
	assert.deepEqual(rosterAllowedValues({ personnel: { staffTier: 4 } }), { guardian: 0, staffTier: 20, node: 0 });

	// node: realm.nodes.length directly (fix-chantry-foundry-sheet-parity — the retired `nodeCount`
	// scalar is gone; each Node is now its own entry in `realm.nodes[]`).
	assert.deepEqual(
		rosterAllowedValues({ realm: { nodes: [{ powerLevel: 0 }, { powerLevel: 2 }, { powerLevel: 5 }] } }),
		{ guardian: 0, staffTier: 0, node: 3 },
	);
	assert.deepEqual(rosterAllowedValues({ realm: { nodes: [] } }), { guardian: 0, staffTier: 0, node: 0 });
	assert.deepEqual(rosterAllowedValues({ realm: {} }), { guardian: 0, staffTier: 0, node: 0 });
});

test("rosterRatingValues no longer has a Node 'size' to draw as dots — fix-chantry-foundry-sheet-parity", () => {
	const values = rosterRatingValues({
		traits: { guardian: 2 }, personnel: { staffTier: 3 }, realm: { nodes: [{ powerLevel: 5 }] }
	});
	assert.deepEqual(values, { guardian: 2, staffTier: 3, node: undefined },
		"node's rating is undefined (no shared 'size' concept survives the per-Node array model) — " +
		"the template's own {{#if group.rating}} guard already skips drawing dots when falsy");
});

test("evaluateItemRosters groups by relation and validates against the flattened aforo map", () => {
	const values = rosterAllowedValues({
		traits: { guardian: 2 }, personnel: { staffTier: 3 },
		realm: { nodes: [{ powerLevel: 0 }, { powerLevel: 1 }, { powerLevel: 2 }] },
	});
	const out = evaluateItemRosters([
		{ relation: "guardian", points: 1 }, { relation: "guardian", points: 1 },
		{ relation: "staffTier", points: 0 },
		{ relation: "node", points: 3 },
		{ relation: "library", points: 1 }
	], values);

	assert.deepEqual(Object.keys(out.groups).sort(), [...ROSTER_TRAIT_KEYS].sort());
	assert.equal(out.groups.guardian.used, 2);
	assert.equal(out.groups.guardian.allowed, 1, "guardian's aforo is 1 regardless of its level (2)");
	assert.equal(out.groups.guardian.over, true, "2 entries against an aforo of 1 is over budget");
	assert.equal(out.groups.staffTier.used, 0, "the explicit 0 survives as 0");
	assert.equal(out.groups.staffTier.allowed, 12, "staffTier level 3 -> STAFF_TIER_ROSTER_CAPACITY[3]");
	assert.equal(out.groups.node.used, 3);
	assert.equal(out.groups.node.allowed, 3, "node's aforo is realm.nodes.length (3) directly");
	assert.equal(out.groups.node.over, false, "3 against an allowance of 3 is exactly on budget");
	assert.equal(out.unassigned.entries.length, 1, "a retired key (library) lands in unassigned, not dropped");
	assert.equal(out.unassigned.allowed, 0);
	assert.equal(out.unassigned.over, false, "unassigned never counts against anything");
});

test("evaluateItemRosters never throws on absent or wrong-typed data", () => {
	for (const raw of [undefined, null, "", 0, {}]) {
		assert.doesNotThrow(() => evaluateItemRosters(raw, {}));
	}
});

/**
 * fix-chantry-foundry-sheet-parity — regression fixture: the REAL "Mekarchitek" Chantry, imported
 * from wodchar's production DB into a live Foundry world for the first time, rendered
 * "Gastados: 6" instead of wodchar's authoritative 11 (verified directly against wodchar's own
 * `validateChantryBuild`, fed this exact document plus the real descriptor-cost catalogue).
 * Root-caused to `computeRealmCost` ignoring `realm.nodes[]` entirely (both Nodes' powerLevel/
 * battery/tass AND the second Node's own `traits: {guardian: 0, fortification: 2, ...}` — an
 * EXPLICIT `guardian: 0`, "Sin Guardián", -10 pts per the "presence, not value, decides" rule this
 * whole codebase uses — contributed 0 instead of their real net -5) and `chantry-descriptors.js`
 * missing `land-status-known-portal` (contributed 0 instead of -5). This test recomputes the SAME
 * formula `_prepareContext()`/`_computePoolSpent()` use, over the EXACT imported document, and
 * asserts it now equals 11 — so a future regression in either fixed function fails loudly here,
 * under plain `node --test`, without needing to render a sheet.
 */
test("fix-chantry-foundry-sheet-parity: the real Mekarchitek document now totals wodchar's authoritative 11", () => {
	const traits = { guardian: 2, fortification: 0, wards: 0, "trap-system": 1, "alarm-system": 2 };
	const chantryWideTraits = { laboratories: 0 };
	const realm = {
		hasRealm: false,
		nodes: [
			{ name: "Nodo en el taller de Salvador", powerLevel: 0, battery: true, tass: 0, traits: { wards: 0, "trap-system": 0, "alarm-system": 0 } },
			{ name: "Nodo de correspondencia y fuerzas el Spree", powerLevel: 2, battery: true, tass: 2, traits: { guardian: 0, fortification: 2, wards: 0, "trap-system": 0, "alarm-system": 0 } }
		]
	};
	const personnel = { consorts: [{ powerLevel: 4 }, { powerLevel: 3 }, { powerLevel: 5 }] };
	const descriptors = [
		"location-city", "phenomenon-magical-manifestations-subtle", "communications-modern",
		"land-status-rented-30y", "land-status-known-portal"
	];

	let spent = 0;
	for (const key in BOOK_OF_CHANTRIES_LEVEL_COSTS) {
		const level = { ...traits, ...chantryWideTraits }[key];
		if ((level === null) || (level === undefined)) continue;
		const cost = bookTraitLevelCost(key, parseInt(level));
		if (cost !== undefined) spent += cost;
	}
	spent += computeRealmCost(realm);
	spent += computePersonnelCost(personnel);
	spent += descriptors.reduce((sum, id) => sum + chantryDescriptorPointValue(id), 0);

	assert.equal(spent, 11,
		"edificio traits+laboratories(-5) + realm/nodes(10, incl. Node 2's own guardian:0/" +
		"fortification:2 = -5 net) + personnel(+24) + descriptors(-18) = 11");
});

/**
 * fix-chantry-foundry-sheet-parity task 1.7 — a SYNTHETIC fixture exercising the Reino's own
 * area-Trait/wardsDefensiveLevels allocation and a Node's `named` flag together with ITS OWN
 * area-Trait/wardsDefensiveLevels allocation: Mekarchitek's own document does not touch any of
 * these four fields, so without this fixture a regression in task 1.6's port would ship unnoticed.
 */
test("fix-chantry-foundry-sheet-parity task 1.7: Reino + Node area-Traits/wardsDefensiveLevels/named all price together", () => {
	const realm = {
		hasRealm: true,
		traits: { guardian: 2 }, // Normal (0)
		wardsDefensiveLevels: 1, // +5
		nodes: [
			{
				powerLevel: 1, // Tenue, 10
				named: true, // +5
				traits: { fortification: 2 }, // Bien Fortificado, +5
				wardsDefensiveLevels: 2 // +10
			}
		]
	};
	const expected =
		REALM_HAS_REALM_COST // 10
		+ 0 // Reino's own guardian level 2 (Normal, 0)
		+ 5 // Reino's own 1 wards level x 5
		+ 10 // Node's powerLevel 1 (Tenue)
		+ 5 // Node's named
		+ 5 // Node's own fortification level 2 (Bien Fortificado)
		+ 10; // Node's own 2 wards levels x 5
	assert.equal(computeRealmCost(realm), expected);
});

console.log(failures
	? `\n${failures} FAILURE(S)`
	: "\nAll chantry-effects pure-function tests passed.");

process.exit(failures ? 1 : 0);
