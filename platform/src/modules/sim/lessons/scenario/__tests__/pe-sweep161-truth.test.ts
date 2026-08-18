/**
 * SWEEP 161 · templates-pe.ts — the four findings routed to the PEDESTRIAN
 * family, turned into rules rather than into edits.
 *
 * Every number below was measured, not chosen: against the shipped districts in
 * `content/world`, against the shipped rule config, and against the frames in
 * `.audit-frames/sweep161`. Each block states the defect it is red on, and each
 * carries the OPPOSITE direction too — a gate that refuses everybody is the
 * same crime as one that credits everybody, and this family has now shipped
 * both.
 *
 * 1. THE CERTIFICATE THE DISC CANNOT SIGN. `sc-crossing-dart/mobile-wrong`:
 *    «✓ Премини пътеката, след като е свободна 0:34» on a 59 км/ч run with zero
 *    full stops. `stepReachZone` is handed (params, prev, tick) and no
 *    `ObjectiveContext`, so „беше ли свободна" is not a question it can be
 *    asked. `lessons/__tests__/stop-claim-gates.test.ts` already holds this as
 *    a catalogue rule — its matcher reads «когато е свободна» and this family
 *    writes «СЛЕД КАТО е свободна», which is why seven rows walked through the
 *    census. That vocabulary gap is closed here for this file.
 *
 * 2. THE GATE THAT CERTIFIED THE OFFENCE ITS OWN DRILL BILLS. The same debrief
 *    prints «✓ Приближи пътеката с готовност за спиране 0:31» one panel above
 *    «✗ Твърде бързо приближаване към пешеходна пътека −10 ОПАСНА ГРЕШКА».
 *    The engine bills above `crossingApproachMaxKmh` = 30; the gate said 40.
 *
 * 3. THE OCCLUSION THAT IS NOT IN THE MAP. The dart drill's briefing promised
 *    «Ъгловият магазин вляво крие тротоара»; pe-dart-v1's authored corner
 *    stands 8.5 m off the kerb and never enters the sightline.
 *
 * 4. THE GREEN THAT EXPIRED ON THE APPROACH. `sc-pe-jaywalker` passed on pc and
 *    failed on a phone — «Преминаване на червен сигнал», опасна — on the same
 *    scripted drive, because a 20 s `greenFresh` had to cover 45.2 m.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec, StagedEventSpec, VehicleSample } from "../../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { createWorldRuntime } from "../../../runtime";
import { SCENARIO_TEMPLATES_PE, SC_CROSSING_DART, SC_PE_JAYWALKER } from "../templates-pe";
import type { ScenarioSpec } from "../types";

const REPO = path.resolve(process.cwd(), "..");
const loadRaw = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO, "content", "world", `${id}.json`), "utf-8"));

/** Right-lane centre of every 1+1 PE street (the templates' own LANE_2). */
const LANE_X = 4.06;
/** Half the drawn carriageway of a 1+1 PE street — the true kerb line. */
const HALF_ROAD_M = 8.125;
/** The director's seeded trigger jitter (orchestrator/runners.ts stage()). */
const JITTER_M = 3;

interface ReachZoneRow {
  specId: string;
  objectiveId: string;
  titleBg: string;
  maxSpeedKmh?: number;
}

function reachZones(specs: readonly ScenarioSpec[]): ReachZoneRow[] {
  const out: ReachZoneRow[] = [];
  for (const spec of specs) {
    for (const o of spec.success) {
      const p = o.params as { kind: string; maxSpeedKmh?: number };
      if (p.kind !== "reachZone") continue;
      out.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        maxSpeedKmh: p.maxSpeedKmh,
      });
    }
  }
  return out;
}

