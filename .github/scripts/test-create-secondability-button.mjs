#!/usr/bin/env node
/**
 * Offline behavioural harness for the v2 PC sheet's THREE SECONDARY-ABILITY
 * CREATE BUTTONS.
 *
 *     node .github/scripts/test-create-secondability-button.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * `openspec/changes/make-secondary-abilities-secondary-everywhere` Decision D adds
 * three buttons to `CreateHelper.CreateButtonsCore` (module/scripts/create-helpers.js),
 * mirroring the legacy trio at `mortal-actor-sheet.js:1030-1058`. Everything about
 * whether that is SAFE is behavioural:
 *
 *  - the item must come out a `Trait` with a `*secondability` `system.type`, because
 *    that pair is the only thing that makes the sheet paint it as a secondary
 *    (`stats_abilities.hbs`) and the only thing `isEnrichableAbility` accepts;
 *  - `system.isvisible` must be FLAT. `Ability` has a DataModel whose flags nest under
 *    `system.settings` -- which is why the four sibling buttons in the same dialog
 *    write `system.settings.isvisible` -- but `Trait` has no DataModel, so
 *    template.json's `settings` template merges FLAT into `system`. The eye toggle and
 *    the template both use the flat path. A `system.settings` object on a Trait is dead
 *    weight and re-creates the two-carriers-for-one-concept defect this whole change
 *    exists to remove;
 *  - `system.id` must be present (the wod20-char importer prefers a carried key over
 *    the name, so an absent key is a silent data loss on export), and it must still be
 *    OVERWRITABLE, because the button deliberately creates the item under the localised
 *    PLACEHOLDER name and the user renames it a moment later. A key that is not
 *    recognised as a placeholder freezes forever and then BEATS the real name at import
 *    time -- strictly worse than emitting nothing.
 *
 * None of that is visible to any other gate in this repo: `system-preflight.py`
 * validates the manifest and the reference graph, `js-syntax-check.sh` proves every
 * file parses, and there is no suite, no build and no linter (no package.json at all).
 * So, as with its two siblings, this harness RUNS the real code.
 *
 * WHAT IT EXECUTES, not inspects
 * ------------------------------
 * It calls the real `CreateHelper.CreateButtonsCore(actor)` and INVOKES each returned
 * `callback()`, against a fake actor that records which of `CreateAbility`'s two
 * creation branches was taken. The document that lands on the actor is then run
 * through the real `WoDItem._preCreate` and `WoDItem._preUpdate`, and merged over the
 * REAL `template.json` Trait defaults, so "the flat shape arrives" is an assertion
 * about the shipped schema rather than about an invented example.
 *
 * THE LANGUAGE SWEEP (section D) IS THE POINT OF THE FILE
 * ------------------------------------------------------
 * The button localises the placeholder at click time, so the key it stamps differs per
 * language. `IsFillableSecondAbilityId` has TWO mechanisms for recognising one:
 * re-localising `wod.labels.new.ability` at runtime, and the BAKED
 * `PLACEHOLDER_SECONDABILITY_IDS` list. Section D derives the placeholder from EVERY
 * `lang/*.json` this system ships and asserts each is fillable under BOTH.
 *
 * Testing only the runtime one proves nothing about the list -- measured: dropping the
 * Spanish entry from `PLACEHOLDER_SECONDABILITY_IDS` failed ZERO checks in this
 * harness's first draft, because a Spanish session re-derives its own placeholder and
 * masks the omission. The list is the only mechanism that works ACROSS sessions, which
 * is the case that matters: a key stamped by a Spanish player is inspected in whatever
 * language the asking session runs -- a GM opening that sheet in English, or the import
 * path -- and before i18n is ready at all. So the sweep asserts fillability in the
 * stamping language, in every OTHER shipped language, and with `game.i18n.localize`
 * throwing. Adding or retranslating `wod.labels.new.ability` without extending the
 * baked list now fails here instead of quietly freezing that language's users on a
 * meaningless key that then BEATS the real name at import time.
 *
 * WHY THE MODULE TREE IS COPIED: identical reason to both siblings -- no package.json
 * means node parses `.js` under the CommonJS goal and `import` explodes, so `module/`
 * is copied verbatim beside a `{"type":"module"}` marker and the code under test is a
 * byte-identical copy.
 *
 * KNOWN, DELIBERATELY NOT PINNED: `CreateAbility`'s `autoopen` block reads
 * `createdItem[0]._id`, which only exists on the `createEmbeddedDocuments()` branch --
 * `updateSource()` returns a diff object, so `autoopen` + the pre-creation branch would
 * throw. No caller combines them (the bulk pre-creation calls in create-helpers.js all
 * leave `autoopen` defaulted, and a sheet button cannot be pressed before the sheet
 * exists), and section G proves the button's own branch is the safe one. Pinning a
 * latent defect as expected behaviour would be worse than naming it here.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-secondbutton-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));

fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

/* ------------------------------------------------------------------ *
 * 2. The shipped data the harness measures against, read from the repo.
 * ------------------------------------------------------------------ */

