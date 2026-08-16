import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRuleEngine,
  DEFAULT_RULE_CONFIG,
  reduceTick,
  type RuleEvent,
  type SimTick,
} from "@/modules/sim/rules";
import { PHYSICS_MAX_FRAME_DT, sessionClockAdvance } from "../sessionClock";

/**
 * THE PC SLOW-FRAME CLOCK SPLIT — 2026-08-16.
 *
 * Measured on staging, Chromium 1440×900 @2, `sc-zebra-approach` L1, the ego
 * camera's `matrixWorld` sampled per rendered frame: the desktop render graph
 * costs 2.33 s/frame at deviceScaleFactor 1 and 3.57 s/frame at 2. On a frame
 * that long `LessonScene`'s RuntimeDriver advanced the GRADED clock by
 * `Math.min(delta, 0.1)` while rapier advanced the CAR by
 * `MathUtils.clamp(delta, 0, 0.5)` — a five-fold split between the position the
 * rule engine was handed and the clock it was told to read it against.
 *
 * The four blocks below are the four things that had to be true before that
 * line could be changed, in the order they were established.
 */

// The five deltas everything here is measured at: the two frame times the PC
// probe actually recorded, the 10 fps boundary where the old ceiling first bit,
// and a healthy machine above and below it.
const PC_DSF1_FRAME_S = 2.33;
const PC_DSF2_FRAME_S = 3.57;
const SIXTY_FPS_S = 1 / 60;

/** What this fix replaced. Kept here, and only here, so the test can fail on it. */
const LEGACY_SESSION_CLOCK_MAX_DT = 0.1;

describe("the ceiling is rapier's, not ours", () => {
  it("matches the clamp in the INSTALLED @react-three/rapier bundle", () => {
    // A constant copied out of a dependency is a constant that drifts silently
    // the next time the dependency is bumped. Read it back instead: this is the
    // exact expression `<Physics>` runs before its fixed-step accumulator, so
    // if a rapier upgrade moves the ceiling, this line — not a founder review —
    // is what notices.
    const bundle = readFileSync(
      resolve(__dirname, "../../../../..", "node_modules/@react-three/rapier/dist/react-three-rapier.cjs.dev.js"),
      "utf8",
    );
    const clamp = /MathUtils\.clamp\(\s*dt\s*,\s*0\s*,\s*([0-9.]+)\s*\)/.exec(bundle);
    expect(clamp, "rapier no longer clamps the frame delta the way this fix assumes").not.toBeNull();
    expect(Number(clamp?.[1])).toBe(PHYSICS_MAX_FRAME_DT);
  });
});

describe("sessionClockAdvance", () => {
  /** rapier's own clamp, written out so the equality below is a real comparison. */
  const physicsAdvance = (delta: number) => Math.max(0, Math.min(PHYSICS_MAX_FRAME_DT, delta));

  it("hands the lesson exactly the world time the physics integrated", () => {
    for (const delta of [SIXTY_FPS_S, 0.05, 0.1, 0.10001, 0.3, 0.499, 0.5, 0.501, 1, PC_DSF1_FRAME_S, PC_DSF2_FRAME_S, 30]) {
      expect(sessionClockAdvance(delta), `frame of ${delta}s`).toBe(physicsAdvance(delta));
    }
  });

  it("is bit-identical to the ceiling it replaced above 10 fps", () => {
    // The whole population that is NOT the defect. If this ever fails, the fix
    // has changed grading on healthy machines, which it must never do.
    for (const delta of [SIXTY_FPS_S, 1 / 120, 1 / 30, 1 / 15, 0.05, 0.099]) {
      expect(sessionClockAdvance(delta)).toBe(Math.min(delta, LEGACY_SESSION_CLOCK_MAX_DT));
      expect(sessionClockAdvance(delta)).toBe(delta);
    }
  });

  it("no longer short-changes the two frame times the PC probe measured", () => {
    // The regression line. Both of these returned 0.1 before.
    expect(sessionClockAdvance(PC_DSF1_FRAME_S)).toBe(0.5);
    expect(sessionClockAdvance(PC_DSF2_FRAME_S)).toBe(0.5);
    expect(sessionClockAdvance(PC_DSF2_FRAME_S) / LEGACY_SESSION_CLOCK_MAX_DT).toBe(5);
  });

  it("buys no lesson time from a frame the browser cannot describe", () => {
    // NaN: rapier's accumulator takes `+= NaN` and then `accumulator >=
    // timeStep` is false forever — the world advances by nothing, so neither
    // may the clock. It is also the only answer that keeps `SimTick.t` a
    // number; one NaN in `tRef` makes every sustain window, lookback and scored
    // comparison for the rest of the session answer `false` in silence.
    expect(sessionClockAdvance(Number.NaN)).toBe(0);
    expect(sessionClockAdvance(-1)).toBe(0);
    expect(sessionClockAdvance(0)).toBe(0);
    // …but Infinity is NOT a non-number to rapier: it clamps to 0.5 and the
    // world genuinely steps. Refusing it here would open a fresh split of
    // exactly the kind this file exists to close. (The first draft did.)
    expect(sessionClockAdvance(Number.POSITIVE_INFINITY)).toBe(PHYSICS_MAX_FRAME_DT);
  });
});

