/**
 * add-prism-of-focus-foundry — the Rituales calculator (design.md D7/D14, §2.5.2). A pure function
 * layer (this file) plus a thin dialog wrapper (`dialog-prism-ritual.js`), matching the
 * `wod20-combat-multiple-actions` precedent: never auto-drives another roll dialog, never posts a
 * chat card (Non-goal, proposal.md).
 *
 * Worked example this file reproduces exactly (§2.5.2): Michael (Maestro, Alta Magia Ritual 3,
 * Fuerza de Voluntad permanente 6) leads; Paula (Alta Magia Ritual 2, Areté 3) covers Cardinal at 2
 * dice — capped by HER OWN Práctica rating, not her Areté; Susan (no Alta Magia Ritual) contributes a
 * flat +1 success, no roll. Ceiling = 3 × 6 = 18.
 *
 * La Escena worked example (§2.7/Arreglo #14): La Escena 4 contributes `floor(4/2) = 2` to Fuerzas.
 */

/**
 * @param {number} masterPracticeRating - the Maestro's own Práctica rating (the ritual's practice)
 * @param {number} masterPermanentWillpower - A12: permanent Fuerza de Voluntad, not temporary
 * @returns {number}
 */
export function computeRitualCeiling(masterPracticeRating, masterPermanentWillpower) {
	return (parseInt(masterPracticeRating) || 0) * (parseInt(masterPermanentWillpower) || 0);
}

/**
 * @param {object} participant
 * @param {"participant-with-practice"|"participant-without"|"participant-via-la-escena"} participant.role
 * @param {number} [participant.arete] - required for `participant-with-practice`/`-via-la-escena`
 * @param {number} [participant.practiceRating] - required for `participant-with-practice`
 * @param {number} [participant.laEscenaRating] - required for `participant-via-la-escena`
 * @returns {{diceCap: number|null, flatSuccess: number}}
 */
export function computeParticipantContribution(participant) {
	switch (participant?.role) {
		case "participant-with-practice": {
			const arete = parseInt(participant.arete) || 0;
			const practiceRating = parseInt(participant.practiceRating) || 0;
			return { diceCap: Math.min(arete, practiceRating), flatSuccess: 0 };
		}
		case "participant-without":
			// A12 — the +1 lego contribution is automatic, no mundane roll required.
			return { diceCap: null, flatSuccess: 1 };
		case "participant-via-la-escena": {
			// D14/Arreglo #14 — floor(rating/2), capped the same way a genuine Práctica-holder's
			// contribution is capped (their own Areté, when known).
			const laEscenaCap = Math.floor((parseInt(participant.laEscenaRating) || 0) / 2);
			const arete = participant.arete === undefined ? Infinity : parseInt(participant.arete) || 0;
			return { diceCap: Math.min(arete, laEscenaCap), flatSuccess: 0 };
		}
		default:
			return { diceCap: null, flatSuccess: 0 };
	}
}

/**
 * @param {{practiceRating: number, permanentWillpower: number}} master
 * @param {Array<object>} participants - each an object accepted by `computeParticipantContribution`,
 *        plus `{name, sphereCovered}` for the coverage check
 * @param {string[]} [requiredSpheres] - Esferas the ritual's effect needs covered
 * @returns {{
 *   ceiling: number,
 *   participants: Array<{name: string, diceCap: number|null, flatSuccess: number, sphereCovered: string|null}>,
 *   totalFlatSuccesses: number,
 *   missingSpheres: string[]
 * }}
 */
export function computeRitualGroup(master, participants, requiredSpheres = []) {
	const ceiling = computeRitualCeiling(master?.practiceRating, master?.permanentWillpower);

	const resolved = (participants ?? []).map((p) => ({
		name: p.name ?? "",
		sphereCovered: p.sphereCovered ?? null,
		...computeParticipantContribution(p)
	}));

	const totalFlatSuccesses = resolved.reduce((sum, p) => sum + (p.flatSuccess || 0), 0);

	const covered = new Set(resolved.map((p) => p.sphereCovered).filter(Boolean));
	if (master?.sphereCovered) covered.add(master.sphereCovered);
	const missingSpheres = (requiredSpheres ?? []).filter((s) => !covered.has(s));

	return { ceiling, participants: resolved, totalFlatSuccesses, missingSpheres };
}
