/**
 * THE TASK CEILING, ROUND 13 — THE LESSON CENSUS: every committed capped objective of every practice rung, driven
 * through the REAL lesson session, and what the student is SHOWN and CHARGED compared with an expectation stated from
 * the rulings (the integrator's ruling for round 13, C1: «Add LESSON-LEVEL pins: the census (or a lesson census over
 * every committed capped objective and rung) must compare what the student is shown and charged through the real
 * lesson session»).
 *
 * WHY (the round-12 verifier's R1-V16 and R2-V33). Rounds 11–12 answered the class at REDUCER level with generated
 * programmes that all carried the glass figure equal to the compiled gate, while 308 of the 521 committed capped
 * objectives show a figure under their gate (136 of the 192 sign-bound ones) — so a mutant that quoted the gate where
 * the card quotes the glass (V16: `sc-speed-creep` L2 read «при таван на задачата 55 км/ч» under a strip showing ≤50),
 * or stamped a latch on the gate instead of the glass (V33: the breach row gone on three L1 objectives, a sustained
 * charge lost), survived all 52 files. The committed content IS the domain; this census drives all of it.
 *
 * WHAT IS DRIVEN. Each of the 521 rows (`committedCappedRows`) along its template's committed shadow route, the speed
 * forced near its one mark under four plans (`taskCapGlassDrive.ts PLANS`):
 *   line  — exactly ON the blow line (gate + slack): never blown;
 *   late  — blown 0.2 over the line, then the route's own driving;
 *   hold  — blown, then 14 s held over both the task's line and the sign;
 *   grace — blown, then 12 s in the sign's grace band (over the sign, no speeding bill, never a correction).
 *
 * WHAT IS COMPARED, per drive — four links, each against something the code under test does not compute:
 *  A · THE STAMP (the latch of the lesson, `lessons/engine.ts stepTaskCapLatch`) against THE GLASS (the strip's figure,
 *      read off the shell's snapshot): the arrival and every stamp carry the pair (compiled gate, glass figure) and the
 *      objective's slack; the arrival quotes the speed of the frame before the latch; a stamp rides only frames whose
 *      sign is above the GLASS figure (ruling 2 reads what the student was shown) and, on the blow frame, the breach
 *      row is written exactly when the glass figure is under the sign; while the mark's objective is active the cap is
 *      stamped exactly while the strip still shows it under the sign («the glass stops when the grading stops»).
 *  B · THE RULE EVENTS: the reference ledger (`rules/__tests__/taskCapReference.ts`, the two-sided oracle of the
 *      generated census) run over the very ticks the lesson handed the reducer, under the lesson's own rule config,
 *      against the events the reducer answered — every bill of the task, the weather, the bend, the sign and the fog
 *      lamps, frame by frame. The generated census's domain widened to the frames committed lessons actually produce.
 *  C · WHAT THE STUDENT IS CHARGED: the coached rows and the charged mistakes of the three чл. 20, ал. 2 codes that
 *      the rules derive from the reference's stream (`lessons/__tests__/taskCapStudent.ts studentOf` — the per-topic
 *      grace, the kin ledger's marks, ADR-009's own-mistake rule, the ending's settlement) against the finished
 *      session's.
 *  D · WHAT THE STUDENT IS SHOWN: for every such bill the model says is on the glass, a card or toast on that frame
 *      whose WHOLE text is the restated sentence (`cardText`) — the speed, the GLASS figure, the sign of the blow.
 *
 * THE VERIFIER'S WITNESSES come first, by name, each on its own row: V16's card on `sc-speed-creep` L2 (and L3, L5,
 * and `sc-sp-curve` L1), V33's three L1 objectives whose compiled gate equals the sign while the glass figure is under
 * it, and UX14's line (a mark passed EXACTLY at gate + slack is not blown). Each was run RED on round 12's tree with the
 * mutant it names (`scratchpad/cap/r13/red-on-r12-*.txt`).
 *
 * RUNTIME (one worker, this machine): about 75 s per plan, 5 minutes in all.
 *
 * ROUND 15 — founder ruling 2026-10-03 «LIKE A SPEED SIGN», and «the arrival is decided at the mark». The BILL LINE is
 * the glass figure plus the tolerance a posted limit gets (`lineOf`), on every rung — no longer the gate plus its slack —
 * and every plan reads it (`taskCapGlassDrive.ts PlanCtx.line`). The arrival is the CROSSING of the mark, its speed
 * interpolated between the two frames that straddle it (so it lies between their two speeds), or — for an objective
 * the evaluator credits short of its mark — the frame the car then crosses it (`taskCapMarkWatch`), the same
 * interpolation. «The glass stops when the grading stops» is read while the capped
 * objective is still the active one.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const tap = vi.hoisted(() => ({ armed: false, strip: false, calls: [] as Array<{ tick: unknown; events: unknown[]; raw?: unknown }> }));
vi.mock("@/modules/sim/rules/engine", async (importOriginal) => {
  // INSTRUMENTATION ONLY: the real reducer runs and its result is returned untouched; while a census drive has the
  // tap armed, the tick it was handed and the events it answered are kept. Round 14: with `strip` set (link F's
  // second drive), the tick reaches the reducer WITHOUT the cap fields — the same lesson with the cap removed.
  const m = (await importOriginal()) as Record<string, unknown> & { reduceTick: (s: unknown, t: unknown) => { state: unknown; events: unknown[] } };
  return {
    ...m,
    reduceTick: (s: unknown, t: unknown) => {
      let handed = t;
      if (tap.armed && tap.strip) {
        const { taskSpeedCap: _c, taskCapArrival: _a, ...rest } = t as Record<string, unknown>;
        handed = rest;
      }
      const r = m.reduceTick(s, handed);
      // Round 15: `raw` is the tick as the LESSON handed it (before any strip), so a drive can read its own stamps
      // identically whether or not the reducer is shown them.
      if (tap.armed) tap.calls.push({ tick: handed, events: r.events, raw: t });
      return r;
    },
  };
});

import { buildLessonResult } from "@/modules/sim/lessons";
import { makeViolation, type SimTick, type ViolationCode, type ViolationEvent } from "@/modules/sim/rules";
import { committedPairs } from "@/modules/sim/rules/__tests__/taskCapCommittedPairs";
import { project } from "@/modules/sim/rules/__tests__/taskCapExact";
import { billKey, expectedOutcome } from "@/modules/sim/rules/__tests__/taskCapReference";
import { KIN, cardText, studentOf } from "@/modules/sim/lessons/__tests__/taskCapStudent";
import { falsePrintedClaims, printedNumbersOf } from "@/modules/sim/lessons/__tests__/taskCapPrinted";
import { PLANS, SLACK, TASK, committedCappedRows, glassDrive, type CappedRow, type GlassDrive, type SpeedPlan, type Tap } from "./taskCapGlassDrive";

/** The codes the reference ledger derives (the three чл. 20, ал. 2 codes, the sign's two, the fog lamp duty). */
const REFERENCE_CODES = new Set([...KIN, "SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS", "FOG_LIGHTS_OFF_IN_FOG"]);
const TITLE = new Map([...KIN].map((c) => [c, makeViolation(c as ViolationCode, 0).titleBg]));

