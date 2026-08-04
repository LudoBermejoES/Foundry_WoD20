export const datapowertab = {    
    power: {
        werewolf: {
            primary: ["gifts", "rites"],  
        },    
        vampire: {
            primary: ["disciplines", "paths", "combinations", "rituals"],
        },
        mage: {
            // "rotes" is deliberately absent: the Rote list lives on the Stats tab now, in the band
            // under Arete and Health (`stats_rotes.hbs`), next to the Spheres.
            //
            // Removing it HERE IS NOT ENOUGH, and 7.5.44 shipped believing it was. `primary` only
            // decides ORDER: `BuildPowerSections` walks it first, then walks `defaultOrder` and adds
            // every id it has not already added (`item-helpers.js:1042-1048`). `defaultOrder` still
            // listed "rotes", so the section came back at order 2 and every mage holding Rotes saw
            // the list TWICE — once on Ficha, once on Poderes. To drop a section from a line you
            // must remove it from this list AND from `defaultOrder` below.
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
            // "rotes" removed: the Rote list renders on the Stats tab (`stats_rotes.hbs`). Leaving it
            // here re-added the section at order 2 for every mage, because this loop adds every id
            // NOT already taken from `primary` (`item-helpers.js:1042-1048`) — which is how 7.5.44
            // shipped the list twice. Mage is the only line that had it.
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