#!/usr/bin/env node
/**
 * add-quintessence-spending tasks 2/3/4/5 — spending Quintaesencia at casting time used to do
 * NOTHING to the sheet: `dialog-aretecasting.js:191` fed the declared spend straight into the
 * difficulty calculation and `:756-758` printed one chat line, and that was the entire effect. A
 * grep of `quintessence` over the dialog and `roll-dice.js` never turned up an `.update(` call.
 * The selector offering the spend was a fixed `{{#numDownToLoop 0 -5}}` fan that never looked at
 * the reserve or the Avatar Background at all.
 *
 * WHY THIS EXISTS
 * ---------------
 * The arithmetic (`min(available, Avatar)`, D2's three-step Avatar-id cascade, the never-negative
 * write-time discharge) now lives in `module/scripts/quintessence-helpers.js`, dependency-free for
 * the same reason `casting-difficulty-helpers.js`/`paradox-helpers.js` are: `dialog-aretecasting.js`
 * `extends FormApplication` at module load, so nothing inside it is importable by a plain `node`
 * process. Nothing else in this repo executes this arithmetic — `js-syntax-check.sh` only proves
 * the file parses, and the repo's own `tests/*.mjs` are never invoked by `deploy.yml`. Two classes
 * of regression this harness catches that a byte-diff or a parse check cannot:
 *
 *   1. the SELECTOR quietly reverting to a fixed range (a template edit, invisible to every JS-only
 *      check in this repo) — read straight from `dialog-aretecasting.hbs`'s own source, section E;
 *   2. the WRITE quietly reappearing on the wrong trigger (moving the selector, not resolving the
 *      roll) or landing on a THIRD storage location instead of the two fields the manual
 *      Quintaesencia wheel already uses — read from `dialog-aretecasting.js`'s own source, section F.
 *
 * WHAT IT CHECKS
 * --------------
 * A. `resolveAvatarRating()` — the three-step cascade (`wod20-char` flag, `wod20-compendium-es`
 *    flag, tolerant name match for a hand-made sheet), in the SHALL order, with no Avatar Background
 *    at all resolving to `null` (never 0), and a duplicated Background resolved deterministically.
 * B. `resolveAvailableQuintessence()` — both actor branches: the PC `Advantage` item
 *    (`system.id === "quintessence"`, `system.temporary`) and the legacy `system.quintessence.temporary`
 *    field (never nested under `system.advantages`, which is a DIFFERENT, unrelated schema block).
 * C. `spendableQuintessence()` — `min(available, avatarRating)`, including every edge D1/D2 name:
 *    0 available, Avatar 0, no Avatar Background (`null` -> no cap), and numeric strings.
 * D. `quintessenceSpendOptions()` — always includes `0`, then `-1..-N`; empty of spend options
 *    (just `[0]`) when N is 0.
 * E. `resolveQuintessenceDischarge()` — never leaves the reserve negative, flags the discrepancy
 *    when the declared spend exceeds what's actually payable at write time (D3), and re-validates
 *    against BOTH limits, not just the reserve.
 * F. the TEMPLATE actually uses the calculated range, not the old fixed fan — read from
 *    `dialog-aretecasting.hbs`'s own source.
 * G. the DIALOG actually imports and calls these helpers, discounts only AFTER the roll resolves
 *    (never inside `_updateObject`, which runs on every selector change, and never inside
 *    `_closeForm`), and writes through the SAME two fields B pins — no third route.
 *
 * Runnable locally: node .github/scripts/test-quintessence.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	resolveAvatarRating,
	resolveAvailableQuintessence,
	spendableQuintessence,
	quintessenceSpendOptions,
	resolveQuintessenceDischarge
} from "../../module/scripts/quintessence-helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIALOG_PATH = path.join(ROOT, "module", "dialogs", "dialog-aretecasting.js");
// TWO templates, not one. `dialog-aretecasting.hbs` is the legacy one and `dialog-casting.hbs`
// the REDESIGNED one, which is the one the dialog actually uses today. The first version of this
// gate only read the legacy one, so it reported 45/45 green while the fixed fan was still on
// screen in the redesigned one — the user saw it with a 2-point mage being offered -1 to -5. Any
// assertion about the selector has to walk BOTH of them.
const TEMPLATE_PATHS = [
	path.join(ROOT, "templates", "dialogs", "dialog-aretecasting.hbs"),
	path.join(ROOT, "templates", "dialogs", "dialog-casting.hbs"),
];
const dialogSrc = fs.readFileSync(DIALOG_PATH, "utf8");
const templates = TEMPLATE_PATHS.map((p) => ({ name: path.basename(p), src: fs.readFileSync(p, "utf8") }));

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* ============================================================================================ */
/* Fixtures — plain, actor-shaped objects. No Foundry class anywhere.                           */
/* ============================================================================================ */

