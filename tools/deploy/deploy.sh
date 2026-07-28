#!/usr/bin/env bash
# =============================================================================
# Книжка.AI staging deploy — build in a workspace, swap atomically, verify,
# roll back on failure.  (audit 2026-07-24, finding H-17)
#
# WHAT WAS WRONG WITH THE OLD SCRIPT
# The old /opt/knijka/deploy.sh ran, in the LIVE directory:
#     git reset --hard → npm ci → prisma migrate deploy → rm -rf .next
#     → npm run build → pm2 restart
# Every one of those steps mutates the tree the running server is serving from.
# For the ~2m24s the build took, the live process had no `.next` at all —
# knijka-error.log holds six `ENOENT … .next/required-server-files.json`. And
# because success was declared the moment `pm2 restart` returned, a deploy that
# came up broken looked identical to one that came up fine. One did: staging
# was down from 23:03 on 07-19 to 10:24 on 07-20, ~11.5 hours, unnoticed.
#
# WHAT THIS SCRIPT DOES INSTEAD
#   1. Resolves the target from the `staging-green` tag that CI moves only
#      after the full gate passes — so a red commit is structurally
#      undeployable (see .github/workflows/ci.yml, job `deployable`).
#   2. Does ALL the slow, destructive work (checkout, npm ci, prisma generate,
#      next build) in a SEPARATE workspace. If any of it fails, the live
#      process has not been touched and staging never noticed.
#   3. Takes a database backup, then runs migrations.
#   4. Swaps the built artefacts into the live tree with hardlink-copy +
#      rename. The window where `.next` does not exist is one syscall, not
#      two and a half minutes.
#   5. Restarts, then ASKS THE NEW PROCESS whether it can serve, by polling
#      /api/health until it answers 200 *reporting the target commit* — proof
#      the swap took effect, not just that a restart returned.
#   6. If it never answers: puts the previous build back and restarts again.
#
# Exit codes (autodeploy.sh depends on these):
#   0  deployed and healthy, or already live (nothing to do)
#   1  deploy failed — the previous build has been restored
#   2  refused before touching anything (bad args, no target, low disk)
#   3  the new build serves but the DATABASE is unreachable. Deliberately NOT
#      rolled back: the old build faces the same database, so a rollback would
#      add downtime without fixing anything. This one needs a human.
#
# Usage:  deploy.sh [<git-ref-or-sha>]      # default: the staging-green tag
#         KNIJKA_FORCE=1 deploy.sh          # redeploy even if already live
# =============================================================================
set -euo pipefail

# --- configuration (every value overridable so the test harness can run this
#     script for real against a sandbox instead of re-implementing it) --------
APP_ROOT="${KNIJKA_APP_ROOT:-/opt/knijka}"
BUILD_ROOT="${KNIJKA_BUILD_ROOT:-/opt/knijka-build}"
STATE_DIR="${KNIJKA_STATE_DIR:-/var/lib/knijka-deploy}"
PM2_APP="${KNIJKA_PM2_APP:-knijka}"
HEALTH_URL="${KNIJKA_HEALTH_URL:-http://127.0.0.1:3100/api/health}"
DEPLOY_REF="${KNIJKA_DEPLOY_REF:-staging-green}"
GIT_REMOTE="${KNIJKA_GIT_REMOTE:-origin}"
BACKUP_SCRIPT="${KNIJKA_BACKUP_SCRIPT:-$(dirname "$0")/backup-db.sh}"
# The first boot of a Next build is not instant (route compilation, prisma
# engine load). 120 s is generous; the gate polls, so a fast boot exits early.
HEALTH_TIMEOUT_SEC="${KNIJKA_HEALTH_TIMEOUT_SEC:-120}"
HEALTH_INTERVAL_SEC="${KNIJKA_HEALTH_INTERVAL_SEC:-2}"
# A build that runs out of disk halfway leaves a corrupt .next — and the
# hardlink swap needs room for one extra copy of the artefacts.
MIN_FREE_MB="${KNIJKA_MIN_FREE_MB:-3000}"

