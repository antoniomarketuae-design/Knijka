#!/usr/bin/env bash
# INVARIANT 2 PREFLIGHT — run this before dispatching ANY sweep.
# On 2026-08-24 twelve of twelve drives returned exit=0 with byte-identical
# frames because the harness was photographing the PAYWALL: prisma dev had died,
# its port had moved, the schema was 21 days behind, and the cached session
# validated identity but not authority. Nothing in wave-c-results.jsonl looked
# wrong. This script refuses to let that happen silently.
set -u
cd "E:/AI driver" || exit 1

fail() { echo "PREFLIGHT FAILED: $*"; exit 1; }

echo "=== 1. commit under test ==="
HEAD_SHA=$(git rev-parse HEAD)
echo "  HEAD           : $(git rev-parse --short HEAD)"
echo "  tree dirty     : $(git status --porcelain | wc -l)  (MUST be 0 — drives certify against the worktree hash)"
[ "$(git status --porcelain | wc -l)" -eq 0 ] || fail "the tree is dirty; drives will not certify"

echo ""
echo "=== 2. prisma dev — is it up, and on which port? ==="
(cd "E:/AI driver/platform" && ./node_modules/.bin/prisma dev ls) 2>&1 | sed 's/^/  /'
echo "  (if the port differs from platform/.env, repoint DATABASE_URL + SHADOW_DATABASE_URL —"
echo "   .env is gitignored so repointing moves NO worktree hash and breaks no certification)"

echo ""
echo "=== 3. find the dev server ==="
# THE PORT IS DISCOVERED, NOT GUESSED — 2026-08-28.
#
# This list used to end at 3200 with the note "remember 3000 is nexflow, a
# DIFFERENT product". On this box that is false and it cost a sweep: knijka's own
# dev server was on 3000, the preflight refused to see it, and `preview_start`
# then spawned a SECOND server because 3000 looked taken. Two Next servers on one
# 7200 rpm disk is the contention this repo already has a rule against — measured
# within a minute: /api/health went from db 127 ms to a 9.7 s TIMEOUT, which reads
# exactly like a dead database.
#
# So the port is now discovered by asking, and identity is established by the
# ANSWER rather than by the number: only a server that returns our own health
# shape counts, and it must attest a commit. Nexflow does not, so it can share the
# box without confusing anything. 3000 is checked LAST, so a purpose-started
# knijka rig still wins if one is up.
# THE CANDIDATES ARE DISCOVERED TOO — 2026-09-12.
#
# The note above says the port is discovered by asking. Only half of that was
# true: identity came from the answer, but the CANDIDATES were nine numbers
# typed into this file. Today autoPort handed the dev server 63269 (3000 was
# held by a dying process) and this loop reported no server while a healthy one
# answered our own health shape — the 2026-08-28 failure again, one layer down.
#
# Known ports first, so a purpose-started rig still wins; then every other
# LISTENING port on the box. Identity is unchanged and is what makes this safe:
# only a server returning our health shape WITH a `commit` field counts, so
# probing a stranger costs one short curl and can never be mistaken for ours.
LISTENING=$(netstat -ano 2>/dev/null |
  sed -n 's/.*TCP[[:space:]]*[0-9.]*:\([0-9][0-9]*\)[[:space:]].*LISTENING.*/\1/p' |
  sort -u -n)
PORT=""
for p in 3460 3461 3462 3470 3480 3500 3200 3411 3000 $LISTENING; do
  # 2 s, not 4: the candidate list is now dozens long and a stranger's port
  # that accepts a connection and never replies would stall the whole
  # preflight. Our own /api/health answers in well under a second warm; the
  # commit-match check below is what catches a server that is merely slow.
  H=$(curl -s -m 2 "localhost:$p/api/health" 2>/dev/null) || continue
  # `commit` is the discriminator: it is ours, and it is what invariant 2 needs.
  case "$H" in *'"commit"'*) PORT=$p; break;; esac
done
[ -n "$PORT" ] || fail "no server answering OUR /api/health (one carrying a \"commit\" field) on any known port — start it with the platform launch config, and check nothing else already holds the port"
echo "  answering on port $PORT"

