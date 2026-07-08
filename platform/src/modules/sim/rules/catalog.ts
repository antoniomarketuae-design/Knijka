/**
 * Violation & commendation catalog — the single source of pedagogical truth
 * for every event the rule engine or the pre-drive machine can emit.
 *
 * Every violation carries: official severity class + points (doc 32), a
 * Bulgarian title + explanation (shown live by the AI instructor UI — the
 * rule engine authors these, no LLM free-recall, per ADR-002), a legal basis
 * (`lawRef`) and, where a clear mapping exists, a knowledge-graph concept id
 * from content/concepts.json — this is how sim mistakes drive theory
 * recommendations.
 */

import {
  SEVERITY_POINTS,
  type CommendationCode,
  type CommendationEvent,
  type SeverityClass,
  type ViolationCode,
  type ViolationEvent,
  type ViolationPoints,
} from "./types";

export interface ViolationSpec {
  severityClass: SeverityClass;
  points: ViolationPoints;
  titleBg: string;
  explanationBg: string;
  lawRef: string;
  conceptId?: string;
  terminateSession?: boolean;
}

export interface CommendationSpec {
  titleBg: string;
  explanationBg: string;
  conceptId?: string;
}

export const VIOLATIONS: Record<ViolationCode, ViolationSpec> = {
  SPEEDING_OVER_LIMIT: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Превишена скорост",
    explanationBg:
      "Движеше се над разрешената скорост. Ограничението е таван, не цел — дръж скоростта под него, особено там, където има пешеходци.",
    lawRef: "ЗДвП чл. 21",
    conceptId: "c-speed-limits",
  },
  SPEEDING_DANGEROUS: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Превишаване с повече от 10 км/ч",
    explanationBg:
      "Караше с повече от 10 км/ч над ограничението. На практическия изпит това е опасна грешка и означава директно неиздържан изпит.",
    lawRef: "ЗДвП чл. 21",
    conceptId: "c-speed-limits",
  },
  RED_LIGHT_CROSSED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Преминаване на червен сигнал",
    explanationBg:
      "Пресече стоп-линията на червено. Червеният сигнал означава пълно спиране преди линията — без изключения. Това е една от най-честите причини за тежки катастрофи на кръстовища.",
    lawRef: "ППЗДвП чл. 31",
    conceptId: "c-traffic-light-signals",
  },
  STOP_SIGN_NO_FULL_STOP: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Неспиране на знак Б2 „Спри!“",
    explanationBg:
      "Премина знака Б2 без пълно спиране. На СТОП се спира напълно винаги — дори пътят да изглежда празен. „Почти спрях“ не съществува нито в закона, нито на изпита.",
    lawRef: "ЗДвП чл. 50",
    conceptId: "c-give-way-stop-behavior",
  },
  TURN_WITHOUT_INDICATOR: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Завиване без мигач",
    explanationBg:
      "Зави, без да подадеш навременен сигнал. Мигачът съобщава намерението ти на всички около теб — подавай го преди маневрата, не по време на нея.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-driver-signals",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Смяна на лента без мигач",
    explanationBg:
      "Смени лентата, без да подадеш мигач. Водачът зад теб няма как да предвиди маневрата ти — сигналът се подава преди престрояването.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-lane-change",
  },
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Смяна на лента без проверка в огледалото",
    explanationBg:
      "Престрои се, без да провериш огледалото от страната на маневрата. В мъртвата зона се скрива цял автомобил — редът е винаги: огледало, сигнал, маневра.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-mirrors-blind-spots",
  },
  SEATBELT_OFF_WHILE_MOVING: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение без предпазен колан",
    explanationBg:
      "Движеше се без поставен колан. При удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж.",
    lawRef: "ЗДвП чл. 137а",
    conceptId: "c-seatbelts",
  },
  HANDBRAKE_LEFT_ON: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение с вдигната ръчна спирачка",
    explanationBg:
      "Потегли с вдигната ръчна спирачка. Колата се влачи, спирачките прегряват — освобождаването на ръчната е част от процедурата за потегляне.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-vehicle-controls",
  },
  HEADLIGHTS_OFF_AT_NIGHT: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение нощем без светлини",
    explanationBg:
      "Движеше се на тъмно с изключени светлини. Нощем виждаш само осветеното от фаровете — а без тях и другите не виждат теб.",
    lawRef: "ЗДвП чл. 70",
    conceptId: "c-night-visibility",
  },
  POOR_LANE_KEEPING: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Неустойчиво движение в лентата",
    explanationBg:
      "Движеше се трайно встрани от средата на лентата — близо до или върху маркировката. Дръж колата в средата на своята лента: така си предвидим за другите и оставяш безопасно разстояние встрани.",
    lawRef: "ЗДвП чл. 15",
  },
  PEDESTRIAN_CROSSING_TOO_FAST: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Твърде бързо приближаване към пешеходна пътека",
    explanationBg:
      "Приближи пешеходна пътека с пешеходец на нея твърде бързо. Скоростта на приближаване трябва да позволява да спреш при нужда — това е предпоставка за произшествие.",
    lawRef: "ЗДвП чл. 119",
    conceptId: "c-crosswalk-yield",
  },
  PEDESTRIAN_NOT_YIELDED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Непропускане на пешеходец",
    explanationBg:
      "Премина през пешеходната пътека, докато на нея имаше пешеходец. Длъжен си да пропуснеш стъпилите на пътеката, като при нужда спреш напълно.",
    lawRef: "ЗДвП чл. 119",
    conceptId: "c-crosswalk-yield",
  },
  COLLISION: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Пътнотранспортно произшествие",
    explanationBg:
      "Настъпи сблъсък. На реалния изпит това прекратява изпита незабавно. В симулатора продължаваме, за да се учиш — но сесията се оценява като прекратена.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-general-care-duty",
    terminateSession: true,
  },
  PREDRIVE_STEP_SKIPPED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Пропусната стъпка от подготовката",
    explanationBg:
      "Потегли, без да изпълниш стъпка от подготовката преди потегляне. Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-pre-drive-check",
  },
  PREDRIVE_SEATBELT_SKIPPED: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Потегляне без предпазен колан",
    explanationBg:
      "Потегли, без да поставиш предпазния колан. Коланът се слага преди потегляне — всеки път, без изключение.",
    lawRef: "ЗДвП чл. 137а",
    conceptId: "c-seatbelts",
  },
  PREDRIVE_WRONG_ORDER: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Нарушен ред на подготовката",
    explanationBg:
      "Изпълни стъпка от подготовката преди необходимите преди нея. Редът има логика — например огледалата се нагласят след седалката, защото позицията ти ги определя.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-pre-drive-check",
  },
};

