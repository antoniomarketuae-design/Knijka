/**
 * ADR-009 T-REGRADE — THE RE-BILL OF THE LESSON'S OWN MISTAKE IS DROPPED
 * (founder Ruling A, 2026-09-17; spec `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md`
 * §3.4b b and §8.1 T-regrade; critic gap 1).
 *
 * WHAT A RE-BILL IS, BECAUSE THE WHOLE CASE TURNS ON IT NOT BEING A REPEAT.
 * `rules/engine.ts` bills a one-switch standing duty — the belt, the handbrake,
 * the four lamp arms, the bus lane, the ban-zone rest, and the unpaid-speeding
 * settlement at the finish — TWICE per episode, some seconds apart, and marks
 * the second one `regrade: true`. The second bill exists for exactly one
 * reason: the FIRST one was spent by the teach-first free mini-lesson, and
 * without a second the student drives a whole lesson unbelted and reaches a
 * debrief that reads «Опасни 0 · Основни 0 · Второстепенни 0» under «чисто
 * каране по изпитния лист». `regrade: true` means „this is the same breach, not
 * a new act".
 *
 * WHY ADR-009 DROPS IT. Ruling A says NO exam points are taken for the first
 * occurrence of the mistake the lesson exists to teach. The re-bill IS that
 * first occurrence, billed late — so it is precisely the charge the ruling
 * forbids. What it protected, a hit drive looking clean at its debrief, is now
 * carried by «Не е взет» and the reason block.
 *
 * WHAT IS NOT DROPPED, and §3 measures it: a genuine repeat EPISODE (founder
 * answer F1) and the re-bill on any code that is NOT this lesson's own.
 *
 * THE DRIVES ARE REAL RECORDINGS, at the rung a learner plays, through
 * `compileScenario → createLessonSession → applyTick → buildLessonResult`. The
 * four tapes and their numbers come from the lane's own 2,434-drive census, not
 * from the spec's prototype: each `before` figure below was measured on this
 * tree at HEAD before the change landed.
 *
 * M11 (spec §8.5), EXECUTED rather than described: §2 strips
 * `lessonMistakeTargets` off a copy of the same compiled lesson and every
 * withheld bill comes back, at the same second, with `regrade: true`. If that
 * control ever agreed with §1, neither would be measuring anything.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LessonSpec } from "../../contracts";
import { recordScAcNightLightsDrive } from "../../traces/scAcNightLights";
import { recordScFollowTailgaterDrive } from "../../traces/scFollowTailgater";
import { recordScVpReadinessDrive } from "../../traces/scVpReadiness";
import { recordScVuPassDrive } from "../../traces/scVuPass";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SC_AC_NIGHT_LIGHTS } from "../scenario/templates-conditions";
import { SC_FOLLOW_TAILGATER } from "../scenario/templates-following";
import { SC_VP_READINESS } from "../scenario/templates-cockpit";
import { scenarioById } from "../scenario/templates";
import type { ScenarioLevel, ScenarioSpec } from "../scenario/types";
import type { SimTick } from "../../rules";
import type { LessonResult, LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

type Play = (onTick: (t: SimTick) => void) => void;

interface Row {
  /** `<lesson>/<tape>` — the census key, so a reader can re-drive it by hand. */
  readonly id: string;
  readonly spec: ScenarioSpec;
  readonly code: string;
  /** The teach: coached, free, and the moment the card appeared. */
  readonly coachedAtSec: number;
  /** The re-bill that ADR-009 now drops: its second, and its price. */
  readonly rebilledAtSec: number;
  readonly rebilledPoints: number;
  readonly play: Play;
}

/**
 * Four standing-duty re-bills on four different detectors, chosen so that one
 * broken arm cannot make the whole suite agree with itself: a speeding
 * settlement, a seatbelt, a lamp and (through the census) a bus lane. Every
 * number was measured on this tree, pre-change, by the lane's census.
 */
const ROWS: Row[] = [
  {
    id: "sc-follow-tailgater/mistake-speed-up",
    spec: SC_FOLLOW_TAILGATER,
    code: "SPEEDING_OVER_LIMIT",
    coachedAtSec: 14.8,
    rebilledAtSec: 20.8,
    rebilledPoints: 1,
    play: (onTick) =>
      void recordScFollowTailgaterDrive(district("ln-v1"), "mistake-speed-up", { onTick }),
  },
  {
    id: "sc-vp-readiness/mistake-no-belt",
    spec: SC_VP_READINESS,
    code: "SEATBELT_OFF_WHILE_MOVING",
    coachedAtSec: 1.6,
    rebilledAtSec: 11.6,
    rebilledPoints: 3,
    play: (onTick) =>
      void recordScVpReadinessDrive(district("vp-ready-v1"), "mistake-no-belt", { onTick }),
  },
  {
    id: "sc-ac-night-lights/mistake-never-on",
    spec: SC_AC_NIGHT_LIGHTS,
    code: "HEADLIGHTS_OFF_AT_NIGHT",
    coachedAtSec: 2.6,
    rebilledAtSec: 12.6,
    rebilledPoints: 3,
    play: (onTick) =>
      void recordScAcNightLightsDrive(district("ac-night-v1"), "mistake-never-on", { onTick }),
  },
];

