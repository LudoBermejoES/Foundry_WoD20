#!/usr/bin/env node
/**
 * I12 — the fixture-render harness. Renders every PART of `PCActorSheet` for a fixture actor of
 * every STRUCTURE the config declares, and asserts each block that was included produced nodes.
 *
 *     node .github/scripts/test-part-render.mjs
 *     node .github/scripts/test-part-render.mjs --verbose      # per-structure detail
 *     node .github/scripts/test-part-render.mjs --quick        # splat baselines only, no variantsheet axis
 *
 * ===========================================================================================
 * WHY THIS EXISTS — the failure class nothing else in this repo can see
 * ===========================================================================================
 * An ApplicationV2 part only carries the context ITS OWN `prepare*Context` built. Move a template
 * include from one part to another and forget to move the context with it, and the block renders
 * EMPTY: no exception, no console warning, nothing in any log. The sheet hit this THREE TIMES in
 * the week of 2026-08-04 — the Spheres move, the Rote move, and a partial that existed on disk but
 * was never registered (which took a whole tab down) — and each was found by a human noticing
 * something missing.
 *
 * Every other gate in `preflight` passes while this is happening, and each for a good reason:
 *   system-preflight.py       reads the manifest and the import graph; templates are data to it
 *   js-syntax-check.sh        proves .js parses; skips .hbs entirely
 *   template-structure-check  reads a template against ITSELF (comments, nesting, registration)
 *   sheet-invariants.py       reads a template against the JS STATICALLY (actions, part ids, keys)
 *   binder-selector-check.py  proves the `_onRender` selectors are producible from the markup
 * None of them RUNS a preparer, so none of them can know that `context.rotes` is `undefined` on the
 * part that iterates it. That question only has an answer if the code executes.
 *
 * ===========================================================================================
 * WHAT IT ASSERTS  (lettered as the output prints them)
 * ===========================================================================================
 * A. THE FIXTURE CATALOGUE IS COMPLETE. `.github/fixtures/pc-items.json` is authored, so two derived
 *    cross-checks refuse to trust it: every `wod.types.*` literal in `pc-actor-sheet.js` — i.e. every
 *    sub-kind one of the nine preparers asks for — must have a fixture item, and every power-section
 *    id in `powertab.js` must have one too. Add a predicate to a preparer without a fixture and this
 *    goes red instead of the block never being exercised again.
 *
 * B. MATRIX COMPLETENESS. The structure list is ENUMERATED FROM `module/config.js` at check time and
 *    is never written down here (design D10): `wod.splat` (13), the seven `wod.variant` families (47)
 *    and `wod.era` (6). Three things fall out of that and each is checked rather than assumed:
 *      - every splat has a structure, and one the harness cannot build a fixture for is a hard
 *        failure naming it — covered or red, never quietly skipped;
 *      - the structural VARIANT branches are re-derived from the parsed templates, so the design's
 *        "there are exactly two" is measured every run and a third extends the matrix by itself;
 *      - era is enumerated ONCE, and the licence for that is re-derived too: every gate that reads
 *        `settings.era` must toggle a class rather than wrap markup. One that wraps markup makes era
 *        a structural axis and fails the build.
 *
 * C. THE PART RENDERED AT ALL. Each part must emit its `<section data-tab="…">` (or, for `tabs`, its
 *    `<nav>`), carrying the tab id the `PARTS` key names, with at least one element in it.
 *
 * D. MISSING CONTEXT KEY (the prize). The renderer is instrumented: every time a template resolves a
 *    path whose first segment is looked up on the PART CONTEXT (or on a partial context derived from
 *    it) and that segment is absent from the object, it is recorded with the structure, the part, the
 *    template file, the line and the key.
 *
 *    Measured on the ACTUAL render path, not statically, which is what removes the false positives a
 *    static scan would produce: a key read inside `{{#if actor.system.settings.hasrotes}}` is only
 *    "expected" on the structures that reach it. `key in obj` is the test, not
 *    `obj[key] !== undefined` — a preparer that deliberately writes `undefined`
 *    (`context.chimericalhealth`, `context.corpushealth` on the stats part) built the key and is not
 *    the bug, and the distinction is exactly what separates those two from the SAME two keys on the
 *    combat part, which are the bug.
 *
 * E. AN INCLUDED PARTIAL PRODUCED NOTHING. Every `{{> …}}` the shell's own gates decided to include
 *    must emit at least one element. This is the `(structure, part, selector, minCount)` table the
 *    task asks for, and it is DERIVED rather than authored: the shell decides membership, the harness
 *    only counts.
 *
 * F. ORPHAN SWEEP. An item on the fixture actor whose id appears in NO part's output renders nowhere.
 *    Failing only for the universal case (invisible on EVERY structure), because an item invisible on
 *    SOME structures is usually the sheet correctly declining to show another line's content.
 *
 * G. THE ALLOWLISTS STILL EARN THEIR PLACE. Four counted allowlists carry the pre-existing findings
 *    and print `::warning::` on every run, the shape `sheet-invariants.py` already uses. Each is also
 *    checked for STALENESS: an entry that stops firing fails the build, because a dead entry is a
 *    hole that would silently absorb the next occurrence of what it was written for.
 *
 * ===========================================================================================
 * WHAT IT CANNOT SEE — read this before trusting a green run
 * ===========================================================================================
 *  1. THERE IS NO DOM AND NO BROWSER. Assertions are string and regex measurements over the emitted
 *     HTML. "Produced a node" means "emitted an element tag"; it does NOT mean the element is
 *     visible, correctly nested, correctly styled, or reachable. Anything about layout, CSS,
 *     overflow or float leaks is invisible here and stays a human job (task 7.3).
 *  2. HANDLEBARS IS NOT VENDORED IN THIS REPO and no dependency may be added, so the renderer below
 *     is a SUBSET implementation, not Handlebars. Its honesty rests on one property, which is the
 *     single most important line in this file: **it throws on anything it does not understand.**
 *     Unknown block helper, unknown inline helper, unknown partial, unparseable mustache, unclosed
 *     block — all hard errors. It can therefore be incomplete, but it cannot silently render a
 *     construct as nothing and let a gap read as a pass. If a template starts using a Handlebars
 *     feature this does not implement, this file goes red and someone extends it.
 *  3. IT IS NOT A CONFORMANCE TEST FOR HANDLEBARS. Where the subset and real Handlebars could
 *     disagree on a construct that IS implemented, the harness would be wrong and quiet.
 *
 *     That risk has been MEASURED rather than argued, once, offline, on 2026-08-04. Every render
 *     this harness performs was repeated with real Handlebars 4.7.7 (from an unrelated checkout on
 *     the same machine — a one-off validation, never a dependency of this file) and the two outputs
 *     compared: **1384 of 1384 renders identical**, on the full 173-structure matrix. The remaining
 *     173 are the `powers` part, where real Handlebars THROWS on the `power_shapes.hbs:11` defect
 *     recorded in UNEVALUABLE_EXPRESSIONS below — which is how that defect was confirmed rather
 *     than merely suspected.
 *
 *     "Identical" there means after collapsing runs of whitespace. Byte-exactly, every render
 *     differs in INDENTATION ONLY: real Handlebars strips a line that holds nothing but a block
 *     mustache ("standalone" handling) and re-indents a partial's body to the include's column.
 *     Neither is implemented here and neither is worth implementing — no assertion in this file
 *     looks at whitespace. Anyone changing the renderer should redo that comparison; anyone relying
 *     on this file for anything whitespace-sensitive should not.
 *
 *     The implemented surface is small and was measured from the templates rather than guessed:
 *     `if`/`unless`/`each`/`with`, chained `{{else if}}`, subexpressions, block params, `../`,
 *     partials with hash args, dynamic partial names, and registered block helpers driving their
 *     own `options.fn`. Two Foundry-core helpers are reimplemented with a KNOWN divergence, spelled
 *     out at their definition: `and`/`or` drop the trailing options object before folding, where
 *     Foundry's own versions fold over it.
 *  4. `_onRender` IS NOT RUN. No event binder, no `SetupDotCounters_v2`, no drag/drop. I3/I4 are
 *     `binder-selector-check.py`'s job.
 *  5. NO COMPENDIUM. `buildTraitCompendiumUuidMap` and `resolveDescription` degrade to empty, which
 *     is their documented behaviour when a pack is absent — so eye icons that depend on a pack are
 *     not exercised here.
 *  6. ApplicationV2's real `DEFAULT_OPTIONS` merge is NOT reproduced; the stub merges own+inherited
 *     statics with the subclass winning. The design records that Foundry's actual behaviour is
 *     unverified. This harness needs `actions` and `dragDrop` to exist and asserts nothing about
 *     how they got there.
 *
 * WHY THE MODULE TREE IS COPIED: same reason as `test-secondability-id.mjs` — with no package.json
 * node parses `.js` under the CommonJS goal, so `module/` and `assets/` are copied verbatim beside a
 * `{"type":"module"}` marker and the code under test is a byte-identical copy.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const VERBOSE = process.argv.includes("--verbose");
const QUICK = process.argv.includes("--quick");

/* ------------------------------------------------------------------------------------------ *
 * COUNTED ALLOWLISTS. Each prints a ::warning:: on every run, the same shape sheet-invariants.py
 * uses. A finding that is admitted here is admitted OUT LOUD and keeps being counted.
 * ------------------------------------------------------------------------------------------ */

/**
 * Context keys a template reads that its part's preparer does not build — i.e. the very failure
 * this harness exists to catch — that were ALREADY PRESENT when it was written. Keyed
 * `part file:line key`.
 *
 * Every one of these was FOUND BY THIS HARNESS on its first run; none was known before. They are
 * admitted rather than fixed because this change may not touch templates or preparers, and they are
 * admitted INDIVIDUALLY and per site so that the gate still goes red for the next one — which is
 * the whole point of having it. Each prints on every run.
 */
const KNOWN_MISSING_KEYS = {
	// Empty on purpose, and it did not start that way. On this harness's first run it held ten
	// entries, and all ten were fixed rather than tolerated:
	//
	//   * `chimericalhealth` x7 and `corpushealth` on the COMBAT part. `stats_health.hbs` is
	//     included by both `stats_advantages.hbs` and `combat.hbs`, but only `prepareStatContext`
	//     built those two keys — so a changeling's chimerical damage marks came out blank on the
	//     Combat tab and a wraith's Corpus track did not draw at all, while both were correct one
	//     tab away. That is precisely why nobody had reported it.
	//   * `proseheadline` at `gear.hbs`, the only one of description.hbs's eleven callers that
	//     omitted it, so the Gear notes heading rendered as an empty emphasised div.
	//   * `shapeforms` at `feature.hbs`, a block gated on a key nothing in the system has ever
	//     built. It had never rendered, for any splat.
	//
	// The staleness check below is what forced each entry out as its defect was fixed, instead of
	// letting it sit here describing a problem that no longer exists.
};

/** Partials that legitimately emit nothing for some structure. Key: partial basename. */
const EMPTY_PARTIAL_OK = {
	// Renders the era label picker and the splat's own conditions; `spirit` (a creature variant)
	// removes the whole block by design — combat_conditions.hbs:1, one of the only two
	// `settings.variant` branches in the entire PC template set.
	"combat_conditions.hbs": "the `spirit` variant removes the block (combat_conditions.hbs:1)",
	// Renders one `<div>` per TEXTBOX splatfield. Only 4 of 13 splats declare bio splatfields at all
	// (design D9: `mortal` declares `{}` and eight declare nothing), and of those only wraith and
	// mage declare a textbox, so on most structures this correctly emits nothing.
	//
	// NOTE its sibling `bio_splatfields.hbs` is NOT here: it emits for every structure, because
	// `backfillDeclaredSplatfields` supplies the declared fields an actor never stored. The
	// staleness check below is what keeps that distinction accurate rather than assumed.
	"bio_splatboxes.hbs": "a textbox splatfield is declared for 2 of 13 splats (design D9)"
};

/**
 * Template expressions that real Handlebars REFUSES TO EVALUATE, admitted per site so the rest of
 * the part still renders. Keyed `file:line`; the recorded `head` must match exactly, so a different
 * mistake on the same line is still a hard failure.
 *
 * Nothing here is a harness limitation — each entry is a defect in the committed template, verified
 * against the real Handlebars compiler, and left alone only because fixing templates is out of this
 * change's scope. Deleting an entry when its template is fixed is the point.
 */
const UNEVALUABLE_EXPRESSIONS = {
	// Empty on purpose, and it did not start that way. Its two entries were
	// `power_shapes.hbs:11` and `:13`, which wrote `(actor.ShowTokenImage ../actor …)`. A
	// Handlebars sub-expression resolves its head as a HELPER NAME, and no helper of that name
	// was ever registered, so the compiler raised `Missing helper` and the exception took the
	// WHOLE Powers tab down for any actor holding a visible shapeform Trait — every werewolf and
	// every changing breed with a shape. This harness found it on its first run; the fix was to
	// register a real `showTokenImage` helper delegating to the Actor method that already
	// existed (`wod-actor-base.js:1888`), verified against real Handlebars 4.7.7 for all three
	// cases including an undefined actor. The staleness check below is what forced this entry to
	// be deleted rather than to outlive the defect.
};

/**
 * Item sub-kinds that are on the actor and render on NO part, on any structure. Both are already
 * diagnosed defects with open tasks; they are listed so the sweep keeps COUNTING them rather than
 * being switched off. Removing an entry when its task lands is the point, and the staleness check
 * in section G makes that mandatory rather than optional.
 *
 * Two of D9b's five "power axes render nowhere" cases are deliberately NOT here, for opposite
 * reasons, and both were re-measured by this harness:
 *   - mummy Hekau and exalted Charms cannot be listed at all: no `wod.types.hekau` or exalted-charm
 *     sub-kind EXISTS, so there is no document to put on a fixture actor. They are absent from the
 *     item vocabulary, not merely unrendered, which is a stronger statement than this sweep makes.
 *   - creature Charms DOES render now, on every structure. `wod.types.charm` was in D9b's list
 *     because `hascharms` had no writer a PC could reach; task 9.1 derives it from the items, and
 *     this harness renders the section for a fixture actor holding one. That fix is measured here.
 */
const RENDERS_NOWHERE = {
	"wod.types.sliver": "changeling `inanimae` Slivers — no section definition (D9b, task 9.2, pc-actor-sheet.js:1399)"
	/* `wod.types.specialadvantage` was here, and this harness is what proved it fixed: it now renders
	   on 173/173 structures, so the harness FAILED on the stale entry and made deleting it mandatory
	   rather than optional. Fixed 2026-08-25 by widening the Other Traits collector to a two-value
	   type list; reported from a live sheet where four of Carl el Cuervo's Special Advantages were
	   invisible. The register earning its keep in the other direction. */
};

