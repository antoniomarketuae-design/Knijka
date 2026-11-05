/**
 * THE REVERSE WARNING ON THE COACH'S CARD (lane rbreverse,
 * sc-roundabout-entry:9e85f27e; founder ruling Q2 2026-10-19 «WARN ONLY»;
 * integrator rulings R1, R2, R3, R4).
 *
 * The warning is `lessons/advisor.ts reverseWarningForSession`, read by
 * `advisorPromptForSession` (the advisor card and its phone peek) from the
 * session's fold of `SimTick.reverseBrakedFor`. This file reads it through the
 * shell's own functions on real compiled sessions driven by `applyTick`:
 *
 *  §1 THE COPY — one sentence per body kind, a because-clause, inside the
 *     budgets; no side, no outcome he cannot cause, no move order; the law by
 *     retrieval only (R3).
 *  §2 THE RANK (R2, R4) — above the pinned recovery, the off-road card, the
 *     live yields and the objective; the banner, the phone task row and the
 *     follow pill keep what they show.
 *  §3 T7 — BELOW the person hold, whose frames stay byte-identical with the
 *     signal forced on; DRIVE_ON matches nothing shown under it.
 *  §4 T8 — nothing in exam mode, nothing outside the drive, nothing without
 *     the signal.
 * The live drives (the row's reverse, Risk 2, the standing car, the controls)
 * are in `modules/sim/lessons/scenario/__tests__/rbreverse-ring-reverse.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { resolveLawRef } from "@/lib/content/law";
import type { ReverseBrakedFor, SimTick } from "@/modules/sim/rules";
import {
  REVERSE_DUTY_BEFORE,
  SCENARIO_TEMPLATES,
  advisorPromptForSession,
  applyTick,
  compileScenario,
  createLessonSession,
  reverseWarningAdvisorPrompt,
  reverseWarningForSession,
  routeHoldForSession,
  type LessonSessionState,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";
import { followHintStandsDown } from "../../LessonScene";
import { bannerObjectiveLineBg, lessonQueueBinding, objectiveTitleUnderHold, snapshotOf } from "../LessonPlayShell";

const ON: ReverseBrakedFor = { vehicleId: 1000, kind: "vehicle", fwdM: -5.34, leftM: 6.36 };
const RIDER: ReverseBrakedFor = { vehicleId: 2001, kind: "cyclist", fwdM: -4, leftM: -1 };
/** The words the warning may never say (the brief's STEP 3 list). */
const SIDE_OR_OUTCOME = /отзад|отляво|отдясно|зад теб|пропусни|изчакай да мине|нека мине/iu;
/** A move order: the recovery's and the objective's stems. */
const MOVE = /потегл|отдръпни|назад|напред|излез|премини|тръгни|карай/iu;
/** personStrikeHold.test.ts's own list (C-TRUTH). */
const DRIVE_ON = /потегл|отдръпни|назад|напред|(?<!не )тръгва|тръгни|(?<!не )продълж|следвай|карай/iu;

function wrap(text: string, width = 24): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.trim().split(/\s+/u)) {
    if (cur === "") cur = word;
    else if (cur.length + 1 + word.length <= width) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

const lesson = (id: string, L: 1 | 2 | 3 | 4 | 5): LessonSpec => compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === id)!, L);

