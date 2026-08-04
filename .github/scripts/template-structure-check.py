#!/usr/bin/env python3
"""Offline structural check over every committed Handlebars/HTML template.

WHY THIS EXISTS
---------------
Added 2026-08-04, after a real defect that every existing gate missed. Adding the
description eye to `stats_abilities.hbs` left three Handlebars comments terminated with
`--}` instead of `--}}` (a Python f-string had eaten one brace: `}}` means a literal `}`).
Handlebars then treats the comment as UNTERMINATED and swallows everything up to the next
`--}}` — in that file, the `<div>`, the `<i>` and the `<label>` opening tag of the row. The
sheet renders a broken row, and:

  * `system-preflight.py` said OK — it validates the manifest, JSON parse-ability, the
    import graph and `systems/...` reference paths, and never looks inside a template;
  * `js-syntax-check.sh` said OK — a `.hbs` file is not JavaScript;
  * all three module-logic harnesses said OK — they execute `module/`, not templates.

The bug was caught only by diffing tag counts against `HEAD` by hand. This file makes that
comparison a gate instead of a habit. Handlebars itself is not vendored here (`lib/` has
only `editor` and `koption`, and there is no `package.json`), so this is a structural check
rather than a real compile: it cannot catch every template error, but it catches the class
that silently deletes markup.

WHAT IT CHECKS, per template
----------------------------
 1. every `{{!--` has a matching `--}}` (the defect above);
 2. `{{#if|each|unless|with}}` and `{{/if|each|unless|with}}` counts agree, and the block
    names nest in the right order — a `{{/each}}` closing an `{{#if}}` is accepted by the
    counter but not by Handlebars;
 3. HTML tag balance for the containers a sheet row is built from (`div`, `label`, `i`,
    `table`, `tr`, `td`, `ul`, `li`, `select`, `span`, `a`), measured with comments and
    `{{!-- --}}` blocks stripped, because markup inside a comment is not markup;
 4. `{{>` partial includes resolve to a file that exists — the same reference class
    `system-preflight.py` checks for `systems/...` strings, but scoped to includes.

Balance is asserted per file against ITSELF, not against a baseline: a template that was
already unbalanced would fail here on its first run, which is the point. If one of the 60-odd
existing templates turns out to have a pre-existing imbalance, fix it or add it to
KNOWN_IMBALANCED with a reason — do not weaken the check.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIRS = ("templates",)
SUFFIXES = (".hbs", ".html")

# Void / self-closing elements never carry a closing tag, so they are excluded from the
# balance count rather than special-cased in it.
BALANCED_TAGS = ("div", "label", "table", "tr", "td", "th", "ul", "ol", "li",
                 "select", "span", "a", "i", "form", "fieldset", "legend", "p")

BLOCK_HELPERS = ("if", "each", "unless", "with")

# path -> reason. These four are PRE-EXISTING and REAL — not false positives. Measured
# 2026-08-04 on this gate's first run, by walking each file and watching the nesting depth go
# NEGATIVE, which means a closing tag closes something that was never opened (a bare count
# could not tell that apart from a missing close):
#
#   bio_vampire_background.html  <span> final -2, first negative at line 75
#   dialog-attribute.hbs         <div>  final -1, first negative at line 60
#   dialog-power.hbs             <div>  final -1, first negative at line 73
#   rangedweapon-sheet.html      <div>  final -1, first negative at line 230
#
# Listed rather than fixed ON PURPOSE, and this is a scope decision, not laziness: they are
# four unrelated dialogs/sheets, a browser's error recovery has been compensating for them for
# however long they have existed, and DELETING a stray close can change the layout the
# recovery was producing. Fixing them needs eyes on each dialog, which is its own change in a
# repo whose every push deploys to the live server. What this entry buys is that they are now
# NAMED with a line number instead of invisible, and that no NEW imbalance can hide among
# them: only tag balance is skipped for these four, and only for them — comment terminators,
# block nesting and partial includes are still checked here as everywhere else.
KNOWN_IMBALANCED: dict[str, str] = {
    "templates/actor/parts/vampire/bio_vampire_background.html":
        "pre-existing: 2 stray </span>, depth first negative at line 75",
    "templates/dialogs/dialog-attribute.hbs":
        "pre-existing: 1 stray </div>, depth first negative at line 60",
    "templates/dialogs/dialog-power.hbs":
        "pre-existing: 1 stray </div>, depth first negative at line 73",
    "templates/sheets/rangedweapon-sheet.html":
        "pre-existing: 1 stray </div>, depth first negative at line 230",
}


def strip_comments(text: str) -> str:
    """Remove Handlebars and HTML comments. Runs only AFTER the terminator check, so an
    unterminated comment cannot make this silently eat the rest of the file."""
    text = re.sub(r"\{\{!--.*?--\}\}", "", text, flags=re.S)
    text = re.sub(r"\{\{!.*?\}\}", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def check_comment_terminators(text: str, rel: str, errors: list[str]) -> bool:
    opens = [m.start() for m in re.finditer(r"\{\{!--", text)]
    closes = [m.start() for m in re.finditer(r"--\}\}", text)]
    if len(opens) == len(closes):
        return True
    # Report the first unterminated one with its line, which is what a human needs.
    for pos in opens:
        nxt = text.find("--}}", pos)
        if nxt == -1:
            line = text[:pos].count("\n") + 1
            errors.append(f"{rel}:{line}: `{{{{!--` is never terminated by `--}}}}`"
                          f" — Handlebars will swallow the markup that follows"
                          f" (a `--}}` with ONE brace is the usual cause)")
            return False
    errors.append(f"{rel}: {len(opens)} `{{{{!--` vs {len(closes)} `--}}}}`")
    return False


def check_blocks(text: str, rel: str, errors: list[str]) -> None:
    stack: list[tuple[str, int]] = []
    pattern = re.compile(r"\{\{([#/])(" + "|".join(BLOCK_HELPERS) + r")\b")
    for m in pattern.finditer(text):
        kind, name = m.group(1), m.group(2)
        line = text[:m.start()].count("\n") + 1
        if kind == "#":
            stack.append((name, line))
        else:
            if not stack:
                errors.append(f"{rel}:{line}: `{{{{/{name}}}}}` with no open block")
                continue
            open_name, open_line = stack.pop()
            if open_name != name:
                errors.append(f"{rel}:{line}: `{{{{/{name}}}}}` closes "
                              f"`{{{{#{open_name}}}}}` opened at line {open_line}")
    for name, line in stack:
        errors.append(f"{rel}:{line}: `{{{{#{name}}}}}` is never closed")


def check_tag_balance(text: str, rel: str, errors: list[str]) -> None:
    if rel in KNOWN_IMBALANCED:
        return
    for tag in BALANCED_TAGS:
        opens = len(re.findall(r"<" + tag + r"(?=[\s>/])", text, flags=re.I))
        closes = len(re.findall(r"</" + tag + r"\s*>", text, flags=re.I))
        # Self-closing usage (`<i ... />`) closes itself.
        selfclosed = len(re.findall(r"<" + tag + r"\b[^>]*/>", text, flags=re.I))
        if opens - selfclosed != closes:
            errors.append(f"{rel}: <{tag}> opens {opens - selfclosed} vs closes {closes}")


def check_partials(text: str, rel: str, errors: list[str]) -> None:
    for m in re.finditer(r'\{\{>\s*"([^"]+)"', text):
        ref = m.group(1)
        line = text[:m.start()].count("\n") + 1
        if not ref.startswith("systems/worldofdarkness/"):
            continue
        target = ROOT / ref[len("systems/worldofdarkness/"):]
        if not target.is_file():
            errors.append(f"{rel}:{line}: partial include does not exist: {ref}")


def main() -> int:
    files: list[Path] = []
    for d in TEMPLATE_DIRS:
        base = ROOT / d
        if base.is_dir():
            files += [p for p in sorted(base.rglob("*")) if p.suffix in SUFFIXES]

    if not files:
        print("template-structure-check: FOUND NO TEMPLATES — refusing to pass",
              file=sys.stderr)
        return 2

    errors: list[str] = []
    for path in files:
        rel = str(path.relative_to(ROOT))
        raw = path.read_text(encoding="utf-8")
        if check_comment_terminators(raw, rel, errors):
            body = strip_comments(raw)
            check_blocks(body, rel, errors)
            check_tag_balance(body, rel, errors)
            check_partials(body, rel, errors)

    if errors:
        print(f"template structure check FAILED: {len(errors)} problem(s) "
              f"across {len(files)} template(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"template structure check OK: {len(files)} template(s) — comments terminated, "
          f"blocks nested, tags balanced, partial includes resolve")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
