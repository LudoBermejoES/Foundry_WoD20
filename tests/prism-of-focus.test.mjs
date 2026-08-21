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
	corruptedResonanceGain,
	corruptedReversalAvailable,
	abyssalismSilenceFloor,
	vamamargaJhorRoll,
	vamamargaJhorDelta,
	findJhorResonanceItem,
	getJhorResonanceValue,
	vamamargaJhorTriggered
} from "../module/scripts/prism-corrupted-helpers.js";
import PrismHelper from "../module/scripts/prism-helpers.js";
import { isSanctumBackgroundItem } from "../module/scripts/prism-state-engine.js";
import * as PromptCalc from "../module/scripts/prism-prompt-calculators.js";

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

// fix-mech-block-raw-keys — `models.mech_block()` no longer prints the raw key as the visible text:
// the text is the Spanish label and the key travels in `data-key`. The four tests below cover the new
// format, the old one (still live inside an actor carrying a copied description), the precedence
// between them, and the reason a label->key map would not have worked.
test("parses the new data-key format, whose visible text is the LABEL (real regenerated HTML)", () => {
	const html = `<p>...</p><hr><ul class='wod-kb-mech'><li data-key='paradigmas_asociados'><strong>Paradigmas asociados:</strong> Un Cosmos Mecánico, Un Mundo de Dioses y Monstruos</li><li data-key='common_instruments'><strong>Instrumentos comunes:</strong> Armas, computadoras, danzas</li><li data-key='benefit_es'><strong>Beneficio:</strong> La Magia del mando les resulta más fácil.</li><li data-key='kind'><strong>Tipo:</strong> base</li><li data-key='faction_specialty_ids'><strong>Especialidades de facción:</strong> authority</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.equal(mech.kind, "base");
	assert.equal(mech.benefit_es, "La Magia del mando les resulta más fácil.");
	assert.deepEqual(mech.faction_specialty_ids, ["authority"]);
	assert.deepEqual(mech.paradigmas_asociados, ["Un Cosmos Mecánico", "Un Mundo de Dioses y Monstruos"]);
	// `common_instruments` is a LIST_FIELD as of this change: the previous entry named
	// `instrumentos_comunes`, which exists in no shipped document.
	assert.deepEqual(mech.common_instruments, ["Armas", "computadoras", "danzas"]);
	// And no label leaks in as a key.
	assert.deepEqual(Object.keys(mech).filter((k) => k.includes(" ")), []);
});

test("`data-key` wins over the visible text, because a label cannot identify a key", () => {
	// Both rows DISPLAY «Prácticas asociadas» — 95 keys in `mechanic_labels.json` share a label with
	// another — and they still have to reach distinct keys.
	const html = `<ul class='wod-kb-mech'><li data-key='associated_practices'><strong>Prácticas asociadas:</strong> alchemy, craftwork</li><li data-key='practicas_asociadas'><strong>Prácticas asociadas:</strong> faith</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.deepEqual(mech.associated_practices, ["alchemy", "craftwork"]);
	assert.equal(mech.practicas_asociadas, "faith");
	assert.equal(mech["Prácticas asociadas"], undefined);
});

