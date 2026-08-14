/**
 * add-prism-of-focus-foundry — design.md D12/D16's Práctica-by-Práctica triage, as DATA rather than
 * 31+7 bespoke functions. Every entry is keyed by the practice's stable `id` (the same slug
 * `flags['wod20-compendium-es'].id` already uses across this corpus — verified against the shipped
 * `wod20-compendium-es/src/mage-practices/*.json`, e.g. `dominion`, `faith`, `the-scene`).
 *
 * Rule shapes (`AUTO_PRACTICE_RULES[id].benefit`/`.penalty`), each optional (`null` = this half is not
 * modeled as a dice-modifier, either because it is `flavor-only` for that half — Chamanismo's
 * Penalización, D10 — or because the whole Práctica is `prompt`/`flavor-only` and lives in a
 * different table below):
 *   - `{ kind: "checkbox", modifier, labelKey }` — a flat difficulty modifier, gated on a single
 *     casting-dialog checkbox (`context.practiceChecks[id].benefit`/`.penalty`).
 *   - `{ kind: "checkbox", modifier, labelKey, crossActor: true }` — same shape, but the checkbox
 *     asks about a DIFFERENT actor's state (Ciencia Extraña's A22 Beneficio: the analyst's own
 *     rating, not the caster's).
 *   - `{ kind: "computed", labelKey, compute(actor) }` — no checkbox; the modifier is derived
 *     directly from the actor's own traits (Artes marciales: `Pelea - Artes Marciales` when
 *     positive).
 *   - `{ kind: "tiered", labelKey, tiers: [{value, labelKey}] }` — a dialog-select among several
 *     named magnitudes (Inversión's Penalización).
 *   - `{ kind: "decouple-paradox-only", modifier: 0, forcesParadojaVulgar: true, labelKey }` —
 *     Medicina's Penalización: `paradoja_vulgar` forced `true`, `dificultad_vulgar` untouched,
 *     difficulty itself untouched (one of design.md D5's three named decouplers).
 *   - `{ kind: "gate", labelKey }` — a structural validation gate, not a dice number (Brujería's Tass-
 *     type-restriction Penalización) — surfaced as sheet text/warning only, `CheckPracticePenalty`
 *     returns `0` for it, matching "not computed as a number here" in tasks.md 6.1.
 *
 * `traitField` cross-references the `system.practiceTraits.*` field (design.md D9/task 11.4) whose
 * VALUE is shown alongside the checkbox as a reminder of what the player set at creation, for the six
 * Prácticas whose Beneficio depends on it — the value itself is display-only; the player still
 * attests the checkbox because only they know whether THIS cast actually matches it.
 */

export const AUTO_PRACTICE_RULES = {
	animalism: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.animalism.benefit", traitField: "heartBeast" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.animalism.penalty" }
	},
	appropriation: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.appropriation.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.appropriation.penalty" }
	},
	"art-of-desire": {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.artofdesire.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.artofdesire.penalty" }
	},
	"chaos-magick": {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.chaosmagick.benefit" },
		// Penalty is Fórmula-only and disjoint from C3 (design.md D11) — modeled separately in
		// `PrismHelper.CheckChaosMagickFormulaPenalty`, not here (it needs the "is this Fórmula-
		// backed" context that CheckImprovisedPenalty also needs, and the two must never be
		// confused for "the same modifier applying twice").
		penalty: null
	},
	charity: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.charity.benefit" },
		// "always vulgar when taking" is a vulgarity classification, not a difficulty modifier — see
		// `PrismHelper.CheckCharityForcesVulgar`.
		penalty: null
	},
	craftwork: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.craftwork.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.craftwork.penalty" }
	},
	"crazy-wisdom": {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.crazywisdom.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.crazywisdom.penalty" }
	},
	cybernetics: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.cybernetics.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.cybernetics.penalty" }
	},
	dominion: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.dominion.benefit" },
		penalty: { kind: "checkbox", modifier: 2, labelKey: "wod.prism.practice.dominion.penalty" }
	},
	elementalism: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.elementalism.benefit", traitField: "primaryElement" },
		penalty: { kind: "checkbox", modifier: 2, labelKey: "wod.prism.practice.elementalism.penalty", traitField: "primaryElement" }
	},
	"divine-bond": {
		// -1 PER domain threshold reached at Areté 1/3/5 — computed, not a flat checkbox, from
		// `practiceTraits.godBondingDomains` and the actor's own Areté rating.
		benefit: { kind: "computed", labelKey: "wod.prism.practice.divinebond.benefit", compute: "godBondingDomains" },
		penalty: { kind: "checkbox", modifier: 2, labelKey: "wod.prism.practice.divinebond.penalty", traitField: "godBondingVulnerability" }
	},
	"high-ritual-magick": {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.highritualmagick.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.highritualmagick.penalty" }
	},
	investment: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.investment.benefit" },
		penalty: {
			kind: "tiered",
			labelKey: "wod.prism.practice.investment.penaltylabel",
			tiers: [
				{ value: 1, labelKey: "wod.prism.practice.investment.penalty.subweek" },
				{ value: 2, labelKey: "wod.prism.practice.investment.penalty.subday" },
				{ value: 3, labelKey: "wod.prism.practice.investment.penalty.immediate" }
			]
		}
	},
	"martial-arts": {
		benefit: null,
		penalty: { kind: "computed", labelKey: "wod.prism.practice.martialarts.penalty", compute: "martialArtsGap" }
	},
	"medicine-work": {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.medicinework.benefit" },
		penalty: { kind: "decouple-paradox-only", modifier: 0, forcesParadojaVulgar: true, labelKey: "wod.prism.practice.medicinework.penalty" }
	},
	mediumship: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.mediumship.benefit", traitField: "mediumshipUmbra" },
		// +1 general resist-possession / +2 specifically the affinity Umbra — modeled as a tiered
		// choice rather than two separate checkboxes.
		penalty: {
			kind: "tiered",
			labelKey: "wod.prism.practice.mediumship.penaltylabel",
			traitField: "mediumshipUmbra",
			tiers: [
				{ value: 1, labelKey: "wod.prism.practice.mediumship.penalty.general" },
				{ value: 2, labelKey: "wod.prism.practice.mediumship.penalty.affinity" }
			]
		}
	},
	"reality-hacking": {
		benefit: { kind: "checkbox", modifier: 0, labelKey: "wod.prism.practice.realityhacking.benefit", forcesCoincidental: true },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.realityhacking.penalty" }
	},
	shamanism: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.shamanism.benefit", traitField: "shamanismEnvironment" },
		// Penalización stays flavor-only (A24/D10) — deliberately not wired here, see task 12.2.
		penalty: null
	},
	voudoun: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.voudoun.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.voudoun.penalty" }
	},
	"weird-science": {
		// A22 — cross-actor: penalizes whoever is ANALYZING the effect, not the caster.
		benefit: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.weirdscience.benefit", crossActor: true },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.weirdscience.penalty" }
	},
	witchcraft: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.witchcraft.benefit", traitField: "witchcraftCycle" },
		penalty: { kind: "gate", labelKey: "wod.prism.practice.witchcraft.penalty" }
	},
	yoga: {
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.practice.yoga.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.practice.yoga.penalty" }
	}
};

