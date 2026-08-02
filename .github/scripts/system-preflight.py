#!/usr/bin/env python3
"""Offline validation of the committed `worldofdarkness` system tree.

This is the gate the deploy job depends on. It NEVER touches the network or the
Foundry server: it only inspects the checkout, so it is safe (and useful) to run
by hand before pushing:

    python3 .github/scripts/system-preflight.py

Why it exists: this repo has NO test suite, no build step and no linter (measured
2026-07-30: no package.json, no test runner config, no eslint config anywhere in
the tree). Until 2026-07-30 the deploy workflow rsynced the tree to the live
Foundry server on every push to main with nothing at all in front of it. This is
a game SYSTEM, so a malformed manifest or a dangling reference does not degrade
one module -- it breaks every actor sheet in every world on that server.

So the requirements below are derived from what Foundry actually reads out of
system.json at startup, and from what the code in this tree actually fetches at
runtime. Every check here is one that would otherwise be discovered by a player
opening a sheet.

Exit code 0 = safe to deploy. Exit code 1 = at least one ERROR; the deploy job
must not run.

ERRORS fail the job. WARNINGS are printed and do not: they record pre-existing
facts about this tree that are not worth blocking a deploy over (see
KNOWN_MISSING_REFERENCES) and must not silently grow.
"""

from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys

SYSTEM_ID = "worldofdarkness"  # also the directory name on the Foundry server
VERSION_RE = re.compile(r"\d+\.\d+\.\d+")

# Foundry document classes that may back a compendium pack.
PACK_TYPES = {
    "Actor", "Item", "JournalEntry", "Scene", "Macro", "RollTable",
    "Playlist", "Adventure", "Cards",
}

# Runtime paths that code in this tree references but that are NOT in the repo
# (measured 2026-07-30; also absent from the live server, so these fetches 404
# today). They are PRE-EXISTING code bugs in module/scripts/import-helpers.js,
# not deploy regressions, so they are warnings and the deploy is not blocked on
# them. Anything NOT on this list that goes missing IS an error -- that is the
# case this check is here to catch (a renamed/deleted template or asset).
KNOWN_MISSING_REFERENCES = {
    "data/demon/apocalyptic-form-abilities.json",
    "assets/data/disciplines.json",
}

errors: list[str] = []
warnings: list[str] = []


