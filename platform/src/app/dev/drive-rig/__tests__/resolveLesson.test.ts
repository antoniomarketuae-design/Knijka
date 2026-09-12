import { describe, expect, it } from "vitest";
import type { LessonSpec, ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import { DRIVE_RIG_DEFAULT_LESSON_ID, resolveRigLesson } from "../resolveLesson";

/**
 * THE RIG MUST NOT MOUNT A LESSON NOBODY ASKED FOR.
 *
 * Measured 2026-09-12 against the resolver `/dev/drive-rig` shipped until that
 * day, which was:
 *
 *     const spec = scenario !== null ? scenarioById(scenario) : undefined;
 *     if (spec !== undefined) return compileScenario(spec, level);
 *     return lessonById(lesson ?? "l0p-poligon-free") ?? lessonById("l0p-poligon-free");
 *
 * Feed it `scenario: "sc-pk-busstop-bann"` and it returns the FREE POLYGON with
 * no error anywhere: `scenarioById` misses, the `if` is skipped, and `lesson`
 * is null so the `??` chain lands on the default. The rig then mounts it,
 * arms any `?script=`, and drives — `stopAt` points meant for a bus-stop
 * district falling in open polygon tarmac, every step ending on its timeout,
 * the dump complete and plausible.
 *
 * The two rows that sent a wave at this file — sc-ac-truck-spray:3f5a3ef3 and
 * sc-pk-busstop-ban:b103c282 — were both refuted (their frames come from
 * tools/mobile/lesson-audit.mjs, which never opens this route). But the second
 * one names this rig as the way to settle itself: „a wrong leg that stops
 * inside y 150..210 … can be replayed without inventing a new instrument". A
 * replay that can silently answer with a different world is not a settlement,
 * so the substitution is now a refusal.
 */
/**
 * The resolver `/dev/drive-rig` shipped until 2026-09-12, transcribed verbatim
 * from `drive-rig-client.tsx@52a2ea3`. Kept so the substitution below is a
 * MEASUREMENT of what used to happen and not a claim about it — this repo has
 * closed rows on „the fix is obvious" before and been wrong.
 */
function resolverBefore(
  scenario: string | null,
  level: ScenarioLevel,
  lesson: string | null,
): LessonSpec | null {
  const spec = scenario !== null ? scenarioById(scenario) : undefined;
  if (spec !== undefined) return compileScenario(spec, level);
  return lessonById(lesson ?? "l0p-poligon-free") ?? lessonById("l0p-poligon-free") ?? null;
}

describe("the substitution this file removes", () => {
  it("MEASURED: a mistyped ?scenario= used to mount the free polygon, silently", () => {
    expect(resolverBefore("sc-pk-busstop-bann", 1, null)?.id).toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
    expect(resolverBefore("sc-ac-truck-sprayy", 1, null)?.id).toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
    // …and the correctly-spelled ids did NOT, which is why the substitution was
    // invisible to anyone who happened to type them right.
    expect(resolverBefore("sc-pk-busstop-ban", 1, null)?.id).not.toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
  });

  it("MEASURED: an unauthored ?level= used to throw straight through render", () => {
    expect(() => resolverBefore("sc-pk-busstop-ban", 5, null)).toThrow();
  });

  it("and neither case does that any more", () => {
    expect(resolveRigLesson({ scenario: "sc-pk-busstop-bann", level: 1, lesson: null }).lesson).toBeNull();
    expect(() => resolveRigLesson({ scenario: "sc-pk-busstop-ban", level: 5, lesson: null })).not.toThrow();
  });
});

describe("resolveRigLesson", () => {
  it("compiles the scenario the URL names", () => {
    const r = resolveRigLesson({ scenario: "sc-pk-busstop-ban", level: 1, lesson: null });
    expect(r.error).toBeNull();
    expect(r.lesson).not.toBeNull();
    expect(scenarioById("sc-pk-busstop-ban")).toBeDefined();
    expect(r.lesson?.id).not.toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
  });

  it("compiles the other row's scenario too", () => {
    const r = resolveRigLesson({ scenario: "sc-ac-truck-spray", level: 1, lesson: null });
    expect(r.error).toBeNull();
    expect(r.lesson?.id).not.toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
  });

  it("REFUSES an unknown ?scenario= instead of mounting the free polygon", () => {
    const r = resolveRigLesson({ scenario: "sc-pk-busstop-bann", level: 1, lesson: null });
    expect(r.lesson).toBeNull();
    expect(r.error).not.toBeNull();
    expect(r.error).toContain("sc-pk-busstop-bann");
    expect(r.asked).toContain("sc-pk-busstop-bann");
  });

  it("REFUSES an unknown ?lesson= instead of mounting the free polygon", () => {
    const r = resolveRigLesson({ scenario: null, level: 1, lesson: "l9-does-not-exist" });
    expect(r.lesson).toBeNull();
    expect(r.error).toContain("l9-does-not-exist");
  });

  it("mounts a real ?lesson= as itself", () => {
    const r = resolveRigLesson({ scenario: null, level: 1, lesson: DRIVE_RIG_DEFAULT_LESSON_ID });
    expect(r.error).toBeNull();
    expect(r.lesson?.id).toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
  });

  it("still defaults to the free polygon when the URL names NOTHING", () => {
    const r = resolveRigLesson({ scenario: null, level: 1, lesson: null });
    expect(r.error).toBeNull();
    expect(r.lesson?.id).toBe(DRIVE_RIG_DEFAULT_LESSON_ID);
    expect(lessonById(DRIVE_RIG_DEFAULT_LESSON_ID)).toBeDefined();
  });

  it("`?scenario=` still wins over `?lesson=`, and a bad scenario does not fall through to a good lesson", () => {
    const r = resolveRigLesson({
      scenario: "sc-not-a-template",
      level: 1,
      lesson: DRIVE_RIG_DEFAULT_LESSON_ID,
    });
    expect(r.lesson).toBeNull();
    expect(r.error).toContain("sc-not-a-template");
  });

  it("the level reaches the compile — L1 and L4 are not the same lesson", () => {
    const l1 = resolveRigLesson({ scenario: "sc-pk-busstop-ban", level: 1, lesson: null });
    const l4 = resolveRigLesson({ scenario: "sc-pk-busstop-ban", level: 4, lesson: null });
    expect(l1.error).toBeNull();
    expect(l4.error).toBeNull();
    expect(JSON.stringify(l4.lesson)).not.toBe(JSON.stringify(l1.lesson));
    expect(l1.asked).toContain("level=1");
    expect(l4.asked).toContain("level=4");
  });

  /**
   * MEASURED while writing the test above: `compileScenario` THROWS on a rung
   * the template does not author, and the old resolver called it straight from
   * the route's `useMemo` — so `?scenario=sc-pk-busstop-ban&level=5` was an
   * unhandled render error, i.e. a blank page with the reason only in the
   * console. `?level=` is typed by hand; it gets the refusal channel.
   */
  it("REFUSES a level the template does not author instead of throwing through render", () => {
    expect(() => compileScenario(scenarioById("sc-pk-busstop-ban")!, 5)).toThrow();
    const r = resolveRigLesson({ scenario: "sc-pk-busstop-ban", level: 5, lesson: null });
    expect(r.lesson).toBeNull();
    expect(r.error).toContain("level 5");
    expect(r.error).toContain("L5");
  });
});
