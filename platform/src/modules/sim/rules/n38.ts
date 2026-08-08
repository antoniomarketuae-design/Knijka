/**
 * Наредба № 38 — the classification the exam points actually come from.
 *
 * WHY THIS FILE EXISTS. Until now the catalogue asserted a `severityClass` per
 * code and `catalog.test.ts` checked `points === SEVERITY_POINTS[class]`. That
 * test asks „if you called it опасна, did you charge 10?" and can never catch a
 * code sitting in the WRONG class — which is the only mistake that matters,
 * because the class IS the charge. Seven of the 53 codes cited Наредба № 38 at
 * all, and not one of them was one of the fifteen that charge 10.
 *
 * The act is in the repo: `content/law/acts/naredba-38.json`, ingested from the
 * SARS нормативна база (sources.json → src-naredba-38-sars). Its ONLY fault
 * classification is приложение № 5, т. 10 (reproduced verbatim below). Every
 * string in `N38_*` is cut from that unit character-for-character, and
 * `__tests__/naredba-38-classification.test.ts` re-verifies each one against the
 * ingested text on every run — if the act is re-ingested and a word changes, the
 * build fails instead of serving a stale ground.
 *
 * WHAT THE ACT ACTUALLY SAYS, and what follows from it:
 *
 *  - основна (а) and второстепенна (б) are DEFINITIONS — open categories, read
 *    against „изискванията към водачите" (приложение № 7 to this same act).
 *  - опасна (в) is a CLOSED ENUMERATION: „за опасна грешка се поставят 10
 *    наказателни точки В СЛЕДНИТЕ СЛУЧАИ" followed by six dashes and nothing
 *    else. A 10-point charge that maps to none of the six has no basis in law.
 *    Five of the six are concrete acts; the fifth („създаде предпоставка за
 *    допускане на ПТП") is the председателят's judgement call and is the only
 *    elastic one — which is precisely why every code grounded on it must say
 *    what its detector measures. See `conflictEvidence` below.
 *
 * ADR-002 discipline: no article number and no figure is typed from memory here.
 * If it is not in `content/law/acts/naredba-38.json`, it is not in this file.
 */

import type { SeverityClass, ViolationCode } from "./types";

// ---------------------------------------------------------------------------
// The act, verbatim (приложение № 5 към чл. 36, ал. 1, т. 1 — т. 10 и т. 11)
// ---------------------------------------------------------------------------

/** т. 10, б. „а" — the основна definition. States its own point value (3). */
export const N38_OSNOVNA_DEF =
  "а) за основни грешки се считат неправилни действия, породени от липсата на знания и умения, заложени в изискванията към водачите на МПС от съответната категория - начисляват се по 3 наказателни точки;";

/** т. 10, б. „б" — the второстепенна definition. States its own value (1). */
export const N38_VTOROSTEPENNA_DEF =
  "б) за второстепенни грешки се считат правилни, но неточни действия, породени от недостатъчния практически опит на изпитвания - начислява се по 1 наказателна точка;";

/** т. 10, б. „в" — the опасна header. States its own value (10). */
export const N38_OPASNA_HEADER = "в) за опасна грешка се поставят 10 наказателни точки в следните случаи:";

/**
 * The six — and ONLY six — cases б. „в" enumerates, verbatim including the
 * leading dash and the trailing punctuation. The test asserts that exactly
 * these six, in this order, are what the ingested act lists: an amendment that
 * adds, drops or rewords one turns the suite red instead of silently widening
 * or narrowing what a student may be charged 10 points for.
 */
export const N38_OPASNA_CASES = {
  signal: "- когато изпитваният не изпълни забраняващ сигнал на светофар или указания на регулировчик;",
  wrongWay: "- когато изпитваният навлезе срещу движението на пътен възел или път с еднопосочно движение;",
  b2: "- когато изпитваният не спре при наличието на пътен знак Б2;",
  intervention:
    "- при намеса на комисията в управлението на моторното превозно средство за предотвратяване на действия на изпитвания, които са опасни за другите участници в движението (разпореждане за конкретно действие или насочване на вниманието);",
  accidentPrecondition: "- когато изпитваният създаде предпоставка за допускане на ПТП;",
  speeding: "- когато изпитваният превиши максимално допустимата скорост за движение с повече от 10 km/h.",
} as const;

export type N38OpasnaCase = keyof typeof N38_OPASNA_CASES;

/** т. 11 — the pass rule. Both thresholds scoring.ts uses are in this one line. */
export const N38_PASS_RULE =
  "11. Изпитът е успешно положен, като на изпитвания са поставени не повече от 9 наказателни точки, като не повече от 6 са от основни грешки.";