# pm2 stores its process table under $HOME. Under cron HOME is often unset,
# and `pm2 restart` then talks to an EMPTY daemon and exits non-zero — that is
# the real reason the one aborted deploy in the audit failed. Pin it.
export HOME="${HOME:-/root}"

LIVE_PLATFORM="$APP_ROOT/platform"
BUILD_PLATFORM="$BUILD_ROOT/platform"

# Artefacts that make up "the build". All three are gitignored, so `git reset`
# never touches them and they must be moved deliberately:
#   .next               the compiled server + client output
#   node_modules        runtime externals; must match the build that used them
#   src/generated       the Prisma client + query engine, generated per schema
SWAP_PATHS=(".next" "node_modules" "src/generated")

log() { printf '%s deploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

# --- rollback bookkeeping ----------------------------------------------------
# Set once the live tree has been modified; cleared on success. The EXIT trap
# uses it so that an unexpected failure mid-swap rolls back too, not just the
# failures we thought to check for.
LIVE_MUTATED=0
DEPLOY_OK=0
PREVIOUS_SHA=""

on_exit() {
  local status=$?
  if [ "$DEPLOY_OK" -eq 0 ] && [ "$LIVE_MUTATED" -eq 1 ]; then
    rollback
    status=1
  fi
  exit "$status"
}

rollback() {
  log "ROLLING BACK to ${PREVIOUS_SHA:-previous build}"
  local rel live
  for rel in "${SWAP_PATHS[@]}"; do
    live="$LIVE_PLATFORM/$rel"
    if [ -e "$live.prev" ]; then
      rm -rf "$live.failed"
      # Keep the failed artefacts rather than deleting them — the whole reason
      # H-17 stayed hidden for 11.5 hours is that the evidence was gone.
      if [ -e "$live" ]; then mv "$live" "$live.failed"; fi
      mv "$live.prev" "$live"
      log "  restored $rel"
    fi
  done
  # Source and public/ came from git, so git puts them back.
  if [ -n "$PREVIOUS_SHA" ]; then
    git -C "$APP_ROOT" reset --hard --quiet "$PREVIOUS_SHA" || \
      log "  WARNING: could not reset the live tree to $PREVIOUS_SHA"
  fi
  pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || \
    log "  WARNING: pm2 restart failed during rollback"

  # A rollback that does not restore service is the worst possible outcome to
  # discover later, so verify it here, while a human may still be watching.
  if wait_for_health "" >/dev/null; then
    log "  rollback verified: staging is serving the previous build"
  else
    log "  ALERT: rollback did NOT restore health — staging is DOWN, manual fix needed"
  fi
}

# --- health gate -------------------------------------------------------------
# $1 = the commit the answer must report, or "" to accept any healthy answer
# (used after a rollback, where we want service back, whatever version it is).
wait_for_health() {
  local want_sha="$1" deadline body
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SEC ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if body=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null); then
      # `ok:true` alone is not enough. The process could be the OLD one that
      # never died — which is precisely how a broken deploy looked healthy for
      # 11.5 hours. NEXT_PUBLIC_COMMIT_SHA is inlined by Next at BUILD time,
      # so seeing it in the response proves the new build is the one serving.
      if [ -z "$want_sha" ] || [ "${body#*\"commit\":\"$want_sha\"}" != "$body" ]; then
        printf '%s' "$body"
        return 0
      fi
    fi
    sleep "$HEALTH_INTERVAL_SEC"
  done
  return 1
}

# Distinguishes "this build cannot serve" (roll back) from "the database is
# down" (rolling back changes nothing and costs a restart). Returns 0 when the
# new build is demonstrably serving.
new_build_is_serving() {
  local want_sha="$1" body
  body=$(curl -fsS --max-time 5 "$HEALTH_URL?probe=liveness" 2>/dev/null) || return 1
  [ "${body#*\"commit\":\"$want_sha\"}" != "$body" ]
}