echo ""
echo "=== 3b. is the build cache POISONED? ==="
# THE POISONED BUILD CACHE, AND WHY THE CLOCK IS THE TEST — 2026-09-11.
#
# Measured four times in one day: /api/health answers perfectly while /login
# returns 500, and a RESTART DOES NOT FIX IT. Only deleting platform/.next does.
# Each time warm-sim.mjs discovered it by hanging in a retry loop against a route
# that was never coming back; the first occurrence cost an hour.
#
# The tell is the RESPONSE TIME, not the status code. A slow 500 is Turbopack
# compiling or a route that genuinely throws — both are real and neither is this.
# A fast 500 is a CACHED failure that will never be retried.
#
# This reports and does not delete: .next is 2+ GB and clearing it costs a ~140 s
# cold compile, which is the operator's decision and not a preflight's.
LG_START=$(date +%s%N)
# A SHORT BUDGET IS THE POINT, NOT A COMPROMISE. The only thing this looks for is
# a 500 that arrives FAST. A cached Turbopack failure answers in tens of
# milliseconds; a real compile takes ~140 s and a real throw still has to render.
# So 3 s is generous for the bug and cheap for everyone else — and anything that
# does NOT answer in 3 s is by definition not the fast 500 this guard exists for.
# (Measured 2026-09-11: a 30 s budget just timed out on every cold server and
# taught us nothing, while curl printed 000 and the || fallback appended another,
# giving a 000000 that could never equal 500.)
LG_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "localhost:$PORT/login" 2>/dev/null)
[ -n "$LG_CODE" ] || LG_CODE=000
LG_MS=$(( ($(date +%s%N) - LG_START) / 1000000 ))
echo "  /login -> $LG_CODE in ${LG_MS}ms"
if [ "$LG_CODE" = "000" ]; then echo "  (no answer inside 3s — that is a compile or a slow route, never the cached failure)"; fi
# ── WHY THE VERDICT IS THE PANIC AND NOT THE CLOCK — corrected 2026-09-12 ──
#
# This check used to rule on RESPONSE TIME: under 2 s meant a cached failure,
# over meant a real compile. The fifth occurrence broke that on the day it was
# measured — /login 500 in 5,638 ms and / 500 in 11,049 ms, both POISONED, both
# comfortably past the threshold, and /(dashboard)/simulator poisoned with them,
# which is the sweep's whole target. The old rule would have dispatched 131
# drives at an error page.
#
# The clock was only ever a proxy. On a 7200 rpm HDD carrying 185 worktrees and
# eight concurrent repair lanes, a CACHED failure is served slowly too. The real
# evidence has been in the dev-server log every time, naming its own subsystem:
#   Execution of PostCssTransformedAsset::process failed
#   - timeout while receiving message from process / deadline has elapsed
# So that is what is read. Timing is still printed, as a fact and not a verdict.
# ${VAR:-} because this script runs under `set -u` and TMPDIR is UNSET in Git
# Bash. Without the default the substitution below died, PANIC_LOG came back
# empty, and this guard silently did nothing on its first real run — a check
# that cannot fire, which is the thing this file keeps being repaired for.
PANIC_LOG=$(ls -t /tmp/next-panic-*.log "${TMPDIR:-/nonexistent}"/next-panic-*.log \
  "${LOCALAPPDATA:-/nonexistent}"/Temp/next-panic-*.log 2>/dev/null | head -1)
