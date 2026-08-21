/**
 * add-paradox-system task 4 — pure arithmetic for the Sphere-casting difficulty chain.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The whole calculation used to live inside the `Rote` class in `dialog-aretecasting.js`, a file
 * that `extends FormApplication` at module load. `Rote` itself is a plain data object (no Foundry
 * base class), but importing it means importing that file, and a module-load-time
 * `extends FormApplication` throws the instant `node` tries to import it outside a Foundry runtime
 * — so **nothing could unit-test the dice-pool arithmetic that governs every magic roll at the
 * table**. `Rote._setDifficulty()` and `Rote._highestRank()` now delegate to the functions below;
 * their observable behaviour is unchanged, byte-for-byte, on every branch.
 *
 * Kept dependency-free (no `game`/`CONFIG`/Foundry class globals), the same boundary
 * `formula-casting-helpers.js` and `casting-dot-helpers.js` draw. `lowestDifficulty` is read from
 * `CONFIG.worldofdarkness.lowestDifficulty` by the caller and passed in as a plain number — never
 * read from `CONFIG` in here.
 *
 * THE CAP, IN ONE PLACE
 * ----------------------
 * `_setDifficulty` (display: `shownDifficulty`) and `_castSpell` (the actual roll: converting the
 * excess over 10 into required successes, `core:17703`) used to each reimplement the
 * `[lowestDifficulty, 10]` cap independently. They happened to agree only because `_castSpell` runs
 * AFTER `_setDifficulty` and reapplies the identical bounds — agreement by execution order, not by
 * construction. `capDifficultyToRollable()` is now the single place that cap lives; both callers
 * use it.
 */

/**
 * The highest rank among the Spheres actually selected — never their sum (`core:19575`: a Pifia on
 * an Effect using Correspondencia 4 and Vida 3 costs 4 points, not 7, and the same "highest, not
 * sum" rule sets the base casting difficulty).
 *
 * Mirrors `Rote._highestRank()` exactly, including its tolerance of the dialog's own initial shape:
 * `selectedSpheres` starts life as `[]` (an Array, not a plain object) and is indexed by Sphere id
 * afterwards, with values arriving as numbers from `_onDotSphereChange()` and as strings from item
 * data — the loose `>`/`<` comparisons below rely on JS's usual string/number coercion exactly as
 * the original method did, so this is a straight extraction, not a rewrite.
 *
 * @param {object|Array} selectedSpheres a `{ [sphereId]: rank }` map (or the initial `[]`)
 * @returns {number} the highest positive rank found, or -1 if none is selected
 */
export function highestSelectedSphereRank(selectedSpheres) {
    let highestRank = -1;

    for (const sphere in selectedSpheres) {
        const rank = selectedSpheres[sphere];

        if (rank > 0) {
            if (highestRank < rank) {
                highestRank = rank;
            }
        }
    }

    return highestRank;
}

/**
 * The single place the `[lowestDifficulty, 10]` cap lives (see file docblock). Anything above 10
 * cannot be rolled — the book converts the excess 1:1 into additional required successes instead
 * (`core:17703`) — and anything below `lowestDifficulty` is floored to it.
 *
 * @param {number} difficulty the difficulty value to cap (already clamped to its own ±3 band)
 * @param {number} lowestDifficulty the table's floor (`CONFIG.worldofdarkness.lowestDifficulty`,
 *   2 by default)
 * @returns {{difficulty: number, extraSuccesses: number}} the rollable difficulty and how many
 *   extra successes the excess over 10 demands (0 on every other path)
 */
export function capDifficultyToRollable(difficulty, lowestDifficulty) {
    if (difficulty > 10) {
        return { difficulty: 10, extraSuccesses: difficulty - 10 };
    }

    if (difficulty < lowestDifficulty) {
        return { difficulty: lowestDifficulty, extraSuccesses: 0 };
    }

    return { difficulty, extraSuccesses: 0 };
}

