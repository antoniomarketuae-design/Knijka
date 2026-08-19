/**
 * sim/collision — the PUBLIC SURFACE (module barrel, docs/architecture/05).
 *
 * Every other test in this directory reaches past the barrel (`../obb`,
 * `../probe`) because it is testing the geometry. This one tests the BARREL,
 * because the barrel is the only thing the rest of the product can see, and a
 * barrel can be wrong in three ways the geometry tests cannot catch:
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
 *   3. IT CAN GUARD A COPY OF THE CLOCK INSTEAD OF THE CLOCK — and that is what
 *      (2) actually did until 2026-08-19. BOTH live inputs of the budget were
 *      literals re-declared in this file: `RAPIER_FRAME_CLAMP_SEC = 0.5` next
 *      to the real `PHYSICS_MAX_FRAME_DT` in lesson-ui/sessionClock.ts, and
 *      `FASTEST_ACTOR_MPS = 36` next to 110 authored `cruiseSpeedMps` rows in
 *      the scenario bank. A guard written against copies cannot notice either
 *      input moving, which is failure (2) reproduced inside the test written to
 *      prevent it. Both are now READ from the files that own them, and the
 *      margin they produce is 3.8 % — not the ~45 % this file claimed. The
 *      missing term is named in the budget block below.
 *
 * Both directions are proved: a legal pass with a metre of daylight must NEVER
 * read as contact (the founder's own complaint is a FALSE FAILURE), and a real
 * head-on must ALWAYS read as one, at every tick the clock can hand over.
 */

import { describe, expect, it } from "vitest";

import { PHYSICS_MAX_FRAME_DT } from "@/components/sim/lesson-ui/sessionClock";

import * as bodies from "../bodies";
import * as barrel from "../index";
import * as obb from "../obb";
import * as probe from "../probe";
import { SCENARIO_TEMPLATES } from "../../lessons";
import { VEHICLE_PROFILE_LENGTH_M, type VehicleProfile } from "../../traffic/types";

// ---------------------------------------------------------------------------
// The clock and the fleet, READ from the files that own them — so this test
// breaks when one of them moves, which is the whole reason it exists. Nothing
// below is a number typed into this file except the player's terminal speed,
// which no module exports (see its note).
// ---------------------------------------------------------------------------

/**
 * Player terminal speed, m/s. The one input still written here as a literal: it
 * is a MEASURED rig result (vehicle/tuning.ts:268 — "terminal 168.4 km/h · 0–50
 * 3.85 s · 0–100 11.57 s"), an emergent property of the torque curve and the
 * drag term, not a constant any module exports. A tuning change that moves it
 * will not move this line; that is a known hole and it is the smaller one,
 * because the torque table is not edited by content authors and the clock and
 * the bank are.
 */
const PLAYER_TERMINAL_MPS = 168.4 / 3.6;

/**
 * Every staged actor the scenario bank can put in front of the player, as
 * (fleet profile → the fastest `cruiseSpeedMps` authored FOR THAT PROFILE).
 *
 * Walked out of `SCENARIO_TEMPLATES` rather than copied, because a copy is
 * exactly what this test was caught doing: `FASTEST_ACTOR_MPS = 36` was true
 * when it was typed and could not notice the bank growing past it. Pairing each
 * speed with its OWN profile matters — a 14 m tram and a 4.1 m car do not
 * contribute the same rotation term, and the fastest actor in the bank (36 m/s,
 * `sc-merge-motorway-exit`) is a car.
 */
function scanStagedActors(): {
  readonly fastestByProfile: ReadonlyMap<VehicleProfile, number>;
  readonly fastestMps: number;
  readonly rows: number;
} {
  const fastestByProfile = new Map<VehicleProfile, number>();
  let fastestMps = 0;
  let rows = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    const seen = new Set<unknown>();
    const stack: unknown[] = [spec];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === null || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      const rec = node as Record<string, unknown>;
      const mps = rec.cruiseSpeedMps;
      if (typeof mps === "number") {
        rows++;
        if (mps > fastestMps) fastestMps = mps;
        // `actorObb` reads the actor's own `profile`, absent = "car". An
        // UNKNOWN string must not be waved through as a car here, or a fleet
        // rename would shrink the budget's worst body in silence.
        const p = rec.profile;
        const profile: VehicleProfile =
          typeof p === "string" && p in VEHICLE_PROFILE_LENGTH_M ? (p as VehicleProfile) : "car";
        const cur = fastestByProfile.get(profile);
        if (cur === undefined || mps > cur) fastestByProfile.set(profile, mps);
      }
      for (const v of Object.values(rec)) if (v !== null && typeof v === "object") stack.push(v);
    }
  }
  return { fastestByProfile, fastestMps, rows };
}

