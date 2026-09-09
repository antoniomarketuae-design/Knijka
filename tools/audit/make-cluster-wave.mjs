// Generate a repair wave — ONE LANE PER SHARED CAUSE (a hot file and every open
// row that names it), with the leftover long tail packed by lesson.
//
// WHY A THIRD WAVE SHAPE, AFTER TWO WERE ALREADY MEASURED.
//
// Wave 17 measured one-lane-per-FILE at 71 lines and one-lane-per-DEFECT at
// 3,031 — 42x — because a defect spanning three files cannot be repaired from
// inside one of them. make-lesson-wave.mjs generalised that to one lane per
// LESSON and it ran 3,090 lines in 5.2h parallel. That shape was right for a
// corpus where a lesson carried 5-20 open rows.
//
// It is the wrong shape NOW, and the corpus says so. At 135 open rows over 78
// lessons the median lane would hold 1.7 rows: 78 agents, each paying the full
// cost of learning a lesson's template, world, runner and grader, to change one
// line. Meanwhile the rows concentrate hard by FILE — rules/engine.ts carries 14
// rows across 11 different lessons, objectives.ts 10 across 10. Those are not 24
// defects. They are a handful of causes seen from 21 lesson-shaped windows.
//
// So a lane here is A CAUSE: one hot file, every open row naming it, and the
// union of every OTHER file those rows reach into. It keeps what made the lesson
// shape win — the agent may follow the defect wherever it actually lives — while
// giving it 8-14 related rows to generalise from instead of 1.
//
// AND IT FIXES A CONTENTION BUG THE LESSON SHAPE HAD. Under lesson lanes, every
// one of 78 parallel agents could reach into rules/engine.ts, and several did;
// two agents rewriting one file in one working tree is how a wave lands a diff
// nobody authored. Here each hot file has EXACTLY ONE owner by construction, and
// every lane is told which files belong to someone else this wave.
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "E:/AI driver";
const WAVE = process.argv[2] || "repair-wave-next.js";
const MAX_LANES = Number(process.argv[3] || 14);

const { loadOpenFindings, normFile, corpusCounts, openListLine, workedLine } =
  await import("file:///E:/AI%20driver/tools/audit/finding-reader.mjs");

// The live verdict per finding — only confirmed-STILL rows are worth a lane.
const V = new Map();
for (const l of readFileSync(`${REPO}/.audit-frames/wave-c/verdicts.jsonl`, "utf8").split("\n")) {
  if (!l.trim()) continue;
  try { const j = JSON.parse(l); if (j.findingId) V.set(j.findingId, j); } catch { /* torn line */ }
}

const open = loadOpenFindings();
const still = open.filter((f) => {
  if (f.unrepairable) return false;
  if ((f.scenario || f.lesson) === "app-login") return false;  // no /simulator route to drive
  const v = V.get(f.findingId);
  return v && String(v.verdict).toUpperCase() === "STILL";
});

// Every file a row reaches: the address it was filed against, plus the reroute
// secondary, which is where a re-addressed row's real owner was recorded.
const filesOf = (r) =>
  [r.suspectFile, r.rerouteSecondary]
    .filter(Boolean)
    .map(normFile)
    .filter((x) => x && x !== "unknown");

// --- seed lanes by hot file --------------------------------------------------
// Greedy, largest cause first. A row is claimed once; the file that claims it is
// that lane's OWNED file. Recount after each claim, because claiming engine.ts
// changes how hot objectives.ts still is — a static ranking would hand the
// second lane rows the first one already took.
const unclaimed = new Set(still.map((r) => r.findingId));
const byId = new Map(still.map((r) => [r.findingId, r]));
const lanes = [];

while (lanes.length < MAX_LANES && unclaimed.size) {
  const tally = new Map();
  for (const id of unclaimed) {
    for (const f of filesOf(byId.get(id))) {
      if (!tally.has(f)) tally.set(f, []);
      tally.get(f).push(id);
    }
  }
  if (!tally.size) break;
  const [hot, ids] = [...tally.entries()].sort(
    (a, b) =>
      b[1].length - a[1].length ||
      b[1].filter((i) => byId.get(i).severity === "critical").length -
        a[1].filter((i) => byId.get(i).severity === "critical").length,
  )[0];
  // A "cause" of one row is not a cause; stop seeding and let the packer take
  // the rest, or single-row lanes eat the whole budget on the long tail.
  if (ids.length < 2) break;
  for (const id of ids) unclaimed.delete(id);
  lanes.push({ kind: "cause", owns: hot, rows: ids.map((i) => byId.get(i)) });
}

// --- pack the leftovers by lesson --------------------------------------------
// What remains is genuinely scattered: rows whose file nobody else names. Keep
// a lesson whole (its rows share a template and a world) and pack lessons into
// lanes of roughly TARGET rows so no agent is spun up for one line.
const TARGET = 8;
const leftover = new Map();
for (const id of unclaimed) {
  const r = byId.get(id);
  const k = r.scenario || r.lesson || "unknown";
  if (!leftover.has(k)) leftover.set(k, []);
  leftover.get(k).push(r);
}
const groups = [...leftover.entries()].sort((a, b) => b[1].length - a[1].length);
let bucket = [];
const flush = () => {
  if (bucket.length) lanes.push({ kind: "tail", owns: null, rows: bucket });
  bucket = [];
};
for (const [, rows] of groups) {
  bucket = bucket.concat(rows);
  if (bucket.length >= TARGET) flush();
}
flush();

