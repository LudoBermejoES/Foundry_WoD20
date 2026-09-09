import ActionHelper, { OnItemEdit, SendChat, RollDice, OnUseMacro } from "../../scripts/action-helpers.js";
import ItemViewer from "../../applications/item-viewer.js";
import { prepareItemLists } from "../../scripts/gear-lists.js";
import {
	SPHERE_KEYS,
	ROSTER_TRAIT_KEYS,
	evaluateItemRosters,
	rosterAllowedValues,
	rosterRatingValues,
	hasRoster,
	isBookOfChantriesTrait,
	bookTraitLevelCost,
	computeWardsDefensiveWards,
	computeLaboratoriesPreferential,
	computeRealmCost,
	realmQuintessenceUpkeepPerDay,
	REALM_SIZE_LEVELS,
	REALM_TERRAIN_LEVELS,
	REALM_CLIMATE_LEVELS,
	REALM_POPULATION_LEVELS,
	REALM_SOCIAL_STRUCTURE_LEVELS,
	NODE_POWER_LEVELS,
	nodePowerLevelRow,
	REALM_NODE_NAMED_COST,
	computePersonnelCost,
	computeConsortsCost,
	PERSONNEL_CONSORT_COST_PER_POWER_LEVEL,
	PERSONNEL_STAFF_TIER_LEVELS,
	PERSONNEL_STAFF_LOYALTY_LEVELS
} from "../../scripts/chantry-effects.js";
/* add-chantry-roster-tab — el censo se pinta con el MISMO constructor y la MISMA plantilla que el
   censo del PJ. Los dos ficheros están en `scripts/`, no en `PCActorSheet`, precisamente para que
   esta clase pueda usarlos sin heredar nada (D1 sigue en pie; el precedente es `gear-lists.js`). */
import { buildConnectionGroups, isConnectionEntry } from "../../scripts/connection-groups.js";
import { censusOptions, decorateCensusGroups, censusItemData, CENSUS_PERSON_PLACEHOLDER } from "../../scripts/chantry-census.js";
/* add-book-of-chantries-traits — el catálogo de `chantry-descriptor` (design.md D6/D16). Ver la
   cabecera de ese fichero: son DATOS embebidos en el sistema (id -> categoría), no un compendio, y
   las cadenas localizadas viven en `lang/*.json` bajo `wod.chantry.descriptors.*`. */
