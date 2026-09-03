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

import nodeFs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PriorityFromRightSpec, StagedEventSpec } from "../../contracts";
import { SC_JUNCTION_SCAN } from "../../lessons/scenario/templates-junctions";
import { recordScriptedDrive, type RecordedDrive } from "../../traces/recorder";
import { recordScJunctionScanDrive } from "../../traces/scJunctionScan";
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

// ---------------------------------------------------------------------------
// …AND THE WAIT HAS TO BE MADE SHORT OF THE LINE — the same row, re-measured
// on the w25 re-drive at tree bf4a516 (2026-09-04).
// ---------------------------------------------------------------------------

/**
 * THE ROW SURVIVED ITS OWN REPAIR ON THE OTHER PLATFORM LEG, and the two logs
 * say so side by side. `.audit-frames/w25/frames/sc-junction-scan__mobile-wrong/
 * run.log:472` — the leg the finding was filed on — now reads «COMMENDATIONS
 * (0)»; `…__pc-wrong/run.log:390` still reads «★ ✓ Правилно отстъпено
 * предимство 0:40», on a drive the SAME sheet convicts of «Неспиране на знак Б2
 * „Спри!“» and «Непълно оглеждане при знак Б2» (`:MISTAKES`). Those two are the
 * product's own voice, not the harness ledger: it says he crossed the paint
 * without stopping and without looking, and then commends his giving way.
 *
 * Replayed here through the production stack on the drill's own district — the
 * fault set below is the w25 PC leg's, code for code. The wait he banked was
 * spent standing 8 m PAST the node, after cutting in front of the car he is
 * being praised for. `playerLineDist` is `Math.max(0, d − lineDistM)` and
 * cannot tell that pose from a stop at the paint; the pose test now also asks
 * whether he is at/short of the line and pointed at the junction.
 *
 * The positive control is in the same block on purpose: the drill's own
 * committed shadow — a full stop 1.8 m short of the line and a real wait — must
 * still collect the card, or this gate would be passing by muting the channel.
 */
describe("the yield commendation requires a wait made short of the line", () => {
  const REPO_ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
  const scanDistrict = JSON.parse(
    nodeFs.readFileSync(nodePath.join(REPO_ROOT, "content", "world", "tj-scan-v1.json"), "utf-8"),
  ) as unknown;
  const LANE = 4.0625; // tj-scan-v1's drawn right-lane centre
  const scanStaged = [...(SC_JUNCTION_SCAN.staged ?? [])] as StagedEventSpec[];

  const codesOf = (d: RecordedDrive, kind: "violation" | "commendation") =>
    d.ruleEvents.filter((e) => e.kind === kind).map((e) => e.code);

  it("barging over the Б2 line and resting PAST the node earns no card", () => {
    const drive = recordScriptedDrive(
      scanDistrict,
      {
        steps: [
          // 57 км/ч from the spawn, straight over the paint at y = −27.725 and
          // on across the priority road — no stop, no glance — then pinned on
          // the far kerb while the car he cut in front of crosses behind him.
          { kind: "drive", points: [[LANE, -95], [LANE, 8]], targetKmh: 57 },
          { kind: "pause", sec: 14, brake: true },
          { kind: "collision", withWhat: "staticObject" },
          { kind: "pause", sec: 8, brake: true },
        ],
      },
      {
        scenarioId: "sc-junction-scan",
        kind: "mistake",
        seed: 7,
        stagedEvents: scanStaged,
        ruleConfig: { junctionScanObservationEnabled: true },
      },
    );
    // The w25 PC leg's own fault set — the fixture is the finding, not a shape
    // invented to fail.
    const violations = codesOf(drive, "violation");
    expect(violations).toContain("SPEEDING_DANGEROUS");
    expect(violations).toContain("STOP_SIGN_NO_FULL_STOP");
    expect(violations).toContain("JUNCTION_SCAN_INCOMPLETE");
    expect(violations).toContain("COLLISION");
    expect(codesOf(drive, "commendation")).not.toContain("YIELDED_TO_PRIORITY");
    // SCOPE: the OUTCOME is deliberately untouched — `sawYield` still labels it,
    // so every committed trace's `detail` stays byte-identical (the file header).
    expect(drive.outcomes.map((o) => o.detail)).toEqual(["yielded"]);
  });

  it("resting on the EXIT arm after the turn earns no card either", () => {
    // The same falsehood without the crash: the turn is completed, he stops
    // 20 m east of the node, and the priority car goes by behind him.
    const arc: Array<[number, number]> = [];
    for (let k = 1; k <= 8; k++) {
      const a = ((180 - (90 * k) / 8) * Math.PI) / 180;
      arc.push([24.0625 + 20 * Math.cos(a), -24.0625 + 20 * Math.sin(a)]);
    }
    const drive = recordScriptedDrive(
      scanDistrict,
      {
        steps: [
          { kind: "drive", points: [[LANE, -95], [LANE, -24.06], ...arc, [20, -LANE]], targetKmh: 57 },
          { kind: "pause", sec: 14, brake: true },
          { kind: "drive", points: [[20, -LANE], [58, -LANE]], targetKmh: 25 },
          { kind: "pause", sec: 3, brake: true },
        ],
      },
      {
        scenarioId: "sc-junction-scan",
        kind: "mistake",
        seed: 7,
        stagedEvents: scanStaged,
        ruleConfig: { junctionScanObservationEnabled: true },
      },
    );
    expect(codesOf(drive, "violation")).toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codesOf(drive, "commendation")).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("the drill's own shadow — stopped short of the line — still earns it", () => {
    const shadow = recordScJunctionScanDrive(scanDistrict, "shadow-correct");
    expect(codesOf(shadow, "violation")).toEqual([]);
    expect(codesOf(shadow, "commendation")).toContain("YIELDED_TO_PRIORITY");
  });
});
