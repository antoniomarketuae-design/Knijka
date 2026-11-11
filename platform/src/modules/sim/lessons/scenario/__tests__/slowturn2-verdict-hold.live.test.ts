/**
 * ST-VERDICT-HOLD through the live chain — integrator ruling 2026-11-10 (lane slowturn2 round 3;
 * sc-turn-left-oncoming:1613ef2c). advisor.ts `YIELD_VOICE_ONCOMING_TURN_HOLD`; rules/types.ts
 * `SimTick.leftTurnOncomingOpen` / `leftTurnOncomingBilled`.
 *
 * Before this ruling the oncoming-wait verdict «Пропусна насрещните — Изчака N с и зави чак когато интервалът
 * стигна — без отчетено нарушение на предимството…» was said YIELD_VOICE_VERDICT_S after he moved off — on every
 * drive below at k 1582, while he was still on the approach (x 15–25, heading 270), before any turn. Now it waits
 * until his left turn is committed AND read with no bill AND no ST-LATE window is open, and a bill drops it. The
 * expected ticks are this lane's census (D:/knijka-lanes/scratch/slowturn2-impl/r3/verdict-table.tsv), identical at
 * 60 Hz, 30 Hz and phone cadence; pinned here at 60 Hz:
 *
 *  · the committed correct demo (a brisk BASE commit, the yield praise on k 1787): the verdict on k 1787, after the
 *    turn began — the same words;
 *  · the demo slowed to 8 km/h (an ADDED commit, k 2320, no vehicle he had to give way to braked): on the commit;
 *  · …with a 20 s stop at arc vertex 3 before the turn (L3, k 3736): the verdict, held past its time, survives the
 *    stop and is said on the commit — the hold only delays;
 *  · slowed to 6 km/h with the 20 s stop (L1: car 1001 braked for him — R13''' on the commit tick, k 4143): never
 *    said (on base it was said at k 1582, and the turn billed 43 s later).
 *  (The late bill — rig w4b S12 — is pinned in slowturn2-late-bill.live.test.ts.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";
import { FIXED_DT } from "../../../vehicle/tuning";
import { parseScenarioTrace } from "../../../traces/parse";
import { recordScriptedDrive, type DriveScript, type DriveStep } from "../../../traces/recorder";
import { SX_PIN_EW_GREEN_WINDOW } from "../../../traces/scJunctions";
import type { ScenarioTrace } from "../../../traces/types";
import type { SimTickEvent } from "../../../rules/types";
import type { ScenarioLevel } from "../types";
import { createYieldVoice, stepYieldVoice } from "../../advisor";

const RAW = loadDistrict(SC_TURN_LEFT_ONCOMING.map.districtId);
const VERDICT = "Пропусна насрещните";
const REPO = path.resolve(__dirname, "../../../../../../..");

// slowturn-ltap.live.test.ts's shadow script (the correct demo's drive, the turn leg slowed), copied verbatim.
const LANE = 4.0625;
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
const ARC = arcPts(10.9375, -10.9375, 15, 90, 180);
const TURN: Array<[number, number]> = [[10.9375, LANE], ...ARC];
const EAST: Array<[number, number]> = [[105, LANE], [52, LANE]];
function turnLeg(from: [number, number], tail: Array<[number, number]>, kmh: number, stopSec: number | null): DriveStep[] {
  if (stopSec === null) return [{ kind: "drive", points: [from, ...TURN, ...tail], targetKmh: kmh }];
  return [
    { kind: "drive", points: [from, [10.9375, LANE], ...ARC.slice(0, 3)], targetKmh: kmh },
    { kind: "pause", sec: stopSec, brake: true },
    { kind: "drive", points: [ARC[2], ...ARC.slice(3), ...tail], targetKmh: kmh },
  ];
}
function shadowScript(kmh: number, stopSec: number | null, waitSec = 7.5): DriveScript {
  return {
    steps: [
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EAST, targetKmh: 25 },
      { kind: "drive", points: [[52, LANE], [31.2, LANE]], targetKmh: 14 },
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      ...turnLeg([31.2, LANE], [[-LANE, -30], [-LANE, -56]], kmh, stopSec),
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}
const recorded = (script: DriveScript): ScenarioTrace =>
  recordScriptedDrive(RAW, script, {
    scenarioId: SC_TURN_LEFT_ONCOMING.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: [...(SC_TURN_LEFT_ONCOMING.staged ?? [])],
    collisionMinKmh: 0,
    signalOffsets: SX_PIN_EW_GREEN_WINDOW,
  }).trace;

interface Run {
  verdicts: Array<{ k: number; headingDeg: number; body: string }>;
  firstLeft: { k: number; added: boolean } | null;
  bills: Array<{ k: number; forcedById?: number }>;
  openLast: number | null;
  passed: boolean;
}
function replay(trace: ScenarioTrace, level: ScenarioLevel = 1): Run {
  const lesson = compileScenario(SC_TURN_LEFT_ONCOMING, level);
  const run: Run = { verdicts: [], firstLeft: null, bills: [], openLast: null, passed: false };
  const o = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace,
    applyOutcomes: true,
    holdAfterSec: 0,
    afterApply: ({ t, tick, step }) => {
      const k = Math.round(t / FIXED_DT);
      if (tick.leftTurnOncomingOpen === true) run.openLast = k;
      for (const e of tick.events as SimTickEvent[]) {
        if (e.kind === "turnStarted" && e.direction === "left" && run.firstLeft === null) run.firstLeft = { k, added: e.addedPath === true };
        if (e.kind === "prioritySituation" && e.situation === "left-turn-oncoming" && e.violated) run.bills.push({ k, forcedById: e.forcedById });
      }
      for (const h of step.hudEvents)
        if (h.kind === "lesson" && h.titleBg === VERDICT) run.verdicts.push({ k, headingDeg: tick.headingDeg, body: h.explanationBg });
    },
  });
  run.passed = o.result.passed;
  return run;
}
/** The words base said (the copy is unchanged; only WHEN moves). */
function baseWords(waitedSec: number): string {
  let s = createYieldVoice();
  s = stepYieldVoice(s, { t: 0.1, speedKmh: 0, wait: { holding: true, sinceSec: 0.1, reason: "oncomingVehicle", pedestrianCrossingIds: [] }, violations: [] }).state;
  s = stepYieldVoice(s, { t: 2, speedKmh: 0, wait: { holding: true, sinceSec: 0.1, reason: "oncomingVehicle", pedestrianCrossingIds: [] }, violations: [] }).state;
  s = stepYieldVoice(s, { t: 0.1 + waitedSec, speedKmh: 10, wait: { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds: [] }, violations: [] }).state;
  const r = stepYieldVoice(s, { t: 0.1 + waitedSec + 5, speedKmh: 10, wait: { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds: [] }, violations: [] });
  return r.notices[0].explanationBg;
}

