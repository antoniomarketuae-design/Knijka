/**
 * sim/collision — the PUBLIC SURFACE (module barrel, docs/architecture/05).
 *
 * Every other test in this directory reaches past the barrel (`../obb`,
 * `../probe`) because it is testing the geometry. This one tests the BARREL,
 * because the barrel is the only thing the rest of the product can see, and a
 * barrel can be wrong in two ways the geometry tests cannot catch:
 *
 *   1. IT CAN DRIFT. `probe.ts` gained `SWEEP_CHUNK_TRAVEL_M` and
 *      `SWEEP_FRAME_TRAVEL_M` when the subdivided sweep landed; `index.ts` was
 *      not updated, so the two numbers that decide whether a hitch frame is
 *      graded or DISCARDED were unreachable to the module that owns the clock.
 *      Nothing failed — a hand-maintained export list has no failure mode.
 *   2. IT CAN PUBLISH A BUDGET NOBODY CHECKS. `SWEEP_TELEPORT_M` was derived
 *      against the director's old `Math.min(delta, 0.1)` clamp and stayed at
 *      12 m after the clock started advancing by rapier-integrated world time
 *      on 2026-08-16 (lesson-ui/sessionClock.ts). The constant did not change;
 *      what a frame could contain did, and the exact geometry silently
 *      degraded to a single-pose sample on exactly the slow machines that
 *      needed it. The same thing can happen again to `SWEEP_FRAME_TRAVEL_M`,
 *      so the margin is asserted here against the clock that ships.
 *
 * Both directions are proved: a legal pass with a metre of daylight must NEVER
 * read as contact (the founder's own complaint is a FALSE FAILURE), and a real
 * head-on must ALWAYS read as one, at every tick the clock can hand over.
 */

import { describe, expect, it } from "vitest";

import * as bodies from "../bodies";
import * as barrel from "../index";
import * as obb from "../obb";
import * as probe from "../probe";

// ---------------------------------------------------------------------------
// The clock and the fleet, from the files that own them — so this test breaks
// when one of them moves rather than when someone edits a number here.
// ---------------------------------------------------------------------------

/** @react-three/rapier's own `clamp(dt, 0, 0.5)` — the longest interval one
 *  observed frame can carry since the 2026-08-16 clock change. */
const RAPIER_FRAME_CLAMP_SEC = 0.5;
/** Player terminal speed, m/s — tuning.ts's measured 168.4 km/h. */
const PLAYER_TERMINAL_MPS = 168.4 / 3.6;
/** Fastest authored staged-actor `cruiseSpeedMps` in the lesson bank. */
const FASTEST_ACTOR_MPS = 36;
/** Worst closing speed the sim can produce, m/s (obb.ts's own 82.8). */
const WORST_CLOSING_MPS = PLAYER_TERMINAL_MPS + FASTEST_ACTOR_MPS;

const TICKS = [1 / 60, 0.1, 0.25, RAPIER_FRAME_CLAMP_SEC];

/**
 * Two cars nose-to-nose down ONE lane, stepped at `dtSec`, driven through the
 * BARREL's probe until they have passed each other — the same drive
 * probe.test.ts runs, entered the way a consumer enters it.
 */
function headOn(
  dtSec: number,
  playerMps: number,
  actorMps: number,
): { contact: boolean; minSepM: number } {
  const p = new barrel.ContactProbe();
  let contact = false;
  let minSepM = Infinity;
  for (let i = 0; ; i++) {
    const t = i * dtSec;
    const py = -160 + playerMps * t;
    if (py > 160) break;
    const sep = p.vehicleSeparationM(
      "oncoming",
      barrel.playerObb(0, py, 0),
      barrel.actorObb({ x: 0, y: 160 - actorMps * t, dirX: 0, dirY: -1 }),
    );
    if (sep < minSepM) minSepM = sep;
    if (barrel.isContact(sep)) contact = true;
  }
  return { contact, minSepM };
}

/** The player drives north past a car parked `lateralM` to its right. */
function passBy(dtSec: number, kmh: number, lateralM: number): { contact: boolean; minSepM: number } {
  const v = kmh / 3.6;
  const p = new barrel.ContactProbe();
  const car = barrel.actorObb({ x: lateralM, y: 0, dirX: 0, dirY: 1 });
  let contact = false;
  let minSepM = Infinity;
  for (let i = 0; ; i++) {
    const py = -60 + v * dtSec * i;
    if (py > 60) break;
    const sep = p.vehicleSeparationM("kerb", barrel.playerObb(0, py, 0), car);
    if (sep < minSepM) minSepM = sep;
    if (barrel.isContact(sep)) contact = true;
  }
  return { contact, minSepM };
}

