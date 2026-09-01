/**
 * apply-armor-dexterity-penalty — the sign rule, the migration predicate, and the two things the
 * spec asks the SYSTEM side to prove: that `shieldbonus` is a declared, read-only, localized field,
 * and that `totals.js` is NOT clamped.
 *
 *     node --test tests/*.test.mjs          <- pass the GLOB. `node --test tests/` fails on Node 25
 *                                              and reads as a red suite.
 *     node tests/armor-dexpenalty.test.mjs  <- this file alone
 *
 * Same convention as `prism-of-focus.test.mjs`, `formula-casting.test.mjs`, `resonance.test.mjs` and
 * `chantry-effects.test.mjs`: plain node, no framework, no Foundry. `module/scripts/armor-
 * dexpenalty.js` imports nothing and touches no global, which is what makes that possible and is the
 * reason the rules live outside `migrations.js` at all (that file imports the compendium helpers and
 * reads `game.actors`).
 *
 * THE FIXTURES ARE MEASUREMENTS, not invented numbers. The eleven positive magnitudes are the ones
 * actually shipped in the compiled packs, counted by this change's own measuring script:
 * `vampire-armor` 4 (1/1/2/3) and `werewolf-armor` 7 (1/1/2/2/2/3/3). W20 and V20 tabulate the
 * penalty as an unsigned magnitude ("Chaqueta de motero | 1 | 1", w20-aniversario-core-es.md:9054;
 * "Segunda clase | 2 | 1", v20-core-rulebook-es.md:9052) while M20, the SRD and Wraith20 tabulate it
 * signed — the extraction is faithful in all 39 and the defect is downstream (design.md D6).
 *
 * WHAT THIS FILE CANNOT SEE, stated so a green run is not over-read:
 *   - it does not run Foundry, so it proves nothing about whether `game.ready()` actually calls the
 *     migration (that is `wod.js`'s wiring, and only a live world settles it — tasks.md §8);
 *   - it does not render Handlebars (this repo vendors none). The armor sheet's new row WAS rendered
 *     under real Handlebars 4.7.7 during development, including a negative control that broke the
 *     context depth on purpose and watched the row vanish; what is checked here is the structure of
 *     the template SOURCE, which is what a future edit is most likely to get wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
	normalisedDexPenalty,
	needsDexPenaltyCorrection,
	planActorDexPenaltyCorrections,
	applyDexPenaltyCorrections
} from "../module/scripts/armor-dexpenalty.js";

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

/** An Item stub with the two members the migration uses, recording every update it receives. */
function armor(name, dexpenalty, { type = "Armor", failing = false } = {}) {
	const item = {
		type,
		name,
		system: { dexpenalty },
		updates: [],
		async update(data) {
			if (failing) throw new Error("simulated: user lacks update permission");
			item.updates.push(data);
			// Foundry applies the diff to the document; the migration's idempotency claim is only
			// meaningful if the stub does too, so a second plan really sees the corrected value.
			if ("system.dexpenalty" in data) item.system.dexpenalty = data["system.dexpenalty"];
		}
	};
	return item;
}

// =============================================================================================
console.log("armor-dexpenalty.js — the sign rule (design.md D6: `-abs(n)`, never a per-book table)");
// =============================================================================================

test("an unsigned magnitude becomes a subtraction", () => {
	assert.equal(normalisedDexPenalty(3), -3);
	assert.equal(normalisedDexPenalty(1), -1);
});

test("an already-signed value is left as it is (idempotent, not double-negated)", () => {
	assert.equal(normalisedDexPenalty(-2), -2);
	assert.equal(normalisedDexPenalty(normalisedDexPenalty(-2)), -2);
	// Wraith20 writes the value SIGNED *and* says "debes restar la penalización indicada"
	// (wraith20-el-olvido-nsr-es.md:11638) — a literal double negation. `-abs(n)` resolves it; a
	// per-book convention table would have turned -3 into +3.
	assert.equal(normalisedDexPenalty(-3), -3);
});