function dartsOf(s: ScenarioSpec): PedestrianDartOutSpec[] {
  const out: PedestrianDartOutSpec[] = [];
  const push = (e: StagedEventSpec) => {
    if (e.kind === "pedestrianDartOut") out.push(e);
  };
  for (const e of s.staged ?? []) push(e);
  for (const l of s.levels) for (const e of l.stagedAdd ?? []) push(e);
  return out;
}

// ===========================================================================
// 1. No gate in this file certifies that the crossing was CLEAR
// ===========================================================================

/**
 * The wording `ACTOR_CLAIM` (stop-claim-gates.test.ts) cannot see. Its
 * alternation carries «когато е свободна» — the PE family says «СЛЕД КАТО е
 * свободна», and one row says it about the walker himself («слязъл от цялото
 * платно»). All three sentences certify the same unwitnessable fact: that the
 * carriageway was empty of a person when the car went over it.
 *
 * The verb-not-noun precision of the catalogue rule is kept: a title may NAME
 * the crossing («Приближи пътеката с готовност за спиране» promises a speed,
 * and the speed is exactly what the cap measures) — what it may not do is
 * certify that the pedestrian was off it.
 */
const CLEAR_CLAIM =
  /(?:когато|след\s+като|щом)\s+(?:\p{L}+\s+)?(?:е\s+)?(?:свободн|освободи)|слязъл\s+от|освободи\p{L}*\s+(?:цялото\s+)?платно/iu;

/**
 * The one row of this family left claiming it, and why it is not touched here:
 * it says «когато е свободна», which means `ACTOR_CLAIM` DOES see it and it is
 * already a named debt in `ACTOR_CLAIM_KNOWN_OPEN`
 * (lessons/__tests__/stop-claim-gates.test.ts). Retiring the title here without
 * deleting that entry turns the catalogue's own staleness test red, and that
 * file belongs to another lane. Deleting this entry without moving the title
 * turns THIS file red.
 */
const CLEAR_CLAIM_KNOWN_OPEN: ReadonlyArray<{ specId: string; objectiveId: string }> = [
  { specId: "sc-pe-jaywalker", objectiveId: "sc-jay-clear" },
];

describe("1 · a PE gate claims only what its disc measures", () => {
  const zones = reachZones(SCENARIO_TEMPLATES_PE);

  it("the matcher has teeth — it catches every wording this family shipped", () => {
    // The six titles the sweep's class actually wore, verbatim…
    expect(CLEAR_CLAIM.test("Премини пътеката, след като е свободна")).toBe(true);
    expect(CLEAR_CLAIM.test("Премини пътеката след кръстовището, когато е свободна")).toBe(true);
    expect(CLEAR_CLAIM.test("Потегли чак когато е слязъл от цялото платно")).toBe(true);
    expect(CLEAR_CLAIM.test("Премини, след като групата е освободила платното")).toBe(true);
    // …and a matcher that caught everything would be just as useless. These are
    // the honest neighbours: a place, a speed, a named piece of scenery.
    expect(CLEAR_CLAIM.test("Подмини пътеката и продължи по улицата")).toBe(false);
    expect(CLEAR_CLAIM.test("Приближи пътеката с готовност за спиране")).toBe(false);
    expect(CLEAR_CLAIM.test("Приближи камиона и пътеката с готовност за спиране")).toBe(false);
    expect(CLEAR_CLAIM.test("Спри НАПЪЛНО преди зебрата — не настъпвай, той се ориентира по слуха")).toBe(
      false,
    );
  });

  it("no unlisted row certifies a clear crossing", () => {
    const open = new Set(CLEAR_CLAIM_KNOWN_OPEN.map((k) => `${k.specId}/${k.objectiveId}`));
    const offenders = zones
      .filter((z) => CLEAR_CLAIM.test(z.titleBg))
      .filter((z) => !open.has(`${z.specId}/${z.objectiveId}`))
      .map((z) => `${z.specId}/${z.objectiveId} — "${z.titleBg}"`);
    expect(
      offenders,
      `${offenders.length} gate(s) certify an empty crossing with a disc alone`,
    ).toEqual([]);
  });

  it("…and the listed row is still real — a fixed one must lose its entry", () => {
    const claiming = new Set(
      zones.filter((z) => CLEAR_CLAIM.test(z.titleBg)).map((z) => `${z.specId}/${z.objectiveId}`),
    );
    const stale = CLEAR_CLAIM_KNOWN_OPEN.filter(
      (k) => !claiming.has(`${k.specId}/${k.objectiveId}`),
    ).map((k) => `${k.specId}/${k.objectiveId} is fixed — delete its entry (and its ACTOR_CLAIM one)`);
    expect(stale).toEqual([]);
  });

  it("the retitles moved no params — every PE clear-gate is still a plain disc", () => {
    // The whole remedy is that `done` is bit-identical. A future pass that
    // „strengthens" one of these by bolting a cap onto it would be inventing a
    // speed contract nobody was told about, in the same breath as this rule.
    for (const id of [
      "sc-clp-clear",
      "sc-scr-clear",
      "sc-crs-clear",
      "sc-drt-clear",
      "sc-bsh-clear",
      "sc-cbl-clear",
      "sc-wcn-clear",
    ]) {
      const row = zones.find((z) => z.objectiveId === id);
      expect(row, `${id} missing`).toBeDefined();
      expect(row!.maxSpeedKmh, `${id} grew a speed contract`).toBeUndefined();
    }
  });
});

