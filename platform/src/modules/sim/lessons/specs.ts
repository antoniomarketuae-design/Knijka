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
 *  - L5/L7: the emergencyStop and parkInBay maneuvers are COORDINATE-FREE (like
 *    L1's smoothStop) — they read only speed/gear from SimTick, so they need no
 *    world geometry. The RENDER side is now authored here (doc 68 A5): L5
 *    carries a `hazard` ball-dart-out stimulus (TrafficLayer draws/animates it;
 *    the A8 orchestrator will own the trigger) and L7 carries a `parkingBay`
 *    rect (the world markings builder paints it via LESSON_PARKING_BAYS).
 *    Scoring stays geometry-independent until A10 hardens the objectives.
 *  - L6: environment.timeOfDay "night" flips SimTick.isNight, so the rule engine
 *    expects headlights on (HEADLIGHTS_OFF_AT_NIGHT). The world must render
 *    night lighting and set isNight on every tick for this lesson.
 */

import type { LessonSpec, ParkingBaySpec } from "../contracts";

export const LESSONS: readonly LessonSpec[] = [
  {
    id: "l0-free-drive",
    order: 0,
    titleBg: "Свободно каране",
    descriptionBg:
      "Опознай квартала без задачи и без напрежение. Правилата обаче важат: инструкторът следи всяко нарушение и всяка добра практика в реално време.",
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
          radiusM: 30,
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
        // Reach ≥ 40 km/h, then brake firmly (peak ≥ 5 m/s² ≈ 0.5 g) to a halt.
        params: { maneuver: "emergencyStop", minApproachKmh: 40, minDecelMs2: 5 },
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
    parkingBay: { x: 681.26, y: -199.54, headingDeg: 67.3, widthM: 3.0, lengthM: 6.6 },
    objectives: [
      {
        id: "l7-approach",
        titleBg: "Придвижи се към мястото за паркиране",
        kind: "driveDistance",
        params: { meters: 50 },
      },
      {
        id: "l7-park",
        titleBg: "Паркирай на заден ход и спри напълно",
        kind: "completeManeuver",
        params: { maneuver: "parkInBay", holdSec: 1.5 },
      },
    ],
  },
];

/**
 * Every lesson-authored painted parking bay (doc 68 A5). The world builder
 * paints these by default (buildWorldGeometry `options.parkingBays` fallback)
 * — same curriculum-drives-the-world pattern as the L2 Б2 stop-sign placement
 * (runtime/stoplines STOP_LINE_OVERRIDES → world props). DATA ONLY, so the
 * pure world builder can import it without dragging in the lesson engine.
 */
export const LESSON_PARKING_BAYS: readonly ParkingBaySpec[] = LESSONS.flatMap((l) =>
  l.parkingBay ? [l.parkingBay] : [],
);

/** Lookup by id; undefined for unknown ids (wire input goes through this). */
export function lessonById(id: string): LessonSpec | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Lessons sorted by curriculum order (LESSONS is already ordered; be safe). */
export function lessonsInOrder(): LessonSpec[] {
  return [...LESSONS].sort((a, b) => a.order - b.order);
}