test("zero stays zero, and it is PLAIN zero, not negative zero", () => {
	// `-Math.abs(0)` is `-0`, which this assertion caught during development. `Object.is` and
	// `assert.strictEqual` both distinguish it from 0, so it would have sat in the data as a trap
	// for whoever compared against it next.
	assert.equal(normalisedDexPenalty(0), 0);
	assert.ok(Object.is(normalisedDexPenalty(0), 0), "returned -0");
	assert.ok(Object.is(normalisedDexPenalty("0"), 0), "returned -0 for a string zero");
});

test("a numeric STRING is read, because an imported document need not hold a Number", () => {
	assert.equal(normalisedDexPenalty("3"), -3);
	assert.equal(normalisedDexPenalty("+1"), -1);
	assert.equal(normalisedDexPenalty("-2"), -2);
});

test("an unreadable value is null, NOT a confident zero", () => {
	// The real cell, from werewolf/tapa-de-cubo-de-basura (w20-aniversario-core-es.md:9064).
	// A silent `0` is exactly how it got through the export side in the first place.
	assert.equal(normalisedDexPenalty("(0, pero requiere"), null);
	assert.equal(normalisedDexPenalty(null), null);
	assert.equal(normalisedDexPenalty(undefined), null);
	assert.equal(normalisedDexPenalty(""), null);
	assert.equal(normalisedDexPenalty(NaN), null);
});

// =============================================================================================
console.log("armor-dexpenalty.js — the predicate IS the flag (design.md D10)");
// =============================================================================================

test("a positive dexpenalty on an Armor matches", () => {
	assert.equal(needsDexPenaltyCorrection(armor("Traje de antidisturbios", 3)), true);
	assert.equal(needsDexPenaltyCorrection(armor("Chaqueta de motero", 1)), true);
});

test("a correct value does not match — nothing legitimate is ever written to", () => {
	assert.equal(needsDexPenaltyCorrection(armor("Chaleco antibalas", -1)), false);
	assert.equal(needsDexPenaltyCorrection(armor("Armadura militar", -2)), false);
	assert.equal(needsDexPenaltyCorrection(armor("Piel resistente", 0)), false);
});

test("an unreadable value does not match — it is reported, never coerced", () => {
	assert.equal(needsDexPenaltyCorrection(armor("Tapa de cubo de basura", "(0, pero requiere")), false);
	assert.equal(needsDexPenaltyCorrection(armor("sin campo", undefined)), false);
});

test("only Armor is this migration's business", () => {
	assert.equal(needsDexPenaltyCorrection(armor("Espada", 3, { type: "Melee Weapon" })), false);
	assert.equal(needsDexPenaltyCorrection(armor("Fetiche", 3, { type: "Fetish" })), false);
});

test("a malformed item never throws", () => {
	for (const junk of [undefined, null, {}, { type: "Armor" }, { type: "Armor", system: {} }]) {
		assert.equal(needsDexPenaltyCorrection(junk), false);
	}
});

// =============================================================================================
console.log("armor-dexpenalty.js — the plan over the ELEVEN shipped magnitudes");
// =============================================================================================

//: The measured shipped values: vampire-armor 4 + werewolf-armor 7.
const SHIPPED_POSITIVE = [1, 1, 2, 3, 1, 1, 2, 2, 2, 3, 3];

test("all eleven are planned, each negated, and nothing else is", () => {
	const actor = {
		name: "arrastres",
		items: [
			...SHIPPED_POSITIVE.map((v, i) => armor(`positiva ${i}`, v)),
			armor("ya correcta", -2),
			armor("cero", 0),
			armor("ilegible", "(0, pero requiere"),
			armor("no es armadura", 3, { type: "Melee Weapon" })
		]
	};

	const plan = planActorDexPenaltyCorrections(actor);

	assert.equal(plan.length, 11);
	assert.deepEqual(plan.map(p => p.to), SHIPPED_POSITIVE.map(v => -v));
	assert.ok(plan.every(p => p.to < 0));
});

