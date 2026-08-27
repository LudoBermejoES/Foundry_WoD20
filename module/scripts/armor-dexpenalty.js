/**
 * apply-armor-dexterity-penalty — correcting a positive `dexpenalty` that already lives INSIDE an
 * actor.
 *
 * THE DEFECT. `totals.js:208` does
 *
 *     updateData.system.attributes.dexterity.total += i.system.dexpenalty;
 *
 * on every equipped `Armor` Item, and `totals.js:263` then derives
 * `initiative.base = dexterity.total + wits.total` from it. So a `dexpenalty` of `+3` does not merely
 * fail to penalise — it GRANTS +3 Dexterity and +3 Initiative. Eleven documents shipped that way
 * (`vampire-armor` 4: 1/1/2/3; `werewolf-armor` 7: 1/1/2/2/2/3/3), because W20 and V20 tabulate the
 * penalty as an unsigned MAGNITUDE while M20, the SRD and Wraith20 tabulate it SIGNED, and both
 * exporters carried the cell verbatim (see design.md D6).
 *
 * WHY A MIGRATION AT ALL. Fixing the compendium fixes every FUTURE drag and **no** Item already
 * dragged: Foundry COPIES the compendium document onto the actor. A "Traje de antidisturbios" already
 * sitting on a live sheet keeps its `+3` forever unless something goes and rewrites it.
 *
 * WHY IT HAS NO FLAG, unlike both migrations in `migrations.js`. Its predicate is
 * `type == "Armor" && system.dexpenalty > 0`, and after this change a positive `dexpenalty` cannot
 * exist legitimately — so THE PREDICATE IS THE FLAG. It is idempotent by construction (a corrected
 * Item stops matching), and its blast radius is bounded by the number of non-Mage armor Items anyone
 * actually dragged, which is orders of magnitude below the ~88-actor mass write that
 * `migrations.js` warns a `FLAG_KEY` bump would cause. A versioned flag would buy nothing here and
 * would cost a walk over every actor on the next bump.
 *
 * ACCEPTED RISK, recorded because it is real (design.md D10). A house-ruled armor that deliberately
 * IMPROVED Dexterity — a Wonder, a table's own invention — would be reverted on every
 * `game.ready()`. This is accepted because all five books in the corpus define the field as a
 * subtraction ("dan una penalización", sdr/0.8.es.md:2205; "resta dados",
 * v20-core-rulebook-es.md:9060) and because an agility BONUS has a natural home in `bonuslist`, not
 * in a field named `dexpenalty`. Anyone who genuinely wants such an item should add it there.
 *
 * AND NOTE WHAT IS DELIBERATELY *NOT* DONE: `totals.js` does NOT gain a `Math.max(0, …)`. Clamping
 * in the consumer would have masked all eleven documents forever — with a clamp in place they would
 * have kept granting a bonus and nothing would ever have shown it (design.md D4). The correction
 * belongs where the data is produced, and here, where it was already copied.
 *
 * This module imports nothing and touches no global, which is what lets `tests/armor-dexpenalty.
 * test.mjs` execute it under plain `node --test` with no Foundry at all. The `game.actors` /
 * unlinked-token walk lives in `migrations.js`, where the rest of this system's world walks live.
 */

/**
 * The one definition of the sign rule ON THIS SIDE of the project: a penalty subtracts, so it is
 * negative. `-abs(n)` rather than a per-book convention table, for the reasons in design.md D6 —
 * it is total, unambiguous, and cannot break on the next book.
 *
 * The sibling definition lives in `webgen/models.py` and owns the EXPORT path; this one owns
 * already-copied actor data. They are not a duplicated rule so much as the same rule applied at the
 * only two places data enters: generation, and the world that already received the old generation.
 *
 * @param {*} value  whatever is stored in `system.dexpenalty` (Number per template.json, but a
 *                   hand-edited or imported document can hold a string, null, or nothing at all)
 * @returns {number|null} the normalised penalty, or `null` when `value` is not a finite number —
 *                        never `0`, because a silent zero is exactly how the unreadable
 *                        `"(0, pero requiere"` cell got through on the export side.
 */
export function normalisedDexPenalty(value) {
	if (value === null || value === undefined || value === "") return null;

	const n = Number(value);
	if (!Number.isFinite(n)) return null;

	// `-Math.abs(0)` is NEGATIVE ZERO, and the test caught it. Harmless where it is stored
	// (`JSON.stringify(-0)` is "0", `String(-0)` is "0") but it is a value that `Object.is` and
	// `assert.strictEqual` both distinguish from 0, so it would sit in the data as a small trap for
	// whoever compares against it next. Returned as a plain 0 instead.
	return n === 0 ? 0 : -Math.abs(n);
}

/**
 * The migration's predicate, and therefore its idempotency guarantee. True only for an `Armor` Item
 * whose stored penalty is a finite number strictly greater than zero.
 *
 * Everything else is left alone on purpose: `-2` and `0` are correct and are not written to, a
 * non-numeric value is reported rather than coerced (coercing it here would turn an unreadable cell
 * into a confident `0`), and a non-`Armor` Item is not this migration's business.
 *
 * @param {{type?: string, system?: {dexpenalty?: *}}} item
 * @returns {boolean}
 */
export function needsDexPenaltyCorrection(item) {
	if (item?.type !== "Armor") return false;

	const n = Number(item?.system?.dexpenalty);

	return Number.isFinite(n) && n > 0;
}

/**
 * Builds the list of corrections for ONE actor, without performing any of them. Separating the plan
 * from the write is what makes the count reportable before anything is touched — this project does
 * not run a migration whose scope it has not measured — and what lets the tests assert "zero writes"
 * as a positive fact rather than as the absence of an observed one.
 *
 * @param {{items?: Iterable<object>, name?: string}} actor
 * @returns {Array<{item: object, from: number, to: number}>}
 */
export function planActorDexPenaltyCorrections(actor) {
	const plan = [];

	for (const item of actor?.items ?? []) {
		if (!needsDexPenaltyCorrection(item)) continue;

		const from = Number(item.system.dexpenalty);
		const to = normalisedDexPenalty(from);

		// `needsDexPenaltyCorrection` already proved `from` is finite and > 0, so `to` is a finite
		// negative number. Belt and braces: never emit a no-op or a null update.
		if (to === null || to === from) continue;

		plan.push({ item, from, to });
	}

	return plan;
}

/**
 * Applies a plan, ISOLATED PER ITEM in the manner `migrations.js` establishes: one Item's failed
 * update (no permission, a mid-flight reload, a locked compendium document) must not stop the rest
 * of the plan, nor the rest of the batch, nor `game.ready()`.
 *
 * Writes the single field only — never `soak`, never `forms`, never `isequipped`. `shieldbonus` in
 * particular is untouched: it is compendium-owned reference data (design.md D5).
 *
 * @param {Array<{item: object, from: number, to: number}>} plan
 * @param {(msg: string, err: unknown) => void} [onError] injected so the tests can observe the
 *        error path without a `console` stub; defaults to `console.error`.
 * @returns {Promise<{corrected: number, failed: number}>}
 */
export async function applyDexPenaltyCorrections(plan, onError) {
	const report = onError ?? ((msg, err) => console.error(msg, err));
	const stats = { corrected: 0, failed: 0 };

	for (const { item, from, to } of plan ?? []) {
		try {
			await item.update({ "system.dexpenalty": to });
			stats.corrected++;
		}
		catch (err) {
			stats.failed++;
			report(`WoD | Armor dexpenalty correction failed for "${item?.name}" (${from} -> ${to}):`, err);
		}
	}

	return stats;
}
