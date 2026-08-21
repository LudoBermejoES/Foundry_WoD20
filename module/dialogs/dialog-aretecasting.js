import { DiceRoller } from "../scripts/roll-dice.js";
import { DiceRollContainer } from "../scripts/roll-dice.js";
import PrismHelper from "../scripts/prism-helpers.js";
import { AUTO_PRACTICE_RULES, CORRUPTED_PRACTICE_RULES } from "../scripts/prism-practice-data.js";
import { createCorruptedResistanceCard } from "../scripts/prism-corrupted-card.js";
import { createParadoxCard } from "../scripts/paradox-card.js";
import {
    isFormulaRoll as _isFormulaRoll,
    resolveAttributeRating,
    resolveAbilityRating
} from "../scripts/formula-casting-helpers.js";
import { activeDotCount } from "../scripts/casting-dot-helpers.js";
import {
    highestSelectedSphereRank,
    computeCastingDifficulty,
    capDifficultyToRollable
} from "../scripts/casting-difficulty-helpers.js";

/**
    * Handles the information needed to use magic.
    * @name
    * @selectedSpheres
    * @difficulty
    * @description
    * @spelltype
    * @hasWitnesses
    * @isRote
*/
export class Rote {
    constructor(item) {
        this.name = "";
        this.selectedSpheres = [];
        this.description = "";        

        this.check_instrumentPerson = false;
		this.check_instrumentUnique = false;
        this.check_instrumentWithout = false;
        this.check_instrumentUnnecessary = false;

        this.check_resonanceAppropriate = false;
        this.check_resonanceOpposed = false;
        this.check_resonanceMysic = false;

        this.check_timeFast = false;
        this.check_timeBackwards = false;

        this.check_targetDistant = false;

        this.select_instrumentUnfamiliar = 0;
        this.select_instrumentPersonalItem = 0;

        this.select_spendingTime = 0;

        this.select_researchDone = 0;
        this.select_nodePresence = 0;
        this.select_effectsSeveral = 0;
        this.select_mageDistracted = 0;
        this.select_mageAvatarConflict = 0;
        this.select_dominoEffect = 0;
        this.select_deedOutlandish = 0;

        this.quintessence = 0;      
        
        this.spelltype = "coincidental";
        this.witnesses = false;

        this.areteModifier = 0;

        this.baseDifficulty = -1;           // difficulty based on the selected spheres/ spell type / witness
        this.difficultyModifier = 0;        // if other modifiers not listed are added
        this.sumSelectedDifficulty = 0;
        this.totalDifficulty = 0;           // all in all difficulty
        this.shownDifficulty = 0;

        this.useSpeciality = false;
        this.useWillpower = false;
        this.ignoreSphereBaseDifficulty = false;

        this.isRote = false;
        this.canCast = false;
        this.close = false;

        // fix-formula-casting D1/D3 — a Fórmula's own Atributo+Habilidad pair, empty by default
        // (every pre-existing Rote and every improvised cast). Both non-empty is what D3's pool
        // branch and D5's Willpower-restriction fix key on — see `isFormulaRoll()` below.
        this.attribute = "";
        this.ability = "";

        this.isExtendedCasting = false;
        this.keepDifficulty = false;
        this.totalSuccesses = 0;
        this.selectedMods = [];

        // add-paradox-system task 3.4 — this Rote instance's own roll index within an extended
        // (ritual) casting, fed to `computeParadoxGain()`'s `ritualRollNumber`. Incremented once
        // per `_castSpell()` call on this SAME dialog instance; never reset by an intermediate
        // failure, matching the ritual tax's own "no reset on failure" rule.
        this.paradoxRollCount = 0;

        // add-prism-of-focus-foundry — design.md D4/D11/D12. Only meaningful when the casting
        // actor has `hasprismoffocus` active; every field below is a no-op otherwise (see
        // `DialogAreteCasting._applyPrismModifiers`).
        this.prismPracticeId = "";               // the Práctica channeling this cast (D4 selector)
        this.prismFormulaBacked = (item != undefined); // is this cast backed by a learned Fórmula? (D11/D13)
        this.prismCheckBenefit = false;         // D12 auto-bucket Beneficio checkbox
        this.prismCheckPenalty = false;         // D12 auto-bucket Penalización checkbox
        this.prismTier = 0;                      // D12 tiered-rule magnitude (Inversión, Mediumnidad, ...)
        this.prismCrossActorUuid = "";           // A22 Ciencia Extraña's cross-actor target
        this.formulaItem = item;                 // kept for D13's ResolvePracticeForFormula lookup

        if (item != undefined) {
            this.name = item["name"];

            for (const sphere in CONFIG.worldofdarkness.allSpheres) {
                if (item.system[sphere] > 0) {
                    this.selectedSpheres[sphere] = item.system[sphere];
                }
            }

            if (item.system["description"] != "") {
                this.description = item.system["description"];
            }

            if (item.system["spelltype"] != "") {
                this.spelltype = item.system["spelltype"];
            }

            this.check_instrumentPerson = item.system.instrument["ispersonalized"];
		    this.check_instrumentUnique = item.system.instrument["isunique"];

            if (item.system["spendingtime"] < 0) {
                this.select_spendingTime = parseInt(item.system["spendingtime"]);
            }		    

            this.isExtendedCasting = item.system["isextended"];

            this.isRote = true;

            // fix-formula-casting D1 — read once at cast time; the item's own fields are the
            // single source of truth, never re-derived from the Práctica selector below.
            this.attribute = item.system["attribute"] || "";
            this.ability = item.system["ability"] || "";

            if (this.check_instrumentPerson) {
                this.sumSelectedDifficulty -= 1;
            }
            if (this.check_instrumentUnique) {
                this.sumSelectedDifficulty -= 1;
            }
            if (this.select_spendingTime < 0) {
                this.sumSelectedDifficulty -= this.select_spendingTime * -1;
            }

            this._setDifficulty(this._highestRank());            
        }
    }

