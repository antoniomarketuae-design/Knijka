/**
 * sc-merge-roadworks-shift — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Ремонт затваря лентата ти" (ЗДвП чл. 25;
 * Наредба № 2/2001) on the committed hz-roadworks-v1 district. Ambient traffic
 * ZERO (seed 7), dry day; the ONLY staged actor is the open-lane car of
 * SC_MERGE_ROADWORKS_SHIFT.staged — the rearTailgater runner, which emits ZERO
 * SimTick events by contract (pressure scenery, doc 72 FO-07). Everything the
 * gate asserts therefore comes from the PLAYER's own channels + the CONES.
 *
 * THE CONES are recorder obstacle rects (the scHazardObstacle pattern), pinned
 * BY VALUE from the district's meta.scenario.cones and fed with
 * collisionMinKmh 0 — doc 76 §0's low-speed collider ruling, so brushing one
 * registers rather than passing as a nudge. Unlike scMergeLaneEnd's authored
 * „изтласкване" beat, the cone contact here is GEOMETRIC: the demo is convicted
 * by where its wheels actually went, not by a narrated consequence.
 *
 * HONEST SCOPE (flagged — gen_hz_roadworks.mjs's header, gap 1): the cones
 * exist for the RECORDER only. LessonScene derives its live ScenarioObstacles
 * from occupied parking bays alone, so a live student meets no cone collider
 * and no cone mesh; the district carries the data seam (meta.scenario.cones)
 * ready for that edit. The live drill still bites — POOR_LANE_KEEPING and the
 * objective gates are engine/objective channels — only the contact is missing.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: rolls the closed lane at 45 → mirror → EASES to 30 and lets the
 *     open-lane car go by → indicator + mirror + shoulder → merges into the
 *     пролука behind it, 34 m of commit finished 10 m before the taper even
 *     starts → cancels → holds 28 through the site's temporary 30 → runs out.
 *     ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE, and it never touches
 *     a cone;
 *   - „Вливане в последния момент без мигач": mirror checked, NO indicator
 *     ever, wheel over at the last usable metres → EXACTLY
 *     LANE_CHANGE_WITHOUT_INDICATOR (the glance is real — the demo is about the
 *     missing signal, and the rest of the run is clean, cones included);
 *   - „Провиране през конусите": holds the closed lane into the taper, knocks
 *     cones down, then drags itself along the site's boundary line → EXACTLY
 *     COLLISION + POOR_LANE_KEEPING. It signals and glances before drifting
 *     left, so the lane-change codes can never leak in: this demo is about the
 *     cones and the line, not about the ritual.
 *
 * Geometry pinned to content/world/hz-roadworks-v1.json (meta.scenario): the
 * one-way street runs on x = 0 — closed/curb lane (laneId 0) x = 4.06, the open
 * lane (laneId 1) x = -4.06; the cone taper runs y ∈ [216, 240]; the works
 * segment (its own edge, ВРЕМЕННО 30) runs y ∈ [240, 276]; the street ends at
 * y = 310; spawn hzr-spawn-closed-lane (4.06, 12) heading 0; urban limit 50.
 *
 * PACING LAWS the numbers obey (probed, not guessed — the district battery
 * hz-roadworks-districts.test.ts re-proves each against the real reducer, and
 * gen_hz_roadworks.mjs asserts the sizing at BUILD time):
 *  - THE JOINT GRACE: a lane delta within laneChangeJointGraceSec (1.5 s) of a
 *    segment transition is DROPPED. Every authored merge flips laneId on the
 *    APPROACH edge with ≥ 2.2 s to spare before the works joint at y = 240, so
 *    the §9 asserts keep their teeth;
 *  - THE KEEP-RIGHT BUDGET: on a span-less 2-lane one-way the merged driver IS
 *    a keep-right candidate. The worst authored open-lane run (earliest flip →
 *    finish, at 35 → 28 → 42 km/h) is ~8.95 s, inside keepRightSustainSec (12);
 *  - the merge is 8.125 m of lateral over 34 m of arc: |laneOffsetM| exceeds
 *    laneKeepMaxOffsetM (3.25) for only ~0.7 s at the authored 35 km/h — well
 *    inside laneKeepSustainSec (3 s), so a clean commit never grades
 *    POOR_LANE_KEEPING, while the cone demo's 30+ m drag along the line does;
 *  - every authored pace clears its posted limit's 10% grace from below (45/42
 *    under 50; 28 under the site's 30), so nothing leaks SPEEDING;
 *  - nothing brakes harder than the recorder's default 4.6 m/s², which is under
 *    harshBrakeDecelMps2 (7): the ease that lets the open-lane car by can never
 *    read as a causeless slam.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_ROADWORKS_SHIFT } from "../lessons/scenario/templates-merging";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_ROADWORKS_SHIFT_ID = "sc-merge-roadworks-shift";

/** hz-roadworks-v1 lane centers (meta.scenario — the L7 copy truth). */
const X_CLOSED = 4.06; // laneId 0 — the drill starts here; the cones close it
const X_OPEN = -4.06; // laneId 1 — the survivor
/** hz-roadworks-v1 spawn + story arclengths (meta.scenario). */
const SPAWN: readonly [number, number] = [X_CLOSED, 12];

