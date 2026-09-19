// -----------------------------------------------------------------------------
// reclosure.mjs — A ROW A VERIFIER OPENED MAY NOT BE RE-CLOSED ON UNCHANGED CODE.
//
// THE CLASS. A verify pass overturns a closure. A later judge reads a fresh
// frame, quotes it honestly, and closes the row again — on product code that did
// not change in between. Every part looks correct in isolation, which is why it
// is invisible without a check: the frame is real, the quote is real, and the
// symptom really did stop appearing.
//
// WHY THE SYMPTOM CAN VANISH WITHOUT A REPAIR. Commit bc7d43f taught the harness
// to rest every 45 m, hold a pace, and press the product's own play button.
// `sc-speed-dangerous` went from 19 full stops and a collision to 2 stops and a
// clean run ON BYTE-IDENTICAL PRODUCT CODE. A better DRIVER moves verdicts.
// Crediting that to a repair is the dead-predicate class's twin — there a repair
// ships a measurement nothing reads; here a measurement changes and is credited
// to a repair that never happened. Both move the ledger without moving the
// product, and both fail in the reassuring direction.
//
// It cost the w17 round five rows, and 74% of that round's closures died when
// they were finally attacked.
//
// HOW A BUILD IS DERIVED, since verdict lines cannot say. Of 6,353 verdict lines
// `head` appears on 47. But every sweep directory attests exactly ONE commit
// (101 of 102 do), so the frame path names the build:
//     .audit-frames/<sweep>/frames/... -> that sweep's attested head.
// A directory that mixed two builds resolves to null rather than guessing: a
// guess here certifies against a state that never existed.
//
// ...AND THE SWEEP WAS THE WRONG UNIT — 2026-09-19. The per-sweep vote left 13
// re-closures (8 of them critical) with no nameable build, and the evidence was
// already on disk: every one of the 10,994 result lines in this corpus carries
// BOTH the commit it drove (`head`) and the exact directory it wrote (`out`).
// Keyed by directory those 10,994 lines resolve 10,760 distinct drive
// directories with ZERO disagreements, so the finer key loses nothing and
// dissolves the case the coarse one can only ever refuse: `proof` — 191 lines at
// dd4e5983, 4 at 641a4475 — had all 195 of its drives refused for it, including
// the 191 that agree. A drive directory is what the driver itself wrote down at
// the time.
//   A mixed sweep is RARE, not ordinary: an earlier draft of this note called it
//   "an ordinary thing" and the measurement says 1 of 303 sweeps, 0.33%. Rarity
//   is not the argument, though — the argument is that the coarse key refuses
//   191 drives that agree with each other in order to be unsure about 4.
//   CORROBORATION, and it was nearly thrown away: all 195 of `proof`'s own
//   `_audit-status.json` files carry `target.head` AND `targetAtEnd.head`, and
//   195 of 195 agree with their results line. A first pass reported that field
//   absent after dumping only top-level keys, and so discarded the strongest
//   second source this change has — the drive's own written record, taken
//   independently of the results file being keyed here.
//   (measured: tools/audit/reclosure.mjs headMaps over .audit-frames, printed
//    "sweeps 303 / lines 10994 / no out 0 / no head 0 / treeMoved 11 / dirs
//    10760 / conflicts 0")
//
// THE BAR IS NOT LOWERED BY THIS, in three places. A directory whose own two
// lines disagree resolves to null and does NOT fall back to the sweep vote. A
// drive flagged `treeMoved` resolves to null, because the rest of this audit
// already says in those words that such a drive "certifies nothing". And a
// frame path that names no directory at all — 17 of the corpus's 10,253 framed
// verdict lines had their backslashes eaten by JSON escaping, so that
// `.audit-frames\w12\frames\` arrived as `.audit-framesw12` + a formfeed, and
// six of those 17 land in this gate's candidate set — still names nothing, and
// is still refused. Those six are the LARGEST remaining class, which the old
// one-cause explanation in wave-c-post.mjs had entirely mis-described.
//
// WHY THIS IS A MODULE AND NOT TEN LINES INSIDE wave-c-post.mjs: that file reads
// the whole corpus at import, so nothing inside it can be tested without running
// a posting round. That is exactly how the previous version of this logic
// shipped with `.split("\\n")` — a split on a literal backslash-n — which made
// every sweep resolve to null and the gate report all 69 candidates as
// unattributable instead of refusing the 7 real ones. It looked like it worked.
// -----------------------------------------------------------------------------

