/**
 * T17 (ledger §2) — the rubber band, and the seam that replaces it.
 *
 * `traffic/staged.ts` matchPlayer: `target = playerSpeedMps + 0.55 × (gapM −
 * gap)`. `gap = gapM` is a stable fixed point, so whatever the student does
 * the lead mirrors it and the METRIC distance returns to the authored
 * constant. `FOLLOWING_TOO_CLOSE` is a TIME gap, so with the metres frozen the
 * fault becomes a pure function of the speedometer — and the taught corrective
 * action, "ease off and let the gap grow", is physically impossible: the lead
 * slows to close it again. The founder diagnosed this exactly ("the truck is
 * following the player rather than the player following the truck"), and it
 * generalises to 16 lead actors across 16 scenarios.
 *
 * `paceMode: "scheduledCruise"` is the engine half of the fix: a fixed speed
 * along the actor's OWN arc, with `playerGuard` as the only coupling. These
 * are the two behaviours measured side by side on the same rig, same drive.
 *
 * The DATA half — flipping the four gap drills onto it — is lane 11's
 * (templates-following.ts &co). This file proves the seam works.
 */

import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict, TrafficSystem } from "../../traffic/types";
import { BrakingLeadCarRunner } from "../runners";
import type { DirectorInput } from "../types";

const DT = 1 / 30;
const LANE_X = 12.1875; // the fixture's northbound driving-lane centre