// ===========================================================================
// 2. The approach cap and the law the same drill enforces
// ===========================================================================

/**
 * Approach gates in this family that still sit ABOVE the rule engine's own
 * `crossingApproachMaxKmh`. Each is a debt with a name, never a permission: the
 * sweep audited ONE of them (`sc-crossing-dart`, whose frame carries both the
 * tick and the conviction) and that one is closed. The rest are the same shape
 * on drills nobody has driven yet, and every one has committed traces that must
 * be replayed before its number moves — which is a different lane's afternoon,
 * not a silent edit here.
 */
const CAP_ABOVE_LAW_KNOWN_OPEN: ReadonlyArray<{ objectiveId: string; capKmh: number }> = [
  { objectiveId: "sc-clp-approach", capKmh: 40 },
  { objectiveId: "sc-scr-approach", capKmh: 35 },
  { objectiveId: "sc-crs-approach", capKmh: 35 },
  { objectiveId: "sc-cbl-approach", capKmh: 32 },
  { objectiveId: "sc-wcn-approach", capKmh: 40 },
];

describe("2 · the dart's approach gate and the law it bills", () => {
  const LAW = DEFAULT_RULE_CONFIG.crossingApproachMaxKmh;
  const approach = SC_CROSSING_DART.success.find((o) => o.id === "sc-drt-approach")!;
  const cap = (approach.params as { maxSpeedKmh: number }).maxSpeedKmh;

  it("the gate never certifies a speed PEDESTRIAN_CROSSING_TOO_FAST convicts", () => {
    // sweep161/sc-crossing-dart/mobile-wrong/08-debrief.png prints the tick and
    // the conviction on one screen. 40 > 30 is the whole of it.
    expect(LAW).toBe(30);
    expect(cap, "«готовност за спиране» above the чл. 119 threshold").toBeLessThanOrEqual(LAW);
  });

  it("…and the cap is not a false failure — the taught stop still fits", () => {
    // The counter-direction. Driving the cap down until nobody can meet it is
    // the same defect wearing the other sign. Driving-school reaction (1.0 s)
    // plus service braking (7 m/s²) from the cap must fit inside the WORST-CASE
    // release distance — the director jitters `triggerDistM` by ±3 m, so the
    // shortest warning is the one that has to work.
    const dart = dartsOf(SC_CROSSING_DART)[0];
    const lateral = LANE_X - dart.crossing.x;
    const worstTrigger = dart.triggerDistM - JITTER_M;
    const back = Math.sqrt(Math.max(worstTrigger * worstTrigger - lateral * lateral, 0));
    const v = cap / 3.6;
    const stopping = v * 1.0 + (v * v) / (2 * 7.0);
    expect(back, "release distance at the worst jitter").toBeGreaterThan(stopping);
    // And it stays a SLOW-DOWN gate, not a disguised halt: below the halt band
    // the evaluator's grace capsule changes character entirely.
    expect(cap).toBeGreaterThan(10);
  });

  it("every remaining over-the-law cap in this file is a NAMED debt", () => {
    const open = new Map(CAP_ABOVE_LAW_KNOWN_OPEN.map((k) => [k.objectiveId, k.capKmh]));
    const offenders = reachZones(SCENARIO_TEMPLATES_PE)
      .filter((z) => z.maxSpeedKmh !== undefined && z.maxSpeedKmh > LAW)
      // `sc-jay-approach` grades the JUNCTION mouth 79 m short of the crossing,
      // where no pedestrian is staged and the чл. 119 zone has not begun — it is
      // not this rule's shape.
      .filter((z) => z.objectiveId !== "sc-jay-approach")
      .filter((z) => open.get(z.objectiveId) !== z.maxSpeedKmh)
      .map((z) => `${z.specId}/${z.objectiveId} caps ${z.maxSpeedKmh} over the law's ${LAW}`);
    expect(offenders).toEqual([]);
  });

  it("…and no listed debt has quietly been paid without losing its entry", () => {
    const live = new Map(
      reachZones(SCENARIO_TEMPLATES_PE).map((z) => [z.objectiveId, z.maxSpeedKmh]),
    );
    const stale = CAP_ABOVE_LAW_KNOWN_OPEN.filter((k) => live.get(k.objectiveId) !== k.capKmh).map(
      (k) => `${k.objectiveId} no longer caps ${k.capKmh} — delete its entry`,
    );
    expect(stale).toEqual([]);
  });

  it("the one exemption is MEASURED, not asserted — sc-jay-approach is not a crossing gate", () => {
    // A named exclusion in a census is a hole unless something pins the reason.
    // This gate's disc is at the junction mouth; the drill's zebra (pej-x-1) is
    // 79 m further north, past the junction, and the чл. 119 zone is not open
    // at the mark. If the mark is ever moved toward the crossing the exemption
    // has to be re-argued, and this is the assertion that will demand it.
    const jay = SC_PE_JAYWALKER.success.find((o) => o.id === "sc-jay-approach")!;
    const p = jay.params as { y: number; radiusM: number; maxSpeedKmh: number };
    expect(p.maxSpeedKmh).toBe(45);
    const walker = dartsOf(SC_PE_JAYWALKER)[0];
    expect(walker.crossing.y - (p.y + p.radiusM), "m from the gate's near edge to the zebra").toBeGreaterThan(
      60,
    );
  });
});

