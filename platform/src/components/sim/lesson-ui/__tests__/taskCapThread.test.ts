/**
 * =============================================================================
 * O51 — THE DRILL'S OWN CEILING REACHES THE GLASS, AND IT IS THE NUMBER THE
 * STUDENT WAS TOLD.  Sweep 161, round 11.
 * =============================================================================
 *
 * THE FRAMES, opened before anything was changed:
 *
 *   sc-zebra-approach/mobile-right/04-t087s  instruction «под 40 км/ч» · В26
 *                                            disc 50 · «РЕЖИМ Нормален ≤60»
 *   sc-vp-stall/pc-wrong/04-t012s            sign 50 · mode chip 60 · teach card
 *                                            «не повече от 55 км/ч» — filed as
 *                                            „the student has no way to know
 *                                            which number is being graded"
 *
 * `hud/StatusDashboard.tsx` published `taskCapKmh` and could not spend it;
 * `LessonPlayShell.tsx` now threads it. The routing note asked for
 * `reachZone.maxSpeedKmh` verbatim and this thread deliberately does not pass
 * that number — the census in `taskCapKmhFromPrompt`'s own docstring is why, and
 * the first block below is that census, re-measured here rather than quoted, so
 * it fails if the catalogue moves under it.
 *
 * WHY EVERY ASSERTION IS RUN AND NOT GREPPED. The one grep in this file is the
 * two mounts, which is cross-file routing state and the established
 * `touchHintLifetime.ts` discipline (§7 B-R10 blessed exactly this usage for
 * exactly this pair). Everything that could be faked by a literal is driven:
 * the extractor over all 953 capped cards of the shipped catalogue, and the bar
 * itself rendered on both sides of the boundary.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  advisorPromptForObjective,
  compileScenario,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { GovernorCapMark } from "@/modules/sim/hud/StatusDashboard";
import { taskCapKmhFromPrompt } from "../LessonPlayShell";

/**
 * The template's own pre-grace figure, as `advisor.ts authoredCapOf` reads it.
 *
 * The key constant (`AUTHORED_MAX_SPEED_PARAM_KEY`) is module-private to
 * `lessons/scenario/compile.ts` and is deliberately NOT on the public surface —
 * `parseObjectiveParams` drops it so a coaching number can never reach the
 * grader. Spelled out here because a test may read a raw compiled record; the
 * PRODUCT may not, which is the whole reason `taskCapKmhFromPrompt` reads the
 * sentence instead.
 */
const AUTHORED_KEY = "authoredMaxSpeedKmh";

interface Card {
  lessonId: string;
  objectiveId: string;
  titleBg: string;
  /** The gate: `maxSpeedKmh` AFTER `widenSpeedCap` folded the rung's grace in. */
  gateKmh: number;
  textBg: string;
}

/**
 * Every capped `reachZone` objective in the shipped catalogue, with the sentence
 * the advisor builds for it.
 *
 * `advisorPromptForObjective` is the function `advisorPromptForSession`
 * delegates to for a live driving objective — same five arguments, same order —
 * so the string measured here is the string the shell's snapshot carries.
 */
function everyCappedCard(): Card[] {
  const out: Card[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level as ScenarioLevel);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const gateKmh = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (gateKmh === undefined) continue;
        const rawAuthored = (o.params as Record<string, unknown>)[AUTHORED_KEY];
        out.push({
          lessonId: lesson.id,
          objectiveId: o.id,
          titleBg: o.titleBg,
          gateKmh,
          textBg: advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
            typeof rawAuthored === "number" ? rawAuthored : undefined,
          ).textBg,
        });
      }
    }
  }
  return out;
}

/** Every objective in the catalogue that carries NO speed contract at all. */
function everyUncappedCard(): { titleBg: string; textBg: string }[] {
  const out: { titleBg: string; textBg: string }[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level as ScenarioLevel);
      for (const o of lesson.objectives) {
        if ((o.params as { maxSpeedKmh?: number }).maxSpeedKmh !== undefined) continue;
        out.push({
          titleBg: o.titleBg,
          textBg: advisorPromptForObjective(
            o.titleBg,
            { kind: o.kind, ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
            undefined,
          ).textBg,
        });
      }
    }
  }
  return out;
}

const prompt = (textBg: string) => ({ textBg, keys: [] as string[] });

