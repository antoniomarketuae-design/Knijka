#!/usr/bin/env bash
# =============================================================================
# Книжка.AI staging auto-deploy — the 5-minute cron tick. (audit 2026-07-24,
# finding H-17)
#
# THE BUG THIS REPLACES, precisely:
# The old /opt/knijka/autodeploy.sh compared LOCAL to REMOTE like this —
#     git reset --hard "$REMOTE"        # HEAD moves HERE
#     [ "$LOCAL" = "$REMOTE" ] && exit 0 # ...and is compared AFTER
# so the very act of attempting a deploy made the next tick believe there was
# nothing to deploy. A deploy that failed was therefore **never retried**.
# Staging stayed broken from 23:03 on 07-19 until an unrelated push at 10:24
# on 07-20 — ~11.5 hours — and the only thing that could have fixed it was a
# human pushing new code.
#
# It also matched on the branch SHA alone, so a commit whose CI gate was RED
# deployed to students anyway.
#
# THE TWO STRUCTURAL FIXES
#   1. "What is deployed" is a marker file written by deploy.sh ONLY after the
#      health gate went green. Nothing else writes it. A failed deploy leaves
#      it untouched, so the next tick tries again — automatically.
#   2. The target is the `staging-green` tag, which CI moves only after the
#      whole gate passes (.github/workflows/ci.yml, job `deployable`). A red
#      commit is not a deploy candidate at all.
#
# Retrying forever would be its own outage (a broken commit rebuilding every
# five minutes pins the CPU of the box that is also serving staging), so
# retries back off and then stop, loudly, on that SHA. A NEW green commit
# always deploys immediately — pushing a fix is how you clear the state, which
# is what a person would do anyway.
#
# Install: see tools/deploy/README.md. Run from cron every 5 minutes.
# =============================================================================
set -euo pipefail

STATE_DIR="${KNIJKA_STATE_DIR:-/var/lib/knijka-deploy}"
BUILD_ROOT="${KNIJKA_BUILD_ROOT:-/opt/knijka-build}"
DEPLOY_REF="${KNIJKA_DEPLOY_REF:-staging-green}"
GIT_REMOTE="${KNIJKA_GIT_REMOTE:-origin}"
DEPLOY_SCRIPT="${KNIJKA_DEPLOY_SCRIPT:-$(dirname "$0")/deploy.sh}"
# 4 attempts at 5/10/20-minute spacing ≈ 35 minutes of trying before giving up.
MAX_ATTEMPTS="${KNIJKA_MAX_ATTEMPTS:-4}"
BACKOFF_BASE_SEC="${KNIJKA_BACKOFF_BASE_SEC:-300}"
# Optional: a URL to POST failures to (Slack/Discord/ntfy). Never store a
# secret in this repo — set it in the cron environment on the box.
ALERT_WEBHOOK="${KNIJKA_ALERT_WEBHOOK:-}"

export HOME="${HOME:-/root}" # pm2's process table lives under $HOME (see deploy.sh)

