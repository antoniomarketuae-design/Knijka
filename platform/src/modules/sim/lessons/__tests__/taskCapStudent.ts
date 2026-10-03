/**
 * THE TASK CEILING — WHAT THE STUDENT IS SHOWN AND CHARGED, stated from the rules (not a test file). Round 13; round
 * 14: TWO LEDGERS (founder ruling 2026-10-03, «Cap adds, never removes»).
 *
 * The reference ledger (`rules/__tests__/taskCapReference.ts`) derives every rule event of a drive from the rulings.
 * This file states the second half — what a practice lesson does with that stream — so the lesson-level censuses can
 * compare a REAL lesson session with an expectation that imports none of the lesson's own decision code:
 *
 *  · `studentOf` — the coached rows, the charged mistakes and the points. The rules it restates:
 *      – one free teach per TOPIC (founder ruling 16), every encounter counting against the topic; опасна graded on
 *        sight. The weather's and the bend's topic is their mini-lesson's (`scenarioForCode`); the CAP's grace is its
 *        own (founder ruling 2026-10-03 — ruling 16 applied to the cap's own fault), so a cap teach never spends the
 *        weather/bend grace and a weather/bend teach never spends the cap's;
 *      – the cap ledger's one mark: an ABSORBED bill is dropped; a RE-GRADE reaches only a code not yet charged;
 *      – ADR-009 (founder Ruling A), for a lesson's own mistake: its FIRST occurrence is taught even when its topic was
 *        already spent (and is let through even when absorbed, unless a row of its code is already there), its
 *        re-grades are never charged, a repeat is graded like any other;
 *      – the ending: each ledger's withheld re-grade (the sign's, the cap's, the weather's and the bend's) is charged
 *        or dropped, never a row; a sign-bound arrival still waiting is a first bill (taught or charged).
 *  · `cardText` — the sentence a card or toast of the speed codes opens with, restated from the copy the cards carry.
 *    THEO-4: every number in it is true of the frame it names, and every comparison it states holds between the
 *    numbers AS PRINTED (round 14, R1-THEO4-ROUNDED-ENVELOPE) — restated here with its own formatting, so a builder
 *    that rounds where this file does not is a difference.
 */
import { makeViolation, type RuleEngineConfig, type SimTick, type ViolationCode } from "../../rules";
import type { Bill, Expected } from "../../rules/__tests__/taskCapReference";
import { scenarioForCode } from "../../scenarios";

export const TASK = "TASK_SPEED_CAP_EXCEEDED";
export const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
export const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
export const KIN: ReadonlySet<string> = new Set([TASK, COND, CURVE]);

export const fmt = (code: string, t: number) => `${code}@${t.toFixed(2)}`;

/** The free teach's topic: the cap's own (ruling 2026-10-03); every other code's mini-lesson, or the code itself. */
export const topicOfCode = (code: string): string => (code === TASK ? "the-cap-alone" : (scenarioForCode(code as ViolationCode) ?? code));

/** A key of the reference's ending back into its bill (`billKey`'s own format). */
export function parseKey(k: string): Bill {
  const m = /^([A-Z_]+):([a-z]+)(?::blow=[\d./]+)?@([\d.]+)$/.exec(k);
  if (m === null) throw new Error(`unparsable ending ${k}`);
  return { code: m[1], kind: m[2] as Bill["kind"], t: Number(m[3]) };
}

/** One bill the student SEES: a teach card, or a graded bill (a toast, and a card on a «Пълна помощ» rung). */
export interface Shown {
  /** Frame index of the programme. */
  i: number;
  how: "teach" | "grade";
  bill: Bill;
}
export interface Student {
  score: number;
  mistakes: string[];
  coached: string[];
  /** Tick-time bills that put a card or a toast on the glass (the ending's settlement shows nothing: the drive is over). */
  shown: Shown[];
}
export interface StudentOpts {
  /** The lesson's own mistakes (ADR-009 `lessonMistakeTargets`), on a practice rung. */
  targets?: ReadonlySet<string>;
  /** Speak only for these codes (a committed lesson bills codes of other topics the reference does not derive). */
  only?: ReadonlySet<string>;
}

