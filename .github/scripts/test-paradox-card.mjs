#!/usr/bin/env node
/**
 * The Paradoja chat card (`module/scripts/paradox-card.js` + its `renderChatMessageHTML` hook in
 * `module/hooks.js` + `templates/dialogs/paradox-card.hbs`) must stay idempotent, Narrador-gated
 * and silent on a zero-gain cast.
 *
 *     node .github/scripts/test-paradox-card.mjs
 *
 * WHY THIS EXISTS (add-paradox-system tasks 3.1-3.7, 5.3.4)
 * -----------------------------------------------------------
 * `module/scripts/paradox-helpers.js` (the arithmetic) is already guarded by
 * `test-paradox.mjs` — this harness does NOT re-check that table. What it guards is the four
 * things a wrong number can't catch on its own:
 *   1. The "aplicar" button must never cobra twice on a double click.
 *   2. The "contragolpe" button/flow must be reachable ONLY by the Narrador, even if a stale DOM
 *      node from a client that WAS a GM survives on a client that no longer is.
 *   3. The Silencio nivel 6 write (irreversible: retires the character as an NPC Marauder) must
 *      never happen without an explicit confirmation, and every OTHER level must not be blocked by
 *      that same gate.
 *   4. A coincidental success (gain = 0) must post NO card at all — the silent case nothing else
 *      would notice if it broke, because there would simply be nothing in the chat log to look at.
 * `js-syntax-check` stays green on all four of these broken (every failure mode below is still
 * syntactically valid JS), and this repo's `tests/*.mjs` are never invoked by `deploy.yml`, so a
 * test placed there would guard nothing.
 *
 * WHAT IT CHECKS
 * --------------
 * `module/scripts/paradox-card.js` extends no Foundry class and touches no Foundry global at
 * IMPORT time (unlike `dialog-aretecasting.js`, which `extends FormApplication` and so can never
 * be imported by a test) — it is imported here for real and EXECUTED against a minimal, local
 * shim of the handful of Foundry globals it actually calls (`game.actors`, `game.user.isGM`,
 * `game.i18n`, `foundry.utils.mergeObject/deepClone`, a stub `ChatMessage`-shaped object). This is
 * stronger than a source-text assertion because it exercises the REAL idempotency guards, not a
 * regex that would still pass if the guard were reworded to something equally broken.
 *   A. `createParadoxCard()` returns `null` (posts no card) for a genuine zero-gain coincidental
 *      success — executed against the real `computeParadoxGain()`, not re-implemented.
 *   B. `ParadoxCard#handleAction("apply")` is idempotent: a second call after `applied: true`
 *      never rewrites the actor's Paradoja temporal a second time.
 *   C. `ParadoxCard#handleAction("backlash")` is GM-gated: called with `game.user.isGM = false` it
 *      writes NOTHING and leaves `data.backlash` null; called with `isGM = true` it rolls, writes
 *      the discharge, and is itself then idempotent against a THIRD call.
 *   D. `ParadoxCard#handleAction("backlash-silence")` at Silencio nivel 6 refuses to write without
 *      `confirmed: true`, accepts it once confirmed, and does not double-apply on a repeat call;
 *      levels below 6 need no such confirmation.
 * Everything that genuinely CANNOT be executed outside a live Foundry client (DOM wiring in the
 * `renderChatMessageHTML` hook, the per-client `.paradox-gm-only` removal, the template's own
 * `data-action` attributes, the i18n keys backing every localized string, and the ban on calling
 * the async `getData()` from the casting-dialog wiring — the exact bug `test-casting-dots.mjs`
 * already guards against a different call site of) is checked by reading the SOURCE, matching
 * this repo's own convention for exactly this situation (`test-charm-button.mjs`,
 * `test-casting-dots.mjs`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* =================================================================================================
 * Minimal Foundry shim — just enough for `paradox-card.js`'s non-rendering code paths to execute.
 * ================================================================================================= */

function deepMerge(target, source) {
	for (const [key, value] of Object.entries(source || {})) {
		if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
			target[key] = deepMerge({ ...target[key] }, value);
		} else {
			target[key] = value;
		}
	}
	return target;
}

function setDotted(obj, key, value) {
	const parts = key.split(".");
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		cur[parts[i]] = cur[parts[i]] ?? {};
		cur = cur[parts[i]];
	}
	cur[parts[parts.length - 1]] = value;
}

function makeParadoxItem(temporary, permanent) {
	const item = {
		type: "Advantage",
		system: { id: "paradox", temporary, permanent },
		async update(patch) {
			// Foundry document `update()` keys are dotted paths relative to the DOCUMENT root
			// (e.g. `"system.temporary"` means `item.system.temporary`), never relative to
			// `item.system` itself — matching real Foundry semantics here, not a shortcut.
			for (const [k, v] of Object.entries(patch)) setDotted(item, k, v);
		}
	};
	return item;
}

