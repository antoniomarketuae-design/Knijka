/**
 * Scenario templates — the COCKPIT-PROCEDURE family (doc 72 §3 „Family VP —
 * Vehicle procedure & cockpit discipline"): ONE ✅ FULL readiness template that
 * rides the recorder's cockpit-state channels (headlights/seatbelt/handbrake —
 * committed de3c33a), DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district file so nothing loads world JSON at
 * runtime; the trace-gate battery asserts every pinned value against the map):
 *
 *  - sc-vp-readiness  „Готовност преди тръгване"  (VP-02 belt + VP-05 handbrake,
 *                     vp-ready-v1)
 *
 * ONE template, TWO DISTINCT codes (the sc-ov-lane-keeping precedent): the
 * shadow buckles up, releases the handbrake and drives clean; each mistake demo
 * flips ONE cockpit channel and cites a SHIPPED rules-catalog code, grading
 * EXACTLY it with NO extras when replayed through the production stack (the
 * §5/§9 gates, traces/__tests__/vp-readiness-traces.test.ts):
 *   - VP-02 → SEATBELT_OFF_WHILE_MOVING (основна: движение без колан — the belt
 *     detector, 1 s sustain while moving);
 *   - VP-05 → HANDBRAKE_LEFT_ON (второстепенна: движение с вдигната ръчна — the
 *     handbrake detector, 1.5 s sustain while moving).
 *
 * The map carries NO crossing, junction, signal or sign, ambient traffic is
 * ZERO (seed 7), the drives stay under the limit and centered in the lane and
 * the day is dry (lights off is lawful) — so the ONLY thing the rule engine can
 * grade is the flipped cockpit channel. The shadow earns the positive
 * CLEAN_DRIVING (a sustained violation-free streak).
 *
 * Family: "cockpit" — the catalog chip added for the VP family (types.ts +
 * ScenarioCatalog FAMILY_ICONS "🧰"); the id (sc-vp-readiness) matches the
 * sc-<topic>-<slug> naming standard and ID_RE.
 *
 * Doc-72 provenance: VP-02 and VP-05 are the "Engine: ✅ FULL" cockpit
 * archetypes gradable from the shipped belt/handbrake detectors. VP-01
 * (pre-drive ritual) already ships as the preDriveMode machine; VP-03/04/06/…
 * need a gear/stall/telltale channel or an actor and are 🟡 PARTIAL or 🔴 NEW —
 * left for later waves.
 */

import type { PoliceStopSpec, TelltaleStimulusSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night, l5Wet } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated district by value — the
// L7 pattern; the ac-vp-districts battery asserts the copy matches the map)
// ---------------------------------------------------------------------------

/** Right-lane center of vp-ready-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// sc-vp-readiness — „Готовност преди тръгване" (VP-02 + VP-05) on vp-ready-v1
//    (360 m straight street, limit 50, dry day)
// ---------------------------------------------------------------------------

/** VP-02 / VP-05 — готовност на кокпита преди потегляне: колан поставен (ЗДвП
 *  чл. 137а) и ръчна спирачка свалена (ЗДвП чл. 20 — контрол над ППС). */
