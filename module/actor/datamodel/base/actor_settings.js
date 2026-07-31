export default class settings extends foundry.abstract.DataModel {
    /* -------------------------------------------- */
    /*  Data Schema                                 */
    /* -------------------------------------------- */  
    /** @inheritDoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        const valueString = {required: true, nullable: false, initial: ""};
        const bonusInteger = {required: true, nullable: false, integer: true, initial: 0};

        return {
            iscreated: new fields.BooleanField({initial: false}),
            isupdated: new fields.BooleanField({initial: false}),
            isshapecreated: new fields.BooleanField({initial: false}),

            usechimerical: new fields.BooleanField({initial: false}),
            usesplatfont: new fields.BooleanField({initial: true}),

            haswillpower: new fields.BooleanField({initial: false}),
            hasvirtue: new fields.BooleanField({initial: false}),
            hasrenown: new fields.BooleanField({initial: false}),
            hasquintessence: new fields.BooleanField({initial: false}),
            hasessence: new fields.BooleanField({initial: false}),

            // add-wraith-pc-splat — the three wraith pools. Corpus is deliberately NOT a health track:
            // it is repaired by Pathos (1 Pathos = 2 Corpus levels), which is why `template.json` gives it
            // its own `health.damage.corpus` triple instead of reusing the mortal health levels. Angst is
            // the SHADOW's pool and rises against the player, so the sheet renders it distinctly rather
            // than as a second spendable resource beside Pathos. All three default off, like every flag
            // here, so no existing actor of any other line changes behaviour.
            hascorpus: new fields.BooleanField({initial: false}),
            haspathos: new fields.BooleanField({initial: false}),
            hasangst: new fields.BooleanField({initial: false}),

            hasdisciplines: new fields.BooleanField({initial: false}),
            hascombinationdisciplines: new fields.BooleanField({initial: false}),
            hasrituals: new fields.BooleanField({initial: false}),
            hasgifts: new fields.BooleanField({initial: false}),
            hasrites: new fields.BooleanField({initial: false}),
            hasshapes: new fields.BooleanField({initial: false}),
            hasapocalypticforms: new fields.BooleanField({initial: false}),
            hasspheres: new fields.BooleanField({initial: false}),
            hasrotes: new fields.BooleanField({initial: false}),
            hasresonances: new fields.BooleanField({initial: false}),
            hasnuminas: new fields.BooleanField({initial: false}),
            hasrealms: new fields.BooleanField({initial: false}),
            haslores: new fields.BooleanField({initial: false}),
            hasedges: new fields.BooleanField({initial: false}),
            hascharms: new fields.BooleanField({initial: false}),
            // add-wraith-pc-splat — Arcanoi, the wraith power axis. Two-level like Disciplines: a
            // container (`wod.types.arcanoi`) holding powers (`wod.types.arcanoipower`). Both i18n keys
            // already exist, as does `wod.power.unsortedarcanois`, which is strong evidence this was the
            // original intent.
            hasarcanoi: new fields.BooleanField({initial: false}),

            version: new fields.StringField({...valueString}),
            era: new fields.StringField({initial: 'wod.era.modern', nullable: false}),
            splat: new fields.StringField({...valueString}),
            game: new fields.StringField({...valueString}),
            variant: new fields.StringField({...valueString}),
            variantsheet: new fields.StringField({...valueString}),
            dicesetting: new fields.StringField({...valueString}),

            attributes: new fields.SchemaField({
                defaultmaxvalue: new fields.NumberField({required: true, nullable: false, integer: true, initial: 5})
            }),
            abilities: new fields.SchemaField({
                defaultmaxvalue: new fields.NumberField({required: true, nullable: false, integer: true, initial: 5})
            }),
            powers: new fields.SchemaField({
                defaultmaxvalue: new fields.NumberField({required: true, nullable: false, integer: true, initial: 5})
            }),
            soak: new fields.SchemaField({
                bashing: new fields.SchemaField({
                    bonus: new fields.NumberField({...bonusInteger}),
                    isrollable: new fields.BooleanField({initial: true})
                }),
                lethal: new fields.SchemaField({
                    bonus: new fields.NumberField({...bonusInteger}),
                    isrollable: new fields.BooleanField({initial: true})
                }),
                aggravated: new fields.SchemaField({
                    bonus: new fields.NumberField({...bonusInteger}),
                    isrollable: new fields.BooleanField({initial: true})
                }),
                chimerical: new fields.SchemaField({                    
                    bashing: new fields.SchemaField({
                        bonus: new fields.NumberField({...bonusInteger}),
                        isrollable: new fields.BooleanField({initial: true})
                    }),
                    lethal: new fields.SchemaField({
                        bonus: new fields.NumberField({...bonusInteger}),
                        isrollable: new fields.BooleanField({initial: true})
                    }),
                    aggravated: new fields.SchemaField({
                        bonus: new fields.NumberField({...bonusInteger}),
                        isrollable: new fields.BooleanField({initial: true})
                    })
                })
            })
        }
    };
}