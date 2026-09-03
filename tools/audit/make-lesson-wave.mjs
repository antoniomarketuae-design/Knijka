// Generate a repair wave — ONE LANE PER LESSON, with every open row on it.
//
// WHY THIS GROUPING. Wave 17 proved one-lane-per-DEFECT beats one-lane-per-FILE
// by 42x (3,031 lines vs 71) because a defect spanning 3+ files cannot be
// repaired from inside one of them. Wave 19 then regressed to the old shape by
// my mistake and landed 24 lines.
//
// But "one lane per defect" only had 21 known multi-file defects to work with.
// The generalisation that scales: a LESSON is the natural unit. Its open rows
// share a template, a world, a runner and usually a grader, so one agent
// holding all of them can see the whole failure rather than a slice — and two
// lessons rarely contend for the same file, so lanes can run in PARALLEL
// instead of the sequential crawl that made wave 17 take 15 hours.
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "E:/AI driver";
const WAVE = process.argv[2] || "repair-wave-next.js";

const { loadOpenFindings, normFile, corpusCounts, openListLine, workedLine } = await import("file:///E:/AI%20driver/tools/audit/finding-reader.mjs");

// The live verdict per finding — only confirmed-STILL rows are worth a lane.
const V = new Map();
for (const l of readFileSync(`${REPO}/.audit-frames/wave-c/verdicts.jsonl`, "utf8").split("\n")) {
  if (!l.trim()) continue;
  try { const j = JSON.parse(l); if (j.findingId) V.set(j.findingId, j); } catch { /* torn line */ }
}

const open = loadOpenFindings();
const still = open.filter((f) => {
  if (f.unrepairable) return false;
  const v = V.get(f.findingId);
  return v && String(v.verdict).toUpperCase() === "STILL";
});

// Group by lesson.
const byLesson = new Map();
for (const f of still) {
  const lesson = f.scenario || f.lesson;
  if (!lesson || lesson === "app-login") continue;   // app-login has no /simulator route to drive
  if (!byLesson.has(lesson)) byLesson.set(lesson, []);
  byLesson.get(lesson).push(f);
}

// Rank: most critical first, then most rows.
const lanes = [...byLesson.entries()]
  .map(([lesson, rows]) => ({
    lesson,
    rows,
    critical: rows.filter((r) => String(r.severity).toLowerCase() === "critical").length,
    files: [...new Set(rows.map((r) => normFile(r.suspectFile)).filter((x) => x && x !== "unknown"))],
  }))
  .sort((a, b) => b.critical - a.critical || b.rows.length - a.rows.length)
  .slice(0, 18);

const esc = (s) => JSON.stringify(String(s ?? ""));

const laneLits = lanes.map((l) => `
  {
    lesson: ${esc(l.lesson)},
    critical: ${l.critical},
    files: ${JSON.stringify(l.files)},
    rows: [${l.rows.map((r) => `
      { id: ${esc(r.findingId)}, sev: ${esc(r.severity)}, what: ${esc(String(r.what || "").replace(/\s+/g, " "))}, frame: ${esc(r.frame)}, file: ${esc(normFile(r.suspectFile))} },`).join("")}
    ],
  },`).join("");

// STAMP THE COUNT INTO THE FILE THIS GENERATES. count-agreement.mjs compares
// every corpus-reading tool against every other; a generator that reads the
// corpus and prints no stamp is a counter nobody can check, which is how four
// tools once printed four different totals.
const counts = corpusCounts();
const stamp = "// " + openListLine(counts) + "\n// " + workedLine("open", still) + "\n";

