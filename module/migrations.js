/**
 * One-off migrations run on `game.ready()`. Currently: enrich existing PC actors' Ability Items
 * with descriptions from the `wod20-compendium-es` compendium (add-ability-descriptions-from-
 * compendium). New Abilities are enriched as they are named - see ability-enrichment.js and its
 * call sites in create-helpers.js and wod.js - this migration only backfills Abilities that
 * already existed (and were already named) before that enrichment existed.
 *
 * ~84 live PC actors exist in production. Every operation here is read-then-update per Ability
 * Item, guarded by a per-actor flag so it runs at most once per actor unless an admin clears the
 * flag, and wrapped so a single actor's or ability's failure cannot abort the batch or block
 * `game.ready()`.
 */

import { findAbilityCompendiumMatch } from "./scripts/ability-enrichment.js";
import { refreshActorStaleDescriptions } from "./scripts/stale-description-refresh.js";

const FLAG_SCOPE = "worldofdarkness";
const FLAG_KEY = "abilitiesEnriched";

/**
 * Enriches one actor's existing Ability Items that have an empty `system.description`. Never
 * touches `system.value`, `system.max`, `system.type`, `system.label`, or any other field, and
 * never overwrites a description that is already present (whether from a player, an earlier
 * enrichment, or seed-time enrichment). Sets the per-actor flag when done, even if some
 * individual abilities found no compendium match, so the migration does not re-run every reload
 * for actors the compendium simply has nothing to say about.
 * @param {Actor} actor
 * @returns {Promise<{enriched: number, skipped: number, notFound: number}>}
 */
export async function enrichActorAbilities(actor) {
	const stats = { enriched: 0, skipped: 0, notFound: 0 };

	const abilityItems = actor.items.filter(i => i.type === "Ability");

	for (const abilityItem of abilityItems) {
		if (abilityItem.system.description) {
			stats.skipped++;
			continue;
		}

		try {
			const match = await findAbilityCompendiumMatch(actor, abilityItem);
			if (match?.system?.description) {
				await abilityItem.update({ "system.description": match.system.description });
				stats.enriched++;
			} else {
				console.warn(`WoD | Ability "${abilityItem.name}" not found in the wod20-compendium-es compendium for actor "${actor.name}"; left with no description.`);
				stats.notFound++;
			}
		} catch (err) {
			// A single ability's update failing (permission, a mid-flight compendium reload, ...)
			// must not stop the rest of this actor's abilities, nor the rest of the batch.
			console.error(`WoD | Ability enrichment failed for "${abilityItem.name}" on actor "${actor.name}":`, err);
		}
	}

	await actor.setFlag(FLAG_SCOPE, FLAG_KEY, true);
	console.log(`WoD | Enriched abilities for "${actor.name}" (${stats.enriched} enriched, ${stats.notFound} not found in compendium, ${stats.skipped} already had a description).`);

	return stats;
}

/**
 * Runs `enrichActorAbilities` once for every PC actor that has not already been flagged. Safe to
 * call every `game.ready()` - already-enriched actors are skipped in O(1) via the flag, and a
 * missing/absent compendium degrades every actor to "not found" warnings rather than an error.
 * @returns {Promise<void>}
 */
export async function enrichAllActorsAbilities() {
	const pcActors = game.actors.filter(a => a.type === "PC");
	const pending = pcActors.filter(a => !foundry.utils.getProperty(a, `flags.${FLAG_SCOPE}.${FLAG_KEY}`));

	if (!pending.length) {
		console.log(`WoD | Ability enrichment: nothing to do (${pcActors.length} PC actor(s), all already enriched).`);
		return;
	}

	let totalEnriched = 0;
	let errored = 0;

	for (const actor of pending) {
		try {
			const stats = await enrichActorAbilities(actor);
			totalEnriched += stats.enriched;
		} catch (err) {
			// One broken actor (e.g. no update permission for this user) must not stop the batch.
			errored++;
			console.error(`WoD | Ability enrichment failed for actor "${actor.name}":`, err);
		}
	}

	console.log(`WoD | Ability enrichment migration complete: ${pending.length} actor(s) processed, ${totalEnriched} ability description(s) added, ${errored} actor(s) errored.`);
}

// --- Stale Markdown descriptions ------------------------------------------------------------------
//
// A SECOND, independent migration, with its own flag. Kept separate from the ability enrichment
// above rather than folded into it, because the two differ on the one thing that matters: that one
// only ever FILLS AN EMPTY description and so can destroy nothing, while this one REPLACES a
// non-empty one. Sharing a flag would also make either impossible to re-run without the other.
//
// See scripts/stale-description-refresh.js for the defect, how the match is made (exact `_id`, not a
// name), and why "no HTML tags at all, plus a Markdown marker" is a sound test for machine-written
// staleness rather than a player's edit.

const STALE_DESC_FLAG_KEY = "staleDescriptionsRefreshed";

/**
 * Runs the stale-description refresh once for every actor not already flagged.
 *
 * NOT limited to `type === "PC"`, unlike the ability migration: wodchar exports mortals and other
 * actor types through the same path, so they carry the same Markdown.
 * @returns {Promise<void>}
 */
export async function refreshAllActorsStaleDescriptions() {
	const pending = game.actors.filter(
		a => !foundry.utils.getProperty(a, `flags.${FLAG_SCOPE}.${STALE_DESC_FLAG_KEY}`));

	if (!pending.length) {
		console.log(`WoD | Stale-description refresh: nothing to do (${game.actors.size} actor(s), all already processed).`);
		return;
	}

	let totalRefreshed = 0;
	let totalNotFound = 0;
	let errored = 0;

	for (const actor of pending) {
		try {
			const stats = await refreshActorStaleDescriptions(actor);
			totalRefreshed += stats.refreshed;
			totalNotFound += stats.notFound;
			// Flagged even when nothing was refreshed, so a world of already-clean actors does not
			// re-scan every pack on every reload.
			await actor.setFlag(FLAG_SCOPE, STALE_DESC_FLAG_KEY, true);
			if (stats.refreshed || stats.notFound) {
				console.log(`WoD | "${actor.name}": ${stats.refreshed} description(s) refreshed from the compendium, ${stats.notFound} with no compendium document.`);
			}
		} catch (err) {
			// One broken actor (no update permission for this user, say) must not stop the batch.
			errored++;
			console.error(`WoD | Stale-description refresh failed for actor "${actor.name}":`, err);
		}
	}

	console.log(`WoD | Stale-description refresh complete: ${pending.length} actor(s) processed, ${totalRefreshed} description(s) refreshed, ${totalNotFound} unmatched, ${errored} actor(s) errored.`);
}
