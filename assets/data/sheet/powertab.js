export const datapowertab = {    
    power: {
        werewolf: {
            primary: ["gifts", "rites"],  
        },    
        vampire: {
            primary: ["disciplines", "paths", "combinations", "rituals"],
        },
        mage: {
            // "rotes" is deliberately absent: the Rote list MOVED to the Stats tab, into the band
            // under Arete and Health (`stats_rotes.hbs`), next to the Spheres that also moved there.
            // Dropping it here is what makes that a move rather than a duplicate — the section is
            // only built if the id appears in this list. `context.rotes` is still prepared on both
            // tabs, so nothing else that reads it changes.
            primary: ["resonances"],
        },
        changeling: {
            primary: ["arts"],
        },
        // add-wraith-pc-splat §3.4 — Arcanoi are the wraith power axis. Without this entry the powers tab
        // renders NOTHING for a wraith: `BuildPowerSections` only adds a section if it appears in this
        // splat's `primary` or in `defaultOrder`, so a section definition alone is not enough.
        wraith: {
            primary: ["arcanoi"],
        },
        demon: {
            primary: ["lores", "rituals"],
        },
        hunter: {
            primary: ["edges"],
        },
        creature: {
            primary: ["charms"],
        },
        mortal: {
            primary: [],
        },
        defaultOrder: [
            "disciplines",
            "paths",
            "combinations",
            "rituals",
            "gifts",
            "rites",
            "rotes",
            "resonances",
            "arts",
            "lores",
            "edges",
            "numinas",
            "charms",
            "arcanoi"
        ],
        unsorted: {
            priority: 99, 
            alwaysLast: true
        }
    }    
}