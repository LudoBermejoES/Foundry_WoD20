/**
 * add-prism-of-focus-foundry — the FIRST automated test file in this repo (per CLAUDE.md, this
 * module has no test infrastructure at all otherwise). Plain node, no framework: `node
 * tests/prism-of-focus.test.mjs`. Exercises only the PURE-FUNCTION half of this change (the
 * mechanics-HTML parser, the Asociada/Limitada/Neutra state engine, the Rituales calculator, and the
 * practice-data table's internal consistency) — nothing here touches `game`/`Actor`/`Item`, which
 * this repo has no fixture/mock for yet. The dialog/sheet wiring is verified by manual code trace
 * only (see this change's final report), NOT by this file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseMechanicsBlock } from "../module/scripts/prism-mechanics-parser.js";
import {
	computeAssociatedLimitedSets,
	baseStateForPracticeId,
	stateForPracticeItem,
	isTenetItem,
	isPracticeItem,
	getTenetPractices
} from "../module/scripts/prism-state-engine.js";
import { computeRitualGroup, computeParticipantContribution } from "../module/scripts/prism-ritual-calculator.js";
import { AUTO_PRACTICE_RULES, CORRUPTED_PRACTICE_RULES, PROMPT_PRACTICE_IDS, FLAVOR_ONLY_PRACTICE_HALVES } from "../module/scripts/prism-practice-data.js";
import {
	corruptedResistanceRoll,
	corruptedStateFromResonance,
	abyssalismSilenceFloor,
	vamamargaJhorRoll,
	vamamargaJhorDelta
} from "../module/scripts/prism-corrupted-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ok - ${name}`);
	} catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.message}`);
	}
}

console.log("prism-mechanics-parser.js");
test("parses the Dominio practice's wod-kb-mech block (real shipped HTML)", () => {
	const html = `<p>...</p><hr><ul class='wod-kb-mech'><li><strong>paradigmas_asociados:</strong> Un Cosmos Mecánico, Un Mundo de Dioses y Monstruos</li><li><strong>habilidades_asociadas:</strong> Academicismo (Historia, Psicología), Arte</li><li><strong>benefit_es:</strong> La Magia del mando les resulta más fácil.</li><li><strong>penalty_es:</strong> Sufren un modificador de +2.</li><li><strong>kind:</strong> base</li><li><strong>faction_specialty_ids:</strong> authority</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.equal(mech.kind, "base");
	assert.deepEqual(mech.faction_specialty_ids, ["authority"]);
	assert.equal(mech.benefit_es, "La Magia del mando les resulta más fácil.");
	assert.equal(mech.penalty_es, "Sufren un modificador de +2.");
	assert.deepEqual(mech.paradigmas_asociados, ["Un Cosmos Mecánico", "Un Mundo de Dioses y Monstruos"]);
});

test("parses a Rote's practice_id (a flag in the design, actually HTML in the shipped corpus)", () => {
	const html = `<p>...</p><hr><ul class='wod-kb-mech'><li><strong>spheres:</strong> time: 2; mind: 2</li><li><strong>practice_id:</strong> faith</li></ul>`;
	assert.equal(parseMechanicsBlock(html).practice_id, "faith");
});

test("a Tenet's associated/limited lists parse from its own shipped shape", () => {
	const html = `<p>...</p><hr><ul class='wod-kb-mech'><li><strong>category:</strong> metaphysical</li><li><strong>associated_practices:</strong> alchemy, craftwork, cybernetics</li><li><strong>limited_practices:</strong> chaos-magick, crazy-wisdom</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.equal(mech.category, "metaphysical");
	assert.deepEqual(mech.associated_practices, ["alchemy", "craftwork", "cybernetics"]);
	assert.deepEqual(mech.limited_practices, ["chaos-magick", "crazy-wisdom"]);
});

test("degrades to {} for absent/malformed input, never throws", () => {
	assert.deepEqual(parseMechanicsBlock(null), {});
	assert.deepEqual(parseMechanicsBlock(""), {});
	assert.deepEqual(parseMechanicsBlock("<p>no mechanics block here</p>"), {});
});

console.log("prism-state-engine.js");

function fakeTenet(associated, limited, category = "metaphysical") {
	return { type: "Feature", system: { type: "wod.types.othertraits", category, associated_practices: associated, limited_practices: limited } };
}

function fakePractice(id, kind = "base", basePracticeId = "", opts = {}) {
	return {
		_id: `item-${id}`,
		type: "Feature",
		system: { type: "wod.types.practice", kind, base_practice_id: basePracticeId, value: 0, ...opts },
		flags: { "wod20-compendium-es": { id, line: "mage", source_type: "practice" } }
	};
}

test("isTenetItem/isPracticeItem detect by system.type + category duck-typing", () => {
	assert.equal(isTenetItem(fakeTenet(["a"], ["b"])), true);
	assert.equal(isTenetItem({ type: "Feature", system: { type: "wod.types.othertraits" } }), false);
	assert.equal(isPracticeItem(fakePractice("dominion")), true);
	assert.equal(isPracticeItem(fakeTenet([], [])), false);
});

test("§1.3 tie -> neutral (A3), no category hierarchy", () => {
	const actor = { items: [fakeTenet(["dominion"], []), fakeTenet([], ["dominion"])] };
	const { associated, limited } = computeAssociatedLimitedSets(actor, () => ({}));
	assert.equal(baseStateForPracticeId("dominion", associated, limited), "neutral");
});

test("associated-only and limited-only resolve correctly", () => {
	const actor = { items: [fakeTenet(["dominion"], ["chaos-magick"])] };
	const { associated, limited } = computeAssociatedLimitedSets(actor, () => ({}));
	assert.equal(baseStateForPracticeId("dominion", associated, limited), "associated");
	assert.equal(baseStateForPracticeId("chaos-magick", associated, limited), "limited");
	assert.equal(baseStateForPracticeId("faith", associated, limited), "neutral");
});

test("A4/A20a — an owned Especialidad is unconditionally 'associated', no faction lookup needed", () => {
	const actor = { items: [fakeTenet([], ["the-scene"]), fakePractice("the-scene", "specialty", "gutter-magick")] };
	const item = actor.items[1];
	assert.equal(stateForPracticeItem(item, actor, () => ({})), "associated");
});

test("A5 — a corrupted-kind item inherits its BASE practice's state, not its own id's", () => {
	const actor = { items: [fakeTenet(["animalism"], []), fakePractice("feralism", "corrupted", "animalism")] };
	const item = actor.items[1];
	assert.equal(stateForPracticeItem(item, actor, () => ({})), "associated");
});

test("getTenetPractices prefers literal system fields, falls back to the mechanics-block parse", () => {
	const literalTenet = fakeTenet(["a", "b"], ["c"]);
	assert.deepEqual(getTenetPractices(literalTenet, () => ({})), { associated: ["a", "b"], limited: ["c"] });

	const compendiumDraggedTenet = { type: "Feature", system: { type: "wod.types.othertraits", category: "personal", associated_practices: [], limited_practices: [] } };
	const mech = { associated_practices: ["x"], limited_practices: ["y"] };
	assert.deepEqual(getTenetPractices(compendiumDraggedTenet, () => mech), { associated: ["x"], limited: ["y"] });
});

console.log("prism-ritual-calculator.js (book's own worked examples, §2.5.2/§2.7)");

test("Michael/Paula/Susan: ceiling 18, Paula capped at 2 (not her Areté 3), Susan +1 flat", () => {
	const group = computeRitualGroup(
		{ practiceRating: 3, permanentWillpower: 6, sphereCovered: "forces" },
		[
			{ name: "Paula", role: "participant-with-practice", arete: 3, practiceRating: 2, sphereCovered: "prime" },
			{ name: "Susan", role: "participant-without" }
		],
		["forces", "prime"]
	);
	assert.equal(group.ceiling, 18);
	assert.equal(group.participants[0].diceCap, 2);
	assert.equal(group.totalFlatSuccesses, 1);
	assert.deepEqual(group.missingSpheres, []);
});

test("La Escena 4 contributes floor(4/2)=2 to Fuerzas", () => {
	assert.equal(computeParticipantContribution({ role: "participant-via-la-escena", laEscenaRating: 4 }).diceCap, 2);
});

test("missing Esfera coverage is flagged", () => {
	const group = computeRitualGroup({ practiceRating: 1, permanentWillpower: 1 }, [], ["forces", "prime"]);
	assert.deepEqual(group.missingSpheres, ["forces", "prime"]);
});

console.log("prism-practice-data.js (design.md D12/D16 triage completeness)");

test("31 total Prácticas across the three buckets, per the cross-spec-audit's own count", () => {
	const autoCount = Object.keys(AUTO_PRACTICE_RULES).length;
	const flavorOnlyPractices = new Set(Object.keys(FLAVOR_ONLY_PRACTICE_HALVES));
	// shamanism is double-counted on purpose (auto for its Beneficio, flavor-only for its
	// Penalización) — design.md D12's own closing paragraph.
	const uniquePractices = new Set([...Object.keys(AUTO_PRACTICE_RULES), ...flavorOnlyPractices]);
	assert.equal(autoCount, 22, `expected 22 auto-bucket practices, got ${autoCount}`);
	assert.equal(PROMPT_PRACTICE_IDS.length, 7, `expected 7 prompt-bucket practices, got ${PROMPT_PRACTICE_IDS.length}`);
	assert.equal(uniquePractices.size, 24, "22 auto + bardism + gutter-magick = 24 unique ids (shamanism already counted in auto)");
	assert.equal(uniquePractices.size + PROMPT_PRACTICE_IDS.length, 31, "22 auto/flavor unique ids + 7 prompt = 31");
});

test("every 7 Prácticas Corruptas is present, each with a `base`", () => {
	const ids = Object.keys(CORRUPTED_PRACTICE_RULES);
	assert.equal(ids.length, 7);
	for (const id of ids) assert.ok(CORRUPTED_PRACTICE_RULES[id].base, `${id} is missing its base practice`);
	assert.deepEqual(CORRUPTED_PRACTICE_RULES["infernal-sciences"].base, ["hypertech", "cybernetics", "weird-science"]);
});

console.log("prism-corrupted-helpers.js");

test("D8's shared resistance roll: pool = practice rating, difficulty = 3 + highest Sphere", () => {
	assert.deepEqual(corruptedResistanceRoll(3, 2), { pool: 3, difficulty: 5 });
});

test("corrupted_state flips at Resonance >= rating, per D8", () => {
	assert.equal(corruptedStateFromResonance(2, 3), "clean");
	assert.equal(corruptedStateFromResonance(3, 3), "corrupted");
});

test("Abismalismo's Silence floor is ceil(rating/2)", () => {
	assert.equal(abyssalismSilenceFloor(3), 2);
	assert.equal(abyssalismSilenceFloor(4), 2);
	assert.equal(abyssalismSilenceFloor(5), 3);
});

test("Vamamarga's Jhor roll is difficulty 6, and the first point is automatic", () => {
	assert.deepEqual(vamamargaJhorRoll(2), { pool: 2, difficulty: 6 });
	assert.equal(vamamargaJhorDelta("failure", 0), 1);
	assert.equal(vamamargaJhorDelta("botch", 2), 2);
	assert.equal(vamamargaJhorDelta("failure", 2), 1);
});

console.log("lang/en.json + lang/es.json — every labelKey referenced by prism-practice-data.js resolves in both");

test("all wod.prism.* labelKeys referenced in prism-practice-data.js exist in both language files", () => {
	const es = JSON.parse(readFileSync(path.join(__dirname, "..", "lang", "es.json"), "utf8"));
	const en = JSON.parse(readFileSync(path.join(__dirname, "..", "lang", "en.json"), "utf8"));
	const source = readFileSync(path.join(__dirname, "..", "module", "scripts", "prism-practice-data.js"), "utf8");
	const keys = [...new Set([...source.matchAll(/"(wod\.prism\.[a-zA-Z0-9_.]+)"/g)].map((m) => m[1]))];
	assert.ok(keys.length > 0, "expected to find wod.prism.* keys in prism-practice-data.js");

	function get(dict, dotted) {
		return dotted.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dict);
	}

	for (const key of keys) {
		assert.notEqual(get(es, key), undefined, `missing ES key: ${key}`);
		assert.notEqual(get(en, key), undefined, `missing EN key: ${key}`);
	}
});

console.log(`\n${failures === 0 ? "All prism-of-focus pure-function tests passed." : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
