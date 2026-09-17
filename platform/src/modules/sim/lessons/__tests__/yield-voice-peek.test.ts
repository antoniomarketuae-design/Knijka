/**
 * THE INSTRUCTOR'S VOICE PRINTS A LINE THE PHONE CAN FINISH —
 * `sc-merge-from-property:6715b581`, the hint-card half.
 *
 * THE FRAME: `.audit-frames/w47/frames/sc-merge-from-property__mobile-right/
 * 04-t027s.png`, iPhone 16 landscape, the student standing at the zebra —
 *
 *     Защо чакаш: пешеходец на
 *     пътеката
 *     Правилно е да чакаш тук. При        ← the approval, cut before the reason
 *     преди 5 с
 *     ЗАЩО ↓17   ✕
 *
 * The violation card was repaired by `peekBg` and the teach moment by
 * `teachMomentPeekBg`; the yield voice's `lesson` notices had no summary at
 * all, so `SimOverlay` row 2b (`overlayPeekBodyBg`) fell through to the whole
 * paragraph and clamped it. `advisor.ts` now authors one per stage.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, stated so nobody reads it as more. It
 * proves every notice the voice emits carries a summary, that each summary
 * fits WHOLE in the peek's floor window under its own title, that the copy
 * keeps ADR-002 and the file's pose honesty, and that the field survives the
 * live `engine.applyTick` path into `hudEvents` intact. It does NOT prove the
 * glass changes: that needs `contracts.ts` to declare `peekBg` on the `lesson`
 * member and `LessonPlayShell`'s `lesson` → `hint` re-map to forward it, and
 * neither is this lane's file.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createYieldVoice, stepYieldVoice, type YieldVoiceNotice } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { createYieldWait } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { HudEvent } from "../../contracts";
import type { YieldReason, YieldWaitState } from "../types";
import { makeTick } from "./fixtures";

/* ── The window, re-cut from the literals `violation-title-fits-peek.test.ts`
      and `violation-peek-summary.test.tsx` use, so the three cannot drift. ── */

/** px. The peek's text-window floor (`SimOverlay` `minHeight: "2.75rem"`). */
const WINDOW_PX = 2.75 * 16;
/** px. 11 px at `leading-tight` — one line of `lineBg`. */
const TITLE_LINE_PX = 13.75;
/** px. 11 px at `leading-snug` — one line of the body row. */
const BODY_LINE_PX = 15.125;
/** Characters one line of the compact card holds — the siblings' proxy. */
const PEEK_LINE_CHARS = 26;

const OVERLAY_SRC = readFileSync(resolve(__dirname, "../../hud/SimOverlay.tsx"), "utf8");

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

const REASONS: readonly YieldReason[] = [
  "giveWayLine",
  "stopSign",
  "redLight",
  "pedestrian",
  "roundaboutEntry",
  "railVehicle",
  "oncomingVehicle",
];

interface Episode {
  label: string;
  reason: YieldReason;
  named: YieldVoiceNotice;
  settled: YieldVoiceNotice;
  verdict: YieldVoiceNotice;
}

/**
 * One clean wait, all three stages: settle, hold past the settle mark, pull
 * away, and roll the verdict window out. The timings are the voice's own
 * (1.2 s name, 10 s settle, 4 s verdict); nothing here is graded.
 */
function episode(reason: YieldReason, railPriority = false): Episode {
  const held: YieldWaitState = {
    holding: true,
    sinceSec: 0,
    reason,
    pedestrianCrossingIds: [],
  };
  const free = createYieldWait();
  const said: YieldVoiceNotice[] = [];
  let v = createYieldVoice();
  const frames: Array<{ t: number; speedKmh: number; wait: YieldWaitState }> = [
    { t: 2, speedKmh: 0, wait: held },
    { t: 11, speedKmh: 0, wait: held },
    { t: 12, speedKmh: 9, wait: free },
    { t: 16, speedKmh: 12, wait: free },
  ];
  for (const f of frames) {
    const step = stepYieldVoice(v, { ...f, violations: [], railPriority });
    said.push(...step.notices);
    v = step.state;
  }
  // Thrown rather than `expect`ed: this runs while the suite is being COLLECTED,
  // and a wait that did not speak all three stages is a broken fixture, not a
  // failed assertion about copy.
  if (said.length !== 3) {
    throw new Error(`${reason}${railPriority ? " (rails)" : ""}: expected 3 notices, got ${said.length}`);
  }
  return {
    label: `${reason}${railPriority ? "+rails" : ""}`,
    reason,
    named: said[0],
    settled: said[1],
    verdict: said[2],
  };
}

const EPISODES: readonly Episode[] = [
  ...REASONS.map((r) => episode(r)),
  // The rail-red copy is a different record with its own three titles.
  episode("redLight", true),
];

const EVERY_NOTICE = EPISODES.flatMap((e) =>
  (["named", "settled", "verdict"] as const).map((stage) => ({
    where: `${e.label}/${stage}`,
    reason: e.reason,
    stage,
    notice: e[stage],
  })),
);

describe("every line the yield voice speaks carries a summary", () => {
  it("covers all seven reasons plus the rail-red record — twenty-four notices", () => {
    expect(EVERY_NOTICE).toHaveLength(24);
    for (const { where, notice } of EVERY_NOTICE) {
      expect(notice.kind, where).toBe("lesson");
      expect(typeof notice.peekBg, where).toBe("string");
      expect(notice.peekBg.trim().length, where).toBeGreaterThan(0);
    }
  });

  it("…and the summary is the stage's own, never another stage's", () => {
    for (const e of EPISODES) {
      const peeks = new Set([e.named.peekBg, e.settled.peekBg, e.verdict.peekBg]);
      expect(peeks.size, e.label).toBe(3);
    }
  });
});

