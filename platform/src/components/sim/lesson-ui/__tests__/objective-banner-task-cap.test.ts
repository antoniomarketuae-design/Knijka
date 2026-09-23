/**
 * =============================================================================
 * «SAY IT IN THE BANNER» — founder ruling 2026-09-22, row sc-ac-truck-spray:d1119d8f
 * =============================================================================
 *
 * THE FRAME: `.audit-frames/w37/frames/sc-ac-truck-spray__pc-wrong/04-t060s.png`
 * — «ЗАДАЧА 1/2 Мини пелената със съобразена скорост и дистанция · 140 ·
 * задачата иска ≤80 — по-строгото важи». The 80 gates `capMet`, `capMet` gates
 * the credit, and the banner — the surface that states the task — never named
 * it. The ruling: when an objective's own cap is stricter than the posted limit
 * and gates the credit, the banner states it, the way the advisor's capped
 * cards do. It overrides «don't show the task speed twice» for the banner.
 *
 * Everything here is RUN: the rule over the whole catalogue, a real compiled
 * session through `snapshotOf`, the banner rendered, and the two call sites in
 * the shell read as trees (`callSiteShape.ts`) — a prop is an argument list
 * with angle brackets and neutralises the same way.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  advisorPromptForObjective,
  compileScenario,
  createLessonSession,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { ObjectiveBanner, objectiveLineWithTaskCap } from "@/modules/sim/hud";
import {
  advisorEchoTrim,
  advisorTaskRows,
  bannerObjectiveLineBg,
  lessonQueueBinding,
  snapshotOf,
  taskCapKmhFromPrompt,
  type HudSnapshot,
  type LessonQueueState,
} from "../LessonPlayShell";
import { callSitesOf, jsxPropsOf } from "./callSiteShape";

const SHELL_SRC = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

const TRUCK_TITLE = "Мини пелената със съобразена скорост и дистанция";

/** The 95-character phone band the advisor's capped cards are held to
 *  (`lessons/__tests__/advisor-authored-cap.test.ts`, longest card 94). */
const PHONE_BAND_CHARS = 95;
/** The banner's reading line (`objective-banner-surface.test.tsx`: 312 px of
 *  content, 45 mono → 65 sans characters). It wraps; two lines is the ceiling. */
const BANNER_LINE_CHARS = 65;

/** A tick on the given posted limit — `snapshotOf` reads `maxSpeedKmh` off it. */
const tickAt = (maxSpeedKmh: number) =>
  ({
    speedKmh: 60,
    maxSpeedKmh,
    gear: 1,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    position: { x: 0, y: 0 },
    headingDeg: 0,
  }) as never;

function drivingSession(id: string) {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === id);
  expect(spec).toBeDefined();
  const s = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  expect(s.phase).toBe("driving");
  return s;
}

interface Row {
  id: string;
  titleBg: string;
  promptBg: string;
  cap: number | undefined;
  limit: number;
  floor: number | undefined;
  line: string;
}

/** Every capped reachZone in the catalogue, through the SAME chain the shell
 *  runs: advisor sentence → `taskCapKmhFromPrompt` → the banner rule. Where a
 *  lesson declares no posted limit the shell's own default (50) stands in. */
function everyCappedObjective(): Row[] {
  const out: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level as ScenarioLevel);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const p = o.params as { maxSpeedKmh?: number; minSpeedKmh?: number };
        if (p.maxSpeedKmh === undefined) continue;
        const authored = (o.params as Record<string, unknown>)["authoredMaxSpeedKmh"];
        const promptBg = advisorPromptForObjective(
          o.titleBg,
          { kind: "reachZone", ...(o.params as object) } as never,
          undefined,
          lesson.postedLimitKmh,
          typeof authored === "number" ? authored : undefined,
        ).textBg;
        const cap = taskCapKmhFromPrompt({ textBg: promptBg, keys: [] } as never);
        const limit = lesson.postedLimitKmh ?? 50;
        out.push({
          id: `${lesson.id}/${o.id}`,
          titleBg: o.titleBg,
          promptBg,
          cap,
          limit,
          floor: p.minSpeedKmh,
          line: objectiveLineWithTaskCap(o.titleBg, cap, limit, p.minSpeedKmh)!,
        });
      }
    }
  }
  return out;
}

