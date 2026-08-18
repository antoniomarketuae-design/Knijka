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
    explanationBg:
      "Движеше се без поставен колан. При удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж.",
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
    explanationBg:
      "Движеше се на тъмно с изключени светлини. Нощем виждаш само осветеното от фаровете — а без тях и другите не виждат теб.",
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
    explanationBg:
      "Караше в рамките на ограничението, но твърде бързо за условията — дъжд, мъгла, сняг или тъмно. Съобразената скорост е тази, при която можеш да спреш в рамките на видимото платно. При намалена видимост и хлъзгав път намали още.",
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
    explanationBg:
      "Валеше, а караше без къси светлини. При намалена видимост (дъжд, мъгла, сняг) включи късите светлини — не толкова за да виждаш, колкото за да те виждат другите.",
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
    explanationBg:
      "Караше в гъста мъгла без включени предни фарове за мъгла. Те светят ниско и широко под пелената — осветяват маркировката пред теб и те правят видим за другите там, където късите светлини се отразяват в капките.",
    correctiveBg:
      "Щом видимостта падне значително, включи предните фарове за мъгла (клавиш V) заедно с късите светлини — и ги изгаси, щом мъглата се вдигне.",
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
    correctiveBg:
      "Оглеждай знаците на входа на всяка улица — В2 „Влизането забранено“ значи не влизаш. Влязъл ли си вече — спри веднага, включи аварийните и излез внимателно на заден ход.",
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
  FAILED_TO_YIELD: {
    severityClass: "opasna",
    points: SEVERITY_POINTS.opasna,
    titleBg: "Непропускане на пътно превозно средство с предимство",
    explanationBg:
      "Не пропусна превозно средство, което имаше предимство. На кръстовище без светофар пропускаш идващите отдясно; при знак „Пропусни движението“ — всички по главния път. Предимството се отстъпва, не се взема.",
    correctiveBg:
      "Приближавай кръстовището с готовност за пълно спиране: свали скоростта, огледай дясно (или главния път при Б1) и потегли само когато никой не приближава.",
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
    explanationBg:
      "Настъпи сблъсък. Това е ЕДНА опасна грешка и цялата десетка е цената на самото деяние — не сбор от натрупани дребни пропуски. В симулатора продължаваме, за да се учиш, но сесията се оценява като прекратена.",
    correctiveBg:
      "Карай така, че винаги да имаш къде да спреш: гледай далеч напред, дръж 2 секунди зад предния и намалявай ПРЕДИ конфликтните точки (кръстовища, пътеки, паркирани коли).",
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
    explanationBg:
      "Потегли от място, без да провериш огледалата непосредствено преди тръгване. Точно в този момент отзад може да приближава кола, колоездач или мотор — потеглянето е маневра и изисква оглеждане.",
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
    titleBg: "Изпреварване на велосипедист без странична дистанция",
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
// Per-ACT copy (the one code that grades three different acts)
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

/** The per-act copy for an event, or `null` when the code pools one string. */
function actCopy(
  code: ViolationCode,
  detail: string | undefined,
): { titleBg: string; explanationBg: string; lawRef: string } | null {
  if (code !== "RAIL_CROSSING_VIOLATION" || detail === undefined) return null;
  return (
    (RAIL_CROSSING_ACT_COPY as Record<string, { titleBg: string; explanationBg: string; lawRef: string }>)[
      detail
    ] ?? null
  );
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
