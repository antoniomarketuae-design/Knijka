/**
 * Emit content/sources/{sources.json,claims.json} from the fetched originals.
 *
 * THE DISCIPLINE, copied from content/medical/tools/build-claims.mjs because it
 * is the thing that works: **no quote in claims.json is typed by hand.** Each
 * claim declares a short LOCATOR; this script finds the locator in the
 * extracted text and cuts the enclosing sentence out of it. If a locator stops
 * matching — the publisher reworded, the PDF changed, someone mistyped — the
 * build THROWS instead of emitting a quote nobody can check.
 *
 * Second gate, same as the medical register: a claim that carries a `figureBg`
 * must have an authoritative quote whose text actually states that figure's
 * digits. A "30 days" claim quoted with a sentence that never says 30 is the
 * „ЗДвП чл. 123" failure mode wearing different clothes, and this catches it by
 * machine.
 *
 *   cd content/sources/tools && bash fetch.sh && node build.mjs .. && node verify.mjs ..
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(toolsDir, process.argv[2] ?? "..");

// ---------------------------------------------------------------------------
// The register. `file` is the fetched original (see fetch.sh); everything else
// is provenance a reader can re-check without trusting this script.
// ---------------------------------------------------------------------------
export const SOURCES = [
  {
    id: "src-nsi-ptp-2023",
    file: "nsi_ptp2023.pdf",
    url: "https://www.nsi.bg/sites/default/files/files/publications/PTP_2023.pdf",
    kind: "bg-statistics",
    authority: "official-methodology",
    titleBg:
      "Пътнотранспортни произшествия в Република България 2023 — Методологични бележки",
    publisherBg: "Национален статистически институт (НСИ)",
    editionBg: "издание 2024 г., данни за 2023 г.",
    format: "pdf",
    coversBg:
      "Определенията, по които се брои ПТП, загинал и ранен в официалната българска статистика за пътната безопасност. НЕ е нормативен акт — методология е.",
    noteBg:
      "НСИ сам посочва откъде идват определенията: „Закона за движението по пътищата и Инструкцията на Министерството на вътрешните работи за регистриране, отчитане и анализ на пътнотранспортните произшествия“. ЗДвП дефинира ПТП (§ 6, т. 30 ДР) и НЕ дефинира „загинал“; инструкцията на МВР не е публикувана. Затова 30-дневният праг се цитира от методологията, не от закон — точно както клиничните стойности се цитират от ERC, а не от Наредба № 24.",
  },
  {
    id: "src-nsi-ptp-2023-press",
    file: "nsi_ptp2023_press.pdf",
    url: "https://www.nsi.bg/tsb/wp-content/uploads/2024/10/Traffic-accidents-2023-brgs.pdf",
    kind: "bg-statistics",
    authority: "official-methodology",
    titleBg:
      "Пътнотранспортни произшествия, загинали и ранени в област Бургас през 2023 година (прессъобщение)",
    publisherBg: "Национален статистически институт (НСИ), ТСБ",
    editionBg: "публикувано 2024 г.",
    format: "pdf",
    coversBg:
      "Второ, независимо издание на същите методологични определения — служи за потвърждение, не като самостоятелно основание.",
    noteBg: null,
  },
  {
    id: "src-krs-pravila-112",
    file: "krs_pravila112.pdf",
    url: "https://crc.bg/files/2024%20%D0%B4%D0%B8%D1%80%D0%B5%D0%BA%D1%86%D0%B8%D1%8F%20%D0%9F%D1%80%D0%B0%D0%B2%D0%BD%D0%B0/Pravila%20za%20112%20-%20final%20(2024).pdf",
    kind: "bg-normative",
    authority: "binding-bg",
    titleBg:
      "Правила за определяне на условията и реда за предоставяне на информация за местоположението на потребителите и данни за крайния ползвател от предприятията, предоставящи междуличностни съобщителни услуги с номера при спешни повиквания",
    publisherBg: "Комисия за регулиране на съобщенията (КРС)",
    editionBg:
      "Обн. ДВ, бр. 12 от 11.02.2022 г., изм. ДВ, бр. 34 от 16.04.2024 г. Приети с Решение № 41 от 26.01.2022 г. на КРС на основание чл. 255, ал. 4 от Закона за електронните съобщения; отменят правилата от ДВ, бр. 97 от 2008 г.",
    format: "pdf",
    coversBg:
      "Какво е ЗАДЪЛЖЕНО да работи при повикване към 112 в България: безплатен достъп (чл. 2, ал. 1), достъп и за ползватели със забрана за изходящи повиквания (чл. 2, ал. 2), техническа възможност от устройство без SIM карта, без PIN и от заключено устройство (чл. 3), и какво се предава вместо номер при повикване без SIM карта (чл. 7, ал. 2 — IMEI).",
    noteBg:
      "Далекосъобщителен, не медицински акт — точно затова е тук, а не в content/medical. Взет е КОНСОЛИДИРАНИЯТ текст от списъка „Подзаконови актове по ЗЕС“ на самата КРС; версията, която се сервира от crc.bg/files/Pravna/Pravila za 112.pdf, е още преди изменението от ДВ, бр. 34 от 2024 г. Чл. 3, т. 1 е проверен и в двете редакции — изменението от 2024 г. не го докосва.",
  },
  {
    id: "src-ecc-report-324",
    file: "ecc_report_324.pdf",
    url: "https://docdb.cept.org/download/3552",
    kind: "eu-regulatory-study",
    authority: "comparative-survey",
    titleBg: null,
    titleEn:
      "ECC Report 324 — Study of issues related to calls to emergency services from devices that are SIM-less or in Limited Service State (LSS) for another reason",
    publisherBg: "CEPT / Electronic Communications Committee (ECC)",
    editionBg: "одобрен на 24 ноември 2021 г.; стъпва на въпросник на ECC от септември 2019 г. и на данни на COCOM от 2020 г.",
    format: "pdf",
    coversBg:
      "Кои европейски държави РАЗРЕШАВАТ и кои ЗАБРАНЯВАТ спешни повиквания от устройство без SIM карта, и по каква причина. Служи за едно-единствено нещо: да покаже, че това е национален избор, а не европейска даденост.",
    noteBg:
      "ДАТИРАН Е. Списъците му са от 2019–2020 г. и по тях България е сред ЗАБРАНЯВАЩИТЕ; българските правила от 2022 г. обръщат това. Затова докладът се цитира за ПРИНЦИПА (различава се по държави и се забранява заради фалшиви повиквания), а не като актуален списък. За България има по-нов и по-висок източник — src-krs-pravila-112.",
  },
];

// ---------------------------------------------------------------------------
// Claims. `locator` is a SHORT verbatim needle; the quote is cut around it.
// ---------------------------------------------------------------------------
export const CLAIMS = [
  {
    id: "stat-road-death-30-days",
    topicBg: "Кой се брои за загинал при ПТП в официалната статистика",
    conceptIds: ["c-accident-definition"],
    questionIds: ["q-ptp-044"],
    figureBg: "30 дни",
    authoritative: { sourceId: "src-nsi-ptp-2023", locator: "Загинал при ПТП е всеки човек" },
    corroborating: [
      { sourceId: "src-nsi-ptp-2023-press", locator: "Загинал при ПТП е всеки човек" },
    ],
    conflicts: [
      "ФОРМУЛИРОВКАТА НА НСИ Е НЕТОЧНА, СМИСЪЛЪТ — НЕ. Изречението гласи „починал в резултат на нанесените травми 30 дни след произшествието“, без „до“. Буквално прочетено, то би броило само смърт на 30-ия ден, което е безсмислено; праговият прочит („до 30 дни“) е стандартният и е този, който отговорът на q-ptp-044 използва. Записано тук, за да не изглежда по-късно, че сме перифразирали източника по невнимание.",
      "ИЗТОЧНИКЪТ НА ОПРЕДЕЛЕНИЕТО НЕ Е ПУБЛИЧЕН. НСИ сочи „Инструкцията на МВР за регистриране, отчитане и анализ на ПТП“; тя не е обнародвана и не е достъпна. Методологията на НСИ е най-високото ДОСТИЖИМО ниво за този праг.",
    ],
    statusBg: "grounded-agreed",
    noteBg:
      "ЗДвП § 6, т. 30 ДР дефинира самото ПТП и е цитиран като lawRef на реда. 30-дневният праг НЕ е в ЗДвП — проверено срещу целия консолидиран текст (content/law/acts/zdvp.json) и срещу Наредба № Iз-41 от 2009 г., която също не съдържа такова определение.",
  },
  {
    id: "reg-112-free-and-simless-bg",
    topicBg: "Какво е задължено да работи при обаждане на 112 в България — безплатно, без кредит, без SIM карта",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-058"],
    figureBg: null,
    authoritative: { sourceId: "src-krs-pravila-112", locator: "1. от мобилни устройства без SIM карта" },
    corroborating: [
      { sourceId: "src-krs-pravila-112", locator: "безплатен достъп към единен европейски номер 112" },
      { sourceId: "src-krs-pravila-112", locator: "Задължението по ал. 1 следва да се изпълнява" },
      { sourceId: "src-krs-pravila-112", locator: "За случаите по чл. 3, т. 1 при наличие на техническа възможност" },
    ],
    conflicts: [
      "ТОВА НЕ Е БИЛО ВИНАГИ ВЯРНО, И ТОВА Е КАПАНЪТ. ECC Report 324 (одобрен 24.11.2021 г.) изброява България сред държавите, които ЗАБРАНЯВАТ спешни повиквания от устройство без SIM карта — заради големия брой фалшиви обаждания. Правилата на КРС от ДВ, бр. 12 от 11.02.2022 г. обръщат това. Който търси втори източник и попадне на доклада, ще реши, че грешим; затова разминаването е записано тук с датите си, а не изгладено.",
      "ПРАВИЛОТО ЗАДЪЛЖАВА МРЕЖИТЕ — НЕ Е ИЗМЕРВАНЕ НА ТЕРЕН. Чл. 3 е задължение към предприятията да ПОДДЪРЖАТ техническата възможност. Не намерихме публичен акт на КРС, МВР или оператор, който да отчита проверка, че всяка мрежа наистина я поддържа. Обнародваното задължение е най-високото ДОСТИЖИМО ниво за това твърдение — същата форма на находка като неопубликуваната учебна програма зад Наредба № 24.",
    ],
    statusBg: "grounded-agreed",
    noteBg:
      "Далекосъобщителен, не медицински факт: не идва от ERC 2025 или RCUK 2025 и не бива да се помни като част от тях. „Без кредит“ се покрива от чл. 2, ал. 2 — задължението за безплатен достъп важи и за ползватели СЪС ЗАБРАНА да извършват изходящи повиквания, което е състоянието на изчерпана предплатена карта. Чл. 7, ал. 2 е практически важен: при повикване без SIM карта се предава IMEI, а не номер — операторът няма на какво да ти върне обаждане, което прави „не затваряй“ по-съществено, а не по-малко.",
  },
  {
    id: "reg-112-simless-not-eu-wide",
    topicBg: "Достъпът до 112 без SIM карта е национален избор, а не европейска даденост",
    conceptIds: ["c-first-aid-priorities"],
    questionIds: ["q-ptp-058"],
    figureBg: null,
    authoritative: {
      sourceId: "src-ecc-report-324",
      locator: "The countries that did not provide this facility are Bulgaria",
    },
    corroborating: [
      {
        sourceId: "src-ecc-report-324",
        locator: "introduced a policy to prohibit such calls due to a high number of false calls",
      },
    ],
    conflicts: [
      "СПИСЪЦИТЕ СА ОСТАРЕЛИ И ИМЕННО ЗАТОВА СА ПОУЧИТЕЛНИ. Данните са от 2019–2020 г.; България вече е от другата страна (src-krs-pravila-112). Твърдението, което докладът поддържа, НЕ е „в тези държави не работи днес“, а „това е национален избор, който се сменя“ — и то е достатъчно, за да не се учи „112 работи без SIM карта навсякъде в Европа“ като факт.",
    ],
    statusBg: "grounded-agreed",
    noteBg:
      "Регистриран заради една конкретна опасност: българският ученик, който запомни правилото у дома и го пренесе в чужбина. Причината за забраните е записана в самия доклад — устройство без SIM карта не носи номер, не може да бъде проследено обратно и генерира фалшиви повиквания.",
  },
];

// ---------------------------------------------------------------------------
// Extraction + locating
// ---------------------------------------------------------------------------

/**
 * Collapse the whitespace a PDF sprinkles everywhere, for matching only.
 * Mirrors `normaliseForMatch` in platform/src/lib/content/law/corpus.ts: soft
 * hyphens, non-breaking and zero-width spaces survive extraction and would
 * otherwise turn a correct quote into a false alarm.
 */