const BS = String.fromCharCode(92);

/**
 * Verdicts that RETIRE a row rather than leave it open.
 *
 * This gate's whole subject is "a row a verifier OPENED". A verify line
 * carrying one of these opened nothing — it agreed the row was settled — so the
 * closure that follows it is not walking backwards over a correction.
 *
 * REFUTED is a latch, not a repair: measured 2026-09-19 over the corpus's
 * 10,328 verdict lines, the gate's candidate set breaks down
 * {STILL 47, UNJUDGED 19, PARTIAL 10, CLOSED 7} and holds no REFUTED at all. It
 * is in the set because "the verifier retired the row" is the property being
 * tested, and listing only the spelling that happens to be reachable today is
 * how the next spelling gets in free.
 */
const SETTLED = new Set(["CLOSED", "REFUTED"]);

/** Forward slashes, so one path shape is compared against one path shape. */
export const fwd = (s) => String(s ?? "").split(BS).join("/");

const HEX40 = /^[0-9a-f]{40}$/i;

/**
 * The `.audit-frames/...` tail of a path, forward-slashed, or null.
 *
 * ONE KEY FOR FOUR SPELLINGS. This corpus writes the same frame absolute with
 * backslashes, absolute with forward slashes, and repo-relative; all three must
 * reduce to one key or the directory map misses for two of them. A fourth
 * spelling must reduce to NOTHING: 17 verdict lines arrived with their
 * separators eaten by JSON escaping, so `E:\AI driver\.audit-frames\w12\frames\`
 * is stored as `E:AI driver.audit-framesw12` followed by a formfeed. That string
 * contains no `.audit-frames/`, so it yields null and the row stays refused —
 * which is right: the sweep name in it is a string that survived a lossy
 * transform, not a directory anybody recorded, and recovering it would mean
 * matching the survivor against a directory listing and picking a winner.
 */
export function auditKey(p) {
  const f = fwd(p);
  const i = f.indexOf(".audit-frames/");
  return i < 0 ? null : f.slice(i);
}

/**
 * ONE PASS over every sweep's results file, returning both attributions:
 *
 *   sweep — sweep directory -> the single commit it attested, or null when it
 *           mixed builds. The original rule, kept as the FALLBACK for a frame
 *           whose own directory was never recorded.
 *   frame — DRIVE DIRECTORY -> the commit that drive recorded for itself. The
 *           primary, because it is the finer and better-attested evidence.
 *
 * `readDir`, `readFile` and `exists` are injected so this is testable without a
 * corpus on disk — the reason this logic is a module at all.
 */
