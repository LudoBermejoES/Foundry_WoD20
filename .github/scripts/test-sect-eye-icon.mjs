#!/usr/bin/env node
/**
 * A Mage's free-text "Secta"/"Afiliación" bio rows must get the same read-only eye every other
 * trait row on this sheet has, once their value matches a `mage-sects`/`mage-affiliation`
 * compendium document — add-faction-sect-entities, then add-affiliation-eye-icon for the second
 * field (same shape, one splatfield over).
 *
 * WHY THIS EXISTS
 * ---------------
 * `trait-enrichment.js`'s original two kinds (`attribute`, `sphere`) match by a STABLE PER-ROW KEY
 * (`system.attributes.<key>`, a Sphere Item's `system.id`), looked up against a `CONFIG` label
 * table before the final name comparison. The Mage bio "Secta"/"Afiliación" fields
 * (`actor.system.bio.splatfields.{sect,affiliation}`) have no such key at all: each is one
 * free-text string, already the display name (wodchar's exporter writes the resolved `name_es`,
 * or a GM types one directly). `matchNameDirectly` is the one-line-per-kind change that lets both
 * reuse the SAME resolver instead of a parallel implementation, and it is exactly the kind of
 * change that silently reverts: nothing else in this file's structure would notice
 * `matchNameDirectly` being ignored, since the key-based kinds would keep passing regardless.
 *
 * Also pins the render-side wiring: each icon only exists in the DOM when a match was found
 * (`bio_splatfields.hbs`), gated on its own `key ===` check so no other splatfield row grows an
 * eye, `pc-actor-sheet.js` only computes either lookup for the Mage splat, and — since `sect` and
 * `affiliation` are two SEPARATE packs sharing one matching code path — that a value for one field
 * can never accidentally match a document in the other field's pack.
 *
 *     node .github/scripts/test-sect-eye-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
	results.push(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "   " + detail : ""}`);
	if (!ok) failed++;
};

/* ---- 1. static wiring: the template and the context builder ---- */

const hbsSrc = fs.readFileSync(path.join(ROOT, "templates", "actor", "parts", "bio_splatfields.hbs"), "utf8");
check("A1 the eye icon is gated on key === \"sect\"",
	/\(eq key "sect"\)/.test(hbsSrc));
check("A2 the icon carries the load-bearing `.collapsible.button[data-traituuid]` classes",
	/class="pointer icon collapsible button fa-solid fa-eye[^"]*"[\s\S]{0,120}data-traituuid="\{\{lookup \.\.\/sectCompendiumUuid field\.value\}\}"/.test(hbsSrc));

check("A2b the affiliation eye icon is gated on key === \"affiliation\"",
	/\(eq key "affiliation"\)/.test(hbsSrc));
check("A2c the affiliation icon points at affiliationCompendiumUuid, not sectCompendiumUuid",
	/class="pointer icon collapsible button fa-solid fa-eye[^"]*"[\s\S]{0,120}data-traituuid="\{\{lookup \.\.\/affiliationCompendiumUuid field\.value\}\}"/.test(hbsSrc));

const sheetSrc = fs.readFileSync(path.join(ROOT, "module", "actor", "template", "pc-actor-sheet.js"), "utf8");
check("A3 the sect key list is scoped to the mage splat with a value set",
	/splat === "mage" && context\.splatfields\?\.sect\?\.value \? \[context\.splatfields\.sect\.value\] : \[\]/.test(sheetSrc));
