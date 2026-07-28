#!/usr/bin/env bash
# Upload locally-recorded clip media (gitignored — never in the repo) to the
# VPS and restart the app so Next re-scans public/. Run from the dev box after
# a recording/keyframe batch. Usage: bash tools/upload-clips.sh
set -euo pipefail
LOCAL="E:/AI driver/platform/public/clips"
VPS="root@213.218.160.60"
KEY="$HOME/.ssh/id_ed25519_flokinet"
SSH="ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15"
echo "uploading $(ls "$LOCAL"/*.png "$LOCAL"/*.webm "$LOCAL"/manifest.json 2>/dev/null | wc -l) files..."
scp -i "$KEY" -o BatchMode=yes "$LOCAL"/*.png "$LOCAL"/*.webm "$LOCAL"/manifest.json \
  "$VPS":/opt/knijka/platform/public/clips/
# Next 16 caches the public/ file list at startup — restart to pick up new files.
$SSH "$VPS" 'pm2 restart knijka --update-env >/dev/null 2>&1 && echo restarted'
echo "clips live on staging."
