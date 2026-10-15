/**
 * =============================================================================
 * THE END SCREEN DOES NOT TAKE AN OPENED EXPLANATION AWAY MID-READ —
 * sc-roundabout-entry:fe081cf1 round 2 (2026-10-13), integrator decision W3.
 *
 * THE FRAME. `.audit-frames/rig-w3d/sc-roundabout-entry/fe081cf1/
 * pc-L3-F-ON-WHY-31-end-card.png` — the island is struck at 50.683 s, the car
 * is at rest at 50.767, «ЗАЩО» is pressed at contact +2.233 s, and at 60.767
 * (rest + `CRASH_PIN_STUCK_S`) the full-frame debrief replaces the stage and
 * the notify column with it: the 323-character paragraph was on the glass
 * 7.85 s of the 21.5 s the product's own reading rule gives it.
 *
 * THE RULING, word for word: «the END is stamped exactly where it is today —
 * CRASH_PIN_STUCK_S and every graded clock stay untouched — but the end OVERLAY
 * waits until the opened card's derived reading time is over or the student
 * closes it, whichever comes first. Bounded by that reading time; say what the
 * glass shows meanwhile and prove the session's result, points and end step are
 * byte-identical.»
 *
 * SO THIS FILE HOLDS THREE THINGS:
 *   §1  the overlay's predicate: with nobody reading it is the function it
 *       was, on all 32 states; with a reader it waits, and the end bar stands
 *       in — never leaking the verdict the I1 gate is holding.
 *   §2  what the glass shows meanwhile, pinned on the shell's markup.
 *   §3  THE END DID NOT MOVE: the same crash-pinned drive ends on the same
 *       step with the same result and the same wire payload, and nothing on
 *       the path that produces them can see the reader.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../../../modules/sim/contracts";
import { toastReadMs } from "../../../../modules/sim/hud/HudToasts";
import {
  endBarVerdictHidden,
  SESSION_END_HELD_LINE_BG,
  shouldShowDebrief,
  shouldShowEndBar,
  type DebriefVisibility,
} from "../../../../modules/sim/hud/hudPreferences";
import { applyTick, buildLessonResult, createLessonSession } from "../../../../modules/sim/lessons/engine";
import { CRASH_PIN_STUCK_S } from "../../../../modules/sim/lessons/finish";
import { makeTick } from "../../../../modules/sim/lessons/__tests__/fixtures";
import type { LessonSessionState } from "../../../../modules/sim/lessons/types";
import type { SimTick } from "../../../../modules/sim/rules";
import { finalizeLessonSession, type FinalizeLessonDeps } from "../LessonPlayShell";

const SHELL_SRC = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
/** Source with comments removed — a pin may never be satisfied by prose. */
const SHELL = SHELL_SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const BOOLS = [false, true] as const;
/** Every state of the five facts the predicate had before W3. */
function everyState(): DebriefVisibility[] {
  const out: DebriefVisibility[] = [];
  for (const ended of BOOLS)
    for (const compact of BOOLS)
      for (const expanded of BOOLS)
        for (const skipped of BOOLS)
          for (const autoOpen of BOOLS) for (const held of BOOLS) out.push({ ended, compact, expanded, skipped, autoOpen, held });
  return out;
}
/** The predicate as it stood at 8cb0707 — the reference this repair may not move. */
function debriefAtBase(v: DebriefVisibility): boolean {
  if (!v.ended) return false;
  if (v.expanded) return true;
  if (v.compact) return false;
  if (v.held) return true;
  return v.autoOpen && !v.skipped;
}

