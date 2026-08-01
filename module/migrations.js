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
import { resyncActorTraits } from "./scripts/stale-description-refresh.js";

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

// --- Trait re-sync from the compendium ------------------------------------------------------------
//
// A SECOND, independent migration with its own flag. Deliberately not folded into the ability
// enrichment above, because the two differ on the one thing that matters: that one only ever FILLS AN
// EMPTY description and can destroy nothing, while this one REPLACES data. Sharing a flag would also
// make either impossible to re-run without the other.
//
// THE FLAG KEY IS VERSIONED, and v1 is deliberately abandoned rather than reused. v1 matched
// compendium documents by `_id`, which holds for some imports and not others, and it re-scanned all
// ~107 packs for every item of every actor — so it flagged 22 of 84 actors as done before the page
// moved on, having fixed almost nothing. Reusing the key would skip exactly those 22 forever. See
// scripts/stale-description-refresh.js.

// V4. The key is versioned on purpose and bumped whenever the COMPENDIUM's own content changes,
// because an actor's item description is a SNAPSHOT taken when the migration ran, not a live link to
// the compendium. Module 0.7.47 de-duplicated the interleaved dot ladder; every actor migrated under
// 0.7.46 kept the duplicated copy, exactly as the owner worked out ("ya está embebido en el actor").
// A version bump here is therefore part of shipping a compendium content fix, not an afterthought.
//
// V3, and V2 abandoned rather than reused for the second time. V2 matched by name against a GLOBAL
// index of all ~107 packs with "first pack wins", so changeling-/hunter- packs beat mage- ones and 89
// live actors had traits overwritten with ANOTHER GAME LINE's text. V3 must therefore re-run over
// every actor V2 touched, and it runs with `force` because V2's damage is valid HTML that the
// Markdown test would skip forever.
const TRAIT_RESYNC_FLAG_KEY = "traitsResyncedFromCompendiumV4";

/**
 * Re-syncs every actor not already flagged. The compendium is indexed ONCE for the whole batch.
 *
 * NOT limited to `type === "PC"`: wodchar exports mortals and other actor types through the same
 * path, so they carry the same Markdown.
 * @returns {Promise<void>}
 */
export async function refreshAllActorsStaleDescriptions() {
	// UNLINKED TOKEN ACTORS TOO, and this is the failure that made three earlier rounds look like they
	// had done nothing. A token with `actorLink: false` carries its OWN synthetic actor, stored in the
	// scene's ActorDelta rather than in `game.actors` — so a migration over `game.actors` alone fixes
	// the directory copy while the sheet the owner actually opens from the token keeps the old data.
	// Otto Von Grugger's token is unlinked; every check against the directory actor reported success
	// while his token sheet was untouched.
	const candidates = [...game.actors];
	for (const scene of game.scenes ?? []) {
		for (const token of scene.tokens ?? []) {
			if (token.actorLink) continue;          // linked tokens ARE the directory actor
			const synthetic = token.actor;
			if (synthetic && !candidates.includes(synthetic)) candidates.push(synthetic);
		}
	}

	const pending = candidates.filter(
		a => !foundry.utils.getProperty(a, `flags.${FLAG_SCOPE}.${TRAIT_RESYNC_FLAG_KEY}`));

	if (!pending.length) {
		console.log(`WoD | Trait re-sync: nothing to do (${candidates.length} actor(s) incl. unlinked tokens, all already processed).`);
		return;
	}

	// The index is now built PER ACTOR, because it must be scoped to that actor's game line (see
	// buildCompendiumIndex). That is ~10 packs per line rather than 107, and Foundry caches a pack
	// index after the first read, so the cost stays far below V1's per-item pack loads.
	console.log(`WoD | Trait re-sync (V4, line-scoped, incl. unlinked token actors): ${pending.length} of ${candidates.length} actor(s) to process.`);

	let totalResynced = 0;
	let totalBonusFixed = 0;
	let totalNotFound = 0;
	let errored = 0;

	for (const actor of pending) {
		try {
			const stats = await resyncActorTraits(actor, { force: true });
			totalResynced += stats.resynced;
			totalBonusFixed += stats.bonusFixed;
			totalNotFound += stats.notFound;
			// Flagged AFTER the work, so an interrupted run leaves the remaining actors pending
			// rather than silently marked done.
			await actor.setFlag(FLAG_SCOPE, TRAIT_RESYNC_FLAG_KEY, true);
			if (stats.resynced || stats.bonusFixed || stats.notFound) {
				console.log(`WoD | "${actor.name}": ${stats.resynced} description(s) re-synced, ${stats.bonusFixed} bonuslist(s) restored, ${stats.notFound} unmatched.`);
			}
		} catch (err) {
			// One broken actor (no update permission for this user, say) must not stop the batch.
			errored++;
			console.error(`WoD | Trait re-sync failed for actor "${actor.name}":`, err);
		}
	}

	console.log(`WoD | Trait re-sync complete: ${pending.length} actor(s) processed, ${totalResynced} description(s) re-synced, ${totalBonusFixed} bonuslist(s) restored, ${totalNotFound} unmatched, ${errored} actor(s) errored.`);
}