const ROWS = committedCappedRows();
/** The bill line of a glass figure, by the ruling: the figure plus min(figure × ratio, max) off the given rule config. */
const lineOf = (glass: number, cfg: { speedingGraceRatio: number; speedingGraceMaxKmh: number }) =>
  glass + Math.min(glass * cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh);
const tag = (r: CappedRow, plan: string) => `${r.id}@L${r.lv} ${r.objectiveId} ${plan}`;

interface Tally {
  drives: number;
  noRecorder: number;
  frames: number;
  blown: number;
  signBound: number;
  graded: number;
  /** Graded with the compiled gate at or above the sign (the glass figure alone is under it — V33's class). */
  gradedGateAtOrAboveSign: number;
  glassUnderGate: number;
  signBoundGlassUnderGate: number;
  stampedFrames: number;
  breachRows: number;
  reversingFrames: number;
  nightFrames: number;
  snowFrames: number;
  fogFrames: number;
  rainFrames: number;
  bendFrames: number;
  referenceBills: number;
  taskShown: number;
  taskAbsorbed: number;
  taskRegrades: number;
  kinRows: number;
  kinCharges: number;
  kinPoints: number;
  cardsChecked: number;
  signBoundCards: number;
  ownMistakeDrives: number;
  glassWithoutStamp: number;
  glassWithoutStampFirst: string;
  /** Round 14 — link F (the drive with the cap against the same drive with it removed) and link E (THEO-4 as printed). */
  f1Drives: number;
  capRaisedScore: number;
  capPoints: number;
  capAndKinDrives: number;
  displaysChecked: number;
  decimalThresholdDisplays: number;
  /** Round 14 (R1 as a class): the objective's own speed toasts («не повече от N км/ч, а стигна дотук с M») read back. */
  objectiveSpeedToasts: number;
  envelopeClauses: number;
  /** Round 15: marks crossed after their objective was credited short of them (`taskCapMarkWatch`), and while it was active. */
  creditedArrivals: number;
  crossingArrivals: number;
}
const tally = (): Tally => ({ drives: 0, noRecorder: 0, frames: 0, blown: 0, signBound: 0, graded: 0, gradedGateAtOrAboveSign: 0, glassUnderGate: 0, signBoundGlassUnderGate: 0, stampedFrames: 0, breachRows: 0, reversingFrames: 0, nightFrames: 0, snowFrames: 0, fogFrames: 0, rainFrames: 0, bendFrames: 0, referenceBills: 0, taskShown: 0, taskAbsorbed: 0, taskRegrades: 0, kinRows: 0, kinCharges: 0, kinPoints: 0, cardsChecked: 0, signBoundCards: 0, ownMistakeDrives: 0, glassWithoutStamp: 0, glassWithoutStampFirst: "", f1Drives: 0, capRaisedScore: 0, capPoints: 0, capAndKinDrives: 0, displaysChecked: 0, decimalThresholdDisplays: 0, objectiveSpeedToasts: 0, envelopeClauses: 0, creditedArrivals: 0, crossingArrivals: 0 });