# HOW OLD IS THE PANIC, AND IS IT EVEN ABOUT THIS SERVER?
#
# Clearing platform/.next does NOT delete the panic log, and the remedy this
# guard prints ends in a ~140 s cold compile — during which /login answers
# nothing inside the 3 s probe and LG_CODE is 000. Without this, the first
# preflight after a SUCCESSFUL repair would read the old panic beside a healthy
# server and refuse the sweep, forever, since nothing removes that file.
#
# uptimeSec makes it exact instead of a guess: a panic written before this
# process started belongs to a server that no longer exists.
SRV_UPTIME=$(curl -s -m 8 "localhost:$PORT/api/health" 2>/dev/null |
  sed -n 's/.*"uptimeSec":[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)
SRV_UPTIME="${SRV_UPTIME:-0}"
PANIC_FRESH=0
if [ -n "$PANIC_LOG" ]; then
  PANIC_AGE=$(( $(date +%s) - $(date -r "$PANIC_LOG" +%s 2>/dev/null || echo 0) ))
  echo "  newest Turbopack panic log: $PANIC_LOG (${PANIC_AGE}s old; this server is ${SRV_UPTIME}s old)"
  # +60 s only because uptimeSec is whole seconds and the probe itself costs
  # time — not to soften the test.
  if [ "$PANIC_AGE" -le $(( SRV_UPTIME + 60 )) ]; then
    PANIC_FRESH=1
  else
    echo "  (that panic predates this server process — it is evidence about a server that no longer exists, so it is ignored)"
  fi
fi
if [ "$LG_CODE" = "500" ] || [ "$LG_CODE" = "000" ]; then
  # Only a 500/no-answer is worth investigating; a healthy route needs no log.
  if [ "$PANIC_FRESH" = "1" ] && grep -q "PostCssTransformedAsset" "$PANIC_LOG" 2>/dev/null; then
    fail "/login returned $LG_CODE and $PANIC_LOG carries the PostCSS panic (PostCssTransformedAsset::process failed — deadline has elapsed). This is the POISONED BUILD CACHE, five occurrences since 2026-09-10, and A RESTART DOES NOT CLEAR IT. Stop the dev server, delete platform/.next, start it again, then re-run this preflight. Expect a ~140 s cold compile. It poisons /(dashboard)/simulator too, so a sweep dispatched now photographs an error page on every drive."
  fi
  echo "  (500/no-answer, but no PostCSS panic in the log — treat as a real compile or a real throw, and warm it)"
fi

echo "=== 4. health must say db.ok AND match HEAD ==="
H=$(curl -s -m 20 "localhost:$PORT/api/health")
echo "  $H" | head -c 600; echo ""
# PARSED, NOT GREPPED — and this is not style, it is the bug of 2026-09-12.
#
# This line was `grep -q '"ok":true'` over the whole document. /api/health
# nests its checks, so that pattern matched `"migrations":{"ok":true}` while
# the TOP-LEVEL ok was false and db.ok was false with error "timeout". The
# guard passed and handed a broken database to the canary — the exact
# 2026-08-24 failure (twelve drives, exit=0, all photographing the paywall)
# that step 4 was written to prevent. A flat grep over nested JSON cannot fail
# as long as anything at any depth reports true.
#
# Each field is now named, and the latency is printed so a slow-but-alive
# database reads differently from a dead one.
HEALTH=$(printf '%s' "$H" | node -e '
  let d = "";
  process.stdin.on("data", (c) => (d += c)).on("end", () => {
    let j;
    try { j = JSON.parse(d); } catch { console.log("PARSE_FAIL"); return; }
    const db = (j.checks && j.checks.db) || {};
    const mg = (j.checks && j.checks.migrations) || {};
    console.log([
      "top=" + (j.ok === true),
      "db=" + (db.ok === true),
      "dbms=" + (db.latencyMs === undefined ? "?" : db.latencyMs),
      "dberr=" + (db.error || "none"),
      "mig=" + (mg.ok === true),
      "commit=" + (j.commit || "none"),
    ].join(" "));
  });
')
echo "  parsed: $HEALTH"
case "$HEALTH" in
  PARSE_FAIL*)
    fail "/api/health did not return JSON — the server is answering but not with our health shape" ;;
esac
case "$HEALTH" in
  *"db=false"*)
    fail "db.ok is FALSE ($HEALTH) — a drive now photographs the paywall and still exits 0, which is invariant 2. Check prisma dev is alive and that platform/.env DATABASE_URL points at the port it actually reports (prisma dev moves it on restart), then: cd platform && ./node_modules/.bin/prisma db push && npm run seed:founder  (NEVER npx from the repo root — it fetches prisma 8 RC over the pinned 7.8.0)" ;;
esac
case "$HEALTH" in
  *"top=false"*)
    fail "the health route reports ok:false overall ($HEALTH) — db is fine, so something else in the readiness set is not. Read the JSON above before dispatching." ;;
esac
echo "$H" | grep -q "${HEAD_SHA:0:7}" || fail "the server attests a DIFFERENT commit than HEAD — restart it (~10 min) or every drive exits EXIT_TARGET_UNVERIFIED"

echo ""
echo "=== 5. clear any stale session cookie ==="
echo "  a cookie minted while the DB was broken sails past sign-in and lands on the 21,99 EUR page"
rm -rf "${TMPDIR:-/tmp}/knijka-mobile-session" 2>/dev/null
echo "  cleared"

