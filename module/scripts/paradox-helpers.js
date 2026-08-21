/**
 * add-paradox-system — pure helpers for Paradoja: how much a casting generates
 * (`computeParadoxGain`) and what a contragolpe (backlash) does to the reserve
 * (`computeBacklash`), plus the small pieces both need (Esfera más alta, nivel de
 * Silencio, amplificación de Defectos, umbrales de aviso).
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * `dialog-aretecasting.js` does `extends FormApplication` at module load, so nothing in it can be
 * imported by a plain-node test — the same wall `formula-casting-helpers.js` and
 * `casting-dot-helpers.js` already documented and worked around. This module stays free of
 * `game`/`CONFIG`/`Actor`/`Item`/any Foundry class global for exactly that reason: it is the only
 * way the Paradoja arithmetic (and the M1-M9 table decisions baked into it) can be unit-tested at
 * all. The dialog is expected to call these functions with plain data and do nothing more clever
 * than that; see `openspec/changes/add-paradox-system/` for the full spec this implements
 * (`proposal.md`'s M1-M9 table, `design.md`'s D1-D8, `specs/foundry-paradox/spec.md`).
 *
 * TERMINOLOGY (fixed by the corpus, `proposal.md`'s Impact section): "Quiet" is **Silencio**
 * (never "Quietud"), the physical backlash is **la Quemadura**, and *backlash* is **contragolpe**.
 *
 * TABLE-DECISION NOTE
 * --------------------
 * Every M-numbered decision below is a Narrador ruling on a corpus that does not close the
 * question on its own — see `proposal.md`'s table for the citations on both sides. None of them
 * is "what the book says"; they are declared table rulings, kept configurable where the proposal
 * says so (M1, M4) and simply implemented as written where it doesn't (M2-M3, M5-M9).
 */

/* ------------------------------------------------------------------------------------------------
 * Shared tolerant-parsing helpers
 * ------------------------------------------------------------------------------------------------
 * Mirrors the tolerance rule `casting-dot-helpers.js` already established for this dialog:
 * `selectedSpheres` is born as `[]` (an Array) and later indexed by Sphere key; values arrive as
 * numbers from click handlers and as strings from item/actor data. Every entry point below returns
 * 0 rather than NaN or a negative number for anything it cannot parse.
 * ------------------------------------------------------------------------------------------------ */

function toNonNegativeInt(value) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return parsed;
}

/**
 * `E↑` — the highest-ranked Sphere among a selection, NEVER the sum (the book's own canonical
 * example: Correspondencia 4 / Vida 3 is 4 points, never 7 — `core:19575`).
 *
 * Tolerant of the same shapes `casting-dot-helpers.js` already tolerates on this dialog:
 * `selectedSpheres` starts life as `[]` (an Array), is later indexed by Sphere key (an Object), and
 * its values arrive as numbers or as strings. Negative/NaN/missing entries are treated as 0 and
 * never lower the running maximum below 0.
 *
 * @param {object|Array|null|undefined} selectedSpheres
 * @returns {number} the highest rank present, 0 for an empty/unusable selection
 */
export function highestSphereRank(selectedSpheres) {
	if (!selectedSpheres) {
		return 0;
	}

	const values = Array.isArray(selectedSpheres) ? selectedSpheres : Object.values(selectedSpheres);

	let max = 0;
	for (const raw of values) {
		const parsed = toNonNegativeInt(raw);
		if (parsed > max) {
			max = parsed;
		}
	}
	return max;
}

/* ------------------------------------------------------------------------------------------------
 * House-rule toggles (M1, M4) — configurable, cited in place rather than buried in a constant.
 * ------------------------------------------------------------------------------------------------ */

export const DEFAULT_PARADOX_OPTIONS = Object.freeze({
	// M1 — does a SIMPLE failure (0 successes, no botch) on a vulgar Effect pay a point?
	// Decision: YES. This is the MINORITY reading of the corpus: `core:17567` ("¿Has fallado? …
	// (Recibe Paradoja)") against `core:19569`, `core:19614` and `core:17710`. A deliberate table
	// ruling, not an oversight — flip this to `false` to revert to the majority reading.
	simpleFailureCosts: true,

	// M4 — backlash burn dice for rows ABOVE 10 successes, extrapolated at 1 die per success. The
	// corpus only states this rate for rows 1-10 (`core:19645-19649`); rows 11+ have no declared
	// rate at all. This flag governs ONLY those upper rows — rows 1-10 always apply the base rule
	// regardless of this toggle, because that part is not in dispute.
	extrapolateBurnDiceAboveTen: true,
});