/** Every difference of one drive, each named by its link (A stamp / B events / C charged / D shown). */
function examine(d: GlassDrive, plan: string, T: Tally): string[] {
  const out: string[] = [];
  const where = tag(d.row, plan);
  const fail = (link: string, msg: string) => out.push(`${where} · ${link} · ${msg}`);
  T.drives++;
  if (d.err !== null) {
    T.noRecorder++;
    return out;
  }
  const frames = d.tap.map((c) => c.tick as SimTick);
  T.frames += frames.length;
  const G = d.glassBeforeBlow;
  const gate = d.row.gate;

  // ── A · THE STAMP against THE GLASS ─────────────────────────────────────────────────────────────────────────────
  const cfg = d.ended.rules.config;
  if (plan === "line") {
    // EXACTLY on the bill line: billed only strictly above the glass figure plus the sign's tolerance, so nothing is latched.
    if (d.blow !== null || d.latches.length > 0) fail("A", `a mark passed exactly on the bill line (${G === undefined ? "?" : lineOf(G, cfg)}) was latched as blown`);
    if (d.breaches.some((b) => b.startsWith(`${d.row.objectiveId}@`))) fail("A", "a breach row for a mark that was not blown");
  }
  let latch: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const x = frames[i];
    if (x.gear < 0 || x.speedKmh < 0) T.reversingFrames++;
    if (x.isNight === true) T.nightFrames++;
    if (x.snow === true) T.snowFrames++;
    if (x.fog === true) T.fogFrames++;
    if (x.rain === true) T.rainFrames++;
    if (x.curveAdvisoryKmh !== undefined) T.bendFrames++;
    const a = x.taskCapArrival;
    const c = x.taskSpeedCap;
    // Round 15: only this row's own stamps (its objective active at the frame's start, or its mark still watched):
    // a car held over the line through the NEXT capped mark now blows that one too, and its census row checks it.
    if (a !== undefined && d.owned[i] === true) {
      latch = a.blownAtSec;
      const before = i > 0 && frames[i - 1].t < x.t ? Math.abs(frames[i - 1].speedKmh) : Math.abs(x.speedKmh);
      // A mark crossed after its objective was credited short of it (round 15, `taskCapMarkWatch`): the strip has already
      // moved on to the next objective, so the figure it quotes is the last one the strip printed for this objective.
      const glassThen = i > 0 && d.active[i - 1] === false ? d.glassBeforeBlow : i > 0 ? (d.glass[i - 1] ?? d.glass[i]) : d.glass[i];
      if (a.capKmh !== gate) fail("A", `the arrival's gate ${a.capKmh} is not the compiled gate ${gate}`);
      if (a.shownKmh !== glassThen) fail("A", `the arrival's figure ${a.shownKmh} is not the figure on the glass (${glassThen}) at t=${x.t}`);
      if (a.graceKmh !== SLACK) fail("A", `the arrival's slack ${a.graceKmh}`);
      if (a.blownAtSec !== x.t) fail("A", `the arrival names latch ${a.blownAtSec} on frame ${x.t}`);
      if (i > 0 && d.active[i - 1] === false) T.creditedArrivals++;
      else T.crossingArrivals++;
      {
        // The crossing, interpolated between the two frames that straddle the mark: between their two speeds.
        const now = Math.abs(x.speedKmh);
        if (!(a.arrivalKmh >= Math.min(before, now) - 1e-9 && a.arrivalKmh <= Math.max(before, now) + 1e-9)) {
          fail("A", `the crossing arrival quotes ${a.arrivalKmh}, outside the two straddling frames' ${before} … ${now}`);
        }
      }
    }
    if (c !== undefined && d.owned[i] === true) {
      T.stampedFrames++;
      // The strip AFTER a frame on which the objective completed shows the next one; the stamp rode the frame before that.
      const glassNow = d.active[i] === true ? d.glass[i] : d.glass[i - 1];
      if (c.capKmh !== gate) fail("A", `a stamp's gate ${c.capKmh} is not the compiled gate ${gate} at t=${x.t}`);
      if (c.shownKmh !== glassNow) fail("A", `a stamp's figure ${c.shownKmh} is not the figure on the glass (${glassNow}) at t=${x.t}`);
      if (c.graceKmh !== SLACK) fail("A", `a stamp's slack ${c.graceKmh}`);
      if (c.blownAtSec !== latch) fail("A", `a stamp names latch ${c.blownAtSec}, the latch is ${latch}, at t=${x.t}`);
      // RULING 2 reads the figure the student was shown: stamped only where the GLASS figure is under the sign.
      if (!(c.shownKmh < x.maxSpeedKmh)) fail("A", `a stamp (glass ${c.shownKmh}) on a frame whose sign is ${x.maxSpeedKmh} at t=${x.t}`);
    } else if (latch !== null && a === undefined && d.active[i] === true && d.glass[i] !== undefined && (d.glass[i] as number) < x.maxSpeedKmh) {
      // «THE GLASS STOPS WHEN THE GRADING STOPS», read the other way: after the blow, a frame on which the strip still
      // shows the cap under the sign is a frame the cap is graded on.
      T.glassWithoutStamp++;
      if (T.glassWithoutStampFirst === "") T.glassWithoutStampFirst = `${where} t=${x.t}`;
    }
  }
  if (d.blow !== null) {
    T.blown++;
    if (G === undefined) fail("A", "a mark was blown and the strip never showed its cap");
    else {
      const graded = G < d.blow.sign;
      if (graded) {
        T.graded++;
        if (gate >= d.blow.sign) T.gradedGateAtOrAboveSign++;
      } else {
        T.signBound++;
        if (G < gate) T.signBoundGlassUnderGate++;
      }
      if (G < gate) T.glassUnderGate++;
      // THE BREACH ROW: written on the blow frame exactly when the glass figure is under the sign there.
      const rowAtBlow = d.breaches.includes(`${d.row.objectiveId}@${d.blow.t.toFixed(2)}`);
      if (rowAtBlow) T.breachRows++;
      if (rowAtBlow !== graded) fail("A", `glass ${G}, sign ${d.blow.sign} at the blow: the breach row is ${rowAtBlow ? "written" : "missing"}`);
      // The blow frame hands the reducer the arrival, and its speed is over the line the mark was blown at.
      const bi = frames.findIndex((x) => x.t === d.blow!.t);
      const arrival = bi >= 0 ? frames[bi].taskCapArrival : undefined;
      if (arrival === undefined) fail("A", "the blow frame carries no arrival");
      else if (!(arrival.arrivalKmh > lineOf(G, cfg))) fail("A", `a mark latched as blown at ${arrival.arrivalKmh}, not over the bill line ${lineOf(G, cfg)}`);
    }
  }

  // ── B · THE RULE EVENTS: the reference ledger on the real frames ────────────────────────────────────────────────
  const exp = expectedOutcome(frames, undefined, d.ended.rules.config);
  for (let i = 0; i < frames.length; i++) {
    const e = exp.bills[i].filter((b) => REFERENCE_CODES.has(b.code)).map(billKey).join(" ");
    const a = (d.tap[i].events as Array<{ kind: string; code: string }>)
      .filter((x) => x.kind === "violation" && REFERENCE_CODES.has(x.code))
      .map((x) => billKey(project(x as unknown as ViolationEvent)))
      .join(" ");
    if (e !== a) {
      fail("B", `t=${frames[i].t}: expected «${e}» got «${a}»`);
      break;
    }
    for (const b of exp.bills[i]) {
      if (!REFERENCE_CODES.has(b.code)) continue;
      T.referenceBills++;
      if (b.code !== TASK) continue;
      if (b.kind === "shown") T.taskShown++;
      else if (b.kind === "absorbed") T.taskAbsorbed++;
      else if (b.kind === "regrade") T.taskRegrades++;
    }
  }

  // ── C · WHAT THE STUDENT IS CHARGED: the чл. 20, ал. 2 rows and mistakes ─────────────────────────────────────────
  if (frames.length === 0) return out;
  const targets = new Set((d.ended.lesson.lessonMistakeTargets ?? []).map((x) => (typeof x === "string" ? x : (x as { code: string }).code)));
  if ([...targets].some((c) => KIN.has(c))) T.ownMistakeDrives++;
  const want = studentOf(exp, frames.length - 1, { targets, only: KIN });
  const gotRows = (d.ended.coachedMistakes ?? []).filter((c) => KIN.has(c.code)).map((c) => `${c.code}@${c.t.toFixed(2)}`);
  const gotCharges = d.ended.events
    .filter((e) => e.kind === "violation" && KIN.has(e.code))
    .map((e) => `${e.code}@${e.t.toFixed(2)}|${(e as unknown as { points: number }).points}`);
  if (JSON.stringify(want.coached) !== JSON.stringify(gotRows)) fail("C", `coached rows: expected ${JSON.stringify(want.coached)} got ${JSON.stringify(gotRows)}`);
  if (JSON.stringify(want.mistakes) !== JSON.stringify(gotCharges)) fail("C", `charged: expected ${JSON.stringify(want.mistakes)} got ${JSON.stringify(gotCharges)}`);
  T.kinRows += gotRows.length;
  T.kinCharges += gotCharges.length;
  T.kinPoints += want.score;

  // ── D · WHAT THE STUDENT IS SHOWN: the card's whole text ─────────────────────────────────────────────────────────
  for (const s of want.shown) {
    const x = frames[s.i];
    const text = cardText(s.bill, x, d.ended.rules.config);
    const title = TITLE.get(s.bill.code);
    const t2 = Math.round(x.t * 100) / 100;
    const displays = [
      ...d.cards.filter((c) => c.code === s.bill.code && c.t === Math.round(s.bill.t * 100) / 100).map((c) => c.text),
      ...d.toasts.filter((c) => c.titleBg === title && c.t === t2).map((c) => c.text),
    ];
    T.cardsChecked++;
    if (s.bill.blow !== undefined) {
      T.signBoundCards++;
      // The blow the card quotes is the one the GLASS and the tapped blow frame state: the figure on the strip, the sign there.
      if (d.blow !== null && G !== undefined && (s.bill.blow.shownKmh !== G || s.bill.blow.postedKmh !== d.blow.sign || s.bill.blow.arrivalKmh !== d.blow.arrivalKmh)) {
        fail("D", `the sign-bound bill quotes ${JSON.stringify(s.bill.blow)}; the glass read ${G}, the sign at the blow ${d.blow.sign}, the mark was passed at ${d.blow.arrivalKmh}`);
      }
    }
    if (displays.length === 0) fail("D", `no card or toast for ${s.bill.code} (${s.how}) at t=${x.t}`);
    for (const got of displays) if (got !== text) fail("D", `${s.bill.code} (${s.how}) at t=${x.t}: expected «${text.slice(0, 160)}» got «${got.slice(0, 160)}»`);
    if (s.bill.code === TASK && text.includes("оставя от знака")) T.envelopeClauses++;
  }

  // ── E · THEO-4 AS PRINTED: every comparison every card and toast of the drive states holds between its printed numbers ──
  for (const text of [...d.cards.map((c) => c.text), ...d.toasts.map((c) => c.text)]) {
    T.displaysChecked++;
    const bad = falsePrintedClaims(text);
    if (bad.length > 0) fail("E", `«${text.slice(0, 160)}» — ${bad.join("; ")}`);
    if (printedNumbersOf(text).slice(1).some((n) => !Number.isInteger(n))) T.decimalThresholdDisplays++;
    if (text.startsWith("Задачата иска") && text.includes(" км/ч")) T.objectiveSpeedToasts++;
  }
  return out;
}

