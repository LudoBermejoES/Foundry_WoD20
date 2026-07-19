import ActionHelper from "../../scripts/action-helpers.js";
import BonusHelper from "../../scripts/bonus-helpers.js";
import { ActionEdit } from "../../scripts/item-actions.js";
import { ActionRemove } from "../../scripts/item-actions.js";
import { ActionSwitch } from "../../scripts/item-actions.js";
import DropHelper from "../../scripts/drop-helpers.js";

const { HandlebarsApplicationMixin } = foundry.applications.api

/**
 * Extend the base ActorSheetV2 document
 * @extends {foundry.applications.sheets.ItemSheetV2}
 */

export default class WoDItemSheetV2 extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {

    constructor(actor, options) {
		super(actor, options);

		this.isGM = game.user.isGM;	
        this.locked = false;
		this.isCharacter = false;
		this.game = game;
        //this.canEdit = this.isEditable;

        this.#dragDrop = this.#createDragDropHandlers();
	}

    get title() {
		return this.item.name;
	}

    static DEFAULT_OPTIONS = {
        form: {
            submitOnChange: true,
            handler:  WoDItemSheetV2.onSubmitItemForm
        },
        classes: ["wod20", "wod-item"],
        window: {
            icon: 'fa-solid fa-dice-d10',
            resizable: true
        },
        position: {},
        actions: {
            actionEdit: ActionEdit,
            actionRemove: ActionRemove,
            actionSwitch: ActionSwitch
        },
        dragDrop: [
            {
                dragSelector: '[data-drag]',
                dropSelector: '[data-drop-area]'
            },
            {
                dragSelector: null,
                dropSelector: null
            }
        ]
    }

    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                dragstart: this._canDragStart.bind(this),
                drop: this._canDragDrop.bind(this)
            };

            d.callbacks = {
                dragstart: this._onDragStart.bind(this),
                dragover: this._onDragOver.bind(this),
                drop: this._onDrop.bind(this)
            };
            return new foundry.applications.ux.DragDrop.implementation(d);
        });
    }

    splat = "";

    tabGroups = {}

	tabs = {}

    getTabs() {
        const tabs = this.tabs

        for (const tab of Object.values(tabs)) {
            tab.active = this.tabGroups[tab.group] === tab.id
            tab.cssClass = tab.active ? 'itemv2 item active' : 'itemv2 item';
        }

        return tabs
    }

    async _prepareContext () {
        const data = await super._prepareContext();

        // Add the tabs
        data.tabs = this.getTabs();
        data.config = CONFIG.worldofdarkness;	
        data.worldofdarkness = game.worldofdarkness;	
        data.userpermissions = ActionHelper._getUserPermissions(game.user);

        data.locked = this.locked;
        data.isCharacter = this.isCharacter;
        data.isGM = this.isGM;     

        console.log(`${this.item.name} - (${this.item.type}`);
		console.log(this.item);

        return {
            ...data
        }
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#dragDrop.forEach((d) => d.bind(this.element));
    }

    static async onSubmitItemForm (event, form, formData) {
		const target = event.target;
		
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			if (!target.name) {
				return;
			}

			let value

			// Handle numbers and strings properly
			if (target.type === 'number') {
				value = parseInt(target.value)
			} else if (target.type === 'checkbox') {
				value = target.checked
				
				// If this is the istechnocracy checkbox, update the sphere label
				if (target.name === 'system.settings.istechnocracy') {
					const sphere = this.item.system.id;
					const istechnocracy = value;
                    
                    let label = this.setSphereName(sphere, istechnocracy);
                    if (label === "") {
                        label = this.item.system.label;
                    }
					
					// Update both the checkbox value and the label
					await this.item.update({
						[`${target.name}`]: value,
						'system.label': label
					});
					return;
				}
			} else {
				value = target.value
			}

			// Make the update for the field
			await this.item.update({
				[`${target.name}`]: value
			})
		} else {
			// Process submit data
			const submitData = this._prepareSubmitData(event, form, formData)

			const submitDataFlat = foundry.utils.flattenObject(submitData)
			const updatedData = {
				[target.name]: submitDataFlat[target.name]
			}
			const expandedData = foundry.utils.expandObject(updatedData)

			// Update the item data
			await this.item.update(expandedData)
		}
	}

    #dragDrop

    _canDragStart() {
        return this.isEditable;
    }

    _canDragDrop() {
        return this.isEditable;
    }

    _onDragStart(event) {
        const dataset =
            event.target.closest("[data-drag]")?.dataset ?? event.currentTarget?.dataset ?? event.target.dataset;

        const data = {
            documentid: dataset.documentid,
            itemid: dataset.itemid,
            field: dataset.field,
            list: dataset.list,
            type: "Sort"
        }

        //console.log(data);

        event.dataTransfer.setData('text/plain', JSON.stringify(data))
    }

    _onDragOver() { }

    async _onDrop(event) {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

        if (data.type === "Item" || (typeof data.uuid === "string" && (data.uuid.startsWith("Item.") || data.uuid.startsWith("Compendium.")))) {
            if (data.type !== "Item") {
                data.type = "Item";
            }
            return this._onDropItem(event, data);
        }

        switch (data.type) {
            case 'Sort':
                return this._onSortingItem(event, data);
        }
    }

    // Handling of Ability drag/drop
    async _onSortingItem(event, data) {
        const item = this.item;
        if (data.documentid !== item._id) return;
        if (typeof data.field !== "string" || typeof data.list !== "string") return;

        const fields = data.field.split(".");
        const datalist = data.list.split(".");

        const dropTarget = event.target.closest('[data-droparea]');
        const newData = dropTarget.dataset.droparea;

        const itemData = foundry.utils.duplicate(this.item);

        // Hämta listan dynamiskt
        const list = getNestedProperty(itemData, datalist);

        const index = list.findIndex(obj => obj._id === data.itemid);
        if (index === -1) return;

        // Sätt värdet dynamiskt i objektet i listan
        setNestedProperty(list[index], fields, newData);

        await this.item.update(itemData);
        this.render();
    }

    async _onDropItem(event, data) {
        const droppedItem = await Item.implementation.fromDropData(data);
        const handled = await BonusHelper.handleBonusDropOnItem(this.item, droppedItem);

        if (handled !== null) {
            if (handled) {
                this.render();
            }
            return handled;
        }

        return false;
    }

    setSphereName(sphere, istechnocracy) {
        let label = "";

        switch(sphere) {
            case "correspondence":
                label = "wod.spheres.correspondence";
                break;
            case "entropy":
                label = "wod.spheres.entropy";
                break;
            case "forces":
                label = "wod.spheres.forces";
                break;
            case "life":
                label = "wod.spheres.life";
                break;
            case "matter":
                label = "wod.spheres.matter";
                break;
            case "mind":
                label = "wod.spheres.mind";
                break;
            case "prime":
                label = "wod.spheres.prime";
                break;
            case "spirit":
                label = "wod.spheres.spirit";
                break;
            case "time":
                label = "wod.spheres.time";
                break;
            default:
                break;
        }

        if (istechnocracy) {
            switch(sphere) {
                case "correspondence":
                    label = "wod.spheres.data";
                    break;
                case "entropy":
                    label = "wod.spheres.entropicstate";
                    break;
                case "forces":
                    label = "wod.spheres.forcebased";
                    break;
                case "life":
                    label = "wod.spheres.lifescience";
                    break;
                case "matter":
                    label = "wod.spheres.material";
                    break;
                case "mind":
                    label = "wod.spheres.psychodynamics";
                    break;
                case "prime":
                    label = "wod.spheres.primal";
                    break;
                case "spirit":
                    label = "wod.spheres.dimensional";
                    break;
                case "time":
                    label = "wod.spheres.temporalscience";
                    break;
                default:
                    break;
            }
        }

        return label;
    }
}

function getNestedProperty(obj, path) {
    return path.reduce((acc, key) => acc?.[key], obj);
}


function setNestedProperty(obj, path, value) {
    let target = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in target)) target[path[i]] = {};
        target = target[path[i]];
    }
    target[path[path.length - 1]] = value;
}
