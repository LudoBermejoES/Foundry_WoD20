import ActionHelper from "../../scripts/action-helpers.js";
import BonusHelper from "../../scripts/bonus-helpers.js";
import DropHelper from "../../scripts/drop-helpers.js";
import ItemHelper from "../../scripts/item-helpers.js";
import SelectHelper from "../../scripts/select-helpers.js";

import { OnSquareCounterChange } from "../../scripts/action-helpers.js";
import { OnSquareCounterClear } from "../../scripts/action-helpers.js";
import { OnDotCounterChange } from "../../scripts/action-helpers.js";
import { OnStatValueChange } from "../../scripts/action-helpers.js";
import { OnActorSwitch } from "../../scripts/action-helpers.js";
import { OnUseMacro } from "../../scripts/action-helpers.js";

import { OnItemCreate, 
			OnItemEdit, 
			OnItemActive, 
			OnItemSwitch, 
			OnItemDelete, 
			OnRemoveSplat, 
			OnQuintessenceHandling, 
			OnQuintessenceWheelClick, 
			OnParadoxWheelClick, 
			OnHandleImbalance,
			OnFormActivate, 
			OnPowerSort, 
			OnPowerClear, 
			OnGenerationChange, 
			SendChat, 
			RollDice, 
			OnEditImage } from "../../scripts/action-helpers.js";

import { calculateHealth } from "../../scripts/health.js";
import { calculateTotals } from "../../scripts/totals.js";
import { buildTraitCompendiumUuidMap } from "../../scripts/trait-enrichment.js";
import { resolveDescription } from "../../scripts/compendium-description.js";
import { getSplat } from "../../scripts/splat-helpers.js";
import ItemViewer from "../../applications/item-viewer.js";
import PrismHelper from "../../scripts/prism-helpers.js";
import DialogPrismRitual from "../../dialogs/dialog-prism-ritual.js";
import DialogPrismPrompt from "../../dialogs/dialog-prism-prompt.js";
import { PROMPT_PRACTICE_IDS } from "../../scripts/prism-practice-data.js";

/** task 10.3 — Ciencias Infernales' 3 possible bases (A21), keyed by their own stable practice id
 *  (`CORRUPTED_PRACTICE_RULES["infernal-sciences"].base` in `prism-practice-data.js`) to the
 *  `wod.prism.infernal.base.*` label key used to display the player's locked choice. */
const INFERNAL_BASE_LABEL_KEY = { hypertech: "hypertech", cybernetics: "cybernetics", "weird-science": "weirdscience" };

const { HandlebarsApplicationMixin } = foundry.applications.api

/**
 * Extend the base ActorSheetV2 document
 * @extends {foundry.applications.sheets.ActorSheetV2}
 */
