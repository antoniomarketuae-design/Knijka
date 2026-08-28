#!/usr/bin/env bash
# =============================================================================
# Pull the VPS database dumps down to the dev box. (audit 2026-07-24, H-17)
#
# backup-db.sh writes to /var/backups/knijka ON THE VPS. That protects against
# a bad migration and a fat-fingered DELETE — it does not protect against the
# thing most likely to actually end the company's data: losing the box. A
# backup that lives on the machine it is backing up is a snapshot, not a
# backup. This is the other half.
#
# -----------------------------------------------------------------------------
# WHY THIS FILE WAS REWRITTEN: IT HAD NEVER RUN. NOT ONCE.
#
# The old version defaulted DEST to $HOME/knijka-backups and `mkdir -p`'d it
# unconditionally on line 25, before any network call. That directory does not
# exist on the dev machine — which is proof the script had never been invoked
# at all, not even unsuccessfully. Every dump the company owns is on the VPS,
# and only on the VPS.
#
# Three changes make it a thing that can actually be run:
#
#   1. `rsync` IS NOT ON THIS BOX. Git Bash on Windows ships ssh and scp and no
#      rsync, so the old script's one transfer command died with `command not
#      found` under `set -e` — a two-word error for a script whose whole job is
#      the last line of defence. There is now an scp path that does the same
#      thing (never overwrite what is already here) when rsync is absent.
#   2. NOTHING IS CREATED UNTIL THE VPS HAS ANSWERED. The old order left an
#      empty $HOME/knijka-backups behind after a failed run, and an empty
#      directory with a plausible name is worse than no directory: it is what
#      "we have backups" looks like from the outside.
#   3. `--check` FAILS WHEN THE NEWEST LOCAL DUMP IS OLDER THAN 8 DAYS. The
#      README says "weekly"; eight days is that plus a day of slack. Without a
#      check, "I stopped running it in March" is indistinguishable from "it ran
#      last Sunday" until the day you need it.
#
# AND THE PART NO SCRIPT CAN DO FOR YOU: until a dump has been RESTORED, the
# recovery position is zero, not "backed up". The restore drill is in
# tools/deploy/README.md and it takes four commands.
# -----------------------------------------------------------------------------
#
# Usage:
#   bash tools/deploy/pull-backups.sh [local-destination]   # pull, then check
#   bash tools/deploy/pull-backups.sh --check [local-dest]  # check only
#
# Exit: 0 fine · 1 nothing usable locally / transfer failed · 2 refused before
#       touching anything (no ssh, no key, VPS unreachable)
# =============================================================================
set -euo pipefail

VPS="${KNIJKA_VPS:-root@213.218.160.60}"
KEY="${KNIJKA_SSH_KEY:-$HOME/.ssh/id_ed25519_flokinet}"
REMOTE_DIR="${KNIJKA_BACKUP_DIR:-/var/backups/knijka}"
# How stale the newest local dump may be before this script calls it a failure.
# The README says pull weekly; 8 days is weekly plus a day of slack.
MAX_AGE_DAYS="${KNIJKA_BACKUP_MAX_AGE_DAYS:-8}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30)

MODE="pull"
if [ "${1:-}" = "--check" ]; then
  MODE="check"
  shift
fi
# THE DEFAULT LANDS BESIDE THE CHECKOUT, NOT IN $HOME — 2026-08-28.
#
# It used to default to `$HOME/knijka-backups`, and on the dev box $HOME is on
# C: while the repo is on E:. C: had 12.9 GB free and had been down to 1.08 GB
# that week; E: had 669 GB. So the one script whose whole job is "get the data
# off the VPS" defaulted to the drive least able to hold it, and the reason
# given for not running it was the drive it happened to point at.
#
# Deriving the default from the repo root fixes that everywhere rather than on
# this machine: the dumps land next to the checkout, on whatever volume the
# checkout is on, on the second developer's box as well as this one.
# `KNIJKA_LOCAL_BACKUP_DIR` and the positional argument still win.
#
# WHAT THIS IS AND IS NOT. It protects against LOSING THE VPS, which is the
# failure this script exists for. It does NOT protect against losing the disk
# the repo is on — same drive, one hardware fault. A third copy somewhere off
# this machine is still owed, and the README says so.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${1:-${KNIJKA_LOCAL_BACKUP_DIR:-$(dirname "$REPO_ROOT")/knijka-backups}}"

