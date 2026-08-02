/**
 * Which splat is this actor?
 *
 * `getSplat` was defined in `module/actor/template/pc-actor-sheet.js` and used only there. It moved
 * here, unchanged, so that code OUTSIDE the sheet layer can ask the same question and get the same
 * answer. `create-helpers.js` is the first such caller, and it could not import it from the sheet:
 * `pc-actor-sheet.js` -> `action-helpers.js` -> `create-helpers.js` already exists, so the import
 * would have closed a cycle. This module imports nothing, so it can never close one.
 *
 * `pc-actor-sheet.js` re-exports the symbol, so `import { getSplat } from "…/pc-actor-sheet.js"`
 * keeps working for anything outside this repo that used it.
 *
 * WHY THE CHAIN IS IN THIS ORDER. An actor can say what it is in four different places, and they do
 * not all exist on the same actor:
 *   1. `settings.variantsheet` - set by the splat item a GM drops on a PC, and by the wodchar
 *      exporter (its `wraith-modern` template writes `variantsheet: "wraith"`). Most specific, so
 *      first: a Kindred-of-the-East PC is `splat: "vampire"` with its own variant sheet.
 *   2. `settings.splat` - the splat item's own id / the exporter's line.
 *   3. `settings.game` - the parent game line, which is what a spirit or a companion carries.
 *   4. `actor.type` - the LEGACY per-splat Actor document types ("Wraith", "Mage", …). This is the
 *      only one a hand-created legacy actor has, and it is why the fork's own `type: "PC"` maps to
 *      "mortal" rather than to a nonexistent "pc" splat.
 *
 * The returned value is a `CONFIG.worldofdarkness.splat.*` key (lower case), not a `sheettype.*`
 * label - compare it against `CONFIG.worldofdarkness.splat.wraith`, never against `"Wraith"`.
 */
export const getSplat = function (actor) {
	// Use variantsheet first, then splat, then actor type as fallback
	let splatname = "";
	if (actor.system?.settings?.variantsheet && actor.system.settings.variantsheet !== "") {
		splatname = actor.system.settings.variantsheet.toLowerCase();
	} else if (actor.system?.settings?.splat && actor.system.settings.splat !== "") {
		splatname = actor.system.settings.splat.toLowerCase();
	} else if (actor.system?.settings?.game && actor.system.settings.game !== "") {
		splatname = actor.system.settings.game.toLowerCase();
	}
	else {
		splatname = actor.type.toLowerCase();
	}
	return ( splatname === "pc" ? "mortal" : splatname);
}
