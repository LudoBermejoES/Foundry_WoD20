/* CI-preflight followup, 2026-09-08 (run 34241724870) — add-book-of-chantries-traits §5.1/5.2 shipped
 * the six named-level construction Traits (`guardian`, `fortification`, `wards`, `trap-system`,
 * `alarm-system`, `research-library`) declared on `template.json`'s `Actor.Chantry.traits` but priced
 * nowhere in `CONFIG.worldofdarkness.chantry.traitcost` — `test-part-render.mjs`'s own declared===
 * priced invariant (added by `add-chantry-inventory-effects-and-roster`, for exactly this defect
 * class) caught it. `BOOK_OF_CHANTRIES_LEVEL_COSTS`/`BOOK_OF_CHANTRIES_TRAIT_KEYS` stay the single
 * source of truth in `chantry-effects.js`; imported here only to WIDEN `traitcost`'s own key set to
 * match, not to duplicate the tables.
 *
 * rebuild-chantry-book-of-chantries-only (2026-09-08) — the Dossier's 19 linear Traits (`allies`
 * through `patron`) are RETIRED outright (proposal.md/design.md D1): no equivalent in El Libro de
 * las Capillas, and the one exception of NAME (`node`) is a different economy entirely, rebuilt from
 * scratch in the Realm+Node block instead. `BOOK_OF_CHANTRIES_TRAIT_KEYS` now carries a SEVENTH key,
 * `laboratories` (design.md D6) — still the same single source of truth, still imported rather than
 * duplicated. */
import { BOOK_OF_CHANTRIES_LEVEL_COSTS, BOOK_OF_CHANTRIES_TRAIT_KEYS } from "./scripts/chantry-effects.js";

export const wod = {};

wod.sheettype = {
    mortal: "Mortal",
    werewolf: "Werewolf",
    mage: "Mage",
    vampire: "Vampire",
    changeling: "Changeling",
    hunter: "Hunter",
    demon: "Demon",
    wraith: "Wraith",
    mummy: "Mummy",
    exalted: "Exalted",
    creature: "Creature",
    changingbreed: "Changing Breed",
    spirit: "Spirit",
    chantry: "Chantry"
}

/*
 * Chantry/Construct construction Traits - Power Pool Cost per dot.
 *
 * rebuild-chantry-book-of-chantries-only (2026-09-08) retires the Dossier's 19 linear Traits and
 * the five M20-core Backgrounds a Chantry used to be able to add (proposal.md/design.md D1): no
 * equivalent in El Libro de las Capillas, and the exception of NAME (`node`) is rebuilt from
 * scratch in the Realm+Node block, not migrated. What is left is the book's own SEVEN Traits, every
 * one priced by a CLOSED TABLE of named levels with a signed cost (book-of-chantries-es.md's
 * Appendix Two), never a per-dot rate — level 0 is a real, named, priced choice ("Sin Guardián",
 * -10), not "zero dots of a linear Trait". `pricingModel: "table"` is what the sheet's shared
 * Trait-row loop reads; `levels` is the SAME frozen array `chantry-effects.js` prices book-trait
 * levels from, not a copy of it. With no linear Trait left, the sheet's old 2x/1x rating cap has
 * nothing left to apply to (design.md D8): every one of these seven validates only against its own
 * table's range.
 */
wod.chantry = {
    traitcost: Object.fromEntries(BOOK_OF_CHANTRIES_TRAIT_KEYS.map((key) => [
        key,
        { pricingModel: "table", levels: BOOK_OF_CHANTRIES_LEVEL_COSTS[key] }
    ])),
    flavors: [
        "tradition",
        "technocracy"
    ],
    /* rebuild-chantry-book-of-chantries-only, design.md D7 — the Dossier's five facility-archetype
     * bands (Escondite/Santuario/Mística/Fortaleza/Centro de Poder) retire alongside the Dossier
     * itself, replaced by the book's own six power bands (Lamentablemente Débil/Débil/Media/
     * Fuerte/Poderosa/Muy Poderosa, book-of-chantries-es.md:5459-5464). The only reason the Dossier
     * bands survived `add-book-of-chantries-traits` was "shared scaffolding, not a choice" (that
     * change's own D9) — the sole other consumer of a 5-band scale. That reason disappears the
     * moment the Dossier does.
     */
    tiers: [
        "pitifully-weak",
        "weak",
        "average",
        "strong",
        "powerful",
        "very-powerful"
    ]
}

