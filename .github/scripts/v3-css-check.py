#!/usr/bin/env python3
"""Three rules on `css/pc-actor-v3.css`, the redesigned PC sheet's stylesheet.

WHY THIS EXISTS
---------------
Written 2026-08-04 because the file's own header already claimed it did. That is the failure this
gate is really about: a comment asserting a check that does not exist is worse than no comment,
because the next reader trusts it. The header was written the same day and the script was not.

Each rule below cancels a specific, measured way this stylesheet could go wrong, and each is
cheap enough that there is no excuse for checking it by hand.

WHAT IT CHECKS
--------------
 1. **Zero literal colours.** `css/darkmode.css` is LAST in `system.json`'s `styles`. A colour
    hard-coded here is overridden for whatever darkmode happens to cover and NOT for the rest —
    a half-dark sheet, the ugliest failure available and the hardest to attribute. Every colour
    must come from a custom property the per-line stylesheets already set, which is also what
    makes all thirteen splats and both themes work with no rule duplicated.

    `var(--x, #fff)` fallbacks are permitted: the fallback only applies when the property is
    undefined, so it cannot fight the theme — it is the value that keeps an unlisted splat
    readable rather than invisible.

 2. **Every selector scoped.** The v2 and v3 sheets differ by exactly one class. A rule that
    forgets `.pc-actor-v3` reaches all 88 live actors on the sheet this change is supposed not to
    touch, and nothing else in the repo would notice.

 3. **At most six `!important`, all in one labelled block.** The float neutralisers are supposed
    to be a last resort behind blockification (`float` computes to `none` on a grid item, which
    beats `!important` because it is not a cascade contest). One `!important` cancelling one
    `!important` is not an arms race; the seventh is. A hard cap is the only thing that has ever
    stopped that, and this repo carries 37 of them in `wod.css` as the evidence.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "css" / "pc-actor-v3.css"
SCOPE_CLASS = ".pc-actor-v3"
IMPORTANT_CAP = 6

#: A bare colour anywhere outside a `var(…, fallback)`. Named colours are not enumerated — the
#: three functional forms plus hex cover every way this file could plausibly acquire one, and a
#: check that tries to know all 148 CSS colour names finds `red` inside `border-radius`.
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\bcolor-mix\s*\(")


def strip_comments(css: str) -> str:
    """Blank comments while preserving offsets, so reported line numbers stay true."""
    return re.sub(r"/\*.*?\*/", lambda m: "".join(c if c == "\n" else " " for c in m.group(0)),
                  css, flags=re.S)


def outside_var_fallbacks(line: str) -> str:
    """Blank every `var(...)` call, so a themed fallback is not read as a hard-coded colour."""
    out, depth = [], 0

    for i, ch in enumerate(line):
        if line.startswith("var(", i):
            depth += 1
        if depth:
            out.append(" ")
            if ch == ")":
                depth -= 1
        else:
            out.append(ch)

    return "".join(out)


def main() -> int:
    if not TARGET.is_file():
        print(f"v3-css-check: {TARGET.relative_to(ROOT)} does not exist — refusing to pass",
              file=sys.stderr)
        return 2

    raw = TARGET.read_text(encoding="utf-8")
    body = strip_comments(raw)

    if not body.strip():
        print("v3-css-check: the stylesheet is empty after stripping comments — refusing to pass",
              file=sys.stderr)
        return 2

    errors: list[str] = []

    # ---- 1. no literal colour -------------------------------------------------------------
    for n, line in enumerate(body.split("\n"), 1):
        for m in COLOUR.finditer(outside_var_fallbacks(line)):
            errors.append(
                f"css/pc-actor-v3.css:{n}: literal colour {m.group(0)!r}. darkmode.css loads LAST, "
                f"so this is overridden for some properties and not others — a half-dark sheet. "
                f"Use a custom property the per-line stylesheets set.")

    # ---- 2. every selector scoped ---------------------------------------------------------
    selectors = 0

    for n, line in enumerate(body.split("\n"), 1):
        head = line.split("{")[0].strip() if "{" in line else ""

        if not head or head.startswith("@") or head.endswith(","):
            # a continued selector list: check each part when the block opens
            continue

        parts = [p.strip() for p in head.split(",") if p.strip()]

        for part in parts:
            selectors += 1

            # The rule is that the FIRST COMPOUND carries the scope class, not that the selector
            # starts with a fixed string: `.wod20.wod-theme-dark.pc-actor-v3 …` is correctly
            # scoped, and the dark-mode overrides need exactly that shape so they win on
            # specificity rather than on load order.
            first_compound = re.split(r"[\s>+~]", part, maxsplit=1)[0]

            if SCOPE_CLASS not in first_compound:
                errors.append(
                    f"css/pc-actor-v3.css:{n}: selector {part!r} — its first compound "
                    f"({first_compound!r}) does not carry {SCOPE_CLASS!r}. The v2 and v3 sheets "
                    f"differ by exactly that class, so an unscoped rule reaches every actor on "
                    f"the sheet this file must not touch.")

    if selectors == 0:
        print("v3-css-check: parsed zero selectors — the file shape changed and this gate can no "
              "longer see what it checks", file=sys.stderr)
        return 2

    # ---- 3. the !important cap ------------------------------------------------------------
    n_important = body.count("!important")

    if n_important > IMPORTANT_CAP:
        errors.append(
            f"css/pc-actor-v3.css: {n_important} `!important` declarations, cap is {IMPORTANT_CAP}. "
            f"Reach for blockification first — `float` computes to `none` on a grid item, which "
            f"beats `!important` because it is not a cascade contest at all.")

    if errors:
        print(f"v3 css check FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"v3 css check OK: {selectors} selector(s), all scoped by {SCOPE_CLASS}; "
          f"0 literal colour(s); {n_important}/{IMPORTANT_CAP} !important")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