describe("§1 the overlay's predicate", () => {
  it("NOBODY READING: on all 64 states it is the function it was — absent and `false` alike", () => {
    const states = everyState();
    expect(states).toHaveLength(64);
    for (const v of states) {
      expect(shouldShowDebrief(v), JSON.stringify(v)).toBe(debriefAtBase(v));
      expect(shouldShowDebrief({ ...v, reading: false }), JSON.stringify(v)).toBe(debriefAtBase(v));
      expect(shouldShowEndBar({ ...v, reading: false })).toBe(v.ended && !v.compact && !debriefAtBase(v));
    }
  });

  it("THE RIG CELL: the drive is over, the gate holds the result, auto-open is on — and he is still reading: the popup WAITS", () => {
    const cell = { ended: true, compact: false, expanded: false, skipped: false, autoOpen: true, held: true };
    expect(debriefAtBase(cell), "base: the debrief replaced the stage").toBe(true);
    expect(shouldShowDebrief({ ...cell, reading: true }), "the end screen took the explanation away mid-read").toBe(false);
    expect(shouldShowEndBar({ ...cell, reading: true }), "the glass says nothing about the session being over").toBe(true);
  });

  it("READING: on every roomy ended state the popup waits and the bar stands in — unless he asks for the debrief himself", () => {
    for (const v of everyState()) {
      const r = { ...v, reading: true };
      if (!v.ended) {
        expect(shouldShowDebrief(r)).toBe(false);
        expect(shouldShowEndBar(r)).toBe(false);
      } else if (v.expanded) {
        expect(shouldShowDebrief(r), "«Виж разбора» was pressed and the screen did not open").toBe(true);
        expect(shouldShowEndBar(r)).toBe(false);
      } else if (v.compact) {
        // the phone's debrief was never auto-opened; the reader does not exist there
        expect(shouldShowDebrief(r)).toBe(false);
        expect(shouldShowEndBar(r)).toBe(false);
      } else {
        expect(shouldShowDebrief(r), JSON.stringify(v)).toBe(false);
        expect(shouldShowEndBar(r), JSON.stringify(v)).toBe(true);
      }
    }
  });

  it("the wait only ever DELAYS the popup: there is no state it opens that base kept closed", () => {
    for (const v of everyState()) {
      if (shouldShowDebrief({ ...v, reading: true })) expect(debriefAtBase(v), JSON.stringify(v)).toBe(true);
    }
  });

  it("BOUNDED: the reader is the card, the card's life is its reading time — 21.5 s here, 88 s for the longest paragraph in the catalogue", () => {
    expect(toastReadMs(323)).toBe(21_534);
    expect(toastReadMs(1320)).toBe(88_000);
    // the shell's `reading` is derived from the reader, and the reader from the queue: no latch of its own
    expect(SHELL).toContain("reading: !compact && toastReader.reading !== null,");
    expect(SHELL).not.toMatch(/setEndWaits|endWaitsRef|useState\([^)]*\)[^\n]*endWait/);
  });

  it("the bar may not leak what the I1 gate holds back", () => {
    expect(endBarVerdictHidden({ held: true })).toBe(true);
    expect(endBarVerdictHidden({ held: false })).toBe(false);
  });
});

