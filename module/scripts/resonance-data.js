/**
 * add-mage-resonance — the seven fixed Resonancia/Sinergia flavor ids (M20 Book of Secrets Cap. 2 /
 * Core Rulebook Cap. Diez Parte V), matching `wodchar`'s `listMageResonanceFlavors()`'s `entityRef`
 * values verbatim (the same 7 catalog entity ids: `<flavor>-resonance`/`<flavor>-synergy`). A
 * player-facing mark's `system.category` is always one of these — the corrupted-Práctica
 * resistance counter and a bare hand-made Jhor item never set `category` at all, so filtering on
 * this exact set is what tells a real mark apart from either internal counter (see
 * `prism-corrupted-helpers.js`'s own header for those).
 */
export const RESONANCE_FLAVOR_IDS = [
	"devoted-resonance",
	"elemental-resonance",
	"stabilizing-resonance",
	"temperamental-resonance",
	"dynamic-synergy",
	"entropic-synergy",
	"static-synergy",
];

/** `system.category` -> the `wod.resonance.flavor.*` localization key holding its Spanish label
 *  ("Resonancia Devota", "Sinergia Dinámica", ...). */
export const RESONANCE_FLAVOR_LABEL_KEY = {
	"devoted-resonance": "wod.resonance.flavor.devoted",
	"elemental-resonance": "wod.resonance.flavor.elemental",
	"stabilizing-resonance": "wod.resonance.flavor.stabilizing",
	"temperamental-resonance": "wod.resonance.flavor.temperamental",
	"dynamic-synergy": "wod.resonance.flavor.dynamic",
	"entropic-synergy": "wod.resonance.flavor.entropic",
	"static-synergy": "wod.resonance.flavor.static",
};

/**
 * Pure predicate factored out of `pc-actor-sheet.js`'s `resonanceMarks` context builder so it has
 * one definition, testable without stubbing a sheet/actor — see `tests/resonance.test.mjs`. A
 * player-facing mark ALWAYS carries one of the seven known flavor ids; the corrupted-Práctica
 * resistance counter and a bare hand-made Jhor item never set `category` at all.
 * @param {{system?: {category?: string}}} item
 */
export function isPlayerFacingResonanceMark(item) {
	return RESONANCE_FLAVOR_IDS.includes(item?.system?.category);
}