// Every file this wave will touch, and who owns it. A lane that finds the defect
// in someone else's file must REPORT it, not race for it.
const owners = new Map();
for (const l of lanes) if (l.owns) owners.set(l.owns, l);

for (const l of lanes) {
  l.lessons = [...new Set(l.rows.map((r) => r.scenario || r.lesson))];
  l.files = [...new Set(l.rows.flatMap(filesOf))];
  l.critical = l.rows.filter((r) => String(r.severity).toLowerCase() === "critical").length;
  l.key = l.owns ? l.owns.split("/").slice(-2).join("/") : `tail:${l.lessons[0]}`;
  l.foreign = l.files.filter((f) => owners.has(f) && owners.get(f) !== l);
}
lanes.sort((a, b) => b.critical - a.critical || b.rows.length - a.rows.length);

const esc = (s) => JSON.stringify(String(s ?? ""));
const laneLits = lanes.map((l) => `
  {
    key: ${esc(l.key)},
    owns: ${l.owns ? esc(l.owns) : "null"},
    critical: ${l.critical},
    lessons: ${JSON.stringify(l.lessons)},
    files: ${JSON.stringify(l.files)},
    foreign: ${JSON.stringify(l.foreign)},
    rows: [${l.rows.map((r) => `
      { id: ${esc(r.findingId)}, lesson: ${esc(r.scenario || r.lesson)}, sev: ${esc(r.severity)}, what: ${esc(String(r.what || "").replace(/\s+/g, " "))}, frame: ${esc(r.frame)}, file: ${esc(normFile(r.suspectFile))} },`).join("")}
    ],
  },`).join("");

// STAMP THE COUNT INTO THE FILE THIS GENERATES. count-agreement.mjs compares
// every corpus-reading tool against every other; a generator that reads the
// corpus and prints no stamp is a counter nobody can check.
const counts = corpusCounts();
const stamp = "// " + openListLine(counts) + "\n// " + workedLine("open", still) + "\n";