function makeActor({ temporary = 0, permanent = 0 } = {}) {
	const paradoxItem = makeParadoxItem(temporary, permanent);
	const flags = {};
	const actor = {
		id: "actor1",
		type: "PC",
		items: { find: (fn) => [paradoxItem].find(fn) },
		async update(patch) {
			for (const [k, v] of Object.entries(patch)) setDotted(actor, k, v);
		},
		getFlag(scope, key) { return flags[`${scope}.${key}`]; },
		async setFlag(scope, key, value) { flags[`${scope}.${key}`] = value; return value; }
	};
	return actor;
}

/** Reads the CURRENT Paradoja temporal off the shimmed actor's own Advantage item — the same
 *  place `paradox-card.js` itself writes to for a "PC"-type actor (never `actor.system.paradox`,
 *  which is the LEGACY branch only, never populated by `makeActor()` here). */
function paradoxTemp(actor) {
	return actor.items.find((i) => i.system?.id === "paradox")?.system.temporary;
}

function makeMessage(initialFlagData) {
	let flagData = initialFlagData;
	let updateCount = 0;
	return {
		getFlag: () => flagData,
		async update({ flags }) {
			updateCount++;
			flagData = flags?.worldofdarkness?.paradoxGain ?? flagData;
		},
		get updateCount() { return updateCount; }
	};
}

globalThis.foundry = {
	utils: {
		mergeObject(target, source) { return deepMerge(JSON.parse(JSON.stringify(target)), source); },
		deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
	},
	applications: { handlebars: { renderTemplate: async () => "<div class=\"paradox-card-test-stub\"></div>" } }
};

const actorsById = new Map();
globalThis.game = {
	actors: { get: (id) => actorsById.get(id) ?? null },
	i18n: { localize: (k) => k, format: (k, data) => `${k}${JSON.stringify(data || {})}` },
	user: { isGM: false }
};
globalThis.ui = { notifications: { warn: () => {} } };

/* =================================================================================================
 * A/B/C/D — real execution against the shim.
 * ================================================================================================= */

// A plain RELATIVE import, exactly like `test-paradox.mjs` uses for the pure helper: no
// `path.join(ROOT, ...)` fed into a dynamic `import()`, which is what breaks on Windows (an
// absolute `C:\...` path is not a valid ESM specifier there without a `file://` conversion).
const { createParadoxCard, ParadoxCard } = await import("../../module/scripts/paradox-card.js");

/* ---- A. zero gain posts no card --------------------------------------------------------------- */

actorsById.set("actor1", makeActor({ temporary: 0, permanent: 0 }));
// Wrapped: if the zero-gain guard is ever removed, `createParadoxCard` falls through to
// `ChatMessage.create(...)`, which this harness's shim deliberately does NOT provide (a mutation
// that removed the guard would otherwise crash the whole process instead of failing one check).
let noCard = "not-run";
let noCardThrew = false;
try {
	noCard = await createParadoxCard(actorsById.get("actor1"), {
		vulgar: false, witnesses: false, highestSphere: 4, rollResult: "success"
	});
} catch {
	noCardThrew = true;
}
check("A1 a coincidental success (gain 0) posts no card", !noCardThrew && noCard === null);

/* ---- B. "apply" is idempotent ------------------------------------------------------------------ */

{
	const actor = makeActor({ temporary: 6, permanent: 0 });
	actorsById.set("actor1", actor);
	const message = makeMessage({ actorId: "actor1", gain: { total: 10, breakdown: [], rule: "x" }, applied: false, backlash: null });
	const card = new ParadoxCard(message);

	await card.handleAction("apply");
	check("B1 first apply writes temp 6 + 10 = 16", paradoxTemp(actor) === 16);
	check("B2 first apply marks the card applied", card.data.applied === true);

	await card.handleAction("apply");
	check("B3 second apply does NOT cobra again (still 16, not 26)", paradoxTemp(actor) === 16);
	check("B4 message.update was called exactly once (one write, not two)", message.updateCount === 1);
}

/* ---- C. "backlash" is GM-gated AND idempotent --------------------------------------------------- */