describe("the rule, one case at a time", () => {
  it("states a binding stricter cap in the advisor's own words", () => {
    expect(objectiveLineWithTaskCap(TRUCK_TITLE, 80, 140)).toBe(
      `${TRUCK_TITLE} — дръж под 80 км/ч`,
    );
  });

  it("carries the authored floor where the gate refuses below it", () => {
    expect(objectiveLineWithTaskCap("Мини участъка", 50, 90, 35)).toBe(
      "Мини участъка — не под 35 и дръж под 50 км/ч",
    );
    // …and not a floor at or above the cap (the advisor's same condition).
    expect(objectiveLineWithTaskCap("Мини участъка", 50, 90, 50)).toBe(
      "Мини участъка — дръж под 50 км/ч",
    );
  });

  it("stays silent where the cap is not stricter than the sign", () => {
    expect(objectiveLineWithTaskCap(TRUCK_TITLE, 140, 140)).toBe(TRUCK_TITLE);
    expect(objectiveLineWithTaskCap(TRUCK_TITLE, 150, 140)).toBe(TRUCK_TITLE);
  });

  it("stays silent with no cap, and passes a null objective through", () => {
    expect(objectiveLineWithTaskCap(TRUCK_TITLE, undefined, 140)).toBe(TRUCK_TITLE);
    expect(objectiveLineWithTaskCap(null, 80, 140)).toBeNull();
  });

  it("does not say the title's own number twice", () => {
    expect(objectiveLineWithTaskCap("Мини зоната 30 под 30 км/ч", 30, 50)).toBe(
      "Мини зоната 30 под 30 км/ч",
    );
    expect(objectiveLineWithTaskCap("Влез в зона 30 вече под ограничението", 30, 50)).toBe(
      "Влез в зона 30 вече под ограничението",
    );
  });

  it("never speaks a figure above the one it was given", () => {
    expect(objectiveLineWithTaskCap("Мини", 54.5, 90)).toBe("Мини — дръж под 54 км/ч");
  });
});

describe("the filed lesson, through a real session", () => {
  const snap = snapshotOf(drivingSession("sc-ac-truck-spray"), tickAt(140));

  it("the snapshot carries the 80 the gate grades on, beside the 140 disc", () => {
    expect(snap.objectiveTitle).toBe(TRUCK_TITLE);
    expect(snap.limitKmh).toBe(140);
    expect(snap.taskCapKmh).toBe(80);
  });

  it("the banner's sentence names it", () => {
    expect(bannerObjectiveLineBg(snap)).toBe(`${TRUCK_TITLE} — дръж под 80 км/ч`);
  });

  it("…and the advisor card, now a pure echo of the banner, does not render", () => {
    expect(snap.advisorPrompt?.textBg).toBe(`${TRUCK_TITLE} — дръж под 80 км/ч`);
    expect(advisorEchoTrim(snap.advisorPrompt!.textBg, bannerObjectiveLineBg(snap))).toBeNull();
  });

  it("the rendered banner prints the figure, bound against the wrap", () => {
    const html = renderToStaticMarkup(
      createElement(ObjectiveBanner, {
        titleBg: bannerObjectiveLineBg(snap),
        index: 1,
        total: 2,
        progress: null,
        flash: null,
      }),
    );
    expect(html).toContain("дръж под ");
    expect(html).toMatch(/<span style="white-space:nowrap">80 км\/ч<\/span>/u);
  });

  it("the floor reaches the snapshot on the one gate that authors one", () => {
    const night = snapshotOf(drivingSession("sc-ac-night-overdrive"), tickAt(90));
    expect(night.taskFloorKmh).toBe(35);
    expect(bannerObjectiveLineBg(night)).toBe(night.advisorPrompt?.textBg);
    expect(snap.taskFloorKmh).toBeUndefined();
  });
});

