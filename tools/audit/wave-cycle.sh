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
#   tools/audit/wave-cycle.sh stamp                restamp platform/.env at HEAD, and only that
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

# THE SERVER IS IDENTIFIED BY ITS ANSWER, NOT BY ITS PORT NUMBER — 2026-08-28.
# A hardcoded list told the preflight that 3000 belonged to another product; on
# this box it was ours, the check reported "no dev server" for hours, and a SECOND
# server got started on top of the first. Two Next servers on one 7200 rpm disk
# took /api/health from db 127 ms to a 9.7 s TIMEOUT, which reads as a dead
# database. Only a server answering in OUR shape — carrying a `commit` field,
# which is what invariant 2 needs anyway — counts. 3000 is probed last.
#
# …AND THE CANDIDATES ARE DISCOVERED TOO — restored here 2026-09-20.
#
# The line above says the port is discovered by asking. Only half of that was
# true here: identity came from the answer, but the CANDIDATES were nine numbers
# typed into this file. `.audit-frames/wave-scripts/sweep-preflight.sh:42-67`
# fixed exactly that on 2026-09-12 — Next autoPorted the dev server to 63269
# because 3000 was held by a dying process, and a nine-number loop reported "no
# server" while a healthy one answered our own health shape — and this copy never
# got the repair.
#
# MEASURED ON THIS BOX 2026-09-20, against a scratch server answering our health
# shape on 3577 (a port in neither the nine nor anything this repo starts). Both
# candidate constructions were probed with the same curl and the same `"commit"`
# token, with the early return removed so both could be enumerated at one moment:
#     nine hardcoded         ->  9 candidates probed, hits: 3000
#     nine + every LISTENING -> 41 candidates probed, hits: 3000 3000 3577
#                               (3000 twice — it is in both halves of the list;
#                                the early return below makes that free)
# `netstat … | sort -u -n | wc -l` was 31 listening ports before that scratch
# server was started. Then the same pair run so that ONLY the scratch server
# answered our shape — the probe path changed by one token, so the live Next
# server on 3000 returned HTML with no `commit` field:
#     nine hardcoded         -> returned 1, MISSED the only server there was
#     nine + every LISTENING -> found 3577
# That second pair is the failure in full: the miss is what makes the all-clear
# below a lie, and it is why the all-clear had to be rewritten with it.
#
# THE TWO MUST NOT DRIFT AGAIN. `wave-cycle.sh sweep` runs sweep-preflight.sh and
# then discovers the port a SECOND time with this function, so a divergence makes
# the sweep refuse seconds after a preflight that passed, on the same box, over
# the same server. What follows is the preflight's own method — its candidate
# order (known ports first, so a purpose-started rig still wins), its `-m 2`, its
# identity test. If you change one, change the other.
KNOWN_PORTS="3460 3461 3462 3470 3480 3500 3200 3411 3000"

# Every LISTENING TCP port on the box, deduplicated and numerically sorted.
# Empty — and silently so — if netstat is missing or refuses; `discover_port`
# still probes the nine, and the callers below are what say out loud that the
# search was then narrower than it looks.
listening_ports() {
  netstat -ano 2>/dev/null |
    sed -n 's/.*TCP[[:space:]]*[0-9.]*:\([0-9][0-9]*\)[[:space:]].*LISTENING.*/\1/p' |
    sort -u -n
}

# WHAT EACH CANDIDATE ACTUALLY DID, WRITTEN DOWN INSTEAD OF THROWN AWAY.
#
# `discover_port` is called as `$(discover_port)` — a SUBSHELL — so a variable
# it sets cannot reach the caller. A file can. One line per candidate:
#     <port> <curl-exit-code> <ours|stranger|silent>
# The census below is built from this file, so it can only ever describe probes
# that really happened.
DISCOVER_PROBE_LOG="${TMPDIR:-/tmp}/wc-discover-probe.$$"

discover_port() {
  # Decided ONCE, and in a subshell: a failed `>` redirection is reported by the
  # SHELL, before the command runs, so `2>/dev/null` on the command itself does
  # not silence it — four "No such file or directory" lines leaked out of this
  # function the first time it was run with an unwritable log path. If the log
  # cannot be opened, nothing is logged and the census says "?" rather than a
  # zero nobody measured.
  LOGGING=1
  ( : > "$DISCOVER_PROBE_LOG" ) 2>/dev/null || LOGGING=0
  for p in $KNOWN_PORTS $(listening_ports); do
    # 2 s, matching the preflight: the candidate list is now dozens long and a
    # stranger's port that accepts a connection and never replies would stall
    # every call. Probing a stranger is safe because identity comes from the
    # ANSWER — only our health shape, carrying a `commit` field, counts.
    #
    # IT IS ALSO THE LIMIT OF THIS SEARCH, AND THAT IS MEASURED, NOT ASSUMED: on
    # 2026-09-20 the dev server on 3000 had been up 110,858 s and its FIRST
    # /api/health probe returned 0 bytes at `curl -m 2` while the next three
    # answered in 377 ms / 16 ms / 242 ms. A 2 s probe cannot tell "nothing
    # listening" from "listening, still compiling", so a MISS is not evidence of
    # absence and no caller here may report it as one.
    #
    # ── AND THE EXIT CODE IS NOT THE BIT THAT TELLS THEM APART. MEASURED. ──
    # The obvious repair here is "keep curl's exit code: 7 is connection
    # refused, 28 is accepted-but-silent". On THIS box it does not discriminate
    # at all. Measured 2026-09-20 with curl 8.18.0 (x86_64-w64-mingw32), three
    # ports probed the same second with this exact command:
    #
    #   port    curl exit   netstat LISTENING   what was really there
    #   53117      28             yes           a scratch listener that accepts
    #                                           and never writes a byte
    #   53118      28             no            nothing at all
    #   3000       28             yes           the live dev server, cold
    #
    # `curl -v localhost:53118` on a port with NOTHING on it prints
    #   Trying [::1]:53118... Trying 127.0.0.1:53118...
    #   Connection timed out after 2007 milliseconds
    # — no refusal, no exit 7. Windows drops rather than rejects on loopback
    # here, so all three rows above come back 28 and the exit code separates
    # none of them. Exit 7 did not occur once in any probe run this session; the
    # only other code seen was 56 on port 445 (connection reset by a stranger's
    # service), which is a fourth case, not the missing discriminator. Anyone
    # "fixing" this back to a 7-vs-28 test will ship a distinction that is
    # always false. THE BIT THAT DOES DISCRIMINATE is already computed:
    # membership of `listening_ports`. 53117 was in it, 53118 was not.
    #
    # Third row of that table, same session, reproduced: the 3000 probe that
    # timed out at `-m 2` answered our own shape in 219 ms on the very next
    # call. A healthy server carrying the right commit was missed by this loop
    # and found by the retry, which is why nothing downstream may read a miss
    # as an absence.
    h=$(curl -s -m 2 "localhost:$p/api/health" 2>/dev/null); rc=$?
    if [ "$rc" -ne 0 ]; then
      [ "$LOGGING" = 1 ] && printf '%s %s silent\n' "$p" "$rc" >> "$DISCOVER_PROBE_LOG"
      continue
    fi
    case "$h" in
      *'"commit"'*)
        [ "$LOGGING" = 1 ] && printf '%s 0 ours\n' "$p" >> "$DISCOVER_PROBE_LOG"
        echo "$p"; return 0;;
      *)
        [ "$LOGGING" = 1 ] && printf '%s 0 stranger\n' "$p" >> "$DISCOVER_PROBE_LOG";;
    esac
  done
  return 1
}

