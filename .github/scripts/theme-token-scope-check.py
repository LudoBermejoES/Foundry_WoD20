#!/usr/bin/env python3
"""`css/darkmode.css` may not redefine a light-theme token outside a dark scope.

WHY THIS EXISTS
---------------
Written 2026-08-05 after a user reported "in v3 the light theme is like the dark theme". The v3
stylesheet turned out to be innocent — measured in headless Chromium, 795 of 820 elements change
colour between the two themes. Half the real cause was this, and it had been true for as long as
both files existed:

`css/darkmode.css` opened with a `:root` block defining eighteen `--main-<line>-mid/dim-color`
tokens. `css/wod.css:108` is ALSO a `:root` block defining the same eighteen with the LIGHT values.
`:root` and `:root` are the same specificity (0,1,0), so load order decides — and `system.json`
lists `darkmode.css` LAST. The dark block therefore won in BOTH themes. Nine of the eighteen
actually differ (`dim` is `0.12` in wod.css, `0.2` here), so every light theme in this system was
drawing those nine with the dark value, and one of the two definitions was simply dead.

Nothing could see it. It is not a literal colour (so `v3-css-check.py` is silent), not a selector
scoping error inside one file, and not visible in a diff of either file alone — the bug only exists
in the RELATIONSHIP between two files plus the load order in a third.

WHAT IT CHECKS
--------------
For every rule in `css/darkmode.css` whose selector is not dark-scoped, every custom property it
defines must NOT also be defined by any other stylesheet. If it is, the two definitions race and
the dark one wins in the light theme.

A token defined ONLY in `darkmode.css` is fine and is deliberately not flagged: `--darkmode-black`,
`--darkmode-textcolor-dark` and friends have no light counterpart to lose to, and they must stay at
`:root` because `css/chat.css` reaches them from Foundry's OWN `.theme-dark` class — the chat
sidebar is outside every WoD application root and never carries `.wod-theme-dark`. That is a carve
-out by principle, not an allowlist: the rule is "do not contradict a light value", and a token with
no light value cannot.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS = ROOT / "css"
DARK = CSS / "darkmode.css"
DARK_SCOPE = "wod-theme-dark"

RULE = re.compile(r"(?:^|\})([^{}@]+?)\{([^{}]*)\}", re.M | re.S)
DECL = re.compile(r"(--[\w-]+)\s*:")


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def defined_properties(path: Path) -> set[str]:
    """Every custom property this stylesheet defines, at any selector."""
    out: set[str] = set()
    for _sel, body in RULE.findall(strip_comments(path.read_text(encoding="utf-8"))):
        out.update(DECL.findall(body))
    return out


def main() -> int:
    if not DARK.is_file():
        print(f"theme-token-scope-check: {DARK.relative_to(ROOT)} is missing", file=sys.stderr)
        return 2

    others = sorted(p for p in CSS.glob("*.css") if p != DARK)

    if not others:
        print("theme-token-scope-check: found no other stylesheets to compare against",
              file=sys.stderr)
        return 2

    # Where each token gets its light value. A token may be set by several per-line sheets.
    light_home: dict[str, list[str]] = {}
    for p in others:
        for prop in defined_properties(p):
            light_home.setdefault(prop, []).append(p.name)

    errors: list[str] = []
    checked = unscoped_rules = 0

    body_text = strip_comments(DARK.read_text(encoding="utf-8"))

    for sel, body in RULE.findall(body_text):
        parts = [p.strip() for p in sel.split(",") if p.strip()]

        if not parts:
            continue

        # Dark-scoped if EVERY selector in the list carries the class. If even one part does not,
        # that part applies in the light theme and the whole declaration block rides along with it.
        if all(DARK_SCOPE in p for p in parts):
            continue

        loose = [p for p in parts if DARK_SCOPE not in p]
        props = DECL.findall(body)

        if not props:
            continue

        unscoped_rules += 1

        for prop in props:
            checked += 1

            if prop in light_home:
                errors.append(
                    f"css/darkmode.css: {prop} is defined under {loose[0]!r}, which is NOT "
                    f"dark-scoped, and is also defined in {', '.join(light_home[prop])}. "
                    f"darkmode.css loads LAST in system.json, so at equal specificity this value "
                    f"wins in the LIGHT theme too and the light definition is dead. "
                    f"Move it under .{DARK_SCOPE}.")

    if errors:
        print(f"theme token scope check FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"theme token scope check OK: {len(light_home)} light-theme token(s) across "
          f"{len(others)} stylesheet(s); {unscoped_rules} non-dark-scoped rule(s) in darkmode.css "
          f"defining {checked} propert(ies), none of which contradicts a light value")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
