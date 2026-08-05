/**
 * Emit content/medical/sources.json — the medical source register.
 *
 * Same contract as content/law/tools/build-sources.mjs: every entry is fetched
 * live and pinned by URL + byte count + sha256; nothing is recorded from
 * memory. One difference, and it is forced by the material:
 *
 *   The law corpus ingests .docx/.pdf, whose bytes are stable. Three of the
 *   sources here are HTML pages, and lex.bg embeds a per-request token — two
 *   identical fetches produce the same 110826 bytes with a DIFFERENT sha256.
 *   So a raw sha256 alone cannot prove "this is the text we read".
 *
 * Therefore every entry carries BOTH hashes:
 *   rawSha256  — of the fetched file, plus rawHashStable saying whether a
 *                second fetch reproduced it (observed, not assumed).
 *   textSha256 — of tools/extract.mjs output. This is the invariant that
 *                actually holds, and it is what verify-claims.mjs checks.
 *
 * Usage, from content/medical/tools/:
 *   node build-sources.mjs ..
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// fileURLToPath, not URL.pathname — the repo path contains a space, and
// pathname leaves it percent-encoded.
const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node build-sources.mjs <content/medical dir>");
const RETRIEVED = "2026-08-04";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const P = (f) => path.join(SCRATCH, f);

/**
 * The register. `file` is the local name fetch.sh writes; `extract` is the
 * exact command that turns it into the text verify-claims.mjs reads.
 */