/* ============================================================================================ *
 * 1. THE SANDBOX
 * ============================================================================================ */

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-part-render-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));
for (const dir of ["module", "assets"]) {
	fs.cpSync(path.join(REPO, dir), path.join(sandbox, dir), { recursive: true });
}
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

/* ============================================================================================ *
 * 2. FOUNDRY GLOBALS
 *
 * Installed BEFORE any import: `class X extends foundry.…` is evaluated at module load.
 * ============================================================================================ */

/**
 * DataModel field stubs. These exist so the fixture actor's `system` can be DERIVED from
 * `PCDataModel.defineSchema()` instead of being written down — a schema change then reaches the
 * fixture automatically. Only the seven field classes the datamodels actually use are implemented;
 * an eighth would throw at `new fields.Whatever(...)`, which is the intended failure.
 */
class Field {
	constructor(options = {}) { this.options = options ?? {}; }
	initialValue() {
		const init = this.options.initial;
		if (init === undefined) return this.fallback();
		return (typeof init === "function") ? init() : structuredClone(init);
	}
	fallback() { return undefined; }
}
class StringField extends Field { fallback() { return ""; } }
class HTMLField extends StringField {}
class NumberField extends Field { fallback() { return 0; } }
class BooleanField extends Field { fallback() { return false; } }
class ObjectField extends Field { fallback() { return {}; } }
class ArrayField extends Field {
	constructor(element, options = {}) { super(options); this.element = element; }
	initialValue() { return []; }
}
class SchemaField extends Field {
	constructor(fields, options = {}) { super(options); this.fields = fields; }
	initialValue() {
		const out = {};
		for (const [k, f] of Object.entries(this.fields)) out[k] = f.initialValue();
		return out;
	}
}

class StubDataModel { static defineSchema() { return {}; } }
class StubApplicationV2 {}

/** Enough of the mixin for the sheet's `super` calls to resolve. */
function HandlebarsApplicationMixin(Base) {
	return class extends Base {
		async _prepareContext() { return {}; }
		async _preparePartContext(partId, context) { return context; }
	};
}

/**
 * DocumentSheetV2 stub. `this.options` is the merged DEFAULT_OPTIONS chain because
 * `#createDragDropHandlers` reads `this.options.dragDrop` in the constructor. See caveat 6.
 */
class DocumentSheetV2 {
	constructor(options = {}) {
		const chain = [];
		for (let c = new.target; c && c !== Object; c = Object.getPrototypeOf(c)) {
			if (Object.hasOwn(c, "DEFAULT_OPTIONS")) chain.unshift(c.DEFAULT_OPTIONS);
		}
		this.options = Object.assign({}, ...chain, options);
		this.document = options.document;
	}
	get actor() { return this.document; }
}

const registeredHelpers = Object.create(null);
const registeredPartials = Object.create(null);

class SafeString {
	constructor(str) { this.string = String(str ?? ""); }
	toString() { return this.string; }
}

globalThis.Actor = class Actor { prepareData() {} updateEmbeddedDocuments() {} };
globalThis.Item = class Item {};
globalThis.FormApplication = class FormApplication { static get defaultOptions() { return {}; } };
globalThis.Application = class Application {};
globalThis.Hooks = { on() {}, once() {}, off() {}, call() {}, callAll() {} };
globalThis.Handlebars = {
	registerHelper(name, fn) { registeredHelpers[name] = fn; },
	registerPartial(name, tpl) { registeredPartials[name] = tpl; },
	SafeString,
	escapeExpression: (s) => escapeHTML(s)
};
const notifications = { warn: [], error: [], info: [] };
globalThis.ui = {
	notifications: {
		warn: (m) => notifications.warn.push(String(m)),
		error: (m) => notifications.error.push(String(m)),
		info: (m) => notifications.info.push(String(m))
	}
};
globalThis.game = {
	system: { version: "0.0.0-harness" },
	user: { isGM: true, id: "harnessuser00000" },
	// Returning the key unchanged is what game.i18n.localize() does for an unknown key. I11 (every
	// key resolves in EN and ES) is sheet-invariants.py's job; this harness is about STRUCTURE, so
	// it deliberately does not load a language file — a rendered i18n key is still a rendered node.
	i18n: { localize: (k) => String(k ?? ""), format: (k) => String(k ?? ""), translations: {} },
	settings: { get: () => undefined },
	packs: { get: () => undefined, contents: [] },
	actors: { get: () => undefined, contents: [], invalidDocumentIds: new Set() },
	items: { contents: [] },
	worldofdarkness: { icons: {}, powers: {} }
};
globalThis.CONFIG = { worldofdarkness: {}, Actor: { dataModels: {} }, Item: { dataModels: {} } };
globalThis.foundry = {
	abstract: { DataModel: StubDataModel, TypeDataModel: class TypeDataModel {} },
	data: {
		fields: {
			StringField, NumberField, BooleanField, ObjectField, ArrayField, SchemaField, HTMLField,
			FilePathField: StringField, ColorField: StringField, DocumentIdField: StringField
		}
	},
	utils: {
		// Foundry's `duplicate` is a JSON round trip, not structuredClone: it silently DROPS
		// functions rather than throwing on them, and several callers here hand it a live document.
		duplicate: (o) => JSON.parse(JSON.stringify(o ?? null)),
		mergeObject: (a, b) => Object.assign({}, a, b),
		setProperty: () => {},
		getProperty: () => undefined,
		randomID: () => "hrn" + (globalThis.__rid = (globalThis.__rid ?? 0) + 1).toString().padStart(13, "0")
	},
	applications: {
		api: { ApplicationV2: StubApplicationV2, HandlebarsApplicationMixin, DialogV2: class DialogV2 {} },
		sheets: { ActorSheetV2: DocumentSheetV2, ItemSheetV2: DocumentSheetV2 },
		ux: {
			// The real enricher rewrites @UUID links; nothing here depends on that, and returning the
			// text unchanged keeps whatever the fixture wrote visible in the output.
			TextEditor: { implementation: { enrichHTML: async (s) => String(s ?? "") } },
			DragDrop: class DragDrop { constructor(o) { Object.assign(this, o); } bind() {} }
		}
	}
};
globalThis.fromUuidSync = () => null;
globalThis.fromUuid = async () => null;

/* ============================================================================================ *
 * 3. LOAD THE REAL SYSTEM AND BUILD CONFIG THE WAY wod.js DOES
 * ============================================================================================ */

// Returns a `file://` href, not a path: `M` is used EXCLUSIVELY as the argument of a dynamic
// `import()` (verified: there is no other use), and on Windows an absolute path like C:\... is
// not a valid ESM specifier for the default loader.
const M = (...p) => pathToFileURL(path.join(sandbox, "module", ...p)).href;

const { wod } = await import(M("config.js"));
const templatesModule = await import(M("templates.js"));
const IconHelper = (await import(M("ui", "icons.js"))).default;
const { registerHandlebarsHelpers } = await import(M("handlebars.js"));
const { WoDActor } = await import(M("actor", "data", "wod-actor-base.js"));
const PCDataModel = (await import(M("actor", "datamodel", "pc-actor-datamodel.js"))).default;
const itemModels = await import(M("items", "datamodel", "_module.js"));
const sheetModule = await import(M("actor", "template", "pc-actor-sheet.js"));
const PCActorSheet = sheetModule.default;

/*
 * EVERY sheet in the PCActorSheet family, not just the base one.
 *
 * This harness hard-coded `PCActorSheet.PARTS` until 7.5.57, which meant it rendered the v2
 * templates and nothing else — so the first three parts migrated to `PCActorSheetV3` shipped
 * WITHOUT the one check that catches a template reading a context key its preparer never built.
 * That is the exact failure this file exists for, and it has shipped three times on this sheet.
 *
 * Discovered by the same person who wrote the third migration, who patched the harness by hand to
 * check their own work and then said so rather than relying on a green run that proved nothing
 * about what they had written.
 *
 * Discovery is by DIRECTORY, the way binder-selector-check.py does it: any `pc-actor-sheet*.js`
 * whose default export has a `PARTS` object. A fourth sheet is covered the day it is written, with
 * no edit here — which is the property that failed the first time.
 */
const SHEETS = [];
{
	const dir = path.join(sandbox, "module", "actor", "template");
	const files = fs.readdirSync(dir).filter(f => /^pc-actor-sheet.*\.js$/.test(f)).sort();

	for (const f of files) {
		const mod = await import(M("actor", "template", f));
		const cls = mod.default;

		if (cls?.PARTS && typeof cls.PARTS === "object") {
			SHEETS.push({ name: cls.name || f, cls });
		}
	}

	if (SHEETS.length === 0) {
		console.error("test-part-render: found no sheet with a PARTS object — refusing to pass");
		process.exit(2);
	}
}

CONFIG.worldofdarkness = wod;
Object.assign(CONFIG.worldofdarkness, templatesModule.SetupBioTab(), templatesModule.SetupPowerTab());
CONFIG.worldofdarkness.sheetv2 = Object.assign({},
	templatesModule.SetupBioTab(), templatesModule.SetupPowerTab());
Object.assign(CONFIG.worldofdarkness, {
	attributeSettings: "20th",
	rollSettings: true,
	successesToDamageRolls: false,
	fifthEditionWillpowerSetting: false,
	willpowerBonusDice: 0,
	virtuesLimit: 5,
	specialityLevel: 4,
	demonSystemSettings: "",
	demonEvocationTorment: false,
	hunteredgeSettings: "",
	wererwolfrageSettings: "",
	handleOnes: 1, usehandleOnes: true,
	useOnesDamage: false, usePenaltyDamage: false, useOnesSoak: false,
	lowestDifficulty: 2,
	specialityAddSuccess: 2, usespecialityAddSuccess: true,
	specialityReduceDiff: 0, usespecialityReduceDiff: false,
	specialityAllowBotch: true,
	tenAddSuccess: 0, usetenAddSuccess: false,
	explodingDice: "never", useexplodingDice: false,
	defaultMortalEra: "modern", defaultMageEra: "modern",
	defaultVampireEra: "modern", defaultWerewolfEra: "modern",
	observersSeeFullActor: "full", limitedSeeFullActor: "full"
});
CONFIG.Actor.dataModels.PC = PCDataModel;
CONFIG.Item.dataModels.Ability = itemModels.AbilityDataModel;
CONFIG.Item.dataModels.Advantage = itemModels.AdvantageDataModel;
CONFIG.Item.dataModels.Sphere = itemModels.SphereDataModel;
CONFIG.Item.dataModels.Splat = itemModels.SplatDataModel;
CONFIG.Item.dataModels.Realm = itemModels.RealmDataModel;

game.worldofdarkness.bio = templatesModule.SetupBio();
game.worldofdarkness.abilities = templatesModule.SetupAbilities();
for (const race in CONFIG.worldofdarkness.sheettype) {
	game.worldofdarkness.icons[race] = Object.assign({}, IconHelper.GetIconlist(race));
}
game.worldofdarkness.icons.black = Object.assign({}, IconHelper.GetIconlist("black"));

/**
 * The helpers Foundry and Handlebars provide, which the system does NOT register and which are
 * therefore not available from the real source. They are reimplemented here, and this is the one
 * place in the harness where behaviour is asserted rather than executed — see caveat 3.
 *
 * `gt`/`lt`/`gte`/`lte` are raw JS relational operators, which is what makes `gt "1 a 5" 0` false
 * (NaN comparison). That behaviour is not a guess: it is what the `pointValue` helper's own source
 * comment in module/handlebars.js records about Foundry core, and pointValue exists because of it.
 *
 * `and`/`or` DROP the trailing options object before folding. Foundry's own implementations fold
 * over `arguments`, which includes that object; for `or` that would make the result unconditionally
 * true. The sane semantics are used here and the divergence is recorded rather than hidden — it
 * reaches exactly one gate in the PC templates (effects.hbs:22, a CSS class on the toggle icon).
 */
function popOptions(args) {
	const last = args[args.length - 1];
	return (last && typeof last === "object" && "hash" in last && "name" in last) ? args.slice(0, -1) : args.slice();
}
Handlebars.registerHelper("eq", (...a) => { const v = popOptions(a); return v.every((x) => x === v[0]); });
Handlebars.registerHelper("ne", (...a) => { const v = popOptions(a); return !v.every((x) => x === v[0]); });
Handlebars.registerHelper("lt", (...a) => { const v = popOptions(a); return v.slice(1).every((x, i) => v[i] < x); });
Handlebars.registerHelper("gt", (...a) => { const v = popOptions(a); return v.slice(1).every((x, i) => v[i] > x); });
Handlebars.registerHelper("lte", (...a) => { const v = popOptions(a); return v.slice(1).every((x, i) => v[i] <= x); });
Handlebars.registerHelper("gte", (...a) => { const v = popOptions(a); return v.slice(1).every((x, i) => v[i] >= x); });
Handlebars.registerHelper("not", (...a) => !popOptions(a).every(Boolean));
Handlebars.registerHelper("and", (...a) => popOptions(a).every(Boolean));
Handlebars.registerHelper("or", (...a) => popOptions(a).some(Boolean));
Handlebars.registerHelper("localize", (value, options) => {
	const key = String(value ?? "");
	const hash = options?.hash ?? {};
	return Object.keys(hash).length ? game.i18n.format(key, hash) : game.i18n.localize(key);
});
Handlebars.registerHelper("lookup", (obj, field) => (obj === null || obj === undefined) ? undefined : obj[field]);
/**
 * Foundry's `{{editor}}`. Added when this harness grew section H: the Chantry sheet's Rasgos tab is
 * the ONLY `.hbs` in the tree that uses it (every other caller is a legacy appv1 `.html`), so until
 * then no render here had ever reached it — and an unimplemented helper THROWS, which is the
 * property that makes this harness honest.
 *
 * Faithful to the SHAPE Foundry emits, which is all any assertion here looks at: a `.editor`
 * wrapper, an `.editor-content` carrying `data-edit` with the target path, and the (already
 * enriched) content. The real helper also emits a ProseMirror toolbar and, when `button` is true, a
 * launch button; `button=false` at every call site in this tree, so that branch is not reproduced.
 * `editable` decides whether the content is an editing surface, and this reflects it as an
 * attribute rather than inventing markup for it.
 */
