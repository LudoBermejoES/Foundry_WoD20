#!/usr/bin/env node
/**
 * El GHOUL, comprobado contra el libro y contra el código que de verdad corre.
 *
 *     node .github/scripts/test-ghoul.mjs
 *
 * ## Qué defecto vigila
 *
 * Un Ghoul (Vampiro V20, cap. «Ghouls») es MORTAL con hoja de vampiro. Eso lo obliga a vivir en dos
 * ejes a la vez y es justo lo que se rompe si alguien los confunde:
 *
 *   - `settings.splat` / `settings.variant` = QUÉ ES  -> `mortal` + `ghoul`.
 *   - `settings.variantsheet`               = QUÉ LEE -> `vampire`, que es lo que le da Disciplinas
 *     (`getPowertype` solo devuelve "discipline" para "vampire") y el tema de la hoja.
 *
 * Leer el eje equivocado produce DOS defectos opuestos y los dos son silenciosos:
 *
 *   1. Si algo decide «es mortal» y no mira `variantsheet`, sus Disciplinas se pintan como poderes
 *      genéricos: siguen ahí, con el nombre equivocado encima.
 *   2. Si algo decide «es vampiro» y no mira `variant`, hereda la TABLA DE GENERACIÓN del Vástago y
 *      su reserva de Sangre pasa de 2 a 10, 13 o 15. El libro dice 2 (v20 L15366).
 *
 * El segundo funcionaba por accidente hasta 7.5.145: la plantilla de Splat del Ghoul no declara
 * campo `generation`, así que la guarda `if (bio.splatfields.generation != undefined)` no entraba.
 * Un accidente no es una garantía — basta que un arrastre de Splat, el exportador o un DJ tecleando
 * en Bio escriba esa clave para que vuelva. Aquí se le pone la Generación 8ª a un Ghoul A PROPÓSITO
 * y se exige que su reserva siga siendo 2.
 *
 * ## Por qué ejecuta el código real y no una copia
 *
 * `_prepareCharacterData` es lo que corre en cada `prepareDerivedData`, así que es lo que se llama:
 * se carga `wod-actor-base.js` del árbol real y se invoca su método sobre un `this` mínimo. Una
 * reimplementación del `if` en este fichero podría derivar y aprobar una forma que el sistema no
 * produce — el defecto más repetido de este proyecto es un test que afirma el defecto.
 *
 * ## El truco del árbol copiado
 *
 * El mismo que `test-statarea-identity.mjs` y `test-part-render.mjs`: sin `package.json`, node
 * interpreta los `.js` como CommonJS y los `import` estallan. Se copia `module/` a un temporal con
 * un `{"type":"module"}` al lado. El código bajo prueba es byte-idéntico al que se despliega.
 *
 * Sin red, sin Foundry, ~1s.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-ghoul-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));
fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

const M = (...p) => pathToFileURL(path.join(sandbox, "module", ...p)).href;

/* ------------------------------------------------------------------ *
 * Globales de Foundry, instalados ANTES de los imports.
 * ------------------------------------------------------------------ */

class StubDataModel {
	static defineSchema() { return {}; }
	constructor(data = {}) { Object.assign(this, data); }
}
const StubField = class { constructor(o = {}) { Object.assign(this, o); } };

globalThis.Actor = class Actor {};
globalThis.Item = class Item {};
globalThis.Application = class Application {};
globalThis.FormApplication = class FormApplication { static get defaultOptions() { return {}; } };
globalThis.game = {
	system: { version: "0.0.0-harness" },
	user: { isGM: true },
	i18n: { localize: (k) => String(k ?? ""), format: (k) => String(k ?? ""), translations: {} },
	settings: { get: () => undefined },
	packs: { get: () => undefined, contents: [] },
	actors: { get: () => undefined, contents: [] },
	worldofdarkness: { icons: {}, powers: {} }
};
globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {} } };
globalThis.Hooks = { on() {}, once() {}, off() {}, call() {}, callAll() {} };
globalThis.fromUuidSync = () => null;
globalThis.fromUuid = async () => null;
globalThis.foundry = {
	abstract: { DataModel: StubDataModel, TypeDataModel: class TypeDataModel {} },
	data: {
		fields: {
			StringField: StubField, NumberField: StubField, BooleanField: StubField,
			ObjectField: StubField, ArrayField: StubField, SchemaField: StubField,
			HTMLField: StubField, FilePathField: StubField, ColorField: StubField,
			DocumentIdField: StubField
		}
	},
	utils: {
		duplicate: (o) => JSON.parse(JSON.stringify(o ?? null)),
		mergeObject: (a, b) => Object.assign({}, a, b),
		setProperty: () => {},
		getProperty: () => undefined,
		randomID: () => "ghoulharness0001"
	},
	applications: {
		api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (b) => b, DialogV2: class {} },
		sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
		ux: {
			TextEditor: { implementation: { enrichHTML: async (s) => String(s ?? "") } },
			DragDrop: class DragDrop { constructor(o) { Object.assign(this, o); } bind() {} }
		}
	}
};