fail() { echo ""; echo "STOPPED: $*"; echo ""; exit 1; }

# ── THE THREE STANDING REDS ────────────────────────────────────────────────
# These are known, they are founder-blocked, and they must never be silently
# tolerated by a script that also has to catch a NEW red. Named here so the gate
# can subtract exactly these and shout about anything else.
#   . [CLEARED — SIGNED 2026-09-12] vitest t-accidents content-bank and
#     l-accidents-first-aid compose. Both were red because 29 first-aid rows
#     sat at needs-review, every one citing ЗДвП чл. 123 — an article with no
#     compression depth, rate, breathing check or ratio in it. The founder
#     signed 26 of the 29 and both suites went GREEN.
#
#     THE ALLOWANCE BELOW WENT FROM 2 TO 0 WITH THEM, and that is the point of
#     writing this down rather than deleting the entry: while it stayed at 2,
#     the gate silently tolerated two NEW failures. Approving content had made
#     the gate weaker, which is the one direction a side effect must never go.
#
#     Three rows are still held back and still needs-review (q-ptp-016 and
#     q-ptp-060 — «не диша» where the threshold is «не реагира и не диша
#     нормално»; q-ptp-037 — text extended after the ruling). They do not
#     re-red these suites. If they ever do, this gate must say so out loud.
#   . tools-tests  deck-captions freeze — the caption corpus is frozen against a
#     reviewed snapshot; it re-reds whenever a caption legitimately changes and
#     is re-frozen deliberately, not automatically.
STANDING_REDS=1   # was 3 until the first-aid rows were signed

