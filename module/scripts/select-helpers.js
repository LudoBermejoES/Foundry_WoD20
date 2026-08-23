/**
 * SelectHelper
 *
 * Builds `listData` used by Handlebars `{{selectOptions ...}}` across the system templates.
 *
 * ## Conventions
 * - **Option Map**: `{ [value: string]: label: string }`
 *   - Used with `{{selectOptions ... localize=false}}` when `label` is already localized.
 * - **Option Array**: `Array<{ value: string|number, label: string, group?: string }>`
 *   - Used for optgroups (via `group`) and/or when templates expect arrays.
 *
 * ## Quick index (listData keys referenced by templates)
 *
 * **Shared / generic**
 * - `DifficultyList`: Difficulty values (`CONFIG.worldofdarkness.lowestDifficulty`..10), includes “varies”.
 * - `Era`: Game era options (values are `wod.era.*` keys from `CONFIG.worldofdarkness.era`).
 * - `Games`: Game line options for sheets/items.
 * - `Sheet`: Sheet type options (mortal/vampire/...) for splat item settings.
 * - Numeric helpers: `Levelnegative3Value`, `Level5Value`, `Level6Value`, `Level9Value`, `ZeroToNine`
 *
 * **Weapons (item sheets)**
 * - `WeaponEra`: Alias of `Era` (kept for backward compatibility in weapon templates).
 * - `Conceal`: Weapon concealment code list (P/J/T/NA) with era-aware labels.
 * - `AttackAttributes`: Attack attribute list for weapons.
 * - `AttackAbilities`: Attack ability list for melee/ranged weapons (+ custom).
 * - `DamageAttribute`: Alias of `AttackAttributes` (used by weapon damage roll config).
 * - `FormulaAttributes`: Attribute list for a Rote/Fórmula's Atributo+Habilidad pool
 *   (fix-formula-casting). The Ability half is a free-text field, not listData — see
 *   `item-sheet.js`'s `getData()` for the linked-Práctica hint text.
 *
 * **Powers (item sheets)**
 * - `Dice1List`, `Dice2List`: Lists for `templates/sheets/parts/power_rollable.html` (dice selection).
 * - `Types`: Power type options per game line (discipline/gift/art/etc).
 * - Parent lists: `Disciplines`, `DisciplinePaths`, `Arts`, `Edges`, `Lores`, `Arcanoi`, `Hekau`, `Numina`
 * - `RitualCategories`: Ritual category options (Vampire).
 * - `ArtTypes`, `ExaltedCharmTypes`, `SpellType`, `Experience`, `AbilityType`, `AbilityList`, `BonusLista`
 *
 * **Actor bio**
 * - Werewolf: `BreedList`, `AuspiceList`, `TribeList` (also used for Changing Breeds/Fera overrides).
 * - Mage: `AffiliationList`, `MageSectList`, `SphereList`
 * - Vampire: `Generation`, `SectList`, `ClanList`, `PathList`, `Conscience`, `Selfcontrol`
 * - Changeling: `SeemingList`, `CourtList`, `KithList`, `AffinityRealmList`
 * - Hunter: `CreedList`, `PrimaryVirtueList`
 * - Demon: `HouseList`, `FactionList`
 * - Wraith: `ShadowArchetypeList` (read from the installed `wraith-shadow-archetypes` pack)
 *
 * Notes:
 * - This file is long. Use the `//#region ...` markers below to quickly fold and navigate sections.
 */
import { selectPlaceholder, makeLocalizedOptionMap } from "./select/utils.js";
import { getEraList, getWeaponEraList, getWeaponConcealList } from "./select/era.js";
import {
    getChangelingSeemingList,
    getChangelingCourtList,
    getChangelingKithList,
    getChangelingAffinityRealmList
} from "./select/changeling.js";
import { getHunterCreedList, getHunterPrimaryVirtueList } from "./select/hunter.js";
import { getDemonHouseList, getDemonFactionList } from "./select/demon.js";
import { getChangingBreedLists } from "./select/changingbreed.js";
import { getPowerDice1List, getPowerDice2List } from "./select/power-roll.js";
import { getValueList, getGeneration } from "./select/numeric.js";
import { getVampireSects, getVampireClans, getVampirePaths } from "./select/vampire.js";
import {
    getWerewolfBreeds,
    getWerewolfBreedsv2,
    getWerewolfAuspices,
    getWerewolfAuspicesv2,
    getWerewolfTribes
} from "./select/werewolf.js";
import { getMageAffiliations, getMageSects } from "./select/mage.js";
import { getWraithShadowArchetypeList } from "./select/wraith.js";
import { getSplat } from "./splat-helpers.js";