log() { printf '%s autodeploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

notify() {
  log "$*"
  if [ -n "$ALERT_WEBHOOK" ]; then
    # Best effort only: an unreachable webhook must never fail a deploy tick.
    curl -fsS --max-time 10 -H 'Content-Type: application/json' \
      -d "{\"text\":\"knijka staging: $*\"}" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
  fi
}

read_state() { cat "$STATE_DIR/$1" 2>/dev/null || printf '%s' "${2:-}"; }

mkdir -p "$STATE_DIR"

# --- one tick at a time -------------------------------------------------------
# A deploy takes minutes; the tick is every five. Without a lock, a slow build
# would be racing the next tick inside the same build workspace. `mkdir` is the
# portable atomic test-and-set (flock is not everywhere; mkdir is).
LOCK_DIR="$STATE_DIR/lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # A stale lock (box rebooted mid-deploy) would otherwise wedge deploys
  # forever — exactly the silent-forever failure mode H-17 is about.
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    notify "clearing a stale deploy lock (older than 60 min)"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    log "another deploy is running — skipping this tick"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

# --- what should be live? -----------------------------------------------------
git -C "$BUILD_ROOT" fetch --quiet --tags --force "$GIT_REMOTE" || {
  log "could not reach $GIT_REMOTE — will try again next tick"
  exit 0
}

TARGET=$(git -C "$BUILD_ROOT" rev-list -n 1 "$DEPLOY_REF" 2>/dev/null || true)
if [ -z "$TARGET" ]; then
  # Not an error to shout about on every tick: it just means CI has not
  # published a green commit yet (or the tag was never pushed).
  log "no $DEPLOY_REF tag yet — nothing is cleared for deploy"
  exit 0
fi

DEPLOYED=$(read_state deployed_sha)
if [ "$TARGET" = "$DEPLOYED" ]; then
  exit 0 # silent: this is the normal case, 288 times a day
fi

# --- retry budget -------------------------------------------------------------
FAIL_SHA=$(read_state fail_sha)
FAIL_COUNT=$(read_state fail_count 0)
# A run killed mid-write leaves an empty counter. Treating that as an error
# would wedge deploys permanently — the exact failure shape H-17 is about.
case "$FAIL_COUNT" in ''|*[!0-9]*) FAIL_COUNT=0 ;; esac
if [ "$FAIL_SHA" = "$TARGET" ]; then
  if [ "$FAIL_COUNT" -ge "$MAX_ATTEMPTS" ]; then
    # Say it once, then stay quiet — an alert every five minutes is an alert
    # nobody reads. The marker file is the durable record.
    if [ ! -f "$STATE_DIR/gave_up_on" ] || [ "$(read_state gave_up_on)" != "$TARGET" ]; then
      printf '%s' "$TARGET" > "$STATE_DIR/gave_up_on"
      notify "GIVING UP on ${TARGET:0:12} after $FAIL_COUNT failed deploys. Staging is still serving ${DEPLOYED:0:12}. Push a fix — a new green commit deploys immediately."
    fi
    exit 0
  fi
  NEXT_AT=$(read_state next_attempt_at 0)
  if [ "$(date +%s)" -lt "$NEXT_AT" ]; then
    log "backing off after $FAIL_COUNT failure(s) on ${TARGET:0:12} — next attempt at $(date -u -d "@$NEXT_AT" +%H:%M:%SZ 2>/dev/null || echo "$NEXT_AT")"
    exit 0
  fi
else
  # A different commit: a push IS the fix, so start the budget over.
  FAIL_COUNT=0
  rm -f "$STATE_DIR/gave_up_on"
fi

# --- deploy -------------------------------------------------------------------
log "deploying ${TARGET:0:12} (attempt $((FAIL_COUNT + 1))/$MAX_ATTEMPTS)"
STATUS=0
"$DEPLOY_SCRIPT" "$TARGET" || STATUS=$?

case "$STATUS" in
  0)
    # deploy.sh wrote deployed_sha and cleared the failure state itself.
    log "deployed ${TARGET:0:12}"
    ;;
  3)
    # Serving, but the database is unreachable. deploy.sh already recorded it
    # as deployed and deliberately did not roll back; retrying the deploy
    # cannot fix Postgres, so do not burn the retry budget on it.
    notify "${TARGET:0:12} is live but the DATABASE is unreachable — check Postgres on the box."
    ;;
  *)
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '%s' "$TARGET" > "$STATE_DIR/fail_sha"
    printf '%s' "$FAIL_COUNT" > "$STATE_DIR/fail_count"
    # 5, 10, 20 minutes — long enough that a rebuild does not hog the box that
    # is also serving staging, short enough that a flake self-heals unattended.
    printf '%s' "$(( $(date +%s) + BACKOFF_BASE_SEC * (1 << (FAIL_COUNT - 1)) ))" \
      > "$STATE_DIR/next_attempt_at"
    notify "deploy of ${TARGET:0:12} FAILED (exit $STATUS, attempt $FAIL_COUNT/$MAX_ATTEMPTS). Staging rolled back to ${DEPLOYED:0:12}; retrying with backoff."
    ;;
esac

exit 0
