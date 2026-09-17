/**
 * THE ADVISOR CARD FINISHES ON THE PHONE — `sc-merge-from-property:6715b581`
 * (major, STILL on w49 at 98bf8ae).
 *
 * THE FRAMES: `.audit-frames/w49/frames/sc-merge-from-property__mobile-right/`
 *   04-t090s  «Не дърпай волана — отпусни газта, изправи колелата и се върни под
 *             малък ъгъл: извън платното сцеплението» ↓ ОЩЕ 2 РЕДА
 *   04-t178s  «Съвсем леко назад с прави колела, … в удареното. ([)» ↓ ощ…
 *
 * Both are the ADVISOR row (`card=advisor/peek` in run.log), and both were cut
 * for one reason: `advisorTaskRows` built the whole instruction as `lineBg`,
 * and `SimOverlay` prints a line whole with no summary under it. The repair
 * gives the row the hint card's shape — name, summary, the whole text behind
 * «Прочети» — with the summary authored in `lessons/advisor.ts`.
 *
 * THIS FILE IS THE DEAD-PREDICATE GATE for that field, in three parts:
 *   1. CENSUS — every prompt the module can emit either carries a summary that
 *      fits, or is the objective's own sentence and provably never becomes an
 *      advisor row (the shell's own `foldAdvisorIntoTask` says so, per rung);
 *   2. THE ROW — `advisorOverlayRow` puts the summary where row 2b reads it;
 *   3. THE CHAIN — a live session in the photographed state, through
 *      `snapshotOf` → `lessonQueueBinding` → `advisorTaskRows` →
 *      `selectOverlay` → `SimOverlay`, rendered, with the summary on the glass;
 *      and the mutation that proves this file notices when the row drops it.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { selectOverlay, SimOverlay, type SimOverlayItem } from "@/modules/sim/hud";
import { overlayPeekBodyBg } from "@/modules/sim/hud/overlayQueue";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  createLessonSession,
  routeHoldAdvisorPrompt,
  yieldWaitAdvisorPrompt,
  advisorPromptForPreDriveStep,
  advisorPromptForObjective,
  applyTick,
  type AdvisorPrompt,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
// Deep, and only from a test, on `queueTaskEcho.test.ts`'s precedent: these two
// prompt builders and the two types are not on the lessons barrel, and a census
// that skipped them because the barrel does would be a census of less than the
// module emits.
import { controllerWaitAdvisorPrompt, railPriorityWaitAdvisorPrompt } from "@/modules/sim/lessons/advisor";
import { PRE_DRIVE_STEP_ORDER } from "@/modules/sim/procedures";
import type { ObjectiveEvalState, YieldReason } from "@/modules/sim/lessons/types";
import {
  ADVISOR_ROW_LINE_BG,
  advisorOverlayRow,
  advisorTaskRows,
  foldAdvisorIntoTask,
  lessonQueueBinding,
  snapshotOf,
  type AdvisorTaskFreshness,
} from "../LessonPlayShell";
// The lessons suite's tick builder — the same defaults every engine test drives.
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";

// ---------------------------------------------------------------------------
// The budget and the copy rules
// ---------------------------------------------------------------------------

/**
 * Characters per line of the compact card's body row — the strict figure
 * `lesson-peek-reaches-glass.test.tsx` holds engine-authored summaries to (the
 * w47 verify: 26 is a knife edge). The window is 44 px; the card's name takes
 * one 13.75 px line; two 15.125 px body lines make 44.0. So: two lines.
 */
const LINE_CHARS = 24;
const MAX_LINES = 2;

