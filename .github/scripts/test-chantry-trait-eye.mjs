#!/usr/bin/env node
/**
 * add-chantry-trait-descriptions gave the Chantry/Construct sheet's fourteen construction Traits
 * ("Aliados", "Nodo", "Zona de Realidad"...) a read-only eye that reveals the book's effect
 * description for each — originally by toggling an inline `.description` div below the row.
 *
 * polish-chantry-sheet REVERSED that inline-toggle design (its design.md D1): the eye opens the
 * SAME `ItemViewer` window every other description eye in this system opens.
 *
 * rebuild-chantry-sheet-v2 REPLACES the appv1 `ChantryActorSheet` with an ApplicationV2
 * `ChantryActorSheetV2` (`module/actor/template/chantry-actor-sheet-v2.js`,
 * `templates/actor/chantry-sheet-v2.hbs`) and PORTS every check below to that new shape, rather
 * than deleting the file — the same principle `polish-chantry-sheet` already established when it
 * rewrote this file across its own design reversal (design.md D6 there): a gate that survives a
 * rewrite unchanged would not have caught the rewrite breaking anything.
 *
 * The legacy `ChantryActorSheet`/`chantry-sheet.html` files stay on disk, UNMODIFIED, registered
 * `makeDefault: false` as the per-actor rollback (design.md D1) — this gate does not re-check them
 * because nothing in this change touches them; they were already fully verified by this exact
 * gate's own PRIOR form (see git history) before the migration, and staying byte-identical is what
 * "unmodified" means.
 *
 * WHAT IT ASSERTS, statically (lettered as printed)
 * --------------------------------------------------
 * A. Template wiring (`templates/actor/chantry-sheet-v2.hbs`):
 *    A1 - every Trait row carries an eye icon keyed `data-traitkey="{{trait.key}}"`, using the
 *         `collapsible button` class combination (the popup-eye idiom this system's other eyes use)
 *    A1b - that same eye also carries `data-labelkey`/`data-descriptionkey`
 *    A2 - NO `.description[data-traitkey]` div remains ANYWHERE in the file
 *    A3 - the eye sits OUTSIDE `.chantry-trait-value` (the dot-counter region)
 *    A4 - `_prepareContext()` carries a `descriptionkey` onto each Trait, pointed at
 *         `wod.chantry.traitdescriptions.<key>`
 *    A5 - `_prepareContext()` still carries a `label` onto each Trait, pointed at
 *         `wod.chantry.traits.<key>`
 * B. Binder wiring (`module/actor/template/chantry-actor-sheet-v2.js`):
 *    B0 - `ItemViewer` is imported
 *    B1 - a binder over `.collapsible.button[data-traitkey]` is present in `_onRender`/
 *         `_bindTraitDescriptionButtons`
 *    B2 - appv2 REPLACEMENT for the old "bound before the editable early-return" check: appv2 has
 *         no such early-return, so this asserts the binder call is NOT nested inside any
 *         conditional referencing `locked`/`editable` — a read-only control must be bound on EVERY
 *         render, unconditionally, not only when the sheet happens to be unlocked
 *    B3 - the click handler builds a pseudo-document (uuid, then name, then system.description) and
 *         opens ItemViewer
 *    B4 - the pseudo-document's uuid is namespaced under `this.actor.uuid`
 *    B5 - no leftover inline-toggle logic (`fa-eye-slash`/`collapsible-open`) remains
 *    B6 - appv2 REPLACEMENT for "bound after the editable early-return": the three WRITING actions
 *         (`actorLock`, `ratingDotChange`, `traitDotChange`) are declared in
 *         `DEFAULT_OPTIONS.actions`, and `form.handler` points at the sheet's own
 *         `onSubmitActorForm` — i.e. the writing surface is wired through appv2's declarative
 *         mechanism, not through an always-on imperative binder
 * C. Localisation completeness: unchanged from before the migration - reads `module/config.js` and
 *    `lang/*.json` directly, neither of which this change touches.
 * D. Locked dots are inert, not just warned-about:
 *    D1 - appv2 REPLACEMENT for "bindings sit inside an `if (!this.locked)` gate": the
 *         `data-action="ratingDotChange"`/`data-action="traitDotChange"` attributes are
 *         CONDITIONALLY RENDERED in the TEMPLATE (`{{#if (eq ... false)}}`), not conditionally
 *         bound in JS — appv2 has no imperative click-binding step to gate at all
 *    D2 - the in-handler `this.locked` checks in `onRatingDotChange`/`onTraitDotChange`/
 *         `onSubmitActorForm` are STILL present (defence in depth)
 *    D3 - a CSS rule scoped to `.wod20.chantry .locked` (descendant form) removes `pointer-events`
 *         from the dots — UNCHANGED target (`css/wod.css`), because `wod20`/`wod-sheet`/`chantry`
 *         still land on the SAME appv2 root element while `locked` lands on a DESCENDANT wrapper
 *         div the new template introduces for exactly this reason (see that template's own header
 *         comment)
 *    D3b - the dead COMPOUND form (`.wod20.chantry.locked`) is not reintroduced
 * E. The render-hook port (design.md D2 — the largest concrete risk in this whole change):
 *    E0 - `Hooks.on("renderActorSheetV2", ...)`'s own listener body contains a
 *         `sheet.actor.type === "chantry"` branch (guarded, so it cannot fire for/interfere with
 *         any other actor type already handled there)
 *    E1 - that branch adds `chantry-technocracy`/`chantry-tradition` per `system.flavor`, exactly
 *         as the legacy `renderActorSheet` listener's own (untouched) branch does
 *    E2 - that branch checks BOTH the system-wide `useSplatFonts` setting AND the per-actor
 *         `usesplatfont` override for `noSplatFont` — the FULLER, two-tier check the legacy
 *         listener has always done for Chantry, not just the per-actor-only check every OTHER
 *         splat gets on THIS hook (a pre-existing, out-of-scope gap for those splats — see
 *         design.md D2's second finding)
 *    E3 - the branch is inside `renderActorSheetV2`, not accidentally left in/duplicated into the
 *         legacy `renderActorSheet` listener
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

const htmlPath = path.join(ROOT, "templates", "actor", "chantry-sheet-v2.hbs");
const htmlSrc = fs.readFileSync(htmlPath, "utf8");

const eachStart = htmlSrc.indexOf("{{#each listData.traits as |trait|}}");
const eachEnd = htmlSrc.indexOf("{{/each}}", eachStart);
if (eachStart === -1 || eachEnd === -1) {
	check("A0 the Trait-list {{#each}} block exists in chantry-sheet-v2.hbs", false);
}
else {
	const block = htmlSrc.slice(eachStart, eachEnd);

	check("A1 an eye icon per Trait row, class collapsible+button, keyed data-traitkey=\"{{trait.key}}\"",
		/class="[^"]*\bpointer\b[^"]*\bcollapsible\b[^"]*\bbutton\b[^"]*"[\s\S]{0,200}data-traitkey="\{\{trait\.key\}\}"/.test(block));

	check("A1b the same eye also carries data-labelkey and data-descriptionkey",
		/data-labelkey="\{\{trait\.label\}\}"/.test(block) &&
		/data-descriptionkey="\{\{trait\.descriptionkey\}\}"/.test(block));

	// A3: isolate the dot-counter div's own markup and prove the eye markup is not inside it.
	const valueDivMatch = block.match(/<div class="pullLeft resource-value chantry-trait-value"[\s\S]*?<\/div>/);
	check("A3 the eye is OUTSIDE .chantry-trait-value (cannot be mistaken for a dot click)",
		!!valueDivMatch && !/collapsible|fa-eye/.test(valueDivMatch[0]),
		valueDivMatch ? "" : "(.chantry-trait-value div not found)");
}

check("A2 no .description[data-traitkey] div remains anywhere in the template (inline toggle is gone)",
	!/class="description" data-traitkey=/.test(htmlSrc));

const sheetJsPath = path.join(ROOT, "module", "actor", "template", "chantry-actor-sheet-v2.js");
const sheetJsSrc = fs.readFileSync(sheetJsPath, "utf8");

check("A4 _prepareContext() carries a descriptionkey pointed at wod.chantry.traitdescriptions.<key> onto each Trait",
	/descriptionkey:\s*`wod\.chantry\.traitdescriptions\.\$\{key\}`/.test(sheetJsSrc));

check("A5 _prepareContext() carries a label pointed at wod.chantry.traits.<key> onto each Trait",
	/label:\s*`wod\.chantry\.traits\.\$\{key\}`/.test(sheetJsSrc));

/* ---- B. binder wiring (popup, not inline toggle) ---- */

