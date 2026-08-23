/**
 * THE ENCOUNTER CLOCK — `sc-rb-ped-exit`'s pedestrian must still be crossing
 * when the student gets to the pocket.
 *
 * `roundabout2-title-truth.test.ts` grades the three GATES: they measure what
 * their titles promise, on every rung. This file grades the thing the gates
 * cannot see — whether the drill's SUBJECT is present at the moment it is
 * about. A student can satisfy all three gates, pass 3★, and never once have
 * met a pedestrian, because completing «Спри в джоба между кръга и пътеката»
 * does not require anybody to be on the paint.
 *
 * WHY THIS DRILL, AND WHY NOW. The defect class is not hypothetical and it is
 * not new: it is `sc-zebra-approach`'s, diagnosed on
 * `PedestrianDartOutSpec.triggerEtaSec` (contracts.ts) after the founder
 * photographed the end state — «stopped at 0 км/ч in front of an empty zebra,
 * praised by the coach card for yielding to nobody». `triggerDistM` is METRES
 * and a walk is a CLOCK, so a raw distance gate makes the hazard a function of
 * how fast the student drove, and the slower he drives the less of it he gets.
 *
 * `sc-rb-ped-exit` is the worst geometry in the catalog for that, and it was
 * never opted in:
 *
 *  · every instruction in it asks for LESS speed — «намали преди входа», the
 *    ring's own turn-detector envelope, and an objective bar the world prints
 *    across the lane as «задачата иска ≤20»;
 *  · the taught act is the exact drive `encounter-battery.test.ts` calls „the
 *    founder's photograph": ease down, STOP SHORT of the paint, and wait;
 *  · and the stop is short by design — the pocket gate's own centre sits
 *    hypot(4.06, 4) = 5.70 m from the crossing, so the student never reaches
 *    the paint at all while the encounter is live.
 *
 * The shared battery (orchestrator/__tests__/encounter-battery.test.ts) owns
 * the DRIVEN proof — it runs the real `PedestrianDartOutRunner` against the
 * real district and measures where she is when the car arrives — but its ETA
 * SYNC suite is opt-in: it enumerates only specs that already author
 * `triggerEtaSec`. A spec that never authors one is silently exempt from the
 * only test that would have caught this. So the file that owns the dial owns
 * the assertion that it exists, and the arithmetic that says which value.
 *
 * Nothing here is a substring check. Every number is recomputed from the
 * spec's own authored fields, from the compiled gates, and from the committed
 * shadow recording, so neutralising a dial fails these tests rather than
 * merely deleting one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec } from "../../../contracts";
import type { SimTickEvent } from "../../../rules";
import { DART_CREEP_RELEASE_M, PedestrianDartOutRunner } from "../../../orchestrator/runners";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { compileScenario } from "../compile";
import { SC_RB_PED_EXIT } from "../templates-roundabout2";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
const KMH_TO_MPS = 1 / 3.6;

/** The exit zebra rbp-x-n, on the north arm's centerline (rb-ped-v1). */
const CROSSING = { x: 0, y: 30 } as const;
/** The north arm's outbound lane centre — the line the student's bonnet tracks. */
const X_ARM_LANE = 4.06;
/** Half the arm carriageway (rb-ped-v1): the outbound lane spans x ∈ [0, 8.125]. */
const HALF_CARRIAGEWAY_M = 8.125;
/**
 * The ring pace the whole drill is authored at, km/h — the turn-detector
 * ceiling `traces/scRbPedExit.ts` derives (57.3·v/R over a 3 s window against
 * the 55° wall) and the speed the committed shadow circulates at.
 */
const RING_PACE_KMH = 12;

function staged(id: string): PedestrianDartOutSpec {
  const all = [
    ...(SC_RB_PED_EXIT.staged ?? []),
    ...SC_RB_PED_EXIT.levels.flatMap((l) => l.stagedAdd ?? []),
  ];
  const hit = all.find((s) => s.id === id);
  if (!hit || hit.kind !== "pedestrianDartOut") {
    throw new Error(`${id} is not a staged pedestrianDartOut on this template`);
  }
  return hit;
}

