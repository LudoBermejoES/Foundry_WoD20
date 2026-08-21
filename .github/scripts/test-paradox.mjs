#!/usr/bin/env node
/**
 * Offline behavioural harness for `module/scripts/paradox-helpers.js` — the Paradoja gain
 * table and the contragolpe (backlash) engine.
 *
 *     node .github/scripts/test-paradox.mjs
 *
 * WHY THIS EXISTS (add-paradox-system)
 * -------------------------------------
 * Before this change, Paradoja was a MANUAL counter with zero connection to casting: the word
 * "paradox" never appeared in `dialog-aretecasting.js` or `roll-dice.js`, and Silencio/contragolpe
 * did not exist anywhere in the repo (verified by grep — see `proposal.md`'s Why section). Once
 * `computeParadoxGain`/`computeBacklash` exist, they become the SINGLE place the game's actual
 * Paradoja arithmetic lives; a silent regression there would misprice every vulgar cast at the
 * table and nothing else in this repo would notice; `js-syntax-check` stays green on a wrong
 * formula (bad arithmetic is still syntactically valid JS), and the repo's `tests/*.mjs` files are
 * never invoked by `deploy.yml` at all, so a test placed there would guard nothing.
 *
 * WHAT IT CHECKS
 * --------------
 * The REAL helper is imported (never reimplemented — hand-copied logic is what rots in this repo).
 *   A. The five rows of the gain table, each cited against the corpus line it replicates.
 *   B. The book's own worked example end to end (`core:20179-20213`): success -> 1; botch -> 10;
 *      reserve 6 -> 16; a 16-dice contragolpe rolling 10 successes discharges 10 and proposes 10
 *      bashing dice.
 *   C. `E↑` is the HIGHEST Sphere involved, never the sum (Correspondencia 4 / Vida 3 -> 4, not 7).
 *   D. Ritual tax: +1 per roll after the first, cumulative, never reset by an intermediate failure,
 *      and discarded entirely if the ritual's FINAL result is a success.
 *   E. M1 (a vulgar simple failure pays) in both switch positions, so the table decision is visible in
 *      the test, not only in a comment.
 *   F. Contragolpe discharge: `min(successes, temporary)`; a FAILED contragolpe discharges everything
 *      with NO damage (the result most likely to be implemented backwards); the permanent side
 *      never discharges and returns to the pool for the next contragolpe.
 *   G. Every row boundary of the contragolpe table: 5/6, 10/11, 15/16, 20/21.
 *   H. Defecto degree per row, and the amplification rule (existing Defecto is raised, not
 *      replaced by an unrelated new one).
 *   I. Silencio level from the CURRENT reserve (not from what was discharged), the book's own
 *      Jodi Blake example (13 -> level 4), and the level-6 confirmation boundary.
 *   J. M4's burn-dice extrapolation toggle: rows 1-10 apply the base rule regardless of the flag;
 *      rows 11+ only apply it when the flag is on.
 */
// The helper is dependency-free (no `game`/`CONFIG`/Foundry classes), so it is imported as an
// ordinary static ES module via a RELATIVE path — no `path.join(ROOT, ...)` fed to a dynamic
// `import()`. That pattern is what breaks 10 of the other 11 `.github/scripts/*.mjs` harnesses on
// Windows: an absolute path like `C:\...` handed to `import()` is not a valid ESM specifier (Node
// requires a `file://` URL there), and `new URL(import.meta.url).pathname` on this platform yields
// a leading `/C:/...` that every `node:fs` call then rejects too. A static relative import needs
// neither conversion and works identically on every platform, so this harness sidesteps the whole
// class of bug instead of joining the 10.
import {
	computeParadoxGain,
	computeBacklash,
	highestSphereRank,
	ritualRollIncrement,
	resolveRitualAccumulation,
	silenceLevel,
	silenceRequiresConfirmation,
	amplifyDefect,
	backlashRow,
	backlashThresholds,
} from "../../module/scripts/paradox-helpers.js";

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* =================================================================================================
 * A. The five rows of the gain table
 * ================================================================================================= */

check("A1 coincidental success -> 0 (core:17594, 19614)",
	computeParadoxGain({ vulgar: false, rollResult: "success", highestSphere: 4 }).total === 0);

