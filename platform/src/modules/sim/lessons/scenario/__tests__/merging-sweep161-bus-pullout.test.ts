/**
 * SWEEP 161 · sc-merge-bus-pullout — THE BUS HAS TO LEAVE THE СПИРКА AT THE
 * PACE THE DRILL ITSELF ASKS FOR.
 *
 * The audit row this closes: „The lesson's event never happens: there is no
 * bus… Across arrival, ready, stopped, end and the menu frame no bus… appears"
 * (.audit-frames/sweep161/sc-merge-bus-pullout/pc-right/, both surfaces; both
 * right drives ran 10–15 км/ч and both ended 1 objective in). The rig was
 * there — it simply paced 30 m up the бус лента and never glided out, because
 * `CutInLeadCarRunner` gates the glide on
 * `(distToCut <= cutRadiusM || actorPastCutM > 0) && speedKmh >= minCutSpeedKmh`
 * and this template authored that floor at 18 км/ч, ABOVE its own
 * «намали… дръж под 30» objective and above ЗДвП чл. 67's «при необходимост
 * спри».
 *
 * THE STACK IS REAL, the encounter-battery mold verbatim: the committed
 * content/world district through `createTrafficSystem` (ambient zeroed, so the
 * bus is the only other road user) and the production runner. Only the PLAYER
 * is synthetic — a constant-speed approach up the general lane, which is what
 * „a student who eased to V" means.
 *
 * MUTATION (how to prove these are not decoration): put `minCutSpeedKmh` back to
 * 18 in templates-merging.ts and the first suite goes red on 8 / 12 / 15 / 17
 * км/ч with „the bus never left the бус лента"; the SECOND suite stays green,
 * which is the point of it — it is the assertion that refuses a fix by deletion.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CutInLeadCarSpec } from "../../../contracts";
import type { SimTickEvent } from "../../../rules";
import { CutInLeadCarRunner } from "../../../orchestrator/runners";
import type { DirectorInput } from "../../../orchestrator/types";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { SC_MERGE_BUS_PULLOUT } from "../templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DT = 1 / 30;
const MAX_FRAMES = 200 * 30;

/** mg-busstop-v1 meta.scenario — the L7 copy truth, re-pinned here on purpose. */
const DISTRICT_ID = "mg-busstop-v1";
const X_GENERAL = 4.0625; // the player's lane for his whole drive
const BAY_ARC_M = 140; // where the rig dwells (the spec's own hold offset)
const SPAWN_Y = 15; // mgb-spawn-start
/** One drawn lane on this map, m — the glide is exactly this, leftward. */
const LANE_PITCH_M = 8.125;
/** „It moved across" — half a lane of published lateral travel. */
const GLIDED_M = LANE_PITCH_M / 2;
/** runners.ts CUTIN_MIN_AHEAD_M: the glide may not start beside the door. */
const MIN_AHEAD_M = 6;

const BUS = (SC_MERGE_BUS_PULLOUT.staged ?? []).find(
  (s): s is CutInLeadCarSpec => s.kind === "cutInLeadCar",
)!;

function district(): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${DISTRICT_ID}.json`), "utf-8"),
  ) as TrafficDistrict;
}

interface BusProbe {
  /** Session time the rig had moved half a lane across, s; null = it never did. */
  glidedAtSec: number | null;
  /** Signed metres the rig was ahead of the player when the glide began. */
  aheadAtGlideM: number;
  /** The rig's own path arc at the moment it started across, m. */
  arcAtGlideM: number;
  /** Furthest the rig ever got from its hold arc, m. */
  maxArcTravelM: number;
}

/**
 * Drive the general lane north at a constant `kmh` from the authored spawn.
 * `kmh: 0` is the parked-at-spawn drive (the second suite's whole subject).
 */
function probeBus(kmh: number): BusProbe {
  const tr = createTrafficSystem(district(), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const runner = new CutInLeadCarRunner(BUS);
  // Fixed jitter draw: every probe replays bit-identically (battery convention).
  runner.stage(tr, () => 0.5, true);

  let py = SPAWN_Y;
  let t = 0;
  const out: SimTickEvent[] = [];
  const probe: BusProbe = {
    glidedAtSec: null,
    aheadAtGlideM: NaN,
    arcAtGlideM: NaN,
    maxArcTravelM: 0,
  };

  for (let i = 0; i < MAX_FRAMES; i++) {
    t += DT;
    py += (kmh / 3.6) * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: X_GENERAL, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: X_GENERAL,
      y: py,
      speedKmh: kmh,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    };
    runner.step(tr, input, out);
    const actor = tr.staged(BUS.id);
    if (!actor) continue;
    const travel = actor.s - BAY_ARC_M;
    if (travel > probe.maxArcTravelM) probe.maxArcTravelM = travel;
    if (probe.glidedAtSec === null && Math.abs(actor.lateralOffsetM ?? 0) >= GLIDED_M) {
      probe.glidedAtSec = t;
      probe.aheadAtGlideM = actor.y - py;
      probe.arcAtGlideM = actor.s;
    }
    // The player has run the whole 400 m street; nothing else can happen.
    if (py > 395) break;
  }
  return probe;
}

// ---------------------------------------------------------------------------
// 1. The event happens at the pace the briefing asks for
// ---------------------------------------------------------------------------

describe("sweep 161 · sc-merge-bus-pullout — the pull-out survives «намали»", () => {
  /**
   * The band is bracketed by the drill's own numbers, not by taste: 30 км/ч is
   * `sc-mgb-ease`'s cap AT the pull-out metre, so every speed at or under it is
   * a drive the objective chain rewards. 17 and below are the rows the audit
   * photographed and the rows the old floor refused.
   */
  const TAUGHT_BAND_KMH = [8, 12, 15, 17, 18, 25, 30] as const;
  /** Above the band — the drive the old floor was tuned for. It must not move. */
  const BRISK_KMH = [35, 45] as const;

  it("the template really does stage the bus (census guard)", () => {
    // Without this the suite below could pass vacuously off a renamed actor.
    expect(BUS.id).toBe("sc-mgb-bus");
    expect(BUS.cutShiftM).toBe(-LANE_PITCH_M);
    expect(BUS.actor.hold.offsetM).toBe(BAY_ARC_M);
  });

  for (const kmh of [...TAUGHT_BAND_KMH, ...BRISK_KMH]) {
    it(`at ${kmh} км/ч the rig leaves the бус лента and glides into the player's`, () => {
      const r = probeBus(kmh);
      expect(
        r.glidedAtSec,
        `the bus never left the бус лента at ${kmh} км/ч — it paced ${r.maxArcTravelM.toFixed(0)} m ` +
          `up the bay lane and the student arrived at an empty стоянка. ` +
          `minCutSpeedKmh is ${BUS.minCutSpeedKmh}; the drill's own ease gate caps this metre at 30 км/ч`,
      ).not.toBeNull();
      // …and it lands where it can be seen, not beside the door (the merge the
      // card is about happens in front of the windscreen).
      expect(
        r.aheadAtGlideM,
        `the glide started with the rig ${r.aheadAtGlideM.toFixed(1)} m ahead`,
      ).toBeGreaterThanOrEqual(MIN_AHEAD_M);
    });
  }

  it("the taught crawl and the brisk drive meet the SAME manoeuvre, not two lessons", () => {
    // Both ends of the band get the pull-out; only the clock differs, and it
    // differs the way arriving later does. (The row this pins is the audit's:
    // 10–15 км/ч used to get no manoeuvre at all, so „the same lesson at any
    // taught pace" was false rather than merely slower.)
    const slow = probeBus(12);
    const brisk = probeBus(45);
    expect(slow.glidedAtSec).not.toBeNull();
    expect(brisk.glidedAtSec).not.toBeNull();
    expect(slow.glidedAtSec!).toBeGreaterThan(brisk.glidedAtSec!);
  });
});

