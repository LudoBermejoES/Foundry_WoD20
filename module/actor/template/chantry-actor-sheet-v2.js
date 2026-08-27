import ActionHelper, { OnItemEdit, SendChat, RollDice, OnUseMacro } from "../../scripts/action-helpers.js";
import ItemViewer from "../../applications/item-viewer.js";
import { prepareItemLists } from "../../scripts/gear-lists.js";
import {
	SPHERE_KEYS,
	ROSTER_TRAIT_KEYS,
	evaluateEffects,
	evaluateRosters,
	normaliseEffects,
	normaliseRosters,
	traitCap,
	isSingleRatingCapTrait,
	hasRoster
} from "../../scripts/chantry-effects.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * rebuild-chantry-sheet-v2 — task 0
 * ----------------------------------
 * Live actor count for type "Chantry" was NOT measured against `berlin-tenebroso` before this
 * class was written: this implementation pass has no `foundry-mcp` bridge session available (no
 * GM browser connected to query through), and no owner response to ask directly either, so the
 * two inputs task 0.1 names as acceptable sources were both unavailable. This is recorded here
 * rather than silently assumed away.
 *
 * Decision (task 0.2), taken on design.md D1's own reasoning rather than on a measured count:
 * STRAIGHT REPLACEMENT. `ChantryActorSheetV2` is registered `makeDefault: true` in `wod.js`;
 * `ChantryActorSheet` (the appv1 class this file replaces) stays on disk, unmodified, and stays
 * registered `makeDefault: false` as the per-actor rollback (`flags.core.sheetClass`), exactly
 * the escape hatch `PCActorSheet`/`PCActorSheetV3` already prove out live. This is the
 * recommendation design.md D1 states for the reasons it gives (a Chantry is a per-campaign
 * communal facility, not a per-player character — there is no equivalent of PC's 88 actors — and
 * this sheet has no splat/variant/era matrix to regress across), not a measured confirmation of
 * a specific low count. If a live count is ever taken and turns out non-trivial, D1's own escape
 * hatch is unchanged by that finding: flip the two `makeDefault` booleans in `wod.js` back, no
 * code change required.
 *
 * The class name below is stored as a literal string the moment any GM pins it via Sheet
 * Configuration (`add-pc-sheet-v3`'s own recorded trap). Name it once.
 *
 * add-chantry-inventory-effects-and-roster — THREE TABS, AND WHAT IS AND IS NOT SHARED WITH THE PC
 * -------------------------------------------------------------------------------------------------
 * This class stays its own class. design.md D1 is explicit and the measurement behind it is worth
 * repeating: `pc-actor-sheet.js` is 2,864 lines preparing attributes, abilities, health, willpower,
 * Spheres, splat and variant, and a Chantry has NONE of those — inheriting would mean dragging the
 * whole PC `_prepareContext` in and then dodging it branch by branch, and every future change to the
 * PC sheet would have to ask what it does to this one. There is a data-model asymmetry underneath it
 * too: `wod.js` registers a DataModel for `PC` only, while `Chantry` is still declared in
 * `template.json`.
 *
 * What IS shared is what was always meant to be shared — the look and the markup of an inventory:
 *   * `templates/actor/v3/gear.hbs`      the Equipo tab, rendered here, not copied (the spec requires
 *                                        exactly this, and forbids getting it by inheritance)
 *   * `templates/actor/v3/navigation.hbs` the nav rail
 *   * `templates/actor/parts/item_table.hbs` + `list_icons.hbs`, through the first of those
 *   * `css/pc-actor-v3.css`, via the `pc-actor-v3` class in DEFAULT_OPTIONS (see its own note)
 *   * `module/scripts/gear-lists.js`, the item-list preparer the PC's own gear context also calls
 * Five files and a class name. No base class, and nothing here that the PC sheet has to know about.
 */
export default class ChantryActorSheetV2 extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

	/**
	 * The sheet OPENS LOCKED, every time, and the lock is TRANSIENT - a class field, so it resets
	 * on each construction exactly like `PCActorSheet`'s own `this.locked = true` (pc-actor-sheet.js:63)
	 * and its `_handlingLock` toggle.
	 *
	 * This REVERSES `rebuild-chantry-sheet-v2`'s D3 ("system.locked stays the source of truth"),
	 * which itself carried the appv1 sheet's persisted lock across. Recorded rather than quietly
	 * dropped: the owner asked for the sheet to open locked, and the persisted flag cannot give that
	 * - a Chantry left unlocked reopens unlocked, which is precisely what was reported. Matching the
	 * PC sheet also means one idiom for "the lock control" across this system instead of two.
	 *
	 * `system.locked` stays in `template.json` and is no longer read by this sheet. The appv1 sheet,
	 * still registered as the rollback, DOES read it, so the field is not vestigial system-wide.
	 */
	locked = true;

	/**
	 * ApplicationV2 hands the CONSTRUCTOR one object — the options — with the document on
	 * `options.document`. Nothing is read off it here on purpose: `.github/scripts/test-appv2-
	 * constructor-signature.mjs` exists because 7.5.128 shipped `constructor(actor, options)` with
	 * `actor.system.locked` in the body, which threw inside `get sheet` and made this sheet
	 * completely unopenable. The only work done here is building the drag/drop handlers, which
	 * `PCActorSheet` also does in its constructor because ApplicationV2 provides none.
	 * @param {object} options
	 */
	constructor(options) {
		super(options);

		this.#dragDrop = this.#createDragDropHandlers();
	}

	#dragDrop;


	static DEFAULT_OPTIONS = {
		/*
		 * `pc-actor-v3` is the SCOPE MARKER of `css/pc-actor-v3.css`, and this sheet wears it
		 * deliberately (add-chantry-inventory-effects-and-roster task 3.1/3.3).
		 *
		 * WHY. This sheet now renders v3 MARKUP: the shared `v3/gear.hbs`, the shared nav rail
		 * `v3/navigation.hbs`, and `parts/item_table.hbs` through the first of those. Every class
		 * those files emit (`v3-tabbody`, `v3-section`, `v3-table`, `v3-empty`, `v3-iconbtn`,
		 * `v3-navbadge`, `v3-sr-only`…) is styled in that ONE stylesheet, and `v3-css-check.py`
		 * requires every selector in it to carry `.pc-actor-v3` — that is what keeps it off the v2
		 * PC sheet. So there are exactly two ways for a second sheet to look right in that markup:
		 * wear the class, or duplicate ~200 lines of rules under a `.chantry` scope. Wearing it is
		 * one word and cannot drift.
		 *
		 * THE COST, stated so the next reader knows: a future rule added to `css/pc-actor-v3.css`
		 * now reaches this sheet too. If one must NOT, scope it past the shared primitives (with
		 * `.pc-actor`, which this sheet does not wear, or with a `v3-stats`/`v3-bio`-style wrapper
		 * only the PC emits — the pattern the existing "locked dots" cluster already uses).
		 *
		 * design.md D1 is not weakened by this: D1 forbids INHERITING `PCActorSheet` (2,864 lines
		 * of attribute/ability/health/sphere preparation a Chantry has none of), and says outright
		 * that what should be shared is "el aspecto y el markup del inventario". A stylesheet scope
		 * and three template files are exactly that, and none of them is a base class.
		 */
		classes: ["wod20", "wod-sheet", "chantry", "pc-actor-v3"],
		// No `window.icon` override - this sheet has no established icon of its own anywhere in
		// this system (unlike PCActorSheet's `fa-solid fa-dice-d10`), and design.md/tasks.md task
		// 1.2 allows omitting it to inherit Foundry's default rather than inventing one.
		window: {
			resizable: true
		},
		position: {
			// Wider and taller than the single-part sheet was (620x700): there is a nav rail on the
			// left now, and the Efectos tab prints a Sphere/level list per row.
			width: 720,
			height: 760
		},
		form: {
			submitOnChange: true,
			handler: ChantryActorSheetV2.onSubmitActorForm
		},
		/* Drag/drop, wired the same way `PCActorSheet` wires it (its own `#createDragDropHandlers`),
		   because ApplicationV2 provides no drop handling of its own. This is what makes task 3.4's
		   requirement work: a Wonder dragged out of the `mage-wonders` pack onto this sheet becomes
		   an Item on this actor. */
		dragDrop: [
			{
				dragSelector: "[data-drag]",
				dropSelector: null
			}
		],
		actions: {
			// The lock is TRANSIENT here (see the `locked` class field above), so this flips the
			// flag and re-renders rather than persisting to the actor. It used to call
			// `ActionHelper.OnActorLock`, which writes `system.locked` - correct while the lock was
			// persisted, wrong once the sheet must OPEN locked every time.
			actorLock: function (event, target) {
				if (this && typeof this._handlingLock === "function") {
					this._handlingLock();
				}
			},
			ratingDotChange: ChantryActorSheetV2.onRatingDotChange,
			traitDotChange: ChantryActorSheetV2.onTraitDotChange,

			/* THE INVENTORY (task 3.4). Three of these are the system's own shared handlers,
			   imported rather than reimplemented - they are actor-agnostic and already correct:
			     `itemEdit`   opens the item's own sheet, and refuses while locked;
			     `sendChat`   posts the item to chat;
			     `rollDice`   opens the roll dialog for a rollable item.
			   The other two are NOT reusable and that was MEASURED, not assumed: `OnItemDelete`
			   and `OnItemActive` (action-helpers.js) both end with
			   `actorData.system.settings.isupdated = false` after `calculateTotals(actorData)`, and
			   a Chantry is the ONE Actor type in this system with no `system.settings` at all
			   (`template.json`'s "Chantry" carries locked/flavor/rating/tier/pool/traits/notes), so
			   either would throw a TypeError on the first click. This sheet's own two below do the
			   same job without the PC-only bookkeeping. */
			itemEdit: OnItemEdit,
			sendChat: SendChat,
			rollDice: RollDice,
			itemActive: ChantryActorSheetV2.onItemActive,
			itemDelete: ChantryActorSheetV2.onItemDelete,

			/* REGISTERED FOR A CONTROL THIS SHEET NEVER RENDERS, and that is on purpose.
			   `v3/gear.hbs` includes `parts/macro_icons.hbs` (the dice rail) inside
			   `{{#unless vault}}`, so a Chantry never emits it — but `sheet-invariants.py`'s I1
			   resolves partial includes STATICALLY and cannot evaluate that gate, so it reads
			   `useMacro` as reachable from this sheet. The choice it offers is "register it or delete
			   the control", and deleting the PC's dice rail is not on the table. Registering the
			   system's own handler is the harmless half: if the rail ever DID render here it would
			   work rather than be a dead icon, which is the failure I1 exists to prevent. */
			useMacro: OnUseMacro,

			/* INTEGRATED EFFECTS and the per-Trait ROSTERS (tasks 3.5/3.6). Both are ACTOR DATA,
			   not Items (design.md D3), so these write straight into `system.integratedEffects` /
			   `system.traitRosters`. Every one of them refuses while the sheet is locked, and every
			   control that invokes them is absent from a locked render (task 3.8) - two independent
			   gates, the same defence-in-depth the dot handlers already have. */
			effectCreate: ChantryActorSheetV2.onEffectCreate,
			effectDelete: ChantryActorSheetV2.onEffectDelete,
			effectSphereAdd: ChantryActorSheetV2.onEffectSphereAdd,
			effectSphereDelete: ChantryActorSheetV2.onEffectSphereDelete,
			rosterAdd: ChantryActorSheetV2.onRosterAdd,
			rosterDelete: ChantryActorSheetV2.onRosterDelete
			// Deliberately NO action entry for the Trait-description eye - it is read-only and
			// stays a manually-bound `_onRender` listener (design.md D3, task 1.3/3.1), the same
			// idiom `PCActorSheet._bindTraitDescriptionButtons` already uses for Attributes/
			// Spheres. The same is true of the ITEM eye in `list_icons.hbs`.
		}
	};

	/*
	 * TABS (add-chantry-inventory-effects-and-roster, task 3.1).
	 *
	 * `rebuild-chantry-sheet-v2` shipped this sheet with ONE part and no tabs, and said so in a
	 * comment that ended "One part it is." That was right for a sheet that was a header, a Trait
	 * list and a notes box. It is not right for one that also holds an inventory and an Effects
	 * ledger: three tabs is what the content now is.
	 *
	 * DECLARING `tabs` PUTS THIS CLASS INSIDE `sheet-invariants.py`'s I5, which it was previously
	 * outside of (I5 runs `if not tabs: continue`). I5 asserts, and this class now satisfies:
	 *   - exactly ONE part is not a tab id — the nav rail, `tabs` below;
	 *   - every tab id has a PARTS entry, and every content part has a `case` in
	 *     `_preparePartContext` (a part with no preparer renders with only the shared context, so
	 *     every key its template reads is undefined and the tab comes up BLANK, with no error);
	 *   - every content template carries a `data-tab=` attribute, or the tab machinery has nothing
	 *     to reveal.
	 * That is a strictly stronger gate than this class had before, which is the good half of the
	 * trade for declaring tabs at all.
	 *
	 * DECLARATION ORDER IS RAIL ORDER (`v3/navigation.hbs` iterates this object): Rasgos, Efectos,
	 * Equipo. Rasgos first because it is the sheet's identity — rating, tier, pool and the fourteen
	 * Traits — and because it is the tab the other two are derived from.
	 *
	 * Icons come from this Actor type's OWN icon set: `wod.sheettype` (module/config.js) already
	 * declares `chantry`, so `game.worldofdarkness.icons.chantry` is built by `wod.js` like every
	 * other splat's, and `getSplat()` answers "chantry" for this actor type. They are named here
	 * rather than derived per-tab-id in `getTabs()` the way `PCActorSheet` does it, because two of
	 * the three ids (`traits`, `effects`) are not icon names and a lookup by id would silently
	 * return `undefined` — which renders as an empty rail slot and nothing else.
	 */
	tabGroups = {
		primary: "traits"
	};

	tabs = {
		traits: {
			id: "traits",
			group: "primary",
			title: game.i18n.localize("wod.chantry.traitsheadline"),
			icon: game.worldofdarkness.icons.chantry.stats
		},
		effects: {
			id: "effects",
			group: "primary",
			title: game.i18n.localize("wod.chantry.effects.headline"),
			icon: game.worldofdarkness.icons.chantry.magic
		},
		gear: {
			id: "gear",
			group: "primary",
			title: game.i18n.localize("wod.tab.gear"),
			icon: game.worldofdarkness.icons.chantry.gear
		}
	};

	/*
	 * FOUR PARTS: the rail, and one per tab.
	 *
	 * `chantry-sheet-v2.hbs` KEEPS ITS NAME as the Rasgos tab (see that file's own header): two
	 * preflight gates read it by path, and its content is unchanged bar the roster include.
	 *
	 * `v3/navigation.hbs` and `v3/gear.hbs` are the PC sheet's own files, rendered here rather than
	 * copied. That is the spec's requirement for the gear tab, word for word — "SHALL reuse
	 * `templates/actor/v3/gear.hbs` rather than a Chantry-only copy of it, so that a change to how
	 * gear reads happens once" — and it explicitly forbids obtaining the markup by inheriting
	 * `PCActorSheet`/`PCActorSheetV3`. A template is a file, not a base class; see D1.
	 */
	static PARTS = {
		tabs: {
			template: "systems/worldofdarkness/templates/actor/v3/navigation.hbs"
		},
		traits: {
			template: "systems/worldofdarkness/templates/actor/chantry-sheet-v2.hbs"
		},
		effects: {
			template: "systems/worldofdarkness/templates/actor/chantry-effects-v2.hbs"
		},
		gear: {
			template: "systems/worldofdarkness/templates/actor/v3/gear.hbs"
		}
	};

	/**
	 * The tab collection the rail iterates, with `active`/`cssClass` resolved.
	 *
	 * Shaped exactly like `PCActorSheet.getTabs()` — same `active` test against `tabGroups`, same
	 * `actorv2 active`/`locked` class string — because `v3/navigation.hbs` reads `tab.cssClass`
	 * verbatim and the tab bodies read it too. The `locked` class it appends is what puts `.locked`
	 * on every tab `<section>`, which is a second (harmless) home for the selector
	 * `.wod20.chantry .locked .resource-value-step` already depends on; the Rasgos tab's own
	 * `.chantry-body` wrapper remains the one that rule was verified against.
	 *
	 * No era axis: a Chantry has no `system.settings`, so it has no era to put in the class list.
	 * @returns {object}
	 */
	getTabs() {
		const tabs = this.tabs;

		for (const tab of Object.values(tabs)) {
			tab.active = this.tabGroups[tab.group] === tab.id;
			tab.cssClass = tab.active ? "actorv2 active " : "actorv2 ";
			tab.cssClass += this.locked ? "locked " : "";
		}

		return tabs;
	}

	/** @override */
	/* Same shape as `PCActorSheet._handlingLock` - flip the transient flag and re-render. */
	async _handlingLock() {
		this.locked = !this.locked;
		await this.render(false);
	}

	async _prepareContext(options) {
		const data = await super._prepareContext(options);
		const actor = this.actor;

		data.config = CONFIG.worldofdarkness;
		data.locked = this.locked;
		data.actor = actor;
		data.owner = actor.isOwner;
		data.isOwner = actor.isOwner;
		data.tabs = this.getTabs();

		const traits = actor.system.traits ?? {};
		const rating = parseInt(actor.system.rating) || 0;
		const traitcost = CONFIG.worldofdarkness.chantry.traitcost;
		const rosters = evaluateRosters(actor.system.traitRosters, traits);

		let spent = 0;
		const traitlist = [];

		for (const key in traitcost) {
			const value = parseInt(traits[key]) || 0;
			const cost = traitcost[key];

			spent += value * cost;

			/* THE CAP IS PER TRAIT NOW (task 3.7 / design.md D7). This loop used to compute one
			   `const cap = rating * 2` above it and apply it to all fourteen. Zona de Realidad's own
			   entry in the Operative Dossier's table says otherwise, in as many words: "Este rasgo
			   no puede ser superior a la puntuación de la Capilla/Constructo" — the rating ONCE, not
			   twice. wodchar has always implemented the exception
			   (`SINGLE_RATING_CAP_TRAITS`, server/services/rules/chantry.ts); this sheet followed
			   the WRITTEN requirement, and the written requirement was the thing that was wrong.
			   The rule now lives in one place for both halves of the project to read
			   (`module/scripts/chantry-effects.js`'s `traitCap`), and the tooltip is a per-Trait key
			   because "supera el doble" is a false sentence for the one Trait the book is explicit
			   about. */
			const cap = traitCap(key, rating);

			traitlist.push({
				key: key,
				label: `wod.chantry.traits.${key}`,
				descriptionkey: `wod.chantry.traitdescriptions.${key}`,
				value: value,
				cost: cost,
				cap: cap,
				overcap: (rating > 0) && (value > cap),
				overcapkey: isSingleRatingCapTrait(key)
					? "wod.chantry.overcapsingle"
					: "wod.chantry.overcap",
				/* The census (task 3.6). `show` is what keeps the spec's promise that "an empty
				   roster SHALL NOT change how an existing sheet reads": the magnitude Traits never
				   get one, and the eight that do render no BLOCK at all while the sheet is locked
				   and empty. Unlocked, the head renders so there is a way to add the first entry.

				   THE OTHER HALF OF THAT PROMISE WAS MISSING, and it was reported: this sheet OPENS
				   LOCKED every time (its own requirement), so on a Chantry with no census entries —
				   every newly created one — `show` was false for all eight and the feature had NO
				   door at all. Measured on the rendered Rasgos tab: 0 roster blocks, 0 controls, 0
				   characters of roster markup locked, against 8 and 8 unlocked. `show` stays exactly
				   as it was, because the block is what would have added the noise; what the row now
				   carries instead is one icon, rendered precisely when the block is NOT (see
				   `chantry-sheet-v2.hbs`, and `_bindTraitRosterButtons` below). `used`/`allowed`
				   ride along on the same object the icon's tooltip prints. */
				roster: hasRoster(key)
					? { ...rosters[key], show: (rosters[key].entries.length > 0) || !this.locked }
					: null
			});
		}

		// Alphabetical by LOCALIZED label, in the active language - not by the key traitcost
		// enumerates them in, and not a locale-naive `localeCompare()` (no locale argument), which
		// misorders the accented labels in play (Espías, Criados, Ancianos). CONFIG.language is
		// this system's own established reflection of the active Foundry language. Kept EXACT in
		// shape from the appv1 sheet - `.github/scripts/test-chantry-trait-order.mjs` extracts and
		// executes this comparator against the real Trait keys and labels rather than
		// re-implementing it blind.
		traitlist.sort((a, b) =>
			game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), CONFIG.language || undefined));

		data.listData = { traits: traitlist };

		data.pool = {
			total: actor.system.pool?.total ?? 0,
			spent: spent
		};

		data.notes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.notes, { async: true });

		return data;
	}

	/**
	 * Per-part context. Every part declared in `PARTS` has a `case` here bar the nav rail, which is
	 * the one part with no preparer of its own (the same shape `PCActorSheet` has) — `sheet-
	 * invariants.py` I5 asserts exactly that correspondence, because a part with no preparer renders
	 * with only the shared context and comes up BLANK with no error and no console warning.
	 *
	 * Each `case` sets `context.tab`, which is what the part's own `<section data-tab="{{tab.id}}">`
	 * reads; without it the section renders with an empty `data-tab` and the tab machinery can never
	 * reveal it.
	 * @override
	 */
	async _preparePartContext(partId, context, options) {
		context = { ...(await super._preparePartContext(partId, context, options)) };

		switch (partId) {
			case "traits":
				context.tab = context.tabs.traits;
				return context;

			case "effects": {
				context.tab = context.tabs.effects;

				const traits = this.actor.system.traits ?? {};

				/* Every figure the Efectos tab prints, derived here and stored nowhere (spec: "SHALL
				   NOT be stored as a second copy that can drift from them"). Named `integrated`, not
				   `effects`, for the same reason the actor field is `system.integratedEffects` and
				   not `system.effects` (design.md D3): `effects` is `ActiveEffect`'s word in
				   Foundry, and this sheet may one day grow those too. */
				context.integrated = evaluateEffects(this.actor.system.integratedEffects, {
					rating: this.actor.system.rating,
					effectsRating: traits["integrated-effects"],
					nodeRating: traits.node,
					realityZone: traits["reality-zone"]
				});

				/* The Sphere `<select>`'s options, built HERE rather than iterated out of CONFIG
				   inside two nested `{{#each}}`es in the template — see `chantry-effects-v2.hbs`'s
				   own note on why that depth is not worth having. The effect's own index rides along
				   on each Sphere so no control has to reach back up a loop for it either. */
				for (const row of context.integrated.rows) {
					for (const sphere of row.spheres) {
						sphere.index = row.index;
						sphere.labelkey = sphere.sphere === ""
							? "wod.chantry.effects.nosphere"
							: `wod.spheres.${sphere.sphere}`;
						sphere.options = [
							{ key: "", labelkey: "wod.chantry.effects.nosphere", selected: sphere.sphere === "" },
							...SPHERE_KEYS.map((key) => ({
								key: key,
								labelkey: `wod.spheres.${key}`,
								selected: sphere.sphere === key
							}))
						];
					}
				}

				return context;
			}

			case "gear":
				context.tab = context.tabs.gear;
				/* The four item lists, from the helper the PC's own `prepareGearContext` calls
				   (task 3.2). `vault: true` is the single flag that turns off the three PC-only
				   blocks in `v3/gear.hbs` (carried money, the gear-notes prose box, the macro rail —
				   a Chantry has `system.gear` for none of them) and turns on the three lists a vault
				   needs and a PC keeps on other tabs (weapons, armour, Wonders/Fetishes). */
				prepareItemLists(context, this.actor, { vault: true });
				return context;
		}

		return context;
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);

		const element = this.element;

		ActionHelper.SetupDotCounters_v2(element);

		this._bindTraitDescriptionButtons(element);

		/* The ITEM eye in `list_icons.hbs` — read-only, so bound the same unconditional way the
		   Trait eye above is, and for the same reason (a read-only control must survive a locked
		   render). Kept AFTER the Trait binder because `test-chantry-trait-eye.mjs`'s B2 reads the
		   slice of this method up to the Trait binder call and requires no lock/editable condition
		   in it; nothing here introduces one, and the order makes that visibly true. */
		this._bindItemDescriptionButtons(element);

		/* The CENSUS icon (`chantry-sheet-v2.hbs`'s own note). Read-only like the two binders above
		   it, so it is bound unconditionally on every render and lives outside the declarative
		   `actions` map for the same reason they do. Kept LAST of the three: `test-chantry-trait-
		   eye.mjs`'s B2 reads the slice of this method UP TO the Trait binder call and requires no
		   lock/editable condition in it, and appending here cannot disturb that. */
		this._bindTraitRosterButtons(element);

		this.#dragDrop.forEach((d) => d.bind(element));
	}

	/**
	 * The item eye: opens the dropped/held Item's own read-only viewer.
	 *
	 * `list_icons.hbs` renders it with `data-itemid` and NO `data-action` (this system binds every
	 * description eye imperatively, `PCActorSheet._handleCollapsibleClick`), so without this the
	 * icon renders on a Chantry's vault rows, takes the pointer cursor and does nothing — the exact
	 * dead-control shape `sheet-invariants.py` I1 exists to prevent for actions and which no gate
	 * catches for an imperative binder.
	 * @param {HTMLElement} root
	 */
	_bindItemDescriptionButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-itemid]");
		if (!icons?.length) return;

		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";

			icon.addEventListener("click", () => {
				const item = this.actor.items.get(icon.dataset.itemid);
				if (!item) return;

				ItemViewer.open(item);
			});
		});
	}

	/**
	 * Read-only Trait-description eyes: bound unconditionally in `_onRender` (never gated on
	 * `locked`), deliberately - design.md D3 keeps this OUTSIDE the declarative `actions` map for
	 * exactly the reason `PCActorSheet._bindTraitDescriptionButtons` already establishes: a
	 * read-only control must survive a locked (or, on this sheet, limited) render, matching the
	 * appv1 sheet's own "bound BEFORE the editable early-return" guarantee - appv2 has no such
	 * early-return to be before, so "bound unconditionally, every render" is its equivalent.
	 *
	 * Opens the SAME read-only `ItemViewer` popup every other description eye in this system
	 * opens (polish-chantry-sheet design.md D1). A construction Trait is still neither an Item nor
	 * a compendium document, so it is handed a plain pseudo-document shaped like the three fields
	 * `ItemViewer` actually reads (`uuid`, `name`, `system.description`). The uuid stays namespaced
	 * under the OWNING ACTOR's own uuid, unchanged, so two different Chantries' same-keyed Trait
	 * windows cannot collide into one.
	 * @param {HTMLElement} root
	 */
	_bindTraitDescriptionButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-traitkey]");
		if (!icons?.length) return;

		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";

			icon.addEventListener("click", () => {
				const traitkey = icon.dataset.traitkey;
				const labelkey = icon.dataset.labelkey;
				const descriptionkey = icon.dataset.descriptionkey;
				if (!labelkey || !descriptionkey) return;

				ItemViewer.open({
					uuid: `${this.actor.uuid}.ChantryTrait.${traitkey}`,
					name: game.i18n.localize(labelkey),
					system: { description: game.i18n.localize(descriptionkey) }
				});
			});
		});
	}

	/**
	 * The CENSUS icon: opens the same read-only `ItemViewer` popup the description eyes open, with
	 * this Trait's roster in it — the points line, the entries, and (when there are none) what a
	 * census is and how to add the first entry.
	 *
	 * WHY A SEPARATE BINDER FROM THE EYE ABOVE, rather than one binder over both attributes: the two
	 * must be able to tell each other apart, because `dataset.collapseBound` is a one-shot stamp and
	 * whichever binder saw an icon first would own it. They are therefore keyed on DISJOINT
	 * attributes — `[data-traitkey]` for the description, `[data-rosterkey]` for the census — and
	 * `test-part-render.mjs` asserts no rendered element carries both.
	 *
	 * WHY THE CONTENT IS BUILT HERE AND NOT IN THE TEMPLATE: the figures are LIVE. Read at click
	 * time from `evaluateRosters`, this window cannot print a stale count if an entry was added from
	 * elsewhere (wodchar's API writes the same `system.traitRosters`), and no second copy of the
	 * entries has to be carried into the render context for eight Traits that mostly have none.
	 * @param {HTMLElement} root
	 */
	_bindTraitRosterButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-rosterkey]");
		if (!icons?.length) return;

		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";

			icon.addEventListener("click", () => {
				const key = icon.dataset.rosterkey;
				const labelkey = icon.dataset.labelkey;

				// The same guard every roster handler applies: a key outside the eight is not a
				// roster, and `evaluateRosters` would have nothing to answer with.
				if (!ROSTER_TRAIT_KEYS.includes(key)) return;

				const roster = evaluateRosters(this.actor.system.traitRosters, this.actor.system.traits ?? {})[key];
				const label = game.i18n.localize(labelkey || `wod.chantry.traits.${key}`);

				ItemViewer.open({
					uuid: `${this.actor.uuid}.ChantryRoster.${key}`,
					name: `${game.i18n.localize("wod.chantry.roster.headline")}: ${label}`,
					system: { description: this._rosterDescription(roster) }
				});
			});
		});
	}

	/**
	 * The census popup's body, as HTML.
	 *
	 * EVERY INTERPOLATED VALUE IS ESCAPED. A roster entry's name and note are typed by a GM and are
	 * stored verbatim, and `ItemViewer` runs its description through `enrichHTML` — so an unescaped
	 * `<` here would be markup, not text. This is the only place in this sheet that builds HTML from
	 * actor-authored strings, which is exactly why the escaping lives next to the interpolation
	 * instead of being assumed of the caller.
	 * @param {{entries: object[], used: number, allowed: number, over: boolean}} roster
	 * @returns {string}
	 */
	_rosterDescription(roster) {
		/* THE QUOTE IS REPLACED WITH `replaceAll('"')`, NOT WITH A `/"/g` REGEX, and that is not a
		   style preference: `.github/scripts/sheet-invariants.py`'s `js_block()` brace matcher is
		   string-aware but NOT regex-aware, so a double quote inside a regex literal opens a phantom
		   string, desynchronises the brace count and makes the gate lose this class's whole
		   `DEFAULT_OPTIONS.actions` map. It then reports nine "data-action registered by no sheet"
		   findings across three Chantry templates — a message that points everywhere except here.
		   Measured while writing this method. A single-quoted `'"'` is consumed correctly by that
		   same scanner. */
		const esc = (value) => String(value ?? "")
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replaceAll('"', "&quot;");

		const L = (key) => esc(game.i18n.localize(key));
		const parts = [];

		parts.push(`<p><strong>${L("wod.chantry.roster.points")}: ${esc(roster.used)} / ${esc(roster.allowed)}</strong></p>`);

		if (roster.over) {
			parts.push(`<p class="item-warning">${L("wod.chantry.roster.over")}</p>`);
		}

		if (roster.entries.length) {
			const rows = roster.entries.map((entry) => {
				const name = esc(entry.name) || L("wod.chantry.roster.name");
				const note = entry.note ? ` &mdash; ${esc(entry.note)}` : "";
				return `<li>${name}${note} (${esc(entry.points)})</li>`;
			});

			parts.push(`<ul>${rows.join("")}</ul>`);
		}
		else {
			// The whole point of the icon: an empty census must say what it is and how to fill it.
			parts.push(`<p>${L("wod.chantry.roster.empty")}</p>`);
		}

		return parts.join("");
	}

	/**
	 * Replaces the inline `.change()` binder's three branches (`flavor`/`tier`/`pool.total`) -
	 * gated on `this.locked` exactly as `_onsheetChange` did, warning on a locked write attempt.
	 * Kept as a `data-source`-driven dispatch (rather than switching to appv2's generic
	 * `submitData`/`expandObject` shape `PCActorSheet.onSubmitActorForm` uses for arbitrary named
	 * fields) because this sheet's own three writable fields already carry `data-source` in the
	 * template and there is no benefit to inventing a second wiring convention for three fields.
	 * @param {SubmitEvent} event
	 */
	static async onSubmitActorForm(event, form, formData) {
		const target = event.target;
		const dataset = target?.dataset ?? {};
		const source = dataset.source;

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		if (source === "flavor") {
			await this.actor.update({ "system.flavor": target.value });
		}
		else if (source === "tier") {
			await this.actor.update({ "system.tier": target.value });
		}
		else if (source === "pooltotal") {
			let value = parseInt(target.value);

			if (isNaN(value) || value < 0) {
				value = 0;
			}

			await this.actor.update({ "system.pool.total": value });
		}
		else if (target?.name === "name") {
			await this.actor.update({ name: target.value });
		}
		/* ---- Integrated Effects and rosters: array data, edited in place -----------------------
		   These four branches are why this handler stays a `data-source` dispatch instead of moving
		   to appv2's generic `expandObject(formData)` shape: what has to change is one element of an
		   array of objects, identified by index, and `system.integratedEffects.0.spheres.2.level`
		   through a generic path would rewrite the whole structure from whatever the form happened
		   to serialise — including the fields a locked or collapsed row did not render. Reading the
		   ONE control that fired, and writing back the canonicalised array, cannot lose a field that
		   was not on screen. */
		else if (source === "effect") {
			const index = Number(dataset.index);
			const field = dataset.field;
			const effects = this._effectsForWrite();

			if (!Number.isInteger(index) || index < 0 || index >= effects.length) return;
			if ((field !== "name") && (field !== "description")) return;

			effects[index][field] = target.value;

			await this._writeEffects(effects);
		}
		else if (source === "effectsphere") {
			const index = Number(dataset.index);
			const sphereindex = Number(dataset.sphereindex);
			const field = dataset.field;
			const effects = this._effectsForWrite();

			if (!Number.isInteger(index) || index < 0 || index >= effects.length) return;
			if (!Number.isInteger(sphereindex) || sphereindex < 0 || sphereindex >= effects[index].spheres.length) return;

			if (field === "sphere") {
				// "" (unset) is legal and is what a new row starts as; anything outside the nine is
				// dropped to "" rather than stored, so the cost calculator never sees a key it
				// cannot price. `normaliseEffects` would do it on the next read anyway; doing it
				// here means the stored data is never wrong in the first place.
				effects[index].spheres[sphereindex].sphere = SPHERE_KEYS.includes(target.value) ? target.value : "";
			}
			else if (field === "level") {
				let level = parseInt(target.value);

				if (isNaN(level) || level < 0) {
					level = 0;
				}

				effects[index].spheres[sphereindex].level = level;
			}
			else {
				return;
			}

			await this._writeEffects(effects);
		}
		else if (source === "roster") {
			const key = dataset.key;
			const index = Number(dataset.index);
			const field = dataset.field;

			if (!ROSTER_TRAIT_KEYS.includes(key)) return;

			const rosters = this._rostersForWrite();
			const entries = rosters[key] ?? [];

			if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;

			if ((field === "name") || (field === "note")) {
				entries[index][field] = target.value;
			}
			else if (field === "points") {
				let points = parseInt(target.value);

				// 0 is legal and load-bearing (design.md D5: a Biblioteca entry that describes a
				// holding rather than consuming a circle), so this floors at 0, not at 1.
				if (isNaN(points) || points < 0) {
					points = 0;
				}

				entries[index].points = points;
			}
			else {
				return;
			}

			await this._writeRoster(key, entries);
		}
	}

	/* Alter the Chantry/Construct's own rating dot (1-5). `data-action="ratingDotChange"` is only
	   ever RENDERED on the dot spans while unlocked (task 2.3) - this in-handler check stays as
	   defence in depth, not as the only gate (existing requirement, unchanged by the framework
	   migration). */
	static async onRatingDotChange(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const current = parseInt(this.actor.system.rating) || 0;

		let value = index + 1;

		if (current === value) {
			value = value - 1;
		}

		await this.actor.update({ "system.rating": value });
	}

	/* Alter a single construction Trait's dot rating and recompute the spent pool. Same
	   bind-time + in-handler double gate as the rating dots above. */
	static async onTraitDotChange(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const parent = target.parentElement;
		const key = parent?.dataset?.key;
		if (!key) return;

		const index = Number(target.dataset.index);
		const current = parseInt(this.actor.system.traits?.[key]) || 0;

		let value = index + 1;

		if (current === value) {
			value = value - 1;
		}

		const traits = foundry.utils.deepClone(this.actor.system.traits ?? {});
		traits[key] = value;

		const traitcost = CONFIG.worldofdarkness.chantry.traitcost;
		let spent = 0;

		for (const traitkey in traitcost) {
			spent += (parseInt(traits[traitkey]) || 0) * traitcost[traitkey];
		}

		await this.actor.update({
			[`system.traits.${key}`]: value,
			"system.pool.spent": spent
		});
	}

	/* ==========================================================================================
	 * THE VAULT — Items on a Chantry (task 3.4)
	 * ========================================================================================== */

	/* Copied in SHAPE from `PCActorSheet.#createDragDropHandlers` — ApplicationV2 has no drop
	   handling of its own, so every sheet that accepts a drop builds these three callbacks itself.
	   Nothing PC-specific is carried across: no reorder branch (this sheet has no ordered list), no
	   drag-over highlight (no row classes to highlight). */
	#createDragDropHandlers() {
		return (this.options.dragDrop ?? []).map((d) => {
			d.permissions = {
				dragstart: this._canDragStart.bind(this),
				drop: this._canDragDrop.bind(this)
			};

			d.callbacks = {
				dragstart: this._onDragStart.bind(this),
				dragover: this._onDragOver.bind(this),
				drop: this._onDrop.bind(this)
			};

			return new foundry.applications.ux.DragDrop(d);
		});
	}

	_canDragStart() {
		return this.isEditable;
	}

	_canDragDrop() {
		return this.isEditable;
	}

	_onDragStart(event) {
		return super._onDragStart?.(event);
	}

	_onDragOver() {}

	async _onDrop(event) {
		const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

		if (data?.type === "Item") {
			return this._onDropItem(event, data);
		}
	}

	/**
	 * A dropped Item becomes an Item on this actor. That is the whole rule.
	 *
	 * NOT GATED ON THE LOCK, deliberately, and this is a decision rather than an oversight. The
	 * sheet OPENS LOCKED every time (existing requirement), and the spec's own scenario is "a GM
	 * drags a document from the `mage-wonders` pack onto a Chantry sheet" → "the Item SHALL be
	 * created" with no unlocking step in it. `PCActorSheet._onDropItem` takes the same position for
	 * everything except a splat change. A drop is a deliberate act on a specific target, not a
	 * stray click, and the lock's job on this sheet is to protect the fourteen dot rows from one.
	 *
	 * `isremovable` is forced true for the same reason the PC sheet forces it: a compendium document
	 * may be marked unremovable in the pack, and an item a GM dropped into a vault by hand must
	 * always be removable from it again.
	 */
	async _onDropItem(event, data) {
		const droppedItem = await Item.implementation.fromDropData(data);
		if (!droppedItem) return;

		const itemData = droppedItem.toObject();

		if (itemData.system?.isremovable !== undefined) {
			itemData.system.isremovable = true;
		}
		if (itemData.system?.settings?.isremovable !== undefined) {
			itemData.system.settings.isremovable = true;
		}

		return await this.actor.createEmbeddedDocuments("Item", [itemData]);
	}

	/**
	 * A yes/no confirmation, asked the way an ApplicationV2 sheet should ask it — with a fallback,
	 * and the fallback is the point.
	 *
	 * `foundry.applications.api.DialogV2` is the modern API and the right one for this sheet, but
	 * NOTHING ELSE IN THIS SYSTEM USES IT: every existing confirmation goes through the appv1 global
	 * `Dialog.confirm` (`action-helpers.js`, `mortal-actor-sheet.js` and friends). That means this
	 * would be the first call site, on a path no offline gate can reach — a dialog only opens on a
	 * click — so an API-shape surprise would surface as "the delete button does nothing" in a live
	 * session. Trying the modern one and falling back to the one this system has been shipping for
	 * years costs six lines and removes that failure entirely.
	 * @param {string} title
	 * @param {string} body
	 * @returns {Promise<boolean>}
	 */
	async _confirm(title, body) {
		const DialogV2 = foundry.applications?.api?.DialogV2;

		if (DialogV2?.confirm) {
			// `confirm` resolves false on "no" and null on a dismissed window; both are "do nothing".
			return !!(await DialogV2.confirm({ window: { title: title }, content: `<p>${body}</p>` }));
		}

		return await new Promise((resolve) => {
			Dialog.confirm({
				title: title,
				content: `<p>${body}</p>`,
				yes: () => resolve(true),
				no: () => resolve(false),
				defaultYes: false
			});
		});
	}

	/**
	 * Toggle an item's "in use" flag.
	 *
	 * A Chantry-safe replacement for `OnItemActive` (action-helpers.js), which cannot be reused
	 * here: it ends with `calculateTotals(actorData)` and `actorData.system.settings.isupdated =
	 * false`, and a Chantry has no `system.settings` at all — the same measured reason
	 * `OnItemDelete` is replaced below. There is nothing to recompute on a Chantry either way: no
	 * soak, no dice pools, no health.
	 */
	static async onItemActive(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const item = this.actor.items.get(target.getAttribute("data-itemid"));
		if (!item) return;

		await item.update({ "system.isactive": !item.system.isactive });
	}

	/** Delete an item from the vault. Chantry-safe counterpart of `OnItemDelete` — see above. */
	static async onItemDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const itemid = target.getAttribute("data-itemid");
		const item = this.actor.items.get(itemid);
		if (!item) return;

		const confirmed = await this._confirm(
			game.i18n.format(game.i18n.localize("wod.labels.remove.item"), { name: item.name }),
			`${game.i18n.localize("wod.labels.remove.removing")} ${item.name}`);

		if (!confirmed) return;

		await this.actor.deleteEmbeddedDocuments("Item", [itemid]);
	}

	/* ==========================================================================================
	 * INTEGRATED EFFECTS (task 3.5) — actor DATA, not Items (design.md D3)
	 *
	 * Every handler below writes the WHOLE `system.integratedEffects` array. Foundry replaces an
	 * array wholesale rather than merging it, so read-modify-write of the whole list is the only
	 * shape that can delete an element at all, and it is what `normaliseEffects` exists for: the
	 * value that goes back is always the canonical shape, whatever a hand edit or an import left in
	 * there. A stored `cost` is dropped on the way through, which is what makes it impossible for a
	 * printed cost to disagree with the Spheres it came from.
	 * ========================================================================================== */

	/** The current effects list, canonicalised, ready to be modified and written back. */
	_effectsForWrite() {
		return normaliseEffects(this.actor.system.integratedEffects);
	}

	async _writeEffects(effects) {
		await this.actor.update({ "system.integratedEffects": effects });
	}

	static async onEffectCreate(event) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const effects = this._effectsForWrite();

		/* Born with ONE Sphere row rather than none: an effect with no Spheres costs 0 and reads as
		   a blank line, and every real one has at least one. The Sphere is unset, which the row
		   renders as "- select -" and prices at 0 until a Sphere is picked. */
		effects.push({ name: "", description: "", spheres: [{ sphere: "", level: 1 }] });

		await this._writeEffects(effects);
	}

	static async onEffectDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const effects = this._effectsForWrite();

		if (!Number.isInteger(index) || index < 0 || index >= effects.length) return;

		const name = effects[index].name;

		const confirmed = await this._confirm(
			game.i18n.localize("wod.chantry.effects.remove"),
			`${game.i18n.localize("wod.labels.remove.removing")} ${name}`);

		if (!confirmed) return;

		effects.splice(index, 1);

		await this._writeEffects(effects);
	}

	static async onEffectSphereAdd(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const effects = this._effectsForWrite();

		if (!Number.isInteger(index) || index < 0 || index >= effects.length) return;

		effects[index].spheres.push({ sphere: "", level: 1 });

		await this._writeEffects(effects);
	}

	static async onEffectSphereDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const sphereindex = Number(target.dataset.sphereindex);
		const effects = this._effectsForWrite();

		if (!Number.isInteger(index) || index < 0 || index >= effects.length) return;
		if (!Number.isInteger(sphereindex) || sphereindex < 0 || sphereindex >= effects[index].spheres.length) return;

		effects[index].spheres.splice(sphereindex, 1);

		await this._writeEffects(effects);
	}

	/* ==========================================================================================
	 * THE ROSTERS (task 3.6) — one list per rostered Trait, under `system.traitRosters`
	 * ========================================================================================== */

	/** The current rosters, canonicalised: any key that is not one of the eight is dropped (D5). */
	_rostersForWrite() {
		return normaliseRosters(this.actor.system.traitRosters);
	}

	async _writeRoster(key, entries) {
		await this.actor.update({ [`system.traitRosters.${key}`]: entries });
	}

	static async onRosterAdd(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const key = target.dataset.key;
		if (!ROSTER_TRAIT_KEYS.includes(key)) return;

		const rosters = this._rostersForWrite();
		const entries = rosters[key] ?? [];

		entries.push({ name: "", note: "", points: 1 });

		await this._writeRoster(key, entries);
	}

	static async onRosterDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const key = target.dataset.key;
		const index = Number(target.dataset.index);

		if (!ROSTER_TRAIT_KEYS.includes(key)) return;

		const rosters = this._rostersForWrite();
		const entries = rosters[key] ?? [];

		if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;

		const confirmed = await this._confirm(
			game.i18n.localize("wod.chantry.roster.remove"),
			`${game.i18n.localize("wod.labels.remove.removing")} ${entries[index].name}`);

		if (!confirmed) return;

		entries.splice(index, 1);

		await this._writeRoster(key, entries);
	}
}
