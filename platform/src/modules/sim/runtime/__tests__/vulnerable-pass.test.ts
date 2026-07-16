/**
 * VULNERABLE-PASS adjudication (doc 72 §7 VU-02 — „тясно изпреварване на
 * колело", ЗДвП чл. 42). The tracker grades a completed overtake of a
 * same-direction cyclist proxy by the MINIMUM center-to-center lateral
 * distance over the alongside phase (bands documented at
 * VULNERABLE_PASS_PROBE_RADIUS_M — the ~1.25 m body allowance converts to
 * air):
 *  - min lateral < CONVICT (2.45 m ≈ 1.2 m air) at pass speed
 *    → violated "vulnerable-pass" (reducer: VULNERABLE_PASS_TOO_CLOSE);
 *  - CONVICT..SAFE (≈ 1.2–1.5 m air): the honest teach band — silent;
 *  - ≥ SAFE (2.75 m ≈ 1.5 m air) → yielded (YIELDED_TO_PRIORITY).
 *
 * FP battery (the bias-away-from-FPs bar):
 *  1. the SWERVE STAND-DOWN — the cyclist's own line drifting toward the
 *     player consumes the margin, and the episode stands down entirely
 *     (the control pair proves the same geometry convicts without the drift);
 *  2. queue creeping (under the pass floor) never arms;
 *  3. a cyclist FASTER than the player (it passes you) never arms;
 *  4. junction areas discard the episode (the right-hook family's turf);
 *  5. sub-contact overlap is the collision machinery's act — silent here;
 *  6. reverse maneuvering discards (A12);
 *  7. no cyclist (null query) = structural silence.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createWorldRuntime,
  VULNERABLE_PASS_CONTACT_M,
  VULNERABLE_PASS_CONVICT_LATERAL_M,
  VULNERABLE_PASS_MIN_KMH,
  VULNERABLE_PASS_PROBE_RADIUS_M,
  VULNERABLE_PASS_SAFE_LATERAL_M,
  type CyclistConflict,
} from "..";
import { eventsOf, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadWorld(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** vu-pass-v1 geometry (meta.scenario — the L7 copy truth). */
const LANE_X = 4.06;
/** The cyclist's curb line on vu-pass-v1 (lane center + 2.6). */
const CYCLIST_X = 6.6625;

const DT = 0.05;

interface Frame {
  pose: PathPose;
  speedKmh: number;
  gear?: number;
}

/** `n` northbound player poses at lateral x from y0 at speedKmh. */
function northRun(x: number, y0: number, n: number, speedKmh: number, gear = 1): Frame[] {
  const frames: Frame[] = [];
  const step = (speedKmh / 3.6) * DT;
  for (let i = 0; i < n; i++) {
    frames.push({ pose: { x, y: y0 + i * step, headingDeg: 0 }, speedKmh, gear });
  }
  return frames;
}

/** A northbound cyclist "actor" the scripted query animates per frame. */
interface CyclistScript {
  /** Lateral line at frame f (drift scripts move it). */
  x(frame: number): number;
  y0: number;
  speedMps: number;
}

function makeQuery(script: CyclistScript) {
  return (px: number, py: number, _headingDeg: number, radiusM: number): CyclistConflict | null => {
    const cy = script.y0 + script.speedMps * clock.frame * DT;
    const cx = script.x(clock.frame);
    if (Math.hypot(cx - px, cy - py) > radiusM) return null;
    return { x: cx, y: cy, dirX: 0, dirY: 1, speedMps: script.speedMps };
  };
}

const clock = { frame: 0 };

function run(rt: ReturnType<typeof createWorldRuntime>, fs: Frame[]): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  clock.frame = 0;
  for (const f of fs) {
    t += DT;
    rt.update(DT);
    ticks.push(rt.sample(mkVehicle(f.pose, { speedKmh: f.speedKmh, gear: f.gear ?? 1 }), t, false));
    clock.frame++;
  }
  return ticks;
}

const passEventsOf = (ticks: SimTick[]) =>
  eventsOf(ticks, "prioritySituation").filter(
    (e) => "situation" in e && e.situation === "vulnerable-pass",
  );

/** Player overtake run: 30 km/h from y 100 vs a 3 m/s cyclist from y 130 —
 * closing 5.33 m/s; alongside at ~5.6 s, complete by ~7.2 s; 200 frames
 * (10 s) cover the whole pass with margin. */
const OVERTAKE_FRAMES = 200;
const CYCLIST_AHEAD: Omit<CyclistScript, "x"> = { y0: 130, speedMps: 3 };

describe("vulnerable-pass adjudication (VU-02) — the bands", () => {
  it("bands are ordered as documented (contact < convict < safe)", () => {
    expect(VULNERABLE_PASS_CONTACT_M).toBeLessThan(VULNERABLE_PASS_CONVICT_LATERAL_M);
    expect(VULNERABLE_PASS_CONVICT_LATERAL_M).toBeLessThan(VULNERABLE_PASS_SAFE_LATERAL_M);
  });

  it("convicts the squeeze ONCE at pass completion (~1.1 m of air)", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    // x 4.3 → 2.3625 m of centers: inside the convict band, above contact.
    const ticks = run(rt, northRun(4.3, 100, OVERTAKE_FRAMES, 30));
    const events = passEventsOf(ticks);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "prioritySituation", situation: "vulnerable-pass", violated: true });
  });

  it("the wide arc earns the yielded commendation (≥ 1.5 m of air)", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    // x 2.2 → 4.46 m of centers ≈ 3.2 m of air.
    const ticks = run(rt, northRun(2.2, 100, OVERTAKE_FRAMES, 30));
    const events = passEventsOf(ticks);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: "prioritySituation",
      situation: "vulnerable-pass",
      violated: false,
      yielded: true,
    });
  });

  it("the honest teach band (≈ 1.2–1.5 m of air) stays SILENT — no bill, no medal", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    // Lane center x 4.06 → 2.6 m of centers ≈ 1.35 m of air: between bands.
    const ticks = run(rt, northRun(LANE_X, 100, OVERTAKE_FRAMES, 30));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("a sub-contact overlap is the collision machinery's act — silent here", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    // x 4.8 → 1.86 m of centers: under the 2.2 m contact bar.
    const ticks = run(rt, northRun(4.8, 100, OVERTAKE_FRAMES, 30));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });
});

