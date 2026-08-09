/**
 * LANE 9 — the JUNCTIONS & SIGNALS family's world-referent invariants
 * (doc 86 `86_FOUNDER_REVIEW_150_LEDGER.md`, defects T7, T9, T12, T13, L4, L7,
 * D3, B5).
 *
 * Every assertion here exists because a shipped template asserted something its
 * own map did not contain, and nothing in the tree could tell. They are written
 * as CLASS invariants over the family's templates rather than as pins on the
 * specific scenarios that were wrong, so the next junction template cannot
 * reintroduce the same defect quietly.
 *
 * Scope: the seven files this lane owns — templates-junctions{,2,3,4}.ts,
 * templates-signals{,2}.ts, templates-speed.ts. Other families' staged specs
 * (roundabout, rail, merging …) are NOT walked here; the ledger's §10
 * world-referent gate is the catalog-wide version of this idea.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { analyzeNetwork } from "../../../world/builders/network";
import { assertDistrict } from "../../../world/types";
import {
  CONTROLLER_GESTURES,
  CONTROLLER_GESTURE_EVENT_IDS,
  SCENARIO_TEMPLATES_SIGNALS,
} from "../templates-signals";
import { SCENARIO_TEMPLATES_SIGNALS2 } from "../templates-signals2";
import { SCENARIO_TEMPLATES_JUNCTIONS } from "../templates-junctions";
import { SCENARIO_TEMPLATES_JUNCTIONS2 } from "../templates-junctions2";
import { SCENARIO_TEMPLATES_JUNCTIONS3 } from "../templates-junctions3";
import {
  JXB_KISS_Y,
  JX_FAR_STOP_LINE_Y,
  SCENARIO_TEMPLATES_JUNCTIONS4,
} from "../templates-junctions4";
import { SCENARIO_TEMPLATES_SPEED } from "../templates-speed";
import type { ScenarioSpec } from "../types";

const LANE9: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_JUNCTIONS,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
  ...SCENARIO_TEMPLATES_JUNCTIONS3,
  ...SCENARIO_TEMPLATES_JUNCTIONS4,
  ...SCENARIO_TEMPLATES_SIGNALS,
  ...SCENARIO_TEMPLATES_SIGNALS2,
  ...SCENARIO_TEMPLATES_SPEED,
];

/** Stop lines (painted AND graded) sit this far outside the junction cut, m. */
const PAINT_INSET_M = 0.6;
/** Half a car, m — VEHICLE_LENGTH_M 4.1 / 2. */
const CAR_HALF_M = 2.05;
/** Drawn lane-center offset on every scenario junction map in this family, m. */
const LANE_CENTER_M = 4.06;
/** The proven hold setback: centre this far short of the paint (the
 *  sc-signal-redyellow / sc-jx-blocked-exit pose the shadows all use), m. */
const HOLD_SETBACK_M = 1.8;

/**
 * `lineDistM` specs whose number is deliberately NOT the player's stop line.
 * Each is a commit-distance dial, reasoned in place in templates-junctions3.ts.
 * The point of listing them here is that the exemption is a decision on the
 * record, not an oversight — exactly the shape §10 gives NO_WORLD_REFERENT.
 */
const LINE_DIST_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    "sc-jxpc-waiter",
    "lineDistM 0 and NO witnessArm, both deliberate: the player is on the PRIORITY arm and has no stop line of his own, and the car is designed to stay dormant at its Б2 and pull out BEHIND him. A witness gate would defer a release that must not be deferred.",
  ],
  [
    "sc-jxpc-creeper",
    "lineDistM 34 is the L5 rung's COMMIT dial, not a line: it makes the creeper pull out at d = 56 m so the student meets it while still at speed. Deferring that release is exactly what the rung must not do.",
  ],
]);

function loadDistrict(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`district ${id}.json not found`);
}