const BANK = scanStagedActors();

/**
 * The most `relativeTravelM` (probe.ts / obb.ts) can return for ONE observed
 * interval of the player against one `profile` body, m.
 *
 * IT IS NOT JUST SPEED × dt. That was the arithmetic behind the "~45 %" this
 * file and probe.ts both published, and it omits the second half of the very
 * expression the probe compares against `SWEEP_FRAME_TRAVEL_M`:
 *
 *   relativeTravelM = |relative centre displacement| + spinA + spinB
 *   spin = headingSpanDeg(…) × DEG × hypot(halfLengthM, halfWidthM)
 *
 * `headingSpanDeg` is a SHORTEST arc, so it saturates at 180° — π radians — and
 * the spin term is therefore bounded, exactly, by π × hypot(half-extents) per
 * body. For the player that is 6.885 m before the other body is counted at all;
 * for a tram it is 22.286 m. Reaching the cap needs a half-turn inside one
 * interval, which for the player is a genuine spin-out on a 0.5 s frame and for
 * a tram is a heading discontinuity — a re-stage, which is precisely the case
 * the discard exists to serve. Either way it is what the code adds up, so it is
 * what the budget has to cover.
 */
function frameTravelCeilingM(profile: VehicleProfile, actorMps: number): number {
  const spinCeilM = (halfLengthM: number, halfWidthM: number) =>
    Math.PI * Math.hypot(halfLengthM, halfWidthM);
  const player = barrel.playerObb(0, 0, 0);
  const actor = barrel.actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 }, profile);
  return (
    (PLAYER_TERMINAL_MPS + actorMps) * PHYSICS_MAX_FRAME_DT +
    spinCeilM(player.halfLengthM, player.halfWidthM) +
    spinCeilM(actor.halfLengthM, actor.halfWidthM)
  );
}

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

/**
 * The player drives north past a car parked `lateralM` to its right.
 *
 * `poseOnlyMinSepM` is the verdict the SAME drive would have produced with no
 * sweep at all — the minimum of `obbSeparationM` over the poses the probe was
 * actually handed. It is what makes "at every tick" checkable instead of
 * decorative: when it is positive and `minSepM` is negative, the contact lies
 * strictly BETWEEN two observed frames and only subdivision could have found it.
 */