describe("vulnerable-pass — the swerve stand-down (the VU-03 reality)", () => {
  /** Cyclist drifts from the curb line to x 4.5 (2.16 m toward the player)
   * across frames 40..100 — mid-pass, well past the arm anchor. */
  const drifting = (frame: number): number => {
    const k = Math.min(1, Math.max(0, (frame - 40) / 60));
    return CYCLIST_X - k * (CYCLIST_X - 4.5);
  };

  it("CONTROL: the same final geometry WITHOUT the drift convicts (cyclist steady at x 4.5)", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => 4.5 }));
    // Player on the wide line x 2.2 → 2.3 m of centers vs the 4.5 line.
    const ticks = run(rt, northRun(2.2, 100, OVERTAKE_FRAMES, 30));
    const events = passEventsOf(ticks);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ violated: true });
  });

  it("stands down when the cyclist's OWN line drifts into the margin mid-pass", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: drifting }));
    const ticks = run(rt, northRun(2.2, 100, OVERTAKE_FRAMES, 30));
    // The min lateral ends identical to the control (~2.3 m of centers), but
    // the margin was CONSUMED BY THE CYCLIST — no bill, no medal.
    expect(passEventsOf(ticks)).toHaveLength(0);
  });
});

describe("vulnerable-pass — structural innocence (A12)", () => {
  it("queue creeping under the pass floor never arms", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    // A nearly-standing cyclist, the player worming past at 13 km/h.
    rt.setCyclistQuery(makeQuery({ y0: 120, speedMps: 0.5, x: () => CYCLIST_X }));
    expect(13).toBeLessThan(VULNERABLE_PASS_MIN_KMH + 3); // the case's premise
    const ticks = run(rt, northRun(4.3, 100, 600, 13));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("a cyclist FASTER than the player (it overtakes you) never arms", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    // Cyclist starts BEHIND at 8 m/s; player rolls at 18 km/h (5 m/s).
    rt.setCyclistQuery(
      (px, py, _h, r) => {
        const cy = 70 + 8 * clock.frame * DT;
        return Math.hypot(CYCLIST_X - px, cy - py) > r
          ? null
          : { x: CYCLIST_X, y: cy, dirX: 0, dirY: 1, speedMps: 8 };
      },
    );
    const ticks = run(rt, northRun(4.3, 100, 400, 18));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("junction areas discard the episode — the right-hook family's turf (vu-cyclist-v1)", () => {
    // Eastbound on the vu-cyclist-v1 through road toward the junction at
    // (0, 0): the pass would complete ~20 m short of the node, INSIDE the
    // 40 m junction area — discarded, never billed.
    const rt = createWorldRuntime(loadWorld("vu-cyclist-v1"));
    rt.setCyclistQuery((px, py, _h, r) => {
      const cx = -45 + 3 * clock.frame * DT; // eastbound cyclist from x −45
      const cy = -6.66;
      return Math.hypot(cx - px, cy - py) > r
        ? null
        : { x: cx, y: cy, dirX: 1, dirY: 0, speedMps: 3 };
    });
    const frames: Frame[] = [];
    const step = (40 / 3.6) * DT;
    for (let i = 0; i < 160; i++) {
      frames.push({ pose: { x: -70 + i * step, y: -4.3, headingDeg: 90 }, speedKmh: 40 });
    }
    const ticks = run(rt, frames);
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("reverse maneuvering discards", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    const ticks = run(rt, northRun(4.3, 100, OVERTAKE_FRAMES, 30, -1));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("no cyclist (null query) = structural silence", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    const ticks = run(rt, northRun(4.3, 100, OVERTAKE_FRAMES, 30));
    expect(passEventsOf(ticks)).toHaveLength(0);
  });

  it("dropping out of the probe mid-episode discards (stopped short, no pass)", () => {
    const rt = createWorldRuntime(loadWorld("vu-pass-v1"));
    rt.setCyclistQuery(makeQuery({ ...CYCLIST_AHEAD, x: () => CYCLIST_X }));
    // Close to ~15 m behind, then stop and let the cyclist ride away beyond
    // the probe radius — the armed episode must dissolve without a bill.
    const approach = northRun(4.3, 100, 60, 30); // 2.5 m/frame·60 ≈ y 125
    const rest: Frame[] = Array.from({ length: 700 }, () => ({
      pose: { x: 4.3, y: 125, headingDeg: 0 },
      speedKmh: 0,
    }));
    const ticks = run(rt, [...approach, ...rest]);
    expect(passEventsOf(ticks)).toHaveLength(0);
    expect(VULNERABLE_PASS_PROBE_RADIUS_M).toBeGreaterThan(0); // doc anchor
  });
});
