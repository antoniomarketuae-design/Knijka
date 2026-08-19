/**
 * Scenario templates — the FLOW families (pedestrians · roundabout · lanes),
 * DATA ONLY in the templates.ts mold: coordinates are denormalized from the
 * committed district files (zb-v1 / rb-mini-v1 / ln-v1) so nothing loads
 * world JSON at runtime; the trace-gate batteries assert every pinned value
 * against the generated maps.
 *
 * Three templates, one per family (doc 76 §2):
 *  - sc-zebra-approach   „Пешеходна пътека"  (PE-01/PE-02, zb-v1)
 *  - sc-roundabout-entry „Кръгово движение"  (RB-01/RB-02, rb-mini-v1)
 *  - sc-lane-change      „Смяна на лента"    (OV-01/OV-02, ln-v1)
 *
 * Every staged encounter uses EXISTING StagedEventSpec kinds and every
 * mistake demo cites EXISTING rules-catalog codes — verified by replaying
 * the committed traces through the production stack
 * (traces/__tests__/sc-*-traces.test.ts, the §5/§9 gates).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BRIEFING BUDGET — 2026-08-16. WHY EVERY STEP IN THIS FILE IS SHORT AND
 * STARTS WITH A VERB. Written out once, here, because this file holds the
 * worst case; templates-following / -conditions / -conditions2 / -parking3
 * carry the same rewrite and point back at this block.
 *
 * THE DEFECT. `instructionsBg` is compiled into `LessonSpec.briefingBg`
 * (compile.ts) and rendered by SimOverlay's compact card as TWO rows: step 1
 * is THE LINE (`briefingLineBg`) and steps 2..n are THE BODY
 * (`briefingBodyBg`), both inside one 8 rem scroll window. That window's clamp
 * was sized against the thirteen PRE-DRIVE instructions, which are 55–95
 * characters. Nobody re-checked it against the scenario briefings the same card
 * renders: across 166 scenarios / 883 steps the median is 109 characters, p90
 * 174, max 342, and 586 of 883 are outside the band the card was built for.
 *
 * MEASURED ON THE DEPLOYED BUILD, NOT INFERRED (WebKit, real insets, signed in,
 * `/simulator?scenario=sc-zebra-approach&level=1`, speedometer reading
 * «Скорост 0 километра в час» at rest so the probe is honest). A per-character
 * Range walk of both rows against the scroll window's own visible band — its
 * box minus the 10 px mask fade — gives the fold in AUTHORED CHARACTERS:
 *
 *   iPhone 16 LANDSCAPE  window 180 × 127, band 117 px
 *   iPhone 16 PORTRAIT   window 141.5 × 128, band 118 px
 *
 *     LINE chars │ body chars still visible  (landscape / portrait)
 *     ───────────┼──────────────────────────────────────────────────
 *          34    │      122 / 110
 *          42    │      122 / 110
 *          52    │       96 / 110
 *          76    │       96 /  90
 *          96    │       68 /  68
 *         219    │        0 /   0   ← what shipped
 *
 * So the old 219-character step 1 of sc-zebra-approach did not merely clip
 * itself (85 % / 72 % of it survived) — IT DELETED THE ENTIRE BODY. Steps 2–5
 * measured 0 characters visible on both profiles. The graded objective
 * `sc-za-approach` is a ≤ 40 km/h gate 12 m before the zebra, i.e. step 2. The
 * student was graded on an instruction the phone never displayed.
 *
 * THE THREE RULES THIS WAVE APPLIES, each one arithmetic off that table:
 *   1. THE ACT COMES FIRST — the imperative is the first word of every step.
 *      A condition („По тъмно…“), a law citation or a rationale in front of the
 *      verb spends the only characters that are guaranteed to be painted.
 *   2. EVERY STEP ≤ 95 CHARACTERS — back inside the band the card was sized
 *      for. A line of 96 still leaves 68 characters of body above the fold.
 *   3. THE GRADED ACT IS THE LINE where the drill allows it, because
 *      `briefingBg[0]` is the one row that is always painted and can never be
 *      scrolled past — and step 2 is held to 65 characters (+ the „2. “ the
 *      body prefixes it with) so that it renders WHOLE above the fold at the
 *      line length the template actually authors.
 *
 * NOTHING IS DELETED. Condition clauses, чл. citations and rationale moved to
 * their own steps BEHIND the act, or into the step where they apply. The whole
 * briefing is still reachable by scrolling the window, still opens in full
 * behind «ПРОЧЕТИ» with the car stopped, and `teach` is untouched. THEO-4
 * requires that the student gets the reasoning — not that he gets it in the
 * first sentence of a card that clips.
 *
 * WHAT THIS WAVE COULD NOT FIX, stated rather than hidden: on every rung that
 * adds a complication the LINE is not authored here at all — compile.ts puts
 * `complicationBriefingText` at `briefingBg[0]`, and that string is 309–509
 * characters on 61 of the 165 rungs these five files compile. By the table
 * above anything past ~96 zeroes the body, so L4/L5 briefings still show the
 * student nothing but the complication. The fix belongs in compile.ts /
 * complications.ts, which this lane does not own.
 * The probes: `brief-fold.mjs` (what the shipped copy shows) and
 * `brief-budget.mjs` (what the box holds), both driving the deployed build.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  BrakingLeadCarSpec,
  PedestrianDartOutSpec,
  RoundaboutEntrySpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; each battery asserts the copies match the map files)
// ---------------------------------------------------------------------------

/** Drawn lane width at the perceptual road scale (contracts.ts × 3.25 m). */
const LANE_W = 8.125;
/** Right-lane center of a 1-lane-per-direction street (zb-v1 / rb arms). */
const LANE_2 = 4.06;
/** Right/left lane centers of the 2+2 boulevard (ln-v1 meta.scenario). */
const LN_RIGHT = 12.19;
const LN_LEFT = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-zebra-approach — „Пешеходна пътека" (PE-01 hot approach / PE-02
//    dart-out at a marked crossing) on zb-v1
// ---------------------------------------------------------------------------

