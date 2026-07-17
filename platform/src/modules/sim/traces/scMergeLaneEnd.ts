/**
 * sc-merge-lane-end — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Краят на лентата — вливане с цип" (ЗДвП чл. 25) on the
 * committed ln-merge-v1 district. Ambient traffic ZERO (seed 7), dry day; the
 * ONLY staged actor is the through-lane car of SC_MERGE_LANE_END.staged — the
 * rearTailgater runner, which emits ZERO SimTick events by contract (pressure
 * scenery, doc 72 FO-07). Everything the gate asserts therefore comes from the
 * PLAYER's own channels.
 *
 * HONEST PROXY (flagged, the scMergeAccelLane precedent): the „изтласкване"
 * consequence is an AUTHORED contact (DriveStep.collision — the scJunctions2
 * „скритата кола удря носа" beat) rather than a physical overlap: the
 * rearTailgater runner cannot collide, and an authored beat is honest demo
 * data, never a silent detector. The trace gate proves the geometry the beat
 * depicts (the wheel goes over into an occupied lane with no glance behind it).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: rolls the ending lane at 45 → mirror → EASES to 30 and lets the
 *     through-lane car go by → indicator + mirror + shoulder → merges into the
 *     пролука behind it, 34 m of commit inside the taper → cancels → runs the
 *     survivor lane out. ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE;
 *   - „Вливане без мигач в последния метър": mirror checked, NO indicator ever,
 *     wheel over at the last usable metres → EXACTLY LANE_CHANGE_WITHOUT_
 *     INDICATOR (the glance is real — the demo is about the missing signal, and
 *     the recovery run is clean);
 *   - „Изтласкване на кола от съседната лента": indicator ON, no glance at all,
 *     wheel straight into the occupied lane → EXACTLY LANE_CHANGE_WITHOUT_
 *     MIRROR_CHECK + COLLISION (never LANE_CHANGE_WITHOUT_INDICATOR —
 *     signalling without looking is the whole point of the demo).
 *
 * Geometry pinned to content/world/ln-merge-v1.json (meta.scenario): the
 * one-way street runs on x = 0 — ending/curb lane (laneId 0) x = 4.06, the
 * surviving lane (laneId 1) x = -4.06; the taper runs y ∈ [180, 240]; the
 * street ends at y = 280; spawn lnm-spawn-ending-lane (4.06, 12) heading 0;
 * urban limit 50.
 *
 * PACING LAWS the numbers obey (probed, not guessed — the district battery
 * ln-merge-districts.test.ts re-proves each against the real reducer):
 *  - the street is ONE edge, so no segment joint exists that could drop a lane
 *    delta inside laneChangeJointGraceSec (1.5 s) — the §9 asserts have teeth
 *    wherever the merge lands;
 *  - every merge commits at or after the taper start (y = 180), so the run
 *    spent in laneId 1 stays under keepRightSustainSec (12 s) — on a span-less
 *    2-lane one-way the merged driver IS a keep-right candidate, and the map is
 *    sized so no authored drive can trip it (gen_ln_merge.mjs asserts the
 *    budget at build time);
 *  - the merge is 8.125 m of lateral over 34 m of arc: |laneOffsetM| exceeds
 *    laneKeepMaxOffsetM (3.25) for only ~1.6 m of that lateral ≈ 0.7 s at the
 *    authored 35 km/h — well inside laneKeepSustainSec (3 s), so a clean commit
 *    never grades POOR_LANE_KEEPING;
 *  - nothing brakes harder than the recorder's default 4.6 m/s², which is under
 *    harshBrakeDecelMps2 (7): the ease that lets the through car by can never
 *    read as a causeless slam.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_LANE_END } from "../lessons/scenario/templates-merging";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_LANE_END_ID = "sc-merge-lane-end";

/** ln-merge-v1 lane centers (meta.scenario — the L7 copy truth). */
const X_ENDING = 4.06; // laneId 0 — the lane the drill starts in; it dies at 240
const X_THROUGH = -4.06; // laneId 1 — the survivor
/** ln-merge-v1 spawn + story arclengths (meta.scenario). */
const SPAWN: readonly [number, number] = [X_ENDING, 12];

/** Approach + post-merge cruise, under the posted 50. */
const CRUISE_KMH = 45;
/** Shed in the ENDING lane to let the through-lane car go by — the taught beat.
 *  4.6 m/s² of recorder decel from 45 is far under the harsh-brake threshold. */
