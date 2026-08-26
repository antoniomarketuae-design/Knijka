#!/usr/bin/env node
/**
 * APPLY THE PARTIAL SPLIT — turn 230 compound findings into atomic ones.
 *
 * WHY. 230 of the open findings carried the verdict PARTIAL, and 223 of them
 * said in their own WHY which clauses were already repaired — "TWO CLAUSES
 * WENT, ONE STANDS". PARTIAL retires NOTHING by design, so a row filed as one
 * item but containing three complaints stayed open until all three were fixed.
 * Rounds of finished work were invisible. That, not the drives and not the
 * repairs, is why the count would not move.
 *
 * WHAT IT DOES, and each choice is forced by something the corpus already does:
 *
 *  1. The 230 parents get `bucket: "SPLIT"`. NOT a closure — a closure asserts
 *     the defect is gone, and `finding-reader.test.mjs` rightly demands every
 *     retirement carry a frame that RESOLVES plus a quote. A parent has no
 *     single frame, and inventing one is the exact dishonesty this ledger
 *     exists to prevent. SPLIT sits beside the corpus's existing REFUTED and
 *     REFUTED-AT-FILING: not fixed, not refuted, REPLACED by finer rows.
 *
 *  2. The children are filed in `chunk-split.jsonl`, which MUST be declared in
 *     finding-reader's ADDITIVE set. Supersession drops any row whose lesson
 *     appears in chunk-redrive.jsonl unless its source is additive — that cost
 *     5 rows, 4 of them critical, the last time a new source was added without
 *     declaring it, and the only symptom was a total rising by 25 instead of 30.
 *
 *  3. Only the GONE children get closures, each carrying the frame and quote its
 *     lane cited and its verifier upheld. OPEN children are filed as ordinary
 *     BROKEN rows and inherit the parent's suspectFile, so the repair waves can
 *     still route them.
 *
 * The pre-split corpus is preserved on the `ledger/audit` branch and in
 * *.pre-split copies beside each file.
 *
 *   node tools/audit/apply-splits.mjs            report only
 *   node tools/audit/apply-splits.mjs --apply    write
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { openListLine, workedLine } from "./finding-reader.mjs";

const REPO = "E:/AI driver";
const FIND = REPO + "/.audit-frames/findings";
const SPLITS = REPO + "/.audit-frames/wave-c/splits.jsonl";
const CLOSURES = REPO + "/.audit-frames/wave-c/closures.jsonl";
const APPLY = process.argv.includes("--apply");

console.log(openListLine());
const BS = String.fromCharCode(92);

const findingId = (j) =>
  j.scenario +
  ":" +
  crypto.createHash("sha1").update(String(j.what) + "\u0000" + String(j.frame)).digest("hex").slice(0, 8);

const fwd = (s) => String(s).split(BS).join("/");

// ---- resolve the live child per (parent, index): a verify line wins ----------
const raw = fs.readFileSync(SPLITS, "utf8").split("\n").filter((l) => l.trim());
const live = new Map();
for (const l of raw) {
  let j;
  try { j = JSON.parse(l); } catch { continue; }
  if (!j.parentId || j.childIndex == null) continue;
  const k = j.parentId + "#" + j.childIndex;
  const prev = live.get(k);
  // Append-only: a later line replaces an earlier one, but a verifier's
  // correction is never overwritten by a plain lane line that follows it.
  if (prev && prev.correctedBy === "verify" && j.correctedBy !== "verify") continue;
  live.set(k, j);
}
const children = [...live.values()];
const parents = new Set(children.map((c) => c.parentId));

// ---- the parents, as they stand in the corpus -------------------------------
const files = fs.readdirSync(FIND).filter((f) => f.endsWith(".jsonl"));
const parentRow = new Map();
for (const f of files) {
  for (const l of fs.readFileSync(path.join(FIND, f), "utf8").split("\n")) {
    if (!l.trim()) continue;
    let j;
    try { j = JSON.parse(l); } catch { continue; }
    if (j.bucket !== "BROKEN") continue;
    const id = findingId(j);
    if (parents.has(id) && !parentRow.has(id)) parentRow.set(id, { ...j, __src: f });
  }
}

const orphans = children.filter((c) => !parentRow.has(c.parentId));
const gone = children.filter((c) => c.state === "GONE");
const open = children.filter((c) => c.state !== "GONE");
const badFrame = gone.filter((c) => !c.evidenceFrame || !fs.existsSync(fwd(c.evidenceFrame)));

console.log(workedLine("open", [...parentRow.values()]));
console.log("parents named by the split : " + parents.size);
console.log("parents found in the corpus: " + parentRow.size);
console.log("children (live)            : " + children.length + "   GONE " + gone.length + " / OPEN " + open.length);
console.log("children with no parent row: " + orphans.length);
console.log("GONE whose frame does NOT resolve: " + badFrame.length);

if (badFrame.length) {
  console.log("");
  console.log("REFUSING to retire these — a retirement without readable evidence is what this ledger forbids:");
  for (const c of badFrame.slice(0, 10)) console.log("   " + c.parentId + "#" + c.childIndex);
}
for (const c of orphans.slice(0, 10)) console.log("   orphan: " + c.parentId + "#" + c.childIndex);

// ---- build the child rows ---------------------------------------------------
const childRows = [];
for (const c of children) {
  const p = parentRow.get(c.parentId);
  if (!p) continue;
  childRows.push({
    scenario: c.lesson || p.scenario,
    bucket: "BROKEN",
    severity: c.severity || p.severity,
    what: c.claim,
    frame: c.evidenceFrame ? fwd(c.evidenceFrame) : p.frame,
    quote: c.evidenceQuote || p.quote,
    suspectFile: p.suspectFile,
    splitFrom: c.parentId,
    childIndex: c.childIndex,
    splitState: c.state,
    openReason: c.state === "GONE" ? undefined : c.openReason,
    splitWhy: String(c.why || "").slice(0, 600),
  });
}

// Every child id must be unique, or two clauses collapse into one row and one
// of them silently stops existing.
const ids = childRows.map((r) => findingId(r));
const dupes = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

const retire = [];
for (const c of gone) {
  const p = parentRow.get(c.parentId);
  if (!p) continue;
  if (!c.evidenceFrame || !fs.existsSync(fwd(c.evidenceFrame))) continue;
  const row = childRows.find((r) => r.splitFrom === c.parentId && r.childIndex === c.childIndex);
  if (!row) continue;
  retire.push({
    findingId: findingId(row),
    lesson: row.scenario,
    severity: row.severity,
    verdict: "CLOSED",
    closedBy: "partial-split",
    evidenceFrame: fwd(c.evidenceFrame),
    evidenceQuote: c.evidenceQuote,
    why: "Split from " + c.parentId + " clause " + c.childIndex + ". " + String(c.why || "").slice(0, 400),
    stamped: "2026-08-26T00:00:00.000Z",
  });
}

console.log("child rows built           : " + childRows.length + "   retirements: " + retire.length);
console.log("DUPLICATE child ids        : " + dupes.size + (dupes.size ? "  !! two clauses would collapse into one row" : ""));

if (!APPLY) {
  console.log("");
  console.log("(report only — pass --apply to write)");
  process.exit(0);
}
if (dupes.size) {
  console.error("refusing to write with duplicate ids");
  process.exit(2);
}

// ---- write ------------------------------------------------------------------
for (const f of files) {
  const p = path.join(FIND, f);
  const lines = fs.readFileSync(p, "utf8").split("\n");
  let changed = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    let j;
    try { j = JSON.parse(l); } catch { return l; }
    if (j.bucket !== "BROKEN") return l;
    const id = findingId(j);
    if (!parents.has(id)) return l;
    changed += 1;
    const n = children.filter((c) => c.parentId === id).length;
    return JSON.stringify({ ...j, bucket: "SPLIT", splitInto: n, splitAt: "2026-08-26" });
  });
  if (changed) {
    fs.copyFileSync(p, p + ".pre-split");
    fs.writeFileSync(p, out.join("\n"));
    console.log("  " + f + ": " + changed + " parent(s) marked SPLIT");
  }
}

/**
 * MERGE, NEVER OVERWRITE — 2026-08-23.
 *
 * This was a bare `writeFileSync`, and it is the only writer in this file that
 * did NOT take a `.pre-split` backup first: the one file it could destroy was
 * the one file it did not copy. On a second run — a `splits.jsonl` naming 4 new
 * parents on top of the original 230 — it replaced 647 existing children with
 * 13 and dropped 638 findings out of the corpus. `filed` fell 1462 -> 824.
 *
 * What made it dangerous rather than merely wrong: every counter then AGREED on
 * the new number, because agreement is computed from the same files. The
 * corpus was recovered from the `ledger/audit` branch, which is precisely why
 * that branch exists.
 *
 * A second run is not hypothetical. The standing order is wave after wave, and
 * each wave that splits a compound row runs this file again.
 *
 * Children are keyed by parent + childIndex, so re-running with an unchanged
 * `splits.jsonl` is now a no-op instead of an amputation.
 */
