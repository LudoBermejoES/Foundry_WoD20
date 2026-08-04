#!/usr/bin/env node
/**
 * Byte-identity harness for the advantage block (`getGetStatArea_v2`).
 *
 *     node .github/scripts/test-statarea-identity.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * `getGetStatArea_v2` draws Arete, Willpower, Quintessence, Renown, Virtues and Corpus for every
 * game line, and it emitted the banner and the two dot rows as FLAT SIBLINGS: nothing in the DOM
 * contained exactly one stat, so no stylesheet could draw a card per stat (add-pc-sheet-v3 D6). The
 * fix splits the function in two — `buildStatArea()` decides, the helper renders — so that the v3
 * sheet can add a second renderer without forking the wraith Corpus exception, the werewolf rank or
 * the changeling imbalance into it.
 *
 * That refactor is only safe if the markup did not move by one byte, on a sheet that 88 live actors
 * open and that has no test suite. So this harness runs the FROZEN pre-refactor implementation and
 * the real registered helper over the same fixture table and compares the two strings byte for byte.
 *
 * WHY THE OLD IMPLEMENTATION IS VENDORED HERE
 * -------------------------------------------
 * Section 4 below is a verbatim copy of the function as it stood before the split, kept in this file
 * rather than fetched from git history. Reaching into history would make the check evaporate the
 * moment the original commit is squashed away or the file is rewritten; a vendored copy keeps
 * proving the contract after the original is gone, which is the whole point. It is deliberately NOT
 * tidied: it is a specimen, not code we maintain. When the v2 markup is intentionally changed, this
 * copy is updated in the same commit and the diff shows exactly what moved.
 *
 * WHY THE MODULE TREE IS COPIED
 * -----------------------------
 * Same reason and same trick as `test-secondability-id.mjs`: with no package.json, node parses `.js`
 * under the CommonJS goal and `import` blows up, so `module/` is copied verbatim into a temp dir
 * with a `{"type":"module"}` beside it. The code under test is a byte-identical copy of what ships.
 *
 * Offline, no Foundry, no network, ~1s.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-statarea-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));

fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

/* ------------------------------------------------------------------ *
 * 2. Foundry globals, installed BEFORE the imports.
 * ------------------------------------------------------------------ */

/* The REAL Spanish strings, so the comparison runs over text with accents and spaces in it rather
   than over i18n keys. Both implementations call the same localizer, so this cannot mask a
   difference — it only makes the fixtures resemble what a player sees. Unknown key returns the key,
   which is what game.i18n.localize does. */
const ES = JSON.parse(fs.readFileSync(path.join(REPO, "lang", "es.json"), "utf8"));

function localize(key) {
	if (typeof key !== "string") return key;

	let node = ES;

	for (const part of key.split(".")) {
		if ((node == null) || (typeof node !== "object")) return key;
		node = node[part];
	}

	return (typeof node === "string") ? node : key;
}

/* Every helper this file registers is captured here; the one under test is pulled out by name, so a
   rename of the helper fails the harness instead of silently testing nothing. */
const registered = new Map();

globalThis.Handlebars = {
	registerHelper: (name, fn) => registered.set(name, fn),
	SafeString: class SafeString { constructor(s) { this.string = s; } toString() { return this.string; } },
	escapeExpression: (s) => s
};
globalThis.game = {
	system: { version: "0.0.0-harness" },
	i18n: { localize, format: (k) => k, translations: {} },
	settings: { get: () => undefined },
	actors: { get: () => undefined },
	packs: { get: () => undefined },
	user: { isGM: true }
};
globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {} } };
globalThis.FormApplication = class FormApplication { static get defaultOptions() { return {}; } };
globalThis.Application = class Application {};
globalThis.Item = class Item {};
globalThis.Actor = class Actor {};
globalThis.foundry = {
	utils: {
		duplicate: (o) => structuredClone(o),
		mergeObject: (a, b) => Object.assign({}, a, b)
	},
	abstract: { TypeDataModel: class TypeDataModel {} },
	data: { fields: {} }
};