describe("sim/collision barrel — the surface consumers actually see", () => {
  it("re-exports every runtime symbol the module defines, and the same object", () => {
    // POLICY: this module has no internal-only exports. Everything obb/bodies/
    // probe export is a fact a consumer may need, and under docs/architecture/
    // 05 the barrel is the only place a consumer may read it from — so an
    // export missing here is a fact that exists and cannot be reached. The two
    // sweep budgets were exactly that for the whole of the subdivision wave.
    const missing: string[] = [];
    const stale: string[] = [];
    for (const [file, mod] of [
      ["obb.ts", obb],
      ["bodies.ts", bodies],
      ["probe.ts", probe],
    ] as const) {
      for (const key of Object.keys(mod)) {
        const seen = (barrel as Record<string, unknown>)[key];
        if (seen === undefined) missing.push(`${file}:${key}`);
        else if (seen !== (mod as Record<string, unknown>)[key]) stale.push(`${file}:${key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("re-exports the three body types (compile-time — erased at runtime)", () => {
    // `Obb2D`/`SweepPose`/`ActorPose` cannot be seen by the loop above, so tsc
    // carries this half: naming them through the barrel is the assertion.
    const box: barrel.Obb2D = barrel.playerObb(0, 0, 0);
    const pose: barrel.SweepPose = { x: 0, y: 0, headingDeg: 0 };
    const actor: barrel.ActorPose = { x: 0, y: 4.07, dirX: 0, dirY: 1 };
    expect(barrel.obbSeparationM(box, barrel.actorObb(actor))).toBeCloseTo(0, 6);
    expect(pose.headingDeg).toBe(0);
  });
});

describe("sim/collision barrel — the sweep budget against the clock that ships", () => {
  it("leaves the worst frame the clock can produce inside the discard threshold", () => {
    // 46.78 + 36 = 82.78 m/s of closing × rapier's 0.5 s clamp = 41.39 m in one
    // observed interval. `SWEEP_FRAME_TRAVEL_M` (60 m) is where ContactProbe
    // stops treating an interval as motion at all and falls back to the current
    // pose alone. If a future clock change puts a real frame past it, the
    // geometry blanks — which is precisely what happened to SWEEP_TELEPORT_M's
    // 12 m on 2026-08-16, silently, because nobody had written this line.
    const worstFrameTravelM = WORST_CLOSING_MPS * RAPIER_FRAME_CLAMP_SEC;
    expect(worstFrameTravelM).toBeCloseTo(41.39, 1);
    expect(worstFrameTravelM).toBeLessThan(barrel.SWEEP_FRAME_TRAVEL_M);
    // …and with margin, not by a hair: the same ~45 % headroom SWEEP_TELEPORT_M
    // was originally chosen with.
    expect(barrel.SWEEP_FRAME_TRAVEL_M / worstFrameTravelM).toBeGreaterThan(1.4);
    // A chunk must stay under obb.ts's own per-call cap or every subdivided
    // chunk would be rejected as a teleport by the call it is handed to.
    expect(barrel.SWEEP_CHUNK_TRAVEL_M).toBeLessThan(barrel.SWEEP_TELEPORT_M);
  });

  it("reports the worst-case head-on at the worst-case tick, through the barrel", () => {
    const run = headOn(RAPIER_FRAME_CLAMP_SEC, PLAYER_TERMINAL_MPS, FASTEST_ACTOR_MPS);
    expect(run.contact).toBe(true);
    expect(run.minSepM).toBeLessThan(0);
  });

  it("still blanks past the threshold — so the margin above is load-bearing", () => {
    // The negative control. An interval whose relative travel exceeds
    // SWEEP_FRAME_TRAVEL_M is not motion (a re-stage, a respawn, a gap in
    // observation) and ContactProbe deliberately falls back to the current pose
    // alone: sweeping it would drag a body through the player and INVENT a
    // crash, which is the false-failure direction. That fallback is real, and
    // it is why the first assertion in this block has to hold — measured here,
    // two cars driven through each other across ONE 70 m interval report clear
    // air rather than the crash they just had.
    const p = new barrel.ContactProbe();
    const first = p.vehicleSeparationM(
      "jump",
      barrel.playerObb(0, -35, 0),
      barrel.actorObb({ x: 0, y: 35, dirX: 0, dirY: -1 }),
    );
    expect(first).toBeGreaterThan(0); // 70 m apart: no contact yet
    const after = p.vehicleSeparationM(
      "jump",
      barrel.playerObb(0, 35, 0),
      barrel.actorObb({ x: 0, y: -35, dirX: 0, dirY: -1 }),
    );
    // 140 m of relative travel in one interval — far past the 60 m threshold.
    expect(after).toBeGreaterThan(0);
    expect(barrel.isContact(after)).toBe(false);
  });
});

describe("sim/collision barrel — both directions of the verdict", () => {
  // Flank-to-flank touch is PLAYER_HALF_WIDTH_M + car half-width =
  // 0.85 + 0.92 = 1.77 m of centre separation. The circle this module replaced
  // fired at 3.0 m and cost the founder a session for passing a parked car
  // with over a metre of daylight.
  const TOUCH_LATERAL_M = barrel.PLAYER_HALF_WIDTH_M + 1.84 / 2;

  it("never calls a metre of daylight a contact, at any tick", () => {
    for (const dt of TICKS) {
      const run = passBy(dt, 50, TOUCH_LATERAL_M + 1.0);
      expect(run.contact, `dt=${dt}`).toBe(false);
      expect(run.minSepM, `dt=${dt}`).toBeCloseTo(1.0, 6);
    }
  });

  it("calls a 17 cm side-swipe a contact, at every tick", () => {
    // The other direction, and the reason the test above may not simply be
    // loosened: 0.17 m INSIDE the flank is body-on-body, and a lesson that
    // credits it teaches a seventeen-year-old that it was clean.
    for (const dt of TICKS) {
      const run = passBy(dt, 50, TOUCH_LATERAL_M - 0.17);
      expect(run.contact, `dt=${dt}`).toBe(true);
      expect(run.minSepM, `dt=${dt}`).toBeCloseTo(-0.17, 6);
    }
  });
});