export default class PCActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
	
	constructor(actor, options) {
		super(actor, options);

		this.isGM = game.user.isGM;	
		this.isLimited = actor.limited;
		this.locked = true;
		this.isOwner = actor.isOwner;
		this.isCharacter = true;
		this.variantOpen = false;		
		this.era = actor.document.system.settings.era;
		this._settingsTab = "statsadv";

		this.#dragDrop = this.#createDragDropHandlers();
	}

	get title() {
		return this.actor.isToken ? `[Token] ${this.actor.name}` : this.actor.name;
	}	

	static DEFAULT_OPTIONS = {
		form: {
			submitOnChange: true,
			handler: PCActorSheet.onSubmitActorForm
		},
		classes: ["wod20", "wod-sheet", "pc-actor"],
		window: {
			icon: 'fa-solid fa-dice-d10',
			resizable: true
		},
		position: {
			width: 1000,
			height: 800
		},
		actions: {
			actorLock: function(event, form, formData) {
				if (this && typeof this._handlingLock === 'function') {
					this._handlingLock();
				}
			},
			settingsTab: function(event, form, formData) {
				if (this && typeof this._onSettingsTab === "function") {
					this._onSettingsTab(event);
				}
			},

			editAttribute: null,
			actorSwitch: OnActorSwitch,
			editHealth: OnSquareCounterChange,				// Health
			editDot: OnDotCounterChange, 					// Permanent / temporary dots
			useMacro: OnUseMacro,
			editImage: OnEditImage,							// Actor image editing

			itemCreate: OnItemCreate,
			itemEdit: OnItemEdit,
			itemActive: OnItemActive,
			itemSwitch: OnItemSwitch,
			itemDelete: OnItemDelete,
			removeSplat: OnRemoveSplat,

			formActive: OnFormActivate,

			powerSort: OnPowerSort,
			powerClear: OnPowerClear,

			sendChat: SendChat,

			rollDice: RollDice,

			// vampire
			generationChange: OnGenerationChange,			// Generation reduce/clear

			// mage
			quintessenceHandling: OnQuintessenceHandling,
			quintessenceWheelClick: OnQuintessenceWheelClick,

			// add-prism-of-focus-foundry — design.md D7: opens the Rituales calculator (a display/
			// input shell, never auto-driving a roll or a chat card).
			openPrismRitual: function (event) {
				event.preventDefault();
				new DialogPrismRitual().render(true);
			},

			// add-prism-of-focus-foundry — design.md D12/task 6.2: opens the one `prompt`-bucket
			// Práctica's own cost/pool calculator dialog, scoped to the practice id the clicked
			// row's `data-practiceid` carries.
			openPrismPrompt: function (event, target) {
				event.preventDefault();
				const practiceId = target?.getAttribute?.("data-practiceid") ?? "";
				if (!practiceId) return;
				new DialogPrismPrompt({ practiceId, actor: this.actor }).render(true);
			},

			// add-prism-of-focus-foundry — design.md D8/task 10.3: Ciencias Infernales' one-time,
			// LOCKED base-Práctica choice (A21). Reads the sibling `<select>` this row's own template
			// renders and persists it onto the owned corrupted-Práctica item; once set, the template
			// stops rendering the picker (`needsInfernalBaseChoice` goes false on next render) and
			// shows the locked label instead — there is no "change it later" control by design.
			// The `.v3-focusitem`/`.prism-infernal-base-select` selectors below only exist in
			// templates/actor/v3/feature.hbs's tree (v3-only markup), so PCActorSheet (the legacy,
			// non-v3 sheet, which inherits this whole `actions` object) can never produce them — a
			// verified, deliberate dead branch there, allowlisted in
			// .github/scripts/binder-selector-check.py's ALLOWLIST_UNPRODUCIBLE rather than moved to
			// a PCActorSheetV3-only actions override, because overriding `actions` on the subclass
			// broke sheet-invariants.py's static action-detection for every OTHER inherited action
			// (it does not resolve `...PCActorSheet.DEFAULT_OPTIONS.actions` spreads) — verified by
			// trying it: 137 false positives.
			prismChooseInfernalBase: async function (event, target) {
				event.preventDefault();
				const itemId = target?.getAttribute?.("data-itemid") ?? "";
				if (!itemId) return;

				const row = target.closest(".v3-focusitem");
				const select = row?.querySelector(".prism-infernal-base-select");
				const base = select?.value ?? "";
				if (!base) return;

				const item = this.actor.items.get(itemId);
				if (!item) return;

				await item.update({ "system.chosen_base_practice_id": base });
				this.render();
			}
		},
		dragDrop: [
            {
                dragSelector: '[data-drag]',
				dropSelector: null
            }
        ]
	}

	static PARTS = {	
		tabs: {
			template: "systems/worldofdarkness/templates/actor/parts/navigation.hbs"
		},
		bio: {
			template: "systems/worldofdarkness/templates/actor/parts/bio.hbs"
		},
		stats: {
			template: "systems/worldofdarkness/templates/actor/parts/stats.hbs"
		},
		powers: {
			template: "systems/worldofdarkness/templates/actor/parts/powers.hbs"
		},
		combat: {
			template: "systems/worldofdarkness/templates/actor/parts/combat.hbs"
		},
		gear: {
			template: "systems/worldofdarkness/templates/actor/parts/gear.hbs"
		},
		feature: {
			template: "systems/worldofdarkness/templates/actor/parts/feature.hbs"
		},
		effects: {
			template: "systems/worldofdarkness/templates/actor/parts/effects.hbs"
		},
		settings: {
			template: "systems/worldofdarkness/templates/actor/parts/settings.hbs"
		}
	}

	splat = "";

	tabGroups = {
		primary: 'stats'
	}

	// id can't be an icon type that exists - see powers. If it does then it will pick that icon and not the icon value set.
	tabs = {
		bio: {
			id: 'bio',
			group: 'primary',
			title: game.i18n.localize('wod.tab.bio'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].bio
		},
		stats: {
			id: 'stats',
			group: 'primary',
			title: game.i18n.localize('wod.tab.core'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].stats
		},
		powers: {
			id: 'powers',
			group: 'primary',
			title: game.i18n.localize('wod.tab.power'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)][getPowertype(this.actor)]
		},
		combat: {
			id: 'combat',
			group: 'primary',
			title: game.i18n.localize('wod.tab.combat'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].combat
		},
		gear: {
			id: 'gear',
			group: 'primary',
			title: game.i18n.localize('wod.tab.gear'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].gear
		},
		feature: {
			id: 'feature',
			group: 'primary',
			title: game.i18n.localize('wod.tab.features'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].note
		},
		effects: {
			id: 'effects',
			group: 'primary',
			title: game.i18n.localize('wod.tab.effect'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].effect
		},
		settings: {
			id: 'settings',
			group: 'primary',
			title: game.i18n.localize('wod.tab.settings'),
			icon: game.worldofdarkness.icons[getSplat(this.actor)].settings
		}
	}

	/**
	 * The one tab a limited/observer viewer is shown (`getTabs` below). A `get` rather than a
	 * hard-coded string so `PCActorSheetV3` can redirect it once `bio` stops being a tab of its
	 * own (add-pc-sheet-v3 §8.2): reading `this.limitedTabId` here instead of the literal `'bio'`
	 * is a one-line, DRY way to keep this fallback correct for both sheets, rather than forking the
	 * whole method to change one string.
	 * @returns {string}
	 */
	get limitedTabId () {
		return 'bio';
	}

	/**
	 * add-pc-sheet-v3 §8.3 — whether the Effects tab is folded into Ajustes/Settings as a SUB-TAB
	 * rather than staying a tab of its own. `false` here (v2 unchanged); `PCActorSheetV3` overrides
	 * it `true`. Read in two places, both in the SHARED `settings` machinery so v2 never has to
	 * know this exists: the `settings` case in `_preparePartContext` below (whether to also gather
	 * effect data for that part's context) and `templates/actor/parts/settings.hbs` (as
	 * `effectsinsettings`, whether to render the extra nav link and sub-tab body at all). When this
	 * is `false` the template renders byte-for-byte what it always has — no new link, no new div.
	 * @returns {boolean}
	 */
	get effectsInSettings () {
		return false;
	}

	/* Read the tabs with data */
	getTabs () {
		const tabs = this.tabs

		// Check viewBiotabPermission
		let viewBiotabPermission = "full";

		if (!game.user.isGM && !this.actor.isOwner) {
			if (this.actor.limited) {
				viewBiotabPermission = CONFIG.worldofdarkness.limitedSeeFullActor;
			} else {
				viewBiotabPermission = CONFIG.worldofdarkness.observersSeeFullActor;
			}
		}

		// Filter tabs based on permission
		const filteredTabs = {};

		if (viewBiotabPermission === "full") {
			// User has full access, include all tabs
			for (const [key, tab] of Object.entries(tabs)) {
				filteredTabs[key] = tab;
			}
		}
		else {
			// User has limited access, only show the limited-view tab (v2: bio; v3 redirects
			// this to feature, which now carries the identity content bio used to own).
			const limitedId = this.limitedTabId;
			if (tabs[limitedId]) {
				filteredTabs[limitedId] = tabs[limitedId];
			}
			// Set it as the default active tab when user has limited access
			if (!this.tabGroups.primary || this.tabGroups.primary !== limitedId) {
				this.tabGroups.primary = limitedId;
			}
		}

		// Process the filtered tabs (use filteredTabs instead of tabs)
		for (const tab of Object.values(filteredTabs)) {
			tab.active = this.tabGroups[tab.group] === tab.id;

			// Set icon dynamically - especially important for powers tab which depends on actor splat
			if (tab.id === "powers") {
				// Power icon depends on actor's splat type (discipline for vampire, gift for werewolf, etc.)
				tab.icon = game.worldofdarkness.icons[this.splat][getPowertype(this.actor)];
			} 
			else {
				// For other tabs, use the icon from tabs definition or fallback to default
				if (tab.id === "feature") {
					tab.icon = game.worldofdarkness.icons[this.splat].note;
				}
				else if (tab.id === "effects") {
					tab.icon = game.worldofdarkness.icons[this.splat].effect;
				}
				else {
					tab.icon = game.worldofdarkness.icons[this.splat][tab.id];
				}				
			}
			tab.cssClass = tab.active ? 'actorv2 active ' : 'actorv2 ';
			tab.cssClass += this.locked ? 'locked ' : '';
			tab.cssClass += this.era !== '' ? this.era + ' ' : '';
		}

		return filteredTabs
	}

	/** @override */
	async _prepareContext(options) {
		const data = await super._prepareContext();
		const actor = this.actor;		

		this.splat = getSplat(this.actor);

		// Add the tabs
		data.tabs = this.getTabs();		

		data.config = CONFIG.worldofdarkness;	

		data.worldofdarkness = game.worldofdarkness;	

		data.userpermissions = ActionHelper._getUserPermissions(game.user);
		data.graphicsettings = ActionHelper._getGraphicSettings();

		data.isOwner = actor.isOwner;
		data.locked = this.locked;
		data.isCharacter = this.isCharacter;
		data.isGM = this.isGM;
		
		data.actor = actor;

		console.log(`${data.actor.name} - (${data.actor.type} / ${this.splat})`);
		console.log(data.actor);

		return {
			...data
		}
	}	

	async _preparePartContext (partId, context, options) {
		context = { ...(await super._preparePartContext(partId, context, options)) }

		// Top-level variables
		const actor = this.actor

		// Only load what is neccessary
		switch (partId) {
			case 'bio':
				return prepareBioContext(context, actor);
			case 'stats':
				return prepareStatContext(context, actor);
			case 'powers':
				return preparePowersContext(context, actor);
			case 'combat':
				return prepareCombatContext(context, actor);
			case 'gear':
				return prepareGearContext(context, actor);
			case 'feature':
				return prepareFeatureContext(context, actor);
			case 'effects':
				return prepareEffectContext(context, actor);
			case 'settings': {
				context = await prepareSettingsContext(context, actor);

				// add-pc-sheet-v3 §8.3 — fold `effects` into Ajustes as a sub-tab. Gated on
				// `effectsInSettings` (false on v2, true on `PCActorSheetV3`), so v2's copy of
				// this SHARED template is completely unaffected: `effectsinsettings` stays
				// falsy and `settings.hbs`'s extra nav link + sub-tab body never render.
				context.effectsinsettings = this.effectsInSettings;
				if (this.effectsInSettings) {
					// THE TRAP: `prepareEffectContext` reads `context.tabs.effects` on its very
					// first line and throws on a bare `{}` (no `.tabs` at all). `context.tabs`
					// is what it resolves that against, and it stays safe here even though
					// `effects` may no longer be a key on it at all (v3 retires `effects` as a
					// tab of its own in the same task) — `context.tabs.effects` then simply
					// reads `undefined`, which only feeds the throwaway object's own unused
					// `.tab`, never the `.effects` list read below.
					//
					// A FRESH object, never `context` itself: `prepareEffectContext`'s first
					// line is `context.tab = context.tabs.effects`, and `prepareSettingsContext`
					// two lines above already set `context.tab` to the SETTINGS tab object this
					// part's own `<section data-tab="{{tab.id}}">` reads. Passing `context`
					// through directly would silently overwrite that with `effects`' tab object
					// (or `undefined`) — same shape as the badge computation in
					// `PCActorSheetV3#_prepareContext`.
					const effectsContext = await prepareEffectContext({ tabs: context.tabs }, actor);
					context.effects = effectsContext.effects;
				}

				return context;
			}
		}

		return context
	}	

	static async onSubmitActorForm (event, form, formData) {
		const target = event.target;

		// Allow a small whitelist of "tracking" toggles even while the sheet is locked
		const allowWhileLocked = new Set([
			"system.conditions.isignoringpain",
			"system.conditions.isfrenzy"
		]);

		const isAllowedWhileLocked =
			target?.tagName === "INPUT" &&
			target.type === "checkbox" &&
			allowWhileLocked.has(target.name);

		// if the alteration is of such type a recalculation of totals is needed after the update, so we set a flag to trigger that
		let runtotals = false;

		if (this.locked && !isAllowedWhileLocked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		// is an item
		if (target?.dataset?.itemid !== undefined) {
			let value;

			// Handle numbers and strings properly
			if (target.type === 'number') {
				value = parseInt(target.value)
			} 
			else if (target.type === 'checkbox') {
				value = target.checked
			} 
			else {
				value = target.value
			}

			let item = await this.actor.getEmbeddedDocument("Item", target.dataset.itemid);
            await item.update({
			 	[`${target.name}`]: value
			});			

			return;
		}		
		else {
			if (target.tagName === 'INPUT') {
				let value = "";

				// Handle numbers and strings properly
				if (target.type === 'number') {
					value = parseInt(target.value);
				} 
				else if (target.type === 'checkbox') {
					value = target.checked;
				} 
				else {
					if (target.dataset.dtype === "Number") {
						value = parseInt(target.value);
						runtotals = true;
					}
					else {
						value = target.value;
					}					
				}

				let actorData = foundry.utils.duplicate(this.actor.toObject());
				foundry.utils.setProperty(actorData, target.name, value);

				if (runtotals) {
					actorData = await calculateTotals(actorData);
					actorData.system.settings.isupdated = true;
				}
				await this.actor.update(actorData);
			} 
			else {
				// Process submit data
				const submitData = this._prepareSubmitData(event, form, formData);

				// Overrides
				const overrides = foundry.utils.flattenObject(this.actor.overrides);
				for (const k of Object.keys(overrides)) delete submitData[k]

				const submitDataFlat = foundry.utils.flattenObject(submitData);
				const updatedData = {
					[target.name]: submitDataFlat[target.name],
					'system.settings.isupdated': false
				}
				const expandedData = foundry.utils.expandObject(updatedData);

				// Update the actor data
				await this.actor.update(expandedData);
			}

			await this.actor._setItems();
		} 
	}

	async _onRender () {
		const element = this.element;
		
		// Highlight dot/box UI based on current values
		ActionHelper.SetupDotCounters_v2(element);

		// Numeric input for high-max attributes and abilities
		this._bindStatValueInputs(element);

		// right-click health boxes - use event delegation
		this._bindHealthContextMenu(element);
		
		// Attach show/hide handlers for power description toggles
		this._bindCollapsibleButtons(element);

		// Attach the read-only compendium-description eyes - the Attributes tab and the Mage sheet's
		// Spheres block (owner-delegated addition to open-item-window-from-eye-icon), plus its Bio
		// "Secta" splatfield row (add-faction-sect-entities, matched by value, not by key). Runs over
		// the WHOLE sheet root, so it needs no per-tab wiring as new eyes are added.
		this._bindTraitDescriptionButtons(element);

		// Attach expand/collapse handlers for grouped tables (experience, etc.)
		this._bindUnfoldButtons(element);
		
		// Restore saved collapsed/expanded state from user flags
		this._restoreUnfoldState(element);
		
		// Make draggable rows functional inside the sheet
		this._setupDragAndDrop(element);

		// Quintessence wheel right-click (contextmenu) for paradox
		this._bindQuintessenceContextMenu(element);

		// Willpower imbalance right-click (contextmenu) for imbalance handling
		this._bindImbalanceContextMenu(element);

		// Settings sub-tabs
		this._bindSettingsTabs(element);

		// Secondary settings tabs (Bio/Stats&Advantages/Power/Combat/Features/Sheet)
		this._applySettingsTabState(element);
	}

	async render(force = false, options = {}) {
		await super.render(force, options);
	}

	/**
	 * Attach show/hide handlers for power description toggles.
	 * Binds click event listeners to collapsible buttons that toggle visibility of power descriptions.
	 * @param {HTMLElement} root - The root element to search for collapsible buttons
	 */
	_bindCollapsibleButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-itemid]");
		if (!icons?.length) return;
		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";
			icon.addEventListener("click", (event) => this._handleCollapsibleClick(event));
		});
	}

	/**
	 * Attach the read-only compendium-description eyes - Attributes and Spheres, matched by a
	 * stable per-row key (owner-delegated addition to open-item-window-from-eye-icon; Spheres added
	 * by add-sphere-descriptions), plus the Mage Bio tab's free-text "Secta" row, matched by the
	 * field's own value (add-faction-sect-entities). ONE binder for every kind, because the icons
	 * are identical from here down: whatever the row, the eye carries a resolved compendium uuid
	 * and opens it.
	 *
	 * A separate binder/handler pair from `_bindCollapsibleButtons`/`_handleCollapsibleClick` on
	 * purpose: those resolve `data-itemid` through `actor.items.get()`, which does not apply here -
	 * an attribute is not an Item at all, and a Sphere Item's own description is empty because the
	 * system creates it rather than the compendium. These icons carry `data-traituuid` instead (a
	 * compendium document uuid, resolved into the render context by `buildTraitCompendiumUuidMap`),
	 * and the templates render the icon only where a match was found - see stats_attributes.hbs and
	 * power_spheres.hbs.
	 * @param {HTMLElement} root - The root element to search for trait-description buttons
	 */
	_bindTraitDescriptionButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-traituuid]");
		if (!icons?.length) return;
		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";
			icon.addEventListener("click", (event) => this._handleTraitDescriptionClick(event));
		});
	}

	/**
	 * Attach expand/collapse handlers for grouped tables (experience, etc.).
	 * Binds click event listeners to unfold buttons that toggle visibility of grouped content sections.
	 * @param {HTMLElement} root - The root element to search for unfold buttons
	 */
	_bindUnfoldButtons(root) {
		const buttons = root.querySelectorAll?.(".unfold.button");
		if (!buttons?.length) return;
		buttons.forEach(button => {
			if (button.dataset.unfoldBound) return;
			button.dataset.unfoldBound = "true";
			button.addEventListener("click", (event) => this._handleUnfoldClick(event));
		});
	}

	/**
	 * Restore saved collapsed/expanded state from user flags.
	 * Reads user preferences from game flags and restores the visual state of unfoldable sections.
	 * @param {HTMLElement} root - The root element to search for unfold buttons
	 */
	_restoreUnfoldState(root) {
		const unfoldButtons = Array.from(root.querySelectorAll('.unfold.button'));
		unfoldButtons.forEach(ele => {
			if (ele.dataset.sheet == CONFIG.worldofdarkness.sheettype.mortal){
				if (this.actor && this.actor.id && game.user.flags.wod && game.user.flags.wod[this.actor.id] && game.user.flags.wod[this.actor.id][ele.dataset.type] && !game.user.flags.wod[this.actor.id][ele.dataset.type].collapsed) {
					ele.classList.remove("fa-angles-right");
					ele.classList.add("fa-angles-down");

					// Get parent's parent's parent, then find siblings
					const parent = ele.parentElement?.parentElement?.parentElement;
					if (parent) {
						const siblings = Array.from(parent.parentElement?.children || []);
						const targetSiblings = siblings.filter(sib => sib !== parent && sib.classList.contains(ele.dataset.type));
						targetSiblings.forEach(sib => {
							sib.classList.remove("hide");
							sib.classList.add("show");
						});
					}
				}
				else {
					ele.classList.remove("fa-angles-down");
					ele.classList.add("fa-angles-right");

					// Get parent's parent's parent, then find siblings
					const parent = ele.parentElement?.parentElement?.parentElement;
					if (parent) {
						const siblings = Array.from(parent.parentElement?.children || []);
						const targetSiblings = siblings.filter(sib => sib !== parent && sib.classList.contains(ele.dataset.type));
						targetSiblings.forEach(sib => {
							sib.classList.remove("show");
							sib.classList.add("hide");
						});
					}
				}
			}
		});
	}

	async _handlingLock() {
		this.locked = !this.locked;
		await this.render(false);
	}

	/**
	 * Make draggable rows functional inside the sheet.
	 * Sets up drag-and-drop handlers for draggable elements and binds Foundry V14 DragDrop API for internal sorting.
	 * @param {HTMLElement} root - The root element to search for draggable elements
	 */
	_setupDragAndDrop(root) {
		const draggables = Array.from(root.querySelectorAll('.draggable'));
		draggables.forEach((draggableElement) => {
			DropHelper.HandleDragDrop(this, this.actor, $(root), draggableElement);
		});

		// Foundry V14 DragDrop API for internal sorting (advantages, etc.)
		this.#dragDrop.forEach((d) => d.bind(this.element));
	}



	// CORRECTED 2026-07-31 (see openspec/changes/open-item-window-from-eye-icon/design.md Decision
	// 1): the eye opens a purpose-built READ-ONLY viewer (ItemViewer), never the item's own edit
	// sheet - "read-only" means the form controls are absent, not that an edit sheet is shown in a
	// read-only mode. `ItemViewer.open()` is itself the "open or focus existing" idiom (keyed on
	// the document's uuid), so a second click on the same item raises the existing viewer instead
	// of opening a duplicate. The old tab-scope lookup (the Attributes tab and the Features tab can
	// both render the same item's icon) is not needed: both icons resolve to the SAME embedded item
	// and therefore the SAME uuid and the SAME viewer instance.
	_handleCollapsibleClick(event) {
		const icon = event.currentTarget;
		if (!icon?.dataset?.itemid) return;

		// power_shapes.hbs prefixes shapeform icons with "shape-" to keep their (now removed)
		// .description div id distinct from other rows; strip it so the lookup below hits the
		// actor's real embedded item id.
		const itemId = icon.dataset.itemid.startsWith("shape-")
			? icon.dataset.itemid.slice("shape-".length)
			: icon.dataset.itemid;

		const item = this.actor.items.get(itemId);
		if (!item) {
			console.warn(`PC Actor: Could not find item with id "${itemId}"`);
			return;
		}

		ItemViewer.open(item);
	}

	// Owner-delegated addition to open-item-window-from-eye-icon: a keyed trait's eye (Attributes,
	// Spheres) opens the SAME read-only ItemViewer for a compendium document instead of an embedded
	// item. This is exactly why the viewer is generic (name/description/system fields only, never
	// per-type knowledge) - it serves a compendium document with no per-actor item sheet of its own
	// just as well as it serves an embedded item, and a Sphere document's rank 1..5 ladder is just
	// more description HTML to it. The icon only exists in the DOM when a match was already found at
	// render time (stats_attributes.hbs, power_spheres.hbs), so a missing uuid here would mean the
	// template rendered inconsistent markup, not a normal "no match" case - hence the warning rather
	// than a silent return. Nothing on this path writes to the actor.
	async _handleTraitDescriptionClick(event) {
		const icon = event.currentTarget;
		const uuid = icon?.dataset?.traituuid;
		if (!uuid) {
			console.warn("PC Actor: Trait description icon rendered with no compendium uuid.");
			return;
		}

		const doc = await fromUuid(uuid);
		if (!doc) {
			console.warn(`PC Actor: Trait description document "${uuid}" could not be resolved (pack may have been removed or updated).`);
			return;
		}

		ItemViewer.open(doc);
	}

	_handleUnfoldClick(event) {
		const button = event.currentTarget;
		if (!button) return;
		ItemHelper._onTableCollapse({ currentTarget: button }, this.actor._id);
	}	

	/**
	 * Settings sub-tabs.
	 * Binds click event listeners to settings tab buttons for navigating between settings sub-sections.
	 * @param {HTMLElement} root - The root element to search for settings tab buttons
	 */
	_bindSettingsTabs(root) {
		const buttons = root?.querySelectorAll?.('.sheet-setting-tabs [data-tab]');
		if (!buttons?.length) return;

		buttons.forEach(btn => {
			if (btn.dataset.settingsTabBound) return;
			btn.dataset.settingsTabBound = "true";
			btn.addEventListener("click", (event) => this._onSettingsTab(event));
		});
	}

	_onSettingsTab(event) {
		event?.preventDefault?.();

		const target = event?.currentTarget;
		const tabId = target?.dataset?.tab;
		if (!tabId) return;

		this._settingsTab = tabId;
		this._applySettingsTabState(this.element);
	}

	/**
	 * Secondary settings tabs (Bio/Stats&Advantages/Power/Combat/Features/Sheet).
	 * Applies the active state to the current settings tab and shows/hides corresponding content sections.
	 * @param {HTMLElement} root - The root element containing settings tab navigation and content
	 */
	_applySettingsTabState(root) {
		if (!root?.querySelectorAll) return;
		const activeTab = this._settingsTab || "statsadv";

		// Nav buttons
		const navButtons = root.querySelectorAll('.sheet-setting-tabs [data-action="settingsTab"][data-tab]');
		navButtons.forEach(btn => {
			btn.classList.toggle("active", btn.dataset.tab === activeTab);
		});

		// Content tabs
		const tabs = root.querySelectorAll('.sheet-setting-body .tab[data-group="settings"][data-tab]');
		tabs.forEach(t => {
			const isActive = t.dataset.tab === activeTab;
			t.classList.toggle("active", isActive);
			t.style.display = isActive ? "" : "none";
		});
	}

	/**
	 * Allow right-click clearing of individual health boxes.
	 * Binds contextmenu event listeners to health resource steps for clearing individual health levels.
	 * @param {HTMLElement} root - The root element to search for health resource steps
	 */
	_bindHealthContextMenu(root) {
		if (root.dataset.healthContextMenuBound) return;
		root.dataset.healthContextMenuBound = "true";
		
		root.addEventListener("contextmenu", (event) => {
			// Check if the clicked element is a health resource step
			const target = event.target.closest(".health .resource-value-step");
			if (!target) return;
			
			event.preventDefault();
			OnSquareCounterClear.call(this, event);
		});
	}



	#createDragDropHandlers () {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                dragstart: this._canDragStart.bind(this),
                drop: this._canDragDrop.bind(this)
            }

            d.callbacks = {
                dragstart: this._onDragStart.bind(this),
                dragover: this._onDragOver.bind(this),
                drop: this._onDrop.bind(this)
            }
			return new foundry.applications.ux.DragDrop(d);
        })
    }

	#dragDrop;

    _canDragStart() {
        return this.isEditable;
    }

    _canDragDrop() {
		return this.isEditable;
    }

    /**
     * @param {DragEvent} event - The drag start event
     */
    _onDragStart(event) { 
		const dataset = event.target.dataset;

		// Handle drag to order item lists (advantages, features, powers)
        if (dataset.list === "system.advantages" || dataset.list === "system.features" || dataset.list === "system.powers") {
            const data = {
                documentid: dataset.documentid,
                itemid: dataset.itemid,
                list: dataset.list,
                itemtype: dataset.type,
                type: "SortOrder"
            }
            event.dataTransfer.setData('text/plain', JSON.stringify(data));
            return;
        }

		// For all other drag operations, use parent implementation
		super._onDragStart(event);
	}

    /**
	 * Override _onDragOver to provide visual feedback for drag-and-drop operations.
	 * Handles advantage reordering with visual indicators.
	 * @param {DragEvent} event - The dragover event
	 */
	_onDragOver(event) {
		// Remove previous hover classes from all draggable items
		this.element.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(el => {
			el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
		});

		// Item classes that support drag-over feedback
		const itemClasses = ['.advantage-item', '.feature-item', '.power-item'];
		
		// Check for any item drop target
		for (const itemClass of itemClasses) {
			const target = event.target.closest(itemClass);
			if (target) {
				const rect = target.getBoundingClientRect();
				const midpoint = rect.top + rect.height / 2;
				if (event.clientY < midpoint) {
					target.classList.add('drag-over-top');
				} else {
					target.classList.add('drag-over-bottom');
				}
				return;
			}
		}

		// The ability-column drop highlight was removed here. It selected
		// `.ability-statArea[data-droparea]`, and `data-droparea` is authored only by the SPLAT
		// ITEM sheet's templates — no part of this sheet emits it on an ability column, so the
		// branch has never fired since it was written. Dropping onto an ability column still
		// works; only the highlight was missing, and it was missing silently. Found by
		// binder-selector-check.py, which parses these selectors out of this file and asserts
		// some template can still produce each one.
	}

    async _onDrop(event) {
		const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)

		// Handle different data types
		switch (data.type) {
			// Item position reordering - handled locally
			case 'SortOrder':                
				return this._onReorderItem(event, data);
			// Dropped Item from compendium/sidebar
			case 'Item':                
				return this._onDropItem(event, data);
		}
	}

	async _onDropItem(event, data) {
		const droppedItem = await Item.implementation.fromDropData(data);

		if (droppedItem.type === "Splat") {
			// Check if actor already has a splat item
			const hasSplatItem = this.actor.items.some(i => i.type === "Splat");
			
			// Only require unlock if there's already a splat item (changing splat)
			if (this.locked && hasSplatItem) {
				ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
				return;
			}

			await DropHelper.OnDropItem(event, droppedItem, this.actor);

			// Unlock the sheet after splat item is installed
			if (this.locked) {
				this.locked = false;
				await this.render(false);
			}
			
			return;
		}	
		if ((droppedItem.type === "Power") || (droppedItem.type === "Sphere")) {
			await DropHelper.OnDropItem(event, droppedItem, this.actor);
			return;
		}
		if (droppedItem.type === "Advantage") {
			await DropHelper.OnDropItem(event, droppedItem, this.actor);
		 	return;
		}

		const itemData = droppedItem.toObject();
		
		if (itemData.type === "Ability") {
			if (itemData.system.type === "wod.abilities.ability") {
				itemData.system.type = "wod.abilities.talent";
			}
		}		

		if (itemData.system?.isremovable !== undefined) {
			itemData.system.isremovable = true;
		}
		if (itemData.system?.settings?.isremovable !== undefined) {
			itemData.system.settings.isremovable = true;
		}

		return await this.actor.createEmbeddedDocuments('Item', [itemData]);
    }

	async _onReorderItem(event, data) {
		// Validate this is the correct document
		if (data.documentid !== this.actor._id) {
			// Clean up on early return
			this.element.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(el => {
				el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
			});
			return;
		}
		
		// Only handle items of correct type
		if (data.itemtype !== "Advantage" && data.itemtype !== "Trait" && data.itemtype !== "Sphere" && data.itemtype !== "Realm") {
			// Clean up on early return
			this.element.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(el => {
				el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
			});
			return;
		}

		let itemClass = "";

		if (data.itemtype === "Advantage") {
			itemClass = ".advantage-item";
		}
		else if ((data.itemtype === "Feature") || (data.itemtype === "Trait")) {
			itemClass = ".feature-item";
		}
		else if ((data.itemtype === "Sphere") || (data.itemtype === "Realm") || (data.itemtype === "Power")) {
			itemClass = ".power-item";
		}
		else {
			// Clean up on early return
			this.element.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(el => {
				el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
			});
			return;
		}

		let dropArea = data.itemtype.toLowerCase();
		dropArea = (dropArea === "sphere" || dropArea === "realm") ? "powers" : dropArea;

		let orderProperty = "system.settings.order";
		orderProperty = data.itemtype === "Trait" ? 'system.order' : orderProperty;

		// Use the shared function from DropHelper
		const result = await DropHelper.ReorderActorItems(
			this.actor,
			event,
			data,
			{
				itemClass: itemClass,
				dropArea: dropArea,
				orderProperty: orderProperty,
				sheet: this
			}
		);
		
		// Always clean up drag-over classes after reorder attempt
		this.element.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(el => {
			el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
		});
	}

	/**
	 * Numeric value inputs for attributes/abilities with max > 6.
	 * @param {HTMLElement} root
	 */
	_bindStatValueInputs(root) {
		const inputs = root.querySelectorAll?.(".resource-value-input");
		if (!inputs?.length) return;

		inputs.forEach(el => {
			if (el.dataset.valueBound) return;
			el.dataset.valueBound = "true";
			el.addEventListener("change", (event) => {
				OnStatValueChange.call(this, event, event.currentTarget);
			});
		});
	}

	/**
	 * Quintessence wheel right-click (contextmenu) for paradox.
	 * Binds contextmenu event listeners to quintessence wheel elements for handling paradox wheel interactions.
	 * @param {HTMLElement} root - The root element to search for quintessence wheel elements
	 */
	_bindQuintessenceContextMenu(root) {
		if (this.actor.system.settings.splat !== CONFIG.worldofdarkness.splat.mage) return;

		const hasParadox = this.actor.items.some(
			item => item.type === "Advantage" && item.system.id === "paradox"
		);
		if (!hasParadox) return;

		const wheelElements = root.querySelectorAll?.(".quintessence-wheel .wheel-step");
		if (!wheelElements?.length) return;
		
		wheelElements.forEach(el => {
			if (el.dataset.contextBound) return;
			el.dataset.contextBound = "true";
			el.addEventListener("contextmenu", (event) => {
				OnParadoxWheelClick.call(this, event, event.currentTarget);
			});
		});
	}

	/**
	 * Imbalance right-click (contextmenu) for willpower.
	 * Binds contextmenu event listeners to permanent willpower elements for handling imbalance.
	 * @param {HTMLElement} root - The root element to search for willpower elements
	 */
	_bindImbalanceContextMenu(root) {
		if (this.actor.system.settings.splat !== CONFIG.worldofdarkness.splat.changeling) return;

		const willpowerElements = root.querySelectorAll?.(".willpower > .resource-value > .resource-value-step");
		if (!willpowerElements?.length) return;
		
		willpowerElements.forEach(el => {
			if (el.dataset.contextBound) return;
			el.dataset.contextBound = "true";
			el.addEventListener("contextmenu", (event) => {
				OnHandleImbalance.call(this, event, event.currentTarget);
			});
		});
	}
}