function resolveOptions(options, modifiers) {
	// `design.md`'s literal signature names this parameter `modifiers`; this module accepts either
	// name (options takes precedence when both are given) so callers can use whichever reads best.
	return { ...DEFAULT_PARADOX_OPTIONS, ...(modifiers || {}), ...(options || {}) };
}

/* ------------------------------------------------------------------------------------------------
 * 2.1 — computeParadoxGain(): the ganancia table, plus the ritual tax (+1 per roll after the
 * first, cumulative, no reset on failure).
 * ------------------------------------------------------------------------------------------------ */

/**
 * The ganancia table (`proposal.md`'s Context section; `specs/foundry-paradox/spec.md`'s first
 * Requirement), applied to a SINGLE casting roll:
 *
 * |            | Coincidente | Vulgar sin testigos | Vulgar con testigos |
 * |------------|-------------|----------------------|----------------------|
 * | Éxito      | 0           | 1                    | 1                    |
 * | Fallo simple (M1) | 0     | 1 (si M1)            | 1 (si M1)            |
 * | Pifia      | E↑          | 1 + E↑               | 2 + (2 × E↑)         |
 *
 * Nothing else — not the number of successes, not the number of 1s beyond deciding botch/no-botch,
 * not Quintessence/Willpower spend — changes the total.
 *
 * @param {object} input
 * @param {boolean} [input.vulgar=false] whether the Effect was ruled vulgar (never derived here —
 *   the Narrador's coincidental/vulgar call is a Non-Goal to automate, per `proposal.md`)
 * @param {boolean} [input.witnesses=false] whether Sleeper witnesses were present; irrelevant
 *   unless `vulgar` and the roll botched
 * @param {number|string} [input.highestSphere=0] `E↑` — already resolved by the caller (or via
 *   `highestSphereRank()` beforehand); tolerant of a numeric string
 * @param {"success"|"fail"|"botch"} input.rollResult the casting roll's outcome
 * @param {number} [input.ritualRollNumber=1] 1-based index of THIS roll within an extended
 *   (ritual) casting; rolls after the first each add the ritual tax below
 * @param {object} [input.options] house-rule toggles, see `DEFAULT_PARADOX_OPTIONS`
 * @param {object} [input.modifiers] alias for `options` (design.md's literal parameter name)
 * @returns {{ total: number, breakdown: Array<{label: string, points: number, rule: string}>, rule: string }}
 */
export function computeParadoxGain({
	vulgar = false,
	witnesses = false,
	highestSphere = 0,
	rollResult,
	ritualRollNumber = 1,
	options,
	modifiers,
} = {}) {
	const opts = resolveOptions(options, modifiers);
	const eUp = toNonNegativeInt(highestSphere);

	const breakdown = [];
	let total = 0;

	const addTerm = (label, points, rule) => {
		const safePoints = Number.isFinite(points) && points > 0 ? points : 0;
		breakdown.push({ label, points: safePoints, rule });
		total += safePoints;
	};

	if (!vulgar) {
		if (rollResult === "botch") {
			addTerm(`Pifia coincidente: E↑ (${eUp})`, eUp, "coincidental-botch");
		} else if (rollResult === "success" || rollResult === "fail") {
			addTerm("Efecto coincidente: sin ganancia de Paradoja", 0, "coincidental-none");
		} else {
			addTerm(`Resultado de tirada no reconocido ("${rollResult}")`, 0, "unknown-roll-result");
		}
	} else if (rollResult === "success") {
		addTerm("Éxito vulgar: 1 punto fijo", 1, "vulgar-success");
	} else if (rollResult === "fail") {
		if (opts.simpleFailureCosts) {
			addTerm("Fallo simple vulgar: 1 punto (M1, regla de mesa — lectura minoritaria)", 1, "vulgar-simple-fail-m1-on");
		} else {
			addTerm("Fallo simple vulgar: 0 puntos (M1 desactivado en esta mesa)", 0, "vulgar-simple-fail-m1-off");
		}
	} else if (rollResult === "botch") {
		if (witnesses) {
			addTerm(`Pifia vulgar con testigos: 2 + (2 × E↑) = ${2 + 2 * eUp}`, 2 + 2 * eUp, "vulgar-botch-witnesses");
		} else {
			addTerm(`Pifia vulgar sin testigos: 1 + E↑ = ${1 + eUp}`, 1 + eUp, "vulgar-botch-no-witnesses");
		}
	} else {
		addTerm(`Resultado de tirada no reconocido ("${rollResult}")`, 0, "unknown-roll-result");
	}

	const ritualTax = ritualRollIncrement(ritualRollNumber);
	if (ritualTax > 0) {
		addTerm(
			`Ritual: +1 por tirada tras la primera (tirada nº ${toNonNegativeInt(ritualRollNumber)})`,
			ritualTax,
			"ritual-tax-per-roll"
		);
	}

	return { total, breakdown, rule: breakdown[0]?.rule ?? "no-gain" };
}

