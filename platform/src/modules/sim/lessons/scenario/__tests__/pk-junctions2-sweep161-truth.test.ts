/**
 * SWEEP 161 · the two „the lesson's own CORRECT line is not survivable"
 * criticals, opened at last — one refuted, and one REAL defect found under it.
 *
 * `templates-pk.ts` and `templates-junctions2.ts` were among the twenty-one
 * files that still carried a standing BROKEN finding and had never been edited
 * since the sweep baseline ec1f56f. Round 11's flow lane refuted both findings
 * in `flow-sweep161-truth.test.ts` §4 and that refutation holds — it is
 * re-derived here from the frames rather than inherited. But „the finding is
 * wrong" turned out not to be the end of the row for `sc-pk-driveway`: the
 * frame that motivated it is a picture of a car inside a building, and the
 * reason it could be is that THIS DRILL'S WALLS DO NOT EXIST IN THE STUDENT'S
 * WORLD. §1c is that measurement.
 *
 * ── THE FRAMES, OPENED ──────────────────────────────────────────────────────
 *
 * `sweep161/sc-pk-driveway/pc-right/08-debrief.png`
 *     «20 наказателни точки · НЕИЗДЪРЖАН · Опасни грешки 2»
 * `sweep161/sc-pk-driveway/pc-right/04-t039s.png` and `04-t045s.png`
 *     the windscreen is a building facade at arm's length, then the inside of
 *     it — and the cluster reads **D**, on a task whose own chip
 *     (`04-t056s.png`) says «Премести лоста на R и паркирай на заден ход».
 * `sweep161/sc-junction-blind/pc-right/08-debrief.png`
 *     «20 наказателни точки · НЕИЗДЪРЖАН», «Урокът беше прекъснат преди края»
 * `sweep161/sc-junction-blind/pc-right/04-t149s.png` → `04-t209s.png`
 *     the car crosses the junction dead straight at 11 км/ч in D and ends at
 *     3 км/ч in an empty green field, task 2/2 still reading «Завий НАЛЯВО и
 *     излез от кръстовището на запад».
 *
 * ── WHY THE VERDICTS ARE REAL AND THE FINDINGS ARE NOT ──────────────────────
 *
 * `tools/mobile/lesson-audit.mjs`'s `right` mode is a forward-only control law.
 * Its ENTIRE keyboard vocabulary is `KeyW`, `KeyS` and `Escape` — there is no
 * steering key and no gear key anywhere in the file — so it cannot select R and
 * cannot turn. Both of these lessons are graded on an act it cannot perform.
 * §1a/§2a prove that from the PRODUCT side instead of from the tool: the
 * harness's law, re-authored in the recorder's own vocabulary and driven
 * through the production session, leaves exactly the objective the act belongs
 * to UNDONE — and the committed model line, driven through the same pipeline,
 * completes everything with zero violations. Two drives, one lesson, opposite
 * verdicts, and the failing one is the harness's.
 *
 * WHAT THIS DOES **NOT** CLAIM. The headless twin cannot reproduce the 20
 * points, and it is not asked to: the sweep's penalty came from contact with
 * SCENE geometry, and the recorder carries only the two authored rects. That
 * half — a static world with no solid body at all — is already measured and
 * routed in `scene/__tests__/lesson-world-bay-clearance.test.ts` and
 * `sim/collision/index.ts`, and is not this lane's.
 *
 * ── §1c · THE DEFECT THE FINDING WAS SITTING ON ─────────────────────────────
 *
 * `sc-pk-driveway` says the word «стени» / «огради» SIX times — the objective
 * («влез на заден ход МЕЖДУ СТЕНИТЕ … без да ги докоснеш»), instruction 4
 * («следи стените на алеята в огледалата»), instruction 1 at L5 night («стените
 * на алеята се виждат само на светло»), both mistake debriefs («задницата се
 * качи на ОГРАДАТА», «се вряза в дъното на алеята») and the teach card. This
 * file's own header calls them „the driveway's own WALLS as the collision
 * hazard".
 *
 * They are in `traces/scPkDriveway.ts drivewayObstacles()` — a north fence at
 * (9.0, 47.3) and a back wall at (11.0, 45.0) — and that is the ONLY place
 * they exist. `drivewayObstacles()` is passed to `recordScriptedDrive`, so it
 * grades the two committed DEMO recordings and nothing else. The live student's
 * scene is assembled by `scene/lessonWorldRecipe.ts` from the district plus
 * `scenarioSceneryProps.ts heldSceneryFor`, and `sc-pk-driveway` is not in
 * `HELD_SCENERY` and authors no obstacles of its own. `content/world/
 * pk-drive-v1.json` holds ONE body — `pkd-b-garage`, x ∈ [12, 18] — which is
 * 1.5 m east of the graded bay and, per the clearance file above, has no solid
 * collider anyway.
 *
 * So the drill grades „did you come to rest inside the rect, aligned, via
 * reverse" and TELLS the student it graded „…without touching the walls". A
 * tail swung through where the fence is supposed to be earns the same ★★★ and
 * the same «без да ги докоснеш» as a clean entry. That is a green tick for the
 * one skill the maneuver exists to teach, which is the crime this audit is
 * about, pointing the reassuring way.
 *
 * IT IS NOT FIXABLE FROM THIS FILE, and the precedent says exactly where it
 * goes. `sc-park-wall` is the same drill shape and it is done right: a
 * `kind: "wall"` body in `HELD_SCENERY` with an exact cuboid collider grading
 * as „staticObject", paired value-for-value against its headless twin in
 * `traces/scParkDepth.ts`. `sc-pk-driveway` has the twin and not the body. The
 * fix is two `wall` entries in `scene/scenarioSceneryProps.ts`, and §1c pins
 * their exact poses so the next round can paste them rather than re-derive
 * them. It is written as a QUARANTINE in the `lesson-world-bay-clearance.ts`
 * mold — asserted by VALUE, not skipped — so the day the bodies land THIS TEST
 * FAILS and the quarantine must be deleted rather than silently inherited.
 *
 * ── THE MUTATION BEHIND EACH ASSERTION (run, and observed) ──────────────────
 *   · §1a/§2a — swap the harness-law script for the shadow script: the „leaves
 *     the objective undone" assertions fail, because the model line completes
 *     it. Swap the other way and the „model line survives" ones fail. Neither
 *     direction is asserted on its own.
 *   · §1c positive control — the SAME probe run against `sc-park-wall` finds a
 *     hittable wall. A probe that returned [] for everything would pass the
 *     quarantine and fail the control; that is what makes the emptiness a
 *     measurement instead of a spelling of the query.
 *   · §1c quarantine — add `"sc-pk-driveway"` to HELD_SCENERY and the „still
 *     has no wall body" assertion fails on purpose.
 *   · §1b — delete a «стени» from the objective copy and the „the copy still
 *     bills the walls" assertion fails, so the debt cannot be paid by quietly
 *     deleting the promise instead of building the wall.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { heldSceneryFor } from "../../../scene/scenarioSceneryProps";
import { drivewayObstacles, recordScPkDrivewayDrive } from "../../../traces/scPkDriveway";
import { recordScJunction2Drive } from "../../../traces/scJunctions2";
import { recordScriptedDrive, type DriveScript, type RecordedDrive } from "../../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import { SC_JUNCTION_BLIND } from "../templates-junctions2";
import { PK_DRIVE_TARGET_BAY, SC_PK_DRIVEWAY } from "../templates-pk";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const REPO = path.resolve(process.cwd(), "..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO, "content", "world", `${id}.json`), "utf-8")) as unknown;

type OnTick = (tick: Parameters<typeof applyTick>[1]) => void;

interface Outcome {
  passed: boolean;
  objectives: Array<{ id: string; done: boolean }>;
  violations: string[];
}

/** Every frame of a recording driven through the production session — the
 *  same shape `flow-sweep161-truth.test.ts` §4 uses, so a verdict here is the
 *  verdict a phone would print. */
