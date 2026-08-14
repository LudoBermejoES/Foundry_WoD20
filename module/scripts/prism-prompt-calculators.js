/**
 * add-prism-of-focus-foundry — design.md D12's 7 `prompt`-bucket Prácticas: pure functions only,
 * matching this project's own precedent (`prism-ritual-calculator.js`, `wod20-combat-multiple-
 * actions`'s calculator — "pure function first, dialog is a display/input shell"). No Foundry
 * global is touched anywhere in this file; `dialog-prism-prompt.js` is the thin shell around it.
 *
 * Scope note (recorded rather than silently assumed): this system has NO modeled Tass counter
 * anywhere (`hasquintessence`/the `quintessence` Advantage is the only Quintaesencia-shaped
 * resource that exists) — Alquimia/Maleficia's "Quintaesencia/Tass cost" is therefore computed here
 * as a single number the player applies to whichever resource they are actually spending; this file
 * does not (and cannot) distinguish a Tass cost from a Quintaesencia cost, or deduct either
 * automatically.
 */

/** Alquimia's Beneficio: halve the crafting cost, rounded UP. */
export function alchemyCraftingCost(baseCost) {
	return Math.ceil((parseInt(baseCost) || 0) / 2);
}

/** Maleficia's Penalización: double the crafting cost. */
export function maleficiaCraftingCost(baseCost) {
	return (parseInt(baseCost) || 0) * 2;
}

/** Maleficia's Penalización, second half: `+1` to direct-creation effects. */
export function maleficiaDirectCreationModifier(directCreation) {
	return directCreation ? 1 : 0;
}

/** Vigorización's own roll: Resistencia + Meditación, difficulty 6 (fixed, per the book). */
export function invigorationPool(resistenciaRating, meditacionRating) {
	return (parseInt(resistenciaRating) || 0) + (parseInt(meditacionRating) || 0);
}

export const INVIGORATION_DIFFICULTY = 6;

/** 1 Fuerza de Voluntad point gained per success (never negative). */
export function invigorationWillpowerGained(successes) {
	return Math.max(0, parseInt(successes) || 0);
}

/** 2 Quintaesencia spent per success actually converted. */
export function invigorationQuintessenceCost(successes) {
	return invigorationWillpowerGained(successes) * 2;
}

/** Hipertecnología's Beneficio: double the Dispositivos created per permanent Fuerza de Voluntad
 *  point spent. `baseDevices` is whatever the normal (un-doubled) creation formula would yield. */
export function hypertechDevicesCreated(baseDevices) {
	return (parseInt(baseDevices) || 0) * 2;
}

/**
 * Control de Medios' Beneficio (A23): each of the two independent declarations (broadcast,
 * permanent) doubles the required successes — compounding if BOTH are declared (4x), never a
 * single flat doubling regardless of how many are chosen.
 */
export function mediaControlSuccessesRequired(baseSuccesses, broadcast, permanent) {
	let successes = parseInt(baseSuccesses) || 0;
	if (broadcast) successes *= 2;
	if (permanent) successes *= 2;
	return successes;
}

/**
 * Control de Medios' Beneficio (A23): each declaration ALSO adds a flat `+2` to difficulty — the
 * two `+2`s simply ADD (never compound into a doubled `+4`, per A23's own confirmed reading).
 */
export function mediaControlDifficultyModifier(broadcast, permanent) {
	return (broadcast ? 2 : 0) + (permanent ? 2 : 0);
}

/** Psiónica's Penalización: the Areté dice pool is capped at the mage's TEMPORARY Fuerza de
 *  Voluntad, never their permanent rating. */
export function psionicsAretePoolCap(aretePool, temporaryWillpower) {
	return Math.min(parseInt(aretePool) || 0, parseInt(temporaryWillpower) || 0);
}

/**
 * Fe's Beneficio (A26): once per Historia, unless blocked by the creed-violation Penalización.
 * @param {boolean} claimedThisHistoria
 * @param {boolean} creedViolationBlock
 * @returns {boolean}
 */
export function faithClaimAvailable(claimedThisHistoria, creedViolationBlock) {
	if (creedViolationBlock) return false;
	return !claimedThisHistoria;
}
