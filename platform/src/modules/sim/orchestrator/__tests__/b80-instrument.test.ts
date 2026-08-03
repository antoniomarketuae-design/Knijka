/**
 * TEMPORARY INSTRUMENTATION (B80) — delete before commit.
 *
 * Replays the REAL sc-ov-narrow@L1 staged narrowMeeting on the REAL
 * ov-narrow-v1 district through the LIVE LessonScene wiring and prints, per
 * driving profile, whether traffic.staged("sc-ovn-meeting") ever transits and
 * what the runner + rule engine finally say.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec, VehicleSample } from "../../contracts";
import { DEFAULT_LESSON_TRAFFIC } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_OV_NARROW } from "../../lessons/scenario/templates-lanes";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector, lessonSeed } from "../director";

const ID = "ov-narrow-v1";

function loadRaw(): TrafficDistrict {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${ID}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as TrafficDistrict;
  }
  throw new Error("district not found");
}

const DT = 1 / 30;
const X_OWN = 4.06;
const X_ONC = -4.06;

interface Leg {
  to: { x: number; y: number };
  kmh: number;
  /** Seconds to sit still on arrival (brake held). */
  pauseSec?: number;
}

/** Own lane to y0, then swing into the oncoming lane and hold it through. */
function bargeLegs(cruiseKmh: number, bargeKmh: number, pauseAtY?: number, pauseSec = 0): Leg[] {
  const legs: Leg[] = [];
  if (pauseAtY !== undefined) {
    legs.push({ to: { x: X_OWN, y: pauseAtY }, kmh: cruiseKmh, pauseSec });
  }
  legs.push(
    { to: { x: X_OWN, y: 96 }, kmh: cruiseKmh },
    { to: { x: 2, y: 104 }, kmh: bargeKmh },
    { to: { x: X_ONC, y: 114 }, kmh: bargeKmh },
    { to: { x: X_ONC, y: 142 }, kmh: bargeKmh },
    { to: { x: X_ONC, y: 160 }, kmh: bargeKmh },
  );
  return legs;
}

function run(label: string, legs: Leg[], maxSec = 90) {
  const raw = loadRaw();
  const lesson = compileScenario(SC_OV_NARROW, 1);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, {
    seed: 7,
    vehicleCount: DEFAULT_LESSON_TRAFFIC.vehicleCount,
    pedestrianCount: DEFAULT_LESSON_TRAFFIC.pedestrianCount,
    anchor: { x: X_OWN, y: 15 },
    anchorRadiusM: DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  const director = createScenarioDirector(staged, traffic, {
    seed: lessonSeed(lesson.id),
    signals: runtime,
  });

  let px = X_OWN;
  let py = 15;
  let v = 0;
  let leg = 0;
  let pauseLeft = 0;
  let heading = 0;
  let rules = createRuleEngine();
  const ruleEvents: RuleEvent[] = [];
  const outcomes: unknown[] = [];
  let t = 0;
  let maxActorSpeed = 0;
  let firstMoveT: number | null = null;
  const samples: string[] = [];
  let resolvedAt: number | null = null;

  for (let i = 0; i < maxSec * 30; i++) {
    // ---- kinematics toward the current leg target ------------------------
    let brakePedal = 0;
    if (pauseLeft > 0) {
      pauseLeft -= DT;
      v = 0;
      brakePedal = 0.6;
    } else if (leg < legs.length) {
      const tgt = legs[leg].to;
      const dx = tgt.x - px;
      const dy = tgt.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 0.35) {
        pauseLeft = legs[leg].pauseSec ?? 0;
        leg++;
      } else {
        heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
        const target = legs[leg].kmh / 3.6;
        v = v < target ? Math.min(target, v + 2.5 * DT) : Math.max(target, v - 5 * DT);
        const step = Math.min(d, v * DT);
        px += (dx / d) * step;
        py += (dy / d) * step;
      }
    } else {
      v = Math.max(0, v - 5 * DT);
    }
    const speedKmh = v * 3.6;

    t += DT;
    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: px, y: py },
      playerSpeedKmh: speedKmh,
      playerHeadingDeg: heading,
    });
    const sample: VehicleSample = {
      position: { x: px, y: py },
      headingDeg: heading,
      speedKmh,
      indicator: "left",
      headlights: "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      mirrorGlance: null,
    };
    const tick = runtime.sample(sample, t, false, false, Infinity);
    const st = director.step({
      tSec: t,
      dtSec: DT,
      x: px,
      y: py,
      speedKmh,
      headingDeg: heading,
      brakePedal,
      tickEvents: tick.events,
    });
    for (const e of st.events) tick.events.push(e);
    if (st.outcomes.length > 0 && resolvedAt === null) resolvedAt = t;
    outcomes.push(...st.outcomes);
    const red = reduceTick(rules, tick);
    rules = red.state;
    ruleEvents.push(...red.events);

    const actor = traffic.staged("sc-ovn-meeting");
    if (actor) {
      if (actor.speedMps > maxActorSpeed) maxActorSpeed = actor.speedMps;
      if (actor.speedMps > 0.2 && firstMoveT === null) firstMoveT = t;
      if (i % 45 === 0) {
        samples.push(
          `t=${t.toFixed(1)} P(${px.toFixed(1)},${py.toFixed(1)}) ${speedKmh.toFixed(1)}km/h | A(${actor.x.toFixed(1)},${actor.y.toFixed(1)}) s=${actor.s.toFixed(1)} ${actor.speedMps.toFixed(2)}m/s fin=${actor.finished}`,
        );
      }
    }
    if (leg >= legs.length && pauseLeft <= 0 && v <= 0.01) break;
  }

  const codes = ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
  const commends = ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);

  const report =
    `\n===== ${label} =====\n` +
    samples.join("\n") +
    `\n-> maxActorSpeed=${maxActorSpeed.toFixed(2)} m/s  firstMoveT=${firstMoveT === null ? "NEVER" : firstMoveT.toFixed(1)}` +
    `\n-> resolvedAt=${resolvedAt === null ? "NEVER" : resolvedAt.toFixed(1)}  outcomes=${JSON.stringify(outcomes)}` +
    `\n-> violations=${JSON.stringify(codes)}` +
    `\n-> commendations=${JSON.stringify(commends)}\n`;
  fs.appendFileSync(process.env.B80_LOG ?? "b80.log", report);
  return { maxActorSpeed, firstMoveT, outcomes, codes, commends };
}

