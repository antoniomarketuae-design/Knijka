/**
 * THE TASK CEILING, ROUND 13 — THE ORDER-INVARIANCE PROGRAMMES (not a test file).
 *
 * The integrator's ruling for round 13, C2: «Build an ORDER-INVARIANCE property into the census: for every generated
 * act, permuting kin events by sub-second offsets inside the act must not change the points or the cards' topics.»
 *
 * ONE GENERATED ACT is a sign-bound mark blown over its gate, a wait in the sign's grace band, the PIVOT — the task bill
 * that takes the waiting act's one bill: the STAMP (the sign raised past the glass figure with the latch stamping the
 * named stretch; three acts in four), or a NEW MARK (a graded mark blown while the first arrival still waits; one in
 * four) — a stretch, and a cool-down under every line — with ONE, TWO or THREE EVENTS of the чл. 20, ал. 2 codes in it,
 * each aimed near the pivot:
 *   a WEATHER window (rain, fog or snow) ........ its first bill 3 s after it opens
 *   a BEND's advisory window .................... its first bill 1.5 s after it opens
 *   a second MARK (the same mark blown again) ... its blow: a later sign-bound blow while the sign still binds, a
 *                                                 graded blow once the stamp has begun (the round-12 verifier's MARK2)
 *   a SECOND WEATHER window ..................... opening after the first has closed — a second act of the ledger
 *                                                 inside the same M-16 act (round 11's C1 shape), its bill beside the bend's
 *
 * EVERY EVENT MOVES ON ITS OWN. `variant(shift)` is the same drive with event i moved `shift[i]` frames (0.1 s each),
 * and `shifts` is the set the act is driven under: one event — 13 offsets up to 0.9 s either way; two — the 5 × 5 grid
 * of −0.6 … +0.6 s; three — the 3 × 3 × 3 grid of −0.4 … +0.4 s. So the events cross the pivot frame in both directions
 * AND change their order AMONG THEMSELVES (the weather before the bend and after it, the mark before either and after
 * both): the permutations the ruling names. (The first cuts of this round moved the kin windows TOGETHER and compared
 * only variants with the same order of the kin bills between themselves — a narrower property than the ruling's.)
 * Everything else is frame for frame the same drive.
 *
 * WHAT IS HELD FIXED ON PURPOSE (so a difference between two variants is an ORDER effect and nothing else): the pair, the
 * sign, the speeds and the lengths are drawn once per seed, and a window keeps its LENGTH under every shift. Most
 * windows are short (they close before their own code's re-grade could fall due); a third of the single-weather acts
 * hold the weather LONG — 10 or 12 s over what it leaves of the sign, inside a 14–16 s stretch over the task's line —
 * so the weather's own re-grade (9 s) falls due in EVERY variant: the act's one charge is then contested by two
 * clocks, in every order. Half of the acts hold the M-16 act OPEN through the stretch (the car over the raised sign,
 * inside its grace band), so events seconds after the pivot are still inside the act. And a third of the acts END
 * inside the act (`cutAt`), so the ending's settlement is asked in every order too; the census compares only variants
 * in which the same windows are still open on the last frame (a window closing just before or just after the cut is a
 * DURATION difference, not an order one).
 */
import type { SimTick } from "..";
import { tick } from "./fixtures";
import { rng } from "./taskCapProgrammes";

const GRACE = 5;
export type KinKind = "BEND" | "RAIN" | "FOG" | "SNOW";
/** An event of the act: a kin window, a second mark's blow, or a second weather window (after the first has closed). */
export type EventKind = KinKind | "MARK" | "WEATHER2";
interface ActEvent {
  kind: EventKind;
  /** A window: where it opens with no shift, and its length. A mark: its blow frame with no shift (`len` 0). */
  from: number;
  len: number;
}