// ===========================================================================
// 3. An occlusion the copy promises must be in the map
// ===========================================================================

interface Footprint {
  id: string;
  points: ReadonlyArray<readonly [number, number]>;
}

function buildingsOf(raw: unknown): Footprint[] {
  const d = raw as { buildings?: Array<{ id: string; footprint: number[][] }> };
  return (d.buildings ?? []).map((b) => ({
    id: b.id,
    points: b.footprint.map((p) => [p[0], p[1]] as const),
  }));
}

/** Do segments AB and CD cross? (Proper or touching — a graze still blocks.) */
function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(ax, ay, bx, by, cx, cy);
  const d2 = cross(ax, ay, bx, by, dx, dy);
  const d3 = cross(cx, cy, dx, dy, ax, ay);
  const d4 = cross(cx, cy, dx, dy, bx, by);
  return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) &&
    ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0);
}

/** Does any footprint stand between the eye and the target? */
function sightlineBlocked(
  eye: readonly [number, number],
  target: readonly [number, number],
  fps: readonly Footprint[],
): string | null {
  for (const fp of fps) {
    for (let i = 0; i < fp.points.length; i++) {
      const a = fp.points[i];
      const b = fp.points[(i + 1) % fp.points.length];
      if (segmentsCross(eye[0], eye[1], target[0], target[1], a[0], a[1], b[0], b[1])) return fp.id;
    }
  }
  return null;
}

