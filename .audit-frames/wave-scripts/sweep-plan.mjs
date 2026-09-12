// The sweep that actually moves the count: re-photograph every lesson still
// carrying an open row, at the CURRENT commit, because 475 of 476 verdicts were
// read off frames older than the fixes they judge.
import fs from "node:fs";
const REPO = "E:/AI driver";
const b = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));

const lessons = new Map(); // lesson -> {rows, critical}
for (const e of b) {
  for (const f of e.findings) {
    const k = f.scenario;
    if (!k) continue;
    const cur = lessons.get(k) || { rows: 0, critical: 0 };
    cur.rows++;
    if (f.severity === "critical") cur.critical++;
    lessons.set(k, cur);
  }
}
const sorted = [...lessons.entries()].sort((a, c) => c[1].critical - a[1].critical || c[1].rows - a[1].rows);
console.log("lessons carrying an open STILL row: " + sorted.length);
console.log("");
console.log("heaviest 15 by critical count:");
for (const [k, v] of sorted.slice(0, 15)) console.log("  " + String(v.critical).padStart(2) + "c / " + String(v.rows).padStart(2) + " rows   " + k);

const list = sorted.map(([k]) => k);
fs.writeFileSync(REPO + "/.audit-frames/sweep-lessons.txt", list.join("\n") + "\n");
fs.writeFileSync(REPO + "/.audit-frames/sweep-lessons.csv", list.join(","));

// Shard across 4 drivers, interleaved so no shard gets all the heavy lessons.
const SHARDS = 4;
const shards = Array.from({ length: SHARDS }, () => []);
list.forEach((l, i) => shards[i % SHARDS].push(l));
shards.forEach((s, i) => fs.writeFileSync(REPO + "/.audit-frames/sweep-shard-" + (i + 1) + ".csv", s.join(",")));

console.log("");
console.log("SWEEP PLAN");
console.log("  lessons        : " + list.length);
console.log("  legs each      : 2 (pc-right, pc-wrong) -> " + list.length * 2 + " drives");
console.log("  shards         : " + SHARDS + "  (" + shards.map((s) => s.length).join(" / ") + " lessons)");
console.log("  est wall clock : ~" + Math.round((list.length * 2 * 250) / SHARDS / 60) + " min at the measured p50 of 222-250 s/drive");
console.log("  in-tool timeout: 900 s (longest real drive ever measured: 510 s)");
console.log("");
console.log("  -> .audit-frames/sweep-lessons.txt / .csv and sweep-shard-{1..4}.csv");
console.log("");
console.log("PRE-FLIGHT IS MANDATORY (invariant 2): run .audit-frames/wave-scripts/sweep-preflight.sh first.");
console.log("A dead DB photographs the PAYWALL at exit=0 with byte-identical frames — it cost 376 drives once.");
