#!/usr/bin/env node
/**
 * Offline behavioural harness for WHICH DOCUMENT SHAPES the ability-description
 * enrichment path accepts.
 *
 *     node .github/scripts/test-ability-enrichment-types.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * `openspec/changes/make-secondary-abilities-secondary-everywhere` Decision B1
 * retypes the 25 documents of `wod20-compendium-es`'s `shared-secondary-ability`
 * pack from `type: "Ability"` to `type: "Trait"` with
 * `system.type: wod.types.{talent,skill,knowledge}secondability`. Its design.md
 * names the resulting bill precisely: `ability-enrichment.js` filtered compendium
 * documents on `d.type === "Ability"`, so every retyped document would fall out of
 * `findAbilityCompendiumMatch` and therefore out of `enrichAbilityItemData`,
 * `maybeEnrichAbilityOnRename`, `migrations.js:enrichActorAbilities` and
 * `drop-helpers.js`'s splat install. The symptom is an EMPTY DESCRIPTION WINDOW
 * plus a console warning -- which the project's own memory note records as a
 * generator of false alarms ("an English name / a blank description reads as a
 * missing translation, not as an unresolved id").
 *
 * A blank description is invisible to every other gate this repo has:
 * `system-preflight.py` validates the manifest and the reference graph,
 * `js-syntax-check.sh` proves every file parses, and there is no suite, no build
 * and no linter (no package.json at all). "Does this document still resolve to its
 * description" is a behavioural question about a filter predicate, so it needs code
 * that RUNS -- the same argument, and the same mechanism, as its sibling
 * `test-secondability-id.mjs`.
 *
 * WHAT IT PINS, in both directions
 * --------------------------------
 *  - NARROWING: reverting the filter to `d.type === "Ability"` fails section B.
 *  - WIDENING: dropping the `secondability` qualifier and accepting any `Trait`
 *    fails section D. That is not hypothetical - measured over
 *    `wod20-compendium-es/src`, the packs ship 104 `Trait` documents that are NOT
 *    abilities (87 `wod.types.maneuver` in `shared-maneuvers`, 17
 *    `wod.types.resonance` in `mage-resonance`), and `candidateAbilityPacks`
 *    searches `mage-resonance` for every mage because it selects packs by LINE
 *    PREFIX, not by content. An unqualified `Trait` would put resonance names into
 *    name-matching against mage abilities: the shape of the V2 cross-contamination
 *    disaster `compendium-description.js` documents.
 *  - DEPLOY ORDER: sections B6-B9 run all four combinations of (item shape,
 *    document shape). This fork and the content packs deploy independently and in
 *    either order, so "works only after the packs are retyped" would be a latent
 *    outage; all four must resolve to the same document.
 *
 * WHY THE MODULE TREE IS COPIED: identical reason to `test-secondability-id.mjs` --
 * no package.json means node parses `.js` under the CommonJS goal and `import`
 * explodes, so `module/` is copied verbatim beside a `{"type":"module"}` marker and
 * the code under test is a byte-identical copy.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-enrich-types-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));

fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

/* ------------------------------------------------------------------ *
 * 2. Minimal Foundry globals, installed BEFORE the imports.
 * ------------------------------------------------------------------ */

globalThis.FormApplication = class FormApplication {
	static get defaultOptions() { return {}; }
};
globalThis.Application = class Application {};
globalThis.Item = class Item {};
globalThis.Actor = class Actor {};
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };

/** Everything the code under test logs, so "warned and degraded" is assertable. */
const logged = { warn: [], error: [], log: [] };
const realConsole = { warn: console.warn, error: console.error, log: console.log };
function captureConsole() {
	console.warn = (...a) => logged.warn.push(a.map(String).join(" "));
	console.error = (...a) => logged.error.push(a.map(String).join(" "));
	console.log = (...a) => logged.log.push(a.map(String).join(" "));
}
function releaseConsole() {
	console.warn = realConsole.warn;
	console.error = realConsole.error;
	console.log = realConsole.log;
}

globalThis.game = {
	system: { version: "0.0.0-harness" },
	i18n: { localize: (k) => k, format: (k) => k, translations: {} },
	actors: [],
	scenes: [],
	settings: { get: () => undefined },
	// Replaced per test. `candidateAbilityPacks` does `for (const pack of game.packs)`,
	// so any iterable will do.
	packs: []
};
globalThis.CONFIG = {
	worldofdarkness: { attributeSettings: "20th", rollSettings: true },
	Item: { dataModels: {} },
	Actor: { dataModels: {} }
};

/**
 * `foundry.utils`, faithful to the real thing on the three points the code relies on:
 *  - `getProperty`/`hasProperty` try the LITERAL dotted key first (`if (key in object)`)
 *    before walking, which is exactly why a flat sheet submit `{"system.id": ...}` is
 *    seen by `maybeEnrichAbilityOnRename`;
 *  - `setProperty` creates the intermediate objects;
 *  - `mergeObject` MUTATES its first argument and recurses into plain objects, which is
 *    what `enrichAbilityItemData` depends on (it ignores the return value).
 */
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
function isPlain(v) {
	return (v !== null) && (typeof v === "object") && !Array.isArray(v);
}
globalThis.foundry = {
	utils: {
		duplicate: (o) => structuredClone(o),
		getProperty,
		hasProperty: (object, key) => getProperty(object, key) !== undefined,
		setProperty(object, key, value) {
			const parts = key.split(".");
			let target = object;
			for (const p of parts.slice(0, -1)) {
				if (!isPlain(target[p])) target[p] = {};
				target = target[p];
			}
			target[parts.at(-1)] = value;
			return true;
		},
		mergeObject(original, other = {}) {
			for (const [k, v] of Object.entries(other)) {
				if (isPlain(v) && isPlain(original[k])) foundry.utils.mergeObject(original[k], v);
				else original[k] = v;
			}
			return original;
		}
	},
	abstract: { TypeDataModel: class TypeDataModel {} },
	data: { fields: {} }
};

