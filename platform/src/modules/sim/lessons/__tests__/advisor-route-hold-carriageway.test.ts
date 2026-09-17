/**
 * THE COACH SAYS «OFF THE ROAD» ON THE FRAME THE GRADER DOES —
 * `sc-roundabout-entry:8ae6f7a2` (major, filed from w49 at 98bf8ae).
 *
 * THE FRAME: `.audit-frames/w49/frames/sc-roundabout-entry__pc-right/
 * 04-t080s.png` — the car on the lawn beside the ring at 14 км/ч while the
 * task, the advisor («Излез от кръговото с десен мигач») and «Следвай синята
 * линия» all address a car on the carriageway; «Колата е извън пътя» from
 * t = 84 s.
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR, because the brief's premise did not
 * survive it. The brief said the hold reads a 30 m „no centreline" signal. The
 * w49 witness scans (`_audit-status.json` → guidance.samples, see
 * `W49_SAMPLES`), replayed through `createWorldRuntime("rb-mini-v1").sample`,
 * read `rbm-e-ring-se` up to (22.34, 8.18) at t ≈ 78 s and `edgeId: null` from
 * (23.40, 10.03) — at the KERB, not thirty metres out, because f72c4ee
 * (2026-08-24) nulls `edgeId` 0.97 m past the kerb. So `offNetworkSinceSec`
 * already started at the kerb, and the four-to-six seconds of wrong instruction
 * were ROUTE_HOLD_S = 5 s — a crash-pin number — against a grader whose
 * OFF_CARRIAGEWAY sustain decides the excursion is real at 2 s.
 *
 * WHAT THIS FILE HOLDS:
 *   1. the w49 excursion, on the production runtime: the hold flips on the
 *      frame the rule reducer's episode is emitted — the SUSTAIN, which is not
 *      necessarily a −3 (advisor.ts `offCarriagewaySustainedNow` names a
 *      committed replay where none follows) — before ROUTE_HOLD_S;
 *   2. THE FALSE-OFF-ROAD DIRECTION, which is worse than the defect: every
 *      sc-park-* and sc-pk-* shadow-correct tape, and the catalogue's worst
 *      legal kerbside pose, never read off-road;
 *   3. the ending is untouched — `offNetworkSinceSec` is still its own clock.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime } from "../../runtime/worldRuntime";
import { parseScenarioTrace } from "../../traces/parse";
import { ROUTE_HOLD_S, advisorPromptForSession, routeHoldAdvisorPrompt, routeHoldForSession } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const TRACES = path.join(REPO, "content", "traces");
const WORLD = path.join(REPO, "content", "world");

const districts = new Map<string, unknown>();
function district(id: string): unknown {
  let d = districts.get(id);
  if (d === undefined) {
    d = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    districts.set(id, d);
  }
  return d;
}

function vehicle(x: number, y: number, headingDeg: number, speedKmh: number, gear = 1): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear,
    mirrorGlance: null,
  };
}

function lessonFor(id: string) {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`no template ${id}`);
  return { lesson: compileScenario(spec, 1), districtId: spec.map.districtId };
}

// ---------------------------------------------------------------------------
// 1. The photographed excursion
// ---------------------------------------------------------------------------

/**
 * THE w49 WITNESS, VERBATIM — `.audit-frames/w49/frames/sc-roundabout-entry__
 * pc-right/_audit-status.json` → `guidance.samples[112..141]`, t = 72 → 90:
 * `wx`, `−wz` (the product frame, y = −z) and `kmh` exactly as recorded.
 * `.audit-frames/` is not committed, so the rows are copied here rather than
 * read at run time.
 *
 * WHAT IS RECORDED AND WHAT IS RECONSTRUCTED, because round 2 blurred the two
 * and its verifier caught it. Round 2 labelled this table „the w49 witness"
 * while mixing two of the witness's arrays, rounding speeds its own way and
 * writing half-second times the witness does not carry. What the artefact
 * actually says:
 *  · `guidance.witness.poses` is a SUBSET (it jumps from t = 79 to t = 90);
 *    `guidance.samples` is every scan, and it is the source below — the rows at
 *    80 and 81 are in it (index 123, 124);
 *  · each scan is stamped with a WHOLE second (`tSec`), and the loop scans about
 *    every 510 ms by its own `dtMs`, so most seconds carry two scans under one
 *    stamp. `t` below is the ONE reconstruction in this table: the first scan of
 *    a stamp at .0, the second at .5. It is labelled as such and nothing is
 *    asserted to the tenth of a second on its strength;
 *  · index 123 → 124 is 11 ms by the loop's `dtMs` and a whole second by the
 *    stamps, with 1.4 m between the two poses. The replay follows the stamps.
 * Between rows the car is interpolated at 10 Hz — the product ticks far faster
 * than the harness scans, and a hold that needs a sustained condition must be
 * given frames.
 */
