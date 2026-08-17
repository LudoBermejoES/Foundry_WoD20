export const datapowertab = {    
    power: {
        werewolf: {
            primary: ["gifts", "rites"],  
        },    
        // add-pc-sheet-v3 D9b — "paths" is GONE from `primary` and from `defaultOrder` below.
        //
        // It named a section `BuildPowerSections` has never defined, so `addSection("paths")` has
        // always returned null and it has rendered nothing, for any vampire, ever. Removing it is
        // therefore a PROVABLE no-op at runtime — not "probably safe": the only thing that changes is
        // that a function which returned null stops being called.
        //
        // Nothing can be orphaned by the removal, and that is checkable without the live world: there
        // is no `context.paths` prepared in `preparePowersContext`, no `wod.types.path` item sub-kind
        // anywhere in the system, and no create button that could mint one. No item of any type could
        // ever have been routed here, so no vampire can be holding one that this hides.
        //
        // NOT DEFINED INSTEAD, which was the other option. The Paths this meant are the Thaumaturgy /
        // Necromancy / Koldunic paths, and this system already carries them: as `wod.types.discipline`
        // containers with their powers underneath (the hierarchical `disciplines` section), and as
        // rituals tagged `system.category: "wod.power.thaumaturgy"` (migration.js:2104), which the
        // `rituals` section draws. Defining `paths` would need a new item sub-kind, a context key, a
        // create button and a migration to move existing documents onto it — a feature, not a fix, and
        // it would split one axis across two sections. `wod.power.paths` and `wod.power.unsortedpaths`
        // stay in the seven language files: they cost nothing and they are the record of the intent.
        // The matching `unsortedpaths` block in `item-helpers.js:1132-1142` was already commented out.
        vampire: {
            primary: ["disciplines", "combinations", "rituals"],
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
        // add-changeling-chimera-bestiary — a chimera's `variantsheet` resolves its splat to
        // "changeling" (not "creature"; see the `chimera` variant in create-helpers.js), so Redes
        // reaches the sheet via the `defaultOrder` fallback below, exactly the way `charms` already
        // reaches Mage Companions despite not being in `mage`'s own `primary` list.
        mortal: {
            primary: [],
        },
        defaultOrder: [
            "disciplines",
            // "paths" removed — see the vampire block above. It had no definition in
            // `BuildPowerSections`, so this entry selected nothing on any line.
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
            "redes",
            // add-changeling-bestiary — Estigma powers (Autumn People/Deshechos), reaching any splat
            // via this fallback exactly the way `redes` reaches `changeling`/`creatures`.
            "estigmas",
            "arcanoi"
        ],
        unsorted: {
            priority: 99, 
            alwaysLast: true
        }
    }    
}