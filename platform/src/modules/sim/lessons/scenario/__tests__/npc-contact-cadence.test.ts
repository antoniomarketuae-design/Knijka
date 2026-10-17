/**
 * sc-roundabout-entry:08a0b701 [major] — ONE DRIVE MEETS THE SAME ROAD USER AT
 * THE SAME PHYSICS STEP ON EVERY DISPLAY.
 *
 * THE DEFECT (rig-w3d, 2026-10-12, at 8cb0707 — after the landing that made a
 * contact a per-step record). With step-keyed input and one named start, three
 * things still moved with the display on this lesson's wrong-timing cells:
 * (i) the COLLISION's step (PC 3365, 3365; phone 3360, 3360, 3359, 3362) and
 * with it the printed fault time (0:55 against 0:56); (ii) after the same first
 * contact the PC runs added static-object hits the phone runs did not — a
 * different fault LIST by lens, and between two PC repeats; (iii) one phone run
 * never ended by itself (shell impact 32.7 км/ч where the others read 1–7).
 *
 * THE CAUSE, verified in process before anything was built (this file, run on
 * the base — the harness then moves the pool the way the base did). The other
 * body of a contact with a road user is a kinematic rapier «shell», and
 * components/sim/NpcColliders.tsx moved the pool in its own `useFrame`: ONCE
 * PER RENDER FRAME, to where the frame's last grid point had left each agent.
 * rapier moves a kinematic body to its next pose in ONE step and derives its
 * velocity from that move — so inside a frame of n physics steps the shell
 * leapt n steps' worth in the frame's first step (n times the agent's speed)
 * and stood still for the other n − 1. A car closing on a moving lead struck
 * the shell where the lead HAD BEEN, up to 41 steps early (the census,
 * sc-follow-rain-gap gap-melts L1: step 1669 against 1710); a crossing car's
 * shell leapt into the student; the impulse the solver applied — and so where
 * the car was thrown, what it hit next, and when the lesson ended — was the
 * frame's. A shell that does not move was the same body on every display, and
 * its cells agree on the base too (asserted below: that is what localises the
 * cause to the MOVE and not to the contact record).
 *
 * THE REPAIR. The pool lives on ADR-014's grid (scene/npcShells.ts): it is
 * posed once per graded grid point, after the point, from the student the grid
 * read there (`GradeGrid`'s `shells` hook), and who holds a shell is chosen on
 * the grid's index. And every physics step is graded BEFORE the next one is
 * taken (LessonScene's RuntimeDriver fills `stepLoopGradeRef` in a layout
 * effect; VehicleRig's before-step callback calls it first, before the next
 * step's input is read), so step k + 1 meets the world step k left — on
 * every display.
 *
 * WHAT THIS FILE HOLDS THE PRODUCT TO. Six committed mistake demos, each ending
 * in a contact with a road user — a car crossing in a roundabout, a car
 * crossing from the right, a moving lead, a STANDING car, two pedestrians —
 * are driven on rapier (rapierContactDrive.ts: @react-three/rapier's stepper,
 * the product's chassis and sim, VehicleRig's contact record and ear,
 * NpcColliders' pool mounted and moved by the product's own driver, and
 * LessonScene's own graded statements, cut out and executed) at 60 Hz, 30 Hz,
 * 13 fps and on 0.37 s frames, and at 60 Hz with one 0.37 s hitch at fifteen
 * positions around the contact. On every row:
 *   · every contact the rig judged — its grid point, its impact км/ч to the
 *     last bit, whom — is the 60 Hz one;
 *   · every COLLISION bill and the whole sheet are the 60 Hz ones;
 *   · the car is where the 60 Hz car is after EVERY physics step up to the
 *     close of the drive (the aftermath: where it was thrown, where it rests);
 *   · the session closes at the 60 Hz grid point.
 *
 * AND ITS TEETH. The same rows with the pool moved once per frame (the
 * harness's transcription of the base's callback), and with the pool on the
 * grid but the grid graded only at the frame's end, split — the two halves of
 * the repair, each red on its own.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { ScenarioLevel } from "../types";
import { driveDemo, drivePath, hitchAfter, rowDiffs, type NpcContactRow, type WrongTimingCell } from "./npcContactDrive";
import { initRapier } from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

/** [label, deltas] — the reference (60 Hz) is driven separately. */
const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["30 Hz", [1 / 30]],
  ["13 fps", [1 / 13]],
  ["0.37 s", [0.37]],
];

interface Cell {
  what: string;
  id: string;
  file: string;
  level: ScenarioLevel;
  /** The class the rig must hear, and whether the road user is moving. */
  kind: "vehicle" | "pedestrian";
  moving: boolean;
}

