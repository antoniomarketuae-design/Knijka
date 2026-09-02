/**
 * =============================================================================
 * «ПРАВИЛНО ОТСТЪПЕНО ПРЕДИМСТВО» MUST REQUIRE THE ACT IT NAMES.
 *
 * Row `sc-junction-scan:d9c8e516` (critical), frame `.audit-frames/w14/frames/
 * sc-junction-scan__mobile-wrong/08-debrief-p7.png`: the «Похвали» card read
 * «✓ Правилно отстъпено предимство 0:55» while the same run's ledger recorded
 * «0 full stops · 0 lawful waits honoured (0s)» and a top speed of 59 км/ч
 * (run.log:239), and the same scroll convicted the drive of 3 опасни грешки —
 * the worst «Удар в неподвижно препятствие» — for 33 наказателни точки against
 * a limit of 9 (run.log:320, :322, :323).
 *
 * THIS IS NOT the `sc-ac-wind-truck-pass` clause (praise not gated on the
 * VERDICT), and gating on the verdict would not have closed it: a clean drive
 * that never yielded would still have collected the card. What was wrong is
 * that `PriorityFromRightRunner`'s `sawYield` — ONE frame under 8 км/ч anywhere
 * inside `playerLineDist <= 14`, with the staged actor anywhere inside
 * `|carArc| <= 26` — is not the act the commendation names. A standstill is a
 * standstill whether the student chose it or a pole chose it for him, and
 * `Math.abs` counted a car 20 m PAST the node as the thing he waited for.
 *
 * The two cases below are the finding turned into a law: the honest wait keeps
 * its card (so the gate can never be satisfied by muting the channel), and the
 * pose from the frame — stopped at the mouth by an IMPACT while the priority
 * car goes by — loses it.
 *
 * SCOPE, stated so the silence is deliberate. This file pins the COMMENDATION
 * only. `sawYield` still labels the `StagedEventOutcome`, so every committed
 * trace's `detail` is untouched — `events-integration.test.ts` L2 and the
 * `s-w*` bot-completion batteries are the standing proof of that and are not
 * restated here.
 *
 * ── THE THIRD CONDITION, CORRECTED 2026-09-02 ──
 *
 * This block used to say the third condition (the wait must be spent while
 * `carArc < 0`) needed no pin because it „can only ever WITHHOLD praise, never
 * award it". That is true, and it is the harm: replayed through the production
 * stack, it withheld the card from the two AUTHORED-CORRECT Б2 shadows, which
 * hold a full stop 1.8 m short of the line for ~6.5 s —
 *
 *                        while carArc < 0    while the car is in the conflict
 *   sc-junction-gap  ……………… 0.40 s               4.75 s
 *   sc-junction-left ……………… 0.33 s               4.70 s
 *
 * — because `leadSec: -3.5` plus the S2 witness gate lands the priority car on
 * the node at the instant they finish braking. The runner now ARMS the wait
 * clock while the car still has the node to cross and runs it until the car is
 * PRIORITY_CLEAR_ARC_M past, so the crawl-behind-a-departed-car case is still
 * excluded (the clock can never start) and the honest wait is credited in full.
 * The pins for that half are `sc-ju2-traces.test.ts` and `sc-ju3-traces.test.ts`
 * — production choreography, not a pose driver, which is why they can hit a
 * window this file's fixtures cannot.
 * =============================================================================
 */

import { describe, expect, it } from "vitest";
import type { PriorityFromRightSpec } from "../../contracts";
import { lessonById } from "../../lessons/specs";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  type Stack,
} from "./helpers";

const LANE_OFFSET = 4.0625;

function stagedOf<T>(lessonId: string, eventId: string): T {
  const lesson = lessonById(lessonId);
  const spec = lesson?.stagedEvents?.find((e) => e.id === eventId);
  if (!spec) throw new Error(`missing staged event ${eventId} on ${lessonId}`);
  return spec as T;
}

function edgeGeometry(edgeId: string): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`edge ${edgeId} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

const reversed = (points: Array<[number, number]>): Array<[number, number]> => [...points].reverse();

function concat(...legs: Array<Array<[number, number]>>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const leg of legs) {
    for (const p of leg) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.05) continue;
      out.push(p);
    }
  }
  return out;
}

const spec = stagedOf<PriorityFromRightSpec>("l2-intersections", "l2-priority-from-right");

/** The spawn-4 route of the L2 lesson: north on the oneways, right turn east at
 *  the Б2 T-junction, on to the arterial — the same path events-integration
 *  drives for this staged event, so the two suites grade one choreography. */
const path = () =>
  concat(
    edgeGeometry("e226063192.0"),
    edgeGeometry("e897608662.0"),
    offsetRight(reversed(edgeGeometry("e904964433.0")), LANE_OFFSET),
    offsetRight(reversed(edgeGeometry("e30122178.0")), LANE_OFFSET),
    offsetRight(reversed(edgeGeometry("e1375487708.0")), LANE_OFFSET),
    offsetRight(reversed(edgeGeometry("e1375487707.0")), LANE_OFFSET),
    offsetRight(edgeGeometry("e672169337.0"), 4),
  );

const carCleared = (stack: Stack): boolean => {
  const view = stack.traffic.staged(spec.id)!;
  return view.s > view.nodeS[spec.junctionNodeIndex] + 30;
};

describe("the yield commendation requires the wait it names", () => {
  it("the honest wait still earns it — stopped short of the line while the car crosses", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 90);
    const waitAt = driver.arcOf(spec.junction.x, spec.junction.y) - 20;
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      const target = driver.s >= waitAt && !carCleared(stack) ? 0 : driver.s >= waitAt ? 5 : 7.8;
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
  });

  it("a standstill produced by an IMPACT at the mouth earns nothing", () => {
    // The w14 frame's own pose. Every condition of the old latch is met — under
    // 8 км/ч, inside the line window, the staged car crossing in front of him —
    // and the only difference from the test above is WHY he is not moving.
    // `pushCollision` is the production entry point: LessonScene.tsx:2156 calls
    // it from the physics contact handler, the runtime drains the queue into the
    // tick's own events, and the rule engine bills the −10 «Удар в неподвижно
    // препятствие» off the same array the director reads.
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 90);
    const waitAt = driver.arcOf(spec.junction.x, spec.junction.y) - 20;
    let struck = false;
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      const halted = driver.s >= waitAt;
      const target = halted && !carCleared(stack) ? 0 : halted ? 5 : 7.8;
      const pose = driver.advance(DT, target);
      if (halted && !struck) {
        struck = true;
        stack.runtime.pushCollision("staticObject");
      }
      stepFrame(stack, pose);
    }
    expect(struck, "the drive never reached the halt pose — fixture broken").toBe(true);
    expect(stack.outcomes).toHaveLength(1);
    // The impact itself is graded, loudly, exactly as before — this row is only
    // about the card that said he had given way.
    expect(stack.ruleEvents.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(
      true,
    );
    expect(commendationCodes(stack.ruleEvents)).not.toContain("YIELDED_TO_PRIORITY");
  });
});
