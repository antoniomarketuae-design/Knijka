/**
 * FOUNDER RULING 2026-10-05, «BILL FORCED BRAKING» — the roundabout-entry
 * tracker (runtime/worldRuntime.ts §4c), one behaviour per test:
 *
 *   „Bill it only when a circulating car actually has to brake or swerve
 *    because of the entry, or there is contact. This mirrors your lane-drop
 *    ruling and how examiners judge taking priority. Patient or careful entries
 *    are never billed. … Approach readiness stays the lesson task, not a
 *    penalty."
 *
 * So FAILED_TO_YIELD at a roundabout is judged BY WHAT HAPPENED, and yielding
 * there is about ONE place — the mouth he enters by — and the cars that had not
 * yet passed it when he entered (round 4):
 *
 *   · THE ENTRY is the frame his nose comes onto the ring carriageway, having
 *     been off it the frame before. The MOUTH is where the nose crossed the
 *     ring's edge.
 *   · THE PRIORITY SET of that entry is every vehicle circulating that has not
 *     passed the mouth (its rear end is not yet beyond it), wherever on the
 *     ring it is — on the frame he enters and, round 5, on every later frame
 *     he still OCCUPIES that mouth (until his own car has passed it, or his
 *     nose is back off the ring): a car that comes short of the mouth while he
 *     sits in it joins the set on that frame, its account from that frame.
 *   · THE CONVICTION: a car of the set loses ROUNDABOUT_FORCED_SHED_MPS because
 *     of him (the vehicle's own account, handed across by the circulating
 *     query), summed from the frame it joined the set, before it has CLEARED the mouth — or
 *     his body touches it before it has. Moving or standing is not asked.
 *   · THE COMMENDATION additionally needs that no car of the set lost ANY speed
 *     to him before clearing the mouth, and that he touched none.
 *
 * Nothing else convicts: not a car being THERE (presence, reach, side), not
 * how fast he came up the arm, not whether he stopped first, not how many
 * degrees of ring he has swept.
 *
 * The world is rb-mini-v1 (ring R = 18 about the origin, one 8.125 m lane, so
 * the ring carriageway ends at 22.0625 m; south-arm lane centre x = 4.06). The
 * cars are hand-built (`circulatingStub.ts`): a runtime unit test has no
 * traffic system, so each test SAYS what the car on the ring had to do. That
 * the real traffic models account it truthfully is traffic/player-shed.test.ts;
 * that the whole chain agrees with an outside observer is
 * lessons/scenario/__tests__/roundabout-entry-forced-braking.property.test.ts.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District } from "..";
import { PLAYER_HALF_LENGTH_M } from "../../collision/bodies";
import type { VehicleSample } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";
import { STAGED_BRAKE_LAMP_MARGIN_MPS } from "../../traffic/staged";
import {
  RB_ON_RING_DEG,
  rbPassedMouth,
  ROUNDABOUT_ANY_SHED_MPS,
  ROUNDABOUT_FORCED_SHED_MPS,
  type CirculatingQueryReport,
} from "../worldRuntime";
import { BUSY_RING, NO_RING, ringReport, type StubCar } from "./circulatingStub";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function loadRuntimeDistrict(id: string): District {
  return parseDistrict(
    JSON.parse(readFileSync(path.resolve(HERE, "../../../../../../content/world", `${id}.json`), "utf-8")),
  );
}

const DT = 1 / 60;
/**
 * One frame's worth of braking in these scripts, m/s — 1/32, so every running
 * total below is exact in binary and a threshold test cannot hide in rounding:
 * 9 frames = 0.28125 (under the 0.3 line), 10 frames = 0.3125 (over it).
 */
const TICK = 1 / 32;
const X_LANE = 4.06;
const RING_R = 18;
/** Ring radius + half the drawn ring lane (LANE_WIDTH_M 8.125 / 2). */
const RING_EDGE_M = 22.0625;
const CENTRE = { x: 0, y: 0 };
/** Compass azimuth of the point where a nose coming straight up x = 4.06 crosses the ring's edge (≈ 169.4°) — MOUTH_AZ below. */
const STD_MOUTH_AZ = (Math.atan2(X_LANE, -Math.sqrt(RING_EDGE_M ** 2 - X_LANE ** 2)) * 180) / Math.PI;

