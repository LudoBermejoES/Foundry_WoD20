/**
 * add-paradox-system tasks 3.1-3.7 — the Paradoja chat card: shows the full breakdown of a
 * casting's Paradoja gain (never just the total) and offers two actions, "aplicar" (any owner/GM)
 * and "contragolpe" (Narrador only). Architecture copied from `prism-corrupted-card.js` + the
 * `renderChatMessageHTML` hook pattern it established in `hooks.js` — the only precedent for an
 * interactive chat card that already existed in this repo before this change.
 *
 * STATE
 * -----
 * The card's OWN bookkeeping (has "aplicar" been clicked, has the contragolpe been rolled, has
 * Silencio been confirmed) lives in `flags.worldofdarkness.paradoxGain` on the `ChatMessage` — that
 * flag is ChatMessage-scoped scratch state, not character state, so it stays a flag. The
 * character's actual Paradoja/Defecto/Silencio values are always read LIVE off the actor in
 * `renderCardContent()`/`handleAction()`, never cached, so a stale card can never disagree with the
 * sheet — and, since §5.4.3, they are schema fields on the actor (`system.paradox`,
 * `system.paradoxDefect`, `system.paradoxSilence`), never actor flags: character state that must
 * show up in a clean export and be visible to a validator does not belong in `flags`.
 *
 * WHY THE BACKLASH BUTTON IS NEVER BAKED OUT OF THE HTML
 * --------------------------------------------------------
 * `ChatMessage#content` is ONE string, replicated verbatim to every connected client — it is not
 * re-rendered per-viewer. Gating the Narrador-only button by omitting it from the template at
 * SAVE time (e.g. an `{{#if isGM}}` fed by the saving client's own `game.user.isGM`) would bake in
 * whichever client happened to trigger that save; every other client would see the same
 * (possibly wrong) answer. Every control that must be Narrador-only is therefore always rendered,
 * marked with the `paradox-gm-only` class, and removed from the DOM per-client inside the
 * `renderChatMessageHTML` hook (`module/hooks.js`), which runs separately on every client using
 * THAT client's own `game.user.isGM`. `handleAction()` re-checks `game.user.isGM` anyway, as
 * defence in depth against a stale/leftover DOM node.
 *
 * WRITE PATH (D2) — reuses the manual paradox-wheel's own two branches, never a third:
 *   PC actors:     the owned `Advantage` item whose `system.id === "paradox"`,
 *                  `item.update({"system.temporary": ...})` (`action-helpers.js` OnParadoxWheelClick).
 *   legacy actors: `actor.update({"system.paradox.temporary": ...})` (`mage-actor-sheet.js`
 *                  `_onParadoxChange`).
 * Paradoja PERMANENTE is never written by the "aplicar" button — only `computeBacklash()`'s own
 * optional rows (16-20/21+) ever propose it, and even then this module does not auto-write it: M8
 * presents it as one of several options for the Narrador to enact by hand, exactly like the
 * Defecto/espíritu/destierro options on those same rows.
 *
 * SILENCIO / DEFECTO WRITE PATH (§5.4.3) — unlike the Paradoja counter above, there is no Item
 * involved on either actor shape: both `pc-actor-datamodel.js` (PC) and `template.json`'s `mage`
 * template (legacy `Mage`) declare `paradoxSilence`/`paradoxDefect` as plain schema fields on
 * `system`, so a SINGLE `actor.update({"system.paradoxDefect.degree": ...})` /
 * `actor.update({"system.paradoxSilence.level": ..., "system.paradoxSilence.type": ...})` covers
 * both actor types — see `writeParadoxDefect()`/`writeParadoxSilence()` below. Neither field is
 * ever written through `actor.setFlag()`.
 */
import {
	computeParadoxGain,
	computeBacklash,
	backlashThresholds,
	silenceRequiresConfirmation
} from "./paradox-helpers.js";

const FLAG_SCOPE = "worldofdarkness";
const FLAG_KEY = "paradoxGain";
const TEMPLATE = "systems/worldofdarkness/templates/dialogs/paradox-card.hbs";

const BURN_TYPE_KEY = Object.freeze({
	bashing: "wod.paradox.card.burntypebashing",
	lethal: "wod.paradox.card.burntypelethal",
	aggravated: "wod.paradox.card.burntypeaggravated"
});

const DEFECT_DEGREE_KEY = Object.freeze({
	none: "wod.paradox.degrees.none",
	trivial: "wod.paradox.degrees.trivial",
	minor: "wod.paradox.degrees.minor",
	significant: "wod.paradox.degrees.significant",
	severe: "wod.paradox.degrees.severe",
	drastic: "wod.paradox.degrees.drastic"
});

const OPTION_KEY = Object.freeze({
	defect: "wod.paradox.card.optiondefect",
	spirit: "wod.paradox.card.optionspirit",
	quiet: "wod.paradox.card.optionquiet",
	banishment: "wod.paradox.card.optionbanishment",
	permanentParadoxPlusOne: "wod.paradox.card.optionpermanentplusone",
	permanentParadoxPlusTwo: "wod.paradox.card.optionpermanentplustwo"
});

