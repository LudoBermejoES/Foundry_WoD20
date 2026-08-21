#!/usr/bin/env node
/**
 * A creature PC must be able to CREATE a Charm.
 *
 * WHY THIS EXISTS
 * ---------------
 * Written 2026-08-05 with the fix it guards. Before it, all six live creature PCs were in a closed
 * loop and nothing in the repo could see it: the Charms section renders only for an actor that
 * already HOLDS a charm (`hascharms && charms.length`), `hascharms` is derived from the items held,
 * and `CreateButtonsPowerv2` — the PC power-create dialog — had no charm branch at all. No charm,
 * no flag, no section, no way to make the first one. Charms could arrive only by Splat drop or by
 * importer.
 *
 * A `buttons.charm` did exist, but in the LEGACY `CreateButtonsPower`, gated on NESTED
 * `settings.powers.hascharms` — a template.json key that is `undefined` on a `type: "PC"` actor by
 * design. So the repo contained something that LOOKED like the missing feature while being
 * unreachable, which is why reading the code was not enough to notice.
 *
 * Every other gate here would stay green if the branch were deleted tomorrow: it is not a
 * `data-action`, not a template, not a localisation key, not a colour. The loss would be silent
 * and would present months later as "creatures can't have charms".
 *
 * WHAT IT CHECKS
 * --------------
 * The gate expression is READ FROM SOURCE, not paraphrased, then executed against fixture actors
 * using the REAL `getSplat` (imported, not reimplemented — hand-copied logic is what rots here).
 * The gate must be splat-based: gating on `hascharms` instead would rebuild the exact loop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "module", "scripts", "create-helpers.js");
const src = fs.readFileSync(SRC, "utf8");

/* ---- 1. the gate must exist, exactly once, and be the splat-based one ---- */
const GATE = /if \(\(getSplat\(actor\) === CONFIG\.worldofdarkness\.splat\.creature\) \|\| actor\.system\.settings\.hascharms\) \{\s*\n\s*allButtons\.charm = \{/;
const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

check("A1 the charm gate exists in CreateButtonsPowerv2", GATE.test(src));
check("A2 exactly one `allButtons.charm =` assignment", (src.match(/allButtons\.charm = /g) || []).length === 1);

/* The legacy button must be left alone — it belongs to the other schema. */
check("A3 the legacy nested-flag button is untouched",
	/if \(actor\.system\.settings\.powers\.hascharms\) \{\s*\n\s*buttons\.charm = \{/.test(src));

/* The created item must match what CreateItemPower("charm") makes, or the two paths diverge. */
const mine = src.match(/allButtons\.charm = \{[\s\S]*?type: "wod\.types\.charm"/);
check("A4 the button creates a Power of type wod.types.charm with game werewolf",
	!!mine && /game: "werewolf"/.test(mine[0]));

/* ---- 2. execute the gate against fixture actors ---- */
const CONFIG = { worldofdarkness: { splat: { creature: "creature", mage: "mage", werewolf: "werewolf" } } };

/* The REAL getSplat, imported — not a paraphrase. It has no imports of its own and touches no
   Foundry global, so it loads standalone; importing it means this harness cannot drift from the
   precedence the gate actually uses. An earlier draft reimplemented it here, which is the exact
   hand-copy rot this repo keeps being bitten by. */
const { getSplat } = await import(pathToFileURL(path.join(ROOT, "module", "scripts", "splat-helpers.js")).href);

/* THE GATE IS EXTRACTED FROM SOURCE AND EXECUTED, not restated here. An earlier draft hardcoded the
   condition, and a mutation that swapped the real gate for `hascharms`-only still passed every
   behavioural case below — only the regex above noticed. A behavioural check that cannot see the
   behaviour it names is worse than none, so the condition text is lifted out of the file and
   compiled. */
const condMatch = src.match(/\n\t\tif \(([^\n]*?)\) \{\n\t\t\tallButtons\.charm = \{/);
if (!condMatch) {
	console.error("test-charm-button: could not extract the charm gate condition from source — the\n" +
		"shape changed and this harness can no longer execute what it claims to test.");
	process.exit(2);
}
const gate = new Function("actor", "CONFIG", "getSplat", `return (${condMatch[1]});`);
const evalGate = (actor) => gate(actor, CONFIG, getSplat);

check("A5 the extracted condition gates on the SPLAT, not just the flag",
	/splat\.creature/.test(condMatch[1]), condMatch[1].trim());

const mk = (o) => ({ type: "PC", system: { settings: { variantsheet: "", splat: "", game: "", hascharms: false, ...o } } });

const cases = [
	["a wodchar creature (variantsheet)", mk({ variantsheet: "creature", splat: "creature", game: "mage" }), true],
	["a splat-item creature (splat only)", mk({ splat: "creature", game: "mage" }), true],
	["War Wolves as it exists live", mk({ splat: "creature", game: "mage", hascharms: true }), true],
	["a creature with NO charms yet (the loop this fixes)", mk({ splat: "creature", game: "mage", hascharms: false }), true],
	["an ordinary mage", mk({ splat: "mage", game: "mage" }), false],
	["a vampire", mk({ splat: "vampire", game: "vampire" }), false],
	["a werewolf — charms are werewolf-FLAVOURED but not werewolf-owned", mk({ splat: "werewolf", game: "werewolf" }), false],
	["a plain mortal", mk({ splat: "mortal", game: "mortal" }), false],
	["a non-creature that legitimately carries the flag", mk({ splat: "mortal", game: "mortal", hascharms: true }), true]
];

for (const [name, actor, want] of cases) {
	const got = evalGate(actor);
	check(`B ${name} -> ${want ? "button" : "no button"}`, got === want, got === want ? "" : `got ${got}`);
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