const EASE_KMH = 30;
/** The speed every merge is committed at. */
const MERGE_KMH = 35;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — see it early, ease, look, signal, zip
// ---------------------------------------------------------------------------

export function scMergeLaneEndShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Караме в дясната лента. Знакът и маркировката казват едно: тази лента свършва след около 180 метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [X_ENDING, 108]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // The observation pair the rubric names: mirror first (where is the gap,
      // and how fast is it coming?), then the indicator, then the blind spot —
      // wheel last.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "В огледалото: кола в лявата лента, почти наравно с нас. Нейната лента продължава — нашата свършва." },
      { kind: "drive", points: [[X_ENDING, 108], [X_ENDING, 152]], targetKmh: EASE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Отпускаме газта и я пускаме да мине. Пролуката ЗАД нея е нашата — не тази пред нея." },
      { kind: "drive", points: [[X_ENDING, 152], [X_ENDING, 182]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът." },
      // The merge: 8.125 m of lateral over 34 m of arc — the laneId flip lands
      // at y ≈ 200, inside the taper and 80 m before the street ends.
      { kind: "drive", points: [[X_ENDING, 182], [X_THROUGH, 216]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Вписахме се в пролуката с едно движение — никой в лявата лента не спря и не отби заради нас. Мигачът се изключва." },
      { kind: "drive", points: [[X_THROUGH, 216], [X_THROUGH, 276]], targetKmh: CRUISE_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: ранно решение, пълна проверка, вливане в пролука. Твоята лента свършва — значи ти се съобразяваш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Вливане без мигач в последния метър"
// (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scMergeLaneEndMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът вижда края на лентата, но отлага решението до последния метър — и се пъха мълчаливо." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [X_ENDING, 140]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Лентата вече се стеснява, а водачът още кара право напред — чака „да се отвори“." },
      { kind: "drive", points: [[X_ENDING, 140], [X_ENDING, 200]], targetKmh: 40, stopAtEnd: false },
      // The mirror IS checked — this demo is about the missing signal alone, so
      // the glance sits inside mirrorLookbackSec (5 s) of the wheel-over.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Погледна в огледалото — и толкова. Мигач няма: другите ще научат за маневрата, когато вече е започнала." },
      { kind: "drive", points: [[X_ENDING, 200], [X_ENDING, 205]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // The wheel-over: no indicator anywhere in the script.
      { kind: "drive", points: [[X_ENDING, 205], [X_THROUGH, 239]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Мигачът не е учтивост — той е единственият начин намерението ти да стигне до другите ПРЕДИ волана." },
      { kind: "drive", points: [[X_THROUGH, 239], [X_THROUGH, 276]], targetKmh: CRUISE_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Краят на лентата не е изненада. Реши рано, обяви решението — и маневрата става скучна. Скучното е безопасно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изтласкване на кола от съседната лента"
// (LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION)
// ---------------------------------------------------------------------------

export function scMergeLaneEndMistakePushOutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: мигач — и веднага волан. Нито огледало, нито поглед през рамо." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [SPAWN, [X_ENDING, 152]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_ENDING, 152], [X_ENDING, 182]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // Politely signalled — and still blind: the indicator declares, it does
      // not check. NO left glance anywhere near this merge.
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "В лявата лента вече има кола. Тя е в своята лента — нашата свършва. А водачът дори не е погледнал." },
      { kind: "drive", points: [[X_ENDING, 182], [X_THROUGH, 216]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // The authored consequence: the through-lane car is where the wheel went.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.6, brake: true },
      { kind: "annotation", textBg: "„Ще ме пуснат“ не е маневра. Огледалото и рамото са ПРЕДИ волана — винаги." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeLaneEndTraceName =
  | "shadow-correct"
  | "mistake-no-indicator"
  | "mistake-push-out";

const SCRIPTS: Record<
  ScMergeLaneEndTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeLaneEndShadowScript },
  "mistake-no-indicator": { kind: "mistake", script: scMergeLaneEndMistakeNoIndicatorScript },
  "mistake-push-out": { kind: "mistake", script: scMergeLaneEndMistakePushOutScript },
};

/**
 * Record one of the three drives against a loaded ln-merge-v1 document — the
 * template's staged through-lane car armed, ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScMergeLaneEndDrive(
  districtRaw: unknown,
  name: ScMergeLaneEndTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_LANE_END_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MERGE_LANE_END.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
