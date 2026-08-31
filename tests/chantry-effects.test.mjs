/**
 * add-chantry-inventory-effects-and-roster — the Integrated Effects calculator, the roster
 * validator and the per-Trait cap, against the BOOK'S OWN WORKED EXAMPLES.
 *
 *     node --test tests/*.test.mjs        <- pass the GLOB. `node --test tests/` fails on Node 25
 *                                            and reads as a red suite.
 *     node tests/chantry-effects.test.mjs <- this file alone
 *
 * Same convention as `prism-of-focus.test.mjs`, `formula-casting.test.mjs` and
 * `resonance.test.mjs`: plain node, no framework, no Foundry. `module/scripts/chantry-effects.js`
 * imports nothing and touches no global, which is what makes that possible and is the reason those
 * rules live outside the sheet class at all.
 *
 * THE FIXTURES ARE QUOTATIONS, not invented numbers. Both cost examples are the Operative Dossier's
 * own, from the Integrated Effects row of "Estatus y el Constructo":
 *
 *   "un efecto de Mente 2 que calme a todos los que entren en la Capilla costaría 2 puntos"
 *   "Una bola de fuego de Fuerzas 3 / Cardinal 2 / Vida 1 / Materia 1 / Tiempo 4 … costaría 11 puntos"
 *
 * and the pool ladder is that same row's per-dot table ("Cuatro puntos.", "Ocho puntos.", "Quince
 * puntos." …), which is also stored verbatim in `webgen/data/entities/mage.json` under
 * `chantry-integrated-effects.mechanics.ratings`. If those two sources ever disagree, the entity
 * data is the one to trust and this file is the thing that will notice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
	INTEGRATED_EFFECTS_POOL,
	SPHERE_KEYS,
	ROSTER_TRAIT_KEYS,
	SINGLE_RATING_CAP_TRAITS,
	integratedEffectsPool,
	computeEffectCost,
	normaliseEffects,
	normaliseRosters,
	evaluateEffects,
	evaluateRosters,
	traitCap,
	isSingleRatingCapTrait,
	hasRoster
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

console.log("chantry-effects.js — the pool table (design.md D2)");

test("the ten tabulated values are the Dossier's own ladder, in order", () => {
	assert.deepEqual([...INTEGRATED_EFFECTS_POOL], [4, 8, 15, 20, 25, 35, 45, 55, 70, 90]);
});

test("rating 3 is 15 points — the spec's own scenario, and the value a formula would get wrong", () => {
	assert.equal(integratedEffectsPool(3), 15);
	// The three steps are +4, +7, +5: any linear reading of this table is wrong by rating 3, which
	// is why it is a table.
	assert.notEqual(integratedEffectsPool(3), integratedEffectsPool(1) * 3);
});

test("every tabulated rating reads back its own row", () => {
	for (let r = 1; r <= 10; r++) {
		assert.equal(integratedEffectsPool(r), INTEGRATED_EFFECTS_POOL[r - 1], `rating ${r}`);
	}
});

test("rating 0 grants no pool", () => {
	assert.equal(integratedEffectsPool(0), 0);
});

test("rating 11 THROWS instead of extrapolating (D2: explicit error, never a silent guess)", () => {
	assert.throws(() => integratedEffectsPool(11), RangeError);
	assert.throws(() => integratedEffectsPool(50), RangeError);
});

test("a garbage rating is 0, not NaN", () => {
	assert.equal(integratedEffectsPool(undefined), 0);
	assert.equal(integratedEffectsPool(null), 0);
	assert.equal(integratedEffectsPool("nonsense"), 0);
	assert.equal(integratedEffectsPool(-3), 0);
	// A hand-edited "3 " must still price as three dots.
	assert.equal(integratedEffectsPool("3 "), 15);
});

console.log("\nchantry-effects.js — the cost of one effect (the book's two examples)");

test("Mente 2 costs 2 — 'un efecto de Mente 2 … costaría 2 puntos'", () => {
	assert.equal(computeEffectCost([{ sphere: "mind", level: 2 }]), 2);
});

test("Fuerzas 3 / Cardinal 2 / Vida 1 / Materia 1 / Tiempo 4 costs 11 — the fireball, verbatim", () => {
	const fireball = [
		{ sphere: "forces", level: 3 },
		{ sphere: "prime", level: 2 },
		{ sphere: "life", level: 1 },
		{ sphere: "matter", level: 1 },
		{ sphere: "time", level: 4 }
	];
	assert.equal(computeEffectCost(fireball), 11);
});

test("an effect with no Spheres costs nothing, and does not throw", () => {
	assert.equal(computeEffectCost([]), 0);
	assert.equal(computeEffectCost(undefined), 0);
	assert.equal(computeEffectCost(null), 0);
	assert.equal(computeEffectCost("not an array"), 0);
});

test("an unset Sphere row still prices its level (the row a new effect is born with)", () => {
	assert.equal(computeEffectCost([{ sphere: "", level: 1 }]), 1);
});

console.log("\nchantry-effects.js — normalisation, and the cost that must never be stored");

test("a stored `cost` is DISCARDED, so a printed cost can never disagree with its Spheres", () => {
	const raw = [{ name: "Trampa", cost: 1, spheres: [{ sphere: "forces", level: 3 }] }];
	const [effect] = normaliseEffects(raw);
	assert.equal("cost" in effect, false);
	assert.equal(computeEffectCost(effect.spheres), 3);
});

test("a Sphere outside the nine is dropped to unset rather than stored", () => {
	const [effect] = normaliseEffects([{ spheres: [{ sphere: "chi", level: 2 }] }]);
	assert.equal(effect.spheres[0].sphere, "");
	assert.equal(effect.spheres[0].level, 2);
});

test("the nine Sphere keys are the English lower-case set design.md D8 fixes", () => {
	assert.deepEqual([...SPHERE_KEYS], [
		"correspondence", "entropy", "forces", "life", "matter", "mind", "prime", "spirit", "time"
	]);
});

test("absent / null / wrong-typed data normalises to an empty list instead of throwing", () => {
	assert.deepEqual(normaliseEffects(undefined), []);
	assert.deepEqual(normaliseEffects(null), []);
	assert.deepEqual(normaliseEffects({}), []);
	assert.deepEqual(normaliseEffects("[]"), []);
});

console.log("\nchantry-effects.js — the whole Effects picture (evaluateEffects)");

test("the spec's own scenario: integrated-effects 3 prints a pool of 15", () => {
	const out = evaluateEffects([], { rating: 3, effectsRating: 3 });
	assert.equal(out.pool, 15);
	assert.equal(out.spent, 0);
	assert.equal(out.remaining, 15);
	assert.equal(out.overspent, false);
});

test("the spec's own scenario: Tiempo 4 on a rating-3 Chantry is marked over the cap", () => {
	const out = evaluateEffects(
		[{ name: "Bola de fuego", spheres: [{ sphere: "time", level: 4 }] }],
		{ rating: 3, effectsRating: 3 });

	assert.equal(out.rows[0].overcap, true, "the row is marked");
	assert.equal(out.rows[0].spheres[0].overcap, true, "and the offending Sphere is named");
	assert.equal(out.spherecap, 3);
});

test("a Sphere AT the rating is legal — the cap is 'may not exceed', not 'must be under'", () => {
	const out = evaluateEffects(
		[{ spheres: [{ sphere: "time", level: 3 }] }],
		{ rating: 3, effectsRating: 3 });
	assert.equal(out.rows[0].overcap, false);
});

test("with no rating at all nothing is marked over cap (there is no cap to compare against)", () => {
	const out = evaluateEffects(
		[{ spheres: [{ sphere: "time", level: 5 }] }],
		{ rating: 0, effectsRating: 1 });
	assert.equal(out.rows[0].overcap, false);
});

test("the spec's own scenario: three effects with node 2 shows upkeep 3 and a shortfall", () => {
	const out = evaluateEffects(
		[{ spheres: [] }, { spheres: [] }, { spheres: [] }],
		{ rating: 3, effectsRating: 3, nodeRating: 2 });

	assert.equal(out.upkeep, 3, "one Quintessence per week per effect");
	assert.equal(out.node, 2);
	assert.equal(out.upkeepshortfall, 1);
});

test("a Node that covers the upkeep reports no shortfall", () => {
	const out = evaluateEffects([{ spheres: [] }, { spheres: [] }],
		{ rating: 3, effectsRating: 3, nodeRating: 4 });
	assert.equal(out.upkeepshortfall, 0);
});

test("spending past the pool is marked, not refused", () => {
	// Two fireballs at 11 each = 22, against the 15 that three dots grant.
	const fireball = { spheres: [
		{ sphere: "forces", level: 3 }, { sphere: "prime", level: 2 }, { sphere: "life", level: 1 },
		{ sphere: "matter", level: 1 }, { sphere: "time", level: 3 }
	] };
	const out = evaluateEffects([fireball, fireball], { rating: 3, effectsRating: 3 });

	assert.equal(out.spent, 20);
	assert.equal(out.pool, 15);
	assert.equal(out.remaining, -5);
	assert.equal(out.overspent, true);
	assert.equal(out.rows.length, 2, "and both rows are still returned to be rendered");
});

test("Reality Zone 0 is a VULGAR warning, never a block (D2 rule 3)", () => {
	const withEffects = evaluateEffects([{ spheres: [{ sphere: "mind", level: 1 }] }],
		{ rating: 3, effectsRating: 3, realityZone: 0 });
	assert.equal(withEffects.vulgar, true);
	assert.equal(withEffects.rows.length, 1, "the effect is still there and still priced");

	const zoned = evaluateEffects([{ spheres: [{ sphere: "mind", level: 1 }] }],
		{ rating: 3, effectsRating: 3, realityZone: 1 });
	assert.equal(zoned.vulgar, false);
});

test("with no effects at all there is nothing to call vulgar", () => {
	assert.equal(evaluateEffects([], { rating: 3, effectsRating: 3, realityZone: 0 }).vulgar, false);
});

test("above the tabulated ten the pool is reported as OFF THE TABLE, and the sheet still renders", () => {
	const out = evaluateEffects([{ spheres: [{ sphere: "mind", level: 1 }] }],
		{ rating: 3, effectsRating: 11 });

	assert.equal(out.pooloverflow, true, "said out loud…");
	assert.equal(out.pool, 0);
	assert.equal(out.overspent, false, "…and NOT reported as overspending against a pool of 0");
	assert.equal(out.rows.length, 1, "the render still has its rows");
});

test("evaluateEffects never throws on absent data (the 7.5.129 failure class)", () => {
	for (const raw of [undefined, null, {}, "", 0, [{}], [{ spheres: null }]]) {
		assert.doesNotThrow(() => evaluateEffects(raw, {}));
	}
	assert.doesNotThrow(() => evaluateEffects([]));
});

console.log("\nchantry-effects.js — the per-Trait cap (task 3.7 / design.md D7)");

test("reality-zone is the ONLY Trait capped at the rating once", () => {
	assert.deepEqual([...SINGLE_RATING_CAP_TRAITS], ["reality-zone"]);
	assert.equal(isSingleRatingCapTrait("reality-zone"), true);
	assert.equal(isSingleRatingCapTrait("library"), false);
});

test("the spec's own scenario: reality-zone 4 on a rating-3 Chantry is over cap", () => {
	assert.equal(traitCap("reality-zone", 3), 3);
	assert.ok(4 > traitCap("reality-zone", 3));
});

test("the spec's own scenario: library 4 on a rating-3 Chantry is NOT over cap", () => {
	assert.equal(traitCap("library", 3), 6);
	assert.ok(!(4 > traitCap("library", 3)));
});

test("a rating of 0 gives a cap of 0 for both kinds (the sheet reads that as 'no cap yet')", () => {
	assert.equal(traitCap("reality-zone", 0), 0);
	assert.equal(traitCap("library", 0), 0);
});

console.log("\nchantry-effects.js — the rosters (design.md D5)");

test("exactly the eight collection Traits accept a roster", () => {
	assert.deepEqual([...ROSTER_TRAIT_KEYS], [
		"allies", "retainers", "spies", "backup", "elders", "cult-sympathizers", "library", "node"
	]);
	assert.equal(ROSTER_TRAIT_KEYS.length, 8);
});

test("the six magnitude Traits are rejected — they are not collections", () => {
	for (const key of ["resources", "arcane-cloaking", "reality-zone", "enhancement",
		"requisitions", "integrated-effects"]) {
		assert.equal(hasRoster(key), false, key);
	}
});

test("a roster under an unrostered key is DROPPED rather than stored (D5: 'cualquier otra se rechaza')", () => {
	const out = normaliseRosters({ resources: [{ name: "una caja fuerte" }], allies: [{ name: "Nadia" }] });
	assert.equal("resources" in out, false);
	assert.deepEqual(out.allies, [{ name: "Nadia", note: "", points: 1 }]);
});

test("D5's own case: Aliados ●● takes two one-point allies", () => {
	const out = evaluateRosters(
		{ allies: [{ name: "Nadia", points: 1 }, { name: "Ruiz", points: 1 }] },
		{ allies: 2 });

	assert.equal(out.allies.used, 2);
	assert.equal(out.allies.allowed, 2);
	assert.equal(out.allies.over, false);
	assert.equal(out.allies.entries.length, 2);
});

test("D5's own case: Aliados ●● ALSO takes ONE exceptional two-point ally", () => {
	const out = evaluateRosters({ allies: [{ name: "El Concilio", points: 2 }] }, { allies: 2 });
	assert.equal(out.allies.used, 2);
	assert.equal(out.allies.over, false);
});

test("three one-point allies on Aliados ●● is over the Trait", () => {
	const out = evaluateRosters(
		{ allies: [{ points: 1 }, { points: 1 }, { points: 1 }] }, { allies: 2 });
	assert.equal(out.allies.used, 3);
	assert.equal(out.allies.over, true);
});

test("D5's own case: Biblioteca ●●● takes five DESCRIPTIVE 0-point entries and is not over", () => {
	const out = evaluateRosters(
		{ library: [{ points: 0 }, { points: 0 }, { points: 0 }, { points: 0 }, { points: 0 }] },
		{ library: 3 });

	assert.equal(out.library.entries.length, 5);
	assert.equal(out.library.used, 0);
	assert.equal(out.library.over, false);
});

test("an entry with NO points declared consumes one; an explicit 0 stays 0", () => {
	const out = normaliseRosters({ allies: [{ name: "sin puntos" }, { name: "cero", points: 0 }] });
	assert.equal(out.allies[0].points, 1);
	assert.equal(out.allies[1].points, 0);
});

test("an empty roster is reported for every rostered Trait, so the sheet has something to read", () => {
	const out = evaluateRosters(undefined, {});
	assert.deepEqual(Object.keys(out).sort(), [...ROSTER_TRAIT_KEYS].sort());
	for (const key of ROSTER_TRAIT_KEYS) {
		assert.deepEqual(out[key], { entries: [], used: 0, allowed: 0, over: false }, key);
	}
});

test("evaluateRosters never throws on absent or wrong-typed data", () => {
	for (const raw of [undefined, null, "", 0, [], { allies: "not a list" }]) {
		assert.doesNotThrow(() => evaluateRosters(raw, {}));
	}
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * The upkeep-vs-Node EXPLANATION — a prose contract, not arithmetic
 *
 * Why this section exists: the sheet used to print two irreconcilable sentences on one screen. The
 * Node Trait's description said the Trait is what is left over "tras pagar los costes de
 * mantenimiento" (markdown/mage/m20-the-operative-dossier.md:2797), and three lines below it the
 * warning said the Node does not COVER the upkeep. A reader cannot reconcile those, and the natural
 * conclusion — "the comparison is inverted" — is wrong: the governing rule is
 * markdown/mage/m20-the-operative-dossier.md:2892, which names the Node as the source the payment
 * is DRAWN FROM. That misreading reached this project as a bug report, so these assertions guard
 * the explanation the way the tests above guard the numbers.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const LANGS = ["es", "en"];
const lang = Object.fromEntries(LANGS.map((code) => [
	code,
	JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf8"))
]));

const shortfall = (code) => lang[code].wod.chantry.effects.shortfall;
const nodeDescription = (code) => lang[code].wod.chantry.traitdescriptions.node;

console.log("\nthe upkeep warning explains itself (both languages)");

test("the warning names the figure the members must find, in every language", () => {
	for (const code of LANGS) {
		assert.match(shortfall(code), /\{n\}/,
			`${code}: the warning must interpolate the shortfall, not just say one exists`);
	}
});

test("the template feeds that figure to the warning — the template/lang contract", () => {
	// A `{n}` nobody passes renders literally as "{n}". Both call sites must supply it.
	const hbs = readFileSync(
		new URL("../templates/actor/chantry-effects-v2.hbs", import.meta.url), "utf8");
	const sites = hbs.match(/localize\s+['"]wod\.chantry\.effects\.shortfall['"][^}]*/g) ?? [];
	assert.ok(sites.length >= 1, "the template no longer localizes the shortfall warning at all");
	for (const site of sites) {
		assert.match(site, /n=integrated\.upkeepshortfall/,
			`a shortfall call site passes no n=: ${site}`);
	}
});

