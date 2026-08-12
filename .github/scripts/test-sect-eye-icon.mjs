#!/usr/bin/env node
/**
 * A Mage's free-text "Secta" bio row must get the same read-only eye every other trait row on this
 * sheet has, once its value matches a `mage-sects` compendium document — add-faction-sect-entities.
 *
 * WHY THIS EXISTS
 * ---------------
 * `trait-enrichment.js`'s existing two kinds (`attribute`, `sphere`) match by a STABLE PER-ROW KEY
 * (`system.attributes.<key>`, a Sphere Item's `system.id`), looked up against a `CONFIG` label
 * table before the final name comparison. The Mage bio "Secta" field
 * (`actor.system.bio.splatfields.sect`) has no such key at all: it is one free-text string, already
 * the display name (wodchar's exporter writes the resolved `name_es`, or a GM types one directly).
 * `matchNameDirectly` is the one-line change that lets `sect` reuse the SAME resolver instead of a
 * parallel implementation, and it is exactly the kind of one-line change that silently reverts:
 * nothing else in this file's structure would notice `matchNameDirectly` being ignored, since the
 * two existing kinds would keep passing regardless.
 *
 * Also pins the render-side wiring: the icon only exists in the DOM when a match was found
 * (`bio_splatfields.hbs`), gated on `key === "sect"` so no other splatfield row grows an eye, and
 * `pc-actor-sheet.js` only computes the lookup for the Mage splat.
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

const sheetSrc = fs.readFileSync(path.join(ROOT, "module", "actor", "template", "pc-actor-sheet.js"), "utf8");
check("A3 sectCompendiumUuid is computed only for the mage splat",
	/splat === "mage" && context\.splatfields\?\.sect\?\.value/.test(sheetSrc));
check("A4 sectCompendiumUuid is built via the shared buildTraitCompendiumUuidMap(\"sect\", ...)",
	/buildTraitCompendiumUuidMap\("sect", \[context\.splatfields\.sect\.value\]\)/.test(sheetSrc));

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

console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILURE(S)` : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);
