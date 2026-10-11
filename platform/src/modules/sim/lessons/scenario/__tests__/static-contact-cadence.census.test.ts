/**
 * sc-hz-brake-dont-swerve:a7d0dd29 — THE STATIC-CONTACT CENSUS: every lesson
 * whose scenario places a hittable WALL or PROP, every rung, every such body,
 * driven into on rapier at 60 Hz, 30 Hz, the w69 phone deltas and a 2 fps lens
 * (rapierContactDrive.ts: @react-three/rapier's stepper, VehicleRig's contact
 * path and LessonScene's own graded call, executed).
 *
 * THE CLAIM: one drive, one sheet, on every display — the contacts the rig
 * judged (their grid point, impact speed, class, graded or not), the COLLISION
 * bills, and the whole `buildLessonResult` sheet are the 60 Hz ones.
 *
 * THE CENSUS (who is in it, stated): sc-pk-driveway (2 walls),
 * sc-merge-roadworks-shift (10 props), sc-ed-poligon-chain (2 props),
 * sc-hz-brake-dont-swerve (1 wall), sc-park-wall (1 wall) — every template
 * whose built obstacle list holds a hittable `wall` or `prop`; the drive starts
 * 18 m behind the body on its own axis, at 25 км/ч, and stands on the brake
 * after the crash. NOT IN IT: GLB-measured parked vehicles (their collider is
 * sized at load; no table states it), the fuel forecourt of
 * sc-merge-from-property (columns and pumps, not modelled here). Every drive
 * runs in the lesson's full district (buildings and the drive-over surface
 * mounted), so whatever it strikes first is in the census too.
 *
 * `CENSUS_OUT=<file>` writes every cell's digest (the lane's base-vs-tree
 * comparison runs this same file on the base and diffs the 60 Hz rows).
 *
 * THE COUNT, HELD AT 60 Hz (the landing; verifier condition F5, mutant V2).
 * «One sheet on every display» compares the tree with itself, so it cannot see
 * HOW OFTEN a contact is heard: a step record that counted only the manifolds
 * in solver contact — where @react-three/rapier called the old handler for
 * EVERY manifold of a started pair — is the same on every cadence and passed
 * all of the above. The hz lesson's audit drives could not see it either: each
 * of their started pairs holds one manifold. THE CENSUS CAN: 13 of its 112
 * started pairs (measured at the landing: sc-pk-driveway wall#1 at L1/2/3/5 —
 * 2 manifolds, 1 in solver contact; sc-park-wall wall#4 at L1–L5 — 4 held, 2
 * in contact, and on four rungs the drive-over surface 4 held, 3 in contact)
 * hold a manifold with no solver contact when they start. So the last test
 * audits every cell at one step per frame against rapier's own STARTED events,
 * one line per manifold, exactly what base's `onCollisionEnter` was handed.
 */
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { loadDistrict } from "./witnessLiveRung";
import { driveIntoContact, initRapier, judgedUntilEnd, phased, sheetDigest, type DriveState } from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);
const CADENCES: ReadonlyArray<readonly [string, readonly number[], number]> = [
  ["30 Hz", [1 / 30], 2],
  ["w69 phone A", W69, 4],
  ["2 fps lens", [0.5], 6],
];

interface Target {
  id: string;
  body: string;
  x: number;
  y: number;
  headingDeg: number;
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const obs = buildLessonWorldCore(compileScenario(spec, 1), loadDistrict(spec.map.districtId)).scenarioObstacles;
    obs.forEach((o, i) => {
      if (o.kind === "wall" || o.kind === "prop") {
        out.push({ id: spec.id, body: `${o.kind}#${i}`, x: o.x, y: o.y, headingDeg: o.headingDeg });
      }
    });
  }
  return out;
}

/** 25 км/ч straight at the body; the brake from the step after the crash. */
function control() {
  let prev = 0;
  let crashed = false;
  return (st: DriveState) => {
    if (prev - st.speedKmh > 8) crashed = true;
    prev = st.speedKmh;
    if (crashed) return { throttle: 0, brake: 1, steer: 0 };
    const err = 25 - st.speedKmh;
    return { throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.1, brake: 0, steer: 0 };
  };
}

interface Row {
  cell: string;
  cadence: string;
  lead: number;
  judged: string;
  collisions: string;
  sheet: string;
  impactStep: number;
}

const ROWS: Row[] = [];

