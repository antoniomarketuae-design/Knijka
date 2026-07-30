/**
 * Scenario templates — the JUNCTION/PRIORITY family, WAVE 5 (doc 72 §JU
 * „Family JU — Junctions"). Waves 1+3 shipped предимство in both directions
 * (templates-junctions3.ts: taking it, and refusing to use your own). This
 * file adds the ONE junction archetype doc 72 numbers but no template had
 * claimed yet:
 *
 *   sc-jx-blocked-exit „Зелено, но изходът е задръстен" (JU-16 „Навлизане в
 *     задръстено кръстовище / Block-the-box", sx-v1 — honest map REUSE, the
 *     sc-signal-flashing / sc-rx-tram-left precedent: the committed signalized
 *     X hosts the gridlock trap exactly as it hosts the dead-signal drill; the
 *     staged queue tail and the teach copy carry the new lesson)
 *
 * Source questions (doc 66 harvest): q-krastovishta-019, q-predimstvo-039,
 * q-signali-i-markirovka-043 — all three ask the same thing the sim can now
 * SHOW: зеленото разрешава преминаване, не влизане без изход.
 *
 * WHY sx-v1 IS THE RIGHT REUSE: JU-16 needs exactly two things — a signalized
 * junction whose phase the rule layer can see, and room for a standing column
 * PAST the far mouth. sx-v1 is the only committed map with a live two-phase
 * cluster (ONE single-node cluster, four trafficLight stop lines at ±27.7 m),
 * and its north arm runs 90 m clear — enough to park a queue tail past the box
 * and still drive out. Nothing about the map changes; the tail is what is new.
 *
 * THE HONEST ENGINE GAP (doc 72 JU-16 „Engine: 🔴 NEW: queue-tail actor set +
 * box-occupancy check"): half of that line exists and half does not. The
 * queue-tail actor set is shipped (BrakingLeadCarRunner — the sc-rx-queue-clear
 * recipe). The box-occupancy check (player stationary inside the junction
 * polygon while the cross-phase goes green) is NOT built, so this template does
 * not pretend to grade it:
 *   - the CORRECT act is OBJECTIVE-gated, not detector-gated — „sc-jxb-hold"
 *     completes only at near-stop speed BEFORE the line, and „sc-jxb-cross"
 *     sits 12 m past the tail's rest pose, so it is unreachable until the queue
 *     actually rolls. The wait IS the drill, and it is measured.
 *   - the taught KILL grades through the shipped standstill detector: a driver
 *     who follows the column in strands on its bumper mid-box and bills
 *     STANDSTILL_GAP_TOO_CLOSE (чл. 23). That is a narrower charge than a true
 *     box-occupancy code would write — it convicts the bumper-kiss, not the
 *     stranding — but it fires on exactly the act the demo performs, and it is
 *     the shipped truth rather than a fabricated one. Filed as engine
 *     follow-up: a real JU-16 code needs the junction polygon + cross-phase.
 *
 * THE ruleConfig KNOB IS NOT A WORKAROUND — IT IS JU-09's OWN GATE, CALIBRATED.
 * The hesitation detector (JU-09 „Спане на зелено") already carries the exact
 * exemption this drill depends on: `hesitationClearGapM` — „Lead gap at/under
 * this means someone blocks the box — never fire" (rules/types.ts). Doc 72
 * designed JU-09 and JU-16 as a matched pair: the clear-ahead flag is PRECISELY
 * what separates „заспал на зеленото" (punishable) from „правилно отказано
 * влизане в зает изход" (correct). Its 12 m default is calibrated for a tight
 * urban box; on sx-v1 the mouths sit 27.7 m out, so a tail standing just past
 * the far mouth is ~41 m from a driver waiting at the line — invisible to a
 * 12 m flag, and the innocent wait would bill JU-09's code. The override widens
 * the flag to this map's real box depth. It is deliberately scenario-scoped
 * (never a catalog default), and it SELF-RELEASES: once the queue rolls away
 * the tail leaves the window, JU-09 re-arms, and the drill then demands the
 * prompt start it should. Both halves of the lesson stay graded.
 *
 * DATA ONLY in the templates.ts mold (coordinates denormalized from the
 * committed district file; the sx-district battery + the trace gate assert
 * every pinned value against the generated map).
 */