def error(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def git_ls(*patterns: str) -> list[str]:
    out = subprocess.run(["git", "ls-files", *patterns], check=True,
                         capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def strip_system_prefix(path: str) -> str:
    """`systems/worldofdarkness/x` is how Foundry addresses a file; on disk it is `x`."""
    prefix = f"systems/{SYSTEM_ID}/"
    return path[len(prefix):] if path.startswith(prefix) else path


# ---------------------------------------------------------------------------
# 1. system.json itself
# ---------------------------------------------------------------------------
try:
    with open("system.json", encoding="utf-8") as fh:
        manifest = json.load(fh)
except (OSError, json.JSONDecodeError) as exc:
    print(f"::error::system.json is unreadable or not valid JSON: {exc}")
    sys.exit(1)  # nothing else can be checked

if manifest.get("id") != SYSTEM_ID:
    error(f"system.json id is {manifest.get('id')!r}, expected {SYSTEM_ID!r} "
          f"(it must match the directory the deploy writes to)")

version = str(manifest.get("version", ""))
if not VERSION_RE.fullmatch(version):
    error(f"system.json version {version!r} is not X.Y.Z")

for field in ("title", "description"):
    if not str(manifest.get(field, "")).strip():
        warn(f"system.json {field} is empty")

compat = manifest.get("compatibility")
if not isinstance(compat, dict):
    error("system.json has no compatibility block")
else:
    for key in ("minimum", "verified"):
        if not str(compat.get(key, "")).strip():
            error(f"system.json compatibility.{key} is missing "
                  f"(Foundry refuses to load a system it cannot version-check)")
    bounds = {k: compat.get(k) for k in ("minimum", "verified", "maximum")
              if compat.get(k) is not None}
    try:
        nums = {k: int(str(v)) for k, v in bounds.items()}
    except ValueError:
        pass  # non-integer generation strings; nothing to order
    else:
        if "minimum" in nums and "verified" in nums and nums["minimum"] > nums["verified"]:
            error(f"compatibility.minimum ({nums['minimum']}) > verified ({nums['verified']})")
        if "verified" in nums and "maximum" in nums and nums["verified"] > nums["maximum"]:
            error(f"compatibility.verified ({nums['verified']}) > maximum ({nums['maximum']})")

# ---------------------------------------------------------------------------
# 2. Every file the manifest names must exist in the tree. A dangling entry here
#    is not a warning in Foundry -- a missing esmodule aborts system load, and a
#    missing style or language file logs and degrades every sheet.
# ---------------------------------------------------------------------------
esmodules = manifest.get("esmodules") or []
if not esmodules:
    error("system.json declares no esmodules; nothing would execute")
for entry in esmodules:
    if not os.path.isfile(entry):
        error(f"esmodules entry {entry!r} does not exist in the tree")

styles = manifest.get("styles") or []
for entry in styles:
    if not os.path.isfile(entry):
        error(f"styles entry {entry!r} does not exist in the tree")

languages = manifest.get("languages") or []
if not languages:
    error("system.json declares no languages")
seen_langs: set[str] = set()
for lang in languages:
    code, path = lang.get("lang"), lang.get("path")
    if not code:
        error(f"languages entry {lang!r} has no lang code")
    elif code in seen_langs:
        error(f"languages declares {code!r} twice")
    else:
        seen_langs.add(code)
    if not path or not os.path.isfile(path):
        error(f"language {code!r}: path {path!r} does not exist in the tree")
        continue
    try:
        with open(path, encoding="utf-8") as fh:
            json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        error(f"language {code!r}: {path} is not valid JSON: {exc}")

# Manifest fields that name a file by its Foundry URL path.
background = manifest.get("background")
if background and not os.path.exists(strip_system_prefix(background)):
    error(f"background {background!r} does not exist in the tree")
license_file = manifest.get("license")
if license_file and not os.path.exists(strip_system_prefix(license_file)):
    # Fired until 2026-08-02: the manifest inherited "LICENSE.txt" from upstream
    # while the file in this tree is "LICENSE", so Foundry's setup-UI license link
    # 404'd. Fixed in system.json; the check stays because the next such typo is
    # cosmetic too and should keep warning rather than blocking.
    warn(f"license {license_file!r} does not exist in the tree "
         f"(the license file here is {'LICENSE' if os.path.exists('LICENSE') else 'unknown'})")

# ---------------------------------------------------------------------------
# 3. Compendium packs. These are compiled LevelDB directories; a pack whose
#    path is wrong or whose CURRENT/MANIFEST is missing shows up in Foundry as
#    an empty compendium, or refuses to open at all.
# ---------------------------------------------------------------------------
packs = manifest.get("packs") or []
if not packs:
    error("system.json declares no packs")

declared_paths: set[str] = set()
seen_names: set[str] = set()
for pack in packs:
    name, path = pack.get("name"), pack.get("path")
    label = pack.get("label")
    if not name:
        error(f"pack {pack!r} has no name")
    elif name in seen_names:
        error(f"pack name {name!r} is declared twice")
    else:
        seen_names.add(name)
    if not label:
        warn(f"pack {name!r} has no label")
    if pack.get("system") != SYSTEM_ID:
        error(f"pack {name!r}: system is {pack.get('system')!r}, expected {SYSTEM_ID!r}")
    if pack.get("type") not in PACK_TYPES:
        error(f"pack {name!r}: type {pack.get('type')!r} is not a Foundry document type")
    if not path:
        error(f"pack {name!r} has no path")
        continue
    if path in declared_paths:
        error(f"pack path {path!r} is declared twice")
    declared_paths.add(path)
    if not path.startswith("packs/"):
        error(f"pack {name!r}: path {path!r} is outside packs/")
    if not os.path.isdir(path):
        error(f"pack {name!r}: path {path!r} is not a directory")
        continue
    if not os.path.isfile(os.path.join(path, "CURRENT")):
        error(f"pack {name!r}: no CURRENT (not a compiled LevelDB directory)")
    if not glob.glob(os.path.join(path, "MANIFEST-*")):
        error(f"pack {name!r}: no MANIFEST-*")
    if not glob.glob(os.path.join(path, "*.ldb")):
        error(f"pack {name!r}: no *.ldb (empty pack?)")

on_disk = {d for d in glob.glob("packs/*") if os.path.isdir(d)}
for extra in sorted(on_disk - declared_paths):
    # Deployed but invisible to Foundry. Warn: packs/abilities has been in this
    # state since before CD existed (measured 2026-07-30).
    warn(f"packs/ contains {extra} which system.json does not declare "
         f"(it deploys and is then ignored by Foundry)")

# A committed LOCK would be shipped to the server and handed to the live
# LevelDB. LOG/LOG.old ARE committed here (33 of each, upstream's habit) and are
# harmless -- Foundry rewrites them on open -- so they are not flagged.
tracked_locks = [f for f in git_ls("packs") if os.path.basename(f) == "LOCK"]
if tracked_locks:
    error(f"{len(tracked_locks)} LevelDB LOCK files are committed under packs/ "
          f"(e.g. {tracked_locks[0]})")

# packFolders drives the compendium sidebar; a reference to an undeclared pack
# name silently drops that pack out of its folder.
def check_folders(folders: list, where: str = "packFolders") -> None:
    for folder in folders or []:
        for pack_name in folder.get("packs", []) or []:
            if pack_name not in seen_names:
                error(f"{where}: folder {folder.get('name')!r} references "
                      f"undeclared pack {pack_name!r}")
        check_folders(folder.get("folders", []), where)


check_folders(manifest.get("packFolders", []))

# ---------------------------------------------------------------------------
# 4. template.json + documentTypes. A documentTypes subtype that template.json
#    does not define gets no data model, which breaks every sheet of that type.
# ---------------------------------------------------------------------------
template = None
if os.path.exists("template.json"):
    try:
        with open("template.json", encoding="utf-8") as fh:
            template = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        error(f"template.json is not valid JSON: {exc}")

document_types = manifest.get("documentTypes") or {}
for doc_name, subtypes in document_types.items():
    if template is None:
        break
    known = template.get(doc_name, {}).get("types", [])
    if not known:
        error(f"documentTypes declares {doc_name} but template.json defines no "
              f"{doc_name}.types")
        continue
    for subtype in subtypes:
        if subtype not in known:
            error(f"documentTypes {doc_name}.{subtype!r} is not in "
                  f"template.json {doc_name}.types")

# ---------------------------------------------------------------------------
# 5. Every committed JSON outside packs/ must parse. lang/, tours/ and
#    oda-bio.json are all read with JSON.parse at runtime; a trailing comma is a
#    silent feature outage in Foundry's log.
# ---------------------------------------------------------------------------
json_files = [f for f in git_ls("*.json") if not f.startswith("packs/")]
for path in json_files:
    try:
        with open(path, encoding="utf-8") as fh:
            json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        error(f"{path} is not valid JSON: {exc}")

# ---------------------------------------------------------------------------
# 6. Static ES import graph. `node --check` (js-syntax-check.sh) proves each
#    file PARSES; it cannot see that `import x from "./gone.js"` names a file
#    that no longer exists. In the browser that is a hard module-load failure of
#    the whole system, so it is checked here.
# ---------------------------------------------------------------------------
js_files = git_ls("*.js")
rel_import_re = re.compile(r"""\bfrom\s*['"](\.[^'"\n]+)['"]""")
dyn_import_re = re.compile(r"""\bimport\s*\(\s*['"](\.[^'"\n]+)['"]""")
import_count = 0
for path in js_files:
    try:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
    except OSError as exc:
        # git tracks it but it is not on disk. Impossible in a fresh CI checkout;
        # happens locally with an uncommitted rename, which is exactly the state
        # that would ship a dangling import.
        error(f"{path} is tracked by git but missing from the tree: {exc}")
        continue
    for pattern in (rel_import_re, dyn_import_re):
        for match in pattern.finditer(src):
            import_count += 1
            target = os.path.normpath(os.path.join(os.path.dirname(path), match.group(1)))
            if not os.path.isfile(target):
                error(f"{path}: import {match.group(1)!r} resolves to {target}, "
                      f"which does not exist")

# ---------------------------------------------------------------------------
# 7. `systems/worldofdarkness/...` string literals: templates, assets and data
#    files fetched at runtime. Same class of failure as above, one layer out.
# ---------------------------------------------------------------------------
literal_re = re.compile(r"""["'`](systems/""" + SYSTEM_ID + r"""/[^"'`\n{}]+)["'`]""")
checked_files = [f for f in git_ls()
                 if not f.startswith(("packs/", "doc/", ".github/"))]
literal_count = 0
missing_refs: dict[str, str] = {}
for path in checked_files:
    try:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
    except (OSError, UnicodeDecodeError):
        continue  # binary asset
    for match in literal_re.finditer(src):
        literal_count += 1
        rel = strip_system_prefix(match.group(1))
        if not os.path.exists(rel):
            missing_refs.setdefault(rel, path)

for rel, referrer in sorted(missing_refs.items()):
    if rel in KNOWN_MISSING_REFERENCES:
        warn(f"{referrer} references {rel}, which is not in the tree "
             f"(pre-existing; that fetch 404s at runtime)")
    else:
        error(f"{referrer} references systems/{SYSTEM_ID}/{rel}, "
              f"which does not exist in the tree")

# ---------------------------------------------------------------------------
print(f"system {manifest.get('id')} v{version} "
      f"(Foundry {compat.get('minimum') if isinstance(compat, dict) else '?'}"
      f"-{compat.get('verified') if isinstance(compat, dict) else '?'})")
print(f"  {len(esmodules)} esmodule(s), {len(styles)} stylesheet(s), "
      f"{len(languages)} language file(s)")
print(f"  {len(packs)} pack(s) declared, {len(on_disk)} pack dir(s) on disk")
print(f"  {len(json_files)} committed JSON file(s) parsed")
print(f"  {import_count} relative import(s) resolved across {len(js_files)} JS file(s)")
print(f"  {literal_count} systems/{SYSTEM_ID}/... reference(s) checked "
      f"in {len(checked_files)} file(s)")

for msg in warnings:
    print(f"::warning::{msg}")
for msg in errors:
    print(f"::error::{msg}")

if errors:
    print(f"\npreflight FAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1)
print(f"\npreflight OK ({len(warnings)} warning(s))")
