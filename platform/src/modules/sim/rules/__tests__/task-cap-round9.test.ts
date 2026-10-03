/**
 * THE TASK CEILING, ROUND 9 — the reducer.
 *
 * B · ABSORPTION BY ANY KIN OR SPEEDING BILL INSIDE THE ACT (round-8 verifier
 * F4-KIN-DOUBLE; the integrator's ruling for round 9, binding). Ruling 4 reads
 * «one act with any kin breach in the same continuous act: one act, one bill,
 * taught first, a point on repeat». Round 8 made the sign-bound arrival WAIT for
 * the M-16 held correction — right — but a bend or weather act named inside
 * that wait ends on its first frame back inside its own lines, so the arrival
 * then billed ALONE as a new act and was CHARGED on the topic the kin teach had
 * already spent (the verifier's reducer K1 and K3; on the committed lesson
 * sc-sp-curve / sc-spcv-approach, L1/L2/L3/L5, the score went 0 → 1). The rule:
 * the FIRST bill or teach naming of SPEEDING_*, SPEED_TOO_FAST_FOR_CONDITIONS or
 * SPEED_TOO_FAST_FOR_CURVE that falls anywhere inside the sign-bound act — the
 * M-16 act: from the first frame over the sign to the frame the correction has
 * been HELD `speedingRearmSec` — before or after the blow frame, absorbs the
 * arrival. It never bills on its own after that. The act's END stays M-16.
 *
 * The verifier's reducer reproductions K1–K4 and K1g
 * (`scratchpad/cap/verify8/probes/zz-v8-kin.test.ts`) are ported verbatim.
 *
 * C · Z12 (round-8 verifier N5): the speeding RE-GRADE resets only on the
 * correction that counts — the 2026-08-30 fix, which shares
 * `speedCorrectionHeld` with the sign-bound act's end. It survived 1,977 tests.
 *
 * K · THE ABSORPTION LEAVES NOTHING BEHIND (the lane's own mutants K8 and K15,
 * and round 8's B12 — whose round-7 test now absorbs at the blow and so no
 * longer reaches the ending's guard): an arrival handed over by an absorbing kin
 * bill neither surfaces on a flag an earlier breach left up, nor leaves one of
 * its own; and a drive that ends while an arrival still waits inside a kin act
 * already named hands nothing over.
 *
 * J · THE JOINED ACT (round-8 verifier N7-W2, confirmed by the integrator): the
 * kept act joining an act opened meanwhile brings its teach along, so the
 * ending still settles the task it taught (the lane's mutant J3).
 *
 * Every B case not marked GUARD or PIN, and the two surface-flag K cases, were
 * run RED on round 8 (`scratchpad/cap/r9/red-on-r8-list.txt`,
 * `red-on-r8-rules-final.json`): there the arrival waited instead of being
 * absorbed. The ending's guard (B12), the J case and the C cases pass on round 8
 * — they pin behaviour the product already had, and each is proven by the mutant
 * it kills: B12, J3, Z12 (`scratchpad/cap/r9/mut-run-*.txt`).
 *
 * ROUND 14 — RETIRED HERE: 17 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { describe, expect, it } from "vitest";
import { settlePendingTaskArrival, settleUnpaidTaskTeach, type RuleEvent, type SimTick, type TaskSpeedCap, type ViolationEvent } from "..";
import { drive, tick } from "./fixtures";

const DT = 0.1;
const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
const OVER = "SPEEDING_OVER_LIMIT";
const DANGER = "SPEEDING_DANGEROUS";
const REARM_SEC = 4; // `speedingRearmSec` — the M-16 correction that counts

type Arrival = { capKmh: number; shownKmh: number; graceKmh: number; blownAtSec: number; arrivalKmh: number };
type Seg = { sec: number; speedKmh: number; over?: Partial<SimTick> & { taskCapArrival?: Arrival } };
function frames(segs: Seg[], base: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (const s of segs) {
    const n = Math.max(1, Math.round(s.sec / DT));
    for (let i = 0; i < n; i++) {
      out.push(tick(Math.round(t * 10) / 10, { maxSpeedKmh: 50, ...base, speedKmh: s.speedKmh, ...s.over } as Partial<SimTick>));
      t += DT;
    }
  }
  return out;
}
const at = (arrival: Arrival, speedKmh: number, over: Partial<SimTick> = {}): Seg => ({
  sec: DT,
  speedKmh,
  over: { ...over, taskCapArrival: arrival } as Seg["over"],
});
const viol = (events: RuleEvent[]) => events.filter((e): e is ViolationEvent => e.kind === "violation");
/** What a lesson acts on: absorbed first bills are dropped before the coach. */
const named = (events: RuleEvent[]) =>
  viol(events)
    .filter((e) => e.absorbedBy === undefined)
    .map((e) => `${e.code}${e.regrade === true ? ":regrade" : ""}${(e as unknown as { kinSurface?: string }).kinSurface !== undefined ? ":surface" : ""}@${e.t}`);