/* CONFIG.worldofdarkness is the REAL config, not a stub: the splat switches below are the decisions
   under test, so renaming `sheettype.wraith` must break this harness rather than pass it. */
const { wod } = await import(path.join(sandbox, "module", "config.js"));
globalThis.CONFIG = { worldofdarkness: wod, Item: { dataModels: {} }, Actor: { dataModels: {} } };

/* ------------------------------------------------------------------ *
 * 3. The REAL code, out of the copied tree.
 * ------------------------------------------------------------------ */

const { registerHandlebarsHelpers, buildStatArea } = await import(
	path.join(sandbox, "module", "handlebars.js")
);

registerHandlebarsHelpers();

const currentGetStatArea = registered.get("getGetStatArea_v2");

assert.equal(typeof currentGetStatArea, "function", "getGetStatArea_v2 is not registered any more");
assert.equal(typeof buildStatArea, "function", "handlebars.js no longer exports buildStatArea");

/* ------------------------------------------------------------------ *
 * 4. THE FROZEN PRE-REFACTOR IMPLEMENTATION.
 *    Verbatim, warts included. Do not tidy it: its value is that it is the
 *    thing that used to run. See the header.
 * ------------------------------------------------------------------ */

/* eslint-disable */
function legacyGetStatArea(actor, stat, showbanner = true) {

	const statname = stat.system.label;
	const statid = stat.system.id;
	const isrollable = stat.system.settings.useroll;
	const ispermanent = stat.system.settings.usepermanent;
	const istemporary = stat.system.settings.usetemporary;

	let html = "";
	let permanent_html = "";
	let temporary_html = "";
	let stat_headline_text = game.i18n.localize(statname);
	let rollable = "";
	let rollaction = "";
	let splat = CONFIG.worldofdarkness.sheettype.mortal;	
	let splat_temporary = CONFIG.worldofdarkness.sheettype.mortal;	

	let rankname = "";

	if (isrollable) {
		rollable = " vrollable";
		rollaction = `data-action="rollDice"`;
	}

	// wraith corpus
	if (statid == "corpus") {
		splat_temporary = CONFIG.worldofdarkness.sheettype.wraith;
	}

	// wereweolf and shifter renown
	if (stat.system.group == "renown") {
		splat = CONFIG.worldofdarkness.sheettype.werewolf;
		stat_headline_text = game.i18n.localize(statname);

		if (stat.system.id == "rank") {
			rankname = `<span class="splatFont">${actor.GetShifterRank()}</span>`;
		}			
	}

	if (showbanner) {
		html += `<div class="sheet-headline sheet-banner-small splatFont ${rollable}" data-type="${splat}" data-key="${statid}" data-noability="true" ${rollaction}><span class="sheet-banner-text">${stat_headline_text}</span></div>`;	
	}
	else {
		html += `<div class="sheet-headline splatFont ${rollable}" data-type="${splat}" data-key="${statname}" data-noability="true" ${rollaction}><span class="sheet-banner-text">${stat_headline_text}</span></div>`;
	}		

	if (ispermanent) {
		let header = `<div class="sheet-boxcontainer ${statid}"><div class="resource-value permValueRow" data-itemid="${stat._id}" data-key="${statid}" data-value="${stat.system.permanent}" data-name="system.permanent">`;
		let footer = `</div></div>`;

		

		for (let value = 0; value <= stat.system.max - 1; value++) {
			if ((actor.system.settings.splat == CONFIG.worldofdarkness.splat.changeling) && (statid == "willpower")) {
				let imbalance = "";
				let imbalance_title_text = "";

				let imbalanceValue = stat.system.permanent - stat.system.imbalance;

				if ((value >= imbalanceValue) && (value < stat.system.permanent)) {
					imbalance = `imbalance`;
					imbalance_title_text = game.i18n.localize(`wod.advantages.imbalance`);
				}

				permanent_html += `<span class="resource-value-step ${imbalance}" title="${imbalance_title_text}" data-itemid="${stat._id}" data-action="editDot" data-type="${splat}" data-index="${value}"></span>`;
			}
			else {
				permanent_html += `<span class="resource-value-step" data-action="editDot" data-type="${splat}" data-index="${value}"></span>`;
			}
		}
				
		permanent_html = header + permanent_html + rankname + footer;
	}		

	if (istemporary) {
		let header = `<div class="sheet-boxcontainer"><div class="resource-counter tempSquareRow" data-itemid="${stat._id}" data-key="${statid}" data-value="${stat.system.temporary}" data-name="system.temporary">`;
		let footer = `</div></div>`;

		for (let value = 0; value <= stat.system.max - 1; value++) {
			let mark = "";

			if (stat.system.temporary > value) {
				mark = "x";
			}

			temporary_html += `<span class="resource-value-step" data-action="editDot" data-type="${splat_temporary}" data-index="${value}" data-state="${mark}"></span>`;
		}			

		temporary_html = header + temporary_html + footer;
	}
	
	html += permanent_html + temporary_html;

	return html;
}
/* eslint-enable */

