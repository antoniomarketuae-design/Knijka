// Build lanes over EVERY current STILL row, no exclusions. Wave 1's claim list
// is meaningless now: some of those rows retired, and the ones that did not need
// attempting again with today's evidence. Lanes are capped so no agent is handed
// a pile it will skim — a skimmed repair is how a lane claims 18 and closes 0.
import fs from "node:fs";
const REPO = "E:/AI driver";
const CAP = 26;
const batches = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));
const all = new Map();
for (const e of batches) for (const f of e.findings) all.set(f.findingId, { ...f, file: e.file });

const byWhat = (re) => [...all.values()].filter((f) => re.test(String(f.what) + " " + String(f.why || ""))).map((f) => f.findingId);
const byFile = (sub) => [...all.values()].filter((f) => f.file.includes(sub)).map((f) => f.findingId);

// Order matters: earlier lanes win a contested row. Root-cause lanes first
// (one fix retires many), then file lanes for the tail.
const SPEC = [
  { lane: "grade-blind-to-speed", pick: () => byWhat(/не влизат в точките|blind to speed|no speed offence|0 наказателни точки|scored 0|clean|чисто каране/i) },
  { lane: "objective-ticks-unearned", pick: () => byWhat(/tick|ticked|отчита|credited|uncredited|objective|задача \d\/\d/i) },
  { lane: "convicted-wrong-rule", pick: () => byWhat(/convicted|осъд|Настъпи сблъсък|only stated cause|wrong reason|wrong rule/i) },
  { lane: "world-void-and-edge", pick: () => byWhat(/void|bare green|empty horizon|no kerbs|off-map|world past|flat grey|plane under/i) },
  { lane: "engine", pick: () => byFile("modules/sim/rules/engine.ts") },
  { lane: "objectives", pick: () => byFile("modules/sim/lessons/objectives.ts") },
  { lane: "weather-conditions", pick: () => [...byFile("environment/weather.ts"), ...byFile("scenario/templates-conditions")] },
  { lane: "finish-and-rubric", pick: () => [...byFile("lessons/finish.ts"), ...byFile("scenario/rubric.ts")] },
  { lane: "templates-parking", pick: () => byFile("scenario/templates-parking") },
  { lane: "lessonplayshell", pick: () => byFile("lesson-ui/LessonPlayShell.tsx") },
  { lane: "lessonscene", pick: () => byFile("components/sim/LessonScene.tsx") },
  { lane: "simoverlay-faultcard", pick: () => [...byFile("hud/SimOverlay.tsx"), ...byFile("hud/FaultCard.tsx")] },
  { lane: "touchcontrols", pick: () => byFile("components/sim/TouchControls.tsx") },
  { lane: "progress-briefing", pick: () => byFile("scenario/progress.ts") },
  { lane: "devrig-drivescript", pick: () => byFile("devrig/driveScript.ts") },
  { lane: "scenario-templates-tail", pick: () => byFile("scenario/templates-") },
  { lane: "hud-tail", pick: () => byFile("modules/sim/hud/") },
  { lane: "lessons-tail", pick: () => byFile("modules/sim/lessons/") },
  { lane: "world-scene-tail", pick: () => [...byFile("modules/sim/world/"), ...byFile("modules/sim/scene/"), ...byFile("runtime/")] },
  { lane: "components-tail", pick: () => byFile("components/sim/") },
  { lane: "remainder", pick: () => [...all.keys()] },
];

const dir = REPO + "/.audit-frames/patches/wave2";
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const taken = new Set();
const lanes = [];
for (const s of SPEC) {
  let ids = [...new Set(s.pick())].filter((id) => all.has(id) && !taken.has(id));
  while (ids.length) {
    const chunk = ids.slice(0, CAP);
    ids = ids.slice(CAP);
    chunk.forEach((id) => taken.add(id));
    const rows = chunk.map((id) => all.get(id));
    const name = lanes.filter((l) => l.lane.startsWith(s.lane)).length ? s.lane + "-" + (lanes.filter((l) => l.lane.startsWith(s.lane)).length + 1) : s.lane;
    lanes.push({ lane: name, n: rows.length, critical: rows.filter((r) => r.severity === "critical").length,
                 files: [...new Set(rows.map((r) => r.file))], scenarios: [...new Set(rows.map((r) => r.scenario))], findings: rows });
  }
}
for (const l of lanes) fs.writeFileSync(dir + "/lane-" + l.lane + ".json", JSON.stringify(l, null, 2));
fs.writeFileSync(dir + "/lanes-summary.json", JSON.stringify(lanes.map((l) => ({ lane: l.lane, n: l.n, critical: l.critical, files: l.files })), null, 2));

const tot = lanes.reduce((a, l) => a + l.n, 0);
for (const l of lanes) console.log("  " + l.lane.padEnd(26) + String(l.n).padStart(3) + " rows " + String(l.critical).padStart(3) + "c  " + String(l.scenarios.length).padStart(2) + " lessons");
console.log("");
console.log("  " + lanes.length + " lanes covering " + tot + " of " + all.size + " STILL rows   every row assigned exactly once: " + (taken.size === tot ? "YES" : "NO"));