/**
 * The per-roll ritual tax contribution: 0 for the first roll of an extended casting, 1 for every
 * roll after that. Summing this across every roll of a ritual (calling `computeParadoxGain` once
 * per roll, or calling this directly) reproduces "+1 por cada tirada posterior a la primera, de
 * forma acumulativa" — it never resets after a failed intermediate roll because it depends only on
 * the roll's position in the sequence, never on that roll's own outcome (`core:19330-19334`).
 *
 * @param {number|string} ritualRollNumber 1-based index of the roll within the ritual
 * @returns {number} 0 or 1
 */
export function ritualRollIncrement(ritualRollNumber) {
	return toNonNegativeInt(ritualRollNumber) > 1 ? 1 : 0;
}

/**
 * Whether the ritual tax accumulated across an extended casting's rolls is kept or discarded, once
 * the ritual as a whole concludes. A ritual that ultimately SUCCEEDS discards every ritual-tax
 * point it accrued along the way; one that fails keeps them, and they are added to the reserve.
 *
 * @param {number} accumulatedRitualPoints sum of `ritualRollIncrement()`/the ritual-tax breakdown
 *   entries across every roll of the extended casting
 * @param {boolean} ritualSucceeded whether the ritual's FINAL result was a success
 * @returns {number} the points to actually add to the reserve (0 when discarded)
 */
export function resolveRitualAccumulation(accumulatedRitualPoints, ritualSucceeded) {
	return ritualSucceeded ? 0 : toNonNegativeInt(accumulatedRitualPoints);
}

/* ------------------------------------------------------------------------------------------------
 * Warning thresholds (proposal.md: ≥5 offers the backlash button, ≥10 "inevitable", ≥20 critical).
 * ------------------------------------------------------------------------------------------------ */

/**
 * @param {object} input
 * @param {number} [input.gain=0] points generated by THIS roll (used for the ≥5 button highlight, M3)
 * @param {number} [input.reserve=0] the character's CURRENT total Paradoja (temporal + permanente)
 * @returns {{ offerBacklashButton: boolean, inevitableWarning: boolean, criticalWarning: boolean }}
 */
export function backlashThresholds({ gain = 0, reserve = 0 } = {}) {
	const g = toNonNegativeInt(gain);
	const r = toNonNegativeInt(reserve);
	return {
		offerBacklashButton: g >= 5, // M3, core:19578/19633 vs core:17578
		inevitableWarning: r >= 10, // core:19679
		criticalWarning: r >= 20, // core:11774
	};
}

/* ------------------------------------------------------------------------------------------------
 * Nivel de Silencio (M5: from the CURRENT reserve, never from the amount discharged).
 * ------------------------------------------------------------------------------------------------ */

/**
 * `core:19864-19871`'s scale. Level 6 is irreversible (Merodeador PNJ, M6) — this function only
 * reports the number; the caller (the eventual chat-card, out of this module's scope) is
 * responsible for gating the write behind an explicit confirmation.
 *
 * @param {number} reserve the character's CURRENT total Paradoja (temporal + permanente), the
 *   worked example being Jodi Blake: reserve 13 -> level 4 (`core:20233`)
 * @returns {number} 0 (no Silencio) through 6
 */