const WALKER = staged("sc-rbp-crosser");
const SPRINTER = staged("sc-rbp-crosser-sprint");

/**
 * The release radius for a player BELOW `minTriggerSpeedKmh` — creeping, or
 * halted short of the paint, which is what this drill TELLS the student to do.
 * Recomputed from the spec's own authored fields rather than imported: the
 * runner keeps its own copy private on purpose, so that neutering the rule in
 * `runners.ts` cannot quietly move this file's goalposts with it.
 */
function floorReleaseM(s: PedestrianDartOutSpec): number {
  if (s.triggerEtaSec === undefined) return DART_CREEP_RELEASE_M;
  return Math.max(DART_CREEP_RELEASE_M, s.minTriggerSpeedKmh * KMH_TO_MPS * s.triggerEtaSec);
}

/** Below this the seconds bind; at or above it the authored metres still do. */
function crossoverKmh(s: PedestrianDartOutSpec): number {
  if (s.triggerEtaSec === undefined) return Infinity;
  return (s.triggerDistM / s.triggerEtaSec) * 3.6;
}

/**
 * The slowest crawl the below-floor backstop promises to cover, m/s. Not a
 * number of this file's own invention: it is the speed the shared encounter
 * battery drives its taught stop-short probe at — `floorKmh * 0.8` — i.e. the
 * student who is genuinely under the release floor rather than merely near it.
 */
const coveredCrawlMps = (s: PedestrianDartOutSpec): number =>
  s.minTriggerSpeedKmh * 0.8 * KMH_TO_MPS;

/** Seconds after release before she reaches the line the student's bonnet tracks. */
const reachesHisLaneSec = (s: PedestrianDartOutSpec): number =>
  (Math.abs(s.start.x) + X_ARM_LANE) / s.speedMps;

/** The compiled pocket gate at one rung. */
function pocketGate(level: ScenarioLevel): { x: number; y: number; radiusM: number } {
  const o = compileScenario(SC_RB_PED_EXIT, level).objectives.find(
    (x) => x.id === "sc-rbp-pocket",
  )!;
  const p = o.params as unknown as { x: number; y: number; radiusM: number };
  return { x: p.x, y: p.y, radiusM: p.radiusM };
}

/**
 * The furthest a student can be from the crossing and still be inside the
 * compiled pocket disc — i.e. the closest the release radius is allowed to be
 * before a legal, credited stop can happen outside it.
 */
function pocketFarEdgeFromCrossingM(level: ScenarioLevel): number {
  const g = pocketGate(level);
  return Math.hypot(g.x - CROSSING.x, g.y - CROSSING.y) + g.radiusM;
}

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  speedKmh: number;
}

function shadowSamples(): TraceSample[] {
  const raw = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "content", "traces", "sc-rb-ped-exit", "shadow-correct.trace.json"),
      "utf-8",
    ),
  ) as { samples: TraceSample[] };
  return raw.samples;
}

// ---------------------------------------------------------------------------
// 1. The hole: the taught stop is OUTSIDE the flat creep radius
// ---------------------------------------------------------------------------