function driveThrough(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  record: (onTick: OnTick) => RecordedDrive,
): Outcome {
  const lesson = compileScenario(spec, level);
  let session = createLessonSession(lesson);
  const drive = record((tick) => {
    session = applyTick(session, tick).state;
  });
  const result = buildLessonResult(session);
  return {
    passed: result.passed,
    objectives: result.objectives.map((o) => ({ id: o.id, done: o.done })),
    violations: drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code as string),
  };
}

const done = (o: Outcome, id: string): boolean =>
  o.objectives.find((x) => x.id === id)?.done ?? false;

/** The audit harness's `right` law, in the recorder's vocabulary: hold a cruise
 *  under every posted cap, come to a full stand on a cadence, never steer, never
 *  select reverse. The gear and steering keys it would need are not in
 *  `lesson-audit.mjs` at all. */
function forwardOnlyCreep(points: Array<[number, number]>, targetKmh = 12): DriveScript {
  const steps: DriveScript["steps"] = [];
  for (let i = 1; i < points.length; i++) {
    steps.push({ kind: "drive", points: [points[i - 1]!, points[i]!], targetKmh });
    steps.push({ kind: "pause", sec: 2, brake: true });
  }
  return { steps };
}

// ===========================================================================
// 1 · sc-pk-driveway — „Заден ход в алея"
// ===========================================================================