gate() {
  local rc=0
  say "gate 1/4 — tsc (FROM platform/; from the repo root npx resolves a DIFFERENT package"
  say "         and exits 1 with zero 'error TS' lines, which reads as a red that is not one)"
  ( cd "$REPO/platform" && npx tsc --noEmit ) > /tmp/wc-tsc.log 2>&1 || rc=$?
  local ts; ts=$(grep -c "error TS" /tmp/wc-tsc.log || true)
  say "         exit $rc · error TS lines: $ts"
  [ "$ts" -eq 0 ] || { sed -n '1,40p' /tmp/wc-tsc.log; fail "gate 1 (tsc) is red ($ts errors)"; }
  # …AND THE EXIT CODE, WHICH THIS ASSIGNED AND THEN NEVER READ — 2026-09-19.
  # `rc=1` was written on the line above and no branch ever looked at it, so the
  # gate's entire verdict was `grep -c "error TS"`. A compiler that DIES instead
  # of reporting — the wrong npx this very comment warns about, an OOM, a missing
  # tsconfig — prints no such line, counts as zero errors, and certifies the tree.
  # Measured this session by running the committed block with `npx` stubbed to
  # exit 1 silently: "error TS lines: 0", a 0-byte log, GATE 1 GREEN.
  # Gate 4 learned this on 2026-09-14 and refuses a log it cannot read; gates 1
  # and 2 only got half of it. A tool that could not report is not a tool that
  # found nothing.
  [ "$rc" -eq 0 ] || { sed -n '1,40p' /tmp/wc-tsc.log; fail "gate 1 (tsc) exited $rc while printing ZERO «error TS» lines ($(wc -c < /tmp/wc-tsc.log) bytes of log) — the compiler DIED instead of reporting, and an unreadable result is not a green one"; }

  # ── ONE WORKER, NOT TWO — 2026-09-14, and the reason is measured ─────────
  #
  # --maxWorkers=2 produced FIVE red tests on a tree whose only product change
  # was one pure function, and every one of them was a timeout with no
  # assertion failing. All five walk platform/src. Standalone against the same
  # tree, the same second:
  #
  #   world-edge-warning · consumer outside its own module     348 ms
  #   no-spoiler-captions · asserts before commanding motion   1,678 ms
  #
  # Inside the 2-worker gate those two took 263,205 ms and 358,637 ms — 756x
  # and 214x their own baseline. That is not a test that needs a longer clock;
  # it is two workers seeking against each other on a 7200 rpm disk while each
  # re-reads ~960 product files. Covering it with a timeout would need 600 s
  # and would hide a genuine hang behind it.
  #
  # ONE WORKER: 1,116 files, 17,846 passed, ZERO failures, 38 min. Two
  # workers: ~15 min and five false reds, i.e. a gate that refuses every
  # commit and teaches its reader to argue with it. vitest.config.ts already
  # states the principle this follows — «a false red under load is worse than
  # no red, because it teaches the next reader to skip past a real one».
  #
  # If this box is ever replaced by one with an SSD, re-measure before raising
  # it: the number that matters is the RATIO between a scanner test alone and
  # the same test inside the full run, not the wall-clock of the gate.
  say "gate 2/4 — vitest (maxWorkers=1; ~16,400 tests, 16 GB HDD — see the note above for why not 2)"
  local vrc=0
  ( cd "$REPO/platform" && npx vitest run --maxWorkers=1 ) > /tmp/wc-vitest.log 2>&1 || vrc=$?
  # sed, NOT grep -oP. This box's grep refuses -P ("supports only unibyte and
  # UTF-8 locales") and every -P extraction silently returned EMPTY — which turns
  # a failure count into 0 and would declare a red suite green. That is the
  # reassuring direction, which is where every instrument bug on this programme
  # has pointed.
  # AND THE RUNNER MUST ACTUALLY HAVE REPORTED — 2026-09-19. This step threw the
  # exit code away with `|| true`, then defaulted the count with `${vfail:-0}`, so
  # a vitest that never ran left an EMPTY log, an empty extraction, a 0, and a
  # GREEN gate. Measured this session by running the committed block with `npx`
  # stubbed: an empty log printed "failed: 0   passed: ?" and passed; an OOM log
  # ("Failed to start forks worker" + "Reached heap limit", exit 134) passed too.
  # AGENTS.md warns that exact OOM "reports it like a failure" — it did not; it
  # reported like a clean run.
  #
  # So the runner's own summary is required FIRST, and only then may the `:-0`
  # default mean anything. That default is not wrong — a genuinely green run
  # prints no «failed» segment at all (measured on the real log this box left at
  # /tmp: «Tests  18569 passed | 171 skipped (18740)») — it is only wrong when it
  # is allowed to stand in for a summary that never existed.
  tr -d '\r' < /tmp/wc-vitest.log | grep -qE "Tests +[0-9]+ (failed|passed)" \
    || { tail -20 /tmp/wc-vitest.log; fail "gate 2 (vitest) exited $vrc and printed no «Tests N failed/passed» summary ($(wc -c < /tmp/wc-vitest.log) bytes of log) — the run DIED or never started, and an unreadable result is not a green one"; }
  local vfail; vfail=$(sed -n 's/.*Tests  *\([0-9][0-9]*\) failed.*/\1/p' /tmp/wc-vitest.log | head -1)
  vfail="${vfail:-0}"
  local vpass; vpass=$(sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p' /tmp/wc-vitest.log | tail -1)
  say "         exit $vrc · failed: $vfail   passed: ${vpass:-?}"
  # 0, not 2: both first-aid reds were cleared by the 2026-09-12 signatures.
  # Leaving it at 2 would let two new failures through in silence.
  if [ "$vfail" -gt 0 ]; then
    grep -E "FAIL|✗|×" /tmp/wc-vitest.log | head -30
    fail "gate 2 (vitest) has $vfail failures, and ALL of them are new — the two founder-blocked first-aid reds were cleared by the 2026-09-12 signatures, so nothing is subtracted here any more"
  fi
  # A non-zero exit whose own summary counts zero failures means the run broke
  # OUTSIDE the test bodies — a suite that threw while being collected, an
  # unhandled rejection, a worker killed after the summary printed. None of those
  # is a passing suite, and none of them shows up in $vfail.
  [ "$vrc" -eq 0 ] || { tail -30 /tmp/wc-vitest.log; fail "gate 2 (vitest) exited $vrc while its own summary counted $vfail failures — the run broke OUTSIDE the test bodies (collection error, unhandled rejection, a killed worker). Unaccounted is not green; read the tail above"; }

  say "gate 3/4 — content validation"
  node platform/scripts/validate-content.mjs > /tmp/wc-content.log 2>&1 || { tail -30 /tmp/wc-content.log; fail "content validation is red"; }
  say "         green"

  say "gate 4/4 — tools tests (NOT a substitute for gate 2: a seatbelt fix once passed"
  say "         tsc + tools-tests and broke a vitest file that reads lesson-audit.mjs off disk)"
  node platform/scripts/tools-tests.mjs > /tmp/wc-tools.log 2>&1 || true
  # READ THE RUNNER'S OWN SUMMARY, NOT A PREFIX THE RUNNER NO LONGER PRINTS —
  # 2026-09-14. This counted lines starting `FAIL` or `not ok`. Node 24's
  # node:test spec reporter prints neither: a failure is `✖ <name>` and the run
  # ends `ℹ fail N`. So the pattern matched ZERO lines on every run, printed
  # "failing: 0 (1 expected)", and passed. Measured on the gate that certified
  # 13692e3 and af71e71: its log said `ℹ fail 3` — the deck-captions freeze
  # plus two count-agreement.test.mjs failures (route-fidelity-open.mjs and
  # stale-claims.mjs read the corpus with no recipe) that shipped through two
  # green gates. A gate that cannot find the number must not report one.
  local tsum; tsum=$(tr -d '\r' < /tmp/wc-tools.log | sed -n 's/^ℹ fail \([0-9][0-9]*\)$/\1/p')
  [ -n "$tsum" ] || { tail -20 /tmp/wc-tools.log; fail "tools-tests printed no «ℹ fail N» summary — the result is UNREADABLE, which is not green"; }
  local tfail=0 n; for n in $tsum; do tfail=$((tfail + n)); done
  # The one standing red is named, not just counted: a new failure must not be
  # able to hide behind the allowance while the freeze happens to pass.
  local tfreeze; tfreeze=$(tr -d '\r' < /tmp/wc-tools.log | grep -cE "^\s*✖ the corpus has not changed since it was measured" || true)
  [ "$tfreeze" -gt 1 ] && tfreeze=1
  say "         failing: $tfail   (standing: deck-captions freeze ×$tfreeze)"
  if [ "$tfail" -gt "$tfreeze" ]; then
    tr -d '\r' < /tmp/wc-tools.log | grep -E "^\s*✖ " | sort -u | head -20
    fail "tools-tests has $tfail failure(s); $tfreeze is the deck-captions freeze, so $((tfail - tfreeze)) are NEW"
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
  # READ BACK THE KEY'S VALUE, NOT THE FILE — 2026-09-19. This was
  # `grep -q "$sha" "$f"`, which passes on the sha appearing ANYWHERE: a rotation
  # note, an old commented-out line, another key. Measured this session on a
  # fixture .env whose first line was
  #   `# rotated 2026-09-18: NEXT_PUBLIC_COMMIT_SHA=<sha>`
  # while the live key held 0000…0000 — the old guard printed "the .env stamp
  # took" and the value Next's env loader would have handed /api/health was the
  # zeros. That is exactly the stale stamp this function exists to make
  # impossible, certified as correct, and it costs a whole sweep at
  # EXIT_TARGET_UNVERIFIED.
  # The LAST matching line is the one that counts: dotenv assigns duplicate keys
  # in order, so a later line wins, and `tr -d '"\r'` is there because the value
  # is written quoted and this tree is edited from Windows.
  local got; got=$(grep '^NEXT_PUBLIC_COMMIT_SHA=' "$f" | tail -1 | cut -d= -f2- | tr -d '"\r')
  [ "$got" = "$sha" ] || fail "the .env stamp did not take: NEXT_PUBLIC_COMMIT_SHA reads «${got:-(the key is not in the file)}» but HEAD is «$sha» — a sweep now would exit EXIT_TARGET_UNVERIFIED on every drive"
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

# THE BACKUP MUST ANNOUNCE ITSELF, AND A PIPE CANNOT SAY IT DID NOT — 2026-09-19.
#
# Both call sites were `bash snapshot-ledger.sh 2>&1 | tail -4`, and a pipeline
# returns the status of its LAST element. Measured this session: a function that
# prints one line and returns 3, piped to `tail -4`, yields status 0. So the one
# signal that says «the only copy of the ledger was NOT written» was thrown away
# at both of the two places that write it — and the thing at stake, measured this
# session, is 26 findings chunks (2,479 raw lines, 1,523 findings once the corpus
# reader has deduped them), 10,328 verdict lines and 1,428 closure lines, all
# under a gitignored directory on one 7,200 rpm disk.
#
# THE STATUS IS NECESSARY AND NOT SUFFICIENT. snapshot-ledger.sh's last statement
# is an `echo`, so it exits 0 on every path except its two early `exit 1`s (the
# cd and `git write-tree`). The proof that a snapshot actually happened is the
# `ledger/audit -> <sha>` line it prints, so that line is required too — and a
# `git commit-tree` that failed leaves the arrow with nothing after it, which is
# why the sha is matched rather than the prefix.
#
# A FAILED PUSH IS SHOUTED, NOT REFUSED. snapshot-ledger.sh:65-67 prints
# `FAILED: origin` / `FAILED: vps` and exits 0 regardless — that is its own
# behaviour and this step does not change what it accepts. But a branch on the
# same disk as the corpus is not a backup against that disk, so it is said
# loudly instead of being folded into a tail nobody reads.
snapshot_ledger() {
  local out rc=0
  out=$(bash "$REPO/tools/audit/snapshot-ledger.sh" 2>&1) || rc=$?
  printf '%s\n' "$out" | sed 's/^/    /'
  [ "$rc" -eq 0 ] || fail "snapshot-ledger.sh exited $rc — the ledger was NOT snapshotted, and .audit-frames/ is gitignored, so it exists in ONE place on one HDD"
  # tr -d '\r' for the same reason gates 2 and 4 do it: a stray CR before the
  # line end would make `$` miss and turn a written snapshot into a refusal.
  printf '%s\n' "$out" | tr -d '\r' | grep -qE "^ledger/audit -> [0-9a-f]{40}$" \
    || fail "snapshot-ledger.sh exited 0 but printed no «ledger/audit -> <40-hex>» line — no snapshot commit was written, and an unreadable result is not a written one"
  if printf '%s\n' "$out" | grep -q "^FAILED: "; then
    echo ""
    echo "  !! THE SNAPSHOT IS LOCAL ONLY — $(printf '%s\n' "$out" | grep '^FAILED: ' | tr '\n' ' ')"
    echo "  !! ledger/audit now sits on the SAME disk as .audit-frames/. Re-push before trusting it as a backup."
    echo ""
  fi
}

case "$STEP" in

gate) gate ;;

commit)
  MSG="${2:-}"
  [ -n "$MSG" ] && [ -f "$MSG" ] || fail "usage: wave-cycle.sh commit <path-to-message-file>"
  [ "$(git status --porcelain | wc -l)" -gt 0 ] || fail "nothing to commit"
  gate || exit 1
  # AND THE STAGING MUST HAVE HAPPENED — 2026-09-19. `git add -A` threw its
  # status away here. If it refuses part-way (an index.lock left behind by a
  # killed git, one unreadable path) the commit below still succeeds on whatever
  # it managed to stage, and the tree that gets committed is NOT the tree the
  # gate above just passed — which is the one thing the gate is for.
  git add -A || fail "git add -A refused; the commit would carry a tree the gate never saw"
  git commit -q -F "$MSG" || fail "commit refused (a hook? do not skip it — fix it)"
  say "committed $(git rev-parse --short HEAD)"
  # STAMP BEFORE PUSHING. The stamp does not depend on any remote, and
  # push_both calls fail() on a refusal — which used to leave platform/.env
  # pointing at the PREVIOUS commit while HEAD had moved. That is the exact
  # state that kills a whole sweep at EXIT_TARGET_UNVERIFIED, and it is worse
  # than a failed push because a failed push is loud and a stale stamp is not.
  # Measured 2026-08-30: a transient vps refusal stopped the step here, and the
  # next sweep would have driven against a server attesting c2f8f7e while HEAD
  # was 34d7133. Retrying the push is cheap; noticing a stale stamp is not.
  stamp_env
  push_both
  snapshot_ledger
  ;;

