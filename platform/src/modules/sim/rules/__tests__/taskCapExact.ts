/**
 * THE TASK CEILING, ROUND 12 (two ledgers since round 14) — the EXACT comparison of the generated census (not a test
 * file): the real reducer, run as the system under test, projected onto the student-visible bill stream the reference
 * ledger (`taskCapReference.ts`) derives from the rulings, and compared frame by frame — EVERY rule event of the frame
 * (each violation, whatever its code, with what the lesson does with it, and each commendation), and what the ending
 * of a drive stopped on that frame would settle (`settleUnpaidSpeedingTeach`, `settlePendingTaskArrival`,
 * `settleUnpaidTaskTeach`, `settleUnpaidAdaptationTeach` — the system's own ending, asked on every frame). Any
 * difference is a finding, reported with the seed and the frame.
 *
 * Round 14: a bill's `absorbedBy` must name the cap itself (the two-ledger property `taskCapTwoLedgers.ts` L2 checks
 * it everywhere; here a cap bill absorbed by anything else, or any other code absorbed at all, projects as a kind the
 * reference never produces, so it is a difference too).
 */
import {
  createRuleEngine,
  reduceTick,
  settlePendingTaskArrival,
  settleUnpaidAdaptationTeach,
  settleUnpaidSpeedingTeach,
  settleUnpaidTaskTeach,
  type RuleEngineState,
  type SimTick,
  type ViolationEvent,
} from "..";
import { billKey, expectedOutcome, type Bill, type Coverage14, type Ending } from "./taskCapReference";

/** The student-visible projection of one reducer bill. */
export function project(e: ViolationEvent): Bill {
  const absorbed = e.absorbedBy !== undefined;
  const kind =
    e.regrade === true
      ? "regrade"
      : absorbed && (e.code !== "TASK_SPEED_CAP_EXCEEDED" || e.absorbedBy !== "TASK_SPEED_CAP_EXCEEDED")
        ? (`absorbed-by-${String(e.absorbedBy)}` as Bill["kind"])
        : absorbed
          ? "absorbed"
          : "shown";
  return {
    t: e.t,
    code: e.code,
    kind,
    ...(e.signBoundArrival !== undefined ? { blow: e.signBoundArrival } : {}),
  };
}
const endingKey = (e: ViolationEvent | null): string | null => (e === null ? null : billKey(project(e)));

export interface SutRun {
  bills: Bill[][];
  endings: Ending[];
  state: RuleEngineState;
}
export function runSystem(frames: readonly SimTick[]): SutRun {
  let s: RuleEngineState = createRuleEngine();
  const bills: Bill[][] = [];
  const endings: Ending[] = [];
  for (const x of frames) {
    const r = reduceTick(s, x);
    s = r.state;
    // EVERY rule event of the frame: every violation, whatever its code, and every commendation — so a bill or a
    // praise the reference does not expect is a difference too, not a thing the comparison cannot see.
    bills.push(r.events.map((e) => (e.kind === "violation" ? project(e) : { t: e.t, code: e.code, kind: "praise" as const })));
    endings.push({
      speeding: endingKey(settleUnpaidSpeedingTeach(s, x)),
      pending: endingKey(settlePendingTaskArrival(s, { t: x.t })),
      task: endingKey(settleUnpaidTaskTeach(s, x)),
      adaptation: settleUnpaidAdaptationTeach(s, x).map((e) => billKey(project(e))),
    });
  }
  return { bills, endings, state: s };
}

export interface Mismatch {
  seed: string;
  t: number;
  what: "bills" | "ending";
  expected: string;
  actual: string;
}
export function checkExact(seed: string, frames: readonly SimTick[], cov?: Coverage14): Mismatch[] {
  const exp = expectedOutcome(frames, cov);
  const sut = runSystem(frames);
  for (let i = 0; i < frames.length; i++) {
    const e = exp.bills[i].map(billKey).join(" ");
    const a = sut.bills[i].map(billKey).join(" ");
    if (e !== a) return [{ seed, t: frames[i].t, what: "bills", expected: e, actual: a }];
    const ee = JSON.stringify(exp.endings[i]);
    const ae = JSON.stringify(sut.endings[i]);
    if (ee !== ae) return [{ seed, t: frames[i].t, what: "ending", expected: ee, actual: ae }];
  }
  return [];
}
