import ItemHelper from "./item-helpers.js";

/**
 * The gear tab's item lists, prepared ONCE for both sheets that render them.
 *
 * ============================================================================================
 * WHY THIS EXISTS (add-chantry-inventory-effects-and-roster, task 3.2)
 * ============================================================================================
 * design.md D1 refuses to make the Chantry sheet a subclass of `PCActorSheet` — 2,864 lines of
 * attribute/ability/health/willpower/sphere/splat preparation a Chantry has none of — and accepts
 * one cost for it: the Chantry sheet has to prepare its own item lists. THIS FILE is how that cost
 * is bounded. It is not a copy of anything: `prepareGearContext` (`pc-actor-sheet.js`) now calls it
 * too, so the two sheets read the same four lists out of the same four `ItemHelper` calls, and a
 * change to what "mundane" means reaches both without a second edit.
 *
 * WHY THE LISTS MOVED OUT OF THE TEMPLATE'S OWN HELPERS. `v3/gear.hbs` used to call
 * `(getMundaneItems actor)` inline, twice. A Handlebars helper cannot be shared with a sheet that
 * needs a DIFFERENT list (the Chantry's vault also shows weapons, armour and Wonders, which on the
 * PC live on Combate and Poderes), and an inline helper call is invisible to
 * `test-part-render.mjs`'s missing-context-key check — the one gate that can see a template reading
 * something its preparer never built. Reading them off the context puts both sheets under that gate.
 *
 * `getMundaneItems`/`getMagicalItems`/`getItemType` stay registered and unchanged: `parts/gear.hbs`
 * (the v2 sheet) and `v3/powers.hbs` still call them, and this change is not allowed to alter what
 * those render.
 */

/**
 * @param {object} context  the part context, mutated in place and returned
 * @param {Actor}  actor
 * @param {object} [options]
 * @param {boolean} [options.vault=false]  TRUE for a Chantry/Construct's vault, which renders all
 *        four lists in one tab and none of the PC-only furniture around them (carried money, the
 *        gear notes prose box, the macro rail). FALSE — the PC's Equipo tab — is byte-identical in
 *        what it renders to before this file existed.
 * @returns {object}
 */
export const prepareItemLists = function (context, actor, { vault = false } = {}) {
	// ALWAYS SET, on both sheets, even when the sheet will not render the list. An absent key and a
	// key holding an empty array are the same thing to a template and NOT the same thing to
	// `test-part-render.mjs`, which treats "the template read a key the preparer never built" as the
	// silent-empty-block defect it is.
	context.vault = vault;

	context.mundaneitems = ItemHelper.GetMundaneItems(actor);
	context.magicalitems = ItemHelper.GetMagicalItems(actor);

	/* Weapons and armour are their OWN Actor-item types (`Melee Weapon`, `Ranged Weapon`, `Armor` in
	   template.json), not `Item` sub-kinds, so neither appears in the two lists above — that is why
	   a Chantry vault needs them listed separately rather than filtered out of `mundaneitems`. On
	   the PC they render on Combate through `parts/combat_*.hbs`, which is untouched.

	   NOT `ItemHelper.GetItemType`, and this is a MEASURED finding rather than a preference:
	   that method's sort comparator is `a.system.type.localeCompare(b.system.type)`, and
	   `template.json` gives `Melee Weapon`/`Ranged Weapon`/`Armor` the `object`+`weapon` templates
	   but NOT `feature` — so those three types have no `system.type` at all and the comparator
	   throws `Cannot read properties of undefined (reading 'localeCompare')` as soon as an actor
	   holds TWO of them (one item never invokes a comparator, which is why nothing has hit this).
	   A throw inside `_prepareContext` is the "the sheet will not open" failure class this whole
	   change is being careful about, so the list is sorted here, by NAME, with a null-safe key.
	   `GetItemType` itself is left alone: fixing a shared helper every other sheet calls is not
	   this change's business, and it is reported instead. */
	const byName = (a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""));

	context.weapons = actor.items
		.filter((item) => item.type === "Melee Weapon" || item.type === "Ranged Weapon")
		.sort(byName);
	context.armoritems = actor.items
		.filter((item) => item.type === "Armor")
		.sort(byName);

	return context;
};

export default { prepareItemLists };
