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
#   bash tools/audit/gate.sh --quick    # tsc + vitest + content (no lint/build)
#
# EXIT 0 only when every gate passed AND git could describe the tree at BOTH
# ends AND that description is unchanged from start to finish. Anything else is
# non-zero and says which gate and which hash.
# -----------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO="$PWD"
QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

# ── THE TREE HASH HAD TO FAIL CLOSED, AND IT COULD NOT FAIL AT ALL ───────────
# It was one line:
#
#   tree_hash() { { git status --porcelain; git diff HEAD; } 2>/dev/null | sha1sum | cut -c1-12; }
#
# No exit status was read from either git, and `2>/dev/null` threw away the only
# evidence that one had failed. A git that cannot answer prints nothing, sha1sum
# hashes the empty stream, and the function returns the SHA-1 of nothing — so
# H0 == H1 and this file's headline promise holds no matter what happened.
#
# MEASURED 2026-09-19 on this box, running that exact old body:
#     printf '' | sha1sum                       -> da39a3ee5e6b4b0d3255bfef9560…
#     GIT_DIR=/nonexistent-xyz  old_tree_hash   -> da39a3ee5e6b
#     cd "$TEMP/notarepo-xyz" ; old_tree_hash   -> da39a3ee5e6b
#     this worktree, dirty                      -> f6cc471b0f05 *
# (* the only line there that is not a constant — it is a hash OF the tree, so
# re-running it after any edit gives a different 12 hex digits; what reproduces
# is that it is not da39a3ee5e6b.)
# And the sting is the fourth line of that experiment: a CLEAN worktree hashes
# to **da39a3ee5e6b** too, because a clean tree legitimately prints nothing
# either. The value a broken git returns is not a suspicious constant a reader
# would notice — it is the ordinary healthy one.
#
# THAT IS THE THIRD GUARD-OF-THIS-CLASS IN THIS REPO. wave-cycle.sh:138 grepped
# `FAIL|not ok` against a Node 24 runner that prints «✖»/«ℹ fail N» and waved
# `ℹ fail 3` through two gates; the paywall guard grepped `"ok":true` over
# NESTED health JSON and matched `migrations.ok` while the database was timing
# out. Same shape every time: the check's happy path and its no-evidence path
# produce the same output, so the absence of evidence reads as evidence.
#
# SO EVERY GIT CALL BELOW IS STATUS-CHECKED, its stderr is kept and printed on
# refusal instead of discarded, and the hashed input can never legitimately be
# empty — `git rev-parse HEAD` and the index listing are both non-empty in any
# working repo, which is what removes the clean-tree ambiguity above.
#
# AND IT DEFEATS THE STAT CACHE, which the old body did not. `git status` and
# `git diff` decide whether to look at a file from the index's cached stat data,
# so a content change that preserves BOTH size and mtime is invisible to them.
# MEASURED 2026-09-19 in a scratch repo (commit "AAAA\n", overwrite with
# "BBBB\n", `touch -d` the old mtime back): `git status --porcelain` printed
# nothing, `git diff HEAD` produced 0 lines, and so did `git diff HEAD --stat`,
# `git diff-files --raw`, `git update-index -q --refresh` and even
# `--really-refresh` — the two remedies that were suggested for this both fail.
# What works is to re-hash the worktree through a THROWAWAY index: read-tree
# HEAD into a temp index outside the repo, `git add -A` against it, and hash the
# resulting listing. Driving the function below over that same scratch repo:
#     clean (AAAA)                  NEW 6be68f83ae4f   OLD da39a3ee5e6b
#     hidden edit (BBBB)            NEW d1396013ff63   OLD da39a3ee5e6b
#     restored  (AAAA)              NEW 6be68f83ae4f   OLD da39a3ee5e6b
# — three different worktrees, one old answer, and that one answer is the same
# constant the broken-git rows above return. Meanwhile `git status --porcelain`
# in that worktree printed nothing at every step, which is also the proof that
# nothing was staged: the real index is never opened for writing.
#
# WHAT IT COSTS, because this is not free. MEASURED 2026-09-19 on this 7200 rpm
# HDD, the read-tree/add/ls-files trio over this repo: **warm 5-7 s per call**,
# measured repeatedly by three observers (5,973 / 5,342 / 6,762 / 4,981 ms).
# THE COLD FIGURE IS A RANGE, NOT A CONSTANT, and the first draft of this note
# stated one as if it were fixed: the same three observers measured 84,957 ms,
# 13,828 ms and 4,928 ms on this box, a 17x spread, because it is page-cache
# dependent and this is a 7200 rpm HDD shared with whatever else is running.
# Quote the band, never a single cold number. The old status+diff pair it
# replaces costs 271 ms (re-measured 262 / 268 / 348), so this IS the expensive
# part of the trade — but it runs twice against a vitest step that alone takes
# ~38 min, and the third observer's two real calls came to 11.7 s together. It
# is the one thing in this file that makes the other 38 minutes mean anything:
# a hash that fails open certifies a tree nobody measured, which is exactly the
# defect the function below was rewritten to close. `git add -A` writes a loose blob per changed file into
# .git/objects, as any `git add` does — verified: one new object appeared for
# one new unstaged file, and `git fsck --unreachable` lists them, so `git gc`
# prunes them. The real index and the real staging area are untouched.
#
# IT SETS TWO GLOBALS AND RETURNS A STATUS; IT DOES NOT PRINT THE HASH. That is
# deliberate and it is the second half of failing closed: `H0="$(tree_hash)"`
# runs the function in a SUBSHELL, so the diagnosis it wrote to TH_ERR would die
# with that subshell and the refusal below would print an empty reason — the
# exact "a step that says nothing looks like a step that had nothing to say"
# shape this whole note is about. (Caught by running it: the first draft of this
# fix refused correctly and named nothing.)
TREE_HASH=""
TH_ERR=""
tree_hash() {
  local head status diff files idx err
  TREE_HASH=""; TH_ERR=""
  err="$(mktemp)" || { TH_ERR="mktemp refused to make a stderr file"; return 1; }
  idx="$(mktemp)" || { rm -f "$err"; TH_ERR="mktemp refused to make an index file"; return 1; }
  # The temp index must not exist yet — read-tree creates it — and both files
  # live OUTSIDE the worktree on purpose: a scratch file under $REPO would show
  # up in `git status --porcelain` and make the gate refuse its own run.
  rm -f "$idx"

  head="$(git rev-parse HEAD 2>"$err")" ||
    { TH_ERR="git rev-parse HEAD failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  status="$(git status --porcelain 2>"$err")" ||
    { TH_ERR="git status --porcelain failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  diff="$(git diff HEAD 2>"$err")" ||
    { TH_ERR="git diff HEAD failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  GIT_INDEX_FILE="$idx" git read-tree HEAD 2>"$err" ||
    { TH_ERR="git read-tree into the throwaway index failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  GIT_INDEX_FILE="$idx" git add -A 2>"$err" ||
    { TH_ERR="git add -A against the throwaway index failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  files="$(GIT_INDEX_FILE="$idx" git ls-files -s 2>"$err")" ||
    { TH_ERR="git ls-files -s on the throwaway index failed: $(tail -1 "$err")"; rm -f "$err" "$idx"; return 1; }
  rm -f "$err" "$idx"

  # Belt and braces for the failure this whole note is about: even if some
  # future git exits 0 having said nothing, an empty answer is not a hash.
  [ -n "$head" ] && [ -n "$files" ] ||
    { TH_ERR="git exited 0 but described nothing (HEAD='$head', index listing ${#files} bytes)"; return 1; }

  TREE_HASH="$(printf '%s\n%s\n%s\n%s\n' "$head" "$status" "$diff" "$files" | sha1sum | cut -c1-12)" ||
    { TH_ERR="sha1sum/cut failed on git's answer"; TREE_HASH=""; return 1; }
  [ -n "$TREE_HASH" ] || { TH_ERR="sha1sum produced no digest"; return 1; }
}

if ! tree_hash || [ -z "$TREE_HASH" ]; then
  echo "[gate] REFUSED — could not describe the tree at the START: ${TH_ERR:-no reason recorded}"
  echo "[gate] A gate that cannot see the tree must not be able to certify one."
  exit 2
fi
H0="$TREE_HASH"
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
# ONE WORKER, AND THAT IS A CORRECTNESS SETTING, NOT A SPEED ONE.
#
# This line was `npx vitest run --reporter=dot` with no worker count, so it ran
# at vitest's default fan-out and the gate's reds stopped being evidence. The
# tests that starve are the SOURCE SCANNERS — the ones that readFileSync a
# product file and assert on its text — because workers seek against each other
# on a 7200 rpm disk while each re-reads ~960 files. The measurement is not
# mine — it is wave-cycle.sh's «ONE WORKER, NOT TWO — 2026-09-14» note (line 89
# today; `grep -n "ONE WORKER, NOT TWO" tools/audit/wave-cycle.sh` 2026-09-19),
# which is also the place to argue with it: world-edge-warning
# 348 ms alone -> 263,205 ms inside a 2-worker gate (756x), no-spoiler-captions
# 1,678 ms -> 358,637 ms (214x). Five false reds came out of that, one round
# each to chase. At ONE worker: 1,116 files, 17,846 passed, ZERO failures,
# 38 min — against ~15 min and five reds at two.
#
# So this step is slower on purpose. A gate that refuses every commit teaches
# its reader to argue past it, which is how a real red gets waved through. If
# this box is ever replaced by one with an SSD, re-measure the RATIO — a
# scanner test alone vs the same test inside the full run — never the gate's
# wall clock, which is the number that made two workers look defensible.
run "vitest"    npx vitest run --maxWorkers=1 --reporter=dot

# THE FOUR-PART GATE THIS PROJECT COMMITS UNDER IS tsc / vitest / CONTENT /
# tools tests — and this file ran five other things and not that one. So
# neither gate.sh nor the four-part log was the whole gate: content could go
# red in CI (.github/workflows/ci.yml, «content contract») or in wave-cycle.sh
# gate 3/4 while this script printed GREEN over it. Same shape as the
# audit-tests note below, where a hardcoded list of five files left SEVEN
# committed test files run by nothing — and a step that runs nothing prints
# exactly the green a passing one does.
#
# It is the only check that reads content/, which the app trusts blindly at
# boot, and it is cheap. MEASURED 2026-09-19, `cd platform && node
# scripts/validate-content.mjs`, exit 0 every time (1,089 questions, 16/16
# topics, 17 answer-leak scopes gated, 0 blocking):
#     first run of a session, page cache cold for content/  2,510 ms
#     seven consecutive runs after it                       226–285 ms
# The old figure here was «221 ms», which is under every one of those and was
# not reproducible at all; the number matters because it is the whole argument
# for keeping this step inside --quick. Two things about the cold half. It is
# paid on the 868 files / 100 MB under content/ coming off a 7200 rpm HDD, so
# it is page-cache dependent, not CPU: a second observer on this same box the
# same day measured 10.8 s and 12.6 s first-run, which THIS lane could not
# reproduce and is recorded as their number, not as a claim of ours. And the
# obvious guess about what evicts it is wrong — nine minutes of metadata
# traversal over node_modules/ and .next/ left it fully warm (228 ms on the
# very next run). Either way the conclusion is unchanged at any figure in that
# range: seconds, against a vitest step measured at ~38 min and a build in
# minutes. Invoked exactly as CI invokes it, from platform/, so the two cannot
# disagree.
run "content"   node scripts/validate-content.mjs
if [ $QUICK -eq 0 ]; then
  # ESLINT IS RED TODAY, AND IT IS RED ON ITS OWN — WHICH MEANS THE FULL GATE
  # CANNOT PRINT GREEN UNTIL SOMEONE TRIAGES IT. Recorded here so the next
  # reader knows the number they are looking at is INHERITED and not something
  # their branch did. MEASURED 2026-09-19, `cd platform && npx eslint src`,
  # exit 1: «✖ 231 problems (82 errors, 149 warnings)».
  #
  # SEVENTY-NINE of the 82 errors are React Compiler diagnostics that arrived
  # with eslint-plugin-react-hooks 7.1.1, pulled in by eslint-config-next
  # 16.2.10 / next 16.2.10. Counted off that same log by their message text:
  #   "Cannot access refs during render"                   33  (react-hooks/refs)
  #   "This value cannot be modified" + "Cannot modify
  #    local variables after render completes"             33  (…/immutability)
  #   "Calling setState synchronously within an effect"    13  (…/set-state-in-effect)
  # The remaining three are @typescript-eslint/no-this-alias x2 and prefer-const.
  #
  # DO NOT make this green by silencing the rules, by mass --fix, or by deleting
  # the step. Some of those 79 are likely real: a ref read during render is
  # exactly the class of defect that surfaces as a frame stutter nobody can
  # reproduce, in a cockpit that has to hold 60 fps. They are triage for a lane
  # of their own, and until that lane runs, a full `gate.sh` ending RED with
  # eslint as the ONLY failing step is the expected result, not a new finding.
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

if ! tree_hash || [ -z "$TREE_HASH" ]; then
  echo "[gate] REFUSED — could not describe the tree at the END: ${TH_ERR:-no reason recorded}"
  echo "[gate] Every gate above may have passed; none of it is certified against"
  echo "[gate] a tree nobody can read. Fix git, then re-run."
  exit 2
fi
H1="$TREE_HASH"
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
