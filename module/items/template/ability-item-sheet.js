import WoDItemSheetV2 from "./item-sheet-v2.js";
import SelectHelper from "../../scripts/select-helpers.js";
import { OnItemDelete } from "../../scripts/action-helpers.js";



const { HandlebarsApplicationMixin } = foundry.applications.api

/**
 * Extend the base ActorSheetV2 document
 * @extends {WoDItemSheetV2}
 */

export default class AbilityItemSheet extends HandlebarsApplicationMixin(WoDItemSheetV2) {


    static DEFAULT_OPTIONS = {
        position: {
            width: 750,
            height: 850
        },
        actions: {
            itemDelete: OnItemDelete
        }
    }

    static PARTS = {
        header: {
            template: 'systems/worldofdarkness/templates/items/parts/header-sheet.hbs'
        },
        stats: {
            template: 'systems/worldofdarkness/templates/items/ability-sheet.hbs'
        }
    }

    splat = "";

	tabGroups = {
		primary: 'stats'
	}

	tabs = {
		stats: {
			id: 'stats',
			group: 'primary'
		}
	}

    /** @override */
    async _prepareContext(options) {
        const data = await super._prepareContext();
        const item = this.item;
        //const actor = this.item.actor;

        data.listData = SelectHelper.SetupItem(item);
        //data.canEdit = this.item.isOwner || game.user.isGM;	
        data.splat = "";
        data.hasActor = false;

        if (item.actor != null) {
			data.hasActor = true;
			data.actor = item.actor;
            data.splat = item.actor.system.settings.splat;
		}

        data.item = item;

        // console.log(`${data.item.name} - (${data.item.type})`);
        // console.log(data.item);

        return {
            ...data
        }
    }

    async _preparePartContext (partId, context, options) {
        context = { ...(await super._preparePartContext(partId, context, options)) }

        // Top-level variables
        const item = this.item

        // Only load what is neccessary
        switch (partId) {
            case 'stats':
                return prepareStatContext(context, item);
        }

        return context
    }
}

export const prepareStatContext = async function (context, item) {
    context.tab = context.tabs.stats;

    // read-descriptions-from-compendium leaves this EDIT sheet alone on purpose (design.md
    // Decision 2, "the accepted degradation"): an empty box on a compendium-owned Ability with no
    // stored text is correct - the resolved text is one click away on the eye (item-viewer.js) -
    // and filling it here would recreate the exact copy-forward this change removes the moment the
    // sheet is saved. `WoDItemSheetV2.onSubmitItemForm` is where the one addition this sheet does
    // get lives: stamping a local-override flag when a user's edit changes this field.
    context.description = item.system.description;
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {async: true});

    return context
}