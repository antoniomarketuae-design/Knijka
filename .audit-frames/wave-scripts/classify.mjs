// Classify the open list using wave-c-post's OWN precedence rule, then ASSERT
// against what wave-c-post itself reports — parsed, never hardcoded, because a
// hardcoded expectation goes stale the moment a round lands and then the
// assertion passes by being wrong in the same direction as the bug.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const REPO = "E:/AI driver";
const fr = await import(pathToFileURL(REPO + "/tools/audit/finding-reader.mjs").href);

const rows = [];
for (const line of fs.readFileSync(REPO + "/.audit-frames/wave-c/verdicts.jsonl", "utf8").split("\n")) {
  if (!line.trim()) continue;
  try { rows.push(JSON.parse(line)); } catch { /* wave-c-post owns malformed lines */ }
}

// --- lifted verbatim from tools/audit/wave-c-post.mjs -------------------------
const roundStart = [];
rows.forEach((r, i) => {
  const tag = r.correctedBy || "";
  if (!tag || tag === "verify") return;
  if (!roundStart.some((x) => x.tag === tag)) roundStart.push({ tag, at: i });
});
const roundOf = (i) => { let n = 0; for (let k = 0; k < roundStart.length; k += 1) if (i >= roundStart[k].at) n = k + 1; return n; };
const rank = (r, i) => roundOf(i) * 2 + (r.correctedBy === "verify" ? 1 : 0);
const final = new Map(); const finalRank = new Map();
rows.forEach((r, i) => {
  if (!r.findingId) return;
  const s = rank(r, i);
  if (!final.has(r.findingId) || s >= finalRank.get(r.findingId)) { final.set(r.findingId, r); finalRank.set(r.findingId, s); }
});
const frameOk = (p) => { try { const st = fs.statSync(String(p)); return st.isFile() && st.size > 0; } catch { return false; } };
const evidenced = (r) => Boolean(r.evidenceFrame && frameOk(r.evidenceFrame) && r.evidenceQuote);
const verdictOf = (r) => {
  let v = String(r.verdict || "").toUpperCase();
  if ((v === "CLOSED" || v === "REFUTED") && !evidenced(r)) v = "UNJUDGED";
  if (!["CLOSED", "STILL", "PARTIAL", "REFUTED", "UNJUDGED"].includes(v)) v = "UNJUDGED";
  return v;
};
// -----------------------------------------------------------------------------

const open = fr.loadOpenFindings();
const tally = { CLOSED: 0, STILL: 0, PARTIAL: 0, REFUTED: 0, UNJUDGED: 0 };
const cls = new Map();
for (const j of open) {
  const r = final.get(j.findingId);
  const v = r ? verdictOf(r) : "UNJUDGED";
  tally[v]++;
  cls.set(j.findingId, { v, r });
}

// the authority's own numbers, parsed from its report
const out = execFileSync("node", [REPO + "/tools/audit/wave-c-post.mjs"], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 });
const grab = (k) => { const m = out.match(new RegExp("\\b" + k + "\\s*:\\s*(\\d+)")); return m ? Number(m[1]) : null; };
const EXPECTED = { CLOSED: grab("CLOSED"), STILL: grab("STILL"), PARTIAL: grab("PARTIAL"), REFUTED: grab("REFUTED"), UNJUDGED: grab("UNJUDGED") };
console.log("classification vs wave-c-post (parsed live):");
let ok = true;
for (const k of Object.keys(EXPECTED)) {
  const good = tally[k] === EXPECTED[k];
  if (!good) ok = false;
  console.log("  " + k.padEnd(9) + String(tally[k]).padStart(4) + "   authority " + String(EXPECTED[k]).padStart(4) + "   " + (good ? "ok" : "MISMATCH"));
}
if (!ok) { console.log("\nNOT EQUIVALENT — do not batch on this data.\n"); process.exit(1); }
console.log("\nEQUIVALENT — reproduces the authority exactly.\n");

const still = open.filter((j) => cls.get(j.findingId).v === "STILL");
const partial = open.filter((j) => cls.get(j.findingId).v === "PARTIAL");
const enrich = (j) => {
  const r = cls.get(j.findingId).r || {};
  return { findingId: j.findingId, scenario: j.scenario, severity: j.severity, what: j.what, frame: j.frame,
           why: r.why, evidenceFrame: r.evidenceFrame, evidenceQuote: r.evidenceQuote, suspectFile: fr.normFile(j.suspectFile) || "unknown" };
};
const byFile = new Map();
for (const j of still) {
  const f = fr.normFile(j.suspectFile) || "unknown";
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(enrich(j));
}
const batches = [...byFile.entries()]
  .map(([file, findings]) => ({ file, n: findings.length, critical: findings.filter((f) => f.severity === "critical").length,
                                lessons: [...new Set(findings.map((f) => f.scenario))], findings }))
  .sort((a, b) => b.n - a.n);
fs.writeFileSync(REPO + "/.audit-frames/still-batches.json", JSON.stringify(batches, null, 2));
fs.writeFileSync(REPO + "/.audit-frames/partial-rows.json", JSON.stringify(partial.map(enrich), null, 2));
console.log("STILL  : " + still.length + " rows over " + batches.length + " files -> still-batches.json");
console.log("PARTIAL: " + partial.length + " rows -> partial-rows.json");
console.log("");
console.log("heaviest files:");
for (const b of batches.slice(0, 14)) console.log("  " + String(b.n).padStart(3) + " rows " + String(b.critical).padStart(3) + "c  " + b.file);