/** One straight 1200 m two-way street — the fo-follow-v1 shape in miniature. */
function district(): TrafficDistrict {
  return {
    roads: {
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 0, y: 1200 },
      ],
      edges: [
        {
          id: "e1",
          from: "n1",
          to: "n2",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 4,
          maxspeed: 50,
          length: 1200,
          geometry: [
            [0, 0],
            [0, 1200],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };
}

const FOLLOW_GAP_M = 20;
/** The lead's own pace, m/s — deliberately BELOW the player's phase-1 speed
 *  so the drive genuinely closes on it from behind. */
const CRUISE_MPS = 9;
/** Where the lead sits dormant, m along the path. */
const HOLD_M = 80;
/** Player's start, m along the path — 80 m back, so the encounter has to be
 *  earned by closing rather than starting inside it. */
const PLAYER_START_M = 0;
const FAST_MPS = 12;
const SLOW_MPS = 5;

function spec(paceMode?: "matchPlayer" | "scheduledCruise"): BrakingLeadCarSpec {
  return {
    id: "lead",
    kind: "brakingLeadCar",
    actor: {
      pathNodes: ["n1", "n2"],
      hold: { nodeIndex: 0, offsetM: HOLD_M },
      cruiseSpeedMps: CRUISE_MPS,
      // A brisk ramp so the spin-up transient does not dominate a 30 s probe;
      // the steady state is what both modes are being compared on.
      accelMps2: 8,
    },
    followGapM: FOLLOW_GAP_M,
    maxMatchSpeedMps: 30,
    // Parked far past the end of the road: this rig measures PACING only, so
    // the slam must never fire (the sc-follow-rain-gap out-of-reach idiom).
    slamAt: { x: 0, y: 5000 },
    slamRadiusM: 2,
    slamDecelMps2: 7.5,
    minSlamSpeedKmh: 500,
    proximityFallbackM: 0,
    triggersHazard: false,
    resumeAfterSec: 3,
    ...(paceMode !== undefined ? { paceMode } : {}),
    ...(paceMode === "scheduledCruise" ? { paceSpeedMps: CRUISE_MPS } : {}),
  };
}

interface Sample {
  gapAfterCruiseM: number;
  gapAfterEaseM: number;
}

/**
 * Close on the lead at `fastMps` for 30 s (both modes settle), then EASE OFF
 * to `slowMps` for 15 s — the taught corrective action — and report the
 * centre-to-centre gap at each checkpoint.
 */
function driveEaseOff(
  s: BrakingLeadCarSpec,
  fastMps: number,
  slowMps: number,
  cruiseSec = 30,
): Sample {
  const tr: TrafficSystem = createTrafficSystem(district(), {
    seed: 3,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new BrakingLeadCarRunner(s);
  runner.stage(tr, () => 0.5, true);
  let py = PLAYER_START_M;
  let t = 0;
  const out: SimTickEvent[] = [];
  let gapAfterCruiseM = NaN;

  const step = (mps: number) => {
    t += DT;
    py += mps * DT;
    const kmh = mps * 3.6;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    const inp: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: LANE_X,
      y: py,
      speedKmh: kmh,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    };
    runner.step(tr, inp, out);
  };

  for (let i = 0; i < cruiseSec * 30; i++) step(fastMps);
  gapAfterCruiseM = tr.staged("lead")!.y - py;
  for (let i = 0; i < 15 * 30; i++) step(slowMps);
  return { gapAfterCruiseM, gapAfterEaseM: tr.staged("lead")!.y - py };
}

describe("T17 · matchPlayer is a rubber band — easing off does NOT open the gap", () => {
  it("the metres return to the authored constant no matter what the student does", () => {
    // 60 s of cruise, not 30 — B79 (uncommitted in `runners.ts` when this was
    // measured, 2026-08-04) made the COMMANDED station start at the gap the
    // actor actually has and walk in at LEAD_STATION_CLOSE_MPS = 1.5 m/s. This
    // rig seeds the player 80 m back on purpose ("earned by closing"), so the
    // band now needs (80 − 20)/1.5 = 40 s to reach its fixed point and a 30 s
    // phase measured it mid-convergence at ~35 m. The SUBJECT of the test is
    // the fixed point, not the approach — so the phase is long enough to reach
    // it. Nothing about the rubber band's law changed.
    const r = driveEaseOff(spec(), FAST_MPS, SLOW_MPS, 60);
    // Settled on the authored gap while cruising…
    expect(r.gapAfterCruiseM).toBeCloseTo(FOLLOW_GAP_M, 0);
    // …and 15 seconds of backing off by 7 m/s bought essentially nothing:
    // 105 m of relative travel produced under 2 m of extra space.
    expect(r.gapAfterEaseM - r.gapAfterCruiseM).toBeLessThan(2);
    expect(r.gapAfterEaseM).toBeCloseTo(FOLLOW_GAP_M, 0);
  });
});

describe("T17 · scheduledCruise — the taught corrective action finally works", () => {
  it("easing 12 → 5 m/s for 15 s opens the gap by ~60 m", () => {
    const r = driveEaseOff(spec("scheduledCruise"), FAST_MPS, SLOW_MPS);
    const opened = r.gapAfterEaseM - r.gapAfterCruiseM;
    // The lead holds CRUISE_MPS 9 while the player drops to 5: 4 m/s of
    // separation for 15 s = 60 m of real, earned space.
    expect(opened).toBeGreaterThan(52);
    expect(opened).toBeLessThan(66);
  });

  it("the lead is INDEPENDENT: its speed does not track the player's", () => {
    const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const s = spec("scheduledCruise");
    const runner = new BrakingLeadCarRunner(s);
    runner.stage(tr, () => 0.5, true);
    // The overtaking lane, so the playerGuard corridor never engages and the
    // measurement is of the PACING law alone.
    const px = LANE_X - 8.125;
    let py = HOLD_M - FOLLOW_GAP_M;
    let t = 0;
    const out: SimTickEvent[] = [];
    for (let i = 0; i < 25 * 30; i++) {
      // The player accelerates hard, then crawls — the lead must not care.
      const mps = i < 12 * 30 ? 18 : 3;
      t += DT;
      py += mps * DT;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: px, y: py },
        playerSpeedKmh: mps * 3.6,
        playerHeadingDeg: 0,
      });
      runner.step(
        tr,
        { tSec: t, dtSec: DT, x: px, y: py, speedKmh: mps * 3.6, headingDeg: 0, brakePedal: 0, tickEvents: [] },
        out,
      );
    }
    expect(tr.staged("lead")!.speedMps).toBeCloseTo(CRUISE_MPS, 3);
  });

  it("L11: a scheduled lead can be genuinely OVERTAKEN in world space", () => {
    // The rig the founder's «Страничен вятър след камиона» needs: a slow
    // vehicle you actually pass. Under matchPlayer the truck paced him
    // forever and both success gates ticked for an overtake that never
    // happened; here the player really ends up in front.
    const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const s: BrakingLeadCarSpec = { ...spec("scheduledCruise"), paceSpeedMps: 8 };
    const runner = new BrakingLeadCarRunner(s);
    runner.stage(tr, () => 0.5, true);
    // Overtaking lane, so the playerGuard corridor is not in the way.
    const px = LANE_X - 8.125;
    let py = 80 - FOLLOW_GAP_M;
    let t = 0;
    const out: SimTickEvent[] = [];
    for (let i = 0; i < 40 * 30; i++) {
      t += DT;
      py += 20 * DT;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: px, y: py },
        playerSpeedKmh: 72,
        playerHeadingDeg: 0,
      });
      runner.step(
        tr,
        { tSec: t, dtSec: DT, x: px, y: py, speedKmh: 72, headingDeg: 0, brakePedal: 0, tickEvents: [] },
        out,
      );
      if (py - tr.staged("lead")!.y > 60) break;
    }
    expect(py - tr.staged("lead")!.y).toBeGreaterThan(60);
  });

  it("REACHABILITY: a scheduled lead WAITS for a slow student instead of driving off", () => {
    // The half-speed leg of the encounter battery, in unit form: without the
    // hold-until-near release a fixed-speed lead simply outruns anyone slower
    // than it and the following drill never happens.
    const tr = createTrafficSystem(district(), { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const s: BrakingLeadCarSpec = { ...spec("scheduledCruise"), paceSpeedMps: CRUISE_MPS };
    const runner = new BrakingLeadCarRunner(s);
    runner.stage(tr, () => 0.5, true);
    // Start 120 m back — well outside the release band — and crawl.
    let py = 80 - 120;
    let t = 0;
    const out: SimTickEvent[] = [];
    let minGap = Infinity;
    for (let i = 0; i < 90 * 30; i++) {
      t += DT;
      py += 4 * DT; // 14.4 km/h, a third of the lead's own pace
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: LANE_X, y: py },
        playerSpeedKmh: 14.4,
        playerHeadingDeg: 0,
      });
      runner.step(
        tr,
        { tSec: t, dtSec: DT, x: LANE_X, y: py, speedKmh: 14.4, headingDeg: 0, brakePedal: 0, tickEvents: [] },
        out,
      );
      minGap = Math.min(minGap, tr.staged("lead")!.y - py);
    }
    // He met it: the lead sat at its hold until he closed to the release band.
    expect(minGap).toBeLessThanOrEqual(FOLLOW_GAP_M + 12);
  });
});