describe("§2 what the glass shows meanwhile — the roomy end bar, in the gate's form while the gate holds", () => {
  const barAt = SHELL.indexOf('data-hud="end-bar"');
  const bar = SHELL.slice(barAt, SHELL.indexOf("</div>\n          </div>\n        ) : null}", barAt));

  it("the anchor is there", () => {
    expect(barAt).toBeGreaterThan(0);
    expect(bar.length).toBeGreaterThan(400);
    expect(SHELL).toContain("{endBarVisible && result ? (");
    expect(SHELL).toContain("const endBarVisible = shouldShowEndBar(debriefVisibility);");
  });

  it("HELD: one sentence — the phone's own — and no verdict word, no points", () => {
    expect(SESSION_END_HELD_LINE_BG).toBe("Сесията завърши — първо се самооцени");
    const held = bar.match(/\{endBarVerdictHidden\(debriefVisibility\) \? \(([\s\S]*?)\) : \(([\s\S]*?)\n\s*\)\}/);
    expect(held, "the bar does not ask whether the gate is holding the verdict").not.toBeNull();
    expect(held![1]).toContain("{SESSION_END_HELD_LINE_BG}");
    expect(held![1]).not.toMatch(/result\.score|sessionEndBarLabelBg|sessionEndToneIsGood/);
    // the verdict, its colour and the points live in the OTHER arm only
    expect(held![2]).toContain("{sessionEndBarLabelBg(result)}");
    expect(held![2]).toContain("{result.score} нак. точки");
    // …and the border's colour is not a second channel for the verdict
    expect(bar).toMatch(/endBarVerdictHidden\(debriefVisibility\)\s*\?\s*"var\(--border-strong\)"\s*:\s*sessionEndToneIsGood\(result\)/);
  });

  it("the phone's end line says the same sentence from the same constant", () => {
    expect(SHELL).toMatch(/lineBg: resultHeld\s*\?\s*SESSION_END_HELD_LINE_BG\s*:\s*sessionEndLineBg\(result\),/);
    expect(SHELL_SRC.split('"Сесията завърши — първо се самооцени"').length - 1, "the sentence is typed twice again").toBe(0);
  });

  it("«Виж разбора» is on the bar in both forms; the two ways OUT wait with the verdict", () => {
    expect(bar).toMatch(/<button type="button" className="btn-accent px-4 py-1\.5 text-xs" onClick=\{openDebrief\}>\s*Виж разбора\s*<\/button>/);
    const exits = bar.match(/\{endBarVerdictHidden\(debriefVisibility\) \? null : \(([\s\S]*?)\n\s*\)\}/);
    expect(exits, "the bar offers a way round the gate while the gate is up").not.toBeNull();
    expect(exits![1]).toContain("onClick={retry}");
    expect(exits![1]).toContain("onClick={onExitToSelect}");
    // `openDebrief` is the explicit open that outranks the wait
    expect(SHELL).toMatch(/const openDebrief = useCallback\(\(\) => \{\s*setEndExpanded\(true\);\s*setEndSkipped\(false\);\s*\}, \[\]\);/);
  });
});

// ── §3 ───────────────────────────────────────────────────────────────────────
const LEG_1: LessonObjective = { id: "w3-leg1", titleBg: "Продължи по улицата", kind: "reachZone", params: { x: 0, y: 150, radiusM: 10 } };
const LEG_2: LessonObjective = { id: "w3-leg2", titleBg: "Спри в края на маршрута", kind: "reachZone", params: { x: 0, y: 300, radiusM: 10 } };
const LESSON: LessonSpec = {
  id: "t-w3-crash-pin",
  order: 99,
  titleBg: "Тестов маршрут",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [LEG_1, LEG_2],
};
const frame = (t: number, y: number, speedKmh: number, events: SimTick["events"] = []): SimTick =>
  makeTick({ t, speedKmh, position: { x: 0, y }, events });

/** The rig cell's shape on the engine: drive, strike a standing obstacle, stand pinned until the lesson ends itself. */
function crashPinnedDrive(): { ended: LessonSessionState; restT: number; endStep: number } {
  let state = createLessonSession(LESSON);
  let t = 0;
  for (let i = 0; i < 6; i += 1, t += 0.5) state = applyTick(state, frame(t, 34 + i, 20)).state;
  state = applyTick(state, frame(t, 40, 18, [{ kind: "collision", withWhat: "staticObject" }])).state;
  const restT = t + 0.5;
  let step = 0;
  for (t = restT; t <= restT + CRASH_PIN_STUCK_S + 5 && state.phase === "driving"; t += 0.5, step += 1) {
    state = applyTick(state, frame(t, 40, 0)).state;
  }
  return { ended: state, restT, endStep: step };
}

