#!/usr/bin/env node
/**
 * Offline behavioural harness for the secondary-ability `system.id` key.
 *
 *     node .github/scripts/test-secondability-id.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * This repo has no test suite, no build step and no linter (no package.json at
 * all). `system-preflight.py` validates the manifest and references, and
 * `js-syntax-check.sh` proves every file parses -- but neither can tell you that
 * a newly created secondary ability actually comes out carrying its key. That is
 * a behavioural question, so it needs code that RUNS.
 *
 * A secondary ability is a `Trait` item whose `system.type` ends in
 * `secondability`. `Trait` has no DataModel (see CONFIG.Item.dataModels in
 * wod.js) and template.json declares no `id` on Item.Trait nor on any of its
 * three merged templates, so `system` is free-form there and a stamped `id`
 * persists with no schema change. Downstream (the wod20-char importer) a
 * secondary with no key can only be identified by re-slugifying its NAME, which
 * stops working as soon as the name is localised.
 *
 * WHY THE MODULE TREE IS COPIED
 * -----------------------------
 * With no package.json, node parses a `.js` file under the CommonJS goal and
 * `import`/`export` blow up. Rather than rename every file (relative specifiers
 * all say `.js`), the harness copies `module/` verbatim into a temp directory and
 * drops a `{"type":"module"}` package.json beside it. The code under test is a
 * byte-identical copy -- same trick as js-syntax-check.sh, generalised so the
 * whole module graph can be imported and executed.
 *
 * The Foundry globals are stubbed to the minimum the module graph touches at
 * load time (FormApplication, Item, game, CONFIG, ui, foundry).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

/* ------------------------------------------------------------------ *
 * 1. Copy `module/` somewhere node will parse it as ES modules.
 * ------------------------------------------------------------------ */

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-secondability-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));

fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

/* ------------------------------------------------------------------ *
 * 2. Minimal Foundry globals, installed BEFORE the imports.
 *    `class X extends FormApplication` is evaluated at module load, so these
 *    have to exist first.
 * ------------------------------------------------------------------ */

class FormApplication {
	static get defaultOptions() { return {}; }
}
class Application {}
class Item {
	// The real base-class hooks. WoDItem calls all of these through `super`.
	async _preCreate() {}
	async _onCreate() {}
	async _preUpdate() {}
	async _onUpdate() {}
	static migrateData(source) { return source; }
}

const notifications = { warn: [], error: [], info: [] };

globalThis.FormApplication = FormApplication;
globalThis.Application = Application;
globalThis.Item = Item;
globalThis.Actor = class Actor {};
globalThis.ui = {
	notifications: {
		warn: (m) => notifications.warn.push(m),
		error: (m) => notifications.error.push(m),
		info: (m) => notifications.info.push(m)
	}
};
globalThis.game = {
	system: { version: "0.0.0-harness" },
	// The system localises through this everywhere. Returning the key unchanged
	// is what game.i18n.localize() itself does for an unknown key, and it is
	// also what happens today when a CALLER localises a name and CreateAbility
	// localises it a second time.
	i18n: {
		localize: (k) => k,
		format: (k) => k,
		translations: {}
	},
	actors: { get: () => undefined },
	settings: { get: () => undefined },
	packs: { get: () => undefined }
};
globalThis.CONFIG = {
	worldofdarkness: {
		attributeSettings: "20th",
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
	abstract: { TypeDataModel: class TypeDataModel {} },
	data: { fields: {} }
};

/* ------------------------------------------------------------------ *
 * 3. Import the REAL code out of the copied tree.
 * ------------------------------------------------------------------ */

const { WoDItem } = await import(
	path.join(sandbox, "module", "items", "data", "wod-item-base.js")
);
const AbilityHelper = (await import(
	path.join(sandbox, "module", "scripts", "ability-helpers.js")
)).default;

/* ------------------------------------------------------------------ *
 * 4. Test scaffolding
 * ------------------------------------------------------------------ */

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
		console.log(`         ${err.message.split("\n").join("\n         ")}`);
	}
}