/* CONFIG.worldofdarkness es el CONFIG REAL, no un stub: los números del Ghoul son lo que se está
   comprobando, así que renombrar `wod.ghoul` debe romper esta puerta, no colarse por ella. */
const { wod } = await import(M("config.js"));
globalThis.CONFIG = { worldofdarkness: wod, Actor: { dataModels: {} }, Item: { dataModels: {} } };

const { WoDActor } = await import(M("actor", "data", "wod-actor-base.js"));
const { isGhoul, ghoulBloodpoolLimits, GHOUL_BLOODPOOL_MAX, GHOUL_BLOODPOOL_START } =
	await import(M("actor", "data", "ghoul-bloodpool.js"));
const { getSplat } = await import(M("scripts", "splat-helpers.js"));
const { getPowertype } = await import(M("actor", "template", "pc-actor-sheet.js"));

let checks = 0;
const ok = (label) => { checks++; console.log(`  ok - ${label}`); };

/* ============================================================================================ *
 * 1. EL SISTEMA DECLARA LAS CONSTANTES DEL GHOUL, Y SON LAS DEL LIBRO
 * ============================================================================================ */

console.log("wod.ghoul — las constantes declaradas");

assert.ok(wod.ghoul, "config.js ya no declara `wod.ghoul`");
// v20-core-rulebook-es L15366: «tienen una reserva de Sangre de 2 o más, dependiendo de su edad».
assert.equal(wod.ghoul.bloodpoolmax, 2, "el máximo de Sangre de un Ghoul son 2 puntos (v20 L15366)");
// v20-core-rulebook-es L15308: «reserva de Sangre (1)».
assert.equal(wod.ghoul.bloodpoolstart, 1, "un Ghoul empieza con 1 punto de Sangre (v20 L15308)");
assert.equal(wod.ghoul.bloodperturn, 1, "un Ghoul gasta 1 punto de Sangre por turno");
// v20-core-rulebook-es L15352: «limitados a aprender únicamente el primer nivel».
assert.equal(wod.ghoul.disciplinelevelcap, 1, "el tope de nivel de Disciplina de un Ghoul es 1 (v20 L15352)");
ok("declara reserva 2 / inicio 1 / gasto 1 / tope de Disciplina 1, citados al libro");

// El Ghoul sigue siendo variante de `mortal`, que es la decisión de diseño de este cambio. Si
// alguien lo mueve a `vampire` o le inventa un splat propio, esta línea se pone roja y obliga a
// releer el razonamiento antes de tocar `getPowertype`, `getSplat` y el tema de la hoja.
assert.ok(wod.variant.mortal.ghoul, "`ghoul` ya no es una variante de `mortal` en wod.variant");
assert.ok(!wod.variant.vampire?.ghoul, "`ghoul` no debe declararse también como variante de `vampire`");
assert.ok(!wod.splat.ghoul, "`ghoul` no es un splat propio: es `mortal` con `variantsheet: vampire`");
ok("`ghoul` es variante de `mortal` y NO un splat propio ni una variante de `vampire`");

assert.equal(GHOUL_BLOODPOOL_MAX, wod.ghoul.bloodpoolmax, "la constante de reserva del módulo puro y la de CONFIG discrepan");
assert.equal(GHOUL_BLOODPOOL_START, wod.ghoul.bloodpoolstart, "la constante de inicio del módulo puro y la de CONFIG discrepan");
ok("el módulo puro y CONFIG dicen el mismo número");

