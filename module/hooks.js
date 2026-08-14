/**
 * System hooks for World of Darkness
 * All hooks are registered here to keep wod.js cleaner
 */

import { maybeEnrichAbilityOnRename } from "./scripts/ability-enrichment.js";
import { PrismZoneDialog } from "./dialogs/dialog-prism-zone.js";
import { PrismCorruptedCard, FLAG_SCOPE as PRISM_CARD_FLAG_SCOPE, FLAG_KEY as PRISM_CARD_FLAG_KEY } from "./scripts/prism-corrupted-card.js";

/**
 * Is the user in the dark theme?
 *
 * add-pc-sheet-v3 task 10.1. This replaces SEVEN byte-identical copies of
 * `game.settings.get('core','uiConfig').colorScheme.applications === "dark"`, one per hook, which
 * were wrong in a way no amount of copying could fix.
 *
 * `colorScheme.applications` has THREE values, not two: `"dark"`, `"light"`, and `""` — the default,
 * meaning "follow the operating system". `"" === "dark"` is `false`, so every user who had never
 * touched the setting was declared light-themed, and an OS-dark user got Foundry's own chrome dark
 * with a light WoD sheet inside it.
 *
 * FOUNDRY ALREADY RESOLVES THIS, so the fix is to stop re-deriving it. Foundry reconciles the
 * setting with the OS and publishes the answer as a `theme-dark` / `theme-light` class —
 * `css/chat.css:156-166` has depended on that class all along, while the JS beside it re-computed
 * the answer from the raw setting and got a different one.
 *
 * WHICH ELEMENT'S CLASS, THOUGH — that is the correction in 7.5.65 and it is the whole point.
 * Foundry has TWO independent colour schemes, `applications` (windows and sheets) and `interface`
 * (sidebar and HUD), and stamps each onto the elements of ITS OWN region. The first version of this
 * function read `document.documentElement` and `document.body`, so it could pick up the INTERFACE
 * theme and impose it on a sheet — a user who set applications=light while interface stayed dark
 * would get a dark sheet and nothing they changed would appear to do anything. That is the symptom
 * that was reported, and it is why this now asks the SHEET'S OWN element (`closest()`), which is
 * unambiguous and honours a per-window override for free.
 *
 * The raw setting is only a fallback for when no resolved class is present yet (an early hook, a
 * detached element), and there `""` is resolved against the OS rather than assumed light.
 *
 * NOTE ON `colorScheme.interface`: still deliberately NOT read as a setting. A sheet IS an
 * application, so `applications` is the right input; the fix above is about reading the right
 * ELEMENT, not about switching settings. An earlier draft of the spec called ignoring `interface` a
 * bug; that is retracted and stays retracted.
 */
