/**
 * A COMMITTED CONTACT DEMO, DRIVEN ON RAPIER INTO NpcColliders' SHELLS — the
 * shared drive of sc-roundabout-entry:08a0b701's two test files (lane npcstep):
 * npc-contact-cadence.test.ts (three kinds of road user, four cadences, a hitch
 * at fifteen positions) and npc-contact-cadence.census.test.ts (every committed
 * demo that ends in a contact with a road user, every rung).
 *
 * WHAT A ROW IS. One lesson rung, one committed demo tape, one display
 * cadence: the product's chassis follows the tape on rapier
 * (rapierContactDrive.ts `followTape` — decided per physics step from the car
 * the step record holds, so the car's trajectory up to its first contact is one
 * trajectory on every cadence), NpcColliders' pool is mounted and moved by the
 * product, the scene's own graded statements are executed, and every tick is
 * folded into the real session. The row keeps what must not depend on the
 * display:
 *
 *   judged  — every contact the rig's ear judged up to the close of the drive:
 *             its grid point, its impact km/h (to the last bit), whom, graded;
 *   bills   — every COLLISION in the session ledger: time, points, whom;
 *   reports — every `collision` event the session's ticks carried, from
 *             EITHER reporter (the rig's ear for a contact rapier found; the
 *             director's sentinel for boxes that overlap on the grid): its
 *             grid point, whom, the body's name;
 *   sheet   — the whole `buildLessonResult` sheet;
 *   poses   — a hash of the car after EVERY physics step up to the close
 *             (x, y, heading, speed, all 64 bits): where it was thrown, where
 *             it came to rest, whether it then struck something else;
 *   closedAt — the grid point the session ended at (or the drive's last step).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { loadDistrict } from "./witnessLiveRung";
import {
  driveIntoContact,
  followPath,
  followTape,
  judgedUntilEnd,
  sheetDigest,
  type ContactDriveOptions,
  type ContactDriveOutcome,
  type DriveState,
} from "./rapierContactDrive";
import type { VehicleInput } from "../../../vehicle";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** Steps the drive runs on after the tape's last sample (the car is braked). */
const TAIL_STEPS = 240;

const TRACES = new Map<string, ScenarioTrace>();
export function demoTrace(id: string, file: string): ScenarioTrace {
  const key = `${id}/${file}`;
  let t = TRACES.get(key);
  if (!t) {
    const parsed = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")));
    if (!parsed) throw new Error(`unreadable trace ${key}`);
    t = parsed;
    TRACES.set(key, t);
  }
  return t;
}

export interface NpcContactRow {
  cell: string;
  cadence: string;
  /** Who moved the pool, and which shape of the scene's statements ran. */
  shellClock: ContactDriveOutcome["shellClock"];
  sceneShape: ContactDriveOutcome["sceneShape"];
  judged: string;
  bills: string;
  reports: string;
  sheet: string;
  poses: string;
  closedAt: number;
  /**
   * WHICH REPORTER STAMPED THE FIRST BILL for a road user: "ear" — the rig's
   * ear alone reported at the bill's grid point (rapier found the contact
   * first, or the sentinel never spoke); "sentinel" — the sentinel alone
   * (the boxes overlapped on the grid before rapier's solver touched);
   * "both" — both at that point; "" — nothing billed.
   */
  billedBy: "" | "ear" | "sentinel" | "both";
  /** The grid point of the first road-user bill, and of the first collision
   *  report with a road user from EITHER reporter (−1: none). */
  billStep: number;
  firstReportStep: number;
  /** Did each reporter speak at all before the close? */
  earSpoke: boolean;
  sentinelSpoke: boolean;
  /** The first judged contact with a tagged road user: its grid point (−1:
   *  the car touched none), the class the rig heard, the road user's own speed
   *  there and the impact the rig judged. */
  firstNpcStep: number;
  firstNpcKind: string;
  firstNpcSpeedKmh: number;
  firstNpcImpactKmh: number;
  /** Where the car was at the close: x, y, heading, speed. */
  restAtClose: [number, number, number, number];
  steps: number;
  maxStepsPerFrame: number;
}

/** What the comparison holds equal to the 60 Hz row. */
export const NPC_ROW_KEYS = ["judged", "bills", "reports", "sheet", "poses", "closedAt"] as const;

type DriveWiring = Pick<ContactDriveOptions, "npcShells" | "sceneBeforeStep">;

/** A committed demo, followed on its own clock (`followTape`). */
export function driveDemo(
  id: string,
  file: string,
  level: ScenarioLevel,
  cadence: string,
  deltas: readonly number[],
  o: DriveWiring = {},
): NpcContactRow {
  const trace = demoTrace(id, file);
  return driveRow(
    id,
    `${id}/${file.replace(".trace.json", "")}/L${level}`,
    level,
    trace,
    followTape(trace)(),
    Math.ceil(trace.samples[trace.samples.length - 1].tSec * 60) + TAIL_STEPS,
    cadence,
    deltas,
    o,
  );
}

/** How a wrong-timing cell is driven (`followPath`): hold short of the line
 *  until physics step `goStep`, then enter at `cruiseKmh`. */
export interface WrongTimingCell {
  holdAtY: number;
  goStep: number;
  cruiseKmh: number;
  /** Steps the drive runs on after the go. */
  runSteps: number;
}