function background({ id, flagScope, name = "Trasfondo", value = 0 }) {
	return {
		type: "Feature",
		name,
		system: { type: "wod.types.background", value },
		flags: flagScope ? { [flagScope]: { id } } : {}
	};
}

function pcActor({ items = [], quintessenceTemporary } = {}) {
	const allItems = [...items];
	if (quintessenceTemporary !== undefined) {
		allItems.push({ type: "Advantage", system: { id: "quintessence", temporary: quintessenceTemporary } });
	}
	return { type: "PC", items: allItems, system: {} };
}

function legacyActor({ items = [], quintessenceTemporary = 0 } = {}) {
	return { type: "Mage", items, system: { quintessence: { temporary: quintessenceTemporary } } };
}

/* ============================================================================================ */
/* A. resolveAvatarRating — the three-step cascade                                              */
/* ============================================================================================ */

// A1/A2 deliberately name the item something the tolerant name pattern (step 3) would NOT match
// ("Trasfondo cualquiera"), so these two can ONLY pass via the flag step they claim to exercise —
// a fixture that also satisfied step 3 would let a broken/removed flag step pass by accident,
// which is exactly the gap this harness's own mutation-testing pass (design.md/tasks.md 6.4) found
// and closed.
check("A1 step 1: resolves by the wod20-char flag id, with a name that would NOT match step 3",
	resolveAvatarRating(pcActor({ items: [background({ id: "avatar-genio", flagScope: "wod20-char", name: "Trasfondo cualquiera", value: 3 })] })) === 3);

check("A2 step 2: resolves by the wod20-compendium-es flag id when no wod20-char flag matches, with a name that would NOT match step 3",
	resolveAvatarRating(pcActor({ items: [background({ id: "avatar-genio", flagScope: "wod20-compendium-es", name: "Trasfondo cualquiera", value: 2 })] })) === 2);

check("A3 step 3: resolves by name (dual form) on a hand-made Background with no provenance flag",
	resolveAvatarRating(pcActor({ items: [background({ name: "Avatar / Genio", value: 4 })] })) === 4);

check("A4 step 3: resolves by name, EACH half alone — a Technocrat's sheet says only \"Genio\"",
	resolveAvatarRating(pcActor({ items: [background({ name: "Genio", value: 1 })] })) === 1 &&
	resolveAvatarRating(pcActor({ items: [background({ name: "Avatar", value: 5 })] })) === 5);

check("A5 step order: a wod20-char match wins over a DIFFERENT Background's compendium/name match",
	resolveAvatarRating(pcActor({
		items: [
			background({ name: "Avatar / Genio", value: 1, flagScope: "wod20-compendium-es", id: "not-the-avatar" }),
			background({ id: "avatar-genio", flagScope: "wod20-char", name: "Otro nombre", value: 4 })
		]
	})) === 4);

check("A6 no Avatar Background at all resolves to null, NEVER to 0 (D2)",
	resolveAvatarRating(pcActor({ items: [background({ id: "contacts", flagScope: "wod20-char", name: "Contactos", value: 3 })] })) === null);