/* Moved to `module/scripts/splat-helpers.js` (body unchanged) so that non-sheet code can ask the
   same question - `create-helpers.js` needs it to decide which splat's create buttons to offer, and
   importing it from here would have closed the cycle pc-actor-sheet -> action-helpers ->
   create-helpers -> pc-actor-sheet. Re-exported so this module's public surface is unchanged. */
export { getSplat };

export const getPowertype = function (actor) {
	if (!actor || !actor.system || !actor.system.settings) {
		return "power";
	}

	// Use variantsheet first, then splat, then actor type as fallback
	let splatname = "";
	if (actor.system.settings.variantsheet && actor.system.settings.variantsheet !== "") {
		splatname = actor.system.settings.variantsheet.toLowerCase();
	} else if (actor.system.settings.splat && actor.system.settings.splat !== "") {
		splatname = actor.system.settings.splat.toLowerCase();
	} else {
		splatname = actor.type ? actor.type.toLowerCase() : "pc";
	}
	
	let powertype = "power";

	if (splatname === CONFIG.worldofdarkness.splat.vampire) {
		powertype = "discipline";
	} 
	else if ((splatname === CONFIG.worldofdarkness.splat.werewolf) || 
				(splatname === CONFIG.worldofdarkness.splat.changingbreed) || 
				((actor.system.settings.game === CONFIG.worldofdarkness.splat.werewolf) && (splatname === CONFIG.worldofdarkness.splat.spirit))) {
		powertype = "gift";
	} 
	else if ((splatname === CONFIG.worldofdarkness.splat.mage) || 
				((actor.system.settings.game === CONFIG.worldofdarkness.splat.mage) && (splatname === CONFIG.worldofdarkness.splat.spirit))) {
		powertype = "magic";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.changeling) {
		powertype = "dreaming";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.hunter) {
		powertype = "edge";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.demon) {
		powertype = "lore";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.mummy) {
		powertype = "scarab";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.wraith) {
		powertype = "death";
	}
	else if (splatname === CONFIG.worldofdarkness.splat.exalted) {
		powertype = "exaltedcharm";
	}

	return powertype;
}

/**
 * The bio splatfield set the system DECLARES for this actor's splat, or `null` when it declares none.
 *
 * `assets/data/sheet/biotab.js` -> `templates.SetupBioTab()` -> `CONFIG.worldofdarkness.sheetv2.bio`,
 * keyed `[era][splat]` with `modern` as the fallback era, exactly as `DropHelper.PopulateBio`
 * (`drop-helpers.js:1391-1397`) reads it. Factored out of `applyDeclaredSplatfieldTypes` so that the
 * backfill below asks the same question of the same authority; the lookup was duplicated nowhere else
 * and is duplicated nowhere now.
 *
 * `mortal` declares `{}`, and `changeling`/`hunter` are not declared at all — for those this returns
 * an empty map or `null` and every consumer is a no-op. That is the correct behaviour, not a gap to
 * paper over: their fields exist only in the pack Splat Items.
 *
 * The returned object is the LIVE declaration — `SetupBioTab` returns `databiotab` itself, not a
 * clone, so `CONFIG` holds references into that module. Never hand one of these field objects to the
 * render context: copy it. The enrichment pass in `prepareBioContext` writes `enriched` onto whatever
 * it is given, and a `mod` is written onto generation fields elsewhere, so leaking a declaration
 * object into the context would mutate the seed for every actor opened afterwards.
 *
 * @param {Actor} actor
 * @returns {Record<string, object>|null}
 */
const getDeclaredSplatfields = function (actor) {
	const bio = CONFIG?.worldofdarkness?.sheetv2?.bio;
	if (!bio) return null;

	const splat = getSplat(actor);
	const era = actor?.system?.settings?.era ?? "";

	return bio[era]?.[splat] ?? bio.modern?.[splat] ?? null;
}

/**
 * add-wraith-shadow-budget §3.1/§3.4 — reconcile a stored bio splatfield with the field type the
 * system DECLARES for it, in the one direction that is always safe.
 *
 * WHY THIS IS NEEDED AT ALL. `assets/data/sheet/biotab.js` looks like the sheet's field
 * declaration, and it is not: it is a SEED. `DropHelper.PopulateBio` copies it onto an actor once,
 * when a Splat item is dropped, and the wodchar exporter writes its own copy
 * (`WRAITH_BIO_SPLATFIELDS`, `export.ts`) at import. From then on the sheet renders
 * `actor.system.bio.splatfields` — per-actor data. So changing a `type` in `biotab.js` changes what
 * the NEXT actor is seeded with and nothing about the ones that already exist. Promoting
 * `archetype` from `input` to `select` would otherwise have needed a data migration over every live
 * wraith, which is precisely the migration `add-wraith-shadow-budget` was scoped around.
 *
 * WHY IT ONLY PROMOTES, AND ONLY TO A SELECT. Overlaying the declaration wholesale would rewrite
 * fields the exporter populates per character — Mage's seven are built by `buildMageSplatfields()`
 * and Vampire's `generation` is a select carrying a `mod` — and a demotion (select -> input) would
 * push a non-string value through `bio_splatfields.hbs`'s `{{localize field.value}}`, whose
 * `key.split(...)` throws and takes the WHOLE sheet down (measured on a numeric `generation`,
 * 2026-07-28). One direction — a stored `input`/absent type promoted to a declared `select` — can
 * do neither: the select branch never localizes the value, and `lookupListData` returns an
 * unmatched value unchanged, so nothing a GM typed is lost or coerced.
 *
 * The VALUE is never touched, and each field is COPIED rather than mutated: `context.splatfields`
 * shares its field objects with `actor.system.bio.splatfields`, so writing through them would edit
 * live actor data from a render path.
 *
 * @param {Actor} actor
 * @param {Record<string, object>} splatfields  the visible stored fields, as built above
 * @returns {Record<string, object>} the same map, with promoted fields replaced by copies
 */