export default class SelectHelper {
    //#region SetupItem (entry point)
    static SetupItem(data, isCharacter = false) {
        let listData = {};

        // Defaults to avoid undefined lookups in templates
        listData.SeemingList = {};
        listData.CourtList = {};
        listData.KithList = {};
        listData.AffinityRealmList = {};
        listData.CreedList = {};
        listData.PrimaryVirtueList = {};
        listData.HouseList = {};
        listData.FactionList = {};
        listData.ShadowArchetypeList = {};
        listData.Dice1List = [];
        listData.Dice2List = [];

        // Rollable dice lists (used by templates/sheets/parts/power_rollable.html)
        listData.Dice1List = this.GetPowerDice1List(data);
        listData.Dice2List = this.GetPowerDice2List(data);

        // Items
        if ((data.type == "Melee Weapon") || (data.type == "Ranged Weapon")) {
            // Weapons: used by `templates/sheets/*weapon-sheet.html`
            // Era and conceal lists used by weapon sheets
            listData.Era = this.GetEraList();
            listData.WeaponEra = this.GetWeaponEraList();
            listData.Conceal = this.GetWeaponConcealList(data);

            listData.AttackAttributes = [{
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.none") + " -"
            }];
            listData.AttackAbilities = [{
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },{
                value: "custom", 
                label: "- " + game.i18n.localize("wod.labels.usesecondary") + " -"
            }];
                
            for (const attribute in CONFIG.worldofdarkness.attackAttributes) {
                const data = {
                    value: attribute,
                    label: game.i18n.localize(CONFIG.worldofdarkness.attackAttributes[attribute])
                };

                listData.AttackAttributes.push(data);
            }

            if (data.type == "Melee Weapon") {
                for (const ability in CONFIG.worldofdarkness.attackMeleeAbilities) {
                    const data = {
                        value: ability,
                        label: game.i18n.localize(CONFIG.worldofdarkness.attackMeleeAbilities[ability])
                    };

                    listData.AttackAbilities.push(data);
                }
            }
            if (data.type == "Ranged Weapon") {
                for (const ability in CONFIG.worldofdarkness.attackRangedAbilities) {
                    const data = {
                        value: ability,
                        label: game.i18n.localize(CONFIG.worldofdarkness.attackRangedAbilities[ability])
                    };
    
                    listData.AttackAbilities.push(data);
                }
            }

            // Damage attribute uses the same attribute list as attack attribute
            listData.DamageAttribute = listData.AttackAttributes;
        }

        // fix-formula-casting (design.md D1/D2) — a Fórmula's own Atributo+Habilidad pair
        // (M20 Prism of Focus, "Fórmulas": "en lugar de Areté, el mago tira su Atributo +
        // Habilidad"). Attribute is a closed 9-value picker: the M20 Atributos, i.e.
        // `CONFIG.worldofdarkness.attributes20` (also used for the labels in
        // dialog-aretecasting.js's `_formulaPool()`). It is NOT the weapon `attackAttributes`
        // map — that one only has 4 keys (strength/dexterity/manipulation/wits) and exists to
        // populate a weapon's attack-roll selector, not to enumerate Atributos; using it here
        // silently dropped Resistencia, Carisma, Apariencia, Percepción e Inteligencia, so a
        // Fórmula with `attribute: "perception"` (the change's own canonical example) rendered
        // with nothing selected and degraded to an Areté roll on first save (`isFormulaRoll()`
        // requires both `attribute` and `ability`). Ability is a free-text field (see
        // item-sheet.js's getData(), which resolves the linked Práctica's Associated Abilities
        // as a hint) so this list only needs the Attribute values.
        if (data.type === "Rote") {
            listData.FormulaAttributes = [{
                value: "",
                label: "- " + game.i18n.localize("wod.labels.none") + " -"
            }];

            for (const attribute in CONFIG.worldofdarkness.attributes20) {
                listData.FormulaAttributes.push({
                    value: attribute,
                    label: game.i18n.localize(CONFIG.worldofdarkness.attributes20[attribute])
                });
            }
        }

        // Combat maneuvers (Trait subtype): reuse the weapon Attribute pool + the
        // combined melee/ranged Ability pool for the dice1/dice2 roll selects.
        if ((data.type == "Trait") && (data.system?.type == "wod.types.maneuver")) {
            listData.AttackAttributes = [{
                value: "",
                label: "- " + game.i18n.localize("wod.labels.none") + " -"
            }];
            listData.AttackAbilities = [{
                value: "",
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            }];

            for (const attribute in CONFIG.worldofdarkness.attackAttributes) {
                listData.AttackAttributes.push({
                    value: attribute,
                    label: game.i18n.localize(CONFIG.worldofdarkness.attackAttributes[attribute])
                });
            }

            const maneuverAbilities = {
                ...CONFIG.worldofdarkness.attackMeleeAbilities,
                ...CONFIG.worldofdarkness.attackRangedAbilities
            };
            for (const ability in maneuverAbilities) {
                listData.AttackAbilities.push({
                    value: ability,
                    label: game.i18n.localize(maneuverAbilities[ability])
                });
            }
        }

        if (data.type == "Feature") {
            listData.TypeList = [
            {
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },
            {
                value: "wod.types.background", 
                label: game.i18n.localize("wod.types.background"), 
                group: game.i18n.localize("wod.labels.other")
            },
            {
                value: "wod.types.merit", 
                label: game.i18n.localize("wod.types.merit"), 
                group: game.i18n.localize("wod.labels.other")
            },
            {
                value: "wod.types.flaw", 
                label: game.i18n.localize("wod.types.flaw"), 
                group: game.i18n.localize("wod.labels.other")
            },
            {
                value: "wod.types.bloodbound", 
                label: game.i18n.localize("wod.types.bloodbound"), 
                group: game.i18n.localize("wod.games.vampire")
            },
            {
                value: "wod.types.boon", 
                label: game.i18n.localize("wod.types.boon"), 
                group: game.i18n.localize("wod.games.vampire")
            },
            {
                value: "wod.types.oath",
                label: game.i18n.localize("wod.types.oath"),
                group: game.i18n.localize("wod.games.changeling")
            },
            /*
             * add-wraith-shadow-budget §3.2 — Thorn, the Shadow's rated special abilities.
             *
             * A FEATURE sub-kind, deliberately, and NOT Foundry's own `wod.types.sliver`, which is
             * a POWER sub-kind that `ItemHelper.BuildPowerSections` declares no section for — a
             * "correctly" typed Sliver renders on no part of the sheet, the measured
             * `wod.types.specialadvantage` defect. The decisive evidence is on the content side:
             * every one of the 24 documents in `wod20-compendium-es`'s `wraith-thorns` pack ships
             * as `type: "Feature"` (counted 2026-08-02), so a Power carrier could never have
             * received them however many sections were added for it.
             *
             * Listing it here is what let a GM retype a Thorn dragged in from that pack, which
             * arrived as the exporter's default `wod.types.othertraits`. The sheet did not wait for
             * that: `isThornFeature` (pc-actor-sheet.js) also recognises the pack's own
             * `flags["wod20-compendium-es"].source_type === "thorn"`, so a dragged Thorn landed in
             * the Shadow area untouched and this select was a convenience, not a requirement.
             *
             * Since module 0.7.124 (`legalize-feature-system-types`) the pack ships this value
             * directly, so the entry has stopped being a convenience and become the thing that keeps
             * those 24 documents' type alive across a GM's save. The flag recogniser stays for the
             * Thorns already dragged out of older packs.
             */
            {
                value: "wod.types.thorn",
                label: game.i18n.localize("wod.types.thorn"),
                group: game.i18n.localize("wod.games.wraith")
            },
            /*
             * link-mage-focus-as-items — Paradigm / Practice / Instrument, a mage's Focus.
             *
             * Same reasoning as Thorn immediately above: these are FEATURE sub-kinds (the packs
             * `mage-paradigms` / `mage-practices` / `mage-instruments` ship them as
             * `type: "Feature"`), and listing them here is what lets a GM retype one dragged in
             * from a pack before it is retyped there, or fix a mistake, WITHOUT this select's own
             * absence silently clobbering `system.type` back to "" the next time an
             * `itemAdministrator` saves the item sheet for any unrelated reason (the same failure
             * mode that gave `wod.types.maneuver` its own dedicated sheet instead — not available
             * here, because these are Feature, not Trait, and the sheet already used by every
             * other Feature sub-kind is this generic one).
             */
            {
                value: "wod.types.paradigm",
                label: game.i18n.localize("wod.types.paradigm"),
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.practice",
                label: game.i18n.localize("wod.types.practice"),
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.instrument",
                label: game.i18n.localize("wod.types.instrument"),
                group: game.i18n.localize("wod.games.mage")
            },
            /*
             * legalize-feature-system-types §1 — Otros Rasgos, the generic Feature sub-kind.
             *
             * THE LARGEST POPULATION THIS LIST HAS EVER BEEN MISSING: 1,137 shipped
             * `wod20-compendium-es` documents are `type: "Feature"` with
             * `system.type: "wod.types.othertraits"` (measured 2026-08-23), because that value is
             * the exporter's default for every Feature-mapped entity type without a mapping of its
             * own — clans, kith, houses, totems, banes, derangements, legacies, sphere effects,
             * rituals, tenets, sects, affiliations and fourteen more.
             *
             * The value was declared for `Trait` only (see the Trait branch below), and this branch's
             * absence is the exact failure this file documents two entries up for Paradigm/Practice/
             * Instrument: `feature-sheet.html` renders `<select name="system.type">` from this list,
             * a value with no matching `<option>` shows "- select -", and the next save by an
             * `itemAdministrator` writes it away. A GM opening any one of 1,137 documents destroys
             * its type; a player never can, which is why it shipped this long unreported.
             *
             * THE RENDER HALF WAS ALREADY DONE, and is NOT a `GetItemType` predicate: a
             * `Feature`/`othertraits`/`placement: "feature"` item is picked up by the direct filter
             * in `prepareAdvantageLists` (pc-actor-sheet.js) and rendered in Other Traits on both the
             * Attributes block and the Features tab. Adding a predicate + a section for it here would
             * print every one of those documents TWICE. Verified before writing this, not assumed.
             */
            {
                value: "wod.types.othertraits",
                label: game.i18n.localize("wod.types.othertraits"),
                group: game.i18n.localize("wod.labels.other")
            },
            /*
             * legalize-feature-system-types §2 — Fetter (Grillete), and it is the MIRROR IMAGE of
             * Thorn above.
             *
             * Thorn was offered here with no `GetItemType` predicate; Fetter has had the predicate
             * since add-wraith-pc-splat (`context.fetters = ItemHelper.GetItemType(actor, "Feature",
             * "wod.types.fetter")`, pc-actor-sheet.js) and was declared only in the `Trait` branch of
             * this file. So the sheet asks for a Feature the dropdown could not offer.
             *
             * The plausible-looking fix — export Fetters as `item_type: "Trait"`, where the value IS
             * already declared — was measured to be WRONG: the render predicate asks for `Feature`,
             * so a Trait-carried Fetter would render in no section at all. The item type is decided
             * by the PREDICATE and the missing dropdown entry is what gets added. The `Trait` entry
             * stays where it is; nothing in this fork reads it, but removing it is a separate
             * question about a value this project does not emit.
             */
            {
                value: "wod.types.fetter",
                label: game.i18n.localize("wod.types.fetter"),
                group: game.i18n.localize("wod.games.wraith")
            },
            /*
             * offer-what-the-system-can-create — the LAST three `Feature` sub-kinds this fork could
             * create and render but not offer. Fetter above was the fourth; these were left out of
             * that change on the criterion "they affect no document this project's exporter emits",
             * which is TRUE and was still the wrong boundary.
             *
             * They are the three Feature sub-kinds that exist ONLY as CHARACTER data. Nothing in
             * `wod20-compendium-es` carries them (measured 2026-08-23: zero documents for all
             * three); they are minted here, by `CreateButtonsNotev2` — `passion`/`darkpassion` in
             * the `["passion", "darkpassion", "fetter", "thorn"]` loop gated on
             * `getSplat(actor) === wraith`, `connection` by its own always-offered button — and by
             * `wod20-char`'s exporter (`FEATURE_TYPE_BY_TRAIT_CATEGORY`), which writes them onto a
             * `type: "Feature"` item exactly as this dropdown must accept. A criterion phrased over
             * SHIPPED DOCUMENTS is structurally blind to precisely this set.
             *
             * The damage is the one this file has now documented four times: `feature-sheet.html`
             * renders `<select name="system.type">` from this list, a value with no matching
             * `<option>` shows "- select -", and the next save by an `itemAdministrator` writes that
             * emptiness. For `connection` it also takes the roster fields down with it — `relation`,
             * `link` and `portrait` live behind
             * `{{#if (eqAny data.system.type "wod.types.connection")}}` (feature-sheet.html:119), so
             * losing the type loses the person's Background, their portrait and their link.
             *
             * NO RENDER PREDICATE IS ADDED, and that is measured rather than assumed — the opposite
             * conclusion to the one `othertraits` needed. All three are already asked for by
             * `pc-actor-sheet.js`: `connection` by `buildConnectionGroups` (plus the
             * `GetItemType(actor, "Feature", "wod.types.connection")` count at line 1819),
             * `passion`/`darkpassion` by `context.passions`/`context.darkpassions`. Adding a second
             * path would print them TWICE, which is the error `legalize-feature-system-types`
             * narrowly avoided with 1,137 documents. ONE half was missing here; only that half is
             * added.
             *
             * Groups follow the creation gates: Passion and Dark Passion are minted only for a
             * wraith, Connection for every line.
             */
            {
                value: "wod.types.passion",
                label: game.i18n.localize("wod.types.passion"),
                group: game.i18n.localize("wod.games.wraith")
            },
            {
                value: "wod.types.darkpassion",
                label: game.i18n.localize("wod.types.darkpassion"),
                group: game.i18n.localize("wod.games.wraith")
            },
            {
                value: "wod.types.connection",
                label: game.i18n.localize("wod.types.connection"),
                group: game.i18n.localize("wod.labels.other")
            }];

            listData.BoonTypes = [
            {
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },
            {

                value: "wod.labels.feature.trivial", 
                label: game.i18n.localize("wod.labels.feature.trivial")
            },
            {

                value: "wod.labels.feature.minor", 
                label: game.i18n.localize("wod.labels.feature.minor")
            },
            {

                value: "wod.labels.feature.major", 
                label: game.i18n.localize("wod.labels.feature.major")
            },
            {

                value: "wod.labels.feature.life", 
                label: game.i18n.localize("wod.labels.feature.life")
            }
            ];
        }

        if (data.type == "Fetish") {
            listData.TypeList = [{
                value: "wod.types.fetish", 
                label: game.i18n.localize("wod.types.fetish")
            },
            {
                value: "wod.types.talen", 
                label: game.i18n.localize("wod.types.talen")
            }];
        }    
        
        if (data.type == "Item") {
            listData.TypeList = [
            {
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },
            {
                value: "wod.types.treasure", 
                label: game.i18n.localize("wod.types.treasure"), 
                group: game.i18n.localize("wod.games.changeling")
            },
            {
                value: "wod.types.relic", 
                label: game.i18n.localize("wod.types.relic"), 
                group: game.i18n.localize("wod.games.demon")
            },
            {
                value: "wod.types.device", 
                label: game.i18n.localize("wod.gear.device"), 
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.talisman", 
                label: game.i18n.localize("wod.gear.talisman"), 
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.periapt", 
                label: game.i18n.localize("wod.gear.periapt"), 
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.matrix", 
                label: game.i18n.localize("wod.gear.matrix"), 
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.trinket", 
                label: game.i18n.localize("wod.gear.trinket"), 
                group: game.i18n.localize("wod.games.mage")
                          },
              {
                  value: "wod.types.gadget", 
                  label: game.i18n.localize("wod.gear.gadget"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.artifact", 
                  label: game.i18n.localize("wod.gear.artifact"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.grimoire", 
                  label: game.i18n.localize("wod.gear.grimoire"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.enchantment", 
                  label: game.i18n.localize("wod.gear.enchantment"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.invention", 
                  label: game.i18n.localize("wod.gear.invention"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.cato", 
                  label: game.i18n.localize("wod.gear.cato"), 
                  group: game.i18n.localize("wod.games.mage")
              },
              {
                  value: "wod.types.fetish", 
                  label: game.i18n.localize("wod.gear.fetish"), 
                  group: game.i18n.localize("wod.games.mage")
              }];
        }

        if (data.type == "Trait") {
            listData.TypeList = [
            {
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },
            {
                value: "wod.types.realms", 
                label: game.i18n.localize("wod.realms.headline"), 
                group: game.i18n.localize("wod.games.changeling")
            },
            {
                value: "wod.types.resonance", 
                label: game.i18n.localize("wod.types.resonance"), 
                group: game.i18n.localize("wod.games.mage")
            },
            {
                value: "wod.types.passion", 
                label: game.i18n.localize("wod.types.passion"), 
                group: game.i18n.localize("wod.games.wraith")
            },
            {
                value: "wod.types.fetter", 
                label: game.i18n.localize("wod.types.fetter"), 
                group: game.i18n.localize("wod.games.wraith")
            },
            {
                value: "wod.types.apocalypticform", 
                label: game.i18n.localize("wod.types.apocalypticform"), 
                group: game.i18n.localize("wod.games.demon")
            },
            {
                value: "wod.types.shapeform", 
                label: game.i18n.localize("wod.types.shapeform"), 
                group: game.i18n.localize("wod.games.exalted")
            },
            {
                value: "wod.types.aspect", 
                label: game.i18n.localize("wod.types.aspect"), 
                group: game.i18n.localize("wod.games.exalted")
            },
            {
                value: "wod.types.talentability", 
                label: game.i18n.localize("wod.types.talentability"), 
                group: game.i18n.localize("wod.abilities.ability")
            },
            {
                value: "wod.types.skillability", 
                label: game.i18n.localize("wod.types.skillability"), 
                group: game.i18n.localize("wod.abilities.ability")
            },
            {
                value: "wod.types.knowledgeability", 
                label: game.i18n.localize("wod.types.knowledgeability"), 
                group: game.i18n.localize("wod.abilities.ability")
            },
            {
                value: "wod.types.talentsecondability", 
                label: game.i18n.localize("wod.types.talentsecondability"), 
                group: game.i18n.localize("wod.labels.custom")
            },
            {
                value: "wod.types.skillsecondability", 
                label: game.i18n.localize("wod.types.skillsecondability"), 
                group: game.i18n.localize("wod.labels.custom")
            },
            {
                value: "wod.types.knowledgesecondability", 
                label: game.i18n.localize("wod.types.knowledgesecondability"), 
                group: game.i18n.localize("wod.labels.custom")
            },
            {
                value: "wod.types.othertraits", 
                label: game.i18n.localize("wod.types.othertraits"), 
                group: game.i18n.localize("wod.labels.other")
            }];

            listData.PlacementList = [
            {
                value: "", 
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            },
            {
                value: "feature", 
                label: game.i18n.localize("TYPES.Item.Feature")
            },
            {
                value: "power", 
                label: game.i18n.localize("TYPES.Item.Power")
            }];
        }

        if (data.type == "Power") {
            let type = {};            

            if (data.system.game == "orpheus") {
                type = {
                    "wod.types.stain": game.i18n.localize("wod.types.stain"),
                    "wod.types.horror": game.i18n.localize("wod.types.horror"),
                }
            }            
            if (data.system.game == "changeling") {
                type = {
                    "wod.types.art": game.i18n.localize("wod.types.art"),
                    "wod.types.artpower": game.i18n.localize("wod.types.artpower")
                }
            }
            if (data.system.game == "demon") {
                type = {
                    "wod.types.lore": game.i18n.localize("wod.types.lore"),
                    "wod.types.lorepower": game.i18n.localize("wod.types.lorepower"),
                    "wod.types.ritual": game.i18n.localize("wod.types.ritual")
                }
            }
            if (data.system.game == "hunter") {
                type = {
                    "wod.types.edge": game.i18n.localize("wod.types.edge"),
                    "wod.types.edgepower": game.i18n.localize("wod.types.edgepower")
                }
            }
            if (data.system.game == CONFIG.worldofdarkness.sheettype.mage.toLowerCase()) {
                type = {
                    "wod.types.numina": game.i18n.localize("wod.types.numina"),
                    "wod.types.numinapower": game.i18n.localize("wod.types.numinapower")
                }
            }
            if (data.system.game == CONFIG.worldofdarkness.sheettype.vampire.toLowerCase()) {
                type = {
                    "wod.types.discipline": game.i18n.localize("wod.types.discipline"),
                    "wod.types.disciplinepower": game.i18n.localize("wod.types.disciplinepower"),
                    // "wod.types.disciplinepath": game.i18n.localize("wod.types.disciplinepath"),
                    // "wod.types.disciplinepathpower": game.i18n.localize("wod.types.disciplinepathpower"),
                    "wod.types.ritual": game.i18n.localize("wod.types.ritual"),
                    "wod.types.combination": game.i18n.localize("wod.types.combination")
                }
            }
            if (data.system.game == CONFIG.worldofdarkness.sheettype.werewolf.toLowerCase()) {
                type = {
                    "wod.types.gift": game.i18n.localize("wod.types.gift"),
                    "wod.types.rite": game.i18n.localize("wod.types.rite")
                }
            }
            if (data.system.game == "wraith") {
                type = {
                    "wod.types.arcanoi": game.i18n.localize("wod.types.arcanoi"),
                    "wod.types.arcanoipower": game.i18n.localize("wod.types.arcanoipower")
                }
            }
            if (data.system.game == "mummy") {
                type = {
                    "wod.types.hekau": game.i18n.localize("wod.types.hekau"),
                    "wod.types.hekaupower": game.i18n.localize("wod.types.hekaupower")
                }
            }

            if (data.system.game == "exalted") {
                type = {
                    "wod.types.exaltedcharm": game.i18n.localize("wod.types.exaltedcharm"),
                    "wod.types.exaltedsorcery": game.i18n.localize("wod.types.exaltedsorcery")
                }

                listData.ExaltedCharmTypes = [
                    {
                        value: "", 
                        label: "- " + game.i18n.localize("wod.labels.select") + " -"
                    },
                    {
                        value: "wod.types.solar.dawn", 
                        label: game.i18n.localize("wod.types.solar.dawn"), 
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.solar.zenith", 
                        label: game.i18n.localize("wod.types.solar.zenith"),
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.solar.twilight", 
                        label: game.i18n.localize("wod.types.solar.twilight"),
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.solar.night", 
                        label: game.i18n.localize("wod.types.solar.night"),
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.solar.eclipse", 
                        label: game.i18n.localize("wod.types.solar.eclipse"),
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.solar.special", 
                        label: game.i18n.localize("wod.types.solar.special"),
                        group: game.i18n.localize("wod.bio.exalted.solar")
                    },
                    {
                        value: "wod.types.lunar.fullmoon", 
                        label: game.i18n.localize("wod.types.lunar.fullmoon"), 
                        group: game.i18n.localize("wod.bio.exalted.lunar")
                    },
                    {
                        value: "wod.types.lunar.changingmoon", 
                        label: game.i18n.localize("wod.types.lunar.changingmoon"), 
                        group: game.i18n.localize("wod.bio.exalted.lunar")
                    },
                    {
                        value: "wod.types.lunar.nomoon", 
                        label: game.i18n.localize("wod.types.lunar.nomoon"), 
                        group: game.i18n.localize("wod.bio.exalted.lunar")
                    },
                    {
                        value: "wod.types.lunar.shapeshifting", 
                        label: game.i18n.localize("wod.types.lunar.shapeshifting"), 
                        group: game.i18n.localize("wod.bio.exalted.lunar")
                    },
                    {
                        value: "wod.types.dragon.air", 
                        label: game.i18n.localize("wod.types.dragon.air"), 
                        group: game.i18n.localize("wod.bio.exalted.dragon")
                    },
                    {
                        value: "wod.types.dragon.earth", 
                        label: game.i18n.localize("wod.types.dragon.earth"), 
                        group: game.i18n.localize("wod.bio.exalted.dragon")
                    },
                    {
                        value: "wod.types.dragon.fire", 
                        label: game.i18n.localize("wod.types.dragon.fire"), 
                        group: game.i18n.localize("wod.bio.exalted.dragon")
                    },
                    {
                        value: "wod.types.dragon.water", 
                        label: game.i18n.localize("wod.types.dragon.water"),
                        group: game.i18n.localize("wod.bio.exalted.dragon")
                    },
                    {
                        value: "wod.types.dragon.wood", 
                        label: game.i18n.localize("wod.types.dragon.wood"),
                        group: game.i18n.localize("wod.bio.exalted.dragon")
                    },
                    {
                        value: "wod.types.sidereal.journey", 
                        label: game.i18n.localize("wod.types.sidereal.journey"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.serenity", 
                        label: game.i18n.localize("wod.types.sidereal.serenity"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.battle", 
                        label: game.i18n.localize("wod.types.sidereal.battle"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.secret", 
                        label: game.i18n.localize("wod.types.sidereal.secret"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.ending", 
                        label: game.i18n.localize("wod.types.sidereal.ending"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.border", 
                        label: game.i18n.localize("wod.types.sidereal.border"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.hand", 
                        label: game.i18n.localize("wod.types.sidereal.hand"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.march", 
                        label: game.i18n.localize("wod.types.sidereal.march"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.shard", 
                        label: game.i18n.localize("wod.types.sidereal.shard"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.prismatic", 
                        label: game.i18n.localize("wod.types.sidereal.prismatic"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.veil", 
                        label: game.i18n.localize("wod.types.sidereal.veil"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.sidereal.scarlet", 
                        label: game.i18n.localize("wod.types.sidereal.scarlet"),
                        group: game.i18n.localize("wod.bio.exalted.sidereal")
                    },
                    {
                        value: "wod.types.abyssal.dusk", 
                        label: game.i18n.localize("wod.types.abyssal.dusk"),
                        group: game.i18n.localize("wod.bio.exalted.abyssal")
                    },
                    {
                        value: "wod.types.abyssal.midnight", 
                        label: game.i18n.localize("wod.types.abyssal.midnight"),
                        group: game.i18n.localize("wod.bio.exalted.abyssal")
                    },
                    {
                        value: "wod.types.abyssal.daybreak", 
                        label: game.i18n.localize("wod.types.abyssal.daybreak"),
                        group: game.i18n.localize("wod.bio.exalted.abyssal")
                    },
                    {
                        value: "wod.types.abyssal.day", 
                        label: game.i18n.localize("wod.types.abyssal.day"),
                        group: game.i18n.localize("wod.bio.exalted.abyssal")
                    },
                    {
                        value: "wod.types.abyssal.moonshadow", 
                        label: game.i18n.localize("wod.types.abyssal.moonshadow"),
                        group: game.i18n.localize("wod.bio.exalted.abyssal")
                    },
                    {
                        value: "wod.types.infernal.general", 
                        label: game.i18n.localize("wod.types.infernal.general"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.realm", 
                        label: game.i18n.localize("wod.types.infernal.realm"), 
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.lanka", 
                        label: game.i18n.localize("wod.types.infernal.lanka"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.skinned", 
                        label: game.i18n.localize("wod.types.infernal.skinned"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.city", 
                        label: game.i18n.localize("wod.types.infernal.city"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.boiling", 
                        label: game.i18n.localize("wod.types.infernal.boiling"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.infernal.burrowing", 
                        label: game.i18n.localize("wod.types.infernal.burrowing"),
                        group: game.i18n.localize("wod.bio.exalted.infernal")
                    },
                    {
                        value: "wod.types.alchemical.general", 
                        label: game.i18n.localize("wod.types.alchemical.general"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.combat", 
                        label: game.i18n.localize("wod.types.alchemical.combat"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.physical", 
                        label: game.i18n.localize("wod.types.alchemical.physical"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.social", 
                        label: game.i18n.localize("wod.types.alchemical.social"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.stealth", 
                        label: game.i18n.localize("wod.types.alchemical.stealth"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.analytic", 
                        label: game.i18n.localize("wod.types.alchemical.analytic"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.utility", 
                        label: game.i18n.localize("wod.types.alchemical.utility"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.alchemical.spirit", 
                        label: game.i18n.localize("wod.types.alchemical.spirit"),
                        group: game.i18n.localize("wod.bio.exalted.alchemical")
                    },
                    {
                        value: "wod.types.liminal.blood", 
                        label: game.i18n.localize("wod.types.liminal.blood"),
                        group: game.i18n.localize("wod.bio.exalted.liminal")
                    },
                    {
                        value: "wod.types.liminal.breath", 
                        label: game.i18n.localize("wod.types.liminal.breath"),
                        group: game.i18n.localize("wod.bio.exalted.liminal")
                    },
                    {
                        value: "wod.types.liminal.fleash", 
                        label: game.i18n.localize("wod.types.liminal.fleash"),
                        group: game.i18n.localize("wod.bio.exalted.liminal")
                    },
                    {
                        value: "wod.types.liminal.marrow", 
                        label: game.i18n.localize("wod.types.liminal.marrow"),
                        group: game.i18n.localize("wod.bio.exalted.liminal")
                    },
                    {
                        value: "wod.types.liminal.soil", 
                        label: game.i18n.localize("wod.types.liminal.soil"),
                        group: game.i18n.localize("wod.bio.exalted.liminal")
                    }
                ];
            }
    
            let creature = {
                "wod.types.charm": game.i18n.localize("wod.types.charm") + " (Creature)",
                "wod.types.rede": game.i18n.localize("wod.types.rede") + " (Creature)",
                "wod.types.power": game.i18n.localize("wod.types.power") + " (Creature)"
            }
    
            listData.Types = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -",
                ...type,
                ...creature
            }

            listData.RitualCategories = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -",
                "wod.power.abyss" : game.i18n.localize("wod.power.abyss"),
				"wod.power.koldunic": game.i18n.localize("wod.power.koldunic"),
				"wod.power.necromancy": game.i18n.localize("wod.power.necromancy"),
				"wod.power.thaumaturgy": game.i18n.localize("wod.power.thaumaturgy")
            }

            listData.ArtTypes = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -",
                "wod.health.chimerical" : game.i18n.localize("wod.health.chimerical"),
				"wod.types.wyrd": game.i18n.localize("wod.types.wyrd"),
				"wod.labels.both": game.i18n.localize("wod.labels.both")
            }

            let artlist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }

            for (const arts of game.worldofdarkness.powers.arts) {
                let id = arts.name.toLowerCase();
                let name = arts.name;
    
                artlist = Object.assign(artlist, {[id]: name});
            }
    
            listData.Arts = artlist;
    
            let disciplinelist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
    
            for (const disciplines of game.worldofdarkness.powers.disciplines) {
                let id = disciplines.name.toLowerCase();
                let name = disciplines.name;
    
                disciplinelist = Object.assign(disciplinelist, {[id]: name});
            }
    
            listData.Disciplines = disciplinelist;

            // let disciplinepathlist = {
            //     "": "- " + game.i18n.localize("wod.labels.select") + " -"
            // }
    
            // for (const disciplines of game.worldofdarkness.powers.disciplinepaths) {
            //     let id = disciplines.name.toLowerCase();
            //     let name = disciplines.name;
    
            //     disciplinepathlist = Object.assign(disciplinepathlist, {[id]: name});
            // }
    
            // listData.DisciplinePaths = disciplinepathlist;

            let edgelist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
    
            for (const edge of game.worldofdarkness.powers.edges) {
                let id = edge.name.toLowerCase();
                let name = edge.name;
    
                edgelist = Object.assign(edgelist, {[id]: name});
            }
    
            listData.Edges = edgelist;

            let lorelist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
    
            for (const lore of game.worldofdarkness.powers.lores) {
                let id = lore.name.toLowerCase();
                let name = lore.name;
    
                lorelist = Object.assign(lorelist, {[id]: name});
            }
    
            listData.Lores = lorelist;

            let arcanoilist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
    
            for (const arcanoi of game.worldofdarkness.powers.arcanoi) {
                let id = arcanoi.name.toLowerCase();
                let name = arcanoi.name;
    
                arcanoilist = Object.assign(arcanoilist, {[id]: name});
            }
    
            listData.Arcanoi = arcanoilist;   
            
            let hekaulist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
            
            for (const hekau of game.worldofdarkness.powers.hekau) {
                let id = hekau.name.toLowerCase();
                let name = hekau.name;
    
                hekaulist = Object.assign(hekaulist, {[id]: name});
            }
    
            listData.Hekau = hekaulist;

            let numinalist = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -"
            }
            
            for (const numina of game.worldofdarkness.powers.numina) {
                let id = numina.name.toLowerCase();
                let name = numina.name;
    
                numinalist = Object.assign(numinalist, {[id]: name});
            }

            listData.Numina = numinalist;

            
        }

        if (data.type == "Rote") {
            listData.SpellType = {
                "": "- " + game.i18n.localize("wod.labels.varies") + " -",
                "coincidental": game.i18n.localize("wod.spheres.coincidental"),
                "vulgar": game.i18n.localize("wod.spheres.vulgar")
            }
        }

        if (data.type == "Experience") {
            listData.Experience = {
                "": "- " + game.i18n.localize("wod.labels.select") + " -",
                "wod.types.expspent": game.i18n.localize("wod.types.expspent"),
                "wod.types.expgained": game.i18n.localize("wod.types.expgained")
            }
        }

        if (data.type == "Ability") {
            // the Ability is placed on an Actor (the item MUST have an specified ability type)
            if (data.actor != undefined) {
                listData.AbilityType = {
                    "wod.abilities.talent": game.i18n.localize("wod.abilities.talent"),
                    "wod.abilities.skill": game.i18n.localize("wod.abilities.skill"),
                    "wod.abilities.knowledge": game.i18n.localize("wod.abilities.knowledge")
                }
            }
            // the Ability is without Actor any will do.
            else {
                listData.AbilityType = {
                    "wod.abilities.ability": game.i18n.localize("wod.abilities.ability"),
                    "wod.abilities.talent": game.i18n.localize("wod.abilities.talent"),
                    "wod.abilities.skill": game.i18n.localize("wod.abilities.skill"),
                    "wod.abilities.knowledge": game.i18n.localize("wod.abilities.knowledge")
                }
            }
            
        }                  

        listData.Conscience = {
            "wod.advantages.virtue.conscience": game.i18n.localize("wod.advantages.virtue.conscience"),
            "wod.advantages.virtue.conviction": game.i18n.localize("wod.advantages.virtue.conviction")
        }

        listData.Selfcontrol = {
            "wod.advantages.virtue.selfcontrol": game.i18n.localize("wod.advantages.virtue.selfcontrol"),
            "wod.advantages.virtue.instinct": game.i18n.localize("wod.advantages.virtue.instinct")
        }
        
        // Actors
        if (isCharacter) {
            // Actor sheets: bio lists and system-wide selectors (PC + legacy)
            listData.Games = {
                "": "- " + game.i18n.localize("wod.labels.sheetsetting") + " -",
                "none": game.i18n.localize("wod.labels.nosetting"),
                "mortal": game.i18n.localize("wod.games.mortal"),
                "changeling": game.i18n.localize("wod.games.changeling"),
                "demon": game.i18n.localize("wod.games.demon"),
                "hunter": game.i18n.localize("wod.games.hunter"),
                "mummy": game.i18n.localize("wod.games.mummy"),
                "mage": game.i18n.localize("wod.games.mage"),
                "vampire": game.i18n.localize("wod.games.vampire"),
                "werewolf": game.i18n.localize("wod.games.werewolf"),
                "wraith": game.i18n.localize("wod.games.wraith"),
                "exalted": game.i18n.localize("wod.games.exalted")
            }

            // Werewolf the Apocalypse
            // ******** BREEDS
            listData.BreedList = this.GetWerewolfBreeds();
            listData.BreedListv2 = this.GetWerewolfBreedsv2();
            // ******** AUSPICES
            listData.AuspiceList = this.GetWerewolfAuspices();
            listData.AuspiceListv2 = this.GetWerewolfAuspicesv2();
            // ******** TRIBES
            listData.TribeList = this.GetWerewolfTribes(data, isCharacter);

            // Changing Breeds (Fera) override Breed/Auspice/Tribe lists
            if ((data.type == CONFIG.worldofdarkness.sheettype.changingbreed) && (data.system?.changingbreed != undefined)) {
                const feraLists = this.GetChangingBreedLists(data.system.changingbreed);

                if (feraLists.BreedList) listData.BreedList = feraLists.BreedList;
                if (feraLists.AuspiceList) listData.AuspiceList = feraLists.AuspiceList;
                if (feraLists.TribeList) listData.TribeList = feraLists.TribeList;
            }
            else if ((data.type === "PC") && (data.system.settings.splat === CONFIG.worldofdarkness.splat.changingbreed) && (data.system.settings.variant != undefined)) {
                const feraLists = this.GetChangingBreedLists(data.system.settings.variant);
                
                if (feraLists.BreedList) listData.BreedList = feraLists.BreedList;
                if (feraLists.AuspiceList) listData.AuspiceList = feraLists.AuspiceList;
                if (feraLists.TribeList) listData.TribeList = feraLists.TribeList;
            }

            // Mage the Ascension
            // ******** AFFILIATIONS
            listData.AffiliationList = this.GetMageAffiliations(data, isCharacter);
            // ******** SECTS
            listData.MageSectList = this.GetMageSects(data, isCharacter);

            // ******** SPHERES
            let spherelist = [{
                value: "",
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            }];

            for (const sphere in CONFIG.worldofdarkness.allSpheres) {
                const data = {
                    value: sphere,
                    label: game.i18n.localize(CONFIG.worldofdarkness.allSpheres[sphere]),
                    group: game.i18n.localize("wod.bio.mage.tradition")
                };
    
                spherelist.push(data);
            }

            for (const sphere in CONFIG.worldofdarkness.allSpheresTechnocracy) {
                const data = {
                    value: CONFIG.worldofdarkness.allSpheresTechnocracy[sphere],
                    label: game.i18n.localize(CONFIG.worldofdarkness.allSpheresTechnocracy[sphere]),
                    group: game.i18n.localize("wod.bio.mage.technocracy")
                };
    
                spherelist.push(data);
            }

            listData.SphereList = spherelist;
            
            // Vampire the Masquerade
            // ******** GENERATION
            listData.Generation = this.GetGeneration();

            // ******** SECTS 
            listData.SectList = this.GetVampireSects(data, isCharacter);

            // ******** CLANS
            listData.ClanList = this.GetVampireClans(data, isCharacter);

            // ******** PATHS 
            listData.PathList = this.GetVampirePaths(data, isCharacter);  

            if ((data.type == "PC") && (data.system.settings.splat === CONFIG.worldofdarkness.splat.changeling)) {
                listData.SeemingList = this.GetChangelingSeemingList();
                listData.CourtList = this.GetChangelingCourtList();
                //listData.KithList = this.GetChangelingKithList(data);
                listData.AffinityRealmList = this.GetChangelingAffinityRealmList(data);
            }
            else if ((data.type !== "PC") && (data.type == CONFIG.worldofdarkness.sheettype.changeling)) {
                listData.SeemingList = this.GetChangelingSeemingList();
                listData.CourtList = this.GetChangelingCourtList();
                listData.KithList = this.GetChangelingKithList(data);
                listData.AffinityRealmList = this.GetChangelingAffinityRealmList(data);
            }

            if ((data.type == "PC") && (data.system.settings.splat === CONFIG.worldofdarkness.splat.hunter)) {
                listData.CreedList = this.GetHunterCreedList();
                listData.PrimaryVirtueList = this.GetHunterPrimaryVirtueList();
            }
            else if ((data.type !== "PC") && (data.type == CONFIG.worldofdarkness.sheettype.hunter)) {
                listData.CreedList = this.GetHunterCreedList();
                listData.PrimaryVirtueList = this.GetHunterPrimaryVirtueList();
            }

            if ((data.type == "PC") && (data.system.settings.splat === CONFIG.worldofdarkness.splat.demon)) {
                listData.HouseList = this.GetDemonHouseList();
                listData.FactionList = this.GetDemonFactionList();
            }
            else if ((data.type !== "PC") && (data.type == CONFIG.worldofdarkness.sheettype.demon)) {
                listData.HouseList = this.GetDemonHouseList();
                listData.FactionList = this.GetDemonFactionList();
            }

            /*
             * add-wraith-shadow-budget §3.1 — the Shadow Archetype pick.
             *
             * ONE branch, not the two the lines above use, and the gate is `getSplat` rather than
             * `settings.splat` / `actor.type`. That is the v7.5.28 lesson applied here: a wodchar
             * wraith PC carries `variantsheet: "wraith"`, a splat-dropped one carries `splat`, a
             * legacy document carries only `actor.type`, and `getSplat` resolves all three in the
             * one order the rest of the system already agrees on. A `data.system.settings.splat`
             * test — the shape the changeling/hunter/demon branches use — would miss the imported
             * wraiths, which are the ones that have an Archetype to show.
             */
            if ((data?.type != undefined) && (getSplat(data) === CONFIG.worldofdarkness.splat.wraith)) {
                listData.ShadowArchetypeList = this.GetWraithShadowArchetypeList(data);
            }
        }
        // Dialogs and Items
        else {
            listData.Era = this.GetEraList();
            // Backward-compat alias for weapon templates
            listData.WeaponEra = this.GetWeaponEraList();

            let sheetlist = [{
                value: "",
                label: "- " + game.i18n.localize("wod.labels.select") + " -"
            }];

            for (const sheet in CONFIG.worldofdarkness.sheettype) {
                const data = {
                    value: sheet,
                    label: game.i18n.localize(CONFIG.worldofdarkness.sheettype[sheet]),
                };
    
                sheetlist.push(data);
            }

            listData.Sheet = sheetlist;

            // game lines, in powers orpheus is also a concept.
            if (data.type === "Power") {
                listData.Games = {
                    "": "- " + game.i18n.localize("wod.labels.select") + " -",
                    "changeling": game.i18n.localize("wod.games.changeling"),
                    "demon": game.i18n.localize("wod.games.demon"),
                    "hunter": game.i18n.localize("wod.games.hunter"),
                    "mummy": game.i18n.localize("wod.games.mummy"),
                    "mage": game.i18n.localize("wod.games.mage"),
                    "vampire": game.i18n.localize("wod.games.vampire"),
                    "werewolf": game.i18n.localize("wod.games.werewolf"),
                    "wraith": game.i18n.localize("wod.games.wraith"),
                    "orpheus": game.i18n.localize("wod.games.orpheus"),
                    "exalted": game.i18n.localize("wod.games.exalted")
                }
            }
            else {
                listData.Games = {
                    "": "- " + game.i18n.localize("wod.labels.select") + " -",
                    "changeling": game.i18n.localize("wod.games.changeling"),
                    "demon": game.i18n.localize("wod.games.demon"),
                    "hunter": game.i18n.localize("wod.games.hunter"),
                    "mummy": game.i18n.localize("wod.games.mummy"),
                    "mage": game.i18n.localize("wod.games.mage"),
                    "vampire": game.i18n.localize("wod.games.vampire"),
                    "werewolf": game.i18n.localize("wod.games.werewolf"),
                    "wraith": game.i18n.localize("wod.games.wraith"),
                    "exalted": game.i18n.localize("wod.games.exalted")
                }
            }            

            let abilitylist = [{}];

            for (const ability in CONFIG.worldofdarkness.talents) {
                let id = CONFIG.worldofdarkness.talents[ability];
                let name = game.i18n.localize(CONFIG.worldofdarkness.talents[ability]);
                let group = game.i18n.localize('wod.abilities.talents');
    
                const data = {
                    value: id,
                    label: name,
                    group: group
                };
    
                abilitylist.push(data);
            }
            for (const ability in CONFIG.worldofdarkness.skills) {
                if (ability == "technology") continue;
    
                let id = CONFIG.worldofdarkness.skills[ability];
                let name = game.i18n.localize(CONFIG.worldofdarkness.skills[ability]);
                let group = game.i18n.localize('wod.abilities.skills');
    
                const data = {
                    value: id,
                    label: name,
                    group: group
                };
    
                abilitylist.push(data);
            }
            for (const ability in CONFIG.worldofdarkness.knowledges) {
                if (ability == "research") continue;
    
                let id = CONFIG.worldofdarkness.knowledges[ability];
                let name = game.i18n.localize(CONFIG.worldofdarkness.knowledges[ability]);
                let group = game.i18n.localize('wod.abilities.knowledges');
    
                const data = {
                    value: id,
                    label: name,
                    group: group
                };
    
                abilitylist.push(data);
            }
    
            listData.AbilityList = abilitylist;

            listData.Dice1 = [
                {
                    value: "", 
                    label: "- " + game.i18n.localize("wod.labels.power.noattribute") + " -"
                }
            ];
            listData.Dice2 = [
                {
                    value: "", 
                    label: "- " + game.i18n.localize("wod.labels.power.noability") + " -"
                }
            ];
    
            // ******** BONUS
            listData.BonusLista = [
                {
                    value: "", 
                    label: "- " + game.i18n.localize("wod.labels.select") + " -"
                },
                {
                    value: "attribute_buff", 
                    label: game.i18n.localize("wod.labels.bonus.attributebonus"), 
                    group: game.i18n.localize("wod.attributes.attributes")
                },
                {
                    value: "attribute_fixed_value", 
                    label: game.i18n.localize("wod.labels.bonus.attributefixedvalue"), 
                    group: game.i18n.localize("wod.attributes.attributes")
                },
                {
                    value: "attribute_dice_buff", 
                    label: game.i18n.localize("wod.labels.bonus.attributedicebonus"),
                    group: game.i18n.localize("wod.attributes.attributes")
                },
                {
                    value: "attribute_diff", 
                    label: game.i18n.localize("wod.labels.bonus.attributediff"),
                    group: game.i18n.localize("wod.attributes.attributes")
                },
                {
                    value: "attribute_auto_buff", 
                    label: game.i18n.localize("wod.labels.bonus.attributesucc"),
                    group: game.i18n.localize("wod.attributes.attributes")
                },
                {
                    value: "ability_buff", 
                    label: game.i18n.localize("wod.labels.bonus.abilitybonus"),
                    group: game.i18n.localize("wod.abilities.abilities")
                },
                {
                    value: "ability_diff", 
                    label: game.i18n.localize("wod.labels.bonus.abilitydiff"),
                    group: game.i18n.localize("wod.abilities.abilities")
                },
                {
                    value: "attack_buff", 
                    label: game.i18n.localize("wod.labels.bonus.attackbuff"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "attack_diff", 
                    label: game.i18n.localize("wod.labels.bonus.attackdiff"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "soak_buff", 
                    label: game.i18n.localize("wod.labels.bonus.soakbonus"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "soak_diff", 
                    label: game.i18n.localize("wod.labels.bonus.soakdiffbonus"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "health_buff", 
                    label: game.i18n.localize("wod.labels.bonus.healthbuff"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "initiative_buff", 
                    label: game.i18n.localize("wod.labels.bonus.initbonus"),
                    group: game.i18n.localize("wod.labels.combatlabel")
                },
                {
                    value: "frenzy_buff", 
                    label: game.i18n.localize("wod.labels.bonus.frenzybuff"),
                    group: game.i18n.localize("wod.labels.other")
                },
                {
                    value: "frenzy_diff", 
                    label: game.i18n.localize("wod.labels.bonus.frenzydiff"),
                    group: game.i18n.localize("wod.labels.other")
                },
                {
                    value: "movement_buff", 
                    label: game.i18n.localize("wod.labels.bonus.movebonus"),
                    group: game.i18n.localize("wod.labels.other")
                }
            ];
        }             

        // ******** VALUES 1-5, 1-9, and so on
        listData.Levelnegative3Value = [
            {
                value: 0, 
                label: "0"
            },
            {
                value: -1, 
                label: "-1"
            },
            {
                value: -2, 
                label: "-2"
            },  
            {
                value: -3, 
                label: "-3"
            }
        ];
        
        listData.Level5Value = this.GetValueList(1, 6, "", "- " + game.i18n.localize("wod.labels.select") + " -");

        listData.Level6Value = this.GetValueList(1, 7, "", "- " + game.i18n.localize("wod.labels.select") + " -");

        listData.Level9Value = this.GetValueList(1, 10, "", "- " + game.i18n.localize("wod.labels.select") + " -");

        listData.Level10Value = this.GetValueList(1, 11, "", "- " + game.i18n.localize("wod.labels.select") + " -");

        listData.ZeroToNine = this.GetValueList(0, 10, 0, "- " + game.i18n.localize("wod.labels.select") + " -"); 

        listData.DifficultyList = this.GetValueList(CONFIG.worldofdarkness.lowestDifficulty, 10, -1, "- " + game.i18n.localize("wod.labels.donotshow") + " -"); 

        return listData;
    }    
    //#endregion

    //#region Shared utilities (option helpers + Era/Conceal)

    /**
     * Era: options for `system.era` (weapons) and `item.system.settings.era` (splat items).
     * Values are localization keys from `CONFIG.worldofdarkness.era` (e.g. `"wod.era.modern"`).
     */
    static GetEraList() { return getEraList(); }

    static GetWeaponEraList() { return getWeaponEraList(); }

    /**
     * Conceal: weapon concealment code list (P/J/T/NA) with era-aware labels.
     * Used by `templates/sheets/*weapon-sheet.html` for `system.conceal`.
     */
    static GetWeaponConcealList(itemData) { return getWeaponConcealList(itemData); }

    static _selectPlaceholder(labelKey = "wod.labels.select") { return selectPlaceholder(labelKey); }

    static _makeLocalizedOptionMap(values, opts) { return makeLocalizedOptionMap(values, opts); }

    //#endregion

    //#region Changeling (Bio tab lists)

    /** Changeling Seeming list (Bio tab). */
    static GetChangelingSeemingList() { return getChangelingSeemingList(); }

    /** Changeling Court list (Bio tab). */
    static GetChangelingCourtList() { return getChangelingCourtList(); }

    /**
     * Changeling Kith list (Bio tab).
     * - Includes a custom option unless variant is Inanimae or Darkkin.
     * - Uses `game.worldofdarkness.bio.kith[variant]`.
     */
    static GetChangelingKithList(actorData) { return getChangelingKithList(actorData); }

    /**
     * Changeling Affinity Realm list (Bio tab).
     * Prefer deriving from actor Trait items (type: realms) to avoid ordering issues.
     */
    static GetChangelingAffinityRealmList(actorData) { return getChangelingAffinityRealmList(actorData); }

    //#endregion

    //#region Hunter (Bio tab lists)

    /** Hunter Creed list (Bio tab). */
    static GetHunterCreedList() { return getHunterCreedList(); }

    /** Hunter primary Virtue list (Bio tab). */
    static GetHunterPrimaryVirtueList() { return getHunterPrimaryVirtueList(); }

    //#endregion

    //#region Demon (Bio tab lists)

    /** Demon House list (Bio tab). */
    static GetDemonHouseList() { return getDemonHouseList(); }

    /** Demon Faction list (Bio tab). */
    static GetDemonFactionList() { return getDemonFactionList(); }

    //#endregion

    //#region Changing Breeds / Fera (Bio tab lists)

    static GetChangingBreedLists(changingbreed) { return getChangingBreedLists(changingbreed); }

    //#endregion

    //#region Power roll helpers (Dice1/Dice2 lists for power sheets)

    /**
     * Dice1List: attribute/advantage selector for power rolls.
     * Used by `templates/sheets/parts/power_rollable.html` for `system.dice1`.
     */
    static GetPowerDice1List(itemData) { return getPowerDice1List(itemData); }

    /**
     * Dice2List: ability/attribute selector for power rolls.
     * Used by `templates/sheets/parts/power_rollable.html` for `system.dice2`.
     */
    static GetPowerDice2List(itemData) { return getPowerDice2List(itemData); }

    //#endregion

    //#region Numeric helpers (generic value lists)

    static GetValueList(begin, end, startvalue, headline) { return getValueList(begin, end, startvalue, headline); }

    /** Vampire Generation list (4..16). Used by Vampire bio. */
    static GetGeneration() { return getGeneration(); }

    //#endregion

    //#region Vampire (Bio tab lists)

    static GetVampireSects(actor, isCharacter) { return getVampireSects(actor, isCharacter); }

    static GetVampireClans(actor, isCharacter) { return getVampireClans(actor, isCharacter); }

    static GetVampirePaths(actor, isCharacter) { return getVampirePaths(actor, isCharacter); }

    //#endregion

    //#region Werewolf (Bio tab lists)

    static GetWerewolfBreeds() { return getWerewolfBreeds(); }

    static GetWerewolfBreedsv2() { return getWerewolfBreedsv2(); }

    static GetWerewolfAuspices() { return getWerewolfAuspices(); }

    static GetWerewolfAuspicesv2() { return getWerewolfAuspicesv2(); }

    static GetWerewolfTribes(actor, isCharacter) { return getWerewolfTribes(actor, isCharacter); }

    //#endregion

    //#region Mage (Bio tab lists)

    static GetMageAffiliations(actor, isCharacter) { return getMageAffiliations(actor, isCharacter); }

    static GetMageSects(actor, isCharacter) { return getMageSects(actor, isCharacter); }
    //#endregion

    //#region Wraith (Bio tab lists)

    /**
     * Shadow Archetype list (Bio tab). Read from the installed `wraith-shadow-archetypes` pack, with
     * the actor's own stored value preserved as an option — see `select/wraith.js` for why that is
     * what makes the `input` -> `select` promotion migration-free.
     */
    static GetWraithShadowArchetypeList(actor) { return getWraithShadowArchetypeList(actor); }

    //#endregion
}

