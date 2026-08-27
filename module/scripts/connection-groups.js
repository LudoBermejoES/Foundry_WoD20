/**
 * EL CENSO DE RELACIONES, construido una sola vez para las DOS hojas que lo pintan.
 *
 * ============================================================================================
 * POR QUÉ ESTO VIVE EN `scripts/` Y NO EN `pc-actor-sheet.js`
 * ============================================================================================
 * Nació ahí (`add-contacts-allies-roster`), cuando el censo de relaciones era solo del PJ. Desde
 * `add-chantry-roster-tab` lo pinta también la pestaña «Censo» de la hoja de Capilla/Constructo, y
 * `ChantryActorSheetV2` no hereda de `PCActorSheet` NI PUEDE (design.md D1 de
 * `add-chantry-inventory-effects-and-roster`: 2.864 líneas preparando atributos, habilidades, salud
 * y Esferas que una Capilla no tiene). Dejarlo allí obligaría a la hoja de Capilla a importar toda
 * esa clase para usar una función.
 *
 * El precedente es exacto y es el que se sigue: `module/scripts/gear-lists.js`, el preparador de
 * listas de objetos que también llaman las dos hojas. Un módulo de `scripts/` no es una clase base.
 *
 * Lo único que se movió aquí es el CONSTRUCTOR DE GRUPOS con sus dos ayudantes (retrato y
 * descripción enriquecida). Nada más cambió de comportamiento: `pc-actor-sheet.js` lo importa y sus
 * dos llamantes (`prepareFeatureContext` para v2, `prepareConnectionsContext` para v3) siguen
 * pidiéndolo igual, sin opciones, que es lo que mantiene la salida del PJ byte-idéntica.
 */

import { resolveDescription } from "./compendium-description.js";

/**
 * El marcador de retrato de una entrada del censo SIN retrato propio y SIN actor enlazado: una
 * silueta humana, que es lo correcto para las 18 relaciones con forma de persona del PJ.
 *
 * EXPORTADO desde `add-chantry-roster-tab` porque la Capilla lo necesita para lo contrario: dos de
 * sus ocho Rasgos con censo (`library` y `node`) no son gente, así que su resolvedor pasa OTRO
 * marcador y compara contra el que le den, no contra esta constante. Ver `resolveConnectionPortrait`
 * y `buildConnectionGroups`.
 */