export const applyDeclaredSplatfieldTypes = function (actor, splatfields) {
	const fields = splatfields ?? {};
	const declared = getDeclaredSplatfields(actor);
	if (!declared) return fields;

	const result = {};

	for (const [key, field] of Object.entries(fields)) {
		const decl = declared[key];

		if ((decl?.type === "select") && (field?.type !== "select")) {
			result[key] = { ...field, type: "select", listdata: decl.listdata ?? "" };
		}
		else {
			result[key] = field;
		}
	}

	return result;
}

/**
 * The only `type`s the Bio tab can actually draw. `bio_splatfields.hbs` has a branch for `input` and
 * one for `select` and no `else`; `bio_splatboxes.hbs` draws `textbox` and nothing else. A field of
 * any other type renders on no part of the sheet, so the backfill below refuses to add one rather
 * than adding something invisible and calling the gap closed.
 */
const RENDERABLE_SPLATFIELD_TYPES = new Set(["input", "select", "textbox"]);

/**
 * Does this `listdata` name resolve to a list with at least one REAL option?
 *
 * This is the guard that makes the backfill safe to point at a declared `select`. A `select` whose
 * `listdata` does not resolve paints an EMPTY dropdown with no free-text input to escape through
 * (`bio_splatfields.hbs:26` — `{{selectOptions (lookup ../listData field.listdata) ...}}`), which is
 * strictly WORSE than the absent field it would be replacing: the absent field at least cannot lie
 * about being editable. `hunter` is the live example of the failure mode — its two picks' lists are
 * built behind `data.system.settings.splat === splat.hunter` (`select-helpers.js:1033`), which a
 * wodchar hunter never satisfies because it exports as a V20 `mortal`.
 *
 * So the rule is not a list of trusted keys, which would rot the moment a splat gains a field: ask
 * the list itself, at render time, for the actor being rendered. Both list shapes are accepted
 * because both ship — v1 lists are option MAPS (`{value: label}`), v2 lists are ARRAYS of
 * `{value, label}` — and in both the leading "- select -" placeholder is keyed by the empty string,
 * so a list that contains only the placeholder counts as empty. That is deliberate: a dropdown whose
 * only entry is "choose one" is the same dead end as an empty one.
 *
 * @param {object} listData    the map `SelectHelper.SetupItem` built for this actor
 * @param {string} listname    the declaration's `listdata` key
 * @returns {boolean}
 */
const declaredListHasOptions = function (listData, listname) {
	if (!listname) return false;

	const list = listData?.[listname];
	if (!list) return false;

	if (Array.isArray(list)) {
		return list.some((option) => ((option?.value ?? "") !== ""));
	}

	if (typeof list === "object") {
		return Object.keys(list).some((key) => (key !== ""));
	}

	return false;
}

/**
 * align-splatfields-declaration-seam §D3 route B — supply a declared bio field the actor never
 * stored, at RENDER time, so that a splat's identity reaches its sheet however the actor was created.
 *
 * WHY THE SHIM ABOVE CANNOT DO THIS. `applyDeclaredSplatfieldTypes` walks the STORED map, so it can
 * promote a field the actor has and can never add one it lacks. `prepareBioContext` takes the field
 * SET from stored data too. Between them, a field the writer omitted is permanently invisible and
 * correcting the declaration does not reach it. Measured read-only against the live world on
 * 2026-08-03: six werewolves have no `bio.splatfields` key at all — their Breed and Auspice survive
 * only as prose in `bio.concept` — and five of six vampires carry `generation` alone, without
 * `sect`/`clan`/`bloodline`/`weakness`/`sire`. Of 89 actors not one has ever received a Splat drop,
 * which is the population the declaration was written for, so "a drop will seed it" is not a writer
 * that exists here.
 *
 * THIS IS RENDER, NOT MIGRATION. Nothing is written to any actor: the return value is a fresh map of
 * fresh field objects for this one render pass. There is nothing to revert, and an actor whose fields
 * a future export or drop DOES write is unaffected, because a stored field always wins:
 *
 *   - a key already in `fields` (i.e. stored AND `isvisible === true`, already promoted) is left
 *     exactly as it is, in its existing position — so an actor whose six fields were populated by
 *     hand renders byte-identically, with no duplicate row and no reordering. Backfilled keys are
 *     appended after the stored ones, never interleaved.
 *   - a stored `isvisible === false` is a GM's deliberate hide (the eye in the Settings tab writes
 *     that boolean and only that boolean, `OnActorSwitch` refuses a non-boolean) and is respected:
 *     the field stays hidden.
 *   - a stored value is carried onto the backfilled field and the declaration's default never
 *     overwrites it.
 *
 * THE PARTIAL-WRITE CASE IS WHY THE STORED MAP IS PASSED IN WHOLE rather than just the visible one,
 * and it is not an edge case — it is what happens the FIRST time anyone edits a backfilled field.
 * `onSubmitActorForm` writes a changed `INPUT` through `foundry.utils.setProperty(actorData,
 * "system.bio.splatfields.<key>.value", …)`, which creates the intermediate object, so the actor
 * gains `{value: "Brujah"}` — a field with no `label`, no `type` and no `isvisible`. A `SELECT`
 * change goes through `_prepareSubmitData` and writes the whole form, so it does that for every
 * rendered bio field at once. Such a field fails the strict `isvisible === true` filter, so without
 * healing it the row would VANISH taking the just-typed value with it. Here it is completed from the
 * declaration and rendered, value first: type a Clan, it stays a Clan.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT DO. It will not add a field whose type no template draws, and
 * it will not add a `select` whose option list does not resolve for this actor — see
 * `declaredListHasOptions`. Both refusals are silent by design: the correct answer to "this field
 * cannot be drawn usefully" is the status quo, not a dead control.
 *
 * @param {Actor} actor
 * @param {Record<string, object>} stored      `actor.system.bio.splatfields`, unfiltered
 * @param {Record<string, object>} splatfields the render map built so far (filtered + promoted)
 * @param {object} listData                    `context.listData`, needed for the `select` check
 * @returns {Record<string, object>} the render map, with drawable declared fields appended
 */
export const backfillDeclaredSplatfields = function (actor, stored, splatfields, listData) {
	const fields = splatfields ?? {};
	const declared = getDeclaredSplatfields(actor);
	if (!declared) return fields;

	const storedFields = stored ?? {};
	const added = {};

	for (const [key, decl] of Object.entries(declared)) {
		if (!decl || (typeof decl !== "object")) continue;

		// already on the sheet: the stored copy wins, untouched and in place
		if (Object.prototype.hasOwnProperty.call(fields, key)) continue;

		const storedField = storedFields[key];

		// a GM switched the eye off — that is an answer, not an omission
		if (storedField?.isvisible === false) continue;

		// the declaration is the base; every property the actor actually stored overrides it
		const field = { ...decl };

		if (storedField && (typeof storedField === "object")) {
			for (const [property, value] of Object.entries(storedField)) {
				if (value !== undefined) field[property] = value;
			}
		}

		// the same ONE-WAY reconciliation `applyDeclaredSplatfieldTypes` performs, and for the same
		// reason: a declared pick may be promoted to, never demoted from. A demotion would push a
		// non-string value through `{{localize field.value}}`, whose `key.split(...)` throws and takes
		// the whole sheet down (measured on a numeric `generation`, 2026-07-28).
		if (decl.type === "select") {
			field.type = "select";
			if (!field.listdata) field.listdata = decl.listdata ?? "";
		}

		if (!field.label) field.label = decl.label ?? "";

		if (!RENDERABLE_SPLATFIELD_TYPES.has(field.type)) continue;
		if ((field.type === "select") && !declaredListHasOptions(listData, field.listdata)) continue;

		// belt and braces for the crash above: the `input` and `textbox` branches DO localize the
		// value, so anything this function emits down those branches is a string. Only the copy is
		// coerced; no actor is touched.
		if ((field.type !== "select") && (typeof field.value !== "string")) {
			field.value = (field.value ?? "").toString();
		}

		// the Bio tab's visibility predicate is strict `=== true`, so a field added without this is
		// added invisibly — present in the context and drawn nowhere
		field.isvisible = true;

		added[key] = field;
	}

	return { ...fields, ...added };
}

/**
 * add-pc-sheet-v3 §8.1 — the body of `prepareBioContext`, extracted so `prepareFeatureContext` can
 * call it too once bio merges into the Features/Personaje part (§8.2). Deliberately does NOT set
 * `context.tab`: that line picks which nav tab a `{{{getGetStatArea_v2}}}`-style banner would
 * highlight, and it means something different depending on who calls this — `prepareBioContext`
 * still sets it to `tabs.bio` (kept registered until the merged tab is verified, per §8.1's own
 * instruction), `prepareFeatureContext` already sets it to `tabs.feature` before calling this.
 *
 * THE ORDER BELOW IS LOAD-BEARING, unchanged from before this extraction:
 * `applyDeclaredSplatfieldTypes` (promotes a STORED field's type) must run before
 * `backfillDeclaredSplatfields` (adds a field the actor never stored), because the backfill refuses
 * to add a declared `select` whose option list does not resolve, and it can only ask that question
 * once `listData` already exists — see align-splatfields-declaration-seam §D3.
 *
 * @param {object} context The part context to populate.
 * @param {Actor} actor The PC actor.
 * @returns {Promise<object>} The same context, with the bio fields set.
 */
export const addBioContext = async function (context, actor) {
	context.appearance = actor.system.bio.appearance;
	context.background = actor.system.bio.background;
	context.roleplaytip = actor.system.bio.roleplaytip;
	context.enrichedAppearance = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.bio.appearance, {async: true});
	context.enrichedBackground = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.bio.background, {async: true});
	context.enrichedRoleplaytip = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.bio.roleplaytip, {async: true});

	// Get listData for bio select fields - same pattern as legacy templates (bio_mage_background.html)
	// Pass actor directly to SetupItem so functions that need actor data (custom handling) work correctly
	//
	// align-splatfields-declaration-seam §D3 — this MOVED above the splatfields block, and the order is
	// now load-bearing rather than incidental: `backfillDeclaredSplatfields` refuses to add a declared
	// `select` whose option list does not resolve, and it can only ask that question once `listData`
	// exists. `SelectHelper.SetupItem` reads the actor only, never the splatfield context, so nothing
	// depends on the old order.
	const splat = getSplat(actor);
	//const actorData = { type: CONFIG.worldofdarkness.sheettype[splat] || splat, system: actor.system };
	//context.listData = SelectHelper.SetupItem(actorData, true);
	context.listData = SelectHelper.SetupItem(actor, true);

	//context.splatfields = actor.system.bio.splatfields.filter(([_, field]) => field?.isvisible !== false);
	const allSplatfields = actor.system.bio.splatfields ?? {};
	context.splatfields = Object.fromEntries(
	Object.entries(allSplatfields).filter(([_, field]) => field?.isvisible === true)
	);

	// add-wraith-shadow-budget §3.1/§3.4 — the system's own declaration wins when it PROMOTES a
	// free-text field to a pick. See applyDeclaredSplatfieldTypes above for why this exists at all
	// and why it only ever promotes.
	context.splatfields = applyDeclaredSplatfieldTypes(actor, context.splatfields);

	// align-splatfields-declaration-seam §D3 route B — and it supplies a declared field the actor
	// never stored, which is the one thing the promotion above structurally cannot do. Runs BEFORE the
	// enrichment pass below so that a backfilled `textbox` gets its `enriched` like any other.
	context.splatfields = backfillDeclaredSplatfields(actor, allSplatfields, context.splatfields, context.listData);

	// add-faction-sect-entities — the eye icon next to a Mage's free-text "Secta" splatfield row
	// (`bio_splatfields.hbs`), resolved by the field's OWN value (there is no per-row key here the
	// way Attributes/Spheres have — see `trait-enrichment.js`'s `matchNameDirectly`). ALWAYS set,
	// like `attributeCompendiumUuid`/`sphereCompendiumUuid` above: `test-part-render.mjs` flags a
	// context key a template reads but a preparer never builds, on EVERY structure, even one where
	// the condition never holds (every non-Mage splat, or a Mage with no Secta value yet) — an `if`
	// around the assignment itself is exactly the silent-empty-block shape that harness exists to
	// catch. `buildTraitCompendiumUuidMap` already degrades an empty/no-op key list to `{}`, so
	// passing `[]` off-splat costs nothing and needs no pack lookup at all.
	context.sectCompendiumUuid = await buildTraitCompendiumUuidMap(
		"sect",
		splat === "mage" && context.splatfields?.sect?.value ? [context.splatfields.sect.value] : []
	);

	// add-affiliation-eye-icon — same treatment, one splatfield over: "Afiliación" is also free text
	// matched by its own value, against the separate `mage-affiliation` pack. ALWAYS assigned for
	// the same test-part-render.mjs reason as `sectCompendiumUuid` above.
	context.affiliationCompendiumUuid = await buildTraitCompendiumUuidMap(
		"affiliation",
		splat === "mage" && context.splatfields?.affiliation?.value ? [context.splatfields.affiliation.value] : []
	);

	// Enrich textbox splatfields for bio_splatboxes.hbs
	if (context.splatfields) {
		for (const [key, field] of Object.entries(context.splatfields)) {
			if (field.type === "textbox") {
				field.enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(field.value, {async: true});
			}
		}
	}

	// link-mage-focus-as-items — a mage's Paradigm/Practice/Instrument picks as embedded `Feature`
	// items of a dedicated subtype, read HERE, inside `addBioContext` — the ONE function BOTH
	// `prepareBioContext` (v2's standalone `bio` part) AND `prepareFeatureContext` (v2's AND v3's
	// `feature`/"Personaje" part, add-pc-sheet-v3 §8.1/§8.2 — v3 has no `bio` part of its own any
	// more) call. So building the lists here, rather than in either caller, is what makes them
	// arrive on whichever part actually renders them (v3's `v3/feature.hbs`) without duplicating the
	// fetch in a caller that has no business knowing about Focus at all.
	//
	// Built for every actor, never gated on splat: an empty array costs nothing and a template that
	// tests `.length` never has to distinguish "not a mage" from "a key nobody set" — the latter is
	// the four-times-repeated silent-empty-render bug this sheet's comments already warn about
	// elsewhere. `context.splatfields` itself is left untouched: it is shared with the v2/v3
	// templates that still read it for OTHER splats' textboxes, and removing the three entries from
	// it here would blank them on v2's Bio tab too, which is explicitly out of scope.
	//
	// A FOLLOW-UP after the initial ship replaced the in-place `<details>` disclosure with the same
	// eye-icon `ItemViewer` every other row on this sheet opens (see `focus_item.hbs`'s own header).
	// That viewer resolves the description itself (`ItemViewer#_prepareContext`), so these three
	// lists no longer need per-item enrichment — the `enrichFocusItems` helper that used to wrap
	// each call below (and the `enrichedDescription`/`hasDescription` properties it mutated onto
	// each item) is dead code now that `focus_item.hbs` reads neither, and was removed rather than
	// left behind. Verified by rendering: a mage's Focus rows still show their names, and the eye
	// still opens the same populated viewer merit/background/ability rows do.
	context.mageFocusParadigms   = ItemHelper.GetItemType(actor, "Feature", "wod.types.paradigm");
	context.mageFocusPractices   = ItemHelper.GetItemType(actor, "Feature", "wod.types.practice");
	context.mageFocusInstruments = ItemHelper.GetItemType(actor, "Feature", "wod.types.instrument");

	return context;
}