export const SC_VP_READINESS: ScenarioSpec = {
  id: "sc-vp-readiness",
  family: "cockpit",
  tagsBg: ["кокпит", "готовност преди тръгване", "предпазен колан", "ръчна спирачка"],
  titleBg: "Готовност преди тръгване",
  objectiveBg:
    "Приготви кокпита и потегли правилно: закопчан колан и свалена ръчна спирачка — двете действия, които всеки водач прави, преди колелата да се завъртят, и които изпитващият проверява първи.",
  archetypeIds: ["VP-02", "VP-05"],
  conceptIds: ["c-pre-drive-check", "c-seatbelts", "c-vehicle-controls"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vp-ready-v1.json meta.scenario.params
    // (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "vp-ready-v1",
  },
  start: {
    spawnPointId: "vp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Преди да потеглиш: закопчай предпазния колан — винаги, дори за 100 метра." },
    { n: 2, textBg: "Свали ръчната спирачка докрай — освобождаването ѝ е част от процедурата за потегляне." },
    { n: 3, textBg: "Потегли плавно по правата улица и дръж спокойна скорост под 50 км/ч." },
    { n: 4, textBg: "Ако усетиш, че колата тегли или дърпа встрани — спри и провери ръчната, не давай повече газ." },
    { n: 5, textBg: "Продължи с поставен колан и свалена ръчна до края на отсечката." },
  ],
  success: [
    {
      id: "sc-vpr-ready",
      titleBg: "Мини контролната зона с готов кокпит",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vpr-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpReadiness.ts; gates in traces/__tests__/vp-readiness-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-readiness/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-readiness/mistake-no-belt.trace.json" },
      titleBg: "Тръгване без колан",
      whatWentWrongBg:
        "Колата потегли с откопчан колан — „нали е близо“. Движението без предпазен колан е основна грешка (чл. 137а): при удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж. Коланът се закопчава преди потеглянето, всеки път.",
      codeRefs: ["SEATBELT_OFF_WHILE_MOVING"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-readiness/mistake-handbrake.trace.json" },
      titleBg: "Тръгване с вдигната ръчна",
      whatWentWrongBg:
        "Колата потегли, без да е свалена ръчната спирачка — влачи се, спирачките прегряват, а на таблото свети предупредителна лампа. Освобождаването на ръчната е част от процедурата за потегляне; усетиш ли съпротивление, спри и провери, вместо да натискаш газта.",
      codeRefs: ["HANDBRAKE_LEFT_ON"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, преди да потеглиш — от паркинга, от банкета, на изпита. Готовността на кокпита е последното нещо преди движението: колан поставен, ръчна свалена, предавка избрана. Две секунди сега спестяват точки и рискове после.",
    whyBg:
      "Коланът и свалената ръчна не са формалност: коланът задържа тялото при удар (чл. 137а), а свалената ръчна пази спирачките от прегряване и колата от влачене. Пропускането им са двете най-чести кокпит грешки на изпита — и двете напълно избежими с един и същ навик преди потеглянето.",
    lawRef: "ЗДвП чл. 137а",
    examinerBg:
      "Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала: закопчан колан и свалена ръчна спирачка. Движението без колан е основна грешка, а потеглянето с вдигната ръчна — второстепенна; и двете се броят, ако колата тръгне без тях.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-move-off — „Потегляне от място без оглеждане" (doc 72 PK-05) on
//    vp-ready-v1 (map REUSED; the config-gated move-off-observation drill)
// ---------------------------------------------------------------------------

/** PK-05 — потегляне от място с оглеждане (ЗДвП чл. 25: преди навлизане в
 *  движението и всяка маневра водачът се убеждава, че няма да създаде опасност
 *  и няма да попречи на другите — огледало + поглед през рамо преди тръгване).
 *  Config-gated: the move-off-observation detector ships OFF and this
 *  drill opts it IN (ruleConfig below → the LIVE session grades the student too;
 *  the recorder passes the same override for the §9 code assert).
 *
 *  SWEEP 161 — TWO THINGS THE BRIEFING SAID THAT THE WINDSCREEN DID NOT.
 *  Frame sweep161/sc-pk-move-off/mobile-right/01-arrival.png, and both are
 *  fixed below (the gate is __tests__/cockpit-sweep161-truth.test.ts).
 *
 *  1. „КОЛАТА Е СПРЯЛА НА БАНКЕТА" — SHE IS NOT. The start resolves to
 *     `vp-spawn-approach`, and vp-ready-v1 puts that point at x = 4.06, which
 *     IS `meta.scenario.laneCenterRightM` to the centimetre: the car spawns on
 *     the running-lane centre line, 4.06 m short of the kerb of an 8.125 m
 *     lane, and the frame shows it between the two guide ribbons. The district
 *     owns exactly two spawn points (vp-spawn-approach, vp-spawn-finish) and
 *     both are that same lane centre, so there is no kerbside pose to move to
 *     from here; the three committed traces all open at x = 4.06 as well, so a
 *     hand-authored curb pose would leave the shadow car parked 4 m away from
 *     the student at t = 0. THE COPY IS THEREFORE THE THING THAT WAS WRONG, and
 *     nothing is lost by fixing it: the detector (rules/engine.ts §1b) grades
 *     the session's FIRST move-off from rest whatever the car was resting
 *     against — its own comment says „curb exits are indistinguishable from
 *     queue move-offs with current telemetry". `teach.*` keeps „от банкета"
 *     because that is a sentence about the RULE and true on every map (the
 *     sp-world-claims precedent), and so does the mistake-demo title „Поглед
 *     само към бордюра" — a kerb the car is NEAR is not a kerb it is parked on.
 *     A kerbside START would need, in files this template does not own: a third
 *     spawn point in the district (tools/maps/gen_ac_vp_streets.mjs +
 *     content/world/vp-ready-v1.json) and all three traces re-recorded
 *     (traces/scPkMoveOff.ts, RECORD_TRACES=1).
 *  2. THE BELT WAS LIT AND UNMENTIONED. The red «КОЛАН» badge is on the arrival
 *     frame because LessonScene hands every „ready" spawn a car with the belt
 *     undone on purpose (the founder's „the seatbelt is the only item left"
 *     ruling, 265629d) — and `SEATBELT_OFF_WHILE_MOVING` is an ungated основна
 *     that fires after 1 s of motion (rules/engine.ts, cfg.seatbeltSustainSec).
 *     So a student who obeyed this briefing to the letter — mirror, shoulder,
 *     signal, go — collected a 3-point основна the briefing never warned about.
 *     Instruction 1 now names it, which is also the order the real procedure
 *     runs in. THE CAUSE IS WIDER THAN THIS FILE: every scenario spawns the
 *     same way, and only sc-vp-readiness (whose subject IS the belt) said so.
 */
export const SC_PK_MOVE_OFF: ScenarioSpec = {
  id: "sc-pk-move-off",
  family: "cockpit",
  tagsBg: ["потегляне от място", "оглеждане", "огледала", "мъртва зона", "изпитни упражнения"],
  titleBg: "Потегляне от място с оглеждане",
  objectiveBg:
    "Потегли от място правилно: преди да тръгнеш, погледни в огледалото и през лявото рамо в мъртвата зона — потеглянето от място е маневра и започва с оглеждане, не с газта.",
  // Doc-72 provenance: PK-05 IS this moment (move-off without observation —
  // DVSA move-off top-5; the BG изпит starts with потегляне от място).
  archetypeIds: ["PK-05"],
  conceptIds: ["c-mirrors-blind-spots", "c-maneuver-principles", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-vp-readiness — mirrored in vp-ready-v1.json
    // meta.scenario.params (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "vp-ready-v1",
  },
  start: {
    spawnPointId: "vp-spawn-approach",
    vehicleStart: "ready",
  },
  // Still FIVE steps and every one still inside the 95-character band the
  // compact card was sized for (briefing-card-budget.test.ts): the belt takes
  // the slot freed by folding „потегли" and „продължи" into one closing step,
  // because a sixth step is body text a phone pushes under the fold.
  instructionsBg: [
    { n: 1, textBg: "Закопчай колана — таблото свети „КОЛАН“, докато не го направиш." },
    { n: 2, textBg: "Колата е спряла в дясната лента. Потеглянето от място е маневра — започва с оглеждане." },
    { n: 3, textBg: "Погледни в лявото огледало и прецени идва ли кола или колоездач отзад." },
    // The shoulder check STAYS, and stays unfaked: `MirrorGlanceKind` is
    // „left" | „right" | „rear" and there is no blind-spot station to tap
    // (scene/cabin.ts; the ruling and its gate are in
    // components/sim/__tests__/touchFlankNaming.test.tsx §4). The procedure a
    // driver must own is mirror AND shoulder; shrinking the briefing to the
    // half the cockpit can measure would teach the wrong habit for good.
    { n: 4, textBg: "Хвърли поглед и през ЛЯВОТО рамо — в мъртвата зона, която огледалото не показва." },
    { n: 5, textBg: "Чак когато е чисто: мигач при нужда, потегли плавно и карай центрирано под ограничението." },
  ],
  success: [
    {
      /**
       * THE CHIP THAT CERTIFIED A LANE IT COULD NOT SEE AND A SPEED IT NEVER
       * READ — sweep161, `sc-pk-move-off/pc-wrong/04-t012s.png`
       * (sc-pk-move-off:d7d45a4c).
       *
       * ONE FRAME CARRIES BOTH HALVES. At 0:12 the cluster reads **59 км/ч**,
       * a «Превишена скорост» teach card is open on the right — „Движеше се
       * над разрешената скорост… ЗДвП чл. 21, ал. 1" — and the task chip
       * «Потегли и се нареди в дясната лента» is already GREEN. The product
       * convicts the speed and certifies the manoeuvre on the same screen, in
       * the same second, to the same seventeen-year-old.
       *
       * WHY IT WAS GREEN. The params were `{x: 4.06, y: 150, radiusM: 14}` — a
       * place and nothing else, widened by the L1 ladder to **19 m**. Two
       * separate lies follow from that one line:
       *
       *  · «в дясната лента» — vp-ready-v1 is a 1+1 street on an 8.125 m lane
       *    pitch, so the OPPOSING lane centre is 8.12 m from this mark. A 19 m
       *    disc swallows both lanes, both verges and the pavement: a car
       *    completing the whole exercise on the wrong side of the road
       *    collected a written certificate that it had settled into the right
       *    one. The banner named a lane the gate could not distinguish.
       *  · «карай центрирано ПОД ОГРАНИЧЕНИЕТО» (instruction 5) — no cap at
       *    all. The sibling on this very map authors one (`sc-vpr-ready`
       *    maxSpeedKmh 55); this one authored none, which is why the r06
       *    controlled experiment is decisive: sc-vp-readiness and
       *    sc-pk-move-off share vp-ready-v1, BOTH wrong lanes ran 59 км/ч, and
       *    readiness REFUSED while move-off TICKED. Same map, same speed,
       *    opposite verdicts — the difference is the authored key, and it is
       *    authored here.
       *
       * THE RADIUS IS 4, AND 4 IS DERIVED, not chosen for feeling. The ladder
       * widens by `min(0.5·r, REACH_ZONE_GRACE_M, chainCap)` (scenario/
       * params.ts widenRadius), so 4 compiles to 6 at L1 and 4 at L3–L5, and
       * `stepReachZone`'s approach capsule bounds LATERAL deviation by the same
       * radius. Read against the 8.125 m lane that means, at EVERY rung: the
       * whole of the correct lane is accepted (kerb-side x = 8.06 is 4.0 out,
       * inside even the unaided ring) and the opposing lane centre at 8.12 m is
       * refused. The claim becomes checkable without refusing one honest line
       * through the student's own lane — which is why this is not simply „make
       * it smaller".
       *
       * THE CAP IS THE SIGN, NOT A NEW NUMBER (ADR-002 — nothing here recalls a
       * limit). vp-ready-v1 posts 50 and `map.params.maxspeedKmh` is 50, so
       * `widenSpeedCap` compiles 50 at every rung: authored == posted leaves
       * zero headroom for the grace to spend, which is exactly the B58 shape
       * that file refuses to inflate. The authored cap is the WHOLE of the
       * speed discipline this gate measures.
       *
       * `requireLawfulSpeed` IS NOT ENFORCED HERE — a hole, stated, not a
       * tidy-up (wave 8). This objective carried `requireLawfulSpeed: true`
       * beside the cap. It was meant to say „and also read `SimTick.maxSpeedKmh`
       * — the limit the runtime resolves off the road itself — so if this drill
       * is ever re-mapped the banner still cannot certify an overspeed." It
       * could not compile, and it could not have worked, on two independent
       * counts:
       *
       *  · `ReachZoneParams` (lessons/types.ts) declares no such field, so the
       *    literal was a TS2353 excess property. The arm lives on
       *    `ReachZoneWitnessDemands` (objectives.ts) — a widening interface the
       *    AUTHORING type is not, by that interface's own docblock.
       *  · even declared, `serializeObjectiveParams` (scenario/params.ts) emits
       *    only maxSpeedKmh / acceptBeforeMarkM / requireNoContact /
       *    requireRailClear for a reachZone, so the key would be dropped on the
       *    way to the compiled `LessonObjective` and `parseObjectiveParams`
       *    would never see it. The only live route into that arm from a
       *    scenario template today is `deriveLawfulSpeedDemand(titleBg)`.
       *
       * DELETED RATHER THAN CAST THROUGH, because a cast ships exactly the
       * `sc-swp-finish` shape this docblock convicts — a banner certifying a
       * discipline no evaluator measures. WHAT THE DELETION DOES NOT COST: this
       * drill is fixed to vp-ready-v1 at 50, so cap and sign are the same
       * number and the sweep161 frame (59 км/ч, green chip) is refused either
       * way. WHAT IT COSTS: the re-map guard. Move `map.districtId` to a road
       * posted below 50 and the authored cap goes stale at 50 while the sign
       * says less. ROUTED, NOT claimed closed — the two edits that would let
       * this gate say it are `requireLawfulSpeed?: true;` on `ReachZoneParams`
       * (lessons/types.ts) and one carry line in the reachZone case of
       * `serializeObjectiveParams` (scenario/params.ts); both are other lanes'
       * files.
       *
       * AND THE TITLE MAKES NO SPEED CLAIM — checked before deleting, because a
       * deletion must not quietly re-create the defect above. «Потегли и се
       * нареди в дясната лента» names a manoeuvre and a LANE; the lane is what
       * radiusM 4 measures. It carries none of the three phrasings
       * `deriveLawfulSpeedDemand` reads (/разрешена(та) скорост/, /без
       * превишение/, /таван/), so nothing is derived either. The speed promise
       * on this drill is instruction 5's «под ограничението», and the cap is
       * what keeps it.
       *
       * IT CANNOT REFUSE A DRIVE THE SHEET WOULD PASS. `stepReachZone` grades
       * `speedKmh > cap + REACH_ZONE_CAP_SLACK_KMH` (5), and 5 IS the rule
       * engine's own `speedingGraceMaxKmh` — so the population this chip now
       * withholds from is a SUBSET of the population already holding the
       * «Превишена скорост» card with its чл. 21 citation and its corrective.
       * THEO-4 is satisfied the way `requireYieldClean` and `requireHaltForVru`
       * satisfy it: the withheld tick REMOVES a contradiction from a protocol
       * that already explains itself; it does not add a silent verdict. The
       * frame above is the proof — the explanation was already on screen.
       *
       * MEASURED AGAINST ALL THREE COMMITTED RECORDINGS before landing
       * (content/traces/sc-pk-move-off/*): shadow-correct, mistake-no-look and
       * mistake-curb-glance every one passes within 0.10 m of this mark at
       * 39.9 км/ч with 0.00 m of lateral deviation, so the §5 zero-violation
       * replay and both §9 code asserts are untouched — the mistake demos still
       * fail on MOVE_OFF_WITHOUT_OBSERVATION, which is the fault they exist to
       * show, and not on a geometry technicality.
       *
       * WHAT IS STILL NOT MEASURED BY THIS CHIP, stated so nobody reads it as
       * more than it is: the OBSERVATION. Mirror and shoulder are graded — this
       * template arms `moveOffObservationEnabled` below and
       * MOVE_OFF_WITHOUT_OBSERVATION bills the fault live — but they are graded
       * by the RULE ENGINE, not by this gate, because `ReachZoneParams` has no
       * glance term. A `requireObservedBefore`-style demand in the
       * `requireLamps`/`requireCockpitReady` mould is the honest home for it.
       * Routed, and NOT claimed closed here.
       */
      id: "sc-pmo-moved",
      titleBg: "Потегли и се нареди в дясната лента",
      params: {
        kind: "reachZone",
        x: LANE_X,
        y: 150,
        radiusM: 4,
        maxSpeedKmh: 50,
      },
    },
    {
      id: "sc-pmo-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 310, radiusM: 14 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkMoveOff.ts; the §5 gate (shadow replays ZERO violations +
  // CLEAN_DRIVING) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-pk-move-off-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-move-off/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-move-off/mistake-no-look.trace.json" },
      titleBg: "Потегляне без оглеждане",
      whatWentWrongBg:
        "Колата потегли от място, без нито едно оглеждане — „нали ще тръгна бавно“. Потеглянето от място е маневра (чл. 25): приближаващият отзад-отляво остана невидим до последно. Едно огледало и поглед през рамо преди тръгване спестяват челен удар отстрани.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-move-off/mistake-curb-glance.trace.json" },
      titleBg: "Поглед само към бордюра",
      whatWentWrongBg:
        "Колата погледна само надясно, към тротоара, и потегли — но опасността при потегляне идва отзад и отляво, от движението. Оглеждането за потегляне е към огледалото и през ЛЯВОТО рамо; погледът към бордюра не замества мъртвата зона отляво.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато потегляш от място — от банкета, от паркинг, след спиране на пътник. Изпитът в града често започва точно с този момент: потегляне от място. Две секунди оглеждане преди газта решават всичко.",
    whyBg:
      "Потеглянето от място без оглеждане е сред най-честите причини за странични удари и за помитане на колоездач в мъртвата зона. Огледалото показва по-голямата част, но не и мъртвата зона зад лявото рамо — затова се гледа и през рамо, преди колелата да се завъртят.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият следи точно за това при потегляне от място: поглед в огледалото и през рамо в мъртвата зона, преди колата да тръгне. Потегляне без оглеждане е основна грешка — маневра без убеждаване, че е безопасно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  // Config-gated drill: opt the move-off-observation detector IN so the LIVE
  // student session grades the taught fault (default-OFF elsewhere — see
  // rules/types.ts moveOffObservationEnabled). compileScenario propagates this
  // to the LessonSpec; the recorder passes the same override for the §9 assert.
  ruleConfig: { moveOffObservationEnabled: true },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vp-stall — „Загасване при потегляне" (doc 72 VP-04) on vp-ready-v1
//    (map REUSED; rides the recorder's stall channel — {kind:"stall"})
// ---------------------------------------------------------------------------

/** VP-04 — загасване на двигателя при потегляне (Наредба № 38: всяко загасване
 *  е официална второстепенна грешка; повтарянето трупа точки). The classic
 *  learner stall: clutch released too fast at move-off. Rides the recorder's
 *  stall channel (the VP-04 capability unlock): the driveline's LATCHED
 *  stalled flag reaches the rule engine, which grades each RISING EDGE as one
 *  ENGINE_STALLED — the restart re-arms the episode, so the repeat demo grades
 *  it twice. The shipped detector is default-ON (no ruleConfig needed): the
 *  LIVE student session grades the same fault — ON THE TIER THAT HAS A CLUTCH.
 *
 *  SWEEP 161 — THE CLUTCH LESSON THAT WAS BEING TAUGHT TO AN AUTOMATIC.
 *  Frame sweep161/sc-vp-stall/pc-right/04-t012s.png: the cluster reads „D", the
 *  key card offers gears only as „към P / към D", and the cabin strip runs
 *  ДВИГАТЕЛ · КОЛАН · СВЕТЛИНИ · МЪГЛА · ЧИСТАЧКИ · РЪЧНА · АВАР. with no
 *  «СЪЕД» in it — while instructions 1–4 commanded a clutch, first gear and a
 *  bite point. Every one of those four steps was unperformable.
 *
 *  IT IS ONE MEASUREMENT, TAKEN TWICE. `transmissionModeFor` (vehicle/
 *  driveline.ts) returns „manual" for exactly one DifficultyMode — „advanced" —
 *  and `DEFAULT_DIFFICULTY` is „normal"; and the stall itself is guarded by
 *  `this.transmission === "manual"` in `Driveline.update`. So on the tier a
 *  student arrives on, the car has no clutch AND CANNOT STALL: the fault this
 *  lesson exists to teach could not be committed, could not be avoided, and
 *  could not be graded. That is the exact defect DEFAULT_DIFFICULTY's own
 *  founder-ruling comment names — „the student physically could not make the
 *  mistake the lesson exists to catch — an unfailable trap, not teaching".
 *
 *  WHY THE FIX IS A SENTENCE AND NOT A FIELD. A ScenarioSpec cannot pick the
 *  tier: difficulty is a per-student setting held in LessonScene state and
 *  persisted to localStorage (vehicle/difficulty.ts DIFFICULTY_STORAGE_KEY),
 *  and no channel carries it from a template. So instruction 1 now sends the
 *  student to the selector — which is on screen on both platforms (the НАЧ /
 *  НОРМ / НАПР cell, TouchControls `tierCellTextBg`) and works mid-drive: the
 *  switch puts a standing car in N (`switchTransmission`), which is precisely
 *  where „съединител + първа предавка" begins. THE DEEPER FIX IS A LESSON-LEVEL
 *  TRANSMISSION CHANNEL and it belongs in files this template does not own
 *  (contracts.ts LessonSpec, compile.ts, LessonScene.tsx, vehicle/driveline.ts)
 *  — until it ships, a briefing that names the clutch must name the tier, and
 *  __tests__/cockpit-sweep161-truth.test.ts §2 is the gate that says so.
 *
 *  The DEMOS are unaffected and stay manual: a trace carries its own stall
 *  channel ({kind:"stall"}) and replays identically on any tier. */
export const SC_VP_STALL: ScenarioSpec = {
  id: "sc-vp-stall",
  family: "cockpit",
  tagsBg: ["кокпит", "потегляне", "загасване", "съединител", "изпитни упражнения"],
  titleBg: "Загасване при потегляне",
  objectiveBg:
    "Урокът върви на ниво „Напреднал“ — колата тук е с ръчни скорости и съединител. Потегли от място, без двигателят да загасне: съединител докрай, лек газ и плавно отпускане до точката на зацепване — загасването е класическата грешка от изпитни нерви и всяко се брои.",
  archetypeIds: ["VP-04"],
  conceptIds: ["c-vehicle-controls", "c-pre-drive-check"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-vp-readiness — mirrored in vp-ready-v1.json
    // meta.scenario.params (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "vp-ready-v1",
  },
  start: {
    spawnPointId: "vp-spawn-approach",
    vehicleStart: "ready",
    // ROUND 11, 2026-08-25 — THE TIER IS THE LESSON'S, NOT THE STUDENT'S.
    // Round 10 (below) turned the tier into instruction 1's act and measured
    // the result on the next sweep: gear D on all 80 sampled frames of
    // pc-right, pc-wrong and mobile-right, i.e. the clutch drill ran its whole
    // life on an automatic. The line was not weak — the ASK was wrong. The
    // tier is not this lesson's subject; the bite point is. So the lesson now
    // states which car it hands over, the way `vehicleStart` above already
    // does, and instruction 1 goes back to being one act (the belt) plus the
    // fact the student needs to read the cockpit («ръчни скорости и
    // съединител»). `openingTier` seeds the picker — it does not pin it.
    openingTier: "advanced",
  },
  // Step 1 is the belt and the tier: without the tier, steps 2–4 name controls
  // the car does not have (see the header); without the belt, the pull-away
  // procedure this drill enumerates is missing its own first step and the
  // ungated основна `SEATBELT_OFF_WHILE_MOVING` bills a student who followed it
  // (the sc-vp-readiness precedent — its instruction 1 has always said so).
  // The five steps stay five and stay inside the 95-character band
  // (briefing-card-budget.test.ts) — the old step 4 was 98.
  //
  // ROUND 10, 2026-08-24 — «УРОКЪТ ИСКА» IS NOT AN INSTRUCTION.
  // `w10-3/frames/sc-vp-stall/pc-right/01-arrival.png`, read at the pixels:
  // the tier strip IS on the glass at the top right («Начинаещ · НОРМАЛЕН ·
  // Напреднал», Нормален underlined) and step 1 was on the glass beside it —
  // and the drive still ran the whole lesson in D. Gear reads D on every
  // sampled frame of all three legs.
  //
  // The sentence stated a PREFERENCE OF THE LESSON'S („урокът иска") next to a
  // control the reader has no reason to connect it to, in a list of four other
  // sentences that are all commands. Every step around it opens with a verb
  // aimed at him (`ACT_FIRST`, briefing-card-budget.test.ts); this one asked
  // him to infer an action from a statement of intent. So it is now the act —
  // switch — followed by what he is holding if he does not: an automatic, with
  // no съединител for steps 2–4 to command and no загасване for the drill to
  // grade. 93 characters, inside the band.
  //
  // WHAT THIS STILL DOES NOT DO, and it is the half that matters: nothing
  // REFUSES the drill on the automatic tier. A student who ignores the line
  // drives an unfailable rung of a lesson about stalling and completes it. The
  // gate would have to read the transmission, and no channel carries it —
  // `stepObjective` is handed a `SimTick` (lessons/rules) whose `gear` is a
  // number, `transmissionModeFor` lives in vehicle/difficulty.ts and is read by
  // LessonScene alone, and a ScenarioSpec has no field to demand a tier. That
  // is the lesson-level transmission channel the header already routes to
  // contracts.ts + compile.ts + LessonScene.tsx + vehicle/driveline.ts.
  //
  // ROUND 11, 2026-08-25 — THAT CHANNEL EXISTS NOW, AND IT IS THE HAND-OVER
  // RATHER THAN A REFUSAL. `start.openingTier` above → `LessonSpec.openingTier`
  // (contracts.ts, written by compile.ts) → the tier `useState` seed in
  // LessonScene, which is what `VehicleRig` reads every frame through
  // `transmissionModeFor`. The car arrives manual, so the clutch steps 2–4
  // command exist and `ENGINE_STALLED` is reachable on the student's own drive
  // for the first time.
  //
  // WHY NOT THE REFUSAL THE PARAGRAPH ABOVE ASKED FOR. A gate that failed the
  // drill on the automatic tier would convict a student for a simulator
  // setting rather than for driving — the one thing this product must never
  // do. Handing over the right car makes the wrong tier unreachable at t = 0
  // instead of punishable at the debrief, and the pill still lets a student
  // leave deliberately, which is a choice and not a mistake.
  //
  // STILL OPEN, and named so nobody stops here: a student who clicks
  // „Нормален" MID-drive gets the automatic back with no word about what the
  // remaining steps now mean. That is `onTransmissionChanged`'s voice
  // (LessonScene → LessonPlayShell), which today announces the moved selector
  // and not the lost clutch. Different file, different lane.
  instructionsBg: [
    // …AND ROUND 11 TOOK THE SWITCH BACK OUT (`start.openingTier` above). The
    // step is one act again — the belt — followed by the fact the student has
    // to read the cockpit with. 74 characters, two shorter than the round-10
    // line, so the fold budget step 2 has to live in did not narrow.
    { n: 1, textBg: "Закопчай колана — тази кола е с ръчни скорости и съединител („Напреднал“)." },
    { n: 2, textBg: "Съединител докрай („СЪЕД“ / Z), включи първа предавка (]) и дай лек газ." },
    { n: 3, textBg: "Отпускай съединителя ПЛАВНО до точката на зацепване и задръж, докато колата тръгне." },
    { n: 4, textBg: "Загасне ли двигателят: съединител докрай, запали отново и повтори спокойно." },
    { n: 5, textBg: "Продължи плавно по отсечката, без нито едно загасване, до края." },
  ],
  success: [
    {
      id: "sc-vps-moved",
      titleBg: "Потегли плавно и мини контролната зона",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 14, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vps-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 14 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpStall.ts; gates in traces/__tests__/vp-stall-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-stall/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-stall/mistake-stall-once.trace.json" },
      titleBg: "Загасване при потеглянето",
      whatWentWrongBg:
        "Съединителят беше отпуснат рязко и двигателят загасна още на първия метър — колата подскочи и спря. Всяко загасване е официална второстепенна грешка на изпита: не е драма, но се отбелязва. Спокойното повторение на процедурата е част от умението.",
      codeRefs: ["ENGINE_STALLED"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-stall/mistake-stall-repeat.trace.json" },
      titleBg: "Повторно загасване",
      whatWentWrongBg:
        "Двигателят загасна два пъти подред — след първото загасване дойде паниката, а с нея и същото рязко отпускане на съединителя. Повтарящото се загасване показва проблем с работата на съединителя и газта и трупа точки: всяко ново загасване се брои отделно.",
      codeRefs: ["ENGINE_STALLED"],
    },
  ],
  teach: {
    whenBg:
      "При всяко потегляне от място с ръчни скорости — на светофар, на знак Стоп, на наклон и в началото на изпита. Точно там нервите избързват с крака и двигателят гасне; процедурата е една и съща всеки път.",
    whyBg:
      "Загасването само по себе си е дребна грешка, но последствията не са: кола, която угасва на зелено или на кръстовище, блокира потока и кани удар отзад, а паниката след първото загасване ражда второто. Овладяната точка на зацепване прави потеглянето предвидимо — и на изпита, и на хълма пред колоната.",
    lawRef: "Наредба № 38 (второстепенни грешки — загасване на двигателя)",
    examinerBg:
      "Изпитващият отбелязва всяко загасване на двигателя като второстепенна грешка — едно се преживява, но повтарянето показва липса на контрол над съединителя и газта и се трупа. Гледа се и реакцията: спокоен рестарт и правилно повторно потегляне, не газ до ламарината.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vp-police-stop — „Спиране по полицейски сигнал" (doc 72 VP-11) on ln-v1
//    (map REUSED from sc-lane-change / sc-vu-emergency: the 400 m 2+2
//    boulevard — a left lane must exist so the „подминаване" demo can grade)
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario; pinned by value — L7). */
const PS_RIGHT = 12.19;
const PS_LEFT = 4.06;
/**
 * The officer's post, m. Founder review 2026-07-27: „the police officer is not
 * visible at all". At x = 17.0 he stood BEYOND the curb line (16.25), inside
 * the TrafficLayer's curb-parked decoration — a small figure occluded by a
 * bumper-to-bumper row of cars, in a reel whose entire premise is that a
 * driver reacted to him. He now stands ON the carriageway edge, ~1.7 m off the
 * halt point, which is where an officer with a стоп-палка actually stands and
 * which puts him clear of the parked row and squarely in the chase frame.
 * VISUAL ONLY: PoliceStopRunner reads `officer` for the figure's standing path
 * and for the „passed him by passBeyondM" OUTCOME; the runner emits no SimTick
 * events at all, so nothing here can grade (A12). The graded contract is `stop`
 * + the curb-side reachZone objective, both untouched.
 */
const PS_OFFICER = { x: 15.6, y: 208 };
/** The curb-side halt point: right edge of the right lane, just short of the
 *  officer — the driver stops with the window at the officer's level. */
const PS_STOP = { x: 13.9, y: 206 };
const PS_STOP_RADIUS_M = 3;
const PS_STOP_SPEED_KMH = 4;

/**
 * The staged OFFICER FIGURE on ln-v1 (kind "policeStop" — scenery +
 * measurement only, see contracts.ts): stands at the curb at y = 210 facing
 * the roadway (west), right arm raised — the стоп-сигнал pose, hi-vis vest,
 * fictional per ADR-001. The runner emits ZERO SimTick events: the graded
 * duty lives entirely in this template's objectives (the curb-side low-speed
 * reachZone below = the pull-over-and-stop completion), so no new violation
 * code exists to false-fire (A12). The outcome channel records "yielded" /
 * "passedWithoutStopping" for the debrief.
 */
const VP_POLICE_OFFICER: PoliceStopSpec = {
  id: "sc-vpps-officer",
  kind: "policeStop",
  libraryEventId: "ev-police-stop-signal",
  officer: PS_OFFICER,
  facing: { x: -1, y: 0 }, // toward the roadway (west)
  stop: PS_STOP, // single truth with the graded stop-zone objective below
  stopRadiusM: PS_STOP_RADIUS_M,
  stopSpeedKmh: PS_STOP_SPEED_KMH,
  passBeyondM: 25,
};

/**
 * VP-11 — спиране по полицейски сигнал (ЗДвП чл. 170: разпорежданията на
 * органите за контрол са задължителни за участниците в движението; сигналът
 * за спиране изисква БЕЗОПАСНО спиране плътно вдясно — не паническо спиране
 * насред лентата и не подминаване).
 *
 * COMPLETION DRILL (the stage-1c mandate): graded through EXISTING objective
 * kinds only — a low-speed curb-side reachZone (the sc-pk-smooth-stop
 * stop-mark pattern) IS the pull-over-and-stop duty; no new violation code.
 * The mistake demos grade shipped codes that honestly fit each wrong way:
 *   - „Подминаване на сигнала" — swerves LEFT around the officer and drives
 *     on: the left-lane hog grades NOT_KEEPING_RIGHT (чл. 15) and the drill
 *     never completes (the stop zone stays unreached — capped outcome);
 *   - „Паника в лентата" — the doc-72 mistake verbatim (panic-brake in-lane
 *     instead of pulling right): the ≥ 8 m/s² slam on an empty street grades
 *     HARSH_BRAKING_NO_CAUSE, and the early mid-lane rest never reaches the
 *     stop zone either.
 * HONEST LIMIT (documented like sc-pk-smooth-stop's smoothness note): the
 * WITHIN-LANE pull-to-the-edge nuance (~1.7 m) is coached by the instructions
 * and the shadow, not zone-graded — a circular reachZone cannot honestly
 * discriminate lateral position inside one lane.
 */
export const SC_VP_POLICE_STOP: ScenarioSpec = {
  id: "sc-vp-police-stop",
  family: "cockpit",
  tagsBg: ["полицейски сигнал", "спиране", "проверка", "чл. 170"],
  titleBg: "Спиране по полицейски сигнал",
  objectiveBg:
    "Полицай на тротоара ти подава сигнал за спиране. Изпълни го правилно: мигач надясно, плавно намаляване и спиране плътно вдясно при полицая — без паническо спиране насред лентата и без подминаване. Разпорежданията на контролните органи са задължителни (чл. 170).",
  archetypeIds: ["VP-11"],
  conceptIds: ["c-general-care-duty", "c-vehicle-controls", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-lane-change — mirrored in ln-v1.json
    // meta.scenario.params (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента по булеварда." },
    {
      n: 2,
      textBg:
        "Напред вдясно на тротоара стои полицай с вдигната ръка — сигналът за спиране е за теб и е задължителен (чл. 170).",
    },
    { n: 3, textBg: "Без паника: провери огледалото, пусни десен мигач и започни плавно да намаляваш отрано." },
    {
      n: 4,
      textBg:
        "Отдръпни се към десния край на лентата и спри плътно вдясно, точно при полицая — не насред платното.",
    },
    { n: 5, textBg: "Остани спрял с работещ двигател и ръце на волана — изчакваш указанията на полицая." },
  ],
  success: [
    {
      id: "sc-vpps-approach",
      titleBg: "Приближи полицая с контролирана скорост",
      // Right-lane checkpoint well before the officer's post.
      params: { kind: "reachZone", x: PS_RIGHT, y: 120, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vpps-stop",
      titleBg: "Спри плътно вдясно при полицая",
      // Completable ONLY at near-stop speed at the curb-side halt point (the
      // sc-pk-smooth-stop stop-mark pattern): the drill ENDS at rest by the
      // officer — pulled over right and stopped. Same values as the staged
      // PoliceStopSpec's halt contract (single truth by value).
      params: {
        kind: "reachZone",
        x: PS_STOP.x,
        y: PS_STOP.y,
        radiusM: PS_STOP_RADIUS_M,
        maxSpeedKmh: PS_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (ADR-006 stage 1c): committed deterministic recordings of the
  // authored scripts in traces/scVpPoliceStop.ts; the §5 gate (shadow replays
  // with ZERO violations + rests in the stop zone) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vp-police-stop-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-police-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-police-stop/mistake-drive-past.trace.json" },
      titleBg: "Подминаване на сигнала",
      whatWentWrongBg:
        "Водачът видя сигнала, измести се в лявата лента и просто отмина полицая. Разпореждането за спиране е задължително (чл. 170) — неизпълнението му е сериозно нарушение с глоба и книжка на масата. А оставането в лявата лента при свободна дясна е и „висене“ в лентата за изпреварване (чл. 15).",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-police-stop/mistake-panic-stop.trace.json" },
      titleBg: "Паника в лентата",
      whatWentWrongBg:
        "Сигналът стресна водача и кракът се заби в спирачката — колата спря рязко насред лентата, далеч преди полицая. Точно това е класическата грешка на новите водачи: сигналът иска БЕЗОПАСНО спиране плътно вдясно, а не аварийно спиране на място, което изненадва движещите се отзад и е предпоставка за удар.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "Когато униформен полицай (или контролен орган със стоп-палка) ти подаде сигнал за спиране — при проверка, при произшествие напред, при отклоняване на движението. Сигналът е задължителен винаги и навсякъде.",
    whyBg:
      "Паническото спиране насред лентата е толкова опасно, колкото и подминаването: движещият се зад теб не очаква аварийно спиране без причина. Спокойната процедура — огледало, мигач, плавно вдясно, спиране при полицая — пази и теб, и колоната зад теб, и показва контрол над колата.",
    lawRef: "ЗДвП чл. 170",
    examinerBg:
      "Изпитващият (и полицаят) гледа: навременно забелязване на сигнала, огледало и десен мигач, плавно намаляване и спиране плътно вдясно на посоченото място, двигател работещ и изчакване на указания. Рязко спиране в лентата или подминаване на сигнала е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  staged: [VP_POLICE_OFFICER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vp-telltale — „Контролна лампа в движение" (doc 72 VP-06, N11 cockpit-
//    stimuli batch #10) on ln-v1 (map REUSED from sc-vp-police-stop: the
//    400 m 2+2 boulevard with curb space for the pull-over)
// ---------------------------------------------------------------------------

/** ln-v1 northbound right-lane center (meta.scenario; pinned by value — L7). */
const TT_RIGHT = 12.19;
/** The stimulus: the red temperature telltale lights as the player passes
 *  y = 140 in the right lane (mid-drive, well past the approach checkpoint). */
const TT_TRIGGER = { x: TT_RIGHT, y: 140 };
const TT_TRIGGER_DIST_M = 8;
/** The curb-side halt point (right edge of the right lane, curb x = 16.25 —
 *  the sc-vp-police-stop pull-over geometry, ~80 m of planning room after
 *  the lamp). */
const TT_STOP = { x: 13.9, y: 220 };
const TT_STOP_RADIUS_M = 3;
const TT_STOP_SPEED_KMH = 4;

/**
 * The staged COCKPIT STIMULUS on ln-v1 (kind "telltaleStimulus" — stimulus +
 * measurement only, see contracts.ts): NO actor; at the trigger the director's
 * telltaleLit channel lights the cluster's red temperature lamp (+ the L1/L2
 * HUD cue). The runner emits ZERO SimTick events: the graded duty lives
 * entirely in this template's objectives (the curb-side low-speed reachZone
 * below = the pull-over-and-stop completion), so no new violation code exists
 * to false-fire (A12). The outcome channel records "yielded" (with the
 * stimulus→first-brake reactionTimeSec) / "passedWithoutStopping" for the
 * debrief. ignoreBeyondM 120 sits comfortably past the stop zone (y 260 vs
 * 220), so a compliant pull-over always resolves first.
 */
const VP_TELLTALE_LAMP: TelltaleStimulusSpec = {
  id: "sc-vptt-lamp",
  kind: "telltaleStimulus",
  libraryEventId: "ev-warning-light",
  lamp: "temperature",
  trigger: TT_TRIGGER,
  triggerDistM: TT_TRIGGER_DIST_M,
  stop: TT_STOP, // single truth with the graded stop-zone objective below
  stopRadiusM: TT_STOP_RADIUS_M,
  stopSpeedKmh: TT_STOP_SPEED_KMH,
  ignoreBeyondM: 120,
};

/**
 * VP-06 — контролна лампа по време на движение (ЗДвП чл. 20: водачът е длъжен
 * да контролира ППС; чл. 139: движение само с технически изправно превозно
 * средство. Doc-65 ev-warning-light doctrine: ЧЕРВЕНА лампа = спри безопасно
 * СЕГА — не паническо спиране насред лентата и не „ще стигна до вкъщи").
 *
 * COMPLETION DRILL (the sc-vp-police-stop mold): graded through EXISTING
 * objective kinds only — a low-speed curb-side reachZone IS the
 * notice-and-pull-over duty; no new violation code. The mistake demos grade
 * shipped codes that honestly fit each wrong way:
 *   - „Игнорирана лампа" — drives on past the lamp and HURRIES (the classic
 *     ignore story: push on to get home before the car dies): the sustained
 *     58 km/h in the 50 zone grades SPEEDING_OVER_LIMIT (чл. 21), and the
 *     drill never completes (the stop zone stays unreached; the outcome
 *     records "passedWithoutStopping");
 *   - „Паника в лентата" — the doc-72 VP-06 mistake flavor (panic instead of
 *     a plan): the ≥ 8 m/s² slam mid-lane on the empty street grades
 *     HARSH_BRAKING_NO_CAUSE — HONEST grading verified against the ledger: a
 *     dashboard lamp is NOT a forward cause (the harsh-brake ledger reads
 *     leadGap/signal/junction/crossing channels only; the telltale runner
 *     emits zero events), and the early mid-lane rest never reaches the stop
 *     zone either.
 * HONEST LIMIT (the sc-vp-police-stop note verbatim): the WITHIN-LANE
 * pull-to-the-edge nuance (~1.7 m) is coached by the instructions and the
 * shadow, not zone-graded.
 */
export const SC_VP_TELLTALE: ScenarioSpec = {
  id: "sc-vp-telltale",
  family: "cockpit",
  tagsBg: ["контролна лампа", "табло", "прегряване", "спиране вдясно", "кокпит"],
  titleBg: "Контролна лампа в движение",
  objectiveBg:
    "По време на движение на таблото светва червената лампа за температура на двигателя. Забележи я навреме и реагирай правилно: огледало, десен мигач, плавно намаляване и спиране плътно вдясно — червена лампа значи „спри безопасно сега“, не паника и не продължаване.",
  archetypeIds: ["VP-06"],
  conceptIds: ["c-vehicle-controls", "c-technical-condition", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-lane-change / sc-vp-police-stop — mirrored in
    // ln-v1.json meta.scenario.params (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента — и си създай навика да поглеждаш таблото." },
    {
      n: 2,
      textBg:
        "Светва червената лампа за температура на двигателя. Червена лампа значи: спри безопасно сега — двигателят прегрява.",
    },
    { n: 3, textBg: "Без паника: провери огледалото, пусни десен мигач и започни плавно да намаляваш отрано." },
    {
      n: 4,
      textBg:
        "Отдръпни се към десния край на лентата и спри плътно вдясно — не рязко насред платното и не „до вкъщи е близо“.",
    },
    { n: 5, textBg: "Остани спрял вдясно — при червена лампа двигателят се гаси и не се продължава." },
  ],
  success: [
    {
      id: "sc-vptt-approach",
      titleBg: "Карай спокойно по булеварда",
      // Right-lane checkpoint BEFORE the trigger (y 100 < 140) — the
      // objectives complete in order, so the stop zone below can only be
      // graded on the far side of the stimulus.
      params: { kind: "reachZone", x: TT_RIGHT, y: 100, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vptt-stop",
      titleBg: "Спри плътно вдясно след лампата",
      // Completable ONLY at near-stop speed at the curb-side halt point (the
      // sc-pk-smooth-stop stop-mark pattern), 80 m PAST the stimulus trigger
      // — reaching it before the lamp is geometrically impossible (any drive
      // to it crosses the trigger corridor, and the runner's passed-backstop
      // covers a crawler). Same values as the staged TelltaleStimulusSpec's
      // halt contract (single truth by value).
      params: {
        kind: "reachZone",
        x: TT_STOP.x,
        y: TT_STOP.y,
        radiusM: TT_STOP_RADIUS_M,
        maxSpeedKmh: TT_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (N11 batch #10): committed deterministic recordings of the
  // authored scripts in traces/scVpTelltale.ts; the §5 gate (shadow replays
  // with ZERO violations + rests in the stop zone) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vp-telltale-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-telltale/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-telltale/mistake-ignore.trace.json" },
      titleBg: "Игнорирана лампа",
      whatWentWrongBg:
        "Червената лампа светна — а водачът само натисна газта: „ще стигна до вкъщи“. Прегряващ двигател не се лекува с бързане: няколко километра с червена лампа значат скъсан двигател насред пътя. А ускоряването „за да стигнеш“ прати колата и над ограничението (чл. 21). Червена лампа = спри безопасно сега.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-telltale/mistake-panic-stop.trace.json" },
      titleBg: "Паника в лентата",
      whatWentWrongBg:
        "Лампата стресна водача и кракът се заби в спирачката — колата спря аварийно насред лентата. Точно това е грешният рефлекс: червената лампа иска БЕЗОПАСНО спиране плътно вдясно, с огледало и мигач, а не аварийно спиране на място, което изненадва движещите се отзад и е предпоставка за удар.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "Когато на таблото светне предупредителна лампа по време на движение — температура, налягане на маслото, спирачки. Цветът казва всичко: червена лампа значи „спри безопасно сега“, жълта — „внимание, до сервиз“. Навикът да поглеждаш таблото на всеки няколко секунди я хваща навреме.",
    whyBg:
      "Контролните лампи предупреждават за проблем, преди той да е станал опасен (чл. 20 — контролът над автомобила значи и контрол над състоянието му). Игнорирането на червена лампа завършва със счупена кола насред пътя, а паническото спиране в лентата — с удар отзад. Спокойната процедура — огледало, мигач, плавно вдясно — решава и двете.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият гледа реакцията на водача при проблем: навременно забелязване, запазено самообладание, огледало и десен мигач, плавно намаляване и спиране плътно вдясно на безопасно място. Рязко спиране в лентата или продължаване с явна неизправност е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  staged: [VP_TELLTALE_LAMP],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The cockpit-procedure-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT: readonly ScenarioSpec[] = [
  SC_VP_READINESS,
  SC_PK_MOVE_OFF,
  SC_VP_STALL,
  SC_VP_POLICE_STOP,
  SC_VP_TELLTALE,
];