function run(row: Row, level: ScenarioLevel, tweak?: (l: LessonSpec) => LessonSpec): LessonResult {
  const compiled = compileScenario(row.spec, level);
  let session: LessonSessionState = createLessonSession(
    tweak === undefined ? compiled : tweak(compiled),
  );
  row.play((tick) => {
    session = applyTick(session, tick).state;
  });
  return buildLessonResult(session);
}

/** The rollback of the whole ADR: remove the one field `compile.ts` writes. */
function stripTargets(lesson: LessonSpec): LessonSpec {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
}

const at = (r: LessonResult, code: string): { t: number; points: number }[] =>
  r.summary.mistakes
    .filter((m) => m.code === code)
    .map((m) => ({ t: Number(m.t.toFixed(1)), points: m.points }));

// ---------------------------------------------------------------------------
// §1 — THE RE-BILL IS WITHHELD, and the teach it was chasing still happened
// ---------------------------------------------------------------------------

describe("§1 L3 practice — the lesson's own mistake is taught once and billed never", () => {
  for (const row of ROWS) {
    it(`${row.id}: coached at ${row.coachedAtSec} s, no bill at ${row.rebilledAtSec} s, 0 т.`, () => {
      const r = run(row, 3);
      // First, the fact that makes the drop legitimate: the student WAS taught.
      // A drop with no card would be silence, which is the one thing THEO-4
      // forbids — and the census pins it globally (0 of 693 hits reach a charge
      // without an earlier coached occurrence).
      expect(
        (r.coachedMistakes ?? []).map((c) => ({ code: c.code, t: Number(c.t.toFixed(1)) })),
      ).toContainEqual({ code: row.code, t: row.coachedAtSec });
      // Then the drop itself: nothing of this code on the изпитен лист.
      expect(at(r, row.code)).toEqual([]);
      expect(r.score).toBe(0);
      // …and the consequence the ruling replaced the points with.
      expect(r.lessonMistakes).toEqual([
        expect.objectContaining({ code: row.code, charged: false }),
      ]);
      expect(r.passed).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — M11: it is ADR-009 doing this, and nothing else
// ---------------------------------------------------------------------------

describe("§2 M11 — strip the targets and every withheld bill comes back", () => {
  for (const row of ROWS) {
    it(`${row.id}: the re-bill lands at ${row.rebilledAtSec} s for ${row.rebilledPoints} т.`, () => {
      const r = run(row, 3, stripTargets);
      expect(at(r, row.code)).toEqual([
        { t: row.rebilledAtSec, points: row.rebilledPoints },
      ]);
      expect(r.score).toBe(row.rebilledPoints);
      // …and it is the RE-bill, not a fresh act: the marking is what the drop
      // keys on, so a detector that stopped marking would silently disable the
      // whole clause rather than red anything.
      expect(
        r.summary.mistakes
          .filter((m) => m.code === row.code)
          .map((m) => (m as { regrade?: boolean }).regrade === true),
      ).toEqual([true]);
      expect(r.lessonMistakes).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — THE BOUNDS OF THE CLAUSE
// ---------------------------------------------------------------------------

describe("§3 what the drop does NOT touch", () => {
  it("L4 exam: the same recording is billed exactly as it always was", () => {
    // The exam rung carries no targets (`compile.ts` never writes the field on
    // an exam), so the clause is unreachable there by construction. The exam
    // grades on sight, so the FIRST bill is the charge and the re-bill is
    // dropped by the pre-existing `alreadyCharged` guard — a different guard,
    // for a different reason, and the number is the one Наредба № 38 prices.
    const r = run(ROWS[0], 4);
    expect((compileScenario(ROWS[0].spec, 4) as { examMode?: boolean }).examMode).toBe(true);
    expect(at(r, ROWS[0].code)).toEqual([{ t: ROWS[0].coachedAtSec, points: 1 }]);
    expect(r.score).toBe(1);
    expect(r.lessonMistakes).toBeUndefined();
  });

  it("a NON-target code's re-bill is untouched — the clause is not a blanket amnesty", () => {
    // The same drive, with the target set replaced by a code this tape never
    // commits. The re-bill the census measured comes straight back, which is
    // what says the clause is keyed on membership and not on `regrade` itself.
    const r = run(ROWS[1], 3, (l) => ({
      ...l,
      lessonMistakeTargets: [{ code: "NOT_KEEPING_RIGHT", source: "demo" as const }],
    }));
    expect(at(r, ROWS[1].code)).toEqual([
      { t: ROWS[1].rebilledAtSec, points: ROWS[1].rebilledPoints },
    ]);
    expect(r.lessonMistakes).toBeUndefined();
  });

  /**
   * THE SECOND ADDRESS OF ONE RULE, and the reason it is pinned by a
   * CONSTRUCTED drive rather than by a tape.
   *
   * The finish-time settlement (`rules/engine.ts settleUnpaidSpeedingTeach`)
   * does not travel through `applyTick`'s `regrade` guard: it is built at the
   * end of the frame the drive completes on, already marked `regrade: true`,
   * and asks only `alreadyCharged`. So the ADR-009 clause had to be written
   * twice, and this case is what says the second copy exists.
   *
   * NO COMMITTED TAPE REACHES IT — measured over 1,213 targeted practice
   * drives: 0 regrade-marked target bills reach the sheet either way. That is
   * precisely why it needs a constructed drive: the corpus cannot tell the
   * guarded path from the unguarded one, and a REAL student can. Start speeding
   * inside the last six seconds and still be over the limit when the finish
   * gate fires and the settlement is that episode's ONLY bill — the first
   * occurrence, charged, which is what Ruling A forbids. SPEEDING_OVER_LIMIT is
   * the own mistake of 11 lessons.
   *
   * The control is in the same case and is what makes it a measurement: the
   * identical drive with no targets books the same settlement at the same
   * second, so a day the settlement stops firing reds here instead of looking
   * like the ruling working.
   */
  it("the FINISH-TIME settlement is dropped too — the re-bill site outside the loop", () => {
    const spec = scenarioById("sc-vu-pass-clearance")!;
    const base = compileScenario(spec, 3);
    const play = (lesson: LessonSpec, over?: (t: SimTick) => SimTick): LessonResult => {
      let session: LessonSessionState = createLessonSession(lesson);
      recordScVuPassDrive(district("vu-pass-v1"), "shadow-correct", {
        onTick: (t) => {
          session = applyTick(session, over === undefined ? t : over(t)).state;
        },
      });
      return buildLessonResult(session);
    };
    // The clean shadow drive reaches its own finish — that is what arms the
    // settlement at all, and it is asserted rather than assumed.
    const clean = play(base);
    expect(clean.passed).toBe(true);
    const endSec = clean.durationSec;
    // Over the limit for the last four seconds only: too late for the 6 s
    // re-grade, so the settlement is this episode's only possible bill.
    const speedLate = (t: SimTick): SimTick =>
      t.t >= endSec - 4 ? { ...t, speedKmh: t.maxSpeedKmh + 7 } : t;

    const noTargets: LessonSpec = { ...base };
    delete (noTargets as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
    const control = play(noTargets, speedLate);
    expect(
      control.summary.mistakes.map((m) => [
        m.code,
        Number(m.t.toFixed(2)),
        (m as { regrade?: boolean }).regrade === true,
      ]),
    ).toEqual([["SPEEDING_OVER_LIMIT", Number(endSec.toFixed(2)), true]]);
    expect(control.score).toBe(1);

    const targeted = play(
      { ...base, lessonMistakeTargets: [{ code: "SPEEDING_OVER_LIMIT", source: "demo" }] },
      speedLate,
    );
    expect(targeted.summary.mistakes).toEqual([]);
    expect(targeted.score).toBe(0);
    // …and the student is still told: the coached row is there, the hit is
    // uncharged, and the lesson is not taken.
    expect((targeted.coachedMistakes ?? []).map((c) => c.code)).toContain("SPEEDING_OVER_LIMIT");
    expect(targeted.lessonMistakes).toEqual([
      expect.objectContaining({ code: "SPEEDING_OVER_LIMIT", charged: false }),
    ]);
    expect(targeted.passed).toBe(false);
  });

  it("an ALREADY-CHARGED code still drops its re-bill, targets or no targets", () => {
    // The older guard is still load-bearing and is not subsumed: on the exam
    // rung above it is the only thing standing between a candidate who runs
    // twelve seconds unbelted and a double charge of 6 наказателни точки where
    // the наредба prices the pair at 3. §3's first case is that measurement;
    // this one states the reading so a later lane does not "simplify" the two
    // guards into one.
    const r = run(ROWS[1], 4);
    expect(at(r, ROWS[1].code)).toEqual([{ t: ROWS[1].coachedAtSec, points: 3 }]);
  });
});
