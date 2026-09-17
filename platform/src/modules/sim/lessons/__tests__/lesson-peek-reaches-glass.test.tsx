/**
 * THE COACH'S SUMMARY REACHES THE GLASS — `sc-merge-from-property:6715b581`,
 * the follow-up that makes the advisor lane's field live.
 *
 * THE FRAME: `.audit-frames/w47/frames/sc-merge-from-property__mobile-right/
 * 04-t027s.png`, iPhone 16 landscape —
 *
 *     Защо чакаш: пешеходец на
 *     пътеката
 *     Правилно е да чакаш тук. При        ← the approval, cut before the reason
 *     преди 5 с
 *     ЗАЩО ↓17   ✕
 *
 * `advisor.ts` authored a one-line summary for every yield-voice stage, and an
 * adversarial verify found it DEAD: `HudEvent`'s `lesson` member did not declare
 * `peekBg`, and `LessonPlayShell`'s `lesson` → `hint` re-map built the overlay
 * item without it, so `SimOverlay` row 2b fell through to `detailBg` exactly as
 * before. A field computed and dropped at a boundary is the 51-of-82 class this
 * programme measured, so THIS FILE IS THE DEAD-PREDICATE GATE, and it drives the
 * chain rather than asserting its links one at a time:
 *
 *   engine.applyTick → hudEvents → hud/HudToasts.stampToasts (the queue's own
 *   stamper) → THE SHIPPED lesson branch of the shell's re-map → overlayQueue
 *   .overlayPeekBodyBg → SimOverlay, rendered.
 *
 * THE ONE HOP A TEST CANNOT EXECUTE AS COMPILED CODE, named rather than implied:
 * the re-map is an inline `toasts.map((t): SimOverlayItem | null => { … })`
 * inside `LessonPlayShell`'s overlay `useMemo`, a hook that needs a DOM, a scene
 * and a live session to run. It is not extracted into an exported builder
 * because `hud/__tests__/hud-toast-moment.test.tsx` pins the stamp by slicing
 * 2 600 characters from `...(!ended` in the shell source, and moving the branch
 * out of that slice would turn another lane's gate red. So the branch is read
 * out of the shell's source — the exact text that ships — and EVALUATED on the
 * toast the real queue stamped. That is not a copy of the mapping; if the
 * shipped line goes, the evaluated item loses the field, and the mutation test
 * below proves this file notices.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { stampToasts, type HudToast } from "../../hud/HudToasts";
import { overlayPeekBodyBg, type SimOverlayItem } from "../../hud/overlayQueue";
import { SimOverlay } from "../../hud/SimOverlay";
import { VIOLATIONS, violationPeekBg, type ViolationCode } from "../../rules";
import { createYieldVoice, stepYieldVoice } from "../advisor";
import { applyPreDriveStep, applyTick, createLessonSession, TEACH_PAUSE_MIN_GAP_S } from "../engine";
import { createYieldWait } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { YieldWaitState } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

/* ── The window, re-cut from the literals `violation-title-fits-peek.test.ts`,
      `violation-peek-summary.test.tsx` and `yield-voice-peek.test.ts` use. ── */

/** px. The peek's text-window floor (`SimOverlay` `minHeight: "2.75rem"`). */
const WINDOW_PX = 2.75 * 16;
/** px. 11 px at `leading-tight` — one line of `lineBg`. */
const TITLE_LINE_PX = 13.75;
/** px. 11 px at `leading-snug` — one line of the body row. */
const BODY_LINE_PX = 15.125;
/** Characters one line of the compact card holds — the siblings' proxy. */
const PEEK_LINE_CHARS = 26;
/**
 * The stricter budget every summary `engine.ts` authors is held to. The w47
 * verify of the advisor lane warned that 26 is a knife edge (at 24, 18 of 24
 * yield stages overflow), so a line this file owns must be one line at 24.
 */
const ENGINE_PEEK_MAX_CHARS = 24;

const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);
const OVERLAY_SRC = readFileSync(resolve(__dirname, "../../hud/SimOverlay.tsx"), "utf8");
const ENGINE_SRC = readFileSync(resolve(__dirname, "../engine.ts"), "utf8");