import type { BrakingLeadCarSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the committed district by value —
// the L7 pattern; the sx-district battery asserts the copies match the map)
// ---------------------------------------------------------------------------

/** sx-v1: drawn northbound lane center off the ns centerline, m (the
 *  SIGNAL_LANE_CENTER_M 4.0625 of templates-signals.ts, at the trace-authoring
 *  precision every sx-v1 script already uses). */
const JX_LANE = 4.06;
/** sx-v1: the ns south-approach trafficLight stop line, m (= y). Secondary
 *  half-width 12.125 + arterial corner 15 + paint inset 0.6 → 27.725 m from
 *  sx-n-c on every arm; the battery pins the derived line id at s = 92.3. */
export const JX_STOP_LINE_Y = -27.73;
/** The far (north) mouth of the junction square on the ns axis, m (= y): the
 *  same 27.125 m ribbon cut, +0.6 m of paint inset. T12's yardstick. */
export const JX_FAR_STOP_LINE_Y = 27.725;
/** The rest pose the „hold" objective marks: center 1.8 m short of the line —
 *  the proven sc-signal-redyellow pose (nose short of the paint, so the JU-15
 *  overshoot window at 1.2 m never arms). */
export const JXB_HOLD_Y = -29.5;

/**
 * The queue tail's resting arc on sx-v1, m (= y; the ns road runs −120 → 90 on
 * x = 0) — T12 (ledger §2): **16 → 31.**
 *
 * The old comment claimed 16 was „just past the far mouth". It was not: on
 * sx-v1 both ribbons are cut at 27.125 m from sx-n-c (measured — the ns
 * secondary's half-width 12.125 + the arterial corner 15; `analyzeNetwork`
 * reports trimFrom/trimTo 27.125 on all four arms), and the paint sits 0.6 m
 * outside that at 27.725. So the junction is a 54.25 m open square, and a car
 * resting at y = 16 spans 13.95 … 18.05 — **9.1 m short of the far mouth,
 * parked in the middle of the intersection.** The lesson about not stranding
 * yourself in a junction opened with a car stranded in the junction, and
 * instruction 2 told the student it had „stopped right after the far end".
 *
 * WHY 31 AND NOT THE 34 THE LEDGER SUGGESTED (measured, both directions):
 *   - the tail must clear the paint: rest − 2.05 ≥ 27.725 → y ≥ 29.78;
 *   - a driver who follows it in must still be caught INSIDE the box, or the
 *     drill's premise dies. The bumper-kiss rest is 5.2 m behind the tail
 *     (4.1 m of car + the 1.1 m gap), so the follower's nose lands at
 *     y − 3.15 and it stays inside the mouth while y ≤ 30.28, and keeps most
 *     of its body inside well past that.
 *   At **31**: the tail spans 28.95 … 33.05 — 1.23 m clear of the paint,
 *   unmistakably past the junction — and the follower spans 23.75 … 27.85,
 *   i.e. 3.38 m of its 4.1 m INSIDE the box with its nose over the far mouth.
 *   The free space between the mouth and the tail's bumper is 1.83 m: less
 *   than half a car, so «място за твоята кола там няма» is literally true.
 *   At 34 that gap opens to 4.83 m and only 0.38 m of the follower's tail is
 *   left in the box — the student would have „made it", and the lesson would
 *   grade a bumper-kiss with no stranding behind it.
 *
 * HONEST LIMIT, recorded rather than papered over: on a 2.5×-perceptual map
 * with a 15 m arterial corner the junction square is 54 m deep, so NO single
 * queue car can be both past the mouth AND leave a follower straddling the
 * 8.125 m-half-width east-west carriageway (that would need y ≤ 15.4). The
 * shipped 16 did not achieve it either — its follower's rear rested at 8.75,
 * already 0.63 m clear of the cross lane. What the geometry can deliver, and
 * what 31 delivers, is a car stopped dead inside the intersection with no exit
 * in front of it: чл. 47's actual offence. The copy below says exactly that
 * and no longer claims the cross carriageway is physically blocked.
 */
const JXB_QUEUE_TAIL_Y = 31;
/** The follower's bumper-kiss rest behind the tail, m (= y): 4.1 m of car plus
 *  the 1.1 m gap the standstill floor convicts at. Denormalized here so the
 *  template and traces/scJxBlockedExit.ts cannot drift apart. */
export const JXB_KISS_Y = JXB_QUEUE_TAIL_Y - 5.2;

// ---------------------------------------------------------------------------
// sc-jx-blocked-exit — „Зелено, но изходът е задръстен" (JU-16) on sx-v1
//   (signalized X, ns limit 50 / ew 40, ONE cluster sx-n-c, stop lines at
//   ±27.7 m, spawn sx-spawn-south (0, −105) heading north)
// ---------------------------------------------------------------------------

/**
 * The staged QUEUE TAIL: a stationary car halted at y = 31 — 1.2 m past the
 * painted far mouth, in the player's OWN lane. The sc-rx-queue-clear recipe (the
 * FS_LEAD_CAR mold with `slamAt` sitting ON the hold pose), because the picture
 * is the same one: the column beyond the junction is ALREADY stopped when the
 * player arrives — nobody watches it brake. The car therefore never moves under
 * its own timing:
 *
 *  - armDistM 75 — the encounter arms when the player closes to 75 m (y ≈ −44,
 *    still short of the stop line) and is rolling; matchPlayer is commanded for
 *    the single frame before the slam takes over, and with the gap error at
 *    −75 m its target clamps to 0, so the tail does not creep (deterministic
 *    pose, the rail precedent). It was 60 while the tail stood at y = 16 — T12
 *    moved the tail 15 m north, so the arming distance moves with it or the
 *    encounter would arm at the stop line instead of 44 m before it;
 *  - minSlamSpeedKmh 8 — any real approach trips the brake command at once;
 *  - resumeAfterSec 24 — the queue rolls 24 s after the PLAYER first comes to
 *    rest. That is the drill's clock, and it is keyed to each drive's OWN stop,
 *    which is what lets one number serve all three demos (see traces/
 *    scJxBlockedExit.ts): the shadow rests at the line at t ≈ 11 and watches the
 *    column pull away at t ≈ 35 — in the MIDDLE of the red, where „изходът се
 *    освободи" and „мога да тръгна" are two different sentences. That gap is the
 *    entire lesson, and it is also where the second mistake lives.
 *
 * The runner emits no SimTick events of its own here (triggersHazard false, no
 * collision on these drives): the grading is 100% the shipped standstill +
 * signal detectors reading the player's own channels.
 */
const JXB_QUEUE_TAIL: BrakingLeadCarSpec = {
  id: "sc-jxb-tail",
  kind: "brakingLeadCar",
  actor: {
    // The district's own northbound ns road, through the signalized node.
    pathNodes: ["sx-n-s", "sx-n-c", "sx-n-n"],
    // Signed arc offset from node index 1 (sx-n-c at the origin) — the
    // SC_SIGNAL_DEAD_CONFLICT convention.
    hold: { nodeIndex: 1, offsetM: JXB_QUEUE_TAIL_Y },
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 14,
  maxMatchSpeedMps: 12,
  // ON the hold pose: the halt IS the staged event — see the doc above.
  slamAt: { x: JX_LANE, y: JXB_QUEUE_TAIL_Y },
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 8,
  proximityFallbackM: 0.3,
  armDistM: 75,
  triggersHazard: false,
  resumeAfterSec: 24,
};

/** JU-16 — навлизане в задръстено кръстовище (ЗДвП чл. 47: на кръстовище се
 *  навлиза само когато отсрещната страна позволява преминаването да завърши;
 *  ППЗДвП чл. 31: зеленият сигнал разрешава преминаване — не задължава към
 *  него). Зеленото е „премини, АКО изходът е свободен", не „тръгвай". */
export const SC_JX_BLOCKED_EXIT: ScenarioSpec = {
  id: "sc-jx-blocked-exit",
  family: "junction",
  tagsBg: ["кръстовище", "зелен сигнал", "задръстване", "свободен изход", "светофар"],
  titleBg: "Зелено, но изходът е задръстен",
  objectiveBg:
    "Не влизай в кръстовището на зелено, ако колоната след него ще те остави да стоиш в средата — изчакай пред линията, докато изходът се освободи.",
  archetypeIds: ["JU-16", "JU-05", "JU-09"],
  conceptIds: [
    "c-light-junction",
    "c-traffic-light-signals",
    "c-junction-approach",
    "c-safety-space",
  ],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in sx-v1.json meta.scenario.params
    // (tools/maps/gen_signal_x.mjs; honest REUSE of the shipped signalized X —
    // the staged queue tail is what is new).
    params: {
      armNorthM: 90,
      armSouthM: 120,
      armEastM: 120,
      armWestM: 170,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "sx-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по булеварда на север — напред е светофарно кръстовище и светофарът ти свети ЗЕЛЕНО.",
    },
    {
      n: 2,
      textBg:
        "Погледни ОТВЪД кръстовището, не към лампата: колоната след него стои и опашката ѝ е спряла на метър след отсрещното устие. Между устието и нейната броня няма и половин кола — място за теб там няма.",
    },
    {
      n: 3,
      textBg:
        "Спри пред стоп-линията и чакай, макар да е зелено. Зеленото разрешава преминаване — не те задължава да влезеш и не ти обещава изход.",
    },
    {
      n: 4,
      textBg:
        "Ще изтърпиш цяло зелено, жълто и цяло червено. Колоната ще се отлепи някъде по средата на червеното — това още не е твоят момент: изходът е свободен, но сигналът не е твой.",
    },
    {
      n: 5,
      textBg:
        "Щом светне зелено и отсрещната страна е наистина празна, тръгни без бавене и премини кръстовището на едно движение до края на отсечката.",
    },
  ],
  success: [
    {
      id: "sc-jxb-hold",
      titleBg: "Спри пред стоп-линията, докато изходът е зает",
      /**
       * Completable ONLY at near-stop speed short of the line (the
       * pk-smooth-stop / sc-rxq-hold mark discipline): a driver who rolls into
       * the box behind the column never satisfies it — the wait IS the drill.
       *
       * B5 (ledger §3), data half: it used to be `y −29.5 r4`, i.e. the band
       * −33.5 … −25.5 — which BOTH refused most of the lawful approach and
       * admitted a pose 2.23 m PAST the paint at −27.725. Re-centred to
       * −33 r5 → −38 … −28: every metre of it is short of the line (upper edge
       * 0.275 m clear), and the admissible band grows from 8 m to 10 m so a
       * student who stops where he can actually SEE past the column is not
       * forced to creep forward to the one pose the circle allows.
       */
      params: { kind: "reachZone", x: JX_LANE, y: -33, radiusM: 5, maxSpeedKmh: 5 },
    },
    {
      id: "sc-jxb-cross",
      titleBg: "Влез в кръстовището едва след като колоната се е отлепила",
      // Twelve meters past the queue tail's rest pose: reachable only once the
      // tail has actually rolled away — the „свободен изход" made graded.
      params: { kind: "reachZone", x: JX_LANE, y: JXB_QUEUE_TAIL_Y + 12, radiusM: 6 },
    },
    {
      id: "sc-jxb-exit",
      titleBg: "Излез от кръстовището на север",
      // T12 consequence: the cross gate moved north with the tail (43 now), so
      // the exit moves too — at the old y = 47 the two zones overlapped and the
      // final objective would have ticked 0.5 s after the one before it. 62
      // restores the ~19 m of separation the pair shipped with, and the north
      // arm runs to y = 90, so the ribbon comfortably carries it.
      params: { kind: "reachZone", x: JX_LANE, y: 62, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 95 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scJxBlockedExit.ts; gates in traces/__tests__/sc-jx-blocked-exit-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-jx-blocked-exit/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-jx-blocked-exit/mistake-enter-full-box.trace.json" },
      titleBg: "Влизане на зелено в пълно кръстовище",
      whatWentWrongBg:
        "Светофарът светеше зелено и колата влезе — макар отвъд кръстовището да нямаше и половин кола свободно място. Резултатът е на сантиметри от бронята на колоната, с цялото тяло СПРЯЛО ВЪТРЕ в кръстовището и само нос в отсрещното устие. Оттук нататък не можеш напред и не можеш назад — а след секунди напречното направление получава зелено и трябва да пресече точно през мястото, на което си застанал. Никой не минава, докато колоната пред теб не тръгне, и целият цикъл изчиства нула коли. Зеленото значи „премини, АКО изходът е свободен“, а не „тръгвай“: мястото се проверява ОТВЪД кръстовището, преди да пуснеш спирачката (чл. 47).",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-jx-blocked-exit/mistake-impatient-red.trace.json" },
      titleBg: "Нетърпеливо тръгване на новото червено",
      whatWentWrongBg:
        "Изчакването беше правилно — цяло зелено пред заета отсрещна страна. После колоната се отлепи и кракът тръгна с нея… но светофарът вече беше червен. Свободният изход не е сигнал: той решава дали МОЖЕШ да преминеш, а лампата решава дали ТИ Е РЕД. Тук двете се разминаха с петнайсет секунди и колата влезе на червено — точно когато напречното направление получава своето зелено. Изтърпи цялото червено: следващото зелено е след секунди и този път ще е и с изход (ППЗДвП чл. 31).",
      codeRefs: ["RED_LIGHT_CROSSED"],
    },
  ],
  teach: {
    whenBg:
      "Всеки час пик, на всяко градско кръстовище, където след него има светофар, спирка, стеснение или просто колона. Най-често в час пик по булевардите — там зеленото свети, а изходът е зает почти всеки цикъл.",
    whyBg:
      "Зеленото е разрешение да преминеш, не заповед да влезеш — и не обещава, че отсреща има място за теб. Задръстванията в големия град не се раждат от много коли, а от коли, спрели там, където не е тяхното място: един блокиран изход заключва цялото кръстовище, а напречното направление получава зелено към заето платно. Оттам нататък цикълът не изчиства нищо и опашката расте назад с километри — включително и към теб. Решението се взима ПРЕДИ линията и е винаги едно и също: гледаш мястото ОТВЪД кръстовището, не лампата. Има ли там място за цялата ми кола? Ако не — чакаш, колкото трябва, дори това да ти струва цяло зелено. И обратното е също толкова важно: щом изходът се освободи и сигналът е твой, тръгваш веднага — изчакването е решение, не навик.",
    lawRef: "ЗДвП чл. 47",
    examinerBg:
      "Изпитващият следи къде гледа кандидатът при зелено: към лампата или отвъд кръстовището. Спиране пред линията при зает изход е правилното действие и не е „закъснели действия“; навлизане в задръстено кръстовище е основна грешка, а спирането в средата му — предпоставка за ПТП. Обратната грешка се отчита също: бавене на зелено при свободен изход е „закъснели действия“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // No L5 rung: the backlog authors none for this template, and neither
    // condition axis is honest here. Night would only dim the lamp (the tail's
    // brake lights make a blocked exit MORE visible in the dark, not less), and
    // rain/snow would re-time the tuned approach the resumeAfterSec clock and
    // the standstill window are pinned against — a fork of the drill, not a
    // harder rung of it. The complication JU-16 actually wants is a live
    // cross-flow claiming the box, which needs the box-occupancy detector this
    // template already files as engine follow-up.
  ],
  staged: [JXB_QUEUE_TAIL],
  /**
   * JU-09's clear-ahead flag, calibrated to sx-v1's box depth — see the file
   * header. The wait this drill TEACHES is stationary-at-green within 12 m of
   * the line, which is JU-09's arming picture exactly; only the lead-gap
   * exemption tells the two apart, and at 12 m it cannot see a tail standing
   * past a 27.7 m mouth.
   *
   * T12 moved the tail from y = 16 to y = 31, so the bumper gap from the hold
   * pose (y = −29.5) goes 41.4 → 56.4 m and the old 48 m flag would no longer
   * cover it — the innocent wait would start billing „закъснели действия",
   * i.e. the drill would punish the exact act it teaches. 63 m keeps the same
   * ~6.6 m of margin over the pinned geometry, and it still SELF-RELEASES: the
   * moment the column pulls away the gap runs past 100 m, JU-09 re-arms, and a
   * dawdled start on the next green is graded again.
   */
  ruleConfig: { hesitationClearGapM: 63 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION-family wave-5 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS4: readonly ScenarioSpec[] = [SC_JX_BLOCKED_EXIT];
