#!/usr/bin/env bash
# Wave 1 integration. Gate the STACK, not each patch (invariant 7 — the
# rapier-in-collision breach passed every patch individually).
set -u
cd "E:/AI driver" || exit 1
PD=".audit-frames/patches/w1"
LOG="$PD/integration.log"
: > "$LOG"
say() { echo "$*" | tee -a "$LOG"; }

say "=== preconditions ==="
say "HEAD          : $(git rev-parse --short HEAD)"
say "tree dirty    : $(git status --porcelain | wc -l) file(s)"
if [ "$(git status --porcelain | wc -l)" -ne 0 ]; then
  say "REFUSING — the tree must be clean before applying a stack of patches."
  git status --porcelain | sed 's/^/    /' | tee -a "$LOG"
  exit 1
fi

# LANES is passed in: only those whose verifier said LAND / LAND-WITH-FIXES
LANES="${LANES:?set LANES to the space-separated lane names cleared for landing}"

say ""
say "=== dry-run every patch first; a stack that cannot apply cleanly is not a stack ==="
FAIL=0
for l in $LANES; do
  p="$PD/$l.patch"
  if [ ! -s "$p" ]; then say "  $l: PATCH MISSING OR EMPTY — skipped"; FAIL=1; continue; fi
  if git apply --check --whitespace=nowarn "$p" 2>>"$LOG"; then
    say "  $l: applies clean ($(wc -l < "$p") lines)"
  else
    say "  $l: DOES NOT APPLY CLEANLY (will retry --3way at apply time)"
  fi
done

say ""
say "=== applying ==="
APPLIED=""
for l in $LANES; do
  p="$PD/$l.patch"
  [ -s "$p" ] || continue
  if git apply --whitespace=nowarn "$p" 2>>"$LOG"; then
    say "  $l: applied"
    APPLIED="$APPLIED $l"
  elif git apply --3way --whitespace=nowarn "$p" 2>>"$LOG"; then
    say "  $l: applied via --3way"
    APPLIED="$APPLIED $l"
  else
    say "  $l: FAILED TO APPLY — left out of this stack"
    FAIL=1
  fi
done
say "applied:$APPLIED"

# --3way can succeed and still leave conflict markers in the file. A patch that
# "applied" and left <<<<<<< in a .tsx is worse than one that refused: tsc may
# even swallow it inside a string or comment.
say ""
say "=== conflict markers left by any --3way apply ==="
MARKED=$(git diff --name-only | while read -r f; do
  [ -f "$f" ] || continue
  if grep -qE '^(<<<<<<< |=======$|>>>>>>> )' "$f" 2>/dev/null; then echo "$f"; fi
done)
if [ -n "$MARKED" ]; then
  say "  CONFLICT MARKERS PRESENT — do NOT commit:"
  printf '%s\n' "$MARKED" | sed 's/^/    /' | tee -a "$LOG"
  FAIL=1
else
  say "  none"
fi

# Invariant 5 — line endings. Measured 2026-08-23: the main tree here is CRLF
# (1400/1400 lines in CameraRig.tsx) while agent patches carried LF-only context,
# which is why two of five patches refused a straight apply and needed --3way.
say ""
say "=== line endings: match each file to what git already STORES for it ==="
# MEASURED 2026-08-23, and it is the opposite of what the handoff says:
# core.autocrlf=false here and git stores .tsx blobs as CRLF (CameraRig.tsx is
# 1400/1400 CR lines IN THE BLOB). A blanket `sed 's/\r$//'` would rewrite every
# line of every touched file as a spurious diff and break the byte-exact gates.
# .gitattributes forces eol=lf for exactly four globs (*.trace.json,
# *.generated.ts, content/world/*.json, platform/public/world/*.json).
# So: restore whatever convention the file's own committed blob uses, which
# fixes the mixed endings a LF-only patch hunk leaves inside a CRLF file.
node - "$PD" <<'NODE' | tee -a "$LOG"
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const REPO = "E:/AI driver";
const touched = execFileSync("git", ["diff", "--name-only"], { cwd: REPO, encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
let fixed = 0;
for (const f of touched) {
  const p = REPO + "/" + f;
  if (!fs.existsSync(p)) continue;
  let blob;
  try { blob = execFileSync("git", ["show", "HEAD:" + f], { cwd: REPO, encoding: "buffer", maxBuffer: 1 << 28 }); }
  catch { continue; } // new file: leave the author's endings alone
  const blobCRLF = blob.includes(Buffer.from("\r\n"));
  const cur = fs.readFileSync(p, "utf8");
  const want = blobCRLF ? cur.replace(/\r?\n/g, "\r\n") : cur.replace(/\r\n/g, "\n");
  if (want !== cur) { fs.writeFileSync(p, want); fixed++; console.log("  renormalised to " + (blobCRLF ? "CRLF" : "LF") + ": " + f); }
}
console.log("  touched " + touched.length + " file(s), renormalised " + fixed);
NODE
git diff --name-only | sed 's/^/    /' | tee -a "$LOG"

say ""
say "=== GATE 1/4 — tsc (never piped; the exit code is the answer) ==="
# MUST run from platform/. TypeScript is installed there, not at the repo root,
# and `npx tsc` from the root downloads the unrelated `tsc` package — which
# prints "This is not the tsc command you are looking for" and exits 1 with ZERO
# "error TS" lines. A gate that fails for the wrong reason, and whose output
# reads like a clean run if you only count error lines. Same trap as `npx prisma`.
(cd "E:/AI driver/platform" && npx tsc --noEmit) > "$PD/tsc.txt" 2>&1
TSC=$?
grep -q "not the tsc command" "$PD/tsc.txt" && { say "  WRONG TSC RESOLVED — the gate did not actually run"; TSC=99; }
say "  tsc exit: $TSC   ($(grep -c 'error TS' "$PD/tsc.txt" 2>/dev/null) error line(s))"
[ $TSC -ne 0 ] && head -25 "$PD/tsc.txt" | sed 's/^/    /' | tee -a "$LOG"

say ""
say "=== GATE 2/4 — validate-content ==="
node platform/scripts/validate-content.mjs > "$PD/content.txt" 2>&1
VC=$?
say "  validate-content exit: $VC"
[ $VC -ne 0 ] && tail -20 "$PD/content.txt" | sed 's/^/    /' | tee -a "$LOG"

say ""
say "=== GATE 3/4 — tools tests ==="
node platform/scripts/tools-tests.mjs > "$PD/tools.txt" 2>&1
TT=$?
say "  tools-tests exit: $TT   $(tail -3 "$PD/tools.txt" | tr '\n' ' ')"

say ""
say "=== GATE 4/4 — vitest (baseline at HEAD: 15,960 pass / 2 fail / 171 skip) ==="
say "    the 2 standing reds are t-accidents + l-accidents-first-aid content — BLOCKED ON FOUNDER, not on us"
(cd "E:/AI driver/platform" && npx vitest run --maxWorkers=2) > "$PD/vitest.txt" 2>&1
VT=$?
say "  vitest exit: $VT"
grep -E "Tests +[0-9]|Test Files +[0-9]" "$PD/vitest.txt" | tail -4 | sed 's/^/    /' | tee -a "$LOG"

say ""
say "=== VERDICT ==="
if [ $TSC -eq 0 ] && [ $VC -eq 0 ] && [ $TT -eq 0 ]; then
  say "  tsc/content/tools all green. Check the vitest delta above against the baseline before committing."
else
  say "  A GATE IS RED. Do not commit. Read $PD/{tsc,content,tools,vitest}.txt"
fi
say "  patch-apply failures: $FAIL"