/**
 * WHAT THE SPLIT COST THE STUDENT, through the real reducer.
 *
 * `engine.ts` integrates the clean-driving streak as
 * `cleanDistanceM += (speed / 3.6) * (t - prevT)` and pays a CLEAN_DRIVING
 * commendation every `cleanDrivingDistanceM` (250 m). Speed comes from the
 * vehicle sim, which is stepped by rapier and is therefore truthful; `t` came
 * from the clock this fix repaired. Same drive, same car, two clocks.
 */
describe("the credit the PC frame rate was destroying", () => {
  // Read from the config rather than written as 250/700/2 so the point of this
  // block survives a re-tuning of the streak by whoever owns the rule engine.
  const STREAK_M = DEFAULT_RULE_CONFIG.cleanDrivingDistanceM;
  const CRUISE_KMH = 42;
  const WORLD_SECONDS = 60;
  const ROAD_M = (CRUISE_KMH / 3.6) * WORLD_SECONDS;

  /** A neutral, legal frame — belted, lights on, inside the limit, day. */
  function frame(t: number, x: number): SimTick {
    return {
      t,
      speedKmh: CRUISE_KMH,
      maxSpeedKmh: 50,
      position: { x, y: 0 },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      events: [],
    };
  }

  /**
   * Drive WORLD_SECONDS of world time at CRUISE_KMH — 700 m of real road —
   * delivered in frames of `frameSec`, and grade it on a clock that advances
   * `clockAdvance` per frame. The position stream is identical in every run: it
   * is the car's, and the car is rapier's.
   */
  function driveTheSameRoad(frameSec: number, clockAdvance: (d: number) => number) {
    const worldPerFrame = Math.max(0, Math.min(PHYSICS_MAX_FRAME_DT, frameSec));
    const frames = Math.round(WORLD_SECONDS / worldPerFrame);
    const mps = CRUISE_KMH / 3.6;
    let state = createRuleEngine();
    let t = 0;
    let x = 0;
    const events: RuleEvent[] = [];
    for (let i = 0; i < frames; i++) {
      t += clockAdvance(frameSec);
      x += mps * worldPerFrame;
      const r = reduceTick(state, frame(t, x));
      state = r.state;
      events.push(...r.events);
    }
    const commendations = events.filter((e) => e.code === "CLEAN_DRIVING").length;
    return {
      metresDriven: x,
      clockSeconds: t,
      // The streak resets on each award, so the road the engine believes it saw
      // is the awards plus whatever is still on the counter.
      creditedMetres: state.cleanDistanceM + STREAK_M * commendations,
      commendations,
      violations: events.filter((e) => e.kind === "violation").map((e) => e.code),
    };
  }

  it("credits the road actually driven, at any frame rate", () => {
    const healthy = driveTheSameRoad(SIXTY_FPS_S, sessionClockAdvance);
    const struggling = driveTheSameRoad(PC_DSF2_FRAME_S, sessionClockAdvance);

    // 700 m of road, and nothing illegal happened on any of it.
    expect(healthy.metresDriven).toBeCloseTo(ROAD_M, 0);
    expect(struggling.metresDriven).toBeCloseTo(ROAD_M, 0);
    expect(healthy.violations).toEqual([]);
    expect(struggling.violations).toEqual([]);

    // The machine that stutters earns what the machine that does not earns.
    expect(healthy.commendations).toBe(Math.floor(ROAD_M / STREAK_M));
    expect(struggling.commendations).toBe(healthy.commendations);

    // Within 1 %, and the residual is named rather than tolerated: the reducer
    // credits nothing on the first frame of a session (`prevT` is null), which
    // costs one frame of road — 5.83 m at 0.5 s/frame against 0.19 m at 60 fps.
    // 5.64 m of 700 is the whole remaining gap between a 0.28 fps machine and a
    // healthy one. It was 560 m before this fix.
    const gap = Math.abs(struggling.creditedMetres - healthy.creditedMetres);
    expect(gap).toBeLessThan(0.01 * healthy.creditedMetres);
    expect(gap).toBeCloseTo((CRUISE_KMH / 3.6) * (PHYSICS_MAX_FRAME_DT - SIXTY_FPS_S), 1);
  });

  it("FAILS on the old ceiling: 700 m driven, 140 m credited, nothing earned", () => {
    const old = driveTheSameRoad(PC_DSF2_FRAME_S, (d) =>
      Math.min(d, LEGACY_SESSION_CLOCK_MAX_DT),
    );

    // The car went exactly as far as it does above — this is the same drive.
    expect(old.metresDriven).toBeCloseTo(ROAD_M, 0);
    // …and the engine was told twelve seconds had passed.
    expect(old.clockSeconds).toBeCloseTo(
      (WORLD_SECONDS * LEGACY_SESSION_CLOCK_MAX_DT) / PHYSICS_MAX_FRAME_DT,
      5,
    );
    expect(old.creditedMetres).toBeLessThan(STREAK_M);
    expect(old.commendations).toBe(0);

    // The founder's „nothing happens on my PC", stated as a ratio.
    const fixed = driveTheSameRoad(PC_DSF2_FRAME_S, sessionClockAdvance);
    expect(fixed.creditedMetres / old.creditedMetres).toBeCloseTo(
      PHYSICS_MAX_FRAME_DT / LEGACY_SESSION_CLOCK_MAX_DT,
      1,
    );
  });
});