const TEMPLATE = JSON.parse(fs.readFileSync(path.join(REPO, "template.json"), "utf8"));

/** Every language file this system ships, flattened to dotted i18n keys. */
function flatten(obj, prefix = "", out = {}) {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if ((v !== null) && (typeof v === "object") && !Array.isArray(v)) flatten(v, key, out);
		else out[key] = v;
	}
	return out;
}

const LANGS = {};
for (const f of fs.readdirSync(path.join(REPO, "lang")).filter(f => f.endsWith(".json")).sort()) {
	LANGS[path.basename(f, ".json")] = flatten(JSON.parse(fs.readFileSync(path.join(REPO, "lang", f), "utf8")));
}

/**
 * The `system` a Trait is actually born with, per the SHIPPED template.json:
 * Item.Trait's own fields plus each of its `templates` merged FLAT. This is the
 * mechanism that puts `isvisible` at `system.isvisible` and NOT at
 * `system.settings.isvisible`, so it is read from the file rather than restated.
 */
function traitTemplateSystem() {
	const trait = TEMPLATE.Item.Trait;
	const merged = {};
	for (const t of (trait.templates ?? [])) {
		Object.assign(merged, structuredClone(TEMPLATE.Item.templates[t]));
	}
	for (const [k, v] of Object.entries(trait)) {
		if (k !== "templates") merged[k] = structuredClone(v);
	}
	return merged;
}

/* ------------------------------------------------------------------ *
 * 3. Minimal Foundry globals, installed BEFORE the imports.
 *    `class X extends FormApplication` runs at module load, so these must exist.
 * ------------------------------------------------------------------ */

class Item {
	// The real base-class hooks. WoDItem calls all of these through `super`.
	async _preCreate() {}
	async _onCreate() {}
	async _preUpdate() {}
	async _onUpdate() {}
	static migrateData(source) { return source; }
}

globalThis.FormApplication = class FormApplication {
	static get defaultOptions() { return {}; }
};
globalThis.Application = class Application {};
globalThis.Item = Item;
globalThis.Actor = class Actor {};

const notifications = { warn: [], error: [], info: [] };
globalThis.ui = {
	notifications: {
		warn: (m) => notifications.warn.push(String(m)),
		error: (m) => notifications.error.push(String(m)),
		info: (m) => notifications.info.push(String(m))
	}
};

/** The language the fake `game.i18n` is currently answering in. Swapped per test. */
let activeLang = "en";

globalThis.game = {
	system: { version: "0.0.0-harness" },
	i18n: {
		// Faithful on the one point that matters here: a MISSING key comes back
		// unchanged. That is what makes `localize(localize(x))` a no-op, which is
		// exactly what CreateAbility does to the already-localised name it is handed.
		localize: (k) => (LANGS[activeLang]?.[k] ?? k),
		format: (k) => (LANGS[activeLang]?.[k] ?? k),
		translations: {}
	},
	actors: { get: () => undefined },
	scenes: [],
	settings: { get: () => undefined },
	packs: []
};

globalThis.CONFIG = {
	worldofdarkness: {
		attributeSettings: "20th",
		rollSettings: true,
		sheettype: { vampire: "Vampire", mortal: "Mortal", werewolf: "Werewolf", changingbreed: "Changing Breed" },
		splat: { changingbreed: "Changing Breed" }
	},
	Item: { dataModels: {} },
	Actor: { dataModels: {} }
};

function isPlain(v) {
	return (v !== null) && (typeof v === "object") && !Array.isArray(v);
}
function getProperty(object, key) {
	if (!key || !object) return undefined;
	if (key in object) return object[key];
	let target = object;
	for (const p of key.split(".")) {
		if (target === null || typeof target !== "object" || !(p in target)) return undefined;
		target = target[p];
	}
	return target;
}
globalThis.foundry = {
	utils: {
		duplicate: (o) => structuredClone(o),
		getProperty,
		hasProperty: (object, key) => getProperty(object, key) !== undefined,
		mergeObject(original, other = {}) {
			for (const [k, v] of Object.entries(other)) {
				if (isPlain(v) && isPlain(original[k])) foundry.utils.mergeObject(original[k], v);
				else original[k] = v;
			}
			return original;
		},
		setProperty(object, key, value) {
			const parts = key.split(".");
			let target = object;
			for (const p of parts.slice(0, -1)) {
				if (!isPlain(target[p])) target[p] = {};
				target = target[p];
			}
			target[parts.at(-1)] = value;
			return true;
		}
	},
	abstract: { TypeDataModel: class TypeDataModel {} },
	data: { fields: {} }
};