/*
 * Las constantes del GHOUL (Vampiro V20, cap. «Ghouls», pág. 496-506).
 *
 * Un Ghoul es MORTAL con hoja de vampiro, no un Vástago, y esa asimetría es justo la que se pierde
 * si nadie la escribe: `wod.variant.mortal.ghoul` (abajo) lo declara variante de `mortal`, y
 * `CreateHelper.SetMortalVariant` le pone `variantsheet: "vampire"` para que herede las Disciplinas
 * y el tema de la hoja. Lo que NO debe heredar es la tabla de Generación del Vástago — de ahí este
 * bloque, que es el ÚNICO sitio donde vive el número.
 *
 * `bloodpoolmax` NO es la tabla de Generación: v20-core-rulebook-es L15366 dice «los Ghouls empiezan
 * con un punto de Sangre, y tienen una reserva de Sangre de 2 o más, dependiendo de su edad», y
 * L15308 («reserva de Sangre (1)») fija el punto de partida. La subida por edad de L15432 (+1 por
 * siglo para Aparecidos, +1 por cada dos siglos para los demás) NO se modela: la ficha no tiene
 * campo de edad. Ver `module/actor/data/ghoul-bloodpool.js` para el razonamiento largo.
 *
 * `disciplinelevelcap` está DECLARADO Y NO APLICADO, igual que en wodchar
 * (`vampire.variants.json` -> `signaturePower.levelCapByDonorGeneration`): v20 L15352-15362 limita a
 * un Ghoul al primer nivel de cualquier Disciplina, y ese tope sube con la Generación del DONANTE,
 * que la ficha tampoco registra. Se declara para que la regla esté en el sistema y no sólo en el
 * libro; ninguna comprobación lo lee todavía.
 */
wod.ghoul = {
    bloodpoolmax: 2,
    bloodpoolstart: 1,
    bloodperturn: 1,
    disciplinelevelcap: 1
}

wod.splat = {
    vampire: "vampire",
    werewolf: "werewolf",
    mage: "mage",
    changeling: "changeling",
    hunter: "hunter",
    demon: "demon",
    wraith: "wraith",
    mummy: "mummy",
    exalted: "exalted",
    mortal: "mortal",
    creature: "creature",
    changingbreed: "changingbreed",
    spirit: "spirit"
}

wod.era = {
    modern: "wod.era.modern",
    victorian: "wod.era.victorian",
    darkages: "wod.era.darkages",
    classical: "wod.era.classical",
    livinggods: "wod.era.livinggods",
    savage: "wod.era.savage"
}

wod.sheetsettings = {
    useSplatFonts: true
}

