# `assets/data/splats/` — text sources for hand-authored `packs/splats` documents

`packs/splats` (the **Templates** compendium) is a compiled LevelDB directory. A binary
diff is unreviewable, and this repository has **no test job and no branch protection** —
`git push` to `main` *is* the deploy to the live Foundry server. So any Splat document
authored by hand keeps its **reviewable JSON source here**, and the binary is derived
from it. Same idea as `wod20-compendium-es`'s `src/` → `build_packs.sh` → `packs/`,
except that this repo has no build tooling, so the step is documented rather than
scripted.

Only hand-authored documents live here. The other ~95 Splat items in the pack were
authored in Foundry itself and have no source file.

## `mortal-v20-modern.json` — "Mortal V20 [modern]"

`_id: YoJbmntYNFqsgt06`, `settings.id: "mortal"`, `settings.game: "hunter"`,
`settings.variant: "general"`, `settings.variantsheet: "mortal"`, `era: "modern"`.

### Why it exists

`packs/splats` already carries **four** `Mortal [modern]` Splat items — one per parent
line (`game`: `werewolf` / `changeling` / `mage` / `vampire`) — and all four ship the
**same 30 abilities**, including `art` and `enigmas` and *excluding* `awareness` and
`finance`. That is the Mage/Changeling-flavoured mortal list: `Art` is an M20 Talent and
`Enigmas` an M20/W20 Knowledge.

There was no `Mortal [modern]` for `game: "hunter"`. The character tool
(`wod20-char`) therefore exports hunter PCs off the `game: "vampire"` copy
(`!items!hp7v8fAofTDwRL84`, mirrored as
`wod20-char/web/server/services/foundry/splat-templates/mortal-modern.json`) and rewrites
`settings.game` at load time. A **V20 mortal** does not use the Art/Enigmas list: it uses
the standard V20 list, which is exactly what `Vampire [modern]`
(`!items!DzvMAiNxSLTy1pcH`) and `dataability.vampire.modern`
(`assets/data/sheet/ability.js`) already carry.

This document is that fifth per-line mortal template. It is **additive**: none of the
four existing `Mortal [modern]` items is touched, and `dataability.mortal.modern` is
not touched either — editing that would move every mortal actor in the world.

Nothing in this system references the new item. It becomes live only when a GM drops it
on a PC, or when `wod20-char` is pointed at it.

### Exactly how it differs from its base

Cloned field-for-field from `Mortal [modern]` (`game: "vampire"`,
`!items!hp7v8fAofTDwRL84`). Every difference, in full:

| field | base | this document |
|---|---|---|
| `_id` | `hp7v8fAofTDwRL84` | `YoJbmntYNFqsgt06` |
| `name` | `Mortal [modern]` | `Mortal V20 [modern]` |
| `sort` | `350000` | `360000` |
| `system.settings.game` | `vampire` | `hunter` |
| `system.abilities` | the 30 with `art`/`enigmas` | the 30 from `Vampire [modern]`, verbatim |
| `_stats.coreVersion` | `13.351` | `14.360` |
| `_stats.systemVersion` | `5.0.6` | `7.5.31` |
| `_stats.createdTime` / `modifiedTime` | — | fresh |

`system.settings` (apart from `game`), `system.advantages` (the sole `Willpower`),
`system.bio`, `system.health`, `img`, `folder`, `ownership`, `effects` and `flags` are
byte-identical to the base — so the only behavioural variable is the ability list.

The `_stats` vintage is stamped honestly rather than inherited. The base's `5.0.6` /
`13.351` is stale, and `wod20-char`'s README §14 records the repair work that stale
stamp already caused once.

The ability delta against the base is exactly the four divergent
`(line, category, key)` pairs that `openspec/changes/close-ability-source-and-taxonomy-residues`
§3 is about:

* removed: `talent/art`, `knowledge/enigmas`
* added: `talent/awareness`, `knowledge/finance`

All 30 entries keep the real `Compendium.worldofdarkness.ability{talent,skill,knowledge}.Item.*`
uuids they carry in `Vampire [modern]`, so each resolves to a compendium document
instead of being synthesised from an English `capitalize(id)`.

## Re-applying a source file to `packs/splats`

The Foundry CLI's `package unpack`/`pack` fails on this pack
(`LEVEL_ITERATOR_NOT_OPEN`, foundryvtt-cli#65). Read and write the LevelDB directly with
`classic-level`, under **Node ≤ 24**:

```js
// npm i classic-level   (Node 24; classic-level does not build cleanly on 25)
import fs from 'node:fs'
import { ClassicLevel } from 'classic-level'

const doc = JSON.parse(fs.readFileSync('assets/data/splats/mortal-v20-modern.json', 'utf8'))
const db = new ClassicLevel('packs/splats', { valueEncoding: 'json', keyEncoding: 'utf8' })
await db.open()
await db.put(`!items!${doc._id}`, doc)   // keyed by _id — idempotent, safe to re-run
await db.close()
```

Two things that will bite:

* **Do not write a `_key` property into the document.** The Foundry CLI adds one when it
  packs; the documents already in *this* pack do not have one, so adding it would make
  the new entry the odd one out.
* **`classic-level` leaves a `LOCK` file behind after `close()`.** There is no
  `.gitignore` in this repo, so it would be committed — and
  `.github/scripts/system-preflight.py` **hard-errors** on any committed `LOCK` under
  `packs/`. Delete it before staging.

Foundry must not be running against the tree while this happens, for the reason the
deploy workflow's header spells out at length.
