/**
 * fix-casting-sphere-dots — pure helper for the "Esferas disponibles" dot counter in
 * `dialog-aretecasting.js`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `_setupDotCounters()` used to read its data from `this.getData()`. That was correct until
 * `add-prism-of-focus-foundry` made `getData()` **async**: from then on the call returned a
 * `Promise`, `data.object` was `undefined`, the optional chain short-circuited, and NO dot ever
 * received the `active` class. The visible symptom was a loop, because `_onDotSphereChange()` ends
 * in `this.render()`: you clicked a Sphere dot, the handler filled it correctly, the re-render
 * emitted the dots inactive again, and this counter — the thing whose whole job is restoring the
 * selection after a render — silently restored nothing. The caster's selection appeared to erase
 * itself on every click while `this.object.selectedSpheres` (and therefore the difficulty maths)
 * stayed correct underneath.
 *
 * `fix-formula-casting` hit the same wall and sidestepped it for its own branch only, hardcoding
 * `class="... active"` into the Fórmula rows of `dialog-aretecasting.hbs` and recording the cause
 * in a comment there ("a pre-existing, unrelated bug this change does not otherwise touch"). The
 * improvised/legacy branches kept depending on the broken counter, which is why the bug survived a
 * change that was literally titled "Esferas disponibles fix".
 *
 * The fix is not to `await` the Promise but to stop asking for it: `selectedSpheres` lives on
 * `this.object`, so the counter never needed `getData()` at all. Removing the dependency is what
 * keeps the bug from coming back the next time someone makes a lifecycle method async — an `await`
 * would only have papered over it.
 *
 * Kept dependency-free (no `game`/`CONFIG`/Foundry class globals) so it can be unit-tested
 * directly, the same boundary `formula-casting-helpers.js` draws — `dialog-aretecasting.js` itself
 * `extends FormApplication` at module load and cannot be imported by a test.
 */

/**
 * How many dots of `sphereKey` must be shown active, given the dialog's current selection.
 *
 * Tolerant of every shape the caller can legitimately hold: `selectedSpheres` starts life as `[]`
 * (an Array, not an Object — `dialog-aretecasting.js`'s own initialiser) and is keyed by Sphere id
 * afterwards; values arrive as numbers from `_onDotSphereChange()` and as strings from item data.
 *
 * Returns 0 — never NaN, never negative — for anything unusable, so the caller can treat 0 as
 * "leave this row alone".
 *
 * @param {object|Array|null|undefined} selectedSpheres the dialog's `object.selectedSpheres`
 * @param {string} sphereKey a Sphere id (`life`, `mind`, `entropy`, ...)
 * @returns {number} dot count to activate, >= 0
 */
export function activeDotCount(selectedSpheres, sphereKey) {
	if (!selectedSpheres || !sphereKey) {
		return 0;
	}

	const parsed = Number.parseInt(selectedSpheres[sphereKey], 10);

	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 0;
	}

	return parsed;
}