const script = stamp + `export const meta = {
  name: 'repair-wave-${WAVE.replace(/[^0-9]/g, "") || "next"}',
  description: 'One lane per SHARED CAUSE — a hot file and every open row that names it — with the long tail packed by lesson',
  phases: [
    { title: 'Repair', detail: 'one cause at a time, every row that shows it, every file it reaches' },
  ],
}

// ONE LANE PER CAUSE. Each lane OWNS one file: it is the only lane this wave
// allowed to edit it. Rows come from many lessons on purpose — a cause seen from
// four lesson-shaped windows is still one cause, and repairing it once beats
// four lanes each patching their own view of it.
const LANES = [${laneLits}
]

phase('Repair')

const results = await parallel(LANES.map((L) => () =>
  agent(
    \`You are repairing a SHARED CAUSE behind several open audit rows of a browser driving simulator at ${REPO} (a Bulgarian driving-theory + simulator product for 17-18 year olds).

\${L.owns ? \`THIS LANE OWNS: \${L.owns}
You are the ONLY lane this wave permitted to edit that file. Other lanes are
running right now in the same working tree.\` : \`THIS LANE IS TAIL WORK: scattered rows whose files no other lane names.\`}

ROWS (\${L.rows.length}, \${L.critical} critical) across \${L.lessons.length} lesson(s):
\${L.rows.map((r, i) => \`
  [\${i + 1}] \${r.id}  [\${r.sev}]  lesson \${r.lesson}
      filed against : \${r.file}
      what          : \${r.what}
      frame         : \${r.frame}\`).join('\\n')}

EVERY FILE THESE ROWS REACH:
\${L.files.map((f) => '  - ' + f).join('\\n')}
\${L.foreign.length ? \`
OWNED BY ANOTHER LANE THIS WAVE — DO NOT EDIT, REPORT INSTEAD:
\${L.foreign.map((f) => '  ! ' + f).join('\\n')}\` : ''}

That address list is a HINT and is often WRONG — measured on this corpus, two thirds of findings named a file that cannot contain the defect. Derive the real owners yourself by reading the code.

FIRST, ASK WHETHER THESE ROWS ARE ONE DEFECT OR SEVERAL. They were grouped because they name a file in common, which is evidence of a shared cause and not proof of one. If they are one cause, fix it once and say which rows it settles. If they are three unrelated defects that happen to live in one file, say so and fix them separately. Do not invent a unifying story.

THE RULES, IN THE ORDER THAT MATTERS:

0. THE HARNESS IS NOT THE PRODUCT, and this is the rule that cost the most.
   On the w24 round, 8 of 13 proposed closures were overturned, and the commonest
   reason was a row declared ALREADY-FIXED because a symptom stopped appearing —
   when what had changed was the DRIVER, not the code. sc-ov-crest-curve was
   closed because 27 full stops became 1; the sweep's own log says those 27 stops
   were a broken harness fighting the sim, and the harness has since gained a pace
   tape. The lesson's real defect was unchanged.
   SO: before you write ALREADY-FIXED, use git log -S or diff the OWNING file
   between the build the row was filed against and HEAD, and NAME the commit that
   repaired it. If no product commit touched it, the row is not fixed.

1. VERIFY EACH CAUSE IN CURRENT SOURCE BEFORE EDITING. These rows were filed against older builds and many waves have run since. If a row is ALREADY FIXED, say so with the evidence and change nothing for it. If it was never a defect, say REFUTED and prove it. Both are valuable outcomes — a wave that always finds something to change is inventing work.

1b. TWO MEASUREMENT TRAPS THAT COST THE w30 ROUND, BOTH FOUND BY VERIFIERS.

   A results-file "ms" FIELD IS NOT DRIVE TIME. It is the whole leg: page
   load, sign-in, briefing, demo playback, drive and debrief scroll together.
   Two w30 verdicts quoted it as time behind the wheel and inflated their claim
   2.6x — "5 full stops over 169 s" was a 169,192 ms LEG against about 64 s
   of actual driving. For drive duration read the last 04-t<NNN>s frame name or
   the PACE line in run.log. Never the results file.

   A FORCE-TERMINATED LEG IS NOT COMPARABLE TO A COMPLETE ONE. run.log says
   'ended naturally: false (forced via Прекрати урока)' when the harness burned
   its 210 s budget and stopped the session itself. An objective is then
   unticked because THE CAR WAS CUT OFF SHORT OF IT, not because the product
   withheld credit: w30 nearly retired a critical row on exactly that
   comparison, on a leg whose odometer read 208 m of a 300 m route. Check
   'ended naturally' and the odometer against the authored route length before
   concluding anything from a missing tick.

2. LAND CODE OR LAND NOTHING. Never write an essay into a source file. An earlier wave produced 265 lines of comment and zero code across four files; that is worse than an empty diff, because a comment makes git report the file as changed and unlocks the audit's re-closure gate. Analysis goes in your REPORT.

3. IT MUST COMPILE AND THE SUITE MUST STAY GREEN. Run \\\`npx tsc --noEmit -p tsconfig.json\\\` from platform/, and the tests covering what you touched. If a TOTAL Record gains a member (rules/n38.ts N38_BASIS, rules/catalog.ts VIOLATIONS, world/referents.ts), every such Record needs the row or it is a compile error.

4. WIRE IT TO A LIVE CONSUMER. Measured here: 51 of 82 audited repairs shipped a predicate nothing reads. Name the component, debrief or scoring path that surfaces your change to a student on /simulator. If nothing consumes it, you have not repaired anything.

5. ADR-002 — THE PRODUCT MAY NEVER FREE-RECALL BULGARIAN LAW. Any lawRef must be retrieved from content/law/acts/zdvp.json, content/signs/signs.json or an existing catalog row, and cited. Never write a citation from memory.

6. REQUIREMENT-ZERO (doc 64 THEO-4): every decision explains itself. A new offence needs an explanationBg saying WHY it is dangerous. Never a bare verdict.

7. DO NOT weaken a test to make it pass and DO NOT flip a content status field. If a test legitimately needs a new expectation because the product changed, update the EXPECTATION and say exactly why in your report.

8. DO NOT START A DEV SERVER. A previous lane started two and they corrupted a production build by holding .next.

9. SMALLEST CHANGE THAT WORKS on any file you do not own. Never reformat or reorganise one.

Report per row: what you verified, the verdict (REPAIRED / ALREADY-FIXED / REFUTED / BLOCKED with the reason), what you changed and where, the live consumer, and what you ran. Then say plainly whether these rows turned out to be ONE cause or several.\`,
    { label: \`cause:\${L.key}\`, phase: 'Repair' },
  )
))

return { lanes: LANES.length, rows: LANES.reduce((n, L) => n + L.rows.length, 0), results }
`;

// AN ABSOLUTE PATH IS HONOURED AS GIVEN — count-agreement.mjs hands every
// corpus-reading tool a TEMP path and compares what they all count.
const isAbs = WAVE.length > 1 && (WAVE[1] === ":" || WAVE[0] === "/" || WAVE[0] === "\\");
const outPath = isAbs ? WAVE : `${REPO}/.audit-frames/${WAVE}`;
writeFileSync(outPath, script, "utf8");
console.log("wrote " + outPath);
console.log(
  `lanes: ${lanes.length} (${lanes.filter((l) => l.kind === "cause").length} cause / ${lanes.filter((l) => l.kind === "tail").length} tail) · ` +
    `${lanes.reduce((n, l) => n + l.rows.length, 0)} rows · ${lanes.reduce((n, l) => n + l.critical, 0)} critical`,
);
for (const l of lanes) {
  console.log(`   ${String(l.rows.length).padStart(3)} rows  ${String(l.critical).padStart(2)} crit  ${l.lessons.length} lessons  ${l.owns || "(tail)"}`);
}
