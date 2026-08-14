/**
 * followups design.md D1 — the Corrupted-Práctica resistance roll's follow-up bookkeeping. The
 * roll's pool/difficulty computation already existed (dialog-aretecasting.js, wired to
 * `PrismHelper.ResolveCorruptedResistancePoolRating`/`corruptedResistanceRoll`); this card only
 * covers what came after: a GM reports whether that (still hand-rolled, off-system) roll avoided
 * the Resonance point, and the card bumps the Resonance `Trait` item / flips `corrupted_state`
 * accordingly. It does NOT roll dice itself — the resistance roll stays exactly as manual as it is
 * today, matching the correction in design.md D1 (there is no in-system dice-in-chat mechanism to
 * automate onto; this is the first interactive chat card in `Foundry_WoD20` itself, modeled on
 * `wod20-combat-foundryvtt`'s own card pattern rather than reusing one, since no such pattern
 * existed here before).
 *
 * Card state lives entirely in `flags.worldofdarkness.prismCorruptedResistance` on the
 * `ChatMessage` (just enough to know whether THIS card has already been reported on, so a click
 * can't double-apply); everything else (Resonance value, corrupted_state, the rebuilt base
 * Práctica's rating) is read LIVE from the actor on every render, so a stale card and current actor
 * state can never disagree.
 */
import { findCorruptedResonanceItem, corruptedResonanceGain, corruptedStateFromResonance, corruptedReversalAvailable } from "./prism-corrupted-helpers.js";
import PrismHelper from "./prism-helpers.js";

const FLAG_SCOPE = "worldofdarkness";
const FLAG_KEY = "prismCorruptedResistance";
const TEMPLATE = "systems/worldofdarkness/templates/dialogs/prism-corrupted-resistance-card.hbs";

/**
 * @param {Actor} actor
 * @param {Item} corruptedItem - the owned item where `kind === "corrupted"`
 * @param {string} corruptedPracticeId - `PrismHelper`/provenance id, e.g. "feralism"
 * @param {number} pool
 * @param {number} difficulty
 */
export async function createCorruptedResistanceCard(actor, corruptedItem, corruptedPracticeId, pool, difficulty) {
	const data = {
		actorId: actor.id,
		corruptedItemId: corruptedItem.id,
		corruptedPracticeId,
		practiceName: corruptedItem.name,
		pool,
		difficulty,
		reported: false,
		avoided: null
	};
	const content = await renderCardContent(data);
	const message = await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		content,
		flags: { [FLAG_SCOPE]: { [FLAG_KEY]: data } }
	});
	return new PrismCorruptedCard(message);
}

/** Live-derived (never cached) state this card needs beyond what's in `data`. */
function liveState(data) {
	const actor = game.actors?.get(data.actorId) ?? null;
	const corruptedItem = actor?.items?.get(data.corruptedItemId) ?? null;
	const resonanceItem = actor ? findCorruptedResonanceItem(actor, data.corruptedPracticeId) : null;
	const resonanceValue = parseInt(resonanceItem?.system?.value ?? 0) || 0;
	const baseId = corruptedItem ? PrismHelper.GetPracticeBaseId(corruptedItem) : "";
	const baseItem = actor && baseId ? PrismHelper.FindOwnedPracticeItem(actor, baseId) : null;
	const isCorrupted = corruptedItem?.system?.corrupted_state === "corrupted";
	const reversalAvailable = !!(
		isCorrupted && baseItem && corruptedReversalAvailable(parseInt(baseItem.system?.value ?? 0) || 0, resonanceValue)
	);
	return { actor, corruptedItem, resonanceItem, resonanceValue, isCorrupted, reversalAvailable };
}

async function renderCardContent(data) {
	const { resonanceValue, isCorrupted, reversalAvailable } = liveState(data);
	// Formatted in JS (matching this codebase's own convention — every other prism-dialog chat
	// message in dialog-aretecasting.js resolves its format string via game.i18n.format the same
	// way) rather than relying on Handlebars localize-helper hash params, which nothing else in
	// this system's templates uses.
	const poolText = game.i18n.format("wod.prism.dialog.corruptedresistancepool", { pool: data.pool, difficulty: data.difficulty });
	const failedResultText = game.i18n.format("wod.prism.dialog.corruptedfailedresult", { resonance: resonanceValue });
	return foundry.applications.handlebars.renderTemplate(TEMPLATE, { ...data, resonanceValue, isCorrupted, reversalAvailable, poolText, failedResultText });
}

export class PrismCorruptedCard {
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
	 * @param {"avoided"|"failed"|"reverse"} action
	 */
	async handleAction(action) {
		const data = this.data;
		const { actor, corruptedItem, resonanceItem, resonanceValue } = liveState(data);
		if (!actor || !corruptedItem) {
			ui.notifications.warn(game.i18n.localize("wod.prism.dialog.corruptedactorgone"));
			return;
		}

		if (action === "avoided" || action === "failed") {
			if (data.reported) return; // already applied for this card — idempotent
			const avoided = action === "avoided";
			const gain = corruptedResonanceGain(avoided);
			const newValue = resonanceValue + gain;

			if (gain > 0) {
				if (resonanceItem) {
					await resonanceItem.update({ "system.value": newValue });
				} else {
					await actor.createEmbeddedDocuments("Item", [{
						name: game.i18n.format("wod.prism.dialog.corruptedresonancename", { practice: data.practiceName }),
						type: "Trait",
						system: { label: data.practiceName, type: "wod.types.resonance", value: newValue },
						flags: { "wod20-compendium-es": { id: `${data.corruptedPracticeId}-resonance`, line: "mage", source_type: "resonance" } }
					}]);
				}
			}

			const practiceRating = parseInt(corruptedItem?.system?.value ?? 0) || 0;
			const newState = corruptedStateFromResonance(newValue, practiceRating);
			if (newState !== corruptedItem.system?.corrupted_state) {
				await corruptedItem.update({ "system.corrupted_state": newState });
			}

			await this.save({ reported: true, avoided });
			return;
		}

		if (action === "reverse") {
			if (corruptedItem.system?.corrupted_state !== "corrupted") return; // stale button, no-op
			const baseId = PrismHelper.GetPracticeBaseId(corruptedItem);
			const baseItem = baseId ? PrismHelper.FindOwnedPracticeItem(actor, baseId) : null;
			if (!baseItem || !corruptedReversalAvailable(parseInt(baseItem.system?.value ?? 0) || 0, resonanceValue)) return;
			await corruptedItem.update({ "system.corrupted_state": "clean" });
			await this.save({});
		}
	}
}

export { FLAG_SCOPE, FLAG_KEY };
