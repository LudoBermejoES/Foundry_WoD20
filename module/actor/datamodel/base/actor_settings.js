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

            // add-wraith-pc-splat declared `hascorpus`, `haspathos` and `hasangst` here. All three are
            // GONE, and nothing replaced them:
            //
            //   * `haspathos` and `hasangst` were read by NOTHING, in this repo, ever — verified by an
            //     unbounded search of the whole system. They could not acquire a reader either: on the PC
            //     sheet Pathos and Angst are ordinary `Advantage` items, rendered by the generic advantage
            //     machinery in `prepareStatContext` (`context.advantages` / `context.groupedadvantages`),
            //     which asks no capability flag of any pool. A declared flag no view consults is a promise
            //     the schema makes and the sheet ignores, and it is exactly what let `hascorpus` pass for a
            //     working gate for months.
            //   * `hascorpus` had one reader, the Corpus health track in `prepareStatContext`, and that now
            //     asks `getSplat(actor) === CONFIG.worldofdarkness.splat.wraith` instead. The flag never
            //     held a fact the splat did not: its only real writer, the wodchar exporter, computed it as
            //     `line === "wraith"`, and nothing inside Foundry wrote it onto a `PC` actor at all.
            //
            // The wraith flag that SURVIVES is `hasarcanoi`, below, because it is the one that means
            // something the splat does not — and it is now derived from the actor's items rather than
            // authored once. Note for anyone re-adding one of these: the wodchar exporter still sends all
            // four keys. Three of them are now silently dropped by this DataModel, which is harmless
            // because nothing reads them; the exporter is the place to stop sending them, not here.

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
            //
            // DERIVED, not authored: `_prepareCharacterData` recomputes it from the actor's items on every
            // prepare, next to `hasdisciplines`/`hasgifts`/`hasspheres` and the ten others. A stored value
            // is still accepted (imports send one) but is overwritten before anything reads it.
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