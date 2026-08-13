#!/usr/bin/env node
/**
 * Offline behavioural harness for `module/scripts/stale-description-refresh.js`'s
 * `resyncActorTraits`/`buildCompendiumIndex` — which had NO test coverage at all before this file
 * (measured: no `.github/scripts/*.mjs` referenced either export, and neither is wired into
 * `deploy.yml`'s preflight job before this change added it there).
 *
 *     node .github/scripts/test-trait-resync-line.mjs
 *
 * WHY THIS EXISTS (propagate-health-bonus-traits)
 * ------------------------------------------------
 * `buildCompendiumIndex` used to be called with `actor.system.settings.splat`. For a wodchar
 * character exported as a mortal VARIANT of a supernatural line (e.g. a mage/mortal Sleeper),
 * `settings.splat` is literally `"mortal"` while `settings.game` ("the parent game line" per
 * `splat-helpers.js`) is the real book line, e.g. `"mage"`. There is no `mortal-merits` pack, so
 * indexing by `splat` found nothing and the actor's line-specific traits (a `Corpulento` merit,
 * concretely — Raffela Diemer, verified live) were silently skipped forever: `resyncActorTraits`
 * counts an unindexed item as `skipped`, not `notFound`, so nothing was even logged. The actor's
 * per-migration-version flag (`bonuslistResyncedFromCompendiumV1`/`V2`) was set regardless, so the
 * defect could not self-heal on a later run either — this is why the fix bumped the flag key AND
 * changed the resolution order, not one alone.
 *
 * THE FIX: resolve `settings.game` first, `settings.splat` as fallback (see the header comment on
 * `buildCompendiumIndex` in the module under test for the full reasoning, including why this is
 * the OPPOSITE of `getSplat()`'s priority and correctly so — that function answers a different
 * question). This harness pins that resolution order and its two guard cases: a genuinely
 * splat-less mortal must still resolve to nothing (no regression on the documented, intentional
 * no-op case), and an item whose `bonuslist` is already populated must never be overwritten.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "wod-trait-resync-"));
process.on("exit", () => fs.rmSync(sandbox, { recursive: true, force: true }));
fs.cpSync(path.join(REPO, "module"), path.join(sandbox, "module"), { recursive: true });
fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

globalThis.game = { packs: [] };
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };

const logged = { warn: [] };
const realWarn = console.warn;
function captureConsole() { console.warn = (...a) => logged.warn.push(a.map(String).join(" ")); }
function releaseConsole() { console.warn = realWarn; }

const { resyncActorTraits } = await import(
	path.join(sandbox, "module", "scripts", "stale-description-refresh.js")
);

let passed = 0;
const failures = [];
async function test(name, fn) {
	logged.warn.length = 0;
	captureConsole();
	try {
		await fn();
		releaseConsole();
		passed++;
		console.log(`  ok   ${name}`);
	} catch (err) {
		releaseConsole();
		failures.push({ name, err });
		console.log(`  FAIL ${name}`);
		console.log(`         ${String(err.message).split("\n").join("\n         ")}`);
	}
}

const MODULE_ID = "wod20-compendium-es";

/** A compendium pack whose index/getDocument this migration actually calls (NOT getDocuments —
 * that is the OTHER harness's, ability-enrichment.js's, different API surface). */
function fakePack(packName, docsById) {
	return {
		documentName: "Item",
		collection: `${MODULE_ID}.${packName}`,
		async getIndex() {
			return Object.entries(docsById).map(([id, d]) => ({ _id: id, name: d.name, type: d.type }));
		},
		async getDocument(id) {
			return docsById[id] ?? null;
		}
	};
}

/** An embedded trait Item, recording what `update()` is asked to write. */
function fakeItem(name, type, bonuslist) {
	const item = { name, type, system: { bonuslist }, updated: null };
	item.update = async (patch) => { item.updated = patch; return item; };
	return item;
}

console.log("\nA. `game` resolves the line when `splat` is a mortal variant (the fix)");

await test("a mage/mortal actor's Corpulento is fixed from the mage-line pack, not skipped", async () => {
	game.packs = [fakePack("mage-merits", {
		yizq: { name: "Corpulento", type: "Feature", system: { bonuslist: [{ settingtype: "bruised", type: "health_buff", value: 1, isactive: true }] } }
	})];
	const corpulento = fakeItem("Corpulento", "Feature", []);
	const actor = { system: { settings: { splat: "mortal", game: "mage" } }, items: [corpulento] };

	const stats = await resyncActorTraits(actor);

	assert.equal(stats.bonusFixed, 1, "settings.game was not consulted for a mortal-variant actor");
	assert.deepEqual(corpulento.updated, {
		"system.bonuslist": [{ settingtype: "bruised", type: "health_buff", value: 1, isactive: true }]
	});
});

console.log("\nB. no regression on the documented, intentional no-op case");

await test("a genuinely splat-less mortal (no `game` at all) still fixes nothing", async () => {
	game.packs = [fakePack("mage-merits", {
		yizq: { name: "Corpulento", type: "Feature", system: { bonuslist: [{ settingtype: "bruised", type: "health_buff", value: 1, isactive: true }] } }
	})];
	const corpulento = fakeItem("Corpulento", "Feature", []);
	const actor = { system: { settings: { splat: "mortal" } }, items: [corpulento] };

	const stats = await resyncActorTraits(actor);

	assert.equal(stats.bonusFixed, 0, "a plain mortal actor with no game field started matching a real line's packs");
	assert.equal(corpulento.updated, null);
});

console.log("\nC. this migration only ever ADDS a missing bonuslist, never replaces one");

await test("an item with an existing bonuslist is left untouched (a hand-tuned buff survives)", async () => {
	game.packs = [fakePack("mage-merits", {
		yizq: { name: "Corpulento", type: "Feature", system: { bonuslist: [{ settingtype: "bruised", type: "health_buff", value: 99, isactive: true }] } }
	})];
	const hand_tuned = [{ settingtype: "bruised", type: "health_buff", value: 1, isactive: true }];
	const corpulento = fakeItem("Corpulento", "Feature", hand_tuned);
	const actor = { system: { settings: { splat: "mortal", game: "mage" } }, items: [corpulento] };

	const stats = await resyncActorTraits(actor);

	assert.equal(stats.bonusFixed, 0, "a non-empty bonuslist was overwritten");
	assert.equal(corpulento.updated, null);
});

await test("a non-refreshable item type is skipped, not matched", async () => {
	game.packs = [fakePack("mage-merits", {
		yizq: { name: "Corpulento", type: "Feature", system: { bonuslist: [{ settingtype: "bruised", type: "health_buff", value: 1, isactive: true }] } }
	})];
	const weapon = fakeItem("Corpulento", "Melee Weapon", []);
	const actor = { system: { settings: { splat: "mortal", game: "mage" } }, items: [weapon] };

	const stats = await resyncActorTraits(actor);

	assert.equal(stats.bonusFixed, 0);
	assert.equal(weapon.updated, null);
});

console.log("");
if (failures.length) {
	console.error(`trait-resync line harness FAILED: ${failures.length} of ${passed + failures.length} checks`);
	for (const f of failures) console.error(`  - ${f.name}`);
	process.exit(1);
}
console.log(`trait-resync line harness OK: ${passed} checks passing`);