/**
 * The staged SLOW CROSSER at zb-x-1 (0, 90): steps off the WEST curb at walk
 * speed (1.4 m/s — the slow-crosser tier of the dart-out spec; a runner would
 * be ~2.9) once the player closes within ~55 m at any driving speed. Curb
 * offset math is the L4 convention: half-carriageway 8.125 + 0.4 curb +
 * 1.2 stand-back = 9.725 m; road span on the walk = [1.6, 17.85] m.
 * triggerDistM 55 releases her EARLY — she is already ON the zebra while the
 * approaching car is still far enough to stop from any legal urban speed
 * (the PE-01 teaching moment, and what lets the too-fast demo grade ONLY
 * its approach-speed code).
 */
const ZEBRA_PED: PedestrianDartOutSpec = {
  id: "sc-za-ped",
  kind: "pedestrianDartOut",
  crossingId: "zb-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: -9.73, y: 90 },
  dir: { x: 1, y: 0 },
  speedMps: 1.4,
  // 20.0 m, not 23.45 (doc 87 B14 — the residual doc 86 L9 noted and never
  // actioned). zb-v1's pavement spans x ∈ [8.53, 12.03] (half-carriageway 8.125
  // + 0.4 curb + SIDEWALK_WIDTH_M 3.5), and the old walk-out rested her at
  // x = +13.72 — 1.7 m PAST the back of the pavement, standing on bare verge at
  // the end of every run. 20.0 m lands her at x = +10.27, mid-pavement: clearly
  // off the carriageway, clearly ON the footway. The road span is untouched
  // (roadFromM/roadToM below still govern when she is clear of the road), so the
  // graded encounter and every committed recording are identical.
  travelM: 20.0, // curb → across the 16.25 m carriageway → 2.15 m onto the pavement
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
  // ETA SYNC (contracts.ts PedestrianDartOutSpec.triggerEtaSec). 55 m is a
  // DISTANCE and her walk is a CLOCK, so the 55 m alone made the encounter a
  // function of how fast the student drove: at 40 km/h she is mid-carriageway
  // when he arrives, at 15.5 km/h she finishes as he arrives, and below that
  // he reaches a bare zebra — i.e. obeying instruction 2 („вдигни крака от
  // газта") deleted the hazard instruction 3 exists to teach. Under 10 км/ч
  // she never left the curb at all. The founder photographed the end state:
  // stopped at 0 км/ч in front of an empty crossing, congratulated for
  // yielding to nobody.
  //
  // 9.0 s is chosen from the PICTURE it guarantees, and every number in it is
  // this spec's own:
  //   · she is `speedMps × 9` = 12.6 m along the walk when the car reaches the
  //     crossing, whatever speed it came in at. From start.x −9.73 that is
  //     x = +2.87 — INSIDE the student's own lane (the northbound lane spans
  //     x 0…8.125), 1.2 m short of the line his bonnet tracks. Not „somewhere
  //     on the paint": in his path, at every speed.
  //   · 55 / 9 = 22.0 km/h is where the two gates cross. ABOVE it the authored
  //     55 m still binds, so the too-fast demo (45 km/h) and every ordinary
  //     approach release exactly where they always did — all three committed
  //     recordings are byte-identical, and not marginally: the shadow's own
  //     time-to-arrival at the 55 m gate is 7.10 s and the too-fast demo's is
  //     5.82 s, both comfortably inside a 9 s horizon. BELOW 22 km/h the
  //     seconds bind, and that is precisely the band the briefing asks him to
  //     drive in.
  //   · under the 10 km/h floor the same rule at the floor speed gives
  //     2.78 × 9 = 25.0 m. That number has to beat one specific distance: the
  //     first objective's reachZone is centred (4.06, 78) r 10, so a student
  //     who completes this lesson AT ALL must come within hypot(4.06, 22) =
  //     22.4 m of the crossing. 25.0 > 22.4, so there is no longer any way to
  //     drive this lesson — however timidly, including stopping dead and
  //     waiting — without meeting her. The flat 8 m creep radius could not
  //     reach a car halted „на няколко метра" before the paint, which is
  //     exactly what instruction 3 tells him to do.
  triggerEtaSec: 9.0,
};

/**
 * PE-01/PE-02 — the marked-zebra approach (ЗДвП чл. 119: пропусни стъпилите
 * на пътеката; чл. 119 ал. 4 — приближавай със скорост, позволяваща спиране).
 */