export const COMMENDATIONS: Record<CommendationCode, CommendationSpec> = {
  FULL_STOP_AT_STOP_SIGN: {
    titleBg: "Правилно спиране на знак Б2",
    explanationBg: "Спря напълно на стоп-линията, огледа се и потегли безопасно. Точно така се прави.",
    conceptId: "c-give-way-stop-behavior",
  },
  SAFE_LANE_CHANGE: {
    titleBg: "Правилна смяна на лента",
    explanationBg: "Огледало, мигач, маневра — в правилния ред и навреме. Отлично.",
    conceptId: "c-lane-change",
  },
  PEDESTRIAN_YIELDED: {
    titleBg: "Правилно пропускане на пешеходец",
    explanationBg: "Намали навреме и пропусна пешеходеца на пътеката. Това спасява животи.",
    conceptId: "c-crosswalk-yield",
  },
  PREDRIVE_PERFECT: {
    titleBg: "Безупречна подготовка за потегляне",
    explanationBg: "Изпълни цялата процедура преди потегляне без пропуски и в правилния ред.",
    conceptId: "c-pre-drive-check",
  },
};

// ---------------------------------------------------------------------------
// Event constructors (shared by engine.ts and procedures/machine.ts)
// ---------------------------------------------------------------------------

export function makeViolation(
  code: ViolationCode,
  t: number,
  overrides?: Partial<Pick<ViolationEvent, "titleBg" | "explanationBg" | "detail">>,
): ViolationEvent {
  const spec = VIOLATIONS[code];
  const event: ViolationEvent = {
    kind: "violation",
    code,
    t,
    severityClass: spec.severityClass,
    points: spec.points,
    titleBg: overrides?.titleBg ?? spec.titleBg,
    explanationBg: overrides?.explanationBg ?? spec.explanationBg,
    lawRef: spec.lawRef,
  };
  if (spec.conceptId !== undefined) event.conceptId = spec.conceptId;
  if (spec.terminateSession) event.terminateSession = true;
  if (overrides?.detail !== undefined) event.detail = overrides.detail;
  return event;
}

export function makeCommendation(code: CommendationCode, t: number): CommendationEvent {
  const spec = COMMENDATIONS[code];
  const event: CommendationEvent = {
    kind: "commendation",
    code,
    t,
    titleBg: spec.titleBg,
    explanationBg: spec.explanationBg,
  };
  if (spec.conceptId !== undefined) event.conceptId = spec.conceptId;
  return event;
}
