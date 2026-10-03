/**
 * THE TASK CEILING — THE GENERATED LESSON CENSUS: generated programmes through a REAL lesson session, and what the
 * student is shown and charged compared with the rules. Round 13; round 14: TWO LEDGERS (founder ruling 2026-10-03,
 * «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands on its own; the bend/weather bills
 * are charged exactly as they would be in a lesson with no cap. Blowing the cap can only add, never lower the score,
 * and order never matters.»).
 *
 * P · THE WIDENED DOMAIN ON THE GLASS. Programmes of family P (`generateActProgramme(seed, { pairs })`: the glass figure
 *     and the gate drawn as the committed lessons pair them and beyond, reversing, snow and night, the fog lamps, the car
 *     past the kerb) through a lesson session, three ways:
 *       – TWO-SIDED: against the reference ledger's stream (`rules/__tests__/taskCapReference.ts`) and the rules of
 *         `taskCapStudent.ts` — the coached rows, the charged mistakes, the score, and the WHOLE text of every card and
 *         toast of the cap, the weather and the bend;
 *       – THE RULING (F1): against the same frames with the cap fields removed (`taskCapCapAdds.ts capAddsBreaches`) —
 *         every bill that is not the cap's the same, the score the no-cap score plus the cap's own points, the verdict
 *         never better;
 *       – THEO-4 AS PRINTED (R1): every comparison every card states holds between its PRINTED numbers
 *         (`taskCapPrinted.ts falsePrintedClaims`, which shares no formatting code with the builders).
 * O · ORDER NEVER MATTERS. For every generated act (`taskCapOrderProgrammes.ts`: a sign-bound blow, the pivot — its stamp,
 *     or a new mark blown while it waits — and one, two or three events: a weather window, a bend's, a second mark's
 *     blow, a second weather window) EACH event is moved ON ITS OWN by fractions of a second, over a grid, so the cap's
 *     events and the weather's and the bend's land in every order around each other. On a FRESH topic, on a SPENT
 *     чл. 20, ал. 2 topic (a taught weather overspeed before the act) and on a SPENT CAP topic (a taught blown mark
 *     before it):
 *       – every variant satisfies the ruling against itself with no cap (F1, as P);
 *       – the cap's rows and points do not move when only a weather or bend event moves, and the weather's and the
 *         bend's rows and points do not move when only the cap's second mark moves — so the score of every variant is
 *         the no-cap score of its weather and bend events plus the cap's points of its marks, in any order.
 *     (The order of the weather's and the bend's bills AMONG THEMSELVES is the no-cap ledger's own business: on a
 *     fresh topic the first of the two is taught and the second charged, exactly as with no cap.)
 *
 * RUNTIME (one worker, this machine): P about 3 minutes, O about 12 minutes.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeViolation, type SimTick, type ViolationCode } from "../../rules";
import { generateActProgramme } from "../../rules/__tests__/taskCapActProgrammes";
import { BEYOND_DELTAS, committedPairDeltas } from "../../rules/__tests__/taskCapCommittedPairs";
import { generateOrderAct, shiftProgramme, topicSpentPrefix } from "../../rules/__tests__/taskCapOrderProgrammes";
import { prog } from "../../rules/__tests__/taskCapProgrammes";
import { expectedOutcome } from "../../rules/__tests__/taskCapReference";
import { capAddsBreaches, capPoints, lessonRun, stripCap, type LessonRun } from "./taskCapCapAdds";
import { falsePrintedClaims, printedNumbersOf } from "./taskCapPrinted";
import { COND, CURVE, KIN, TASK, cardText, studentOf } from "./taskCapStudent";

const TITLE = new Map([...KIN].map((c) => [c, makeViolation(c as ViolationCode, 0).titleBg]));
const DELTAS = [...new Set([...committedPairDeltas(), ...BEYOND_DELTAS])].sort((a, b) => a - b);

describe("P · the widened domain on the glass — rows, points, every card's whole text, the ruling against the same drive with no cap, and THEO-4 as printed", () => {
  it("the pair is drawn from the committed lessons: 13 differences gate − glass (0 among them), and 4 beyond", () => {
    expect(committedPairDeltas()).toContain(0);
    expect(committedPairDeltas().length).toBeGreaterThanOrEqual(10);
    expect(DELTAS.length).toBe(committedPairDeltas().length + BEYOND_DELTAS.length);
  });
  it("every 2nd programme of family P 1..4000 (2,000 sessions, each run with the cap and with it removed): identical rows, points and card text against the rules; the ruling holds on every one; every printed comparison is true; not vacuous", () => {
    const diffs: string[] = [];
    const cov = {
      sessions: 0,
      points: 0,
      capPointsAdded: 0,
      rows: 0,
      cards: 0,
      pairCards: 0,
      lateSignBoundCards: 0,
      signMovedCards: 0,
      capAndKinSessions: 0,
      capAndSpeedingSessions: 0,
      capRaisedScore: 0,
      displaysChecked: 0,
      measuredDisplays: 0,
      decimalThresholds: 0,
      envelopeClauses: 0,
      envelopeClausesWithheld: 0,
    };
    for (let seed = 1; seed <= 4000; seed += 2) {
      const f = generateActProgramme(seed, { pairs: DELTAS });
      const got = lessonRun(f);
      const noCap = lessonRun(stripCap(f));
      cov.sessions++;
      // F1
      for (const b of capAddsBreaches(got, noCap)) diffs.push(`P${seed} F1: ${b}`);
      // TWO-SIDED
      const exp = expectedOutcome(f, undefined, got.config);
      const want = studentOf(exp, f.length - 1);
      if (JSON.stringify([want.score, want.mistakes, want.coached]) !== JSON.stringify([got.score, got.mistakes, got.coached])) {
        diffs.push(`P${seed} rows\n  want ${JSON.stringify([want.score, want.mistakes, want.coached])}\n  got  ${JSON.stringify([got.score, got.mistakes, got.coached])}`);
        continue;
      }
      cov.points += got.score;
      cov.capPointsAdded += capPoints(got);
      if (got.score > noCap.score) cov.capRaisedScore++;
      cov.rows += got.coached.length;
      const rowsOf = (code: string) => [...got.coached, ...got.mistakes].some((r) => r.startsWith(code));
      if (rowsOf(TASK) && (rowsOf(COND) || rowsOf(CURVE))) cov.capAndKinSessions++;
      if (rowsOf(TASK) && (rowsOf("SPEEDING_OVER_LIMIT") || rowsOf("SPEEDING_DANGEROUS"))) cov.capAndSpeedingSessions++;
      for (const s of want.shown) {
        if (!KIN.has(s.bill.code)) continue;
        const x = f[s.i];
        const text = cardText(s.bill, x, got.config);
        const here = got.displays.filter((d) => d.i === s.i && d.title === TITLE.get(s.bill.code));
        cov.cards++;
        if (here.length === 0) diffs.push(`P${seed} t=${x.t}: no card or toast for ${s.bill.code} (${s.how})`);
        for (const d of here) if (d.text !== text) diffs.push(`P${seed} t=${x.t} ${s.bill.code} (${s.how})\n  want «${text.slice(0, 170)}»\n  got  «${d.text.slice(0, 170)}»`);
        const stamp = x.taskSpeedCap;
        if (s.bill.code === TASK && s.bill.blow !== undefined) {
          const blowFrame = f.find((y) => y.taskCapArrival !== undefined && Math.abs(y.taskCapArrival.arrivalKmh) === s.bill.blow!.arrivalKmh && y.t <= x.t);
          if (blowFrame !== undefined && blowFrame.t < x.t) cov.lateSignBoundCards++;
          if (blowFrame !== undefined && blowFrame.maxSpeedKmh !== x.maxSpeedKmh) cov.signMovedCards++;
          if (blowFrame?.taskCapArrival !== undefined && blowFrame.taskCapArrival.shownKmh !== blowFrame.taskCapArrival.capKmh) cov.pairCards++;
        } else if (s.bill.code === TASK && ((x.taskCapArrival !== undefined && x.taskCapArrival.shownKmh !== x.taskCapArrival.capKmh) || (stamp !== undefined && stamp.shownKmh !== stamp.capKmh))) cov.pairCards++;
        if (s.bill.code === TASK) {
          if (text.includes("оставя от знака")) cov.envelopeClauses++;
          else if (s.bill.blow === undefined && (x.rain === true || x.fog === true || x.snow === true || x.isNight === true)) cov.envelopeClausesWithheld++;
        }
      }
      // THEO-4 AS PRINTED, on EVERY card and toast of the session (any code)
      for (const d of [...got.displays, ...noCap.displays]) {
        cov.displaysChecked++;
        const bad = falsePrintedClaims(d.text);
        if (bad.length > 0) diffs.push(`P${seed} frame ${d.i} «${d.text.slice(0, 160)}» — ${bad.join("; ")}`);
        const nums = printedNumbersOf(d.text);
        if (nums.length > 0) cov.measuredDisplays++;
        if (nums.slice(1).some((n) => !Number.isInteger(n))) cov.decimalThresholds++;
      }
    }
    // The coverage, written where a census run asks for it (evidence for a report; never read back).
    if (process.env.TASK_CAP_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_CENSUS_OUT, JSON.stringify({ census: "generated-lesson", family: "P", diffs: diffs.length, cov, first: diffs.slice(0, 20) }) + "\n");
    expect(diffs.slice(0, 4)).toEqual([]);
    expect(cov.sessions).toBe(2000);
    expect(cov.points).toBeGreaterThan(15_000);
    expect(cov.capPointsAdded).toBeGreaterThan(1000);
    expect(cov.capRaisedScore).toBeGreaterThan(500);
    expect(cov.rows).toBeGreaterThan(3000);
    expect(cov.cards).toBeGreaterThan(7000);
    expect(cov.pairCards).toBeGreaterThan(2500);
    expect(cov.lateSignBoundCards).toBeGreaterThan(800);
    expect(cov.signMovedCards).toBeGreaterThan(500);
    expect(cov.capAndKinSessions).toBeGreaterThan(1000);
    expect(cov.capAndSpeedingSessions).toBeGreaterThan(300);
    expect(cov.measuredDisplays).toBeGreaterThan(5000);
    expect(cov.decimalThresholds).toBeGreaterThan(200);
    expect(cov.envelopeClauses).toBeGreaterThan(100);
  }, 1_800_000);
});

// ---------------------------------------------------------------------------
// O · ORDER NEVER MATTERS
// ---------------------------------------------------------------------------

/** A taught blown mark before the act (a graded ≤S0−15 mark passed at S0−5): the cap's own topic spent. */
function capSpentPrefix(S0: number): SimTick[] {
  const glass = S0 - 15;
  return prog(
    [
      { from: 0, to: 0.9, v: glass - 3 },
      { from: 0.9, to: 1.0, v: glass + 10 },
      { from: 1.0, to: 1.1, v: glass + 10, o: { taskCapArrival: { capKmh: glass, shownKmh: glass, graceKmh: 5, blownAtSec: 1.0, arrivalKmh: glass + 10 } } },
      { from: 1.1, to: 10, v: Math.max(12, Math.round(S0 * 0.4)) },
    ],
    { maxSpeedKmh: S0 },
  );
}
const capRows = (r: LessonRun) => [...r.coached, ...r.mistakes].filter((x) => x.startsWith(TASK));
const kinRows = (r: LessonRun) => [...r.coached, ...r.mistakes].filter((x) => !x.startsWith(TASK));
const kinPoints = (r: LessonRun) => r.score - capPoints(r);

