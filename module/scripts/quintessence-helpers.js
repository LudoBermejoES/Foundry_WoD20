/**
 * add-quintessence-spending — pure helpers for spending Quintaesencia at casting time: how much a
 * mage can spend THIS turn, what the dialog's selector should offer, and what the actual write
 * should discharge once the roll resolves.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * `dialog-aretecasting.js` does `extends FormApplication` at module load, so nothing in it can be
 * imported by a plain-node test — the same wall `casting-difficulty-helpers.js` and
 * `paradox-helpers.js` already documented and worked around. This module stays free of
 * `game`/`CONFIG`/`Actor`/`Item`/any Foundry class global for exactly that reason; it is the only
 * way this arithmetic can be unit-tested at all. `resolveAvatarRating`/`resolveAvailableQuintessence`
 * below duck-type an "actor-shaped" plain object (`{ type, items, system }`, `items` any iterable of
 * plain item-shaped objects) rather than a real Foundry `Actor` — the same boundary
 * `prism-state-engine.js`'s `computePrismStates(actor, ...)` already draws for the same reason.
 *
 * Kept deliberately self-contained rather than importing `prism-state-engine.js`'s own
 * `provenanceOf` (which would have solved D2's first two cascade steps for free): every pure helper
 * module in this system duplicates its own small tolerant-parsing/provenance logic instead of
 * cross-importing another helper module, so each stays independently readable and testable without
 * chasing an import graph. See that file's own docblock for the same call, made for the same reason.
 *
 * See `openspec/changes/add-quintessence-spending/` for the full spec this implements
 * (`proposal.md`'s "El segundo límite: el Avatar", `design.md`'s D1-D5,
 * `specs/foundry-quintessence/spec.md`).
 */

/* ------------------------------------------------------------------------------------------------
 * Shared tolerant-parsing helpers — mirrors the rule every other pure helper in this system
 * establishes: values may arrive as numbers or as strings (item/actor data), and anything
 * unparsable collapses to a safe default rather than `NaN` or a negative number.
 * ------------------------------------------------------------------------------------------------ */

function toNonNegativeInt(value) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return parsed;
}

function toInt(value, fallback = 0) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/* ------------------------------------------------------------------------------------------------
 * D2 — resolving the Avatar Trasfondo's rating by a cascade of three, because there is no
 * reliable `system.id` on a Background item (see this module's header + design.md D2).
 * ------------------------------------------------------------------------------------------------ */

const AVATAR_ENTITY_ID = "avatar-genio";
const CHAR_MODULE = "wod20-char";
const COMPENDIUM_MODULE = "wod20-compendium-es";

// Tolerant of the dual mage/technocrat name, and of each half alone (a Technocrat's sheet will
// only ever say "Genio"). Trimmed and case-insensitive because a hand-typed name has no other
// guarantee of casing/whitespace.
const AVATAR_NAME_PATTERN = /^(avatar\s*\/\s*genio|avatar|genio)$/i;

function isBackgroundFeature(item) {
	return item?.type === "Feature" && item?.system?.type === "wod.types.background";
}

/**
 * Every Background ("Feature" with `system.type === "wod.types.background"`) item on the actor.
 * Backgrounds are embedded Items, and Item TYPES are global in this system's `template.json` (not
 * per actor-type) — so this reads identically for a `PC` actor and for a legacy actor (`Mage` and
 * every other legacy splat alike); there is no branch to duplicate here, unlike the Quintaesencia
 * pool itself (see `resolveAvailableQuintessence` below).
 *
 * @param {{items?: Iterable<object>}|null|undefined} actor
 * @returns {object[]}
 */
function ownedBackgrounds(actor) {
	return Array.from(actor?.items ?? []).filter(isBackgroundFeature);
}

