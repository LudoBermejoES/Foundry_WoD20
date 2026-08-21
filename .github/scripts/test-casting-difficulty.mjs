#!/usr/bin/env node
/**
 * add-paradox-system tasks 4/5.2/5.3 — the Sphere-casting difficulty chain must be importable and
 * tested, because it used to live entirely inside `Rote`, a class in `dialog-aretecasting.js`, a
 * file that `extends FormApplication` at module load and therefore cannot be imported by `node`
 * outside a Foundry runtime.
 *
 * WHY THIS EXISTS
 * ---------------
 * This is the arithmetic that governs EVERY magic roll at the table: the base difficulty from the
 * highest Sphere involved, the ±3 modifier band, the [lowestDifficulty, 10] cap, and the
 * excess-over-10-becomes-required-successes conversion (`core:17703`). None of it had a single
 * test before `module/scripts/casting-difficulty-helpers.js` existed. `js-syntax-check.sh` proves
 * the file parses, nothing more; no other gate here executes the dice-pool maths at all.
 *
 * WHAT IT CHECKS
 * --------------
 * A. `highestSelectedSphereRank()` — the maximum of the selected Spheres, never their sum
 *    (`core:19575`), including the dialog's own initial `[]` shape and the empty-selection case.
 * B. `capDifficultyToRollable()` — the `[lowestDifficulty, 10]` cap and the 1:1 excess-to-successes
 *    conversion, in both directions.
 * C. `computeCastingDifficulty()` — the full chain: base difficulty by Effect type (coincidental
 *    `E↑+3`, vulgar without witnesses `E↑+4`, vulgar with witnesses `E↑+5`), witnesses doing
 *    NOTHING on a coincidental Effect, the ±3 band around the BASE (not around 0, not around the
 *    final cap), `ignoreSphereBaseDifficulty`, and the `null` "leave everything untouched" result
 *    when no rank/spelltype is resolvable.
 * D. `Rote._highestRank()`/`Rote._setDifficulty()` in `dialog-aretecasting.js` actually DELEGATE to
 *    the helpers above, read from source — a hand-copy of the same arithmetic back into the dialog
 *    would pass every arithmetic check above while silently reintroducing the untestable duplicate.
 * E. task 4.2's single-source-of-truth cap: `_castSpell`'s excess-over-10 conversion calls the same
 *    `capDifficultyToRollable()`, not a second hand-written `> 10` / `< lowestDifficulty` pair.
 * F. the two dialogs' difficulty values do not diverge — `dialog-casting.js` documents
 *    `object.shownDifficulty` as authoritative for display, `_castSpell` (inherited unchanged by
 *    `DialogCasting`) rolls against `object.totalDifficulty` after its own cap. Both are now driven
 *    by the same `capDifficultyToRollable()` call over the same pre-cap `totalDifficulty`, so they
 *    agree BY CONSTRUCTION rather than by execution order — this section proves that equality
 *    numerically over a matrix of cases, not just by reading the source.
 *
 * Runnable locally: node .github/scripts/test-casting-difficulty.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	highestSelectedSphereRank,
	capDifficultyToRollable,
	computeCastingDifficulty
} from "../../module/scripts/casting-difficulty-helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIALOG_PATH = path.join(ROOT, "module", "dialogs", "dialog-aretecasting.js");
const src = fs.readFileSync(DIALOG_PATH, "utf8");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* ============================================================================================ */
/* A. highestSelectedSphereRank — max, never sum                                                */
/* ============================================================================================ */

check("A1 the max of several selected Spheres wins, not the sum",
	highestSelectedSphereRank({ correspondence: 4, life: 3 }) === 4);

check("A2 order of insertion does not matter",
	highestSelectedSphereRank({ life: 3, correspondence: 4 }) === 4);

check("A3 a single selected Sphere returns its own rank",
	highestSelectedSphereRank({ time: 4 }) === 4);

check("A4 an empty selection (the dialog's own initial []) returns -1",
	highestSelectedSphereRank([]) === -1 && highestSelectedSphereRank({}) === -1);