export const SC_ZEBRA_APPROACH: ScenarioSpec = {
  id: "sc-zebra-approach",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "градско каране"],
  titleBg: "Пешеходна пътека",
  objectiveBg:
    "Приближи маркираната пешеходна пътека със скорост, която позволява спиране, пропусни пешеходеца на нея и премини едва когато пътеката е свободна.",
  // Doc-72 provenance: PE-01 (hot approach to an occupied zebra) + PE-02
  // (pedestrian appears at a marked crossing).
  archetypeIds: ["PE-01", "PE-02"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in zb-v1.json meta.scenario.params
    // (tools/maps/gen_zebra_street.mjs).
    params: { crossings: 2, signalized: "no", approachM: 90 },
    districtId: "zb-v1",
  },
  start: {
    spawnPointId: "zb-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // THE STEP THE PHONE NEVER SHOWED. Step 1 was 219 characters, of which 68 %
    // was a level-5 night clause; measured on the deployed build it filled the
    // whole text window and left the body at 0 % VISIBLE on BOTH profiles — so
    // steps 2-5 did not exist for a phone. The graded objective (sc-za-approach,
    // a <=40 km/h gate 12 m short of the zebra) was step 2. He was graded on an
    // instruction the card never printed.
    // SO THE GRADED ACT IS NOW THE LINE. briefingBg[0] is the one row that is
    // always painted and can never be scrolled away from (overlayQueue
    // briefingLineBg), so the approach speed lives there and nowhere else.
    // AND THE NIGHT CLAUSE IS ITS OWN STEP, LAST. It is conditional — at L1-L4 it
    // is not true yet — and it is what pushed the action off the screen. Nothing
    // is deleted: at the rung where it DOES apply (L5 night) the ladder's own
    // complication is briefingBg[0] and already names късите светлини
    // (complications.ts „По тъмно“), so the duty is on the LINE exactly when it
    // arises, and this pair is the crossing-specific half the complication has
    // no way to say. Ledger L10 (ЗДвП чл. 70) stays satisfied either way.
    // AND THE NUMBER ON THE LINE IS THE ONE THE CARD NOW SPEAKS — sweep 161,
    // 2026-08-19. `pc-right/01-arrival.png` shows this step reading „под 40
    // км/ч" beside a task card reading «— дръж под 45 км/ч»: the L1 ladder's
    // grace had gone onto the glass as an instruction. advisor.ts's authored-cap
    // source closed that, and `__tests__/flow-sweep161-truth.test.ts` §2 now
    // pins the pair — all five rungs print 40 and this step says 40 — so the
    // two can never drift apart again unnoticed.
    // WHAT IS STILL OPEN, and is a NAMED DEBT rather than a silent edit: 40 is
    // above `DEFAULT_RULE_CONFIG.crossingApproachMaxKmh` (30), the threshold
    // `rules/engine.ts` bills PEDESTRIAN_CROSSING_TOO_FAST at once the crossing
    // is occupied — which, after the triggerEtaSec sync above, it always is by
    // the time the car is here. The debt, its measurement and the two files
    // that must move with it are in §2 of the same gate.
    // 66 ch
    { n: 1, textBg: "Потегли, движи се в своята лента и приближи пътеката с под 40 км/ч." },
    // 46 ch
    { n: 2, textBg: "Вдигни крак от газта и огледай двата тротоара." },
    // 65 ch
    { n: 3, textBg: "Спри няколко метра преди пътеката, ако пешеходец е стъпил на нея." },
    // 77 ch
    { n: 4, textBg: "Изчакай пешеходеца да освободи цялото платно — не потегляй, докато е на него." },
    // 42 ch
    { n: 5, textBg: "Премини спокойно, щом пътеката е свободна." },
    // 60 ch
    { n: 6, textBg: "Включи късите светлини по тъмно (чл. 70) още преди пътеката." },
    // 76 ch
    { n: 7, textBg: "Помни: нощем фаровете са и погледът ти към тротоара, и знакът за пешеходеца." },
  ],
  success: [
    {
      id: "sc-za-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      // The pre-crossing checkpoint 12 m before zb-x-1: reaching it at a
      // speed that still allows a full stop is the PE-01 skill itself.
      //
      // 40 IS A NAMED DEBT, NOT A SETTLED NUMBER — sweep 161, 2026-08-19, and
      // it is written down here because the wave that found it also found why
      // it cannot be spent from this file alone.
      //
      // THE DEBT. `rules/engine.ts` bills PEDESTRIAN_CROSSING_TOO_FAST above
      // `crossingApproachMaxKmh` (rules/types.ts = 30) the moment the crossing
      // is occupied, and after the triggerEtaSec sync above it always is by the
      // time the car is here. So this gate certifies a band — 30…40, and 30…45
      // once the L1 ladder widens it — that the same drill convicts inside. The
      // identical row is closed one family over (`sc-drt-approach` at 30) and
      // five more are carried as named debts in `pe-sweep161-truth.test.ts`
      // §2 for exactly this reason; this is the flow file's row.
      //
      // WHAT WAS MEASURED, so the next lane starts from numbers and not from
      // scratch. Peak |speed| inside the authored r 10 disc, off the committed
      // recordings driven through the production session:
      //   shadow-correct       27.9 км/ч   passes at 30 with 2.1 км/ч to spare
      //                                    BEFORE the evaluator's 5 км/ч slack
      //   mistake-not-yielded  27.9 км/ч   passes at 30 too — correct: its
      //                                    fault is the crossing, not the
      //                                    approach
      //   mistake-too-fast     44.9 км/ч   TICKS THIS ROW AT 30 EXACTLY AS AT
      //                                    40. Moving the cap changes no
      //                                    verdict on any committed drive.
      // The reason the last line is not a typo: the demo arrives at 44.9,
      // spends the latch (REACH_ZONE_CAP_SLACK_KMH), then brakes to rest INSIDE
      // the disc and re-earns it. That re-earn is deliberate and documented at
      // `objectives.ts REACH_ZONE_CAP_SLACK_KMH` („IT CANNOT TRAP ANYONE"), and
      // it is why this drill's own mistake card has to say «Дори спирането след
      // това да успее, самото приближаване без готовност е опасната грешка»:
      // the disc grades an ARRIVAL, the offence is an APPROACH, and
      // `ReachZoneParams` carries no field with which a template can ask for
      // the second. GAINING THAT OBSERVATION is `lessons/objectives.ts`'s and
      // nothing this file can author closes it.
      //
      // WHY IT WAS NOT SIMPLY MOVED. 40 → 30 was applied, measured green, and
      // then REVERTED: it turns five assertions red in two files this lane does
      // not own, both of which use this exact row as their fixture —
      //   lessons/__tests__/advisor-authored-cap.test.ts:325,326,348,361,362
      //     („sc-za-approach is the case where the two numbers actually differ
      //      (40 authored, 45 graded)" — 4 tests)
      //   scenario/__tests__/briefing-card-budget.test.ts:167  (`toBe(40)`)
      // Every one is a stale literal and not a broken property: all five
      // invariants survive the move. But the gain here is only in the SENTENCE
      // — no drive changes verdict — and buying it with red in two concurrent
      // lanes' files is the trade this round exists to stop making. §2 of
      // `__tests__/flow-sweep161-truth.test.ts` holds the debt so it cannot be
      // forgotten, and turns red the day it is paid.
      //
      // WHAT IS CLOSED MEANWHILE is the half the sweep actually photographed:
      // the card no longer prints the ladder's grace at the student. All five
      // rungs speak 40 — instruction 1's own number — instead of 45 at L1.
      params: { kind: "reachZone", x: LANE_2, y: 78, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-za-clear",
      // WAS «Премини пътеката, СЛЕД КАТО е свободна» — a certificate no disc
      // can sign, and this row is one of the seven the catalogue rule's own
      // vocabulary let through: `ACTOR_CLAIM`
      // (lessons/__tests__/stop-claim-gates.test.ts) carries «когато е
      // свободна», the flow/PE families write «след като е свободна», and the
      // alternation never met them. templates-pe.ts closed its six in that
      // wave and named the gap; this is the flow row that stayed.
      //
      // MEASURED, not argued — the committed «Непропускане на пешеходец» demo
      // driven through the production session at L1 and L3:
      //     ✓ Премини пътеката, след като е свободна   0:14  /  0:15
      //     ✗ PEDESTRIAN_NOT_YIELDED                   −10, опасна
      // The tick and the conviction are the same drive, and the tick is the
      // one a seventeen-year-old reads as „I did that part right". He drove
      // over the crossing at a steady 27.9 км/ч with the woman still on the
      // carriageway; nothing in `stepReachZone`'s (params, prev, tick) could
      // have known, because no field of SimTick carries where she was.
      //
      // The remedy is the one commit cdb2f71 established and templates-pe.ts
      // reused verbatim, down to the sentence: THE TITLE SAYS WHAT THE DISC
      // MEASURES and the duty keeps its grader in the rule engine. `params` is
      // untouched, so `done` is bit-identical on every committed drive and no
      // THEO-4 card is owed for a changed verdict — only the claim shrank to
      // what was witnessed. Instruction 5 still teaches the real duty, and
      // PEDESTRIAN_NOT_YIELDED still bills it.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 130, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scZebraApproach.ts; gates in traces/__tests__/
  // sc-zebra-approach-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-zebra-approach/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-zebra-approach/mistake-too-fast.trace.json",
      },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата навлезе в зоната на пътеката с непроменена висока скорост, докато пешеходката вече беше на платното. Дори спирането след това да успее, самото приближаване без готовност е опасната грешка — чл. 119 изисква скорост, позволяваща спиране.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: {
        path: "content/traces/sc-zebra-approach/mistake-not-yielded.trace.json",
      },
      titleBg: "Непропускане на пешеходец",
      whatWentWrongBg:
        "Водачът прецени, че „има място“, и мина през пътеката, докато пешеходката още пресичаше. Пешеходецът на пътеката има предимство по чл. 119 — пропускаш го, като при нужда спреш напълно, а не като се разминаваш с него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При всяка маркирана пешеходна пътека без светофар — пред училища, спирки и магазини. Пешеходецът, стъпил на пътеката, има предимство, а ти дължиш скорост, която позволява да спреш.",
    whyBg:
      "Ударите на пешеходни пътеки са сред най-тежките градски произшествия — пешеходецът няма ламарина около себе си. Разликата между 30 и 50 км/ч при удар е разликата между натъртване и живото­застрашаваща травма, затова законът изисква готовност за спиране още при приближаването.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият гледа три неща: отчетливо намаляване при приближаване към пътеката, пълно спиране при пешеходец на нея и потегляне едва когато пътеката е освободена. Преминаване, докато пешеходецът е на платното, е опасна грешка и прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      // Изпитни условия: full cold-start protocol (exam ladder default aids).
      vehicleStart: "cold",
    },
      { level: 5, conditions: { night: true } }, // L5: пътека нощем — късно разпознаване
  ],
  staged: [ZEBRA_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-roundabout-entry — „Кръгово движение" (RB-01 entry without yielding /
//    RB-02 exit without right indicator) on rb-mini-v1
// ---------------------------------------------------------------------------

/**
 * The staged CIRCULATING CAR on the rb-mini-v1 ring (CCW loop w → s → e →
 * n → w, cruise 6 m/s): the RoundaboutEntryRunner syncs it to sit
 * `conflictLeadM` upstream of the player's south entry at arrival — the
 * "do I go or wait" moment — and the runtime's own circulatingConflict
 * tracker adjudicates the entry (FAILED_TO_YIELD / yielded commendation).
 */
const RB_CIRCULATING: RoundaboutEntrySpec = {
  id: "sc-rb-circulating",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: 18,
  actor: {
    pathNodes: ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 }, // dormant on the far (west) arc
    // 2.5 m/s (9 km/h, the runner's minSyncSpeedMps floor) — the timing dial
    // that keeps the whole LAWFUL tail-the-gap drive conviction- AND
    // collision-free. Two windows must both stay closed and they pull opposite
    // ways on car speed:
    //  · ENTRY: the ~90° arm→ring merge must be SLOW (spread > 5 s so it never
    //    sums to the 55° turn threshold), which leaves the roundabout yield
    //    tracker open until the driver sweeps RB_ON_RING_DEG (35°). A slow
    //    circulator stays on the driver's RIGHT (east arc) through that merge,
    //    reaching the north/left band only after ring priority is held.
    //  · EXIT: the driver circulates the ring FASTER than the car, so a fast
    //    circulator would be caught and rear-ended at the north exit. At 2.5
    //    m/s the car is still on the SE/E arc (well behind) when the driver
    //    reaches the north exit — no catch-up.
    // The shadow-trace gate proves the whole envelope.
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -18 }, // the player's south entry mouth (rbm-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 14,
  armDistM: 60,
  minSyncSpeedMps: 2.5,
  maxSyncSpeedMps: 8.5,
};