test("planning writes nothing — the scope is measurable before anything is touched", () => {
	const item = armor("Traje de antidisturbios", 3);
	planActorDexPenaltyCorrections({ name: "x", items: [item] });
	assert.deepEqual(item.updates, []);
});

test("an actor with no items, or none at all, plans nothing and does not throw", () => {
	assert.deepEqual(planActorDexPenaltyCorrections({ name: "vacío", items: [] }), []);
	assert.deepEqual(planActorDexPenaltyCorrections({ name: "sin items" }), []);
	assert.deepEqual(planActorDexPenaltyCorrections(undefined), []);
});

// =============================================================================================
console.log("armor-dexpenalty.js — applying it: the field, idempotency, error isolation");
// =============================================================================================

await test("the correction writes ONLY system.dexpenalty (spec: a dragged Werewolf armor)", async () => {
	const item = armor("Traje de antidisturbios", 3);
	const stats = await applyDexPenaltyCorrections(
		planActorDexPenaltyCorrections({ name: "a", items: [item] }));

	assert.deepEqual(stats, { corrected: 1, failed: 0 });
	assert.deepEqual(item.updates, [{ "system.dexpenalty": -3 }]);
	assert.equal(item.system.dexpenalty, -3);
});

await test("a correct Item is not written to (spec: -2 and 0 are untouched)", async () => {
	const good = armor("Armadura militar", -2);
	const zero = armor("Piel resistente", 0);
	const stats = await applyDexPenaltyCorrections(
		planActorDexPenaltyCorrections({ name: "b", items: [good, zero] }));

	assert.deepEqual(stats, { corrected: 0, failed: 0 });
	assert.deepEqual(good.updates, []);
	assert.deepEqual(zero.updates, []);
});

await test("re-running changes nothing (spec: idempotent by construction, no flag needed)", async () => {
	const actor = { name: "c", items: SHIPPED_POSITIVE.map((v, i) => armor(`positiva ${i}`, v)) };

	const first = await applyDexPenaltyCorrections(planActorDexPenaltyCorrections(actor));
	assert.equal(first.corrected, 11);

	// The SECOND pass is the whole argument for having no flag: the predicate stops matching.
	const secondPlan = planActorDexPenaltyCorrections(actor);
	assert.equal(secondPlan.length, 0);

	const second = await applyDexPenaltyCorrections(secondPlan);
	assert.deepEqual(second, { corrected: 0, failed: 0 });
	assert.ok(actor.items.every(i => i.updates.length === 1), "exactly one write per Item, ever");

	// And a third, because "idempotent" is a claim about every subsequent run, not just the next.
	assert.equal(planActorDexPenaltyCorrections(actor).length, 0);
});

await test("one refused update does not stop the rest (error-isolated per Item)", async () => {
	const before = armor("antes", 1);
	const broken = armor("sin permiso", 2, { failing: true });
	const after = armor("después", 3);
	const seen = [];

	const stats = await applyDexPenaltyCorrections(
		planActorDexPenaltyCorrections({ name: "d", items: [before, broken, after] }),
		msg => seen.push(msg));

	assert.deepEqual(stats, { corrected: 2, failed: 1 });
	assert.equal(before.system.dexpenalty, -1);
	assert.equal(after.system.dexpenalty, -3);
	assert.equal(broken.system.dexpenalty, 2, "the failed Item keeps its old value, uncorrupted");
	assert.equal(seen.length, 1);
	assert.match(seen[0], /sin permiso/);
});

await test("an empty or absent plan is a no-op, never a throw", async () => {
	assert.deepEqual(await applyDexPenaltyCorrections([]), { corrected: 0, failed: 0 });
	assert.deepEqual(await applyDexPenaltyCorrections(undefined), { corrected: 0, failed: 0 });
});

// =============================================================================================
console.log("totals.js — the consumer is NOT clamped (design.md D4, and the spec says so)");
// =============================================================================================

const TOTALS = read("module/scripts/totals.js");