function passBy(
  dtSec: number,
  kmh: number,
  lateralM: number,
): { contact: boolean; minSepM: number; poseOnlyMinSepM: number; tickTravelM: number } {
  const v = kmh / 3.6;
  const p = new barrel.ContactProbe();
  const car = barrel.actorObb({ x: lateralM, y: 0, dirX: 0, dirY: 1 });
  let contact = false;
  let minSepM = Infinity;
  let poseOnlyMinSepM = Infinity;
  for (let i = 0; ; i++) {
    const py = -60 + v * dtSec * i;
    if (py > 60) break;
    const box = barrel.playerObb(0, py, 0);
    const poseOnly = barrel.obbSeparationM(box, car);
    if (poseOnly < poseOnlyMinSepM) poseOnlyMinSepM = poseOnly;
    const sep = p.vehicleSeparationM("kerb", box, car);
    if (sep < minSepM) minSepM = sep;
    if (barrel.isContact(sep)) contact = true;
  }
  // The parked car never moves and never turns, so one tick's relative travel
  // is the player's own step — the number `sweepChunks` branches on.
  return { contact, minSepM, poseOnlyMinSepM, tickTravelM: v * dtSec };
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
  it("reads the bank rather than a copy of it (self-check on the walk)", () => {
    // A traversal that quietly finds NOTHING reports a fastest actor of 0, an
    // unreachable ceiling and a green budget — the reassuring direction, which
    // is the direction every instrument bug in this project has failed in. Two
    // rows verified by eye pin the walk, as FLOORS so that legitimate authoring
    // can raise them and only a broken walk can drop below:
    //   · templates-merging2.ts:93 — sc-merge-motorway-exit's rear tailgater,
    //     `cruiseSpeedMps: 36` with no `profile`, i.e. the fleet "car";
    //   · templates-rail2 — sc-rx-tram-left, a `profile: "tram"` actor at 10.5.
    expect(BANK.rows, "authored cruiseSpeedMps rows found by the walk").toBeGreaterThanOrEqual(110);
    expect(BANK.fastestByProfile.get("car") ?? 0, "fastest authored car").toBeGreaterThanOrEqual(36);
    expect(BANK.fastestByProfile.get("tram") ?? 0, "fastest authored tram").toBeGreaterThanOrEqual(
      10.5,
    );
    expect(BANK.fastestMps).toBe(Math.max(...BANK.fastestByProfile.values()));
  });

  it("leaves the worst frame the clock can produce inside the discard threshold", () => {
    // `SWEEP_FRAME_TRAVEL_M` (60 m) is where ContactProbe stops treating an
    // interval as motion at all and falls back to the current pose alone. If a
    // clock change, a rig change or an authored speed puts a real frame past
    // it, the geometry blanks — which is precisely what happened to
    // SWEEP_TELEPORT_M's 12 m on 2026-08-16, silently, because nobody had
    // written this line.
    //
    // The translation half: 46.78 + 36 = 82.78 m/s of closing × rapier's 0.5 s
    // clamp = 41.39 m. That alone is what the "~45 % headroom" claim was
    // computed from, and it is not the quantity the probe compares — see
    // `frameTravelCeilingM`. MEASURED 2026-08-19, every profile the bank stages
    // paired with its OWN fastest authored speed:
    //
    //   profile        fastest   ceiling m   60 / ceiling
    //   car             36.0       55.333       1.084
    //   tram            10.5       57.810       1.038   ← the binding row
    //   emergency       24.0       51.669       1.161
    //   truck           18.0       51.643       1.162
    //   van              8.0       43.014       1.395
    //   childCyclist     2.6       33.987       1.765
    //
    // Note what the table costs: a tram authored at 12 m/s (43 km/h — an
    // ordinary number) lands on 58.81 m and eats the rest of the margin. That
    // is the honest state of this budget, and the reason overstating it 12× was
    // worth a lane of its own.
    const translationOnlyM = (PLAYER_TERMINAL_MPS + BANK.fastestMps) * PHYSICS_MAX_FRAME_DT;
    expect(translationOnlyM).toBeCloseTo(41.39, 1);

    const ceilings = [...BANK.fastestByProfile.entries()].map(([profile, mps]) => ({
      profile,
      ceilingM: frameTravelCeilingM(profile, mps),
    }));
    for (const row of ceilings) {
      expect(row.ceilingM, `${row.profile} frame ceiling`).toBeLessThan(barrel.SWEEP_FRAME_TRAVEL_M);
    }

    const worst = ceilings.reduce((a, b) => (b.ceilingM > a.ceilingM ? b : a));
    const headroom = barrel.SWEEP_FRAME_TRAVEL_M / worst.ceilingM;
    // …and with margin, not by a hair — 3.8 % today, on the tram row. The UPPER
    // bound is the half that keeps this correction from being undone: drop the
    // rotation term and the ratio jumps back to 1.4497, which is the "~45 %"
    // that was wrong.
    expect(headroom, `worst frame ceiling is ${worst.profile}`).toBeGreaterThan(1.03);
    expect(headroom, "45 % headroom would mean the rotation term went missing").toBeLessThan(1.1);

    // A chunk must stay under obb.ts's own per-call cap or every subdivided
    // chunk would be rejected as a teleport by the call it is handed to.
    expect(barrel.SWEEP_CHUNK_TRAVEL_M).toBeLessThan(barrel.SWEEP_TELEPORT_M);
  });

  it("reports the worst-case head-on at the worst-case tick, through the barrel", () => {
    const run = headOn(PHYSICS_MAX_FRAME_DT, PLAYER_TERMINAL_MPS, BANK.fastestMps);
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

  /**
   * The drives both directions are proved on.
   *
   * THE 50 km/h ROWS USED TO BE THE WHOLE LIST, AND "at every tick" WAS FALSE.
   * At 50 km/h even rapier's 0.5 s clamp is 6.94 m of relative travel against a
   * PARKED car — under `SWEEP_TELEPORT_M` (12 m) — so all four ticks took the
   * identical `chunks === 1` branch and the two tests below were four runs of
   * ONE code path. The subdividing branch, which is the entire reason
   * ContactProbe exists, was entered by neither. The last two rows enter it:
   * 90 km/h × 0.5 s = 12.50 m (3 chunks) and the player's own terminal speed
   * × 0.5 s = 23.39 m (4 chunks).
   */
  const DRIVES = [
    { dtSec: 1 / 60, kmh: 50 },
    { dtSec: 0.1, kmh: 50 },
    { dtSec: 0.25, kmh: 50 },
    { dtSec: PHYSICS_MAX_FRAME_DT, kmh: 50 },
    { dtSec: PHYSICS_MAX_FRAME_DT, kmh: 90 },
    { dtSec: PHYSICS_MAX_FRAME_DT, kmh: PLAYER_TERMINAL_MPS * 3.6 },
  ] as const;

  const label = (d: (typeof DRIVES)[number]) => `dt=${d.dtSec.toFixed(4)}s ${d.kmh.toFixed(1)}km/h`;

  it("actually exercises subdivision — otherwise both tests below are one branch", () => {
    // "At every tick" is only worth something if the ticks differ in the code
    // they run, so the split is asserted rather than assumed. This is also the
    // tripwire for the near-miss: 12.50 m clears SWEEP_TELEPORT_M by 4 %, so
    // raising that constant would silently drop the 90 km/h row back into the
    // single-call branch. It would fail here instead of going quiet.
    const chunksOf = (travelM: number) =>
      travelM > barrel.SWEEP_TELEPORT_M ? Math.ceil(travelM / barrel.SWEEP_CHUNK_TRAVEL_M) : 1;
    const chunks = DRIVES.map((d) =>
      chunksOf(passBy(d.dtSec, d.kmh, TOUCH_LATERAL_M + 1.0).tickTravelM),
    );
    expect(chunks).toEqual([1, 1, 1, 1, 3, 4]);
  });

  it("never calls a metre of daylight a contact, at any tick", () => {
    for (const d of DRIVES) {
      const run = passBy(d.dtSec, d.kmh, TOUCH_LATERAL_M + 1.0);
      expect(run.contact, label(d)).toBe(false);
      expect(run.minSepM, label(d)).toBeCloseTo(1.0, 6);
    }
  });

  it("calls a 17 cm side-swipe a contact, at every tick", () => {
    // The other direction, and the reason the test above may not simply be
    // loosened: 0.17 m INSIDE the flank is body-on-body, and a lesson that
    // credits it teaches a seventeen-year-old that it was clean.
    for (const d of DRIVES) {
      const run = passBy(d.dtSec, d.kmh, TOUCH_LATERAL_M - 0.17);
      expect(run.contact, label(d)).toBe(true);
      expect(run.minSepM, label(d)).toBeLessThanOrEqual(barrel.CONTACT_TOLERANCE_M);
      // The reported depth may be SHALLOWER than the full 0.17 m: the probe
      // short-circuits at the first sub-sample that is already contact, and on
      // a subdividing tick that sample is one 0.15 m step inside the flank
      // (measured: −0.143 m at terminal speed). It must never be DEEPER than
      // the real overlap, which would be a manufactured severity.
      expect(run.minSepM, label(d)).toBeGreaterThanOrEqual(-0.17 - 1e-9);
    }
  });

  it("finds a side-swipe that happens BETWEEN two frames — the false-certificate direction", () => {
    // The 0.5 s / terminal-speed row of the drive above, isolated so the point
    // is unmissable. MEASURED: the player crosses the parked car's flank inside
    // one 23.39 m interval, and NO observed pose in the whole drive is in
    // contact — the nearest is 6.097 m of clear air. Without subdivision the
    // grader hands that drive a clean pass.
    const run = passBy(PHYSICS_MAX_FRAME_DT, PLAYER_TERMINAL_MPS * 3.6, TOUCH_LATERAL_M - 0.17);
    expect(run.poseOnlyMinSepM).toBeCloseTo(6.097, 3);
    expect(run.contact).toBe(true);
    expect(run.minSepM).toBeLessThan(0);

    // …and the same interval through the BARE swept primitive, which is what
    // the probe degrades to if the subdivision is removed: obb.ts sees 23.39 m
    // of relative travel, calls it a teleport (> SWEEP_TELEPORT_M) and answers
    // from the current pose alone — 7.624 m of air, no contact. That is the
    // mutation, kept here as an assertion so it cannot be undone quietly.
    const halfFrameM = (PLAYER_TERMINAL_MPS * PHYSICS_MAX_FRAME_DT) / 2;
    const car = barrel.actorObb({ x: TOUCH_LATERAL_M - 0.17, y: 0, dirX: 0, dirY: 1 });
    const before = barrel.playerObb(0, -halfFrameM, 0);
    const now = barrel.playerObb(0, halfFrameM, 0);
    const bare = barrel.sweptObbSeparationM(
      { x: before.x, y: before.y, headingDeg: before.headingDeg },
      now,
      { x: car.x, y: car.y, headingDeg: car.headingDeg },
      car,
    );
    expect(bare).toBeCloseTo(7.624, 3);
    expect(barrel.isContact(bare)).toBe(false);

    const p = new barrel.ContactProbe();
    p.vehicleSeparationM("swipe", before, car);
    const swept = p.vehicleSeparationM("swipe", now, car);
    expect(barrel.isContact(swept)).toBe(true);
    expect(swept).toBeLessThan(0);
    expect(swept).toBeGreaterThanOrEqual(-0.17 - 1e-9);
  });
});
