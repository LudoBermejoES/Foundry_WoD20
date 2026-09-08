/**
 * add-book-of-chantries-traits — the six named-level Traits, `wards`' defensive add-on and the
 * Horizon Realm block, against the book's OWN worked examples (design.md D2/D3/D4/D8).
 *
 *     node --test tests/*.test.mjs        <- pass the GLOB. `node --test tests/` fails on Node 25
 *                                            and reads as a red suite.
 *     node tests/chantry-book-of-chantries.test.mjs   <- this file alone
 *
 * Same convention as `chantry-effects.test.mjs`: plain node, no framework, no Foundry.
 * `module/scripts/chantry-effects.js` imports nothing and touches no global.
 *
 * FIXTURES ARE QUOTATIONS, cross-checked against `wod20-char/web/server/services/rules/
 * chantry.ts`'s own test suite (`chantryBookOfChantries.test.ts`, 2026-09-08) rather than invented:
 * the two runtimes price the SAME book, so a disagreement between them is worth finding here rather
 * than only in production.
 */
import assert from "node:assert/strict";

import {
	BOOK_OF_CHANTRIES_TRAIT_KEYS,
	BOOK_OF_CHANTRIES_LEVEL_COSTS,
	isBookOfChantriesTrait,
	bookTraitLevelCost,
	WARDS_DEFENSIVE_POOL_COST_PER_LEVEL,
	WARDS_DEFENSIVE_DAMAGE_PER_LEVEL,
	computeWardsDefensiveWards,
	computeSphereShiftCost,
	computeRealmCost,
	realmQuintessenceUpkeepPerDay,
	traitCap,
	isSingleRatingCapTrait
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

console.log("chantry-effects.js — the six book-of-chantries Traits (design.md D2/D3)");

test("all six keys are recognised, and only them", () => {
	assert.deepEqual(BOOK_OF_CHANTRIES_TRAIT_KEYS, [
		"guardian", "fortification", "wards", "trap-system", "alarm-system", "research-library"
	]);
	for (const key of BOOK_OF_CHANTRIES_TRAIT_KEYS) {
		assert.equal(isBookOfChantriesTrait(key), true, key);
	}
	assert.equal(isBookOfChantriesTrait("allies"), false, "a linear Trait is not one of the six");
	assert.equal(isBookOfChantriesTrait("nope"), false);
});

test("guardian: 0 Sin Guardián (-10) ... 4 Ridículo (+20)", () => {
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS.guardian, [-10, -5, 0, 5, 20]);
	assert.equal(bookTraitLevelCost("guardian", 0), -10);
	assert.equal(bookTraitLevelCost("guardian", 4), 20);
});

test("fortification / wards / trap-system / alarm-system / research-library level tables", () => {
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS.fortification, [-5, 0, 5, 10, 15]);
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS.wards, [0, 2, 5, 10]);
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS["trap-system"], [0, 5, 10]);
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS["alarm-system"], [0, 2, 5, 10]);
	assert.deepEqual(BOOK_OF_CHANTRIES_LEVEL_COSTS["research-library"], [-5, 0, 5, 10, 15]);
});

test("a level outside the table's own range is undefined, never extrapolated (design.md D3)", () => {
	assert.equal(bookTraitLevelCost("guardian", 5), undefined);
	assert.equal(bookTraitLevelCost("guardian", -1), undefined);
	assert.equal(bookTraitLevelCost("guardian", null), undefined);
	assert.equal(bookTraitLevelCost("guardian", undefined), undefined);
	assert.equal(bookTraitLevelCost("unknown-trait", 0), undefined);
});

test("none of the six is ever a SINGLE_RATING_CAP_TRAITS member or affected by traitCap's callers " +
	"(design.md D3 — the 2x/1x cap simply does not apply to them)", () => {
	for (const key of BOOK_OF_CHANTRIES_TRAIT_KEYS) {
		assert.equal(isSingleRatingCapTrait(key), false, key);
	}
	// traitCap() itself is agnostic to the key (it only checks SINGLE_RATING_CAP_TRAITS membership),
	// so calling it on a book-of-chantries key would silently apply the DEFAULT 2x rule — which is
	// exactly why `_prepareContext` must never call it for one of these six. Documented here so a
	// future reader who greps `traitCap(` finds the rule, not just the sheet's own comment.
	assert.equal(traitCap("guardian", 1), 2, "traitCap has no opinion of its own about these keys");
});