describe("the class — every capped objective in the catalogue", () => {
  const rows = everyCappedObjective();
  const stricter = rows.filter((r) => r.cap !== undefined && r.cap < r.limit);
  const stated = stricter.filter((r) => r.line !== r.titleBg);

  it("has a catalogue to sweep", () => {
    expect(rows.length).toBeGreaterThan(900);
    // MEASURED 2026-09-22: 963 capped, 790 stricter than the sign, 743 get the
    // tail, 47 already state the figure in the title. Floors, not counts —
    // titles are authored copy and must not redden this when one is edited.
    expect(stricter.length).toBeGreaterThan(700);
    expect(stated.length).toBeGreaterThan(650);
  });

  it("every binding stricter cap is on the banner — in the tail or the title", () => {
    const silent = stricter
      .filter((r) => !new RegExp(`(?:${r.cap} км/ч|зона\\s*${r.cap}\\b)`, "u").test(r.line))
      .map((r) => `${r.id}: cap ${r.cap} under ${r.limit}, banner «${r.line}»`);
    expect(silent).toEqual([]);
  });

  it("the banner says exactly the advisor's sentence — one number, one wording", () => {
    const drift = stated
      .filter((r) => r.line !== r.promptBg)
      .map((r) => `${r.id}: banner «${r.line}» vs card «${r.promptBg}»`);
    expect(drift).toEqual([]);
  });

  it("…so the roomy advisor card never prints it a second time", () => {
    const echoes = stated
      .filter((r) => advisorEchoTrim(r.promptBg, r.line) !== null)
      .map((r) => r.id);
    expect(echoes).toEqual([]);
  });

  it("the other direction: a cap at or above the sign never reaches the banner", () => {
    const loud = rows
      .filter((r) => (r.cap === undefined || r.cap >= r.limit) && r.line !== r.titleBg)
      .map((r) => `${r.id}: «${r.line}»`);
    expect(loud).toEqual([]);
  });

  it("stays inside the phone band and the banner's two reading lines", () => {
    const over = stated
      .filter((r) => r.line.length >= PHONE_BAND_CHARS || r.line.length > 2 * BANNER_LINE_CHARS)
      .map((r) => `${r.id}: ${r.line.length} ch`);
    expect(over).toEqual([]);
  });
});

describe("the shell reads the rule at both call sites", () => {
  it("the banner mount prints the capped line under the route hold", () => {
    const mounts = jsxPropsOf(SHELL_SRC, "ObjectiveBanner");
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.titleBg).toBe(
      "objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold)",
    );
  });

  it("the roomy advisor card is trimmed against the SAME line", () => {
    const inComponent = callSitesOf(SHELL_SRC, ["advisorEchoTrim"]).filter(
      (c) => c.args[0] === "snap.advisorPrompt.textBg",
    );
    expect(inComponent).toHaveLength(1);
    expect(inComponent[0]!.args[1]).toBe("bannerObjectiveLineBg(snap)");
  });

  it("MUTATION — the mount reverted to the bare title is rejected", () => {
    const mutated = SHELL_SRC.replace(
      "titleBg={objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold)}",
      "titleBg={objectiveTitleUnderHold(snap.objectiveTitle, snap.objectiveHold)}",
    );
    expect(mutated).not.toBe(SHELL_SRC);
    expect(jsxPropsOf(mutated, "ObjectiveBanner")[0]!.titleBg).not.toBe(
      "objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold)",
    );
  });
});

/**
 * =============================================================================
 * THE PHONE'S TASK ROW — round 2 of the same ruling
 * =============================================================================
 *
 * The round-1 verifier (not refuted): the ruling reached the DESKTOP banner
 * only. The phone has no banner — the task is stated by the queue's task row
 * (`taskOverlayRow`) — and `advisorTaskFold` cleared the row's «дръж под 80 км/ч»
 * detail whenever the strip printed the same number (`advisorCapEchoesStrip`),
 * so a mobile leg of sc-ac-truck-spray still stated the task without the 80.
 * The ruling's reason — the number the student is graded on appears where the
 * task is stated — applies to that row too, so `lessonQueueBinding` builds the
 * row's line from `bannerObjectiveLineBg`, and the fold trims against it.
 *
 * Everything here drives the binding the render spends (`lessonQueueBinding` →
 * `advisorTaskRows`), with snapshots off a real compiled session.
 */
const phoneState = (snap: HudSnapshot, over: Partial<LessonQueueState> = {}): LessonQueueState => ({
  snap,
  advisorOn: true,
  examMode: false,
  mistakeMode: false,
  ended: false,
  compact: true,
  taskPing: 0,
  lessonDescriptionBg: "Виж какво става",
  // A governor printing a ceiling — the reading where the strip says
  // «задачата иска ≤80» and the round-1 fold cleared the row's copy.
  governorCapKmh: 150,
  ...over,
});
const FRESH = { advisorFresh: true, praiseFresh: false, taskFresh: true, flash: null };

