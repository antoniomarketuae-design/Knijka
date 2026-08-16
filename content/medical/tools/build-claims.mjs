/**
 * Emit content/medical/claims.json — the clinical claim register.
 *
 * The discipline is build-penalties.mjs's, transplanted: NOT ONE QUOTE IS
 * TYPED HERE. Each is cut out of the extracted source text by a locator
 * string. If a guideline is revised under a citation, the locator stops
 * matching and this build FAILS rather than emitting a stale figure.
 *
 * Two checks beyond "the text exists":
 *   1. A claim that carries a figure must carry a `figureQuote` whose sentence
 *      contains that figure's digits — a depth of 5-6 cm cited to a sentence
 *      that never says 5 or 6 is precisely the "ЗДвП чл. 123" failure that
 *      quarantined these questions in the first place. `figureQuote` is split
 *      from `authoritative` for the same reason penalties.json splits quoteBg
 *      from contextQuoteBg: the sentence that states a number and the sentence
 *      that states the rule are often not the same sentence.
 *   2. Every claim names which Наредба № 24 чл. 9 topic puts it in the
 *      Bulgarian syllabus, so nothing clinical is taught that the exam does
 *      not actually cover.
 *
 * Usage, from content/medical/tools/:
 *   node build-claims.mjs ..
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node build-claims.mjs <content/medical dir>");
const RETRIEVED = "2026-08-04";

const TEXT_FILE = {
  "src-naredba-24-lex": "naredba24_lex.txt",
  "src-naredba-24-sars": "naredba24_sars.txt",
  "src-erc-2025-layperson": "erc2025_layperson.txt",
  "src-rcuk-2025-bls": "rcuk_bls.txt",
  "src-rcuk-2025-first-aid": "rcuk_fa.txt",
  "src-bchk-first-help-bls": "bchk_bls.txt",
  "src-bchk-first-help-steps": "bchk_page5.txt",
  "src-bchk-course-drivers": "bchk_course25.txt",
};

const cache = new Map();
const linesOf = (sourceId) => {
  if (!cache.has(sourceId)) {
    const f = TEXT_FILE[sourceId];
    if (!f) throw new Error(`no text file registered for ${sourceId}`);
    cache.set(sourceId, readFileSync(path.join(SCRATCH, f), "utf8").split("\n"));
  }
  return cache.get(sourceId);
};

/**
 * Cut the line carrying `locator` out of a source.
 *
 * Resuscitation Council UK renders every section twice: a collapsed teaser
 * truncated with "..." and the full list below it. The teasers are dropped —
 * they are the same sentence cut short, and quoting one would ship an
 * ellipsis as if it were the guideline's own punctuation.
 */
function cut(sourceId, locator) {
  const lines = linesOf(sourceId);
  const hits = [];
  lines.forEach((l, i) => {
    if (l.includes(locator) && !l.endsWith("...")) hits.push({ i: i + 1, l });
  });
  if (hits.length === 0) {
    throw new Error(`LOCATOR MISS in ${sourceId}: "${locator}" — the source changed; re-read it before editing this file`);
  }
  const texts = new Set(hits.map((h) => h.l));
  if (texts.size > 1) {
    throw new Error(`LOCATOR AMBIGUOUS in ${sourceId}: "${locator}" matches ${texts.size} different lines`);
  }
  return { quoteBg: hits[0].l, lineNo: hits[0].i };
}

/** ЗДвП comes from the already-ingested, already-hashed law corpus, not a re-fetch. */
const zdvp = JSON.parse(readFileSync(path.join(SCRATCH, "..", "..", "law", "acts", "zdvp.json"), "utf8"));
function cutLaw(ref, locator) {
  const unit = zdvp.units.find((u) => u.ref === ref);
  if (!unit) throw new Error(`ЗДвП ${ref} not in content/law/acts/zdvp.json`);
  const line = unit.textBg.split("\n").find((l) => l.includes(locator));
  if (!line) throw new Error(`LOCATOR MISS in ЗДвП ${ref}: "${locator}"`);
  return { quoteBg: line, lineNo: null };
}

const q = (sourceId, locator) => ({ sourceId, ...cut(sourceId, locator) });