const SOURCES = [
  {
    id: "src-naredba-24-lex",
    kind: "bg-normative",
    authority: "binding-bg",
    titleBg:
      "НАРЕДБА № 24 от 2 декември 2002 г. за условията и реда за обучение за оказване на първа долекарска помощ от водачи на моторни превозни средства",
    titleEn: null,
    publisherBg: "Министерство на здравеопазването и Министерство на образованието и науката (текст: lex.bg)",
    editionBg: "Обн. ДВ, бр. 116 от 13.12.2002 г., изм. и доп. ДВ, бр. 114 от 24.12.2025 г., в сила от 26.01.2026 г.",
    url: "https://lex.bg/laws/ldoc/2135461835",
    format: "html",
    file: "naredba24_lex.html",
    extract: ["node", "extract.mjs", "naredba24_lex.html", "naredba24_lex.txt", "--charset", "windows-1251"],
    textFile: "naredba24_lex.txt",
    coversBg:
      "Кои теми се преподават и изпитват (чл. 9), кой обучава (чл. 5), кой утвърждава учебната програма (чл. 8). НЕ съдържа нито една клинична стойност.",
    supersedesId: "src-naredba-24-sars",
    noteBg: null,
  },
  {
    id: "src-naredba-24-sars",
    kind: "bg-normative",
    authority: "superseded",
    titleBg:
      "НАРЕДБА № 24 от 2 декември 2002 г. … (снимка на Сиела от 17.01.2023 г., публикувана в нормативната база на ДАБДП)",
    titleEn: null,
    publisherBg: "Държавна агенция „Безопасност на движението по пътищата“ (нормативна база)",
    editionBg: "Обн. ДВ, бр. 116 от 13.12.2002 г. — БЕЗ изменението ДВ, бр. 114 от 2025 г.",
    url: "https://www.sars.gov.bg/wp-content/uploads/2023/07/%D0%9D%D0%B0%D1%80%D0%B5%D0%B4%D0%B1%D0%B0-%E2%84%96-24-%D0%BE%D1%82-2-%D0%B4%D0%B5%D0%BA%D0%B5%D0%BC%D0%B2%D1%80%D0%B8-2002-%D0%B3.pdf",
    format: "pdf",
    file: "naredba24.pdf",
    extract: ["pdftotext", "-enc", "UTF-8", "-nopgbrk", "naredba24.pdf", "naredba24_sars.txt"],
    textFile: "naredba24_sars.txt",
    coversBg: "Отменената редакция. Регистрирана, за да е документирано, че официалната нормативна база е остаряла.",
    supersedesId: null,
    noteBg:
      "ДАБДП сервира редакция отпреди ДВ, бр. 114 от 2025 г.: чл. 3 още изброява само „магистър по медицина/стоматология, фелдшер, медицинска сестра“, а приложение № 1 още е в сила. Не цитирай този файл.",
  },
  {
    id: "src-erc-2025-layperson",
    kind: "clinical-guideline",
    authority: "current-consensus",
    titleBg: null,
    titleEn: "ERC Guidelines 2025 — Guidelines for Everyone (layperson book)",
    publisherBg: "European Resuscitation Council",
    editionBg: "Guidelines 2025 (launched 22.10.2025, Rotterdam); iPDF v11-e",
    url: "https://www.erc.edu/media/p5ymaeej/gl2025_layperson_book_ipdf-v11-e.pdf",
    format: "pdf",
    file: "erc2025_layperson.pdf",
    extract: ["pdftotext", "-enc", "UTF-8", "-nopgbrk", "erc2025_layperson.pdf", "erc2025_layperson.txt"],
    textFile: "erc2025_layperson.txt",
    coversBg:
      "Единственият пълен текст на ERC 2025, който се тегли машинно без вход. Държи дълбочината, честотата, съотношението, стабилното странично положение и правилото „не мести“.",
    supersedesId: null,
    noteBg:
      "Ниво „за неспециалисти“ — точно нивото на нашата аудитория. Първичните глави (Adult BLS, Resuscitation 2025;215:110771; First Aid, 215:110752) са зад Elsevier и дават 403 на машинно теглене; Crossref потвърждава, че лицензът им е само TDM, не отворен достъп.",
  },
  {
    id: "src-rcuk-2025-bls",
    kind: "clinical-guideline",
    authority: "national-adaptation",
    titleBg: null,
    titleEn: "Resuscitation Council UK — Adult Basic Life Support Guidelines (2025 Resuscitation Guidelines)",
    publisherBg: "Resuscitation Council UK",
    editionBg: "Published 27 October 2025; cites ERC 2025 Adult BLS, Resuscitation 2025;215(Suppl 1):110771",
    url: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines",
    format: "html",
    file: "rcuk_bls.html",
    extract: ["node", "extract.mjs", "rcuk_bls.html", "rcuk_bls.txt"],
    textFile: "rcuk_bls.txt",
    coversBg: "Дълбочина, честота, съотношение 30:2, разпознаване на сърдечен арест и промяната в реда от 2025 г.",
    supersedesId: null,
    noteBg:
      "Връща 403 на празен User-Agent — оттам идва „не може да се извлече“ от предишната вълна. С браузърски UA дава 200. fetch.sh подава UA.",
  },
  {
    id: "src-rcuk-2025-first-aid",
    kind: "clinical-guideline",
    authority: "national-adaptation",
    titleBg: null,
    titleEn: "Resuscitation Council UK — First Aid Guidelines (2025 Resuscitation Guidelines)",
    publisherBg: "Resuscitation Council UK",
    editionBg: "Published 27 October 2025; cites ERC 2025 First Aid, Resuscitation 2025;215(Suppl 1):110752",
    url: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/first-aid-guidelines",
    format: "html",
    file: "rcuk_fa.html",
    extract: ["node", "extract.mjs", "rcuk_fa.html", "rcuk_fa.txt"],
    textFile: "rcuk_fa.txt",
    coversBg:
      "Турникет (включително къде и че не се сваля), животозастрашаващо кървене, стабилно странично положение и противопоказанието му при травма, шийна травма.",
    supersedesId: null,
    noteBg: null,
  },
  {
    id: "src-bchk-first-help-bls",
    kind: "bg-teaching-material",
    authority: "not-a-grounding-source",
    titleBg: "БЧК — Първа помощ: „Основна мед. помощ и автоматизирана външна дефибрилация“",
    titleEn: null,
    publisherBg: "Български Червен кръст (превод на издание на Червения кръст Белгия-Фландрия)",
    editionBg: "Изрично базирана на „научните насоки на МФЧК/ЧП от 2011 г.“",
    url: "https://www.redcross.bg/first-help/-----------.-------------------------------------------.html",
    format: "html",
    file: "bchk_bls.html",
    extract: ["node", "extract.mjs", "bchk_bls.html", "bchk_bls.txt"],
    textFile: "bchk_bls.txt",
    coversBg: "Какво реално чете български ученик. Регистрирана за сравнение, НЕ като основание.",
    supersedesId: null,
    noteBg:
      "Съдържа явна грешка: „Натискайте върху горната част на корема или долната част на гръдната кост.“ ERC/RCUK казват долната половина на гръдната кост и изрично НЕ корема. Прилича на загубено отрицание при превода. Не цитирай тази страница за техника.",
  },
  {
    id: "src-bchk-first-help-steps",
    kind: "bg-teaching-material",
    authority: "not-a-grounding-source",
    titleBg: "БЧК — Първа помощ: „Основните стъпки в първата помощ“",
    titleEn: null,
    publisherBg: "Български Червен кръст (превод на издание на Червения кръст Белгия-Фландрия)",
    editionBg: "Изрично базирана на „научните насоки на МФЧК/ЧП от 2011 г.“",
    url: "https://www.redcross.bg/first-help/page-5.html",
    format: "html",
    file: "bchk_page5.html",
    extract: ["node", "extract.mjs", "bchk_page5.html", "bchk_page5.txt"],
    textFile: "bchk_page5.txt",
    coversBg: "Обезопасяване на място на ПТП, кога изобщо се мести пострадал, 112.",
    supersedesId: null,
    noteBg: null,
  },
  {
    id: "src-bchk-course-drivers",
    kind: "bg-teaching-material",
    authority: "not-a-grounding-source",
    titleBg: "БЧК — „Курс за обучение за оказване на първа долекарска помощ от водачи на моторни превозни средства“",
    titleEn: null,
    publisherBg: "Български Червен кръст",
    editionBg: "Описва режима след ДВ, бр. 114 от 24.12.2025 г.",
    url: "https://firstaid.redcross.bg/home/courseinfo/25",
    format: "html",
    file: "bchk_course25.html",
    extract: ["node", "extract.mjs", "bchk_course25.html", "bchk_course25.txt"],
    textFile: "bchk_course25.txt",
    coversBg: "Продължителност (12 учебни часа в 2 последователни дни) и освобождавания — как курсът се провежда на практика.",
    supersedesId: null,
    noteBg: null,
  },
];

