#!/usr/bin/env node
/**
 * Offline behavioural harness for the Advantage "roll" derivation --
 * the dice pool actually rolled for Willpower, Rage, Gnosis, Paradox, Glamour,
 * Blood Pool, the virtues, and every other Advantage-type trait.
 *
 *     node .github/scripts/test-advantage-roll-derivation.mjs
 *
 * WHY THIS EXISTS (fix-advantage-roll-zero-on-prepare)
 * -----------------------------------------------------
 * Reported live: clicking to roll Willpower (or any other Advantage) always
 * showed a pool of 0, regardless of the actor's real rating, on every
 * freshly-created or imported "PC"-type actor (e.g. via the
 * `worldofdarkness-import-actor` MCP tool, or any plain `Actor.create`). It
 * "self-healed" for one item only after a GM edited that Advantage's dots
 * once.
 *
 * ROOT CAUSE: `WoDItem#_handleAdvantagesCalculations` (module/items/data/
 * wod-item-base.js) is the function that derives `system.roll`, but it was
 * called ONLY from `_preUpdate` -- i.e. only as a side effect of an explicit
 * item `.update()`. Nothing ever called it (or anything equivalent) during
 * NORMAL data preparation (actor load, sheet render, right after
 * Actor.create()/createEmbeddedDocuments()). Every shipped Advantage
 * template/exporter output ships a hardcoded `"roll": 0`, so that raw zero
 * just sat there and displayed as the roll pool.
 *
 * THE FIX extracted the actual computation into a shared, pure(ish) function
 * -- `computeAdvantageDerivedData` (module/items/data/advantage-derivations.js)
 * -- and wired it into TWO places:
 *   1. `WoDItem#_handleAdvantagesCalculations` (still called from `_preUpdate`,
 *      unchanged job: persist the derived value into the update patch so it
 *      round-trips through exports/imports).
 *   2. `AdvantageDataModel#prepareDerivedData` (module/items/datamodel/
 *      advantage-item-datamodel.js) -- Foundry calls this AUTOMATICALLY, on
 *      every normal data-preparation pass, for any Item whose type has a
 *      registered `TypeDataModel` (Advantage does: `CONFIG.Item.dataModels.
 *      Advantage` in wod.js). THIS is the new call site that actually fixes
 *      the bug: it needs no explicit `.update()` at all.
 *
 * This harness exercises BOTH call sites against the real, shipped code (not
 * a re-implementation), plus the shared function directly for the concrete
 * cases from the bug report:
 *   - a fresh actor with permanent=5/temporary=5 and the `advantageRolls`
 *     world setting at its default (true) -> roll must read 5, not 0.
 *   - an actor with temporary=0 after spending all willpower -> roll must
 *     still reflect the CURRENT inputs (not silently stay stale), under both
 *     settings of `advantageRolls`.
 *   - idempotency: running the derivation twice back-to-back (e.g. once at
 *     prepare-time, again inside a later `_preUpdate`) must not change the
 *     result the second time.
 *   - the path/virtue/willpower-permanent side calculations already covered
 *     by the pre-existing (unmodified) branch logic still behave the same.
 *
 * WHY THE MODULE TREE IS COPIED, AND WHY TWO abstract CLASSES ARE STUBBED
 * ------------------------------------------------------------------------
 * Same trick as test-secondability-id.mjs: no package.json in this repo, so
 * `module/` is copied into a temp dir with one dropped beside it so node
 * parses `.js` as ES modules. `advantage-item-datamodel.js` additionally pulls
 * in `./base/item_base_settings.js`, whose `base_settings` class declaration
 * is `extends foundry.abstract.DataModel` -- evaluated at class-DEFINITION
 * time (i.e. at import, before any instance exists) -- so `foundry.abstract.
 * DataModel` has to be a real class before that import runs, not just
 * `TypeDataModel` (which the secondability harness already stubs because
 * `AdvantageDataModel extends foundry.abstract.TypeDataModel` needs it too).
 *
 * `AdvantageDataModel#prepareDerivedData` is tested by constructing an
 * instance with `Object.create(AdvantageDataModel.prototype)` rather than
 * `new AdvantageDataModel(...)`: the real constructor runs Foundry's schema
 * validation machinery, which these stub classes do not implement. Building
 * the prototype chain directly and assigning plain fields exercises the
 * method under test -- the actual hook Foundry calls -- without needing a
 * full DataModel/schema reimplementation.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-advantage-roll-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));
fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

class Item {
	// The real base-class hooks. WoDItem calls all of these through `super`.
	async _preCreate() {}
	async _onCreate() {}
	async _preUpdate() {}
	async _onUpdate() {}
	static migrateData(source) { return source; }
}
class FormApplication {
	static get defaultOptions() { return {}; }
}
class Application {}

globalThis.FormApplication = FormApplication;
globalThis.Application = Application;
globalThis.Item = Item;
globalThis.Actor = class Actor {};
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
globalThis.game = {
	system: { version: "0.0.0-harness" },
	i18n: { localize: (k) => k, format: (k) => k, translations: {} },
	actors: { get: () => undefined },
	settings: { get: () => undefined },
	packs: { get: () => undefined }
};
globalThis.CONFIG = {
	worldofdarkness: {
		attributeSettings: "20th",
		fifthEditionWillpowerSetting: "20th",
		rollSettings: true,
		sheettype: { vampire: "Vampire" }
	},
	Item: { dataModels: {} },
	Actor: { dataModels: {} }
};
globalThis.foundry = {
	utils: {
		duplicate: (o) => structuredClone(o),
		mergeObject: (a, b) => Object.assign({}, a, b)
	},
	abstract: {
		TypeDataModel: class TypeDataModel {},
		DataModel: class DataModel {}
	},
	data: { fields: {} }
};

const { WoDItem } = await import(
	path.join(sandbox, "module", "items", "data", "wod-item-base.js")
);
const { computeAdvantageDerivedData } = await import(
	path.join(sandbox, "module", "items", "data", "advantage-derivations.js")
);
const { default: AdvantageDataModel } = await import(
	path.join(sandbox, "module", "items", "datamodel", "advantage-item-datamodel.js")
);

let passed = 0;
const failures = [];
async function test(name, fn) {
	try {
		await fn();
		passed++;
		console.log(`  ok   ${name}`);
	}
	catch (err) {
		failures.push({ name, err });
		console.log(`  FAIL ${name}`);
		console.log(`         ${String(err.message).split("\n").join("\n         ")}`);
	}
}

/** A minimal Advantage `system` shape, defaulted the way AdvantageDataModel's
 * own schema initial values would. */