wod.variant = {
    vampire: {
        kindredeast: "wod.bio.vampire.kindredeast"
    },
    changeling: {
        dauntain: "wod.bio.changeling.dauntain",
        thallain: "wod.bio.changeling.thallain",
        nunnehi: "wod.bio.changeling.nunnehi",
        menehune: "wod.bio.changeling.menehune",
        inanimae: "wod.bio.changeling.inanimae",
        darkkin: "wod.bio.changeling.darkkin"
    },
    wraith: {
        shadow: "wod.bio.wraith.shadow"
    },
    exalted: {
        solar: "wod.bio.exalted.solar",
        lunar: "wod.bio.exalted.lunar",
        dragon: "wod.bio.exalted.dragon",
        sidereal: "wod.bio.exalted.sidereal",
        abyssal: "wod.bio.exalted.abyssal",
        infernal: "wod.bio.exalted.infernal",
        alchemical: "wod.bio.exalted.alchemical",
        liminal: "wod.bio.exalted.liminal",
    },
    changingbreed: {
        Ajaba: "wod.bio.feraname.ajaba",
		Ananasi: "wod.bio.feraname.ananasi",
		Bastet: "wod.bio.feraname.bastet",
		Corax: "wod.bio.feraname.corax",
		Gurahl: "wod.bio.feraname.gurahl",				
		Kitsune: "wod.bio.feraname.kitsune",	
		Mokole: "wod.bio.feraname.mokole",
		Nagah: "wod.bio.feraname.nagah",
		Nuwisha: "wod.bio.feraname.nuwisha",
		Ratkin: "wod.bio.feraname.ratkin",
		Rokea: "wod.bio.feraname.rokea",
        Apis: "wod.bio.feraname.apis",
		Camazotz: "wod.bio.feraname.camazotz",
		Grondr: "wod.bio.feraname.grondr"
    },
    mortal: {
        orpheus: "wod.bio.mortal.orpheus",
        sorcerer: "wod.bio.mortal.sorcerer",
        autumnpeople: "wod.bio.mortal.autumnpeople",
        enchanted: "wod.bio.mortal.enchanted",
        ghoul: "wod.bio.mortal.ghoul",
        kinfolk: "wod.bio.mortal.kinfolk",
        truefaith: "wod.bio.mortal.truefaith"
    },
    creature: {
        chimera: "wod.bio.creature.chimera",
        familiar: "wod.bio.creature.familiar",
        construct: "wod.bio.creature.construct",
        spirit: "wod.bio.creature.spirit",
        warwolves: "wod.bio.creature.warwolves",
        anurana: "wod.bio.creature.anurana",
        samsa: "wod.bio.creature.samsa",
        kerasi: "wod.bio.creature.kerasi",
        yeren: "wod.bio.creature.yeren",
        earthbound: "wod.bio.creature.earthbound"
    }
}

wod.attributes = {
    strength: "wod.attributes.strength",
    dexterity: "wod.attributes.dexterity",
    stamina: "wod.attributes.stamina",
    charisma: "wod.attributes.charisma",
    manipulation: "wod.attributes.manipulation",
    composure: "wod.attributes.composure",
    intelligence: "wod.attributes.intelligence",
    wits: "wod.attributes.wits",
    resolve: "wod.attributes.resolve"
}

wod.attributes20 = {
    strength: "wod.attributes.strength",
    dexterity: "wod.attributes.dexterity",
    stamina: "wod.attributes.stamina",
    charisma: "wod.attributes.charisma",
    manipulation: "wod.attributes.manipulation",
    appearance: "wod.attributes.appearance",
    perception: "wod.attributes.perception",
    intelligence: "wod.attributes.intelligence",
    wits: "wod.attributes.wits"
}

wod.attributeslist = {
    strength: "wod.attributes.strength",
    charisma: "wod.attributes.charisma",
    intelligence: "wod.attributes.intelligence",
    dexterity: "wod.attributes.dexterity",
    manipulation: "wod.attributes.manipulation",
    wits: "wod.attributes.wits",
    stamina: "wod.attributes.stamina",    
    composure: "wod.attributes.composure",    
    resolve: "wod.attributes.resolve"
}

wod.attributes20list = {
    strength: "wod.attributes.strength",
    charisma: "wod.attributes.charisma",
    perception: "wod.attributes.perception",
    dexterity: "wod.attributes.dexterity",
    manipulation: "wod.attributes.manipulation",
    intelligence: "wod.attributes.intelligence",
    stamina: "wod.attributes.stamina",
    appearance: "wod.attributes.appearance",
    wits: "wod.attributes.wits"
}

