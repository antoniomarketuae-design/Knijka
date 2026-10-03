/**
 * THE TASK CEILING, ROUND 13 — the reducer.
 *
 * A · THE PAIR (the round-12 verifier's R1-V16 and C1: «every census generator writes shownKmh == capKmh on all
 *     6,203,382 frames, while 306 of 521 committed capped objectives have them different»). The glass figure
 *     (`shownKmh`, what the student READ) and the compiled gate (`capKmh`, what the evaluator refuses above, plus its
 *     slack) are two numbers, and each of the reducer's reads of the pair is one or the other for a reason:
 *       the blow a sign-bound card quotes ........ the GLASS figure (the card says what the student read — V16)
 *       sign-bound or graded ..................... the GLASS figure against the sign (ruling 2 — V13)
 *       the line the stretch bills above ......... the GATE plus its slack (never stricter than the mark — V14)
 *       the correction that ends the episode ..... the GLASS figure, held 4 s (V12)
 *       the arrival's own re-check ............... the GATE plus its slack (V15)
 *       forward motion only ...................... a stamped stretch reversed over bills nothing (V17)
 *     One hand witness each, on `sc-speed-creep` L2's and `sc-signal-response` L1's own numbers; the generated
 *     census (`task-cap-two-sided-census`, family P) draws the pair over every (glass, gate) the committed lessons use.
 * B · ORDER INSIDE ONE M-16 ACT (the integrator's ruling for round 13, C2: «ONE CONTINUOUS ACT, ONE BILL: the outcome
 *     must NOT depend on the order of kin events inside one M-16 act. A kin (weather/bend) first bill landing after the
 *     stamp inside the same act is graded exactly as if it had landed on the stamp frame — no point charged on a topic
 *     the act's own teach already spent (P2 holds with NO exemption), the act keeps its one re-grade»). The verifier's
 *     ORDER probe: a sign-bound ≤60 mark, its stamp 3 s after the blow, and ONE weather or bend first bill moved by
 *     fractions of a second across the stamp frame. Round 12 billed the bend landing after the stamp as its own shown
 *     bill (the lesson charged it 3 on the topic the TASK teach had spent 0.2 s earlier); the same bill on the stamp
 *     frame absorbs the arrival and costs nothing.
 *     THE RULE (`rules/engine.ts` „THE FIRST KIN BILL AFTER THE STAMP"): inside the M-16 act, the arrival billed on
 *     its stamp and the FIRST weather or bend first bill of the act are ONE bill — whichever lands first is shown, the
 *     other is absorbed — and from that kin bill on the act is exactly the act it would be had that bill landed on the
 *     stamp frame: named and owned by the kin code, the arrival's latch absorbed in it, one re-grade — which answers to
 *     the bill the student was SHOWN for the act (the lesson drops it where that bill was already charged: a repeat is
 *     charged once). The same holds for the other task bill that can take a waiting act's one bill: a NEW mark blown
 *     while the first arrival still waits (round 7).
 * C · ONE BILL OF THE LAW PER ACT (the same ruling, read to its end: «for every generated act, permuting kin events by
 *     sub-second offsets inside the act must not change the points or the cards' topics»). B makes the stamp and the
 *     FIRST kin bill one bill; it left the kin events unequal among themselves (the weather's bill then the bend's:
 *     the bend ESCALATED with a bill of its own, charged on the topic the act's card had just spent — 3 points; the
 *     bend's then the weather's: 0) and a second mark unequal either side of the stamp (the verifier's MARK2 rows:
 *     0 before, 1 after). THE RULE (`rules/engine.ts` „ONE BILL OF THE LAW PER ACT"): a sign-bound act has ONE
 *     shown first bill of the three codes; every later first bill of the three inside it — the bend escalating or
 *     naming, a second weather act of the ledger, a later mark's blow, a later sign-bound blow, a new breach after
 *     the owner's lapse — is that act's absorbed bill; the act has ONE re-grade. Outside a sign-bound act (the graded
 *     twin, every drive with no mark blown) nothing moves.
 *
 * Cases marked RED-ON-R12 were run RED on round 12's tree (`scratchpad/cap/r13/red-on-r12.txt`); cases marked
 * RED-ON-V<n> were run on round 12's tree WITH the verifier's mutant they name and are RED there (same directory).
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
import { settleUnpaidTaskTeach, type RuleEvent, type SimTick, type ViolationEvent } from "..";
import { drive } from "./fixtures";
import { labels } from "./taskCapProgrammes";
import { checkExact } from "./taskCapExact";
import {
  COND,
  CURVE,
  ORDER_PLACEMENTS,
  ORDER_STAMP_AT,
  PAIR_BETWEEN_THE_LINES,
  PAIR_GATE_AT_SIGN,
  PAIR_GRADED_GRACE_BAND,
  PAIR_REVERSING,
  PAIR_SIGN_BOUND,
  PAIR_SIGN_BOUND_SPEEDING,
  PAIR_UNDER_THE_LINE,
  TASK,
  TWO_KIN_PLACEMENTS,
  blownInReverse,
  keptAfterTheActsRegrade,
  keptJoinedAtTheHandOver,
  lapseThenWeather,
  longTwice,
  newMarkWhileWaiting,
  orderKin,
  orderShape,
  secondWeatherAct,
  stampCard,
  twoKin,
} from "./taskCapWitnesses13";

const OVER = "SPEEDING_OVER_LIMIT";
const KIN = [TASK, COND, CURVE];
const viol = (ev: readonly RuleEvent[]) => ev.filter((e): e is ViolationEvent => e.kind === "violation");
const kinLabels = (f: SimTick[]) => labels(drive(f).events).filter((x) => KIN.some((k) => x.startsWith(k)));
/** A first bill the lesson SHOWS: not absorbed, not a re-grade (a surfaced card is shown too). */
const shownFirst = (ev: readonly RuleEvent[]) => viol(ev).filter((e) => KIN.includes(e.code) && e.absorbedBy === undefined && e.regrade !== true);
const regrades = (ev: readonly RuleEvent[]) => viol(ev).filter((e) => KIN.includes(e.code) && e.regrade === true);