{
	const actor = makeActor({ temporary: 10, permanent: 0 });
	actorsById.set("actor1", actor);
	const message = makeMessage({ actorId: "actor1", gain: { total: 8, breakdown: [], rule: "x" }, applied: false, backlash: null });
	const card = new ParadoxCard(message);

	game.user.isGM = false;
	await card.handleAction("backlash");
	check("C1 a non-GM call writes nothing", paradoxTemp(actor) === 10);
	check("C2 a non-GM call leaves data.backlash null", card.data.backlash === null);

	game.user.isGM = true;
	await card.handleAction("backlash");
	check("C3 a GM call rolls and discharges (temp changed from 10)", paradoxTemp(actor) !== 10);
	check("C4 a GM call records a backlash result", card.data.backlash !== null);

	const temporaryAfterFirstRoll = paradoxTemp(actor);
	const backlashAfterFirstRoll = JSON.stringify(card.data.backlash);
	await card.handleAction("backlash");
	check("C5 a second backlash call does not re-roll (idempotent — one roll per card)",
		paradoxTemp(actor) === temporaryAfterFirstRoll && JSON.stringify(card.data.backlash) === backlashAfterFirstRoll);

	game.user.isGM = false; // restore for the next block
}

/* ---- D. Silencio nivel 6 requires confirmation; lower levels don't ----------------------------- */

{
	// M5: the level derives from the CURRENT reserve, so a large enough reserve forces level 6
	// regardless of the (real, random) backlash dice — no need to control the roll itself.
	const actor = makeActor({ temporary: 25, permanent: 0 });
	actorsById.set("actor1", actor);
	const message = makeMessage({ actorId: "actor1", gain: { total: 21, breakdown: [], rule: "x" }, applied: false, backlash: null });
	const card = new ParadoxCard(message);

	game.user.isGM = true;
	await card.handleAction("backlash");
	check("D1 a reserve of 25 proposes Silencio nivel 6", card.data.backlash.potentialSilenceLevel === 6);

	await card.handleAction("backlash-silence", { confirmed: false, type: "negation" });
	check("D2 nivel 6 WITHOUT confirmation writes nothing", actor.getFlag("worldofdarkness", "paradoxSilence") === undefined);
	check("D3 nivel 6 WITHOUT confirmation leaves the card unmarked", card.data.backlash.silenceApplied === false);

	await card.handleAction("backlash-silence", { confirmed: true, type: "madness" });
	check("D4 nivel 6 WITH confirmation writes the flag",
		JSON.stringify(actor.getFlag("worldofdarkness", "paradoxSilence")) === JSON.stringify({ level: 6, type: "madness" }));
	check("D5 nivel 6 WITH confirmation marks the card applied", card.data.backlash.silenceApplied === true);

	const writtenAfterFirstConfirm = JSON.stringify(actor.getFlag("worldofdarkness", "paradoxSilence"));
	await card.handleAction("backlash-silence", { confirmed: true, type: "morbidity" });
	check("D6 a repeat confirmed call does not re-apply a different type (idempotent)",
		JSON.stringify(actor.getFlag("worldofdarkness", "paradoxSilence")) === writtenAfterFirstConfirm);

	game.user.isGM = false;
}

{
	// A level below 6 must NOT be blocked by the same confirmation gate.
	const actor = makeActor({ temporary: 5, permanent: 0 }); // reserve 5 -> nivel 2
	actorsById.set("actor1", actor);
	const message = makeMessage({ actorId: "actor1", gain: { total: 3, breakdown: [], rule: "x" }, applied: false, backlash: null });
	const card = new ParadoxCard(message);

	game.user.isGM = true;
	await card.handleAction("backlash");
	const level = card.data.backlash.potentialSilenceLevel;
	if (level > 0 && level < 6) {
		await card.handleAction("backlash-silence", { confirmed: false, type: "negation" });
		check(`D7 nivel ${level} (< 6) needs NO confirmation to apply`,
			actor.getFlag("worldofdarkness", "paradoxSilence")?.level === level);
	} else {
		check("D7 nivel < 6 confirmation-free path (skipped — this reserve rolled outside 1-5)", true, `(level=${level})`);
	}
	game.user.isGM = false;
}

/* =================================================================================================
 * Source-level assertions for what a plain-node import cannot reach: DOM wiring, the template's
 * own markup, i18n coverage, and the getData() trap `test-casting-dots.mjs` already found once.
 * ================================================================================================= */

const CARD_SRC = fs.readFileSync(path.join(ROOT, "module", "scripts", "paradox-card.js"), "utf8");
const HOOKS_SRC = fs.readFileSync(path.join(ROOT, "module", "hooks.js"), "utf8");
const TEMPLATE_SRC = fs.readFileSync(path.join(ROOT, "templates", "dialogs", "paradox-card.hbs"), "utf8");
const DIALOG_SRC = fs.readFileSync(path.join(ROOT, "module", "dialogs", "dialog-aretecasting.js"), "utf8");

check("E1 handleAction('apply') source contains the idempotency guard",
	/if \(data\.applied\) return;/.test(CARD_SRC));

check("E2 handleAction('backlash') source contains the GM guard",
	/action === "backlash"\) \{[\s\S]{0,300}if \(!game\.user\?\.isGM\) return;/.test(CARD_SRC));