const W49_SAMPLES: ReadonlyArray<[index: number, tSec: number, t: number, x: number, y: number, kmh: number]> = [
  [112, 72, 72.0, 15.95, -3.01, 14],
  [113, 73, 73.0, 17.28, -0.69, 15],
  [114, 73, 73.5, 18.03, 0.64, 3],
  [115, 74, 74.0, 18.33, 1.16, 5],
  [116, 75, 75.0, 19.53, 3.26, 14],
  [117, 76, 76.0, 20.83, 5.55, 15],
  [118, 76, 76.5, 21.63, 6.9, 3],
  [119, 77, 77.0, 21.9, 7.38, 5],
  [120, 78, 78.0, 22.34, 8.18, 7],
  [121, 78, 78.5, 23.4, 10.03, 14],
  [122, 79, 79.0, 24.69, 12.25, 14],
  [123, 80, 80.0, 25.94, 14.44, 14],
  [124, 81, 81.0, 26.65, 15.66, 0], // dtMs 11 — see above
  [125, 82, 82.0, 26.65, 15.66, 0],
  [126, 82, 82.5, 26.65, 15.66, 0],
  [127, 83, 83.0, 26.65, 15.66, 0],
  [128, 83, 83.5, 26.65, 15.66, 0],
  [129, 84, 84.0, 26.65, 15.66, 0],
  [130, 84, 84.5, 26.65, 15.66, 0],
  [131, 85, 85.0, 26.65, 15.66, 0],
  [132, 86, 86.0, 26.65, 15.66, 0],
  [133, 86, 86.5, 26.65, 15.66, 0],
  [134, 87, 87.0, 26.65, 15.66, 0],
  [135, 87, 87.5, 26.65, 15.66, 0],
  [136, 88, 88.0, 26.65, 15.66, 0],
  [137, 88, 88.5, 26.65, 15.66, 0],
  [138, 89, 89.0, 26.65, 15.66, 0],
  [139, 89, 89.5, 26.65, 15.66, 0],
  [140, 90, 90.0, 26.65, 15.66, 0],
  [141, 90, 90.5, 26.65, 15.66, 0],
];

function driveTheExcursion(): {
  frames: Array<{ t: number; edgeId: string | null | undefined; hold: string | null; emitted: boolean; state: LessonSessionState }>;
} {
  const { lesson, districtId } = lessonFor("sc-roundabout-entry");
  expect(districtId).toBe("rb-mini-v1");
  const rt = createWorldRuntime(district(districtId));
  let s = createLessonSession(lesson);
  const frames: ReturnType<typeof driveTheExcursion>["frames"] = [];
  for (let i = 1; i < W49_SAMPLES.length; i++) {
    const [, , t0, x0, y0, k0] = W49_SAMPLES[i - 1];
    const [, , t1, x1, y1, k1] = W49_SAMPLES[i];
    const heading = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
    for (let t = t0; t < t1 - 1e-9; t = +(t + 0.1).toFixed(1)) {
      const f = (t - t0) / (t1 - t0);
      const tick = rt.sample(vehicle(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, heading, k0 + (k1 - k0) * f), t, false);
      s = applyTick(s, tick).state;
      frames.push({
        t,
        edgeId: tick.edgeId,
        hold: routeHoldForSession(s),
        emitted: s.rules.offCarriageway.emitted && s.rules.offCarriageway.activeSince !== null,
        state: s,
      });
    }
  }
  return { frames };
}

describe("the w49 excursion onto the lawn, through the production runtime", () => {
  it("the premise, re-measured: edgeId goes null at the kerb, not thirty metres out", () => {
    const { frames } = driveTheExcursion();
    const onset = frames.find((f) => f.edgeId === null);
    expect(onset, "the car must leave the carriageway on this replay").toBeDefined();
    // The ring's drivable band ends at 22.06 m from the island centre; the
    // first null frame is within a couple of metres of it, nowhere near 30 m.
    const last = frames[frames.indexOf(onset!) - 1];
    expect(typeof last.edgeId).toBe("string");
    const p = onset!.state.lastT;
    expect(p).toBeGreaterThan(77);
    expect(p).toBeLessThan(79.5);
  });

  it("the coach says off-road on the frame the grader's sustain calls the excursion real — before ROUTE_HOLD_S", () => {
    const { frames } = driveTheExcursion();
    const onsetT = frames.find((f) => f.edgeId === null)!.t;
    const firstHold = frames.find((f) => f.hold === "offRoad");
    const firstEmit = frames.find((f) => f.emitted);
    expect(firstEmit, "the grader must book this excursion").toBeDefined();
    expect(firstHold, "the coach must say it").toBeDefined();
    expect(firstHold!.t).toBe(firstEmit!.t);
    expect(firstHold!.t - onsetT).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(firstHold!.t - onsetT).toBeLessThan(ROUTE_HOLD_S);
    // …and the card and the banner read the same answer on that frame.
    expect(advisorPromptForSession(firstHold!.state)?.textBg).toBe(routeHoldAdvisorPrompt("offRoad").textBg);
    // Nothing before the onset was ever called off-road.
    expect(frames.filter((f) => f.t < onsetT && f.hold !== null)).toEqual([]);
  });

  it("THE ENDING KEEPS ITS OWN CLOCK — offNetworkSinceSec is untouched", () => {
    const { frames } = driveTheExcursion();
    const onsetT = frames.find((f) => f.edgeId === null)!.t;
    const last = frames.at(-1)!;
    expect(last.state.offNetworkSinceSec).toBe(onsetT);
    expect(last.state.phase).toBe("driving");
  });
});