check("A7 an actor with no Background items at all also resolves to null",
	resolveAvatarRating(pcActor({ items: [] })) === null);

check("A8 a duplicated Avatar Background resolves deterministically (the first found, at whichever step matches)",
	resolveAvatarRating(pcActor({
		items: [
			background({ id: "avatar-genio", flagScope: "wod20-char", name: "Avatar / Genio", value: 2 }),
			background({ id: "avatar-genio", flagScope: "wod20-char", name: "Avatar / Genio", value: 5 })
		]
	})) === 2);

check("A9 works identically on a legacy (non-PC) actor — Backgrounds are Items, not a per-type schema",
	resolveAvatarRating(legacyActor({ items: [background({ id: "avatar-genio", flagScope: "wod20-char", name: "Avatar / Genio", value: 3 })] })) === 3);

check("A10 never resolved by system.id — a Background with a (non-standard) system.id is still found by flag/name, not by that id",
	(() => {
		const item = background({ id: "avatar-genio", flagScope: "wod20-char", name: "Avatar / Genio", value: 3 });
		item.system.id = null; // real Backgrounds carry no system.id at all (action-helpers.js:427)
		return resolveAvatarRating(pcActor({ items: [item] })) === 3;
	})());

/* ============================================================================================ */
/* B. resolveAvailableQuintessence — the two actor branches                                     */
/* ============================================================================================ */

check("B1 PC branch reads the Advantage item's system.temporary (system.id === \"quintessence\")",
	resolveAvailableQuintessence(pcActor({ quintessenceTemporary: 5 })) === 5);

check("B2 PC branch with no quintessence Advantage item at all resolves to 0, not NaN",
	resolveAvailableQuintessence(pcActor({ items: [] })) === 0);

check("B3 legacy branch reads system.quintessence.temporary directly, NOT system.advantages.quintessence",
	resolveAvailableQuintessence(legacyActor({ quintessenceTemporary: 7 })) === 7);

check("B4 legacy branch tolerates a string value",
	resolveAvailableQuintessence({ type: "Mage", items: [], system: { quintessence: { temporary: "4" } } }) === 4);

/* ============================================================================================ */
/* C. spendableQuintessence — min(available, avatarRating), every named edge                    */
/* ============================================================================================ */

check("C1 the Avatar caps a larger reserve (core:11736/19159's worked example: Avatar 2 caps a 5-point reserve)",
	spendableQuintessence({ available: 5, avatarRating: 2 }) === 2);

check("C2 the reserve caps a larger Avatar",
	spendableQuintessence({ available: 2, avatarRating: 5 }) === 2);

check("C3 0 available caps to 0 regardless of Avatar",
	spendableQuintessence({ available: 0, avatarRating: 5 }) === 0);

check("C4 Avatar 0 caps to 0 regardless of the reserve",
	spendableQuintessence({ available: 5, avatarRating: 0 }) === 0);

check("C5 no Avatar Background (avatarRating null/undefined) applies NO cap — D2's explicit decision",
	spendableQuintessence({ available: 3, avatarRating: null }) === 3 &&
	spendableQuintessence({ available: 3, avatarRating: undefined }) === 3);

check("C6 numeric-string inputs parse correctly",
	spendableQuintessence({ available: "5", avatarRating: "2" }) === 2);

check("C7 never negative/NaN on unusable input",
	spendableQuintessence({ available: "abc", avatarRating: "abc" }) === 0 &&
	spendableQuintessence({ available: -3, avatarRating: -1 }) === 0);

/* ============================================================================================ */
/* D. quintessenceSpendOptions — 0, then -1..-N; just [0] when N = 0                             */
/* ============================================================================================ */

check("D1 with 2 spendable, offers exactly [0, -1, -2] (spec scenario: 2 available, Avatar 3)",
	JSON.stringify(quintessenceSpendOptions({ available: 2, avatarRating: 3 })) === JSON.stringify([0, -1, -2]));