stamp)
  # THE ONE STEP THAT COSTS A WHOLE SWEEP HAD NO DOOR — 2026-09-19.
  #
  # `stamp_env` is the guard against the most expensive failure this programme
  # has: platform/.env carrying a stale NEXT_PUBLIC_COMMIT_SHA, /api/health
  # attesting a commit that is not HEAD, and every drive in a 211-drive fleet
  # exiting EXIT_TARGET_UNVERIFIED. Until now it was reachable ONLY from the
  # `commit` case — which refuses on a clean tree and runs the full gate first
  # (38 min, measured in the gate's own notes). So restamping between commits
  # meant editing .env by hand, and that is precisely why it is wrong when
  # somebody finally looks:
  #
  #   MEASURED 2026-09-19 on this tree —
  #     git rev-parse HEAD                         c9a7ad9f2772…
  #     NEXT_PUBLIC_COMMIT_SHA in platform/.env    793335e4f234…
  #     git rev-list --count 793335e4..HEAD        9
  #   Nine commits behind. A sweep dispatched in that state photographs nothing
  #   and certifies nothing, and the 38-minute gate is not what is missing.
  #
  # So: one door, no gate, no commit, no push. It does exactly what the `commit`
  # case's own stamp does — the SAME function, so the character-for-character
  # read-back that catches a sha appearing in a comment cannot be bypassed here.
  stamp_env
  # AND IT SAYS WHETHER THE RUNNING SERVER STILL DISAGREES, BY ASKING IT.
  #
  # `stamp_env` already prints "the dev server must be RESTARTED". That note is
  # true and it is also easy to read past, because .env is on disk and looks
  # done. Next reads .env at BOOT, so a server that was already running keeps
  # serving the old sha from `process.env` no matter what this step wrote — and
  # the operator's next move after a stamp is usually to dispatch.
  #
  # This does not refuse. It cannot sensibly: a second ago the stamp was written
  # and no server can have restarted since, so a refusal here would be red every
  # single time. sweep-preflight.sh step 4 is the ONE place that refuses on this
  # ("the server attests a DIFFERENT commit than HEAD"), and duplicating that
  # decision in a second file is the divergence this lane exists to remove. What
  # this does is turn an instruction into a measurement, naming both shas.
  say "checking whether a running dev server still attests the old commit…"
  if p=$(discover_port); then
    srv=$(curl -s -m 8 "localhost:$p/api/health" 2>/dev/null |
      sed -n 's/.*"commit":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    if [ "${srv:0:7}" = "$(git rev-parse --short=7 HEAD)" ]; then
      say "the server on port $p already attests ${srv:0:12} — nothing to restart"
    else
      echo ""
      echo "  !! THE SERVER ON PORT $p IS STILL ATTESTING «${srv:-(no commit field)}»"
      echo "     HEAD is $(git rev-parse HEAD)"
      echo "     .env is now correct; the RUNNING PROCESS is not, and it never will be —"
      echo "     Next reads .env at boot. STOP IT AND START IT AGAIN before dispatching,"
      echo "     or every drive exits EXIT_TARGET_UNVERIFIED and the sweep is lost."
      echo "     sweep-preflight.sh step 4 will refuse until you do; that refusal is correct."
      echo ""
    fi
  else
    # AN ALL-CLEAR MAY ONLY BE AS STRONG AS THE SEARCH THAT EARNED IT.
    #
    # This line used to read "nothing is holding a stale sha", which is a claim
    # about the whole box made from a loop that probed nine numbers. The operator
    # sequence this case serves REQUIRES a dev-server restart, and a restart is
    # exactly when Next autoPorts — 3000 held by a dying process is how 63269
    # happened on 2026-09-12 — so the one moment the reassurance is read is the
    # one moment it is most likely to be false.
    #
    # The search is wider now, and it still cannot prove absence: a `-m 2` probe
    # cannot tell "nothing listening" from "listening, still compiling"
    # (measured — see discover_port). So this reports WHAT WAS SEARCHED.
    #
    # ── AND IT NO LONGER ENDS WIDER THAN THAT SEARCH ──────────────────────
    #
    # The repair above left the last word conditioned on the operator: "if you
    # have NOT started a server, nothing is holding a stale sha". That is still
    # a claim about the whole box, and it turns on the one thing this script
    # cannot see — it covers the reader's OWN server and nothing else. An orphan
    # from a killed session, or a second Claude session's server, is holding a
    # stale sha and was started by nobody the reader would count. That is not a
    # hypothetical: it is this repo's recorded failure (port 63269, 2026-09-12,
    # 3000 held by a dying process). So the conclusion is not handed to the
    # operator either; the census is printed and no all-clear is drawn from it.
    #
    # So no all-clear is printed. What is printed is the census below, built
    # from DISCOVER_PROBE_LOG — probes that really happened — and split by the
    # one bit that discriminates on this box (see discover_port's table: curl's
    # exit code is 28 for a closed port, a silent listener and a cold healthy
    # server alike, so membership of `listening_ports` is what separates them).
    LP_N=$(listening_ports | grep -c . || true)
    KP_N=$(printf '%s\n' $KNOWN_PORTS | grep -c . || true)
    say "no server answered our /api/health (a reply carrying a \"commit\" field) on any of $((KP_N + LP_N)) candidates: $KP_N known ports + $LP_N LISTENING"
    if [ "$LP_N" -eq 0 ]; then
      echo ""
      echo "  !! netstat produced NO listening ports, so only the $KP_N hardcoded candidates were probed."
      echo "     An autoPorted dev server CANNOT be seen by a search that narrow — that is the"
      echo "     2026-09-12 failure (port 63269) exactly. THIS IS NOT AN ALL-CLEAR: find the"
      echo "     server yourself and check its commit before dispatching anything."
      echo ""
    else
      # Answered within 2 s, but not with our health shape.
      STRANGER_N=$(grep -c ' 0 stranger$' "$DISCOVER_PROBE_LOG" 2>/dev/null || true)
      # A count that could not be taken is not a count of zero — the failure
      # class gate 1 and gate 4 were both repaired for. If the log is missing,
      # say "?" rather than printing a reassuring 0 nobody measured.
      [ -n "$STRANGER_N" ] || STRANGER_N="?"
      # Did not answer within 2 s WHILE netstat called the port LISTENING: a
      # socket is there and it said nothing. A compiling Next server, an orphan
      # mid-shutdown and a stranger's daemon are indistinguishable here — which
      # is the point, because two of those three hold a stale sha.
      SILENT_LISTENING=$(awk '$3 == "silent" { print $1 }' "$DISCOVER_PROBE_LOG" 2>/dev/null |
        grep -Fxf <(listening_ports) 2>/dev/null | sort -u -n | tr '\n' ' ' | sed 's/ *$//')
      SL_N=$(printf '%s\n' $SILENT_LISTENING | grep -c . || true)
      [ -r "$DISCOVER_PROBE_LOG" ] || SL_N="?"
      say "  THIS IS NOT AN ALL-CLEAR — it is what the search found, and the search cannot prove absence:"
      say "  · $STRANGER_N candidate(s) answered in 2 s but carried no \"commit\" field — not our health shape"
      say "  · $SL_N candidate(s) netstat calls LISTENING answered NOTHING in 2 s${SILENT_LISTENING:+: $SILENT_LISTENING}"
      say "  · every other miss is indistinguishable from a closed port at this timeout (measured — see discover_port)"
      say "  An ORPHANED server from a killed session, or another session's server, is holding a stale sha and"
      say "  appears in NO list above as such. If any port is named on the second line, probe it before dispatching:"
      say "    curl -m 10 localhost:<port>/api/health"
    fi
  fi
  ;;

preflight)
  bash "$REPO/.audit-frames/wave-scripts/sweep-preflight.sh"
  ;;

