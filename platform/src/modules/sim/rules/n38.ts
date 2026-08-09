/**
 * Наредба № 38 — the classification the exam points actually come from.
 *
 * WHY THIS FILE EXISTS. The catalogue declares a `severityClass` per code and
 * `catalog.test.ts` checks `points === SEVERITY_POINTS[class]`. That test asks
 * „if you called it опасна, did you charge 10?" and can never catch a code
 * sitting in the WRONG class — the only mistake that matters, because the class
 * IS the charge. Of 53 codes, 7 mentioned Наредба № 38 in a `lawRef` at all, and
 * not one of the 7 was among the fifteen that charged 10.
 *
 * The act is in the repo: `content/law/acts/naredba-38.json`, ingested from the
 * SARS нормативна база (sources.json → src-naredba-38-sars). Its ONLY fault
 * classification is приложение № 5, т. 10 (reproduced verbatim below). Every
 * string in `N38_*` is cut from that unit character-for-character, and
 * `__tests__/naredba-38-classification.test.ts` re-derives each one from the
 * ingested text on every run — if the act is re-ingested and a word moves, the
 * suite goes red instead of serving a stale ground.
 *
 * WHAT THE ACT SAYS, and what follows from it:
 *
 *  - основна (а) and второстепенна (б) are DEFINITIONS — open categories, read
 *    against „изискванията към водачите" (приложение № 7 to this same act).
 *  - опасна (в) is a CLOSED ENUMERATION: „за опасна грешка се поставят 10
 *    наказателни точки В СЛЕДНИТЕ СЛУЧАИ" followed by six dashes and nothing
 *    else. A 10-point charge that maps to none of the six has no basis in law.
 *    Five of the six name a concrete act; the fifth („създаде предпоставка за
 *    допускане на ПТП") is the председателят's judgement and the only elastic
 *    one — which is exactly why every code grounded on it must state what its
 *    detector establishes before it convicts. See `conflictEvidence`.
 *
 * ADR-002 discipline: no article number and no figure is typed from memory
 * here. If it is not in `content/law/acts/naredba-38.json`, it is not a quote.
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
 * these six are what the ingested act lists: an amendment that adds, drops or
 * rewords one turns the suite red instead of silently widening or narrowing
 * what a student may be charged 10 points for.
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

/** т. 11 — the pass rule. Both thresholds `scoring.ts` uses are in this line. */
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
 * `conflictEvidence` — the honest half, and the reason this file is not
 * paperwork.
 *
 * Case 5 („създаде предпоставка за допускане на ПТП") is the only clause broad
 * enough to absorb a code the other five do not name, so most of the 10-point
 * codes rest on it. Whether that is legitimate depends entirely on what the
 * detector establishes before it convicts:
 *
 *  - "measured"   — the detector convicts only on an ESTABLISHED conflict: a
 *                   real other road user, with a distance/gap/occupancy test.
 *                   The предпоставка is a fact the runtime checked.
 *  - "structural" — no other road user is required, but the graded ACT'S OWN
 *                   DEFINITION entails the conflict: a train that can neither
 *                   stop nor swerve, a lane whose legal purpose is to hold
 *                   stopped vehicles, an overtaken car physically hiding the
 *                   crossing. The предпоставка is the ban's own premise.
 *  - "geometric"  — the detector convicts on position and elapsed time alone.
 *                   Nothing about danger is established, and the act's own
 *                   definition entails no conflict either. THE TEST FORBIDS
 *                   THIS ON A 10-POINT CODE. It stays in the type so a finding
 *                   can be written down, not so a charge can ship behind it.
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
  /** Set where the grounding is arguable. The test requires a written note. */
  contestedBg?: string;
}

/** Which severity class each clause carries, per the act's own words. */
export const N38_CLAUSE_CLASS: Record<N38Basis["clause"], SeverityClass> = {
  а: "osnovna",
  б: "vtorostepenna",
  в: "opasna",
};

