/**
 * Register row B73 — „Вклиняване", catalog 45.
 *
 * WHAT WAS SEEN. A live drive of `sc-follow-cutin` L1: at t 12 s the first
 * objective ticks green and the HUD flips to «Възстанови дистанцията след
 * вклиняването» — the merge is scored as having happened — while both lanes
 * ahead are empty. Frames: scratchpad/lane4t/frames/PRE-B73__t008.png,
 * __t012.png.
 *
 * WHY. Measured on the shipped spec over real ln-v1 geometry with a 2.5 m/s²
 * throttle ramp:
 *
 *   40 km/h — the actor holds 12.3 m ahead, blinker at t 10, cut at t 13. Fine.
 *   59 km/h — `maxMatchSpeedMps` 15 is 54 km/h, BELOW the player. The gap
 *             collapses 15 → 1.6 m and the actor lane-shifts at t 12 while it
 *             is 1.5 m BEHIND the bumper, ending 36 m back by t 16.
 *
 * 59 km/h on a 50 boulevard is what a seventeen-year-old actually drives, and
 * it is what the captured drive did. The lesson then taught a merge that
 * happened behind him: the north-star failure — a graded event whose cause was
 * never visible.
 *
 * Two guards, both in `CutInLeadCarRunner`:
 *   1. the pacing cap tracks the player so the actor can keep station;
 *   2. the glide cannot start unless the actor is genuinely in front.
 *
 * The tests below pin both, and pin the property that matters just as much:
 * the drive the authored numbers already covered must not move a millimetre.
 */