sweep)
  ROUND="${2:-}"; LESSONS="${3:-}"; SHARDS="${4:-2}"
  # [--with-path-legs] as the 5th argument forwards to the supervisor (DESIGN-v2 §9); off by default.
  PATH_FLAG=""; [ "${5:-}" = "--with-path-legs" ] && PATH_FLAG="--with-path-legs"
  [ -n "$ROUND" ] && [ -f "${LESSONS:-/nonexistent}" ] || fail "usage: wave-cycle.sh sweep <round> <lessonsfile> [shards] [--with-path-legs]"
  bash "$REPO/.audit-frames/wave-scripts/sweep-preflight.sh" || fail "preflight refused; a sweep dispatched now photographs the paywall"
  # TWO DRIVERS ON ONE SERVER, NEVER TWO SERVERS. Two dev servers on one box
  # contend for the same 7200 rpm disk and the same Turbopack cache and both
  # crawl; the drives then time out and the corpus fills with unsteered legs.
  local_total=$(wc -l < "$LESSONS")
  # THE PORT COMES FROM THE PREFLIGHT, NOT FROM A DEFAULT — 2026-08-28.
  # This dispatched with only two arguments, so `drive-supervisor.sh`'s third
  # parameter fell to its default `http://localhost:3460` while the preflight had
  # just DISCOVERED the real port (3000 that day). Every drive would have hit a
  # closed port and the supervisor would have retried each one twelve times.
  PORT=$(discover_port) || fail "no server answering our /api/health — run preflight first"
  # COUNT THE WAY THE SHARDER COUNTS. The lessons file is ONE comma-separated
  # line, so wc -l printed "1 lessons" for a 29-lesson sweep — and that number
  # is what a reader uses to decide whether the dispatch looks right.
  LESSON_N=$(tr ',' '
' < "$LESSONS" | grep -c .)
  say "sweep $ROUND: $LESSON_N lessons over $SHARDS shard(s), one server on :$PORT"
  mkdir -p "$REPO/.audit-frames/$ROUND"

  # …AND THE SHARD FILES ARE COMMA-SEPARATED, BECAUSE THAT IS WHAT THE SUPERVISOR
  # READS. It does `--lessons "$(cat "$LIST")"`, which wants a comma list; this
  # step used `split -n l/N` — a LINE split — so the two halves of the same step
  # disagreed about what a lesson list is. A one-line comma file cannot be
  # line-split at all.
  #
  # INTERLEAVED, not halved. The re-drive set is sorted heaviest-first, so a
  # contiguous split hands shard 0 every expensive lesson and leaves shard 1 idle
  # for the back half of the run.
  #
  # A SHARD COUNT THAT IS NOT A NUMBER PRODUCES NO SHARDS AT ALL. Measured this
  # session with SHARDS="two": `Number("two")` is NaN, `i % NaN` is NaN, and the
  # splitter dies on `out[NaN].push` with a TypeError and exit 1 having written
  # NOTHING. Named here rather than left to a stack trace.
  case "$SHARDS" in ''|*[!0-9]*) fail "shards must be a positive integer; got «$SHARDS»";; esac
  [ "$SHARDS" -ge 1 ] || fail "shards must be at least 1; got «$SHARDS»"
  # …AND THE SPLIT'S OWN STATUS, WHICH THE PIPE TO sed DISCARDED — 2026-09-19.
  # A pipeline returns the status of its last element, so `node … | sed` reported
  # 0 for a splitter that had died: measured this session at exit 9 with zero
  # shard files written, pipeline status 0.
  SPLIT_RC=0
  SPLIT_OUT=$(node -e '
    const fs = require("fs");
    const names = fs.readFileSync(process.argv[1], "utf8").split(/[\s,]+/).filter(Boolean);
    const n = Number(process.argv[2]);
    const out = Array.from({ length: n }, () => []);
    names.forEach((x, i) => out[i % n].push(x));
    out.forEach((list, i) => fs.writeFileSync(process.argv[3] + "/shard-" + i + ".txt", list.join(",") + "\n"));
    console.log(out.map((l, i) => "shard " + i + ": " + l.length).join("  ·  "));
  ' "$LESSONS" "$SHARDS" "$REPO/.audit-frames/$ROUND" 2>&1) || SPLIT_RC=$?
  printf '%s\n' "$SPLIT_OUT" | sed 's/^/    /'
  [ "$SPLIT_RC" -eq 0 ] || fail "the shard split exited $SPLIT_RC — nothing was dispatched, and the shard-*.txt files in .audit-frames/$ROUND are whatever was there BEFORE this round"

  # DISPATCH THE SHARDS THIS ROUND WAS TOLD TO WRITE, NOT WHATEVER THE GLOB FINDS
  # — 2026-09-19. The loop here was `for f in …/shard-*.txt` with no `nullglob`,
  # and both halves of that were measured this session on fixtures:
  #   . empty directory  -> the body runs ONCE with the literal pattern, i.e.
  #     «dispatching shard '*'» with the list file «…/shard-*.txt», which the
  #     supervisor then `cat`s.
  #   . a stale shard-0.txt left by a previous round -> «dispatching shard '0'»
  #     carrying the PREVIOUS round's lesson list under THIS round's name, which
  #     is a sweep whose frames say they cover lessons nobody drove.
  # Combined with the discarded split status above, a failed split dispatched the
  # wrong sweep in silence. Iterating 0..SHARDS-1 dispatches exactly what the
  # splitter was asked for; a leftover beyond that is named, not driven.
  # A MID-LOOP `fail` USED TO LEAVE THE EARLIER SUPERVISORS RUNNING. `fail` exits
  # this script, but the shards dispatched on previous iterations are detached
  # children and keep going. MEASURED 2026-09-19 with 3 shards claimed and 2
  # lists present: the script printed STOPPED and exited 1, and eight seconds
  # later both shard-0 and shard-1 supervisors were still alive — still writing
  # into `fill-<round>-*`, which `merge` later collects with no completion check.
  # So a REFUSED sweep could be merged afterwards as though it were whole. The
  # step fails closed either way; this is about what it leaves behind.
  stop_dispatched() {
    [ -n "${PIDS:-}" ] || return 0
    for job in $PIDS; do
      kill "${job%%:*}" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    say "  stopped the supervisors already dispatched, so a refused sweep leaves no half-written round behind"
  }
  PIDS=""
  for s in $(seq 0 $((SHARDS - 1))); do
    f="$REPO/.audit-frames/$ROUND/shard-$s.txt"
    [ -s "$f" ] || { stop_dispatched; fail "shard $s list is missing or empty ($f) although the split reported success — refusing to dispatch a supervisor with no lessons"; }
    say "  dispatching shard $s under the supervisor"
    bash "$REPO/tools/mobile/drive-supervisor.sh" "$ROUND-$s" "$f" "http://localhost:$PORT" $PATH_FLAG &
    PIDS="$PIDS $!:$s"
  done
  for f in "$REPO/.audit-frames/$ROUND/shard-"*.txt; do
    [ -e "$f" ] || continue
    s=$(basename "$f" .txt | sed 's/shard-//')
    case "$s" in ''|*[!0-9]*) continue;; esac
    [ "$s" -lt "$SHARDS" ] || say "  NOTE: $f is a LEFTOVER from an earlier round of this name — not dispatched"
  done

  # EVERY JOB'S STATUS, NOT THE LAST ONE'S — 2026-09-19. Bare `wait` returns 0
  # once every job has exited, whatever they exited WITH: measured this session,
  # `( exit 7 ) & ( exit 0 ) & wait` yields 0. drive-supervisor.sh's own last
  # statement is an `echo` into its log, so 0 is what it returns for an ordinary
  # run however the drives went; a non-zero status from it means the SUPERVISOR
  # itself died (its `cd` refused, it was killed) and that shard's lessons were
  # never driven to the end. Saying "all shards exited" over that is how a sweep
  # gets judged as if it were complete.
  SWEEP_RC=0
  for job in $PIDS; do
    p="${job%%:*}"; s="${job##*:}"
    if wait "$p"; then
      say "  shard $s supervisor exited 0"
    else
      jrc=$?; SWEEP_RC=1
      say "  shard $s supervisor EXITED $jrc"
    fi
  done
  [ "$SWEEP_RC" -eq 0 ] || fail "at least one shard supervisor died (statuses above). Whatever landed is in .audit-frames/fill-$ROUND-*, and merging it is still possible — but this sweep is INCOMPLETE and must not be adjudicated as a full pass over $LESSON_N lessons"
  say "all shards exited 0; run: wave-cycle.sh merge $ROUND"
  ;;