/* ------------------------------------------------------------------ *
 * 4. Import the REAL code out of the copied tree.
 * ------------------------------------------------------------------ */

const CreateHelper = (await import(
	path.join(sandbox, "module", "scripts", "create-helpers.js")
)).default;

const AbilityHelper = (await import(
	path.join(sandbox, "module", "scripts", "ability-helpers.js")
)).default;

const { WoDItem } = await import(
	path.join(sandbox, "module", "items", "data", "wod-item-base.js")
);

const { isEnrichableAbility } = await import(
	path.join(sandbox, "module", "scripts", "ability-enrichment.js")
);

/** The LEGACY sheets' reader for the same item. See section C. */
const ItemHelper = (await import(
	path.join(sandbox, "module", "scripts", "item-helpers.js")
)).default;

/* ------------------------------------------------------------------ *
 * 5. Test scaffolding
 * ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

async function test(name, fn) {
	notifications.warn.length = notifications.error.length = notifications.info.length = 0;
	activeLang = "en";
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

/**
 * A PC actor, only as much of one as the button path reads, that RECORDS which of
 * CreateAbility's two creation branches ran and what it was handed.
 *
 * `getEmbeddedDocument` returns a real `Item` instance so the `autoopen` branch is
 * genuinely exercised: `CreateAbility` gates the sheet render on `instanceof Item`, so
 * a plain object would make that half of the button silently untested.
 */
function fakeActor({ iscreated = true, defaultmaxvalue = 5, items = [] } = {}) {
	const calls = { createEmbeddedDocuments: [], updateSource: [], rendered: [] };
	const actor = {
		calls,
		name: "harness-pc",
		type: "PC",
		items,
		system: {
			settings: {
				iscreated,
				splat: "pc",
				variantsheet: "",
				abilities: { defaultmaxvalue }
			}
		},
		async createEmbeddedDocuments(type, docs) {
			calls.createEmbeddedDocuments.push({ type, docs: structuredClone(docs) });
			return docs.map((d, i) => {
				const created = Object.assign(Object.create(Item.prototype), d, { _id: `harness${i}` });
				items.push(created);
				return created;
			});
		},
		updateSource(payload) {
			calls.updateSource.push(structuredClone(payload));
			return payload;
		},
		async getEmbeddedDocument(_type, id) {
			const found = items.find(i => i._id === id);
			if (!found) return undefined;
			found.sheet = { render: (v) => calls.rendered.push({ id, v }) };
			return found;
		}
	};
	return actor;
}

/** Press one of the dialog's buttons by key, and hand back what happened. */
async function press(buttonKey, actorOptions = {}) {
	const actor = fakeActor(actorOptions);
	const buttons = await CreateHelper.CreateButtonsCore(actor);
	assert.ok(buttons[buttonKey], `the core create dialog has no "${buttonKey}" button at all`);
	await buttons[buttonKey].callback();
	return { actor, buttons, button: buttons[buttonKey] };
}

/** The single document the pressed button asked to create. */
function createdDoc(actor) {
	assert.equal(actor.calls.createEmbeddedDocuments.length, 1,
		`expected exactly one createEmbeddedDocuments call, got ${actor.calls.createEmbeddedDocuments.length}`);
	const { type, docs } = actor.calls.createEmbeddedDocuments[0];
	assert.equal(type, "Item");
	assert.equal(docs.length, 1, `expected one document, got ${docs.length}`);
	return docs[0];
}

/** Run the real WoDItem#_preCreate and return everything it asked to change. */
async function runPreCreate(data, options = {}) {
	const updates = {};
	const item = Object.create(WoDItem.prototype);
	item.updateSource = (u) => Object.assign(updates, u);
	await item._preCreate(structuredClone(data), options, {});
	return updates;
}

/** Run the real WoDItem#_preUpdate against a live item and return the mutated diff. */
async function runPreUpdate(itemLike, updateData) {
	const item = Object.create(WoDItem.prototype);
	Object.assign(item, itemLike);
	const diff = structuredClone(updateData);
	await item._preUpdate(diff, {}, {});
	return diff;
}