export const prepareBioContext = async function (context, actor) {
  	context.tab = context.tabs.bio;

	return addBioContext(context, actor);
}

/**
 * add-prism-of-focus-foundry — builds the render context for the structured Preceptos+Prácticas
 * section (task groups 1-3/8/11), a sibling of the free-text Focus items `addBioContext` builds
 * just above this function's one caller. Built for every actor (mirroring `addBioContext`'s own
 * "unconditional build, template gates on splat/flag" convention) — `context.prismActive` is what
 * actually decides whether the template renders anything.
 * @param {object} context
 * @param {Actor} actor
 * @returns {object} context, for chaining
 */
export const preparePrismContext = function (context, actor) {
	context.prismActive = PrismHelper.IsActive(actor);
	if (!context.prismActive) return context;

	const tenetRows = PrismHelper.ListOwnedTenets(actor).map((row) => ({
		...row,
		associatedText: row.associated.join(", "),
		limitedText: row.limited.join(", ")
	}));
	context.prismTenetGroups = {};
	for (const row of tenetRows) {
		const category = row.category || "othertraits";
		(context.prismTenetGroups[category] ??= []).push(row);
	}

	context.prismPractices = PrismHelper.ListOwnedPractices(actor).map((row) => ({
		item: row.item,
		id: row.id,
		kind: row.kind,
		state: row.state,
		value: parseInt(row.item.system.value) || 0,
		corruptedState: row.item.system.corrupted_state || "clean",
		benefit_es: row.mechanics.benefit_es ?? "",
		penalty_es: row.mechanics.penalty_es ?? "",
		price_es: row.mechanics.price_es ?? "",
		// task 6.2 — the 7 `prompt`-bucket Prácticas get their own cost/pool calculator button
		// instead of (never in addition to) the checkbox/tiered UI the `auto`/`corrupted` buckets
		// use, since a flat checkbox modifier cannot express a cost calculation or a choice.
		isPrompt: PROMPT_PRACTICE_IDS.includes(row.id),
		// task 10.3 — Ciencias Infernales' one-time, locked base-Práctica choice (A21): shown
		// inline on its row until `chosen_base_practice_id` is set, then locked read-only.
		needsInfernalBaseChoice: row.id === "infernal-sciences" && !row.item.system.chosen_base_practice_id,
		chosenBase: row.item.system.chosen_base_practice_id || "",
		chosenBaseLabel: row.item.system.chosen_base_practice_id
			? game.i18n.localize(`wod.prism.infernal.base.${INFERNAL_BASE_LABEL_KEY[row.item.system.chosen_base_practice_id] ?? ""}`)
			: ""
	}));

	// task 11.2 — each `practiceTraits.*` field is shown only when its OWNING Práctica's rating is
	// above 0 (display gate is per-Práctica; storage stays per-actor, design.md D9).
	const ratingFor = (practiceId) => context.prismPractices.find((p) => p.id === practiceId)?.value ?? 0;
	context.prismTraitsVisible = {
		heartBeast: ratingFor("animalism") > 0,
		primaryElement: ratingFor("elementalism") > 0,
		godBonding: ratingFor("divine-bond") > 0,
		mediumshipUmbra: ratingFor("mediumship") > 0,
		shamanismEnvironment: ratingFor("shamanism") > 0,
		witchcraftCycle: ratingFor("witchcraft") > 0
	};
	context.practiceTraits = actor.system.practiceTraits;

	return context;
}

/** The content module whose provenance flags the sheet reads. Same constant, same reason, as in
 *  `trait-enrichment.js` and `compendium-description.js`. */
const COMPENDIUM_MODULE = "wod20-compendium-es";

/** The character generator's export namespace. Every trait `wod20-char` writes carries
 *  `{ key, category }` here; `buildConnectionGroups` below already reads the same flags to match a
 *  roster entry to its Background. */
const WODCHAR_MODULE = "wod20-char";

/**
 * add-wraith-shadow-budget §3.2 — is this item one of the Shadow's Thorns?
 *
 * THREE ways to be one. The second and third are what make the change work without a data
 * migration or a content-repo change:
 *
 *   1. `system.type === "wod.types.thorn"` — the sub-kind this change introduces. What the create
 *      button writes, and what a GM can retype an item to on its own Feature sheet.
 *   2. the pack's own provenance flag, `flags["wod20-compendium-es"].source_type === "thorn"` —
 *      what the 24 documents in the shipped `wraith-thorns` pack actually carry. Every one of them
 *      is `type: "Feature"` with `system.type: "wod.types.othertraits"` (counted 2026-08-02), the
 *      exporter's default for any Feature-mapped entity type. Re-typing those documents lives in
 *      `webgen/`, a different repo and a different owner, so the sheet reads what ships instead of
 *      waiting for it. A Thorn dragged straight from the compendium lands in the Shadow area with
 *      nothing written to it.
 *   3. the CHARACTER GENERATOR's own flag, `flags["wod20-char"].category === "thorn"` — and this
 *      is the one that every wraith in the live world actually holds. Measured 2026-08-02 against
 *      the deployed v7.5.30 world: the only wraith PC (`G5sYPF5UzB5iJ6wF`, Rike Heinz) carries her
 *      three Thorns as `type: "Feature"` / `system.type: "wod.types.othertraits"` stamped
 *      `flags["wod20-char"]: { key: "thorn:susurros", category: "thorn", unresolved: true }` — the
 *      compendium namespace is absent, so recognisers 1 and 2 both missed them and all three
 *      rendered in Other Traits while the Shadow area's Thorns block sat empty. 3 held, 0 rendered:
 *      exactly the document-versus-sheet count the requirement's own scenario forbids.
 *
 *      The cause is upstream and stays there. `wod20-char`'s `FEATURE_TYPE_BY_TRAIT_CATEGORY`
 *      (`web/server/services/foundry/types.ts:592`) maps `passion` / `darkpassion` / `fetter` /
 *      `connection` to sub-kinds and has no `thorn` entry, because `wod.types.thorn` did not exist
 *      when it was written; so `buildNoteItem` falls back to `othertraits` and flags the trait
 *      `unresolved`. Adding the entry there is a `wod20-char` change and would still only fix
 *      characters re-exported afterwards. Reading the flag fixes every already-imported wraith at
 *      once and keeps working if the entry is never added — the same read-side reasoning as (2).
 *
 * WHY NOT `wod.types.sliver`. That is Foundry's own Thorn sub-kind and it is a POWER type, for
 * which `ItemHelper.BuildPowerSections` declares no `slivers` section — so a "correctly" typed
 * Thorn renders on no part of the sheet, which is the measured `wod.types.specialadvantage` defect
 * exactly. The content settles it independently of that: the pack ships Features, so a Power
 * carrier could not have received them however many sections were built for it.
 *
 * @param {Item} item
 * @returns {boolean}
 */
export const isThornFeature = function (item) {
	if (item?.type !== "Feature") return false;
	if (item.system?.type === "wod.types.thorn") return true;

	const packFlags = item.flags?.[COMPENDIUM_MODULE];
	if ((packFlags?.source_type === "thorn") && (packFlags?.line === "wraith")) return true;

	// No `line` test on this one: `category` is the generator's own trait vocabulary and `thorn`
	// belongs to no other splat. The Other Traits exclusion that consumes this predicate is
	// wraith-gated anyway, so an off-splat item could never be hidden by it.
	return item.flags?.[WODCHAR_MODULE]?.category === "thorn";
}

/**
 * The rating a rated Feature row actually shows, resolved in the SAME order `feature_item.hbs`
 * resolves it for these blocks: `system.value` first, `system.level` second (the `valuefirst`
 * arrangement). Anything unparseable or non-positive counts as 0.
 *
 * This exists so the Dark-Passion ceiling readout can never disagree with the numbers printed on
 * the rows immediately above it — the two would drift the moment one of them picked a different
 * field, and a bound that contradicts the rows it bounds is worse than no bound.
 *
 * @param {Item} item
 * @returns {number}
 */
export const featureRating = function (item) {
	for (const candidate of [item?.system?.value, item?.system?.level]) {
		const n = Number(candidate);
		if (Number.isFinite(n) && (n > 0)) return n;
	}
	return 0;
}

/**
 * Builds the four "advantage" lists - backgrounds, merits, flaws and other traits.
 *
 * This is the ONLY place these four predicates live. `_preparePartContext` hands every sheet part
 * its own context object, so the Attributes tab's Advantages block (stats_features.hbs, prepared by
 * prepareStatContext) and the Features tab (feature.hbs, prepared by prepareFeatureContext) each
 * need the lists built for them. Both call this helper so the two views can never disagree about
 * what an actor holds.
 *
 * @param {object} context 	The part context to populate.
 * @param {Actor} actor 	The PC actor.
 * @returns {object} 		The same context, with backgrounds / merits / flaws / othertraits set.
 */
export const prepareAdvantageLists = function (context, actor) {
	context.backgrounds = ItemHelper.GetItemType(actor, "Feature", "wod.types.background");
	context.merits 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.merit");
	context.flaws 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.flaw");

	// Other traits reach an actor on TWO different carriers and neither may be dropped:
	//   - the system's own create button makes a Trait (CreateHelper.CreateButtonsNotev2), and
	//   - the wod20-compendium-es exporter emits a Feature - "wod.types.othertraits" is its default
	//     system.type for any Feature-mapped entity type, so clans, kith, houses, totems, banes,
	//     derangements, martial arts, chantry traits, paradigms, practices, instruments and more
	//     all arrive as Features.
	// Reading only Trait (as this filter used to) meant every one of those compendium items
	// rendered nowhere at all on a PC sheet. The system.placement check is kept: it is what
	// separates a feature-tab other trait from the powers-tab one (see preparePowersContext).
	//
	// add-wraith-shadow-budget §3.2 — one exception, and it is narrow on purpose. A Thorn dragged
	// from the `wraith-thorns` pack arrives as exactly this shape (`Feature` +
	// `wod.types.othertraits` + `placement: "feature"`), because that is the exporter's default for
	// every Feature-mapped entity type. On a WRAITH it now renders in the Shadow area instead, so
	// leaving it here too would print every Thorn twice. `isThornFeature` recognises it by the
	// pack's own provenance flag, which is why no migration and no re-typing of the catalog is
	// needed for a Thorn to land in the right block.
	//
	// The `isWraith` guard is the whole safety of it: on any other line the Shadow area does not
	// render, so removing the item here would hide it completely — the silent-loss failure mode this
	// sheet has already been bitten by twice. A vampire holding a thorn-flagged Feature keeps it in
	// Other Traits.
	const isWraith = getSplat(actor) === CONFIG.worldofdarkness.splat.wraith;

	const allFeatureTraits = (actor?.items ?? []).filter(item =>
										((item.type === "Trait") || (item.type === "Feature"))
										&& item.system.type === "wod.types.othertraits"
										&& item.system.placement === "feature"
										&& !(isWraith && isThornFeature(item)));

	context.othertraits = allFeatureTraits.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	return context;
}

/**
 * add-pc-sheet-v3 §8.6 — the Personaje/Features tab's rail badge, a plain item count.
 *
 * SYNCHRONOUS ON PURPOSE. `prepareFeatureContext` also counts `connections` (via
 * `buildConnectionGroups`, which enriches each entry's description) and the Shadow area's own
 * pools, but a nav badge needs none of that: it only needs how many rows would print. Calling the
 * full async preparer a second time from the root `_prepareContext` — once for the part, once for
 * the badge — would run every connection's HTML enrichment twice on every render. Counting
 * `wod.types.connection` items directly avoids the duplicate work; the number is identical either
 * way because `buildConnectionGroups` neither drops nor merges entries, it only groups them.
 *
 * Reuses `prepareAdvantageLists` for the four kinds every line shares (Backgrounds/Merits/
 * Flaws/Other Traits — the SAME predicates the tab renders, so the badge cannot disagree with the
 * list under it) and `ItemHelper.GetItemType` directly for the line-specific kinds
 * `prepareFeatureContext` also lists, so a splat's Boon or a wraith's Fetter is counted the same
 * way it is rendered.
 *
 * @param {Actor} actor The PC actor.
 * @returns {number} How many rows the Personaje/Features item lists would render.
 */