/**
 * F · CAP ADDS, NEVER REMOVES (founder ruling 2026-10-03) — the drive with the cap against the SAME drive with the cap
 * fields removed at the reducer's door (`tap.strip`): every bill that is not the cap's is the same (charged mistakes,
 * coached rows, cards and toasts — their text and their frame), the score is the no-cap score plus the cap's own points,
 * and the verdict (the lesson's and the official one) is never better with the cap.
 */
function capAdds(d: GlassDrive, d0: GlassDrive, plan: string, T: Tally): string[] {
  if (d.err !== null || d0.err !== null) return [];
  const out: string[] = [];
  const where = tag(d.row, plan);
  const fail = (msg: string) => out.push(`${where} · F · ${msg}`);
  T.f1Drives++;
  const notTask = (r: string) => !r.startsWith(TASK);
  const title = TITLE.get(TASK);
  const same = (what: string, a: readonly string[], b: readonly string[]) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: with the cap ${JSON.stringify(a).slice(0, 300)} / no cap ${JSON.stringify(b).slice(0, 300)}`);
  };
  same("charged mistakes other than the cap's", d.mistakes.filter(notTask), d0.mistakes);
  same("coached rows other than the cap's", d.coached.filter(notTask), d0.coached);
  same("cards other than the cap's", d.cards.filter((c) => c.code !== TASK).map((c) => `${c.code}@${c.t}|${c.charged}|${c.text}`), d0.cards.map((c) => `${c.code}@${c.t}|${c.charged}|${c.text}`));
  same("toasts other than the cap's", d.toasts.filter((c) => c.titleBg !== title).map((c) => `${c.titleBg}@${c.t}|${c.text}`), d0.toasts.map((c) => `${c.titleBg}@${c.t}|${c.text}`));
  if ([...d0.mistakes, ...d0.coached].some((r) => r.startsWith(TASK))) fail("a cap bill with the cap removed");
  const capPts = d.mistakes.filter((m) => m.startsWith(TASK)).reduce((a, m) => a + Number(m.slice(m.indexOf("|") + 1)), 0);
  if (d.score !== d0.score + capPts) fail(`score ${d.score} with the cap ≠ ${d0.score} without + ${capPts} the cap's`);
  const res = buildLessonResult(d.ended);
  const res0 = buildLessonResult(d0.ended);
  if (res.passed && !res0.passed) fail("the lesson verdict is BETTER with the cap");
  if (res.summary.passed && !res0.summary.passed) fail("the official verdict is BETTER with the cap");
  T.capPoints += capPts;
  if (d.score > d0.score) T.capRaisedScore++;
  const rows = [...d.coached, ...d.mistakes];
  if (rows.some((r) => r.startsWith(TASK)) && rows.some((r) => r.startsWith("SPEED_TOO_FAST_FOR_CONDITIONS") || r.startsWith("SPEED_TOO_FAST_FOR_CURVE"))) T.capAndKinDrives++;
  return out;
}