/** A lesson's committed PATH, driven on a clock of the test's own: the rig's
 *  wrong-timing cells (rig-w3d «L1 V12 H…»). */
export function drivePath(
  id: string,
  file: string,
  level: ScenarioLevel,
  cell: WrongTimingCell,
  cadence: string,
  deltas: readonly number[],
  o: DriveWiring = {},
): NpcContactRow {
  const trace = demoTrace(id, file);
  return driveRow(
    id,
    `${id}/L${level}/V${cell.cruiseKmh}/go${cell.goStep}`,
    level,
    trace,
    followPath(trace, cell)(),
    cell.goStep + cell.runSteps,
    cadence,
    deltas,
    o,
  );
}

function driveRow(
  id: string,
  cellName: string,
  level: ScenarioLevel,
  trace: ScenarioTrace,
  control: (st: DriveState) => Partial<VehicleInput>,
  maxSteps: number,
  cadence: string,
  deltas: readonly number[],
  o: DriveWiring,
): NpcContactRow {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (!spec) throw new Error(`no template ${id}`);
  const s0 = trace.samples[0];
  const out = driveIntoContact({
    lesson: compileScenario(spec, level),
    raw: loadDistrict(spec.map.districtId),
    start: { x: s0.x, y: s0.y, headingDeg: s0.headingDeg },
    control,
    deltas,
    maxSteps,
    npcShells: o.npcShells ?? "product",
    sceneBeforeStep: o.sceneBeforeStep,
    tracePoses: true,
  });
  const closedAt = out.closedAtPoint;
  const judged = judgedUntilEnd(out);
  const upTo = Math.min(closedAt, out.poseAfterStep.length - 1);
  const flat = new Float64Array((upTo + 1) * 4);
  for (let i = 0; i <= upTo; i++) flat.set(out.poseAfterStep[i], i * 4);
  const firstNpc = judged.find((j) => j.npcId !== undefined);
  // Who spoke at each grid point: the ear's graded contacts with a road user
  // there, against every collision report with a road user on that tick.
  const isNpc = (w: string) => w === "vehicle" || w === "pedestrian" || w === "cyclist";
  const earAt = new Map<number, number>();
  for (const j of judged) if (j.graded && isNpc(j.withWhat)) earAt.set(j.bookedStep, (earAt.get(j.bookedStep) ?? 0) + 1);
  const allAt = new Map<number, number>();
  for (const [k, w] of out.collisionReports) if (isNpc(w)) allAt.set(k, (allAt.get(k) ?? 0) + 1);
  const firstBill = out.collisions.find((c) => isNpc(c.withWhat) || c.withWhat === "vehicleCutIn");
  const billStep = firstBill ? Math.round(firstBill.t * 60) : -1;
  const earThere = earAt.get(billStep) ?? 0;
  const sentinelThere = (allAt.get(billStep) ?? 0) - earThere;
  let sentinelSpoke = false;
  for (const [k, n] of allAt) if (n - (earAt.get(k) ?? 0) > 0) sentinelSpoke = true;
  return {
    cell: cellName,
    cadence,
    shellClock: out.shellClock,
    sceneShape: out.sceneShape,
    judged: JSON.stringify(judged.map((j) => [j.bookedStep, j.impactKmh, j.withWhat, j.graded, j.npcId ?? null])),
    bills: JSON.stringify(out.collisions),
    reports: JSON.stringify(out.collisionReports),
    billedBy: billStep < 0 ? "" : earThere > 0 && sentinelThere > 0 ? "both" : earThere > 0 ? "ear" : "sentinel",
    billStep,
    firstReportStep: allAt.size > 0 ? Math.min(...allAt.keys()) : -1,
    earSpoke: earAt.size > 0,
    sentinelSpoke,
    sheet: sheetDigest(out.result),
    poses: createHash("sha256").update(Buffer.from(flat.buffer)).digest("hex"),
    closedAt,
    firstNpcStep: firstNpc ? firstNpc.bookedStep : -1,
    firstNpcKind: firstNpc ? firstNpc.withWhat : "",
    firstNpcSpeedKmh: firstNpc?.npcSpeedKmh ?? NaN,
    firstNpcImpactKmh: firstNpc ? firstNpc.impactKmh : NaN,
    restAtClose: out.poseAfterStep[upTo],
    steps: out.steps,
    maxStepsPerFrame: out.maxStepsPerFrame,
  };
}

/** Every way `row` differs from the 60 Hz row of its cell, as lines. */
export function rowDiffs(row: NpcContactRow, ref: NpcContactRow): string[] {
  const out: string[] = [];
  for (const k of NPC_ROW_KEYS) {
    if (row[k] !== ref[k]) {
      out.push(`${row.cell} ${row.cadence}: ${k} ${String(row[k]).slice(0, 150)} — 60 Hz ${String(ref[k]).slice(0, 150)}`);
    }
  }
  return out;
}

/** w69-h1-mob frame deltas, s — verbatim from grade-grid-cadence.census. */
export const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);

const steady60 = (n: number) => Array.from({ length: n }, () => 1 / 60);
/** A 60 Hz display with ONE frame of `hitchSec` after `framesBefore` frames. */
export const hitchAfter = (framesBefore: number, hitchSec: number): number[] => [
  ...steady60(Math.max(0, framesBefore)),
  hitchSec,
  ...steady60(20_000),
];