check("A2 vulgar success -> a fixed 1 point, no witnesses (core:17596, 19615)",
	computeParadoxGain({ vulgar: true, witnesses: false, rollResult: "success", highestSphere: 4 }).total === 1);

check("A2b vulgar success -> a fixed 1 point, WITH witnesses (witnesses change nothing on a success)",
	computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "success", highestSphere: 4 }).total === 1);

check("A3 coincidental simple failure -> 0",
	computeParadoxGain({ vulgar: false, rollResult: "fail", highestSphere: 5 }).total === 0);

check("A4 coincidental botch -> E↑, never a fixed 1 point (core:19575)",
	computeParadoxGain({ vulgar: false, rollResult: "botch", highestSphere: 5 }).total === 5 &&
	computeParadoxGain({ vulgar: false, rollResult: "botch", highestSphere: 2 }).total === 2);

check("A5 vulgar botch without witnesses -> 1 + E↑ (core:19576)",
	computeParadoxGain({ vulgar: true, witnesses: false, rollResult: "botch", highestSphere: 3 }).total === 4);

check("A6 vulgar botch with witnesses -> 2 + (2 × E↑) (core:19577)",
	computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "botch", highestSphere: 3 }).total === 8);

check("A7 breakdown is non-empty and auditable (design.md D1's requirement, not decorative)",
	Array.isArray(computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "botch", highestSphere: 3 }).breakdown) &&
	computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "botch", highestSphere: 3 }).breakdown.length > 0);

/* =================================================================================================
 * B. The book's own worked example, end to end (core:20179-20213)
 *    Aria, Areté 6, Tiempo 4, vulgar with witnesses.
 * ================================================================================================= */

const ariaSuccess = computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "success", highestSphere: 4 });
check("B1 Aria's successful cast -> 1 point", ariaSuccess.total === 1, `got ${ariaSuccess.total}`);

const ariaBotch = computeParadoxGain({ vulgar: true, witnesses: true, rollResult: "botch", highestSphere: 4 });
check("B2 Aria's botched cast -> 10 points (2 + 2x4)", ariaBotch.total === 10, `got ${ariaBotch.total}`);

const ariaReserveBefore = 6;
const ariaReserveAfter = ariaReserveBefore + ariaBotch.total;
check("B3 reserve 6 + 10 -> 16", ariaReserveAfter === 16, `got ${ariaReserveAfter}`);

// 16 dice at difficulty 6: 10 explicit sixes (successes), 6 explicit sub-six non-one faces (no
// botch contamination).
const ariaDice = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 2, 3, 4, 5, 2, 3];
const ariaBacklash = computeBacklash({ temporaryParadox: ariaReserveAfter, permanentParadox: 0, dice: ariaDice });

check("B4 the backlash rolls exactly 16 dice", ariaBacklash.diceRolled === 16, `got ${ariaBacklash.diceRolled}`);
check("B5 10 successes counted", ariaBacklash.netSuccesses === 10, `got ${ariaBacklash.netSuccesses}`);
check("B6 discharges exactly 10 points (core:20205-20211)", ariaBacklash.discharge === 10, `got ${ariaBacklash.discharge}`);
check("B7 leaves 6 temporary Paradoja behind", ariaBacklash.remainingTemporary === 6, `got ${ariaBacklash.remainingTemporary}`);
check("B8 proposes 10 dice of bashing damage", !!ariaBacklash.burnDice && ariaBacklash.burnDice.type === "bashing" && ariaBacklash.burnDice.count === 10,
	JSON.stringify(ariaBacklash.burnDice));

/* =================================================================================================
 * C. Highest Sphere, never the sum
 * ================================================================================================= */

check("C1 Correspondencia 4 / Vida 3 -> 4, never 7 (core:19575)",
	highestSphereRank({ correspondence: 4, life: 3 }) === 4);

check("C2 computeParadoxGain fed that same selection via highestSphereRank -> 4 points on a coincidental botch",
	computeParadoxGain({ vulgar: false, rollResult: "botch", highestSphere: highestSphereRank({ correspondence: 4, life: 3 }) }).total === 4);

check("C3 string ratings parse, don't concatenate",
	highestSphereRank({ life: "2", mind: "5" }) === 5);

check("C4 tolerates the dialog's own initial empty-Array shape",
	highestSphereRank([]) === 0);