/**
 * The call site. The reasoning above is worth nothing if `LessonScene` quietly
 * goes back to a hand-written ceiling, and that file cannot be imported into a
 * Node test (R3F, rapier wasm, the district loader). Source assertion, the
 * idiom `app/touchTargets.test.ts` and `shellStability.test.ts` established.
 */
describe("LessonScene's RuntimeDriver", () => {
  const SCENE = readFileSync(resolve(__dirname, "../../LessonScene.tsx"), "utf8");
  const code = SCENE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("advances the session clock through sessionClockAdvance", () => {
    expect(code).toMatch(/const dt = sessionClockAdvance\(delta\);\s*\n\s*tRef\.current \+= dt;/);
  });

  it("carries no second, hand-written frame ceiling", () => {
    // `Math.min(delta, 0.1)` was the defect verbatim; any re-introduction of a
    // clamp on the raw frame delta in this file is the same defect again.
    expect(code).not.toMatch(/Math\.(min|max)\(\s*delta\s*,/);
  });

  it("keeps the follow-line hint on driving seconds, not wall seconds", () => {
    // `state.clock.elapsedTime` is wall time and ran straight through every
    // teach-moment pause; on a 2.33 s frame one deviated frame cleared the 2 s
    // sustain. FollowHintProbe is the only other lesson timer in the file.
    expect(code).not.toMatch(/clock\.elapsedTime/);
    expect(code).toMatch(/s\.t \+= sessionClockAdvance\(delta\);/);
  });
});