merge)
  ROUND="${2:-}"
  [ -n "$ROUND" ] || fail "usage: wave-cycle.sh merge <round>"
  # --halves AND --dest, NOT --from/--to — 2026-08-28.
  #
  # `wave-c-merge.mjs` reads `--root`, `--halves` and `--dest` (:49-52). The flags
  # this step passed do not exist, so they were IGNORED and the tool fell back to
  # its defaults — `--halves wave-c-a,wave-c-b --dest wave-c`. Both those stale
  # directories exist and hold zero frame dirs, so it would have merged NOTHING and
  # printed a success line while a 211-drive sweep sat uncollected in the fill-*
  # halves. (Worth noting what it did NOT do: the default `--dest wave-c` is the
  # LIVE ledger directory whose frames banked retirements cite. Had those halves
  # held anything, the default would have moved frames into it.)
  #
  # Halves are NAMES under --root, not paths, and both go in ONE invocation so the
  # tool can do the job it exists for: detect a lesson/leg appearing in both.
  HALVES=""
  for d in "$REPO/.audit-frames/fill-$ROUND-"*; do
    [ -d "$d" ] || continue
    HALVES="${HALVES:+$HALVES,}$(basename "$d")"
  done
  [ -n "$HALVES" ] || fail "no fill-$ROUND-* halves to merge — did the sweep write anywhere else?"
  say "merging halves: $HALVES  ->  $ROUND"
  # AND ITS STATUS — the same pipe-swallows-it shape as the split and the
  # snapshot. wave-c-merge.mjs has two `process.exit(1)` refusals (:110, :165);
  # piped to sed, both read as a successful merge and the round then gets judged
  # on whatever the halves happened to contain — which is the 2026-08-28 story
  # the comment above is about, one layer down.
  MERGE_RC=0
  MERGE_OUT=$(node "$REPO/tools/audit/wave-c-merge.mjs" --halves "$HALVES" --dest "$ROUND" 2>&1) || MERGE_RC=$?
  printf '%s\n' "$MERGE_OUT" | sed 's/^/    /'
  [ "$MERGE_RC" -eq 0 ] || fail "wave-c-merge exited $MERGE_RC — $ROUND was NOT merged; judging it now would adjudicate an empty or half-collected sweep"
  ;;