/* ------------------------------------------------------------------ *
 * 3. Import the REAL code out of the copied tree.
 * ------------------------------------------------------------------ */

const enrichment = await import(
	path.join(sandbox, "module", "scripts", "ability-enrichment.js")
);
const {
	isEnrichableAbility,
	findAbilityCompendiumMatch,
	enrichAbilityItemData,
	maybeEnrichAbilityOnRename,
	compendiumProvenanceOf
} = enrichment;

const { enrichActorAbilities } = await import(
	path.join(sandbox, "module", "migrations.js")
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
	logged.warn.length = logged.error.length = logged.log.length = 0;
	captureConsole();
	try {
		await fn();
		releaseConsole();
		passed++;
		console.log(`  ok   ${name}`);
	}
	catch (err) {
		releaseConsole();
		failures.push({ name, err });
		console.log(`  FAIL ${name}`);
		console.log(`         ${String(err.message).split("\n").join("\n         ")}`);
	}
}

const MODULE_ID = "wod20-compendium-es";

/**
 * A compendium pack of `docs`.
 *
 * THE COLLECTION NAME IS THE MEMO KEY. `abilityDocsByPack` in the module under test
 * is session-scoped and never invalidated (deliberately - see its header), so two
 * packs sharing a collection name across two tests would silently serve the FIRST
 * test's documents to the second. Every test therefore uses its own game line, so
 * every pack name is unique - except the one test that must use the literal
 * `shared-secondary-ability`, which appears exactly once.
 */
function fakePack(packName, docs, { throws = false } = {}) {
	return {
		documentName: "Item",
		collection: `${MODULE_ID}.${packName}`,
		calls: 0,
		async getDocuments() {
			this.calls++;
			if (throws) throw new Error("pack unreadable (harness)");
			return docs;
		}
	};
}

/** A compendium document, in whichever of the two shapes is under test. */
function doc(name, id, { type = "Ability", systemType = "wod.abilities.talent", description = `desc of ${name}`, line = "shared", sourceType = "secondary-ability" } = {}) {
	return {
		name,
		type,
		system: { id, type: systemType, description },
		flags: { [MODULE_ID]: { id, line, source_type: sourceType } }
	};
}

/** The B1 shape: a retyped secondary-ability document. */
function retypedDoc(name, id, systemType = "wod.types.talentsecondability", extra = {}) {
	return doc(name, id, { type: "Trait", systemType, ...extra });
}

/** An actor, only as much of one as the enrichment path reads. */
function fakeActor(splat, items = []) {
	const flags = {};
	return {
		name: `harness-${splat}`,
		type: "PC",
		system: { settings: { splat } },
		items,
		flags,
		async setFlag(scope, key, value) {
			flags[scope] ??= {};
			flags[scope][key] = value;
			return this;
		}
	};
}

/** An embedded item that records what `update()` was asked to write. */
function fakeItem(type, name, system, actor = null) {
	const item = {
		type, name,
		system: { description: "", ...system },
		flags: {},
		actor,
		updates: [],
		async update(payload) { this.updates.push(payload); return this; }
	};
	if (actor) actor.items.push(item);
	return item;
}

/* The REAL data both sides carry, so the key bridge is tested against reality and
 * not against an invented example.
 *
 * Left: the `system.id` of a shipped `shared-secondary-ability` document, read from
 * `wod20-compendium-es/src/shared-secondary-ability/*.json` -- webgen entity ids,
 * HYPHENATED. Right: what `AbilityHelper.GetSecondAbilityId` derives on the actor
 * from the same document's Spanish name -- UNDERSCORED, and a hard contract with
 * `wod20-char`'s importer. 10 of the 25 differ; the other 15 have no separator at
 * all and are listed too, because "the ones that already worked keep working" is
 * half the claim. */
const SHIPPED_SECONDARIES = [
	["armas-de-energia", "Armas de Energía"],
	["tiro-con-arco", "Tiro con Arco"],
	["sueno-lucido", "Sueño Lúcido"],
	["sistemas-de-creencias", "Sistemas de Creencias"],
	["farmacopea-venenos", "Farmacopea / Venenos"],
	["medios-de-comunicacion", "Medios de Comunicación"],
	["saber-informacion-de-sr", "Saber / Información de SR"],
	["conocimiento-regional", "Conocimiento Regional"],
	["afinidad-animal", "Afinidad Animal"],
	["alto-ritual", "Alto Ritual"],
	["vuelo", "Vuelo"], ["do", "Do"], ["alternar", "Alternar"],
	["biotecnologia", "Biotecnología"], ["criptografia", "Criptografía"],
	["finanzas", "Finanzas"], ["hipertecnologia", "Hipertecnología"],
	["descaro", "Descaro"], ["jetpack", "Jetpack"], ["tortura", "Tortura"],
	["seduccion", "Seducción"], ["acrobacias", "Acrobacias"],
	["buscar", "Buscar"], ["equitacion", "Equitación"],
	["demoliciones", "Demoliciones"]
];

