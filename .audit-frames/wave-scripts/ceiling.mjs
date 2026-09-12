// What is actually left, and how much of it can the CURRENT method ever close?
// Four adjudications have retired 169, 73, 46 — a declining curve. That is
// expected (the already-fixed rows went first) but it is worth knowing whether
// the tail is convergent or structurally unreachable.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "E:/AI driver";
const fr = await import(pathToFileURL(REPO + "/tools/audit/finding-reader.mjs").href);
const SEP = String.fromCharCode(92);

const open = fr.loadOpenFindings();
const still = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"))
  .flatMap((e) => e.findings);
const partial = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/partial-rows.json", "utf8"));

console.log("  OPEN LIST: " + open.length);
console.log("    STILL    " + still.length);
console.log("    PARTIAL  " + partial.length + "  (retires nothing until split — a split agent is running)");
console.log("    UNJUDGED " + (open.length - still.length - partial.length));
console.log("");

const legOf = (p) => {
  const s = String(p || "").split(SEP).join("/");
  const i = s.indexOf("/frames/");
  if (i < 0) return null;
  const dir = s.slice(i + 8).split("/")[0] || "";
  const j = dir.indexOf("__");
  return j < 0 ? null : dir.slice(j + 2);
};

// Rows a sweep of the CURRENT shape cannot settle: filed on a -wrong leg AND
// turning on something an unsteered car cannot demonstrate.
const STEER_DEP = /objectiv|задач|tick|credit|отчита|steer|turn|завой|lane|лент|position|позиц|park|паркир|reverse|заден|manoeuv|маневр|route|маршрут|approach|приближ/i;
let wrongLeg = 0, wrongSteer = 0;
for (const f of still) {
  const leg = legOf(f.evidenceFrame) || legOf(f.frame) || "";
  if (!leg.endsWith("-wrong")) continue;
  wrongLeg++;
  if (STEER_DEP.test(String(f.what) + " " + String(f.why || ""))) wrongSteer++;
}

// Rows whose repair a lane has explicitly routed to the founder or to a missing
// producer — these cannot be closed by any amount of lane work.
const BLOCKED = /lawRef|founder|no channel|no producer|needs a drive|rate mode|not this file/i;
const routed = still.filter((f) => BLOCKED.test(String(f.why || ""))).length;

console.log("  OF THE " + still.length + " STILL ROWS:");
console.log("    filed on a -wrong leg                        : " + wrongLeg);
console.log("    ...and turning on steering/position/objectives: " + wrongSteer + "   <-- no sweep of this shape can settle these");
console.log("    verifier routed to a founder ruling or a missing producer: " + routed);
console.log("");
const reachable = still.length - wrongSteer;
console.log("  REACHABLE BY THE CURRENT METHOD: ~" + reachable + " of " + still.length + " STILL rows");
console.log("");
console.log("  What would change the ceiling, in order of leverage:");
console.log("    1. Make -wrong legs steer (drive path runs the loop only in its roll phase)  -> unblocks ~" + wrongSteer);
console.log("    2. Rate-mode harness (drive N times, judge the RATE)                          -> unblocks the UNJUDGED class");
console.log("    3. Founder rulings in .audit-frames/wave-scripts/founder-batch.md             -> unblocks the routed rows");
