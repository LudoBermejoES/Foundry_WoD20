export const datapowertab = {    
    power: {
        werewolf: {
            primary: ["gifts", "rites"],  
        },    
        vampire: {
            primary: ["disciplines", "paths", "combinations", "rituals"],
        },
        mage: {
            primary: ["rotes", "resonances"],
        },
        changeling: {
            primary: ["arts"],
        },
        demon: {
            primary: ["lores", "rituals"],
        },
        hunter: {
            primary: ["edges"],
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
            "numinas"
        ],
        unsorted: {
            priority: 99, 
            alwaysLast: true
        }
    }    
}