const districtCache = new Map<string, ReturnType<typeof analyzeNetwork>>();
function networkOf(districtId: string): ReturnType<typeof analyzeNetwork> {
  let net = districtCache.get(districtId);
  if (!net) {
    net = analyzeNetwork(assertDistrict(loadDistrict(districtId)));
    districtCache.set(districtId, net);
  }
  return net;
}

/** The junction MOUTH radius the world actually builds at `nodeId`, m. */
function mouthRadiusM(districtId: string, nodeId: string): number {
  const info = networkOf(districtId).nodes.get(nodeId);
  if (!info) throw new Error(`${districtId}: no node ${nodeId}`);
  return info.radius;
}

interface LineSpecRef {
  scenario: ScenarioSpec;
  event: StagedEventSpec & { lineDistM: number };
  nodeId: string;
}

/** Every staged event in the family that carries a player-stop-line distance —
 *  base `staged` AND per-rung `stagedAdd`, so an L5-only conflict is walked too. */
function lineDistSpecs(): LineSpecRef[] {
  const out: LineSpecRef[] = [];
  for (const scenario of LANE9) {
    const events = [
      ...(scenario.staged ?? []),
      ...scenario.levels.flatMap((l) => l.stagedAdd ?? []),
    ];
    for (const event of events) {
      const withLine = event as StagedEventSpec & {
        lineDistM?: number;
        junction?: { nodeId?: string };
        signalNodeId?: string;
      };
      if (typeof withLine.lineDistM !== "number") continue;
      const nodeId = withLine.junction?.nodeId ?? withLine.signalNodeId;
      if (!nodeId) continue;
      out.push({
        scenario,
        event: event as StagedEventSpec & { lineDistM: number },
        nodeId,
      });
    }
  }
  return out;
}

describe("T7 — lineDistM is the map's own stop line, never a borrowed engine radius", () => {
  const specs = lineDistSpecs();

  it("walks every staged line-event in the family (nothing silently skipped)", () => {
    expect(specs.length).toBeGreaterThanOrEqual(12);
  });

  for (const { scenario, event, nodeId } of lineDistSpecs()) {
    const exempt = LINE_DIST_EXEMPT.get(event.id);
    it(`${scenario.id} / ${event.id}${exempt ? " (exempt)" : ""}`, () => {
      if (exempt) {
        expect(exempt.length).toBeGreaterThan(20); // the reason is on the record
        return;
      }
      const mouth = mouthRadiusM(scenario.map.districtId, nodeId);
      /**
       * THE T7 DEFECT, stated as an invariant. `SC_SIGNAL_DEAD_CONFLICT` and
       * `SC_SIGNAL_FLASHING_CONFLICT` authored `lineDistM: 18` on sx-v1 — which
       * is `RHR_CORE_RADIUS_M`, the engine's right-hand-rule conviction core,
       * not a stop line. sx-v1's mouth is 27.125 m (the ns road is `secondary`,
       * so its half-width carries a parking band and its corner radius is the
       * arterial 15 m), so the number was 9.7 m short of the paint. 18 IS the
       * right number on tj-rhr-v1 / tj-occluded-v1 / jx-equal-v1, whose
       * all-`residential` mouths really are 17.125 m — which is exactly why the
       * mistake was invisible: the same literal is correct on three maps and a
       * falsehood on a fourth. Deriving the expectation from the district kills
       * the whole class.
       */
      expect(
        Math.abs(event.lineDistM - mouth),
        `${event.id}: lineDistM ${event.lineDistM} vs ${scenario.map.districtId}'s ` +
          `${nodeId} mouth ${mouth} (paint at ${mouth + PAINT_INSET_M})`,
      ).toBeLessThanOrEqual(1.5);
    });
  }
});