/**
 * Run the real WoDItem#_preCreate against a candidate document and return
 * everything it asked updateSource() to change.
 */
async function runPreCreate(data, options = {}) {
	const updates = {};
	const item = Object.create(WoDItem.prototype);
	item.updateSource = (u) => Object.assign(updates, u);
	await item._preCreate(data, options, {});
	return updates;
}

/** A fake actor that records whichever creation path CreateAbility takes. */
function fakeActor(iscreated, existingItems = []) {
	const calls = { createEmbeddedDocuments: [], updateSource: [] };
	return {
		calls,
		system: { settings: { iscreated } },
		items: existingItems,
		async createEmbeddedDocuments(type, docs) {
			calls.createEmbeddedDocuments.push({ type, docs });
			return docs.map((d, i) => ({ ...d, _id: `harness${i}` }));
		},
		updateSource(payload) {
			calls.updateSource.push(payload);
			return payload.items;
		},
		async getEmbeddedDocument() { return null; }
	};
}

/** The exact `system` of the two live "Arte" Traits read off the prod server. */
function liveArteSystem() {
	return {
		iscreated: true, isactive: false, isvisible: true, isremovable: true,
		order: 0, version: "1.5.0", parentid: "", itemuuid: "",
		worldanvil: "", reference: "", description: "", details: "",
		property: [], bonuslist: [],
		type: "wod.types.talentsecondability", placement: "feature",
		level: "0", value: 3, max: 5,
		ismeleeweapon: false, israngedeweapon: false, israngedweapon: false,
		ispower: false, isrollable: false, isfavorited: false,
		usesoaksettings: false, label: "Arte", speciality: "",
		dice1: "", dice2: "", bonus: 0, difficulty: 6,
		soak: {
			bashing: { isrollable: true },
			lethal: { isrollable: false },
			aggravated: { isrollable: false }
		},
		icon: "", tokenimage: ""
	};
}

/** A freshly-built secondary Trait, as template.json initialises one. */
function newSecondary(name, type = "wod.types.talentsecondability", extra = {}) {
	return {
		name,
		type: "Trait",
		system: {
			// the `settings` template merges FLAT into system for Trait
			iscreated: false, isactive: false, isvisible: true, isremovable: true,
			order: 0, version: "", parentid: "", itemuuid: "",
			type, placement: "feature", level: "0", value: 0, max: 5,
			label: name,
			...extra
		}
	};
}

/* ------------------------------------------------------------------ *
 * 5. The three cases the change has to satisfy, plus the regressions
 *    it must not cause.
 * ------------------------------------------------------------------ */

console.log("\nA. a NEW secondary Trait comes out carrying the key");

await test("talentsecondability gets system.id derived from its name", async () => {
	const updates = await runPreCreate(newSecondary("Ride", "wod.types.skillsecondability"));
	assert.equal(updates["system.id"], "ride");
});

await test("a multi-word name uses the consumer's snake_case rule", async () => {
	const updates = await runPreCreate(newSecondary("Tiro con arco", "wod.types.skillsecondability"));
	assert.equal(updates["system.id"], "tiro_con_arco");
});

await test("an accented name loses its accents, as the consumer does", async () => {
	const updates = await runPreCreate(newSecondary("Hipertecnología", "wod.types.skillsecondability"));
	assert.equal(updates["system.id"], "hipertecnologia");
});

await test("all three secondability types are covered", async () => {
	for (const t of [
		"wod.types.talentsecondability",
		"wod.types.skillsecondability",
		"wod.types.knowledgesecondability"
	]) {
		const updates = await runPreCreate(newSecondary("Archery", t));
		assert.equal(updates["system.id"], "archery", `type ${t}`);
	}
});

console.log("\nB. a secondary that ALREADY has the key keeps it");

await test("a carried system.id is not overwritten", async () => {
	const updates = await runPreCreate(
		newSecondary("Hipertecnologia", "wod.types.skillsecondability", { id: "hypertech" })
	);
	assert.ok(
		!("system.id" in updates),
		`_preCreate tried to overwrite a carried key with ${JSON.stringify(updates["system.id"])}`
	);
});