/**
 * The three buttons under test, paired with the `system.type` each must produce and
 * the i18n key its label must come from. Derived from the ONE naming rule
 * (`wod.types.<x>secondability`), so a fourth category would be added in one place.
 */
const SECONDARY_BUTTONS = ["talent", "skill", "knowledge"].map(x => ({
	key: `${x}secondary`,
	systemType: `wod.types.${x}secondability`,
	labelKey: `wod.types.${x}secondability`
}));

/** The four buttons the dialog already had, which must not be disturbed. */
const PRE_EXISTING_BUTTONS = ["talent", "skill", "knowledge", "advantage"];

/* ------------------------------------------------------------------ *
 * A. The dialog exposes the three buttons, and still the four it had
 * ------------------------------------------------------------------ */

console.log("\nA. CreateButtonsCore exposes three new buttons and disturbs none");

await test("all three secondary buttons exist with a callback", async () => {
	const buttons = await CreateHelper.CreateButtonsCore(fakeActor());
	for (const b of SECONDARY_BUTTONS) {
		assert.ok(buttons[b.key], `missing button "${b.key}"`);
		assert.equal(typeof buttons[b.key].callback, "function", `${b.key} has no callback`);
	}
});

await test("the four pre-existing buttons are untouched and still first", async () => {
	const buttons = await CreateHelper.CreateButtonsCore(fakeActor());
	const keys = Object.keys(buttons);
	for (const k of PRE_EXISTING_BUTTONS) assert.ok(buttons[k], `lost the "${k}" button`);
	// Key order IS button order in a Foundry Dialog. The new trio is appended, so no
	// existing button moves under a user who has learned where it is.
	assert.deepEqual(keys.slice(0, PRE_EXISTING_BUTTONS.length), PRE_EXISTING_BUTTONS,
		`the pre-existing buttons moved or were reordered: ${JSON.stringify(keys)}`);
	assert.deepEqual(keys.slice(PRE_EXISTING_BUTTONS.length), SECONDARY_BUTTONS.map(b => b.key));
});

await test("no new button collides with a pre-existing key", () => {
	for (const b of SECONDARY_BUTTONS) {
		assert.ok(!PRE_EXISTING_BUTTONS.includes(b.key),
			`"${b.key}" would silently REPLACE the existing primary button of that name`);
	}
});

await test("each label is the localised wod.types.*secondability string, in en and es", async () => {
	for (const lang of ["en", "es"]) {
		activeLang = lang;
		const buttons = await CreateHelper.CreateButtonsCore(fakeActor());
		for (const b of SECONDARY_BUTTONS) {
			const expected = LANGS[lang][b.labelKey];
			assert.ok(expected, `premise: lang/${lang}.json has no ${b.labelKey}`);
			assert.equal(buttons[b.key].label, expected,
				`${b.key} in ${lang}: label is not the localised ${b.labelKey}`);
			assert.ok(!buttons[b.key].label.startsWith("wod."),
				`${b.key} in ${lang}: the raw i18n key leaked onto the button`);
		}
	}
});

await test("every shipped language can label all three buttons", async () => {
	// A missing key would render the dotted path on the button. Cheap, and it is the
	// one thing task 5.1c asked to confirm.
	for (const lang of Object.keys(LANGS)) {
		for (const b of SECONDARY_BUTTONS) {
			assert.ok(LANGS[lang][b.labelKey], `lang/${lang}.json is missing ${b.labelKey}`);
		}
		assert.ok(LANGS[lang]["wod.labels.new.ability"], `lang/${lang}.json is missing wod.labels.new.ability`);
	}
});

/* ------------------------------------------------------------------ *
 * B. Pressing a button: the branch, and the document's type pair
 * ------------------------------------------------------------------ */

console.log("\nB. pressing a button creates a Trait with the right *secondability type");

for (const b of SECONDARY_BUTTONS) {
	await test(`${b.key} creates a Trait with system.type ${b.systemType}`, async () => {
		const { actor } = await press(b.key);
		const doc = createdDoc(actor);
		assert.equal(doc.type, "Trait",
			`the button created a "${doc.type}" -- an Ability is NOT a secondary ability`);
		assert.equal(doc.system.type, b.systemType);
		assert.ok(AbilityHelper.IsSecondAbilityType(doc.system.type),
			"the system.type the button produced is not recognised as a secondary at all");
	});
}

await test("the button takes the createEmbeddedDocuments branch, never updateSource", async () => {
	// A sheet button cannot be pressed before the actor exists, so this is the only
	// branch it can reach -- and it is the branch that runs WoDItem._preCreate.
	const { actor } = await press("talentsecondary", { iscreated: true });
	assert.equal(actor.calls.createEmbeddedDocuments.length, 1);
	assert.equal(actor.calls.updateSource.length, 0,
		"the pre-creation branch ran for a button press -- _preCreate would be skipped");
});