describe("the phone's task row states the binding cap — the filed lesson", () => {
  const snap = snapshotOf(drivingSession("sc-ac-truck-spray"), tickAt(140));

  it("the row the phone paints names the 80, with the strip printing it too", () => {
    const binding = lessonQueueBinding(phoneState(snap));
    const [, taskRow] = advisorTaskRows(binding.rows, FRESH);
    expect(taskRow?.kind).toBe("task");
    expect(taskRow?.lineBg).toBe(`${TRUCK_TITLE} — дръж под 80 км/ч`);
    // …once: the fold reads the same sentence, so no detail repeats it.
    expect(taskRow?.detailBg ?? null).toBeNull();
    expect(taskRow?.chipBg).toBe("Задача 1/2");
  });

  it("the same sentence the banner prints, byte for byte", () => {
    expect(lessonQueueBinding(phoneState(snap)).taskLineBg).toBe(bannerObjectiveLineBg(snap));
  });

  it("not gated on «Съветник», exactly as the banner is not", () => {
    const off = lessonQueueBinding(phoneState(snap, { advisorOn: false }));
    expect(off.taskLineBg).toBe(`${TRUCK_TITLE} — дръж под 80 км/ч`);
    expect(off.fold.taskDetailBg).toBeNull();
  });

  it("the micro-menu recall and the announce key carry it (both read `taskLineBg`)", () => {
    expect(lessonQueueBinding(phoneState(snap)).taskKey).toContain("дръж под 80 км/ч");
  });

  it("under a route hold the condition still goes in front, and the cap stays on", () => {
    // `objectiveTitleUnderHold` wraps the CAPPED line, exactly as on the banner
    // (sc-junction-blind:c5ba8f17): a car that cannot obey the task is told the
    // condition first, and the task it returns to still names its number.
    const held = lessonQueueBinding(phoneState({ ...snap, objectiveHold: "offRoad" }));
    expect(held.taskLineBg).toBe(
      `Колата е извън пътя — върни се на платното, за да продължиш: ${TRUCK_TITLE} — дръж под 80 км/ч`,
    );
    expect(held.fold.taskDetailBg).toBeNull();
  });

  it("the mistake sandbox keeps its own line — the ruling is about graded tasks", () => {
    const sandbox = lessonQueueBinding(phoneState(snap, { mistakeMode: true }));
    expect(sandbox.taskLineBg).toBe("Виж какво става");
  });

  it("NEGATIVE CONTROL — a cap at or above the sign leaves the bare title on the row", () => {
    const loose = { ...snap, limitKmh: 80 };
    expect(lessonQueueBinding(phoneState(loose)).taskLineBg).toBe(TRUCK_TITLE);
  });

  it("the floor travels to the phone too, on the one gate that authors one", () => {
    const night = snapshotOf(drivingSession("sc-ac-night-overdrive"), tickAt(90));
    const b = lessonQueueBinding(phoneState(night));
    expect(b.taskLineBg).toBe(night.advisorPrompt?.textBg);
    expect(b.taskLineBg).toMatch(/не под 35 и дръж под \d+ км\/ч$/u);
    expect(b.fold.taskDetailBg).toBeNull();
  });
});

describe("the phone's task row — every capped objective in the catalogue", () => {
  const rows = everyCappedObjective();
  const base = snapshotOf(drivingSession("sc-ac-truck-spray"), tickAt(140));
  const phoneLine = (r: Row) => {
    const snap: HudSnapshot = {
      ...base,
      objectiveTitle: r.titleBg,
      taskCapKmh: r.cap,
      limitKmh: r.limit,
      taskFloorKmh: r.floor,
      objectiveHold: null,
      advisorPrompt: { textBg: r.promptBg, keys: [] } as never,
    };
    return lessonQueueBinding(phoneState(snap));
  };

  it("the phone row says what the banner says, on every capped objective", () => {
    const drift = rows
      .filter((r) => phoneLine(r).taskLineBg !== r.line)
      .map((r) => `${r.id}: phone «${phoneLine(r).taskLineBg}» vs banner «${r.line}»`);
    expect(drift).toEqual([]);
  });

  it("…never with the figure a second time as the detail", () => {
    const twice = rows
      .filter((r) => r.line !== r.titleBg && phoneLine(r).fold.taskDetailBg !== null)
      .map((r) => `${r.id}: detail «${phoneLine(r).fold.taskDetailBg}»`);
    expect(twice).toEqual([]);
  });

  it("inside the 95-character phone band the advisor's cards were held to on this row", () => {
    // The row's line window scrolls, but the band is the one measured off the
    // deployed phone for these exact sentences when they rode this row as the
    // advisor's `lineBg` (`advisor-authored-cap.test.ts`, longest card 94).
    const over = rows
      .map((r) => phoneLine(r).taskLineBg ?? "")
      .filter((l) => l.length >= PHONE_BAND_CHARS);
    expect(over).toEqual([]);
  });
});
