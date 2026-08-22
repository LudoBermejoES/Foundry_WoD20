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
            // reorganize-mage-sheet-v3 D2 — "rotes" is back, and FIRST: the Rote list now renders as
            // the first section of the Poderes tab, reverting the add-pc-sheet-v3-era move to the
            // Stats tab (the `stats_advantages.hbs` band, deleted, and `stats_rotes.hbs` with it).
            //
            // Adding it HERE IS NOT ENOUGH on its own. `primary` only decides ORDER:
            // `BuildPowerSections` walks it first, then walks `defaultOrder` and adds every id not
            // already taken (`item-helpers.js:1042-1048`). 7.5.44 shipped a REMOVAL believing a
            // one-list edit was enough and got the list rendering twice for the opposite reason this
            // comment used to warn about; the fix then, and the rule now, is the same either
            // direction: a section id must be added to (or removed from) `primary` AND
            // `defaultOrder` together, never one alone. See the matching entry in `defaultOrder`
            // below, which this change also restores.
            //
            // "resonances" is deliberately ABSENT (D4, same change): Resonancia y Sinergia now
            // renders on the Stats tab, under Fuerza de Voluntad (`stats_advantages.hbs`), not as a
            // `simpledots` Poderes section. Removed from `defaultOrder` too, for the same reason
            // "rotes" had to be added to both lists above — one list only either double-renders or,
            // in this direction, leaves an orphaned id nothing draws. `context.resonances` itself is
            // still built in `preparePowersContext`: the Settings tab's power-ordering UI and
            // `BuildPowerSections` both read it even though no section draws it any more.
            primary: ["rotes"],
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
            // reorganize-mage-sheet-v3 D2 — "rotes" restored here alongside mage's own `primary`
            // entry above. This entry only matters for splats that do NOT already claim "rotes" in
            // their own `primary` list — mage does, so mage's order comes from `primary` and this
            // entry is inert for mage. It exists so the id is never orphaned in one list only; the
            // section's `condition` (`actor.system.settings.hasrotes`, item-helpers.js:1048) is what
            // actually keeps it from appearing on non-mage sheets, exactly like `charms` reaching
            // Mage Companions through this same fallback despite not being in mage's `primary`.
            "rotes",
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