await test("max is the actor's defaultmaxvalue, parsed to a number", async () => {
	const { actor } = await press("skillsecondary", { defaultmaxvalue: "7" });
	const doc = createdDoc(actor);
	assert.equal(doc.system.max, 7, "a string world setting reached system.max unparsed");
	assert.equal(typeof doc.system.max, "number");
});

await test("neither weapon flag is set (a secondary is not a weapon)", async () => {
	// dialog-weapon/dialog-weaponv2 filter on `type === "Ability"`, so a Trait flagged
	// ismeleeweapon can never be PICKED on a PC. The button must not set them.
	const { actor } = await press("knowledgesecondary");
	const doc = createdDoc(actor);
	assert.equal(doc.system.ismeleeweapon, false);
	assert.equal(doc.system.israngedeweapon, false);
});

await test("the item sheet is opened so the user can rename it at once", async () => {
	// autoopen is the mechanism that makes the placeholder name harmless. Without it
	// the item keeps the placeholder, and _preUpdate never gets a real name to settle.
	const { actor } = await press("talentsecondary");
	assert.equal(actor.calls.rendered.length, 1,
		"the created item's sheet was not rendered -- autoopen (7th argument) is not set");
});

await test("nothing is created for an unrelated button (no cross-wiring)", async () => {
	const actor = fakeActor();
	const buttons = await CreateHelper.CreateButtonsCore(actor);
	await buttons.advantage.callback();
	const { docs } = actor.calls.createEmbeddedDocuments[0];
	assert.equal(docs[0].type, "Advantage", "the advantage button now creates something else");
});

/* ------------------------------------------------------------------ *
 * C. The FLAT shape -- no invented system.settings object
 * ------------------------------------------------------------------ */

console.log("\nC. isvisible arrives FLAT; no system.settings object is invented");

await test("premise: template.json really puts isvisible flat on a Trait", () => {
	// Read from the shipped file, so this fails if the schema itself moves rather than
	// asserting a remembered fact about it.
	const born = traitTemplateSystem();
	assert.equal(born.isvisible, true, "Item.Trait no longer inherits a flat isvisible: true");
	assert.equal(born.isremovable, true);
	assert.equal(born.settings, undefined, "Item.Trait grew a nested `settings` object");
	// And the contrast that makes the mistake possible: Ability has no template at all
	// (it is a DataModel), which is why its buttons write system.settings.*.
	assert.deepEqual(TEMPLATE.Item.Ability, {}, "Item.Ability grew a template.json body");
});

for (const b of SECONDARY_BUTTONS) {
	await test(`${b.key} writes NO system.settings object`, async () => {
		const { actor } = await press(b.key);
		const doc = createdDoc(actor);
		assert.equal(doc.system.settings, undefined,
			"the button wrote a nested system.settings on a Trait -- two carriers for one flag");
		assert.ok(!Object.keys(doc.system).some(k => k.startsWith("settings.")),
			"a flat 'settings.*' key was written instead");
	});
}

await test("merged over template.json, the born item is visible and removable, flat", async () => {
	const { actor } = await press("talentsecondary");
	const doc = createdDoc(actor);
	const born = foundry.utils.mergeObject(traitTemplateSystem(), doc.system);
	assert.equal(born.isvisible, true, "the created secondary would be born hidden");
	assert.equal(born.isremovable, true, "the created secondary could not be deleted from the sheet");
	assert.equal(born.settings, undefined,
		"a system.settings object survived onto the born document");
});

/**
 * The item as it EXISTS once Foundry has applied template.json's Trait defaults, which
 * is the shape both sheet families actually read. Built by merging the button's
 * document over the shipped template rather than by restating the result.
 */
async function bornItem(buttonKey) {
	const { actor } = await press(buttonKey);
	const doc = createdDoc(actor);
	return { _id: "harness0", type: doc.type, name: doc.name, system: foundry.utils.mergeObject(traitTemplateSystem(), doc.system) };
}

/** Just enough actor for the real ItemHelper._sortTraits to write its buckets. */
function listdataActor() {
	const buckets = ["ability_talents", "ability_skills", "ability_knowledges",
		"secondary_talents", "secondary_skills", "secondary_knowledges",
		"meleeAbilities", "rangedAbilities", "powerAbilities", "traits"];
	const listdata = {};
	for (const b of buckets) listdata[b] = [];
	return { system: { listdata } };
}