export const N38_BASIS: Record<ViolationCode, N38Basis> = {
  // === б. „в" — the enumerated 10-point cases ================================

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
      "„Навлезе срещу движението на… път с еднопосочно движение“ — детекторът се въоръжава само от tick.wrongWay, т.е. от самата еднопосочност, която клаузата назовава поименно.",
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
      "Най-строго обоснованата десетка в каталога: осъжда само след ИЗМЕРЕНА дистанция в секунди (distM/closingMps) до реален приближаващ насрещен автомобил под прага от 4,0 s, при ангажирана скорост над 20 km/h, задържана през целия sustain, като прекъснатото изпреварване НИКОГА не осъжда. Предпоставката е изчислена, не предположена — затова кодът остава опасна без уговорки.",
  },
  OVERTAKING_AT_CROSSING: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Изисква въоръжена зона на пешеходна пътека И преден автомобил за изпреварване (overtakeBeat). Забраната съществува именно защото изпреварваният ЗАКРИВА пътеката: конфликтният обект е установен (колата), а опасността е пешеходецът, когото тя скрива — предпоставката е предпоставката на самата забрана.",
  },
  RAIL_CROSSING_VIOLATION: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Трите деяния (навлизане при спуснати бариери, липса на задължителното спиране без бариери, спиране върху коловоза) са предпоставка ПО ДЕФИНИЦИЯ: влакът не може нито да спре, нито да заобиколи, така че присъствието му в кадъра е без значение за състава.",
  },
  EMERGENCY_LANE_DRIVING: {
    clause: "в",
    opasnaCase: "accidentPrecondition",
    conflictEvidence: "structural",
    rationaleBg:
      "Лентата за принудително спиране е ЕДИНСТВЕНАТА част от автомагистралата, в която едно неподвижно превозно средство е ЗАКОННО и НЕОБЯВЕНО: там стоят аварирали коли, там слизат хора извън автомобила, оттам минават линейка и пожарна. Във всяка друга лента заварваш движещи се превозни средства при 90–140 км/ч. Затова движението по нея не е „риск някой да се окаже там“, а навлизане в единственото място, чието правно определение е, че някой може да е спрял без предупреждение — и едновременно с това заемане на коридора на спешните служби. Предпоставката е в самото деяние, а не в присъствието на друг участник. Спирането при повреда е структурно защитено (спирачният отговор спира часовника; самото спиране изобщо не се оценява).",
    contestedBg:
      "ПРЕРАЗГЛЕДАН И ПОТВЪРДЕН НА 10 на 2026-08-09, СЛЕД КАТО ДЕТЕКТОРЪТ БЕШЕ ПРИВЕДЕН КЪМ ЦИТАТА СИ. Предишният запис го наричаше „най-слабо обоснованата останала десетка“, защото детекторът е позиционен (крайна лента на авторизиран emergencyLane участък, laneCount > 1, 3 s) без нито един тест за друг участник — същата форма, заради която CROSSED_SOLID_LINE падна.\n\nРАЗЛИКАТА, КОЯТО ИЗДЪРЖА: б. „в“, случай 5 пита за ПРЕДПОСТАВКА, не за реализиран конфликт. Насрещната половина на двупосочно платно е законно пътно пространство ЗА ДРУГИГО — дали навлизането там е предпоставка, зависи изцяло от това дали някой идва, а именно този факт детекторът на М1 никога не установяваше. Лентата за принудително спиране не е пътно пространство за никого: тя е дефинирана като мястото на спрелите. Затова „structural“ тук е спечелено по същия начин, по който е спечелено за RAIL_CROSSING_VIOLATION (влакът не може нито да спре, нито да завие) — а не като спасителен пояс.\n\nВТОРА РАЗЛИКА, ИЗМЕРИМА: прагът. 0,6 s при CROSSED_SOLID_LINE е документиран в types.ts като защита срещу трептене на маркировката — отговаря на „наистина ли пресече“. 3 s тук при 100 км/ч са 83 метра ПЪТУВАНЕ по аварийната лента — това отговаря на „това пътуване по нея ли беше“, което е самото деяние по чл. 58, т. 4.\n\nКАКВО НАИСТИНА БЕШЕ СЧУПЕНО И Е ПОПРАВЕНО СЪС ЗАПИСА: чл. 58 започва с „ПРИ ДВИЖЕНИЕ ПО АВТОМАГИСТРАЛА“, а детекторът се въоръжаваше само от авторизиран emergencyLane участък, без никакъв тест за автомагистрала. И трите съществуващи участъка (mw-v1, mw-entry-v1, mw-exit-v1) лежат върху ръбове с motorway: true, oneway: true, lanes: 3 — тоест поведението върху наличното съдържание не се променя — но участък, авторизиран утре върху градска улица, щеше да носи 10 точки, позовани на член, който важи само за автомагистрала. Детекторът вече изисква и tick.motorway === true (engine.ts), така че цитатът и въоръжаването сочат един и същ път ПО КОНСТРУКЦИЯ.\n\nЗАПИСАНО ЗА ЧЕСТНОСТ, НЕ КАТО ОСНОВАНИЕ: ЗДвП чл. 58, т. 4 поставя „платното за насрещно движение“ И „лентата за принудително спиране“ в ЕДНО изречение, с еднаква тежест. Първата половина е изрично назована опасна грешка от Наредба № 38 (случай 2 — навлизане срещу движението на път с еднопосочно движение; магистралното платно е точно такъв път). Аварийната лента НЕ попада под случай 2 — по нея се пътува ПО посоката, — така че това е довод по аналогия за преценката на председателя по случай 5, а не съвпадение с клауза.",
  },

  // === б. „а" — основни (3 т.): неправилно действие от липса на знания =======

  CROSSED_SOLID_LINE: {
    clause: "а",
    rationaleBg:
      "М1 „не се пресича“ е предписание на маркировката — знание, което се учи от първия час. Пресичането ѝ е неправилно действие от липса на знания и умения по б. „а“.",
    contestedBg:
      "ПОНИЖЕН ОТ ОПАСНА (10) НА ОСНОВНА (3) на 2026-08-09 — това е находката на тази вълна. Кодът стоеше на б. „в“ без нито един от шестте случая да го покрива. Случай 2 е ИЗРИЧНО изключен: клаузата казва „пътен възел или път с ЕДНОПОСОЧНО движение“, а детекторът се въоръжава само при tick.oneway === false. Оставаше единствено случай 5 („създаде предпоставка за допускане на ПТП“), а детекторът не установява никаква предпоставка: авторизиран М1 участък + противоположна лента + 0,6 s, без нито един друг участник — и прагът 0,6 s е документиран в types.ts като защита срещу трептене на маркировката, т.е. отговаря на „наистина ли пресече“, а не на „беше ли опасно“. Решаващото вътрешно противоречие: OVERTAKING_IN_BAN_ZONE — знак В24, изричната законова забрана за изпреварване — иска ИЗМЕРЕНО престрояване И реален преден автомобил (overtakeBeat) и струва 3. Каталогът таксуваше по-слабия състав (само позиция) с 10, а по-силния (измерено изпреварване в подписана забрана) с 3. КАКВО НЕ СЕ ГУБИ: челното изпреварване през плътна линия и днес не се мери — worldRuntime изключва коридорния тракер върху М1 участък (`tick.solidCenterLine !== true`), така че десетката идваше от геометрия, а не от опасност; реалният удар продължава да носи COLLISION (10, прекратяващ).\n\nЗАТВОРЕНО НА СЪЩИЯ ДЕН: изключението в worldRuntime е премахнато — коридорът вече мери насрещното и ВЪРХУ М1 участък (ocBase/ocArmed), така че челното изпреварване през плътна линия носи и OVERTAKE_INSUFFICIENT_GAP (чл. 42, ал. 1) освен основната за маркировката: две деяния, два закона, два урока — правилото на етап 2b. Тракерът за ПРИБИРАНЕ (OV-09) съзнателно НЕ е разширен: неговият шев върху М1 е самата педагогика на sc-ov-solid-return. Пренаписана е една траса — sc-animal-hazard/mistake-cross-line, чийто коментар твърдеше „насрещният поток е далеч на север“, а първото измерване с въоръжен коридор показа реален насрещен на 2,39 s (а десет метра по-нататък — челен удар); пресичането е преместено в измерено празния прозорец, за да отговаря демонстрацията на собствения си текст.\n\nОСТАВА ОТВОРЕНО (виж rules/summary.ts): първата среща с основна се УЧИ, не се точкува, така че първото пресичане на непрекъсната линия не стига до препоръчващия модул изобщо.",
  },
  TURN_WITHOUT_INDICATOR: {
    clause: "а",
    rationaleBg:
      "Пропуснатият сигнал не е неточност, а незнание на задължението за подаване на сигнал — изискване към водача, не въпрос на опит.",
  },
  TURN_WITHOUT_OBSERVATION: {
    clause: "а",
    rationaleBg:
      "Липсва самото убеждаване преди маневра — действието е неправилно (пропуснато), а не правилно, но неточно изпълнено.",
  },
  WRONG_LANE_FOR_DIRECTION: {
    clause: "а",
    rationaleBg:
      "Завиване от лента, чиято стрелка го забранява — незнание/непрочитане на маркировката, изрично изискване към водача.",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    clause: "а",
    rationaleBg: "Същото задължение за сигнал, приложено към престрояването — знание, не опит.",
  },
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: {
    clause: "а",
    rationaleBg: "Маневрата е започната без задължителното убеждаване — пропуснато действие, не неточно изпълнено.",
  },
  SEATBELT_OFF_WHILE_MOVING: {
    clause: "а",
    rationaleBg: "Движение без колан е неизпълнено изискване към водача, а не неточност от неопитност.",
  },
  HEADLIGHTS_OFF_AT_NIGHT: {
    clause: "а",
    rationaleBg: "Светлинният режим нощем е знание; изгасените светлини са неправилно действие, не неточна преценка.",
  },
  FOLLOWING_TOO_CLOSE: {
    clause: "а",
    rationaleBg:
      "Дистанцията е правило с числов израз, а не въпрос на усет — несъобразената дистанция е неправилно действие от липса на знания.",
  },
  CLOSING_ON_LEAD_TOO_FAST: {
    clause: "а",
    rationaleBg: "Динамичната половина на същото задължение за дистанция — затова носи същия клас като FOLLOWING_TOO_CLOSE.",
  },
  MOVE_OFF_WITHOUT_OBSERVATION: {
    clause: "а",
    rationaleBg: "Потеглянето е маневра; липсата на оглеждане преди нея е пропуснато задължително действие.",
  },
  HARSH_BRAKING_NO_CAUSE: {
    clause: "а",
    rationaleBg:
      "Детекторът осъжда едва след като изключи всяка видима причина — остава безпричинно рязко спиране, т.е. неправилно действие. (Ако беше довело до предпоставка за ПТП, това вече е COLLISION или CLOSING_ON_LEAD_TOO_FAST.)",
  },
  YELLOW_LIGHT_NOT_STOPPED: {
    clause: "а",
    rationaleBg:
      "Жълтото НЕ е „забраняващ сигнал“ по смисъла на случай 1 — там се наказва неизпълнението на забраната. Тук спирането е било възможно и не е извършено: неправилно действие по б. „а“.",
  },
  RED_YELLOW_CROSSED: {
    clause: "а",
    rationaleBg:
      "Комбинацията червено+жълто е подготвителна, а не разрешителна — потеглянето по нея е незнание на сигналите, не неизпълнение на забрана (случай 1 остава за чистото червено).",
  },
  JUNCTION_SCAN_INCOMPLETE: {
    clause: "а",
    rationaleBg:
      "Непълното оглеждане е пропуснато изискване към водача. Кодът се въоръжава и на линия при Б1, където случай 3 (Б2) по определение не важи — затова б. „а“, не б. „в“.",
  },
  ILLEGAL_STOP_IN_BAN_ZONE: {
    clause: "а",
    rationaleBg: "Спиране под знак В27 — неспазено предписание на знак, класическо неправилно действие от незнание.",
  },
  OVERTAKING_IN_BAN_ZONE: {
    clause: "а",
    rationaleBg:
      "Изпреварване под знак В24. Изричната забрана със знак е неправилно действие от липса на знания; десетката остава за случаите, в които е УСТАНОВЕН конфликт (OVERTAKE_INSUFFICIENT_GAP мери секундите до насрещния).",
  },
  DRIVING_IN_BUS_LANE: {
    clause: "а",
    rationaleBg: "Движение в лента, запазена за редовните линии — неспазено предписание на маркировката.",
  },
  SPEED_TOO_FAST_FOR_CURVE: {
    clause: "а",
    rationaleBg:
      "Скорост над препоръчителната от табелата в обозначен завой — неправилно действие спрямо изискването за съобразена скорост. Превишаването над ЗАКОНОВОТО ограничение е отделният състав по случай 6 и се таксува от SPEEDING_*.",
  },
  OVERTAKE_RETURN_TOO_EARLY: {
    clause: "а",
    rationaleBg:
      "Прибирането пред изпреварения е неспазено задължение при изпреварване. Пострадалият е принуден да намали — реакция, но не установена предпоставка за ПТП, каквато мери OVERTAKE_INSUFFICIENT_GAP.",
  },
  VULNERABLE_PASS_TOO_CLOSE: {
    clause: "а",
    rationaleBg:
      "Недостатъчното странично разстояние при разминаване с велосипедист е неправилно действие. Ескалация към б. „в“ съзнателно НЕ се прави — реакцията на велосипедиста стои встрани от осъждането (A12).",
  },
  PREDRIVE_SEATBELT_SKIPPED: {
    clause: "а",
    rationaleBg: "Потегляне без колан — същото изискване, приложено към подготовката преди потегляне.",
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
      "Дистанцията е достатъчна за сухо и недостатъчна за мокро — детекторът се въоръжава само когато основната дистанционна грешка НЕ гърми, така че остава неточна преценка на условията.",
  },
  DRIVING_TOO_SLOW_FOR_MOTORWAY: {
    clause: "б",
    rationaleBg:
      "Обща задължителна минимална скорост няма — забранено е само безпричинното пречене, затова деянието е неточна преценка на потока, а не нарушено числово правило.",
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