const SPLIT_FILE = FIND + "/chunk-split.jsonl";
const childKey = (r) => String(r.splitFrom) + "#" + String(r.childIndex);
const mergedChildren = new Map();
if (fs.existsSync(SPLIT_FILE)) {
  fs.copyFileSync(SPLIT_FILE, SPLIT_FILE + ".pre-split");
  for (const line of fs.readFileSync(SPLIT_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      mergedChildren.set(childKey(j), j);
    } catch {
      // A malformed line is not a reason to drop every good line beside it.
    }
  }
}
const childrenBefore = mergedChildren.size;
for (const r of childRows) mergedChildren.set(childKey(r), r);
fs.writeFileSync(SPLIT_FILE, [...mergedChildren.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(
  "chunk-split.jsonl: " + childrenBefore + " existing + " + childRows.length + " from this run = " + mergedChildren.size + " children",
);
if (mergedChildren.size < childrenBefore) {
  console.log("  REFUSING TO BE QUIET: the file SHRANK. That should be impossible — investigate before trusting any count.");
}

// Guarded: an empty `retire` used to append `"" + "\n"`, i.e. a blank line into
// the middle of the closures ledger on every no-op run. Readers skip blanks, so
// it broke no count — which is exactly why it would have accumulated silently,
// one line per wave, in the file that is the audit's only record of what was
// retired and on what evidence.
if (retire.length) {
  fs.copyFileSync(CLOSURES, CLOSURES + ".pre-split");
  fs.appendFileSync(CLOSURES, retire.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
console.log("appended " + retire.length + " retirement(s) to closures.jsonl");
console.log("");
console.log("chunk-split.jsonl must be in finding-reader's ADDITIVE set or supersession eats it.");
