#!/usr/bin/env node
/**
 * add-chantry-trait-descriptions gave the Chantry/Construct sheet's fourteen construction Traits
 * ("Aliados", "Nodo", "Zona de Realidad"...) a read-only eye that reveals the book's effect
 * description for each — originally by toggling an inline `.description` div below the row.
 *
 * polish-chantry-sheet REVERSES that inline-toggle design (its design.md D1): the eye now opens
 * the SAME `ItemViewer` window every other description eye in this system opens, because a sheet
 * where the one description eye behaves differently from every other eye reads as an
 * inconsistency, not a deliberate choice. A construction Trait is still neither an Item nor a
 * compendium document, so the binder hands `ItemViewer` a plain pseudo-document shaped like the
 * three fields it actually reads (`uuid`, `name`, `system.description`) rather than a real one.
 *
 * This file is the SAME gate, corrected to pin the NEW shape rather than deleted — rewriting it
 * across the design reversal is the gate doing its job (see polish-chantry-sheet design.md D6):
 * a gate that survives untouched across a reversal of the very thing it pins would not have
 * caught the reversal at all.
 *
 * WHY THIS EXISTS
 * ----------------
 * `ChantryActorSheet` extends `foundry.appv1.sheets.ActorSheet` DIRECTLY - unlike every other
 * legacy Actor sheet in this system, it inherits NO collapsible/eye binder at all, so the whole
 * mechanism (markup + binder) had to be written from scratch for this one sheet. That is exactly
 * the kind of wiring that reverts silently: nothing in the file's own structure notices an eye
 * that renders and opens nothing, or a binder call that quietly moves behind the sheet's
 * `if (!this.options.editable) return;` early-return and stops working the moment a sheet is
 * locked or limited - which is precisely the read-only case this eye exists for.
 *
 * polish-chantry-sheet ALSO gates the Chantry's own rating/Trait dot click bindings on
 * `this.locked` (design.md D3: a control that WRITES must not render as interactive on a locked
 * sheet, not merely warn after the fact), so this file grew a section for that too.
 *
 * WHAT IT ASSERTS, statically (lettered as printed)
 * --------------------------------------------------
 * A. Template wiring (`templates/actor/chantry-sheet.html`):
 *    A1 - every Trait row carries an eye icon keyed `data-traitkey="{{trait.key}}"`, using the
 *         `collapsible button` class combination (the popup-eye idiom this system's other eyes use)
 *    A1b - that same eye also carries `data-labelkey`/`data-descriptionkey` (what the binder
 *          localizes to build the pseudo-document)
 *    A2 - NO `.description[data-traitkey]` div remains ANYWHERE in the file - the inline toggle is
 *         gone, not merely unused
 *    A3 - the eye sits OUTSIDE `.chantry-trait-value` (the dot-counter region) - if it did not,
 *         `ActionHelper.SetupDotCounters`'s `.chantry-trait-value > .resource-value-step`
 *         selector could treat a click on the eye as a dot click and silently change the Trait's
 *         value
 *    A4 - `getData()` carries a `descriptionkey` onto each Trait, pointed at
 *         `wod.chantry.traitdescriptions.<key>`
 *    A5 - `getData()` still carries a `label` onto each Trait, pointed at `wod.chantry.traits.<key>`
 *         (the source `data-labelkey` reads)
 * B. Binder wiring (`module/actor/template/chantry-actor-sheet.js`):
 *    B0 - `ItemViewer` is imported
 *    B1 - a binder over `.collapsible.button[data-traitkey]` is present (matching the class
 *         combination the OTHER popup eyes in this system use, e.g. `.collapsible.button
 *         [data-traituuid]`)
 *    B2 - that binder sits BEFORE `if (!this.options.editable) return;` (read-only controls must
 *         survive a locked/limited sheet)
 *    B3 - the click handler builds an object carrying `uuid`/`name`/`system.description` (in that
 *         order) and calls `ItemViewer.open(...)` with it
 *    B4 - the pseudo-document's uuid is namespaced under `this.actor.uuid` (so two different
 *         Chantries' same-keyed Trait windows cannot collide into one, per design.md D1)
 *    B5 - no leftover inline-toggle logic (`fa-eye-slash`/`collapsible-open` string manipulation)
 *         remains in this file
 *    B6 - the WRITING handlers (`_onsheetChange`, `_onRatingDotChange`, `_onTraitDotChange`) are
 *         still bound AFTER the editable early-return, i.e. still gated
 * C. Localisation completeness: `wod.chantry.traitdescriptions.<key>` is present and non-empty,
 *    in BOTH `lang/es.json` and `lang/en.json`, for EVERY key `CONFIG.worldofdarkness.chantry.
 *    traitcost` enumerates - read from the real `module/config.js`, not hand-copied here.
 * D. Locked dots are inert, not just warned-about (design.md D3):
 *    D1 - the rating/Trait dot click bindings sit inside an `if (!this.locked)` gate, not bound
 *         unconditionally
 *    D2 - the in-handler `this.locked` checks in `_onRatingDotChange`/`_onTraitDotChange`/
 *         `_onsheetChange` are STILL present (defence in depth - the bind-time gate does not
 *         replace them)
 *    D3 - a CSS rule scoped to `.chantry.locked` removes `pointer-events` from the dots
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

	check("A1 an eye icon per Trait row, class collapsible+button, keyed data-traitkey=\"{{trait.key}}\"",
		/class="[^"]*\bpointer\b[^"]*\bcollapsible\b[^"]*\bbutton\b[^"]*"[\s\S]{0,200}data-traitkey="\{\{trait\.key\}\}"/.test(block));

	check("A1b the same eye also carries data-labelkey and data-descriptionkey",
		/data-labelkey="\{\{trait\.label\}\}"/.test(block) &&
		/data-descriptionkey="\{\{trait\.descriptionkey\}\}"/.test(block));

	// A3: isolate the dot-counter div's own markup (from its opening tag to its own first closing
	// </div>, which is right after the {{#numLoop}} dots) and prove the eye markup is not inside it.
	const valueDivMatch = block.match(/<div class="pullLeft resource-value chantry-trait-value"[\s\S]*?<\/div>/);
	check("A3 the eye is OUTSIDE .chantry-trait-value (cannot be mistaken for a dot click)",
		!!valueDivMatch && !/collapsible|fa-eye/.test(valueDivMatch[0]),
		valueDivMatch ? "" : "(.chantry-trait-value div not found)");
}

check("A2 no .description[data-traitkey] div remains anywhere in the template (inline toggle is gone)",
	!/class="description" data-traitkey=/.test(htmlSrc));

const sheetJsPath = path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet.js");
const sheetJsSrc = fs.readFileSync(sheetJsPath, "utf8");

check("A4 getData() carries a descriptionkey pointed at wod.chantry.traitdescriptions.<key> onto each Trait",
	/descriptionkey:\s*`wod\.chantry\.traitdescriptions\.\$\{key\}`/.test(sheetJsSrc));

check("A5 getData() carries a label pointed at wod.chantry.traits.<key> onto each Trait",
	/label:\s*`wod\.chantry\.traits\.\$\{key\}`/.test(sheetJsSrc));

/* ---- B. binder wiring (popup, not inline toggle) ---- */