wod.advantages = {
    willpower: "wod.advantages.willpower",
    rage: "wod.advantages.rage",
    gnosis: "wod.advantages.gnosis",
    arete: "wod.advantages.arete",
    glamour: "wod.advantages.glamour",
    banality: "wod.advantages.banality",
    conscience: "wod.advantages.virtue.conscience",
	conviction: "wod.advantages.virtue.conviction",
	selfcontrol: "wod.advantages.virtue.selfcontrol",
	instinct: "wod.advantages.virtue.instinct",
	courage: "wod.advantages.virtue.courage",
    mercy: "wod.advantages.virtue.mercy",
    vision: "wod.advantages.virtue.vision",
    zeal: "wod.advantages.virtue.zeal"
}

wod.talents = {
    alertness: "wod.abilities.alertness",
    art: "wod.abilities.art",
    athletics: "wod.abilities.athletics",
    awareness: "wod.abilities.awareness",
    brawl: "wod.abilities.brawl",
    dodge: "wod.abilities.dodge",
    empathy: "wod.abilities.empathy",
    expression: "wod.abilities.expression",
    intimidation: "wod.abilities.intimidation",
    intuition: "wod.abilities.intuition",
    kenning: "wod.abilities.kenning",
    leadership: "wod.abilities.leadership",
    persuasion: "wod.abilities.persuasion",
    primalurge: "wod.abilities.primalurge",
    streetwise: "wod.abilities.streetwise",
    subterfuge: "wod.abilities.subterfuge"
}

wod.skills = {
    animalken: "wod.abilities.animalken",
    craft: "wod.abilities.craft",
    demolitions: "wod.abilities.demolitions",
    drive: "wod.abilities.drive",
    etiquette: "wod.abilities.etiquette",
    firearms: "wod.abilities.firearms",
    larceny: "wod.abilities.larceny",
    martialarts: "wod.abilities.martialarts",
    meditation: "wod.abilities.meditation",
    melee: "wod.abilities.melee",
    performance: "wod.abilities.performance",
    research: "wod.abilities.research",
    stealth: "wod.abilities.stealth",    
    security: "wod.abilities.security",
    survival: "wod.abilities.survival",
    technology: "wod.abilities.technology",
}

wod.knowledges = {
    academics: "wod.abilities.academics",
    bureaucracy: "wod.abilities.bureaucracy",
    computer: "wod.abilities.computer",
    cosmology: "wod.abilities.cosmology",
    enigmas: "wod.abilities.enigmas",
    esoterica: "wod.abilities.esoterica",
    finance: "wod.abilities.finance",
    gremayre: "wod.abilities.gremayre",
    investigation: "wod.abilities.investigation",
    law: "wod.abilities.law",
    linguistics: "wod.abilities.linguistics",
    medicine: "wod.abilities.medicine",
    occult: "wod.abilities.occult",
    politics: "wod.abilities.politics",
    religion: "wod.abilities.religion",
    research: "wod.abilities.research",
    rituals: "wod.abilities.rituals",
    science: "wod.abilities.science",
    technology: "wod.abilities.technology"
}

wod.alwaysspeciality = {
    vampire: [
        "expression", 
        "craft", 
        "performance", 
        "academics", 
        "law", 
        "science", 
        "technology"
    ],
    werewolf: [
        "expression", 
        "craft", 
        "performance", 
        "academics", 
        "law", 
        "science", 
        "technology"
    ],
    mage: [
        "art",
        "athletics",
        "craft",
        "firearms",
        "martialarts",
        "melee",
        "academics", 
        "esoterica",
        "law", 
        "politics",
        "science"        
    ],
    changeling: [
        "expression", 
        "craft", 
        "performance", 
        "academics", 
        "law", 
        "science", 
        "technology"       
    ],
    // add-wraith-pc-splat — was `wraith: []`, which meant a wraith PC had NO ability that requires a
    // specialization, while every other line does. These seven are the Storyteller-System umbrella
    // abilities (broad enough that a bare rating says nothing), and they are IDENTICAL for vampire,
    // werewolf and changeling above; Wraith uses the same standard ability list, so it takes the same
    // seven. Mage is the only line that differs, with its own eleven.
    //
    // NOTE for anyone reading the change docs: this map is `alwaysspeciality` — "this ability always needs
    // a speciality" (read at `module/scripts/drop-helpers.js:1218`). The change's task 2.4 called it the
    // "favoured-abilities list" and said mage had 4 entries; both were misreadings — mage has 11, and
    // favoured abilities are not a thing this map models.
    wraith: [
        "expression",
        "craft",
        "performance",
        "academics",
        "law",
        "science",
        "technology"
    ]
}

