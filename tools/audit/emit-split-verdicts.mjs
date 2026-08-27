#!/usr/bin/env node
/**
 * EMIT THE VERDICT LINES FOR THE OPEN CHILDREN OF THE PARTIAL SPLIT.
 *
 * `apply-splits.mjs` files 647 atomic children and retires the 250 whose lane
 * proved them GONE on a frame. The other 397 are open, and an open finding with
 * no verdict line reads as "nobody looked" — which is false and which fails the
 * coverage gate. Somebody DID look: a split lane read the parent, opened the
 * frames, and an adversarial verifier checked it. This writes that down.
 *
 * THE MAPPING, and why it is conservative in the only direction that is safe:
 *   still-present  -> STILL      the symptom is on the frame
 *   needs-rate     -> UNJUDGED   rests on pass/fail at 13% determinism
 *   not-exercised  -> UNJUDGED   the drive never reached it
 *   no-frame       -> UNJUDGED   nothing was photographed
 *   lane-position  -> UNJUDGED   the ribbon is a road centreline, not a lane
 * Nothing here can produce CLOSED or REFUTED. A split may only ever retire a row
 * through `apply-splits.mjs`, on a frame that resolves, and only after a
 * verifier upheld it. This tool cannot close anything, by construction.
 *
 *   node tools/audit/emit-split-verdicts.mjs            report only
 *   node tools/audit/emit-split-verdicts.mjs --apply    write
 */
import fs from "node:fs";
import crypto from "node:crypto";

import { openListLine, workedLine, corpusCounts } from "./finding-reader.mjs";

const REPO = "E:/AI driver";
const CHILDREN = REPO + "/.audit-frames/findings/chunk-split.jsonl";
const VERDICTS = REPO + "/.audit-frames/wave-c/verdicts.jsonl";
const APPLY = process.argv.includes("--apply");

console.log(openListLine());

const findingId = (j) =>
  j.scenario +
  ":" +
  crypto.createHash("sha1").update(String(j.what) + "\u0000" + String(j.frame)).digest("hex").slice(0, 8);

const VERDICT_FOR = {
  "still-present": "STILL",
  "needs-rate": "UNJUDGED",
  "not-exercised": "UNJUDGED",
  "no-frame": "UNJUDGED",
  "lane-position": "UNJUDGED",
};

const rows = fs
  .readFileSync(CHILDREN, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

/**
 * OPEN MEANS OPEN NOW, NOT OPEN WHEN THE SPLIT WAS WRITTEN — 2026-08-27.
 *
 * This filtered on splitState alone. That field records what the SPLIT said
 * on the day it was written and is never updated, so a child retired by a later
 * adjudication round is still "not GONE" here for ever.
 *
 * CAUGHT BY count-agreement, which is what it is for: this file reported
 * WORKED scope=open n=404 critical=130 against a real open list of n=399
 * critical=151 — MORE rows than are open, and a different severity mix. Run in
 * that state it would append fresh verdict lines for findings that are already
 * closed, over a stamp that looks correct.
 *
 * The open list is now intersected live, so the stamp and the work are the same
 * set by construction rather than by luck.
 */
const openIds = new Set(corpusCounts().open.map((j) => j.findingId));
const openRows = rows.filter((r) => r.splitState !== "GONE" && openIds.has(findingId(r)));

// Anything already carrying a line stays as it is — this is append-only and it
// must never overwrite a judge or a verifier.
const already = new Set();
for (const l of fs.readFileSync(VERDICTS, "utf8").split("\n")) {
  if (!l.trim()) continue;
  try { already.add(JSON.parse(l).findingId); } catch { /* torn line */ }
}

const out = [];
const unknown = [];
for (const r of openRows) {
  const id = findingId(r);
  if (already.has(id)) continue;
  const verdict = VERDICT_FOR[r.openReason];
  if (!verdict) { unknown.push(r.openReason || "(none)"); continue; }
  out.push({
    findingId: id,
    lesson: r.scenario,
    severity: r.severity,
    verdict,
    evidenceFrame: r.frame,
    evidenceQuote: r.quote,
    why:
      "Clause " + r.childIndex + " of " + r.splitFrom + ", split 2026-08-26. " +
      "openReason=" + r.openReason + ". " + String(r.splitWhy || "").slice(0, 400),
    correctedBy: "split",
  });
}

const tally = {};
for (const o of out) tally[o.verdict] = (tally[o.verdict] || 0) + 1;
console.log(workedLine("open", openRows));
console.log("open children            : " + openRows.length);
console.log("already carrying a line  : " + (openRows.length - out.length - unknown.length));
console.log("lines to write           : " + out.length + "   " + JSON.stringify(tally));
if (unknown.length) {
  const u = {};
  for (const x of unknown) u[x] = (u[x] || 0) + 1;
  console.log("UNMAPPED openReason      : " + JSON.stringify(u) + "  (left unwritten on purpose — add a mapping)");
}

if (!APPLY) {
  console.log("");
  console.log("(report only — pass --apply to write)");
  process.exit(0);
}

fs.appendFileSync(VERDICTS, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log("appended " + out.length + " verdict line(s)");