const SILENCE_TYPES = Object.freeze(["negation", "madness", "morbidity"]);

function toInt(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** The Advantage item on a PC actor that backs the manual Paradoja wheel — `null` on a legacy actor. */
function findParadoxItem(actor) {
	if (!actor || actor.type !== "PC") return null;
	return actor.items?.find((item) => item.type === "Advantage" && item.system?.id === "paradox") ?? null;
}

/** Live-read of the actor's CURRENT Paradoja, resolving the same PC/legacy split every write uses. */
function currentParadox(actor) {
	const item = findParadoxItem(actor);
	if (item) {
		return {
			temporary: toInt(item.system?.temporary ?? 0),
			permanent: toInt(item.system?.permanent ?? 0),
			item
		};
	}
	return {
		temporary: toInt(actor?.system?.paradox?.temporary ?? 0),
		permanent: toInt(actor?.system?.paradox?.permanent ?? 0),
		item: null
	};
}

/** D2 — the SAME write path the manual wheel uses, never a third one. */
async function writeParadoxTemporary(actor, newTemporary) {
	const { item } = currentParadox(actor);
	if (item) {
		await item.update({ "system.temporary": newTemporary });
	} else {
		await actor.update({ "system.paradox.temporary": newTemporary });
	}
}

/**
 * add-paradox-system §5.4.3 — Silencio and Defecto de Paradoja now live on `system.paradoxSilence`
 * / `system.paradoxDefect`, a schema field on BOTH actor shapes (`pc-actor-datamodel.js`'s
 * `paradoxSilence`/`paradoxDefect` SchemaFields for `PC`, `template.json`'s `mage` template for
 * legacy `Mage` actors) — unlike the Paradoja counter above, there is no Item involved on either
 * side, so a SINGLE `actor.update()` path covers both actor types; no PC/legacy branch needed.
 */
function currentDefectDegree(actor) {
	return actor?.system?.paradoxDefect?.degree || "none";
}

async function writeParadoxDefect(actor, degree) {
	await actor.update({ "system.paradoxDefect.degree": degree });
}

async function writeParadoxSilence(actor, level, type) {
	await actor.update({ "system.paradoxSilence.level": level, "system.paradoxSilence.type": type });
}

/**
 * @param {Actor} actor the caster who generated this Paradoja
 * @param {object} input passed straight through to `computeParadoxGain()` — see its own jsdoc
 * @returns {Promise<ParadoxCard|null>} `null` when the gain is 0 — no card is posted for a
 *   coincidental success or any other zero-gain result (spec scenario: "Un lanzamiento que no
 *   genera Paradoja").
 */
export async function createParadoxCard(actor, input) {
	const gain = computeParadoxGain(input);
	if (!gain || gain.total <= 0) return null;

	const data = {
		actorId: actor.id,
		vulgar: !!input.vulgar,
		witnesses: !!input.witnesses,
		highestSphere: toInt(input.highestSphere),
		rollResult: input.rollResult,
		ritualRollNumber: toInt(input.ritualRollNumber ?? 1),
		// add-paradox-system task 2.4 — who forced the vulgar/coincidental call for PARADOJA
		// purposes: `null` when it was simply the caster's own spelltype choice, `"practice"` when
		// either `prismForcesCoincidental`/`prismForcesParadojaVulgar` (D12) or
		// `PrismHelper.EvaluateVulgarity()` (D5/D6, Sanctum/anatema/Zonas) overrode it.
		vulgarForcedBy: input.vulgarForcedBy || null,
		gain,
		applied: false,
		backlash: null
	};

	const content = await renderCardContent(data);
	const message = await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		content,
		flags: { [FLAG_SCOPE]: { [FLAG_KEY]: data } }
	});
	return new ParadoxCard(message);
}

function localizeOptions(optionsList) {
	return (optionsList || []).map((key) => ({
		key,
		label: OPTION_KEY[key] ? game.i18n.localize(OPTION_KEY[key]) : key
	}));
}

