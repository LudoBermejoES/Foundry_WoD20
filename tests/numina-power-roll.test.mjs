/**
 * add-power-roll-wiring task 1.2.3, CORRECTED — exercises the render-shape half of Decision 2
 * (`Foundry_WoD20/module/scripts/item-helpers.js`'s `BuildPowerSections`/`GetPowersByType`):
 * the `numinas` power section stays `template: "hierarchical"` (rendered via
 * `power_listmainpower.hbs`, exactly like Disciplines/Arts/Arcanoi), NOT `"simple"`. A first
 * attempt at this task flipped it to `"simple"` to give a flat, parentless Numen/Numina
 * (Hunter, Mage Sorcerer/Psychic) a roll affordance — but `wod.types.numina` genuinely has a
 * second, pre-existing, fixture-covered shape: a CONTAINER item with real `wod.types.numinapower`
 * children (same pattern as Disciplines/Arcanoi), rendered nested via `getPowerList`.
 * `power_listpower.hbs` (the "simple" renderer) only draws items whose OWN `system.type` matches
 * the section's registered type, so a `wod.types.numinapower` child was never in
 * `context.numinas` and rendered nowhere — caught by `.github/scripts/test-part-render.mjs`'s
 * orphan sweep against `.github/fixtures/pc-items.json`'s parented Numina+Numina-power pair,
 * which blocked that commit's own CI preflight. The fix instead teaches
 * `power_listmainpower.hbs` itself to grant the roll affordance to a container row when that
 * specific item has ZERO children (`getPowerList` empty) AND is itself flagged `isrollable` —
 * so a flat Numina rolls directly off its row, while a Numina actually used as a container
 * (or Disciplines/Arcanoi, whose container items are never `isrollable`) keeps the plain,
 * non-rollable header exactly as before. This also regression-guards that genuinely two-tier
 * sections (Disciplines/Arts/Arcanoi) keep `"hierarchical"`, since `item-helpers.js` builds the
 * whole `definitions` object on every call and a careless edit could flip more than the one key
 * in scope.
 *
 * `item-helpers.js` is reachable with two minimal global stubs (`FormApplication` — its
 * `import BonusHelper` chain reaches `dialog-bonus.js`'s `class DialogBonus extends
 * FormApplication` at module load — and `foundry.utils.duplicate`, called inside
 * `buildPowerSection`). Both are pure passthrough stubs; no Foundry runtime behavior is
 * exercised, only the plain-object section definitions.
 *
 * The DISPATCH half of this change (`action-helpers.js`'s new `"wod.types.numina"` case in
 * `RollDialog`) is NOT imported here: `action-helpers.js` transitively reaches
 * `dialog-weaponv2.js`, which destructures `foundry.applications.api.{ApplicationV2,
 * HandlebarsApplicationMixin}` and extends the result at module load — a much deeper stub
 * surface than this repo has built for any test so far (same `FormApplication`-class-of-
 * problem boundary `formula-casting.test.mjs`'s header note draws for `dialog-casting.js`).
 * That case is instead verified two ways: (a) the source-level check below, which parses the
 * real file text and asserts the new case is present, well-formed, and does not collide with
 * the pre-existing `"wod.types.numinapower"` case; (b) manual code trace, recorded in this
 * change's tasks.md — `RollDialog` switches on `dataset.object` by exact string equality, so a
 * flat Numina (`"wod.types.numina"`) and a child Numina-power (`"wod.types.numinapower"`) can
 * never both match the same `if`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal Foundry-global stubs — see header note. Neither is exercised for real Foundry
// behavior; `duplicate` only needs to deep-copy a plain-data section definition object.
globalThis.FormApplication = class {};
globalThis.foundry = { utils: { duplicate: (obj) => JSON.parse(JSON.stringify(obj)) } };

const ItemHelper = (await import(join(ROOT, "module", "scripts", "item-helpers.js"))).default;

let failures = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ok - ${name}`);
	} catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.stack ?? err.message}`);
	}
}

function makeActor(items) {
	return {
		type: "PC",
		system: {
			settings: {
				hasnuminas: true,
				hasdisciplines: true,
				hasarcanoi: true
			}
		},
		items
	};
}

console.log("item-helpers.js — numina power section (add-power-roll-wiring 1.2)");

test("GetPowersByType returns a FLAT, name-sorted list of wod.types.numina items", () => {
	const actor = makeActor([
		{ type: "Power", name: "Zeta Numen", system: { type: "wod.types.numina" } },
		{ type: "Power", name: "Alpha Numen", system: { type: "wod.types.numina" } },
		{ type: "Power", name: "Unrelated Gift", system: { type: "wod.types.gift" } }
	]);

	const numinas = ItemHelper.GetPowersByType(actor, "wod.types.numina", true);

	assert.equal(numinas.length, 2);
	assert.deepEqual(numinas.map((i) => i.name), ["Alpha Numen", "Zeta Numen"]);
});

test('BuildPowerSections declares the "numinas" section as template "hierarchical", not "simple"', () => {
	const actor = makeActor([]);
	const context = {
		numinas: [{ _id: "n1", name: "Hedge Path Numen", system: { type: "wod.types.numina", isrollable: true } }]
	};
	const powerConfig = { defaultOrder: ["numinas"] };

	const sections = ItemHelper.BuildPowerSections(actor, context, "mage", powerConfig);
	const numinaSection = sections.find((s) => s.id === "numinas");

	assert.ok(numinaSection, "expected a numinas section to be built");
	assert.equal(numinaSection.template, "hierarchical");
	assert.equal(numinaSection.data.items.length, 1);
});

test("BuildPowerSections leaves genuinely two-tier sections (Disciplines, Arcanoi) as hierarchical", () => {
	const actor = makeActor([]);
	const context = {
		disciplines: [{ _id: "d1", name: "Celerity", system: { type: "wod.types.discipline" } }],
		arcanoi: [{ _id: "a1", name: "Argos", system: { type: "wod.types.arcanoi" } }]
	};
	const powerConfig = { defaultOrder: ["disciplines", "arcanoi"] };

	const sections = ItemHelper.BuildPowerSections(actor, context, "vampire", powerConfig);

	assert.equal(sections.find((s) => s.id === "disciplines").template, "hierarchical");
	assert.equal(sections.find((s) => s.id === "arcanoi").template, "hierarchical");
});

test("a numinas section with no numina items on the actor is omitted (condition gate unchanged)", () => {
	const actor = makeActor([]);
	const context = { numinas: [] };
	const powerConfig = { defaultOrder: ["numinas"] };

	const sections = ItemHelper.BuildPowerSections(actor, context, "mage", powerConfig);

	assert.equal(sections.find((s) => s.id === "numinas"), undefined);
});

console.log("\naction-helpers.js — RollDialog dispatch for bare wod.types.numina (source-level check, see header)");

test('RollDialog gains exactly one dispatch case for the literal "wod.types.numina" string', () => {
	const source = readFileSync(join(ROOT, "module", "scripts", "action-helpers.js"), "utf8");

	const matches = source.match(/dataset\.object == "wod\.types\.numina"\)/g) ?? [];
	assert.equal(matches.length, 1, 'expected exactly one exact-match case for "wod.types.numina"');

	// Must not be satisfied by, or collide with, the pre-existing child-power case.
	const numinapowerMatches = source.match(/dataset\.object == "wod\.types\.numinapower"\)/g) ?? [];
	assert.equal(numinapowerMatches.length, 1, "the pre-existing numinapower case must still exist, unchanged");
});

test("the new numina case opens PowerDialog.DialogPower (the working roll dialog), not a dead end", () => {
	const source = readFileSync(join(ROOT, "module", "scripts", "action-helpers.js"), "utf8");
	const caseStart = source.indexOf('dataset.object == "wod.types.numina")');
	assert.notEqual(caseStart, -1);

	const block = source.slice(caseStart, caseStart + 400);
	assert.match(block, /new PowerDialog\.Power\(/);
	assert.match(block, /new PowerDialog\.DialogPower\(/);
	assert.match(block, /\.render\(true\)/);
});

console.log("\npower_listmainpower.hbs — container row grows a roll affordance for a childless, rollable item");

test("a childless, isrollable container row gains data-action=rollDice gated on isEmpty(getPowerList(...))", () => {
	const source = readFileSync(join(ROOT, "templates", "actor", "parts", "power_listmainpower.hbs"), "utf8");

	// The whole rollable branch must be reached only when BOTH conditions hold, in one `and`.
	assert.match(
		source,
		/\{\{#if \(and mainpower\.system\.isrollable \(isEmpty \(getPowerList actor mainpower\._id\)\)\)\}\}/,
		"expected an `and`-gated isrollable + isEmpty(getPowerList(...)) condition"
	);

	const ifIndex = source.indexOf("{{#if (and mainpower.system.isrollable");
	assert.notEqual(ifIndex, -1);
	const elseIndex = source.indexOf("{{else}}", ifIndex);
	assert.notEqual(elseIndex, -1, "expected an {{else}} falling back to the plain, non-rollable header");

	const rollableBranch = source.slice(ifIndex, elseIndex);
	assert.match(rollableBranch, /data-action="rollDice"/);
	assert.match(rollableBranch, /data-rollitem="true"/);
	assert.match(rollableBranch, /data-object="\{\{mainpower\.system\.type\}\}"/);
	assert.match(rollableBranch, /data-itemid="\{\{mainpower\._id\}\}"/);

	const fallbackBranch = source.slice(elseIndex, source.indexOf("{{/if}}", elseIndex));
	assert.doesNotMatch(fallbackBranch, /data-action="rollDice"/, "the non-rollable fallback must not itself be clickable");
});

test("the container-row fix does not remove the pre-existing nested getPowerList render of real children", () => {
	const source = readFileSync(join(ROOT, "templates", "actor", "parts", "power_listmainpower.hbs"), "utf8");

	assert.match(
		source,
		/\{\{#each \(getPowerList actor mainpower\._id\) as \|item id\|\}\}/,
		"expected the nested child-power loop (power_listpower.hbs per child) to still be present"
	);
});

console.log(`\n${failures === 0 ? "All tests passed." : `${failures} test(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