export interface OrderAct {
  seed: number;
  /** The act's events, in the order of their shift indices. */
  events: EventKind[];
  /** The sign at the blow, the glass figure and the gate of the mark, the raised sign of the stretch. */
  S0: number;
  glass: number;
  gate: number;
  S1: number;
  /** Frame times (s): the blow, the PIVOT (the first stamped frame, or the new mark's blow frame), the end of the stretch. */
  blowAt: number;
  stampAt: number;
  stretchEnd: number;
  /** The task bill the events are moved across: the arrival's own, on its stamp — or a new graded mark's, blown while it waits. */
  pivot: "stamp" | "mark";
  /** The weather is held LONG (past its own re-grade); the M-16 act is held open through the stretch; the time the drive ENDS at inside the act (null: it runs out under every line). */
  long: boolean;
  holdOpen: boolean;
  cutAt: number | null;
  /** The shift vectors the act is driven under (frames per event). */
  shifts: number[][];
  /** Where each event lands under a shift: a window's opening frame time, a mark's blow frame time. */
  at(shift: readonly number[]): number[];
  /** The drive with event i moved `shift[i]` frames (0.1 s each). */
  variant(shift: readonly number[]): SimTick[];
}

/** One event: up to 0.9 s either way. */
export const ORDER_SHIFTS: readonly number[] = [-9, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 9];
const GRID2: readonly number[] = [-6, -3, 0, 3, 6];
const GRID3: readonly number[] = [-4, 0, 4];
function shiftsFor(n: number): number[][] {
  if (n === 1) return ORDER_SHIFTS.map((k) => [k]);
  if (n === 2) return GRID2.flatMap((a) => GRID2.map((b) => [a, b]));
  return GRID3.flatMap((a) => GRID3.flatMap((b) => GRID3.map((c) => [a, b, c])));
}

