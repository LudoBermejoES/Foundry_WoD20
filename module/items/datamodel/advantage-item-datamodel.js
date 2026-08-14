import base_settings from "./base/item_base_settings.js";
import { computeAdvantageDerivedData } from "../data/advantage-derivations.js";

/**
 * Data schema, attributes, and methods specific to Actor.
 */
export default class AdvantageDataModel extends foundry.abstract.TypeDataModel {
    /* -------------------------------------------- */
    /*  Data Schema                                 */
    /* -------------------------------------------- */  
    /** @inheritDoc */
    static defineSchema() {
        const schema = {};

        const fields = foundry.data.fields;
        const valueString = {required: true, nullable: false, initial: ""};
        const valueInteger = {required: true, nullable: false, integer: true, initial: 0, min: 0};
        const valueNumber = {required: true, nullable: false, integer: true, initial: 0};
        const valueMax = {required: true, nullable: false, integer: true, initial: 10, min: 0};

        schema.settings = new fields.SchemaField({
            ...base_settings.defineSchema(),
            itemuuid: new fields.StringField({...valueString}),
            usepermanent: new fields.BooleanField({initial: false}),
            usetemporary: new fields.BooleanField({initial: false}),
            useroll: new fields.BooleanField({initial: false}),
            usebothrolls: new fields.BooleanField({initial: false}),
            highertemporary: new fields.BooleanField({initial: false})
        }); 
        
        schema.id = new fields.StringField({...valueString});
        schema.reference = new fields.StringField({...valueString});
        schema.type = new fields.StringField({required: true, nullable: false, initial: "wod.advantages.advantages"});
        schema.group = new fields.StringField({...valueString});
        schema.label = new fields.StringField({...valueString});

        schema.permanent = new fields.NumberField({...valueInteger});
        schema.temporary = new fields.NumberField({...valueInteger});
        schema.max = new fields.NumberField({...valueMax});
        schema.roll = new fields.NumberField({...valueInteger});
        schema.perturn = new fields.NumberField({...valueInteger});
        schema.bearing = new fields.NumberField({...valueNumber});
        schema.bearingtext = new fields.StringField({...valueString});
        schema.imbalance = new fields.NumberField({...valueInteger});
        
        schema.description = new fields.HTMLField();

        return schema;
    }

    static async initialize() {
    }

    static migrateData(source) {
        return super.migrateData(source);
    }

    /**
     * @inheritDoc
     * Called automatically by Foundry as part of the OWNING ITEM's normal
     * data-preparation pass (actor load, sheet render, right after
     * Actor.create()/createEmbeddedDocuments()) -- unlike
     * WoDItem#_handleAdvantagesCalculations (module/items/data/wod-item-base.js),
     * which only ever ran as a side effect of an explicit item .update() call.
     * That gap is the root cause of "the Willpower/Rage/Gnosis/Paradox/Glamour/
     * Blood Pool/virtue roll pool always shows 0 on a freshly created or
     * imported actor, until a GM edits that item's dots once": `roll` was never
     * derived at prepare-time, so the raw stored `0` (every shipped template
     * and the wodchar exporter both initialize `roll: 0`) just sat there.
     *
     * `this` here is the Item's `system` data already (a TypeDataModel
     * instance), not the Item itself -- `this.parent` is the owning Item
     * document, and `this.parent.actor` is the owning Actor for an embedded
     * item (or null/undefined for an unowned one, e.g. a compendium entry).
     */
    prepareDerivedData() {
        super.prepareDerivedData?.();

        let actor = null;

        try {
            actor = this.parent?.actor ?? null;
        }
        catch (err) {
            actor = null;
        }

        try {
            computeAdvantageDerivedData(this, actor);
        }
        catch (err) {
            err.message = `Failed AdvantageDataModel#prepareDerivedData for Item ${this.parent?.name}: ${err.message}`;
            console.error(err);
        }
    }
}