/** The act's own ref for a citation: `{ act: "Наредба № 38", ref: … }`. */
export const N38_REF = "приложение № 5, т. 10" as const;
export const N38_ACT_ID = "naredba-38" as const;
export const N38_UNIT_REF = "приложение № 5" as const;

// ---------------------------------------------------------------------------
// Per-code grounding
// ---------------------------------------------------------------------------

/**
 * `conflictEvidence` — the honest half, and the reason this file is not just
 * paperwork.
 *
 * б. „в" case 5 („създаде предпоставка за допускане на ПТП") is the only clause
 * broad enough to absorb a code the other five do not name, so eight of the
 * fifteen 10-point codes rest on it. Whether that is legitimate depends
 * entirely on whether the detector actually establishes a предпоставка:
 *
 *  - "measured"   — the detector convicts only on an established conflict: a
 *                   real other road user, with a distance/gap/occupancy test.
 *                   The предпоставка is a fact the runtime checked.
 *  - "structural" — no other road user is required, but the act is one the law
 *                   forbids BECAUSE the hazard is the one you cannot see (an
 *                   overtake that hides the crossing, a rail crossing, a lane
 *                   reserved for ambulances). The предпоставка is the ban's
 *                   own premise.
 *  - "geometric"  — the detector convicts on position and time alone. Nothing
 *                   about danger is established. A 10-point charge here rests
 *                   on the act's shape, not on a предпоставка.
 *
 * Nothing in the runtime reads this field — it is the audit surface. The test
 * asserts every case-5 code declares one, so a future 10-point code cannot be
 * added without someone answering the question.
 */
export type ConflictEvidence = "measured" | "structural" | "geometric";

export interface N38Basis {
  /** Which lettered sub-point of т. 10 this code is charged under. */
  clause: "а" | "б" | "в";
  /** For clause „в" only: which of the six enumerated cases. */
  opasnaCase?: N38OpasnaCase;
  /** For clause „в" only: what the detector establishes before it convicts. */
  conflictEvidence?: ConflictEvidence;
  /** Why this act falls under that clause — the reviewable sentence. */
  rationaleBg: string;
  /**
   * Set where the grounding is not settled. The test requires a note; it does
   * NOT accept the classification silently.
   */
  contestedBg?: string;
}

/** Which severity class each clause carries, per the act's own words. */
export const N38_CLAUSE_CLASS: Record<N38Basis["clause"], SeverityClass> = {
  а: "osnovna",
  б: "vtorostepenna",
  в: "opasna",
};