export const CONNECTION_PLACEHOLDER_IMG = "icons/svg/mystery-man.svg";

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
function resolveConnectionPortrait(entry, placeholder = CONNECTION_PLACEHOLDER_IMG) {
	const own = (entry.system?.portrait ?? "").trim();
	if (own !== "") return own;

	const text = `${entry.system?.description ?? ""} ${entry.system?.details ?? ""}`;
	const match = text.match(/@UUID\[(Actor\.[A-Za-z0-9]+)\]/);
	if (match) {
		try {
			const linked = fromUuidSync(match[1]);
			const img = linked?.img ?? "";
			/* Se compara contra AMBOS marcadores, no solo contra el que toque: un actor enlazado que
			   nunca eligió retrato lleva la silueta del core, y copiarla aquí daría el mismo dibujo
			   por un camino distinto — pero además la Capilla puede pasar un marcador propio, y una
			   Capilla enlazada a un actor cuyo `img` fuese ese mismo fichero volvería a "tiene
			   retrato" siendo mentira. `add-chantry-roster-tab`, tarea 5.4. */
			if (img !== "" && img !== CONNECTION_PLACEHOLDER_IMG && img !== placeholder) return img;
		}
		catch (err) {
			// A dangling @UUID is a GM typo, not a sheet failure — fall through to the placeholder.
			console.warn(`WoD | connection portrait: could not resolve ${match[1]}`, err);
		}
	}

	return placeholder;
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
export const isConnectionEntry = (item) =>
	item?.type === "Feature" && item.system?.type === "wod.types.connection" && item.system?.isvisible !== false;

/**
 * add-chantry-roster-tab D2.1 — EL RESOLVEDOR DEL PJ, extraído tal cual y ahora pasable como
 * parámetro.
 *
 * Sigue siendo exactamente lo que era: busca entre los Items Trasfondo del propio actor el que casa
 * `flags["wod20-char"].id === relation` (con respaldo por nombre) y saca de él la etiqueta YA
 * localizada por el compendio y los círculos reales.
 *
 * Se hace inyectable porque UNA CAPILLA NO TIENE NI UN SOLO ITEM TRASFONDO — medido: sus Rasgos son
 * números bajo `system.traits` (`template.json` → `Actor.Chantry.traits`). Con este resolvedor una
 * Capilla saldría con la cadena cruda («allies») por título y `rating: null`, o sea sin círculos.
 * @param {Actor} actor
 * @returns {(relation: string) => {label: string, rating: number|null}}
 */
function backgroundGroupResolver(actor) {
	const backgrounds = (actor?.items ?? []).filter(
		(item) => item.type === "Feature" && item.system?.type === "wod.types.background",
	);
	const backgroundFor = (relation) =>
		backgrounds.find((b) => b.flags?.["wod20-char"]?.id === relation)
		?? backgrounds.find((b) => (b.name ?? "").toLowerCase() === String(relation).toLowerCase());

	return (relation) => {
		const background = backgroundFor(relation);
		return {
			label: background?.name ?? (relation === "" ? game.i18n.localize("wod.types.connection") : relation),
			rating: background ? Number(background.system?.value ?? 0) : null,
		};
	};
}

/**
 * @typedef {object} ConnectionGroupOptions
 * @property {(relation: string) => {label: string, rating: number|null}} [resolveGroup]
 *           De dónde salen el título y los círculos de un grupo. Por omisión, los Items Trasfondo
 *           del actor (el PJ). La Capilla pasa el suyo: `wod.chantry.traits.<clave>` y
 *           `system.traits[clave]`.
 * @property {(relation: string) => string} [placeholderFor]
 *           El marcador de retrato de una entrada sin retrato, POR RASGO (D4, adaptación 1):
 *           `library` y `node` no son gente y no pueden salir con silueta humana.
 * @property {string[]} [alwaysGroups]
 *           Grupos que se pintan aunque no tengan ni una entrada — para que la Capilla desbloqueada
 *           ofrezca los ocho botones de crear. Vacío en el PJ, que es lo que conserva su
 *           `return []` de siempre cuando no hay ninguna relación.
 * @property {string} [locale]
 *           Locale para ordenar por etiqueta. Sin él, `localeCompare` a secas, que es lo que el PJ
 *           ha hecho siempre y lo que mantiene su salida byte-idéntica; la Capilla pasa
 *           `CONFIG.language`, porque por clave saldría «Aliados, Ancianos…» mal ordenado y un
 *           `localeCompare` sin locale pone «Arcano» antes de «Ancianos» (el defecto que 7.5.125
 *           arregló en la lista de Rasgos).
 */

/**
 * add-contacts-allies-roster — groups `wod.types.connection` Features by `system.relation` and resolves
 * each group's heading through the resolver it is given (the PC's own Background items by default).
 *
 * Returns `[{ relation, label, rating, count, entries[] }]`, sorted by label so the blocks are stable.
 *
 * `label`/`rating` come from the Background Feature whose `flags["wod20-char"].id` matches the relation —
 * so the name is whatever the compendium already localized it to, and the dots are the real ones. This is
 * what lets the sheet show "Contactos ●●● (4)" and thereby DISPLAY the tension between dots and headcount
 * without enforcing equality, which the books do not require (design D1/D4).
 *
 * Async because each entry's description is enriched (see `resolveConnectionDescription`).
 * @param {Actor} actor
 * @param {ConnectionGroupOptions} [options]
 */
export async function buildConnectionGroups(actor, options = {}) {
	const entries = (actor?.items ?? []).filter(isConnectionEntry);
	const alwaysGroups = options.alwaysGroups ?? [];

	// Sin entradas Y sin grupos forzados no hay nada que pintar. La segunda mitad de la condición es
	// nueva y es la que deja al PJ exactamente como estaba: `alwaysGroups` está vacío para él.
	if ((entries.length === 0) && (alwaysGroups.length === 0)) return [];

	const resolveGroup = options.resolveGroup ?? backgroundGroupResolver(actor);
	const placeholderFor = options.placeholderFor ?? (() => CONNECTION_PLACEHOLDER_IMG);

	const grouped = new Map();

	const groupFor = (relation) => {
		if (!grouped.has(relation)) {
			const resolved = resolveGroup(relation) ?? {};
			grouped.set(relation, {
				relation,
				label: resolved.label ?? relation,
				rating: resolved.rating ?? null,
				entries: [],
			});
		}
		return grouped.get(relation);
	};

	// Los forzados PRIMERO, para que un Rasgo sin entradas exista como grupo vacío.
	for (const relation of alwaysGroups) groupFor(relation);

	for (const entry of entries) {
		groupFor(entry.system.relation || "").entries.push(entry);
	}

	for (const group of grouped.values()) {
		group.entries.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
		group.count = group.entries.length;
		const placeholder = placeholderFor(group.relation);
		for (const entry of group.entries) {
			entry.portraitSrc = resolveConnectionPortrait(entry, placeholder);
			entry.hasPortrait = entry.portraitSrc !== placeholder;
			entry.enrichedDescription = await resolveConnectionDescription(entry);
			entry.hasDescription = entry.enrichedDescription.trim().length > 0;
		}
	}

	return Array.from(grouped.values()).sort((a, b) =>
		a.label.localeCompare(b.label, options.locale || undefined));
}