/** The 7 `prompt`-bucket Prácticas: metadata only — each gets its own small dialog in
 *  `prism-prompt-dialogs.js`, not a checkbox in the casting dialog. */
export const PROMPT_PRACTICE_IDS = [
	"alchemy", "maleficia", "invigoration", "hypertech", "media-control", "psionics", "faith"
];

/** The 3 `flavor-only` halves: no automatic modifier anywhere, ever (design.md D12 closing table).
 *  `shamanism` appears here for its PENALTY only — its Beneficio is in `AUTO_PRACTICE_RULES` above. */
export const FLAVOR_ONLY_PRACTICE_HALVES = {
	bardism: ["benefit", "penalty"],
	"gutter-magick": ["benefit", "penalty"],
	shamanism: ["penalty"]
};

/**
 * design.md D16 — the 7 Prácticas Corruptas' own named Beneficio/Precio, layered on top of D8's
 * shared engine (Resonance counter + resistance roll + substitution-at-threshold).
 */
export const CORRUPTED_PRACTICE_RULES = {
	feralism: {
		base: "animalism",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.feralism.benefit" },
		penalty: {
			kind: "tiered",
			labelKey: "wod.prism.corrupted.feralism.penaltylabel",
			tiers: [
				{ value: 1, labelKey: "wod.prism.corrupted.feralism.penalty.t1" },
				{ value: 2, labelKey: "wod.prism.corrupted.feralism.penalty.t2" },
				{ value: 3, labelKey: "wod.prism.corrupted.feralism.penalty.t3" }
			]
		}
	},
	abyssalism: {
		base: "crazy-wisdom",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.abyssalism.benefit" },
		// Precio is a Silence FLOOR, not a roll modifier — see `PrismHelper.AbyssalismSilenceFloor`.
		penalty: { kind: "silence-floor", labelKey: "wod.prism.corrupted.abyssalism.penalty" }
	},
	"the-black-mass-practice": {
		base: "faith",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.blackmass.benefit" },
		penalty: {
			kind: "tiered",
			labelKey: "wod.prism.corrupted.blackmass.penaltylabel",
			tiers: [
				{ value: 1, labelKey: "wod.prism.corrupted.blackmass.penalty.private" },
				{ value: 2, labelKey: "wod.prism.corrupted.blackmass.penalty.public" }
			]
		}
	},
	goetia: {
		base: "high-ritual-magick",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.goetia.benefit" },
		// Precio is a catastrophic-failure BRANCH, not a modifier — see
		// `PrismHelper.GoetiaCatastrophicFailure`.
		penalty: { kind: "failure-branch", labelKey: "wod.prism.corrupted.goetia.penalty" }
	},
	"infernal-sciences": {
		// A21 — 3 possible bases; the character's `chosen_base_practice_id` picks one, locked.
		base: ["hypertech", "cybernetics", "weird-science"],
		benefit: {
			kind: "tiered",
			labelKey: "wod.prism.corrupted.infernalsciences.benefitlabel",
			tiers: [
				{ value: 1, labelKey: "wod.prism.corrupted.infernalsciences.benefit.hurt" },
				{ value: 2, labelKey: "wod.prism.corrupted.infernalsciences.benefit.killed" }
			]
		},
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.corrupted.infernalsciences.penalty" }
	},
	demonism: {
		base: "shamanism",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.demonism.benefit" },
		penalty: { kind: "checkbox", modifier: 1, labelKey: "wod.prism.corrupted.demonism.penalty" }
	},
	vamamarga: {
		base: "yoga",
		benefit: { kind: "checkbox", modifier: -1, labelKey: "wod.prism.corrupted.vamamarga.benefit" },
		// Precio is its OWN Jhor Resonance track + difficulty-6 resistance roll — see
		// `PrismHelper.VamamargaJhorCheck`, wired alongside (not instead of) the generic engine.
		penalty: { kind: "jhor-resonance", labelKey: "wod.prism.corrupted.vamamarga.penalty" }
	}
};