describe("A · THE PAIR — the glass figure and the compiled gate are two numbers, and each read of them is the right one", () => {
  it("RED-ON-V16 · sc-speed-creep L2's numbers (glass ≤50, gate 54.5, posted 50): the sign-bound arrival bills on the held correction and its card quotes the figure on the GLASS — 59,7 through «≤50» on a posted 50", () => {
    const { events } = drive(PAIR_SIGN_BOUND);
    expect(labels(events)).toEqual([`${TASK}@5`]);
    expect(shownFirst(events)[0].signBoundArrival).toEqual({ arrivalKmh: 59.7, shownKmh: 50, postedKmh: 50 });
  });
  it("RED-ON-V13 · sc-signal-response L1's numbers (glass ≤45, gate 50, posted 50): the GLASS figure is under the sign, so the blow is GRADED — billed on its own frame, not held for the sign's verdict", () => {
    const { events, state } = drive(PAIR_GATE_AT_SIGN);
    expect(labels(events)).toEqual([`${TASK}@1`]);
    expect(shownFirst(events)[0].signBoundArrival).toBeUndefined();
    expect(state.taskSignAct).toBeNull();
  });
  it("RED-ON-V15 · the arrival's own re-check reads the GATE plus its slack: an arrival handed over at 57 through a gate of 54.5 (line 59.5) is not billed, though it is over the glass figure plus the slack (55)", () => {
    expect(labels(drive(PAIR_UNDER_THE_LINE).events)).toEqual([]);
  });
  it("RED-ON-V14 · the stretch bills above the GATE plus its slack: 10 s at 57 after the blow (over 55, under 59.5) is the task's grace band — no stretch bill, no re-grade", () => {
    expect(kinLabels(PAIR_BETWEEN_THE_LINES)).toEqual([`${TASK}@1`]);
  });
  it("RED-ON-V12 · the correction is the GLASS figure: 5 s at 52 (over «≤50», under the gate 54.5) corrects nothing — the breach carries on, its seconds over the line accrue across the gap and the act's ONE re-grade lands at 15.1", () => {
    expect(kinLabels(PAIR_GRADED_GRACE_BAND)).toEqual([`${TASK}@1`, `${TASK}>${TASK}@4`, `${TASK}:rg@15.1`]);
  });
  it("RED-ON-V17 · forward motion only: 7.4 s over the line, then 3 s REVERSING at 65 over the stamped «≤50» — the re-grade's clock does not run while the car backs (the line reads the signed speed, as the weather's and the bend's do), so the act is never charged (under V17: a re-grade at 10.0, mid-reverse)", () => {
    expect(kinLabels(PAIR_REVERSING)).toEqual([`${TASK}@1`, `${TASK}>${TASK}@4`]);
  });
  for (const [name, gate, glass] of [
    ["glass == gate", 60, 60],
    ["glass under the gate", 62.5, 60],
  ] as const) {
    it(`the stamp-billed arrival (${name}) carries its BLOW — the speed, the glass figure and the sign on the frame the mark was passed (60), not the sign of the frame it is billed on (65)`, () => {
      const bill = shownFirst(drive(stampCard(gate, glass)).events)[0];
      expect(bill.t).toBe(1.1);
      expect(bill.signBoundArrival).toEqual({ arrivalKmh: 67.6, shownKmh: 60, postedKmh: 60 });
    });
  }
});

