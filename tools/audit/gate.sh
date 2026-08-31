#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# gate.sh — THE GATE RUNS LAST, OR IT CERTIFIES A TREE THAT NO LONGER EXISTS.
#
# WHY THIS EXISTS. On 2026-08-30 the wave-14 round ran `tsc` (clean), then fixed
# a test, then committed. The fix introduced `e.regrade` on a `RuleEvent` union
# whose commendation half has no such field — a type error that shipped, because
# the typecheck had been taken BEFORE the last edit. vitest was green and lint
# was green, so nothing else caught it; only the next round's typecheck did.
#
# The failure is not "someone forgot to re-run tsc". It is that the gate was a
# sequence of commands a human sequences by hand, and any edit made between two
# of them is unmeasured. So it is one command now, it records the tree it
# measured, and it REFUSES if the tree moves under it.
#
#   bash tools/audit/gate.sh            # run every gate, refuse on any red
#   bash tools/audit/gate.sh --quick    # tsc + vitest only (no lint/build)
#
# EXIT 0 only when every gate passed AND the tree hash is unchanged from start
# to finish. Anything else is non-zero and says which gate and which hash.
# -----------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO="$PWD"
QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

tree_hash() { { git status --porcelain; git diff HEAD; } 2>/dev/null | sha1sum | cut -c1-12; }

H0="$(tree_hash)"
echo "[gate] tree at start: $H0"
FAIL=0

run() {
  local name="$1"; shift
  echo "[gate] --- $name"
  local out
  out="$("$@" 2>&1)"
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "[gate] $name FAILED (exit $rc)"
    echo "$out" | tail -25
    FAIL=1
  else
    echo "$out" | tail -3
    echo "[gate] $name ok"
  fi
}

cd platform || exit 2
run "typecheck" npx tsc --noEmit -p tsconfig.json
run "vitest"    npx vitest run --reporter=dot
if [ $QUICK -eq 0 ]; then
  run "eslint"  npx eslint src
  run "build"   npm run build
fi
cd "$REPO" || exit 2

# The audit tooling has its own tests and its own agreement gate.
run "audit-tests"     node --test tools/audit/reclosure.test.mjs tools/audit/comment-blind.test.mjs tools/audit/build-redrive.test.mjs tools/audit/finding-reader.test.mjs
run "count-agreement" node tools/audit/count-agreement.mjs

H1="$(tree_hash)"
echo "[gate] tree at end:   $H1"
if [ "$H0" != "$H1" ]; then
  echo "[gate] REFUSED — the tree CHANGED while the gate ran ($H0 -> $H1)."
  echo "[gate] Whatever it measured is not what you are about to commit. Re-run it."
  exit 3
fi

if [ $FAIL -ne 0 ]; then
  echo "[gate] RED — at least one gate failed. Nothing may be committed on this."
  exit 1
fi
echo "[gate] GREEN — every gate passed on tree $H1"
