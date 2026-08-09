/**
 * scReels — authored drives (doc 76 §5/§9) for the 5 Half-B theory reels
 * (templates-reels.ts). One correct SHADOW + one MISTAKE demo each, recorded
 * through the production stack (recordScriptedDrive), ambient traffic zero.
 *
 * Grading facts the scripts obey (probed against the shipped config):
 *  - posted limit 50, gracedLimit = 55 (speedingGraceRatio 0.1); in rain the
 *    conditionLimit = 50 × 0.85 = 42.5, so a sustained 50 km/h (≥ 3 s,
 *    conditionsSpeedSustainSec) earns SPEED_TOO_FAST_FOR_CONDITIONS and NOT
 *    SPEEDING_OVER_LIMIT (50 ≤ 55). The rain shadow stays ≤ 40 (< 42.5).
 *  - COLLISION is an AUTHORED beat (DriveStep.collision) — the deterministic
 *    §9 seam the bus-pullout precedent uses; the visible object the beat
 *    depicts is district/staged scenery (the clip's R0 concern), the beat is
 *    the grade.
 *  - CROSSED_SOLID_LINE: the animal swerve crosses x = 0 inside ov-solid-v1's
 *    М1 span (y ∈ [90, 230]); the beat fires immediately after, before any
 *    keep-right / following episode can sustain.
 *  - WRONG_WAY: on lc-gantry-v1 the closed carriageway (x = −4) is a one-way
 *    SOUTH edge; driving NORTH on it ≥ 1.5 s (wrongWaySustainSec) convicts.
 */

import type { StagedEventSpec } from "../contracts";
import {
  SC_ACCIDENT_OWN_CONDUCT,
  SC_ANIMAL_HAZARD,
  SC_DRIVER_DISTRACTION,
  SC_LANE_CONTROL_SIGNAL,
  SC_SIGN_WARNING,
} from "../lessons/scenario/templates-reels";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

const LANE = 4.06; // right (travel) lane centre on the reused straight streets

// ===========================================================================
// 1. sc-sign-warning — ac-ice-v1 (rain). Ice span y ∈ [210, 300], finish 345.
//    The А15 „хлъзгав път" post stands at the span START (zoneSigns.ts places
//    one post per zone at `fromM`, kerb-right, scenario scale 1.5) — so the
//    sign line and the ice line are the SAME y, and every demo below authors
//    its conviction onto it. That is not decoration: the ice patch itself has
//    no visual (it is a grip zone, the surface renders identically), so the
//    post is the ONLY thing in the world that states this lesson.
// ===========================================================================

