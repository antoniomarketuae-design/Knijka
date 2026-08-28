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
PORTS="3460 3461 3462 3470 3480 3500 3200"

stamp() { date +%H:%M:%S; }
say()   { echo "[$(stamp)] $*" | tee -a "$LOG"; }

say "watchdog up, interval ${INT}s — writing to $LOG"
say "it reports only; it repairs nothing (see the header for why)"

lastbad=""
while true; do
  bad=""

  # 1. IS ANYTHING SERVING? Port 3000 is deliberately not in the list: that is
  #    nexflow, a DIFFERENT product of the founder's, and hitting it has already
  #    once been mistaken for our app being up.
  PORT=""
  for p in $PORTS; do
    if curl -s -m 4 "localhost:$p/api/health" >/dev/null 2>&1; then PORT=$p; break; fi
  done
  if [ -z "$PORT" ]; then
    bad="no dev server answers /api/health on any known port"
  else
    H=$(curl -s -m 8 "localhost:$PORT/api/health" 2>/dev/null)

    # 2. DOES IT SAY THE DATABASE IS THERE? A 200 from the app proves the app
    #    mounted, not that a drive can sign in.
    echo "$H" | grep -q '"ok":true' || bad="health on :$PORT does not report db ok  ->  $(echo "$H" | head -c 200)"

    # 3. DOES IT KNOW WHICH BUILD IT IS? "commit":"unknown" means platform/.env
    #    lost its stamp, and every drive from here on exits EXIT_TARGET_UNVERIFIED.
    echo "$H" | grep -q '"commit":"unknown"' && bad="health reports commit:unknown — platform/.env has no NEXT_PUBLIC_COMMIT_SHA"
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
  FREE=$(powershell.exe -NoProfile -Command "[math]::Round((Get-PSDrive C).Free/1GB,1)" 2>/dev/null | tr -d '\r ')
  case "$FREE" in
    ''|*[!0-9.]*) : ;;
    *) awk "BEGIN{exit !($FREE < 3)}" && bad="${bad:+$bad; }C: has only ${FREE} GB free — frames will start disappearing" ;;
  esac

  if [ -n "$bad" ]; then
    [ "$bad" != "$lastbad" ] && say "PROBLEM: $bad"
    lastbad="$bad"
  else
    [ -n "$lastbad" ] && say "recovered — server :$PORT, db ok, stamp matches HEAD ${HEADSHA:0:12}"
    lastbad=""
  fi

  sleep "$INT"
done
