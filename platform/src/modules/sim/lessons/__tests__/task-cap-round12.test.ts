/**
 * THE TASK CEILING, ROUND 12 — the lesson (what the student sees: the coached rows, the charged mistakes, the score).
 *
 * A · F-STRETCH on the glass. The verifier's probe through a real lesson session: the sign-bound drive is taught on
 *     the first stamped frame (1.1) and charged the act's one re-grade (10.2) exactly as its graded twin is taught at
 *     its blow and charged — the same rows, the same points, the same score. Round 11 taught it at the held
 *     correction 15–34 s after the blow and charged nothing on the grace-band variants (score 0 against the twin's 1).
 * B · THE REFERENCE'S POINTS ARE THE LESSON'S. The two-sided census (`rules/__tests__/task-cap-two-sided-census`)
 *     compares the reducer's rule events with the reference ledger's EXACTLY; the student-visible outcome is then a
 *     function of that stream. This section states that function independently — the per-topic first-fault grace
 *     (founder ruling 16: TASK shares the чл. 20, ал. 2 topic with the weather and the bend — ruling 1), опасна always
 *     graded, an ABSORBED bill dropped, a SURFACED card shown and never charged, a RE-GRADE reaching only a code not
 *     yet charged and a handed-over one only an owner not yet charged, and the ending's settlement under the same
 *     guards — applies it to the REFERENCE's expected stream, and compares the coached rows, the charged mistakes and
 *     the score with a real lesson session driven through the same frames, on programmes sampled from every family.
 *     So «no missing or extra point» is checked in points, on the lesson the student uses.
 *
 * ROUND 14: its census (B) compares every sampled programme with the two-ledger reference through the shared statement of
 * the lesson's rules (`taskCapStudent.ts studentOf` — the cap's grace its own).
 */
import { describe, expect, it } from "vitest";
import { makeViolation, type SimTick, type ViolationCode } from "../../rules";
import { expectedOutcome, type Bill, type Expected } from "../../rules/__tests__/taskCapReference";
import { generateProgramme, staleSurfaceGrid } from "../../rules/__tests__/taskCapProgrammes";
import { generateActProgramme, myProgramme } from "../../rules/__tests__/taskCapActProgrammes";
import { STRETCH_VARIANTS, stretchPair } from "../../rules/__tests__/taskCapWitnesses12";
import { scenarioForCode } from "../../scenarios";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";
import { studentOf as sharedStudentOf } from "./taskCapStudent";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
/** The uncapped practice lesson every task-cap round has driven (non-exam, no capped objective, no speed target). */
const UNCAPPED = "sc-follow-brake";
const SPEED_CODES = ["TASK_SPEED_CAP_EXCEEDED", "SPEED_TOO_FAST_FOR_CONDITIONS", "SPEED_TOO_FAST_FOR_CURVE", "SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS", "FOG_LIGHTS_OFF_IN_FOG"];