export function generateOrderAct(seed: number, deltas: readonly number[]): OrderAct {
  const r = rng(seed * 7919 + 101);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const weather = pick(["RAIN", "RAIN", "FOG", "SNOW"] as const);
  const pivot: "stamp" | "mark" = r() < 0.25 ? "mark" : "stamp";
  // the events: a second mark and a second weather window only around the STAMP (the new-mark pivot is itself a second mark)
  const events: EventKind[] = (
    pivot === "mark"
      ? pick([["BEND"], [weather], [weather, "BEND"], [weather, "BEND"]] as const)
      : pick([["BEND"], [weather], [weather, "BEND"], [weather, "BEND"], ["MARK"], [weather, "MARK"], ["BEND", "MARK"], [weather, "BEND", "MARK"], [weather, "BEND", "WEATHER2"]] as const)
  ).slice();
  const hasMark = events.includes("MARK");
  const hasSecond = events.includes("WEATHER2");
  const S0 = pick([50, 50, 60, 70, 80, 90]);
  const glass = S0 + pick([0, 0, 0, 3]);
  const gate = glass + pick(deltas);
  const av = Math.round((gate + GRACE + 0.3 + r() * 4) * 10) / 10;
  const band = Math.min(S0 * 0.1, 5);
  // the lead-in is long enough for every window to open INSIDE the drive under every shift (a window clipped at the
  // first frame would change its length with the shift — a duration difference, not an order one)
  const leadIn = pick([6, 7, 8]);
  // (a second mark needs room between the blow and the pivot under every shift)
  const wait = pivot === "mark" ? pick([1, 2, 3]) : hasMark ? pick([2, 3]) : pick([0, 0, 0.5, 1, 2, 3]);
  // the wait: over the sign, inside its grace band — no speeding bill, never a correction
  const vWait = Math.round((S0 + pick([1, band - 0.5])) * 10) / 10;
  // THE NEW MARK (pivot "mark"): a graded mark — its glass figure well under the sign, its gate a committed difference
  // over it (capped so the car in the sign's grace band is over the mark's blow line) — blown at the pivot, the sign unmoved.
  const glass2 = S0 - 15;
  const gate2 = glass2 + Math.min(pick(deltas), 8);
  const S1 = pivot === "mark" ? S0 : glass + pick([1, 2, 3, 5, 10]);
  // LONG: one weather window held past its own re-grade, inside a stretch over the task's line long enough to hold it.
  const long = pivot === "stamp" && events.length === 1 && events[0] !== "BEND" && events[0] !== "MARK" && r() < 0.35;
  // HOLD OPEN: the stretch driven over the raised sign, inside its grace band — the M-16 act runs on through it.
  const holdOpen = pivot === "stamp" && !long && (hasSecond || r() < 0.5);
  const len = long ? pick([14, 16]) : hasSecond ? pick([10, 13]) : pick([1, 2.5, 4, 6, 10, 13]);
  const vStretch =
    pivot === "mark"
      ? Math.round(pick([vWait, gate2 + GRACE + 1, glass2 + 1]) * 10) / 10
      : holdOpen
        ? Math.round((S1 + pick([1, Math.min(S1 * 0.1, 5) - 0.5])) * 10) / 10
        : Math.round((long ? gate + GRACE + pick([1, 3]) : pick([gate + GRACE + 1, gate + GRACE + 3, glass + 1, S1 + 1, Math.max(glass + 0.5, S1 - 1)])) * 10) / 10;
  const blowAt = leadIn + 0.1;
  const stampAt = Math.round((blowAt + 0.1 + wait) * 10) / 10;
  const stretchEnd = Math.round((stampAt + len) * 10) / 10;
  // the events: each first bill (or blow) aimed at the pivot frame (+ an offset drawn once), each window short
  const acts: ActEvent[] = [];
  for (const kind of events) {
    const aim = pick([0, 0, 0, 0.3, -0.3, 0.6, -0.6, 1.2]);
    if (kind === "MARK") {
      acts.push({ kind, from: Math.round((stampAt + aim) * 10) / 10, len: 0 });
      continue;
    }
    if (kind === "WEATHER2") {
      // after the first weather window has closed under every shift (the grid moves the two up to 0.8 s apart)
      const first = acts[0];
      acts.push({ kind, from: Math.round((first.from + first.len + 1.2) * 10) / 10, len: pick([3.5, 4]) });
      continue;
    }
    const sustain = kind === "BEND" ? 1.5 : 3;
    // (pivot "mark": every window stays open past the pivot under every shift, so the new mark is blown INSIDE the kin act
    // when the kin bill came first — a kin act that had already ended is a different drive, not a different order)
    const wlen = pivot === "mark" ? (kind === "BEND" ? pick([4, 5]) : pick([5.5, 6])) : kind === "BEND" ? pick([2, 3, 4]) : long ? pick([10, 12]) : pick([3.5, 4, 5]);
    acts.push({ kind, from: Math.round((stampAt + aim - sustain) * 10) / 10, len: wlen });
  }
  // (with a second weather window, the BEND is aimed beside ITS first bill — the two permute around each other)
  if (hasSecond) {
    const second = acts[2];
    const bend = acts[1];
    bend.from = Math.round((second.from + 3 + pick([0, 0.2, -0.2]) - 1.5) * 10) / 10;
  }
  // THE CUT: the drive ends inside the act on a third of the seeds (the same frame under every shift).
  const cutAt = r() < 0.35 ? Math.round((stampAt + pick([2.5, 4.5, 7, 9.5, 12])) * 10) / 10 : null;
  // the bend's advisory under every speed of its window (so the car is over its bill line throughout)
  const adv = Math.max(15, Math.round(Math.min(S0 - 3, vWait, vStretch) - 8));
  const factor = weather === "RAIN" ? 0.85 : weather === "FOG" ? 0.6 : 0.5;
  // the cool-down: under the sign, the glass figure, the bend's advisory and anything the weather leaves of the sign
  const vCool = Math.max(12, Math.round(Math.min(S0 - 8, adv - 2, S0 * factor - 2)));
  const total = cutAt !== null ? cutAt : stretchEnd + 16;
  const at = (shift: readonly number[]): number[] => acts.map((e, i) => Math.round((e.from + (shift[i] ?? 0) / 10) * 10) / 10);
  const variant = (shift: readonly number[]): SimTick[] => {
    const where = at(shift);
    const markAt = hasMark ? where[events.indexOf("MARK")] : null;
    const out: SimTick[] = [];
    for (let i = 0; i < Math.round(total * 10); i++) {
      const t = i / 10;
      const o: Record<string, unknown> = {};
      let v: number;
      let S = S0;
      // the latch the stamp names: the first blow's, the second mark's from its blow on
      const latch = markAt !== null && t >= markAt - 1e-9 ? markAt : blowAt;
      if (t < leadIn - 1e-9) v = S0 - 3;
      else if (t < blowAt - 1e-9) v = av; // the frame the evaluator judges the mark passed at
      else if (t < stampAt - 1e-9) {
        v = vWait;
        if (Math.abs(t - blowAt) < 1e-9) o.taskCapArrival = { capKmh: gate, shownKmh: glass, graceKmh: GRACE, blownAtSec: blowAt, arrivalKmh: av };
      } else if (t < stretchEnd - 1e-9) {
        v = vStretch;
        S = S1;
        if (pivot === "stamp") o.taskSpeedCap = { capKmh: gate, shownKmh: glass, graceKmh: GRACE, blownAtSec: latch };
        else {
          // the new mark: blown on the pivot frame (the speed the evaluator judged is the wait's), stamped from it
          if (Math.abs(t - stampAt) < 1e-9) o.taskCapArrival = { capKmh: gate2, shownKmh: glass2, graceKmh: GRACE, blownAtSec: stampAt, arrivalKmh: vWait };
          o.taskSpeedCap = { capKmh: gate2, shownKmh: glass2, graceKmh: GRACE, blownAtSec: stampAt };
        }
      } else v = vCool;
      // THE SECOND MARK: the same mark passed over its gate again (the evaluator's judged speed is the first blow's)
      if (markAt !== null && Math.abs(t - markAt) < 1e-9 && t < stretchEnd - 1e-9) o.taskCapArrival = { capKmh: gate, shownKmh: glass, graceKmh: GRACE, blownAtSec: markAt, arrivalKmh: av };
      acts.forEach((e, k) => {
        if (e.kind === "MARK") return;
        const from = where[k];
        if (!(t >= from - 1e-9 && t < from + e.len - 1e-9)) return;
        const kind = e.kind === "WEATHER2" ? weather : e.kind;
        if (kind === "BEND") o.curveAdvisoryKmh = adv;
        else if (kind === "RAIN") o.rain = true;
        else if (kind === "FOG") {
          o.fog = true;
          o.fogLightsOn = true;
        } else o.snow = true;
      });
      out.push(tick(t, { maxSpeedKmh: S, speedKmh: v, ...o } as Partial<SimTick>));
    }
    return out;
  };
  return { seed, events, S0, glass, gate, S1, blowAt, stampAt, stretchEnd, pivot, long, holdOpen, cutAt, shifts: shiftsFor(events.length), at, variant };
}

