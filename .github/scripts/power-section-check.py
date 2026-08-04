#!/usr/bin/env python3
"""Offline check on the power-section wiring: `assets/data/sheet/powertab.js`.

WHY THIS EXISTS
---------------
7.5.44 moved the mage Rote list off the Powers tab and onto the Stats tab, and dropped
`"rotes"` from `power.mage.primary` believing that removed the section. It did not, and
the list rendered TWICE for every mage holding Rotes until 7.5.48.

`BuildPowerSections` (`module/scripts/item-helpers.js:1036-1048`) walks `primary` first
and then walks `defaultOrder`, adding **every id it has not already added**. So `primary`
decides ORDER, not membership: to drop a section you must remove it from BOTH lists. The
mistake is invisible in a diff — the file you edit looks correct on its own — and no
existing gate could see it: it is valid JS, the templates are unchanged, and nothing is
misspelled. Only the two lists read TOGETHER are wrong.

WHAT IT CHECKS
--------------
 1. No section that another tab now owns is still reachable through `powertab.js`. The
    ownership table is `RENDERED_ELSEWHERE` below — add a row whenever a block moves off
    the Powers tab, and this gate holds the move for you.
 2. Every id named in `primary` or `defaultOrder` has a definition in `BuildPowerSections`.
    An id with no definition is silently skipped at runtime, so a typo — or a section that
    was never implemented — costs a line that renders nothing with no error. (`"paths"`,
    listed for vampire, is exactly this: no definition exists. It is recorded as a known
    gap rather than failing the build, because deleting it is a behaviour change that
    wants a human.)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POWERTAB = ROOT / "assets" / "data" / "sheet" / "powertab.js"
ITEM_HELPERS = ROOT / "module" / "scripts" / "item-helpers.js"

#: section id -> (splat it must not appear for, where it lives instead). A section listed
#: here renders on another tab; reaching it through powertab.js means it renders twice.
RENDERED_ELSEWHERE: dict[str, tuple[str, str]] = {
    "rotes": ("mage", "templates/actor/parts/stats_rotes.hbs, via stats_advantages.hbs"),
}

#: ids that are declared but have no definition in BuildPowerSections. Each is inert — the
#: runtime skips it. Listed so the check can pass while still naming them.
#:
#: `paths` sits in the SHARED `defaultOrder`, so it is nominally declared for all nine splats
#: even though only vampire's `primary` names it. It is reported once, not nine times.
KNOWN_UNDEFINED: dict[str, str] = {
    "paths": "in vampire's `primary` and in the shared `defaultOrder`, but no definition exists "
             "in BuildPowerSections, so it has never rendered for any line",
}


def strip_comments(js: str) -> str:
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    return re.sub(r"^\s*//.*$", "", js, flags=re.M)


def parse_powertab(js: str) -> tuple[dict[str, list[str]], list[str]]:
    """{splat: primary[]}, defaultOrder[] — read from the `power:` block only."""
    body = strip_comments(js)

    primary: dict[str, list[str]] = {}
    for splat, arr in re.findall(r"(\w+)\s*:\s*\{\s*primary\s*:\s*\[([^\]]*)\]", body):
        primary[splat] = re.findall(r'"([^"]+)"', arr)

    m = re.search(r"defaultOrder\s*:\s*\[([^\]]*)\]", body)
    default_order = re.findall(r'"([^"]+)"', m.group(1)) if m else []

    return primary, default_order


def parse_definitions(js: str) -> set[str]:
    """The ids `BuildPowerSections` can actually build, from its `definitions` object."""
    body = strip_comments(js)
    start = body.find("const definitions = {")

    if start == -1:
        return set()

    # each entry is `name: {` ... `id: "name"` — match on the id field, which is explicit
    tail = body[start:start + 12000]

    return set(re.findall(r'\bid:\s*"([^"]+)"', tail))


def main() -> int:
    if not POWERTAB.is_file() or not ITEM_HELPERS.is_file():
        print("power-section-check: expected files missing — refusing to pass", file=sys.stderr)
        return 2

    primary, default_order = parse_powertab(POWERTAB.read_text(encoding="utf-8"))
    defined = parse_definitions(ITEM_HELPERS.read_text(encoding="utf-8"))

    if not primary or not default_order or not defined:
        print(f"power-section-check: parsed {len(primary)} splat(s), {len(default_order)} "
              f"default order entr(ies), {len(defined)} definition(s) — one is empty, so the "
              f"file shape changed and this gate can no longer see what it checks",
              file=sys.stderr)
        return 2

    errors: list[str] = []
    notes: list[str] = []

    for splat, prim in sorted(primary.items()):
        # what BuildPowerSections will actually assemble for this splat
        effective = list(prim) + [d for d in default_order if d not in prim]

        for sid in effective:
            owner = RENDERED_ELSEWHERE.get(sid)
            if owner and owner[0] == splat:
                via = "primary" if sid in prim else "defaultOrder"
                errors.append(
                    f"{splat}: section {sid!r} is still reachable via {via}, but it renders on "
                    f"another tab ({owner[1]}). Every {splat} holding one would see it TWICE. "
                    f"`primary` only sets ORDER — remove the id from BOTH lists.")

            if sid not in defined:
                if sid in KNOWN_UNDEFINED:
                    notes.append(f"{sid!r} — {KNOWN_UNDEFINED[sid]}")
                else:
                    errors.append(
                        f"{splat}: section {sid!r} has no definition in BuildPowerSections, so it "
                        f"is skipped silently at runtime and renders nothing.")

    for n in sorted(set(notes)):
        print(f"::warning::power-section-check: {n}")

    if errors:
        print(f"power-section check FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"power-section check OK: {len(primary)} splat(s), {len(default_order)} ordered "
          f"section(s), {len(defined)} definition(s) — nothing renders on two tabs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