describe("the summary fits WHOLE in the floor window under its own title", () => {
  it("still measures the window the arithmetic is cut from", () => {
    expect(OVERLAY_SRC).toContain('minHeight: "2.75rem"');
  });

  it("title lines × 13.75 + summary lines × 15.125 ≤ 44 px, for every stage", () => {
    const over = EVERY_NOTICE.map(({ where, notice }) => {
      const titleLines = wrap(notice.titleBg).length;
      const bodyLines = wrap(notice.peekBg).length;
      return { where, titleLines, bodyLines, px: titleLines * TITLE_LINE_PX + bodyLines * BODY_LINE_PX, notice };
    })
      .filter((r) => r.px > WINDOW_PX)
      .map(
        (r) =>
          `${r.where}: ${r.titleLines}+${r.bodyLines} lines = ${r.px} px — «${r.notice.titleBg}» / «${r.notice.peekBg}»`,
      );
    expect(over).toEqual([]);
  });

  it("the FULL paragraph would not — so the summary is doing work on every stage", () => {
    // The guard against a summary nobody needed: if a body ever shrinks to fit
    // the window on its own, this names it and the peek can be retired there.
    for (const { where, notice } of EVERY_NOTICE) {
      const px =
        wrap(notice.titleBg).length * TITLE_LINE_PX + wrap(notice.explanationBg).length * BODY_LINE_PX;
      expect(px, where).toBeGreaterThan(WINDOW_PX);
    }
  });
});

describe("what the one line may say", () => {
  it("is a whole sentence — the defect was a cut one", () => {
    for (const { where, notice } of EVERY_NOTICE) {
      expect(notice.peekBg.trim(), where).toBe(notice.peekBg);
      expect(notice.peekBg, where).toMatch(/[.!?]$/);
      expect(notice.peekBg, where).not.toMatch(/…|\.\.\.$|[,—-]\s*$/);
    }
  });

  it("carries no citation and no figure — ADR-002 keeps both in the body and lawRef", () => {
    for (const { where, notice } of EVERY_NOTICE) {
      // `(?<!\p{L})` and not the siblings' bare `ал\.`: that one matches the
      // last three letters of «интервал.», and `\b` is ASCII-only, so it cannot
      // tell a Cyrillic word ending from an abbreviation.
      expect(notice.peekBg, where).not.toMatch(/(?<!\p{L})(чл|ал)\.|§|Наредба|ЗДвП|ППЗДвП|приложение/iu);
      expect(notice.peekBg, where).not.toMatch(/\d/);
      // The article stays on the notice itself.
      expect(notice.lawRef, where).toBeTruthy();
    }
  });

  it("is a summary, not the paragraph, and not the title the card already prints", () => {
    for (const { where, notice } of EVERY_NOTICE) {
      expect(notice.peekBg.length, where).toBeLessThan(notice.explanationBg.length);
      expect(notice.peekBg, where).not.toBe(notice.titleBg);
      expect(notice.titleBg.includes(notice.peekBg.replace(/[.!?]$/, "")), where).toBe(false);
    }
  });

  it("is never a bare approval — the title names the wait; the line gives the reason", () => {
    for (const { where, notice } of EVERY_NOTICE) {
      expect(notice.peekBg, where).not.toMatch(/^(Правилно|Грешно|Браво|Добре|Спрял си)/);
    }
  });

  it("does not certify a Б2 stop this module cannot see (sc-merge-from-property:ab353b86)", () => {
    for (const { where, reason, notice } of EVERY_NOTICE) {
      if (reason !== "stopSign") continue;
      expect(notice.peekBg, where).not.toMatch(/направен|изпълнен|спрял си|спря правилно/i);
    }
  });

  it("does not tell the rail-red student the tram has gone", () => {
    const rails = EPISODES.find((e) => e.label === "redLight+rails");
    expect(rails).toBeDefined();
    expect(rails?.verdict.peekBg).not.toMatch(/пропусна|отмина|премина|мина/i);
  });

  it("the officer's exception rides the red-light lines that have room for it", () => {
    const red = EPISODES.find((e) => e.label === "redLight");
    expect(red?.named.peekBg).toMatch(/Регулировчик/);
    expect(red?.settled.peekBg).toMatch(/Регулировчик/);
  });
});

describe("the field survives the LIVE engine path into hudEvents", () => {
  // The founder's roundabout drill, the same geometry `yield-voice.test.ts`
  // drives: this is `engine.applyTick`, the fold `LessonPlayShell` calls every
  // tick, not the pure step in isolation.
  const LESSON = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
  const LANE_X = 4.06;
  const PAINT_Y = -35.725;

  it("the named notice reaches hudEvents with its summary attached", () => {
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: -50 }, speedKmh: 18 })).state;
    const said: HudEvent[] = [];
    let t = 0.1;
    for (let i = 0; i < 20; i++) {
      t = +(t + 0.1).toFixed(1);
      const step = applyTick(s, makeTick({ t, position: { x: LANE_X, y: PAINT_Y }, speedKmh: 0 }));
      s = step.state;
      said.push(...step.hudEvents.filter((e) => e.kind === "lesson"));
    }
    expect(said.length).toBeGreaterThan(0);
    const first = said[0] as HudEvent & { peekBg?: unknown };
    expect(first.kind).toBe("lesson");
    expect(typeof first.peekBg).toBe("string");
    expect(first.peekBg).toBe(episode("roundaboutEntry").named.peekBg);
  });
});