export function studentOf(exp: Expected, last: number, opts: StudentOpts = {}): Student {
  const targets = opts.targets ?? new Set<string>();
  const speaks = (code: string) => opts.only === undefined || opts.only.has(code);
  const topicSeen = new Set<string>();
  const ownSeen = new Set<string>();
  const charged = new Set<string>();
  const rowCodes = new Set<string>();
  const coached: string[] = [];
  const mistakes: string[] = [];
  const shown: Shown[] = [];
  let score = 0;
  /** The coach: teach on the topic's first encounter (a lesson's own mistake: on ITS first), grade after; опасна always. */
  const decide = (code: string, asTarget: boolean): "teach" | "grade" => {
    const topic = topicOfCode(code);
    const first = asTarget ? !ownSeen.has(code) : !topicSeen.has(topic);
    topicSeen.add(topic);
    if (asTarget) ownSeen.add(code);
    return makeViolation(code as ViolationCode, 0).severityClass === "opasna" || !first ? "grade" : "teach";
  };
  const charge = (b: Bill) => {
    const pts = makeViolation(b.code as ViolationCode, b.t).points;
    mistakes.push(`${fmt(b.code, b.t)}|${pts}`);
    charged.add(b.code);
    score += pts;
  };
  const row = (b: Bill) => {
    coached.push(fmt(b.code, b.t));
    rowCodes.add(b.code);
  };
  for (let i = 0; i <= last; i++) {
    for (const b of exp.bills[i]) {
      if (b.kind === "praise" || !speaks(b.code)) continue;
      const target = targets.has(b.code);
      // ABSORBED: dropped — but a lesson's own mistake is let through on its first occurrence (ADR-009).
      if (b.kind === "absorbed" && !(target && !charged.has(b.code) && !rowCodes.has(b.code))) continue;
      if (b.kind === "regrade" && (charged.has(b.code) || target)) continue;
      if (decide(b.code, target) === "grade") {
        charge(b);
        shown.push({ i, how: "grade", bill: b });
      } else {
        row(b);
        shown.push({ i, how: "teach", bill: b });
      }
    }
  }
  const e = exp.endings[last];
  for (const k of [e.speeding, e.task, ...e.adaptation]) {
    if (k === null) continue;
    const b = parseKey(k);
    if (!speaks(b.code)) continue;
    if (charged.has(b.code) || targets.has(b.code)) continue;
    if (decide(b.code, false) === "grade") charge(b);
  }
  if (e.pending !== null) {
    const b = parseKey(e.pending);
    if (speaks(b.code)) {
      if (decide(b.code, targets.has(b.code)) === "grade") charge(b);
      else row(b);
    }
  }
  return { score, mistakes, coached, shown };
}

// ---------------------------------------------------------------------------
// THE CARD — the sentence the speed cards open with
// ---------------------------------------------------------------------------

/** „78,4" — the measured speed: one decimal, a decimal comma (the cluster's own way). */
export const kmh = (v: number): string => {
  const tenths = Math.round(v * 10);
  return `${Math.trunc(tenths / 10)}${tenths % 10 !== 0 ? `,${Math.abs(tenths % 10)}` : ""}`;
};
/** A THRESHOLD as it is — to the hundredth, every decimal it has, a decimal comma («42,5», «38,25», «119»). */
export const exact = (v: number): string => {
  const h = Math.round(v * 100);
  const whole = Math.trunc(h / 100);
  const frac = Math.abs(h % 100);
  return frac === 0 ? `${whole}` : `${whole},${frac % 10 === 0 ? frac / 10 : String(frac).padStart(2, "0")}`;
};
const CAUSE_BG = { snow: "снегът", fog: "мъглата", rain: "дъждът", night: "тъмното" } as const;