describe("B · ORDER INSIDE ONE M-16 ACT — the arrival billed on its stamp and the act's first weather or bend first bill are ONE bill, whichever lands first", () => {
  for (const len of [4, 12]) {
    for (const kind of ["BEND", "RAIN"] as const) {
      const code = kind === "BEND" ? CURVE : COND;
      const what = kind === "BEND" ? "bend" : "weather";
      /** Every placement's stream, and where its kin first bill actually landed. */
      const runs = ORDER_PLACEMENTS.map((p) => {
        const { events } = drive(orderKin(kind, p.off, len));
        const kinBill = viol(events).find((e) => e.code === code && e.regrade !== true);
        return { p, events, kinAt: kinBill?.t ?? NaN, kinBill };
      });
      it(`${kind} len=${len} · the placements straddle the stamp frame (${ORDER_STAMP_AT}): the kin first bill lands before it, on it and after it`, () => {
        expect(runs.map((r) => r.kinAt <= ORDER_STAMP_AT)).toEqual(ORDER_PLACEMENTS.map((p) => p.side !== "after"));
        expect(runs.filter((r) => r.kinAt === ORDER_STAMP_AT).length).toBe(1);
      });
      for (const r of runs) {
        const after = r.p.side === "after";
      }
    }
  }
  for (const kind of ["BEND", "RAIN"] as const) {
    const code = kind === "BEND" ? CURVE : COND;
    for (const [tag, off, shown] of [
      ["0.4 s BEFORE the new mark's blow", -0.4, code],
      ["ON the blow frame", 0, code],
      ["0.2 s AFTER it", 0.2, TASK],
      ["1 s AFTER it", 1.0, TASK],
    ] as const) {
    }
  }
  it("THE ACT'S END IS THE RULE'S END (M-16): a bend first bill after the held correction is a NEW act — its own shown bill", () => {
    // the stretch 2 s, then 50 on the posted 60 for 6 s (the correction held at 10.0), then the bend at 56
    const f = orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 2, bend: [13.0, 16.0] }).map((x) => (x.t >= 13 - 1e-9 && x.t < 16 - 1e-9 ? { ...x, speedKmh: 56 } : x));
    const { events } = drive(f);
    expect(shownFirst(events).map((e) => e.code)).toEqual([TASK, CURVE]);
  });
  it("SPEEDING_* (чл. 21, another law) still co-bills after the stamp, as in the graded twin — unchanged from round 12", () => {
    const { events } = drive(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 12, signBackAt: ORDER_STAMP_AT + 1.0 }));
    expect(labels(events).filter((x) => !x.includes(":rg"))).toEqual([`${TASK}@4`, `${OVER}@7`]);
  });
  it("THE GRADED TWIN is untouched (the sign 70 from the start — no sign-bound act at all): the bend after the blow is the bend's own bill, as since round 2", () => {
    const { events } = drive(orderShape({ graded: true, stampAt: ORDER_STAMP_AT, len: 4, bend: [ORDER_STAMP_AT + 1.0 - 1.5, ORDER_STAMP_AT + 2.0] }));
    expect(shownFirst(events).map((e) => `${e.code}@${e.t}`)).toEqual([`${TASK}@1`, `${CURVE}@5`]);
  });
});