export const countFeatureTabItems = function (actor) {
	const lists = prepareAdvantageLists({}, actor);
	let total = lists.backgrounds.length + lists.merits.length + lists.flaws.length + lists.othertraits.length;

	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.bloodbound").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.boon").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.oath").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.passion").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.darkpassion").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.fetter").length;
	total += ItemHelper.GetItemType(actor, "Feature", "wod.types.connection").length;

	return total;
}

/**
 * The three ability columns, built from BOTH carriers an ability reaches a PC on.
 *
 * A PRIMARY ability is an `Ability` item typed `wod.abilities.talent|skill|knowledge`. A SECONDARY
 * ability is a different document entirely: a `Trait` item typed
 * `wod.types.talentsecondability|skillsecondability|knowledgesecondability`, created by
 * `AbilityHelper.CreateAbility`, by the era seeding in `create-helpers.js`, and by the legacy-actor
 * migration at `migration.js:511-582`. Reading only `Ability` (as these filters used to) meant a
 * secondary ability rendered on NO tab of a PC sheet at all - measured live: "Arte" at value 3 on
 * two PCs, three points invisible. Same silent-loss class as the compendium Features that
 * `prepareAdvantageLists` was widened for; same fix, one carrier added to the filter.
 *
 * NOT to be confused with the `shared-secondary-ability` compendium pack: that exporter emits
 * `Ability` items typed `wod.abilities.skill`, so those already rendered and are untouched here.
 *
 * `issecondary` is carried onto the context object so the sheet can keep the two visibly distinct
 * (stats_abilities.hbs) - the same flag name `ItemHelper._sortTraits` puts on the legacy sheets'
 * lists, so the two views describe an ability the same way.
 *
 * This is the ONLY place the primary/secondary union lives: both the Attributes tab
 * (prepareStatContext, visible rows only) and the Settings tab (prepareSettingsContext, every row,
 * because that tab is where a hidden one is switched back on) call it. Widening one and forgetting
 * the other would leave a secondary that can be hidden and never restored.
 */
const SECONDARY_ABILITY_TYPE = {
	"wod.abilities.talent": 	"wod.types.talentsecondability",
	"wod.abilities.skill": 		"wod.types.skillsecondability",
	"wod.abilities.knowledge": 	"wod.types.knowledgesecondability"
};

/**
 * THE TWO CARRIERS PUT THEIR FLAGS IN DIFFERENT PLACES, and this is the whole subtlety of the change.
 *
 * An `Ability` is a DataModel (`ability-item-datamodel.js:20`) that declares `schema.settings` as a
 * SchemaField, so its flags are NESTED: `system.settings.isvisible`.
 *
 * A `Trait` has no DataModel - it is built from template.json, and Foundry MERGES the keys of a
 * `templates: ["settings", ...]` entry FLAT into `system`. There is no `system.settings` object on a
 * Trait at all. Verified against a live item created through the system's own
 * `AbilityHelper.CreateAbility` on the deployed 7.5.32: `system.isvisible: true`,
 * `system.isremovable: true`, `system.settings` absent. `ItemHelper._sortTraits` reading
 * `item.system.isvisible` was right all along.
 *
 * So stats_abilities.hbs, which reads `system.settings.isvisible`, sees `undefined` on every Trait:
 * the row would draw as permanently hidden, its delete/description icons would never render, and the
 * eye toggle (which writes the path in `data-type`) would silently no-op because `OnItemSwitch` bails
 * when the property is not already a boolean. Hence `readAbilityFlag` + the normalised `settings`
 * copy below: the TEMPLATE gets one shape to read, and `visibilitypath` tells the toggle which real
 * path to WRITE on the document. Absent or unreadable means visible - defaulting to hidden is exactly
 * the invisible-points bug this change exists to end.
 *
 * @param {Item} item 			The ability item, either carrier.
 * @param {string} flag 		"isvisible" or "isremovable".
 * @param {boolean} fallback 	Value when neither carrier has it.
 * @returns {boolean}
 */
const readAbilityFlag = function (item, flag, fallback) {
	return item.system?.settings?.[flag] ?? item.system?.[flag] ?? fallback;
}

/**
 * @param {Actor} actor 		The PC actor.
 * @param {string} abilitytype 	One of the `wod.abilities.*` column types.
 * @param {boolean} onlyvisible	true for the Attributes tab, false for the Settings tab.
 * @returns {object[]} 			Primary + secondary rows, sorted by displayed name.
 */
const buildAbilityColumn = function (actor, abilitytype, onlyvisible) {
	const secondarytype = SECONDARY_ABILITY_TYPE[abilitytype];
	const items = actor?.items ?? [];

	const abilities = items
							.filter(item => item.type === "Ability"
											&& item.system.type === abilitytype
											&& (!onlyvisible || item.system.settings.isvisible))
							.map(item => ({ _id: item._id, ...item, issecondary: false, visibilitypath: "settings.isvisible" }));

	const secondaries = items
							.filter(item => item.type === "Trait"
											&& item.system.type === secondarytype
											&& (!onlyvisible || readAbilityFlag(item, "isvisible", true)))
							.map(item => {
								const row = { _id: item._id, ...item, issecondary: true, secondarytype: secondarytype };

								// The document is NEVER touched - everything below rebuilds `system` as a copy.
								row.system = {
									...row.system,
									// A secondary's name IS its label; there is no CONFIG key behind it. Traits
									// that arrived without one (drag-drop, older migrations) would draw a blank row.
									label: row.system.label || item.name,
									settings: {
										...(row.system.settings ?? {}),
										isvisible: readAbilityFlag(item, "isvisible", true),
										isremovable: readAbilityFlag(item, "isremovable", true)
									}
								};

								// Where the eye toggle must WRITE, which is not where the template READS.
								row.visibilitypath = (item.system?.settings?.isvisible !== undefined) ? "settings.isvisible" : "isvisible";

								return row;
							});

	return abilities
			.concat(secondaries)
			.sort((a, b) => game.i18n.localize(a.system.label || a.name || "").localeCompare(game.i18n.localize(b.system.label || b.name || "")));
}

/**
 * The Sphere rows and their eye-icon uuid map, for whichever part renders them.
 *
 * Extracted because TWO parts now render `power_spheres.hbs`: the Powers tab, where it has always
 * lived, and the Stats tab, where the spheres were moved to sit under the Abilities they are rolled
 * alongside. Each ApplicationV2 part gets its OWN context (`_preparePartContext`), so the partial
 * renders empty in any part that does not prepare these two keys — which is exactly what happens if
 * you move the include and forget the context.
 *
 * add-sphere-descriptions: `sphereCompendiumUuid` decides which Sphere rows get an eye at all. Keyed
 * on `system.id` - the same nine ids `CONFIG.worldofdarkness.allSpheres` enumerates, which a
 * Technocratic mage's sheet also carries (`allSpheresTechnocracy` is keyed by those same ids and
 * only swaps the LABEL, config.js:387 / dialog-edits.js:412). A Sphere Item is created by the
 * system and carries no description and no provenance flags of its own, so the eye opens a
 * read-only compendium document instead; nothing is written to the actor. Degrades to an empty
 * map - and so to no eyes at all - while the `mage-spheres` pack is absent.
 */
const addSphereContext = async function (context, actor) {
	context.spheres = actor.items.filter(item => item.type === "Sphere" && item.system.settings.isvisible);
	context.spheres = context.spheres.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));
	context.sphereCompendiumUuid = await buildTraitCompendiumUuidMap("sphere", context.spheres.map(sphere => sphere.system?.id));

	return context;
}

/**
 * `rotes` for whichever part renders them. Same reason as `addSphereContext` above, same trap: an
 * ApplicationV2 part only sees the context ITS OWN preparer built, so the Rote list moving from the
 * Powers tab to the Stats tab means the Stats preparer has to produce it. Kept as a named helper
 * rather than a second `ItemHelper.GetItemType` call so the two tabs can never diverge on what
 * counts as a Rote.
 */
const addRoteContext = function (context, actor) {
	context.rotes = ItemHelper.GetItemType(actor, "Rote");

	return context;
}

export const prepareStatContext = async function (context, actor) {
  	context.tab = context.tabs.stats;

	// Spheres render on THIS tab, under Abilities - so this tab must prepare their context too.
	// Harmless for every other splat: no Sphere items means an empty list and no rendered block,
	// and `stats.hbs` gates the include on `settings.hasspheres` anyway.
	await addSphereContext(context, actor);

	// Rotes render on THIS tab too now, in the band under Arete and Health. Same harmlessness for
	// other splats: no Rote items means an empty list and `stats_advantages.hbs` renders no block.
	addRoteContext(context, actor);

	// Owner-delegated addition to open-item-window-from-eye-icon: which attribute rows get an eye
	// icon at all (see stats_attributes.hbs). Attributes are system fields, not Items - nothing is
	// written to the actor here, only a read-only lookup of a compendium document per attribute
	// key. Degrades to an empty map (no eyes rendered) if the compendium/pack is absent.
	context.attributeCompendiumUuid = await buildTraitCompendiumUuidMap("attribute", Object.keys(actor?.system?.attributes ?? {}));

	// Primary Abilities + secondary-ability Traits, in one list per column - see buildAbilityColumn.
	// Visible rows only: this is the tab a player reads, not the tab where rows are switched on.
	context.talents 	= buildAbilityColumn(actor, "wod.abilities.talent", true);
	context.skills 		= buildAbilityColumn(actor, "wod.abilities.skill", true);
	context.knowledges 	= buildAbilityColumn(actor, "wod.abilities.knowledge", true);

	context.advantages 	= actor.items
								.filter(item => item.type === "Advantage" && item.system.group === '' && item.system.settings.isvisible)
								.map(item => ({ _id: item._id, ...item }));

	context.advantages = context.advantages.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	context.showVirtues = false;
	context.showRenowns = false;
	context.showQuintessences = false;	
	context.showParadox = false;

	if (actor.system.settings.hasvirtue) {

		context.virtues = actor.items
								.filter(item => item.type === "Advantage" && item.system.group === 'virtue' && item.system.settings.isvisible)
								.map(item => ({ _id: item._id, ...item }));
						
		context.virtues = context.virtues.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));	
		context.showVirtues = context.virtues.length > 0;	
	}
	if (actor.system.settings.hasrenown) {
		context.renowns = actor.items
								.filter(item => item.type === "Advantage" && item.system.group === 'renown' && item.system.settings.isvisible)
								.map(item => ({ _id: item._id, ...item }));
						
		context.renowns = context.renowns.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));
		context.showRenowns = context.renowns.length > 0;
	}
	if (actor.system.settings.hasquintessence) {
		context.quintessences = actor.items
								.filter(item => item.type === "Advantage" && item.system.group === 'quintessence' && item.system.settings.isvisible)
								.map(item => ({ _id: item._id, ...item }));
		context.showQuintessences = context.quintessences.length > 0;
		context.showParadox = actor.items
								.filter(item => item.type === "Advantage" && item.system.id === 'paradox' && item.system.settings.isvisible)
								//.filter(item => item.type === "Advantage" && item.system.id === 'paradox')
								.map(item => ({ _id: item._id, ...item })).length > 0;
	}

	// Find all grouped advantages beyond virtue, renown, and quintessence
	const knownGroups = ['', 'virtue', 'renown', 'quintessence'];
	const allGroupedAdvantages = actor.items
		.filter(item => 
			item.type === "Advantage" && 
			item.system.group !== '' && 
			!knownGroups.includes(item.system.group) && 
			item.system.settings.isvisible
		)
		.map(item => ({ _id: item._id, ...item }));

	// Group by system.group and sort
	const groupedMap = new Map();
	for (const advantage of allGroupedAdvantages) {
		const group = advantage.system.group;
		if (!groupedMap.has(group)) {
			groupedMap.set(group, []);
		}
		groupedMap.get(group).push(advantage);
	}

	// Sort items within each group by system.settings.order
	for (const [group, items] of groupedMap.entries()) {
		items.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));
	}

	// Convert to array and sort groups alphabetically
	context.groupedadvantages = Array.from(groupedMap.entries())
		.map(([group, items]) => ({ group, items }))
		.sort((a, b) => a.group.localeCompare(b.group));

	// Set hasGroupedAdvantages flag
	context.hasGroupedAdvantages = context.groupedadvantages.length > 0;

	// Backgrounds / Other Traits / Merits / Flaws for the classic Advantages block at the bottom of
	// this tab (stats_features.hbs). Same helper the Features tab uses - see prepareAdvantageLists.
	prepareAdvantageLists(context, actor);

	context.health = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.mortal);

	context.chimericalhealth = undefined;

	if (actor.system.settings.usechimerical) {
		context.chimericalhealth = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.changeling);
	}

	// add-wraith-pc-splat §3.3 — the Corpus track.
	//
	// THE GATE IS THE SPLAT, and `settings.hascorpus` is gone. It used to read that flag, and the flag had
	// no writer inside Foundry: `SetWraithAttributesv2` sets it only from `_preCreate`'s
	// `data.type == sheettype.wraith` branch, which never fires for a `type: "PC"` actor;
	// `DropHelper.DropSplatToActor` copies `splat`/`game`/`variant`/`variantsheet` off the splat item and
	// touches no `has*` capability flag, and the system ships no Wraith splat item to drop. Its only real
	// writer was the wodchar exporter — which computes it as `line === "wraith"` and nothing else. So the
	// flag never carried a fact the splat did not already carry; it was a CACHE of the splat that only one
	// producer ever filled, and a hand-built wraith got no Corpus because of it.
	//
	// The alternative was "write `hascorpus` at a point that genuinely means it". There is no such point:
	// Corpus is not optional equipment a wraith may or may not take, it is what a wraith is made of, so any
	// honest writer would itself have been a splat test. Asking the splat directly removes the cache
	// instead of adding a fifth writer for it. `getSplat` is the system's own resolver
	// (variantsheet -> splat -> game -> actor.type), so this covers a wodchar wraith PC, a splat-item
	// wraith and a legacy `Wraith` document alike, and — unlike the old flag — it refuses a vampire that
	// happens to arrive carrying `hascorpus: true`. Same predicate the Passion/Fetter and Arcanoi create
	// buttons use, so the sheet and the authoring routes cannot disagree about who is a wraith.
	//
	// This is NOT a second set of health levels, and the rules are explicit about why: a wraith
	// "pierde Corpus EN LUGAR DE niveles de Salud a razón de uno por uno"
	// (`wraith20-el-olvido-nsr-es · L6811`), the boxes carry no wound-level names, and a wraith takes
	// **no wound penalties at all** from Corpus damage (`:10581`, and the same principle for Risen at
	// `:14505` / Projectors at `:17325`). `calculateHealth`'s wraith branch already encodes exactly that:
	// `label: ""` on every level, `woundPenalty = 0`, an early return so the bruised/hurt/injured ladder
	// is never touched, and a track as long as PERMANENT Corpus (`:10543`).
	//
	// What the three damage types are for is which STATE the full track puts the wraith in, not a
	// penalty: all bashing -> Vacilante (`:10577`), lethal -> Atormentado and an immediate Harrowing
	// (`:10583`). They also set the healing rate — 1 Pathos buys back 2 bashing or 1 lethal, max one
	// Pathos per turn (`:10635`).
	context.corpushealth = undefined;

	if (getSplat(actor) === CONFIG.worldofdarkness.splat.wraith) {
		context.corpushealth = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.wraith);
	}

  	return context
}