function finalizeCaptured(ended: LessonSessionState) {
  const sent: unknown[] = [];
  const shown: unknown[] = [];
  const deps: FinalizeLessonDeps = {
    lessonId: ended.lesson.id,
    mistakeExperience: false,
    rubric: undefined,
    startedAtMs: 1_000,
    microQuiz: { total: 0, correct: 0 },
    finishTrace: () => null,
    now: () => 71_000,
    setResult: (r) => shown.push(r),
    setRubric: () => {},
    setTraceUploaded: () => {},
    send: (wire) => {
      sent.push(wire);
      return new Promise(() => {});
    },
    setSaveResult: () => {},
  };
  finalizeLessonSession(ended, deps);
  return { sent, shown, depKeys: Object.keys(deps).sort() };
}

describe("§3 THE END DID NOT MOVE — the same drive, the same step, the same result, the same payload", () => {
  it("the graded clock that ends a pinned lesson is the 10 s it was", () => {
    expect(CRASH_PIN_STUCK_S).toBe(10);
  });

  it("a car pinned against the island ends the lesson CRASH_PIN_STUCK_S after it came to rest — on the step it always did", () => {
    const d = crashPinnedDrive();
    expect(d.ended.phase).toBe("completed");
    expect(d.ended.endedAtSec).not.toBeNull();
    // ticks at 2 Hz: the first standstill tick is the reference, the lesson closes on the tick 10 s after it
    expect(d.ended.endedAtSec! - d.restT).toBe(CRASH_PIN_STUCK_S);
    expect(d.endStep).toBe(CRASH_PIN_STUCK_S / 0.5 + 1);
  });

  it("result, points and wire payload: byte-identical whether or not anybody is reading — because none of them can be told", () => {
    const a = crashPinnedDrive();
    const b = crashPinnedDrive();
    expect(JSON.stringify(a.ended)).toBe(JSON.stringify(b.ended));
    const ra = buildLessonResult(a.ended);
    const fa = finalizeCaptured(a.ended);
    const fb = finalizeCaptured(b.ended);
    expect(fa.shown).toHaveLength(1);
    expect(JSON.stringify(fa.shown[0])).toBe(JSON.stringify(ra));
    expect(JSON.stringify(fa.shown)).toBe(JSON.stringify(fb.shown));
    expect(JSON.stringify(fa.sent)).toBe(JSON.stringify(fb.sent));
    expect(fa.sent).toHaveLength(1);
    // the −10 for the strike is in it, where it always was
    expect(ra.score).toBeGreaterThanOrEqual(10);
    // …and the reader has no way in: the finalizer's whole input is the session and these twelve things
    expect(fa.depKeys).toEqual(
      ["finishTrace", "lessonId", "microQuiz", "mistakeExperience", "now", "rubric", "send", "setResult", "setRubric", "setSaveResult", "setTraceUploaded", "startedAtMs"],
    );
    // the overlay's answer, for this very result, is the only thing the reading changes
    const overlay = { ended: true, compact: false, expanded: false, skipped: false, autoOpen: true, held: true };
    expect(shouldShowDebrief({ ...overlay, reading: true })).toBe(false);
    expect(shouldShowDebrief({ ...overlay, reading: false })).toBe(true);
  });

  it("IN THE SHELL: `ended` is still `result !== null`, the tick and the finalizer do not see the reader, and the scene freezes at the end as before", () => {
    expect(SHELL).toContain("const ended = result !== null;");
    expect(SHELL).toMatch(/const debriefVisibility = \{\s*ended: ended && result !== null,/);
    const finalize = SHELL.match(/const finalize = useCallback\(([\s\S]*?)\n  \);/);
    const tick = SHELL.match(/const handleTick = useCallback\(([\s\S]*?)\n  \);/);
    expect(finalize).not.toBeNull();
    expect(tick).not.toBeNull();
    for (const body of [finalize![1]!, tick![1]!]) expect(body).not.toMatch(/toastReader|debriefVisibility|endBarVisible/);
    // the world stops when the session does, reading or not
    expect(SHELL).toContain("frozen={teachQueue.length > 0 || activeQuiz !== null || ended}");
    // the one place the end meets the reader
    expect(SHELL.split("toastReader.reading !== null").length - 1).toBe(1);
  });
});
