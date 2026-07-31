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
            // `archetype` is an `input` rather than a `select` deliberately: a select needs a `listdata`
            // source registered in SelectHelper, and while a `wraith-shadow-archetypes` compendium pack
            // does ship, wiring a picker to it is out of this change's scope. Same for `thorns`, which has
            // a `wraith-thorns` pack — `template.json` declares it a string, so it is a free-text summary
            // here; promoting either to real Items is a later change, not a silent divergence from the
            // data model.
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
                    type: "input"
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