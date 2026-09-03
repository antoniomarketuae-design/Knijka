/**
 * Scenario templates — the MERGING family (doc 76 §2 chip "merging", doc 72
 * §10 „Family OV" merge archetypes), staged on the "merge-lane" micro-maps:
 *
 *  - sc-merge-accel-lane „Включване в магистрала през лентата за ускоряване"
 *    (OV-15 + SP-10, mw-entry-v1 — tools/maps/gen_mw_entry.mjs)
 *  - sc-merge-lane-end „Краят на лентата — вливане с цип"
 *    (OV-16 + OV-01/OV-02, ln-merge-v1 — tools/maps/gen_ln_merge.mjs)
 *  - sc-merge-roadworks-shift „Ремонт затваря лентата ти"
 *    (SN-07 + OV-16/OV-02/OV-12, hz-roadworks-v1 — tools/maps/gen_hz_roadworks.mjs)
 *  - sc-merge-bus-pullout „Автобусът потегля от спирката"
 *    (VU-11 + FO-03, mg-busstop-v1 — tools/maps/gen_mg_busstop.mjs); the odd one
 *    out: here SOMEONE ELSE merges and the duty is to LET them (ЗДвП чл. 67)
 *  - sc-merge-from-property „Излизане от бензиностанция през тротоара"
 *    (OV-15 + PE-03, mg-property-v1 — tools/maps/gen_mg_property.mjs); the
 *    family's smallest merge and its strictest: leaving a property you yield to
 *    EVERYONE — pavement first, then the flow (ЗДвП чл. 25)
 *
 * DATA ONLY, the templates.ts mold: every coordinate below is denormalized
 * from the committed district file (meta.scenario), so nothing loads world
 * JSON at runtime; the district battery (world/__tests__/merge-districts.test
 * .ts) and the trace gate assert every pinned value against the generated map.
 *
 * WHY THE MAP GRADES THIS FOR FREE (see gen_mw_entry.mjs's header): the
 * acceleration lane is the carriageway's CURB lane (laneId 0) over the 200 m
 * segment that carries NO emergencyLane span. So:
 *   - riding it is legal and it is the rightmost REQUIRED lane (no
 *     NOT_KEEPING_RIGHT, no EMERGENCY_LANE_DRIVING);
 *   - the merge is a laneId 0 → 1 delta WITHIN one edge, which the shipped
 *     lane-change adjudicator grades on indicator + mirror;
 *   - past the taper the span resumes, so the merged driver in laneId 1 is
 *     innocent while a driver who never merged rides the аварийна лента.
 *
 * Both mistake demos cite SHIPPED rules-catalog codes and grade EXACTLY them
 * through the production stack (the §5/§9 gates, traces/__tests__/
 * sc-merge-accel-lane-traces.test.ts):
 *   - „Спиране в края на лентата за ускоряване" → HARSH_BRAKING_NO_CAUSE
 *     (основна: рязко спиране без причина — the ledger is positively empty on
 *     this map: no crossing, no stop line, no junction, no lead ahead);
 *   - „Вливане без оглеждане пред идваща кола" →
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION (the indicator is ON — the
 *     demo's whole point is that signalling is not looking).
 */

