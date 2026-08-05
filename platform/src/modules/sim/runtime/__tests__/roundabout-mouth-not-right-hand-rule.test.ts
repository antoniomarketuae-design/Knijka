import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District } from "..";
import type { VehicleSample } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";

/**
 * B15, THE THIRD SITE — „at the roundabout I wait at the give-way line, and the
 * instant the wheels turn I am convicted of Непропускане."
 *
 * Two mechanisms shipped for this row already (`RB_WITNESS_STOPPED_NEAR_M` in
 * the orchestrator, `CIRCULATING_REACH_M` in traffic) and a third landed in the
 * roundabout tracker itself (`rbCondSince` is now cleared while the driver is
 * stationary). His sequence was then driven on sc-roundabout-entry@L1 with the
 * drive rig — stop on the М8 paint at (4.06, −36.92), stand 60.4 s, pull away
 * — and it STILL convicted, 2.6 s after the wheels turned, at (4.06, −30.45).
 *
 * The conviction carries `detail`, and the detail says **"right-hand-rule"**.
 * Not "roundabout". It is the OTHER adjudicator, and nothing in this row's
 * history had looked at it, because both wear the same code (FAILED_TO_YIELD)
 * and the same Bulgarian title.
 *
 * WHY THE RIGHT-HAND-RULE TRACKER IS LIVE AT A ROUNDABOUT MOUTH
 * ---------------------------------------------------------------------------
 * `uncontrolledJunctions` = degree ≥ 3, not signalized, and not in
 * `guardedNodeIds` (the set of nodes that have a graded stop/give-way line).
 * `buildStopLines` opens its priority-sign heuristic with
 *
 *     if (incident.some((i) => index.edgeRt(i).edge.roundabout)) continue;
 *
 * — roundabout nodes are SKIPPED on purpose, because a ring mouth is not a
 * minor-meets-arterial junction. So rb-mini-v1's four mouths get no line, land
 * in no guarded set, and fall through into "equal junction, give way to the
 * right". The world builder meanwhile posts Б1 + Г12 on every one of those
 * approaches, so the student is shown a give-way sign and graded under the
 * rule for junctions that have none.
 *
 * That is a category error in law, not a threshold to tune. Наредба
 * № РД-02-21-1/23.11.2023 чл. 61, ал. 5 forbids Б3 at a roundabout entry, so
 * ал. 2 puts Б1/Б2 there, and ЗДвП чл. 50, ал. 1 makes the duty „пропусни
 * движещите се по пътя с предимство" — the ring, which in a CCW roundabout is
 * on your LEFT. The right-hand rule (чл. 47) governs equal junctions and says
 * the opposite thing. The card the founder was shown even prints the wrong one:
 * „На кръстовище без светофар пропускаш идващите отдясно."
 *
 * The roundabout tracker (worldRuntime §4c) already adjudicates these mouths
 * correctly and keeps every guard-rail it has. This battery pins that the
 * right-hand-rule tracker stays OFF them, and — the other half, because
 * silencing a detector is not a fix — that the roundabout tracker still
 * convicts a driver who barges in.
 */

/** The big city district — a plain uncontrolled crossroads lives here. */
function loadDistrictV1(): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", "district-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "district-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return parseDistrict(JSON.parse(fs.readFileSync(file, "utf-8")));
  }
  throw new Error(`district-v1.json not found in: ${candidates.join(", ")}`);
}

function loadRbMini(): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", "rb-mini-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "rb-mini-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return parseDistrict(JSON.parse(fs.readFileSync(file, "utf-8")));
  }
  throw new Error(`rb-mini-v1.json not found in: ${candidates.join(", ")}`);
}

const DT = 0.05;
/** Where the founder stops: the М8 give-way paint on the south arm, measured
 *  off his own drive (drive-rig b15D, x = laneCenterRightM). */
const STOP = { x: 4.06, y: -36.92 };
/** The south mouth node — 18.9 m from his stop, inside RHR_CORE_RADIUS_M (18)
 *  only once he has moved ~1.4 m forward. */
const MOUTH = { x: 0, y: -18 };