function advantageSystem(overrides = {}) {
	return {
		id: "",
		group: "",
		permanent: 0,
		temporary: 0,
		max: 10,
		roll: 0,
		bearing: 0,
		settings: {
			usepermanent: false,
			usetemporary: false,
			useroll: false,
			usebothrolls: false,
			highertemporary: false
		},
		...overrides,
		settings: {
			usepermanent: false,
			usetemporary: false,
			useroll: false,
			usebothrolls: false,
			highertemporary: false,
			...(overrides.settings ?? {})
		}
	};
}

function fakeActor({ powersMax = 5, variant = "general", composure = 0, resolve = 0 } = {}) {
	return {
		system: {
			settings: { powers: { defaultmaxvalue: powersMax }, variant },
			attributes: { composure: { value: composure }, resolve: { value: resolve } }
		}
	};
}

console.log("\nA. computeAdvantageDerivedData -- the concrete cases from the bug report");

await test("permanent=5/temporary=5, advantageRolls default (true) -> roll reads 5, not 0", async () => {
	CONFIG.worldofdarkness.rollSettings = true;
	const willpower = advantageSystem({
		id: "willpower",
		permanent: 5,
		temporary: 5,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	});

	computeAdvantageDerivedData(willpower, fakeActor());

	assert.equal(willpower.roll, 5, "a fresh Willpower with a real rating must not display a 0 pool");
});