    /**
     * fix-formula-casting D3 — true only when this Fórmula declares BOTH an Attribute and an
     * Ability (M20 Prism of Focus: "en lugar de Areté, el mago tira su Atributo + Habilidad").
     * False for every improvised cast and every Rote that predates this change (both fields
     * default to ""), which keeps rolling Areté exactly as before — D1's explicit safe default.
     */
    isFormulaRoll() {
        return _isFormulaRoll(this);
    }

    /**
     * add-paradox-system task 4.3 — delegates to the pure helper so the arithmetic (highest rank,
     * never the sum, `core:19575`) is importable by a test. Behaviour unchanged.
     */
    _highestRank() {
        return highestSelectedSphereRank(this.selectedSpheres);
    }

    /**
     * add-paradox-system task 4.1 — delegates to `computeCastingDifficulty()` so this arithmetic is
     * importable by a test. Behaviour unchanged: when the helper returns `null` (no recognised
     * `spelltype`/no Sphere selected and no manual override), `baseDifficulty`/`totalDifficulty`/
     * `shownDifficulty` are left exactly as they were, and -1 is returned, same as before.
     */
    _setDifficulty(rank) {
        const result = computeCastingDifficulty({
            rank,
            spelltype: this.spelltype,
            witnesses: this.witnesses,
            ignoreSphereBaseDifficulty: this.ignoreSphereBaseDifficulty,
            manualBaseDifficulty: this.baseDifficulty,
            sumSelectedDifficulty: this.sumSelectedDifficulty,
            difficultyModifier: this.difficultyModifier,
            quintessence: this.quintessence,
            lowestDifficulty: CONFIG.worldofdarkness.lowestDifficulty
        });

        if (result === null) {
            return -1;
        }

        this.baseDifficulty = result.baseDifficulty;
        this.totalDifficulty = result.totalDifficulty;
        this.shownDifficulty = result.shownDifficulty;

        return result.baseDifficulty;
    }

}

export class DialogAreteCasting extends FormApplication {
    constructor(actor, rote) {
        super(rote, {submitOnChange: true, closeOnSubmit: false});
        this.actor = actor;        
        this.isDialog = true;

        if (rote.isRote) {
            this.options.title = `${this.actor.name} - ${game.i18n.localize("wod.dialog.aretecasting.casting")} ${rote.name}`;
        }
        else {
            this.options.title = `${this.actor.name} - ${game.i18n.localize("wod.dialog.aretecasting.castingspell")}`;
        }
    }