/* ------------------------------------------------------------------ *
 * 5. Fixtures.
 *
 *    Every fixture is a (actor, stat) pair shaped like the documents the four
 *    call sites pass: `stats_advantages.hbs:31`, `stats_renown.hbs:5`,
 *    `stats_groupedadvantages.hbs:34`, `feature_shadow.hbs:56`.
 *
 *    `covers` tags are asserted against REQUIRED_COVERAGE at the end, so
 *    deleting the changeling or the corpus fixture turns the harness red
 *    instead of quietly shrinking it.
 * ------------------------------------------------------------------ */

/** An actor as the helper sees it: a splat and a shifter rank, nothing else. */
function makeActor(splat, rank = "Cliath") {
	return {
		system: { settings: { splat } },
		GetShifterRank: () => rank
	};
}

/** An Advantage item. `settings` is the DataModel's nested SchemaField, as on a live item. */
function makeStat({ id, label, group = "", max = 10, permanent = 0, temporary = 0,
	useroll = false, usepermanent = false, usetemporary = false, imbalance = 0, _id = "aBcDeFgHiJkLmNoP" }) {
	return {
		_id,
		system: {
			id, label, group, max, permanent, temporary, imbalance,
			settings: { useroll, usepermanent, usetemporary }
		}
	};
}