const PKD_LANE_X = 4.06;

describe("1a · the model line reverses in; the harness's line never could", () => {
  it("the committed shadow completes BOTH tasks with zero violations, on every rung", () => {
    for (const rung of SC_PK_DRIVEWAY.levels) {
      const out = driveThrough(SC_PK_DRIVEWAY, rung.level as ScenarioLevel, (onTick) =>
        recordScPkDrivewayDrive(district("pk-drive-v1"), "shadow-correct", { onTick }),
      );
      expect(out.violations, `L${rung.level} convicted the model line`).toEqual([]);
      expect(out.objectives.filter((o) => !o.done).map((o) => o.id)).toEqual([]);
      expect(out.passed).toBe(true);
    }
  });

  it("a forward-only drive in D leaves the REVERSE task undone — which is the whole right column", () => {
    const out = driveThrough(SC_PK_DRIVEWAY, 1, (onTick) =>
      recordScriptedDrive(
        district("pk-drive-v1"),
        forwardOnlyCreep([
          [PKD_LANE_X, 16],
          [PKD_LANE_X, 30],
          [PKD_LANE_X, 48],
          [PKD_LANE_X, 70],
          [PKD_LANE_X, 88],
        ]),
        {
          scenarioId: SC_PK_DRIVEWAY.id,
          kind: "mistake",
          seed: 7,
          obstacles: drivewayObstacles(),
          collisionMinKmh: 0,
          onTick,
        },
      ),
    );
    // Task 1 is a drive-past-and-stop, so a creeping car earns it…
    expect(done(out, "sc-pkd-position")).toBe(true);
    // …and task 2 is `parkInBay` via reverse, so it cannot be earned at all.
    expect(done(out, "sc-pkd-park")).toBe(false);
    expect(out.passed).toBe(false);
    // The refusal is about the MANEUVER, not about a crash: the headless world
    // books no violation here, which is why the sweep's 20 points must have
    // come from scene geometry the recorder does not carry.
    expect(out.violations).toEqual([]);
  });

  it("the mistake demos are still convicted — the pipeline did not simply stop grading", () => {
    for (const name of ["mistake-wide", "mistake-deep"] as const) {
      const out = driveThrough(SC_PK_DRIVEWAY, 3, (onTick) =>
        recordScPkDrivewayDrive(district("pk-drive-v1"), name, { onTick }),
      );
      expect(out.violations, name).toContain("COLLISION");
      expect(out.passed, name).toBe(false);
    }
  });
});

describe("1b · the copy bills the walls", () => {
  /** Every Bulgarian string this template shows a student. */
  const copy = (): string[] => [
    SC_PK_DRIVEWAY.objectiveBg,
    // `LevelSpec` carries no instruction override — L5 „Усложнени" is the same
    // five steps after dark, which is why instruction 1 is where the night
    // wall-visibility promise lives.
    ...SC_PK_DRIVEWAY.instructionsBg.map((s) => s.textBg),
    ...(SC_PK_DRIVEWAY.mistakes ?? []).map((m) => m.whatWentWrongBg),
    SC_PK_DRIVEWAY.teach?.whenBg ?? "",
    SC_PK_DRIVEWAY.teach?.whyBg ?? "",
    SC_PK_DRIVEWAY.teach?.examinerBg ?? "",
  ];

  it("names стени/огради as the thing not to touch, in more than one place", () => {
    const hits = copy().filter((s) => /стен|оград/i.test(s));
    expect(hits.length, "the drill stopped promising walls").toBeGreaterThanOrEqual(4);
    // …and the objective — the sentence on the card — is one of them.
    expect(SC_PK_DRIVEWAY.objectiveBg).toMatch(/стен/i);
    expect(SC_PK_DRIVEWAY.objectiveBg).toMatch(/без да ги докоснеш/i);
  });
});