/** The 183 primary ability documents' id spelling, sampled from the packs. */
const SHIPPED_PRIMARIES = ["melee", "performance", "firearms", "animalken", "larceny", "stealth", "etiquette", "drive", "survival", "craft"];

const SECONDABILITY_TYPES = [
	"wod.types.talentsecondability",
	"wod.types.skillsecondability",
	"wod.types.knowledgesecondability"
];

/* ------------------------------------------------------------------ *
 * A. The predicate itself
 * ------------------------------------------------------------------ */

console.log("\nA. isEnrichableAbility: what counts as an ability here");

await test("an Ability is one, whatever its system.type", () => {
	for (const st of ["wod.abilities.talent", "wod.abilities.skill", "wod.abilities.knowledge", "wod.abilities.ability", undefined, ""]) {
		assert.equal(isEnrichableAbility({ type: "Ability", system: { type: st } }), true, `system.type ${st}`);
	}
	assert.equal(isEnrichableAbility({ type: "Ability" }), true, "no system at all");
});

await test("all three secondability Traits are ones", () => {
	for (const st of SECONDABILITY_TYPES) {
		assert.equal(isEnrichableAbility({ type: "Trait", system: { type: st } }), true, st);
	}
});

await test("the suffix rule is AbilityHelper's, not a second copy", () => {
	// A fourth `*secondability` a line might add must be covered automatically, and
	// must be covered because AbilityHelper says so - not because this module has its
	// own list. If someone replaces the delegation with a hardcoded triple, this fails.
	const hypothetical = "wod.types.craftsecondability";
	assert.equal(AbilityHelper.IsSecondAbilityType(hypothetical), true, "premise");
	assert.equal(isEnrichableAbility({ type: "Trait", system: { type: hypothetical } }), true);
});

await test("a NON-secondary Trait is NOT one (the 104 shipped Trait documents)", () => {
	for (const st of ["wod.types.maneuver", "wod.types.resonance", "wod.types.shapeform", "wod.types.othertraits", "", undefined]) {
		assert.equal(isEnrichableAbility({ type: "Trait", system: { type: st } }), false, `system.type ${st}`);
	}
});

await test("no other document type is one", () => {
	for (const t of ["Feature", "Power", "Item", "Armor", "Rote", "Fetish", "Advantage", "Sphere", "Melee Weapon", "Ranged Weapon", "Realm"]) {
		assert.equal(isEnrichableAbility({ type: t, system: { type: "wod.types.talentsecondability" } }), false, t);
	}
});

await test("junk never throws", () => {
	for (const v of [null, undefined, {}, 0, "", "Ability", [], { type: "Trait" }, { type: "Trait", system: null }]) {
		assert.equal(isEnrichableAbility(v), false, JSON.stringify(v));
	}
});

/* ------------------------------------------------------------------ *
 * B. The full (item shape x document shape) matrix
 * ------------------------------------------------------------------ */

console.log("\nB. all four (item shape x document shape) combinations resolve");
console.log("   -- i.e. this fork and the content packs can deploy in either order");

await test("POST-B1 retyped doc + Ability item (the 17 mis-shaped live items)", async () => {
	game.packs = [fakePack("b1-secondary", [retypedDoc("Tiro con Arco", "tiro-con-arco")])];
	const actor = fakeActor("b1");
	const match = await findAbilityCompendiumMatch(actor, { name: "Tiro con Arco", type: "Ability", system: { id: "tiro-con-arco" } });
	assert.ok(match, "a retyped Trait document was not matched -- the :71 filter is narrow again");
	assert.equal(match.system.description, "desc of Tiro con Arco");
});

await test("POST-B1 retyped doc + Trait secondary item (both sides correct)", async () => {
	game.packs = [fakePack("b2-secondary", [retypedDoc("Sueño Lúcido", "sueno-lucido")])];
	const actor = fakeActor("b2");
	const item = fakeItem("Trait", "Sueño Lúcido", { id: "sueno_lucido", type: "wod.types.talentsecondability" });
	const match = await findAbilityCompendiumMatch(actor, item);
	assert.ok(match, "the shape B1 produces on BOTH sides did not resolve");
	assert.equal(match.system.description, "desc of Sueño Lúcido");
});

await test("PRE-B1 Ability doc + Trait secondary item (works BEFORE the packs move)", async () => {
	// This combination never worked before this change: the item-side gates required
	// `type === "Ability"`, and an actor's secondary has always been a Trait. It is what
	// makes this fork safe to deploy on its own, ahead of the retype.
	game.packs = [fakePack("b3-secondary", [doc("Hipertecnología", "hipertecnologia", { systemType: "wod.abilities.skill" })])];
	const actor = fakeActor("b3");
	const item = fakeItem("Trait", "Hipertecnología", { id: "hipertecnologia", type: "wod.types.skillsecondability" });
	const match = await findAbilityCompendiumMatch(actor, item);
	assert.ok(match, "a pre-retype Ability document did not resolve for a Trait secondary");
});