const CELLS: readonly Cell[] = [
  // The row's own family: a car circulating in the ring, struck in the mouth.
  { what: "a car crossing in the roundabout", id: "sc-rb-busy-gap", file: "mistake-short-gap.trace.json", level: 1, kind: "vehicle", moving: true },
  { what: "a car crossing from the right", id: "sc-junction-rhr", file: "mistake-no-look.trace.json", level: 1, kind: "vehicle", moving: true },
  { what: "a moving lead car", id: "sc-follow-distance", file: "mistake-tailgate.trace.json", level: 1, kind: "vehicle", moving: true },
  { what: "a standing car", id: "sc-follow-brake", file: "mistake-no-reaction.trace.json", level: 1, kind: "vehicle", moving: false },
  { what: "a pedestrian running out", id: "sc-crossing-child-ball", file: "mistake-collision.trace.json", level: 1, kind: "pedestrian", moving: true },
  { what: "a pedestrian crossing", id: "sc-pe-jaywalker", file: "mistake-collision.trace.json", level: 1, kind: "pedestrian", moving: true },
];

const REF = new Map<string, NpcContactRow>();
const ref60 = (c: Cell): NpcContactRow => {
  const key = `${c.id}/${c.file}/${c.level}`;
  let r = REF.get(key);
  if (!r) {
    r = driveDemo(c.id, c.file, c.level, "60 Hz", [1 / 60]);
    REF.set(key, r);
  }
  return r;
};

describe("a contact with a road user — one drive, one body, one step, on every display", () => {
  it("the pool is moved by the product's own driver, from the scene's own graded statements — and every 60 Hz drive strikes the road user its name says", () => {
    for (const c of CELLS) {
      const r = ref60(c);
      // The repair's wiring, executed: NpcShellPool reached through the grid's
      // hook, the scene's call in `gradeTakenSteps` with its step-loop caller.
      expect({ shells: r.shellClock, scene: r.sceneShape }, c.what).toEqual({ shells: "product", scene: "function" });
      expect(r.maxStepsPerFrame, `${c.what}: steps per frame at 60 Hz`).toBe(1);
      expect(r.firstNpcStep, `${c.what}: the drive touched no road user — the cell proves nothing`).toBeGreaterThan(0);
      expect(r.firstNpcKind, c.what).toBe(c.kind);
      if (c.moving) expect(r.firstNpcSpeedKmh, `${c.what}: the road user's own speed at the contact`).toBeGreaterThan(3);
      else expect(r.firstNpcSpeedKmh, `${c.what}: the road user's own speed at the contact`).toBeLessThan(0.5);
      // …and the contact is billed (these are the demos' mistakes).
      expect(r.bills, c.what).toContain(`"withWhat":"${c.kind}"`);
    }
  }, 300_000);

  for (const c of CELLS) {
    it(`${c.what} (${c.id} ${c.file.replace(".trace.json", "")} L${c.level}): 30 Hz, 13 fps and 0.37 s frames — the contact's step, its judged impact, the bills, the sheet, the car after every step and the close are 60 Hz's`, () => {
      const ref = ref60(c);
      const wrong: string[] = [];
      for (const [label, deltas] of CADENCES) {
        const r = driveDemo(c.id, c.file, c.level, label, deltas);
        expect(r.maxStepsPerFrame, `${label}: steps per frame`).toBeGreaterThan(1);
        wrong.push(...rowDiffs(r, ref));
      }
      expect(wrong).toEqual([]);
    }, 300_000);

    it(`${c.what}: a 0.37 s hitch on a 60 Hz display, at 15 positions around the contact — the same`, () => {
      const ref = ref60(c);
      const wrong: string[] = [];
      // The hitch frame begins 8 … −6 steps before the contact: the contact
      // lands on its 8th … 1st step, or the frame begins up to 6 steps after
      // it (the aftermath inside the long frame).
      for (let j = 0; j < 15; j++) {
        const before = ref.firstNpcStep - 8 + j;
        const r = driveDemo(c.id, c.file, c.level, `60 Hz, 0.37 s hitch after ${before} frames`, hitchAfter(before, 0.37));
        expect(r.maxStepsPerFrame).toBeGreaterThanOrEqual(22);
        wrong.push(...rowDiffs(r, ref));
      }
      expect(wrong.slice(0, 8)).toEqual([]);
    }, 600_000);
  }
});