export function silenceLevel(reserve) {
	const r = toNonNegativeInt(reserve);
	if (r <= 0) return 0;
	if (r <= 3) return 1;
	if (r <= 6) return 2;
	if (r <= 10) return 3;
	if (r <= 15) return 4;
	if (r <= 20) return 5;
	return 6;
}

/** True only for the level that retires the character (M6) — a single, named boundary so a caller
 * never has to spell out `=== 6` themselves. */
export function silenceRequiresConfirmation(level) {
	return toNonNegativeInt(level) === 6;
}

/* ------------------------------------------------------------------------------------------------
 * Defectos de Paradoja (D7/M7): grade + free text, no invented catalogue. Later Paradoja
 * AMPLIFIES the existing Defecto instead of creating a new one (`core:19730`).
 * ------------------------------------------------------------------------------------------------ */

export const DEFECT_DEGREES = Object.freeze(["none", "trivial", "minor", "significant", "severe", "drastic"]);

function defectIndex(degree) {
	const idx = DEFECT_DEGREES.indexOf(degree);
	return idx === -1 ? 0 : idx;
}

/**
 * Resolves what happens to a character's Defecto de Paradoja when a new contragolpe would produce
 * one: the result is the HIGHER of the existing degree and the newly-triggered one — the existing
 * Defecto is amplified, never replaced by an unrelated second one (D7).
 *
 * @param {string} existingDegree one of `DEFECT_DEGREES`, or falsy/"none" for no prior Defecto
 * @param {string} candidateDegree the degree this contragolpe's row would produce on its own
 * @returns {{ degree: string, amplified: boolean, created: boolean }} `amplified` is true when a
 *   pre-existing Defecto's grade was raised (or held) rather than a fresh one created; `created` is
 *   true only when there was no prior Defecto at all
 */
export function amplifyDefect(existingDegree, candidateDegree) {
	const existingIdx = defectIndex(existingDegree || "none");
	const candidateIdx = defectIndex(candidateDegree || "none");
	const resultIdx = Math.max(existingIdx, candidateIdx);

	return {
		degree: DEFECT_DEGREES[resultIdx],
		amplified: existingIdx > 0,
		created: existingIdx === 0 && candidateIdx > 0,
	};
}

/* ------------------------------------------------------------------------------------------------
 * 2.2 — computeBacklash(): tirar (temporal + permanente) dados a dificultad 6 con la regla del
 * uno, consultar la tabla, calcular descarga, Quemadura, Defecto y Silencio potencial.
 * ------------------------------------------------------------------------------------------------ */

function defaultRoll(diceCount) {
	// Real, non-deterministic fallback for production use. NOTE: this branch IS reached by the gate
	// — `paradox-card.js`'s backlash path calls `computeBacklash()` without injecting dice, because
	// production must roll for real — so `test-paradox-card.mjs` pins `Math.random` around that call
	// rather than relying on luck. Do not "simplify" that stub away: without it the gate fails
	// whenever a roll nets zero successes without botching.
	const results = [];
	for (let i = 0; i < diceCount; i++) {
		results.push(Math.floor(Math.random() * 10) + 1);
	}
	return results;
}

/**
 * Rolls `diceCount` dice at difficulty 6 with "la regla del uno": every die >= 6 is a raw success,
 * every die === 1 cancels one raw success (net floors at 0, mirroring `roll-dice.js`'s own
 * `usehandleOnes` arithmetic). A botch is a roll with ZERO raw successes and at least one 1 —
 * exactly `roll-dice.js`'s own `rolledAnySuccesses`-gated classification, not simply "net <= 0",
 * so a roll that scored real successes which 1s then cancelled to net 0 is a plain failure, not a
 * botch.
 *
 * @param {number} diceCount
 * @param {object} [source]
 * @param {number[]} [source.dice] explicit, pre-rolled die faces — highest priority, for
 *   deterministic tests
 * @param {(count: number) => number[]} [source.roll] a roll function, used when `dice` is absent
 * @returns {{ results: number[], rawSuccesses: number, ones: number, netSuccesses: number, botch: boolean }}
 */