await test("PRE-B1 Ability doc + Ability item (the path that already worked)", async () => {
	game.packs = [fakePack("b4-talents", [doc("Trato con Animales", "animalken")])];
	const actor = fakeActor("b4");
	const match = await findAbilityCompendiumMatch(actor, { name: "Trato con Animales", type: "Ability", system: { id: "animalken" } });
	assert.ok(match, "the 183-primary path regressed");
	assert.equal(match.system.description, "desc of Trato con Animales");
});

await test("the literal `shared-secondary-ability` pack is still selected by name", async () => {
	// design.md's third question: pack SELECTION is by name prefix and hardcodes this
	// literal, so the pack goes on being searched; only the documents stopped fitting.
	// Proven by using a splat with NO line packs at all - `mortal`, which ships none -
	// so the only way to reach this document is the literal shared-pack name.
	game.packs = [fakePack("shared-secondary-ability", [retypedDoc("Acrobacias", "acrobacias", "wod.types.skillsecondability")])];
	const actor = fakeActor("mortal");
	const match = await findAbilityCompendiumMatch(actor, { name: "Acrobacias", type: "Ability", system: { id: "acrobacias" } });
	assert.ok(match, "the shared pack stopped being reached");
});

/* ------------------------------------------------------------------ *
 * C. The 183 primaries, and line isolation, are untouched
 * ------------------------------------------------------------------ */

console.log("\nC. the 183 primary Ability documents are not disturbed");

await test("every sampled primary id still matches by key", async () => {
	game.packs = [fakePack("c1-talents", SHIPPED_PRIMARIES.map(id => doc(`Doc ${id}`, id)))];
	const actor = fakeActor("c1");
	for (const id of SHIPPED_PRIMARIES) {
		const match = await findAbilityCompendiumMatch(actor, { name: "irrelevant", type: "Ability", system: { id } });
		assert.ok(match, `primary ${id} stopped matching`);
		assert.equal(match.system.id, id);
	}
});

await test("the name fallback still works when the item carries no key", async () => {
	game.packs = [fakePack("c2-talents", [doc("Pelea con Armas", "melee")])];
	const actor = fakeActor("c2");
	const match = await findAbilityCompendiumMatch(actor, { name: "pelea CON armas", type: "Ability", system: { id: "" } });
	assert.ok(match, "the case-insensitive name fallback regressed");
});

await test("key normalisation does NOT strip separators, so no primary widens", async () => {
	// `animalken` must still not equal `animal-ken`. The normalisation equates two
	// SPELLINGS of one slug; it must not make separator-free and separated ids collide,
	// or the 183 concatenated primaries would start matching hyphenated strangers.
	game.packs = [fakePack("c3-talents", [doc("Trato con Animales", "animal-ken")])];
	const actor = fakeActor("c3");
	const match = await findAbilityCompendiumMatch(actor, { name: "no-name-match", type: "Ability", system: { id: "animalken" } });
	assert.equal(match, null, "`animalken` matched `animal-ken` -- normalisation is too aggressive");
});

await test("line isolation holds: another line's pack is never searched", async () => {
	game.packs = [fakePack("c4other-talents", [doc("Mentor", "mentor")])];
	const actor = fakeActor("c4");
	const match = await findAbilityCompendiumMatch(actor, { name: "Mentor", type: "Ability", system: { id: "mentor" } });
	assert.equal(match, null, "a foreign line's document was returned -- the V2 disaster shape");
});

await test("a line pack still beats the shared pack", async () => {
	const line = fakePack("c5-talents", [doc("Buscar", "buscar", { description: "LINE" })]);
	const shared = fakePack("c5shared-secondary-ability-x", [retypedDoc("Buscar", "buscar", "wod.types.talentsecondability", { description: "SHARED" })]);
	// `candidateAbilityPacks` puts line packs first; both here are line-prefixed, so this
	// asserts the ORDER of the returned list rather than the shared special case.
	game.packs = [shared, line];
	const actor = fakeActor("c5");
	const match = await findAbilityCompendiumMatch(actor, { name: "Buscar", type: "Ability", system: { id: "buscar" } });
	assert.equal(match.system.description, "LINE", "shared beat the line's own document");
});

/* ------------------------------------------------------------------ *
 * D. The widening guard -- the 104 shipped non-ability Traits
 * ------------------------------------------------------------------ */

console.log("\nD. the 104 non-ability Trait documents stay OUT (the widening guard)");

await test("a `wod.types.maneuver` Trait is not matched, by key or by name", async () => {
	game.packs = [fakePack("d1-maneuvers", [
		{ name: "Golpe", type: "Trait", system: { id: "golpe", type: "wod.types.maneuver", description: "a maneuver" }, flags: {} }
	])];
	const actor = fakeActor("d1");
	assert.equal(await findAbilityCompendiumMatch(actor, { name: "Golpe", type: "Ability", system: { id: "golpe" } }), null,
		"a maneuver was matched as an ability -- the `secondability` qualifier is gone");
});

await test("a `wod.types.resonance` Trait in a LINE pack is not matched", async () => {
	// `mage-resonance` really is searched for a mage: `candidateAbilityPacks` takes every
	// pack prefixed with the line. These 17 are the concrete cross-contamination risk.
	game.packs = [fakePack("d2-resonance", [
		{ name: "Devoto", type: "Trait", system: { id: "devoto", type: "wod.types.resonance", description: "a resonance" }, flags: {} }
	])];
	const actor = fakeActor("d2");
	assert.equal(await findAbilityCompendiumMatch(actor, { name: "Devoto", type: "Ability", system: { id: "devoto" } }), null,
		"a resonance was matched as an ability");
});