/* ============================================================================================ *
 * 2. LOS DOS EJES: `variant` dice QUÉ ES, `variantsheet` dice QUÉ LEE
 * ============================================================================================ */

console.log("los dos ejes de un Ghoul");

/** Un Ghoul tal y como lo deja `CreateHelper.SetMortalVariant` (create-helpers.js). */
const ghoulSettings = () => ({
	splat: "mortal",
	variant: "ghoul",
	variantsheet: "vampire",
	game: "vampire",
	haspath: true,
	hasbloodpool: true,
	hasvirtue: true,
	powers: { hasdisciplines: true, defaultmaxvalue: 5 },
	attributes: { defaultmaxvalue: 5 },
	abilities: { defaultmaxvalue: 5 }
});

const ghoulActor = { type: "PC", system: { settings: ghoulSettings() } };

assert.equal(isGhoul(ghoulActor), true, "isGhoul no reconoce a un Ghoul");
ok("isGhoul reconoce a un Ghoul por `settings.variant`");

// La trampa: un Ghoul es `variantsheet: "vampire"` A PROPÓSITO. Si `isGhoul` preguntara por ahí
// respondería «vampiro» y la reserva de Sangre volvería a la tabla de Generación.
assert.equal(
	isGhoul({ system: { settings: { splat: "vampire", variant: "general", variantsheet: "vampire" } } }),
	false,
	"isGhoul confunde a un Vástago con un Ghoul — está leyendo el eje equivocado"
);
assert.equal(isGhoul({ system: { settings: { splat: "mortal", variant: "kinfolk", variantsheet: "werewolf" } } }), false,
	"isGhoul acepta a un Allegado como Ghoul");
assert.equal(isGhoul({}), false, "isGhoul lanza o acepta un actor a medio construir");
assert.equal(isGhoul(undefined), false, "isGhoul lanza con `undefined`");
ok("isGhoul NO se deja engañar por `variantsheet: vampire`, ni por otras variantes, ni por un actor vacío");

// Y el otro eje, el que le da las Disciplinas. Esto es código real: `getSplat` lee `variantsheet`
// PRIMERO (splat-helpers.js) y `getPowertype` solo devuelve "discipline" para "vampire".
assert.equal(getSplat(ghoulActor), "vampire", "getSplat ya no responde `vampire` para un Ghoul");
assert.equal(getPowertype(ghoulActor), "discipline",
	"los poderes de un Ghoul han dejado de ser Disciplinas — `variantsheet` ya no llega a getPowertype");
ok("getSplat -> vampire y getPowertype -> discipline: sus Disciplinas se pintan como Disciplinas");

// Sin `variantsheet` sería un mortal cualquiera y sus Disciplinas caerían a poderes genéricos: es
// exactamente el defecto que la plantilla de Splat empaquetada (`variantsheet: "mortal"`) produce.
const ghoulWithoutSheet = { type: "PC", system: { settings: { ...ghoulSettings(), variantsheet: "mortal" } } };
assert.equal(getPowertype(ghoulWithoutSheet), "power",
	"con `variantsheet: mortal` los poderes DEBEN degradarse — si no, este test no prueba nada");
ok("con `variantsheet: mortal` se degradan a poderes genéricos (el defecto que el exportador evita)");

/* ============================================================================================ *
 * 3. LA TABLA DE GENERACIÓN SIGUE VIVA — PARA LOS VÁSTAGOS
 * ============================================================================================ */

console.log("_calculteMaxBlood — la tabla del Vástago, intacta");

const maxBlood = (gen) => WoDActor.prototype._calculteMaxBlood.call(null, gen);
assert.equal(maxBlood(13), 10, "13ª Generación son 10 puntos de Sangre");
assert.equal(maxBlood(10), 13, "10ª Generación son 13 puntos de Sangre");
assert.equal(maxBlood(8), 15, "8ª Generación son 15 puntos de Sangre");
assert.equal(maxBlood(4), 50, "4ª Generación son 50 puntos de Sangre");
ok("la tabla de Generación del Vástago no se ha tocado");

/* ============================================================================================ *
 * 4. EL CÓDIGO QUE DE VERDAD CORRE: `_prepareCharacterData`
 * ============================================================================================ */