function signWarningShadow(): DriveScript {
  return {
    steps: [
      { kind: "headlights", setting: "low" }, // rain: къси светлини задължителни
      { kind: "annotation", textBg: "Вали. Знакът А15 предупреждава за хлъзгав участък напред — сваляме скоростта отрано." },
      { kind: "drive", points: [[LANE, 15], [LANE, 190]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред хлъзгавия участък отпускаме газта — сцеплението в дъжда е намалено." },
      { kind: "drive", points: [[LANE, 190], [LANE, 305]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Преминахме плавно, без резки движения — колата остана управляема." },
      { kind: "drive", points: [[LANE, 305], [LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/**
 * WHERE THE А15 POST ACTUALLY STANDS (world/builders/zoneSigns.ts places one
 * post per zone span at `zone.fromM`, on the kerb right of travel, at the
 * scenario "lesson-critical" scale 1.5). For ac-ice-v1 that is district
 * (8.925, 210) — pinned by value here and re-asserted against the committed
 * map by the reel gate.
 *
 * FOUNDER R0 („just a car moving forward … nothing showing from our side"):
 * the demo's whole subject is a SIGN, and the sign was never in the fault
 * frame. The clip window is [fault−8, fault+4] around the ENGINE fault time
 * and the camera is a chase cam, so anything BEHIND the ghost at the fault is
 * off-screen — and the previous staging convicted at y≈248, i.e. 38 m PAST
 * the post. The viewer got a wet straight with nothing in it.
 */
export const SIGN_WARNING_A15_Y = 210;

function signWarningMistake(): DriveScript {
  // THE FAULT MUST LAND ON THE SIGN. SPEED_TOO_FAST_FOR_CONDITIONS arms the
  // moment the rain envelope (50 × 0.85 = 42.5 km/h) is exceeded and convicts
  // after cfg.conditionsSpeedSustainSec = 3 s of it. From 42 km/h the script
  // accelerator (SCRIPT_ACCEL 2.2 m/s²) needs ~1 s to reach 50, so those 3 s
  // cover ≈ 41 m: opening the throttle at y ≈ 168 puts the conviction at the
  // А15 post itself. The post is then LARGE on the driver's right through the
  // whole run-up (8 s ≈ 110 m of approach) and still in frame at the ❌ —
  // which is the only way a sign lesson can read at all.
  //
  // Approaching UNDER 42.5 keeps the episode from arming early, so the fault
  // cannot drift back onto the plain wet straight; 50 stays ≤ the graced 55
  // so no SPEEDING_OVER_LIMIT leaks into the exact-code gate.
  return {
    steps: [
      { kind: "headlights", setting: "low" }, // rain: the fault is speed, not the lamps
      { kind: "annotation", textBg: "Грешка: знакът А15 предупреждава за хлъзгав участък, но водачът не намалява за него." },
      // Rain-prudent approach UNDER the conditions limit (42.5): nothing arms,
      // and the А15 post grows in frame ahead-right for the whole leg.
      { kind: "drive", points: [[LANE, 15], [LANE, 168]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред знака трябва да свали до 25–30 — вместо това натиска газта и влиза в участъка с 50." },
      // Throttle open at the sign's own approach → the ❌ lands AT the post.
      { kind: "drive", points: [[LANE, 168], [LANE, 216]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "На хлъзгавия участък при 50 сцеплението не стига — задницата поднася и колата излиза от платното." },
      // The run-off: a break to the right that stays INSIDE the ice span
      // (y 210–300) and carries the car over the kerb line (x > 8.9) onto the
      // verge — a visible departure from the carriageway, not a lane wobble.
      // It is timed to land at fault + ~2.5 s so the crash and the wreck pose
      // both sit INSIDE the [fault−8, fault+4] clip window (the old staging
      // put the impact on the window's very last frame).
      {
        kind: "drive",
        points: [[LANE, 216], [5.2, 224], [9.9, 242]],
        targetKmh: 46,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "staticObject" },
      // The accident-own-conduct precedent: a crash that costs no time reads
      // as no crash. The car stays where it ended up, off the road.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Скоростта се сваля ПРЕДИ хлъзгавия участък, не в него — там вече е късно." },
    ],
  };
}

function signWarningMistakeNoSlow(): DriveScript {
  // Same fault line as the crash demo — the conviction is authored onto the
  // А15 post (throttle open at y ≈ 168, 3 s of rain-envelope excess ≈ 41 m)
  // so this second demo frames the sign too. It simply gets away with it.
  return {
    steps: [
      { kind: "headlights", setting: "low" },
      { kind: "annotation", textBg: "Грешка (без произшествие): пак пълна скорост в дъжда през хлъзгавия участък." },
      { kind: "drive", points: [[LANE, 15], [LANE, 168]], targetKmh: 42, stopAtEnd: false },
      // 50 km/h from the sign's approach through the ice → the conditions
      // fault convicts at the post, then the demo rides the patch out.
      { kind: "drive", points: [[LANE, 168], [LANE, 300]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Този път се размина — но скоростта пак беше несъобразена с условията." },
      { kind: "drive", points: [[LANE, 300], [LANE, 345]], targetKmh: 35 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ===========================================================================
// 2. sc-driver-distraction — hz-obstacle-v1. Ped darts at y=140, finish 225.
// ===========================================================================

// The walker is released ~78 m out (DISTRACTION_PED.triggerDistM) and needs
// 5.65 s to walk into the travel lane at x = 4.06. Every drive below is timed
// against THAT clock, and the trigger is set so the MISTAKES arrive at y = 140
// while she is standing in their lane (x ≈ 4.0) — which is what makes the staged
// runner's own contact check fire: a real meeting of two bodies, not an authored
// beat over an empty road (founder R0).
//
// The shadow cannot land as tightly and the geometry says why: it has to BRAKE
// over the same 78 m, which costs ~1.7 s more than the mistakes' unbraked run,
// so she is ~4 m further across when it stops. Every lever trades one demo for
// the other (a slower walker needs a trigger longer than the 125 m of road that
// exists; a shorter trigger is the 34 m staging the founder rejected). The
// mistake — the demo the clip is cut from — is the one that must be exact.

function distractionShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гледаме пътя напред. Отляво може да излезе пешеходец — кракът е готов над спирачката." },
      // She steps off the kerb at y ≈ 62 — early, in plain sight. The attentive
      // driver lifts THERE, not 20 m from her.
      { kind: "drive", points: [[LANE, 15], [LANE, 92]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът тръгва да пресича — виждаме го навреме и спираме преди него." },
      // Brake to a full stop 9 m short of her line. She walks across this lane
      // at t ≈ 12.5, in front of the braking car, and is at the far edge of the
      // carriageway (x ≈ 7.7) when it comes to rest at t ≈ 14.0 — the car waits
      // FOR SOMEONE, which is the whole point of the correct demo. The wait is
      // 2.2 s, not 4: a stopped car left idling after she has stepped onto the
      // pavement is the founder's „stopped for nothing" read all over again.
      { kind: "drive", points: [[LANE, 92], [LANE, 131]], targetKmh: 45, stopAtEnd: true },
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "annotation", textBg: "Пропуснахме го и продължаваме спокойно." },
      { kind: "drive", points: [[LANE, 131], [LANE, 225]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

function distractionMistake(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: погледът на водача е настрани — към телефона." },
      { kind: "drive", points: [[LANE, 15], [LANE, 128]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът вече е на платното — а водачът още гледа встрани." },
      // No lift: the distracted driver reaches the walker at full speed, and she
      // is standing IN this lane by then — the runner's contact check convicts.
      { kind: "drive", points: [[LANE, 128], [LANE, 140]], targetKmh: 50, stopAtEnd: false },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Един поглед встрани при 50 км/ч е около 14 метра слепешком — точно колкото да не спреш навреме." },
    ],
  };
}

function distractionMistakeNoBrake(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: погледът изобщо не се вдига — водачът не докосва спирачката." },
      { kind: "drive", points: [[LANE, 15], [LANE, 132]], targetKmh: 50, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 132], [LANE, 140]], targetKmh: 50, stopAtEnd: false },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Пълна скорост право в пешеходеца — нула реакция." },
    ],
  };
}

// ===========================================================================
// 3. sc-accident-own-conduct — hz-obstacle-v1. Parked car ~(6.5,150), finish 225.
// ===========================================================================

function accidentShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Отпред вдясно има паркиран автомобил. Заобикаляме го плавно, без да го закачаме." },
      { kind: "drive", points: [[LANE, 15], [LANE, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 120], [2.2, 150]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Минахме встрани от него, без контакт." },
      { kind: "drive", points: [[2.2, 150], [LANE, 190]], targetKmh: 35, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 190], [LANE, 225]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// THE IMPACT LINE (founder R0: „the shadow car is moving going through some
// stopped car and continuing"). The parked body sits at x = 6.4 (scenery props
// „sc-accident-own-conduct"), so its LEFT flank is ≈ 5.5; the hero's right flank
// is x + 0.85. The old scripts drove to x = 5.7 — right flank 6.55, i.e. a metre
// INSIDE the other car's body, which renders as driving THROUGH it. x = 5.0
// puts the flanks ≈ 0.35 m into each other: a sideswipe you can see, not a
// ghost pass. And after the beat the car actually STOPS — a hit that costs no
// time reads as no hit at all.
const IMPACT_X = 5.0;
// …and it must stop BESIDE the body, not short of it. The parked car is centred
// at y = 149 (half-length ≈ 2.2), so ending the impact leg at its own y leaves
// the two cars flank-to-flank at rest — the pose a viewer reads as „he hit it".
// Ending at y = 146 (the first pass at this fix) only clipped its rear corner
// and then parked a car-length behind it, which reads as a near-miss.
const IMPACT_Y = 149;

function accidentMistake(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът не следи вдясно и закача паркирания автомобил." },
      { kind: "drive", points: [[LANE, 15], [LANE, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 120], [IMPACT_X, IMPACT_Y]], targetKmh: 38, stopAtEnd: false },
      { kind: "collision", withWhat: "staticObject" },
      // The stoppage the impact really costs — the car sits against the body it
      // struck long enough for the viewer to read the contact.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Има удар — това е ПТП с негово участие. Дългът е да спре, да включи аварийни, да обезопаси и да остане." },
      // The fault: instead of staying, he drives on (fled scene — a debrief
      // teach-beat, not a live detector; the COLLISION is the graded code).
      { kind: "annotation", textBg: "Вместо това потегля и напуска мястото." },
      { kind: "drive", points: [[IMPACT_X, IMPACT_Y], [LANE, 185]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 185], [LANE, 225]], targetKmh: 42 },
      { kind: "pause", sec: 1, brake: true },
      {
        kind: "annotation",
        textBg:
          "Последиците: напускането на място на ПТП отнема книжката за години и се разследва като престъпление, ако има пострадал; застраховката не плаща и щетата остава лична. След удар се спира винаги.",
      },
    ],
  };
}

function accidentMistakeClipContinue(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: леко закачане на паркирания автомобил — а водачът решава, че „няма нищо“." },
      { kind: "drive", points: [[LANE, 15], [LANE, 122]], targetKmh: 38, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 122], [IMPACT_X, IMPACT_Y]], targetKmh: 36, stopAtEnd: false },
      { kind: "collision", withWhat: "staticObject" },
      // A shorter halt: he DOES feel it and stops — and then talks himself out
      // of it. That hesitation is the beat the lesson needs to be visible.
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "Усети допира, спря за миг… и реши, че „няма нищо“." },
      { kind: "drive", points: [[IMPACT_X, IMPACT_Y], [LANE, 185]], targetKmh: 38, stopAtEnd: false },
      { kind: "drive", points: [[LANE, 185], [LANE, 225]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дори одраскване е ПТП: задължението да спреш не зависи от силата на удара, а последицата от бягството е същата — отнета книжка и лично платена щета.",
      },
    ],
  };
}

// ===========================================================================
// 4. sc-animal-hazard — ov-solid-v1. М1 span y ∈ [90, 230]; swerve at y≈150.
// ===========================================================================

function animalShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Осевата линия е непрекъсната. Ако нещо изскочи, спираме право в лентата си." },
      { kind: "drive", points: [[LANE, 15], [LANE, 120]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Животно изскача на пътя — спираме решително, право напред." },
      { kind: "drive", points: [[LANE, 120], [LANE, 150]], targetKmh: 8, stopAtEnd: true },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Животното премина. Не сме пресекли линията и не сме влезли в насрещното." },
      { kind: "drive", points: [[LANE, 150], [LANE, 325]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

function animalMistake(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: при животното водачът рязко отбива наляво — през непрекъснатата осева линия." },
      { kind: "drive", points: [[LANE, 15], [LANE, 132]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Волан наляво, през линията — право в насрещната лента." },
      // Cross x=0 inside the solid span (y∈[90,230]) → CROSSED_SOLID_LINE.
      { kind: "drive", points: [[LANE, 132], [-4, 158]], targetKmh: 42, stopAtEnd: false },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Насреща идваше кола. Правилото е обратното: спира се право — ударът с животно е по-малкото зло от челен сблъсък." },
    ],
  };
}

function animalMistakeCrossLine(): DriveScript {
  // THE CROSSING MOVED 100→118 ⇒ 132→158 ON 2026-08-09, AND THE OLD COMMENT
  // HERE ("the oncoming stream is far north, so no head-on this time") WAS
  // MEASURABLY FALSE.
  // ---------------------------------------------------------------------
  // This demo's entire lesson is „Насрещното беше чисто — и пак е забранено":
  // М1 is unconditional. Nothing could check the premise, because the
  // overtake corridor was disarmed inside М1 spans (worldRuntime's
  // `solidCenterLine !== true` clause, removed the same day). The first run
  // with the corridor armed measured, on this exact recording:
  //
  //   crossing at y=100→118  →  a real oncoming car at gapSec 2.39 (t 12.20)
  //   crossing at y=110→128  →  an emergent COLLISION at t 13.40
  //   crossing at y=132→158  →  corridor SILENT, CROSSED_SOLID_LINE alone
  //   crossing at y≥126 … 205 →  corridor silent throughout
  //
  // So the shipped demo told the student the road was clear while driving
  // within 2.4 s — and ten metres of authoring — of a head-on. The repair is
  // to make the WORLD match the copy rather than the copy match the world:
  // the crossing now happens AT the animal (y 132→158 — the same beat and the
  // same geometry as the m0 swerve, which is the pedagogy: the two demos are
  // one decision apart), in the window the recording is genuinely empty. The
  // graded codeRef is unchanged (`CROSSED_SOLID_LINE` alone) — it is now true
  // because the road is clear, not because nothing was watching.
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка (без удар): водачът пак пресича непрекъснатата осева линия, за да заобиколи животното." },
      { kind: "drive", points: [[LANE, 15], [LANE, 132]], targetKmh: 42, stopAtEnd: false },
      // Cross x=0 inside the solid span (y∈[90,230]) → CROSSED_SOLID_LINE, at
      // the animal beat and in the MEASURED clear window (see above).
      { kind: "drive", points: [[LANE, 132], [-4, 158]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[-4, 158], [LANE, 190]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещното беше чисто — но пресичането на М1 е забранено при всякакви условия." },
      { kind: "drive", points: [[LANE, 190], [LANE, 325]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ===========================================================================
// 5. sc-lane-control-signal — lc-gantry-v1. Open x=+6 (N), closed x=−6 (S).
// ===========================================================================

function laneControlMistakeWrongWay(): DriveScript {
  // Wrong-way in the closed lane, but NO head-on this time: the ego drives
  // NORTH on the closed (south) carriageway a short way — enough to sustain
  // WRONG_WAY (≥ 1.5 s) — then stops before reaching the oncoming bank.
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка (без сблъсък): водачът кара на север в затворената (насрещна) лента." },
      // Stop well SOUTH of the oncoming bank (it is driving down from y≈210) so
      // the fault is the wrong-way movement alone, no head-on. WRONG_WAY needs
      // only ≥ 1.5 s — 73 m at ~38 km/h is ≈ 7 s of it.
      { kind: "drive", points: [[-6, 15], [-6, 88]], targetKmh: 38, stopAtEnd: true },
      { kind: "annotation", textBg: "Това е движение срещу потока — самото навлизане в лента с червен X е нарушение." },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

function laneControlShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Зелена стрелка над нашата лента, червен X над лявата. Оставаме в отворената лента." },
      { kind: "drive", points: [[6, 15], [6, 200]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Минаваме под портала в правилната лента." },
      { kind: "drive", points: [[6, 200], [6, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

function laneControlMistake(): DriveScript {
  // The driver has ignored the red ✕ and is committed to the CLOSED carriageway
  // (x = −6, a one-way SOUTH edge) heading NORTH — the locator locks onto that
  // edge from the first frame, and driving against its flow ≥ 1.5 s grades
  // WRONG_WAY. (The locator's heading gate refuses to RELOCATE a northbound ego
  // onto a southbound edge while the open edge is within 30 m, so the wrong lane
  // is driven from the start, not swerved into mid-map — see the locator note.)
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът е навлязъл в затворената лента (червен X) — тя е насрещна, за движение на юг." },
      { kind: "drive", points: [[-6, 15], [-6, 205]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Кара на север в лента, отредена за юг — това е движение срещу потока." },
      { kind: "drive", points: [[-6, 205], [-6, 235]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Насреща, по правилната за тази лента посока, идва кола." },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Червеният X затваря лентата физически — тя често е насрещна. Кара се само в лентата със зелен сигнал." },
    ],
  };
}

// ===========================================================================
// Registry — the gate test + the clip pipeline iterate this.
// ===========================================================================

type ReelScripts = Record<string, { kind: "shadow" | "mistake"; script: () => DriveScript }>;

export interface ReelSpecEntry {
  id: string;
  districtId: string;
  /** [shadow, ...mistakes] in template order — the file basenames. */
  names: readonly string[];
  scripts: ReelScripts;
  staged: StagedEventSpec[];
  /** Extra per-drive record options (rain, obstacles…). */
  opts?: Partial<Pick<RecordScriptedDriveOptions, "rain">>;
}

export const REELS: readonly ReelSpecEntry[] = [
  {
    id: "sc-sign-warning",
    districtId: "ac-ice-v1",
    names: ["shadow-correct", "mistake-hold-speed", "mistake-no-slowdown"],
    scripts: {
      "shadow-correct": { kind: "shadow", script: signWarningShadow },
      "mistake-hold-speed": { kind: "mistake", script: signWarningMistake },
      "mistake-no-slowdown": { kind: "mistake", script: signWarningMistakeNoSlow },
    },
    staged: [...(SC_SIGN_WARNING.staged ?? [])] as StagedEventSpec[],
    opts: { rain: true },
  },
  {
    id: "sc-driver-distraction",
    districtId: "hz-obstacle-v1",
    names: ["shadow-correct", "mistake-late-react", "mistake-no-brake"],
    scripts: {
      "shadow-correct": { kind: "shadow", script: distractionShadow },
      "mistake-late-react": { kind: "mistake", script: distractionMistake },
      "mistake-no-brake": { kind: "mistake", script: distractionMistakeNoBrake },
    },
    staged: [...(SC_DRIVER_DISTRACTION.staged ?? [])] as StagedEventSpec[],
  },
  {
    id: "sc-accident-own-conduct",
    districtId: "hz-obstacle-v1",
    names: ["shadow-correct", "mistake-hit-and-flee", "mistake-clip-continue"],
    scripts: {
      "shadow-correct": { kind: "shadow", script: accidentShadow },
      "mistake-hit-and-flee": { kind: "mistake", script: accidentMistake },
      "mistake-clip-continue": { kind: "mistake", script: accidentMistakeClipContinue },
    },
    staged: [...(SC_ACCIDENT_OWN_CONDUCT.staged ?? [])] as StagedEventSpec[],
  },
  {
    id: "sc-animal-hazard",
    districtId: "ov-solid-v1",
    names: ["shadow-correct", "mistake-swerve-oncoming", "mistake-cross-line"],
    scripts: {
      "shadow-correct": { kind: "shadow", script: animalShadow },
      "mistake-swerve-oncoming": { kind: "mistake", script: animalMistake },
      "mistake-cross-line": { kind: "mistake", script: animalMistakeCrossLine },
    },
    staged: [...(SC_ANIMAL_HAZARD.staged ?? [])] as StagedEventSpec[],
  },
  {
    id: "sc-lane-control-signal",
    districtId: "lc-gantry-v1",
    names: ["shadow-correct", "mistake-closed-lane", "mistake-wrong-way"],
    scripts: {
      "shadow-correct": { kind: "shadow", script: laneControlShadow },
      "mistake-closed-lane": { kind: "mistake", script: laneControlMistake },
      "mistake-wrong-way": { kind: "mistake", script: laneControlMistakeWrongWay },
    },
    staged: [...(SC_LANE_CONTROL_SIGNAL.staged ?? [])] as StagedEventSpec[],
  },
];

const REEL_BY_ID = new Map(REELS.map((r) => [r.id, r]));

/**
 * CLIP-only oncoming re-staging (doc 66 R1 „конфликтният актьор в кадъра при
 * грешката"; the sc-follow-distance precedent). The two head-on reel clips (m0)
 * grade on an EGO-only fault — CROSSED_SOLID_LINE (sc-animal-hazard) and
 * WRONG_WAY (sc-lane-control-signal) — that fires while the template's oncoming
 * stream is still far off, so R0/R1 saw an empty frame. The RECORDING keeps the
 * far stream on purpose (the SECOND, no-head-on mistake of each reel shares the
 * staged spec and must stay collision-free), so this repositions the stream FOR
 * THE CLIP ONLY: clip-capture's loadRun applies it; the recorder and the rule
 * grading are untouched (single source of truth — the template's own actor,
 * only its hold arc moves).
 *
 *  - sc-animal-hazard m0: the head car reaches ≈ y 163 (~11 m ahead) as the ego
 *    crosses the М1 line at the fault (13.98 s) — the oncoming car the swerve
 *    meets, nose-to-nose at the collision beat.
 *  - sc-lane-control-signal m0: two cars bear down the X-closed carriageway
 *    ≈ 54 / 104 m ahead at the WRONG_WAY fault (2.13 s), in the chase frame.
 */
const REEL_CLIP_ONCOMING_OFFSET_M: Readonly<Record<string, number>> = {
  "sc-animal-hazard": 66,
  "sc-lane-control-signal": 285,
};

export function reelClipStaged(templateId: string, mistakeIndex: number): StagedEventSpec[] | null {
  if (mistakeIndex !== 0) return null;
  const offsetM = REEL_CLIP_ONCOMING_OFFSET_M[templateId];
  const reel = REEL_BY_ID.get(templateId);
  if (offsetM === undefined || !reel) return null;
  return reel.staged.map((e) =>
    e.kind === "oncomingStream"
      ? { ...e, actor: { ...e.actor, hold: { ...e.actor.hold, offsetM } } }
      : e,
  );
}

/** Record one reel drive (shadow / mistake) against a loaded district doc. */
export function recordReelDrive(
  scenarioId: string,
  name: string,
  districtRaw: unknown,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const reel = REEL_BY_ID.get(scenarioId);
  if (!reel) throw new Error(`recordReelDrive: unknown reel ${scenarioId}`);
  const entry = reel.scripts[name];
  if (!entry) throw new Error(`recordReelDrive: unknown drive ${scenarioId}/${name}`);
  return recordScriptedDrive(districtRaw, entry.script(), {
    scenarioId,
    kind: entry.kind,
    seed: 7,
    stagedEvents: reel.staged,
    ...(reel.opts ?? {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