check("A5 zero and negative ranks are ignored, never treated as a real selection",
	highestSelectedSphereRank({ life: 0, mind: -1 }) === -1);

check("A6 string ranks (as item data supplies) compare correctly against numbers",
	highestSelectedSphereRank({ life: "2", mind: 4 }) === 4 &&
	highestSelectedSphereRank({ life: 4, mind: "2" }) === 4);

/* ============================================================================================ */
/* B. capDifficultyToRollable — the [lowestDifficulty, 10] cap + 1:1 excess conversion           */
/* ============================================================================================ */

check("B1 a difficulty inside the band is left untouched, no extra successes",
	JSON.stringify(capDifficultyToRollable(7, 2)) === JSON.stringify({ difficulty: 7, extraSuccesses: 0 }));

check("B2 12 caps to 10 and demands 2 extra successes (core:17703)",
	JSON.stringify(capDifficultyToRollable(12, 2)) === JSON.stringify({ difficulty: 10, extraSuccesses: 2 }));

check("B3 exactly 10 needs no extra successes",
	JSON.stringify(capDifficultyToRollable(10, 2)) === JSON.stringify({ difficulty: 10, extraSuccesses: 0 }));

check("B4 below lowestDifficulty floors to it, with no extra successes",
	JSON.stringify(capDifficultyToRollable(1, 2)) === JSON.stringify({ difficulty: 2, extraSuccesses: 0 }));

check("B5 exactly lowestDifficulty is left untouched",
	JSON.stringify(capDifficultyToRollable(2, 2)) === JSON.stringify({ difficulty: 2, extraSuccesses: 0 }));

/* ============================================================================================ */
/* C. computeCastingDifficulty — the full chain                                                 */
/* ============================================================================================ */

const baseArgs = {
	rank: 3,
	spelltype: "coincidental",
	witnesses: false,
	ignoreSphereBaseDifficulty: false,
	manualBaseDifficulty: -1,
	sumSelectedDifficulty: 0,
	difficultyModifier: 0,
	quintessence: 0,
	lowestDifficulty: 2
};

check("C1 coincidental base difficulty is E↑+3",
	computeCastingDifficulty(baseArgs).baseDifficulty === 6);

check("C2 vulgar without witnesses is E↑+4",
	computeCastingDifficulty({ ...baseArgs, spelltype: "vulgar", witnesses: false }).baseDifficulty === 7);

check("C3 vulgar with witnesses is E↑+5",
	computeCastingDifficulty({ ...baseArgs, spelltype: "vulgar", witnesses: true }).baseDifficulty === 8);

check("C4 witnesses change NOTHING on a coincidental Effect (spec scenario: rank 3, 6 either way)",
	computeCastingDifficulty({ ...baseArgs, witnesses: false }).baseDifficulty === 6 &&
	computeCastingDifficulty({ ...baseArgs, witnesses: true }).baseDifficulty === 6);

check("C5 modifiers within the ±3 band apply as-is",
	computeCastingDifficulty({ ...baseArgs, sumSelectedDifficulty: 2 }).totalDifficulty === 8);

check("C6 the +3 ceiling is around the BASE, not around 0 (spec scenario: base 8, net -7 -> floors at 5)",
	(() => {
		const args = { ...baseArgs, rank: 5, sumSelectedDifficulty: -7 }; // base = 5+3 = 8
		const result = computeCastingDifficulty(args);
		return result.baseDifficulty === 8 && result.totalDifficulty === 5;
	})());

check("C7 the +3 band also caps upward (base 6, net +10 -> floors at 9, not 16)",
	(() => {
		const result = computeCastingDifficulty({ ...baseArgs, sumSelectedDifficulty: 10 });
		return result.baseDifficulty === 6 && result.totalDifficulty === 9;
	})());