await test("the LEGACY sheets' own reader shows the born item (real _sortTraits)", async () => {
	// The cross-family half, and the reason the flat shape is not a stylistic preference:
	// `ItemHelper._sortTraits` reads `item.system.isvisible` with NO fallback, so an item
	// whose visibility lived under `system.settings` would be missing from the legacy
	// sheets' visible list entirely. Executed against the real helper.
	const item = await bornItem("talentsecondary");
	const actor = listdataActor();
	await ItemHelper._sortTraits(item, actor);
	assert.equal(actor.system.listdata.ability_talents.length, 1,
		"the button's secondary does not appear in the legacy sheets' VISIBLE talent list");
	assert.equal(actor.system.listdata.secondary_talents.length, 1);
	assert.equal(actor.system.listdata.ability_talents[0].isvisible, true);
	assert.equal(actor.system.listdata.meleeAbilities.length, 0, "it was filed as a melee weapon");
});

await test("hiding it on the FLAT path hides it for the legacy sheets too", async () => {
	// Both views agree, which is the whole point of one carrier.
	const item = await bornItem("skillsecondary");
	item.system.isvisible = false;
	const actor = listdataActor();
	await ItemHelper._sortTraits(item, actor);
	assert.equal(actor.system.listdata.ability_skills.length, 0, "the flat hide did not reach the legacy sheets");
	assert.equal(actor.system.listdata.secondary_skills.length, 1,
		"premise: the settings tab still lists it, which is how it gets switched back on");
});

await test("a NESTED settings.isvisible would NOT hide it -- the divergence avoided", async () => {
	// The concrete consequence of the copy-paste mistake, executed rather than asserted
	// in prose. `pc-actor-sheet.js:1596` picks the eye toggle's WRITE path from whether
	// `system.settings.isvisible` is defined, so an item carrying that object gets the
	// toggle written NESTED -- while `_sortTraits` goes on reading the FLAT copy. The v2
	// sheet would hide the row and the legacy sheets would keep showing it. It is
	// unreachable only because the button writes no settings object at all.
	const item = await bornItem("knowledgesecondary");
	assert.equal(item.system.settings, undefined, "premise: the button leaves no settings object");
	item.system.settings = { isvisible: false };   // what the toggle would have written
	const actor = listdataActor();
	await ItemHelper._sortTraits(item, actor);
	assert.equal(actor.system.listdata.ability_knowledges.length, 1,
		"premise of the divergence: _sortTraits reads only the flat copy");
	assert.equal(item.system.isvisible, true,
		"the two carriers disagree -- exactly what a system.settings object on a Trait causes");
});

/* ------------------------------------------------------------------ *
 * D. The key: sealed on creation, and still overwritable
 * ------------------------------------------------------------------ */

console.log("\nD. system.id is sealed by the button AND stays overwritable");

for (const b of SECONDARY_BUTTONS) {
	await test(`${b.key} stamps a non-empty system.id`, async () => {
		const { actor } = await press(b.key);
		const doc = createdDoc(actor);
		assert.ok(doc.system.id, "the button created a secondary with NO key -- silent data loss on export");
		assert.equal(doc.system.id, AbilityHelper.GetSecondAbilityId(LANGS.en["wod.labels.new.ability"]),
			"the key is not the shared derivation of the name the item was created with");
	});
}

await test("the stamped key is the placeholder's, and is FILLABLE (en)", async () => {
	const { actor } = await press("talentsecondary");
	const doc = createdDoc(actor);
	assert.equal(AbilityHelper.IsFillableSecondAbilityId(doc.system.id), true,
		`"${doc.system.id}" is not recognised as a placeholder key -- the rename could never settle it`);
});

/**
 * The key each shipped language's button stamps: press once per `lang/*.json`, with
 * `game.i18n` answering in that language, and collect what landed.
 *
 * Derived from lang/, never enumerated here, so a new translation joins the sweep the
 * day it lands.
 */
async function placeholderKeyPerLanguage() {
	const seen = [];
	for (const lang of Object.keys(LANGS)) {
		activeLang = lang;
		const { actor } = await press("knowledgesecondary");
		const doc = createdDoc(actor);
		assert.ok(doc.system.id, `lang ${lang}: no key stamped at all`);
		seen.push([lang, doc.system.id]);
	}
	activeLang = "en";
	assert.ok(seen.length >= 5, `expected the shipped language set, saw only ${JSON.stringify(seen)}`);
	return seen;
}