test("the two `+=` sites that add dexpenalty are still there, unclamped", () => {
	const sites = TOTALS.match(/attributes\.dexterity\.total \+= i\.system\.dexpenalty;/g) ?? [];
	// Two: the non-shapeshifter branch and the per-form branch. If this count moves, the armor
	// loop was restructured and this gate has stopped reading what it thinks it reads.
	assert.equal(sites.length, 2, "expected the 2 known dexpenalty accumulation sites");
});

test("no Math.max clamp was added to the Dexterity total or the Initiative derived from it", () => {
	// A `Math.max(0, …)` here would have masked all eleven shipped documents forever: with a clamp
	// in place they would have kept granting a bonus and nothing would ever have shown it.
	for (const line of TOTALS.split("\n")) {
		if (!/dexterity\.total|initiative\.base/.test(line)) continue;
		assert.ok(!/Math\.(max|min)/.test(line),
			`clamped: ${line.trim()} — the correction belongs at the data's source (design.md D4)`);
	}
});

test("the accumulation is still gated on `isequipped` — a stored armor penalizes nothing", () => {
	// The same gate controls Soak AND the penalty; wodchar's exporter hardcoding `isequipped: false`
	// is why a wodchar character gets neither until a human ticks the box (design.md D11). That fix
	// is wodchar's; this only pins the gate the two sides agree on.
	assert.match(TOTALS, /\(i\.type == "Armor"\) && \(i\.system\?\.isequipped\)/);
});

test("the penalty lands on the ATTRIBUTE TOTAL, which is what carries it into Initiative", () => {
	assert.match(TOTALS, /initiative\.base = parseInt\(updateData\.system\.attributes\.dexterity\.total\)/);
});

// =============================================================================================
console.log("shieldbonus — declared, defaulted, localized in both languages, read-only");
// =============================================================================================

const TEMPLATE_JSON = JSON.parse(read("template.json"));
const ARMOR_SHEET = read("templates/sheets/armor-sheet.html");
const SHIELD_KEY = "wod.combat.armor.shieldbonus";

test("template.json declares Item.Armor.shieldbonus defaulting to 0", () => {
	const armorTemplate = TEMPLATE_JSON.Item.Armor;
	assert.ok("shieldbonus" in armorTemplate, "Item.Armor has no `shieldbonus`");
	assert.equal(armorTemplate.shieldbonus, 0);
	// The neighbours it was declared alongside — a rename would silently orphan the exporter.
	for (const key of ["soak", "dexpenalty", "forms"]) assert.ok(key in armorTemplate, key);
});

test("the label exists with a NON-EMPTY value in both en.json and es.json", () => {
	for (const code of ["en", "es"]) {
		const tree = JSON.parse(read(`lang/${code}.json`));
		const value = SHIELD_KEY.split(".").reduce((node, part) => node?.[part], tree);
		assert.equal(typeof value, "string", `lang/${code}.json has no ${SHIELD_KEY}`);
		assert.ok(value.trim().length > 0, `lang/${code}.json: ${SHIELD_KEY} is empty`);
		assert.ok(value.length <= 45, `lang/${code}.json: ${SHIELD_KEY} is not a label`);
	}
});

