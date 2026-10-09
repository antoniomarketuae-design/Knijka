/**
 * THE CLOSE FOLLOWER'S ACCOUNT — `RearTailgaterRunner.stepFollowerAccount`
 * (`sc-follow-tailgater:63c0c28c` C1/C2a, 2026-10-09).
 *
 * The runner reports `followerBraked` — «the car glued behind him had to brake
 * HARD because of him» — on the frame its own published speed goes through the
 * product's harsh-brake gates (`harshBrakeEpisode.ts`), and only while it is a
 * close follower whose every brake is his: latched, under the matchPlayer law
 * (before the pass, or a passShiftM-0 pass keeping station), with him ahead of
 * it in its lane. The rule engine does the judging (engine.ts „THE FLOOR LIFTS
 * FOR A FOLLOWER IT PUT AT RISK"); this file pins what is reported, and when
 * nothing is. The real traffic system on the committed ln-v1, the lesson's own
 * spec, a fixed jitter draw, 60 Hz.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RearTailgaterSpec, StagedEventSpec } from "../../contracts";
import {
  DEFAULT_RULE_CONFIG,
  isHarshBrakeWindow,
  type SimTickEvent,
} from "../../rules";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { createTrafficSystem } from "../../traffic/system";
import type { StagedActorView, TrafficDistrict } from "../../traffic/types";
import { RearTailgaterRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 60;
const rng = () => 0.5;

const SPEC = (SCENARIO_TEMPLATES as ScenarioSpec[]).find(
  (s) => s.id === "sc-follow-tailgater",
)!;
const TAILGATER = [
  ...(SPEC.staged ?? []),
  ...SPEC.levels.flatMap((l) => l.stagedAdd ?? []),
].find((s: StagedEventSpec) => s.kind === "rearTailgater") as RearTailgaterSpec;
const LN = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, "content", "world", `${SPEC.map.districtId}.json`),
    "utf-8",
  ),
) as TrafficDistrict;
const LANE_X = 12.19;

type Followed = Extract<SimTickEvent, { kind: "followerBraked" }>;

interface Opts {
  spec?: RearTailgaterSpec;
  cruiseKmh?: number;
  /** Pedal at this session time, s; decel profile m/s² (the rig's full pedal by default). */
  brakeAt: number;
  decel?: (vMps: number) => number;
  /** Stop braking at this speed, км/ч. */
  releaseKmh?: number;
  /** Wrap the port (strip fields to model a fake one). */
  view?: (v: StagedActorView) => StagedActorView;
}

function run(o: Opts): {
  reports: Followed[];
  t: number[];
  passStartSec: number | null;
  actorSpeedAtPedal: number | null;
} {
  const spec = o.spec ?? TAILGATER;
  const tr = createTrafficSystem(LN, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const port: StagedTrafficPort = o.view
    ? new Proxy(tr as unknown as StagedTrafficPort, {
        get(target, prop, recv) {
          if (prop === "staged") {
            return (id: string) => {
              const v = (target as StagedTrafficPort).staged(id);
              return v ? o.view!(v) : v;
            };
          }
          return Reflect.get(target, prop, recv);
        },
      })
    : (tr as unknown as StagedTrafficPort);
  const runner = new RearTailgaterRunner(spec);
  runner.stage(port, rng, true);
  const cruise = (o.cruiseKmh ?? 33) / 3.6;
  const decel = o.decel ?? ((v: number) => 9.5 * Math.min(1, 0.45 * v) + 0.5);
  const release = (o.releaseKmh ?? 0) / 3.6;
  let y = 15;
  let v = 0;
  let braking = false;
  let done = false;
  const reports: Followed[] = [];
  const times: number[] = [];
  let passStartSec: number | null = null;
  let actorSpeedAtPedal: number | null = null;
  for (let i = 1; i * DT < 40; i++) {
    const t = i * DT;
    if (!done && t >= o.brakeAt) braking = true;
    if (braking) {
      v = Math.max(0, v - decel(v) * DT);
      if (v <= release) {
        braking = false;
        done = true;
      }
    } else if (!done) {
      v = Math.min(cruise, v + 1.95 * DT);
    }
    y += v * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: 0,
    });
    const out: SimTickEvent[] = [];
    runner.step(
      port,
      {
        tSec: t,
        dtSec: DT,
        x: LANE_X,
        y,
        speedKmh: v * 3.6,
        headingDeg: 0,
        brakePedal: braking ? 1 : 0,
        tickEvents: [],
      } satisfies DirectorInput,
      out,
    );
    const a = tr.staged(spec.id);
    if (a && actorSpeedAtPedal === null && braking)
      actorSpeedAtPedal = a.speedMps;
    if (a && passStartSec === null && Math.abs(a.x - LANE_X) > 0.01 && t > 2)
      passStartSec = t;
    for (const e of out) {
      if (e.kind === "followerBraked") {
        reports.push(e);
        times.push(t);
      }
    }
  }
  return { reports, t: times, passStartSec, actorSpeedAtPedal };
}

