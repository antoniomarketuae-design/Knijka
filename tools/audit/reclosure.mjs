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
// WHY THIS IS A MODULE AND NOT TEN LINES INSIDE wave-c-post.mjs: that file reads
// the whole corpus at import, so nothing inside it can be tested without running
// a posting round. That is exactly how the previous version of this logic
// shipped with `.split("\\n")` — a split on a literal backslash-n — which made
// every sweep resolve to null and the gate report all 69 candidates as
// unattributable instead of refusing the 7 real ones. It looked like it worked.
// -----------------------------------------------------------------------------

const BS = String.fromCharCode(92);

/** Forward slashes, so one path shape is compared against one path shape. */
export const fwd = (s) => String(s ?? "").split(BS).join("/");

/**
 * sweep directory name -> the single commit it attested, or null when it mixed
 * builds. `readDir` and `readFile` are injected so this is testable without a
 * corpus on disk.
 */
export function sweepHeadMap(auditFramesDir, { readDir, readFile, exists }) {
  const map = new Map();
  let entries = [];
  try {
    entries = readDir(auditFramesDir);
  } catch {
    return map;
  }
  for (const d of entries) {
    const rp = auditFramesDir + "/" + d + "/wave-c-results.jsonl";
    if (!exists(rp)) continue;
    const heads = new Set();
    for (const line of String(readFile(rp)).split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.head) heads.add(String(j.head));
      } catch {
        /* a torn tail line is not a reason to discard the sweep */
      }
    }
    map.set(d, heads.size === 1 ? [...heads][0] : null);
  }
  return map;
}

/** The commit a frame was photographed against, or null if it cannot be named. */
export function buildOfFrame(frame, map) {
  const m = fwd(frame).match(/\.audit-frames\/([^/]+)\//);
  if (!m) return null;
  return map.has(m[1]) ? map.get(m[1]) : null;
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
export function findReclosures(rows, { buildOf, productDiff }) {
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

    const a = buildOf(prev.evidenceFrame);
    const b = buildOf(last.evidenceFrame);
    if (!a || !b) {
      unattributable.push({ id, a, b, prev, last });
      continue;
    }
    const d = productDiff(a, b);
    if (d === "") refused.push({ id, a, b, prev, last });
    // d === null means git could not answer; that is not evidence of a defect,
    // so it joins the reported set rather than the refused one.
    else if (d === null) unattributable.push({ id, a, b, prev, last });
  }
  return { refused, unattributable };
}