/**
 * THE ROW'S OWN LESSON, IN THE RIG'S OWN SHAPE. rig-w3d's kept cells
 * («L1 V12 H1707 …») approach the roundabout, stop about 22 m short of the
 * give-way line, hold until a named step and then enter at 12 км/ч whatever is
 * in the ring. The same shape in process: the lesson's committed path
 * (shadow-correct), a ramped stop at y = −50, a go step, 12 км/ч — the go
 * steps below were found by sweeping it in 20-step strides at 60 Hz (the
 * lane's report carries the sweep) and are the three kinds of contact that
 * sweep meets on this lesson:
 *
 *   go 2300 — the circulating car, crossing: the director's sentinel reports
 *             it first (point 2913), the rig's ear a step later; the car is
 *             then carried into the island — a second, static-object bill
 *             (the class of the row's (ii): a fault LIST that moved by lens);
 *   go 2320 — the circulating car again, but touched by rapier alone at the
 *             bill's point (the sentinel's boxes do not overlap there) — the
 *             class of the row's (i), the stamp that moved with the display;
 *   go 1600 — an AMBIENT pedestrian on the arm: no runner casts him, so the
 *             sentinel never speaks and the ear's is the only report.
 *
 * THE THIRD CELL, RE-POINTED 2026-10-17 (the posturescross landing on 1f1536d,
 * sc-sig-controller-postures:4f446777). The go-1600 walker was an ambient
 * PAVEMENT walker whose beat ran on into the roundabout's junction — the defect
 * that repair removes: the beat now stops where the pavement does (walker 0 on
 * x 8.8 walked to y −18.1 at 1f1536d, to −36.6 now). Swept as npcstep swept it
 * (hold −50, go 900–3300 every 20 steps, 121 drives): 1f1536d 18 ambient-
 * pedestrian contacts (go 1260–1600, every one the ear's), 3 vehicle, 100 none;
 * the merged tree 0 — 3 vehicle, 118 none. No committed census cell strikes an
 * ambient pedestrian any more either (1f1536d: 3, sc-vu-bikelane-turn
 * mistake-cut-path L1–L3, the same pavement-walker class). The ear-only path is the same for any
 * walker no runner casts, so the cell moved to one the lawful world still
 * offers: an ambient walker on a MARKED crossing. Every template × rung was
 * scanned for an ambient crossing walker whose zebra a committed path crosses
 * (2 places: sc-pk-crossing-ban L5's pkx-x-zebra at y 260 and sc-ed-d2-city-run
 * L5); on sc-pk-crossing-ban L5 (its correct path, 12 км/ч) a student standing
 * at y 250–252 lets walker 0 step out (a standing car does not close the
 * crossing's gate) and drives into him: hold 252, go 2200–2700 every 10 steps,
 * 51 drives → 9 contacts, go 2260–2340 contiguous, every one walker 0 at
 * 6.1 км/ч, ear only (report body null, the sentinel silent), no static bill
 * (hold 250: 5 more, go 2260–2300). go 2300 is the middle of the band: the
 * first contact at grid point 2435, judged 3.2 км/ч.
 */
interface RbEntryCell {
  what: string;
  cell: WrongTimingCell;
  kind: "vehicle" | "pedestrian";
  billedBy: NpcContactRow["billedBy"];
  staticToo: boolean;
  /** The lesson, path and rung driven, when not sc-roundabout-entry's shadow-correct L1. */
  where?: { id: string; file: string; level: ScenarioLevel };
}
const RB_ENTRY_CELLS: ReadonlyArray<RbEntryCell> = [
  { what: "the circulating car, crossing (the sentinel first)", cell: { holdAtY: -50, goStep: 2300, cruiseKmh: 12, runSteps: 1500 }, kind: "vehicle", billedBy: "sentinel", staticToo: true },
  { what: "the circulating car, touched by rapier alone", cell: { holdAtY: -50, goStep: 2320, cruiseKmh: 12, runSteps: 1500 }, kind: "vehicle", billedBy: "ear", staticToo: false },
  {
    what: "an ambient pedestrian on a marked crossing (the ear's only)",
    cell: { holdAtY: 252, goStep: 2300, cruiseKmh: 12, runSteps: 1500 },
    kind: "pedestrian",
    billedBy: "ear",
    staticToo: false,
    where: { id: "sc-pk-crossing-ban", file: "shadow-correct.trace.json", level: 5 },
  },
];