describe("the taught stop is out of reach of the flat creep radius", () => {
  /**
   * This is the measurement that makes the ETA field mandatory here rather
   * than merely nice. Without an authored horizon a player under the speed
   * floor only releases her inside `DART_CREEP_RELEASE_M` (8 m) of the paint.
   * The pocket — the one place this drill's own title tells the student to
   * stop — reaches FURTHER out than that on every rung, so a student who
   * crawls the ring (which the ≤20 bar and «намали» both ask for) can collect
   * «Спри в джоба между кръга и пътеката», sit at 0 км/ч, and watch nothing
   * happen.
   */
  for (const level of LEVELS) {
    it(`L${level}: the pocket gate reaches beyond the 8 m creep radius`, () => {
      expect(
        pocketFarEdgeFromCrossingM(level),
        `L${level}: if the pocket fitted inside ${DART_CREEP_RELEASE_M} m the flat radius would ` +
          `already cover every credited stop and this whole file would be unnecessary — ` +
          `re-derive it before deleting anything`,
      ).toBeGreaterThan(DART_CREEP_RELEASE_M);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. …so both walkers must author the clock, and it must cover the pocket
// ---------------------------------------------------------------------------

describe("every walker on this drill releases on a CLOCK, not on metres alone", () => {
  for (const s of [WALKER, SPRINTER]) {
    it(`${s.id}: authors triggerEtaSec`, () => {
      expect(
        s.triggerEtaSec,
        `${s.id} releases on ${s.triggerDistM} m of raw distance. Her walk is a clock: she is ` +
          `clear of the carriageway ${(s.roadToM / s.speedMps).toFixed(1)} s after release, so ` +
          `the slower the student drives the less of the hazard he gets — and this drill ` +
          `instructs him to drive slowly and then to STOP. That is the sc-zebra-approach ` +
          `defect verbatim (contracts.ts triggerEtaSec): a car at 0 км/ч in front of an empty ` +
          `crossing, congratulated for yielding to nobody.`,
      ).toBeDefined();
    });

    it(`${s.id}: the below-floor release radius covers the whole pocket gate, every rung`, () => {
      // The zebra drill's own arithmetic, transplanted: the horizon evaluated
      // at the speed floor has to beat the furthest point of the gate the
      // student is told to stop in, or there is still a way to be credited
      // without meeting her.
      for (const level of LEVELS) {
        const need = pocketFarEdgeFromCrossingM(level);
        expect(
          floorReleaseM(s),
          `${s.id} @L${level}: a student halted anywhere in the compiled pocket sits up to ` +
            `${need.toFixed(2)} m from the paint, but she is only released inside ` +
            `${floorReleaseM(s).toFixed(2)} m of it. He stops where the lesson told him to and ` +
            `waits for somebody who never comes.`,
        ).toBeGreaterThan(need);
      }
    });

    it(`${s.id}: …and the clock is not INERT — the radius stays inside the authored metres`, () => {
      // The other wall, and the one an over-long horizon walks into.
      // `triggerDistM` is the OUTER bound of the release (runners.ts ANDs it),
      // so a horizon whose floor-speed radius reaches past it collapses right
      // back onto the raw metres for the one population the field exists to
      // protect: the student under the speed floor. The dial would then be
      // decoration — present, documented, and doing nothing.
      expect(
        floorReleaseM(s),
        `${s.id}: the below-floor radius is ${floorReleaseM(s).toFixed(2)} m against an authored ` +
          `outer bound of ${s.triggerDistM} m, so a crawling student is released on the metres ` +
          `exactly as before and the horizon buys him nothing`,
      ).toBeLessThan(s.triggerDistM);
    });

    it(`${s.id}: the crawler reaches the pocket BEFORE she reaches his lane`, () => {
      // The sentence instruction 5 asks for — «Изчакай човека да освободи
      // ЦЯЛОТО платно» — needs something left to wait for once he is stopped.
      // Measured at the slowest crawl the backstop covers, from the release
      // radius to the far edge of the pocket he is credited for stopping in.
      for (const level of LEVELS) {
        const toPocketSec =
          (Math.min(s.triggerDistM, floorReleaseM(s)) - pocketFarEdgeFromCrossingM(level)) /
          coveredCrawlMps(s);
        expect(
          toPocketSec,
          `${s.id} @L${level}: crawling at ${(coveredCrawlMps(s) * 3.6).toFixed(1)} км/ч he needs ` +
            `${toPocketSec.toFixed(1)} s to get from her release radius to the pocket, but she is ` +
            `across his lane ${reachesHisLaneSec(s).toFixed(1)} s after release — he stops to ` +
            `wait for a person who has already walked past his bonnet`,
        ).toBeLessThan(reachesHisLaneSec(s));
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. WHERE she is when he gets there — the picture, at every slow speed
// ---------------------------------------------------------------------------

describe("under the crossover the meeting point is speed-invariant, and it is IN HIS LANE", () => {
  for (const s of [WALKER, SPRINTER]) {
    it(`${s.id}: she is inside the student's own lane when he reaches the paint`, () => {
      const walkM = s.speedMps * (s.triggerEtaSec as number);
      // Graded roadway first — outside it the crossing reads clear and чл. 119
      // has nothing to bite on.
      expect(walkM).toBeGreaterThan(s.roadFromM);
      expect(walkM).toBeLessThan(s.roadToM);
      // …and then the harder claim: not merely "on the paint somewhere" but in
      // the half of it his bonnet tracks. She starts on the WEST curb, so the
      // walk position maps straight onto x.
      const x = s.start.x + walkM;
      expect(
        x,
        `${s.id}: at arrival she is at x = ${x.toFixed(2)}; the student's outbound lane is ` +
          `x ∈ [0, ${HALF_CARRIAGEWAY_M}] and his bonnet tracks x = ${X_ARM_LANE}`,
      ).toBeGreaterThan(0);
      expect(x).toBeLessThan(HALF_CARRIAGEWAY_M);
    });

    it(`${s.id}: the clock binds BELOW the taught ring pace, never at or above it`, () => {
      // The half that keeps this additive. Above the crossover the authored
      // metres still fire, so every committed recording, both mistake demos
      // and the whole fast half of the speed band are byte-identical — the
      // seconds only reach the band the briefing actually asks him to drive in.
      expect(
        crossoverKmh(s),
        `${s.id}: the seconds start binding at ${crossoverKmh(s).toFixed(1)} км/ч, at or above ` +
          `the ${RING_PACE_KMH} км/ч ring pace the shadow is recorded at — so this dial would ` +
          `move the committed traces instead of only rescuing the slow band`,
      ).toBeLessThan(RING_PACE_KMH);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The committed shadow keeps its own release — proven off the recording
// ---------------------------------------------------------------------------

describe("the authored shadow still releases her on the METRES", () => {
  const samples = shadowSamples();

  /** The first sample at which the walker's authored gate can fire. */
  function firstEligible(s: PedestrianDartOutSpec): TraceSample {
    const hit = samples.find(
      (p) =>
        Math.hypot(p.x - CROSSING.x, p.y - CROSSING.y) <= s.triggerDistM &&
        p.speedKmh >= s.minTriggerSpeedKmh &&
        p.y > -18, // on the ring or past it, never the far side of the approach
    );
    if (!hit) throw new Error("the shadow never becomes release-eligible");
    return hit;
  }

  it("sc-rbp-crosser: the shadow's time-to-arrival at the metres gate is inside the horizon", () => {
    const at = firstEligible(WALKER);
    const d = Math.hypot(at.x - CROSSING.x, at.y - CROSSING.y);
    const etaSec = d / (at.speedKmh * KMH_TO_MPS);
    expect(
      etaSec,
      `the shadow reaches the ${WALKER.triggerDistM} m gate ${etaSec.toFixed(2)} s from the ` +
        `paint; a horizon under that would fire the seconds instead of the metres and the ` +
        `committed recording would move`,
    ).toBeLessThanOrEqual(WALKER.triggerEtaSec as number);
  });

  it("sc-rbp-crosser: she is released on the ring AFTER the first exit, before the peel", () => {
    // The pedagogy in one measurement, and the number the template's own note
    // has to state correctly: she must step off while the driver is still
    // inside the ring reading the circulating car — past the east mouth (the
    // exit instruction 3 forbids taking) and short of the north-exit peel.
    const at = firstEligible(WALKER);
    const phiDeg = (Math.atan2(at.y, at.x) * 180) / Math.PI;
    const r = Math.hypot(at.x, at.y);
    expect(Math.abs(r - 18), `she is released at r = ${r.toFixed(2)}, off the ring`).toBeLessThan(2);
    expect(
      phiDeg,
      `released at ring angle ${phiDeg.toFixed(1)}° — inside the east mouth's ±21.6° opening, ` +
        `i.e. while the driver may still be leaving by the first exit`,
    ).toBeGreaterThan(0);
    expect(
      phiDeg,
      `released at ring angle ${phiDeg.toFixed(1)}° — the shadow has already begun the peel ` +
        `off the ring by then, so the „look up from the ring car" beat has nowhere to land`,
    ).toBeLessThan(66);
  });

  it("sc-rbp-crosser: the pocket wait OVERLAPS her time on the carriageway", () => {
    // The whole drill, measured end to end on the committed recording rather
    // than asserted: the car is at rest in the pocket while she is inside
    // [roadFromM, roadToM]. If any dial above drifts, this is the assertion
    // that says the lesson stopped happening.
    const release = firstEligible(WALKER);
    const onRoadFromSec = release.tSec + WALKER.roadFromM / WALKER.speedMps;
    const onRoadToSec = release.tSec + WALKER.roadToM / WALKER.speedMps;

    const crossedAt = samples.find((p) => p.y >= CROSSING.y)!.tSec;
    const rest = samples.filter((p) => p.speedKmh < 1 && p.y > 0 && p.tSec < crossedAt);
    expect(rest.length, "the shadow never comes to rest in the pocket").toBeGreaterThan(10);
    const restFrom = rest[0]!.tSec;
    const restTo = rest[rest.length - 1]!.tSec;

    const overlapSec = Math.min(restTo, onRoadToSec) - Math.max(restFrom, onRoadFromSec);
    expect(
      overlapSec,
      `the shadow stands in the pocket ${restFrom.toFixed(1)}–${restTo.toFixed(1)} s and she is ` +
        `on the carriageway ${onRoadFromSec.toFixed(1)}–${onRoadToSec.toFixed(1)} s: ` +
        `${overlapSec.toFixed(1)} s of overlap. Below ~4 s the demonstration stops showing a ` +
        `wait and starts showing a car stopped in front of an empty crossing.`,
    ).toBeGreaterThan(4);
  });
});

// ---------------------------------------------------------------------------
// 5. DRIVEN, on this drill's own geometry — the crawl-and-wait in the pocket
// ---------------------------------------------------------------------------

/**
 * The arithmetic above is only worth what a drive says. The shared battery's
 * probe approaches the paint down the north arm from OUTSIDE the roundabout;
 * this one drives the line the lesson actually routes — out of the ring, up the
 * outbound lane, and to rest IN THE POCKET — with the real
 * `PedestrianDartOutRunner` against the real committed district.
 *
 * The crawl speed is deliberately BELOW `minTriggerSpeedKmh`: that is the
 * student the ≤20 bar and «намали» produce, and the one the flat 8 m backstop
 * could not reach.
 */
function crawlToPocketAndWait(
  s: PedestrianDartOutSpec,
  stopAtY: number,
  crawlKmh: number,
): { released: boolean; onRoadWhileStopped: boolean; walkAtRestM: number } {
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", "rb-ped-v1.json"), "utf-8"),
  ) as TrafficDistrict;
  const tr = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const runner = new PedestrianDartOutRunner(s);
  runner.stage(tr, () => 0.5, true); // fixed jitter draw: the probe replays bit-identically

  const DT = 1 / 30;
  // Start on the ring's exit spoke, well before the pocket, heading north up
  // the outbound lane — the taught line, not a synthetic tangent.
  let py = 8;
  let t = 0;
  let released = false;
  let onRoadWhileStopped = false;
  let walkAtRestM = NaN;
  const out: SimTickEvent[] = [];
  const mps = crawlKmh / 3.6;

  for (let i = 0; i < 120 * 30; i++) {
    const moving = py < stopAtY;
    if (moving) py = Math.min(stopAtY, py + mps * DT);
    const nowKmh = moving ? crawlKmh : 0;
    t += DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: X_ARM_LANE, y: py },
      playerSpeedKmh: nowKmh,
      playerHeadingDeg: 0, // due north, straight at the crossing
    });
    runner.step(
      tr,
      { tSec: t, dtSec: DT, x: X_ARM_LANE, y: py, speedKmh: nowKmh, headingDeg: 0, brakePedal: 0, tickEvents: [] },
      out,
    );
    const actor = tr.staged(s.id);
    if (actor && actor.s > 0.05) released = true;
    const onRoad = !!actor && actor.s >= s.roadFromM && actor.s <= s.roadToM;
    if (!moving) {
      if (Number.isNaN(walkAtRestM)) walkAtRestM = actor ? actor.s : NaN;
      if (onRoad) onRoadWhileStopped = true;
    }
  }
  return { released, onRoadWhileStopped, walkAtRestM };
}

describe("DRIVEN: the crawler who stops in the pocket waits for a real person", () => {
  for (const s of [WALKER, SPRINTER]) {
    // The furthest and the nearest credited stop the compiled gate allows at
    // the BEGINNER rung — the two ends of the pocket, both driven.
    const g = pocketGate(1);
    for (const stopAtY of [g.y - g.radiusM, g.y, g.y + g.radiusM]) {
      it(`${s.id}: stopped at y = ${stopAtY.toFixed(1)} after a ${(WALKER.minTriggerSpeedKmh * 0.8).toFixed(1)} км/ч crawl`, () => {
        const r = crawlToPocketAndWait(s, stopAtY, s.minTriggerSpeedKmh * 0.8);
        expect(r.released, "she never left the curb for a student under the speed floor").toBe(
          true,
        );
        expect(
          r.onRoadWhileStopped,
          `he crawled the exit spoke, stopped at y = ${stopAtY.toFixed(1)} — inside the disc that ` +
            `credits «Спри в джоба между кръга и пътеката» — and she was NEVER on the ` +
            `carriageway while he stood there (walk position at rest: ${r.walkAtRestM.toFixed(2)} m ` +
            `against a roadway of [${s.roadFromM}, ${s.roadToM}]). That is a pass, three stars, ` +
            `and a lesson called «Пешеходец на изхода от кръговото» in which no pedestrian ` +
            `was ever on the exit.`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. The L5 sprinter needs her OWN clock — the inherited one is wrong for her
// ---------------------------------------------------------------------------

describe("the L5 sprinter carries her own horizon, not the walker's", () => {
  it("she is authored separately, and the walker's value would arrive too late for her", () => {
    expect(SPRINTER.triggerEtaSec).not.toBe(WALKER.triggerEtaSec);
    // Why it cannot be inherited: `triggerDistM` is the OUTER bound, so a
    // horizon longer than her own 18 m gate at the floor speed collapses back
    // onto those 18 m — and 18 m of crawl is longer than the 8.5 s she needs
    // to clear the road at 2.1 m/s.
    const clearSec = SPRINTER.roadToM / SPRINTER.speedMps;
    const floorCrawlSec =
      (Math.min(SPRINTER.triggerDistM, floorReleaseM(SPRINTER)) -
        pocketFarEdgeFromCrossingM(1)) /
      (SPRINTER.minTriggerSpeedKmh * 0.8 * KMH_TO_MPS);
    expect(
      floorCrawlSec,
      `a below-floor student needs ${floorCrawlSec.toFixed(1)} s to crawl from her release ` +
        `radius to the far edge of the pocket, but she is clear of the carriageway ` +
        `${clearSec.toFixed(1)} s after release — he arrives to an empty zebra on the one rung ` +
        `whose whole point is a SECOND person he did not see`,
    ).toBeLessThan(clearSec);
  });
});