check("C8 shownDifficulty caps to 10 when totalDifficulty exceeds it (base+3 alone can, e.g. rank 9)",
	(() => {
		// base = 9 (coincidental rank 9) + no modifiers -> totalDifficulty 9, still under 10; push it
		// over via the modifier band instead: base = 6, +3 band tops out at 9 which is still <= 10, so
		// use vulgar-with-witnesses at rank 9 -> base 14, well past 10 even before the +3 band.
		const result = computeCastingDifficulty({ ...baseArgs, rank: 9, spelltype: "vulgar", witnesses: true });
		return result.baseDifficulty === 14 && result.totalDifficulty === 14 && result.shownDifficulty === 10;
	})());

check("C9 shownDifficulty floors to lowestDifficulty (base 3, -3 band -> 0, floored to 2)",
	(() => {
		const result = computeCastingDifficulty({ ...baseArgs, rank: 0, sumSelectedDifficulty: -3, lowestDifficulty: 2 });
		// rank 0 is not > -1 by strict rule below zero-check; use rank 0 explicitly disallowed by the
		// "rank > -1" gate only excludes -1, so rank 0 is valid input (a caller would not normally pass
		// 0, but the helper does not forbid it) -> base = 0+3 = 3.
		return result.baseDifficulty === 3 && result.totalDifficulty === 0 && result.shownDifficulty === 2;
	})());

check("C10 ignoreSphereBaseDifficulty uses the manual base difficulty, not the Sphere-derived one",
	(() => {
		const result = computeCastingDifficulty({ ...baseArgs, ignoreSphereBaseDifficulty: true, manualBaseDifficulty: 5, rank: 9, spelltype: "vulgar", witnesses: true });
		return result.baseDifficulty === 5 && result.totalDifficulty === 5;
	})());

check("C11 no rank and no override returns null (the \"leave everything untouched\" case)",
	computeCastingDifficulty({ ...baseArgs, rank: -1 }) === null);

check("C12 an unrecognised/empty spelltype with a real rank also returns null",
	computeCastingDifficulty({ ...baseArgs, spelltype: "" }) === null);

check("C13 ignoreSphereBaseDifficulty with no manual base set yet (-1) still returns null",
	computeCastingDifficulty({ ...baseArgs, ignoreSphereBaseDifficulty: true, manualBaseDifficulty: -1 }) === null);

/* ============================================================================================ */
/* D. Rote._highestRank / Rote._setDifficulty must DELEGATE, read from source                   */
/* ============================================================================================ */

check("D1 casting-difficulty-helpers.js is imported by the dialog",
	/import \{[\s\S]*?highestSelectedSphereRank[\s\S]*?computeCastingDifficulty[\s\S]*?capDifficultyToRollable[\s\S]*?\} from "\.\.\/scripts\/casting-difficulty-helpers\.js";/.test(src));

const highestRankBody = src.match(/_highestRank\(\) \{[\s\S]*?\n {4}\}/);
check("D2 _highestRank() was located in source", highestRankBody !== null);
check("D3 _highestRank() delegates to the helper, does not reimplement the loop",
	!!highestRankBody && /return highestSelectedSphereRank\(this\.selectedSpheres\);/.test(highestRankBody[0]) &&
	!/for \(const sphere in this\.selectedSpheres\)/.test(highestRankBody[0]));

