/**
 * The `chantry-descriptor` catalogue — add-book-of-chantries-traits, design.md D6/D16.
 *
 * ============================================================================================
 * WHY THIS IS DATA BAKED INTO THE SYSTEM, NOT A COMPENDIUM LOOKUP
 * ============================================================================================
 * Every other reference id this sheet resolves against a compendium document (Wonders, Rotes, the
 * `chantry-trait` Items themselves) does so because `webgen/foundry_type_map.json` exports that
 * entity TYPE into a `wod20-compendium-es` pack. `chantry-descriptor` is deliberately NOT in that
 * map (verified 2026-09-08, `grep -n "chantry-descriptor" webgen/foundry_type_map.json` — no
 * match): it is a coarse narrative catalogue, never rolled against, so there is no
 * compendium document this sheet could `game.packs.get(...).getDocuments()` to resolve an id like
 * `"leadership-wise"` into "Liderazgo Sabio". Adding one would mean touching `webgen/` (out of this
 * task's scope, a `wod20-char`/coordinator decision) and a `wod20-compendium-es` regeneration +
 * deploy — a second submodule's release, not this one's.
 *
 * So this Actor-type SYSTEM carries its own copy of the 69 rows the catalogue held at the time of
 * writing (`webgen/data/entities/mage/mage-chantry-descriptors.json`, 2026-09-08,
 * complete-chantry-descriptor-catalogue), the same way
 * `chantry-effects.js` carries its own copy of `BOOK_OF_CHANTRIES_LEVEL_COSTS`/`REALM_*_LEVELS`
 * rather than reading `wod20-char`'s TypeScript module (design.md D11's `realmLevelPoints` doc says
 * the same thing about those tables). ONLY the id -> category MAPPING lives here; every localized
 * STRING (name, category label) lives in `lang/*.json` under `wod.chantry.descriptors.*`, matching
 * this system's own convention that content strings belong in the language files, not in JS.
 *
 * ============================================================================================
 * KNOWN GAP, RECORDED RATHER THAN HIDDEN
 * ============================================================================================
 * If the wodchar catalogue grows past these 69 rows, an id a Chantry carries may be ABSENT from
 * `CHANTRY_DESCRIPTOR_IDS`
 * below. `descriptorFallbackLabel()` exists for exactly that case: it degrades to a readable label
 * derived from the id itself (kebab-case -> Title Case) rather than rendering blank or throwing.
 * Re-syncing this list after a catalogue change is a manual step today — there is no build tooling
 * shared between this system and `webgen/` (see this system's own README: no build step at all).
 */

/**
 * The 13 categories `webgen/taxonomy.json`'s `chantry-descriptor.mechanical_fields` declares
 * (design.md D6, extended by complete-chantry-descriptor-catalogue D2's `guardian-nature`/
 * `guardian-loyalty`), in the order the sheet's category filter/optgroups list them. Localized
 * labels live in `lang/*.json` under `wod.chantry.descriptors.categories.<key>`.
 * @type {ReadonlyArray<string>}
 */
export const CHANTRY_DESCRIPTOR_CATEGORIES = Object.freeze([
	"atmosphere",
	"phenomenon",
	"location",
	"land-status",
	"thinning",
	"internal-politics",
	"leadership",
	"staff-loyalty",
	"staff-tier",
	"communications",
	"building-condition",
	"guardian-nature",
	"guardian-loyalty"
]);

/**
 * Every `chantry-descriptor` id this system knows a category for, keyed to that category.
 * @type {Readonly<Record<string, string>>}
 */