import {
	CHANTRY_DESCRIPTOR_CATEGORIES,
	CHANTRY_DESCRIPTOR_IDS,
	chantryDescriptorCategory,
	isKnownChantryDescriptor,
	descriptorFallbackLabel,
	chantryDescriptorPointValue
} from "../../scripts/chantry-descriptors.js";

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

			/* add-book-of-chantries-traits (task 5.2) — the Horizon Realm's `sphereShifts` array and
			   the narrative-descriptor tag list. The six named-level Traits, `wardsDefensiveLevels`
			   and the Realm's scalar fields are all `<select>`/`<input>` controls dispatched through
			   `onSubmitActorForm`'s `data-source` switch (same idiom as `flavor`/`tier`/`pooltotal`
			   above) rather than declared `actions`, because they are ONE control writing ONE field
			   each — an `action` entry is for a CLICK (add/remove/toggle a row), which is exactly
			   what these four are. */
			realmSphereShiftAdd: ChantryActorSheetV2.onRealmSphereShiftAdd,
			realmSphereShiftDelete: ChantryActorSheetV2.onRealmSphereShiftDelete,
			descriptorAdd: ChantryActorSheetV2.onDescriptorAdd,
			descriptorRemove: ChantryActorSheetV2.onDescriptorRemove,

			/* rebuild-chantry-book-of-chantries-only — el bloque Personal: `consorts` es una lista
			   repetible de coste variable, igual que `sphereShifts` del Reino, así que su add/remove
			   son ACCIONES (un clic que añade/quita una fila) mientras que `staffTier`/`staffLoyalty`/
			   `hereditaryStaff`/`military` son UN control que escribe UN campo cada uno y viven en el
			   `data-source` switch de `onSubmitActorForm`, igual que los campos del Reino. */
			personnelConsortAdd: ChantryActorSheetV2.onPersonnelConsortAdd,
			personnelConsortDelete: ChantryActorSheetV2.onPersonnelConsortDelete,

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

			/* EL CENSO (add-chantry-roster-tab, tarea 5.2). `itemCreate` es el MISMO nombre de acción
			   que el PJ registra, porque la plantilla es compartida y `sheet-invariants.py` I1
			   comprueba cada `data-action` contra el mapa de CADA hoja que renderiza la plantilla —
			   no contra la unión. Lo que cambia es el handler, y esto es el TERCER caso de la misma
			   familia en esta hoja:

			     `OnItemCreate` (action-helpers.js:1122) hace
			         this.actor.system.settings.variantsheet === "" ? this.actor.system.settings.splat…
			     SIN `?.`, y la Capilla es el único tipo de Actor de este sistema sin
			     `system.settings` (medido en `template.json`: locked, flavor, rating, tier, pool,
			     traits, notes, traitRosters, wardsDefensiveLevels, laboratoriesPreferential, realm,
			     personnel, descriptors). O sea TypeError en el primer clic.
			     `OnItemDelete` y `OnItemActive` ya se sustituyeron por lo mismo, y está dicho arriba.

			   Y además el diálogo del PJ (`CreateButtonsNotev2`) ofrece Trasfondo, Mérito y Defecto,
			   que una Capilla no puede tener: ofrecerle crear un Defecto es peor que no ofrecer nada
			   (D2.3). El handler de abajo no abre diálogo: crea la entrada y le estampa el Rasgo. */
			itemCreate: ChantryActorSheetV2.onCensusCreate
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
	 * rather than derived per-tab-id in `getTabs()` the way `PCActorSheet` does it, because `traits`
	 * is not an icon name and a lookup by id would silently return `undefined` — which renders as an
	 * empty rail slot and nothing else.
	 *
	 * rebuild-chantry-book-of-chantries-only RETIRES THE EFFECTS TAB. Integrated Effects depended on
	 * three Dossier Traits (`integrated-effects`/`node`/`reality-zone`) all retired in this change,
	 * and the book offers no equivalent "anchored spell" subsystem to give the tab an honest number
	 * (design.md D2). Three tabs now: Rasgos, Censo, Equipo.
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
		/* EL CENSO (add-chantry-roster-tab, tarea 4.1). El orden de DECLARACIÓN es el orden del riel
		   (`v3/navigation.hbs` itera este objeto), así que ir aquí es ir «entre Rasgos y Efectos».
		   Cero glifos nuevos: `IconHelper.GetIconlist` (module/ui/icons.js:115) declara `connections`
		   para toda raza y `getSplat()` responde `chantry` para este tipo de actor — es el mismo icono
		   que el PJ v3 usa para su propia pestaña de relaciones.
		   Título `wod.chantry.roster.headline` («Censo»), NUNCA `wod.tab.connections`: «Aliados y
		   contactos» es falso para Biblioteca y Nodo. */
		census: {
			id: "census",
			group: "primary",
			title: game.i18n.localize("wod.chantry.roster.headline"),
			icon: game.worldofdarkness.icons.chantry.connections
		},
		gear: {
			id: "gear",
			group: "primary",
			title: game.i18n.localize("wod.tab.gear"),
			icon: game.worldofdarkness.icons.chantry.gear
		}
	};

	/*
	 * FOUR PARTS: the rail, and one per tab (Rasgos, Censo, Equipo — Efectos retired, see the class
	 * header above).
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
		/* LA MISMA PLANTILLA QUE EL PJ, no una copia (tarea 4.4 y el requisito de la spec: «SHALL
		   reuse the PC roster's markup rather than a Chantry-only copy»). El interruptor es
		   `context.chantry`, igual que `vault` en `v3/gear.hbs`; el `data-tab` sale de `tab.id`, así
		   que el mismo fichero sirve para la pestaña `connections` del PJ y para `census` aquí. */
		census: {
			template: "systems/worldofdarkness/templates/actor/v3/connections.hbs"
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
		const realm = actor.system.realm ?? {};
		const personnel = actor.system.personnel ?? {};

		/* EL CENSO SE LEE DE LOS ITEMS, no de `system.traitRosters` (add-chantry-roster-tab, D1). El
		   mapa sigue declarado en `template.json` para que un mundo sin migrar no explote, y la
		   migración (`module/scripts/chantry-roster-migration.js`) lo vacía en cuanto corre; esta hoja
		   ya no lo lee en ninguna parte.
		   Las cifras de la fila del Rasgo (el tooltip del icono) y las de la pestaña salen de la MISMA
		   llamada, así que no pueden discrepar.
		   rebuild-chantry-book-of-chantries-only: el censo pasa de leer `system.traits` a secas a leer
		   el mapa PLANO `{guardian, staffTier, node}` que `rosterAllowedValues` construye — `staffTier`
		   vive en `system.personnel` y el `node` del libro en `system.realm.nodes.length`
		   (`fix-chantry-foundry-sheet-parity`: el escalar `nodeCount` está retirado), ninguno de los
		   dos bajo `system.traits`.
		   expand-chantry-node-personnel-and-roster-linking, design.md D2: `rosterAllowedValues` ya NO
		   devuelve el nivel/dot crudo de cada Rasgo — devuelve el AFORO real (`guardian`=1 si está
		   construido, `staffTier` por su tabla de aforo, `node`=`nodes.length` directamente). */
		const censusEntries = actor.items?.filter?.(isConnectionEntry) ?? [];
		const rosterValues = rosterAllowedValues({ traits: traits, personnel: personnel, realm: realm });
		const rosters = evaluateItemRosters(
			censusEntries.map((item) => ({ relation: item.system?.relation, points: item.system?.points })),
			rosterValues).groups;

		let spent = 0;
		const traitlist = [];

		/* CI-preflight followup (2026-09-08, run 34241724870) — this used to be a bare loop over the
		   nineteen Dossier LINEAR Traits, with the six book-of-chantries NAMED-LEVEL Traits pushed
		   into a SEPARATE `data.bookTraits` array by a second loop below, rendered through a second,
		   parallel `{{#each}}` in the template. `test-part-render.mjs` caught exactly the defect
		   that shape invites: `template.json` declared 25 Traits on `Actor.Chantry.traits` while
		   `CONFIG.worldofdarkness.chantry.traitcost` only priced 19 of them, so the row count never
		   matched the declaration count. `rebuild-chantry-book-of-chantries-only` later retires the
		   19 Dossier Traits outright and adds a SEVENTH book-of-chantries one (`laboratories`) —
		   `traitcost` now carries exactly those seven (config.js), every one of them table-priced,
		   and this ONE loop builds every row from it - a Trait declared on the actor and priced here
		   always renders exactly once, through the same `chantry-trait-row` markup. */
		for (const key in traitcost) {
			const entry = traitcost[key];
			const isTablePriced = !!(entry && (typeof entry === "object") && (entry.pricingModel === "table"));

			if (isTablePriced) {
				/* THE SEVEN NAMED-LEVEL Traits (add-book-of-chantries-traits, design.md D2/D11/D12;
				   `laboratories` added by rebuild-chantry-book-of-chantries-only D6): level 0 is a
				   real, named, priced choice ("Sin Guardián", -10), not "zero dots of a linear
				   Trait" - so this branch has no dot allocator and no per-Trait cap (D3: none of the
				   seven is ever checked against a rating-derived cap). `guardian` alone DOES carry a
				   census (ROSTER_TRAIT_KEYS), so `roster` below is conditional, not hardcoded null —
				   it used to be safe to hardcode when none of the six named-level Traits had a
				   census; that stopped being true the moment `guardian` gained one. */
				const rawLevel = traits[key];
				const level = (rawLevel === null || rawLevel === undefined) ? null : parseInt(rawLevel);
				const cost = (level === null) ? undefined : bookTraitLevelCost(key, level);

				if (cost !== undefined) spent += cost;

				traitlist.push({
					key: key,
					label: `wod.chantry.traits.${key}`,
					descriptionkey: `wod.chantry.traitdescriptions.${key}`,
					pricingModel: "table",
					value: level,
					cost: cost,
					notbuilt: level === null,
					// A stored level the table no longer reaches (a hand edit, or a future book
					// errata shrinking a table) is flagged rather than silently priced at 0 or
					// thrown on render - the same "degrade to a renderable state" discipline the
					// fallback branch below applies to an unrecognised pricing model.
					unpriced: (level !== null) && (cost === undefined),
					// The LOCKED render's plain-text value - resolved here rather than built in the
					// template with `concat`, so a `null` level (design.md D11's "not built",
					// distinct from a real level 0) reads as the actual "— No construido —" string
					// instead of a `concat`-built key ending in the literal text "null".
					currentlabelkey: (level === null) ? "wod.chantry.bookoftraits.notbuilt" : `wod.chantry.traitlevels.${key}.${level}`,
					options: entry.levels.map((points, index) => ({
						level: index,
						labelkey: `wod.chantry.traitlevels.${key}.${index}`,
						selected: level === index
					})),
					cap: undefined,
					overcap: false,
					overcapkey: undefined,
					roster: hasRoster(key) ? { ...rosters[key] } : null
				});

				continue;
			}

			/* rebuild-chantry-book-of-chantries-only retires the Dossier's 19 LINEAR Traits and their
			   2x/1x rating cap (design.md D8): with the Dossier gone, every entry
			   `CONFIG.worldofdarkness.chantry.traitcost` declares is table-priced (config.js builds
			   `traitcost` entirely from `BOOK_OF_CHANTRIES_TRAIT_KEYS`). This branch is therefore not
			   expected to run at all — kept as a DEGRADE-TO-RENDERABLE fallback (this project's own
			   discipline for a data shape the code does not expect) rather than a silent drop or a
			   reference to the linear cap machinery this change removes, so a future hand-edited
			   `traitcost` entry with no `pricingModel` still renders a flagged row instead of nothing. */
			traitlist.push({
				key: key,
				label: `wod.chantry.traits.${key}`,
				descriptionkey: `wod.chantry.traitdescriptions.${key}`,
				pricingModel: "unknown",
				value: parseInt(traits[key]) || 0,
				cost: undefined,
				unpriced: true,
				cap: undefined,
				overcap: false,
				overcapkey: undefined,
				/* The census. `show` is what keeps the spec's promise that "an empty
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
				roster: hasRoster(key) ? { ...rosters[key] } : null
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

		/* ======================================================================================
		 * add-book-of-chantries-traits (task 5.2) — `wards`' defensive add-on, the Horizon Realm+Node
		 * block, the Personnel block and the narrative-descriptor tag list. All price against the
		 * SAME `spent` the loop above has been accumulating for every Trait `traitcost` declares — it
		 * is not reset or shadowed by a second total.
		 * ====================================================================================== */

		const wardsLevel = parseInt(actor.system.wardsDefensiveLevels) || 0;
		const wardsDefensive = computeWardsDefensiveWards(wardsLevel);
		spent += wardsDefensive.cost;

		data.wardsDefensive = {
			value: wardsLevel,
			cost: wardsDefensive.cost,
			aggravatedDamage: wardsDefensive.aggravatedDamage,
			// Same cap SHAPE as the Traits' own `overcap` above (rating x1, design.md D8 — the one
			// figure of this whole change the book leaves unbounded, and the one finding of its own
			// cost audit), but this add-on is never a member of `traitcost`'s loop, so it needs its
			// own flag rather than reusing `trait.overcap`.
			overcap: (rating > 0) && (wardsLevel > rating)
		};

		/* `laboratories`' own add-on: "Trato Preferencial", a flat -2, the same pattern as
		   `wardsDefensiveLevels` above but with no per-level scale of its own (design.md D6). */
		const laboratoriesPreferential = !!actor.system.laboratoriesPreferential;
		spent += computeLaboratoriesPreferential(laboratoriesPreferential);
		data.laboratoriesPreferential = laboratoriesPreferential;

		spent += computeRealmCost(realm);

		data.realm = this._prepareRealmContext(realm, rosters.node);

		/* rebuild-chantry-book-of-chantries-only, design.md D4 — el bloque Personal. */
		spent += computePersonnelCost(personnel);

		data.personnel = this._preparePersonnelContext(personnel, rosters.staffTier);

		const descriptors = Array.isArray(actor.system.descriptors) ? actor.system.descriptors : [];

		/* reprice-chantry-descriptors (2026-09-08) — the book prices these, and this sheet's own
		   `spent` now sums them into the SAME pool as every other block, matching wodchar's own
		   computation (design.md D5). */
		spent += descriptors.reduce((sum, id) => sum + chantryDescriptorPointValue(id), 0);

		data.descriptorTags = descriptors.map((id) => ({
			id: id,
			known: isKnownChantryDescriptor(id),
			labelkey: isKnownChantryDescriptor(id) ? `wod.chantry.descriptors.catalog.${id}` : null,
			// An id this system's bundled catalogue does not recognise (design.md D16's documented
			// gap) still renders as SOMETHING rather than a blank tag — see
			// `chantry-descriptors.js`'s own header for why this can happen at all.
			fallbacklabel: isKnownChantryDescriptor(id) ? null : descriptorFallbackLabel(id),
			categorykey: isKnownChantryDescriptor(id)
				? `wod.chantry.descriptors.categories.${chantryDescriptorCategory(id)}`
				: null,
			pointValue: chantryDescriptorPointValue(id)
		}));

		// The "add" picker: every KNOWN id not already attached, grouped by category in the same
		// order `CHANTRY_DESCRIPTOR_CATEGORIES` declares them. A category with nothing left to add
		// (every one of its ids already attached) is dropped rather than rendered as an empty group.
		const attached = new Set(descriptors);

		data.descriptorPicker = CHANTRY_DESCRIPTOR_CATEGORIES
			.map((category) => ({
				category: category,
				categorykey: `wod.chantry.descriptors.categories.${category}`,
				options: CHANTRY_DESCRIPTOR_IDS
					.filter((id) => (chantryDescriptorCategory(id) === category) && !attached.has(id))
					.map((id) => ({
						id: id,
						labelkey: `wod.chantry.descriptors.catalog.${id}`,
						pointValue: chantryDescriptorPointValue(id)
					}))
			}))
			.filter((group) => group.options.length > 0);

		data.pool = {
			total: actor.system.pool?.total ?? 0,
			spent: spent
		};

		/* LA INSIGNIA DE LA PESTAÑA CENSO (tarea 4.5): un `.length` y nada más — ninguna descripción
		   se enriquece para contar, que es exactamente por qué el PJ tiene un
		   `countConnectionsTabItems` separado de su preparador.
		   Cuenta TODAS las entradas de censo, incluidas las de un `relation` mal tecleado: la
		   insignia dice cuántas entradas hay, y esconder las descolocadas volvería a hacerlas
		   invisibles.

		   Y ES UNA CADENA, no un número, POR UN DEFECTO MEDIDO DEL RIEL COMPARTIDO. `v3/navigation.hbs`
		   pinta la insignia con `{{#if tab.count}}`, y 0 es falso en Handlebars: un cero NUMÉRICO no
		   renderiza insignia ninguna. El requisito de este cambio es justo el contrario — una Capilla
		   recién creada tiene que ver «Censo» con un 0 al lado, porque el estado por defecto es el
		   único con el que empieza un lector (D10). `String(0)` es "0", que sí es verdadero, así que la
		   insignia sale sin tocar el riel: cambiar la condición del partial le pondría un «0» a cada
		   pestaña vacía de CADA hoja de PJ, y el requisito «the PC roster does not move» lo prohíbe. */
		if (data.tabs.census) {
			data.tabs.census.count = String(censusEntries.length);
		}

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

			/* SIN ESTE `case` LA PESTAÑA SALE EN BLANCO Y SIN ERROR: un part sin preparador se
			   renderiza solo con el contexto compartido, así que `connections`/`hasConnections` serían
			   undefined y no habría ni estado vacío. `sheet-invariants.py` I5 lo exige por eso. */
			case "census": {
				context.tab = context.tabs.census;

				/* EL INTERRUPTOR de la plantilla compartida, igual que `vault` en `v3/gear.hbs`. El PJ
				   no lo pone nunca, así que su render no cambia. */
				context.chantry = true;

				/* rebuild-chantry-book-of-chantries-only: el mapa PLANO {guardian, staffTier, node},
				   no `system.traits` a secas — `staffTier` vive en `system.personnel` y el `node` del
				   libro en `system.realm.nodes.length` (`fix-chantry-foundry-sheet-parity`).
				   expand-chantry-node-personnel-and-roster-linking, design.md D2 — DOS mapas, no uno:
				   `capacity` es el AFORO real (nunca el índice de tabla del Rasgo) que
				   `decorateCensusGroups`/`evaluateItemRosters` usan para «Puntos: X / Y» y el aviso de
				   sobrecoste; `rating` es el nivel/dot crudo que la cabecera de cada grupo pinta como
				   círculos (`group.rating` en `v3/connections.hbs`), deliberadamente AJENO al aforo —
				   ver la cabecera de `rosterRatingValues` en `chantry-effects.js` para por qué no puede
				   ser el mismo mapa (el aforo nuevo de `staffTier` llega a 20; pintarlo como círculos
				   sería un roto visual). */
				const capacity = rosterAllowedValues({
					traits: this.actor.system.traits ?? {},
					personnel: this.actor.system.personnel ?? {},
					realm: this.actor.system.realm ?? {}
				});
				const rating = rosterRatingValues({
					traits: this.actor.system.traits ?? {},
					personnel: this.actor.system.personnel ?? {},
					realm: this.actor.system.realm ?? {}
				});

				context.connections = decorateCensusGroups(
					await buildConnectionGroups(this.actor, censusOptions(rating, {
						locked: this.locked,
						locale: CONFIG.language
					})),
					capacity);
				context.hasConnections = context.connections.length > 0;

				/* i-see-consortes-in-censo-tab: los Consortes NO son Items (viven en
				   `system.personnel.consorts`, no en el censo de Rasgos), así que no pueden salir de
				   `buildConnectionGroups`/`decorateCensusGroups` — esos dos solo conocen Items con
				   `system.relation`. Se pintan como un grupo AJENO, propio de esta pestaña, para que el
				   usuario los vea "en el sitio esperado" (censo) sin forzarlos por la tubería de Rasgos,
				   que les pintaría un aviso "sin Rasgo asignado" falso: un Consorte no cuenta contra
				   ningún Rasgo por diseño, no por error de tecleo. */
				context.consortsGroup = this._prepareConsortsCensusGroup(this.actor.system.personnel?.consorts);

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
	 * EL ICONO DEL CENSO de la fila de un Rasgo: ACTIVA LA PESTAÑA CENSO y enfoca el grupo de ese
	 * Rasgo. No abre nada.
	 *
	 * ESTO REVIERTE 7.5.137 A PROPÓSITO, y la razón está en D7 de `add-chantry-roster-tab`. Ese icono
	 * se añadió porque el censo vivía dentro de la pestaña de Rasgos y, con la hoja abriendo bloqueada
	 * y el censo vacío, no tenía NINGUNA puerta: 0 bloques, 0 controles y 0 caracteres de markup en 19
	 * filas de Rasgo. La visibilidad la resuelve ahora la pestaña, que el riel pinta siempre, así que
	 * el popup de solo lectura sobraría — y dos puertas al mismo contenido es justo lo que el cambio
	 * anterior evitó a propósito («nunca se ofrece desde dos sitios a la vez»).
	 *
	 * Lo que el icono sigue aportando y la pestaña no: el puntero POR RASGO.
	 *
	 * TRES COSAS QUE NO CAMBIAN, y las tres son requisitos:
	 *   * sigue siendo de SOLO LECTURA — navegar no escribe — así que se liga sin condición de bloqueo
	 *     en cada render, igual que las dos eyes de arriba;
	 *   * sigue renderizándose sin condicionar a la puntuación del Rasgo ni a que su censo tenga
	 *     entradas («una affordance cuya PRESENCIA depende del dato es la clase de defecto que esto
	 *     arregla»);
	 *   * sigue keyada en `[data-rosterkey]`, DISJUNTA de `[data-traitkey]`: las dos ligaduras
	 *     estampan `dataset.collapseBound` y la primera que viera un icono con las dos claves se
	 *     quedaría con él y abriría lo que no toca.
	 *
	 * `changeTab` es la API de ApplicationV2 y es la correcta, pero NADA MÁS EN ESTE SISTEMA la llama,
	 * así que se prueba y hay respaldo — el mismo trato que `_confirm` le da a `DialogV2`, y por el
	 * mismo motivo: un camino que solo existe tras un clic no lo alcanza ninguna puerta offline, y una
	 * sorpresa de firma se vería como «el icono no hace nada» en una sesión real. El respaldo escribe
	 * el grupo de pestañas a mano y re-renderiza, que es lo que `_handlingLock` ya hace.
	 *
	 * EL SELECTOR DEL GRUPO ES ESTÁTICO Y EL FILTRO VA EN JS, no `[data-censusgroup="${key}"]`:
	 * `binder-selector-check.py` comprueba que cada selector que este sistema teclea sea producible
	 * por la plantilla de la hoja, y un selector construido con una plantilla de cadena no se puede
	 * comprobar — un fallo tipográfico ahí no daría error, solo dejaría de enfocar.
	 * @param {HTMLElement} root
	 */
	_bindTraitRosterButtons(root) {
		const icons = root.querySelectorAll?.(".collapsible.button[data-rosterkey]");
		if (!icons?.length) return;

		icons.forEach(icon => {
			if (icon.dataset.collapseBound) return;
			icon.dataset.collapseBound = "true";

			icon.addEventListener("click", async () => {
				const key = icon.dataset.rosterkey;

				// Un Rasgo que no admite censo no tiene grupo al que ir.
				if (!ROSTER_TRAIT_KEYS.includes(key)) return;

				await this._activateCensusTab();
				this._focusCensusGroup(key);
			});
		});
	}

	/**
	 * Activa la pestaña Censo. Devuelve el control cuando la pestaña ya está activa, para que quien
	 * llame pueda enfocar dentro de ella.
	 */
	async _activateCensusTab() {
		if (this.tabGroups?.primary === "census") return;

		if (typeof this.changeTab === "function") {
			try {
				this.changeTab("census", "primary");
				return;
			}
			catch (err) {
				console.warn("WoD | changeTab no disponible en esta versión; se cambia la pestaña a mano.", err);
			}
		}

		this.tabGroups.primary = "census";
		await this.render(false);
	}

	/**
	 * Trae a la vista el grupo de un Rasgo dentro de la pestaña Censo.
	 *
	 * `focus()` además de `scrollIntoView()` porque el segundo no dice NADA a un lector de pantalla:
	 * el envoltorio del grupo lleva `tabindex="-1"` justo para poder recibir el foco sin entrar en el
	 * orden de tabulación. Y si el grupo no está (Rasgo sin entradas en una hoja bloqueada, que es
	 * cuando la pestaña muestra su estado vacío) no pasa nada: la pestaña ya está activa y el estado
	 * vacío explica cómo añadir la primera entrada.
	 * @param {string} key
	 */
	_focusCensusGroup(key) {
		const groups = this.element?.querySelectorAll?.(".census-group");
		if (!groups?.length) return;

		const target = Array.from(groups).find((el) => el.dataset?.censusgroup === key);
		if (!target) return;

		target.scrollIntoView?.({ block: "start", behavior: "smooth" });
		target.focus?.({ preventScroll: true });
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
		else if (source === "laboratoriespreferential") {
			const checked = !!target.checked;

			await this.actor.update({
				"system.laboratoriesPreferential": checked,
				"system.pool.spent": this._computePoolSpent({ laboratoriesPreferential: checked })
			});
		}
		/* Ya no hay rama `roster`: una entrada del censo es un Item con su propia hoja
		   (add-chantry-roster-tab, D1), así que su nombre, su descripción y sus puntos se editan ahí y
		   no en tres `<input>` dentro de la fila del Rasgo. */

		/* ---- add-book-of-chantries-traits (task 5.2) --------------------------------------------
		   The six named-level Traits, `wardsDefensiveLevels` and the Horizon Realm's scalar fields
		   are each ONE control writing ONE value, so they stay in this SAME `data-source` dispatch
		   rather than becoming declared `actions` (those are for a CLICK — add/remove a row, which
		   is what `realmSphereShiftAdd`/`realmSphereShiftDelete`/`descriptorAdd`/`descriptorRemove`
		   are, registered in `DEFAULT_OPTIONS.actions` instead). Every branch recomputes
		   `system.pool.spent` through `_computePoolSpent()` so none of the four cost sources can
		   ever zero out another (see that method's own doc). ------------------------------------ */
		else if (source === "booktrait") {
			const key = dataset.key;
			if (!isBookOfChantriesTrait(key)) return;

			// "" is the `<select>`'s own "— No construido —" option (design.md D11/D12: absence and
			// a real, named level 0 are different states) — never coerced to 0.
			const value = (target.value === "") ? null : parseInt(target.value);
			const traits = { ...(this.actor.system.traits ?? {}), [key]: value };

			await this.actor.update({
				[`system.traits.${key}`]: value,
				"system.pool.spent": this._computePoolSpent({ traits: traits })
			});
		}
		else if (source === "wardsdefensive") {
			let value = parseInt(target.value);
			if (!Number.isInteger(value) || (value < 0)) value = 0;

			await this.actor.update({
				"system.wardsDefensiveLevels": value,
				"system.pool.spent": this._computePoolSpent({ wardsDefensiveLevels: value })
			});
		}
		else if (source === "realmhasrealm") {
			const checked = !!target.checked;

			const update = checked
				? { "system.realm.hasRealm": true }
				: {
					/* Turning the toggle OFF clears the other eight fields, rather than leaving them
					   stored-but-hidden (mirrors wodchar's own `onRealmToggle`, design.md D14).
					   `computeRealmCost()`/`realmQuintessenceUpkeepPerDay()` sum every field by its
					   PRESENCE, never by `hasRealm` (D4) — a field left behind would keep charging
					   points and reporting upkeep with the block visibly "off", exactly the "a value
					   accepted that silently keeps doing something" shape this project already tracks
					   several instances of (CLAUDE.md). */
					"system.realm.hasRealm": false,
					"system.realm.size": null,
					"system.realm.sphereShifts": [],
					"system.realm.terrain": null,
					"system.realm.climate": null,
					"system.realm.interconnected": false,
					"system.realm.advancedTransport": false,
					"system.realm.population": null,
					"system.realm.socialStructure": null
				};

			const realmForCost = checked ? { ...(this.actor.system.realm ?? {}), hasRealm: true } : {};
			update["system.pool.spent"] = this._computePoolSpent({ realm: realmForCost });

			await this.actor.update(update);
		}
		/* fix-chantry-foundry-sheet-parity — the OLD single-value `nodeCount`/`nodeSize`/`nodeNamed`/
		   `nodeBattery`/`nodeTass` editing handlers (`realmnodecount` source, and those five field
		   names inside `realmfield`) are REMOVED here: wodchar moved to `realm.nodes[]`, an array of
		   individually-authored Node entries, and editing a Node stays wodchar's job — this sheet
		   only DISPLAYS them (read-only Node detail section, `_prepareRealmContext`). There is
		   nothing left for this sheet to write for a Node. */
		else if (source === "realmfield") {
			const field = dataset.field;
			const scalarFields = ["size", "terrain", "climate", "population", "socialStructure"];
			const booleanFields = ["interconnected", "advancedTransport"];

			if (!scalarFields.includes(field) && !booleanFields.includes(field)) return;

			const value = booleanFields.includes(field)
				? !!target.checked
				: ((target.value === "") ? null : parseInt(target.value));

			const realm = { ...(this.actor.system.realm ?? {}), [field]: value };

			await this.actor.update({
				[`system.realm.${field}`]: value,
				"system.pool.spent": this._computePoolSpent({ realm: realm })
			});
		}
		else if (source === "realmsphereshift") {
			const index = Number(dataset.index);
			const field = dataset.field;
			const shifts = foundry.utils.deepClone(this.actor.system.realm?.sphereShifts ?? []);

			if (!Number.isInteger(index) || (index < 0) || (index >= shifts.length)) return;
			if ((field !== "sphere") && (field !== "delta")) return;

			if (field === "sphere") {
				shifts[index].sphere = SPHERE_KEYS.includes(target.value) ? target.value : "";
			}
			else {
				const delta = parseInt(target.value);
				shifts[index].delta = Number.isFinite(delta) ? delta : 0;
			}

			const realm = { ...(this.actor.system.realm ?? {}), sphereShifts: shifts };

			await this.actor.update({
				"system.realm.sphereShifts": shifts,
				"system.pool.spent": this._computePoolSpent({ realm: realm })
			});
		}
		/* rebuild-chantry-book-of-chantries-only, design.md D4 — el bloque Personal. `staffTier`/
		   `staffLoyalty` son campos de nivel con tabla (mismo patrón que los Rasgos de tabla del
		   libro); `hereditaryStaff`/`military` son booleanos de coste plano. */
		else if (source === "personnelfield") {
			const field = dataset.field;
			const levelFields = ["staffTier", "staffLoyalty"];
			const booleanFields = ["hereditaryStaff", "military"];

			if (!levelFields.includes(field) && !booleanFields.includes(field)) return;

			const value = booleanFields.includes(field)
				? !!target.checked
				: ((target.value === "") ? null : parseInt(target.value));

			const personnel = { ...(this.actor.system.personnel ?? {}), [field]: value };

			await this.actor.update({
				[`system.personnel.${field}`]: value,
				"system.pool.spent": this._computePoolSpent({ personnel: personnel })
			});
		}
		/* `consorts[].powerLevel` — la única cifra que edita un control dentro de la lista repetible;
		   añadir/quitar una fila entera son ACCIONES (`personnelConsortAdd`/`personnelConsortDelete`,
		   abajo), porque son un CLIC, no un control que escribe un valor.
		   `fix-chantry-foundry-sheet-parity` task 3.4: `consorts[index] = { ...consorts[index],
		   powerLevel }` en vez de un literal que sustituye la entrada entera — la versión anterior
		   descartaba en silencio `name`/`characterId` (`name-chantry-consorts`) en cuanto se editaba
		   el nivel de poder desde Foundry. */
		else if (source === "personnelconsort") {
			const index = Number(dataset.index);
			const consorts = foundry.utils.deepClone(this.actor.system.personnel?.consorts ?? []);

			if (!Number.isInteger(index) || (index < 0) || (index >= consorts.length)) return;

			let powerLevel = parseInt(target.value);
			if (!Number.isInteger(powerLevel) || (powerLevel < 0)) powerLevel = 0;

			consorts[index] = { ...consorts[index], powerLevel: powerLevel };

			const personnel = { ...(this.actor.system.personnel ?? {}), consorts: consorts };

			await this.actor.update({
				"system.personnel.consorts": consorts,
				"system.pool.spent": this._computePoolSpent({ personnel: personnel })
			});
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

		await this.actor.update({
			[`system.traits.${key}`]: value,
			// add-book-of-chantries-traits — THIS USED TO be a bare loop over `traitcost` (the 19
			// linear Traits only). Left as-is, changing a LINEAR Trait's dots would have zeroed out
			// whatever the six book-of-chantries Traits, `wardsDefensiveLevels` and `realm` were
			// contributing to the SAME pool (design.md D2.6/D13) on every single dot click. Routed
			// through the shared helper so all four sources of cost are recomputed together, no
			// matter which one the user just touched.
			"system.pool.spent": this._computePoolSpent({ traits: traits })
		});
	}

	/**
	 * `system.pool.spent`, recomputed from the actor's CURRENT stored data with `overrides` merged
	 * in for whichever ONE of `traits`/`wardsDefensiveLevels`/`laboratoriesPreferential`/`realm`/
	 * `personnel`/`descriptors` the caller is about to write — never from only whichever fields
	 * happen to be on screen, so a write to any one of this sheet's cost sources (the seven
	 * book-of-chantries Traits, `wardsDefensiveLevels`, `laboratoriesPreferential`, the Realm+Node
	 * block, the Personnel block, the narrative descriptors) never zeroes out any other's
	 * contribution to the same total. Mirrors wodchar's own rule for the identical hazard (design.md
	 * D13 of `add-book-of-chantries-traits`: "a PATCH that only touches one of the three recomputes
	 * poolSpent using the EXISTING other two, not as if they were absent").
	 * @param {object} [overrides]
	 * @param {Record<string, number|null>} [overrides.traits]  replaces `system.traits` for THIS calc
	 * @param {number} [overrides.wardsDefensiveLevels]          replaces `system.wardsDefensiveLevels`
	 * @param {boolean} [overrides.laboratoriesPreferential]      replaces `system.laboratoriesPreferential`
	 * @param {object} [overrides.realm]                         replaces `system.realm` for THIS calc
	 * @param {object} [overrides.personnel]                     replaces `system.personnel` for THIS calc
	 * @param {string[]} [overrides.descriptors]                  replaces `system.descriptors` for THIS calc
	 * @returns {number}
	 */
	_computePoolSpent(overrides = {}) {
		const actor = this.actor;
		const traits = overrides.traits ?? (actor.system.traits ?? {});
		const wardsDefensiveLevels = (overrides.wardsDefensiveLevels !== undefined)
			? overrides.wardsDefensiveLevels
			: (parseInt(actor.system.wardsDefensiveLevels) || 0);
		const laboratoriesPreferential = (overrides.laboratoriesPreferential !== undefined)
			? overrides.laboratoriesPreferential
			: !!actor.system.laboratoriesPreferential;
		const realm = overrides.realm ?? (actor.system.realm ?? {});
		const personnel = overrides.personnel ?? (actor.system.personnel ?? {});
		const descriptors = overrides.descriptors
			?? (Array.isArray(actor.system.descriptors) ? actor.system.descriptors : []);

		const traitcost = CONFIG.worldofdarkness.chantry.traitcost;
		let spent = 0;

		/* Every one of the seven book-of-chantries Traits is table-priced (config.js) — a single
		   loop prices all of them, matching `_prepareContext`'s own loop. */
		for (const traitkey in traitcost) {
			const entry = traitcost[traitkey];

			if (entry && (typeof entry === "object") && (entry.pricingModel === "table")) {
				const level = traits[traitkey];
				if ((level === null) || (level === undefined)) continue;

				const cost = bookTraitLevelCost(traitkey, parseInt(level));
				if (cost !== undefined) spent += cost;

				continue;
			}

			spent += (parseInt(traits[traitkey]) || 0) * entry;
		}

		spent += computeWardsDefensiveWards(wardsDefensiveLevels).cost;
		spent += computeLaboratoriesPreferential(laboratoriesPreferential);
		spent += computeRealmCost(realm);
		spent += computePersonnelCost(personnel);
		spent += descriptors.reduce((sum, id) => sum + chantryDescriptorPointValue(id), 0);

		return spent;
	}

	/**
	 * The Horizon Realm+Node block's render-ready shape (design.md D4/D12, task 5.2). Each Node in
	 * `realm.nodes[]` is an INDEPENDENT purchase from the Realm's own fields, sharing this same
	 * `system.realm` object and this same render section (`fix-chantry-foundry-sheet-parity`
	 * replaces the retired `hasNode`(0/1)/`nodeCount`(repeatable counter)/`nodeSize`/`nodeNamed`/
	 * `nodeBattery`/`nodeTass` scalar history — see `_prepareNodeContext` for each Node's own shape).
	 * For the Realm's own fields: the `hasRealm` toggle, for each NAMED-LEVEL field a `<select>`'s
	 * worth of options sized to its OWN table, the boolean fields, the `sphereShifts` array (a
	 * repeating-row idiom), and the computed daily Quintessence upkeep — REPORTED, never subtracted
	 * from anything (D4). The section as a whole renders when EITHER `hasRealm` is true or
	 * `realm.nodes` is non-empty (a Chantry may have one without the other,
	 * book-of-chantries-es.md:5656).
	 * @param {object} realm  `actor.system.realm ?? {}`
	 * @param {{used: number, allowed: number, over: boolean}} [nodeRoster]  the Node's own census
	 *        totals (`rosters.node` from `evaluateItemRosters`), for the census door icon's tooltip
	 * @returns {object}
	 */
	_prepareRealmContext(realm, nodeRoster) {
		const levelField = (field, table) => {
			const raw = realm[field];
			const level = ((raw === null) || (raw === undefined)) ? null : parseInt(raw);

			return {
				// The STORED key (`socialStructure`), used for `data-field`/`name` — distinct from
				// this object's own lower-case context key (`socialstructure`), which only exists
				// because Handlebars property lookups are case-sensitive and this sheet's other
				// blocks (`wardsdefensive`, `bookoftraits`) already settled on lower-case.
				field: field,
				value: level,
				notbuilt: level === null,
				currentlabelkey: (level === null)
					? "wod.chantry.bookoftraits.notbuilt"
					: `wod.chantry.realm.levels.${field}.${level}`,
				options: table.map((row, index) => ({
					level: index,
					labelkey: `wod.chantry.realm.levels.${field}.${index}`,
					selected: level === index
				}))
			};
		};

		const sphereShifts = Array.isArray(realm.sphereShifts) ? realm.sphereShifts : [];
		const hasRealm = !!realm.hasRealm;
		const nodes = Array.isArray(realm.nodes) ? realm.nodes : [];

		return {
			hasRealm: hasRealm,
			// The section's own render gate — `hasRealm || nodes.length > 0`, so a Node-only Chantry
			// (no Realm) still shows something (spec: "a Chantry may have Node without Realm, and
			// Realm without Node, exactly as the book treats them as two related but independent
			// things"). `fix-chantry-foundry-sheet-parity`: `nodes.length` replaces the retired
			// `nodeCount` scalar.
			show: hasRealm || (nodes.length > 0),
			nodes: nodes.map((node) => this._prepareNodeContext(node)),
			size: levelField("size", REALM_SIZE_LEVELS),
			terrain: levelField("terrain", REALM_TERRAIN_LEVELS),
			climate: levelField("climate", REALM_CLIMATE_LEVELS),
			population: levelField("population", REALM_POPULATION_LEVELS),
			// `data-field="socialStructure"` (camelCase, matching the stored key) travels through the
			// template as a plain string, so the context key can stay lower-case like every other key
			// this sheet already exposes (`wardsdefensive`, `bookoftraits`) without the two needing to
			// agree on a casing convention.
			socialstructure: levelField("socialStructure", REALM_SOCIAL_STRUCTURE_LEVELS),
			interconnected: !!realm.interconnected,
			advancedtransport: !!realm.advancedTransport,
			sphereShifts: sphereShifts.map((shift, index) => ({
				index: index,
				sphere: typeof shift?.sphere === "string" ? shift.sphere : "",
				delta: Number.isInteger(shift?.delta) ? shift.delta : (parseInt(shift?.delta) || 0),
				options: [
					{ key: "", labelkey: "wod.chantry.realm.sphereshift.nosphere", selected: !shift?.sphere },
					...SPHERE_KEYS.map((sphereKey) => ({
						key: sphereKey,
						labelkey: `wod.spheres.${sphereKey}`,
						selected: shift?.sphere === sphereKey
					}))
				]
			})),
			upkeep: realmQuintessenceUpkeepPerDay(realm),

			// La puerta del censo del Nodo (D con roster re-homed): mismo patrón que el icono de
			// censo de un Rasgo de construcción, pero fuera del bucle de Rasgos porque el Nodo del
			// libro ya no vive bajo `system.traits`.
			roster: nodeRoster ? { ...nodeRoster } : null
		};
	}

	/**
	 * ONE `realm.nodes[]` entry's read-only display shape (`fix-chantry-foundry-sheet-parity`).
	 * Every field is OMITTED (not rendered blank) when absent — `hbs` gates each on its own
	 * `#if`. The power-level name comes from `NODE_POWER_LEVELS` (REGLA DE LA CASA, no book
	 * citation — `nodePowerLevelRow` degrades to `undefined` for an out-of-range level rather than
	 * throwing, so ONE bad Node never takes down the whole sheet). `named` is a SEPARATE, per-Node
	 * boolean (`:5782`, +5, book-cited) — never folded into the power-level name. Its own area-Traits
	 * reuse the SAME `wod.chantry.traitlevels.<key>.<level>` localized strings (name + cost +
	 * description in one) the Edificio's own Traits block already renders.
	 * @param {object} node  one `realm.nodes[]` entry
	 * @returns {object}
	 */
	_prepareNodeContext(node) {
		const powerLevelRow = nodePowerLevelRow(node?.powerLevel);
		const ownTraits = [];
		for (const key of ["guardian", "fortification", "wards", "trap-system", "alarm-system"]) {
			const level = node?.traits?.[key];
			if ((level === null) || (level === undefined)) continue;
			ownTraits.push({ key, labelkey: `wod.chantry.traits.${key}`, currentlabelkey: `wod.chantry.traitlevels.${key}.${parseInt(level)}` });
		}
		return {
			name: typeof node?.name === "string" ? node.name : "",
			description: typeof node?.description === "string" && node.description.trim() !== "" ? node.description : null,
			resonance: typeof node?.resonance === "string" && node.resonance.trim() !== "" ? node.resonance : null,
			powerLevelLabelkey: powerLevelRow ? `wod.chantry.realm.nodepowerlevels.${powerLevelRow.level}` : null,
			battery: !!node?.battery,
			tass: Number.isInteger(node?.tass) && node.tass > 0 ? node.tass : null,
			named: !!node?.named,
			wardsDefensiveLevels: Number.isInteger(node?.wardsDefensiveLevels) && node.wardsDefensiveLevels > 0 ? node.wardsDefensiveLevels : null,
			traits: ownTraits
		};
	}

	/**
	 * The Personnel block's render-ready shape (rebuild-chantry-book-of-chantries-only, design.md
	 * D4): `staffTier`/`staffLoyalty` as named-level `<select>`s sized to their own 5-row tables
	 * (same "not built" / real-level-0 distinction the seven Traits and the Realm+Node fields already
	 * use), `hereditaryStaff`/`military` as priced checkboxes, and `consorts` as a repeating-row list
	 * of `{powerLevel}` with no upper bound, the same repeating-row idiom `sphereShifts` already uses.
	 * @param {object} personnel  `actor.system.personnel ?? {}`
	 * @param {{used: number, allowed: number, over: boolean}} [staffTierRoster]  `rosters.staffTier`
	 *        from `evaluateItemRosters`, for the census door icon's tooltip
	 * @returns {object}
	 */
	_preparePersonnelContext(personnel, staffTierRoster) {
		const levelField = (field, table, keyPrefix) => {
			const raw = personnel[field];
			const level = ((raw === null) || (raw === undefined)) ? null : parseInt(raw);

			return {
				field: field,
				value: level,
				notbuilt: level === null,
				currentlabelkey: (level === null)
					? "wod.chantry.bookoftraits.notbuilt"
					: `wod.chantry.personnel.levels.${keyPrefix}.${level}`,
				options: table.map((points, index) => ({
					level: index,
					labelkey: `wod.chantry.personnel.levels.${keyPrefix}.${index}`,
					selected: level === index
				}))
			};
		};

		const consorts = Array.isArray(personnel.consorts) ? personnel.consorts : [];

		return {
			staffTier: levelField("staffTier", PERSONNEL_STAFF_TIER_LEVELS, "stafftier"),
			staffLoyalty: levelField("staffLoyalty", PERSONNEL_STAFF_LOYALTY_LEVELS, "staffloyalty"),
			hereditaryStaff: !!personnel.hereditaryStaff,
			military: !!personnel.military,
			// `fix-chantry-foundry-sheet-parity` task 3.2: `name`/`link` pass through — `name` alone
			// (no `characterId`) is a real, reachable shape (`chantryConsortSchema` types both
			// independently optional), so it must render with no link rather than erroring.
			consorts: consorts.map((consort, index) => ({
				index: index,
				powerLevel: Number.isInteger(consort?.powerLevel) ? consort.powerLevel : (parseInt(consort?.powerLevel) || 0),
				name: typeof consort?.name === "string" && consort.name.trim() !== "" ? consort.name : null,
				link: typeof consort?.link === "string" && consort.link.trim() !== "" ? consort.link : null
			})),
			consortsCost: computeConsortsCost(consorts),
			// La puerta del censo de `staffTier`: mismo patrón que el Nodo, fuera del bucle de
			// Rasgos porque el bloque Personal ya no vive bajo `system.traits`.
			roster: staffTierRoster ? { ...staffTierRoster } : null
		};
	}

	/**
	 * The Censo tab's Consortes group (`i-see-consortes-in-censo-tab`). Consortes are plain data on
	 * `system.personnel.consorts`, not embedded Items, so they never go through
	 * `buildConnectionGroups` — this hand-builds the SAME shape `v3/connections.hbs` already knows
	 * how to render for a real group's entries (`name`/portrait/`link`), but skips the Item-only
	 * parts of that markup entirely (no `feature_item.hbs`, no edit/chat/menu icons — a Consorte has
	 * no embedded-Item id for those actions to bind to; editing still happens on the Personal tab).
	 *
	 * Returns `null` when there are no Consortes, so the template can skip the whole block — an
	 * empty Consortes group would otherwise render a header with nothing under it.
	 * @param {Array<object>} [consorts] `actor.system.personnel.consorts`
	 * @returns {{label: string, count: number, entries: Array<object>}|null}
	 */
	_prepareConsortsCensusGroup(consorts) {
		const list = Array.isArray(consorts) ? consorts : [];
		if (list.length === 0) return null;

		return {
			label: game.i18n.localize("wod.chantry.personnel.consorts"),
			count: list.length,
			entries: list.map((consort) => {
				const portrait = typeof consort?.portrait === "string" && consort.portrait.trim() !== ""
					? consort.portrait
					: null;
				const link = typeof consort?.link === "string" && consort.link.trim() !== ""
					? consort.link
					: null;
				const powerLevel = Number.isInteger(consort?.powerLevel)
					? consort.powerLevel
					: (parseInt(consort?.powerLevel) || 0);

				return {
					name: typeof consort?.name === "string" && consort.name.trim() !== ""
						? consort.name
						: game.i18n.localize("wod.labels.new.connection"),
					portraitSrc: portrait ?? CENSUS_PERSON_PLACEHOLDER,
					hasPortrait: portrait !== null,
					link: link,
					// Mismo cálculo que `computeConsortsCost` hace por entrada, no una cifra nueva:
					// el «Puntos» de esta fila es exactamente lo que ESTA entrada añade al gasto de
					// la reserva (`chantry-effects.js`), nunca un cupo compartido — un Consorte no
					// tiene aforo de grupo, cada uno se paga por su cuenta.
					censuspoints: powerLevel * PERSONNEL_CONSORT_COST_PER_POWER_LEVEL
				};
			})
		};
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
	 * EL CENSO (add-chantry-roster-tab) — Items `Feature` `wod.types.connection`, no datos del actor
	 *
	 * El portador viejo (`system.traitRosters`, un array de objetos planos dentro del actor) se ha ido
	 * con sus cuatro handlers: `onRosterAdd`, `onRosterDelete`, `_rostersForWrite` y `_writeRoster`,
	 * más la rama `roster` del submit y `_rosterDescription`. Lo que los sustituye es UN handler de
	 * creación y nada más, porque todo lo demás lo dan los Items gratis: la hoja propia (`itemEdit`,
	 * ya registrado), el borrado (`itemDelete`, el propio de esta hoja, ya registrado), el ojo, el
	 * arrastre entre actores, el retrato y la descripción enriquecida.
	 *
	 * `normaliseRosters` NO se ha borrado de `chantry-effects.js`: es lo que lee la migración.
	 * ========================================================================================== */

	/**
	 * Crea una entrada de censo EN EL GRUPO desde el que se pulsó, estampándole su Rasgo.
	 *
	 * `system.relation` no se teclea nunca en el caso normal, y eso es una defensa, no una comodidad:
	 * en el PJ un error de tecleo solo cambia el título de un grupo, pero en la Capilla saca la entrada
	 * de la contabilidad de puntos sin decir nada — la forma recurrente «un valor aceptado que
	 * silenciosamente no hace nada» (D2.5). La otra mitad de esa defensa está en la pestaña: un
	 * `relation` que no es ninguna de las ocho claves se pinta en un grupo visible con aviso, en vez de
	 * desaparecer.
	 *
	 * NO ABRE DIÁLOGO. `CreateButtonsNotev2` ofrece Trasfondo, Mérito, Defecto… y una Capilla no puede
	 * tener ninguno de los tres.
	 *
	 * Y NO REUTILIZA `OnItemCreate`: ése desreferencia `this.actor.system.settings.variantsheet` sin
	 * `?.` (action-helpers.js:1122) y la Capilla es el único Actor de este sistema sin
	 * `system.settings`. Ver la nota del mapa `actions`.
	 */
	static async onCensusCreate(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const key = target?.dataset?.key;

		// El botón solo se renderiza dentro de un grupo de los ocho, así que esto no debería poder
		// fallar; se comprueba igual, porque el precio de equivocarse es una entrada que no cuenta
		// para nada y nadie ve.
		if (!ROSTER_TRAIT_KEYS.includes(key)) {
			ui.notifications.warn(game.i18n.localize("wod.chantry.roster.unassigned"));
			return;
		}

		await this.actor.createEmbeddedDocuments("Item", [censusItemData(key)]);
	}

	/* ==========================================================================================
	 * add-book-of-chantries-traits (task 5.2) — the Horizon Realm's `sphereShifts` array and the
	 * narrative-descriptor tag list. `system.realm`/`system.descriptors` (design.md D4/D6/D12).
	 * ========================================================================================== */

	/** Adds one blank `{sphere: "", delta: 1}` row — the same starting-row idiom `onPersonnelConsortAdd`
	 * below uses for the Personnel block's own repeating list. */
	static async onRealmSphereShiftAdd(event) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const shifts = foundry.utils.deepClone(this.actor.system.realm?.sphereShifts ?? []);
		shifts.push({ sphere: "", delta: 1 });

		const realm = { ...(this.actor.system.realm ?? {}), sphereShifts: shifts };

		await this.actor.update({
			"system.realm.sphereShifts": shifts,
			"system.pool.spent": this._computePoolSpent({ realm: realm })
		});
	}

	static async onRealmSphereShiftDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const shifts = foundry.utils.deepClone(this.actor.system.realm?.sphereShifts ?? []);

		if (!Number.isInteger(index) || (index < 0) || (index >= shifts.length)) return;

		shifts.splice(index, 1);

		const realm = { ...(this.actor.system.realm ?? {}), sphereShifts: shifts };

		await this.actor.update({
			"system.realm.sphereShifts": shifts,
			"system.pool.spent": this._computePoolSpent({ realm: realm })
		});
	}

	/**
	 * rebuild-chantry-book-of-chantries-only, design.md D4 — el bloque Personal's `consorts`, la
	 * ÚNICA lista de coste variable y sin tope del bloque (igual de abierta que `sphereShifts` del
	 * Reino, book-of-chantries-es.md:5911). Nace con `powerLevel: 1`, el mismo "no vacío" que
	 * `onRealmSphereShiftAdd` ya establece para su propia lista repetible.
	 */
	static async onPersonnelConsortAdd(event) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const consorts = foundry.utils.deepClone(this.actor.system.personnel?.consorts ?? []);
		consorts.push({ powerLevel: 1 });

		const personnel = { ...(this.actor.system.personnel ?? {}), consorts: consorts };

		await this.actor.update({
			"system.personnel.consorts": consorts,
			"system.pool.spent": this._computePoolSpent({ personnel: personnel })
		});
	}

	static async onPersonnelConsortDelete(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const index = Number(target.dataset.index);
		const consorts = foundry.utils.deepClone(this.actor.system.personnel?.consorts ?? []);

		if (!Number.isInteger(index) || (index < 0) || (index >= consorts.length)) return;

		consorts.splice(index, 1);

		const personnel = { ...(this.actor.system.personnel ?? {}), consorts: consorts };

		await this.actor.update({
			"system.personnel.consorts": consorts,
			"system.pool.spent": this._computePoolSpent({ personnel: personnel })
		});
	}

	/**
	 * Attaches the id currently selected in the picker's own `<select>` — the button carries no
	 * value of its own, so the value to act on lives in the sibling control it sits next to, same
	 * idiom `onCensusCreate` above uses for `target.dataset.key`. Recomputes `system.pool.spent`
	 * through `_computePoolSpent()` (reprice-chantry-descriptors, 2026-09-08) — descriptors carry a
	 * real, signed cost now, so attaching one changes the pool exactly like adding a Trait dot does.
	 */
	static async onDescriptorAdd(event, target) {
		event.preventDefault();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const picker = target.closest?.(".chantry-descriptor-picker")
			?.querySelector?.("select[data-descriptorpicker]");
		const id = picker?.value;
		if (!id) return;

		const descriptors = Array.isArray(this.actor.system.descriptors)
			? [...this.actor.system.descriptors]
			: [];

		if (descriptors.includes(id)) return;

		descriptors.push(id);

		await this.actor.update({
			"system.descriptors": descriptors,
			"system.pool.spent": this._computePoolSpent({ descriptors: descriptors })
		});
	}

	/** Detaches one descriptor id. Works for an UNKNOWN id too (design.md D16's documented gap) —
	 * filtering by exact string match needs no catalogue lookup at all. Recomputes
	 * `system.pool.spent` through `_computePoolSpent()` (reprice-chantry-descriptors, 2026-09-08),
	 * same reasoning as `onDescriptorAdd` above. */
	static async onDescriptorRemove(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (this.locked) {
			ui.notifications.warn(game.i18n.localize("wod.system.sheetlocked"));
			return;
		}

		const id = target.dataset.id;
		const descriptors = (Array.isArray(this.actor.system.descriptors) ? this.actor.system.descriptors : [])
			.filter((existing) => existing !== id);

		await this.actor.update({
			"system.descriptors": descriptors,
			"system.pool.spent": this._computePoolSpent({ descriptors: descriptors })
		});
	}
}
