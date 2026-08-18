import { DialogAreteCasting } from "./dialog-aretecasting.js";

/**
 * A REDESIGNED spell-casting screen. Presentation only — every rule is inherited.
 *
 * ## Why a subclass and not a copy
 *
 * The casting RULES (base difficulty from the highest sphere, the ±3 clamp, the roll, the chat
 * card, `_updateObject`'s modifier tally) must never fork: a copy would drift the moment one side
 * is fixed. So this class overrides exactly three things — the template, the context it adds, and
 * the extra listeners the new layout needs — and inherits `_calculateDifficulty`, `_castSpell`,
 * `_updateObject`, `_onDotSphereChange` and the rest verbatim.
 *
 * The old dialog is left untouched and still serves two callers: the rote flow, and the wand macro
 * icon on the V1 sheet (`macro_icons.html`, the `Mage` actor type). The wand is gone from the V2/PC
 * sheet — there, clicking a Sphere's name is the way in, and it pre-selects that Sphere.
 *
 * ## What the redesign fixes (all measured on the live sheet, 2026-08-04)
 *
 * 1. The primary action was mid-page with ~20 modifiers BELOW it: you scrolled past "cast", ticked,
 *    then scrolled back. It is now a footer bar that stays put.
 * 2. The dice pool was NOWHERE on screen. A mage rolls Arete against a difficulty; the old screen
 *    showed only the difficulty. `dicePool` puts the other half back.
 * 3. Nothing said WHY the difficulty was what it was. `breakdown` itemises it.
 * 4. The modifier groups were 20+ flat rows with no sense of what was active. Each group now
 *    reports how many of its rows are on and what they add up to.
 */