/** Greedy word wrap — the browser's own algorithm at a character budget. */
function wrap(text: string, perLine = PEEK_LINE_CHARS): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length <= perLine) line = next;
    else {
      if (line !== "") out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out;
}

/* ── THE SHIPPED RE-MAP, EXECUTED ─────────────────────────────────────────── */

const LESSON_OPEN = 'if (t.event.kind === "lesson") {';
const COMMENDATION_OPEN = 'if (t.event.kind === "commendation")';

/**
 * The body of the shell's `lesson` branch, as a function of `t`. Throws — never
 * returns something plausible — when the anchors are gone, because a gate that
 * cannot find what it measures must say so rather than pass.
 */
function lessonBranch(src: string): (t: HudToast) => SimOverlayItem {
  const start = src.indexOf(LESSON_OPEN);
  const end = start < 0 ? -1 : src.indexOf(COMMENDATION_OPEN, start);
  if (start < 0 || end < 0) {
    throw new Error("UNRESOLVED: the shell's lesson → hint re-map anchors are gone");
  }
  const block = src.slice(start + LESSON_OPEN.length, end);
  const close = block.lastIndexOf("}");
  // Whole-line `//` comments only: the branch is plain JS apart from them, and
  // a comment that is not a whole line would make `new Function` throw, which
  // is the loud failure this wants.
  const body = block
    .slice(0, close)
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function("t", body) as (t: HudToast) => SimOverlayItem;
}

const SHIPPED_BRANCH = lessonBranch(SHELL_SRC);