export function headMaps(auditFramesDir, { readDir, readFile, exists }) {
  const sweep = new Map();
  const frame = new Map();
  let entries = [];
  try {
    entries = readDir(auditFramesDir);
  } catch {
    return { sweep, frame };
  }
  for (const d of entries) {
    const rp = auditFramesDir + "/" + d + "/wave-c-results.jsonl";
    if (!exists(rp)) continue;
    const heads = new Set();
    for (const line of String(readFile(rp)).split("\n")) {
      if (!line.trim()) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        /* a torn tail line is not a reason to discard the sweep */
        continue;
      }
      if (j.head) heads.add(String(j.head));
      const k = auditKey(j.out);
      if (!k) continue;
      // A DRIVE WHOSE TREE MOVED UNDER IT NAMES NO BUILD. wave-c-merge.mjs
      // prints "<-- certify nothing" next to these and make-verdicts2.mjs
      // refuses to build a verdict from one; this agrees with both rather than
      // inventing a third policy. 11 of the 10,994 lines are flagged, and NO
      // verdict line in the corpus cites one of their directories today
      // (measured 2026-09-19), so this costs nothing now and cannot be reached
      // for later by a frame that should have been refused.
      // AND A BUILD MUST LOOK LIKE A BUILD. This read `!j.head` alone until
      // 2026-09-19, when a judge drove it with injected io and it ATTRIBUTED
      // "HEAD", "main", "HEAD~5", "../../etc", a 7-char prefix, 40 non-hex
      // characters, the number 12345 and the boolean true. That is not a
      // harmless shrug: `HEAD` is a valid revision, so a line carrying it would
      // be judged against whatever the ref points at TODAY rather than the
      // build the drive ran — `git diff HEAD dd4e5983 -- objectives.ts` exits 0
      // with 178 insertions and 3,788 deletions. A verdict certified against a
      // tree nobody measured is worse than a row left blocked, which is why
      // this refuses instead. HEX40 is the same constant the in-process path
      // two functions down has always enforced; this path simply never did.
      // Reachable today: zero — all 10,994 lines across 303 sweeps carry a
      // 40-hex head (measured 2026-09-19) — so this is a latch, not a repair.
      const h =
        j.treeMoved === true || !HEX40.test(String(j.head ?? "")) ? null : String(j.head);
      // Sticky null: once two lines have disagreed about one directory, no
      // later line may talk it back into an answer.
      if (frame.has(k) && frame.get(k) !== h) frame.set(k, null);
      else if (!frame.has(k)) frame.set(k, h);
    }
    sweep.set(d, heads.size === 1 ? [...heads][0] : null);
  }
  return { sweep, frame };
}

/**
 * sweep directory name -> the single commit it attested, or null when it mixed
 * builds. Kept as its own export because it is the fallback rule and is tested
 * as such; it is now one half of `headMaps` so the results files are read once.
 */
export function sweepHeadMap(auditFramesDir, io) {
  return headMaps(auditFramesDir, io).sweep;
}

/**
 * An IN-PROCESS run is its own record, and that record names a build.
 *
 * WHAT ITS `head` MEANS, AND WHAT IT DOES NOT. `tools/audit/inprocess-drive.mjs`
 * writes its own admissibility block, and it is blunt: "THIS IS NOT A
 * PHOTOGRAPHED DRIVE. Nothing was rendered, nothing was displayed, and no human
 * eye could have been present." So the head on one of these files is NOT the
 * claim "a camera saw this build". It is the claim "the production grading
 * chain executed the code at this commit", recorded as
 * `input.worktree = { head, productDirty, productDirtyFiles }`.
 *
 * AND THAT IS EXACTLY THE CLAIM THIS GATE NEEDS — no more of one. The gate asks
 * one question: did the row's own product file change between the build the
 * verifier observed and the build the closer observed? An in-process run
 * observed the tree at `head`, and `productDirty:false` is what says the code
 * that ran IS the code at that commit. Attributing it therefore makes the gate
 * STRICTER, never looser: an unattributed re-closure is merely reported, while
 * an attributed one becomes eligible to be REFUSED.
 *
 * `productDirty` is the whole warrant, so anything other than an explicit false
 * — true, absent, or a value nobody wrote — is an unnamed build. All 28 run
 * files under inprocess-w38 carry `productDirty:false` and they carry TWO
 * distinct heads (27 at 095054b4, 1 at ebc56e1a), which is the second reason a
 * per-sweep vote could never have answered for that directory.
 */