await test("Feature/Power/Item documents with colliding names stay out", async () => {
	game.packs = [fakePack("d3-equipment", [
		{ name: "Equitación", type: "Feature", system: { id: "equitacion", description: "x" }, flags: {} },
		{ name: "Vuelo", type: "Power", system: { id: "vuelo", description: "x" }, flags: {} },
		{ name: "Jetpack", type: "Item", system: { id: "jetpack", description: "x" }, flags: {} }
	])];
	const actor = fakeActor("d3");
	for (const [name, id] of [["Equitación", "equitacion"], ["Vuelo", "vuelo"], ["Jetpack", "jetpack"]]) {
		assert.equal(await findAbilityCompendiumMatch(actor, { name, type: "Ability", system: { id } }), null, `${name} leaked in`);
	}
});

await test("a secondary document mixed into a pack of non-abilities is still found", async () => {
	// The other half of D: the filter must be narrow, not blind.
	game.packs = [fakePack("d4-mixed", [
		{ name: "Golpe", type: "Trait", system: { id: "golpe", type: "wod.types.maneuver", description: "no" }, flags: {} },
		{ name: "Cocina", type: "Feature", system: { id: "cocina", description: "no" }, flags: {} },
		retypedDoc("Tortura", "tortura", "wod.types.skillsecondability")
	])];
	const actor = fakeActor("d4");
	const match = await findAbilityCompendiumMatch(actor, { name: "Tortura", type: "Ability", system: { id: "tortura" } });
	assert.ok(match, "the one real secondary in a mixed pack was lost");
	assert.equal(match.system.description, "desc of Tortura");
});

/* ------------------------------------------------------------------ *
 * E. The two separator conventions for one slug
 * ------------------------------------------------------------------ */

console.log("\nE. the hyphen/underscore key bridge (the two spellings of one slug)");

await test("every shipped secondary id bridges from the actor's derived key", async () => {
	// This is the real cross-repo mismatch: the compendium's ids are hyphenated webgen
	// entity ids; the actor's are `GetSecondAbilityId`'s underscored slugs, contracted
	// with wod20-char. Without the comparator normalising, 10 of the 25 fall off the KEY
	// path and survive only by name -- which this module's header calls reliable only
	// inside one line's pack.
	game.packs = [fakePack("e1-secondary", SHIPPED_SECONDARIES.map(([id, name]) => retypedDoc(name, id)))];
	const actor = fakeActor("e1");
	for (const [compendiumId, name] of SHIPPED_SECONDARIES) {
		const actorKey = AbilityHelper.GetSecondAbilityId(name);
		// Deliberately UNMATCHABLE by name, so only the key path can succeed.
		const match = await findAbilityCompendiumMatch(actor, { name: "zzz no name match zzz", type: "Trait", system: { id: actorKey, type: "wod.types.talentsecondability" } });
		assert.ok(match, `${name}: actor key "${actorKey}" did not reach document id "${compendiumId}"`);
		assert.equal(match.system.id, compendiumId, `${name} matched the wrong document`);
	}
});

await test("10 of the 25 really do disagree, so the bridge is load-bearing", () => {
	// Guards the premise. If a future webgen change makes the ids agree, this figure
	// changes and the comment above must be re-read rather than trusted.
	const differing = SHIPPED_SECONDARIES.filter(([id, name]) => id !== AbilityHelper.GetSecondAbilityId(name));
	assert.equal(differing.length, 10, `expected 10 differing ids, got ${differing.length}: ${JSON.stringify(differing)}`);
	for (const [id] of differing) assert.ok(id.includes("-"), `${id} differs for a reason other than the separator`);
});

await test("the bridge is symmetric (underscored document, hyphenated item)", async () => {
	game.packs = [fakePack("e3-secondary", [retypedDoc("Alto Ritual", "alto_ritual")])];
	const actor = fakeActor("e3");
	const match = await findAbilityCompendiumMatch(actor, { name: "zzz", type: "Ability", system: { id: "alto-ritual" } });
	assert.ok(match, "normalisation only works in one direction");
});

await test("the 15 separator-free ids are compared byte-identically", async () => {
	const plain = SHIPPED_SECONDARIES.filter(([id]) => !id.includes("-"));
	assert.equal(plain.length, 15, `expected 15 separator-free ids, got ${plain.length}`);
	game.packs = [fakePack("e4-secondary", plain.map(([id, name]) => retypedDoc(name, id)))];
	const actor = fakeActor("e4");
	for (const [id] of plain) {
		const match = await findAbilityCompendiumMatch(actor, { name: "zzz", type: "Ability", system: { id } });
		assert.ok(match, `${id} stopped matching`);
	}
});

/* ------------------------------------------------------------------ *
 * F. enrichAbilityItemData, executed
 * ------------------------------------------------------------------ */

console.log("\nF. enrichAbilityItemData writes the description AND the provenance flags");

