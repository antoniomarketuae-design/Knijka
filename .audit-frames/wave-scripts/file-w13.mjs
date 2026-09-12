// Three defects the w13 adjudication verifiers found while OVERTURNING closures.
// None had a row; each is photographed; each was corroborated against the drive
// ledger before filing. A verifier said of one of them that it would be lost
// unless someone filed it.
import fs from "node:fs";
const REPO = "E:/AI driver";
const F = REPO + "/.audit-frames/findings/chunk-wavec-new.jsonl";

const rows = [
  {
    scenario: "sc-ac-night-lights",
    works: "NO",
    rightCredited: "NO",
    wrongConvicted: "NOT-DRIVEN",
    endedBecause: "both re-driven legs stopped at the end of the guidance route and were stamped НЕЗАВЪРШЕН; w13 records pc-right and mobile-right at score 3.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "THE LESSON CANNOT BE PASSED AT ALL — the finish objective sits beyond the end of the route. sc-acn-finish is authored as a reachZone at y=330 radiusM 12 on a 360 m map, but the guidance route ends at ~282 m: the STEERED pc-right leg (TRACKED 131/131, 0 s off-line of 67 s) stops at 282.2 m and the unsteered mobile-right leg at 281.8 m — the same place to within half a metre, i.e. a deterministic route end and not a driver error. Both legs finish НЕЗАВЪРШЕН with «Мини контролната зона осветен» and «Стигни края на отсечката» still open. No student can complete this lesson on either platform.\n\nAND THE DEBRIEF STATES THE OPPOSITE: it prints «Стигна края на маршрута, затова урокът приключва тук» while withholding the tick for reaching the end. THIS IS NOT A FALSE REFUSAL. The car genuinely stopped 48 m short, so withholding the tick is correct; the false statement is the app's claim that the student arrived. A repair must move the zone or extend the route — NOT loosen the objective, which would put an incomplete drive through the gate.",
    frame: "E:/AI driver/.audit-frames/w13/frames/sc-ac-night-lights__pc-right/01-arrival.png",
    quote: "both legs stop at 282.2 m / 281.8 m against a finish zone at y=330 radiusM 12; w13 wave-c-results: pc-right and mobile-right both НЕЗАВЪРШЕН score=3",
    suspectFile: "platform/src/modules/sim/lessons/scenario/templates-conditions.ts",
  },
  {
    scenario: "sc-park-zebra",
    works: "NO",
    rightCredited: "NO",
    wrongConvicted: "YES-WRONGLY",
    endedBecause: "the mobile-right leg reached a verdict card; w13 records НЕИЗДЪРЖАН score 20.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "THE RULE ENGINE AND THE INSTRUMENT DISAGREE BY 18 км/ч, AND THE ENGINE'S NUMBER IS THE ONE THAT CONVICTS. On 04-t001s.png the cluster reads 22 км/ч beside a posted 20, while the violation card books «Превишаване с повече от 10 км/ч · Отчетена скорост 40,4 км/ч» for −10. The student is shown one speed and sentenced on another, with no way to reconcile them — and the quoted figure is the one that appears in the debrief.\n\nThis is what turns a single collision into 20 наказателни точки across the parking family (sc-park-zebra, sc-park-45-rev, sc-park-wall all record НЕИЗДЪРЖАН 20). Distinct from the «three speed numbers on one screen» rows: those are about ambiguity between surfaces that each state a real limit. This is a disagreement about what the car is actually doing.",
    frame: "E:/AI driver/.audit-frames/w13/frames/sc-park-zebra__mobile-right/04-t001s.png",
    quote: "cluster 22 км/ч · sign 20 · card «Превишаване с повече от 10 км/ч — Отчетена скорост 40,4 км/ч» −10",
    suspectFile: "platform/src/modules/sim/rules/engine.ts",
  },
  {
    scenario: "sc-ac-wind-truck-pass",
    works: "NO",
    rightCredited: "NOT-MEASURED",
    wrongConvicted: "YES-WRONGLY",
    endedBecause: "both wrong legs reached a verdict card; w13 records pc-wrong and mobile-wrong at НЕИЗДЪРЖАН score 39.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "A FALSE CERTIFICATE ON THE PRAISE SURFACE, ON BOTH PLATFORMS. The commendation «★ ✓ Чисто и спокойно каране» is awarded TWICE — at 0:49 and 1:11 on pc-wrong, at 0:47 and 1:10 on mobile-wrong — on a drive stamped НЕИЗДЪРЖАН with 39 наказателни точки, comprising 3 опасни (including a collision) and 3 основни. Confirmed in both _audit-debrief.json files and both run.logs.\n\nA student who crashes is told twice, on the same card that fails them, that their driving was clean and calm. debrief.ts only REORDERS praise under summary.score.hasDangerous; it never withholds it. The praise channel needs the same gate the objective channel got — a commendation must require the behaviour it names.",
    frame: "E:/AI driver/.audit-frames/w13/frames/sc-ac-wind-truck-pass__pc-wrong/08-debrief-p1.png",
    quote: "«★ ✓ Чисто и спокойно каране» at 0:49 and 1:11 on a card reading НЕИЗДЪРЖАН · 39 наказателни точки · 3 опасни incl. collision",
    suspectFile: "platform/src/modules/sim/lessons/debrief.ts",
  },
];

let bad = 0;
for (const r of rows) {
  try {
    const st = fs.statSync(r.frame);
    if (!st.isFile() || st.size === 0) { console.log("  ZERO/NOT-A-FILE: " + r.frame); bad++; }
    else console.log("  ok " + String(st.size).padStart(8) + " B  " + r.scenario + "  [" + r.severity + "]");
  } catch { console.log("  MISSING: " + r.frame); bad++; }
}
if (bad) { console.log("\nREFUSING to file — " + bad + " frame(s) do not resolve."); process.exit(1); }

const before = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
fs.appendFileSync(F, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const after = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
console.log("\n  chunk-wavec-new.jsonl: " + before + " -> " + after + " rows");
