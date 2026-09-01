import attributes from "./base/actor_attributes.js";
import settings from "./base/actor_settings.js";
import traits from "./base/actor_traits.js";
import health from "./base/actor_health.js";
// add-paradox-system §5.4.3 — the only piece of `paradox-helpers.js` this schema needs: the
// canonical Defecto de Paradoja grade list, imported (never redefined) so the schema field below
// and `paradox-card.js`'s write path can never disagree on what a valid grade is.
import { DEFECT_DEGREES } from "../../scripts/paradox-helpers.js";

export default class PCDataModel extends foundry.abstract.DataModel {
    static defineSchema() {
        const schema = {};
        const fields = foundry.data.fields;
        const valueInteger = {required: true, nullable: false, integer: true, initial: 0, min: 0};
        const valueNumber = {required: true, nullable: false, integer: true, initial: 0};
        const valueString = {required: true, nullable: false, initial: ""};

        // Same as before
        schema.settings = new fields.SchemaField({
            ...settings.defineSchema()
        });

        // Same as before
        schema.traits = new fields.SchemaField({
            ...traits.defineSchema()
        });

        // The general fields all sheets have
        schema.bio  = new fields.SchemaField({
            worldanvil: new fields.StringField({...valueString}),
            name: new fields.StringField({...valueString}),
            nature: new fields.StringField({...valueString}),
            demeanor: new fields.StringField({...valueString}),
            derangement: new fields.StringField({...valueString}),
            concept: new fields.StringField({...valueString}),
            splatfields: new fields.ObjectField({
                initial: {},
                nullable: false,
            }),
            appearance: new fields.HTMLField(),
            background: new fields.HTMLField(),
            notes: new fields.HTMLField(),
            roleplaytip: new fields.HTMLField()            
        });            

        // Same as before
        schema.attributes = new fields.SchemaField({
            ...attributes.defineSchema()
        }); 

        // Same as before
        schema.soak = new fields.SchemaField({
            bashing:  new fields.NumberField({...valueInteger}),
            lethal:  new fields.NumberField({...valueInteger}),
            aggravated:  new fields.NumberField({...valueInteger}),
            chimerical: new fields.SchemaField({
                bashing:    new fields.NumberField({...valueInteger}),
                lethal:     new fields.NumberField({...valueInteger}),
                aggravated: new fields.NumberField({...valueInteger})
            })
        });

        // Same as before
        schema.health = new fields.SchemaField({
            ...health.defineSchema()
        });

        // apply-armor-dexterity-penalty §8.4.5 — `valueInteger` carries `min: 0`, which Foundry's
        // NumberField enforces at `_cast`/`clean()` time regardless of what `totals.js` computes:
        // measured live, `actor.update({'system.initiative.base': -5, ...})` persisted as `0`, while
        // the identical update with `+5` persisted as `5`, and the SAME actor's
        // `attributes.dexterity.total` (below, in `base/actor_attributes.js`, no `min` on `total`)
        // held a negative value on the same object. `design.md` D4 states the premise this schema
        // silently broke for Initiative alone: "Foundry no acota" — a floor here is not a rule this
        // system declares anywhere (no book text, no NumberField elsewhere in this file gates
        // `total`), just the accidental side effect of reusing `valueInteger` for a field that CAN
        // legitimately go negative once Destreza + Wits does. `valueNumber` (below) is this same
        // file's own established vocabulary for "integer, no floor" (already used by Quintessence's
        // `carried`/`bank`). D4 also forbids clamping in `totals.js` itself, precisely so a positive-
        // sign bug in source data stays visible — this fix removes an UNINTENTIONAL floor at the
        // schema layer, it does not add one anywhere.
        schema.initiative = new fields.SchemaField({
            base:  new fields.NumberField({...valueNumber}),
            bonus:  new fields.NumberField({...valueNumber}),
            total:  new fields.NumberField({...valueNumber})
        });

        // Same as before
        schema.conditions = new fields.SchemaField({
            isignoringpain: new fields.BooleanField({initial: false}),
            isstunned: new fields.BooleanField({initial: false}),
            isfrenzy: new fields.BooleanField({initial: false})
        });

        // changed
        schema.movement = new fields.SchemaField({
            walk: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: true})
            }),  
            jog: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: true})
            }),
            run: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: true})
            }),
            fly: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: false})
            }),
            vjump: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: true})
            }),
            hjump: new fields.SchemaField({
                value: new fields.NumberField({...valueInteger}),
                isactive: new fields.BooleanField({initial: true})
            })
        });

        // changed
        schema.gear  = new fields.SchemaField({
            notes: new fields.HTMLField(),
            money: new fields.SchemaField({
                carried: new fields.NumberField({...valueNumber}),
                bank: new fields.NumberField({...valueNumber})
            })
        });        

        schema.favoriterolls = new fields.ArrayField(
            new fields.ObjectField({
                initial: {},
                nullable: false,
        }));

        // add-prism-of-focus-foundry §4.2 / design.md D9 — the seven creation-trait fields for the
        // six Prácticas that ask for one, named EXACTLY as `add-prism-of-focus-wodchar` exports them
        // so no renaming step is needed at import. A sibling of `settings`, not per-item fields on
        // the Practice item itself (storage is per-actor; DISPLAY is gated per-Práctica, see the
        // `prism_practices.hbs` partial). All default to empty/null so an actor that never sets
        // `hasprismoffocus` is entirely unaffected (Migration Plan).
        schema.practiceTraits = new fields.SchemaField({
            heartBeast: new fields.StringField({...valueString}),                 // Animalismo
            primaryElement: new fields.StringField({...valueString}),             // Elementalismo
            godBondingDomains: new fields.ArrayField(new fields.SchemaField({      // Vínculo divino
                domain: new fields.StringField({...valueString}),
                areteThreshold: new fields.NumberField({required: true, nullable: false, integer: true, initial: 1})
            })),
            godBondingVulnerability: new fields.StringField({...valueString}),     // Vínculo divino
            mediumshipUmbra: new fields.StringField({...valueString}),            // Mediumnidad
            shamanismEnvironment: new fields.StringField({...valueString}),       // Chamanismo
            witchcraftCycle: new fields.StringField({...valueString})             // Brujería
        });

        // add-paradox-system §5.4.3 — Silencio and Defecto de Paradoja lived in
        // `actor.flags.worldofdarkness.paradoxSilence` / `paradoxDefect` because no schema field
        // existed for either. Both are now schema fields, siblings of `practiceTraits` above, so
        // this state travels in a clean export and is visible to any future validator — following
        // exactly that field's own precedent: a new SchemaField sibling with every default
        // empty/null/zero, so an actor that never suffers a contragolpe is entirely unaffected.
        schema.paradoxSilence = new fields.SchemaField({
            level: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0, min: 0, max: 6}),
            // Canonical values are "", "negation", "madness", "morbidity" — see `SILENCE_TYPES` in
            // `paradox-card.js` and the `wod.paradox.card.silence*` i18n keys. Left as a plain
            // string with no schema-level `choices`, matching every other controlled-vocabulary
            // string on this model (`splat`, `variant`, `dicesetting`, …) — none of them enforce
            // their vocabulary at the schema level either, and the actual UI-facing constant lives
            // in a script, not in the Foundry-free `paradox-helpers.js` this DataModel otherwise
            // depends on.
            type: new fields.StringField({...valueString})
        });

        schema.paradoxDefect = new fields.SchemaField({
            // The grade IS mechanical (spec M7); the values come from `DEFECT_DEGREES` above —
            // `choices` enforces that this field can never silently drift into a second, parallel
            // list.
            degree: new fields.StringField({required: true, nullable: false, initial: "none", choices: DEFECT_DEGREES}),
            // The spec forbids inventing a catalogue of named Defectos: only the grade is
            // mechanical, so the concrete Defecto is free text left to the table.
            description: new fields.StringField({...valueString})
        });

        return schema;
    }

    static async initialize() {
    }

    static migrateData(source) {
        if (source?.soak && source.soak.chimerical === undefined) {
            source.soak.chimerical = { bashing: 0, lethal: 0, aggravated: 0 };
        }
        if (source?.health?.damage && source.health.damage.chimerical === undefined) {
            source.health.damage.chimerical = { bashing: 0, lethal: 0, aggravated: 0 };
        }
        // add-wraith-pc-splat §2.2 — same shim as `chimerical` above, for every PC that predates the
        // Corpus track. Applies to actors of EVERY line, not just wraiths: the field is on the shared
        // health schema, so an existing mage/vampire/werewolf must migrate cleanly too (§2.5).
        if (source?.health?.damage && source.health.damage.corpus === undefined) {
            source.health.damage.corpus = { bashing: 0, lethal: 0, aggravated: 0 };
        }
        return super.migrateData(source);
    }
}