await test("EVERY shipped language's placeholder key is fillable in its own session", async () => {
	// The button localises at click time, so each language stamps a different key.
	// IsFillableSecondAbilityId has TWO mechanisms; this exercises the RUNTIME one
	// (it re-localises `wod.labels.new.ability` in the session's own language).
	for (const [lang, id] of await placeholderKeyPerLanguage()) {
		activeLang = lang;
		assert.equal(AbilityHelper.IsFillableSecondAbilityId(id), true,
			`lang ${lang}: placeholder key "${id}" is not fillable even in its own language`);
	}
});

await test("...and ACROSS languages, which is the only thing the baked list can do", async () => {
	// The load-bearing half, and the reason PLACEHOLDER_SECONDABILITY_IDS exists at all.
	// A key stamped by a Spanish player is inspected in whatever language the session
	// asking the question happens to run -- a GM opening that sheet in English, or the
	// import path. The runtime re-localisation cannot help there, so the BAKED list is
	// the only mechanism, and a translation missing from it freezes that language's
	// users on a meaningless key that then BEATS the real name at import time.
	const seen = await placeholderKeyPerLanguage();
	const langs = seen.map(([l]) => l);
	for (const [lang, id] of seen) {
		for (const other of langs) {
			if (other === lang) continue;
			activeLang = other;
			assert.equal(AbilityHelper.IsFillableSecondAbilityId(id), true,
				`a key stamped in ${lang} ("${id}") is NOT fillable when inspected in a ${other} session. ` +
				`Add it to AbilityHelper.PLACEHOLDER_SECONDABILITY_IDS.`);
		}
	}
});

await test("...and with i18n unavailable, the baked list still answers", async () => {
	// The `catch` in IsFillableSecondAbilityId: migrations and the item layer can run
	// before i18n is ready. Same claim, with the runtime mechanism removed entirely.
	const seen = await placeholderKeyPerLanguage();
	const realI18n = game.i18n;
	game.i18n = { localize: () => { throw new Error("i18n not ready (harness)"); }, format: (k) => k, translations: {} };
	try {
		for (const [lang, id] of seen) {
			assert.equal(AbilityHelper.IsFillableSecondAbilityId(id), true,
				`with no i18n, the ${lang} placeholder key "${id}" is not recognised -- it is missing from the baked list`);
		}
	}
	finally {
		game.i18n = realI18n;
	}
});

await test("a REAL key is never fillable, so a renamed secondary is safe", () => {
	// The other half: the monotone rule must refuse to move a settled key.
	for (const id of ["tiro_con_arco", "hipertecnologia", "arte", "do"]) {
		assert.equal(AbilityHelper.IsFillableSecondAbilityId(id), false, `${id} was declared overwritable`);
	}
});

await test("_preCreate does not clobber the key the button already stamped", async () => {
	const { actor } = await press("talentsecondary");
	const doc = createdDoc(actor);
	const updates = await runPreCreate(doc);
	assert.equal(updates["system.id"], undefined,
		"_preCreate re-derived a key the button had already sealed");
	assert.equal(updates["system.iscreated"], true, "premise: _preCreate still stamps iscreated");
	assert.ok(!Object.keys(updates).some(k => k.startsWith("system.settings")),
		"_preCreate added a system.settings.* key to a Trait");
});

await test("even with the key removed, _preCreate seals the SAME one", async () => {
	// Belt and braces: the two derivations must agree, or the item's key would depend
	// on which layer got there first.
	const { actor } = await press("skillsecondary");
	const doc = createdDoc(actor);
	const expected = doc.system.id;
	delete doc.system.id;
	const updates = await runPreCreate(doc);
	assert.equal(updates["system.id"], expected,
		"the button and _preCreate derive different keys for the same document");
});

/* ------------------------------------------------------------------ *
 * E. The rename settles the real key (the placeholder is not frozen)
 * ------------------------------------------------------------------ */

console.log("\nE. the rename that follows the button settles the real key");

await test("renaming through the item sheet (flat payload) replaces the placeholder key", async () => {
	const { actor } = await press("talentsecondary");
	const doc = createdDoc(actor);
	const diff = await runPreUpdate(
		{ type: doc.type, name: doc.name, system: structuredClone(doc.system) },
		{ name: "Tiro con Arco", "system.label": "Tiro con Arco" }
	);
	assert.equal(diff["system.id"], "tiro_con_arco",
		"the placeholder key was NOT replaced -- it is frozen, and it beats the name on import");
	assert.equal(diff.system?.id, undefined, "a nested duplicate of the key was written into a flat payload");
});

await test("renaming through the actor sheet (nested payload) also settles it", async () => {
	const { actor } = await press("knowledgesecondary");
	const doc = createdDoc(actor);
	const diff = await runPreUpdate(
		{ type: doc.type, name: doc.name, system: structuredClone(doc.system) },
		{ system: { label: "Hipertecnología" } }
	);
	assert.equal(diff.system.id, "hipertecnologia", "the nested rename path did not settle the key");
});

