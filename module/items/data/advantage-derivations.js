/**
 * Shared derivation for an Advantage item's genuinely load-bearing computed
 * fields -- most importantly `roll`, the dice pool that is actually rolled
 * when a player clicks Willpower/Rage/Gnosis/Paradox/Glamour/Blood
 * Pool/a virtue on the sheet.
 *
 * This used to live inline inside WoDItem#_handleAdvantagesCalculations,
 * which is called ONLY from WoDItem#_preUpdate -- i.e. only as a side effect
 * of an explicit item .update() call. Nothing derived `roll` at normal
 * data-preparation time (actor load, sheet render, right after
 * Actor.create()/createEmbeddedDocuments(), which is what
 * Actor.create()-based import and every freshly-created actor go through),
 * so a brand new Advantage item just displayed its raw stored `roll` (0 in
 * every shipped template/exporter) until a GM happened to edit that item's
 * dots once, triggering the one code path that ever recomputed it.
 *
 * The fix is to call this SAME function from two places:
 *   - WoDItem#_handleAdvantagesCalculations (module/items/data/wod-item-base.js),
 *     kept for its existing job: persisting the derived value into the
 *     stored document as part of an in-flight update, so it round-trips
 *     through exports/imports correctly.
 *   - AdvantageDataModel#prepareDerivedData (module/items/datamodel/advantage-item-datamodel.js),
 *     which Foundry calls automatically on every normal data-preparation
 *     pass for a TypeDataModel-backed Item -- this is the new call site that
 *     actually fixes the bug.
 *
 * Extracting the logic here (rather than duplicating it) keeps the two call
 * sites from drifting out of sync with each other.
 *
 * Idempotent: every branch below either recomputes a value purely from its
 * own current inputs, or leaves the field untouched -- running it twice
 * back-to-back (e.g. once at prepare-time, once again from _preUpdate during
 * a save) produces the same result both times.
 *
 * @param {object} systemData - an Advantage item's system data (or anything
 *   shaped like it: `permanent`/`temporary`/`max`/`roll`/`bearing`/`id`/
 *   `group`/`settings`), mutated in place.
 * @param {Actor|null|undefined} actor - the owning actor, if any. Falls back
 *   to sane defaults (traitMax = 5, no willpower-permanent recompute) when
 *   there is none, e.g. an unowned/compendium item.
 * @returns {object} the same `systemData` object, for convenience.
 */
export function computeAdvantageDerivedData(systemData, actor) {
    let advantageRollSetting = true;

    try {
        advantageRollSetting = CONFIG.worldofdarkness.rollSettings;
    }
    catch (e) {
        advantageRollSetting = true;
    }

    let traitMax = 5;

    if (actor) {
        traitMax = actor.system.settings.powers.defaultmaxvalue;
    }

    if ((systemData?.id === "willpower") && (actor)) {
        if ((CONFIG.worldofdarkness.attributeSettings === "5th") && (CONFIG.worldofdarkness.fifthEditionWillpowerSetting === "5th")) {
            if (actor.system.settings.variant !== "spirit") {
                systemData.permanent = parseInt(actor.system.attributes.composure.value) + parseInt(actor.system.attributes.resolve.value);
            }
        }
    }

    if (systemData?.group == "virtue") {
        systemData.max = traitMax;
    }

    if (systemData?.id == "path") {
        let bearing = 0;

        if (systemData.permanent <= 1) {
            bearing = 2;
        }
        else if ((systemData.permanent >= 2) && (systemData.permanent <= 3)) {
            bearing = 1;
        }
        else if ((systemData.permanent >= 4) && (systemData.permanent <= 7)) {
            bearing = 0;
        }
        else if ((systemData.permanent >= 8) && (systemData.permanent <= 9)) {
            bearing = -1;
        }
        else if (systemData.permanent == 10) {
            bearing = -2;
        }

        systemData.bearing = bearing;
    }

    if ((systemData?.settings?.usepermanent) && (systemData?.settings?.usetemporary)) {
        if (systemData.permanent > systemData.max) {
            systemData.permanent = systemData.max;
        }

        if ((systemData.permanent < systemData.temporary) && (!systemData.settings.highertemporary)) {
            systemData.temporary = systemData.permanent;
        }
    }

    // Set roll for advantages that use roll
    if (systemData?.settings?.useroll) {
        systemData.roll = 0;

        if ((systemData.settings.usepermanent) && (systemData.settings.usetemporary)) {
            if (systemData.settings.usebothrolls) {
                systemData.roll = systemData.permanent + systemData.temporary;
            }
            else if (advantageRollSetting) {
                systemData.roll = systemData.permanent;
            }
            else if ((systemData.settings.usepermanent) && (systemData.settings.usetemporary)) {
                systemData.roll = systemData.permanent > systemData.temporary ? systemData.temporary : systemData.permanent;
            }
        }
        else if (systemData.settings.usepermanent) {
            systemData.roll = systemData.permanent;
        }
        else if (systemData.settings.usetemporary) {
            systemData.roll = systemData.temporary;
        }
    }

    return systemData;
}