const activateIdx = sheetJsSrc.indexOf("activateListeners(html)");
const editableReturnIdx = sheetJsSrc.indexOf("if (!this.options.editable) return;");
const traitBinderIdx = sheetJsSrc.indexOf('querySelectorAll(".collapsible.button[data-traitkey]")');

check("B0 ItemViewer is imported",
	/import\s+ItemViewer\s+from\s+["'][^"']*applications\/item-viewer\.js["']/.test(sheetJsSrc));

check("B1 a binder over .collapsible.button[data-traitkey] is present (matches the popup-eye idiom)",
	traitBinderIdx !== -1);

check("B2 the binder is wired BEFORE the editable early-return (works on a locked/limited sheet)",
	traitBinderIdx !== -1 && activateIdx !== -1 && editableReturnIdx !== -1 &&
	activateIdx < traitBinderIdx && traitBinderIdx < editableReturnIdx);

check("B3 the click handler builds a pseudo-document (uuid, then name, then system.description) and opens ItemViewer",
	/ItemViewer\.open\(\{[\s\S]{0,300}uuid:[\s\S]{0,300}name:[\s\S]{0,300}system:\s*\{\s*description:/.test(sheetJsSrc));

check("B4 the pseudo-document's uuid is namespaced under this.actor.uuid (no cross-actor window collision)",
	/uuid:\s*`\$\{this\.actor\.uuid\}\.ChantryTrait\.\$\{traitkey\}`/.test(sheetJsSrc));

check("B5 no leftover inline-toggle logic (fa-eye-slash / collapsible-open) remains",
	!/fa-eye-slash/.test(sheetJsSrc) && !/collapsible-open/.test(sheetJsSrc));

const lockBtnIdx = sheetJsSrc.indexOf('.find(".lock-btn")');
const sheetChangeIdx = sheetJsSrc.indexOf('.find(".inputdata")');
const ratingDotIdx = sheetJsSrc.indexOf('.find(".chantry-rating');
const traitDotIdx = sheetJsSrc.indexOf('.find(".chantry-trait-value');

check("B6 the WRITING handlers (lock/sheet-change/rating-dot/trait-dot) stay bound AFTER the editable early-return",
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

/* ---- D. locked dots are inert, not just warned-about (design.md D3) ---- */

const lockGateIdx = sheetJsSrc.indexOf("if (!this.locked) {", editableReturnIdx === -1 ? 0 : editableReturnIdx);

check("D1 the rating/Trait dot click bindings sit inside an `if (!this.locked)` gate",
	lockGateIdx !== -1 && ratingDotIdx !== -1 && traitDotIdx !== -1 &&
	lockGateIdx < ratingDotIdx && lockGateIdx < traitDotIdx);

const warnCount = (sheetJsSrc.match(/ui\.notifications\.warn\(game\.i18n\.localize\("wod\.system\.sheetlocked"\)\)/g) ?? []).length;

check("D2 the in-handler `this.locked` warnings are still present in all three writing handlers (defence in depth)",
	warnCount >= 3, `(found ${warnCount})`);

const cssSrc = fs.readFileSync(path.join(ROOT, "css", "wod.css"), "utf8");

/* D3 pinned the COMPOUND form (`.wod20.chantry.locked`) until 2026-08-24, which is exactly the
   selector that cannot match: measured on the live sheet, `{{cssClass}}` renders as `editable` and
   `wod20`/`wod-sheet`/`chantry` all come from `defaultOptions.classes` (the `.app` ROOT), so `locked`
   -- on the `<form>` -- is never on the same element as the other three. The rule matched nothing and
   the dots stayed live while locked; this check asserted the broken shape, so nothing could see it.
   Now it requires the DESCENDANT form and REJECTS the compound one outright, because a compound
   `.chantry.locked` is provably dead here rather than merely unusual. */
check("D3 a CSS rule scoped to .chantry + a descendant .locked removes pointer-events from the dots",
	/\.wod20\.chantry\s+\.locked\s+\.resource-value-step\s*\{[^}]*pointer-events:\s*none/.test(cssSrc));

check("D3b the dead COMPOUND form is not reintroduced (it can never match: locked is on the form, the rest on the app root)",
	!/\.wod20\.chantry\.locked\s+\.resource-value-step/.test(cssSrc));

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
