#!/usr/bin/env node
/**
 * add-chantry-trait-descriptions — the Chantry/Construct sheet's fourteen construction Traits
 * ("Aliados", "Nodo", "Zona de Realidad"...) are rendered as a bare label + a row of dots + a
 * cost. Nothing on the sheet says what any of them DOES; the book's definition
 * (m20-the-operative-dossier, "Estatus y el Constructo") is only reachable by leaving the sheet.
 * This change gives every one of the fourteen rows a read-only eye that reveals that Trait's
 * effect description inline, below the row - matching the eye every other definable Trait in
 * this system already has (Attributes/Spheres via a compendium resolver, Secta/Afiliación by
 * name), but resolved against a plain per-Trait localisation key, because a construction Trait
 * is an integer on the actor, not an Item and not a compendium document (design.md D1/D2).
 *
 * WHY THIS EXISTS
 * ----------------
 * `ChantryActorSheet` extends `foundry.appv1.sheets.ActorSheet` DIRECTLY - unlike every other
 * legacy Actor sheet in this system, it inherits NO collapsible/eye binder at all, so the whole
 * mechanism (markup + binder) had to be written from scratch for this one sheet. That is exactly
 * the kind of wiring that reverts silently: nothing in the file's own structure notices an eye
 * that renders and toggles nothing, or a binder call that quietly moves behind the sheet's
 * `if (!this.options.editable) return;` early-return and stops working the moment a sheet is
 * locked or limited - which is precisely the read-only case this eye exists for (design.md D3).
 * Modelled on `test-sect-eye-icon.mjs`'s shape and stated purpose.
 *
 * WHAT IT ASSERTS, statically (lettered as printed)
 * --------------------------------------------------
 * A. Template wiring (`templates/actor/chantry-sheet.html`):
 *    A1 - every Trait row carries an eye icon keyed `data-traitkey="{{trait.key}}"`
 *    A2 - every Trait row is followed by a `.description[data-traitkey="{{trait.key}}"]` div
 *    A3 - the eye sits OUTSIDE `.chantry-trait-value` (the dot-counter region) - if it did not,
 *         `ActionHelper.SetupDotCounters`'s `.chantry-trait-value > .resource-value-step`
 *         selector could treat a click on the eye as a dot click and silently change the Trait's
 *         value (design.md's own stated risk, verified here rather than assumed)
 *    A4 - `getData()` (`module/actor/template/chantry-actor-sheet.js`) carries a
 *         `descriptionkey` onto each Trait, pointed at `wod.chantry.traitdescriptions.<key>`
 * B. Binder wiring (`module/actor/template/chantry-actor-sheet.js`):
 *    B1 - `activateListeners` actually calls a binder over `.collapsible[data-traitkey]`
 *    B2 - that binder call sits BEFORE `if (!this.options.editable) return;` (D3: read-only
 *         controls must survive a locked/limited sheet)
 *    B3 - the WRITING handlers (`_onsheetChange`, `_onRatingDotChange`, `_onTraitDotChange`) are
 *         still bound AFTER that same early-return, i.e. still gated - this change must not have
 *         loosened them while adding the read-only eye
 * C. Localisation completeness: `wod.chantry.traitdescriptions.<key>` is present and non-empty,
 *    in BOTH `lang/es.json` and `lang/en.json`, for EVERY key `CONFIG.worldofdarkness.chantry.
 *    traitcost` enumerates - read from the real `module/config.js`, not hand-copied here, so a
 *    Trait added to that table in the future can never ship without a description (spec
 *    requirement: "the set of Traits that get one SHALL be exactly the set the sheet lists").
 *
 *     node .github/scripts/test-chantry-trait-eye.mjs
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

/* ---- A. template wiring ---- */

const htmlPath = path.join(ROOT, "templates", "actor", "chantry-sheet.html");
const htmlSrc = fs.readFileSync(htmlPath, "utf8");

