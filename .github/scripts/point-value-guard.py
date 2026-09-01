#!/usr/bin/env python3
"""A point-costed Feature's `system.level` SHALL NOT reach the DOM as a bare interpolation.

WHY THIS EXISTS
---------------
`openspec/specs/foundry-system-types/spec.md` → *"Every Feature list and item sheet that shows a
point value shows a variable one"*: a Merit/Flaw/Background/Bloodbound's cost can be the book's own
non-numeric string ("1 a 5", "1 o 3", "1/2/3/4/5"), and `pointValue` (`module/handlebars.js`) is the
one place the "0 shows nothing, anything else shows verbatim" rule lives. `feature_item.hbs`,
`notes.html` and `stats_feature_row.hbs` already route through it. `templates/sheets/feature-sheet.html`
did not: its four `{{#if (eq data.system.type "wod.types.X")}}` blocks (background/merit/flaw/
bloodbound) printed `{{data.system.level}}` bare, so a "0"-cost item's OWN item sheet stated a
false `Coste 0` next to the label whose entire job is to show that number (audit
`docs/spec-enforcement-audit.md` row #41, 2026-07-29, unfixed as of the 2026-09-01 re-measure).

THE LESSON THIS GATE IS BUILT AROUND (audit row #22)
-----------------------------------------------------
A gate that lists the OFFENDING LINES it just fixed (or the ids it just fixed) is a ratchet, not a
rule: it goes green today and lets the exact same shape recur tomorrow in a fifth branch, a new
template, or a duplicated block — which is precisely what happened to `test_no_python_repr.py`'s
15-id allowlist. This gate does not know the number 22, 27, 32 or 37, and carries no per-line
allowlist. It re-derives, on every run, from the SOURCE OF TRUTH the requirement itself names — the
set of `wod.types.*` values whose point cost can be non-numeric — where in the whole template tree a
block is gated on one of them, and whether a bare `system.level`/`item.system.level` interpolation
appears inside that gate. A sixth branch, a copy-pasted block in a different file, or a re-introduced
bare interpolation in the same four lines all fail this the same way.

WHAT COUNTS AS "GATED ON A POINT-COSTED TYPE"
----------------------------------------------
A `{{#if (eq …)}}` / `{{#if (eqAny …)}}` whose subject is `data.system.type` or `item.system.type`
and whose type list intersects POINT_COSTED_TYPES. Everything else that opens a block
(`{{#each}}`, `{{#unless}}`, any other `{{#if}}` — including the sibling `eqAnyNot` gate around the
level *input*, which is a different, non-costed condition) pushes a NON-gated frame; a bare-level
line is only a violation while at least one frame currently on the stack is gated. This is why the
level `<select>`/`<input>` in `feature-sheet.html` (gated on `eqAnyNot data.system.type "wod.types.oath"
""`, never on one of the four costed types) is correctly left alone: it is the editable FIELD, not a
DISPLAY of the value, and the requirement explicitly keeps it a plain String input.

WHAT IS DELIBERATELY OUT OF SCOPE
----------------------------------
Power/Gift/Charm/Rote/treasure sheets (`power-sheet.html`, `item-sheet.html`, `mainpower_list.html`,
`power_listmainpower.hbs`) also print a bare `system.level`, but their `level` is a genuine numeric
RANK — every one of their editable controls submits `data-dtype="Number"` — not a point-costed
Feature's rating, and the cited requirement is scoped to Background/Merit/Flaw/Bloodbound. Widening
this gate to every `system.level` in the tree would flag correct code and invite exactly the kind of
name-the-defect exception list the audit warns about; POINT_COSTED_TYPES is deliberately the whole
and only allowlist, and it is the set the requirement itself names, not a set of files or ids.

    python3 .github/scripts/point-value-guard.py
    python3 .github/scripts/point-value-guard.py --selftest   # prove it can go red
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: The Feature sub-kinds the requirement names as able to carry a non-numeric point cost.
POINT_COSTED_TYPES = {
    "wod.types.background",
    "wod.types.merit",
    "wod.types.flaw",
    "wod.types.bloodbound",
}

#: Handlebars comments can span lines and legitimately contain the literal text
#: "{{data.system.level}}" in prose (this file's own header, and the fix's inline comment, both
#: do). Strip them before scanning, preserving line count so reported line numbers stay accurate.
COMMENT_RE = re.compile(r"\{\{!--.*?--\}\}", re.DOTALL)


def strip_comments(text: str) -> str:
    def blank(m: re.Match) -> str:
        return "\n" * m.group(0).count("\n")

    return COMMENT_RE.sub(blank, text)


#: One token stream, in source order: block opens/closes and the one thing we watch for.
TOKEN_RE = re.compile(
    r"(?P<open_type_if>\{\{#if\s*\(\s*eq(?:Any)?\s+(?:data|item)\.system\.type\s+(?P<types>[^)]*)\)\s*\}\})"
    r"|(?P<open_if>\{\{#if\b[^}]*\}\})"
    r"|(?P<open_each>\{\{#each\b[^}]*\}\})"
    r"|(?P<open_unless>\{\{#unless\b[^}]*\}\})"
    r"|(?P<close_if>\{\{/if\}\})"
    r"|(?P<close_each>\{\{/each\}\})"
    r"|(?P<close_unless>\{\{/unless\}\})"
    r"|(?P<bare_level>\{\{\s*(?:data|item)\.system\.level\s*\}\})"
)

TYPE_LITERAL_RE = re.compile(r'"(wod\.types\.[\w]+)"')


def scan(text: str, relpath: str) -> list[str]:
    """Return one message per bare `system.level` interpolation found inside a block gated on a
    POINT_COSTED_TYPES check. `stack` holds one bool per currently-open block: True if that frame's
    own condition is a costed-type gate."""
    stack: list[bool] = []
    violations: list[str] = []

    for m in TOKEN_RE.finditer(text):
        kind = m.lastgroup

        if kind == "open_type_if":
            types = set(TYPE_LITERAL_RE.findall(m.group("types")))
            stack.append(bool(types & POINT_COSTED_TYPES))
        elif kind in ("open_if", "open_each", "open_unless"):
            stack.append(False)
        elif kind in ("close_if", "close_each", "close_unless"):
            if stack:
                stack.pop()
        elif kind == "bare_level":
            if any(stack):
                line_no = text.count("\n", 0, m.start()) + 1
                violations.append(
                    f"{relpath}:{line_no}: {m.group(0)!r} is a bare interpolation of a point-costed "
                    f"Feature's level inside a wod.types.{{background,merit,flaw,bloodbound}} gate — "
                    f"route it through the `pointValue` helper (module/handlebars.js) the way "
                    f"feature_item.hbs / notes.html / stats_feature_row.hbs already do, or a "
                    f"genuinely-zero item states a false non-zero-looking cost/rating and a "
                    f"variable-cost string risks being silently dropped by a numeric comparison "
                    f"upstream.")

    return violations


def find_templates() -> list[Path]:
    templates = ROOT / "templates"
    return sorted([*templates.rglob("*.hbs"), *templates.rglob("*.html")])


def run(files: list[Path]) -> list[str]:
    violations: list[str] = []

    for f in files:
        text = strip_comments(f.read_text(encoding="utf-8"))
        violations.extend(scan(text, str(f.relative_to(ROOT))))

    return violations


def selftest() -> int:
    """Mutation self-test: the exact defect this gate exists to catch, and the exact fix, side by
    side. `node --check`/CI cannot exercise this file directly, so this proves the detector fires
    on the bug shape and stays silent on the fix shape — read this before trusting a green run."""
    bad = (
        '{{#if (eq data.system.type "wod.types.merit")}}\n'
        '  {{captilize (localize "wod.labels.cost")}} {{data.system.level}}\n'
        "{{/if}}\n"
    )
    good = (
        '{{#if (eq data.system.type "wod.types.merit")}}\n'
        '  {{captilize (localize "wod.labels.cost")}} '
        "{{#if (pointValue data.system.level)}}{{pointValue data.system.level}}{{else}}&nbsp;{{/if}}\n"
        "{{/if}}\n"
    )
    # A non-costed gate around the same bare interpolation must NOT fire — this is the exact shape
    # of the level <select>/<input> area, which is legitimately unguarded (it's the editable field).
    unrelated = (
        '{{#if (eqAnyNot data.system.type "wod.types.oath" "")}}\n'
        "  {{data.system.level}}\n"
        "{{/if}}\n"
    )
    # A different costed type, to prove the set is checked, not one hardcoded literal.
    bad_other_type = (
        '{{#if (eqAny data.system.type "wod.types.flaw" "wod.types.bloodbound")}}\n'
        "  {{item.system.level}}\n"
        "{{/if}}\n"
    )

    ok = True

    if not scan(bad, "selftest/bad.html"):
        print("SELFTEST FAILED: the known-bad shape produced ZERO violations", file=sys.stderr)
        ok = False

    if scan(good, "selftest/good.html"):
        print("SELFTEST FAILED: the fixed shape (routed through pointValue) still fired",
              file=sys.stderr)
        ok = False

    if scan(unrelated, "selftest/unrelated.html"):
        print("SELFTEST FAILED: a non-costed-type gate around a bare level must NOT fire",
              file=sys.stderr)
        ok = False

    if not scan(bad_other_type, "selftest/bad_other_type.html"):
        print("SELFTEST FAILED: a second costed type (flaw/bloodbound via eqAny) was not caught — "
              "the gate is reading a hardcoded literal, not the POINT_COSTED_TYPES set",
              file=sys.stderr)
        ok = False

    if ok:
        print("point-value-guard selftest OK: fires on the bug shape and on a second costed type, "
              "silent on the fixed shape and on an unrelated gate")
        return 0

    return 1


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()

    files = find_templates()

    if not files:
        print("point-value-guard: found zero templates under templates/ — the tree moved and this "
              "gate can no longer see what it checks", file=sys.stderr)
        return 2

    violations = run(files)

    if violations:
        print(f"point-value-guard FAILED: {len(violations)} bare point-value interpolation(s)",
              file=sys.stderr)
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        return 1

    print(f"point-value-guard OK: {len(files)} template(s) scanned, zero bare `system.level` "
          f"interpolations inside a wod.types.{{background,merit,flaw,bloodbound}} gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