# --- swap --------------------------------------------------------------------
# Hardlink-copy then rename. `cp -al` costs no disk and takes a moment even for
# node_modules, because it only writes directory entries; `mv` within one
# filesystem is a rename, so the live artefact is replaced in a single syscall.
# The build workspace keeps its own copy, which is what makes the NEXT build
# incremental (.next/cache survives) — a shorter build is a smaller risk window.
swap_in() {
  local rel="$1"
  local live="$LIVE_PLATFORM/$rel" src="$BUILD_PLATFORM/$rel"
  [ -e "$src" ] || die "build produced no $rel — refusing to swap"

  rm -rf "$live.incoming"
  if ! cp -al "$src" "$live.incoming" 2>/dev/null; then
    # Hardlinks need one filesystem. Falling back to a real copy is slower but
    # still correct — and still swaps by rename, which is the point.
    log "  (hardlink copy unavailable for $rel — falling back to a full copy)"
    rm -rf "$live.incoming"
    cp -a "$src" "$live.incoming"
  fi

  # `.next/cache` is the one part of the build the LIVE process writes to
  # (ISR + image cache). Left hardlinked, staging's writes would land inside
  # the build workspace and quietly corrupt the next build's cache. Unlink it.
  if [ "$rel" = ".next" ]; then
    rm -rf "$live.incoming/cache"
    mkdir -p "$live.incoming/cache"
  fi

  rm -rf "$live.prev"
  if [ -e "$live" ]; then mv "$live" "$live.prev"; fi
  mv "$live.incoming" "$live"
}