const setDifficultyBody = src.match(/_setDifficulty\(rank\) \{[\s\S]*?\n {4}\}/);
check("D4 Rote._setDifficulty(rank) was located in source", setDifficultyBody !== null);
check("D5 Rote._setDifficulty delegates to computeCastingDifficulty(), does not reimplement the branches",
	!!setDifficultyBody &&
	/computeCastingDifficulty\(\{/.test(setDifficultyBody[0]) &&
	!/parseInt\(rank\) \+ 5/.test(setDifficultyBody[0]) &&
	!/parseInt\(rank\) \+ 4/.test(setDifficultyBody[0]) &&
	!/parseInt\(rank\) \+ 3/.test(setDifficultyBody[0]));

check("D6 Rote._setDifficulty still returns -1 on the null path (source-level, not just behaviourally)",
	!!setDifficultyBody && /if \(result === null\) \{\s*\n\s*return -1;/.test(setDifficultyBody[0]));

/* ============================================================================================ */
/* E. task 4.2 — the excess-over-10 conversion in _castSpell shares the SAME cap function        */
/* ============================================================================================ */

const castSpellBody = src.match(/async _castSpell\(event\) \{[\s\S]*?\n {4}\}\n/);
check("E1 _castSpell(event) was located in source", castSpellBody !== null);

check("E2 _castSpell calls capDifficultyToRollable, not a hand-written duplicate of the cap",
	!!castSpellBody && /capDifficultyToRollable\(this\.object\.totalDifficulty, CONFIG\.worldofdarkness\.lowestDifficulty\)/.test(castSpellBody[0]));

check("E3 _castSpell no longer contains its own `totalDifficulty > 10` clamp (moved into the helper)",
	!!castSpellBody && !/this\.object\.totalDifficulty > 10/.test(castSpellBody[0]));

check("E4 _castSpell no longer contains its own `totalDifficulty < lowestDifficulty` clamp",
	!!castSpellBody && !/this\.object\.totalDifficulty < CONFIG\.worldofdarkness\.lowestDifficulty/.test(castSpellBody[0]));

check("E5 _castSpell still assigns the capped value back onto totalDifficulty before rolling",
	!!castSpellBody && /this\.object\.totalDifficulty = cappedDifficulty\.difficulty;/.test(castSpellBody[0]));

check("E6 the roll itself still reads powerRoll.difficulty from object.totalDifficulty",
	!!castSpellBody && /powerRoll\.difficulty = parseInt\(this\.object\.totalDifficulty\);/.test(castSpellBody[0]));

/* ============================================================================================ */
/* F. dialog-casting.js's shownDifficulty vs _castSpell's rolled totalDifficulty must agree      */
/* ============================================================================================ */

const CASTING_DIALOG_PATH = path.join(ROOT, "module", "dialogs", "dialog-casting.js");
const castingSrc = fs.readFileSync(CASTING_DIALOG_PATH, "utf8");

check("F1 dialog-casting.js documents shownDifficulty as authoritative for display",
	/difficulty: this\.object\.shownDifficulty,/.test(castingSrc));

check("F2 DialogCasting does not override _castSpell (the roll stays on ONE code path)",
	!/_castSpell\s*\(/.test(castingSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

// Numerically: for a matrix of cases, the display value (shownDifficulty from computeCastingDifficulty)
// must equal what _castSpell ends up rolling (capDifficultyToRollable applied again to the SAME
// pre-cap totalDifficulty). This is the concordance the spec requires be pinned by a test — it now
// holds BY CONSTRUCTION (both derive from the same capDifficultyToRollable), not by execution order,
// which this section proves numerically rather than merely asserting from source.
const concordanceCases = [
	{ ...baseArgs },
	{ ...baseArgs, spelltype: "vulgar", witnesses: true },
	{ ...baseArgs, rank: 9, spelltype: "vulgar", witnesses: true }, // pushes totalDifficulty past 10
	{ ...baseArgs, rank: 0, sumSelectedDifficulty: -3 },            // pushes totalDifficulty below lowestDifficulty
	{ ...baseArgs, ignoreSphereBaseDifficulty: true, manualBaseDifficulty: 7 }
];

let concordanceOk = true;
for (const args of concordanceCases) {
	const computed = computeCastingDifficulty(args);
	if (computed === null) {
		concordanceOk = false;
		continue;
	}
	const displayValue = computed.shownDifficulty;
	const rolledValue = capDifficultyToRollable(computed.totalDifficulty, args.lowestDifficulty).difficulty;
	if (displayValue !== rolledValue) {
		concordanceOk = false;
	}
}
check("F3 shownDifficulty (dialog-casting.js's authoritative display value) equals what _castSpell rolls, across 5 cases", concordanceOk);

console.log("test-casting-difficulty.mjs");
for (const line of results) console.log(line);

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