/**
 * The full Sphere-casting difficulty calculation, mirroring `Rote._setDifficulty(rank)` exactly.
 *
 * Base difficulty by Effect type (`core` table behind `wod.spheres.*` labels): coincidental
 * `E↑+3`, vulgar without witnesses `E↑+4`, vulgar with witnesses `E↑+5` — and witnesses change
 * NOTHING when the Effect is coincidental, because that branch never looks at `witnesses` at all.
 * `ignoreSphereBaseDifficulty` overrides all of that: the base difficulty is instead whatever the
 * Narrador already set by hand (`manualBaseDifficulty`, the dialog's own `baseDifficulty` field,
 * mutated by its difficulty-picker buttons — a separate, unrelated `_setDifficulty` method on
 * `DialogAreteCasting`, not this one).
 *
 * The net modifiers (`sumSelectedDifficulty` + `difficultyModifier` + `quintessence`) are added to
 * the base and then clamped to a **±3 band around the base itself** — not around 0, and not around
 * the final [lowestDifficulty, 10] range. `shownDifficulty` is that same total, additionally capped
 * to `[lowestDifficulty, 10]` for display via `capDifficultyToRollable()` above; it does NOT carry
 * the `extraSuccesses` half of that cap — `_castSpell` computes those itself, right before the
 * roll, from a value that can still change between an earlier `getData()`/render and the actual
 * cast (a new modifier ticked, a fresh Sphere pick).
 *
 * When neither `ignoreSphereBaseDifficulty` nor a recognised `spelltype` yields a base difficulty
 * (rank is -1, or `spelltype` is empty/unrecognised), this returns `null` — mirroring the original
 * method's behaviour of leaving `baseDifficulty`/`totalDifficulty`/`shownDifficulty` untouched and
 * returning -1, which a pure function cannot do by simply not assigning to `this`.
 *
 * @param {object} input
 * @param {number} input.rank highest selected Sphere rank (`highestSelectedSphereRank()`'s result)
 * @param {string} input.spelltype `"coincidental"` | `"vulgar"` | anything else (treated as unset)
 * @param {boolean} input.witnesses whether Durmiente witnesses are present
 * @param {boolean} input.ignoreSphereBaseDifficulty Narrador override switch
 * @param {number} input.manualBaseDifficulty the manually-set base difficulty, used only when the
 *   override switch above is on
 * @param {number} input.sumSelectedDifficulty sum of the ticked modifier rows
 * @param {number} input.difficultyModifier the free-form modifier field
 * @param {number} input.quintessence Quintessence spend (already signed; negative = spent)
 * @param {number} input.lowestDifficulty the table's floor (`CONFIG.worldofdarkness.lowestDifficulty`)
 * @returns {{baseDifficulty: number, totalDifficulty: number, shownDifficulty: number}|null}
 */
export function computeCastingDifficulty({
    rank,
    spelltype,
    witnesses,
    ignoreSphereBaseDifficulty,
    manualBaseDifficulty,
    sumSelectedDifficulty,
    difficultyModifier,
    quintessence,
    lowestDifficulty
}) {
    let diff = -1;

    if (ignoreSphereBaseDifficulty) {
        diff = manualBaseDifficulty;
    }
    else if (rank > -1) {
        if (witnesses && spelltype === "vulgar") {
            diff = parseInt(rank) + 5;
        }
        else if (!witnesses && spelltype === "vulgar") {
            diff = parseInt(rank) + 4;
        }
        else if (spelltype === "coincidental") {
            diff = parseInt(rank) + 3;
        }
    }

    if (!(diff > -1)) {
        return null;
    }

    const baseDifficulty = diff;
    let totalDifficulty = parseInt(baseDifficulty) + parseInt(sumSelectedDifficulty) + parseInt(difficultyModifier) + parseInt(quintessence);

    if (totalDifficulty > baseDifficulty + 3) {
        totalDifficulty = baseDifficulty + 3;
    }
    if (totalDifficulty < baseDifficulty - 3) {
        totalDifficulty = baseDifficulty - 3;
    }

    const shownDifficulty = capDifficultyToRollable(totalDifficulty, lowestDifficulty).difficulty;

    return { baseDifficulty, totalDifficulty, shownDifficulty };
}
