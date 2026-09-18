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
#
# THIS STEP USED TO BE A HARDCODED LIST OF FIVE FILES, and a hardcoded list is
# the bug one level up from the one this file's header describes. MEASURED
# 2026-09-18: tools/audit holds 12 node:test files and the list named 5, so
# SEVEN were run by nothing — count-agreement (7 tests), effective-verdict (9),
# legend-coverage (3), route-fidelity (31) and verdict-surface (18), all of them
# committed and none ever in the list, plus stale-claims (7) and
# lesson-mistake-census (17) from this round. **92 tests.** Nobody deleted them
# from the gate; the gate simply never learned they existed, which prints the
# same green a passing suite does.
#
# `platform/scripts/tools-tests.mjs` is the repo's node:test collector and it
# DISCOVERS BY RUNNER, not by directory: every test file under tools/ that
# imports `node:test` is claimed by it, and it fails if any file is claimed by
# both runners or by neither, so the next tools/<new-area>/x.test.mjs cannot be
# missed the way these seven were. wave-cycle.sh gate 4 already runs exactly
# this. Note the widened scope: this gate now covers ALL of tools/, not only
# tools/audit — which is where the one standing red below comes from.
#
# IT IS NOT WRAPPED IN `run`, AND THAT IS DELIBERATE. `run` reads the exit code
# alone, and the collector exits non-zero today on ONE standing red that is not
# this repo's audit tooling at all (`tools/mobile/deck-captions.test.mjs`, "the
# corpus has not changed since it was measured" — content/traces/ last moved at
# bf16de1). A gate that can only ever be red is a gate people stop running, and
# a gate that swallows that red with `|| true` cannot see a NEW one appear
# beside it. So this reads the runner's OWN summary line, allows exactly the one
# failure it can name, and REFUSES A LOG IT CANNOT READ — the same three rules
# wave-cycle.sh:138 learned on 2026-09-14, when a `grep FAIL|not ok` matched
# nothing against Node 24's «✖»/«ℹ fail N» and passed two gates over `ℹ fail 3`.
echo "[gate] --- audit-tests"
# The log goes OUTSIDE the worktree on purpose: `tree_hash` is `git status
# --porcelain`, so a scratch file written under $REPO would make the gate refuse
# its own run as "the tree CHANGED while the gate ran".
TOOLS_LOG="$(mktemp)"
node platform/scripts/tools-tests.mjs > "$TOOLS_LOG" 2>&1 || true
TSUM="$(tr -d '\r' < "$TOOLS_LOG" | sed -n 's/^ℹ fail \([0-9][0-9]*\)$/\1/p')"
if [ -z "$TSUM" ]; then
  tail -20 "$TOOLS_LOG"
  echo "[gate] audit-tests FAILED — tools-tests printed no «ℹ fail N» summary."
  echo "[gate] An UNREADABLE result is not a green one."
  FAIL=1
else
  TFAIL=0; for n in $TSUM; do TFAIL=$((TFAIL + n)); done
  # The standing red is NAMED, not just counted, so a new failure cannot hide
  # behind the allowance on a day the named one happens to pass.
  TFREEZE="$(tr -d '\r' < "$TOOLS_LOG" | grep -cE "^[[:space:]]*✖ the corpus has not changed since it was measured" || true)"
  [ "$TFREEZE" -gt 1 ] && TFREEZE=1
  echo "[gate] audit-tests: $TFAIL failing (standing: deck-captions corpus freeze ×$TFREEZE)"
  if [ "$TFAIL" -gt "$TFREEZE" ]; then
    tr -d '\r' < "$TOOLS_LOG" | grep -E "^[[:space:]]*✖ " | sort -u | head -20
    echo "[gate] audit-tests FAILED — $((TFAIL - TFREEZE)) failure(s) are NEW."
    FAIL=1
  else
    echo "[gate] audit-tests ok"
  fi
fi
rm -f "$TOOLS_LOG"

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
