/**
 * THE TASK CEILING, ROUND 14 — THE TWO LEDGERS, AS A PROPERTY OF THE REDUCER (not a test file).
 *
 * FOUNDER RULING 2026-10-03, verbatim: «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands
 * on its own; the bend/weather bills are charged exactly as they would be in a lesson with no cap. Blowing the cap can
 * only add, never lower the score, and order never matters.»
 *
 * At the reducer this is a statement about two runs of the SAME frames — with the cap, and with the cap fields
 * (`taskSpeedCap`, `taskCapArrival`) removed — and it needs no model of what the reducer ought to do:
 *  L1 THE NO-CAP LEDGER IS UNTOUCHED. Every violation that is not the cap's is the same event, field for field, in the
 *     same order, in both runs (code, time, `regrade`, `detail`, and no ledger mark at all).
 *  L2 THE CAP BILLS ONLY ITSELF. Without the cap there is no cap bill; with it, a cap bill carries no mark that hands it
 *     to, or takes it from, another code (`kinOwner`, `kinSurface` exist no more; `absorbedBy`, where a cap bill carries
 *     it, names the cap itself — its own act's first bill already shown).
 *  L3 PRAISE CAN ONLY BE WITHHELD. By every frame, the run with the cap has paid out no more CLEAN_DRIVING than the run
 *     without it (a blown mark resets the clean streak; it can never mint one).
 * What the cap ledger itself bills is checked two-sided against the reference (`taskCapReference.ts`) in
 * `task-cap-two-sided-census.test.ts`; what the lesson makes of both is checked in the lesson censuses.
 */
import type { RuleEvent, SimTick, ViolationEvent } from "..";
import { createRuleEngine, reduceTick } from "../engine";

export const TASK = "TASK_SPEED_CAP_EXCEEDED";

/** The same frames with every cap field removed. */
export function stripCapFrames(f: readonly SimTick[]): SimTick[] {
  return f.map((x) => {
    const { taskSpeedCap: _c, taskCapArrival: _a, ...rest } = x;
    return rest as SimTick;
  });
}

export interface Run {
  events: Array<{ i: number; e: RuleEvent }>;
}
export function runFrames(frames: readonly SimTick[]): Run {
  let s = createRuleEngine();
  const events: Array<{ i: number; e: RuleEvent }> = [];
  frames.forEach((x, i) => {
    const r = reduceTick(s, x);
    s = r.state;
    for (const e of r.events) events.push({ i, e });
  });
  return { events };
}

export interface LedgerBreach {
  prop: "L1" | "L2" | "L3";
  t: number;
  note: string;
}
export interface LedgerCoverage {
  programmes: number;
  frames: number;
  capBills: number;
  noCapBills: number;
  /** Programmes in which a cap bill and a weather or bend bill fall within 10 s of each other. */
  capAndKin: number;
  /** …a cap bill and a SPEEDING_* bill within 10 s. */
  capAndSpeeding: number;
  /** Programmes whose cap bills include one for a mark passed while BACKING. */
  reverseBlows: number;
  praiseWithheld: number;
}
export const emptyLedgerCoverage = (): LedgerCoverage => ({
  programmes: 0,
  frames: 0,
  capBills: 0,
  noCapBills: 0,
  capAndKin: 0,
  capAndSpeeding: 0,
  reverseBlows: 0,
  praiseWithheld: 0,
});

const MARKS = ["absorbedBy", "kinOwner", "kinSurface", "signBoundArrival"] as const;
const viol = (r: Run) => r.events.filter((x): x is { i: number; e: ViolationEvent } => x.e.kind === "violation");
const sig = (e: ViolationEvent) => JSON.stringify(e);

export function ledgerBreaches(frames: readonly SimTick[], cov?: LedgerCoverage): LedgerBreach[] {
  const out: LedgerBreach[] = [];
  const cap = runFrames(frames);
  const noCap = runFrames(stripCapFrames(frames));
  const capV = viol(cap);
  const noCapV = viol(noCap);
  // L1 — the no-cap ledger, field for field and in order.
  const a = capV.filter((x) => x.e.code !== TASK);
  const n = Math.max(a.length, noCapV.length);
  for (let k = 0; k < n; k++) {
    const x = a[k];
    const y = noCapV[k];
    if (x === undefined || y === undefined || x.i !== y.i || sig(x.e) !== sig(y.e)) {
      out.push({ prop: "L1", t: (x ?? y).e.t, note: `with cap ${x ? sig(x.e) : "—"} / no cap ${y ? sig(y.e) : "—"}` });
      break;
    }
  }
  for (const y of noCapV) for (const m of MARKS) if ((y.e as unknown as Record<string, unknown>)[m] !== undefined) out.push({ prop: "L1", t: y.e.t, note: `a no-cap bill carries ${m}` });
  // L2 — the cap bills only itself.
  for (const y of noCapV) if (y.e.code === TASK) out.push({ prop: "L2", t: y.e.t, note: "a cap bill with no cap" });
  for (const x of capV) {
    const r = x.e as unknown as Record<string, unknown>;
    if (r.kinOwner !== undefined || r.kinSurface !== undefined) out.push({ prop: "L2", t: x.e.t, note: `${x.e.code} carries a hand-over mark` });
    if (x.e.code !== TASK && (r.absorbedBy !== undefined || r.signBoundArrival !== undefined)) out.push({ prop: "L2", t: x.e.t, note: `${x.e.code} absorbed with the cap` });
    if (x.e.code === TASK && r.absorbedBy !== undefined && r.absorbedBy !== TASK) out.push({ prop: "L2", t: x.e.t, note: `a cap bill absorbed by ${String(r.absorbedBy)}` });
  }
  // L3 — praise can only be withheld.
  const praiseByFrame = (r: Run) => {
    const c = new Array<number>(frames.length).fill(0);
    for (const x of r.events) if (x.e.kind === "commendation" && x.e.code === "CLEAN_DRIVING") c[x.i]++;
    for (let i = 1; i < c.length; i++) c[i] += c[i - 1];
    return c;
  };
  const pc = praiseByFrame(cap);
  const pn = praiseByFrame(noCap);
  for (let i = 0; i < frames.length; i++) {
    if (pc[i] > pn[i]) {
      out.push({ prop: "L3", t: frames[i].t, note: `praise ${pc[i]} with the cap, ${pn[i]} without` });
      break;
    }
  }
  if (cov !== undefined) {
    cov.programmes++;
    cov.frames += frames.length;
    const capBills = capV.filter((x) => x.e.code === TASK);
    cov.capBills += capBills.length;
    cov.noCapBills += noCapV.length;
    const near = (codes: readonly string[]) =>
      capBills.some((c) => noCapV.some((y) => codes.includes(y.e.code) && Math.abs(y.e.t - c.e.t) <= 10));
    if (near(["SPEED_TOO_FAST_FOR_CONDITIONS", "SPEED_TOO_FAST_FOR_CURVE"])) cov.capAndKin++;
    if (near(["SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS"])) cov.capAndSpeeding++;
    if (frames.some((x, i) => x.taskCapArrival !== undefined && (x.speedKmh < 0 || (i > 0 && frames[i - 1].speedKmh < 0)))) cov.reverseBlows++;
    if (pc[frames.length - 1] < pn[frames.length - 1]) cov.praiseWithheld++;
  }
  return out;
}