export function normaliseForMatch(text) {
  return text
    // PUA code points (-) are font-private glyphs — a Symbol-font
    // bullet lands inside a quote as U+F0B7 and is not text.
    .replace(/[­​﻿-]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(file) {
  const pdf = path.join(toolsDir, file);
  const txt = pdf.replace(/\.pdf$/, ".txt");
  execFileSync("node", [path.join(toolsDir, "extract.mjs"), pdf, txt], { stdio: "pipe" });
  return fs.readFileSync(txt, "utf8");
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Cut the sentence containing `locator` out of `text`, verbatim.
 *
 * Sentence bounds are the previous ". " (or line start) and the next ". " (or
 * line end) — deliberately crude, because the alternative is a hand-typed
 * quote, and a slightly long quote that is REALLY in the source beats a tidy
 * one that is not. Throws when the locator is absent: that is the gate.
 */
export function cutSentence(text, locator, sourceId) {
  // Search the WHOLE document, not a two-line window. A window cannot know
  // where a wrapped sentence ends, and the first version of this function
  // silently truncated a quote at "…е убит" — dropping the very figure the
  // claim exists to carry. Line numbers come from a separate offset map so the
  // quote is still traceable to a line of the extracted text.
  const lines = text.split("\n");
  const flatLines = lines.map(normaliseForMatch);
  const offsets = [];
  let acc = 0;
  for (const l of flatLines) {
    offsets.push(acc);
    acc += l.length + 1; // the joining space
  }
  const flat = flatLines.join(" ");
  const needle = normaliseForMatch(locator);
  const at = flat.indexOf(needle);
  if (at === -1) {
    throw new Error(
      `LOCATOR NOT FOUND in ${sourceId}: "${locator}"\n` +
        "The source changed under the quote, or the locator is wrong. Nothing is emitted.",
    );
  }
  const before = flat.lastIndexOf(". ", at);
  const start = before === -1 ? 0 : before + 2;
  const after = flat.indexOf(". ", at + needle.length);
  const end = after === -1 ? flat.length : after + 1;
  let lineNo = 1;
  for (let i = 0; i < offsets.length; i += 1) if (offsets[i] <= start) lineNo = i + 1;
  return { quoteBg: flat.slice(start, end).trim(), lineNo };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const texts = new Map();
const sourceRows = SOURCES.map((s) => {
  const pdf = path.join(toolsDir, s.file);
  if (!fs.existsSync(pdf)) throw new Error(`missing original ${s.file} — run fetch.sh first`);
  const raw = fs.readFileSync(pdf);
  const text = extract(s.file);
  texts.set(s.id, text);
  return {
    id: s.id,
    kind: s.kind,
    authority: s.authority,
    titleBg: s.titleBg,
    // Emitted ONLY for a source that has one, so the two НСИ rows stay
    // byte-identical. RegisteredSourceSchema defaults the field to null, and a
    // register whose only source is Bulgarian should not grow an English column
    // of nulls just because one CEPT report joined it.
    ...(s.titleEn ? { titleEn: s.titleEn } : {}),
    publisherBg: s.publisherBg,
    editionBg: s.editionBg,
    url: s.url,
    format: s.format,
    httpStatus: 200,
    rawBytes: raw.length,
    rawSha256: sha256(raw),
    // Observed, not assumed: every PDF here was fetched twice and reproduced
    // byte-for-byte — the two НСИ ones, the КРС Правила and ECC Report 324
    // (unlike lex.bg, which carries a per-request token). If a source is ever
    // added that does NOT repeat, this must stop being a constant.
    rawHashStable: true,
    textBytes: Buffer.byteLength(text, "utf8"),
    textSha256: sha256(Buffer.from(text, "utf8")),
    extraction: "node extract.mjs <file>.pdf <file>.txt (pdftotext -enc UTF-8 -nopgbrk, CRLF→LF)",
    coversBg: s.coversBg,
    noteBg: s.noteBg,
  };
});

const claimRows = CLAIMS.map((c) => {
  const cut = (q) => {
    const text = texts.get(q.sourceId);
    if (text === undefined) throw new Error(`claim ${c.id} cites unknown source ${q.sourceId}`);
    return { sourceId: q.sourceId, ...cutSentence(text, q.locator, q.sourceId) };
  };
  const authoritative = cut(c.authoritative);

  // Gate 2 — the figure must be IN its own quote.
  //
  // `figureQuote` is a separate field for a reason the medical register learned
  // the hard way: the sentence stating a NUMBER is often not the sentence
  // stating the RULE, and checking the headline quote instead would either fire
  // falsely or, worse, pass on a claim whose number is nowhere.
  const figureQuote = c.figureQuote ? cut(c.figureQuote) : authoritative;
  if (c.figureBg) {
    const digits = c.figureBg.match(/\d+/g) ?? [];
    for (const d of digits) {
      if (!figureQuote.quoteBg.includes(d)) {
        throw new Error(
          `claim ${c.id}: figureBg "${c.figureBg}" — the figure quote never states "${d}".\n` +
            `  quote: ${figureQuote.quoteBg}`,
        );
      }
    }
  }

  return {
    id: c.id,
    topicBg: c.topicBg,
    conceptIds: c.conceptIds,
    questionIds: c.questionIds,
    figureBg: c.figureBg ?? null,
    figureQuote: c.figureBg ? figureQuote : null,
    authoritative,
    corroborating: (c.corroborating ?? []).map(cut),
    conflicts: c.conflicts ?? [],
    statusBg: c.statusBg,
    noteBg: c.noteBg ?? null,
  };
});

const retrievedAt = new Date().toISOString().slice(0, 10);
const write = (name, body) =>
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(body, null, 2)}\n`, "utf8");

write("sources.json", { version: 1, retrievedAt, sources: sourceRows });
write("claims.json", { version: 1, retrievedAt, claims: claimRows });

console.log(
  `build: ${sourceRows.length} source(s), ${claimRows.length} claim(s), ` +
    `${claimRows.reduce((n, c) => n + 1 + c.corroborating.length, 0)} quote(s) — all cut from fetched text`,
);