import { describe, expect, it } from "vitest";
import type { CutInLeadCarSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { CutInLeadCarRunner } from "../runners";
import type { DirectorInput } from "../types";

const DT = 1 / 30;
/** ln-v1's northbound lane centres (meta.scenario, pinned by value). */
const RIGHT_LANE_X = 12.1875;
const LEFT_LANE_X = 4.0625;
const LANE_SHIFT = 8.125;

/** The 400 m 2+2 boulevard sc-follow-cutin runs on, in miniature. */
function district(): TrafficDistrict {
  return {
    roads: {
      nodes: [
        { id: "ln-n-start", x: 0, y: 0 },
        { id: "ln-n-end", x: 0, y: 400 },
      ],
      edges: [
        {
          id: "ln-e-road",
          from: "ln-n-start",
          to: "ln-n-end",
          class: "tertiary",
          oneway: false,
          roundabout: false,
          lanes: 4,
          maxspeed: 50,
          length: 400,
          geometry: [
            [0, 0],
            [0, 400],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };
}

/** The shipped FC_CUTTER numbers (templates-following.ts), by value. */
function spec(): CutInLeadCarSpec {
  return {
    id: "cutter",
    kind: "cutInLeadCar",
    actor: {
      pathNodes: ["ln-n-start", "ln-n-end"],
      hold: { nodeIndex: 0, offsetM: 30 },
      cruiseSpeedMps: 11,
      extraRightOffsetM: -LANE_SHIFT,
      colorIndex: 1,
    },
    paceAheadM: 12,
    maxMatchSpeedMps: 15,
    cutAt: { x: LEFT_LANE_X, y: 150 },
    cutRadiusM: 4,
    minCutSpeedKmh: 25,
    cutShiftM: LANE_SHIFT,
    cutRampSec: 1.5,
    cutSpeedMps: 11,
    clearAheadM: 45,
  };
}

interface Sample {
  /** Signed metres the actor is ahead of the player, at the first frame of the
   *  glide. Null if the glide never started. */
  aheadAtCutM: number | null;
  /** tSec of the first frame with any lateral offset. */
  cutAtSec: number | null;
  /** tSec the indicator first lit. */
  indicatorAtSec: number | null;
  indicatorSide: string | null;
  /** Minimum "ahead" seen from the moment the glide starts to the end. */
  minAheadAfterCutM: number;
  /** Fastest the staged actor ever went, m/s. */
  topActorMps: number;
  detail: string | null;
}

/** Drive north in the RIGHT lane, ramping the throttle like a real car. */
function drive(topMps: number, secs = 26, override: Partial<CutInLeadCarSpec> = {}): Sample {
  const s = { ...spec(), ...override };
  const traffic = createTrafficSystem(district(), {
    anchor: { x: RIGHT_LANE_X, y: 15 },
    anchorRadiusM: 400,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new CutInLeadCarRunner(s);
  runner.stage(traffic, () => 0.5, true);

  let py = 15;
  let mps = 0;
  let topActorMps = 0;
  const out: SimTickEvent[] = [];
  const r: Sample = {
    aheadAtCutM: null,
    cutAtSec: null,
    indicatorAtSec: null,
    indicatorSide: null,
    minAheadAfterCutM: Infinity,
    topActorMps: 0,
    detail: null,
  };
  for (let i = 0; i < secs * 30; i++) {
    const tSec = i * DT;
    mps = Math.min(topMps, mps + 2.5 * DT);
    py += mps * DT;
    const input = {
      tSec,
      dtSec: DT,
      x: RIGHT_LANE_X,
      y: py,
      speedKmh: mps * 3.6,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    } as unknown as DirectorInput;
    const outcome = runner.step(traffic, input, out);
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: RIGHT_LANE_X, y: py },
      playerSpeedKmh: mps * 3.6,
      playerHeadingDeg: 0,
    });
    const v = traffic.staged(s.id)!;
    const ahead = v.y - py;
    topActorMps = Math.max(topActorMps, v.speedMps ?? 0);
    r.topActorMps = topActorMps;
    if (r.indicatorAtSec === null && v.indicator !== undefined && v.indicator !== "off") {
      r.indicatorAtSec = tSec;
      r.indicatorSide = v.indicator;
    }
    if (r.cutAtSec === null && Math.abs(v.lateralOffsetM ?? 0) > 0.01) {
      r.cutAtSec = tSec;
      r.aheadAtCutM = ahead;
    }
    if (r.cutAtSec !== null) r.minAheadAfterCutM = Math.min(r.minAheadAfterCutM, ahead);
    if (outcome) {
      r.detail = outcome.detail ?? null;
      break;
    }
  }
  return r;
}

describe("cut-in visibility (B73)", () => {
  it("at the authored pace: signalled early, cut in front, authored cushion", () => {
    const r = drive(11); // ~40 km/h, the drive the spec numbers describe
    expect(r.cutAtSec, "the cut never fired").not.toBeNull();
    expect(r.indicatorAtSec, "the blinker never lit").not.toBeNull();
    expect(r.indicatorSide).toBe("right");
    // «своевременно» (ЗДвП чл. 25): announced before the wheel moves.
    expect(r.cutAtSec! - r.indicatorAtSec!).toBeGreaterThanOrEqual(2.5);
    // In front of the windscreen, not beside the door.
    expect(r.aheadAtCutM!).toBeGreaterThanOrEqual(6);
    // …and the merge still steals the cushion the drill is written around:
    // it lands at roughly the authored 12 m, not out at the approach distance.
    // (The APPROACH is deliberately wider now — see CUTIN_VISIBLE_CONE_DEG —
    // because a 12 m pace in a lane 8.125 m over sits 34° off the driver's
    // axis, behind the A-pillar, for the whole run-up. The graded half is
    // this number, and this number is unchanged.)
    expect(r.aheadAtCutM!).toBeLessThanOrEqual(16);
  });

  it("at 59 km/h — the drive that produced the empty-road frame — it still cuts IN FRONT", () => {
    const r = drive(16.4);
    expect(r.cutAtSec, "the cut never fired at 59 km/h").not.toBeNull();
    expect(r.aheadAtCutM!, "the merge happened behind the driver").toBeGreaterThanOrEqual(6);
    expect(r.indicatorAtSec, "the blinker never lit").not.toBeNull();
    expect(r.indicatorSide).toBe("right");
    expect(r.cutAtSec! - r.indicatorAtSec!).toBeGreaterThanOrEqual(2.5);
  });

  it("the pacing car keeps station instead of being left behind", () => {
    // Before the cap fix the gap collapsed 15 m → 1.6 m by t 11 at this speed.
    const r = drive(16.4);
    expect(r.aheadAtCutM!).toBeGreaterThan(6);
  });

  it("never glides across while behind the player, at any pace on the ladder", () => {
    for (const mps of [8, 11, 13, 16.4, 19]) {
      const r = drive(mps);
      if (r.cutAtSec === null) continue; // did not happen; the next test owns that
      expect(r.aheadAtCutM!, `${(mps * 3.6).toFixed(0)} km/h`).toBeGreaterThanOrEqual(6);
    }
  });

  /**
   * THE BLAST RADIUS. Everything above is measured on FC_CUTTER, a car merging
   * on a 50 boulevard. `CutInLeadCarSpec` is also the carrier for actors that
   * are nothing like it, and the first cut of these guards reached them: it
   * raised a child cyclist's speed cap to `player + 3 m/s` and moved three
   * graded demo verdicts in two other scenarios (sc-vu-child-cyclist,
   * sc-hz-brake-dont-swerve), plus a fourth in sc-fo-brakelight-chain.
   *
   * The scope is `pacesIntoView()`: it changes lane AND its author gave it
   * headroom over its own cruise. These pin the two shapes that must stay out.
   */
  it("a slow VRU whose author gave it NO headroom is never sped up to keep station", () => {
    // VUCC_CHILD's shape: a 2.8 m/s child on a bike, maxMatch === cruise
    // ("he does not speed up"), paceAheadM unreachable by design. It swerves,
    // so cutShiftM alone would have let the pacing lift take it.
    const r = drive(8.3, 30, {
      actor: { ...spec().actor, cruiseSpeedMps: 2.8 },
      maxMatchSpeedMps: 2.8,
      paceAheadM: 400,
      cutSpeedMps: 2.8,
      minCutSpeedKmh: 5,
    });
    // A player at 30 km/h must not conjure a 31 km/h child. Tolerance is the
    // traffic system's own accel ripple, not headroom.
    expect(r.topActorMps).toBeLessThanOrEqual(2.9);
  });

  it("an ABREAST actor still performs its event — the six-metre gate is not universal", () => {
    // The sc-hz-brake-dont-swerve escort: paceAheadM 1, beside your door BY
    // DESIGN, cutShiftM 0. `aheadM >= 6` would mean its cut could never fire.
    const r = drive(11, 30, {
      paceAheadM: 1,
      cutShiftM: 0,
      maxMatchSpeedMps: 16,
      actor: { ...spec().actor, cruiseSpeedMps: 13.89, extraRightOffsetM: -LANE_SHIFT },
    });
    expect(r.detail, "the abreast encounter resolved as never happening").not.toBe(
      "notEncountered",
    );
  });

  it("a player who outruns the encounter is told it did not happen, not awarded it", () => {
    // 32 m/s ≈ 115 km/h on a 50 boulevard: past the catch-up ceiling by design.
    // L8's rule — a lesson that did not happen must say so.
    const r = drive(32, 40);
    if (r.cutAtSec === null) {
      expect(r.detail).toBe("notEncountered");
    } else {
      expect(r.aheadAtCutM!).toBeGreaterThanOrEqual(6);
    }
  });
});
