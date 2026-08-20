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
  advisorPromptForSession,
  compileScenario,
  createLessonSession,
  createYieldWait,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { GovernorCapMark } from "@/modules/sim/hud/StatusDashboard";
import {
  heldTaskCapKmh,
  snapshotOf,
  taskCapKmhFromPrompt,
} from "../LessonPlayShell";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * §2 — THE MIDDLE OF THE CHAIN, WHICH NOTHING WAS HOLDING
 * (2026-08-20, opened by an adversarial refuter against the round above)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * §1 tests BOTH ENDS of the O51 thread and neither of them is the join:
 *
 *   the reader   `taskCapKmhFromPrompt` over all 953 capped cards — driven
 *   the prop     `taskCapKmh={snap.taskCapKmh}` at both mounts — grepped
 *   the mark     `GovernorCapMark` with and without the figure — rendered
 *
 * THE JOIN IS `snapshotOf`, and it was module-private. MEASURED before this
 * section was written: set
 *
 *     taskCapKmh: taskCapKmhFromPrompt(advisorPrompt)  →  taskCapKmh: undefined
 *
 * and **1,036 tests stayed green** while the third number went PERMANENTLY
 * BLANK on every capped rung — every card in §1 still recovers its figure, both
 * mounts still name the prop, and the mark still prints when handed one.
 * TypeScript cannot help either: the field is `number | undefined`, so the
 * mutation type-checks. `tsc --noEmit` exits 0 on it.
 *
 * So `snapshotOf` is exported now and driven with a REAL compiled session,
 * which is the only reading that spans the whole chain: catalogue → engine →
 * advisor → snapshot → the number the bar is handed.
 */
describe("MUTATION — the snapshot actually carries the number", () => {
  /** A real session, on the rung O51 was filed on, in its driving phase. */
  function zebraSession() {
    const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
    expect(spec).toBeDefined();
    // Scenario rungs author no pre-drive, so `createLessonSession` opens in
    // `driving` — asserted rather than assumed, because a session parked in
    // `preDrive` would publish the checklist's prompt and this whole block
    // would be measuring the wrong sentence.
    const session = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
    expect(session.phase).toBe("driving");
    return session;
  }

  it("publishes the drill's spoken ceiling on a real driving session", () => {
    const snap = snapshotOf(zebraSession(), null);
    // 40 is the figure on the card in `sc-zebra-approach/mobile-right/04-t087s`.
    // 45 is that rung's widened gate — the number this row deliberately does
    // not publish (§1), and the number a „just use maxSpeedKmh" fix would.
    expect(snap.taskCapKmh).toBe(40);
    // …and it is the SAME string the advisor is speaking, not a second reading
    // of the world: this is the „by construction" half of the invariant.
    expect(snap.advisorPrompt?.textBg).toContain("дръж под 40 км/ч");
    expect(snap.taskCapKmh).toBe(taskCapKmhFromPrompt(snap.advisorPrompt));
  });

  it("…and says nothing on a session whose active objective carries no cap", () => {
    // The negative control for the assertion above — without it, „publishes 40"
    // would pass on a snapshot that hard-codes 40. The second objective of the
    // same lesson («Подмини пътеката и продължи по улицата») is uncapped.
    const s = zebraSession();
    const advanced = { ...s, currentObjectiveIndex: 1 };
    expect(taskCapKmhFromPrompt(advisorPromptForSession(advanced))).toBeUndefined();
    expect(snapshotOf(advanced, null).taskCapKmh).toBeUndefined();
  });

  it("an exam session publishes no drill ceiling at all", () => {
    // `advisorPromptForSession` returns null on an exam, so the bar falls back
    // to the two-number reading it always printed. Pinned from this side
    // because it is the direction that would hand a candidate the answer.
    const s = zebraSession();
    const exam = { ...s, lesson: { ...s.lesson, examMode: true } };
    expect(snapshotOf(exam, null).advisorPrompt).toBeNull();
    expect(snapshotOf(exam, null).taskCapKmh).toBeUndefined();
  });
});

/**
 * ── §3 · RESIDUAL (2) — THE NUMBER USED TO BLINK OUT AT EVERY GIVE-WAY STOP ─
 *
 * `advisorPromptForSession` lets a LIVE YIELD outrank the objective (B15-VOICE,
 * and correctly — while the student is lawfully standing still, „what am I
 * supposed to be doing" has a different answer than the waypoint at the far end
 * of the route). The wait copy carries no «дръж под N км/ч» tail, so with the
 * cap read straight off the current sentence the third number vanished for the
 * length of every lawful stop and returned when the car moved off.
 *
 * On the one surface whose ORIGINAL finding was „three different speed targets
 * … no way to know which number is being graded", a number that comes and goes
 * is the same defect in motion. `heldTaskCapKmh` closes it: the ceiling belongs
 * to the OBJECTIVE, not to the frame.
 *
 * Both directions, because a hold is a memory and a stale memory prints a
 * ceiling for a drill that no longer asks for it.
 */
