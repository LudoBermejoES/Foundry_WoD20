import * as AbilityDialog from "../dialogs/dialog-edits.js";

export default class AbilityHelper {
	/**
	 * The three `system.type` values that make a Trait item a SECONDARY ability.
	 * Kept as a suffix test so a line that adds a fourth is covered automatically;
	 * the known values are wod.types.{talent,skill,knowledge}secondability
	 * (see module/scripts/select-helpers.js).
	 */
	static IsSecondAbilityType(itemsystemtype) {
		return (typeof itemsystemtype === "string") && (itemsystemtype.endsWith("secondability"));
	}

	/**
	 * The LEGACY key derivation for a CORE ability (an `Ability` item).
	 *
	 * This is the expression the Ability branch of WoDItem._preCreate has always
	 * used, lifted here unchanged. DO NOT "improve" it: the ability items already
	 * live on every actor carry keys in exactly this spelling (measured on the live
	 * server: Animal Ken -> "animalken", no separator), and wod20-char has an
	 * explicit seam map keyed on that spelling. Changing it would orphan real data.
	 *
	 * A SECONDARY ability does NOT use this rule -- see GetSecondAbilityId.
	 */
	static GetAbilityId(name) {
		return (name || "").toLowerCase().replace(/\s+/g, '');
	}