log() { printf '%s pull-backups: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit "${2:-1}"; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- freshness ---------------------------------------------------------------
# The whole point of the check: say the true thing loudly. "There are no
# backups on this machine" and "the newest is from March" are both a company
# one disk away from having no history, and both used to be silent.

file_mtime() {
  # GNU (Linux, Git Bash) then BSD (macOS) — the two shells this ever runs in.
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

newest_dump() {
  [ -d "$DEST" ] || return 1
  # ls -t sorts by mtime; the glob is quoted so a directory with no dumps
  # produces nothing rather than the literal pattern.
  local newest
  newest=$(ls -t "$DEST"/knijka-*.dump 2>/dev/null | head -n 1 || true)
  [ -n "$newest" ] || return 1
  printf '%s' "$newest"
}

check_freshness() {
  if [ ! -d "$DEST" ]; then
    die "no backup directory at $DEST — this machine holds NO copy of the database. Every dump the company owns is on the VPS, and only on the VPS. Run: bash tools/deploy/pull-backups.sh"
  fi

  local newest age_days
  if ! newest=$(newest_dump); then
    die "$DEST exists but contains no knijka-*.dump — an empty backup directory is what 'we have backups' looks like from the outside. Run: bash tools/deploy/pull-backups.sh"
  fi

  age_days=$(( ( $(date +%s) - $(file_mtime "$newest") ) / 86400 ))
  if [ "$age_days" -gt "$MAX_AGE_DAYS" ]; then
    die "the newest local dump is ${age_days} days old ($(basename "$newest")) — older than the ${MAX_AGE_DAYS}-day limit. Everything since then exists on ONE machine."
  fi

  log "ok: newest local dump is ${age_days} day(s) old ($(basename "$newest"))"
  log "REMINDER: a dump that has never been restored is a belief, not a plan — see the restore drill in tools/deploy/README.md"
}

if [ "$MODE" = "check" ]; then
  check_freshness
  exit 0
fi

# --- preflight ---------------------------------------------------------------
# Every one of these used to be a bare `command not found` or a hung prompt
# under `set -e`. They are checked BEFORE anything is created, so a failed run
# leaves the disk exactly as it found it.

have ssh || die "no ssh on PATH — install OpenSSH (Git for Windows ships it)" 2
have scp || die "no scp on PATH — install OpenSSH (Git for Windows ships it)" 2
[ -f "$KEY" ] || die "no ssh key at $KEY — set KNIJKA_SSH_KEY to the right path" 2

log "checking that $VPS answers"
ssh -i "$KEY" "${SSH_OPTS[@]}" "$VPS" true 2>/dev/null \
  || die "cannot reach $VPS with $KEY (BatchMode: no password prompt, on purpose — a script that can block on a prompt is a script cron cannot run)" 2

# --- where -------------------------------------------------------------------
# Only now, after the VPS has answered. An empty directory created by a failed
# run is the single most misleading artefact this script could leave behind.
mkdir -p "$DEST"

# --- transfer ----------------------------------------------------------------
# Never --delete and never overwrite: this copy must survive the VPS deleting
# its own retention window, and must never be pruned by a remote decision.
if have rsync; then
  log "rsync from $VPS:$REMOTE_DIR"
  rsync -av --ignore-existing \
    -e "ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=30" \
    "$VPS:$REMOTE_DIR/"'knijka-*.dump' "$VPS:$REMOTE_DIR/checksums.txt" \
    "$DEST/"
else
  # THE PATH THAT ACTUALLY RUNS ON THE DEV BOX. Git Bash has no rsync.
  # Listing first, then copying only what is missing, reproduces
  # --ignore-existing exactly — scp on its own would overwrite a good local
  # dump with whatever the VPS holds today.
  log "no rsync — copying with scp instead"
  remote_files=$(ssh -i "$KEY" "${SSH_OPTS[@]}" "$VPS" \
    "ls -1 $REMOTE_DIR/knijka-*.dump 2>/dev/null || true")
  copied=0
  while IFS= read -r remote; do
    [ -n "$remote" ] || continue
    base=$(basename "$remote")
    if [ -f "$DEST/$base" ]; then continue; fi
    log "  $base"
    scp -q -i "$KEY" "${SSH_OPTS[@]}" "$VPS:$remote" "$DEST/$base" \
      || die "scp failed on $base"
    copied=$((copied + 1))
  done <<< "$remote_files"
  # checksums.txt is the one file we DO refresh: it accumulates on the VPS and
  # the newest copy verifies every dump, old ones included.
  scp -q -i "$KEY" "${SSH_OPTS[@]}" "$VPS:$REMOTE_DIR/checksums.txt" "$DEST/checksums.txt" \
    || log "WARNING: no checksums.txt on the VPS — dumps cannot be verified"
  log "copied $copied new dump(s)"
fi

# --- verify ------------------------------------------------------------------
# Verify what we just pulled rather than trusting the transfer. A silently
# truncated copy is exactly as useless as no copy, and twice as reassuring.
if have sha256sum && [ -f "$DEST/checksums.txt" ]; then
  ( cd "$DEST" && sha256sum --check --ignore-missing --quiet checksums.txt ) \
    && log "checksums verified" \
    || die "CHECKSUM MISMATCH in $DEST — do not trust these dumps"
else
  log "WARNING: no sha256sum or no checksums.txt — dumps were NOT verified"
fi

log "$(find "$DEST" -maxdepth 1 -name 'knijka-*.dump' | wc -l) dumps in $DEST"

# --- and say whether that is actually good enough ----------------------------
check_freshness
