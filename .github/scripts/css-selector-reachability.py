#!/usr/bin/env python3
"""Every COMPOUND class selector must be satisfiable by some element in some template.

WHY THIS EXISTS
---------------
Written 2026-08-05, from a defect that shipped and that no existing gate could see.

`css/wod.css` carried `.wod-sheet .secondaryAbility.ability-headlineWidth { font-style: italic }`.
Italics are the ONLY thing distinguishing a secondary ability from a primary one in the shared
talent/skill/knowledge column. A compound selector requires every class on ONE element — and on
2026-08-04 the ability description eye moved the label into a `wod-namecell` flex cell, so
`ability-headlineWidth` went onto the wrapping `<div>` (it carries the row's width) while
`secondaryAbility` stayed on the `<label>` (it styles the text). Both classes still exist. They are
on two different elements. The rule stopped matching anything, silently, and the sheet lost a
distinction nobody could see was gone until a human looked at it and said "it isn't italic".

Everything was green:
  * `stats_abilities.hbs` still emits `secondaryAbility` — a grep for the class finds it;
  * `template-structure-check.py` balances tags and resolves partials, and never reads a selector;
  * `v3-css-check.py` checks colours, scoping and `!important` on ONE stylesheet, not whether a
    rule matches an element;
  * the module harnesses execute `module/`, which has no opinion about CSS.
A rule that matches nothing is indistinguishable from a rule that works, unless something compares
the two sides. That comparison is what this file is.

WHAT IT CHECKS
--------------
For every compound class selector (`.a.b`, two or more classes with no whitespace between them) in
every committed stylesheet, at least one element in some committed template must be able to carry
ALL of those classes at once. "Able to" is deliberate: a template emits classes conditionally
(`{{#if x}}foo{{/if}}`), so the check collects the class tokens an element COULD carry and asks
whether the selector's set is a subset. That is the weakest question worth asking, and it is enough
to catch a rule whose classes live on different elements — which is the whole defect class.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It is not a CSS engine and does not try to be. It ignores single-class selectors (a class used
nowhere is dead weight, not a broken rule, and the repo has many for historical reasons), element
and attribute selectors, and descendant relationships (`.a .b` is two elements by construction and
therefore always satisfiable). It cannot know whether two conditionals are mutually exclusive, so a
selector whose classes CAN coexist passes even if they never do in practice. False negatives, never
false positives: everything it reports is a selector that no element in the tree can satisfy.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS_DIRS = ("css",)
TEMPLATE_DIRS = ("templates",)

# path -> reason. Every entry needs a CLOSES WHEN clause: a selector tolerated forever is a rule
# nobody intends to work, and should be deleted rather than pinned.
KNOWN_UNREACHABLE: dict[str, str] = {
    # Four PRE-EXISTING dead rules, measured on this gate's first clean run (2026-08-05). In each
    # case the FIRST class exists in no template and no JS at all, so the rule has never matched
    # anything — these are not the defect this file was written for (two live classes drifting onto
    # different elements), they are leftovers from removed markup.
    #
    # Named rather than deleted, deliberately: they sit in other lines' stylesheets (exalted, mummy,
    # responsive), and removing a rule can change a layout nobody has looked at. Whoever owns those
    # sheets should delete the rule AND the class, together.
    "css/exalted.css:exaltedsorcery-headline.headlineGroup":
        "`exaltedsorcery-headline` is in no template. CLOSES WHEN the exalted sorcery block is "
        "either rebuilt with that class or the rule is deleted.",
    "css/exalted.css:exaltedcharm-headline.headlineGroup":
        "`exaltedcharm-headline` is in no template. CLOSES WHEN the exalted charm block is either "
        "rebuilt with that class or the rule is deleted.",
    "css/mummy.css:hekau-headline.headlineGroup":
        "`hekau-headline` is in no template. CLOSES WHEN the Hekau block is either rebuilt with "
        "that class or the rule is deleted.",
    "css/responsive.css:resource-value-static-step.active":
        "`resource-value-static-step` is in no template; the live dot steps use "
        "`resource-value-step`. CLOSES WHEN the static variant is reintroduced or the rule goes.",
}


def _strip_css_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", " ", text, flags=re.S)


def _element_class_sets() -> list[tuple[str, int, set[str]]]:
    """Every template element's POSSIBLE class tokens.

    One entry per `class="..."` attribute. Handlebars conditionals are flattened: the tokens inside
    `{{#if}}…{{/if}}` are collected as possible, because the question is whether an element CAN
    carry the combination, not whether it always does. `{{...}}` interpolations are dropped — a
    class computed at runtime cannot be resolved here, and guessing would produce false passes.
    """
    out: list[tuple[str, int, set[str]]] = []
    for directory in TEMPLATE_DIRS:
        base = ROOT / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if path.suffix not in (".hbs", ".html"):
                continue
            text = path.read_text(encoding="utf-8")
            text = re.sub(r"\{\{!--.*?--\}\}", " ", text, flags=re.S)
            for match in re.finditer(r'class\s*=\s*"([^"]*)"', text):
                raw = match.group(1)
                # Keep the words inside block helpers, drop the helper syntax itself and any
                # `{{expr}}` interpolation whose value is unknown at rest.
                cleaned = re.sub(r"\{\{[#/][^}]*\}\}", " ", raw)
                cleaned = re.sub(r"\{\{[^}]*\}\}", " ", cleaned)
                tokens = {t for t in re.split(r"\s+", cleaned) if t and re.fullmatch(r"[A-Za-z0-9_-]+", t)}
                if tokens:
                    line = text[: match.start()].count("\n") + 1
                    out.append((path.relative_to(ROOT).as_posix(), line, tokens))
    return out


def _runtime_class_tokens() -> set[str]:
    """Class names the JAVASCRIPT adds at runtime, which no template can be expected to carry.

    Without this the check is wrong rather than strict: `.item.active`, `.power-item.drag-over-bottom`
    and friends are all real, working rules whose second class is applied by `classList.add()` during
    a drag or a tab switch. Measured on the first run: 11 of 11 reports were this, and exactly none
    was a defect — a guard whose output is all noise gets muted, which would have cost more than it
    saved.

    A selector is therefore satisfiable when the STATIC part of it fits on one element and the rest
    is a class the code can add to that element. That still catches the defect this file was written
    for: `secondaryAbility` and `ability-headlineWidth` are both TEMPLATE classes, on two different
    elements, and neither is ever added at runtime.
    """
    tokens: set[str] = set()
    base = ROOT / "module"
    if not base.is_dir():
        return tokens
    patterns = (
        r"classList\.(?:add|remove|toggle|contains)\(([^)]*)\)",
        r"\.addClass\(([^)]*)\)",
        r"\.removeClass\(([^)]*)\)",
        r"\.toggleClass\(([^)]*)\)",
        r"className\s*=\s*([^;]*)",
        # The BIGGEST source, and the one a first pass missed: ApplicationV2 puts these on the
        # window FRAME, not in any template. `classes: ["wod20", "wod-sheet", …]` in DEFAULT_OPTIONS,
        # plus the per-splat and per-theme classes computed at render time. Without this the guard
        # reported 57 selectors, ~all of them the frame — noise that would have got it muted.
        r"classes\s*:\s*\[([^\]]*)\]",
        r"_getSplatClass|cssClass\s*[:=]\s*([^;,\n]*)",
    )
    for path in sorted(base.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                for literal in re.findall(r"['\"`]([^'\"`]+)['\"`]", match.group(1)):
                    for token in re.split(r"\s+", literal):
                        if token and re.fullmatch(r"[A-Za-z0-9_-]+", token):
                            tokens.add(token)

    # Per-splat and per-theme frame classes are composed from data (`game.settings` + the actor's
    # splat), never written as a literal beside `classes:`. Derived from the stylesheets' own file
    # names plus the theme switch, so a new line needs no edit here.
    for path in sorted((ROOT / "css").glob("*.css")):
        tokens.add(path.stem)
        tokens.add(path.stem + "Dialog")
        tokens.add(path.stem + "Item")
    tokens.update({"wod20", "wod-sheet", "wod-item", "window-app", "application",
                   "wod-theme-dark", "wod-theme-light", "pc-actor-v3", "actorv2", "itemv2",
                   "wod-dialog", "dialog-top"})
    return tokens


def _compound_selectors() -> list[tuple[str, int, tuple[str, ...]]]:
    """Every compound class selector in every stylesheet, as its set of class names."""
    found: list[tuple[str, int, tuple[str, ...]]] = []
    for directory in CSS_DIRS:
        base = ROOT / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.css")):
            text = _strip_css_comments(path.read_text(encoding="utf-8"))
            for match in re.finditer(r"([^{}]+)\{", text):
                prelude = match.group(1)
                if "@" in prelude:            # at-rules carry no element selectors
                    continue
                line = text[: match.start()].count("\n") + 1
                for selector in prelude.split(","):
                    # The last compound in the chain is the element the rule paints. Earlier
                    # compounds are ancestors and are satisfiable by other elements by definition.
                    parts = [p for p in re.split(r"[\s>+~]+", selector.strip()) if p]
                    if not parts:
                        continue
                    target = parts[-1]
                    if not target.startswith("."):
                        continue
                    if re.search(r"[\[:#]", target):   # attribute / pseudo / id — out of scope
                        continue
                    classes = tuple(c for c in target.split(".") if c)
                    if len(classes) >= 2:
                        found.append((path.relative_to(ROOT).as_posix(), line, classes))
    return found


def main() -> int:
    elements = _element_class_sets()
    selectors = _compound_selectors()
    runtime = _runtime_class_tokens()

    if not elements:
        print("css-selector-reachability: FOUND NO TEMPLATE ELEMENTS — refusing to pass",
              file=sys.stderr)
        return 2
    if not selectors:
        print("css-selector-reachability: FOUND NO COMPOUND SELECTORS — refusing to pass",
              file=sys.stderr)
        return 2

    problems: list[str] = []
    for css_file, line, classes in selectors:
        key = f"{css_file}:{'.'.join(classes)}"
        if key in KNOWN_UNREACHABLE:
            continue
        # Only the part the TEMPLATES must supply has to fit on one element; anything the code adds
        # at runtime can land on whatever element it already matched.
        wanted = set(classes) - runtime
        if not wanted or any(wanted <= tokens for _, _, tokens in elements):
            continue
        # Report WHERE each class does live: "on two different elements" is the diagnosis, and
        # without it the message reads as "delete this rule", which is usually wrong.
        homes = {}
        for cls in classes:
            sites = [f"{f}:{ln}" for f, ln, tokens in elements if cls in tokens][:2]
            homes[cls] = sites or ["(nowhere)"]
        problems.append(
            f"{css_file}:{line}: `.{'.'.join(classes)}` can be satisfied by NO element — a "
            f"compound selector needs every class on ONE element. " +
            "; ".join(f"`{c}` is on {h}" for c, h in homes.items()) +
            ". If they belong on different elements, split the rule; if one moved, follow it.")

    print(f"  template elements with classes : {len(elements)}")
    print(f"  compound class selectors       : {len(selectors)}")
    print(f"  runtime classes from module/*.js: {len(runtime)}")
    print(f"  pins                          : {len(KNOWN_UNREACHABLE)}")

    if problems:
        print(f"\ncss selector reachability FAILED: {len(problems)} unsatisfiable selector(s)",
              file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print("\ncss selector reachability OK: every compound class selector can be satisfied by some "
          "element in some template")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