export const CHANTRY_DESCRIPTOR_CATEGORY_BY_ID = Object.freeze({
	"atmosphere-alien": "atmosphere",
	"atmosphere-dark": "atmosphere",
	"atmosphere-peaceful": "atmosphere",
	"atmosphere-celestial": "atmosphere",
	"phenomenon-curse-severe": "phenomenon",
	"phenomenon-curse-mild": "phenomenon",
	"phenomenon-curse-secret-dark": "phenomenon",
	"phenomenon-haunted": "phenomenon",
	"phenomenon-psychic-emanations-powerful": "phenomenon",
	"phenomenon-psychic-emanations-strong": "phenomenon",
	"phenomenon-psychic-emanations-normal": "phenomenon",
	"phenomenon-psychic-emanations-none": "phenomenon",
	"phenomenon-magical-manifestations-subtle": "phenomenon",
	"phenomenon-magical-manifestations-notable": "phenomenon",
	"phenomenon-magical-manifestations-blatant": "phenomenon",
	"phenomenon-continuum-temporal-shifts": "phenomenon",
	"phenomenon-energy-fluctuations-subtle": "phenomenon",
	"phenomenon-energy-fluctuations-extreme": "phenomenon",
	"location-city": "location",
	"location-hard-to-reach": "location",
	"location-town": "location",
	"location-sparsely-populated": "location",
	"location-isolated": "location",
	"land-status-private-property": "land-status",
	"land-status-large-private-property": "land-status",
	"land-status-rented-5y": "land-status",
	"land-status-rented-15y": "land-status",
	"land-status-rented-30y": "land-status",
	"land-status-well-documented": "land-status",
	"land-status-frequently-raided": "land-status",
	"thinning-strong": "thinning",
	"thinning-typical": "thinning",
	"thinning-weak": "thinning",
	"thinning-none": "thinning",
	"internal-politics-intriguing": "internal-politics",
	"internal-politics-strict-hierarchy": "internal-politics",
	"internal-politics-conflicting-loyalties": "internal-politics",
	"internal-politics-disorganized": "internal-politics",
	"internal-politics-rogue-cabals": "internal-politics",
	"internal-politics-very-organized": "internal-politics",
	"internal-politics-harmonious": "internal-politics",
	"leadership-evil": "leadership",
	"leadership-foolish": "leadership",
	"leadership-dictatorial": "leadership",
	"leadership-wise": "leadership",
	"leadership-benevolent": "leadership",
	"staff-loyalty-spies": "staff-loyalty",
	"staff-loyalty-disloyal": "staff-loyalty",
	"staff-loyalty-loyal": "staff-loyalty",
	"staff-loyalty-committed": "staff-loyalty",
	"staff-loyalty-fanatic": "staff-loyalty",
	"staff-tier-none": "staff-tier",
	"staff-tier-few": "staff-tier",
	"staff-tier-functional": "staff-tier",
	"staff-tier-many": "staff-tier",
	"staff-tier-innumerable": "staff-tier",
	"communications-modern": "communications",
	"communications-trans-umbral": "communications",
	"communications-trans-horizon": "communications",
	"building-condition-ruins": "building-condition",
	"building-condition-high-tech": "building-condition",
	"guardian-nature-mundane": "guardian-nature",
	"guardian-nature-aware": "guardian-nature",
	"guardian-nature-supernatural": "guardian-nature",
	"guardian-loyalty-fanatic": "guardian-loyalty",
	"guardian-loyalty-loyal": "guardian-loyalty",
	"guardian-loyalty-reluctant": "guardian-loyalty",
	"guardian-loyalty-hostile": "guardian-loyalty",
	"guardian-loyalty-living-entity": "guardian-loyalty"
});

/** Every known id, in the SAME order `CHANTRY_DESCRIPTOR_CATEGORY_BY_ID` declares them (grouped by
 * category) — what the "add" picker iterates. @type {ReadonlyArray<string>} */
export const CHANTRY_DESCRIPTOR_IDS = Object.freeze(Object.keys(CHANTRY_DESCRIPTOR_CATEGORY_BY_ID));

/**
 * `id` -> the book's own `mechanics.flavor_point_value`, a manual copy of
 * `webgen/data/entities/mage/mage-chantry-descriptors.json` (same 69 rows, same sync discipline as
 * `CHANTRY_DESCRIPTOR_CATEGORY_BY_ID` above — re-sync both together on a catalogue change).
 * `reprice-chantry-descriptors` (2026-09-08) reverts the earlier "descriptors are zero-cost" design
 * decision: the book prices 65 of these 69 rows (four sit at 0), and the sheet's own `poolSpent`
 * now sums them exactly like every other priced block, matching wodchar's own computation.
 * @type {Readonly<Record<string, number>>}
 */