Handlebars.registerHelper("editor", (value, options) => {
	const hash = options?.hash ?? {};
	const target = escapeHTML(hash.target ?? "");
	const editable = hash.editable === undefined ? true : !!hash.editable;
	const content = (value === null || value === undefined) ? "" : String(value);

	return new SafeString(
		`<div class="editor">` +
		`<div class="editor-content" data-edit="${target}"${editable ? "" : " data-locked=\"true\""}>${content}</div>` +
		`</div>`);
});
/**
 * Foundry's `selectOptions`. Only the shape bio_splatfields.hbs uses is implemented (a choices
 * object or array, `selected` and `localize` in the hash); an unrecognised choices value throws
 * rather than emitting nothing, so a listData shape change cannot pass as "the select is empty".
 */
Handlebars.registerHelper("selectOptions", (choices, options) => {
	const hash = options?.hash ?? {};
	if (choices === null || choices === undefined) return new SafeString("");
	let entries;
	if (Array.isArray(choices)) {
		entries = choices.map((c) => (c && typeof c === "object")
			? [c[hash.valueAttr ?? "value"] ?? c.key ?? "", c[hash.labelAttr ?? "label"] ?? c.name ?? ""]
			: [c, c]);
	}
	else if (typeof choices === "object") entries = Object.entries(choices);
	else throw new TemplateError(`selectOptions was handed a ${typeof choices}, which it cannot enumerate`);

	const selected = String(hash.selected ?? "");
	const doLocalize = hash.localize !== false;
	let out = hash.blank !== undefined ? `<option value="">${escapeHTML(hash.blank)}</option>` : "";
	for (const [value, label] of entries) {
		const text = doLocalize ? game.i18n.localize(String(label ?? "")) : String(label ?? "");
		out += `<option value="${escapeHTML(value)}"${String(value) === selected ? " selected" : ""}>${escapeHTML(text)}</option>`;
	}
	return new SafeString(out);
});

// The REAL helper bodies, registered through the real registration function. Registered LAST so a
// system helper always wins over a builtin of the same name, as it would in Foundry.
registerHandlebarsHelpers();

// `dtSvgDie` and the dice partials are registered in wod.js's `init` hook rather than in
// handlebars.js, so they are reproduced here from that source (wod.js:421-449). Kept verbatim.
Handlebars.registerHelper("dtSvgDie", (icon, sheettype, options) => {
	if ((options != "") && (options != undefined)) sheettype = options;
	if (!sheettype || sheettype === "") sheettype = "mortal";
	sheettype = sheettype.toLowerCase().replace(" ", "");
	if (sheettype === "pc") sheettype = "mortal";
	return `${sheettype}_${icon.toLowerCase()}Svg`;
});
for (const [race, iconlist] of Object.entries(game.worldofdarkness.icons)) {
	for (const icon of Object.entries(iconlist)) {
		Handlebars.registerPartial(`${race}_${icon[0]}Svg`, icon[1]);
	}
}

/* ============================================================================================ *
 * 4. THE RENDERER
 *
 * A strict Handlebars SUBSET. Read caveat 2 in the header before changing anything here: the
 * property that makes it usable as a gate is that every unknown construct THROWS.
 * ============================================================================================ */

