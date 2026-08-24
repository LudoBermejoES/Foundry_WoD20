#!/usr/bin/env node
/**
 * polish-chantry-sheet — the Chantry/Construct sheet's fourteen construction Traits used to list
 * in `CONFIG.worldofdarkness.chantry.traitcost`'s insertion order, which reads "Aliados, Arcano,
 * Refuerzos..." once a human reads the localized Spanish labels on screen - not alphabetical, even
 * though it looks deliberate on the page. `getData()` sorted the list by each Trait's LOCALIZED
 * label in the active language, via `localeCompare(..., CONFIG.language || undefined)`.
 *
 * rebuild-chantry-sheet-v2 REPLACES the appv1 `ChantryActorSheet`/`getData()` with the
 * ApplicationV2 `ChantryActorSheetV2`/`_prepareContext()` (`module/actor/template/
 * chantry-actor-sheet-v2.js`). Task 1.5 required the sort call's shape to be preserved VERBATIM
 * across that port for exactly this reason: this gate extracts the REAL comparator out of whichever
 * file the sheet's context-preparer now lives in and EXECUTES it, rather than re-implementing it
 * blind, so a verbatim port keeps passing unchanged and a regressed one fails the same way it always
 * would have.
 *
 * WHAT IT ASSERTS, statically AND by executing the REAL comparator
 * ------------------------------------------------------------------
 * A. `_prepareContext()` actually calls `.sort()` on `traitlist`, in the function body, BEFORE it
 *    is assigned to `data.listData.traits`.
 * B. The comparator text is extracted from the REAL source and executed against the REAL fourteen
 *    Trait keys and the REAL localized labels from `lang/es.json`/`lang/en.json`, in BOTH
 *    languages:
 *      B1 - the resulting order is genuinely alphabetical by the LOCALIZED label in that language
 *      B2 - the resulting order DIFFERS from the raw `traitcost` key insertion order
 *      B3 - the comparator is passed a real locale argument (not the two-argument, locale-naive
 *           form), by executing it once with a spy `localeCompare` that records its own `arguments`
 *
 *     node .github/scripts/test-chantry-trait-order.mjs
 *
 * PROVEN TO FAIL (polish-chantry-sheet task 6.5, recorded rather than re-run every time): with the
 * `.sort(...)` call commented out, check A fails immediately; with the comparator's locale argument
 * removed, B3 fails. Both proofs were against the appv1 file this gate no longer targets; the
 * extraction-and-execute methodology is identical against the new file, so the same defect classes
 * are still caught the same way.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

const sheetJsPath = path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet-v2.js");
const sheetJsSrc = fs.readFileSync(sheetJsPath, "utf8");

// Strip `//` line comments before matching, line by line - see the appv1-era version of this gate
// for why (a commented-out sort call must not read as present).
const sheetJsNoLineComments = sheetJsSrc
	.split("\n")
	.map(line => line.replace(/\/\/.*$/, ""))
	.join("\n");

/* ---- A. the sort call exists, and sits before the traitlist is handed to data.listData ---- */

const sortCallMatch = sheetJsNoLineComments.match(/traitlist\.sort\(\(a,\s*b\)\s*=>([\s\S]*?)\);/);
const sortIdx = sortCallMatch ? sheetJsSrc.indexOf(sortCallMatch[0].split("\n")[0]) : -1;
const listDataIdx = sheetJsSrc.indexOf("data.listData = { traits: traitlist }");

check("A0 _prepareContext() calls traitlist.sort((a, b) => ...)", sortCallMatch !== null);

check("A1 the sort happens BEFORE traitlist is assigned to data.listData (not after / not dead code)",
	sortIdx !== -1 && listDataIdx !== -1 && sortIdx < listDataIdx);

if (!sortCallMatch) {
	console.log(results.join("\n"));
	console.log(`\n${failed} FAILURE(S)`);
	process.exit(1);
}

/* ---- B. execute the REAL comparator against the REAL keys and REAL localized labels ---- */

const { wod } = await import(pathToFileURL(path.join(ROOT, "module", "config.js")).href);
const traitKeys = Object.keys(wod.chantry.traitcost);

const comparatorBody = sortCallMatch[1].trim();

for (const lang of ["es", "en"]) {
	const langJson = JSON.parse(fs.readFileSync(path.join(ROOT, "lang", `${lang}.json`), "utf8"));

	const flat = {};
	(function walk(node, prefix) {
		for (const [k, v] of Object.entries(node)) {
			const p = prefix ? `${prefix}.${k}` : k;
			if (v && typeof v === "object" && !Array.isArray(v)) walk(v, p);
			else flat[p] = v;
		}
	})(langJson, "");

	const spyCalls = [];
	const gameStub = {
		i18n: {
			localize: (key) => (Object.prototype.hasOwnProperty.call(flat, key) ? flat[key] : key)
		}
	};

	const originalLocaleCompare = String.prototype.localeCompare;
	// eslint-disable-next-line no-extend-native
	String.prototype.localeCompare = function (...args) {
		spyCalls.push(args);
		return originalLocaleCompare.apply(this, args);
	};

	let comparator;
	try {
		// eslint-disable-next-line no-new-func
		comparator = new Function("a", "b", "game", "CONFIG", `return (${comparatorBody});`);
	}
	finally {
		// restore immediately after building the function - the comparator itself is invoked below,
		// spyCalls collects everything that happens during actual sorting.
	}

	const CONFIG_STUB = { language: lang };

	const traitlist = traitKeys.map(key => ({ key, label: `wod.chantry.traits.${key}` }));
	const insertionOrder = traitlist.map(t => t.key);

	traitlist.sort((a, b) => comparator(a, b, gameStub, CONFIG_STUB));

	String.prototype.localeCompare = originalLocaleCompare;

	const sortedLabels = traitlist.map(t => gameStub.i18n.localize(t.label));

	let isSorted = true;
	for (let i = 0; i < sortedLabels.length - 1; i++) {
		if (sortedLabels[i].localeCompare(sortedLabels[i + 1], lang) > 0) {
			isSorted = false;
			break;
		}
	}

	check(`B1 ${lang}: the real comparator produces alphabetical order by localized label`,
		isSorted, `(${sortedLabels.join(" < ")})`);

	const sortedOrder = traitlist.map(t => t.key);
	check(`B2 ${lang}: the sorted order differs from the raw traitcost key insertion order`,
		JSON.stringify(sortedOrder) !== JSON.stringify(insertionOrder));

	check(`B3 ${lang}: the comparator passes a locale argument to localeCompare (not the bare, locale-naive form)`,
		spyCalls.length > 0 && spyCalls.every(args => args.length >= 2 && args[1] !== undefined));
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