test("the warning says WHO pays and that the Chantry stays legal", () => {
	// Sourced from the rule, not from the string: 2892 names two payers (members, Node), and
	// `upkeepshortfall` feeds no legality check anywhere in this module.
	const required = { es: [/miembros/i, /legal/i], en: [/members/i, /legal/i] };
	for (const code of LANGS) {
		for (const pattern of required[code]) {
			assert.match(shortfall(code), pattern, `${code}: ${pattern}`);
		}
	}
});

test("the Node description resolves the contradiction and cites the governing line", () => {
	for (const code of LANGS) {
		const text = nodeDescription(code);
		assert.match(text, /m20-the-operative-dossier\.md:2892/,
			`${code}: the description must cite the rule that governs the comparison`);
		assert.match(text, code === "es" ? /Efecto(s)? Integrado/i : /Integrated Effect/i,
			`${code}: it must say the Effects' upkeep is NOT the "mantenimiento" of 2797`);
	}
});

test("the calculator carries the do-not-invert-me note next to the subtraction", () => {
	// The next reader to meet 2797 alone will try to "fix" `upkeep - node`. This is what stops them.
	const js = readFileSync(
		new URL("../module/scripts/chantry-effects.js", import.meta.url), "utf8");
	const at = js.indexOf("upkeepshortfall: Math.max(0, upkeep - toInt(nodeRating))");
	assert.ok(at > 0, "the shortfall subtraction moved — move this guard with it");
	const preamble = js.slice(Math.max(0, at - 1400), at);
	assert.match(preamble, /m20-the-operative-dossier\.md:2892/,
		"the subtraction lost its citation of the rule that justifies its direction");
	assert.match(preamble, /DELIBERATE/,
		"the subtraction lost the warning that its direction is intentional");
});

console.log(failures
	? `\n${failures} FAILURE(S)`
	: "\nAll chantry-effects pure-function tests passed.");

process.exit(failures ? 1 : 0);