/**
 * D2's three-step cascade, in order:
 *   1. `flags["wod20-char"].id === "avatar-genio"` — an actor imported from the character creator.
 *   2. `flags["wod20-compendium-es"].id === "avatar-genio"` — an item dragged from the compendium.
 *      Same id value as step 1, different flag scope.
 *   3. By NAME, tolerant of "Avatar / Genio" and each half alone — the only signal a Background
 *      created by hand in Foundry carries at all.
 *
 * Never resolved by `system.id`: Backgrounds carry none (`action-helpers.js`'s own comment on the
 * dialog's Background-roll entry point: "a background Feature carries no system.id", confirmed on a
 * real exported actor whose Backgrounds all show `system.id: null`).
 *
 * On more than one matching item at whichever step first produces a match (a duplicated/mis-tagged
 * Trasfondo — task 3.3), the FIRST one found (in `actor.items`' own iteration order) wins,
 * deterministically. There is no principled way to prefer one duplicate's rating over another's
 * from inside this function; a duplicate Avatar Background is a data-entry error the table should
 * fix on the sheet, not something this cascade should try to arbitrate by picking the higher (or
 * lower) number.
 *
 * @param {{items?: Iterable<object>}|null|undefined} actor
 * @returns {number|null} the Avatar rating, or `null` when the actor has no Avatar Background at
 *   all — D2: the caller SHALL treat `null` as "no cap", never as an Avatar of 0.
 */
export function resolveAvatarRating(actor) {
	const backgrounds = ownedBackgrounds(actor);
	if (backgrounds.length === 0) {
		return null;
	}

	const byCharFlag = backgrounds.find((item) => item?.flags?.[CHAR_MODULE]?.id === AVATAR_ENTITY_ID);
	if (byCharFlag) {
		return toNonNegativeInt(byCharFlag.system?.value);
	}

	const byCompendiumFlag = backgrounds.find((item) => item?.flags?.[COMPENDIUM_MODULE]?.id === AVATAR_ENTITY_ID);
	if (byCompendiumFlag) {
		return toNonNegativeInt(byCompendiumFlag.system?.value);
	}

	const byName = backgrounds.find((item) => AVATAR_NAME_PATTERN.test((item?.name ?? "").trim()));
	if (byName) {
		return toNonNegativeInt(byName.system?.value);
	}

	// No Avatar Background found by any of the three steps: D2 says this is "data missing from the
	// sheet", not "Avatar 0" — the caller must not cap on this result.
	return null;
}

/* ------------------------------------------------------------------------------------------------
 * The two actor branches, once more (proposal.md's Impact section, design.md's Risks): a `PC`
 * actor keeps Quintaesencia as an `Advantage` Item with `system.id === "quintessence"`
 * (`system.temporary` is the spendable pool); a legacy actor (`Mage` and friends) keeps it at
 * `system.quintessence.temporary` directly, a schema-defined field, never nested under
 * `system.advantages` (verified against `template.json`'s own "mage" template block and
 * `mage-actor-sheet.js`'s wheel-click handlers, which read/write exactly that path).
 * ------------------------------------------------------------------------------------------------ */

const QUINTESSENCE_ADVANTAGE_ID = "quintessence";

/**
 * The Quintaesencia currently available to spend, for either actor branch.
 * @param {{type?: string, items?: Iterable<object>, system?: object}|null|undefined} actor
 * @returns {number}
 */
export function resolveAvailableQuintessence(actor) {
	if (actor?.type === "PC") {
		const item = Array.from(actor?.items ?? []).find(
			(i) => i?.type === "Advantage" && i?.system?.id === QUINTESSENCE_ADVANTAGE_ID
		);
		return toNonNegativeInt(item?.system?.temporary);
	}

	return toNonNegativeInt(actor?.system?.quintessence?.temporary);
}

/* ------------------------------------------------------------------------------------------------
 * D1 — the range: min(disponible, Avatar), tolerant of every shape D1/D2 call out.
 * ------------------------------------------------------------------------------------------------ */

