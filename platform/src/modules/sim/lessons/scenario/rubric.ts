/**
 * scoreRubric — the scenario quality layer (doc 76 §6): official points stay
 * the VERDICT (rules/summary.ts, untouched); the rubric adds 1–3 STARS of
 * maneuver quality on top, from measurement channels that already exist:
 *
 *  - placement  ← the parkInBay ObjectiveDetail (A10): alignment
 *                 centered/acceptable/sloppy + centre/heading offsets;
 *  - economy    ← the same detail's bay-entry `attempts` counter;
 *  - observation← authored glance moments vs the observed set (the S1 trace
 *                 recorder feeds it; until then the component reports
 *                 measured: false and stays OUT of the star math);
 *  - par time   ← LessonResult.durationSec vs rubric.parTimeSec —
 *                 INFORMATIONAL ONLY, never affects stars (doc 76 §6: time
 *                 pressure is an L5 condition, not a rubric penalty).
 *
 * Star fold (documented, deliberately simple v1):
 *  - each MEASURED component scores 0..2 points; ratio = earned / (2 × n);
 *    ratio >= 0.90 → 3★, >= 0.50 → 2★, else 1★;
 *  - no measured components → stars from official cleanliness alone
 *    (completed + 0 penalty points = 3★, completed = 2★);
 *  - caps (quality never outranks legality): any penalty point → max 2★;
 *    a dangerous/terminated summary, an aborted session or unfinished
 *    objectives → 1★.
 *
 * Pure: same inputs → same output. NO UI wiring here (S1 owns the end screen).
 */

import type { LessonResult, ObjectiveDetail } from "../types";
import type {
  RubricBreakdownLine,
  RubricObservationInput,
  RubricScore,
  RubricSpec,
} from "./types";

const STARS_3_MIN_RATIO = 0.9;
const STARS_2_MIN_RATIO = 0.5;

function parkDetailOf(result: LessonResult, objectiveId: string): Extract<ObjectiveDetail, { kind: "parkInBay" }> | null {
  for (const o of result.objectives) {
    if (o.id === objectiveId && o.detail?.kind === "parkInBay") return o.detail;
  }
  return null;
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

export function scoreRubric(
  result: LessonResult,
  rubric: RubricSpec,
  observation?: RubricObservationInput,
): RubricScore {
  const breakdownBg: RubricBreakdownLine[] = [];
  let earned = 0;
  let measuredCount = 0;

  // -- Placement accuracy (bay centering + heading, A10 detail channel).
  if (rubric.placement) {
    const d = parkDetailOf(result, rubric.placement.objectiveId);
    if (d && d.alignment !== null) {
      const points = d.alignment === "centered" ? 2 : d.alignment === "acceptable" ? 1 : 0;
      earned += points;
      measuredCount += 1;
      const offsets =
        d.centerOffsetM !== null && d.headingOffsetDeg !== null
          ? ` (отместване ${fmt1(d.centerOffsetM)} м, ъгъл ${fmt1(d.headingOffsetDeg)}°)`
          : "";
      breakdownBg.push({
        id: "placement",
        labelBg: "Точност на позицията",
        detailBg:
          d.alignment === "centered"
            ? `Центрирано в очертанията${offsets}.`
            : d.alignment === "acceptable"
              ? `В очертанията, с малко отместване${offsets}.`
              : `В очертанията, но неподравнено${offsets} — коригирай преди да спреш.`,
        points: points as 0 | 1 | 2,
        measured: true,
      });
    } else {
      breakdownBg.push({
        id: "placement",
        labelBg: "Точност на позицията",
        detailBg: "Няма измерване — маневрата не е завършена в очертанията.",
        points: null,
        measured: false,
      });
    }
  }

  // -- Maneuver economy (bay-entry attempts; direction-change counting rides
  //    the S1 trace channel later — attempts are the honest signal today).
  if (rubric.economy) {
    const d = parkDetailOf(result, rubric.economy.objectiveId);
    if (d && d.attempts > 0) {
      const points = d.attempts <= rubric.economy.attemptsFor3Stars ? 2 : d.attempts <= rubric.economy.attemptsFor2Stars ? 1 : 0;
      earned += points;
      measuredCount += 1;
      breakdownBg.push({
        id: "economy",
        labelBg: "Икономичност на маневрата",
        detailBg:
          points === 2
            ? `Паркира от ${d.attempts === 1 ? "първи опит" : `${d.attempts} опита`} — чиста маневра.`
            : points === 1
              ? `${d.attempts} опита — приемливо, целта е от първия.`
              : `${d.attempts} опита — твърде много корекции; подмини по-широко и започни отново.`,
        points: points as 0 | 1 | 2,
        measured: true,
      });
    } else {
      breakdownBg.push({
        id: "economy",
        labelBg: "Икономичност на маневрата",
        detailBg: "Няма измерване — колата не е влизала в очертанията.",
        points: null,
        measured: false,
      });
    }
  }

  // -- Observation completeness (glances vs authored required moments).
  if (rubric.observation) {
    const required = rubric.observation.moments;
    if (observation) {
      const observed = new Set(observation.observedMomentIds);
      const covered = required.filter((m) => observed.has(m.id)).length;
      const ratio = required.length > 0 ? covered / required.length : 1;
      const points = ratio >= 1 ? 2 : ratio >= 0.5 ? 1 : 0;
      earned += points;
      measuredCount += 1;
      breakdownBg.push({
        id: "observation",
        labelBg: "Наблюдение",
        detailBg:
          points === 2
            ? `Огледа се във всички ${required.length} ключови момента.`
            : `Огледа се в ${covered} от ${required.length} ключови момента — огледалата и рамото са част от маневрата.`,
        points: points as 0 | 1 | 2,
        measured: true,
      });
    } else {
      // The glance-trace channel lands with the S1 recorder; until then the
      // component is honest about not measuring (never a silent 0).
      breakdownBg.push({
        id: "observation",
        labelBg: "Наблюдение",
        detailBg: "Все още не се измерва в този режим.",
        points: null,
        measured: false,
      });
    }
  }

  // -- Par time: informational line only (doc 76 §6).
  if (rubric.parTimeSec !== undefined) {
    const over = result.durationSec > rubric.parTimeSec;
    breakdownBg.push({
      id: "parTime",
      labelBg: "Ориентировъчно време",
      detailBg: over
        ? `${Math.round(result.durationSec)} с при ориентир ${Math.round(rubric.parTimeSec)} с — спокойно, точността е преди скоростта.`
        : `${Math.round(result.durationSec)} с — в ориентира от ${Math.round(rubric.parTimeSec)} с.`,
      points: null,
      measured: true,
    });
  }

  // -- Star fold.
  let stars: 1 | 2 | 3;
  if (measuredCount > 0) {
    const ratio = earned / (2 * measuredCount);
    stars = ratio >= STARS_3_MIN_RATIO ? 3 : ratio >= STARS_2_MIN_RATIO ? 2 : 1;
  } else {
    stars = result.completedAll && result.score === 0 ? 3 : result.completedAll ? 2 : 1;
  }
  // Caps: quality never outranks legality.
  if (result.score > 0 && stars > 2) stars = 2;
  if (result.summary.terminated || result.summary.score.hasDangerous || result.aborted || !result.completedAll) {
    stars = 1;
  }

  return { stars, breakdownBg };
}