console.log("_prepareCharacterData — la derivación real");

/** Un item Advantage con la forma que produce el exportador de wodchar. */
function advantage(id, over = {}) {
	const doc = {
		_id: `adv${id}`.padEnd(16, "0").slice(0, 16),
		type: "Advantage",
		name: id,
		system: {
			id, group: "", label: `wod.advantages.${id}`,
			permanent: 0, temporary: 0, max: 10, roll: 0, perturn: 0,
			bearing: 0, bearingtext: "", description: "", imbalance: 0,
			settings: { isvisible: true, isremovable: true, order: 0 },
			...over
		}
	};
	// `_prepareCharacterData` fotografía cada Advantage con `toObject(false)` y ESCRIBE sobre la
	// foto, no sobre el item vivo (wod-actor-base.js:280) — mientras las COMPARACIONES siguen
	// leyendo el item vivo. El fixture reproduce esa separación con un clon profundo: si aquí se
	// devolviera `this`, foto e item serían el mismo objeto y el test aprobaría una implementación
	// que solo funciona porque los alias coinciden.
	doc.toObject = () => JSON.parse(JSON.stringify({ _id: doc._id, type: doc.type, name: doc.name, system: doc.system }));
	return doc;
}

/**
 * Corre la derivación REAL sobre un actor mínimo. Se invoca el método del prototipo con un `this`
 * hecho a mano en vez de construir un `WoDActor` porque el constructor de `Actor` es de Foundry;
 * el método solo usa `this.type`, `this.items`, `this._setAbilityMaxValue`, `this._calculteMaxBlood`,
 * `this._calculteMaxBloodSpend` y `this.updateEmbeddedDocuments` (medido con un grep sobre el rango
 * del método), y los cinco últimos vienen del prototipo real salvo la escritura, que se captura.
 */
async function derive({ variant, variantsheet, generation, bloodpool }) {
	const items = [advantage("willpower"), advantage("bloodpool", bloodpool ?? {})];
	const splatfields = generation === undefined ? {} : { generation: { value: generation } };

	const actorData = {
		type: "PC",
		name: "sujeto de prueba",
		items,
		system: {
			settings: {
				...ghoulSettings(),
				variant,
				variantsheet,
				attributes: { defaultmaxvalue: 5 },
				abilities: { defaultmaxvalue: 5 },
				powers: { defaultmaxvalue: 5, hasdisciplines: true }
			},
			attributes: {}, abilities: {}, bio: { splatfields },
			advantages: Object.fromEntries(items.map((i) => [i.system.id, i]))
		}
	};

	const writes = [];
	const self = {
		type: "PC",
		items,
		_setAbilityMaxValue: async () => {},
		_calculteMaxBlood: WoDActor.prototype._calculteMaxBlood,
		_calculteMaxBloodSpend: WoDActor.prototype._calculteMaxBloodSpend,
		_calculteMaxTrait: WoDActor.prototype._calculteMaxTrait,
		updateEmbeddedDocuments: (_type, list) => writes.push(...list)
	};

	await WoDActor.prototype._prepareCharacterData.call(self, actorData);

	return { blood: actorData.system.advantages.bloodpool.system, writes };
}

/* 4a. UN VÁSTAGO SIGUE DERIVANDO DE SU GENERACIÓN. Si esto se rompe, el arreglo del Ghoul ha
      roto a los vampiros — que es la forma en que un arreglo así se va de madre. */
{
	const { blood } = await derive({ variant: "general", variantsheet: "vampire", generation: 8 });
	assert.equal(blood.max, 15, "un Vástago de 8ª Generación ha dejado de tener 15 de reserva");
	assert.equal(blood.perturn, 3, "un Vástago de 8ª Generación ha dejado de gastar 3 por turno");
	ok("un Vástago de 8ª Generación conserva 15 / 3 por turno");
}

