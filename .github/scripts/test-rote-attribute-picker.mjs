#!/usr/bin/env node
/**
 * The Fórmula (Rote item) sheet's Atributo dropdown must offer all nine M20 Atributos.
 *
 * WHY THIS EXISTS
 * ---------------
 * add-formula-authoring task 3.1 — `select-helpers.js`'s `data.type === "Rote"` branch built its
 * `FormulaAttributes` dropdown by iterating `CONFIG.worldofdarkness.attackAttributes`. That map
 * exists to populate a WEAPON's attack-roll Attribute selector
 * (`wod.attackAttributes` in `module/config.js`) and only has FOUR keys: strength, dexterity,
 * manipulation, wits. It is missing five real M20 Atributos: Resistencia (stamina), Carisma
 * (charisma), Apariencia (appearance), Percepción (perception) and Inteligencia (intelligence).
 *
 * The damage was silent and compounding. `dialog-aretecasting.js`'s `_formulaPool()` already reads
 * the *correct* nine-Atributo map (`CONFIG.worldofdarkness.attributes20`) for its labels, so a
 * Fórmula whose `attribute` is one of the missing five rendered with NOTHING selected in the
 * sheet's dropdown. Worse: `isFormulaRoll()` requires BOTH `attribute` and `ability` to be set, so
 * the very first save of that sheet wiped the (until-then-valid) `attribute` field back to `""`
 * and silently downgraded the Fórmula to a plain Areté roll — no error, no warning, just a wrong
 * roll from then on. `perception` is not a corner case here: it is the Atributo named in this
 * change's own canonical worked example ("Hablar con los Animales": Carisma + Afinidad Animal is
 * a different Fórmula, but Percepción-based Fórmulas exist across the 105-Fórmula corpus).
 *
 * Why no other gate catches this: it is not a template, not an i18n key, not a selector and not a
 * colour, so `template-structure-check`/`label-length-check`/`binder-selector-check` are all blind
 * to it. `js-syntax-check.sh` stays green — iterating the wrong-but-existing object is valid JS.
 * A byte-diff of any kind cannot see it either, because nothing else in the repo asserts what SET
 * of keys this dropdown is supposed to offer. This harness fixes that: it reads `select-helpers.js`
 * to prove the Rote branch no longer mentions `attackAttributes` and does mention `attributes20`,
 * then it ACTUALLY BUILDS the option set the way the branch does (from the real `module/config.js`,
 * imported — not paraphrased) and asserts it is exactly the nine M20 Atributos, with `perception`
 * among them.
 *
 * WHAT IT CHECKS
 * --------------
 * A. source-level: the `Rote` branch's `for (const attribute in CONFIG.worldofdarkness.X)` loop
 *    uses `attributes20`, never `attackAttributes`, and there is exactly one such loop in that
 *    branch (a second loop reading the wrong map would slip past a naive "does not mention" check).
 * B. behavioural: `wod.attributes20`'s key set, executed against the real `module/config.js`, is
 *    exactly the nine M20 Atributos (`{strength, dexterity, stamina, charisma, manipulation,
 *    appearance, perception, intelligence, wits}`) — not a superset, not a subset — and is a
 *    strict superset of `wod.attackAttributes`'s four keys (proving the old map really was missing
 *    real Atributos, not just differently-named ones).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELECT_HELPERS = path.join(ROOT, "module", "scripts", "select-helpers.js");
const CONFIG_JS = path.join(ROOT, "module", "config.js");

const src = fs.readFileSync(SELECT_HELPERS, "utf8");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* ---- A. the Rote branch, read from source ------------------------------- */

const roteBranch = src.match(/if \(data\.type === "Rote"\) \{[\s\S]*?\n {8}\}/);
check("A1 the data.type === \"Rote\" branch was located in source", roteBranch !== null);

const body = roteBranch ? roteBranch[0] : "";

check("A2 the Rote branch does NOT mention attackAttributes (the weapon-attack map)",
	!/attackAttributes/.test(body),
	body ? "" : "(rama no localizada)");

check("A3 the Rote branch DOES iterate CONFIG.worldofdarkness.attributes20",
	/for \(const attribute in CONFIG\.worldofdarkness\.attributes20\)/.test(body));

const attrLoops = body.match(/for \(const attribute in CONFIG\.worldofdarkness\.\w+\)/g) || [];
check("A4 exactly one attribute-map loop in the Rote branch",
	attrLoops.length === 1,
	`found ${attrLoops.length}: ${attrLoops.join(", ")}`);

/* ---- B. execute the real config against the M20 Atributos --------------- */

const { wod } = await import(pathToFileURL(CONFIG_JS).href);

const M20_ATTRIBUTES = new Set([
	"strength", "dexterity", "stamina",
	"charisma", "manipulation", "appearance",
	"perception", "intelligence", "wits"
]);

const attributes20Keys = new Set(Object.keys(wod.attributes20 || {}));

check("B1 wod.attributes20 exists and has exactly nine keys",
	attributes20Keys.size === 9,
	`got ${attributes20Keys.size}: ${[...attributes20Keys].join(", ")}`);

const missingFromAttributes20 = [...M20_ATTRIBUTES].filter((a) => !attributes20Keys.has(a));
const extraInAttributes20 = [...attributes20Keys].filter((a) => !M20_ATTRIBUTES.has(a));
check("B2 wod.attributes20's key set is EXACTLY the nine M20 Atributos",
	missingFromAttributes20.length === 0 && extraInAttributes20.length === 0,
	`missing: [${missingFromAttributes20.join(", ")}]  extra: [${extraInAttributes20.join(", ")}]`);

check("B3 perception is among the offered Atributos (the change's own canonical case)",
	attributes20Keys.has("perception"));

/* Reproduce the exact loop the Rote branch runs, over the REAL config object, and check what a
   user would actually be offered. */
const offered = new Set();
for (const attribute in wod.attributes20) offered.add(attribute);
check("B4 the loop over wod.attributes20 offers all nine M20 Atributos",
	M20_ATTRIBUTES.size === offered.size && [...M20_ATTRIBUTES].every((a) => offered.has(a)),
	`offered: [${[...offered].join(", ")}]`);

/* Proves the OLD map really was a strict, smaller subset — i.e. the bug was a real gap, not a
   naming difference the fix papered over. */
const attackAttributesKeys = new Set(Object.keys(wod.attackAttributes || {}));
check("B5 wod.attackAttributes (the old, wrong map) has only four keys, all real Atributos",
	attackAttributesKeys.size === 4 && [...attackAttributesKeys].every((a) => M20_ATTRIBUTES.has(a)),
	`got ${attackAttributesKeys.size}: ${[...attackAttributesKeys].join(", ")}`);

check("B6 wod.attackAttributes is missing stamina/charisma/appearance/perception/intelligence",
	["stamina", "charisma", "appearance", "perception", "intelligence"]
		.every((a) => !attackAttributesKeys.has(a)));

console.log("test-rote-attribute-picker.mjs");
for (const line of results) console.log(line);

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