check("C5 tolerates a missing/null selection, and never returns NaN/negative",
	highestSphereRank(undefined) === 0 && highestSphereRank(null) === 0 &&
	highestSphereRank({ a: -3, b: "n/a" }) === 0);

/* =================================================================================================
 * D. Ritual tax: +1 per roll after the first, cumulative, no reset on failure, discarded on
 *    success.
 * ================================================================================================= */

check("D1 first ritual roll adds no tax", ritualRollIncrement(1) === 0);
check("D2 second and third rolls each add exactly 1", ritualRollIncrement(2) === 1 && ritualRollIncrement(3) === 1);

// A 4-roll ritual: roll 1 fails (no tax), roll 2 fails (+1), roll 3 botches (+1, tax unaffected by
// the botch), roll 4 finally succeeds (+1). Total ritual tax must be 3 regardless of the
// intermediate failure/botch — "sin reiniciarse tras un fracaso".
const ritualRolls = [
	{ n: 1, rollResult: "fail" },
	{ n: 2, rollResult: "fail" },
	{ n: 3, rollResult: "botch" },
	{ n: 4, rollResult: "success" },
];
let ritualTaxAccumulated = 0;
for (const r of ritualRolls) {
	ritualTaxAccumulated += ritualRollIncrement(r.n);
}
check("D3 ritual tax is 3 after 4 rolls, unaffected by the intermediate fail/botch", ritualTaxAccumulated === 3, `got ${ritualTaxAccumulated}`);

check("D4 a ritual that ends in SUCCESS discards the accumulated tax entirely",
	resolveRitualAccumulation(ritualTaxAccumulated, true) === 0);

check("D5 a ritual that ends in FAILURE keeps the accumulated tax",
	resolveRitualAccumulation(ritualTaxAccumulated, false) === 3);

check("D6 computeParadoxGain surfaces the per-roll ritual tax in its own breakdown line",
	computeParadoxGain({ vulgar: false, rollResult: "success", highestSphere: 0, ritualRollNumber: 3 }).total === 1 &&
	computeParadoxGain({ vulgar: false, rollResult: "success", highestSphere: 0, ritualRollNumber: 1 }).total === 0);

/* =================================================================================================
 * E. M1, in both switch positions
 * ================================================================================================= */

check("E1 M1 ON (default): a simple failure on a vulgar cast costs 1 point (minority reading, core:17567)",
	computeParadoxGain({ vulgar: true, witnesses: false, rollResult: "fail", highestSphere: 4 }).total === 1);

check("E2 M1 OFF (this table's house rule): the same roll costs 0",
	computeParadoxGain({ vulgar: true, witnesses: false, rollResult: "fail", highestSphere: 4, options: { simpleFailureCosts: false } }).total === 0);

check("E3 M1 never touches a coincidental simple failure either way",
	computeParadoxGain({ vulgar: false, rollResult: "fail", highestSphere: 4, options: { simpleFailureCosts: false } }).total === 0 &&
	computeParadoxGain({ vulgar: false, rollResult: "fail", highestSphere: 4, options: { simpleFailureCosts: true } }).total === 0);

/* =================================================================================================
 * F. Discharge rule, the botch-benefits-the-mage case, and the permanent side that never discharges
 * ================================================================================================= */

check("F1 discharge is min(successes, temporary) when successes < temporary",
	computeBacklash({ temporaryParadox: 7, permanentParadox: 0, dice: [6, 6, 6, 6, 6, 2, 3] }).discharge === 5);

// Successes can only outnumber `temporaryParadox` when `permanentParadox` supplies the extra
// dice (the pool is ALWAYS temp+perm, so with permanent=0 successes can never exceed temp on
// their own) — this is the case that actually exercises the min() cap rather than coinciding
// with it by construction.
check("F2 discharge caps at the temporary pool even with more successes than temporary points",
	computeBacklash({ temporaryParadox: 2, permanentParadox: 3, dice: [6, 6, 6, 6, 6] }).discharge === 2);

// A backlash botch: zero raw successes, at least one 1.
const botchRoll = computeBacklash({ temporaryParadox: 8, permanentParadox: 2, dice: [1, 2, 3, 4, 5, 4, 3, 2, 5, 4] });
check("F3 a FAILED backlash roll discharges ALL the temporary Paradoja", botchRoll.botch === true && botchRoll.discharge === 8, JSON.stringify(botchRoll));
check("F4 a FAILED backlash roll causes NO burn dice and NO Defecto (core:19643 — benefits the mage)",
	botchRoll.burnDice === null && botchRoll.defect.degree === "none");

