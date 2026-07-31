export default class health extends foundry.abstract.DataModel {
    /* -------------------------------------------- */
    /*  Data Schema                                 */
    /* -------------------------------------------- */  
    /** @inheritDoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        const valueString = {required: true, nullable: false, initial: ""};
        const positiveInteger = {required: true, nullable: false, integer: true, initial: 0, min: 0};
        const healthValue = {required: true, nullable: false, integer: true, initial: 1, min: 0};
        const bonusInteger = {required: true, nullable: false, integer: true, initial: 0};

        return {
            damage: new fields.SchemaField({
                bashing: new fields.NumberField({...positiveInteger}),
                lethal: new fields.NumberField({...positiveInteger}),
                aggravated: new fields.NumberField({...positiveInteger}),
                woundlevel: new fields.StringField({...valueString}),
                woundpenalty: new fields.NumberField({...bonusInteger}),
                chimerical: new fields.SchemaField({
                    bashing: new fields.NumberField({...positiveInteger}),
                    lethal: new fields.NumberField({...positiveInteger}),
                    aggravated: new fields.NumberField({...positiveInteger})
                }),
                // add-wraith-pc-splat §2.2 — Corpus damage, kept SEPARATE from the mortal health levels
                // above and modelled exactly like changeling's `chimerical` triple, which is the existing
                // precedent for "this splat tracks a second, parallel damage track".
                //
                // Corpus is not health: it is a track that PATHOS repairs (1 Pathos = 2 normal Corpus
                // levels; 3 Pathos + eight hours of Sopor = 1 aggravated). `template.json`'s
                // `Actor.templates.wraith` already declared `health.damage.corpus.{bashing,lethal,
                // aggravated}` in exactly this shape — this makes the PC data model carry it too.
                corpus: new fields.SchemaField({
                    bashing: new fields.NumberField({...positiveInteger}),
                    lethal: new fields.NumberField({...positiveInteger}),
                    aggravated: new fields.NumberField({...positiveInteger})
                })
            }),
            bruised: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.bruised"}),
            }),
            hurt: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -1}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.hurt"}),
            }),
            injured: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -1}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.injured"}),
            }),
            wounded: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -2}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.wounded"}),
            }),
            mauled: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -2}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.mauled"}),
            }),
            crippled: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -5}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.crippled"}),
            }),
            incapacitated: new fields.SchemaField({
                value: new fields.NumberField({...healthValue}),
                total: new fields.NumberField({...healthValue}),
                penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: -99}),
                label: new fields.StringField({required: true, nullable: false, initial: "wod.health.incapacitated"}),
            })
        }
    };
}