export const preparePowersContext = async function (context, actor) {
  	context.tab = context.tabs.powers;

	const splat = getSplat(actor);

	const lacksParent = (item, parents) => {
		const parentId = item.system.parentid;
		if (!parentId) return true;
		return !parents.some(parent => parent._id === parentId || parent.id === parentId);
	};

	// Core power categories
	context.disciplines = ItemHelper.GetPowersByType(actor, "wod.types.discipline", true);
	context.arts = ItemHelper.GetPowersByType(actor, "wod.types.art", true);
	context.lores = ItemHelper.GetPowersByType(actor, "wod.types.lore", true);
	context.edges = ItemHelper.GetPowersByType(actor, "wod.types.edge", true);
	
	context.charms = ItemHelper.GetPowersByType(actor, "wod.types.charm", true);

	context.combinations = ItemHelper.GetPowersByType(actor, "wod.types.combination", true);
	context.rituals = ItemHelper.GetPowersByType(actor, "wod.types.ritual", true);
	context.rites = ItemHelper.GetPowersByType(actor, "wod.types.rite", true);
	
	// Still prepared here even though the Rote LIST moved to the Stats tab: the Settings tab's
	// power-ordering machinery and BuildPowerSections both read `context.rotes`, and the section it
	// builds is simply no longer rendered (see powertab.js).
	addRoteContext(context, actor);
	context.resonances = actor.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.resonance");
	context.numinas = ItemHelper.GetPowersByType(actor, "wod.types.numina", true);

	// add-wraith-pc-splat §3.4 — Arcanoi, the wraith power axis, as a container/power pair exactly like
	// Disciplines and Arts above. Everything around this was already built: `wodsetup.js` collects
	// `wod.types.arcanoi` containers into `powers.arcanoi` (from world items AND compendiums, so the
	// shipped `wraith-arcanois` pack is already visible), `action-helpers.js:294` rolls a
	// `wod.types.arcanoipower` through `PowerDialog.ArcanoiPower`, and `:380` sorts one through
	// `SortDialog.SortArcanoiPower`. The only thing missing was the sheet asking for them.
	context.arcanoi = ItemHelper.GetPowersByType(actor, "wod.types.arcanoi", true);

	// Unsorted powers (no parent or missing parent reference)
	const disciplinePowers = ItemHelper.GetPowersByType(actor, "wod.types.disciplinepower");
	const artPowers = ItemHelper.GetPowersByType(actor, "wod.types.artpower");
	const lorePowers = ItemHelper.GetPowersByType(actor, "wod.types.lorepower");
	const edgePowers = ItemHelper.GetPowersByType(actor, "wod.types.edgepower");
	const numinaPowers = ItemHelper.GetPowersByType(actor, "wod.types.numinapower");
	const arcanoiPowers = ItemHelper.GetPowersByType(actor, "wod.types.arcanoipower");

	context.unsorteddisciplines = disciplinePowers.filter(power => lacksParent(power, context.disciplines));
	context.unsortedarts = artPowers.filter(power => lacksParent(power, context.arts));
	context.unsortedlores = lorePowers.filter(power => lacksParent(power, context.lores));
	context.unsortededges = edgePowers.filter(power => lacksParent(power, context.edges));
	
	context.unsortednuminas = numinaPowers.filter(power => lacksParent(power, context.numinas));

	// §3.5 — surfaced with the existing `wod.power.unsortedarcanois` string, which has shipped in all
	// seven language files all along and had no code to display it.
	context.unsortedarcanois = arcanoiPowers.filter(power => lacksParent(power, context.arcanoi));

	// Gifts grouped by rank
	const giftItems = ItemHelper.GetPowersByType(actor, "wod.types.gift");
	const { giftsByRank, flatGifts } = ItemHelper.GroupGiftsByRank(giftItems);
	context.giftsByRank = giftsByRank;
	context.gifts = flatGifts;

	// Shapes remain Traits but follow the same ordering logic
	const allShapes = actor?.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.shapeform" && item.system.isvisible);
	context.shapes = allShapes.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	const allApocalypticForms = actor?.items.filter(item =>
    item.type === "Trait" && item.system.type === "wod.types.apocalypticform");
	context.apocalypticforms = allApocalypticForms.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	const allPowerTraits = actor?.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.othertraits" && item.system.placement === "power");
	context.powertraits = allPowerTraits.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	// Spheres
	await addSphereContext(context, actor);

	// Realms
	context.realms = actor.items.filter(item => item.type === "Realm" && item.system.settings.isvisible);
	context.realms = context.realms.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	context.powerSections = ItemHelper.BuildPowerSections(actor, context, splat, CONFIG.worldofdarkness.sheetv2.power || {});
	context.splat = splat;

	// add-pc-sheet-v3 — two keys the v3 Powers shell needs and the v2 template ignores.
	//
	// `powertype` is the axis name `getPowertype` already derives to pick this tab's ICON
	// (`getTabs`, :260). Exposing it lets the empty state look up `wod.power.empty.<powertype>`
	// instead of branching on the splat in the template — one key per axis, in the language files,
	// where a per-line table belongs. Ten values are possible; `power-section-check.py` parses them
	// out of `getPowertype` itself and asserts each has a key, because a derived key that is missing
	// renders as the raw string and no literal-key gate can see it.
	//
	// `haspowercontent` is the EXACT disjunction of the five gates the template renders on, and it
	// is computed here rather than in the template for one reason: "does any section have a true
	// condition" cannot be expressed in Handlebars. Writing the flags out by hand in the shell would
	// drift from the ladder silently the first time a section is added — the empty state would print
	// UNDER a section that rendered. Reading it off `powerSections` cannot.
	context.powertype = getPowertype(actor);
	context.haspowercontent =
		!!actor.system.settings.hasshapes ||
		!!actor.system.settings.hasrealms ||
		context.powerSections.some(section => !!section?.condition) ||
		!!actor.system.settings.hasapocalypticforms ||
		(context.powertraits.length > 0);

  	return context;
}

export const prepareCombatContext = async function (context, actor) {
  	context.tab = context.tabs.combat;

	context.weapon_natural 	= actor.items.filter(item => item.type === "Melee Weapon" && item.system.isnatural === true);
	context.weapon_melee 	= actor.items.filter(item => item.type === "Melee Weapon" && item.system.isnatural === false);
	context.weapon_ranged 	= actor.items.filter(item => item.type === "Ranged Weapon");
	context.armor 			= actor.items.filter(item => item.type === "Armor");

	context.powercombat		= actor.items.filter(item => item.type === "Power" && item.system.type === "wod.types.gift" && item.system.isactive);

	context.maneuvers		= actor.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.maneuver");

	context.health = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.mortal);

	// `stats_health.hbs` is included by BOTH `stats_advantages.hbs` and `combat.hbs`, and it reads
	// three tracks: `health`, `chimericalhealth` and `corpushealth`. Only `prepareStatContext` built
	// the last two, so on the COMBAT tab a changeling's chimerical damage marks came out blank and a
	// wraith's Corpus track did not draw at all — while both were correct one tab away, which is
	// exactly why nobody reported it. Found by test-part-render.mjs. Same gates as the Stats tab:
	// `usechimerical` for the chimerical track, and the SPLAT for Corpus (`hascorpus` was deleted by
	// add-wraith-pc-splat because no writer could be trusted to set it).
	context.chimericalhealth = undefined;

	if (actor.system.settings.usechimerical) {
		context.chimericalhealth = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.changeling);
	}

	context.corpushealth = undefined;

	if (getSplat(actor) === CONFIG.worldofdarkness.splat.wraith) {
		context.corpushealth = await calculateHealth(actor, CONFIG.worldofdarkness.sheettype.wraith);
	}

  	return context;
}

export const prepareGearContext = async function (context, actor) {
  	context.tab = context.tabs.gear;

	context.gear = actor.system.gear.notes;
	context.enrichedGear = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.gear.notes, {async: true});

  	return context;
}

const CONNECTION_PLACEHOLDER_IMG = "icons/svg/mystery-man.svg";

/**
 * add-contacts-allies-roster D8 — the entry's portrait, resolved in three steps, copied from the shapeform
 * token idiom at `module/items/template/item-sheet.js:165-171`:
 *
 *   1. the entry's own `system.portrait` — a data-directory path from the FilePicker OR an absolute URL,
 *      both of which Foundry's `img`-style strings accept;
 *   2. else, when the entry LINKS to an actor with `@UUID[Actor.xxx]`, that actor's own portrait;
 *   3. else the placeholder.
 *
 * Step 2 is the whole point and the easiest thing to leave quietly missing: there are 87 files in
 * `wod20-portraits/` on the server, one per cast member, so most contacts a GM adds are already actors
 * WITH art — and linking one should show the face with no second step.
 *
 * The UUID is read out of `description` and `details` because those are the two fields
 * `item-sheet.js:151,154` already run `enrichHTML` over, i.e. the two places a working link can be typed.
 * Only the world's own Actors are resolved: `fromUuidSync` is used, so no async and no compendium fetch.
 */
function resolveConnectionPortrait(entry) {
	const own = (entry.system?.portrait ?? "").trim();
	if (own !== "") return own;

	const text = `${entry.system?.description ?? ""} ${entry.system?.details ?? ""}`;
	const match = text.match(/@UUID\[(Actor\.[A-Za-z0-9]+)\]/);
	if (match) {
		try {
			const linked = fromUuidSync(match[1]);
			const img = linked?.img ?? "";
			if (img !== "" && img !== CONNECTION_PLACEHOLDER_IMG) return img;
		}
		catch (err) {
			// A dangling @UUID is a GM typo, not a sheet failure — fall through to the placeholder.
			console.warn(`WoD | connection portrait: could not resolve ${match[1]}`, err);
		}
	}

	return CONNECTION_PLACEHOLDER_IMG;
}

/**
 * add-contacts-allies-roster — the entry's RELATIONSHIP DESCRIPTION, enriched for the roster row.
 *
 * The requirement is that an entry appears "with its name and relationship description visible" — in the
 * row, not one window away. `feature_item.hbs` emits no description (the inline panel was removed by
 * `open-item-window-from-eye-icon`), so the row has to be given one here.
 *
 * This uses the path the codebase ALREADY uses for Feature text everywhere else — `resolveDescription`
 * then `enrichHTML` — rather than a second, divergent one. It is the same two lines as
 * `item-viewer.js:119-122` (the eye), `mortal-actor-sheet.js:1286` (`_onSendChat`) and
 * `action-helpers.js:2011` (`SendChat`). Two consequences that matter here:
 *
 *   - `resolveDescription` degrades to `null` on every failure mode, and a GM-typed connection entry has
 *     no compendium provenance at all, so in practice this is the entry's own stored text — the fallback
 *     IS the normal case, and it is silent (no provenance -> no warning).
 *   - `enrichHTML` is what makes an INTERNAL link work: `@UUID[Actor.xxx]{Name}` typed into the
 *     description becomes a clickable anchor in the row itself, which is the same enricher
 *     `item-sheet.js:159` runs on the item's own sheet. So the roster row and the item sheet render the
 *     same reference the same way, and no enricher was invented for either.
 *
 * @param {foundry.abstract.Document} entry - a `wod.types.connection` Feature
 * @returns {Promise<string>} enriched HTML, or "" when there is no text
 */
async function resolveConnectionDescription(entry) {
	const raw = (await resolveDescription(entry)) ?? entry?.system?.description ?? "";
	if (!raw) return "";
	return await foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, { async: true });
}

/**
 * add-contacts-allies-roster — groups `wod.types.connection` Features by `system.relation` and resolves
 * each group's heading from the actor's OWN Background item.
 *
 * Returns `[{ relation, label, rating, count, entries[] }]`, sorted by label so the blocks are stable.
 *
 * `label`/`rating` come from the Background Feature whose `flags["wod20-char"].id` matches the relation —
 * so the name is whatever the compendium already localized it to, and the dots are the real ones. This is
 * what lets the sheet show "Contactos ●●● (4)" and thereby DISPLAY the tension between dots and headcount
 * without enforcing equality, which the books do not require (design D1/D4).
 *
 * Async because each entry's description is enriched (see `resolveConnectionDescription`).
 */