describe("ST-VERDICT-HOLD — «Пропусна насрещните» is said only after his left turn can no longer be billed, and never over a bill", () => {
  it("the committed correct demo (a brisk base commit and the yield praise, k 1787): said on k 1787 — not on k 1582, on the approach — in the same words", () => {
    const tr = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO, "content", "traces", SC_TURN_LEFT_ONCOMING.id, "shadow-correct.trace.json"), "utf-8")))!;
    const r = replay(tr);
    expect(r.firstLeft).toEqual({ k: 1787, added: false });
    expect(r.bills).toEqual([]);
    expect(r.openLast).toBe(1786);
    expect(r.verdicts.map((v) => v.k)).toEqual([1787]);
    expect(r.verdicts[0].headingDeg).toBeLessThan(270 - 45);
    expect(r.verdicts[0].body).toMatch(/^Изчака \d+ с и зави чак когато интервалът стигна — без отчетено нарушение на предимството\./);
    const sec = Number(/^Изчака (\d+) с/.exec(r.verdicts[0].body)![1]);
    expect(r.verdicts[0].body).toBe(baseWords(sec));
    expect(r.passed).toBe(true);
  });

  it("slowed to 8 km/h (an added commit on k 2320, nobody braked for him): said on the commit", () => {
    const r = replay(recorded(shadowScript(8, null)));
    expect(r.firstLeft).toEqual({ k: 2320, added: true });
    expect(r.bills).toEqual([]);
    expect(r.openLast).toBe(2319);
    expect(r.verdicts.map((v) => v.k)).toEqual([2320]);
  });

  it("…with a 20 s stop at arc vertex 3 before the turn, L3: held past its time, it SURVIVES the stop and is said on the commit (k 3736) — the hold only delays (the second wait there ends while he still stands, so no fresh verdict would replace a dropped one)", () => {
    const r = replay(recorded(shadowScript(8, 20)), 3);
    expect(r.firstLeft).toEqual({ k: 3736, added: true });
    expect(r.bills).toEqual([]);
    expect(r.verdicts.map((v) => v.k)).toEqual([3736]);
  });

  it("slowed to 6 km/h with the 20 s stop, L1: car 1001 braked for him (R13''' on the commit tick, k 4143) — never said", () => {
    const r = replay(recorded(shadowScript(6, 20)));
    expect(r.firstLeft).toEqual({ k: 4143, added: true });
    expect(r.bills).toEqual([{ k: 4143, forcedById: 1001 }]);
    expect(r.verdicts).toEqual([]);
  });
});