/** Approach cruise, under the posted 50. */
const CRUISE_KMH = 45;
/** Shed in the CLOSED lane to let the open-lane car go by — the taught beat.
 *  4.6 m/s² of recorder decel from 45 is far under the harsh-brake threshold. */
const EASE_KMH = 30;
/** The speed every merge is committed at. */
const MERGE_KMH = 35;
/** The pace held through the site, under its temporary 30. */
const WORKS_KMH = 28;
/** The runout past the site, under the resumed 50. */
const EXIT_KMH = 42;

/**
 * The cone set of hz-roadworks-v1 (meta.scenario.cones), pinned BY VALUE — the
 * taper that closes lane 0 (y 216 → 240, walking from the curb to the boundary
 * line) plus the boundary line through the site (x = 0.6, y 246 → 274). The
 * trace gate asserts every coordinate against the district file.
 *
 * A cone is radially symmetric, so headingDeg is irrelevant; the 0.3 m half
 * extents are the base of the scenario_props.py cone. `withWhat: "staticObject"`
 * matches how ScenarioObstacles classifies props (untagged ⇒ the VehicleRig
 * fallback), so the recorded COLLISION detail reads exactly as a live contact
 * would once the LessonScene cone seam lands.
 */
export function roadworksConeRects(): ObstacleRect2D[] {
  const at = (x: number, y: number): ObstacleRect2D => ({
    x,
    y,
    headingDeg: 0,
    halfWidthM: 0.3,
    halfLengthM: 0.3,
    withWhat: "staticObject" as const,
  });
  return [
    // The taper — lane 0 narrows to nothing over 24 m.
    at(7.6, 216),
    at(5.85, 222),
    at(4.1, 228),
    at(2.35, 234),
    at(0.6, 240),
    // The boundary line through the works.
    at(0.6, 246),
    at(0.6, 253),
    at(0.6, 260),
    at(0.6, 267),
    at(0.6, 274),
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — see it early, ease, look, signal, shift
// ---------------------------------------------------------------------------

export function scMergeRoadworksShiftShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Караме в дясната лента. Напред знаците и конусите казват едно: тази лента е затворена за ремонт." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [X_CLOSED, 120]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // The observation pair the rubric names: mirror first (where is the gap,
      // and how fast is it coming?), then the indicator, then the blind spot —
      // wheel last.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "В огледалото: кола в лявата лента, почти наравно с нас. Нейната лента продължава — нашата свършва след конусите." },
      { kind: "drive", points: [[X_CLOSED, 120], [X_CLOSED, 164]], targetKmh: EASE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Отпускаме газта и я пускаме да мине. Пролуката ЗАД нея е нашата — не тази пред нея." },
      { kind: "drive", points: [[X_CLOSED, 164], [X_CLOSED, 196]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът." },
      // The merge: 8.125 m of lateral over 34 m of arc — the laneId flip lands
      // at y ≈ 213, on the APPROACH edge, 27 m (≈ 2.8 s) before the works joint
      // and 3 m before the taper even begins.
      { kind: "drive", points: [[X_CLOSED, 196], [X_OPEN, 230]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Вписахме се с едно движение, много преди първия конус. Мигачът се изключва." },
      // Into the site at its OWN limit: 28 under the temporary 30.
      { kind: "drive", points: [[X_OPEN, 230], [X_OPEN, 276]], targetKmh: WORKS_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Временното ограничение е закон: 30 през целия участък. Между конусите работят хора — там тясното е за всички." },
      { kind: "drive", points: [[X_OPEN, 276], [X_OPEN, 294]], targetKmh: EXIT_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: ранно решение, пълна проверка, вливане в пролука и временната скорост — спазена докрай. Нито един конус не мръдна." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Вливане в последния момент без мигач"
// (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scMergeRoadworksShiftMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът вижда конусите, но отлага решението до последните метри — и се пъха мълчаливо." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [X_CLOSED, 150]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Лентата вече се стеснява, а водачът още кара право напред — чака „да се отвори“." },
      { kind: "drive", points: [[X_CLOSED, 150], [X_CLOSED, 200]], targetKmh: 40, stopAtEnd: false },
      // The mirror IS checked — this demo is about the missing signal alone, so
      // the glance sits inside mirrorLookbackSec (5 s) of the wheel-over.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Погледна в огледалото — и толкова. Мигач няма: другите ще научат за маневрата, когато вече е започнала." },
      // The wheel-over: no indicator anywhere in the script. 28 m of lateral run
      // flips laneId at y ≈ 218 — still 22 m (≈ 2.3 s) clear of the works joint,
      // so the joint grace cannot swallow the grade, and it threads between the
      // taper cones without touching one (the gate proves both).
      { kind: "drive", points: [[X_CLOSED, 200], [X_CLOSED, 204]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_CLOSED, 204], [X_OPEN, 232]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Мигачът не е учтивост — той е единственият начин намерението ти да стигне до другите ПРЕДИ волана." },
      { kind: "drive", points: [[X_OPEN, 232], [X_OPEN, 276]], targetKmh: WORKS_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_OPEN, 276], [X_OPEN, 294]], targetKmh: EXIT_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ремонтът не е изненада: конусите се виждат от сто метра. Реши рано, обяви решението — и маневрата става скучна. Скучното е безопасно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Провиране през конусите"
// (COLLISION + POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scMergeRoadworksShiftMistakeSqueezeConesScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът решава, че конусите са за другите — и опитва да се промъкне покрай тях." },
      { kind: "glance", mirror: "rear" },
      // The ritual IS performed — this demo is NOT about the signal or the
      // mirror. Signalling + glancing before the drift keeps the lane-change
      // codes out of the verdict: what convicts here is the cones and the line.
      { kind: "drive", points: [[X_CLOSED, 12], [X_CLOSED, 190]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Мигач има, огледало има — но воланът не отива в лявата лента. Водачът кара право към конусите." },
      // Holds the closed lane's driving line straight into the taper: the cone
      // at (4.1, 228) is on it. Contact is GEOMETRIC (collisionMinKmh 0).
      { kind: "drive", points: [[X_CLOSED, 190], [X_CLOSED, 232]], targetKmh: 32, stopAtEnd: false },
      { kind: "annotation", textBg: "Първият конус отлита. Конусите не са украса — те очертават мястото, където работят хора." },
      // …then drags itself along the site's boundary line: neither lane, both
      // lanes. x = -0.25 sits ~4.3 m off the closed lane's center (beyond the
      // 3.25 m tolerance) and its right flank overlaps the x = 0.6 cone line.
      // 29, not 30: this demo breaks the CONE rule, so it must not also brush
      // the site's temporary limit and contaminate its own two-code verdict.
      { kind: "drive", points: [[X_CLOSED, 232], [-0.25, 246]], targetKmh: 29, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-0.25, 246], [-0.25, 280]], targetKmh: WORKS_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Возене по линията: колата не е нито в своята лента, нито в чуждата. Всички наоколо трябва да гадаят какво ще направи." },
      { kind: "drive", points: [[-0.25, 280], [X_OPEN, 296]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Затворена лента се напуска навреме и с една маневра — не се преговаря конус по конус." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeRoadworksShiftTraceName =
  | "shadow-correct"
  | "mistake-no-indicator"
  | "mistake-squeeze-cones";

const SCRIPTS: Record<
  ScMergeRoadworksShiftTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeRoadworksShiftShadowScript },
  "mistake-no-indicator": { kind: "mistake", script: scMergeRoadworksShiftMistakeNoIndicatorScript },
  "mistake-squeeze-cones": { kind: "mistake", script: scMergeRoadworksShiftMistakeSqueezeConesScript },
};

/**
 * Record one of the three drives against a loaded hz-roadworks-v1 document —
 * the template's staged open-lane car armed, the cone set staged as obstacle
 * rects, ambient traffic zero (the harness law). collisionMinKmh 0 so even a
 * gentle brush of a cone grades COLLISION (doc 76 §0). Deterministic: same
 * district → same trace.
 */
export function recordScMergeRoadworksShiftDrive(
  districtRaw: unknown,
  name: ScMergeRoadworksShiftTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_ROADWORKS_SHIFT_ID,
    kind,
    seed: 7,
    obstacles: roadworksConeRects(),
    collisionMinKmh: 0,
    stagedEvents: [...(SC_MERGE_ROADWORKS_SHIFT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