export const CHANTRY_DESCRIPTOR_POINT_VALUE_BY_ID = Object.freeze({
	"atmosphere-alien": -10,
	"atmosphere-dark": -5,
	"atmosphere-peaceful": 5,
	"atmosphere-celestial": 10,
	"phenomenon-curse-severe": -10,
	"phenomenon-curse-mild": -5,
	"phenomenon-curse-secret-dark": -2,
	"phenomenon-haunted": -5,
	"phenomenon-psychic-emanations-powerful": -5,
	"phenomenon-psychic-emanations-strong": -2,
	"phenomenon-psychic-emanations-normal": 0,
	"phenomenon-psychic-emanations-none": 5,
	"phenomenon-magical-manifestations-subtle": -5,
	"phenomenon-magical-manifestations-notable": -10,
	"phenomenon-magical-manifestations-blatant": -15,
	"phenomenon-continuum-temporal-shifts": -5,
	"phenomenon-energy-fluctuations-subtle": -5,
	"phenomenon-energy-fluctuations-extreme": -10,
	"location-city": -5,
	"location-hard-to-reach": -5,
	"location-town": -1,
	"location-sparsely-populated": 1,
	"location-isolated": 5,
	"land-status-private-property": 0,
	"land-status-large-private-property": 5,
	"land-status-rented-5y": -15,
	"land-status-rented-15y": -10,
	"land-status-rented-30y": -5,
	"land-status-well-documented": -1,
	"land-status-frequently-raided": -10,
	"thinning-strong": -5,
	"thinning-typical": 0,
	"thinning-weak": 2,
	"thinning-none": 5,
	"internal-politics-intriguing": -10,
	"internal-politics-strict-hierarchy": -10,
	"internal-politics-conflicting-loyalties": -5,
	"internal-politics-disorganized": -5,
	"internal-politics-rogue-cabals": -5,
	"internal-politics-very-organized": 5,
	"internal-politics-harmonious": 10,
	"leadership-evil": -15,
	"leadership-foolish": -5,
	"leadership-dictatorial": -5,
	"leadership-wise": 5,
	"leadership-benevolent": 10,
	"staff-loyalty-spies": -10,
	"staff-loyalty-disloyal": -5,
	"staff-loyalty-loyal": 5,
	"staff-loyalty-committed": 10,
	"staff-loyalty-fanatic": 15,
	"staff-tier-none": -10,
	"staff-tier-few": -5,
	"staff-tier-functional": 0,
	"staff-tier-many": 5,
	"staff-tier-innumerable": 10,
	"communications-modern": 2,
	"communications-trans-umbral": 5,
	"communications-trans-horizon": 10,
	"building-condition-ruins": -10,
	"building-condition-high-tech": 10,
	"guardian-nature-mundane": 1,
	"guardian-nature-aware": 5,
	"guardian-nature-supernatural": 10,
	"guardian-loyalty-fanatic": 15,
	"guardian-loyalty-loyal": 10,
	"guardian-loyalty-reluctant": -5,
	"guardian-loyalty-hostile": -10,
	"guardian-loyalty-living-entity": 20
});

/** `id`'s signed point value, or `0` for an id this system does not recognise — same tolerant
 * shape as `chantryDescriptorCategory`/`isKnownChantryDescriptor` above (an id outside the known
 * catalogue is a documented gap, not an error). */
export function chantryDescriptorPointValue(id) {
	return CHANTRY_DESCRIPTOR_POINT_VALUE_BY_ID[id] ?? 0;
}

/** Whether `id` is one this system can label/categorise. A Chantry may still carry an id outside
 * this set (design.md D16's "known gap" above) — the sheet renders it via `descriptorFallbackLabel`
 * rather than dropping it silently, because a stored id a reader cannot SEE is exactly the "a value
 * accepted that silently does nothing" shape this project already tracks several instances of. */
export function isKnownChantryDescriptor(id) {
	return Object.prototype.hasOwnProperty.call(CHANTRY_DESCRIPTOR_CATEGORY_BY_ID, id);
}

/** `id`'s category, or `undefined` for an id this system does not recognise. */
export function chantryDescriptorCategory(id) {
	return CHANTRY_DESCRIPTOR_CATEGORY_BY_ID[id];
}

/** A readable fallback for an id this system's catalogue does not (yet) know, so an unrecognised
 * descriptor still reads as SOMETHING rather than a blank tag: `"leadership-wise"` -> `"Leadership
 * Wise"`. Only ever used when `isKnownChantryDescriptor(id)` is false. */
export function descriptorFallbackLabel(id) {
	return String(id)
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
