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
# Run it from the dev machine (Git Bash on Windows is fine), not from cron on
# the VPS. Pulling is deliberately the direction of travel: the VPS never gets
# credentials to write anywhere else, so a compromise of the VPS cannot reach
# the backups.
#
# Usage: bash tools/deploy/pull-backups.sh [local-destination]
# =============================================================================
set -euo pipefail

VPS="${KNIJKA_VPS:-root@213.218.160.60}"
KEY="${KNIJKA_SSH_KEY:-$HOME/.ssh/id_ed25519_flokinet}"
REMOTE_DIR="${KNIJKA_BACKUP_DIR:-/var/backups/knijka}"
DEST="${1:-${KNIJKA_LOCAL_BACKUP_DIR:-$HOME/knijka-backups}}"

mkdir -p "$DEST"

# --ignore-existing, never --delete: this copy must survive the VPS deleting
# its own retention window, and must never be pruned by a remote decision.
rsync -av --ignore-existing \
  -e "ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=30" \
  "$VPS:$REMOTE_DIR/"'knijka-*.dump' "$VPS:$REMOTE_DIR/checksums.txt" \
  "$DEST/"

# Verify what we just pulled rather than trusting the transfer. A silently
# truncated copy is exactly as useless as no copy, and twice as reassuring.
if command -v sha256sum >/dev/null 2>&1 && [ -f "$DEST/checksums.txt" ]; then
  ( cd "$DEST" && sha256sum --check --ignore-missing --quiet checksums.txt ) \
    && echo "checksums verified" \
    || { echo "CHECKSUM MISMATCH in $DEST — do not trust these dumps" >&2; exit 1; }
fi

echo "$(find "$DEST" -maxdepth 1 -name 'knijka-*.dump' | wc -l) dumps in $DEST"