describe("T7 — a LAWFUL stop at the paint must satisfy the witness release", () => {
  for (const { scenario, event, nodeId } of lineDistSpecs()) {
    if (event.kind !== "priorityFromRight") continue;
    if (LINE_DIST_EXEMPT.has(event.id)) continue;
    const arm = (event as { witnessArm?: { nearLineM: number } }).witnessArm;
    it(`${scenario.id} / ${event.id}: stopped at the line reads inside nearLineM`, () => {
      /**
       * T7's second harm. `PriorityFromRightRunner` releases the staged car on
       * `playerLineDist = max(0, d − lineDistM) <= nearLineM`, or on a raw ETA
       * that floors to 20+ s at 0 km/h. With `lineDistM` short of the paint a
       * student who obeys the instruction and STOPS AT THE LINE fails both
       * tests forever: the runner falls through to `cruise 0` and the conflict
       * car waits for a driver who has already arrived. He is marooned at a
       * junction nothing ever crosses — «I let everybody pass … but Error
       * appeared that I made error».
       */
      expect(arm, `${event.id} must author witnessArm (L7)`).toBeDefined();
      const mouth = mouthRadiusM(scenario.map.districtId, nodeId);
      const holdAlongArm = mouth + PAINT_INSET_M + HOLD_SETBACK_M;
      const d = Math.hypot(LANE_CENTER_M, holdAlongArm);
      const playerLineDist = Math.max(0, d - event.lineDistM);
      expect(
        playerLineDist,
        `${event.id}: a car stopped ${HOLD_SETBACK_M} m short of the paint reads ` +
          `playerLineDist ${playerLineDist.toFixed(2)} m, outside nearLineM ${arm!.nearLineM}`,
      ).toBeLessThanOrEqual(arm!.nearLineM);
    });
  }
});

describe("L7 — every staged conflict in the family states when it is witnessed", () => {
  it("no priorityFromRight spec relies on the bare 22 m distance gate", () => {
    const missing: string[] = [];
    for (const { scenario, event } of lineDistSpecs()) {
      if (event.kind !== "priorityFromRight") continue;
      if (LINE_DIST_EXEMPT.has(event.id)) continue; // reasoned in the map above
      if ((event as { witnessArm?: unknown }).witnessArm === undefined) {
        missing.push(`${scenario.id}/${event.id}`);
      }
    }
    // The runner defaults the gate now, but a spec that stages a conflict
    // should SAY when that conflict is met — the three that never opted in
    // (sc-junction-rhr, sc-jx-giveway-b1, sc-jx-equal-left) are the ones the
    // founder played and found empty.
    expect(missing).toEqual([]);
  });
});

describe("T9 — a lesson may not grade an observation against an empty map", () => {
  /**
   * `sc-junction-scan` shipped with no staged actor at all while its objective,
   * instruction 4, its teach copy and BOTH mistake narrations asserted a car
   * approaching during the scan. `JUNCTION_SCAN_INCOMPLETE` reads only glance
   * bookkeeping, so nothing ever contradicted the claim.
   */
  const OBSERVATION_CLAIM = /кола|автомобил|идва|приближ/i;
  for (const scenario of LANE9) {
    if (scenario.ruleConfig?.junctionScanObservationEnabled !== true) continue;
    it(`${scenario.id}: its scan copy names traffic, so it must stage traffic`, () => {
      const claimsTraffic =
        OBSERVATION_CLAIM.test(scenario.objectiveBg) ||
        scenario.instructionsBg.some((s) => OBSERVATION_CLAIM.test(s.textBg)) ||
        scenario.mistakes.some((m) => OBSERVATION_CLAIM.test(m.whatWentWrongBg));
      if (!claimsTraffic) return;
      expect(
        (scenario.staged ?? []).length,
        `${scenario.id} promises approaching traffic in its copy and stages none`,
      ).toBeGreaterThan(0);
    });
  }
});