const FIXTURES = [
	{
		name: "arete — permanent only, rollable",
		covers: "permanent-only",
		actor: makeActor(wod.splat.mage),
		stat: makeStat({ id: "arete", label: "wod.advantages.arete", max: 10, permanent: 3, useroll: true, usepermanent: true })
	},
	{
		name: "quintessence — temporary only, not rollable",
		covers: "temporary-only",
		actor: makeActor(wod.splat.mage),
		stat: makeStat({ id: "quintessence", label: "wod.advantages.quintessence", max: 20, temporary: 7, usetemporary: true })
	},
	{
		name: "willpower — both rows, mortal",
		covers: "both",
		actor: makeActor(wod.splat.mortal),
		stat: makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 6, temporary: 4, useroll: true, usepermanent: true, usetemporary: true })
	},
	{
		name: "renown glory — group renown, no rank",
		covers: "renown",
		actor: makeActor(wod.splat.werewolf),
		stat: makeStat({ id: "glory", label: "wod.advantages.renown.glory", group: "renown", max: 10, permanent: 4, temporary: 3, usepermanent: true, usetemporary: true })
	},
	{
		name: "renown rank — the GetShifterRank span",
		covers: "renown-rank",
		actor: makeActor(wod.splat.werewolf, "Fostern"),
		stat: makeStat({ id: "rank", label: "wod.advantages.renown.rank", group: "renown", max: 5, permanent: 2, usepermanent: true })
	},
	{
		name: "renown rank — rank name with an accent, and a temporary row after it",
		covers: "renown-rank",
		actor: makeActor(wod.splat.werewolf, "Athro (Señor de la Guerra)"),
		stat: makeStat({ id: "rank", label: "wod.advantages.renown.rank", group: "renown", max: 5, permanent: 4, temporary: 2, usepermanent: true, usetemporary: true })
	},
	{
		name: "changeling willpower — imbalance 3 of 7",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.changeling),
		stat: makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, temporary: 5, imbalance: 3, useroll: true, usepermanent: true, usetemporary: true })
	},
	{
		name: "changeling willpower — imbalance 0 (no dot marked)",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.changeling),
		stat: makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, imbalance: 0, usepermanent: true })
	},
	{
		name: "changeling willpower — imbalance == permanent (every dot marked)",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.changeling),
		stat: makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 5, imbalance: 5, usepermanent: true })
	},
	{
		name: "changeling willpower — imbalance ABSENT from the document",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.changeling),
		// `permanent - undefined` is NaN and every comparison against it is false. A legacy item
		// predating the field must keep rendering a plain row, not throw and not mark every dot.
		stat: (() => { const s = makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 5, usepermanent: true }); delete s.system.imbalance; return s; })()
	},
	{
		name: "changeling glamour — changeling, but NOT willpower",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.changeling),
		stat: makeStat({ id: "glamour", label: "wod.advantages.glamour", max: 10, permanent: 5, temporary: 2, useroll: true, usepermanent: true, usetemporary: true })
	},
	{
		name: "mortal willpower — willpower, but NOT changeling",
		covers: "changeling-imbalance",
		actor: makeActor(wod.splat.mortal),
		stat: makeStat({ id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, imbalance: 3, usepermanent: true })
	},
	{
		name: "wraith corpus — temporary row switches to the wraith type",
		covers: "wraith-corpus",
		actor: makeActor(wod.splat.wraith),
		stat: makeStat({ id: "corpus", label: "wod.advantages.corpus", max: 10, temporary: 6, usetemporary: true })
	},
	{
		name: "wraith corpus — both rows, so the two rows carry DIFFERENT data-type",
		covers: "wraith-corpus",
		actor: makeActor(wod.splat.wraith),
		stat: makeStat({ id: "corpus", label: "wod.advantages.corpus", max: 10, permanent: 8, temporary: 3, usepermanent: true, usetemporary: true })
	},
	{
		name: "wraith angst — the grouped-advantage path (feature_shadow.hbs:56)",
		covers: "grouped",
		actor: makeActor(wod.splat.wraith),
		stat: makeStat({ id: "angst", label: "wod.advantages.angst", group: "shadow", max: 10, permanent: 3, temporary: 2, usepermanent: true, usetemporary: true })
	},
	{
		name: "virtue conscience — the virtue group",
		covers: "virtue",
		actor: makeActor(wod.splat.vampire),
		stat: makeStat({ id: "conscience", label: "wod.advantages.virtue.conscience", group: "virtue", max: 5, permanent: 3, useroll: true, usepermanent: true })
	},
	{
		name: "path — permanent only, unlocalisable label falls back to the key",
		covers: "fallback",
		actor: makeActor(wod.splat.vampire),
		stat: makeStat({ id: "path", label: "wod.advantages.path.notatranslation", max: 10, permanent: 6, useroll: true, usepermanent: true })
	},
	{
		name: "neither row used — banner only",
		covers: "edge",
		actor: makeActor(wod.splat.mortal),
		stat: makeStat({ id: "essence", label: "wod.advantages.essence", max: 10, permanent: 4, temporary: 4 })
	},
	{
		name: "max 0 — an empty row, not a crash",
		covers: "edge",
		actor: makeActor(wod.splat.mortal),
		stat: makeStat({ id: "spite", label: "wod.advantages.spite", max: 0, permanent: 0, temporary: 0, usepermanent: true, usetemporary: true })
	},
	{
		name: "temporary above max — more spent than the row can draw",
		covers: "edge",
		actor: makeActor(wod.splat.mage),
		stat: makeStat({ id: "quintessence", label: "wod.advantages.quintessence", max: 5, temporary: 12, usetemporary: true })
	},
	{
		name: "max 1 — the single-dot row",
		covers: "edge",
		actor: makeActor(wod.splat.mortal),
		stat: makeStat({ id: "banality", label: "wod.advantages.banality", max: 1, permanent: 1, temporary: 1, usepermanent: true, usetemporary: true })
	},
	{
		name: "max 20 — the long row that gets the every-fifth gap",
		covers: "edge",
		actor: makeActor(wod.splat.mage),
		stat: makeStat({ id: "quintessence", label: "wod.advantages.quintessence", max: 20, permanent: 13, temporary: 17, usepermanent: true, usetemporary: true })
	},
	{
		name: "an id with a quote in it — proves neither side escapes",
		covers: "edge",
		actor: makeActor(wod.splat.mortal),
		// Not reachable from the create buttons, but `system.id` is a free StringField and an
		// imported document can carry anything. Both sides must agree on doing nothing about it.
		stat: makeStat({ id: 'we"ird', label: "wod.advantages.willpower", max: 3, permanent: 1, usepermanent: true, _id: "0123456789abcdef" })
	}
];

