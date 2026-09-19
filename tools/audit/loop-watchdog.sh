#!/usr/bin/env bash
#
# THE WATCHDOG. Runs for as long as the repair loop does, and does exactly one
# job: notice when the loop has silently stopped being able to work, and say so
# in a file somebody is reading.
#
# WHY. Every long stall on this programme has had the same shape — nothing threw,
# nothing exited non-zero, and the work carried on producing output that meant
# nothing:
#   . a corrupted 1.3 GB platform/.next made EVERY api route 404, so /api/health
#     404'd too and 200-odd drives exited EXIT_TARGET_UNVERIFIED in a row;
#   . prisma dev died and came back on a DIFFERENT port, so the session cache
#     validated identity but not authority and twelve drives photographed the
#     PAYWALL with exit 0 and byte-identical frames;
#   . platform/.env kept a stale NEXT_PUBLIC_COMMIT_SHA after a commit, so the
#     health route attested a build that no longer existed and every drive
#     refused to certify.
# None of those is detectable from inside a drive. All three are one HTTP request
# away from outside it.
#
# WHAT IT DOES NOT DO: it does not restart anything, does not touch git, does not
# kill a process. A watchdog that repairs is a watchdog that can break the run it
# is watching — v1 of the drive supervisor killed every ms-playwright process on
# the box and executed its siblings' browsers. This one only WATCHES and WRITES.
#
#   tools/audit/loop-watchdog.sh [interval_seconds]   -> .audit-frames/watchdog.log
#
set -u
REPO="E:/AI driver"
cd "$REPO" || exit 1
INT="${1:-90}"
LOG="$REPO/.audit-frames/watchdog.log"
PORTS="3460 3461 3462 3470 3480 3500 3200 3411 3000"

stamp() { date +%H:%M:%S; }
say()   { echo "[$(stamp)] $*" | tee -a "$LOG"; }

say "watchdog up, interval ${INT}s — writing to $LOG"
say "it reports only; it repairs nothing (see the header for why)"