import type {
  CutInLeadCarSpec,
  OncomingStreamSpec,
  PedestrianDartOutSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// sc-merge-accel-lane — „Включване в магистрала през лентата за ускоряване"
// (OV-15 „Включване в движението" at motorway scale + SP-10 „Магистрала")
// ---------------------------------------------------------------------------

/** mw-entry-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const MWE_X_CURB = 8.13; // laneId 0 — the acceleration lane between nose and taper
const MWE_X_CRUISE = 0; // laneId 1 — the merge target (mainline right travel lane)
/** mw-entry-v1 story arclengths in district y (meta.scenario). */
const MWE_NOSE_Y = 260; // the acceleration lane begins (ramp nose)
const MWE_TAPER_Y = 460; // …and tapers out here — the curb lane becomes аварийна
const MWE_END_Y = 960;

/**
 * The MAINLINE CAR the drill is about: the shipped rearTailgater actor armed
 * in the TARGET lane (extraRightOffsetM = −one lane off the graph's curb lane
 * ⇒ x ≈ 0, mainline laneId 1), released once the player is well up the ramp.
 * It matchPlayer-paces a gap BEHIND the player — that is what keeps the pролука
 * ahead of it open and honest, so „merge ahead of it" is a real choice — and
 * after the pressure window it accelerates away and passes on the left (the
 * „passes if you dawdle" beat).
 *
 * HONEST PROXY (flagged, the FO-07 precedent): the rearTailgater is the only
 * shipped actor that keeps station relative to the player, so a car that
 * genuinely BLOWS PAST at flow speed is not authorable today (see the module
 * note in the trace script). PRESSURE SCENERY under the learn-only policy: the
 * runner emits ZERO SimTick events — no violation and no collision can grade
 * from it (doc 72 FO-07). Everything graded here is the player's own channel:
 * the lane-change indicator/mirror pair, and the causeless slam.
 */
const MWE_MAINLINE_CAR: RearTailgaterSpec = {
  id: "sc-mrg-mainline",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["mwe-n-nb-start", "mwe-n-nose", "mwe-n-taper", "mwe-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 30 }, // dormant at (0, 30) — deep behind the nose
    cruiseSpeedMps: 28,
    // The graph's oneway lane rides the CURB lane (x ≈ +8.13); one lane LEFT
    // of it is the mainline travel lane the player must merge into.
    extraRightOffsetM: -MWE_X_CURB,
    colorIndex: 2,
  },
  releaseGapM: 150, // the player is ~half-way up the ramp before it rolls
  followBehindM: 42, // ~38 m of bumpers — a real, mergeable пролука at flow speed
  maxMatchSpeedMps: 33, // ~120 km/h — it keeps station even with a brisk player
  pressureSec: 18,
  passShiftM: -8.125, // the pass runs one lane LEFT (never through the player)
  passSpeedMps: 33,
  passAheadM: 45,
  easeKmh: 8,
};

/**
 * OV-15 / SP-10 — включване в магистрала през лентата за ускоряване (ЗДвП
 * чл. 56: „Водач, който навлиза на автомагистрала или скоростен път, е длъжен
 * да пропусне движещите се по тях пътни превозни средства"; чл. 25: маневрата
 * се извършва след убеждаване, че е безопасна, и със сигнал). The taught norm,
 * verbatim from the content bank (q-magistrali-i-izvangradsko-006): използваш
 * лентата за ускоряване, за да изравниш скоростта с потока → ляв мигач +
 * огледало и мъртва зона → пропускаш движещите се по магистралата → вливаш се.
 *
 * THE ARTICLE NUMBER WAS WRONG UNTIL 2026-09-03, in the comment above and in
 * TWO STUDENT-FACING STRINGS below. It said чл. 55 for the priority duty. чл.
 * 55, ал. 1 is a different rule — it says WHICH VEHICLES a road signed as a
 * motorway is open to („е разрешено движението само на моторни превозни
 * средства … чиято конструктивна максимална скорост надвишава 70 km/h") — and
 * the duty to let the flow through is чл. 56, alone. Retrieved from
 * content/law/acts/zdvp.json, not recalled (ADR-002).
 *
 * IT ALSO CONTRADICTED THE QUESTION BANK THE SAME STUDENT ANSWERS. Every row
 * in content/questions on this manoeuvre cites чл. 56 and none cites чл. 55:
 * q-predimstvo-044 („Кой е с предимство?"), q-magistrali-i-izvangradsko-004 /
 * -006 / -060 / -063 / -067, q-eco-031. The two that DO cite чл. 55 ask a
 * different question — q-magistrali-i-izvangradsko-047, „от кой момент важат
 * специалните правила", i.e. the regime, not the priority. So the simulator
 * was teaching one number and the theory module another, for one fact.
 *
 * The gate cannot see this class: modules/sim/__tests__/law-citations.test.ts
 * resolves that the article EXISTS in the act, never that it carries the claim.
 */
export const SC_MERGE_ACCEL_LANE: ScenarioSpec = {
  id: "sc-merge-accel-lane",
  family: "merging",
  tagsBg: ["магистрала", "вливане", "лента за ускоряване", "предимство", "огледала"],
  titleBg: "Включване в магистрала през лентата за ускоряване",
  objectiveBg:
    "Ускори в лентата за ускоряване до скоростта на потока, огледай се и се включи в пролука, без да спираш в края на лентата.",
  archetypeIds: ["OV-15", "SP-10"],
  conceptIds: ["c-motorway-entry-exit", "c-merging-traffic", "c-lane-change", "c-mirrors-blind-spots"],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in mw-entry-v1.json meta.scenario.params
    // (tools/maps/gen_mw_entry.mjs).
    params: { approachM: 260, accelM: 200, mainM: 500, maxspeedKmh: 140, rampKmh: 90, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-entry-v1",
  },
  start: {
    spawnPointId: "mwe-spawn-ramp",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain and HEADLIGHTS_OFF_IN_RAIN grades
    // with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Потегли по рампата и набирай скорост още по нея — на магистралата се влиза със скоростта на потока, не пълзешком. Вали ли, включи късите светлини още на рампата (чл. 70): вливаш се в чужд поток и това дали те виждат в лявото им огледало решава дали пролуката е твоя." },
    { n: 2, textBg: "От върха на рампата вдясно започва лентата за ускоряване. Тя е твоя за около 200 метра — използвай ги докрай, за да стигнеш ~90–100 км/ч." },
    { n: 3, textBg: "Докато ускоряваш, гледай в лявото огледало: къде е пролуката между колите по магистралата и с каква скорост идват те." },
    { n: 4, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — мигачът те обявява, но не те оглежда." },
    { n: 5, textBg: "Влей се плавно в пролуката: предимството е на движещите се по магистралата — ти се вписваш между тях, не ги избутваш." },
    { n: 6, textBg: "Изключи мигача и продължи в дясната лента. След края на лентата за ускоряване вдясно вече е аварийната лента — там не се кара." },
  ],
  success: [
    {
      id: "sc-mrg-accel",
      titleBg: "Използвай лентата за ускоряване",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the curb
      // (acceleration) lane, deep inside the 200 m segment — using the lane
      // instead of nosing straight into the flow IS the drill.
      params: { kind: "reachZone", x: MWE_X_CURB, y: 340, radiusM: 4 },
    },
    {
      id: "sc-mrg-merge",
      titleBg: "Влей се в лентата за движение преди края на лентата",
      // Same lane-pinning radius on the TARGET lane, 20 m before the taper: a
      // car still riding the acceleration lane at y = 440 misses it entirely.
      params: { kind: "reachZone", x: MWE_X_CRUISE, y: 440, radiusM: 4 },
    },
    {
      id: "sc-mrg-finish",
      titleBg: "Продължи по магистралата до края на отсечката",
      params: { kind: "reachZone", x: MWE_X_CRUISE, y: 930, radiusM: 12 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mrg-glance-mirror", titleBg: "Ляво огледало, докато ускоряваш в лентата" },
        { id: "sc-mrg-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 55,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeAccelLane.ts; gates in traces/__tests__/
  // sc-merge-accel-lane-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-accel-lane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-accel-lane/mistake-stop-at-end.trace.json" },
      titleBg: "Спиране в края на лентата за ускоряване",
      whatWentWrongBg:
        "Лентата за движение беше свободна, а водачът все пак наби спирачките до пълен стоп в края на лентата за ускоряване — от чиста несигурност. Това е рязко спиране без причина: точно зад теб по рампата идват други, а после ще потегляш от място сред коли със 140 км/ч. Спирането в края на лентата е КРАЙНА мярка, когато наистина няма пролука — не начин да отложиш решението. Лентата за ускоряване съществува, за да не се налага: използвай я, за да изравниш скоростта.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-accel-lane/mistake-blind-merge.trace.json" },
      titleBg: "Вливане без оглеждане пред идваща кола",
      whatWentWrongBg:
        "Мигачът светна и воланът тръгна наляво в същата секунда — без нито един поглед в огледалото и без проверка на мъртвата зона. По магистралата обаче вече идваше кола: предимството е нейно (чл. 56) и разликата в скоростите не прощава. Мигачът обявява намерението ти, но не проверява дали лентата е свободна — това правят огледалото и рамото, ПРЕДИ волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки вход на автомагистрала и скоростен път — и в умален вид при всяко включване в движението от рампа, отбивка или паркинг. Лентата за ускоряване не е чакалня, а разгон: тя ти дава точно толкова метри, колкото са нужни, за да станеш част от потока, вместо препятствие в него.",
    whyBg:
      "Разликата в скоростите убива на магистралата. Кола, която се влива с 60 в поток от 130, е неподвижна стена за идващия отзад — той има под две секунди да реши. Затова законът дава предимството на движещите се по магистралата, а на теб — лента, в която да изравниш скоростта: ускоряваш, гледаш, вписваш се. Обратното — спиране в края на лентата „да ме пуснат“ — те оставя да потегляш от нула сред коли със 140 км/ч, което е най-опасният възможен старт.",
    lawRef: "ЗДвП чл. 56; чл. 25",
    examinerBg:
      "Изпитващият гледа три неща: използва ли се лентата за ускоряване докрай (скорост, близка до потока, на края ѝ), има ли пълна проверка преди маневрата — ляв мигач, огледало и мъртва зона през рамо — и вписва ли се вливането без да принуждава някого по магистралата да спира или да отбива. Спиране без причина в лентата за ускоряване и вливане без оглеждане са основни грешки; принуждаването на движещ се по магистралата да спре рязко е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: rain. Deliberately NO physics.wetGrip — the authored ghost envelope
    // of this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is the conditions speed envelope (0.85 × 140), not
    // braking distance.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [MWE_MAINLINE_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-lane-end — „Краят на лентата — вливане с цип"
// (OV-16 „Цип-принцип" + OV-01/OV-02, the lane-change duties)
// ---------------------------------------------------------------------------

/** ln-merge-v1 lane centers (meta.scenario — the L7 copy truth). */
const LNM_X_ENDING = 4.06; // laneId 0 — the curb lane the drill starts in; it dies
const LNM_X_THROUGH = -4.06; // laneId 1 — the lane that survives the taper
/** ln-merge-v1 story arclengths in district y (meta.scenario). */
const LNM_TAPER_FROM_Y = 180; // the 60 m taper begins
const LNM_TAPER_TO_Y = 240; // …and the ending lane is gone from here
const LNM_END_Y = 280;

/**
 * THE CAR YOU MUST NOT CUT OFF: the shipped rearTailgater actor armed in the
 * THROUGH lane (extraRightOffsetM = −one lane pitch off the graph's curb-lane
 * path ⇒ x ≈ −4.06), released once the player is clear of the spawn. It closes
 * up, keeps station behind the player through the pressure window, and then —
 * because its lane is the one that continues — accelerates BY at the posted 50
 * (passShiftM = 0: it passes in its own lane). The пролука behind it is the one
 * the taught drive merges into.
 *
 * PRESSURE SCENERY under the learn-only policy (doc 72 FO-07): the runner
 * emits ZERO SimTick events — no violation and no collision can grade from it.
 * Everything graded here is the player's own channel: the lane-change
 * indicator/mirror pair, and the objective gate past the taper. That is also
 * why the blind-merge demo's contact is an AUTHORED beat (DriveStep.collision,
 * the scMergeAccelLane precedent), not a physical overlap.
 *
 * SWEEP 161 — „NEVER THROUGH THE PLAYER" WAS THE CLAIM THIS PARAGRAPH USED TO
 * MAKE, AND IT IS FALSE. The runner stages this actor `playerGuard: false`
 * (RearTailgaterRunner.stage, hard-coded — the spec has no such field), so
 * staged.ts step 2 — „never ram the player from behind" — is skipped for it,
 * and the on-path advance has no anti-overlap clamp against the player at all
 * (only against ambient bodies, step 3b). A student in the through lane while
 * the pass is running is a body the pass goes through.
 *
 * MEASURED on ln-merge-v1 through `createTrafficSystem` + the production
 * RearTailgaterRunner: a constant-speed drive from the authored spawn (y = 12)
 * up the curb lane that slides one lane pitch left over 2 s starting at
 * `mergeAt`, reporting the closest CENTRE separation to the actor over the
 * whole run (metres), and whether the runner's pass ever resolved:
 *
 *      mergeAt y=  30   60  100  140  180  234   pass on a drive that never merges
 *      50 км/ч    9.26 9.26 9.26 9.26 9.26 9.26   NEVER resolves
 *      40 км/ч    0.01 0.01 0.01 0.01 0.01 5.74   resolves
 *      30 км/ч    0.04 0.04 0.04 7.19 8.12 8.12   resolves
 *      20 км/ч    0.03 0.03 8.12 8.12 8.12 8.12   resolves
 *      12 км/ч    0.13 1.71 8.12 8.12 2.99 8.12   resolves
 *
 * 8.12 is one lane pitch — the correct pass, alongside. 0.01–0.13 m is a dead
 * centre-on-centre overlap. The 40 км/ч row is the one the earlier grid (12/20/
 * 30 only) never reached and it is the worst: at the pace instruction 4 asks
 * for, EVERY merge point up to and including the taper's start is an
 * interpenetration. hz-roadworks-v1 reproduces the same shape on the same probe
 * (0.01–0.07 m for merges at y ≤ 120), which is the sweep's „the correct drive
 * collides" row on that template.
 *
 * CORRECTED 2026-08-23 — „A STUDENT WHO DID THE TAUGHT THING EARLY" WAS WRITTEN
 * HERE AND IS NOT WHAT THE GRID SHOWS. The rows above are a drive that holds one
 * speed and never performs instruction 4 („Ако колата до теб е почти наравно —
 * отпусни газта и я пусни да мине"). Re-measured with the lift performed —
 * ease by 2 × `easeKmh` while the actor is abreast, resume once the runner
 * reports it clear, then merge so the 2 s movement FINISHES on the drill's own
 * `sc-mle-merge` waypoint — the tightest separation is **8.12 m at 12, 20, 30,
 * 40 and 50 км/ч**: one exact lane pitch, at every pace. That much is true and
 * is pinned in __tests__/merging-route-vs-staged.test.ts, which reddens if the
 * waypoint moves into the pass window, if the actor is deleted, or if
 * `passSpeedMps` rises above the posted limit.
 *
 * SCOPE RESTORED BY THE VERIFIER, SAME DAY — „THE DRILL IS CORRECTLY AUTHORED
 * FOR THE STUDENT WHO OBEYS IT" STOOD HERE FOR ONE ROUND AND IS FALSE. It was
 * read off a grid that varies ONE thing (the lift) while silently pinning
 * another: every row of it merges at y = 236, the LAST metre before the taper
 * ends. But instruction 2 is „Забележи края на лентата РАНО … колкото по-рано
 * го видиш, толкова повече метри имаш, за да се впишеш спокойно — ВМЕСТО да се
 * бориш за сантиметри на самия край." The drill's own words send the student to
 * merge early; the grid never let him. Re-measured on the same probe with the
 * lift PERFORMED and the merge point swept — closest centres, m:
 *
 *      merge finishes at y=  30   60  100  140  180  234
 *      12 км/ч             0.17 8.12 8.12 8.12 8.12 8.12
 *      20 км/ч             0.17 8.12 8.12 8.12 8.12 8.12
 *      30 км/ч             0.11 0.11 8.12 8.12 8.12 8.12
 *      40 км/ч             0.05 0.05 0.05 8.12 8.12 8.12
 *      50 км/ч             0.03 0.03 0.03 0.03 5.08 8.12
 *
 * So the overlap does NOT belong only to „the driver who refuses the lift". At
 * the posted 50 a student who eased exactly as instruction 4 asks is inside the
 * лепка for every merge point up to y = 140 — the whole first half of the road,
 * and 40 m of it before the taper has even begun. The ORIGINAL sentence in this
 * block — „the лепка drives through the body of a student who did the taught
 * thing early" — was right, and deleting it narrowed a true diagnosis into a
 * false one. It is restored.
 *
 * What the lift grid DOES buy, and it is worth keeping: merging LATE (on the
 * gate itself) is clean at every pace, so the two variables are separable —
 * the lift is not what saves the student, the late merge is. A driver who
 * neither lifts nor merges late earns this template's SECOND mistake card
 * („Изтласкване на кола от съседната лента") and that conviction is deserved;
 * its DELIVERY is still wrong either way, arriving as a 10-point «Удар в друго
 * превозно средство» from a body that interpenetrated rather than the authored
 * LANE_CHANGE_WITHOUT_MIRROR_CHECK. NOTE for whoever re-runs the probe: the
 * suite's `lift` window is `aheadM ∈ (−20, 6)`, and this actor holds dormant at
 * arc 8 — four metres BEHIND the spawn — so the ease fires on tick 1, at
 * y ≈ 12, not „while the actor is abreast" as the helper's doc says. With a
 * true abreast cue (±6 m, after release) the rows are unchanged at 12/20/30/40
 * but at 50 the lift NEVER FIRES at all: the лепка glues at `followBehindM` 14
 * and closes no further, so a limit-holding student gets no „почти наравно"
 * moment to respond to. That is instruction 4 having no trigger, and it is a
 * second reason the 50 км/ч row cannot be read as a clean pass.
 *
 * WHY 50 км/ч IS THE CLEAN ROW AND ALSO THE WORST ONE: `passSpeedMps` 13.9 IS
 * the posted 50, so against a student who holds the limit the closing speed is
 * zero and the pass NEVER resolves — the лепка simply rides beside him for the
 * rest of the road (measured: phase stays „triggered" to y = 280). That is not
 * a bug: it is what makes instruction 4 a manoeuvre instead of a courtesy, and
 * the test asserts it in both directions. It is also why the audit's own right
 * drive (top 56 км/ч, seven full stops, no lift logic) is performing mistake
 * demo 2 rather than the taught drive — read its 0:53 «Удар» that way.
 *
 * NOT FIXABLE FROM THIS FILE, and not by `passShiftM` or `passSpeedMps` either:
 * ln-merge-v1 has exactly two lanes and the surviving one is where both cars
 * have to be, so there is no third lane to pass into (the mw-entry-v1 actor
 * above CAN author −8.125 precisely because that map has one), and raising the
 * pass speed was tried and reverted — `passSpeedMps` 22 was run as a mutation
 * against the battery and it MAKES THINGS WORSE, not better: the rig then
 * reaches the end of its polyline early enough to stand still in the through
 * lane on the run-out, and a 12 км/ч student who merged correctly closes to
 * 0.08 m of it on the way to `sc-mle-finish` (3 tests red). The honest
 * fix is to let the pass phase be player-guarded while the GLUED pose keeps its
 * exemption — the exemption exists so the лепка may sit sub-6 m BEHIND the
 * student, which the pass is not — i.e. orchestrator/runners.ts, not a number
 * here.
 */
const LNM_THROUGH_CAR: RearTailgaterSpec = {
  id: "sc-mle-through-car",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["lnm-n-start", "lnm-n-end"],
    hold: { nodeIndex: 0, offsetM: 8 }, // dormant just behind the player's spawn
    cruiseSpeedMps: 13.9, // 50 km/h — the posted limit of the through lane
    // buildLaneGraph rides a oneway edge's lane on the CURB lane (x ≈ +4.06);
    // one lane pitch LEFT of it is the through lane the player must join.
    extraRightOffsetM: -(LNM_X_ENDING - LNM_X_THROUGH),
    colorIndex: 3,
  },
  releaseGapM: 26, // it rolls once the player is properly under way
  followBehindM: 14, // ~10 m of bumpers in the next lane — visible, not glued
  maxMatchSpeedMps: 16, // it can close up even on a brisk player
  pressureSec: 2.5,
  passShiftM: 0, // its OWN lane is the surviving one — no shift to make
  passSpeedMps: 13.9, // 50 km/h — the flow you are expected to fit into
  passAheadM: 24, // …and once it is this far by, the пролука behind it is yours
  easeKmh: 8,
};

/**
 * OV-16 — цип-принцип при край на лента (ЗДвП чл. 25: маневрата се извършва,
 * след като водачът се убеди, че е безопасна, и подаде сигнал; предимството е
 * на движещите се по платното, в чиято лента се влизаш). The taught norm,
 * grounded in the content bank (q-predimstvo-061, q-manevri-006/007/008):
 * ТВОЯТА лента свършва → ти си този, който се съобразява → огледало + мигач +
 * пролука, а не изтласкване.
 *
 * SWEEP 161 — THE LANE DOES NOT END. Photographed the whole way from t 1 s to
 * t 161 s of the right drive: the carriageway keeps its width, and at t 120 s
 * the coach says «Знакът и маркировката казват едно: тази лента свършва след
 * около 180 метра» over an unchanged road with a «Карай дотук» waypoint hanging
 * in it (pc-right/04-t120s.png).
 *
 * ROUTED, NOT FIXED, and it cannot be fixed from this file: `map.params` here
 * is a MIRROR of the generator recipe, not an input to anything at runtime.
 * Read out of the committed district, `ln-merge-v1.json` is ONE edge
 * (`lnm-e-street`) carrying `lanes: 2` over all 280 m — `meta.scenario`
 * carries taperFromY 180 / taperToY 240 and `zones` is absent entirely, so
 * nothing downstream has a lane drop to draw. There are no cones either: the
 * live scene's held scenery is `HELD_SCENERY[templateId]` plus the district's
 * own `meta.scenario.cones`, and this map authors none (hz-roadworks-v1 authors
 * ten, which is the only reason its closure is visible at all). The three files
 * that own it are tools/maps/gen_ln_merge.mjs and the two committed copies it
 * writes — content/world/ln-merge-v1.json and platform/public/world/
 * ln-merge-v1.json; the sign and the marking instruction 1 promises need the
 * Наредба № 2 furniture the generator does not place yet.
 *
 * W15 2026-08-28 — THREE THINGS THE ROUTING NOTE ABOVE GOT WRONG OR LEFT OUT,
 * measured rather than re-argued.
 *
 *  1. THE QUOTED SENTENCE IS NOT IN THIS FILE. The finding's evidence line —
 *     «Знакът и маркировката казват едно: тази лента свършва след около 180
 *     метра» — is `traces/scMergeLaneEnd.ts:134`, an annotation on the shadow
 *     DEMO (the frame's own transport bar reads «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ
 *     СЯНКАТА 0:03 / 0:30»). No `instructionsBg` step here claims a sign or a
 *     marking; step 1 says only that the lane ends. So the copy half of this
 *     row has a second address, and it is the trace script.
 *
 *  2. THE SIGN THE GENERATOR WOULD HAVE TO PLACE DOES NOT EXIST YET EITHER, and
 *     that is a bigger ask than „the generator does not place it". Built
 *     `buildWorldGeometry(ln-merge-v1)` and read the sign census it returns: 35
 *     kinds ship — stop, giveWay, roundabout, limit20…limit140, limitEnd,
 *     noOvertaking, noStopping, noParking, slippery, curve, railGuarded,
 *     railUnguarded, railCross, barrier, noEntry, oneWay, mandatoryRight,
 *     mandatoryLeft, children, pedestrianCrossing, priorityRoad, settlement,
 *     fuel — and NOT ONE of them is a narrowing / lane-drop / merge sign. The
 *     map builds `markingQuads: 23`, `noEntry: 1`, `oneWay: 1`, `limit50: 2`
 *     and nothing else. So the ask is TWO files, not one: a `laneEnds` (А«Пътно
 *     стеснение») member in `world/builders/signs.ts` + its census row, and
 *     THEN `tools/maps/gen_ln_merge.mjs` (plus the content/ and public/ copies)
 *     placing it at meta.scenario.taperFromY = 180 with the М-taper paint from
 *     180 to 240 and `lanes` dropping 2 → 1 past it. Until the first exists the
 *     second has nothing to place.
 *
 *  3. WHAT WAS FIXABLE HERE, AND IT IS THE HALF THAT GRADES. Because the
 *     carriageway never narrows, drifting back into the dying lane after the
 *     merge is the natural thing to do — and `sc-mle-finish` was CERTIFYING it
 *     on both aided rungs (compiled radius 12 at L1 and 10 at L2 against an
 *     8.125 m lane pitch). The measurement and the repair are on that
 *     objective. It does not build the taper; it stops the lesson rewarding the
 *     behaviour the missing taper invites.
 */
export const SC_MERGE_LANE_END: ScenarioSpec = {
  id: "sc-merge-lane-end",
  family: "merging",
  tagsBg: ["вливане", "цип-принцип", "край на лента", "престрояване", "огледала", "мигач"],
  titleBg: "Краят на лентата — вливане с цип",
  objectiveBg:
    "Когато твоята лента свършва, ти осигуряваш вливането: огледай, дай мигач и се впиши в пролука, без да изтласкваш движещите се в съседната лента.",
  archetypeIds: ["OV-16", "OV-01", "OV-02"],
  conceptIds: ["c-merging-traffic", "c-lane-change", "c-lane-choice", "c-mirrors-blind-spots", "c-driver-signals"],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in ln-merge-v1.json meta.scenario.params
    // (tools/maps/gen_ln_merge.mjs).
    params: { lengthM: 280, taperFromM: 180, taperM: 60, maxspeedKmh: 50, lanesBefore: 2, lanesAfter: 1 },
    districtId: "ln-merge-v1",
  },
  start: {
    spawnPointId: "lnm-spawn-ending-lane",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгваш в дясната лента на еднопосочна улица. След около 180 метра тази лента свършва — стеснението е твое, не на другите." },
    { n: 2, textBg: "Забележи края на лентата РАНО. Колкото по-рано го видиш, толкова повече метри имаш, за да се впишеш спокойно — вместо да се бориш за сантиметри на самия край." },
    { n: 3, textBg: "Погледни в лявото огледало: с каква скорост се движи колата в лявата лента и къде е пролуката зад нея?" },
    { n: 4, textBg: "Изравни темпото си с потока в лявата лента. Ако колата до теб е почти наравно — отпусни газта и я пусни да мине; пролуката зад нея е твоята." },
    { n: 5, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — и чак тогава завърти волана. Мигачът обявява, но не оглежда." },
    { n: 6, textBg: "Влез в пролуката с едно плавно движение и изключи мигача. Твоята лента свърши — значи ти се съобразяваш: никой в лявата лента не бива да спира или да отбива заради теб." },
  ],
  success: [
    {
      id: "sc-mle-merge",
      titleBg: "Влей се в оставащата лента преди края на своята",
      // Radius 3.5 < half the 8.125 m lane pitch: satisfiable ONLY from the
      // through lane, and pinned just short of the taper's end — a car still
      // riding the dying lane at y = 236 misses it entirely. THIS is what
      // grades „did you actually get out" (the lane-drop world zone does not
      // exist yet — see gen_ln_merge.mjs's header).
      params: { kind: "reachZone", x: LNM_X_THROUGH, y: 236, radiusM: 3.5 },
    },
    {
      id: "sc-mle-finish",
      titleBg: "Продължи по оставащата лента до края на отсечката",
      // W15 — «ОСТАВАЩАТА ЛЕНТА» WAS EARNABLE FROM THE LANE THAT ENDS, on both
      // aided rungs, and it is the graded half of sc-merge-lane-end:ae6166e2.
      //
      // The row is about the world: ln-merge-v1 carries `lanes: 2` over all
      // 280 m and никакъв taper (see the header — routed, not fixable here). But
      // the world defect has a consequence that IS this file's, and nothing had
      // ever measured it. Because the carriageway never actually narrows, the
      // natural thing for a student to do after merging is to drift back right
      // into the lane the lesson says has ended — and this gate then told him he
      // had „continued in the REMAINING lane".
      //
      // MEASURED on `compileScenario`, distance from this disc's centre to the
      // ENDING lane's centre being one 8.125 m pitch:
      //
      //     rung   authored 8 → compiled   reaches the dying lane's centre?
      //     L1              12                      YES  (by 3.88 m)
      //     L2              10                      YES  (by 1.88 m)
      //     L3–L5            8                      no   (short by 0.13 m)
      //
      // L1 is the rung a beginner opens on and the rung the sweep photographed
      // («Ниво 1 — Пълна помощ»), so the certificate was wrong exactly where it
      // is read most and where the world gives the least help. The ladder cannot
      // see this: `radiusWidenBudget` bounds the widening by the CHAIN's own
      // separation (34 m here, budget 11.25) and knows nothing about lane pitch.
      //
      // 4.5, AND WHY IT IS NOT A COMPLETABILITY HAZARD. Doc 86 B3/B5 is right
      // that a terminal radius under the 8.125 m pitch usually walls a student —
      // but that warning is about gates a car has to be AIMED at. This disc is
      // centred ON the lane the student is being sent up and 4.5 > the lane's
      // own 4.06 m half-width, so any car travelling that lane sweeps it; the
      // evaluator latches on the swept disc, not on a single frame. The rungs
      // compile to 6.75 / 5.63 / 4.5 and every one of them now clears the dying
      // lane's centre — by 1.38 m at the worst (L1) instead of overlapping it.
      // The along-approach grace every rung already gets is untouched, so early
      // is still forgiven; only „finished in the wrong lane" stops counting.
      //
      // WHAT THIS IS NOT: it does not build the taper, it does not make the lane
      // end, and it does not close :ae6166e2. It stops the lesson from
      // CERTIFYING the behaviour the missing taper invites.
      params: { kind: "reachZone", x: LNM_X_THROUGH, y: 270, radiusM: 4.5 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mle-glance-mirror", titleBg: "Ляво огледало, докато лентата ти още я има" },
        { id: "sc-mle-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 40,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeLaneEnd.ts; gates in traces/__tests__/
  // sc-merge-lane-end-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-lane-end/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-lane-end/mistake-no-indicator.trace.json" },
      titleBg: "Вливане без мигач в последния метър",
      whatWentWrongBg:
        "Водачът изчака до самия край на лентата и се пъхна наляво — без нито един мигач. Огледалото беше погледнато, но това не стига: мигачът не е учтивост, а ЕДИНСТВЕНИЯТ начин другите да разберат намерението ти, преди то да се е случило (чл. 25). Колата отляво няма как да ти направи място за маневра, която не си обявил — тя научава за нея в момента, в който вече си пред нея. Краят на лентата не е изненада: той е обозначен и се вижда отдалеч. Мигачът тръгва ПРЕДИ волана, не заедно с него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-lane-end/mistake-push-out.trace.json" },
      titleBg: "Изтласкване на кола от съседната лента",
      whatWentWrongBg:
        "Мигачът светна и воланът тръгна веднага след него — без нито един поглед в огледалото и без проверка на мъртвата зона. В лявата лента обаче вече имаше кола: тя се движи по своята лента, а твоята свършва — значи ти си този, който се съобразява. „Ще ме пуснат“ не е маневра. Мигачът обявява намерението ти, но не проверява дали лентата е свободна — това правят огледалото и рамото, ПРЕДИ волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко стеснение, ремонт или край на лента — и на всяко място, където две ленти стават една. В града това е ежедневие: лента, която свършва преди кръстовище, затворена от ремонт лента, стеснение заради паркирали коли.",
    whyBg:
      "Правилото е просто и почти винаги пренебрегвано: който има лента, продължава; чиято лента свършва, той се вписва. Цип-принципът работи само ако вливащият се подаде сигнал и изчака пролука, а не си я вземе насила. Двете типични катастрофи тук са огледални: единият се пъха, без да гледа, и удря; другият се бори за сантиметри до самия конус и принуждава цяла колона да спира. И двете идват от едно и също — решението е взето твърде късно. Забележиш ли края на лентата 200 метра по-рано, маневрата става скучна, а скучното е безопасно.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа кога забелязваш стеснението, а не как се измъкваш от него: ранно решение, огледало и мъртва зона преди волана, мигач с достатъчно преднина и вливане в пролука с едно движение. Вливане без мигач и вливане без оглеждане са основни грешки; принуждаването на движещ се в съседната лента да спира или да отбива е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: a SECOND through-lane car — denser pressure in the lane you must
    // join, so the пролука has to be chosen, not just taken. It rides the same
    // path one pitch left of the graph lane and is released later, so the two
    // cars arrive as a pair. Learn-only scenery, exactly like the first.
    {
      level: 5,
      stagedAdd: [
        {
          ...LNM_THROUGH_CAR,
          id: "sc-mle-through-car-2",
          actor: { ...LNM_THROUGH_CAR.actor, hold: { nodeIndex: 0, offsetM: 44 }, colorIndex: 5 },
          releaseGapM: 8,
          followBehindM: 30,
          pressureSec: 4,
          passAheadM: 40,
        } satisfies RearTailgaterSpec,
      ],
    },
  ],
  staged: [LNM_THROUGH_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-roadworks-shift — „Ремонт затваря лентата ти"
// (SN-07 „Временна организация" + OV-16, OV-02, OV-12)
// ---------------------------------------------------------------------------

/** hz-roadworks-v1 lane centers (meta.scenario — the L7 copy truth). */
const HZR_X_CLOSED = 4.06; // laneId 0 — the curb lane the drill starts in; cones own it
const HZR_X_OPEN = -4.06; // laneId 1 — the lane that survives the closure
/** hz-roadworks-v1 story arclengths in district y (meta.scenario). */
const HZR_TAPER_FROM_Y = 216; // the 24 m cone taper begins
const HZR_WORKS_FROM_Y = 240; // …the lane is gone, and the ВРЕМЕННО 30 starts here
const HZR_WORKS_TO_Y = 276; // the site ends; 50 resumes

/**
 * THE CAR ALREADY IN THE LANE YOU NEED: the shipped rearTailgater actor armed
 * in the OPEN lane (extraRightOffsetM = −one lane pitch off the graph's
 * curb-lane path ⇒ x ≈ −4.06), walking all three collinear segments. It closes
 * up, keeps station behind the player through the pressure window, and then —
 * because its lane is the one that continues — accelerates BY at the approach's
 * posted pace (passShiftM = 0: it passes in its own lane). The пролука behind it
 * is the one the taught drive merges into.
 *
 * PRESSURE SCENERY under the learn-only policy (doc 72 FO-07): the runner emits
 * ZERO SimTick events — no violation and no collision can grade from it.
 * Everything graded here is the player's own channel: the lane-change
 * indicator/mirror pair, the works pace, the cone contacts and the line.
 *
 * SWEEP 161 — „THE CORRECT DRIVE COLLIDES": 20 наказателни точки and TWO опасни
 * грешки on the right drive, on BOTH surfaces, with none of the three gates
 * ticked (pc-right/08-debrief.png). The paragraph above used to end „never
 * through the player"; that is true only while the student is still in the
 * CLOSED lane, and instruction 3 of this very template tells him to read the
 * cones early and get out. The runner stages this actor `playerGuard: false`
 * (RearTailgaterRunner.stage, hard-coded — the spec has no such field), so
 * staged.ts step 2 is skipped and the on-path advance has no anti-overlap clamp
 * against the player at all.
 *
 * MEASURED on hz-roadworks-v1 through `createTrafficSystem` + the production
 * RearTailgaterRunner — a constant-speed drive up the closed lane that slides
 * one lane pitch left over 2 s at `mergeAt`, closest CENTRE separation in
 * metres over the whole run:
 *
 *      mergeAt y=  40   80  120  160  200  232
 *      30 км/ч    0.01 0.01 0.01 8.12 8.12 8.12
 *      20 км/ч    0.07 0.07 8.12 8.12 8.12 8.12
 *      12 км/ч    0.03 8.12 8.12 8.12 8.12 8.12
 *
 * 8.12 m is one lane pitch — the correct pass, alongside. 0.01 m is the body of
 * the лепка inside the body of the student, and the taper does not start until
 * y = 216, so every one of those merges is EARLY in exactly the sense the card
 * praises. At 45 км/ч the actor never latches at all (passSpeedMps 12.5 cannot
 * out-run a player at 12.5 m/s), so instruction 4's „пусни я да мине" is also
 * an event the posted pace never produces — a second, softer row on the same
 * actor. See LNM_THROUGH_CAR for why `passShiftM` cannot fix either: this map
 * has two lanes and the surviving one is where both cars must be. The fix is to
 * player-guard the PASS phase while the glued pose keeps its exemption —
 * orchestrator/runners.ts, not a number here.
 */
const HZR_THROUGH_CAR: RearTailgaterSpec = {
  id: "sc-mrs-through-car",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["hzr-n-start", "hzr-n-works-start", "hzr-n-works-end", "hzr-n-end"],
    hold: { nodeIndex: 0, offsetM: 8 }, // dormant just behind the player's spawn
    cruiseSpeedMps: 12.5, // 45 km/h — the flow of the lane that continues
    // buildLaneGraph rides a oneway edge's lane on the CURB lane (x ≈ +4.06);
    // one lane pitch LEFT of it is the open lane the player must join.
    extraRightOffsetM: -(HZR_X_CLOSED - HZR_X_OPEN),
    colorIndex: 3,
  },
  releaseGapM: 26, // it rolls once the player is properly under way
  followBehindM: 14, // ~10 m of bumpers in the next lane — visible, not glued
  maxMatchSpeedMps: 15, // it can close up even on a brisk player
  pressureSec: 2.5,
  passShiftM: 0, // its OWN lane is the surviving one — no shift to make
  passSpeedMps: 12.5,
  passAheadM: 24, // …and once it is this far by, the пролука behind it is yours
  easeKmh: 8,
};

/**
 * SN-07 / OV-16 — временна организация на движението при ремонт (ЗДвП чл. 25:
 * маневрата се извършва, след като водачът се убеди, че е безопасна, и подаде
 * сигнал; Наредба № 2/2001: временните знаци и маркировка отменят постоянните и
 * се спазват като всяка друга сигнализация). The taught norm, grounded in the
 * content bank (q-manevri-033, q-signali-i-markirovka-032/060, q-signs-013):
 * временната сигнализация е закон → снижаваш скоростта → вливаш се РАНО в
 * отворената лента → държиш новата траектория през целия участък.
 */
export const SC_MERGE_ROADWORKS_SHIFT: ScenarioSpec = {
  id: "sc-merge-roadworks-shift",
  family: "merging",
  tagsBg: ["ремонт", "временна организация", "стеснение", "вливане", "конуси", "мигач"],
  titleBg: "Ремонт затваря лентата ти",
  objectiveBg:
    "Следвай временната сигнализация: снижи скоростта, влей се в отворената лента и дръж новата траектория през стеснението.",
  archetypeIds: ["SN-07", "OV-16", "OV-02", "OV-12"],
  conceptIds: [
    "c-temporary-signalization",
    "c-merging-traffic",
    "c-lane-change",
    "c-mirrors-blind-spots",
    "c-driver-signals",
    "c-speed-adaptation",
  ],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in hz-roadworks-v1.json
    // meta.scenario.params (tools/maps/gen_hz_roadworks.mjs).
    params: {
      approachM: 240,
      worksM: 36,
      exitM: 34,
      taperM: 24,
      maxspeedKmh: 50,
      worksKmh: 30,
      lanesBefore: 2,
      lanesAfter: 1,
    },
    districtId: "hz-roadworks-v1",
  },
  start: {
    spawnPointId: "hzr-spawn-closed-lane",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain AND night — both headlight faults
    // are armed with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Тръгваш в дясната лента на еднопосочна улица. Напред има ремонт: конусите започват да стесняват твоята лента на 216-ия метър и я затварят напълно на 240-ия. По тъмно или в дъжд включи първо късите светлини (чл. 70) — в ремонтен участък между конусите работят хора и те те виждат само осветен." },
    { n: 2, textBg: "Временната сигнализация отменя постоянната. Каквото пише на нея — това важи: тук ограничението в участъка е 30, а не 50." },
    { n: 3, textBg: "Забележи стеснението РАНО. Конусите се виждат отдалеч — колкото по-рано решиш, толкова по-спокойно се вписваш, вместо да се бориш за сантиметри до последния конус." },
    { n: 4, textBg: "Погледни в лявото огледало: с каква скорост върви колата в лявата лента и къде е пролуката зад нея? Отпусни газта и я пусни да мине — пролуката ЗАД нея е твоята." },
    { n: 5, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — и чак тогава завърти волана. Мигачът обявява, но не оглежда." },
    { n: 6, textBg: "Снижи до 30 преди участъка и дръж новата траектория през целия ремонт: между конусите се работи, а мястото е тясно за всички." },
    { n: 7, textBg: "Изключи мигача и продължи спокойно. Чак след края на участъка ограничението пак става 50." },
  ],
  success: [
    {
      id: "sc-mrs-merged",
      titleBg: "Влей се в отворената лента, преди конусите да затворят твоята",
      // Radius 3.5 < half the 8.125 m lane pitch: satisfiable ONLY from the
      // open lane, and pinned just short of where the taper finishes the job —
      // a car still riding the closed lane at y = 234 misses it entirely. THIS
      // is what grades „did you actually get out" (see gen_hz_roadworks.mjs's
      // header: the lane-closure world zone does not exist yet).
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 234, radiusM: 3.5 },
    },
    {
      id: "sc-mrs-works-pace",
      titleBg: "Мини през участъка по временната лента и с временната скорост",
      // The template's second duty, made graded: pinned mid-site on the open
      // lane's line AND capped at the graced 30 (33), so it is satisfiable only
      // by a driver who is both in the right place and at the posted pace. A
      // car threading the cone line at x ≈ 0 is 3.8 m away and misses it.
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 258, radiusM: 3.5, maxSpeedKmh: 33 },
    },
    {
      id: "sc-mrs-finish",
      titleBg: "Продължи по отворената лента до края на отсечката",
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 290, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mrs-glance-mirror", titleBg: "Ляво огледало, докато лентата ти още я има" },
        { id: "sc-mrs-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 45,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeRoadworksShift.ts; gates in traces/__tests__/
  // sc-merge-roadworks-shift-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-roadworks-shift/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-roadworks-shift/mistake-no-indicator.trace.json" },
      titleBg: "Вливане в последния момент без мигач",
      whatWentWrongBg:
        "Водачът изчака до последните метри преди конусите и се пъхна наляво — без нито един мигач. Огледалото беше погледнато, но това не стига: мигачът не е учтивост, а ЕДИНСТВЕНИЯТ начин другите да разберат намерението ти, преди то да се е случило (чл. 25). Ремонтът не е изненада — конусите се виждат от стотина метра, а знаците го обявяват още по-рано. Който реши рано, обявява спокойно; който отлага, накрая се пъха мълчаливо и се надява. Мигачът тръгва ПРЕДИ волана, не заедно с него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-roadworks-shift/mistake-squeeze-cones.trace.json" },
      titleBg: "Провиране през конусите",
      whatWentWrongBg:
        "Вместо да се влее, водачът реши да „пробва“ дали ще се промъкне: задържа затворената лента до самите конуси, събори ги и после се повлече по границата на участъка — нито в своята лента, нито в чуждата. Конусите не са украса, а временна маркировка: те очертават мястото, където работят хора (Наредба № 2/2001). Возенето по линията е втората половина на същата грешка — колата не е никъде, а всички около нея трябва да гадаят. Затворена лента се напуска навреме и с една маневра, а не се преговаря конус по конус.",
      codeRefs: ["COLLISION", "POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "На всеки ремонт, стеснение или временна организация на движението — в града това е ежедневие: затворена лента, изместена траектория, временни знаци върху постоянните. Същият рефлекс работи и при всяко друго стеснение: катастрофа, паднал товар, коли на пътна помощ.",
    whyBg:
      "Временната сигнализация отменя постоянната — това е целият закон в едно изречение. Знакът за 30 при ремонт не е препоръка и не е „за да им е спокойно“: между конусите има хора на метър от колата ти, платното е тясно, а траекторията е нова и никой не я знае наизуст. Двете типични грешки тук са огледални: единият се пъха в последния метър без мигач и изненадва цяла колона; другият решава, че конусите са за другите, и се провира по границата. И двете идват от едно и също — решението е взето твърде късно. Забележиш ли стеснението 200 метра по-рано, маневрата става скучна, а скучното е безопасно.",
    lawRef: "ЗДвП чл. 25; Наредба № 2/2001",
    examinerBg:
      "Изпитващият гледа кога забелязваш временната сигнализация, а не как се измъкваш от нея: ранно решение, огледало и мъртва зона преди волана, мигач с достатъчно преднина, вливане с едно движение и спазване на временното ограничение през целия участък. Вливане без мигач и возене по линията са основни грешки; събарянето на конус и принуждаването на движещ се в съседната лента да спира са опасни.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: night + rain — the works under lamps, the classic Sofia frame (a
    // closure is signalled the same way at 03:00 as at noon, and the cones read
    // worse wet). Deliberately NO physics.wetGrip: the authored ghost envelope
    // of this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is READING the temporary signalling, not braking
    // distance.
    { level: 5, conditions: { weather: "rain", night: true } },
  ],
  staged: [HZR_THROUGH_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-bus-pullout — „Автобусът потегля от спирката"
// (VU-11 „Потеглящ автобус" + FO-03 — the cut-in actor recipe, inverted)
// ---------------------------------------------------------------------------

/** mg-busstop-v1 lane centers (meta.scenario — the L7 copy truth). The EXACT
 *  (unrounded) lane-graph values: the district battery pins meta's rounded
 *  12.19/4.06 against these, and everything below is written in these. */
const MGB_X_BUS = 12.1875; // laneId 0 — the бус лента; the спирка sits in it
const MGB_X_GENERAL = 4.0625; // laneId 1 — the general lane; the player's whole drive
/** One drawn lane width on mg-busstop-v1 (3.25 m × perceptual scale 2.5), m —
 *  the bus's pull-out is exactly this, leftward. */
const MGB_LANE_SHIFT = 8.125;
/** mg-busstop-v1 story arclengths in district y (meta.scenario). */
const MGB_BAY_FROM_Y = 130; // the спирка window opens…
const MGB_BAY_TO_Y = 176; // …and the bus swings out of it here
const MGB_END_Y = 400;

/**
 * THE BUS: the shipped cutInLeadCar actor on the 12 m city-bus rig
 * (`profile: "bus"`, vehicleFleet BUS_DIMENSIONS; ADR-001 fictional livery,
 * blank route board), dwelling in the бус лента at the спирка and gliding out
 * into the player's lane. It rode the box-truck rig until W22 — see the
 * `profile` line below and the W22 stamp at the end of this file's header.
 *
 * WHY IT DWELLS WITHOUT A DWELL COMMAND: the runner issues one matchPlayer with
 * gapM = paceAheadM, whose target is `playerSpeed + 0.55 × (paceAheadM − gap)`
 * CLAMPED AT ZERO (traffic/staged.ts). Held 100+ m ahead of a spawning player,
 * that term is deeply negative, so the rig sits at the спирка with its target
 * pinned to 0 — a genuine dwell, expressed in the shipped controller. It only
 * gets under way when the player closes to roughly paceAheadM + v/0.55 ≈ 55 m
 * of it, which IS the encounter: the bus always pulls out just as you arrive.
 *
 * WHY extraRightOffsetM IS ZERO: buildLaneGraph rides a two-way edge's lane on
 * the CURB lane (x = 12.1875 — the ln-v1 precedent, re-proved on this map by
 * mg-busstop-districts.test.ts), which here IS the бус лента. So the default
 * offset parks the bus exactly where the спирка is, and — decisively — a
 * POSITIVE curb offset is what tags a staged actor as the A11 cyclist proxy.
 * The bus must never be one: it would arm the vulnerable-pass tracker and make
 * „минах покрай автобуса" grade as a cyclist offence.
 *
 * THE ЛЯВ МИГАЧ — CORRECTED 2026-08-23. This paragraph used to say
 * „TrafficVehicleState carries NO indicator channel (traffic/types.ts), so the
 * bus CANNOT show the ляв мигач the law and the copy are about." That is false
 * twice over and it was routing the next wave at the wrong file:
 *
 *   • the channel exists END TO END — `VehicleIndicator` and
 *     `TrafficVehicleState.indicator` (traffic/types.ts), the `setIndicator`
 *     command, and the fleet renderer (ledger L6, founder items 43/44);
 *   • and THIS runner already drives it: CutInLeadCarRunner lights the lamp
 *     INDICATOR_LEAD_SEC of the actor's own travel before the cut. MEASURED on
 *     mg-busstop-v1 through the production runner — the lamp comes on with the
 *     player at y = 137.8 (5 км/ч) / 132.0 (12) / 118.3 (30), i.e. 4–24 m
 *     before the glide starts at y ≈ 142. So «подаде ляв мигач и тръгне да
 *     излиза» (instruction 3) is honoured on every taught drive.
 *
 * WHAT IS ACTUALLY MISSING is narrower and belongs to one function: the bus
 * cannot signal while it is STILL STANDING at the стоянка, which is the order
 * чл. 67 is written in („подал сигнал, ЧЕ ПОТЕГЛЯ") — the runner's lamp gate is
 * `actor.speedMps > 0.5`, so the announcement and the movement arrive together.
 * `StagedActorPathSpec.indicator` (contracts.ts) is exactly the resting-blinker
 * field for this, and it is a NO-OP here: only `BrakingLeadCarRunner.stage()`
 * re-issues it (runners.ts ~1213); `CutInLeadCarRunner.stage()` does not. THE
 * ASK IS FOUR LINES in that stage(), after which `MGB_BUS.actor.indicator:
 * "left"` makes the standing rig announce itself — do NOT author the field
 * before then, because it type-checks and does nothing.
 *
 * Nothing grades off the lamp either way. Everything graded here is the
 * player's own channel: the ease gate at the pull-out, the gap he keeps
 * afterwards, and the contact he earns by forcing past.
 *
 * SWEEP 161 — THE BUS NEVER PULLED OUT, AND THE „НАМАЛИ" GATE WENT GREEN
 * ANYWAY. Photographed across the whole right drive on both surfaces: the coach
 * says «Автобусът е в лентата, ние сме зад него на две секунди» over an empty
 * carriageway (pc-right/03-ready.png), the run ends 1 of 3 objectives in, and
 * the audit wrote it down as „there is no bus". Both drives ran 10–15 км/ч.
 *
 * MEASURED, on mg-busstop-v1 through `createTrafficSystem` + the production
 * CutInLeadCarRunner (a constant-speed approach up the general lane; the probe
 * that became the reachability test below):
 *
 *      45 км/ч  glide at t 11.1 s      28 км/ч  glide at t 16.6 s
 *      30 км/ч  glide at t 15.5 s      18 км/ч  glide at t 25.7 s
 *      17 км/ч  NEVER — and 15, 12, 10, 8 км/ч likewise NEVER
 *
 * Under 18 the rig simply paces 30 m up the бус лента and drives off the end of
 * the map still in it: `cutDue` is `(distToCut <= cutRadiusM || actorPastCutM >
 * 0) && input.speedKmh >= minCutSpeedKmh` (runners.ts), and the old 18 locked
 * the drill out of its own event.
 *
 * WHY 5 AND NOT A RETUNE OF THE GEOMETRY. This drill's floor is not a taste
 * dial like the cut-in's: чл. 67 says «намали и ПРИ НЕОБХОДИМОСТ СПРИ», the
 * objective below caps the pull-out metre at 30 км/ч, and instruction 4 asks
 * for the lift. Every one of those pushes the student DOWN through the old
 * gate — obeying the briefing deleted the hazard, which is ledger L8's own
 * defect (the sc-zebra-approach walker, doc 86). A scheduled bus leaves the
 * стоянка on the timetable's clock, not on how fast the car behind it came, so
 * the honest floor is the one no moving drive can miss: the runner will not
 * even command the pace below `input.speedKmh > 4`, and 5 is the smallest whole
 * number above that — the VUCC_CHILD precedent verbatim (templates-vru2.ts:
 * „authored DOWN to a floor no drive can miss").
 *
 * TRACE-NEUTRAL, and that is a measurement too: all three committed recordings
 * approach at 28–48 км/ч, so ≥ 18 was never the binding condition on any of
 * them — the geometry was. The gate frames do not move.
 *
 * WHAT THIS DOES NOT FIX, named rather than implied: a student who comes to a
 * FULL STOP before the rig has reached its own cut point still deadlocks — the
 * pace is a rubber band (matchPlayer gapM = paceAheadM), so a stopped player
 * parks the bus 30 m ahead of himself, short of `cutAt`, and no floor can fire
 * a geometry gate that never becomes true. That needs a release mode on
 * CutInLeadCarSpec, not a number here.
 *
 * THE OTHER HALF OF THE SWEEP ROW, MEASURED 2026-08-23 AND NARROWER THAN IT
 * READ. `sc-mgb-ease` is a plain reachZone — no objective kind in
 * lessons/objectives.ts can consume a staged outcome except emergencyStop's
 * (`stagedEventId`), which is the same open row templates-following.ts records
 * against sc-fc-cutter — so the tick cannot be made CONDITIONAL on the
 * pull-out. What it can be is GEOMETRICALLY LATE: the rig is fully across into
 * the general lane with the player at
 *
 *     5 км/ч 145.4 ·  8 147.4 · 12 150.1 · 15 152.2 · 18 154.2 · 25 158.8
 *    28 160.7 · 30 161.9 · 32 163.4 · 32.5 164.0 · 35 166.0 · 38 169.5 · 40 172.4
 *
 * THE LADDER ABOVE 30 IS NOT ACADEMIC, and reading it as such is what left this
 * row open for a round. The four rows past the authored cap are the ones the
 * COMPILED gate admits: the L1 rung widens `maxSpeedKmh` 30 → 35 and prints it
 * in the world («дръж под 35 км/ч» on the gate bar, photographed), and it
 * widens the radius too, so the disc opened EARLIER on exactly the rung whose
 * cap opens it LATER. Measured on `compileScenario`, at the shipped y 168 /
 * radius 5 the disc opened at y 160.5 (L1) / 161.75 (L2) / 163.0 (L3-5) while
 * the rig finished crossing at 166.0 / 164.0 / 161.9 — i.e. both aided rungs
 * could issue the чл. 67 certificate BEFORE the bus was in the lane, by up to
 * 5.5 m. `sc-mgb-ease` below is now at y 178 radius 4 and every rung clears by
 * ≥ 6 m; __tests__/merging-compiled-gate-truth.test.ts checks the COMPILED gate
 * at every rung the template ships, and __tests__/merging-route-vs-staged
 * .test.ts still checks the authored one. The residue is only the STOPPED
 * player above, who reaches no gate at all.
 */
const MGB_BUS: CutInLeadCarSpec = {
  id: "sc-mgb-bus",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mgb-n-start", "mgb-n-end"],
    hold: { nodeIndex: 0, offsetM: 140 }, // dormant at the спирка, inside the bay
    cruiseSpeedMps: 9,
    extraRightOffsetM: 0, // the graph's curb lane IS the бус лента
    colorIndex: 4,
    // W22: was "truck" — the procedural WINDOWLESS 7.5 m cargo box, borrowed
    // because it was the largest body the fleet had. `:8fa6b888` photographed
    // the consequence: the only large vehicle on a чл. 67 drill was a lorry.
    // "bus" is now a real profile (traffic/types.ts) on a 12 m GLAZED rig with
    // a route board (vehicleFleet.ts BUS_DIMENSIONS), which is both halves of
    // what this drill needs — the CLASS the article protects (ППС от редовна
    // линия) and the LENGTH its own copy teaches.
    profile: "bus",
  },
  paceAheadM: 30,
  maxMatchSpeedMps: 11, // ~40 km/h: a city bus rolling out, never a sports car
  cutAt: { x: MGB_X_BUS, y: MGB_BAY_TO_Y }, // on the ACTOR's path, at the bay's exit
  cutRadiusM: 4,
  // SWEEP 161: was 18, which is ABOVE the pace this drill's own objective and
  // чл. 67 ask for — measured, the rig never left the бус лента at 17 км/ч or
  // below. See the block comment above for the ladder and for why 5.
  minCutSpeedKmh: 5,
  cutShiftM: -MGB_LANE_SHIFT, // one lane LEFT — out of the бус лента into yours
  cutRampSec: 2.5, // a 12 m rig glides out; it does not dart
  cutSpeedMps: 8.5, // ~31 km/h — a bus getting under way, and staying slow
  clearAheadM: 45,
};

/**
 * VU-11 — потегляне на автобус от спирка (ЗДвП чл. 67: в населено място
 * водачът е длъжен да намали и при необходимост да спре, за да пропусне
 * автобус от редовна линия, подал сигнал, че потегля от спирка).
 *
 * LAW NOTE (ADR-002 — retrieval + citation only; the divergence is flagged, not
 * hidden): the repo's own event library (scenarios/event-library.json
 * ev-bus-pullout) and doc 72 §15 VU-11 both cite чл. 67 — the library entry is
 * itself a recorded correction of an earlier, wrong чл. 100. The QUESTION BANK
 * cites the same duty as „чл. 68?" (q-predimstvo-020/041) and „чл. 69?"
 * (q-manevri-036), every one of them status needs-review, and
 * content/audits/manevri-i-izprevarvane.audit.json argues чл. 69 for the other
 * drivers' duty while c-bus-pullout in concepts.json still says чл. 68?. Three
 * repo sources, three numbers, all flagged — this template cites the library's
 * чл. 67 (the brief's own ref) and the reconciliation belongs to the content
 * review, not to the sim. The SUBSTANCE is not in doubt anywhere: намали, при
 * нужда спри, само в населено място, само за подал сигнал автобус от редовна
 * линия — verbatim the taught norm of q-manevri-036 / q-predimstvo-020/041.
 *
 * WHAT ACTUALLY GRADES (doc 72 VU-11 marks the bus-yield adjudicator 🔴 NEW —
 * `prioritySituation("bus-pullout")` is reserved vocabulary and NOT shipped, so
 * no detector convicts „не пропуснах автобуса"). The drill is therefore graded
 * on channels that exist and are exact:
 *   - the OBJECTIVE gate at the pull-out (maxSpeedKmh 30 on the general lane):
 *     „намали" made a contract — a driver who forces past is simply never
 *     there slowly enough, and objectives advance sequentially, so his run
 *     stops at that gate (the sc-ov-being-overtaken pattern);
 *   - COLLISION, from the contact forcing past earns;
 *   - FOLLOWING_TOO_CLOSE, from the gap he keeps once the bus is in front (the
 *     shipped cut-in pipeline, with its followRecoveryRateMps guard keeping the
 *     honest ease innocent).
 *
 * SWEEP 161, THE HALF THIS FILE CANNOT REACH — „THERE IS NO BUS AND THERE IS NO
 * СПИРКА", and it is worth being exact about what the auditor saw, because the
 * row reads as one defect and is two. The rig IS staged and IS on screen:
 * zoomed out of pc-right/03-ready.png it is a small WHITE BOX 125 m up the бус
 * лента, indistinguishable at that distance from the parked cars beside it —
 * which is why the sheet records «the only large vehicle in shot is a white box
 * truck». So:
 *
 *   1. THE RIG IS NOT A BUS. `VehicleProfile` (traffic/types.ts) has car, van,
 *      truck, emergency, tram, train, cyclist, childCyclist, animal — and no
 *      BUS. `profile: "truck"` below is the largest body that exists, chosen
 *      for that reason and labelled as a proxy; the clip plan even names it
 *      «Камион, който се вклинява отпред». A drill whose whole legal content is
 *      „автобус ОТ РЕДОВНА ЛИНИЯ" (чл. 67 applies to nothing else) cannot teach
 *      recognition from a box van. THE ASK is a `"bus"` member of
 *      `VehicleProfile` + its rig in the fleet builder (~12 m, city livery,
 *      ADR-001 fictional) + its row in VEHICLE_PROFILE_LENGTH_M /
 *      VEHICLE_PROFILE_WIDTH_M; one word changes here once it exists. Nothing
 *      about grading moves: the profile is data + presentation only.
 *
 *      W15 2026-08-28 — AND THERE IS A RENDER-ONLY STOPGAP THAT FITS THIS RIG
 *      ALMOST EXACTLY, which no lane had noticed: `ScenarioSpec.actorLabels`
 *      (doc 87 B40(a)) exists for precisely this — «a lesson whose SUBJECT is a
 *      car the student cannot read at the range the lesson asks him to read it
 *      at». Its renderer (`TrafficLayer.tsx:2343`) shows the caption ONLY while
 *      the actor is genuinely stationary and within
 *      `STAGED_ACTOR_LABEL_MAX_DIST_M` = 120 m, and both conditions land on
 *      this drill as if measured for it: traced through the production runner,
 *      MGB_BUS stands at y 140.0 with v 0.0 for the first 25–30 s of a 12 км/ч
 *      approach (≈8 s at 30), and the spawn is 120 m short of it — so the card
 *      is out of range at the briefing beat, exactly the „meet the instruction
 *      first, then find the shape" behaviour `stagedActorLabels.ts` argues for,
 *      and it is up while the student is reading the стоянка and gone the frame
 *      the rig rolls. It cannot make the drill easier: nothing here grades off
 *      the rig's identity.
 *      THE ASK is three lines in two files this template may not touch —
 *        · `contracts.ts:451` widen the union:
 *            export type StagedActorLabelKind = "standingOnGreen" | "busOnRoute";
 *        · `traffic/stagedActorLabels.ts` add the copy, wording taken from this
 *          template's own instruction 2 and 3 (the `standingOnGreen` rule: the
 *          card is the lesson's sentence moved to where he is looking), and its
 *          `lawRef` byte-identical to `teach.lawRef` below — "ЗДвП чл. 67" —
 *          so ADR-002 holds and no article is invented:
 *            busOnRoute: { headlineBg: "АВТОБУС ОТ РЕДОВНА ЛИНИЯ",
 *                          line1Bg: "Спрял на спирката — всеки момент потегля",
 *                          line2Bg: "В населено място си длъжен да го пропуснеш",
 *                          lawRef: "ЗДвП чл. 67", accent: "#e8b34a" }
 *        · and then ONE line lands here, which `validate.ts:165` already
 *          checks against this template's own staged ids:
 *            actorLabels: [{ actorId: MGB_BUS.id, kind: "busOnRoute" }],
 *      It does not make the box van a bus. It stops the drill asking a
 *      seventeen-year-old to recognise „автобус от редовна линия" — the only
 *      class of vehicle чл. 67 covers — from an object drawn as cargo traffic,
 *      which is the part of :8fa6b888 that teaches him the wrong thing.
 *   2. THERE IS NO СПИРКА TO STAND AT. mg-busstop-v1 carries the bay ONLY as
 *      `meta.scenario.busBayY` (130…176) — no shelter, no М-marking, no pole,
 *      and its one `zones` entry is the full-length busLane. Nothing downstream
 *      has a stop to draw, so instruction 2's «на спирката стои автобус» points
 *      at bare tarmac. THE ASK is tools/maps/gen_mg_busstop.mjs (plus the two
 *      committed copies it writes) or `HELD_SCENERY["sc-merge-bus-pullout"]` in
 *      scene/scenarioSceneryProps.ts, exactly the seam sc-merge-from-property
 *      records for its бензиностанция.
 *
 *      RE-MEASURED 2026-08-27, AND THE ASK IS NOW SMALLER AND MORE EXACT THAN
 *      THE PARAGRAPH ABOVE — because half of it has since shipped and drew the
 *      wrong object, which is worse than not shipping. `busStopSheltersOf`
 *      (scene/scenarioSceneryProps.ts:706) already reads `meta.scenario
 *      .busBayY` and is already on the LIVE path (`heldSceneryFor` :931), and
 *      mg-busstop-v1 passes every one of its gates: archetype
 *      „straight-street", laneCenterRightM 12.19, lanesPerDirection 2, busBayY
 *      130…176. So a shelter IS emitted, at x ≈ 19.75, y = 153. What it is
 *      cannot be recognised: `SHELTER_LENGTH/HEIGHT/THICKNESS_M` are
 *      4.5 × 2.5 × 0.2 (:686-688) and every `kind: "wall"` obstacle renders
 *      through ONE branch — `components/sim/ScenarioObstacles.tsx:611
 *      ObstacleWall`, a single `boxGeometry` in flat `#8d8a83`. The student is
 *      shown a 20 cm grey fence panel on the verge. That is why the w13 judge
 *      wrote «no навес, no stop pole, no bus-bay marking» while the code that
 *      places one is green: the predicate is live, the pixels are not a спирка.
 *      THE CHEAP EXACT FIX, end-to-end already supported: give
 *      `content/world/mg-busstop-v1.json` (and its `platform/public/world/`
 *      twin) ONE building with `kind: "busStop"` over the bay. `props.ts`
 *      builds the MODELLED shelter from that frontage, and `busStopSheltersOf`
 *      stands down by its own first guard (:709-713) so no second навес
 *      appears. `DistrictBuilding.kind` already admits it (world/types.ts:234
 *      — `"school" | "busStop"`); no new type, no new renderer.
 *
 * Both are OUTSIDE this file and neither moves a graded metre. What WAS inside
 * it — the floor that kept the rig in the бус лента at every taught pace, and
 * the compiled gate that certified the yield before the rig had moved — is
 * fixed above and below, with the geometry re-measured at every rung.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W15 2026-08-28 — THE СПИРКА ROW IS DEAD; THE „EVENT NEVER HAPPENS" ROW HAS A
 * CAUSE, AND IT IS NOT THE ONE ANYONE HAD GUESSED.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * (a) sc-merge-bus-pullout:c17c12de — «No shelter and no bus-stop marking
 *     appears anywhere on the route … The bay exists in the map only as
 *     meta.scenario.busBayY, i.e. as a coordinate with no geometry. Unchanged.»
 *     REFUTED AT HEAD, and the dates are the whole argument: the frame it is
 *     judged on (`sweep161/…/pc-right/07b-menu.png`, and `04-t038s`) was
 *     written **2026-08-17**; `busStopSheltersOf` landed 2026-08-23 (a5344aa)
 *     and `paintBusStopZigzag` on 2026-08-27 (6399a8d). The row is a photograph
 *     of a build that no longer exists.
 *
 *     MEASURED at HEAD, on `buildWorldGeometry(mg-busstop-v1)` + the live
 *     `heldSceneryFor` path, not read off the source:
 *       · markingQuads 187 with `meta.scenario.busBayY` present, 164 with the
 *         key deleted — **23 quads of зигзаг** attributable to the bay and to
 *         nothing else. There IS a bus-stop marking on this route.
 *       · `heldSceneryFor("sc-merge-bus-pullout@L1", raw)` returns the shelter
 *         wall at (19.753, 153), 4.5 × 2.5 × 0.2 m — on the live scene path
 *         (`lessonWorldRecipe.ts:272` → `LessonScene`).
 *     What survives is only the sentence this header already wrote at :959 —
 *     the panel RENDERS as a flat grey box (`ScenarioObstacles.tsx:611
 *     ObstacleWall`), so it is a landmark and not a навес. That residual keeps
 *     its costed fix (one `kind:"busStop"` building over the bay in both copies
 *     of mg-busstop-v1); it is not the same claim as „no marking exists".
 *
 * (b) sc-merge-bus-pullout:714bfbca — «the pull-out encounter is never
 *     presented, yet its objectives tick anyway», photographed as «ЗАДАЧА 2/3
 *     Нареди се зад автобуса…» over empty asphalt at 6 км/ч. TRUE, and the
 *     cause is measurable. Driven through the production stack
 *     (`createTrafficSystem` + `CutInLeadCarRunner` + the COMPILED gate), the
 *     bus's own position at the instant the player reaches the near edge of
 *     `sc-mgb-behind-bus`, per constant pace:
 *
 *         pace     cut fires at   bus is …                       verdict
 *          6 км/ч   player y 146   y 437 — 166 m ahead, finished  gone
 *         12        player y 150   y 152 — 119 m BEHIND him       gone
 *         20        player y 155   y 368 —  97 m ahead            a dot
 *         30        player y 162   y 304 —  33 m ahead            correct
 *         31        player y 163   y 300 —  29 m ahead            correct
 *         35        player y 166   y 285 —  14 m ahead            correct
 *
 *     So the banner is TRUE at the pace the drill teaches (instruction 6's «на
 *     две секунди» behind a rig cruising 8.5 m/s) and false below ~20 км/ч.
 *     TWO separate mechanisms put it there, and only the first was known:
 *       · after `clearAheadM: 45` the runner RESOLVES and stops commanding, and
 *         the rig then cruises `cutSpeedMps` 8.5 unattended — against a 1.7 m/s
 *         crawler it opens 6.8 m/s and is off the 400 m map inside a minute;
 *       · and then IT COMES BACK. At 12 км/ч the trace shows the actor reach
 *         `finished: true` at y 451 and, five seconds later, reappear at
 *         y 150.1 with `finished: false` — the traffic system RECYCLES the
 *         staged agent to the head of its path. The student is shown the bus
 *         drive away, then a bus at the стоп BEHIND him, and is told to form up
 *         behind it. That recycle is `traffic/system.ts`, not this file, and it
 *         is the sharper of the two: a resolved staged encounter should not
 *         restage itself inside the same drive.
 *
 *     ONE THING THE EARLIER ROUTING NOTE ASSUMED AND THE TRACE DISPROVES: the
 *     rig is NOT dragged out of the bay the moment the player moves. Under
 *     `matchPlayer` it stands at y 140.0, v 0.0, for the first 25–30 s at
 *     12 км/ч (≈8 s at 30) — i.e. instruction 2's «на спирката стои автобус» is
 *     honoured. The premise is staged; it is the SECOND banner that outlives it.
 *
 *     THE FIX IS STILL NOT AN INTEGER HERE, and the previous lane's instruction
 *     stands: `sc-mgb-behind-bus` cannot be made conditional on the encounter
 *     while `ObjectiveParams` has no way to read a staged outcome. The exact
 *     ask is a ninth witness demand on `ReachZoneParams` —
 *     `requireStagedResolved?: string`, the `stagedEventId` key
 *     `completeManeuver:"emergencyStop"` already takes — read per frame off the
 *     `ObjectiveContext.stagedOutcomes` the engine ALREADY builds
 *     (`lessons/engine.ts:1220`), unknown-is-never-a-refusal like its eight
 *     siblings, and named on `serializeObjectiveParams`'s whitelist
 *     (`params.ts:207`) or it is dropped on the way to the compiled lesson.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W19 2026-08-30 — :8fa6b888 («the only large vehicle on the route is a box
 * truck») RE-VERIFIED AT HEAD, STILL TRUE, AND STILL NOT REPAIRABLE FROM THIS
 * FILE. Both seams the two paragraphs above cost out are byte-unchanged:
 *
 *   · `traffic/types.ts:139` — `VehicleProfile` is STILL car | van | truck |
 *     emergency | tram | train | cyclist | childCyclist | animal. No bus. And
 *     `vehicleFleet.ts:183` still routes `profile: "truck"` to
 *     TRUCK_MODEL_INDEX — the PROCEDURAL cab-plus-cargo-box rig, 7.5 × 2.4 ×
 *     3.1 m with no glazing (`TRUCK_DIMENSIONS`, vehicleFleet.ts:168), which
 *     is precisely the «windowless van body» the sheet photographs.
 *   · `contracts.ts:524` — `StagedActorLabelKind` is STILL `"standingOnGreen"`
 *     alone, so the render-only stopgap named above (`actorLabels: [{ actorId:
 *     MGB_BUS.id, kind: "busOnRoute" }]`) does not type-check yet. Measured
 *     through `compileScenario` on 2026-08-30: this template compiles
 *     `actorLabels: null` at L1 and L3 — the caption channel is unused here.
 *
 * The REST of that chain was re-checked end to end and is live, so widening the
 * union plus the copy entry IS the whole job: `compile.ts:1344` copies the
 * field onto the LessonSpec, `LessonScene.tsx:2392` hands it to `TrafficLayer`,
 * and `TrafficLayer.tsx:2489-2540` draws whichever kind is named (the only
 * shipped user is `templates-signals.ts:899`).
 *
 * AND THE TWO CHEAP-LOOKING ESCAPES ARE BOTH WORSE, said once so no lane tries
 * them: re-profiling MGB_BUS to a body the union DOES hold trades one wrong
 * shape for another (a `van` is smaller than the box, a `tram` is a railed
 * vehicle on a street with no rails and would teach the wrong article
 * entirely); and rewording instruction 2 to describe what is on screen is not
 * honesty but a legal error — чл. 67 covers «автобус от редовна линия» and
 * NOTHING else, so a drill about a камион at a спирка would be teaching a duty
 * that does not exist. The copy is right and the body is wrong; the body is the
 * thing to change, in the two files named above.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W20 2026-08-30 — THE ROW STANDS (re-verified a third time; no code changed
 * for it here), BUT TWO SENTENCES ABOVE ARE WRONG IN THE DIRECTION THAT COSTS
 * THE NEXT LANE A WHOLE ROUND. Both corrections are measurements, not readings.
 *
 * (1) THE `busOnRoute` STOPGAP COSTED ABOVE IS RED ON ARRIVAL, so it is FOUR
 *     files and not three. `traffic/__tests__/staged-actor-label.test.ts`
 *     («ADR-002: cites the rule by NAME and invents no article number») loops
 *     over EVERY key of `STAGED_ACTOR_LABELS` and asserts of each `lawRef`
 *     that it does NOT match /чл\.|ал\.|т\.\s*\d/ and that it DOES contain
 *     "ППЗДвП". The entry costed above — `lawRef: "ЗДвП чл. 67"`, chosen
 *     precisely because it is byte-identical to this template's own
 *     `teach.lawRef` — fails BOTH the moment it is added.
 *     The assertion's own comment gives its reason («content/law/acts holds no
 *     ППЗДвП, so a чл. here would be unverifiable BY CONSTRUCTION»), and that
 *     reason is true of `standingOnGreen` alone: ЗДвП IS in the corpus, and
 *     чл. 67 is retrievable from it (below). The narrowing that keeps ADR-002
 *     intact is the one the LAST test in that same describe already makes for
 *     the one shipped kind — a caption's `lawRef` must be the same bytes as its
 *     owning lesson's `teach.lawRef` — rather than hard-coding one act's name
 *     for every kind that will ever exist.
 *
 * (2) чл. 67 DOES NOT SAY «АВТОБУС», so «чл. 67 covers «автобус от редовна
 *     линия» and NOTHING else» is not what the act says. RETRIEVED, not
 *     recalled — `content/law/acts/zdvp.json`, unit `чл. 67`: «Водачът на
 *     нерелсово пътно превозно средство е длъжен да намали скоростта, а при
 *     необходимост и да спре, за да позволи на пътните превозни средства от
 *     РЕДОВНИТЕ ЛИНИИ за обществен превоз на пътници да извършат необходимите
 *     маневри, свързани с потеглянето им от обозначените спирки.» The class the
 *     article protects is «ППС от редовна линия» — a тролейбус and a route
 *     МИКРОБУС are inside it; the word автобус is this drill's, not the law's.
 *
 *     THAT MATTERS BECAUSE THE FLEET ALREADY SHIPS ONE. `kargo_m` — the YELLOW
 *     route minibus GLB (`vehicleFleet.ts:98`, `public/sim/vehicles-v2/
 *     kargo_m.glb`) — is a GLAZED passenger body with doors, i.e. the exact
 *     property the sheet says is missing from the windowless cargo box. And no
 *     `VehicleProfile` reaches it: `modelForVehicle` routes "van" to kargo_v
 *     and nothing at all to kargo_m, so today it can only surface as a random
 *     ambient pick (weight 3) and can never be staged on purpose. The cheapest
 *     body-side fix is therefore NOT a new 12 m rig — it is one union member in
 *     `traffic/types.ts` routed to `FLEET.indexOf("kargo_m")` in
 *     `modelForVehicle`, against an asset that already loads.
 *
 *     WHAT THAT TRADE COSTS, so it is a decision made once and not a swap made
 *     quietly: a minibus is ~6 m and this drill's mistake card teaches the 12 m
 *     corpus («Автобусът е дълъг 12 метра и завива с целия си корпус…
 *     шофьорът му седи на два метра над земята»). Taking kargo_m buys the right
 *     VEHICLE CLASS and the glazing and loses the length lesson, and instruction
 *     2, instruction 3 and that card would each need one word — «микробус от
 *     редовната линия» — to stay honest; those three lines ARE in this file. A
 *     purpose-built 12 m bus keeps both halves and costs a rig. Founder's call.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W22 2026-08-31 — :8fa6b888 IS CLOSED, the expensive way (the rig), because
 * the cheap way loses the half of the lesson the copy is built on. Landed:
 * `VehicleProfile` gains "bus" (traffic/types.ts) with a 12 × 2.55 row in BOTH
 * dimension tables; `BUS_DIMENSIONS` + `buildCityBusRig` (vehicleFleet.ts) —
 * three material groups, a window band down both flanks, a windscreen that
 * straddles the 2.0 m eye line the mistake card names, curb-side doors and a
 * BLANK route board (ADR-001: no digits, so no real line is depicted);
 * `StagedActorPathSpec.profile` gains "bus" (contracts.ts); `PROFILE_BG` gains
 * «Автобус» (clips/clipPlanBuilder.ts) — without that row the clip card falls
 * back to «Автомобил», and clipPlan.generated.ts had been shipping «Камион,
 * който се вклинява отпред» for this very drill.
 *
 * NOT COSMETIC, and this is the part to re-measure before touching it again:
 * both dimension tables are LIVE grading inputs (`system.ts bumperSubtrahendM`,
 * `collision/bodies.ts actorObb`, `NpcColliders npcShellHalfExtents`), so the
 * actor's rear bumper moved 2.25 m closer than the box truck's. The three
 * committed traces still grade EXACTLY their authored codes with no re-record —
 * the shadow still earns zero violations at the tighter geometry — but the ease
 * script has less margin than it did.
 */
export const SC_MERGE_BUS_PULLOUT: ScenarioSpec = {
  id: "sc-merge-bus-pullout",
  family: "merging",
  tagsBg: ["автобус", "спирка", "бус лента", "пропускане", "дистанция", "населено място"],
  titleBg: "Автобусът потегля от спирката",
  objectiveBg:
    "В населено място пропусни автобуса, който е подал ляв мигач да потегли от спирка — намали и го пусни да се влее.",
  archetypeIds: ["VU-11", "FO-03"],
  conceptIds: ["c-bus-pullout", "c-merging-traffic", "c-following-distance", "c-hazard-perception", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in mg-busstop-v1.json meta.scenario.params
    // (tools/maps/gen_mg_busstop.mjs).
    params: { lengthM: 400, maxspeedKmh: 50, lanes: 4, bayFromM: 130, bayToM: 176, banKind: "busLane" },
    districtId: "mg-busstop-v1",
  },
  start: {
    spawnPointId: "mgb-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain AND night — both headlight faults
    // are armed with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Пътуваш в лявата, обща лента на градска улица. Дясната лента е бус лента — в нея е спирката, и там не се кара. По тъмно или в дъжд карай с къси светлини (чл. 70): около спирка хората пресичат иззад автобуса и преценяват по фаровете ти дали има време." },
    { n: 2, textBg: "Напред, на около 130 метра, на спирката стои автобус от редовната линия. Виж го РАНО: спрелият автобус е подвижна стена — крие пешеходци и всеки момент може да потегли." },
    { n: 3, textBg: "Щом автобусът подаде ляв мигач и тръгне да излиза от спирката, решението вече е взето от закона: в населено място си длъжен да го пропуснеш (чл. 67)." },
    { n: 4, textBg: "Отпусни газта плавно и му отвори мястото. Не се нуждае от твоята учтивост — нуждае се от метрите пред теб." },
    { n: 5, textBg: "Не форсирай покрай него „преди да е излязъл“. Автобусът е дълъг 12 метра и потегля бавно — от кабината му ти си в мъртва зона точно когато решаваш да се промъкнеш." },
    { n: 6, textBg: "След като се влее, се нареди зад него на две секунди. Пред автобус се залепва само този, който няма да види нищо: нито пътя, нито спирачките му, нито пешеходеца отпред." },
  ],
  success: [
    {
      id: "sc-mgb-ease",
      titleBg: "Намали, за да пропуснеш потеглящия автобус",
      // THE чл. 67 CONTRACT, made graded. maxSpeedKmh 30 is what „намали и при
      // необходимост спри" means in numbers on a 50 street. The forcing-past
      // demo passes this y at ~48 and misses it outright — and objectives
      // advance sequentially, so its run stops here.
      //
      // MOVED 168 → 178 AND NARROWED 5 → 4, 2026-08-23, because the geometry
      // guarantee this gate hangs on was proved against the AUTHORED numbers
      // and shipped as the COMPILED ones. The ladder is not cosmetic here —
      // this is the gate AS IT SHIPPED, at y 168 with the authored radius 5:
      //
      //     rung   radius        cap        disc opened at  rig fully in lane
      //     L1     5 → 7.5     30 → 35        y 160.5           y 166.0
      //     L2     5 → 6.25    30 → 32.5      y 161.75          y 164.0
      //     L3-5   5           30             y 163.0           y 161.9
      //
      // (radii from `compileScenario`; the right-hand column re-measured on
      // mg-busstop-v1 through `createTrafficSystem` + the production
      // CutInLeadCarRunner at the rung's own compiled cap — the ladder in the
      // MGB_BUS block above, extended to 32 → 163.4 and 35 → 166.0.)
      //
      // So on BOTH aided rungs — including L1, the rung the audit photographed
      // («Ниво 1 — Пълна помощ») and the rung a beginner starts on — the tick
      // «Намали, за да пропуснеш потеглящия автобус» was earnable up to 5.5 m
      // BEFORE the bus had finished coming out of the бус лента. The world even
      // prints the pace that does it: the L1 gate bar reads «дръж под 35 км/ч»
      // (photographed, .audit-frames/sweep161/sc-merge-bus-pullout/pc-right/
      // 05-stopped.png), and 35 км/ч is exactly the row with the worst margin.
      // That is doc 87 B58's class — a student who obeys the number the world
      // shows him collects a certificate for an event that has not happened.
      //
      // WHY y = 178. The binding rung is L1: the rig is fully across at y 166.0
      // at that rung's 35 км/ч cap, and one player-car length (4.1 m — the
      // fleet length in traffic/types.ts) past it is 170.1, so the disc's near
      // edge must sit at or beyond that. It now does, at every rung — measured
      // on the COMPILED gates, which is the whole lesson of this row:
      //
      //     rung   radius   cap    disc opens at   rig in lane   margin
      //     L1     4 → 6     35       y 172.0        y 166.0      +6.0 m
      //     L2     4 → 5     32.5     y 173.0        y 164.0      +9.0 m
      //     L3-5   4         30       y 174.0        y 161.9     +12.1 m
      //
      // WHAT THAT TABLE DOES AND DOES NOT BUY — the adversarial re-measurement
      // of this very fix, 2026-08-24, written here so the row is not closed on
      // the strength of the three lines above. Every «rig in lane» number in
      // this file, including the ones the shipped guarantee is derived from, is
      // measured on a CONSTANT-SPEED approach. The rig is not on a clock: it is
      // rubber-banded to the player (`matchPlayer`, paceAheadM 30), its cut
      // fires when IT passes y 176, and the glide then takes `cutRampSec` 2.5 s
      // — during which the player travels at whatever pace he is holding. So
      // «when is the bus in your lane» is a function of the player's whole
      // speed history, not of one number, and the constant-speed family is the
      // one where the two effects cancel. Driven through the same production
      // stack (CutInLeadCarRunner + parseObjectiveParams/stepObjective) on the
      // drive this drill's own instruction 4 teaches — hold the posted 50, then
      // ease to the gate's printed cap when the rig lights its blinker:
      //
      //     rung  ease            tick at   rig in lane   margin
      //     L1    50→35 @2.5 m/s²  y 172.2     y 172.9     −0.7 m
      //     L1    50→35 @1.5 m/s²  y 172.3     y 175.2     −2.9 m
      //     L1    50→35 @1.0 m/s²  y 174.2     y 178.1     −3.9 m
      //     L2    50→32.5 @1.5     y 173.1     y 174.1     −0.9 m
      //
      // i.e. on the two AIDED rungs the чл. 67 tick can still precede the
      // pull-out by up to ~4 m. That is an order of magnitude better than what
      // shipped (the same four rows at y 168 / radius 5 read −12.3, −14.6,
      // −13.0 and −11.1 m) and the constant-speed family is genuinely closed —
      // but the row is NOT «every rung clears by ≥ 6 m», and it may not be
      // retired on that sentence.
      //
      // AND IT CANNOT BE CLOSED FROM HERE. The far side is pinned at y 185.98
      // (see below) and the near side has to clear y 178.1 + 4.1 = 182.2 on the
      // worst taught ease, so with the L1 widening (×1.5) the disc would have to
      // satisfy y − 1.5r ≥ 182.2 AND y + 1.5r < 185.98 — r < 0.63, a gate no
      // 30 Hz tick can sweep reliably. The lever this actually needs is the one
      // the MGB_BUS block above already names as missing: an objective that can
      // read a staged OUTCOME (or an arrival-keyed release on the cut), which
      // lessons/objectives.ts cannot express today. Next lane: route it there,
      // do not re-tune this integer.
      //
      // WHY radius 4 AND NOT 5, which is the FAR side of the same disc and was
      // measured on the committed recording: `mistake-force-past.trace.json`
      // ends its run STANDING at y = 185.98 (0 км/ч, after the contact). A
      // stopped car satisfies any speed cap, so if that pose falls inside the
      // disc the forcing-past demo — the one card whose whole point is that it
      // reaches no gate — collects the чл. 67 tick after the crash. At radius 5
      // the L1 disc reaches y = 185.5 and clears it by 0.48 m; at radius 4 the
      // compiled L1 disc reaches 184.0 and clears it by 1.98 m (L2 by 2.98,
      // L3-5 by 3.98). 4 is also the largest AUTHORED radius that clears the
      // бус лента: its near edge is 12.1875 − 4.0625 = 8.125 from the
      // centreline and this disc is centred at 4.0625, so an authored radius
      // ≥ 4.0625 reaches into it (the shipped 5 reached 0.94 m in).
      //
      // SAID EXACTLY, because the compiled radius is the one the student meets
      // and this file's whole thesis is that the two are different: the LADDER
      // still reaches into the бус лента — L1's compiled 6 by 1.94 m and L2's
      // 5 by 0.94 m (the old authored 5 reached 3.44 m in at L1). A student who
      // wrongly drives the бус лента, which instruction 1 tells him not to, can
      // therefore still satisfy «намали» from inside it on the two aided rungs.
      // Making that claim true at EVERY rung needs an authored radius ≤ 2.70
      // (2.70 × 1.5 = 4.06), which is a separate measured change — it moves the
      // near edge and would have to be re-derived against both tables above.
      // What is pinned in __tests__/merging-compiled-gate-truth.test.ts is the
      // AUTHORED half, and the suite says so in the test's own name.
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 178, radiusM: 4, maxSpeedKmh: 30 },
    },
    {
      id: "sc-mgb-behind-bus",
      titleBg: "Нареди се зад автобуса и го следвай в неговото темпо",
      // The second half of the duty: пропускането не свършва с вдигане на
      // газта. Pinned deep in the run-out, on the general lane, capped just
      // above the bus's own ~31 km/h — a driver who „пропусна" the bus and
      // then went round it is doing 45+ here and misses it.
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 280, radiusM: 6, maxSpeedKmh: 38 },
    },
    {
      id: "sc-mgb-finish",
      titleBg: "Продължи по общата лента до края на отсечката",
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 380, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mgb-glance-stop", titleBg: "Оглед на спирката отрано — още преди автобусът да тръгне" },
        { id: "sc-mgb-glance-mirror", titleBg: "Огледало назад, преди да отпуснеш газта" },
      ],
    },
    parTimeSec: 55,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeBusPullout.ts; gates in traces/__tests__/
  // sc-merge-bus-pullout-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-bus-pullout/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-bus-pullout/mistake-force-past.trace.json" },
      titleBg: "Форсиране покрай потеглящия автобус",
      whatWentWrongBg:
        "Автобусът вече излизаше от спирката, а водачът натисна газта — „ще мина преди него“. Мина, но в него. Автобусът е дълъг 12 метра и завива с целия си корпус: докато носът му е още в спирката, задницата му вече е в твоята лента. Шофьорът му седи на два метра над земята и има мъртва зона точно там, откъдето ти реши да се промъкнеш — той няма как да те види и няма как да спре. И най-важното: тук не се преценява, а се пропуска. В населено място законът вече е решил вместо теб (чл. 67) — намаляваш и при необходимост спираш. Няколкото секунди, които „печелиш“, не съществуват: автобусът пак ще е пред теб на следващия светофар.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-bus-pullout/mistake-glue-behind.trace.json" },
      titleBg: "Залепване зад автобуса след вливането",
      whatWentWrongBg:
        "Водачът пропусна автобуса коректно — и веднага след това залепи за него на няколко метра, сякаш да си върне „загубеното“. Пропускането обаче не е услуга, за която да си вземеш ресто. Зад автобус на две коли разстояние ти не виждаш НИЩО: нито платното пред него, нито пешеходеца, който излиза отпред му, нито собствените му стопове навреме. Автобусът спира на всяка спирка, и то по-рязко, отколкото очакваш. Две секунди зад него не са учтивост, а единственото място, от което изобщо можеш да реагираш.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "На всяка градска спирка, всеки ден, по всяко време — Софийският градски транспорт спира и потегля хиляди пъти на ден. Същият рефлекс работи и при всяко друго превозно средство, което те моли да се влееш: колата от паркомястото, тролейбусът, боклукчийският камион. Разликата е, че за автобуса от редовната линия това не е молба, а закон — и само в населено място.",
    whyBg:
      "Автобусът вози шейсет души, тежи петнайсет тона и потегля бавно. Ако всеки, който минава покрай спирката, реши, че „има още време“, автобусът не потегля никога — затова законът обръща предимството в негова полза, вместо да го остави да чака целия поток. Двете типични грешки тук са огледални и еднакво човешки: единият форсира покрай носа му и се озовава в мъртвата зона на дванайсетметров корпус; другият коректно го пропуска и после залепва за задницата му, защото „все пак изгуби време“. И двете идват от една и съща сметка — че секундите се печелят на пътя. Не се печелят: автобусът ще е пред теб и на следващата спирка. Това, което се губи, е видимостта — а тя е единственото, което имаш.",
    lawRef: "ЗДвП чл. 67",
    examinerBg:
      "Изпитващият гледа кога виждаш автобуса, а не как се разминаваш с него: забелязваш ли спрелия автобус отдалеч, отпускаш ли газта още щом той тръгне да излиза, и оставяш ли му място без да те принуждава да набиваш спирачки в последния момент. Форсирането покрай потеглящ автобус е основна грешка (Н38: непропускане при задължение да пропуснеш); ако принудиш автобуса да спре или се стигне до контакт — опасна. Залепването зад него след вливането е основна грешка по дистанцията.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: „привечер, на мокър път" — the q-uyazvimi-065 frame. HONEST SCOPE:
    // ConditionAxis has no dusk axis (weather + night are the two dials), so
    // привечер renders as the night one — the low-light half of the frame,
    // which is the half that matters for reading a dark rig against a dark
    // curb. Deliberately NO physics.wetGrip: the authored ghost envelope of
    // this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is SEEING the bus leave, not braking distance.
    { level: 5, conditions: { weather: "rain", night: true } },
  ],
  staged: [MGB_BUS],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-from-property — „Излизане от бензиностанция през тротоара"
// (OV-15 „Включване в движението" at its smallest scale + PE-03)
// ---------------------------------------------------------------------------

/** mg-property-v1 truths (meta.scenario — the L7 copy law; the district
 *  battery world/__tests__/mg-property-districts.test.ts pins every one of
 *  these against the generated map AND against the runtime's own derivation). */
const MFP_Y_EXIT = 4.06; // the outbound (westbound) exit-lane center
const MFP_X_WALK = 34; // mgp-x-walk — the тротоар band across the exit
const MFP_X_LINE = 27.73; // the DERIVED Б2 line on mgp-e-drive (see below)
const MFP_X_LANE = 4.06; // the boulevard's northbound lane center
/** Curb-start convention (the templates-pe LET_PASS_PED recipe, rotated 90°):
 *  half-carriageway 8.125 + 0.4 curb + 1.2 stand-back = 9.73 m off the exit
 *  lane's centerline — here NORTH of it, on the station-shop pavement. */
const MFP_WALK_CURB_Y = 9.73;

/**
 * THE ТРОТОАР WALKER: the shipped pedestrianDartOut actor, walking SOUTH along
 * the pavement across the exit mouth — from the player's RIGHT, which is the
 * half he occupies, so she is in his path from her first step (the templates-pe
 * geometry, rotated onto a driveway).
 *
 * roadFromM/roadToM span the EXIT's carriageway along her walk (9.73 − 8.125 =
 * 1.6 m in, 9.73 + 8.125 = 17.85 m out), so the runtime's crossing-occupancy
 * query — and therefore PEDESTRIAN_NOT_YIELDED / PEDESTRIAN_YIELDED — is
 * measured against the band the player actually crosses, not a street zebra.
 *
 * triggerDistM 22 releases her while the player is still ~22 m up the
 * forecourt: early enough that a 22 km/h roll-off can stop short of the band
 * comfortably (so the walk-through demo grades a REFUSED duty, never a braking
 * failure), late enough that she is mid-band as he arrives.
 */
const MFP_WALKER: PedestrianDartOutSpec = {
  id: "sc-mfp-walker",
  kind: "pedestrianDartOut",
  crossingId: "mgp-x-walk",
  crossing: { x: MFP_X_WALK, y: 0 },
  start: { x: MFP_X_WALK, y: MFP_WALK_CURB_Y },
  dir: { x: 0, y: -1 },
  speedMps: 1.4,
  travelM: 23.45, // curb → across the 16.25 m exit → a few m of south walk-out
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 22,
  minTriggerSpeedKmh: 8,
};

/**
 * THE ПОТОК: the shipped oncomingStream actor — three cars northbound on the
 * boulevard's curb lane (x = 4.06), released by the player's own first metres
 * off the forecourt and then pure clockwork.
 *
 * NAMING, HONESTLY: the spec's doc calls its path „the oncoming bank" because
 * every shipped user stages it head-on. Mechanically it is „N cars on a path
 * with authored spacing, released at a player speed" — which is exactly what a
 * поток is, and the direction is the author's. Here the cars run WITH the node
 * order (mgp-n-s → mgp-n-c → mgp-n-n), so buildLaneGraph rides them on the
 * northbound curb lane: the near bank, the one a right-turner out of the
 * property crosses into. Nothing about the runner assumes head-on.
 *
 * WHY THIS ACTOR AND NOT priorityFromRight (the flagged design call): the
 * priority runner SYNCS its car to arrive `leadSec` before the player's
 * PROJECTED line-crossing and commits once he is 22 m from his line
 * (PRIORITY_COMMIT_PLAYER_M). On this map the player is inside 22 m of the Б2
 * before he even reaches the тротоар — and then he stops there for ~12 s of
 * walker. The synced car would launch, cross and sprint clear long before he
 * ever met the line, and „изчакай потока" would be a claim about an empty road.
 * A clockwork stream is the only shipped actor whose timing survives a player
 * who legitimately stops twice on one approach.
 *
 * LEARN-ONLY SCENERY (doc 72 FO-07): the runner emits ZERO SimTick events bar
 * a contact. What convicts is the PLAYER's own channel — the runtime's give-way
 * adjudication at the derived Б2 (conflictNear over PRIORITY_CONFLICT_RADIUS_M
 * at the moment he crosses the line), which is чл. 25 exactly: crossing out of
 * a property while someone is coming, from either side.
 */
const MFP_STREAM: OncomingStreamSpec = {
  id: "sc-mfp-stream",
  kind: "oncomingStream",
  actor: {
    pathNodes: ["mgp-n-s", "mgp-n-c", "mgp-n-n"],
    // Dormant at the south end with 52 m of arc BEHIND the head, so the two
    // followers have somewhere to sit. Authored at exactly gapsM[0] + gapsM[1]
    // (founder review 2026-07-27, „the other cars waiting … get in the lane
    // infront"): at offsetM 0 the runner clamps every follower's negative arc to
    // the path start, so all three bodies were staged in the SAME metre —
    // „три коли минаха" rendered as one car, and the drill's whole premise (a
    // COLUMN with no gap in it) was invisible. The 52 m puts the HEAD 3.7 s
    // earlier; the TAIL keeps its original arc (0) and therefore its original
    // clock, which is the number both the shadow's 9 s wait and the mistake's
    // conviction hang on — see traces/scMergeFromProperty.ts.
    hold: { nodeIndex: 0, offsetM: 52 },
    cruiseSpeedMps: 14, // 50 km/h — the posted limit, driven at the posted limit
    colorIndex: 2,
  },
  count: 3,
  // CUMULATIVE arcs behind the head (the runner reads gapsM[i-1] as car i's own
  // offset from car 0, not as a per-pair headway): 26 and 52 ⇒ a 26 m headway,
  // ~1.9 s at 50 — a real Sofia boulevard column. The shipped [26, 26] put cars
  // 1 and 2 on the same arc, which is why spacing the head alone still rendered
  // a two-car pile.
  gapsM: [26, 52],
  /**
   * SWEEP 161 — THE COLUMN NEVER LEFT ITS HOLD, AND „ИЗЧАКАЙ ЦЕЛИЯ ПОТОК" WAS A
   * CLAIM ABOUT AN EMPTY BOULEVARD. Left at 15 DELIBERATELY, with the number
   * measured rather than defended, because this spec cannot express the fix and
   * a value that merely looks kinder here breaks the drill's other half.
   *
   * MEASURED on mg-property-v1 through `createTrafficSystem` + the production
   * OncomingStreamRunner, driving the TAUGHT exit (roll off, halt short of the
   * тротоар, wait the walker out, creep to the Б2, halt) at four roll-off paces:
   *
   *      20 км/ч  released t 2.2 s   ·  12 км/ч  NEVER released
   *      16 км/ч  released t 2.2 s   ·   8 км/ч  NEVER released
   *
   * The un-released rows are not a slow column — the three bodies stand 215,
   * 241 and 266 m down the boulevard for the whole 220 s probe. The gate is
   * `input.speedKmh >= releaseKmh` (runners.ts), so a student who crosses 28 m
   * of forecourt under 15 км/ч deletes the flow he is told to wait for and then
   * takes the merge gate off an empty road — ledger L8's defect on the give-way
   * half of this drill.
   *
   * RE-MEASURED 2026-08-23 on the full taught exit (roll off, halt short of the
   * тротоар, 9 s of walker, creep to the Б2, halt, turn north), through
   * `createTrafficSystem` + the production OncomingStreamRunner with ambient
   * zeroed: at **6, 8 and 12 км/ч the stream is never released at all** — all
   * three cars still stand at y = −208 / −234 / −260 when the drive reaches
   * y = 138 at the far end of the boulevard. The drill's own instruction 5
   * («Изчакай да мине целият [поток] — пролуката, която ти трябва, е ЗАД
   * последната кола») and its `sc-mfp-merged` gate are then graded against an
   * empty road for every one of those paces, and the gates the template itself
   * authors — a 5 км/ч cap at the тротоар and a 3 км/ч halt at the Б2 — are
   * what put a careful student in that band.
   *
   * WHY LOWERING IT IS NOT THE ANSWER, measured on the three committed
   * recordings: every one of them crosses 6 км/ч at t 0.75 s and 15 км/ч at
   * t 1.90 s, so a floor of 6 fires the column **1.15 s early** — and the
   * authored window has less slack than that. Driven: at 6 the „с мигача" demo
   * reaches the Б2 AFTER the column has cleared and grades nothing at all
   * (s-w5-bot-completion + the trace gate both went red on
   * `expected [] to deeply equal [ 'FAILED_TO_YIELD' ]`). The drill's own
   * mistake card would become a claim about an empty road — the same crime,
   * moved one demo over.
   *
   * THE ARITHMETIC, WRITTEN DOWN 2026-08-23 SO NOBODY RE-LITIGATES THE INTEGER.
   * Replayed through `recordScMergeFromPropertyDrive` at the authored 15, the
   * two windows the trace gate asserts are:
   *
   *     shadow      line 30.88  streamClear 25.22  margin **+5.67**  (gate: > 3)
   *     „с мигача"  line 23.48  streamClear 25.22  margin **−1.73**  (gate: < −1)
   *
   * The binding wall is the demo's: **0.73 s of headroom**. Lowering the floor
   * shifts `streamClear` earlier by exactly the release delta — 15→12 costs
   * 0.40 s, 15→10 costs 0.65 s, 15→8 costs 0.90 s, 15→5 costs 1.25 s. So every
   * floor low enough to matter (the taught exit crawls: 6, 8 and 12 км/ч were
   * all measured as NEVER released) spends more than 0.73 s, and 10 leaves
   * 0.08 s — a margin thinner than a re-record.
   *
   * AND THE COLUMN CANNOT BE GIVEN MORE TIME INSTEAD. `streamClear` is set by
   * the LAST car, and the last car is pinned to the path start: the runner's
   * stage guard requires `holdArc − gapsM[i] ≥ 0`, `gapsM` already reaches
   * exactly `hold.offsetM` (52), and `hold.offsetM 0` is the collapse the
   * founder review of 2026-07-27 removed. Raising `hold.offsetM` moves the HEAD
   * north (less run-up, earlier arrival) while the tail stays at arc 0, so
   * neither `count` nor `gapsM` buys a single second. `cruiseSpeedMps` 14 is the
   * posted 50 and lowering it teaches that the boulevard crawls. There is no
   * fourth dial: the release has to key on the player reaching the Б2, which is
   * a field this contract does not have.
   *
   * WHAT IT ACTUALLY NEEDS, so the next wave routes it instead of re-tuning
   * this integer: an ARRIVAL-keyed release on OncomingStreamSpec /
   * OncomingStreamRunner. The column clears the junction 14.9–18.6 s after
   * release while the taught drive spends ~13 s standing still for the walker,
   * and the map cannot buy those seconds back — `hold.offsetM` 52 is already
   * the smallest arc that keeps the two followers off the path start, and
   * `cruiseSpeedMps` 14 is the posted 50. Every speed-keyed value is therefore
   * either too high for a careful exit (the rows above) or too early for the
   * demo (the red run above); the release has to key on the player reaching the
   * Б2, which is a field this contract does not have.
   */
  releaseKmh: 15, // the player's own roll-off starts the clock — see above
};

/**
 * OV-15 / PE-03 — излизане от имот (ЗДвП чл. 25, ал. 1: водачът, който
 * навлиза в пътното платно от прилежащ имот, е длъжен да пропусне пътните
 * превозни средства и пешеходците, които се движат по него; ал. 2: при
 * маневрата водачът е длъжен да пропусне пешеходците). The taught norm,
 * grounded in the content bank (q-manevri-003/022/064, q-predimstvo-018,
 * q-krastovishta-056, q-uyazvimi-020): излизаш от имот → нямаш предимство пред
 * НИКОГО → тротоарът първо, после потокът → сигналът обявява, не дава.
 *
 * WHAT ACTUALLY GRADES, and why the map is shaped the way it is (the whole
 * design in one place — see tools/maps/gen_mg_property.mjs's header):
 *
 *   - „не пропуснах пешеходеца по тротоара" → PEDESTRIAN_NOT_YIELDED, from the
 *     shipped crossing-occupancy chain. The тротоар is authored as a district
 *     CROSSING on the exit edge, so the duty is measured, not narrated.
 *   - „не пропуснах потока" → FAILED_TO_YIELD, from the runtime's give-way
 *     adjudication at a Б2 line the map DERIVES rather than declares: the
 *     boulevard is `primary` (rank 5) and the exit is `service` (rank 1), so
 *     the minor-meets-arterial heuristic (runtime/stoplines.ts) puts the line
 *     at the exit's mouth and the world builder paints the matching Б2. There
 *     is no other shipped way to convict a property exit: чл. 25 has no
 *     dedicated detector, and the uncontrolled right-hand-rule tracker would
 *     acquit exactly the car this drill is about (it comes from the LEFT).
 *     conflictNearFor excludes only SAME-DIRECTION traffic — which makes the
 *     derived line grade чл. 25's „пропусни всички" faithfully.
 *   - THE ORDER IS THE TEMPLATE. The тротоар (x = 34) sits OUTSIDE the derived
 *     line (x = 27.73), so the two demos fail on two different beats and
 *     neither can leak the other's codes (the generator VALIDATES that gap).
 *
 * HONEST GAP (flagged, ADR-002 discipline — the card copy says велоалея because
 * the real чл. 25 duty covers it, and the student's real exit crosses one):
 * DistrictZoneKind has no cycle-lane member and the world builder paints no
 * cycle track, so the велоалея is TAUGHT and never GRADED. No rider is staged;
 * nothing here pretends a bike lane is measured. The pavement carries the
 * vulnerable-user duty this drill grades.
 *
 * SWEEP 161 — THERE IS NO БЕНЗИНОСТАНЦИЯ. Photographed on both surfaces
 * (mobile-right/05-stopped.png): a bare grey apron on an empty green plain —
 * no pumps, no canopy, no shop front, no forecourt — while instruction 1 puts
 * the student «на изхода на бензиностанцията, с лице към булеварда».
 *
 * ROUTED, NOT FIXED: dressing a district is not something a template can do.
 * Read out of the committed `mg-property-v1.json`, the whole scene is three
 * edges, one crossing and ONE building — `mgp-b-shop`, a 40 × 20 m box at
 * (38…78, 14…34), 5 m tall — and the file has no `zones` at all. The forecourt
 * furniture belongs to tools/maps/gen_mg_property.mjs and the two copies it
 * writes (content/world/ + platform/public/world/); the alternative seam, if
 * the props are wanted per-template rather than per-district, is
 * `HELD_SCENERY["sc-merge-from-property"]` in scene/scenarioSceneryProps.ts —
 * which is where every other template's visual-only dressing already lives.
 * Nothing about the GRADED geometry moves either way: the тротоар is the
 * district crossing and the Б2 is derived from the service/primary rank pair.
 *
 * W15 2026-08-28 — THE ASK, COSTED AND MEASURED, so the next lane does not have
 * to re-derive the map. Read off the committed `mg-property-v1.json`: the exit
 * `mgp-e-drive` runs (0,0) → (68,0) as `service` with its outbound lane centred
 * at y = 4.06; `mgp-b-shop` is the ONE building, x 38…78, y 14…34, 5 m tall;
 * the graded тротоар is `mgp-x-walk` at x = 34 (a 6 m band, x 31…37) and the
 * derived Б2 sits at x = 27.73; the spawn is (62, 4.06) facing 270°. So the
 * clear dressing strip is the north verge y ∈ [8.6, 13.5] (3.9 m clear of the
 * drive's own 8.125 m kerb, 0.5 m short of the shop's south face) and the whole
 * open plain south of y = −8.6. Nothing graded lives in either.
 *
 *   · THE CHEAPEST BODY THAT READS AS A FORECOURT is the canopy fascia, and it
 *     is the same one-primitive stopgap `busStopSheltersOf` already ships:
 *     `{ kind: "wall", x: 52, y: 12, headingDeg: 90, lengthM: 24, heightM: 4.8,
 *     thicknessM: 0.4 }` — a 24 m soffit band spanning x 40…64 along the north
 *     verge, at a canopy's real height, standing behind and beside the driver as
 *     he creeps out and filling his mirrors. Pump islands are the same
 *     primitive at `lengthM: 5, heightM: 1.4` on y = 10.5, x = 44 and x = 56.
 *     All `visual`-only — no collider — like every other entry in that table.
 *
 *   · AND THE ONE OBJECT THAT ACTUALLY SAYS «БЕНЗИНОСТАНЦИЯ» IS ALREADY BUILT
 *     AND NEVER PLACED. `SignKind` carries `"fuel"` — Е7 „Бензиностанция"
 *     (`world/types.ts:526`) — and `WorldProps.tsx:189` already maps it to the
 *     `sign_service_fuel` model. Grepped `world/builders/props.ts`: nothing
 *     emits it, on any district; the census returns 0 everywhere. So the Е7 at
 *     the mouth of this exit costs an emitter, not an asset — and it is the
 *     sign a Bulgarian driver actually reads a бензиностанция by.
 *
 * NEITHER MOVES A GRADED METRE, and that is why they are dressing and not a
 * repair to this template: the тротоар duty is the district crossing and the
 * чл. 25 line is the rank pair, both untouched by anything above.
 *
 * SWEEP 161 — „THE CORRECT DRIVE COLLIDES AND FAILS", READ AGAINST THE STEERED
 * RE-DRIVE (.audit-frames/rebase/frames/sc-merge-from-property__pc-right, 2026-
 * 08-22). What that sheet actually says, so the next lane does not chase the
 * wrong file:
 *
 *   ✓ «Спри пред тротоара и пропусни пешеходеца» 0:39   ✓ «Спри напълно на Б2»
 *   1:29   ★ «Правилно пропускане на пешеходец» 1:27   ★ «Правилно спиране на
 *   знак Б2» 1:30   ✗ FAILED_TO_YIELD 1:30   ✗ «Удар в НЕПОДВИЖНО препятствие»
 *   2:39   — 20 наказателни т., НЕИЗДЪРЖАН, the last two objectives never
 *   reached.
 *
 * THE CONTACT WAS WITH A STATIC OBJECT, not with the walker the finding names
 * („hits the very pedestrian it stopped for"): the walker had cleared the
 * carriageway 40 s earlier and both her commendation and her objective are on
 * the same sheet. That drive's own instrument header reads «TRACKING: BLIND —
 * ribbon seen on 25/74 moving samples (34 %) … treat it as an unsteered
 * drive», i.e. it left the property in a straight line and never made the right
 * turn the lesson routes; the static-object bill is the far kerb. That contact
 * is not authorable — but the FAILED_TO_YIELD at 1:30 is the product working:
 * the derived Б2 grades `conflictNear` over PRIORITY_CONFLICT_RADIUS_M at the
 * instant the line is crossed, and on a live boulevard the ambient flow is
 * within 26 m of the node for most of a minute (the same sheet excludes 122 s
 * as «чакане на предимство»).
 *
 * „NOTHING HERE IS AUTHORABLE" STOOD IN THAT PARAGRAPH FOR A ROUND AND WAS
 * WRONG — it was read off ONE surface. The finding's first clause («its
 * pedestrian objective ticked green in the HUD moments earlier») is a claim
 * about the ROUTE TASK, and the pc sheet above cannot test it because that
 * drive genuinely yielded (the ★ at 1:27 says so). THE MOBILE SHEET CAN, and
 * it says the opposite thing on the same run: «✓ Спри пред тротоара и пропусни
 * пешеходеца 0:16» alongside «✗ Непропускане на пешеходец −10 изпитни т.
 * ОПАСНА ГРЕШКА» and «! пешеходец — на 0.0 м 0:06», with NO pedestrian
 * commendation (.audit-frames/sweep161/sc-merge-from-property/mobile-right/
 * run.log). One act, two channels, opposite verdicts — and the green tick is
 * the one printed on the student's HUD while the walker is at the bonnet
 * (pc-right/05-stopped.png shows exactly that pose: the car at rest, the
 * зебра under the nose, the walker on the paint, «✅ Спри пред тротоара и
 * пропусни пешеходеца» in the corner).
 *
 * THE CAUSE WAS THE GATE'S OWN GEOMETRY and it is fixed below on
 * `sc-mfp-walk-yield`: the тротоар is 6 m deep and the acceptance disc reached
 * 2.5–3.75 m INTO it, so «спри ПРЕД тротоара» was earnable from on top of the
 * pavement — and, because `reached` latches on the swept disc while the speed
 * cap can be met on any later frame, earnable AFTER driving through the walker.
 * `acceptBeforeMarkM` now ends the acceptance at the paint at every rung. What
 * that does NOT fix, stated so it is not claimed: the walker duty itself is
 * still graded only by the rule engine, and the unsteered contact above is
 * still the harness.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W19 2026-08-30 — :ab353b86 («the correct drive collides and fails — 10
 * наказателни точки, една опасна грешка, НЕИЗДЪРЖАН») WAS RE-CONFIRMED ON
 * EVIDENCE OLDER THAN THE PARAGRAPH ABOVE. No code changed for it. Written
 * down so the next wave does not spend itself on the fourth re-derivation, and
 * because one sentence up there turned out to be false.
 *
 * THE CITATION'S OWN DATE IS THE FIRST ANSWER. The judge cites
 * `.audit-frames/wave-c/frames/sc-merge-from-property__pc-right/08-debrief
 * .png`; its `_audit-status.json` reads `target.commit 70d8651…`, `startedAt
 * 2026-08-20T19:07Z`, `endedNaturally false`, `forcedBy "Прекрати урока"`. That
 * build is TWO DAYS OLDER than the `rebase` re-drive this header already
 * dissects and ten days older than HEAD, across which this file alone moved
 * +709/−52 lines. It is not a second sighting of the row; it is the same row
 * photographed earlier and read as a re-confirmation.
 *
 * THE AUTHORED CORRECT DRIVE DOES NOT COLLIDE, AT HEAD, and that is the claim
 * the finding actually makes: `traces/__tests__/sc-merge-from-property-traces
 * .test.ts` replays `shadow-correct` through the production reducer and asserts
 * `violationCodes(shadow)` is EMPTY — no COLLISION, both duties earned as
 * commendations. 20 tests, all green on this tree.
 *
 * AND THE BOULEVARD THE HARNESS HIT WAS EMPTY OF VEHICLES. Measured through
 * `compileScenario` on 2026-08-30 at every rung: `traffic.vehicleCount` is 0 on
 * L1–L5 — family "merging" is absent from `SCENARIO_FAMILY_TRAFFIC_BASELINE`
 * (compile.ts) and this template authors no `traffic`, and the same was true at
 * 70d8651. The only other vehicles this drill can hold are MFP_STREAM's three,
 * and they are not released below `releaseKmh` 15, while both wave-c legs were
 * photographed under it throughout (pc-right/04-t130s.png 10 км/ч,
 * mobile-right/04-t029s.png 13, 04-t060s.png 12). So at the moment of contact
 * there was nothing on that road, staged or ambient: the «сблъсък» can only
 * have been static scenery, exactly as the `rebase` sheet's «Удар в НЕПОДВИЖНО
 * препятствие» already said.
 *
 * THIS ALSO CORRECTS THE PARAGRAPH ABOVE. Its closing sentence — that the
 * FAILED_TO_YIELD at 1:30 is «the product working … on a live boulevard the
 * ambient flow is within 26 m of the node for most of a minute» — cannot be
 * true of this lesson at either build: there is no ambient flow here to be
 * within 26 m of anything. Whatever that code was adjudicated against, it was
 * one of the three staged cars or nothing; the sentence is left standing above
 * only so the correction is legible next to it.
 *
 * WHAT THE HARNESS ACTUALLY DID, PHOTOGRAPHED. `mobile-right/04-t029s.png`
 * shows the car ON the boulevard heading WEST at 13 км/ч, the west kerb and the
 * open plain filling the windscreen, and the exit receding in the mirror with
 * the green route arrow on it. The drive crossed the тротоар, crossed the Б2,
 * crossed both carriageways and drove off the far side; it never made the right
 * turn instruction 6 and `sc-mfp-merged` (x 4.06, y 40) both ask for. The
 * guidance is not what failed — the same frames show the ribbon's arrow
 * pointing north, and `pc-right` reaches «ЗАДАЧА 3/4 Влей се в лентата» before
 * it wanders — so what is missing is steering on a TURNING route, which is an
 * instrument gap in the drive harness and not a field of this spec. A
 * ScenarioSpec authors geometry, actors and copy; it cannot make a car turn.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * W20 2026-08-30 — :ab353b86 RE-DERIVED ONCE MORE AND THE MECHANISM FINALLY
 * NAMED. No code changed here for it. The paragraph above ends one file short
 * of the address, and that missing file is why four rounds have re-derived it.
 *
 * THE CITATION'S OWN FILES, read rather than argued:
 * `.audit-frames/wave-c/frames/sc-merge-from-property__pc-right/
 * _audit-status.json` → `target.commit 70d8651`, `startedAt 2026-08-20T19:07Z`,
 * `endedNaturally false`, `forcedBy «Прекрати урока»`, `score 10`. And
 * `08-debrief.png` prints ONE fault and no other — «Настъпи сблъсък. Това е
 * ЕДНА опасна грешка: 10 изпитни т.» over «Опасни грешки 1 · Основни 0 ·
 * Второстепенни 0». So this leg is NOT the `rebase` leg dissected above: it
 * carries no FAILED_TO_YIELD at all. THE COLLISION IS THE WHOLE ROW.
 *
 * AND NOTHING THAT MOVES COULD HAVE BEEN HIT. Re-measured at HEAD: family
 * `merging` is absent from `SCENARIO_FAMILY_TRAFFIC_BASELINE` and this template
 * authors no `traffic`, so the compiled ambient count is
 * `SCENARIO_DEFAULT_TRAFFIC.vehicleCount` = 0 (compile.ts:130); MFP_STREAM's
 * three are gated at `releaseKmh` 15 and both legs were photographed under it
 * throughout. What is left is static district geometry — kerb, verge, terrain,
 * facade.
 *
 * WHICH IS A FILE THIS TEMPLATE CANNOT REACH, and it is ONE NUMBER.
 * `compile.ts:1307` writes `collisionMinKmh: 0` for EVERY scenario lesson, and
 * `VehicleRig.tsx:667` gates on `impactKmh >= collisionMinKmh` — so a contact
 * at ANY speed, kerb scuff included, fires `onCollision` and becomes a
 * terminating ОПАСНА ГРЕШКА worth 10 наказателни точки, while the branch four
 * lines below it («Sub-threshold contact — a kerb scuff or a bumper nudge…
 * NOT graded») is unreachable for all 150 templates. A ScenarioSpec has no knob
 * for it: the field is hardcoded in the compiler and never read off `spec`. So
 * «the correct drive collides and fails» is not authorable HERE at any rung —
 * it is one constant shared by the whole catalog, already written up at the
 * sc-park-bay-exit-rev row of `routing-collision.json`, and collision/index.ts
 * carries the other half (why a swept body reaches the far side of the wall it
 * reports touching).
 *
 * ONE HONEST LIMIT ON THE GREEN TEST QUOTED ABOVE, so it is not quoted as more
 * than it is. `traces/__tests__/sc-merge-from-property-traces.test.ts:97`
 * («violationCodes(shadow) is []» — 20 tests, green on this tree) CANNOT refute
 * a static-world contact: the recorder SAT-tests the hero footprint against
 * authored `ObstacleRect2D`s only (traces/recorder.ts — «the headless twin of
 * the scene's ScenarioObstacles colliders»), and carries no district trimesh,
 * no kerb and no terrain. It proves the authored line is clean; it says nothing
 * about the surface beside it.
 */
export const SC_MERGE_FROM_PROPERTY: ScenarioSpec = {
  id: "sc-merge-from-property",
  family: "merging",
  tagsBg: ["изход от имот", "бензиностанция", "тротоар", "предимство", "вливане", "пешеходци"],
  titleBg: "Излизане от бензиностанция през тротоара",
  objectiveBg:
    "На изхода от имот пресичаш тротоар и велоалея: пропусни пешеходците, колоездачите и потока на пътя — мигачът не ти дава предимство.",
  archetypeIds: ["OV-15", "PE-03"],
  // Integration fix (wave 5): the authored list cited "c-right-of-way-basics"
  // and "c-pedestrian-priority" — neither exists in the content/concepts.json
  // 152-graph, so templates.test.ts's registry check rejected the spec. Mapped
  // onto the real ids that carry this drill's duties: c-exit-from-adjacent IS
  // ЗДвП чл. 25 (излизане от прилежаща територия), c-pedestrian-rights-duties
  // carries the тротоар yield.
  conceptIds: [
    "c-merging-traffic",
    "c-exit-from-adjacent",
    "c-pedestrian-rights-duties",
    "c-driver-signals",
    "c-hazard-perception",
  ],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in mg-property-v1.json
    // meta.scenario.params (tools/maps/gen_mg_property.mjs).
    params: { southM: 260, northM: 140, exitM: 68, walkX: 34, streetKmh: 50, exitKmh: 20 },
    districtId: "mg-property-v1",
  },
  start: {
    spawnPointId: "mgp-spawn-forecourt",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Ти си на изхода на бензиностанцията, с лице към булеварда. Между теб и платното има тротоар и велоалея — те не са „ничия земя“, а чужда територия." },
    { n: 2, textBg: "Тръгни бавно и спри ПРЕД тротоара, не върху него. Оттам се вижда надлъж по пешеходната зона; спреш ли върху нея, вече си отнел нечий път, за да видиш нещо." },
    { n: 3, textBg: "Пропусни пешеходците и колоездачите. Ти излизаш от имот — предимството е тяхно, независимо колко бързаш и колко празен изглежда тротоарът." },
    { n: 4, textBg: "Освободи ли се тротоарът напълно — не „почти“ — продължи бавно до знака Б2 на изхода и спри напълно на линията." },
    { n: 5, textBg: "Оттук гледаш само едно: потока по булеварда. Изчакай да мине целият — пролуката, която ти трябва, е ЗАД последната кола, а не между колите." },
    { n: 6, textBg: "Подай десен мигач и се влей плавно, когато платното е наистина свободно. Мигачът обявява намерението ти — той не създава предимство и не кара никого да спре." },
    { n: 7, textBg: "След вливането ускори до скоростта на потока. Кола, която изпълзява от имот и после се мъкне, е същият проблем, само по-късно." },
  ],
  success: [
    {
      id: "sc-mfp-walk-yield",
      titleBg: "Спри пред тротоара и пропусни пешеходеца",
      // THE чл. 25, ал. 2 CONTRACT, made graded. Pinned on the exit lane and
      // capped at 5 km/h: satisfiable ONLY by a car that actually came to rest
      // short of the pavement. The walk-through demo passes this x at 25 km/h
      // and misses it outright — and objectives advance sequentially, so its
      // run stops here.
      //
      // SWEEP 161 — «СПРИ ПРЕД ТРОТОАРА» WAS EARNABLE FROM ON TOP OF IT, and
      // that is the audit's own row: mobile-right ticks «✓ Спри пред тротоара и
      // пропусни пешеходеца 0:16» on the SAME sheet that convicts
      // «Непропускане на пешеходец −10 изпитни т. ОПАСНА ГРЕШКА» and logs a
      // near miss «пешеходец — на 0.0 м 0:06» (.audit-frames/sweep161/
      // sc-merge-from-property/mobile-right/run.log). Two channels, opposite
      // verdicts, one act — and the route task is the one the student reads.
      //
      // THE ARITHMETIC, because "3.5 m before the band" (what this comment used
      // to say) measured to the band's CENTRE and the pavement is 6 m deep:
      // `mgp-x-walk` sits at x = 34 and the тротоар is painted
      // ZEBRA_LENGTH_M = 6.0 m along the road axis (world/builders/constants
      // .ts), so the band runs x ∈ [31, 37] and its NEAR edge — the one
      // instruction 2 means by «спри ПРЕД тротоара, не върху него» — is x = 37.
      // The bare disc reaches:
      //
      //     authored radius 3  →  x ≥ 34.5   (2.5 m INSIDE the band)
      //     L2 ladder    3.75  →  x ≥ 33.75
      //     L1 ladder    4.25  →  x ≥ 33.25  (3.75 m in — at the far kerb)
      //
      // …so a car that crept onto the pavement and stopped there was told it
      // had stopped in front of it, and a car that drove THROUGH the walker and
      // then crawled to a halt collected the same tick (`reached` latches on
      // the swept disc and `capMet` can be earned on any later frame inside it).
      //
      // acceptBeforeMarkM ENDS THE ACCEPTANCE AT THE PAINT, exactly as
      // `sc-mfp-stop-line` below already does at its Б2: signed −(37.5 − 37.0),
      // i.e. the mark stands 0.5 m in front of the band's near edge and credit
      // stops there. The ladder carries the flag through untouched (params.ts),
      // so the pavement is outside the acceptance at EVERY rung — L1 included,
      // which is the rung the audit photographed and the rung a 17-year-old
      // starts on.
      //
      // AND IT REFUSES NOBODY WHO DRIVES IT RIGHT — measured on the committed
      // recording rather than argued: `shadow-correct.trace.json` decelerates
      // 40.51 → 37.54 and comes to REST at x = 37.54, which is 0.54 m on the
      // approach side of the new boundary; it first crosses the 5 km/h cap at
      // x = 37.70, also inside. Both the halt-grace capsule and the plain disc
      // still credit it. A boundary any tighter than the paint (e.g. one that
      // demanded the car's NOSE clear of the band, x ≥ 39.05) would fail the
      // very drive the lesson tells the student to copy — that was measured
      // too, and is why the cut is at the paint and not at the bumper.
      //
      // WHAT THAT SENTENCE COSTS, RECORDED SO THE ROW IS NOT RETIRED ON IT
      // (verifier, 2026-08-24). This gate reads the vehicle CENTRE — the
      // chassis half-length is 2.02 m (collision/bodies.ts PLAYER_HALF_LENGTH_M;
      // rules/types.ts calls the overhang «≈2.15 m» at stopOvershootCenterM), so
      // a boundary at centre x = 37.0 admits a BONNET 2 m onto the тротоар. The
      // shadow is exactly that car: resting centre x 37.54 ⇒ nose x ≈ 35.5,
      // 1.5 m over the band the title says to stop in FRONT of. So the frame
      // this row was filed from — pc-right/05-stopped.png, walker on the paint,
      // ✅ in the corner — is a pose this fix still credits; what it now refuses
      // is the mobile sheet's tick, the one earned AFTER driving through the
      // walker. Half the row, and the honest half to claim.
      //
      // THE LEVER IS IN THIS FILE; THE BLOCKER IS NOT. `acceptBeforeMarkM:
      // +1.55` (= −(37.5 − 39.05)) is the bumper-true boundary and parses fine —
      // it fails only because `shadow-correct.trace.json` halts where it halts,
      // and fitting the rule to the recording is backwards. The order is:
      // re-record the shadow to stop at centre ≥ 39.05 (nose clear of x = 37),
      // re-check `mistake-signal-and-go` (same halt, x 37.54), THEN move this
      // number and the ladder rows in merging-compiled-gate-truth.test.ts.
      // Until that happens the assertion «the taught halt at x 37.54 is still
      // credited» is pinning a pose instruction 2 forbids.
      //
      // AND THE TWO-CHANNEL CONTRADICTION IS NARROWED, NOT REMOVED. This gate
      // has no pedestrian channel at all — it certifies POSITION and SPEED, and
      // its title promises «…И ПРОПУСНИ ПЕШЕХОДЕЦА», which it cannot measure
      // (doc 86 D3). Driven through parseObjectiveParams/stepObjective at L1,
      // L3 and L5: halt at x 41.5 / 40 / 38.5 / 37.54, stand two seconds, then
      // drive straight over the band at 20 км/ч — the tick is earned at the
      // halt and SURVIVES the crossing, at every rung. So the sheet can still
      // print «✓ Спри пред тротоара и пропусни пешеходеца» beside «✗
      // Непропускане на пешеходец»; what this fix removes is only the case
      // where the tick is earned FROM ON the pavement or after it. Closing the
      // rest means either a `stagedEventId`-style outcome arm on reachZone (the
      // same missing lever MGB_BUS names) or a title this gate can keep.
      params: {
        kind: "reachZone",
        x: 37.5,
        y: MFP_Y_EXIT,
        radiusM: 3,
        maxSpeedKmh: 5,
        acceptBeforeMarkM: -0.5,
      },
    },
    {
      id: "sc-mfp-stop-line",
      titleBg: "Спри напълно на Б2 на изхода",
      // The second duty, on the derived line's own metre: radius 3 at 3 km/h
      // is a real halt, not a roll. Both the shadow AND the „с мигача“ demo
      // clear it — which is the point of that card: everything up to here was
      // right.
      // FR-24: „on the derived line's own metre" held at the authored radius,
      // but the L1 ladder widens 3 → 4.25, so the disc admitted a pose 2.98 m
      // past the Б2 the title says to stop AT. The cut ends it at the paint.
      params: {
        kind: "reachZone",
        x: 29,
        y: MFP_Y_EXIT,
        radiusM: 3,
        maxSpeedKmh: 3,
        acceptBeforeMarkM: -1.275,
      },
    },
    {
      id: "sc-mfp-merged",
      titleBg: "Влей се в лентата на булеварда",
      // Radius 4 < half the 8.125 m lane pitch, pinned 40 m up the northbound
      // lane: satisfiable only from the correct bank, and only by a car that
      // actually joined rather than nosed out and stopped.
      params: { kind: "reachZone", x: MFP_X_LANE, y: 40, radiusM: 4 },
    },
    {
      id: "sc-mfp-finish",
      titleBg: "Продължи по булеварда до края на отсечката",
      params: { kind: "reachZone", x: MFP_X_LANE, y: 118, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mfp-glance-walk", titleBg: "Оглед по тротоара — преди да го пресечеш" },
        { id: "sc-mfp-glance-flow", titleBg: "Оглед наляво по булеварда — от линията, преди да тръгнеш" },
      ],
    },
    parTimeSec: 60,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeFromProperty.ts; gates in traces/__tests__/
  // sc-merge-from-property-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-from-property/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-from-property/mistake-walk-through.trace.json" },
      titleBg: "Изнасяне през тротоара без спиране",
      whatWentWrongBg:
        "Колата излезе от бензиностанцията, без да спре нито веднъж — погледът беше вече на булеварда, търсеше пролука. А между двора и булеварда има тротоар, и по него вървеше човек. Точно това е капанът: докато търсиш предимството, което ти трябва, пропускаш задължението, което имаш. Тротоарът не е част от изхода ти — той е пътят на пешеходеца и ти го ПРЕСИЧАШ. Излизането от имот е маневра (чл. 25): в нея ти се съобразяваш с всички — пешеходци, колоездачи, коли — и никой не се съобразява с теб. Скоростта тук дори не беше висока; вината не е в километрите, а в това, че решението „ще мина“ беше взето, преди да е погледнато.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-from-property/mistake-signal-and-go.trace.json" },
      titleBg: "Вливане „с мигача“ пред потока",
      whatWentWrongBg:
        "Всичко до знака беше учебникарско: бавно потегляне, спиране пред тротоара, изчакан пешеходец, пълно спиране на Б2. И после — мигач и газ, в същата секунда. По булеварда обаче идваха коли и те трябваше да се съобразят с човек, който излиза от двор. Мигачът е ОБЯВЯВАНЕ на намерение, а не предимство: той казва „ще завия“, не „пуснете ме“ (чл. 25). Пролуката, от която имаш нужда, не е между колите — тя е зад последната. Разликата с правилното каране е едно решение и няколко секунди; разликата в последствията е между скучно излизане и кола, набила спирачки в дясната лента заради теб.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изход от бензиностанция, паркинг, двор, гараж или магазин — тоест по няколко пъти на всяко пътуване. Същото правило важи и когато излизаш от паркомясто напряко през тротоара, и когато потегляш от банкета: щом идваш отнякъде, което не е път, ти влизаш в чуждото движение, а не то в твоето.",
    whyBg:
      "Изходът от имот е мястото, където водачът е най-силно изкушен да смята, че вече кара — а всъщност още не е. Затова законът е безкомпромисен и подреден: пропускаш пешеходците и колоездачите по тротоара и велоалеята, после пропускаш движещите се по платното, и чак тогава си участник в движението. Двете типични грешки тук са огледални и еднакво човешки: единият гледа наляво за пролука и минава през тротоара, без изобщо да го е видял — защото очите му вече са на булеварда; другият прави всичко правилно, спира на знака, светва мигач и тръгва, защото „нали показах“. Мигачът обаче не е разрешение. Той обявява какво ще направиш; дали МОЖЕШ да го направиш, решава потокът. И двете грешки идват от една и съща сметка — че секундите на изхода се печелят. Не се печелят: тротоарът се пресича за две секунди, а пролуката зад колоната идва след пет.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа реда, а не бързината: спираш ли пред тротоара (а не върху него), оглеждаш ли пешеходната зона в двете посоки, изчакваш ли пълното ѝ освобождаване, спираш ли напълно на Б2, и влизаш ли в пролука, която е СВОБОДНА, а не в такава, която си взел. Непропускането на пешеходец при излизане от имот и непропускането на движещите се по пътя са отсъждани грешки; ако принудиш някого по булеварда да спира рязко или да отбива — опасна. Изпълзяването на изхода без спиране е класиката, която проваля кандидати още в първата минута.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: „пролуката струва цяла минута търпение" — a SECOND column arriving
    // behind the first, so the road is never briefly-empty and the only way
    // out is to actually wait for a gap rather than take the first hole.
    // Authored as its own stream (LevelSpec.stagedAdd ADDS specs; it cannot
    // re-tune the base one), held further back and released by the same
    // roll-off, so the two columns arrive as a train.
    {
      level: 5,
      stagedAdd: [
        {
          ...MFP_STREAM,
          id: "sc-mfp-stream-2",
          actor: { ...MFP_STREAM.actor, hold: { nodeIndex: 0, offsetM: 0 }, colorIndex: 0 },
          count: 3,
          gapsM: [110, 136], // …the next column, ~7 s of boulevard behind the first
        } satisfies OncomingStreamSpec,
      ],
    },
  ],
  staged: [MFP_WALKER, MFP_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The merging-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_MERGING: readonly ScenarioSpec[] = [
  SC_MERGE_ACCEL_LANE,
  SC_MERGE_LANE_END,
  SC_MERGE_ROADWORKS_SHIFT,
  SC_MERGE_BUS_PULLOUT,
  SC_MERGE_FROM_PROPERTY,
];