	/**
	 * The key derivation for a SECONDARY ability (a `Trait` item).
	 *
	 * This deliberately MIRRORS the consumer's rule rather than inventing a second
	 * one, because the wod20-char importer prefers a carried `system.id` over the
	 * item's name unconditionally (`slug = carriedId || slugify(name)`), so a key
	 * spelled differently here would not merely be useless -- it would override the
	 * working name path and be strictly worse than emitting nothing.
	 *
	 * The rule, from wod20-char/web/server/services/rules/secondaryAbilities.ts:
	 * strip diacritics, lowercase, trim, then collapse every run of non-alphanumerics
	 * into a single "_" and trim those off the ends. So:
	 *
	 *     "Tiro con arco"       -> tiro_con_arco
	 *     "Hipertecnologia"     -> hipertecnologia   (accent dropped)
	 *     "Sueno lucido"        -> sueno_lucido
	 *     "Farmacopea / Venenos"-> farmacopea_venenos
	 *
	 * KNOWN LIMIT: the app additionally consults a RESERVED_ABILITY_SLUGS table
	 * ({"artes marciales": "martialarts", "do": "do"}) which is NOT reproduced here.
	 * "do" derives to "do" either way, and Martial Arts is a CORE ability in this
	 * system (see CONFIG.worldofdarkness in module/config.js), so it is an `Ability`
	 * item and never reaches this rule. The gap is therefore only reachable by a user
	 * hand-creating a SECONDARY named "Artes Marciales", which would get
	 * "artes_marciales" instead of "martialarts". If that table ever grows, this
	 * comment and .github/scripts/test-secondability-id.mjs must be revisited.
	 */
	static GetSecondAbilityId(name) {
		return (name || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")   // the combining-diacritics block
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
	}

	/**
	 * The key that GetSecondAbilityId derives from the "new secondary ability"
	 * PLACEHOLDER name, in every language this system ships.
	 *
	 * The sheet's "+" button creates a secondary named with that placeholder and
	 * then opens the rename dialog, so the key first stamped on it is meaningless.
	 * It has to stay overwritable, or the placeholder's slug would be frozen forever
	 * and would beat the real name at import time.
	 *
	 * Baked from lang/*.json (de, en, es, fr, it, pt-BR, uk -- uk currently reuses
	 * the English string). The active language is also derived at runtime below, so a
	 * translation this list has not caught still works for the user who sees it.
	 */
	static PLACEHOLDER_SECONDABILITY_IDS = [
		"neue_sekundare_fahigkeit",      // de: Neue sekundare Fahigkeit
		"new_secondary_ability",         // en + uk
		"nueva_habilidad_secundaria",    // es
		"nouvelle_competence_secondaire",// fr
		"nuova_abilita_secondaria",      // it
		"nova_habilidade_secundaria"     // pt-BR
	];

	/**
	 * The text a SECONDARY ability's key should be derived from, given the document
	 * and (optionally) the update being applied to it.
	 *
	 * `system.label` is preferred over `name`, for three measured reasons:
	 *  - label is what BOTH sheet families actually DISPLAY for a secondary
	 *    (templates/actor/parts/stats_abilities.hbs and .../abilities.html),
	 *  - the Trait item sheet submits label as a mirror of the name
	 *    (templates/sheets/trait-sheet.html), so they agree on that path, and
	 *  - the ability edit dialog (DialogAbility._save in module/dialogs/dialog-edits.js)
	 *    writes ONLY system.label and never touches item.name -- so a rename done
	 *    there never reaches `name` at all.
	 * Label is therefore never staler than name.
	 *
	 * Both the nested (`system: {label}`) and the flat (`"system.label"`) spellings
	 * are accepted, because the actor sheets submit a nested duplicate of the item
	 * while the item sheet submits FormDataExtended's flat keys.
	 *
	 * A label that is still an i18n KEY rather than display text is ignored, so
	 * "wod.abilities.art" can never become the key "wod_abilities_art".
	 */
	static GetSecondAbilityLabel(item, updateData = {}) {
		const label = updateData?.system?.label ?? updateData?.["system.label"] ?? item?.system?.label;

		if ((typeof label === "string") && (label !== "") && (!label.startsWith("wod."))) {
			return label;
		}

		return updateData?.name ?? item?.name ?? "";
	}

	/**
	 * May this secondary's key be (re)written?
	 *
	 * TRUE only when there is nothing real to lose: the key is absent/empty, or it is
	 * still the placeholder's slug. A real key is NEVER overwritable -- changing a
	 * live key would orphan that ability's data on the wod20-char side.
	 */
	static IsFillableSecondAbilityId(id) {
		if ((id === undefined) || (id === null) || (id === "")) {
			return true;
		}

		if (AbilityHelper.PLACEHOLDER_SECONDABILITY_IDS.includes(id)) {
			return true;
		}

		// Also catch the language the user is actually running, in case a
		// translation is newer than the baked list above.
		try {
			const placeholder = game.i18n.localize("wod.labels.new.ability");

			if ((placeholder !== "") && (id === AbilityHelper.GetSecondAbilityId(placeholder))) {
				return true;
			}
		}
		catch (err) {
			// i18n not ready (or absent, as in the offline harness) -- the baked
			// list is the answer.
		}

		return false;
	}

    static async CreateAbility(actor, abilitytype, abilitynamn, maxvalue, ismeleeweapon = false, israngedeweapon = false, autoopen = false) {
		const existed = await this.CheckAbilityExists(actor, abilitytype, abilitynamn);

		if (existed) {
			ui.notifications.warn(abilitynamn + ` ${game.i18n.localize("wod.labels.new.alreadyexists")}`);
			return;
		}

		const itemData = {
			name: abilitynamn,
			type: "Trait",
			system: {
				label: game.i18n.localize(abilitynamn),
				type: abilitytype,
				max: maxvalue,
				ismeleeweapon: ismeleeweapon,
				israngedeweapon: israngedeweapon
			}
		};

		// WoDItem._preCreate autofills system.id for a secondary ability, but only on
		// the createEmbeddedDocuments() branch below: updateSource() writes straight
		// into the actor's source document and never runs _preCreate, so a secondary
		// added while the actor is still being created would end up with no key at
		// all. Stamp it here, through the shared derivation, so both branches agree.
		if (AbilityHelper.IsSecondAbilityType(abilitytype)) {
			itemData.system.id = AbilityHelper.GetSecondAbilityId(abilitynamn);
		}

		let createdItem;

		if (actor.system.settings.iscreated) {
			createdItem = await actor.createEmbeddedDocuments("Item", [itemData]);
		}
		else {
			createdItem = await actor.updateSource({ items: [itemData]});
		}

		if (autoopen) {
			const item = await actor.getEmbeddedDocument("Item", createdItem[0]._id);
			var _a;
	
			if (item instanceof Item) {
				_a = item.sheet;
	
				if ((_a === null) || (_a === void 0)) {
					void 0;
				}                
				else {
					_a.render(true);  
				}
			}
		}		
	}

	static CreateTrait_nowait(actor, abilitytype, abilitynamn, maxvalue, ismeleeweapon, israngedeweapon) {
		const items = actor.items.filter(item => item.type === "Trait" && item.system.type === abilitytype && item.name === abilitynamn);

		if (items.length > 0) {
			return;
		}

		const itemData = {
			name: abilitynamn,
			type: "Trait",
			system: {
				label: game.i18n.localize(abilitynamn),
				type: abilitytype,
				max: maxvalue,
				ismeleeweapon: ismeleeweapon,
				israngedeweapon: israngedeweapon
			}
		};
		
		// Same reason as in CreateAbility above: the updateSource() branch bypasses
		// WoDItem._preCreate, so the key has to be stamped here too.
		if (AbilityHelper.IsSecondAbilityType(abilitytype)) {
			itemData.system.id = AbilityHelper.GetSecondAbilityId(abilitynamn);
		}

		if (actor.system.settings.iscreated) {
			actor.createEmbeddedDocuments("Item", [itemData]);
		}
		else {
			actor.updateSource({ items: [itemData]});
		}
	}

	static async CheckAbilityExists(actor, itemtype, itemname) {
		return await this.CheckItemExists(actor, "Trait", itemtype, itemname);
	}

	static async CheckItemExists(actor, itemtype, itemsystemtype, itemname) {
		const items = await actor.items.filter(item => item.type === itemtype && item.system.type === itemsystemtype && item.name === itemname);

		return items.length > 0;
	}

	static async EditAbility(actor, id) {
		let item = actor.system.abilities?.[id];

		if (item === undefined) {
			item = await actor.getEmbeddedDocument("Item", id);
		}

		if (!item) {
			return;
		}

		const ability = new AbilityDialog.Ability(item);
		let abilityUse = new AbilityDialog.DialogAbility(actor, ability);
		abilityUse.render(true);
	}
}