/** Markup with tags stripped — what a reader actually reads on the phone. */
function glassText(item: SimOverlayItem): string {
  return renderToStaticMarkup(createElement(SimOverlay, { item, queued: 0 }))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A lesson notice → the phone's card, through the queue and the shipped branch. */
function phoneCard(notice: HudEvent, branch = SHIPPED_BRANCH): SimOverlayItem {
  const [toast] = stampToasts([notice], 1, 1_000);
  return branch(toast);
}

function lessonNotices(events: readonly HudEvent[]): Array<Extract<HudEvent, { kind: "lesson" }>> {
  return events.filter((e): e is Extract<HudEvent, { kind: "lesson" }> => e.kind === "lesson");
}

describe("the shipped lesson → hint branch carries the summary", () => {
  it("is still the branch the phone's overlay maps every toast through", () => {
    // The two lines around the evaluated text, so a refactor that moves the
    // branch out of the live map (and leaves a dead copy behind) fails here.
    const mapAt = SHELL_SRC.indexOf("toasts.map((t): SimOverlayItem | null => {");
    const endedAt = SHELL_SRC.lastIndexOf("...(!ended", mapAt);
    expect(mapAt).toBeGreaterThan(0);
    expect(endedAt).toBeGreaterThan(0);
    expect(mapAt - endedAt).toBeLessThan(200);
    expect(SHELL_SRC.indexOf(LESSON_OPEN)).toBeGreaterThan(mapAt);
    // …and the overlay the compact layout mounts reads the field for ANY kind.
    expect(OVERLAY_SRC).toContain("const peekBodyBg = overlayPeekBodyBg(shown);");
  });

  it("forwards `peekBg`, and null when the notice has none (the card as it was)", () => {
    const withPeek = phoneCard({
      kind: "lesson",
      titleBg: "Заглавие",
      explanationBg: "Дълъг абзац, който не се побира в реда на картата.",
      peekBg: "Кратко.",
    });
    expect(withPeek.kind).toBe("hint");
    expect(withPeek.peekBg).toBe("Кратко.");
    expect(overlayPeekBodyBg(withPeek)).toBe("Кратко.");
    // `detailBg` stays whole: «ЗАЩО» opens the paragraph, not the summary.
    expect(withPeek.detailBg).toBe("Дълъг абзац, който не се побира в реда на картата.");

    const without = phoneCard({ kind: "lesson", titleBg: "Заглавие", explanationBg: "Абзац." });
    expect(without.peekBg).toBeNull();
    expect(overlayPeekBodyBg(without)).toBe("Абзац.");
  });

  it("MUTATION: with the forwarding line deleted, this file goes red", () => {
    // The regression, applied to a copy of the shipped source. If this ever
    // stops changing the text, the anchor moved and the gate is blind.
    const regressed = SHELL_SRC.replace(
      /(if \(t\.event\.kind === "lesson"\) \{[\s\S]*?)\n\s*peekBg: t\.event\.peekBg \?\? null,/,
      "$1",
    );
    expect(regressed).not.toBe(SHELL_SRC);
    const item = phoneCard(
      { kind: "lesson", titleBg: "Заглавие", explanationBg: "Абзац.", peekBg: "Кратко." },
      lessonBranch(regressed),
    );
    expect(overlayPeekBodyBg(item)).toBe("Абзац.");
  });
});

describe("END TO END — the yield voice, through the live engine, onto the glass", () => {
  // The founder's roundabout drill, the geometry `yield-voice.test.ts` and
  // `yield-voice-peek.test.ts` drive: `engine.applyTick` is the fold the shell
  // calls every tick, not the pure step in isolation.
  const LESSON = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
  const LANE_X = 4.06;
  const PAINT_Y = -35.725;

  function waitAtTheRing(): Array<Extract<HudEvent, { kind: "lesson" }>> {
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: -50 }, speedKmh: 18 })).state;
    const said: HudEvent[] = [];
    let t = 0.1;
    for (let i = 0; i < 20; i++) {
      t = +(t + 0.1).toFixed(1);
      const step = applyTick(s, makeTick({ t, position: { x: LANE_X, y: PAINT_Y }, speedKmh: 0 }));
      s = step.state;
      said.push(...step.hudEvents);
    }
    return lessonNotices(said);
  }

  it("the named notice's summary is what row 2b prints — not the head of the paragraph", () => {
    const said = waitAtTheRing();
    expect(said.length).toBeGreaterThan(0);
    const notice = said[0];
    expect(typeof notice.peekBg).toBe("string");

    const card = phoneCard(notice);
    expect(card.peekBg).toBe(notice.peekBg);
    expect(overlayPeekBodyBg(card)).toBe(notice.peekBg);

    const glass = glassText(card);
    expect(glass).toContain(notice.peekBg!);
    expect(glass).not.toContain(notice.explanationBg.slice(0, 40));
    // The reason is still one tap away.
    expect(glass.toUpperCase()).toContain("ЗАЩО");
  });

  it("the frame's own card — «Защо чакаш: пешеходец на пътеката» — finishes its line", () => {
    const held: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason: "pedestrian",
      pedestrianCrossingIds: [],
    };
    const step = stepYieldVoice(createYieldVoice(), {
      t: 2,
      speedKmh: 0,
      wait: held,
      violations: [],
    });
    expect(step.notices).toHaveLength(1);
    const notice = step.notices[0];
    expect(notice.titleBg).toBe("Защо чакаш: пешеходец на пътеката");

    const glass = glassText(phoneCard(notice));
    expect(glass).toContain(notice.peekBg);
    // «Правилно е да чакаш тук. При» — the cut approval the judge photographed.
    expect(glass).not.toContain(notice.explanationBg.slice(0, 28));
    // And it fits whole: a two-line title leaves one body line in the floor.
    const px =
      wrap(notice.titleBg).length * TITLE_LINE_PX + wrap(notice.peekBg).length * BODY_LINE_PX;
    expect(px).toBeLessThanOrEqual(WINDOW_PX);
    // Sanity on the fixture: a free wait says nothing.
    expect(stepYieldVoice(undefined, { t: 2, speedKmh: 0, wait: createYieldWait(), violations: [] }).notices).toHaveLength(0);
  });
});