await test("a secondary Trait payload is enriched (it never was before)", async () => {
	game.packs = [fakePack("f1-secondary", [retypedDoc("Descaro", "descaro")])];
	const actor = fakeActor("f1");
	const itemData = { name: "Descaro", type: "Trait", system: { id: "descaro", type: "wod.types.talentsecondability" } };
	assert.equal(await enrichAbilityItemData(actor, itemData), true, "returned false for a secondary Trait");
	assert.equal(itemData.system.description, "desc of Descaro");
	// THE LOAD-BEARING HALF: without these flags `compendium-description.js`'s
	// `provenanceOf` returns null and the item can never resolve its text live again.
	assert.equal(itemData.flags[MODULE_ID].id, "descaro");
	assert.equal(itemData.flags[MODULE_ID].source_type, "secondary-ability");
});

await test("an Ability payload is still enriched", async () => {
	game.packs = [fakePack("f2-talents", [doc("Sigilo", "stealth")])];
	const actor = fakeActor("f2");
	const itemData = { name: "Sigilo", type: "Ability", system: { id: "stealth" } };
	assert.equal(await enrichAbilityItemData(actor, itemData), true);
	assert.equal(itemData.system.description, "desc of Sigilo");
	assert.equal(itemData.flags[MODULE_ID].id, "stealth");
});

await test("an existing description is never overwritten", async () => {
	game.packs = [fakePack("f3-secondary", [retypedDoc("Vuelo", "vuelo")])];
	const actor = fakeActor("f3");
	const itemData = { name: "Vuelo", type: "Trait", system: { id: "vuelo", type: "wod.types.talentsecondability", description: "the player's own text" } };
	assert.equal(await enrichAbilityItemData(actor, itemData), false);
	assert.equal(itemData.system.description, "the player's own text");
});

await test("a non-ability Trait payload is left completely alone", async () => {
	game.packs = [fakePack("f4-maneuvers", [
		{ name: "Golpe", type: "Trait", system: { id: "golpe", type: "wod.types.maneuver", description: "a maneuver" }, flags: { [MODULE_ID]: { id: "golpe" } } }
	])];
	const actor = fakeActor("f4");
	const itemData = { name: "Golpe", type: "Trait", system: { id: "golpe", type: "wod.types.maneuver" } };
	assert.equal(await enrichAbilityItemData(actor, itemData), false);
	assert.equal(itemData.system.description, undefined);
	assert.equal(itemData.flags, undefined, "a maneuver was given ability provenance");
});

await test("no match: returns false, warns, and leaves the description empty", async () => {
	game.packs = [fakePack("f5-secondary", [retypedDoc("Tortura", "tortura")])];
	const actor = fakeActor("f5");
	const itemData = { name: "Arte", type: "Trait", system: { id: "arte", type: "wod.types.talentsecondability" } };
	assert.equal(await enrichAbilityItemData(actor, itemData), false);
	assert.equal(itemData.system.description, undefined);
	assert.ok(logged.warn.some(w => w.includes("Arte")), `expected a warning naming the ability, got ${JSON.stringify(logged.warn)}`);
});

/* ------------------------------------------------------------------ *
 * G. maybeEnrichAbilityOnRename, executed -- and the two live "Arte"s
 * ------------------------------------------------------------------ */

console.log("\nG. maybeEnrichAbilityOnRename, and the two live 'Arte' Traits");

await test("renaming a secondary Trait fills its description and flags", async () => {
	game.packs = [fakePack("g1-secondary", [retypedDoc("Equitación", "equitacion", "wod.types.skillsecondability")])];
	const actor = fakeActor("g1");
	const item = fakeItem("Trait", "Equitación", { id: "equitacion", type: "wod.types.skillsecondability" }, actor);
	await maybeEnrichAbilityOnRename(item, { name: "Equitación" });
	assert.equal(item.updates.length, 1, "no update was issued for a renamed secondary");
	assert.equal(item.updates[0]["system.description"], "desc of Equitación");
	assert.equal(item.updates[0].flags[MODULE_ID].id, "equitacion");
});

await test("the flat sheet payload {'system.id': ...} is seen too", async () => {
	game.packs = [fakePack("g2-secondary", [retypedDoc("Finanzas", "finanzas", "wod.types.knowledgesecondability")])];
	const actor = fakeActor("g2");
	const item = fakeItem("Trait", "Finanzas", { id: "finanzas", type: "wod.types.knowledgesecondability" }, actor);
	await maybeEnrichAbilityOnRename(item, { "system.id": "finanzas", "system.label": "Finanzas" });
	assert.equal(item.updates.length, 1, "the flat DocumentSheet payload was not recognised");
});

await test("an Ability rename still enriches", async () => {
	game.packs = [fakePack("g3-talents", [doc("Alerta", "alertness")])];
	const actor = fakeActor("g3");
	const item = fakeItem("Ability", "Alerta", { id: "alertness", type: "wod.abilities.talent" }, actor);
	await maybeEnrichAbilityOnRename(item, { name: "Alerta" });
	assert.equal(item.updates.length, 1, "the Ability rename path regressed");
});

await test("an unrelated change issues no update", async () => {
	game.packs = [fakePack("g4-secondary", [retypedDoc("Do", "do")])];
	const actor = fakeActor("g4");
	const item = fakeItem("Trait", "Do", { id: "do", type: "wod.types.talentsecondability" }, actor);
	await maybeEnrichAbilityOnRename(item, { system: { value: 3 } });
	assert.equal(item.updates.length, 0, "a rating change triggered a description write");
});

