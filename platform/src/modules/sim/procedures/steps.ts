/**
 * Pre-drive step definitions: canonical teaching order, Bulgarian UI texts,
 * order-validation predicates and required-before-move-off rules.
 *
 * ORDER FLEXIBILITY (documented decisions, mirroring what real instructors
 * accept):
 *  - Seat FIRST, strictly before mirrors — mirrors are aligned to the seating
 *    position, so mirrors-before-seat is a wrong-order mistake.
 *  - Seatbelt is swappable with mirrors: it only requires the seat to be
 *    adjusted. It is NOT a prerequisite for starting the engine (schools
 *    differ), but skipping it before move-off is ОСНОВНА (3 т.), not a detail.
 *  - Surroundings check, dashboard check and headlights may be done at any
 *    point before move-off (real flows vary); skipping them is второстепенна.
 *  - Headlights are only REQUIRED at night (Bulgarian law requires lights
 *    24/7 on the road — the engine auto-lights daytime running lights; the
 *    explicit step exists for the night procedure).
 *  - The driveaway chain is strict: engine → brake → gear → handbrake
 *    release. Releasing the handbrake before a gear is engaged (car can roll)
 *    or engaging gear without the brake are wrong-order mistakes.
 *  - Final mirror check and signal require a running engine and must both
 *    happen before move-off.
 */

import type { PreDriveState, PreDriveStepId, PreDriveStepSpec } from "./types";

export function createPreDriveState(opts: { isNight: boolean }): PreDriveState {
  return {
    isNight: opts.isNight,
    seatAdjusted: false,
    mirrorsAdjusted: false,
    surroundingsChecked: false,
    seatbeltOn: false,
    dashboardChecked: false,
    headlightsOn: false,
    engineRunning: false,
    brakePressed: false,
    gearSelected: false,
    handbrakeReleased: false,
    mirrorsRechecked: false,
    indicatorOn: false,
    movedOff: false,
  };
}

const always = () => true;

export const PRE_DRIVE_STEPS: Record<PreDriveStepId, PreDriveStepSpec> = {
  "adjust-seat": {
    id: "adjust-seat",
    titleBg: "Настройка на седалката",
    instructionBg:
      "Нагласи седалката така, че да достигаш педалите с леко свити крака, а китката ти да ляга върху волана при изпънат ръка.",
    validate: always,
    required: always,
    apply: (s) => ({ ...s, seatAdjusted: true }),
    skipSeverity: "vtorostepenna",
  },
  "adjust-mirrors": {
    id: "adjust-mirrors",
    titleBg: "Настройка на огледалата",
    instructionBg:
      "Нагласи вътрешното и страничните огледала — след седалката, защото позицията ти ги определя.",
    validate: (s) => s.seatAdjusted,
    required: always,
    apply: (s) => ({ ...s, mirrorsAdjusted: true }),
    skipSeverity: "vtorostepenna",
  },
  "check-surroundings": {
    id: "check-surroundings",
    titleBg: "Оглед на обстановката",
    instructionBg:
      "Огледай се около автомобила — пешеходци, деца, велосипедисти, препятствия. Колата се движи чак когато знаеш какво има около нея.",
    validate: always,
    required: always,
    apply: (s) => ({ ...s, surroundingsChecked: true }),
    skipSeverity: "vtorostepenna",
  },
  "fasten-seatbelt": {
    id: "fasten-seatbelt",
    titleBg: "Поставяне на предпазния колан",
    instructionBg: "Постави колана и провери да не е усукан. Всеки път, без изключение.",
    validate: (s) => s.seatAdjusted,
    required: always,
    apply: (s) => ({ ...s, seatbeltOn: true }),
    skipSeverity: "osnovna",
  },
  "check-dashboard": {
    id: "check-dashboard",
    titleBg: "Проверка на контролните уреди",
    instructionBg:
      "Погледни таблото — контролните лампи предупреждават за проблем, преди той да е станал опасен.",
    validate: always,
    required: always,
    apply: (s) => ({ ...s, dashboardChecked: true }),
    skipSeverity: "vtorostepenna",
  },
  "headlights-on": {
    id: "headlights-on",
    titleBg: "Включване на светлините",
    instructionBg: "Включи къси светлини — нощем това е част от подготовката, не пожелание.",
    validate: always,
    required: (s) => s.isNight,
    apply: (s) => ({ ...s, headlightsOn: true }),
    skipSeverity: "vtorostepenna",
  },
  "start-engine": {
    id: "start-engine",
    titleBg: "Запалване на двигателя",
    instructionBg: "Запали двигателя, след като седалката и огледалата са нагласени.",
    validate: (s) => s.seatAdjusted && s.mirrorsAdjusted,
    required: always,
    apply: (s) => ({ ...s, engineRunning: true }),
    skipSeverity: "vtorostepenna",
  },
  "press-brake": {
    id: "press-brake",
    titleBg: "Натискане на спирачката",
    instructionBg: "Натисни работната спирачка, преди да включиш предавка — колата не бива да помръдне сама.",
    validate: (s) => s.engineRunning,
    required: always,
    apply: (s) => ({ ...s, brakePressed: true }),
    skipSeverity: "vtorostepenna",
  },
  "select-gear": {
    id: "select-gear",
    titleBg: "Включване на предавка",
    instructionBg: "Включи първа предавка (или D) при натисната спирачка.",
    validate: (s) => s.engineRunning && s.brakePressed,
    required: always,
    apply: (s) => ({ ...s, gearSelected: true }),
    skipSeverity: "vtorostepenna",
  },
  "release-handbrake": {
    id: "release-handbrake",
    titleBg: "Освобождаване на ръчната спирачка",
    instructionBg: "Освободи ръчната спирачка — след като предавката е включена, за да не тръгне колата сама.",
    validate: (s) => s.gearSelected,
    required: always,
    apply: (s) => ({ ...s, handbrakeReleased: true }),
    skipSeverity: "vtorostepenna",
  },
  "final-mirror-check": {
    id: "final-mirror-check",
    titleBg: "Проверка в огледалата",
    instructionBg: "Провери огледалата и мъртвата зона непосредствено преди потегляне.",
    validate: (s) => s.engineRunning,
    required: always,
    apply: (s) => ({ ...s, mirrorsRechecked: true }),
    skipSeverity: "vtorostepenna",
  },
  signal: {
    id: "signal",
    titleBg: "Подаване на мигач",
    instructionBg: "Подай ляв мигач — съобщаваш на движещите се по пътя, че се включваш в движението.",
    validate: (s) => s.engineRunning,
    required: always,
    apply: (s) => ({ ...s, indicatorOn: true }),
    skipSeverity: "vtorostepenna",
  },
  "move-off": {
    id: "move-off",
    titleBg: "Потегляне",
    instructionBg: "Потегли плавно, когато пътят е свободен.",
    // Move-off itself is never "wrong order" — every omission before it is
    // scored as a SKIP instead (no double counting).
    validate: always,
    required: always,
    apply: (s) => ({ ...s, movedOff: true }),
    skipSeverity: "vtorostepenna",
  },
};

/** Canonical teaching order (docs/00_PRODUCT_VISION.md) — drives the UI checklist. */
export const PRE_DRIVE_STEP_ORDER: readonly PreDriveStepId[] = [
  "adjust-seat",
  "adjust-mirrors",
  "check-surroundings",
  "fasten-seatbelt",
  "check-dashboard",
  "headlights-on",
  "start-engine",
  "press-brake",
  "select-gear",
  "release-handbrake",
  "final-mirror-check",
  "signal",
  "move-off",
];