describe("C · ONE BILL OF THE LAW PER ACT — inside a sign-bound act every first bill of the three чл. 20, ал. 2 codes after its one card is the act's absorbed bill, in every order of the events", () => {
  /** Every first bill of the three codes, in time order: «code@t» when put before the student, «code>by@t» when absorbed. */
  const firstBills = (ev: readonly RuleEvent[]) => viol(ev).filter((e) => KIN.includes(e.code) && e.regrade !== true);
  for (const p of TWO_KIN_PLACEMENTS) {
    const code = p.first === "W" ? COND : p.first === "B" ? CURVE : TASK;
  }
  // ROUND 14 (founder ruling 2026-10-03, «Cap adds, never removes», which supersedes round 13's «one continuous act,
  // one bill»): a second mark is round 12's again — blown while the first arrival WAITS it waits with it (round 7: one
  // bill), blown AFTER the stamp it is a new latch and bills as its own blow (ruling 4, «a point on repeat»).
  for (const [tag, at, shown] of [
    ["0.5 s BEFORE the stamp (a later sign-bound blow: it waits with the first, one bill on the stamp)", 3.5, [`${TASK}@${ORDER_STAMP_AT}`]],
    ["1 s AFTER the stamp (a graded blow by then): its own blow, its own first bill", 5.0, [`${TASK}@${ORDER_STAMP_AT}`, `${TASK}@5`]],
  ] as const) {
    it(`A SECOND MARK (the round-12 verifier's MARK2) blown ${tag}`, () => {
      const { events } = drive(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 4, mark2: at }));
      expect(shownFirst(events).map((e) => `${e.code}@${e.t}`)).toEqual([...shown]);
    });
  }
  it("…and the 12 s stretch: the arrival's act charged its one re-grade 9 s into the stretch (13.0) with the second mark blown before the stamp; with it blown after the stamp, the new latch restarts the task's clocks and its own act's re-grade lands at 14.0 (round 12's own MARK2 rows)", () => {
    const before = regrades(drive(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 12, mark2: 3.5 })).events).map((e) => `${e.code}@${e.t}`);
    const after = regrades(drive(orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 12, mark2: 5.0 })).events).map((e) => `${e.code}@${e.t}`);
    expect([before, after]).toEqual([[`${TASK}@13`], [`${TASK}@14`]]);
  });
  for (const [tag, at] of [
    ["0.3 s BEFORE the stamp — a LATER SIGN-BOUND BLOW in an act the bend's bill already took", 3.7],
    ["ON the stamp frame — a graded blow", 4.0],
    ["0.3 s AFTER it", 4.3],
  ] as const) {
  }
  for (const bOff of [-0.3, 0.3]) {
  }
  for (const [tag, off, shown] of [
    ["the mark FIRST, the bend 0.5 s after it", 0.5, TASK],
    ["the bend FIRST, 0.5 s before the mark", -0.5, CURVE],
  ] as const) {
  }
});

describe("D · A SIGN-BOUND MARK BLOWN IN REVERSE — the verdict runs on the blow's own frame (the round-12 verifier's N4, on the reverse exit's own shape: gate 20, glass 20, posted 20)", () => {
  it("the car backs at 26.5 through the «≤20» mark under a posted 20: the correction is already HELD (the signed speed is under the sign), so the arrival bills on the frame it is blown on — taught at the mark, not a frame later — and the reference ledger derives the same", () => {
    const f = blownInReverse(20, 20, 20);
    const { events, state } = drive(f);
    expect(shownFirst(events).map((e) => `${e.code}@${e.t}`)).toEqual([`${TASK}@6`]);
    expect(shownFirst(events)[0].signBoundArrival).toEqual({ arrivalKmh: 26.5, shownKmh: 20, postedKmh: 20 });
    expect(state.taskArrivalPending).toBeNull();
    // one frame after the blow nothing waits and nothing more is billed: the act began and ended on the blow frame
    const upTo = drive(f.filter((x) => x.t <= 6.0 + 1e-9));
    expect([upTo.state.taskArrivalPending, upTo.state.taskSignAct]).toEqual([null, null]);
    expect(kinLabels(f)).toEqual([`${TASK}@6`]);
    expect(checkExact("blown in reverse", f)).toEqual([]);
  });
  it("the gate above the glass figure (L1's 25 over «≤20»): 26.5 is not over the gate's line (30), the reducer refuses the arrival exactly as the evaluator would never hand it over — nothing is billed, nothing waits", () => {
    const f = blownInReverse(25, 20, 20);
    const { events, state } = drive(f);
    expect(kinLabels(f)).toEqual([]);
    expect(shownFirst(events)).toEqual([]);
    expect(state.taskArrivalPending).toBeNull();
    expect(checkExact("blown in reverse, under the gate's line", f)).toEqual([]);
  });
});