/**
 * The maximum a mage can spend THIS turn: `min(available, avatarRating)` (`core:11736`,
 * `core:19159`) — or simply `available` when `avatarRating` is `null`/`undefined` (D2: no Avatar
 * Background on the sheet means no cap, not an Avatar of 0).
 *
 * Tolerant of every input D1 calls out: `available`/`avatarRating` may arrive as a number or a
 * numeric string, and never returns `NaN` or a negative number.
 *
 * @param {object} input
 * @param {number|string} input.available Quintaesencia currently in the pool
 * @param {number|string|null|undefined} input.avatarRating the resolved Avatar rating, or `null`/
 *   `undefined` when the actor has no Avatar Background at all
 * @returns {number} the maximum spendable this turn, never negative
 */
export function spendableQuintessence({ available, avatarRating } = {}) {
	const availablePoints = toNonNegativeInt(available);

	if (avatarRating === null || avatarRating === undefined) {
		return availablePoints;
	}

	return Math.min(availablePoints, toNonNegativeInt(avatarRating));
}

/* ------------------------------------------------------------------------------------------------
 * D4 — the selector's own option list, built from the range above instead of a fixed 0..-5 fan.
 * ------------------------------------------------------------------------------------------------ */

/**
 * The full set of radio values the casting dialog's Quintaesencia selector should offer: always
 * `0` (declining to spend is always on the table) followed by `-1` down to `-N`, where `N` is
 * `spendableQuintessence()`'s result. With `N = 0` this is `[0]` — no spend option at all, matching
 * D4's "con 0 gastables, no hay radios de gasto" (the `0` itself is not a "gasto").
 *
 * @param {object} input same shape as `spendableQuintessence()`
 * @returns {number[]} `[0, -1, ..., -N]`
 */
export function quintessenceSpendOptions({ available, avatarRating } = {}) {
	const max = spendableQuintessence({ available, avatarRating });
	const options = [0];

	for (let i = 1; i <= max; i++) {
		options.push(-i);
	}

	return options;
}

/* ------------------------------------------------------------------------------------------------
 * D3 — the write-time discharge: never negative, re-validated against BOTH limits at the moment of
 * writing (D4's closing paragraph: "el rango se construyó con una foto del estado que puede haber
 * cambiado").
 * ------------------------------------------------------------------------------------------------ */

/**
 * What the actual write should discharge once a casting roll resolves, given what the dialog
 * declared (`requestedSpend`, already signed — e.g. `-3` for a declared 3-point spend) and the
 * actor's state AT THE MOMENT OF WRITING (which may have moved since the dialog opened/rendered —
 * D3's "la reserva bajó por otra vía").
 *
 * Re-validates against `spendableQuintessence()` again here — not just the reserve the D3 scenario
 * spells out, but the Avatar cap too, on the same "the selector was built from a photo" principle
 * D4 states for the reserve; nothing in the corpus suggests the Avatar cap should be enforced only
 * at render time and ignored at write time.
 *
 * @param {object} input
 * @param {number|string} input.requestedSpend the dialog's declared spend, `<= 0` (e.g. `-3`)
 * @param {number|string} input.available Quintaesencia in the pool AT WRITE TIME
 * @param {number|string|null|undefined} [input.avatarRating] the resolved Avatar rating at write
 *   time, or `null`/`undefined` for "no Avatar Background" (no cap, as in `spendableQuintessence`)
 * @returns {{spend: number, remaining: number, requestedMagnitude: number, discrepancy: boolean}}
 *   `spend` is the non-negative amount to actually subtract (never leaves `remaining` negative);
 *   `discrepancy` is true when `spend` is less than what was declared, so the caller can announce it
 *   (D3: "SHALL anunciar la discrepancia" rather than fail the already-resolved roll)
 */
export function resolveQuintessenceDischarge({ requestedSpend, available, avatarRating } = {}) {
	const requestedMagnitude = Math.max(0, -toInt(requestedSpend, 0));
	const cap = spendableQuintessence({ available, avatarRating });
	const spend = Math.min(requestedMagnitude, cap);

	return {
		spend,
		remaining: toNonNegativeInt(available) - spend,
		requestedMagnitude,
		discrepancy: spend < requestedMagnitude
	};
}