wod.attackAttributes = {
    strength: "wod.attributes.strength",
    dexterity: "wod.attributes.dexterity",
    manipulation: "wod.attributes.manipulation",
    wits: "wod.attributes.wits"
}

wod.attackMeleeAbilities = {
    athletics: "wod.abilities.athletics",
    brawl: "wod.abilities.brawl",
    martialarts: "wod.abilities.martialarts",
    melee: "wod.abilities.melee",
    expression: "wod.abilities.expression",
    intimidation: "wod.abilities.intimidation",    
    subterfuge: "wod.abilities.subterfuge"
} 

wod.attackRangedAbilities = {
    athletics: "wod.abilities.athletics",
    firearms: "wod.abilities.firearms",
    brawl: "wod.abilities.brawl",
    martialarts: "wod.abilities.martialarts"
} 

wod.damageTypes = {
    bashing: "wod.health.bashing",
    lethal: "wod.health.lethal",
    aggravated: "wod.health.aggravated"
}

wod.woundLevels = {
    bruised: "wod.health.bruised",
    hurt: "wod.health.hurt",
    injured: "wod.health.injured",
    wounded: "wod.health.wounded",
    mauled: "wod.health.mauled",
    crippled: "wod.health.crippled",
    incapacitated: "wod.health.incapacitated"
}

wod.allSpheres = {
    correspondence: "wod.spheres.correspondence",
	entropy: "wod.spheres.entropy",
	forces: "wod.spheres.forces",
	life: "wod.spheres.life",
	matter: "wod.spheres.matter",
	mind: "wod.spheres.mind",
	prime: "wod.spheres.prime",
	spirit: "wod.spheres.spirit",
	time: "wod.spheres.time"
}

wod.allSpheresTechnocracy = {
    correspondence: "wod.spheres.data",
	entropy: "wod.spheres.entropicstate",
	forces: "wod.spheres.forcebased",
	life: "wod.spheres.lifescience",
	matter: "wod.spheres.material",
	mind: "wod.spheres.psychodynamics",
	prime: "wod.spheres.primal",
	spirit: "wod.spheres.dimensional",
	time: "wod.spheres.temporalscience"
}

wod.bonus = {
    attribute_buff: "wod.labels.bonus.attributebonus",
    attribute_dice_buff: "wod.labels.bonus.attributedicebonus",
    attribute_diff: "wod.labels.bonus.attributediff",    
    attribute_auto_buff: "wod.labels.bonus.attributesucc",
    ability_buff: "wod.labels.bonus.abilitybonus",
    ability_diff: "wod.labels.bonus.abilitydiff",    
    soak_buff: "wod.labels.bonus.soakbonus",
    soak_diff: "wod.labels.bonus.soakdiffbonus",
    health_buff: "wod.labels.bonus.healthbuff",
    initiative_buff: "wod.labels.bonus.initbonus",
    movement_buff: "wod.labels.bonus.movebonus",
    attribute_fixed_value: "wod.labels.bonus.attributefixedvalue",
    attack_buff: "wod.labels.bonus.attackbuff",
    attack_diff: "wod.labels.bonus.attackdiff",
    frenzy_buff: "wod.labels.bonus.frenzybuff",
    frenzy_diff: "wod.labels.bonus.frenzydiff",
    damage_type_set: "wod.labels.bonus.damagetypeset"
}