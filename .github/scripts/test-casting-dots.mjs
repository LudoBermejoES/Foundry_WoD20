#!/usr/bin/env node
/**
 * The "Esferas disponibles" dot counter must not depend on `getData()`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Written 2026-08-20 with the fix it guards. `DialogAreteCasting._setupDotCounters()` read its data
 * from `this.getData()`. That was correct until `add-prism-of-focus-foundry` made `getData()`
 * **async**, at which point the call returned a `Promise`: `data.object` was `undefined`, the
 * optional chain short-circuited, and no dot was ever given the `active` class. Nothing threw and
 * nothing logged.
 *
 * The symptom was a loop rather than a blank panel, which is why it read as "the sphere dots don't
 * fill in properly" instead of as a crash: `_onDotSphereChange()` ends in `this.render()`, so every
 * click re-emitted the dots inactive and this counter — whose only job is restoring the selection
 * after a render — restored nothing. `this.object.selectedSpheres` and the difficulty maths stayed
 * correct underneath, so the dialog cast the right spell while showing the wrong dots.
 *
 * `fix-formula-casting` ran into the same wall and sidestepped it for its own rows only (hardcoding
 * `active` into the Fórmula branch of the template), leaving the improvised/legacy branches on the
 * broken counter. That is how the bug survived a change titled "Esferas disponibles fix", and it is
 * why this guard asserts on the COUNTER rather than on any one template branch.
 *
 * Why no other gate would catch it: the counter is not a `data-action`, not a template, not an i18n
 * key, not a selector and not a colour, so `binder-selector-check`/`template-structure-check`/
 * `label-length-check`/`v3-css-check` are all blind to it. `js-syntax-check` stays green because
 * `this.getData()` without `await` is valid JavaScript. The repo's own `tests/*.mjs` files are NOT
 * run by `deploy.yml` at all, so a test there would guard nothing.
 *
 * WHAT IT CHECKS
 * --------------
 * A. the real helper's arithmetic, imported (never reimplemented — hand-copied logic is what rots);
 * B. the counter is READ FROM SOURCE and must not call `getData()`, and must read
 *    `this.object.selectedSpheres` — the regression assertion. An `await this.getData()` would fix
 *    today's bug and re-arm tomorrow's, so it is rejected too.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { activeDotCount } from "../../module/scripts/casting-dot-helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIALOG = path.join(ROOT, "module", "dialogs", "dialog-aretecasting.js");
const src = fs.readFileSync(DIALOG, "utf8");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* ---- A. the helper's arithmetic ----------------------------------------- */

check("A1 a selected rank activates exactly that many dots",
	activeDotCount({ life: 3 }, "life") === 3);

check("A2 string values (item data) parse, not concatenate",
	activeDotCount({ life: "2" }, "life") === 2);

check("A3 an unselected Sphere activates nothing",
	activeDotCount({ life: 3 }, "mind") === 0);

check("A4 zero, negative and NaN all collapse to 0 — never NaN, never negative",
	activeDotCount({ a: 0 }, "a") === 0 &&
	activeDotCount({ a: -2 }, "a") === 0 &&
	activeDotCount({ a: "" }, "a") === 0 &&
	activeDotCount({ a: "n/a" }, "a") === 0);

// `selectedSpheres` is initialised as `[]` in the dialog, so the Array shape is real, not academic.
check("A5 tolerates the dialog's own initial empty-Array shape",
	activeDotCount([], "life") === 0);

check("A6 tolerates a missing selection object entirely",
	activeDotCount(undefined, "life") === 0 && activeDotCount(null, "life") === 0);

/* ---- B. the counter must not reach for getData() ------------------------ */

const counter = src.match(/_setupDotCounters\(html\) \{[\s\S]*?\n {4}\}/);
check("B1 _setupDotCounters(html) was located in source", counter !== null);

const body = counter ? counter[0] : "";

check("B2 the counter does NOT call getData() — the async trap that caused the bug",
	!/getData\s*\(/.test(body),
	body ? "" : "(cuerpo no localizado)");

check("B3 the counter reads this.object.selectedSpheres directly",
	/this\.object\?\.selectedSpheres|this\.object\.selectedSpheres/.test(body));

check("B4 the counter delegates the arithmetic to the guarded helper",
	/activeDotCount\s*\(/.test(body));

check("B5 the helper is actually imported by the dialog",
	/import \{ activeDotCount \} from "\.\.\/scripts\/casting-dot-helpers\.js";/.test(src));

// The click handler is what makes the counter load-bearing; if this render() ever goes away the
// guard above stops mattering and this file should be revisited rather than silently kept.
check("B6 _onDotSphereChange still ends in this.render() (why the counter is load-bearing)",
	/_onDotSphereChange\(event\) \{[\s\S]*?this\.render\(\);[\s\S]*?\n {4}\}/.test(src));

console.log("test-casting-dots.mjs");
for (const line of results) console.log(line);

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