const eachStart = htmlSrc.indexOf("{{#each listData.traits as |trait|}}");
const eachEnd = htmlSrc.indexOf("{{/each}}", eachStart);
if (eachStart === -1 || eachEnd === -1) {
	check("A0 the Trait-list {{#each}} block exists in chantry-sheet.html", false);
}
else {
	const block = htmlSrc.slice(eachStart, eachEnd);

	check("A1 an eye icon per Trait row, keyed data-traitkey=\"{{trait.key}}\"",
		/class="[^"]*\bpointer\b[^"]*\bcollapsible\b[^"]*"[\s\S]{0,200}data-traitkey="\{\{trait\.key\}\}"/.test(block));

	check("A2 a .description div per Trait row, keyed by the SAME data-traitkey",
		/class="description" data-traitkey="\{\{trait\.key\}\}"/.test(block));

	// A3: isolate the dot-counter div's own markup (from its opening tag to its own first closing
	// </div>, which is right after the {{#numLoop}} dots) and prove the eye markup is not inside it.
	const valueDivMatch = block.match(/<div class="pullLeft resource-value chantry-trait-value"[\s\S]*?<\/div>/);
	check("A3 the eye is OUTSIDE .chantry-trait-value (cannot be mistaken for a dot click)",
		!!valueDivMatch && !/collapsible|fa-eye/.test(valueDivMatch[0]),
		valueDivMatch ? "" : "(.chantry-trait-value div not found)");
}

const sheetJsPath = path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet.js");
const sheetJsSrc = fs.readFileSync(sheetJsPath, "utf8");

check("A4 getData() carries a descriptionkey pointed at wod.chantry.traitdescriptions.<key> onto each Trait",
	/descriptionkey:\s*`wod\.chantry\.traitdescriptions\.\$\{key\}`/.test(sheetJsSrc));

/* ---- B. binder wiring ---- */

const activateIdx = sheetJsSrc.indexOf("activateListeners(html)");
const editableReturnIdx = sheetJsSrc.indexOf("if (!this.options.editable) return;");
const binderIdx = sheetJsSrc.indexOf('querySelectorAll(".collapsible[data-traitkey]")');

check("B0 activateListeners() and the editable early-return both exist",
	activateIdx !== -1 && editableReturnIdx !== -1);

check("B1 a binder over .collapsible[data-traitkey] is actually present",
	binderIdx !== -1);

check("B2 the binder is wired BEFORE the editable early-return (works on a locked/limited sheet)",
	binderIdx !== -1 && activateIdx !== -1 && editableReturnIdx !== -1 &&
	activateIdx < binderIdx && binderIdx < editableReturnIdx);

const lockBtnIdx = sheetJsSrc.indexOf('.find(".lock-btn")');
const sheetChangeIdx = sheetJsSrc.indexOf('.find(".inputdata")');
const ratingDotIdx = sheetJsSrc.indexOf('.find(".chantry-rating');
const traitDotIdx = sheetJsSrc.indexOf('.find(".chantry-trait-value');

check("B3 the WRITING handlers (lock/sheet-change/rating-dot/trait-dot) stay bound AFTER the editable early-return",
	[lockBtnIdx, sheetChangeIdx, ratingDotIdx, traitDotIdx].every(idx => idx !== -1 && idx > editableReturnIdx));

/* ---- C. localisation completeness, key list from the real CONFIG ---- */

const { wod } = await import(pathToFileURL(path.join(ROOT, "module", "config.js")).href);
const traitKeys = Object.keys(wod.chantry.traitcost);

check("C0 CONFIG.worldofdarkness.chantry.traitcost enumerates at least one Trait key",
	traitKeys.length > 0, `(${traitKeys.length} keys)`);

for (const lang of ["es", "en"]) {
	const langJson = JSON.parse(fs.readFileSync(path.join(ROOT, "lang", `${lang}.json`), "utf8"));
	const descriptions = langJson?.wod?.chantry?.traitdescriptions ?? {};

	for (const key of traitKeys) {
		const value = descriptions[key];
		check(`C ${lang}: wod.chantry.traitdescriptions.${key} is present and non-empty`,
			typeof value === "string" && value.trim().length > 0);
	}
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