// ---------------------------------------------------------------------------
// The claims. `locator` values are the ONLY prose written by hand here, and
// each must occur verbatim in its source or the build throws.
// ---------------------------------------------------------------------------
const CLAIMS = [
  {
    id: "med-cpr-depth",
    topicBg: "Дълбочина на гръдните компресии при възрастен",
    conceptIds: ["c-cpr-basics"],
    questionIds: ["q-ptp-036"],
    figureBg: "5–6 см",
    figureQuote: q("src-erc-2025-layperson", "each compression must push the chest down 5 to 6 cm"),
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-erc-2025-layperson", "each compression must push the chest down 5 to 6 cm"),
    corroborating: [
      q("src-rcuk-2025-bls", "Compress to a depth of at least 5 cm, but not more than 6 cm."),
      q("src-bchk-first-help-bls", "Натискайте най-малко 5 см"),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "И трите източника — включително БЧК — казват 5–6 см. Тезата, че БЧК още учи 4–5 см, не се потвърждава от текста на страницата към 2026-08-04.",
  },
  {
    id: "med-cpr-rate",
    topicBg: "Честота на гръдните компресии при възрастен",
    conceptIds: ["c-cpr-basics"],
    questionIds: ["q-ptp-016"],
    figureBg: "100–120 в минута",
    figureQuote: q("src-erc-2025-layperson", "the most effective rate is 100 to 120 chest compressions per minute"),
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-erc-2025-layperson", "the most effective rate is 100 to 120 chest compressions per minute"),
    corroborating: [q("src-rcuk-2025-bls", "Compress the chest at a rate of 100-120 min-1.")],
    conflicts: [
      {
        ...q("src-bchk-first-help-bls", "с честота 100 притискания в минута"),
        natureBg:
          "БЧК дава 100/мин като цел и 120 като таван („може да се правят по-бързо, но не повече от 120“). ERC/RCUK 2025 дават 100–120 като диапазон. Формулировката на БЧК е от ерата „поне 100“ (насоки 2010 г.).",
      },
    ],
    statusBg: "grounded-contested",
    noteBg: "Числата съвпадат; рамката не. Нашият верен отговор „около 100–120“ следва ERC 2025.",
  },
  {
    id: "med-cpr-ratio",
    topicBg: "Съотношение компресии : обдишвания при обучен спасител",
    conceptIds: ["c-cpr-basics"],
    questionIds: ["q-ptp-017", "q-ptp-060"],
    figureBg: "30 : 2",
    figureQuote: q("src-erc-2025-layperson", "perform CPR at a rate of 30 compressions followed by 2 breaths"),
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-erc-2025-layperson", "perform CPR at a rate of 30 compressions followed by 2 breaths"),
    corroborating: [
      q("src-rcuk-2025-bls", "alternate 30 chest compressions with 2 rescue breaths."),
      q("src-rcuk-2025-bls", "If you are not trained to provide rescue breaths, perform continuous chest compressions"),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "Вторият цитат от RCUK е основанието за q-ptp-060: необучен спасител прави само натискания — това е насока, а не отстъпка.",
  },
  {
    id: "med-hand-position",
    topicBg: "Къде се поставят ръцете при гръдни компресии",
    conceptIds: ["c-cpr-basics"],
    questionIds: ["q-ptp-016"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-rcuk-2025-bls", "Place the heel of one hand on the lower half of the sternum"),
    corroborating: [q("src-erc-2025-layperson", "The hands should be positioned on the centre of the chest.")],
    conflicts: [
      {
        ...q("src-bchk-first-help-bls", "Натискайте върху горната част на корема или долната част на гръдната кост."),
        natureBg:
          "ФАКТИЧЕСКА ГРЕШКА в БЧК. ERC/RCUK: долната половина на гръдната кост. Натиск върху горната част на корема е точно това, което насоките забраняват. Прилича на изгубено отрицание при превода от изданието на Червения кръст Белгия-Фландрия. Не се цитира и не се преразказва.",
      },
    ],
    statusBg: "grounded-contested",
    noteBg: "Дистракторът „върху корема“ в q-ptp-016 е верен като ГРЕШЕН отговор — и е точно това, което БЧК страницата казва.",
  },
  {
    id: "med-breathing-check",
    topicBg: "Проверката за дишане и редът спрямо обаждането на 112",
    conceptIds: ["c-cpr-basics", "c-first-aid-priorities"],
    // q-ptp-057 („как и колко време проверяваш дишането") беше извън този
    // списък, макар да е ЕДИНСТВЕНИЯТ въпрос в банката, чийто верен отговор Е
    // 10-секундният прозорец — тоест точно фигурата, която този иск носи във
    // `figureQuote`. Регистърът описваше числото и не знаеше кого учи то.
    questionIds: ["q-ptp-013", "q-ptp-017", "q-ptp-037", "q-ptp-057"],
    figureBg: "не повече от 10 секунди",
    figureQuote: q("src-erc-2025-layperson", "for a maximum of 10 seconds."),
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-rcuk-2025-bls", "Suspect cardiac arrest in any person who is unresponsive."),
    corroborating: [
      q("src-rcuk-2025-bls", "Assess their breathing while you wait for the call to be answered."),
      q("src-rcuk-2025-bls", "Slow, laboured breathing, as well as other abnormal patterns such as agonal gasping"),
      q("src-rcuk-2025-bls", "If any person is unresponsive with abnormal breathing, cardiac arrest should be assumed."),
      q("src-erc-2025-layperson", "for a maximum of 10 seconds."),
      q("src-bchk-first-help-bls", "в продължение на не повече от 10 секунди"),
    ],
    conflicts: [
      {
        ...q("src-rcuk-2025-bls", "Rescuers no longer need to confirm abnormal breathing before calling."),
        natureBg:
          "ПРОМЯНА 2021 → 2025, заявена от самия RCUK. По ERC 2021 се проверяваше дишането и после се звънеше; по 2025 се звъни при всеки, който не реагира, а дишането се оценява ДОКАТО чакаш да вдигнат. Всеки въпрос, който подрежда „провери дишането → звънни“, е граден по остарялата редакция.",
      },
    ],
    statusBg: "grounded-superseded-order",
    noteBg:
      "10-секундният прозорец оцелява в главата First Aid на ERC 2025 (ABCDE) и у БЧК, но вече НЕ се появява в текста на RCUK Adult BLS 2025. Пази прозореца като „не се бави повече от 10 секунди“, не като задължителна процедура преди обаждането.",
  },
  {
    id: "med-bleeding-direct-pressure",
    topicBg: "Първо действие при животозастрашаващо кървене",
    conceptIds: ["c-bleeding-control"],
    // q-ptp-019 (забито стъкло) стои тук за ПОЛОВИНАТА си отговор — „притискаш
    // около раната" е този иск, приложен встрани от предмета. Другата половина
    // („остави предмета в раната") няма източник никъде и живее отделно, в
    // med-impaled-object, за да не се подпише общото изречение за директен
    // натиск под правило, което насоките изобщо не съдържат.
    questionIds: ["q-ptp-018", "q-ptp-019", "q-ptp-039", "q-ptp-040", "q-ptp-062"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 5 — спиране на кръвотечение, обработка на рани, превръзки",
    authoritative: q("src-rcuk-2025-first-aid", "Apply firm, direct manual pressure to any bleeding injury site."),
    corroborating: [
      q("src-rcuk-2025-first-aid", "Life-threatening bleeding: an escalating approach with manual direct pressure"),
      q("src-erc-2025-layperson", "Is there life-threatening bleeding? If yes, apply direct pressure."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "„Escalating approach“ е редът: директен натиск → хемостатична превръзка → турникет. Нищо в ERC/RCUK 2025 не подкрепя промиване на кървяща рана преди спиране на кървенето.",
  },
  {
    id: "med-tourniquet",
    topicBg: "Кога и как се поставя турникет",
    conceptIds: ["c-bleeding-control"],
    questionIds: ["q-ptp-018", "q-ptp-038"],
    figureBg: "5–7 см над раната",
    figureQuote: q("src-rcuk-2025-first-aid", "Place the tourniquet around the traumatised limb 5-7cm above the injury"),
    naredba24TopicBg: "чл. 9, т. 5 — спиране на кръвотечение, обработка на рани, превръзки",
    authoritative: q(
      "src-rcuk-2025-first-aid",
      "Apply a tourniquet as soon as possible for life-threatening extremity bleeding that is not controlled by direct manual pressure",
    ),
    corroborating: [
      q("src-rcuk-2025-first-aid", "Place the tourniquet around the traumatised limb 5-7cm above the injury"),
      q("src-rcuk-2025-first-aid", "Write the time the tourniquet was applied."),
      q("src-rcuk-2025-first-aid", "Do not release the tourniquet."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "И трите верни твърдения в q-ptp-038 се покриват дума по дума. Дистракторът „турникет високо на рамото при всяко кървене“ е грешен на две основания едновременно: не при всяко кървене, и не където и да е — 5–7 см над раната и не върху става.",
  },
  {
    id: "med-recovery-position",
    topicBg: "Стабилно странично положение — и кога е ПРОТИВОПОКАЗАНО",
    conceptIds: ["c-victim-handling", "c-cpr-basics"],
    questionIds: ["q-ptp-022", "q-ptp-037"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 2 — съзнание и неговите нарушения при черепно-мозъчна травма",
    authoritative: q(
      "src-rcuk-2025-first-aid",
      "Place adults and children with a decreased level of responsiveness who do NOT meet the criteria for CPR into a lateral (side-lying) recovery position.",
    ),
    corroborating: [q("src-erc-2025-layperson", "If they are in cardiac arrest position them lying flat on their back for CPR.")],
    conflicts: [
      {
        ...q("src-rcuk-2025-first-aid", "In cases of agonal breathing or trauma, do NOT move the person into the recovery position."),
        natureBg:
          "ПРЯКО ПРОТИВОРЕЧИ на нашето съдържание. Пострадал при ПТП по дефиниция е травма. ERC/RCUK 2025 казват при травма ДА НЕ се поставя в странично положение; q-ptp-022 и q-ptp-037 инструктират точно това. Това е най-тежката находка по тези 29 въпроса.",
      },
      {
        ...q("src-bchk-first-help-bls", "Поставете пострадалия в стабилно странично положение."),
        natureBg:
          "БЧК учи страничното положение за всеки в безсъзнание, който диша, без изключение за травма — т.е. българското учебно съдържание е на страната на нашия текущ отговор, а международният консенсус от 2025 г. е срещу него.",
      },
    ],
    statusBg: "contested-content-affected",
    noteBg:
      "Не се решава от вълна по източници. Изисква решение на основателя: да следваме ли ERC 2025 (и да преформулираме въпросите), или да следваме това, което БЧК изпитва. Виж README, раздел „Отвореният конфликт“.",
  },
  {
    id: "med-spinal-handling",
    topicBg: "Съмнение за травма на шийния отдел на гръбнака",
    conceptIds: ["c-victim-handling"],
    questionIds: ["q-ptp-020", "q-ptp-042", "q-ptp-064"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 6 — поведение при травми на гръбначния стълб и опорно-двигателния апарат",
    authoritative: q(
      "src-rcuk-2025-first-aid",
      "Suspect a cervical spine injury in a person who fell or dived from a height, was crushed by machinery or a heavy object or was involved in a road traffic or a sporting accident.",
    ),
    corroborating: [
      q("src-rcuk-2025-first-aid", "Minimise movement of the neck."),
      q("src-rcuk-2025-first-aid", "Never force an uncooperative person into any position, as this may exacerbate an injury."),
      q("src-erc-2025-layperson", "Do not move the person unless they are in an unsafe situation."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "Покрива q-ptp-042 (седни и не мърдай) и q-ptp-064 (глава-врат-гръб в една линия). НЕ покрива каската от q-ptp-020: нито ERC 2025, нито RCUK 2025 казват дума за сваляне на мотоциклетна каска — виж med-helmet-removal.",
  },
  {
    id: "med-move-only-if-unsafe",
    topicBg: "Кога изобщо се мести пострадал — и горящият автомобил",
    conceptIds: ["c-victim-handling", "c-first-aid-priorities"],
    questionIds: ["q-ptp-013", "q-ptp-021", "q-ptp-041", "q-ptp-063"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 8 — извличане и транспортиране на пострадали при ПТП",
    authoritative: q("src-erc-2025-layperson", "Do not move the person unless they are in an unsafe situation."),
    corroborating: [
      q("src-erc-2025-layperson", "Is the person at risk of further injury? (Road traffic? Spilled chemicals?"),
      q("src-rcuk-2025-first-aid", "Check for scene safety."),
      q("src-bchk-first-help-steps", "Това може да стане само когато той се намира в пряка, неконтролируема, опасност"),
      q("src-bchk-first-help-steps", "Когато наближите пътно-транспортно произшествие, намалете скоростта"),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "Решаващото ПРАВИЛО е покрито и от трите източника: местиш само при непосредствена опасност. Верните отговори на q-ptp-021 (гори / лежи на активна лента) стоят. ТЕХНИКАТА в q-ptp-063 не е насока — покрита е само от учебното помагало на БЧК; виж med-extrication-technique.",
  },
  {
    id: "med-extrication-technique",
    topicBg: "Техника за извличане от горящ автомобил (хват на Раутек)",
    conceptIds: ["c-victim-handling"],
    questionIds: ["q-ptp-063"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 8 — извличане и транспортиране на пострадали при ПТП",
    // authoritative stays null ON PURPOSE. Единственият източник, който описва
    // хвата, е БЧК — регистриран с authority: "not-a-grounding-source" (превод
    // на изданието на Червения кръст Белгия-Фландрия, изрично по насоките от
    // 2011 г., и същият сайт носи фактическа грешка за позицията на ръцете).
    // Учебна помагала не се повишава в основание само защото няма друго.
    authoritative: null,
    corroborating: [
      q("src-bchk-first-help-steps", "Завъртайте главата, шията или тялото на пострадалия колкото е възможно по-малко."),
      q("src-bchk-first-help-steps", "Коленичете зад главата му."),
      q("src-bchk-first-help-steps", "Сложете двете си ръце под мишниците и хванете едната му предмишница."),
      q("src-bchk-first-help-steps", "Ходете гърбом, влачейки пострадалия с вас."),
    ],
    conflicts: [],
    statusBg: "ungrounded-teaching-material-only",
    noteBg:
      "ПРАЗНИНАТА СЕ СВИ, НО НЕ Е ЗАТВОРЕНА — и предишният запис („ungrounded-no-reachable-source“, нула цитата) вече беше неверен спрямо самия q-ptp-063, който обяснява хвата и цитира БЧК дословно. Какво е вярно на 2026-08-04: БЧК, „Основните стъпки в първата помощ“, раздел „Спешно извеждане на пострадал“, ОПИСВА и хвата, и ограничението — коленичиш зад главата, двете ръце под мишниците, хващаш предмишницата, изправяш се и ходиш гърбом, влачейки пострадалия, като „завъртайте главата, шията или тялото на пострадалия колкото е възможно по-малко“ (bchk_page5.txt:39, 44, 46, 47). Това е точно движението в верния отговор на q-ptp-063. ТРИ ОГРАДИ ОБАЧЕ ОСТАВАТ: (1) БЧК е учебно помагало, не основание — authority: not-a-grounding-source; (2) разделът е ОБЩ (спешно извеждане), не за изваждане от автомобил — освобождаването на колана и автомобилният контекст ги няма никъде в текста; (3) ERC 2025 и RCUK 2025 продължават изобщо да не разглеждат извличане от автомобил, а учебната програма по Наредба № 24, чл. 8, ал. 1 НЕ Е ПУБЛИКУВАНА (търсено в ДАБДП, МЗ, strategy.bg и redcross.bg). Тоест техниката вече е проследима до назован български източник на ред, но НЕ е насока — точно както q-ptp-063 казва на ученика. Придобиването на учебната програма от БЧК остава начинът това да стане grounded.",
  },
  {
    id: "med-helmet-removal",
    topicBg: "Каска на мотоциклетист в безсъзнание",
    conceptIds: ["c-victim-handling"],
    questionIds: ["q-ptp-020"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 6 — поведение при травми на гръбначния стълб и опорно-двигателния апарат",
    authoritative: null,
    corroborating: [
      q("src-rcuk-2025-first-aid", "Minimise movement of the neck."),
      q("src-erc-2025-layperson", "Do not move the person unless they are in an unsafe situation."),
    ],
    conflicts: [],
    statusBg: "ungrounded-inferred-only",
    noteBg:
      "ПРАЗНИНА. Нито ERC 2025, нито RCUK 2025 споменават сваляне на каска. Нашият верен отговор („не я сваляш, ако диша“) е СЪВМЕСТИМ с „минимизирай движението на врата“, но това е извод, а не цитат. Не го обяснявай на ученика като насока — обясни правилото за врата, от което следва.",
  },
  {
    id: "med-airway-opening",
    topicBg: "Отваряне на дихателния път — и защо при ПТП има ВТОРА хватка",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-056"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q(
      "src-erc-2025-layperson",
      "Place one hand on the forehead and the fingertips of your other hand under the point of the chin",
    ),
    corroborating: [
      // ERC слага този въпрос НЕПОСРЕДСТВЕНО пред хватката, на същия ред от
      // A – Airway. Той е причината отговорът на q-ptp-056 да е „внимателно",
      // а не просто „отмяташ".
      q("src-erc-2025-layperson", "Has the person fallen from a height or experienced major trauma?"),
      q("src-rcuk-2025-first-aid", "using the ‘jaw-thrust’ technique"),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "ДВЕ ХВАТКИ ЗА ДВА МОМЕНТА, не две правила, които се бият — и това е причината и q-ptp-056, и q-ptp-022 да са верни, макар отговорите им да звучат обратно. Докато ОЩЕ НЕ ЗНАЕШ дали диша: отваряш пътя (ERC, A – Airway). След като вече ЗНАЕШ, че диша нормално: не пипаш главата, а RCUK дава избутване на долната челюст, ако все пак се наложи — „Airway opening, if required, always has priority over in-line immobilisation“. Забележи, че разграничителят е състояние на знанието на спасителя, а не различие между източниците: затова `conflicts` е празен.",
  },
  {
    id: "med-aed-use",
    topicBg: "Автоматичен външен дефибрилатор (AED) от неопитен спасител",
    conceptIds: ["c-cpr-basics"],
    questionIds: ["q-ptp-059"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    authoritative: q("src-rcuk-2025-bls", "Anyone can use an Automated External Defibrillator (AED)."),
    corroborating: [
      q("src-rcuk-2025-bls", "no training is needed to use an AED"),
      q("src-rcuk-2025-bls", "Some AEDs automatically turn on when opened"),
      q("src-rcuk-2025-bls", "Follow the audio/visual prompts from the AED."),
      q("src-rcuk-2025-bls", "Ensure that nobody touches the person whilst the AED is analysing the heart rhythm."),
      q("src-rcuk-2025-bls", "If a shock is indicated, ensure that nobody is touching the person."),
      q("src-rcuk-2025-bls", "After the shock has been delivered, immediately restart chest compressions."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "И четирите опции на q-ptp-059 се решават от цитати, а не от преразказ. Верният отговор е двусъставен и всяка му част има свое изречение: „следваш гласовите указания“ ← „Follow the audio/visual prompts from the AED.“; „не докосваш по време на анализ и разряд“ ← двете отделни изречения за анализа и за разряда. Дистракторът „само за медицински лица“ е ТОЧНО обратното на водещото изречение на RCUK, а „разряд веднага, без анализ“ противоречи на реда, в който самите указания се дават. ERC 2025 подкрепя същото по-общо („These initial 3-C life-saving actions can be performed by anyone“), но конкретиката е у RCUK и затова той е основанието.",
  },
  {
    id: "med-shock-recognition",
    topicBg: "Разпознаване на шок/кръвозагуба и какво се прави до линейката",
    conceptIds: ["c-bleeding-control", "c-first-aid-priorities"],
    // q-ptp-035 е същата грижа при ПОСТРАДАЛ В СЪЗНАНИЕ (топлина, спокоен глас,
    // наблюдение) и стоеше само под med-legal-duty — иск, чиито източници са
    // ЗДвП. Тоест трите му верни действия бяха клинични, цитираха ERC/RCUK в
    // текста си и не бяха вързани за нито един клиничен източник.
    questionIds: ["q-ptp-035", "q-ptp-061"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 5 — спиране на кръвотечение, обработка на рани, превръзки",
    authoritative: q("src-erc-2025-layperson", "Pale, cool or clammy skin?"),
    corroborating: [
      q("src-erc-2025-layperson", "Make the person comfortable."),
      q("src-erc-2025-layperson", "Continue to monitor the person carefully for deterioration"),
      // Забележи локатора: текстът на ERC е „n P revent hypothermia…“ —
      // извличането от PDF-а разделя главната буква от думата (същият артефакт
      // е и в „n L isten“, „n H yperthermia“). Локаторът тръгва от „revent“,
      // защото ЦИТАТЪТ е верен, а разкъсването е наше. Ако някой „поправи“
      // локатора на „Prevent hypothermia“, билдът ще падне с LOCATOR MISS — и
      // това е правилното поведение, а не повод да се пренапише цитатът.
      q("src-erc-2025-layperson", "revent hypothermia – remove wet clothes and use blankets to warm them."),
      q("src-erc-2025-layperson", "Do not move the person unless they are in an unsafe situation."),
      // За q-ptp-035. Пак разкъсан ред: изречението на ERC е „If the person is
      // responsive: talk to them calmly.“, но „talk to“ свършва ред 753, а
      // „them calmly.“ отваря 754. Локаторът хваща реда, който носи думите.
      q("src-erc-2025-layperson", "them calmly. Ask for permission to check"),
      q("src-rcuk-2025-first-aid", "cover the person with dry blankets or clothing to minimise heat loss."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "ТРИТЕ ВЕРНИ ОТГОВОРА НА q-ptp-061 НЕ СА ЕДНАКВО ЗАЗЕМЕНИ и въпросът вече го казва на ученика вместо да го скрие. „Обади се и кажи какво подозираш“ и „легнал, завит, под око“ излизат право от изреченията горе. „Нищо през устата и без обезболяващи“ НЕ Е в ERC/RCUK 2025 — утвърдена практика е и обяснението го обявява така. Отделно: изданията от 2025 г. НЕ съдържат нито „по гръб“, нито „с вдигнати крака“ при шок, затова тези дистрактори са грешни по липса, а не по забрана.",
  },
  {
    id: "med-responsiveness-check",
    topicBg: "Как се проверява съзнание — глас и ЛЕКО СТИСКАНЕ, не разтърсване",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-015"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 2 — съзнание и неговите нарушения при черепно-мозъчна травма",
    authoritative: q("src-erc-2025-layperson", "Gently stimulate the person."),
    corroborating: [
      // Разкъсан ред отново: AVPU-редът свършва с „…on squeezing their“ на 816
      // и „shoulder.“ отваря 817. Локаторът спира там, където спира редът —
      // да се допише „shoulder“ значи да се цитира изречение, което нито един
      // ред не съдържа, а точно това ADR-002 забранява.
      q("src-erc-2025-layperson", "responds to pain on squeezing their"),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "ТОВА Е ИЗТОЧНИКЪТ ЗА ЕДНА ВЕЧЕ НАПРАВЕНА ПОПРАВКА, а не нова находка: q-ptp-015 обяснява защо отговорът е „леко стисване по рамото“, а не старото „разтърси го за раменете“, и се позовава на това, че глаголът shake не се среща в нито един от източниците. Проверено отново на 2026-08-16: „shake“ дава нула попадения в ERC 2025, RCUK BLS 2025, RCUK First Aid 2025 и БЧК. Регистърът вече носи и двата цитата, на които поправката стъпва, така че тя е машинно проверима, а не въпрос на доверие към обяснението.",
  },
  {
    id: "med-call-early",
    topicBg: "Обаждането на 112 — рано, на високоговорител, диспечерът води",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-014"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 1 — общи принципи на първата долекарска помощ",
    authoritative: q("src-rcuk-2025-first-aid", "Always call for help early and, ideally, use a speakerphone"),
    corroborating: [
      q("src-erc-2025-layperson", "If unresponsive call your local emergency number and follow the dispatcher’s instructions."),
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "ВНИМАНИЕ КАКВО Е ЗАЗЕМЕНО. Заземено е ПОВЕДЕНИЕТО при обаждането: рано, на високоговорител, и следваш диспечера. НЕ Е заземен СПИСЪКЪТ „какво да кажеш“ (място, брой и състояние на пострадалите, допълнителна опасност) — той е практика на спешните служби и не се среща като изречение в ERC 2025 или RCUK 2025. q-ptp-014 вече казва това на ученика дословно; искът съществува, за да не може някой по-късно да припише списъка на насока. Правното задължение ДА уведомиш е отделно и е в lawRefs на въпроса (ЗДвП чл. 123, ал. 1, т. 2, б. „а“ и чл. 124, т. 2).",
  },
  {
    id: "med-triage-unresponsive-first",
    topicBg: "Двама пострадали — при кого се отива първо",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-033"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 4 — поведение при остри нарушения на дишането и сърдечната дейност",
    // authoritative остава null НАРОЧНО, по прецедента на med-helmet-removal.
    // Насоките подреждат ВНИМАНИЕТО при един пострадал; готово правило „кой от
    // ДВАМА е пръв“ за неспециалист не публикуват. Отговорът следва от
    // подредбата, а извод не се повишава в основание, защото е убедителен.
    authoritative: null,
    corroborating: [
      q("src-rcuk-2025-first-aid", "Pay immediate attention to safety, the responsiveness of the victim, and life-threatening bleeding."),
      q("src-rcuk-2025-bls", "Suspect cardiac arrest in any person who is unresponsive."),
      q("src-rcuk-2025-bls", "If there is any doubt, assume cardiac arrest and start CPR"),
    ],
    conflicts: [],
    statusBg: "ungrounded-inferred-only",
    noteBg:
      "Изводът е тесен и затова издържа: RCUK подрежда вниманието безопасност → реакция → животозастрашаващо кървене, а липсата на реакция е самостоятелен спусък за спряло сърце. От двете следва, че неподвижният се проверява преди кървящата ръка. Но това е СГЛОБЕНО от нас, а не прочетено — и q-ptp-033 го признава пред ученика със същите думи („насоките не публикуват готово правило кой от двама пострадали е пръв“). Затова статусът е inferred-only, а не grounded.",
  },
  {
    id: "med-nothing-by-mouth",
    topicBg: "Нищо през устата на пострадал при ПТП — и единственото изключение",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-034"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 3 — поведение при шок",
    // Пак null: ERC 2025 и RCUK 2025 НЕ разглеждат прием през устата при
    // травма. Правилото идва от спешната и анестезиологичната практика.
    authoritative: null,
    corroborating: [
      q("src-rcuk-2025-first-aid", "only use equipment and medications you have been trained to use"),
      // Единственото място, където изданията от 2025 г. НАРЕЖДАТ нещо през
      // устата — и то е за друг случай. Стои тук, за да се вижда границата.
      q("src-erc-2025-layperson", "f suspected hypoglycaemia, give the person a sugar-containing drink or sweets or dextrose tablets (via mouth)."),
    ],
    conflicts: [],
    statusBg: "ungrounded-inferred-only",
    noteBg:
      "ПРАЗНИНА, обявена. Търсено на 2026-08-16: нито ERC 2025, нито RCUK 2025 съдържат указание за прием на течности/храна след травма. Верният отговор на q-ptp-034 („нищо през устата, най-много навлажняваш устните“) идва от практиката, а не от насока, и обяснението вече го казва така. Двата цитата очертават границата ѝ: RCUK ограничава спасителя до това, за което е обучен, а ERC дава ЕДИНСТВЕНИЯ случай, в който изрично се дава нещо през устата — съмнение за ниска кръвна захар, тоест човек в съзнание БЕЗ травма. Изключението не се пренася върху пострадал след удар.",
  },
  {
    id: "med-impaled-object",
    topicBg: "Забит предмет в раната — оставя ли се на място",
    conceptIds: ["c-bleeding-control"],
    questionIds: ["q-ptp-019"],
    figureBg: null,
    naredba24TopicBg: "чл. 9, т. 5 — спиране на кръвотечение, обработка на рани, превръзки",
    // Нула цитата, нарочно — и точно това прави статуса проверим. Търсено на
    // 2026-08-16 във ВСИЧКИ осем регистрирани източника, с термините
    // impaled / embedded / foreign object / penetrating: НУЛА попадения.
    // Правилото „не вади предмета“ е утвърдена практика на първата помощ, но
    // не е изречение, което държим. Ако някой утре го намери, проверката
    // „ungrounded-no-reachable-source не носи нито един цитат“ ще счупи билда,
    // докато статусът не бъде пренаписан — вместо мълчаливо да остарее.
    authoritative: null,
    corroborating: [],
    conflicts: [],
    statusBg: "ungrounded-no-reachable-source",
    noteBg:
      "ПРАЗНИНА, обявена, а не запълнена. q-ptp-019 има ДВА верни отговора и те стъпват на различни неща: „притискаш около раната“ е med-bleeding-direct-pressure (цитирано), а „оставяш стъклото и го стабилизираш“ няма източник в нито един от осемте регистрирани документа. Обяснението на въпроса вече казва това на ученика дословно — „правилото за забития предмет е утвърдена практика на първата помощ, а не цитат от насока“ — и този иск е машинната половина на същото признание. Придобиването на учебната програма на БЧК по Наредба № 24, чл. 8, ал. 1 е начинът да се затвори.",
  },
  {
    id: "med-legal-duty",
    topicBg: "Правното задължение на мястото на ПТП",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-013", "q-ptp-014", "q-ptp-015", "q-ptp-033", "q-ptp-034", "q-ptp-035"],
    figureBg: null,
    naredba24TopicBg: null,
    authoritative: {
      sourceId: "law:zdvp",
      ...cutLaw("чл. 123", "да остане на мястото на произшествието и да изчака пристигането"),
    },
    corroborating: [
      { sourceId: "law:zdvp", ...cutLaw("чл. 123", "да вземе мерки за безопасността на движението и да окаже помощ на пострадалите") },
      { sourceId: "law:zdvp", ...cutLaw("чл. 124", "да вземе мерки за осигуряване безопасността на движението и да окаже помощ") },
      { sourceId: "law:zdvp", ...cutLaw("§ 6", '"Първа долекарска помощ" е прилагането на подходящи животоподдържащи действия') },
    ],
    conflicts: [],
    statusBg: "grounded-agreed",
    noteBg:
      "ТОВА и само това може да носи цитат „ЗДвП чл. 123“. Чл. 123 урежда СПИРАНЕТО, ОСТАВАНЕТО и ИЗВИКВАНЕТО — не съдържа нито дълбочина, нито честота, нито проверка за дишане. Чл. 124 е за водача, който НЕ е участник (нашият случай в q-ptp-013). § 6, т. 40 дава легалната дефиниция на „първа долекарска помощ“.",
  },
];

// --- checks ---------------------------------------------------------------
const problems = [];
for (const c of CLAIMS) {
  if (c.figureBg) {
    if (!c.figureQuote) {
      problems.push(`${c.id}: carries figure "${c.figureBg}" but no figureQuote`);
    } else {
      const digits = [...new Set(c.figureBg.match(/\d+/g) ?? [])];
      const missing = digits.filter((d) => !c.figureQuote.quoteBg.includes(d));
      if (missing.length) {
        problems.push(
          `${c.id}: figure "${c.figureBg}" is not stated by its own figureQuote (missing ${missing.join(", ")}) — ` +
            `this is the ЗДвП-чл.-123 failure mode`,
        );
      }
    }
  } else if (c.figureQuote) {
    problems.push(`${c.id}: has a figureQuote but no figureBg to check it against`);
  }
  if (c.authoritative === null && !c.statusBg.startsWith("ungrounded")) {
    problems.push(`${c.id}: no authoritative source but status is "${c.statusBg}"`);
  }
  // "no reachable source" is a claim ABOUT THE WORLD, and it goes stale the
  // moment somebody reaches one. med-extrication-technique sat at
  // `ungrounded-no-reachable-source` while q-ptp-063 was already teaching the
  // grip and quoting БЧК for it, verbatim — the register said "we have nothing"
  // about a technique the product was explaining to seventeen-year-olds. A
  // status that strong has to be falsifiable, so: it may carry NO quotes at all.
  // Find one and this build stops until the status is rewritten.
  if (c.statusBg === "ungrounded-no-reachable-source") {
    const found = (c.authoritative ? 1 : 0) + c.corroborating.length + c.conflicts.length;
    if (found > 0) {
      problems.push(
        `${c.id}: status says NO source is reachable, but the claim carries ${found} quote(s) ` +
          `cut out of one — say which kind of source it is instead (e.g. ungrounded-teaching-material-only)`,
      );
    }
  }
  if (c.conflicts.length && !/contested|superseded/.test(c.statusBg)) {
    problems.push(`${c.id}: has ${c.conflicts.length} conflict(s) but status "${c.statusBg}" hides them`);
  }
}
if (problems.length) {
  for (const p of problems) console.error(`  !! ${p}`);
  throw new Error(`${problems.length} claim(s) failed the grounding checks`);
}

const doc = { version: 1, retrievedAt: RETRIEVED, claims: CLAIMS };
writeFileSync(path.join(OUT, "claims.json"), JSON.stringify(doc, null, 1) + "\n", "utf8");

const byStatus = CLAIMS.reduce((a, c) => ((a[c.statusBg] = (a[c.statusBg] ?? 0) + 1), a), {});
console.log(`claims.json: ${CLAIMS.length} claims — ${JSON.stringify(byStatus)}`);