describe("the ceiling belongs to the objective, not to the sentence of the moment", () => {
  function zebraSession() {
    const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
    return createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  }

  /** The state a full standstill at a give-way produces (finish.ts stepYieldWait). */
  const holdingAt = (reason: "pedestrian" | "giveWayLine") => ({
    ...createYieldWait(),
    holding: true,
    sinceSec: 1,
    reason,
  });

  it("the wait really does displace the cap sentence — the premise, measured", () => {
    // Asserted rather than assumed: if this stopped being true the hold below
    // would be dead code passing its own tests.
    const waiting = { ...zebraSession(), yieldWait: holdingAt("pedestrian") };
    const said = advisorPromptForSession(waiting);
    expect(said).not.toBeNull();
    expect(said?.textBg).not.toContain("км/ч");
    expect(taskCapKmhFromPrompt(said)).toBeUndefined();
  });

  it("holds the drill's ceiling across the wait, on the real session", () => {
    const driving = snapshotOf(zebraSession(), null);
    expect(driving.taskCapKmh).toBe(40);
    const waiting = { ...zebraSession(), yieldWait: holdingAt("pedestrian") };
    // The poll that lands while he is stopped is handed the previous snapshot,
    // exactly as `setSnap((prev) => snapshotOf(…, prev))` does it.
    const held = snapshotOf(waiting, null, null, driving);
    expect(held.advisorPrompt?.textBg).not.toContain("км/ч");
    expect(held.taskCapKmh).toBe(40);
  });

  it("MUTATION — without the previous snapshot it blinks out, which is the defect", () => {
    // The negative control, and it is the pre-fix behaviour verbatim: the same
    // waiting session with nothing to remember publishes nothing.
    const waiting = { ...zebraSession(), yieldWait: holdingAt("pedestrian") };
    expect(snapshotOf(waiting, null, null, null).taskCapKmh).toBeUndefined();
  });

  it("and it is dropped at the objective boundary — never carried into the next drill", () => {
    // The direction that matters more: a held number outliving its objective is
    // a ceiling printed for a drill that never asked for it, which is a false
    // refusal waiting to happen.
    const s = zebraSession();
    const first = snapshotOf(s, null);
    expect(first.taskCapKmh).toBe(40);
    const next = { ...s, currentObjectiveIndex: 1 };
    expect(first.objectiveId).not.toBe(snapshotOf(next, null).objectiveId);
    expect(snapshotOf(next, null, null, first).taskCapKmh).toBeUndefined();
  });

  it("a fresh figure always wins over a held one — this never smooths a real change", () => {
    expect(heldTaskCapKmh(30, "obj-a", { objectiveId: "obj-a", taskCapKmh: 40 })).toBe(30);
    expect(heldTaskCapKmh(30, "obj-a", { objectiveId: "obj-b", taskCapKmh: 40 })).toBe(30);
  });

  it("the run-out holds nothing, and an objective that never spoke acquires nothing", () => {
    // Every objective done ⇒ no active id ⇒ nothing to attribute a ceiling to.
    expect(heldTaskCapKmh(undefined, null, { objectiveId: "obj-a", taskCapKmh: 40 })).toBeUndefined();
    // …and a drill that never named a number cannot inherit one from the frame
    // before it, because there was nothing there to remember.
    expect(heldTaskCapKmh(undefined, "obj-a", { objectiveId: "obj-a", taskCapKmh: undefined })).toBeUndefined();
    expect(heldTaskCapKmh(undefined, "obj-a", null)).toBeUndefined();
  });
});

/**
 * ── §4 · RESIDUAL (1) — THE INVARIANT WAS WRONG, NOT THE ROW ───────────────
 *
 * „The bar prints what the CARD prints, or nothing" was the sentence, and it is
 * false as written: `taskCapKmh` is not gated on `advisorOn`, `advisorDismissed`,
 * `activeQuiz` or `teachQueue`, so with «Съветник» switched off the roomy
 * `AdvisorCard` prints nothing and the bar still prints «задачата иска ≤40».
 *
 * THE ROW IS KEPT AND THE SENTENCE IS RESTATED — the reasoning is written at
 * `taskCapKmhFromPrompt` and the short form is: «Съветник»'s own control
 * promises to govern „следващото действие и клавиша за него", advice about what
 * to do next; the drill's ceiling is not advice, it is the figure the student
 * is billed against, and O51 was filed precisely because it was on the glass
 * with nothing naming it. Withdrawing it from everyone who turns coaching off
 * would re-file the finding against the students most likely to be driving
 * unaided, and would fail one of them for a number no surface ever named.
 *
 * WHAT THE RESTATED INVARIANT FORBIDS, and this is the half that is testable:
 * the bar may never print a figure that no sentence contains.
 */
describe("the bar prints the advisor's own figure, not a reading of its own", () => {
  it("every capped card in the catalogue: the published figure IS in the sentence", () => {
    // Re-driven here against the SNAPSHOT's rule rather than the reader alone,
    // so this fails if the join ever starts deriving a number of its own.
    const offenders = everyCappedCard().filter((c) => {
      const shown = taskCapKmhFromPrompt(prompt(c.textBg));
      return shown === undefined || !c.textBg.includes(`${shown} км/ч`);
    });
    expect(offenders).toEqual([]);
  });

  it("…and the snapshot never invents one when the session says nothing", () => {
    // The other half: a session with no prompt at all publishes no ceiling,
    // whatever the objective's raw gate happens to be.
    const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
    const s = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
    const exam = { ...s, lesson: { ...s.lesson, examMode: true } };
    const capped = s.objectives[0].params as { maxSpeedKmh?: number };
    // The gate is there — 45, the widened figure — and nothing publishes it.
    expect(capped.maxSpeedKmh).toBeGreaterThan(0);
    expect(snapshotOf(exam, null).taskCapKmh).toBeUndefined();
  });
});