await test("an EMPTY system.id is treated as absent and filled", async () => {
	const updates = await runPreCreate(
		newSecondary("Archery", "wod.types.skillsecondability", { id: "" })
	);
	assert.equal(updates["system.id"], "archery");
});

console.log("\nC. Ability behaviour is unchanged");

await test("Ability still gets id + default type", async () => {
	const updates = await runPreCreate({ name: "Animal Ken", type: "Ability", system: {} });
	assert.equal(updates["system.id"], "animalken");
	assert.equal(updates["system.type"], "wod.abilities.ability");
});

await test("Ability with a carried id and type keeps both", async () => {
	const updates = await runPreCreate({
		name: "Animal Ken",
		type: "Ability",
		system: { id: "animalken", type: "wod.abilities.skill" }
	});
	assert.ok(!("system.id" in updates));
	assert.ok(!("system.type" in updates));
});

await test("Ability still gets iscreated + version stamped", async () => {
	const updates = await runPreCreate({ name: "Brawl", type: "Ability", system: {} });
	assert.equal(updates["system.iscreated"], true);
	assert.equal(updates["system.version"], "0.0.0-harness");
});

console.log("\nD. the two live 'Arte' Traits are not disturbed");

await test("the live Arte shape does not throw and is left alone", async () => {
	const before = liveArteSystem();
	const data = { name: "Arte", type: "Trait", system: liveArteSystem() };
	const updates = await runPreCreate(data);
	// iscreated is already true, so the whole _preCreate body is skipped.
	assert.deepEqual(updates, {}, `expected no changes, got ${JSON.stringify(updates)}`);
	assert.deepEqual(data.system, before, "_preCreate mutated the live item's system");
});

await test("flat settings (no system.settings object) never dereferenced", async () => {
	const data = { name: "Arte", type: "Trait", system: liveArteSystem() };
	data.system.iscreated = false; // force the body to run over the flat shape
	const updates = await runPreCreate(data);
	assert.equal(updates["system.id"], "arte");
	assert.equal(data.system.settings, undefined, "a system.settings object was invented");
});

console.log("\nE. no other item type is affected");

await test("a non-secondability Trait gets no key", async () => {
	for (const t of ["wod.types.othertraits", "wod.types.shapeform", ""]) {
		const updates = await runPreCreate(newSecondary("Whatever", t));
		assert.ok(!("system.id" in updates), `type ${t} unexpectedly got a key`);
	}
});

await test("the shapeform Trait rule still fires", async () => {
	const updates = await runPreCreate(newSecondary("Crinos", "wod.types.shapeform"));
	assert.equal(updates["system.usesoaksettings"], false);
});

await test("a Trait with a missing system.type does not throw", async () => {
	const updates = await runPreCreate({ name: "Bare", type: "Trait", system: {} });
	assert.ok(!("system.id" in updates));
});

console.log("\nF. AbilityHelper stamps the key on the path that bypasses _preCreate");

await test("updateSource branch (actor not yet created) carries the key", async () => {
	const actor = fakeActor(false);
	await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", "Ride", 5);
	assert.equal(actor.calls.updateSource.length, 1, "expected the updateSource branch");
	assert.equal(actor.calls.updateSource[0].items[0].system.id, "ride");
});

await test("createEmbeddedDocuments branch carries it too", async () => {
	const actor = fakeActor(true);
	await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", "Archery", 5);
	assert.equal(actor.calls.createEmbeddedDocuments.length, 1);
	assert.equal(actor.calls.createEmbeddedDocuments[0].docs[0].system.id, "archery");
});

await test("CreateTrait_nowait carries the key on both branches", async () => {
	const a = fakeActor(false);
	AbilityHelper.CreateTrait_nowait(a, "wod.types.talentsecondability", "Intrigue", 5);
	assert.equal(a.calls.updateSource[0].items[0].system.id, "intrigue");

	const b = fakeActor(true);
	AbilityHelper.CreateTrait_nowait(b, "wod.types.talentsecondability", "Intrigue", 5);
	assert.equal(b.calls.createEmbeddedDocuments[0].docs[0].system.id, "intrigue");
});

