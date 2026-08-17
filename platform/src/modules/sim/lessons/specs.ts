/**
 * Lesson specs v1 — DATA ONLY, pinned to the real Студентски град district
 * (content/world/district-v1.json). Every spawn `pointId`, node id and
 * coordinate below is copied from that file; coordinates are denormalized
 * into objective params so the lesson engine never loads the world file.
 *
 * Curriculum arc (docs/education — mirrors how driving schools sequence):
 *   L0 free drive → L1 pre-drive + moving off → L2 intersections/priority →
 *   L3 roundabout → L4 pedestrian crossings → L5 emergency braking →
 *   L6 night driving → L7 parking.
 *
 * INTEGRATION NOTES (runtime/world):
 *  - L2: district-v1.json has no stop-sign data — l2's stop-controlled
 *    objective expects the world to place a Б2 „Спри!" sign + stop line at node
 *    n331942490 (383.17, 65.76) and emit stopLineCrossed{control:"stopSign"}.
 *  - L5/L7 (A10 hardened): emergencyStop is STIMULUS-LOCKED — it grades from
 *    the l5-braking-lead-car StagedEventOutcome (stop without collision;
 *    reaction time banded), not from a speed profile. parkInBay is BAY-LOCKED
 *    — it completes only at rest inside the painted bay rect (same values as
 *    `parkingBay`, single-sourced via L7_PARKING_BAY), aligned and via
 *    reverse. L5's `hazard` ball-dart-out remains the render-side stimulus
 *    (TrafficLayer draws it; the A8 orchestrator flips it with the lead-car
 *    slam).
 *  - L6: environment.timeOfDay "night" flips SimTick.isNight, so the rule engine
 *    expects headlights on (HEADLIGHTS_OFF_AT_NIGHT). The world must render
 *    night lighting and set isNight on every tick for this lesson.
 */

import {
  DEFAULT_DISTRICT_ID,
  lessonDistrictId,
  type CyclistRightHookSpec,
  type LessonSpec,
  type ParkingBaySpec,
  type PriorityFromRightSpec,
  type RoundaboutEntrySpec,
} from "../contracts";
import { EXAM_BANK_PARKING_BAYS } from "./examBankData";

/**
 * L7's marked bay — single source for the WORLD paint (LessonSpec.parkingBay
 * → LESSON_PARKING_BAYS → markings builder) and the GRADED rect (l7-park
 * objective params.bay, A10): what the student sees painted is exactly what
 * the evaluator measures against. The A13 exam route ends in the SAME bay
 * (same painted rect, same graded rect — one street, one truth). Exported
 * since B1b: exam-bank shells that finish on „Трайко Станоев" park in THIS
 * object (examBank.ts) — the single-truth rect survives the bank.
 */
export const L7_PARKING_BAY: ParkingBaySpec = {
  x: 681.26,
  y: -199.54,
  headingDeg: 67.3,
  widthM: 3.0,
  lengthM: 6.6,
};

// ---------------------------------------------------------------------------
// Shared staged encounters (still DATA — the builders only stamp an id, so
// the lesson that teaches a hazard and the exam that rehearses it grade the
// EXACT same pinned geometry; a district fix lands in both at once).
// ---------------------------------------------------------------------------

/** L2/exam — priority car from the right at the Б1-guarded junction
 *  n5063751788 (audit C-4: the sign there is a give-way triangle, and the
 *  runtime now grades one; the function name is kept for call-site stability).
 *  See the honest-placement note on the L2 entry. */
function priorityFromRightAtB2(id: string): PriorityFromRightSpec {
  return {
    id,
    kind: "priorityFromRight",
    libraryEventId: "ev-junction-priority-sign",
    junction: { nodeId: "n5063751788", x: 434.54, y: 67.2 },
    actor: {
      // Northbound on бул. „Акад. Стефан Младенов" (e672186635.0), across
      // the junction, north past the lights, exiting east on the
      // secondary_link — clear of the player's whole remaining route.
      pathNodes: [
        "n1113186267",
        "n5063751788",
        "n9601848047",
        "n6294463135",
        "n1805512602",
        "n330851787",
      ],
      hold: { nodeIndex: 1, offsetM: -75 }, // 75 m south of the junction
      cruiseSpeedMps: 8.5,
      colorIndex: 2,
    },
    junctionNodeIndex: 1,
    armDistM: 95,
    leadSec: 1.1,
    lineDistM: 8,
    clearSpeedMps: 12.5,
  };
}

/** L3/exam — cyclist right-hook at the uncontrolled T n415949424 (the routes
 *  share the same southbound straight + right turn west). Audit C3 caveat:
 *  the "cyclist" is a narrow scripted vehicle-agent riding the curb. */
function cyclistRightHookAtT(id: string): CyclistRightHookSpec {
  return {
    id,
    kind: "cyclistRightHook",
    libraryEventId: "ev-cyclist",
    junction: { nodeId: "n415949424", x: 229.08, y: -401.6 },
    actor: {
      // Southbound on the 131 m straight the player also rides, then
      // straight through the junction and away south (off the route).
      pathNodes: ["n179974484", "n415949424", "n10829521919"],
      hold: { nodeIndex: 1, offsetM: -38 }, // waits curb-side, 38 m short
      cruiseSpeedMps: 4.6,
      extraRightOffsetM: 2.6, // rides the curb of the scaled lane
      colorIndex: 1,
    },
    junctionNodeIndex: 1,
    releaseDistM: 70,
    dangerRadiusM: 9,
    conflictWindowM: 20,
  };
}

/** L3/exam — circulating-car conflict at the rb-1 SE entry mouth (both
 *  routes approach it westbound along „Баку"). */