async function buildConnectionGroups(actor) {
	const entries = (actor?.items ?? []).filter(
		(item) => item.type === "Feature" && item.system?.type === "wod.types.connection" && item.system?.isvisible !== false,
	);
	if (entries.length === 0) return [];

	const backgrounds = (actor?.items ?? []).filter(
		(item) => item.type === "Feature" && item.system?.type === "wod.types.background",
	);
	const backgroundFor = (relation) =>
		backgrounds.find((b) => b.flags?.["wod20-char"]?.id === relation)
		?? backgrounds.find((b) => (b.name ?? "").toLowerCase() === String(relation).toLowerCase());

	const grouped = new Map();
	for (const entry of entries) {
		const relation = entry.system.relation || "";
		if (!grouped.has(relation)) {
			const background = backgroundFor(relation);
			grouped.set(relation, {
				relation,
				label: background?.name ?? (relation === "" ? game.i18n.localize("wod.types.connection") : relation),
				rating: background ? Number(background.system?.value ?? 0) : null,
				entries: [],
			});
		}
		grouped.get(relation).entries.push(entry);
	}

	for (const group of grouped.values()) {
		group.entries.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
		group.count = group.entries.length;
		for (const entry of group.entries) {
			entry.portraitSrc = resolveConnectionPortrait(entry);
			entry.hasPortrait = entry.portraitSrc !== CONNECTION_PLACEHOLDER_IMG;
			entry.enrichedDescription = await resolveConnectionDescription(entry);
			entry.hasDescription = entry.enrichedDescription.trim().length > 0;
		}
	}

	return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export const prepareFeatureContext = async function (context, actor) {
  	context.tab = context.tabs.feature;

	// add-pc-sheet-v3 §8.1/§8.2 — the bio fields, so the v3 Features/"Personaje" template can
	// render the identity section that used to be the standalone Bio tab's. `prepareFeatureContext`
	// is shared between v2 (whose `parts/feature.hbs` never reads these keys) and v3 (whose
	// `v3/feature.hbs` does), so this is additive for v2: harmless extra keys nothing there
	// consumes. `addBioContext` deliberately does not set `context.tab` — this function already
	// set it to `tabs.feature` above, and that is the tab the merged Personaje view highlights.
	await addBioContext(context, actor);

	// add-prism-of-focus-foundry — task groups 1-3/11: the structured Preceptos+Prácticas section,
	// alongside the free-text Focus items `addBioContext` just built. See `preparePrismContext`'s
	// own header for why this lives here rather than in a dedicated part.
	preparePrismContext(context, actor);

	// backgrounds / merits / flaws / othertraits - shared with the Attributes tab's Advantages
	// block, so the two views can never disagree. See prepareAdvantageLists.
	prepareAdvantageLists(context, actor);

	context.bloodbounds = ItemHelper.GetItemType(actor, "Feature", "wod.types.bloodbound");
	context.boons 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.boon");
	context.oaths 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.oath");

	// add-wraith-pc-splat §3.6/§3.7 — Passions, Dark Passions and Fetters, the wraith's three rated
	// Feature kinds. They sit here beside the other line-specific Feature lists (bloodbound is vampire's,
	// oath is changeling's) rather than in `prepareAdvantageLists`, which carries only the four kinds every
	// line shares.
	//
	// THE PREDICATE IS THE POINT, and it ships in the same commit as the sub-kind. `PCActorSheet` builds
	// its Feature lists from a CLOSED set of these calls, so a Feature whose `system.type` matches none of
	// them renders in NO section at all — it is on the actor, it is in the database, and the sheet simply
	// never asks for it. That was measured for `wod.types.specialadvantage`, which has a label in all seven
	// language files, appears in zero predicates, and silently hid seven of Carl el Cuervo's eight extra
	// traits. An i18n key proves nothing renders.
	//
	// Dark Passions are a DISTINCT sub-kind rather than a flag on Passion, so that no sheet, roll or future
	// total can ever add a Passion and a Dark Passion together: the first belongs to the wraith, the second
	// to the Shadow.
	// add-contacts-allies-roster — the relationship roster. ONE sub-kind, `wod.types.connection`, grouped
	// by `system.relation` (the Background's entity id: contacts, mentor, totem, …) rather than one
	// sub-kind per Background. See design D2a: the real list is EIGHTEEN people-shaped Backgrounds, and a
	// sub-kind each would have cost ~500 i18n keys across seven language files for one concept. Grouping
	// on a field is the pattern `prepareAdvantageLists` already uses for `Advantage.system.group`.
	//
	// The heading needs no new keys either: an exported Background Feature carries
	// `flags["wod20-char"].id` = its entity id, so an entry with `relation: "contacts"` finds the actor's
	// own Contactos item and takes its ALREADY-LOCALIZED name and its dots straight off it — which is
	// also exactly what task 3.6 asks the heading to show. No Background on the actor -> the raw relation.
	//
	// Each entry also carries `enrichedDescription`, so the RELATIONSHIP TEXT renders in the row rather
	// than only behind the eye (task 3.3). It goes through `resolveDescription` + `enrichHTML`, the same
	// path `item-viewer.js` and `SendChat` use — which is also what makes an `@UUID[Actor.xxx]` reference
	// clickable in the row itself.
	context.connections = await buildConnectionGroups(actor);
	context.hasConnections = context.connections.length > 0;

	context.passions 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.passion");
	context.darkpassions 	= ItemHelper.GetItemType(actor, "Feature", "wod.types.darkpassion");
	context.fetters 		= ItemHelper.GetItemType(actor, "Feature", "wod.types.fetter");

	prepareShadowAreaContext(context, actor);

  	return context;
}

/**
 * add-wraith-shadow-budget §2/§4 — the Shadow's own area.
 *
 * WHAT THIS IS FOR. A wraith's creation budget is 25 points, not 15: the Shadow is Step Six of
 * every wraith's creation (`wraith20 · L4799`) and its 10 freebie points are ADDITIONAL to the
 * character's own 15 (`wraith.json` -> `shadow.freebies.additionalToCharacterTotal: true`). Before
 * this, the Shadow's four pieces were scattered — Archetype a free-text line on the Bio tab, Angst
 * a pool block one tab away, Dark Passions rendered immediately beside the character's own
 * Passions, Thorns a text box — so the sheet showed a 25-point character as a 15-point one and
 * offered the Shadow's pool as if it belonged to the Psyche.
 *
 * WHICH TAB HOSTS IT (design D1's first open question). The Features tab. Two of the four pieces
 * are `Feature` items and this is the tab that owns Feature items and carries their create button;
 * the Attributes tab's advantages column is a 33%-wide stack of pool boxes with no room for a
 * four-part area. Angst is MIRRORED here rather than moved: it keeps its `system.group: "shadow"`
 * block on the Attributes tab, exactly as Backgrounds, Merits and Flaws already render on both
 * tabs from one shared list (see `prepareAdvantageLists`). `_onRender` runs
 * `SetupDotCounters_v2` over the whole sheet element, so the mirrored pool is fully interactive
 * here — the requirement's "editable value" holds in the Shadow area itself, not only one tab away.
 *
 * WHEN IT RENDERS. For a wraith, always — including empty, which is the NORMAL state of a freshly
 * imported one and so is the first case to get right, not the last. For any other line it renders
 * only if that actor somehow holds Shadow content, and that condition is not defensive
 * bookkeeping: `prepareAdvantageLists` drops Thorns from Other Traits on a wraith, and Dark
 * Passions no longer render beside Passions on any line, so an unconditional wraith-only gate
 * would make a Dark Passion on a mis-splatted actor vanish. Visible in an unexpected place beats
 * silently gone.
 *
 * WHAT IT DOES NOT DO (design D4/D5). It does not tally spend, and it does not enforce either
 * bound. The Dark-Passion ceiling is DISPLAYED because `wod20-char`'s `validate()` evaluates no
 * cross-pool constraint, so a sheet that refused the excess could make a generator-built character
 * un-openable; permanent Angst is an editable value with its floor STATED because the rule is a
 * Storyteller's Willpower roll at difficulty 6 and a sheet that computed it would be inventing a
 * result.
 *
 * @param {object} context
 * @param {Actor} actor
 * @returns {object} the same context
 */
export const prepareShadowAreaContext = function (context, actor) {
	const isWraith = getSplat(actor) === CONFIG.worldofdarkness.splat.wraith;

	context.thorns = (actor?.items ?? [])
							.filter(item => isThornFeature(item))
							.sort((a, b) => a.name.localeCompare(b.name));

	// The Shadow's own pools: the Advantage items already filed under `system.group: "shadow"` by
	// add-wraith-pc-splat §3.2. Read by group, not by id, so a Shadow pool added later joins the
	// area as data with no code change - the same generic contract `stats_groupedadvantages.hbs`
	// makes on the Attributes tab.
	context.shadowadvantages = (actor?.items ?? [])
							.filter(item => (item.type === "Advantage")
											&& (item.system?.group === "shadow")
											&& (item.system?.settings?.isvisible))
							.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	// Archetype is a Bio-tab field; the area SHOWS it so the Shadow reads as one thing, and does
	// not duplicate its editor. An unresolved legacy string prints as itself - see
	// `select/wraith.js` for why that is a property of the list rather than an accident.
	const splatfields = actor?.system?.bio?.splatfields ?? {};
	context.shadowarchetype = (splatfields.archetype?.value ?? "").toString().trim();

	// The pre-change free-text Thorns summary. Surfaced, not migrated and not dropped: it is what
	// every wraith authored before this change holds, and the spec's own words are that a string
	// resolving to no catalog entity "SHALL remain readable to a GM rather than being silently
	// dropped".
	context.legacythorns = (splatfields.thorns?.value ?? "").toString().trim();

	// The cross-pool bound, DISPLAYED. Both totals use `featureRating`, so they can never disagree
	// with the numbers printed on the rows.
	context.passiontotal = (context.passions ?? []).reduce((sum, item) => sum + featureRating(item), 0);
	context.darkpassiontotal = (context.darkpassions ?? []).reduce((sum, item) => sum + featureRating(item), 0);
	context.darkpassionsexceeded = context.darkpassiontotal > context.passiontotal;

	// `wraith.json` -> `shadow.freebies.total`. Named, never tallied (D5).
	context.shadowfreebies = 10;

	context.isshadowsplat = isWraith;
	context.hasshadowarea = isWraith
							|| (context.thorns.length > 0)
							|| ((context.darkpassions ?? []).length > 0)
							|| (context.shadowadvantages.length > 0);

	return context;
}

export const prepareEffectContext = async function (context, actor) {
  	context.tab = context.tabs.effects;

	let bonuslist = [];
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attribute_diff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attribute_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attribute_dice_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attribute_auto_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attribute_fixed_value");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "ability_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "ability_diff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "soak_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "soak_diff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "health_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attack_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "attack_diff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "frenzy_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "frenzy_diff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "initiative_buff");
	bonuslist = BonusHelper.GetAllAttributeBonus(actor, bonuslist, "movement_buff");

	// Sort by origin (empty strings first, then alphabetically)
	bonuslist.sort((a, b) => {
		const originA = a.origin || "";
		const originB = b.origin || "";
		return originA.localeCompare(originB);
	});

	context.effects = bonuslist;

  	return context;
}

export const prepareSettingsContext = async function (context, actor) {
  	context.tab = context.tabs.settings;

	// Bio
	context.splatfields = actor.system.bio.splatfields;
	context.hassplatfields = Object.keys(actor.system.bio.splatfields).length > 0;


	// Abilities - every row, hidden ones included: this tab is where the eye toggle lives, so a
	// secondary ability that is switched off has to stay listed here to be switched back on.
	context.talents 	= buildAbilityColumn(actor, "wod.abilities.talent", false);
	context.skills 		= buildAbilityColumn(actor, "wod.abilities.skill", false);
	context.knowledges 	= buildAbilityColumn(actor, "wod.abilities.knowledge", false);

	// Advantages
	context.advantages 	= actor.items
								.filter(item => item.type === "Advantage" && item.system.group === '')
								.map(item => ({ _id: item._id, ...item }));

	context.advantages = context.advantages.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	// Shapes remain Traits but follow the same ordering logic
	const allShapes = actor?.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.shapeform");
	context.shapes = allShapes.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	const allApocalypticForms = actor?.items.filter(item =>
    item.type === "Trait" && item.system.type === "wod.types.apocalypticform");
	context.apocalypticforms = allApocalypticForms.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	const allPowerTraits = actor?.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.othertraits" && item.system.placement === "power");
	context.powertraits = allPowerTraits.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	const allFeatureTraits = actor?.items.filter(item => item.type === "Trait" && item.system.type === "wod.types.othertraits" && item.system.placement === "feature");
	context.featuretraits = allFeatureTraits.sort((a, b) => {
		const orderA = a.system.order !== undefined ? Number(a.system.order) : 999;
		const orderB = b.system.order !== undefined ? Number(b.system.order) : 999;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});

	// Grouped Advantages (including virtues, renown, quintessence, and other groups like "yinchi")
	// Find all grouped advantages - include all groups except empty string
	// Don't filter by isvisible here - we want to show all grouped advantages in settings so user can manage them
	const knownGroups = ['', 'virtue', 'renown', 'quintessence'];
	const allGroupedAdvantages = actor.items
		.filter(item => 
			item.type === "Advantage" && 
			item.system.group !== '' && 
			!knownGroups.includes(item.system.group)
		)
		.map(item => ({ _id: item._id, ...item }));
	
	// Also include virtues, renown, and quintessence if they exist (these are excluded from the filter above)
	if (actor.system.settings.hasvirtue) {
		const virtues = actor.items
			.filter(item => item.type === "Advantage" && item.system.group === 'virtue')
			.map(item => ({ _id: item._id, ...item }));
		allGroupedAdvantages.push(...virtues);
	}
	if (actor.system.settings.hasrenown) {
		const renowns = actor.items
			.filter(item => item.type === "Advantage" && item.system.group === 'renown')
			.map(item => ({ _id: item._id, ...item }));
		allGroupedAdvantages.push(...renowns);
	}
	if (actor.system.settings.hasquintessence) {
		const quintessences = actor.items
			.filter(item => item.type === "Advantage" && item.system.group === 'quintessence')
			.map(item => ({ _id: item._id, ...item }));
		allGroupedAdvantages.push(...quintessences);
	}

	// Group by system.group and sort
	const groupedMap = new Map();
	for (const advantage of allGroupedAdvantages) {
		const group = advantage.system.group;
		if (!groupedMap.has(group)) {
			groupedMap.set(group, []);
		}
		groupedMap.get(group).push(advantage);
	}

	// Sort items within each group by system.settings.order
	for (const [group, items] of groupedMap.entries()) {
		items.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));
	}

	// Convert to array and sort groups alphabetically
	context.groupedadvantages = Array.from(groupedMap.entries())
		.map(([group, items]) => ({ group, items }))
		.sort((a, b) => a.group.localeCompare(b.group));

	// Set hasGroupedAdvantages flag
	context.hasGroupedAdvantages = context.groupedadvantages.length > 0;

	// Spheres
	context.spheres = actor.items.filter(item => item.type === "Sphere");
	context.spheres = context.spheres.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	// Realms
	context.realms = actor.items.filter(item => item.type === "Realm");
	context.realms = context.realms.sort((a, b) => Number(a.system.settings.order) - Number(b.system.settings.order));

	// Get listData for bio select fields - same pattern as legacy templates (bio_mage_background.html)
	// Pass actor directly to SetupItem so functions that need actor data (custom handling) work correctly
	const splat = getSplat(actor);
	const actorData = { type: CONFIG.worldofdarkness.sheettype[splat] || splat, system: actor.system };
	context.listData = SelectHelper.SetupItem(actorData, true);

	return context;
}