echo ""
echo "=== 6. ONE CANARY must return a real verdict before dispatching the fleet ==="
# THE CANARY DRIVES INTO A FRESH DIRECTORY, EVERY TIME — 2026-08-28.
#
# It used to reuse `.audit-frames/canary-w1`. `wave-c.mjs` skips a lesson it has
# already measured at the attested commit, so on the second run onward the canary
# printed "0 lesson(s) · 0 drive(s) to run" and then READ THE OLD ROW — and the
# check reported on a drive that never happened. Caught when a stale row surfaced
# `reachedVerdictCard=undefined`, a field that postdates it, and the preflight
# refused a healthy server on the strength of a measurement from another day.
#
# That is this programme's own recurring failure — a verdict certified against
# evidence that is not from this run — arriving inside the very check written to
# stop it. A canary that can pass or fail on last week's drive is not a canary.
#
# The directory is stamped with the commit and the clock, so a re-run cannot
# collide with itself, and it is removed first in case one ever does.
export REPO_JSON="E:/AI driver/.audit-frames/waveC-redrive.json"
CANARY_DIR=".audit-frames/canary-$(git rev-parse --short HEAD)-$(date -u +%H%M%S)"
rm -rf "$CANARY_DIR"
# THE CANARY DRIVES A LESSON FROM THE ACTUAL SET, not a hardcoded favourite.
# It was pinned to sc-zebra-approach. `wave-c.mjs` filters `--lessons` against
# waveC-redrive.json, and that lesson is not in every set — so on 2026-08-28 the
# canary resolved to ZERO lessons, drove nothing, and the preflight then refused a
# perfectly healthy server for "the paywall signature". A check that fails when it
# cannot run is worse than one that is absent: it sends you to debug the server.
#
# Taking the FIRST ROW of the set means the canary exercises the same path the
# fleet is about to take, on a lesson the fleet actually wants, and it cannot
# filter itself out of existence.
# …BUT NOT A LESSON THAT CANNOT BE DRIVEN. Added 2026-09-08.
#
# Taking j[0] blindly has the opposite failure: on this day the first row was
# sc-park-wall, which had exited 7 in w27 and timed out here, so the canary
# refused a server whose db answered in 5 ms and whose sign-in measured 5/5.
# The canary exists to prove the INFRASTRUCTURE works — server, database,
# session, route compile — not to re-test a lesson the fleet already knows is
# sick. A broken lesson blocking the whole sweep is the same class of error as
# the hardcoded favourite above: a check that fails when it cannot run.
#
# So: prefer the first row that HAS RECENTLY PRODUCED A JUDGEABLE DRIVE (exit 0
# in the newest sweep that holds one), and fall back to j[0] when no history
# exists — a fresh corpus still gets a canary, and it still cannot filter
# itself out of existence because every candidate comes from the set.
CANARY_LESSON=$(node -e "
const fs=require(String.fromCharCode(102,115));
const path=require(String.fromCharCode(112,97,116,104));
const j=require(process.env.REPO_JSON);
if(!j.length){process.exit(3)}
const inSet=new Set(j.map(x=>x.lesson));
const root='.audit-frames';
let healthy=new Set();
try{
  const dirs=fs.readdirSync(root).filter(d=>/^w[0-9]+$/.test(d))
    .sort((a,b)=>Number(b.slice(1))-Number(a.slice(1)));
  for(const d of dirs){
    const f=path.join(root,d,'wave-c-results.jsonl');
    if(!fs.existsSync(f))continue;
    const rows=fs.readFileSync(f,'utf8').split(String.fromCharCode(10)).filter(Boolean)
      .map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const ok=rows.filter(r=>r.exit===0&&inSet.has(r.lesson)).map(r=>r.lesson);
    if(ok.length){healthy=new Set(ok);break}
  }
}catch{}
const pick=j.find(x=>healthy.has(x.lesson))||j[0];
console.log(pick.lesson);
" 2>/dev/null)
[ -n "$CANARY_LESSON" ] || fail "waveC-redrive.json is empty or unreadable — there is nothing to sweep"
# The leg must come from the row we actually picked, not from j[0] — those are
# no longer the same row.
export CANARY_LESSON
CANARY_LEG=$(node -e "
const j=require(process.env.REPO_JSON);
const row=j.find(x=>x.lesson===process.env.CANARY_LESSON)||j[0];
const l=row.legs||[];
console.log(l.length?l[0]:String.fromCharCode(112,99,45,114,105,103,104,116));
" 2>/dev/null)
echo "  canary lesson: $CANARY_LESSON / $CANARY_LEG   (from the set, preferring one with a recent judgeable drive)"
node tools/mobile/wave-c.mjs --base "http://localhost:$PORT" --lessons "$CANARY_LESSON" --legs "$CANARY_LEG" --out "$CANARY_DIR"
CAN=$?
echo "  canary exit: $CAN"
echo "  canary dir : $CANARY_DIR"
[ $CAN -eq 0 ] || fail "canary drive failed (exit $CAN)"
V=$(CANARY_DIR="$CANARY_DIR" node "E:/AI driver/.audit-frames/wave-scripts/canary-verdict.mjs" 2>/dev/null)
echo "  canary verdict: $V"
case "$V" in
  OK*) echo "" ; echo "PREFLIGHT PASSED — safe to dispatch the sweep." ;;
  *) fail "canary did not produce a judgeable drive — do NOT dispatch. $V" ;;
esac
