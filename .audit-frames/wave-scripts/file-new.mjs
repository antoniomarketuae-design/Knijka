// File the four defects the adjudication verifiers found while overturning
// closures. Each was photographed, none had a row, and one verifier said in
// as many words that its finding "will be lost unless someone files it".
import fs from "node:fs";
const REPO = "E:/AI driver";
const F = REPO + "/.audit-frames/findings/chunk-wavec-new.jsonl";

const rows = [
  {
    scenario: "sc-sig-controller-postures",
    works: "NO",
    rightCredited: "NO",
    wrongConvicted: "NOT-DRIVEN",
    endedBecause: "the mobile-right leg reached a verdict card and was scored; w11 wave-c-results records verdict НЕИЗДЪРЖАН score 13.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "REGRESSION — THE MODEL DRIVE NOW KILLS A PEDESTRIAN. The lesson's own correct lane, the one that demonstrates how to obey a traffic controller, is FAILED on mobile at this commit: НЕИЗДЪРЖАН, 13 наказателни точки, with the опасна грешка «Удар в пешеходец». The filed baseline for this lesson records the right lane as ИЗДЪРЖАН, 0 наказателни точки, on BOTH platforms — so this is not a long-standing defect but a change for the worse. A student who follows the demonstration exactly is shown a run that runs someone over. Found by an adjudication verifier while overturning an unrelated closure; it survived only as a note inside sc-sig-controller-postures:f7e046c4 (UNJUDGED) and would have been lost with it.",
    frame: "E:/AI driver/.audit-frames/w11/frames/sc-sig-controller-postures__mobile-right/08-debrief-p1.png",
    quote: "НЕИЗДЪРЖАН · 13 наказателни точки · опасна грешка «Удар в пешеходец» (w11 wave-c-results.jsonl: lesson=sc-sig-controller-postures leg=mobile-right verdict=НЕИЗДЪРЖАН score=13)",
    suspectFile: "platform/src/modules/sim/lessons/scenario/templates-signals.ts",
  },
  {
    scenario: "sc-hz-emergency-stop",
    works: "NO",
    rightCredited: "YES-WRONGLY",
    wrongConvicted: "NOT-DRIVEN",
    endedBecause: "both re-driven legs reached a verdict card and were scored ИЗДЪРЖАН 3 точки.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "A CRAWL DODGES THE DRILL AND IS TOLD IT PASSED. Both re-driven legs peaked at 16 км/ч (pc-right) and 19 км/ч (mobile-right). SC_HZ_EMERGENCY_STOP_DART sets minTriggerSpeedKmh 25 (templates-hazards2.ts:145), so the child NEVER DARTED — the hazard the whole lesson exists to rehearse did not occur. Yet «✓ Спри преди детето — с пълна спирачка, в лентата» ticked and BOTH legs read ИЗДЪРЖАН · 3 т. · ★★☆. objectives.ts:1086-1090 states the mechanism in the build's own words: a drive that never reaches that speed never arms the encounter, and the loop falls through to `true`. The lesson therefore certifies emergency braking to a student who never braked, and drives slowly enough to avoid the test are the ones most likely to pass it.",
    frame: "E:/AI driver/.audit-frames/w11/frames/sc-hz-emergency-stop__pc-right/08-debrief-p1.png",
    quote: "ИЗДЪРЖАН · 3 наказателни точки on a leg whose top speed was 16 км/ч against minTriggerSpeedKmh 25 (w11 wave-c-results.jsonl: verdict=ИЗДЪРЖАН score=3, both pc-right and mobile-right)",
    suspectFile: "platform/src/modules/sim/lessons/objectives.ts",
  },
  {
    scenario: "sc-vu-emergency-junction",
    works: "NO",
    rightCredited: "NO",
    wrongConvicted: "YES-WRONGLY",
    endedBecause: "the pc-right leg reached a verdict card; w11 records НЕИЗДЪРЖАН score 23.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "PHANTOM CONVICTIONS — THE ENGINE BOOKS FAULTS AGAINST GEOMETRY THAT IS NOT ON THE GLASS. On pc-right, 04-t076s books «ОПАСНА ГРЕШКА −10 · Непропускане на пътно превозно средство с предимство» and around t200s books «Удар в неподвижно препятствие», while the windscreen holds no object at all — the frames at t065s–t100s are bare green/grey plane under an empty horizon. The student is failed for hitting and for failing to give way to things that are not rendered. Distinct from sc-vu-emergency-junction:7fab4e4e (the right drive being failed), which correctly stayed UNJUDGED: this row is about convictions raised against absent world, not about the verdict.",
    frame: "E:/AI driver/.audit-frames/w11/frames/sc-vu-emergency-junction__pc-right/04-t076s.png",
    quote: "ОПАСНА ГРЕШКА −10 · Непропускане на пътно превозно средство с предимство — booked on a beat whose windscreen carries no vehicle",
    suspectFile: "platform/src/modules/sim/rules/engine.ts",
  },
  {
    scenario: "sc-junction-blind",
    works: "PARTIAL",
    rightCredited: "NOT-MEASURED",
    wrongConvicted: "NOT-DRIVEN",
    endedBecause: "the mobile-right leg reached a verdict card; w11 records НЕИЗДЪРЖАН score 23.",
    bucket: "BROKEN",
    part: "A",
    severity: "major",
    what:
      "The mobile fault toast is truncated mid-word, ending at «…с», so the student is told they made a mistake and not what it was. Reported by an adjudication verifier that said explicitly it would be lost unless filed. Same family as the overflow-clip class repaired in ba3ed16 but on the mobile toast surface, which that lane did not touch.",
    frame: "E:/AI driver/.audit-frames/w11/frames/sc-junction-blind__mobile-right/04-t061s.png",
    quote: "fault toast cut mid-word at «…с»",
    suspectFile: "platform/src/modules/sim/hud/HudToasts.tsx",
  },
];

// every cited frame must resolve and be non-zero, or it is a claim, not evidence
let bad = 0;
for (const r of rows) {
  try {
    const st = fs.statSync(r.frame);
    if (!st.isFile() || st.size === 0) { console.log("  ZERO/NOT-A-FILE: " + r.frame); bad++; }
    else console.log("  ok " + String(st.size).padStart(8) + " B  " + r.scenario);
  } catch { console.log("  MISSING: " + r.frame); bad++; }
}
if (bad) { console.log("\nREFUSING to file — " + bad + " frame(s) do not resolve."); process.exit(1); }

const before = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
fs.appendFileSync(F, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const after = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
console.log("\n  chunk-wavec-new.jsonl: " + before + " -> " + after + " rows");