// Permanent Paradoja: 3 permanent + 7 temporary suffer a backlash with 5 successes.
const permRoll = computeBacklash({ temporaryParadox: 7, permanentParadox: 3, dice: [6, 6, 6, 6, 6, 2, 3, 4, 5, 3] });
check("F5 uses (temporary + permanent) = 10 dice", permRoll.diceRolled === 10, `got ${permRoll.diceRolled}`);
check("F6 discharges only the temporary side (5 points), permanent untouched",
	permRoll.discharge === 5 && permRoll.remainingPermanent === 3, JSON.stringify(permRoll));

// The permanent side must come back and count again on a SECOND backlash for the same character.
const secondRoll = computeBacklash({ temporaryParadox: permRoll.remainingTemporary, permanentParadox: permRoll.remainingPermanent, dice: [6, 6, 3, 4, 3] });
check("F7 the permanent side is included again in the NEXT backlash's dice pool",
	secondRoll.diceRolled === permRoll.remainingTemporary + permRoll.remainingPermanent);

/* =================================================================================================
 * G. Every row boundary: 5/6, 10/11, 15/16, 20/21
 * ================================================================================================= */

check("G1 boundary 5 -> row '1-5'", backlashRow(5) === "1-5");
check("G2 boundary 6 -> row '6-10'", backlashRow(6) === "6-10");
check("G3 boundary 10 -> row '6-10'", backlashRow(10) === "6-10");
check("G4 boundary 11 -> row '11-15'", backlashRow(11) === "11-15");
check("G5 boundary 15 -> row '11-15'", backlashRow(15) === "11-15");
check("G6 boundary 16 -> row '16-20'", backlashRow(16) === "16-20");
check("G7 boundary 20 -> row '16-20'", backlashRow(20) === "16-20");
check("G8 boundary 21 -> row '21+'", backlashRow(21) === "21+");

// The 21+ row has its OWN option list and it is NOT the 16-20 one: it differs in three of its five
// entries. This check exists because the first implementation reused the 16-20 list (with ONE
// permanent point instead of two) and the 66 preceding checks passed without noticing — a CONTENT
// error that no arithmetic assertion can see. Literal text at core:19649 / core:17904.
{
	const r21 = computeBacklash({ temporaryParadox: 25, permanentParadox: 0, dice: Array(25).fill(8) });
	const r1620 = computeBacklash({ temporaryParadox: 18, permanentParadox: 0, dice: Array(18).fill(8) });
	check("G20 the 21+ row grants TWO permanent points, not one",
		r21.options.includes("permanentParadoxPlusTwo") && !r21.options.includes("permanentParadoxPlusOne"));
	check("G21 the 16-20 row still grants ONE, not two",
		r1620.options.includes("permanentParadoxPlusOne") && !r1620.options.includes("permanentParadoxPlusTwo"));
	check("G22 the two rows do NOT share an option list",
		JSON.stringify(r21.options) !== JSON.stringify(r1620.options));
	check("G23 the 21+ Defecto degree is drastic and the 16-20 one severe",
		r21.defect.degree === "drastic" && r1620.defect.degree === "severe");
}
check("G9 zero successes -> row 'none', no discharge at all",
	computeBacklash({ temporaryParadox: 4, permanentParadox: 0, dice: [2, 3, 4, 5, 2] }).row === "none" &&
	computeBacklash({ temporaryParadox: 4, permanentParadox: 0, dice: [2, 3, 4, 5, 2] }).discharge === 0);

/* =================================================================================================
 * H. Defecto degree per row, and the amplification rule
 * ================================================================================================= */

check("H1 row 1-5 -> trivial Defecto", amplifyDefect("none", "trivial").degree === "trivial");
check("H2 row 6-10 -> minor Defecto", amplifyDefect("none", "minor").degree === "minor");

check("H3 a character with NO existing Defecto gets a fresh one, marked as created not amplified",
	amplifyDefect("none", "significant").created === true && amplifyDefect("none", "significant").amplified === false);

check("H4 a character who already carries a MINOR Defecto and would trigger another does NOT get a second, unrelated one — the existing one is amplified",
	amplifyDefect("minor", "significant").degree === "significant" &&
	amplifyDefect("minor", "significant").amplified === true &&
	amplifyDefect("minor", "significant").created === false);

