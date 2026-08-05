#!/usr/bin/env python3
"""A deploy must not reuse the previous commit's `system.json` version.

WHY THIS EXISTS
---------------
Written 2026-08-05, the day it happened. Two different trees deployed to the live server under the
SAME version, `7.5.63`:

  9eca8bf  fix(sheet): the eye's BODY heading was still English   -> bumped 7.5.62 to 7.5.63
  8477852  feat(sheet v3): merge Bio into Personaje, ...          -> still said 7.5.63

The second was mine. I bumped with `sed 's/7.5.62/7.5.63/'` against a tree that had already moved to
7.5.63, so the substitution matched nothing and changed nothing — silently, because `sed` reports
success when it replaces zero occurrences. Every gate passed, the deploy verified "the running
Foundry has loaded worldofdarkness 7.5.63", and it was true both times.

The existing preflight validates the version's SHAPE (`X.Y.Z`) and never that it CHANGED, which is
recorded in CLAUDE.md as "still manual and still required". "Manual and required" with no check is
just "required until someone is tired", and the failure is quiet in the worst way: the version is
what a GM reads to know whether a fix reached them, and what any future rollback would name.

WHAT IT CHECKS
--------------
If this commit touches anything that ships to the Foundry server, `system.json`'s version must
differ from the previous commit's.

Docs-only and CI-only commits are exempt, because bumping for them would make the version meaningless
in the other direction — a number that changes when nothing a player can see does.

Needs two commits of history: the workflow must check out with `fetch-depth: 2`. If the parent is
unreachable this exits 2 (a configuration error) rather than passing — a gate that cannot see its
input must not report OK.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Path prefixes whose contents are rsynced to the live server, i.e. anything a player could notice.
DEPLOYABLE = ("module/", "templates/", "css/", "lang/", "assets/", "packs/", "system.json",
              "template.json", "fonts/", "lib/", "ui/")

#: Never worth a version bump on their own.
EXEMPT = (".github/", "docs/", "README", ".gitignore", ".editorconfig", "CLAUDE.md")


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args],
                          capture_output=True, text=True, check=True).stdout.strip()


def version_at(ref: str) -> str | None:
    try:
        return json.loads(git("show", f"{ref}:system.json")).get("version")
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def main() -> int:
    try:
        git("rev-parse", "HEAD~1")
    except subprocess.CalledProcessError:
        print("version-bump-check: cannot reach HEAD~1. The workflow must check out with "
              "`fetch-depth: 2` — refusing to pass without the history this needs.",
              file=sys.stderr)
        return 2

    try:
        changed = [f for f in git("diff", "--name-only", "HEAD~1", "HEAD").splitlines() if f]
    except subprocess.CalledProcessError as e:
        print(f"version-bump-check: git diff failed: {e}", file=sys.stderr)
        return 2

    if not changed:
        print("version bump check OK: this commit changes no files")
        return 0

    shipped = [f for f in changed
               if f.startswith(DEPLOYABLE) and not f.startswith(EXEMPT)]

    if not shipped:
        print(f"version bump check OK: {len(changed)} file(s) changed, none of them deployable "
              f"— no bump required")
        return 0

    now, before = version_at("HEAD"), version_at("HEAD~1")

    if now is None:
        print("version-bump-check: system.json at HEAD has no readable version", file=sys.stderr)
        return 2

    if before is None:
        print(f"version bump check OK: no previous system.json to compare against (version {now})")
        return 0

    if now == before:
        print(f"version bump check FAILED: system.json is still {now}, unchanged from HEAD~1, but "
              f"this commit ships {len(shipped)} file(s) to the live server.", file=sys.stderr)
        for f in shipped[:12]:
            print(f"    {f}", file=sys.stderr)
        if len(shipped) > 12:
            print(f"    … and {len(shipped) - 12} more", file=sys.stderr)
        print("\n  Two trees deployed under one version is how 7.5.63 shipped twice on 2026-08-05: a\n"
              "  `sed` bump matched nothing because the tree had already moved, and sed exits 0 when\n"
              "  it replaces zero occurrences. Set the version explicitly rather than substituting a\n"
              "  value you assume is there.", file=sys.stderr)
        return 1

    print(f"version bump check OK: {before} -> {now}, with {len(shipped)} deployable file(s) changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