await test("a non-secondability Trait is NOT given a key by the helpers", async () => {
	const actor = fakeActor(false);
	await AbilityHelper.CreateAbility(actor, "wod.types.othertraits", "Something", 5);
	assert.equal(
		actor.calls.updateSource[0].items[0].system.id,
		undefined,
		"othertraits should be left exactly as before"
	);
});

await test("the duplicate guard still refuses an existing secondary", async () => {
	const actor = fakeActor(true, [
		{ type: "Trait", name: "Ride", system: { type: "wod.types.skillsecondability" } }
	]);
	await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", "Ride", 5);
	assert.equal(actor.calls.createEmbeddedDocuments.length, 0, "a duplicate was created");
	assert.equal(actor.calls.updateSource.length, 0);
});

console.log("\nH. what an UPDATE does -- i.e. whether an already-live secondary");
console.log("   can acquire the key without a hand migration");

/**
 * Run the real WoDItem#_preUpdate over a document and return the change set
 * that would actually be written.
 */
async function runPreUpdate(itemState, changes) {
	const item = Object.create(WoDItem.prototype);
	Object.assign(item, itemState);
	const updateData = structuredClone(changes);
	await item._preUpdate(updateData, {}, {});
	return updateData;
}

await test("a LIVE 'Arte' gains the key on an ordinary update", async () => {
	// The two live secondaries (Ines Falk vecg5uzgiJs3heMS, Lena Vogt
	// m4ILyzUEPycXDP6S) predate all of this: iscreated:true, flat settings, no key.
	// _preCreate can never reach them, so _preUpdate is what grants the key --
	// without a hand migration and without forcing a write.
	const state = { type: "Trait", name: "Arte", system: liveArteSystem() };
	const written = await runPreUpdate(state, { system: { value: 4 } });
	assert.equal(written.system.id, "arte");
	assert.equal(written.system.value, 4, "the caller's own change was dropped");
});

await test("...and nothing else about the live item is disturbed", async () => {
	const before = liveArteSystem();
	const state = { type: "Trait", name: "Arte", system: liveArteSystem() };
	const written = await runPreUpdate(state, { system: { value: 4 } });
	// only value + id are in the change set; no system.settings object invented
	assert.deepEqual(
		Object.keys(written.system).sort(), ["id", "value"],
		`unexpected keys written: ${JSON.stringify(written.system)}`
	);
	assert.equal(written.system.settings, undefined);
	assert.deepEqual(state.system, before, "_preUpdate mutated the item's own system");
});

await test("a REAL key is never overwritten by an update", async () => {
	// The canonical case: imported from wod20-char carrying `hypertech`, whose name
	// does not slugify back to it. Losing this would orphan the ability's data.
	const written = await runPreUpdate(
		{
			type: "Trait", name: "Hipertecnología",
			system: { type: "wod.types.skillsecondability", id: "hypertech" }
		},
		{ system: { value: 2 } }
	);
	assert.equal(
		written.system.id, undefined,
		`a live key was overwritten with ${JSON.stringify(written.system.id)}`
	);
});

await test("a real key survives even a RENAME", async () => {
	const written = await runPreUpdate(
		{
			type: "Trait", name: "Hipertecnología",
			system: { type: "wod.types.skillsecondability", id: "hypertech" }
		},
		{ name: "Hipertecnologia avanzada" }
	);
	assert.equal(written.system.id, undefined);
});

await test("placeholder -> renamed: the key becomes the REAL name's, not frozen", async () => {
	// The full "+" button journey. CreateAbility stamps the placeholder's slug,
	// autoopen pops the rename dialog, the user types the real name.
	const actor = fakeActor(true);
	await AbilityHelper.CreateAbility(
		actor, "wod.types.talentsecondability", "Nueva Habilidad secundaria", 5
	);
	const created = actor.calls.createEmbeddedDocuments[0].docs[0];
	assert.equal(created.system.id, "nueva_habilidad_secundaria", "created key");

	const written = await runPreUpdate(
		{ type: "Trait", name: "Nueva Habilidad secundaria", system: { type: "wod.types.talentsecondability", id: created.system.id } },
		{ name: "Tiro con arco" }
	);
	assert.equal(written.system.id, "tiro_con_arco", "the placeholder slug was frozen");
});

