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
 *
 * `lawRef` AND THE ACTS WE DO NOT HOLD (2026-08-09). Six entries here named an
 * article of ППЗДвП or Наредба № РД-02-21-1 — acts `content/law/acts` holds not
 * one byte of — so the number was unverifiable BY CONSTRUCTION: no resolver in
 * this repo could confirm or deny it, and the only check on the string was
 * `lessons/scenario/validate.ts`, a regex on the FIRST WORD. They now name the
 * act and the SUBJECT, byte-identical to the phrasing the question bank froze
 * for the same rule („ППЗДвП светлинни сигнали за регулиране на движението",
 * „ППЗДвП надлъжна пътна маркировка", „Наредба № РД-02-21-1/23.11.2023 правила
 * за поставяне на знак Б3"). The ruling is content/law/README.md's: the rule
 * and the act with no article number beat a number nobody can check.
 * `modules/sim/__tests__/law-citations.test.ts` runs the REAL resolver over
 * every lawRef in this module and fails on a relapse.
 *
 * AND THE CONSUMERS MOVED WITH THE STRINGS. A subject-only ref has no
 * чл./ал./т./§, and both `hazard/feedback.ts parseHazardLawRef` and
 * `tutor/retrieval.ts parseCatalogLawRef` used to split a citation at the first
 * such token — so these five entries would have gone chip-less and silent. Both
 * now call `parseRuleLawRef` (rules/lawRef.ts), which splits on the ACT NAME
 * instead; that also fixes a split that was landing inside „Наредба № …" long
 * before today.
 *
 * ---------------------------------------------------------------------------
 * ONE CITATION SLOT WAS DOING THREE JOBS (SWEEP, 2026-08-09)
 * ---------------------------------------------------------------------------
 * The founder drove over the limit and got „−10 т." with the chip „ЗДвП чл. 21".
 * чл. 21 is not a WRONG citation — it is the article he broke, and the whole of
 * it is a table of limits. It is wrong as an answer to the question the screen
 * was asking, because the number next to it is 10 наказателни точки and чл. 21
 * contains no 10, no опасна грешка and no penalty of any kind. That was not one
 * bad row: all 53 rows had exactly one `lawRef` and it was being read as the
 * source of whatever number sat beside it.
 *
 * A violation now answers THREE separate questions in three separate slots, and
 * nothing may conflate them (the founder's standing ruling about the product's
 * three point-like systems, applied to the data layer):
 *
 *   lawRef        WHAT RULE DID I BREAK — ЗДвП / ППЗДвП / the sign ordinance.
 *                 THIS FILE'S SLOT, and the only one it owns.
 *   examMarkFor   WHERE DO THE POINTS COME FROM — always Наредба № 38,
 *                 приложение № 5, т. 10, always the clause `n38.ts` grounded
 *                 this code under. Lives in `rules/consequences.ts`, DERIVED
 *                 from this catalogue plus n38.ts so the charge and the citation
 *                 of that charge cannot drift apart.
 *   realWorldBg   WHAT HAPPENS ON THE STREET — глоба, лишаване, фиш, and only
 *                 where the figure is cut verbatim from an act the corpus holds.
 *                 Read through `consequences.ts roadConsequenceFor`, which
 *                 prefers its own structured entry and falls back to this prose.
 *
 * A `penaltyRefFor` briefly lived here and was deleted the same day: the
 * parallel lane's `examMarkFor().citationBg` already produced the identical
 * string, and two functions spelling one citation is the exact drift this sweep
 * exists to remove. catalog.ts stays the leaf — consequences.ts imports it, not
 * the other way round.
 *
 * `realWorldBg` IS OPTIONAL AND 12 ROWS DELIBERATELY HAVE NONE. ADR-002 and the
 * founder's ruling after the invented „50 метра": where the fine could not be
 * retrieved, the row says nothing rather than guessing. Every figure that IS
 * printed is re-cut from `content/law/acts/zdvp.json` at test time by
 * `__tests__/catalog-consequences.test.ts` — a лв amount that does not occur in
 * the article it cites fails the suite.
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
  /**
   * THE RULE BROKEN — never the penalty. The article/annex/subject of ЗДвП,
   * ППЗДвП or the sign ordinance that the DETECTOR actually establishes was
   * breached. Where the detector arms on a sign zone, that is чл. 6, т. 1 plus
   * the sign, not an enumeration of places the runtime never measured.
   * The exam points have their own slot (`consequences.ts examMarkFor`) and the
   * fine has a third (`realWorldBg`); a Наредба № 38 reference may appear here
   * ONLY for the two faults that break no road rule at all, and only in the
   * canonical form `examMarkFor().citationBg` produces.
   */
  lawRef: string;
  /**
   * WHAT IT COSTS ON THE STREET — the half a driving instructor cares about
   * most and the one this catalogue never had. One or two sentences naming the
   * глоба (and any лишаване от право) with the article it is cut from.
   *
   * Omitted where no penalty article could be retrieved. That absence is the
   * honest answer, not an oversight: 12 codes have none, and several of them
   * have none because they are exam-sheet faults that are no road offence at
   * all — which is itself worth a student knowing.
   */
  realWorldBg?: string;
  /**
   * The penalty article(s) `realWorldBg` is cut from — one citation per entry,
   * each resolvable in `content/law/acts`. Present exactly when `realWorldBg`
   * is, and every лв / месец figure in the prose must occur verbatim in one of
   * these units (pinned by `__tests__/catalog-consequences.test.ts`).
   */
  realWorldRefs?: readonly string[];
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
    lawRef: "ЗДвП чл. 21, ал. 1",
    realWorldBg:
      "Извън изпита превишаването не струва точки, а пари. В населено място ЗДвП чл. 182, ал. 1 степенува глобата: за превишаване с 10 km/h - с глоба 20 лв.; за превишаване от 11 до 20 km/h - с глоба 50 лв. Тези степени не носят лишаване от право да управлява, затова камера може да ги издаде като електронен фиш, без изобщо да те спре полицай (чл. 189, ал. 4).",
    realWorldRefs: ["ЗДвП чл. 182, ал. 1", "ЗДвП чл. 189, ал. 4"],
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
    // THE FOUNDER'S CHIP, 2026-08-09. This row is where the sweep started: it
    // read „−10 т." with the chip „ЗДвП чл. 21". чл. 21 is the article he broke
    // — a table of limits, 50 in town for category B — and it is the right
    // answer to „what rule did I break". It is the wrong answer to „where does
    // the 10 come from", which is Наредба № 38, приложение № 5, т. 10, б. „в",
    // last indent: „когато изпитваният превиши максимално допустимата скорост
    // за движение с повече от 10 km/h", under a header reading „за опасна
    // грешка се поставят 10 наказателни точки". That citation is now produced
    // by `consequences.ts examMarkFor` for every code, so the two questions stop sharing one
    // chip. ал. 1 named because ал. 2 (signs override) and ал. 3 (average
    // speed) are different rules.
    lawRef: "ЗДвП чл. 21, ал. 1",
    realWorldBg:
      "Изпитната десетка е едно, глобата е съвсем друго. В населено място ЗДвП чл. 182, ал. 1 продължава нагоре: от 11 до 20 km/h - с глоба 50 лв.; от 21 до 30 km/h - с глоба 100 лв.; от 31 до 40 km/h - с глоба 400 лв.; над 40 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство. От „над 40“ нагоре нарушението вече не може да се приключи с фиш — фиш се налага само там, където не се предвижда лишаване от право (чл. 186, ал. 1), тоест съставя се акт.",
    realWorldRefs: ["ЗДвП чл. 182, ал. 1", "ЗДвП чл. 186, ал. 1"],
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
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    realWorldBg:
      "Извън изпита това е 150 лв.: ЗДвП чл. 183, ал. 5 наказва водач, който „преминава при сигнал на светофара, който не разрешава преминаването“. Повторно същото нарушение вече е глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец (ал. 6).",
    realWorldRefs: ["ЗДвП чл. 183, ал. 5, т. 1", "ЗДвП чл. 183, ал. 6"],
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
    lawRef: "ЗДвП чл. 6, т. 1; чл. 50, ал. 1; Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б2",
    realWorldBg:
      "Извън изпита неспирането на Б2 е глоба 100 лв. — ЗДвП чл. 183, ал. 4 наказва водач, който „не спира на пътен знак „Спри! Пропусни движещите се по пътя с предимство!“. Ако от неспирането е създадена непосредствена опасност за движението, наказанието е по чл. 179, ал. 1, т. 5 — глоба в размер 200 лв.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 14", "ЗДвП чл. 179, ал. 1, т. 5"],
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
    realWorldBg:
      "Извън изпита пропуснатият мигач е глоба 50 лв. — ЗДвП чл. 183, ал. 2 наказва водач, който „не подаде сигнал преди извършването на маневра“. Малка сума за грешка, която редовно завършва с удар отзад.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 7"],
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
    // т. 1 named — that is the point that makes the MARKING binding:
    // „съобразяват своето поведение… с пътните знаци и с пътната маркировка".
    // Bare „чл. 6" also covers т. 2 (a регулировчик), which has nothing to do
    // with a lane arrow.
    lawRef: "ЗДвП чл. 6, т. 1",
    realWorldBg:
      "Извън изпита завиването от чужда лента е глоба 100 лв. — ЗДвП чл. 183, ал. 4 наказва водач, който „неправилно се престроява“.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 14"],
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
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „не подаде сигнал преди извършването на маневра“.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 7"],
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
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 — водач, който „неправилно се престроява“. Ако престрояването без поглед е създало непосредствена опасност, вече е чл. 179, ал. 1, т. 5 — глоба в размер 200 лв.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 14", "ЗДвП чл. 179, ал. 1, т. 5"],
    conceptId: "c-mirrors-blind-spots",
  },
  SEATBELT_OFF_WHILE_MOVING: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение без предпазен колан",
    // THE ROW IS ALSO THE *WARNING*, AND IT WAS WRITTEN AS A VERDICT (sweep 161,
    // 2026-08-16). `hud/telltaleWarnings.ts` deliberately carries a CODE and no
    // prose — „the prose has exactly one home (rules/catalog.ts, ADR-002)" — and
    // `LessonPlayShell.tsx` prints `spec.explanationBg` + `spec.correctiveBg`
    // for an ARMED cabin fault, i.e. one that has NOT been committed yet. The
    // belt telltale arms on `moving || engineOn`, so it fires on a stationary
    // car. MEASURED · `sc-rx-tram-left/mobile-right/run.log`: „[01-arrival]
    // 0 км/ч … P" then „[02-briefing] 0 км/ч card=warning/peek · Коланът не е
    // поставен · Движеше се без поставен колан." The car had never moved and the
    // screen said it had. See TELLTALE_TENSE_NOTE below the catalogue for the
    // invariant and the control that keeps it honest.
    explanationBg:
      "Коланът трябва да е закопчан, преди колелата да се завъртят — не „като излезем на голямото“. При удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж, а въздушната възглавница е разчетена да работи ЗАЕДНО с колана, не вместо него.",
    correctiveBg:
      "Закопчай колана преди потегляне — винаги, дори за 100 метра. Ако се е откопчал в движение, спри на безопасно място и го сложи.",
    lawRef: "ЗДвП чл. 137а, ал. 1",
    realWorldBg:
      "Извън изпита коланът е глоба 100 лв. — ЗДвП чл. 183, ал. 4 наказва и водача, който сам „не изпълнява задължението за използване на предпазен колан“, и този, който вози непристегнат пътник.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 7"],
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
    // които управляват." There is no ЗДвП article about the handbrake.
    // „Наредба № 38 (второстепенни грешки)" CAME OFF 2026-08-09: the penalty
    // source is not the rule broken, it now has its own slot (`examMarkFor`),
    // and the parenthetical implied приложение № 5 enumerates второстепенни
    // faults. It does not — б. „б" is a one-sentence DEFINITION with no list.
    lawRef: "ЗДвП чл. 20, ал. 1",
    conceptId: "c-vehicle-controls",
  },
  HEADLIGHTS_OFF_AT_NIGHT: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Движение нощем без светлини",
    // Same telltale contract as the belt row (see it): the lights ping arms on
    // `moving || engineOn`, so this string is printed at a standstill too.
    explanationBg:
      "На тъмно светлините трябва да са включени, преди колата да тръгне. Нощем виждаш само осветеното от фаровете — а без тях и другите не виждат теб, което е по-опасната половина.",
    correctiveBg:
      "Включи късите светлини още със запалването на двигателя — по тъмно те светят през цялото време, не „когато се стъмни съвсем“.",
    // ал. 1 named: „При движение през нощта и при намалена видимост моторните
    // превозни средства и трамваите трябва да бъдат с включени къси или дълги
    // светлини…". ал. 2 is the long-beam BAN and ал. 3 the daytime rule.
    lawRef: "ЗДвП чл. 70, ал. 1",
    realWorldBg:
      "Извън изпита светлините се наказват само когато от тях е произлязла беда: ЗДвП чл. 180, ал. 1 налага глоба 100 лв. на водач, който „наруши правилата за използване светлините на пътно превозно средство… когато в резултат на нарушението е създадена непосредствена опасност за движението“. Без създадена опасност санкция по този текст няма — което не прави карането без светлини по-безопасно, само по-евтино.",
    realWorldRefs: ["ЗДвП чл. 180, ал. 1, т. 1"],
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
    // чл. 15, ал. 1 is about WHICH lane („използва най-дясната свободна лента"),
    // not about how straight you hold it inside one — so on its own it does not
    // carry this fault. чл. 20, ал. 1 („длъжни да контролират непрекъснато
    // пътните превозни средства") is the half that does; both are named.
    lawRef: "ЗДвП чл. 15, ал. 1; чл. 20, ал. 1",
    realWorldBg:
      "Извън изпита разположението на колата върху платното си има цена: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „нарушава правилата за разположение на пътно превозно средство върху платното за движение“.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 2"],
  },
  SPEED_TOO_FAST_FOR_CONDITIONS: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Несъобразена с условията скорост",
    // THE FIRST CLAUSE USED TO READ «Караше в рамките на ограничението, но…»
    // AND IT BECAME FALSE THE DAY THE DETECTOR STARTED REACHING THE FAST HALF
    // OF ITS OWN LESSON (2026-08-27, sc-ac-snow:6ed473c3). `engine.ts` capped
    // `tooFastForConditions` at the graced posted limit, so this row could only
    // ever fire under it and the sentence was true by construction; the cap is
    // gone — a snow lesson whose envelope is 25 has to be able to mark 59 —
    // so the sentence has to stop assuming it. It says the same thing without
    // the assumption: the DUTY is чл. 20, ал. 2, and it binds at every speed.
    explanationBg:
      "Караше твърде бързо за условията — дъжд, мъгла, сняг или тъмно. Ограничението на знака е таван за сух и светъл път, а не разрешение при мокър или заснежен: съобразената скорост е тази, при която можеш да спреш в рамките на видимото платно. При намалена видимост и хлъзгав път намали още.",
    correctiveBg:
      "При дъжд свали 10–15% под ограничението, в гъста мъгла — почти наполовина, а на сняг и повече: заснежената настилка държи под половината от сухото сцепление. Карай така, че да можеш да спреш в рамките на видимия участък пред теб.",
    // ал. 2 named — that is the sentence about conditions („да се съобразяват с
    // атмосферните условия… за да бъдат в състояние да спрат пред всяко
    // предвидимо препятствие"); ал. 1 is the general control duty.
    lawRef: "ЗДвП чл. 20, ал. 2",
    realWorldBg:
      "Извън изпита несъобразената скорост няма собствена глоба в ЗДвП — до момента, в който от нея излезе удар. Тогава чл. 179, ал. 2 наказва с глоба в размер 300 лв. водача, който „поради движение с несъобразена скорост… причини пътнотранспортно произшествие… ако деянието не съставлява престъпление“. Последната уговорка е важната: с пострадал човек случаят вече не се решава по ЗДвП.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
    conceptId: "c-speed-limits",
  },
  HEADLIGHTS_OFF_IN_RAIN: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение в дъжд без светлини",
    // THE FIFTH TELLTALE ROW, AND IT SAID TWO FALSE THINGS (2026-08-23).
    // TELLTALE_TENSE_NOTE below used to enumerate FOUR codes that
    // `hud/telltaleWarnings.ts` can print on an ARMED warning — i.e. before
    // anything has been done — and this row was not among them. It is now,
    // and nothing about this row changed to put it there: the DASHBOARD did.
    // `hud/dashboardStatus.ts writeDashboardStatus` began publishing
    // `dash.conditions` (a REQUIRED parameter since the O35 repair) and
    // `armedTelltaleWarnings` defaults its second argument to that field, so
    // the lights row now runs `headlightDutyCode(conditions)` instead of the
    // legacy single bit — and that function maps BOTH the rain arm and the
    // SNOWFALL arm onto this code (rules/engine.ts `lowBeamDuty`: чл. 70, ал. 1
    // is one duty, so snow reuses this row's code with SNOW_LIGHTS_COPY).
    //
    // MEASURED through the real modules, parked car, engine on, 0 км/ч, lights
    // off (`__tests__/telltale-warning-tense.test.ts`, which now derives over
    // the conditions branch too):
    //   snow → lights=HEADLIGHTS_OFF_IN_RAIN      rain → lights=HEADLIGHTS_OFF_IN_RAIN
    //   conditions absent (legacy branch) → HEADLIGHTS_OFF_AT_NIGHT only
    // The old string opened „Валеше, а караше без къси светлини" and
    // `LessonPlayShell.tsx` prints it verbatim on that card. So it told a
    // student who had never left P that he HAD been driving — the exact
    // `sc-rx-tram-left` defect, one row further on — and during a snowfall it
    // also told him it was RAINING, because the telltale card has no per-event
    // override channel and never sees SNOW_LIGHTS_COPY.
    //
    // WHAT WAS NOT DONE: the row was not emptied and „дъжд" was not deleted
    // from the card. It stays in `titleBg`, which the FAULT card prints and the
    // telltale card does not, and the duty this row teaches is чл. 70, ал. 1's
    // намалена видимост — which is what the sentence now leads with, exactly as
    // the night and fog rows were repaired. It must stay true of every context
    // that prints it: rain or snowfall, moving or standing.
    explanationBg:
      "При намалена видимост — дъжд, снеговалеж или мъгла — късите светлини трябва да са включени, преди колата да тръгне, и да останат включени, докато условията траят. Те не са толкова за да виждаш ти, колкото за да те виждат другите: зад пелената от пръски или снежинки сивата кола се появява пред очите на насрещния секунди по-късно, отколкото ти се струва.",
    correctiveBg:
      "Просто правило: тръгнат ли чистачките, светват и късите светлини — двете вървят винаги заедно.",
    lawRef: "ЗДвП чл. 70, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 180, ал. 1 за нарушени правила за използване на светлините, но само „когато в резултат на нарушението е създадена непосредствена опасност за движението“.",
    realWorldRefs: ["ЗДвП чл. 180, ал. 1, т. 1"],
    conceptId: "c-night-visibility",
  },
  FOG_LIGHTS_OFF_IN_FOG: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Мъгла без фарове за мъгла",
    // Same telltale contract as the belt row (see it): the fog ping arms on
    // `moving || engineOn`, so this string is printed at a standstill too.
    explanationBg:
      "В гъста мъгла предните фарове за мъгла трябва да светят. Те светят ниско и широко под пелената — осветяват маркировката пред теб и те правят видим за другите там, където късите светлини се отразяват в капките.",
    // THE SECOND INSTANCE OF THE SAME DEFECT, found by looking for it. The
    // sc-ac-fog briefing named «(клавиш V)» to a phone; so did this corrective,
    // and a corrective is read at a WORSE moment — the student is already being
    // billed a второстепенна грешка when it appears. `VIOLATIONS` copy is
    // authored once and rendered to both inputs (the fault card, the debrief
    // and the telltale ping all read this record), so the key had to go the
    // same way it went there: «МЪГЛА» is the touch cell face in
    // `components/sim/TouchControls.tsx` and the telltale caption in
    // `hud/StatusDashboard.tsx`, i.e. six letters both readers have on screen.
    correctiveBg:
      "Щом видимостта падне значително, включи предните фарове за мъгла („МЪГЛА“) заедно с късите светлини — и ги изгаси, щом мъглата се вдигне.",
    // HONEST ABOUT WHAT THE ACT SAYS, 2026-08-09. чл. 74, ал. 1 is a PERMISSION
    // with a limit, not a duty: „Допълнителни светлини за мъгла може да се
    // използват само при значително намалена видимост… Тези светлини не може да
    // се използват самостоятелно." Nothing in ЗДвП REQUIRES front fog lamps, so
    // this row may not be sold as breaking чл. 74. What it does break is the
    // lights duty at чл. 70, ал. 1 read against the visibility; the fog lamp
    // itself is the technique the exam sheet marks as второстепенна. Both are
    // named, in that order, and neither is stretched.
    lawRef: "ЗДвП чл. 70, ал. 1; чл. 74, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 180, ал. 1 за нарушени правила за използване на светлините, и то само „когато в резултат на нарушението е създадена непосредствена опасност за движението“. Самото неползване на фаровете за мъгла не е отделно нарушение — законът ги разрешава, не ги изисква; изисква те да се виждаш и да виждаш.",
    realWorldRefs: ["ЗДвП чл. 180, ал. 1, т. 1"],
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
    lawRef: "ЗДвП чл. 23, ал. 1",
    realWorldBg:
      "Извън изпита дистанцията няма собствена глоба в ЗДвП — докато не се стигне до удар. Тогава чл. 179, ал. 2 наказва с глоба в размер 300 лв. водача, който „поради… неспазване на дистанция… причини пътнотранспортно произшествие… ако деянието не съставлява престъпление“. Дистанцията е безплатна дотогава и много скъпа след това.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
  },
  WRONG_WAY: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Движение в обратна посока по еднопосочна улица",
    explanationBg:
      "Движеше се срещу платното на еднопосочна улица. Това е една от най-опасните грешки — насрещните нямат как да те очакват. Влизай в еднопосочна само по посока на движението.",
    // TRUE OF BOTH ROADS THE CLAUSE NAMES, and the old text was not
    // (w10-4, sc-merge-accel-lane:93685d58, 2026-08-25). Наредба № 38,
    // прил. № 5, т. 10, б. „в" covers „пътен възел ИЛИ път с еднопосочно
    // движение", and six cards of this row were photographed on a motorway
    // merge — where „излез внимателно на заден ход" is ЗДвП чл. 58, т. 1
    // („забранено е … движение на заден ход") handed to the student as advice,
    // at 140 км/ч closing speeds. `correctiveBg` has no per-event override
    // channel (it is read from this catalogue BY CODE at display time — see
    // JUNCTION_SCAN_COPY in engine.ts), so the one string has to say both,
    // exactly as the снеговалеж reuse two entries down does. The title and
    // explanation DO split per road: `WRONG_WAY_ROAD_COPY` below.
    correctiveBg:
      "На входа на всяка улица чети знаците — В2 „Влизането забранено“ значи не влизаш. Влязъл ли си вече в еднопосочна улица — спри веднага, включи аварийните и излез на заден ход бавно, с поглед назад. На магистрала е точно обратното: заден ход и обръщане са забранени (чл. 58, т. 1 и 2) — отбий максимално вдясно, аварийни светлини, жилетка, изчакай зад мантинелата и се обади на 112.",
    lawRef: "ЗДвП чл. 6, т. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 — водач, който „навлиза след знак, забраняващ влизането на съответното пътно превозно средство, или се движи в забранената посока на еднопосочен път“. Създаде ли това непосредствена опасност, чл. 179, ал. 1, т. 5 вдига наказанието на глоба в размер 200 лв.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 15", "ЗДвП чл. 179, ал. 1, т. 5"],
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
    lawRef: "ЗДвП чл. 15, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „нарушава правилата за разположение на пътно превозно средство върху платното за движение“.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 2"],
  },
  OFF_CARRIAGEWAY: {
    // THE FAULT THE PRODUCT COULD NAME BUT NOT CHARGE, until this row.
    // `engine.ts`'s withdrawn-gate block (the „WITHDRAWN 2026-08-26" comment at
    // the top of `reduceTick`) is the whole derivation and should be read before
    // this row is touched. The short form: the runtime has published
    // `edgeId: null` at the kerb since 2026-08-26, three exhibits show a car
    // driving or resting off the road with an EMPTY sheet — `sc-ac-truck-spray/
    // mobile-wrong` 04-t102s at 145 км/ч across open field, `sc-sp-curve/
    // mobile-wrong` 04-t154s at 96 км/ч on a green plane, `sc-rb-exit-signal/
    // mobile-right` at REST on a roundabout island — and the COLLISION row two
    // hundred lines down already tells a student „Излизането от платното е самото
    // произшествие" (see COLLISION_CONTACT_COPY). The product could say the
    // sentence and could not bill it. It can now.
    //
    // THE SAME ARTICLE AS `NOT_KEEPING_RIGHT` DIRECTLY ABOVE, and that is the
    // argument for the citation rather than a coincidence. чл. 15, ал. 1 is one
    // sentence with two halves — the car „се движи възможно най-вдясно ПО
    // ПЛАТНОТО ЗА ДВИЖЕНИЕ". Hogging the left lane breaks the second half and is
    // billed above; leaving the carriageway breaks the FIRST, which is the half
    // nothing in this catalogue had ever charged.
    //
    // LAW RETRIEVED, NOT RECALLED (ADR-002) — read out of
    // `content/law/acts/zdvp.json` while writing this row, not carried over from
    // the routing comment in engine.ts:
    //   чл. 15, ал. 1: „На пътя водачът на пътно превозно средство се движи
    //   възможно най-вдясно по платното за движение, а когато пътните ленти са
    //   очертани с пътна маркировка, използва най-дясната свободна лента."
    //   § 6, т. 3: „„Платно за движение" е общата широчина на пътните ленти.
    //   Пътят може да има няколко платна за движение, видимо отделени едно от
    //   друго."
    //   § 6, т. 4: „„Граница на платното за движение" е линията, очертана или не
    //   с пътна маркировка, която отделя платното за движение от другите
    //   конструктивни елементи на пътното платно - банкет, тротоар, лента за
    //   принудително спиране и други. Линията, с която се очертава „BUS"-лентата,
    //   също е граница на платното за движение."
    //   § 6, т. 6: „„Тротоар" е изградена, оградена или очертана с пътна
    //   маркировка надлъжна част от пътя, ограничаваща платното за движение и
    //   предназначена само за движение на пешеходци."
    //   чл. 94, ал. 1: „За престой извън населените места пътните превозни
    //   средства се спират извън платното за движение. Когато това е невъзможно,
    //   спирането за престой се извършва успоредно на оста на пътя, най-вдясно
    //   на пътното платно."
    //   чл. 94, ал. 2: „За паркиране извън населените места пътните превозни
    //   средства се спират извън платното за движение. Паркирането на платното
    //   за движение е забранено."
    //   чл. 94, ал. 3: „За престой и паркиране в населените места пътните
    //   превозни средства се спират възможно най-вдясно на платното за движение
    //   по посока на движението и успоредно на оста на пътя. Допуска се престой
    //   и паркиране на моторни превозни средства с допустима максимална маса до
    //   2,5 тона върху тротоарите само на определените от собствениците на пътя
    //   или администрацията места, успоредно на оста на пътя, ако откъм страната
    //   на сградите остава разстояние най-малко 2 метра за преминаване на
    //   пешеходци."
    // т. 4 is the one the routing comment did not know it needed: it defines the
    // BOUNDARY, which is the thing the detector actually measures, so the
    // citation answers „where exactly?" and not only „what?". Its SECOND sentence
    // was dropped when this row was first written and is restored above: it is
    // harmless to this detector — a BUS lane keeps a valid `edgeId`, so this code
    // cannot fire on one and cannot double-bill beside `BUS_LANE_DRIVING` — but a
    // quotation is not a place to economise.
    // чл. 15, ал. 2 does NOT exempt this. Its three cases all pick a LANE („може
    // да използва за движение най-удобната за него пътна лента"), never a surface
    // off the carriageway. чл. 15, ал. 5 points the same way from the other side:
    // the банкет is opened to „мотопеди, велосипеди и други немоторни превозни
    // средства" and to nothing else, so a car has no licence to TRAVEL there
    // either. „Travel" is the word that has to be in that sentence, and the next
    // paragraph is why.
    //
    // ЧЛ. 94 IS WHY THE COPY BELOW STATES A BAN *AND* ITS EXCEPTION. The first
    // draft of this row shipped two uncited absolutes the act refutes:
    // „тротоарът — само за пешеходци" as a statement about ALL use, and
    // „тревата и тротоарът не са паркинг" as a universal the student is told to
    // act on. § 6, т. 6 designates the тротоар for pedestrian ДВИЖЕНИЕ; where a
    // car may STAND is чл. 94's question, and its answer is neither „anywhere"
    // nor „never":
    //   · IN a built-up area — as far right ON the carriageway (ал. 3, first
    //     sentence), and on the pavement ONLY at places designated by the road
    //     owner or the administration, ≤ 2,5 t, parallel to the axis, 2 m left
    //     for pedestrians (ал. 3, second sentence);
    //   · OUTSIDE a built-up area — the opposite of the in-town rule: the car
    //     MUST be stopped off the carriageway, and parking on it is forbidden
    //     outright (ал. 1 and ал. 2).
    // A row that told a seventeen-year-old „тротоарът не е паркинг" full stop
    // would be contradicted by the first marked bay on his own street and
    // inverted the moment he drives out of town — which is precisely how a
    // virtual instructor loses a student (doc 64 THEO-4), and it is free recall
    // (ADR-002) inside a row that otherwise retrieves. The idiom is already in
    // the repo — `templates-parking2.ts:307` states the ban and names the
    // exception in the same breath — and the copy below follows it.
    //
    // NO `realWorldBg`, AND THE BLANK IS A DECISION THIS ROW OWES AN
    // EXPLANATION FOR — it is the thirteenth deliberate one, not an oversight.
    //
    // THE FINE WAS RETRIEVED. чл. 183, ал. 2, т. 2 prices „нарушава правилата за
    // разположение на пътно превозно средство върху платното за движение" at
    // 50 лв., and `NOT_KEEPING_RIGHT` — the OTHER half of the same чл. 15, ал. 1
    // — is already charged exactly there. So the number is not the problem.
    //
    // WHY IT IS NOT PRINTED ANYWAY. An authored лв. sentence here lands this code
    // in `roadConsequenceFor`'s `authored` shape, and `__tests__/offences.ts`
    // „leaves no catalogued code invisible to every census" refuses that shape by
    // name: „those rows print a лв. sentence of their own, so the day one appears
    // somebody has to decide whether it can double, rather than inherit silence."
    // It caught this row on the first run, and it was right to. чл. 183, ал. 2,
    // т. 2 @ 50 лв. is ALREADY a shared cluster — `SEPARATE_ACTS` carries
    // NOT_KEEPING_RIGHT + CROSSED_SOLID_LINE under it — so a third member cannot
    // be added by writing prose; it needs a structured `ROAD_CONSEQUENCES` entry
    // (which is what makes the charge comparable at all) plus a ruling in
    // `offences.ts`. Both are files this change does not own, and the контролни
    // точки figure a `single` entry requires would have to be cut from Наредба
    // № Iз-2539 rather than assumed. Silence beats an unchecked price.
    //
    // THE RULING THE NEXT LANE INHERITS, so it is not re-derived: SEPARATE, and
    // it joins the existing NOT_KEEPING_RIGHT + CROSSED_SOLID_LINE entry. One act
    // cannot produce both — this code arms only on `edgeId === null` (the car is
    // OFF the carriageway) and NOT_KEEPING_RIGHT arms on holding a left lane,
    // which requires being ON it; the two conditions are mutually exclusive
    // frame by frame, which is a stronger separation than that entry's existing
    // pair has. Two excursions in one drive are two acts, as they are there.
    //
    // AND THE PURIST'S OBJECTION, recorded because whoever lands the structured
    // entry must answer it: т. 2 speaks of position ВЪРХУ платното за движение,
    // and a car that has left it entirely is arguably no longer върху anything.
    // No escalation may be claimed either — чл. 179, ал. 2's 300 лв. is
    // conditioned on „движение с несъобразена скорост", a different act this
    // detector does not establish, and inventing that link is how the invented
    // „50 метра" shipped.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Излизане от платното за движение",
    explanationBg:
      "Излезе с колата извън платното за движение — отвъд бордюра, на банкета, тротоара или тревата — и остана там. Платното за движение е общата широчина на пътните ленти (ЗДвП § 6, т. 3) и е мястото, по което се движи автомобилът; границата му е линията, която го отделя от банкета, тротоара и лентата за принудително спиране (§ 6, т. 4). Отвъд тази граница законът пуска други: по банкета се движат мотопеди, велосипеди и немоторни превозни средства, когато няма лента за тях (чл. 15, ал. 5), а тротоарът е предназначен само за движение на пешеходци (§ 6, т. 6). Това са правила за ДВИЖЕНИЕТО — къде е позволено да спреш е отделен въпрос и на него отговаря чл. 94. Там сцеплението е друго, спирачният път е по-дълъг, а пешеходецът зад храста не очаква автомобил.",
    correctiveBg:
      "Прибери се на платното веднага, но плавно: не дърпай волана — отпусни газта, изправи колелата и се върни под малък ъгъл, след като си погледнал в огледалото. Трябва ли да спреш — в населено място спираш възможно най-вдясно НА платното, успоредно на оста на пътя (ЗДвП чл. 94, ал. 3); извън населено място правилото е обърнато — там се отбива ИЗВЪН платното, а паркирането на самото платно е забранено (чл. 94, ал. 1 и 2). Тротоарът не е свободен паркинг, но не е и абсолютна забрана: качване върху него се допуска само на определените от собственика на пътя или от администрацията места, за автомобил до 2,5 т, успоредно на оста на пътя и ако откъм сградите остават поне 2 метра за пешеходците (чл. 94, ал. 3) — навсякъде другаде е нарушение. Излезеш ли встрани в завой, причината е преди завоя: намали ПРЕДИ да влезеш в дъгата, не в нея.",
    lawRef: "ЗДвП чл. 15, ал. 1",
    // `c-right-side-rule` (which cites чл. 15 itself) is the near miss and is
    // deliberately not used: a student who has left the road does not need the
    // keep-right lesson, he needs the one that says what the carriageway IS and
    // where it ends. That is `c-road-elements` — its own lawRefs are „§ 6 ДР"
    // and its summary is already the sentence („колата се движи по платното,
    // пешеходецът по тротоара"). c-right-side-rule `dependsOn` it, so the
    // recommender still reaches the keep-right beat from here, in that order.
    conceptId: "c-road-elements",
  },
  FAILED_TO_YIELD: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    // SHORTENED 2026-09-02 (sc-merge-from-property:6715b581) — from
    // «Непропускане на пътно превозно средство с предимство», 51 characters.
    //
    // THE PEEK CANNOT FINISH A THREE-LINE TITLE, and it is the surface a
    // seventeen-year-old meets this row on. `hud/SimOverlay.tsx` states the
    // arithmetic at its own `textWindowStyle`: the phone's text window is
    // floored at 44 px (2.75rem, and `hud-off-the-road.test.ts`'s hazard-band
    // gate caps that floor at 45.76 px, an eighth of a line of headroom), a
    // title line box is 13.75 px and the body's first line needs 15.125 — so
    // «a THREE-line title consumes 41.25 of 44» and the explanation gets
    // nothing. Its closing sentence names this file: „The remedy … is an
    // AUTHORING one: a `lineBg` short enough for the peek to finish."
    //
    // PHOTOGRAPHED: `.audit-frames/w10-3/frames/sc-merge-from-property__mobile-
    // right/04-t024s.png` — «Непропускане на пътно / превозно средство с»,
    // faded off mid-phrase, «↓ ОЩЕ 10 РЕДА», ZERO body lines. The words the
    // fold ate were «с предимство», i.e. the operative half of the offence.
    //
    // NOTHING IS LOST AND ONE LINE IS WON. At two title lines the body's own
    // first sentence — «Не пропусна превозно средство, което имаше предимство»
    // — reaches the glass, which says both the party and the duty the long
    // title was saying alone and unreadably. The family prefix («Непропускане
    // на пешеходец», «Непропускане на автомобил със специален режим») is kept,
    // `explanationBg`, `correctiveBg` and the citations below are untouched.
    titleBg: "Непропускане на предимство",
    explanationBg:
      "Не пропусна превозно средство, което имаше предимство. На кръстовище без светофар пропускаш идващите отдясно; при знак „Пропусни движението“ — всички по главния път. Предимството се отстъпва, не се взема.",
    // CORRECTIVE WIDENED TO THE RING, 2026-09-03 (sc-roundabout-entry). It is
    // read BY CODE at display time with no event in hand — the COLLISION row's
    // constraint, and the same „not a licence to give ONE situation's answer"
    // that made that row walk all four bodies. It said „огледай дясно", and at
    // a roundabout the priority traffic is on the LEFT: the one arm it did not
    // walk was the one where its instruction is the classic fatal error. The
    // junction answer is untouched; the ring arm is added beside it.
    correctiveBg:
      "Приближавай кръстовището с готовност за пълно спиране: свали скоростта, огледай дясно (или главния път при Б1) и потегли само когато никой не приближава. На кръгово гледаш НАЛЯВО — движещите се в кръга идват оттам и имат предимство; влизаш само в реален интервал.",
    // CITATION WIDENED 2026-08-09. This cited чл. 47 alone, which is the
    // APPROACH-SPEED duty („да се движи с такава скорост, че при необходимост да
    // може да спре и да пропусне") — the rule you break by arriving too fast,
    // not the rule you break by not yielding. The yield rules are чл. 48
    // (equal roads — right hand) and чл. 50, ал. 1 (a signed priority road), and
    // the adjudicator decides between them per event. JUNCTION_SCAN_INCOMPLETE,
    // a 3-point code, already named all three; this 10-point one named the
    // weakest of them.
    lawRef: "ЗДвП чл. 47; чл. 48; чл. 50, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 — водач, който „не спазва предимството на друг участник в движението“. Създаде ли непропускането непосредствена опасност, чл. 179, ал. 1, т. 5 налага глоба в размер 200 лв., а ако се стигне до ПТП — чл. 179, ал. 2, глоба в размер 300 лв.",
    realWorldRefs: [
      "ЗДвП чл. 183, ал. 4, т. 14",
      "ЗДвП чл. 179, ал. 1, т. 5",
      "ЗДвП чл. 179, ал. 2",
    ],
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
    // CITATION CORRECTED 2026-08-09: this cited чл. 91, which DEFINES what a
    // special-regime vehicle is (ал. 1: blue/red flasher plus siren) and lists
    // in ал. 3 the two pages of agencies entitled to use one. It places no duty
    // on anybody else — a 10-point charge was citing a definitions article. The
    // duty is чл. 104, ал. 1, retrieved verbatim: „При приближаване на моторно
    // превозно средство със специален режим на движение водачите на останалите
    // пътни превозни средства са длъжни да освободят достатъчно място на
    // пътното платно, а при необходимост и да спрат, за да осигурят
    // безпрепятствено преминаване…". чл. 91, ал. 1 stays as the definition of
    // what the student is looking at (both signals together, not just a lamp).
    lawRef: "ЗДвП чл. 104, ал. 1; чл. 91, ал. 1",
    realWorldBg:
      "Извън изпита това е сред по-скъпите: глоба в размер 200 лв. по ЗДвП чл. 179, ал. 1 за водач, „който не осигури път за безпрепятствено преминаване на превозно средство, сигнализиращо със специален звуков и специален светлинен сигнал“.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 1, т. 6"],
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
    // ал. 1 named — the approach half: „При приближаване към пешеходна пътека
    // водачът… е длъжен да пропусне… като намали скоростта или спре."
    // NO `realWorldBg`: what чл. 183, ал. 5, т. 2 prices is „не осигури
    // предимство", and this code fires on the APPROACH, before the yield has
    // been failed. Pricing it here would charge a student for an offence the
    // detector has not established. PEDESTRIAN_NOT_YIELDED carries the figure.
    lawRef: "ЗДвП чл. 119, ал. 1",
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
    lawRef: "ЗДвП чл. 119, ал. 1",
    realWorldBg:
      "Извън изпита това е една от най-скъпите градски грешки: глоба 150 лв. по ЗДвП чл. 183, ал. 5 — водач, който „не осигури предимство, когато преминава през пешеходна пътека“. Повторно — глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец (ал. 6).",
    realWorldRefs: ["ЗДвП чл. 183, ал. 5, т. 2", "ЗДвП чл. 183, ал. 6"],
    conceptId: "c-crosswalk-yield",
  },
  COLLISION: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Пътнотранспортно произшествие",
    // 2026-08-10: the old text said „прекратява изпита незабавно" and stopped
    // there — an ending asserted with no article behind it, beside a 10 with no
    // word on whether it was this one fault or a balance running out. The
    // second half is what this prose now answers, in a sentence a 17-year-old
    // reads; the ENDING moved to where every other legal figure on this card
    // already lives — `examMarkFor()`, which now carries чл. 48, ал. 3 verbatim
    // for any code flagged `terminateSession` and prints it under this text.
    // Repeating the quote here as well was written and then deleted after
    // looking at the rendered card: it printed twice, two lines apart.
    //
    // ONE STRING FOR FOUR DIFFERENT CRASHES (sweep 161, 2026-08-16). The event
    // has carried `detail` = the body struck ("vehicle" | "pedestrian" |
    // "cyclist" | "staticObject", `engine.ts` → `e.withWhat`) since the contact
    // channel shipped, and the card pooled ONE paragraph over all four.
    // MEASURED · `sc-junction-gap/mobile-wrong/04-t100s.png`: the car at rest ON
    // A FOOTWAY, nose into a building corner with a tree through the windscreen
    // view at 5 км/ч, and the only thing said to the student is
    // «Пътнотранспортно произшествие · Настъпи сблъсък» — with a corrective
    // about holding two seconds behind the car in front. MEASURED ·
    // `sc-pk-ban-stop/pc-wrong/08-debrief.png`: „Опасни грешки 2 · 20" with the
    // SAME paragraph on both rows, so two different crashes read as one repeated
    // sentence. The split is COLLISION_CONTACT_COPY below, applied by
    // `makeViolation` exactly as the rail one is — this string stays the
    // control-neutral row that code reads with no event in hand.
    explanationBg:
      "Настъпи сблъсък. Това е ЕДНА опасна грешка и цялата десетка е цената на самото деяние — не сбор от натрупани дребни пропуски. В симулатора продължаваме, за да се учиш, но сесията се оценява като прекратена.",
    // THE CORRECTIVE HAD TO WALK ALL FOUR BODIES TOO (2026-08-23). The split
    // below gave each struck body its own title and explanation, and this slot
    // was left as it was with a note calling that „the honest limit of a
    // code-keyed slot". It is not a limit, it is the same defect one line down:
    // `hud/SessionEndScreen.tsx correctiveFor(m.code)` looks this up BY CODE and
    // hands it to `FaultCard`, which prints it under «✔ Правилното действие» —
    // so the student who was just told, correctly, that he left the carriageway
    // and hit a building was then told, as the answer to „какво трябваше да
    // направя", to keep two seconds behind the car in front
    // (`sc-junction-gap/mobile-wrong/04-t100s.png` — the footway crash;
    // `sc-pk-ban-stop/pc-wrong/08-debrief.png` — two crashes, one corrective).
    // Under doc 64 THEO-4 a WRONG corrective is worse than a bare one.
    // Nothing was taken away: the two-second rule is still here, as the branch
    // that owns it. Same construction as RAIL_CROSSING_VIOLATION's corrective,
    // which already walks its three acts, and the reason both must: this slot
    // has no per-event channel — `makeViolation` stamps title/explanation/lawRef
    // onto the event and there is nowhere for a fourth string to ride. Giving it
    // one is a change to `rules/types.ts` + the two display files and is filed,
    // not smuggled in here.
    correctiveBg:
      "Карай така, че винаги да имаш къде да спреш: гледай далеч напред и намалявай ПРЕДИ конфликтните точки — кръстовища, пътеки, паркирани коли — а не в тях. Зад друга кола това е дистанция от 2 секунди. Към пешеходец или велосипедист — сваляй скоростта, преди да си сигурен, че са те видели, и им остави странично разстояние. А тръгне ли колата извън платното към бордюр, стълб, дърво или ограда, произшествието вече е започнало: връщай поглед и волан към средата на лентата рано, не в последния метър.",
    // чл. 20, ал. 2 named: „…за да бъдат в състояние да спрат пред всяко
    // предвидимо препятствие. Когато възникне опасност за движението, водачите
    // са длъжни незабавно да намалят скоростта…"
    lawRef: "ЗДвП чл. 20, ал. 2",
    realWorldBg:
      "Извън изпита произшествието си има собствена глоба: ЗДвП чл. 179, ал. 2 наказва с глоба в размер 300 лв. водача, който „поради движение с несъобразена скорост, неспазване на дистанция, движение на заден ход или нарушение по ал. 1, както и при нарушение на чл. 20, ал. 1 причини пътнотранспортно произшествие… ако деянието не съставлява престъпление“. Последните четири думи са важните: с пострадал човек случаят излиза от ЗДвП и минава в Наказателния кодекс.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
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
    // NO ROAD RULE IS BROKEN BY A STALL, and that is worth a student knowing:
    // this is an exam-sheet fault, not an offence. The only thing it touches in
    // ЗДвП is the general control duty at чл. 20, ал. 1. The old string,
    // „Наредба № 38 (второстепенни грешки — загасване на двигателя)", implied
    // приложение № 5 enumerates second-order faults and names stalling among
    // them; it does not — б. „б" is one sentence of DEFINITION with no list, so
    // the parenthetical was an invented enumeration. The наредба now appears
    // only through `examMarkFor().citationBg`, in its canonical clause form.
    lawRef: "ЗДвП чл. 20, ал. 1",
    conceptId: "c-vehicle-controls",
  },
  MOVE_OFF_WITHOUT_OBSERVATION: {
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Потегляне без оглеждане",
    // THE EXPLANATION NAMES BOTH HALVES, because since 2026-09-01 the detector
    // grades both (rules/engine.ts §1b: a mirror AND the shoulder check). It
    // used to say „огледалата" alone while `correctiveBg` below already said
    // „и към мъртвата зона" — so a student who mirrored, skipped the blind spot
    // and was convicted read a verdict that did not describe what he had done.
    // No new law is claimed: the lawRef is the same retrieved ЗДвП чл. 25, ал. 1.
    explanationBg:
      "Потегли от място, без да направиш пълния оглед непосредствено преди тръгване: огледало И поглед през лявото рамо. Точно в този момент отзад може да приближава кола, колоездач или мотор — а мъртвата зона зад лявото рамо не се вижда в НИТО едно огледало. Потеглянето е маневра и изисква и двете.",
    correctiveBg:
      "Преди да потеглиш: поглед в лявото огледало и към мъртвата зона, мигач и чак тогава тръгвай. Проверката е последното действие преди колелата да се завъртят, не преди половин минута.",
    // чл. 25, ал. 1 names this maneuver: „да излезе от реда на паркираните
    // превозни средства…, преди да започне маневрата, трябва да се убеди, че няма
    // да създаде опасност за участниците в движението".
    lawRef: "ЗДвП чл. 25, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 — водач, който „неправилно се включва в движението“. Точно това е потеглянето от място без оглеждане.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 14"],
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
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
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
    // CITATION CORRECTED 2026-08-09. The old string named only the penalty
    // ordinance — and named it with an invented enumeration („второстепенни
    // грешки — настъпване на осева линия"): приложение № 5, б. „б" is a
    // one-sentence definition and lists nothing. The rule broken here is the
    // MARKING, exactly as for its heavier sibling CROSSED_SOLID_LINE, so the two
    // adjacent codes now cite the same rule and differ only in the clause their
    // points come from (`examMarkFor`: б. „б" here, б. „а" there).
    lawRef: "ППЗДвП надлъжна пътна маркировка (М1 — единична непрекъсната линия)",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „нарушава правилата за разположение на пътно превозно средство върху платното за движение“.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 2"],
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
    // THE CITATION CONTRADICTED THE CHARGE, and this is the second finding of
    // the sweep. The old string was „Наредба № 38 (рязко спиране — предпоставка
    // за ПТП)". „Създаде предпоставка за допускане на ПТП" is verbatim the
    // FIFTH of the six cases in б. „в", the clause that costs 10 points — while
    // this row bills 3 and `n38.ts` grounds it under б. „а". The row was citing
    // the ten-point clause and charging three, and the naming was also invented
    // (б. „в" enumerates six cases and none of them is „рязко спиране").
    // n38.ts's own rationale settles which way to resolve it: the detector
    // convicts only after excluding every visible cause, so what remains is a
    // causeless action, not an established предпоставка — and if a предпоставка
    // HAD been established, the event would be COLLISION or
    // CLOSING_ON_LEAD_TOO_FAST. The class stays 3; the citation moves to the
    // rule actually broken, чл. 20, ал. 1 (continuous control of the vehicle).
    lawRef: "ЗДвП чл. 20, ал. 1",
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
    // THE ONE ROW THAT HONESTLY CITES ONLY THE НАРЕДБА, and it must stay that
    // way: sitting still on green breaks no rule in ЗДвП or ППЗДвП — there is
    // no duty to move off, only a duty not to obstruct while MOVING (чл. 22,
    // ал. 1, which speaks of „да се движи… с твърде ниска скорост"). It is a
    // pure exam-sheet fault, so the exam ordinance IS the rule, cited in the
    // canonical clause form instead of the old invented „(второстепенни грешки
    // — закъснели действия)". A student learning that this costs a point on the
    // sheet and nothing on the street is learning something true.
    lawRef: "Наредба № 38 приложение № 5, т. 10, б. „б“",
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
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    realWorldBg:
      "Жълтото не разрешава преминаване, затова извън изпита цената е същата като на червено: глоба 150 лв. по ЗДвП чл. 183, ал. 5 за водач, който „преминава при сигнал на светофара, който не разрешава преминаването“; повторно — глоба в размер 300 лв. и лишаване от право да управлява за срок един месец (ал. 6). Изключението е тясно: то важи само когато спирането вече е било невъзможно.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 5, т. 1", "ЗДвП чл. 183, ал. 6"],
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
    // чл. 6, т. 2 is the DUTY („изпълняват разпорежданията на лицата,
    // упълномощени да регулират… НЕЗАВИСИМО от светлинните сигнали, пътните
    // знаци, маркировката на пътя и правилата за движение"); чл. 7, ал. 1 is
    // the hierarchy this lesson teaches („Когато има несъответствие между
    // сигналите на регулировчика и светлинните сигнали… се съобразяват със
    // сигналите на регулировчика"). Bare чл. 7 named only the tie-break.
    // NO `realWorldBg`: the penalty articles were searched and none names the
    // регулировчик on the DRIVER side — чл. 184 does, but it is the pedestrian
    // article, and чл. 179, ал. 1, т. 5 reaches „пътните знаци, пътната
    // маркировка и другите средства за сигнализиране", which a person is not.
    // The residual чл. 185 may well apply; asserting it would mean asserting
    // that nothing else does, which is not a retrieval. Left blank on purpose.
    lawRef: "ЗДвП чл. 6, т. 2; чл. 7, ал. 1",
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
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    realWorldBg:
      "Червено + жълто също не разрешава преминаване, така че извън изпита цената е глоба 150 лв. по ЗДвП чл. 183, ал. 5 („преминава при сигнал на светофара, който не разрешава преминаването“), а повторно — глоба в размер 300 лв. и лишаване от право да управлява за срок един месец (ал. 6).",
    realWorldRefs: ["ЗДвП чл. 183, ал. 5, т. 1", "ЗДвП чл. 183, ал. 6"],
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
    // CITATION CORRECTED 2026-08-09: this cited чл. 23, whose ал. 1 is about a
    // MOVING vehicle ahead — „да се движи на такова разстояние от движещото се
    // пред него друго превозно средство, че да може да спре зад него". This
    // detector arms only at v ≈ 0 behind a STOPPED lead (engine.ts: the moving
    // queue is FOLLOWING_TOO_CLOSE's business, explicitly, so there is no
    // double-bill) — so чл. 23 is not the rule this act breaks. Nothing in ЗДвП
    // is: standing too close in a queue is a judgement fault the exam sheet
    // marks, which is what the citation now says.
    lawRef: "Наредба № 38 приложение № 5, т. 10, б. „б“",
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
    // CITATION CORRECTED 2026-08-09: this cited чл. 74 — the FOG-LAMP article,
    // which says nothing about long beams. The dipping duty is чл. 70, ал. 2,
    // retrieved verbatim: „Използването на дългите светлини е забранено: … 3.
    // при движение зад друго моторно превозно средство на разстояние, по-малко
    // от 50 метра." The alinea is named rather than т. 3 because the detector's
    // own threshold (highBeamDipMaxGapM = 150 m) is т. 1's разминаване figure,
    // not т. 3's 50 m — citing т. 3 would promise a boundary the runtime does
    // not honour. Reconciling the two is an engine change, filed, not smuggled
    // in behind a citation edit.
    lawRef: "ЗДвП чл. 70, ал. 2",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 180, ал. 1 за нарушени правила за използване на светлините, но само „когато в резултат на нарушението е създадена непосредствена опасност за движението“ — а заслепеният отпред е точно това.",
    realWorldRefs: ["ЗДвП чл. 180, ал. 1, т. 1"],
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
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 за водач, който „при неправилно изпреварване не създава опасност за движението“ — и глоба в размер 200 лв. по чл. 179, ал. 1, т. 5, ако от неспазените правила за изпреварване „е създадена непосредствена опасност“. Разликата между 50 и 200 лв. е буквално дали е имало кой да пострада.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 6", "ЗДвП чл. 179, ал. 1, т. 5"],
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
    lawRef: "ЗДвП чл. 23, ал. 1; чл. 20, ал. 2",
    realWorldBg:
      "Извън изпита: самото топене на дистанцията няма собствена глоба, но чл. 179, ал. 2 наказва с глоба в размер 300 лв. водача, който „поради движение с несъобразена скорост, неспазване на дистанция… причини пътнотранспортно произшествие… ако деянието не съставлява престъпление“.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
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
    lawRef: "ЗДвП чл. 23, ал. 1; чл. 20, ал. 2",
    realWorldBg:
      "Извън изпита: глоба в размер 300 лв. по ЗДвП чл. 179, ал. 2, ако от „движение с несъобразена скорост, неспазване на дистанция“ излезе пътнотранспортно произшествие и деянието не съставлява престъпление.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
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
    // CITATION CORRECTED 2026-08-09. This cited чл. 98, and чл. 98, ал. 1 was
    // read in full: it is a CLOSED list of eight places where the LAW ITSELF
    // bans stopping (junctions, crossings, bridges, tram rails, …) and it
    // contains no sign-based case at all. This detector arms on nothing but
    // `tick.noStopZone` — an authored В27 span — so чл. 98 named a rule the
    // runtime never establishes. What a В27 zone breaks is the duty to obey the
    // sign: чл. 6, т. 1. The sign's own meaning lives in an ordinance the corpus
    // does not hold, so it is named by SUBJECT, per content/law/README.md and
    // exactly as STOP_SIGN_NO_FULL_STOP names Б2.
    lawRef: "ЗДвП чл. 6, т. 1; Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак В27",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „неправилно престоява или е паркирал неправилно“. Ако спрялата кола е създала непосредствена опасност за движението, чл. 180, ал. 1 налага глоба 100 лв.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 1", "ЗДвП чл. 180, ал. 1, т. 1"],
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
    // CITATION CORRECTED 2026-08-09, and it matters for the record because this
    // row is the yardstick the CROSSED_SOLID_LINE downgrade was measured
    // against. чл. 43 was read in full: it bans overtaking in six enumerated
    // SITUATIONS (short sighting distance, equal-road junction, unguarded rail
    // crossing, no room to return, before/on a crossing) and names no sign;
    // чл. 42 is the procedure a lawful overtake must follow. The detector arms
    // on nothing but `tick.noOvertakeZone` — an authored В24 span — so neither
    // article was the rule it establishes. The ban that В24 carries is binding
    // through чл. 6, т. 1, and the sign's own meaning sits in an ordinance the
    // corpus does not hold, hence the subject-level second clause.
    lawRef: "ЗДвП чл. 6, т. 1; Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак В24",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 за водач, който „при неправилно изпреварване не създава опасност за движението“. Създаде ли опасност, отива в чл. 179, ал. 1, т. 5 — глоба в размер 200 лв. Знакът В24 стои точно там, където второто е по-вероятно от първото.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 6", "ЗДвП чл. 179, ал. 1, т. 5"],
    conceptId: "c-overtaking-prohibitions",
  },
  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b; doc 72 OV-04/SN-03/SN-05) ----
  CROSSED_SOLID_LINE: {
    // DOWNGRADED опасна (10) → основна (3), 2026-08-09. See `n38.ts`
    // (N38_BASIS.CROSSED_SOLID_LINE) for the full argument; the short form:
    //
    // Наредба № 38, приложение № 5, т. 10, б. „в" is a CLOSED enumeration of
    // six cases. This act is none of the five concrete ones (it is expressly
    // NOT case 2 — the detector requires `tick.oneway === false`, while the
    // clause names „пътен възел или път с ЕДНОПОСОЧНО движение"), so the only
    // hook was case 5, „създаде предпоставка за допускане на ПТП". The
    // detector establishes no предпоставка whatever: authored М1 span +
    // opposing bank + 0.6 s, with no other road user required and none
    // queried. The 0.6 s in `solidLineCrossSustainSec` is documented as a
    // paint-flicker guard — it answers „did he really cross", never „was it
    // dangerous", which is the only question б. „в" asks.
    //
    // The catalogue's own contradiction settles which way to resolve it:
    // OVERTAKING_IN_BAN_ZONE — знак В24, the EXPLICIT statutory ban on
    // overtaking — requires a denoised lane change AND a lead vehicle to
    // overtake (engine.ts `overtakeBeat(cfg.banOvertakeLeadGapM)`) and bills
    // основна. Charging 10 for bare position across paint while charging 3
    // for a measured overtake against a real car inside a signed ban is
    // upside down under any reading of т. 10. б. „а" fits exactly: „неправилни
    // действия, породени от липсата на знания" — М1 не се пресича is knowledge.
    //
    // WHAT THIS DOES NOT LOSE: the head-on gamble across a solid line was
    // never measured here anyway. worldRuntime's corridor tracker is disabled
    // inside М1 spans (`tick.solidCenterLine !== true`), so no scenario today
    // converts a real oncoming conflict on a solid span into points — the 10
    // came from geometry alone. A genuine impact still bills COLLISION (10,
    // terminating). Closing that hole is a worldRuntime change, filed as a
    // follow-up, not smuggled in behind a severity edit.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Пресичане на непрекъсната осева линия",
    explanationBg:
      "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното. Единичната непрекъсната линия (М1) не се застъпва и не се пресича — тя стои точно там, където насрещното движение или видимостта правят навлизането отсреща опасно.",
    correctiveBg:
      "Плътна линия = стена: остани в своята лента, дори предният да пълзи. Изпреварвай или заобикаляй чак където линията стане прекъсната — а дотогава дръж средата на лентата и дистанция за спокойно следване.",
    lawRef: "ППЗДвП надлъжна пътна маркировка (М1 — единична непрекъсната линия)",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 — водач, който „нарушава правилата за разположение на пътно превозно средство върху платното за движение“. Ако от навлизането в насрещната половина е създадена непосредствена опасност, чл. 179, ал. 1, т. 5 налага глоба в размер 200 лв. за неспазено предписание на маркировката.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 2", "ЗДвП чл. 179, ал. 1, т. 5"],
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
    // CITATION CORRECTED 2026-08-09, and the old one pointed the wrong way. Bare
    // „чл. 15" leads with ал. 1 — „използва най-дясната свободна лента" — which,
    // read alone, tells the student to drive INTO the bus lane. The ban is
    // ал. 6, retrieved verbatim: „Когато пътна лента е сигнализирана за движение
    // само на превозни средства от редовните линии за обществен превоз на
    // пътници, се забранява движението на други пътни превозни средства, с
    // изключение на пътните превозни средства, извършващи случаен или
    // специализиран превоз на деца и/или ученици."
    lawRef: "ЗДвП чл. 15, ал. 6",
    realWorldBg:
      "Извън изпита бус лентата е глоба 100 лв. — ЗДвП чл. 183, ал. 4 наказва водач, който „управлява моторно превозно средство по пътна лента, сигнализирана за движение само на пътни превозни средства от редовните линии… без да има право на това“. Това е и едно от нарушенията, които автоматизирано техническо средство може да установи и заснеме само (чл. 189б), тоест фишът пристига по пощата.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 12", "ЗДвП чл. 189б"],
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
    //
    // ONE CODE IS FINE; ONE *STRING* WAS NOT (catalogue sweep, 2026-08-16).
    // The sweep drove both shipped rail lessons and photographed the same
    // defect from two sides. `sc-rx-guarded/pc-wrong/08-debrief.png`: a lesson
    // whose title, briefing and objectives are all «Охраняем прелез с бариера»
    // convicted with a card that OPENED „Пред прелез БЕЗ бариери спираш
    // напълно…" — the student was taught a rule that does not govern the
    // crossing he had just driven through. `sc-rx-unguarded/mobile-right/
    // 08-debrief.png`: a drive with 23 full stops and a ✓ on «Спри напълно на
    // стоп-линията преди релсите» was convicted for resting ON the rails and
    // read the same opening sentence — the copy described the OPPOSITE of what
    // it had done, and nowhere on either screen did it say which of the three
    // acts it had actually committed.
    //
    // The three acts already travel apart: `engine.ts` stamps every event with
    // `detail` ("no-stop" | "entered-barred" | "stopped-on-track"), so the
    // discriminator was on the wire and only the copy was pooled. The split
    // lives in RAIL_CROSSING_ACT_COPY below and is applied by `makeViolation`,
    // NOT at the call sites: the copy then follows the code by construction,
    // for the procedures machine and any future producer too.
    //
    // THIS STRING IS NOW THE CONTROL-NEUTRAL ONE — the JUNCTION_SCAN_INCOMPLETE
    // discipline exactly (see its note): it is read BY CODE, with no event in
    // hand (tutor/retrieval, lesson/resolve, clipPlanBuilder), so it must be
    // true of all three acts and may assert none of them. It teaches the three
    // rules as rules; the per-act copy says which one was broken.
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Нарушение на правилата за жп прелез",
    explanationBg:
      "Наруши правилата за преминаване през железопътен прелез — най-опасното кръстовище на пътя, защото едната страна не може нито да спре, нито да завие. Правилата са три и всяко е купено с животи: пред прелез БЕЗ бариери спирането е задължително и се оглеждаш по линията в двете посоки — ти си бариерата; при спуснати, спускащи се или вдигащи се бариери и при мигаща червена светлина не се навлиза, независимо колко празен изглежда коловозът; и не се тръгва през прелеза, ако не си сигурен, че ще излезеш от другата страна, без да спираш върху релсите.",
    correctiveBg:
      "Пред прелез: намали отрано. Без бариери — спри напълно преди релсите, огледай наляво и надясно по линията и премини решително, без да спираш върху коловоза. С бариери — изчакай зад стоп-линията, докато се вдигнат напълно, и премини едва когато прелезът е чист.",
    // THE RANGE BECAME THREE NAMED ALINEAS, 2026-08-09. „чл. 51–53" resolves to
    // чл. 51 and nothing else in every checker in this repo, so two thirds of
    // the citation was decorative. The three graded acts each have their own
    // provision, retrieved verbatim: the mandatory stop where there are no
    // barriers is чл. 51, ал. 3 („Спирането на пътните превозни средства е
    // задължително пред железопътен прелез, който няма бариери"); entering while
    // barred or on a flashing red is чл. 52; and coming to rest on the rails is
    // чл. 53, ал. 2. NO DISTANCE IS QUOTED IN THE COPY — чл. 51, ал. 4 does give
    // one („не по-малко от 2 метра преди първата релса", 1 m at a barrier), but
    // the detector does not measure it, and this is the exact place where an
    // earlier wave invented a „50 метра" that exists in no act.
    lawRef: "ЗДвП чл. 51, ал. 3; чл. 52; чл. 53, ал. 2",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 180, ал. 1 за водач, който „наруши правилата… за преминаване през железопътен прелез“. Глобата е малка; цената на грешката не е — влакът не може нито да спре навреме, нито да те заобиколи.",
    realWorldRefs: ["ЗДвП чл. 180, ал. 1, т. 3"],
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
    realWorldBg:
      "Извън изпита препоръчителната скорост не се глобява сама по себе си — тя е препоръка, не ограничение. Но излетиш ли от завоя, чл. 179, ал. 2 наказва с глоба в размер 300 лв. водача, който „поради движение с несъобразена скорост… причини пътнотранспортно произшествие… ако деянието не съставлява престъпление“. Точно затова табелата съществува.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 2"],
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
  DRIVING_TOO_SLOW_IN_TOWN: {
    // THE ROW THE ENVELOPE WAS MISSING (audit sc-vu-emergency-junction:853790f7,
    // 2026-09-01). Its motorway sibling above has existed since the SP-10 slice;
    // what did not exist was the town half, so a car held at 10–11 км/ч for two
    // minutes on a street posted 40 booked nothing at all while the flat-out
    // leg of the same lesson was billed once a tick.
    //
    // LAW: the SAME retrieval as the sibling, and чл. 22 is NOT a motorway
    // article — it sits in Глава втора, Раздел IV („Скорост на движение"), the
    // same раздел as чл. 21's table of limits:
    //
    //   ЗДвП чл. 22, ал. 1: „Водачът на пътно превозно средство не трябва да се
    //   движи без основателна причина с твърде ниска скорост, когато по този
    //   начин пречи на движението на другите пътни превозни средства."
    //   ЗДвП чл. 22, ал. 2: „Водач на пътно превозно средство, което се движи с
    //   ниска скорост и поради това причинява създаването на колона от пътни
    //   превозни средства, трябва да ги пропусне при първа възможност."
    //
    // ал. 2 is quoted in the copy because it is the half a student can act on:
    // the law does not order him to go faster than he can manage, it orders him
    // to LET THE QUEUE PAST. That is the taught behaviour, and it is why this
    // row is второстепенна rather than основна — по Наредба № 38, б. „б" the
    // deed is a правилно, но неточно действие от недостатъчен опит (n38.ts).
    //
    // NO FIGURE IS INVENTED. Bulgaria has no general minimum speed; the
    // detector's floor is derived from the POSTED plate (engine.ts
    // `townCrawlFractionOfLimit`) and appears nowhere in this copy. The one
    // number below — «30–40 км/ч в зона 50» — is a driving instruction about
    // the flow, not a claim about the law, and it is written as such.
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Движение с необосновано ниска скорост",
    explanationBg:
      "Пълзеше дълго време далеч под скоростта на движението по улица, на която нищо не те задържаше — нямаше кола отпред, пешеходец, кръстовище или лоши условия. Задължителна минимална скорост няма, но законът забранява движение без основателна причина с твърде ниска скорост, когато с това пречиш на другите (ЗДвП чл. 22, ал. 1). Опасното не е бавното само по себе си, а какво предизвиква то у останалите: зад теб се събира колона, някой губи търпение и предприема изпреварване там, където не е място за него — до тротоар, до спирка, до пешеходна пътека. Твоята предпазливост става чужд риск. Затова чл. 22, ал. 2 добавя изричното задължение: щом заради теб се е образувала колона, пропусни я при първа възможност.",
    correctiveBg:
      "Ако нищо не те спира, върви със скоростта на потока — в зона 50 това обикновено са 30–40 км/ч. Ако още не се чувстваш готов за това темпо, не се влачи в потока: отбий вдясно на първото безопасно място, пусни колоната да мине и продължи спокойно зад нея.",
    lawRef: "ЗДвП чл. 22, ал. 1",
    conceptId: "c-speed-limits",
  },
  STOPPED_WITHOUT_CAUSE: {
    // THE LIMIT CASE OF THE TWO ROWS ABOVE (audit sc-jx-priority-confidence:
    // 9c987e7b). Both crawl detectors require the car to be MOVING, so the one
    // thing neither of them can see is a car that has stopped. On the lesson
    // titled „По пътя с предимство — без излишни спирания" that blind spot was
    // the whole lesson: the credited drive stood still through most of 88 s on
    // an open priority arm and booked «Второстепенни 0 0».
    //
    // LAW, and it is NOT the чл. 22 the crawl rows cite. чл. 22, ал. 1 governs a
    // driver who „се движи… с твърде ниска скорост"; this car is not moving.
    // Retrieved instead (`content/law/acts/zdvp.json`, чл. 24):
    //
    //   ал. 1: „Водачът на пътно превозно средство не трябва да намалява
    //   скоростта рязко, освен ако това е необходимо за предотвратяване на
    //   пътнотранспортно произшествие."
    //   ал. 2: „Преди да намали значително скоростта на движение на управляваното
    //   от него пътно превозно средство, водачът е длъжен да се убеди, че няма да
    //   създаде опасност за останалите участници в движението и че няма да
    //   затрудни излишно тяхното движение."
    //
    // ал. 2 is the row's rule: „затрудни излишно тяхното движение" is the
    // lesson's „излишни спирания" in the act's own words, and it is the half a
    // student can act on — the duty is to LOOK BEHIND before shedding speed, not
    // to never slow down. ал. 1 is cited nowhere here on purpose: the ABRUPT
    // half is HARSH_BRAKING_NO_CAUSE's row, and this detector convicts a car
    // that is already still, however gently it got there.
    //
    // второстепенна, б. „б" (n38.ts): stopping is a правилно действие performed
    // where it was not called for, which is the clause's own definition.
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Спиране без причина на открит път",
    explanationBg:
      "Спря и остана на място в активна лента, а пред теб нямаше нищо — нито кола, нито пешеходец, нито кръстовище, светофар или знак, който да те задължава. Спирането без причина не е предпазливост: то е единственото нещо на пътя, което другите не могат да предвидят. Зад теб хората четат скоростта ти, не мислите ти — затова законът иска обратното: преди да намалиш значително скоростта, „водачът е длъжен да се убеди, че няма да създаде опасност за останалите участници в движението и че няма да затрудни излишно тяхното движение“ (ЗДвП чл. 24, ал. 2). Когато си на път с предимство, спирането е двойно по-скъпо: кръстовището работи само защото този с предимството минава, а колата зад теб очаква точно това.",
    correctiveBg:
      "Ако нищо не те спира, не спирай — премини равномерно. Готовността се показва с крак над спирачката и по-ранно вдигане на газта, не с престой в лентата. А ако наистина трябва да спреш (лошо ти е, объркал си пътя), първо погледни в огледалото, отбий вдясно на място, където не пречиш, и чак тогава спри.",
    lawRef: "ЗДвП чл. 24, ал. 2",
    conceptId: "c-sudden-braking-slow-driving",
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
    //
    // THE 10 WAS RE-EXAMINED 2026-08-09 AND KEPT — full argument in `n38.ts`
    // (N38_BASIS.EMERGENCY_LANE_DRIVING `contestedBg`), because the same wave
    // demoted CROSSED_SOLID_LINE for having a detector of this exact shape
    // (position + sustain, no other road user). They are not the same case.
    // б. „в" case 5 asks for a ПРЕДПОСТАВКА: the opposing half of a two-way
    // road is lawful travel space FOR SOMEBODY ELSE, so whether entering it is
    // a предпоставка depends on whether anyone is coming — the very fact the
    // М1 detector never established. The лента за принудително спиране is
    // travel space for NOBODY: it is legally defined as where vehicles stand
    // stopped and unannounced, and where the ambulance comes through. The
    // thresholds differ in kind too — 0.6 s of documented paint-flicker guard
    // there, 3 s here, which at 100 km/h is 83 m of TRAVEL along the refuge
    // lane, i.e. the act чл. 58, т. 4 actually names.
    // WHAT THE REVIEW DID FIND BROKEN, AND IS NOW FIXED: чл. 58 opens „при
    // движение по автомагистрала", while the detector armed on the authored
    // emergencyLane span alone — so a span authored on an urban street would
    // have billed 10 citing a motorway-only article. `engine.ts` now also
    // requires `tick.motorway === true`; byte-identical on all three shipped
    // spans (mw-v1 / mw-entry-v1 / mw-exit-v1 are all `motorway: true`).
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Движение по аварийната лента",
    explanationBg:
      "Движеше се по лентата за принудително спиране. Тя не е „още една лента“ — по нея е забранено да се кара, защото трябва да остане свободна за аварирали коли, линейки и пожарна. Точно при задръстване, когато изкушението е най-голямо, тя е най-необходима.",
    correctiveBg:
      "Остани в лентите за движение, дори потокът да пълзи — аварийната лента се използва само при принудително спиране: изтегляш се, спираш, включваш аварийните светлини. За изпреварване тя не съществува.",
    lawRef: "ЗДвП чл. 58, т. 4",
    realWorldBg:
      "Това е най-скъпото нарушение в целия каталог и повечето шофьори не го знаят: ЗДвП чл. 178ж, ал. 1 наказва „с лишаване от право да управлява моторно превозно средство за срок от три месеца и глоба 1000 лв.“ водача, който се движи в лентата за принудително спиране по автомагистрала без изключенията по чл. 58, т. 3. Повторно — 6 месеца и глоба 4000 лв. (ал. 2). Двадесет спестени минути в задръстване струват книжката за едно лято.",
    realWorldRefs: ["ЗДвП чл. 178ж, ал. 1", "ЗДвП чл. 178ж, ал. 2"],
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
    // POINTS NARROWED 2026-08-09 from bare „чл. 42, ал. 1". Both halves are now
    // named and both were retrieved: ал. 1, т. 2 is the precondition the
    // detector measures — „да се убеди, че има видимост, свободен път на
    // разстояние, достатъчно за изпреварване" — and ал. 2, т. 2 is the duty
    // toward the car coming the other way: „когато при изпреварването навлиза в
    // пътна лента, предназначена за насрещното движение, да не създава опасност
    // или пречки за превозните средства, движещи се по нея."
    lawRef: "ЗДвП чл. 42, ал. 1, т. 2; чл. 42, ал. 2, т. 2",
    realWorldBg:
      "Извън изпита това е тежката страна на скалата: чл. 179, ал. 1, т. 5 наказва с глоба в размер 200 лв. водача, който не спазва „правилата… за изпреварване… ако от това е създадена непосредствена опасност за движението“ — а стигне ли се до удар, чл. 179, ал. 2 налага глоба в размер 300 лв., „ако деянието не съставлява престъпление“. При челен удар последната уговорка почти никога не важи.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 1, т. 5", "ЗДвП чл. 179, ал. 2"],
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
    // „изпреварваният не ускорява и не пречи").
    // POINTED PRECISELY 2026-08-09. The old note said ал. 2 „is NOT
    // bank-confirmable… so the honest cite is чл. 42 bare" — but the ACT is in
    // the corpus and does not need the bank's confirmation. чл. 42, ал. 1, т. 2
    // ends with exactly this fault, verbatim: „…и че може да заеме място в
    // пътната лента пред изпреварваното пътно превозно средство, БЕЗ ДА ГО
    // ПРИНУЖДАВА ДА НАМАЛЯВА СКОРОСТТА или да изменя посоката на движение."
    // That is the cut-in, named in the statute; чл. 42, ал. 3 is the other
    // side's duty and is not what this code grades.
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
    lawRef: "ЗДвП чл. 42, ал. 1, т. 2",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 за водач, който „при неправилно изпреварване не създава опасност за движението“; принуденото спиране на изпреварения го качва на чл. 179, ал. 1, т. 5 — глоба в размер 200 лв.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 2, т. 6", "ЗДвП чл. 179, ал. 1, т. 5"],
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
    // SHORTENED 2026-09-04 (sc-merge-from-property:6715b581 — the same peek
    // budget that shortened FAILED_TO_YIELD above) from «Изпреварване на
    // велосипедист без странична дистанция», 52 characters. That was the LAST
    // row in the catalogue that still wraps to THREE title lines on the phone
    // peek, i.e. 41.25 px of a 44 px window, which leaves the authored WHY zero
    // lines — the defect that row was filed for, one offence over.
    // `violation-title-fits-peek.test.ts` carries the arithmetic and now gates
    // it. The head is doc 72 VU-02's own name for the act („Тясно изпреварване
    // на колело"), not an invention, and «странична дистанция» is not lost: it
    // is the explanation's first sentence, which is the line that now reaches
    // the glass in its place.
    titleBg: "Тясно изпреварване на велосипедист",
    explanationBg:
      "Мина покрай велосипедиста почти без странично разстояние. Законът изисква ДОСТАТЪЧНА странична дистанция — учи се около 1,5 метра въздух: велосипедистът няма ламарина около себе си и може всеки миг да се отклони заради дупка, шахта или порив на вятъра. На половин метър всяко негово клатушкане е сблъсък.",
    correctiveBg:
      "Преди велосипедист: огледало, мигач наляво и се отмести с реален метър и половина — при нужда изчакай насрещния да мине и чак тогава изпреварвай. Няма ли място за широка дъга, остани зад него; никога не се провирай.",
    // ал. 2, т. 1 named — that is the sentence: „по време на изпреварването да
    // осигури достатъчно странично разстояние между своето и изпреварваното
    // пътно превозно средство".
    lawRef: "ЗДвП чл. 42, ал. 2, т. 1",
    realWorldBg:
      "Извън изпита: глоба 50 лв. по ЗДвП чл. 183, ал. 2 за водач, който „при неправилно изпреварване не създава опасност за движението“. Закачиш ли велосипедиста или го принудиш да се отклони, вече е чл. 179, ал. 1, т. 5 — глоба в размер 200 лв., а при ПТП чл. 179, ал. 2 — глоба в размер 300 лв.",
    realWorldRefs: [
      "ЗДвП чл. 183, ал. 2, т. 6",
      "ЗДвП чл. 179, ал. 1, т. 5",
      "ЗДвП чл. 179, ал. 2",
    ],
    conceptId: "c-cyclists",
  },
  WARNING_LAMP_IGNORED: {
    // N11 / doc 72 VP-06. LANDED 2026-09-02 (sc-vp-telltale-red:c172d48b) as
    // the SIX-PART change the note below specifies — emitter first. The
    // audit's sentence was the whole case: „a student who treats a red lamp as
    // a yellow one and keeps driving without crashing would be recorded as
    // faultless", and the only thing his debrief could name was a collision he
    // happened to have on the way.
    //
    // Н38 GROUNDING: б. „а" (основна, 3 т.), never б. „в". See `n38.ts`.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Продължаване с червена контролна лампа",
    explanationBg:
      "Червената контролна лампа светна в движение — а колата продължи нататък. Червеното не значи „до сервиза“, а „спри безопасно СЕГА“: прегрят двигател, спаднало налягане на маслото или отказала спирачна система стават опасни за минути, а не за километри. Продължиш ли, рискуваш двигателят да блокира или спирачките да откажат точно в движение — тогава колата вече не се управлява.",
    correctiveBg:
      "Щом светне ЧЕРВЕНА лампа: огледало, десен мигач, плавно намаляване и спиране плътно вдясно, после гаси двигателя. Жълтата лампа е другата половина на правилото — тя значи „внимателно, до сервиз“ и не иска аварийно спиране.",
    // RETRIEVED, not recalled (ADR-002): `content/law/acts/zdvp.json`, unit
    // „чл. 101", ал. 1 — „При възникване по време на движение на повреда или
    // неизправност в пътно превозно средство, която застрашава безопасността на
    // движението, водачът е длъжен да спре и да вземе мерки за нейното
    // отстраняване." The duty is literally „спри", which is what the red lamp
    // asks and what this code convicts the absence of. ал. 2 („може да
    // придвижи… до място за отстраняване") is the AMBER case and ал. 3
    // withdraws even that при опасни неизправности — one article carrying the
    // whole red/amber triage the lesson teaches.
    lawRef: "ЗДвП чл. 101, ал. 1",
    realWorldBg:
      "Извън изпита това е управление на технически неизправно ППС: глоба по ЗДвП чл. 179, ал. 6 — 50 лв. при незначителни, 200 лв. при значителни и 500 лв. при опасни неизправности. А ако повредата стане причина за произшествие, чл. 179, ал. 2 добавя глоба в размер 300 лв.",
    realWorldRefs: ["ЗДвП чл. 179, ал. 6", "ЗДвП чл. 179, ал. 2"],
    conceptId: "c-technical-condition",
  },
  POLICE_STOP_SIGNAL_IGNORED: {
    // doc 72 VP-11. LANDED 2026-09-04 (sc-vp-police-stop:44cfeff6) as the
    // SIX-PART change the note below specifies — emitter first, exactly as the
    // telltale twin above did on 2026-09-02. The audit's sentence was the whole
    // case: the wrong lane „is convicted for causing a collision, not for
    // disobeying the officer's stop signal … so a student who ignores the
    // officer without crashing would not be caught".
    //
    // Н38 GROUNDING: б. „а" (основна, 3 т.), never б. „в". See `n38.ts` — a
    // контролен орган with a стоп-палка is not the „регулировчик" of the
    // ten-point list's case 1, which is about a junction being directed.
    severityClass: "osnovna",
    points: SEVERITY_POINTS.osnovna,
    titleBg: "Подминаване на полицейски сигнал",
    explanationBg:
      "Униформен служител подаде сигнал за спиране — а колата подмина. Разпореждането не е покана: законът задължава водача да спре ПЛАВНО в най-дясната част на платното и да изчака указанията. Подминаването е опасно и само по себе си — служителят стои на платното и разчита, че ще спреш, а често спира точно заради нещо напред, което ти още не виждаш.",
    correctiveBg:
      "Видиш ли вдигната ръка или стоп-палка: огледало, десен мигач, плавно намаляване отрано и спиране плътно вдясно при служителя — двигателят работи, ръцете на волана, изчакваш указанията. Не се спира рязко насред платното и не се подминава „за да не се разправям“.",
    // RETRIEVED, not recalled (ADR-002): `content/law/acts/zdvp.json`, unit
    // „чл. 103" — „При подаден сигнал за спиране от контролните органи водачът
    // на пътно превозно средство е длъжен да спре плавно в най-дясната част на
    // платното за движение или на посоченото от представителя на службата за
    // контрол място и да изпълнява неговите указания." One sentence carrying
    // the whole VP-11 procedure: плавно, най-вдясно, изчакай указанията.
    // NOT чл. 170, ал. 3 — that defines the SIGNAL and is the OFFICER's duty,
    // so it belongs in a provenance note and never in this slot.
    lawRef: "ЗДвП чл. 103",
    realWorldBg:
      "Извън изпита това е отказ да изпълниш нареждане на органите за контрол: ЗДвП чл. 175, ал. 1, т. 4 — лишаване от право да управляваш за срок три месеца И глоба 200 лв. При повторно нарушение ал. 2 качва на срок 6 месеца и глоба 400 лв. Наказанието се налага с акт, не с фиш — лишаването изключва фиша.",
    realWorldRefs: ["ЗДвП чл. 175, ал. 1, т. 4", "ЗДвП чл. 175, ал. 2"],
    conceptId: "c-police-interaction",
  },
  /*
   * -------------------------------------------------------------------------
   * THE CODE THIS NOTE ASKED FOR HAS LANDED — kept as the worked example
   * (2026-09-04). Both halves are now shipped rows above:
   * `WARNING_LAMP_IGNORED` (2026-09-02) and `POLICE_STOP_SIGNAL_IGNORED`
   * (2026-09-04), each by following the six-part list below to the letter. The
   * list stays because it is the only written record of what a fault code costs
   * across this tree, and the next code that needs one will need all six parts
   * too.
   * -------------------------------------------------------------------------
   * (w8 added two, backed both out 2026-08-28 — the retrieval survived the
   *  revert and both halves have since been landed off it. Read the whole of
   *  what follows as a worked example, not as a plan.)
   * -------------------------------------------------------------------------
   *
   * WHAT WAS REMOVED AND WHY. Wave 8 added `POLICE_STOP_SIGNAL_IGNORED` and
   * `WARNING_LAMP_IGNORED` to `ViolationCode` (types.ts), two rows here and two
   * rows in `YIELD_PRAISE_SITUATION_COPY` below — and shipped NO EMITTER. No
   * runner produced either event, so on /simulator neither code could fire on
   * any drive: the dead-predicate class in its purest form. It also left the
   * tree red — `n38.ts` `N38_BASIS` is a TOTAL `Record<ViolationCode, N38Basis>`
   * and lost exhaustiveness (TS2739), the world-referent gate found both
   * accounted for by nothing, and the praise table's own „no row in the table is
   * dead" guard named them out loud. All four rows reverted rather than patched
   * around: an open row with a good address beats a fault code no student can
   * ever meet.
   *
   * THE LESSON THAT HAD NO CODE FOR ITS OWN SUBJECT — CLOSED 2026-09-04.
   *   sc-vp-police-stop  „Спиране по полицейски сигнал"  doc 72 VP-11
   *   (lessons/scenario/templates-cockpit.ts)
   * It was authored as a COMPLETION DRILL: the duty was graded ONLY as a
   * curb-side low-speed reachZone objective, and the wrong way through was
   * billed under the nearest available code — the police drill's own mistake
   * demo carried `codeRefs: ["NOT_KEEPING_RIGHT"]`, the author reaching for
   * lane discipline because nothing else existed. So a student who drove past
   * the officer, or drove on under a red lamp, and did not crash was not
   * convicted of the thing his lesson is about. Both now are.
   *
   * THE LAW — RETRIEVED, NOT RECALLED (ADR-002). Both articles were read out of
   * `content/law/acts/zdvp.json`. Whoever lands the codes inherits the retrieval,
   * but re-opens that file rather than trusting this comment if a word of the
   * quoted text is load-bearing.
   *
   *   POLICE_STOP_SIGNAL_IGNORED → SHIPPED 2026-09-04; the retrieval and the
   *     reasoning now live on the row itself, above. Re-verified against
   *     `content/law/acts/zdvp.json` before it landed — чл. 103 whole and
   *     чл. 175, ал. 1 + т. 4 — rather than copied from here, which is what the
   *     paragraph above asks of every reader. Two things the re-read confirmed
   *     and the plan had right: чл. 103 IS word for word the procedure VP-11
   *     teaches (плавно, най-вдясно, изчакай указанията), and чл. 170, ал. 3 is
   *     the OFFICER's duty — the signal's definition — so it stays out of the
   *     `lawRef` slot and out of `realWorldRefs`.
   *
   *   WARNING_LAMP_IGNORED → SHIPPED 2026-09-02; the retrieval and the reasoning
   *     now live on the row itself, above. Re-verified against
   *     `content/law/acts/zdvp.json` before it landed rather than copied from
   *     here, which is what the paragraph above asks of every reader.
   *
   *   НАРЕДБА № 38 GROUNDING FOR BOTH: б. „а" (основна, SEVERITY_POINTS.osnovna),
   *   NOT б. „в". The 10-point list is a CLOSED enumeration of six cases and
   *   neither act is in it — a контролен орган with a стоп-палка is not the
   *   „регулировчик" of case 1, and a lit lamp is nobody's „предпоставка за ПТП"
   *   until something else happens. Charging ten under case 5 would mean
   *   `conflictEvidence: "geometric"`, which n38.ts forbids on a ten-point code.
   *   Three points honestly grounded beat ten that are not.
   *
   *   WHAT WARNING_LAMP_IGNORED IS NOT: `ENGINE_STALLED` is the nearest shipped
   *   code and a different act entirely — a stall is the engine dying under the
   *   driver, this is the driver overruling the car, and it needs the car to KEEP
   *   GOING. The two must never co-fire.
   *
   * THE COMPLETE LIST — SIX PARTS, ONE CHANGE, OR NONE OF IT. This is the whole
   * reason the rows were backed out instead of left standing: the last attempt
   * was planned as two changes and only the cheap half shipped.
   *
   *   1. EMITTER — `orchestrator/runners.ts`. `PoliceStopRunner` (:2655) and
   *      `TelltaleStimulusRunner` (:3705) emit ZERO SimTick events today and say
   *      so in their own headers. Each must resolve its drill BOTH ways in the
   *      existing `prioritySituation` vocabulary: `{situation, violated: true}`
   *      on the pass-by / drive-on, `{situation, violated: false, yielded: true}`
   *      on the compliant pull-over. The `emergency` runner (:2579 praise, :2615
   *      bill) is the precedent to copy exactly. Situation keys as authored:
   *      "police-stop-signal" and "warning-lamp".
   *   2. ENGINE ARM — `rules/engine.ts`. Add both keys to MANOEUVRE_SITUATIONS
   *      (:4973) — neither act happens at a junction, so neither may be
   *      place-latched — and both arms to the situation→code chain at :4984,
   *      beside EMERGENCY_NOT_YIELDED and VULNERABLE_PASS_TOO_CLOSE.
   *   3. THIS FILE — the two `VIOLATIONS` rows (severityClass "osnovna",
   *      points SEVERITY_POINTS.osnovna, the lawRef / realWorldRefs above,
   *      conceptId "c-police-interaction" and "c-technical-condition") AND the
   *      two `YIELD_PRAISE_SITUATION_COPY` rows below. The compliant leg must be
   *      praised in the same breath as the charge, or the drill can only convict
   *      — THEO-4's failure mode with the sign reversed. Measured on
   *      sc-sig-controller-live/mobile-right: all three route objectives ticked
   *      and the sheet still read «COMMENDATIONS (0): (none credited)».
   *   4. N38 BASIS — `rules/n38.ts` `N38_BASIS` (:176) is a total record over
   *      `ViolationCode`, so a code with no basis row is a COMPILE ERROR. That is
   *      what caught this attempt. Both rows carry clause „а".
   *   5. WORLD REFERENT — `world/referents.ts`: either a `REFERENT_RULES` entry
   *      (:1312 — a `stagedActorRule` on the officer actor is the natural one for
   *      the police drill) or `NO_WORLD_REFERENT` (:114 — the telltale has no world
   *      body at all, the lamp being a cockpit channel, so exemption is the honest
   *      answer there). Plus the census pin in
   *      `world/__tests__/world-referent.gate.test.ts` (:469-471 — checked 46,
   *      exempt 14, total 60), which moves only with a written reason.
   *   6. THE CATALOGUE CENSUSES — `__tests__/consequences.test.ts` („covers every
   *      violation code"), `naredba-38-classification.test.ts`, `offences.test.ts`
   *      and `catalog-consequences.test.ts` each enumerate VIOLATIONS, each
   *      convicted this attempt, and each must be green before it is done.
   *
   *   ALL SIX, TWICE. `WARNING_LAMP_IGNORED` walked the list on 2026-09-02 and
   *   `POLICE_STOP_SIGNAL_IGNORED` on 2026-09-04. The police half took part 5's
   *   FIRST branch — `stagedActorRule(["policeStop"], …)` — because unlike the
   *   lamp the officer IS a world body, so a district that stages no officer
   *   must read INERT rather than exempt; and it needed one part the list does
   *   not name, `rules/consequences.ts`, without which `offences.test.ts`
   *   („leaves no catalogued code invisible to every census") refuses a bare
   *   authored лв. sentence. Call that part 7 for the next code.
   *
   * THE PLAN'S ADDRESSES RE-VERIFIED 2026-08-30 @ 527a6c5, AND EIGHT OF ITS
   * LINE NUMBERS HAD MOVED — the only reason this paragraph exists. A plan is a
   * routing document, and a routing document decays: `sc-vp-telltale:dcc20e98` and
   * `sc-vp-police-stop:44cfeff6` were re-confirmed STILL on the w17/wave-c
   * frames and handed to a lane owning THIS FILE ALONE, i.e. part 3 of six. That
   * lane cannot land any of it — `VIOLATIONS` is `Record<ViolationCode,
   * ViolationSpec>` and neither code is in the union, so a row added here is a
   * compile error before it is a dead predicate — and the one thing it could
   * check was whether the addresses the NEXT lane will follow still point at the
   * code. Measured against HEAD, one by one:
   *   · templates-cockpit.ts  :571/:748/:714  →  :762/:942/:832
   *   · engine.ts             :4482/:4494     →  :4973/:4984
   *   · referents.ts          :1283/:86       →  :1312/:114
   *   · world-referent.gate   :456-458        →  :469-471, AND ITS ARITHMETIC
   *     CHANGED: 13 exempt / 59 total is now 14 / 60, because `OFF_CARRIAGEWAY`
   *     landed on 2026-08-30 (56cc3f8) and took the exemption. Whoever adds
   *     these two codes moves the pin from 14/60, not from 13/59; the old figure
   *     would have been re-pinned by hand and looked deliberate.
   * UNMOVED and re-checked rather than assumed: `runners.ts` :2655 / :3705 (both
   * still emit zero SimTick events — the class docs saying so are still there),
   * the `emergency` precedent at :2579 praise / :2615 bill, `n38.ts` :176, and
   * the three classroom consumers below (compose.ts :61/:63, interrupt.ts :152;
   * resolve.ts is :153 now, one line).
   *
   * THE CLASSROOM HALF THAT WENT WITH THEM — the one thing genuinely lost.
   * `lesson/compose.ts:61 rulesByConcept()` reads `conceptId` off THIS table to
   * answer „while I am teaching c-…, which graded fault is this, what does it
   * cost, and what was the right action?". `c-police-interaction` and
   * `c-technical-condition` existed in content/concepts.json and
   * content/sections.json with no catalogue row, so those two lesson beats
   * taught with no rule opinion at all. BOTH ARE CLOSED NOW — the two rows
   * above carry those exact `conceptId`s, which is the „side effect" the last
   * sentence of this paragraph promised. It could NOT be kept on its own:
   * `VIOLATIONS` is
   * `Record<ViolationCode, ViolationSpec>`, so a row needs a real code, and every
   * consumer keys off `VIOLATIONS` and nothing else (compose.ts:63,
   * lesson/resolve.ts:152, lesson/interrupt.ts:152) — a parallel table would have
   * been one more predicate nothing reads, which is the very defect being backed
   * out here. Landing the six parts above closes the classroom gap as a side
   * effect; nothing else does.
   */
  PREDRIVE_STEP_SKIPPED: {
    severityClass: "vtorostepenna",
    points: SEVERITY_POINTS.vtorostepenna,
    titleBg: "Пропусната стъпка от подготовката",
    explanationBg:
      "Потегли, без да изпълниш стъпка от подготовката преди потегляне. Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала.",
    correctiveBg:
      "Мини пълния ред преди потегляне: седалка → огледала → колан → двигател → предавка → ръчна спирачка → оглеждане → потегляне. Нищо не се прескача.",
    // The pre-drive ritual is the EXAM protocol, not a ЗДвП article — чл. 20
    // carries only the general control duty (ал. 1). „Наредба № 38 (подготовка
    // преди потегляне)" came off 2026-08-09: приложение № 5 enumerates no
    // preparation checklist, the penalty source has its own slot
    // (`examMarkFor`), and a gloss that reads like an annex heading is the
    // same invented specificity the sweep removed everywhere else.
    lawRef: "ЗДвП чл. 20, ал. 1",
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
    lawRef: "ЗДвП чл. 137а, ал. 1",
    realWorldBg:
      "Извън изпита: глоба 100 лв. по ЗДвП чл. 183, ал. 4 за водач, който „не изпълнява задължението за използване на предпазен колан“ — или вози пътник, който не го е поставил.",
    realWorldRefs: ["ЗДвП чл. 183, ал. 4, т. 7"],
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
    // carries only the general control duty (ал. 1). „Наредба № 38 (подготовка
    // преди потегляне)" came off 2026-08-09: приложение № 5 enumerates no
    // preparation checklist, the penalty source has its own slot
    // (`examMarkFor`), and a gloss that reads like an annex heading is the
    // same invented specificity the sweep removed everywhere else.
    lawRef: "ЗДвП чл. 20, ал. 1",
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
  // The praise half of CONTROLLER_SIGNAL_VIOLATED. It shares that row's
  // `conceptId`, which is not decoration: `lessons/debrief.ts
  // commendationRiderFlags` qualifies a commendation whose concept the SAME
  // drive was also billed for, so a run that obeyed the officer at one line and
  // ignored him at the next gets „(✓)" and the rider, never a clean certificate.
  CONTROLLER_SIGNAL_OBEYED: {
    titleBg: "Правилно изпълнен сигнал на регулировчика",
    explanationBg:
      "Премина по разрешението на регулировчика, макар лампата да забраняваше — и това е правилното изпълнение, не нарушение. При несъответствие между него и светофара важи неговият сигнал: той вижда цялото кръстовище и вече е пуснал напречните посоки, така че чакането на „своето“ зелено е онова, което вкарва колата в тях.",
    conceptId: "c-signal-hierarchy",
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

/**
 * THE PRAISE SIDE HAD ONE TITLE FOR NINE DIFFERENT ACTS — round 10, 2026-08-24,
 * corrected 2026-08-25 after the adversarial pass.
 *
 * `w10-1/frames/sc-hz-accident-scene/mobile-right/08-debrief-p7.png`, read at
 * the pixels: «Похвали ✓ Правилно отстъпено предимство 0:33» on a lesson that
 * is a straight urban street past a crash scene — no junction, no crossing, no
 * priority sign, and `hz-accident-v1.json` holds zero intersections.
 *
 * ⚠ WHAT THE FRAME SHOWS IS THE TITLE, AND ONLY THE TITLE. The first draft of
 * this note said the card „then explained itself with «…безопасността на
 * кръстовище»", as if read off the same picture. It was read off line 1401 of
 * this file. Measured against the captured artefact:
 *
 *   grep -c "безопасността на кръстовище" _audit-debrief.json  →  0
 *   grep -c "безопасността на кръстовище" run.log              →  0
 *   section[aria-label="Похвали"] → «Правилно отстъпено предимство 0:33»
 *
 * It could not have held it: A COMMENDATION'S `explanationBg` HAS NO RENDERER
 * ANYWHERE IN THE PRODUCT. The census, run over every consumer of the type —
 * `lessons/engine.ts toHudEvents` maps a commendation to `{kind, titleBg}` and
 * drops the rest before the HUD sees it · `hud/HudToasts.tsx`'s commendation
 * branch prints `titleBg` · `hud/hudPreferences.ts` says so in its own words ·
 * `hud/SessionEndScreen.tsx` «Похвали» prints `titleBg` + clock ·
 * `lessons/debrief.ts commendationLines` builds `• ${title}` · `hud/FaultCard`
 * is typed `ViolationEvent` and never takes one. All SIX `CommendationCode`s
 * carry explanation prose no student has ever read (counted off the union in
 * types.ts, not off the adversarial pass's „eleven", which was the wrong
 * number), and the pooled junction sentence above is one of them. THAT IS AN
 * OPEN ROW, not a thing this table may pretend to fix:
 * authoring three more unread sentences here would have been prose with no
 * reader. So this table carries the TITLE and the CONCEPT — the two columns
 * with a proven live path — and nothing else.
 *
 * WHAT HE ACTUALLY DID is in the template: `SC_HZ_ACCIDENT_SCENE.staged` ends
 * with `SC_HZ_ACCIDENT_EMERGENCY`, and `EmergencyVehicleRunner` resolves with
 * `{ situation: "emergency", yielded: true }` (orchestrator/runners.ts) — he
 * made way for a special-regime vehicle at a crash site, which is чл. 104,
 * ал. 1, not a junction rule at all. `templates-vru.ts` records the same praise
 * on `sc-vu-emergency-junction` at 0:06 and 0:37.
 *
 * THE ASYMMETRY IS THE DEFECT, and it is visible in `engine.ts`'s own
 * `prioritySituation` case: the VIOLATED branch already picks one of five codes
 * by `e.situation` (EMERGENCY_NOT_YIELDED, OVERTAKE_INSUFFICIENT_GAP,
 * OVERTAKE_RETURN_TOO_EARLY, VULNERABLE_PASS_TOO_CLOSE, FAILED_TO_YIELD) while
 * the YIELDED branch has always pushed the single pooled
 * `YIELDED_TO_PRIORITY`. Nine situations reach that branch —
 *
 *   left-turn-oncoming · right-hand-rule · roundabout ×2   worldRuntime
 *   vulnerable-pass                                        worldRuntime
 *   give-way · cyclist-right-hook · narrow-meeting ·
 *   emergency                                              runners
 *
 * — and the pooled TITLE is right for the five that happen at a junction and
 * wrong for at least one that does not: «Правилно отстъпено предимство» told a
 * student who had passed a cyclist with real clearance that he had yielded
 * priority. THEO-4 forbids a card that announces a decision without explaining
 * it; a card that names the wrong act is that failure one step earlier.
 *
 * WHERE THE TITLE IS READ (the live path this table exists for, all three
 * measured in the tree rather than assumed):
 *   /simulator → `rules/engine.ts` → `lessons/engine.ts toHudEvents` →
 *     `LessonPlayShell.tsx` praise toast `lineBg` — on the glass mid-drive;
 *   → `summary.commendations` → `hud/SessionEndScreen.tsx` «Похвали»;
 *   → server rebuild → `lessons/debrief.ts commendationLines` «• …».
 *
 * NO NEW CODE, and that is deliberate rather than lazy: `world/referents.ts`
 * enumerates `COMMENDATIONS` as part of „every code the catalog can emit" and
 * binds each to a world referent, so four new codes would be four new rows in
 * another lane's census for a defect that is entirely about COPY. The
 * mechanism reused instead is this file's own `COLLISION_CONTACT_COPY`: one
 * code, a table keyed by the `detail` string the reducer already has in hand.
 *
 * …WHICH IS WHY THE SITUATION HAS TO CROSS THE WIRE, and that half was missing
 * from the first cut of this repair. The debrief the student reads is built
 * TWICE — the end screen's «Похвали» from the client's own events, the «Разбор»
 * text from the server's rebuild of the same log — and `rebuildRuleEvents`
 * calls `makeCommendation(code, t)` with no situation. Measured through the
 * real serializer: CLIENT «Правилно пропуснат автомобил със специален режим»,
 * SERVER «Правилно отстъпено предимство», both on one screen a few centimetres
 * apart. `lessons/wire.ts` carries it on the `detail` channel now, for exactly
 * the reason its own header gives: „a divergence here is not a second opinion —
 * it is the opinion".
 *
 * THE FIVE JUNCTION SITUATIONS ARE ABSENT ON PURPOSE — they keep the pooled
 * row, whose title is exactly right for them, so nothing about those drives
 * changes by a byte, and nothing new crosses the wire for them either.
 */
export const YIELD_PRAISE_SITUATION_COPY: Record<
  string,
  { titleBg: string; conceptId?: string }
> = {
  emergency: {
    titleBg: "Правилно пропуснат автомобил със специален режим",
    conceptId: "c-emergency-priority",
  },
  "vulnerable-pass": {
    titleBg: "Правилно разминаване с велосипедист",
    conceptId: "c-cyclists",
  },
  "narrow-meeting": {
    titleBg: "Правилно разминаване в стеснението",
    conceptId: "c-priority-concept",
  },
  // N11 (VP-06): the compliant answer to a RED telltale. It has to be praised
  // in the same breath the ignore is charged, or the drill can only convict —
  // and the pooled sentence ends «…безопасността на кръстовище», which is false
  // on an empty street where the only other party is the car itself.
  "warning-lamp": {
    titleBg: "Правилна реакция на червена контролна лампа",
    conceptId: "c-technical-condition",
  },
  // VP-11: the compliant answer to a стоп-палка. Same reason as the row above
  // it — the pooled sentence ends «…безопасността на кръстовище», and this
  // encounter has no junction in it at all: it is a duty owed to a person
  // standing at the kerb of a straight boulevard (ЗДвП чл. 103).
  //
  // NO «ПРАВИЛНО», AND THAT IS THE CARE THIS ROW NEEDS. The runner earns this
  // praise for a halt within `stopRadiusM` of the mark, which on
  // sc-vp-police-stop is a 3 m disc around a point 1.71 m off the lane centre —
  // so a car stopped MID-LANE earns it too, and that is precisely the pose the
  // same drive's route task «Спри плътно вдясно при полицая» now refuses
  // (`requireKerbwardM`, sc-vp-police-stop:ab262758). A title claiming the stop
  // was performed CORRECTLY would contradict the unticked task a few
  // centimetres down the same screen. So the title states what was measured —
  // he stopped for the signal — and the route row keeps the half about where.
  "police-stop-signal": {
    titleBg: "Спиране по сигнала на полицая",
    conceptId: "c-police-interaction",
  },
};

/*
 * ---------------------------------------------------------------------------
 * TELLTALE_TENSE_NOTE — THE ROWS THAT ARE ALSO READ BEFORE THE FAULT EXISTS
 * ---------------------------------------------------------------------------
 * `hud/telltaleWarnings.ts` names a CODE per row and carries no prose of its
 * own, on purpose: „the prose has exactly one home (rules/catalog.ts, ADR-002)
 * and a second copy here would be a second thing to keep true."
 * `LessonPlayShell.tsx` then prints `spec.explanationBg` + `spec.correctiveBg`
 * on the armed-warning card. So some rows in this file answer TWO questions
 * with one string — „какво направи" on the fault card, and „какво липсва" on a
 * warning fired BEFORE anything was done.
 *
 * THE INVARIANT, and it is mechanical rather than stylistic: a row may assert
 * that the car MOVED only if the telltale that prints it cannot arm at a
 * standstill. Four of the five arm on `moving || engineOn`:
 *
 *   belt   SEATBELT_OFF_WHILE_MOVING   arms parked  → may not assert movement
 *   lights HEADLIGHTS_OFF_AT_NIGHT     arms parked  → may not assert movement
 *   lights HEADLIGHTS_OFF_IN_RAIN      arms parked  → may not assert movement
 *   fog    FOG_LIGHTS_OFF_IN_FOG       arms parked  → may not assert movement
 *   hand   HANDBRAKE_LEFT_ON           `moving && parkingBrakeOn` → may, and does
 *
 * THE FIFTH ROW ARRIVED WITHOUT ANYBODY EDITING THIS FILE, which is the whole
 * argument for deriving the list instead of remembering it. The lights row used
 * to emit HEADLIGHTS_OFF_AT_NIGHT unconditionally off one flattened bit; since
 * `hud/dashboardStatus.ts` began publishing `conditions` and
 * `armedTelltaleWarnings` began defaulting to them, it emits whatever
 * `headlightDutyCode` derives — and that is HEADLIGHTS_OFF_IN_RAIN for the rain
 * arm AND for the SNOWFALL arm (чл. 70, ал. 1 is one duty; `engine.ts` bills
 * snow through the same code with SNOW_LIGHTS_COPY). Between those two dates
 * the row said „Валеше, а караше без къси светлини" on a card that fires with
 * the car in P — and, in a snowfall, said it was raining, because the telltale
 * card has no per-event channel and never sees the snow override.
 *
 * A SECOND CONSEQUENCE, and the row above is repaired for it too: a code that
 * more than one WEATHER routes to may not assert which weather it is. That is
 * the JUNCTION_SCAN_INCOMPLETE discipline (see its note) applied to a condition
 * instead of to a control — the pooled string must be true of every context
 * that prints it; the per-arm sharpness lives in the override.
 *
 * The handbrake row is the CONTROL: it opens „Потегли с вдигната ръчна
 * спирачка" and that is correct, because its lamp cannot appear on a stopped
 * car. A check that scrubbed the past tense out of all of them would be the
 * same defect pointed the other way. `__tests__/telltale-warning-tense.test.ts`
 * drives `armedTelltaleWarnings` at 0 км/ч — over BOTH branches and all sixteen
 * weather combinations — to derive which codes are at stake instead of listing
 * them, and asserts both directions.
 *
 * MEASURED · `sc-rx-tram-left/mobile-right/run.log`: „[01-arrival] 0 км/ч …
 * P" → „[02-briefing] 0 км/ч card=warning/peek · Коланът не е поставен ·
 * Движеше се без поставен колан." A car that had never left Park, told in the
 * past tense that it had driven unbelted.
 */

// ---------------------------------------------------------------------------
// Per-ACT copy (the codes whose ONE row grades several different acts)
// ---------------------------------------------------------------------------

/**
 * RAIL_CROSSING_VIOLATION's three graded acts, keyed by the `detail` string
 * `engine.ts` already stamps on every event it emits. See the catalogue row
 * above for what the sweep photographed; this is the half that answers „кое от
 * трите направих".
 *
 * WHY IT LIVES HERE AND NOT IN engine.ts. Its sibling split, JUNCTION_SCAN_COPY,
 * sits in engine.ts because ITS discriminator (which control the student
 * crossed) exists only inside the reducer — there is no channel on the event
 * that carries it. This one is the opposite case: `detail` is a shipped,
 * machine-readable field, asserted by `rail-crossing-detectors.test.ts` on all
 * three arms, so the mapping is pure catalogue data and `makeViolation` can do
 * it for every producer at once. A call-site override would have to be
 * remembered three times in the reducer and again by procedures/machine.ts.
 *
 * `lawRef` SPLITS WITH THE COPY, and that is this file's whole point (see the
 * header: the slot answers WHAT RULE DID I BREAK). The row's own citation names
 * all three articles because it is read by code with no event in hand; an event
 * knows the act, so its chip names the ONE article the act breaks — retrieved
 * verbatim from `content/law/acts/zdvp.json`:
 *   чл. 51, ал. 3  „Спирането на пътните превозни средства е задължително пред
 *                  железопътен прелез, който няма бариери."
 *   чл. 52         „На участниците в движението е забранено да преминават през
 *                  железопътен прелез: 1. при спуснати, започнали да се спускат
 *                  или да се вдигат бариери… 2. при мигаща червена светлина…"
 *   чл. 53, ал. 2  „…не трябва да започва преминаването…, ако не е предварително
 *                  убеден, че няма да се наложи спиране върху релсите…"
 * `severityClass`, `points` and `terminateSession` stay catalogue-owned and are
 * NOT reachable from here — all three acts are the same опасна 10.
 *
 * NO DISTANCE IS QUOTED, for the same reason the row says so: чл. 51, ал. 4 does
 * give 2 m / 1 m, the detector measures neither, and this is the exact place an
 * earlier wave invented a „50 метра". `correctiveBg` also stays pooled — it is
 * read BY CODE at display time (SessionEndScreen, attemptReel, tutor/retrieval),
 * has no per-event channel, and already walks all three branches.
 */
export const RAIL_CROSSING_ACT_COPY: Record<
  "no-stop" | "entered-barred" | "stopped-on-track",
  { titleBg: string; explanationBg: string; lawRef: string }
> = {
  "no-stop": {
    titleBg: "Влизане на прелез без бариери без пълно спиране",
    explanationBg:
      "Навлезе върху релсите на прелез БЕЗ бариери, без да спреш напълно преди тях. Там няма кой да те спре — бариерата си ти: спираш докрай, сваляш звука, оглеждаш линията наляво и надясно и чак тогава минаваш решително. Влакът не може нито да спре навреме, нито да те заобиколи.",
    lawRef: "ЗДвП чл. 51, ал. 3",
  },
  "entered-barred": {
    titleBg: "Влизане на прелез при спусната бариера",
    explanationBg:
      "Навлезе на прелеза, докато бариерата беше спусната или се спускаше. Бариерата не се заобикаля и не се „изпреварва“ — тя тръгва надолу, защото влакът вече е потеглил към прелеза, а между сигнала и влака няма резерв за още една кола. Изчакваш зад стоп-линията, докато се вдигне напълно.",
    lawRef: "ЗДвП чл. 52",
  },
  "stopped-on-track": {
    titleBg: "Спиране върху железопътните релси",
    explanationBg:
      "Спря и остана върху самите релси. Спирането преди прелеза е правилно; спирането ВЪРХУ него е най-опасното място на целия път. Затова прелезът се пресича само когато отсрещната страна е свободна и има къде да излезеш — не се тръгва „ще се придвижа с колоната“. Случи ли се наистина: излизаш от колата и се махаш от линията.",
    lawRef: "ЗДвП чл. 53, ал. 2",
  },
};

/**
 * COLLISION's four struck bodies, keyed by the `detail` string `engine.ts`
 * already stamps on every contact it bills (`e.withWhat` — SimTickEvent
 * "collision"). The catalogue row above records the two frames; this is the
 * half that answers „в какво се ударих".
 *
 * WHY THIS CODE AND NOT ONLY RAIL. Since the per-body-kind contact episode
 * landed (`engine.ts`: „SO THE EPISODE IS PER BODY-KIND"), one drive can
 * legitimately bill a vehicle AND a pedestrian, and `scoring.ts` closes the
 * ledger so the second row costs nothing extra. Its whole purpose is therefore
 * to SAY SOMETHING the first row did not — and with one pooled paragraph it
 * said the same sentence twice. The discriminator was already on the wire; only
 * the copy was pooled, exactly as with the rail code.
 *
 * `lawRef` DOES NOT SPLIT HERE, and the difference from the rail case is worth
 * stating rather than leaving as an omission. The rail acts break three
 * DIFFERENT articles, so the event chip narrows the row's list to the one it
 * broke. Every contact here breaks the SAME rule — чл. 20, ал. 2, the duty to
 * pick a speed that leaves you able to stop before any foreseeable obstacle and
 * to brake the moment a danger appears — which is true of a wall, a car, a
 * pedestrian and a cyclist alike. A per-body citation would therefore be a NEW
 * claim rather than a narrowing (the pedestrian duty of care lives in its own
 * article, which this row does not cite and this split may not smuggle in), and
 * `content/hazard/items.json` echoes this row's `lawRef` under a bank check
 * that fails the build when the two drift. The row keeps the citation; the
 * split keeps to the copy.
 *
 * `correctiveBg` also stays pooled — same reason as the rail row: it is looked
 * up BY CODE at display time (SessionEndScreen, debrief, attemptReel) with no
 * event in hand. THAT IS A CONSTRAINT ON WHAT IT MAY SAY, NOT A LICENCE TO SAY
 * ONE BODY'S ANSWER (corrected 2026-08-23 — this paragraph used to call the
 * mismatch „the honest limit of a code-keyed slot", and a card that answers
 * „какво трябваше да направя" with the wrong answer is not a limit, it is
 * THEO-4's own failure mode). The row's corrective now walks all four bodies,
 * the two-second lead-car rule among them, exactly as the rail corrective walks
 * its three acts. The per-body EXPLANATION is still where the wall, the person
 * and the bicycle each get their own paragraph.
 */
export const COLLISION_CONTACT_COPY: Record<
  "vehicle" | "pedestrian" | "cyclist" | "staticObject",
  { titleBg: string; explanationBg: string }
> = {
  vehicle: {
    titleBg: "Удар в друго превозно средство",
    explanationBg:
      "Удари друго превозно средство. Между вас е имало точно толкова път, колкото ти е трябвал, за да спреш — и е бил по-малко. Скоростта и дистанцията се избират ПРЕДИ конфликтната точка: щом другата кола е вече в спирачния ти път, воланът и спирачката не решават нищо.",
  },
  pedestrian: {
    titleBg: "Удар в пешеходец",
    explanationBg:
      "Удари човек. Това е най-тежкият изход на пътя и няма лека негова версия — пешеходецът няма нито ламарина, нито колан, нито въздушна възглавница, а при 50 км/ч ударът е почти сигурна тежка травма. Затова към пешеходците се кара с готовност да спреш, преди да си сигурен, че те са те видели, а не след това.",
  },
  cyclist: {
    titleBg: "Удар във велосипедист",
    explanationBg:
      "Удари велосипедист. Колелото е тясно, тихо и по-бавно, отколкото изглежда, и се движи там, където най-често не се гледа — вдясно, в мъртвата зона и малко преди кръстовището. Разминаването с колоездач иска странична дистанция и намаляване, не изчакване той да се отдръпне.",
  },
  staticObject: {
    titleBg: "Удар в неподвижно препятствие",
    explanationBg:
      "Удари неподвижен предмет — стълб, дърво, ограда, сграда или бордюр. Неподвижното препятствие не се появява внезапно и не може да сгреши: то е било там през цялото време, а колата е стигнала до него, защото пътят ѝ е излязъл извън платното за движение. Излизането от платното е самото произшествие, а ударът е само краят му.",
  },
};

/**
 * WRONG_WAY's two roads — w10-4, `sc-merge-accel-lane:93685d58`, 2026-08-25.
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-merge-accel-lane__mobile-wrong/
 * 08-debrief-p6.png` + its `_audit-debrief.json`: six identical cards reading
 * «Движение в обратна посока по еднопосочна улица … Движеше се срещу платното
 * на еднопосочна улица … Влизай в еднопосочна само по посока на движението»,
 * in the lesson «Включване в магистрала през лентата за ускоряване», on a sheet
 * that also bills «Движение по аварийната лента». There is no street in
 * `mw-entry-v1` and no В2 anywhere in it: the gravest row the student collected
 * described a place he was never in.
 *
 * THE CLAUSE IS RIGHT AND ONLY THE SENTENCE IS WRONG, which is why this is copy
 * and not a code. Наредба № 38, прил. № 5, т. 10, б. „в" — quoted verbatim in
 * `n38.ts` — reads „когато изпитваният навлезе срещу движението на ПЪТЕН ВЪЗЕЛ
 * или път с еднопосочно движение": the article names the interchange first and
 * the one-way street second, and a motorway carriageway is both one-way and a
 * пътен възел. The mark, the severity and the citation stand exactly as billed.
 *
 * AND IT RIDES `detail`, NOT AN OVERRIDE, BECAUSE THE OVERRIDE DIES AT THE WIRE.
 * The first cut of this repair passed `{ titleBg, explanationBg }` straight to
 * `makeViolation` in `engine.ts`, the way `JUNCTION_SCAN_COPY` does. The
 * verifier ran it: `serializeRuleEvents` (wire.ts) carries `kind`, `code`, `t`,
 * `detail`, `penaltyMultiplier`, `x/y` — and NOTHING else — so the server's
 * `rebuildRuleEvents` reconstructed the pooled street row and the end screen
 * printed «…по автомагистрала» in «Грешки» (client events) beside «…по
 * еднопосочна улица» in «Разбор» (server rebuild), a few centimetres apart.
 * That is the exact defect `wire.ts` records at its own `situation` channel and
 * `FaultCard.tsx` records at its: „two surfaces on one screen that agree by
 * accident stop agreeing the first time either is edited." `detail` crosses,
 * `rebuildRuleEvents` re-applies it through `actCopy`, and both halves of the
 * sheet are then built from the same table — the same channel
 * `RAIL_CROSSING_VIOLATION` and `COLLISION` already use.
 *
 * `lawRef` DOES NOT SPLIT, and unlike the rail row that is not an omission:
 * ЗДвП чл. 6, т. 1 („длъжен е да се движи по посоката") is the rule broken on a
 * street and on a carriageway alike. What genuinely differs is the PRICE —
 * чл. 183, ал. 4 (100 лв.) on a street versus чл. 178ж, ал. 1 on a motorway —
 * and `realWorldBg` has no per-event channel at all, so that half is reported
 * rather than smuggled in here.
 *
 * THAT HALF LANDED — w12, 2026-08-27, and NOT through this table. `roadCon‐
 * sequenceFor` still cannot see `detail`, so `consequences.ts` stopped claiming
 * an unconditional price instead: `ROAD_CONSEQUENCES.WRONG_WAY` is a
 * `conditional` row whose branches are the two ROADS, each figure printed with
 * its road in front of it. `realWorldBg` below is unreachable for this code
 * (the structured row wins in `roadConsequenceFor`) and is left as written.
 */
export const WRONG_WAY_ROAD_MOTORWAY = "motorway";

export const WRONG_WAY_ROAD_COPY: Record<
  string,
  { titleBg: string; explanationBg: string }
> = {
  [WRONG_WAY_ROAD_MOTORWAY]: {
    titleBg: "Движение в обратна посока по автомагистрала",
    explanationBg:
      "Движеше се срещу посоката на платното на автомагистрала. Това е най-опасното нещо, което може да се случи на магистрала — насрещните пътуват със 140 км/ч и нямат никакво време да реагират. Платното на магистралата е еднопосочно: влиза се само през входната рампа и само по посоката на движението.",
  },
};

/**
 * FAILED_TO_YIELD at a ROUNDABOUT — sc-roundabout-entry, 2026-09-03.
 *
 * THE DEFECT IS ALREADY WRITTEN DOWN IN THIS PRODUCT'S OWN SOURCE, by the wave
 * that fixed the other half of it. `runtime/worldRuntime.ts`, at the guard that
 * keeps the right-hand-rule tracker off a ring mouth: „The card even printed
 * the wrong law back at him: «На кръстовище без светофар пропускаш идващите
 * отдясно.»" That sentence is this row's pooled `explanationBg`, and it is
 * still what a roundabout conviction prints. The DETECTOR was corrected; the
 * CARD was routed and never touched.
 *
 * PHOTOGRAPHED AT HEAD, `.audit-frames/w23/frames/sc-roundabout-entry__
 * mobile-right/04-t041s.png`: «⚠ −10 ИЗПИТНИ Т. · Непропускане на предимство ·
 * Не пропусна превозно средство, което имаше предимство. На…», i.e. the two
 * lines the peek can finish are the true half, and the first thing under the
 * fold is the rule for the wrong kind of junction. The same lesson's own
 * instruction step 2 reads «Гледай наляво — движещите се в кръга имат
 * предимство» (`scenario/templates-flow.ts`), so the student is taught LEFT in
 * the briefing and told RIGHT by the card that costs him ten points. THEO-4
 * forbids a bare verdict; a verdict that explains itself with the opposite rule
 * is that failure with a costume on.
 *
 * THE DISCRIMINATOR WAS ALREADY ON THE WIRE — `engine.ts`'s `prioritySituation`
 * case bills `{ detail: e.situation }`, and `worldRuntime` §4c emits
 * `situation: "roundabout"` for an ENTERING driver only (`inward >=
 * ROUNDABOUT_INWARD_MIN && !onRing`), never for one already circulating. So
 * this is copy keyed on a shipped field, the mechanism RAIL_CROSSING_ACT_COPY,
 * COLLISION_CONTACT_COPY and WRONG_WAY_ROAD_COPY already use, and it crosses to
 * the server's `rebuildRuleEvents` through `detail` like they do.
 *
 * RETRIEVED, NOT RECALLED (ADR-002). ЗДвП чл. 50, ал. 1 verbatim from
 * `content/law/acts/zdvp.json`: „На кръстовище, на което единият от пътищата е
 * сигнализиран като път с предимство, водачите на пътни превозни средства от
 * другите пътища са длъжни да пропуснат пътните превозни средства, които се
 * движат по пътя с предимство." чл. 48 is quoted for what it is — the
 * EQUAL-junction rule — from the same file. The Б3 step is stated NUMBERLESS,
 * exactly as this lesson's own `teach.lawRef` states it: Наредба
 * № РД-02-21-1/23.11.2023 is not in the repo, and the frozen rule for that is
 * „names an article we cannot resolve — drop the number".
 *
 * `lawRef` NARROWS RATHER THAN ADDS, which is the RAIL row's discipline: the
 * pooled citation lists чл. 47, чл. 48 and чл. 50, ал. 1 because it is read by
 * code with no event in hand, and an event that knows the act names the one
 * article the act breaks. Here that is чл. 50, ал. 1 — and чл. 48, the article
 * the pooled sentence leads with, is precisely the one this act does NOT break.
 * Byte-identical to what the lesson's own barge-entry mistake card cites.
 *
 * THE TITLE IS SHORTER THAN THE POOLED ONE ON PURPOSE (22 characters against
 * 26), and it is the same string `SC_ROUNDABOUT_ENTRY.mistakes[0].titleBg`
 * already uses for this act. `hud/SimOverlay.tsx` states the arithmetic this
 * obeys — the phone's peek floors its text window at 44 px, a title line box is
 * 13.75 and the body's first line needs 15.125 — so a longer title would have
 * bought the correct rule by deleting a line of it, which is the other row this
 * lane is answering (`sc-roundabout-entry:fe081cf1`, „the body text is cut").
 */
export const FAILED_TO_YIELD_SITUATION_ROUNDABOUT = "roundabout";

export const FAILED_TO_YIELD_SITUATION_COPY: Record<
  string,
  { titleBg: string; explanationBg: string; lawRef: string }
> = {
  [FAILED_TO_YIELD_SITUATION_ROUNDABOUT]: {
    titleBg: "Влизане без пропускане",
    explanationBg:
      "Влезе в кръга пред кола, която вече се движеше в него. Тя има предимство и идва ОТЛЯВО, защото в кръговото се обикаля обратно на часовниковата стрелка. На входа на кръгово кръстовище знакът „Път с предимство“ не се поставя (Наредба № РД-02-21-1/23.11.2023 за пътните знаци), затова там стои Б1 „Пропусни движението“ или Б2 „Спри!“ — ти си на пътя без предимство, а ЗДвП чл. 50, ал. 1 задължава водачите от другите пътища да пропуснат движещите се по пътя с предимство, и тук този път е самият кръг. „Пропусни идващите отдясно“ е чл. 48 и важи за кръстовище на равнозначни пътища — на кръгово не се прилага. Затова гледаш наляво, изчакваш реален интервал и чак тогава влизаш.",
    lawRef: "ЗДвП чл. 50, ал. 1",
  },
};

/**
 * HANDBRAKE_LEFT_ON from a STANDSTILL — sc-vp-handbrake:1f2f7463, critical.
 *
 * THE POOLED ROW MAY NOT SPEAK FOR THIS ACT, and that is the whole reason the
 * act needs a key. «Потегли с вдигната ръчна спирачка. Колата се влачи…»
 * asserts two things about the drive: that the car moved off, and that it is
 * dragging. Neither is true of the act the standstill arm grades —
 * `PARKING_BRAKE_FORCE_N` (13 000 N) HOLDS this car, so the student who never
 * released the lever is stationary at 0.32 км/ч with the pedal on the floor.
 * A card that describes a drag the windscreen does not show is the tense
 * defect the telltale rows beside this file already collected once; the
 * discrimination is the same mechanism (`detail` → `actCopy`) that
 * RAIL_CROSSING_ACT_COPY and FAILED_TO_YIELD_SITUATION_COPY ride, and it
 * crosses to the server's `rebuildRuleEvents` on the same wire key.
 *
 * `lawRef` IS DELIBERATELY ABSENT so the pooled ЗДвП чл. 20, ал. 1 stands: the
 * duty broken is identical (the driver must control the vehicle continuously),
 * only the act differs. ADR-002 — no citation is written here that the
 * catalogue did not already carry.
 *
 * THE TITLE IS THE LESSON'S OWN (`SC_VP_HANDBRAKE.titleBg`, 26 characters
 * against the pooled row's 34), which is what the phone's peek window can
 * finish — the SimOverlay arithmetic the roundabout row above states.
 */
export const HANDBRAKE_ACT_MOVE_OFF_ATTEMPT = "moveOffAttempt";

export const HANDBRAKE_ACT_COPY: Record<
  string,
  { titleBg: string; explanationBg: string }
> = {
  [HANDBRAKE_ACT_MOVE_OFF_ATTEMPT]: {
    titleBg: "Потегляне с вдигната ръчна",
    explanationBg:
      "Даде газ, без да свалиш ръчната спирачка — затова колата не тръгва: ръчната държи задните колела. В истинска кола тя не те спира, а се влачи: задните спирачки работят непрекъснато, прегряват и губят ефективност точно преди първото сериозно спиране, а ти няма да разбереш, докато не ти потрябват. Затова редът е един и същ всеки път — ръчната долу докрай, контролната лампа на таблото угасва, и чак тогава газта. Свети ли още лампата, ръчната не е долу.",
  },
};

/**
 * The per-act tables, keyed by the code that owns each. A registry rather than a
 * chain of `if (code === …)`: the next code that grades more than one act adds a
 * row here and `makeViolation` picks it up for every producer at once.
 */
const PER_ACT_COPY: Partial<
  Record<ViolationCode, Record<string, { titleBg: string; explanationBg: string; lawRef?: string }>>
> = {
  RAIL_CROSSING_VIOLATION: RAIL_CROSSING_ACT_COPY,
  COLLISION: COLLISION_CONTACT_COPY,
  WRONG_WAY: WRONG_WAY_ROAD_COPY,
  FAILED_TO_YIELD: FAILED_TO_YIELD_SITUATION_COPY,
  HANDBRAKE_LEFT_ON: HANDBRAKE_ACT_COPY,
};

/**
 * The per-act copy for an event, or `null` when the code pools one string.
 *
 * EXPORTED BECAUSE A LIST HAS TO GROUP BY IT. `makeViolation` stamps the act's
 * own title and explanation onto the event, and any surface that then collapses
 * rows BY CODE puts two different acts under one of the two titles and throws
 * the other away. That is not a display nicety: on 2026-08-18 the debrief for a
 * drive that struck a car and then a person printed «Удар в друго превозно
 * средство ×2», and the word «пешеходец» appeared nowhere in it. A caller that
 * asks this first can key its groups on the ACT — see `lessons/debrief.ts`
 * `groupMistakes`.
 */
export function actCopy(
  code: ViolationCode,
  detail: string | undefined,
): { titleBg: string; explanationBg: string; lawRef?: string } | null {
  if (detail === undefined) return null;
  return PER_ACT_COPY[code]?.[detail] ?? null;
}

// ---------------------------------------------------------------------------
// Event constructors (shared by engine.ts and procedures/machine.ts)
// ---------------------------------------------------------------------------

export function makeViolation(
  code: ViolationCode,
  t: number,
  overrides?: Partial<Pick<ViolationEvent, "titleBg" | "explanationBg" | "detail">>,
): ViolationEvent {
  const spec = VIOLATIONS[code];
  // An UNRECOGNISED detail falls back to the pooled row rather than to silence:
  // a card that teaches all three rules is worse than one that teaches the act,
  // and better than one that teaches the wrong act. An explicit override still
  // wins over both (JUNCTION_SCAN_COPY rides that same channel).
  const act = actCopy(code, overrides?.detail);
  const event: ViolationEvent = {
    kind: "violation",
    code,
    t,
    severityClass: spec.severityClass,
    points: spec.points,
    titleBg: overrides?.titleBg ?? act?.titleBg ?? spec.titleBg,
    explanationBg: overrides?.explanationBg ?? act?.explanationBg ?? spec.explanationBg,
    lawRef: act?.lawRef ?? spec.lawRef,
  };
  if (spec.conceptId !== undefined) event.conceptId = spec.conceptId;
  if (spec.terminateSession) event.terminateSession = true;
  if (overrides?.detail !== undefined) event.detail = overrides.detail;
  return event;
}

/**
 * `situation` is the reducer's `prioritySituation.situation` string, and it is
 * OPTIONAL so every existing caller compiles and behaves byte-identically. It
 * is honoured only for `YIELDED_TO_PRIORITY`, the one pooled row that had to
 * speak for nine acts; an unknown situation falls back to the pooled title,
 * which is what a junction yield wants anyway. See
 * `YIELD_PRAISE_SITUATION_COPY`.
 *
 * IT IS STAMPED BACK ONTO THE EVENT ONLY WHEN IT CHANGED THE COPY. That is the
 * whole reason the field exists: `wire.ts` has to be able to hand the server
 * the same discriminator the client used, or the two halves of one debrief
 * print two names for one act. Stamping it unconditionally would put a new
 * string on the wire for the five junction situations that do not use it — new
 * bytes, a new thing to validate, and nothing downstream would read them.
 */
export function makeCommendation(
  code: CommendationCode,
  t: number,
  situation?: string,
): CommendationEvent {
  const spec = COMMENDATIONS[code];
  const perSituation =
    code === "YIELDED_TO_PRIORITY" && situation !== undefined
      ? YIELD_PRAISE_SITUATION_COPY[situation]
      : undefined;
  const event: CommendationEvent = {
    kind: "commendation",
    code,
    t,
    titleBg: perSituation?.titleBg ?? spec.titleBg,
    explanationBg: spec.explanationBg,
  };
  if (perSituation !== undefined && situation !== undefined) event.situation = situation;
  const conceptId = perSituation?.conceptId ?? spec.conceptId;
  if (conceptId !== undefined) event.conceptId = conceptId;
  return event;
}