function escapeHTML(value) {
	if (value === null || value === undefined) return "";
	if (value instanceof SafeString || (value && typeof value === "object" && typeof value.string === "string")) {
		return value.string;
	}
	return String(value)
		.replace(/&(?!\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/`/g, "&#x60;").replace(/=/g, "&#x3D;");
}

class TemplateError extends Error {}

/* ---------------------------------- 4a. Parser ---------------------------------------------- */

/** Split a template into text and mustache tokens, carrying the source line of each. */
function tokenize(src, file) {
	const tokens = [];
	let i = 0, textStart = 0;
	const lineAt = (idx) => src.slice(0, idx).split("\n").length;

	while (i < src.length) {
		const open = src.indexOf("{{", i);
		if (open === -1) break;

		if (open > textStart) tokens.push({ kind: "text", value: src.slice(textStart, open) });

		// Comments
		if (src.startsWith("{{!--", open)) {
			const end = src.indexOf("--}}", open);
			if (end === -1) throw new TemplateError(`${file}:${lineAt(open)}: unterminated {{!-- comment`);
			i = textStart = end + 4;
			continue;
		}
		if (src.startsWith("{{!", open)) {
			const end = src.indexOf("}}", open);
			if (end === -1) throw new TemplateError(`${file}:${lineAt(open)}: unterminated {{! comment`);
			i = textStart = end + 2;
			continue;
		}

		const triple = src.startsWith("{{{", open);
		const bodyStart = open + (triple ? 3 : 2);
		const closer = triple ? "}}}" : "}}";

		// Scan for the closer, ignoring one inside a quoted literal.
		let j = bodyStart, quote = null, end = -1;
		while (j < src.length) {
			const ch = src[j];
			if (quote) { if (ch === quote) quote = null; j++; continue; }
			if (ch === "'" || ch === '"') { quote = ch; j++; continue; }
			if (src.startsWith(closer, j)) { end = j; break; }
			j++;
		}
		if (end === -1) throw new TemplateError(`${file}:${lineAt(open)}: unterminated mustache`);

		tokens.push({
			kind: "mustache",
			raw: src.slice(bodyStart, end).trim(),
			escaped: !triple,
			line: lineAt(open),
			file
		});
		i = textStart = end + closer.length;
	}
	if (textStart < src.length) tokens.push({ kind: "text", value: src.slice(textStart) });
	return tokens;
}

/** Split an expression body into top-level atoms, respecting quotes and parentheses. */
function splitAtoms(body, file, line) {
	const atoms = [];
	let cur = "", depth = 0, quote = null;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
		if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
		if (ch === "(") { depth++; cur += ch; continue; }
		if (ch === ")") { depth--; cur += ch; if (depth < 0) throw new TemplateError(`${file}:${line}: unbalanced ) in {{${body}}}`); continue; }
		if (/\s/.test(ch) && depth === 0) { if (cur !== "") { atoms.push(cur); cur = ""; } continue; }
		cur += ch;
	}
	if (depth !== 0) throw new TemplateError(`${file}:${line}: unbalanced ( in {{${body}}}`);
	if (quote) throw new TemplateError(`${file}:${line}: unterminated string in {{${body}}}`);
	if (cur !== "") atoms.push(cur);
	return atoms;
}

/** Parse one atom into an evaluable node. */
function parseAtom(atom, file, line) {
	if (atom.startsWith("(") && atom.endsWith(")")) {
		return { kind: "sub", expr: parseExpression(atom.slice(1, -1), file, line) };
	}
	if ((atom.startsWith("'") && atom.endsWith("'")) || (atom.startsWith('"') && atom.endsWith('"'))) {
		return { kind: "literal", value: atom.slice(1, -1) };
	}
	if (/^-?\d+(\.\d+)?$/.test(atom)) return { kind: "literal", value: Number(atom) };
	if (atom === "true") return { kind: "literal", value: true };
	if (atom === "false") return { kind: "literal", value: false };
	if (atom === "null") return { kind: "literal", value: null };
	if (atom === "undefined") return { kind: "literal", value: undefined };
	return { kind: "path", path: atom, file, line };
}

/**
 * `head arg1 arg2 key=value`. `head` may itself be a subexpression only for partials, where
 * Handlebars calls it a dynamic partial name.
 */
function parseExpression(body, file, line) {
	const atoms = splitAtoms(body, file, line);
	if (atoms.length === 0) throw new TemplateError(`${file}:${line}: empty mustache`);

	const head = atoms[0];
	const params = [];
	const hash = {};
	for (const atom of atoms.slice(1)) {
		const eq = topLevelEquals(atom);
		if (eq > 0) hash[atom.slice(0, eq)] = parseAtom(atom.slice(eq + 1), file, line);
		else params.push(parseAtom(atom, file, line));
	}
	return { head, headNode: parseAtom(head, file, line), params, hash, file, line, body };
}

/** Index of a top-level `=` in `key=value`, or -1. Quotes and parens do not count. */
function topLevelEquals(atom) {
	let depth = 0, quote = null;
	for (let i = 0; i < atom.length; i++) {
		const ch = atom[i];
		if (quote) { if (ch === quote) quote = null; continue; }
		if (ch === "'" || ch === '"') { quote = ch; continue; }
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		else if (ch === "=" && depth === 0 && i > 0 && atom[i - 1] !== "!" && atom[i + 1] !== "=") return i;
	}
	return -1;
}

/** Strip a trailing `as |a b|` off a block's expression body and return the names. */
function takeBlockParams(body) {
	const m = /\bas\s*\|([^|]*)\|\s*$/.exec(body);
	if (!m) return { body, blockParams: [] };
	return { body: body.slice(0, m.index).trim(), blockParams: m[1].trim().split(/\s+/).filter(Boolean) };
}

/**
 * Build the AST for one template body.
 *
 * A block's body is read as SECTIONS separated by `{{else}}` / `{{else if …}}`, then folded from the
 * back into nested if-nodes — which is exactly what Handlebars does with a chained else, and is far
 * easier to get right than threading the chain through the recursion.
 */
function parseProgram(tokens, state, file, closingFor = null) {
	const nodes = [];
	while (state.i < tokens.length) {
		const tok = tokens[state.i];
		if (tok.kind === "text") { nodes.push(tok); state.i++; continue; }

		const raw = tok.raw;

		if (raw.startsWith("/")) {
			const name = raw.slice(1).trim();
			if (closingFor === null) throw new TemplateError(`${tok.file}:${tok.line}: {{/${name}}} closes nothing`);
			if (name !== closingFor) {
				throw new TemplateError(`${tok.file}:${tok.line}: {{/${name}}} does not close {{#${closingFor}}}`);
			}
			state.i++;
			return { nodes, terminator: "close" };
		}

		if (raw === "else" || raw.startsWith("else ")) {
			if (closingFor === null) throw new TemplateError(`${tok.file}:${tok.line}: {{else}} outside a block`);
			return { nodes, terminator: "else", elseToken: tok };
		}

		if (raw.startsWith("#")) {
			const { body, blockParams } = takeBlockParams(raw.slice(1).trim());
			const expr = parseExpression(body, tok.file, tok.line);
			state.i++;

			// Read the sections.
			const sections = [];
			let cursor = { expr, blockParams, line: tok.line, file: tok.file };
			for (;;) {
				const seg = parseProgram(tokens, state, file, expr.head);
				sections.push({ ...cursor, nodes: seg.nodes });
				if (seg.terminator === "close") break;

				const et = seg.elseToken;
				state.i++;
				const rest = et.raw.slice(4).trim();
				// Handlebars allows exactly one plain {{else}} per block and it must be LAST. Accepting
				// anything after one would render a branch the real compiler rejects outright.
				if (sections.some((x) => x.expr === null)) {
					throw new TemplateError(`${et.file}:${et.line}: {{else${rest ? " " + rest : ""}}} follows a plain {{else}} in one {{#${expr.head}}} block`);
				}
				if (rest === "") { cursor = { expr: null, blockParams: [], line: et.line, file: et.file }; continue; }
				const chainName = rest.split(/\s+/)[0];
				if (chainName !== "if" && chainName !== "unless") {
					throw new TemplateError(`${et.file}:${et.line}: unsupported chained else "{{else ${rest}}}"`);
				}
				const chained = takeBlockParams(rest.slice(chainName.length).trim());
				cursor = {
					expr: parseExpression(`${chainName} ${chained.body}`, et.file, et.line),
					blockParams: chained.blockParams, line: et.line, file: et.file
				};
			}

			// Fold from the back: the last section is the innermost inverse.
			let inverse = null;
			for (let k = sections.length - 1; k >= 1; k--) {
				const s = sections[k];
				if (s.expr === null) { inverse = s.nodes; continue; }   // a plain {{else}} tail
				inverse = [{
					kind: "block", name: s.expr.head, expr: s.expr, blockParams: s.blockParams,
					program: s.nodes, inverse, file: s.file, line: s.line
				}];
			}
			nodes.push({
				kind: "block", name: expr.head, expr, blockParams,
				program: sections[0].nodes, inverse,
				file: tok.file, line: tok.line
			});
			continue;
		}

		if (raw.startsWith(">")) {
			nodes.push({ kind: "partial", expr: parseExpression(raw.slice(1).trim(), tok.file, tok.line), file: tok.file, line: tok.line });
			state.i++;
			continue;
		}

		if (raw.startsWith("^")) {
			throw new TemplateError(`${tok.file}:${tok.line}: inverted sections ({{^…}}) are not implemented`);
		}

		nodes.push({ kind: "mustache", expr: parseExpression(raw, tok.file, tok.line), escaped: tok.escaped, file: tok.file, line: tok.line });
		state.i++;
	}
	if (closingFor !== null) throw new TemplateError(`${file}: unclosed {{#${closingFor}}}`);
	return { nodes, terminator: "close" };
}

const parseCache = new Map();
function compile(templatePath) {
	if (parseCache.has(templatePath)) return parseCache.get(templatePath);
	const src = fs.readFileSync(templatePath, "utf8");
	const rel = path.relative(REPO, templatePath);
	const tokens = tokenize(src, rel);
	const program = parseProgram(tokens, { i: 0 }, rel, null).nodes;
	parseCache.set(templatePath, program);
	return program;
}

/* ---------------------------------- 4b. Evaluator -------------------------------------------- */

/** Marks a context object as "derived from the part context", i.e. one the probe watches. */
const ROOTISH = Symbol("rootish");

/** Handlebars' own emptiness rule: false, undefined, null, "", 0 and [] are all falsy. */
function isTruthy(value) {
	if (Array.isArray(value)) return value.length > 0;
	return !!value;
}

class Frame {
	constructor(ctx, parent = null, blockParams = null) {
		this.ctx = ctx;
		this.parent = parent;
		this.blockParams = blockParams;
	}
	lookupBlockParam(name) {
		for (let f = this; f; f = f.parent) {
			if (f.blockParams && Object.hasOwn(f.blockParams, name)) return { found: true, value: f.blockParams[name] };
		}
		return { found: false };
	}
}

class Renderer {
	constructor(partId, structureId, findings) {
		this.partId = partId;
		this.structureId = structureId;
		this.findings = findings;   // { missingKeys: [], partialOutput: [] }
		this.partialStack = [];
	}

	/* -------- path resolution, with the missing-key probe -------- */

	resolvePath(pathStr, frame) {
		let rest = pathStr;
		let f = frame;
		while (rest.startsWith("../")) {
			rest = rest.slice(3);
			f = f.parent ?? f;
		}
		if (rest === "." || rest === "this") return f.ctx;
		if (rest.startsWith("./")) rest = rest.slice(2);
		if (rest.startsWith("this.")) rest = rest.slice(5);

		const segments = rest.split(".");
		const first = segments[0];

		const bp = f.lookupBlockParam(first);
		let value;
		if (bp.found) value = bp.value;
		else {
			const base = f.ctx;
			if (base !== null && typeof base === "object" && base[ROOTISH] && !(first in base)) {
				this.recordMissingKey(first, pathStr);
			}
			value = (base === null || base === undefined) ? undefined : base[first];
		}

		for (const seg of segments.slice(1)) {
			if (value === null || value === undefined) return undefined;
			value = value[seg];
		}
		return value;
	}

	recordMissingKey(key, pathStr) {
		const site = this.currentSite ?? { file: "?", line: 0 };
		this.findings.missingKeys.push({
			structure: this.structureId, part: this.partId,
			file: site.file, line: site.line, key, path: pathStr
		});
	}

	/* -------- expression evaluation -------- */

	evalNode(node, frame) {
		if (node.kind === "literal") return node.value;
		if (node.kind === "path") return this.resolvePath(node.path, frame);
		if (node.kind === "sub") return this.evalExpression(node.expr, frame, null);
		throw new TemplateError(`unknown node kind ${node.kind}`);
	}

	buildOptions(expr, frame, block) {
		const hash = {};
		for (const [k, v] of Object.entries(expr.hash)) hash[k] = this.evalNode(v, frame);
		return {
			name: expr.head,
			hash,
			data: { root: this.rootContext },
			fn: block ? block.fn : undefined,
			inverse: block ? block.inverse : (() => "")
		};
	}

	/**
	 * Evaluate `head params hash`. Handlebars' ambiguous-resolution order is block param, then
	 * registered helper, then context path — and a head WITH arguments that is neither a helper nor
	 * a function on the context is an error, which is what makes this strict.
	 */
	evalExpression(expr, frame, block) {
		this.currentSite = { file: expr.file, line: expr.line };
		const head = expr.head;
		const hasArgs = expr.params.length > 0 || Object.keys(expr.hash).length > 0 || block !== null;

		const bp = frame.lookupBlockParam(head);
		if (bp.found && !hasArgs) return bp.value;

		const helper = registeredHelpers[head];
		const params = expr.params.map((p) => this.evalNode(p, frame));

		if (helper) {
			const options = this.buildOptions(expr, frame, block);
			return helper.apply(frame.ctx, [...params, options]);
		}

		// A dotted head with args: Handlebars resolves the path and calls it if it is a function.
		// `power_shapes.hbs:11` does exactly this with `actor.ShowTokenImage`.
		const resolved = this.resolvePath(head, frame);
		if (hasArgs) {
			if (typeof resolved === "function") {
				const options = this.buildOptions(expr, frame, block);
				const receiver = head.includes(".") ? this.resolvePath(head.split(".").slice(0, -1).join("."), frame) : frame.ctx;
				return resolved.apply(receiver, [...params, options]);
			}
			const admitted = UNEVALUABLE_EXPRESSIONS[`${expr.file}:${expr.line}`];
			if (admitted && admitted.head === head) {
				this.findings.unevaluable.push({ site: `${expr.file}:${expr.line}`, head, structure: this.structureId, part: this.partId });
				return undefined;
			}
			throw new TemplateError(
				`${expr.file}:${expr.line}: "${head}" is used as a helper with arguments but is neither a ` +
				`registered helper nor a function on the context — Handlebars would raise "Missing helper"`);
		}
		return resolved;
	}

	/* -------- rendering -------- */

	renderProgram(nodes, frame) {
		let out = "";
		for (const node of nodes) out += this.renderNode(node, frame);
		return out;
	}

	renderNode(node, frame) {
		if (node.kind === "text") return node.value;
		if (node.kind === "mustache") {
			const value = this.evalExpression(node.expr, frame, null);
			if (value === null || value === undefined) return "";
			return node.escaped ? escapeHTML(value) : String(value instanceof SafeString ? value.string : value);
		}
		if (node.kind === "block") return this.renderBlock(node, frame);
		if (node.kind === "partial") return this.renderPartial(node, frame);
		throw new TemplateError(`unknown node kind ${node.kind}`);
	}

	renderBlock(node, frame) {
		const self = this;
		const name = node.name;

		// For a block, `expr.head` is the block helper's NAME and `expr.params` are its arguments.
		this.currentSite = { file: node.file, line: node.line };
		const arg0 = () => {
			if (node.expr.params.length === 0) {
				throw new TemplateError(`${node.file}:${node.line}: {{#${name}}} takes an argument and was given none`);
			}
			return this.evalNode(node.expr.params[0], frame);
		};

		if (name === "if" || name === "unless") {
			const value = arg0();
			const take = (name === "if") ? isTruthy(value) : !isTruthy(value);
			if (take) return this.renderProgram(node.program, frame);
			return node.inverse ? this.renderProgram(node.inverse, frame) : "";
		}

		if (name === "with") {
			const value = arg0();
			if (!isTruthy(value)) return node.inverse ? this.renderProgram(node.inverse, frame) : "";
			const bp = {};
			if (node.blockParams[0]) bp[node.blockParams[0]] = value;
			return this.renderProgram(node.program, new Frame(value, frame, bp));
		}

		if (name === "each") {
			const value = arg0();
			const entries = Array.isArray(value)
				? value.map((v, i) => [v, i])
				: (value && typeof value === "object" ? Object.entries(value).map(([k, v]) => [v, k]) : []);
			if (entries.length === 0) return node.inverse ? this.renderProgram(node.inverse, frame) : "";
			let out = "";
			for (const [item, key] of entries) {
				const bp = {};
				if (node.blockParams[0]) bp[node.blockParams[0]] = item;
				if (node.blockParams[1]) bp[node.blockParams[1]] = key;
				out += this.renderProgram(node.program, new Frame(item, frame, bp));
			}
			return out;
		}

		// Every other block helper is a REGISTERED one; it receives `options.fn`/`options.inverse`
		// and controls its own iteration (numLoop, numFromLoop, numDownToLoop, SvgHtml).
		if (!registeredHelpers[name]) {
			throw new TemplateError(`${node.file}:${node.line}: {{#${name}}} is not a registered block helper`);
		}
		const block = {
			fn(ctx, opts) {
				const bp = {};
				const params = opts?.blockParams ?? [];
				node.blockParams.forEach((n, idx) => { bp[n] = params[idx]; });
				return self.renderProgram(node.program, new Frame(ctx === undefined ? frame.ctx : ctx, frame, bp));
			},
			inverse(ctx) {
				return node.inverse ? self.renderProgram(node.inverse, new Frame(ctx === undefined ? frame.ctx : ctx, frame)) : "";
			}
		};
		const params = node.expr.params.map((p) => this.evalNode(p, frame));
		const options = this.buildOptions(node.expr, frame, block);
		const result = registeredHelpers[name].apply(frame.ctx, [...params, options]);
		return (result === null || result === undefined) ? "" : String(result);
	}

	renderPartial(node, frame) {
		this.currentSite = { file: node.file, line: node.line };

		// The name is either a literal path, a bare identifier, or a dynamic subexpression.
		let name;
		if (node.expr.headNode.kind === "literal") name = String(node.expr.headNode.value);
		else if (node.expr.headNode.kind === "sub") name = String(this.evalNode(node.expr.headNode, frame));
		else name = node.expr.head;

		// Hash args extend the current context, exactly as Handlebars does for a partial.
		let ctx = frame.ctx;
		const hashKeys = Object.keys(node.expr.hash);
		if (node.expr.params.length > 0) {
			ctx = this.evalNode(node.expr.params[0], frame);
		}
		if (hashKeys.length > 0) {
			const derived = Object.create(ctx === null || ctx === undefined ? null : ctx);
			for (const k of hashKeys) derived[k] = this.evalNode(node.expr.hash[k], frame);
			if (ctx && typeof ctx === "object" && ctx[ROOTISH]) Object.defineProperty(derived, ROOTISH, { value: true });
			ctx = derived;
		}

		// An inline partial registered from a string (the dice/icon SVGs) has no gates and no
		// includes of its own; it is emitted verbatim, which is what Handlebars does with it.
		if (Object.hasOwn(registeredPartials, name)) {
			return String(registeredPartials[name] ?? "");
		}

		const file = resolvePartialPath(name);
		if (!file) {
			throw new TemplateError(
				`${node.file}:${node.line}: partial "${name}" is not registered. ` +
				`A partial only resolves at render time if module/templates.js lists it; existing on disk is not enough.`);
		}

		this.partialStack.push(name);
		const out = this.renderProgram(compile(file), new Frame(ctx, frame));
		this.partialStack.pop();

		this.findings.partialOutput.push({
			structure: this.structureId, part: this.partId,
			partial: path.basename(name), from: node.file, line: node.line,
			elements: countElements(out)
		});
		return out;
	}
}

function countElements(html) {
	const m = html.match(/<[a-zA-Z][^>]*>/g);
	return m ? m.length : 0;
}

/* -------- the registered-partial set, read from the REAL preloadHandlebarsTemplates() -------- */

const REGISTERED_TEMPLATE_PATHS = new Set();
{
	// `preloadHandlebarsTemplates` calls Foundry's loader; capturing the argument is how the real
	// list is obtained rather than re-typing it here.
	const seen = [];
	globalThis.foundry.applications ??= {};
	globalThis.foundry.applications.handlebars = {
		loadTemplates: async (paths) => { seen.push(...paths); return paths; }
	};
	globalThis.loadTemplates = async (paths) => { seen.push(...paths); return paths; };
	await templatesModule.preloadHandlebarsTemplates();
	for (const p of seen) REGISTERED_TEMPLATE_PATHS.add(p);
}

/** A `systems/worldofdarkness/…` path to a file in this checkout, or null if it does not exist. */
function templateFile(name) {
	const rel = String(name).replace(/^systems\/worldofdarkness\//, "");
	const abs = path.join(REPO, rel);
	return fs.existsSync(abs) ? abs : null;
}

/**
 * A PARTIAL must be registered: `{{> …}}` resolves from the preload list at render time, and a file
 * that exists on disk but is not listed takes its whole tab down (the 7.5.46 incident).
 *
 * A PART template does NOT need to be: ApplicationV2 fetches each `PARTS` entry itself. This
 * distinction is real and load-bearing — `templates/actor/parts/settings.hbs` is a part and is
 * absent from the preload list, which is correct.
 */
function resolvePartialPath(name) {
	if (!REGISTERED_TEMPLATE_PATHS.has(name)) return null;
	return templateFile(name);
}

/* ============================================================================================ *
 * 5. THE MATRIX — enumerated from module/config.js, never written down (design D10)
 * ============================================================================================ */

const SPLATS = Object.keys(CONFIG.worldofdarkness.splat);
const VARIANT_FAMILIES = CONFIG.worldofdarkness.variant;
const ERAS = Object.keys(CONFIG.worldofdarkness.era);

/**
 * The templates the PC sheet can actually reach: every `PARTS` entry plus the transitive closure of
 * its literal `{{> "…"}}` includes. Derived, so a template that stops being included stops being
 * scanned and a newly included one starts.
 */
function pcTemplateClosure() {
	const seen = new Set();
	const queue = Object.values(PCActorSheet.PARTS).map((p) => p.template);
	while (queue.length) {
		const name = queue.shift();
		if (seen.has(name)) continue;
		const file = templateFile(name);
		if (!file) continue;
		seen.add(name);
		const src = fs.readFileSync(file, "utf8");
		for (const m of src.matchAll(/\{\{>\s*"([^"]+)"/g)) queue.push(m[1]);
	}
	return [...seen].map((name) => ({ name, file: templateFile(name), rel: path.relative(REPO, templateFile(name)) }));
}

/* ------------------------------------------------------------------------------------------ *
 * The two derivations below read the PARSED templates, not the source text. The AST is what the
 * renderer runs, so a claim made about it is a claim about what will actually be evaluated —
 * a line-oriented regex cannot tell `(eq …settings.splat …config.splat.exalted)` from the sibling
 * `(eqAny …settings.variant "lunar" …)` it shares a line with, and reads `exalted` as a variant.
 * ------------------------------------------------------------------------------------------ */

/** Every node in a program, depth first, with its enclosing template. */
function* astWalk(nodes) {
	for (const node of nodes) {
		yield node;
		if (node.kind === "block") {
			yield* astWalk(node.program);
			if (node.inverse) yield* astWalk(node.inverse);
		}
	}
}

/** Every expression node reachable from a node, including subexpressions. */
function* exprWalk(expr) {
	if (!expr) return;
	yield expr;
	for (const p of [...expr.params, ...Object.values(expr.hash)]) {
		if (p.kind === "sub") yield* exprWalk(p.expr);
	}
}

/** Does this program emit an element, or only text/attribute fragments? */
function programEmitsElement(nodes) {
	for (const node of astWalk(nodes)) {
		if (node.kind === "text" && /<[a-zA-Z]/.test(node.value)) return true;
		if (node.kind === "partial") return true;
	}
	return false;
}

/** `config.sheettype.spirit` etc., evaluated against the real CONFIG. */
function staticConfigValue(pathStr) {
	const parts = pathStr.replace(/^(\.\.\/)+/, "").split(".");
	if (parts[0] !== "config") return undefined;
	return parts.slice(1).reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], CONFIG.worldofdarkness);
}

const isVariantPath = (node) => node.kind === "path" && /(^|\.)settings\.variant$/.test(node.path.replace(/^(\.\.\/)+/, ""));

/** Literal-ish operands of an expression: string literals and resolvable `config.*` paths. */
function operandValues(expr) {
	const out = [];
	for (const p of expr.params) {
		if (p.kind === "literal" && typeof p.value === "string") out.push(p.value.toLowerCase());
		else if (p.kind === "path") { const v = staticConfigValue(p.path); if (typeof v === "string") out.push(v.toLowerCase()); }
		else if (p.kind === "sub") out.push(...operandValues(p.expr));
	}
	return out;
}

/**
 * The variant literals that actually reorganise the PC sheet, EXTRACTED from the parsed templates
 * rather than listed. Any expression that has `settings.variant` as an operand contributes its
 * OTHER operands.
 *
 * Design D10 asserts there are exactly two such branches. This does not take that on trust: it
 * re-derives the set on every run, so a third branch added tomorrow extends the matrix by itself.
 */
function discoverStructuralVariants() {
	const found = new Map();   // variant literal -> [sites]
	for (const tpl of pcTemplateClosure()) {
		for (const node of astWalk(compile(tpl.file))) {
			if (!node.expr) continue;
			for (const expr of exprWalk(node.expr)) {
				if (!expr.params.some(isVariantPath)) continue;
				for (const value of operandValues(expr)) {
					if (!value) continue;
					if (!found.has(value)) found.set(value, []);
					found.get(value).push(`${tpl.rel}:${expr.line}`);
				}
			}
		}
	}
	return found;
}

/**
 * Blocks whose CONDITION mentions `settings.era` and whose body emits an element. Design D10 says
 * era changes no tab, no block and no gate; that is re-derived here instead of assumed, and the
 * "emits an element" test is what keeps the answer honest in both directions — the dead `sheet`
 * sub-tab (`settings.hbs:592-609`, task 9.6) DOES gate on era eleven times, but every one of those
 * gates wraps the bare word `active` inside a class attribute. A class toggle is not a structure,
 * so counting it would force a 6x matrix for nothing; ignoring an era gate that wrapped real markup
 * would miss a genuine axis.
 */
function discoverEraGates() {
	const structural = [];
	const cosmetic = [];
	for (const tpl of pcTemplateClosure()) {
		for (const node of astWalk(compile(tpl.file))) {
			if (node.kind !== "block" || (node.name !== "if" && node.name !== "unless")) continue;
			const mentionsEra = [...exprWalk(node.expr)].some((e) =>
				e.params.some((p) => p.kind === "path" && /settings\.era$/.test(p.path)));
			if (!mentionsEra) continue;
			const site = `${tpl.rel}:${node.line}`;
			if (programEmitsElement(node.program) || (node.inverse && programEmitsElement(node.inverse))) structural.push(site);
			else cosmetic.push(site);
		}
	}
	return { structural, cosmetic };
}

/** Which splat declares this variant? `wod.variant` keys are compared case-insensitively. */
function splatDeclaringVariant(variant) {
	for (const [splat, family] of Object.entries(VARIANT_FAMILIES)) {
		for (const key of Object.keys(family)) {
			if (key.toLowerCase() === variant.toLowerCase()) return { splat, key };
		}
	}
	return null;
}

function buildStructures() {
	const structures = [];
	const unconstructible = [];

	for (const splat of SPLATS) {
		structures.push({ id: splat, splat, variant: "", variantsheet: "", era: "modern", reason: "wod.splat baseline" });
	}

	const discovered = discoverStructuralVariants();
	for (const [variant, sites] of discovered) {
		const owner = splatDeclaringVariant(variant);
		if (!owner) {
			unconstructible.push({
				what: `variant "${variant}"`,
				why: `branched on at ${sites.join(", ")} but declared by no family in wod.variant`
			});
			continue;
		}
		structures.push({
			id: `${owner.splat}/${owner.key}`, splat: owner.splat, variant: owner.key,
			variantsheet: "", era: "modern",
			reason: `structural variant branch at ${sites.join(", ")}`
		});
	}

	if (!QUICK) {
		// D10's largest lever: `settings.variantsheet` overrides the splat for the whole sheet
		// (splat-helpers.js:26-40). It is NOT redundant with the splat baselines above, because
		// `stats_attributes.hbs:18` and `getGetStatArea_v2` read `settings.splat` DIRECTLY while
		// everything else asks `getSplat` — so the two can disagree, and only this axis shows it.
		for (const splat of SPLATS) {
			for (const sheet of SPLATS) {
				if (splat === sheet) continue;
				structures.push({
					id: `${splat}+sheet:${sheet}`, splat, variant: "", variantsheet: sheet, era: "modern",
					reason: "splat x variantsheet (D10)"
				});
			}
		}
	}

	return { structures, unconstructible };
}

/* ============================================================================================ *
 * 6. FIXTURES
 * ============================================================================================ */

const template = JSON.parse(fs.readFileSync(path.join(REPO, "template.json"), "utf8"));
const fixtureFile = path.join(REPO, ".github", "fixtures", "pc-items.json");
const fixtureDoc = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));

/** Default `system` for an item type: its DataModel if it has one, else template.json. */
function itemSystemDefaults(type) {
	const model = CONFIG.Item.dataModels[type];
	if (model) {
		const out = {};
		for (const [k, f] of Object.entries(model.defineSchema())) out[k] = f.initialValue();
		return out;
	}
	const decl = template.Item[type];
	if (!decl) throw new Error(`template.json declares no Item type "${type}" (fixture references it)`);
	const out = {};
	for (const name of decl.templates ?? []) Object.assign(out, structuredClone(template.Item.templates[name]));
	for (const [k, v] of Object.entries(decl)) if (k !== "templates") out[k] = structuredClone(v);
	return out;
}

function deepMerge(base, overlay) {
	const out = Array.isArray(base) ? base.slice() : { ...base };
	for (const [k, v] of Object.entries(overlay ?? {})) {
		if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
			out[k] = deepMerge(out[k], v);
		}
		else out[k] = structuredClone(v);
	}
	return out;
}

let idCounter = 0;
function nextId() { return "fixt" + String(++idCounter).padStart(12, "0"); }

/** Build the item list once per structure (the preparers mutate copies, but `_id`s must be stable). */
function buildItems() {
	const byKey = new Map();
	const items = [];
	for (const spec of fixtureDoc.items) {
		const _id = nextId();
		const system = deepMerge(itemSystemDefaults(spec.type), spec.system);
		const item = {
			_id, id: _id, name: spec.name, type: spec.type,
			system, flags: structuredClone(spec.flags ?? {}),
			img: "icons/svg/item-bag.svg",
			fixtureKey: spec.key,
			toObject() { return { _id: this._id, name: this.name, type: this.type, system: structuredClone(this.system) }; }
		};
		byKey.set(spec.key, item);
		items.push(item);
	}
	// Second pass: parent back-references, so a child power can be filed under its container.
	for (const spec of fixtureDoc.items) {
		if (!spec.parent) continue;
		const parent = byKey.get(spec.parent);
		if (!parent) throw new Error(`fixture "${spec.key}" names parent "${spec.parent}", which does not exist`);
		byKey.get(spec.key).system.parentid = parent._id;
	}
	return items;
}

function actorSystemDefaults() {
	const out = {};
	for (const [k, f] of Object.entries(PCDataModel.defineSchema())) out[k] = f.initialValue();
	return out;
}

/**
 * A fixture actor built on the REAL `WoDActor.prototype`, so `_prepareCharacterData` — which is
 * where the has* capability flags are derived from the items (D9b task 9.1) — is the real one.
 */
async function buildActor(structure) {
	const actor = Object.create(WoDActor.prototype);
	const items = buildItems();
	Object.assign(actor, {
		_id: "fixtureactor0001", id: "fixtureactor0001",
		name: `Fixture ${structure.id}`,
		img: "icons/svg/mystery-man.svg",
		type: "PC",
		system: actorSystemDefaults(),
		items,
		flags: {},
		isOwner: true, limited: false, permission: 3,
		updateEmbeddedDocuments() {},
		getEmbeddedDocument() { return null; },
		toObject() { return { _id: this._id, name: this.name, type: this.type, system: structuredClone(this.system) }; }
	});
	actor.system.settings.splat = structure.splat;
	actor.system.settings.variant = structure.variant;
	actor.system.settings.variantsheet = structure.variantsheet;
	actor.system.settings.era = structure.era;
	actor.system.settings.iscreated = true;
	actor.system.settings.usechimerical = true;   // exercises the chimerical health track

	await actor._prepareCharacterData(actor);
	await actor.prepareDerivedData();
	return actor;
}

/* ============================================================================================ *
 * 7. RUN
 * ============================================================================================ */

let passed = 0;
const failures = [];
const warnings = [];

function check(name, fn) {
	try { fn(); passed++; if (VERBOSE) console.log(`  ok   ${name}`); }
	catch (err) { failures.push({ name, message: err.message }); console.log(`  FAIL ${name}\n         ${err.message.split("\n").join("\n         ")}`); }
}

/** "vampire, werewolf, … +167" — a failure message must name examples without printing 173 ids. */
function summarise(list) {
	const uniq = [...new Set(list)];
	return uniq.length > 6 ? `${uniq.slice(0, 6).join(", ")} … +${uniq.length - 6}` : uniq.join(", ");
}

function fail(name, message) {
	failures.push({ name, message });
	console.log(`  FAIL ${name}\n         ${message.split("\n").join("\n         ")}`);
}

/* ---- A. the fixture catalogue is complete (derived cross-checks) ---- */

console.log("\nA. the fixture catalogue covers what the preparers ask for");

const preparerSource = fs.readFileSync(path.join(REPO, "module", "actor", "template", "pc-actor-sheet.js"), "utf8");
const askedSubKinds = new Set([...preparerSource.matchAll(/wod\.types\.[a-z]+/g)].map((m) => m[0]));
const fixtureSubKinds = new Set(fixtureDoc.items.map((i) => i.system?.type).filter((t) => typeof t === "string" && t.startsWith("wod.types.")));

check(`every wod.types.* the preparers name has a fixture item (${askedSubKinds.size} asked)`, () => {
	const missing = [...askedSubKinds].filter((t) => !fixtureSubKinds.has(t)).sort();
	if (missing.length) {
		throw new Error(
			`pc-actor-sheet.js asks for these sub-kinds and .github/fixtures/pc-items.json has no item ` +
			`of them, so no structure exercises the block that renders them:\n  ${missing.join("\n  ")}`);
	}
});

/**
 * The NAME of the function that builds a part's context, parsed out of `_preparePartContext`'s own
 * switch so an error message names the function a reader will actually find. `stats` is prepared by
 * `prepareStatContext`, not `prepareStatsContext`, and a message that invents the plural sends the
 * reader looking for a symbol that does not exist.
 */
const PREPARER_NAME = (() => {
	// reorganize-mage-sheet-v3 9.10 — widened to also match a BRACED `case 'x': { ... }` block whose
	// first statement is `context = await f(...)` rather than a bare `return f(...)` right after the
	// case label. `stats` moved to this shape (it now sets `context.isv3` after calling
	// `prepareStatContext`, so it needs a block body to hold a second statement before its own
	// `return context`), and dropped out of the old regex silently — a future missing-context
	// failure on Stats would have named the generic `_preparePartContext()` instead of
	// `prepareStatContext()`. The source shape is unchanged on purpose (task text: widen the regex,
	// don't reshape `pc-actor-sheet.js` to suit it).
	const map = {};
	for (const m of preparerSource.matchAll(/case\s+'([a-z]+)':\s*\{?\s*\n\s*(?:return\s+(\w+)\(|context\s*=\s*await\s+(\w+)\()/g)) {
		map[m[1]] = m[2] || m[3];
	}
	return map;
})();

const powertabConfig = CONFIG.worldofdarkness.sheetv2.power ?? {};
const sectionIds = new Set();
for (const [key, entry] of Object.entries(powertabConfig)) {
	if (key === "defaultOrder") { for (const s of entry) sectionIds.add(s); continue; }
	if (key === "unsorted") continue;
	for (const s of (entry.primary ?? [])) sectionIds.add(s);
}
const fixtureSections = new Set(fixtureDoc.items.map((i) => i.section).filter(Boolean));

check(`every powertab.js section id has a fixture item (${sectionIds.size} sections)`, () => {
	const missing = [...sectionIds].filter((s) => !fixtureSections.has(s)).sort();
	if (missing.length) {
		throw new Error(
			`assets/data/sheet/powertab.js names these sections and no fixture item claims them, so the ` +
			`Powers tab is never exercised for them:\n  ${missing.join("\n  ")}`);
	}
});

/* ---- B. matrix completeness ---- */

console.log("\nB. the matrix is enumerated from module/config.js");

const { structures, unconstructible } = buildStructures();
const variantCount = Object.values(VARIANT_FAMILIES).reduce((n, f) => n + Object.keys(f).length, 0);

console.log(`     wod.splat        ${SPLATS.length}`);
console.log(`     wod.variant      ${variantCount} across ${Object.keys(VARIANT_FAMILIES).length} families`);
console.log(`     wod.era          ${ERAS.length}`);
{
	const byReason = new Map();
	for (const st of structures) {
		const kind = st.reason.startsWith("structural variant") ? "structural variant branch" : st.reason;
		byReason.set(kind, (byReason.get(kind) ?? 0) + 1);
	}
	console.log(`     structures       ${structures.length}`);
	for (const [kind, n] of byReason) console.log(`       ${String(n).padStart(4)}  ${kind}`);
}

check("every splat in wod.splat has a structure", () => {
	const covered = new Set(structures.map((s) => s.splat));
	const missing = SPLATS.filter((s) => !covered.has(s));
	if (missing.length) throw new Error(`no fixture for: ${missing.join(", ")}`);
});

check("no structure the config declares is unconstructible", () => {
	if (unconstructible.length) {
		throw new Error(unconstructible.map((u) => `${u.what}: ${u.why}`).join("\n"));
	}
});

const eraGates = discoverEraGates();
check(`era gates no markup, so it is enumerated once, not ${ERAS.length}x`, () => {
	if (eraGates.structural.length) {
		throw new Error(
			`a PC template now gates MARKUP on settings.era, so era is a structural axis after all and this ` +
			`matrix is ${ERAS.length}x too small:\n  ${eraGates.structural.join("\n  ")}`);
	}
});
if (eraGates.cosmetic.length) {
	console.log(`     era is read by ${eraGates.cosmetic.length} gates, all of which toggle a class rather than markup ` +
		`(${eraGates.cosmetic[0]} …) — design D10's claim, re-derived`);
}

/* ---- render every part of every structure ---- */

console.log("\nC. every part renders for every structure");

const PART_IDS = Object.keys(PCActorSheet.PARTS);

/*
 * partId -> every distinct template any sheet in the family declares for it.
 *
 * The CONTEXT is what a preparer builds, and `_preparePartContext` switches on the partId STRING
 * and is inherited unchanged. That USED to mean one instance could drive every sheet in the family,
 * and this comment said so.
 *
 * IT IS NO LONGER TRUE, and the way it stopped being true is the point. `PCActorSheetV3` gained a
 * `_prepareContext` OVERRIDE (task 8.6, the nav count badges), so the ROOT context now differs per
 * sheet even though the per-part context does not. While this harness built root context from a
 * base-class instance only, that override was never executed here — and it shipped with a crash in
 * it (`prepareEffectContext` reads `context.tabs.effects` and was handed `{}`), found only because
 * someone hand-built a throwaway copy of this file that instantiated the subclass.
 *
 * A gate that cannot see the class it is meant to cover is decoration. Root context is therefore
 * built PER SHEET now, and each part is rendered from the base context of the sheet that declares
 * its template.
 */
const PART_TEMPLATES = new Map();

for (const partId of PART_IDS) {
	const seen = new Map();

	for (const { name, cls } of SHEETS) {
		const t = cls.PARTS?.[partId]?.template;

		if (!t) continue;

		if (seen.has(t)) seen.get(t).push(name);
		else seen.set(t, [name]);
	}

	PART_TEMPLATES.set(partId, [...seen].map(([template, sheets]) => ({ template, sheets })));
}

console.log(`   ${SHEETS.length} sheet(s) in the family: ${SHEETS.map(s => s.name).join(", ")}`);
console.log(`   ${[...PART_TEMPLATES.values()].reduce((n, v) => n + v.length, 0)} distinct part template(s) to render`);
const findings = { missingKeys: [], partialOutput: [], unevaluable: [] };
const renderedByStructure = new Map();
const structureItems = new Map();
const started = Date.now();

// `_prepareContext` logs the whole actor document on every call; silence it so the harness output
// is readable, and restore immediately after.
const realLog = console.log;

for (const structure of structures) {
	// "Covered or red, never quietly skipped" (design D10) applies to the fixture itself: a structure
	// the config declares whose actor or sheet cannot even be BUILT is a hard failure naming the
	// structure, not an exception that ends the run with the other 172 unreported.
	let actor, sheet, base;
	const sheetByName = new Map(), baseByName = new Map();
	try {
		actor = await buildActor(structure);
		structureItems.set(structure.id, actor.items);
		console.log = () => {};
		try {
			// One instance and one root context PER SHEET CLASS — see the note above PART_TEMPLATES.
			for (const { name, cls } of SHEETS) {
				const inst = new cls({ document: actor });
				sheetByName.set(name, inst);
				baseByName.set(name, await inst._prepareContext({}));
			}
			sheet = sheetByName.get(SHEETS[0].name);
			base = baseByName.get(SHEETS[0].name);
		}
		finally { console.log = realLog; }
	}
	catch (err) {
		console.log = realLog;
		fail(`${structure.id} — no fixture could be constructed`,
			`${structure.reason}\n${err.message}\n` +
			`The config DECLARES this structure, so the sheet is expected to open for it. Either the sheet ` +
			`cannot serve it (a defect) or the harness cannot build it (extend the fixture) — it may not be skipped.`);
		continue;
	}

	const perPart = new Map();
	for (const partId of PART_IDS) {
	  for (const { template, sheets } of PART_TEMPLATES.get(partId)) {
		// Only named when more than one sheet declares this part, so the common case reads as before
		const who = sheets.length === SHEETS.length ? partId : `${partId} [${sheets.join("/")}]`;
		const templatePath = templateFile(template);
		if (!templatePath) {
			fail(`${structure.id} / ${who}`, `PARTS names "${template}", which does not exist in this checkout`);
			continue;
		}

		// The sheet that DECLARES this template drives it, so a subclass's root-context override is
		// exercised rather than assumed equivalent to the base class's.
		const owner = sheets[0];
		const ownerSheet = sheetByName.get(owner) ?? sheet;
		const ownerBase = baseByName.get(owner) ?? base;

		let context;
		console.log = () => {};
		try { context = await ownerSheet._preparePartContext(partId, { ...ownerBase }, {}); }
		catch (err) { console.log = realLog; fail(`${structure.id} / ${partId} — preparer`, `${err.message}`); continue; }
		finally { console.log = realLog; }

		Object.defineProperty(context, ROOTISH, { value: true, enumerable: false });

		const renderer = new Renderer(partId, structure.id, findings);
		renderer.rootContext = context;
		let html;
		try { html = renderer.renderProgram(compile(templatePath), new Frame(context)); }
		catch (err) {
			fail(`${structure.id} / ${partId} — render`, `${err.message}`);
			continue;
		}
		// Later sections index by partId. Keep the FIRST sheet's html under the bare id so section C
		// and the orphan sweep behave exactly as before, and append every other sheet's under a
		// suffixed key so an extra template cannot silently mask the base one.
		perPart.set(perPart.has(partId) ? `${partId}::${sheets[0]}` : partId, html);
	  }
	}
	renderedByStructure.set(structure.id, perPart);
	if (VERBOSE) realLog(`     ${structure.id}: ${[...perPart.values()].reduce((n, h) => n + countElements(h), 0)} elements over ${perPart.size} parts`);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

/* ---- C. the part rendered at all ---- */

for (const structure of structures) {
	const perPart = renderedByStructure.get(structure.id);
	for (const partId of PART_IDS) {
		const html = perPart?.get(partId);
		if (html === undefined) continue;   // already failed above
		check(`${structure.id} / ${partId} produced a rooted, non-empty part`, () => {
			const elements = countElements(html);
			if (elements === 0) throw new Error(`the part rendered ${html.length} characters and ZERO elements`);
			if (partId === "tabs") {
				if (!/<nav\b/.test(html)) throw new Error(`the navigation part emitted no <nav> (${elements} elements)`);
				return;
			}
			const m = /<section\b[^>]*data-tab="([^"]*)"/.exec(html);
			if (!m) throw new Error(`no <section data-tab="…"> in the output (${elements} elements)`);
			if (m[1] !== partId) throw new Error(`the section says data-tab="${m[1]}" but PARTS calls this part "${partId}"`);
		});
	}
}

/* ---- D. missing context keys ---- */

console.log("\nD. no template read a context key its part's preparer never built");

{
	const grouped = new Map();
	for (const f of findings.missingKeys) {
		const k = `${f.part} ${f.file}:${f.line} ${f.key}`;
		if (!grouped.has(k)) grouped.set(k, { ...f, structures: [] });
		grouped.get(k).structures.push(f.structure);
	}
	const fresh = [...grouped.entries()].filter(([k]) => !Object.hasOwn(KNOWN_MISSING_KEYS, k));
	const admitted = [...grouped.keys()].filter((k) => Object.hasOwn(KNOWN_MISSING_KEYS, k));

	if (fresh.length === 0) {
		passed++;
		console.log(`  ok   ${findings.partialOutput.length} partial renders across ${structures.length} structures read no ` +
			`absent key beyond the ${admitted.length} already recorded`);
	}
	for (const [, g] of fresh) {
		fail(`${g.part}: ${g.file}:${g.line} reads "${g.key}"`,
			`"${g.key}" is absent from the context ${PREPARER_NAME[g.part] ?? "_preparePartContext"}() built ` +
			`(full path "${g.path}").\n` +
			`This is the silent-empty-block failure: the block renders, produces nothing, and nothing says so.\n` +
			`Structures affected (${g.structures.length}): ${summarise(g.structures)}\n` +
			`If it is genuinely acceptable, add "${g.part} ${g.file}:${g.line} ${g.key}" to KNOWN_MISSING_KEYS ` +
			`with a reason — never widen the check.`);
	}
	for (const k of admitted) warnings.push(`::warning::KNOWN_MISSING_KEY: ${k} — ${KNOWN_MISSING_KEYS[k]}`);
	// An allowlist entry that stops firing is a fix that landed. Say so, so the next reader is not
	// warned about a defect that no longer exists.
	for (const k of Object.keys(KNOWN_MISSING_KEYS)) {
		if (!grouped.has(k)) fail("stale KNOWN_MISSING_KEYS entry", `"${k}" no longer fires — the defect is fixed; delete the entry.`);
	}
}


/* ---- E. an included partial produced nothing ---- */

console.log("\nE. every partial the shell included produced at least one node");

{
	const empties = findings.partialOutput.filter((p) => p.elements === 0);
	const allowed = [];
	const real = new Map();
	for (const e of empties) {
		if (Object.hasOwn(EMPTY_PARTIAL_OK, e.partial)) { allowed.push(e); continue; }
		const k = `${e.part}\0${e.partial}\0${e.from}:${e.line}`;
		if (!real.has(k)) real.set(k, { ...e, structures: [] });
		real.get(k).structures.push(e.structure);
	}
	if (real.size === 0) {
		passed++;
		const kinds = new Set(findings.partialOutput.map((p) => p.partial)).size;
		console.log(`  ok   ${findings.partialOutput.length} partial renders (${kinds} distinct partials), none empty`);
	}
	else {
		for (const g of real.values()) {
			fail(`${g.part}: ${g.partial} rendered empty`,
				`included at ${g.from}:${g.line} — its gate said yes and it emitted ZERO elements.\n` +
				`Structures affected (${g.structures.length}): ${summarise(g.structures)}`);
		}
	}
	if (allowed.length) {
		const byPartial = new Map();
		for (const e of allowed) byPartial.set(e.partial, (byPartial.get(e.partial) ?? 0) + 1);
		for (const [partial, n] of byPartial) {
			warnings.push(`::warning::EMPTY_PARTIAL_OK: ${partial} rendered empty ${n}x — ${EMPTY_PARTIAL_OK[partial]}`);
		}
	}
}

/* ---- F. the orphan sweep ---- */

console.log("\nF. every item on the actor renders on some part");

const orphanKinds = new Map();   // system.type -> Set(structure)
{
	for (const structure of structures) {
		const perPart = renderedByStructure.get(structure.id);
		if (!perPart) continue;
		const all = [...perPart.values()].join("\n");
		// Every row in every list template stamps the document id it came from; that is the only
		// evidence available offline that a specific ITEM (not merely its block) reached the page.
		const seen = new Set([...all.matchAll(/fixt\d{12}/g)].map((m) => m[0]));
		const items = structureItems.get(structure.id) ?? [];
		for (const item of items) {
			if (seen.has(item._id)) continue;
			const kind = item.system?.type ?? item.type;
			if (!orphanKinds.has(kind)) orphanKinds.set(kind, new Set());
			orphanKinds.get(kind).add(structure.id);
		}
	}

	const unexplained = [...orphanKinds.entries()].filter(([kind]) => !Object.hasOwn(RENDERS_NOWHERE, kind));
	const known = [...orphanKinds.entries()].filter(([kind]) => Object.hasOwn(RENDERS_NOWHERE, kind));

	// An orphan on EVERY structure is a defect; an orphan on some structures is usually the sheet
	// correctly declining to show another line's content, so only the universal case fails.
	const universal = unexplained.filter(([, s]) => s.size === structures.length);
	if (universal.length === 0) {
		passed++;
		console.log(`  ok   no item sub-kind is invisible on every one of the ${structures.length} structures beyond the ${known.length} already recorded`);
	}
	else {
		for (const [kind, s] of universal) {
			fail(`${kind} renders nowhere`,
				`an item of this sub-kind is on the fixture actor and appears in NO part's output on any of the ` +
				`${s.size} structures. Either a preparer has no predicate for it or no template draws it.`);
		}
	}
	for (const [kind, s] of known) {
		warnings.push(`::warning::RENDERS_NOWHERE: ${kind} invisible on ${s.size}/${structures.length} structures — ${RENDERS_NOWHERE[kind]}`);
	}
	if (VERBOSE) {
		for (const [kind, s] of unexplained) {
			if (s.size === structures.length) continue;
			realLog(`     (partial) ${kind} does not render on ${s.size}/${structures.length}: ${summarise([...s])}`);
		}
	}
}

/* ---- F2. a sub-kind moved between two collectors renders in exactly one block ---- */

console.log("\nF2. wod.types.specialadvantage renders in exactly one block per part");

{
	// give-special-advantages-their-own-section (design D8) — the failure mode the orphan sweep
	// above CANNOT see: a sub-kind left in one collector while also feeding a new list renders
	// TWICE on the same tab, and every row looks correct in isolation, so nothing above catches it.
	// An item rendered nowhere is an orphan; an item rendered twice is not.
	//
	// The only offline evidence of a duplicate is the per-ROW wrapper element these two partials
	// stamp with the item's own id — exactly once per render of that row. If the same id's wrapper
	// appears more than once inside ONE part's html, that item was drawn by two separate `{{#each}}`
	// loops in the same render.
	//
	// SCOPED to `wod.types.specialadvantage` on purpose, matching design D8 and tasks.md 6.1 exactly
	// ("this sub-kind's fixture item"), not generalised to every kind on the fixture actor: a blind
	// sweep over ALL kinds also trips on `wod.types.othertraits`, which renders twice inside
	// `feature.hbs`'s "feature" part on most non-wraith structures — a REAL, PRE-EXISTING defect
	// (confirmed present before this change touched anything, by running this same duplicate-wrapper
	// logic against the unmodified HEAD templates), but a DIFFERENT one, out of scope for this change
	// and not diagnosed here. Widening this gate to catch it too belongs to a change that investigates
	// that defect on its own terms, not to a stray sweep that would fail this change's own preflight
	// for a bug this change did not introduce and does not touch.
	const ROW_WRAPPER_RE = /<div class="clearareaBox" data-itemid="([^"]+)">|<div class="dragrow headlineNormal feature-itemlist" data-itemid="([^"]+)">/g;
	const WATCHED_KIND = "wod.types.specialadvantage";

	let dupChecks = 0;
	for (const structure of structures) {
		const perPart = renderedByStructure.get(structure.id);
		if (!perPart) continue;
		const items = structureItems.get(structure.id) ?? [];
		const watchedIds = new Set(items.filter((item) => item.system?.type === WATCHED_KIND).map((item) => item._id));
		if (watchedIds.size === 0) continue;

		for (const [partKey, html] of perPart) {
			const counts = new Map();
			for (const m of html.matchAll(ROW_WRAPPER_RE)) {
				const id = m[1] ?? m[2];
				if (watchedIds.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
			}
			dupChecks++;
			for (const [id, n] of counts) {
				if (n <= 1) continue;
				fail(`${structure.id} / ${partKey}: ${WATCHED_KIND} renders ${n} times`,
					`item ${id} (${WATCHED_KIND}) has ${n} separate row wrappers inside ONE part's output — it is ` +
					`being collected by more than one list feeding the same part. An item rendered twice is not an ` +
					`orphan, so section F above cannot see this; only this check does.`);
			}
		}
	}
	if (!failures.some((f) => f.name.includes(`${WATCHED_KIND} renders`))) {
		passed++;
		console.log(`  ok   ${WATCHED_KIND}'s row wrapper appears at most once inside any single part, across ${dupChecks} (structure, part) pairs holding one`);
	}
}

/* ---- the allowlists themselves ---- */

console.log("\nG. the allowlists are all still earning their place");

{
	// An allowlist entry that no longer fires is a hole: it would silently absorb the NEXT occurrence
	// of the thing it was written for. Every one of them is therefore checked for staleness, in the
	// same direction and with the same severity as the finding it admits.
	const firedEmpty = new Set(findings.partialOutput.filter((p) => p.elements === 0).map((p) => p.partial));
	for (const partial of Object.keys(EMPTY_PARTIAL_OK)) {
		if (!firedEmpty.has(partial)) fail("stale EMPTY_PARTIAL_OK entry", `"${partial}" never rendered empty — delete the entry.`);
	}

	for (const kind of Object.keys(RENDERS_NOWHERE)) {
		const s2 = orphanKinds.get(kind);
		if (!s2 || s2.size !== structures.length) {
			fail("stale RENDERS_NOWHERE entry",
				`"${kind}" now renders on ${structures.length - (s2?.size ?? 0)}/${structures.length} structures — ` +
				`the axis was implemented; delete the entry.`);
		}
	}

	const firedUnevaluable = new Set(findings.unevaluable.map((u) => u.site));
	for (const site of Object.keys(UNEVALUABLE_EXPRESSIONS)) {
		if (!firedUnevaluable.has(site)) fail("stale UNEVALUABLE_EXPRESSIONS entry", `"${site}" now evaluates — the template is fixed; delete the entry.`);
	}

	if (failures.length === 0 || !failures.some((f) => f.name.startsWith("stale "))) {
		passed++;
		const admittedTotal = Object.keys(KNOWN_MISSING_KEYS).length + Object.keys(EMPTY_PARTIAL_OK).length
			+ Object.keys(UNEVALUABLE_EXPRESSIONS).length + Object.keys(RENDERS_NOWHERE).length;
		console.log(`  ok   all ${admittedTotal} allowlisted findings still occur, so no entry is masking a fresh one`);
	}
}

{
	const byS = new Map();
	for (const u of findings.unevaluable) byS.set(u.site, (byS.get(u.site) ?? 0) + 1);
	for (const [site, n] of byS) {
		warnings.push(`::warning::UNEVALUABLE: ${site} threw in real Handlebars ${n}x and was skipped — ${UNEVALUABLE_EXPRESSIONS[site].note}`);
	}
}

/* ============================================================================================ *
 * H. THE CHANTRY/CONSTRUCT SHEET — every part, in BOTH lock states
 *
 * WHY THIS SECTION EXISTS, and it is the same reason as the rest of this file with a sharper edge:
 * 7.5.128 shipped a Chantry sheet that COULD NOT BE OPENED AT ALL, and all 31 preflight gates passed
 * it, because not one of them constructs a sheet or renders one of its parts. `test-appv2-
 * constructor-signature.mjs` was written that day to catch the specific dereference that did it;
 * this section catches the general class — a part that throws, a part that renders nothing, a
 * template reading a context key its preparer never built, and (the reason it runs TWICE) a write
 * control that renders on a locked sheet or fails to render on an unlocked one.
 *
 * THE LOCK AXIS IS THE POINT. Inside an `{{#each}}` a bare `locked` resolves against the ARRAY
 * ELEMENT, not the sheet, so `{{#if (eq locked false)}}` is false forever and the control never
 * renders — not even unlocked. This system has shipped that defect twice on its mage partials
 * (`reorganize-mage-sheet-v3` task 9.7, then `polish-mage-sheet-v3-affordances`), each time found by
 * a human noticing a missing trash can. Counting the write controls in both states is what makes the
 * depth a MEASUREMENT instead of a brace count: a wrong `../` shows up as zero controls unlocked,
 * and a missing gate as more than zero locked.
 *
 * It is deliberately NOT folded into the 173-structure matrix above: a Chantry has no splat, no
 * variant and no era, so it is one fixture and two states, and the matrix's structure ids would be
 * meaningless for it.
 *
 * MUTATION-TESTED WHEN WRITTEN, because a section that passes on its first run has proved nothing
 * yet. Three deliberate breaks, each reverted after being confirmed caught (2026-08-26):
 *   1. `../locked` -> `locked` in `chantry_roster.hbs` (the exact context-depth trap) — caught by
 *      "the unlocked sheet DOES offer its writing controls" and by the per-row delete count.
 *   2. `traitCap()` reduced to `rating * 2` for every Trait (the D7 regression) — caught by the
 *      per-Trait cap check.
 *   3. the lock gate removed from one effect control — caught by "no writing control renders while
 *      locked" on the effects part.
 *   4. the Equipo tab's empty state deleted — caught by "an EMPTY vault renders the Equipo tab".
 * ============================================================================================ */

console.log("\nH. the Chantry/Construct sheet renders every part, locked and unlocked");

{
	const ChantrySheetClass = (await import(M("actor", "template", "chantry-actor-sheet-v2.js"))).default;

	/** `system` for a Chantry, DERIVED from template.json rather than written down here. */
	function chantrySystemDefaults() {
		return structuredClone(template.Actor.Chantry);
	}

	/**
	 * One item per list the vault renders, so no branch of `v3/gear.hbs`'s vault half is left
	 * unexercised: a mundane Item, a magical one (`ismagical`), a Fetish (magical by type), a melee
	 * weapon and a suit of armour.
	 *
	 * TWO weapons on purpose. `ItemHelper.GetItemType`'s comparator is
	 * `a.system.type.localeCompare(...)`, and `Melee Weapon`/`Ranged Weapon`/`Armor` have no
	 * `system.type` at all in template.json — so that helper throws as soon as an actor holds two of
	 * them, which is exactly why `gear-lists.js` sorts those two lists itself. One weapon would never
	 * invoke a comparator and would leave that regression free to come back.
	 */
	function buildChantryItems() {
		const specs = [
			{ type: "Item", name: "Caja de herramientas", system: { type: "wod.types.trinket", ismagical: false } },
			{ type: "Item", name: "El Bioroide Eva", system: { type: "wod.types.device", ismagical: true } },
			{ type: "Fetish", name: "Fetiche del umbral", system: { type: "wod.types.fetish" } },
			{ type: "Melee Weapon", name: "Bastón ritual", system: {} },
			{ type: "Ranged Weapon", name: "Rifle de la cámara", system: {} },
			{ type: "Armor", name: "Chaleco del vestíbulo", system: {} }
		];

		return specs.map((spec) => {
			const _id = nextId();
			return {
				_id, id: _id, name: spec.name, type: spec.type,
				system: deepMerge(itemSystemDefaults(spec.type), spec.system),
				flags: {},
				img: "icons/svg/item-bag.svg",
				toObject() { return { _id: this._id, name: this.name, type: this.type, system: structuredClone(this.system) }; }
			};
		});
	}

	/**
	 * A Chantry with something in every branch: an over-cap Trait of BOTH kinds (reality-zone 4 on
	 * rating 3, which is over its 1x cap; library 4, which is NOT over its 2x cap), a roster with
	 * entries, and two Integrated Effects — one of them the book's own fireball, whose Tiempo 4
	 * exceeds the rating-3 Sphere cap.
	 *
	 * `wonder` 2 and `mentor` 7 are the `foundry-chantry-sheet` spec's own two scenarios for the
	 * five Backgrounds M20 core p.308 permits on a Chantry (§4.3b): one renders its dots, the other
	 * is over the GENERIC 2x cap on a rating-3 Chantry. Neither is a rostered Trait, so the roster
	 * counts below are unaffected.
	 */
	function buildChantryActor() {
		const system = chantrySystemDefaults();
		system.rating = 3;
		system.flavor = "tradition";
		system.pool = { total: 40, spent: 0 };
		Object.assign(system.traits, {
			"allies": 2,
			"library": 4,
			"node": 2,
			"reality-zone": 4,
			"integrated-effects": 3,
			"wonder": 2,
			"mentor": 7
		});
		system.notes = "<p>Notas de la capilla.</p>";
		system.integratedEffects = [
			{ name: "Umbral sereno", description: "Calma a quien entra.", spheres: [{ sphere: "mind", level: 2 }] },
			{
				name: "Bola de fuego", description: "Se dispara si entra un vampiro.",
				spheres: [
					{ sphere: "forces", level: 3 }, { sphere: "prime", level: 2 },
					{ sphere: "life", level: 1 }, { sphere: "matter", level: 1 },
					{ sphere: "time", level: 4 }
				]
			}
		];
		system.traitRosters = {
			allies: [{ name: "Nadia", note: "contacto en el puerto", points: 1 }],
			library: [{ name: "Copia del Codex", note: "", points: 0 }]
		};

		const items = buildChantryItems();

		return {
			_id: "fixturechantry1", id: "fixturechantry1",
			name: "Capilla de prueba",
			img: "icons/svg/mystery-man.svg",
			type: "Chantry",
			uuid: "Actor.fixturechantry1",
			system,
			items,
			flags: {},
			isOwner: true, limited: false, permission: 3,
			getEmbeddedDocument(_type, id) { return items.find((i) => i._id === id) ?? null; },
			toObject() { return { _id: this._id, name: this.name, type: this.type, system: structuredClone(this.system) }; }
		};
	}

	/**
	 * The actions that WRITE. Everything else a control can carry is a read and must survive a lock:
	 *   `tab`       switches tab                       `actorLock`  is the lock control itself
	 *   `sendChat`  posts an item to chat              `rollDice`   opens a roll dialog
	 *   `useMacro`  opens a roll dialog
	 * Derived, not hand-listed: every `data-action` this sheet registers, minus that read set. So a
	 * new writing action added to the sheet is covered here the day it lands, with no edit.
	 */
	const READ_ONLY_ACTIONS = new Set(["tab", "actorLock", "sendChat", "rollDice", "useMacro"]);

	/**
	 * ONE ADMITTED EXCEPTION, named so it cannot grow silently.
	 *
	 * `parts/item_table.hbs` renders its equip toggle (`data-action="itemActive"`) with NO lock gate,
	 * for the PC sheet as much as for this one — it predates this change and gating it would alter
	 * how the PC's Equipo and Poderes tabs behave, which is out of this change's scope. It is not one
	 * of the controls the spec's requirement names ("creates, edits or deletes an Item, an Integrated
	 * Effect or a roster entry"), and the Chantry's own handler refuses while locked
	 * (`ChantryActorSheetV2.onItemActive` warns and returns), so a locked click cannot write. It is
	 * COUNTED rather than ignored: if a second ungated write action ever appears, the census below
	 * fails.
	 */
	const LOCKED_WRITE_ACTIONS_OK = new Map([
		["itemActive", "parts/item_table.hbs's equip toggle is ungated for BOTH sheets (pre-existing, out of scope); the Chantry handler still refuses while locked"]
	]);

	const registeredActions = new Set(Object.keys(ChantrySheetClass.DEFAULT_OPTIONS.actions ?? {}));
	const writeActions = [...registeredActions].filter((a) => !READ_ONLY_ACTIONS.has(a));

	/** Every `data-action="…"` in the html, as a list of names. */
	function actionsIn(html) {
		return [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
	}

	/** Editable form controls: an `<input>`/`<select>`/`<textarea>` that is neither disabled nor readonly. */
	function editableControlsIn(html) {
		return [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)]
			.map((m) => m[0])
			.filter((tag) => !/\bdisabled\b/.test(tag) && !/\breadonly\b/.test(tag));
	}

	const chantryPartIds = Object.keys(ChantrySheetClass.PARTS);
	const rendered = new Map();          // `${locked}|${partId}` -> html
	const chantryFindings = { missingKeys: [], partialOutput: [], unevaluable: [] };

	check(`the Chantry sheet declares tabs and one part per tab plus the rail (${chantryPartIds.length} parts)`, () => {
		const inst = new ChantrySheetClass({ document: buildChantryActor() });
		const tabIds = Object.keys(inst.tabs);
		const extra = chantryPartIds.filter((p) => !tabIds.includes(p));

		if (extra.length !== 1) {
			throw new Error(`expected exactly one non-tab part (the rail); got ${JSON.stringify(extra)}`);
		}
		for (const id of tabIds) {
			if (!chantryPartIds.includes(id)) throw new Error(`tab "${id}" has no part`);
		}
	});

	for (const locked of [true, false]) {
		const state = locked ? "locked" : "unlocked";
		let sheet, base;

		try {
			const actor = buildChantryActor();
			sheet = new ChantrySheetClass({ document: actor });
			// The sheet OPENS locked (its own class field). The unlocked pass flips the same transient
			// flag the lock control flips, which is the only difference between the two renders.
			sheet.locked = locked;
			base = await sheet._prepareContext({});
		}
		catch (err) {
			fail(`chantry (${state}) — the sheet could not even be prepared`,
				`${err.message}\nThis is the 7.5.128 failure class: the sheet does not open at all.`);
			continue;
		}

		check(`chantry (${state}) — _prepareContext reports the lock it was given`, () => {
			if (base.locked !== locked) throw new Error(`context.locked is ${base.locked}`);
		});

		for (const partId of chantryPartIds) {
			const templatePath = templateFile(ChantrySheetClass.PARTS[partId].template);

			if (!templatePath) {
				fail(`chantry (${state}) / ${partId}`,
					`PARTS names "${ChantrySheetClass.PARTS[partId].template}", which does not exist in this checkout`);
				continue;
			}

			let context;
			try { context = await sheet._preparePartContext(partId, { ...base }, {}); }
			catch (err) { fail(`chantry (${state}) / ${partId} — preparer`, err.message); continue; }

			Object.defineProperty(context, ROOTISH, { value: true, enumerable: false });

			const renderer = new Renderer(`chantry:${partId}`, `chantry-${state}`, chantryFindings);
			renderer.rootContext = context;

			let html;
			try { html = renderer.renderProgram(compile(templatePath), new Frame(context)); }
			catch (err) { fail(`chantry (${state}) / ${partId} — render`, err.message); continue; }

			rendered.set(`${state}|${partId}`, html);

			check(`chantry (${state}) / ${partId} produced a rooted, non-empty part`, () => {
				const elements = countElements(html);
				if (elements === 0) throw new Error(`the part rendered ${html.length} characters and ZERO elements`);

				if (partId === "tabs") {
					if (!/<nav\b/.test(html)) throw new Error(`the navigation part emitted no <nav> (${elements} elements)`);
					return;
				}

				const m = /<section\b[^>]*data-tab="([^"]*)"/.exec(html);
				if (!m) throw new Error(`no <section data-tab="…"> in the output (${elements} elements)`);
				if (m[1] !== partId) throw new Error(`the section says data-tab="${m[1]}" but PARTS calls this part "${partId}"`);
			});
		}
	}

	/* ---- the lock census: the whole reason this renders twice ---- */

	for (const partId of chantryPartIds) {
		const lockedHtml = rendered.get(`locked|${partId}`);
		const unlockedHtml = rendered.get(`unlocked|${partId}`);
		if (lockedHtml === undefined || unlockedHtml === undefined) continue;   // already failed above

		check(`chantry / ${partId}: no writing control renders while locked`, () => {
			const found = actionsIn(lockedHtml).filter((a) => writeActions.includes(a));
			const unadmitted = found.filter((a) => !LOCKED_WRITE_ACTIONS_OK.has(a));

			if (unadmitted.length) {
				throw new Error(
					`these writing actions render on a LOCKED sheet: ${[...new Set(unadmitted)].join(", ")}. ` +
					`Either gate them with {{#if (eq locked false)}} at the right context depth, or admit ` +
					`them in LOCKED_WRITE_ACTIONS_OK with a reason.`);
			}

			const editable = editableControlsIn(lockedHtml);
			if (editable.length) {
				throw new Error(
					`${editable.length} editable form control(s) render on a LOCKED sheet, e.g. ` +
					`${editable[0].slice(0, 120)}`);
			}
		});
	}

	check("chantry: the unlocked sheet DOES offer its writing controls (the ../locked depth is right)", () => {
		const seen = new Set();
		for (const partId of chantryPartIds) {
			const html = rendered.get(`unlocked|${partId}`);
			if (html === undefined) continue;
			for (const a of actionsIn(html)) if (writeActions.includes(a)) seen.add(a);
		}

		/* The four this asserts by name are the four that live INSIDE an `{{#each}}`, i.e. the four a
		   wrong context depth would silently remove: the Trait dots, the effect delete, the Sphere
		   delete and the roster delete. A brace-counting error shows up here as an absence. */
		for (const action of ["traitDotChange", "ratingDotChange", "effectCreate", "effectDelete",
			"effectSphereAdd", "effectSphereDelete", "rosterAdd", "rosterDelete", "itemDelete", "itemEdit"]) {
			if (!seen.has(action)) {
				throw new Error(
					`"${action}" renders NOWHERE on the unlocked sheet. If it sits inside an {{#each}}, ` +
					`this is the context-depth trap: a bare \`locked\` resolves against the array element, ` +
					`so \`(eq locked false)\` is false even unlocked.`);
			}
		}
	});

	check("chantry: every roster and effect row offers exactly one delete, and the unlocked inputs are editable", () => {
		const traits = rendered.get("unlocked|traits") ?? "";
		const effects = rendered.get("unlocked|effects") ?? "";

		// Two rosters with entries on the fixture (allies x1, library x1) -> two delete controls.
		const rosterDeletes = (traits.match(/data-action="rosterDelete"/g) ?? []).length;
		if (rosterDeletes !== 2) throw new Error(`expected 2 roster deletes for the fixture's 2 entries, got ${rosterDeletes}`);

		// Two effects, with 1 and 5 Spheres -> two effect deletes and six Sphere deletes.
		const effectDeletes = (effects.match(/data-action="effectDelete"/g) ?? []).length;
		const sphereDeletes = (effects.match(/data-action="effectSphereDelete"/g) ?? []).length;
		if (effectDeletes !== 2) throw new Error(`expected 2 effect deletes, got ${effectDeletes}`);
		if (sphereDeletes !== 6) throw new Error(`expected 6 Sphere deletes (1 + 5), got ${sphereDeletes}`);

		if (editableControlsIn(traits).length === 0) throw new Error("the unlocked Rasgos tab has no editable control at all");
		if (editableControlsIn(effects).length === 0) throw new Error("the unlocked Efectos tab has no editable control at all");
	});

	check("chantry: an empty roster leaves the LOCKED Trait rows exactly as they were", () => {
		const locked = rendered.get("locked|traits") ?? "";

		// The fixture rosters `allies` and `library`; the other six rostered Traits have no entries,
		// so a locked sheet must render no roster block for them at all — the spec's "an empty roster
		// SHALL NOT change how an existing sheet reads".
		const blocks = (locked.match(/class="chantry-roster"/g) ?? []).length;
		if (blocks !== 2) throw new Error(`expected 2 roster blocks (the two with entries), got ${blocks}`);

		/* And EVERY declared construction Trait row is still there. The count is DERIVED from
		   template.json, not the literal `14` this line used to carry: §4.3b adds the five
		   Backgrounds M20 core p.308 permits on a Chantry (familiar, influence, wonder, mentor,
		   patron), and a hard-coded 14 would have made this gate assert the very gap that task
		   closes — the "el test afirmaba el defecto" class this project has hit repeatedly. Two
		   independent sources meet here: the rows are RENDERED from
		   `CONFIG.worldofdarkness.chantry.traitcost`, and the count comes from the ACTOR TYPE's own
		   `system.traits`, so a Trait declared on the actor but never priced (or the reverse) shows
		   up as a mismatch instead of rendering nowhere. */
		const declared = Object.keys(template.Actor.Chantry.traits);
		const rows = (locked.match(/class="clearareaBox row chantry-trait-row"/g) ?? []).length;
		if (rows !== declared.length) {
			throw new Error(`expected one row per declared construction Trait (${declared.length}), got ${rows}`);
		}
	});

	/* THE DECLARATION DRIFT ITSELF (§4.3b / design.md D13). wodchar declared 19 Traits while this
	   system declared 14 for long enough to ship; the five extra would have reached an actor whose
	   type had no declaration for them, rendering nowhere and droppable on the next save. Nothing
	   compared the two halves, so nothing said so. */
	check("chantry: every declared Trait is priced and every priced Trait is declared", () => {
		const declared = new Set(Object.keys(template.Actor.Chantry.traits));
		const priced = new Set(Object.keys(CONFIG.worldofdarkness.chantry.traitcost));

		const unpriced = [...declared].filter((k) => !priced.has(k));
		const undeclared = [...priced].filter((k) => !declared.has(k));

		if (unpriced.length) {
			throw new Error(
				`template.json declares ${unpriced.join(", ")} on Actor.Chantry.traits, but ` +
				`CONFIG.worldofdarkness.chantry.traitcost does not price them, so the sheet's loop ` +
				`never renders them: the value is stored and invisible.`);
		}
		if (undeclared.length) {
			throw new Error(
				`CONFIG prices ${undeclared.join(", ")} but template.json does not declare them on ` +
				`Actor.Chantry.traits: the row renders, and the actor has nowhere to keep the value.`);
		}
	});

	/* AWAITED OUTSIDE `check`, deliberately. `check` is synchronous (`try { fn() }`), so a function
	   that RETURNS a promise would have its rejection swallowed as an unhandled rejection and the
	   check would pass whatever happened — a gate that cannot fail. The async work is done here and
	   only the assertions go inside. */
	const capContext = await new ChantrySheetClass({ document: buildChantryActor() })._prepareContext({});

	check("chantry: the per-Trait cap marks reality-zone 4 over cap and library 4 not (design.md D7)", () => {
		const byKey = new Map(capContext.listData.traits.map((t) => [t.key, t]));

		if (byKey.get("reality-zone").overcap !== true) {
			throw new Error("reality-zone 4 on a rating-3 Chantry is NOT marked over cap; the 1x exception is gone");
		}
		if (byKey.get("library").overcap !== false) {
			throw new Error("library 4 on a rating-3 Chantry IS marked over cap; the 2x rule is wrong");
		}
		if (byKey.get("reality-zone").overcapkey === byKey.get("library").overcapkey) {
			throw new Error("both Traits share one over-cap message; one of the two sentences must be false");
		}
	});

	/* THE FIVE p.308 BACKGROUNDS, by the spec's own two scenarios (`foundry-chantry-sheet`: "The
	   five Traits render" / "They obey the same cap"). The fixture carries wonder 2 and mentor 7 on
	   a rating-3 Chantry, so this asserts against RENDERED markup and the REAL cap rule, not
	   against the declaration it would be circular to re-read. */
	check("chantry: the five p.308 Backgrounds render with the same dot allocator and cap rule", () => {
		const locked = rendered.get("locked|traits") ?? "";
		const byKey = new Map(capContext.listData.traits.map((t) => [t.key, t]));

		for (const key of ["familiar", "influence", "wonder", "mentor", "patron"]) {
			if (!byKey.has(key)) throw new Error(`"${key}" is absent from the prepared Trait list`);
			if (!locked.includes(`class="clearareaBox row chantry-trait-row" data-key="${key}"`)) {
				throw new Error(`"${key}" declares no rendered Trait row`);
			}
			// The same allocator: ten steps in one .chantry-trait-value carrying the stored value.
			const value = new RegExp(
				`class="pullLeft resource-value chantry-trait-value" data-value="(\\d+)" data-key="${key}"`
			).exec(locked);
			if (!value) throw new Error(`"${key}" renders no .chantry-trait-value dot allocator`);
		}

		// Scenario 1: wonder at 2 renders two filled dots — i.e. the allocator is handed the 2.
		if (!locked.includes('chantry-trait-value" data-value="2" data-key="wonder"')) {
			throw new Error("wonder 2 does not reach the dot allocator as 2");
		}
		// Scenario 2: mentor 7 on a rating-3 Chantry is over the GENERIC 2x cap (6), and says so
		// with the 2x sentence, not Zona de Realidad's 1x one.
		if (byKey.get("mentor").cap !== 6) {
			throw new Error(`mentor's cap on a rating-3 Chantry is ${byKey.get("mentor").cap}, not the generic 2x = 6`);
		}
		if (byKey.get("mentor").overcap !== true) throw new Error("mentor 7 on a rating-3 Chantry is NOT marked over cap");
		if (byKey.get("mentor").overcapkey !== "wod.chantry.overcap") {
			throw new Error(`mentor uses the over-cap message "${byKey.get("mentor").overcapkey}"; the 2x Traits use wod.chantry.overcap`);
		}
		if (!locked.includes('class="pullLeft item-warning chantry-overcap-flag"')) {
			throw new Error("no over-cap flag renders at all, so mentor's cannot have");
		}
	});

	check("chantry: the vault renders all four item groups", () => {
		const gear = rendered.get("locked|gear") ?? "";

		for (const name of ["Caja de herramientas", "El Bioroide Eva", "Fetiche del umbral",
			"Bastón ritual", "Rifle de la cámara", "Chaleco del vestíbulo"]) {
			if (!gear.includes(name)) throw new Error(`"${name}" renders nowhere on the vault's Equipo tab`);
		}

		// And none of the three PC-only blocks reached it.
		if (gear.includes("system.gear.money")) throw new Error("the PC's money fields rendered on a Chantry");
		if (gear.includes("v3-macrorail")) throw new Error("the PC's macro rail rendered on a Chantry");
	});

	/* THE EMPTY VAULT — the spec's own second scenario for the gear tab ("A Chantry with no Items
	   renders its gear tab … THEN the gear tab SHALL render and SHALL NOT raise"). A separate fixture
	   because the one above deliberately holds an item of every kind, and "renders with six items"
	   says nothing about "renders with none": the empty state is a different branch, and an empty
	   `actor.items` is also what every NEW Chantry has. */
	{
		const emptyActor = buildChantryActor();
		emptyActor.items = [];

		const emptySheet = new ChantrySheetClass({ document: emptyActor });
		emptySheet.locked = true;

		let emptyHtml = null;
		let emptyError = null;

		try {
			const emptyBase = await emptySheet._prepareContext({});
			const emptyContext = await emptySheet._preparePartContext("gear", { ...emptyBase }, {});
			Object.defineProperty(emptyContext, ROOTISH, { value: true, enumerable: false });

			const emptyRenderer = new Renderer("chantry:gear", "chantry-empty", chantryFindings);
			emptyRenderer.rootContext = emptyContext;
			emptyHtml = emptyRenderer.renderProgram(
				compile(templateFile(ChantrySheetClass.PARTS.gear.template)), new Frame(emptyContext));
		}
		catch (err) { emptyError = err; }

		check("chantry: an EMPTY vault renders the Equipo tab and does not raise", () => {
			if (emptyError) throw new Error(`the gear part raised for an item-less Chantry: ${emptyError.message}`);
			if (countElements(emptyHtml) === 0) throw new Error("the gear part rendered zero elements");
			if (!/<section\b[^>]*data-tab="gear"/.test(emptyHtml)) throw new Error("no <section data-tab=\"gear\">");
			if (!/class="v3-empty"/.test(emptyHtml)) throw new Error("the empty state did not render");
			if (/<table\b/.test(emptyHtml)) throw new Error("an item table rendered for a Chantry with no items");
		});
	}

	check("chantry: no template read a context key its preparer never built", () => {
		if (chantryFindings.missingKeys.length === 0) return;

		const grouped = new Map();
		for (const f of chantryFindings.missingKeys) {
			grouped.set(`${f.part} ${f.file}:${f.line} ${f.key}`, f);
		}
		throw new Error(
			`${grouped.size} absent key(s) read while rendering the Chantry sheet — the silent-empty-` +
			`block failure:\n  ` + [...grouped.keys()].join("\n  "));
	});

	check("chantry: every partial the parts included produced at least one node", () => {
		const empties = chantryFindings.partialOutput.filter((p) => p.elements === 0);
		if (empties.length === 0) return;

		throw new Error(`${empties.length} empty partial render(s): ` +
			[...new Set(empties.map((e) => `${e.partial} (from ${e.from}:${e.line})`))].join(", "));
	});

	for (const [action, reason] of LOCKED_WRITE_ACTIONS_OK) {
		const fired = chantryPartIds.some((partId) =>
			actionsIn(rendered.get(`locked|${partId}`) ?? "").includes(action));

		if (fired) warnings.push(`::warning::LOCKED_WRITE_ACTIONS_OK: ${action} — ${reason}`);
		else fail("stale LOCKED_WRITE_ACTIONS_OK entry",
			`"${action}" no longer renders on a locked Chantry sheet — the gate landed; delete the entry.`);
	}

	console.log(`     ${chantryPartIds.length} parts x 2 lock states, ` +
		`${chantryFindings.partialOutput.length} partial renders, ` +
		`${writeActions.length} writing actions censused`);
}

/* ---- report ---- */

console.log("");
for (const w of warnings) console.log(w);
if (notifications.error.length) {
	console.log(`::warning::the system raised ${notifications.error.length} ui.notifications.error during preparation: ${[...new Set(notifications.error)].join(" | ")}`);
}
console.log("");
console.log(`Rendered ${structures.length} structures x ${PART_IDS.length} parts in ${elapsed}s ` +
	`(${findings.partialOutput.length} partial renders).`);

if (failures.length > 0) {
	console.log(`part-render harness FAILED: ${failures.length} failing, ${passed} passing`);
	process.exit(1);
}
console.log(`part-render harness OK: ${passed} checks passing`);