/**
 * Copy that names a BUILDING as the thing hiding the pavement. Deliberately
 * NOT a general „hidden view" matcher: `sc-crossing-bus-shadow` says «Камионът
 * крие тротоара пред себе си» about a STAGED box-truck body that the world
 * really does stand there (heldSceneryFor / BUS_OBSTACLE), and that claim is
 * honest. A building is the one occluder whose truth lives in the district
 * file, which is the file this rule can read.
 */
const BUILDING_OCCLUSION_CLAIM =
  /(?:ъглов\p{L}*|ъгъл\p{L}*|сграда\p{L}*|магазин\p{L}*)[^.!?]{0,60}(?:крие|закрива|скрива)|иззад\s+ъгъла/iu;

/**
 * Only the copy that describes THIS approach. `teach.*` is the transfer card by
 * contract — „when does this apply in the world" — and may name the occluded
 * case as the worst instance without asserting that the student is looking at
 * one.
 */
function drillCopy(s: ScenarioSpec): string {
  return [s.objectiveBg, ...s.instructionsBg.map((i) => i.textBg), ...s.success.map((o) => o.titleBg)].join(" ");
}

describe("3 · the occlusion the PE copy promises is measurable in the district", () => {
  const dartRaw = loadRaw("pe-dart-v1");
  const dartBuildings = buildingsOf(dartRaw);
  const dart = dartsOf(SC_CROSSING_DART)[0];

  it("the helper has teeth — a corner ON the kerb line really does block", () => {
    // The placement pe-dart-v1's own `streetscapeNoteBg` describes: «изнесена до
    // самия бордюр 1,5 м преди зебрата». Kerb at −8.125, so the volume's east
    // face is the kerb; it ends at y = 79 (1 m short of the zebra at 80).
    const asAuthored: Footprint = {
      id: "synthetic-corner-on-the-kerb",
      points: [
        [-11.6, 70],
        [-8.125, 70],
        [-8.125, 79],
        [-11.6, 79],
      ],
    };
    const eye: readonly [number, number] = [LANE_X, dart.crossing.y - 25.68];
    expect(sightlineBlocked(eye, [dart.start.x, dart.start.y], [asAuthored])).toBe(
      "synthetic-corner-on-the-kerb",
    );
  });

  it("the shipped corner does NOT block — 8.5 m off the kerb, behind her, not in front", () => {
    const corner = dartBuildings.find((b) => b.id === "pe-b-corner");
    expect(corner, "pe-b-corner is the authored streetscape volume").toBeDefined();
    const eastFace = Math.max(...corner!.points.map((p) => p[0]));
    // The measurement the fix is written on, pinned so it cannot drift silently.
    expect(eastFace).toBeCloseTo(-16.6, 1);
    expect(-HALF_ROAD_M - eastFace, "metres of clearance behind the kerb").toBeGreaterThan(8);
    // …and therefore the walker is in view for the WHOLE approach, not just at
    // the release point: her kerb is east of every authored volume, so the
    // sightline never reaches the corner at any range.
    for (let back = 60; back >= 2; back -= 2) {
      const eye: readonly [number, number] = [LANE_X, dart.crossing.y - back];
      expect(
        sightlineBlocked(eye, [dart.start.x, dart.start.y], dartBuildings),
        `blocked from ${back} m out`,
      ).toBeNull();
    }
  });

  it("no PE briefing claims a building occlusion its own district does not stage", () => {
    const offenders: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PE) {
      if (!BUILDING_OCCLUSION_CLAIM.test(drillCopy(spec))) continue;
      const fps = buildingsOf(loadRaw(spec.map.districtId));
      for (const d of dartsOf(spec)) {
        const lateral = LANE_X - d.crossing.x;
        const back = Math.sqrt(Math.max(d.triggerDistM ** 2 - lateral ** 2, 0));
        const hit = sightlineBlocked(
          [LANE_X, d.crossing.y - back],
          [d.start.x, d.start.y],
          fps,
        );
        if (hit === null) {
          offenders.push(
            `${spec.id}: the copy hides the pavement behind a building; ${spec.map.districtId} has none on the sightline`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the matcher spares the staged occluder that IS there (bus-shadow)", () => {
    // The truck is a staged body, not a building — the rule must not drag it in
    // and must not be widened until it can read the scenery channel.
    expect(BUILDING_OCCLUSION_CLAIM.test("Камионът крие тротоара пред себе си — не разчитай, че щом не виждаш никого, няма никой.")).toBe(
      false,
    );
    expect(BUILDING_OCCLUSION_CLAIM.test("Ъгловият магазин вляво крие тротоара — не разчитай, че щом не виждаш никого, няма никой.")).toBe(
      true,
    );
    expect(BUILDING_OCCLUSION_CLAIM.test("пешеходец изскача иззад ъгъла точно когато наближаваш")).toBe(
      true,
    );
    expect(BUILDING_OCCLUSION_CLAIM.test("Тротоарът вляво се вижда — но една крачка стига: човек стъпва на зебрата без предупреждение.")).toBe(
      false,
    );
  });
});

// ===========================================================================
// 4. sc-pe-jaywalker — the promised green survives the pace the drill invites
// ===========================================================================

describe("4 · «Светофарът за теб е зелен» at the pace this lesson is driven", () => {
  const raw = loadRaw("pe-jay-v1");
  /** The derived stop line of the southern approach (world/builders stoplines). */
  const STOP_LINE_Y = -27.725;
  const SPAWN_Y = -105;
  /** The signal cluster's centroid — junction node (0,0) + crossing (0,34). */
  const CENTROID_Y = 17;

  const sample = (y: number, kmh: number): VehicleSample => ({
    position: { x: LANE_X, y },
    headingDeg: 0,
    speedKmh: kmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  });

  /**
   * The audited harness's own profile: ~5 s of throttle to `peakKmh`, then
   * coast to a full stop over ~5 s, repeat. `pc-right` logged top 15 км/ч with
   * 13 full stops; `mobile-right` top 19 км/ч with 13. Reproducing the SHAPE is
   * the point — a constant-speed model is what missed this defect the first
   * time (lane10 G8 sweeps 20…45 км/ч and is green on the broken value).
   */
  const burst = (peakKmh: number) => (t: number) => {
    const p = t % 10;
    return p < 5 ? (peakKmh * p) / 5 : Math.max(0, peakKmh * (1 - (p - 5) / 5));
  };

  function phaseAtStopLine(triggerM: number, speedAt: (t: number) => number): string {
    const rt = createWorldRuntime(raw);
    rt.armSignalPlan({ arm: "greenFresh", triggerM, clusterId: "sx-n-c" }, { x: LANE_X, y: SPAWN_Y });
    let y = SPAWN_Y;
    const dt = 0.05;
    for (let t = 0; t <= 900; t += dt) {
      const kmh = speedAt(t);
      y += (kmh / 3.6) * dt;
      rt.update(dt);
      rt.sample(sample(y, kmh), t, false);
      if (y >= STOP_LINE_Y) return rt.signalPhase("sx-n-c");
    }
    return "never-arrived";
  }

  const PACES: ReadonlyArray<readonly [string, (t: number) => number]> = [
    ["const 4 км/ч", () => 4],
    ["const 8 км/ч", () => 8],
    ["const 15 км/ч", () => 15],
    ["const 30 км/ч", () => 30],
    ["const 45 км/ч", () => 45],
    ["burst peak 8", burst(8)],
    ["burst peak 11", burst(11)],
    ["burst peak 15", burst(15)],
    ["burst peak 20", burst(20)],
    ["burst peak 45", burst(45)],
  ];

  it("the defect is real: the old triggerM 90 spent the green before the line", () => {
    // Kept as a permanent record of what was measured, so the value cannot be
    // walked back as „probably fine". Both audited drives live in this band.
    expect(phaseAtStopLine(90, burst(11))).not.toBe("green");
    expect(phaseAtStopLine(90, () => 4)).not.toBe("green");
    // …and the reason it looked fine: a brisk constant approach always was.
    expect(phaseAtStopLine(90, () => 30)).toBe("green");
  });

  it("the authored plan delivers green at the line at every audited pace", () => {
    const plan = SC_PE_JAYWALKER.signalPlan!;
    expect(plan.arm).toBe("greenFresh");
    const red = PACES.filter(([, f]) => phaseAtStopLine(plan.triggerM, f) !== "green").map(
      ([name]) => name,
    );
    expect(red, "«Светофарът за теб е зелен» — instruction 2's own promise").toEqual([]);
  });

  it("…and the ring is not shrunk to nothing to get there", () => {
    // The counter-direction. The cheapest way to make the test above pass is to
    // arm the pin on the paint itself — which trades a false failure for a lamp
    // that flips green under the bumper, the very complaint (founder,
    // 2026-07-17) signalPlan exists to answer. The ring must stand clear of the
    // line, and the spawn must stay outside it or the wall clock owns the
    // arrival again (contracts.ts SignalPlanSpec authoring notes).
    const { triggerM } = SC_PE_JAYWALKER.signalPlan!;
    const ringY = CENTROID_Y - Math.sqrt(triggerM * triggerM - LANE_X * LANE_X);
    expect(STOP_LINE_Y - ringY, "metres of green-lit approach before the line").toBeGreaterThan(8);
    expect(ringY, "the ring must be reached BEFORE the line").toBeLessThan(STOP_LINE_Y);
    expect(Math.hypot(LANE_X, SPAWN_Y - CENTROID_Y), "spawn inside the ring").toBeGreaterThan(
      triggerM,
    );
  });

  it("a car that stands still through the whole green is still convicted", () => {
    // The other false-pass this must not become. Someone who crosses the ring,
    // stops dead for the entire 20 s and then drives over without reading the
    // lamp HAS run a red light, and the gate has to keep saying so.
    const { triggerM } = SC_PE_JAYWALKER.signalPlan!;
    const ringY = CENTROID_Y - Math.sqrt(triggerM * triggerM - LANE_X * LANE_X);
    let stalled = false;
    let stallStart = 0;
    const stall = (t: number, y: number) => {
      if (!stalled && y >= ringY + 0.5) {
        stalled = true;
        stallStart = t;
      }
      return stalled && t - stallStart < 30 ? 0 : 11;
    };
    const rt = createWorldRuntime(raw);
    rt.armSignalPlan({ arm: "greenFresh", triggerM, clusterId: "sx-n-c" }, { x: LANE_X, y: SPAWN_Y });
    let y = SPAWN_Y;
    const dt = 0.05;
    let phase = "never-arrived";
    for (let t = 0; t <= 900; t += dt) {
      const kmh = stall(t, y);
      y += (kmh / 3.6) * dt;
      rt.update(dt);
      rt.sample(sample(y, kmh), t, false);
      if (y >= STOP_LINE_Y) {
        phase = rt.signalPhase("sx-n-c");
        break;
      }
    }
    expect(stalled, "the profile never reached the ring").toBe(true);
    expect(phase, "a 30 s stall inside the ring must NOT be handed a green").not.toBe("green");
  });
});
