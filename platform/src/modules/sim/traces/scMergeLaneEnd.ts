/**
 * sc-merge-lane-end — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Краят на лентата — вливане с цип" (ЗДвП чл. 25) on the
 * committed ln-merge-v1 district. Ambient traffic ZERO (seed 7), dry day; the
 * ONLY staged actor is the through-lane car of SC_MERGE_LANE_END.staged — the
 * rearTailgater runner, which emits ZERO SimTick events by contract (pressure
 * scenery, doc 72 FO-07). Everything the gate asserts therefore comes from the
 * PLAYER's own channels — including, since round 3 of sc-merge-lane-end:
 * 0487bcec, the lane-entry measurement the runtime makes of HIS cut-in in front
 * of that car (the lesson's ruleConfig arms LANE_ENTRY_FORCED_BRAKING, and the
 * recorder is handed it below).
 *
 * THE AUTHORED CRASH IS GONE (founder ruling 2026-09-30, «bill the forced
 * braking»). The push-out's consequence used to be an AUTHORED contact
 * (DriveStep.collision — the scJunctions2 „скритата кола удря носа" beat),
 * flagged here as an honest proxy because the through car could not touch
 * anyone. Rounds 1–2 made that car keep station and brake instead of driving
 * through a student, so the replayed demo showed a car stopping short under a
 * «Удар» it never made. The founder ruled that forcing the car in the lane to
 * brake hard IS the push-out, contact or not; the demo now COMMITS it on the
 * road — it swerves in a few metres in front of the car as the car comes past,
 * the car brakes hard (50 → ~21 км/ч) and does not hit it — and the recording
 * bills it physically (LANE_ENTRY_FORCED_BRAKING), with no scripted crash.
 *
 * THE SHADOW WAS RE-TIMED AGAINST THE CAR IT NAMES (round 2's verifier, F6).
 * Replayed through the production stack, the old shadow reached the merge
 * with the through car still 11 m behind it at 50 км/ч, cut in front of it and
 * forced it from 50 to 19 км/ч — under «никой в лявата лента не спря … заради
 * нас» — and painted «кола в лявата лента, почти наравно с нас» while that car
 * was 40 m back. Under the ruling that is the lesson's own mistake, in the demo
 * the L1 aid tells the student to copy. The lift now starts while the car is
 * still coming up from behind (y 80), at 26 км/ч, so the car closes, keeps
 * station for its pressure window and goes BY before the wheel turns: at the
 * signal (y 186) it is already ahead, at the entry ~12 m ahead, and it never
 * slows again.
 * Every caption is checked frame by frame against the replay in
 * __tests__/merge-demo-truth.test.ts.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: rolls the ending lane at 45 → mirror → EASES to 26 while the
 *     through-lane car comes up and goes by → back up to 35 behind it →
 *     indicator + mirror + shoulder → merges into the пролука behind it, 34 m
 *     of commit inside the taper → cancels → runs the survivor lane out. ZERO
 *     violations + CLEAN_DRIVING + SAFE_LANE_CHANGE;
 *   - „Вливане без мигач в последния метър": mirror checked, NO indicator ever,
 *     wheel over at the last usable metres → EXACTLY LANE_CHANGE_WITHOUT_
 *     INDICATOR (the glance is real — the demo is about the missing signal, and
 *     the recovery run is clean);
 *   - „Изтласкване на кола от съседната лента": indicator ON, no glance at all,
 *     wheel over a few metres in front of the car coming past → EXACTLY
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + LANE_ENTRY_FORCED_BRAKING (never
 *     LANE_CHANGE_WITHOUT_INDICATOR — signalling without looking is the whole
 *     point of the demo — and never COLLISION: the car brakes and misses).
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
 *    read as a causeless slam;
 *  - the shadow's lift sits at 26 км/ч, above the gate's 20 км/ч floor („the
 *    lift is a lift, not a stop"), and ends at y 145 — as the car goes past —
 *    so the merge is committed at 35 in the gap behind it.
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
 * WHAT THIS DID NOT CLOSE AT THE TIME: the WORLD half — a student still saw no
 * taper. That half has since LANDED. The paragraph is corrected below rather
 * than deleted, because a routing note that has gone false is how a later lane
 * gets sent to a file that no longer holds the defect.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLLOW-UP — sc-merge-lane-end:ae6166e2, re-verified from this file. THE
 * TAPER IS PAINTED NOW; THE PLATE IS THE HALF STILL OPEN.
 *
 * W16 prescribed the world repair as „a `laneEnds` member in
 * `world/builders/signs.ts`, and THEN `gen_ln_merge.mjs` placing it with the
 * М-taper paint". BOTH halves of that prescription are now wrong, and a lane
 * routed by it would open the wrong files:
 *
 *  · THE PAINT LANDED, and NOT in the generator. `world/builders/markings.ts`
 *    (`planLaneDrop` → `paintLaneDrop`, called from `buildMarkings`, which
 *    `buildWorldGeometry.ts:534` calls on every district) DERIVES the lane drop
 *    from the `meta.scenario` fields ln-merge-v1 has carried since it was
 *    generated — `taperFromY` 180, `taperToY` 240, `laneEndingX` +4.06,
 *    `params.lanesAfter` 1. It swings the closing lane's kerb line in across
 *    the dying lane, hatches the wedge it shuts with the oblique bars the row
 *    calls chevrons, and stops dashing the boundary that becomes the
 *    carriageway edge past 240. Derived rather than authored precisely so the
 *    tarmac and the lesson's gate cannot drift apart — which is why
 *    `tools/maps/gen_ln_merge.mjs` and the two committed district copies are
 *    UNCHANGED and need no change. Gate: `ln-merge-districts.test.ts` „DRAWS
 *    the lane ending: a closing line that crosses the dying lane over the
 *    authored taper" + „stops dashing the boundary the taper turns into a
 *    carriageway edge", both read off the built mesh, both green.
 *
 *  · THE PLATE IS STILL MISSING, and its blocker is CONTENT, not code. There is
 *    still no narrowing member in `SignKind` (world/types.ts) — but minting one
 *    is the wrong FIRST move: `content/signs/signs.json` carries nineteen
 *    А-group rows and not one of them is „Стесняване на пътя" (А23 „Участък от
 *    пътя в ремонт" is the nearest miss and says something else). No row means
 *    no `lawRefs` to retrieve, and ADR-002 forbids free-recalling the Наредба
 *    article to supply them. So the order is: the content row + its face, THEN
 *    the `SignKind` + census row, THEN the placement — not the reverse.
 *
 * AND THE CAPTIONS BELOW STAY AS THEY ARE — that silence is a decision, not an
 * oversight, recorded so the next reader does not "finish" the row by undoing
 * W16. With a taper on the tarmac, re-arming «знакът и маркировката» is
 * tempting; three reasons not to. The „знак" half would still be false. The
 * present wording tracks the RATIFIED instruction 1 of the template
 * („стеснението е твое, не на другите"). And every annotation string below is
 * byte-gated against `content/traces/sc-merge-lane-end/*.trace.json` and their
 * `platform/public/traces/` copies („committed JSON is exactly this script's
 * recording"), so a one-word caption edit is six regenerated artefacts and
 * must be made by whoever owns them, in one hand.
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
 *  4.6 m/s² of recorder decel from 45 is far under the harsh-brake threshold.
 *  26, not the 30 it was: at 30 the car was still beside the ghost when the
 *  wheel turned (round 3 — see the header); at 26 it has gone by. */
