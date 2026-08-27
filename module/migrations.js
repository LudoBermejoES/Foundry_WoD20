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

import { findAbilityCompendiumMatch, compendiumProvenanceOf, isEnrichableAbility } from "./scripts/ability-enrichment.js";
import { resyncActorTraits } from "./scripts/stale-description-refresh.js";
import { planActorDexPenaltyCorrections, applyDexPenaltyCorrections } from "./scripts/armor-dexpenalty.js";
import {
	MIGRATION_FLAG_SCOPE,
	MIGRATION_FLAG_KEY,
	ATTEMPT_FLAG_KEY,
	hasCensusToMigrate,
	planCensusMigration,
	snapshotFromRosters,
	snapshotFromItems,
	verifyCensusMigration,
	formatCensusVerification
} from "./scripts/chantry-roster-migration.js";
import { censusItemData } from "./scripts/chantry-census.js";

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

	// `isEnrichableAbility`, so secondary-ability `Trait`s are backfilled too (ability-enrichment.js
	// documents why the two shapes are one question). NOTE THE BLAST RADIUS OF THIS WIDENING IS NEAR
	// ZERO ON THE CURRENT WORLD, deliberately: `enrichAllActorsAbilities` skips any actor already
	// carrying `flags.worldofdarkness.abilitiesEnriched`, and FLAG_KEY is NOT bumped by this change.
	// So widening the filter does not walk the live world's already-flagged actors - it covers new
	// and unflagged actors, while a live secondary picks its description up through
	// `maybeEnrichAbilityOnRename` on its next ordinary edit. Bumping FLAG_KEY would turn a system
	// deploy into a mass write over ~88 production actors and is a separate, owner-level decision.
	const abilityItems = actor.items.filter(isEnrichableAbility);

	for (const abilityItem of abilityItems) {
		if (abilityItem.system.description) {
			stats.skipped++;
			continue;
		}

		try {
			const match = await findAbilityCompendiumMatch(actor, abilityItem);
			if (match?.system?.description) {
				// read-descriptions-from-compendium (ability-enrichment.js Decision 2, "#18,
				// abilities"): also copy the matched document's provenance flags, so this Ability
				// resolves its description LIVE from here on, with this copied text serving only as
				// the offline fallback.
				await abilityItem.update({
					"system.description": match.system.description,
					flags: compendiumProvenanceOf(match)
				});
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

// --- Trait re-sync from the compendium (bonuslist only) --------------------------------------------
//
// read-descriptions-from-compendium RETIRED THE DESCRIPTION HALF of this migration. Every item's
// description now RESOLVES LIVE from the compendium at read time (see
// module/scripts/compendium-description.js) instead of being copied onto the actor, so nothing
// copies `system.description` here any more, `COMPENDIUM_OWNED_FIELDS` in
// scripts/stale-description-refresh.js is down to `["bonuslist"]`, and a compendium CONTENT fix -
// the entire reason V1 through V4 below existed - no longer needs a migration, a version-flag bump,
// or a walk over the world's actors at all. See openspec/changes/read-descriptions-from-compendium.
//
// WHAT'S LEFT, and why it could not go with the rest: the system computes dice pools from
// `item.system.bonuslist` ON THE ACTOR, and `wod20-char`'s exporter hardcodes `bonuslist: []` at ten
// call sites with no catalog field to export instead - the compendium is the ONLY source that has
// it, so it still has to be COPIED, not resolved (stale-description-refresh.js:14-18: "Otto's Arcano
// was adding NO dice to Sigilo"). This keeps the `game.actors` + unlinked-token-actor walk, the
// line-scoped index, and a versioned completion flag - a compendium fix to a trait's BONUSES still
// needs a flag bump and a world walk; only a fix to its TEXT stopped needing one.
//
// A SECOND, independent migration with its own flag, still. Deliberately not folded into the ability
// enrichment above, because the two differ on the one thing that matters: that one only ever FILLS AN
// EMPTY description and can destroy nothing, while this one REPLACES data (now: only `bonuslist`
// data). Sharing a flag would also make either impossible to re-run without the other.
//
// THE FLAG KEY IS VERSIONED, and every earlier key is deliberately abandoned rather than reused -
// reusing one would skip every actor already flagged under it, which is exactly the mistake V1 made.
// History, kept for the record: V1 matched compendium documents by `_id`, which holds for some
// imports and not others, and it re-scanned all ~107 packs for every item of every actor - so it
// flagged 22 of 84 actors as done before the page moved on, having fixed almost nothing. V2 matched
// by name against a GLOBAL index of all ~107 packs with "first pack wins", so changeling-/hunter-
// packs beat mage- ones and 89 live actors had traits overwritten with ANOTHER GAME LINE's text. V3
// re-ran over every actor V2 touched, with a `force` option that existed purely to repair V2's
// damage. V4 added the unlinked-token-actor walk and was versioned on compendium CONTENT changes -
// the description-copying reason for its existence, which is now gone.
//
// V5 (bonuslistResyncedFromCompendiumV1): DESCRIPTION-FREE, `bonuslist`-only. Not
// `traitsResyncedFromCompendiumV5` - the name would lie about what the migration does once
// description is gone - but a fresh key regardless, so that every actor already flagged under V4
// is processed once more under the new, narrower semantics rather than skipped.
//
// V6 (bonuslistResyncedFromCompendiumV2, propagate-health-bonus-traits): the compendium itself
// changed, not the migration's logic - `corpulento` (x4 lines), `skeletal-enhancement`, `kishijoten`
// and `loki` all gained a real `health_buff` bonuslist entry that did not exist when V1 ran. Any
// actor already flagged under V1 was resynced against the OLD, bonus-less compendium and will never
// be looked at again unless the flag key changes - this is the exact scenario the versioned-key
// scheme (see the V1-V4 history above) exists to handle: a compendium CONTENT fix to `bonuslist`
// still needs a flag bump and a world walk, same as it always has.
//
// V7 (bonuslistResyncedFromCompendiumV3): THIS TIME the migration's own MATCHING logic was wrong,
// not the compendium - `buildCompendiumIndex` picked packs by `settings.splat`, and a wodchar
// mortal-VARIANT-of-a-line actor (Raffela Diemer: `splat: "mortal"`, `game: "mage"`) has no
// `mortal-*` packs, so its line-specific traits were silently skipped every run, V1 through V2
// included - a live GM session under V2 flagged her as done while STILL failing to fix her
// Corpulento, which is exactly what a versioned flag cannot self-heal without one more bump. Fixed
// to resolve `settings.game` before `settings.splat`; V3 gives every actor already (wrongly)
// flagged under V1/V2 one more pass under the corrected logic.
//
// V8 (bonuslistResyncedFromCompendiumV4): V3 correctly fixed Raffela's `bonuslist` - live-verified -
// but her rendered Health track still showed the old total, because nothing ever recomputes
// `system.health.<tier>.total` for a "PC" actor after an item UPDATE (see
// `stale-description-refresh.js`'s `resyncActorTraits`, which now recomputes and persists totals
// whenever an actor owns any bonuslist-bearing item at all - not only when THIS run fixed one, since
// V3 already left her with a correct-but-unrecomputed bonuslist and V3's own flag would otherwise
// never let anything look at her again). V4 gives every actor already flagged under V1/V2/V3 one
// more pass so that catch-up recompute actually runs for them.
const TRAIT_RESYNC_FLAG_KEY = "bonuslistResyncedFromCompendiumV4";

/**
 * Re-syncs every actor's `bonuslist` (only - see the header comment above) from the compendium,
 * for every actor not already flagged under `TRAIT_RESYNC_FLAG_KEY`.
 *
 * NOT limited to `type === "PC"`: wodchar exports mortals and other actor types through the same
 * path, so they carry the same missing-`bonuslist` defect.
 *
 * Kept under its original name - `refreshAllActorsStaleDescriptions` - even though it no longer
 * touches descriptions, because renaming it would be a cosmetic-only diff across every caller for
 * no behavioural gain; the header comment and log lines below are what now describe what it does.
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
	console.log(`WoD | Trait re-sync (bonuslist-only, line-scoped, incl. unlinked token actors): ${pending.length} of ${candidates.length} actor(s) to process.`);

	let totalBonusFixed = 0;
	let totalNotFound = 0;
	let errored = 0;

	for (const actor of pending) {
		try {
			const stats = await resyncActorTraits(actor);
			totalBonusFixed += stats.bonusFixed;
			totalNotFound += stats.notFound;
			// Flagged AFTER the work, so an interrupted run leaves the remaining actors pending
			// rather than silently marked done.
			await actor.setFlag(FLAG_SCOPE, TRAIT_RESYNC_FLAG_KEY, true);
			if (stats.bonusFixed || stats.notFound) {
				console.log(`WoD | "${actor.name}": ${stats.bonusFixed} bonuslist(s) restored, ${stats.notFound} unmatched.`);
			}
		} catch (err) {
			// One broken actor (no update permission for this user, say) must not stop the batch.
			errored++;
			console.error(`WoD | Trait re-sync failed for actor "${actor.name}":`, err);
		}
	}

	console.log(`WoD | Trait re-sync complete: ${pending.length} actor(s) processed, ${totalBonusFixed} bonuslist(s) restored, ${totalNotFound} unmatched, ${errored} actor(s) errored.`);
}

// --- Armor `dexpenalty` sign correction (apply-armor-dexterity-penalty) -----------------------------
//
// A THIRD migration, and the FIRST one in this file with NO FLAG. The full rationale, the accepted
// risk and the reason `totals.js` is deliberately NOT clamped all live in
// `module/scripts/armor-dexpenalty.js`, which holds the pure rules; this function is only the walk.
//
// In one line: eleven shipped armor documents carried `dexpenalty` as an unsigned MAGNITUDE, and
// `totals.js:208` does `+=`, so an equipped "Traje de antidisturbios" GRANTS +3 Dexterity and +3
// Initiative today. Fixing the compendium fixes every future drag and no Item already dragged,
// because Foundry copies the document onto the actor.
//
// NO FLAG, on purpose: the predicate (`type == "Armor" && system.dexpenalty > 0`) IS the flag. After
// this change a positive `dexpenalty` cannot exist legitimately, a corrected Item stops matching, and
// so a second pass writes zero documents. That also means this costs a cheap in-memory filter per
// ready and nothing else in the steady state - no pack reads, no `setFlag` write, and no future
// version bump that turns a system deploy into a mass write over ~88 production actors (which is
// exactly what the FLAG_KEY comment above warns about).

/**
 * Corrects every owned `Armor` Item whose `system.dexpenalty` is positive, negating it.
 *
 * NOT limited to `type === "PC"`, and NOT limited to `game.actors`: the unlinked-token walk is the
 * lesson `refreshAllActorsStaleDescriptions` learned the hard way (a token with `actorLink: false`
 * carries its own synthetic actor in the scene's ActorDelta, so a walk over the directory alone fixes
 * a copy nobody opens - Otto Von Grugger's token is exactly that). Armor dragged onto such a token
 * carries the same defect, so it gets the same walk.
 *
 * Error-isolated twice over - per Item inside `applyDexPenaltyCorrections`, and per actor here - so
 * one broken actor or one refused update cannot abort the batch or block `game.ready()`.
 * @returns {Promise<{scanned: number, corrected: number, failed: number}>}
 */
export async function correctPositiveArmorDexPenalties() {
	const candidates = [...game.actors];
	for (const scene of game.scenes ?? []) {
		for (const token of scene.tokens ?? []) {
			if (token.actorLink) continue;          // linked tokens ARE the directory actor
			const synthetic = token.actor;
			if (synthetic && !candidates.includes(synthetic)) candidates.push(synthetic);
		}
	}

	const totals = { scanned: candidates.length, corrected: 0, failed: 0 };

	for (const actor of candidates) {
		try {
			// Only skip when the answer is explicitly "no": a synthetic token actor may not
			// implement `canUserModify` at all, and defaulting to "skip" would silently do nothing.
			if (actor.canUserModify?.(game.user, "update") === false) continue;

			const plan = planActorDexPenaltyCorrections(actor);
			if (!plan.length) continue;

			const stats = await applyDexPenaltyCorrections(plan);
			totals.corrected += stats.corrected;
			totals.failed += stats.failed;

			for (const { item, from, to } of plan) {
				console.log(`WoD | "${actor.name}": armor "${item.name}" dexpenalty ${from} -> ${to}.`);
			}
		}
		catch (err) {
			// One broken actor (no update permission for this user, a malformed item collection, ...)
			// must not stop the rest.
			totals.failed++;
			console.error(`WoD | Armor dexpenalty correction failed for actor "${actor.name}":`, err);
		}
	}

	if (totals.corrected || totals.failed) {
		console.log(`WoD | Armor dexpenalty correction: ${totals.corrected} Item(s) corrected, ${totals.failed} failure(s), over ${totals.scanned} actor(s) incl. unlinked tokens.`);
	}

	return totals;
}

// --- El censo de la Capilla: de `system.traitRosters` a Items (add-chantry-roster-tab) -------------
//
// LA CUARTA migración de este fichero y la SEGUNDA sin bandera, por la misma razón que la de las
// armaduras: el predicado (`type === "Chantry"` con `system.traitRosters` no vacío) ES la bandera,
// porque un mapa con contenido no puede existir legítimamente después de este cambio. Una segunda
// pasada no crea ni un Item.
//
// Las reglas, el plan y la verificación por conteo están en `module/scripts/chantry-roster-migration.js`
// (nada de Foundry dentro, comprobable bajo `node --test`); esto es solo el paseo.
//
// EL ORDEN DE LAS TRES ESCRITURAS ES LOAD-BEARING:
//   1. copiar el mapa a `flags.worldofdarkness.migration.traitRosters`  (reversible sin backup)
//   2. crear los Items
//   3. VERIFICAR POR CONTEO y solo entonces vaciar `system.traitRosters`
// Al revés, un fallo entre 2 y 3 dejaría el mundo sin el dato en ningún portador. Así, el peor caso
// es el dato en los dos, que se ve y se arregla.

/**
 * Convierte el censo de toda Capilla/Constructo con `system.traitRosters` no vacío en Items
 * `wod.types.connection`, uno por entrada.
 *
 * Como la de las armaduras, pasea también los tokens NO enlazados: un token con `actorLink: false`
 * lleva su propio actor sintético en el ActorDelta de la escena, y un paseo por el directorio dejaría
 * intacta una copia que alguien puede abrir.
 *
 * Aislado por actor: una Capilla que falle (sin permiso de escritura, un mapa malformado…) no puede
 * abortar el lote ni bloquear `game.ready()`.
 * @returns {Promise<{scanned: number, migrated: number, created: number, failed: number}>}
 */
export async function migrateChantryRostersToItems() {
	const candidates = [...game.actors];
	for (const scene of game.scenes ?? []) {
		for (const token of scene.tokens ?? []) {
			if (token.actorLink) continue;
			const synthetic = token.actor;
			if (synthetic && !candidates.includes(synthetic)) candidates.push(synthetic);
		}
	}

	const chantries = candidates.filter((actor) => actor?.type === "Chantry");
	const totals = { scanned: chantries.length, migrated: 0, created: 0, failed: 0 };

	for (const actor of chantries) {
		try {
			if (actor.canUserModify?.(game.user, "update") === false) continue;

			const rawRosters = actor.system?.traitRosters;
			if (!hasCensusToMigrate(rawRosters)) continue;

			// LA GUARDA DEL SEGUNDO INTENTO. Sin esto, un fallo de verificacion deja el mapa
			// sin vaciar, el predicado de arriba sigue casando y el arranque siguiente crea
			// OTRA copia de cada entrada. Ocurrio: tres arranques, tres copias. Ver
			// ATTEMPT_FLAG_KEY en chantry-roster-migration.js.
			if (actor.getFlag(MIGRATION_FLAG_SCOPE, ATTEMPT_FLAG_KEY)) {
				console.warn(`WoD | El censo de "${actor.name}" ya se intento migrar y no cuadro; `+
					`no se reintenta. El dato esta en system.traitRosters y en `+
					`flags.${MIGRATION_FLAG_SCOPE}.${MIGRATION_FLAG_KEY}; revisalo a mano.`);
				continue;
			}

			// Se marca ANTES de escribir nada, no despues: si la creacion de Items se queda a
			// medias por un error, el arranque siguiente tampoco debe reintentar a ciegas.
			await actor.setFlag(MIGRATION_FLAG_SCOPE, ATTEMPT_FLAG_KEY, true);

			const before = snapshotFromRosters(rawRosters);
			const plan = planCensusMigration(rawRosters, censusItemData);

			// 1. El original, a la bandera, ANTES de tocar nada más.
			await actor.setFlag(MIGRATION_FLAG_SCOPE, MIGRATION_FLAG_KEY, foundry.utils.deepClone(rawRosters));

			// 2. Los Items.
			await actor.createEmbeddedDocuments("Item", plan);

			// 3. El conteo, leído DE VUELTA del actor — no de `plan`, que es lo que quisimos escribir y
			//    no lo que hay. Leer de vuelta lo escrito es la contramedida que este proyecto se puso
			//    después de dos pérdidas silenciosas que reportaron éxito.
			const after = snapshotFromItems([...actor.items]);
			const result = verifyCensusMigration(before, after);

			console.log(`WoD | Censo de "${actor.name}": ${formatCensusVerification(result)}`);

			if (!result.ok) {
				totals.failed++;
				console.error(`WoD | El censo de "${actor.name}" NO cuadra: se conserva `+
					`system.traitRosters sin vaciar. El dato está en los dos portadores; revísalo a mano.`);
				continue;
			}

			// 4. Vaciar el mapa. Necesario: dos portadores para un dato divergen. La clave sigue
			//    declarada en template.json, así que vaciarla no la borra del esquema.
			await actor.update({ "system.traitRosters": {} });
			// Migrado y verificado: la marca de intento ya no dice nada util y se retira, para
			// que un `flags` limpio signifique «esta Capilla esta bien» y no «no se intento».
			await actor.unsetFlag(MIGRATION_FLAG_SCOPE, ATTEMPT_FLAG_KEY);

			totals.migrated++;
			totals.created += plan.length;
		}
		catch (err) {
			totals.failed++;
			console.error(`WoD | La migración del censo falló para "${actor.name}":`, err);
		}
	}

	if (totals.migrated || totals.failed) {
		console.log(`WoD | Migración del censo de Capillas: ${totals.migrated} actor(es) migrado(s), `+
			`${totals.created} entrada(s) convertida(s) en Items, ${totals.failed} fallo(s), sobre `+
			`${totals.scanned} Capilla(s) incl. tokens no enlazados.`);
	}

	return totals;
}
