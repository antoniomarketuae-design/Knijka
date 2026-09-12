// Reusable lane builder. Every findingId lands in exactly ONE lane, across ALL
// waves — two agents claiming the same row is how a verifier-rejected item
// shipped last time. Usage: node build-lanes.mjs <waveNumber>
import fs from "node:fs";
const REPO = "E:/AI driver";
const WAVE = Number(process.argv[2] || 2);
const batches = JSON.parse(fs.readFileSync(REPO + "/.audit-frames/still-batches.json", "utf8"));

const all = new Map();
for (const e of batches) for (const f of e.findings) all.set(f.findingId, { ...f, file: e.file });

// everything already claimed by an earlier wave
const claimed = new Set();
for (let w = 1; w < WAVE; w++) {
  const dir = REPO + "/.audit-frames/patches/w" + w;
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("lane-") || !f.endsWith(".json")) continue;
    for (const x of JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")).findings) claimed.add(x.findingId);
  }
}
console.log("already claimed by waves 1.." + (WAVE - 1) + ": " + claimed.size);

const free = () => [...all.values()].filter((f) => !claimed.has(f.findingId));
const byFile = (sub) => free().filter((f) => f.file.includes(sub)).map((f) => f.findingId);
const byWhat = (re) => free().filter((f) => re.test(String(f.what))).map((f) => f.findingId);

const SPEC_W2 = [
  { lane: "pedestrians-absent", pick: () => byWhat(/not (a )?single (pedestrian|person)|no (people|pedestrians)|not one pedestrian|empty pavements?/i) },
  { lane: "faultcard", pick: () => byFile("modules/sim/hud/FaultCard.tsx") },
  { lane: "touchcontrols", pick: () => byFile("components/sim/TouchControls.tsx") },
  { lane: "weather", pick: () => byFile("modules/sim/environment/weather.ts") },
  { lane: "templates-conditions", pick: () => byFile("scenario/templates-conditions") },
  { lane: "finish", pick: () => byFile("modules/sim/lessons/finish.ts") },
  { lane: "rubric", pick: () => byFile("scenario/rubric.ts") },
  { lane: "advisor", pick: () => byFile("modules/sim/lessons/advisor.ts") },
  { lane: "catalog-offences", pick: () => [...byFile("modules/sim/rules/catalog.ts"), ...byFile("modules/sim/rules/offences.ts")] },
  { lane: "coach-guidance", pick: () => [...byFile("modules/sim/scenarios/coach.ts"), ...byFile("components/sim/RouteGuidance.tsx")] },
  { lane: "lessonplayshell-tail", pick: () => byFile("lesson-ui/LessonPlayShell.tsx") },
  { lane: "lessonscene-tail", pick: () => byFile("components/sim/LessonScene.tsx") },
];

// Wave 3 is a long tail: 192 rows over 84 files, 34 of them holding a single
// row. Batching one-file-per-lane would mean 84 lanes; these group by DOMAIN so
// a lane owns a coherent surface and can still fix a root cause once.
const SPEC_W3 = [
  { lane: "scenario-templates", pick: () => byFile("scenario/templates-") },
  { lane: "world-scene", pick: () => [...byFile("modules/sim/world/"), ...byFile("modules/sim/scene/"), ...byFile("modules/sim/runtime/district.ts")] },
  { lane: "hud-surfaces", pick: () => byFile("modules/sim/hud/") },
  { lane: "lesson-ui-cards", pick: () => [...byFile("lesson-ui/"), ...byFile("components/sim/cockpit/")] },
  { lane: "rules-tail", pick: () => [...byFile("modules/sim/rules"), ...byFile("modules/sim/lessons/specs.ts"), ...byFile("scene/lessonSpeedContract.ts")] },
  { lane: "collision-camera", pick: () => [...byFile("modules/sim/collision/"), ...byFile("modules/sim/devrig/"), ...byFile("components/sim/CameraRig.tsx")] },
  { lane: "traffic", pick: () => byFile("modules/sim/traffic/") },
  { lane: "scenario-logic-tail", pick: () => byFile("modules/sim/lessons/") },
  { lane: "world-json-content", pick: () => byFile("platform/public/world/") },
  { lane: "remainder", pick: () => free().map((f) => f.findingId) },
];

const SPECS = { 2: SPEC_W2, 3: SPEC_W3 };
const spec = SPECS[WAVE];
if (!spec) { console.error("no spec for wave " + WAVE); process.exit(1); }

const dir = REPO + "/.audit-frames/patches/w" + WAVE;
fs.mkdirSync(dir, { recursive: true });
const taken = new Set();
let total = 0;
const summary = [];
for (const s of spec) {
  const ids = [...new Set(s.pick())].filter((id) => !taken.has(id) && !claimed.has(id));
  ids.forEach((id) => taken.add(id));
  const rows = ids.map((id) => all.get(id));
  if (!rows.length) { console.log("  " + s.lane.padEnd(24) + "  0 rows — skipped"); continue; }
  const lane = {
    lane: s.lane,
    n: rows.length,
    critical: rows.filter((r) => r.severity === "critical").length,
    files: [...new Set(rows.map((r) => r.file))],
    scenarios: [...new Set(rows.map((r) => r.scenario))],
    findings: rows,
  };
  fs.writeFileSync(dir + "/lane-" + s.lane + ".json", JSON.stringify(lane, null, 2));
  total += rows.length;
  summary.push({ lane: s.lane, n: rows.length, critical: lane.critical, lessons: lane.scenarios.length, files: lane.files });
  console.log("  " + s.lane.padEnd(24) + String(rows.length).padStart(3) + " rows  " + String(lane.critical).padStart(2) + " crit  " + String(lane.scenarios.length).padStart(2) + " lessons");
}
fs.writeFileSync(dir + "/lanes-summary.json", JSON.stringify(summary, null, 2));
console.log("");
console.log("wave " + WAVE + ": " + total + " rows in " + summary.length + " lanes");
console.log("still unassigned after this wave: " + (free().length - total));
