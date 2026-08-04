#!/usr/bin/env python3
"""Offline invariants over the ApplicationV2 actor sheet: its actions, its parts and its strings.

WHY THIS EXISTS
---------------
Written 2026-08-04 for `add-pc-sheet-v3`, which introduces the FIRST subclass of an
ApplicationV2 sheet in this repo (`PCActorSheetV3 extends PCActorSheet`). Four failure
modes of that sheet share one property: **nothing throws**. No console warning, no red
box, no failing render — the control is simply inert, or the block is simply blank, and
the only detector is a person noticing that a click did nothing.

Every gate already in preflight is blind to all four:

  * `system-preflight.py` reads the manifest, the import graph and `systems/...`
    references, and never looks inside a template;
  * `js-syntax-check.sh` parses `.js` — a dead `data-action` is valid JavaScript's
    absence, not its malformation;
  * `template-structure-check.py` checks a template against ITSELF (comments, block
    nesting, tag balance, partial registration). Every check below is a check of a
    template against the JAVASCRIPT that renders it, which is a different question:
    each of these files is correct on its own and wrong together — the same shape as
    the `powertab.js` two-list bug;
  * the four `.mjs` harnesses execute `module/`, not templates.

WHAT IT CHECKS
--------------
I1  Every `data-action="x"` in an actor template names an action the sheet that renders
    that template actually registered. ApplicationV2 looks the name up in
    `options.actions` and, finding nothing, does nothing at all: the control renders,
    takes the pointer cursor, and is dead. `actorDelete` at settings.hbs:36 is exactly
    this today (see ALLOWLIST_UNREGISTERED_ACTIONS).

I5  `PARTS`, `_preparePartContext` and `tabs` agree. A part with no `case` in the
    preparer renders with only the shared context, so every key its template reads is
    undefined and the tab comes up BLANK — the failure this sheet hit twice in the week
    before this file was written. A tab id with no part is a nav icon that switches to
    nothing.

I7  `resource-value-step` is only ever a `<span>` where the dot machinery can reach it.
    `OnDotCounterChange` (`module/scripts/action-helpers.js:981`) reads
    `parent.find('span.resource-value-step')` and then guards `index >= steps.length`,
    while `SetupDotCounters_v2` (:654) collects `.resource-value-step` with NO tag. The
    two selectors disagreeing is the trap: a `<div>` (or a `<button>`, or an `<input>`)
    among the dots is painted by the second and invisible to the first, so the dot
    highlights on load and silently refuses to persist on click.

I11 No `LANG:` placeholder survives, and every literal `{{localize "key"}}` resolves in
    BOTH `lang/en.json` and `lang/es.json`. Foundry renders the raw key when a key is
    missing, so `wod.notes.unnamedpassion` appears on the sheet as those 26 characters.
    ES matters as much as EN here: the live world runs Spanish (`langES` on the sheet
    root), so an EN-only key is invisible to every gate AND to every developer reading
    the sheet in English.

WHAT IT DOES NOT CHECK, ON PURPOSE
----------------------------------
  * Actions in DIALOG and ITEM templates. Measured 2026-08-04: those resolve cleanly
    too, but their sheets are outside the invariant this change is about, and widening
    the blast radius of a gate is how a gate acquires a false positive that gets it
    switched off. The machinery below is generic — widen SCOPE_DIRS when someone wants
    it, not before.
  * `game.i18n.localize()` keys in JavaScript. Measured 2026-08-04: 1,338 literal call
    sites, of which 23 do not resolve — 12 `wod.sheet.*` sheet-registration labels that
    exist in no language file, 5 template-literal interpolations a static scan cannot
    resolve, and 6 real EN-only keys. That is a real defect list and it wants its own
    change with a human on it; shipping it as a gate today means shipping a 23-entry
    allowlist, which is a list nobody reads.

HOW A FINDING IS HANDLED
------------------------
Everything below either passes on the tree as it stands or is named in one of the three
allowlists with the reason spelled out, because a gate that is red the day it lands gets
switched off within a day — the argument `js-syntax-check.sh`'s own header makes. Every
allowlisted entry prints a `::warning::` on EVERY run, so it stays visible instead of
becoming furniture, and every allowlist is COUNTED: one more `actorDelete` in
settings.hbs, or a second unresolved key in death.html, is an error. Deleting an entry
from an allowlist is the whole cost of promoting it to a hard failure.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Templates these invariants cover. I1/I5/I7 are about the actor sheet; see the
#: "does not check" note above before widening.
SCOPE_DIRS = ("templates/actor",)
#: I11 is about strings, which are not an actor-sheet concern, so it sweeps everything.
ALL_TEMPLATE_DIRS = ("templates",)
TEMPLATE_SUFFIXES = (".hbs", ".html")

JS_DIRS = ("module",)
JS_EXTRA = ("wod.js",)

#: Actions ApplicationV2 handles ITSELF, before consulting `options.actions`. Foundry is
#: not vendored here (no `package.json`, no `node_modules`), so this cannot be derived
#: from source and is written down instead. Keep it to names Foundry documents as
#: framework behaviour; anything else belongs in the sheet's own map.
#:   tab             -> ApplicationV2 switches `data-group`/`data-tab` (navigation.hbs)
#:   close/minimize/maximize/toggleControls -> the window frame's own controls
CORE_ACTIONS = {"tab", "close", "minimize", "maximize", "toggleControls"}

#: (template path, action name) -> (expected occurrences, reason). A REAL DEFECT, not a
#: false positive, kept out of the error list only so this gate can land green.
#:
#: `actorDelete`: the trash can beside a removable splatfield on Ajustes -> Bio. Verified
#: 2026-08-04 against the 22 keys in `PCActorSheet.DEFAULT_OPTIONS.actions` (the brief for
#: this work said 41; it is 22, measured, and the difference is worth knowing before
#: anyone restates the block for v3). The control is rendered inside
#: `{{#if field.isremovable}}` on a tab a GM reaches in two clicks, it takes the pointer
#: cursor, and clicking it does nothing whatsoever. It is not dangerous, which is the only
#: reason it is allowlisted rather than blocking: an unwired delete deletes nothing.
#: Resolving it is a one-line choice — wire `actorDelete` into the actions map, or delete
#: the anchor — and then this entry goes away. It is counted, so a SECOND unregistered
#: action anywhere (including a second `actorDelete`) is an error.
ALLOWLIST_UNREGISTERED_ACTIONS: dict[tuple[str, str], tuple[int, str]] = {
    # Empty on purpose. Its only entry was `actorDelete` in settings.hbs — a trash can wired to an
    # action PCActorSheet does not register, so it rendered live, took the pointer cursor and did
    # nothing. It was deleted rather than tolerated. The dict and the STALE check below stay: the
    # next unregistered action needs somewhere to be recorded, and needs to be unable to sit there
    # once it stops being true.
}

#: template path -> (expected occurrences, reason). `LANG:` is this fork's marker for a
#: string that was never given an i18n key; it renders to the reader verbatim.
ALLOWLIST_LANG_MARKERS: dict[str, tuple[int, str]] = {
    "templates/actor/parts/settings.hbs": (
        3,
        "UNREACHABLE, not merely hidden: all three are in the `sheet` sub-tab, whose nav "
        "link is commented out at settings.hbs:13. `_applySettingsTabState` "
        "(pc-actor-sheet.js:708) sets display:none on every settings tab except "
        "`this._settingsTab`, which starts at 'statsadv' and can only be changed by "
        "clicking a nav link that does not exist. No user can see these strings",
    ),
}

#: (template path, i18n key) -> (expected occurrences, reason). Measured 2026-08-04 by
#: flattening lang/en.json (2,019 keys) and lang/es.json (2,004) and resolving all 2,428
#: literal `{{localize}}` sites in the tree; these six are all that do not resolve. Each
#: renders the raw key to the player. All are one-line fixes in `lang/`, which is why they
#: are named with their probable intended key rather than merely tolerated.
ALLOWLIST_MISSING_I18N: dict[tuple[str, str], tuple[int, str]] = {
    # Empty on purpose, and the STALE check below is why it can be. Every entry this dict held
    # when it was written has been FIXED rather than tolerated: `wod.notes.unnamedpassion` and
    # `unnamedfetter` were added to both language files; `wod.labels.secondaryabilityinfo` and
    # `wod.labels.bonus.fixedvalue` were templates pointing at keys that did not exist while the
    # correct ones did; and `wod.labels.bonus.bonusvalue` was present in English and missing in
    # Spanish — correct in the language nobody at this table plays in. The dict stays so the next
    # unresolved key has somewhere to be recorded, and the STALE check stays so it cannot sit
    # there after it stops being true.
}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


# ---------------------------------------------------------------------------
# JavaScript: enough of a parser to read object literals without eval
# ---------------------------------------------------------------------------

def js_blank_comments(js: str) -> str:
    """Blank out comments, preserving offsets so line numbers stay true."""
    out: list[str] = []
    i, n = 0, len(js)
    while i < n:
        ch = js[i]
        if ch in "\"'`":
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                if js[i] == "\\":
                    out.append(js[i:i + 2])
                    i += 2
                    continue
                out.append(js[i])
                if js[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if js.startswith("//", i):
            j = js.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        if js.startswith("/*", i):
            j = js.find("*/", i)
            j = n if j < 0 else j + 2
            out.append("".join(c if c == "\n" else " " for c in js[i:j]))
            i = j
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def js_block(js: str, open_idx: int) -> str | None:
    """The `{...}` starting at open_idx, brace-matched and string-aware."""
    if open_idx < 0 or open_idx >= len(js) or js[open_idx] != "{":
        return None
    depth, i = 0, open_idx
    while i < len(js):
        ch = js[i]
        if ch in "\"'`":
            quote = ch
            i += 1
            while i < len(js) and js[i] != quote:
                if js[i] == "\\":
                    i += 1
                i += 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return js[open_idx:i + 1]
        i += 1
    return None


KEY_RE = re.compile(r"""([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*:""")


def js_top_keys(block: str) -> list[str]:
    """Keys at depth 1 of an object literal."""
    inner = block[1:-1]
    keys: list[str] = []
    depth, i = 0, 0
    while i < len(inner):
        ch = inner[i]
        if ch in "\"'`":
            quote = ch
            i += 1
            while i < len(inner) and inner[i] != quote:
                if inner[i] == "\\":
                    i += 1
                i += 1
        elif ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        elif depth == 0 and (i == 0 or inner[i - 1] in ",{ \t\r\n"):
            m = KEY_RE.match(inner, i)
            if m:
                keys.append(m.group(1).strip("\"'"))
                i = m.end() - 1
        i += 1
    return keys


def js_files() -> list[Path]:
    out: list[Path] = []
    for d in JS_DIRS:
        base = ROOT / d
        if base.is_dir():
            out += sorted(base.rglob("*.js"))
    for extra in JS_EXTRA:
        p = ROOT / extra
        if p.is_file():
            out.append(p)
    return out


class SheetClass:
    """An ApplicationV2 sheet, as far as this gate needs to understand one."""

    def __init__(self, name: str, base: str | None, path: Path):
        self.name = name
        self.base = base
        self.path = path
        self.parts: dict[str, str] = {}
        self.has_parts = False
        self.actions: set[str] | None = None
        self.tabs: list[str] | None = None
        self.part_cases: set[str] | None = None

    @property
    def rel(self) -> str:
        return str(self.path.relative_to(ROOT))


def parse_sheet_classes() -> dict[str, SheetClass]:
    """Every `class X extends Y` in the system, with its PARTS/actions/tabs/preparer."""
    found: dict[str, SheetClass] = {}
    for path in js_files():
        src = js_blank_comments(path.read_text(encoding="utf-8"))
        for m in re.finditer(r"class\s+([A-Za-z_$][\w$]*)\s+extends\s+([^\s{]+)", src):
            name, base = m.group(1), m.group(2)
            body = js_block(src, src.find("{", m.end()))
            if body is None:
                continue
            sheet = SheetClass(name, base, path)

            pm = re.search(r"static\s+PARTS\s*=\s*", body)
            if pm:
                block = js_block(body, body.find("{", pm.end()))
                if block:
                    sheet.has_parts = True
                    for key in js_top_keys(block):
                        km = re.search(re.escape(key) + r"\s*:\s*\{([^}]*)\}", block)
                        tpl = ""
                        if km:
                            tm = re.search(r'template\s*:\s*["\']([^"\']+)["\']', km.group(1))
                            tpl = tm.group(1) if tm else ""
                        sheet.parts[key] = tpl

            om = re.search(r"static\s+DEFAULT_OPTIONS\s*=\s*", body)
            if om:
                block = js_block(body, body.find("{", om.end()))
                if block and "actions" in js_top_keys(block):
                    am = re.search(r"\bactions\s*:\s*", block)
                    ablock = js_block(block, block.find("{", am.end())) if am else None
                    if ablock is not None:
                        sheet.actions = set(js_top_keys(ablock))

            tm = re.search(r"^\s*tabs\s*=\s*", body, flags=re.M)
            if tm:
                block = js_block(body, body.find("{", tm.end()))
                if block:
                    sheet.tabs = js_top_keys(block)

            cm = re.search(r"_preparePartContext\s*\(", body)
            if cm:
                # The METHOD body only. Scanning the rest of the class instead picks up the
                # `switch (data.type)` in `_onDrop` and reports `case 'Item'` as a part.
                close = body.find(")", cm.end())
                method = js_block(body, body.find("{", close)) if close != -1 else None
                if method:
                    sheet.part_cases = set(re.findall(r"case\s+['\"]([\w-]+)['\"]\s*:", method))

            found[name] = sheet
    return found


def resolve(sheet: SheetClass, attr: str, classes: dict[str, SheetClass]):
    """Walk the `extends` chain for the first ancestor that declares `attr`.

    Deliberately NOT a merge. `ApplicationV2`'s DEFAULT_OPTIONS merging up the prototype
    chain is unverified in this repo (recorded as an open risk in the v3 design), so this
    gate takes the pessimistic reading: whoever restates `actions` owns the whole set. A
    v3 subclass that restates the block and drops a key therefore goes RED here, which is
    the answer you want, because the alternative is discovering it as a dead control on a
    live sheet.
    """
    seen: set[str] = set()
    cur: SheetClass | None = sheet
    while cur is not None and cur.name not in seen:
        seen.add(cur.name)
        value = getattr(cur, attr)
        if value is not None:
            return value, cur
        cur = classes.get(cur.base or "")
    return None, None


def descends_from(sheet: SheetClass, ancestor: str, classes: dict[str, SheetClass]) -> bool:
    seen: set[str] = set()
    cur: SheetClass | None = sheet
    while cur is not None and cur.name not in seen:
        if cur.name == ancestor:
            return True
        seen.add(cur.name)
        cur = classes.get(cur.base or "")
    return False


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

SYSTEM_PREFIX = "systems/worldofdarkness/"


def template_files(dirs: tuple[str, ...]) -> list[Path]:
    out: list[Path] = []
    for d in dirs:
        base = ROOT / d
        if base.is_dir():
            out += [p for p in sorted(base.rglob("*")) if p.suffix in TEMPLATE_SUFFIXES]
    return out


def strip_template_comments(text: str) -> str:
    """Handlebars and HTML comments out. Commented-out markup is not markup: a
    `data-action` inside `<!-- -->` is not clickable and must not be reported."""
    text = re.sub(r"\{\{!--.*?--\}\}", "", text, flags=re.S)
    text = re.sub(r"\{\{!.*?\}\}", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def blank_template_comments(text: str) -> str:
    """Same removal, but LINE-PRESERVING: comments become blanks so that every line
    number in the result still matches the file on disk. Needed by the flattener, whose
    whole job is to report a line in the file a human can open."""
    def blank(m: re.Match) -> str:
        return "".join(c if c == "\n" else " " for c in m.group(0))
    text = re.sub(r"\{\{!--.*?--\}\}", blank, text, flags=re.S)
    text = re.sub(r"\{\{!.*?\}\}", blank, text, flags=re.S)
    text = re.sub(r"<!--.*?-->", blank, text, flags=re.S)
    return text


INCLUDE = re.compile(r'\{\{>\s*"([^"]+)"[^}]*\}\}', re.S)


def flatten_template(rel: str, depth: int = 0,
                     stack: tuple[str, ...] = ()) -> tuple[str, list[tuple[str, int]]]:
    """A part template with its static partials INLINED, plus a per-line origin map.

    Ancestry is the whole point of I7 (and of the direct-child chains that
    `binder-selector-check.py` looks at), and in this tree ancestry crosses partial
    boundaries constantly: `stats_attributes.hbs` opens `<div class="resource-value">` and
    the dots inside it live in `stat_value_dots.hbs`. Scanning each file on its own can
    never see that, so the container rules would be quietly dead — which is exactly the
    "checks nothing, reports green" failure this file refuses elsewhere.

    Returns (text, origins) with origins[i] == (source file, line number) for output line
    i, so every error still names a file and a line a human can open.
    """
    path = ROOT / rel
    if depth > 25 or rel in stack or not path.is_file():
        return "", []

    raw = blank_template_comments(path.read_text(encoding="utf-8"))
    out: list[str] = []
    origins: list[tuple[str, int]] = []
    pos = 0

    def emit(chunk: str, first_line: int) -> None:
        for n, line in enumerate(chunk.split("\n")):
            out.append(line)
            origins.append((rel, first_line + n))

    for m in INCLUDE.finditer(raw):
        emit(raw[pos:m.start()], raw[:pos].count("\n") + 1)
        ref = m.group(1)
        child = ref[len(SYSTEM_PREFIX):] if ref.startswith(SYSTEM_PREFIX) else ref
        ctext, corigins = flatten_template(child, depth + 1, stack + (rel,))
        if corigins:                       # an unresolvable include contributes no lines,
            out += ctext.split("\n")       # and must not desynchronise the origin map
            origins += corigins
        pos = m.end()

    emit(raw[pos:], raw[:pos].count("\n") + 1)
    return "\n".join(out), origins


def closure_of(part_templates: list[str]) -> set[str]:
    """Every template reachable from these roots through static `{{> "..."}}` includes.

    Dynamic includes — `{{> (dtSvgDie ...) }}`, 8 sites — resolve through
    `Handlebars.registerPartial` to inline SVG STRINGS built in `wod.js:443`, not to files
    on disk, so there is nothing further to walk. `check_dynamic_partials` below fails the
    build if a dynamic include appears that is NOT `dtSvgDie`, because that would mean this
    closure had silently stopped being complete.
    """
    seen: set[str] = set()
    stack = list(part_templates)
    while stack:
        ref = stack.pop()
        rel = ref[len(SYSTEM_PREFIX):] if ref.startswith(SYSTEM_PREFIX) else ref
        if not rel or rel in seen:
            continue
        seen.add(rel)
        path = ROOT / rel
        if not path.is_file():
            continue
        body = strip_template_comments(path.read_text(encoding="utf-8"))
        stack += re.findall(r'\{\{>\s*"([^"]+)"', body)
    return seen


def check_dynamic_partials(files: list[Path]) -> None:
    for path in files:
        rel = str(path.relative_to(ROOT))
        body = strip_template_comments(path.read_text(encoding="utf-8"))
        for m in re.finditer(r"\{\{>\s*\(\s*([\w-]+)", body):
            helper = m.group(1)
            if helper == "dtSvgDie":
                continue
            line = body[:m.start()].count("\n") + 1
            err(f"{rel}:{line}: dynamic partial include via `{helper}` — this gate resolves "
                f"which sheet renders a template by walking STATIC `{{{{> \"...\" }}}}` "
                f"includes, and a new dynamic helper means that walk is no longer complete. "
                f"Teach `closure_of` how `{helper}` resolves, or the scoping below is a guess")


# ---------------------------------------------------------------------------
# A very small markup model: (tag, classes, attributes, ancestors)
# ---------------------------------------------------------------------------

OPEN_TAG = re.compile(r"<([a-zA-Z][\w-]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)>")
CLOSE_TAG = re.compile(r"</\s*([a-zA-Z][\w-]*)\s*>")
ATTR = re.compile(r"([:@\w.-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')")
VOID = {"br", "hr", "img", "input", "meta", "link", "source", "area", "base",
        "col", "embed", "param", "track", "wbr"}


class Element:
    __slots__ = ("tag", "classes", "dynamic_class", "attrs", "ancestors", "origin", "line")

    def __init__(self, tag, classes, dynamic_class, attrs, ancestors, origin, line):
        self.tag = tag
        self.classes = classes
        self.dynamic_class = dynamic_class
        self.attrs = attrs
        self.ancestors = ancestors
        self.origin = origin
        self.line = line

    @property
    def where(self) -> str:
        return f"{self.origin}:{self.line}"


def parse_markup(text: str, origin: str) -> list[Element]:
    """Tag soup into elements with an ancestor chain. `{{#if}}` is ignored on purpose:
    the question these invariants ask is "can this markup be produced", not "is it
    produced right now for this actor"."""
    elements: list[Element] = []
    stack: list[Element] = []
    for m in re.finditer(CLOSE_TAG.pattern + "|" + OPEN_TAG.pattern, text):
        whole = m.group(0)
        if whole.startswith("</"):
            name = m.group(1).lower()
            for i in range(len(stack) - 1, -1, -1):
                if stack[i].tag == name:
                    del stack[i:]
                    break
            continue
        tag = (m.group(2) or "").lower()
        raw = m.group(3) or ""
        attrs: dict[str, str] = {}
        for am in ATTR.finditer(raw):
            attrs[am.group(1).lower()] = am.group(2) if am.group(2) is not None else am.group(3)
        for am in re.finditer(r"(?<![-\w])([a-zA-Z][\w-]*)(?![\w=-])", raw):
            attrs.setdefault(am.group(1).lower(), "")
        cls_raw = attrs.get("class", "")
        dynamic = bool(re.search(r"\{\{|\$\{", cls_raw))
        literal = re.sub(r"\{\{[^{}]*\}\}|\$\{[^{}]*\}", " ", cls_raw)
        classes = {c for c in literal.split() if c and "{" not in c and "}" not in c}
        el = Element(tag, classes, dynamic, attrs, list(stack),
                     origin, text[:m.start()].count("\n") + 1)
        elements.append(el)
        if tag not in VOID and not whole.rstrip().endswith("/>"):
            stack.append(el)
    return elements


# ---------------------------------------------------------------------------
# I1 - every data-action is registered
# ---------------------------------------------------------------------------

def check_i1(classes: dict[str, SheetClass], scope: list[Path]) -> int:
    sheets = [c for c in classes.values() if c.has_parts]
    if not sheets:
        err("I1: found no class with `static PARTS` — this is not the system tree, or the "
            "sheet declaration changed shape and this gate can no longer see it")
        return 0

    #: template path -> the sheets that render it
    renderers: dict[str, list[SheetClass]] = {}
    for sheet in sheets:
        parts, _ = resolve(sheet, "parts", classes)
        roots = list((parts or sheet.parts).values())
        for rel in closure_of([r for r in roots if r]):
            renderers.setdefault(rel, []).append(sheet)

    union: set[str] = set()
    for sheet in sheets:
        acts, _ = resolve(sheet, "actions", classes)
        union |= acts or set()
    if not union:
        err("I1: parsed 0 registered actions out of any DEFAULT_OPTIONS — refusing to pass")
        return 0

    seen_allowed: dict[tuple[str, str], set[int]] = {}
    total = 0

    for path in scope:
        rel = str(path.relative_to(ROOT))
        body = strip_template_comments(path.read_text(encoding="utf-8"))
        owners = renderers.get(rel, [])

        # PER SHEET, never the union across sheets. A shared partial rendered by both v2
        # and v3 must be satisfied by BOTH action maps: the union would let a v3 that
        # restates `DEFAULT_OPTIONS.actions` and forgets a key pass on v2's copy of it,
        # which is precisely the risk `add-pc-sheet-v3` records as unverified.
        if owners:
            audiences = [(s.name, (resolve(s, "actions", classes)[0] or set())) for s in owners]
        else:
            audiences = [("no sheet renders it; checked against the UNION of every "
                          "registered map, which is weaker", union)]
            if re.search(r'data-action\s*=\s*"', body):
                warn(f"{rel}: not reachable from any `static PARTS` through a static partial "
                     f"include, so its `data-action`s were checked against the UNION of every "
                     f"sheet's action map instead of one sheet's. That is weaker: an action "
                     f"registered by some OTHER sheet will pass here")

        for m in re.finditer(r'data-action\s*=\s*"([^"]*)"', body):
            action = m.group(1).strip()
            total += 1
            line = body[:m.start()].count("\n") + 1
            if not action or "{{" in action:
                continue
            if action in CORE_ACTIONS:
                continue
            key = (rel, action)
            if key in ALLOWLIST_UNREGISTERED_ACTIONS:
                seen_allowed.setdefault(key, set()).add(line)
                continue
            for name, registered in audiences:
                if action in registered:
                    continue
                err(f"{rel}:{line}: data-action=\"{action}\" is registered by no sheet that "
                    f"renders this template ({name}). ApplicationV2 looks the name up in "
                    f"`options.actions`; not finding it, the control renders and does NOTHING "
                    f"— no error, no console warning. Register it or delete the control")

    for key, (expected, reason) in ALLOWLIST_UNREGISTERED_ACTIONS.items():
        rel, action = key
        got = len(seen_allowed.get(key, set()))
        if got == 0:
            warn(f"I1 allowlist is STALE: {rel} no longer contains an unregistered "
                 f"`{action}` — delete the entry")
        elif got != expected:
            err(f"{rel}: {got} unregistered `{action}` control(s), allowlist expects "
                f"{expected}. The allowlist covers a KNOWN one ({reason}); a new one is not "
                f"covered by it")
        else:
            warn(f"I1 known defect: {rel} `data-action=\"{action}\"` x{got} — {reason}")

    # Markup built in JavaScript rather than in a template. There is no way to attribute a
    # generated string to one sheet, so the union is the honest bound: it still catches an
    # action that exists in no map at all, which is the typo case.
    for path in js_files():
        src = js_blank_comments(path.read_text(encoding="utf-8"))
        rel = str(path.relative_to(ROOT))
        for m in re.finditer(r'data-action=\\?["\']([\w-]+)\\?["\']', src):
            action = m.group(1)
            total += 1
            if action in union or action in CORE_ACTIONS:
                continue
            line = src[:m.start()].count("\n") + 1
            err(f"{rel}:{line}: generated markup emits data-action=\"{action}\", which no "
                f"sheet in this system registers")

    if total == 0:
        err("I1: found 0 `data-action` attributes anywhere — refusing to pass, because a "
            "check that examined nothing reports the same green as a check that passed")
    return total


# ---------------------------------------------------------------------------
# I5 - the parts and the tabs agree
# ---------------------------------------------------------------------------

def check_i5(classes: dict[str, SheetClass]) -> int:
    checked = 0
    for sheet in sorted(classes.values(), key=lambda s: s.name):
        if not sheet.has_parts:
            continue
        # Scoped to ACTOR sheets, by where their parts live rather than by class name, so
        # that `PCActorSheetV3` is picked up the day it lands without editing this file.
        # The item sheets are excluded because their shape genuinely differs: they carry a
        # non-tab `header` part AND a `tab` part, so "exactly one part is not a tab" is a
        # true statement about the actor sheet and a false one about them. Widening this
        # gate to them means describing their contract, not reusing this one.
        if not any(t.startswith(SYSTEM_PREFIX + "templates/actor/") for t in sheet.parts.values()):
            continue
        tabs, tabs_owner = resolve(sheet, "tabs", classes)
        if not tabs:
            continue  # not a tabbed sheet; PARTS/preparer agreement below needs tab ids
        checked += 1
        parts = sheet.parts
        cases, cases_owner = resolve(sheet, "part_cases", classes)
        cases = cases or set()

        tab_ids = set(tabs)
        part_ids = set(parts)

        # Exactly one part is not a tab: the navigation part. Derived, not named, so that
        # renaming it does not quietly disable this check.
        extra = part_ids - tab_ids
        if len(extra) != 1:
            err(f"{sheet.rel}: {sheet.name} declares {len(extra)} part(s) that are not tab ids "
                f"({sorted(extra) or 'none'}); expected exactly one, the navigation part. "
                f"PARTS={sorted(part_ids)} tabs={sorted(tab_ids)}")
            nav = None
        else:
            nav = extra.pop()
            nav_tpl = parts.get(nav, "")
            rel = nav_tpl[len(SYSTEM_PREFIX):] if nav_tpl.startswith(SYSTEM_PREFIX) else nav_tpl
            tpl_path = ROOT / rel if rel else None
            if not tpl_path or not tpl_path.is_file():
                err(f"{sheet.rel}: {sheet.name}'s navigation part `{nav}` has no template on "
                    f"disk ({nav_tpl!r})")
            elif 'data-action="tab"' not in tpl_path.read_text(encoding="utf-8"):
                err(f"{rel}: this is {sheet.name}'s only non-tab part, so it should be the "
                    f"navigation part, but it contains no `data-action=\"tab\"`. Either the "
                    f"nav lost its tab links or a content part is missing from `tabs`")

        missing_parts = tab_ids - part_ids
        if missing_parts:
            err(f"{sheet.rel}: {sheet.name} has tab(s) {sorted(missing_parts)} with no entry in "
                f"PARTS. The nav icon renders and switching to it shows nothing at all")

        for pid in sorted(part_ids - ({nav} if nav else set())):
            if pid not in cases:
                owner = cases_owner.rel if cases_owner else "nowhere"
                err(f"{sheet.rel}: part `{pid}` has no `case '{pid}':` in "
                    f"_preparePartContext ({owner}). The part renders with only the shared "
                    f"context, so every key its template reads is undefined and the tab comes "
                    f"up BLANK — with no error and no console warning")

        for pid in sorted(cases - part_ids):
            warn(f"{sheet.rel}: _preparePartContext has `case '{pid}':` but {sheet.name} "
                 f"declares no such part — a dead preparer, probably a part that was removed")

        # A content part whose template carries no data-tab never becomes visible: the tab
        # machinery toggles `.tab[data-tab=...]`, and a part with no such attribute is
        # rendered into the DOM and never shown.
        for pid in sorted(part_ids - ({nav} if nav else set())):
            tpl = parts.get(pid, "")
            rel = tpl[len(SYSTEM_PREFIX):] if tpl.startswith(SYSTEM_PREFIX) else tpl
            path = ROOT / rel if rel else None
            if not path or not path.is_file():
                err(f"{sheet.rel}: part `{pid}` points at a template that does not exist: {tpl!r}")
                continue
            head = strip_template_comments(path.read_text(encoding="utf-8"))
            if "data-tab=" not in head:
                err(f"{rel}: part `{pid}` of {sheet.name} has no `data-tab=` attribute, so the "
                    f"tab machinery has nothing to reveal and the tab renders empty")

        if tabs_owner is not sheet or cases_owner is not sheet:
            warn(f"{sheet.rel}: {sheet.name} declares PARTS but inherits "
                 f"{'tabs ' if tabs_owner is not sheet else ''}"
                 f"{'_preparePartContext ' if cases_owner is not sheet else ''}"
                 f"from an ancestor — every PARTS key it adds must also be added there")

    if checked == 0:
        err("I5: found no tabbed sheet with `static PARTS` and a `tabs` map — refusing to "
            "pass, because that means this gate parsed nothing")
    return checked


# ---------------------------------------------------------------------------
# I7 - resource-value-step is a <span> wherever the dot machinery reaches it
# ---------------------------------------------------------------------------

STEP = "resource-value-step"


def check_i7(classes: dict[str, SheetClass], scope: list[Path]) -> int:
    """Three rules, each tied to a line of code that would break.

    (a) a step carrying `data-action="editDot"` IS a dot: `OnDotCounterChange` counts its
        siblings with `span.resource-value-step` and returns early when
        `index >= steps.length`;
    (b) a step inside `.resource-value` is indexed by BOTH `SetupDotCounters_v2` (no tag)
        and `OnDotCounterChange` (span only), and those two disagreeing is the whole bug;
    (c) a step inside a `.resource-counter` THAT ALSO CONTAINS A DOT — the `data-state`
        branch of the same function.

    Rule (c) is deliberately conditional. `templates/actor/parts/stats_abilities.hbs` and
    `stats_attributes.hbs` put the exalted favoured-attribute checkbox in a bare
    `<div class="pullLeft resource-counter"><input class="... resource-value-step" ...>` —
    borrowing the dot's LOOK for a checkbox that is submitted by name through the form
    handler and never touches `OnDotCounterChange`. Four such inputs exist today. Banning
    every non-span step outright would fail on them on day one and teach the reader that
    this gate cries wolf; requiring the container to hold an actual dot describes the real
    hazard instead.
    """
    checked = 0
    reported: set[tuple[str, int]] = set()

    def inspect(elements: list[Element]) -> None:
        nonlocal checked
        for el in elements:
            if STEP not in el.classes:
                continue
            checked += 1
            if el.tag == "span":
                continue
            if (el.origin, el.line) in reported:
                continue      # the same source line, reached through a second part closure
            reason = None
            if el.attrs.get("data-action") == "editDot":
                reason = ("it carries data-action=\"editDot\", so it IS a dot: "
                          "OnDotCounterChange collects its siblings with "
                          "`parent.find('span.resource-value-step')` and then returns early "
                          "when `index >= steps.length`")
            elif any("resource-value" in a.classes for a in el.ancestors):
                reason = ("it sits inside a `.resource-value` container, which "
                          "SetupDotCounters_v2 paints via `.resource-value-step` (no tag) but "
                          "OnDotCounterChange indexes via `span.resource-value-step`")
            else:
                counters = [a for a in el.ancestors if "resource-counter" in a.classes]
                for counter in counters:
                    siblings = [e for e in elements
                                if counter in e.ancestors
                                and e.attrs.get("data-action") == "editDot"]
                    if siblings:
                        reason = ("it shares a `.resource-counter` with a real dot, so it "
                                  "shifts that dot's index in OnDotCounterChange's "
                                  "`span.resource-value-step` list")
                        break
            if reason:
                reported.add((el.origin, el.line))
                err(f"{el.where}: <{el.tag}> carries `{STEP}` and {reason}. "
                    f"The dot will highlight on load and silently refuse to persist on click. "
                    f"Make it a <span>")

    # Over the FLATTENED part closures, not file by file. The containers and the dots they
    # contain almost never live in the same file here — `stats_attributes.hbs` opens the
    # `.resource-value` and `stat_value_dots.hbs` fills it — so a per-file scan would leave
    # rules (b) and (c) permanently dormant.
    covered: set[str] = set()
    for sheet in classes.values():
        if not sheet.has_parts:
            continue
        parts, _ = resolve(sheet, "parts", classes)
        for tpl in (parts or sheet.parts).values():
            rel = tpl[len(SYSTEM_PREFIX):] if tpl.startswith(SYSTEM_PREFIX) else tpl
            if not rel or not (ROOT / rel).is_file():
                continue
            covered |= closure_of([tpl])
            text, origins = flatten_template(rel)
            if STEP not in text:
                continue
            elements = parse_markup(text, rel)
            for el in elements:
                if 1 <= el.line <= len(origins):
                    el.origin, el.line = origins[el.line - 1]
            inspect(elements)

    # Anything in scope that no sheet renders still gets the per-file rules; it just cannot
    # be given an ancestor chain that crosses into its caller.
    for path in scope:
        rel = str(path.relative_to(ROOT))
        if rel in covered:
            continue
        body = strip_template_comments(path.read_text(encoding="utf-8"))
        if STEP not in body:
            continue
        inspect(parse_markup(body, rel))

    # The dots that matter most are not in a template at all: `getGetStatArea_v2`
    # (module/handlebars.js) concatenates them as HTML strings. Section 2 of the v3 change
    # refactors exactly that function, so it needs the same rule.
    for path in js_files():
        src = path.read_text(encoding="utf-8")
        if STEP not in src:
            continue
        rel = str(path.relative_to(ROOT))
        for m in re.finditer(r"`((?:[^`\\]|\\.)*)`", src):
            frag = m.group(1)
            if STEP not in frag or "<" not in frag:
                continue
            offset = src[:m.start()].count("\n")
            elements = parse_markup(frag, rel)
            for el in elements:
                el.line += offset
            inspect(elements)

    if checked == 0:
        err(f"I7: found no `{STEP}` anywhere in scope — refusing to pass; either the class "
            f"was renamed (in which case OnDotCounterChange is now dead) or this gate is "
            f"looking in the wrong place")
    return checked


# ---------------------------------------------------------------------------
# I11 - no LANG: markers, and every literal localize key resolves in EN and ES
# ---------------------------------------------------------------------------

def flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in obj.items():
        full = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(flatten(value, full + "."))
        else:
            out[full] = value
    return out


LOCALIZE_LITERAL = re.compile(r"""localize\s+(['"])([^'"]+)\1""")
LOCALIZE_CONCAT = re.compile(r"""localize\s+\(\s*concat\s+(['"])([^'"]+)\1""")


def check_i11(files: list[Path]) -> tuple[int, int]:
    langs: dict[str, dict[str, str]] = {}
    for code in ("en", "es"):
        path = ROOT / "lang" / f"{code}.json"
        try:
            langs[code] = flatten(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as exc:
            err(f"I11: lang/{code}.json is unreadable or not valid JSON ({exc}) — refusing "
                f"to pass, because every key would 'resolve' against an empty table")
            return 0, 0
    if not langs["en"] or not langs["es"]:
        err("I11: a language table flattened to zero keys — refusing to pass")
        return 0, 0

    prefixes = {code: sorted({k.rsplit(".", 1)[0] + "." for k in table})
                for code, table in langs.items()}

    seen_lang: dict[str, list[int]] = {}
    seen_missing: dict[tuple[str, str], int] = {}
    key_sites = 0

    for path in files:
        rel = str(path.relative_to(ROOT))
        raw = path.read_text(encoding="utf-8")

        # NOT comment-stripped: `LANG:` is a to-do marker, and one parked in a comment is
        # still an untranslated string waiting to be re-enabled. settings.hbs:13 is exactly
        # that — the commented-out nav link for the sub-tab holding the other two.
        for m in re.finditer(r"LANG:", raw):
            seen_lang.setdefault(rel, []).append(raw[:m.start()].count("\n") + 1)

        body = strip_template_comments(raw)
        for m in LOCALIZE_LITERAL.finditer(body):
            key = m.group(2)
            line = body[:m.start()].count("\n") + 1
            key_sites += 1
            # A trailing dot is a PREFIX, not a key: the tail is concatenated by the caller
            # (`"wod.labels.add." + kind`). Requiring it to resolve exactly is the naive-scan
            # false positive this check has to avoid.
            if key.endswith("."):
                check_prefix(rel, line, key, prefixes)
                continue
            missing = [c for c in ("en", "es") if key not in langs[c]]
            if not missing:
                continue
            allow_key = (rel, key)
            if allow_key in ALLOWLIST_MISSING_I18N:
                seen_missing[allow_key] = seen_missing.get(allow_key, 0) + 1
                continue
            err(f"{rel}:{line}: {{{{localize \"{key}\"}}}} resolves in neither "
                f"{'/'.join(missing)} — Foundry renders a missing key VERBATIM, so the "
                f"player sees the {len(key)} characters of the key itself")

        for m in LOCALIZE_CONCAT.finditer(body):
            key_sites += 1
            check_prefix(rel, body[:m.start()].count("\n") + 1, m.group(2), prefixes)

    if key_sites == 0:
        err("I11: found 0 literal `{{localize}}` keys — refusing to pass; the templates "
            "cannot have stopped localizing, so this gate has stopped reading them")

    for rel, (expected, reason) in ALLOWLIST_LANG_MARKERS.items():
        lines = seen_lang.pop(rel, [])
        if not lines:
            warn(f"I11 allowlist is STALE: {rel} no longer contains `LANG:` — delete the entry")
        elif len(lines) != expected:
            err(f"{rel}: {len(lines)} `LANG:` marker(s) at line(s) "
                f"{', '.join(map(str, lines))}, allowlist expects {expected}. The allowlist "
                f"covers the known ones ({reason}); a new one is not covered by it")
        else:
            warn(f"I11 known gap: {rel} `LANG:` x{len(lines)} at line(s) "
                 f"{', '.join(map(str, lines))} — {reason}")

    for rel, lines in sorted(seen_lang.items()):
        for line in lines:
            err(f"{rel}:{line}: `LANG:` placeholder — an untranslated string that renders to "
                f"the reader exactly as written, in whatever language it was typed in")

    for key, (expected, reason) in ALLOWLIST_MISSING_I18N.items():
        rel, i18n_key = key
        got = seen_missing.get(key, 0)
        if got == 0:
            warn(f"I11 allowlist is STALE: {rel} no longer references the unresolved key "
                 f"`{i18n_key}` — delete the entry")
        elif got != expected:
            err(f"{rel}: `{i18n_key}` referenced {got} time(s), allowlist expects {expected}")
        else:
            warn(f"I11 known gap: {rel} -> `{i18n_key}` x{got} — {reason}")

    return key_sites, len(langs["en"])


def check_prefix(rel: str, line: int, prefix: str, prefixes: dict[str, list[str]]) -> None:
    for code, known in prefixes.items():
        if not any(p.startswith(prefix) for p in known):
            err(f"{rel}:{line}: `{prefix}` is used as a concatenated i18n PREFIX, and "
                f"lang/{code}.json has no key beneath it — every value the caller appends "
                f"will render as a raw key")


# ---------------------------------------------------------------------------

def main() -> int:
    classes = parse_sheet_classes()
    if not classes:
        print("sheet-invariants: parsed no classes out of module/ — refusing to pass",
              file=sys.stderr)
        return 2

    scope = template_files(SCOPE_DIRS)
    every = template_files(ALL_TEMPLATE_DIRS)
    if not scope or not every:
        print(f"sheet-invariants: found {len(scope)} actor template(s) and {len(every)} "
              f"template(s) overall — refusing to pass", file=sys.stderr)
        return 2

    check_dynamic_partials(scope)
    n_actions = check_i1(classes, scope)
    n_sheets = check_i5(classes)
    n_steps = check_i7(classes, scope)
    n_keys, n_lang = check_i11(every)

    for w in warnings:
        print(f"::warning::sheet-invariants: {w}")

    if errors:
        print(f"sheet invariants FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"sheet invariants OK: I1 {n_actions} data-action site(s) against "
          f"{len(classes)} parsed class(es); I5 {n_sheets} tabbed sheet(s); "
          f"I7 {n_steps} resource-value-step(s); I11 {n_keys} literal i18n key(s) "
          f"against {n_lang} EN keys, in {len(every)} template(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