export function isDarkTheme(subject) {
	/*
	 * ASK THE WINDOW, NOT THE DOCUMENT. Foundry has TWO independent colour schemes — `applications`
	 * (windows and sheets) and `interface` (sidebar, HUD) — and it resolves each into a
	 * `theme-light`/`theme-dark` class on the elements of that region. `css/chat.css:156-166` keys
	 * off `.theme-dark #chat`, i.e. the INTERFACE one, on an ancestor that is not a sheet.
	 *
	 * The first version of this function read `document.documentElement` and `document.body`, which
	 * is precisely the ambiguity: whichever scheme Foundry happens to stamp on the document wins,
	 * and a user who sets applications=light while interface stays dark gets a dark SHEET with no
	 * way to connect it to anything they changed. Reading the class off the sheet's OWN element
	 * cannot make that mistake, and it also honours any per-window override for free.
	 */
	const el = subject?.element?.[0] ?? subject?.element ?? subject;
	const node = el?.nodeType === 1 ? el : null;
	const scoped = node?.closest?.(".theme-dark, .theme-light");

	if (scoped) return scoped.classList.contains("theme-dark");

	/*
	 * No resolved class yet (an early hook, or a detached element). Fall back to the raw setting —
	 * but note `applications` has THREE values, not two: "dark", "light", and "" meaning FOLLOW THE
	 * OS. The seven copies this function replaced all compared `=== "dark"`, so `""` — the default
	 * nobody has touched — was silently treated as light, and an OS-dark user got Foundry's chrome
	 * dark around a light sheet.
	 */
	const scheme = game.settings?.get?.("core", "uiConfig")?.colorScheme?.applications ?? "";

	if (scheme === "dark") return true;
	if (scheme === "light") return false;

	return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

// Resolve classList for AppV1 (element[0]) and AppV2 (sheet.classList / element) sheets
function getSheetClassList(sheet) {
	if (sheet.classList) return sheet.classList;
	const el = sheet.element?.[0] ?? sheet.element;
	return el?.classList;
}

// Helper function to clear language and theme classes
function clearHTML(sheet) {
	const classList = getSheetClassList(sheet);
	if (!classList) return;

	classList.remove("langDE");
	classList.remove("langES");
	classList.remove("langIT");
	classList.remove("langFR");
	classList.remove("langPT");
	classList.remove("langSV");
	classList.remove("langEN");
	classList.remove("noSplatFont");
	classList.remove("wod-theme-dark");

	classList.remove("mortal");
	classList.remove("mage");
	classList.remove("vampire");
	classList.remove("werewolf");
	classList.remove("changeling");
	classList.remove("demon");
	classList.remove("hunter");
	classList.remove("wraith");
}

// Helper function to construct option groups for select elements
export function constructOptGroup(select, groupLabel, optValues) {
	const options = select.querySelectorAll(":scope > option");
	const optgroup = document.createElement("optgroup");
	optgroup.label = groupLabel;
	optgroup.append(...Array.from(options).filter((option) => !optValues || optValues.includes(option.value)));
	if (optgroup.children.length == 0) {
		return "";
	}
	return optgroup;
}

/**
 * Register all system hooks
 * @param {Object} constants - Constants needed by hooks (SheetTypes, AdversaryTypes, etc.)
 * @param {boolean} isTablet - Whether the viewport is a tablet
 */
export function registerHooks(constants, isTablet) {
	const { SheetTypes, AdversaryTypes, PowerCreationItemTypes, CharacterCreationItemTypes, EquipmentItemTypes } = constants;

	/**
	 * Hook: createItem
	 * Triggered when an item is created in the world.
	 * Displays a notification to the receiving player when an item is shared via copyFile flag.
	 */
	Hooks.on('createItem', async (item, options, userId) => {
		if (item.flags?.copyFile !== undefined) {
			if (item.flags?.copyFile?.receivedPlayer !== game.user.id) {
				const text = game.i18n.localize("wod.info.droprecieved");
				text = text.replace("{1}", item.name);
				text = text.replace("{2}", item.flags?.copyFile?.receivedName);

				ui.notifications.info(text);
			}
		}
	});

	/**
	 * Hook: updateItem
	 * add-ability-descriptions-from-compendium: a blank "New Talent/Skill/Knowledge" Ability
	 * (create-helpers.js) has nothing to match at creation time - only once the player types its
	 * canonical id or name (which auto-submits per field) can a compendium description be found.
	 * Never blocks or fails the actual update: any enrichment failure is caught and logged here so
	 * a compendium hiccup can never surface as a broken ability edit.
	 */
	Hooks.on("updateItem", async (item, changes, options, userId) => {
		try {
			await maybeEnrichAbilityOnRename(item, changes);
		} catch (err) {
			console.error(`WoD | Ability enrichment on rename failed for "${item?.name}":`, err);
		}
	});

	/**
	 * Hook: renderActorSheetV2
	 * Triggered when an ActorSheetV2 (PC actors using ApplicationV2) is rendered.
	 * Applies language classes, splat-specific classes (mortal, vampire, werewolf, mage),
	 * font settings, and dark mode theme class.
	 */
	Hooks.on("renderActorSheetV2", (sheet) => { 
		CONFIG.worldofdarkness.darkmode = isDarkTheme(sheet);

		clearHTML(sheet);

		const splat = (sheet.splat || sheet.actor?.system?.settings?.splat || "").toLowerCase();

		// adding the means to control the CSS by what language is used.
		if (CONFIG.language == "de") {
			sheet.classList.add("langDE");
		}
		else if (CONFIG.language == "es") {
			sheet.classList.add("langES");
		}
		else if (CONFIG.language == "it") {
			sheet.classList.add("langIT");
		}
		else if (CONFIG.language == "fr") {
			sheet.classList.add("langFR");
		}
		else if (CONFIG.language == "pt-BR") {
			sheet.classList.add("langPT");
		}
		else {
			sheet.classList.add("langEN");
		}

		if (splat == "mortal") {
			sheet.classList.add("mortal");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}
		if (splat == "vampire") {
			sheet.classList.add("vampire");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}
		if ((splat == "werewolf") || (splat == "changingbreed")) {
			sheet.classList.add("werewolf");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}
		if (splat == "mage") {
			sheet.classList.add("mage");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		} 

		if (splat == "changeling") {
			sheet.classList.add("changeling");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}

		if (splat == "demon") {
			sheet.classList.add("demon");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}
		
		if (splat == "hunter") {
			sheet.classList.add("hunter");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}


		if (splat == "wraith") {
			sheet.classList.add("wraith");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				sheet.classList.remove(variant);
			}
		}

		if (!sheet.actor.system.settings.usesplatfont) {
			sheet.classList.add("noSplatFont");
		}

		if (CONFIG.worldofdarkness.darkmode) {
			sheet.classList.add("wod-theme-dark");
		}	
	});

	/**
	 * Hook: renderActorSheet
	 * Triggered when a legacy ActorSheet (non-PC actors using appv1 API) is rendered.
	 * Applies language classes, actor type classes (mortal, creature with variants),
	 * font settings, and dark mode theme class.
	 * Also handles tablet viewport detection.
	 */
	Hooks.on("renderActorSheet", (sheet) => { 
		CONFIG.worldofdarkness.darkmode = isDarkTheme(sheet);

		clearHTML(sheet);

		const classList = getSheetClassList(sheet);
		if (!classList) return;

		if (isTablet) {
			//ui.notifications.info("tabet"); 
		}

		// adding the means to control the CSS by what language is used.
		if (CONFIG.language == "de") {
			classList.add("langDE");
		}
		else if (CONFIG.language == "es") {
			classList.add("langES");
		}
		else if (CONFIG.language == "it") {
			classList.add("langIT");
		}
		else if (CONFIG.language == "fr") {
			classList.add("langFR");
		}
		else if (CONFIG.language == "pt-BR") {
			classList.add("langPT");
		}
		else {
			classList.add("langEN");
		}

		const actorType = sheet.object.type.toLowerCase();

		if (actorType == "mortal") {
			classList.add("mortal");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}

			if (sheet.object.system.settings.variantsheet != "") {
				classList.remove("mortal");
				classList.add(sheet.object.system.settings.variant);
				classList.add(sheet.object.system.settings.variantsheet.toLowerCase());
			}
		}

		if (actorType == "creature") {
			classList.add("creature");

			if (sheet.object.system.settings.variantsheet != "") {
				classList.remove("creature");
				classList.add(sheet.object.system.settings.variantsheet.toLowerCase());
			}
		}

		if (actorType == "vampire") {
			classList.add("vampire");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if ((actorType == "werewolf") || (actorType == "changingbreed")) {
			classList.add("werewolf");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "mage") {
			classList.add("mage");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "changeling") {
			classList.add("changeling");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "demon") {
			classList.add("demon");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "hunter") {
			classList.add("hunter");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "wraith") {
			classList.add("wraith");

			for (const variant in CONFIG.worldofdarkness.variant.mortal) {
				classList.remove(variant);
			}
		}

		if (actorType == "mummy") {
			classList.add("mummy");
		}

		if (actorType == "exalted") {
			classList.add("exalted");
		}

		if (game.settings.get('worldofdarkness', 'useSplatFonts') === false) {
			classList.add("noSplatFont");
		}
		else if (!sheet.object.system.settings.usesplatfont) {
			classList.add("noSplatFont");
		}

		if (CONFIG.worldofdarkness.darkmode) {
			classList.add("wod-theme-dark");
		}	
	});

	/**
	 * Hook: renderItemSheet
	 * Triggered when a legacy ItemSheet (using appv1 API) is rendered.
	 * Applies language classes, font settings based on actor or global settings,
	 * and dark mode theme class.
	 */
	Hooks.on("renderItemSheet", (sheet) => { 
		CONFIG.worldofdarkness.darkmode = isDarkTheme(sheet);

		clearHTML(sheet);

		// adding the means to control the CSS by what language is used.
		if (CONFIG.language == "de") {
			sheet.element[0].classList.add("langDE");
		}
		else if (CONFIG.language == "es") {
			sheet.element[0].classList.add("langES");
		}
		else if (CONFIG.language == "it") {
			sheet.element[0].classList.add("langIT");
		}
		else if (CONFIG.language == "fr") {
			sheet.element[0].classList.add("langFR");
		}
		else if (CONFIG.language == "pt-BR") {
			sheet.element[0].classList.add("langPT");
		}
		else {
			sheet.element[0].classList.add("langEN");
		}

		if (game.settings.get('worldofdarkness', 'useSplatFonts') === false) {
			sheet.element[0].classList.add("noSplatFont");
		}
		else if (sheet.object?.actor !== undefined) {
			if (sheet.object.actor?.system?.settings?.usesplatfont === false) {
				sheet.element[0].classList.add("noSplatFont");
			}
		}

		if (CONFIG.worldofdarkness.darkmode) {
			sheet.element[0].classList.add("wod-theme-dark");
		}
	});

	/**
	 * Hook: renderItemSheetV2
	 * Triggered when an ItemSheetV2 (using ApplicationV2) is rendered.
	 * Only processes WoD item sheets (identified by "wod-item" class).
	 * Applies language classes, font settings, and dark mode theme class.
	 */
	Hooks.on("renderItemSheetV2", (sheet) => {
		CONFIG.worldofdarkness.darkmode = isDarkTheme(sheet);

		// Check if this is a WoD item sheet; apply classes to the DOM element (sheet.element)
		const el = sheet.element;
		if (el?.classList?.contains("wod-item")) {
			// adding the means to control the CSS by what language is used.
			if (CONFIG.language == "de") {
				el.classList.add("langDE");
			}
			else if (CONFIG.language == "es") {
				el.classList.add("langES");
			}
			else if (CONFIG.language == "it") {
				el.classList.add("langIT");
			}
			else if (CONFIG.language == "fr") {
				el.classList.add("langFR");
			}
			else if (CONFIG.language == "pt-BR") {
				el.classList.add("langPT");
			}
			else {
				el.classList.add("langEN");
			}

			if (game.settings.get('worldofdarkness', 'useSplatFonts') === false) {
				el.classList.add("noSplatFont");
			}
			else if (sheet.item?.actor?.system?.settings?.usesplatfont === false) {
				el.classList.add("noSplatFont");
			}

			if (CONFIG.worldofdarkness.darkmode) {
				el.classList.add("wod-theme-dark");
			}
		}
	});

	/**
	 * Hook: renderFormApplication
	 * Triggered when a FormApplication dialog is rendered.
	 * Handles both regular dialogs (isDialog flag) and settings dialogs (wod20rule-dialog class).
	 * Applies language classes, font settings, and dark mode theme class.
	 */
	Hooks.on("renderFormApplication", (sheet) => { 
		// Check if this is a WoD dialog (either isDialog or has wod20rule-dialog class for settings)
		const isWoDDialog = sheet.isDialog || 
		                    sheet.element?.[0]?.classList?.contains("wod20rule-dialog");
		
		if (isWoDDialog) {
			CONFIG.worldofdarkness.darkmode = isDarkTheme(sheet);

			clearHTML(sheet);	

			// adding the means to control the CSS by what language is used.
			if (CONFIG.language == "de") {
				sheet.element[0].classList.add("langDE");
			}
			else if (CONFIG.language == "es") {
				sheet.element[0].classList.add("langES");
			}
			else if (CONFIG.language == "it") {
				sheet.element[0].classList.add("langIT");
			}
			else if (CONFIG.language == "fr") {
				sheet.element[0].classList.add("langFR");
			}
			else if (CONFIG.language == "pt-BR") {
				sheet.element[0].classList.add("langPT");
			}
			else {
				sheet.element[0].classList.add("langEN");
			}

			if (game.settings.get('worldofdarkness', 'useSplatFonts') === false) {
				sheet.element[0].classList.add("noSplatFont");
			}
			else if (sheet.actor?.system?.settings?.usesplatfont === false) {
				sheet.element[0].classList.add("noSplatFont");
			}

			if (CONFIG.worldofdarkness.darkmode) {
				sheet.element[0].classList.add("wod-theme-dark");
			}
		}
	});

	/**
	 * Hook: renderApplicationV2
	 * Triggered when an ApplicationV2 dialog or sheet is rendered.
	 * Handles migration wizard, power selection dialog, item sheets, and actor sheets.
	 * Identifies WoD applications by CSS classes and applies dark mode theme class.
	 */
	Hooks.on("renderApplicationV2", (app, html, data) => {
		CONFIG.worldofdarkness.darkmode = isDarkTheme(app);
		
		// Check if this is a WoD ApplicationV2 dialog/sheet
		// Check by class names that WoD uses
		if (app.element?.classList?.contains("wod-dialog") || 
		    app.element?.classList?.contains("migration-wizard-dialog") ||
		    app.element?.classList?.contains("power-selection-dialog") ||
		    app.element?.classList?.contains("wod-item") ||
		    app.element?.classList?.contains("wod-sheet") ||
		    app.element?.classList?.contains("wod20")) {
			
			if (CONFIG.worldofdarkness.darkmode) {
				app.element.classList.add("wod-theme-dark");
			}
		}
	});

	/**
	 * Hook: renderDialog
	 * Triggered when a Dialog API dialog is rendered (legacy dialog system).
	 * Organizes select options into optgroups for item creation dialogs.
	 * Applies dark mode theme class to WoD dialogs (wod-dialog, wod-create classes).
	 */
	Hooks.on("renderDialog", (_dialog, html, _data) => {
		const container = html[0];
		CONFIG.worldofdarkness.darkmode = isDarkTheme(_dialog);

		if (container.classList.contains("dialog")) {
			const select = container.querySelector("select[name=type]");
			if (select) {
				select.append(
					constructOptGroup(select, game.i18n.localize("wod.sheets.items"), CharacterCreationItemTypes),
					constructOptGroup(select, game.i18n.localize("wod.sheets.powers"), PowerCreationItemTypes),
					constructOptGroup(select, game.i18n.localize("wod.sheets.equipment"), EquipmentItemTypes),
					constructOptGroup(select, game.i18n.localize("wod.sheets.sheets"), SheetTypes),
					constructOptGroup(select, game.i18n.localize("wod.sheets.npc"), AdversaryTypes)
				);
				select.querySelector("option").selected = true;
			}
		}
		
		// Add dark mode class for WoD dialogs
		if (container.classList.contains("wod-dialog") || container.classList.contains("wod-create")) {
			if (CONFIG.worldofdarkness.darkmode) {
				container.classList.add("wod-theme-dark");
			}
		}
	});

	/**
	 * Hook: dragRuler.ready
	 * Triggered once when the dragRuler module is ready.
	 * Registers a custom speed provider for World of Darkness movement speeds.
	 * Provides walk, jog, and run speed ranges with color coding for token movement visualization.
	 */
	Hooks.once("dragRuler.ready", (SpeedProvider) => {
		class GndWoD20thSpeedProvider extends SpeedProvider {
			get colors() {
				return [
					{id: "walk", default: 0x00FF00, name: "worldofdarkness.speeds.walk"},
					{id: "jog", default: 0xFFFF00, name: "worldofdarkness.speeds.jog"},
					{id: "run", default: 0xFF8000, name: "worldofdarkness.speeds.run"}
				]
			}
			getRanges(token) {
				const walkSpeed = token.actor.system.movement.walk;
				const jogSpeed = token.actor.system.movement.jog;
				const runSpeed = token.actor.system.movement.run;           

				//no need for multipliers in wod20 feet to meters 1feet = 0.3048m
				const ranges = [
					{range: walkSpeed, color: "walk"},
					{range: jogSpeed, color: "jog"},
					{range: runSpeed, color: "run"}
				]            

				return ranges
			}
		}

		dragRuler.registerSystem("worldofdarkness", GndWoD20thSpeedProvider)
	});

	/**
	 * Hook: renderSceneConfig
	 * add-prism-of-focus-foundry — design.md D6: a Zona de Realidad is a Scene property
	 * (`scene.flags["worldofdarkness"].prismZones`), edited from a small dialog opened from the
	 * Scene's OWN controls — its Configuration sheet — rather than a new sheet type or Journal page.
	 */
	Hooks.on("renderSceneConfig", (app, html) => {
		const container = html instanceof HTMLElement ? html : html[0];
		if (!container || container.querySelector(".prism-zone-button")) return;

		const footer = container.querySelector("footer") ?? container;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "prism-zone-button";
		button.textContent = game.i18n.localize("wod.prism.section.zones");
		button.addEventListener("click", (event) => {
			event.preventDefault();
			new PrismZoneDialog(app.document ?? app.object).render(true);
		});
		footer.prepend(button);
	});

	/**
	 * Hook: renderChatMessageHTML
	 * followups design.md D1 — the FIRST interactive chat card in `Foundry_WoD20` itself (modeled
	 * on `wod20-combat-foundryvtt`'s own card pattern; no such pattern existed in this system
	 * before). Strictly scoped to messages carrying our own flag namespace so it never touches any
	 * other chat message in the log — the shared-hook blast-radius risk this project's D4 note for
	 * `dialog-item.js` already flagged applies here too, mitigated the same way: additive, and a
	 * no-op unless the message is genuinely one of ours.
	 */
	Hooks.on("renderChatMessageHTML", (message, html) => {
		const data = message.getFlag(PRISM_CARD_FLAG_SCOPE, PRISM_CARD_FLAG_KEY);
		if (!data) return;

		const container = html instanceof HTMLElement ? html : html[0];
		if (!container) return;

		const card = new PrismCorruptedCard(message);
		container.querySelectorAll("[data-action^='prism-corrupted-']").forEach((btn) => {
			btn.addEventListener("click", async (event) => {
				event.preventDefault();
				const action = btn.dataset.action.replace("prism-corrupted-", "");
				await card.handleAction(action);
			});
		});
	});
}