function mkSample(x: number, y: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg: 0, // north, up the south arm, into the ring
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

interface Run {
  /** Seconds after the wheels first turned that a FAILED_TO_YIELD fired. */
  convictedAfterSec: number | null;
  /** Which adjudicator produced it. */
  situation: string | null;
  /** Where it fired. */
  y: number | null;
}

/**
 * His sequence: approach done, stand on the paint for `waitSec` with a car
 * permanently visible to the RIGHT of the mouth (a circulator that has just
 * crossed in front of him and is leaving up the east arc — the commonest thing
 * a waiting driver sees), then pull away into the ring.
 */
function waitThenEnter(waitSec: number, opts: { rightConflict?: boolean } = {}): Run {
  const rt = createWorldRuntime(loadRbMini());
  rt.setRightConflictQuery(() => opts.rightConflict ?? true);
  rt.setCirculatingQuery(() => false); // the RING itself is clear — his case

  let t = 0;
  for (let i = 0; i < Math.round(waitSec / DT); i += 1) {
    t += DT;
    rt.update(DT);
    rt.sample(mkSample(STOP.x, STOP.y, 0), t, false);
  }

  let convictedAfterSec: number | null = null;
  let situation: string | null = null;
  let firedY: number | null = null;
  let firstMovingT: number | null = null;
  let y = STOP.y;
  let speedKmh = 0;
  for (let i = 0; i < 120; i += 1) {
    t += DT;
    speedKmh = Math.min(20, speedKmh + 1.4 * 3.6 * DT); // ~1.4 m/s² to 20 km/h
    y += (speedKmh / 3.6) * DT;
    if (y > MOUTH.y) break; // reached the ring
    rt.update(DT);
    const tick = rt.sample(mkSample(STOP.x, y, speedKmh), t, false);
    if (speedKmh > 3 && firstMovingT === null) firstMovingT = t;
    for (const e of tick.events as SimTickEvent[]) {
      if (e.kind === "prioritySituation" && e.violated && convictedAfterSec === null) {
        convictedAfterSec = t - (firstMovingT ?? t);
        situation = e.situation;
        firedY = y;
      }
    }
  }
  return { convictedAfterSec, situation, y: firedY };
}

describe("B15 — a roundabout mouth is not an equal junction", () => {
  for (const waitSec of [4, 8, 40, 60]) {
    it(`no right-hand-rule conviction after standing ${waitSec} s on the give-way paint`, () => {
      const run = waitThenEnter(waitSec);
      expect(run.situation).not.toBe("right-hand-rule");
      expect(run.convictedAfterSec).toBeNull();
    });
  }

  it("waiting LONGER is never worse than waiting less (his sentence, word for word)", () => {
    const short = waitThenEnter(4).convictedAfterSec ?? Infinity;
    const long = waitThenEnter(60).convictedAfterSec ?? Infinity;
    expect(long).toBeGreaterThanOrEqual(short - DT);
  });

  /**
   * THE SAME SENTENCE AT AN ORDINARY CROSSROADS — the staleness half.
   *
   * `rhrCondSince` is stamped the first tick a right-conflict is visible and
   * was cleared only when the conflict went away, so a driver who did the
   * lawful thing and STOOD STILL banked his whole wait: after sixty seconds the
   * 0.9 s reaction window and the 3.0 s braking-response band were fifty-nine
   * seconds expired and the only live gate left was `speedKmh >
   * RHR_MOVING_KMH`. The identical repair shipped for `rbCondSince` one block
   * below; its twin was left here, where it reaches every unsignalized
   * crossroads in the city rather than just the rings. This is that fix's own
   * guard-rail, on a junction that is not a roundabout at all.
   */
  it("a wait at an ORDINARY uncontrolled junction still earns a reaction window", () => {
    const rt = createWorldRuntime(loadRbMini());
    const junction = rt
      .debugUncontrolledJunctions()
      .find((j) => !new Set(["rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"]).has(j.id));
    // rb-mini is all ring; use the city district for a plain crossroads.
    expect(junction).toBeUndefined();

    const city = createWorldRuntime(loadDistrictV1());
    const ringNodes = new Set(
      city.district.roads.edges.filter((e) => e.roundabout).flatMap((e) => [e.from, e.to]),
    );
    const plain = city.debugUncontrolledJunctions().find((j) => !ringNodes.has(j.id));
    expect(plain).toBeDefined();
    city.setRightConflictQuery(() => true);
    city.setCirculatingQuery(() => false);

    // Stand 60 s, 14 m south of the node (inside RHR_CORE_RADIUS_M = 18).
    let t = 0;
    const x = plain!.x;
    let y = plain!.y - 14;
    for (let i = 0; i < Math.round(60 / DT); i += 1) {
      t += DT;
      city.update(DT);
      city.sample(mkSample(x, y, 0), t, false);
    }
    let speedKmh = 0;
    let firstMovingT: number | null = null;
    let convictedAfterSec: number | null = null;
    for (let i = 0; i < 60; i += 1) {
      t += DT;
      speedKmh = Math.min(20, speedKmh + 1.4 * 3.6 * DT);
      y += (speedKmh / 3.6) * DT;
      city.update(DT);
      const tick = city.sample(mkSample(x, y, speedKmh), t, false);
      if (speedKmh > 3 && firstMovingT === null) firstMovingT = t;
      for (const e of tick.events as SimTickEvent[]) {
        if (
          e.kind === "prioritySituation" &&
          e.situation === "right-hand-rule" &&
          e.violated &&
          convictedAfterSec === null
        ) {
          convictedAfterSec = t - (firstMovingT ?? t);
        }
      }
    }
    // Convicted or not, it must never land on the tick the wheels turn.
    if (convictedAfterSec !== null) {
      expect(convictedAfterSec).toBeGreaterThanOrEqual(0.9 - DT);
    }
  });

  it("the ring's OWN priority still convicts a barging entry (not an amnesty)", () => {
    // Same mouth, same driver, but now a car really is circulating on his left
    // and he drives in anyway. The roundabout tracker must still bill it.
    const rt = createWorldRuntime(loadRbMini());
    rt.setRightConflictQuery(() => false);
    rt.setCirculatingQuery(() => true);
    let t = 0;
    let y = -40;
    let convicted: string | null = null;
    for (let i = 0; i < 400 && y < MOUTH.y; i += 1) {
      t += DT;
      y += (20 / 3.6) * DT; // a steady 20 km/h barge
      rt.update(DT);
      const tick = rt.sample(mkSample(STOP.x, y, 20), t, false);
      for (const e of tick.events as SimTickEvent[]) {
        if (e.kind === "prioritySituation" && e.violated) convicted ??= e.situation;
      }
    }
    expect(convicted).toBe("roundabout");
  });
});