await test("a description already present is never touched", async () => {
	game.packs = [fakePack("g5-secondary", [retypedDoc("Do", "do")])];
	const actor = fakeActor("g5");
	const item = fakeItem("Trait", "Do", { id: "do", type: "wod.types.talentsecondability", description: "mine" }, actor);
	await maybeEnrichAbilityOnRename(item, { name: "Do" });
	assert.equal(item.updates.length, 0);
	assert.equal(item.system.description, "mine");
});

await test("a maneuver Trait is never written to", async () => {
	game.packs = [fakePack("g6-maneuvers", [
		{ name: "Golpe", type: "Trait", system: { id: "golpe", type: "wod.types.maneuver", description: "x" }, flags: {} }
	])];
	const actor = fakeActor("g6");
	const item = fakeItem("Trait", "Golpe", { id: "golpe", type: "wod.types.maneuver" }, actor);
	await maybeEnrichAbilityOnRename(item, { name: "Golpe" });
	assert.equal(item.updates.length, 0, "a maneuver was written to by ability enrichment");
});

await test("a world (actor-less) item is never written to", async () => {
	game.packs = [fakePack("g7-secondary", [retypedDoc("Do", "do")])];
	const item = fakeItem("Trait", "Do", { id: "do", type: "wod.types.talentsecondability" }, null);
	await maybeEnrichAbilityOnRename(item, { name: "Do" });
	assert.equal(item.updates.length, 0);
});

await test("LIVE 'Arte' with system.id 'arte' (Ines): no match, no write, no throw", async () => {
	// Both live secondaries are read-only facts about production, and `arte` is NOT among
	// the 25 shipped ids (verified against wod20-compendium-es/src). So widening the item
	// side cannot write to either of them: the worst case is one console warning.
	assert.ok(!SHIPPED_SECONDARIES.some(([id]) => id === "arte"), "premise: no shipped 'arte' document");
	game.packs = [fakePack("g8-secondary", SHIPPED_SECONDARIES.map(([id, name]) => retypedDoc(name, id)))];
	const actor = fakeActor("g8");
	const item = fakeItem("Trait", "Arte", { id: "arte", type: "wod.types.talentsecondability", isvisible: true }, actor);
	await maybeEnrichAbilityOnRename(item, { "system.id": "arte" });
	assert.equal(item.updates.length, 0, "a live production Trait was written to");
	assert.equal(item.system.settings, undefined, "a system.settings object was invented on the flat shape");
});

await test("LIVE 'Arte' with NO system.id (Lena): same, and the flat shape survives", async () => {
	game.packs = [fakePack("g9-secondary", SHIPPED_SECONDARIES.map(([id, name]) => retypedDoc(name, id)))];
	const actor = fakeActor("g9");
	const item = fakeItem("Trait", "Arte", { type: "wod.types.talentsecondability", isvisible: true }, actor);
	await maybeEnrichAbilityOnRename(item, { name: "Arte" });
	assert.equal(item.updates.length, 0, "a live production Trait was written to");
	assert.equal(item.system.isvisible, true, "the flat isvisible was disturbed");
	assert.equal(item.system.settings, undefined);
});

/* ------------------------------------------------------------------ *
 * H. migrations.js:enrichActorAbilities, executed
 * ------------------------------------------------------------------ */

console.log("\nH. migrations.js:enrichActorAbilities covers both shapes");

await test("a secondary Trait on an actor is backfilled alongside its Abilities", async () => {
	game.packs = [fakePack("h1-secondary", [
		doc("Sigilo", "stealth", { systemType: "wod.abilities.skill", sourceType: "ability" }),
		retypedDoc("Acrobacias", "acrobacias", "wod.types.skillsecondability")
	])];
	const actor = fakeActor("h1");
	const ability = fakeItem("Ability", "Sigilo", { id: "stealth", type: "wod.abilities.skill" }, actor);
	const secondary = fakeItem("Trait", "Acrobacias", { id: "acrobacias", type: "wod.types.skillsecondability" }, actor);
	const maneuver = fakeItem("Trait", "Golpe", { id: "golpe", type: "wod.types.maneuver" }, actor);

	const stats = await enrichActorAbilities(actor);
	assert.equal(stats.enriched, 2, `expected both shapes enriched, got ${JSON.stringify(stats)}`);
	assert.equal(ability.updates.length, 1, "the Ability was skipped");
	assert.equal(secondary.updates.length, 1, "the secondary Trait was skipped -- the item-side gate is narrow again");
	assert.equal(maneuver.updates.length, 0, "a maneuver was migrated as an ability");
	assert.equal(actor.flags.worldofdarkness.abilitiesEnriched, true, "the per-actor flag was not set");
});

await test("an already-described item counts as skipped, not enriched", async () => {
	game.packs = [fakePack("h2-secondary", [retypedDoc("Buscar", "buscar")])];
	const actor = fakeActor("h2");
	const item = fakeItem("Trait", "Buscar", { id: "buscar", type: "wod.types.talentsecondability", description: "mine" }, actor);
	const stats = await enrichActorAbilities(actor);
	assert.equal(stats.skipped, 1);
	assert.equal(stats.enriched, 0);
	assert.equal(item.updates.length, 0);
});