await test("temporary=0 after spending, advantageRolls=true -> roll still reads the PERMANENT rating", async () => {
	CONFIG.worldofdarkness.rollSettings = true;
	const willpower = advantageSystem({
		id: "willpower",
		permanent: 5,
		temporary: 0,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	});

	computeAdvantageDerivedData(willpower, fakeActor());

	assert.equal(willpower.roll, 5, "advantageRolls=true always rolls the permanent rating, spent temporary or not");
});

await test("temporary=0 after spending, advantageRolls=false -> roll reflects the LOWER (spent) value", async () => {
	CONFIG.worldofdarkness.rollSettings = false;
	const willpower = advantageSystem({
		id: "willpower",
		permanent: 5,
		temporary: 0,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	});

	computeAdvantageDerivedData(willpower, fakeActor());

	assert.equal(willpower.roll, 0, "advantageRolls=false must roll the lower of permanent/temporary, not stay stale at the old value");
	CONFIG.worldofdarkness.rollSettings = true;
});

await test("usebothrolls (e.g. a house rule spending both dice pools) -> roll is permanent + temporary", async () => {
	const gnosis = advantageSystem({
		id: "gnosis",
		permanent: 4,
		temporary: 3,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true, usebothrolls: true }
	});

	computeAdvantageDerivedData(gnosis, fakeActor());

	assert.equal(gnosis.roll, 7);
});

await test("usepermanent only (e.g. Blood Pool) -> roll mirrors permanent", async () => {
	const bloodpool = advantageSystem({
		id: "bloodpool",
		permanent: 10,
		max: 20,
		settings: { usepermanent: true, useroll: true }
	});

	computeAdvantageDerivedData(bloodpool, fakeActor());

	assert.equal(bloodpool.roll, 10);
});

await test("an Advantage with useroll=false is left at 0 (not every Advantage is rolled)", async () => {
	const notRolled = advantageSystem({ id: "something", permanent: 5, settings: { usepermanent: true } });

	computeAdvantageDerivedData(notRolled, fakeActor());

	assert.equal(notRolled.roll, 0);
});

console.log("\nB. idempotency -- running the derivation twice back-to-back must not change the second result");

await test("prepare-time derivation followed by a later _preUpdate derivation agree", async () => {
	const willpower = advantageSystem({
		id: "willpower",
		permanent: 5,
		temporary: 5,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	});

	computeAdvantageDerivedData(willpower, fakeActor());
	const first = willpower.roll;
	computeAdvantageDerivedData(willpower, fakeActor());

	assert.equal(willpower.roll, first, "a second, back-to-back run changed a value the first run already settled");
	assert.equal(willpower.roll, 5);
});

console.log("\nC. the pre-existing side calculations (path bearing, virtue max, willpower-permanent) still work");

await test("path bearing tiers are unchanged", async () => {
	const path1 = advantageSystem({ id: "path", permanent: 1 });
	const path5 = advantageSystem({ id: "path", permanent: 5 });
	const path10 = advantageSystem({ id: "path", permanent: 10 });

	computeAdvantageDerivedData(path1, fakeActor());
	computeAdvantageDerivedData(path5, fakeActor());
	computeAdvantageDerivedData(path10, fakeActor());

	assert.equal(path1.bearing, 2);
	assert.equal(path5.bearing, 0);
	assert.equal(path10.bearing, -2);
});

await test("a virtue's max is set from the actor's powers.defaultmaxvalue", async () => {
	const conscience = advantageSystem({ id: "conscience", group: "virtue", permanent: 3, max: 10 });

	computeAdvantageDerivedData(conscience, fakeActor({ powersMax: 7 }));

	assert.equal(conscience.max, 7);
});

