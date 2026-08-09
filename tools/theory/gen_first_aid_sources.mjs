// Generates docs/education/92_FIRST_AID_SOURCES.md.
// Every quote is CUT FROM THE FETCHED FILE by (file,line). Nothing is typed by hand.
// If a locator stops matching, this THROWS rather than emitting a plausible-looking quote.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = path.join(ROOT, "content/medical/tools");

const FILES = {
  erc: "erc2025_layperson.txt",
  bls: "rcuk_bls.txt",
  fa: "rcuk_fa.txt",
  bchkBls: "bchk_bls.txt",
  bchkSteps: "bchk_page5.txt",
};
const LINES = {};
for (const [k, f] of Object.entries(FILES)) {
  LINES[k] = fs.readFileSync(path.join(TOOLS, f), "utf8").replace(/\r/g, "").split("\n");
}

const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, "content/medical/sources.json"), "utf8"));
const srcById = Object.fromEntries((SRC.sources || SRC).map((s) => [s.id, s]));

const META = {
  erc: { id: "src-erc-2025-layperson", label: "ERC 2025 (Guidelines for Everyone)" },
  bls: { id: "src-rcuk-2025-bls", label: "RCUK 2025 Adult Basic Life Support" },
  fa: { id: "src-rcuk-2025-first-aid", label: "RCUK 2025 First Aid" },
  bchkBls: { id: "src-bchk-first-help-bls", label: "БЧК — Основна мед. помощ и АВД" },
  bchkSteps: { id: "src-bchk-first-help-steps", label: "БЧК — Основните стъпки в първата помощ" },
};

/** Cut a quote out of the fetched text. `a`..`b` inclusive, joined; PDF layout artifacts repaired. */
function cut(key, a, b = a) {
  const arr = LINES[key];
  if (!arr) throw new Error(`no such source file: ${key}`);
  const seg = arr.slice(a - 1, b);
  if (seg.length === 0) throw new Error(`empty locator ${key}:${a}-${b}`);
  let s = seg.join(" ");
  // repair the extractor's drop-cap artifacts: "P revent" / "I\x07f" / "L isten" / bullet "n "
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  s = s.replace(/^n\s+/, "").replace(/\s+/g, " ").trim();
  s = s.replace(/\b([A-Z]) ([a-z])/g, "$1$2");
  if (s.length < 10) throw new Error(`locator ${key}:${a}-${b} produced too little text: ${s}`);
  // RCUK renders collapsible summaries: the extractor captures a truncated copy ending in
  // "..." immediately above the clean expanded text. Quoting the summary would ship an
  // ellipsis as if it were the source's own words, so refuse it and name the fix.
  for (const raw of seg) {
    if (raw.trim().endsWith("...")) {
      throw new Error(
        `TRUNCATED SOURCE LINE ${key}:${a}-${b} — this line ends in "..." (an RCUK accordion ` +
          `summary). Quoting it would ship an ellipsis as if it were the source's own words. ` +
          `Repoint at the clean expanded line immediately below it.`,
      );
    }
  }
  return s;
}