const script = stamp + `export const meta = {
  name: 'repair-wave-${WAVE.replace(/[^0-9]/g,'') || 'next'}',
  description: 'One lane per LESSON with all of its open rows and their whole file set, run in parallel',
  phases: [
    { title: 'Repair', detail: 'one lesson at a time, every row on it, every file it needs' },
  ],
}

// ONE LANE PER LESSON. A lesson's open rows share a template, a world, a runner
// and usually a grader, so one agent holding all of them sees the whole failure
// instead of a slice. Two lessons rarely contend for the same file, which is
// what lets these run in PARALLEL — wave 17's one-lane-per-defect had to be
// sequential because types.ts / catalog.ts / engine.ts recurred everywhere.
const LESSONS = [${laneLits}
]

phase('Repair')

const results = await parallel(LESSONS.map((L) => () =>
  agent(
    \`You are repairing every open audit row on ONE LESSON of a browser driving simulator at ${REPO} (a Bulgarian driving-theory + simulator product for 17-18 year olds).

LESSON: \${L.lesson}   (\${L.rows.length} open row(s), \${L.critical} critical)

THE ROWS:
\${L.rows.map((r, i) => \`
  [\${i + 1}] \${r.id}  [\${r.sev}]
      filed against : \${r.file}
      what          : \${r.what}
      frame         : \${r.frame}\`).join('\\n')}

FILES THOSE ROWS ARE ADDRESSED TO:
\${L.files.map((f) => '  - ' + f).join('\\n')}

That address list is a HINT and is often WRONG — measured on this corpus, two thirds of findings named a file that cannot contain the defect. Derive the real owners yourself by reading the code. You may edit every file the repair genuinely needs.

THE RULES, IN THE ORDER THAT MATTERS:

0. THE HARNESS IS NOT THE PRODUCT, and this is the rule that cost the most.
   Measured on the w24 round: 8 of 13 proposed closures were overturned, and the
   commonest reason was a row declared ALREADY-FIXED because a symptom stopped
   appearing — when what had changed was the DRIVER, not the code.
   sc-ov-crest-curve was closed because 27 full stops became 1; sweep161s own log
   says those 27 stops were «refused 11 standstill brake presses · re-asserted the
   brake 6x after the sim lost the key», i.e. a broken harness fighting the sim,
   and the harness has since gained a pace tape. The lessons real defect — no
   objective can fire — is unchanged at 0 of 3.
   SO: before you write ALREADY-FIXED, use git log -S or diff the OWNING file
   between the build the row was filed against and HEAD, and NAME the commit that
   repaired it. If no product commit touched it, the row is not fixed — say what
   changed in the harness instead, and leave the row open.

1. VERIFY EACH CAUSE IN CURRENT SOURCE BEFORE EDITING. These rows were filed against older builds and many waves have run since. If a row is ALREADY FIXED, say so with the evidence and change nothing for it. If it was never a defect, say REFUTED and prove it. Both are valuable outcomes — a wave that always finds something to change is inventing work.

2. LAND CODE OR LAND NOTHING. Never write an essay into a source file. A previous wave produced 265 lines of comment and zero code across four files; that is worse than an empty diff, because a comment makes git report the file as changed and unlocks the audit's re-closure gate. Analysis goes in your REPORT.

3. IT MUST COMPILE AND THE SUITE MUST STAY GREEN. Run \\\`npx tsc --noEmit -p tsconfig.json\\\` from platform/, and the tests covering what you touched. If a TOTAL Record gains a member (rules/n38.ts N38_BASIS, rules/catalog.ts VIOLATIONS, world/referents.ts), every such Record needs the row or it is a compile error — that omission killed an earlier attempt.

4. WIRE IT TO A LIVE CONSUMER. Measured here: 51 of 82 audited repairs shipped a predicate nothing reads. Name the component, debrief or scoring path that surfaces your change to a student on /simulator. If nothing consumes it, you have not repaired anything.

5. ADR-002 — THE PRODUCT MAY NEVER FREE-RECALL BULGARIAN LAW. Any lawRef must be retrieved from content/law/acts/zdvp.json, content/signs/signs.json or an existing catalog row, and cited. Never write a citation from memory.

6. REQUIREMENT-ZERO (doc 64 THEO-4): every decision explains itself. A new offence needs an explanationBg saying WHY it is dangerous. Never a bare verdict.

7. DO NOT weaken a test to make it pass and DO NOT flip a content status field. If a test legitimately needs a new expectation because the product changed, update the EXPECTATION and say exactly why in your report.

8. DO NOT START A DEV SERVER. A previous lane started two and they corrupted a production build by holding .next.

9. STAY INSIDE YOUR LESSON. Other lanes are repairing other lessons in this same working tree right now. Touching a shared file is allowed when the defect genuinely lives there — but read it first, make the smallest change that works, and never reformat or reorganise a file you do not own.

Report per row: what you verified, the verdict (REPAIRED / ALREADY-FIXED / REFUTED / BLOCKED with the reason), what you changed and where, the live consumer, and what you ran.\`,
    { label: \`lesson:\${L.lesson}\`, phase: 'Repair' },
  )
))

return { lessons: LESSONS.length, rows: LESSONS.reduce((n, L) => n + L.rows.length, 0), results }
`;

// AN ABSOLUTE PATH IS HONOURED AS GIVEN. count-agreement.mjs hands every
// corpus-reading tool a TEMP path and compares what they all count; a generator
// that ignores it would scribble on the .audit-frames work-list a running sweep
// is reading. Relative names still land in .audit-frames/ for ordinary use.
const isAbs = WAVE.length > 1 && (WAVE[1] === ":" || WAVE[0] === "/" || WAVE[0] === "\\");
const outPath = isAbs ? WAVE : `${REPO}/.audit-frames/${WAVE}`;
writeFileSync(outPath, script, "utf8");
console.log("wrote " + outPath);
console.log(`lanes: ${lanes.length} lessons · ${lanes.reduce((n, l) => n + l.rows.length, 0)} rows · ${lanes.reduce((n, l) => n + l.critical, 0)} critical`);
for (const l of lanes) console.log(`   ${l.lesson.padEnd(28)} ${String(l.rows.length).padStart(2)} rows  ${String(l.critical).padStart(2)} crit  ${l.files.length} files`);
