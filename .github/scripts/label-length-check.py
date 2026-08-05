#!/usr/bin/env python3
"""A string rendered in a FIELD-LABEL slot must be a label, in every language.

WHY THIS EXISTS
---------------
Written 2026-08-05, immediately after a real regression that every other gate in this repo waved
through. A script adding the ten `wod.power.empty.*` empty-state sentences wrote one of them over
`wod.bio.wraith.death` — the "Death" caption on a wraith's Biography tab — in BOTH `en.json` and
`es.json`. The field label became:

    "No Arcanoi are recorded yet. Use Add item above to create one."

Nothing caught it, and it is worth being precise about why, because the gap is structural:

  * `sheet-invariants.py` I11 checks that every literal key a template names EXISTS. This key
    existed before and after — only its VALUE changed.
  * `template-structure-check.py` parses markup, and the markup did not change.
  * `test-part-render.mjs` renders every part against 173 structures, but it asserts on structure,
    not on prose; a 60-character caption renders perfectly happily.
  * A JSON diff shows it, and it was in a 24-line diff that also added twenty intended lines.

So the whole existing battery is blind to "the right key, the wrong string". This gate closes
exactly that hole, for the one class of string where wrongness is mechanically detectable: a
caption next to an input has a length budget, and a sentence blows it.

WHAT IT CHECKS
--------------
Every key used as a FIELD LABEL — collected from the two places this system declares them:

  1. `label: "wod.…"` in `assets/data/sheet/*.js`   (the data-driven bio/settings field tables)
  2. `{{localize "wod.…"}}` inside an element carrying `floating-label` in any template

must, IN EVERY LANGUAGE FILE THAT DEFINES IT, be at most MAX_LABEL characters.

The cap is 45. Measured over all 151 label slots on the day this was written, the longest real
label in English is 25 characters ("Permanent beginning value"), so the bound has ~80% headroom
and is nowhere near any legitimate caption — including German and Spanish, which run longest. It
is not a style rule about writing shorter labels; it is a tripwire sized to catch a PARAGRAPH
arriving where a caption belongs, which is the failure that actually happened.

A missing key is NOT an error here: Foundry falls back to `en.json`, and only EN is required to be
complete. That is I11's job, per language, and duplicating it would just add a second voice saying
the same thing.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAX_LABEL = 45

#: `label: "wod.x.y"` in the sheet data tables.
DATA_LABEL = re.compile(r'label:\s*"([\w.]+)"')

#: `{{localize "wod.x.y"}}` sitting inside an element whose class list contains `floating-label`.
FLOATING_LABEL = re.compile(r'class="[^"]*floating-label[^"]*"[^>]*>\s*\{\{localize "([\w.]+)"\}\}')


def lookup(tree: dict, key: str) -> str | None:
    """Resolve a dotted key, returning None unless it lands on a string."""
    node = tree

    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]

    return node if isinstance(node, str) else None


def collect_label_keys() -> tuple[set[str], int, int]:
    keys: set[str] = set()

    data_dir = ROOT / "assets" / "data" / "sheet"
    data_files = sorted(data_dir.glob("*.js"))

    for f in data_files:
        keys |= set(DATA_LABEL.findall(f.read_text(encoding="utf-8")))

    templates = sorted(
        [*(ROOT / "templates").rglob("*.hbs"), *(ROOT / "templates").rglob("*.html")])

    for f in templates:
        keys |= set(FLOATING_LABEL.findall(f.read_text(encoding="utf-8")))

    # Only i18n keys — a `label:` may also carry a plain string in some tables.
    return {k for k in keys if k.startswith("wod.")}, len(data_files), len(templates)


def main() -> int:
    keys, n_data, n_templates = collect_label_keys()

    if not keys:
        print("label-length-check: collected zero label keys — the declaration shape changed and "
              "this gate can no longer see what it checks", file=sys.stderr)
        return 2

    lang_files = sorted((ROOT / "lang").glob("*.json"))

    if not lang_files:
        print("label-length-check: no language files found", file=sys.stderr)
        return 2

    errors: list[str] = []
    checked = 0

    for lf in lang_files:
        tree = json.loads(lf.read_text(encoding="utf-8"))

        for key in sorted(keys):
            value = lookup(tree, key)

            # Absent is fine — Foundry falls back to en.json, and I11 owns key completeness.
            if value is None:
                continue

            checked += 1

            if len(value) > MAX_LABEL:
                errors.append(
                    f"lang/{lf.name}: {key} is rendered as a FIELD LABEL but is {len(value)} "
                    f"characters (cap {MAX_LABEL}): {value[:70]!r}… A caption next to an input has "
                    f"a length budget; this is a sentence. The regression this gate exists for "
                    f"overwrote a caption with an empty-state sentence and every other gate passed.")

    if errors:
        print(f"label length check FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"label length check OK: {len(keys)} field-label key(s) from {n_data} sheet data file(s) "
          f"and {n_templates} template(s); {checked} localized value(s) across {len(lang_files)} "
          f"language file(s), all within {MAX_LABEL} characters")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
