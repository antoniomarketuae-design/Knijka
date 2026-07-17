/**
 * sc-pk-double-park — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Двойното паркиране блокира улицата" (PK-06, ЗДвП
 * чл. 98, ал. 1) on the committed pk-double-v1 district. Ambient traffic ZERO
 * (the harness law); the template's OWN staged actor is the single truth
 * (imported from the ScenarioSpec, never re-declared here):
 *  - the oncoming stream (oncomingStream sc-pkd-stream): TWO cars southbound at
 *    5 m/s (18 km/h — the honest pace of a street whose passage has been
 *    narrowed to one car), released on the player's first movement — pure
 *    clockwork from there. Car 0 holds at arc 73 (instant-model y 287) and draws
 *    level with a hero stopped at y = 175 at t ≈ 23.8 s; car 1 holds 20 m behind
 *    it and arrives at t ≈ 27.8 s. Those two numbers are the second demo's
 *    choreography — see below.
 *
 * The parked row itself is armed as PRECISE colliders (ObstacleRect2D from the
 * district's own `meta.scenario.bays` — the lotObstacleRects mold), because the
 * 27 cars that CAUSE the ban are the same 27 cars the hero can hit. The
 * collisionMinKmh stays at the recorder default (10 km/h, the street-nudge
 * tolerance): this is a street drill, not a bay-parking drill, so a 2 km/h kiss
 * of a mirror is not the lesson — the row is there to be passed, and passing it
 * cleanly at 30 km/h is what the shadow proves.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: transits the WHOLE parked row without resting beside it, then
 *     indicates right and parks AT THE CURB in the free bay 80 m past it
 *     ((6.8, 290)) → ZERO violations;
 *   - „Спиране на втора линия": a casual 5 s rest at y = 130, mid-row, inside
 *     pkd-z-second-line → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE (основна);
 *   - „Двойно спиране, което вкарва насрещния в твоята половина": the same rest
 *     at y = 175, billed at t ≈ 26.3 and then held until car 1 draws level at
 *     t ≈ 27.8 → EXACTLY ILLEGAL_STOP_IN_BAN_ZONE + COLLISION, in that order
 *     (the fault first, the consequence second — the order the card tells it in).
 *
 * WHY THE SECOND DEMO'S CONTACT IS AUTHORED (honest, and precisely why). Two
 * mechanisms could have produced it by simulation, and neither can reach across
 * this geometry:
 *  - the recorder SAT-tests the hero against `obstacles` — but those are the
 *    PARKED row on x = ∓6.8, not the stream;
 *  - OncomingStreamRunner.step does emit its own „collision" on head-on contact
 *    — but it needs centre-to-centre < VEHICLE_CONTACT_M (3.0 m), and the two
 *    banks sit 8.12 m apart (one full perceptual lane). A hero double-parked in
 *    his OWN lane is never within 3 m of a car in the oncoming one.
 * That 8.12 m is the perceptual road scale (×2.5) talking: the street this
 * template calls „тясна" is 16 m of drawn asphalt, so the squeeze that is real
 * in Sofia is not real in the geometry. Rather than fake the width, the contact
 * is a scripted narrative beat — the `collision` DriveStep, the same seam the
 * no-observation demos use for „пешеходец зад колата". What is NOT authored is
 * the beat's TRUTH: the gate pins that the fault-and-consequence ordering holds
 * and that the stream is genuinely in motion past the hero when it fires. And
 * what is not authored at all is the conviction beside it — the чл. 98 rest
 * bills through the real reducer.
 *
 * WHY NEITHER THE ROW NOR THE STREAM ACQUITS THE REST THEY MOTIVATE. A lead
 * within banZoneStopQueueGapM (8 m) makes any rest queue-innocent. Bays are
 * colliders, never traffic, so the row cannot be a lead; and leadGapFor's
 * corridor is 4.0 m lateral while the oncoming bank sits 8.12 m over, so the
 * approaching car cannot be one either. Both pinned in
 * world/__tests__/pk-double-districts.test.ts and re-checked on the gate.
 *
 * Every stop uses the default SCRIPT_DECEL (4.6 m/s², below the
 * harshBrakeDecelMps2 = 7 threshold), so no demo smuggles in a
 * HARSH_BRAKING_NO_CAUSE alongside the fault it is meant to teach.
 *
 * Geometry pinned to content/world/pk-double-v1.json: a 1+1 street on x = 0,
 * lane center x = 4.06, oncoming bank x = −4.06, parked rows on x = ∓6.8
 * spanning y ∈ [75, 205], чл. 98 second-line span y ∈ [70, 210], free curb bay
 * at (6.8, 290), spawn pkd-spawn-start (4.06, 15) heading north, 360 m long,
 * limit 50 km/h.
 */

import type { ScenarioBayMeta, StagedEventSpec } from "../contracts";
import { scenarioBaysOf } from "../contracts";
import { SC_PK_DOUBLE_PARK } from "../lessons/scenario/templates-parking2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import { PARKED_CAR_HALF_LENGTH_M, PARKED_CAR_HALF_WIDTH_M } from "./scParkPerpRev";

export const SC_PK_DOUBLE_PARK_ID = "sc-pk-double-park";

/** The single northbound lane center of pk-double-v1. */
const X_LANE = 4.06;
/** The free curb bay's x — where the drill's answer lives (east curb). */
const X_CURB = 6.8;

/**
 * The headless obstacle set of pk-double-v1: one parked-car rect per OCCUPIED
 * bay (meta.scenario.bays — the same single truth the scene's ScenarioObstacles
 * mounts from, and the same shape as scParkPerpRev's lotObstacleRects). Here it
 * is not scenery and not a maneuvering hazard: it is the ban's cause, made
 * hittable so „мини покрай тях" costs something to get wrong.
 */
