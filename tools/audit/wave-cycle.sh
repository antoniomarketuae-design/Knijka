#!/usr/bin/env bash
#
# THE WAVE CYCLE, AS ONE COMMAND PER STEP.
#
# WHY THIS FILE EXISTS. The repair programme is a loop — repair wave, integrate,
# gate, commit, push both remotes, re-sweep, adjudicate, post, snapshot, next
# wave — and it has been driven by hand every time. Six waves in, the founder's
# complaint is precise and correct: "we try but we never achieve this." The loop
# does not fail on the hard parts. It fails between them, on a step somebody has
# to remember: the .env commit stamp that makes every drive exit
# EXIT_TARGET_UNVERIFIED when it is stale, the second remote, the snapshot that
# is the only copy of a ledger living on one HDD.
#
# So every mechanical step is here, in order, each refusing to run if the step
# before it did not really happen.
#
# WHAT THIS FILE CANNOT DO, STATED PLAINLY SO NOBODY PLANS AROUND A LIE:
# it cannot spawn the repair lanes or the judges. Those need the model. A shell
# script can drive the browser, the gates, git and the counters; it cannot read
# a photograph of a debrief and decide whether a seventeen-year-old was taught
# something false. The division is: EVERYTHING EXCEPT JUDGEMENT IS IN HERE.
#
# USAGE
#   tools/audit/wave-cycle.sh gate                 the four gates, standing reds named
#   tools/audit/wave-cycle.sh commit <msgfile>     gate, commit, push BOTH remotes, restamp .env
#   tools/audit/wave-cycle.sh preflight            invariant-2 preflight (server, db, commit match)
#   tools/audit/wave-cycle.sh sweep <round> <lessonsfile> [shards]
#   tools/audit/wave-cycle.sh merge <round>        merge shard results into the round
#   tools/audit/wave-cycle.sh post                 coverage, agreement, --apply, snapshot
#   tools/audit/wave-cycle.sh status               where the loop currently stands
#
set -u
REPO="E:/AI driver"
cd "$REPO" || exit 1
STEP="${1:-status}"

say()  { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo ""; echo "STOPPED: $*"; echo ""; exit 1; }

# ── THE THREE STANDING REDS ────────────────────────────────────────────────
# These are known, they are founder-blocked, and they must never be silently
# tolerated by a script that also has to catch a NEW red. Named here so the gate
# can subtract exactly these and shout about anything else.
#   . vitest  t-accidents content-bank  — 29 first-aid questions sit at
#     needs-review because every one cited ЗДвП чл. 123 and чл. 123 contains no
#     compression depth, rate, breathing check or ratio. The citation was
#     decorative. Signing them is the founder's, not an engineer's.
#   . vitest  l-accidents-first-aid compose — same 29 questions, same block.
#   . tools-tests  deck-captions freeze — the caption corpus is frozen against a
#     reviewed snapshot; it re-reds whenever a caption legitimately changes and
#     is re-frozen deliberately, not automatically.
STANDING_REDS=3

