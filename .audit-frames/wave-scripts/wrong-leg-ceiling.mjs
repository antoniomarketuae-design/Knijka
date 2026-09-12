// The harness says every MODE=wrong lane holds the throttle flat and never runs
// the steering loop. So any finding filed on a -wrong leg that turns on steering,
// positioning or objective crediting CANNOT be settled by this sweep — the drive
// is evidence about an unsteered car. Measure the ceiling before adjudication so
// the count stays honest and judges are told which rows they must mark UNJUDGED.
import fs from "node:fs";
const REPO = "E:/AI driver";
const SEP = String.fromCharCode(92);
const b = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));

const legOf = (p) => {
  const s = String(p || "").split(SEP).join("/");
  const i = s.indexOf("/frames/");
  if (i < 0) return null;
  const dir = s.slice(i + 8).split("/")[0] || "";
  const j = dir.indexOf("__");
  return j < 0 ? null : dir.slice(j + 2);
};

const all = [];
for (const e of b) for (const f of e.findings) all.push(f);

const byLeg = new Map();
for (const f of all) {
  const leg = legOf(f.evidenceFrame) || legOf(f.frame) || "(no leg in path)";
  byLeg.set(leg, (byLeg.get(leg) || 0) + 1);
}
console.log("  476 STILL rows by the leg their evidence came from:");
for (const [k, v] of [...byLeg.entries()].sort((a, c) => c[1] - a[1])) console.log("    " + String(v).padStart(4) + "  " + k);

// Which rows turn on something an unsteered car cannot demonstrate?
const STEER_DEPENDENT = /objectiv|задач|tick|credit|отчита|steer|turn|завой|lane|лент|position|позиц|park|паркир|reverse|заден|manoeuv|маневр|route|маршрут|approach|приближ/i;
let wrongLeg = 0, wrongAndSteer = 0;
for (const f of all) {
  const leg = legOf(f.evidenceFrame) || legOf(f.frame) || "";
  if (!leg.endsWith("-wrong")) continue;
  wrongLeg++;
  if (STEER_DEPENDENT.test(String(f.what) + " " + String(f.why))) wrongAndSteer++;
}
console.log("");
console.log("  rows filed on a -wrong leg                        : " + wrongLeg);
console.log("  of those, turning on steering/position/objectives : " + wrongAndSteer);
console.log("");
console.log("  => up to " + wrongAndSteer + " row(s) cannot be settled by this sweep however good the frames are.");
console.log("     They are evidence about an unsteered car. Judges must mark them UNJUDGED,");
console.log("     not STILL — 'the objective did not tick' on a car that never turned the wheel");
console.log("     is not a product defect, and recording it as one retires nothing and lies.");