describe("1c · QUARANTINE — the walls the student's world does not contain", () => {
  /** Held scenery is keyed by template id through `<templateId>@L<n>`. */
  const heldFor = (templateId: string, districtId: string) =>
    heldSceneryFor(`${templateId}@L1`, district(districtId));

  it("POSITIVE CONTROL: the probe finds sc-park-wall's wall, so an empty answer means something", () => {
    // Without this, a `heldSceneryFor` that returned [] for every input would
    // sail through the quarantine below and prove nothing at all.
    const walls = heldFor("sc-park-wall", "lot-wall-v1").filter((o) => o.kind === "wall");
    expect(walls.length, "the probe cannot see a wall that is known to be there").toBe(1);
  });

  // THE QUARANTINE IS LIFTED — wave 13, 2026-08-30.
  //
  // This block asserted the ABSENCE of the walls and told its own reader to
  // delete it when they arrived: «delete this quarantine when it does». They
  // have. `scene/scenarioSceneryProps.ts` now carries both rects, transcribed
  // from the pin below rather than re-derived — which is exactly what that pin
  // was written for.
  //
  // The defect it held open was real and student-facing: the drill names
  // стени/огради as the thing not to touch in four separate places, its
  // objective card says «без да ги докоснеш», the HEADLESS twin has carried
  // both walls all along — and the world the student drove in contained none.
  // The lesson graded an obstacle that was not there.
  //
  // Kept as a REGRESSION PIN rather than deleted: an absence proved once is
  // worth nothing if the presence is never checked again.
  it("sc-pk-driveway now HAS both wall bodies, and they match the pinned rects", () => {
    const held = heldFor("sc-pk-driveway", "pk-drive-v1");
    const walls = held.filter((o) => o.kind === "wall");
    expect(walls, "the walls the drill promises are gone again").toHaveLength(2);
    expect(walls.map((w) => [w.x, w.y, w.headingDeg, w.lengthM, w.thicknessM])).toEqual([
      [9.0, 47.3, 90, 4.0, 0.6],
      [11.0, 45.0, 0, 5.0, 0.6],
    ]);
  });

  it("…while the HEADLESS twin has carried both walls all along — the asymmetry, by value", () => {
    // These two rects are what `scene/scenarioSceneryProps.ts` is owed. Pinned
    // here so the owning lane can transcribe rather than re-derive:
    //   { kind: "wall", x:  9.0, y: 47.3, headingDeg: 90, lengthM: 4.0, thicknessM: 0.6 }
    //   { kind: "wall", x: 11.0, y: 45.0, headingDeg:  0, lengthM: 5.0, thicknessM: 0.6 }
    const rects = drivewayObstacles();
    expect(rects).toHaveLength(2);
    expect(rects.map((r) => [r.x, r.y, r.headingDeg, r.halfWidthM, r.halfLengthM])).toEqual([
      [9.0, 47.3, 90, 0.3, 2.0],
      [11.0, 45.0, 0, 0.3, 2.5],
    ]);
    for (const r of rects) expect(r.withWhat).toBe("staticObject");
  });

  it("and the district itself offers only the garage, 1.5 m east of the graded bay", () => {
    const raw = district("pk-drive-v1") as { buildings: Array<{ id: string; footprint: number[][] }> };
    expect(raw.buildings.map((b) => b.id)).toEqual(["pkd-b-garage"]);
    // Bay heading 90 ⇒ its length runs east-west; east edge at x = 8 + 5/2.
    const bayEastX = PK_DRIVE_TARGET_BAY.x + PK_DRIVE_TARGET_BAY.lengthM / 2;
    const garageWestX = Math.min(...raw.buildings[0]!.footprint.map(([x]) => x!));
    expect(bayEastX).toBe(10.5);
    expect(garageWestX - bayEastX).toBeCloseTo(1.5, 6);
    // The nearest authored wall rect sits INSIDE that gap (x = 11 ± 0.3), which
    // is why the headless demos can hit something the student cannot.
    expect(drivewayObstacles()[1]!.x).toBeGreaterThan(bayEastX);
    expect(drivewayObstacles()[1]!.x).toBeLessThan(garageWestX);
  });
});