gate() {
  local rc=0
  say "gate 1/4 — tsc (FROM platform/; from the repo root npx resolves a DIFFERENT package"
  say "         and exits 1 with zero 'error TS' lines, which reads as a red that is not one)"
  ( cd "$REPO/platform" && npx tsc --noEmit ) > /tmp/wc-tsc.log 2>&1 || rc=1
  local ts; ts=$(grep -c "error TS" /tmp/wc-tsc.log || true)
  say "         error TS lines: $ts"
  [ "$ts" -eq 0 ] || { sed -n '1,40p' /tmp/wc-tsc.log; fail "tsc is red ($ts errors)"; }

  say "gate 2/4 — vitest (maxWorkers=2; the suite is ~16,400 tests and the box is a 16 GB HDD)"
  ( cd "$REPO/platform" && npx vitest run --maxWorkers=2 ) > /tmp/wc-vitest.log 2>&1 || true
  # sed, NOT grep -oP. This box's grep refuses -P ("supports only unibyte and
  # UTF-8 locales") and every -P extraction silently returned EMPTY — which turns
  # a failure count into 0 and would declare a red suite green. That is the
  # reassuring direction, which is where every instrument bug on this programme
  # has pointed.
  local vfail; vfail=$(sed -n 's/.*Tests  *\([0-9][0-9]*\) failed.*/\1/p' /tmp/wc-vitest.log | head -1)
  vfail="${vfail:-0}"
  local vpass; vpass=$(sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p' /tmp/wc-vitest.log | tail -1)
  say "         failed: $vfail   passed: ${vpass:-?}"
  if [ "$vfail" -gt 2 ]; then
    grep -E "FAIL|✗|×" /tmp/wc-vitest.log | head -30
    fail "vitest has $vfail failures; 2 are the founder-blocked first-aid reds, so $((vfail - 2)) are NEW"
  fi

  say "gate 3/4 — content validation"
  node platform/scripts/validate-content.mjs > /tmp/wc-content.log 2>&1 || { tail -30 /tmp/wc-content.log; fail "content validation is red"; }
  say "         green"

  say "gate 4/4 — tools tests (NOT a substitute for gate 2: a seatbelt fix once passed"
  say "         tsc + tools-tests and broke a vitest file that reads lesson-audit.mjs off disk)"
  node platform/scripts/tools-tests.mjs > /tmp/wc-tools.log 2>&1 || true
  local tfail; tfail=$(grep -ciE "^\s*(FAIL|not ok)" /tmp/wc-tools.log || true)
  say "         failing: $tfail   (1 expected: the deck-captions freeze)"
  if [ "$tfail" -gt 1 ]; then
    grep -iE "FAIL|not ok" /tmp/wc-tools.log | head -20
    fail "tools-tests has $tfail failures; 1 is the deck-captions freeze, so $((tfail - 1)) are NEW"
  fi

  say "GATE GREEN — the $STANDING_REDS standing reds and nothing else"
  return 0
}

stamp_env() {
  # platform/.env is GITIGNORED, so writing it moves NO worktree hash and breaks
  # no drive certification. It must carry the CURRENT commit or /api/health
  # reports "commit":"unknown" and every drive exits EXIT_TARGET_UNVERIFIED —
  # a whole sweep lost to one stale line.
  local sha; sha=$(git rev-parse HEAD)
  local f="$REPO/platform/.env"
  [ -f "$f" ] || fail "platform/.env is missing; a sweep cannot certify without it"
  # The value is QUOTED in .env and must stay quoted — the health route reads it
  # through Next's env loader, which strips the quotes; writing it bare works
  # today and is a difference nobody would notice until it did not.
  if grep -q "^NEXT_PUBLIC_COMMIT_SHA=" "$f"; then
    sed -i "s|^NEXT_PUBLIC_COMMIT_SHA=.*|NEXT_PUBLIC_COMMIT_SHA=\"$sha\"|" "$f"
  else
    printf '\nNEXT_PUBLIC_COMMIT_SHA="%s"\n' "$sha" >> "$f"
  fi
  grep -q "$sha" "$f" || fail "the .env stamp did not take; a sweep now would exit EXIT_TARGET_UNVERIFIED on every drive"
  say "stamped platform/.env with ${sha:0:12} (gitignored — no worktree hash moved)"
  say "NOTE: the dev server must be RESTARTED to pick this up, or health still attests the old commit"
}

push_both() {
  # Two remotes, two keys. origin is GitHub over the founder's default key; vps
  # is flokinet and needs its own. Exporting GIT_SSH_COMMAND globally makes
  # origin exit 128 and a verifier then reports every ref MISSING — which has
  # happened, and cost an hour of believing the backup was gone.
  say "push origin"
  env -u GIT_SSH_COMMAND git push origin "$(git rev-parse --abbrev-ref HEAD)" 2>&1 | tail -2
  say "push vps"
  GIT_SSH_COMMAND="ssh -i /c/Users/Ljh/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes" \
    git push vps "$(git rev-parse --abbrev-ref HEAD)" 2>&1 | tail -2
  local local_sha; local_sha=$(git rev-parse HEAD)
  local o v
  o=$(env -u GIT_SSH_COMMAND git ls-remote origin "$(git rev-parse --abbrev-ref HEAD)" | cut -f1)
  v=$(GIT_SSH_COMMAND="ssh -i /c/Users/Ljh/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes" \
      git ls-remote vps "$(git rev-parse --abbrev-ref HEAD)" | cut -f1)
  say "verify  local ${local_sha:0:12}  origin ${o:0:12}  vps ${v:0:12}"
  [ "$o" = "$local_sha" ] || fail "origin did not take the commit"
  [ "$v" = "$local_sha" ] || fail "vps did not take the commit"
  say "BOTH REMOTES HOLD ${local_sha:0:12}"
}

case "$STEP" in

gate) gate ;;

commit)
  MSG="${2:-}"
  [ -n "$MSG" ] && [ -f "$MSG" ] || fail "usage: wave-cycle.sh commit <path-to-message-file>"
  [ "$(git status --porcelain | wc -l)" -gt 0 ] || fail "nothing to commit"
  gate || exit 1
  git add -A
  git commit -q -F "$MSG" || fail "commit refused (a hook? do not skip it — fix it)"
  say "committed $(git rev-parse --short HEAD)"
  push_both
  stamp_env
  bash "$REPO/tools/audit/snapshot-ledger.sh" 2>&1 | tail -4
  ;;

preflight)
  bash "$REPO/.audit-frames/wave-scripts/sweep-preflight.sh"
  ;;

