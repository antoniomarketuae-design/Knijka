// Found by the PARTIAL-split agent while decomposing a different row, and
// explicitly reported as "not a clause of any parent" — i.e. it would have been
// lost. Corroborated against the drive ledger and the debrief JSON before filing.
import fs from "node:fs";
const REPO = "E:/AI driver";
const F = REPO + "/.audit-frames/findings/chunk-wavec-new.jsonl";

const rows = [
  {
    scenario: "sc-sp-wet-limit-plate",
    works: "NO",
    rightCredited: "NOT-MEASURED",
    wrongConvicted: "NO",
    endedBecause: "the pc-wrong leg reached a verdict card; w13 wave-c-results records ИЗДЪРЖАН score 1.",
    bucket: "BROKEN",
    part: "A",
    severity: "critical",
    what:
      "THE LESSON CERTIFIES THE MISTAKE IT EXISTS TO TEACH. On the WRONG leg the debrief prints «✓ Стигни края на отсечката, задържал тавана от настилката 0:52» and stamps the run ИЗДЪРЖАН — on a drive the same debrief records at 58,9 км/ч. The lesson's whole subject is that a wet surface demands a speed chosen BELOW the posted plate; the objective's own title claims the student held that ceiling, and the run passes.\n\nThe mechanism is the objective: sc-swp-finish is a position-only reach zone with no speed cap, so it ticks for arriving at the end of the segment regardless of how the student got there — and its TITLE then asserts a speed discipline it never measured. This is the same class as the reachZone objectives repaired in waves 3 and 5 (requireYieldClean beside requireVruUntouched), but on a speed clause rather than a yield clause.\n\nA student who drives 9 км/ч over the limit in rain is told, by name, that they held the ceiling the surface gave them.",
    frame: "E:/AI driver/.audit-frames/w13/frames/sc-sp-wet-limit-plate__pc-wrong/08-debrief-p1.png",
    quote: "«✓ Стигни края на отсечката, задържал тавана от настилката 0:52» on a leg the same _audit-debrief.json records at 58,9 км/ч, verdict ИЗДЪРЖАН (w13 wave-c-results: pc-wrong ИЗДЪРЖАН score=1)",
    suspectFile: "platform/src/modules/sim/lessons/objectives.ts",
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
if (bad) { console.log("\nREFUSING to file — frame does not resolve."); process.exit(1); }

const before = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
fs.appendFileSync(F, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const after = fs.readFileSync(F, "utf8").split("\n").filter((l) => l.trim()).length;
console.log("\n  chunk-wavec-new.jsonl: " + before + " -> " + after + " rows");
