// Which banked retirements would have their evidence photograph REPLACED if the
// new sweep were merged into .audit-frames/wave-c/ ?
// The path would still resolve, so finding-reader would not notice — the quote
// would simply no longer describe the picture. That is falsified evidence.
import fs from "node:fs";
const REPO = "E:/AI driver";
const SEP = String.fromCharCode(92);

// (lesson, leg) pairs this sweep is re-driving
const set = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/waveC-redrive.json", "utf8"));
const driving = new Set();
for (const r of set) for (const leg of r.legs) driving.add(r.lesson + "__" + leg);

const rows = [];
for (const l of fs.readFileSync(REPO + "/.audit-frames/wave-c/closures.jsonl", "utf8").split("\n")) {
  if (!l.trim()) continue;
  try { rows.push(JSON.parse(l)); } catch { /* skip */ }
}

let waveCCited = 0;
let wouldBeReplaced = 0;
const hit = new Set();
for (const r of rows) {
  const p = String(r.evidenceFrame || "").split(SEP).join("/");
  const i = p.indexOf(".audit-frames/wave-c/frames/");
  if (i < 0) continue;
  waveCCited++;
  const dir = p.slice(i + ".audit-frames/wave-c/frames/".length).split("/")[0];
  if (driving.has(dir)) { wouldBeReplaced++; hit.add(dir); }
}
console.log("  retirements citing wave-c/frames : " + waveCCited);
console.log("  of those, on a (lesson,leg) THIS SWEEP re-drives : " + wouldBeReplaced);
console.log("  distinct frame directories affected : " + hit.size);
console.log("");
if (wouldBeReplaced) {
  console.log("  VERDICT: merging into wave-c/ would overwrite the evidence photograph of");
  console.log("           " + wouldBeReplaced + " banked retirement(s). Each would still RESOLVE, so no tool");
  console.log("           would complain — the quote would simply stop describing the picture.");
  console.log("           Merge to a NEW destination instead.");
  console.log("");
  console.log("  first few affected directories:");
  for (const d of [...hit].slice(0, 8)) console.log("    " + d);
} else {
  console.log("  VERDICT: no overlap — merging into wave-c/ would replace nothing cited.");
}
