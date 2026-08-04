#!/usr/bin/env python3
"""I3/I4: every CSS selector the PC sheet's binders hard-code must still be producible.

WHY THIS EXISTS
---------------
`PCActorSheet._onRender` wires the sheet's behaviour up with hard-coded CSS-class
selectors — eighteen of them, in the sheet class and in `action-helpers.js`, including a
direct-child chain and one that pins an element NAME:

    ".willpower > .resource-value > .resource-value-step"   pc-actor-sheet.js:999
    "span.resource-value-step"                              action-helpers.js:981

Every one of them is a silent contract between JavaScript and markup. `querySelectorAll`
returning an empty NodeList is not an error; the binders below it all begin
`if (!x?.length) return;`. So a wrapper `<div>` inserted between `.willpower` and its
`.resource-value` does not break the sheet — it removes the changeling imbalance
right-click, with no exception, no console warning and no visual difference. A `<div>`
where a `<span>` was stops dots persisting the same way.

`add-pc-sheet-v3` is about to make this much sharper by adding `PCActorSheetV3 extends
PCActorSheet`, the first ApplicationV2 subclass in this repo. A subclass INHERITS those
binders while replacing the markup they run against, which promotes every one of these
selectors from an implementation detail into a hard requirement on the new templates. The
gate below therefore evaluates them **per sheet**: the day v3 declares its own `PARTS`,
its own template closure has to satisfy the same eighteen selectors, or this goes red.

THE SELECTORS ARE PARSED, NEVER COPIED
--------------------------------------
A hand-kept duplicate of that list is worthless within a fortnight, and this repo has the
receipts: the same class of drift is why `power-section-check.py` reads BOTH powertab
lists instead of trusting either. So nothing here is written down. The selector list is
extracted from the argument lists of `querySelector*`/`closest`/`matches`/jQuery `.find`,
and the FILES to extract from are themselves derived — the sheet class's own file, plus
every module that supplies a symbol used inside `_onRender` or registered as a
`DEFAULT_OPTIONS.actions` value. Adding a binder in a new module extends this gate's reach
automatically; deleting one shrinks it.

WHAT A "MATCH" MEANS, AND WHERE THIS CHECK IS HONEST ABOUT NOT KNOWING
---------------------------------------------------------------------
The corpus is the sheet's part templates with their partials INLINED (ancestry crosses
partial boundaries constantly here), plus the HTML that `module/**/*.js` builds as
strings — because the single most tangled selector in the list matches markup that exists
in no template at all: `getGetStatArea_v2` concatenates the whole
`.willpower > .resource-value > .resource-value-step` structure in `module/handlebars.js`.

Three verdicts, and the middle one is the point:

  EXACT      some element literally carries the tag/classes/attributes asked for. For a
             multi-part selector the ANCESTRY is checked too, so an inserted wrapper
             breaks a `>` chain and fails.
  RUNTIME    the class is never authored — `classList.add()` creates it (`.drag-over-top`
             and friends). Producible, by definition, and derived from the source.
  WILDCARD   the class is named in INTERPOLATED_CLASSES below, meaning a human has
             established that it is built by string interpolation and cannot be read
             statically. Reported as a `::warning::` on every run, never gated.

An interpolated class is NOT a general escape hatch, and the first draft of this file got
that wrong in a way worth recording. Treating any element with a `{{...}}` in its `class`
as able to produce any class made the gate accept EVERYTHING: this tree has 206 such
elements, so an invented `.wod-v3-rating-row` "matched" and the check reported green. The
escape hatch is now one explicit, counted list of one entry.

A selector with no candidate at all is an ERROR. There is one today and it is a real
find — see ALLOWLIST_UNPRODUCIBLE.

TWO LIMITS, BOTH DELIBERATE, BOTH MEASURED
------------------------------------------
1. This gate asks whether a selector is producible by the SHEET, and the sheet's markup
   includes what its helpers generate. So turning every dot in `stat_value_dots.hbs` into
   a `<div>` does NOT fail here: `module/handlebars.js` still emits `<span
   class="resource-value-step">`, so `span.resource-value-step` still matches something and
   the binder is not dead. That exact mutation is caught by `sheet-invariants.py`'s I7,
   which asks the different and complementary question — is any step in the dot machinery
   NOT a span. Neither check subsumes the other; run both.
2. `.willpower` is authored by no literal class anywhere. It exists only because
   `getGetStatArea_v2` interpolates the stat id into
   `class="sheet-boxcontainer ${statid}"` (module/handlebars.js:458). No static reading can
   confirm that `statid` is ever the string "willpower", and attempts to infer it from
   structure find plausible-looking impostors — measured 2026-08-04: the dynamic-class
   grandparents of a `.resource-value > .resource-value-step` pair are
   `power_spheres.hbs:13` and `power_realms.hbs:13`, neither of which has anything to do
   with willpower. So this selector is NAMED on every run and never gated, in the same
   spirit as `power-section-check.py`'s KNOWN_UNDEFINED. Its markup is what the v3 change
   is about to refactor (`buildStatArea`, task 2.1); the harness that covers it is the
   old-vs-new string-identity test in task 2.3, not this file.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: The sheet family whose binders this checks. Named once, as a ROOT class: every
#: `class X extends <this>` in the tree is discovered and checked as well, which is how
#: `PCActorSheetV3` gets covered without editing this file.
SHEET_ROOT = "PCActorSheet"

SYSTEM_PREFIX = "systems/worldofdarkness/"
JS_DIRS = ("module",)
JS_EXTRA = ("wod.js",)

#: selector -> reason. An entry here means: parsed, evaluated, no markup in this system can
#: produce it, and that has been looked at by a person.
#:
#: `.ability-statArea[data-droparea]` (pc-actor-sheet.js:816) is DEAD CODE, verified
#: 2026-08-04. It is the last branch of the PC sheet's `_onDragOver`, highlighting an
#: "ability category drop zone". `data-droparea` appears in exactly four templates, all of
#: them parts of the SPLAT ITEM sheet (`templates/items/parts/splat-abilities-sheet.hbs`
#: and siblings) — the PC sheet's own ability markup uses `.ability-statArea` with no such
#: attribute, and `abilities.html`, which does, belongs to the legacy appv1 sheets and is
#: in no ApplicationV2 part closure. The branch has therefore never fired on a PC sheet.
#: Harmless: it adds a CSS class for drag feedback and nothing else, so its absence costs
#: a highlight nobody has seen. Allowlisted rather than blocking because deleting a branch
#: from a live drag handler is a behaviour change that wants a human, and because a gate
#: that is red on the day it lands is a gate that gets switched off.
#: class name -> where the interpolation that builds it lives. A class listed here is
#: accepted on an element whose `class` attribute contains an interpolation, and the
#: selector that needs it is warned about rather than gated. Keep this list at the size it
#: is: it is the one hole in the check, and every entry is a selector nothing verifies.
#:
#: `willpower` is authored by no literal `class="..."` anywhere in the system. It reaches
#: the DOM only through `getGetStatArea_v2`'s
#: `<div class="sheet-boxcontainer ${statid}">` (module/handlebars.js:458), where `statid`
#: is `stat.system.id` — a value that comes from actor DATA, not from this repo. Inferring
#: it from structure was tried and rejected: measured 2026-08-04, the dynamic-class
#: grandparents of a `.resource-value > .resource-value-step` pair are
#: `power_spheres.hbs:13` and `power_realms.hbs:13`, so a structural inference would
#: "confirm" the willpower chain using two elements that have nothing to do with willpower.
INTERPOLATED_CLASSES: dict[str, str] = {
    "willpower": "built by `${statid}` in getGetStatArea_v2 (module/handlebars.js:458); "
                 "`statid` is actor data, so no static reading can confirm it",
}

ALLOWLIST_UNPRODUCIBLE: dict[str, str] = {
    # Empty on purpose. Its only entry was `.ability-statArea[data-droparea]`, a drag highlight
    # whose attribute no PC-sheet template authors, so it had never fired. The branch was deleted
    # rather than tolerated. The dict and the STALE check stay for the next one.
}

errors: list[str] = []
warnings: list[str] = []
notes: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


# ---------------------------------------------------------------------------
# JavaScript reading
# ---------------------------------------------------------------------------

def js_blank_comments(js: str) -> str:
    """Comments to blanks, offsets preserved so reported line numbers stay true."""
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


def balanced(text: str, open_idx: int, opener: str, closer: str) -> str | None:
    if open_idx < 0 or open_idx >= len(text) or text[open_idx] != opener:
        return None
    depth, i = 0, open_idx
    while i < len(text):
        ch = text[i]
        if ch in "\"'`":
            quote = ch
            i += 1
            while i < len(text) and text[i] != quote:
                if text[i] == "\\":
                    i += 1
                i += 1
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[open_idx:i + 1]
        i += 1
    return None


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
    def __init__(self, name: str, base: str, path: Path, body: str):
        self.name = name
        self.base = base
        self.path = path
        self.body = body
        self.parts: dict[str, str] = {}

    @property
    def rel(self) -> str:
        return str(self.path.relative_to(ROOT))


def parse_classes() -> dict[str, SheetClass]:
    found: dict[str, SheetClass] = {}
    for path in js_files():
        src = js_blank_comments(path.read_text(encoding="utf-8"))
        for m in re.finditer(r"class\s+([A-Za-z_$][\w$]*)\s+extends\s+([^\s{]+)", src):
            body = balanced(src, src.find("{", m.end()), "{", "}")
            if body is None:
                continue
            sheet = SheetClass(m.group(1), m.group(2), path, body)
            pm = re.search(r"static\s+PARTS\s*=\s*", body)
            if pm:
                block = balanced(body, body.find("{", pm.end()), "{", "}")
                if block:
                    for tm in re.finditer(
                            r"([A-Za-z_$][\w$]*)\s*:\s*\{[^{}]*?template\s*:\s*[\"']([^\"']+)[\"']",
                            block, re.S):
                        sheet.parts[tm.group(1)] = tm.group(2)
            found[sheet.name] = sheet
    return found


def family(classes: dict[str, SheetClass]) -> list[SheetClass]:
    """`SHEET_ROOT` and everything that extends it, transitively."""
    members = {SHEET_ROOT} & set(classes)
    changed = True
    while changed:
        changed = False
        for name, sheet in classes.items():
            if name not in members and sheet.base in members:
                members.add(name)
                changed = True
    return [classes[n] for n in sorted(members)]


def inherited(sheet: SheetClass, classes: dict[str, SheetClass]) -> list[SheetClass]:
    chain: list[SheetClass] = []
    seen: set[str] = set()
    cur: SheetClass | None = sheet
    while cur is not None and cur.name not in seen:
        seen.add(cur.name)
        chain.append(cur)
        cur = classes.get(cur.base)
    return chain


IMPORT_RE = re.compile(r"import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*(?:([\w$]+)\s*)?"
                       r"from\s+[\"']([^\"']+)[\"']", re.S)


def selector_sources(sheet: SheetClass, classes: dict[str, SheetClass]) -> list[Path]:
    """The files whose selectors this sheet is bound by. DERIVED, never listed.

    Every class in the `extends` chain contributes its own file, plus every module that
    supplies a symbol used in `_onRender`'s body or registered as an action handler. That
    reaches `action-helpers.js` (which supplies `SetupDotCounters_v2` to `_onRender` and
    every value in the actions map) and deliberately does not reach, say,
    `drop-helpers.js`, whose selectors are about Foundry's own window chrome
    (`.window-app`, `.app.window-app.actor-sheet`) — markup this repo does not author and
    could never be asked to produce.
    """
    files: list[Path] = []
    for cls in inherited(sheet, classes):
        if cls.path not in files:
            files.append(cls.path)

        src = js_blank_comments(cls.path.read_text(encoding="utf-8"))
        symbols: set[str] = set()

        om = re.search(r"_onRender\s*\(", cls.body)
        if om:
            close = cls.body.find(")", om.end())
            method = balanced(cls.body, cls.body.find("{", close), "{", "}") if close != -1 else None
            if method:
                symbols |= set(re.findall(r"\b([A-Z][\w$]*)\b", method))

        dm = re.search(r"static\s+DEFAULT_OPTIONS\s*=\s*", cls.body)
        if dm:
            block = balanced(cls.body, cls.body.find("{", dm.end()), "{", "}")
            am = re.search(r"\bactions\s*:\s*", block) if block else None
            actions = balanced(block, block.find("{", am.end()), "{", "}") if am else None
            if actions:
                symbols |= set(re.findall(r":\s*([A-Za-z_$][\w$.]*)", actions))
                symbols = {s.split(".")[0] for s in symbols}

        for im in IMPORT_RE.finditer(src):
            default_a, named, default_b, spec = im.groups()
            provided = {default_a, default_b} - {None}
            if named:
                provided |= {n.strip().split(" as ")[-1].strip()
                             for n in named.split(",") if n.strip()}
            if not (provided & symbols):
                continue
            target = (cls.path.parent / spec).resolve()
            if target.is_file() and target not in files:
                files.append(target)
    return files


# ---------------------------------------------------------------------------
# Selector extraction
# ---------------------------------------------------------------------------

SELECTOR_CALL = re.compile(
    r"\.(querySelectorAll|querySelector|closest|matches|find)\s*(?:\?\.)?\s*\(")
STRING_LITERAL = re.compile(r"""(['"])((?:\\.|(?!\1).)*)\1""")

#: Element names a selector may legally start with. Used to tell `span.resource-value-step`
#: (a selector) from `wod.types.shapeform` (an i18n key handed to Array.prototype.find),
#: which is otherwise the same shape. Anything not an element name must lead with . # or [.
HTML_TAGS = {
    "a", "abbr", "article", "aside", "audio", "b", "button", "canvas", "code", "col",
    "datalist", "details", "div", "em", "embed", "fieldset", "figure", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "iframe", "img", "input",
    "label", "legend", "li", "main", "nav", "object", "ol", "optgroup", "option", "p",
    "pre", "progress", "section", "select", "small", "span", "strong", "sub", "summary",
    "sup", "svg", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "tr", "u",
    "ul", "video",
}


def looks_like_selector(s: str) -> bool:
    s = s.strip()
    if not s or "{" in s or "(" in s or ";" in s:
        return False
    if re.match(r"^[.#\[*]", s):
        return True
    m = re.match(r"^([a-zA-Z][\w-]*)(?:[.#\[:]|\s|$)", s)
    return bool(m and m.group(1).lower() in HTML_TAGS)


def extract_selectors(files: list[Path]) -> dict[str, list[str]]:
    """selector -> the `file:line` sites that hard-code it."""
    out: dict[str, list[str]] = {}
    for path in files:
        rel = str(path.relative_to(ROOT))
        src = js_blank_comments(path.read_text(encoding="utf-8"))

        def record(sel: str, at: int) -> None:
            line = src[:at].count("\n") + 1
            out.setdefault(sel.strip(), []).append(f"{rel}:{line}")

        for m in SELECTOR_CALL.finditer(src):
            args = balanced(src, src.index("(", m.end() - 1), "(", ")")
            if args is None:
                continue
            # ALL literals in the argument list, not just the first: a ternary
            # (`closest(x ? '.resource-counter' : '.resource-value')`) hides one of the two
            # otherwise, and that one is `OnDotCounterChange`'s.
            for lm in STRING_LITERAL.finditer(args):
                if looks_like_selector(lm.group(2)):
                    record(lm.group(2), m.start())

        # `const itemClasses = ['.advantage-item', '.feature-item', '.power-item'];`
        # then `closest(itemClass)` — the selectors are real and the call site cannot see
        # them. An array whose every element is a class/id selector is unambiguous enough
        # to harvest; anything mixed is left alone.
        for m in re.finditer(r"\[\s*((?:['\"][^'\"]+['\"]\s*,\s*)+['\"][^'\"]+['\"])\s*,?\s*\]", src):
            items = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
            if items and all(re.match(r"^[.#]", x) for x in items):
                for x in items:
                    record(x, m.start())
    return out


def runtime_classes(files: list[Path]) -> set[str]:
    """Classes the code creates at runtime — `classList.add`, jQuery `addClass`. These are
    producible by definition and appear in no template (`.drag-over-top` and friends)."""
    out: set[str] = set()
    for path in js_files():
        src = js_blank_comments(path.read_text(encoding="utf-8"))
        for m in re.finditer(r"""(?:classList\.(?:add|toggle)|addClass)\(\s*['"]([^'"]+)['"]""",
                             src):
            out.update(m.group(1).split())
    return out


# ---------------------------------------------------------------------------
# The markup corpus
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
    """Tag soup into elements with an ancestor chain. `{{#if}}` is ignored deliberately:
    the question is what this markup CAN produce, not what it produces for one actor."""
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
        elements.append(Element(tag, classes, dynamic, attrs, list(stack), origin,
                                text[:m.start()].count("\n") + 1))
        if tag not in VOID and not whole.rstrip().endswith("/>"):
            stack.append(elements[-1])
    return elements


def blank_template_comments(text: str) -> str:
    def blank(m: re.Match) -> str:
        return "".join(c if c == "\n" else " " for c in m.group(0))
    text = re.sub(r"\{\{!--.*?--\}\}", blank, text, flags=re.S)
    text = re.sub(r"\{\{!.*?\}\}", blank, text, flags=re.S)
    text = re.sub(r"<!--.*?-->", blank, text, flags=re.S)
    return text


INCLUDE = re.compile(r'\{\{>\s*"([^"]+)"[^}]*\}\}', re.S)


def flatten_template(rel: str, depth: int = 0,
                     stack: tuple[str, ...] = ()) -> tuple[str, list[tuple[str, int]]]:
    """A part with its static partials inlined, plus a per-line (file, line) origin map.
    Sibling of the same function in `sheet-invariants.py`; both exist because ancestry in
    this tree crosses partial boundaries and a per-file scan cannot see it."""
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
        if corigins:
            out += ctext.split("\n")
            origins += corigins
        pos = m.end()

    emit(raw[pos:], raw[:pos].count("\n") + 1)
    return "\n".join(out), origins


def template_corpus(sheet: SheetClass, classes: dict[str, SheetClass]) -> list[Element]:
    parts: dict[str, str] = {}
    for cls in reversed(inherited(sheet, classes)):
        parts.update(cls.parts)
    corpus: list[Element] = []
    for tpl in parts.values():
        rel = tpl[len(SYSTEM_PREFIX):] if tpl.startswith(SYSTEM_PREFIX) else tpl
        if not rel or not (ROOT / rel).is_file():
            continue
        text, origins = flatten_template(rel)
        for el in parse_markup(text, rel):
            if 1 <= el.line <= len(origins):
                el.origin, el.line = origins[el.line - 1]
            corpus.append(el)
    return corpus


def generated_corpus() -> list[Element]:
    """Markup this system builds as JavaScript strings. Not optional: the entire
    `.willpower > .resource-value > .resource-value-step` structure exists only here."""
    corpus: list[Element] = []
    for path in js_files():
        src = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(ROOT))
        for m in re.finditer(r"`((?:[^`\\]|\\.)*)`", src):
            frag = m.group(1)
            if "<" not in frag:
                continue
            offset = src[:m.start()].count("\n")
            for el in parse_markup(frag, rel):
                el.line += offset
                corpus.append(el)
    return corpus


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

COMPOUND = re.compile(r"""
    ^(?P<tag>[a-zA-Z][\w-]*|\*)?
    (?P<rest>(?:\.[\w-]+|\#[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?)*)$
""", re.X)
ATTR_SEL = re.compile(r"""\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*["']?([^\]"']*)["']?)?\s*\]""")


class Compound:
    def __init__(self, text: str):
        self.text = text
        m = COMPOUND.match(text)
        self.valid = bool(m)
        tag = m.group("tag") if m else None
        self.tag = tag.lower() if tag and tag != "*" else None
        self.classes = re.findall(r"\.([\w-]+)", text)
        self.ids = re.findall(r"#([\w-]+)", text)
        self.attrs = ATTR_SEL.findall(text)

    def match(self, el: Element, runtime: set[str]) -> str | None:
        """None = no match; 'exact'; 'runtime'; 'wildcard'."""
        if self.tag and el.tag != self.tag:
            return None
        if self.ids and el.attrs.get("id") not in self.ids:
            return None
        for name, op, value in self.attrs:
            if name not in el.attrs:
                return None
            actual = el.attrs[name]
            if op and value and "{{" not in actual and "${" not in actual:
                if op == "=" and actual != value:
                    return None
                if op == "*=" and value not in actual:
                    return None
        verdict = "exact"
        for cls in self.classes:
            if cls in el.classes:
                continue
            if cls in runtime:
                verdict = "runtime" if verdict == "exact" else verdict
                continue
            # The narrow hole. An interpolated `class` attribute admits ONLY the class
            # names a human has established are built that way; letting it admit any name
            # made this check accept an invented selector (see the module docstring).
            if el.dynamic_class and cls in INTERPOLATED_CLASSES:
                verdict = "wildcard"
                continue
            return None
        return verdict


def split_alternatives(selector: str) -> list[str]:
    return [s.strip() for s in selector.split(",") if s.strip()]


def tokenise(alternative: str) -> list[str] | None:
    """`.a > .b .c` -> ['.a', '>', '.b', ' ', '.c']. None if a combinator this check does
    not model (`+`, `~`) turns up — better to say so than to guess."""
    if re.search(r"[+~]", alternative):
        return None
    parts = re.split(r"(\s*>\s*|\s+)", alternative.strip())
    tokens: list[str] = []
    for part in parts:
        if not part:
            continue
        if part.strip() == ">":
            tokens.append(">")
        elif not part.strip():
            tokens.append(" ")
        else:
            tokens.append(part.strip())
    return tokens


def evaluate(alternative: str, corpus: list[Element], runtime: set[str]) -> tuple[str, str]:
    """(verdict, detail) for one comma-free selector, ancestry included."""
    tokens = tokenise(alternative)
    if tokens is None:
        return "unmodelled", f"`{alternative}` uses a sibling combinator this gate does not model"

    compounds = [Compound(t) for t in tokens if t not in (">", " ")]
    combinators = [t for t in tokens if t in (">", " ")]
    for c in compounds:
        if not c.valid:
            return "unmodelled", f"`{c.text}` is not a selector this gate can parse"

    # Every compound must at least exist somewhere, and the weakest verdict wins.
    worst = "exact"
    order = {"exact": 0, "runtime": 1, "wildcard": 2}
    for c in compounds:
        best = None
        for el in corpus:
            v = c.match(el, runtime)
            if v and (best is None or order[v] < order[best]):
                best = v
                if v == "exact":
                    break
        if best is None:
            return "missing", f"nothing in this sheet's markup can produce `{c.text}`"
        if order[best] > order[worst]:
            worst = best

    if len(compounds) == 1:
        return worst, ""

    # Ancestry. Walk right to left: for the rightmost compound's matches, does an ancestor
    # chain satisfying every combinator exist? `>` demands the immediate parent.
    if worst != "exact":
        return worst, (f"the compounds exist but at least one only through an interpolated "
                       f"class, so the ancestry of `{alternative}` cannot be verified "
                       f"statically")

    def chain_ok(el: Element, idx: int) -> bool:
        if idx < 0:
            return True
        combinator = combinators[idx]
        compound = compounds[idx]
        if combinator == ">":
            parent = el.ancestors[-1] if el.ancestors else None
            return bool(parent and compound.match(parent, runtime) == "exact"
                        and chain_ok(parent, idx - 1))
        return any(compound.match(a, runtime) == "exact" and chain_ok(a, idx - 1)
                   for a in reversed(el.ancestors))

    for el in corpus:
        if compounds[-1].match(el, runtime) == "exact" and chain_ok(el, len(compounds) - 2):
            return "exact", ""
    return "structure", (f"every compound of `{alternative}` exists, but no element is "
                         f"actually arranged that way — the combinators do not hold")


# ---------------------------------------------------------------------------

def main() -> int:
    classes = parse_classes()
    if SHEET_ROOT not in classes:
        print(f"binder-selector-check: no `class {SHEET_ROOT}` in this tree — refusing to "
              f"pass, because the sheet family this gate is about does not exist here",
              file=sys.stderr)
        return 2

    sheets = family(classes)
    generated = generated_corpus()
    if not generated:
        print("binder-selector-check: parsed no generated markup out of module/**/*.js — "
              "refusing to pass; `getGetStatArea_v2` alone should produce dozens of nodes",
              file=sys.stderr)
        return 2

    total_selectors = 0
    seen_allowed: set[str] = set()

    for sheet in sheets:
        sources = selector_sources(sheet, classes)
        selectors = extract_selectors(sources)
        runtime = runtime_classes(sources)
        corpus = template_corpus(sheet, classes) + generated

        source_list = ", ".join(str(p.relative_to(ROOT)) for p in sources)
        if not selectors:
            err(f"{sheet.name}: extracted 0 selectors from {source_list} — refusing to pass. "
                f"The binders cannot have stopped using selectors, so this gate has stopped "
                f"reading them")
            continue
        if not corpus:
            err(f"{sheet.name}: built an EMPTY markup corpus from its PARTS — every selector "
                f"below would 'fail' for the same uninteresting reason, so this is reported "
                f"as a broken gate rather than as {len(selectors)} findings")
            continue

        total_selectors += len(selectors)
        notes.append(f"{sheet.name}: {len(selectors)} selector(s) from {len(sources)} source "
                     f"file(s), against {len(corpus)} candidate element(s)")

        for selector, sites in sorted(selectors.items()):
            where = ", ".join(sorted(set(sites)))
            if selector in ALLOWLIST_UNPRODUCIBLE:
                seen_allowed.add(selector)
                warn(f"{sheet.name}: known-dead selector `{selector}` ({where}) — "
                     f"{ALLOWLIST_UNPRODUCIBLE[selector]}")
                continue

            verdicts = [evaluate(alt, corpus, runtime) for alt in split_alternatives(selector)]
            # A comma-separated list is satisfied if ANY alternative is; that is what the
            # browser does, and `.drag-over-top, .drag-over-bottom, .drag-over` is used to
            # CLEAR classes, so one surviving alternative is enough for the call to matter.
            best = min(verdicts, key=lambda v: {"exact": 0, "runtime": 1, "wildcard": 2,
                                                "unmodelled": 3, "structure": 4,
                                                "missing": 5}[v[0]])
            verdict, detail = best

            if verdict in ("exact", "runtime"):
                continue
            if verdict == "wildcard":
                which = [f"`{c}` — {INTERPOLATED_CLASSES[c]}"
                         for c in sorted(INTERPOLATED_CLASSES) if f".{c}" in selector]
                warn(f"{sheet.name}: `{selector}` ({where}) is NOT GATED. "
                     f"{'; '.join(which) or detail}. If whatever builds that class stops "
                     f"emitting it, or a wrapper is inserted into the chain, the binder goes "
                     f"silently dead and nothing here will notice — this one needs eyes")
                continue
            if verdict == "unmodelled":
                warn(f"{sheet.name}: `{selector}` ({where}) was NOT verified — {detail}")
                continue
            if verdict == "structure":
                err(f"{sheet.name}: {detail} ({where}). Every class exists, so this reads as "
                    f"a wrapper element inserted into the chain — which breaks the binder "
                    f"with no error, no console warning and no visual difference")
                continue
            err(f"{sheet.name}: {detail} — hard-coded at {where}. `querySelectorAll` will "
                f"return an empty list and the binder will silently do nothing. Either the "
                f"markup lost a class/element the JavaScript still expects, or this binder "
                f"is dead code")

    for selector, reason in ALLOWLIST_UNPRODUCIBLE.items():
        if selector not in seen_allowed:
            warn(f"allowlist is STALE: `{selector}` is no longer hard-coded anywhere (or is "
                 f"now producible) — delete the entry")

    # If an interpolated class becomes literally authored, the hole can be closed.
    authored: set[str] = set()
    for sheet in sheets:
        for el in template_corpus(sheet, classes) + generated:
            authored |= el.classes
    for cls in INTERPOLATED_CLASSES:
        if cls in authored:
            warn(f"INTERPOLATED_CLASSES is STALE: `{cls}` is now authored as a literal class "
                 f"somewhere, so the selectors that need it can be gated properly — delete "
                 f"the entry and let them be checked")

    if total_selectors == 0:
        err("no sheet in the family yielded a single selector — refusing to pass")

    for n in notes:
        print(f"binder-selector-check: {n}")
    for w in warnings:
        print(f"::warning::binder-selector-check: {w}")

    if errors:
        print(f"binder selector check FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    print(f"binder selector check OK: {total_selectors} hard-coded selector(s) across "
          f"{len(sheets)} sheet(s) in the {SHEET_ROOT} family are all still producible")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
