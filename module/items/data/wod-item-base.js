import { calculateTotals } from "../../scripts/totals.js";
import AbilityHelper from "../../scripts/ability-helpers.js";
import { computeAdvantageDerivedData } from "./advantage-derivations.js";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class WoDItem extends Item {

    /**
   * Augment the basic Item data model with additional dynamic data.
   */
    prepareData() {
        super.prepareData();
    }

    async _preCreate(data, options, user) {
		await super._preCreate(data, options, user);
		
		try {
			const updates = {};

			// Ensure system object exists in updates
			if (!data.system) {
				data.system = {};
			}

			if (!data.system.iscreated) {
				updates["system.iscreated"] = true;
				updates["system.version"] = game.system.version;

				if (data.type === "Ability") {
					if (!data.system.id || data.system.id === "") {
						updates["system.id"] = AbilityHelper.GetAbilityId(data.name);
					}
					if (!data.system.type || data.system.type === "") {
						updates["system.type"] = "wod.abilities.ability";
					}
				}	
				
				if ((data.type === "Advantage") && (options?.parent !== null) && (options?.parent !== undefined)) {
					updates["system.settings.order"] = options.parent.items.filter(i => i.type === "Advantage").length;
				}

				// A SECONDARY ability is a Trait item, not an Ability item, so the
				// Ability branch above never reaches one. Mirror its system.id half
				// here: without the key a secondary can only be recognised by
				// re-slugifying its name, which stops working the moment the name is
				// localised ("Hipertecnologia" does not slugify back to "hypertech").
				// Trait has no DataModel (see the CONFIG.Item.dataModels list in
				// wod.js) and template.json declares no `id` on Item.Trait nor on any
				// of its three merged templates, so system is free-form there and the
				// added key persists with no schema change.
				//
				// Two deliberate differences from the Ability branch:
				//  - the derivation is GetSecondAbilityId, which mirrors the consumer's
				//    slug rule (diacritics stripped, snake_case). The Ability rule is a
				//    different, older spelling that live data depends on; see the two
				//    functions' comments.
				//  - the system.type half is not mirrored, because system.type is
				//    exactly what identifies the item as a secondary in the first place.
				//
				// This can only ever stamp the name the item was CREATED with, which for
				// the sheet's "+" button is the placeholder -- _preUpdate below is what
				// settles the real key.
				if ((data.type === "Trait") && (AbilityHelper.IsSecondAbilityType(data.system?.type))) {
					if (!data.system.id || data.system.id === "") {
						updates["system.id"] = AbilityHelper.GetSecondAbilityId(
							AbilityHelper.GetSecondAbilityLabel(data)
						);
					}
				}

				if (data.type === "Trait" && data.system?.type === "wod.types.shapeform") {
					updates["system.usesoaksettings"] = false;
				}

				const imgUrl = _getImage(data);
				if (imgUrl != "") {
					updates.img = imgUrl;
				}

				// Apply updates using updateSource (Foundry v10+)
				if (Object.keys(updates).length > 0) {
					this.updateSource(updates);
				}
			}
		}
		catch (err) {
			err.message = `Failed _preCreate Item ${data?.name}: ${err.message}`;
			console.error(err);
		}
	}

	async _onCreate(data, options, userId) {
		await super._onCreate(data, options, userId);
	}

	async _preUpdate(updateData, options, user) {
		try {
			if (!updateData.system) {
				updateData.system = {};
			}

			if (updateData.type === "Ability") {
				updateData = await this._handleAbilitiesCalculations(updateData);
			}

			if (updateData.type === "Advantage") {
				updateData = await this._handleAdvantagesCalculations(updateData);
			}                

			if (updateData.type === "Sphere") {
				updateData = await this._handlePowerCalculations(updateData);
			}  

			if (updateData.type === "Power") {
				updateData = await this._handlePowerCalculations(updateData);
			} 			

			// Settle a SECONDARY ability's key on update.
			//
			// _preCreate can only stamp the name the item was created WITH, and the
			// sheet's "+" button creates one named with the placeholder ("New secondary
			// ability") and then opens the rename dialog. A create-only stamp would
			// therefore freeze the placeholder's slug forever -- worse than no key at
			// all, because the wod20-char importer prefers a carried key over the item's
			// name (`slug = carriedId || slugify(name)`).
			//
			// The rule is MONOTONE: fill the key only when there is nothing real to
			// lose (absent, empty, or still the placeholder's slug) and never overwrite
			// a real one, because changing a live key would orphan that ability's data
			// on the app side. Note this reads `this`, not updateData: an update diff
			// carries neither `type` nor `system.type`.
			//
			// Consequence, and it is the point of doing it here: a secondary that is
			// already live and has no key -- the two "Arte" Traits on the server were
			// created long before any of this existed -- picks the key up on its next
			// ordinary update, with no hand migration.
			if ((this.type === "Trait") && (AbilityHelper.IsSecondAbilityType(this.system?.type))) {
				const currentid = this.system?.id;

				if (AbilityHelper.IsFillableSecondAbilityId(currentid)) {
					const newid = AbilityHelper.GetSecondAbilityId(
						AbilityHelper.GetSecondAbilityLabel(this, updateData)
					);

					if ((newid !== "") && (newid !== currentid)) {
						// Write the key in the SAME shape the caller submitted. The actor
						// sheets all send a fully nested duplicate of the item, but the
						// Trait ITEM sheet submits FormDataExtended's flat "system.*" keys
						// -- and that is the one path where a rename actually changes
						// item.name, so it is the path that matters most here. Dropping a
						// nested `system` object into a flat payload would leave the update
						// carrying both spellings of the same branch, and which one wins
						// expansion is not something to bet a live key on.
						if (Object.keys(updateData).some(k => k.startsWith("system."))) {
							updateData["system.id"] = newid;
						}
						else {
							updateData.system.id = newid;
						}
					}
				}
			}
		}
		catch (err) {
			ui.notifications.error(`Cannot update Item ${updateData.name}. Please check console for details.`);
			err.message = `Cannot update Item ${updateData.name}: ${err.message}`;
			console.error(err);
		}

		await super._preUpdate(updateData, options, user);
	}

	async _onUpdate(updateData, options, user) {
		// try {
		// 	const item = this;

		// 	if ((item) && (item?.actor !== undefined) && (item?.actor !== null)) {
		// 		const actor = await game.actors.get(item.actor._id);

		// 		if (actor !== undefined) {
		// 			let actorData = foundry.utils.duplicate(this.actor);
		// 			actorData = await calculateTotals(actorData);
		// 			actorData.system.settings.isupdated = false;
		// 			await this.actor.update(actorData);
		// 		}
		// 	}			
		// }
		// catch (err) {
		// 	ui.notifications.error(`Cannot update Item ${updateData.name}. Please check console for details.`);
		// 	err.message = `Cannot update Item ${updateData.name}: ${err.message}`;
		// 	console.error(err);
		// }

		await super._onUpdate(updateData, options, user);
	}

	static migrateData(source) {
		// Foundry v13+ migrates export metadata from flags to _stats.
		// Do this eagerly to avoid deprecated field access warnings in v14.
		// const hasLegacyExportSource = source?.flags && Object.prototype.hasOwnProperty.call(source.flags, "exportSource");
		// const hasCurrentExportSource = source?._stats && Object.prototype.hasOwnProperty.call(source._stats, "exportSource");
		// let migratedLegacyExportSource = false;

		// if (hasLegacyExportSource && !hasCurrentExportSource) {
		// 	// Read the own-property descriptor to avoid triggering deprecated getter shims.
		// 	const exportSourceDescriptor = Object.getOwnPropertyDescriptor(source.flags, "exportSource");
		// 	source._stats ??= {};
		// 	if (exportSourceDescriptor && Object.prototype.hasOwnProperty.call(exportSourceDescriptor, "value")) {
		// 		source._stats.exportSource = exportSourceDescriptor.value;
		// 		migratedLegacyExportSource = true;
		// 	}
		// }

		// // Only delete legacy data if _stats already has a value or if we just migrated one.
		// if (hasLegacyExportSource && (hasCurrentExportSource || migratedLegacyExportSource)) {
		// 	delete source.flags.exportSource;
		// }

	    source = super.migrateData(source)
	    return source;
	}

	async _handleAbilitiesCalculations(itemData) {
        try {
            const item = this;
			let actor = null;
			
			if ((item.actor !== undefined) && (item.actor !== null)) {
				actor = game.actors.get(item.actor._id);

				if (actor === undefined) {
					actor = item.actor;
				}
			}

			let traitMax = 5;

			if (actor !== null) {
				traitMax = actor.system.settings.abilities.defaultmaxvalue;
			}

			if (itemData.system.max === traitMax) {
				return itemData;
			}

            itemData.system.max = traitMax;

			if (itemData.system.value > traitMax) {
				itemData.system.value = traitMax;
			}
        }
        catch (err) {
            err.message = `Failed _handleAbilitiesCalculations Item ${item.name}: ${err.message}`;
            console.error(err);
        }

        return itemData;
    }

    async _handleAdvantagesCalculations(itemData) {
        try {
			const item = this;
			let actor = null;

			if ((item.actor !== undefined) && (item.actor !== null)) {
				actor = game.actors.get(item.actor._id);

				if (actor === undefined) {
					actor = item.actor;
				}
			}

			// The actual computation (roll/bearing/max/permanent-clamping) is
			// shared with AdvantageDataModel#prepareDerivedData -- see
			// module/items/data/advantage-derivations.js for why this exists
			// in two call sites and why it has to be the SAME function.
			computeAdvantageDerivedData(itemData.system, actor);
        }
        catch (err) {
            err.message = `Failed _handleAdvantagesCalculations Item ${itemData.name}: ${err.message}`;
            console.error(err);
        }

        return itemData;
    }

	async _handlePowerCalculations(itemData) {
        try {
            const item = this;			
			let actor = null;
			
			if ((item.actor !== undefined) && (item.actor !== null)) {
				actor = game.actors.get(item.actor._id);

				if (actor === undefined) {
					actor = item.actor;
				}
			}

			let traitMax = 5;

			if (actor !== null) {
				traitMax = actor.system.settings.powers.defaultmaxvalue;
			}

			if (itemData.system.max === traitMax) {
				return itemData;
			}

            itemData.system.max = traitMax;

			if (itemData.system.value > traitMax) {
				itemData.system.value = traitMax;
			}
        }
        catch (err) {
            err.message = `Failed _handlePowerCalculations Item ${item.name}: ${err.message}`;
            console.error(err);
        }

        return itemData;
    }
}