describe("END TO END — «Стигна точката, но твърде бързо», through the live engine", () => {
  const lesson: LessonSpec = {
    id: "t-cap-card-peek",
    order: 99,
    titleBg: "Тест",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: 50,
    objectives: [
      {
        id: "t-cap",
        titleBg: "Мини бавно през точката",
        kind: "reachZone",
        params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
      },
      {
        id: "t-finish",
        titleBg: "Спри в края на маршрута",
        kind: "reachZone",
        params: { x: 0, y: 300, radiusM: 15 },
      },
    ],
  };

  function driveOver(): Array<Extract<HudEvent, { kind: "lesson" }>> {
    let s = createLessonSession(lesson);
    const hud: HudEvent[] = [];
    for (let y = 0; y <= 140; y++) {
      const r = applyTick(s, makeTick({ t: y, speedKmh: 40, position: { x: 0, y }, maxSpeedKmh: 50 }));
      s = r.state;
      hud.push(...r.hudEvents);
    }
    return lessonNotices(hud).filter((e) => e.titleBg === "Стигна точката, но твърде бързо");
  }

  it("carries its summary, and the phone prints it instead of the cut paragraph", () => {
    const cards = driveOver();
    expect(cards).toHaveLength(1);
    const notice = cards[0];
    expect(typeof notice.peekBg).toBe("string");
    // The paragraph still carries the figures; the summary carries none.
    expect(notice.explanationBg).toMatch(/\d/);
    expect(notice.peekBg).not.toMatch(/\d/);

    const glass = glassText(phoneCard(notice));
    expect(glass).toContain(notice.peekBg!);
    expect(glass).not.toContain("Задачата иска да си тук с не повече от");
    // One body line under a two-line title — whole.
    expect(wrap(notice.titleBg).length).toBe(2);
    expect(notice.peekBg!.length).toBeLessThanOrEqual(ENGINE_PEEK_MAX_CHARS);
    expect(
      wrap(notice.titleBg).length * TITLE_LINE_PX + wrap(notice.peekBg!).length * BODY_LINE_PX,
    ).toBeLessThanOrEqual(WINDOW_PX);
  });
});

/* ── THE LAMPS CARD CITES ITS LAW ─────────────────────────────────────────────
   A follow-up lane once deleted this card's `lawRef` line while shortening its
   summary, and every gate stayed green: the census below counted `peekBg` and
   nothing else. THEO-4 / ADR-002 — the card that explains a refusal carries the
   article it rests on, and the fog pairing is a different article. So the
   card is DRIVEN here, one demand at a time, and its citation read off the
   event the shell receives. ── */

const LAMPS_TITLE = "Стигна точката, но без светлините, които задачата иска";

describe("END TO END — «Стигна точката, но без светлините…» carries its article", () => {
  function lampsCards(
    requireLamps: "lit" | "low" | "high" | "fog",
    headlights: "off" | "low" | "high",
  ): Array<Extract<HudEvent, { kind: "lesson" }>> {
    const lesson: LessonSpec = {
      id: `t-lamps-${requireLamps}`,
      order: 99,
      titleBg: "Тест",
      descriptionBg: "тест",
      conceptIds: [],
      spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
      preDrive: false,
      postedLimitKmh: 50,
      objectives: [
        {
          id: "t-lamps",
          titleBg: "Мини през точката",
          kind: "reachZone",
          // AUTHORED, so the demand under test is exactly this one and not
          // whatever a banner matcher derives from the title.
          params: { x: 0, y: 100, radiusM: 6, requireLamps },
        },
        {
          id: "t-finish",
          titleBg: "Спри в края на маршрута",
          kind: "reachZone",
          params: { x: 0, y: 300, radiusM: 15 },
        },
      ],
    };
    let s = createLessonSession(lesson);
    const hud: HudEvent[] = [];
    for (let y = 0; y <= 140; y++) {
      const r = applyTick(s, makeTick({ t: y, speedKmh: 30, position: { x: 0, y }, maxSpeedKmh: 50, headlights }));
      s = r.state;
      hud.push(...r.hudEvents);
    }
    return lessonNotices(hud).filter((e) => e.titleBg === LAMPS_TITLE);
  }

  it("fog lamps demanded → ЗДвП чл. 74, on the card the engine actually emits", () => {
    const cards = lampsCards("fog", "low");
    expect(cards).toHaveLength(1);
    expect(cards[0].lawRef).toBe("ЗДвП чл. 74");
  });

  it("every other lamp demand → ЗДвП чл. 70", () => {
    for (const [demand, lamps] of [
      ["lit", "off"],
      ["low", "high"],
      ["high", "low"],
    ] as const) {
      const cards = lampsCards(demand, lamps);
      expect(cards, `${demand} with ${lamps}`).toHaveLength(1);
      expect(cards[0].lawRef, `${demand} with ${lamps}`).toBe("ЗДвП чл. 70");
    }
  });
});

