#!/usr/bin/env bash
# Parse every committed .js file in this tree and fail if any of them is not
# valid JavaScript. Offline, no dependencies beyond node; runnable by hand:
#
#     bash .github/scripts/js-syntax-check.sh
#
# WHY: the whole system is plain ES modules that Foundry loads at startup. One
# stray syntax error in module/**/*.js aborts the module graph, i.e. it does not
# break one feature -- it breaks every sheet in every world on the server. There
# is no build step and no test suite to notice, and until 2026-07-30 the deploy
# had no gate at all.
#
# A parse is deliberately ALL this does. No lint rules, no style opinions,
# nothing that could fail on the tree as it stands today (103 files, all
# passing, measured 2026-07-30). A formatter or linter added here would fail on
# pre-existing style and the gate would be switched off within a day.
#
# ---------------------------------------------------------------------------
# WHY THE FILES ARE COPIED TO .mjs INSTEAD OF CHECKED IN PLACE
# ---------------------------------------------------------------------------
# `node --check some.js` DOES NOT RELIABLY REPORT SYNTAX ERRORS in this tree.
# With no package.json (this repo has none) node parses a .js file under the
# CommonJS goal, and when that fails it retries with module detection -- and that
# retry path exits 0. Measured on node v25.9.0, 2026-07-30:
#
#     printf 'export const a = 1;\nfunction broken( {\n' > e.js
#     node --check e.js   ->  exit 0      # WRONG: the file is not parseable
#     cp e.js e.mjs; node --check e.mjs
#                         ->  exit 1, "SyntaxError: Unexpected end of input"
#
# The naive `node --check "$file"` version of this gate therefore passed a
# deliberately corrupted module/config.js. Copying to an explicit extension
# pins the parse goal and removes any dependence on node's detection heuristics
# (and on the runner's node version).
#
# .mjs is tried FIRST because that is how Foundry loads these files. The .cjs
# retry accepts a classic non-module script that is only valid in sloppy mode
# (no such file exists here today); a file is accepted if it parses under either
# goal, which is exactly the question being asked.
set -uo pipefail

WORKDIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
ESM_COPY="$WORKDIR/js-syntax-check.mjs"
CJS_COPY="$WORKDIR/js-syntax-check.cjs"

if ! command -v node >/dev/null 2>&1; then
    echo "::error::node is not installed; cannot syntax-check the system's JavaScript"
    exit 1
fi

fail=0
checked=0

while IFS= read -r file; do
    checked=$((checked + 1))
    cp "$file" "$ESM_COPY"
    if esm_err=$(node --check "$ESM_COPY" 2>&1); then
        continue
    fi
    cp "$file" "$CJS_COPY"
    if cjs_err=$(node --check "$CJS_COPY" 2>&1); then
        continue
    fi
    echo "::error file=${file}::${file} is not valid JavaScript (fails to parse as both an ES module and a classic script)"
    printf '%s\n' "$esm_err" | sed "s|$ESM_COPY|$file|g; s/^/    esm: /"
    printf '%s\n' "$cjs_err" | sed "s|$CJS_COPY|$file|g; s/^/    cjs: /"
    fail=1
done < <(git ls-files '*.js')

rm -f "$ESM_COPY" "$CJS_COPY"

if [ "$checked" -eq 0 ]; then
    echo "::error::no .js files found -- git ls-files returned nothing, this is not the system tree"
    exit 1
fi

if [ "$fail" -ne 0 ]; then
    echo "js syntax check FAILED ($checked file(s) checked)"
    exit 1
fi

echo "js syntax check OK: $checked committed .js file(s) parse"