await test("the placeholder is recognised in EVERY shipped language", async () => {
	for (const id of AbilityHelper.PLACEHOLDER_SECONDABILITY_IDS) {
		const written = await runPreUpdate(
			{ type: "Trait", name: "whatever", system: { type: "wod.types.skillsecondability", id } },
			{ name: "Arte" }
		);
		assert.equal(written.system.id, "arte", `placeholder ${id} was treated as a real key`);
	}
});

await test("an Ability update is untouched by this change", async () => {
	const written = await runPreUpdate(
		{ type: "Ability", name: "Animal Ken", system: { id: "animalken", type: "wod.abilities.skill" } },
		{ system: { value: 2 } }
	);
	assert.equal(written.system.value, 2);
	assert.equal(written.system.id, undefined, "an Ability's key was rewritten");
});

await test("a non-secondability Trait update is untouched", async () => {
	for (const t of ["wod.types.othertraits", "wod.types.shapeform"]) {
		const written = await runPreUpdate(
			{ type: "Trait", name: "Whatever", system: { type: t } },
			{ system: { value: 1 } }
		);
		assert.equal(written.system.id, undefined, `type ${t} got a key on update`);
	}
});

console.log("\nJ. the two real update SHAPES, and the label-only rename");

await test("item-sheet FLAT payload gets a flat key, not a mixed system branch", async () => {
	// templates/sheets/trait-sheet.html submits through DocumentSheet, i.e.
	// FormDataExtended: {"name": ..., "system.label": ..., "system.value": ...}.
	// This is the ONE path where a rename really changes item.name.
	const written = await runPreUpdate(
		{ type: "Trait", name: "Nueva Habilidad secundaria", system: { type: "wod.types.skillsecondability", id: "nueva_habilidad_secundaria" } },
		{ "name": "Tiro con arco", "system.label": "Tiro con arco", "system.value": 3 }
	);
	assert.equal(written["system.id"], "tiro_con_arco", "flat key not written");
	assert.ok(
		(written.system === undefined) || (written.system.id === undefined),
		`the payload now carries BOTH spellings of system: ${JSON.stringify(written)}`
	);
});

await test("actor-sheet NESTED payload gets a nested key, not a flat one", async () => {
	// action-helpers.js sends foundry.utils.duplicate(item), fully nested.
	const written = await runPreUpdate(
		{ type: "Trait", name: "Arte", system: liveArteSystem() },
		{ name: "Arte", type: "Trait", system: { value: 4 } }
	);
	assert.equal(written.system.id, "arte", "nested key not written");
	assert.equal(
		written["system.id"], undefined,
		"a flat key was mixed into a nested payload"
	);
});

await test("a label-only rename (DialogAbility._save) settles the key", async () => {
	// dialog-edits.js:_save writes system.label and system.speciality ONLY -- it
	// never touches item.name -- and label is what the sheets display. Deriving
	// from name alone would silently keep the placeholder slug here.
	const written = await runPreUpdate(
		{ type: "Trait", name: "Nueva Habilidad secundaria", system: { type: "wod.types.talentsecondability", id: "nueva_habilidad_secundaria" } },
		{ name: "Nueva Habilidad secundaria", type: "Trait", system: { label: "Sueño lúcido", speciality: "" } }
	);
	assert.equal(written.system.id, "sueno_lucido");
});

await test("a label-only rename still cannot overwrite a REAL key", async () => {
	const written = await runPreUpdate(
		{ type: "Trait", name: "Hipertecnología", system: { type: "wod.types.skillsecondability", id: "hypertech" } },
		{ system: { label: "Otra cosa" } }
	);
	assert.equal(written.system.id, undefined);
});