/* 4b. EL CASO QUE ESTE FICHERO EXISTE PARA VIGILAR. Mismo campo `generation`, misma 8ª — pero es
      un Ghoul, así que la tabla del Vástago NO se aplica. Sin la guarda esto daría 15. */
{
	const { blood } = await derive({ variant: "ghoul", variantsheet: "vampire", generation: 8 });
	assert.equal(blood.max, 2,
		"UN GHOUL HA HEREDADO LA TABLA DE GENERACIÓN DEL VÁSTAGO — su reserva debe ser 2 (v20 L15366)");
	assert.equal(blood.perturn, 1, "un Ghoul gasta 1 punto de Sangre por turno");
	ok("un Ghoul con Generación 8ª declarada SIGUE teniendo reserva 2 — la tabla no le toca");
}

/* 4c. Y sin campo `generation` — el caso que hoy funcionaba por accidente — también da 2, no el
      10 que trae la plantilla empaquetada. */
{
	const { blood, writes } = await derive({ variant: "ghoul", variantsheet: "vampire" });
	assert.equal(blood.max, 2, "un Ghoul sin Generación se ha quedado con el 10 de la plantilla");
	assert.equal(writes.filter((w) => w["system.max"] === 2).length, 1,
		"la corrección no se ha PERSISTIDO en el item: sin el push a updateEmbeddedDocuments vuelve al render siguiente");
	ok("un Ghoul sin campo Generación baja de 10 a 2, y la corrección se persiste en el item");
}

/* 4d. La Sangre que ya tenía no puede quedar por encima del máximo nuevo. */
{
	const { blood } = await derive({
		variant: "ghoul", variantsheet: "vampire",
		bloodpool: { max: 10, temporary: 7 }
	});
	assert.equal(blood.max, 2, "el máximo del Ghoul no se ha corregido");
	assert.equal(blood.temporary, 2, "la Sangre actual de un Ghoul ha quedado por encima de su máximo");
	ok("una reserva heredada de 7 puntos se recorta a 2 al reconocerlo como Ghoul");
}

/* 4e. Un mortal de a pie no tiene reserva que derivar y nada debe tocarle. */
{
	const { blood } = await derive({ variant: "general", variantsheet: "" });
	assert.equal(blood.max, 10, "algo está tocando la reserva de un mortal sin Generación declarada");
	ok("un mortal sin Generación declarada se queda como estaba");
}

/* ============================================================================================ *
 * 5. LA SENDA DE ILUMINACIÓN NO SE LE OFRECE
 * ============================================================================================ */

console.log("Senda de Iluminación — el control no se ofrece");

/*
 * v20-core-rulebook-es L15308: «Los Ghouls no pueden elegir una Senda de Iluminación».
 *
 * MEDIDO, NO SUPUESTO: el único control que ofrece una Senda en todo el sistema es el `<select
 * name="system.advantages.path.label">` de `settings_attribute.html`, y ya está cerrado por una
 * guarda doble — pide `actor.type == sheettype.vampire` Y `variant == "general"`. Un Ghoul es un
 * `mortal` (o un `PC`) con variante `ghoul`, así que falla las dos.
 *
 * Es decir: el requisito ya se cumplía. Lo que faltaba era que alguien lo dijera y que quedara
 * FIJADO, porque relajar esa guarda a `variant != "kindredeast"` — el cambio de una línea que
 * cualquiera haría para dar Sendas a otra variante de vampiro — se la abriría a los Ghouls sin que
 * nada se quejara. `haspath` NO es este control: es la pista de moralidad, y un Ghoul SÍ tiene
 * Humanidad (misma línea del libro).
 */
const pathSites = [];
for (const dir of ["templates"]) {
	const walk = (d) => {
		for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
			const rel = path.join(d, e.name);
			if (e.isDirectory()) walk(rel);
			else if (/\.(hbs|html)$/.test(e.name)) {
				const src = fs.readFileSync(path.join(REPO, rel), "utf8");
				if (/name="system\.advantages\.path\.label"/.test(src)) pathSites.push(rel);
			}
		}
	};
	walk(dir);
}

assert.deepEqual(pathSites, [path.join("templates", "actor", "parts", "settings_attribute.html")],
	`el selector de Senda ha aparecido en un sitio nuevo (${pathSites.join(", ")}) — hay que volver a comprobar que un Ghoul no lo alcanza`);
ok("el selector de Senda vive en un único fichero");

const settingsAttribute = fs.readFileSync(
	path.join(REPO, "templates", "actor", "parts", "settings_attribute.html"), "utf8");
