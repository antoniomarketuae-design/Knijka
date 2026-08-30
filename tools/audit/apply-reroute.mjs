#!/usr/bin/env node
/**
 * APPLY THE RE-ROUTING — move rows to the file that can actually hold them.
 *
 * WHY THIS MATTERS MORE THAN A REPAIR WAVE. 66% of findings in this corpus name
 * a file that CANNOT contain the defect. A repair lane pointed at the wrong file
 * can only ever report "misrouted", and it costs a whole wave to do it: repair
 * wave 11 generated the SAME SIX FILES as wave 10, because those files rank top
 * on blame rather than on ownership. finish.ts returned 5 misrouted of 6;
 * runtime/surface.ts 3 of 3.
 *
 * SAFE BY CONSTRUCTION. `findingId` is sha1(scenario + what + frame) —
 * `suspectFile` is NOT part of it. Re-routing preserves the id and therefore
 * every verdict, closure and correction already attached to the row.
 *
 * WHAT IT REFUSES, each rule bought by a verifier in the routing wave:
 *
 *  · A DESTINATION OFF THE IMPORT GRAPH. One proposal pointed at
 *    `tools/maps/gen_parking_lot.mjs` — a build-time generator that reaches the
 *    product only through district JSON it writes to two places. Routing a row
 *    there sends a repair lane somewhere it cannot change what a student sees.
 *  · A ROW WHOSE VERDICT IS NOT STILL. Five REROUTEs named UNJUDGED rows, and
 *    only two were self-flagged; the other three would have entered a wave
 *    silently. A row nobody could judge is not a row anyone can repair.
 *  · A DESTINATION THAT DOES NOT EXIST on disk. An address that cannot be opened
 *    is not an address.
 *
 * SPLIT rows keep their primary owner and record the second in `rerouteSecondary`
 * rather than being guessed at: a split that names one owner and forgets the
 * other hides half a defect, and splitting the ROW is apply-splits.mjs's job.
 *
 *   node tools/audit/apply-reroute.mjs            report only
 *   node tools/audit/apply-reroute.mjs --apply    write
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusCounts, findingId, openListLine, workedLine } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BS = String.fromCharCode(92);
const fwd = (s) => String(s ?? "").split(BS).join("/");

const APPLY = process.argv.includes("--apply");
const SRC = path.join(REPO, ".audit-frames", "reroute.jsonl");
const FIND = path.join(REPO, ".audit-frames", "findings");

const counts = corpusCounts();
console.log(openListLine(counts));

if (!fs.existsSync(SRC)) {
  console.error("no reroute.jsonl — run the routing wave first");
  process.exit(2);
}

// ---- resolve one proposal per finding: a verifier's line outranks the lane's
const live = new Map();
for (const l of fs.readFileSync(SRC, "utf8").split("\n")) {
  if (!l.trim()) continue;
  let j;
  try { j = JSON.parse(l); } catch { continue; }
  if (!j.findingId) continue;
  const prev = live.get(j.findingId);
  if (prev && prev.correctedBy === "verify" && j.correctedBy !== "verify") continue;
  live.set(j.findingId, j);
}

// ---- the live verdict per finding, so an unjudged row cannot be routed
const verdictOf = new Map();
for (const l of fs.readFileSync(path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl"), "utf8").split("\n")) {
  if (!l.trim()) continue;
  try {
    const j = JSON.parse(l);
    if (j.findingId) verdictOf.set(j.findingId, String(j.verdict || "").toUpperCase());
  } catch { /* torn tail */ }
}

const openById = new Map(counts.open.map((f) => [f.findingId, f]));

/**
 * A MALFORMED DESTINATION IS REFUSED LOUDLY, NOT SILENTLY.
 *
 * Measured by the third routing pass: SIX of nine SPLIT lines packed both
 * owners into `to`, joined by " || " or " + ". The old check asked only
 * whether the string started with platform/src/, so it dropped every one of
 * them WITHOUT SAYING SO — and the same malformation had been arriving since
 * pass 1. A refusal nobody can see is indistinguishable from a row that was
 * never proposed.
 *
 * Now the shape is checked and named. A line carrying two owners in one field
 * is a SPLIT that was written wrong, and the fix is one edit to that line, not
 * a lost row.
 */
const MULTI = /\s(\|\||\+|,|;| and | or )\s/;
const looksMalformed = (v) => MULTI.test(String(v || ""));

/**
 * A TYPE-ONLY FILE PASSES THE CHAIN TEST AND FAILS ITS PURPOSE.
 *
 * `lessons/types.ts` is imported everywhere and has 0 runtime-valued exports —
 * 34 type-only ones, all erased at compile. It is 'live' by any import walk and
 * cannot emit a symptom, so a row routed there can never be repaired. The third
 * pass overturned exactly this routing for one row and then let it stand for
 * another. Warned, not refused: a .d-shaped file can still be the right place
 * to ADD a term (that is what `wasAboveKmh` needs), and refusing outright would
 * block a legitimate answer.
 */
const typeOnly = (rel) => {
  try {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    const values = src.match(/^export\s+(const|function|class|let|var|async)\s/gm) || [];
    const types = src.match(/^export\s+(type|interface)\s/gm) || [];
    return values.length === 0 && types.length > 0;
  } catch {
    return false;
  }
};