export function doubleParkObstacleRects(districtRaw: unknown): ObstacleRect2D[] {
  return scenarioBaysOf(districtRaw)
    .filter((b: ScenarioBayMeta) => b.occupied)
    .map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      halfWidthM: PARKED_CAR_HALF_WIDTH_M,
      halfLengthM: PARKED_CAR_HALF_LENGTH_M,
      withWhat: "vehicle" as const,
    }));
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the occupied curb, park past it
// ---------------------------------------------------------------------------

export function scPkDoubleParkShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Задачата: „спри някъде тук“. Напред улицата е паркирана и от двете страни — а знак за забрана няма никъде." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55], [X_LANE, 75]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Тук започва редицата. Забраната я пишат тези коли: до вече спряло ППС откъм страната на движението не се спира (чл. 98, ал. 1)." },
      { kind: "drive", points: [[X_LANE, 75], [X_LANE, 130], [X_LANE, 175]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Насреща идва кола. Между двете редици има място за една — затова не спираме, а се разминаваме." },
      { kind: "drive", points: [[X_LANE, 175], [X_LANE, 205], [X_LANE, 225]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Редицата свърши — оттук нататък до бордюра няма кой да ти забрани да спреш. Десен мигач." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 262], [X_LANE, 278]], targetKmh: 22, stopAtEnd: false },
      // Ease to the CURB, not to a halt in the lane: the drill's answer is a
      // place where the car stops being an obstacle.
      { kind: "drive", points: [[X_LANE, 278], [5.6, 284], [X_CURB, 290]], targetKmh: 12 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: подмина цялата редица и спря до бордюра на свободното място — на 80 метра и по-малко от минута." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „за две минути" beside the row (pkd-z-second-line, y = 130)
// ---------------------------------------------------------------------------

export function scPkDoubleParkMistakeSecondLineScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „те са паркирали, значи тук се спира“ — и колата застава успоредно до редицата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 75], [X_LANE, 130]], targetKmh: 30 },
      // A casual 5 s rest at mid-row (the span is y ∈ [70, 210]) — past the 4 s
      // sustain. No stop line, no crossing and no signal exist on this map; the
      // parked row is colliders (never traffic) and the oncoming bank is 8.12 m
      // over (outside the 4 m lead corridor) — so no structural innocence is
      // available and the authored fault convicts, alone.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Разликата между теб и тях: те са до бордюра, ти си в платното. Платното е за движение (чл. 98, ал. 1)." },
      { kind: "drive", points: [[X_LANE, 130], [X_LANE, 205], [X_LANE, 240]], targetKmh: 30 },
      { kind: "annotation", textBg: "Твоите две минути не струват две минути — те струват по няколко на всеки, който идва след теб." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 278]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 278], [5.6, 284], [X_CURB, 290]], targetKmh: 12 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Свободното място беше на 80 метра напред — и там колата не пречи на никого." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — the squeeze: the double stop puts the oncoming in your half
//                  (pkd-z-second-line, y = 175, with the stream on top of it)
// ---------------------------------------------------------------------------

export function scPkDoubleParkMistakeOncomingSqueezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спиране на втора линия по средата на редицата — там, където проходът е точно за една кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 75], [X_LANE, 130], [X_LANE, 175]], targetKmh: 30 },
      // The rest that bills: the чл. 98 sustain is 4 s, so this 5 s pause
      // convicts at t ≈ 26.3 — while the stream's SECOND car is still inbound.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Насрещният няма избор: вляво от него е стена от паркирани коли, а единственият проход минава през твоята половина." },
      // …and this half-second carries the clock to t ≈ 27.8, the moment car 1
      // draws level with the stopped hero (it reaches y = 175 at t ≈ 27.73 —
      // pure clockwork from the release, pinned in the gate). The fault is
      // billed FIRST and the consequence arrives second, which is the order the
      // debrief card tells it in.
      { kind: "pause", sec: 0.5, brake: true },
      // AUTHORED consequence (see the header): a car in the oncoming bank is
      // 8.12 m away — three times VEHICLE_CONTACT_M — so no simulated contact
      // can occur however narrow the street is in the fiction. The beat is
      // scripted, and fired exactly when the car it describes is abreast.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "annotation", textBg: "Спрялата на втора линия кола не забавя движението — тя го изтласква в насрещното. Следващият, който те заобикаля, го прави сляпо." },
      { kind: "drive", points: [[X_LANE, 175], [X_LANE, 205], [X_LANE, 240]], targetKmh: 30 },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 278]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 278], [5.6, 284], [X_CURB, 290]], targetKmh: 12 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "„Само за малко“ превърна една улица в едно платно, по което две коли се разминават на доверие." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkDoubleParkTraceName =
  | "shadow-correct"
  | "mistake-second-line"
  | "mistake-oncoming-squeeze";

const SCRIPTS: Record<
  ScPkDoubleParkTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPkDoubleParkShadowScript },
  "mistake-second-line": { kind: "mistake", script: scPkDoubleParkMistakeSecondLineScript },
  "mistake-oncoming-squeeze": { kind: "mistake", script: scPkDoubleParkMistakeOncomingSqueezeScript },
};

/**
 * Record one of the three drives against a loaded pk-double-v1 document — the
 * template's own staged oncoming stream + the district's own parked row as
 * precise colliders, ambient traffic zero (the harness law). Deterministic:
 * same district → same trace.
 */
export function recordScPkDoubleParkDrive(
  districtRaw: unknown,
  name: ScPkDoubleParkTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_DOUBLE_PARK_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PK_DOUBLE_PARK.staged ?? [])] as StagedEventSpec[],
    obstacles: doubleParkObstacleRects(districtRaw),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