async function renderCardContent(data) {
	const actor = game.actors?.get(data.actorId) ?? null;
	const reserve = actor ? currentParadox(actor) : { temporary: 0, permanent: 0 };
	const currentReserve = reserve.temporary + reserve.permanent;
	const thresholds = backlashThresholds({ gain: data.gain?.total ?? 0, reserve: currentReserve });

	const rollResultKey = {
		success: "wod.paradox.card.rollresultsuccess",
		fail: "wod.paradox.card.rollresultfail",
		botch: "wod.paradox.card.rollresultbotch"
	}[data.rollResult];

	const backlash = data.backlash;
	let backlashView = null;
	if (backlash) {
		backlashView = {
			...backlash,
			burnTypeLabel: backlash.burnDice ? game.i18n.localize(BURN_TYPE_KEY[backlash.burnDice.type]) : "",
			defectDegreeLabel: game.i18n.localize(DEFECT_DEGREE_KEY[backlash.defect?.degree ?? "none"]),
			optionsDisplay: localizeOptions(backlash.options),
			silenceLevel: backlash.potentialSilenceLevel,
			// Formatted in JS via `game.i18n.format`, matching `prism-corrupted-card.js`'s own
			// convention — this system's templates never rely on `{{localize}}`'s hash-param
			// substitution, so this stays consistent rather than introducing a second pattern.
			silenceLevelText: backlash.potentialSilenceLevel
				? game.i18n.format("wod.paradox.card.silencelevel", { level: backlash.potentialSilenceLevel })
				: "",
			silenceAppliedText: backlash.silenceApplied
				? game.i18n.format("wod.paradox.card.silenceapplied", { level: backlash.potentialSilenceLevel })
				: "",
			silenceRequiresConfirmation: silenceRequiresConfirmation(backlash.potentialSilenceLevel),
			silenceApplied: !!backlash.silenceApplied,
			silenceType: backlash.silenceType || "negation"
		};
	}

	return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
		...data,
		actorName: actor?.name ?? "?",
		rollResultLabel: rollResultKey ? game.i18n.localize(rollResultKey) : data.rollResult,
		vulgarLabel: game.i18n.localize(data.vulgar ? "wod.paradox.card.vulgar" : "wod.paradox.card.coincidental"),
		witnessesLabel: game.i18n.localize(data.witnesses ? "wod.paradox.card.witnessesyes" : "wod.paradox.card.witnessesno"),
		thresholds,
		currentReserve,
		backlash: backlashView,
		silenceTypeOptions: SILENCE_TYPES.map((value) => ({
			value,
			label: game.i18n.localize(`wod.paradox.card.silence${value}`)
		}))
	});
}

export class ParadoxCard {
	/** @param {ChatMessage} message */
	constructor(message) {
		this.message = message;
	}

	get data() {
		return this.message.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {};
	}

	/** Re-render from a patched data blob and push it to every client via the message update. */
	async save(patch) {
		const next = foundry.utils.mergeObject(foundry.utils.deepClone(this.data), patch, { inplace: false });
		const content = await renderCardContent(next);
		await this.message.update({ content, flags: { [FLAG_SCOPE]: { [FLAG_KEY]: next } } });
	}

	/**
	 * @param {"apply"|"backlash"|"backlash-silence"} action
	 * @param {{confirmed?: boolean, type?: string}} [extra] only read for "backlash-silence"
	 */
	async handleAction(action, extra = {}) {
		const data = this.data;
		const actor = game.actors?.get(data.actorId) ?? null;
		if (!actor) {
			ui.notifications?.warn(game.i18n.localize("wod.paradox.card.actorgone"));
			return;
		}

		if (action === "apply") {
			if (data.applied) return; // idempotent — a second click never cobra twice
			const reserve = currentParadox(actor);
			await writeParadoxTemporary(actor, reserve.temporary + toInt(data.gain?.total));
			await this.save({ applied: true });
			return;
		}

		if (action === "backlash") {
			// Defence in depth: the button is removed from the DOM for non-GM viewers in the
			// render hook, but a stale/leftover node must not be able to act.
			if (!game.user?.isGM) return;
			if (data.backlash) return; // idempotent — one contragolpe roll per card
			const reserve = currentParadox(actor);
			const existingDefectDegree = currentDefectDegree(actor);
			const result = computeBacklash({
				temporaryParadox: reserve.temporary,
				permanentParadox: reserve.permanent,
				existingDefectDegree
			});

			// Phase 1 (D5) is fully deterministic once the dice are rolled: the discharge amount
			// never depends on which optional M8 side-effect the Narrador later chooses, so it is
			// safe to write immediately, including the botch/no-effect edge cases.
			await writeParadoxTemporary(actor, result.remainingTemporary);

			// Rows 1-10 apply their Defecto UNCONDITIONALLY (the corpus joins burn+Defecto with
			// ";", not "or"); rows 11+ are only CANDIDATES among a list the Narrador chooses from
			// (M8) and must never be auto-written.
			if (!result.defect.optional && result.defect.degree && result.defect.degree !== "none") {
				await writeParadoxDefect(actor, result.defect.degree);
			}

			await this.save({ backlash: { ...result, silenceApplied: false, silenceType: null } });
			return;
		}

		if (action === "backlash-silence") {
			if (!game.user?.isGM) return;
			if (!data.backlash || data.backlash.silenceApplied) return; // idempotent
			const level = toInt(data.backlash.potentialSilenceLevel);
			if (level <= 0) return;
			// D6/M6 — level 6 retires the character as an NPC Marauder, irreversibly: a single
			// click must never be able to do that. Every OTHER level needs no such gate.
			if (silenceRequiresConfirmation(level) && !extra.confirmed) return;
			const type = SILENCE_TYPES.includes(extra.type) ? extra.type : "negation";
			await writeParadoxSilence(actor, level, type);
			await this.save({ backlash: { ...data.backlash, silenceApplied: true, silenceType: type } });
		}
	}
}

export { FLAG_SCOPE, FLAG_KEY };