describe("B80 instrumentation", () => {
  it("A. control barge 20 → 14 km/h", () => {
    expect(run("A control barge (20 approach / 14 barge)", bargeLegs(20, 14))).toBeTruthy();
  });

  it("B. slow barge 7 km/h throughout", () => {
    expect(run("B slow barge (7 approach / 7 barge)", bargeLegs(7, 7))).toBeTruthy();
  });

  it("C. approach, stop 6 s at the wait marker, then barge", () => {
    expect(
      run("C stop-at-marker then barge (20 / stop 6s @ y100 / 12)", bargeLegs(20, 12, 100, 6)),
    ).toBeTruthy();
  });

  it("D. crawl the whole approach at 4 km/h, then barge", () => {
    expect(run("D crawl approach (4 / 12 barge)", bargeLegs(4, 12), 180)).toBeTruthy();
  });

  it("E. barge straight into the oncoming (contact)", () => {
    expect(
      run("E contact barge", [
        { to: { x: X_OWN, y: 96 }, kmh: 20 },
        { to: { x: 2, y: 104 }, kmh: 18 },
        { to: { x: X_ONC, y: 114 }, kmh: 18 },
        { to: { x: X_ONC, y: 200 }, kmh: 18 },
      ]),
    ).toBeTruthy();
  });

  it("F. THE FOUNDER DRIVE: wait at the marker, then cut into the narrowing at it", () => {
    expect(
      run("F wait-at-marker then cut in front of the inbound car", [
        { to: { x: X_OWN, y: 100 }, kmh: 20, pauseSec: 3.5 },
        { to: { x: X_ONC, y: 106 }, kmh: 16 },
        { to: { x: X_ONC, y: 150 }, kmh: 16 },
        { to: { x: X_OWN, y: 175 }, kmh: 16 },
      ]),
    ).toBeTruthy();
  });

  it("G. fast contact barge (30 km/h — contact before the sustain window)", () => {
    expect(
      run("G fast contact barge (30 km/h)", [
        { to: { x: X_OWN, y: 92 }, kmh: 30 },
        { to: { x: X_ONC, y: 104 }, kmh: 30 },
        { to: { x: X_ONC, y: 200 }, kmh: 30 },
      ]),
    ).toBeTruthy();
  });

  it("H. drive the oncoming lane the whole way at 16 km/h (never in own lane)", () => {
    expect(
      run("H wrong-side the whole way at 16 km/h", [
        { to: { x: X_OWN, y: 55 }, kmh: 16 },
        { to: { x: X_ONC, y: 70 }, kmh: 16 },
        { to: { x: X_ONC, y: 175 }, kmh: 16 },
      ]),
    ).toBeTruthy();
  });

  it("J. HOLD at the marker until the car is at the mouth, THEN cut in front of it", () => {
    expect(
      run("J hold-then-cut (the exact under-detection window)", [
        { to: { x: X_OWN, y: 100 }, kmh: 20, pauseSec: 10 },
        { to: { x: X_ONC, y: 104 }, kmh: 16 },
        { to: { x: X_ONC, y: 145 }, kmh: 16 },
        { to: { x: X_OWN, y: 175 }, kmh: 16 },
      ]),
    ).toBeTruthy();
  });

  it("I. LAWFUL: wait at the widening until the car is truly past, then squeeze", () => {
    expect(
      run("I lawful wait-then-squeeze", [
        { to: { x: X_OWN, y: 104 }, kmh: 20, pauseSec: 13 },
        { to: { x: 2, y: 110 }, kmh: 12 },
        { to: { x: X_ONC, y: 118 }, kmh: 12 },
        { to: { x: X_ONC, y: 138 }, kmh: 12 },
        { to: { x: 2, y: 146 }, kmh: 12 },
        { to: { x: X_OWN, y: 175 }, kmh: 16 },
      ]),
    ).toBeTruthy();
  });
});
