import AbilityHelper from "./ability-helpers.js";
import BonusHelper from "./bonus-helpers.js";
import { enrichAbilityItemData } from "./ability-enrichment.js";
import { getSplat } from "./splat-helpers.js";

export default class CreateHelper {

	static async SetAbilities(actorCopy, type, era) {
		console.log(`WoD | Set ${type} Abilities - ${era}`);

		// hide all
		for (const ability in actorCopy.system.abilities) {
			if (actorCopy.system.abilities[ability] != undefined) {
				if (actorCopy.system.abilities[ability].value == 0) {
					actorCopy.system.abilities[ability].isvisible = false;
				}
			}
		}

		if (type == "demon") {
			if (game.settings.get('worldofdarkness', 'demonSystemSettings') == "20th") {
				era = "modern20";
			}
		}

		for (const talent in game.worldofdarkness.abilities[type][era].talents) {
			if (actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].talents[talent]] != undefined) {
				actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].talents[talent]].isvisible = true;
			}
		}

		for (const skill in game.worldofdarkness.abilities[type][era].skills) {
			if (actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].skills[skill]] != undefined) {
				actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].skills[skill]].isvisible = true;
			}
		}

		for (const knowledge in game.worldofdarkness.abilities[type][era].knowledges) {
			if (actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].knowledges[knowledge]] != undefined) {
				actorCopy.system.abilities[game.worldofdarkness.abilities[type][era].knowledges[knowledge]].isvisible = true;
			}
		}

		if (type == "hunter") {
			actorCopy.system.abilities.technology.type = "skill";
		}
		if (type == "demon") {
			if (game.settings.get('worldofdarkness', 'demonSystemSettings') != "20th") {
				actorCopy.system.abilities.technology.type = "skill";
			}
		}
		if (type == "wraith") {
			actorCopy.system.abilities.leadership.type = "skill";
		}
		if (type == "orpheus") {
			actorCopy.system.abilities.technology.type = "skill";
		}
		if (type == "sorcerer") {
			actorCopy.system.abilities.technology.type = "skill";
		}
		if (type == "mummy") {
			actorCopy.system.abilities.technology.type = "skill";
		}

		return actorCopy;
	}

	static async SetAbilitiesv2(updates, actor, type, era) {
		console.log(`WoD | Set ${type} Abilities - ${era}`);

		// hide all
		for (const ability in actor.system.abilities) {
			if (actor.system.abilities[ability] != undefined) {
				if (actor.system.abilities[ability].value == 0) {
					updates["system.abilities." + ability + ".isvisible"] = false;
				}
			}
		}

		if (type == "demon") {
			if (game.settings.get('worldofdarkness', 'demonSystemSettings') == "20th") {
				era = "modern20";
			}
		}

		for (const talent in game.worldofdarkness.abilities[type][era].talents) {
			if (actor.system.abilities[game.worldofdarkness.abilities[type][era].talents[talent]] != undefined) {
				updates["system.abilities." + game.worldofdarkness.abilities[type][era].talents[talent] + ".isvisible"] = true;
			}
		}

		for (const skill in game.worldofdarkness.abilities[type][era].skills) {
			if (actor.system.abilities[game.worldofdarkness.abilities[type][era].skills[skill]] != undefined) {
				updates["system.abilities." + game.worldofdarkness.abilities[type][era].skills[skill] + ".isvisible"] = true;
			}
		}

		for (const knowledge in game.worldofdarkness.abilities[type][era].knowledges) {
			if (actor.system.abilities[game.worldofdarkness.abilities[type][era].knowledges[knowledge]] != undefined) {
				updates["system.abilities." + game.worldofdarkness.abilities[type][era].knowledges[knowledge] + ".isvisible"] = true;
			}
		}

		if (type == "hunter") {
			updates["system.abilities.technology.type"] = "skill";
		}
		if (type == "demon") {
			if (game.settings.get('worldofdarkness', 'demonSystemSettings') != "20th") {
				updates["system.abilities.technology.type"] = "skill";
			}
		}
		if (type == "wraith") {
			updates["system.abilities.leadership.type"] = "skill";
		}
		if (type == "orpheus") {
			updates["system.abilities.technology.type"] = "skill";
		}
		if (type == "sorcerer") {
			updates["system.abilities.technology.type"] = "skill";
		}
		if (type == "mummy") {
			updates["system.abilities.technology.type"] = "skill";
		}

		return updates;
	}
    
    static async SetMortalAbilities(actor, era) {
		console.log(`WoD | Set Mortal Abilities - ${era}`);		

		if (era == "victorian") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", "Ride", parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "darkages") {
			await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", game.i18n.localize("wod.abilities.legerdemain"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.seneschal"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.theology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "classical") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.philosophy"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.religion"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.ritualistics"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "livinggods") {
			await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", game.i18n.localize("wod.abilities.legerdemain"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.ancientmedicine"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.astrology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
            await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.customs"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.mythology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.seneschal"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.writing"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}
	}	

	static async SetOrpheusAbilities(actorCopy, actor) {
		console.log(`WoD | Set Orpheus Abilities - Modern`);
		const era = 'modern';

		await this.SetAbilities(actorCopy, "orpheus", era);
		actorCopy.system.abilities.technology.type = "skill";		
		
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.talentsecondability", "Intrigue", parseInt(actor.system.settings.abilities.defaultmaxvalue));
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Dead-Eyes", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Detect Nature Group", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Incorporeal & Invisible", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Manifest", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Misery Loves Company", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Sense Lifeline", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Sever the Strand", 0);
		AbilityHelper.CreateTrait_nowait(actor, "wod.types.othertraits", "Thievery", 0);

		return actorCopy;
	}

	static async SetSorcererAbilities(actorCopy) {
		console.log(`WoD | Set Sorcerer Abilities - Modern`);
		const era = 'modern';

		await this.SetAbilities(actorCopy, "sorcerer", era);

		actorCopy.system.abilities.technology.type = "skill";
		actorCopy.system.abilities.research.type = "skill";

		return actorCopy;
	}

	static async SetVampireAbilities(actor, era) {	
		console.log(`WoD | Set Vampire Abilities`);

		if (era == "victorian") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "darkages") {
			await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", game.i18n.localize("wod.abilities.legerdemain"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.seneschal"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.theology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "classical") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.philosophy"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.religion"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.ritualistics"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}

		if (era == "livinggods") {
			await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", game.i18n.localize("wod.abilities.legerdemain"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.commerce"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.ancientmedicine"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.astrology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
            await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.customs"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.mythology"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.seneschal"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.writing"), parseInt(actor.system.settings.abilities.defaultmaxvalue));
		}
	}

	static async SetChangelingAbilities(actor) {	
		console.log(`WoD | Set Changeling Abilities`);
		let exists = false;

		try {
			let itemData = {
				name: "actor",
				type: "Trait",					
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.actor",
					type: "wod.types.realms"
				}
			};
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "actor");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}			
			
			itemData = {
				name: "fae",
				type: "Trait",
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.fae",
					type: "wod.types.realms"
				}
			};
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "fae");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}
	
			itemData = {
				name: "nature",
				type: "Trait",
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.nature",
					type: "wod.types.realms"
				}
			};
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "nature");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}
	
			itemData = {
				name: "prop",
				type: "Trait",
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.prop",
					type: "wod.types.realms"
				}
			};
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "prop");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}
	
			itemData = {
				name: "scene",
				type: "Trait",
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.scene",
					type: "wod.types.realms"
				}
			};
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "scene");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}
	
			itemData = {
				name: "time",
				type: "Trait",
				system: {
					iscreated: true,
					version: game.system.version,
					label: "wod.realms.time",
					type: "wod.types.realms"
				}
			};				
			exists = await AbilityHelper.CheckItemExists(actor, "Trait", "wod.types.realms", "time");
			if (!exists) {
				await actor.updateSource({ items: [itemData]});
			}
		}
		catch (err) {
            err.message = `Failed SetChangelingAbilities Actor ${actor.name}: ${err.message}`;
            console.error(err);
        }		
	}

	static async SetWerewolfAbilities(actor, era) {	
		console.log(`WoD | Set Werewolf Abilities - ${era}`);

		if (era == "victorian") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), 5);
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.culture"), 5);
		}

		if (era == "darkages") {
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.archery"), 5, false, true);
			await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.abilities.ride"), 5);
			await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.abilities.hearthwisdom"), 5);
		}
	}

	static async SetDemonAbilities(actor) {	
		console.log(`WoD | Set Demon Abilities`);

		try {
			const items = actor.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.apocalypticform");
			const exists = items.length >= 8;

			if ((game.settings.get('worldofdarkness', 'demonCreateForms')) && (!exists))  {
				console.log(`CREATION: Adds missing Apocalyptic Forms to ${actor.name}`);

				const number = 8 - items.length;
				
				for (let i = 1; i <= number; i++) {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.apocalypticform"),
						type: "Trait",						
						system: {
							iscreated: true,
							version: game.system.version,
							level: 0,
							type: "wod.types.apocalypticform"
						}
					};
					await actor.updateSource({ items: [itemData]});
				}
			}
		}
		catch (err) {
            err.message = `Failed SetDemonAbilities Actor ${actor.name}: ${err.message}`;
            console.error(err);
        }		
	}

	static async SetCreatureAbilities(actor) {
		console.log('WoD | Set Creature Abilities');

		// hide all
		for (const ability in actor.system.abilities) {
			if (actor.system.abilities[ability] != undefined) {
				if (actor.system.abilities[ability].value == 0) {
					actor.system.abilities[ability].isvisible = false;
				}
			}
		}	

		return actor;
	}

	static async SetCreatureAbilitiesv2(updates, actor) {
		console.log('WoD | Set Creature Abilities');

		// hide all
		for (const ability in actor.system.abilities) {
			if (actor.system.abilities[ability] != undefined) {
				if (actor.system.abilities[ability].value == 0) {
					updates["system.abilities." + ability + ".isvisible"] = false;
				}
			}
		}	

		return updates;
	}

	static async SetMortalAttributesv2(updates, actor) {
		console.log('WoD | Set Mortal Attributes');

		let willpower = -1;

		// Set all attributes to visible
		for (const attribute in actor.system.attributes) {
			updates["system.attributes." + attribute + ".isvisible"] = true;
		}

		if (CONFIG.worldofdarkness.attributeSettings == "5th") {
			updates["system.attributes.appearance.isvisible"] = false;
			updates["system.attributes.perception.isvisible"] = false;

			if (CONFIG.worldofdarkness.fifthEditionWillpowerSetting == "20th") {
				updates["system.advantages.willpower.permanent"] = 0;
			}
			else {
				updates["system.advantages.willpower.permanent"] = 2;
			}			
		}
		else {
			updates["system.attributes.composure.isvisible"] = false;
			updates["system.attributes.resolve.isvisible"] = false;
			updates["system.advantages.willpower.permanent"] = 0;
		}

		if (CONFIG.worldofdarkness.rollSettings) {
			willpower = actor.system.advantages.willpower.permanent; 
		}
		else {
			willpower = actor.system.advantages.willpower.permanent > actor.system.advantages.willpower.temporary ? actor.system.advantages.willpower.temporary : actor.system.advantages.willpower.permanent; 
		}

		updates["system.advantages.willpower.roll"] = willpower;

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = false;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		updates["system.settings.haswillpower"] = true;

		return updates;
	}

	static async SetVampireAttributesv2(updates, actor) {
		console.log('WoD | Set Vampire Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		updates["system.settings.haspath"] = true;
		updates["system.settings.hasbloodpool"] = true;		
		updates["system.settings.hasvirtue"] = true;

		updates["system.settings.powers.hasdisciplines"] = true;

		return updates;
	}

	static async SetWerewolfAttributes(actor) {
		console.log('WoD | Set Werewolf Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = true;

		actor.system.settings.hasrage = true;
		actor.system.settings.hasgnosis = true;

		actor.system.settings.powers.hasgifts = true;

		return actor;
	}

	static async SetWerewolfAttributesv2(updates, actor) {
		console.log('WoD | Set Werewolf Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = true;

		updates["system.settings.hasrage"] = true;
		updates["system.settings.hasgnosis"] = true;

		updates["system.settings.powers.hasgifts"] = true;

		return updates;
	}

	static async SetShifterAttributes(actor, type) {
		console.log('WoD | Set Shifter Attributes');

		actor = await this.SetWerewolfAttributes(actor);

		actor.system.changingbreed = type;
		actor.system.settings.hasrage = true;
		actor.system.settings.hasbloodpool = false;

		if ((type == "Ananasi") || (type == "Nuwisha")) {
			actor.system.settings.hasrage = false;
		}
		if (type == "Ananasi") {
			actor.system.settings.hasbloodpool = true;
		}

		return actor;
	}

	static async SetMageAttributes(actor) {
		console.log('WoD | Set Mage Attributes');

		actor.system.advantages.arete.permanent = 1;
		actor.system.advantages.arete.roll = 1;

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = false;
		actor.system.settings.soak.aggravated.isrollable = false;

		actor.system.abilities.technology.type = "skill";
		actor.system.abilities.research.type = "skill";

		return actor;
	}

	static async SetMageAttributesv2(updates, actor) {
		console.log('WoD | Set Mage Attributes');

		updates["system.advantages.arete.permanent"] = 1;
		updates["system.advantages.arete.roll"] = 1;

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = false;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		updates["system.abilities.technology.type"] = "skill";
		updates["system.abilities.research.type"] = "skill";

		return updates;
	}

	static async SetChangelingAttributes(actor) {
		console.log('WoD | Set Changeling Attributes');

		actor.system.settings.soak.chimerical.bashing.isrollable = true;
		actor.system.settings.soak.chimerical.lethal.isrollable = true;
		actor.system.settings.soak.chimerical.aggravated.isrollable = false;
		
		actor.system.settings.hasglamour = true;
		actor.system.settings.hasbanality = true;

		actor.system.settings.powers.hasarts = true;

		return actor;
	}

	static async SetChangelingAttributesv2(updates, actor) {
		console.log('WoD | Set Changeling Attributes');

		updates["system.settings.soak.chimerical.bashing.isrollable"] = true;
		updates["system.settings.soak.chimerical.lethal.isrollable"] = true;
		updates["system.settings.soak.chimerical.aggravated.isrollable"] = false;
		
		updates["system.settings.hasglamour"] = true;
		updates["system.settings.hasbanality"] = true;

		updates["system.settings.powers.hasarts"] = true;

		return updates;
	}

	static async SetHunterAttributes(actor) {
		console.log('WoD | Set Hunter Attributes');

		actor.system.settings.hasconviction = true;
		actor.system.settings.hasvirtue = true;

		actor.system.settings.powers.hasedges = true;

		return actor;
	}

	static async SetHunterAttributesv2(updates, actor) {
		console.log('WoD | Set Hunter Attributes');

		updates["system.settings.hasconviction"] = true;
		updates["system.settings.hasvirtue"] = true;

		updates["system.settings.powers.hasedges"] = true;

		return updates;
	}

	static async SetDemonAttributes(actor) {
		console.log('WoD | Set Demon Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = false;

		actor.system.settings.hasvirtue = true;
		actor.system.settings.hasfaith = true;
		actor.system.settings.hastorment = true;
		
		actor.system.settings.powers.haslores = true;

		actor.system.advantages.virtues.selfcontrol.label = "wod.advantages.virtue.conviction";

		return actor;
	}

	static async SetDemonAttributesv2(updates, actor) {
		console.log('WoD | Set Demon Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		updates["system.settings.hasvirtue"] = true;
		updates["system.settings.hasfaith"] = true;
		updates["system.settings.hastorment"] = true;
		
		updates["system.settings.powers.haslores"] = true;

		updates["system.advantages.virtues.selfcontrol.label"] = "wod.advantages.virtue.conviction";

		return updates;
	}

	/*
	 * add-wraith-pc-splat §2.1 set four flags here. Three of them — `hascorpus`, `haspathos`, `hasangst` —
	 * are gone: they only ever restated "this actor is a wraith", and the two things that cared now ask the
	 * splat directly (the Corpus track in `prepareStatContext`) or never cared at all (Pathos and Angst are
	 * plain `Advantage` items on the PC sheet). See `actor_settings.js` for the full reasoning.
	 *
	 * `hasarcanoi` stays, and stays here, but it is no longer the source of truth: `_prepareCharacterData`
	 * derives it from the actor's Arcanoi items on every prepare, for `PC` actors. This assignment now only
	 * matters to a legacy per-splat Actor document, which that derivation skips.
	 *
	 * Both functions are reachable only from `_preCreate`'s `data.type == sheettype.wraith` branch, i.e.
	 * only for a legacy `Wraith` Actor document. This fork's actors are `type: "PC"` (the only Actor
	 * subtype `system.json`'s `documentTypes` declares besides `Chantry`, and the only one with a
	 * DataModel), so that branch never fires for them. That, not the flags, is why a hand-built wraith got
	 * nothing.
	 *
	 * NOTE: the same undeclared-flag bug remains for OTHER lines and is deliberately not fixed here —
	 * `hasrage`, `hasgnosis`, `hasglamour`, `hasbanality`, `hasfaith`, and every `settings.powers.has*`
	 * (`hasgifts`, `hasarts`, `haspowers`) are all assigned in this file and declared in none. Imported
	 * actors are unaffected because the wodchar exporter writes the correct top-level fields directly;
	 * hand-created ones are not. That is its own change.
	 */
	static async SetWraithAttributes(actor) {
		console.log('WoD | Set Wraith Attributes');

		actor.system.settings.hasarcanoi = true;

		return actor;
	}

	static async SetWraithAttributesv2(updates, actor) {
		console.log('WoD | Set Wraith Attributes');

		updates["system.settings.hasarcanoi"] = true;

		return updates;
	}

	static async SetOrpheusAttributes(actor) {
		console.log('WoD | Set Orpheus Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = false;

		return actor;
	}

	static async SetOrpheusAttributesv2(updates, actor) {
		console.log('WoD | Set Orpheus Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		return updates;
	}

	static async SetSorcererAttributes(actor) {
		console.log('WoD | Set Sorcerer Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = false;
		actor.system.settings.soak.aggravated.isrollable = false;

		return actor;
	}

	static async SetSorcererAttributesv2(updates, actor) {
		console.log('WoD | Set Sorcerer Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = false;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		return updates;
	}

	static async SetMummyAttributes(actor) {
		console.log('WoD | Set Mummy Attributes');

		actor.system.settings.hasbalance = true;
		actor.system.settings.hassekhem = true;
		actor.system.settings.powers.hashekau = true;

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = false;

		return actor;
	}

	static async SetMummyAttributesv2(updates, actor) {
		console.log('WoD | Set Mummy Attributes');

		updates["system.settings.hasbalance"] = true;
		updates["system.settings.hassekhem"] = true;
		updates["system.settings.powers.hashekau"] = true;

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		return updates;
	}

	static async SetExaltedAttributes(actor) {
		console.log('WoD | Set Exalted Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = true;

		

		return actor;
	}

	static async SetExaltedAttributesv2(updates, actor) {
		console.log('WoD | Set Exalted Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = true;
		updates["system.settings.soak.aggravated.isrollable"] = true;

		return updates;
	}

	static async SetCreatureAttributes(actor) {
		console.log('WoD | Set Creature Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = false;
		actor.system.settings.soak.aggravated.isrollable = false;

		actor.system.settings.powers.haspowers = true;

		return actor;
	}

	static async SetCreatureAttributesv2(updates, actor) {
		console.log('WoD | Set Creature Attributes');

		updates["system.settings.soak.bashing.isrollable"] = true;
		updates["system.settings.soak.lethal.isrollable"] = false;
		updates["system.settings.soak.aggravated.isrollable"] = false;

		updates["system.settings.powers.haspowers"] = true;

		return updates;
	}

	static async SetSpiritAttributes(actor) {
		console.log('WoD | Set Spirit Attributes');

		actor.system.settings.soak.bashing.isrollable = true;
		actor.system.settings.soak.lethal.isrollable = true;
		actor.system.settings.soak.aggravated.isrollable = true;
	}

	static async SetChangingVariant(actorData, variant) {
		actorData.system.settings.variant = variant;

		if (actorData.type == CONFIG.worldofdarkness.sheettype.changeling) {
			if ((actorData.system.settings.variant == 'nunnehi') || (actorData.system.settings.variant == 'menehune')) {
				actorData.system.advantages.glamour.label = 'wod.advantages.mana';
			}
			else {
				actorData.system.advantages.glamour.label = 'wod.advantages.glamour';
			}
		}

		return actorData;
	}

	static async SetVampireVariant(actorData, variant) {
		actorData.system.settings.variant = variant;

		if (actorData.system.settings.variant == 'general') {
			actorData.system.settings.hasbloodpool = true;	
			actorData.system.settings.hasvirtue = true;
			actorData.system.settings.haspath = true;
		}
		if (actorData.system.settings.variant == 'kindredeast') {
			actorData.system.settings.hasbloodpool = false;	
			actorData.system.settings.hasvirtue = false;
			actorData.system.settings.haspath = false;
		}

		return actorData;
	}

	static async SetExaltedVariant(actorData, variant) {
		actorData.system.settings.variant = variant;

		return actorData;
	}

	static async SetMortalVariant(actor, actorData, variant) {
		actorData.system.settings.variant = variant;

		actorData.system.settings.haswillpower = true;

		actorData.system.settings.hasrage = false;
		actorData.system.settings.hasgnosis = false;						
		actorData.system.settings.haspath = false;
		actorData.system.settings.hasbloodpool = false;
		actorData.system.settings.hasvirtue = false;
		actorData.system.settings.hasglamour = false;
		actorData.system.settings.hasbanality = false;
		actorData.system.settings.hasnightmare = false;
		actorData.system.settings.hasconviction = false;
		actorData.system.settings.hasfaith = false;
		actorData.system.settings.hastorment = false;
		actorData.system.settings.hasessence = false;
		actorData.system.settings.hasbalance = false;
		actorData.system.settings.hassekhem = false;

		actorData.system.settings.powers.hasdisciplines = false;
		actorData.system.settings.powers.hasgifts = false;
		actorData.system.settings.powers.hasarts = false;
		actorData.system.settings.powers.hasedges = false;
		actorData.system.settings.powers.haslores = false;
		actorData.system.settings.powers.hascharms = false;
		actorData.system.settings.powers.haspowers = false;
		actorData.system.settings.powers.hashekau = false;
		actorData.system.settings.powers.hasnumina = false;		

		actorData.system.settings.powers.hashorrors = false;
		actorData.system.settings.powers.hasstains = false;
		actorData.system.settings.hasvitality = false;
		actorData.system.settings.hasspite = false;

		actorData.system.settings.hasquintessence = false;		

		if (actorData.type == CONFIG.worldofdarkness.sheettype.mortal) {
			actorData.system.settings.variantsheet = "";

			if (variant == 'general') {
			}
			if (variant == 'orpheus') {
				actorData = await this.SetOrpheusAbilities(actorData, actor);
				actorData = await this.SetOrpheusAttributes(actorData);

				actorData.system.settings.hasvitality = true;
				actorData.system.settings.hasspite = true;
				actorData.system.settings.powers.hashorrors = true;
				actorData.system.settings.powers.hasstains = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.wraith;
			}
			if (variant == 'sorcerer') {
				actorData = await this.SetSorcererAbilities(actorData);
				actorData = await this.SetSorcererAttributes(actorData);

				actorData.system.settings.hasquintessence = true;
				actorData.system.settings.powers.hasnumina = true;

				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.mage;
			}
			if (variant == 'autumnpeople') {
				actorData.system.settings.hasbanality = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.changeling;
			}
			if (variant == 'enchanted') {
				actorData.system.settings.hasglamour = true;
				actorData.system.settings.hasbanality = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.changeling;
			}
			if (variant == 'ghoul') {
				actorData.system.settings.haspath = true;
				actorData.system.settings.hasbloodpool = true;
				actorData.system.settings.hasvirtue = true;
				actorData.system.settings.powers.hasdisciplines = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.vampire;
			}
			if (variant == 'kinfolk') {
				actorData.system.settings.hasgnosis = true;
				actorData.system.settings.powers.hasgifts = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'truefaith') {
				actorData.system.settings.hasfaith = true;	
				actorData.system.settings.powers.haspowers = true;			
			}
		}

		return actorData;
	}	

	static async SetCreatureVariant(actorData, variant) {
		actorData.system.settings.variant = variant;

		actorData.system.settings.haswillpower = true;
		actorData.system.settings.soak.bashing.isrollable = true;
		actorData.system.settings.powers.haspowers = true;	
		
		actorData.system.settings.hasrage = false;
		actorData.system.settings.hasgnosis = false;						
		actorData.system.settings.haspath = false;
		actorData.system.settings.hasbloodpool = false;
		actorData.system.settings.hasvirtue = false;
		actorData.system.settings.hasglamour = false;
		actorData.system.settings.hasbanality = false;
		actorData.system.settings.hasnightmare = false;
		actorData.system.settings.hasconviction = false;
		actorData.system.settings.hasfaith = false;
		actorData.system.settings.hastorment = false;
		actorData.system.settings.hasessence = false;
		actorData.system.settings.hasbalance = false;
		actorData.system.settings.hassekhem = false;

		actorData.system.settings.powers.hasdisciplines = false;
		actorData.system.settings.powers.hasgifts = false;
		actorData.system.settings.powers.hasarts = false;
		actorData.system.settings.powers.hasedges = false;
		actorData.system.settings.powers.haslores = false;
		actorData.system.settings.powers.hascharms = false;
		actorData.system.settings.powers.hashekau = false;			

		if (actorData.type == CONFIG.worldofdarkness.sheettype.creature) {
			actorData.system.settings.variantsheet = "";

			if (variant == 'general') {
				
			}
			if (variant == 'chimera') {
				actorData.system.settings.hasglamour = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.changeling;
			}
			if (variant == 'familiar') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;
				actorData.system.settings.hasessence = true;
				actorData.system.settings.powers.hascharms = true;
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.mage;
			}
			if (variant == 'construct') {
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.mage;
			}
			if (variant == 'spirit') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;	
				actorData.system.settings.hasessence = true;
				actorData.system.settings.powers.hasgifts = true;
				actorData.system.settings.powers.hascharms = true;
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
			}
			if (variant == 'warwolves') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'anurana') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;	
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'samsa') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;	
				actorData.system.settings.powers.hasgifts = true;
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'kerasi') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;	
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'yeren') {
				actorData.system.settings.hasrage = true;
				actorData.system.settings.hasgnosis = true;	
				actorData.system.settings.powers.hasgifts = true;
				actorData.system.settings.soak.lethal.isrollable = true;
				actorData.system.settings.soak.aggravated.isrollable = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.werewolf;
			}
			if (variant == 'earthbound') {
				actorData.system.settings.hasfaith = true;
				actorData.system.settings.hastorment = true;
				actorData.system.settings.hasbloodpool = true;
				actorData.system.settings.powers.haslores = true;
				actorData.system.settings.variantsheet = CONFIG.worldofdarkness.sheettype.demon;
			}
		}

		return actorData;
	}

	static async SetVariantItems(actor, variant, version) {
		let itemData;
		let item;

		if (variant == 'warwolves') {
			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.crinos"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power"
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			let id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 4, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);
		}
		if (variant == 'anurana') {
			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.anuran"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			let id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.appearance"), "appearance", -2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.dagon"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);
		}
		if (variant == 'samsa') {
			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.ungeziefer"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			let id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);
		}
		if (variant == 'kerasi') {
			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.bandia"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			let id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.appearance"), "appearance", -2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateSoakBuff(id, game.i18n.localize("wod.labels.bonus.soakbonus"), 1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.kiforu"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 5, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", -1, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 5, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -4, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateSoakBuff(id, game.i18n.localize("wod.labels.bonus.soakbonus"), 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.faru"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					version: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 4, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 4, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);
		}
		if (variant == 'yeren') {
			itemData = {
				name: game.i18n.localize("wod.tab.shapechange") + " - " + game.i18n.localize("wod.shapes.crinos"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.power",
					verison: version
				}
			};

			item = await actor.createEmbeddedDocuments("Item", [itemData]);

			let id = item[0]._id;

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.strength"), "strength", 3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAttributeBuff(id, game.i18n.localize("wod.attributes.bonus.appearance"), "appearance", -3, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);

			itemData = await BonusHelper.CreateAbilityBuff(id, game.i18n.localize("wod.labels.bonus.abilities.athletics"), "athletics", 2, true, version);
			await actor.createEmbeddedDocuments("Item", [itemData]);
		}
	}

	static async CreateShape(actor, version) {
		if (!actor.system.settings.isshapecreated) {
			const itemsArray = [];

			// GLABRO
			itemsArray.push(await BonusHelper.CreateAttributeBuff("glabro", game.i18n.localize("wod.shapes.glabro") + " - " + game.i18n.localize("wod.attributes.bonus.strength"), "strength", 2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("glabro", game.i18n.localize("wod.shapes.glabro") + " - " + game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("glabro", game.i18n.localize("wod.shapes.glabro") + " - " + game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("glabro", game.i18n.localize("wod.shapes.glabro") + " - " + game.i18n.localize("wod.attributes.bonus.appearance"), "appearance", -1, false, version));

			// CRINOS
			itemsArray.push(await BonusHelper.CreateAttributeBuff("crinos", game.i18n.localize("wod.shapes.crinos") + " - " + game.i18n.localize("wod.attributes.bonus.strength"), "strength", 4, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("crinos", game.i18n.localize("wod.shapes.crinos") + " - " + game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("crinos", game.i18n.localize("wod.shapes.crinos") + " - " + game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 1, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("crinos", game.i18n.localize("wod.shapes.crinos") + " - " + game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("crinos", game.i18n.localize("wod.shapes.crinos") + " - " + game.i18n.localize("wod.attributes.fixed.appearance"), "appearance", 0, false, version));

			// HISPO
			itemsArray.push(await BonusHelper.CreateAttributeBuff("hispo", game.i18n.localize("wod.shapes.hispo") + " - " + game.i18n.localize("wod.attributes.bonus.strength"), "strength", 3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("hispo", game.i18n.localize("wod.shapes.hispo") + " - " + game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("hispo", game.i18n.localize("wod.shapes.hispo") + " - " + game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("hispo", game.i18n.localize("wod.shapes.hispo") + " " + game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeDiff("hispo", game.i18n.localize("wod.shapes.hispo") + " - " + game.i18n.localize("wod.attributes.diff.perception"), "perception", -1, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeDiff("hispo", game.i18n.localize("wod.shapes.hispo") + " - " + game.i18n.localize("wod.attributes.diff.wits"), "wits", -1, false, version));

			// LUPUS
			itemsArray.push(await BonusHelper.CreateAttributeBuff("lupus", game.i18n.localize("wod.shapes.lupus") + " - " + game.i18n.localize("wod.attributes.bonus.strength"), "strength", 1, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("lupus", game.i18n.localize("wod.shapes.lupus") + " - " + game.i18n.localize("wod.attributes.bonus.dexterity"), "dexterity", 2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("lupus", game.i18n.localize("wod.shapes.lupus") + " - " + game.i18n.localize("wod.attributes.bonus.stamina"), "stamina", 2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeBuff("lupus", game.i18n.localize("wod.shapes.lupus") + " " + game.i18n.localize("wod.attributes.bonus.manipulation"), "manipulation", -3, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeDiff("lupus", game.i18n.localize("wod.shapes.lupus") + " - " + game.i18n.localize("wod.attributes.diff.perception"), "perception", -2, false, version));
			itemsArray.push(await BonusHelper.CreateAttributeDiff("lupus", game.i18n.localize("wod.shapes.lupus") + " - " + game.i18n.localize("wod.attributes.diff.wits"), "wits", -2, false, version));

			// Update source once with all items
			if (itemsArray.length > 0) {
				await actor.updateSource({ items: itemsArray });
			}
		}
	}

	static async CreateItem(actor, itemData) {
		const createdItem = await actor.createEmbeddedDocuments("Item", [itemData]);
		const item = await actor.getEmbeddedDocument("Item", createdItem[0]._id);
		var _a;

		if (item instanceof Item) {
			_a = item.sheet;

			if ((_a === null) || (_a === void 0)) {
				void 0;
			}                
			else {
				_a.render(true);  
			}
		}
	}

	static CreateItemGear(kind, actor) {
		const configs = {
			treasure: { itemType: "Item", systemType: "wod.types.treasure", iscontainter: false },
			relic: { itemType: "Item", systemType: "wod.types.relic", iscontainter: false },
			device: { itemType: "Item", systemType: "wod.types.device", iscontainter: false },
			talisman: { itemType: "Item", systemType: "wod.types.talisman", iscontainter: false },
			periapt: { itemType: "Item", systemType: "wod.types.periapt", iscontainter: true },
			matrix: { itemType: "Item", systemType: "wod.types.matrix", iscontainter: true },
			trinket: { itemType: "Item", systemType: "wod.types.trinket", iscontainter: false },
			fetish: { itemType: "Fetish", systemType: "wod.types.fetish", iscontainter: false, isrollable: true },
			talen: { itemType: "Fetish", systemType: "wod.types.talen", iscontainter: false, isrollable: true },
		};

		const config = configs[kind];
		if (!config) return undefined;

		const system = {
			level: 1,
			type: config.systemType,
			ismagical: true,
			iscontainter: config.iscontainter,
			era: actor.system.settings.era,
			description: "",
			details: "",
			bonuslist: [],
		};

		if (config.isrollable !== undefined) {
			system.isrollable = config.isrollable;
		}

		return {
			name: game.i18n.localize(`wod.labels.new.${kind}`),
			type: config.itemType,
			system,
		};
	}

	static async CreateItemPower(type, setting) {
		let itemData = undefined;

		type = type.toLowerCase();

		if (type == "gift") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.gift"),
				type: "Power",
				system: {
					level: 1,
					game: "werewolf",
					type: "wod.types.gift"
				}
			};
		}
		if (type == "charm") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.charm"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.charm"
				}
			};
		}
		if (type == "rite") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.rite"),
				type: "Power",
				system: {
					game: "werewolf",
					type: "wod.types.rite"
				}
			};
		}
		if (type == "discipline") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.discipline"),
				type: "Power",
				system: {
					game: "vampire",
					type: "wod.types.discipline"
				}
			};
		}
		if (type == "disciplinepower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.disciplinepower"),
				type: "Power",
				system: {
					level: 1,
					game: "vampire",
					type: "wod.types.disciplinepower"
				}
			};
		}
		if (type == "ritual") { 	
			itemData = {
				name: game.i18n.localize("wod.labels.new.ritual"),
				type: "Power",
				system: {
					level: 1,
					game: setting,
					type: "wod.types.ritual"
				}
			};
		}
		if (type == "combination") {		
			itemData = {
				name: game.i18n.localize("wod.labels.new.combination"),
				type: "Power",
				system: {
					game: setting,
					type: "wod.types.combination"
				}
			};
		}
		if (type == "rote") {
			itemData = {
				name: `${game.i18n.localize("wod.labels.new.rote")}`,
				type: "Rote",
				system: {
					type: "wod.types.rote"
				}
			};
		}
		if (type == "resonance") {
			itemData = {
				name: `${game.i18n.localize("wod.labels.new.resonance")}`,
				type: "Trait",
				system: {
					label: `${game.i18n.localize("wod.labels.new.resonance")}`,
					type: "wod.types.resonance"
				}
			};
		}
		if (type == "edge") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.edge"),
				type: "Power",
				system: {
					game: "hunter",
					type: "wod.types.edge"
				}
			};
		}
		if (type == "edgepower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.edgepower"),
				type: "Power",
				system: {
					level: 1,
					game: "hunter",
					type: "wod.types.edgepower"
				}
			};
		}
		if (type == "lore") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.lore"),
				type: "Power",
				system: {
					game: "demon",
					type: "wod.types.lore"
				}
			};
		}
		if (type == "lorepower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.lorepower"),
				type: "Power",
				system: {
					level: 1,
					game: "demon",
					type: "wod.types.lorepower"
				}
			};
		}
		if (type == "art") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.art"),
				type: "Power",
				system: {
					game: "changeling",
					type: "wod.types.art"
				}
			};
		}
		if (type == "artpower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.artpower"),
				type: "Power",
				system: {
					level: 1,
					game: "changeling",
					property: {
						arttype: ""
					},
					type: "wod.types.artpower",
					isrollable: true,
					difficulty: ""
				}
			};
		}
		if (type == "sliver") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.sliver"),
				type: "Power",
				system: {
					game: "changeling",
					type: "wod.types.art"
				}
			};
		}
		if (type == "arcanoi") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.arcanoi"),
				type: "Power",
				system: {
					game: "wraith",
					type: "wod.types.arcanoi"
				}
			};
		}
		if (type == "arcanoipower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.arcanoipower"),
				type: "Power",
				system: {
					level: 1,
					game: "wraith",
					type: "wod.types.arcanoipower"
				}
			};
		}
		if (type == "stain") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.stain"),
				type: "Power",
				system: {
					game: "orpheus",
					type: "wod.types.stain"
				}
			};
		}
		if (type == "horror") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.horror"),
				type: "Power",
				system: {
					game: "orpheus",
					type: "wod.types.horror"
				}
			};
		}
		if (type == "power") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.power"),
				type: "Power",
				system: {
					type: "wod.types.power"
				}
			};
		}
		if (type == "hekau") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.hekau"),
				type: "Power",
				system: {
					game: "mummy",
					type: "wod.types.hekau"
				}
			};
		}
		if (type == "hekaupower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.hekaupower"),
				type: "Power",
				system: {
					level: 1,
					game: "mummy",
					type: "wod.types.hekaupower"
				}
			};
		}
		if (type == "numina") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.numina"),
				type: "Power",
				system: {
					game: "mage",
					type: "wod.types.numina"
				}
			};
		}
		if (type == "numinapower") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.numinapower"),
				type: "Power",
				system: {
					level: 1,
					game: "mage",
					type: "wod.types.numinapower"
				}
			};
		}
		if (type == "exaltedcharm") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.charm"),
				type: "Power",
				system: {
					level: 1,
					game: "exalted",
					type: "wod.types.exaltedcharm"
				}
			};
		}
		if (type == "exaltedsorcery") {
			itemData = {
				name: game.i18n.localize("wod.labels.new.ancientsorcery"),
				type: "Power",
				system: {
					level: 0,
					game: "exalted",
					type: "wod.types.exaltedsorcery"
				}
			};
		}

		return itemData;
	}

	static async CreateButtonsBio(actor) {
		return {

		}
	}

	static async CreateButtonsCore(actor) {
		return {
			talent: {
				label: game.i18n.localize("wod.types.talentability"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.talent"),
						type: "Ability",
						system: {
							label: game.i18n.localize("wod.labels.new.talent"),
							max: actor.system.settings.abilities.defaultmaxvalue,
							type: "wod.abilities.talent",
							value: 0,
							settings: {
								isvisible: true,
								isremovable: true
							}
						}
					};

					// add-ability-descriptions-from-compendium: a no-op today (this button creates a
					// blank, generically-named Ability the user renames afterward), but harmless and
					// keeps this creation point consistent with every other one - see
					// ability-enrichment.js for why the actual enrichment happens once the ability is
					// named (the item-update hook in wod.js) plus a one-off migration for actors that
					// already had named Abilities before this change.
					await enrichAbilityItemData(actor, itemData);
					await this.CreateItem(actor, itemData);
					return;
				}
			},
			skill: {
				label: game.i18n.localize("wod.types.skillability"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.skill"),
						type: "Ability",
						system: {
							label: game.i18n.localize("wod.labels.new.skill"),
							max: actor.system.settings.abilities.defaultmaxvalue,
							type: "wod.abilities.skill",
							value: 0,
							settings: {
								isvisible: true,
								isremovable: true
							}
						}
					};

					await enrichAbilityItemData(actor, itemData);
					await this.CreateItem(actor, itemData);
					return;
				}
			},
			knowledge: {
				label: game.i18n.localize("wod.types.knowledgeability"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.knowledge"),
						type: "Ability",
						system: {
							label: game.i18n.localize("wod.labels.new.knowledge"),
							max: actor.system.settings.abilities.defaultmaxvalue,
							type: "wod.abilities.knowledge",
							value: 0,
							settings: {
								isvisible: true,
								isremovable: true
							}
						}
					};

					await enrichAbilityItemData(actor, itemData);
					await this.CreateItem(actor, itemData);
					return;
				}
			},
			advantage: {
				label: game.i18n.localize("wod.types.advantage"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.advantage"),
						type: "Advantage",
						system: {
							label: game.i18n.localize("wod.labels.new.advantage"),
							settings: {
								isvisible: true,
								isremovable: true
							}
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},

			/*
			 * The three SECONDARY-ability buttons.
			 *
			 * These mirror the legacy set at mortal-actor-sheet.js:1030-1058 -- the v1 sheets
			 * have had this affordance all along and the v2 PC sheet did not, which is the gap
			 * this closes. They are DELIBERATELY a delegation to AbilityHelper.CreateAbility
			 * rather than a copy of the four buttons above, for three measured reasons:
			 *
			 *  1. A secondary ability is a `Trait`, not an `Ability`. `Ability` has a DataModel
			 *     (CONFIG.Item.dataModels in wod.js) whose flags live NESTED under
			 *     `system.settings`, which is why every button above writes
			 *     `system.settings.isvisible`. `Trait` has no DataModel, so template.json's
			 *     `settings` template is merged FLAT into `system` (system.isvisible,
			 *     system.isremovable, ...). Copy-pasting the talent button and swapping the
			 *     type would therefore invent a `system.settings` object that nothing on a
			 *     Trait ever reads, while the sheet's eye toggle and stats_abilities.hbs go on
			 *     using the flat path -- two carriers for one concept, the exact defect shape
			 *     this change exists to remove. CreateAbility writes no settings at all, so
			 *     template.json's flat defaults apply untouched.
			 *  2. CreateAbility owns the `system.id` sealing for BOTH of its creation branches
			 *     (see its comment): createEmbeddedDocuments() when the actor already exists --
			 *     the only branch a sheet button can reach, since the sheet cannot be rendered
			 *     before then -- and updateSource() during actor creation, which never runs
			 *     WoDItem._preCreate. Creating the item here would have to re-implement that.
			 *  3. It carries the duplicate check (CheckAbilityExists), so pressing one of these
			 *     twice before renaming warns instead of silently producing a second item with
			 *     the same placeholder name and the same derived key.
			 *
			 * The name is the PLACEHOLDER ("New secondary ability") and that is correct:
			 * `autoopen` (the 7th argument, true here exactly as on the legacy sheet) opens the
			 * item sheet so the user renames it at once, and WoDItem._preUpdate then settles the
			 * real key over the placeholder's. Passing a real name here would freeze nothing and
			 * gain nothing -- see AbilityHelper.PLACEHOLDER_SECONDABILITY_IDS for why the
			 * placeholder key must stay overwritable.
			 *
			 * No `classes:` key, unlike the legacy trio: the four buttons above carry none and
			 * Foundry styles this dialog's button row uniformly, so putting `fullSplatColor` on
			 * three of seven would only make the dialog inconsistent with itself.
			 *
			 * Appended AFTER `advantage` on purpose: the object's key order is the button order,
			 * and no existing button should move under a user who has learned where it is.
			 */
			talentsecondary: {
				label: game.i18n.localize("wod.types.talentsecondability"),
				callback: async () => {
					await AbilityHelper.CreateAbility(actor, "wod.types.talentsecondability", game.i18n.localize("wod.labels.new.ability"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, false, true);
					return;
				}
			},
			skillsecondary: {
				label: game.i18n.localize("wod.types.skillsecondability"),
				callback: async () => {
					await AbilityHelper.CreateAbility(actor, "wod.types.skillsecondability", game.i18n.localize("wod.labels.new.ability"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, false, true);
					return;
				}
			},
			knowledgesecondary: {
				label: game.i18n.localize("wod.types.knowledgesecondability"),
				callback: async () => {
					await AbilityHelper.CreateAbility(actor, "wod.types.knowledgesecondability", game.i18n.localize("wod.labels.new.ability"), parseInt(actor.system.settings.abilities.defaultmaxvalue), false, false, true);
					return;
				}
			}
		}
	}

	static async CreateButtonsCombat(actor) {
		return {
			maneuver: {
				label: game.i18n.localize("wod.types.maneuver"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.maneuver"),
						type: "Trait",
						system: {
							type: "wod.types.maneuver",
							isrollable: true,
							difficulty: 6
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			natural: {
				label: game.i18n.localize("wod.types.naturalweapon"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.naturalweapon"),
						type: "Melee Weapon",					
						system: {
							isnatural: true,
							isweapon: true,
							era: actor.system.settings.era
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			melee: {
				label: game.i18n.localize("wod.types.meleeweapon"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.meleeweapon"),
						type: "Melee Weapon",
						system: {
							isnatural: false,
							isweapon: true,
							conceal: "NA",
							era: actor.system.settings.era
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			ranged: {
				label: game.i18n.localize("wod.types.rangedweapon"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.rangedweapon"),
						type: "Ranged Weapon",
						system: {
							isweapon: true,
							conceal: "NA",
							era: actor.system.settings.era
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			armor: {
				label: game.i18n.localize("wod.types.armor"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.armor"),
						type: "Armor",
						system: {
							era: actor.system.settings.era
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			}
		}
	}

	/**
	 * Analyserar en actor och returnerar array med alla spel vars Powers finns på actorn
	 * @param {Actor} actor - PC Actor att analysera
	 * @returns {string[]} Array med game-namn (t.ex. ["werewolf", "mage"])
	 */
	static getActorGames(actor) {
		if (!actor || actor.type !== "PC") {
			return [];
		}
		
		const games = new Set();
		
		// Lägg till actor's huvudspel
		if (actor.system.settings?.game) {
			games.add(actor.system.settings.game);
		}
		
		// Analysera alla Power items på actorn
		const powerItems = actor.items.filter(item => 
			item.type === "Power" && item.system?.game
		);
		
		for (const item of powerItems) {
			if (item.system.game) {
				games.add(item.system.game);
			}
		}
		
		// Analysera Rote items (tillhör mage)
		const roteItems = actor.items.filter(item => 
			item.type === "Rote"
		);
		if (roteItems.length > 0) {
			games.add("mage");
		}
		
		return Array.from(games);
	}

	/**
	 * PC actors with a Faith advantage can add Demon powers (lores, etc.)
	 * @param {Actor} actor
	 * @returns {boolean}
	 */
	static actorHasFaith(actor) {
		if (!actor || actor.type !== "PC") {
			return false;
		}

		return actor.items.some(item =>
			item.type === "Advantage" && item.system?.id === "faith"
		);
	}

	/**
	 * Hämtar lokaliserat label för ett spel
	 * @param {string} gameName - Game-namn (t.ex. "werewolf", "vampire")
	 * @returns {string} Lokaliserat label
	 */
	static getGameLabel(gameName) {
		const gameLabels = {
			werewolf: "wod.games.werewolf",
			vampire: "wod.games.vampire",
			mage: "wod.games.mage",
			changeling: "wod.games.changeling",
			demon: "wod.games.demon",
			hunter: "wod.games.hunter",
			wraith: "wod.games.wraith",
			mummy: "wod.games.mummy",
			exalted: "wod.games.exalted",
			other: "wod.labels.other"
		};
		
		const labelKey = gameLabels[gameName] || "wod.labels.other";
		return game.i18n.localize(labelKey);
	}

	static async CreateButtonsPowerv2(actor) {
		// Hämta vilka spel som är relevanta för denna actor
		const actorGames = this.getActorGames(actor);
		
		// Definiera alla buttons med deras game-tillhörighet
		const allButtons = {
			gift: {
				game: "werewolf",
				button: {
					label: game.i18n.localize("wod.types.gift"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.gift"),
							type: "Power",
							system: {
								game: "werewolf",
								level: 1,
								type: "wod.types.gift"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			rite: {
				game: "werewolf",
				button: {
					label: game.i18n.localize("wod.types.rite"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.rite"),
							type: "Power",
							system: {
								game: "werewolf",
								type: "wod.types.rite"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			discipline: {
				game: "vampire",
				button: {
					label: game.i18n.localize("wod.types.discipline"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.discipline"),
							type: "Power",
							system: {
								game: "vampire",
								type: "wod.types.discipline"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			disciplinepower: {
				game: "vampire",
				button: {
					label: game.i18n.localize("wod.types.disciplinepower"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.disciplinepower"),
							type: "Power",
							system: {
								game: "vampire",
								level: 1,
								type: "wod.types.disciplinepower"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			combination: {
				game: "vampire",
				button: {
					label: game.i18n.localize("wod.types.combination"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.combination"),
							type: "Power",
							system: {
								game: "vampire",
								type: "wod.types.combination"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			ritual: {
				game: "vampire",
				button: {
					label: game.i18n.localize("wod.types.ritual"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.ritual"),
							type: "Power",
							system: {
								game: "vampire",
								level: 1,
								type: "wod.types.ritual"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			numina: {
				game: "mage",
				button: {
					label: game.i18n.localize("wod.types.numina"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.numina"),
							type: "Power",
							system: {
								game: "mage",
								type: "wod.types.numina"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			numinapower: {
				game: "mage",
				button: {
					label: game.i18n.localize("wod.types.numinapower"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.numinapower"),
							type: "Power",
							system: {
								level: 1,
								game: "mage",
								type: "wod.types.numinapower"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			resonance: {
				game: "mage",
				button: {
					label: game.i18n.localize("wod.types.resonance"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.resonance")}`,
							type: "Trait",
							system: {
								label: `${game.i18n.localize("wod.labels.new.resonance")}`,
								type: "wod.types.resonance"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			art: {
				game: "changeling",
				button: {
					label: game.i18n.localize("wod.types.art"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.art"),
							type: "Power",
							system: {
								game: "changeling",
								type: "wod.types.art"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			artpower: {
				game: "changeling",
				button: {
					label: game.i18n.localize("wod.types.artpower"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.artpower"),
							type: "Power",
							system: {
								game: "changeling",
								level: 1,
								type: "wod.types.artpower"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			lore: {
				game: "demon",
				button: {
					label: game.i18n.localize("wod.types.lore"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.lore"),
							type: "Power",
							system: {
								game: "demon",
								type: "wod.types.lore"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			lorepower: {
				game: "demon",
				button: {
					label: game.i18n.localize("wod.types.lorepower"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.lorepower"),
							type: "Power",
							system: {
								game: "demon",
								level: 1,
								type: "wod.types.lorepower"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			demonritual: {
				game: "demon",
				button: {
					label: game.i18n.localize("wod.types.ritual"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.ritual"),
							type: "Power",
							system: {
								game: "demon",
								level: 1,
								type: "wod.types.ritual"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			edge: {
				game: "hunter",
				button: {
					label: game.i18n.localize("wod.types.edge"),
					callback: async () => {
						let itemData = await this.CreateItemPower("edge", "hunter");

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			edgepower: {
				game: "hunter",
				button: {
					label: game.i18n.localize("wod.types.edgepower"),
					callback: async () => {
						let itemData = await this.CreateItemPower("edgepower", "hunter");

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			/*
			 * Arcanoi, the wraith power axis. Container (`wod.types.arcanoi`) + powers
			 * (`wod.types.arcanoipower`), two-level exactly like Disciplines / Arts / Lores / Edges, and
			 * `CreateItemPower` has shipped both shapes since add-wraith-pc-splat.
			 *
			 * They were absent from THIS button set entirely, which is why Arcanoi could not be authored on
			 * this fork's sheet. The Arcanoi buttons that do exist live in the LEGACY `CreateButtonsPower`,
			 * called only by `mortal-actor-sheet.js` (the appv1 sheets, registered for the per-splat Actor
			 * document types) and gated there on `actor.type == sheettype.wraith`, which is false for every
			 * `PC` actor. The PC sheet never reaches that function: `action-helpers.js` routes it here and
			 * only here. So repairing that copy's gate would have changed nothing on this sheet.
			 *
			 * Declared here with the other lines and REMOVED below for non-wraiths, which is the convention
			 * this function already uses for `art`/`lore`/`rote` - not a parallel one.
			 */
			arcanoi: {
				game: "wraith",
				button: {
					label: game.i18n.localize("wod.types.arcanoi"),
					callback: async () => {
						let itemData = await this.CreateItemPower("arcanoi", "wraith");

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			arcanoipower: {
				game: "wraith",
				button: {
					label: game.i18n.localize("wod.types.arcanoipower"),
					callback: async () => {
						let itemData = await this.CreateItemPower("arcanoipower", "wraith");

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			},
			shapeform: {
				game: null, // "other"
				button: {
					label: game.i18n.localize("wod.types.shapeform"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.shapeform"),
							type: "Trait",
							system: {
								label: game.i18n.localize("wod.labels.new.shapeform"),
								iscreated: true,
								level: 0,
								type: "wod.types.shapeform"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			}
		};
		
		// Lägg till rote om actor har spheres
		if (actor.system.settings.hasspheres) {
			allButtons.rote = {
				game: "mage",
				button: {
					label: game.i18n.localize("wod.types.rote"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.rote")}`,
							type: "Rote",
							system: {
								type: "wod.types.rote"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			};
		}

		// Om PC actor inte har realms så skall arts/artspower inte vara tillgängliga eftersom de kräver realms
		if (!actor.system.settings.hasrealms) {
			delete allButtons.art;
			delete allButtons.artpower;
		}

		// Demon powers (lores) kräver Faith-advantage på PC actor
		if (!this.actorHasFaith(actor)) {
			delete allButtons.lore;
			delete allButtons.lorepower;
			delete allButtons.demonritual;
		}

		/*
		 * Arcanoi are wraith-only. THE GATE IS THE SPLAT, the same predicate `CreateButtonsNotev2` uses for
		 * Passions / Dark Passions / Fetters, so the two wraith authoring routes can never disagree about
		 * who is a wraith. `getSplat` resolves variantsheet -> splat -> game -> actor.type, so it covers a
		 * wodchar wraith PC (`variantsheet: "wraith"`), a splat-item wraith (`splat`/`game`) and a legacy
		 * `Wraith` document (`actor.type`) at once, and it refuses a vampire that happens to carry a
		 * wraith-ish `has*` flag. Deliberately NOT `settings.hasarcanoi`: that flag is derived from the
		 * Arcanoi items the actor already holds (`wod-actor-base.js`), so gating creation on it would mean
		 * you can only add an Arcanos to an actor that already has one.
		 *
		 * `variant !== "shadow"` preserves the exclusion the legacy `CreateButtonsPower` has always made,
		 * and it is right by the rules: Arcanoi belong to the Psyche. A `shadow` variant sheet is the
		 * Shadow's half - it keeps its Dark Passions and its Angst and gets no Arcanoi. This narrows the
		 * gate, it never widens it. A wodchar wraith exports `variant: "general"`, so imports are unaffected.
		 */
		if ((getSplat(actor) !== CONFIG.worldofdarkness.splat.wraith) || (actor.system.settings.variant === "shadow")) {
			delete allButtons.arcanoi;
			delete allButtons.arcanoipower;
		}

		// Gruppera buttons efter game
		const categories = {};
		const flatButtons = {};
		
		for (const [key, buttonData] of Object.entries(allButtons)) {
			const game = buttonData.game || "other";
			
			// Skapa kategori om den inte finns
			if (!categories[game]) {
				categories[game] = {
					label: this.getGameLabel(game),
					expanded: actorGames.includes(game),
					buttons: {}
				};
			}
			
			// Lägg till button i kategori
			categories[game].buttons[key] = buttonData.button;
			
			// Lägg till i flatButtons för callback-hantering
			flatButtons[key] = buttonData.button;
		}
		
		// Sortera knappar i varje kategori så att "rote" kommer först i Mage-kategorin
		for (const [game, category] of Object.entries(categories)) {
			if (game === "mage" && category.buttons.rote) {
				const sortedButtons = {};
				// Lägg till rote först
				sortedButtons.rote = category.buttons.rote;
				// Lägg till resten av knapparna
				for (const [key, button] of Object.entries(category.buttons)) {
					if (key !== "rote") {
						sortedButtons[key] = button;
					}
				}
				categories[game].buttons = sortedButtons;
			}
		}
		
		return {
			categories: categories,
			flatButtons: flatButtons
		};
	}

	/* Create the buttons for create Gear Items */
	static async CreateButtonsGear(actor) {
		const kinds = ["treasure", "relic", "device", "talisman", "periapt", "matrix", "trinket", "fetish", "talen"];
		const buttons = {};

		for (const kind of kinds) {
			buttons[kind] = {
				label: game.i18n.localize(`wod.types.${kind}`),
				callback: async () => {
					const itemData = this.CreateItemGear(kind, actor);
					await this.CreateItem(actor, itemData);
				}
			};
		}

		return buttons;
	}

	/* Create the buttons for create Note Items */
	static async CreateButtonsNote(actor) {
		if (actor.type === "PC") {
			return {
				background: {
					label: game.i18n.localize("wod.types.background"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.background"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.background"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				merit: {
					label: game.i18n.localize("wod.types.merit"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.merit"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.merit"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				flaw: {
					label: game.i18n.localize("wod.types.flaw"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.flaw"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.flaw"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				bloodbound: {
					label: game.i18n.localize("wod.types.bloodbound"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.bloodbound"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.bloodbound"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				boon: {
					label: game.i18n.localize("wod.types.boon"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.boon"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.boon"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				oath: {
					label: game.i18n.localize("wod.types.oath"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.oath"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.oath"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				other: {
					label: game.i18n.localize("wod.types.othertraits"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.othertraits"),
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.othertraits"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				addexp: {
					label: game.i18n.localize("wod.labels.add.experience"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.addexp")}`,
							type: "Experience",
							system: {
								amount: 0,
								type: "wod.types.expgained"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				spendexp: {
					label: game.i18n.localize("wod.labels.add.spentexp"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.spentexp")}`,
							type: "Experience",
							system: {
								amount: 0,
								type: "wod.types.expspent"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			}
		}
		else {
			return {
				background: {
					label: game.i18n.localize("wod.types.background"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.background"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.background"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				merit: {
					label: game.i18n.localize("wod.types.merit"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.merit"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.merit"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				flaw: {
					label: game.i18n.localize("wod.types.flaw"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.flaw"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.flaw"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				bloodbound: {
					label: game.i18n.localize("wod.types.bloodbound"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.bloodbound"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.bloodbound"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				boon: {
					label: game.i18n.localize("wod.types.boon"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.boon"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.boon"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				oath: {
					label: game.i18n.localize("wod.types.oath"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.oath"),
							type: "Feature",
							system: {
								level: 1,
								type: "wod.types.oath"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				shapeform: {
					label: game.i18n.localize("wod.types.shapeform"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.shapeform"),
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.shapeform"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				other: {
					label: game.i18n.localize("wod.types.othertraits"),
					callback: async () => {
						let itemData = {
							name: game.i18n.localize("wod.labels.new.othertraits"),
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.othertraits"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				addexp: {
					label: game.i18n.localize("wod.labels.add.experience"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.addexp")}`,
							type: "Experience",
							system: {
								amount: 0,
								type: "wod.types.expgained"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				},
				spendexp: {
					label: game.i18n.localize("wod.labels.add.spentexp"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.spentexp")}`,
							type: "Experience",
							system: {
								amount: 0,
								type: "wod.types.expspent"
							}
						};

						await this.CreateItem(actor, itemData);
						return;
					}
				}
			}
		}
	}

	/* Create the buttons for create Note Items */
	static async CreateButtonsNotev2(actor) {
		const buttons = {
			background: {
				label: game.i18n.localize("wod.types.background"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.background"),
						type: "Feature",
						system: {
							level: 1,
							type: "wod.types.background"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			merit: {
				label: game.i18n.localize("wod.types.merit"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.merit"),
						type: "Feature",
						system: {
							level: 1,
							type: "wod.types.merit"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			flaw: {
				label: game.i18n.localize("wod.types.flaw"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.flaw"),
						type: "Feature",
						system: {
							level: 1,
							type: "wod.types.flaw"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			other: {
				label: game.i18n.localize("wod.types.othertraits"),
				callback: async () => {
					let itemData = {
						name: game.i18n.localize("wod.labels.new.othertraits"),
						type: "Trait",
						system: {
							iscreated: true,
							level: 0,
							type: "wod.types.othertraits"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			addexp: {
				label: game.i18n.localize("wod.labels.add.experience"),
				callback: async () => {
					let itemData = {
						name: `${game.i18n.localize("wod.labels.new.addexp")}`,
						type: "Experience",
						system: {
							amount: 0,
							type: "wod.types.expgained"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			},
			spendexp: {
				label: game.i18n.localize("wod.labels.add.spentexp"),
				callback: async () => {
					let itemData = {
						name: `${game.i18n.localize("wod.labels.new.spentexp")}`,
						type: "Experience",
						system: {
							amount: 0,
							type: "wod.types.expspent"
						}
					};

					await this.CreateItem(actor, itemData);
					return;
				}
			}
		};

		/*
		 * add-pc-sheet-v3 D9b — Blood Bond, Boon and Oath are AUTHORED per line, not offered to everyone.
		 *
		 * They stood unconditionally in this dialog next to Background / Merit / Flaw, so the `+` on the
		 * Features tab offered a mummy a Boon and a mage an Oath. That is a lie about the game, and it is
		 * the same class of defect D9b names for the empty state: a control that offers something the line
		 * does not have. Same gate as the wraith block below — `getSplat(actor)`, the system's own resolver
		 * — so the sheet and the authoring route cannot disagree about who is what.
		 *
		 * THE VARIANTSHEET CHAIN IS WHY THIS IS NOT TOO NARROW, and it is the reason `getSplat` is right
		 * where a bare `settings.splat` test would be wrong. A Blood Bond is a thing a THRALL has, and a
		 * thrall is usually not a vampire; an Oath is sworn by the enchanted as well as by the Kithain. The
		 * system already models exactly that, in `SetMortalVariant`: `ghoul` sets
		 * `variantsheet: "vampire"` (`:927`), `enchanted` and `autumnpeople` set
		 * `variantsheet: "changeling"` (`:915`, `:920`). `getSplat` reads `variantsheet` FIRST, so a ghoul
		 * gets the Blood Bond and Boon buttons and an enchanted mortal gets the Oath button, while a
		 * `general` mortal — which the system's own variant model says is entangled with no line — does
		 * not. If a GM wants a plain mortal bound, the in-system answer is to make them a ghoul.
		 *
		 * THE RENDERING IS DELIBERATELY *NOT* GATED, and this is a decision, not an omission. Every block
		 * on `feature.hbs` is guarded on `length > 0` alone — including Passions and Fetters, which are
		 * wraith-only and are still drawn for anyone holding one (see the comment there, §3.10). Adding a
		 * splat test to those three blocks would change behaviour in exactly one case: an actor of another
		 * line who ALREADY HOLDS a Blood Bond, Boon or Oath. In that case it does not "clean up the sheet",
		 * it hides an item that exists — and the Features tab is where that item's delete button lives, so
		 * hiding it makes it unreachable as well as invisible. In the harmless case (a mummy with no boons)
		 * the block already renders nothing, so the gate would buy nothing. A render gate here can only
		 * ever subtract, never correct: hide the button, show the data.
		 */
		if (getSplat(actor) === CONFIG.worldofdarkness.splat.vampire) {
			for (const kind of ["bloodbound", "boon"]) {
				buttons[kind] = {
					label: game.i18n.localize(`wod.types.${kind}`),
					callback: async () => {
						await this.CreateItem(actor, {
							name: game.i18n.localize(`wod.labels.new.${kind}`),
							type: "Feature",
							system: {
								level: 1,
								type: `wod.types.${kind}`
							}
						});
						return;
					}
				};
			}
		}

		if (getSplat(actor) === CONFIG.worldofdarkness.splat.changeling) {
			buttons.oath = {
				label: game.i18n.localize("wod.types.oath"),
				callback: async () => {
					await this.CreateItem(actor, {
						name: game.i18n.localize("wod.labels.new.oath"),
						type: "Feature",
						system: {
							level: 1,
							type: "wod.types.oath"
						}
					});
					return;
				}
			};
		}

		/*
		 * add-wraith-pc-splat §3.9 (a MISS caught while doing add-contacts-allies-roster) — Passions, Dark
		 * Passions and Fetters had their sheet blocks, their predicates and their i18n, and were NOT offered
		 * by this dialog. So "author a Passion by hand as a GM" was not merely unverified, it was
		 * IMPOSSIBLE: the only creation route the Features tab offers is this button set, and the three
		 * sub-kinds were absent from it.
		 *
		 * THE GATE IS THE SPLAT, NOT `hascorpus`. It was `settings.hascorpus`, and that made FST-4
		 * ("authorable on the sheet by a GM, so the feature is complete from the Foundry side alone and
		 * does not block on the character generator") false: nothing inside Foundry sets `hascorpus` on a
		 * `PC` actor. `SetWraithAttributesv2` does set it, but only from `_preCreate` and only for the
		 * LEGACY `Wraith` Actor document type; the splat-drop path (`DropHelper.DropSplatToActor`) copies
		 * `splat`/`game`/`variant`/`variantsheet` off the splat item and touches no `has*` flag, and the
		 * system ships no Wraith splat item anyway. In practice the only writer was the wodchar exporter -
		 * so the buttons appeared exactly on the actors that least needed them, the imported ones, and
		 * never on an actor a GM built.
		 *
		 * `getSplat(actor)` is the system's own answer to "which splat is this", the same one the PC sheet
		 * uses to pick its icons, its power type and its splat-specific tabs. It resolves
		 * variantsheet -> splat -> game -> actor.type, so it covers BOTH shapes at once: a wodchar wraith
		 * PC (`variantsheet: "wraith"`) and a legacy `Wraith` document (`actor.type`). Neither the
		 * `actor.type == CONFIG.worldofdarkness.sheettype.wraith` test used by `CreateButtonsPower`'s
		 * Arcanoi buttons (false for every `PC` actor) nor a bare `settings.splat` test (empty on a legacy
		 * document) covers both.
		 *
		 * v7.5.28 finished the job: the same predicate now gates the Arcanoi buttons in
		 * `CreateButtonsPowerv2` (the set this fork's sheet actually uses) and the Corpus health track in
		 * `prepareStatContext`, and `settings.hascorpus` — which was only ever a cache of this very
		 * question, filled by one producer outside Foundry — has been deleted along with `haspathos` and
		 * `hasangst`. One predicate, asked in three places, with no flag in between to go unwritten.
		 *
		 * `level: 0`, not 1: these three are DOT-RATED (the Death tab shows `value`/`max` as dots and the
		 * Features tab now reads `value` first), so a hard-coded 1 would be a placeholder point cost on a
		 * trait that has no point cost. Same choice the `connection` button below makes.
		 */
		/*
		 * add-wraith-shadow-budget §3.2 — `thorn` joins the same loop, on the same gate, for the same
		 * reason: a sub-kind a GM cannot create is a sub-kind only the exporter can fill.
		 *
		 * The sub-kind is `wod.types.thorn`, a FEATURE, and NOT Foundry's own `wod.types.sliver`,
		 * which is a POWER sub-kind that `ItemHelper.BuildPowerSections` declares no section for — a
		 * Thorn typed that way is in the database and on no part of the sheet, the measured
		 * `wod.types.specialadvantage` defect. The content settles it independently: all 24 documents
		 * in the shipped `wraith-thorns` pack are `type: "Feature"`, so a Power carrier could never
		 * have received them. Its sheet predicate ships in the same commit (`isThornFeature`,
		 * `pc-actor-sheet.js`) and it renders in the Shadow area on the Features tab.
		 */
		if (getSplat(actor) === CONFIG.worldofdarkness.splat.wraith) {
			for (const kind of ["passion", "darkpassion", "fetter", "thorn"]) {
				buttons[kind] = {
					label: game.i18n.localize(`wod.types.${kind}`),
					callback: async () => {
						await this.CreateItem(actor, {
							name: game.i18n.localize(`wod.labels.new.${kind}`),
							type: "Feature",
							system: {
								level: 0,
								type: `wod.types.${kind}`
							}
						});
						return;
					}
				};
			}
		}

		/*
		 * add-contacts-allies-roster task 3.8 — the roster's creation route. Offered to EVERY line, with no
		 * `settings.game` gate (task 3.9): Contacts, Allies and Mentor are shared Backgrounds, and the other
		 * fifteen people-shaped ones belong to one line or another (design D2). The entry starts with an
		 * empty `relation`, which the sheet groups under a fallback heading until a GM sets it — visible and
		 * editable beats hidden.
		 */
		buttons.connection = {
			label: game.i18n.localize("wod.types.connection"),
			callback: async () => {
				await this.CreateItem(actor, {
					name: game.i18n.localize("wod.labels.new.connection"),
					type: "Feature",
					system: {
						level: 0,
						type: "wod.types.connection",
						relation: "",
						link: "",
						portrait: ""
					}
				});
				return;
			}
		};

		return buttons;
	}

	/* 
		Create the buttons for create Power Items 
		mortal
		vampire
		
	*/
	static async CreateButtonsPower(actor) {
		let buttons = {};		
		let system = actor.type.toLowerCase();

		if (actor.system.settings.variantsheet != "") {
			system = actor.system.settings.variantsheet.toLowerCase();
		}

		if (actor.system.settings.powers.hasgifts) {
			buttons.gift = {
				classes: "button fullSplatColor pointer savebutton",
				label: game.i18n.localize("wod.types.gift"),
				callback: async () => {
					let itemData = await this.CreateItemPower("gift", system);
					await this.CreateItem(actor, itemData);
					return;
				}
			};

			buttons.rite = {
				label: game.i18n.localize("wod.types.rite"),
				callback: async () => {
					let itemData = await this.CreateItemPower("rite", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.system.settings.powers.hasdisciplines) {
			buttons.discipline = {
				label: game.i18n.localize("wod.types.discipline"),
				callback: async () => {
					let itemData = await this.CreateItemPower("discipline", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.disciplinepower = {
				label: game.i18n.localize("wod.types.disciplinepower"),
				callback: async () => {
					let itemData = await this.CreateItemPower("disciplinepower", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.ritual = {
				label: game.i18n.localize("wod.types.ritual"),
				callback: async () => {
					let itemData = await this.CreateItemPower("ritual", CONFIG.worldofdarkness.sheettype.vampire.toLowerCase());

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.combination = {
				label: game.i18n.localize("wod.types.combination"),
				callback: async () => {
					let itemData = await this.CreateItemPower("combination", CONFIG.worldofdarkness.sheettype.vampire.toLowerCase());

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.system.settings.powers.haslores) {
			buttons.lore = {
				label: game.i18n.localize("wod.types.lore"),
				callback: async () => {
					let itemData = await this.CreateItemPower("lore", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.lorepower = {
				label: game.i18n.localize("wod.types.lorepower"),
				callback: async () => {
					let itemData = await this.CreateItemPower("lorepower", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.ritual = {
				label: game.i18n.localize("wod.types.ritual"),
				callback: async () => {
					let itemData = await this.CreateItemPower("ritual", "demon");

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.system.settings.powers.hasedges) {
			buttons.edge = {
				label: game.i18n.localize("wod.types.edge"),
				callback: async () => {
					let itemData = await this.CreateItemPower("edge", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.edgepower = {
				label: game.i18n.localize("wod.types.edgepower"),
				callback: async () => {
					let itemData = await this.CreateItemPower("edgepower", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.system.settings.powers.hashekau) {
			buttons.hekau = {
				label: game.i18n.localize("wod.types.hekau"),
				callback: async () => {
					let itemData = await this.CreateItemPower("hekau", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.hekaupower = {
				label: game.i18n.localize("wod.types.hekaupower"),
				callback: async () => {
					let itemData = await this.CreateItemPower("hekaupower", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if ((actor.system.settings.powers.hashorrors) || (actor.system.settings.powers.hasstains)) {
			if (actor.system.settings.powers.hashorrors) {
				buttons.horror = {
					label: game.i18n.localize("wod.types.horror"),
					callback: async () => {
						let itemData = await this.CreateItemPower("horror", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
			if (actor.system.settings.powers.hasstains) {
				buttons.stain = {
					label: game.i18n.localize("wod.types.stain"),
					callback: async () => {
						let itemData = await this.CreateItemPower("stain", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
		}
		
		if (actor.type == CONFIG.worldofdarkness.sheettype.mage) {
			buttons.rote = {
				label: game.i18n.localize("wod.types.rote"),
				callback: async () => {
					let itemData = await this.CreateItemPower("rote", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.resonance = {
				label: game.i18n.localize("wod.types.resonance"),
				callback: async () => {
					let itemData = await this.CreateItemPower("resonance", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.type == CONFIG.worldofdarkness.sheettype.changeling) {
			if (actor.system.settings.variant != 'inanimae') {
				buttons.art = {
					label: game.i18n.localize("wod.types.art"),
					callback: async () => {
						let itemData = await this.CreateItemPower("art", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
				buttons.artpower = {
					label: game.i18n.localize("wod.types.artpower"),
					callback: async () => {
						let itemData = await this.CreateItemPower("artpower", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
			else {
				buttons.sliver = {
					label: game.i18n.localize("wod.types.sliver"),
					callback: async () => {
						let itemData = await this.CreateItemPower("sliver", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
		}

		if ((actor.type == CONFIG.worldofdarkness.sheettype.demon) || (actor.system.settings.variant === "earthbound")) {
			buttons.apocalypticform = {
				label: game.i18n.localize("wod.types.apocalypticform"),
				callback: async () => {
					let itemData = {
						name: `${game.i18n.localize("wod.labels.new.apocalypticform")}`,
						type: "Trait",
						system: {
							iscreated: true,
							level: 0,
							type: "wod.types.apocalypticform"
						}
					};
					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		/*
		 * NOT the Arcanoi buttons this fork's sheet uses, and not the place to fix them. `actor.type` is
		 * `"PC"` for every actor the PC sheet serves, so this test is false for all of them - and the whole
		 * function is unreachable from that sheet anyway: only `mortal-actor-sheet.js` calls
		 * `CreateButtonsPower`, while `action-helpers.js` routes the PC sheet to `CreateButtonsPowerv2`.
		 * The live Arcanoi buttons are the `game: "wraith"` pair in `CreateButtonsPowerv2`, gated on
		 * `getSplat`. Left as-is: changing it would fix nothing on the PC sheet and could only affect a
		 * legacy per-splat Actor document.
		 */
		if (actor.type == CONFIG.worldofdarkness.sheettype.wraith) {
			if (actor.system.settings.variant != "shadow") {
				buttons.arcanoi = {
					label: game.i18n.localize("wod.types.arcanoi"),
					callback: async () => {
						let itemData = await this.CreateItemPower("arcanoi", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
				buttons.arcanoipower = {
					label: game.i18n.localize("wod.types.arcanoipower"),
					callback: async () => {
						let itemData = await this.CreateItemPower("arcanoipower", system);
	
						await this.CreateItem(actor, itemData);
						return;
					}
				};
				buttons.passion = {
					label: game.i18n.localize("wod.types.passion"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.passion")}`,
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.passion"
							}
						};
						await this.CreateItem(actor, itemData);
						return;
					}
				};
				buttons.fetter = {
					label: game.i18n.localize("wod.types.fetter"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.fetter")}`,
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.fetter"
							}
						};
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
			else {
				buttons.passion = {
					label: game.i18n.localize("wod.types.darkpassion"),
					callback: async () => {
						let itemData = {
							name: `${game.i18n.localize("wod.labels.new.darkpassion")}`,
							type: "Trait",
							system: {
								iscreated: true,
								level: 0,
								type: "wod.types.passion"
							}
						};
						await this.CreateItem(actor, itemData);
						return;
					}
				};
			}
			
		}

		if (actor.type == CONFIG.worldofdarkness.sheettype.exalted) {
			buttons.exaltedcharm = {
				label: game.i18n.localize("wod.types.exaltedcharm"),
				callback: async () => {
					let itemData = await this.CreateItemPower("exaltedcharm", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.exaltedsorcery = {
				label: game.i18n.localize("wod.types.exaltedsorcery"),
				callback: async () => {
					let itemData = await this.CreateItemPower("exaltedsorcery", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		/*
		 * `settings.powers.hasnumina` (nested), NOT `settings.hasnuminas` (flat), and that is correct
		 * here rather than a typo — the two belong to two different actor schemas. This function is the
		 * v1 create path, reached only from `mortal-actor-sheet.js`, i.e. only for the legacy per-splat
		 * Actor types, whose fields come from template.json where the key IS nested. The flat spelling is
		 * declared by the PC DataModel and read by `ItemHelper.BuildPowerSections`. On a PC actor this
		 * expression is `undefined` and inertly false, which is harmless because a PC never reaches this
		 * function. Full reasoning, and why merging them would need a data migration:
		 * `module/actor/datamodel/base/actor_settings.js`, at `hascharms`.
		 */
		if (actor.system.settings.powers.hasnumina) {
			buttons.numina = {
				label: game.i18n.localize("wod.types.numina"),
				callback: async () => {
					let itemData = await this.CreateItemPower("numina", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			buttons.numinapower = {
				label: game.i18n.localize("wod.types.numinapower"),
				callback: async () => {
					let itemData = await this.CreateItemPower("numinapower", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
			
		}

		if (actor.system.settings.powers.hascharms) {
			buttons.charm = {
				label: game.i18n.localize("wod.types.charm"),
				callback: async () => {
					let itemData = await this.CreateItemPower("charm", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if (actor.system.settings.powers.haspowers) {
			buttons.power = {
				label: game.i18n.localize("wod.types.power"),
				callback: async () => {
					let itemData = await this.CreateItemPower("power", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		if ((actor.type == CONFIG.worldofdarkness.sheettype.mortal) && (actor.system.settings.variant == "sorcerer")) {
			buttons.resonance = {
				label: game.i18n.localize("wod.types.resonance"),
				callback: async () => {
					let itemData = await this.CreateItemPower("resonance", system);

					await this.CreateItem(actor, itemData);
					return;
				}
			};
		}

		return buttons;
	}
}