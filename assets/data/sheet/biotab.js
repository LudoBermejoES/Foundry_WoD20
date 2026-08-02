export const databiotab = {
    bio: {
        modern: {
            mortal: {},
            vampire: {
                sect: {
                    label: "wod.bio.vampire.sect",
                    value: "",
                    type: "input"
                },
                clan: {
                    label: "wod.bio.vampire.clan",
                    value: "",
                    type: "input"
                },
                bloodline: {
                    label: "wod.bio.vampire.bloodline",
                    value: "",
                    type: "input"
                },
                weakness: {
                    label: "wod.bio.vampire.weakness",
                    value: "",
                    type: "input"
                },
                sire: {
                    label: "wod.bio.vampire.sire",
                    value: "",
                    type: "input"
                },
                generation: {
                    label: "wod.bio.vampire.generation",
                    value: 13,
                    mod: 0,
                    type: "select",                
                    listdata: "Generation"
                }
            },
            werewolf: {
                breed: {
                    label: "wod.bio.breed",
                    value: "",
                    type: "select",
                    listdata: "BreedListv2"
                },
                auspice: {
                    label: "wod.bio.auspice",
                    value: "",
                    type: "select",
                    listdata: "AuspiceListv2"
                },
                tribe: {
                    label: "wod.bio.tribe",
                    value: "",
                    type: "input"
                },
                pack: {
                    label: "wod.bio.packname",
                    value: "",
                    type: "input"
                },
                totem: {
                    label: "wod.bio.packtotem",
                    value: "",
                    type: "input"
                }
            },
            mage: {
                affiliation: {
                    label: "wod.bio.mage.affiliation",
                    value: "",
                    type: "input"
                },
                sect: {
                    label: "wod.bio.mage.sect",
                    value: "",
                    type: "input"
                },
                affinity: {
                    label: "wod.bio.mage.affinitysphere",
                    value: "",
                    type: "select",
                    listdata: "SphereList"
                },
                essence: {
                    label: "wod.bio.mage.essence",
                    value: "",
                    type: "input"
                },
                paradigm: {
                    label: "wod.spheres.paradigm",
                    value: "",
                    type: "textbox" 
                },
                practice: {
                    label: "wod.spheres.practice",
                    value: "",
                    type: "textbox"
                },
                instruments: {
                    label: "wod.spheres.instruments",
                    value: "",
                    type: "textbox"
                }
            },
            // add-wraith-pc-splat §2.3 — the seven wraith identity fields, matching `template.json`'s
            // `Actor.templates.wraith` exactly (shadow, life, death, regret, psyche, archetype, thorns).
            // Every label key already exists in ALL SEVEN language files, so no i18n was added.
            //
            // Types follow what the trait IS, not a default: Psyche and Shadow are named archetypes
            // (one line), Life/Death/Regret are the wraith's story (Death in particular is the defining
            // one — the v1 sheet gave it its own `parts/wraith/death.html`), and Thorns is a list.
            //
            // add-wraith-shadow-budget §3.1 — `archetype` is now a PICK against the twelve
            // `shadow-archetype` documents the `wraith-shadow-archetypes` pack ships. The comment that
            // stood here said the wiring was out of scope; `SelectHelper.GetWraithShadowArchetypeList`
            // (module/scripts/select/wraith.js) is that wiring, so the comment is gone rather than
            // stale.
            //
            // NO MIGRATION IS NEEDED for a wraith authored before this change, and that is a property
            // of the list rather than luck. Two mechanisms hold it up: the list ADDS the actor's own
            // stored value as an option when the catalog does not contain it, so an old free-text
            // Archetype stays selected and survives the next save; and the locked branch of
            // `bio_splatfields.hbs` prints through `lookupListData`, whose documented fallback is to
            // return the raw value. Both are asserted offline in the change's harness.
            //
            // THIS MAP IS ONLY A SEED. The sheet renders `actor.system.bio.splatfields` — per-actor
            // DATA, written once by the wodchar exporter or by `DropHelper.PopulateBio` — not this
            // declaration, so changing a `type` here does NOT reach an existing actor. What reaches
            // them is `applyDeclaredSplatfieldTypes` in `pc-actor-sheet.js`, which promotes a stored
            // `input` to the `select` declared here at render time.
            //
            // `thorns` STAYS a textbox on purpose. It is no longer where a wraith's Thorns live —
            // they are `Feature` items in the Shadow area on the Features tab — but the string is
            // still what every wraith authored before this change holds, and dropping the field would
            // strand it. The Shadow area surfaces its value under a "legacy" label so a GM can read it
            // and retype it as items at leisure.
            wraith: {
                psyche: {
                    label: "wod.bio.wraith.psyche",
                    value: "",
                    type: "input"
                },
                shadow: {
                    label: "wod.bio.wraith.shadow",
                    value: "",
                    type: "input"
                },
                archetype: {
                    label: "wod.bio.wraith.archetype",
                    value: "",
                    type: "select",
                    listdata: "ShadowArchetypeList"
                },
                life: {
                    label: "wod.bio.wraith.life",
                    value: "",
                    type: "textbox"
                },
                death: {
                    label: "wod.bio.wraith.death",
                    value: "",
                    type: "textbox"
                },
                regret: {
                    label: "wod.bio.wraith.regret",
                    value: "",
                    type: "textbox"
                },
                thorns: {
                    label: "wod.bio.wraith.thorns",
                    value: "",
                    type: "textbox"
                }
            },
            kindredeast: {
                balance: {
                    label: "wod.bio.vampire.balance",
                    value: "",
                    type: "input"
                },
                ponature: {
                    label: "wod.bio.vampire.ponature",
                    value: "",
                    type: "input"
                },
                direction: {
                    label: "wod.bio.vampire.direction",
                    value: "",
                    type: "input"
                },
                wu: {
                    label: "wod.bio.vampire.wu",
                    value: "",
                    type: "input"
                }
            },
            restlessage: {
                dharma: {
                    label: "wod.advantages.dharma",
                    value: "",
                    type: "input"
                },
                destiny: {
                    label: "wod.bio.vampire.destiny",
                    value: "",
                    type: "input"
                }
            }
        }  
    }      
}