/* The six the specification names (add-pc-sheet-v3 tasks 2.3), by tag. */
const REQUIRED_COVERAGE = [
	"permanent-only", "temporary-only", "both", "renown-rank", "changeling-imbalance", "wraith-corpus"
];

/* Every fixture is run through all four, because the third argument is not the boolean it looks
   like: all four call sites pass TWO arguments, so Handlebars supplies its own options object as
   `showbanner` — an object, therefore truthy. `OPTIONS` is that real case. */
const SHOWBANNER_MODES = [
	["default (argument omitted)", undefined],
	["true", true],
	["false", false],
	["handlebars options object", { name: "getGetStatArea_v2", hash: {}, data: {} }]
];

/* ------------------------------------------------------------------ *
 * 6. The comparison.
 * ------------------------------------------------------------------ */

let checks = 0;
const failures = [];

function report(label, expected, actual) {
	let at = 0;
	while ((at < expected.length) && (at < actual.length) && (expected[at] === actual[at])) at++;

	const window = (s) => JSON.stringify(s.slice(Math.max(0, at - 40), at + 40));

	return [
		`  FAIL ${label}`,
		`         first difference at byte ${at} of ${expected.length}`,
		`         frozen: ${window(expected)}`,
		`         now   : ${window(actual)}`
	].join("\n");
}

function check(label, fn) {
	checks++;

	try {
		fn();
	}
	catch (err) {
		failures.push(label);
		console.log(err.__formatted || `  FAIL ${label}\n         ${err.message.split("\n").join("\n         ")}`);
		return;
	}

	console.log(`  ok   ${label}`);
}

console.log("\nA. the rendered markup is byte-identical to the frozen implementation");

for (const fixture of FIXTURES) {
	for (const [modename, showbanner] of SHOWBANNER_MODES) {
		const label = `${fixture.name} [showbanner: ${modename}]`;

		check(label, () => {
			// The omitted-argument mode has to be a call with two arguments, not a call passing
			// `undefined`: only the former lets the `showbanner = true` default fire, and the
			// default is what the four `{{{getGetStatArea_v2 actor advantage}}}` sites would use if
			// Handlebars did not hand them its options object.
			const expected = (showbanner === undefined)
				? legacyGetStatArea(fixture.actor, fixture.stat)
				: legacyGetStatArea(fixture.actor, fixture.stat, showbanner);
			const actual = (showbanner === undefined)
				? currentGetStatArea(fixture.actor, fixture.stat)
				: currentGetStatArea(fixture.actor, fixture.stat, showbanner);

			if (expected !== actual) {
				const err = new Error("markup differs");
				err.__formatted = report(label, expected, actual);
				throw err;
			}

			assert.ok(expected.length > 0, "the frozen implementation produced nothing — bad fixture");
		});
	}
}

console.log("\nB. the fixture table still covers what the specification asked for");

for (const tag of REQUIRED_COVERAGE) {
	check(`a fixture covers "${tag}"`, () => {
		assert.ok(
			FIXTURES.some((f) => f.covers === tag),
			`no fixture tagged "${tag}" — coverage was removed, not just changed`
		);
	});
}

