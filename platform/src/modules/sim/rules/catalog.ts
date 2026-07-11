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
 *
 * A15 adds `correctiveBg`: the one-line "what the right action was" shown on
 * the session-end mistake rows and woven into the debrief. REQUIRED on every
 * entry (the type enforces completeness — a new code cannot ship without its
 * corrective). Like every other string here it is authored, never generated:
 * this map is the grounding input for the post-Alpha LLM debrief (ADR-002 —
 * the LLM may rephrase, never invent).
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
  /**
   * A15: the corrective action — one instructive line answering "какво
   * трябваше да направя?". Concrete and procedural (numbers, order of
   * actions), not a restatement of the rule; the explanation says WHY, this
   * says HOW next time.
   */
  correctiveBg: string;
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
    correctiveBg:
      "Свали газта още при знака и поглеждай скоростомера — в зона 50 дръж 45–48 км/ч, така имаш резерв за неточността на окото.",
    lawRef: "ЗДвП чл. 21",
    conceptId: "c-speed-limits",
  },
  SPEEDING_DANGEROUS: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Превишаване с повече от 10 км/ч",
    explanationBg:
      "Караше с повече от 10 км/ч над ограничението. На практическия изпит това е опасна грешка и означава директно неиздържан изпит.",
    correctiveBg:
      "Вдигни крака от газта веднага щом видиш знака и остави колата да се забави; ако не стига — леко спирачка. +10 км/ч не е буфер, а границата на изпита.",
    lawRef: "ЗДвП чл. 21",
    conceptId: "c-speed-limits",
  },
  RED_LIGHT_CROSSED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Преминаване на червен сигнал",
    explanationBg:
      "Пресече стоп-линията на червено. Червеният сигнал означава пълно спиране преди линията — без изключения. Това е една от най-честите причини за тежки катастрофи на кръстовища.",
    correctiveBg:
      "При жълто, което не можеш да минеш безопасно, започни да спираш; на червено спри напълно ПРЕДИ стоп-линията и потегли чак на зелено.",
    lawRef: "ППЗДвП чл. 31",
    conceptId: "c-traffic-light-signals",
  },
  STOP_SIGN_NO_FULL_STOP: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Неспиране на знак Б2 „Спри!“",
    explanationBg:
      "Премина знака Б2 без пълно спиране. На СТОП се спира напълно винаги — дори пътят да изглежда празен. „Почти спрях“ не съществува нито в закона, нито на изпита.",
    correctiveBg:
      "Спри ДОКРАЙ на линията — колелата неподвижни, брой наум до 3, огледай ляво-дясно-ляво и чак тогава потегли.",
    lawRef: "ЗДвП чл. 50",
    conceptId: "c-give-way-stop-behavior",
  },
  TURN_WITHOUT_INDICATOR: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Завиване без мигач",
    explanationBg:
      "Зави, без да подадеш навременен сигнал. Мигачът съобщава намерението ти на всички около теб — подавай го преди маневрата, не по време на нея.",
    correctiveBg:
      "Пусни мигача поне 3 секунди преди завоя — още докато приближаваш кръстовището, не когато вече въртиш волана.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-driver-signals",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Смяна на лента без мигач",
    explanationBg:
      "Смени лентата, без да подадеш мигач. Водачът зад теб няма как да предвиди маневрата ти — сигналът се подава преди престрояването.",
    correctiveBg:
      "Преди престрояване: мигач, изчакай 2–3 секунди, после плавно смени лентата. Сигналът винаги предхожда маневрата.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-lane-change",
  },
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Смяна на лента без проверка в огледалото",
    explanationBg:
      "Престрои се, без да провериш огледалото от страната на маневрата. В мъртвата зона се скрива цял автомобил — редът е винаги: огледало, сигнал, маневра.",
    correctiveBg:
      "Редът е железен: огледало от страната на маневрата → мигач → проверка на мъртвата зона → маневра. Без поглед в огледалото воланът не се мести.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-mirrors-blind-spots",
  },
  SEATBELT_OFF_WHILE_MOVING: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение без предпазен колан",
    explanationBg:
      "Движеше се без поставен колан. При удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж.",
    correctiveBg:
      "Закопчай колана преди потегляне — винаги, дори за 100 метра. Ако се е откопчал в движение, спри на безопасно място и го сложи.",
    lawRef: "ЗДвП чл. 137а",
    conceptId: "c-seatbelts",
  },
  HANDBRAKE_LEFT_ON: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение с вдигната ръчна спирачка",
    explanationBg:
      "Потегли с вдигната ръчна спирачка. Колата се влачи, спирачките прегряват — освобождаването на ръчната е част от процедурата за потегляне.",
    correctiveBg:
      "Свали ръчната докрай непосредствено преди потегляне. Ако колата тегли и усещаш съпротивление — спри и провери ръчната, не давай повече газ.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-vehicle-controls",
  },
  HEADLIGHTS_OFF_AT_NIGHT: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение нощем без светлини",
    explanationBg:
      "Движеше се на тъмно с изключени светлини. Нощем виждаш само осветеното от фаровете — а без тях и другите не виждат теб.",
    correctiveBg:
      "Включи късите светлини още със запалването на двигателя — по тъмно те светят през цялото време, не „когато се стъмни съвсем“.",
    lawRef: "ЗДвП чл. 70",
    conceptId: "c-night-visibility",
  },
  POOR_LANE_KEEPING: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Неустойчиво движение в лентата",
    explanationBg:
      "Движеше се трайно встрани от средата на лентата — близо до или върху маркировката. Дръж колата в средата на своята лента: така си предвидим за другите и оставяш безопасно разстояние встрани.",
    correctiveBg:
      "Гледай далеч напред по средата на лентата, не в предния капак — колата отива там, където гледаш. Малки корекции с волана, рано и плавно.",
    lawRef: "ЗДвП чл. 15",
  },
  SPEED_TOO_FAST_FOR_CONDITIONS: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Несъобразена с условията скорост",
    explanationBg:
      "Караше в рамките на ограничението, но твърде бързо за условията — дъжд или тъмно. Съобразената скорост е тази, при която можеш да спреш в рамките на видимото платно. При намалена видимост и хлъзгав път намали още.",
    correctiveBg:
      "При дъжд или тъмнина свали 10–15% под ограничението и карай така, че да можеш да спреш в рамките на видимия участък пред теб.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-speed-limits",
  },
  HEADLIGHTS_OFF_IN_RAIN: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение в дъжд без светлини",
    explanationBg:
      "Валеше, а караше без къси светлини. При намалена видимост (дъжд, мъгла, сняг) включи късите светлини — не толкова за да виждаш, колкото за да те виждат другите.",
    correctiveBg:
      "Просто правило: тръгнат ли чистачките, светват и късите светлини — двете вървят винаги заедно.",
    lawRef: "ЗДвП чл. 70",
    conceptId: "c-night-visibility",
  },
  FOLLOWING_TOO_CLOSE: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Несъобразена дистанция",
    explanationBg:
      "Движеше се твърде близо до колата пред теб. Дръж поне 2 секунди дистанция — при внезапно спиране това е разликата между спокойно спиране и удар отзад. При дъжд и хлъзгав път увеличи дистанцията.",
    correctiveBg:
      "Избери си ориентир (знак, стълб): предният го подминава — брой „двадесет и едно, двадесет и две“. Стигнеш ли ориентира по-рано, вдигни крака от газта и изостани.",
    lawRef: "ЗДвП чл. 23",
  },
  WRONG_WAY: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Движение в обратна посока по еднопосочна улица",
    explanationBg:
      "Движеше се срещу платното на еднопосочна улица. Това е една от най-опасните грешки — насрещните нямат как да те очакват. Влизай в еднопосочна само по посока на движението.",
    correctiveBg:
      "Оглеждай знаците на входа на всяка улица — В2 „Влизането забранено“ значи не влизаш. Влязъл ли си вече — спри веднага, включи аварийните и излез внимателно на заден ход.",
    lawRef: "ЗДвП чл. 6",
    conceptId: "c-sign-groups",
  },
  NOT_KEEPING_RIGHT: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение в лявата лента без причина",
    explanationBg:
      "Дълго време се движеше в лявата лента, без да изпреварваш. Извън изпреварване се движи във възможно най-дясната свободна лента — лявата се освобождава за по-бързите.",
    correctiveBg:
      "След изпреварване се прибери вдясно веднага щом видиш изпреварания в огледалото за обратно виждане — лявата лента е за маневри, не за пътуване.",
    lawRef: "ЗДвП чл. 15",
  },
  FAILED_TO_YIELD: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Непропускане на пътно превозно средство с предимство",
    explanationBg:
      "Не пропусна превозно средство, което имаше предимство. На кръстовище без светофар пропускаш идващите отдясно; при знак „Пропусни движението“ — всички по главния път. Предимството се отстъпва, не се взема.",
    correctiveBg:
      "Приближавай кръстовището с готовност за пълно спиране: свали скоростта, огледай дясно (или главния път при Б1) и потегли само когато никой не приближава.",
    lawRef: "ЗДвП чл. 47",
    conceptId: "c-priority-concept",
  },
  PEDESTRIAN_CROSSING_TOO_FAST: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Твърде бързо приближаване към пешеходна пътека",
    explanationBg:
      "Приближи пешеходна пътека с пешеходец на нея твърде бързо. Скоростта на приближаване трябва да позволява да спреш при нужда — това е предпоставка за произшествие.",
    correctiveBg:
      "Видиш ли пътека с хора около нея: крак върху спирачката и под 30 км/ч още на 25–30 м преди нея — така имаш време да спреш, ако някой стъпи.",
    lawRef: "ЗДвП чл. 119",
    conceptId: "c-crosswalk-yield",
  },
  PEDESTRIAN_NOT_YIELDED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Непропускане на пешеходец",
    explanationBg:
      "Премина през пешеходната пътека, докато на нея имаше пешеходец. Длъжен си да пропуснеш стъпилите на пътеката, като при нужда спреш напълно.",
    correctiveBg:
      "Спри пред линията на пътеката и изчакай пешеходецът да я освободи — не заобикаляй и не минавай зад гърба му, дори да изглежда, че има място.",
    lawRef: "ЗДвП чл. 119",
    conceptId: "c-crosswalk-yield",
  },
  COLLISION: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Пътнотранспортно произшествие",
    explanationBg:
      "Настъпи сблъсък. На реалния изпит това прекратява изпита незабавно. В симулатора продължаваме, за да се учиш — но сесията се оценява като прекратена.",
    correctiveBg:
      "Карай така, че винаги да имаш къде да спреш: гледай далеч напред, дръж 2 секунди зад предния и намалявай ПРЕДИ конфликтните точки (кръстовища, пътеки, паркирани коли).",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-general-care-duty",
    terminateSession: true,
  },
  // -- B1a Wave-1 detector pack (doc 72 capability 1 + N2) -------------------
  ENGINE_STALLED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Загасване на двигателя",
    explanationBg:
      "Двигателят загасна. На изпита всяко загасване се отбелязва като второстепенна грешка — случва се на всеки, но повтарянето показва проблем с работата на съединителя и газта и трупа точки.",
    correctiveBg:
      "При потегляне: съединител докрай, лек газ, отпускай съединителя плавно до точката на зацепване и я задръж, докато колата тръгне. При спиране натискай съединителя, преди колата да е спряла напълно.",
    lawRef: "Наредба № 38 (второстепенни грешки — загасване на двигателя)",
    conceptId: "c-vehicle-controls",
  },
  MOVE_OFF_WITHOUT_OBSERVATION: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Потегляне без оглеждане",
    explanationBg:
      "Потегли от място, без да провериш огледалата непосредствено преди тръгване. Точно в този момент отзад може да приближава кола, колоездач или мотор — потеглянето е маневра и изисква оглеждане.",
    correctiveBg:
      "Преди да потеглиш: поглед в лявото огледало и към мъртвата зона, мигач и чак тогава тръгвай. Проверката е последното действие преди колелата да се завъртят, не преди половин минута.",
    lawRef: "ЗДвП чл. 25",
    conceptId: "c-mirrors-blind-spots",
  },
  STOP_LINE_OVERSHOOT: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Спиране след стоп-линията",
    explanationBg:
      "Спря на червено с предницата отвъд стоп-линията — върху пешеходната пътека или в устието на кръстовището. Линията показва докъде е твоето място: отвъд нея пречиш на пешеходците и на завиващите.",
    correctiveBg:
      "Започвай спирането по-рано и целѝ спиране на 1–2 метра ПРЕДИ линията — така виждаш и линията, и светофара, без да навлизаш в пътеката.",
    lawRef: "ППЗДвП чл. 31",
    conceptId: "c-traffic-light-signals",
  },
  CENTER_LINE_TOUCHED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Настъпване на осевата линия",
    explanationBg:
      "Движеше се трайно върху осевата линия, към насрещното движение. Настъпването на осевата линия е класическа второстепенна грешка на изпита — колата ти навлиза в пространството на насрещните.",
    correctiveBg:
      "Дръж колата в средата на своята лента и гледай далеч напред. Ако се налага да пресечеш осевата линия (заобикаляне, изпреварване) — първо огледало и мигач, после маневра.",
    lawRef: "Наредба № 38 (второстепенни грешки — настъпване на осева линия)",
  },
  HARSH_BRAKING_NO_CAUSE: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Рязко спиране без причина",
    explanationBg:
      "Спря рязко, без пред теб да има опасност или причина. Внезапното силно спиране изненадва движещите се зад теб и е предпоставка за удар отзад — изпитващите отбелязват точно това.",
    correctiveBg:
      "Гледай далеч напред и планирай спиранията: вдигни газта рано и спирай плавно и предвидимо. Силната спирачка е само за истинска опасност.",
    lawRef: "Наредба № 38 (рязко спиране — предпоставка за ПТП)",
    conceptId: "c-general-care-duty",
  },
  HESITATION_AT_GREEN: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Колебание на зелен сигнал",
    explanationBg:
      "Светна зелено, пътят пред теб беше свободен, а ти остана на място. Закъснелите действия са второстепенна грешка на изпита — кръстовището пропуска по-малко коли, а колоната зад теб чака теб.",
    correctiveBg:
      "Докато чакаш на червено, следи светофара и бъди в готовност: на зелено бърз поглед наляво и надясно и потегли плавно до 2–3 секунди.",
    lawRef: "Наредба № 38 (второстепенни грешки — закъснели действия)",
    conceptId: "c-traffic-light-signals",
  },
  YELLOW_LIGHT_NOT_STOPPED: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Преминаване на жълто при възможност за спиране",
    explanationBg:
      "Пресече стоп-линията на жълто, макар че имаше достатъчно разстояние да спреш спокойно. Жълтото не е „по-бледо зелено“ — то забранява навлизането, освен когато безопасното спиране вече е невъзможно.",
    correctiveBg:
      "Щом видиш жълто, решавай веднага: можеш ли да спреш плавно преди линията — спираш. Продължаваш само ако спирането би било рязко и опасно за движещите се зад теб.",
    lawRef: "ППЗДвП чл. 31",
    conceptId: "c-traffic-light-signals",
  },
  RED_YELLOW_CROSSED: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Потегляне на червено и жълто",
    explanationBg:
      "Навлезе в кръстовището на комбинацията червено + жълто. Тя означава „приготви се“ — зеленото едва предстои, а напречното движение може още да изчиства кръстовището.",
    correctiveBg:
      "На червено + жълто: включи предавка и бъди готов, но потегляй чак когато светне чисто зелено — и след бърз поглед наляво и надясно.",
    lawRef: "ППЗДвП чл. 31",
    conceptId: "c-traffic-light-signals",
  },
  PREDRIVE_STEP_SKIPPED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Пропусната стъпка от подготовката",
    explanationBg:
      "Потегли, без да изпълниш стъпка от подготовката преди потегляне. Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала.",
    correctiveBg:
      "Мини пълния ред преди потегляне: седалка → огледала → колан → двигател → предавка → ръчна спирачка → оглеждане → потегляне. Нищо не се прескача.",
    lawRef: "ЗДвП чл. 20",
    conceptId: "c-pre-drive-check",
  },
  PREDRIVE_SEATBELT_SKIPPED: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Потегляне без предпазен колан",
    explanationBg:
      "Потегли, без да поставиш предпазния колан. Коланът се слага преди потегляне — всеки път, без изключение.",
    correctiveBg:
      "Закопчай колана веднага след настройката на седалката и огледалата — преди двигателя, преди предавката, преди всичко останало.",
    lawRef: "ЗДвП чл. 137а",
    conceptId: "c-seatbelts",
  },
  PREDRIVE_WRONG_ORDER: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Нарушен ред на подготовката",
    explanationBg:
      "Изпълни стъпка от подготовката преди необходимите преди нея. Редът има логика — например огледалата се нагласят след седалката, защото позицията ти ги определя.",
    correctiveBg:
      "Върви по списъка отгоре надолу: първо седалката (тя определя всичко), после огледалата, после коланът. Редът не е формалност — всяка стъпка зависи от предишната.",
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
  YIELDED_TO_PRIORITY: {
    titleBg: "Правилно отстъпено предимство",
    explanationBg: "Пропусна превозното средство с предимство и продължи, когато беше безопасно. Точно така се пази безопасността на кръстовище.",
    conceptId: "c-priority-concept",
  },
  CLEAN_DRIVING: {
    titleBg: "Чисто и спокойно каране",
    explanationBg: "Дълъг участък без нито една грешка — плавно, съобразено и предвидимо. Продължавай така.",
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