const DT = 0.05;
/** North along x = 4.06 at `kmh`; `body` struck at `strikeY` (if any); rest `restAfterM` on; stand `standSec`. */
function northDrive(o: { fromY: number; strikeY?: number; kmh: number; restAfterM: number; standSec: number; body?: "pedestrian" | "cyclist" | "staticObject" }): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  let y = o.fromY;
  let struck = o.strikeY === undefined;
  const stopFrom = o.strikeY ?? o.fromY + 10;
  const restY = stopFrom + o.restAfterM;
  while (y < restY) {
    const events: SimTick["events"] = [];
    if (!struck && y >= o.strikeY!) {
      events.push({ kind: "collision", withWhat: o.body ?? "pedestrian" });
      struck = true;
    }
    const v = y < stopFrom ? o.kmh : Math.max(2, o.kmh * Math.sqrt(Math.max(0, (restY - y) / Math.max(o.restAfterM, 0.01))));
    ticks.push(makeTick({ t, speedKmh: v, headingDeg: 0, position: { x: 4.06, y }, events }));
    t = +(t + DT).toFixed(6);
    y += (v / 3.6) * DT;
  }
  for (let i = 0; i < o.standSec / DT; i++) {
    ticks.push(makeTick({ t, speedKmh: 0, headingDeg: 0, position: { x: 4.06, y } }));
    t = +(t + DT).toFixed(6);
  }
  return ticks;
}

function states(l: LessonSpec, ticks: SimTick[]): Array<{ s: LessonSessionState; k: SimTick }> {
  let s = createLessonSession(l);
  const out: Array<{ s: LessonSessionState; k: SimTick }> = [];
  for (const k of ticks) {
    s = applyTick(s, k).state;
    out.push({ s, k });
  }
  return out;
}

/** Every surface the shell prints for this state (banner, phone task row and detail, card, peek, pill). */
function glass(s: LessonSessionState, k: SimTick, prev: ReturnType<typeof snapshotOf> | null = null) {
  const snap = snapshotOf(s, k, null, prev);
  const pr = advisorPromptForSession(s);
  const q = lessonQueueBinding({
    snap,
    advisorOn: true,
    examMode: s.lesson.examMode === true,
    mistakeMode: false,
    ended: false,
    compact: true,
    taskPing: 0,
    lessonDescriptionBg: s.lesson.descriptionBg ?? "",
    governorCapKmh: null,
  });
  return {
    banner: objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold, snap.objectiveHoldWayOut, snap.objectiveHoldPersonLeadBg),
    taskRow: q.taskLineBg,
    card: pr?.textBg ?? null,
    peek: pr?.peekBg ?? null,
    pillDown: followHintStandsDown(snap.objectiveHold),
  };
}
const withSignal = (s: LessonSessionState, v: ReverseBrakedFor | null = ON): LessonSessionState => ({ ...s, reverseBrakedFor: v });

describe("§1 · the copy — true on every frame it shows on", () => {
  const V = reverseWarningAdvisorPrompt("vehicle");
  const C = reverseWarningAdvisorPrompt("cyclist");

  it("one sentence per body kind, «превозно средство» (true of a truck, a bus, a tram) and «велосипедист»; the same peek for both", () => {
    expect(V.textBg).toBe("Спри заден ход — превозно средство намали заради теб, а ти се движиш към него. Огледай се: заден ход само по свободен път (ЗДвП чл. 40, ал. 1).");
    expect(C.textBg).toBe("Спри заден ход — велосипедист намали заради теб, а ти се движиш към него. Огледай се: заден ход само по свободен път (ЗДвП чл. 40, ал. 1).");
    expect(V.peekBg).toBe("Спри заден ход: някой намали заради теб.");
    expect(C.peekBg).toBe(V.peekBg);
    expect(V.keys).toEqual([]);
  });

  it("the budgets: the card under the 240 px column's 150 characters, the peek two lines of 24 with no figure and no article", () => {
    for (const p of [V, C]) {
      expect(p.textBg.length).toBeLessThanOrEqual(150);
      const lines = wrap(p.peekBg!);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.every((l) => l.length <= 24)).toBe(true);
      expect(p.peekBg).not.toMatch(/\d|(?<!\p{L})(?:чл|ал)\.|ЗДвП/u);
    }
  });

  it("it names the danger and the act: the STOP first, then why (it slowed because of him; he is closing on it), then the look; card and peek", () => {
    for (const p of [V, C]) {
      expect(p.textBg).toMatch(/^Спри заден ход — /u);
      expect(p.textBg).toMatch(/намали заради теб/u);
      expect(p.textBg).toMatch(/ти се движиш към него/u);
      expect(p.textBg).toMatch(/Огледай се/u);
      expect(p.peekBg).toMatch(/^Спри заден ход: .*намали заради теб\.$/u);
    }
  });

  it("NO SIDE, NO OUTCOME he cannot cause, NO MOVE ORDER — on the card and on the peek", () => {
    for (const s of [V.textBg, V.peekBg!, C.textBg, C.peekBg!]) {
      expect(s).not.toMatch(SIDE_OR_OUTCOME);
      expect(s).not.toMatch(MOVE);
    }
  });

  it("R3 — the law by retrieval only: the one citation is REVERSE_DUTY_BEFORE, interpolated, and it resolves in the corpus (ЗДвП чл. 40, ал. 1)", () => {
    expect(REVERSE_DUTY_BEFORE.lawRef).toBe("ЗДвП чл. 40, ал. 1");
    const r = resolveLawRef({ act: "ЗДвП", ref: REVERSE_DUTY_BEFORE.lawRef.replace(/^ЗДвП /u, "") });
    expect(r.found, "resolves").toBe(true);
    // the retrieved unit is the reverse duty (ал. 1: before reversing, no danger or difficulty for others)
    expect(JSON.stringify(r)).toMatch(/движение назад/u);
    expect(V.textBg.endsWith(`(${REVERSE_DUTY_BEFORE.lawRef}).`)).toBe(true);
    expect(V.textBg.match(/ЗДвП/gu)?.length).toBe(1);
  });
});