function roundaboutEntryConflict(id: string): RoundaboutEntrySpec {
  return {
    id,
    kind: "roundaboutEntry",
    libraryEventId: "ev-roundabout",
    center: { x: -38.03, y: -342.96 },
    ringRadiusM: 19.83,
    actor: {
      // The full rb-1 ring as a closed loop (counter-clockwise).
      pathNodes: [
        "n707684255",
        "n707684256",
        "n279646956",
        "n279646958",
        "n1038574156",
        "n1038574251",
        "n707684255",
      ],
      hold: { nodeIndex: 0, offsetM: 0 }, // dormant on the far (west) arc
      cruiseSpeedMps: 6.5,
      loop: true,
      colorIndex: 0,
    },
    entry: { x: -20.1, y: -351.4 }, // player's SE entry mouth (n279646956)
    entryNodeIndex: 2,
    conflictLeadM: 12,
    armDistM: 110,
    minSyncSpeedMps: 3,
    maxSyncSpeedMps: 9,
  };
}

export const LESSONS: readonly LessonSpec[] = [
  {
    id: "l0-free-drive",
    order: 0,
    titleBg: "Свободно каране",
    descriptionBg:
      "Опознай квартала без задачи и без напрежение. Правилата обаче важат: инструкторът следи всяко нарушение и всяка добра практика в реално време. Завърши сесията с до 9 наказателни точки, за да отключиш Урок 1.",
    conceptIds: ["c-driver-obligations", "c-speed-adaptation", "c-safety-space"],
    spawn: { pointId: "spawn-6" }, // Проф. Константин Чилов
    preDrive: false,
    // Acclimatization sandbox: the ONLY lesson that spawns ready-to-drive
    // (engine on, D, brake released). Every other lesson keeps the default
    // cold start — engine off, P, parking brake on (A1 spawn policy).
    vehicleStart: "ready",
    objectives: [],
  },
  {
    id: "l1-preparation",
    order: 1,
    titleBg: "Подготовка и потегляне",
    descriptionBg:
      "Урокът, с който започва всеки изпит: 13-те стъпки преди потегляне — седалка, огледала, колан — после плавно потегляне, кратък пробег и меко спиране.",
    conceptIds: [
      "c-pre-drive-check",
      "c-seatbelts",
      "c-mirrors-blind-spots",
      "c-driver-signals",
      "c-braking-distance",
    ],
    spawn: { pointId: "spawn-1" }, // ул. Трайко Станоев
    preDrive: true,
    // A2: first contact with the procedure is GUIDED — prompts + hotspot
    // highlights, wrong order coached not scored. "practice"/"assess" are the
    // later rungs of the Instruction→Practice→Assess ladder (doc 68 §5).
    preDriveMode: "instruction",
    objectives: [
      {
        id: "l1-drive-300m",
        titleBg: "Измини 300 метра",
        kind: "driveDistance",
        params: { meters: 300 },
      },
      {
        id: "l1-smooth-stop",
        titleBg: "Спри плавно, без рязко спиране",
        kind: "completeManeuver",
        params: { maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 },
      },
    ],
  },
  {
    id: "l2-intersections",
    order: 2,
    titleBg: "Кръстовища и предимство",
    descriptionBg:
      "Маршрут на север през три кръстовища: едно със знак „Стоп“ и две със светофари. Спирай докрай, гледай сигналите и пропускай тези с предимство.",
    conceptIds: [
      "c-priority-concept",
      "c-give-way-stop-behavior",
      "c-junction-approach",
      "c-light-junction",
      "c-traffic-light-signals",
    ],
    spawn: { pointId: "spawn-4" }, // одностранна улица на север
    preDrive: false,
    // A8 staged encounter — priority from the right. HONEST PLACEMENT NOTE:
    // the L2 route has NO uncontrolled (right-hand-rule) junction — every
    // junction on it is signalized or sign-guarded — so the scripted car
    // crosses the player's Б1-guarded junction n5063751788 (the minor-meets-
    // SECONDARY give-way east of the first objective, where the route turns
    // north onto the secondary; audit C-4 — the Б2 the runtime used to grade
    // there was never posted). Grading path is unchanged: the runtime's
    // stop-line give-way adjudication (conflictNear at line crossing →
    // FAILED_TO_YIELD), which a Б1 line delivers identically. The
    // orchestrator's staging machinery is junction-type agnostic; the
    // conflictFromRight/uncontrolled variant is exercised by the orchestrator
    // integration tests at n348207502.
    stagedEvents: [priorityFromRightAtB2("l2-priority-from-right")],
    objectives: [
      {
        id: "l2-stop-sign",
        titleBg: "Премини кръстовището със знак „Стоп“",
        kind: "passSignal",
        params: {
          nodeId: "n331942490",
          x: 383.17,
          y: 65.76,
          radiusM: 30,
          control: "stopSign",
        },
      },
      {
        id: "l2-signal-1",
        titleBg: "Премини първото кръстовище със светофар",
        kind: "passSignal",
        params: {
          nodeId: "n1805512602",
          x: 430.13,
          y: 235.3,
          // 30 → 40 (2026-08-11). `stopLineCrossed` is a ONE-FRAME event and
          // stepPassSignal only counts it while the car is inside this radius,
          // so the radius has to reach the PAINT, not the node. It did not.
          // Measured against district-v1 through the real runtime: the only
          // trafficLight line guarding n1805512602 is crossed at 32.0 m (right
          // lane), 34.0 m (middle) and 37.7 m (left) from this centre — every
          // lane outside 30 — so the event was discarded on every frame it
          // could ever fire and the objective was UNCOMPLETABLE. Driven proof:
          // the crossing fires at (436.4, 203.9), 32.05 m out, and the
          // evaluator never sees it. Objectives are sequential, so this locked
          // l2-signal-2 behind it and shipped the same brick into the exam
          // lesson (ex-signal-1).
          //
          // 40 and not more: it admits all three of this junction's own lanes
          // (37.7 + 2.3 m) and still excludes the NEXT signalized junction,
          // whose nearest drivable crossing is 43.8 m away — so the objective
          // still cannot be bought by crossing a different light.
          // objective-window-reachability.test.ts pins both halves.
          radiusM: 40,
          control: "trafficLight",
        },
      },
      {
        id: "l2-signal-2",
        titleBg: "Премини второто кръстовище със светофар",
        kind: "passSignal",
        params: {
          nodeId: "n5997970086",
          x: 421.91,
          y: 275.44,
          radiusM: 30,
          control: "trafficLight",
          // A10 (audit D4): the L2 run must include at least one MET red —
          // at either light of the route, a full stop followed by proceeding
          // on GREEN. That is the only signature available on this route: the
          // other lawful one (a регулировчик waving you through a forbidding
          // lamp, ЗДвП чл. 7) needs an officer, and L2 has none. Driving
          // THROUGH a red is not a met red and never satisfies this — the gate
          // would otherwise be closed by the offence it exists to forbid; see
          // PassSignalParams.requireRedMet. Lucking greens leaves this final
          // objective open.
          // FEASIBILITY (verified against runtime/signals.ts SIGNAL_TIMING):
          // every signal group cycles green 20 s / yellow 3 s / redYellow
          // 1 s / red 26 s in a fixed 50 s cycle — red is up 52% of the
          // time, and from any arrival phase a red arrives within ≤ 24 s.
          // A student who crossed both lights on green simply stops at this
          // line on re-approach (or waits before crossing) and meets a red
          // within half a cycle — the gate can never deadlock. The staged
          // l2-priority-from-right hold at the Б2 junction further staggers
          // arrival phase, making an all-green luck run rarer to begin with.
          requireRedMet: true,
        },
      },
    ],
  },
  {
    id: "l3-roundabout",
    order: 3,
    titleBg: "Кръговото движение",
    descriptionBg:
      "Единственото кръгово в квартала. Приближи го спокойно, пропусни движещите се в кръга, влез с десен мигач на излизане — и излез, без да спираш потока.",
    conceptIds: [
      "c-roundabout-rules",
      "c-roundabout-behavior",
      "c-driver-signals",
      "c-lane-choice",
    ],
    spawn: { pointId: "spawn-3" }, // южна права, на север към кръговото
    preDrive: false,
    // A8 staged encounters, in route order:
    //  1. Cyclist right-hook at the uncontrolled T n415949424 — the route's
    //     only genuine RIGHT turn (south → west toward the roundabout). The
    //     "cyclist" is a narrow scripted vehicle-agent riding the curb
    //     (extraRightOffsetM) — v1 actor-model limitation (audit C3): no
    //     cyclist mesh/type exists yet, it renders as a small fleet car.
    //     It continues STRAIGHT south while the player turns right across it.
    //  2. Roundabout entry conflict at rb-1 — a scripted car circulates the
    //     ring timed to be just left of the player's entry mouth when they
    //     reach the yield line; the runtime's circulatingConflict query
    //     grades the entry exactly as it would any ambient car.
    stagedEvents: [
      cyclistRightHookAtT("l3-cyclist-right-hook"),
      roundaboutEntryConflict("l3-roundabout-conflict"),
    ],
    objectives: [
      {
        id: "l3-approach",
        titleBg: "Стигни до кръговото кръстовище",
        kind: "reachZone",
        // rb-1 center; radius covers the approach mouths of the ring.
        params: { x: -38.03, y: -342.96, radiusM: 60 },
      },
      {
        id: "l3-pass",
        titleBg: "Премини през кръговото и излез от него",
        kind: "completeManeuver",
        // rb-1 ring radius is 19.83 m — enter within 26 m, exit beyond 45 m.
        // A10: exiting also requires the RIGHT indicator in the exit window
        // (the „влез с десен мигач на излизане" promise above) — an
        // unsignaled exit voids the traversal and the student goes around
        // again. Enforced by the roundabout evaluator itself.
        params: {
          maneuver: "roundabout",
          x: -38.03,
          y: -342.96,
          enterRadiusM: 26,
          exitRadiusM: 45,
        },
      },
    ],
  },
  {
    id: "l4-crossings",
    order: 4,
    titleBg: "Пешеходни пътеки",
    descriptionBg:
      "Маршрут покрай три пешеходни пътеки — маркирани и със светофар. Скоростта на приближаване трябва да ти позволява да спреш: пешеходецът винаги е с предимство на пътеката.",
    conceptIds: [
      "c-crosswalk-yield",
      "c-pedestrian-rights-duties",
      "c-general-care-duty",
      "c-children-on-road",
      "c-speed-adaptation",
    ],
    spawn: { pointId: "spawn-5" }, // ул. Крум Кюлявков, на югозапад
    preDrive: false,
    // A8 staged encounter — pedestrian dart-out at the FIRST crossing of the
    // route (n12324499587, which the player provably drives over). The
    // pedestrian stands at the player's RIGHT curb; when the player closes in
    // at speed it steps out and runs across. Geometry derived from
    // e28780082.0 at the crossing (tangent ≈ (-0.874, -0.487), 2 scaled
    // lanes): curb offset = 2·8.125/2 + 0.4 + 1.2 = 9.725 m each side.
    // Crossing occupancy feeds the existing zone events → the PEDESTRIAN_*
    // detectors grade the approach with zero new plumbing.
    stagedEvents: [
      {
        id: "l4-ped-dart-out",
        kind: "pedestrianDartOut",
        libraryEventId: "ev-ped-crossing-marked",
        crossingId: "n12324499587",
        crossing: { x: -531.98, y: 123.75 },
        start: { x: -536.71, y: 132.25 },
        dir: { x: 0.4866, y: -0.8736 },
        speedMps: 2.9,
        travelM: 23.5, // across the 19.45 m curb-to-curb + 4 m walk-out
        roadFromM: 1.2,
        roadToM: 18.25,
        triggerDistM: 34,
        minTriggerSpeedKmh: 20,
      },
    ],
    objectives: [
      {
        id: "l4-crossing-1",
        titleBg: "Премини покрай първата пешеходна пътека",
        kind: "reachZone",
        params: { x: -531.98, y: 123.75, radiusM: 18 }, // crossing n12324499587
      },
      {
        id: "l4-crossing-2",
        titleBg: "Премини покрай втората пешеходна пътека",
        kind: "reachZone",
        params: { x: -527.75, y: 74.24, radiusM: 18 }, // crossing n12324499596
      },
      {
        id: "l4-crossing-3",
        titleBg: "Премини покрай пътеката със светофар",
        kind: "reachZone",
        params: { x: -462.04, y: 13.72, radiusM: 20 }, // crossing n3646708715
      },
    ],
  },
  {
    id: "l5-emergency-braking",
    order: 5,
    titleBg: "Аварийно спиране",
    descriptionBg:
      "Набери скорост по правата отсечка, а при внезапна опасност спри аварийно — рязко, докрай и без да губиш контрол. Умението да спреш навреме дели произшествието от разминаването.",
    conceptIds: [
      "c-braking-distance",
      "c-stopping-distance-total",
      "c-reaction-time",
      "c-sudden-braking-slow-driving",
      "c-hazard-perception",
    ],
    spawn: { pointId: "spawn-2" }, // ул. Васил Калчев — права отсечка
    preDrive: false,
    // The sudden obstacle: a bright ball darts from the right curb across the
    // road ~85 m past spawn-2, along ул. Васил Калчев (edge e661825071.0,
    // road heading 62° there; dart dir = heading − 90°, i.e. right → left).
    // Start sits 5.6 m right of the centerline (just past the 4.06 m curb of
    // the 1-lane scaled carriageway); 11.5 m of travel clears the far curb.
    // TrafficLayer renders it; the A8 orchestrator flips hazardActiveRef when
    // the student has built speed — until then the ball stays hidden.
    hazard: {
      kind: "ballDartOut",
      x: -152.0,
      y: 568.2,
      dirX: -0.4697,
      dirY: 0.8828,
      speedMps: 3.5,
      travelM: 11.5,
    },
    // A8 staged encounter — braking lead car with measured reaction time.
    // A lead car waits 28 m ahead of spawn-2, pulls away matching the
    // player's speed at a safe ~26 m gap, then brake-slams at the staged
    // point ~14 m short of the ball's crossing line — the same moment the
    // orchestrator flips the ballDartOut visual (the WHY of the slam). The
    // orchestrator measures stimulus → brake-onset reaction time and surfaces
    // it on the StagedEventOutcome (A10 locks l5-emergency-stop to it).
    stagedEvents: [
      {
        id: "l5-braking-lead-car",
        kind: "brakingLeadCar",
        libraryEventId: "ev-emergency-braking",
        actor: {
          pathNodes: ["n2282379696", "n10572786457"], // ул. Васил Калчев
          hold: { nodeIndex: 0, offsetM: 133 }, // spawn-2 sits at s≈105
          cruiseSpeedMps: 11,
          colorIndex: 3,
        },
        followGapM: 26,
        maxMatchSpeedMps: 16.7,
        slamAt: { x: -167.0, y: 566.6 }, // lane center, 14 m before the ball line
        slamRadiusM: 7,
        slamDecelMps2: 7.5,
        minSlamSpeedKmh: 25,
        proximityFallbackM: 30,
        triggersHazard: true,
        resumeAfterSec: 5,
      },
    ],
    objectives: [
      {
        id: "l5-build-speed",
        titleBg: "Набери скорост по правата",
        kind: "driveDistance",
        params: { meters: 120 },
      },
      {
        id: "l5-emergency-stop",
        titleBg: "Спри аварийно — рязко и докрай",
        kind: "completeManeuver",
        // A10 (audit D4): STIMULUS-LOCKED — completes only from the
        // l5-braking-lead-car StagedEventOutcome above: a full stop without
        // hitting the lead car ("stoppedInTime"); the measured stimulus →
        // brake-onset reaction time is banded (<0.8 s отличен / <1.2 s
        // добър / else бавен) into the objective detail. A hard stop with
        // no stimulus present no longer counts for anything.
        params: { maneuver: "emergencyStop", stagedEventId: "l5-braking-lead-car" },
      },
    ],
  },
  {
    id: "l6-night-driving",
    order: 6,
    titleBg: "Нощно шофиране",
    descriptionBg:
      "Същият квартал, но на тъмно. Кратки светлини, съобразена скорост и повече дистанция — нощем виждаш само толкова, колкото осветяват фаровете. Спри плавно на слабо осветено място.",
    conceptIds: [
      "c-night-visibility",
      "c-lights-overview",
      "c-high-beam-use",
      "c-dazzle-handling",
      "c-speed-adaptation",
    ],
    spawn: { pointId: "spawn-6" }, // Проф. Константин Чилов — жилищна улица
    preDrive: false,
    environment: { timeOfDay: "night" },
    objectives: [
      {
        id: "l6-night-route",
        titleBg: "Измини нощния маршрут със светлини",
        kind: "driveDistance",
        params: { meters: 400 },
      },
      {
        id: "l6-night-stop",
        titleBg: "Спри плавно на слабо осветено място",
        kind: "completeManeuver",
        params: { maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 },
      },
    ],
  },
  {
    id: "l7-parking",
    order: 7,
    titleBg: "Паркиране",
    descriptionBg:
      "Придвижи се до мястото и паркирай на заден ход. Овладей огледалата, заден ход и плавното спиране — след това остави колата в покой, спряла напълно на мястото си.",
    conceptIds: [
      "c-stopping-standing-rules",
      "c-parking-prohibitions",
      "c-reversing",
      "c-parking-slope-securing",
      "c-maneuver-principles",
    ],
    spawn: { pointId: "spawn-1" }, // ул. Трайко Станоев
    preDrive: false,
    // The marked bay: a curbside parallel bay on the right side of ул. Трайко
    // Станоев, ~62 m past spawn-1 (just beyond the 50 m approach objective).
    // Center sits 6.4 m right of the centerline so the 3.0 m-wide paint stays
    // inside the 8.125 m scaled carriageway half-width (edge e519275131.0,
    // road heading 67.3° there). The world paints it as a white U — side line
    // toward the road + both end lines; the curb closes the box.
    parkingBay: L7_PARKING_BAY,
    objectives: [
      {
        id: "l7-approach",
        titleBg: "Придвижи се към мястото за паркиране",
        // B1 (founder, doc 87): „a huge green arrow pointing straight to the
        // end of the street — I start to accelerate and suddenly it
        // disappears and asks me to go back and park". It was a
        // `driveDistance 50`, and a distance objective has no PLACE: the
        // guidance route answers `{kind:"ahead", 50 + 30 m}` and draws the
        // ribbon 80 m down the road, past the bay at 62 m, with no waypoint
        // to look ahead FROM (scene/guidanceRoute.ts). The moment the 50 m
        // ticked over, the ribbon's goal became the bay BEHIND the car.
        //
        // The pull-past pose is the real first act of a parallel park, so
        // author it as the place it is: 6 m beyond the bay, on the travel
        // lane (bay centre + 6 m along the 67.3° road axis, 2.34 m back
        // toward the centreline = 4.06 m lane centre — the same single-truth
        // L7_PARKING_BAY geometry every other L7 coordinate is derived from).
        // The ribbon now ends AT the parking place and the bay marker takes
        // over six metres behind it, which is the transition the founder
        // expected to see.
        kind: "reachZone",
        params: { x: 685.9, y: -195.07, radiusM: 7, maxSpeedKmh: 20 },
      },
      {
        id: "l7-park",
        titleBg: "Паркирай на заден ход и спри напълно",
        kind: "completeManeuver",
        // A10 (audit D4): BAY-LOCKED — at rest INSIDE the painted rect
        // (same L7_PARKING_BAY the world paints), centre within 0.5 m,
        // heading within 10° of the bay axis, reverse used near the bay,
        // stop held 1.5 s. Any-reverse-anywhere no longer completes it.
        // Tolerances are the evaluator defaults (PARK_CENTER_TOL_M /
        // PARK_HEADING_TOL_DEG in objectives.ts); attempts + alignment
        // quality surface in the objective detail for the debrief.
        params: { maneuver: "parkInBay", holdSec: 1.5, bay: L7_PARKING_BAY },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// A13 — „Пробен практически изпит" (exam mode; doc 68 row A13, finding D6)
// ---------------------------------------------------------------------------

/**
 * The exam route (~2.5 km, 10–15 min incl. the strict pre-drive) chains the
 * district's graded set — every leg verified drivable on the road graph
 * (oneways honored), every coordinate pinned to district-v1.json:
 *
 *   spawn-4 (cold start, pre-drive ASSESS)
 *   → north to the Б2 „Спри!" at n331942490          [braking lead car]
 *   → right, then left onto the boulevard             [priority from right]
 *   → north through both lights (n1805512602, n5997970086)
 *   → block-turnaround via „Проф. Марко Семов" onto the southbound
 *     carriageway (dual carriageway — the loop IS the legal U-turn)
 *   → south past n5063751788, right at the signalized n179974491 onto
 *     „Проф. Георги Брадистилов", left onto „Проф. Борис Боровски"
 *   → right at the T n415949424, west                 [cyclist right-hook]
 *   → along the southern street                       [pedestrian dart-out]
 *   → rb-1 roundabout as the turnaround (enter SE mouth, ~5/6 around,
 *     exit east with the right indicator)             [circulating conflict]
 *   → back east, north on „Боровски", east on „Брадистилов", straight
 *     through the light onto „Трайко Станоев"
 *   → reverse-park in the SAME painted bay L7 grades (L7_PARKING_BAY).
 *
 * All five A8 staged-event kinds run, exam-armed: the three junction hazards
 * reuse the lesson geometry verbatim (shared builders above); the braking
 * lead car is re-placed on the opening straight (hold s≈115 ≈ 25 m ahead of
 * spawn-4 at s≈90; slam at s≈150, ~90 m short of the stop line — recover,
 * then stop at the Б2) with NO ball visual (triggersHazard false: the brake
 * lights ARE the stimulus, as on a real exam); the dart-out fires at the
 * marked mid-block crossing n11364730203 on the long westbound straight.
 *
 * Exam decisions (documented):
 *  - preDriveMode "assess": the procedure is graded in exam-strict order
 *    from the first action — it IS how the real exam starts.
 *  - NO requireRedMet on the lights: the exam takes signal phases as they
 *    come; forcing a met red is a training gate (L2), not exam protocol.
 *  - objective titles ARE the examiner's instructions (route guidance is off
 *    in exam mode — the student navigates by instruction, doc 32 style).
 *  - unlockAfterLessonId "l2-intersections": by L2 the student has proven
 *    moving off + stop/priority discipline — the minimum to attempt a session
 *    that terminates on any опасна. Earlier = demoralizing insta-fail;
 *    later = the product promise gated behind the whole curriculum. Change
 *    the field to re-gate.
 */
export const EXAM_LESSON: LessonSpec = {
  id: "lex-exam-1",
  order: 100, // out of the linear curriculum — never unlocks by order
  titleBg: "Пробен практически изпит",
  descriptionBg:
    "Пълна репетиция на изпита: строга подготовка преди потегляне, маршрут от около 2,5 км без подсказки и оценяване по официалната система от първата секунда. Опасна грешка, произшествие или превишен лимит прекратяват изпита незабавно.",
  conceptIds: [
    "c-pre-drive-check",
    "c-priority-concept",
    "c-give-way-stop-behavior",
    "c-light-junction",
    "c-roundabout-rules",
    "c-crosswalk-yield",
    "c-braking-distance",
    "c-speed-adaptation",
    "c-reversing",
    "c-maneuver-principles",
  ],
  spawn: { pointId: "spawn-4" },
  preDrive: true,
  preDriveMode: "assess",
  // vehicleStart absent = cold (engine off, P, parking brake on — A1 policy).
  examMode: true,
  unlockAfterLessonId: "l2-intersections",
  parkingBay: L7_PARKING_BAY,
  stagedEvents: [
    {
      // Opening-straight emergency: the lead car waits ~25 m ahead of
      // spawn-4 on the northbound oneway (e226063192.0 → e897608662.0),
      // matches the candidate's speed, then brake-slams at (386.3, −28) —
      // s≈150, ~60 m past spawn, ~90 m before the Б2 stop line, ON the
      // authored path (verified against the edge geometry). After the beat
      // it drives on and turns WEST at the T n331942490 (e904964433.1),
      // off the exam route (the candidate turns east).
      id: "ex-braking-lead",
      kind: "brakingLeadCar",
      libraryEventId: "ev-emergency-braking",
      actor: {
        pathNodes: ["n415950074", "n331942486", "n331942490", "n2349242518"],
        hold: { nodeIndex: 0, offsetM: 115 },
        cruiseSpeedMps: 10,
        colorIndex: 3,
      },
      followGapM: 22,
      maxMatchSpeedMps: 13.9, // 50 km/h — urban limit of the street
      slamAt: { x: 386.3, y: -28.0 },
      slamRadiusM: 7,
      slamDecelMps2: 7.5,
      minSlamSpeedKmh: 25,
      proximityFallbackM: 30,
      triggersHazard: false, // no ball — brake lights are the exam stimulus
      resumeAfterSec: 4,
    },
    // The three junction hazards — lesson geometry verbatim (builders above).
    priorityFromRightAtB2("ex-priority-from-right"),
    cyclistRightHookAtT("ex-cyclist-right-hook"),
    roundaboutEntryConflict("ex-roundabout-conflict"),
    {
      // Mid-block dart-out at the marked crossing n11364730203 on the long
      // westbound straight (edge e35467616.0, 2 scaled lanes, tangent
      // ≈ (−0.9913, 0.1314) at the crossing vertex). Same derivation as L4:
      // curb start = crossing + 9.725 m to the player's RIGHT (north curb,
      // right = (0.1314, 0.9913)); the dart runs south across the full
      // carriageway (2·8.125 curb-to-curb inside a 23.5 m walk). Crossing
      // occupancy feeds the existing PEDESTRIAN_* detectors unchanged.
      id: "ex-ped-dart-out",
      kind: "pedestrianDartOut",
      libraryEventId: "ev-ped-crossing-marked",
      crossingId: "n11364730203",
      crossing: { x: 105.28, y: -391.54 },
      start: { x: 106.56, y: -381.9 },
      dir: { x: -0.1314, y: -0.9913 },
      speedMps: 2.9,
      travelM: 23.5,
      roadFromM: 1.2,
      roadToM: 18.25,
      triggerDistM: 34,
      minTriggerSpeedKmh: 20,
    },
  ],
  objectives: [
    {
      id: "ex-stop-b2",
      titleBg: "Потегли направо. На знака „Спри!“ спри напълно",
      kind: "passSignal",
      params: {
        nodeId: "n331942490",
        x: 383.17,
        y: 65.76,
        radiusM: 30,
        control: "stopSign",
      },
    },
    {
      id: "ex-signal-1",
      titleBg: "След стопа завий надясно, после наляво по булеварда — премини светофара",
      kind: "passSignal",
      params: {
        nodeId: "n1805512602",
        x: 430.13,
        y: 235.3,
        // 30 → 40, the same junction and the same measurement as l2-signal-1
        // above — this is the EXAM copy of it, and it was uncompletable for
        // exactly as long. See that comment for the driven numbers.
        radiusM: 40,
        control: "trafficLight",
      },
    },
    {
      id: "ex-signal-2",
      titleBg: "Продължи направо през следващия светофар",
      kind: "passSignal",
      params: {
        nodeId: "n5997970086",
        x: 421.91,
        y: 275.44,
        radiusM: 30,
        control: "trafficLight",
        // No requireRedMet — see the exam-decisions note above.
      },
    },
    {
      // Southbound-carriageway checkpoint n6294440269 — reachable only after
      // the block turnaround (sequential objectives make the northbound pass
      // 17 m east irrelevant: this activates after the light-2 crossing).
      id: "ex-turnaround",
      titleBg: "Веднага след светофара завий наляво по „Проф. Марко Семов“ и се върни по булеварда на юг",
      kind: "reachZone",
      params: { x: 427.0, y: 159.0, radiusM: 18 },
    },
    {
      // West of the right turn at the signalized n179974491 — the 4-way
      // n348207502 confirms the candidate is westbound on „Брадистилов".
      id: "ex-turn-bradistilov",
      titleBg: "В края на булеварда завий надясно по „Проф. Георги Брадистилов“",
      kind: "reachZone",
      params: { x: 389.21, y: -271.99, radiusM: 20 },
    },
    {
      // Midpoint of the 131 m „Боровски" straight (241,−271)→(229,−402).
      id: "ex-turn-borovski",
      titleBg: "На кръстовището завий наляво по „Проф. Борис Боровски“",
      kind: "reachZone",
      params: { x: 234.5, y: -336.5, radiusM: 16 },
    },
    {
      // n6805916117 — 61 m west of the T (the cyclist right-hook corner).
      id: "ex-turn-west",
      titleBg: "На Т-образното кръстовище завий надясно, на запад",
      kind: "reachZone",
      params: { x: 168.43, y: -396.7, radiusM: 16 },
    },
    {
      // rb-1 approach — same zone as L3 (the dart-out fires on this leg).
      id: "ex-roundabout-approach",
      titleBg: "Продължи направо до кръговото кръстовище",
      kind: "reachZone",
      params: { x: -38.03, y: -342.96, radiusM: 60 },
    },
    {
      // The roundabout is the route's turnaround: enter the SE mouth, ~5/6
      // around, exit east onto „Баку" — right indicator required in the exit
      // window (A10 evaluator); an unsignaled exit voids the traversal.
      id: "ex-roundabout",
      titleBg: "На кръговото се върни в обратна посока — излез на изток с десен мигач",
      kind: "completeManeuver",
      params: {
        maneuver: "roundabout",
        x: -38.03,
        y: -342.96,
        enterRadiusM: 26,
        exitRadiusM: 45,
      },
    },
    {
      // Same mid-„Боровски" zone as ex-turn-borovski, now northbound —
      // sequential activation (post-roundabout) keeps the passes apart.
      id: "ex-return-borovski",
      titleBg: "Върни се на изток и на Т-образното кръстовище завий наляво, на север",
      kind: "reachZone",
      params: { x: 234.5, y: -336.5, radiusM: 16 },
    },
    {
      id: "ex-return-bradistilov",
      titleBg: "Завий надясно по „Проф. Георги Брадистилов“ и карай направо, на изток",
      kind: "reachZone",
      params: { x: 389.21, y: -271.99, radiusM: 20 },
    },
    {
      // spawn-1's arc on „Трайко Станоев" — 62 m before the painted bay.
      id: "ex-street-stanoev",
      titleBg: "Премини направо през светофара и продължи по „Трайко Станоев“",
      kind: "reachZone",
      params: { x: 620.96, y: -215.89, radiusM: 20 },
    },
    {
      id: "ex-park",
      titleBg: "Паркирай на заден ход в очертаното място вдясно и спри напълно",
      kind: "completeManeuver",
      params: { maneuver: "parkInBay", holdSec: 1.5, bay: L7_PARKING_BAY },
    },
  ],
};

// ---------------------------------------------------------------------------
// ПОЛИГОН — „Учебна площадка" entries (map program doc 74, wave 1)
// ---------------------------------------------------------------------------

/**
 * The полигон's graded bay: PERPENDICULAR bay on the „Коридор за паркиране"
 * apron (edge pg-e-apron-bays — centerline x = 95, 2 service lanes → scaled
 * half-width 8.125 m). Center 3.5 m east of the centerline, axis EAST
 * (headingDeg 90) across the north-south corridor — the classic полигон
 * reverse-bay drill. Far edge 98.5 + 3.3 = 101.8 m < curb at 103.1 m, so the
 * paint stays on the carriageway. Same rect the prototype test paints —
 * single source for the world paint AND the graded rect (the L7 pattern).
 */
const L8_POLIGON_BAY: ParkingBaySpec = {
  x: 98.5,
  y: -70,
  headingDeg: 90,
  widthM: 3.0,
  lengthM: 6.6,
};

/** Полигон ambient traffic: an учебна площадка, not a boulevard — a couple
 *  of instructor cars and walkers. anchorRadiusM covers the whole 380 × 260 m
 *  ground (the city's 280 m default is anchored for a 1.6 km map). */
const POLIGON_TRAFFIC = { vehicleCount: 2, pedestrianCount: 2, anchorRadiusM: 400 } as const;

/**
 * Out-of-curriculum полигон entries — the A13 exam-card PATTERN, not new
 * machinery: they live outside LESSONS (the linear order-chain progression
 * never sees them, so every existing unlock/pinning invariant is untouched),
 * unlock via the same `unlockAfterLessonId` + isExamUnlocked gate the exam
 * card uses (absent field = always open), and resolve through lessonById for
 * the wire/grading path like any lesson. `order` here is ONLY a select-grid
 * sort key (0.5 / 1.5 slot the cards after L0 / L1); it deliberately stays
 * out of the contiguous 0..n curriculum chain.
 */
export const POLIGON_LESSONS: readonly LessonSpec[] = [
  {
    id: "l0p-poligon-free",
    order: 0.5, // grid slot right after L0 — free-drive cards lead the grid
    titleBg: "Полигон — свободно каране",
    descriptionBg:
      "Учебната площадка е само твоя: широки алеи, плавни завои и почти никакъв трафик. Свикни с колата на спокойствие, преди да излезеш в квартала — правилата важат и тук.",
    conceptIds: ["c-driver-obligations", "c-speed-adaptation", "c-maneuver-principles"],
    world: { districtId: "poligon-v1" },
    spawn: { pointId: "pg-spawn-1" }, // старт-стоп права
    preDrive: false,
    // Same acclimatization policy as L0: ready to roll (engine on, D).
    vehicleStart: "ready",
    traffic: POLIGON_TRAFFIC,
    objectives: [],
  },
  {
    id: "l8-poligon",
    order: 1.5, // grid slot right after L1 — площадката преди трафика
    titleBg: "Полигон — начални маневри",
    descriptionBg:
      "Първите маневри се учат на площадката, не в трафика: обиколи периметъра с плавни завои, паркирай на заден ход в очертаното място и спри меко на коридора.",
    conceptIds: [
      "c-pre-drive-check",
      "c-maneuver-principles",
      "c-reversing",
      "c-braking-distance",
      "c-mirrors-blind-spots",
    ],
    world: { districtId: "poligon-v1" },
    spawn: { pointId: "pg-spawn-1" }, // старт-стоп права, на изток
    preDrive: true,
    // Second rung of the Instruction→Practice→Assess ladder (doc 68 §5): the
    // student saw the guided procedure in L1; here it runs order-tolerant
    // with idle hints, not exam-strict ("assess" stays optional drill-up).
    preDriveMode: "practice",
    // vehicleStart absent = cold (A1 policy) — the полигон teaches the real
    // start ritual from the first hour.
    unlockAfterLessonId: "l1-preparation",
    parkingBay: L8_POLIGON_BAY,
    traffic: POLIGON_TRAFFIC,
    objectives: [
      {
        id: "l8-circuit",
        titleBg: "Обиколи полигона — измини 400 метра",
        kind: "driveDistance",
        params: { meters: 400 },
      },
      {
        id: "l8-park",
        titleBg: "Паркирай на заден ход в очертаното място",
        kind: "completeManeuver",
        // Bay-locked like L7: at rest inside the SAME painted rect, aligned,
        // via reverse (A10 evaluator defaults).
        params: { maneuver: "parkInBay", holdSec: 1.5, bay: L8_POLIGON_BAY },
      },
      {
        id: "l8-smooth-stop",
        titleBg: "Спри плавно на коридора за паркиране",
        kind: "completeManeuver",
        // The apron is a 20 km/h zone — arm the attempt from 15 km/h so the
        // drill is drivable without breaking the полигон limit.
        params: { maneuver: "smoothStop", minApproachKmh: 15, maxDecelMs2: 3.5 },
      },
    ],
  },
];

/**
 * Every lesson-authored painted parking bay (doc 68 A5) ON THE DEFAULT CITY
 * DISTRICT. The world builder paints these by default (buildWorldGeometry
 * `options.parkingBays` fallback) — same curriculum-drives-the-world pattern
 * as the L2 Б2 stop-sign placement (runtime/stoplines STOP_LINE_OVERRIDES →
 * world props). DATA ONLY, so the pure world builder can import it without
 * dragging in the lesson engine. The exam's bay IS L7's object, so the
 * curriculum list already covers it.
 *
 * Multi-map (doc 74 §5.4): the default MUST stay district-v1-only — полигон
 * bays must never paint onto the city and vice versa. Per-district paint sets
 * come from lessonParkingBaysFor(); LessonScene passes them explicitly.
 */
export const LESSON_PARKING_BAYS: readonly ParkingBaySpec[] = LESSONS.filter(
  (l) => lessonDistrictId(l) === DEFAULT_DISTRICT_ID,
).flatMap((l) => (l.parkingBay ? [l.parkingBay] : []));

/** Every playable spec: curriculum lessons + полигон entries + the A13 exam. */
const ALL_LESSONS: readonly LessonSpec[] = [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON];

/**
 * Lesson-authored bay paint for ONE district (doc 74 §5.4) — what the scene
 * hands buildWorldGeometry for the map it actually loaded. Union across every
 * curriculum + полигон spec on that district, so free drive on the полигон
 * still shows the drill bay, exactly like the city always shows L7's. The
 * exam is deliberately excluded: its bay IS L7's object (same rect, single
 * truth) and including it would paint the rect twice.
 */
export function lessonParkingBaysFor(districtId: string): readonly ParkingBaySpec[] {
  return [
    ...[...LESSONS, ...POLIGON_LESSONS]
      .filter((l) => lessonDistrictId(l) === districtId)
      .flatMap((l) => (l.parkingBay ? [l.parkingBay] : [])),
    // B1b: exam-bank bays live on the city district only. Painted always
    // (like L7's) so a drawn variant's bay is never an invisible rect;
    // examBankData is pure data (contracts-only imports), so no cycle.
    ...(districtId === DEFAULT_DISTRICT_ID ? EXAM_BANK_PARKING_BAYS : []),
  ];
}

/** Lookup by id — including the exam; undefined for unknown ids (wire input
 *  goes through this, so exam finishes grade server-side like any lesson). */
export function lessonById(id: string): LessonSpec | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

/** Curriculum lessons sorted by order (the exam entry is NOT in here — it
 *  has its own gated card on /simulator, not a select-grid slot). */
export function lessonsInOrder(): LessonSpec[] {
  return [...LESSONS].sort((a, b) => a.order - b.order);
}