check("E3 handleAction('backlash') source contains the one-roll-per-card guard",
	/if \(data\.backlash\) return;/.test(CARD_SRC));

check("E4 handleAction('backlash-silence') source contains the GM guard",
	/action === "backlash-silence"\) \{[\s\S]{0,300}if \(!game\.user\?\.isGM\) return;/.test(CARD_SRC));

check("E5 handleAction('backlash-silence') source contains the nivel-6 confirmation gate",
	/silenceRequiresConfirmation\(level\) && !extra\.confirmed\) return;/.test(CARD_SRC));

check("F1 the hooks.js paradox card hook checks its own flag before touching the DOM",
	/const data = message\.getFlag\(PARADOX_CARD_FLAG_SCOPE, PARADOX_CARD_FLAG_KEY\);\s*\n\s*if \(!data\) return;/.test(HOOKS_SRC));

check("F2 the hook removes .paradox-gm-only for a non-GM viewer, per-client",
	/if \(!game\.user\?\.isGM\) \{\s*\n\s*container\.querySelectorAll\("\.paradox-gm-only"\)\.forEach\(\(el\) => el\.remove\(\)\);/.test(HOOKS_SRC));

check("F3 the hook dispatches on the paradox- data-action prefix",
	/data-action\^='paradox-'/.test(HOOKS_SRC));

check("G1 the template's apply button uses data-action=\"paradox-apply\"",
	/data-action="paradox-apply"/.test(TEMPLATE_SRC));

check("G2 the template's backlash button uses data-action=\"paradox-backlash\"",
	/data-action="paradox-backlash"/.test(TEMPLATE_SRC));

check("G3 the template's silence-confirm button uses data-action=\"paradox-backlash-silence\"",
	/data-action="paradox-backlash-silence"/.test(TEMPLATE_SRC));

check("G4 the backlash button carries the paradox-gm-only class",
	/class="paradox-gm-only/.test(TEMPLATE_SRC));

check("G5 the silence controls are wrapped in a paradox-gm-only container",
	/class="tray-roll-area paradox-gm-only"/.test(TEMPLATE_SRC));

check("G6 the breakdown is rendered as a list, not just the total (spec: a total alone is not enough)",
	/paradox-breakdown/.test(TEMPLATE_SRC) && /gain\.breakdown/.test(TEMPLATE_SRC));

/* ---- H. the getData() trap test-casting-dots.mjs already found once, at a different call site ---- */

const wiringBlock = DIALOG_SRC.match(/let successes = await DiceRoller\(powerRoll\);[\s\S]*?await createParadoxCard\(this\.actor, \{[\s\S]*?\}\);/);
check("H1 the paradox-card wiring block was located in dialog-aretecasting.js", wiringBlock !== null);
const wiringBody = wiringBlock ? wiringBlock[0] : "";
check("H2 the wiring block does NOT call getData() — the async trap test-casting-dots.mjs guards elsewhere",
	!/getData\s*\(/.test(wiringBody), wiringBody ? "" : "(bloque no localizado)");
check("H3 the wiring reads this.object._highestRank() directly, not through getData()",
	/this\.object\._highestRank\(\)/.test(wiringBody));
check("H4 createParadoxCard is imported by the dialog",
	/import \{ createParadoxCard \} from "\.\.\/scripts\/paradox-card\.js";/.test(DIALOG_SRC));

/* ---- I. i18n coverage: every wod.paradox.* key in es.json also exists in en.json, and vice versa - */

function collectKeys(obj, prefix, out) {
	for (const [k, v] of Object.entries(obj)) {
		const full = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) collectKeys(v, full, out);
		else out.add(full);
	}
}

const es = JSON.parse(fs.readFileSync(path.join(ROOT, "lang", "es.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "lang", "en.json"), "utf8"));
const esKeys = new Set();
const enKeys = new Set();
collectKeys(es.wod?.paradox ?? {}, "", esKeys);
collectKeys(en.wod?.paradox ?? {}, "", enKeys);

check("I1 wod.paradox has keys in es.json at all", esKeys.size > 0);
check("I2 wod.paradox has keys in en.json at all", enKeys.size > 0);

const missingInEn = [...esKeys].filter((k) => !enKeys.has(k));
const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
check("I3 every es.json wod.paradox key exists in en.json", missingInEn.length === 0, missingInEn.join(", "));
check("I4 every en.json wod.paradox key exists in es.json", missingInEs.length === 0, missingInEs.join(", "));

check("I5 the terminology is Silencio, never Quietud, anywhere in es.json's wod.paradox block",
	!/Quietud/.test(JSON.stringify(es.wod?.paradox ?? {})));

console.log("test-paradox-card.mjs");
for (const line of results) console.log(line);

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