describe("RearTailgaterRunner — what the glued car had to do (63c0c28c)", () => {
  const free = run({ brakeAt: 1000 });

  it("the timeline these rows use: glued well before 8 s, its pass begins after 12 s", () => {
    expect(free.passStartSec).not.toBeNull();
    expect(free.passStartSec!).toBeGreaterThan(12);
    expect(free.reports).toEqual([]);
  });

  it("a full-pedal brake check from 33 км/ч while it is glued: ONE report, on its own hard brake, through the engine's own gates", () => {
    const r = run({ brakeAt: 8 });
    expect(r.reports).toHaveLength(1);
    const e = r.reports[0]!;
    expect(
      isHarshBrakeWindow(
        {
          heldSec: e.heldSec,
          meanDecelMps2: e.decelMps2,
          qualifiedSec: e.qualifiedSec,
        },
        DEFAULT_RULE_CONFIG,
      ),
    ).toBe(true);
    expect(e.decelMps2).toBeGreaterThan(9);
    expect(e.shedMps).toBeGreaterThanOrEqual(
      DEFAULT_RULE_CONFIG.harshBrakeDecelMps2 *
        DEFAULT_RULE_CONFIG.harshBrakeSustainSec,
    );
    // Its speed when its braking began is the speed it held behind him (~9.2 m/s at 33 км/ч).
    expect(e.speedMps).toBeCloseTo(r.actorSpeedAtPedal!, 0);
    expect(e.gapM).toBeGreaterThan(3);
    expect(e.gapM).toBeLessThan(7);
    expect(r.t[0]!).toBeGreaterThanOrEqual(8.39); // the sustain after the pedal at 8 s
    expect(r.t[0]!).toBeLessThan(8.6);
    expect(e.vehicleId).toBeTypeOf("number");
  });

  it("the taught ease-off (1–3 m/s²) and a firm 5 m/s² stop are never reported", () => {
    for (const d of [1, 2, 3, 5]) {
      expect(
        run({ brakeAt: 8, decel: () => d, releaseKmh: 20 }).reports,
        `${d} m/s²`,
      ).toEqual([]);
    }
  });

  it("once the pass is under way the car is no longer read: the same pedal after its pass began is not reported", () => {
    const r = run({ brakeAt: free.passStartSec! + 0.3 });
    expect(r.reports).toEqual([]);
  });

  it("a passShiftM-0 pass keeps station behind him — that is the matchPlayer law again, and it IS read", () => {
    const station: RearTailgaterSpec = { ...TAILGATER, passShiftM: 0 };
    const s = run({ spec: station, brakeAt: 1000 });
    expect(s.reports).toEqual([]);
    const r = run({ spec: station, brakeAt: 14 });
    expect(r.reports).toHaveLength(1);
  });

  it("a fake port reports nothing: no published state id, or no lane width", () => {
    expect(
      run({ brakeAt: 8, view: (v) => ({ ...v, stateId: undefined }) }).reports,
    ).toEqual([]);
    expect(
      run({ brakeAt: 8, view: (v) => ({ ...v, laneWidthM: undefined }) })
        .reports,
    ).toEqual([]);
  });
});

/**
 * WHEN THE CAR IS NOT READ — with a scripted port, so the car's speed is
 * whatever the row says and only the runner's reading conditions decide. The
 * car drops 9 m/s at 10 m/s² (a brake the gates call hard) in three places.
 */
