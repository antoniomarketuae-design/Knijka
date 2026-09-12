// 475 STILL rows -> root causes. A repair wave batched by ROOT CAUSE retires
// many rows per fix; batched by file alone it fixes one symptom at a time.
import fs from "node:fs";
const REPO = "E:/AI driver";
const b = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));
const all = [];
for (const e of b) for (const f of e.findings) all.push({ ...f, file: e.file });

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[«»„“”"'()\[\],.:;!?—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const K = 6;
const shingles = new Map(); // shingle -> Set(index)
all.forEach((f, i) => {
  const w = norm(f.what).split(" ").filter(Boolean);
  const seen = new Set();
  for (let j = 0; j + K <= w.length; j++) {
    const s = w.slice(j, j + K).join(" ");
    if (seen.has(s)) continue;
    seen.add(s);
    if (!shingles.has(s)) shingles.set(s, new Set());
    shingles.get(s).add(i);
  }
});

// greedy set-cover: repeatedly take the shingle covering the most unassigned findings
const unassigned = new Set(all.map((_, i) => i));
const clusters = [];
while (unassigned.size) {
  let best = null;
  let bestN = 0;
  for (const [s, set] of shingles) {
    let n = 0;
    for (const i of set) if (unassigned.has(i)) n++;
    if (n > bestN) { bestN = n; best = s; }
  }
  if (!best || bestN < 3) break;
  const members = [...shingles.get(best)].filter((i) => unassigned.has(i));
  members.forEach((i) => unassigned.delete(i));
  clusters.push({ key: best, members });
}
clusters.sort((a, b2) => b2.members.length - a.members.length);

console.log("475 STILL rows -> " + clusters.length + " clusters of >=3, " + unassigned.size + " singletons/pairs left over");
console.log("");
let cum = 0;
for (const c of clusters.slice(0, 30)) {
  const ms = c.members.map((i) => all[i]);
  const files = [...new Set(ms.map((m) => m.file))];
  const crit = ms.filter((m) => m.severity === "critical").length;
  cum += ms.length;
  console.log("[" + String(ms.length).padStart(3) + " rows, " + crit + " crit, cum " + cum + "]  \"" + c.key.slice(0, 72) + "\"");
  console.log("      files: " + files.slice(0, 3).join(" · ") + (files.length > 3 ? " (+" + (files.length - 3) + ")" : ""));
  console.log("      eg   : " + String(ms[0].what).replace(/\s+/g, " ").slice(0, 165));
  console.log("");
}

fs.writeFileSync(
  REPO + "/.audit-frames/still-clusters.json",
  JSON.stringify(
    clusters.map((c) => ({
      key: c.key,
      n: c.members.length,
      critical: c.members.filter((i) => all[i].severity === "critical").length,
      files: [...new Set(c.members.map((i) => all[i].file))],
      findingIds: c.members.map((i) => all[i].findingId),
      scenarios: [...new Set(c.members.map((i) => all[i].scenario))],
      examples: c.members.slice(0, 4).map((i) => ({ findingId: all[i].findingId, what: all[i].what, why: all[i].why })),
    })),
    null,
    2,
  ),
);
const leftovers = [...unassigned].map((i) => all[i]);
fs.writeFileSync(REPO + "/.audit-frames/still-leftovers.json", JSON.stringify(leftovers, null, 2));
console.log("clusters -> .audit-frames/still-clusters.json   leftovers(" + leftovers.length + ") -> .audit-frames/still-leftovers.json");