const onRenderIdx = sheetJsSrc.indexOf("async _onRender(");
const onRenderEndIdx = sheetJsSrc.indexOf("\n\t/**", onRenderIdx === -1 ? 0 : onRenderIdx + 1);
const onRenderBody = (onRenderIdx !== -1)
	? sheetJsSrc.slice(onRenderIdx, onRenderEndIdx === -1 ? sheetJsSrc.length : onRenderEndIdx)
	: "";
const traitBinderMatch = sheetJsSrc.match(/querySelectorAll\??\.?\(["']\.collapsible\.button\[data-traitkey\]["']\)/);
const traitBinderIdx = traitBinderMatch ? sheetJsSrc.indexOf(traitBinderMatch[0]) : -1;
const bindCallIdx = onRenderBody.indexOf("_bindTraitDescriptionButtons(element)");

check("B0 ItemViewer is imported",
	/import\s+ItemViewer\s+from\s+["'][^"']*applications\/item-viewer\.js["']/.test(sheetJsSrc));

check("B1 a binder over .collapsible.button[data-traitkey] is present (matches the popup-eye idiom)",
	traitBinderIdx !== -1);

check("B2 the binder call in _onRender is NOT nested inside any if (locked/editable) guard - it runs on every render",
	onRenderIdx !== -1 && bindCallIdx !== -1 &&
	!/if\s*\([^)]*(locked|editable)[^)]*\)/.test(onRenderBody.slice(0, bindCallIdx)));

check("B3 the click handler builds a pseudo-document (uuid, then name, then system.description) and opens ItemViewer",
	/ItemViewer\.open\(\{[\s\S]{0,300}uuid:[\s\S]{0,300}name:[\s\S]{0,300}system:\s*\{\s*description:/.test(sheetJsSrc));

check("B4 the pseudo-document's uuid is namespaced under this.actor.uuid (no cross-actor window collision)",
	/uuid:\s*`\$\{this\.actor\.uuid\}\.ChantryTrait\.\$\{traitkey\}`/.test(sheetJsSrc));

check("B5 no leftover inline-toggle logic (fa-eye-slash / collapsible-open) remains",
	!/fa-eye-slash/.test(sheetJsSrc) && !/collapsible-open/.test(sheetJsSrc));

const actionsBlockMatch = sheetJsSrc.match(/actions:\s*\{[\s\S]*?\n\t\t\}/);
const actionsBlock = actionsBlockMatch ? actionsBlockMatch[0] : "";

check("B6 the three WRITING actions (actorLock/ratingDotChange/traitDotChange) are declared in DEFAULT_OPTIONS.actions, and form.handler points at onSubmitActorForm",
	/actorLock:/.test(actionsBlock) &&
	/ratingDotChange:/.test(actionsBlock) &&
	/traitDotChange:/.test(actionsBlock) &&
	/handler:\s*ChantryActorSheetV2\.onSubmitActorForm/.test(sheetJsSrc));

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

/* ---- D. locked dots are inert, not just warned-about ---- */

check("D1 the rating-dot data-action is conditionally RENDERED in the template only when unlocked",
	/data-action="ratingDotChange"/.test(htmlSrc) &&
	/\{\{#if \(eq \.\.\/locked false\)\}\}data-action="ratingDotChange"\{\{\/if\}\}/.test(htmlSrc));

check("D1b the Trait-dot data-action is conditionally RENDERED in the template only when unlocked",
	/\{\{#if \(eq \.\.\/\.\.\/locked false\)\}\}data-action="traitDotChange"\{\{\/if\}\}/.test(htmlSrc));

const warnCount = (sheetJsSrc.match(/ui\.notifications\.warn\(game\.i18n\.localize\("wod\.system\.sheetlocked"\)\)/g) ?? []).length;

check("D2 the in-handler `this.locked` warnings are still present (defence in depth)",
	warnCount >= 3, `(found ${warnCount})`);

const cssSrc = fs.readFileSync(path.join(ROOT, "css", "wod.css"), "utf8");

check("D3 a CSS rule scoped to .chantry + a descendant .locked removes pointer-events from the dots",
	/\.wod20\.chantry\s+\.locked\s+\.resource-value-step\s*\{[^}]*pointer-events:\s*none/.test(cssSrc));

check("D3b the dead COMPOUND form is not reintroduced (it can never match: locked is on a descendant wrapper div, the rest on the appv2 root)",
	!/\.wod20\.chantry\.locked\s+\.resource-value-step/.test(cssSrc));

/* ---- E. the render-hook port (design.md D2) ---- */

const hooksJsPath = path.join(ROOT, "module", "hooks.js");
const hooksJsSrc = fs.readFileSync(hooksJsPath, "utf8");

const v2HookStart = hooksJsSrc.indexOf('Hooks.on("renderActorSheetV2"');
const v1HookStart = hooksJsSrc.indexOf('Hooks.on("renderActorSheet"', v2HookStart === -1 ? 0 : v2HookStart + 1);
const v2HookBody = (v2HookStart !== -1 && v1HookStart !== -1) ? hooksJsSrc.slice(v2HookStart, v1HookStart) : "";

check("E0 renderActorSheetV2's listener body contains a `sheet.actor.type === \"chantry\"` branch",
	/sheet\.actor\.type\s*===\s*["']chantry["']/.test(v2HookBody));

check("E1 that branch adds chantry-technocracy/chantry-tradition per system.flavor",
	/chantry-technocracy/.test(v2HookBody) && /chantry-tradition/.test(v2HookBody));

check("E2 that branch checks BOTH the system-wide useSplatFonts setting AND the per-actor usesplatfont override",
	/sheet\.actor\.type\s*===\s*["']chantry["'][\s\S]{0,600}useSplatFonts[\s\S]{0,300}usesplatfont/.test(v2HookBody));

check("E3 the branch is inside renderActorSheetV2, not (only) the legacy renderActorSheet listener",
	v2HookStart !== -1 && v1HookStart !== -1 && v2HookBody.includes('sheet.actor.type === "chantry"'));

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