// ---------------------------------------------------------------------------
// 2. The direction that is worse than the defect
// ---------------------------------------------------------------------------

const PARKING = SCENARIO_TEMPLATES.map((s) => s.id).filter((id) => /^sc-(park|pk)-/u.test(id));

describe("a legal kerbside band or a parking bay is never «извън пътя»", () => {
  it("every sc-park-* / sc-pk-* shadow tape, driven through runtime and engine", () => {
    let driven = 0;
    let frames = 0;
    const offRoad: string[] = [];
    const unanswered: string[] = [];
    for (const id of PARKING) {
      const file = path.join(TRACES, id, "shadow-correct.trace.json");
      let raw: string;
      try {
        raw = readFileSync(file, "utf-8");
      } catch {
        continue; // a template without a recorded tape has nothing to replay
      }
      const trace = parseScenarioTrace(JSON.parse(raw));
      expect(trace, `unparseable ${id}`).not.toBeNull();
      const { lesson, districtId } = lessonFor(id);
      const rt = createWorldRuntime(district(districtId));
      let s = createLessonSession(lesson);
      for (const smp of trace!.samples) {
        const tick = rt.sample(vehicle(smp.x, smp.y, smp.headingDeg, smp.speedKmh, smp.gear), smp.tSec, false);
        if (tick.edgeId === undefined) unanswered.push(`${id}@${smp.tSec}`);
        s = applyTick(s, tick).state;
        frames++;
        const hold = routeHoldForSession(s);
        if (hold === "offRoad") offRoad.push(`${id}@${smp.tSec.toFixed(2)}`);
      }
      driven++;
    }
    // The sweep ran on the corpus, not on nothing.
    expect(driven).toBeGreaterThanOrEqual(20);
    expect(frames).toBeGreaterThan(10_000);
    // Every frame got a real answer from the runtime, so the zero below is an
    // acquittal and not an absent channel.
    expect(unanswered).toEqual([]);
    expect(offRoad).toEqual([]);
  }, 300_000);

  it("the catalogue's worst legal kerbside pose, parked for a minute", () => {
    // district-v1, бул. Свети Климент Охридски: the kerbside parking-band centre
    // `runtime/__tests__/off-network-headroom.test.ts` measures as the farthest
    // legal pose from any centreline (29.355 m) — see lessons/finish.ts O22.
    const rt = createWorldRuntime(district("district-v1"));
    const { lesson } = lessonFor("sc-pk-stop-vs-park");
    let s = createLessonSession(lesson);
    for (let t = 0; t <= 60; t = +(t + 0.25).toFixed(2)) {
      const tick = rt.sample(vehicle(467.8, -169.8, 0, 0, 0), t, false);
      expect(tick.edgeId, `t=${t}`).not.toBeUndefined();
      expect(tick.edgeId, `t=${t}: a legal kerbside band read as off the carriageway`).not.toBeNull();
      s = applyTick(s, tick).state;
      expect(routeHoldForSession(s), `t=${t}`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The crash pin keeps its own ladder
// ---------------------------------------------------------------------------

describe("a car an impact shoved onto the verge meets ONE card", () => {
  it("no off-road card for the three seconds before the pin's own", () => {
    const { lesson } = lessonFor("sc-roundabout-entry");
    let s = createLessonSession(lesson);
    const rt = createWorldRuntime(district("rb-mini-v1"));
    s = applyTick(s, rt.sample(vehicle(20.83, 5.55, 30, 15), 1, false)).state;
    // Hit something and slide onto the lawn.
    const hit = rt.sample(vehicle(24.69, 12.25, 30, 6), 1.5, false);
    s = applyTick(s, { ...hit, events: [...hit.events, { kind: "collision", withWhat: "staticObject" }] }).state;
    expect(s.crashPin, "the collision must arm the pin").toBeDefined();
    const seen = new Set<string | null>();
    for (let t = 2; t <= 1.5 + ROUTE_HOLD_S + 1; t = +(t + 0.25).toFixed(2)) {
      s = applyTick(s, rt.sample(vehicle(24.69, 12.25, 30, 0), t, false)).state;
      const hold = routeHoldForSession(s);
      if (t < 1.5 + ROUTE_HOLD_S) expect(hold, `t=${t}`).not.toBe("offRoad");
      seen.add(hold);
    }
    expect(seen.has("crashPinned")).toBe(true);
  });
});