function sample(x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

interface Frame {
  t: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  /** His nose is on the ring carriageway (measured here, from the pose). */
  noseOnRing: boolean;
  /** Azimuth swept about the centre since his nose first came onto the ring, deg. */
  sweptDeg: number;
  /**
   * How far HIS centre is beyond the standard mouth (MOUTH_AZ — every script
   * here that comes up the south arm enters by it), m along his own circle,
   * counter-clockwise; negative while he is still short of it. His rear end is
   * past the mouth — he has LEFT it — above PLAYER_HALF_LENGTH_M. Measured
   * here, from the pose.
   */
  pastMouthM: number;
  /** `SimTick.roundaboutEntryOpen` as the runtime published it for this frame (set once the frame is sampled). */
  entryOpen: boolean;
  /** `SimTick.roundaboutEntryPaidFor` as the runtime published it for this frame, likewise. */
  entryPaid: boolean;
}

interface Result {
  /** The frame the conviction landed on, or null. */
  billed: Frame | null;
  /** Number of `violated` roundabout events over the whole drive. */
  bills: number;
  commended: boolean;
  frames: Frame[];
}

/**
 * A scripted drive. `pose(i)` gives frame i's pose and speed (or null to end);
 * `ring(frame)` answers the circulating query for that frame.
 */
function drive(
  pose: (i: number) => { x: number; y: number; headingDeg: number; speedKmh: number } | null,
  ring: (f: Frame) => CirculatingQueryReport,
  rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1")),
): Result {
  rt.setRightConflictQuery(() => false);
  let current: Frame | null = null;
  rt.setCirculatingQuery(() => ring(current!));
  const res: Result = { billed: null, bills: 0, commended: false, frames: [] };
  let t = 0;
  let azPrev: number | null = null;
  let swept = 0;
  let outsideSeen = false;
  for (let i = 0; ; i++) {
    const p = pose(i);
    if (p === null) break;
    t += DT;
    const rad = (p.headingDeg * Math.PI) / 180;
    const nose = Math.hypot(p.x + Math.sin(rad) * PLAYER_HALF_LENGTH_M, p.y + Math.cos(rad) * PLAYER_HALF_LENGTH_M);
    const noseOnRing = nose <= RING_EDGE_M || Math.hypot(p.x, p.y) <= RING_EDGE_M;
    if (!noseOnRing) outsideSeen = true;
    const az = (Math.atan2(p.x, p.y) * 180) / Math.PI;
    if (noseOnRing && outsideSeen) {
      if (azPrev !== null) swept += Math.abs(((az - azPrev + 540) % 360) - 180);
      azPrev = az;
    } else azPrev = null;
    const pastMouthM = ((((STD_MOUTH_AZ - az + 540) % 360) - 180) * Math.PI * Math.hypot(p.x, p.y)) / 180;
    current = { t, ...p, noseOnRing, sweptDeg: swept, pastMouthM, entryOpen: false, entryPaid: false };
    res.frames.push(current);
    rt.update(DT);
    const tick = rt.sample(sample(p.x, p.y, p.headingDeg, p.speedKmh), t, false);
    current.entryOpen = tick.roundaboutEntryOpen === true;
    // Additive: the field is `true` or it is not there at all.
    if (!current.entryOpen && "roundaboutEntryOpen" in tick) throw new Error("roundaboutEntryOpen published as something other than true");
    current.entryPaid = tick.roundaboutEntryPaidFor === true;
    if (!current.entryPaid && "roundaboutEntryPaidFor" in tick) throw new Error("roundaboutEntryPaidFor published as something other than true");
    for (const e of tick.events as SimTickEvent[]) {
      if (e.kind !== "prioritySituation" || e.situation !== "roundabout") continue;
      if (e.violated) {
        res.bills++;
        res.billed ??= current;
      } else if (e.yielded) res.commended = true;
    }
  }
  return res;
}

/**
 * The standard entry: up the south arm at `kmh`, over the ring's edge and on
 * round the ring (centreline, counter-clockwise) for `ringDeg` of it, then out
 * along the tangent until he has left the roundabout's vicinity (so the
 * commendation, awarded on leaving, has its chance).
 */
function entry(opts: {
  kmh: number;
  fromY?: number;
  ringDeg?: number;
  leave?: boolean;
  /** Stand still for `sec` at the first frame each one matches, in order. */
  holds?: { when: (x: number, y: number, onRingDeg: number) => boolean; sec: number }[];
  /** Speed used BEFORE the give-way line region, to model «came up fast, then crawled». */
  approachKmh?: number;
}): (i: number) => { x: number; y: number; headingDeg: number; speedKmh: number } | null {
  const ringDeg = opts.ringDeg ?? 60;
  const mouthY = -Math.sqrt(RING_R * RING_R - X_LANE * X_LANE); // where the lane meets the centreline
  const a0 = (Math.atan2(X_LANE, mouthY) * 180) / Math.PI; // compass azimuth there (≈ 167°)
  let x = X_LANE;
  let y = opts.fromY ?? -60;
  let ringGone = 0; // degrees travelled on the ring
  let outM = 0;
  let phase: "arm" | "ring" | "out" = "arm";
  let heldFor = 0;
  let holdIdx = 0;
  const holds = opts.holds ?? [];
  return () => {
    if (holdIdx < holds.length && holds[holdIdx].when(x, y, ringGone)) {
      heldFor += DT;
      if (heldFor >= holds[holdIdx].sec) {
        holdIdx++;
        heldFor = 0;
      }
      const h0 = phase === "arm" ? 0 : (((a0 - ringGone - 90) % 360) + 360) % 360;
      return { x, y, headingDeg: h0, speedKmh: 0 };
    }
    const kmh = phase === "arm" && y < -40 && opts.approachKmh !== undefined ? opts.approachKmh : opts.kmh;
    const step = (kmh / 3.6) * DT;
    if (phase === "arm") {
      y += step;
      if (y >= mouthY) {
        y = mouthY;
        phase = "ring";
      }
      return { x, y, headingDeg: 0, speedKmh: kmh };
    }
    if (phase === "ring") {
      ringGone += ((step / RING_R) * 180) / Math.PI;
      const a = ((a0 - ringGone) * Math.PI) / 180;
      x = RING_R * Math.sin(a);
      y = RING_R * Math.cos(a);
      if (ringGone >= ringDeg) phase = "out";
      return { x, y, headingDeg: (((a0 - ringGone - 90) % 360) + 360) % 360, speedKmh: kmh };
    }
    if (opts.leave === false) return null;
    // Out along the tangent, far enough to leave the watch zone.
    const a = ((a0 - ringGone) * Math.PI) / 180;
    outM += step * 4; // leave briskly — nothing is graded out here
    if (outM > 80) return null;
    return {
      x: RING_R * Math.sin(a) - Math.cos(a) * outM,
      y: RING_R * Math.cos(a) + Math.sin(a) * outM,
      headingDeg: (((a0 - ringGone - 90) % 360) + 360) % 360,
      speedKmh: kmh * 4,
    };
  };
}

/** A car on the ring centreline, well behind him (west), going round. */
function carBehind(shedMps = 0): StubCar {
  return { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps };
}

/** Half the length of a stub car (`circulatingStub.ts`), m. */
const CAR_HALF_M = 2.05;
/**
 * THE MOUTH of the standard entry, as a compass azimuth about the ring centre:
 * where his nose, coming straight up x = 4.06, crosses the ring's edge
 * (≈ 169.4°). Cars go round counter-clockwise, so a car's azimuth FALLS as it
 * drives: above this it is still coming to the mouth, below it it has gone by.
 */
const MOUTH_AZ = STD_MOUTH_AZ;
const degOf = (m: number, radiusM = RING_R): number => ((m / radiusM) * 180) / Math.PI;
/**
 * A car whose CENTRE has `runM` metres of its own circle still to run to the
 * mouth (negative: its centre is already that far past it).
 */
function carWithRun(runM: number, over: Partial<StubCar> = {}): StubCar {
  const radiusM = over.radiusM ?? RING_R;
  return { id: 1000, azDeg: MOUTH_AZ + degOf(runM, radiusM), radiusM, speedMps: 2.9, shedMps: 0, ...over };
}
/** Has this car's REAR END gone past the mouth — measured here, from where the test put it. */
const rearPast = (car: StubCar): boolean => (((MOUTH_AZ - car.azDeg) * Math.PI) / 180) * car.radiusM > CAR_HALF_M;

/**
 * Straight up and down the arm: each leg drives to `toY` at `kmh` and then
 * stands there for `holdFrames`. His nose is on the ring from y = −23.71 up.
 */
function upAndDown(
  legs: Array<[toY: number, kmh: number, holdFrames: number]>,
  fromY = -30,
): (i: number) => { x: number; y: number; headingDeg: number; speedKmh: number } | null {
  let y = fromY;
  let leg = 0;
  let held = 0;
  return () => {
    if (leg >= legs.length) return null;
    const [toY, kmh, hold] = legs[leg];
    const step = (kmh / 3.6) * DT;
    if (Math.abs(toY - y) <= step) {
      y = toY;
      if (held++ >= hold) {
        leg++;
        held = 0;
      }
      return { x: X_LANE, y, headingDeg: 0, speedKmh: 0 };
    }
    const dir = toY > y ? 1 : -1;
    y += dir * step;
    return { x: X_LANE, y, headingDeg: 0, speedKmh: dir * kmh };
  };
}
/** Centre positions on the arm with the nose well ON the ring carriageway, and well OFF it. */
const NOSE_IN_Y = -23.0;
const NOSE_OUT_Y = -26.0;

describe("the zones and the numbers the ruling is measured in", () => {
  it("ENTERED is the nose on the ring carriageway: ring radius + the ring's drawn half width, inside the commit reach", () => {
    const z = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1")).debugRoundaboutZones()[0]!;
    expect(z.enterReachM).toBeCloseTo(RING_EDGE_M, 6);
    expect(z.commitReachM).toBeCloseTo(30, 6);
    expect(z.enterReachM).toBeLessThan(z.commitReachM);
    expect(z.watchReachM).toBeGreaterThan(z.commitReachM);
  });

  it("«forced to brake» is the traffic model's own brake-lamp line; «any speed at all» is floating-point dust above the measured floor of nil", () => {
    // The runtime may not import the traffic module, so the two constants are
    // declared apart and pinned to each other here.
    expect(ROUNDABOUT_FORCED_SHED_MPS).toBe(STAGED_BRAKE_LAMP_MARGIN_MPS);
    expect(ROUNDABOUT_FORCED_SHED_MPS).toBe(0.3);
    expect(ROUNDABOUT_ANY_SHED_MPS).toBe(1e-6);
    // 35° of ring is where he counts as circulating — read by the commendation
    // only; the conviction has no window (see «NO WINDOW» below).
    expect(RB_ON_RING_DEG).toBe(35);
  });

  describe("rbPassedMouth — the one definition of «passed the mouth» (the priority set and «cleared» both read it)", () => {
    /** A car `pastM` metres of its own circle beyond a mouth due south, going round in `sense` (+1 counter-clockwise). */
    const passed = (pastM: number, radiusM = 18, sense: 1 | -1 = 1): boolean => {
      const phi = (sense * pastM) / radiusM;
      return rbPassedMouth(
        0,
        -22.0625,
        radiusM * Math.sin(phi),
        -radiusM * Math.cos(phi),
        sense * Math.cos(phi),
        sense * Math.sin(phi),
        CAR_HALF_M,
      );
    };

    it("a car has passed when its REAR END is beyond the mouth: centre past by more than half its length — both sides of that line", () => {
      expect(passed(CAR_HALF_M - 0.01)).toBe(false); // its tail is still across the mouth
      expect(passed(CAR_HALF_M + 0.01)).toBe(true);
      expect(passed(0)).toBe(false); // level with it
      expect(passed(-5)).toBe(false); // still coming
      expect(passed(-40)).toBe(false);
      expect(passed(6)).toBe(true); // the car he let go by
    });

    it("the length is measured along the car's OWN circle, whichever lane of the ring it rides", () => {
      for (const r of [14, 18, 21]) {
        expect(passed(CAR_HALF_M - 0.01, r), `r=${r}`).toBe(false);
        expect(passed(CAR_HALF_M + 0.01, r), `r=${r}`).toBe(true);
      }
    });

    it("«past» is less than half a lap past: a car further round than that is on its way back and has passed nothing", () => {
      const halfLap = Math.PI * 18;
      expect(passed(halfLap - 0.1)).toBe(true);
      expect(passed(halfLap + 0.1)).toBe(false);
      expect(passed(-(halfLap - 0.1))).toBe(false);
    });

    it("it reads the sense of circulation off the car's own heading: a ring driven the other way round is the mirror image", () => {
      expect(passed(CAR_HALF_M - 0.01, 18, -1)).toBe(false);
      expect(passed(CAR_HALF_M + 0.01, 18, -1)).toBe(true);
      expect(passed(-5, 18, -1)).toBe(false);
      expect(passed(6, 18, -1)).toBe(true);
    });
  });
});

describe("THE CONVICTION — a car that had not passed his mouth had to brake because of his entry", () => {
  it("a car that sheds speed for him from the frame he enters: billed on the frame its loss reaches 0.3 m/s, with his nose on the ring", () => {
    const car = carBehind();
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing) car.shedMps += TICK; // ~1.9 m/s per second of braking for him
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(1);
    expect(r.billed).not.toBeNull();
    expect(r.billed!.noseOnRing).toBe(true);
    // One TICK a frame from the frame his nose is on the ring (the tracker
    // charges the loss since the PREVIOUS frame, so that first frame's TICK
    // counts): nine of them are 0.28125, the tenth makes 0.3125 — billed there.
    const first = r.frames.findIndex((f) => f.noseOnRing);
    const at = r.frames.indexOf(r.billed!);
    expect(at - first).toBe(9);
  });

  it("the same entry with a smaller loss — 0.28 m/s in all — is not billed: a trim is not forced braking", () => {
    const car = carBehind();
    let given = 0;
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing && given < 9) {
        car.shedMps += TICK;
        given++;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(car.shedMps).toBe(0.28125);
    expect(r.bills).toBe(0);
  });

  it("the size of the loss is what is read, not how long it took: one frame of 0.3 m/s bills on that frame", () => {
    const car = carBehind();
    let done = false;
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing && f.sweptDeg > 10 && !done) {
        car.shedMps += 0.3;
        done = true;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(1);
    expect(r.billed!.sweptDeg).toBeGreaterThan(10);
    expect(r.billed!.sweptDeg).toBeLessThan(11);
  });

  it("it is billed ONCE per visit, however long the car goes on braking", () => {
    const car = carBehind();
    const r = drive(entry({ kmh: 8, ringDeg: 30 }), (f) => {
      if (f.noseOnRing) car.shedMps += TICK;
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(1);
  });

  it("MOVING OR STANDING MAKES NO DIFFERENCE (R3-V1): he enters ahead of the car and STOPS in its lane, and it brakes only while he stands there — billed, on a frame he is at rest", () => {
    // Round 3 charged a car's braking only on frames he was above 1 км/ч, so
    // this drive — enter, stop in the lane, let the car brake to a crawl behind
    // you — ended «0 т., passed».
    const car = carBehind();
    const r = drive(
      entry({ kmh: 10, ringDeg: 60, holds: [{ when: (_x, _y, on) => on >= 12, sec: 30 }] }),
      (f) => {
        if (f.noseOnRing && f.speedKmh === 0) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(r.bills).toBe(1);
    expect(r.billed!.speedKmh).toBe(0);
    // Ten frames into the stop.
    const firstAtRest = r.frames.findIndex((f) => f.noseOnRing && f.speedKmh === 0);
    expect(r.frames.indexOf(r.billed!) - firstAtRest).toBe(9);
  });

  it("…and so does his speed while he rolls: a 0.9 км/ч creep, a 2.5 км/ч creep and a 12 км/ч entry in front of a car that has to brake are the same fault", () => {
    const at = (kmh: number): Result => {
      const car = carBehind();
      return drive(entry({ kmh, fromY: -27, ringDeg: 6, leave: false }), (f) => {
        if (f.noseOnRing) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
    };
    for (const kmh of [0.9, 2.5, 12]) expect(at(kmh).bills, `${kmh} км/ч`).toBe(1);
  });

  it("NO WINDOW: a car of the set that has still not cleared his mouth and has to brake for him after he has swept 35° of ring — or 100° — is billed all the same", () => {
    // Round 3 closed the entry at RB_ON_RING_DEG of ring swept; a quicker entry
    // escaped with the car braking hard just after it.
    for (const fromDeg of [RB_ON_RING_DEG + 5, 100]) {
      const car = carBehind();
      const r = drive(entry({ kmh: 12, ringDeg: 120 }), (f) => {
        if (f.noseOnRing && f.sweptDeg >= fromDeg) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
      expect(r.bills, `braking from ${fromDeg}° on`).toBe(1);
      expect(r.billed!.sweptDeg).toBeGreaterThan(fromDeg);
    }
  });
});

describe("NO PREDICTION — a car that is merely THERE convicts nobody", () => {
  it("a 30 км/ч barge with a moving car approaching on his left the whole time, which never has to brake: not billed", () => {
    const car: StubCar = { ...carBehind(), approaching: true };
    const r = drive(entry({ kmh: 30 }), () => ringReport(CENTRE, [car], true));
    expect(r.bills).toBe(0);
    // …and not praised either: he let nothing past.
    expect(r.commended).toBe(false);
  });

  it("presence with no account at all (a query that only says «busy») can not bill, at any speed", () => {
    for (const kmh of [4, 9, 15, 25, 40]) {
      expect(drive(entry({ kmh }), () => BUSY_RING).bills, `${kmh} км/ч`).toBe(0);
    }
  });

  it("an empty ring bills nobody and praises nobody", () => {
    const r = drive(entry({ kmh: 20 }), () => NO_RING);
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });
});

describe("THE PRIORITY SET — the circulating cars that have not passed his mouth when he enters (and none that comes after he has left it)", () => {
  it("NO ENTRY, NO OFFENCE: whatever a car sheds while his nose is still off the ring is not his entry — creeping to the line, standing on it and then entering clean is not billed", () => {
    const car = carBehind();
    let everOn = false;
    const r = drive(
      entry({ kmh: 5, fromY: -40, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
      (f) => {
        // The car brakes hard «for him» all the way up to the line and through
        // the wait (a guard clipping a car that stands close to the edge), and
        // has stopped braking by the time his nose comes onto the ring.
        if (f.noseOnRing) everOn = true;
        if (!everOn) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(car.shedMps).toBeGreaterThan(20);
    expect(r.frames.some((f) => f.noseOnRing)).toBe(true);
    expect(r.bills).toBe(0);
  });

  it("the first frame his nose is on the ring is the first frame that counts", () => {
    const car = carBehind();
    const r = drive(entry({ kmh: 9 }), () => {
      car.shedMps += 0.3; // every frame, from 60 m out
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(1);
    const first = r.frames.findIndex((f) => f.noseOnRing);
    expect(r.frames.indexOf(r.billed!)).toBe(first);
    // In this lane the nose reaches the ring with the centre ~24.05 m out.
    expect(Math.hypot(r.billed!.x, r.billed!.y)).toBeGreaterThan(23.9);
    expect(Math.hypot(r.billed!.x, r.billed!.y)).toBeLessThan(24.2);
  });

  it("THE CAR HE LET GO BY is not in the set: a car that had passed his mouth when he entered can brake for him as hard as it likes — following it is not failing to yield to it", () => {
    for (const pastM of [3, 6, 15, 40]) {
      const car = carWithRun(-pastM);
      const r = drive(entry({ kmh: 12, ringDeg: 20, leave: false }), (f) => {
        if (f.noseOnRing) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
      expect(car.shedMps, `${pastM} m past`).toBeGreaterThan(1);
      expect(r.bills, `${pastM} m past`).toBe(0);
    }
  });

  it("THE MOUTH BOUNDARY, both sides: a car whose rear end is 0.1 m short of having passed is in the set (billed); 0.1 m beyond, it has passed (not billed)", () => {
    const at = (rearPastM: number): Result => {
      // Its centre is past the mouth by half its length plus `rearPastM`. Ride
      // it on the ring's inner edge so his body never meets it.
      const car = carWithRun(-(CAR_HALF_M + rearPastM), { radiusM: 14.5 });
      return drive(entry({ kmh: 12, ringDeg: 8, leave: false }), (f) => {
        if (f.noseOnRing) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
    };
    // (0.1 m is under half the 0.27 m by which «the mouth» would move if it
    // were taken at his centre instead of where his nose crossed the edge.)
    expect(at(-0.1).bills).toBe(1);
    expect(at(+0.1).bills).toBe(0);
  });

  it("WHEREVER ON THE RING IT IS — no distance, no reach: a car 170° of ring upstream (53 m of road, 36 m as the crow flies) is in the set; one 190° upstream is 170° PAST and is not", () => {
    const at = (upstreamDeg: number): Result => {
      const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + upstreamDeg, radiusM: RING_R, speedMps: 2.9, shedMps: 0 };
      return drive(entry({ kmh: 12, ringDeg: 20, leave: false }), (f) => {
        if (f.noseOnRing) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
    };
    expect(at(170).bills).toBe(1);
    expect(at(190).bills).toBe(0);
    expect(at(90).bills).toBe(1);
    expect(at(270).bills).toBe(0);
  });

  it("A CAR THAT JOINS THE RING AFTER HE HAS LEFT HIS MOUTH is not in the set: first reported with his rear end already past it, it can brake for him and not be this fault", () => {
    // (While he still sits IN the mouth such a car does join — round 5, below.)
    const car = carBehind(40); // with 40 m/s of old account, too
    let leftAt: Frame | null = null;
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (!(f.noseOnRing && f.pastMouthM > PLAYER_HALF_LENGTH_M + 0.5)) return NO_RING;
      leftAt ??= f;
      car.shedMps += TICK;
      return ringReport(CENTRE, [car]);
    });
    expect(leftAt).not.toBeNull();
    expect(car.shedMps).toBeGreaterThan(41);
    expect(r.bills).toBe(0);
  });

  it("…nor is a car that was out on an arm, or heading inward, while he was in his mouth and came onto the ring after he had left it", () => {
    for (const how of ["arm", "inward"] as const) {
      const car: StubCar =
        how === "arm" ? { ...carBehind(), radiusM: RING_EDGE_M + 1 } : { ...carBehind(), heading: "inward" };
      const r = drive(entry({ kmh: 12 }), (f) => {
        if (f.noseOnRing && f.pastMouthM > PLAYER_HALF_LENGTH_M + 0.5) {
          // It is on the ring now, going round it, upstream of him — and braking.
          car.radiusM = RING_R;
          car.heading = "ccw";
          car.shedMps += TICK;
        }
        return ringReport(CENTRE, [car]);
      });
      expect(car.shedMps, how).toBeGreaterThan(1);
      expect(r.bills, how).toBe(0);
    }
  });

  it("a car put down ON the ring (a spawn, a respawn) has crossed no edge: nothing it is followed by bills an entry", () => {
    const car = carBehind();
    let i = 0;
    const r = drive(
      () => {
        if (i++ > 600) return null;
        const a = ((165 - i * 0.05) * Math.PI) / 180;
        return { x: RING_R * Math.sin(a), y: RING_R * Math.cos(a), headingDeg: (((165 - i * 0.05 - 90) % 360) + 360) % 360, speedKmh: 6 };
      },
      () => {
        car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(r.bills).toBe(0);
  });
});

describe("CLEARED THE MOUTH — once a car of the set has gone by without having had to brake, his entry did not take its priority", () => {
  /**
   * He creeps in at 5 км/ч; a car 5 m short of the mouth when he enters drives
   * on past it (on the ring's inner edge, clear of his body) and stops a
   * quarter of the ring further on. `brakeOn` picks the frame it sheds 0.3 m/s
   * for him.
   */
  function passingCar(brakeOn: (isPast: boolean, f: Frame) => boolean): { r: Result; car: StubCar } {
    const car = carWithRun(5, { radiusM: 14.5 });
    let everOn = false;
    let done = false;
    const r = drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && car.azDeg > 80) car.azDeg -= 0.6; // ~9 m/s round its lane
      const isPast = rearPast(car);
      if (everOn && !done && brakeOn(isPast, f)) {
        car.shedMps += 0.3;
        done = true;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(done).toBe(true);
    return { r, car };
  }

  it("both sides of the line: 0.3 m/s lost on the last frame its rear end is still short of the mouth is billed; on the first frame it is past, it is not", () => {
    // The frame BEFORE the one it will be past on (its next step carries its tail over the mouth).
    const nextStepPasses = (car: StubCar): boolean => rearPast({ ...car, azDeg: car.azDeg - 0.6 });
    const run = (onLastShort: boolean): Result => {
      const car = carWithRun(5, { radiusM: 14.5 });
      let everOn = false;
      let done = false;
      return drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), (f) => {
        if (f.noseOnRing) everOn = true;
        if (everOn && car.azDeg > 80) car.azDeg -= 0.6;
        if (everOn && !done) {
          const fire = onLastShort ? !rearPast(car) && nextStepPasses(car) : rearPast(car);
          if (fire) {
            car.shedMps += 0.3;
            done = true;
          }
        }
        return ringReport(CENTRE, [car]);
      });
    };
    expect(run(true).bills).toBe(1);
    expect(run(false).bills).toBe(0);
  });

  it("whatever it does for him further round the ring — it catches his crawl a quarter of a lap on and brakes to a stop — is not this conviction", () => {
    const { r, car } = passingCar((isPast, f) => isPast && f.sweptDeg > 10);
    expect(car.shedMps).toBeGreaterThanOrEqual(0.3);
    expect(r.bills).toBe(0);
  });

  it("«CLEARED» STAYS CLEARED ONCE HE HAS LEFT HIS MOUTH: the same car, round the whole ring and coming up behind him where he has stopped 15° on, is not a car his entry took priority from", () => {
    // He enters, goes on past his mouth and stops in the lane; the car goes by,
    // drives the lap, and brakes behind him on its way back — more than half a
    // lap on, where plain geometry would call it «not passed» again. The set
    // closed when his rear end left the mouth, so it does not come back into
    // it. (Stopping on the ring after the car has cleared is billed by nothing
    // here — recorded, not graded. While he still SITS in his mouth the same
    // car does come back into the set: round 5, below.)
    const car = carWithRun(5, { radiusM: 14.5 });
    let everOn = false;
    let left = false;
    const r = drive(
      entry({ kmh: 12, fromY: -27, ringDeg: 40, leave: false, holds: [{ when: (_x, _y, on) => on >= 15, sec: 7 }] }),
      (f) => {
        if (f.noseOnRing) everOn = true;
        // He is out of his mouth before the car is half a lap past it.
        if (!left && f.pastMouthM > PLAYER_HALF_LENGTH_M) {
          left = true;
          expect(rbPassedMouthOf(car)).toBe(true);
        }
        if (everOn && car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
        else if (everOn) car.shedMps += TICK; // back upstream of the mouth, 40° short of it, braking
        return ringReport(CENTRE, [car]);
      },
    );
    expect(left).toBe(true);
    expect(car.shedMps).toBeGreaterThan(1);
    expect(rbPassedMouthOf(car)).toBe(false); // geometry alone says «still coming»
    expect(r.bills).toBe(0);
  });

  it("EACH ENTRY IS ITS OWN: he backs his nose off the ring and comes on again — the car that went by the first time and has come round is a car with priority over the SECOND entry", () => {
    const car = carWithRun(5, { radiusM: 14.5 });
    let entries = 0;
    let prevOn = false;
    const r = drive(
      upAndDown([
        [NOSE_IN_Y, 5, 330],
        [NOSE_OUT_Y, 5, 30],
        [NOSE_IN_Y, 5, 60],
      ]),
      (f) => {
        if (f.noseOnRing && !prevOn) entries++;
        prevOn = f.noseOnRing;
        if (entries >= 1 && car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
        if (entries === 2) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(entries).toBe(2);
    expect(r.bills).toBe(1);
    // Billed in the second entry, ten frames into it.
    const second = r.frames.findIndex((f, i) => f.noseOnRing && i > 0 && !r.frames[i - 1].noseOnRing && r.frames.slice(0, i).some((g) => g.noseOnRing));
    expect(r.frames.indexOf(r.billed!) - second).toBe(9);
  });

  it("…and a car that passed between the two entries starts the second one OUT of the set, its old account dropped", () => {
    const car = carWithRun(8);
    let entries = 0;
    let prevOn = false;
    let given = 0;
    const r = drive(
      upAndDown([
        [NOSE_IN_Y, 5, 60],
        [NOSE_OUT_Y, 5, 30],
        [NOSE_IN_Y, 5, 60],
      ]),
      (f) => {
        if (f.noseOnRing && !prevOn) entries++;
        prevOn = f.noseOnRing;
        if (entries === 1 && f.noseOnRing && given < 9) {
          car.shedMps += TICK; // 0.28 m/s lost to the first entry: under the line
          given++;
        }
        if (entries === 1 && !f.noseOnRing) car.azDeg = MOUTH_AZ - degOf(6); // it goes by while he is off the ring
        if (entries === 2) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(entries).toBe(2);
    expect(car.shedMps).toBeGreaterThan(1);
    expect(r.bills).toBe(0);
  });

  it("ONE CAR, ONE ACCOUNT: a car that was in the set, has not cleared, and is still short of the mouth when he noses off the edge and on again keeps what it has already lost to him", () => {
    // Otherwise a nose rocking over the ring's edge in front of a braking car
    // would wipe its account every time it came back on.
    const car = carWithRun(12);
    let entries = 0;
    let prevOn = false;
    let given = 0;
    const r = drive(
      upAndDown([
        [NOSE_IN_Y, 5, 60],
        [NOSE_OUT_Y, 5, 30],
        [NOSE_IN_Y, 5, 60],
      ]),
      (f) => {
        if (f.noseOnRing && !prevOn) entries++;
        prevOn = f.noseOnRing;
        if (entries === 1 && f.noseOnRing && given < 9) {
          car.shedMps += TICK;
          given++;
        }
        if (entries === 2 && given < 11) {
          car.shedMps += TICK;
          given++;
        }
        return ringReport(CENTRE, [car]);
      },
    );
    expect(entries).toBe(2);
    expect(car.shedMps).toBe(11 * TICK); // 0.28 in the first entry, 0.06 in the second
    expect(r.bills).toBe(1);
    expect(r.frames.indexOf(r.billed!)).toBeGreaterThan(r.frames.findIndex((f) => f.noseOnRing) + 60);
  });
});

/** The product's own «passed the mouth», asked of a stub car about the standard mouth. */
function rbPassedMouthOf(car: StubCar): boolean {
  const a = (car.azDeg * Math.PI) / 180;
  const m = (MOUTH_AZ * Math.PI) / 180;
  return rbPassedMouth(
    RING_EDGE_M * Math.sin(m),
    RING_EDGE_M * Math.cos(m),
    car.radiusM * Math.sin(a),
    car.radiusM * Math.cos(a),
    -Math.cos(a),
    Math.sin(a),
    CAR_HALF_M,
  );
}

describe("WHOSE braking — a vehicle CIRCULATING on the ring, each on its own account", () => {
  it("a car beyond the ring carriageway (out on an arm) braking for him does not bill his entry", () => {
    const car: StubCar = { ...carBehind(), radiusM: RING_EDGE_M + 1 };
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing) car.shedMps += TICK;
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(0);
  });

  it("a car on the ring that is itself ENTERING (heading inward) is not a car with priority over him: its braking does not bill", () => {
    const car: StubCar = { ...carBehind(), heading: "inward" };
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing) car.shedMps += TICK;
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(0);
  });

  it("two cars that each lose 0.19 m/s are two cars under the line, not one car over it", () => {
    const a = carBehind();
    const b: StubCar = { ...carBehind(), id: 1001, azDeg: 240 };
    let n = 0;
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing && n < 6) {
        a.shedMps += TICK;
        b.shedMps += TICK;
        n++;
      }
      return ringReport(CENTRE, [a, b]);
    });
    expect(a.shedMps + b.shedMps).toBe(0.375);
    expect(r.bills).toBe(0);
  });

  it("an account that restarts (the counter goes backwards) is not a loss", () => {
    const car = carBehind(50);
    const r = drive(entry({ kmh: 12 }), (f) => {
      if (f.noseOnRing && f.sweptDeg > 5) car.shedMps = 0; // re-staged mid-entry
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(0);
  });

  it("what a car of the set had lost to him BEFORE he entered is not charged to the entry", () => {
    const car = carBehind(40); // 40 m/s of old account, reported from the first frame of the visit
    const r = drive(entry({ kmh: 12 }), () => ringReport(CENTRE, [car]));
    expect(r.bills).toBe(0);
  });
});

describe("…OR THERE IS CONTACT — with a car that has not cleared his mouth", () => {
  /** A car across his path on the ring centreline, right where the lane meets it. */
  const inHisPath = (heading?: "inward"): StubCar => ({
    id: 1000,
    azDeg: 167,
    radiusM: RING_R,
    speedMps: 2.9,
    shedMps: 0,
    ...(heading ? { heading } : {}),
  });

  it("driving into the side of a circulating car whose body is still across his mouth, and that never braked: billed on the frame the two bodies overlap", () => {
    expect(rearPast(inHisPath())).toBe(false);
    const r = drive(entry({ kmh: 15, leave: false, ringDeg: 5 }), () => ringReport(CENTRE, [inHisPath()]));
    expect(r.bills).toBe(1);
    expect(r.billed!.noseOnRing).toBe(true);
    // Centres about half his length plus half its width apart: a touch, not a pass-through.
    const d = Math.hypot(r.billed!.x - RING_R * Math.sin((167 * Math.PI) / 180), r.billed!.y - RING_R * Math.cos((167 * Math.PI) / 180));
    expect(d).toBeGreaterThan(2.5);
    expect(d).toBeLessThan(3.3);
  });

  it("a body on the ring that is not circulating (heading inward) is not the priority vehicle: touching it is not failing to yield", () => {
    const r = drive(entry({ kmh: 15, leave: false, ringDeg: 5 }), () => ringReport(CENTRE, [inHisPath("inward")]));
    expect(r.bills).toBe(0);
  });

  it("R3-V2 — RUNNING INTO THE BACK OF THE CAR HE LET GO BY is a collision and never «не пропусна»: it had passed his mouth when he entered, however soon after entering he hits it", () => {
    // Round 3 billed any touch inside 35° of ring «Влизане без пропускане · Влезе
    // в кръга пред кола…» — false of a driver who entered BEHIND the car.
    for (const pastM of [6, 9, 20]) {
      const car = carWithRun(-pastM);
      let touchedAt: number | null = null;
      const r = drive(entry({ kmh: 15, leave: false, ringDeg: 75 }), (f) => {
        const a = (car.azDeg * Math.PI) / 180;
        // Centres closer than their half lengths end to end: his nose is in its tail.
        if (touchedAt === null && Math.hypot(f.x - RING_R * Math.sin(a), f.y - RING_R * Math.cos(a)) < PLAYER_HALF_LENGTH_M + CAR_HALF_M - 0.3) {
          touchedAt = f.sweptDeg;
        }
        return ringReport(CENTRE, [car]);
      });
      expect(touchedAt, `${pastM} m past`).not.toBeNull();
      if (pastM <= 9) expect(touchedAt!, `${pastM} m past`).toBeLessThan(RB_ON_RING_DEG); // inside round 3's window
      expect(r.bills, `${pastM} m past`).toBe(0);
    }
  });

  it("a car of the set touched AFTER it has cleared the mouth is a collision too: it went by unbraked, and he then ran into its back", () => {
    // 0.8 m short of the mouth when he enters; it drives past and stops 30° on.
    const car = carWithRun(0.8);
    let everOn = false;
    let touched = false;
    const r = drive(entry({ kmh: 5, fromY: -27, leave: false, ringDeg: 40 }), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && car.azDeg > 140) car.azDeg -= 1.5;
      const a = (car.azDeg * Math.PI) / 180;
      if (Math.hypot(f.x - RING_R * Math.sin(a), f.y - RING_R * Math.cos(a)) < PLAYER_HALF_LENGTH_M + CAR_HALF_M - 0.3) touched = true;
      return ringReport(CENTRE, [car]);
    });
    expect(touched).toBe(true);
    expect(r.bills).toBe(0);
  });

  it("STANDING IS NO DEFENCE: he enters ahead of a car and stops in its lane; it runs into him before its rear end has cleared his mouth — billed, at rest", () => {
    const car = carBehind();
    const r = drive(
      entry({ kmh: 10, ringDeg: 60, leave: false, holds: [{ when: (_x, _y, on) => on >= 12, sec: 8 }] }),
      (f) => {
        // It comes round at ~5.6 m/s and stops with its nose 0.2 m into his tail.
        const a = (car.azDeg * Math.PI) / 180;
        const apart = Math.hypot(f.x - RING_R * Math.sin(a), f.y - RING_R * Math.cos(a));
        if (f.noseOnRing && f.speedKmh === 0 && apart > PLAYER_HALF_LENGTH_M + CAR_HALF_M - 0.2) car.azDeg -= 0.3;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(r.bills).toBe(1);
    expect(r.billed!.speedKmh).toBe(0);
    expect(rearPast(car)).toBe(false); // its tail is still across his mouth
  });
});

describe("THE COMMENDATION — «пропусна превозното средство с предимство и продължи, когато беше безопасно» has to have happened", () => {
  /**
   * The honest yield: stop on the line while a car comes round, let it go by,
   * then enter. The car is `approaching` until it has passed his azimuth and
   * `pastEntry` after; it stops at `parkAz`, out of his way (and, at his entry,
   * NOT in the priority set — it is the car he let go by). `other`, if given,
   * is a second car that is still upstream of the mouth when he enters: a car
   * of the set.
   */
  function yieldDrive(opts: {
    passes: boolean;
    parkAz?: number;
    other?: StubCar;
    after?: (f: Frame, car: StubCar, other: StubCar | undefined) => void;
  }): Result {
    const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    const parkAz = opts.parkAz ?? 20;
    return drive(
      entry({ kmh: 12, fromY: -45, ringDeg: 100, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
      (f) => {
        if (opts.passes && f.speedKmh === 0 && !f.noseOnRing && car.azDeg > parkAz) {
          // …it goes by while he stands there, and on round the ring, out of his way.
          car.azDeg -= 0.6;
          if (car.azDeg < 160) {
            car.approaching = false;
            car.pastEntry = true;
          }
        }
        opts.after?.(f, car, opts.other);
        return ringReport(CENTRE, opts.other ? [car, opts.other] : [car], car.approaching === true);
      },
    );
  }
  /** A second car, 60° of ring upstream of the mouth, on the ring's inner edge (clear of his body). */
  const upstream = (): StubCar => ({ id: 1001, azDeg: MOUTH_AZ + 60, radiusM: 14.5, speedMps: 2.9, shedMps: 0 });

  it("held back while a car with priority was coming, it went by, he entered and nobody braked: commended, not billed", () => {
    const r = yieldDrive({ passes: true });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(true);
  });

  it("…and with a second car still upstream of his mouth that never has to do anything about him: commended just the same", () => {
    const r = yieldDrive({ passes: true, other: upstream() });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(true);
  });

  it("SLOWING ON THE RING IS NOT HOLDING BACK AT THE ENTRY: he rolls in at 15 км/ч without slowing for anybody, stands still 40° round with a car coming, backs up until he is short of 35° again, and the car goes by — «пропусна» was never true of his entry: not commended", () => {
    // «Held back» is something a driver does BEFORE he is circulating
    // (RB_ON_RING_DEG). The only way to be at or under the yield speed with a
    // car coming, then short of 35° again when it passes, without ever having
    // held back at the entry, is to stop on the ring and reverse — so that is
    // the drive.
    const mouthY = -Math.sqrt(RING_R * RING_R - X_LANE * X_LANE);
    const a0 = (Math.atan2(X_LANE, mouthY) * 180) / Math.PI;
    const car: StubCar = { id: 1000, azDeg: 300, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let y = -45;
    let gone = 0; // degrees of ring behind him
    let phase: "arm" | "in" | "stand" | "back" | "wait" | "on" | "out" = "arm";
    let n = 0;
    let outM = 0;
    const onRingPose = (kmh: number) => {
      const a = ((a0 - gone) * Math.PI) / 180;
      return { x: RING_R * Math.sin(a), y: RING_R * Math.cos(a), headingDeg: (((a0 - gone - 90) % 360) + 360) % 360, speedKmh: kmh };
    };
    const degPerFrame = (kmh: number) => ((((kmh / 3.6) * DT) / RING_R) * 180) / Math.PI;
    const r = drive(
      () => {
        if (phase === "arm") {
          y += (15 / 3.6) * DT;
          if (y >= mouthY) phase = "in";
          return { x: X_LANE, y: Math.min(y, mouthY), headingDeg: 0, speedKmh: 15 };
        }
        if (phase === "in") {
          gone += degPerFrame(15);
          if (gone >= 40) phase = "stand";
          return onRingPose(15);
        }
        if (phase === "stand") {
          if (++n >= 60) phase = "back";
          return onRingPose(0);
        }
        if (phase === "back") {
          gone -= degPerFrame(12);
          if (gone <= 25) {
            phase = "wait";
            n = 0;
          }
          return onRingPose(-12);
        }
        if (phase === "wait") {
          if (++n >= 30) phase = "on";
          return onRingPose(12);
        }
        if (phase === "on") {
          gone += degPerFrame(12);
          if (gone >= 100) phase = "out";
          return onRingPose(12);
        }
        const a = ((a0 - gone) * Math.PI) / 180;
        outM += (48 / 3.6) * DT;
        if (outM > 80) return null;
        return {
          x: RING_R * Math.sin(a) - Math.cos(a) * outM,
          y: RING_R * Math.cos(a) + Math.sin(a) * outM,
          headingDeg: (((a0 - gone - 90) % 360) + 360) % 360,
          speedKmh: 48,
        };
      },
      () => {
        // The car is «coming» only while he stands 40° round; it has «gone by»
        // once he is short of 35° again.
        car.approaching = phase === "stand";
        car.pastEntry = phase === "wait" || phase === "on" || phase === "out";
        return ringReport(CENTRE, [car], car.approaching === true);
      },
    );
    expect(phase).toBe("out");
    // The premise: he was past the «circulating» line when he stood, and short of it when the car went by.
    expect(r.frames.some((f) => f.speedKmh === 0 && f.sweptDeg >= RB_ON_RING_DEG)).toBe(true);
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("THE CONTROL for the drive above: the same stand made BEFORE he is circulating — 20° round, the car coming, then gone by — is holding back and letting it pass: commended", () => {
    const mouthY = -Math.sqrt(RING_R * RING_R - X_LANE * X_LANE);
    const a0 = (Math.atan2(X_LANE, mouthY) * 180) / Math.PI;
    const car: StubCar = { id: 1000, azDeg: 300, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let y = -45;
    let gone = 0;
    let phase: "arm" | "in" | "stand" | "wait" | "on" | "out" = "arm";
    let n = 0;
    let outM = 0;
    const onRingPose = (kmh: number) => {
      const a = ((a0 - gone) * Math.PI) / 180;
      return { x: RING_R * Math.sin(a), y: RING_R * Math.cos(a), headingDeg: (((a0 - gone - 90) % 360) + 360) % 360, speedKmh: kmh };
    };
    const degPerFrame = (kmh: number) => ((((kmh / 3.6) * DT) / RING_R) * 180) / Math.PI;
    const r = drive(
      () => {
        if (phase === "arm") {
          y += (15 / 3.6) * DT;
          if (y >= mouthY) phase = "in";
          return { x: X_LANE, y: Math.min(y, mouthY), headingDeg: 0, speedKmh: 15 };
        }
        if (phase === "in") {
          gone += degPerFrame(15);
          if (gone >= 20) phase = "stand";
          return onRingPose(15);
        }
        if (phase === "stand") {
          if (++n >= 60) {
            phase = "wait";
            n = 0;
          }
          return onRingPose(0);
        }
        if (phase === "wait") {
          if (++n >= 30) phase = "on";
          return onRingPose(12);
        }
        if (phase === "on") {
          gone += degPerFrame(12);
          if (gone >= 100) phase = "out";
          return onRingPose(12);
        }
        const a = ((a0 - gone) * Math.PI) / 180;
        outM += (48 / 3.6) * DT;
        if (outM > 80) return null;
        return {
          x: RING_R * Math.sin(a) - Math.cos(a) * outM,
          y: RING_R * Math.cos(a) + Math.sin(a) * outM,
          headingDeg: (((a0 - gone - 90) % 360) + 360) % 360,
          speedKmh: 48,
        };
      },
      () => {
        car.approaching = phase === "stand";
        car.pastEntry = phase === "wait" || phase === "on" || phase === "out";
        return ringReport(CENTRE, [car], car.approaching === true);
      },
    );
    expect(phase).toBe("out");
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(true);
  });

  it("NOTHING IS BILLED TO AN ENTRY HE HAS BEEN COMMENDED FOR: he lets a car by and enters with a second still upstream of his mouth; it only has to brake once he is out beyond the commit reach — commended on leaving, and not billed after it", () => {
    const other = upstream();
    let everOn = false;
    const r = yieldDrive({
      passes: true,
      other,
      after: (f, _car, o) => {
        if (f.noseOnRing) everOn = true;
        if (everOn && !f.noseOnRing && Math.hypot(f.x, f.y) > 30) o!.shedMps += 0.125;
      },
    });
    expect(other.shedMps).toBeGreaterThan(1);
    expect(r.commended).toBe(true);
    expect(r.bills).toBe(0);
  });

  it("holding back, letting it go by — and then never entering (he turns away at the line): nothing to praise, he did not «continue»", () => {
    const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    let i = 0;
    const r = drive(
      () => {
        i++;
        // Up to the line, 6 s there, then straight back out the way he came.
        if (i < 200) return { x: X_LANE, y: Math.min(-27.5, -45 + i * 0.1), headingDeg: 0, speedKmh: 6 };
        if (i < 560) return { x: X_LANE, y: -27.5, headingDeg: 0, speedKmh: 0 };
        const y = -27.5 - (i - 560) * 0.2;
        return y < -120 ? null : { x: X_LANE, y, headingDeg: 0, speedKmh: -12 };
      },
      (f) => {
        if (f.speedKmh === 0 && car.azDeg > 20) {
          car.azDeg -= 0.6;
          if (car.azDeg < 160) {
            car.approaching = false;
            car.pastEntry = true;
          }
        }
        return ringReport(CENTRE, [car], car.approaching === true);
      },
    );
    expect(r.frames.some((f) => f.noseOnRing)).toBe(false);
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("arriving at 15 км/ч as a car happens to go by ahead of him, and driving in behind it without ever slowing to the yield speed: clean, and not praised — he held back for nothing", () => {
    const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    const r = drive(entry({ kmh: 15, fromY: -60, ringDeg: 100 }), (f) => {
      // Inside the instrument's field of view (44 m) it is still coming; it is
      // past his azimuth, and away round the ring, before he reaches the line.
      if ((f.y > -42 || car.azDeg < 215) && car.azDeg > 20) {
        car.azDeg -= 0.6;
        if (car.azDeg < 160) {
          car.approaching = false;
          car.pastEntry = true;
        }
      }
      return ringReport(CENTRE, [car], car.approaching === true);
    });
    expect(r.frames.every((f) => f.speedKmh > 8)).toBe(true);
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("crawling up with a car on the ring that never goes by is not letting anything past: no praise", () => {
    const r = yieldDrive({ passes: false });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("slowing for a car and then rolling in AHEAD of it — never above 8 км/ч, nobody forced — is neither billed nor praised", () => {
    const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    const r = drive(entry({ kmh: 7, fromY: -45, ringDeg: 100 }), () => ringReport(CENTRE, [car], true));
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("a billed entry is never also praised: he lets one car by, then enters ahead of the next, which has to brake", () => {
    const r = yieldDrive({
      passes: true,
      other: upstream(),
      after: (f, _car, other) => {
        if (f.noseOnRing) other!.shedMps += TICK;
      },
    });
    expect(r.bills).toBe(1);
    expect(r.commended).toBe(false);
  });

  it("R4-3 — A SUB-THRESHOLD EASING LOSES THE PRAISE: the next car eases 0.28 m/s for him before clearing his mouth — not billed, and not «когато беше безопасно»", () => {
    // Round 3 kept the commendation here: «0 т., Правилно отстъпено предимство»
    // with the lead trimmed 2.90 → 2.72 m/s behind him.
    let given = 0;
    const r = yieldDrive({
      passes: true,
      other: upstream(),
      after: (f, _car, other) => {
        if (f.noseOnRing && given < 9) {
          other!.shedMps += TICK;
          given++;
        }
      },
    });
    expect(given).toBe(9);
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("…«any» means any: one frame of trimming (0.03 m/s) by a car of the set is enough, and a millionth of that is floating-point dust", () => {
    const eased = (mps: number): Result => {
      let done = false;
      return yieldDrive({
        passes: true,
        other: upstream(),
        after: (f, _car, other) => {
          if (f.noseOnRing && !done) {
            other!.shedMps += mps;
            done = true;
          }
        },
      });
    };
    expect(eased(TICK).commended).toBe(false);
    expect(eased(2e-6).commended).toBe(false);
    expect(eased(5e-7).commended).toBe(true);
    for (const mps of [TICK, 2e-6, 5e-7]) expect(eased(mps).bills).toBe(0);
  });

  it("the car he let past, braking hard behind his crawl when it comes round, has not had its priority taken — not billed — but the entry was not «safe» either: no praise", () => {
    const r = yieldDrive({
      passes: true,
      after: (f, car) => {
        if (f.noseOnRing) car.shedMps += TICK;
      },
    });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("…while that same car merely trimmed (under 0.3 m/s) does not cost him the praise: the commendation's strict line is about the cars with priority over his entry", () => {
    let given = 0;
    const r = yieldDrive({
      passes: true,
      after: (f, car) => {
        if (f.noseOnRing && given < 9) {
          car.shedMps += TICK;
          given++;
        }
      },
    });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(true);
  });

  it("running into the car he had just let past: a collision (billed elsewhere), no entry fault, and no praise", () => {
    // The honest yield — and the car stops 6 m past his mouth, in his way.
    const r = yieldDrive({ passes: true, parkAz: MOUTH_AZ - degOf(6) });
    expect(r.bills).toBe(0);
    expect(r.commended).toBe(false);
  });

  it("A NEW VISIT REMEMBERS NO CARS: the car he held back for LAST time, already past his mouth this time, does not make «пропусна» true of a visit in which he let nothing by", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    // Visit 1: the honest yield to car 1000 — commended.
    const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    const first = drive(
      entry({ kmh: 12, fromY: -45, ringDeg: 100, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
      (f) => {
        if (f.speedKmh === 0 && !f.noseOnRing && car.azDeg > 20) {
          car.azDeg -= 0.6;
          if (car.azDeg < 160) {
            car.approaching = false;
            car.pastEntry = true;
          }
        }
        return ringReport(CENTRE, [car], car.approaching === true);
      },
      rt,
    );
    expect(first.commended).toBe(true);
    // Visit 2: car 1000 is parked past his mouth from the start; another car is
    // coming and never goes by. He waits on the line and then enters ahead of it.
    const coming: StubCar = { id: 2000, azDeg: 215, radiusM: 14.5, speedMps: 2.9, shedMps: 0, approaching: true };
    const second = drive(
      entry({ kmh: 12, fromY: -45, ringDeg: 100, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
      () => ringReport(CENTRE, [car, coming], true),
      rt,
    );
    expect(second.bills).toBe(0);
    expect(second.commended).toBe(false);
  });
});

describe("A CAR OF THE SET THAT LEAVES THE RING before it has reached his mouth has no priority left to take", () => {
  /**
   * He noses in and stays; a car 20 m short of his mouth drives on, turns off
   * the ring 10 m short of it (out beyond the carriageway), and `then` says
   * what it does afterwards.
   */
  function leaver(then: (car: StubCar, f: Frame, framesOut: number) => void, frames = 420): { r: Result; car: StubCar } {
    const car = carWithRun(20);
    let everOn = false;
    let framesOut = 0;
    const r = drive(upAndDown([[NOSE_IN_Y, 5, frames]]), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn) {
        if (framesOut === 0 && car.azDeg > MOUTH_AZ + degOf(10)) car.azDeg -= 0.3;
        else {
          if (framesOut === 0) car.radiusM = RING_EDGE_M + 4; // off the ring, out on an arm
          framesOut++;
          then(car, f, framesOut);
        }
      }
      return ringReport(CENTRE, [car]);
    });
    expect(framesOut).toBeGreaterThan(60);
    return { r, car };
  }

  it("it stays off the ring and brakes for him out there: it has left the set, and it is not circulating — not billed", () => {
    const { r, car } = leaver((c, _f, out) => {
      if (out > 60) c.shedMps += TICK;
    });
    expect(car.shedMps).toBeGreaterThan(1);
    expect(r.bills).toBe(0);
  });

  it("ROUND 5 — it comes back onto the ring upstream of his mouth a second later, WHILE HE STILL SITS IN THAT MOUTH, and brakes for him: a circulating car short of the mouth he occupies — it joins the set again, from nothing, and is billed", () => {
    // What it had lost to him before it left (0.28 m/s, under the line) is not
    // carried into the new membership: the bill comes on the tenth frame of
    // the new braking, not on its first.
    let given = 0;
    let backAt: Frame | null = null;
    const car = carWithRun(20);
    let everOn = false;
    let framesOut = 0;
    const r = drive(upAndDown([[NOSE_IN_Y, 5, 420]]), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn) {
        if (given < 9) {
          car.shedMps += TICK;
          given++;
        }
        if (framesOut === 0 && car.azDeg > MOUTH_AZ + degOf(10)) car.azDeg -= 0.3;
        else {
          if (framesOut === 0) car.radiusM = RING_EDGE_M + 4;
          framesOut++;
          if (framesOut === 60) {
            car.radiusM = RING_R; // back on the ring, still 10 m short of the mouth
            backAt = f;
          }
          if (framesOut > 60) car.shedMps += TICK;
        }
      }
      return ringReport(CENTRE, [car]);
    });
    expect(backAt).not.toBeNull();
    expect(rbPassedMouthOf(car)).toBe(false);
    expect(r.bills).toBe(1);
    expect(r.frames.indexOf(r.billed!) - r.frames.indexOf(backAt!)).toBe(10);
  });

  it("…and the same return made AFTER HE HAS LEFT HIS MOUTH (he has driven on 15° round the ring): a car that joined the ring later — not billed", () => {
    const car = carWithRun(20);
    let everOn = false;
    let framesOut = 0;
    let leftBeforeBack = false;
    const r = drive(
      entry({ kmh: 12, fromY: -27, ringDeg: 40, leave: false, holds: [{ when: (_x, _y, on) => on >= 15, sec: 6 }] }),
      (f) => {
        if (f.noseOnRing) everOn = true;
        if (everOn) {
          if (framesOut === 0 && car.azDeg > MOUTH_AZ + degOf(10)) car.azDeg -= 0.3;
          else {
            if (framesOut === 0) car.radiusM = RING_EDGE_M + 4; // off the ring, out on an arm
            framesOut++;
            if (framesOut === 240) {
              car.radiusM = RING_R; // back on the ring, still 10 m short of the mouth
              leftBeforeBack = f.pastMouthM > PLAYER_HALF_LENGTH_M;
            }
            if (framesOut > 240) car.shedMps += TICK;
          }
        }
        return ringReport(CENTRE, [car]);
      },
    );
    expect(leftBeforeBack).toBe(true);
    expect(car.shedMps).toBeGreaterThan(1);
    expect(rbPassedMouthOf(car)).toBe(false); // on the ring, upstream of the mouth: geometry alone would call it «in the set»
    expect(r.bills).toBe(0);
  });

  it("THE CONTROL: the same car, the same braking, never having left the ring — billed", () => {
    const car = carWithRun(20);
    let everOn = false;
    let n = 0;
    const r = drive(upAndDown([[NOSE_IN_Y, 5, 420]]), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn) {
        if (car.azDeg > MOUTH_AZ + degOf(10)) car.azDeg -= 0.3;
        else if (++n > 60) car.shedMps += TICK;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(r.bills).toBe(1);
  });

  it("…and, once he has left his mouth, the entry is no longer open to conviction from the frame it is seen off the ring", () => {
    // He drives on round (his rear end is past the mouth a second or two after
    // his nose came on); the car turns off the ring later than that.
    const car = carWithRun(30);
    let everOn = false;
    let offAt: Frame | null = null;
    let leftAt: Frame | null = null;
    const r = drive(entry({ kmh: 12, fromY: -27, ringDeg: 60, leave: false }), (f) => {
      if (f.noseOnRing) everOn = true;
      if (leftAt === null && f.pastMouthM > PLAYER_HALF_LENGTH_M) leftAt = f;
      if (everOn && offAt === null) {
        if (car.azDeg > MOUTH_AZ + degOf(10)) car.azDeg -= 0.3;
        else {
          car.radiusM = RING_EDGE_M + 4;
          offAt = f;
        }
      }
      return ringReport(CENTRE, [car]);
    });
    const firstOn = r.frames.findIndex((f) => f.noseOnRing);
    const off = r.frames.indexOf(offAt!);
    expect(off).toBeGreaterThan(r.frames.indexOf(leftAt!));
    // Open for exactly the frames the car was still on the ring: one run of them, from the entry.
    expect(r.frames.slice(0, firstOn).some((f) => f.entryOpen)).toBe(false);
    expect(r.frames.slice(firstOn, off).every((f) => f.entryOpen)).toBe(true);
    expect(r.frames.slice(off).some((f) => f.entryOpen)).toBe(false);
    expect(r.frames.length - off).toBeGreaterThan(30);
  });
});

describe("THE ENTRY IS FINISHED when he leaves the commit reach — 12 m clear of the ring, where the commendation has always been awarded", () => {
  /** rb-mini: ring radius 18 + ROUNDABOUT_ENTRY_MARGIN_M 12. */
  const COMMIT_REACH_M = 30;
  /**
   * He enters at 12 км/ч ahead of a car that stays 40° short of his mouth (on
   * the ring's inner edge), goes 60° round and leaves along the tangent; the
   * car sheds for him from the first frame `when` says.
   */
  function leaving(when: (rM: number, f: Frame) => boolean): { r: Result; car: StubCar; firstShedAtM: number | null } {
    const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + 40, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let everOn = false;
    let firstShedAtM: number | null = null;
    const r = drive(entry({ kmh: 12, fromY: -40 }), (f) => {
      if (f.noseOnRing) everOn = true;
      const rM = Math.hypot(f.x, f.y);
      if (everOn && when(rM, f)) {
        firstShedAtM ??= rM;
        car.shedMps += 0.125; // four ticks a frame: he is leaving at 48 км/ч, and the reach is only metres wide
      }
      return ringReport(CENTRE, [car]);
    });
    return { r, car, firstShedAtM };
  }

  it("a car of the set that only has to brake once he is beyond the commit reach is not his entry: not billed", () => {
    const { r, car, firstShedAtM } = leaving((rM, f) => !f.noseOnRing && rM > COMMIT_REACH_M);
    expect(firstShedAtM!).toBeGreaterThan(COMMIT_REACH_M);
    expect(car.shedMps).toBeGreaterThan(1);
    expect(rbPassedMouthOf(car)).toBe(false); // it never did clear his mouth
    expect(r.bills).toBe(0);
  });

  it("THE CONTROL — the same braking begun while he is still inside it, off the ring on the exit side: billed", () => {
    const { r, firstShedAtM } = leaving((rM, f) => !f.noseOnRing && rM > RING_EDGE_M + 3);
    expect(firstShedAtM!).toBeGreaterThan(RING_EDGE_M + 3);
    expect(firstShedAtM!).toBeLessThan(COMMIT_REACH_M - 2);
    expect(r.bills).toBe(1);
    expect(Math.hypot(r.billed!.x, r.billed!.y)).toBeLessThan(COMMIT_REACH_M);
  });

  it("…and the entry stops being «open to conviction» on the frame he is beyond it", () => {
    const { r } = leaving(() => false);
    const firstOn = r.frames.findIndex((f) => f.noseOnRing);
    const firstOut = r.frames.findIndex((f, i) => i > firstOn && Math.hypot(f.x, f.y) > COMMIT_REACH_M);
    expect(firstOut).toBeGreaterThan(firstOn);
    expect(r.frames.slice(firstOn, firstOut).every((f) => f.entryOpen)).toBe(true);
    expect(r.frames.slice(firstOut).some((f) => f.entryOpen)).toBe(false);
  });

  it("COMING BACK ON IS A NEW ENTRY: out beyond the commit reach, round and onto the ring again ahead of the same car, which now brakes — billed, for the second entry", () => {
    const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + 40, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let entries = 0;
    let prevOn = false;
    // Up the arm onto the ring, back down it past the commit reach, and up again.
    const r = drive(
      upAndDown(
        [
          [NOSE_IN_Y, 12, 30],
          [-34, 12, 30],
          [NOSE_IN_Y, 12, 120],
        ],
        -40,
      ),
      (f) => {
        if (f.noseOnRing && !prevOn) entries++;
        prevOn = f.noseOnRing;
        if (entries === 2) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(entries).toBe(2);
    expect(r.frames.some((f) => Math.hypot(f.x, f.y) > COMMIT_REACH_M && r.frames.indexOf(f) > r.frames.findIndex((g) => g.noseOnRing))).toBe(true);
    expect(r.bills).toBe(1);
    expect(r.billed!.noseOnRing).toBe(true);
  });
});

describe("SimTick.roundaboutEntryOpen — «this entry can still be billed», for the instructor's voice", () => {
  /** The creep of «CLEARED THE MOUTH»: in at 5 км/ч, a car 5 m short of the mouth drives on past it. */
  function creepWithCar(car: StubCar, over: (car: StubCar, f: Frame, everOn: boolean) => void = () => undefined): Result {
    let everOn = false;
    return drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && car.azDeg > 80) car.azDeg -= 0.6;
      over(car, f, everOn);
      return ringReport(CENTRE, [car]);
    });
  }

  it("absent until he enters; set from the entry frame while he still occupies his mouth OR a car of the set has not cleared it; absent again from the first frame neither is so", () => {
    // Two orders of the same two facts: the car clears the mouth while he is
    // still creeping out of it (5 км/ч), and long after he has left it (12 км/ч,
    // the car 60 m short).
    for (const [kmh, runM] of [
      [5, 5],
      [12, 60],
    ] as const) {
      const car = carWithRun(runM, { radiusM: 14.5 });
      const pastAt: boolean[] = [];
      let everOn = false;
      const r = drive(entry({ kmh, fromY: -27, ringDeg: kmh === 5 ? 20 : 120, leave: false }), (f) => {
        if (f.noseOnRing) everOn = true;
        if (everOn && car.azDeg > 80) car.azDeg -= 0.6;
        pastAt.push(rearPast(car));
        return ringReport(CENTRE, [car]);
      });
      const firstOn = r.frames.findIndex((f) => f.noseOnRing);
      expect(firstOn).toBeGreaterThan(0);
      expect(r.frames.slice(0, firstOn).some((f) => f.entryOpen)).toBe(false);
      let oneOnly = 0;
      for (let i = firstOn; i < r.frames.length; i++) {
        const inMouth = r.frames[i].pastMouthM <= PLAYER_HALF_LENGTH_M;
        expect(r.frames[i].entryOpen, `${kmh} км/ч, frame ${i - firstOn} of the entry`).toBe(inMouth || !pastAt[i]);
        if (inMouth !== !pastAt[i]) oneOnly++;
      }
      // Each drive has a stretch where ONE of the two facts alone decides.
      expect(oneOnly, `${kmh} км/ч`).toBeGreaterThan(10);
      expect(pastAt[pastAt.length - 1]).toBe(true);
      expect(r.frames[r.frames.length - 1].entryOpen).toBe(false);
      expect(r.bills).toBe(0);
    }
  });

  it("an entry nobody has priority over is open only while he still occupies his mouth (a car coming round to it then WOULD have) — the car he let go by, and an empty ring — and never after he has left it", () => {
    const letBy = creepWithCar(carWithRun(-8, { radiusM: 14.5 }));
    const empty = drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), () => NO_RING);
    for (const [name, r] of [["let by", letBy], ["empty", empty]] as const) {
      const on = r.frames.filter((f) => f.noseOnRing);
      expect(on.length, name).toBeGreaterThan(100);
      for (const f of on) expect(f.entryOpen, `${name} t=${f.t.toFixed(2)} past=${f.pastMouthM.toFixed(3)}`).toBe(f.pastMouthM <= PLAYER_HALF_LENGTH_M);
      expect(on.some((f) => f.entryOpen), name).toBe(true);
      expect(on[on.length - 1].entryOpen, name).toBe(false);
      expect(r.frames.filter((f) => !f.noseOnRing).some((f) => f.entryOpen), name).toBe(false);
    }
  });

  it("EVERY BILL LANDS INSIDE IT: the frame before a conviction the entry was open (or the conviction is on the entry frame itself) — and once billed it is not", () => {
    for (const [runM, fromFrame] of [
      [5, 0],
      [5, 12],
      [40, 200],
    ] as const) {
      const car = carWithRun(runM, { radiusM: 14.5 });
      let n = 0;
      let everOn = false;
      const r = drive(upAndDown([[NOSE_IN_Y, 5, 400]]), (f) => {
        if (f.noseOnRing) everOn = true;
        if (everOn && n++ >= fromFrame) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
      expect(r.bills, `run ${runM}`).toBe(1);
      const at = r.frames.indexOf(r.billed!);
      const firstOn = r.frames.findIndex((f) => f.noseOnRing);
      expect(at === firstOn || r.frames[at - 1].entryOpen, `run ${runM}`).toBe(true);
      expect(r.frames.slice(firstOn, at).every((f) => f.entryOpen), `run ${runM}`).toBe(true);
      expect(r.frames.slice(at).some((f) => f.entryOpen), `run ${runM}`).toBe(false);
    }
  });

  it("a car that drops out of the report without having been seen to clear the mouth or to leave the ring keeps the entry open — silence, never praise", () => {
    const car = carWithRun(30);
    let everOn = false;
    let n = 0;
    const r = drive(upAndDown([[NOSE_IN_Y, 5, 200]]), (f) => {
      if (f.noseOnRing) everOn = true;
      return everOn && n++ > 30 ? NO_RING : ringReport(CENTRE, [car]);
    });
    expect(r.frames[r.frames.length - 1].entryOpen).toBe(true);
  });

  it("MEASUREMENT ONLY — nothing graded reads it: in the whole product the field is written by the runtime, declared on the tick, and read by the lesson engine's hand-off to the instructor's voice, and by nothing else", () => {
    // Every product source file under src/ (tests and test support aside) that
    // so much as names the field. A rule, an objective, a rubric or a HUD that
    // starts reading it shows up here by name.
    const SRC = path.resolve(HERE, "../../../..");
    const naming = (needle: string): string[] => {
      const hits: string[] = [];
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === "__tests__" || e.name === "node_modules") continue;
            walk(full);
          } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            if (readFileSync(full, "utf-8").includes(needle)) hits.push(path.relative(SRC, full).replace(/\\/g, "/"));
          }
        }
      };
      walk(SRC);
      return hits.sort();
    };
    expect(naming("roundaboutEntryOpen")).toEqual([
      "modules/sim/lessons/advisor.ts", // doc comments only — it takes the fact as `ringEntryOpen`
      "modules/sim/lessons/engine.ts",
      "modules/sim/rules/types.ts",
      "modules/sim/runtime/worldRuntime.ts",
    ]);
    expect(naming("ringEntryOpen")).toEqual(["modules/sim/lessons/advisor.ts", "modules/sim/lessons/engine.ts"]);
  });
});

describe("SimTick.roundaboutEntryPaidFor — «somebody on the ring has paid for this entry», for the instructor's voice (R4-3: not billed, NOT PRAISED)", () => {
  // «Интервалът беше добър … без движещият се в кръга да намалява заради теб» is
  // praise as much as the commendation is, on its own clock. MEASURED on the
  // round-4 tree before this fact existed: 7,862 live-chain drives, 12 of them
  // told exactly that after a car with priority had eased 0.02–0.20 m/s for
  // them (not billed, not commended — and praised aloud).

  /** Up to the ring's edge at 5 км/ч and stand there, nose on the ring; `over` says what the car does. */
  function noseIn(car: StubCar, over: (car: StubCar, f: Frame, framesOn: number) => void, frames = 240): Result {
    let on = 0;
    return drive(upAndDown([[NOSE_IN_Y, 5, frames]]), (f) => {
      if (f.noseOnRing) on++;
      over(car, f, on);
      return ringReport(CENTRE, [car]);
    });
  }
  const firstOn = (r: Result): number => r.frames.findIndex((f) => f.noseOnRing);
  /** Set from frame `at` to the last frame of the drive, and on none before it. */
  function expectPaidFrom(r: Result, at: number, why: string): void {
    expect(at, why).toBeGreaterThan(0);
    expect(r.frames.slice(0, at).some((f) => f.entryPaid), `${why}: before`).toBe(false);
    expect(r.frames.slice(at).every((f) => f.entryPaid), `${why}: from then on`).toBe(true);
    expect(r.frames.length - at, why).toBeGreaterThan(30);
  }

  it("never set on an entry nobody pays for: a car of the set that goes by his mouth unbraked, the car he let go by, an empty ring", () => {
    const car = carWithRun(5, { radiusM: 14.5 });
    let everOn = false;
    const goesBy = drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && car.azDeg > 80) car.azDeg -= 0.6;
      return ringReport(CENTRE, [car]);
    });
    expect(rearPast(car)).toBe(true);
    const letBy = noseIn(carWithRun(-8, { radiusM: 14.5 }), () => undefined);
    const empty = drive(entry({ kmh: 5, fromY: -27, ringDeg: 20, leave: false }), () => NO_RING);
    for (const [name, r] of [["goes by", goesBy], ["let by", letBy], ["empty", empty]] as const) {
      expect(r.frames.some((f) => f.noseOnRing), name).toBe(true);
      expect(r.frames.some((f) => f.entryPaid), name).toBe(false);
      expect(r.bills, name).toBe(0);
    }
  });

  it("A SUB-THRESHOLD EASING SETS IT: one frame of trimming (0.03 m/s) by a car of the set, before it has cleared his mouth — set from that frame to the end of the visit, and nothing is billed", () => {
    const r = noseIn(carWithRun(30), (car, _f, on) => {
      if (on === 20) car.shedMps += TICK;
    });
    expect(r.bills).toBe(0);
    expectPaidFrom(r, firstOn(r) + 19, "one tick of easing");
  });

  it("…«any» is the commendation's «any»: a millionth of that tick is floating-point dust and sets nothing", () => {
    const eased = (mps: number): Result =>
      noseIn(carWithRun(30), (car, _f, on) => {
        if (on === 20) car.shedMps += mps;
      });
    expect(eased(2e-6).frames.some((f) => f.entryPaid)).toBe(true);
    expect(eased(5e-7).frames.some((f) => f.entryPaid)).toBe(false);
  });

  it("NOT BEFORE HE ENTERS: whatever a car sheds while his nose is still off the ring is nobody's entry", () => {
    const car = carWithRun(30);
    const r = drive(
      upAndDown([
        [NOSE_OUT_Y, 5, 60],
        [NOSE_IN_Y, 5, 120],
      ]),
      (f) => {
        if (!f.noseOnRing) car.shedMps += TICK; // a metre a second and more, all of it before the entry
        return ringReport(CENTRE, [car]);
      },
    );
    expect(car.shedMps).toBeGreaterThan(1);
    expect(r.frames.some((f) => f.noseOnRing)).toBe(true);
    expect(r.frames.some((f) => f.entryPaid)).toBe(false);
  });

  it("THE CAR HE LET GO BY: its trimming under 0.3 m/s behind him does not set it (its priority was not his to take) — but braking the full 0.3 m/s for him with his nose on the ring does, from that frame", () => {
    const braking = (ticks: number): Result =>
      noseIn(carWithRun(-8, { radiusM: 14.5 }), (car, _f, on) => {
        if (on >= 20 && on < 20 + ticks) car.shedMps += TICK;
      });
    const trimmed = braking(9); // 0.28125
    expect(trimmed.frames.some((f) => f.entryPaid)).toBe(false);
    const braked = braking(10); // 0.3125 — the tenth tick lands on frame 29 of the entry
    expect(braked.bills).toBe(0); // not this fault: it had passed his mouth
    expectPaidFrom(braked, firstOn(braked) + 28, "the car he let by braking");
  });

  it("A TOUCH SETS IT, whoever the car is: running into the back of the car he let go by is not billed here — and is not an entry to call good", () => {
    const car = carWithRun(-6);
    let touchFrame: Frame | null = null;
    const r = drive(entry({ kmh: 15, leave: false, ringDeg: 75 }), (f) => {
      const a = (car.azDeg * Math.PI) / 180;
      if (touchFrame === null && Math.hypot(f.x - RING_R * Math.sin(a), f.y - RING_R * Math.cos(a)) < PLAYER_HALF_LENGTH_M + CAR_HALF_M - 0.3) {
        touchFrame = f;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(touchFrame).not.toBeNull();
    const touchedAt = r.frames.indexOf(touchFrame!);
    expect(touchedAt).toBeGreaterThan(0);
    expect(r.bills).toBe(0);
    // Set no later than the frame his nose is 0.3 m into its tail, never before his nose is on the ring, and from then on.
    const at = r.frames.findIndex((f) => f.entryPaid);
    expect(at).toBeGreaterThanOrEqual(firstOn(r));
    expect(at).toBeLessThanOrEqual(touchedAt);
    expect(r.frames.slice(at).every((f) => f.entryPaid)).toBe(true);
  });

  it("A CONVICTED ENTRY IS A PAID-FOR ENTRY: the frame the bill lands on, and after", () => {
    const r = noseIn(carWithRun(30), (car, _f, on) => {
      if (on >= 20) car.shedMps += TICK;
    });
    expect(r.bills).toBe(1);
    expect(r.billed!.entryPaid).toBe(true);
    expectPaidFrom(r, firstOn(r) + 19, "braking from frame 20");
  });

  it("IT IS THE COMMENDATION'S OWN REFUSAL — one expression, two readers: over every yield drive below, «commended» and «paid for» never meet, and each drive that honestly yields and is refused the praise is refused it as paid for", () => {
    // The honest yield of «THE COMMENDATION» (stop on the line, a car goes by,
    // enter), with a second car still upstream of his mouth that eases by `mps`
    // in all once his nose is on the ring.
    const yielded = (mps: number): Result => {
      const car: StubCar = { id: 1000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
      const other: StubCar = { id: 1001, azDeg: MOUTH_AZ + 60, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
      let given = 0;
      return drive(
        entry({ kmh: 12, fromY: -45, ringDeg: 100, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
        (f) => {
          if (f.speedKmh === 0 && !f.noseOnRing && car.azDeg > 20) {
            car.azDeg -= 0.6;
            if (car.azDeg < 160) {
              car.approaching = false;
              car.pastEntry = true;
            }
          }
          if (f.noseOnRing && given < mps) {
            other.shedMps += Math.min(TICK, mps - given);
            given += TICK;
          }
          return ringReport(CENTRE, [car, other], car.approaching === true);
        },
      );
    };
    const clean = yielded(0);
    expect(clean.commended).toBe(true);
    expect(clean.frames.some((f) => f.entryPaid)).toBe(false);
    for (const mps of [TICK, 3 * TICK, 9 * TICK]) {
      const r = yielded(mps);
      expect(r.bills, `${mps} m/s`).toBe(0);
      expect(r.commended, `${mps} m/s`).toBe(false);
      expect(r.frames.some((f) => f.entryPaid), `${mps} m/s`).toBe(true);
    }
    const billed = yielded(12 * TICK);
    expect(billed.bills).toBe(1);
    expect(billed.commended).toBe(false);
    expect(billed.frames.some((f) => f.entryPaid)).toBe(true);
  });

  it("A NEW VISIT STARTS UNPAID: he leaves the roundabout's vicinity after an easing and comes back to a quiet ring — absent for the whole second visit", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    const car = carWithRun(30, { radiusM: 14.5 });
    let ease = true;
    const visit = (): Result => {
      let on = 0;
      return drive(
        entry({ kmh: 12 }),
        (f) => {
          if (f.noseOnRing) on++;
          if (ease && on === 5) car.shedMps += TICK;
          return ringReport(CENTRE, [car]);
        },
        rt,
      );
    };
    const first = visit();
    expect(first.bills).toBe(0);
    expect(first.frames.some((f) => f.entryPaid)).toBe(true);
    // …and it is gone again once he is out of the roundabout's vicinity.
    expect(first.frames[first.frames.length - 1].entryPaid).toBe(false);
    ease = false;
    const second = visit();
    expect(second.frames.some((f) => f.noseOnRing)).toBe(true);
    expect(second.frames.some((f) => f.entryPaid)).toBe(false);
  });

  it("MEASUREMENT ONLY — nothing graded reads it: written by the runtime, declared on the tick, read by the lesson engine's hand-off to the instructor's voice, and by nothing else", () => {
    const SRC = path.resolve(HERE, "../../../..");
    const naming = (needle: string): string[] => {
      const hits: string[] = [];
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === "__tests__" || e.name === "node_modules") continue;
            walk(full);
          } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            if (readFileSync(full, "utf-8").includes(needle)) hits.push(path.relative(SRC, full).replace(/\\/g, "/"));
          }
        }
      };
      walk(SRC);
      return hits.sort();
    };
    expect(naming("roundaboutEntryPaidFor")).toEqual([
      "modules/sim/lessons/advisor.ts", // doc comments only — it takes the fact as `ringEntryPaidFor`
      "modules/sim/lessons/engine.ts",
      "modules/sim/rules/types.ts",
      "modules/sim/runtime/worldRuntime.ts",
    ]);
    expect(naming("ringEntryPaidFor")).toEqual(["modules/sim/lessons/advisor.ts", "modules/sim/lessons/engine.ts"]);
  });
});

describe("ROUND 5 — THE SET STAYS OPEN WHILE HE OCCUPIES HIS MOUTH (verifier R4-V2: the nose-poke barge)", () => {
  // Round 4 fixed the priority set on the frame his nose first came onto the
  // ring. So a driver who stopped with his nose a hand's width over the ring's
  // edge had «entered» against whoever was there THEN — and could wait for the
  // car that had just gone by to come round, pull out in front of it and make
  // it brake to a stop: codes [], 0 т., passed. THE RULE: from the entry frame
  // until HIS OWN rear end has passed the mouth (he has left it and is
  // circulating), or his nose is back off the ring, every circulating car that
  // is, or comes, short of the mouth belongs to the set — from the frame it
  // qualifies, its account from that frame. Once he has left his mouth the set
  // takes no new member.

  /** Centre position on the arm with the nose 0.15 m over the ring's edge (the verifier's act rested at 0.14 m). */
  const POKE_Y = -23.55;
  /** Degrees a stub car is upstream of the standard mouth, in [0, 360): under 180 it is still coming, over it it has gone by. */
  const upstreamDeg = (car: StubCar): number => (((car.azDeg - MOUTH_AZ) % 360) + 360) % 360;
  /**
   * Up the arm, STOP with the nose just over the edge for `holdSec`, then pull
   * out at `kmh` and go `ringDeg` round the ring.
   */
  const pokeThenGo = (holdSec: number, kmh = 12, ringDeg = 40) =>
    entry({ kmh, fromY: -27, ringDeg, leave: false, holds: [{ when: (_x, y) => y >= POKE_Y, sec: holdSec }] });
  /** Frames from the first frame his nose is on the ring. */
  const firstOn = (r: Result): number => r.frames.findIndex((f) => f.noseOnRing);
  /** He is standing in his mouth: nose on the ring, at rest. */
  const resting = (f: Frame): boolean => f.noseOnRing && f.speedKmh === 0;

  it("the pose: at rest his nose is 0.15–0.2 m onto the carriageway and his rear end 4 m short of the mouth", () => {
    const r = drive(pokeThenGo(1), () => NO_RING);
    const rest = r.frames.find(resting)!;
    const nose = Math.hypot(rest.x, rest.y + PLAYER_HALF_LENGTH_M);
    expect(RING_EDGE_M - nose).toBeGreaterThan(0.1);
    expect(RING_EDGE_M - nose).toBeLessThan(0.25);
    expect(rest.pastMouthM).toBeLessThan(0);
    // …and the drive does go on to leave the mouth.
    expect(r.frames[r.frames.length - 1].pastMouthM).toBeGreaterThan(PLAYER_HALF_LENGTH_M + 1);
  });

  it("THE NOSE-POKE BARGE: he noses over the edge behind a car that has just gone by, waits while it drives the lap, and pulls out in front of it as it comes back — it has to brake before the mouth: billed, as he pulls out", () => {
    // Round 4: the car had passed his mouth on the entry frame, so it was never
    // in the set — «codes [], 0 т., passed».
    const car = carWithRun(-8, { radiusM: 14.5 }); // its rear end 6 m past the mouth when his nose comes on
    let everOn = false;
    let pulledOutAt: Frame | null = null;
    let rested = false;
    let wasPastAtEntry: boolean | null = null;
    const r = drive(pokeThenGo(6), (f) => {
      if (f.noseOnRing && !everOn) {
        everOn = true;
        wasPastAtEntry = rearPast(car);
      }
      // Round the ring at ~18 m/s of its lane, to 40° short of his mouth.
      if (everOn && car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
      if (resting(f)) rested = true;
      if (pulledOutAt === null && rested && f.speedKmh > 0) pulledOutAt = f;
      if (pulledOutAt !== null) car.shedMps += TICK; // it brakes for him from the frame he moves off
      return ringReport(CENTRE, [car]);
    });
    expect(wasPastAtEntry).toBe(true);
    expect(pulledOutAt).not.toBeNull();
    expect(upstreamDeg(car)).toBeGreaterThan(38); // back upstream of the mouth, 40° short of it
    expect(upstreamDeg(car)).toBeLessThanOrEqual(40);
    expect(r.bills).toBe(1);
    expect(r.billed!.speedKmh).toBeGreaterThan(0);
    // The tenth tick of its braking (0.3125 m/s).
    expect(r.frames.indexOf(r.billed!) - r.frames.indexOf(pulledOutAt!)).toBe(9);
    // He was still in his mouth: his rear end had not passed it.
    expect(r.billed!.pastMouthM).toBeLessThan(PLAYER_HALF_LENGTH_M);
    expect(r.commended).toBe(false);
  });
  it("MOVING OR STANDING: the same returning car has to brake for the NOSE while he just stands there — billed, at rest", () => {
    const car = carWithRun(-8, { radiusM: 14.5 });
    let everOn = false;
    let backAt: Frame | null = null;
    const r = drive(pokeThenGo(8), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
      else if (everOn && resting(f)) {
        backAt ??= f;
        car.shedMps += TICK;
      }
      return ringReport(CENTRE, [car]);
    });
    expect(backAt).not.toBeNull();
    expect(r.bills).toBe(1);
    expect(r.billed!.speedKmh).toBe(0);
    expect(r.frames.indexOf(r.billed!) - r.frames.indexOf(backAt!)).toBe(9);
  });

  it("A NOSE RESTING ON THE EDGE THAT MAKES NOBODY BRAKE COSTS NOTHING, HOWEVER LONG: two cars go round past it lap after lap for 20 s and he then drives on behind them — no bill, nobody paid", () => {
    const a: StubCar = { id: 1000, azDeg: MOUTH_AZ + 100, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    const b: StubCar = { id: 1001, azDeg: MOUTH_AZ + 130, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let everOn = false;
    let laps = 0;
    const r = drive(pokeThenGo(20), (f) => {
      if (f.noseOnRing) everOn = true;
      if (everOn && resting(f)) {
        for (const c of [a, b]) {
          const before = upstreamDeg(c);
          c.azDeg -= 1.2;
          if (c === a && upstreamDeg(c) > before) laps++; // it crossed the mouth
        }
      }
      return ringReport(CENTRE, [a, b]);
    });
    expect(laps).toBeGreaterThanOrEqual(3);
    expect(r.frames.filter(resting).length).toBeGreaterThan(1100);
    expect(r.bills).toBe(0);
    expect(r.frames.some((f) => f.entryPaid)).toBe(false);
    // Open the whole time he sat there — never praise, never a bill.
    expect(r.frames.filter(resting).every((f) => f.entryOpen)).toBe(true);
  });

  it("…AND IT KEEPS NO CAR FROM BEING COUNTED LATER: after those laps he pulls out in front of the same car, which now has to brake — billed", () => {
    const a: StubCar = { id: 1000, azDeg: MOUTH_AZ + 100, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
    let everOn = false;
    let rested = false;
    let laps = 0;
    let braking = false;
    const r = drive(pokeThenGo(20), (f) => {
      if (f.noseOnRing) everOn = true;
      if (resting(f)) rested = true;
      if (everOn && resting(f)) {
        const before = upstreamDeg(a);
        // Laps, then waits 40° short of the mouth for him to move.
        if (laps < 3 || before > 40) a.azDeg -= 1.2;
        if (upstreamDeg(a) > before) laps++;
      }
      if (rested && f.speedKmh > 0) braking = true;
      if (braking) a.shedMps += TICK;
      return ringReport(CENTRE, [a]);
    });
    expect(laps).toBe(3);
    expect(upstreamDeg(a)).toBeLessThanOrEqual(40);
    expect(r.bills).toBe(1);
    expect(r.billed!.speedKmh).toBeGreaterThan(0);
  });

  describe("WHEN A CAR JOINS, AND WHAT ITS ACCOUNT HOLDS", () => {
    /**
     * He sits nosed in. A car whose rear end is 6 m past the mouth when he
     * enters drives the ring at 1.2° a frame and stops 40° short of the mouth;
     * `shed(car, frame, up)` says what it sheds on each frame (`up` = degrees
     * it is upstream of the mouth AFTER this frame's move).
     */
    function returning(shed: (car: StubCar, i: number, up: number, wasUp: number) => void, frames = 420): { r: Result; car: StubCar } {
      const car = carWithRun(-8, { radiusM: 14.5 });
      let i = 0;
      let everOn = false;
      const r = drive(upAndDown([[POKE_Y, 5, frames]]), (f) => {
        if (f.noseOnRing) everOn = true;
        if (everOn) {
          const wasUp = upstreamDeg(car);
          if (car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
          shed(car, i++, upstreamDeg(car), wasUp);
        }
        return ringReport(CENTRE, [car]);
      });
      return { r, car };
    }

    it("BOTH SIDES OF THE LINE IT JOINS AT — half a lap from the mouth, where «gone by» turns into «coming»: 0.3 m/s lost on its last frame still past is nobody's priority; on its first frame short of the mouth again, it is billed", () => {
      const lastPast = returning((car, _i, up, wasUp) => {
        // This frame it is still (just) less than half a lap past; its next step takes it over.
        if (up > 180 && up - 1.2 <= 180 && wasUp > 180) car.shedMps += 0.3;
      });
      expect(lastPast.car.shedMps).toBe(0.3);
      expect(lastPast.r.bills).toBe(0);
      const firstShort = returning((car, _i, up, wasUp) => {
        if (up <= 180 && wasUp > 180) car.shedMps += 0.3;
      });
      expect(firstShort.car.shedMps).toBe(0.3);
      expect(firstShort.r.bills).toBe(1);
    });

    it("ITS ACCOUNT RUNS FROM THE FRAME IT JOINS: 0.28 m/s lost to him while it was still the car he had let by, and 0.28 more once it is coming to his mouth again, is 0.28 against its priority — not billed; a tenth tick after it joined, and it is", () => {
      const run = (after: number): { r: Result; car: StubCar } => {
        let before = 0;
        let given = 0;
        return returning((car, _i, up) => {
          if (up > 180 && up < 300 && before < 9) {
            car.shedMps += TICK; // still «gone by»
            before++;
          }
          if (up < 100 && given < after) {
            car.shedMps += TICK; // a member now
            given++;
          }
        });
      };
      const under = run(9);
      expect(under.car.shedMps).toBe(18 * TICK); // 0.5625 m/s in all, 0.28 on each side of the join
      expect(under.r.bills).toBe(0);
      const over = run(10);
      expect(over.r.bills).toBe(1);
    });

    it("A MEMBER THAT HAS CLEARED AND COMES ROUND AGAIN WHILE HE STILL SITS THERE joins afresh: the 0.28 m/s it lost before clearing is not carried into its next time round", () => {
      // In the set from the entry frame (8 m short), eases 0.28 before it
      // clears; then the lap; then 0.28 again short of the mouth: two
      // sub-threshold easings on two separate passes. Not billed — and not an
      // entry to praise either (paid for).
      const run = (second: number): { r: Result; car: StubCar } => {
        const car = carWithRun(8, { radiusM: 14.5 });
        let everOn = false;
        let first = 0;
        let given = 0;
        let cleared = false;
        const r = drive(upAndDown([[POKE_Y, 5, 460]]), (f) => {
          if (f.noseOnRing) everOn = true;
          if (everOn) {
            if (first < 9) {
              car.shedMps += TICK;
              first++;
            } else if (car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
            if (rearPast(car) && upstreamDeg(car) > 180) cleared = true;
            if (cleared && upstreamDeg(car) < 100 && given < second) {
              car.shedMps += TICK;
              given++;
            }
          }
          return ringReport(CENTRE, [car]);
        });
        expect(cleared).toBe(true);
        return { r, car };
      };
      const under = run(9);
      expect(under.car.shedMps).toBe(18 * TICK);
      expect(under.r.bills).toBe(0);
      expect(under.r.frames.some((f) => f.entryPaid)).toBe(true);
      expect(run(10).r.bills).toBe(1);
    });

    for (const how of ["first reported", "from an arm", "heading inward"] as const) {
      it(`A CAR THAT COMES ONTO THE RING WHILE HE SITS IN HIS MOUTH (${how}) joins on the frame it is circulating short of the mouth — and braking for him from there is billed`, () => {
        const car: StubCar =
          how === "from an arm"
            ? { ...carWithRun(15), radiusM: RING_EDGE_M + 1 }
            : how === "heading inward"
              ? { ...carWithRun(15), heading: "inward" }
              : carWithRun(15, { shedMps: 40 }); // with 40 m/s of old account, too
        let on = 0;
        let joinedAt: Frame | null = null;
        const r = drive(upAndDown([[POKE_Y, 5, 200]]), (f) => {
          if (f.noseOnRing) on++;
          if (on <= 60) {
            // A second with his nose on the ring before it is there to be seen going round.
            if (how !== "first reported") car.shedMps += TICK; // whatever it sheds out there is not his entry's
            return how === "first reported" ? NO_RING : ringReport(CENTRE, [car]);
          }
          if (joinedAt === null) {
            joinedAt = f;
            car.radiusM = RING_R;
            car.heading = "ccw";
          } else car.shedMps += TICK;
          return ringReport(CENTRE, [car]);
        });
        expect(joinedAt).not.toBeNull();
        expect(r.bills).toBe(1);
        // Ten ticks after the frame it joined on (which itself carried none).
        expect(r.frames.indexOf(r.billed!) - r.frames.indexOf(joinedAt!)).toBe(10);
      });
    }
  });

  describe("WHEN THE SET CLOSES — he has left his mouth", () => {
    /**
     * He drives in at 5 км/ч (2.3 cm a frame) and on round. A car appears on
     * the ring 40° short of his mouth on the first frame `when(f)` holds, and
     * brakes for him from the next.
     */
    function appearing(when: (f: Frame) => boolean): { r: Result; at: Frame | null } {
      const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + 40, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
      let at: Frame | null = null;
      const r = drive(entry({ kmh: 5, fromY: -27, ringDeg: 25, leave: false }), (f) => {
        if (at === null) {
          if (!(f.noseOnRing && when(f))) return NO_RING;
          at = f;
        } else car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      });
      return { r, at };
    }

    it("BOTH SIDES OF THE LINE — his own REAR END past the mouth (his centre beyond it by half his length, along his own circle): a car that comes onto the ring 5 cm of his travel before that is in the set (billed); 5 cm after, it is not", () => {
      const before = appearing((f) => f.pastMouthM > PLAYER_HALF_LENGTH_M - 0.05);
      expect(before.at!.pastMouthM).toBeLessThan(PLAYER_HALF_LENGTH_M);
      expect(before.r.bills).toBe(1);
      const after = appearing((f) => f.pastMouthM > PLAYER_HALF_LENGTH_M + 0.05);
      expect(after.at!.pastMouthM).toBeLessThan(PLAYER_HALF_LENGTH_M + 0.1);
      expect(after.r.bills).toBe(0);
    });

    it("…it is HIS REAR END, not his centre and not his nose: with his centre level with the mouth, and a metre beyond it, he still occupies it", () => {
      for (const pastM of [0, 1, PLAYER_HALF_LENGTH_M - 0.3]) {
        const r = appearing((f) => f.pastMouthM > pastM);
        expect(r.r.bills, `centre ${pastM} m past`).toBe(1);
      }
    });

    it("ON THE FRAME HE HAS LEFT IT THE SET TAKES NO NEW MEMBER — and it stays closed: a car appearing on that very frame, or 10° of ring later, can brake for him and not be this fault", () => {
      let prev: Frame | null = null;
      const onTheFrame = appearing((f) => {
        const first = f.pastMouthM > PLAYER_HALF_LENGTH_M && prev !== null && prev.pastMouthM <= PLAYER_HALF_LENGTH_M;
        prev = f;
        return first;
      });
      expect(onTheFrame.at).not.toBeNull();
      expect(onTheFrame.r.bills).toBe(0);
      expect(appearing((f) => f.sweptDeg > 20).r.bills).toBe(0);
    });

    it("…OR HE HAS BACKED OFF THE RING: nose on, nose off again — a car that then comes onto the ring short of his mouth and brakes while he waits at the line is no entry's priority; when he comes on again it is in the NEW entry's set", () => {
      const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + 40, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
      let entries = 0;
      let prevOn = false;
      let offShed = 0;
      const r = drive(
        upAndDown([
          [POKE_Y, 5, 30],
          [NOSE_OUT_Y, 5, 120],
          [POKE_Y, 5, 60],
        ]),
        (f) => {
          if (f.noseOnRing && !prevOn) entries++;
          prevOn = f.noseOnRing;
          // Only there once his nose is back off the ring after the first entry.
          if (entries < 1 || (entries === 1 && f.noseOnRing)) return NO_RING;
          if (entries === 1 && offShed < 20) {
            car.shedMps += TICK; // 0.6 m/s while he stands off the ring
            offShed++;
          }
          if (entries === 2) car.shedMps += TICK;
          return ringReport(CENTRE, [car]);
        },
      );
      expect(entries).toBe(2);
      expect(offShed).toBe(20);
      expect(r.bills).toBe(1);
      // Billed in the second entry, on its tenth tick — the 0.6 m/s before it is not carried in.
      const second = r.frames.findIndex((f, i) => f.noseOnRing && i > 0 && !r.frames[i - 1].noseOnRing && r.frames.slice(0, i).some((g) => g.noseOnRing));
      expect(r.frames.indexOf(r.billed!) - second).toBe(9);
    });

    it("…and with no second entry that braking is billed to nobody: he backed off, the set is closed", () => {
      const car: StubCar = { id: 1000, azDeg: MOUTH_AZ + 40, radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
      let everOn = false;
      const r = drive(
        upAndDown([
          [POKE_Y, 5, 30],
          [NOSE_OUT_Y, 5, 200],
        ]),
        (f) => {
          if (f.noseOnRing) everOn = true;
          if (!everOn || f.noseOnRing) return NO_RING;
          car.shedMps += TICK;
          return ringReport(CENTRE, [car]);
        },
      );
      expect(car.shedMps).toBeGreaterThan(5);
      expect(r.bills).toBe(0);
      // Nothing is waiting on him once he is off the ring with no member left.
      expect(r.frames[r.frames.length - 1].entryOpen).toBe(false);
    });
  });

  describe("LATE JOINERS AND THE PRAISE — «…и продължи, когато беше безопасно» is about every car of the set", () => {
    /**
     * The honest yield with a pause in the mouth: stop on the line while a car
     * comes round and goes by, nose over the edge and STAND there 5 s while it
     * drives the lap, then go. `late(car, f)` says what the returning car does.
     */
    function yieldThenPoke(late: (car: StubCar, f: Frame, up: number) => void): Result {
      const car: StubCar = { id: 1000, azDeg: 215, radiusM: 14.5, speedMps: 2.9, shedMps: 0, approaching: true };
      let everOn = false;
      return drive(
        entry({
          kmh: 12,
          fromY: -45,
          ringDeg: 100,
          holds: [
            { when: (_x, y) => y >= -27.5, sec: 2 },
            { when: (_x, y) => y >= POKE_Y, sec: 5 },
          ],
        }),
        (f) => {
          if (f.noseOnRing) everOn = true;
          if (f.speedKmh === 0 && !f.noseOnRing && car.azDeg > 150) {
            // It goes by his mouth while he stands on the line…
            car.azDeg -= 0.6;
            if (car.azDeg < 160) {
              car.approaching = false;
              car.pastEntry = true;
            }
          } else if (everOn && car.azDeg > MOUTH_AZ + 60 - 360) {
            // …and drives the lap while he sits with his nose over the edge.
            car.azDeg -= 1.2;
          }
          if (everOn) late(car, f, upstreamDeg(car));
          return ringReport(CENTRE, [car], car.approaching === true);
        },
      );
    }

    it("THE CONTROL: the returning car never has to do anything about him — commended, not billed, nobody paid", () => {
      const r = yieldThenPoke(() => undefined);
      expect(r.bills).toBe(0);
      expect(r.commended).toBe(true);
      expect(r.frames.some((f) => f.entryPaid)).toBe(false);
    });

    it("A LATE JOINER THAT EASES — one tick, 0.03 m/s, short of his mouth after it has come round: not billed, NOT commended, and the entry is «paid for» from that frame (the voice line is dropped)", () => {
      let eased: Frame | null = null;
      const r = yieldThenPoke((car, f, up) => {
        if (eased === null && up < 90) {
          car.shedMps += TICK;
          eased = f;
        }
      });
      expect(eased).not.toBeNull();
      expect(r.bills).toBe(0);
      expect(r.commended).toBe(false);
      const at = r.frames.indexOf(eased!);
      expect(r.frames.slice(0, at).some((f) => f.entryPaid)).toBe(false);
      expect(r.frames[at].entryPaid).toBe(true);
    });

    it("…while the same tick lost on its way round, still «gone by» (more than half a lap from coming back), costs him nothing: commended", () => {
      let eased = false;
      const r = yieldThenPoke((car, _f, up) => {
        if (!eased && up > 200 && up < 300) {
          car.shedMps += TICK;
          eased = true;
        }
      });
      expect(eased).toBe(true);
      expect(r.bills).toBe(0);
      expect(r.commended).toBe(true);
      expect(r.frames.some((f) => f.entryPaid)).toBe(false);
    });

    it("…and a late joiner forced to brake is a bill, and no praise", () => {
      const r = yieldThenPoke((car, _f, up) => {
        if (up < 90) car.shedMps += TICK;
      });
      expect(r.bills).toBe(1);
      expect(r.commended).toBe(false);
    });
  });

  describe("SimTick.roundaboutEntryOpen with the set open", () => {
    it("EVERY BILL STILL LANDS INSIDE IT: a car that joins and loses 0.3 m/s on one and the same frame — the frame before, the entry was open because he was sitting in his mouth", () => {
      // Out on an arm (seen, not circulating) for his first second in the mouth;
      // then onto the ring 15 m short of it, braking 0.3 m/s as it comes.
      const car: StubCar = { ...carWithRun(15), radiusM: RING_EDGE_M + 1 };
      let on = 0;
      const r = drive(upAndDown([[POKE_Y, 5, 200]]), (f) => {
        if (f.noseOnRing) on++;
        if (on === 62) {
          car.radiusM = RING_R;
          car.shedMps += 0.3;
        }
        return ringReport(CENTRE, [car]);
      });
      expect(r.bills).toBe(1);
      const at = r.frames.indexOf(r.billed!);
      expect(at - firstOn(r)).toBe(61);
      expect(r.frames[at - 1].entryOpen).toBe(true);
      expect(r.frames.slice(firstOn(r), at).every((f) => f.entryOpen)).toBe(true);
      expect(r.frames.slice(at).some((f) => f.entryOpen)).toBe(false);
    });
  });
});

describe("ROUND 5 — the six details the verifier's mutants found unpinned (R4-V3)", () => {
  it("V1 — THE MOUTH IS WHERE HIS NOSE CROSSED THE EDGE, not where the frame happened to sample it: one 3 m step across the edge and thirty 10 cm steps along the same line make the same mouth — a car whose tail is 1 m past it is the car he let by, one whose tail is 1 m short of it is in the set", () => {
    // Along a line heading 60° (north-east) from just outside the edge due
    // south. The nose crosses the edge 0.1 m along it; 3 m along it the nose is
    // 2.2 m of ring further round. A mouth taken at the sampled nose would put
    // BOTH cars upstream of it.
    const H = 60;
    const hx = Math.sin((H * Math.PI) / 180);
    const hy = Math.cos((H * Math.PI) / 180);
    const N0 = { x: 0, y: -(RING_EDGE_M + 0.05) };
    const crossAz = 180 - (Math.atan2(0.1 * hx, RING_EDGE_M) * 180) / Math.PI; // compass azimuth of the crossing, ≈ 179.8°
    const poseAt = (alongM: number, kmh: number) => ({
      x: N0.x + alongM * hx - PLAYER_HALF_LENGTH_M * hx,
      y: N0.y + alongM * hy - PLAYER_HALF_LENGTH_M * hy,
      headingDeg: H,
      speedKmh: kmh,
    });
    const run = (steps: number, tailPastM: number): Result => {
      // A car on the ring's inner edge, its rear end `tailPastM` beyond the crossing (negative: short of it).
      const car: StubCar = { id: 1000, azDeg: crossAz - degOf(CAR_HALF_M + tailPastM, 14.5), radiusM: 14.5, speedMps: 2.9, shedMps: 0 };
      let on = 0;
      return drive(
        (i) => {
          if (i < 3) return poseAt(0, 0); // outside, standing
          if (i <= 3 + steps) return poseAt((3 * (i - 3)) / steps, 30);
          return i < 3 + steps + 40 ? poseAt(3, 0) : null; // then at rest, 3 m along
        },
        (f) => {
          if (f.noseOnRing) on++;
          if (on > 0) car.shedMps += TICK;
          return ringReport(CENTRE, [car]);
        },
      );
    };
    for (const steps of [1, 30]) {
      expect(run(steps, +1).bills, `${steps} step(s), tail 1 m past`).toBe(0);
      expect(run(steps, -1).bills, `${steps} step(s), tail 1 m short`).toBe(1);
    }
  });

  it("V2 — TAIL FIRST IS AN ENTRY TOO: he backs onto the ring, his centre on the carriageway and his nose still off it, ahead of a car that has to brake — billed", () => {
    const car = carWithRun(20);
    let y = -27;
    let centreOn: Frame | null = null;
    const r = drive(
      (i) => {
        if (i > 500) return null;
        if (y < -21) y += (5 / 3.6) * DT;
        // Pointing SOUTH (away from the ring), reversing north onto it.
        return { x: X_LANE, y, headingDeg: 180, speedKmh: y < -21 ? -5 : 0 };
      },
      (f) => {
        if (centreOn === null && Math.hypot(f.x, f.y) <= RING_EDGE_M) centreOn = f;
        if (centreOn !== null) car.shedMps += TICK;
        return ringReport(CENTRE, [car]);
      },
    );
    expect(centreOn).not.toBeNull();
    // His nose never came onto the ring: it is 2 m further out than his centre.
    const last = r.frames[r.frames.length - 1];
    expect(Math.hypot(last.x, last.y - PLAYER_HALF_LENGTH_M)).toBeGreaterThan(RING_EDGE_M);
    expect(r.bills).toBe(1);
    expect(r.frames.indexOf(r.billed!) - r.frames.indexOf(centreOn!)).toBe(9);
  });

  it("V4 — ONE CAR, ONE ACCOUNT, THE OTHER HALF: a car that had CLEARED the mouth of his first entry starts his second with nothing — the 0.28 m/s it lost before clearing is not carried in", () => {
    // In the set at the first entry, eases 0.28, goes by. He backs off the
    // ring before it is half a lap on (so it does not come back into the FIRST
    // entry's set), waits, and comes on again with it 40° short of his mouth.
    // Two ticks more — 0.06 m/s against the second entry. Not billed.
    const POKE_Y = -23.55;
    const upstreamDeg = (car: StubCar): number => (((car.azDeg - MOUTH_AZ) % 360) + 360) % 360;
    const run = (second: number): { r: Result; car: StubCar; clearedBeforeOff: boolean } => {
      const car = carWithRun(8, { radiusM: 14.5 });
      let entries = 0;
      let prevOn = false;
      let first = 0;
      let given = 0;
      let clearedBeforeOff = false;
      const r = drive(
        upAndDown([
          [POKE_Y, 5, 60],
          [NOSE_OUT_Y, 5, 260],
          [POKE_Y, 5, 80],
        ]),
        (f) => {
          if (f.noseOnRing && !prevOn) entries++;
          if (!f.noseOnRing && prevOn && entries === 1) clearedBeforeOff = rearPast(car) && upstreamDeg(car) > 180;
          prevOn = f.noseOnRing;
          if (entries >= 1) {
            if (first < 9) {
              car.shedMps += TICK;
              first++;
            } else if (car.azDeg > MOUTH_AZ + 40 - 360) car.azDeg -= 1.2;
          }
          if (entries === 2 && given < second) {
            car.shedMps += TICK;
            given++;
          }
          return ringReport(CENTRE, [car]);
        },
      );
      expect(entries).toBe(2);
      return { r, car, clearedBeforeOff };
    };
    const two = run(2);
    expect(two.clearedBeforeOff).toBe(true); // it had gone by, and was still «gone by», when his nose came off the ring
    expect(two.car.shedMps).toBe(11 * TICK);
    expect(upstreamDeg(two.car)).toBeLessThanOrEqual(40);
    expect(two.r.bills).toBe(0);
    // …and the second entry has its own full line to reach.
    expect(run(9).r.bills).toBe(0);
    expect(run(10).r.bills).toBe(1);
  });

  it("V8 — A NEW VISIT STARTS UNTOUCHED: he runs into the back of the car he let by, leaves the roundabout's vicinity and comes back to a quiet ring — not «paid for» on the second visit, and commended for an honest yield on it", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    // Visit 1: the car he let go by, 6 m past his mouth, standing — and he drives into it.
    const parked = carWithRun(-6);
    const first = drive(entry({ kmh: 15, ringDeg: 75 }), () => ringReport(CENTRE, [parked]), rt);
    expect(first.bills).toBe(0);
    expect(first.frames.some((f) => f.entryPaid)).toBe(true);
    expect(first.frames[first.frames.length - 1].entryPaid).toBe(false);
    // Visit 2: the honest yield — stop on the line, a car goes by, enter.
    const car: StubCar = { id: 2000, azDeg: 215, radiusM: RING_R, speedMps: 2.9, shedMps: 0, approaching: true };
    const second = drive(
      entry({ kmh: 12, fromY: -45, ringDeg: 100, holds: [{ when: (_x, y) => y >= -27.5, sec: 6 }] }),
      (f) => {
        if (f.speedKmh === 0 && !f.noseOnRing && car.azDeg > 20) {
          car.azDeg -= 0.6;
          if (car.azDeg < 160) {
            car.approaching = false;
            car.pastEntry = true;
          }
        }
        return ringReport(CENTRE, [car], car.approaching === true);
      },
      rt,
    );
    expect(second.frames.some((f) => f.noseOnRing)).toBe(true);
    expect(second.frames.some((f) => f.entryPaid)).toBe(false);
    expect(second.bills).toBe(0);
    expect(second.commended).toBe(true);
  });

  it("V12 — A CAR PUT DOWN ON THE RING HAS MADE NO ENTRY FOR ANYBODY TO PAY FOR: a spawn on the carriageway with a car braking hard behind it, and one it is standing against, is never «paid for»", () => {
    const braking = carBehind();
    let i = 0;
    const spawned = (cars: () => StubCar[]): Result => {
      i = 0;
      return drive(
        () => {
          if (i++ > 600) return null;
          const a = ((165 - i * 0.05) * Math.PI) / 180;
          return { x: RING_R * Math.sin(a), y: RING_R * Math.cos(a), headingDeg: (((165 - i * 0.05 - 90) % 360) + 360) % 360, speedKmh: 6 };
        },
        () => {
          braking.shedMps += TICK;
          return ringReport(CENTRE, cars());
        },
      );
    };
    const followed = spawned(() => [braking]);
    expect(braking.shedMps).toBeGreaterThan(10);
    expect(followed.bills).toBe(0);
    expect(followed.frames.some((f) => f.entryPaid)).toBe(false);
    expect(followed.frames.some((f) => f.entryOpen)).toBe(false);
    // …and a body it overlaps from the first frame (a respawn into traffic): a collision for the collision rule, not an entry.
    const overlapping: StubCar = { id: 3000, azDeg: 164, radiusM: RING_R, speedMps: 0, shedMps: 0 };
    const touched = spawned(() => [overlapping]);
    expect(touched.bills).toBe(0);
    expect(touched.frames.some((f) => f.entryPaid)).toBe(false);
  });
});

describe("THE WIRING CANNOT GO HALF-BLIND", () => {
  it("a runtime still wired to the old presence boolean refuses the frame at the roundabout — it does not watch an entry it could never convict", () => {
    // Every harness in the tree wired this query to `traffic.circulatingConflict`
    // (a boolean) until 2026-10-05. Left like that, the tracker would read
    // `true.vehicles`, find nothing, and bill nobody for ever, in silence.
    for (const legacy of [true, false]) {
      const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
      rt.setRightConflictQuery(() => false);
      rt.setCirculatingQuery((() => legacy) as never);
      // Far from any roundabout the query is not asked, and nothing is wrong…
      rt.update(DT);
      expect(() => rt.sample(sample(X_LANE, -93, 0, 20), DT, false)).not.toThrow();
      // …inside its watch zone it is, and the answer is not a report.
      rt.update(DT);
      expect(() => rt.sample(sample(X_LANE, -34, 0, 20), 2 * DT, false)).toThrow(/circulatingTraffic/);
    }
  });

  it("with no query installed at all the ring is simply empty: no bill, no praise, no throw", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    rt.setRightConflictQuery(() => false);
    let t = 0;
    const events: SimTickEvent[] = [];
    for (let y = -60; y < -10; y += 0.2) {
      t += DT;
      rt.update(DT);
      events.push(...(rt.sample(sample(X_LANE, y, 0, 20), t, false).events as SimTickEvent[]));
    }
    expect(events.filter((e) => e.kind === "prioritySituation" && e.situation === "roundabout")).toEqual([]);
  });
});

describe("a new visit is a new entry", () => {
  it("leaving the roundabout's vicinity re-arms the tracker: the second barge is billed again, on its own account", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    const car = carBehind();
    const once = () => {
      let everOn = false;
      let given = 0;
      return drive(
        entry({ kmh: 12 }),
        (f) => {
          if (f.noseOnRing) everOn = true;
          if (everOn && given < 12) {
            car.shedMps += TICK;
            given++;
          }
          return ringReport(CENTRE, [car]);
        },
        rt,
      );
    };
    expect(once().bills).toBe(1);
    expect(once().bills).toBe(1);
  });
});