const absorbed = (events: RuleEvent[]) =>
  viol(events)
    .filter((e) => e.absorbedBy !== undefined)
    .map((e) => `${e.code}>${e.absorbedBy}@${e.t}`);
const praise = (events: RuleEvent[]) =>
  events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);
const taskEvents = (events: RuleEvent[]) => viol(events).filter((e) => e.code === TASK);

/** The frame the M-16 act ends on: the first frame on which the car has been continuously at or under the sign for 4 s. */
function m16End(f: SimTick[], fromT: number): number | null {
  let since: number | null = null;
  for (const x of f) {
    if (x.t < fromT) continue;
    if (x.speedKmh > x.maxSpeedKmh) {
      since = null;
      continue;
    }
    if (since === null) since = x.t;
    if (x.t - since >= REARM_SEC) return x.t;
  }
  return null;
}

/** A ≤50 task on a posted-50 road: the glass cap EQUALS the sign (sign-bound). */
const SIGN50 = (b: number, v = 58): Arrival => ({ capKmh: 50, shownKmh: 50, graceKmh: 5, blownAtSec: b, arrivalKmh: v });
/** The GRADED analog: a ≤40 glass cap under the posted 50. */
const G40 = (b: number, v = 58): Arrival => ({ capKmh: 40, shownKmh: 40, graceKmh: 5, blownAtSec: b, arrivalKmh: v });
const cap40 = (b: number): TaskSpeedCap => ({ capKmh: 40, shownKmh: 40, graceKmh: 5, blownAtSec: b });
const rain = { rain: true };

// The verifier's reducer reproductions, byte-for-byte (verify8/probes/zz-v8-kin.test.ts).
const K1: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 5, speedKmh: 54 }, { sec: 5, speedKmh: 40 }, { sec: 8, speedKmh: 40 }];
const K2: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 5, speedKmh: 54 }, { sec: 5, speedKmh: 46 }, { sec: 8, speedKmh: 40 }];
const K1g: Seg[] = [
  { sec: 2, speedKmh: 45 },
  { sec: 0.5, speedKmh: 58 },
  at(G40(2.5), 58, { taskSpeedCap: cap40(2.5) }),
  { sec: 5, speedKmh: 54, over: { taskSpeedCap: cap40(2.5) } },
  { sec: 5, speedKmh: 40 },
  { sec: 8, speedKmh: 40 },
];
const K3: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 5, speedKmh: 54 }, { sec: 0.4, speedKmh: 58 }, at(SIGN50(7.4), 58), { sec: 0.5, speedKmh: 54 }, { sec: 5, speedKmh: 40 }, { sec: 8, speedKmh: 40 }];
const K4: Seg[] = [{ sec: 2, speedKmh: 45 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(2.5), 58), { sec: 30, speedKmh: 54 }, { sec: 5, speedKmh: 40 }, { sec: 8, speedKmh: 40 }];