const selectorIndex = settingsAttribute.indexOf('name="system.advantages.path.label"');
const gateIndex = settingsAttribute.indexOf(
	'{{#if (and (eq actor.type config.sheettype.vampire) (eq actor.system.settings.variant "general"))}}');

assert.ok(gateIndex !== -1,
	"la guarda del selector de Senda ha cambiado de forma: pedía `actor.type == vampire` Y `variant == \"general\"`. " +
	"Si se ha relajado, comprobar que un Ghoul (mortal/PC + variant ghoul) sigue sin poder elegir Senda (v20 L15308)");
assert.ok(gateIndex < selectorIndex,
	"la guarda ya no ENVUELVE al selector de Senda");
ok("la guarda exige `type == vampire` Y `variant == \"general\"`: ninguna de las dos la cumple un Ghoul");

/* Y la contraprueba: la pista de moralidad SÍ se le enciende, porque un Ghoul tiene Humanidad. */
const createHelpers = fs.readFileSync(path.join(REPO, "module", "scripts", "create-helpers.js"), "utf8");
const ghoulBranch = createHelpers.slice(
	createHelpers.indexOf("if (variant == 'ghoul') {"),
	createHelpers.indexOf("if (variant == 'kinfolk') {")
);
assert.ok(ghoulBranch.length > 0, "no se encuentra la rama `ghoul` de SetMortalVariant");
for (const flag of ["haspath", "hasbloodpool", "hasvirtue", "powers.hasdisciplines"]) {
	assert.ok(ghoulBranch.includes(`settings.${flag} = true`),
		`SetMortalVariant ya no enciende \`${flag}\` para un Ghoul`);
}
assert.ok(/variantsheet = CONFIG\.worldofdarkness\.sheettype\.vampire/.test(ghoulBranch),
	"SetMortalVariant ya no le da `variantsheet: vampire` a un Ghoul — sus Disciplinas se degradan a poderes genéricos");
ok("SetMortalVariant le da Humanidad, Sangre, Virtudes, Disciplinas y hoja de vampiro");

/* ============================================================================================ *
 * 6. ARRASTRAR EL SPLAT DE GHOUL DA EL MISMO GHOUL QUE PULSAR EL BOTÓN
 * ============================================================================================ */

console.log("DropSplatToActor — los dos caminos producen el mismo Ghoul");

/*
 * MEDIDO: el Splat «Ghoul [modern]» empaquetado declara `variantsheet: "mortal"`, mientras que
 * `SetMortalVariant` escribe `"vampire"`. `DropSplatToActor` copiaba el campo tal cual, así que un
 * Ghoul creado ARRASTRANDO el Splat veía sus Disciplinas como poderes genéricos y el mismo Ghoul
 * creado con el BOTÓN las veía bien. Dos caminos, dos Ghouls distintos, y la diferencia invisible.
 */
const dropHelpers = fs.readFileSync(path.join(REPO, "module", "scripts", "drop-helpers.js"), "utf8");
const copyIndex = dropHelpers.indexOf("actorData.system.settings.variantsheet = droppedItem.system.settings.variantsheet;");
assert.ok(copyIndex !== -1, "DropSplatToActor ya no copia `variantsheet` del Splat arrastrado — revisar esta puerta");

const afterCopy = dropHelpers.slice(copyIndex);
const normaliseIndex = afterCopy.indexOf('if (actorData.system.settings.variant === "ghoul") {');
assert.ok(normaliseIndex !== -1,
	"DropSplatToActor ya no normaliza el `variantsheet` de un Ghoul: el Splat empaquetado dice \"mortal\" " +
	"y sus Disciplinas se degradan a poderes genéricos al arrastrarlo (create-helpers.js dice \"vampire\")");
assert.ok(/variantsheet = CONFIG\.worldofdarkness\.sheettype\.vampire/.test(
	afterCopy.slice(normaliseIndex, normaliseIndex + 400)),
	"la normalización del Ghoul en DropSplatToActor ya no apunta a `sheettype.vampire`");
ok("DropSplatToActor normaliza el `variantsheet` de un Ghoul a `vampire` DESPUÉS de copiarlo");

console.log(`\nGhoul: ${checks} comprobaciones, todas verdes.`);