// ---------------------------------------------------------------------------
// 2. …and it is still an EVENT, not a gift — the opposite direction
// ---------------------------------------------------------------------------

describe("sweep 161 · sc-merge-bus-pullout — the floor still refuses a drive that is not one", () => {
  /**
   * THE ASSERTION WITH TEETH, and the reason the fix above is a lower floor and
   * not a looser trigger. „The bus never comes out" has an obvious cheap answer
   * — widen `cutRadiusM` until the glide fires from wherever the rig happens to
   * be — and that answer would replace a missing manoeuvre with a wrong one:
   * a bus that swings into the lane from the MIDDLE of the стоянка is not
   * «потегля от спирката», it is a rig teleporting sideways, and instruction 5
   * („докато носът му е още в спирката, задницата му вече е в твоята лента")
   * would be describing something the student never saw.
   *
   * MUTATION: `cutRadiusM: 4 → 40` in templates-merging.ts. Every row of the
   * first suite stays green — the bus does come out — and this one goes red
   * with the glide starting at arc ≈ 140, i.e. 36 m short of the bay's exit.
   */
  const BAY_EXIT_ARC_M = 176; // mg-busstop-v1 meta.scenario.busBayY.toY = the spec's cutAt
  /**
   * The authored `cutRadiusM`, WRITTEN OUT BY HAND rather than read off the
   * spec — the encounter-battery discipline (`dartFloorReleaseM`'s own note).
   * Reading `BUS.cutRadiusM` here would let the very mutation this test exists
   * to catch move the goalpost with it: widening the radius to 40 also widened
   * the tolerance to 40, and the assertion sailed through the defect. Measured
   * that way round first, so it is written down.
   */
  const GLIDE_ARC_TOL_M = 4;

  it("the glide starts AT the bay's exit, not from the middle of the стоянка", () => {
    for (const kmh of [8, 12, 30, 45]) {
      const r = probeBus(kmh);
      expect(r.glidedAtSec, `${kmh} км/ч: no glide to measure`).not.toBeNull();
      expect(
        r.arcAtGlideM,
        `${kmh} км/ч: the rig started across at arc ${r.arcAtGlideM.toFixed(1)} m — the bay's ` +
          `exit is ${BAY_EXIT_ARC_M} m and the authored cut radius is ${GLIDE_ARC_TOL_M}`,
      ).toBeGreaterThanOrEqual(BAY_EXIT_ARC_M - GLIDE_ARC_TOL_M);
    }
  });

  /**
   * The CONTROL, labelled as one rather than dressed up: no value of
   * `minCutSpeedKmh` can redden it, because the runner arms its pacing on
   * `input.speedKmh > 4` before the floor is ever consulted
   * (CutInLeadCarRunner.step, phase "armed"). It is here so that the lowering
   * above cannot later be read as „the floor stopped meaning anything" — a car
   * sitting at the spawn still gets no bus, and `sc-mgb-ease` still cannot be
   * ticked off an encounter that never occurred. It reddens on a fix by
   * DELETION: drop the actor's `hold` (or stage it with a plain cruise) and the
   * rig leaves the стоянка with nobody coming.
   */
  it("CONTROL — a car parked at the spawn gets no bus at all", () => {
    const r = probeBus(0);
    expect(r.glidedAtSec, "the bus pulled out for a car that never moved").toBeNull();
    expect(
      r.maxArcTravelM,
      `the rig crept ${r.maxArcTravelM.toFixed(2)} m out of the спирка with nobody coming`,
    ).toBeLessThan(0.5);
  });
});