await test("a second rename does NOT move the settled key", async () => {
	const diff = await runPreUpdate(
		{ type: "Trait", name: "Tiro con Arco", system: { type: "wod.types.talentsecondability", id: "tiro_con_arco" } },
		{ system: { label: "Arquería" } }
	);
	assert.equal(diff.system.id, undefined, "a settled key was rewritten -- this orphans the app-side data");
});

/* ------------------------------------------------------------------ *
 * F. The v7.5.37 seam: what the button makes is enrichable
 * ------------------------------------------------------------------ */

console.log("\nF. what the button creates can resolve a description (v7.5.37 seam)");

for (const b of SECONDARY_BUTTONS) {
	await test(`${b.key}'s document satisfies isEnrichableAbility`, async () => {
		const { actor } = await press(b.key);
		const doc = createdDoc(actor);
		assert.equal(isEnrichableAbility(doc), true,
			"the button's document is not enrichable -- it would render a blank description window");
	});
}

await test("a rename to a shipped secondary keeps it enrichable", async () => {
	const { actor } = await press("skillsecondary");
	const doc = createdDoc(actor);
	doc.name = "Equitación";
	doc.system.label = "Equitación";
	doc.system.id = "equitacion";
	assert.equal(isEnrichableAbility(doc), true);
});

/* ------------------------------------------------------------------ *
 * G. The two branches of CreateAbility agree
 * ------------------------------------------------------------------ */

console.log("\nG. both of CreateAbility's branches produce the same document");

await test("the pre-creation branch produces the identical document", async () => {
	// Not reachable from the button (see the header), but CreateAbility is SHARED with
	// the bulk splat setup that runs while the actor is still being created. If the two
	// branches disagreed, a secondary's shape would depend on how it was born.
	const pressed = fakeActor({ iscreated: true });
	const buttons = await CreateHelper.CreateButtonsCore(pressed);
	await buttons.talentsecondary.callback();
	const fromButton = createdDoc(pressed);

	const preCreation = fakeActor({ iscreated: false });
	await AbilityHelper.CreateAbility(
		preCreation,
		"wod.types.talentsecondability",
		game.i18n.localize("wod.labels.new.ability"),
		parseInt(preCreation.system.settings.abilities.defaultmaxvalue)
	);
	assert.equal(preCreation.calls.updateSource.length, 1, "the pre-creation branch did not run");
	assert.equal(preCreation.calls.createEmbeddedDocuments.length, 0);
	const fromCreation = preCreation.calls.updateSource[0].items[0];

	assert.deepEqual(fromCreation, fromButton,
		"the two creation branches produce different documents for the same secondary");
	assert.ok(fromCreation.system.id, "the pre-creation branch loses the key (it skips _preCreate)");
	assert.equal(fromCreation.system.settings, undefined);
});

/* ------------------------------------------------------------------ *
 * H. Pressing twice
 * ------------------------------------------------------------------ */

console.log("\nH. pressing the same button twice warns instead of duplicating");

await test("a second press before renaming warns and creates nothing", async () => {
	const actor = fakeActor();
	const buttons = await CreateHelper.CreateButtonsCore(actor);
	await buttons.talentsecondary.callback();
	await buttons.talentsecondary.callback();
	assert.equal(actor.calls.createEmbeddedDocuments.length, 1,
		"a duplicate secondary with the same name AND the same derived key was created");
	assert.ok(notifications.warn.length >= 1, "the duplicate was refused silently");
});

await test("a different category is NOT treated as a duplicate", async () => {
	// CheckAbilityExists keys on (type, system.type, name), so the three buttons must
	// each be pressable once even though they share the placeholder name.
	const actor = fakeActor();
	const buttons = await CreateHelper.CreateButtonsCore(actor);
	for (const b of SECONDARY_BUTTONS) await buttons[b.key].callback();
	assert.equal(actor.calls.createEmbeddedDocuments.length, 3,
		"pressing talent then skill was mistaken for a duplicate");
	const types = actor.calls.createEmbeddedDocuments.map(c => c.docs[0].system.type);
	assert.deepEqual(types, SECONDARY_BUTTONS.map(b => b.systemType));
});

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

console.log("");
if (failures.length) {
	console.error(`secondary-ability create-button harness FAILED: ${failures.length} of ${passed + failures.length} checks`);
	for (const f of failures) console.error(`  - ${f.name}`);
	process.exit(1);
}
console.log(`secondary-ability create-button harness OK: ${passed} checks passing`);