test("legacy raw-key rows still parse (an actor's stored description copy predates the change)", () => {
	const html = `<ul class='wod-kb-mech'><li><strong>kind:</strong> specialty</li><li><strong>base_practice_id:</strong> martial-arts</li><li><strong>associated_practices:</strong> alchemy, craftwork</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.equal(mech.kind, "specialty");
	assert.equal(mech.base_practice_id, "martial-arts");
	assert.deepEqual(mech.associated_practices, ["alchemy", "craftwork"]);
});

test("a mixed block (one row migrated, one not) parses both rows", () => {
	const html = `<ul class='wod-kb-mech'><li data-key='kind'><strong>Tipo:</strong> corrupted</li><li><strong>practice_id:</strong> faith</li></ul>`;
	const mech = parseMechanicsBlock(html);
	assert.equal(mech.kind, "corrupted");
	assert.equal(mech.practice_id, "faith");
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

console.log("prism-corrupted-helpers.js — Vamamarga's Jhor track (its own resonance counter, distinct from the generic engine)");

test("findJhorResonanceItem/getJhorResonanceValue match by provenance id, then by name fallback", () => {
	const byProvenance = { type: "Trait", system: { type: "wod.types.resonance", value: 2 }, flags: { "wod20-compendium-es": { id: "vamamarga-jhor-resonance" } } };
	const byName = { type: "Trait", system: { type: "wod.types.resonance", value: 1 }, name: "Jhor (Vamamarga)" };
	assert.equal(findJhorResonanceItem({ items: [byProvenance] }), byProvenance);
	assert.equal(getJhorResonanceValue({ items: [byProvenance] }), 2);
	assert.equal(findJhorResonanceItem({ items: [byName] }), byName);
	assert.equal(getJhorResonanceValue({ items: [] }), 0);
});

test("vamamargaJhorTriggered fires at 5+ successes, or on fail/botch, never on an ordinary success", () => {
	assert.equal(vamamargaJhorTriggered(5, "success"), true);
	assert.equal(vamamargaJhorTriggered(6, "success"), true);
	assert.equal(vamamargaJhorTriggered(2, "fail"), true);
	assert.equal(vamamargaJhorTriggered(0, "botch"), true);
	assert.equal(vamamargaJhorTriggered(2, "success"), false);
});

console.log("PrismHelper — D16's 3 remaining Prácticas Corruptas (Abismalismo/Goetia/Vamamarga), wired into the SAME dispatch as the other 4 (gap #2)");

test("Abismalismo's Precio dispatches a live silenceFloor, computed from the actor's OWN item rating", () => {
	const actor = { items: [{ _id: "i1", type: "Feature", system: { type: "wod.types.practice", kind: "corrupted", value: 5 }, flags: { "wod20-compendium-es": { id: "abyssalism" } } }] };
	const result = PrismHelper.CheckPracticePenalty(actor, "abyssalism", {});
	assert.equal(result.modifier, 0);
	assert.equal(result.silenceFloor, 3, "ceil(5/2) = 3");
});

test("Goetia's Precio dispatches a failureBranch flag, not a dice modifier", () => {
	const result = PrismHelper.CheckPracticePenalty(null, "goetia", {});
	assert.equal(result.modifier, 0);
	assert.equal(result.failureBranch, true);
});

test("Vamamarga's Precio dispatches a jhorResonance flag, not a dice modifier", () => {
	const result = PrismHelper.CheckPracticePenalty(null, "vamamarga", {});
	assert.equal(result.modifier, 0);
	assert.equal(result.jhorResonance, true);
});

test("Abismalismo/Goetia/Vamamarga's Beneficio still applies its flat -1, same as the other 4 corrupted Prácticas", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "abyssalism", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "goetia", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "vamamarga", { checked: true }).modifier, -1);
});

console.log("prism-state-engine.js — isSanctumBackgroundItem (task 8.1's shared detector)");

test("isSanctumBackgroundItem matches by provenance id prefix, then by name regex, never a non-Background Feature", () => {
	const byProvenance = { type: "Feature", system: { type: "wod.types.background" }, flags: { "wod20-compendium-es": { id: "sanctum-laboratorio" } }, name: "Sanctum / Laboratorio" };
	const byName = { type: "Feature", system: { type: "wod.types.background" }, name: "Sanctuary of the Hollow Ones" };
	const notBackground = { type: "Feature", system: { type: "wod.types.merit" }, name: "Sanctum-shaped but a Merit" };
	assert.equal(isSanctumBackgroundItem(byProvenance), true);
	assert.equal(isSanctumBackgroundItem(byName), true);
	assert.equal(isSanctumBackgroundItem(notBackground), false);
});

console.log("prism-prompt-calculators.js — the 7 `prompt`-bucket Prácticas (task 6.2)");

test("Alquimia halves the crafting cost, rounded UP", () => {
	assert.equal(PromptCalc.alchemyCraftingCost(5), 3);
	assert.equal(PromptCalc.alchemyCraftingCost(4), 2);
});

test("Maleficia doubles the crafting cost and adds +1 to direct-creation effects", () => {
	assert.equal(PromptCalc.maleficiaCraftingCost(5), 10);
	assert.equal(PromptCalc.maleficiaDirectCreationModifier(true), 1);
	assert.equal(PromptCalc.maleficiaDirectCreationModifier(false), 0);
});

test("Vigorización: pool = Resistencia + Meditación, difficulty fixed at 6, 2 Quintaesencia per Willpower success", () => {
	assert.equal(PromptCalc.invigorationPool(3, 2), 5);
	assert.equal(PromptCalc.INVIGORATION_DIFFICULTY, 6);
	assert.equal(PromptCalc.invigorationWillpowerGained(3), 3);
	assert.equal(PromptCalc.invigorationWillpowerGained(-1), 0);
	assert.equal(PromptCalc.invigorationQuintessenceCost(3), 6);
});

test("Hipertecnología doubles the Devices created", () => {
	assert.equal(PromptCalc.hypertechDevicesCreated(2), 4);
});

test("Control de Medios (A23): broadcast/permanent each independently double successes AND add a flat +2 (never a compounding +4 to difficulty)", () => {
	assert.equal(PromptCalc.mediaControlSuccessesRequired(3, false, false), 3);
	assert.equal(PromptCalc.mediaControlSuccessesRequired(3, true, false), 6);
	assert.equal(PromptCalc.mediaControlSuccessesRequired(3, true, true), 12);
	assert.equal(PromptCalc.mediaControlDifficultyModifier(false, false), 0);
	assert.equal(PromptCalc.mediaControlDifficultyModifier(true, false), 2);
	assert.equal(PromptCalc.mediaControlDifficultyModifier(true, true), 4);
});

test("Psiónica caps the Areté pool at TEMPORARY Fuerza de Voluntad, never the (possibly higher) pool itself", () => {
	assert.equal(PromptCalc.psionicsAretePoolCap(6, 3), 3);
	assert.equal(PromptCalc.psionicsAretePoolCap(2, 5), 2);
});

test("Fe's claim is available once per Historia, and blocked outright by a creed violation", () => {
	assert.equal(PromptCalc.faithClaimAvailable(false, false), true);
	assert.equal(PromptCalc.faithClaimAvailable(true, false), false);
	assert.equal(PromptCalc.faithClaimAvailable(false, true), false);
});

console.log("lang/en.json + lang/es.json — every labelKey referenced by this change's source files resolves in both");

test("all wod.prism.* labelKeys referenced across this change's JS source exist in both language files", () => {
	const es = JSON.parse(readFileSync(path.join(__dirname, "..", "lang", "es.json"), "utf8"));
	const en = JSON.parse(readFileSync(path.join(__dirname, "..", "lang", "en.json"), "utf8"));

	const sourceFiles = [
		"prism-practice-data.js",
		"prism-helpers.js",
		"prism-prompt-calculators.js",
		"prism-corrupted-card.js"
	].map((f) => path.join(__dirname, "..", "module", "scripts", f));
	sourceFiles.push(path.join(__dirname, "..", "module", "dialogs", "dialog-prism-prompt.js"));
	sourceFiles.push(path.join(__dirname, "..", "module", "dialogs", "dialog-aretecasting.js"));
	sourceFiles.push(path.join(__dirname, "..", "module", "actor", "template", "pc-actor-sheet.js"));

	const templateFiles = [
		"templates/actor/parts/mage/prism_practices.hbs",
		"templates/actor/parts/mage/prism_tenets.hbs",
		"templates/actor/parts/mage/prism_practice_traits.hbs",
		"templates/dialogs/dialog-prism-prompt.hbs",
		"templates/dialogs/dialog-prism-ritual.hbs",
		"templates/dialogs/dialog-prism-zone.hbs",
		"templates/dialogs/prism-corrupted-resistance-card.hbs",
		"templates/sheets/feature-sheet.html"
	].map((f) => path.join(__dirname, "..", f));

	const keys = new Set();
	for (const file of [...sourceFiles, ...templateFiles]) {
		const source = readFileSync(file, "utf8");
		for (const m of source.matchAll(/["'](wod\.prism\.[a-zA-Z0-9_.]+)["']/g)) {
			// Skip dynamically-built key PREFIXES such as `(concat "wod.prism.kind." row.kind)` in
			// `prism_practices.hbs` — a trailing "." means this match is a prefix, not a real key.
			if (m[1].endsWith(".")) continue;
			keys.add(m[1]);
		}
	}
	// The 3 Ciencias Infernales base-label keys are built from a TEMPLATE LITERAL in
	// pc-actor-sheet.js (`wod.prism.infernal.base.${...}`), so the static scan above cannot see
	// them — added explicitly rather than silently left unchecked.
	keys.add("wod.prism.infernal.base.hypertech");
	keys.add("wod.prism.infernal.base.cybernetics");
	keys.add("wod.prism.infernal.base.weirdscience");
	assert.ok(keys.size > 0, "expected to find wod.prism.* keys across this change's source files");

	function get(dict, dotted) {
		return dotted.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dict);
	}

	for (const key of keys) {
		assert.notEqual(get(es, key), undefined, `missing ES key: ${key}`);
		assert.notEqual(get(en, key), undefined, `missing EN key: ${key}`);
	}
});

console.log("PrismHelper (D12/D16 dispatch, the checkbox/computed/tiered rule evaluator)");

test("Dominio's auto-bucket checkbox rules apply their flat modifier", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "dominion", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "dominion", { checked: false }).modifier, 0);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "dominion", { checked: true }).modifier, 2);
});

test("Investment's tiered penalty applies the selected tier's magnitude", () => {
	assert.equal(PrismHelper.CheckPracticePenalty(null, "investment", { tier: 1 }).modifier, 1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "investment", { tier: 3 }).modifier, 3);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "investment", { tier: 0 }).modifier, 0);
});

test("Medicina's Penalización decouples Paradox from difficulty (D5's decoupler)", () => {
	const result = PrismHelper.CheckPracticePenalty(null, "medicine-work", { checked: true });
	assert.equal(result.modifier, 0);
	assert.equal(result.forcesParadojaVulgar, true);
});

test("D16/task 10.6 fix — a Práctica Corrupta's own named rule dispatches through the SAME engine as the base 31 (previously only defined as data, never wired to CheckPracticeBenefit/Penalty)", () => {
	// Feralismo: -1 Beneficio (checkbox), tiered +1/+2/+3 Precio.
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "feralism", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "feralism", { tier: 3 }).modifier, 3);
	// Ciencias Infernales: tiered -1/-2 Beneficio (the one tiered BENEFIT in this triage).
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "infernal-sciences", { tier: 2 }).modifier, -2);
});

test("A22 — Ciencia Extraña's Beneficio penalizes the ANALYST's roll, gated on the analyst's OWN rating, never the caster's", () => {
	const analystWithout = { items: [] };
	const analystWith = { items: [{ _id: "i1", type: "Feature", system: { type: "wod.types.practice", value: 2 }, flags: { "wod20-compendium-es": { id: "weird-science" } } }] };

	assert.equal(
		PrismHelper.CheckPracticeBenefit(null, "weird-science", { checked: true, targetActor: analystWithout }).modifier,
		1,
		"analyst without the Practice: +1"
	);
	assert.equal(
		PrismHelper.CheckPracticeBenefit(null, "weird-science", { checked: true, targetActor: analystWith }).modifier,
		0,
		"analyst who already has the Practice: no penalty"
	);
	assert.equal(
		PrismHelper.CheckPracticeBenefit(null, "weird-science", { checked: true, targetActor: null }).modifier,
		1,
		"no analyst actor resolved: treated the same as 'without the Practice' (a rating of 0)"
	);
});

test("task 10.8 — La Misa Negra's -1 Beneficio and its private(+1)/public(+2) tiered Precio", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "the-black-mass-practice", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "the-black-mass-practice", { tier: 1 }).modifier, 1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "the-black-mass-practice", { tier: 2 }).modifier, 2);
});

test("task 10.8 — Demonismo's -1 Beneficio and +1 Precio", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "demonism", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "demonism", { checked: true }).modifier, 1);
});

// followups design.md's expanded test-coverage requirement: each of the 31 base Prácticas gets its
// own individually-named regression guard against AUTO_PRACTICE_RULES — 11 of the 22 checkbox/
// computed/tiered entries had no dedicated assertion before this backlog (11 others, plus all 7
// Prácticas Corruptas and all 7 prompt-bucket Prácticas, already did — see the tests above/below).
test("Apropiación's -1 Beneficio and +1 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "appropriation", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "appropriation", { checked: true }).modifier, 1);
});

test("El Arte del Deseo's -1 Beneficio and +1 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "art-of-desire", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "art-of-desire", { checked: true }).modifier, 1);
});

test("Caridad's -1 Beneficio, and its Precio is a vulgarity classification (CheckCharityForcesVulgar), not a modifier", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "charity", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "charity", { checked: true }).modifier, 0, "Charity has no penalty-side dice modifier");
	assert.equal(PrismHelper.CheckCharityForcesVulgar({ charityTaking: true }), true);
	assert.equal(PrismHelper.CheckCharityForcesVulgar({ charityTaking: false }), false);
});

test("Elementalismo's -1 Beneficio and +2 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "elementalism", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "elementalism", { checked: true }).modifier, 2);
});

test("Vínculo Divino's Beneficio is computed per Areté domain threshold reached, and its Precio is a flat +2 checkbox", () => {
	const noDomains = { system: { advantages: { arete: { value: 3 } }, practiceTraits: { godBondingDomains: [] } } };
	const twoDomainsReached = {
		system: {
			advantages: { arete: { value: 3 } },
			practiceTraits: { godBondingDomains: [{ areteThreshold: 1 }, { areteThreshold: 3 }, { areteThreshold: 5 }] }
		}
	};
	assert.equal(PrismHelper.CheckPracticeBenefit(noDomains, "divine-bond", {}).modifier, 0, "no domains bonded yet");
	assert.equal(
		PrismHelper.CheckPracticeBenefit(twoDomainsReached, "divine-bond", {}).modifier,
		-2,
		"Areté 3 reaches the 1 and 3 thresholds (not the 5), -1 per domain"
	);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "divine-bond", { checked: true }).modifier, 2);
});

test("Alta Magia Ritual's -1 Beneficio and +1 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "high-ritual-magick", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "high-ritual-magick", { checked: true }).modifier, 1);
});

test("Mediumnidad's -1 Beneficio (checkbox) and its Precio is tiered: +1 general resistance, +2 the affinity Umbra", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "mediumship", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "mediumship", { tier: 1 }).modifier, 1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "mediumship", { tier: 2 }).modifier, 2);
});

test("Hackeo de la Realidad's Beneficio forces coincidental at a ZERO modifier (not a difficulty change), and its Precio is a +1 checkbox", () => {
	const benefit = PrismHelper.CheckPracticeBenefit(null, "reality-hacking", { checked: true });
	assert.equal(benefit.modifier, 0, "the benefit is 'always coincidental', not a difficulty reduction");
	assert.equal(benefit.forcesCoincidental, true);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "reality-hacking", { checked: true }).modifier, 1);
});

test("Chamanismo's -1 Beneficio is a checkbox; its Precio is flavor-only (D10) and dispatches to 0, never a number", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "shamanism", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "shamanism", { checked: true }).modifier, 0);
});

test("Vudú's -1 Beneficio and +1 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "voudoun", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "voudoun", { checked: true }).modifier, 1);
});

test("Yoga's -1 Beneficio and +1 Precio (checkbox/checkbox)", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "yoga", { checked: true }).modifier, -1);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "yoga", { checked: true }).modifier, 1);
});

test("Bardismo and Magia Callejera are the 2 fully flavor-only Prácticas: neither side ever dispatches a modifier", () => {
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "bardism", { checked: true }).modifier, 0);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "bardism", { checked: true }).modifier, 0);
	assert.equal(PrismHelper.CheckPracticeBenefit(null, "gutter-magick", { checked: true }).modifier, 0);
	assert.equal(PrismHelper.CheckPracticePenalty(null, "gutter-magick", { checked: true }).modifier, 0);
});

test("CheckImprovisedPenalty (C3) applies +1 only when NOT Fórmula-backed, and Etertecnología ignores it", () => {
	assert.equal(PrismHelper.CheckImprovisedPenalty(false, "dominion"), 1);
	assert.equal(PrismHelper.CheckImprovisedPenalty(true, "dominion"), 0);
	assert.equal(PrismHelper.CheckImprovisedPenalty(false, "ethertech"), 0);
});

test("D11 — Magia del caos's own Penalización is Fórmula-only, disjoint from C3 (Arreglo #17)", () => {
	// An improvised Magia del caos cast: C3's +1 fires, Magia del caos's own Penalización does not.
	assert.equal(PrismHelper.CheckImprovisedPenalty(false, "chaos-magick"), 1);
	assert.equal(PrismHelper.CheckChaosMagickFormulaPenalty(false), 0);
	// A Fórmula-backed Magia del caos cast: the reverse.
	assert.equal(PrismHelper.CheckImprovisedPenalty(true, "chaos-magick"), 0);
	assert.equal(PrismHelper.CheckChaosMagickFormulaPenalty(true), 1);
});

console.log("PrismHelper.ResolveCorruptedResistancePoolRating (task 10.3 — Ciencias Infernales' chosen-base routing)");

test("Ciencias Infernales' resistance pool reads the CHOSEN BASE item's rating, not its own corrupted item's value", () => {
	const cyberneticsItem = { _id: "base1", type: "Feature", system: { type: "wod.types.practice", kind: "base", value: 4 }, flags: { "wod20-compendium-es": { id: "cybernetics" } } };
	const corruptedItem = { _id: "ci1", type: "Feature", system: { type: "wod.types.practice", kind: "corrupted", value: 1, chosen_base_practice_id: "cybernetics" }, flags: { "wod20-compendium-es": { id: "infernal-sciences" } } };
	const actor = { items: [cyberneticsItem, corruptedItem] };
	assert.equal(PrismHelper.ResolveCorruptedResistancePoolRating(actor, corruptedItem), 4, "reads Cibernética's rating (4), not its own value (1)");
});

test("Ciencias Infernales falls back to its own item's value when no base has been chosen yet", () => {
	const corruptedItem = { _id: "ci1", type: "Feature", system: { type: "wod.types.practice", kind: "corrupted", value: 2, chosen_base_practice_id: "" }, flags: { "wod20-compendium-es": { id: "infernal-sciences" } } };
	const actor = { items: [corruptedItem] };
	assert.equal(PrismHelper.ResolveCorruptedResistancePoolRating(actor, corruptedItem), 2);
});

test("every other corrupted Práctica just uses its own item's rating (no chosen-base indirection)", () => {
	const feralismItem = { _id: "f1", type: "Feature", system: { type: "wod.types.practice", kind: "corrupted", value: 3 }, flags: { "wod20-compendium-es": { id: "feralism" } } };
	const actor = { items: [feralismItem] };
	assert.equal(PrismHelper.ResolveCorruptedResistancePoolRating(actor, feralismItem), 3);
});

console.log("prism-corrupted-helpers.js — corruptedResonanceGain/corruptedReversalAvailable (followups design.md D1)");

test("an avoided resistance roll gains nothing; a failed one gains exactly 1, never a variable amount", () => {
	assert.equal(corruptedResonanceGain(true), 0);
	assert.equal(corruptedResonanceGain(false), 1);
});

test("reversal is available once the rebuilt base Práctica reaches the recorded corrupted Resonance value", () => {
	assert.equal(corruptedReversalAvailable(2, 3), false, "rebuilt 2 < recorded 3 — not yet");
	assert.equal(corruptedReversalAvailable(3, 3), true, "rebuilt matches exactly");
	assert.equal(corruptedReversalAvailable(4, 3), true, "rebuilt exceeds — still available");
});

console.log("PrismHelper.ResolvePracticeRating (followups design.md D4 — the Do -> Artes Marciales maneuver-resolution gap)");

test("resolves an owned BASE Práctica's rating for its mapped ability key", () => {
	const martialArts = fakePractice("martial-arts", "base", "", { value: 3 });
	const actor = { items: [martialArts] };
	const resolved = PrismHelper.ResolvePracticeRating(actor, "martialarts");
	assert.equal(resolved.rating, 3);
	assert.equal(resolved.item, martialArts);
});

test("resolves an owned ESPECIALIDAD's rating when no base item is owned (the Do case)", () => {
	const doSpecialty = fakePractice("do", "specialty", "martial-arts", { value: 2 });
	const actor = { items: [doSpecialty] };
	const resolved = PrismHelper.ResolvePracticeRating(actor, "martialarts");
	assert.equal(resolved.rating, 2, "reads the Do Especialidad's own rating, not a fallback of 0");
});

test("returns null for an ability key with no Práctica mapping", () => {
	const actor = { items: [fakePractice("martial-arts", "base", "", { value: 5 })] };
	assert.equal(PrismHelper.ResolvePracticeRating(actor, "brawl"), null);
});

test("returns null when the actor owns no matching Práctica or Especialidad", () => {
	const actor = { items: [fakePractice("dominion", "base", "", { value: 4 })] };
	assert.equal(PrismHelper.ResolvePracticeRating(actor, "martialarts"), null);
});

console.log("PrismHelper.ResolvePracticeForFormula (D13 — the Especialidad-satisfies-base Fórmula-ownership requirement, followups' expanded test-coverage item)");

/** `test()` above is synchronous-only; `ResolvePracticeForFormula` is async (it awaits a possibly
 *  cold-cache mechanics resolution), so this one small async-aware twin covers it without changing
 *  the shared harness's contract for the other 60+ synchronous tests. */
async function testAsync(name, fn) {
	try {
		await fn();
		console.log(`  ok - ${name}`);
	} catch (err) {
		failures++;
		console.error(`  FAIL - ${name}`);
		console.error(`    ${err.message}`);
	}
}

await testAsync("a Especialidad alone satisfies its base Práctica's Fórmula requirement — no base item needed", async () => {
	const formulaItem = { system: { practice_id: "martial-arts" } };
	const doSpecialty = fakePractice("do", "specialty", "martial-arts", { value: 2 });
	const actor = { items: [doSpecialty] };
	const resolved = await PrismHelper.ResolvePracticeForFormula(actor, formulaItem);
	assert.ok(resolved, "expected a resolution, got null");
	assert.equal(resolved.rating, 2);
	assert.equal(resolved.item, doSpecialty);
});

await testAsync("the base Práctica itself satisfies its own Fórmula requirement", async () => {
	const formulaItem = { system: { practice_id: "martial-arts" } };
	const martialArts = fakePractice("martial-arts", "base", "", { value: 4 });
	const actor = { items: [martialArts] };
	const resolved = await PrismHelper.ResolvePracticeForFormula(actor, formulaItem);
	assert.equal(resolved.rating, 4);
});

await testAsync("neither the base nor a satisfying Especialidad present fails the requirement", async () => {
	const formulaItem = { system: { practice_id: "martial-arts" } };
	const actor = { items: [fakePractice("dominion", "base", "", { value: 5 })] };
	const resolved = await PrismHelper.ResolvePracticeForFormula(actor, formulaItem);
	assert.equal(resolved, null);
});

console.log("PrismHelper.EvaluateVulgarity (D5/D6 — Sanctum + Zona, coupled by default)");

function fakeSanctumActor({ anathema = [], enabled = [] } = {}) {
	return {
		items: [{
			type: "Feature",
			system: { type: "wod.types.background", anathema, enabled_practices: enabled },
			flags: { "wod20-compendium-es": { id: "sanctum-laboratorio" } },
			name: "Sanctum / Laboratorio"
		}]
	};
}

test("Sanctum anathema at/above threshold flips BOTH flags to vulgar (A8, reversed default per Arreglo #2)", () => {
	const actor = fakeSanctumActor({ anathema: [{ practice_id: "witchcraft", rating: 3 }] });
	const result = PrismHelper.EvaluateVulgarity(actor, {
		practiceId: "witchcraft", sphereLevel: 3, scene: null, baseDificultadVulgar: false, baseParadojaVulgar: false
	});
	assert.deepEqual(result, { dificultadVulgar: true, paradojaVulgar: true });
});

test("an enabled Sanctum Práctica is unconditionally coincidental on BOTH flags", () => {
	const actor = fakeSanctumActor({ enabled: [{ practice_id: "witchcraft", rating: 2 }] });
	const result = PrismHelper.EvaluateVulgarity(actor, {
		practiceId: "witchcraft", sphereLevel: 5, scene: null, baseDificultadVulgar: true, baseParadojaVulgar: true
	});
	assert.deepEqual(result, { dificultadVulgar: false, paradojaVulgar: false });
});

test("A10 — a Zona's symmetric threshold flips both flags; Sanctum and Zona stack independently", () => {
	const actor = fakeSanctumActor();
	const scene = { flags: { worldofdarkness: { prismZones: [{ practice_id: "gutter-magick", value: -3 }] } } };
	const vulgar = PrismHelper.EvaluateVulgarity(actor, {
		practiceId: "gutter-magick", sphereLevel: 4, scene, baseDificultadVulgar: false, baseParadojaVulgar: false
	});
	assert.deepEqual(vulgar, { dificultadVulgar: true, paradojaVulgar: true });

	const coincidental = PrismHelper.EvaluateVulgarity(actor, {
		practiceId: "hypertech", sphereLevel: 2,
		scene: { flags: { worldofdarkness: { prismZones: [{ practice_id: "hypertech", value: 3 }] } } },
		baseDificultadVulgar: true, baseParadojaVulgar: true
	});
	assert.deepEqual(coincidental, { dificultadVulgar: false, paradojaVulgar: false });
});

console.log(`\n${failures === 0 ? "All prism-of-focus pure-function tests passed." : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