test("the sheet renders it behind an `{{#if}}`, so a non-shield shows no row", () => {
	assert.match(ARMOR_SHEET, /\{\{#if data\.system\.shieldbonus\}\}/);
});

test("the sheet renders it READ-ONLY: no input, no name, so nothing can submit it", () => {
	// Not even a `readonly` input — a readonly input still submits its value, which is how a
	// per-actor divergence from the book would creep into compendium-owned reference data.
	assert.ok(!/name="system\.shieldbonus"/.test(ARMOR_SHEET),
		"the armor sheet offers a form field for shieldbonus");
	const block = ARMOR_SHEET.split("{{#if data.system.shieldbonus}}")[1].split("{{/if}}")[0];
	assert.ok(!/<input|<select|<textarea|contenteditable/.test(block),
		`the shieldbonus block contains an editable control: ${block.trim()}`);
	assert.ok(block.includes(`{{localize "${SHIELD_KEY}"}}`), "the row has no localized label");
	assert.ok(block.includes("{{data.system.shieldbonus}}"), "the row shows no value");
});

test("no `../` on the shieldbonus paths — this template has no enclosing {{#each}}", () => {
	// The context-depth failure that has bitten three times: a bare name inside `{{#each}}`
	// resolves against the array ELEMENT, so the control renders NEVER. Established by rendering
	// this file under real Handlebars 4.7.7 (see the header), pinned here so a future move of this
	// row into a loop has to think about it.
	const enclosing = ARMOR_SHEET.split("{{#if data.system.shieldbonus}}")[0];
	const opens = (enclosing.match(/\{\{#each /g) ?? []).length;
	const closes = (enclosing.match(/\{\{\/each\}\}/g) ?? []).length;
	assert.equal(opens - closes, 0, "the shieldbonus row is now inside an {{#each}}: depth must change");
});

test("nothing in module/ reads shieldbonus — it is displayed, never consumed (design.md D5)", () => {
	// The +1/+2 modifies the ATTACKER's difficulty (sdr/0.8.es.md:2211); only
	// `wod20-combat-foundryvtt` knows who attacks whom. If this ever fails, either the automation
	// landed (update the spec first) or something started silently adding a shield to a pool.
	const hits = [];
	for (const rel of ["module/scripts/totals.js", "module/scripts/dice-helpers.js",
		"module/scripts/bonus-helpers.js", "module/dialogs/dialog-item.js"]) {
		let body;
		try { body = read(rel); } catch { continue; }
		if (body.includes("shieldbonus")) hits.push(rel);
	}
	assert.deepEqual(hits, []);
});

// =============================================================================================
console.log("initiative — the SCHEMA is not clamped either (§8.4.5: a defect D4's own test above cannot see)");
// =============================================================================================

/*
 * `totals.js`'s own "no Math.max clamp" test above only proves the CONSUMER does not re-clamp what it
 * computes. It says nothing about whether the value SURVIVES the `actor.update()` that follows —
 * measured live against a disposable actor (tasks.md §8.4.5): `initiative.base`/`.total` calculated
 * correctly as negative, then read back as 0 after `update()`, while `attributes.dexterity.total` on
 * the SAME object held its negative value. The two fields are declared in DIFFERENT files
 * (`base/actor_attributes.js` for `dexterity.total`, `pc-actor-datamodel.js` for `initiative`), and
 * only the second one's `NumberField` carried `min: 0` — a schema-level floor Foundry enforces at
 * `clean()`/`_cast()` time, invisible to any check that only reads `totals.js`.
 */

const DATAMODEL = read("module/actor/datamodel/pc-actor-datamodel.js");

test("the initiative schema fields carry NO floor (min) — design.md D4 applies to the whole pipeline, not just totals.js", () => {
	const m = /schema\.initiative\s*=\s*new fields\.SchemaField\(\{([\s\S]*?)\}\);/.exec(DATAMODEL);
	assert.ok(m, "schema.initiative block not found — has this file been restructured?");
	const block = m[1];

	// `valueInteger` (this file's own local const) is `{..., min: 0}`; `valueNumber` is the same
	// shape with no `min` at all. Written from the RULE ("no floor"), not from the fix just applied:
	// asserting `valueNumber` by name would also pass if `valueInteger` gained a `min: -Infinity`
	// override, which a literal `min` scan below additionally rules out.
	assert.ok(!/valueInteger/.test(block),
		"schema.initiative reuses `valueInteger`, which carries `min: 0` — a negative Iniciativa " +
		"(dexterity.total + wits.total can be negative once armor penalties stack, design.md D4) " +
		"would be silently floored to 0 by Foundry's NumberField on the next actor.update().");
	assert.ok(!/\bmin\s*:/.test(block),
		`schema.initiative declares a literal "min:" — even without valueInteger, a floor here ` +
		`contradicts design.md D4 ("Foundry no acota"): ${block.trim()}`);
});

console.log("");
if (failures) {
	console.error(`${failures} armor-dexpenalty test(s) FAILED.`);
	process.exit(1);
}
console.log("All armor-dexpenalty tests passed.");
