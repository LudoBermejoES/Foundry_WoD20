#!/usr/bin/env node
/**
 * An ApplicationV2 constructor must not treat its first argument as the document.
 *
 * WHY THIS EXISTS
 * ---------------
 * Written 2026-08-24, the day it shipped. `chantry-actor-sheet-v2.js` was migrated from appv1 to
 * `HandlebarsApplicationMixin(ActorSheetV2)` and its constructor came across verbatim:
 *
 *     constructor(actor, options) { super(actor, options); this.locked = actor.system.locked }
 *
 * An ApplicationV2 constructor receives ONE object - the options - and the document arrives on it
 * as `options.document`. So `actor.system` is undefined and it threw INSIDE THE CONSTRUCTOR:
 * `get sheet` blew up straight out of the actor directory's click handler and the sheet could not
 * be built at all. Not subtle - completely unopenable in 7.5.128.
 *
 * All 31 preflight gates passed it. None of them CONSTRUCTS a sheet class: they read templates,
 * i18n, selectors, CSS and module logic against stubs, so a runtime shape mismatch is invisible to
 * every one of them.
 *
 * NOTE ON WHAT THIS CHECKS, because the obvious rule is WRONG. The first draft flagged any
 * two-positional-argument constructor as "the appv1 shape" - and immediately failed
 * `pc-actor-sheet.js`, which is appv2, declares `constructor(actor, options)`, and works in
 * production every day. Reading it explains why: line 67 is `actor.document.system.settings.era`.
 * The parameter is MISNAMED `actor`; it holds the options, and that code correctly goes through
 * `.document`. Arity is a red herring, and a gate built on it would have demanded a "fix" to
 * working code.
 *
 * The real defect is dereferencing the first parameter AS IF it were the document. `<first>.system`
 * is the unambiguous case: the options object never carries `system`, so it is always a mistake and
 * always fatal.
 *
 *     node .github/scripts/test-appv2-constructor-signature.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "module", "actor", "template");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

let appv2Seen = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".js"))) {
	const src = fs.readFileSync(path.join(DIR, f), "utf8");

	const isAppV2 = /extends\s+(?:\w+\()?foundry\.applications\.[\w.]*(?:ApplicationV2|SheetV2)/.test(src);
	if (!isAppV2) continue;
	appv2Seen++;

	const ctor = src.match(/^\s*constructor\s*\(([^)]*)\)/m);
	if (!ctor) {
		check(`${f} declares no constructor (inherits appv2's)`, true);
		continue;
	}

	const params = ctor[1].split(",").map((s) => s.trim()).filter(Boolean);
	const first = (params[0] ?? "").replace(/^\.\.\./, "").split(/[=:\s]/)[0];
	const body = src.slice(src.indexOf(ctor[0]) + ctor[0].length, src.indexOf(ctor[0]) + 4000);

	const bad = first ? new RegExp(`(?<!\\.document)\\b${first}\\.system\\b`).test(body) : false;

	check(
		`${f} constructor does not read \`${first || "<arg>"}.system\` off the options object`,
		!bad,
		bad ? "(appv2 passes options, not the document - go through .document)" : "",
	);
}

check("at least one ApplicationV2 sheet was found to check", appv2Seen > 0, `(found ${appv2Seen})`);

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
