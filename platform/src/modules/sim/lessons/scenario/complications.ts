/**
 * THE COMPLICATION KIT — reusable, authored rung additions (doc 76 §7; the
 * founder's review line 214: *„we need major reworks on all 150 L5-L4-L3-L2s
 * CURRENTLY I'M REVIEWING L1s"*).
 *
 * WHY A KIT AND NOT 92 HAND-WRITTEN RUNGS. Measured on 2026-08-02 across the
 * 167 shipped templates: 92 author no L5 at all, `spec.traffic` exists on
 * exactly one, and `DEFAULT_LEVEL_TOLERANCE` is a flat 1.0 from L3 up — so the
 * ladder above L3 had nothing to scale and nothing to add. The missing piece
 * was never per-template prose; it was the four or five MECHANISMS that make a
 * drill harder in a way that teaches:
 *
 *   мокър паваж   — сцеплението пада, спирачният път расте ~1,4 пъти
 *   нощ           — караш по снопа на фаровете, не по пътя (~40 м на къси)
 *   мъгла         — видимостта СТАВА ограничението за скоростта
 *   по-натоварена улица — чакаш истинска пролука, а не „твой ред"
 *   по-строга мярка — същата маневра, но от първия път
 *
 * Each mechanism is ONE piece of driving physics or law, so it is authored
 * ONCE, here, at full instructor quality — and every template that opts in
 * gets that quality instead of a line somebody wrote at 2 a.m. for the
 * ninetieth time. The mechanism is what the rung adds; the map is what the
 * template already teaches. Nothing here invents map content: no recipe stages
 * an actor, moves a waypoint or touches a district, because the compiler
 * cannot see whether a boulevard drill has anywhere to put a car.
 *
 * TWO NON-NEGOTIABLES, both enforced by `__tests__/level-complication.test.ts`:
 *  · every recipe's `complication.adds` is checked against the COMPILED
 *    difference from the rung below — copy that promises rain on a dry rung
 *    fails, and no amount of writing satisfies it;
 *  · every recipe whose environment sets night/rain/fog NAMES светлини/фарове
 *    in its `coachBg`, because that string is compiled into
 *    `LessonSpec.briefingBg` — the field `LessonPlayShell` renders AND the
 *    field `world/referents.ts` L10 reads. A lamp duty is stated to the
 *    student in the same breath it becomes gradeable, or not at all.
 *
 * ADR-002: every citation is retrieval from the catalog's own corpus — ЗДвП
 * чл. 20, ал. 2 (скоростта се съобразява с условията) and ЗДвП чл. 70
 * (светлините при тъмнина и намалена видимост) are the two articles the
 * conditions family already teaches under.
 */

import type { LevelSpec, RubricSpec, ScenarioLevel } from "./types";

/**
 * МОКЪР ПАВАЖ — the rendered rain AND the grip that goes with it.
 *
 * The one complication that changes the car rather than the picture:
 * `physics.wetGrip` runs the student's own vehicle at the wet grip factor
 * (~1.4× braking distance, reduced cornering grip — vehicle/tuning.ts), which
 * is why this rung teaches something no dry rung can. Every dry-tuned habit
 * the student built on L1–L4 — the point where the foot goes down, the gap
 * that felt enough — is now measurably wrong, and the drill is the same drill,
 * so the ONLY variable is the road.
 *
 * Safe by construction on any map: weather and grip are properties of the sky
 * and the tyres, never of the district, and the waypoint gates are untouched
 * (params.ts widens, never shrinks). A wet rung is harder to drive WELL and
 * exactly as possible to FINISH.
 */
export function l5Wet(level: ScenarioLevel = 5): LevelSpec {
  return {
    level,
    conditions: { weather: "rain" },
    physics: { wetGrip: true },
    complication: {
      adds: ["weather", "grip"],
      titleBg: "Мокър паваж",
      coachBg:
        "Същото упражнение, но вали и настилката държи около 70% от сухото сцепление — спирачният път става около 1,4 пъти по-дълъг, а гумите поднасят по-рано в завой. Още преди да потеглиш, включи късите светлини и чистачките; после карай с 10–20 км/ч под това, което би карал на сухо, вдигай газта по-рано и удвои дистанцията отпред. Спирай плавно и рано: сухият навик за „точката на спирачката“ тук закъснява с няколко метра — точно колкото е броня до броня.",
      lawRef: "ЗДвП чл. 20, ал. 2; чл. 70",
    },
  };
}

/**
 * МОКЪР ПАВАЖ върху вече мокра сцена — the grip half alone.
 *
 * For a template whose BASE conditions already render rain: L1–L4 have been
 * looking wet while the car drove on dry tyres (the 4a note on
 * ScenarioSpec.physics — shipped weather lessons were tuned against dry
 * physics, so the rain was render-only). This rung is where the road finally
 * behaves like it looks, and that is a real, teachable addition: the picture
 * did not change, the stopping distance did.
 */
export function l5WetGrip(level: ScenarioLevel = 5): LevelSpec {
  return {
    level,
    physics: { wetGrip: true },
    complication: {
      adds: ["grip"],
      titleBg: "Мокрият паваж вече е истински",
      coachBg:
        "Дъждът е същият, но сега пътят държи колкото наистина държи мокър асфалт — около 70% от сухото сцепление, значи около 1,4 пъти по-дълъг спирачен път и по-ранно поднасяне в завой. Карай по-бавно, отколкото ти се струва нужно, вдигни газта по-рано и остави двойна дистанция; светлините и чистачките остават включени през цялото упражнение. Тук не се иска нищо ново — иска се същото, направено с по-голям запас.",
      lawRef: "ЗДвП чл. 20, ал. 2",
    },
  };
}