/** What the weather leaves of the sign on this frame, and which condition governs (the strictest factor). */
function envelopeOf(x: SimTick, C: RuleEngineConfig): { limit: number; cause: keyof typeof CAUSE_BG } | null {
  const arms: Array<[keyof typeof CAUSE_BG, number]> = [];
  if (x.snow === true) arms.push(["snow", C.conditionSpeedSnowFactor]);
  if (x.fog === true) arms.push(["fog", C.conditionSpeedFogFactor]);
  if (x.rain === true) arms.push(["rain", C.conditionSpeedRainFactor]);
  if (x.isNight === true) arms.push(["night", C.conditionSpeedNightFactor]);
  let g: [keyof typeof CAUSE_BG, number] | null = null;
  for (const a of arms) if (g === null || a[1] < g[1]) g = a;
  return g === null || !(g[1] < 1) ? null : { limit: x.maxSpeedKmh * g[1], cause: g[0] };
}

/**
 * The measured opening of the card for one bill of the cap, the weather or the bend, shown on frame `x` (the tick the
 * rule engine graded: it carries the stamp and, on a blow frame, the arrival) — or "" where the card carries the
 * catalogue's explanation alone. `blow` is the blow a sign-bound arrival's bill quotes.
 *
 * The figure after «при таван на задачата» is always the GLASS figure (`shownKmh`). The weather's card carries the
 * catalogue's explanation alone, as with no cap (round 14). The cap's card names what the weather leaves of the sign
 * only where the speed AS PRINTED is over that number AS PRINTED (round 14, R1).
 */
export function cardOpening(b: Bill, x: SimTick, C: RuleEngineConfig): string {
  const measured = x.speedKmh;
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  if (b.code === CURVE) {
    const adv = x.curveAdvisoryKmh;
    if (adv === undefined || !ok(adv) || !ok(measured)) return "";
    return `Отчетена скорост ${kmh(measured)} км/ч при препоръчителни ${exact(adv)} км/ч от табелата. `;
  }
  if (b.code === TASK) {
    // A sign-bound arrival: the speed the mark was passed at, the figure the student read, and the sign ON THE BLOW FRAME.
    if (b.blow !== undefined && b.kind !== "regrade" && ok(b.blow.arrivalKmh)) {
      return `Мина точката на задачата с ${kmh(b.blow.arrivalKmh)} км/ч при таван на задачата ${exact(b.blow.shownKmh)} км/ч — и над ограничението от знака ${exact(b.blow.postedKmh)} км/ч. `;
    }
    const env = envelopeOf(x, C);
    const alsoOver = (v: number) =>
      env !== null && v > env.limit && Number(kmh(v).replace(",", ".")) > Number(exact(env.limit).replace(",", "."))
        ? ` — и над ${exact(env.limit)} км/ч, които ${CAUSE_BG[env.cause]} оставя от знака ${exact(x.maxSpeedKmh)}`
        : "";
    // A graded arrival, billed on its blow frame.
    const arrival = x.taskCapArrival;
    if (arrival !== undefined && b.kind !== "regrade") {
      const v = Math.abs(arrival.arrivalKmh);
      if (ok(v)) return `Мина точката на задачата с ${kmh(v)} км/ч при таван на задачата ${exact(arrival.shownKmh)} км/ч${alsoOver(v)}. `;
    }
    // The stretch.
    const cap = x.taskSpeedCap;
    if (cap === undefined || !ok(measured)) return "";
    return `Отчетена скорост ${kmh(measured)} км/ч при таван на задачата ${exact(cap.shownKmh)} км/ч${alsoOver(measured)}. `;
  }
  return "";
}

/** The whole text a card or toast of one of the three codes carries: its measured opening and the catalogue's explanation. */
export function cardText(b: Bill, x: SimTick, C: RuleEngineConfig): string {
  return cardOpening(b, x, C) + makeViolation(b.code as ViolationCode, b.t).explanationBg;
}