export function inProcessHead(framePath, io) {
  if (!io || typeof io.readFile !== "function") return null;
  const k = auditKey(framePath);
  if (!k || !/\.json$/i.test(k)) return null;
  let j;
  try {
    const raw = io.readFile(framePath);
    if (!raw) return null;
    j = JSON.parse(String(raw));
  } catch {
    /* an unreadable or unparseable record names nothing */
    return null;
  }
  const w = j && j.input && j.input.worktree;
  if (!w || !HEX40.test(String(w.head || ""))) return null;
  if (w.productDirty !== false) return null;
  return String(w.head);
}

/**
 * The commit a frame was photographed against, or null if it cannot be named.
 *
 * `maps` is `{ sweep, frame }` from headMaps, or — for the callers and tests
 * that only ever had one — a bare Map, read as the sweep map.
 *
 * ORDER, AND WHY IT IS THIS ORDER. The frame's OWN drive directory first,
 * because the driver wrote that down while it was driving. Then the file
 * itself, for an in-process run, which is not in any directory map because it
 * photographed nothing. Only then the sweep-wide vote. A directory the map
 * holds as null STOPS here and does not fall through to the vote: the vote is
 * the looser rule, and falling back to it would be exactly the "empty the list
 * by lowering the bar" this tool exists to refuse.
 */
export function buildOfFrame(frame, maps, io = null) {
  const sweep = maps instanceof Map ? maps : (maps && maps.sweep) || null;
  const frames = maps instanceof Map ? null : (maps && maps.frame) || null;
  const key = auditKey(frame);
  if (key) {
    if (frames) {
      const cut = key.lastIndexOf("/");
      const dir = cut > 0 ? key.slice(0, cut) : key;
      if (frames.has(dir)) return frames.get(dir);
    }
    const h = inProcessHead(frame, io);
    if (h) return h;
  }
  const m = fwd(frame).match(/\.audit-frames\/([^/]+)\//);
  if (!m || !sweep) return null;
  return sweep.has(m[1]) ? sweep.get(m[1]) : null;
}

/**
 * Group verdict lines by finding, IN FILE ORDER. The order is the whole point:
 * the question is what the line immediately BEFORE the closing one said.
 */
export function linesByFinding(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r || !r.findingId) continue;
    if (!out.has(r.findingId)) out.set(r.findingId, []);
    out.get(r.findingId).push(r);
  }
  return out;
}

/**
 * Find closures that re-close a verifier's correction.
 *
 * `productDiff(a, b)` must return "" when platform/src is identical between the
 * two builds, a non-empty diffstat when it is not, and null when it cannot say.
 *
 * Returns { refused, unattributable }:
 *   refused        — both builds known and platform/src identical. The class.
 *   unattributable — the same shape, but a build cannot be named. REPORTED, NOT
 *                    REFUSED: the failure is missing provenance, not bad
 *                    reasoning, and a false refusal is as bad as a false
 *                    certificate. Naming them is what makes attributing those
 *                    sweeps worth an afternoon.
 */
/**
 * PER-ROW FILE DIFF, NOT A TREE DIFF — tightened 2026-08-30 on a verifier's
 * finding, and the distinction decides whether this gate works at all.
 *
 * The first version asked `git diff a b -- platform/src`. A round that
 * changed twelve files could then re-close rows whose OWN file is in none of
 * them: the tree moved, so the gate waved them through. The verifier put it
 * exactly — the diffstat 'is TRUE, and I verified it, but it was used as a
 * blanket answer for rows whose own files are in none of those 12'.
 *
 * It caught two by hand that this gate had passed: HudToasts.tsx (8b149c07)
 * and TouchControls.tsx (b0ee7eff) are BYTE-IDENTICAL between the two builds,
 * and both rows had already been opened by a verifier and were being re-closed
 * on the strength of somebody else's diff.
 *
 * `fileOf(findingId)` supplies the row's own suspectFile. When it cannot
 * (an unrouted row), the check falls back to the tree — reporting rather than
 * refusing, because an unknown address is missing provenance and not evidence
 * that a judge was wrong.
 */
