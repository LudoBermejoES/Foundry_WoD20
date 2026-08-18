/**
 * fix-formula-casting D1/D3 — pure helpers for the M20 Prism of Focus Fórmula-casting dice pool
 * ("en lugar de Areté, el mago tira su Atributo + Habilidad"). Kept dependency-free (no
 * `game`/`CONFIG`/Foundry class globals) so this file, unlike `dialog-aretecasting.js` itself
 * (`extends FormApplication` at module load), can be unit-tested directly with plain `node --test`
 * — see `tests/formula-casting.test.mjs`. `dialog-aretecasting.js`'s `Rote.isFormulaRoll()` and
 * `DialogAreteCasting._formulaPool()` delegate the rating math here; label resolution (which needs
 * `game.i18n`/CONFIG) stays inline in `_formulaPool()`.
 */

// A secondary ability is a `Trait` item (`wod-actor-base.js:1652`'s own grouping), never an
// `Ability` one; these three `system.type` values are its only distinguishing marker.
export const SECONDARY_ABILITY_TYPES = [
    "wod.types.talentsecondability",
    "wod.types.skillsecondability",
    "wod.types.knowledgesecondability"
];

/**
 * True only when BOTH an Attribute and an Ability are declared on the Fórmula. False for every
 * improvised cast and every pre-existing Rote (both fields default to "") — D1's safe default,
 * which keeps rolling Areté exactly as before this change.
 */
export function isFormulaRoll(rote) {
    return !!(rote?.attribute && rote?.ability);
}

/** Reads an actor's Attribute rating the same way `api-handler.js`'s `rollAttribute` does. */
export function resolveAttributeRating(actor, attributeKey) {
    const attribute = actor?.system?.attributes?.[attributeKey];
    return parseInt(attribute?.total ?? attribute?.value ?? 0) || 0;
}

/**
 * Reads an actor's Ability rating for a catalog Ability id. Checks an owned PRIMARY `Ability`
 * item by `system.id` first (covers the fixed 41-entry vocabulary), then an owned
 * SECONDARY-ability `Trait` item by its `wod20-compendium-es` provenance flag (secondary
 * abilities carry no catalog-slug field of their own — design.md D2's note on the split
 * vocabulary). Returns 0, never throws, when neither matches.
 */
export function resolveAbilityRating(actor, abilityKey) {
    const items = actor?.items ?? [];

    const primary = items.find?.((i) => i.type === "Ability" && i.system?.id === abilityKey);

    if (primary) {
        return parseInt(primary.system?.total ?? primary.system?.value ?? 0) || 0;
    }

    const secondary = items.find?.(
        (i) => i.type === "Trait"
            && SECONDARY_ABILITY_TYPES.includes(i.system?.type)
            && i.flags?.["wod20-compendium-es"]?.id === abilityKey
    );

    return secondary ? (parseInt(secondary.system?.value ?? 0) || 0) : 0;
}

/** Combined Atributo+Habilidad pool value (no labels — those need `game.i18n`/CONFIG). */
export function resolveFormulaPoolValue(actor, attributeKey, abilityKey) {
    return resolveAttributeRating(actor, attributeKey) + resolveAbilityRating(actor, abilityKey);
}
