#!/usr/bin/env bash
# =============================================================================
# Книжка.AI database backup. (audit 2026-07-24, finding H-17 — the backup gap)
#
# Before this script the only copy of every student's progress, exam attempts
# and entitlements was one Postgres instance on one VPS, and `prisma migrate
# deploy` ran against it unattended, from cron, every five minutes. There was
# nothing to restore from.
#
# Three rules this script exists to enforce:
#
#   1. A dump that has not been read back is not a backup. Every dump is
#      verified with `pg_restore --list` before it is allowed to count — that
#      catches the truncated file (disk full mid-dump), which is the failure
#      mode that silently produces years of useless backups.
#   2. A backup on the same disk as the database is not a backup. This script
#      writes locally and the README explains the off-box pull; both halves
#      are required.
#   3. A backup taken after the damage is worthless. deploy.sh calls this
#      immediately before `prisma migrate deploy` — the one moment where a
#      restore point is guaranteed to be worth its disk.
#
# Usage:  backup-db.sh [label]     # label defaults to "scheduled"
# Exit:   0 verified dump written · non-zero nothing usable was produced
#         (deploy.sh treats that as "do not migrate")
# =============================================================================
set -euo pipefail

BACKUP_DIR="${KNIJKA_BACKUP_DIR:-/var/backups/knijka}"
ENV_FILE="${KNIJKA_ENV_FILE:-/opt/knijka/platform/.env}"
# Everything from the last 14 days, plus a Sunday dump from each of the last
# 8 weeks. Small database, cheap dumps — the retention is about being able to
# answer "what did this look like a month ago", not about disk.
KEEP_DAYS="${KNIJKA_KEEP_DAYS:-14}"
KEEP_WEEKLY_DAYS="${KNIJKA_KEEP_WEEKLY_DAYS:-56}"
MIN_FREE_MB="${KNIJKA_BACKUP_MIN_FREE_MB:-500}"

LABEL="${1:-scheduled}"
# Only characters that are safe in a filename — the label reaches here from a
# deploy as "pre-deploy-<sha>", but never trust it blindly.
LABEL=$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '-')

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# --- credentials --------------------------------------------------------------
# DATABASE_URL lives in the app's .env, which is never in git (doc 61). Read
# just that one line rather than sourcing the file — sourcing would execute
# whatever else is in there and export the app's secrets into this process.
if [ -z "${DATABASE_URL:-}" ]; then
  [ -f "$ENV_FILE" ] || die "no DATABASE_URL and no $ENV_FILE to read it from"
  DATABASE_URL=$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" \
    | tail -n 1 | sed -e 's/^"//' -e "s/^'//" -e 's/"$//' -e "s/'$//")
fi
[ -n "$DATABASE_URL" ] || die "DATABASE_URL is empty"

# Split the URL into PG* environment variables instead of passing it as an
# argument. Arguments are visible in `ps` to every process on the box; the
# environment of a root process is not. Falls back to the URL when the shape
# is anything unusual (e.g. a percent-encoded password) — correctness first.
if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:/?#]+):([^@]*)@([^:/?#]+):([0-9]+)/([^?#]+) ]]; then
  export PGUSER="${BASH_REMATCH[2]}"
  export PGPASSWORD="${BASH_REMATCH[3]}"
  export PGHOST="${BASH_REMATCH[4]}"
  export PGPORT="${BASH_REMATCH[5]}"
  export PGDATABASE="${BASH_REMATCH[6]}"
  PG_TARGET=()
else
  log "connection string not in the expected shape — passing it to pg_dump directly"
  PG_TARGET=("$DATABASE_URL")
fi

# --- where -------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" # a dump of a minors' database is not world-readable (ADR-004)

free_mb=$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')
[ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] || \
  die "only ${free_mb}MB free under $BACKUP_DIR — a dump that runs out of disk is the silent-corrupt case this script exists to prevent"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
# Sunday dumps are the ones kept for weeks — tagging it in the NAME means the
# retention sweep is a filename match and cannot mis-date a file.
if [ "$(date -u +%u)" = "7" ] && [ "$LABEL" = "scheduled" ]; then
  KIND="weekly"
else
  KIND="daily"
fi
BASE="knijka-$STAMP-$KIND-$LABEL"
TMP="$BACKUP_DIR/.$BASE.dump.partial"
OUT="$BACKUP_DIR/$BASE.dump"

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

# --- dump --------------------------------------------------------------------
# --format=custom: compressed, and restorable table-by-table with pg_restore,
# which is what you actually want at 03:00 when one table is wrong.
# --no-owner/--no-privileges: restoring into a differently-named role (a local
# box, a new VPS) must not fail on grants that mean nothing there.
log "dumping to $OUT"
if ! pg_dump --format=custom --no-owner --no-privileges --file="$TMP" "${PG_TARGET[@]+"${PG_TARGET[@]}"}"; then
  die "pg_dump failed — NO usable backup was produced"
fi

# --- verify ------------------------------------------------------------------
# Reading the archive's table of contents proves the file is a complete,
# parseable custom-format dump. A truncated file fails here, which is the
# whole point: it must fail now, not during a restore.
if ! pg_restore --list "$TMP" > "$TMP.toc" 2>/dev/null; then
  rm -f "$TMP.toc"
  die "the dump did not verify (pg_restore --list failed) — discarding it"
fi
TABLES=$(grep -c 'TABLE DATA' "$TMP.toc" || true)
rm -f "$TMP.toc"
# An empty dump verifies happily. The staging database always has the User
# table at minimum, so zero table-data entries means we dumped the wrong thing.
[ "${TABLES:-0}" -gt 0 ] || die "the dump contains no table data — discarding it"

mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT
( cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" >> checksums.txt )
log "ok: $(basename "$OUT") ($(du -h "$OUT" | cut -f1), $TABLES tables)"

# --- retention ----------------------------------------------------------------
# Pruned only AFTER a good dump exists, so a run of failures can never leave
# the box with nothing.
find "$BACKUP_DIR" -maxdepth 1 -name 'knijka-*-daily-*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'knijka-*-weekly-*.dump' -mtime "+$KEEP_WEEKLY_DAYS" -delete
# Partial files from a killed run — they are hidden, so they would otherwise
# accumulate invisibly until the disk filled.
find "$BACKUP_DIR" -maxdepth 1 -name '.knijka-*.partial' -mtime +1 -delete
log "retention: $(find "$BACKUP_DIR" -maxdepth 1 -name 'knijka-*.dump' | wc -l) dumps kept"