/** Assert a fragment really is present at that locator (guards against silent line drift). */
function must(key, a, b, fragment) {
  const s = cut(key, a, b);
  const sq = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!sq(s).includes(sq(fragment))) {
    throw new Error(`LOCATOR DRIFT ${key}:${a}-${b}\n  expected to contain: ${fragment}\n  actually reads:      ${s}`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// The 29 rows. `q` = quotes that settle the graded answer. `gap` = what is NOT
// settled by a retrievable source, stated rather than papered over.
// ---------------------------------------------------------------------------
const ROWS = [
  {
    id: "q-ptp-013", concept: "c-first-aid-priorities",
    claim: "Редът на действие: обезопасяваш → щом не реагира, звъниш на 112 → оценяваш дишането, докато чакаш.",
    q: [["bls", 130, 130, "no longer need to confirm abnormal breathing"], ["bls", 114, 114, "before assessing whether breathing is normal"], ["erc", 787, 787, "Do not move the person"]],
    law: "ЗДвП чл. 124, т. 1 и т. 2 (водачът не е участник) · Наредба № 24 чл. 9, т. 4",
    conflict: "ORDER-2021-SUPERSEDED",
    gap: "редът цитираше чл. 124, т. 1 като „да вземеш … да окажеш … за него“ — глаголи, пренаписани във второ лице ВЪТРЕ в кавичките, докато „за него“ остана в третото. Сега вътре в кавичките стои дословният текст на закона, а второто лице е извън тях. ПРОВЕРЕНО ПОВТОРНО, знак по знак, срещу `content/law/acts/zdvp.json`: „да вземе мерки за осигуряване безопасността на движението и да окаже помощ на пострадалите, ако това не представлява опасност за него“ съвпада дословно с чл. 124, т. 1. Виж §7.3.",
    gapClosed: true,
  },
  {
    id: "q-ptp-014", concept: "c-first-aid-priorities",
    claim: "Какво съобщаваш на 112: точно място, брой и състояние на пострадалите, допълнителна опасност.",
    q: [["fa", 110, 110, "use a speakerphone"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · чл. 124, т. 2",
    gap: "Точният СПИСЪК какво да кажеш не съществува дословно в ERC 2025 или RCUK 2025. Редът е диспечерска практика. Обяснението на реда го заявява.",
  },
  {
    id: "q-ptp-015", concept: "c-first-aid-priorities",
    claim: "Съзнанието се проверява с висок глас и внимателно разтърсване на раменете.",
    q: [["erc", 752, 752, "Gently stimulate the person"], ["bls", 160, 160, "agonal gasping"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 2 и т. 4",
    gap: "Думата „рамо“ не е отделно предписание в текста — ERC казва „gently stimulate“. Редът го признава изрично.",
    warn: "ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ. „shake“ = 0 срещания и в ERC 2025, и в RCUK BLS 2025. Единственият източник за РАЗТЪРСВАНЕ е БЧК (`bchk_bls.txt:20`, „Леко разтърсете рамото на пострадалия.“) — а БЧК е `not-a-grounding-source`. Междувременно RCUK казва за ПТП „Minimise movement of the neck.“ (`rcuk_fa.txt:229`). Тоест градираният верен отговор учи движение, което същите насоки искат да сведеш до минимум. Редът признава думата „рамо“, но НЕ признава глагола „разтърсваш“. Урокът вече е по-предпазлив от реда („внимателно го стимулираш“) — разминаване, което трябва да се реши в полза на реда или на урока, но не да остане.",
  },
  {
    id: "q-ptp-016", concept: "c-cpr-basics",
    claim: "Натиск в центъра на гръдния кош, 100–120 в минута.",
    q: [["erc", 446, 446, "100 to 120 chest compressions per minute"], ["bls", 183, 184, "lower half of the sternum"]],
    law: "Наредба № 24 чл. 9, т. 4",
    conflict: "BCHK-ABDOMEN-ERROR",
  },
  {
    id: "q-ptp-017", concept: "c-cpr-basics",
    claim: "Започваш веднага; 30:2 при обучен; продължаваш до помощ / дишане / изтощение; не е нужно разрешение.",
    q: [["bls", 117, 117, "Start chest compressions as soon as possible"], ["erc", 449, 449, "30 compressions followed by 2 breaths"], ["fa", 141, 141, "the rescuer becomes exhausted"], ["bls", 111, 111, "Everyone can learn how to perform"], ["erc", 411, 411, "can be performed by anyone who comes upon"], ["bls", 128, 128, "The risk of harm from CPR is low"], ["erc", 745, 745, "which vary between locations"]],
    law: "Наредба № 24 чл. 9, т. 4 · ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · ЗДвП чл. 124, т. 1 (добавени,\nзащото „не е нужно разрешение“ е ЮРИДИЧЕСКО твърдение и не може да стъпва на клинична насока)",
    gap: "редът поставяше в кавички „Everyone can learn how to perform CPR“; източникът пише „…cardiopulmonary resuscitation (CPR)“. Сега е дословно. И по-същественото: този цитат носеше сам и твърдението „не ти трябва разрешение или диплома“, което е различно твърдение. Клиничната половина вече стъпва на `rcuk_bls.txt:111` + `erc2025_layperson.txt:411` + `rcuk_bls.txt:128`; юридическата — на ЗДвП, защото самият ERC препраща към местното право (`erc2025_layperson.txt:745`). Виж §7.3.",
    gapClosed: true,
    warn: "опция (b) — „Започваш незабавно, щом установиш, че пострадалият НЕ ДИША“ — е градирана ВЯРНА, но собственото обяснение на реда я оттегля два абзаца по-долу: „не че изобщо не диша, а че не диша НОРМАЛНО“. Агоналното хъркане Е дишане за неопитно око и е точно случаят, в който хората задържат масажа. Текстът на опцията трябва да стане „не реагира и не диша НОРМАЛНО“, преди редът да се подпише.",
  },
  {
    id: "q-ptp-018", concept: "c-bleeding-control",
    claim: "Първото действие при силно кървене е директен натиск върху раната.",
    q: [["fa", 237, 237, "firm, direct manual pressure"], ["fa", 238, 238, "haemostatic dressing"], ["fa", 241, 241, "5-7cm above the injury"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
  },
  {
    id: "q-ptp-019", concept: "c-bleeding-control",
    claim: "Забит предмет не се вади; стабилизира се, натискът е около раната.",
    q: [["fa", 237, 237, "firm, direct manual pressure"], ["fa", 238, 238, "any clean material can be utilised"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
    gap: "ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „impal“ = 0 срещания в ERC 2025, RCUK BLS 2025 и RCUK First Aid 2025. Правилото за забития предмет е утвърдена практика, не цитат. Редът го казва на ученика.",
  },
  {
    id: "q-ptp-020", concept: "c-victim-handling",
    claim: "Каската на дишащ мотоциклетист не се сваля; сваля се само ако не диша.",
    q: [["fa", 228, 228, "road traffic or a sporting accident"], ["fa", 229, 229, "Minimise movement of the neck"], ["fa", 231, 231, "always has priority over in-line immobilisation"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6",
    gap: "ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „helmet“ = 0 срещания и в трите издания от 2025 г. Отговорът е ИЗВЕДЕН от правилото за врата, не цитиран. Редът рекламира извода вместо да го скрие (claims.json: ungrounded-inferred-only).",
  },
  {
    id: "q-ptp-021", concept: "c-victim-handling",
    claim: "Мести се само при пожар или реална опасност от нов удар.",
    q: [["erc", 787, 787, "unless they are in an unsafe situation"], ["erc", 750, 750, "Spilled chemicals? Live wires?"], ["bchkSteps", null, null, "пряка, неконтролируема"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8",
  },
  {
    id: "q-ptp-022", concept: "c-victim-handling",
    claim: "ОБЪРНАТ КЛЮЧ: дишащ в безсъзнание при ПТП НЕ се обръща в странично положение; главата и вратът се придържат в една линия.",
    q: [["fa", 149, 149, "do NOT move the person into the recovery position"], ["erc", 764, 764, "no signs of physical trauma"], ["erc", 768, 768, "do NOT move the person into the recovery position"], ["fa", 231, 231, "always has priority over in-line immobilisation"], ["fa", 148, 148, "into a lateral (side-lying) recovery position"], ["fa", 232, 232, "roll them as a unit onto their back"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9",
    conflict: "RECOVERY-POSITION",
    gap: "виж §3 → `AIRWAY-MANOEUVRE-SPLIT`. Редът вече казва защо ТУК не се отмята главата, а в `q-ptp-056` се отмята, и цитира и двата източника. Кавичките са пренаписани: ERC и RCUK изреченията стояха в български превод ВЪТРЕ в кавичките — сега вътре стои английският оригинал, а преводът е извън тях.",
    gapClosed: true,
    warn: "ЧЕТИ ИЗКЛЮЧЕНИЕТО ВНИМАТЕЛНО. Редът (и урокът) казват: „ако не можеш да опазиш дихателния път другояче — повръща, тече кръв, лежи по лице — тогава ГО ОБРЪЩАШ“, и заземяват това на `rcuk_fa.txt:232`. Но 232 покрива САМО човек, който лежи ПО ЛИЦЕ, и го обръща ПО ГРЪБ. За повръщащ пострадал ПО ГРЪБ насоките от 2025 г. не дават изречение. Действието е клинично правилно (дихателният път бие гръбнака — `rcuk_fa.txt:231` го казва изрично), но цитатът покрива една трета от случаите, които изречението изброява. Това е същият навик „близостта минава за доказателство“, оцелял в изключението на най-опасното правило в темата.",
  },
  {
    id: "q-ptp-033", concept: "c-first-aid-priorities",
    claim: "При двама пострадали първо отиваш при неподвижния.",
    q: [["bls", 157, 158, "Suspect cardiac arrest in any person who is unresponsive"], ["bls", 164, 164, "assume cardiac arrest and start CPR"], ["fa", 144, 144, "life-threatening bleeding"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 4",
    gap: "Насоките НЕ публикуват готово правило за подреждане на двама пострадали за неспециалисти. Подредбата е ПРИЛОЖЕНИЕ на „липсата на реакция е спусъкът“. Редът го заявява.",
  },
  {
    id: "q-ptp-034", concept: "c-first-aid-priorities",
    claim: "На пострадал не се дава нищо през устата.",
    q: [["fa", 110, 110, "only use equipment and medications you have been trained to use"]],
    law: "Наредба № 24 чл. 9, т. 3",
    gap: "НЕЗАЗЕМЕН. Нито ERC 2025, нито RCUK 2025 разглеждат прием през устата при травма. Обратно — ERC 2025 (ред 822) указва подсладена течност ПРЕЗ УСТАТА при съмнение за хипогликемия. Редът записва и празнотата, и изключението.",
  },
  {
    id: "q-ptp-035", concept: "c-first-aid-priorities",
    claim: "При шок: топлина, спокоен глас, непрекъснато наблюдение; без лекарства и алкохол.",
    q: [["erc", 753, 754, "talk to them calmly"], ["erc", 825, 825, "use blankets to warm them"], ["fa", 283, 283, "minimise heat loss"], ["erc", 813, 813, "deterioration or loss of responsiveness"]],
    law: "Наредба № 24 чл. 9, т. 3 и т. 9",
    gap: "ИЗТРИТО ТВЪРДЕНИЕ: старият текст твърдеше, че ERC препоръчва по гръб / с вдигнати крака при шок. Няма такова указание в изданията от 2025 г. Редът съобщава отсъствието.",
  },
  {
    id: "q-ptp-036", concept: "c-cpr-basics",
    claim: "Дълбочина 5–6 см с пълно изправяне между натисканията.",
    q: [["erc", 446, 446, "push the chest down 5 to 6 cm"], ["bls", 119, 119, "at least 5 cm, but not more than 6 cm"], ["bls", 192, 192, "Allow the chest to recoil completely"], ["bchkBls", null, null, "най-малко 5 см"]],
    law: "Наредба № 24 чл. 9, т. 4",
    conflict: "BCHK-DEPTH-AGREES",
  },
  {
    id: "q-ptp-037", concept: "c-cpr-basics",
    claim: "На човек, който диша нормално, масаж НЕ се прави; дихателният път се пази, не се мести без нужда.",
    q: [["fa", 149, 149, "do NOT move the person into the recovery position"], ["erc", 787, 787, "unless they are in an unsafe situation"], ["bls", 162, 162, "cardiac arrest should be assumed"]],
    law: "Наредба № 24 чл. 9, т. 2 и т. 4",
    conflict: "RECOVERY-POSITION",
  },
  {
    id: "q-ptp-038", concept: "c-bleeding-control",
    claim: "Турникет само при животозастрашаващо кървене, което натискът не спира; часът се записва; не се сваля.",
    q: [["fa", 240, 240, "as soon as possible for life-threatening extremity bleeding"], ["fa", 241, 241, "but not over a joint"], ["fa", 243, 243, "Write the time the tourniquet was applied"], ["fa", 244, 244, "only be released by a healthcare professional"], ["fa", 245, 245, "second tourniquet"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
  },
  {
    id: "q-ptp-039", concept: "c-bleeding-control",
    claim: "Напоената превръзка не се сваля — новата отива отгоре, натискът не се прекъсва.",
    q: [["fa", 238, 238, "packed into the wound"], ["fa", 240, 240, "as soon as possible"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
    gap: "Самото правило „превръзка върху превръзката“ е утвърдена практика, не буквален текст от насока. Редът го казва.",
  },
  {
    id: "q-ptp-040", concept: "c-bleeding-control",
    claim: "Яркочервена пулсираща кръв = артериално кървене; натискаш незабавно и викаш помощ.",
    q: [["fa", 236, 237, "Call 999"], ["fa", 237, 237, "firm, direct manual pressure"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
    gap: "ERC 2025 и RCUK 2025 НЕ класифицират кървенето по външен вид — няма „артериално“/„венозно“ описание никъде. Разпознаването по цвят е класическа педагогика; ЗАЗЕМЕНО е ДЕЙСТВИЕТО. Редът го заявява.",
  },
  {
    id: "q-ptp-041", concept: "c-victim-handling",
    claim: "Заклещен без пряка опасност не се вади насила; обездвижваш колата, оставаш, следиш.",
    q: [["erc", 787, 787, "unless they are in an unsafe situation"], ["fa", 229, 229, "self-maintain their neck in a comfortable, stable position"], ["fa", 230, 230, "Never force an uncooperative person"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8",
    gap: "ИЗТРИТА ЦИФРА: предишната вълна твърдеше, че самоизваждащ се пострадал движи врата си „до четири пъти по-малко“. ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „four times“ / „self-extric“ / „extricat“ = 0 срещания и в трите издания. Премахнато.",
  },
  {
    id: "q-ptp-042", concept: "c-victim-handling",
    claim: "Болка във врата след удар → сяда и остава неподвижен до преглед.",
    q: [["fa", 228, 228, "road traffic or a sporting accident"], ["fa", 229, 229, "Minimise movement of the neck"], ["fa", 230, 230, "may exacerbate an injury"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6",
  },
  {
    id: "q-ptp-056", concept: "c-first-aid-priorities",
    claim: "Преди проверка на дишането дихателният път се отваря — глава назад, брадичка нагоре.",
    q: [["erc", 785, 785, "gently tilt the person"], ["erc", 783, 783, "Consider cervical spine injury"]],
    law: "Наредба № 24 чл. 9, т. 4 и т. 6",
    conflict: "AIRWAY-MANOEUVRE-SPLIT",
  },
  {
    id: "q-ptp-057", concept: "c-first-aid-priorities",
    claim: "Дишането се проверява до 10 секунди, с поглед, слух и усещане.",
    q: [["erc", 791, 792, "maximum of 10 seconds"], ["bls", 160, 160, "agonal gasping"]],
    law: "Наредба № 24 чл. 9, т. 4",
    conflict: "TEN-SECONDS-DROPPED-BY-RCUK",
  },
  {
    id: "q-ptp-058", concept: "c-first-aid-priorities",
    claim: "Не затваряш; високоговорител; звъниш при всяко съмнение.",
    q: [["fa", 110, 110, "use a speakerphone"], ["bls", 167, 168, "activate the speaker function"], ["bls", 164, 164, "assume cardiac arrest"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „а“ · чл. 124, т. 2",
    gapClosed: true,
    gap: "Опция b („безплатно, дори без кредит или SIM карта“) е далекосъобщителна регулация, не медицина, и вече Е заземена — но извън този регистър, защото не е медицински факт: `src-krs-pravila-112` в content/sources (Правила на КРС, обн. ДВ, бр. 12 от 11.02.2022 г., изм. ДВ, бр. 34 от 16.04.2024 г.). Чл. 3, т. 1 задължава мобилните оператори да поддържат повикване към 112 „от мобилни устройства без SIM карта“; чл. 2, ал. 1 — безплатно; чл. 2, ал. 2 — и за ползватели със забрана за изходящи повиквания (изчерпана предплатена карта). ОСТАВА КАЗАНО В РЕДА: правилото задължава МРЕЖИТЕ и не е измерване на терен, а до 2022 г. България е била сред ЗАБРАНЯВАЩИТЕ (`src-ecc-report-324`) — тоест не е европейска даденост.",
  },
  {
    id: "q-ptp-059", concept: "c-cpr-basics",
    claim: "AED се използва от всекиго, по гласовите указания; никой не докосва при анализ и разряд.",
    q: [["bls", 122, 122, "Anyone can use an Automated External Defibrillator"], ["bls", 125, 125, "no training is needed"], ["bls", 211, 212, "as soon as it is available"], ["bls", 217, 217, "nobody touches the person"]],
    law: "Наредба № 24 чл. 9, т. 4",
  },
  {
    id: "q-ptp-060", concept: "c-cpr-basics",
    claim: "Без обдишване — само непрекъснати натискания.",
    q: [["bls", 199, 199, "perform continuous chest compressions without interruptions"], ["bls", 128, 128, "The risk of harm from CPR is low"], ["fa", 140, 140, "should not be concerned about causing harm"]],
    law: "Наредба № 24 чл. 9, т. 4",
    gap: "ИЗТРИТО ПРЕУВЕЛИЧЕНИЕ: старият текст твърдеше, че нищо не може да влоши пострадал със спряло сърце. Източникът казва „рискът е малък“ — друго изречение. Коригирано.",
  },
  {
    id: "q-ptp-061", concept: "c-bleeding-control",
    claim: "Съмнение за вътрешен кръвоизлив: 112, полагане, топлина, наблюдение, нищо през устата.",
    q: [["erc", 809, 809, "Pale, cool or clammy skin"], ["erc", 811, 811, "Make the person comfortable"], ["erc", 825, 825, "use blankets to warm them"], ["erc", 813, 813, "deterioration or loss of responsiveness"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ и б. „а“",
    gap: "„Нищо през устата“ е утвърдена практика, не изречение от насоките — редът го казва. ВЖ. СЪЩО конфликта LAY-DOWN-vs-035 по-долу.",
  },
  {
    id: "q-ptp-062", concept: "c-bleeding-control",
    claim: "ПРЕМАХНАТ КЛЮЧ: повдигането на крайника вече не е верен отговор; ескалацията е натиск → превръзка в раната → турникет.",
    q: [["fa", 113, 113, "an escalating approach with manual direct pressure"], ["fa", 238, 238, "packed into the wound"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 5",
    conflict: "ELEVATION-ABSENT",
  },
  {
    id: "q-ptp-063", concept: "c-victim-handling",
    claim: "Горяща кола: освобождаваш колана, хващаш изотзад под мишниците, теглиш по оста на тялото.",
    q: [["erc", 787, 787, "unless they are in an unsafe situation"], ["bchkSteps", null, null, "Завъртайте главата, шията или тялото"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 8",
    conflict: "EXTRICATION-BCHK-ONLY",
  },
  {
    id: "q-ptp-064", concept: "c-victim-handling",
    claim: "При наложено местене: глава-врат-гръб в една линия, най-кратък път, двама-трима координирано.",
    q: [["fa", 232, 232, "roll them as a unit"], ["fa", 229, 229, "Minimise movement of the neck"], ["bchkSteps", null, null, "Завъртайте главата, шията или тялото"]],
    law: "ЗДвП чл. 123, ал. 1, т. 2, б. „в“ · Наредба № 24 чл. 9, т. 6",
  },
];

// Bulgarian sources are cut by SEARCH (their line numbering is not stable across re-extraction).
function cutBg(key, fragment) {
  const arr = LINES[key];
  const sq = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const idx = arr.findIndex((l) => sq(l).includes(sq(fragment)));
  if (idx < 0) throw new Error(`BG locator not found in ${FILES[key]}: ${fragment}`);
  return { text: arr[idx].trim(), line: idx + 1 };
}

const CONFLICTS = {
  "RECOVERY-POSITION": {
    title: "Стабилното странично положение при ПТП — международните насоки срещу българското обучение",
    body: [
      "ERC 2025 и RCUK 2025 СЪВПАДАТ и двете забраняват страничното положение при травма. Пострадал при ПТП е травма по определение.",
      "БЧК учи страничното положение за всеки в безсъзнание, който диша, БЕЗ изключение за травма.",
      "РЕШЕНИЕТО НЕ Е НА АГЕНТ. q-ptp-022 е с обърнат ключ и остава `needs-review` точно защото отклонението от националния учебен орган по животоспасяващ въпрос иска подпис на основателя.",
      "ВНИМАНИЕ КЪМ ОБРАТНАТА ГРЕШКА: ако ученик запомни само „настрани е грешно“, ще гледа как пострадал аспирира повърнато. И двата реда носят изхода: ако не можеш да опазиш дихателния път другояче — обръщаш, като едно цяло.",
    ],
    quotes: [["fa", 148, 149], ["erc", 764, 764], ["erc", 768, 768], ["fa", 231, 231]],
    bg: [["bchkBls", "стабилно странично положение"]],
  },
  "BCHK-ABDOMEN-ERROR": {
    title: "БЧК публикува жива грешка за мястото на натиска",
    body: [
      "Страницата на БЧК указва натиск „върху горната част на корема“. ERC и RCUK 2025 казват долната половина на ГРЪДНАТА КОСТ и изрично не корема.",
      "Прилича на изгубено отрицание при превода от изданието на Червения кръст Белгия-Фландрия.",
      "Това е достатъчно основание БЧК никога да не бъде заземяващ източник (`authority: not-a-grounding-source`). Цитира се като конфликт, никога като указание.",
      "q-ptp-016 не просто маркира дистрактора като грешен — обяснението посочва откъде идва грешката, защото български 17-годишен може да я прочете днес.",
    ],
    quotes: [["bls", 183, 184]],
    bg: [["bchkBls", "върху горната част на корема"]],
  },
  "BCHK-DEPTH-AGREES": {
    title: "Дълбочината е точката, в която БЧК СЪВПАДА с ERC 2025",
    body: [
      "Тезата, че БЧК още учи 4–5 см, НЕ СЕ ПОТВЪРЖДАВА от текста към 2026-08-04 — страницата казва 5–6 см.",
      "Нищо надолу по веригата не бива да стъпва на твърдението за 4–5 см.",
    ],
    quotes: [["erc", 446, 446], ["bls", 119, 119]],
    bg: [["bchkBls", "най-малко 5 см"]],
  },
  "ORDER-2021-SUPERSEDED": {
    title: "Редът на обаждането се е ОБЪРНАЛ в изданията от 2025 г.",
    body: [
      "До ERC/RCUK 2021: провери дишането → после звънни. От 2025 г.: звъниш при всеки, който не реагира, и оценяваш дишането, ДОКАТО чакаш.",
      "Всеки ред, който подрежда „провери дишането → после звънни“, кодира отменено издание. q-ptp-013 е с пренаписана ВЯРНА ОПЦИЯ, не само с ново обяснение.",
    ],
    quotes: [["bls", 130, 130], ["bls", 114, 114]],
  },
  "TEN-SECONDS-DROPPED-BY-RCUK": {
    title: "Едно и също семейство насоки, две представяния, една изчезнала цифра",
    body: [
      "Прозорецът от 10 секунди оцелява в главата за първа помощ/ABCDE на ERC 2025 и на страницата на БЧК.",
      "ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: не се появява никъде в текста на RCUK Adult BLS 2025.",
      "Затова q-ptp-057 го преподава като „не се бави повече от 10 секунди“, а не като процедура, която трябва да изкараш докрай преди да действаш — и го казва на ученика.",
    ],
    quotes: [["erc", 791, 792]],
  },
  "ELEVATION-ABSENT": {
    title: "Повдигането на крайника отсъства от изданията 2025 г.",
    body: [
      "ПРОВЕРЕНИ ОТРИЦАТЕЛНИ РЕЗУЛТАТИ, преброени машинно и в трите текста от 2025 г.: „elevation“ 0 · „elevate“ 0 · „elevating“ 0 · „raise the limb“ 0 · „pressure point“ 0 · „cryotherap“ 0.",
      "Тоест повдигането не е просто недоказано — то отсъства от актуалната стълбица. Затова ключът е премахнат и заменен с реалната ескалация.",
      "Редът НЕ твърди, че повдигането вреди. Опасното е да РАЗЧИТАШ на него — отнема ръце и внимание от натиска.",
    ],
    quotes: [["fa", 113, 113], ["fa", 238, 238]],
  },
  "EXTRICATION-BCHK-ONLY": {
    title: "Изваждането от автомобил: решението е заземено три пъти, ХВАТЪТ — само от БЧК",
    body: [
      "ПРОВЕРЕН ОТРИЦАТЕЛЕН РЕЗУЛТАТ: „extricat“ = 0 срещания в ERC 2025, RCUK BLS 2025 и RCUK First Aid 2025. Международните насоки изобщо не разглеждат изваждане от автомобил.",
      "Наредба № 24 чл. 9, т. 8 прави темата ИЗПИТНА, без да описва хват.",
      "Затова за тази ЕДНА тема БЧК не е „изостанал от консенсуса“ — няма консенсус, от който да изостава. Редът заявява източника открито.",
      "РАЗМИНАВАНЕ В РЕГИСТЪРА: content/medical/claims.json още държи med-extrication-technique на `ungrounded-no-reachable-source`, докато редът вече цитира вече-изтеглените и хеширани стъпки на БЧК. Регистърът изостава от съдържанието.",
    ],
    quotes: [["erc", 787, 787]],
    bg: [["bchkSteps", "пряка, неконтролируема"], ["bchkSteps", "Завъртайте главата, шията или тялото"]],
  },
  "AIRWAY-MANOEUVRE-SPLIT": {
    title: "✅ ЗАТВОРЕНО · Двата реда вече казват какво ги различава",
    body: [
      "q-ptp-056 (вярна опция): отмяташ главата назад и повдигаш брадичката — по ERC 2025, раздел A-Airway. Сцената: в безсъзнание, дишането ОЩЕ НЕ Е проверено.",
      "q-ptp-022 (обяснение): придържаш неподвижно и „при нужда“ отваряш дихателния път с избутване на долната челюст, „а не с отмятане на главата“ — по RCUK 2025, раздел за шийна имобилизация. Сцената: диша НОРМАЛНО.",
      "ДВЕТЕ СА ПОМИРИМИ и всяко е коректно заземено в своя източник: различава ги състоянието на дишането. При непроверено дишане дихателният път бие гръбнака; при потвърдено нормално дишане няма какво да отваряш, затова не пипаш.",
      "Не е опасно действие — и двата хвата отварят дихателния път. Опасното е колебанието. По THEO-4 ученикът трябва да знае ЗАЩО, а тук „защото“ е състоянието на дишането.",
      "**КАК Е ЗАТВОРЕНО:** и двата реда вече носят един и същ разграничител, изписан еднакво и в двата — ЗНАЕШ ЛИ ВЕЧЕ, ЧЕ ЧОВЕКЪТ ДИША НОРМАЛНО — и всеки препраща към другия случай, вместо да го премълчава. 056 добавя и дословния текст на RCUK за хвата с челюстта (`rcuk_fa.txt:231`); 022 добавя дословния текст на ERC за отмятането (`erc2025_layperson.txt:785`), за да види ученикът и двата източника на едно място. Нито един ключ не е пипан — сменена е само липсата на „защо“.",
      "**ОСТАВА ОТВОРЕНО ЕДНО НЕЩО, И ТО НЕ Е В БАНКАТА:** разграничителят го няма в `content/lessons/l-accidents-first-aid.json`. Урокът учи отмятането в `b-priorities` и придържането в `b-victim-handling`, без изречението, което ги помирява — тоест точно колебанието, което двата реда вече премахват, урокът още може да произведе.",
    ],
    quotes: [["erc", 785, 785], ["fa", 231, 231]],
  },
  "LAY-DOWN-vs-035": {
    title: "✅ ЗАТВОРЕНО · „Make the person comfortable“ вече не носи повече, отколкото казва",
    body: [
      "q-ptp-035 заявява изрично, че в изданията от 2025 г. НЯМА указание пострадал в шок да се полага по гръб или с вдигнати крака.",
      "q-ptp-061 маркира „полагаш го да лежи“ като ВЯРЕН отговор и го извеждаше от „Make the person comfortable“ (ERC 2025, ред 811).",
      "Строго погледнато двете не си противоречат: 035 отрича конкретно ПО ГРЪБ / С ВДИГНАТИ КРАКА, а 061 казва само „полагаш“. Но ученик, който прочете и двата, ще види противоречие.",
      "Заземяването на q-ptp-061 за топлината и наблюдението беше стабилно; под въпрос беше само глосата „полагаш го“.",
      "**КАК Е ЗАТВОРЕНО:** 061 вече разделя трите действия по произход — топлината и наблюдението са дословни от ERC, а „лежи, вместо да ходи“ е обявено изрично като практически прочит на „Make the person comfortable.“ плюс „Do not move the person unless they are in an unsafe situation.“ (`erc2025_layperson.txt:787`), а НЕ като изречение от насока. Добавен е абзац, който казва, че това не е старата поза. 035 е допълнен огледално: отрича се позата, не покоят. Ключовете и на двата реда са непроменени.",
      "**ПОПРАВКА В САМИЯ 035, намерена при затварянето:** редът твърдеше „единственото „по гръб“ там е за сърдечен масаж“. Не е единственото: `rcuk_fa.txt:232` указва обръщане по гръб и на човек, който лежи по лице и трябва да му се отвори дихателният път. И двете места са заради дишането, не заради шока — редът вече го казва така.",
    ],
    quotes: [["erc", 811, 811], ["erc", 809, 809]],
  },
};

// ---------------------------------------------------------------------------
let out = "";
const W = (s = "") => { out += s + "\n"; };

W("# 92 — Първа помощ: източникът зад всеки от 29-те реда");
W();
W("> **За какво служи този документ.** Основателят трябва да може да провери всеки ред за трийсет секунди,");
W("> а продуктът никога повече да не стъпва на нещо, което никой не може да изтегли отново.");
W("> За всеки ред: твърдението, ДОСЛОВНИЯТ цитат, файлът и редът в изтегления текст, URL-ът и датата на изтегляне.");
W(">");
W("> **Всеки цитат в този файл е ИЗРЯЗАН от изтегления текст по локатор.** Нищо не е преписано на ръка.");
W("> Генераторът хвърля грешка, ако локатор спре да съвпада — вместо да произведе правдоподобно изглеждащ цитат.");
W("> Регенерирай с: `node tools/theory/gen_first_aid_sources.mjs` (виж „Как да проверите сами“ най-долу).");
W();
W("**Издание:** ERC Guidelines 2025 (пуснати 22.10.2025 г., Ротердам) — ERC 2021 е ОТМЕНЕНО и не се цитира никъде в банката.");
W("**Изтеглено:** " + (SRC.retrievedAt || "2026-08-04") + ". **Обхват:** 29 реда в `content/questions/ptp-i-parva-pomosht.json`");
W("(c-first-aid-priorities 9 · c-cpr-basics 6 · c-bleeding-control 7 · c-victim-handling 7).");
W();
W("---");
W();

// ---------------------------------------------------------------------------
// THE THIRTY-SECOND INDEX. Derived from ROWS, never hand-listed, so it cannot
// drift from §2. „Празнота" = the row itself declares that no retrievable
// source settles the claim; those are the rows the founder must read himself,
// because on those rows there is nothing for him to check the text AGAINST.
// ---------------------------------------------------------------------------
W("## Указател за проверка (един ред, трийсет секунди)");
W();
W("Всеки ред по-долу препраща към §2, където стоят твърдението, ДОСЛОВНИЯТ цитат, файлът и редът в");
W("изтегления текст, URL-ът и датата на изтегляне. Колоната „Първи източник“ е локаторът, който отваря");
W("най-бързо: `sed -n '<ред>p' content/medical/tools/<файл>`.");
W();
W("| Ред | Първи източник | Празнота | Конфликт | ⚠ Отворено |");
W("|---|---|---|---|---|");
for (const r of ROWS) {
  const first = r.q && r.q.length > 0 ? `\`${FILES[r.q[0][0]]}:${r.q[0][1] === null ? "—" : r.q[0][1]}\`` : "—";
  const gapCell = r.gap ? (r.gapClosed ? "✅ затворена" : "**ДА**") : "—";
  W(`| [\`${r.id}\`](#${r.id}) | ${first} | ${gapCell} | ${r.conflict ? "`" + r.conflict + "`" : "—"} | ${r.warn ? "**⚠**" : "—"} |`);
}
W();

const openGapRows = ROWS.filter((r) => r.gap && !r.gapClosed);
const warnRows = ROWS.filter((r) => r.warn);
W("### Редовете с ДЕКЛАРИРАНА празнота — прочети ТЕЗИ сам");
W();
W("На тези редове няма достижим източник, който да реши твърдението. Редът го КАЗВА на ученика вместо да");
W("го премълчи — но точно затова тук няма цитат, срещу който да сверяваш: остава твоята преценка.");
W();
W(`**${openGapRows.length} от 29 реда:**`);
W();
for (const r of openGapRows) W(`- \`${r.id}\` — ${r.claim}<br>  ${r.gap}`);
W();
W("### Редовете с ОТВОРЕНА находка от клиничния преглед");
W();
if (warnRows.length === 0) {
  W("Няма.");
} else {
  W(`**${warnRows.length} реда.** Това НЕ са празноти в източниците — това са неща в НАШИЯ текст, които`);
  W("трябва да се променят, преди редът да получи подпис.");
  W();
  for (const r of warnRows) W(`- \`${r.id}\` — ${r.warn}`);
}
W();
W("---");
W();
W("## 0. Правната рамка — и защо тя не решава нито една цифра");
W();
W("**Наредба № 24 от 2.12.2002 г.** (МЗ + МОН, по ЗДвП чл. 152а, т. 2) определя учебната програма по първа");
W("долекарска помощ за кандидат-водачи. Изменена с **ДВ бр. 114 от 24.12.2025 г., в сила от 26.01.2026 г.**");
W();
W("**Структурната находка:** чл. 9 определя КОИ ТЕМИ се преподават и изпитват и не съдържа НИТО ЕДНА клинична");
W("стойност — нито дълбочина, нито честота, нито съотношение. чл. 8, ал. 1 делегира съдържанието на учебна");
W("програма, изготвена от БЧК и утвърдена от министъра на здравеопазването — която **НЕ Е ПУБЛИКУВАНА**.");
W();
W("Затова наредбата решава ОБХВАТА и не може да реши нито една цифра. Всяко клинично твърдение носи и");
W("заземяването си по ERC/RCUK, и темата си по чл. 9.");
W();
W("| Акт | За какво може да се цитира | Издание |");
W("|---|---|---|");
W("| ЗДвП чл. 123 | ЗАДЪЛЖЕНИЕТО на участник в ПТП да уведоми и да помогне — и нищо друго | ДВ бр. 55 от 16.06.2026 г. |");
W("| ЗДвП чл. 124 | Същото, за водач, който НЕ е участник (случаят в q-ptp-013) | ДВ бр. 55 от 16.06.2026 г. |");
W("| Наредба № 24 чл. 9 | Че темата е ИЗПИТНА. Никога за клинична стойност | ДВ бр. 114 от 24.12.2025 г. |");
W("| ERC 2025 / RCUK 2025 | Всяка клинична стойност и всяко действие | 2025 |");
W();
W("> ⚠️ **Наредба № 24 още не е закачена в зареждача.** `ACT_IDS` в `platform/src/lib/content/law/corpus.ts`");
W("> е `[\"zdvp\", \"naredba-iz-2539\", \"naredba-38\"]`. Всичките **44** позовавания на „Наредба № 24“ в този");
W("> файл се разрешават като `act-not-in-corpus` в конзолата за преглед — рецензентът вижда цитат, който");
W("> не може да отвори. Точно дефектът, който програмата закрива, в нова форма.");
W();
W("---");
W();
W("## 1. Източниците");
W();
W("| id | Издател | Авторитет | URL | Изтеглен | textSha256 |");
W("|---|---|---|---|---|---|");
for (const id of ["src-erc-2025-layperson", "src-rcuk-2025-bls", "src-rcuk-2025-first-aid", "src-naredba-24-lex", "src-bchk-first-help-bls", "src-bchk-first-help-steps", "src-naredba-24-sars"]) {
  const s = srcById[id];
  if (!s) continue;
  W(`| \`${s.id}\` | ${(s.publisherBg || "").replace(/\|/g, "/")} | \`${s.authority}\` | ${s.url} | ${SRC.retrievedAt} | \`${String(s.textSha256).slice(0, 16)}…\` |`);
}
W();
W("**Защо БЧК е `not-a-grounding-source`:** страницата сама заявява, че е изградена по насоките на МФЧК/ЧП");
W("от 2011 г. — четиринайсет години стари — и носи жива грешка за мястото на натиска (виж конфликт");
W("BCHK-ABDOMEN-ERROR). Цитира се като конфликт и — за изваждането от автомобил — като единствен източник,");
W("защото там международен източник няма.");
W();
W("**Защо копието на ДАБДП е `superseded`:** sars.gov.bg сервира снимка на Сиела от 17.01.2023 г., отпреди");
W("ДВ бр. 114/2025. Регистрирано, за да не може да бъде цитирано по невнимание.");
W();
W("**Първичните глави на ERC 2025** (Adult BLS, Resuscitation 2025;215(Suppl 1):110771; First Aid, 110752)");
W("са зад Elsevier с TDM-only лиценз и връщат 403 на машинно изтегляне. Заземяването минава през двете");
W("свободни представяния — собствената книга за неспециалисти на ERC и насоките на RCUK 2025.");
W();
W("---");
W();
W("## 2. Редовете");
W();

const byConcept = {};
for (const r of ROWS) (byConcept[r.concept] = byConcept[r.concept] || []).push(r);
const CONCEPT_TITLES = {
  "c-first-aid-priorities": "c-first-aid-priorities — приоритети на място (9 реда)",
  "c-cpr-basics": "c-cpr-basics — сърдечен масаж (6 реда)",
  "c-bleeding-control": "c-bleeding-control — спиране на кръвотечение (7 реда)",
  "c-victim-handling": "c-victim-handling — боравене с пострадал (7 реда)",
};
const usedConflicts = new Set();

for (const [cid, rows] of Object.entries(byConcept)) {
  W(`### ${CONCEPT_TITLES[cid]}`);
  W();
  for (const r of rows) {
    W(`#### \`${r.id}\``);
    W();
    W(`**Твърдение:** ${r.claim}`);
    W();
    W(`**Право:** ${r.law}`);
    W();
    for (const [key, a, b, frag] of r.q) {
      if (a === null) {
        const { text, line } = cutBg(key, frag);
        const s = srcById[META[key].id];
        W(`- **${META[key].label}** — \`${FILES[key]}:${line}\``);
        W(`  > ${text}`);
        W(`  <br>${s.url} · изтеглен ${SRC.retrievedAt}`);
      } else {
        const text = must(key, a, b, frag);
        const s = srcById[META[key].id];
        W(`- **${META[key].label}** — \`${FILES[key]}:${a}${b !== a ? "-" + b : ""}\``);
        W(`  > ${text}`);
        W(`  <br>${s.url} · изтеглен ${SRC.retrievedAt}`);
      }
    }
    W();
    // A gap that has since been GROUNDED still belongs in the report — the note
    // is the audit trail — but calling it a "празнота" would misread as still
    // open. `gapClosed` flips the label without hiding the entry.
    if (r.gap) { W(`> ${r.gapClosed ? "✅ **ЗАТВОРЕНА ПРАЗНОТА:**" : "**ПРАЗНОТА, ЗАПИСАНА В САМИЯ РЕД:**"} ${r.gap}`); W(); }
    if (r.conflict) { usedConflicts.add(r.conflict); W(`> **КОНФЛИКТ:** виж §3 → \`${r.conflict}\``); W(); }
    // `warn` = a defect found by a LATER clinical re-read that is still OPEN.
    // It is deliberately louder than `gap`: a gap is an honest limit of the
    // sources, a warn is something in OUR text that should change before a
    // signature. Listed again, all together, in §4.0.
    if (r.warn) { W(`> ⚠️ **ОТКРИТО ПРИ ПРЕГЛЕДА, ОЩЕ ОТВОРЕНО:** ${r.warn}`); W(); }
  }
}

W("---");
W();
W("## 3. Конфликтите — записани, не решени мълчаливо");
W();
W("Статут никога не си противоречи. Насоките — да. Затова конфликтите се записват дословно и се показват на");
W("рецензента, вместо някой да избере страна тихомълком.");
W();
usedConflicts.add("LAY-DOWN-vs-035");
for (const key of Object.keys(CONFLICTS)) {
  if (!usedConflicts.has(key)) continue;
  const c = CONFLICTS[key];
  W(`### \`${key}\` — ${c.title}`);
  W();
  for (const line of c.body) W(`- ${line}`);
  W();
  for (const [k, a, b] of c.quotes || []) {
    const text = cut(k, a, b);
    W(`**${META[k].label}** \`${FILES[k]}:${a}${b !== a ? "-" + b : ""}\``);
    W(`> ${text}`);
    W();
  }
  for (const [k, frag] of c.bg || []) {
    const { text, line } = cutBg(k, frag);
    W(`**${META[k].label}** \`${FILES[k]}:${line}\``);
    W(`> ${text}`);
    W();
  }
}

W("---");
W();
W("## 4. Какво още НЕ е заземено");
W();
W("| Тема | Ред(ове) | Състояние |");
W("|---|---|---|");
W("| Учебната програма по чл. 8, ал. 1 | всички | **НЕ Е ПОЛУЧЕНА.** Изготвя се от БЧК, утвърждава се от МЗ, не е публикувана. Търсено в нормативната база на ДАБДП, mh.government.bg, strategy.bg (обществена консултация 11635), redcross.bg. Иска човешко запитване до БЧК или заявление по ЗДОИ до МЗ. Тя е мястото, където живее всяка българска клинична стойност — и единственото, което би решило въпроса за страничното положение. |");
W("| Мотоциклетна каска | q-ptp-020 | `ungrounded-inferred-only`. „helmet“ = 0 срещания в трите издания. Отговорът е ИЗВЕДЕН от правилото за врата и редът го заявява. |");
W("| Нищо през устата | q-ptp-034, q-ptp-061 | Незаземено. Практика на спешната и анестезиологичната медицина. ERC 2025 дори указва подсладена течност през устата при хипогликемия — абсолютно „никога нищо“ се опровергава от същата насока в друг случай. |");
W("| Списъкът „какво да кажеш на 112“ | q-ptp-014 | Няма дословен списък в нито едно издание. Диспечерска практика. |");
W("| Подреждане на двама пострадали | q-ptp-033 | Няма правило за неспециалисти. ПРИЛОЖЕНИЕ на „липсата на реакция е спусъкът“. ERC „BBB triage tool“ е проверен и ОТХВЪРЛЕН като заземяване — контекстът му е педиатричен. |");
W("| „112 е безплатен, без SIM карта“ | q-ptp-058 | ✅ **ЗАТВОРЕНО — беше единственият верен отговор, чиято ИСТИННОСТ никой не беше проверил.** Заземен, но НЕ тук: далекосъобщителен факт, затова стои в `content/sources` — `src-krs-pravila-112`, Правила на КРС, обн. ДВ, бр. 12 от 11.02.2022 г., изм. ДВ, бр. 34 от 16.04.2024 г. (чл. 3, т. 1 „от мобилни устройства без SIM карта“; чл. 2, ал. 1 безплатно; чл. 2, ал. 2 и при забрана за изходящи повиквания). Две неща остават ЗАПИСАНИ В РЕДА, а не изгладени: правилото задължава МРЕЖИТЕ и не е измерване на терен; и до 2022 г. България самата е забранявала тези повиквания (`src-ecc-report-324`, ECC Report 324), тоест това е национален избор, не европейска даденост. |");
W("| Забит предмет · превръзка върху превръзка · цвят на кръвта | q-ptp-019, 039, 040 | Класическа педагогика на първата помощ. Заземено е ДЕЙСТВИЕТО, не класификацията. Всеки ред го казва на ученика. |");
W();
W("---");
W();
W("## 5. Как да проверите сами (без мрежа)");
W();
W("Изтеглените оригинали стоят на диска, така че всяка проверка е офлайн:");
W();
W("```");
W("content/medical/tools/erc2025_layperson.txt   ERC 2025 Guidelines for Everyone");
W("content/medical/tools/rcuk_bls.txt            RCUK 2025 Adult Basic Life Support");
W("content/medical/tools/rcuk_fa.txt             RCUK 2025 First Aid");
W("content/medical/tools/bchk_bls.txt            БЧК — основна мед. помощ и АВД");
W("content/medical/tools/bchk_page5.txt          БЧК — основните стъпки");
W("```");
W();
W("Проверка на цитат по локатор — например дълбочината на натиска:");
W();
W("```bash");
W("sed -n '446p' content/medical/tools/erc2025_layperson.txt   # ERC: 5 to 6 cm");
W("sed -n '119p' content/medical/tools/rcuk_bls.txt            # RCUK: at least 5 cm, not more than 6 cm");
W("```");
W();
W("Пълна повторна проверка на регистъра (тегли наново и хешира):");
W();
W("```bash");
W("cd content/medical/tools && bash fetch.sh && node build-sources.mjs .. \\");
W("  && node build-claims.mjs .. && node verify-claims.mjs ..");
W("```");
W();
W("> **Бележка за хешовете.** Три източника (lex.bg, resus.org.uk/first-aid, firstaid.redcross.bg) НЕ хешират");
W("> стабилно на ниво сурови байтове — сървърът вгражда токен за всяка заявка. Затова всеки източник носи");
W("> и `rawSha256`, и `textSha256` над един детерминистичен извличач. **Проверката ползва текстовия хеш.**");
W();
W("---");
W();
W("## 6. Статус");
W();
W("Нито един от 29-те реда не е `approved` и **никой агент не може да го направи.** `content/SCHEMA.md`:");
W("генератор никога не пише `approved` — тази дума значи, че човек е прочел реда, и е вярна само когато");
W("`content/review/approvals.json` носи подписа му. Таванът за автоматика е `machine-checked`.");
W();
W("Затова двата теста, които тази вълна трябваше да отпуши, остават червени по една и съща причина —");
W("проверено отново на 2026-08-04 след клиничния преглед:");
W();
W("- `src/modules/exam/__tests__/content-bank.test.ts` → `REVIEW_DEBT: ptp-i-parva-pomosht: only 31/64 (48%) approved`. Прагът е `MIN_APPROVED_SHARE = 0.5`.");
W("- `src/modules/lesson/__tests__/compose.test.ts` → `l-accidents-first-aid` няма нито един quiz beat, защото quiz-ът тегли САМО `approved` въпроси (`modules/lesson/quiz.ts:42`), а четирите концепции са **0 от 29**.");
W();
W("И двата се отпушват само с подпис на човек на `/review`. Прагът не се пипа — това е изрично записано в");
W("самия тест: „The remedy for a red run here is a review pass on the named topic — never a threshold edit.“");
W();
W("**Гейтът, както е измерен днес** (`cd platform`):");
W();
W("| Команда | Резултат |");
W("|---|---|");
W("| `npm run validate:content` | ✅ OK — 1089 въпроса: 0 draft / 0 machine-checked / 290 needs-review / 799 approved; подписани 0; таван 837; 0 просрочени подписа |");
W("| `npm run test:tools` | ✅ 157 теста, 0 паднали |");
W("| `npx tsc --noEmit` | ❌ 1 грешка, чужда лента (`modules/sim/runtime/__tests__/…`) |");
W("| `npx vitest run --maxWorkers=4` | ❌ 10 паднали от 10 886 (718 файла, 7 паднали) |");
W();
W("От десетте паднали теста: **2 са ЗАЩИТЕНИ** (горните два, чакат подпис) · **3 са регресия по");
W("`api/review/route.test.ts`** (виж §7.3, находка 6) · **1 е `tsconfigHygiene`** (в `tsconfig.json` са");
W("влезли `.next-harness/**` пътища — чужда лента) · **4 са симулаторни** и принадлежат на лента, която");
W("пишеше по време на този пробег (`contracts.ts`, `advisor.ts`, `worldRuntime.ts`, `traces/*` се промениха");
W("между два последователни `tsc` пробега). Симулаторните числа са моментна снимка на движеща се работна");
W("директория и не бива да се четат като стабилни.");
W();
W("**Капанът по доклад 91 §4.17 НЕ е задействан.** Одобрените в темата са 31/64 преди и след вълната.");
W("Одобряването само на четирите правни реда (q-ptp-009, 044, 050, 052) би вдигнало темата на 35/64 (55 %),");
W("би минало прага и би направило `content-bank.test.ts` зелен, докато всички 29 медицински реда остават");
W("скрити от изпита. Нито един статус не е повишен до `approved`.");
W();
W("---");
W();
W("## 7. Какво блокира подписването — прочети това ПРЕДИ да отвориш /review");
W();
W("### 7.0 ✅ ЗАТВОРЕНО — и 29 от 29 реда вече се появяват в конзолата");
W();
W("**Беше:** дванайсет реда бяха повишени от `needs-review` на `machine-checked` — честно повишение, бяха");
W("минали всяка автоматична проверка. Но `listFlaggedQuestions` имаше само две кошници и `machine-checked`");
W("не попадаше в НИТО ЕДНА. Нищо не хвърляше грешка, никакво число не ставаше отрицателно — екранът просто");
W("показваше 17 от 29 реда и изглеждаше напълно здрав, докато доклад 91 §4.17 казваше на основателя писмено");
W("да отвори `/review` и да одобри всичките 29. От двете най-опасни концепции, `c-bleeding-control` и");
W("`c-victim-handling`, на екрана оставаше точно по един ред от седем.");
W();
W("**Сега** — преброено независимо срещу `content/questions/*.json` + `content/review/approvals.json`");
W("(0 подписа), с маршрутизацията на `dispositionOf` възпроизведена ред по ред:");
W();
W("| | брой |");
W("|---|---|");
W("| първа помощ, общо | **29** |");
W("| в кошницата „За поправка“ (`needs-review`) | **29** |");
W("| недостижими от която и да е кошница | **0** |");
W();
W("По концепции: `c-first-aid-priorities` 9/9 · `c-cpr-basics` 6/6 · `c-bleeding-control` **7/7** ·");
W("`c-victim-handling` **7/7**. Цялата банка: 1089 реда = 290 `needs-review` + 799 неподписани `approved`,");
W("0 `machine-checked`, 0 `draft`, сумата на кошниците = 1089 = общия брой.");
W();
W("**Поправката не е „добави machine-checked в предиката“, и това е важното.** Правилото в");
W("`platform/src/modules/content-admin/queues.ts` е ТОТАЛНО по конструкция: всеки ред попада в точно една");
W("кошница или е подписан от човек. Проверено чрез МУТАЦИЯ, не по описание — с изтрит `case \"machine-checked\"`:");
W();
W("```");
W("vitest queues.test.ts   → 4 от 12 теста ЧЕРВЕНИ, водещият казва точно това:");
W("  „these statuses reach no queue and would vanish from /review: machine-checked\"");
W("tsc --noEmit            → queues.ts(116,80) TS2366: Function lacks ending return statement");
W("```");
W();
W("След възстановяване (проверено по sha256, байт в байт): 12/12 зелени. Тестът чете списъка със статуси");
W("от `ContentStatusSchema.options`, а `schemas.ts:331` доказва с `Assert<Equals<…>>`, че zod-енумът е същият");
W("съюз, по който `dispositionOf` прави switch — тоест изброяването не може да се разсинхронизира с кода.");
W();
W("> ⚠️ **ЕДНО ОГРАНИЧЕНИЕ, което никой не беше премерил.** Банката днес съдържа **0** реда с");
W("> `machine-checked`. Затова преброяването върху истинската банка в `queue.test.ts` — онова, чийто");
W("> коментар се самонарича „THE ALARM“ — НЕ МОЖЕ да хване тази регресия днес; то захапва едва когато");
W("> такъв ред съществува. Носещата защита е чистият модулен тест `queues.test.ts`. Никой да не го");
W("> „опростява“ с довода, че `queue.test.ts` го покрива.");
W();
W("### 7.1 ⛔ КЛАСНАТА СТАЯ ГОВОРИ ОБЪРНАТОТО УКАЗАНИЕ ДНЕС — и това не е в урочния файл");
W();
W("`content/lessons/l-accidents-first-aid.json` беше помирен: всичките седем обръщания са затворени в него.");
W("**Но този файл още не се зарежда от никакъв код.** Гнездото за авторски разказ");
W("(`platform/src/modules/lesson/narration.ts`) няма регистриран доставчик, тоест урокът, който ученикът");
W("чува днес, се СГЛОБЯВА от `content/concepts.json` — а concepts.json не е пипан от нито една вълна.");
W();
W("Веригата, ред по ред:");
W();
W("```");
W("compose.ts        → всяка концепция получава beat със say: [{ src: \"concept\", conceptId }]");
W("resolve.ts:72-76  → case \"concept\": return concept.summaryBg   ← БЕЗ проверка за approved");
W("narration.ts:87   → авторският текст СЕ ПРОВЕРЯВА (status !== \"approved\" → null)");
W("```");
W();
W("Тоест авторският текст минава през гейт, а сглобеният — не. Измерено чрез изпълнение на истинския");
W("резолвер върху истинското съдържание (`allLessons()` + `resolveBeat()`), ето какво изрича класната стая:");
W();
W("| Beat | Изречено ДНЕС (от `concepts.json`) | Банката вече градира |");
W("|---|---|---|");
W("| `b4-explain` | „Дишащ, но в безсъзнание човек **се поставя в стабилно странично положение**“ | `q-ptp-022` / `q-ptp-037`: НЕ го обръщаш след удар |");
W("| `b1-explain` | „обезопаси, **огледай пострадалите, звънни на 112**“ + „леко разтърсване на раменете“ | `q-ptp-013`: 112 е ПРЕДИ оценката на дишането |");
W("| `b2-explain` | „**Ако пострадалият не диша**, започваш сърдечен масаж“ · „Не спирай до идването на помощ“ | прагът е „не диша НОРМАЛНО“; `q-ptp-017` брои и изтощението на спасителя |");
W("| `b3-explain` | директен натиск, забит предмет — без обръщане | — |");
W();
W("**И четирите концепции носят и декоративния `ЗДвП чл. 123`** под чисто клинични обобщения — същият");
W("дефект, който тази програма съществува да изтрие, един файл встрани.");
W();
W("**Броят въпроси, които сглобеният урок задава днес: 0.** `isLessonEligible` (`modules/lesson/quiz.ts:42`)");
W("тегли само `approved`, а четирите концепции са 0 от 29. Значи ученикът чува обърнатото указание и не");
W("получава нито един въпрос, който да го поправи. Това е и причината `compose.test.ts` да е червен.");
W();
W("**Това е реалната опасност в целия пакет, и предпоставката „противоречието е латентно“ не важи.**");
W("Латентно е за урочния файл. За `concepts.json` е живо: обърнатото указание се изрича на ученик днес и");
W("ще продължи да се изрича като резервен вариант, докато урокът стои неподписан.");
W();
W("**Поправката е в друг файл и в друга лента:** `content/concepts.json` → `c-victim-handling.summaryBg`,");
W("`c-first-aid-priorities.summaryBg`, `c-cpr-basics.summaryBg`, плюс махане на `ЗДвП чл. 123` от четирите.");
W("Алтернативата — гейт на `resolveSay` case „concept“ — е по-голяма промяна и оставя урока без глас.");
W();
W("### 7.2 96 % от цитатите ще изглеждат непроверени в конзолата — макар всички да са верни");
W();
W("Нито един от 29-те реда не носи `sourceRefs`. Схемата, регистърът (`content/medical/`) и панелът за");
W("източници в `/review` бяха построени точно за тези редове — но редовете не приеха полето. Затова");
W("`checkQuotedClaims` няма към какво да сравни цитатите от ERC/RCUK:");
W();
W("- цитирани откъси в 29-те реда: **114**");
W("- разрешими от конзолата днес: **4** — краткото „ако това не представлява опасност“ от ЗДвП (2), плюс");
W("  двете дословни извадки, които вълната „кавичките не са заслужени“ добави: чл. 124, т. 1 в `q-ptp-013`");
W("  и чл. 123, ал. 1, т. 2, б. „в“ в `q-ptp-017`");
W("- ще се покажат като НЕПРОВЕРЕНИ: **110 (96 %)** — всичките английски, от ERC/RCUK");
W();
W("**НО — и това е новото — нито един от тях не е непроверим.** Клиничният преглед прекара всичките 114");
W("откъса през същия `quotedSpans` + `normaliseForMatch`, който конзолата ползва, но срещу изтеглените");
W("текстове на диска, и с допълнително изчистване на артефактите на извличача (BEL знаци и разделящи");
W("интервали в главните букви — „n \\x07B\\x07 efore anything else“ — плюс пренесени редове):");
W();
W("| | брой |");
W("|---|---|");
W("| **латински (английски) откъси, ненамерени дословно** | **0 от 61** |");
W("| кирилски откъси, намерени дословно (ЗДвП, БЧК, Наредба № 24, КРС) | 11 от 53 |");
W("| кирилски откъси, ненамерени | 42 — всичките са или собствен глас на реда („чакай да спре само“, „в безсъзнание е, значи го местя“), или БЪЛГАРСКИ ПРЕВОД на английско изречение вътре в кавички |");
W();
W("Тоест целият английски корпус е верен; конзолата просто няма с какво да го сравни. Поправката е");
W("механична — `content/medical/claims.json` вече свързва всяко твърдение с id-тата на въпросите, така че");
W("се добавя `sourceRefs: [{ sourceId, ref, claimId }]` на всеки от 29-те (`q-ptp-058` вече го има).");
W();
W("Остава ОТДЕЛЕН дефект, от същия клас като хибридния цитат от чл. 124: в девет реда — `q-ptp-018`,");
W("`019`, `020`, `021`, `040`, `041`, `042`, `063`, `064` — изречения на ERC/RCUK стоят в БЪЛГАРСКИ ПРЕВОД");
W("ВЪТРЕ в кавичките, с приписване на източника. Проверено едно по едно: всички преводи са верни");
W("(`Minimise movement of the neck.` = „сведи движението на врата до минимум“;");
W("`Never force an uncooperative person into any position, as this may exacerbate an injury.` =");
W("„Никога не насилвай несътрудничещ човек в каквото и да е положение, защото това може да влоши");
W("травмата.“). Но кавичките твърдят дословност, която е невъзможна за проверка, защото източникът не е");
W("на български. Същата поправка като в `q-ptp-022`: оригиналът вътре, преводът извън.");
W();
W("Две дребни несъответствия, проверени и обявени за безобидни, за да не ги гони пак някой:");
W("`q-ptp-036` цитира БЧК „най-малко 5 см (макс. 6 см)“, а извлеченият текст носи латинско `c` в „6 cм“");
W("(`bchk_bls.txt:89`); `q-ptp-021`/`q-ptp-063` цитират „пряка, неконтролируема опасност“, а");
W("`bchk_page5.txt:38` има запетая след „неконтролируема“. И двете разлики са в ИЗТОЧНИКА.");
W();
W("### 7.3 Дребните, но истински дефекти, открити при този преглед");
W();
W("- ✅ **ЗАТВОРЕНО — `q-ptp-013` цитираше ЗДвП чл. 124 НЕДОСЛОВНО.** Редът пишеше „да вземеш … да окажеш");
W("  … за него“; законът казва „да вземе … да окаже … за него“ (трето лице). Глаголите бяха пренаписани");
W("  във второ лице вътре в кавичките, а „за него“ остана в третото — изречение, което не съществува в");
W("  никой текст, написано ВЪТРЕ във вълната, която точно този клас дефект закрива. Сега в кавичките стои");
W("  дословният текст на т. 1, а второто лице е ИЗВЪН тях, заедно с едно изречение, което казва на ученика");
W("  защо цитатът звучи като за трети човек. `checkQuotedClaims` вече го разрешава срещу чл. 124.");
W("  **Проверено повторно, знак по знак, срещу `content/law/acts/zdvp.json`** — съвпада; и обратно, чл. 123,");
W("  ал. 1, т. 2, б. „в“ казва „мерки за БЕЗОПАСНОСТТА“, а чл. 124, т. 1 — „мерки за ОСИГУРЯВАНЕ");
W("  безопасността“, тоест всеки ред трябва да цитира своя член, и го прави.");
W("  Пази го тест: `platform/src/modules/content-admin/evidence.test.ts` → „first-aid rows quote Bulgarian");
W("  statute verbatim“ (всеки кирилски откъс в кавички трябва да се намери дословно в цитиран от реда");
W("  член; плюс изричната забрана за „да вземеш мерки“ / „да окажеш помощ“ в целия файл).");
W("- ✅ **ЗАТВОРЕНО — `q-ptp-017` цитираше „Everyone can learn how to perform CPR“**; източникът");
W("  (`rcuk_bls.txt:111`) пише „Everyone can learn how to perform cardiopulmonary resuscitation (CPR).“");
W("  Сега стои дословно. По-важното: този цитат носеше САМ твърдението „не ти трябва разрешение или");
W("  диплома“, което е ДРУГО твърдение — „всеки може да се научи“ не е „всеки има право“. Редът вече");
W("  разделя двете: медицинската половина се заземява на `rcuk_bls.txt:111`, `erc2025_layperson.txt:411`");
W("  („These initial life-saving actions can be performed by anyone…“) и `rcuk_bls.txt:128`; юридическата");
W("  половина се отговаря от българското право, защото ERC изрично препраща натам („…local ‘Good");
W("  Samaritan’ and ‘Duty to Respond’ laws, which vary between locations“, `erc2025_layperson.txt:745`).");
W("  Редът вече цитира ЗДвП чл. 123, ал. 1, т. 2, б. „в“ и чл. 124, т. 1 — задължение, не разрешение.");
W("- ✅ **ЗАТВОРЕНО — `q-ptp-056` и `q-ptp-022` вече казват какво ги различава.** И двата реда носят един");
W("  и същ разграничител, изписан с главни букви: ЗНАЕШ ЛИ ВЕЧЕ, ЧЕ ЧОВЕКЪТ ДИША НОРМАЛНО. 056 (не знаеш)");
W("  обяснява, че дишане през запушен път не се преценява, затова първо отваряш — и добавя какво се");
W("  прави в обратния случай. 022 (знаеш) обяснява, че пътят вече работи, затова приоритетът се обръща");
W("  към врата — и цитира общата хватка на ERC за случая, в който още не знаеш. Всеки ред препраща към");
W("  другия. Действието не е сменяно; сменена е само липсата на „защо“ (THEO-4). **Остава отворено в");
W("  урока:** разграничителят го няма в `l-accidents-first-aid.json`.");
W("- ✅ **ЗАТВОРЕНО — `q-ptp-061` вече не приписва „полагаш го“ на насока.** Редът разделя трите действия:");
W("  „Make the person comfortable.“ и наблюдението са дословни от ERC; топлината — дословна; а „лежи,");
W("  вместо да ходи“ е обявено изрично като практически прочит на „удобно“ плюс");
W("  „Do not move the person unless they are in an unsafe situation.“, а НЕ като отделно изречение от");
W("  насоките. Добавен е и абзац, който казва, че това НЕ е старата поза по гръб с вдигнати крака —");
W("  точно твърдението, което `q-ptp-035` отрича. `q-ptp-035` е допълнен от своята страна със същото");
W("  разграничение (и с поправка: „по гръб“ се среща в изданията 2025 г. на две места — при масаж и при");
W("  обръщане на човек, който лежи по лице, за да му се отвори дихателният път — и двете заради дишането,");
W("  не заради шока).");
W("- ✅ **ЗАТВОРЕНО — `med-extrication-technique`** вече е `ungrounded-teaching-material-only` с четири");
W("  дословни цитата от БЧК, а `build-claims.mjs:397` отказва да излъчи `ungrounded-no-reachable-source`");
W("  на claim, който носи цитати — статусът стана опровержим и не може да загние пак.");
W();
W("**ОТВОРЕНИТЕ находки на клиничния преглед — по спешност:**");
W();
W("1. ⛔ **`content/concepts.json` изрича обърнатото указание на ученик ДНЕС.** Виж §7.1. Това е");
W("   единственото, което стига до истински 17-годишен преди подпис.");
W("2. ⚠️ **`q-ptp-017`, опция (b): градирано ВЯРНО „щом установиш, че пострадалият НЕ ДИША“**, докато");
W("   собственото обяснение на реда казва, че прагът е „не диша НОРМАЛНО“. Агоналното хъркане Е дишане за");
W("   неопитно око; това е точно моментът, в който хората задържат масажа. Текстът на опцията трябва да");
W("   се поправи преди подпис. (Същата неточност, но само в СТЪБЛОТО, е в `q-ptp-016` и `q-ptp-060` —");
W("   по-малко носеща, защото не е градирано твърдение.)");
W("3. ⚠️ **`q-ptp-015`, опция (d): „внимателно РАЗТЪРСВАШ раменете му“** — „shake“ = 0 срещания и в ERC");
W("   2025, и в RCUK BLS 2025; единственият източник е БЧК (`not-a-grounding-source`), докато RCUK казва");
W("   за ПТП „Minimise movement of the neck.“. Редът признава думата „рамо“, но не и глагола.");
W("4. ⚠️ **`q-ptp-022`: изключението „тогава ГО ОБРЪЩАШ“ стъпва на `rcuk_fa.txt:232`,** който покрива само");
W("   човек, лежащ ПО ЛИЦЕ, и го обръща ПО ГРЪБ. Действието е клинично правилно, цитатът покрива една");
W("   трета от изброените случаи. Същото изречение стои и в урока.");
W("5. **`med-recovery-position` е застоял И ФАКТИЧЕСКИ НЕВЕРЕН.** Статусът е `contested-content-affected`,");
W("   а бележката към конфликта твърди „q-ptp-022 и q-ptp-037 инструктират точно това“ — вече не е вярно,");
W("   и двата ключа са обърнати по ERC/RCUK 2025. Регистърът не бива да се редактира, за да съвпадне със");
W("   съдържание, чието клинично решение не е ратифицирано: **това е решение на основателя**, не");
W("   редакционна поправка. (Днес не се вижда в конзолата, защото 28 от 29-те реда нямат `sourceRefs` —");
W("   в мига, в който ги получат, застоялата бележка ще застане пред рецензента.)");
W("6. **`src/app/api/review/route.test.ts` е ЧЕРВЕН и това не е дългът по преглед.** `route.ts` вече вика");
W("   `parseQueue`, но тестът подменя (`vi.mock`) `@/modules/content-admin` изцяло с три функции и `parseQueue` не е");
W("   сред тях → `GET /api/review` хвърля вместо да върне отговор (3 теста). В продукцията няма проблем —");
W("   `parseQueue` наистина се експортира (`index.ts:53`). Регресия от вълната за кошниците, невидима за");
W("   нейния собствен гейт, защото той пускаше само `src/modules/content-admin`.");
W();

// ---------------------------------------------------------------------------
// THE WRITE — and why it is not `writeFileSync(dest, out)` any more
// ---------------------------------------------------------------------------
//
// This generator emits §0 through §7.3. Doc 92 is 2,071 lines and §8, §9 and
// §10 — the entire six-door history, ~955 lines of it, hand-written, and the
// only record of how each of those doors was found and closed — sit BELOW that.
// `writeFileSync(dest, out)` deleted all of it, silently, in the time it takes
// to run `node tools/theory/gen_first_aid_sources.mjs`. The document itself
// carried the warning („Преди да го пуснеш: запази опашката от §8 нататък"),
// which is a note asking a human to be careful about a thing a machine can just
// do — and notes like that are load-bearing exactly once.
//
// So the tool now SPLICES: it replaces the generated head and keeps the
// hand-written tail byte for byte. And when it cannot find the seam it REFUSES
// rather than guessing, because the failure mode of guessing here is the
// deletion this exists to prevent.
//
// The seam is a sentinel this file emits. Runs before the sentinel existed have
// no such line, so there is a fallback: the first heading numbered above the
// last section this generator produces.

const GENERATED_THROUGH_SECTION = 7;
const SENTINEL =
  "<!-- END GENERATED — everything below this line is hand-written and is preserved " +
  "byte for byte by tools/theory/gen_first_aid_sources.mjs. Do not remove this marker. -->";

/**
 * Split an existing doc at the seam: `{ head, tail }`.
 * Throws when the file exists and the seam cannot be located.
 */
function splitAtSeam(existing) {
  const lines = existing.split("\n");

  // Leading blank lines are stripped from the tail and one is re-added on
  // write. Without that the file grows by exactly one line per run — measured,
  // by running it twice.
  const cut = (headEnd, tailStart) => ({
    head: lines.slice(0, headEnd).join("\n"),
    tail: lines.slice(tailStart).join("\n").replace(/^\n+/, ""),
  });

  const atSentinel = lines.findIndex((l) => l.trim() === SENTINEL);
  if (atSentinel !== -1) return cut(atSentinel, atSentinel + 1);

  // Pre-sentinel document: the first `## N.` heading past the generated range.
  const atHeading = lines.findIndex((l) => {
    const m = /^##\s+(\d+)\./.exec(l);
    return m !== null && Number(m[1]) > GENERATED_THROUGH_SECTION;
  });
  if (atHeading !== -1) return cut(atHeading, atHeading);

  // Neither. Either somebody renumbered the sections, or the tail is genuinely
  // gone. Both are reasons to stop and let a person look.
  throw new Error(
    `refusing to write ${path.relative(ROOT, DEST)}: it exists (${lines.length} lines) but ` +
      `neither the END GENERATED sentinel nor a hand-written section above ` +
      `§${GENERATED_THROUGH_SECTION} was found. Overwriting would delete whatever is ` +
      `there. Check the file, then either restore the sentinel line or move the ` +
      `hand-written part under a heading numbered above ${GENERATED_THROUGH_SECTION}.`,
  );
}

const DEST = path.join(ROOT, "docs/education/92_FIRST_AID_SOURCES.md");
fs.mkdirSync(path.dirname(DEST), { recursive: true });

const force = process.argv.includes("--force");
const existed = fs.existsSync(DEST);
const { head: existingHead, tail } = existed
  ? splitAtSeam(fs.readFileSync(DEST, "utf8"))
  : { head: null, tail: "" };

/**
 * AND THE HEAD IS HAND-EDITED TOO. Splicing the tail was written first and then
 * TESTED, which is how this came out: regenerating §0–§7.3 over the committed
 * file silently reverted three deliberate edits inside the generated range — a
 * navigation blockquote pointing readers at §10, the „ЗАТВОРЕНО, ПРОВЕРЕНО ЧРЕЗ
 * ИЗПЪЛНЕНИЕ" status banner on §7.1, and a repaired soft-hyphen in an ERC
 * quote. A generator that quietly reverts a status from „closed" to „open" is
 * the same defect as one that deletes §8, only smaller and harder to notice.
 *
 * So: if the head on disk is not the head this tool produces, it REFUSES and
 * says how far apart they are. `--force` regenerates (and still keeps the
 * tail). The default is the safe one, because the person who types this command
 * six months from now will not know any of the above.
 */
if (existingHead !== null && existingHead.trimEnd() !== out.trimEnd() && !force) {
  const a = existingHead.split("\n");
  const b = out.split("\n");
  const firstDiff = a.findIndex((l, i) => l !== b[i]);
  const sample = [];
  for (let i = firstDiff; i < Math.min(firstDiff + 3, Math.max(a.length, b.length)); i += 1) {
    if (a[i] !== b[i]) {
      sample.push(`      on disk:   ${JSON.stringify((a[i] ?? "").slice(0, 100))}`);
      sample.push(`      generated: ${JSON.stringify((b[i] ?? "").slice(0, 100))}`);
    }
  }
  console.error(
    `REFUSING to write ${path.relative(ROOT, DEST)}.\n\n` +
      `  The generated part (§0–§${GENERATED_THROUGH_SECTION}) has been hand-edited since it was\n` +
      `  last generated: ${a.length} lines on disk vs ${b.length} generated, first difference at\n` +
      `  line ${firstDiff + 1}.\n` +
      `${sample.join("\n")}\n\n` +
      `  Regenerating would revert those edits. The hand-written tail (§8 onward,\n` +
      `  ${tail === "" ? 0 : tail.split("\n").length} lines) is preserved either way.\n\n` +
      `  Read the differences, fold anything worth keeping back into this generator,\n` +
      `  then re-run with --force.`,
  );
  process.exit(1);
}

const final = `${out}${SENTINEL}\n${tail === "" ? "" : `\n${tail}`}`;
fs.writeFileSync(DEST, final, "utf8");
const keptLines = tail === "" ? 0 : tail.split("\n").length;
console.log(
  `WROTE ${DEST}  (${final.length} chars, ${final.split("\n").length} lines; ` +
    `${out.split("\n").length} generated, ${keptLines} hand-written lines preserved)`,
);