# =============================================================================
main() {
  [ -d "$APP_ROOT/.git" ] || die "$APP_ROOT is not a git worktree"
  [ -d "$BUILD_ROOT/.git" ] || die "$BUILD_ROOT is not a git worktree (see tools/deploy/README.md)"
  mkdir -p "$STATE_DIR"

  # ---- resolve the target ----------------------------------------------------
  git -C "$BUILD_ROOT" fetch --quiet --tags --force "$GIT_REMOTE" || \
    die "could not fetch $GIT_REMOTE"

  local requested="${1:-$DEPLOY_REF}" target
  target=$(git -C "$BUILD_ROOT" rev-list -n 1 "$requested" 2>/dev/null) || true
  [ -n "$target" ] || die "cannot resolve '$requested' — has CI moved the $DEPLOY_REF tag yet?"

  # What is live now, as recorded by the last *health-verified* deploy. The
  # live tree's HEAD is not the authority: the old script advanced HEAD before
  # it knew whether the deploy worked, which is how a failure erased its own
  # evidence.
  PREVIOUS_SHA=$(cat "$STATE_DIR/deployed_sha" 2>/dev/null || git -C "$APP_ROOT" rev-parse HEAD)

  if [ "$target" = "$PREVIOUS_SHA" ] && [ "${KNIJKA_FORCE:-0}" != "1" ]; then
    log "already live: ${target:0:12} — nothing to do"
    return 0
  fi
  log "deploying ${target:0:12} (live: ${PREVIOUS_SHA:0:12})"

  # ---- preflight -------------------------------------------------------------
  local free_mb
  free_mb=$(df -Pm "$APP_ROOT" | awk 'NR==2 {print $4}')
  [ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] || \
    die "only ${free_mb}MB free under $APP_ROOT (need ${MIN_FREE_MB}MB) — a build that runs out of disk leaves a corrupt .next"

  # ---- build, entirely off to the side ---------------------------------------
  # Nothing below touches the live process until the swap. A failure here is a
  # non-event for staging: it keeps serving the previous build.
  log "building in $BUILD_ROOT"
  git -C "$BUILD_ROOT" checkout --quiet --detach "$target"
  git -C "$BUILD_ROOT" reset --hard --quiet "$target"

  # `npm ci` deletes node_modules. That is safe HERE (the live copy is a
  # separate set of directory entries — unlinking these leaves those intact)
  # and it was never safe in the live tree. Skip it when the lockfile has not
  # moved: a shorter deploy is a smaller window.
  local lock_hash stamp="$BUILD_ROOT/.deps-stamp"
  lock_hash=$(sha256sum "$BUILD_PLATFORM/package-lock.json" | cut -d' ' -f1)
  if [ ! -d "$BUILD_PLATFORM/node_modules" ] || [ "$lock_hash" != "$(cat "$stamp" 2>/dev/null || true)" ]; then
    log "  npm ci (lockfile changed)"
    ( cd "$BUILD_PLATFORM" && npm ci --no-audit --no-fund )
    printf '%s' "$lock_hash" > "$stamp"
  else
    log "  npm ci skipped (lockfile unchanged)"
  fi

  ( cd "$BUILD_PLATFORM" && npx prisma generate )
  # Baked in at build time so /api/health can prove WHICH build is answering.
  ( cd "$BUILD_PLATFORM" && NEXT_PUBLIC_COMMIT_SHA="$target" npm run build )
  log "  build ok"

  # ---- backup, then migrate --------------------------------------------------
  # Before the schema changes, not after: a migration is the single most
  # likely way to lose student data, and it is the one moment a backup is
  # guaranteed to be worth its disk. A failure here still leaves staging on
  # the old build.
  if [ -x "$BACKUP_SCRIPT" ]; then
    log "  pre-migration backup"
    "$BACKUP_SCRIPT" "pre-deploy-${target:0:12}" || die "pre-migration backup failed — refusing to migrate"
  else
    log "  WARNING: no backup script at $BACKUP_SCRIPT — migrating unprotected"
  fi
  ( cd "$BUILD_PLATFORM" && npx prisma migrate deploy )

  # The live tree needs the target's objects before it can be moved onto them.
  # Fetching is a network call and network calls fail, so it happens HERE —
  # outside the swap window — rather than in the middle of it.
  git -C "$APP_ROOT" fetch --quiet --tags --force "$GIT_REMOTE"

  # ---- swap ------------------------------------------------------------------
  trap on_exit EXIT
  LIVE_MUTATED=1
  log "swapping the build into $LIVE_PLATFORM"
  local rel
  for rel in "${SWAP_PATHS[@]}"; do swap_in "$rel"; done
  # Source and public/. `next start` never reads src/, but it does serve
  # public/ from disk, so the live tree has to carry the new assets.
  git -C "$APP_ROOT" reset --hard --quiet "$target"

  pm2 restart "$PM2_APP" --update-env >/dev/null

  # ---- verify ----------------------------------------------------------------
  log "waiting for $HEALTH_URL to report ${target:0:12}"
  if wait_for_health "$target" >/dev/null; then
    DEPLOY_OK=1
    LIVE_MUTATED=0
    printf '%s' "$target" > "$STATE_DIR/deployed_sha"
    rm -f "$STATE_DIR/fail_sha" "$STATE_DIR/fail_count" "$STATE_DIR/next_attempt_at"
    # Only now are the previous artefacts safe to drop.
    for rel in "${SWAP_PATHS[@]}"; do rm -rf "$LIVE_PLATFORM/$rel.prev" "$LIVE_PLATFORM/$rel.failed"; done
    log "deployed ${target:0:12} — healthy"
    return 0
  fi

  if new_build_is_serving "$target"; then
    # The build is fine; the database is not. Rolling back would restart the
    # app for nothing and leave staging just as broken, one version older.
    DEPLOY_OK=1
    LIVE_MUTATED=0
    printf '%s' "$target" > "$STATE_DIR/deployed_sha"
    log "ALERT: ${target:0:12} is serving but /api/health reports the DATABASE unreachable."
    log "       NOT rolling back — a rollback cannot fix a database. Check Postgres."
    return 3
  fi

  log "health gate failed: no answer reporting ${target:0:12} within ${HEALTH_TIMEOUT_SEC}s"
  return 1 # the EXIT trap rolls back
}

main "$@"