describe("B · the verifier's reducer K1–K4 (F4-KIN-DOUBLE): one act, one bill, whatever kin code names it", () => {
  it("GUARD — K1dry, the same speeds with no weather: nothing absorbs the arrival, so it bills itself on the frame the correction has been held (11.6), exactly as on round 8", () => {
    const { events } = drive(frames(K1));
    expect(named(events)).toEqual([`${TASK}@11.6`]);
    expect(absorbed(events)).toEqual([]);
  });
  it("GUARD — K4, dry, 30 s in the sign's grace band then 40: no kin, no speeding bill in the act — the arrival bills itself at the held frame (36.6)", () => {
    const { events } = drive(frames(K4));
    expect(named(events)).toEqual([`${TASK}@36.6`]);
  });
});

describe("B · «before or after the blow frame» — the whole M-16 act, not only the stretch after the blow", () => {
  it("GUARD — the same weather bill in an EARLIER M-16 act (the dip to 42 held 5 s: a correction that counts): a new act, the arrival bills itself at its own held frame", () => {
    const f = frames([{ sec: 5, speedKmh: 54 }, { sec: 5, speedKmh: 42 }, { sec: 0.5, speedKmh: 58 }, at(SIGN50(10.5), 58), { sec: 8, speedKmh: 40 }], rain);
    const { events } = drive(f);
    expect(m16End(f, 10.6)).toBe(14.6);
    expect(named(events)).toEqual([`${COND}@3`, `${TASK}@14.6`]);
    expect(absorbed(events)).toEqual([]);
  });
});

describe("C · Z12 — the speeding RE-GRADE resets only on the correction that counts (the 2026-08-30 fix, which shares `speedCorrectionHeld` with the act's end)", () => {
  const sawTooth = () => {
    const out: SimTick[] = [];
    let t = 0;
    for (let cycle = 0; cycle < 12; cycle++) {
      out.push(tick(t++, { speedKmh: 56 }));
      out.push(tick(t++, { speedKmh: 56 }));
      out.push(tick(t++, { speedKmh: 56 }));
      out.push(tick(t++, { speedKmh: 48 })); // one frame back under the sign — not a correction
    }
    return out;
  };
  const speeding = (events: RuleEvent[]) => viol(events).filter((e) => e.code === OVER);
  it("the saw-tooth (3 s at 56, ONE frame at 48, twelve times): one continuing offence — its re-grade lands at 14 s, as the steady driver's does", () => {
    const { events } = drive(sawTooth());
    expect(speeding(events).filter((e) => e.regrade === true).map((e) => e.t)).toEqual([14]);
    // …and the steady 56 for 48 s re-grades too (at 8 s): sustained is never cheaper than oscillating.
    const steady = drive(Array.from({ length: 48 }, (_, i) => tick(i, { speedKmh: 56 })));
    expect(speeding(steady.events).filter((e) => e.regrade === true).map((e) => e.t)).toEqual([8]);
  });
  it("GUARD — the same saw-tooth with every dip HELD 5 s (a correction that counts): each stretch is a new act, its ledger wiped — no re-grade", () => {
    const out: SimTick[] = [];
    let t = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 3; i++) out.push(tick(t++, { speedKmh: 56 }));
      for (let i = 0; i < 5; i++) out.push(tick(t++, { speedKmh: 48 }));
    }
    const { events } = drive(out);
    expect(speeding(events).filter((e) => e.regrade === true)).toEqual([]);
    expect(speeding(events).filter((e) => e.regrade !== true).length).toBe(6);
  });
});

// ROUND 14: «B · the kin ledger's surface flag and the ending — what the absorption must leave behind (mutants K8, K15, round 8's B12)» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ROUND 14: «J · THE JOINED ACT (verifier N7-W2, confirmed by the integrator): the kept act brings its charge, its teach and its absorbed arrival into th» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
