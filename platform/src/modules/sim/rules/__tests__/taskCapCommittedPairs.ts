/**
 * THE TASK CEILING, ROUND 13 — THE COMMITTED PAIRS (not a test file): the (glass figure, compiled gate) of every capped
 * objective the catalogue ships, DERIVED from the compiled lessons — never typed.
 *
 * The integrator's ruling for round 13, C1: «every census generator writes shownKmh == capKmh on all 6,203,382 frames,
 * while 306 of 521 committed capped objectives (136 of 192 sign-bound) have them different … draw the glass figure and
 * the gate independently over the pairs the 521 committed capped objectives actually use (derive them from the
 * compiled lessons, do not type them) and beyond».
 *
 * The gate is the compiled objective's `maxSpeedKmh`; the glass figure is `shownObjectiveCapKmh` — the figure the
 * advisor's sentence states (the lesson census, `components/sim/lesson-ui/__tests__/task-cap-lesson-census`, checks
 * the stamps the lesson places against the figure the strip actually printed, so this derivation is itself pinned).
 * The generators draw the DIFFERENCE gate − glass (the rung's grace the author's figure was widened by) and place the
 * glass figure against the programme's sign, so every regime the pair has — the glass at or above the sign, the glass
 * under the sign with the gate at or above it, both under it — arises on any sign.
 */
import { SCENARIO_TEMPLATES, compileScenario, createLessonSession, shownObjectiveCapKmh } from "../../lessons";

export interface CommittedPair {
  id: string;
  level: number;
  objectiveId: string;
  /** The figure the glass shows. */
  glass: number;
  /** The compiled gate. */
  gate: number;
  /** The lesson's posted limit, as compiled (the sign at the mark may differ along the route). */
  posted: number | undefined;
}

/** Every capped flow objective (above the halt band) of every practice rung. */
export function committedPairs(): CommittedPair[] {
  const out: CommittedPair[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson = compileScenario(spec, rung.level);
      if (lesson.examMode === true) continue;
      createLessonSession(lesson).objectives.forEach((o, k) => {
        const p = o.params as { kind: string; maxSpeedKmh?: number };
        if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined || !Number.isFinite(p.maxSpeedKmh) || p.maxSpeedKmh <= 8) return;
        out.push({
          id: spec.id,
          level: rung.level,
          objectiveId: lesson.objectives[k].id,
          glass: shownObjectiveCapKmh(o.spec, p.maxSpeedKmh, lesson.postedLimitKmh),
          gate: p.maxSpeedKmh,
          posted: lesson.postedLimitKmh,
        });
      });
    }
  }
  return out;
}

/** The distinct differences gate − glass the committed objectives use, ascending (0 among them: half show their gate). */
export function committedPairDeltas(pairs: readonly CommittedPair[] = committedPairs()): number[] {
  return [...new Set(pairs.map((p) => Math.round((p.gate - p.glass) * 100) / 100))].sort((a, b) => a - b);
}

/** Differences BEYOND the committed ones (the ruling's «and beyond»): a fraction, and steps wider than any rung's grace. */
export const BEYOND_DELTAS: readonly number[] = [0.5, 1.5, 6, 12.5];