describe("§2 · the rank (R2) — above every card but the person hold; the banner, task row and pill keep what they show (R4)", () => {
  it("over the OBJECTIVE: a driving frame with no hold — the warning takes the card and peek, the banner and the task row are unchanged", () => {
    const fr = states(lesson("sc-roundabout-entry", 3), northDrive({ fromY: -60, kmh: 20, restAfterM: 4, standSec: 1 }));
    const { s, k } = fr[fr.length - 1];
    expect(s.phase).toBe("driving");
    expect(routeHoldForSession(s)).toBeNull();
    // the shell's snapshot of the frame before (its held task-cap figure, O51) — as on the glass
    const prevSnap = snapshotOf(fr[fr.length - 2].s, fr[fr.length - 2].k, null, null);
    const before = glass(s, k, prevSnap);
    expect(before.card).not.toBeNull();
    expect(before.card).not.toBe(reverseWarningAdvisorPrompt("vehicle").textBg);
    const after = glass(withSignal(s), k, prevSnap);
    expect(after.card).toBe(reverseWarningAdvisorPrompt("vehicle").textBg);
    expect(after.peek).toBe(reverseWarningAdvisorPrompt("vehicle").peekBg);
    expect(after.banner).toBe(before.banner);
    expect(after.banner).toMatch(/дръж под \d+ км\/ч/u); // the task's figure is still on the banner (held, O51)
    expect(after.taskRow).toBe(before.taskRow);
    expect(after.pillDown).toBe(before.pillDown);
    // the rider's sentence for a rider
    expect(glass(withSignal(s, RIDER), k, prevSnap).card).toBe(reverseWarningAdvisorPrompt("cyclist").textBg);
    // null and absent are the same: no warning
    expect(glass(withSignal(s, null), k, prevSnap)).toEqual(before);
  });

  it("over the PINNED RECOVERY: after a static strike, on every crashPinned frame the warning replaces the look-first move card; the hold lead on the banner stays", () => {
    const fr = states(lesson("sc-roundabout-entry", 3), northDrive({ fromY: -60, strikeY: -45, kmh: 20, restAfterM: 1, standSec: 6, body: "staticObject" }));
    const pinned = fr.filter(({ s }) => s.phase === "driving" && routeHoldForSession(s) === "crashPinned");
    expect(pinned.length).toBeGreaterThan(20);
    for (const { s, k } of pinned) {
      const before = glass(s, k);
      expect(before.card).toMatch(/^Огледай се/u);
      const after = glass(withSignal(s), k);
      expect(after.card).toBe(reverseWarningAdvisorPrompt("vehicle").textBg);
      expect(after.peek).toBe(reverseWarningAdvisorPrompt("vehicle").peekBg);
      expect(after.banner).toBe(before.banner);
      expect(after.taskRow).toBe(before.taskRow);
      expect(after.pillDown).toBe(before.pillDown);
    }
  });
});