export function rollParadoxPool(diceCount, { dice, roll } = {}) {
	const count = toNonNegativeInt(diceCount);
	const results = Array.isArray(dice) ? dice.slice(0, count) : (roll ? roll(count) : defaultRoll(count));

	let rawSuccesses = 0;
	let ones = 0;
	for (const face of results) {
		const n = Number.parseInt(face, 10);
		if (n >= 6) {
			rawSuccesses++;
		} else if (n === 1) {
			ones++;
		}
	}

	const netSuccesses = Math.max(0, rawSuccesses - ones);
	const botch = rawSuccesses === 0 && ones > 0;

	return { results, rawSuccesses, ones, netSuccesses, botch };
}

/**
 * Which row of the contragolpe table a net-successes count falls into.
 * @param {number} netSuccesses
 * @returns {"none"|"1-5"|"6-10"|"11-15"|"16-20"|"21+"}
 */
export function backlashRow(netSuccesses) {
	const n = toNonNegativeInt(netSuccesses);
	if (n <= 0) return "none";
	if (n <= 5) return "1-5";
	if (n <= 10) return "6-10";
	if (n <= 15) return "11-15";
	if (n <= 20) return "16-20";
	return "21+";
}

const BURN_TYPE_BY_ROW = Object.freeze({
	"1-5": "bashing",
	"6-10": "bashing",
	"11-15": "lethal",
	"16-20": "lethal",
	"21+": "aggravated",
});

// The mandatory Defecto degree for rows 1-10 (joined with the burn by ";" in the corpus, i.e.
// unconditional); for rows 11+ it is only a CANDIDATE, one of the options the Narrador chooses
// among (M8) rather than a certainty — see `optionsNote` below.
const DEFECT_CANDIDATE_BY_ROW = Object.freeze({
	"1-5": "trivial",
	"6-10": "minor",
	"11-15": "significant",
	"16-20": "severe",
	"21+": "drastic",
});

/**
 * Resolves a single contragolpe: rolls the reserve at difficulty 6, applies the discharge rule
 * (`min(éxitos, temporal)` — permanent Paradoja NEVER discharges and returns to the pool for the
 * NEXT backlash, `core:19619`), and reads off the table for burn dice, Defecto candidate and the
 * M8 ambiguous option list for rows 11+. A failed roll (botch) discharges EVERYTHING with no
 * damage at all — the one detail the book flags as easy to implement backwards (`core:19643`).
 *
 * Rows 11-15/16-20/21+ carry conjunctions the corpus prints two incompatible ways (M8,
 * `core:17904` vs `core:19649`): this function does NOT choose or randomise among them. It returns
 * the full menu as `options`/`optionsNote` for a Narrador to pick from.
 *
 * @param {object} input
 * @param {number} [input.temporaryParadox=0]
 * @param {number} [input.permanentParadox=0]
 * @param {number[]} [input.dice] explicit pre-rolled faces, for deterministic tests
 * @param {(count: number) => number[]} [input.roll] a roll function, used when `dice` is absent
 * @param {string} [input.existingDefectDegree="none"] the character's current Defecto grade, if any
 * @param {object} [input.options] house-rule toggles, see `DEFAULT_PARADOX_OPTIONS`
 * @param {object} [input.modifiers] alias for `options`
 */