/* =========================================================================== *
 * B72 / FR-53 — `paceProfile`: the lead that DOES something
 *
 * T17 (above) killed the rubber band and, in the founder's own words, produced
 * his other complaint in a purer form: one `paceSpeedMps` is a metronome, and a
 * metronome is a gap you set once and then stop thinking about. He asked for a
 * lead that «slows a bit, speeds a bit».
 *
 * The field shipped with the seam proven and its OWN behaviour unmeasured —
 * these are the measurements. They are written against the LEAD's speed and the
 * gap a CONSTANT-SPEED student sees, because that is the whole claim: the
 * reason the distance changes is the truck's business, never the speedometer.
 * ========================================================================== */

/** Sampled at 2 Hz through a constant-speed drive. */
interface PaceSample {
  tSec: number;
  arcS: number;
  leadMps: number;
  gapM: number;
}

/**
 * Drive at ONE speed for `seconds` and report what the lead did. The player
 * starts inside the scheduled-cruise release band (followGap + 12) so the
 * handover is on the first tick and every later metre is the profile's doing.
 */
function driveConstant(s: BrakingLeadCarSpec, playerMps: number, seconds: number): PaceSample[] {
  const tr: TrafficSystem = createTrafficSystem(district(), {
    seed: 3,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new BrakingLeadCarRunner(s);
  runner.stage(tr, () => 0.5, true);
  let py = HOLD_M - 30; // 30 m back — inside the 20 + 12 release band
  let t = 0;
  const out: SimTickEvent[] = [];
  const samples: PaceSample[] = [];
  for (let i = 0; i < seconds * 30; i++) {
    t += DT;
    py += playerMps * DT;
    const kmh = playerMps * 3.6;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    runner.step(
      tr,
      { tSec: t, dtSec: DT, x: LANE_X, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] },
      out,
    );
    if (i % 15 === 0) {
      const lead = tr.staged("lead")!;
      samples.push({ tSec: t, arcS: lead.s, leadMps: lead.speedMps, gapM: lead.y - py });
    }
  }
  return samples;
}

/** An ease at arc 120 and a resume at arc 150 — the fo-* shape, in miniature. */
function profiled(): BrakingLeadCarSpec {
  return {
    ...spec("scheduledCruise"),
    paceProfile: [
      { atS: 120, speedMps: 7 },
      { atS: 150, speedMps: 11 },
    ],
  };
}

describe("B72 · paceProfile — the lead varies its speed, and the student's gap moves with it", () => {
  it("the lead really slows and really picks back up, at the AUTHORED arcs", () => {
    const r = driveConstant(profiled(), CRUISE_MPS, 30);
    // tSec ≥ 4 skips the release ramp: the actor spins up from rest at
    // accelMps2 8 and is still at 5.2 m/s at t = 2. Measured: it reaches the
    // base 9.00 at t = 3.5 and holds it to arc 120.
    const before = r.filter((s) => s.arcS < 118 && s.tSec >= 4);
    const eased = r.filter((s) => s.arcS >= 128 && s.arcS < 148);
    const resumed = r.filter((s) => s.arcS >= 162);
    expect(before.length).toBeGreaterThan(2);
    expect(eased.length).toBeGreaterThan(2);
    expect(resumed.length).toBeGreaterThan(2);
    // Base leg — the authored `paceSpeedMps`, untouched before the first `atS`.
    for (const s of before) expect(s.leadMps).toBeCloseTo(CRUISE_MPS, 1);
    // …the ease…
    for (const s of eased) expect(s.leadMps).toBeCloseTo(7, 1);
    // …and the resume, which is FASTER than the base: the gap the student
    // re-opened is handed back rather than banked.
    for (const s of resumed) expect(s.leadMps).toBeCloseTo(11, 1);
  });

  it("a student holding ONE speed sees the gap close and then open again", () => {
    const r = driveConstant(profiled(), CRUISE_MPS, 30);
    const settled = r.filter((s) => s.tSec > 2);
    // Where the gap bottoms out, and what it does afterwards.
    let minIdx = 0;
    for (let i = 1; i < settled.length; i++) if (settled[i].gapM < settled[minIdx].gapM) minIdx = i;
    const start = settled[0].gapM;
    const trough = settled[minIdx].gapM;
    const after = Math.max(...settled.slice(minIdx).map((s) => s.gapM));
    expect(start - trough).toBeGreaterThan(3); // it really closed on him…
    expect(after - trough).toBeGreaterThan(3); // …and really opened again
    // He never touched the pedals: every metre of that is the lead's doing.
    expect(minIdx).toBeGreaterThan(0);
    expect(minIdx).toBeLessThan(settled.length - 1);
  });

  it("WITHOUT a profile the same drive is the metronome the founder measured", () => {
    // The control. sd 0.2 km/h over 341 samples was his «very boring»; with a
    // constant-speed student the gap is a flat line, i.e. nothing to read.
    const r = driveConstant(spec("scheduledCruise"), CRUISE_MPS, 30).filter((s) => s.tSec >= 4);
    for (const s of r) expect(s.leadMps).toBeCloseTo(CRUISE_MPS, 2);
    const gaps = r.map((s) => s.gapM);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.5);
  });

  it("OPT-IN: a profile authored under matchPlayer changes NOTHING (FR-56 precedent)", () => {
    // `brakingLeadCar` is the most borrowed staged kind in the catalogue and
    // most of its users are not following drills. A field that leaked into the
    // band would re-time all of them — which is the exact mistake FR-56
    // documented. The runner's guard is `paceMode !== "scheduledCruise"`.
    const banded: BrakingLeadCarSpec = {
      ...spec(),
      paceProfile: [
        { atS: 120, speedMps: 7 },
        { atS: 150, speedMps: 11 },
      ],
    };
    const withProfile = driveConstant(banded, CRUISE_MPS, 30);
    const without = driveConstant(spec(), CRUISE_MPS, 30);
    expect(withProfile.length).toBe(without.length);
    for (let i = 0; i < withProfile.length; i++) {
      expect(withProfile[i].gapM).toBeCloseTo(without[i].gapM, 9);
      expect(withProfile[i].leadMps).toBeCloseTo(without[i].leadMps, 9);
    }
  });

  it("the legs are read in order — an out-of-order profile would silently mis-select", () => {
    // `paceLegAt` stops scanning at the first unreached leg (the profile is
    // documented ASCENDING), so this is a real trap for an author. Pinning the
    // symptom here is what makes the data-truth guard below meaningful rather
    // than decorative.
    const scrambled: BrakingLeadCarSpec = {
      ...spec("scheduledCruise"),
      paceProfile: [
        { atS: 150, speedMps: 11 },
        { atS: 120, speedMps: 7 },
      ],
    };
    const r = driveConstant(scrambled, CRUISE_MPS, 30).filter((s) => s.arcS >= 128 && s.arcS < 148);
    expect(r.length).toBeGreaterThan(2);
    // It latches the FIRST leg (arc 150) at arc 120 and never eases: the drill
    // an author thought they wrote does not happen.
    for (const s of r) expect(s.leadMps).not.toBeCloseTo(7, 1);
  });
});
