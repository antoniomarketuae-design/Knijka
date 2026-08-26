#!/bin/bash
# Supervised wave-c shard, v2.
#
# v1 fixed the 11-hour hang (a driver blocked on a dead Playwright browser with
# no timeout) and INTRODUCED A WORSE BUG while doing it: its reaper killed every
# ms-playwright process on the box, so each shard's startup executed the running
# browsers of its siblings. Two drives died in the same millisecond proving it —
# «Target page, context or browser has been closed» during loading-lesson.
# A repair that damages a neighbour is not a repair. v2 reaps ONLY the browser
# processes descended from THIS shard's own driver, and only when this shard is
# restarting a run it already declared hung.
set -u
SH="$1"; LIST="$2"; BASE="${3:-http://localhost:3460}"
REPO="E:/AI driver"
OUT="$REPO/.audit-frames/fill-$SH"
RES="$OUT/wave-c-results.jsonl"
LOG="$(dirname "$LIST")/f$SH.log"
STALL_S=1200         # measured: longest real drive is 510s, so 480 killed healthy work (lib/limits.mjs)
MAX_RESTARTS=12
cd "$REPO" || exit 1
count() { wc -l < "$RES" 2>/dev/null | tr -d ' ' || echo 0; }

# Kill only ms-playwright processes descended from $1 — never a sibling's, never
# the founder's Chrome (which is not under an ms-playwright path at all).
reap_descendants() {
  powershell.exe -NoProfile -Command "
    \$root = $1
    \$all = Get-CimInstance Win32_Process
    \$kids = @(\$root); \$i = 0
    while (\$i -lt \$kids.Count) {
      \$p = \$kids[\$i]
      \$all | Where-Object { \$_.ParentProcessId -eq \$p } | ForEach-Object { \$kids += \$_.ProcessId }
      \$i++
    }
    \$all | Where-Object { \$kids -contains \$_.ProcessId -and \$_.ExecutablePath -like '*ms-playwright*' } |
      ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
  " >/dev/null 2>&1
}

for attempt in $(seq 1 $MAX_RESTARTS); do
  node tools/mobile/wave-c.mjs --base "$BASE" --out "$OUT" --lessons "$(cat "$LIST")" >> "$LOG" 2>&1 &
  PID=$!
  # Windows PID of the node process, for the descendant walk.
  WPID=$(powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*fill-$SH*' } | Select-Object -First 1).ProcessId" 2>/dev/null | tr -d '\r ')
  last=$(count); idle=0; stalled=0
  while kill -0 "$PID" 2>/dev/null; do
    sleep 30
    n=$(count)
    if [ "$n" != "$last" ]; then last=$n; idle=0; else idle=$((idle + 30)); fi
    if [ "$idle" -ge "$STALL_S" ]; then
      stalled=1
      echo "[supervisor] shard $SH STALLED at $n rows for ${idle}s — killing and resuming (attempt $attempt)" >> "$LOG"
      kill -9 "$PID" 2>/dev/null
      [ -n "$WPID" ] && reap_descendants "$WPID"
      break
    fi
  done
  wait "$PID" 2>/dev/null
  if [ "$stalled" -eq 0 ]; then
    echo "[supervisor] shard $SH exited on its own at $(count) rows" >> "$LOG"
    break
  fi
done
echo "[supervisor] shard $SH FINAL $(count) rows" >> "$LOG"