// ===========================================================================
// 2 · sc-junction-blind — „Кръстовище с ограничена видимост"
// ===========================================================================

const JB_LANE = 4.06;

describe("2a · the model line turns left; the harness's line drove into a field", () => {
  it("the committed shadow completes BOTH objectives with zero violations, on every rung", () => {
    for (const rung of SC_JUNCTION_BLIND.levels) {
      const out = driveThrough(SC_JUNCTION_BLIND, rung.level as ScenarioLevel, (onTick) =>
        recordScJunction2Drive(district("tj-occluded-v1"), "sc-junction-blind", "shadow-correct", {
          onTick,
        }),
      );
      expect(out.violations, `L${rung.level} convicted the model line`).toEqual([]);
      expect(out.objectives.filter((o) => !o.done).map((o) => o.id)).toEqual([]);
      expect(out.passed).toBe(true);
    }
  });

  it("a straight-through drive never reaches the west arm — the exact frame 04-t209s shows", () => {
    const out = driveThrough(SC_JUNCTION_BLIND, 1, (onTick) =>
      recordScriptedDrive(
        district("tj-occluded-v1"),
        forwardOnlyCreep([
          [JB_LANE, -115],
          [JB_LANE, -60],
          [JB_LANE, -20],
          [JB_LANE, 20],
          [JB_LANE, 90],
        ]),
        {
          scenarioId: SC_JUNCTION_BLIND.id,
          kind: "mistake",
          seed: 7,
          stagedEvents: [...(SC_JUNCTION_BLIND.staged ?? [])],
          collisionMinKmh: 0,
          onTick,
        },
      ),
    );
    // The slow approach earns objective 1 — the harness's creep is genuinely
    // cautious, which is why its right column looked like a right column…
    expect(done(out, "sc-jblind-approach")).toBe(true);
    // …and objective 2's disc is the WEST arm at (−50, 4.06), reachable only by
    // completing the left turn. A car that only ever went north cannot be there.
    expect(done(out, "sc-jblind-cross")).toBe(false);
    expect(out.passed).toBe(false);
  });

  it("the mistake demos are still convicted — the counter-proof for this template too", () => {
    const barge = driveThrough(SC_JUNCTION_BLIND, 3, (onTick) =>
      recordScJunction2Drive(district("tj-occluded-v1"), "sc-junction-blind", "mistake-barge", {
        onTick,
      }),
    );
    expect(barge.violations).toContain("FAILED_TO_YIELD");
    expect(barge.passed).toBe(false);

    const noLook = driveThrough(SC_JUNCTION_BLIND, 3, (onTick) =>
      recordScJunction2Drive(district("tj-occluded-v1"), "sc-junction-blind", "mistake-no-look", {
        onTick,
      }),
    );
    expect(noLook.violations).toContain("COLLISION");
    expect(noLook.passed).toBe(false);
  });
});

describe("2b · the objective the harness could not reach is a LEFT turn, by geometry", () => {
  it("the terminal disc is on the west arm, off the stem the car was driving", () => {
    const cross = SC_JUNCTION_BLIND.success.find((o) => o.id === "sc-jblind-cross")!;
    const p = cross.params as { kind: string; x: number; y: number; radiusM: number };
    expect(p.kind).toBe("reachZone");
    // Spawn is the SOUTH stem at (4.06, −115) heading north. The disc is 50 m
    // WEST of the node — no northward path passes within its radius.
    expect(p.x).toBe(-50);
    expect(p.y).toBe(4.06);
    const nearestOnStem = Math.hypot(p.x - JB_LANE, 0);
    expect(nearestOnStem).toBeGreaterThan(p.radiusM);
    // …and the copy says so, so the disc and the sentence cannot drift apart.
    expect(cross.titleBg).toMatch(/наляво/i);
    expect(SC_JUNCTION_BLIND.instructionsBg.some((s) => /завий наляво/i.test(s.textBg))).toBe(true);
  });
});
