/**
 * Wraith bio-tab option lists.
 *
 * Exposes:
 * - `getWraithShadowArchetypeList(actor)` -> `listData.ShadowArchetypeList`
 *
 * Returned values are option MAPS (`{ value: label }`), so templates use `localize=false` — the
 * same shape `getVampireClans` / `getVampireSects` return and the shape `lookupListData` reads on
 * the locked branch of `bio_splatfields.hbs`.
 *
 * ## Why the list comes from the installed compendium and not from a table in this file
 *
 * The twelve Shadow Archetypes are Wraith20 proper nouns, and they already ship as documents:
 * `wod20-compendium-es`'s `wraith-shadow-archetypes` pack (12 documents, counted 2026-08-02).
 * Hard-coding them here would mean hard-coding one language's names into a system that ships in
 * seven, and it would put a second copy of the catalog one regen away from disagreeing with the
 * first. `add-wraith-shadow-budget`'s proposal asks for a pick that "resolves against the twelve
 * `shadow-archetype` entities the catalog already holds", which is what this does.
 *
 * ## DEGRADE, NEVER THROW — and never lose what the GM already typed
 *
 * The content packs and this system fork deploy independently and in either order, so this must
 * survive the module simply not being installed. It does, in three steps that each matter:
 *
 *   1. no module / no pack / an unreadable index  -> the list is placeholder + whatever the actor
 *      already holds. The field keeps working as a one-entry pick rather than throwing or emptying.
 *   2. a stored value that matches no document    -> it is ADDED to the list as its own option, so
 *      it stays selected, stays readable and survives the next save. This is the whole reason
 *      promoting `archetype` from `input` to `select` needs no data migration: the free text a
 *      wraith was authored with before this change is still a legal, selected option afterwards.
 *      Exactly the `custom` idiom `getVampireSects` / `getVampireClans` already use.
 *   3. `pack.index` is read SYNCHRONOUSLY. `SelectHelper.SetupItem` is sync and is called per
 *      render, so `getDocuments()` / `getIndex()` (both async) are not available to it. Foundry
 *      populates every pack's index at startup, so this is normally the full twelve; if a pack were
 *      somehow not yet indexed the list degrades to case 1 rather than blocking the render.
 *
 * The stored value is the archetype's NAME, not an entity id, and that is deliberate: the field is
 * a `bio.splatfields` string that the locked sheet prints straight through `lookupListData`, whose
 * documented fallback is "return the raw value". A name therefore reads correctly with the pack
 * present, with the pack absent, and on an actor authored before this change.
 */

const MODULE_ID = "wod20-compendium-es";

/**
 * Candidate packs, in preference order. THE PACK NAME IS A CONTRACT with the content repo, and it
 * fails silently the way `trait-enrichment.js` documents: rename it on either side and the lookup
 * finds no pack, the list degrades to the stored value alone, and nothing is logged as an error.
 * The second name is the same plain fallback that file keeps — a pack shipped under the bare type
 * slug rather than the `<line>-` convention still resolves.
 */
const ARCHETYPE_PACKS = ["wraith-shadow-archetypes", "shadow-archetypes"];

/**
 * The twelve Shadow Archetypes as an option map, plus a placeholder, plus the actor's own stored
 * value when it matches none of them.
 *
 * @param {Actor|object} actor  the actor whose Bio tab is being rendered; may be undefined
 * @returns {Record<string, string>} `{ "": "- select -", "El Abusador": "El Abusador", ... }`
 */
export function getWraithShadowArchetypeList(actor) {
    const list = {
        "": `- ${game.i18n.localize("wod.labels.select")} -`
    };

    let names = [];

    try {
        for (const packName of ARCHETYPE_PACKS) {
            const pack = game.packs?.get(`${MODULE_ID}.${packName}`);
            if (!pack) continue;

            for (const entry of (pack.index ?? [])) {
                if (entry?.name) names.push(entry.name);
            }

            if (names.length > 0) break;
        }
    }
    catch (err) {
        // A pack that cannot be indexed is a missing list, never a broken sheet.
        console.warn(`WoD | Shadow archetype list: could not read the "${MODULE_ID}" archetype pack:`, err);
        names = [];
    }

    for (const name of Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))) {
        list[name] = name;
    }

    // Whatever this actor already holds stays a legal option, even if the catalog never heard of it.
    const stored = (actor?.system?.bio?.splatfields?.archetype?.value ?? "").toString().trim();
    if ((stored !== "") && (list[stored] === undefined)) {
        list[stored] = stored;
    }

    return list;
}
