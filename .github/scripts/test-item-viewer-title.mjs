#!/usr/bin/env node
/**
 * Executes the REAL `resolveViewerTitle` from `module/applications/item-viewer.js` against the
 * document shapes this system actually ships, with the Foundry globals stubbed.
 *
 * WHY: reported 2026-08-04 — the eye on the row reading "Armas de Fuego" opened a window titled
 * `Firearms`. A template-seeded primary ability carries the ENGLISH `name` plus
 * `system.label = "wod.abilities.firearms"`; every surface that DISPLAYS the row localizes the
 * label, and the viewer was the one surface reading `name`. Fixed by preferring the localized
 * label, with a fallback when the key does not resolve — because a window titled
 * `wod.abilities.something` is worse than the English word.
 *
 * The three real lang keys used below are read from `lang/es.json` on disk rather than typed here,
 * so this cannot pass against a translation that has been removed.
 */
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
let checks = 0;
const failures = [];

function ok(cond, what) {
	checks += 1;
	if (cond) {
		console.log(`  ok   ${what}`);
	} else {
		failures.push(what);
		console.log(`  FAIL ${what}`);
	}
}

function eq(actual, expected, what) {
	ok(actual === expected, `${what} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

// --- the real lang table, read from disk -------------------------------------------------------
const es = JSON.parse(readFileSync(join(ROOT, "lang", "es.json"), "utf8"));
const flat = {};
(function walk(node, prefix) {
	for (const [k, v] of Object.entries(node)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
		else flat[path] = v;
	}
})(es, "");

// `lang/*.json` is NESTED, not flat dotted keys. A flat lookup returns undefined for every key
// and reads as "the translation is missing" — that exact mistake was made on 2026-08-03.
ok(Object.keys(flat).length > 100, `the nested lang table flattens to real keys (${Object.keys(flat).length})`);
const FIREARMS_KEY = "wod.abilities.firearms";
ok(typeof flat[FIREARMS_KEY] === "string" && flat[FIREARMS_KEY] !== "",
	`${FIREARMS_KEY} exists in lang/es.json -> ${JSON.stringify(flat[FIREARMS_KEY])}`);

// --- stub the Foundry globals the module touches at import time --------------------------------
globalThis.game = {
	i18n: {
		// Foundry's own contract: an unknown key is returned VERBATIM. The fallback depends on it.
		localize: (key) => (Object.prototype.hasOwnProperty.call(flat, key) ? flat[key] : key)
	}
};
globalThis.foundry = {
	applications: {
		api: {
			ApplicationV2: class {},
			HandlebarsApplicationMixin: (Base) => class extends Base {}
		}
	}
};
globalThis.Hooks = { on: () => {}, once: () => {} };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

// Copy `module/` next to a `{"type":"module"}` marker so Node parses the ES modules (this repo has
// no package.json, so Node would otherwise read them as CJS).
const tmp = mkdtempSync(join(tmpdir(), "wod-viewer-title-"));
cpSync(join(ROOT, "module"), join(tmp, "module"), { recursive: true });
writeFileSync(join(tmp, "package.json"), JSON.stringify({ type: "module" }));
let resolveViewerTitle;
try {
	({ resolveViewerTitle } = await import(pathToFileURL(join(tmp, "module", "applications", "item-viewer.js")).href));
} finally {
	// keep tmp until after import; removed at exit below
}
ok(typeof resolveViewerTitle === "function", "resolveViewerTitle is exported from the real module");

// --- A. the reported defect --------------------------------------------------------------------
console.log("\nA. the reported defect: a primary ability titled in English");
eq(resolveViewerTitle({ name: "Firearms", system: { label: FIREARMS_KEY } }),
	flat[FIREARMS_KEY],
	"a template-seeded primary shows its LOCALIZED label, not its English name");
ok(resolveViewerTitle({ name: "Firearms", system: { label: FIREARMS_KEY } }) !== "Firearms",
	"and specifically not 'Firearms'");

// --- B. a secondary ability, whose label is already display text -------------------------------
console.log("\nB. a secondary ability's label is display text, not a key");
eq(resolveViewerTitle({ name: "Arte", system: { label: "Arte" } }), "Arte",
	"the live Arte Trait keeps saying Arte");
eq(resolveViewerTitle({ name: "Nueva Habilidad secundaria", system: { label: "Hipertecnología" } }),
	"Hipertecnología",
	"a renamed secondary follows its label, not the stale placeholder name");

// --- C. the fallback, which is the whole reason this is not a one-liner ------------------------
console.log("\nC. an unresolved key must NOT become the title");
eq(resolveViewerTitle({ name: "Firearms", system: { label: "wod.abilities.doesnotexist" } }),
	"Firearms",
	"an unresolved wod.* key falls back to the name");
ok(!resolveViewerTitle({ name: "Firearms", system: { label: "wod.abilities.doesnotexist" } }).startsWith("wod."),
	"a window is never titled with a raw i18n key");

// --- D. documents with no label at all --------------------------------------------------------
console.log("\nD. documents that have no system.label");
eq(resolveViewerTitle({ name: "Contactos", system: {} }), "Contactos",
	"a Feature (Background/Merit) falls through to its name");
eq(resolveViewerTitle({ name: "Fuerza", system: { label: "" } }), "Fuerza",
	"an empty label falls through");
eq(resolveViewerTitle({ name: "Celeridad", system: { label: null } }), "Celeridad",
	"a null label falls through");
eq(resolveViewerTitle({ name: "Correspondencia" }), "Correspondencia",
	"a document with no system object at all falls through");

// --- E. degrades instead of throwing ----------------------------------------------------------
console.log("\nE. never throws");
eq(resolveViewerTitle(undefined), "", "an absent document gives an empty title, not an exception");
eq(resolveViewerTitle(null), "", "a null document gives an empty title");
eq(resolveViewerTitle({}), "", "an empty object gives an empty title");
eq(resolveViewerTitle({ name: "X", system: { label: 42 } }), "X",
	"a non-string label falls through rather than being localized");

// --- F. THE WIRING, which is what this harness missed the first time -------------------------
// Reported 2026-08-05: the window bar already read "Alerta" while the `<h1>` inside the body read
// "ALERTNESS". Sections A-E all passed, because they exercise `resolveViewerTitle` in ISOLATION
// and the defect was that `_prepareContext` never called it. A harness that proves a function is
// correct proves nothing about whether the surface a reader looks at goes through it. So this
// section asserts the CHAIN, by reading the shipped source rather than trusting either end:
//   doc -> resolveViewerTitle -> get title()      (the window bar)
//   doc -> resolveViewerTitle -> context.name -> {{name}} in the .hbs   (the body heading)
console.log("\nF. every surface a reader sees routes through the ONE resolver");
const src = readFileSync(join(ROOT, "module", "applications", "item-viewer.js"), "utf8");
const hbs = readFileSync(join(ROOT, "templates", "dialogs", "item-viewer.hbs"), "utf8");

const titleBody = src.slice(src.indexOf("get title()"), src.indexOf("get title()") + 160);
ok(/return\s+resolveViewerTitle\(/.test(titleBody),
	"the window bar (`get title()`) returns resolveViewerTitle(...)");

const nameAssign = src.match(/context\.name\s*=\s*([^\n;]+)/);
ok(!!nameAssign, "`context.name` is assigned exactly once and findable");
ok(/resolveViewerTitle\(/.test(nameAssign?.[1] ?? ""),
	`the body heading's context.name comes from resolveViewerTitle (got \`${(nameAssign?.[1] ?? "").trim()}\`)`);
ok(!/^\s*doc\??\.name/.test(nameAssign?.[1] ?? ""),
	"and NOT from doc.name directly — the exact regression reported on 2026-08-05");

// The template is the last link: if the heading stopped rendering `{{name}}`, pinning
// `context.name` would guard a field nobody reads.
ok(/<h1[^>]*>\s*\{\{\s*name\s*\}\}\s*<\/h1>/.test(hbs),
	"the .hbs body heading renders {{name}}, so the pinned context field is the one on screen");
ok(!/\{\{\s*(doc|item|viewedDocument)\.name\s*\}\}/.test(hbs),
	"and the template never reaches around the context for a raw document name");

rmSync(tmp, { recursive: true, force: true });

console.log("");
if (failures.length) {
	console.error(`item-viewer title harness FAILED: ${failures.length} of ${checks} check(s)`);
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
console.log(`item-viewer title harness OK: ${checks} checks passing`);
