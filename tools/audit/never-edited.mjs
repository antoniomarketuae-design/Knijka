#!/usr/bin/env node
/**
 * WHICH SUSPECT FILES HAS NOBODY ACTUALLY EDITED?
 *
 * OWNED IS NOT OPENED, and that distinction unstuck this audit after seven
 * rounds of the never-opened critical count refusing to move. Every one of the
 * 138 suspect files had been ASSIGNED to a lane, and a coverage count derived
 * from lane manifests cannot tell that from edited. Round 10 measured the gap at
 * its worst: seven lanes were handed 34 files and never touched thirteen of
 * them — exactly the thirteen still counted never-opened. A manifest-derived
 * union would have banked 34 findings as covered with not one byte changed.
 *
 * So this asks git, not the manifests.
 *
 *   node tools/audit/never-edited.mjs [--criticals|--majors|--all] [--json PATH]
 *
 * Baseline is `ec1f56f`, the commit the sweep corpus was captured against.
 *
 * THIS LIVES IN THE REPO ON PURPOSE. Its two predecessors were written in a
 * session scratchpad and a temp cleanup deleted them mid-programme — twice,
 * taking the workflow generator with them the first time. A loop that runs for
 * days cannot depend on a temp directory surviving.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.KNIJKA_AUDIT_BASE || "ec1f56f";
const DIR = path.join(REPO, ".audit-frames", "findings");

const argv = process.argv.slice(2);
const want = argv.includes("--majors") ? "majors" : argv.includes("--all") ? "all" : "criticals";
const jsonAt = argv.indexOf("--json");
const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;

// --- the corpus, with the supersession rule doc 88 states -------------------
const all = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".jsonl")) continue;
  for (const line of fs.readFileSync(path.join(DIR, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      j.__src = f;
      all.push(j);
    } catch {
      /* a torn tail line is not a reason to abandon the file */
    }
  }
}
const key = (j) => j.lesson || j.lessonId || j.scenario || j.id || null;
const redriven = new Set(
  all.filter((j) => j.__src === "chunk-redrive.jsonl").map(key).filter(Boolean),
);
const standing = all.filter(
  (j) => j.__src === "chunk-redrive.jsonl" || !(key(j) && redriven.has(key(j))),
);
const broken = standing.filter((j) => j.bucket === "BROKEN");
const norm = (s) => String(s || "").replace(/\\/g, "/");

const per = new Map();
for (const j of broken) {
  const f = norm(j.suspectFile);
  // `unknown` is a real bucket of 22 findings that no wave could ever see,
  // because every wave grouped on suspectFile. It has its own lane; it is not
  // a file, so it does not belong in a per-file count.
  if (!f || f === "unknown") continue;
  const e = per.get(f) || { file: f, total: 0, critical: 0 };
  e.total++;
  if (String(j.severity || "").toLowerCase() === "critical") e.critical++;
  per.set(f, e);
}

// --- what git says was touched ---------------------------------------------
const edited = new Set(
  execFileSync("git", ["diff", "--name-only", `${BASE}..HEAD`], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean),
);
// Directory-shaped entries are real in this corpus (`modules/sim/vehicle`), so a
// prefix match counts — otherwise six of them read as never-opened forever.
const isEdited = (f) => {
  const clean = f.replace(/\/$/, "");
  return edited.has(clean) || [...edited].some((e) => e.startsWith(clean + "/"));
};

const untouched = [...per.values()]
  .filter((e) => !isEdited(e.file))
  .filter((e) => (want === "criticals" ? e.critical > 0 : want === "majors" ? e.critical === 0 : true))
  .sort((a, b) => b.critical - a.critical || b.total - a.total);

const sum = (k) => untouched.reduce((n, e) => n + e[k], 0);
console.log(
  `suspect files with standing BROKEN : ${per.size}`,
);
console.log(
  `NEVER EDITED since ${BASE} (${want}) : ${untouched.length} files · ${sum("total")} findings · ${sum("critical")} critical`,
);
console.log("");
for (const e of untouched) {
  console.log("   ", String(e.critical).padStart(2) + "c/" + String(e.total).padStart(3), e.file);
}

if (jsonPath) {
  fs.writeFileSync(jsonPath, JSON.stringify(untouched, null, 1));
  console.log("");
  console.log("wrote", jsonPath);
}

if (!untouched.length) {
  console.log("");
  console.log(
    "NOTHING LEFT UNTOUCHED IN THIS CLASS. That is not the same as closed — a file can be\n" +
      "edited and its finding still open, and three files in round 9 were REFUTED on evidence\n" +
      "without an edit. Check the open list in docs/simulation/88_LESSON_AUDIT.md.",
  );
}