describe("§3 · T7 — BELOW the person hold: its frames are byte-identical with the signal forced on", () => {
  for (const [id, L, body] of [
    ["sc-pe-jaywalker", 2, "pedestrian"],
    ["sc-crossing-child-ball", 2, "cyclist"],
  ] as const) {
    it(`${id}@L${L}, a ${body} struck: every frame from the bill — armed and free — shows exactly what it shows without the signal, and nothing shown invites driving on`, () => {
      const fr = states(lesson(id, L), northDrive({ fromY: 0, strikeY: 20, kmh: 40, restAfterM: 8, standSec: 30, body }));
      const after = fr.filter(({ s }) => s.phase === "driving" && s.personStruckAtSec !== undefined);
      expect(after.length).toBeGreaterThan(100);
      expect(after.some(({ s }) => s.crashPin !== undefined)).toBe(true);
      expect(after.some(({ s }) => s.crashPin === undefined)).toBe(true);
      for (const { s, k } of after) {
        expect(routeHoldForSession(s)).toBe("personStruck");
        const plain = glass(s, k);
        const forced = glass(withSignal(s), k);
        expect(forced).toEqual(plain);
        expect(reverseWarningForSession(withSignal(s))).toBeNull();
        for (const x of [forced.banner, forced.taskRow, forced.card, forced.peek]) if (x !== null) expect(DRIVE_ON.test(x), x).toBe(false);
      }
    });
  }
});

describe("§4 · T8 — nothing in exam mode, nothing outside the drive, nothing without the signal", () => {
  it("an exam rung (sc-roundabout-entry@L4): the signal forced on every frame gives no warning and no card", () => {
    const l = lesson("sc-roundabout-entry", 4);
    expect(l.examMode).toBe(true);
    const fr = states(l, northDrive({ fromY: -60, kmh: 20, restAfterM: 4, standSec: 2 }));
    const driving = fr.filter(({ s }) => s.phase === "driving");
    expect(driving.length).toBeGreaterThan(20);
    for (const { s } of driving) {
      expect(reverseWarningForSession(withSignal(s))).toBeNull();
      expect(advisorPromptForSession(withSignal(s))).toBeNull();
    }
    // …the positive control in this instance: the same frames on the practice rung DO warn
    const pr = states(lesson("sc-roundabout-entry", 3), northDrive({ fromY: -60, kmh: 20, restAfterM: 4, standSec: 2 })).filter(({ s }) => s.phase === "driving");
    expect(pr.every(({ s }) => reverseWarningForSession(withSignal(s)) !== null)).toBe(true);
  });

  it("outside the drive (pre-drive, ended) and with the signal absent or null: no warning", () => {
    const l = lesson("sc-roundabout-entry", 3);
    const s0 = createLessonSession(l);
    expect(reverseWarningForSession(withSignal({ ...s0, phase: "completed" }))).toBeNull();
    expect(reverseWarningForSession(withSignal({ ...s0, phase: "aborted" }))).toBeNull();
    if (s0.phase === "preDrive") expect(reverseWarningForSession(withSignal(s0))).toBeNull();
    const fr = states(l, northDrive({ fromY: -60, kmh: 20, restAfterM: 4, standSec: 1 }));
    const { s } = fr[fr.length - 1];
    expect(reverseWarningForSession(s)).toBeNull();
    expect(reverseWarningForSession(withSignal(s, null))).toBeNull();
    expect(reverseWarningForSession(withSignal(s))).not.toBeNull();
  });
});