check("D2 the Avatar, not the reserve, sets the ceiling (spec scenario: 5 available, Avatar 2 -> max -2)",
	JSON.stringify(quintessenceSpendOptions({ available: 5, avatarRating: 2 })) === JSON.stringify([0, -1, -2]));

check("D3 with 0 spendable, the ONLY option is 0 (spec scenario: 0 Quintaesencia)",
	JSON.stringify(quintessenceSpendOptions({ available: 0, avatarRating: 3 })) === JSON.stringify([0]));

check("D4 no Avatar Background: options are limited only by the reserve (spec scenario: 3 available, no Avatar)",
	JSON.stringify(quintessenceSpendOptions({ available: 3, avatarRating: null })) === JSON.stringify([0, -1, -2, -3]));

/* ============================================================================================ */
/* E. resolveQuintessenceDischarge — never negative, discrepancy announced, re-validated         */
/* ============================================================================================ */

check("E1 normal case: declaring -2 out of 5 available discharges 2, leaves 3, no discrepancy",
	(() => {
		const r = resolveQuintessenceDischarge({ requestedSpend: -2, available: 5, avatarRating: null });
		return r.spend === 2 && r.remaining === 3 && r.discrepancy === false;
	})());

check("E2 spec scenario: declared -3, only 2 left at write time -> discharges 2, remaining 0, discrepancy true",
	(() => {
		const r = resolveQuintessenceDischarge({ requestedSpend: -3, available: 2, avatarRating: null });
		return r.spend === 2 && r.remaining === 0 && r.discrepancy === true;
	})());

check("E3 never leaves remaining negative even if requested magnitude exceeds available by a lot",
	resolveQuintessenceDischarge({ requestedSpend: -50, available: 3, avatarRating: null }).remaining >= 0);

check("E4 re-validates against the Avatar cap too, not just the reserve",
	(() => {
		const r = resolveQuintessenceDischarge({ requestedSpend: -5, available: 5, avatarRating: 2 });
		return r.spend === 2 && r.discrepancy === true;
	})());

check("E5 declaring 0 (no spend) discharges nothing and flags no discrepancy",
	(() => {
		const r = resolveQuintessenceDischarge({ requestedSpend: 0, available: 5, avatarRating: 2 });
		return r.spend === 0 && r.discrepancy === false;
	})());

/* ============================================================================================ */
/* F. the TEMPLATE must offer the calculated range, never the old fixed fan                     */
/* ============================================================================================ */