async function head(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA } });
    // Drain so the socket closes; we only keep the status.
    await r.arrayBuffer();
    return r.status;
  } catch {
    return 0;
  }
}

const out = [];
for (const s of SOURCES) {
  const file = P(s.file);
  if (!existsSync(file)) throw new Error(`missing ${s.file} — run fetch.sh first`);
  const raw = readFileSync(file);

  execFileSync(s.extract[0], s.extract.slice(1), { cwd: SCRATCH, stdio: "pipe" });
  const text = readFileSync(P(s.textFile));

  // Observed, not assumed: fetch once more and see whether the bytes repeat.
  let rawHashStable = null;
  try {
    const r = await fetch(s.url, { redirect: "follow", headers: { "User-Agent": UA } });
    if (r.ok) rawHashStable = sha256(Buffer.from(await r.arrayBuffer())) === sha256(raw);
  } catch {
    rawHashStable = null;
  }

  const httpStatus = await head(s.url);
  process.stderr.write(`  ${httpStatus} ${s.id} raw=${raw.length}B stable=${rawHashStable}\n`);

  out.push({
    id: s.id,
    kind: s.kind,
    authority: s.authority,
    titleBg: s.titleBg,
    titleEn: s.titleEn,
    publisherBg: s.publisherBg,
    editionBg: s.editionBg,
    url: s.url,
    format: s.format,
    httpStatus,
    rawBytes: raw.length,
    rawSha256: sha256(raw),
    rawHashStable,
    textBytes: text.length,
    textSha256: sha256(text),
    extraction: s.extract.join(" "),
    coversBg: s.coversBg,
    supersedesId: s.supersedesId,
    noteBg: s.noteBg,
  });
}

const doc = { version: 1, retrievedAt: RETRIEVED, sources: out };
writeFileSync(path.join(OUT, "sources.json"), JSON.stringify(doc, null, 1) + "\n", "utf8");
const bad = out.filter((s) => s.httpStatus !== 200);
console.log(`sources.json: ${out.length} entries; non-200: ${bad.length}`);
for (const b of bad) console.log(`  !! ${b.httpStatus} ${b.url}`);