/**
 * RB-01/RB-02 — single-lane roundabout entry + signalled exit.
 *
 * WHERE THE PRIORITY ACTUALLY COMES FROM (corrected 2026-08-03; this file used
 * to cite „ЗДвП чл. 50а" and told the student that чл. 50а „изисква да
 * пропуснеш всички, които вече се движат по кръговото"). Retrieved, not
 * recalled:
 *
 *   ЗДвП чл. 50а (Нов - ДВ, бр. 51 от 2007 г.): „Забранено е навлизането в
 *   кръстовище дори и при разрешаващ сигнал на светофара, ако обстановката в
 *   кръстовището ще принуди водача да спре в кръстовището или да възпрепятства
 *   напречното движение."
 *
 * That is the BLOCKED-JUNCTION rule and it contains no word about roundabouts.
 * Two independent greps of ЗДвП (288 units, ДВ бр. 55/16.06.2026) and of
 * ППЗДвП return exactly ONE hit for „кръгов" between them that is a traffic
 * rule — and it is не за предимство. There is no statutory roundabout-priority
 * rule in Bulgarian law at all. The duty is built from the SIGN plus чл. 50:
 *
 *   Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5: „Пътен знак Б3 не може да
 *   се поставя на входовете на кръгово кръстовище."
 *   …ал. 2: „Пътищата без предимство, които пресичат пътя с предимство или се
 *   вливат в него, задължително се сигнализират с пътни знаци Б1 или Б2."
 *   ЗДвП чл. 50, ал. 1: „На кръстовище, на което единият от пътищата е
 *   сигнализиран като път с предимство, водачите на пътни превозни средства от
 *   другите пътища са длъжни да пропуснат пътните превозни средства, които се
 *   движат по пътя с предимство."
 *   ЗДвП чл. 28, ал. 1, т. 2: „десен пътепоказател… - за завиване надясно или
 *   за отклонение надясно." (изходът е отклонение надясно)
 *
 * The theory bank states it in exactly these terms (q-predimstvo-021/022,
 * q-krastovishta-012/013/064/065) — the two surfaces must not disagree.
 */