const EASE_KMH = 26;
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
      { kind: "drive", points: [SPAWN, [X_ENDING, 70]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // The observation pair the rubric names: mirror first (where is the gap,
      // and how fast is it coming?), then the indicator, then the blind spot —
      // wheel last.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "В лявото огледало: зад нас в лявата лента има кола. Нейната лента продължава — нашата свършва." },
      { kind: "drive", points: [[X_ENDING, 70], [X_ENDING, 80]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // THE TAUGHT BEAT, and it is timed against the car it names (round 3 of
      // sc-merge-lane-end:0487bcec — see the file header): the lift starts while
      // the car is still closing from behind, so it comes up, keeps station for
      // its pressure window and goes BY well before the wheel turns.
      { kind: "annotation", textBg: "Отпускаме газта и я пускаме да мине. Пролуката ЗАД нея е нашата — не тази пред нея." },
      { kind: "drive", points: [[X_ENDING, 80], [X_ENDING, 145]], targetKmh: EASE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_ENDING, 145], [X_ENDING, 186]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът." },
      // The merge: 8.125 m of lateral over 34 m of arc — the laneId flip lands
      // at y ≈ 204, inside the taper and 76 m before the street ends, in the
      // gap the through car has just left behind it.
      { kind: "drive", points: [[X_ENDING, 186], [X_THROUGH, 220]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Вписахме се в пролуката зад нея с едно движение — никой в лявата лента не спря и не отби заради нас. Мигачът се изключва." },
      { kind: "drive", points: [[X_THROUGH, 220], [X_THROUGH, 276]], targetKmh: CRUISE_KMH },
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
      { kind: "drive", points: [SPAWN, [X_ENDING, 120]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // Holds a steady 35 in the ending lane: the through car comes up, keeps
      // station for its pressure window, then comes past at the posted 50.
      { kind: "drive", points: [[X_ENDING, 120], [X_ENDING, 196]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // Politely signalled — and still blind: the indicator declares, it does
      // not check. NO left glance anywhere near this merge.
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "В лявата лента вече има кола — идва отзад, съвсем близо. Тя е в своята лента, нашата свършва. А водачът дори не е погледнал." },
      // THE PUSH-OUT, committed on the road rather than scripted (founder ruling
      // 2026-09-30): the wheel goes over as the car comes past, a few metres
      // behind, so it must brake hard to keep off us — which is what bills
      // LANE_ENTRY_FORCED_BRAKING, contact or not. The car does brake, and it
      // does not hit us.
      { kind: "drive", points: [[X_ENDING, 196], [X_THROUGH, 222]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата в лявата лента трябваше да спира рязко, за да не ни удари. „Ще ме пуснат“ не е маневра. Огледалото и рамото са ПРЕДИ волана — винаги." },
      { kind: "drive", points: [[X_THROUGH, 222], [X_THROUGH, 252]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "pause", sec: 2.6, brake: true },
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
    // The lesson's own rule config — it arms LANE_ENTRY_FORCED_BRAKING (founder
    // ruling 2026-09-30), so a recorded demo is graded by the rules the student
    // is graded by: the push-out must bill it, the shadow must not.
    ...(SC_MERGE_LANE_END.ruleConfig ? { ruleConfig: SC_MERGE_LANE_END.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