post)
  say "1/4 verdict coverage"
  node "$REPO/tools/audit/verdict-coverage.mjs" 2>&1 | tail -14
  say "2/4 count agreement (nine tools must report ONE open list)"
  node "$REPO/tools/audit/count-agreement.mjs" 2>&1 | tail -3 | grep -q "AGREED" \
    || fail "the counters disagree; do not apply anything until they do"
  say "3/4 wave-c-post --apply"
  # THE BACKUP IS A PRECONDITION OF THE APPLY, NOT A COURTESY — 2026-09-19.
  # This line was `cp … 2>/dev/null` with the status discarded, one line before
  # `wave-c-post.mjs --apply` does `fs.appendFileSync(CLOSURES, …)` (:657) to the
  # live file. Measured this session: a cp that fails leaves NO .bak, prints
  # nothing because of the 2>/dev/null, and the script walks straight into the
  # apply — status 0, no backup, and the append happens anyway.
  # Cost of doing it properly, measured on the real file (1,980,842 bytes /
  # 1,428 lines, page cache warm): cp 0.057 s, cmp 0.110 s. A cold read off this
  # 7,200 rpm disk is larger, and that is a property of the disk, not of this.
  # What this .bak is and is not: it sits in the same directory on the same
  # disk, so it protects against a bad --apply, not against losing the disk.
  # That is what step 4/4 is for.
  CLOSURES="$REPO/.audit-frames/wave-c/closures.jsonl"
  if [ -f "$CLOSURES" ]; then
    cp "$CLOSURES" "$CLOSURES.bak" || fail "could not back up closures.jsonl — NOT applying: the append below cannot be un-written and this is the file that says what was retired and on what evidence"
    cmp -s "$CLOSURES" "$CLOSURES.bak" || fail "closures.jsonl.bak does not match closures.jsonl after the copy (a short write? a concurrent writer?) — NOT applying against a backup that is not one"
    say "    backed up $(wc -l < "$CLOSURES") closure line(s) -> closures.jsonl.bak"
  else
    # Not a failure, and not silence either: there is genuinely nothing to lose
    # yet, and the apply creates the file. This branch exists so that "no backup"
    # can only ever mean "no data", never "the copy failed".
    say "    closures.jsonl does not exist yet — nothing to back up; the apply will create it"
  fi
  # …AND THE APPLY'S OWN STATUS, WHICH THE PIPE TO tail DISCARDED. wave-c-post
  # exits 1 on all three of its refusal paths (:606 nothing to apply, :619 a
  # retirement already in closures.jsonl, :627 a verdict citing an id not in the
  # corpus) and on any crash. Piped, every one of them read as a successful
  # apply — and the step then snapshotted the ledger, i.e. wrote a possibly
  # half-applied corpus over the last good copy on ledger/audit. Stopping before
  # 4/4 is the conservative answer: on a refusal the ledger is unchanged, so the
  # snapshot already on ledger/audit is still the right one.
  POST_RC=0
  POST_OUT=$(node "$REPO/tools/audit/wave-c-post.mjs" --apply 2>&1) || POST_RC=$?
  printf '%s\n' "$POST_OUT" | tail -14
  [ "$POST_RC" -eq 0 ] || fail "wave-c-post --apply exited $POST_RC (read its output above). NOT snapshotting: if that was a refusal the ledger did not change and the existing ledger/audit snapshot still stands; if it crashed mid-append, restore from $CLOSURES.bak BEFORE running any snapshot"
  say "4/4 snapshot the ledger (it is gitignored ON PURPOSE and lives on one HDD)"
  snapshot_ledger
  ;;