describe("T12 — the staged queue tail stands OUTSIDE the junction it teaches about", () => {
  it("sc-jx-blocked-exit: the column is past the far paint, and the follower is not", () => {
    const scenario = SCENARIO_TEMPLATES_JUNCTIONS4[0];
    const tail = scenario.staged![0];
    expect(tail.kind).toBe("brakingLeadCar");
    if (tail.kind !== "brakingLeadCar") return;
    const tailY = tail.actor.hold.offsetM;
    // 1. the column's whole body is clear of the junction square (чл. 98).
    expect(tailY - CAR_HALF_M).toBeGreaterThan(JX_FAR_STOP_LINE_Y);
    // 2. …but under one car of free space is left, so the premise holds.
    expect(tailY - CAR_HALF_M - JX_FAR_STOP_LINE_Y).toBeLessThan(4.1);
    // 3. …so a driver who follows it in strands INSIDE the box.
    expect(JXB_KISS_Y + CAR_HALF_M).toBeLessThan(JX_FAR_STOP_LINE_Y + CAR_HALF_M);
    expect(JXB_KISS_Y - CAR_HALF_M).toBeGreaterThan(0);
  });
});

describe("L4 — the регулировчик stands on the approach he is talking to", () => {
  const controllers = LANE9.flatMap((scenario) =>
    (scenario.staged ?? [])
      .filter((e): e is Extract<StagedEventSpec, { kind: "trafficController" }> =>
        e.kind === "trafficController",
      )
      .map((event) => ({ scenario, event })),
  );

  it("the family stages exactly the three JU-18 drills the gesture table names", () => {
    expect(controllers.map((c) => c.event.id).sort()).toEqual(
      [...CONTROLLER_GESTURE_EVENT_IDS].sort(),
    );
  });

  for (const { scenario, event } of controllers) {
    it(`${scenario.id}: the officer is between the stop line and the node, not at its centre`, () => {
      /**
       * Two of the three posted him at the junction's geometric centre — 27.7 m
       * BEYOND the stop line the student has to read him from, on a carriageway
       * drawn at 2.5× scale. `sc-sig-controller-postures` is the worst case: its
       * stated teach goal is «разчети позата» on a ~1.7 m figure at 27.7 m.
       */
      const d = Math.hypot(event.officer.x - event.junction.x, event.officer.y - event.junction.y);
      expect(d, `${event.id}: officer is AT the junction centre`).toBeGreaterThan(4);
      expect(
        d,
        `${event.id}: officer is ${d} m out, past the ${event.lineDistM} m stop line the ` +
          `student reads him from`,
      ).toBeLessThan(event.lineDistM);
    });
  }
});

describe("L4 — every gesture says who goes, who stops and whose priority it is", () => {
  it("covers the three регулировчик postures", () => {
    expect(CONTROLLER_GESTURES.map((g) => g.posture)).toEqual([
      "sideProfile",
      "chestOrBack",
      "armRaised",
    ]);
  });

  for (const gesture of CONTROLLER_GESTURES) {
    it(`${gesture.posture}: answers all three questions and cites law by retrieval`, () => {
      // THEO-4: a posture shown without its meaning is a bare verdict in a
      // costume. ADR-002: the law reference is retrieval, never free recall.
      for (const [field, value] of Object.entries({
        poseBg: gesture.poseBg,
        goBg: gesture.goBg,
        stopBg: gesture.stopBg,
        priorityBg: gesture.priorityBg,
      })) {
        expect(value.length, `${gesture.posture}.${field} is too thin to teach`).toBeGreaterThan(24);
        expect(value, `${gesture.posture}.${field} must be Bulgarian`).toMatch(/[Ѐ-ӿ]/);
      }
      // 2026-08-03: was /чл\. ?66|чл\. ?7/. ППЗДвП чл. 66 is „Другите средства
      // за сигнализиране" (направляващи стълбчета, конуси, бариери) — the
      // регулировчик's postures are ППЗДвП чл. 29, ал. 3. ЗДвП чл. 7 (the
      // controller outranks the lamp) stays valid alongside it.
      //
      // 2026-08-09: the ARTICLE NUMBER came off. `content/law/acts` holds no
      // byte of ППЗДвП, so „чл. 29, ал. 3" was unverifiable by construction —
      // this assertion could only ever confirm that the string had not been
      // retyped, never that the number was right. What is asserted now is the
      // act and the SUBJECT, which is checkable in the sense that matters: a
      // reader can find the регулировчик's postures in that act.
      // `modules/sim/__tests__/law-citations.test.ts` runs the real resolver
      // over every lawRef in the module and fails on a relapse.
      expect(gesture.lawRef).toMatch(/ППЗДвП сигнали на регулировчика/);
    });
  }

  for (const scenario of LANE9) {
    const isController = (scenario.staged ?? []).some((e) => e.kind === "trafficController");
    if (!isController) continue;
    it(`${scenario.id}: its own copy names all three postures, not just the one it uses`, () => {
      const copy = [
        scenario.objectiveBg,
        ...scenario.instructionsBg.map((s) => s.textBg),
        scenario.teach.whyBg,
      ]
        .join(" ")
        .toLowerCase();
      for (const needle of ["профил", "гърди", "ръка"]) {
        expect(copy, `${scenario.id} never explains the „${needle}" posture`).toContain(needle);
      }
    });
  }
});