describe("END TO END — the retrieved summaries: coached faults and the pre-drive order", () => {
  const plain: LessonSpec = {
    id: "t-coached-peek",
    order: 99,
    titleBg: "Тест",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
  };

  /** The catalogue row a coached card was built from, found by its title. */
  function codeByTitle(titleBg: string): ViolationCode | null {
    const hit = (Object.keys(VIOLATIONS) as ViolationCode[]).find((c) => VIOLATIONS[c].titleBg === titleBg);
    return hit ?? null;
  }

  it("a first encounter inside the pause gap downgrades to a lesson card WITH the catalogue's line", () => {
    // `teach-escalation.test.ts`'s own sequence: a turn pauses at t=1, a lane
    // change at t=5 falls inside TEACH_PAUSE_MIN_GAP_S and downgrades.
    expect(TEACH_PAUSE_MIN_GAP_S).toBeGreaterThan(4);
    let s = createLessonSession(plain);
    const hud: HudEvent[] = [];
    for (const tick of [
      tickWithEvents(1, [{ kind: "turnStarted", direction: "left" }], { speedKmh: 30 }),
      makeTick({ t: 4, speedKmh: 30, laneId: 0 }),
      makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
    ]) {
      const r = applyTick(s, tick);
      s = r.state;
      hud.push(...r.hudEvents);
    }
    const downgraded = lessonNotices(hud);
    expect(downgraded.length).toBeGreaterThan(0);
    for (const notice of downgraded) {
      const code = codeByTitle(notice.titleBg);
      expect(code, notice.titleBg).not.toBeNull();
      // RETRIEVED, not authored: exactly the row's own summary.
      expect(notice.peekBg, notice.titleBg).toBe(violationPeekBg(code!, undefined) ?? undefined);
      expect(overlayPeekBodyBg(phoneCard(notice))).toBe(notice.peekBg ?? notice.explanationBg);
    }
  });

  it("a pre-drive step out of order carries PREDRIVE_WRONG_ORDER's line onto the phone card", () => {
    const s = createLessonSession({ ...plain, id: "t-predrive-peek", preDrive: true });
    expect(s.phase).toBe("preDrive");
    // Mirrors before the seat: `adjust-mirrors` validates `seatAdjusted`.
    const r = applyPreDriveStep(s, "adjust-mirrors", 1);
    const [notice] = lessonNotices(r.hudEvents);
    expect(notice).toBeDefined();
    expect(notice.titleBg.startsWith("Нарушен ред")).toBe(true);
    expect(notice.peekBg).toBe(violationPeekBg("PREDRIVE_WRONG_ORDER", "adjust-mirrors"));
    expect(glassText(phoneCard(notice))).toContain(notice.peekBg!);
  });
});

/* ── THE CENSUS: every `kind: "lesson"` literal `engine.ts` writes ─────────── */

interface LessonLiteral {
  /** 1-based line of `kind: "lesson"`. */
  line: number;
  text: string;
}

/**
 * Every object literal in `src` that spells `kind: "lesson"`, found by brace
 * balance with comments and double-quoted strings skipped. Returns `unresolved`
 * for a literal whose closing brace it cannot find, and the caller FAILS on it —
 * a matcher that silently skips what it cannot read is green and blind.
 */
function lessonLiterals(src: string): { found: LessonLiteral[]; unresolved: number[] } {
  const found: LessonLiteral[] = [];
  const unresolved: number[] = [];
  const re = /kind: "lesson",/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split("\n").length;
    const open = src.lastIndexOf("{", m.index);
    let depth = 0;
    let i = open;
    let closed = -1;
    for (; i < src.length && i < open + 8000; i++) {
      const ch = src[i];
      const two = src.slice(i, i + 2);
      if (two === "//") {
        i = src.indexOf("\n", i);
        if (i < 0) break;
        continue;
      }
      if (two === "/*") {
        i = src.indexOf("*/", i + 2) + 1;
        if (i <= 0) break;
        continue;
      }
      if (ch === '"') {
        i = src.indexOf('"', i + 1);
        if (i < 0) break;
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          closed = i;
          break;
        }
      }
    }
    if (closed < 0) unresolved.push(line);
    else found.push({ line, text: src.slice(open, closed + 1) });
  }
  return { found, unresolved };
}