    /**
        * Extend and override the default options used by the WoD Actor Sheet
        * @returns {Object}
    */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["wod20 wod-dialog aretecasting-dialog mageDialog"],
            template: "systems/worldofdarkness/templates/dialogs/dialog-aretecasting.hbs",
            closeOnSubmit: false,
            submitOnChange: true,
            resizable: true
        });
    }

    async getData() {
        const data = super.getData();

        data.config = CONFIG.worldofdarkness;
        data.actorData = this.actor.system;          // used in the dialog html

        if (this.actor.type === "PC") {
             data.spheres = this.actor.items.filter(item => item.type === "Sphere" && item.system.settings.isvisible);
             data.spheres = data.spheres.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));
        }

        // fix-formula-casting D4 — "Esferas disponibles" must show the ROTE's OWN required
        // Spheres+levels (object.selectedSpheres, already correctly computed for difficulty) when
        // casting a saved Rote/Fórmula, not the caster's owned Spheres — those are two different
        // things this dialog was conflating (see design.md's Context). Built once here so both
        // templates (legacy and redesigned) read the same data. Warns, never blocks (D4/Non-Goals'
        // "warn, don't block" convention, matching the existing Práctica-rating-shortfall
        // precedent) when the caster's own rating in a required Sphere falls short.
        if (this.object.isRote) {
            data.formulaSphereRows = Object.entries(this.object.selectedSpheres)
                .filter(([, requiredRank]) => requiredRank > 0)
                .map(([sphereKey, requiredRank]) => ({
                    key: sphereKey,
                    labelKey: CONFIG.worldofdarkness.allSpheres[sphereKey],
                    requiredRank: requiredRank,
                    warn: this._callerSphereRank(sphereKey) < requiredRank
                }));
        }

        // add-prism-of-focus-foundry — D4's casting-dialog Práctica selector, shown only when the
        // ruleset is active on this actor (byte-identical dialog otherwise).
        data.prismActive = PrismHelper.IsActive(this.actor);

        if (data.prismActive) {
            data.prismPractices = PrismHelper.ListOwnedPractices(this.actor).map((row) => ({
                id: row.id,
                name: row.item.name,
                value: parseInt(row.item.system.value) || 0,
                state: row.state,
                benefit_es: row.mechanics.benefit_es ?? "",
                penalty_es: row.mechanics.penalty_es ?? ""
            }));

            // D13/task 7.3 — when this cast IS a learned Fórmula, resolve which owned Práctica (or
            // its Especialidad) actually backs it, rather than assuming the player's default pick.
            // Never overrides a selection the player already made.
            if (!this.object.prismPracticeId && this.object.formulaItem) {
                const resolved = await PrismHelper.ResolvePracticeForFormula(this.actor, this.object.formulaItem);
                if (resolved && data.prismPractices.some((p) => p.id === resolved.practiceId)) {
                    this.object.prismPracticeId = resolved.practiceId;
                }
            }

            // D4 — default to the highest-rated Práctica covering the Sphere level being cast,
            // remaining a plain, editable dropdown (never locking the field).
            if (!this.object.prismPracticeId && data.prismPractices.length) {
                const targetRank = this.object._highestRank();
                const covering = data.prismPractices.filter((p) => targetRank < 0 || p.value >= targetRank);
                const pool = covering.length ? covering : data.prismPractices;
                this.object.prismPracticeId = pool.reduce((best, p) => (!best || p.value > best.value ? p : best), null)?.id ?? "";
            }

            const selected = data.prismPractices.find((p) => p.id === this.object.prismPracticeId) ?? null;
            data.prismSelected = selected;
            data.prismStateModifier = selected ? PrismHelper.CheckPracticeState(this.actor, selected.id) : 0;
            // D16/task 10.6 — a Práctica Corrupta's own rule table is consulted too, so its named
            // Beneficio/Precio gets the same checkbox/tiered UI when its shape is a dice modifier.
            data.prismRule = selected ? (AUTO_PRACTICE_RULES[selected.id] ?? CORRUPTED_PRACTICE_RULES[selected.id]) : null;
            data.prismRuleWarning = (selected && this.object._highestRank() > selected.value)
                ? game.i18n.localize("wod.prism.dialog.ratingbelowsphere")
                : "";
        }

        return data;
    }

    /**
     * D4/D11/D12/D15 — applies every Prisma de Foco modifier this dialog gathers, ADDITIONAL to
     * the existing `sumSelectedDifficulty` the generic checkbox loop in `_updateObject` already
     * computed. Kept as its own method (rather than folded into that loop) because these modifiers
     * are keyed off a dynamically-selected Práctica, not a static per-checkbox `value` attribute the
     * generic loop reads from the DOM.
     * @returns {number} the extra difficulty modifier to add to `sumSelectedDifficulty`
     */
    _applyPrismModifiers() {
        if (!PrismHelper.IsActive(this.actor)) return 0;
        if (!this.object.prismPracticeId) return 0;

        let extra = 0;
        const practiceId = this.object.prismPracticeId;

        extra += PrismHelper.CheckPracticeState(this.actor, practiceId);

        const targetActor = this.object.prismCrossActorUuid
            ? fromUuidSync?.(this.object.prismCrossActorUuid) ?? null
            : null;

        const benefit = PrismHelper.CheckPracticeBenefit(this.actor, practiceId, {
            checked: this.object.prismCheckBenefit,
            tier: this.object.prismTier,
            targetActor
        });
        const penalty = PrismHelper.CheckPracticePenalty(this.actor, practiceId, {
            checked: this.object.prismCheckPenalty,
            tier: this.object.prismTier,
            targetActor
        });

        extra += (benefit.modifier || 0) + (penalty.modifier || 0);
        this.object.prismForcesCoincidental = !!benefit.forcesCoincidental;
        this.object.prismForcesParadojaVulgar = !!penalty.forcesParadojaVulgar;

        // D16/task 10.6 — the 3 Prácticas Corruptas whose Precio is NOT a dice modifier (Abismalismo's
        // Silence floor, Goetia's catastrophic-failure branch, Vamamarga's own Jhor track): captured
        // here so `_castSpell` can surface each as its own chat message once the roll resolves.
        this.object.prismSilenceFloor = penalty.silenceFloor ?? null;
        this.object.prismFailureBranch = !!penalty.failureBranch;
        this.object.prismJhorResonance = !!penalty.jhorResonance;

        // C3/D11 — the general improvised-quick-cast +1, disjoint from Magia del caos's own
        // Fórmula-only Penalización (D11's closing paragraph).
        extra += PrismHelper.CheckImprovisedPenalty(this.object.prismFormulaBacked, practiceId);
        if (practiceId === "chaos-magick") {
            extra += PrismHelper.CheckChaosMagickFormulaPenalty(this.object.prismFormulaBacked);
        }

        return extra;
    }

    /**
     * fix-formula-casting D4 — the caster's OWN rating in a Sphere, regardless of the
     * `isvisible`/rank-0 filtering `getData()`'s `data.spheres` already applies (a required
     * Sphere the caster rates at 0 must still be comparable against the Fórmula's requirement).
     */
    _callerSphereRank(sphereKey) {
        if (this.actor.type === "PC") {
            const item = this.actor.items.find((i) => i.type === "Sphere" && i.system.id === sphereKey);
            return parseInt(item?.system?.value ?? 0) || 0;
        }

        return parseInt(this.actor.system?.spheres?.[sphereKey]?.value ?? 0) || 0;
    }

    /**
     * fix-formula-casting D3 — resolves the Atributo+Habilidad pool for a Fórmula whose
     * `isFormulaRoll()` is true. Attribute rating read the same way `api-handler.js`'s
     * `rollAttribute` already does (`actor.system.attributes[key].total`). Ability rating checks
     * an owned PRIMARY Ability item by `system.id` first (covers the fixed 41-entry vocabulary,
     * and every canonical Fórmula this change's own content extraction resolved to one), then an
     * owned SECONDARY-ability Trait item by its `wod20-compendium-es` provenance flag (secondary
     * abilities carry no catalog-slug field of their own — see design.md D2's note on the split
     * vocabulary). Either half resolves to 0, never throws, when the caster doesn't own a
     * matching item — the same "flag missing data, don't fabricate" norm as the content parser
     * (design.md, Risks).
     * @returns {{attributeValue: number, attributeLabel: string, abilityValue: number, abilityLabel: string}}
     */
    _formulaPool() {
        const attributeKey = this.object.attribute;
        const abilityKey = this.object.ability;

        const attributeValue = resolveAttributeRating(this.actor, attributeKey);
        const attributeLabelKey = CONFIG.worldofdarkness.attributes20?.[attributeKey]
            ?? CONFIG.worldofdarkness.attributes?.[attributeKey];
        const attributeLabel = attributeLabelKey ? game.i18n.localize(attributeLabelKey) : attributeKey;

        const abilityValue = resolveAbilityRating(this.actor, abilityKey);

        const primaryAbility = this.actor.items?.find(
            (i) => i.type === "Ability" && i.system.id === abilityKey
        );

        let abilityLabel = abilityKey;

        if (primaryAbility) {
            abilityLabel = game.i18n.localize(primaryAbility.system.label) || primaryAbility.name;
        }
        else {
            const secondaryAbility = this.actor.items?.find(
                (i) => i.type === "Trait"
                    && i.flags?.["wod20-compendium-es"]?.id === abilityKey
            );

            if (secondaryAbility) {
                abilityLabel = secondaryAbility.system.label || secondaryAbility.name;
            }
            else {
                const configKey = CONFIG.worldofdarkness.talents?.[abilityKey]
                    ?? CONFIG.worldofdarkness.skills?.[abilityKey]
                    ?? CONFIG.worldofdarkness.knowledges?.[abilityKey];

                if (configKey) {
                    abilityLabel = game.i18n.localize(configKey);
                }
            }
        }

        return { attributeValue, attributeLabel, abilityValue, abilityLabel };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._setupDotCounters(html);

        html
            .find(".resource-value > .resource-value-step")
            .click(this._onDotSphereChange.bind(this));

        html
            .find('.dialog-difficulty-button')
            .click(this._setDifficulty.bind(this));

        html
            .find('.actionbutton')
            .click(this._castSpell.bind(this));

        html
            .find('.closebutton')
            .click(this._closeForm.bind(this));
    }
    
    close() {
        // do something for 'on close here'
        super.close()
    }

    /**
     * Restores the active dots after a render. Load-bearing: `_onDotSphereChange()` ends in
     * `this.render()`, so this runs after EVERY dot click and is the only thing that puts the
     * caster's selection back on screen.
     *
     * fix-casting-sphere-dots — reads `this.object.selectedSpheres` DIRECTLY and must keep doing
     * so. It used to call `this.getData()`, which silently broke the moment
     * `add-prism-of-focus-foundry` made that method `async`: the returned `Promise` has no
     * `.object`, the optional chain short-circuited, no dot was ever activated, and every click
     * looked like it erased the caster's own selection. Awaiting it would have worked and would
     * have left the same trap armed for the next async lifecycle method; `selectedSpheres` lives on
     * `this.object`, so this method never needed `getData()` in the first place.
     * Guarded by `.github/scripts/test-casting-dots.mjs`.
     */
    _setupDotCounters(html) {
        const selectedSpheres = this.object?.selectedSpheres;

        html.find(".resource-value").each(function () {
            const sphere = this.dataset.name;

            // Fills from the dialog's current selection — the Rote's own required Spheres when
            // casting a saved Fórmula, whatever the caster has clicked on an improvised cast.
            // Works for both legacy and PC actors since they use the same sphere IDs.
            const value = activeDotCount(selectedSpheres, sphere);

            if (value <= 0) {
                return;
            }

            $(this)
                .find(".resource-value-step")
                .each(function (i) {
                    if (i + 1 <= value) {
                        $(this).addClass("active");
                    }
                });
        });
    }

    _setDifficulty(event) {
        if (!this.object.ignoreSphereBaseDifficulty) {
            return;
        }

        const element = event.currentTarget;
        const parent = $(element.parentNode);
        const steps = parent.find(".dialog-difficulty-button");
        const index = element.value;   

        this.object.baseDifficulty = parseInt(index);     
        steps.removeClass("active");

        steps.each(function (i) {
            if (parseInt(this.value) == index) {
                $(this).addClass("active");
            }
        });

        this.object._setDifficulty(0);
    }

    async _updateObject(event, formData){
        if (this.object.close) {
            this.close();
            return;
        }

        let found = false;

        for (const sphere in CONFIG.worldofdarkness.allSpheres) {
            if (this.object.selectedSpheres[sphere] > 0) {
                found = true;
            }
        }

        if (!found) {
            ui.notifications.warn(game.i18n.localize("wod.dialog.aretecasting.selectsphere"));
            this.render();
            return;
        }

        event.preventDefault();    
        
        let totalDiff = 0;
        this.object.selectedMods = [];

        for (const value in formData) {
            if (value.startsWith('object.check_')) {
                let elementName = '[name="'+value+'"]';
                let objectname = value.replace("object.", "");                

                if (formData[value] == null) {
                    this.object[objectname] = false;
                }
                else {
                    totalDiff += parseInt(document.querySelector(elementName+':checked').value);
                    this.object[objectname] = true;

                    if (parseInt(document.querySelector(elementName+':checked').value) != 0) {
                        let name = value.toLowerCase().replace("object.check_", "");

                        // A dynamically-rendered merit/flaw checkbox (`check_meritmod_<itemId>`, built
                        // by DialogCasting._meritModifiers) has no `wod.dialog.aretecasting.*` i18n key —
                        // there is no key to author, the label is the entity's own `label_es`. Foundry's
                        // localize() returns the key string itself when unresolved, so without this
                        // guard the breakdown would show a raw, unlocalized "meritmod_<itemId>". Every
                        // OTHER field is unaffected: the fallback below is byte-identical to before.
                        if (name.startsWith("meritmod_")) {
                            const itemId = value.replace("object.check_meritmod_", "");
                            const label = this.object.meritModifierLabels?.[itemId];

                            if (label !== undefined) {
                                this.object.selectedMods.push(label);
                                continue;
                            }
                        }

                        this.object.selectedMods.push(game.i18n.localize("wod.dialog.aretecasting." + name));
                    }
                }
            }

            if (value.startsWith('object.select_')) {
                totalDiff += parseInt(formData[value]);

                if (parseInt(formData[value]) != 0) {
                    let name = value.toLowerCase().replace("object.select_", "");
                    this.object.selectedMods.push(game.i18n.localize("wod.dialog.aretecasting." + name));
                }
                
                let objectname = value.replace("object.", "");
                let formValue = formData[value];

                if (parseInt(this.object[objectname]) != parseInt(formValue)) {
                    this.object[objectname] = parseInt(formValue);
                }                
            }
        }

        // add-prism-of-focus-foundry — parsed OUTSIDE the generic `object.check_*`/`object.select_*`
        // loops above (deliberately not prefixed `check_`/`select_`): their modifiers are dynamic,
        // keyed off the selected Práctica, not a static per-checkbox `value` attribute the generic
        // loop reads from the DOM.
        if (PrismHelper.IsActive(this.actor)) {
            this.object.prismPracticeId = formData["object.prismPracticeId"] ?? this.object.prismPracticeId;
            this.object.prismCheckBenefit = !!formData["object.prismCheckBenefit"];
            this.object.prismCheckPenalty = !!formData["object.prismCheckPenalty"];
            this.object.prismTier = parseInt(formData["object.prismTier"]) || 0;
            this.object.prismFormulaBacked = this.object.isRote ? true : !!formData["object.prismFormulaBacked"];
            totalDiff += this._applyPrismModifiers();
        }

        this.object.quintessence = parseInt(formData["object.quintessence"]);
        this.object.sumSelectedDifficulty = parseInt(totalDiff);
        this.object.difficultyModifier = parseInt(formData["object.difficultyModifier"]);

        if (formData["object.spelltype"] != "null") {
            this.object.spelltype = formData["object.spelltype"];
        }
        else {
            this.object.spelltype = "";
        }
        
        this.object.witnesses = formData["object.witnesses"];
        this.object.isExtendedCasting = formData["object.isExtendedCasting"];

        if (!this.object.isExtendedCasting) {
            this.object.keepDifficulty = false;
        }
        else {
            this.object.keepDifficulty = formData["object.keepDifficulty"];
        }


        this.object.useSpeciality = formData["object.useSpeciality"];
        this.object.useWillpower = formData["object.useWillpower"];
        this.object.ignoreSphereBaseDifficulty = formData["object.ignoreSphereBaseDifficulty"];

        this.object.areteModifier = parseInt(formData["object.areteModifier"]);

        this.object.canCast = this._calculateDifficulty(false);   
        this.render();
    }

    /* sets what level the clicked sphere is to be using */
    _onDotSphereChange(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        const parent = $(element.parentNode);
        const index = Number(dataset.index);
        const sphere = parent[0].dataset.name;
        const steps = parent.find(".resource-value-step");

        if (index < 0 || index > steps.length) {
            return;
        }        

        steps.removeClass("active");

        let value = 0;

        if ((index == 0) && (this.object.selectedSpheres[sphere] == 1)) {
            value = 0;
        }
        else {
            value = parseInt(index + 1);

            steps.each(function (i) {
                if (i <= index) {
                    $(this).addClass("active");
                }
            });
        }

        this.object.selectedSpheres = this._changedSelectedSphere(this.object.selectedSpheres, sphere, value);
        this.object.canCast = this._calculateDifficulty(false);
        this.render();
    }

    /* clicked on cast Spell */
    async _castSpell(event) {
        let specialityRoll = false;
        let specialityText = "";
        let template = [];
        let extraInfo = [];
        let action = "";

        this.object.canCast = this._calculateDifficulty(true);

        if (this.object.canCast) {
            if (this.object.isRote) {
                action = this.object.name;
            }
            else {
                action = game.i18n.localize("wod.dialog.aretecasting.castingarete");
            }           
            
            // fix-formula-casting D3/D6 — a Fórmula declaring both Atributo+Habilidad rolls THAT
            // pool instead of Areté; `areteModifier` is reused unchanged as a generic pool
            // modifier either way (D6), only the chat-card label differs.
            const isFormulaRoll = this.object.isFormulaRoll();
            let formulaPool = null;

            if (isFormulaRoll) {
                formulaPool = this._formulaPool();
                template.push(`${formulaPool.attributeLabel} (${formulaPool.attributeValue})`);
                template.push(`${formulaPool.abilityLabel} (${formulaPool.abilityValue})`);
            }
            else if (this.actor.type === "PC") {
                const arete = this.actor.api?.getAdvantage("arete");
                template.push(`${game.i18n.localize("wod.advantages.arete")} (${arete?.system?.roll ?? 0})`);
            }
            else {
                template.push(`${game.i18n.localize("wod.advantages.arete")} (${this.actor.system.advantages.arete.roll})`);
            }

            const poolBonusLabel = isFormulaRoll
                ? "wod.dialog.formula.poolbonus"
                : "wod.dialog.aretecasting.aretebonus";

            if (parseInt(this.object.areteModifier) > 0) {
                template.push(`${game.i18n.localize(poolBonusLabel)} +${this.object.areteModifier}`);
            }
            else if (parseInt(this.object.areteModifier) < 0) {
                template.push(`${game.i18n.localize(poolBonusLabel)} -${this.object.areteModifier}`);
            }

            if (this.object.isExtendedCasting) {
                extraInfo.push(`${game.i18n.localize("wod.dialog.aretecasting.extendedcasting")} - ${this.object.totalSuccesses} ${game.i18n.localize("wod.dice.successes")}`);

                if (this.object.keepDifficulty) {
                    extraInfo.push(game.i18n.localize("wod.dialog.aretecasting.keepdifficulty"));
                }
            }

            if (this.object.spelltype == "coincidental") {
                extraInfo.push(game.i18n.localize("wod.spheres.coincidentalspell"));
            }
            else if (this.object.spelltype == "vulgar") {
                if (this.object.witnesses) {
                    extraInfo.push(game.i18n.localize("wod.spheres.vulgarspellwitness"));
                }
                else {
                    extraInfo.push(game.i18n.localize("wod.spheres.vulgarspell"));
                }
            }

            // the selected mods
            for (const property of this.object.selectedMods) {
                extraInfo.push(property);
            } 

            if (this.object.quintessence < 0) {
                const spentPoints = this.object.quintessence * -1;
                extraInfo.push(`${game.i18n.localize("wod.dialog.aretecasting.spendquintessence")} (${spentPoints})`);
            }

            // add-paradox-system task 4.2 — the [lowestDifficulty, 10] cap and its consequence (the
            // excess over 10 becomes required successes 1:1, core:17703) now live in exactly one
            // place, `capDifficultyToRollable()`, shared with `_setDifficulty()`'s `shownDifficulty`.
            // Behaviour unchanged: only `extraSuccesses > 0` (i.e. the old `totalDifficulty > 10`
            // branch) pushes the extra-successes line.
            const cappedDifficulty = capDifficultyToRollable(this.object.totalDifficulty, CONFIG.worldofdarkness.lowestDifficulty);

            if (cappedDifficulty.extraSuccesses > 0) {
                extraInfo.push(`${game.i18n.localize("wod.dialog.aretecasting.increaseddifficulty")} +${cappedDifficulty.extraSuccesses}`);
            }

            this.object.totalDifficulty = cappedDifficulty.difficulty;

            for (const sphere in CONFIG.worldofdarkness.allSpheres) {
                let exists = (this.object.selectedSpheres[sphere] === undefined) ? false : true;
                let label = "";

                if (exists) {
                    if (this.actor.type === "PC") {
                        const spheres = this.actor.items.find(item => item.type === "Sphere" && item.system.id === sphere);

                        if (spheres.system.value >= parseInt(CONFIG.worldofdarkness.specialityLevel) && this.object.useSpeciality) {
                            specialityRoll = true;
                            specialityText = specialityText != "" ? specialityText + ", " + spheres.system.speciality : spheres.system.speciality;
                        }

                        label = spheres.system.label;
                    }
                    else {
                        if ((parseInt(this.actor.system.spheres[sphere].value) >= parseInt(CONFIG.worldofdarkness.specialityLevel)) && (this.object.useSpeciality)) {
                                specialityRoll = true;
                                specialityText = specialityText != "" ? specialityText + ", " + this.actor.system.spheres[sphere].speciality : this.actor.system.spheres[sphere].speciality;
                        }

                        label = this.actor.system.spheres[sphere].label;                        
                    }

                    extraInfo.push(`${game.i18n.localize(label)} (${this.object.selectedSpheres[sphere]})`);
                }                    
            }

            let numDices = 0;

            if (isFormulaRoll) {
                numDices = formulaPool.attributeValue + formulaPool.abilityValue + parseInt(this.object.areteModifier);
            }
            else if (this.actor.type === "PC") {
                const arete = this.actor.api?.getAdvantage("arete");
                numDices = parseInt(arete?.system?.roll ?? 0) + parseInt(this.object.areteModifier);
            }
            else {
                numDices = parseInt(this.actor.system.advantages.arete.roll) + parseInt(this.object.areteModifier);
            }

            const powerRoll = new DiceRollContainer(this.actor);
            powerRoll.action = action;
            powerRoll.origin = "magic";
            powerRoll.numDices = numDices;
            powerRoll.woundpenalty = 0;
            powerRoll.difficulty = parseInt(this.object.totalDifficulty);           
            powerRoll.speciality = specialityRoll;
            // design.md D15/task 5.5 (cross-spec-audit-pass3 Arreglo #5) — A19's second clause:
            // Willpower cannot buy an automatic success/bonus dice on an ARETÉ roll once Prisma de
            // Foco is active, overriding the base system's generic Willpower-spend path
            // (`roll-dice.js`'s `usewillpower && !willpowerBonusDice` minimum-1-success rule) that is
            // otherwise wired straight into this same casting flow. A mage who has not enabled
            // Prisma de Foco is completely unaffected.
            // fix-formula-casting D5 — corrected to key on the ACTUAL roll type (`isFormulaRoll`,
            // resolved above), not on "is this a Rote": A19's own reasoning is "esa mecánica es de
            // Areté, no de Atributo+Habilidad" — a genuine Atributo+Habilidad Fórmula roll must NOT
            // have Willpower force-disabled, even though it IS a Rote.
            powerRoll.usewillpower = (PrismHelper.IsActive(this.actor) && !isFormulaRoll)
                ? false
                : this.object.useWillpower;
            powerRoll.specialityText = specialityText;
            powerRoll.dicetext = template;
            powerRoll.extraInfo = extraInfo;
            powerRoll.systemText = this.object.description;
            
            let successes = await DiceRoller(powerRoll);

            // add-paradox-system task 3.4 — every completed casting roll feeds the Paradoja gain
            // calculation with exactly what this dialog already knows: the caster's own
            // coincidental/vulgar call (Non-Goal to automate — proposal.md), whether Sleeper
            // witnesses were present, the highest Sphere involved (`_highestRank()`, never the
            // sum) and the roll's own outcome (`powerRoll.lastRollResult`). `paradoxRollCount`
            // tracks THIS Rote instance's own roll index across an extended (ritual) casting, so
            // repeated `_castSpell` calls on the same dialog instance feed `ritualRollNumber`
            // correctly without a separate counter field to maintain by hand.
            //
            // task 2.4/D8 — resolves the two dead halves of the Prisma's vulgarity engine as an
            // override on the PARADOJA-ONLY classification, never on `totalDifficulty`'s own
            // coincidental/vulgar split (that pipeline is already shipped and separately gated by
            // test-casting-difficulty.mjs; this change does not touch it):
            //   1. `prismForcesCoincidental`/`prismForcesParadojaVulgar` (D12's per-Práctica
            //      Beneficio/Penalización checkboxes, `_applyPrismModifiers()` above) — already
            //      computed live on this same `this.object` by the time this line runs.
            //   2. `PrismHelper.EvaluateVulgarity()` (D5/D6's Sanctum-anatema/Zonas-de-Realidad
            //      engine) — called here for the first time anywhere in the system, feeding it the
            //      result of (1) as its base and consuming ONLY its `.paradojaVulgar` output.
            // A vulgar-forcing rule always wins a tie against a coincidental-forcing one, mirroring
            // `EvaluateVulgarity`'s own documented precedence.
            this.object.paradoxRollCount = (parseInt(this.object.paradoxRollCount) || 0) + 1;

            let paradoxVulgar = this.object.spelltype === "vulgar";
            let paradoxVulgarForcedBy = null;

            if (this.object.prismForcesCoincidental) {
                paradoxVulgar = false;
                paradoxVulgarForcedBy = "practice";
            }
            if (this.object.prismForcesParadojaVulgar) {
                paradoxVulgar = true;
                paradoxVulgarForcedBy = "practice";
            }

            if (this.object.prismPracticeId) {
                const vulgarity = PrismHelper.EvaluateVulgarity(this.actor, {
                    practiceId: this.object.prismPracticeId,
                    sphereLevel: this.object._highestRank(),
                    scene: this.actor.getActiveTokens(false, true)?.[0]?.parent
                        ?? canvas?.scene
                        ?? game.scenes?.current
                        ?? null,
                    baseDificultadVulgar: paradoxVulgar,
                    baseParadojaVulgar: paradoxVulgar
                });
                if (vulgarity.paradojaVulgar !== paradoxVulgar) {
                    paradoxVulgarForcedBy = "practice";
                }
                // `vulgarity.dificultadVulgar` is deliberately never read anywhere: overriding the
                // difficulty pipeline's own coincidental/vulgar split is out of this change's scope.
                paradoxVulgar = vulgarity.paradojaVulgar;
            }

            await createParadoxCard(this.actor, {
                vulgar: paradoxVulgar,
                witnesses: !!this.object.witnesses,
                highestSphere: this.object._highestRank(),
                rollResult: powerRoll.lastRollResult,
                ritualRollNumber: this.object.paradoxRollCount,
                vulgarForcedBy: paradoxVulgarForcedBy
            });

            // add-prism-of-focus-foundry — design.md D8/task 10.2: a cast through a corrupted-kind
            // Práctica surfaces its resistance roll's pool/difficulty as a chat card. The roll
            // itself stays exactly as manual as it always was (the player opens the normal
            // resistance roll — Práctica rating vs. difficulty `3 + highest Sphere used` —
            // themselves, off-system); followups design.md D1 automates only what happens AFTER
            // that roll resolves: the card's "Evitado"/"Fallo" buttons report the outcome, which
            // bumps the "(Práctica) Corrupta" Resonance item and flips `corrupted_state` — a GM can
            // still ignore the card and edit both by hand exactly as before.
            if (PrismHelper.IsActive(this.actor) && this.object.prismPracticeId) {
                const practices = PrismHelper.ListOwnedPractices(this.actor);
                const selected = practices.find((p) => p.id === this.object.prismPracticeId);
                if (selected?.kind === "corrupted") {
                    const highestSphere = this.object._highestRank();
                    const {
                        corruptedResistanceRoll,
                        vamamargaJhorRoll,
                        vamamargaJhorTriggered,
                        getJhorResonanceValue
                    } = await import("../scripts/prism-corrupted-helpers.js");
                    const poolRating = PrismHelper.ResolveCorruptedResistancePoolRating(this.actor, selected.item);
                    const roll = corruptedResistanceRoll(poolRating, highestSphere);
                    await createCorruptedResistanceCard(this.actor, selected.item, selected.id, roll.pool, roll.difficulty);

                    // D16/task 10.6 — the 3 non-dice-modifier Precios, surfaced as their own chat
                    // message alongside (never instead of) the generic resistance prompt above.
                    if (this.object.prismSilenceFloor != null) {
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            content: game.i18n.format("wod.prism.dialog.abyssalismsilence", { floor: this.object.prismSilenceFloor })
                        });
                    }
                    if (this.object.prismFailureBranch && powerRoll.lastRollResult === "botch") {
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            content: game.i18n.localize("wod.prism.dialog.goetiacatastrophic")
                        });
                    }
                    if (this.object.prismJhorResonance && vamamargaJhorTriggered(successes, powerRoll.lastRollResult)) {
                        const jhorRoll = vamamargaJhorRoll(getJhorResonanceValue(this.actor));
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            content: game.i18n.format("wod.prism.dialog.vamamargajhor", { pool: jhorRoll.pool, difficulty: jhorRoll.difficulty })
                        });
                    }
                }
            }

            if (!this.object.isExtendedCasting) {
                this.object.close = true;
                this.close();
                return;
            }
            else {
                if (!this.object.keepDifficulty && (successes == 0)) {
                    this.object.difficultyModifier = parseInt(this.object.difficultyModifier) + 1;
                }
                
                this.object.totalSuccesses = parseInt(this.object.totalSuccesses) + parseInt(successes);    
                this.render();            
            }            
        }
    }

    /* clicked to close form */
    _closeForm(event) {
        this.object.close = true;
    }

    _changedSelectedSphere(selected, spherename, value) {
        let exists = (selected[spherename] === undefined) ? false : true;

        if ((exists) && (value == 0)) {
            delete selected[spherename];
        }
        else {
            selected[spherename] = value;
        }        

        return selected;
    }

    /* calculating the difficulty based on the checked variables */
    _calculateDifficulty(showMessage) {
        const rank = this.object._highestRank();
        let diff = -1;
        this.object.totalDifficulty = -1;

        if (this.object.spelltype == undefined) {
            this.object.spelltype = "";
        }

        if ((rank == -1) && (showMessage)) {
            ui.notifications.warn(game.i18n.localize("wod.dialog.aretecasting.nospheres"));

            return false;
        }

        if (this.object.spelltype == "") {
            if (showMessage) {
                ui.notifications.warn(game.i18n.localize("wod.dialog.aretecasting.nospelltype"));
            }

            return false;
        }

        diff = this.object._setDifficulty(rank)

        if (diff > -1) {
            return true;
        }

        return false;
    }
}