interface Seen {
  score: number;
  mistakes: string[];
  coached: string[];
}
const fmt = (code: string, t: number) => `${code}@${t.toFixed(2)}`;
function session(f: readonly SimTick[]): Seen {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED);
  if (spec === undefined) throw new Error(`no template ${UNCAPPED}`);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, 1));
  for (const x of f) s = applyTick(s, x).state;
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    mistakes: res.summary.mistakes.map((m) => `${fmt(m.code, m.t)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => fmt(c.code, c.t)),
  };
}

/**
 * THE STUDENT'S OUTCOME OF AN EXPECTED STREAM — round 14: the shared statement of it (`taskCapStudent.ts studentOf`:
 * one free teach per topic, the CAP's grace its own, the cap ledger's one mark, each ledger's ending), so this census
 * and the generated lesson census restate the lesson's rules once. (Rounds 12–13 kept a local copy here, with the kin
 * ledger's surfaced cards and hand-overs.)
 */
function studentOf(exp: Expected, last: number): Seen {
  const st = sharedStudentOf(exp, last);
  return { score: st.score, mistakes: st.mistakes, coached: st.coached };
}

describe("the harness", () => {
  it(`${UNCAPPED} L1 is a non-exam lesson with NO capped objective and none of the six codes these programmes bill among its lesson targets`, () => {
    const l = compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED)!, 1);
    expect(l.examMode).toBeFalsy();
    expect(l.objectives.every((o) => (o.params as { maxSpeedKmh?: number }).maxSpeedKmh === undefined)).toBe(true);
    expect((l.lessonMistakeTargets ?? []).filter((c) => SPEED_CODES.includes(String(c)))).toEqual([]);
  });
});

describe("A · F-STRETCH on the glass — the sign-bound drive is taught and charged as its graded twin is", () => {
  for (const { len, tag, v, raised } of STRETCH_VARIANTS) {
    it(`RED-ON-R11 · ${tag} ${len} s — taught at 1.1${len >= 10 ? ", charged once at 10.2 (score 1)" : " (score 0: too short for the re-grade)"}; the graded twin's rows, points and score`, () => {
      const { signBound, graded } = stretchPair(len, v, raised);
      const sb = session(signBound);
      const gr = session(graded);
      expect(sb.coached.filter((x) => x.startsWith(TASK))).toEqual([`${TASK}@1.10`]);
      expect(sb.mistakes).toEqual(len >= 10 ? [`${TASK}@10.20|1`] : []);
      expect(sb.score).toBe(len >= 10 ? 1 : 0);
      expect([sb.score, sb.mistakes.length, sb.coached.length]).toEqual([gr.score, gr.mistakes.length, gr.coached.length]);
    });
  }
});

let GRID: ReturnType<typeof staleSurfaceGrid> | undefined;
const grid = () => (GRID ??= staleSurfaceGrid());
/** Every 10th programme of each family and every 6th of the grid: 400 + 60 + 48 + 300 + 300 = 1,108 lesson sessions, and the verifier's seven. */
const SAMPLE: Array<[string, () => SimTick[]]> = [
  ...Array.from({ length: 400 }, (_, i) => [`L${10 * i + 7}`, () => generateProgramme(10 * i + 7)] as [string, () => SimTick[]]),
  ...Array.from({ length: 60 }, (_, i) => [`S${10 * i + 3}`, () => generateProgramme(10 * i + 3, { speedBlow: true })] as [string, () => SimTick[]]),
  ...Array.from({ length: 48 }, (_, i) => [`G${6 * i}`, () => grid()[6 * i].frames] as [string, () => SimTick[]]),
  ...Array.from({ length: 300 }, (_, i) => [`A${10 * i + 1}`, () => generateActProgramme(10 * i + 1)] as [string, () => SimTick[]]),
  ...Array.from({ length: 300 }, (_, i) => [`M${10 * i + 3}`, () => myProgramme(10 * i + 3)] as [string, () => SimTick[]]),
  // the round-11 verifier's lesson-level witnesses
  ...["L275", "L397", "L1263", "L1207", "L2790", "M633", "M774"].map((k) => [k, () => (k[0] === "L" ? generateProgramme(Number(k.slice(1))) : myProgramme(Number(k.slice(1))))] as [string, () => SimTick[]]),
];

describe("B · the reference's student outcome is the real lesson's — coached rows, charged mistakes and score, on programmes sampled from every family", () => {
  it(`${SAMPLE.length} sessions: identical rows, points and scores; not vacuous (charged points, teach rows and ending settlements all arise)`, () => {
    const diffs: string[] = [];
    let points = 0;
    let rows = 0;
    let withCharge = 0;
    for (const [k, gen] of SAMPLE) {
      const f = gen();
      const exp = expectedOutcome(f);
      const want = studentOf(exp, f.length - 1);
      const got = session(f);
      if (JSON.stringify(want) !== JSON.stringify(got)) diffs.push(`${k}\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`);
      points += got.score;
      rows += got.coached.length;
      if (got.mistakes.length > 0) withCharge++;
    }
    expect(diffs.slice(0, 3)).toEqual([]);
    expect(points).toBeGreaterThan(2000);
    expect(rows).toBeGreaterThan(1500);
    expect(withCharge).toBeGreaterThan(600);
  }, 1_800_000);
});