export function computeBacklash({
	temporaryParadox = 0,
	permanentParadox = 0,
	dice,
	roll,
	existingDefectDegree = "none",
	options,
	modifiers,
} = {}) {
	const opts = resolveOptions(options, modifiers);
	const temp = toNonNegativeInt(temporaryParadox);
	const perm = toNonNegativeInt(permanentParadox);
	const reserve = temp + perm; // M5: the CURRENT reserve, used for Silencio regardless of outcome

	const poolSize = temp + perm;
	const potentialSilenceLevel = silenceLevel(reserve);
	const baseResult = {
		diceRolled: poolSize,
		temporaryParadox: temp,
		permanentParadox: perm,
		potentialSilenceLevel,
		silenceRequiresConfirmation: silenceRequiresConfirmation(potentialSilenceLevel),
	};

	if (poolSize <= 0) {
		return {
			...baseResult,
			results: [], rawSuccesses: 0, ones: 0, netSuccesses: 0, botch: false,
			row: "none", discharge: 0, remainingTemporary: temp, remainingPermanent: perm,
			burnDice: null,
			defect: { degree: existingDefectDegree || "none", optional: false, amplified: false, created: false },
			options: [], optionsNote: null,
			rule: "no-paradox-no-backlash",
		};
	}

	const rolled = rollParadoxPool(poolSize, { dice, roll });
	const { results, rawSuccesses, ones, netSuccesses, botch } = rolled;

	if (botch) {
		return {
			...baseResult,
			results, rawSuccesses, ones, netSuccesses: 0, botch: true,
			row: "botch", discharge: temp, remainingTemporary: 0, remainingPermanent: perm,
			burnDice: null,
			defect: { degree: existingDefectDegree || "none", optional: false, amplified: false, created: false },
			options: [], optionsNote: null,
			rule: "backlash-botch-discharges-all-no-damage",
		};
	}

	const row = backlashRow(netSuccesses);

	if (row === "none") {
		return {
			...baseResult,
			results, rawSuccesses, ones, netSuccesses: 0, botch: false,
			row, discharge: 0, remainingTemporary: temp, remainingPermanent: perm,
			burnDice: null,
			defect: { degree: existingDefectDegree || "none", optional: false, amplified: false, created: false },
			options: [], optionsNote: null,
			rule: "backlash-zero-successes-no-discharge",
		};
	}

	const discharge = Math.min(netSuccesses, temp);
	const remainingTemporary = temp - discharge;

	// M4: rows 1-10 always apply the corpus rate; rows 11+ apply it only if the extrapolation
	// toggle is on (it has no declared rate of its own to fall back to when off).
	const burnDeclaredByCorpus = row === "1-5" || row === "6-10";
	const burnApplies = burnDeclaredByCorpus || opts.extrapolateBurnDiceAboveTen;
	const burnDice = burnApplies ? { type: BURN_TYPE_BY_ROW[row], count: netSuccesses } : null;

	const defectCandidate = DEFECT_CANDIDATE_BY_ROW[row];
	const amplification = amplifyDefect(existingDefectDegree, defectCandidate);
	const defectOptional = row === "11-15" || row === "16-20" || row === "21+";
	const defect = { degree: amplification.degree, optional: defectOptional, amplified: amplification.amplified, created: amplification.created };

	let optionsList = [];
	let optionsNote = null;
	if (row === "11-15") {
		optionsList = ["defect", "spirit", "quiet"];
		optionsNote = "Elige UNA: Defecto significativo, espíritu de Paradoja o Silencio leve (nivel derivado de la reserva, M5). El libro usa una conjunción de tipo \"o una de\" (core:17904 vs core:19649 discuten la misma construcción en la fila siguiente) — M8: se presenta como lista, sin elegir por el sistema.";
	} else if (row === "16-20") {
		optionsList = ["permanentParadoxPlusOne", "defect", "spirit", "quiet", "banishment"];
		optionsNote = "El libro imprime esta fila de dos formas incompatibles (M8: core:17904 \"y uno de\" frente a core:19649 \"o bien\"): o bien +1 Paradoja permanente, o bien elige DOS de Defecto severo / espíritu / Silencio moderado / destierro. Se presenta la lista completa sin resolver la ambigüedad ni imponer el recuento de selección.";
	} else if (row === "21+") {
		// Verificado contra el texto literal del corpus (core:19649 y core:17904), NO extrapolado de
		// la fila 16-20: esta fila tiene su PROPIA lista y difiere en tres de sus cinco entradas (DOS
		// puntos permanentes en vez de uno, Defecto drástico en vez de severo, Silencio severo en vez
		// de moderado). Reutilizar la lista de 16-20 aquí sería un error de contenido.
		optionsList = ["permanentParadoxPlusTwo", "defect", "spirit", "quiet", "banishment"];
		optionsNote = "El libro imprime esta fila de dos formas incompatibles (M8: core:19649 \"Quemadura de daño agravado O BIEN [lista]\" frente a core:17904 \"Quemadura de daño agravado Y UNO de [lista]\"). La lista literal es: dos puntos de Paradoja permanente, un Defecto de la Paradoja drástico, la visita de un espíritu de la Paradoja, un Silencio severo o el destierro a un Reino de la Paradoja. Se presenta sin resolver la conjunción ni imponer el recuento.";
	}

	return {
		...baseResult,
		results, rawSuccesses, ones, netSuccesses, botch: false,
		row, discharge, remainingTemporary, remainingPermanent: perm,
		burnDice,
		defect,
		options: optionsList, optionsNote,
		rule: `backlash-row-${row}`,
	};
}
