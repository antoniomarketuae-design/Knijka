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
const JX_STOP_LINE_Y = -27.73;
/** The rest pose the „hold" objective marks: center 1.8 m short of the line —
 *  the proven sc-signal-redyellow pose (nose short of the paint, so the JU-15
 *  overshoot window at 1.2 m never arms). */
const JXB_HOLD_Y = -29.5;

/**
 * The queue tail's resting arc on sx-v1, m (= y; the ns road runs −120 → 90 on
 * x = 0). Sixteen meters past the junction NODE — i.e. just past the far mouth
 * of the crossing roadway, where the column standing beyond the junction really
 * ends. The value is the load-bearing tuning of the whole template:
 *   - far enough out that the tail is unmistakably PAST the box (the story: the
 *     exit, not the junction, is what is full);
 *   - close enough in that a driver who follows it across strands INSIDE the
 *     box — the bumper-kiss rest lands at y ≈ 10.8, so the car's tail hangs in
 *     the east-west path with its nose on the column's bumper. That is the JU-16
 *     picture exactly, and it is the geometry that makes the standstill detector
 *     bill the act (gap 1.1 m ≤ the 1.5 m see-the-tyres floor).
 */
const JXB_QUEUE_TAIL_Y = 16;

// ---------------------------------------------------------------------------
// sc-jx-blocked-exit — „Зелено, но изходът е задръстен" (JU-16) on sx-v1
//   (signalized X, ns limit 50 / ew 40, ONE cluster sx-n-c, stop lines at
//   ±27.7 m, spawn sx-spawn-south (0, −105) heading north)
// ---------------------------------------------------------------------------

/**
 * The staged QUEUE TAIL: a stationary car halted at y = 16 — just past the far
 * mouth, in the player's OWN lane. The sc-rx-queue-clear recipe verbatim (the
 * FS_LEAD_CAR mold with `slamAt` sitting ON the hold pose), because the picture
 * is the same one: the column beyond the junction is ALREADY stopped when the
 * player arrives — nobody watches it brake. The car therefore never moves under
 * its own timing:
 *
 *  - armDistM 60 — the encounter arms when the player closes to 60 m (y ≈ −44,
 *    still short of the stop line) and is rolling; matchPlayer is commanded for
 *    the single frame before the slam takes over, and with the gap error at
 *    −60 m its target clamps to 0, so the tail does not creep (deterministic
 *    pose, the rail precedent);
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
  armDistM: 60,
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
        "Погледни ОТВЪД кръстовището, не към лампата: колоната след него стои и опашката ѝ е спряла веднага след отсрещния край. Място за твоята кола там няма.",
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
      // Completable ONLY at near-stop speed short of the line (the
      // pk-smooth-stop / sc-rxq-hold mark discipline): a driver who rolls into
      // the box behind the column never satisfies it — the wait IS the drill.
      params: { kind: "reachZone", x: JX_LANE, y: JXB_HOLD_Y, radiusM: 4, maxSpeedKmh: 5 },
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
      params: { kind: "reachZone", x: JX_LANE, y: 47, radiusM: 6 },
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
        "Светофарът светеше зелено и колата влезе — макар отвъд кръстовището да нямаше и метър свободен. Резултатът е на сантиметри от бронята на колоната, с опашка, увиснала насред кръстовището. След секунди напречното направление получава зелено и се оказва, че платното му е заето от теб: не можеш напред, не можеш назад, а тролеят, линейката и всички останали чакат заради едно твое решение. Зеленото значи „премини, ако изходът е свободен“ — виж мястото ОТВЪД кръстовището, преди да пуснеш спирачката (чл. 47).",
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
   * 41 m out past a 27.7 m mouth. 48 m covers the pinned geometry with margin
   * and still self-releases the moment the column pulls away.
   */
  ruleConfig: { hesitationClearGapM: 48 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION-family wave-5 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS4: readonly ScenarioSpec[] = [SC_JX_BLOCKED_EXIT];