function wrap(text: string, width = LINE_CHARS): string[] {
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

/**
 * The ONE approval a summary may carry: «Чакаш правилно» followed by who has
 * priority or what the wait is for — a reason, not a verdict word on its own
 * (`YieldVoiceCopy.cardPeekBg`, round 3). The founder's „am I broken?" is
 * answered by the reassurance; THEO-4 is answered by the clause after it.
 */
const REASSURANCE_WITH_REASON = /^Чакаш правилно(?::| —) \p{L}[^.]{8,}\.$/u;

/** Every rule the summary must keep, as one list of broken ones. */
function brokenRules(peek: string): string[] {
  const out: string[] = [];
  const lines = wrap(peek);
  if (lines.length > MAX_LINES) out.push(`${lines.length} lines: ${lines.join(" | ")}`);
  if (lines.some((l) => l.length > LINE_CHARS)) out.push("an unbreakable word wider than a line");
  if (/\d/u.test(peek)) out.push("a figure");
  // Word-anchored: «интервал.» ends in „ал." and is not a citation.
  if (/(?<!\p{L})(?:чл|ал)\.|ЗДвП|ППЗДвП|Наредба/u.test(peek)) out.push("an article");
  if (/грешн/iu.test(peek)) out.push("a bare verdict word");
  if (/правилн/iu.test(peek) && !REASSURANCE_WITH_REASON.test(peek)) out.push("«правилно» without its reason");
  return out;
}

// ---------------------------------------------------------------------------
// 1. Census
// ---------------------------------------------------------------------------

const REASONS: readonly YieldReason[] = [
  "roundaboutEntry",
  "giveWayLine",
  "stopSign",
  "redLight",
  "pedestrian",
  "railVehicle",
  "oncomingVehicle",
];

/** Every prompt this module builds that is NOT an objective title. */
function authoredPrompts(): Array<{ where: string; prompt: AdvisorPrompt }> {
  const out: Array<{ where: string; prompt: AdvisorPrompt }> = [];
  for (const id of PRE_DRIVE_STEP_ORDER) out.push({ where: `preDrive:${id}`, prompt: advisorPromptForPreDriveStep(id) });
  out.push({ where: "routeHold:offRoad", prompt: routeHoldAdvisorPrompt("offRoad") });
  out.push({ where: "routeHold:crashPinned", prompt: routeHoldAdvisorPrompt("crashPinned") });
  out.push({ where: "controller", prompt: controllerWaitAdvisorPrompt() });
  out.push({ where: "railRed", prompt: railPriorityWaitAdvisorPrompt() });
  out.push({ where: "railRed:convicted", prompt: railPriorityWaitAdvisorPrompt(true) });
  for (const r of REASONS) {
    out.push({ where: `yield:${r}`, prompt: yieldWaitAdvisorPrompt(r) });
    out.push({ where: `yield:${r}:convicted`, prompt: yieldWaitAdvisorPrompt(r, undefined, true) });
    out.push({ where: `yield:${r}:long`, prompt: yieldWaitAdvisorPrompt(r, 600) });
  }
  return out;
}

/** The phase states `advisorPromptForObjective` branches on, per objective kind. */
function evalVariants(): Array<ObjectiveEvalState | undefined> {
  const traversed = {
    type: "roundabout",
    entered: true,
    traversalArcDeg: 360,
  } as unknown as ObjectiveEvalState;
  return [undefined, traversed];
}

describe("census — every prompt carries a summary that fits, or can never be an advisor row", () => {
  it("the authored prompts: all of them, all rules", () => {
    const rows = authoredPrompts();
    expect(rows.length).toBe(PRE_DRIVE_STEP_ORDER.length + 5 + REASONS.length * 3);
    const broken: string[] = [];
    for (const { where, prompt } of rows) {
      if (typeof prompt.peekBg !== "string") {
        broken.push(`${where}: NO SUMMARY`);
        continue;
      }
      for (const b of brokenRules(prompt.peekBg)) broken.push(`${where}: ${b} — «${prompt.peekBg}»`);
    }
    expect(broken).toEqual([]);
  });

  it("a CLEAN wait keeps «Чакаш правилно» on the phone, with its reason; the CONVICTED twin approves of nothing", () => {
    // Round 2 shared one line between the two and so could approve of neither —
    // which took the reassurance off the phone for every clean wait while the
    // desktop card kept it. The rule now follows the cards themselves: wherever
    // the whole card says «Чакаш правилно», the phone line says it too, with the
    // reason after it; wherever the card approves of nothing, so does the line.
    const pairs: Array<[string, AdvisorPrompt, AdvisorPrompt]> = [
      ...REASONS.map((r): [string, AdvisorPrompt, AdvisorPrompt] => [
        r,
        yieldWaitAdvisorPrompt(r),
        yieldWaitAdvisorPrompt(r, undefined, true),
      ]),
      ["railRed", railPriorityWaitAdvisorPrompt(), railPriorityWaitAdvisorPrompt(true)],
    ];
    let reassured = 0;
    for (const [where, clean, convicted] of pairs) {
      expect(convicted.textBg, where).not.toMatch(/правилн/u);
      expect(convicted.peekBg, where).not.toMatch(/правилн/u);
      if (/Чакаш правилно/u.test(clean.textBg)) {
        reassured++;
        expect(clean.peekBg, where).toMatch(REASSURANCE_WITH_REASON);
      } else {
        // stopSign: the card cannot certify the stop, and its line may not either.
        expect(clean.peekBg, where).not.toMatch(/правилн/u);
      }
    }
    // Six of the seven duties plus the rail red reassure; the census ran on them.
    expect(reassured).toBe(REASONS.length);
  });

  it("the route-hold lines are an ACT and its REASON — the because-clause of their own card", () => {
    // Round 2 wrote the act alone («Не дърпай волана — върни се под малък ъгъл.»),
    // the order-without-its-why shape 04-t090s was filed for, one tap away.
    const off = routeHoldAdvisorPrompt("offRoad");
    expect(off.peekBg).toMatch(/^Не дърпай волана/u);
    expect(off.peekBg).toContain("сцеплението е друго");
    expect(off.textBg).toContain("сцеплението е друго");
    const pinned = routeHoldAdvisorPrompt("crashPinned");
    expect(pinned.peekBg).toMatch(/назад/u);
    expect(pinned.peekBg).toContain("притиска");
    expect(pinned.textBg).toContain("притиска");
  });

  it("the mirror lines name the LOOK, not a mouse or a hold the phone does not have", () => {
    // advisorPromptForPreDriveStep is handed no device; the line is printed on
    // the phone, where the glances are the „Ляво" / „Дясн" / „Задн" rail cells.
    for (const id of ["adjust-mirrors", "final-mirror-check"] as const) {
      const p = advisorPromptForPreDriveStep(id);
      expect(p.peekBg, id).toMatch(/^Погледни в .*огледал/u);
      expect(p.peekBg, id).not.toMatch(/мишк|клавиш|Задръж|Щракни/iu);
    }
  });

  it("the parkInBay reverse line keeps the stem the audit harness arms its reverse gesture on", () => {
    // tools/mobile/lesson-audit.mjs REVERSE_DEMAND_RE — the mobile legs read the
    // card's peek, and the sheet behind «Прочети» is not in the DOM until opened.
    const bay = {
      kind: "completeManeuver",
      maneuver: "parkInBay",
      holdSec: 1.5,
      bay: { x: 0, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5 },
      centerTolM: 0.5,
      headingTolDeg: 10,
    } as const;
    expect(advisorPromptForObjective("Паркирай", bay).peekBg).toMatch(/Премести лоста на R/u);
  });

  it("every compiled rung: a summary-less prompt is the task's own sentence, and the shell folds it", () => {
    let objectives = 0;
    let summaryLess = 0;
    let summarised = 0;
    const leaks: string[] = [];
    const broken: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        const session = createLessonSession(lesson);
        for (const o of session.objectives) {
          objectives++;
          for (const ev of evalVariants()) {
            const p = advisorPromptForObjective(o.spec.titleBg, o.params, ev, lesson.postedLimitKmh);
            if (p.peekBg === undefined) {
              summaryLess++;
              // THE SHELL'S OWN DECISION, not a mirror of it.
              if (foldAdvisorIntoTask(p.textBg, o.spec.titleBg).advisorSpeaks) {
                leaks.push(`${lesson.id}/${o.spec.id}: «${p.textBg}»`);
              }
            } else {
              summarised++;
              for (const b of brokenRules(p.peekBg)) broken.push(`${lesson.id}/${o.spec.id}: ${b}`);
            }
          }
        }
      }
    }
    // The sweep ran on the catalogue, and both doors were exercised.
    expect(objectives).toBeGreaterThan(1000);
    expect(summaryLess).toBeGreaterThan(0);
    expect(summarised).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
    expect([...new Set(broken)]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. The row
// ---------------------------------------------------------------------------

describe("advisorOverlayRow — the hint card's shape", () => {
  it("04-t090s: name as the line, the summary where row 2b reads it, the whole text one tap away", () => {
    const prompt = routeHoldAdvisorPrompt("offRoad");
    const row = advisorOverlayRow(prompt);
    expect(row.kind).toBe("advisor");
    expect(row.id).toBe(`advisor:${prompt.textBg}`);
    expect(row.lineBg).toBe(ADVISOR_ROW_LINE_BG);
    expect(overlayPeekBodyBg(row)).toBe(prompt.peekBg);
    // Nothing authored is dropped: the reason 04-t090s lost is in the sheet.
    expect(row.detailBg).toBe(prompt.textBg);
    expect(row.detailBg).toContain("спирачният път е по-дълъг");
    expect(row.openLabelBg).toBe("Прочети");
  });

  it("04-t178s: the key chip rides in the sheet, not in the two lines", () => {
    const prompt = routeHoldAdvisorPrompt("crashPinned");
    const row = advisorOverlayRow(prompt);
    expect(row.peekBg).not.toContain("[");
    expect(row.detailBg).toBe(`${prompt.textBg} ([)`);
  });

  it("a sentence that already fits does not grow a button that opens itself", () => {
    const prompt = advisorPromptForPreDriveStep("start-engine");
    expect(prompt.peekBg).toBe(prompt.textBg);
    const row = advisorOverlayRow({ ...prompt, keys: [] });
    expect(row.detailBg).toBeNull();
    expect(overlayPeekBodyBg(row)).toBe(prompt.textBg);
  });

  it("a hand-built prompt with no summary renders as the card it always was", () => {
    const row = advisorOverlayRow({ textBg: "Спри", keys: ["S"] });
    expect(row).toEqual({ id: "advisor:Спри", kind: "advisor", tone: "neutral", lineBg: "Спри (S)" });
  });
});

// ---------------------------------------------------------------------------
// 3. The chain, from a live session to the rendered card
// ---------------------------------------------------------------------------

const FRESH: AdvisorTaskFreshness = { advisorFresh: true, praiseFresh: false, taskFresh: true, flash: null };

/** sc-merge-from-property L1 — the photographed lesson — with the car off the carriageway. */
function offTheRoad() {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-merge-from-property");
  expect(spec).toBeDefined();
  let s = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  expect(s.phase).toBe("driving");
  // `edgeId: null` — the runtime's own „past the kerb" (an absent field would be
  // innocent, which is the rule both the grader and the hold keep).
  for (let t = 0; t <= 6; t += 0.25) {
    s = applyTick(s, makeTick({ t, speedKmh: 12, position: { x: 3, y: 40 + t }, edgeId: null })).state;
  }
  return s;
}

function glass(rows: (SimOverlayItem | null)[]) {
  const sel = selectOverlay(rows);
  return {
    active: sel.active,
    html: renderToStaticMarkup(createElement(SimOverlay, { item: sel.active, queued: sel.queued })),
  };
}

function phoneRows(prompt: "live" | { mutate: (row: SimOverlayItem) => SimOverlayItem }) {
  const snap = snapshotOf(offTheRoad(), null);
  const binding = lessonQueueBinding({
    snap,
    advisorOn: true,
    examMode: false,
    mistakeMode: false,
    ended: false,
    compact: true,
    taskPing: 0,
    lessonDescriptionBg: "",
    governorCapKmh: null,
  });
  const rows = advisorTaskRows(binding.rows, FRESH);
  if (prompt !== "live" && rows[0] !== null) rows[0] = prompt.mutate(rows[0]);
  return { snap, rows };
}

describe("END TO END — the off-road card, from applyTick to the glass", () => {
  it("the premise: the session is in the photographed state and the advisor row is built", () => {
    const { snap, rows } = phoneRows("live");
    expect(snap.objectiveHold).toBe("offRoad");
    expect(snap.advisorPrompt?.textBg).toBe(routeHoldAdvisorPrompt("offRoad").textBg);
    expect(rows[0]).not.toBeNull();
  });

  it("the card on the glass is the advisor's, and its body row is the summary — whole", () => {
    const { snap, rows } = phoneRows("live");
    const seen = glass(rows);
    expect(seen.active?.kind).toBe("advisor");
    const body = /data-sim-overlay-body=""[^>]*>([^<]*)</u.exec(seen.html);
    expect(body, "row 2b must render").not.toBeNull();
    expect(body![1]).toBe(snap.advisorPrompt!.peekBg);
    expect(seen.html).toContain(ADVISOR_ROW_LINE_BG);
    // The two lines the frame could not finish are not what row 2 prints now.
    expect(seen.html).not.toContain("извън платното сцеплението");
  });

  it("MUTATION: a row that drops the summary puts the cut paragraph back — and this file sees it", () => {
    const { rows } = phoneRows({
      mutate: (row) => ({ id: row.id, kind: row.kind, tone: row.tone, lineBg: row.detailBg ?? row.lineBg }),
    });
    const seen = glass(rows);
    expect(/data-sim-overlay-body=""/u.test(seen.html)).toBe(false);
    expect(seen.html).toContain("извън платното сцеплението");
  });
});