export class DialogCasting extends DialogAreteCasting {

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["wod20 wod-dialog casting-dialog mageDialog"],
			template: "systems/worldofdarkness/templates/dialogs/dialog-casting.hbs",
			resizable: true
		});
	}

	/**
	 * Every modifier row on the screen, grouped exactly as the template groups them.
	 *
	 * The weights live HERE and nowhere else on this screen, and they are the same numbers the old
	 * template hard-codes into each input's `value`. `_updateObject` still reads those inputs, so
	 * this table is only ever used to SHOW a subtotal — it can never change what is rolled. If the
	 * two ever disagree the displayed subtotal is wrong, which is why the totals shown per group are
	 * derived and the authoritative difficulty always comes from `object.shownDifficulty`.
	 */
	static MODIFIER_GROUPS = [
		{
			id: "instruments",
			label: "wod.dialog.aretecasting.instruments",
			checks: [
				{ field: "check_instrumentPerson", weight: -1 },
				{ field: "check_instrumentUnique", weight: -1 },
				{ field: "check_instrumentWithout", weight: 3 },
				{ field: "check_instrumentUnnecessary", weight: -1 }
			],
			selects: ["select_instrumentUnfamiliar", "select_instrumentPersonalItem"]
		},
		{
			id: "resonance",
			label: "wod.dialog.aretecasting.resonance",
			checks: [
				{ field: "check_resonanceAppropriate", weight: -1 },
				{ field: "check_resonanceOpposed", weight: 1 },
				{ field: "check_resonanceMysic", weight: -1 }
			],
			selects: []
		},
		{
			id: "time",
			label: "wod.dialog.aretecasting.time",
			checks: [
				{ field: "check_timeFast", weight: 1 },
				{ field: "check_timeBackwards", weight: 3 }
			],
			selects: ["select_spendingTime"]
		},
		{
			id: "general",
			label: "wod.dialog.aretecasting.circumstances",
			checks: [
				{ field: "check_targetDistant", weight: 1 }
			],
			selects: [
				"select_researchDone", "select_nodePresence", "select_effectsSeveral",
				"select_mageDistracted", "select_mageAvatarConflict", "select_dominoEffect",
				"select_deedOutlandish"
			]
		}
	];

	/** The character's Arete roll value, read the same two ways `_castSpell` reads it. */
	_areteValue() {
		const fromApi = this.actor.api?.getAdvantage?.("arete")?.system?.roll;

		if (fromApi !== undefined && fromApi !== null) {
			return parseInt(fromApi) || 0;
		}

		return parseInt(this.actor.system?.advantages?.arete?.roll ?? 0) || 0;
	}

	/** How many rows of a group are currently on, and what they add to the difficulty. */
	_groupState(group) {
		let count = 0;
		let sum = 0;

		for (const check of group.checks) {
			if (this.object[check.field]) {
				count++;
				sum += check.weight;
			}
		}

		for (const field of group.selects) {
			const value = parseInt(this.object[field]) || 0;

			if (value !== 0) {
				count++;
				sum += value;
			}
		}

		return { count, sum };
	}

	/**
	 * Every Feature item's casting-difficulty modifier that applies to a currently-selected Sphere.
	 *
	 * Scans `this.actor.items` for `type === "Feature"` carrying a non-empty
	 * `system.castingModifiers` (a merit/flaw's own `{sphere, label_es, weight}` triples — see
	 * design.md §1/§2), keeps only the entries whose `sphere` matches a Sphere the caster has
	 * currently picked with rank > 0 (`this.object.selectedSpheres`, the same object
	 * `_calculateDifficulty`/`_setDifficulty` already read), and returns one `{id, label, weight}`
	 * row per matching (item, modifier) pair.
	 *
	 * Recomputed on every `getData()` call — i.e. on every render — so a row appears and disappears
	 * as the caster's Sphere selection changes, exactly like the four static groups react to their
	 * own inputs; nothing here is cached across renders.
	 *
	 * `id` is the OWNING ITEM's id, not a per-modifier index. Today no shipped Feature carries more
	 * than one `castingModifiers` entry whose `sphere` could match the same casting at once, so two
	 * rows can never collide. If that ever changes, two entries from the SAME item matching the SAME
	 * casting would render two checkboxes sharing one `name` — a real but currently-unreachable edge
	 * case (the same "not every future shape fits this schema yet" boundary as design.md's Q1), not
	 * solved here.
	 */
	_meritModifiers() {
		const rows = [];

		for (const item of this.actor.items) {
			if (item.type !== "Feature") continue;

			const modifiers = item.system?.castingModifiers;

			if (!Array.isArray(modifiers) || modifiers.length === 0) continue;

			for (const modifier of modifiers) {
				const rank = parseInt(this.object.selectedSpheres?.[modifier.sphere]) || 0;

				if (rank > 0) {
					rows.push({ id: item.id, label: modifier.label_es, weight: modifier.weight });
				}
			}
		}

		return rows;
	}

	/** Count/sum for the `meritmods` group's badge, read from the SAME dynamically-named
	 *  `check_meritmod_<id>` fields `_updateObject`'s generic discovery loop already tallies —
	 *  mirrors `_groupState` above but over a runtime list instead of a static table. */
	_meritModifierGroupState(meritModifiers) {
		let count = 0;
		let sum = 0;

		for (const row of meritModifiers) {
			if (this.object[`check_meritmod_${row.id}`]) {
				count++;
				sum += row.weight;
			}
		}

		return { count, sum };
	}

	/** The itemised "why is the difficulty this number" list. Display only. */
	_breakdown() {
		const rows = [];
		const base = parseInt(this.object.baseDifficulty);

		if (base > -1) {
			rows.push({ label: game.i18n.localize("wod.dialog.casting.basedifficulty"), value: base, isBase: true });
		}

		const modifiers = parseInt(this.object.sumSelectedDifficulty) || 0;
		if (modifiers !== 0) {
			rows.push({ label: game.i18n.localize("wod.dialog.aretecasting.difficultymod"), value: modifiers });
		}

		const extra = parseInt(this.object.difficultyModifier) || 0;
		if (extra !== 0) {
			rows.push({ label: game.i18n.localize("wod.dialog.aretecasting.additionaldifficulty"), value: extra });
		}

		const quintessence = parseInt(this.object.quintessence) || 0;
		if (quintessence !== 0) {
			rows.push({ label: game.i18n.localize("wod.dialog.aretecasting.quintessence"), value: quintessence });
		}

		return rows;
	}

	/**
	 * fix-formula-casting fix — `super.getData()` (`DialogAreteCasting.getData()`) is `async`
	 * (since `add-prism-of-focus-foundry`'s D13 Práctica-resolution `await`), so calling it WITHOUT
	 * `await` returns the wrapping Promise, not the resolved data object. Every property this
	 * method used to attach afterward (`data.casting`, `data.casting.groups`, ...) was being set on
	 * that Promise wrapper — silently discarded the moment Foundry's render pipeline awaits
	 * `getData()`, since awaiting unwraps to the ORIGINAL object the base method resolved, not the
	 * wrapper. Verified with a minimal reproduction (a synchronous override of an async base
	 * method, mutating the un-awaited return value): the mutation never survives the await. Adding
	 * `async`/`await` here makes every subsequent `data.xxx = ...` write onto the actual resolved
	 * object, so it correctly reaches the template.
	 */
	async getData() {
		const data = await super.getData();
		const areteModifier = parseInt(this.object.areteModifier) || 0;

		// fix-formula-casting D3 — a Fórmula declaring both Atributo+Habilidad shows/rolls THAT
		// pool instead of Areté (`_castSpell`, dialog-aretecasting.js, applies the same branch to
		// the actual roll — this only mirrors it for display).
		const isFormulaRoll = this.object.isFormulaRoll();
		const arete = isFormulaRoll ? 0 : this._areteValue();
		const formulaPool = isFormulaRoll ? this._formulaPool() : null;
		const dicePoolBase = isFormulaRoll
			? formulaPool.attributeValue + formulaPool.abilityValue
			: arete;

		data.casting = {
			arete: arete,
			areteModifier: areteModifier,
			isFormulaRoll: isFormulaRoll,
			formulaPool: formulaPool,
			// A pool can never go below zero dice; the roller would reject it anyway.
			dicePool: Math.max(0, dicePoolBase + areteModifier),
			// `shownDifficulty` is the authoritative, already-clamped value the roll will use.
			difficulty: this.object.shownDifficulty,
			// -1 is the sentinel `_calculateDifficulty` leaves when no sphere is chosen yet.
			hasDifficulty: parseInt(this.object.baseDifficulty) > -1,
			breakdown: this._breakdown(),
			// The 2..10 buttons are inert unless this is on — `_setDifficulty` returns early
			// otherwise. The old screen showed them always, which made nine dead buttons.
			canPickDifficulty: !!this.object.ignoreSphereBaseDifficulty,
			groups: {}
		};

		for (const group of DialogCasting.MODIFIER_GROUPS) {
			const state = this._groupState(group);

			// Groups the user opened stay open across the re-render that `submitOnChange` fires on
			// every tick; an untouched group starts open only if something in it is already active.
			state.open = (this._openGroups && this._openGroups[group.id] !== undefined)
				? this._openGroups[group.id]
				: state.count > 0;

			data.casting.groups[group.id] = state;
		}

		// The fifth, genuinely data-driven group: one row per matching merit/flaw modifier, unknown
		// until the actor's items and current Sphere selection are read (§3 of design.md — the four
		// groups above are hand-written; this one cannot be, because its rows depend on the actor).
		const meritModifiers = this._meritModifiers();

		// Also stashed on `this.object` (not just returned in `data`) so `_updateObject`'s label
		// lookup — shared, inherited code in `dialog-aretecasting.js` — can resolve a dynamic
		// `check_meritmod_<id>` field's label without reaching back into this subclass.
		this.object.meritModifiers = meritModifiers;
		this.object.meritModifierLabels = Object.fromEntries(meritModifiers.map(row => [row.id, row.label]));

		const meritGroupState = this._meritModifierGroupState(meritModifiers);
		meritGroupState.open = (this._openGroups && this._openGroups["meritmods"] !== undefined)
			? this._openGroups["meritmods"]
			: meritGroupState.count > 0;

		data.casting.groups.meritmods = meritGroupState;
		data.casting.meritModifiers = meritModifiers;

		data.casting.anyModifier = Object.values(data.casting.groups).some(g => g.count > 0);

		return data;
	}

	/**
	 * A selector that finds the focused control again after the re-render replaces it.
	 *
	 * `submitOnChange` re-renders on EVERY change, which throws the DOM away and puts focus back on
	 * the body. On a 20-row form that means a keyboard user is dumped at the top after each tick,
	 * so the modifier list cannot be walked at all. Nothing in Handlebars survives its own
	 * re-render, so the anchor has to be an attribute that is stable across renders: a field name,
	 * or a dot's index within its named sphere group.
	 */
	_focusAnchor() {
		const active = document.activeElement;

		if (!active || !this.element?.[0]?.contains(active)) {
			return null;
		}

		if (active.name) {
			// Radios share a name, so the value is what distinguishes them.
			return active.type === "radio"
				? `[name="${active.name}"][value="${active.value}"]`
				: `[name="${active.name}"]`;
		}

		const dot = active.closest(".resource-value-step");

		if (dot) {
			const group = dot.parentNode?.dataset?.name;

			if (group) {
				return `.resource-value[data-name="${group}"] .resource-value-step[data-index="${dot.dataset.index}"]`;
			}
		}

		const group = active.closest("details.casting-modifier-group");

		if (group) {
			return `details.casting-modifier-group[data-group-id="${group.dataset.groupId}"] > summary`;
		}

		return null;
	}

	async _render(force, options) {
		const anchor = this._focusAnchor();

		await super._render(force, options);

		if (!anchor) return;

		// Restore ONLY when the re-render is what lost the focus. If focus is anywhere else the
		// user moved it deliberately — stealing it back would fight them.
		if (document.activeElement !== document.body) return;

		this.element?.[0]?.querySelector(anchor)?.focus();
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Remember which modifier groups the user had open across the re-render that every change
		// triggers (`submitOnChange`), otherwise ticking a box slams every group shut again.
		html.find("details.casting-modifier-group").on("toggle", event => {
			const id = event.currentTarget.dataset.groupId;

			if (!id) return;

			this._openGroups = this._openGroups ?? {};
			this._openGroups[id] = event.currentTarget.open;
		});

		// `_setDifficulty` mutates `object.baseDifficulty` and swaps the `.active` class by hand but
		// never re-renders — harmless on the old screen, where nothing else displayed the number,
		// but here the action bar reads `object.shownDifficulty`, so without this the headline
		// difficulty would sit stale while the button underneath it looked selected. Bound AFTER
		// super's handler, so it runs once the base class has finished updating the object.
		html.find(".dialog-difficulty-button").on("click", () => this.render());
	}
}