await test("an i18n KEY as label is ignored in favour of the name", async () => {
	// Never emit "wod_abilities_art" as a key.
	const written = await runPreUpdate(
		{ type: "Trait", name: "Arte", system: { type: "wod.types.talentsecondability", label: "wod.abilities.art" } },
		{ system: { value: 3 } }
	);
	assert.equal(written.system.id, "arte");
});

await test("the live Arte's label and name agree, so both routes give 'arte'", async () => {
	const sys = liveArteSystem();
	assert.equal(sys.label, "Arte");
	assert.equal(AbilityHelper.GetSecondAbilityLabel({ name: "Arte", system: sys }), "Arte");
	assert.equal(AbilityHelper.GetSecondAbilityId("Arte"), "arte");
});

console.log("\nI. the derived keys agree with the consumer's slug rule");

await test("the app's rule is reproduced: accents dropped, snake_case, no '/'", async () => {
	// Measured against wod20-char/web/server/services/rules/secondaryAbilities.ts.
	const expected = {
		"Arte": "arte",
		"Tiro con arco": "tiro_con_arco",
		"Hipertecnología": "hipertecnologia",
		"Sueño lúcido": "sueno_lucido",
		"Farmacopea / Venenos": "farmacopea_venenos",
		"Criptografía": "criptografia",
		"Medios de comunicación": "medios_de_comunicacion",
		"Nueva Habilidad secundaria": "nueva_habilidad_secundaria"
	};
	for (const [name, want] of Object.entries(expected)) {
		assert.equal(AbilityHelper.GetSecondAbilityId(name), want, `slug of ${name}`);
	}
});

await test("no derived key ever contains an accent, space, slash or stray underscore", async () => {
	for (const name of [
		"Hipertecnología", "Sueño lúcido", "Farmacopea / Venenos", "  Arte  ",
		"Medios de comunicación", "Àéîõü", "A/B", "___x___", "!!!"
	]) {
		const id = AbilityHelper.GetSecondAbilityId(name);
		assert.ok(/^[a-z0-9_]*$/.test(id), `${name} -> ${JSON.stringify(id)} has illegal chars`);
		assert.ok(!id.startsWith("_") && !id.endsWith("_"), `${name} -> ${JSON.stringify(id)} untrimmed`);
	}
});

await test("the two rules are DIFFERENT and both are still reachable", async () => {
	// Guards against someone "unifying" them. Live Ability items carry the
	// concatenated spelling; secondaries must carry the app's snake_case one.
	assert.equal(AbilityHelper.GetAbilityId("Animal Ken"), "animalken");
	assert.equal(AbilityHelper.GetSecondAbilityId("Animal Ken"), "animal_ken");
	assert.notEqual(
		AbilityHelper.GetAbilityId("Tiro con arco"),
		AbilityHelper.GetSecondAbilityId("Tiro con arco")
	);
});

console.log("\nG. the derivation itself has exactly ONE definition");

await test("GetAbilityId matches the historical Ability expression", async () => {
	for (const n of ["Ride", "Animal Ken", "Tiro con arco", "ARTE", "", null, undefined]) {
		assert.equal(
			AbilityHelper.GetAbilityId(n),
			(n || "").toLowerCase().replace(/\s+/g, ""),
			`GetAbilityId(${JSON.stringify(n)})`
		);
	}
});

await test("IsSecondAbilityType accepts the three types and nothing else", async () => {
	for (const t of [
		"wod.types.talentsecondability",
		"wod.types.skillsecondability",
		"wod.types.knowledgesecondability"
	]) {
		assert.equal(AbilityHelper.IsSecondAbilityType(t), true, t);
	}
	for (const t of [
		"wod.types.othertraits", "wod.types.shapeform", "wod.abilities.talent",
		"", null, undefined, 0, {}
	]) {
		assert.equal(AbilityHelper.IsSecondAbilityType(t), false, JSON.stringify(t));
	}
});

/* ------------------------------------------------------------------ */

console.log("");
if (failures.length > 0) {
	console.log(`secondary-ability id harness FAILED: ${failures.length} failing, ${passed} passing`);
	process.exit(1);
}
console.log(`secondary-ability id harness OK: ${passed} checks passing`);