export const N38_BASIS: Record<ViolationCode, N38Basis> = {
  // === б. „в" — the six enumerated 10-point cases ===========================

  SPEEDING_DANGEROUS: {
    clause: "в",
    opasnaCase: "speeding",
    conflictEvidence: "measured",
    rationaleBg:
      "Актът е буквално случаят: превишаване на максимално допустимата скорост с повече от 10 km/h. Детекторът мери самата величина, която клаузата назовава — няма преценка.",
  },
  RED_LIGHT_CROSSED: {
    clause: "в",
    opasnaCase: "signal",
    conflictEvidence: "measured",
    rationaleBg:
      "„Не изпълни забраняващ сигнал на светофар“ — детекторът вижда пресичане на стоп-линията при състояние „red“ на самия светофар, т.е. точно неизпълнението, което клаузата описва.",
  },
  CONTROLLER_SIGNAL_VIOLATED: {
    clause: "в",
    opasnaCase: "signal",
    conflictEvidence: "measured",
    rationaleBg:
      "Втората половина на същия случай — „или указания на регулировчик“. Детекторът чака сигнал „halt“ за собственото направление, преди да осъди.",
  },
  STOP_SIGN_NO_FULL_STOP: {
    clause: "в",
    opasnaCase: "b2",
    conflictEvidence: "measured",
    rationaleBg:
      "„Не спре при наличието на пътен знак Б2“ — клаузата назовава знака поименно и не изисква насрещно движение; липсата на пълно спиране е целият състав.",
  },
  WRONG_WAY: {
    clause: "в",
    opasnaCase: "wrongWay",
    conflictEvidence: "structural",
    rationaleBg:
      "„Навлезе срещу движението на… път с еднопосочно движение“ — детекторът се въоръжава само от tick.wrongWay, т.е. от самата еднопосочност, която клаузата назовава.",
  },
  COLLISION: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Клаузата наказва вече създадената ПРЕДПОСТАВКА за ПТП; настъпилото ПТП я изпълнява по аргумент за по-силното основание. Детекторът се въоръжава от реален сблъсък, не от преценка.",
  },
  FAILED_TO_YIELD: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Осъжда се само по решение на адюдикатора за предимство — има насрещен участник с предимство и разрешен конфликт. Непропускането на реално приближаващо ППС е предпоставката, която клаузата иска.",
  },
  EMERGENCY_NOT_YIELDED: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Същият адюдикатор, ситуация „emergency“: изисква реален автомобил със специален режим. Задържането на коридора му е предпоставка за ПТП с всичко, което той изпреварва.",
  },
  PEDESTRIAN_NOT_YIELDED: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Въоръжава се само при pedestrianOnCrossing — пешеходец ФИЗИЧЕСКИ върху пътеката, докато колата преминава. По-пряка предпоставка за ПТП от тази няма.",
  },
  PEDESTRIAN_CROSSING_TOO_FAST: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Изисква видян пешеходец в зоната, скорост над прага И липса на спирачен отговор — трите заедно са невъзможността да спреш пред човек, когото виждаш.",
  },
  OVERTAKE_INSUFFICIENT_GAP: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "measured",
    rationaleBg:
      "Най-строго обоснованият от петнайсетте: осъжда само след измерена дистанция В СЕКУНДИ до реален приближаващ насрещен автомобил под прага, задържана през целия sustain, като прекъснатото изпреварване оправдава. Предпоставката е изчислена, не предположена.",
  },
  OVERTAKING_AT_CROSSING: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Изисква въоръжена зона на пешеходна пътека И преден автомобил за изпреварване. Забраната по чл. 43, т. 5–6 съществува именно защото изпреварваният закрива пътеката: опасността е пешеходецът, когото не можеш да видиш, така че предпоставката е предпоставката на самата забрана.",
  },
  RAIL_CROSSING_VIOLATION: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Трите деяния (навлизане при спуснати бариери, липса на задължително спиране без бариери, спиране върху коловоза) са предпоставка по дефиниция: влакът не може нито да спре, нито да заобиколи, така че присъствието му е без значение за състава.",
  },
  EMERGENCY_LANE_DRIVING: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Лентата за принудително спиране трябва да е свободна за линейка и за аварирал автомобил — движението по нея създава предпоставката независимо кой е в нея в момента. Спирането при повреда е структурно защитено (спирачният отговор спира часовника).",
    contestedBg:
      "Вторият най-слабо обоснован от петнайсетте след CROSSED_SOLID_LINE: детекторът е позиционен (крайна лента на авторизиран emergencyLane участък, 3 s), без нито един тест за друг участник. Ако лидерът реши, че „structural“ не носи 10 точки, този код пада заедно с него.",
  },

  // --- the one that is not settled ------------------------------------------
  CROSSED_SOLID_LINE: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "geometric",
    rationaleBg:
      "Единствената възможна опора е случай 5: непрекъснатата М1 се полага там, където видимостта или насрещното движение правят навлизането отсреща опасно, така че самото навлизане е предпоставката.",
    contestedBg:
      "ОСПОРЕНО — най-слабо обоснованата десетка в каталога. Детекторът се въоръжава от ГЕОМЕТРИЯ И НИЩО ДРУГО: авторизиран М1 участък + противоположна лента + 0,6 s. Прагът от 0,6 s е документиран в types.ts като защита срещу трептене на маркировката, т.е. той отговаря на въпроса „наистина ли пресече“, а НЕ на въпроса „беше ли опасно“ — а клаузата, която го таксува, изисква именно опасност. Три контраста в същия каталог: (1) OVERTAKE_INSUFFICIENT_GAP таксува същото навлизане в насрещната половина само след ИЗМЕРЕНА дистанция в секунди до реален насрещен; (2) OVERTAKING_IN_BAN_ZONE — знак В24, изричната забрана за изпреварване — е основна (3); (3) worldRuntime изключва коридорния тракер върху М1 участък (`tick.solidCenterLine !== true`), така че точно там, където видимостта е най-лоша, НИЩО не проверява насрещното движение. Резултат: заобикаляне на отворена врата или на животно през плътната линия на празен път струва 10 точки и прекратен изпит. РЕШЕНИЕТО Е НА ЛИДЕРА, защото понижаването до основна изисква и премахване на изключването в worldRuntime.ts:1797 (иначе челното изпреварване през плътна линия пада от 10 на 3) и чупи твърдения в чужди ленти — виж доклада.",
  },

  // === б. „а" — основни (3 т.): неправилно действие от липса на знания =======

  TURN_WITHOUT_INDICATOR: {
    clause: "а",
    rationaleBg:
      "Пропуснатият сигнал не е неточност, а незнание на задължението по чл. 28, ал. 1 — изискване към водача, не въпрос на опит.",
  },
  TURN_WITHOUT_OBSERVATION: {
    clause: "а",
    rationaleBg: "Липсва самата проверка по чл. 25, ал. 1 — действието е неправилно, не неточно.",
  },
  WRONG_LANE_FOR_DIRECTION: {
    clause: "а",
    rationaleBg:
      "Завиване от лента, чиято стрелка го забранява — незнание/непрочитане на маркировката, изрично изискване към водача.",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    clause: "а",
    rationaleBg: "Същото задължение за сигнал по чл. 28, ал. 1, приложено към престрояването.",
  },
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: {
    clause: "а",
    rationaleBg: "Маневрата е започната без убеждаването по чл. 25, ал. 1 — пропуснато действие, не неточно изпълнено.",
  },
  SEATBELT_OFF_WHILE_MOVING: {
    clause: "а",
    rationaleBg: "Движение без колан е неизпълнено изискване по чл. 137а, а не неточност от неопитност.",
  },
  HEADLIGHTS_OFF_AT_NIGHT: {
    clause: "а",
    rationaleBg: "Светлинният режим по чл. 70 е знание; изгасените светлини нощем са неправилно действие.",
  },
  FOLLOWING_TOO_CLOSE: {
    clause: "а",
    rationaleBg: "Дистанцията по чл. 23 е правило с числов израз — несъобразената дистанция е неправилно действие.",
  },
  CLOSING_ON_LEAD_TOO_FAST: {
    clause: "а",
    rationaleBg: "Динамичната половина на същото задължение по чл. 23 — затова носи същия клас като FOLLOWING_TOO_CLOSE.",
  },
  MOVE_OFF_WITHOUT_OBSERVATION: {
    clause: "а",
    rationaleBg: "Потеглянето е маневра по чл. 25, ал. 1; липсата на оглеждане е пропуснато задължително действие.",
  },
  HARSH_BRAKING_NO_CAUSE: {
    clause: "а",
    rationaleBg:
      "Детекторът осъжда само след като изключи всяка видима причина — остава безпричинно рязко спиране, т.е. неправилно действие. (Ако беше довело до предпоставка за ПТП, това вече е COLLISION или CLOSING_ON_LEAD_TOO_FAST.)",
  },
  YELLOW_LIGHT_NOT_STOPPED: {
    clause: "а",
    rationaleBg:
      "Жълтото НЕ е „забраняващ сигнал“ по смисъла на случай 1 — там става дума за неизпълнение на забраната; тук спирането е било възможно и не е извършено: неправилно действие по б. „а“.",
  },
  RED_YELLOW_CROSSED: {
    clause: "а",
    rationaleBg:
      "Комбинацията червено+жълто е подготвителна, а не разрешителна — потеглянето по нея е незнание на сигналите, не неизпълнение на забрана (случай 1 остава за чистото червено).",
  },
  JUNCTION_SCAN_INCOMPLETE: {
    clause: "а",
    rationaleBg:
      "Непълното оглеждане е пропуснато изискване по чл. 47/48. Кодът се въоръжава и на линия при Б1, където случай 3 (Б2) по определение не важи — затова б. „а“, не б. „в“.",
  },
  ILLEGAL_STOP_IN_BAN_ZONE: {
    clause: "а",
    rationaleBg: "Спиране под знак В27 — неспазено предписание на знак, класическо неправилно действие от незнание.",
  },
  OVERTAKING_IN_BAN_ZONE: {
    clause: "а",
    rationaleBg:
      "Изпреварване под знак В24. Изричната забрана със знак е неправилно действие; десетката остава за случаите, в които е установен конфликт (OVERTAKE_INSUFFICIENT_GAP).",
  },
  DRIVING_IN_BUS_LANE: {
    clause: "а",
    rationaleBg: "Движение в лента, запазена за редовните линии — неспазено предписание на маркировката.",
  },
  SPEED_TOO_FAST_FOR_CURVE: {
    clause: "а",
    rationaleBg:
      "Скорост над препоръчителната от табелата в обозначен завой: неправилно действие спрямо изискването по чл. 20, ал. 2. Превишаването над ЗАКОНОВОТО ограничение е отделният състав по случай 6 и се таксува от SPEEDING_*.",
  },
  OVERTAKE_RETURN_TOO_EARLY: {
    clause: "а",
    rationaleBg:
      "Прибирането пред изпреварения е неспазено задължение по чл. 42. Пострадалият е принуден да намали — реакция, но не установена предпоставка за ПТП, каквато мери OVERTAKE_INSUFFICIENT_GAP.",
  },
  VULNERABLE_PASS_TOO_CLOSE: {
    clause: "а",
    rationaleBg:
      "Недостатъчното странично разстояние по чл. 42, ал. 2, т. 1 е неправилно действие. Ескалация към б. „в“ съзнателно НЕ се прави — реакцията на велосипедиста стои встрани от осъждането (A12).",
  },
  PREDRIVE_SEATBELT_SKIPPED: {
    clause: "а",
    rationaleBg: "Потегляне без колан — същото изискване по чл. 137а, приложено към подготовката преди потегляне.",
  },

  // === б. „б" — второстепенни (1 т.): правилно, но неточно действие ==========

  SPEEDING_OVER_LIMIT: {
    clause: "б",
    rationaleBg:
      "Превишаване В РАМКИТЕ на 10 km/h. Случай 6 започва СТРИКТНО над 10 km/h, така че под този праг остава неточност — това е и границата, която самата клауза чертае.",
  },
  HANDBRAKE_LEFT_ON: {
    clause: "б",
    rationaleBg: "Потегляне с вдигната ръчна — правилното действие, изпълнено непълно; типична неопитност.",
  },
  POOR_LANE_KEEPING: {
    clause: "б",
    rationaleBg: "Движение встрани от средата на лентата — правилна посока, неточно водене.",
  },
  SPEED_TOO_FAST_FOR_CONDITIONS: {
    clause: "б",
    rationaleBg:
      "Скорост в рамките на ограничението, но несъобразена с дъжд/мъгла/тъмнина: правилно, но неточно преценено действие.",
  },
  HEADLIGHTS_OFF_IN_RAIN: {
    clause: "б",
    rationaleBg: "За разлика от нощта, дневният дъжд е преценка за намалена видимост — пропускът е неточност.",
  },
  FOG_LIGHTS_OFF_IN_FOG: {
    clause: "б",
    rationaleBg: "Фаровете за мъгла са допълнение към късите — неизползването им е неточност, не липса на осветление.",
  },
  NOT_KEEPING_RIGHT: {
    clause: "б",
    rationaleBg: "Задържане в лявата лента без изпреварване — правилно движение, неточно избрана лента.",
  },
  ENGINE_STALLED: {
    clause: "б",
    rationaleBg: "Загасването е учебникарският пример за неточно действие от недостатъчен практически опит.",
  },
  STOP_LINE_OVERSHOOT: {
    clause: "б",
    rationaleBg:
      "Спрял е — но след линията: правилното действие, изпълнено неточно. (Непреминаването изобщо би било случай 1 или 3.)",
  },
  CENTER_LINE_TOUCHED: {
    clause: "б",
    rationaleBg:
      "Настъпване без пълно пресичане — колата остава в своята половина: неточност във воденето, докато пълното пресичане е отделният, по-тежък код.",
  },
  HESITATION_AT_GREEN: {
    clause: "б",
    rationaleBg: "Закъснели действия на зелено — правилно решение, взето бавно; неопитност.",
  },
  STANDSTILL_GAP_TOO_CLOSE: {
    clause: "б",
    rationaleBg: "Спрял е коректно, но твърде близо — неточна преценка на разстоянието в покой.",
  },
  HIGH_BEAM_NOT_DIPPED: {
    clause: "б",
    rationaleBg: "Светлините са включени правилно, но не са превключени навреме — неточност в режима.",
  },
  FOLLOWING_TOO_CLOSE_FOR_RAIN: {
    clause: "б",
    rationaleBg:
      "Дистанцията е достатъчна за сухо и недостатъчна за мокро — детекторът се въоръжава само когато основната по чл. 23 НЕ гърми, така че остава неточна преценка на условията.",
  },
  DRIVING_TOO_SLOW_FOR_MOTORWAY: {
    clause: "б",
    rationaleBg:
      "Обща задължителна минимална скорост няма (чл. 22, ал. 1 забранява само безпричинното пречене), затова деянието е неточна преценка на потока, а не нарушено числово правило.",
  },
  PREDRIVE_STEP_SKIPPED: {
    clause: "б",
    rationaleBg:
      "Пропусната стъпка от подготовката извън колана — процедурна неточност от неопитност. (Коланът има свой код по б. „а“.)",
  },
  PREDRIVE_WRONG_ORDER: {
    clause: "б",
    rationaleBg: "Всички стъпки са изпълнени, но в грешен ред — правилни действия, неточна последователност.",
  },
};