function runPlan(plan: keyof typeof PLANS): { problems: string[]; T: Tally } {
  const T = tally();
  const problems: string[] = [];
  for (const row of ROWS) {
    tap.calls.length = 0;
    const d = glassDrive(row, PLANS[plan], tap as unknown as Tap);
    problems.push(...examine(d, plan, T));
    // F: the same drive, the reducer seeing no cap.
    tap.calls.length = 0;
    tap.strip = true;
    const d0 = glassDrive(row, PLANS[plan], tap as unknown as Tap);
    tap.strip = false;
    problems.push(...capAdds(d, d0, plan, T));
  }
  tap.calls.length = 0;
  // The tally and every difference, written where a census run asks for them (evidence for a report; never read back).
  if (process.env.TASK_CAP_LESSON_CENSUS_OUT) appendFileSync(process.env.TASK_CAP_LESSON_CENSUS_OUT, JSON.stringify({ plan, T, problems }) + "\n");
  return { problems, T };
}
/** Readable in a failure diff: how many drives differ, by link, and the first few. */
const said = (p: string[]) => ({ count: p.length, byLink: ["A", "B", "C", "D", "E", "F"].map((l) => `${l}:${p.filter((x) => x.includes(` · ${l} · `)).length}`).join(" "), first: p.slice(0, 6) });
const CLEAN = { count: 0, byLink: "A:0 B:0 C:0 D:0 E:0 F:0", first: [] };

