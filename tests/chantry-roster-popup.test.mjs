/**
 * add-chantry-roster-discoverability — the CENSUS icon's click path, EXECUTED.
 *
 *     node --test tests/*.test.mjs             <- pass the GLOB. `node --test tests/` fails on
 *                                                 Node 25 and reads as a red suite.
 *     node tests/chantry-roster-popup.test.mjs <- this file alone
 *
 * WHY THIS FILE EXISTS ON TOP OF TWO GATES THAT ALREADY COVER THIS FEATURE
 * ------------------------------------------------------------------------
 * `test-part-render.mjs` renders the icon and counts it in both lock states; `test-chantry-trait-
 * eye.mjs` reads the binder's source and asserts its shape. Neither one ever CLICKS it. What is left
 * unexecuted by both is exactly the part a reader of the source cannot check by eye:
 *
 *   * that the popup body says something in the ACTIVE LANGUAGE rather than printing `wod.chantry.
 *     roster.empty` at a GM — the localisation is loaded from the real `lang/es.json` here, not
 *     stubbed to echo keys back;
 *   * that a GM-typed roster name containing `<` arrives as TEXT. The static gate proves the source
 *     contains an escaper; only running it proves the escaper works, and `ItemViewer` hands this
 *     string to `enrichHTML`;
 *   * that the empty and non-empty branches are the ones that fire, and that the figures printed are
 *     the ones `evaluateRosters` computes rather than the raw stored values.
 *
 * IT IS THE SHEET CLASS, NOT A COPY OF IT. The two methods under test are called on
 * `Object.create(ChantryActorSheetV2.prototype)` — the real class, never constructed, so no
 * ApplicationV2 lifecycle is stubbed and nothing here can drift from the shipped implementation the
 * way a re-implemented regex or a re-implemented builder would.
 *
 * The Foundry surface stubbed below is the SMALLEST set that lets that module (and its import
 * closure: `action-helpers.js`, `item-viewer.js`, `gear-lists.js`) load. If this list has to grow,
 * that is worth noticing rather than automating: it means the sheet reached for something new.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---- the real Spanish translations, flattened the way game.i18n does ---- */
const flat = {};
(function flatten(node, prefix) {
	for (const [key, value] of Object.entries(node)) {
		const full = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object") flatten(value, full);
		else flat[full] = value;
	}
})(JSON.parse(fs.readFileSync(path.join(ROOT, "lang", "es.json"), "utf8")), "");

/* ---- the minimum Foundry surface for the sheet module's import closure ---- */
globalThis.Hooks = { on() {}, once() {}, off() {}, call() {}, callAll() {} };
globalThis.Actor = class Actor {};
globalThis.Item = class Item {};
globalThis.Dialog = class Dialog { static confirm() {} };
// appv1 base classes: reached through `action-helpers.js` -> `dialog-bonus.js`/`dialog-item.js`,
// which still `extends FormApplication` at module scope. Nothing here calls them.
globalThis.FormApplication = class FormApplication { static get defaultOptions() { return {}; } };
globalThis.Application = class Application {};
globalThis.FilePicker = class FilePicker {};
globalThis.Handlebars = { registerHelper() {}, registerPartial() {} };
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
globalThis.game = {
	// The real localize returns the KEY when there is no translation, which is what makes the
	// "did this actually translate?" assertions below meaningful rather than tautological.
	i18n: { localize: (k) => flat[k] ?? String(k ?? ""), format: (k, d) => String(flat[k] ?? k ?? "").replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? "") },
	settings: { get: () => undefined },
	worldofdarkness: { icons: { chantry: {} } }
};
globalThis.CONFIG = { worldofdarkness: { chantry: { traitcost: {} } } };
globalThis.foundry = {
	utils: { deepClone: (o) => structuredClone(o), mergeObject: (a, b) => Object.assign({}, a, b) },
	applications: {
		api: {
			ApplicationV2: class ApplicationV2 { constructor() {} },
			DialogV2: class DialogV2 {},
			HandlebarsApplicationMixin: (Base) => class extends Base {}
		},
		sheets: { ActorSheetV2: class ActorSheetV2 { constructor() {} } },
		ux: {
			TextEditor: { implementation: { enrichHTML: async (s) => String(s ?? ""), getDragEventData: () => ({}) } },
			DragDrop: class DragDrop { bind() {} }
		}
	}
};