lastbad=""
while true; do
  bad=""

  # 1. IS ANYTHING SERVING, AND IS IT OURS? 3000 IS in the list and is checked last
  #    — 2026-08-28. It was excluded as "nexflow, a different product", and on this
  #    box that was wrong: knijka's own dev server was on 3000, this watchdog
  #    reported "no dev server" for hours, and a second server got started on top
  #    of it.
  #
  #    THE SHAPE OF THE ANSWER IS WHAT IDENTIFIES US — AND UNTIL 2026-09-19 THAT WAS
  #    ONLY A COMMENT. This loop broke on the first port that answered AT ALL, and
  #    the checks below could not tell a neighbour from us either: handed
  #    {"ok":true,"service":"nexflow","version":"2.1.0"}, the old check 2 reported
  #    HEALTHY (measured this session — see the note there). So a neighbouring
  #    product on 3460 could hold this watchdog's attention while OUR server was
  #    dead. Requiring a `commit` field is the same test the sweep preflight makes
  #    (wave-cycle.sh discover_port), and it does not hide a sick server of ours: a
  #    readiness-red 503 still carries `commit`, so it is still FOUND here and then
  #    reported as sick by check 2 rather than as absent.
  PORT=""
  for p in $PORTS; do
    probe=$(curl -s -m 4 "localhost:$p/api/health" 2>/dev/null) || continue
    case "$probe" in *'"commit"'*) PORT=$p; break;; esac
  done
  if [ -z "$PORT" ]; then
    bad="no dev server answers /api/health in our shape (a body carrying a commit field) on any known port"
  else
    H=$(curl -s -m 8 "localhost:$PORT/api/health" 2>/dev/null)

    # 2. DOES IT SAY THE DATABASE IS THERE? PARSE THE FIELD; NEVER GREP STRUCTURED
    #    OUTPUT. This was `echo "$H" | grep -q '"ok":true'`, and it could not fail in
    #    the one direction that matters. route.ts:263-265 sets
    #    `migrations = { ok: true, latencyMs: 0, error: "skipped" }` PRECISELY WHEN
    #    `db.ok` is false — so on a DEAD database the body still contains the
    #    substring `"ok":true`, inside `checks.migrations`, and the grep matched it.
    #
    #    Measured this session, running the committed line itself against bodies
    #    built exactly as route.ts:241-284 builds them:
    #      old line · database dead (checks.db.ok:false)   -> HEALTHY
    #      old line · a neighbour's JSON on our port       -> HEALTHY
    #      old line · a HEALTHY body truncated at 42 bytes -> HEALTHY
    #      this parser · all three                         -> PROBLEM
    #    (that third row says HEALTHY deliberately: the dead-db body cut to 42
    #    bytes is `{"ok":false,"probe":"readiness","commit":"` and carries no
    #    `"ok":true` substring, so the old line reported PROBLEM on it. An
    #    earlier draft of this note left it under the two dead-db rows where it
    #    read as a third dead-db case. Both truncations refuse here as
    #    `not JSON`, so nothing behavioural turns on it — but a comment in this
    #    file is a measurement, and that one did not reproduce.)
    #    `prisma dev` has wedged this database TWICE, most recently 2026-09-18, so
    #    this is the live case, not a hypothetical one. Same defect as the
    #    invariant-2 guard that once waved a broken database through to a canary.
    #
    #    THE TOP-LEVEL `ok` IS THE FIELD TO READ, because it is what the route means
    #    by healthy: route.ts:269 computes `ok = db.ok && migrations.ok`, and it
    #    deliberately leaves `checks.mail` out of that decision — a console mailer on
    #    a dev box must not page anyone, so this must not read mail.ok either.
    #    Reading `ok` alone would still be a guess about a body whose shape we never
    #    checked, so the parser also requires those three booleans to EXIST: if the
    #    route contract changes, it says so instead of judging a field that is gone.
    #
    #    IT FAILS CLOSED. An unparseable body, a liveness answer, a missing field, or
    #    a node that will not start all produce a PROBLEM — the empty verdict is
    #    handled in the `case` below, so a broken parser cannot read as healthy.
    #    Cost: 170 ms per parse (5 in 853 ms, measured this session) once per ${INT}s.
    #
    #    CHECK 3 (WHICH BUILD IS THIS?) IS IN HERE TOO, on purpose: it is the same
    #    body, read once. It used to be a second grep, and because both checks
    #    ASSIGNED to `bad` instead of appending to it, whichever matched last erased
    #    the other's message — a dead database with a stale stamp reported only the
    #    stamp, and the database never appeared in the log at all.
    V=$(printf '%s' "$H" | node -e '
      let s = "";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        let j;
        try { j = JSON.parse(s); } catch (e) {
          return console.log("the body is not JSON (" + s.length + " bytes) — the route 500ed, the socket closed mid-body, or this is not our health endpoint");
        }
        if (!j || typeof j !== "object") return console.log("the body parsed but is not an object");
        if (j.probe !== "readiness") return console.log("not a readiness answer (probe=" + JSON.stringify(j.probe) + ") — a liveness probe says nothing about the database, and another product says nothing about us");
        const c = j.checks;
        if (typeof j.ok !== "boolean" || !c || !c.db || typeof c.db.ok !== "boolean" || !c.migrations || typeof c.migrations.ok !== "boolean") {
          return console.log("the readiness body is missing ok / checks.db.ok / checks.migrations.ok — the route contract changed and this watchdog can no longer judge it");
        }
        if (!j.commit || j.commit === "unknown") return console.log("commit:unknown — platform/.env lost NEXT_PUBLIC_COMMIT_SHA; every drive from here exits EXIT_TARGET_UNVERIFIED");
        if (j.ok !== true) return console.log("readiness is RED — db.ok=" + c.db.ok + " (" + (c.db.error || "-") + "), migrations.ok=" + c.migrations.ok + " (" + (c.migrations.error || "-") + ")");
        console.log("OK");
      });
    ' 2>/dev/null)
    case "$V" in
      OK) ;;
      *)  bad="health on :$PORT — ${V:-the verdict could not be computed at all (is node on PATH?), which is not a reason to call this healthy}  ->  $(printf '%s' "$H" | head -c 200)" ;;
    esac
  fi

  # 4. IS THE STAMP THE COMMIT WE ARE ACTUALLY ON? Stale is worse than missing:
  #    the drives certify happily against a build nobody is running.
  ENVSHA=$(grep '^NEXT_PUBLIC_COMMIT_SHA=' platform/.env 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d '\r')
  HEADSHA=$(git rev-parse HEAD)
  if [ "$ENVSHA" != "$HEADSHA" ]; then
    bad="${bad:+$bad; }platform/.env stamp ${ENVSHA:0:12} != HEAD ${HEADSHA:0:12} — restamp and RESTART the server before any sweep"
  fi

  # 5. IS THE DISK STILL THERE? The ledger lives on one 7200 rpm HDD and C: fell
  #    to 1.08 GB free this week. A sweep on a full disk loses frames silently.
  #
  #    AN UNREADABLE ANSWER IS NOT A REASSURING ONE — 2026-09-19. The two
  #    non-numeric arms of this check used to be one `case` arm doing `:` —
  #    nothing at all — so when the value could not be read the check did not go
  #    red, it CEASED TO EXIST, and the watchdog carried on reporting a clean
  #    loop. It is the same shape as the health grep above: silence read as
  #    health. Measured this session by stubbing powershell.exe to exit 127 —
  #    FREE='' and the iteration reported no problem at all.
  #
  #    THE DECIMAL COMMA IS NORMALISED, NOT TRUSTED. Fed "0,9" the old arm also
  #    said nothing — 0.9 GB free reported as fine, and 0.9 GB free is the exact
  #    state in which prisma dev killed this database on 2026-09-18. Whether
  #    this box ever answers with a comma is a property of its locale and not of
  #    this code (it answered "19.9" today), so `tr` makes the value readable and
  #    anything still unreadable is REPORTED rather than skipped.
  #
  #    The threshold is unchanged at 3 GB: measured this session, 3 -> quiet,
  #    2.9 -> "only 2.9 GB free", the same two verdicts the awk line gave.
  FREE=$(powershell.exe -NoProfile -Command "[math]::Round((Get-PSDrive C).Free/1GB,1)" 2>/dev/null | tr -d '\r ' | tr ',' '.')
  # `grep -E` IS LINE-ANCHORED, AND THAT IS NOT WHAT THIS PROMISES. `^…$` matches
  # ANY line, so a two-line value like "WARNING:…\n0.9" satisfies it, awk is then
  # handed a two-line program and dies, and NOTHING is reported at 0.9 GB free —
  # the exact figure at which prisma dev killed this database on 2026-09-18. Not
  # reachable from `powershell.exe -NoProfile` emitting one stdout line, and not
  # a regression (the old code was equally silent), but the sentence below claims
  # anything unreadable is REPORTED, so the test has to be on the whole value.
  # `case` matches the whole string, and the `*.*.*` arm refuses "1.2.3" (which
  # the old line fed straight to awk as a false red).
  case "$FREE" in
    '' | *[!0-9.]* | *.*.* | .) FREE_OK=0 ;;
    *) FREE_OK=1 ;;
  esac
  if [ "$FREE_OK" = 1 ]; then
    awk "BEGIN{exit !($FREE < 3)}" && bad="${bad:+$bad; }C: has only ${FREE} GB free — frames will start disappearing"
  else
    bad="${bad:+$bad; }cannot read C: free space (powershell answered '${FREE}') — the disk check is BLIND, and a sweep on a full disk loses frames silently"
  fi

  if [ -n "$bad" ]; then
    [ "$bad" != "$lastbad" ] && say "PROBLEM: $bad"
    lastbad="$bad"
  else
    [ -n "$lastbad" ] && say "recovered — server :$PORT, db ok, stamp matches HEAD ${HEADSHA:0:12}"
    lastbad=""
  fi

  sleep "$INT"
done
