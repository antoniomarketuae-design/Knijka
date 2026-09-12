// Build the sweep's drive set from the OPEN rows themselves: for each lesson,
// drive exactly the legs its open findings were filed on. Driving a leg no
// finding cites photographs nothing anyone is waiting for; missing a leg a
// finding cites leaves that row unprovable for another whole round.
import fs from "node:fs";
const REPO = "E:/AI driver";
const b = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));
const SEP = String.fromCharCode(92);

const VALID = new Set(["pc-right", "pc-wrong", "mobile-right", "mobile-wrong"]);
const legOf = (p) => {
  const s = String(p || "").split(SEP).join("/");
  const i = s.indexOf("/frames/");
  if (i < 0) return null;
  const rest = s.slice(i + "/frames/".length);
  const dir = rest.split("/")[0] || "";
  const j = dir.indexOf("__");
  if (j < 0) return null;
  const leg = dir.slice(j + 2);
  return VALID.has(leg) ? leg : null;
};

const per = new Map(); // lesson -> {total, critical, legs:Set}
let noLeg = 0;
for (const e of b) {
  for (const f of e.findings) {
    const k = f.scenario;
    if (!k) continue;
    const cur = per.get(k) || { total: 0, critical: 0, legs: new Set() };
    cur.total++;
    if (f.severity === "critical") cur.critical++;
    const leg = legOf(f.evidenceFrame) || legOf(f.frame);
    if (leg) cur.legs.add(leg);
    else noLeg++;
    per.set(k, cur);
  }
}

// A lesson whose rows cite no leg still has to be driven; give it the pair that
// exercises both a correct and an incorrect run.
let defaulted = 0;
const rows = [...per.entries()].map(([lesson, v]) => {
  let legs = [...v.legs];
  if (!legs.length) { legs = ["pc-right", "pc-wrong"]; defaulted++; }
  return { lesson, total: v.total, critical: v.critical, legs: legs.sort() };
});
rows.sort((a, c) => c.critical - a.critical || c.total - a.total);

const drives = rows.reduce((a, r) => a + r.legs.length, 0);
const legTally = {};
for (const r of rows) for (const l of r.legs) legTally[l] = (legTally[l] || 0) + 1;

console.log("  lessons          : " + rows.length);
console.log("  drives (legs)    : " + drives);
console.log("  rows citing no leg: " + noLeg + "   lessons defaulted to pc-right+pc-wrong: " + defaulted);
console.log("  leg spread       : " + JSON.stringify(legTally));
console.log("  est wall clock   : ~" + Math.round((drives * 250) / 4 / 60) + " min on 4 drivers at the measured p50");
console.log("");
console.log("  heaviest 8:");
for (const r of rows.slice(0, 8)) console.log("    " + String(r.critical).padStart(2) + "c/" + String(r.total).padStart(2) + "  " + r.lesson.padEnd(26) + r.legs.join(","));

fs.writeFileSync(REPO + "/.audit-frames/waveC-redrive.json", JSON.stringify(rows, null, 1));
console.log("");
console.log("  -> .audit-frames/waveC-redrive.json (" + rows.length + " lessons, " + drives + " drives)");

// shard by DRIVE COUNT, not lesson count, so the four drivers finish together
const SHARDS = 4;
const buckets = Array.from({ length: SHARDS }, () => ({ n: 0, rows: [] }));
for (const r of rows) {
  const b2 = buckets.reduce((m, x) => (x.n < m.n ? x : m), buckets[0]);
  b2.rows.push(r);
  b2.n += r.legs.length;
}
buckets.forEach((x, i) => {
  fs.writeFileSync(REPO + "/.audit-frames/redrive-shard-" + (i + 1) + ".json", JSON.stringify(x.rows, null, 1));
  console.log("  shard " + (i + 1) + ": " + String(x.rows.length).padStart(3) + " lessons, " + String(x.n).padStart(3) + " drives");
});