const row = (id: string, lv: number, objectiveId: string): CappedRow => {
  const r = ROWS.find((x) => x.id === id && x.lv === lv && x.objectiveId === objectiveId);
  if (r === undefined) throw new Error(`no capped row ${id}@L${lv} ${objectiveId}`);
  return r;
};
const driveRow = (r: CappedRow, plan: SpeedPlan): GlassDrive => {
  tap.calls.length = 0;
  const d = glassDrive(r, plan, tap as unknown as Tap);
  tap.calls.length = 0;
  return d;
};
const explain = (code: string) => makeViolation(code as ViolationCode, 0).explanationBg;
/** The verifier's own profiles (`verify8/arrival8v`): OVER — 0.2 over the blow line from 30 m out; HOLD — 20 over the gate for 40 s from 30 m out. */
const V_OVER: SpeedPlan = (c) => (c.active && c.win && c.blow === null ? c.gate + SLACK + 0.2 : undefined);
const vHold = (): SpeedPlan => {
  let from: number | null = null;
  return (c) => {
    if (!c.active) return undefined;
    if (from === null && c.win) from = c.tick.t;
    return from !== null && c.tick.t - from <= 40 ? Math.max(c.tick.speedKmh, c.gate + 20) : undefined;
  };
};

describe("THE ROUND-12 VERIFIER'S WITNESSES, by name — through the real lesson session", () => {
  for (const [id, lv, obj, gate, glass, sign, kmhText] of [
    // Round 15: the late blow is 0,2 over the GLASS figure's line (50 + 5 = 55, 90 + 5 = 95), not the gate + slack.
    ["sc-speed-creep", 2, "sc-crp-approach", 54.5, 50, 50, "55,2"],
    ["sc-speed-creep", 3, "sc-crp-approach", 52, 50, 50, "55,2"],
    ["sc-speed-creep", 5, "sc-crp-approach", 52, 50, 50, "55,2"],
    ["sc-sp-curve", 1, "sc-spcv-approach", 92, 90, 90, "95,2"],
  ] as const) {
    it(`RED-ON-V16 · ${id} L${lv} ${obj} — the strip shows ≤${glass} over a compiled gate of ${gate} on a posted ${sign}; blown late at ${kmhText}, the card reads «при таван на задачата ${glass} км/ч» — the figure on the GLASS (under V16: ${Math.round(gate)})`, () => {
      const d = driveRow(row(id, lv, obj), PLANS.late);
      expect([d.row.gate, d.glassBeforeBlow, d.blow?.sign]).toEqual([gate, glass, sign]);
      const card = d.cards.find((c) => c.code === TASK);
      expect(card?.text).toBe(`Мина точката на задачата с ${kmhText} км/ч при таван на задачата ${glass} км/ч — и над ограничението от знака ${sign} км/ч. ${explain(TASK)}`);
      expect(examine(d, "late", tally())).toEqual([]);
    });
  }
  for (const [id, obj, gate, glass] of [
    ["sc-signal-response", "sc-sig-approach", 50, 45],
    ["sc-crossing-slow-crosser", "sc-scr-approach", 40, 35],
    ["sc-pe-jaywalker", "sc-jay-approach", 50, 45],
  ] as const) {
    it(`RED-ON-V33 · ${id} L1 ${obj} — the compiled gate (${gate}) EQUALS the sign and the strip shows ≤${glass}: the cap binds under the sign by the figure the student was shown, so the blow is graded — its breach row is written and the latch stamps the stretch (under V33: no row, no stamp)`, () => {
      const d = driveRow(row(id, 1, obj), V_OVER);
      expect([d.row.gate, d.glassBeforeBlow, d.blow?.sign]).toEqual([gate, glass, gate]);
      expect(d.breaches).toContain(`${obj}@${d.blow!.t.toFixed(2)}`);
      const stamped = d.tap.filter((c) => (c.tick as SimTick).taskSpeedCap !== undefined);
      expect(stamped.length).toBeGreaterThan(50);
      expect((stamped[0].tick as SimTick).taskSpeedCap).toEqual({ capKmh: gate, shownKmh: glass, graceKmh: SLACK, blownAtSec: d.blow!.latch });
      expect(d.coached).toContain(`${TASK}@${d.blow!.t.toFixed(2)}`);
      expect(examine(d, "over", tally())).toEqual([]);
    });
  }
  it("RED-ON-V33 · sc-crossing-slow-crosser L1, held 20 over the gate for 40 s (the verifier's HOLD) — the stamped stretch charges the act's one re-grade: «Скорост над тавана на задачата» −1 nine seconds after the blow, score 21 (under V33: no stamp, no charge, 20)", () => {
    const d = driveRow(row("sc-crossing-slow-crosser", 1, "sc-scr-approach"), vHold());
    const blowT = d.blow!.t;
    const charge = d.mistakes.find((m) => m.startsWith(TASK));
    expect(charge).toBeDefined();
    expect(Number(charge!.slice(charge!.indexOf("@") + 1, charge!.indexOf("|"))) - blowT).toBeCloseTo(9, 1);
    expect(d.score).toBe(21);
    expect(examine(d, "hold", tally())).toEqual([]);
  });
  it("RED-ON-UX14 (round 15: the line is the glass figure + the sign's tolerance) · a mark passed EXACTLY on the bill line is not blown (billed only strictly above it): sc-speed-creep L2 at 55 through «≤50» (gate 54,5) — no latch, no arrival, no breach row, no task card", () => {
    const d = driveRow(row("sc-speed-creep", 2, "sc-crp-approach"), PLANS.line);
    expect([d.blow, d.latches]).toEqual([null, []]);
    expect(d.tap.some((c) => (c.tick as SimTick).taskCapArrival !== undefined || (c.tick as SimTick).taskSpeedCap !== undefined)).toBe(false);
    expect(d.breaches.filter((b) => b.startsWith("sc-crp-approach@"))).toEqual([]);
    expect(d.cards.filter((c) => c.code === TASK)).toEqual([]);
  });
});