function digest(t: Target, level: ScenarioLevel, cadence: string, deltas: readonly number[], lead: number): Row {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === t.id)!;
  const rad = (t.headingDeg * Math.PI) / 180;
  const o = driveIntoContact({
    lesson: compileScenario(spec, level),
    raw: loadDistrict(spec.map.districtId),
    start: { x: t.x - 18 * Math.sin(rad), y: t.y - 18 * Math.cos(rad), headingDeg: t.headingDeg },
    control: control(),
    deltas: phased(deltas, lead),
    maxSteps: 60 * 8,
  });
  const row: Row = {
    cell: `${t.id}/L${level}/${t.body}`,
    cadence,
    lead,
    judged: JSON.stringify(judgedUntilEnd(o).map((j) => [j.bookedStep, +j.impactKmh.toFixed(6), j.withWhat, j.graded])),
    collisions: JSON.stringify(o.collisions),
    sheet: sheetDigest(o.result),
    impactStep: o.impactStep,
  };
  ROWS.push(row);
  return row;
}

describe("the static-contact census — one drive, one sheet, on every display", () => {
  const all = targets();

  it("the census holds the five templates with hittable walls or props, and their sixteen bodies", () => {
    expect([...new Set(all.map((t) => t.id))].sort()).toEqual([
      "sc-ed-poligon-chain",
      "sc-hz-brake-dont-swerve",
      "sc-merge-roadworks-shift",
      "sc-park-wall",
      "sc-pk-driveway",
    ]);
    expect(all.length).toBe(16);
  });

  for (const level of [1, 2, 3, 4, 5] as const) {
    it(`L${level}: every body, every cadence and phase — the judged contacts, the bills and the sheet are 60 Hz's`, () => {
      const wrong: string[] = [];
      let contacts = 0;
      for (const t of all) {
        const ref = digest(t, level, "60 Hz", [1 / 60], 0);
        if (ref.judged !== "[]") contacts++;
        for (const [label, deltas, phases] of CADENCES) {
          for (let lead = 0; lead < phases; lead++) {
            const r = digest(t, level, label, deltas, lead);
            for (const k of ["judged", "collisions", "sheet", "impactStep"] as const) {
              if (r[k] !== ref[k]) wrong.push(`${r.cell} ${label} lead ${lead}: ${k} ${String(r[k]).slice(0, 160)} — 60 Hz ${String(ref[k]).slice(0, 160)}`);
            }
          }
        }
      }
      expect(contacts, "the drives struck nothing — the census proves nothing").toBeGreaterThan(all.length / 2);
      expect(wrong.slice(0, 12)).toEqual([]);
    });
  }

  it("60 Hz, every cell: the step record began exactly the contacts @react-three/rapier handed the old onCollisionEnter — one per manifold the started pair HOLDS, in solver contact or not", () => {
    const wrong: string[] = [];
    let started = 0;
    let idle = 0;
    const idleCells = new Set<string>();
    for (const t of all) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === t.id)!;
      const rad = (t.headingDeg * Math.PI) / 180;
      for (const level of [1, 2, 3, 4, 5] as const) {
        const o = driveIntoContact({
          lesson: compileScenario(spec, level),
          raw: loadDistrict(spec.map.districtId),
          start: { x: t.x - 18 * Math.sin(rad), y: t.y - 18 * Math.cos(rad), headingDeg: t.headingDeg },
          control: control(),
          deltas: [1 / 60],
          maxSteps: 60 * 8,
          auditStartedEvents: true,
        });
        const cell = `${t.id}/L${level}/${t.body}`;
        if (o.maxStepsPerFrame !== 1) wrong.push(`${cell}: ${o.maxStepsPerFrame} steps in a frame — not the 60 Hz audit`);
        started += o.rapierStarted.length;
        idle += o.startedWithIdleManifold;
        if (o.startedWithIdleManifold > 0) idleCells.add(`${t.id}/${t.body}`);
        if (JSON.stringify(o.stepRecordStarted) !== JSON.stringify(o.rapierStarted)) {
          wrong.push(
            `${cell}: the step record began ${o.stepRecordStarted.length} contact(s) ${JSON.stringify(o.stepRecordStarted).slice(0, 200)} — rapier STARTED, one per manifold: ${o.rapierStarted.length} ${JSON.stringify(o.rapierStarted).slice(0, 200)}`,
          );
        }
      }
    }
    expect(started, "rapier reported no contact anywhere — the audit proves nothing").toBeGreaterThan(all.length * 5 / 2);
    // What makes this an audit of the COUNT: started pairs that hold a manifold
    // with no solver contact. Without one, «every manifold» and «every manifold
    // in solver contact» are the same number and this test could not fail on it.
    expect(idle, "no started pair held an idle manifold — the audit no longer tells the two counts apart").toBeGreaterThan(0);
    expect([...idleCells].sort()).toEqual(["sc-park-wall/wall#4", "sc-pk-driveway/wall#1"]);
    expect(wrong.slice(0, 12)).toEqual([]);
  });

  it("writes the digests when asked (CENSUS_OUT)", () => {
    const out = process.env.CENSUS_OUT;
    if (out) writeFileSync(out, JSON.stringify(ROWS, null, 1));
    expect(ROWS.length).toBe(16 * 5 * (1 + 2 + 4 + 6));
  });
});