sweep)
  ROUND="${2:-}"; LESSONS="${3:-}"; SHARDS="${4:-2}"
  [ -n "$ROUND" ] && [ -f "${LESSONS:-/nonexistent}" ] || fail "usage: wave-cycle.sh sweep <round> <lessonsfile> [shards]"
  bash "$REPO/.audit-frames/wave-scripts/sweep-preflight.sh" || fail "preflight refused; a sweep dispatched now photographs the paywall"
  # TWO DRIVERS ON ONE SERVER, NEVER TWO SERVERS. Two dev servers on one box
  # contend for the same 7200 rpm disk and the same Turbopack cache and both
  # crawl; the drives then time out and the corpus fills with unsteered legs.
  local_total=$(wc -l < "$LESSONS")
  say "sweep $ROUND: $local_total lessons over $SHARDS shard(s), one server"
  mkdir -p "$REPO/.audit-frames/$ROUND"
  split -n "l/$SHARDS" -d "$LESSONS" "$REPO/.audit-frames/$ROUND/shard-"
  for f in "$REPO/.audit-frames/$ROUND/shard-"*; do
    s=$(basename "$f" | sed 's/shard-//')
    say "  dispatching shard $s ($(wc -l < "$f") lessons) under the supervisor"
    bash "$REPO/tools/mobile/drive-supervisor.sh" "$ROUND-$s" "$f" &
  done
  wait
  say "all shards exited; run: wave-cycle.sh merge $ROUND"
  ;;

merge)
  ROUND="${2:-}"
  [ -n "$ROUND" ] || fail "usage: wave-cycle.sh merge <round>"
  for d in "$REPO/.audit-frames/fill-$ROUND-"*; do
    [ -d "$d" ] || continue
    say "merging $(basename "$d")"
    node "$REPO/tools/audit/wave-c-merge.mjs" --from "$d" --to "$REPO/.audit-frames/$ROUND" 2>&1 | sed 's/^/    /'
  done
  ;;

post)
  say "1/4 verdict coverage"
  node "$REPO/tools/audit/verdict-coverage.mjs" 2>&1 | tail -14
  say "2/4 count agreement (nine tools must report ONE open list)"
  node "$REPO/tools/audit/count-agreement.mjs" 2>&1 | tail -3 | grep -q "AGREED" \
    || fail "the counters disagree; do not apply anything until they do"
  say "3/4 wave-c-post --apply"
  cp "$REPO/.audit-frames/wave-c/closures.jsonl" "$REPO/.audit-frames/wave-c/closures.jsonl.bak" 2>/dev/null
  node "$REPO/tools/audit/wave-c-post.mjs" --apply 2>&1 | tail -14
  say "4/4 snapshot the ledger (it is gitignored ON PURPOSE and lives on one HDD)"
  bash "$REPO/tools/audit/snapshot-ledger.sh" 2>&1 | tail -4
  ;;

status)
  echo "=== WHERE THE LOOP STANDS ==="
  echo "  branch  : $(git rev-parse --abbrev-ref HEAD)"
  echo "  HEAD    : $(git log --oneline -1)"
  echo "  dirty   : $(git status --porcelain | wc -l) file(s)"
  o=$(env -u GIT_SSH_COMMAND git ls-remote origin "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null | cut -f1)
  echo "  origin  : ${o:0:12}$([ "$o" = "$(git rev-parse HEAD)" ] && echo "  (in sync)" || echo "  <-- BEHIND")"
  # The stamp is quoted in .env; strip the quotes before comparing or this line
  # reports a mismatch on a file that is perfectly correct.
  envsha=$(grep '^NEXT_PUBLIC_COMMIT_SHA=' platform/.env 2>/dev/null | cut -d= -f2 | tr -d '"')
  echo "  .env sha: ${envsha:0:12}$([ "$envsha" = "$(git rev-parse HEAD)" ] && echo "  (matches HEAD)" || echo "  <-- STALE: every drive would exit EXIT_TARGET_UNVERIFIED")"
  echo ""
  # THE ONLY HONEST WAY TO REPORT THIS. Never the raw open count alone: the open
  # list is three different things (STILL, UNJUDGED, PARTIAL) and quoting it as
  # one number reads as "N defects left" when a third of it is "not measurable
  # by a single drive". Filed / closed / percent is the shape the founder asked for.
  L=$(node "$REPO/tools/audit/count-agreement.mjs" 2>&1 | grep -m1 "OPEN-LIST")
  FILED=$(echo "$L" | sed -n 's/.*filed=\([0-9][0-9]*\).*/\1/p')
  RET=$(echo "$L" | sed -n 's/.*retired=\([0-9][0-9]*\).*/\1/p')
  OPEN=$(echo "$L" | sed -n 's/.* open=\([0-9][0-9]*\).*/\1/p')
  [ -n "$FILED" ] && [ "$FILED" -gt 0 ] || fail "could not read the corpus counts; refusing to print a percentage derived from nothing"
  echo "  $FILED ever filed · $RET closed with evidence · $((RET * 100 / FILED))% done · $OPEN open"
  echo "  (the $OPEN open is three things — STILL, UNJUDGED, PARTIAL — and must never be"
  echo "   quoted as a bare defect count; run wave-c-post for the split)"
  echo ""
  echo "  verdict lines: $(wc -l < "$REPO/.audit-frames/wave-c/verdicts.jsonl")"
  echo "  closures     : $(wc -l < "$REPO/.audit-frames/wave-c/closures.jsonl")"
  ;;

*) fail "unknown step '$STEP' — see the usage block at the top of this file" ;;
esac