describe("THE COMMITTED DOMAIN — the capped objectives the census drives, derived from the compiled lessons", () => {
  it("521 capped objectives over the practice rungs — the same 521 the generated census derives its pairs from (`rules/__tests__/taskCapCommittedPairs`), the glass figure under the compiled gate on 308 of them", () => {
    expect(ROWS.length).toBe(521);
    expect(new Set(ROWS.map((r) => r.id)).size).toBeGreaterThan(100);
    expect(new Set(ROWS.map((r) => r.lv))).toEqual(new Set([1, 2, 3, 5]));
    const pairs = committedPairs();
    expect(pairs.map((p) => `${p.id}@${p.level} ${p.objectiveId} ${p.gate}`).sort()).toEqual(ROWS.map((r) => `${r.id}@${r.lv} ${r.objectiveId} ${r.gate}`).sort());
    expect(pairs.filter((p) => p.glass < p.gate).length).toBe(308);
  });
});

describe("THE LESSON CENSUS — every committed capped objective through the real lesson session: the stamp against the glass (A), the rule events against the reference ledger (B), the charged rows and points (C) and the cards' whole text (D)", () => {
  it("line · EXACTLY on the bill line (round 15: the glass figure + the sign's tolerance) — no mark is latched, no breach row, no task bill, on any of the 521", () => {
    const { problems, T } = runPlan("line");
    expect(said(problems)).toEqual(CLEAN);
    expect(T.drives).toBe(521);
    expect(T.noRecorder).toBe(3);
    expect(T.blown).toBe(0);
    expect(T.taskShown + T.taskAbsorbed + T.taskRegrades).toBe(0);
    expect(T.stampedFrames).toBe(0);
    expect(T.frames).toBeGreaterThan(1_000_000);
  }, 900_000);
  it("late · a late blow, then the route's own driving — 0 differences; the domain is the committed one (the glass under the gate on 300+ blown marks, 130+ of them sign-bound; the gate at or above the sign with the glass under it; reversing, night, snow, fog, rain and bend frames)", () => {
    const { problems, T } = runPlan("late");
    expect(said(problems)).toEqual(CLEAN);
    expect(T.drives).toBe(521);
    // Three rows (one objective at three rungs) have no recorder that plays their route: pinned, so a recorder that stops playing a drive shrinks nothing silently.
    expect(T.noRecorder).toBe(3);
    // Round 15: 513 blown marks (round 14: 514), 189 sign-bound (192), 324 graded (322). The plan now drives 0,2 over the
    // GLASS line, which on the ladder rungs the gate credits a few metres short of the mark — and the mark is then decided
    // where the car crosses it. On five rows the drive ENDS before that crossing (a terminal objective credited short of
    // its mark: sc-park-parallel-exit L1/L2 sc-ppx-out, sc-park-bay-exit-rev L1/L2 sc-pbe-away, sc-speed-creep L1
    // sc-crp-finish), so nothing is decided there; elsewhere marks the gate's old line let through are crossed over the new one.
    expect(T.blown).toBe(513);
    expect(T.signBound).toBe(189);
    expect(T.graded).toBe(324);
    // …every one decided at the crossing: while the objective is active, or after the ladder's gate credited it short of
    // the mark at a speed it then carried over the line (`taskCapMarkWatch`, L1/L2).
    expect(T.crossingArrivals).toBeGreaterThan(400);
    expect(T.creditedArrivals).toBeGreaterThan(90);
    expect(T.glassUnderGate).toBeGreaterThan(300);
    expect(T.signBoundGlassUnderGate).toBe(133);
    expect(T.gradedGateAtOrAboveSign).toBe(3);
    expect(T.breachRows).toBe(T.graded);
    // «THE GLASS STOPS WHEN THE GRADING STOPS», both ways: no frame after a blow shows the cap under the sign without its stamp.
    expect(T.glassWithoutStamp).toBe(0);
    // Round 15: 7,460 stamped frames (round 14: 140,000+). A late blow at 0,2 over the GLASS line is under the gate on the
    // ladder rungs, so the objective is credited and its mark arrives on the crediting frame with no stretch to stamp;
    // and a crossing latch whose objective then completes is released with it. The stretch is still stamped in full
    // wherever the mark is crossed over the gate too — the hold and grace plans below.
    expect(T.stampedFrames).toBeGreaterThan(7000);
    expect(T.reversingFrames).toBeGreaterThan(3000);
    expect(T.nightFrames).toBeGreaterThan(50_000);
    expect(T.snowFrames).toBeGreaterThan(10_000);
    expect(T.fogFrames).toBeGreaterThan(10_000);
    expect(T.rainFrames).toBeGreaterThan(50_000);
    expect(T.bendFrames).toBeGreaterThan(10_000);
    expect(T.taskShown).toBeGreaterThan(350);
    expect(T.cardsChecked).toBeGreaterThan(350);
    expect(T.signBoundCards).toBeGreaterThan(50);
    expect(T.ownMistakeDrives).toBeGreaterThan(30);
  }, 900_000);
  it("hold · a late blow, then 14 s over the task's line and the sign — 0 differences; stamped stretches, re-grades and charged points arise in hundreds", () => {
    const { problems, T } = runPlan("hold");
    expect(said(problems)).toEqual(CLEAN);
    expect(T.blown).toBe(513);
    expect(T.glassWithoutStamp).toBe(0);
    // Round 15 (measured: 113,170 / 105 / 132 / 125): the held speed is 3 over the glass line, no longer over gate + slack.
    expect(T.stampedFrames).toBeGreaterThan(100_000);
    expect(T.taskRegrades).toBeGreaterThan(95);
    expect(T.taskAbsorbed).toBeGreaterThan(120);
    expect(T.kinCharges).toBeGreaterThan(115);
    expect(T.kinRows).toBeGreaterThan(320);
    expect(T.cardsChecked).toBeGreaterThan(450);
  }, 900_000);
  it("grace · a late blow, then 12 s in the sign's grace band — 0 differences; the sign-bound arrivals wait and bill on their held correction, each card quoting the glass figure and the sign of its blow", () => {
    const { problems, T } = runPlan("grace");
    expect(said(problems)).toEqual(CLEAN);
    expect(T.blown).toBe(513);
    expect(T.glassWithoutStamp).toBe(0);
    expect(T.signBoundCards).toBeGreaterThan(15);
    expect(T.kinRows).toBeGreaterThan(380);
    // Round 15 (measured 124).
    expect(T.kinCharges).toBeGreaterThan(115);
    expect(T.cardsChecked).toBeGreaterThan(480);
  }, 900_000);
  it("wet · ROUND 14 (R1) — wherever the weather reduces the sign, the mark passed 0,3 km/h over what it leaves of the sign and held there 14 s: 0 differences, and NO card or toast states a comparison its printed numbers do not bear out (round 13: «… с 42,8 км/ч … — и над 43 км/ч, които дъждът оставя от знака 50» on 13 objective × rung rows)", () => {
    const { problems, T } = runPlan("wet");
    expect(said(problems)).toEqual(CLEAN);
    expect(T.drives).toBe(521);
    expect(T.displaysChecked).toBeGreaterThan(400);
    expect(T.envelopeClauses).toBeGreaterThan(5);
    expect(T.decimalThresholdDisplays).toBeGreaterThan(5);
  }, 900_000);
});