describe("D3 — an objective title may not promise what its gate cannot see", () => {
  /**
   * `passSignal` tracks PROGRESSION only: lessons/objectives.ts states that
   * „running the red still COMPLETES a plain passSignal". Three titles in this
   * family read «Премини … НА ЗЕЛЕНО», so a run that crossed on red collected a
   * green tick certifying the one thing it did not do. `requireRedMet` is the
   * only lamp condition the objective layer can express, so a title may name a
   * lamp state only when the gate actually enforces one.
   */
  const LAMP_CLAIM = /на зелено|на червено|на жълто/i;
  for (const scenario of LANE9) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "passSignal") continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (!LAMP_CLAIM.test(objective.titleBg)) return;
        expect(
          objective.params.kind === "passSignal" && objective.params.requireRedMet === true,
          `${objective.id}: „${objective.titleBg}" names a lamp state the gate never reads`,
        ).toBe(true);
      });
    }
  }
});

describe("B5 — a halt gate may not admit a pose past the line it is halting at", () => {
  /**
   * Both of this family's crawl gates were circles whose FAR edge sat past the
   * stop line: `sc-jxb-hold` (y −29.5 r4 against paint at −27.725) admitted a
   * pose 2.23 m inside the junction, and `sc-jxgb-yield` (y 118 r4 against a Б1
   * line at 122.275) admitted only the last 8 m of an approach on which every
   * metre is lawful — forcing the student forward to the one pose with the
   * worst sightline («if I don't stop on the green circle I can't do anything»).
   */
  const HALT_GATES: ReadonlyArray<{
    scenarioId: string;
    objectiveId: string;
    /** Signed distance along the arm at which the graded line sits. */
    lineY: number;
    /** +1 when the student approaches from below the line, −1 from above. */
    dir: 1 | -1;
    minBandM: number;
  }> = [
    { scenarioId: "sc-jx-blocked-exit", objectiveId: "sc-jxb-hold", lineY: -27.725, dir: 1, minBandM: 9 },
    { scenarioId: "sc-jx-giveway-b1", objectiveId: "sc-jxgb-yield", lineY: 122.275, dir: 1, minBandM: 14 },
  ];

  for (const gate of HALT_GATES) {
    it(`${gate.scenarioId} / ${gate.objectiveId}`, () => {
      const scenario = LANE9.find((s) => s.id === gate.scenarioId)!;
      const objective = scenario.success.find((o) => o.id === gate.objectiveId)!;
      expect(objective.params.kind).toBe("reachZone");
      if (objective.params.kind !== "reachZone") return;
      const { y, radiusM } = objective.params;
      const farEdge = gate.dir === 1 ? y + radiusM : y - radiusM;
      // Never past the paint…
      if (gate.dir === 1) expect(farEdge).toBeLessThan(gate.lineY);
      else expect(farEdge).toBeGreaterThan(gate.lineY);
      // …and wide enough that a student may choose where to stop.
      expect(radiusM * 2).toBeGreaterThanOrEqual(gate.minBandM);
      // The crawl cap is the drill and must survive the widening.
      expect(objective.params.maxSpeedKmh).toBeLessThanOrEqual(6);
    });
  }
});