describe("RearTailgaterRunner — the account is read only while the car is glued under the matchPlayer law", () => {
  function scripted(o: {
    gapBehindM: (t: number) => number;
    dropAt: number;
    passAtLatchPlus?: number;
    /** How long the car brakes at 10 m/s² from `dropAt`, s (default 0.9). */
    dropSec?: number;
    passShiftM?: number;
    /** The student's lateral offset from the lane centre at time t, m (default 0). */
    studentOffM?: (t: number) => number;
  }) {
    const spec: RearTailgaterSpec = {
      ...TAILGATER,
      pressureSec: o.passAtLatchPlus ?? TAILGATER.pressureSec,
      ...(o.passShiftM !== undefined ? { passShiftM: o.passShiftM } : {}),
    };
    const dropSec = o.dropSec ?? 0.9;
    const off = o.studentOffM ?? (() => 0);
    let speed = 9;
    let y = 20;
    let t = 0;
    const commands: string[] = [];
    const view = (): StagedActorView =>
      ({
        x: LANE_X,
        y: y - o.gapBehindM(t),
        dirX: 0,
        dirY: 1,
        speedMps: speed,
        laneWidthM: 3.5,
        stateId: 7,
        finished: false,
      }) as unknown as StagedActorView;
    const port: StagedTrafficPort = {
      stage: () => view(),
      stagedCommand: (_id, c) => commands.push(c.type),
      staged: () => view(),
    };
    const runner = new RearTailgaterRunner(spec);
    runner.stage(port, () => 0.5, true);
    const reports: number[] = [];
    for (let i = 1; i * DT < 30; i++) {
      t = i * DT;
      y += 9 * DT;
      if (t >= o.dropAt && t < o.dropAt + dropSec)
        speed = Math.max(0, speed - 10 * DT);
      const out: SimTickEvent[] = [];
      runner.step(
        port,
        {
          tSec: t,
          dtSec: DT,
          x: LANE_X + off(t),
          y,
          speedKmh: 32.4,
          headingDeg: 0,
          brakePedal: 0,
          tickEvents: [],
        } satisfies DirectorInput,
        out,
      );
      for (const e of out) if (e.kind === "followerBraked") reports.push(t);
    }
    return { reports, commands };
  }
  // Released at 21 m behind (releaseGapM 20 ± 2 at the fixed draw), latched once within followBehindM + 4.
  const glued = (t: number) => (t < 1 ? 22 : 9);

  it("glued, before the pass: reported", () => {
    expect(scripted({ gapBehindM: glued, dropAt: 5 }).reports).toHaveLength(1);
  });
  it("released but never glued (15 m back, outside the latch band): not reported", () => {
    expect(
      scripted({ gapBehindM: (t) => (t < 1 ? 22 : 15), dropAt: 5 }).reports,
    ).toEqual([]);
  });
  it("after its pass was commanded (cruise law): not reported", () => {
    const r = scripted({ gapBehindM: glued, dropAt: 5, passAtLatchPlus: 2 });
    expect(r.commands).toContain("laneShift");
    expect(r.reports).toEqual([]);
  });
  it("after a passShiftM-0 pass was commanded and it is KEEPING STATION behind him (the matchPlayer law again): reported", () => {
    // The pass is commanded ~3 s after the latch; the car is still in his lane behind him, so the pass
    // law is `station` — and its hard brake at 5 s is his, exactly as before the pass.
    const r = scripted({ gapBehindM: glued, dropAt: 5, passAtLatchPlus: 2, passShiftM: 0 });
    expect(r.commands).toContain("laneShift");
    expect(r.commands.filter((c) => c === "matchPlayer").length).toBeGreaterThanOrEqual(2);
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!).toBeGreaterThan(5);
  });
  it("a car that stops being glued restarts its account: what it shed while he was out of its lane is not his brake", () => {
    // He steps out of the car's lane (4 m left) from 4.9 s to 5.25 s. Glued, it begins a 10 m/s² brake at
    // 4.8 s that lasts 0.6 s: 0.1 s of it read before he left, 0.15 s after he came back — neither half
    // reaches the 0.4 s sustain on its own, and the brake straddles a stretch in which the car was not
    // reading him. Read as one account, it would be a hard brake; read as two, it is not.
    const out = (t: number) => (t >= 4.9 && t < 5.25 ? -4 : 0);
    const r = scripted({ gapBehindM: glued, dropAt: 4.8, dropSec: 0.6, studentOffM: out });
    expect(r.reports).toEqual([]);
    // …and the same brake with him in the lane throughout IS reported (the row's antecedent).
    expect(scripted({ gapBehindM: glued, dropAt: 4.8, dropSec: 0.6 }).reports).toHaveLength(1);
  });
});
