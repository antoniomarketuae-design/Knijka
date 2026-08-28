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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * „THE REFERENCE DRIVE CRAWLS AT 9–11 КМ/Ч" — THAT IS THE HARNESS, NOT THIS
 * FILE, AND THE PROOF IS 102 LESSONS WIDE — 2026-08-20.
 *
 *   sc-merge-lane-end/pc-right/04-t161s.png, routed here:
 *   „The reference 'right' drive crawls at 9–11 км/ч for 160 seconds on a
 *    50 km/h street and finishes stopped against a building facade, off the
 *    carriageway, with a parked car beside it. Nothing about that drive
 *    demonstrates a zip merge."
 *
 * THE FRAME REFUTES IT WITH ITS OWN CLOCK. Bottom-left of that screenshot the
 * demo transport reads **0:13 / 0:30**, and the annotation on the glass is step
 * 5 of `scMergeLaneEndShadowScript` («В огледалото: кола в лявата лента, почти
 * наравно с нас…»). The authored drive is 30 seconds long and was playing
 * correctly at the moment of the complaint. The car crawling for 160 s is the
 * EGO — the audit harness's own car, which is not this file's output.
 *
 * WHY IT CRAWLED, in one constant: `tools/mobile/lesson-audit.mjs` drives
 * „right" as a closed-loop control law holding `CRUISE_KMH = 12` with a
 * stop-and-look cadence. Its per-frame speeds in this run are 14, 0, 11, 2, 0,
 * 10, 11, 0 … — the law, not the lesson.
 *
 * THE CONTROL IS IN THE SAME LESSON, ON THE SAME BUILD. Four runs exist for
 * sc-merge-lane-end and they split by MODE, not by platform:
 *     mobile-right  top 25 км/ч · 22 full stops
 *     pc-right      top 15 км/ч · 21 full stops
 *     mobile-wrong  top 59 км/ч ·  0 full stops
 *     pc-wrong      top 59 км/ч ·  0 full stops
 * Same world, same physics, same car. Only the input script differs: „wrong"
 * holds the throttle, „right" taps it.
 *
 * AND IT IS THE WHOLE SWEEP, NOT THIS LESSON. Over the 102 lessons that have
 * both PC runs, mean top speed is **15.2 км/ч right against 59.5 км/ч wrong**;
 * **96 of 102** right drives never exceeded 20 км/ч, against 5 of 102 wrong
 * drives. So any finding phrased „the right drive never reached X", „the
 * objective never fired", „the vehicle never exceeds walking speed" is at least
 * partly a reading of `CRUISE_KMH`. That is the reassuring-direction instrument
 * bug's mirror image — an instrument that convicts — and it is worth exactly as
 * much scepticism.
 *
 * WHAT THE AUTHORED DRIVE ACTUALLY DOES is pinned by the gate rather than by
 * this paragraph: `__tests__/sc-merge-lane-end-traces.test.ts` now asserts the
 * shadow's speed envelope and where it comes to rest, precisely so this claim
 * cannot be re-filed against a file that never made it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * W16 — sc-merge-lane-end:ae6166e2. THE DECK NARRATED FURNITURE THE WORLD DOES
 * NOT DRAW, AND THAT HALF WAS THIS FILE'S.
 *
 * The row is „the lesson's own event never happens: the lane does not end", and
 * templates-merging.ts's W15 note routed the COPY half here in as many words:
 * the sentence the audit photographed on the glass is not an `instructionsBg`
 * step, it is `annotation.textBg` on the shadow demo, painted by the demo deck
 * (TraceTimeline.tsx:779/:794).
 *
 *   .audit-frames/sweep161/sc-merge-lane-end/pc-right/04-t120s.png — the deck
 *   caption box reads «Караме в дясната лента. ЗНАКЪТ И МАРКИРОВКАТА казват
 *   едно: тази лента свършва след около 180 метра» over a carriageway of
 *   unchanged width with no sign, no taper paint, no chevrons and no merge
 *   arrow anywhere in the frame.
 *
 * TWO CAPTIONS ASSERTED SOMETHING VISIBLE, and neither is drawable today:
 *  · the shadow's opener claimed a SIGN and a MARKING. `buildWorldGeometry
 *    (ln-merge-v1)` ships 35 sign kinds and NOT ONE is a narrowing / lane-drop /
 *    merge sign (world/types.ts:448-526, re-read by the W15 verifier), and the
 *    map builds `markingQuads` with no taper in them. The claim cannot be true
 *    on any build of this district.
 *  · the no-indicator demo claimed «лентата ВЕЧЕ СЕ СТЕСНЯВА». `ln-merge-v1`
 *    is ONE edge (`lnm-e-street`) carrying `lanes: 2` over all 280 m, so the
 *    carriageway never narrows anywhere on it.
 * Both now say what is true and teach the same beat: the lane ends and the
 * merge is OURS to make — the ratified wording of the template's own
 * instruction 1 («стеснението е твое, не на другите»), which claims no
 * furniture.
 *
 * WHAT THIS DOES NOT CLOSE, stated so nobody reads the row as finished: the
 * WORLD half. A student still sees no taper, and making him see one is two
 * files neither this lane nor the template lane owns — a `laneEnds` (А
 * „Пътно стеснение") member in `world/builders/signs.ts` plus its census row,
 * and THEN `tools/maps/gen_ln_merge.mjs` (with its two committed copies)
 * placing it at `meta.scenario.taperFromY` = 180 with the М-taper paint 180 →
 * 240 and `lanes` dropping 2 → 1 past it. Until the sign kind exists the
 * generator has nothing to place. What is gone is the product TELLING the
 * student it is there while he is looking straight at where it is not.
 * ═══════════════════════════════════════════════════════════════════════════
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
      { kind: "annotation", textBg: "Караме в дясната лента — тя свършва след около 180 метра. Стеснението е наше: ние се съобразяваме." },
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
      { kind: "annotation", textBg: "Краят наближава, а водачът още кара право напред — чака „да се отвори“." },
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
