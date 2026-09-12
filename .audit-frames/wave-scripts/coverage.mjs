// Is the sweep actually covering what it promised? A lesson that plans 0 drives
// prints as success at exit 0 (that is what the first canary did), and the gap
// only shows up at adjudication when a judge has nothing new to open.
import fs from "node:fs";
const REPO = "E:/AI driver";
const want = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/waveC-redrive.json", "utf8"));

const got = new Map(); // lesson -> Set(leg)
let rows = 0;
for (const s of [1, 2, 3, 4]) {
  const p = REPO + "/.audit-frames/fill-w1s" + s + "/wave-c-results.jsonl";
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").trim().split("\n")) {
    if (!l.trim()) continue;
    try {
      const j = JSON.parse(l);
      rows++;
      if (!got.has(j.lesson)) got.set(j.lesson, new Set());
      got.get(j.lesson).add(j.leg);
    } catch { /* skip */ }
  }
}

// which shard owns each lesson, so "not yet reached" can be told from "skipped"
const owner = new Map();
for (let s = 1; s <= 4; s++) {
  const rowsS = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/redrive-shard-" + s + ".json", "utf8"));
  rowsS.forEach((r, i) => owner.set(r.lesson, { shard: s, idx: i, of: rowsS.length }));
}
// how far each shard has got, by counting distinct lessons it has produced
const done = new Map();
for (let s = 1; s <= 4; s++) done.set(s, 0);
for (const [lesson, legs] of got) {
  const o = owner.get(lesson);
  if (o) done.set(o.shard, Math.max(done.get(o.shard), o.idx + 1));
}

let complete = 0, partial = 0, notYet = 0;
const shortfall = [];
for (const w of want) {
  const g = got.get(w.lesson);
  const o = owner.get(w.lesson) || { shard: 0, idx: 0 };
  const reached = o.idx < (done.get(o.shard) || 0);
  if (!g) { if (reached) shortfall.push({ lesson: w.lesson, want: w.legs, got: [], why: "shard passed it, produced nothing" }); else notYet++; continue; }
  const missing = w.legs.filter((l) => !g.has(l));
  if (!missing.length) complete++;
  else if (reached) { partial++; shortfall.push({ lesson: w.lesson, want: w.legs, got: [...g], why: "missing " + missing.join(",") }); }
  else notYet++;
}
console.log("  drives recorded          : " + rows);
console.log("  lessons fully driven     : " + complete);
console.log("  lessons partially driven : " + partial);
console.log("  lessons not reached yet  : " + notYet);
console.log("  shard progress (lessons) : " + [1, 2, 3, 4].map((s) => s + ":" + done.get(s)).join("  "));
console.log("");
if (shortfall.length) {
  console.log("  SHORTFALLS — a shard moved past these without producing every leg:");
  for (const s of shortfall.slice(0, 15)) console.log("    " + s.lesson.padEnd(28) + "want[" + s.want.join(",") + "] got[" + s.got.join(",") + "]  " + s.why);
  if (shortfall.length > 15) console.log("    ...and " + (shortfall.length - 15) + " more");
} else {
  console.log("  No shortfalls: every lesson a shard has passed produced all its legs.");
}