check("H5 amplification never DOWNGRADES an existing worse Defecto with a milder new trigger",
	amplifyDefect("severe", "trivial").degree === "severe");

// Exercised through the full computeBacklash pipeline too, not just the standalone helper.
const secondBacklashOnExistingDefect = computeBacklash({
	temporaryParadox: 8, permanentParadox: 0, dice: [6, 6, 6, 6, 6, 6, 6, 3],
	existingDefectDegree: "minor",
});
check("H6 computeBacklash amplifies an existing Defecto rather than replacing it",
	secondBacklashOnExistingDefect.defect.amplified === true && secondBacklashOnExistingDefect.defect.created === false,
	JSON.stringify(secondBacklashOnExistingDefect.defect));

/* =================================================================================================
 * I. Silencio level from the CURRENT reserve
 * ================================================================================================= */

check("I1 Jodi Blake's own example: reserve 13 -> level 4 (core:20233)", silenceLevel(13) === 4);
check("I2 boundary 15/16 for level 4/5", silenceLevel(15) === 4 && silenceLevel(16) === 5);
check("I3 boundary 20/21 for level 5/6", silenceLevel(20) === 5 && silenceLevel(21) === 6);
check("I4 level 6 requires explicit confirmation (irreversible, M6)",
	silenceRequiresConfirmation(silenceLevel(21)) === true &&
	silenceRequiresConfirmation(silenceLevel(20)) === false);
check("I5 zero/negative reserve -> level 0 (no Silencio)", silenceLevel(0) === 0);

check("I6 computeBacklash reports the potential Silencio level from the CURRENT reserve, not from what got discharged",
	computeBacklash({ temporaryParadox: 13, permanentParadox: 0, dice: [6, 6, 6, 3, 4, 5, 2, 3, 4, 5, 2, 3, 4] }).potentialSilenceLevel === 4);

/* =================================================================================================
 * J. M4's burn-dice extrapolation toggle
 * ================================================================================================= */

check("J1 rows 1-10 apply the base burn rule even with the M4 extrapolation OFF",
	computeBacklash({ temporaryParadox: 5, permanentParadox: 0, dice: [6, 6, 6, 2, 3], options: { extrapolateBurnDiceAboveTen: false } }).burnDice?.count === 3);

const row11WithExtrapolation = computeBacklash({
	temporaryParadox: 11, permanentParadox: 0,
	dice: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
});
check("J2 M4 ON (default): row 11+ gets 1 burn die per success", row11WithExtrapolation.burnDice?.count === 11);

const row11WithoutExtrapolation = computeBacklash({
	temporaryParadox: 11, permanentParadox: 0,
	dice: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
	options: { extrapolateBurnDiceAboveTen: false },
});
check("J3 M4 OFF: row 11+ has NO declared burn-dice rule, so none is returned",
	row11WithoutExtrapolation.burnDice === null);

check("J4 rows 11+ present the M8 option list instead of a deterministic Defecto",
	row11WithExtrapolation.defect.optional === true && Array.isArray(row11WithExtrapolation.options) && row11WithExtrapolation.options.length > 0);

/* =================================================================================================
 * K. Warning thresholds (M3, and the reserve-level warnings)
 * ================================================================================================= */

check("K1 a gain under 5 does not highlight the backlash button", backlashThresholds({ gain: 4, reserve: 0 }).offerBacklashButton === false);
check("K2 a gain of exactly 5 highlights it (M3)", backlashThresholds({ gain: 5, reserve: 0 }).offerBacklashButton === true);
check("K3 reserve 9 does not warn 'inevitable'; 10 does (core:19679)",
	backlashThresholds({ gain: 0, reserve: 9 }).inevitableWarning === false &&
	backlashThresholds({ gain: 0, reserve: 10 }).inevitableWarning === true);
check("K4 reserve 19 does not warn critical; 20 does (core:11774)",
	backlashThresholds({ gain: 0, reserve: 19 }).criticalWarning === false &&
	backlashThresholds({ gain: 0, reserve: 20 }).criticalWarning === true);

console.log("test-paradox.mjs");
console.log(results.join("\n"));

if (failed) {
	console.error(`\n${failed} check(s) failed.`);
	process.exit(1);
}
console.log(`\nall ${results.length} checks passed.`);