describe("the row's own lesson — sc-roundabout-entry L1, hold at y = −50, enter at 12 км/ч at a named step (and the ear's-only walker on sc-pk-crossing-ban L5's zebra)", () => {
  const ROW_OWN = { id: "sc-roundabout-entry", file: "shadow-correct.trace.json", level: 1 as ScenarioLevel };
  const drive = (c: RbEntryCell, label: string, deltas: readonly number[]) => {
    const w = c.where ?? ROW_OWN;
    return drivePath(w.id, w.file, w.level, c.cell, label, deltas);
  };
  const refs = new Map<string, NpcContactRow>();
  const ref = (c: RbEntryCell) => {
    const key = `${(c.where ?? ROW_OWN).id}/${c.cell.goStep}`;
    let r = refs.get(key);
    if (!r) {
      r = drive(c, "60 Hz", [1 / 60]);
      refs.set(key, r);
    }
    return r;
  };

  it("at 60 Hz each cell is the contact its name says: whom, a MOVING road user, which reporter stamped the bill — and the crossing cell goes on to strike the island", () => {
    for (const c of RB_ENTRY_CELLS) {
      const r = ref(c);
      expect(r.firstNpcStep, c.what).toBeGreaterThan(c.cell.goStep);
      expect(r.firstNpcKind, c.what).toBe(c.kind);
      expect(r.firstNpcSpeedKmh, `${c.what}: the road user's own speed`).toBeGreaterThan(3);
      expect(r.billedBy, c.what).toBe(c.billedBy);
      expect(r.billStep, c.what).toBe(r.firstReportStep);
      expect(r.bills.includes('"withWhat":"staticObject"'), `${c.what}: a static-object bill after the first contact`).toBe(c.staticToo);
    }
  }, 300_000);

  for (const c of RB_ENTRY_CELLS) {
    it(`${c.what} (go ${c.cell.goStep}): 30 Hz, 13 fps, 0.37 s frames and a 0.37 s hitch at 15 positions around the contact — the stamp's step, the fault list, the car after every step and the close are 60 Hz's`, () => {
      const r60 = ref(c);
      const wrong: string[] = [];
      for (const [label, deltas] of CADENCES) wrong.push(...rowDiffs(drive(c, label, deltas), r60));
      for (let j = 0; j < 15; j++) {
        const before = r60.firstNpcStep - 8 + j;
        wrong.push(...rowDiffs(drive(c, `60 Hz, 0.37 s hitch after ${before} frames`, hitchAfter(before, 0.37)), r60));
      }
      expect(wrong.slice(0, 8)).toEqual([]);
    }, 900_000);
  }
});

describe("the teeth — each half of the repair, taken away, is seen", () => {
  const moving = CELLS.filter((c) => c.moving);
  const standing = CELLS.filter((c) => !c.moving);

  it("WHAT IT WAS: the pool moved once per render frame (the base's callback, transcribed) — every moving road user is a different body on 13 fps and 0.37 s frames; a standing one is not", () => {
    const split: string[] = [];
    for (const c of moving) {
      const ref = driveDemo(c.id, c.file, c.level, "60 Hz", [1 / 60], { npcShells: "frame" });
      expect(ref.shellClock).toBe("frame");
      // At one step per frame the frame's move IS the step's move: the 60 Hz
      // drive is the product's, to the last bit.
      expect(rowDiffs(ref, ref60(c)), `${c.what}: 60 Hz, frame-moved pool vs the product`).toEqual([]);
      let differing = 0;
      for (const [label, deltas] of CADENCES.slice(1)) {
        const d = rowDiffs(driveDemo(c.id, c.file, c.level, label, deltas, { npcShells: "frame" }), ref);
        if (d.length > 0) differing++;
      }
      if (differing === CADENCES.length - 1) split.push(c.what);
    }
    expect(split).toEqual(moving.map((c) => c.what));
    for (const c of standing) {
      const ref = driveDemo(c.id, c.file, c.level, "60 Hz", [1 / 60], { npcShells: "frame" });
      for (const [label, deltas] of CADENCES) {
        expect(rowDiffs(driveDemo(c.id, c.file, c.level, label, deltas, { npcShells: "frame" }), ref), `${c.what} ${label}`).toEqual([]);
      }
    }
  }, 900_000);

  it("THE OTHER HALF: the pool on the grid, but the grid graded only at the frame's end (the scene's before-step callback not run) — a frame of n steps still poses it once, and the moving cells split again", () => {
    const split: string[] = [];
    for (const c of moving) {
      const ref = ref60(c);
      let differing = 0;
      for (const [label, deltas] of CADENCES.slice(1)) {
        const d = rowDiffs(driveDemo(c.id, c.file, c.level, label, deltas, { sceneBeforeStep: "skip" }), ref);
        if (d.length > 0) differing++;
      }
      if (differing === CADENCES.length - 1) split.push(c.what);
    }
    expect(split).toEqual(moving.map((c) => c.what));
  }, 900_000);
});