const adopt = [];
const refused = [];
for (const [id, p] of live) {
  const outcome = String(p.outcome || "").toUpperCase();
  if (outcome !== "REROUTE" && outcome !== "SPLIT") continue;

  const to = fwd(p.to || "");
  if (!to) { refused.push([id, "no destination named"]); continue; }
  if (looksMalformed(p.to)) {
    refused.push([id, "TWO OWNERS IN ONE FIELD — write the second in to2: " + String(p.to).slice(0, 70)]);
    continue;
  }
  if (!openById.has(id)) { refused.push([id, "not an open finding"]); continue; }
  if (verdictOf.get(id) !== "STILL") {
    refused.push([id, "verdict is " + (verdictOf.get(id) || "(none)") + ", not STILL"]);
    continue;
  }
  if (!to.startsWith("platform/src/")) {
    refused.push([id, "destination is off the product import graph: " + to]);
    continue;
  }
  if (!fs.existsSync(path.join(REPO, to))) {
    refused.push([id, "destination does not exist on disk: " + to]);
    continue;
  }
  // `to2` was taken with NO validation, so an off-graph secondary was adopted
  // into rerouteSecondary unchecked — the third pass named one:
  // tools/maps/gen_pe_zone.mjs, absent from all 509 modules reachable from
  // /simulator. A second owner is an address like any other.
  let secondary = fwd(p.to2 || "") || null;
  if (secondary && (looksMalformed(p.to2) || !secondary.startsWith("platform/src/") || !fs.existsSync(path.join(REPO, secondary)))) {
    refused.push([id + " (secondary)", "second owner rejected, primary still adopted: " + secondary]);
    secondary = null;
  }
  if (typeOnly(to)) {
    console.log("   WARNING " + id + " -> " + to + " has no runtime-valued exports; a row cannot be repaired there unless a term is being ADDED");
  }
  adopt.push({ id, to, secondary, outcome, from: fwd(p.from || openById.get(id).suspectFile || "") });
}

/**
 * UNOWNED ROWS ARE FLAGGED, NOT CLOSED — and the difference is the whole point.
 *
 * 43 of 95 routing-checked rows (45%) can be repaired by NO product file: 31
 * are harness findings where the drive photographed the instrument rather
 * than the product, 5 are verdict-shaped and need a rate the harness cannot
 * produce, 1 is lane-position which the guidance ribbon can never settle in
 * either direction.
 *
 * They stay OPEN. They are real things that are wrong, and closing them would
 * be exactly the false-certificate move this ledger exists to refuse — the
 * count must not fall because a row was reclassified.
 *
 * But they must stop entering repair waves. Repair wave 11 spent six lanes on
 * 28 rows and shipped ZERO executable lines, and every verifier confirmed the
 * lanes were right to write nothing: a lane pointed at a harness artefact can
 * only report 'misrouted', and it costs a whole wave to do it.
 */
const unowned = [];
for (const [id, p] of live) {
  if (String(p.outcome || "").toUpperCase() !== "UNOWNED") continue;
  if (!openById.has(id)) continue;
  unowned.push({ id, why: String(p.why || "").slice(0, 400) });
}

console.log(workedLine("open", adopt.map((a) => openById.get(a.id))));
console.log("proposals read      : " + live.size);
console.log("unrepairable (flag): " + unowned.length + "   (they stay OPEN; they simply stop entering repair waves)");
console.log("adopted             : " + adopt.length);
console.log("refused             : " + refused.length);
for (const [id, why] of refused.slice(0, 14)) console.log("   " + id.padEnd(34) + why);

const hist = {};
for (const a of adopt) hist[a.to] = (hist[a.to] || 0) + 1;
console.log("");
console.log("destinations:");
for (const [f, n] of Object.entries(hist).sort((a, b) => b[1] - a[1])) {
  console.log("   " + String(n).padStart(3) + "  " + f.replace("platform/src/", ""));
}

if (!APPLY) {
  console.log("");
  console.log("(report only — pass --apply to write)");
  process.exit(0);
}
if (!adopt.length) {
  console.error("nothing to adopt");
  process.exit(1);
}

// ---- write: match rows by findingId, recomputed the same way the reader does
const byId = new Map(adopt.map((a) => [a.id, a]));
const unownedById = new Map(unowned.map((u) => [u.id, u]));
// USE THE READER'S OWN id FUNCTION. A local copy drifted once already in this
// codebase, and an id derived two ways matches nothing while looking correct.
const idOf = findingId;
let changed = 0;
for (const f of fs.readdirSync(FIND).filter((x) => x.endsWith(".jsonl"))) {
  const p = path.join(FIND, f);
  const lines = fs.readFileSync(p, "utf8").split("\n");
  let n = 0;
  let m = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    let j;
    try { j = JSON.parse(l); } catch { return l; }
    if (j.bucket !== "BROKEN") return l;
    const u = unownedById.get(idOf(j));
    if (u) {
      m += 1;
      return JSON.stringify({ ...j, unrepairable: true, unrepairableWhy: u.why, unrepairableAt: "2026-08-30" });
    }
    const a = byId.get(idOf(j));
    if (!a) return l;
    n += 1;
    return JSON.stringify({
      ...j,
      suspectFile: a.to,
      reroutedFrom: a.from || j.suspectFile,
      reroutedAt: "2026-08-30",
      ...(a.secondary ? { rerouteSecondary: a.secondary } : {}),
    });
  });
  if (n || m) {
    fs.copyFileSync(p, p + ".pre-reroute");
    fs.writeFileSync(p, out.join("\n"));
    console.log("   " + f + ": " + n + " re-routed, " + m + " flagged unrepairable");
    changed += n;
  }
}
console.log("");
console.log("re-routed " + changed + " row(s); originals kept as *.pre-reroute");