describe("O · ORDER NEVER MATTERS — one generated act, each event moved on its own by fractions of a second, on a fresh, a spent чл. 20, ал. 2 and a spent cap topic: the cap's bills do not move with the weather's or the bend's, nor theirs with the cap's", () => {
  const ACTS = 1500;
  it(`acts 1..${ACTS}, each under every shift of its grid, in three contexts — every variant obeys the ruling against itself with no cap, and the score separates into the weather's/bend's (independent of the cap's events) plus the cap's (independent of theirs); not vacuous`, () => {
    const breaches: string[] = [];
    const cov = {
      acts: 0,
      variants: 0,
      /** acts in which a cap bill and a weather or bend bill land in a different order in two variants */
      capKinOrderSwapped: 0,
      capAndKinVariants: 0,
      spentKinVariants: 0,
      spentCapVariants: 0,
      spentCapTaughtKin: 0,
      markMoved: 0,
      kinMovedGroups: 0,
      endsInsideTheAct: 0,
      newMarkPivot: 0,
    };
    for (let seed = 1; seed <= ACTS; seed++) {
      const act = generateOrderAct(seed, DELTAS);
      const markIx = act.events.indexOf("MARK");
      const contexts: Array<["fresh" | "kin-spent" | "cap-spent", SimTick[]]> = [["fresh", []], ["kin-spent", topicSpentPrefix(act.S0)]];
      if (seed % 3 === 0) contexts.push(["cap-spent", capSpentPrefix(act.S0)]);
      cov.acts++;
      if (act.cutAt !== null) cov.endsInsideTheAct++;
      if (act.pivot === "mark") cov.newMarkPivot++;
      for (const [ctx, prefix] of contexts) {
        const dt = prefix.length / 10;
        const noCapByKin = new Map<string, LessonRun>();
        const capByMark = new Map<string, { rows: string; pts: number; shift: string }>();
        const kinByKin = new Map<string, { rows: string; pts: number; shift: string }>();
        const orders = new Set<string>();
        for (const shift of act.shifts) {
          const f = [...prefix, ...shiftProgramme(act.variant(shift), dt)];
          const kinKey = shift.map((k, i) => (i === markIx ? 0 : k)).join(",");
          const markKey = markIx >= 0 ? String(shift[markIx]) : "-";
          const got = lessonRun(f);
          let noCap = noCapByKin.get(kinKey);
          if (noCap === undefined) {
            noCap = lessonRun(stripCap(f));
            noCapByKin.set(kinKey, noCap);
          }
          cov.variants++;
          const tag = `act ${seed} ${ctx} (${act.events.join("+")}, pivot ${act.pivot}) shift ${shift.join(",")}`;
          for (const b of capAddsBreaches(got, noCap)) breaches.push(`${tag} F1: ${b}`);
          const cr = capRows(got);
          const kr = kinRows(got);
          if (cr.length > 0 && kr.length > 0) cov.capAndKinVariants++;
          if (ctx === "kin-spent") cov.spentKinVariants++;
          if (ctx === "cap-spent") {
            cov.spentCapVariants++;
            if (got.coached.some((r) => r.startsWith(COND) || r.startsWith(CURVE))) cov.spentCapTaughtKin++;
          }
          // ORDER: the cap's rows/points are a function of its marks alone; the weather's/bend's of their events alone.
          const capSig = { rows: JSON.stringify(cr), pts: capPoints(got), shift: shift.join(",") };
          const kinSig = { rows: JSON.stringify(kr), pts: kinPoints(got), shift: shift.join(",") };
          const c0 = capByMark.get(markKey);
          if (c0 === undefined) capByMark.set(markKey, capSig);
          else if (c0.rows !== capSig.rows || c0.pts !== capSig.pts) breaches.push(`${tag} ORDER: the cap's bills moved with a weather/bend event — ${capSig.rows} ${capSig.pts} / ${c0.rows} ${c0.pts} (shift ${c0.shift})`);
          const k0 = kinByKin.get(kinKey);
          if (k0 === undefined) kinByKin.set(kinKey, kinSig);
          else {
            cov.markMoved++;
            if (k0.rows !== kinSig.rows || k0.pts !== kinSig.pts) breaches.push(`${tag} ORDER: the weather's/bend's bills moved with the cap's mark — ${kinSig.rows} ${kinSig.pts} / ${k0.rows} ${k0.pts} (shift ${k0.shift})`);
          }
          // the order the cap's first bill and the first weather/bend bill landed in (coverage)
          const tFirst = (rows: readonly string[]) => (rows.length === 0 ? null : Math.min(...rows.map((r) => Number(r.slice(r.indexOf("@") + 1, r.indexOf("|") >= 0 ? r.indexOf("|") : undefined)))));
          const tc = tFirst(cr);
          const tk = tFirst(kr);
          if (tc !== null && tk !== null) orders.add(tc < tk ? "C<K" : tc > tk ? "K<C" : "C=K");
        }
        if (orders.size > 1) cov.capKinOrderSwapped++;
        cov.kinMovedGroups += capByMark.size;
      }
    }
    if (process.env.TASK_CAP_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_CENSUS_OUT, JSON.stringify({ census: "generated-lesson", family: "O", breaches: breaches.length, cov, first: breaches.slice(0, 40) }) + "\n");
    expect(breaches.slice(0, 5)).toEqual([]);
    expect(cov.acts).toBe(ACTS);
    // NOT VACUOUS: tens of thousands of variants; the cap's and the weather's/bend's bills land in both orders in hundreds
    // of acts; both spent contexts; the cap's mark moved against fixed weather/bend events
    expect(cov.variants).toBeGreaterThan(50_000);
    expect(cov.capKinOrderSwapped).toBeGreaterThan(300);
    expect(cov.capAndKinVariants).toBeGreaterThan(20_000);
    expect(cov.spentKinVariants).toBeGreaterThan(20_000);
    expect(cov.spentCapVariants).toBeGreaterThan(5000);
    expect(cov.spentCapTaughtKin).toBeGreaterThan(1000);
    expect(cov.markMoved).toBeGreaterThan(2000);
    expect(cov.endsInsideTheAct).toBeGreaterThan(300);
    expect(cov.newMarkPivot).toBeGreaterThan(250);
  }, 3_600_000);
});