for (const { name, src } of templates) {
	check(`F1 (${name}) the fixed 0..-5 fan is GONE from the Quintaesencia radio group`,
		!/name="object\.quintessence"[\s\S]{0,400}numDownToLoop 0 -5/.test(src) &&
		!/numDownToLoop 0 -5[\s\S]{0,400}name="object\.quintessence"/.test(src));

	check(`F2 (${name}) the Quintaesencia radios are built from the calculated quintessenceOptions list`,
		/\{\{#each quintessenceOptions as \|q\|\}\}[\s\S]{0,400}name="object\.quintessence" value="\{\{q\}\}"/.test(src));
}

// The failure this gate missed the first time was not a weak assertion: it was a template nobody
// looked at. So it also checks that the template list covers ALL the templates that render an
// `object.quintessence` radio, so that adding a third one cannot slip by unnoticed again.
{
	const dir = path.join(ROOT, "templates", "dialogs");
	const conRadio = fs.readdirSync(dir)
		.filter((f) => f.endsWith(".hbs"))
		.filter((f) => /name="object\.quintessence"/.test(fs.readFileSync(path.join(dir, f), "utf8")));
	const cubiertas = templates.map((t) => t.name).sort();
	check(`F3 the gate covers ALL templates carrying a Quintaesencia radio (found: ${conRadio.sort().join(", ")})`,
		JSON.stringify(conRadio.sort()) === JSON.stringify(cubiertas));
}

/* ============================================================================================ */
/* G. the DIALOG wires the helpers correctly: import, getData(), and the write's own trigger     */
/* ============================================================================================ */

check("G1 the dialog imports every helper this change adds",
	/import \{[\s\S]*?resolveAvatarRating[\s\S]*?resolveAvailableQuintessence[\s\S]*?quintessenceSpendOptions[\s\S]*?resolveQuintessenceDischarge[\s\S]*?\} from "\.\.\/scripts\/quintessence-helpers\.js";/.test(dialogSrc));

const getDataBody = dialogSrc.match(/async getData\(\) \{[\s\S]*?\n {4}\}\n/);
check("G2 getData() was located in source", getDataBody !== null);

check("G3 getData() feeds the selector from the helpers, not a hand-written range",
	!!getDataBody &&
	/quintessenceSpendOptions\(\{ available: quintessenceAvailable, avatarRating \}\)/.test(getDataBody[0]) &&
	/resolveAvatarRating\(this\.actor\)/.test(getDataBody[0]) &&
	/resolveAvailableQuintessence\(this\.actor\)/.test(getDataBody[0]));

const castSpellBody = dialogSrc.match(/async _castSpell\(event\) \{[\s\S]*?\n {4}\}\n/);
check("G4 _castSpell(event) was located in source", castSpellBody !== null);

check("G5 the discount write lives in _castSpell (where every other post-roll effect is hooked)",
	!!castSpellBody && /resolveQuintessenceDischarge\(\{/.test(castSpellBody[0]));

check("G6 the write happens AFTER the roll resolves, never before it",
	(() => {
		if (!castSpellBody) return false;
		const body = castSpellBody[0];
		const rollIndex = body.indexOf("await DiceRoller(powerRoll)");
		const dischargeIndex = body.indexOf("resolveQuintessenceDischarge(");
		return rollIndex > -1 && dischargeIndex > -1 && rollIndex < dischargeIndex;
	})());

check("G7 the write reuses the SAME two fields the manual wheel already uses — no third route",
	!!castSpellBody &&
	/"system\.temporary": discharge\.remaining/.test(castSpellBody[0]) &&
	/"system\.quintessence\.temporary": discharge\.remaining/.test(castSpellBody[0]));

check("G8 the PC branch resolves the item the same way the rest of this dialog resolves Advantages (actor.api.getAdvantage)",
	!!castSpellBody && /this\.actor\.api\?\.getAdvantage\("quintessence"\)/.test(castSpellBody[0]));

const updateObjectBody = dialogSrc.match(/async _updateObject\(event, formData\)\{[\s\S]*?\n {4}\}\n/);
check("G9 _updateObject(event, formData) was located in source", updateObjectBody !== null);

check("G10 moving the selector (_updateObject, fires on every change) NEVER writes Quintaesencia",
	!!updateObjectBody &&
	!/resolveQuintessenceDischarge/.test(updateObjectBody[0]) &&
	!/system\.quintessence\.temporary/.test(updateObjectBody[0]) &&
	!/getAdvantage\("quintessence"\)/.test(updateObjectBody[0]));

const closeFormBody = dialogSrc.match(/_closeForm\(event\) \{[\s\S]*?\n {4}\}\n/);
check("G11 _closeForm(event) was located in source", closeFormBody !== null);

check("G12 closing the dialog without casting NEVER writes Quintaesencia",
	!!closeFormBody &&
	!/resolveQuintessenceDischarge/.test(closeFormBody[0]) &&
	!/getAdvantage\("quintessence"\)/.test(closeFormBody[0]));

check("G13 the write is gated behind an actual declared spend (< 0), never runs unconditionally",
	!!castSpellBody && /if \(parseInt\(this\.object\.quintessence\) < 0\) \{/.test(castSpellBody[0]));

console.log("test-quintessence.mjs");
for (const line of results) console.log(line);

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