export function findReclosures(rows, { buildOf, productDiff, fileOf = null }) {
  const refused = [];
  const unattributable = [];
  for (const [id, list] of linesByFinding(rows)) {
    if (list.length < 2) continue;
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    if (String(last.verdict ?? "").toUpperCase() !== "CLOSED") continue;
    // Only a VERIFIER's correction earns this protection. A judge changing its
    // own mind within a round is ordinary adjudication.
    if (prev.correctedBy !== "verify") continue;
    /**
     * …AND THE VERIFIER MUST HAVE OPENED THE ROW — 2026-09-19.
     *
     * This test was `correctedBy === "verify"` alone, which asks WHO wrote the
     * previous line and never WHAT IT SAID. A verify pass that SUSTAINED a
     * closure therefore armed the gate exactly as one that overturned it, and
     * the closure that followed was refused for walking backwards over a
     * correction that had never been made.
     *
     * MEASURED 2026-09-19 on .audit-frames/wave-c/verdicts.jsonl (10,328
     * lines). 113 verify lines in the corpus carry CLOSED. 83 pairs reach this
     * point; 7 of them have `prev.verdict === CLOSED`. Driving the module the
     * way wave-c-post.mjs drives it — real headMaps over 303 sweeps / 10,760
     * drive directories, real `git diff --shortstat` — SEVEN pairs reach this
     * test with `prev.verdict` already settled, and ONE OF THEM WAS BEING
     * REFUSED: sc-vp-police-stop:56d9e48c, whose verify line opens
     * "VERDICT SUSTAINED, RATIONALE REPLACED — this is not a repair and the
     * record should not say it is." The verifier left the row settled and the
     * gate refused the next closure in the verifier's name. Five more of the
     * seven sat in `unattributable`, i.e. printed to the operator as suspect.
     *   "LEFT THE ROW SETTLED", not "SUSTAINED": six of the seven verify lines
     *   open with "Verdict unchanged" / "CLOSED STANDS" / "VERDICT SUSTAINED",
     *   but the seventh (sc-signal-response:f04226b7) opens "I OVERTURN w36
     *   STILL" — an overturn that itself CLOSED the row. The code keys on the
     *   verdict the verifier left behind, which is right for all seven; only an
     *   earlier draft of this prose generalised from the six.
     *
     * A false refusal is the failure this file names in its own docstring as
     * being as bad as a false certificate. MEASURED THROUGH THE REAL CONSUMER
     * (`node tools/audit/wave-c-post.mjs`): the gate refuses 30 rows, not 7, so
     * this was 1 in 30 — 3.3%, not "a seventh". The 7 was this lane's own
     * `fileOf:null` probe quoted as if it were the gate's total. The fix's
     * measured effect there: refused 30 -> 29, unattributable 7 -> 2.
     *
     * THIS DOES NOT LOOSEN THE GATE. It removes rows whose antecedent is not a
     * correction; every STILL / UNJUDGED / PARTIAL verify line — the 76 that
     * are the class — is untouched, and the arithmetic downstream (buildOf,
     * productDiff) is unchanged for all of them.
     */
    if (SETTLED.has(String(prev.verdict ?? "").toUpperCase())) continue;

    const a = buildOf(prev.evidenceFrame);
    const b = buildOf(last.evidenceFrame);
    if (!a || !b) {
      unattributable.push({ id, a, b, prev, last });
      continue;
    }
    // The row's OWN file first; the tree only when the row has no address.
    const own = fileOf ? fileOf(id) : null;
    const d = productDiff(a, b, own || null);
    if (d === "") refused.push({ id, a, b, prev, last });
    // d === null means git could not answer; that is not evidence of a defect,
    // so it joins the reported set rather than the refused one.
    else if (d === null) unattributable.push({ id, a, b, prev, last });
  }
  return { refused, unattributable };
}