/**
 * НОЩ — the sight-distance complication.
 *
 * Dipped beam shows ~40 m, so the driver's real speed limit stops being the
 * plate and becomes the beam: everything past it is unlit road in which a
 * pedestrian in dark clothes stands exactly as comfortably as an empty lane.
 * The same drill, driven inside a 40-metre world, is the cheapest honest way
 * to teach „не изпреварвай собствените си фарове" — and it is the condition in
 * which the country's pedestrian deaths actually happen.
 *
 * Render-only by design: night touches no physics (the 4a discipline), so
 * nothing about the car changes — only how much of the road exists.
 */
export function l5Night(level: ScenarioLevel = 5): LevelSpec {
  return {
    level,
    conditions: { night: true },
    complication: {
      adds: ["weather"],
      titleBg: "По тъмно",
      coachBg:
        "Същият маршрут, но нощем: включи късите светлини още преди да потеглиш и помни, че оттук нататък не караш по пътя, а по снопа на фаровете — къси светлини показват около 40 метра, и всичко отвъд тях е тъмнина, в която еднакво спокойно стои пешеходец в тъмни дрехи. Карай със скорост, от която можеш да спреш ВЪТРЕ в осветеното, гледай в десния край на платното, когато те заслепят, и не разчитай, че ще видиш препятствието толкова рано, колкото го виждаше денем.",
      lawRef: "ЗДвП чл. 70; чл. 20, ал. 2",
    },
  };
}

/**
 * МЪГЛА — the complication where visibility itself becomes the speed limit.
 *
 * Distinct from night on purpose: at night the beam is short but the picture
 * is sharp, in fog the picture dissolves and high beam makes it WORSE (the
 * wall of reflected light). The teaching is a rule of thumb the student can
 * carry out of the sim — drive slowly enough to stop inside what you can see —
 * plus the one lamp mistake everybody makes.
 */
export function l5Fog(level: ScenarioLevel = 5): LevelSpec {
  return {
    level,
    conditions: { weather: "fog" },
    complication: {
      adds: ["weather"],
      titleBg: "В мъгла",
      coachBg:
        "Същото упражнение в мъгла: включи късите светлини (и задните за мъгла, ако видимостта падне под 50 метра) — дългите НЕ помагат, отразяват се в капките и правят стената пред теб още по-плътна. Карай толкова бавно, че да можеш да спреш в рамките на това, което виждаш — видимостта, а не табелата, е ограничението тук — и не залепвай за задните светлини пред теб: те изглеждат по-далеч, отколкото са.",
      lawRef: "ЗДвП чл. 70; чл. 20, ал. 2",
    },
  };
}

/**
 * ПО-НАТОВАРЕНА УЛИЦА — the density complication.
 *
 * Only ever offered to the families whose subject IS other road users, and
 * only ever as a scale on a MEASURED baseline (SCENARIO_FAMILY_TRAFFIC_BASELINE
 * — junction and signals at 4, laddered to 6 at L5). His items 8/15/17/18 are
 * the whole reason: *„the traffic car is quite quick and its only 1 so by the
 * time I reach the crossroad it already has passed — should there be at least
 * 1 more that we have to wait"*. A yielding drill you can pass by arriving
 * late is not a yielding drill.
 *
 * `vehicleCount` is left to the family ladder unless a template's own street
 * needs a number; the roundabout family is deliberately excluded upstream
 * (measured gridlock — see the baseline table's doc).
 */
export function l5BusyStreet(vehicleCount?: number, level: ScenarioLevel = 5): LevelSpec {
  return {
    level,
    ...(vehicleCount === undefined ? {} : { traffic: { vehicleCount } }),
    complication: {
      adds: ["traffic"],
      titleBg: "По-натоварена улица",
      coachBg:
        "Улицата вече не е празна: по нея се движат и други коли, така че пролуката, която търсиш, трябва да е истинска, а не „мой ред е“. Гледай не първата кола, а втората — тя решава дали ще успееш — и ако се съмняваш, изчакай: изчакването струва секунди, а погрешната преценка струва предница. Тръгвай решително чак когато си сигурен, защото колебанието в средата на кръстовището е по-опасно от чакането пред него.",
      lawRef: "ЗДвП чл. 25",
    },
  };
}

/**
 * ПО-СТРОГА МЯРКА — the rubric complication: the same maneuver, judged the way
 * a examiner judges it.
 *
 * The only addition that costs the student nothing in danger and everything in
 * standard: the bay, the gates and the tolerances are untouched, but three
 * stars now mean „от първия път" instead of „накрая се получи". Doc 86 D7's
 * measured hole was that 128 of 154 rubrics were par-time only — informational
 * lines that could not vary — so a scenario's quality bar was the same at L5 as
 * at L1 by construction.
 *
 * Real-world justification, and it is not a technicality: a parallel park that
 * takes five shunts holds up a lane of traffic behind you, and Наредба № 38
 * counts repeated correction as a fault. Fewer, better movements IS the skill.
 */
export function l5TightManeuver(
  objectiveId: string,
  level: ScenarioLevel = 5,
  rubric?: Omit<RubricSpec, "economy">,
): LevelSpec {
  return {
    level,
    rubric: {
      ...(rubric ?? {}),
      economy: { objectiveId, attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    },
    complication: {
      adds: ["rubric"],
      titleBg: "Като на изпит — от първия път",
      coachBg:
        "Мястото, очертанията и допуските са същите; мярката е по-строга — три звезди се дават само за маневра, влязла от първия път, две за най-много два опита. Затова не бързай в началото: подмини по-широко, спри на точката, от която завоят излиза сам, и погледни през рамо, преди да тръгнеш назад. Всяко излизане и връщане е загубено време за теб и задръстена лента за колите зад теб — икономичната маневра е и по-безопасната.",
      lawRef: "Наредба № 38",
    },
  };
}