console.log("chantry-effects.js — wards.defensiveLevels (design.md D8)");

test("2 levels: 10 points, 2 aggravated damage", () => {
	assert.equal(WARDS_DEFENSIVE_POOL_COST_PER_LEVEL, 5);
	assert.equal(WARDS_DEFENSIVE_DAMAGE_PER_LEVEL, 1);
	assert.deepEqual(computeWardsDefensiveWards(2), { cost: 10, aggravatedDamage: 2 });
});

test("0/absent levels cost nothing", () => {
	assert.deepEqual(computeWardsDefensiveWards(0), { cost: 0, aggravatedDamage: 0 });
	assert.deepEqual(computeWardsDefensiveWards(undefined), { cost: 0, aggravatedDamage: 0 });
	assert.deepEqual(computeWardsDefensiveWards(null), { cost: 0, aggravatedDamage: 0 });
});

console.log("chantry-effects.js — the Horizon Realm block (design.md D4, corrected 2026-09-08)");

test("the book's own worked example: Life +2, Time -1, Matter +3 = 12 points", () => {
	assert.equal(
		computeSphereShiftCost([
			{ sphere: "life", delta: 2 },
			{ sphere: "time", delta: -1 },
			{ sphere: "matter", delta: 3 }
		]),
		12
	);
});

test("a Vast Realm ALONE (size: 5, +40 points) upkeeps at the book's own 400/day", () => {
	const realm = { size: 5 };
	assert.equal(computeRealmCost(realm), 40);
	assert.equal(realmQuintessenceUpkeepPerDay(realm), 400);
});

test("hasRealm + Vast size together cost 50 points but STILL upkeep at 400/day, not 500 " +
	"(the corrected formula: hasRealm's +10 flat cost never enters the Quintessence figure)", () => {
	const realm = { hasRealm: true, size: 5 };
	assert.equal(computeRealmCost(realm), 50);
	assert.equal(realmQuintessenceUpkeepPerDay(realm), 400);
});

test("terrain Extradimensional (+15Q) + population Avanzados (+15Q) + interconnected (+5Q) + " +
	"advancedTransport (+10Q), no size at all -> 45/day", () => {
	const realm = { terrain: 5, population: 5, interconnected: true, advancedTransport: true };
	assert.equal(realmQuintessenceUpkeepPerDay(realm), 45);
});

test("hasRealm + sphereShifts + climate + socialStructure contribute to POINTS but nothing to " +
	"Quintessence upkeep", () => {
	const realm = {
		hasRealm: true,
		sphereShifts: [{ sphere: "life", delta: 1 }],
		climate: 3,
		socialStructure: 3
	};
	assert.ok(computeRealmCost(realm) > 0, "points ARE charged");
	assert.equal(realmQuintessenceUpkeepPerDay(realm), 0, "but none of these four feed Quintessence");
});

test("an absent realm block costs and upkeeps at 0, never throws", () => {
	assert.equal(computeRealmCost(undefined), 0);
	assert.equal(computeRealmCost(null), 0);
	assert.equal(realmQuintessenceUpkeepPerDay(undefined), 0);
	assert.equal(realmQuintessenceUpkeepPerDay(null), 0);
});

test("a field simply absent (level 0 chosen vs. field never set) reads differently, matching " +
	"design.md D11's 'presence, not value, decides' rule already established for the six Traits", () => {
	assert.equal(computeRealmCost({ size: 0 }), -10, "size: 0 ('Diminuto') IS a real, priced choice");
	assert.equal(computeRealmCost({}), 0, "size entirely absent costs nothing");
});

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks pass");
process.exit(failures ? 1 : 0);