/**
 * A PREFIX that spends the чл. 20, ал. 2 topic before the act (a taught weather overspeed, then 6 s under every line:
 * every act of it over, the M-16 hold served): the act that follows is the student's REPEAT on the topic.
 */
export function topicSpentPrefix(S0: number): SimTick[] {
  const out: SimTick[] = [];
  const over = Math.round((S0 * 0.85 + 2) * 10) / 10; // over what the rain leaves of the sign, under the sign
  for (let i = 0; i < 40; i++) out.push(tick(i / 10, { maxSpeedKmh: S0, speedKmh: over, rain: true } as Partial<SimTick>));
  for (let i = 40; i < 100; i++) out.push(tick(i / 10, { maxSpeedKmh: S0, speedKmh: Math.max(12, Math.round(S0 * 0.5)) } as Partial<SimTick>));
  return out;
}
/** The act's frames moved `dt` seconds later (its latch names move with them). */
export function shiftProgramme(frames: readonly SimTick[], dt: number): SimTick[] {
  const mv = (x: number) => Math.round((x + dt) * 10) / 10;
  return frames.map((x) => ({
    ...x,
    t: mv(x.t),
    ...(x.taskSpeedCap !== undefined ? { taskSpeedCap: { ...x.taskSpeedCap, blownAtSec: mv(x.taskSpeedCap.blownAtSec) } } : {}),
    ...(x.taskCapArrival !== undefined ? { taskCapArrival: { ...x.taskCapArrival, blownAtSec: mv(x.taskCapArrival.blownAtSec) } } : {}),
  }));
}