export const SC_ROUNDABOUT_ENTRY: ScenarioSpec = {
  id: "sc-roundabout-entry",
  family: "roundabout",
  tagsBg: ["кръгово движение", "предимство", "мигачи"],
  titleBg: "Кръгово движение",
  objectiveBg:
    "Приближи кръговото с готовност за спиране, пропусни движещите се в кръга, влез в подходящ интервал и излез на втория изход с включен десен мигач.",
  // Doc-72 provenance: RB-01 (entry without yielding to the ring) + RB-02
  // (exit without the right indicator).
  archetypeIds: ["RB-01", "RB-02"],
  conceptIds: ["c-roundabout-rules", "c-roundabout-behavior", "c-driver-signals"],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-mini-v1.json meta.scenario.params
    // (tools/maps/gen_mini_roundabout.mjs).
    params: { ringRadiusM: 18, arms: 4, armLengthM: 90, ringSpeedKmh: 30, armSpeedKmh: 40 },
    districtId: "rb-mini-v1",
  },
  start: {
    spawnPointId: "rbm-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Step 2 was two sentences and 104 characters — a look and a yield welded
    // together. Split: what to look at, then what to do about it. Step 4 likewise
    // carried the pass-the-first-exit fact and the indicator order in one breath.
    // 62 ch
    { n: 1, textBg: "Приближи кръговото и намали преди знака „Пропусни движението“." },
    // 53 ch
    { n: 2, textBg: "Гледай наляво — движещите се в кръга имат предимство." },
    // THE STOP IS NOW CONDITIONAL, BECAUSE THE SIGN IS Б1 AND NOT Б2 —
    // sweep 161, `sc-roundabout-entry/pc-right/01-arrival.png`. Step 3 read
    // «Спри на линията и пропусни всяка кола, която вече е в кръга»: an
    // unconditional halt, on an approach where no map this product can build
    // will ever carry the sign that demands one.
    //
    // Asked of the world rather than of taste. `builders/network.ts`
    // `junctionPriorityControls` short-circuits on a roundabout node —
    // „if (!a.roundabout && a.incoming) out.set(a.edgeId, 'giveWay')" — and
    // returns before the rank test that is the only path to "stopSign". So a
    // roundabout arm CANNOT wear a Б2, by construction, on any of the districts
    // in `content/world`; the four posts rb-mini-v1 builds are Б1 + Г12, and
    // the frame shows the inverted red triangle where the copy said „спри".
    //
    // The law the same product already teaches, one file over
    // (templates-junctions2.ts `SC_JUNCTION_GAP.teach.whenBg`, verbatim):
    // „разликата е само че при Б1 не си длъжен да спреш, а при Б2 си." And
    // this template's own barge-entry card has said the conditional form all
    // along — „дори това да значи пълно спиране на входа". Two of the three
    // surfaces were right and the graded lesson's instruction was the wrong
    // one, which is the direction that reaches the student first.
    //
    // Nothing is loosened: the YIELD is verbatim and still graded by the
    // roundabout tracker (FAILED_TO_YIELD on the barge demo), and
    // `sc-rb-approach` never measured a stop — it is a ≤ 25 км/ч disc cut at
    // the paint by `acceptBeforeMarkM`, which a full stop and a lawful roll
    // both satisfy. What goes is a duty the exam does not impose and this
    // engine cannot bill: an unnecessary halt at a clear give-way line is
    // marked against a candidate in the real Наредба № 38 drive, so teaching it
    // as a rule is the founder's complaint one step upstream — the card would
    // have cost him points no simulator was ever going to warn him about.
    // 79 ch
    { n: 3, textBg: "Пропусни всяка кола, която вече е в кръга — спри на линията, ако няма пролука." },
    // 66 ch
    { n: 4, textBg: "Влез плавно в подходящ интервал, обратно на часовниковата стрелка." },
    // 57 ch
    { n: 5, textBg: "Подмини първия изход — твоят е вторият, направо на север." },
    // 65 ch
    { n: 6, textBg: "Включи десния мигач преди своя изход и излез по улицата на север." },
  ],
  success: [
    {
      id: "sc-rb-approach",
      titleBg: "Приближи кръга с готовност за спиране",
      // The yield-line checkpoint just outside the decision zone (ring 18 m +
      // 12 m entry margin): arriving slowly is the RB-01 setup skill.
      //
      // doc 87 B18 („the green circle is put AFTER the give-way line") took
      // two passes, and this is the second one.
      //
      // The DRAWN marker was fixed in scene/guidanceRoute.ts: it is clamped to
      // a gate bar 0.80 m on the approach side of the М8 bars at y = −35.725,
      // and guidance-geometry.test.ts pins that. The anchor below deliberately
      // stays at y = −34 — the clamp only fires on a waypoint authored PAST
      // the line, so moving it back would silently delete the bar and put the
      // circle back.
      //
      // What was still wrong is the half the founder actually feels: the
      // GRADE. A radius-9 circle centred 1.725 m inside the mouth credits a
      // car stopped anywhere from 7.3 m past the paint backwards, so „stop at
      // the give-way line" was ticked off by a driver sitting in the ring —
      // and the L1/L2 tolerance ladder widened that forwards too.
      // `acceptBeforeMarkM` cuts the acceptance at the paint itself: 1.725 m
      // is the exact authored-mark → М8-bar distance (asserted against the
      // district's own stop line in guidance-geometry.test.ts, so a map change
      // cannot leave this number lying). Stopping SHORT still counts, at every
      // rung, with every metre the ladder adds; stopping past the bars never
      // does. „I have to stop before the line not after it."
      params: {
        kind: "reachZone",
        x: LANE_2,
        y: -34,
        radiusM: 9,
        maxSpeedKmh: 25,
        acceptBeforeMarkM: 1.725,
      },
    },
    {
      id: "sc-rb-ring",
      titleBg: "Премини през кръговото и излез с десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator — an unsignalled exit voids the traversal.
      //
      // enterRadiusM 24, AGAINST THE GEOMETRY (founder R3 #6: „reaching the
      // end did not end the lesson"). The rb-mini ring polyline sits at r=18,
      // but the drivable band is 18 ± LANE_WIDTH_M/2 = 18 ± 4.06 — a live
      // driver keeping honestly right circulates at r ≈ 20–22 and at the old
      // 21 the `entered` latch (d <= enterRadiusM) could NEVER fire, leaving
      // the objective structurally uncompletable on a legal line. 24 covers
      // the outer drivable edge (22.06) + margin, and stays inside the exit
      // window's start so mid-ring wobble cannot bank a false exit signal.
      // All three committed traces replay IDENTICALLY at 21 and 24 (shadow
      // dips to d=17.9; the no-signal demo still voids) — traces untouched.
      params: { kind: "completeManeuver", maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 24, exitRadiusM: 34 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRoundaboutEntry.ts; gates in traces/__tests__/
  // sc-roundabout-entry-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-roundabout-entry/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-roundabout-entry/mistake-barge-entry.trace.json",
      },
      titleBg: "Влизане без пропускане",
      whatWentWrongBg:
        "Колата навлезе в кръга с непроменена скорост точно пред движещия се в него автомобил. Влизащият НЯМА предимство, и причината стои на самия вход: знакът „Път с предимство“ Б3 не може да се поставя на входовете на кръгово кръстовище (Наредба № РД-02-21-1/23.11.2023 за пътните знаци), затова там винаги стои Б1 или Б2 и ти си на пътя без предимство. А на кръстовище, на което единият път е сигнализиран като път с предимство, водачите от другите пътища са длъжни да пропуснат движещите се по него (ЗДвП чл. 50, ал. 1) — дори това да значи пълно спиране на входа.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: {
        path: "content/traces/sc-roundabout-entry/mistake-exit-no-signal.trace.json",
      },
      titleBg: "Излизане без десен мигач",
      whatWentWrongBg:
        "Изходът от кръга беше взет рязко и без десен мигач — никой около кръга не знаеше, че колата напуска. Излизането е отклонение надясно и се обявява с десен пътепоказател (ЗДвП чл. 28, ал. 1, т. 2), иначе чакащите на входовете и пешеходците край тях гадаят.",
      codeRefs: ["TURN_WITHOUT_INDICATOR"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово кръстовище — от малките квартални кръгчета до големите булевардни. Правилото е едно: движещите се в кръга са с предимство, влизащият изчаква интервал. На входа стои Б1 „Пропусни движението“, а не Б2 „Спри!“ — затова пълно спиране се изисква само когато няма интервал; спреш ли без причина на празен вход, това е грешка на самия изпит.",
    whyBg:
      "Предимството в кръга не идва от отделен член „за кръговите“ — такъв в ЗДвП няма. Идва от знака на входа: Б3 „Път с предимство“ не може да се поставя на входовете на кръгово кръстовище (Наредба № РД-02-21-1/23.11.2023 за пътните знаци), затова там стои Б1 или Б2, ти си на пътя без предимство и пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1). Това е и цялата безопасност на кръговото: то е по-безопасно от обикновеното кръстовище само докато редът на пропускане се спазва — влизане „на инат“ пред кола в кръга е сред най-честите причини за странични удари. А мигачът на изхода (чл. 28, ал. 1, т. 2) е това, което позволява на чакащите по входовете изобщо да потеглят.",
    // NUMBERLESS on the наредба, on purpose (the rule `clearanceCitations.ts`
    // froze for this very concept: „names an article we cannot resolve — drop
    // the number"). ЗДвП чл. 50, ал. 1 and чл. 28, ал. 1, т. 2 are in
    // content/law/acts/zdvp.json and can be quoted at the student. Наредба
    // № РД-02-21-1 is NOT in the repo, so the Б3 step — step one of the
    // derivation — is named for what it holds and carries no article number
    // it cannot show. Byte-identical to the bank's c-roundabout-rules /
    // c-roundabout-behavior citations, so the drill and the classroom cite
    // one roundabout rule in one voice.
    lawRef:
      "ЗДвП чл. 50, ал. 1; чл. 28, ал. 1, т. 2; Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване преди входа, поглед наляво и пропускане на движещите се в кръга, плавно влизане в реален интервал и десен мигач преди изхода. Влизане пред кола в кръга е опасна грешка; изход без мигач също се отбелязва.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
      { level: 5, traffic: { vehicleCount: 4 } }, // L5: живо кръгово
  ],
  staged: [RB_CIRCULATING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-lane-change — „Смяна на лента" (OV-01 no mirror / OV-02 no indicator)
//    on ln-v1
// ---------------------------------------------------------------------------

/**
 * The staged TARGET-LANE traffic: a pace car in the LEFT (target) lane that
 * arms on the player's first movement and then match-follows ~24 m BEHIND
 * the player's arc (negative followGapM — the blind-spot position the mirror
 * check exists for). HONEST AUTHORING NOTE: the brakingLeadCar runner is the
 * only staged kind that can hold a lane-locked pace relative to the player;
 * its slam tier is authored OUT of the play corridor (slamAt at the far road
 * end + minSlamSpeedKmh 250 + proximityFallbackM 0.5), so the encounter
 * never resolves and never grades — the actor is deterministic moving
 * traffic, not a braking drill. extraRightOffsetM −8.125 = one drawn lane to
 * the LEFT of the traffic graph's curb-lane centerline (the ln battery
 * proves the offset lands on x = 4.06).
 */
const LN_TARGET_LANE_CAR: BrakingLeadCarSpec = {
  id: "sc-lc-blindspot",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 20 },
    cruiseSpeedMps: 9,
    extraRightOffsetM: -8.125,
    colorIndex: 2,
  },
  followGapM: -24, // pace ~24 m BEHIND the player, in the target lane
  maxMatchSpeedMps: 12,
  slamAt: { x: 4.06, y: 395 }, // far road end — outside the play corridor
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.5, // …and the proximity fallback cannot occur pre-contact
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * OV-01/OV-02 — the mirror → signal → move lane change (ЗДвП чл. 25: преди
 * маневра водачът се убеждава, че няма да създаде опасност, и я обявява).
 */
export const SC_LANE_CHANGE: ScenarioSpec = {
  id: "sc-lane-change",
  family: "lanes",
  tagsBg: ["смяна на лента", "огледала", "мигачи"],
  titleBg: "Смяна на лента",
  objectiveBg:
    "Смени лентата надясно-наляво по учебния ред: огледало, мигач, поглед през рамо и плавно преместване — без да изненадаш движещите се в съседната лента.",
  // Doc-72 provenance: OV-01 (lane change without mirror) + OV-02 (lane
  // change without indicator).
  archetypeIds: ["OV-01", "OV-02"],
  conceptIds: ["c-lane-change", "c-mirrors-blind-spots", "c-driver-signals"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ln-v1.json meta.scenario.params
    // (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // The same 219-character step 1 as the zebra drill, the same night/rain
    // clause, the same 0 % body. The unconditional act (settle in the right lane)
    // is the line; the lamp duty and its WHY are steps 6-7, where the condition
    // is stated before the reason instead of the other way round.
    // 67 ch
    { n: 1, textBg: "Потегли и се установи стабилно в дясната лента с постоянна скорост." },
    // 81 ch
    { n: 2, textBg: "Провери лявото огледало: в лявата лента зад теб има кола — прецени скоростта ѝ." },
    // 66 ch
    { n: 3, textBg: "Включи левия мигач и задръж — сигналът винаги предхожда маневрата." },
    // 73 ch
    { n: 4, textBg: "Хвърли поглед през рамо към мъртвата зона — огледалото не показва всичко." },
    // 70 ch
    { n: 5, textBg: "Премести се плавно и по диагонал в лявата лента, после изключи мигача." },
    // 71 ch
    { n: 6, textBg: "Включи късите светлини по тъмно и в дъжд (чл. 70) преди престрояването." },
    // 65 ch
    { n: 7, textBg: "Помни: съседната кола те пуска само ако те вижда в огледалото си." },
  ],
  success: [
    {
      id: "sc-lc-cruise",
      titleBg: "Установи се в дясната лента",
      // Radius 4 < the 8.125 m lane pitch: the zone is satisfiable ONLY from
      // the right lane center — the setup half of the drill.
      params: { kind: "reachZone", x: LN_RIGHT, y: 150, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-lc-change",
      titleBg: "Премини в лявата лента след огледало и мигач",
      params: { kind: "reachZone", x: LN_LEFT, y: 260, radiusM: 4 },
    },
  ],
  rubric: { parTimeSec: 50 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLaneChange.ts; gates in traces/__tests__/
  // sc-lane-change-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-lane-change/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-lane-change/mistake-no-indicator.trace.json",
      },
      titleBg: "Престрояване без мигач",
      whatWentWrongBg:
        "Колата се премести в лявата лента, без да подаде ляв мигач — движещият се отзад в нея нямаше как да предвиди маневрата. Сигналът се подава преди преместването, не по време на него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: {
        path: "content/traces/sc-lane-change/mistake-no-mirror.trace.json",
      },
      titleBg: "Престрояване без проверка в огледалото",
      whatWentWrongBg:
        "Мигачът светна, но воланът тръгна без поглед в лявото огледало и през рамо — а точно там, в мъртвата зона, се движеше кола. Редът е железен: огледало → мигач → рамо → маневра.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK"],
    },
  ],
  teach: {
    whenBg:
      "При всяко престрояване по многолентов булевард — преди изпреварване, преди ляв завой, при освобождаване на бус-лента. Редът е винаги един и същ: огледало, мигач, рамо, маневра.",
    whyBg:
      "В мъртвата зона на огледалото се скрива цял автомобил. Престрояване „на сляпо“ е сред най-честите причини за странични удари в градския поток — а те стават точно при скоростите, при които изглеждат безобидни. Проверката отнема секунда и половина; ударът отнема месеци.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият следи реда на действията: поглед в огледалото от страната на маневрата, навременен мигач (2–3 секунди преди преместването), контролен поглед към мъртвата зона и плавна диагонална траектория без застрашаване на движещите се в лентата.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
      { level: 5, conditions: { weather: "rain", night: true } }, // L5: престрояване в дъжд нощем
  ],
  staged: [LN_TARGET_LANE_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The flow-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_FLOW: readonly ScenarioSpec[] = [
  SC_ZEBRA_APPROACH,
  SC_ROUNDABOUT_ENTRY,
  SC_LANE_CHANGE,
];

// LANE_W documents the derivation of the pinned lane centers above; keep the
// constant referenced so the derivation survives refactors.
void LANE_W;