await test("5th-edition Willpower recomputes permanent from composure+resolve when actor is not a spirit", async () => {
	CONFIG.worldofdarkness.attributeSettings = "5th";
	CONFIG.worldofdarkness.fifthEditionWillpowerSetting = "5th";

	const willpower = advantageSystem({
		id: "willpower",
		permanent: 1,
		temporary: 1,
		max: 10,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	});

	computeAdvantageDerivedData(willpower, fakeActor({ composure: 3, resolve: 4 }));

	assert.equal(willpower.permanent, 7, "5th-edition Willpower permanent must be composure + resolve");

	CONFIG.worldofdarkness.attributeSettings = "20th";
	CONFIG.worldofdarkness.fifthEditionWillpowerSetting = "20th";
});

await test("no actor (e.g. a compendium/unowned item) -> falls back to defaults instead of throwing", async () => {
	const conscience = advantageSystem({ id: "conscience", group: "virtue", permanent: 3, max: 10 });

	computeAdvantageDerivedData(conscience, null);

	assert.equal(conscience.max, 5, "traitMax must default to 5 with no actor to read powers.defaultmaxvalue from");
});

console.log("\nD. AdvantageDataModel#prepareDerivedData -- the actual hook Foundry calls automatically");

await test("a fresh Advantage item's roll is derived WITHOUT any explicit .update() call", async () => {
	const actor = fakeActor();
	const fakeParentItem = { name: "Willpower", get actor() { return actor; } };

	const system = Object.create(AdvantageDataModel.prototype);
	Object.assign(system, advantageSystem({
		id: "willpower",
		permanent: 5,
		temporary: 5,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	}));
	system.parent = fakeParentItem;

	// THE point of this test: prepareDerivedData is called directly, exactly as
	// Foundry's own Document#prepareDerivedData calls `this.system.
	// prepareDerivedData?.()` during ordinary data preparation -- no `.update()`
	// anywhere in this test.
	system.prepareDerivedData();

	assert.equal(system.roll, 5, "AdvantageDataModel#prepareDerivedData did not derive `roll` at prepare-time");
});

await test("an unowned Advantage (no parent.actor) does not throw and leaves roll derivable from defaults", async () => {
	const system = Object.create(AdvantageDataModel.prototype);
	Object.assign(system, advantageSystem({
		id: "willpower",
		permanent: 3,
		temporary: 3,
		max: 5,
		settings: { usepermanent: true, usetemporary: true, useroll: true }
	}));
	system.parent = { name: "Willpower", actor: null };

	system.prepareDerivedData();

	assert.equal(system.roll, 3);
});

await test("a non-Advantage-shaped call (parent undefined) does not throw", async () => {
	const system = Object.create(AdvantageDataModel.prototype);
	Object.assign(system, advantageSystem({ id: "rage", permanent: 2, settings: { usepermanent: true, useroll: true } }));
	// no `.parent` assigned at all

	system.prepareDerivedData();

	assert.equal(system.roll, 2);
});

console.log("\nE. WoDItem#_handleAdvantagesCalculations (the _preUpdate persistence path) still delegates correctly");

await test("the _preUpdate path still derives the same roll the prepare-time path derives", async () => {
	const actor = fakeActor();
	const item = Object.create(WoDItem.prototype);
	Object.defineProperty(item, "actor", { value: actor, enumerable: true });

	const itemData = {
		name: "Willpower",
		system: advantageSystem({
			id: "willpower",
			permanent: 5,
			temporary: 5,
			max: 5,
			settings: { usepermanent: true, usetemporary: true, useroll: true }
		})
	};

	const result = await item._handleAdvantagesCalculations(itemData);

	assert.equal(result.system.roll, 5, "_handleAdvantagesCalculations no longer derives `roll` correctly");
	assert.equal(result, itemData, "the function must still return the same itemData object it was given (its callers rely on this)");
});

console.log("");
if (failures.length) {
	console.error(`advantage-roll-derivation harness FAILED: ${failures.length} of ${passed + failures.length} checks`);
	for (const f of failures) console.error(`  - ${f.name}`);
	process.exit(1);
}
console.log(`advantage-roll-derivation harness OK: ${passed} checks passing`);