function _getImage(item) {
	if (item.type == "Armor") {
		return "systems/worldofdarkness/assets/img/items/armor.svg";
	}

	if (item.type == "Fetish") {
		return "systems/worldofdarkness/assets/img/items/fetish.svg";
	}

	if (item.type == "Item") {
		
	}

	if ((item.type == "Melee Weapon") && (item.system.isnatural)) {
		return "systems/worldofdarkness/assets/img/items/naturalweapons.svg";
	}

	if ((item.type == "Melee Weapon") && (!item.system.isnatural)) {
		return "systems/worldofdarkness/assets/img/items/meleeweapons.svg";
	}

	if (item.type == "Ranged Weapon") {
		return "systems/worldofdarkness/assets/img/items/rangedweapons.svg";
	}

	if (item.type == "Feature") {
		return "systems/worldofdarkness/assets/img/items/feature.svg";
	}

	if (item.type == "Experience") {
		return "systems/worldofdarkness/assets/img/items/feature.svg";
	}

	if (item.type == "Splat") {
		return "systems/worldofdarkness/assets/img/items/skills.svg";
	}

	if (item.type == "Ability") {
		return "systems/worldofdarkness/assets/img/items/feature.svg";
	}

	if (item.type == "Advantage") {
		return "systems/worldofdarkness/assets/img/items/feature.svg";
	}

	if (item.type == "Sphere") {
		return "systems/worldofdarkness/assets/img/items/mainpower_mage.svg";
	}

	if (item.type == "Realm") {
		return "systems/worldofdarkness/assets/img/items/mainpower_changeling.svg";
	}

	if (item.type == "Power") {
		if ((item.system.type == "wod.types.discipline") /*|| (item.system.type == "wod.types.disciplinepath")*/) {
			return "systems/worldofdarkness/assets/img/items/mainpower_vampire.svg";
		}

		if ((item.system.type == "wod.types.disciplinepower") /*|| (item.system.type == "wod.types.disciplinepathpower")*/ || (item.system.type == "wod.types.combination")) {
			return "systems/worldofdarkness/assets/img/items/power_vampire.svg";
		}

		if ((item.system.type == "wod.types.ritual") && (item.system.game == CONFIG.worldofdarkness.sheettype.vampire.toLowerCase())) {
			return "systems/worldofdarkness/assets/img/items/ritual_vampire.svg";
		}

		if (item.system.type == "wod.types.art") {
			return "systems/worldofdarkness/assets/img/items/mainpower_changeling.svg";
		}

		if (item.system.type == "wod.types.artpower") {
			return "systems/worldofdarkness/assets/img/items/power_changeling.svg";
		}

		if (item.system.type == "wod.types.edge") {
			return "systems/worldofdarkness/assets/img/items/mainpower_hunter.svg";
		}

		if (item.system.type == "wod.types.edgepower") {
			return "systems/worldofdarkness/assets/img/items/power_hunter.svg";
		}

		if (item.system.type == "wod.types.lore") {
			return "systems/worldofdarkness/assets/img/items/mainpower_demon.svg";
		}

		if (item.system.type == "wod.types.lorepower") {
			return "systems/worldofdarkness/assets/img/items/power_demon.svg";
		}

		if ((item.system.type == "wod.types.arcanoi")||(item.system.type == "wod.types.stain")||(item.system.type == "wod.types.horror")) {
			return "systems/worldofdarkness/assets/img/items/mainpower_wraith.svg";
		}

		if (item.system.type == "wod.types.arcanoipower") {
			return "systems/worldofdarkness/assets/img/items/power_wraith.svg";
		}

		if (item.system.type == "wod.types.hekau") {
			return "systems/worldofdarkness/assets/img/items/mainpower_mummy.svg";
		}

		if (item.system.type == "wod.types.hekaupower") {
			return "systems/worldofdarkness/assets/img/items/power_mummy.svg";
		}

		if ((item.system.type == "wod.types.exaltedcharm") || (item.system.type == "wod.types.exaltedsorcery")) {
			return "systems/worldofdarkness/assets/img/items/power_exalted.svg";
		}

		if (item.system.type == "wod.types.numina") {
			return "systems/worldofdarkness/assets/img/items/mainpower_mage.svg";
		}

		if (item.system.type == "wod.types.numinapower") {
			return "systems/worldofdarkness/assets/img/items/power_mage.svg";
		}

		if ((item.system.type == "wod.types.ritual") && (item.system.game == "demon")) {
			return "systems/worldofdarkness/assets/img/items/ritual_demon.svg";
		}

		if (item.system.type == "wod.types.gift") {
			return "systems/worldofdarkness/assets/img/items/power_werewolf.svg";
		}

		if (item.system.type == "wod.types.rite") {
			return "systems/worldofdarkness/assets/img/items/ritual_werewolf.svg";
		}

		return "systems/worldofdarkness/assets/img/items/power.svg";
	}

	if (item.type == "Rote") {
		return "systems/worldofdarkness/assets/img/items/rote_mage.svg";
	}

	return "";
}