status)
  echo "=== WHERE THE LOOP STANDS ==="
  echo "  branch  : $(git rev-parse --abbrev-ref HEAD)"
  echo "  HEAD    : $(git log --oneline -1)"
  echo "  dirty   : $(git status --porcelain | wc -l) file(s)"
  o=$(env -u GIT_SSH_COMMAND git ls-remote origin "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null | cut -f1)
  # AN UNREACHABLE REMOTE IS NOT A BEHIND ONE — 2026-09-19. ls-remote is silenced
  # by the 2>/dev/null and its status is eaten by the pipe to cut, so a refused
  # key, no network or a dead host all left $o empty, and empty is not equal to
  # HEAD: the line then printed «origin  :   <-- BEHIND» with a blank sha, which
  # reads as "push again" when what happened is "nobody could look".
  if [ -z "$o" ]; then
    echo "  origin  : (no answer) <-- COULD NOT READ THE REMOTE — this is NOT the same as behind; see push_both for the two-keys trap"
  else
    echo "  origin  : ${o:0:12}$([ "$o" = "$(git rev-parse HEAD)" ] && echo "  (in sync)" || echo "  <-- BEHIND")"
  fi
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
  # ALL THREE FIELDS, NOT JUST filed= — 2026-09-19. Only FILED was guarded, and
  # the other two are used unquoted in arithmetic and in prose. Measured this
  # session on a stamp that carries filed= and closed= but no retired= and no
  # open= (`OPEN-LIST  filed=1510  closed=1416 …`), the old block printed, at
  # exit 0:
  #     1510 ever filed ·  closed with evidence · 0% done ·  open
  # — an empty RET reads as 0 inside $(( )), so a missing field became «0% done»
  # on a programme that is most of the way through, and the two blanks read as a
  # spacing glitch rather than as an absence. This is the number the founder is
  # given for where the loop stands; it must be unreadable loudly or not at all.
  [ -n "$FILED" ] && [ "$FILED" -gt 0 ] || fail "could not read the corpus counts; refusing to print a percentage derived from nothing"
  [ -n "$RET" ] || fail "the OPEN-LIST stamp carries no retired= field («$L») — refusing to print a completion figure with a blank numerator"
  [ -n "$OPEN" ] || fail "the OPEN-LIST stamp carries no open= field («$L») — refusing to print an open count that is blank"
  echo "  $FILED ever filed · $RET closed with evidence · $((RET * 100 / FILED))% done · $OPEN open"
  echo "  (the $OPEN open is three things — STILL, UNJUDGED, PARTIAL — and must never be"
  echo "   quoted as a bare defect count; run wave-c-post for the split)"
  echo ""
  # A MISSING LEDGER MUST NOT PRINT AS A BLANK — 2026-09-19. `wc -l < file` on a
  # file that is not there writes «No such file or directory» to stderr and
  # substitutes NOTHING, so the line read «verdict lines: ». Measured this
  # session. That is the loudest event this whole script exists for — the
  # gitignored corpus gone from the one disk it lives on — rendering as a
  # spacing defect at the bottom of a status report.
  VJ="$REPO/.audit-frames/wave-c/verdicts.jsonl"
  CJ="$REPO/.audit-frames/wave-c/closures.jsonl"
  if [ -r "$VJ" ]; then echo "  verdict lines: $(wc -l < "$VJ")"
  else echo "  verdict lines: !! $VJ IS NOT READABLE — the ledger is not on this disk; restore it from the ledger/audit branch before running anything else"; fi
  if [ -r "$CJ" ]; then echo "  closures     : $(wc -l < "$CJ")"
  else echo "  closures     : !! $CJ IS NOT READABLE — the ledger is not on this disk; restore it from the ledger/audit branch before running anything else"; fi
  ;;

*) fail "unknown step '$STEP' — see the usage block at the top of this file" ;;
esac
