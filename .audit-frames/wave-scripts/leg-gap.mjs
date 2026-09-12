// A verifier overturned a closure because "w11 re-drove no mobile leg of this
// lesson at all". My drive set derived each lesson's legs from its findings'
// own frame paths — so a row filed on mobile-wrong in a lesson whose other rows
// all cite pc legs never got its leg re-driven, and cannot be judged.
// Measure it, so the next sweep closes the hole instead of rediscovering it.
import fs from "node:fs";
const REPO = "E:/AI driver";
const SEP = String.fromCharCode(92);

const legOf = (p) => {
  const s = String(p || "").split(SEP).join("/");
  const i = s.indexOf("/frames/");
  if (i < 0) return null;
  const dir = s.slice(i + 8).split("/")[0] || "";
  const j = dir.indexOf("__");
  return j < 0 ? null : dir.slice(j + 2);
};

// what w11 actually drove
const drove = new Set();
for (const l of fs.readFileSync(REPO + "/.audit-frames/w11/wave-c-results.jsonl", "utf8").split("\n")) {
  if (!l.trim()) continue;
  try { const j = JSON.parse(l); drove.add(j.lesson + "__" + j.leg); } catch { /* skip */ }
}
console.log("  w11 drove " + drove.size + " (lesson,leg) pairs");

const b = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));
const all = [];
for (const e of b) for (const f of e.findings) all.push(f);

let matched = 0, unmatched = 0, noLeg = 0;
const missing = new Map();
for (const f of all) {
  const leg = legOf(f.evidenceFrame) || legOf(f.frame);
  if (!leg) { noLeg++; continue; }
  const key = f.scenario + "__" + leg;
  if (drove.has(key)) matched++;
  else { unmatched++; missing.set(key, (missing.get(key) || 0) + 1); }
}
console.log("");
console.log("  STILL rows whose OWN leg was re-driven      : " + matched);
console.log("  STILL rows whose own leg was NOT re-driven  : " + unmatched);
console.log("  STILL rows citing no leg (sweep161 format)  : " + noLeg);
console.log("");
if (missing.size) {
  console.log("  the (lesson,leg) pairs a future sweep should add — top 15 by row count:");
  for (const [k, v] of [...missing.entries()].sort((a, c) => c[1] - a[1]).slice(0, 15)) {
    console.log("    " + String(v).padStart(3) + "  " + k);
  }
  console.log("");
  console.log("  total missing pairs: " + missing.size + "  (~" + missing.size + " drives, ~" + Math.round((missing.size * 250) / 4 / 60) + " min on 4 drivers)");
  fs.writeFileSync(REPO + "/.audit-frames/missing-legs.json", JSON.stringify([...missing.keys()], null, 1));
  console.log("  -> .audit-frames/missing-legs.json");
}
