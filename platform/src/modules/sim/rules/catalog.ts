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
    // The FULL STOP is the sign's own prescription, not чл. 50's: Наредба
    // № РД-02-21-1/23.11.2023 чл. 60, ал. 1 — „Пътен знак Б2 „Спри! Пропусни
    // движещите се по пътя с предимство!" се поставя преди кръстовище на път
    // без предимство." ЗДвП чл. 6, т. 1 makes the sign binding („съобразяват
    // своето поведение… с пътните знаци"), and чл. 50, ал. 1 is the yield half.
    lawRef: "ЗДвП чл. 6, т. 1; чл. 50, ал. 1; Наредба № РД-02-21-1/23.11.2023 чл. 60, ал. 1",
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
    // CITATION CORRECTED 2026-08-03: this cited чл. 25, which is the maneuver
    // SAFETY article and contains no word about signals. The signal duty is
    // чл. 28, ал. 1, retrieved verbatim: „За предупреждаване на останалите
    // участници в движението за намерението си да извърши маневра водачът на
    // пътно превозно средство подава следните сигнали: 1. ляв пътепоказател…
    // за завиване наляво или за отклонение наляво; 2. десен пътепоказател…
    // за завиване надясно или за отклонение надясно."
    lawRef: "ЗДвП чл. 28, ал. 1",
    conceptId: "c-driver-signals",
  },
  // M-17: the observation half of чл. 25, ал. 1 — the lane-change path has
  // always graded it, the turn path never did. Config-gated (see
  // turnObservationEnabled): a turn's blind-spot duty is real, but the glance
  // channel is only as honest as the lesson that feeds it.
  TURN_WITHOUT_OBSERVATION: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Завиване без поглед в огледалото",
    explanationBg:
      "Зави, без да погледнеш в огледалото от страната на завоя. Мигачът само обявява намерението ти — огледалото проверява дали то е безопасно: точно там, отдясно, минават колела и мотори, а отляво изпреварващият вече е тръгнал.",
    correctiveBg:
      "Преди всеки завой: огледало от страната на завоя, после мигач, после къс поглед в мъртвата зона — и чак тогава завърти волана.",
    // ал. 1 named: „преди да започне маневрата, трябва да се убеди, че няма да
    // създаде опасност за участниците в движението, които се движат след него,
    // преди него или минават покрай него".
    lawRef: "ЗДвП чл. 25, ал. 1",
    conceptId: "c-mirrors-blind-spots",
  },
  // M-17: the лентови стрелки were painted, taught and demoed — and graded by
  // nothing. The act (turning out of a lane the marking forbids it from) is a
  // marking offence, so the debrief must teach the marking, not the indicator.
  WRONG_LANE_FOR_DIRECTION: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Завиване от лента с друга стрелка",
    explanationBg:
      "Зави в посока, която стрелката на твоята лента забранява. Стрелките на платното разпределят кръстовището предварително — завоят от чужда лента реже пътя на този, който е застанал правилно, и точно там стават страничните удари.",
    correctiveBg:
      "Чети стрелките отдалеч и се престрой рано. Ако си в грешната лента на самото кръстовище — продължи по нейната стрелка и се върни по-нататък; никога не завивай „оттук“.",
    lawRef: "ЗДвП чл. 6",
    conceptId: "c-lane-choice",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Смяна на лента без мигач",
    explanationBg:
      "Смени лентата, без да подадеш мигач. Водачът зад теб няма как да предвиди маневрата ти — сигналът се подава преди престрояването.",
    correctiveBg:
      "Преди престрояване: мигач, изчакай 2–3 секунди, после плавно смени лентата. Сигналът винаги предхожда маневрата.",
    // CITATION CORRECTED 2026-08-03 (see TURN_WITHOUT_INDICATOR): the signal
    // itself is чл. 28, ал. 1; чл. 25 covers the safety half of the maneuver.
    lawRef: "ЗДвП чл. 28, ал. 1; чл. 25, ал. 1",
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
    lawRef: "ЗДвП чл. 25, ал. 1",
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
    // General duty, named at the alinea that actually carries it — чл. 20, ал. 1:
    // „Водачите са длъжни да контролират непрекъснато пътните превозни средства,
    // които управляват." There is no ЗДвП article about the handbrake; the
    // exam-sheet fault family is Наредба № 38, cited without a guessed number.
    lawRef: "ЗДвП чл. 20, ал. 1; Наредба № 38 (второстепенни грешки)",
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
      "Караше в рамките на ограничението, но твърде бързо за условията — дъжд, мъгла, сняг или тъмно. Съобразената скорост е тази, при която можеш да спреш в рамките на видимото платно. При намалена видимост и хлъзгав път намали още.",
    correctiveBg:
      "При дъжд свали 10–15% под ограничението, в гъста мъгла — почти наполовина, а на сняг и повече: заснежената настилка държи под половината от сухото сцепление. Карай така, че да можеш да спреш в рамките на видимия участък пред теб.",
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
  FOG_LIGHTS_OFF_IN_FOG: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Мъгла без фарове за мъгла",
    explanationBg:
      "Караше в гъста мъгла без включени предни фарове за мъгла. Те светят ниско и широко под пелената — осветяват маркировката пред теб и те правят видим за другите там, където късите светлини се отразяват в капките.",
    correctiveBg:
      "Щом видимостта падне значително, включи предните фарове за мъгла (клавиш V) заедно с късите светлини — и ги изгаси, щом мъглата се вдигне.",
    lawRef: "ЗДвП чл. 74",
    conceptId: "c-fog-driving",
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
  EMERGENCY_NOT_YIELDED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Непропускане на автомобил със специален режим",
    explanationBg:
      "Автомобил със специален режим на движение (включени светлинен и звуков сигнал) приближаваше зад теб, а ти не му направи път. Длъжен си незабавно да го пропуснеш — отдръпни се вдясно и при нужда намали или спри, без да блокираш коридора му.",
    correctiveBg:
      "Чуеш ли сирена или видиш ли синя лампа в огледалото: не спирай рязко в лентата. Мигач надясно, плавно се отдръпни към десния край и намали, докато премине — чак тогава продължи спокойно.",
    lawRef: "ЗДвП чл. 91",
    conceptId: "c-emergency-priority",
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
    // чл. 20, ал. 2 named: „…за да бъдат в състояние да спрат пред всяко
    // предвидимо препятствие. Когато възникне опасност за движението, водачите
    // са длъжни незабавно да намалят скоростта…"
    lawRef: "ЗДвП чл. 20, ал. 2",
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
    // чл. 25, ал. 1 names this maneuver: „да излезе от реда на паркираните
    // превозни средства…, преди да започне маневрата, трябва да се убеди, че няма
    // да създаде опасност за участниците в движението".
    lawRef: "ЗДвП чл. 25, ал. 1",
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
    // C3/A14: осевата линия е надлъжна маркировка — link the mistake to the
    // knowledge graph so sim slips drive theory recommendations.
    conceptId: "c-longitudinal-markings",
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
  CONTROLLER_SIGNAL_VIOLATED: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Неизпълнение на сигнала на регулировчика",
    explanationBg:
      "Премина стоп-линията, докато регулировчикът спираше твоето направление. Сигналите на регулировчика са на върха на йерархията — над светофара и знаците. Зеленият светофар не разрешава нищо, когато регулировчикът те спира: на изпита това е опасна грешка и изпитът се прекратява.",
    correctiveBg:
      "Има ли регулировчик на кръстовището — гледай неговите ръце, не светофара: спри преди линията, докато твоето направление е спряно, и потегли едва когато той разреши твоята посока.",
    lawRef: "ЗДвП чл. 7",
    conceptId: "c-signal-hierarchy",
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
  // -- B1a Wave-2 detector pack (doc 72 capability 1) -----------------------
  STANDSTILL_GAP_TOO_CLOSE: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Твърде малка дистанция при спиране в колона",
    explanationBg:
      "Спря прекалено близо до колата пред теб. При спиране в колона остави поне колкото да виждаш гумите на предната кола да опират в асфалта — така имаш място за маневра и не рискуваш удар при потегляне назад по наклон.",
    correctiveBg:
      "Спри така, че да виждаш мястото, където задните гуми на предната кола опират в пътя — това са около два метра и ти дават резерв, ако предният се върне назад или трябва да заобиколиш.",
    lawRef: "ЗДвП чл. 23",
    conceptId: "c-following-distance",
  },
  HIGH_BEAM_NOT_DIPPED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Дълги светлини зад движеща се кола",
    explanationBg:
      "Движеше се на дълги светлини непосредствено зад друга кола. Дългите светлини заслепяват водача отпред през огледалата му — при движение зад превозно средство се превключва на къси.",
    correctiveBg:
      "Щом настигнеш кола отпред, веднага превключи на къси светлини. На дълги минаваш пак чак когато пред теб няма нито изпреварвана, нито насрещна кола.",
    lawRef: "ЗДвП чл. 74",
    conceptId: "c-dazzle-handling",
  },
  OVERTAKING_AT_CROSSING: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Изпреварване на пешеходна пътека",
    explanationBg:
      "Изпревари кола в зоната на пешеходна пътека. Точно там е забранено да изпреварваш — спрялата или намаляваща кола пред теб може да пропуска пешеходец, когото ти не виждаш иззад нея.",
    correctiveBg:
      "Пред пешеходна пътека не изпреварвай и не заобикаляй колата пред теб — намали и бъди готов да спреш. Ако предният намалява до пътеката, най-вероятно пропуска човек.",
    // CITATION CORRECTED 2026-08-03: this cited чл. 119, which is the duty to
    // YIELD to pedestrians — it does not ban overtaking anywhere. The ban is
    // чл. 43, retrieved verbatim: „Изпреварването на моторни превозни средства…
    // е забранено: … 5. пред пешеходна пътека, когато изпреварваното превозно
    // средство закрива видимостта към пешеходната пътека; 6. пред и върху
    // сигнализирана пешеходна пътека." чл. 119, ал. 2 stays as the second half
    // (the duty when passing a vehicle stopped at the crossing).
    lawRef: "ЗДвП чл. 43, т. 5 и т. 6; чл. 119, ал. 2",
    conceptId: "c-crosswalk-yield",
  },
  // -- B1a Wave-3 detector pack (doc 72 capability 1) — per-lesson drills -----
  JUNCTION_SCAN_INCOMPLETE: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Непълно оглеждане на кръстовището",
    // CONTROL-NEUTRAL BY CONSTRUCTION (doc 87, 2026-08-05). This entry used to
    // say „стоп-линията на знак Б2" unconditionally — and engine.ts arms the
    // code at a Б1 give-way line too, deliberately and correctly (the fresh
    // ляво-дясно scan is the crux of the Б1 lesson). The result was a card
    // reading «Премина стоп-линията на знак Б2» printed directly under the
    // title bar «Б1 не значи спри винаги», photographed at
    // `newdef/b5gw-card-t24.4.png`: the lesson and the fault named opposite
    // signs on the same screen. The catalogue text may therefore name NO sign
    // — it is the one string both controls have to be true of. The sign is
    // supplied per event by the engine's control-aware branch
    // (junctionScanCopy in engine.ts), which knows which line was crossed;
    // `correctiveBg` is looked up by CODE at display time (SessionEndScreen,
    // attemptReel, tutor/retrieval) and has no per-event channel, so it must
    // stay true of both — hence „преди да навлезеш" rather than „спри".
    explanationBg:
      "Премина линията на кръстовището, без да огледаш и наляво, и надясно. „Един поглед не стига“ — най-честата причина за катастрофа на кръстовище е „гледах, но не видях“: погледнал си веднъж отдалеч и си потеглил в това, което се е променило.",
    correctiveBg:
      "Преди да навлезеш в кръстовището, огледай по реда ляво-дясно-ляво — вторият поглед наляво е точно за колата, която е приближила, докато си гледал надясно. Тръгваш чак след пълното оглеждане.",
    // чл. 47 carries the SCAN-before-you-enter duty: „Водач…, приближаващо се
    // към кръстовище, трябва да се движи с такава скорост, че при необходимост да
    // може да спре и да пропусне участниците в движението, които имат предимство."
    // чл. 48 / чл. 50, ал. 1 say who that is.
    lawRef: "ЗДвП чл. 47; чл. 48; чл. 50, ал. 1",
    conceptId: "c-give-way-stop-behavior",
  },
  CLOSING_ON_LEAD_TOO_FAST: {
    // The dynamic half of the чл. 23 distance duty, so it carries the same
    // class as FOLLOWING_TOO_CLOSE: not keeping enough room to the vehicle in
    // front is основна whether the gap was always short or is being eaten.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Настигаш колата отпред",
    explanationBg:
      "Колата пред теб намалява, а ти не намаляваш с нея — разстоянието се топи и вече е под дистанцията, която трябва да държиш. Точно така се стига до удар в спряла колона: не защото си карал бързо, а защото си влязъл в чужда спирачка със своята скорост.",
    correctiveBg:
      "Щом видиш, че предният намалява — отпусни газта веднага и спирай плавно с него, а не в последния момент. Гледай през и над него към спрялата колона напред: спирачните светлини пред НЕГО са твоят сигнал, не неговите.",
    lawRef: "ЗДвП чл. 23; чл. 20, ал. 2",
    conceptId: "c-following-distance",
  },
  FOLLOWING_TOO_CLOSE_FOR_RAIN: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Несъобразена с дъжда дистанция",
    explanationBg:
      "Дистанцията беше добра за сухо, но в дъжд е твърде малка. При мокър път спирачният път нараства около един и половина пъти — затова правилото за 2 секунди става 3 и повече. Дистанцията, която те пази при сухо, не стига при дъжд.",
    correctiveBg:
      "В дъжд удвои резерва: брой поне „едно-и-две-и-три“ до предния. Ако при сухо държиш 2 секунди, при мокър път изостани до 3 и повече — по-голямата дистанция компенсира по-дългото спиране.",
    lawRef: "ЗДвП чл. 23",
    conceptId: "c-following-distance",
  },
  // -- ZONE-BAN data layer (ADR-006 stage 2a; doc 72 PK-06/OV-06) -------------
  ILLEGAL_STOP_IN_BAN_ZONE: {
    // Doc 72 PK-06: Н38 основна (3) — ev-illegal-stop-zone is the #3
    // exam-weight event (29q/47pt).
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Спиране в забранена зона",
    explanationBg:
      "Спря в участък, в който престоят е забранен — под знак В27 „Забранени са престоят и паркирането“. „Само за минутка“ не съществува: точно там спрялата кола закрива видимостта и запушва лентата — затова знакът забранява дори краткия престой.",
    correctiveBg:
      "Преди да спреш, огледай знаците и маркировката на участъка: под В27 не спираш изобщо. Подмини зоната и спри чак след края ѝ — на разрешено място, плътно вдясно до бордюра.",
    lawRef: "ЗДвП чл. 98",
    conceptId: "c-stopping-standing-rules",
  },
  OVERTAKING_IN_BAN_ZONE: {
    // Doc 72 OV-06: Н38 „основна → опасна" — the base sign-zone tier grades
    // основна. Stage 2b REVISITED the опасна escalation (В24 + solid осева)
    // and deliberately kept this tier: severity is a per-code catalog
    // invariant (makeViolation copies it from this spec — no conditional
    // channel exists), and the physical acts diverge anyway: a same-direction
    // lane change inside В24 (this code, no осева crossed) vs fully crossing
    // the solid line (its own опасна, CROSSED_SOLID_LINE below). Where both
    // acts happen, both codes grade — two laws, two lessons, no force-fit.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Изпреварване в зона със забрана",
    explanationBg:
      "Изпревари в участък, в който изпреварването е забранено със знак В24 „Забранено е изпреварването“. Знакът стои там, където видимостта или насрещното движение правят изпреварването опасно — забраната важи, дори колата пред теб да пълзи.",
    correctiveBg:
      "Видиш ли В24 — прибери се зад предния и изчакай търпеливо края на забраната. Изпреварвай чак след зоната: огледало, мигач, чиста съседна лента и обратно вдясно, щом видиш изпреварания в огледалото.",
    lawRef: "ЗДвП чл. 42–43",
    conceptId: "c-overtaking-prohibitions",
  },
  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b; doc 72 OV-04/SN-03/SN-05) ----
  CROSSED_SOLID_LINE: {
    // Doc 72 OV-04/SN-03 escalation tier: the touch is the второстепенна
    // CENTER_LINE_TOUCHED; FULLY crossing the solid осева puts the whole car
    // in the oncoming half where the marking exists to forbid exactly that —
    // the опасна tier („основна/опасна — full crossing against oncoming").
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Пресичане на непрекъсната осева линия",
    explanationBg:
      "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното. Единичната непрекъсната линия (М1) не се застъпва и не се пресича — тя стои точно там, където насрещното движение или видимостта правят навлизането отсреща опасно.",
    correctiveBg:
      "Плътна линия = стена: остани в своята лента, дори предният да пълзи. Изпреварвай или заобикаляй чак където линията стане прекъсната — а дотогава дръж средата на лентата и дистанция за спокойно следване.",
    lawRef: "ППЗДвП чл. 63 (М1 — единична непрекъсната линия)",
    conceptId: "c-longitudinal-markings",
  },
  DRIVING_IN_BUS_LANE: {
    // Doc 72 SN-05: Н38 основна (3) — „движение в бус лента". The innocent
    // side is structural: the sustain excludes the legal right-turn/curb
    // transit, and a declared RIGHT indicator exempts entirely.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение в бус лента",
    explanationBg:
      "Движеше се трайно в лентата, обозначена за превозни средства от редовните линии (маркировка BUS). Бус лентата не е „бърза лента“ за колите — тя пази разписанието на градския транспорт, а движението на автомобили в нея е забранено.",
    correctiveBg:
      "Пътувай в съседната обща лента и използвай бус лентата само за да я пресечеш — при завой надясно или спиране до бордюра, с мигач и непосредствено преди маневрата, без да се движиш по нея.",
    lawRef: "ЗДвП чл. 15",
    conceptId: "c-other-markings",
  },
  // -- RAIL PACK slice 1 (ADR-006 stage 3a; doc 72 §12 RX-01/02/03) -----------
  RAIL_CROSSING_VIOLATION: {
    // Doc 72 RX-01/RX-02: Н38 опасна (10, прекратяване-class) — rail-crossing
    // crashes are rare but near-100% fatal. ONE code for the three graded
    // acts (the detail channel carries which): unguarded entry without the
    // mandatory stop, entry while barred, coming to rest ON the tracks.
    // Deliberately NOT terminateSession — the catalog invariant keeps
    // COLLISION the only terminating code (the sim continues for learning).
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Нарушение на правилата за жп прелез",
    explanationBg:
      "Наруши желязното правило на жп прелеза. Пред прелез без бариери спираш напълно и се оглеждаш в двете посоки — ти си бариерата. При спуснати или спускащи се бариери и мигаща червена светлина не навлизаш, каквото и да ти се струва. И никога не спирай върху самите релси: влакът не може нито да спре, нито да те заобиколи.",
    correctiveBg:
      "Пред прелез: намали отрано. Без бариери — спри напълно преди релсите, огледай наляво и надясно по линията и премини решително, без да спираш върху коловоза. С бариери — изчакай зад стоп-линията, докато се вдигнат напълно, и премини едва когато прелезът е чист.",
    lawRef: "ЗДвП чл. 51–53",
    conceptId: "c-railway-crossing",
  },
  // -- CURVE-ENVELOPE slice (doc 72 §8 SP-05; authored curveAdvisory zones) ---
  SPEED_TOO_FAST_FOR_CURVE: {
    // Doc 72 SP-05: Н38 основна (несъобразена скорост) → ПТП — SWOV's headline
    // novice finding: single-vehicle loss of control IN CURVES is THE novice
    // over-representation. The advisory envelope binds regardless of the
    // posted limit (an advisory 50 lives on 90-roads), so this code is NOT
    // capped at the graced limit the way the conditions code is — above the
    // limit the SPEEDING_* codes bill their own distinct fault.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Несъобразена скорост в завой",
    explanationBg:
      "Влезе в обозначения завой със скорост над препоръчителната от табелата. В завоя гумите делят сцеплението между завиване и спиране — влезеш ли твърде бързо, паническото спиране в дъгата изнася колата извън пътя. Точно затова скоростта се сваля ПРЕДИ завоя, не в него.",
    correctiveBg:
      "Прочети знака А1/А2 и табелата под него отрано: спирачките работят на правата — свали до препоръчителната скорост преди завоя, дръж я равномерно през дъгата и ускорявай чак когато волана се изправя.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    conceptId: "c-speed-adaptation",
  },
  // -- MOTORWAY-SEGMENT slice (doc 72 §8 SP-10; edge motorway tag +
  // emergencyLane zones) ------------------------------------------------------
  DRIVING_TOO_SLOW_FOR_MOTORWAY: {
    // Doc 72 SP-10 „Минимална скорост на магистрала": the mobile chicane —
    // motorway speed-differential crashes.
    //
    // LAW VERIFICATION, REDONE 2026-08-03. The slice brief cited „чл. 21
    // минимална 50 на АМ", which did not verify — correct. But the replacement
    // was wrong twice over: it cited ЗДвП чл. 54, which is the RAIL-CROSSING
    // forced-stop article („В случай на принудително спиране на превозното
    // средство върху релсите…"), and it carried a 50 km/h figure that appears
    // nowhere. Retrieved:
    //
    //   ЗДвП чл. 55, ал. 1: „На път, обозначен като автомагистрала или скоростен
    //   път със съответния пътен знак, е разрешено движението само на моторни
    //   превозни средства или състав от пътни превозни средства, чиято
    //   конструктивна максимална скорост надвишава 70 km/h."
    //   ЗДвП чл. 22, ал. 1: „Водачът на пътно превозно средство не трябва да се
    //   движи без основателна причина с твърде ниска скорост, когато по този
    //   начин пречи на движението на другите пътни превозни средства."
    //
    // So: no general minimum exists, the 70 km/h is a condition on the VEHICLE,
    // and the driver-facing duty is чл. 22, ал. 1. Same wording as the content
    // bank's q-magistrali-i-izvangradsko-026, which states it correctly — the
    // two surfaces must agree. The code still grades the SOFTER tier
    // (второстепенна — the „закъснели действия" family), now anchored on чл. 22,
    // ал. 1's „без основателна причина… пречи", not on a phantom absolute limit.
    // Doc 72's „Н38: основна" covers the whole SP-10 archetype incl. the
    // under-speed ramp MERGE (N/A on this segment).
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Твърде бавно движение по автомагистрала",
    explanationBg:
      "Движеше се продължително далеч под скоростта на потока по магистралата — без задръстване или друга причина. Обща задължителна минимална скорост няма, но законът забранява движение без основателна причина с твърде ниска скорост, когато пречиш на другите (ЗДвП чл. 22, ал. 1); а самата магистрала е отворена само за превозни средства, чиято конструктивна максимална скорост надвишава 70 км/ч (чл. 55, ал. 1). Колата, пълзяща в лентата при поток от 120–140, е подвижно препятствие, което всички останали трябва да заобикалят.",
    correctiveBg:
      "Дръж скоростта близка до потока — на свободна магистрала това са поне 100–120 км/ч за лек автомобил. Ако не можеш или не искаш да поддържаш такава скорост, магистралата не е твоят път: избери успореден републикански път.",
    lawRef: "ЗДвП чл. 22, ал. 1; чл. 55, ал. 1",
    conceptId: "c-motorway-rules",
  },
  EMERGENCY_LANE_DRIVING: {
    // Doc 72 SP-10-adjacent motorway discipline. POINT CORRECTED 2026-08-03:
    // this cited чл. 58, т. 3, which is the STOPPING permission („да спира в
    // лентата за принудително спиране, освен при повреда на пътното превозно
    // средство, както и при здравословни проблеми…"). The act graded here is
    // DRIVING along it, and that is т. 4, retrieved verbatim: „да се движи в
    // платното за насрещно движение или в лентата за принудително спиране".
    // The content bank states the same split (q-magistrali-i-izvangradsko-009:
    // „в нея се спира само при повреда… (чл. 58, т. 3), а самото движение по
    // нея е изрично забранено (чл. 58, т. 4)"). Опасна: the
    // lane must stay free for ambulances, fire crews and broken-down cars —
    // undertaking the queue through it at speed is exactly the act the ban
    // exists for. NO indicator exemption (a signalled undertake is still the
    // fault); the breakdown pull-off is protected structurally (the brake
    // exemption + the moving gate — the STOP itself is out of grading scope).
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Движение по аварийната лента",
    explanationBg:
      "Движеше се по лентата за принудително спиране. Тя не е „още една лента“ — по нея е забранено да се кара, защото трябва да остане свободна за аварирали коли, линейки и пожарна. Точно при задръстване, когато изкушението е най-голямо, тя е най-необходима.",
    correctiveBg:
      "Остани в лентите за движение, дори потокът да пълзи — аварийната лента се използва само при принудително спиране: изтегляш се, спираш, включваш аварийните светлини. За изпреварване тя не съществува.",
    lawRef: "ЗДвП чл. 58, т. 4",
    conceptId: "c-motorway-prohibitions",
  },
  // -- OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — the head-on family)
  OVERTAKE_INSUFFICIENT_GAP: {
    // Doc 72 OV-05 „Изпреварване срещу насрещен": Н38 опасна (10, намеса) —
    // THE rural head-on killer; ev-overtake is the #1 exam-weight event.
    // LAW VERIFICATION: ЗДвП чл. 42, ал. 1 — преди изпреварване водачът се
    // убеждава, че има видимост и СВОБОДЕН ПЪТ на разстояние, достатъчно за
    // маневрата (the content bank grounds чл. 41–42 for the preconditions AND
    // the abort duty: „изчезнат ли условията — намаляваш и се прибираш";
    // чл. 43 covers the banned PLACES, which is OV-06's В24 code, not this).
    // The abort side is structural, never graded: braking + returning to the
    // own bank stands the conviction down (OV-08 — an aborted overtake never
    // convicts; that discipline IS the lesson).
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Изпреварване срещу приближаващ насрещен",
    explanationBg:
      "Излезе в насрещната лента за изпреварване, когато насрещният автомобил беше твърде близо. Прозорецът за изпреварване се смята в секунди, не „на око“: при затваряща се дистанция коридорът, който изглежда достатъчен, се изпарява за миг — точно това е геометрията на челния удар.",
    correctiveBg:
      "Преди да излезеш: прецени насрещния в СЕКУНДИ (кола на хоризонта на прав участък ≈ 10-12 сек). Съмняваш ли се — оставаш зад бавния. Излязъл ли си и прозорецът се затваря — прекъсни веднага: спирачка и обратно зад изпреварвания; започнатото изпреварване не е договор.",
    lawRef: "ЗДвП чл. 42, ал. 1",
    conceptId: "c-overtaking-procedure",
  },
  OVERTAKE_RETURN_TOO_EARLY: {
    // Doc 72 OV-09 „Ранно прибиране пред изпреварения": основна — the FO-03
    // cut-in committed BY the student; forcing the overtaken driver's brake
    // is the graded harm, the mirror image of the head-on gamble above.
    // LAW VERIFICATION: ЗДвП чл. 42 — the bank grounds the return duty
    // directly (manevri-i-izprevarvane: „връщаш се вдясно, БЕЗ ДА ЗАСИЧАШ
    // изпреварения — виждаш го целия в огледалото за обратно виждане") and
    // the mirror duty on the overtaken side (magistrali-i-izvangradsko:
    // „изпреварваният не ускорява и не пречи"). ал. 2 exists in the statute
    // but is NOT bank-confirmable (only a flagged „чл. 42, ал. 3?" exists),
    // so the honest cite is чл. 42 bare — the ADR-002 retrieval discipline.
    // The victim's rescue never acquits: the runtime tracker freezes the
    // overtaken car's reference speed the moment the cut starts forcing it
    // (runtime OVERTAKE_RETURN_* constants), while a car slowing on its OWN
    // keeps lowering the reference — that named FP is structurally innocent.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Ранно прибиране пред изпреварения",
    explanationBg:
      "Прибра се в дясната лента непосредствено пред автомобила, който изпревари, и го принуди да намали. Изпреварването завършва едва с безопасното връщане вдясно — да засечеш изпреварения на метри пред носа му е същото вклиняване, от което ти самият се пазиш на пътя.",
    correctiveBg:
      "Прибирай се чак когато видиш ЦЕЛИЯ изпреваран автомобил в огледалото за обратно виждане — тогава разстоянието стига. Мигач надясно и плавна дъга обратно в лентата; секунда по-късно прибиране струва нищо, ранното струва спирачка на другия.",
    lawRef: "ЗДвП чл. 42",
    conceptId: "c-overtaking-procedure",
  },
  VULNERABLE_PASS_TOO_CLOSE: {
    // Doc 72 VU-02 „Тясно изпреварване на колело": Н38 основна (опасна only
    // when the cyclist wobbles/reacts — which the sim adjudicates as the
    // swerve stand-down, never an escalation; err innocent, A12).
    // LAW VERIFICATION: ЗДвП чл. 42 — изпреварваш велосипедист само с
    // ДОСТАТЪЧНО СТРАНИЧНО РАЗСТОЯНИЕ и намалена скорост (bank-verified:
    // q-uyazvimi-010/012/045 all ground the clearance duty at чл. 42; the
    // 1.5 m figure is the BG/EU taught GUIDANCE, not a statutory number —
    // the copy teaches it, the tracker convicts only under ~1.2 m of air).
    // GEOMETRY: the runtime tracker measures center-to-center and documents
    // the ~1.25 m body allowance (runtime VULNERABLE_PASS_* constants).
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Изпреварване на велосипедист без странична дистанция",
    explanationBg:
      "Мина покрай велосипедиста почти без странично разстояние. Законът изисква ДОСТАТЪЧНА странична дистанция — учи се около 1,5 метра въздух: велосипедистът няма ламарина около себе си и може всеки миг да се отклони заради дупка, шахта или порив на вятъра. На половин метър всяко негово клатушкане е сблъсък.",
    correctiveBg:
      "Преди велосипедист: огледало, мигач наляво и се отмести с реален метър и половина — при нужда изчакай насрещния да мине и чак тогава изпреварвай. Няма ли място за широка дъга, остани зад него; никога не се провирай.",
    // ал. 2, т. 1 named — that is the sentence: „по време на изпреварването да
    // осигури достатъчно странично разстояние между своето и изпреварваното
    // пътно превозно средство".
    lawRef: "ЗДвП чл. 42, ал. 2, т. 1",
    conceptId: "c-cyclists",
  },
  PREDRIVE_STEP_SKIPPED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Пропусната стъпка от подготовката",
    explanationBg:
      "Потегли, без да изпълниш стъпка от подготовката преди потегляне. Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала.",
    correctiveBg:
      "Мини пълния ред преди потегляне: седалка → огледала → колан → двигател → предавка → ръчна спирачка → оглеждане → потегляне. Нищо не се прескача.",
    // The pre-drive ritual is the EXAM protocol, not a ЗДвП article — чл. 20
    // carries only the general control duty (ал. 1). Founder ruling: name the
    // rule and the act, never a guessed article number.
    lawRef: "ЗДвП чл. 20, ал. 1; Наредба № 38 (подготовка преди потегляне)",
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
    // The pre-drive ritual is the EXAM protocol, not a ЗДвП article — чл. 20
    // carries only the general control duty (ал. 1). Founder ruling: name the
    // rule and the act, never a guessed article number.
    lawRef: "ЗДвП чл. 20, ал. 1; Наредба № 38 (подготовка преди потегляне)",
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