const ChantryActorSheetV2 = (await import(
	pathToFileURL(path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet-v2.js")).href)).default;
const ItemViewer = (await import(
	pathToFileURL(path.join(ROOT, "module", "applications", "item-viewer.js")).href)).default;

let failures = 0;
function test(name, fn) {
	try { fn(); console.log(`  ok - ${name}`); }
	catch (err) { failures++; console.error(`  FAIL - ${name}`); console.error(`    ${err.message}`); }
}

/** The real class, never constructed: only the two methods under test are exercised. */
function sheetFor(actorSystem) {
	const sheet = Object.create(ChantryActorSheetV2.prototype);
	sheet.actor = { uuid: "Actor.testchantry", system: actorSystem };
	return sheet;
}

/** A fake icon + root, shaped like the two properties the binder actually touches. */
function iconRoot(dataset) {
	const listeners = [];
	const icon = { dataset: { ...dataset }, addEventListener: (_type, fn) => listeners.push(fn) };
	return {
		icon,
		click: () => listeners.forEach((fn) => fn()),
		root: { querySelectorAll: (selector) => (selector === ".collapsible.button[data-rosterkey]" ? [icon] : []) }
	};
}

console.log("chantry census popup (chantry-actor-sheet-v2.js)");

/* ---- 1. the empty branch: the whole reason the icon exists ---- */

test("an empty census explains itself IN SPANISH and says how to add the first entry", () => {
	const body = sheetFor({})._rosterDescription({ entries: [], used: 0, allowed: 2, over: false });

	assert.match(body, /Puntos<\/strong>|Puntos: 0 \/ 2/, "the points line is missing");
	assert.ok(body.includes("0 / 2"), `the figures are not printed: ${body}`);
	assert.ok(!body.includes("wod.chantry.roster"), `an unresolved i18n key reached the popup: ${body}`);
	assert.ok(body.includes(flat["wod.chantry.roster.empty"]), "the explanatory empty text is missing");
	// It has to name the ROUTE, not just the concept — that is the half a tooltip could not carry.
	assert.match(body, /desbloquea/i, "the empty text does not say to unlock the sheet");
	assert.ok(!body.includes("<ul>"), "an empty census rendered a list");
});

/* ---- 2. the non-empty branch, and the figures come from evaluateRosters ---- */

test("a populated census lists its entries with the points each consumes", () => {
	const body = sheetFor({})._rosterDescription({
		entries: [{ name: "Nadia", note: "contacto en el puerto", points: 1 },
			{ name: "Copia del Codex", note: "", points: 0 }],
		used: 1, allowed: 2, over: false
	});

	assert.ok(body.includes("<ul>"), "no list rendered");
	assert.ok(body.includes("Nadia"), "an entry name is missing");
	assert.ok(body.includes("contacto en el puerto"), "an entry note is missing");
	assert.ok(body.includes("Copia del Codex"), "the 0-point entry is missing");
	assert.ok(!body.includes(flat["wod.chantry.roster.empty"]), "the empty text rendered alongside entries");
	assert.ok(!body.includes(flat["wod.chantry.roster.over"]), "the over-budget warning rendered for a census within budget");
});

test("an over-budget census carries the warning the row's own flag carries", () => {
	const body = sheetFor({})._rosterDescription({
		entries: [{ name: "Nadia", note: "", points: 3 }], used: 3, allowed: 2, over: true
	});
	assert.ok(body.includes(flat["wod.chantry.roster.over"]), "the over-budget sentence is missing");
});

/* ---- 3. escaping: the only place this sheet builds HTML from GM-typed strings ---- */

test("a GM-typed name containing markup arrives as TEXT (ItemViewer runs this through enrichHTML)", () => {
	const body = sheetFor({})._rosterDescription({
		entries: [{ name: '<img src=x onerror="alert(1)">', note: "a & b", points: 1 }],
		used: 1, allowed: 1, over: false
	});

	assert.ok(!body.includes("<img"), `raw markup survived into the popup body: ${body}`);
	assert.ok(body.includes("&lt;img"), "the name was not escaped");
	assert.ok(body.includes("a &amp; b"), "the ampersand in the note was not escaped");
});

/* ---- 4. the click path, end to end ---- */

test("clicking the icon opens ONE ItemViewer, titled with the localized Trait, namespaced ChantryRoster", () => {
	const opened = [];
	const realOpen = ItemViewer.open;
	ItemViewer.open = (doc) => { opened.push(doc); return null; };

	try {
		const sheet = sheetFor({
			traits: { allies: 2 },
			traitRosters: { allies: [{ name: "Nadia", note: "", points: 1 }] }
		});
		const { root, click } = iconRoot({ rosterkey: "allies", labelkey: "wod.chantry.traits.allies" });

		sheet._bindTraitRosterButtons(root);
		click();

		assert.equal(opened.length, 1, `expected one window, got ${opened.length}`);
		const doc = opened[0];
		assert.equal(doc.uuid, "Actor.testchantry.ChantryRoster.allies",
			"the uuid is not namespaced per actor + ChantryRoster, so two Chantries would share one window");
		assert.equal(doc.name, `${flat["wod.chantry.roster.headline"]}: ${flat["wod.chantry.traits.allies"]}`);
		assert.ok(!doc.name.includes("wod."), `the window title carries an unresolved key: ${doc.name}`);
		assert.ok(doc.system.description.includes("Nadia"), "the popup does not show the stored entry");
		// The figures are LIVE: allies is 2 circles and one 1-point entry is booked against them.
		assert.ok(doc.system.description.includes("1 / 2"), `expected the computed 1 / 2: ${doc.system.description}`);
	}
	finally { ItemViewer.open = realOpen; }
});

test("the binder stamps what it binds, so a re-render cannot double-bind an icon", () => {
	const sheet = sheetFor({ traits: {}, traitRosters: {} });
	const { icon, root, click } = iconRoot({ rosterkey: "allies", labelkey: "wod.chantry.traits.allies" });

	sheet._bindTraitRosterButtons(root);
	assert.equal(icon.dataset.collapseBound, "true", "the icon was not stamped");

	const opened = [];
	const realOpen = ItemViewer.open;
	ItemViewer.open = (doc) => { opened.push(doc); return null; };
	try {
		sheet._bindTraitRosterButtons(root);   // a second render over the same element
		click();
		assert.equal(opened.length, 1, `a re-render double-bound the icon: ${opened.length} windows for one click`);
	}
	finally { ItemViewer.open = realOpen; }
});

test("a key outside the eight rostered Traits opens nothing (the same guard every roster handler applies)", () => {
	const opened = [];
	const realOpen = ItemViewer.open;
	ItemViewer.open = (doc) => { opened.push(doc); return null; };
	try {
		const sheet = sheetFor({ traits: { "reality-zone": 3 }, traitRosters: {} });
		const { root, click } = iconRoot({ rosterkey: "reality-zone", labelkey: "wod.chantry.traits.reality-zone" });
		sheet._bindTraitRosterButtons(root);
		click();
		assert.equal(opened.length, 0, "a magnitude Trait opened a census window");
	}
	finally { ItemViewer.open = realOpen; }
});

test("no icon in the render means no listener and no throw", () => {
	const sheet = sheetFor({ traits: {}, traitRosters: {} });
	assert.doesNotThrow(() => sheet._bindTraitRosterButtons({ querySelectorAll: () => [] }));
	assert.doesNotThrow(() => sheet._bindTraitRosterButtons({}));
});

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll chantry census popup tests passed.");
process.exit(failures ? 1 : 0);