describe("the number the bar publishes is the number the student was told", () => {
  const capped = everyCappedCard();

  it("recovers a figure on every capped card in the catalogue — none silent", () => {
    // The advisor's own invariant, restated on this side of the wire: „EVERY
    // capped objective states the number it is graded on". If it holds there and
    // this reader is right, the bar is never blank on a capped rung.
    expect(capped.length).toBe(953);
    const silent = capped.filter((c) => taskCapKmhFromPrompt(prompt(c.textBg)) === undefined);
    expect(silent).toEqual([]);
  });

  it("NEVER exceeds the gate — the direction that would refuse an obedient student", () => {
    // A false refusal is the founder's own complaint (signalled a roundabout
    // exit correctly, failed anyway). If the bar could ask for MORE than the
    // gate accepts, a student who obeyed the bar would be docked by the gate.
    const over = capped.filter((c) => {
      const shown = taskCapKmhFromPrompt(prompt(c.textBg));
      return shown !== undefined && Math.round(shown) > Math.round(c.gateKmh);
    });
    expect(over).toEqual([]);
  });

  it("…and never invents a stricter demand than the sentence beside it", () => {
    // The other direction, which is the one a „just clamp it harder" fix would
    // fail: the published number must BE the figure in the advisor's sentence,
    // not a number derived near it. Read the figure out of the sentence a
    // different way (last «N км/ч» run in the whole string, the advisor suite's
    // own reader) and require agreement card for card.
    const disagree = capped.filter((c) => {
      const shown = taskCapKmhFromPrompt(prompt(c.textBg));
      const runs = [...c.textBg.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)];
      const last = runs.at(-1);
      return (
        shown === undefined ||
        last === undefined ||
        Number(last[1].replace(",", ".")) !== shown
      );
    });
    expect(disagree).toEqual([]);
  });

  it("says NOTHING on an objective that carries no speed contract", () => {
    // Negative control for all three blocks above: if the reader answered a
    // number for everything, „it recovers a figure on every capped card" would
    // pass on a function that returns 40.
    const uncapped = everyUncappedCard();
    expect(uncapped.length).toBeGreaterThan(200);
    const spoke = uncapped.filter((c) => taskCapKmhFromPrompt(prompt(c.textBg)) !== undefined);
    expect(spoke).toEqual([]);
  });
});

describe("MUTATION — the reader takes the advisor's tail, not a number nearby", () => {
  it("ignores a «км/ч» inside the objective's own title", () => {
    // 40 of 1 575 catalogue titles carry «км/ч» (ObjectiveBanner's census); the
    // longest is «Подмини авариралата кола в лентата за движение — под 110 км/ч».
    // A reader anchored on the FIRST figure publishes 110 — the title's coaching
    // ceiling — as the gate's demand, i.e. a bar that licenses 110 in a drill
    // graded at 40. Drive both figures through in one string.
    expect(
      taskCapKmhFromPrompt(
        prompt("Подмини авариралата кола в лентата за движение — под 110 км/ч — дръж под 40 км/ч"),
      ),
    ).toBe(40);
  });

  it("is silent when the title alone carries a figure and the advisor added none", () => {
    // The opposite mutation, and the one a „last «км/ч» in the string" reader
    // fails: a capless objective whose TITLE names a speed must publish nothing,
    // or the bar prints an authored coaching line as a graded ceiling.
    expect(
      taskCapKmhFromPrompt(prompt("Подмини авариралата кола в лентата за движение — под 110 км/ч")),
    ).toBeUndefined();
  });

  it("takes the tail's figure and not the tail's presence", () => {
    // A literal («задачата иска ≤40» hard-coded whenever «дръж под» appears)
    // cannot tell these two apart.
    expect(taskCapKmhFromPrompt(prompt("Мини зоната — дръж под 30 км/ч"))).toBe(30);
    expect(taskCapKmhFromPrompt(prompt("Мини зоната — дръж под 31 км/ч"))).toBe(31);
  });

  it("answers nothing for no prompt and for a prompt that says something else", () => {
    expect(taskCapKmhFromPrompt(null)).toBeUndefined();
    // The B15-VOICE wait copy — a live prompt with no cap in it.
    expect(
      taskCapKmhFromPrompt(prompt("Изчакай колата отдясно — тя има предимство")),
    ).toBeUndefined();
  });
});

describe("MEASURED ON THE GLASS — the bar moves because of this thread", () => {
  /**
   * The thread is worth nothing if the bar prints the same markup either way.
   * `GovernorCapMark` is rendered here on both sides of the boundary with a
   * figure taken from a REAL catalogue card, so this cannot pass against a
   * component that ignores the prop.
   */
  const zebra = everyCappedCard().find((c) => c.lessonId.startsWith("sc-zebra-approach@L1"));

  const mark = (taskCapKmh: number | undefined) =>
    renderToStaticMarkup(
      createElement(GovernorCapMark, {
        capKmh: 60,
        limitKmh: 50,
        taskCapKmh,
        speedKmh: 20,
        tierBg: "Нормален",
        size: "compact" as const,
      }),
    );

  it("prints the drill's ceiling once the shell publishes it, and not before", () => {
    expect(zebra).toBeDefined();
    const shown = taskCapKmhFromPrompt(prompt(zebra?.textBg ?? ""));
    // The reference lesson: the frame that opened O51. 40 is the figure on its
    // card; 45 is its widened gate, which is what the routing note's literal
    // reading would have published, and the number is the whole argument.
    expect(shown).toBe(40);
    expect(mark(shown)).toContain("задачата иска ≤40");
    expect(mark(undefined)).not.toContain("задачата иска");
    // …and the two numbers that were already there are untouched, so this is an
    // addition and not a substitution.
    for (const html of [mark(shown), mark(undefined)]) {
      expect(html).toContain("Нормален ≤60");
      expect(html).toContain("знакът важи");
    }
  });
});

describe("both mounts carry it — the routing state §7 B-R10 left a tripwire on", () => {
  it("compact and roomy publish the same snapshot field", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const shell = fs
      .readFileSync(
        path.join(process.cwd(), "src", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
        "utf8",
      )
      .replace(/\r\n/g, "\n");
    const mounts = [...shell.matchAll(/<StatusDashboard[\s\S]{0,900}?\/>/g)].map((m) => m[0]);
    expect(mounts).toHaveLength(2);
    for (const mount of mounts) {
      expect(mount).toContain("limitKmh={snap.limitKmh}");
      expect(mount).toContain("taskCapKmh={snap.taskCapKmh}");
    }
  });
});