/**
 * The endings: pushed on the frame the session completes, and that very handler
 * calls `finalize` → `setResult`, so the render that first holds these toasts
 * already has `ended` true and the re-map is skipped. A retry `clear()`s the
 * queue. They cannot reach the phone's hint card, so they owe it no summary.
 */
const ENDING_TITLE = /Край на/;

describe("census — every lesson card engine.ts writes either carries a summary or cannot reach the phone", () => {
  const { found, unresolved } = lessonLiterals(ENGINE_SRC);

  it("reads every literal it finds", () => {
    expect(unresolved).toEqual([]);
    expect(found.length).toBeGreaterThanOrEqual(11);
  });

  it("no reachable card is without one", () => {
    const missing = found
      .filter((l) => !ENDING_TITLE.test(l.text))
      .filter((l) => !/peekBg/.test(l.text))
      .map((l) => `engine.ts:${l.line}`);
    expect(missing).toEqual([]);
  });

  it("the endings really are unreachable — the three facts the exemption rests on", () => {
    expect(SHELL_SRC).toContain("const ended = result !== null;");
    expect(SHELL_SRC).toContain('if (state.phase === "completed") finalize(state);');
    expect(SHELL_SRC).toMatch(/const r = buildLessonResult\(state\);\s*setResult\(r\);/);
  });

  it("MUTATION: the census catches a card that loses its line, and refuses an unreadable one", () => {
    const stripped = ENGINE_SRC.replace('peekBg: "Мястото се минава назад.",', "");
    expect(stripped).not.toBe(ENGINE_SRC);
    const after = lessonLiterals(stripped).found.filter(
      (l) => !ENDING_TITLE.test(l.text) && !/peekBg/.test(l.text),
    );
    expect(after).toHaveLength(1);
    expect(after[0].text).toContain("Стигна точката на преден ход");
    // A literal that never closes is reported, not skipped.
    expect(lessonLiterals('x = { kind: "lesson", titleBg: "а"').unresolved).toEqual([1]);
  });

  describe("…and every card that CITED its law at 4209dad still cites the same one", () => {
    /**
     * The citation each lesson literal carried at 4209dad, read with this
     * file's own `lessonLiterals` from `git show HEAD:platform/src/modules/sim/
     * lessons/engine.ts` on 2026-09-17 and frozen here — the gate must not need
     * git to run, and a baseline that moves with HEAD would bless a deletion
     * the moment it is committed. 7 of the 12 literals cited; the other five are
     * the two endings and three cards that never had one.
     *
     * Keyed by the `titleBg` expression as written. `e.titleBg` is the three
     * catalogue-retrieved cards (the pre-drive step and the two coached-fault
     * arms), which share one spelling and so one row with a count.
     *
     * A CHANGED CITATION IS RED ON PURPOSE. ADR-002: a citation is retrieved
     * law, and the one way it may change is deliberately — edit this row in the
     * same diff and say why.
     */
    const LAW_REFS_AT_4209DAD: ReadonlyArray<{ title: string; lawRef: string; count: number }> = [
      { title: `"${LAMPS_TITLE}"`, lawRef: 'refusal.demand === "fog" ? "ЗДвП чл. 74" : "ЗДвП чл. 70"', count: 1 },
      { title: '"Стигна точката на преден ход"', lawRef: '"ЗДвП чл. 40"', count: 1 },
      { title: '"Мина точката твърде бавно"', lawRef: '"ЗДвП чл. 5"', count: 1 },
      { title: '"Излезе от кръговото без десен мигач"', lawRef: '"ЗДвП чл. 25"', count: 1 },
      // Single-quoted ON PURPOSE: law-citations.test.ts reads every double-quoted
      // lawRef value under modules/sim as a citation (comments included), and
      // «e.lawRef» is a source expression, not law. Same string value either way.
      { title: 'e.titleBg', lawRef: 'e.lawRef', count: 3 },
    ];

    /**
     * One property of a literal, as ONE line `key: value,`. Whole-line comments
     * are dropped first. A key that appears in any other shape — a shorthand, a
     * value on the next line, twice — is `unresolved`, and the census FAILS on
     * it rather than reading „no citation" or skipping the card.
     */
    function literalField(text: string, key: "titleBg" | "lawRef"): { value: string | null; unresolved: boolean } {
      const lines = text.split("\n").filter((line) => !/^\s*\/\//.test(line));
      const keyed = lines.filter((line) => new RegExp(`^\\s*${key}\\s*:`).test(line));
      const mentioned = lines.some((line) => new RegExp(`\\b${key}\\b`).test(line));
      if (keyed.length === 0) return { value: null, unresolved: mentioned };
      const m = keyed.length === 1 ? new RegExp(`^\\s*${key}\\s*:\\s*(.+?),?\\s*$`).exec(keyed[0]) : null;
      if (m === null) return { value: null, unresolved: true };
      return { value: m[1].trim(), unresolved: false };
    }

    function lawRefCensus(src: string): string[] {
      const { found, unresolved } = lessonLiterals(src);
      const faults = unresolved.map((line) => `unresolved: engine.ts:${line} — a lesson literal that never closes`);
      const rows = found.map((l) => ({
        line: l.line,
        title: literalField(l.text, "titleBg"),
        lawRef: literalField(l.text, "lawRef"),
      }));
      for (const r of rows) {
        if (r.title.unresolved) faults.push(`unresolved: engine.ts:${r.line} — titleBg is not one readable line`);
        if (r.lawRef.unresolved) faults.push(`unresolved: engine.ts:${r.line} — lawRef is not one readable line`);
      }
      for (const want of LAW_REFS_AT_4209DAD) {
        const titled = rows.filter((r) => r.title.value === want.title);
        if (titled.length < want.count) {
          faults.push(`unresolved: ${want.title} — ${titled.length} lesson literal(s) carry this title, ${want.count} did at 4209dad`);
          continue;
        }
        if (titled.filter((r) => r.lawRef.value === want.lawRef).length >= want.count) continue;
        for (const r of titled.filter((row) => row.lawRef.value !== want.lawRef)) {
          const now = r.lawRef.value === null ? "GONE" : `«${r.lawRef.value}»`;
          faults.push(`engine.ts:${r.line} ${want.title} — lawRef is ${now}, was «${want.lawRef}»`);
        }
      }
      return faults;
    }

    it("engine.ts as it is in the tree: every citation is where it was", () => {
      expect(lawRefCensus(ENGINE_SRC)).toEqual([]);
    });

    it("MUTATION: the lamps card loses its lawRef line (what the follow-up lane did)", () => {
      const regressed = ENGINE_SRC.replace(
        /\n\s*lawRef: refusal\.demand === "fog" \? "ЗДвП чл\. 74" : "ЗДвП чл\. 70",/,
        "",
      );
      expect(regressed).not.toBe(ENGINE_SRC);
      const faults = lawRefCensus(regressed);
      expect(faults.some((f) => f.includes(LAMPS_TITLE) && f.includes("GONE")), faults.join(" · ")).toBe(true);
    });

    it("MUTATION: the fog pairing is flattened to чл. 70", () => {
      const regressed = ENGINE_SRC.replace('"fog" ? "ЗДвП чл. 74" : "ЗДвП чл. 70"', '"fog" ? "ЗДвП чл. 70" : "ЗДвП чл. 70"');
      expect(regressed).not.toBe(ENGINE_SRC);
      const faults = lawRefCensus(regressed);
      expect(faults.some((f) => f.includes(LAMPS_TITLE) && f.includes("lawRef is «")), faults.join(" · ")).toBe(true);
    });

    it("MUTATION: one of the three retrieved cards drops `lawRef: e.lawRef`", () => {
      // Anchored on the LESSON literal: the file's first `lawRef: e.lawRef,` is
      // a `kind: "violation"` object, and deleting that one must (and does)
      // leave this census green — an unanchored edit here was the first draft
      // of this case, and it tested nothing.
      const regressed = ENGINE_SRC.replace(
        /(kind: "lesson",\s*titleBg: e\.titleBg,\s*explanationBg: e\.explanationBg,)\s*lawRef: e\.lawRef,/,
        "$1",
      );
      expect(regressed).not.toBe(ENGINE_SRC);
      const faults = lawRefCensus(regressed);
      expect(faults.some((f) => /e\.titleBg — lawRef is GONE/.test(f)), faults.join(" · ")).toBe(true);
    });

    it("MUTATION: an unreadable shape is reported, not read as „no citation\" — and a retitled card is not silently dropped", () => {
      const split = ENGINE_SRC.replace('lawRef: "ЗДвП чл. 40",', 'lawRef:\n          "ЗДвП чл. 40",');
      expect(split).not.toBe(ENGINE_SRC);
      expect(lawRefCensus(split).some((f) => /^unresolved: engine\.ts:\d+ — lawRef is not one readable line$/.test(f))).toBe(
        true,
      );
      const retitled = ENGINE_SRC.replace(`titleBg: "${LAMPS_TITLE}",`, 'titleBg: "Без светлини",');
      expect(retitled).not.toBe(ENGINE_SRC);
      expect(lawRefCensus(retitled).some((f) => f.startsWith(`unresolved: "${LAMPS_TITLE}"`))).toBe(true);
    });
  });

  describe("the lines engine.ts AUTHORS (the retrieved ones are the catalogue gate's)", () => {
    const authored = found
      .map((l) => {
        const peek = /peekBg: "([^"]+)"/.exec(l.text)?.[1];
        const title = /titleBg: "([^"]+)"/.exec(l.text)?.[1];
        return peek === undefined ? null : { line: l.line, peek, title };
      })
      .filter((x): x is { line: number; peek: string; title: string | undefined } => x !== null);

    it("finds all seven objective cards", () => {
      expect(authored).toHaveLength(7);
      for (const a of authored) expect(a.title, `engine.ts:${a.line}`).toBeDefined();
    });

    it("each is ONE line at the strict budget, and whole under its title — one named exception", () => {
      const over: string[] = [];
      for (const { line, peek, title } of authored) {
        expect(peek.length, `engine.ts:${line} «${peek}»`).toBeLessThanOrEqual(ENGINE_PEEK_MAX_CHARS);
        expect(wrap(peek, ENGINE_PEEK_MAX_CHARS), `engine.ts:${line}`).toHaveLength(1);
        const px = wrap(title!).length * TITLE_LINE_PX + BODY_LINE_PX;
        if (px > WINDOW_PX) over.push(title!);
      }
      // THE RESIDUAL, pinned so it cannot be forgotten OR silently fixed: a
      // three-line title leaves no whole body line in the 44 px floor. When the
      // title is shortened this goes red and the exception is deleted.
      expect(over).toEqual(["Стигна точката, но без светлините, които задачата иска"]);
    });

    it("keeps the catalogue's rules: whole sentence, no figure, no article, no verdict, not the title", () => {
      for (const { line, peek, title } of authored) {
        const where = `engine.ts:${line}`;
        expect(peek.trim(), where).toBe(peek);
        expect(peek, where).toMatch(/[.!?]$/);
        expect(peek, where).not.toMatch(/\d/);
        expect(peek, where).not.toMatch(/(?<!\p{L})(чл|ал)\.|§|Наредба|ЗДвП|ППЗДвП|приложение/iu);
        expect(peek, where).not.toMatch(/^(Правилно|Грешно|Браво|Добре)/);
        expect(title!.includes(peek.replace(/[.!?]$/, "")), where).toBe(false);
      }
      expect(new Set(authored.map((a) => a.peek)).size).toBe(authored.length);
    });

    it("says nothing a variant of its paragraph can contradict", () => {
      // The instructions that are true on ONE tail only (`stillAtTheMark` vs
      // the mark behind) must not be what a variant-blind line says.
      for (const { line, peek } of authored) {
        expect(peek, `engine.ts:${line}`).not.toMatch(/СЕГА|сега|ПРЕДИ|вече|зад теб/);
      }
    });
  });
});