check("A4 sectCompendiumUuid is built via the shared buildTraitCompendiumUuidMap(\"sect\", ...), UNCONDITIONALLY assigned",
	/context\.sectCompendiumUuid = await buildTraitCompendiumUuidMap\(\s*"sect",/.test(sheetSrc));
check("A3b the affiliation key list is scoped to the mage splat with a value set",
	/splat === "mage" && context\.splatfields\?\.affiliation\?\.value \? \[context\.splatfields\.affiliation\.value\] : \[\]/.test(sheetSrc));
check("A4b affiliationCompendiumUuid is built via the shared buildTraitCompendiumUuidMap(\"affiliation\", ...), UNCONDITIONALLY assigned",
	/context\.affiliationCompendiumUuid = await buildTraitCompendiumUuidMap\(\s*"affiliation",/.test(sheetSrc));

/* ---- 2. behavioural: the real resolver, against stubbed packs ---- */

const MODULE_ID = "wod20-compendium-es";

/** A minimal `game.packs.get(...)`/`pack.getDocuments()` double, scoped to one call. */
function stubGame(docsByPack) {
	global.game = {
		packs: {
			get(key) {
				const name = key.split(".")[1];
				if (!(name in docsByPack)) return undefined;
				return { getDocuments: async () => docsByPack[name] };
			}
		},
		i18n: { localize: (k) => k }
	};
}

const CASA_BONISAGUS = { name: "Casa Bonisagus", uuid: "Compendium.wod20-compendium-es.mage-sects.aaa", system: {}, flags: {} };
const CYBERPUNKS = { name: "Cyberpunks", uuid: "Compendium.wod20-compendium-es.mage-sects.bbb", system: {}, flags: {} };

global.CONFIG = { worldofdarkness: {} };
const { buildTraitCompendiumUuidMap } = await import(path.join(ROOT, "module", "scripts", "trait-enrichment.js"));

{
	stubGame({ "mage-sects": [CASA_BONISAGUS, CYBERPUNKS] });
	const map = await buildTraitCompendiumUuidMap("sect", ["Casa Bonisagus"]);
	check("B1 an exact-name value resolves to that document's uuid",
		map["Casa Bonisagus"] === CASA_BONISAGUS.uuid, JSON.stringify(map));
}

{
	stubGame({ "mage-sects": [CASA_BONISAGUS, CYBERPUNKS] });
	const map = await buildTraitCompendiumUuidMap("sect", ["  casa bonisagus  "]);
	check("B2 matching is case/whitespace-insensitive (normalize())",
		map["  casa bonisagus  "] === CASA_BONISAGUS.uuid, JSON.stringify(map));
}

{
	stubGame({ "mage-sects": [CASA_BONISAGUS, CYBERPUNKS] });
	const map = await buildTraitCompendiumUuidMap("sect", ["Mi secta casera"]);
	check("B3 a custom/unmatched value resolves to nothing, not a crash",
		!("Mi secta casera" in map), JSON.stringify(map));
}

{
	// The `mage-sects` pack itself absent (module not installed, or a stale pack name) — must
	// degrade to no match, never throw, per this file's "DEGRADE, NEVER THROW" contract.
	stubGame({});
	const map = await buildTraitCompendiumUuidMap("sect", ["Casa Bonisagus"]);
	check("B4 a missing mage-sects pack degrades to an empty map",
		Object.keys(map).length === 0, JSON.stringify(map));
}

{
	// Regression: `matchNameDirectly` must not leak into the two EXISTING kinds, which still match
	// a per-row KEY against a CONFIG label table, not the key treated as an already-final name.
	global.CONFIG = { worldofdarkness: { attributes: { strength: "wod.attributes.strength" } } };
	stubGame({ "shared-attributes": [{ name: "Fuerza", uuid: "Compendium...attributes.ccc", system: {}, flags: {} }] });
	global.game.i18n.localize = (k) => (k === "wod.attributes.strength" ? "Fuerza" : k);
	const map = await buildTraitCompendiumUuidMap("attribute", ["strength"]);
	check("B5 the attribute kind still resolves via its CONFIG label table, unaffected by matchNameDirectly",
		map["strength"] === "Compendium...attributes.ccc", JSON.stringify(map));

	const noLabelMap = await buildTraitCompendiumUuidMap("attribute", ["dexterity"]);
	check("B6 an attribute key with no CONFIG label does not fall back to matching the raw key as a name",
		!("dexterity" in noLabelMap), JSON.stringify(noLabelMap));
}

const ORDEN_DE_HERMES = { name: "Orden de Hermes", uuid: "Compendium.wod20-compendium-es.mage-affiliation.ddd", system: {}, flags: {} };
const VERBENA = { name: "Verbena", uuid: "Compendium.wod20-compendium-es.mage-affiliation.eee", system: {}, flags: {} };

{
	global.CONFIG = { worldofdarkness: {} };
	stubGame({ "mage-affiliation": [ORDEN_DE_HERMES, VERBENA] });
	const map = await buildTraitCompendiumUuidMap("affiliation", ["Orden de Hermes"]);
	check("B7 an exact-name Afiliación value resolves to that document's uuid",
		map["Orden de Hermes"] === ORDEN_DE_HERMES.uuid, JSON.stringify(map));
}

{
	stubGame({ "mage-affiliation": [ORDEN_DE_HERMES, VERBENA] });
	const map = await buildTraitCompendiumUuidMap("affiliation", ["Mi tradicion casera"]);
	check("B8 a custom/unmatched Afiliación value resolves to nothing, not a crash",
		!("Mi tradicion casera" in map), JSON.stringify(map));
}

{
	// Cross-pack regression: `sect` and `affiliation` share the matchNameDirectly code path but
	// must never resolve against EACH OTHER's pack — a Sect value happening to equal an
	// Affiliation document's name (or vice versa) must not grow an eye pointed at the wrong pack.
	stubGame({ "mage-sects": [CASA_BONISAGUS], "mage-affiliation": [ORDEN_DE_HERMES] });
	const sectMap = await buildTraitCompendiumUuidMap("sect", ["Orden de Hermes"]);
	const affMap = await buildTraitCompendiumUuidMap("affiliation", ["Casa Bonisagus"]);
	check("B9 sect never resolves an Afiliación-pack-only name, and vice versa",
		!("Orden de Hermes" in sectMap) && !("Casa Bonisagus" in affMap),
		JSON.stringify({ sectMap, affMap }));
}

const SONS_OF_ETHER = { name: "Sociedad del Éter / Hijos del Éter", uuid: "Compendium.wod20-compendium-es.mage-affiliation.fff", system: {}, flags: {} };

{
	// Real incident (Salvador Pacheco-König): mago20 joins a historical/alternate name onto 5 of
	// 26 affiliation entities with " / ", but a legacy/free-text imported character's Afiliación
	// value often names only ONE of the two — the eye must still show.
	stubGame({ "mage-affiliation": [SONS_OF_ETHER] });
	const bySecondAlias = await buildTraitCompendiumUuidMap("affiliation", ["Hijos del Éter"]);
	check("B10 a compound document name matches its SECOND alias alone",
		bySecondAlias["Hijos del Éter"] === SONS_OF_ETHER.uuid, JSON.stringify(bySecondAlias));

	const byFirstAlias = await buildTraitCompendiumUuidMap("affiliation", ["Sociedad del Éter"]);
	check("B11 a compound document name matches its FIRST alias alone",
		byFirstAlias["Sociedad del Éter"] === SONS_OF_ETHER.uuid, JSON.stringify(byFirstAlias));

	const byFullName = await buildTraitCompendiumUuidMap("affiliation", ["Sociedad del Éter / Hijos del Éter"]);
	check("B12 the full compound name still matches too",
		byFullName["Sociedad del Éter / Hijos del Éter"] === SONS_OF_ETHER.uuid, JSON.stringify(byFullName));

	const byPartialWord = await buildTraitCompendiumUuidMap("affiliation", ["Éter"]);
	check("B13 a bare substring of one alias does NOT falsely match (exact alias only, no fuzzy/partial matching)",
		!("Éter" in byPartialWord), JSON.stringify(byPartialWord));
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