await test("an unmatched secondary is counted and warned, not written", async () => {
	game.packs = [fakePack("h3-secondary", [retypedDoc("Buscar", "buscar")])];
	const actor = fakeActor("h3");
	const item = fakeItem("Trait", "Arte", { id: "arte", type: "wod.types.talentsecondability" }, actor);
	const stats = await enrichActorAbilities(actor);
	assert.equal(stats.notFound, 1, JSON.stringify(stats));
	assert.equal(item.updates.length, 0);
	assert.equal(actor.flags.worldofdarkness.abilitiesEnriched, true, "the flag must still be set so it does not re-run forever");
});

/* ------------------------------------------------------------------ *
 * I. degrade, never throw
 * ------------------------------------------------------------------ */

console.log("\nI. degrade, never throw (the packs and this fork deploy separately)");

await test("no compendium module at all: null, no throw", async () => {
	game.packs = [];
	assert.equal(await findAbilityCompendiumMatch(fakeActor("i1"), { name: "Do", type: "Ability", system: { id: "do" } }), null);
});

await test("a foreign module's pack is ignored", async () => {
	game.packs = [{ documentName: "Item", collection: "some-other-module.i2-secondary", async getDocuments() { throw new Error("must not be read"); } }];
	assert.equal(await findAbilityCompendiumMatch(fakeActor("i2"), { name: "Do", type: "Ability", system: { id: "do" } }), null);
});

await test("a non-Item pack is ignored", async () => {
	game.packs = [{ documentName: "Actor", collection: `${MODULE_ID}.i3-actors`, async getDocuments() { throw new Error("must not be read"); } }];
	assert.equal(await findAbilityCompendiumMatch(fakeActor("i3"), { name: "Do", type: "Ability", system: { id: "do" } }), null);
});

await test("an unreadable pack warns, degrades, and is NOT cached", async () => {
	const bad = fakePack("i4-secondary", [], { throws: true });
	game.packs = [bad];
	const actor = fakeActor("i4");
	assert.equal(await findAbilityCompendiumMatch(actor, { name: "Do", type: "Ability", system: { id: "do" } }), null);
	await findAbilityCompendiumMatch(actor, { name: "Do", type: "Ability", system: { id: "do" } });
	assert.equal(bad.calls, 2, "a pack that failed once was cached as empty and never retried");
	assert.ok(logged.warn.some(w => w.includes("i4-secondary")), "the unreadable pack was not reported");
});

await test("an item with neither key nor name never touches a pack", async () => {
	const pack = fakePack("i5-secondary", [retypedDoc("Do", "do")]);
	game.packs = [pack];
	assert.equal(await findAbilityCompendiumMatch(fakeActor("i5"), { name: "", type: "Trait", system: { id: "" } }), null);
	assert.equal(pack.calls, 0, "packs were loaded for an empty query");
});

await test("compendiumProvenanceOf degrades to {} for a flagless document", () => {
	assert.deepEqual(compendiumProvenanceOf(null), {});
	assert.deepEqual(compendiumProvenanceOf({ flags: {} }), {});
	assert.deepEqual(compendiumProvenanceOf({ flags: { [MODULE_ID]: { id: "do" } } }), { [MODULE_ID]: { id: "do" } });
});

console.log("\nJ. `game` is searched before `splat` (propagate-health-bonus-traits)");

await test("a wodchar mortal-variant-of-a-line actor searches its GAME line, not its splat", async () => {
	// Raffela Diemer: settings.splat "mortal" (a Sleeper, no Arete/Spheres widgets), settings.game
	// "mage" (the book line her Merits/Backgrounds actually come from). There is no
	// "mortal-talents" pack; reading splat alone finds nothing, silently.
	const pack = fakePack("jgamesplit-talents", [doc("Alertness", "alertness")]);
	game.packs = [pack];
	const actor = { name: "harness-mortal-variant", type: "PC", system: { settings: { splat: "mortal", game: "jgamesplit" } }, items: [] };
	const match = await findAbilityCompendiumMatch(actor, { name: "Alertness", type: "Ability", system: { id: "alertness" } });
	assert.ok(match, "settings.game was not consulted — splat's empty-pack line won instead");
});

await test("a genuinely splat-less mortal (no `game` at all) still finds nothing — no regression", async () => {
	game.packs = [fakePack("jgamesplit-talents", [doc("Alertness", "alertness")])];
	const match = await findAbilityCompendiumMatch(fakeActor("mortal"), { name: "Alertness", type: "Ability", system: { id: "alertness" } });
	assert.equal(match, null, "a plain 'mortal' splat with no game field started matching a real line's packs");
});

await test("an explicit splatOverride still wins over both game and splat", async () => {
	// DropHelper.DropSplatToActor's mid-import window: neither settings.splat nor settings.game
	// is trustworthy yet, which is exactly why this parameter exists.
	game.packs = [fakePack("joverride-talents", [doc("Alertness", "alertness")])];
	const actor = { name: "harness-mid-import", type: "PC", system: { settings: { splat: "stale-splat", game: "stale-game" } }, items: [] };
	const match = await findAbilityCompendiumMatch(actor, { name: "Alertness", type: "Ability", system: { id: "alertness" } }, "joverride");
	assert.ok(match, "splatOverride was not honoured over settings.game/settings.splat");
});

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

console.log("");
if (failures.length) {
	console.error(`ability-enrichment type harness FAILED: ${failures.length} of ${passed + failures.length} checks`);
	for (const f of failures) console.error(`  - ${f.name}`);
	process.exit(1);
}
console.log(`ability-enrichment type harness OK: ${passed} checks passing`);