console.log("\nC. the DATA carries the decisions, so a second renderer cannot re-derive them wrong");

check("wraith corpus moves only the TEMPORARY row to the wraith type", () => {
	const area = buildStatArea(makeActor(wod.splat.wraith), makeStat({
		id: "corpus", label: "wod.advantages.corpus", max: 10, permanent: 8, temporary: 3,
		usepermanent: true, usetemporary: true
	}));
	assert.equal(area.splattemporary, wod.sheettype.wraith);
	assert.equal(area.splat, wod.sheettype.mortal, "the banner and permanent row must stay mortal");
});

check("a renown stat moves to the werewolf type", () => {
	const area = buildStatArea(makeActor(wod.splat.werewolf), makeStat({
		id: "glory", label: "wod.advantages.renown.glory", group: "renown", max: 10, usepermanent: true
	}));
	assert.equal(area.splat, wod.sheettype.werewolf);
	assert.equal(area.rank, "", "only the `rank` stat carries a rank name");
});

check("the rank stat carries GetShifterRank's answer, not markup", () => {
	const area = buildStatArea(makeActor(wod.splat.werewolf, "Adren"), makeStat({
		id: "rank", label: "wod.advantages.renown.rank", group: "renown", max: 5, usepermanent: true
	}));
	assert.equal(area.rank, "Adren");
});

check("changeling willpower marks exactly the top `imbalance` dots", () => {
	const area = buildStatArea(makeActor(wod.splat.changeling), makeStat({
		id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, imbalance: 3,
		usepermanent: true
	}));
	assert.equal(area.permanent.isimbalancerow, true);
	assert.deepEqual(
		area.permanent.steps.filter((s) => s.isimbalance).map((s) => s.index),
		[4, 5, 6],
		"the imbalanced dots are the last `imbalance` of the FILLED ones, zero-indexed"
	);
	assert.equal(area.permanent.imbalancetitle, localize("wod.advantages.imbalance"));
});

check("no other splat gets an imbalance row", () => {
	for (const splat of [wod.splat.mortal, wod.splat.mage, wod.splat.wraith]) {
		const area = buildStatArea(makeActor(splat), makeStat({
			id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, imbalance: 3,
			usepermanent: true
		}));
		assert.equal(area.permanent.isimbalancerow, false, `splat ${splat}`);
		assert.equal(area.permanent.steps.some((s) => s.isimbalance), false, `splat ${splat}`);
	}
});

check("data-state marks the spent temporary squares and nothing else", () => {
	const area = buildStatArea(makeActor(wod.splat.mortal), makeStat({
		id: "willpower", label: "wod.advantages.willpower", max: 6, temporary: 2, usetemporary: true
	}));
	assert.deepEqual(area.temporary.steps.map((s) => s.state), ["x", "x", "", "", "", ""]);
});

check("an unused row is absent from the data, not an empty one", () => {
	const area = buildStatArea(makeActor(wod.splat.mage), makeStat({
		id: "quintessence", label: "wod.advantages.quintessence", max: 20, temporary: 7, usetemporary: true
	}));
	assert.equal(area.permanent, null);
	assert.notEqual(area.temporary, null);
});

check("buildStatArea does not mutate the documents it is given", () => {
	const actor = makeActor(wod.splat.changeling);
	const stat = makeStat({
		id: "willpower", label: "wod.advantages.willpower", max: 10, permanent: 7, temporary: 4,
		imbalance: 3, useroll: true, usepermanent: true, usetemporary: true
	});
	const before = JSON.stringify(stat);
	buildStatArea(actor, stat);
	assert.equal(JSON.stringify(stat), before);
});

/* ------------------------------------------------------------------ */

console.log("");
if (failures.length > 0) {
	console.log(`stat-area identity harness FAILED: ${failures.length} failing, ${checks - failures.length} passing`);
	console.log(`  first failing: ${failures[0]}`);
	process.exit(1);
}
console.log(`stat-area identity harness OK: ${checks} checks passing over ${FIXTURES.length} fixtures x ${SHOWBANNER_MODES.length} banner modes`);
