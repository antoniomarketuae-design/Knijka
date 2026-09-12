/**
 * WHICH LESSON THE DRIVE RIG ACTUALLY MOUNTED — and the refusal when the URL
 * named one that does not exist.
 *
 * WHY THIS IS ITS OWN FILE (2026-09-12, while refuting two rows routed here)
 * ---------------------------------------------------------------------------
 * `/dev/drive-rig` used to resolve its lesson inline, like this:
 *
 *     const spec = scenario !== null ? scenarioById(scenario) : undefined;
 *     if (spec !== undefined) return compileScenario(spec, level);
 *     return lessonById(lesson ?? "l0p-poligon-free") ?? lessonById("l0p-poligon-free");
 *
 * Read the fall-through: an UNKNOWN `?scenario=` is indistinguishable from no
 * `?scenario=` at all, so `?scenario=sc-pk-busstop-bann` did not fail — it
 * quietly mounted the free polygon and drove it. With `?script=` on the same
 * URL the rig then ran that script, in full, on the wrong world: `stopAt`
 * points from the intended district land in open polygon tarmac, every step
 * ends `reason: "timeout"`, and the drive completes and dumps. The only thing
 * separating that from a real drive is the lesson title in the shell header —
 * a thing the reader has to remember to compare.
 *
 * That is the exact failure `devrig/driveScript.ts` opens with: „nobody could
 * say whether it was a wrongful conviction or an honest barge — because the
 * drive that produced it was never the drive that was specified". The script
 * half of this URL has been LOUD about it since it was written (`?script=`
 * refuses and paints the reason); the lesson half was silent.
 *
 * `?script=` and `?scenario=` now fail the same way: nothing is substituted,
 * and the reason is a string the caller can read off the frame.
 *
 * PURE ON PURPOSE — no React, no window — so the substitution is measured in
 * Node (see `__tests__/resolveLesson.test.ts`) rather than argued about from a
 * screenshot of a lesson that may or may not be the one that was asked for.
 */
import type { LessonSpec, ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";

/** Mounted only when the URL names NEITHER a scenario NOR a lesson. */
export const DRIVE_RIG_DEFAULT_LESSON_ID = "l0p-poligon-free";

export interface RigLessonRequest {
  /** `?scenario=` — a scenario TEMPLATE id, compiled at `level`. */
  scenario: string | null;
  /** `?level=` — 1..5. Ignored unless `scenario` is set. */
  level: ScenarioLevel;
  /** `?lesson=` — a hand-authored curriculum lesson id. */
  lesson: string | null;
}

export interface RigLessonResolution {
  /** The lesson to mount, or null — and null is never quietly replaced. */
  lesson: LessonSpec | null;
  /** Why nothing was mounted, in words fit to paint on the frame. */
  error: string | null;
  /** What the URL asked for, echoed so a frame carries the request as well as the result. */
  asked: string;
}

/**
 * Resolve `?scenario=` / `?level=` / `?lesson=` into the one lesson to mount.
 *
 * `scenario` wins over `lesson` (that precedence is unchanged). An id that does
 * not resolve is an ERROR, not a cue to mount something else.
 */
export function resolveRigLesson(req: RigLessonRequest): RigLessonResolution {
  if (req.scenario !== null) {
    const asked = `?scenario=${req.scenario}&level=${req.level}`;
    const spec = scenarioById(req.scenario);
    if (spec === undefined) {
      return {
        lesson: null,
        asked,
        error:
          `«${req.scenario}» is not a scenario template id, so NOTHING was mounted. ` +
          `Until 2026-09-12 this case silently mounted ${DRIVE_RIG_DEFAULT_LESSON_ID} ` +
          `and drove any ?script= on it, on the wrong world.`,
      };
    }
    // `compileScenario` THROWS on a level the template does not author, and a
    // throw inside the route's `useMemo` is an unhandled render error — a blank
    // dev page, not a message. MEASURED 2026-09-12:
    //   resolveRigLesson({scenario:"sc-pk-busstop-ban", level:5})
    //   → ScenarioCompileError: the template does not author L5 (has: L1..L4)
    // `?level=` comes off a URL a human typed, so this is an ordinary input
    // error and belongs in the same refusal channel as an unknown id.
    try {
      return { lesson: compileScenario(spec, req.level), asked, error: null };
    } catch (e) {
      return {
        lesson: null,
        asked,
        error: `«${req.scenario}» would not compile at level ${req.level}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  if (req.lesson !== null) {
    const asked = `?lesson=${req.lesson}`;
    const spec = lessonById(req.lesson);
    if (spec === undefined) {
      return {
        lesson: null,
        asked,
        error:
          `«${req.lesson}» is not a lesson id, so NOTHING was mounted. ` +
          `Until 2026-09-12 this case silently mounted ${DRIVE_RIG_DEFAULT_LESSON_ID}.`,
      };
    }
    return { lesson: spec, asked, error: null };
  }

  const fallback = lessonById(DRIVE_RIG_DEFAULT_LESSON_ID);
  const asked = `(no ?scenario= / ?lesson=) ${DRIVE_RIG_DEFAULT_LESSON_ID}`;
  if (fallback === undefined) {
    return {
      lesson: null,
      asked,
      error: `the rig's default lesson ${DRIVE_RIG_DEFAULT_LESSON_ID} is not in the catalogue`,
    };
  }
  return { lesson: fallback, asked, error: null };
}
