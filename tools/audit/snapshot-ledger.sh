#!/bin/bash
# Snapshot the audit ledger to the `ledger/audit` branch and push it.
#
# WHY IT IS NOT SIMPLY TRACKED. `.gitignore:73` ignores `.audit-frames/`, and it
# has to: the drive harness stamps the MAIN worktree hash at both ends of every
# drive and refuses to certify if it moved (`treeIdentity()` in
# tools/mobile/lib/target.mjs hashes `git status --porcelain` + `git diff HEAD`).
# Track the corpus and every sweep dirties the tree against itself — 376 drives
# that certify nothing.
#
# So the ledger is committed through a TEMPORARY INDEX onto its own branch. The
# working tree is never touched, `git status` never changes, and drives running
# at the same moment still certify. Same technique used to park work mid-drive
# before the 2026-08-23 account switch.
#
# WHAT IT COVERS: the JSONL ledgers only — findings, verdicts, closures,
# reopened, results. ~7 MB of text. NOT the frames: those are hundreds of
# thousands of PNGs and they are evidence you can re-drive, whereas the ledger
# is the only record of what was JUDGED and it exists nowhere else.
#
#   bash tools/audit/snapshot-ledger.sh ["a note for the message"]
set -u
REPO="E:/AI driver"
cd "$REPO" || exit 1
NOTE="${1:-}"

STATS=$(node tools/audit/verdict-coverage.mjs 2>/dev/null | head -1)
[ -z "$STATS" ] && STATS="(counts unavailable)"

export GIT_INDEX_FILE="${TMPDIR:-/tmp}/knijka-ledger.index"
rm -f "$GIT_INDEX_FILE"
# THE LEDGER, AND THE INSTRUMENTS THAT WROTE IT.
#
# wave-scripts/ was added 2026-09-12. It is not data — it is where the
# invariants live, and the reasons behind them exist nowhere else: invariant 2
# (twelve drives at exit=0 photographing the paywall), the PostCSS deadline
# panic and how to tell it from a slow compile, port discovery from LISTENING
# rather than a typed list, the stale-cookie clearance, the one-canary rule.
# Every one of those was learned by having a sweep go wrong, and all of it sat
# in a single gitignored directory on a 7,200 rpm disk — the exact shape of the
# risk this script was written for, one level up from the ledger.
#
# A lost number can be recomputed. A lost reason cannot.
git add --force .audit-frames/findings/*.jsonl .audit-frames/wave-c/*.jsonl 2>/dev/null
git add --force .audit-frames/wave-scripts 2>/dev/null
TREE=$(git write-tree) || exit 1
PARENT=$(git rev-parse --verify -q ledger/audit || true)

MSG="audit ledger snapshot — $STATS"
[ -n "$NOTE" ] && MSG="$MSG

$NOTE"

if [ -n "$PARENT" ]; then
  C=$(echo "$MSG" | git commit-tree "$TREE" -p "$PARENT")
else
  C=$(echo "$MSG" | git commit-tree "$TREE")
fi
git branch -f ledger/audit "$C"
unset GIT_INDEX_FILE

echo "ledger/audit -> $C"
echo "$STATS"

git push -q -f origin ledger/audit 2>/dev/null && echo "pushed: origin" || echo "FAILED: origin"
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes" \
  git push -q -f vps ledger/audit 2>/dev/null && echo "pushed: vps" || echo "FAILED: vps"

# The working tree must be exactly as it was — a snapshot that dirties the tree
# would void any drive in flight, which is the whole thing this avoids.
echo "working tree changes: $(git status --porcelain | wc -l | tr -d ' ')"
