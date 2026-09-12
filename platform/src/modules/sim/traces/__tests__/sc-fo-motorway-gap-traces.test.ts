/**
 * Wave-8 trace gate — „Дистанция при 130" (sc-fo-motorway-gap on mw-v1 REUSED,
 * doc 72 FO-01 + SP-10), doc 76 §5/§9 stages 3+5:
 *   1. SHADOW replays through the production stack with ZERO violations and
 *      earns CLEAN_DRIVING — it settles at flow speed behind the lead holding
 *      the pinned ~72 m (≈ 2 s), then absorbs the lead's firm brake and rolls
 *      to rest with a big margin (~46 m).
 *   2. MISTAKE DEMOS grade EXACTLY their template codeRefs with NO extras:
 *      „Една секунда" = FOLLOWING_TOO_CLOSE alone (ends before the brake — the
 *      fault is the gap); „Каране на бронята" = FOLLOWING_TOO_CLOSE + COLLISION
 *      (the tailgate fires the gap, the brake arrives with no metres).
 *   3. COMMITTED FILES under content/traces/sc-fo-motorway-gap/ ARE the
 *      recordings of these scripts, byte-for-byte, with identical public copies.
 *
 * LANE NOTE: the lead is a cutInLeadCar used purely as an in-lane decelerating
 * lead (cutShiftM 0). The brakingLeadCar runner is the natural fit but it does
 * not forward the actor's extraRightOffsetM, which this template needs to shift
 * the mw-e-nb path off its default EMERGENCY-lane resolution (x = 8.13) into the
 * CRUISE lane (x = 0). See the template + the wave report.
 *
 * RE-RECORD:
 *   RECORD_TRACES=1 npx vitest run src/modules/sim/traces/__tests__/sc-fo-motorway-gap-traces.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contactVoidsObjective,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
} from "../../lessons/objectives";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_FO_MOTORWAY_GAP } from "../../lessons/scenario/templates-following2";
import type { ObjectiveEvalState } from "../../lessons/types";
import type { SimTick } from "../../rules";
import { parseScenarioTrace, serializeScenarioTrace } from "../parse";
import {
  recordScFoMotorwayGapDrive,
  type ScFoMotorwayGapTraceName,
} from "../scFoMotorwayGap";
import type { RecordedDrive } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RECORD = process.env.RECORD_TRACES === "1";
const SCENARIO_ID = "sc-fo-motorway-gap";
const NAMES: ScFoMotorwayGapTraceName[] = [
  "shadow-correct",
  "mistake-one-second",
  "mistake-bumper-crash",
];

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}
function violationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function commendationCodes(d: RecordedDrive): string[] {
  return d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const district = loadDistrict("mw-v1");
const drives = new Map<ScFoMotorwayGapTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScFoMotorwayGapDrive(district, n)]),
);

describe("sc-fo-motorway-gap — the district contract (the pinned geometry is real)", () => {
  const doc = district as {
    meta: { scenario: { params: Record<string, number>; laneCruiseX: number } };
    spawnPoints: { id: string; x: number; y: number; heading: number }[];
  };

  it("mw-v1 carries the cruise lane, limit and spawn the template pins by value", () => {
    expect(doc.meta.scenario.laneCruiseX).toBe(0); // MW_X_CRUISE in the template + trace script
    expect(doc.meta.scenario.params).toEqual(SC_FO_MOTORWAY_GAP.map.params);
    const spawn = doc.spawnPoints.find((s) => s.id === SC_FO_MOTORWAY_GAP.start.spawnPointId);
    expect(spawn, "template start.spawnPointId must exist in the district").toBeDefined();
    expect(spawn!.x).toBe(0);
    expect(spawn!.y).toBe(15);
    expect(spawn!.heading).toBe(0); // north — the whole drill runs on +y
  });

  it("the lead is an in-lane decelerating lead shifted into the CRUISE lane", () => {
    const lead = SC_FO_MOTORWAY_GAP.staged!.find((s) => s.id === "sc-fmg-lead")!;
    expect(lead.kind).toBe("cutInLeadCar");
    // -8.13 shifts the mw-e-nb graph lane (x = 8.13) to the cruise lane (x = 0);
    // cutShiftM 0 keeps it there (a pure speed event, not a lateral cut).
    expect((lead as { actor: { extraRightOffsetM: number } }).actor.extraRightOffsetM).toBe(-8.13);
    expect((lead as { cutShiftM: number }).cutShiftM).toBe(0);
    // The pinned gap is a genuine 2-second gap at flow (leadGap ~72 m); the cut
    // (the firm brake) is staged mid-segment, well past the accel run.
    expect((lead as { paceAheadM: number }).paceAheadM).toBeGreaterThan(70);
    expect((lead as { cutAt: { y: number } }).cutAt.y).toBeGreaterThan(600);
  });
});

describe("sc-fo-motorway-gap — the shadow gate (doc 76 §5)", () => {
  const shadow = drives.get("shadow-correct")!;

  it("replays with ZERO violations and earns CLEAN_DRIVING", () => {
    expect(violationCodes(shadow)).toEqual([]);
    expect(commendationCodes(shadow)).toContain("CLEAN_DRIVING");
  });

  it("holds the gap at flow, then absorbs the brake and stops without contact", () => {
    // No collision outcome — the cutInLeadCar runner emits one only on contact,
    // and the disciplined 72 m gap never lets it happen.
    expect(shadow.outcomes.some((o) => o.detail === "collision")).toBe(false);
    // Comes to rest behind the stopped lead near the authored stop zone (y ~790).
    const last = shadow.trace.samples[shadow.trace.samples.length - 1];
    expect(last.y).toBeGreaterThan(770);
    expect(Math.abs(last.speedKmh)).toBeLessThan(2);
    const annotations = shadow.trace.events.filter((e) => e.kind === "annotation");
    expect(annotations.length).toBeGreaterThanOrEqual(3);
    for (const a of annotations) expect(a.textBg ?? "").toMatch(/[Ѐ-ӿ]/);
  });
});

describe("sc-fo-motorway-gap — mistake demos grade their exact codes (doc 76 §9 stage 5)", () => {
  it("„Една секунда зад водещия“: exactly FOLLOWING_TOO_CLOSE", () => {
    const drive = drives.get("mistake-one-second")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FO_MOTORWAY_GAP.mistakes[0].codeRefs].sort());
    // Only the gap is guilty — the closing burst stays under the dangerous line.
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("COLLISION");
    // The demo ends BEFORE the staged brake — no staged resolution at all.
    expect(drive.outcomes.length).toBe(0);
  });

  it("„Каране на бронята“: exactly FOLLOWING_TOO_CLOSE + COLLISION", () => {
    const drive = drives.get("mistake-bumper-crash")!;
    const codes = [...new Set(violationCodes(drive))].sort();
    expect(codes).toEqual([...SC_FO_MOTORWAY_GAP.mistakes[1].codeRefs].sort());
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    // The contact is with the lead (the runner's collision outcome).
    expect(drive.outcomes.find((o) => o.eventId === "sc-fmg-lead")?.detail).toBe("collision");
  });
});

// ---------------------------------------------------------------------------
// THE TERMINAL GATE AND THE CRASH (sc-fo-motorway-gap:d18105c7, 2026-09-12)
//
// «Спри зад спирачещия автомобил, без да го удариш» was, until this wave, a
// place plus a halt cap. Measured through the production evaluator on this
// drill's OWN ❌ demonstration: COLLISION billed at t = 29.17 s, the gate
// satisfied at t = 29.32 s — the drive that came to rest by hitting the lead
// collected the route's last tick a sixth of a second after the −10 was booked.
//
// `requireNoContact` is the shipped term for that claim. These cases drive the
// REAL tick stream (the same `onTick` the bot-completion gate uses, not a
// hand-built fixture) through the COMPILED objective, and rebuild the objective
// context exactly as `lessons/engine.ts` does: `struckABodyInRun` is monotone
// and folded from this drive's own billed COLLISION, so the fixture cannot
// disagree with the rule engine about when the car hit something.
// ---------------------------------------------------------------------------

const RUNGS = [1, 2, 3, 4, 5] as const;

function stopGateOn(name: ScFoMotorwayGapTraceName, level: (typeof RUNGS)[number]) {
  const objective = compileScenario(SC_FO_MOTORWAY_GAP, level).objectives.find(
    (o) => o.id === "sc-fmg-stop",
  )!;
  const params = parseObjectiveParams(objective);
  // The billed collisions of THIS drive, from the rule engine's own log.
  const struckAtSec = drives
    .get(name)!
    .ruleEvents.filter((e) => e.kind === "violation" && e.code === "COLLISION")
    .map((e) => e.t);

  let state: ObjectiveEvalState = createEvalState(params);
  let doneAtSec: number | null = null;
  recordScFoMotorwayGapDrive(district, name, {
    onTick: (tick: SimTick) => {
      const struck = struckAtSec.some((t) => t <= tick.t);
      const ctx: ObjectiveContext = {
        stagedOutcomes: [],
        redsMetInRun: 0,
        ...(struck ? { struckABodyInRun: true } : {}),
      };
      const r = stepObjective(params, state, tick, ctx);
      state = r.evalState;
      if (r.done && doneAtSec === null) doneAtSec = tick.t;
    },
  });
  return { params, doneAtSec, struckAtSec };
}

describe("sc-fmg-stop — the tick says «без да го удариш» and now proves it", () => {
  it("the crash demo is REFUSED at every rung — it stopped by hitting him", () => {
    for (const level of RUNGS) {
      const { doneAtSec, struckAtSec } = stopGateOn("mistake-bumper-crash", level);
      expect(struckAtSec.length, `L${level}: the demo must still be billed a COLLISION`).toBeGreaterThan(0);
      expect(doneAtSec, `L${level} certified the drive that came to rest inside the lead car`).toBeNull();
    }
  });

  it("the shadow KEEPS it at every rung — the term cannot refuse a clean drive", () => {
    for (const level of RUNGS) {
      const { doneAtSec, struckAtSec } = stopGateOn("shadow-correct", level);
      expect(struckAtSec).toEqual([]);
      expect(doneAtSec, `L${level} lost the shadow's tick`).not.toBeNull();
    }
  });

  it("NO STRAND: this is the terminal objective, so the void arm must own it", () => {
    // 2 of 2 — `!onTerminal` does not cover this row, so the finish gate is
    // armed only through `terminalUnearnable`, whose contact arm is this call.
    // Without it a student who rear-ends the lead could reach the чл. 23 card
    // only by quitting, forfeiting the attempt's XP and its calibration.
    const objectives = compileScenario(SC_FO_MOTORWAY_GAP, 3).objectives;
    expect(objectives[objectives.length - 1].id).toBe("sc-fmg-stop");
    const { params } = stopGateOn("shadow-correct", 3);
    expect(contactVoidsObjective(params, true)).toBe(true);
    expect(contactVoidsObjective(params, false)).toBe(false);
  });
});

describe("committed trace files — the determinism law", () => {
  const contentDir = path.join(REPO_ROOT, "content", "traces", SCENARIO_ID);
  const publicDir = path.join(REPO_ROOT, "platform", "public", "traces", SCENARIO_ID);

  for (const name of NAMES) {
    it(`${SCENARIO_ID}/${name}: committed JSON is exactly this script's recording (+ public copy)`, () => {
      const serialized = serializeScenarioTrace(drives.get(name)!.trace) + "\n";
      const contentFile = path.join(contentDir, `${name}.trace.json`);
      const publicFile = path.join(publicDir, `${name}.trace.json`);
      if (RECORD) {
        mkdirSync(contentDir, { recursive: true });
        mkdirSync(publicDir, { recursive: true });
        writeFileSync(contentFile, serialized);
        writeFileSync(publicFile, serialized);
      }
      expect(existsSync(contentFile), `${contentFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(existsSync(publicFile), `${publicFile} missing — run the RECORD_TRACES tool`).toBe(true);
      expect(readFileSync(contentFile, "utf-8")).toBe(serialized);
      expect(readFileSync(publicFile, "utf-8")).toBe(readFileSync(contentFile, "utf-8"));
      const parsed = parseScenarioTrace(JSON.parse(readFileSync(contentFile, "utf-8")));
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.scenarioId).toBe(SCENARIO_ID);
    });
  }

  it("recording is deterministic (a second run serializes identically)", () => {
    const again = recordScFoMotorwayGapDrive(district, "shadow-correct");
    expect(serializeScenarioTrace(again.trace)).toBe(
      serializeScenarioTrace(drives.get("shadow-correct")!.trace),
    );
  });

  it("template TraceRefs point at exactly these files, no longer pending", () => {
    const refs = [SC_FO_MOTORWAY_GAP.shadow, ...SC_FO_MOTORWAY_GAP.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      expect(ref.path.startsWith(`content/traces/${SCENARIO_ID}/`)).toBe(true);
    }
    const expected = NAMES.map((n) => `content/traces/${SCENARIO_ID}/${n}.trace.json`);
    expect([
      SC_FO_MOTORWAY_GAP.shadow.path,
      ...SC_FO_MOTORWAY_GAP.mistakes.map((m) => m.traceRef.path),
    ]).toEqual(expected);
  });
});
