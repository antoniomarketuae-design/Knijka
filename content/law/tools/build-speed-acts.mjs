/**
 * Ingest the acts retrieved for the speeding-ladder wave, following
 * content/law/tools/build-corpus.mjs: every unit's textBg is a verbatim slice
 * of the fetched text; the only processing is tag-strip (HTML) / pdftotext
 * (PDF) and rejoining lines the SOURCE split for markup reasons.
 *
 * THE WALK MUST BE STOPPED BY THE ACT'S OWN STRUCTURE, TWICE OVER. This script
 * reproduced the naredba-24 defect twice before it was right:
 *   1. it ended the lex.bg body at a literal "Преходни и заключителни
 *      разпоредби"; the page writes "Преходни и Заключителни", the match
 *      failed, and чл. 30 swallowed 1.3 KB of the site's news/forum sidebar;
 *   2. with that fixed, the LAST article still ran to the end of the column and
 *      swallowed the приложения — 5 KB of form template into 8121з-532 чл. 17,
 *      19 KB into Iз-2539 чл. 30.
 * So the column is now cut at the layout boundary (#colleft … #colright) before
 * the tags are stripped, and the article walk is cut at the first structural
 * heading that follows the last "Чл. N." — with the annexes emitted as their
 * own units. content/law/pageFurniture.test.ts caught both.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The fetched originals sit next to this script (see .gitignore).
 *
 * `fileURLToPath`, not `new URL(...).pathname` — the sibling tools use the
 * pathname and it does not survive this repo's own checkout path: the space in
 * "E:\AI driver" comes back as "%20" and every read fails with ENOENT on
 * "E:\AI%20driver\content\law\tools\…".
 */
const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node build-speed-acts.mjs <content/law dir>");
const SEP = "\u0001"; // marks a markup-only line break, resolved per-unit below

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** lex.bg serves windows-1251; the act body is the #colleft column. */
function lexBodyText(file) {
  const html = new TextDecoder("windows-1251").decode(readFileSync(path.join(SCRATCH, file)));
  const start = html.indexOf('id="colleft"');
  const idAt = html.indexOf('id="colright"');
  // …at the START of that tag: slicing at the attribute leaves a bare "<div "
  // fragment, which survives the tag strip and lands in the last unit.
  const end = idAt < 0 ? -1 : html.lastIndexOf("<", idAt);
  if (start < 0 || end <= start) throw new Error(`${file}: #colleft/#colright not found`);
  return html
    .slice(start, end)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((l) => l !== "-->" && !/Adobe Flash Player/.test(l))
    .join(SEP);
}

const artHead = () => new RegExp(`Чл\\.\\s*(\\d+)([а-я]?\\d*)\\.(\\s|${SEP})`, "g");

/**
 * An annex heading, at the start of its own line: "Приложение [№ N] към …".
 * The separator class has to include SEP: lex.bg links the "чл. X" that the
 * annex belongs to, so the strip lands a line break in the middle of the
 * heading ("Приложение към" ⏎ "чл. 10, ал. 1") and a plain \s+ matches nothing.
 */
const annexHead = () =>
  new RegExp(`(?:^|${SEP})(Приложение(?:[\\s${SEP}]+№[\\s${SEP}]*(\\d+[а-я]?))?[\\s${SEP}]+към[\\s${SEP}]+)([^${SEP}]{0,80})`, "g");

/** ПЗР / ЗР headings — the block after the articles, deliberately not ingested. */
const trailingBlock = () =>
  new RegExp(`(?:^|${SEP})(Преходни|Заключителни|ПРЕХОДНИ|ЗАКЛЮЧИТЕЛНИ)[^${SEP}]{0,70}`, "g");

/** Resolve the markup-only separators inside one unit's slice. */
function renderUnit(slice) {
  return (
    slice
      // lex.bg puts an article/alinea SUFFIX letter outside the cross-reference
      // <a>, so the strip splits "ал. 3а" into "ал. 3" + "а …". Rejoin only
      // that shape. "и" is excluded because it is also the conjunction: all
      // nine other splits of this form in Iз-2539 are "чл. N" + "и …"
      // ("article N AND …"). The one token this repairs, "чл. 182, ал. 3а", is
      // corroborated verbatim by the ЗИД already held at
      // acts/naredba-iz-2539-izm-dv49-2026.json, § 3.
      .replace(new RegExp(`((?:чл|ал|т)\\.\\s\\d+)${SEP}([а-зк-я])(?=\\s)`, "g"), "$1$2")
      .replace(new RegExp(`${SEP}(?=\\((\\d+[а-я]?)\\)\\s)`, "g"), "\n")
      .replace(new RegExp(`${SEP}(?=\\d+\\.\\s)`, "g"), "\n")
      .replace(new RegExp(SEP, "g"), " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([,.;:)])/g, "$1")
      // lex.bg links the cross-reference INSIDE the parentheses, so the strip
      // also leaves "( чл. 174, ал. 1, т. 1 от ЗДвП)" — the mirror of the rule
      // above, and the same one-space defect on the opening side.
      .replace(/([(„])\s+/g, "$1")
      .trim()
  );
}

/** Where the articles stop: the first structural heading after the last "Чл. N.". */
function articleRegionEnd(joined) {
  const heads = [...joined.matchAll(artHead())];
  if (heads.length === 0) return joined.length;
  const afterLast = heads.at(-1).index;
  const stops = [...joined.matchAll(annexHead()), ...joined.matchAll(trailingBlock())]
    .map((m) => m.index)
    .filter((i) => i > afterLast);
  return stops.length ? Math.min(...stops) : joined.length;
}

function splitArticles(joined) {
  const stop = articleRegionEnd(joined);
  const marks = [...joined.matchAll(artHead())]
    .filter((m) => m.index < stop)
    .map((m) => ({ index: m.index, number: Number(m[1]), suffixBg: m[2] || null }));
  return marks.map((mark, i) => ({
    ref: `чл. ${mark.number}${mark.suffixBg ?? ""}`,
    number: mark.number,
    suffixBg: mark.suffixBg,
    contextBg: null,
    textBg: renderUnit(joined.slice(mark.index, i + 1 < marks.length ? marks[i + 1].index : stop)),
  }));
}

/** Annex blocks, verbatim, each addressed by its own "Приложение № N". */
function splitAnnexes(joined) {
  const marks = [...joined.matchAll(annexHead())].map((m) => ({
    index: m.index + (m[0].startsWith(SEP) ? 1 : 0),
    no: m[2] ?? null,
    toBg: m[3].trim().replace(/[,;.]\s*$/, ""),
  }));
  return marks
    .map((mark, i) => ({
      ref: mark.no ? `приложение № ${mark.no}` : "приложение",
      number: null,
      suffixBg: null,
      contextBg: `към ${mark.toBg}`,
      textBg: renderUnit(
        joined.slice(mark.index, i + 1 < marks.length ? marks[i + 1].index : joined.length),
      ),
    }))
    .filter((u) => u.textBg.length >= 40);
}

function dedupeKeepLongest(units) {
  const byRef = new Map();
  for (const u of units) {
    const prev = byRef.get(u.ref);
    if (!prev || u.textBg.length > prev.textBg.length) byRef.set(u.ref, u);
  }
  return [...byRef.values()].sort((a, b) => {
    if ((a.number === null) !== (b.number === null)) return a.number === null ? 1 : -1;
    if (a.number !== null && b.number !== null) return a.number - b.number;
    return a.ref.localeCompare(b.ref, "bg", { numeric: true });
  });
}

const fromLex = (file) => {
  const joined = lexBodyText(file);
  return dedupeKeepLongest([...splitArticles(joined), ...splitAnnexes(joined)]);
};

const emitted = [];

// 1) Наредба № 8121з-532 (АТСС) — the tolerance-deduction rule, чл. 16, ал. 5.
emitted.push({
  file: "naredba-8121z-532.json",
  doc: {
    actId: "naredba-8121z-532",
    abbrBg: "Наредба № 8121з-532/2015",
    titleBg:
      "НАРЕДБА № 8121з-532 ОТ 12 МАЙ 2015 Г. ЗА УСЛОВИЯТА И РЕДА ЗА ИЗПОЛЗВАНЕ НА АВТОМАТИЗИРАНИ ТЕХНИЧЕСКИ СРЕДСТВА И СИСТЕМИ ЗА КОНТРОЛ НА ПРАВИЛАТА ЗА ДВИЖЕНИЕ ПО ПЪТИЩАТА",
    promulgationBg:
      "Издадена от министъра на вътрешните работи. Обн. ДВ, бр. 36 от 19 май 2015 г., изм. и доп. ДВ, бр. 6 от 16 януари 2018 г., изм. и доп. ДВ, бр. 34 от 7 април 2026 г.",
    consolidatedThroughBg: "ДВ, бр. 34 от 7.04.2026 г.",
    sourceId: "src-naredba-8121z-532-lex",
    units: fromLex("lex2136505166.html"),
  },
});

// 2) НСИПМК — SECTION ONLY: Раздел XXVI „Скоростомери" (чл. 416 – чл. 432), the
//    section чл. 16, ал. 5 above points at. The other 25 sections of this
//    наредба govern audiometers, aerosol dispensers and the like and have
//    nothing to do with road policing; the sha256 in sources.json pins the
//    whole PDF, so the omission is re-verifiable rather than hidden.
{
  const raw = readFileSync(path.join(SCRATCH, "naredba-si.txt"), "utf8");
  const from = raw.indexOf("Раздел XXVI. Скоростомери");
  const to = raw.indexOf("Раздел XXVII", from);
  if (from < 0 || to <= from) throw new Error("НСИПМК: Раздел XXVI bounds not found");
  const joined = raw
    .slice(from, to)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(SEP);
  emitted.push({
    file: "naredba-sredstva-za-izmervane.json",
    doc: {
      actId: "naredba-sredstva-za-izmervane",
      abbrBg: "НСИПМК",
      titleBg: "НАРЕДБА ЗА СРЕДСТВАТА ЗА ИЗМЕРВАНЕ, КОИТО ПОДЛЕЖАТ НА МЕТРОЛОГИЧЕН КОНТРОЛ",
      promulgationBg:
        "В сила от 06.12.2024 г. Приета с ПМС № 417 от 29.11.2024 г. Обн. ДВ, бр. 103 от 6 декември 2024 г.",
      consolidatedThroughBg: "ДВ, бр. 103 от 6.12.2024 г.",
      sourceId: "src-naredba-sredstva-za-izmervane-damtn",
      units: dedupeKeepLongest(splitArticles(joined)).map((u) => ({
        ...u,
        contextBg: "Раздел XXVI · Скоростомери",
      })),
    },
  });
}

// 3) Наредба № Iз-2539 — CONSOLIDATED through ДВ бр. 49/2026. Emitted under its
//    own dated actId, NOT as a replacement: penalties.json cites the 2025
//    snapshot by locator and build-penalties.mjs belongs to another lane.
emitted.push({
  file: "naredba-iz-2539-consolidated-dv49-2026.json",
  doc: {
    actId: "naredba-iz-2539-consolidated-dv49-2026",
    abbrBg: "Наредба № Iз-2539/2012 (консолидирана)",
    titleBg:
      "НАРЕДБА № Iз-2539 ОТ 17 ДЕКЕМВРИ 2012 Г. ЗА ОПРЕДЕЛЯНЕ МАКСИМАЛНИЯ РАЗМЕР НА КОНТРОЛНИТЕ ТОЧКИ, УСЛОВИЯТА И РЕДА ЗА ОТНЕМАНЕТО И ВЪЗСТАНОВЯВАНЕТО ИМ, СПИСЪКА НА НАРУШЕНИЯТА, ПРИ ИЗВЪРШВАНЕТО НА КОИТО ОТ НАЛИЧНИТЕ КОНТРОЛНИ ТОЧКИ НА ВОДАЧА, ИЗВЪРШИЛ НАРУШЕНИЕТО, СЕ ОТНЕМАТ ТОЧКИ СЪОБРАЗНО ДОПУСНАТОТО НАРУШЕНИЕ, КАКТО И УСЛОВИЯТА И РЕДА ЗА ИЗДАВАНЕ НА РАЗРЕШЕНИЕ ЗА ПРОВЕЖДАНЕ НА ДОПЪЛНИТЕЛНО ОБУЧЕНИЕ",
    promulgationBg:
      "В сила от 04.02.2013 г. Издадена от министъра на вътрешните работи. Обн. ДВ, бр. 1 от 4 януари 2013 г., изм. ДВ, бр. 44 от 16 юни 2015 г., изм. и доп. ДВ, бр. 28 от 4 април 2017 г., изм. и доп. ДВ, бр. 26 от 23 март 2018 г., изм. и доп. ДВ, бр. 58 от 23 юли 2019 г., изм. и доп. ДВ, бр. 27 от 24 март 2023 г., попр. ДВ, бр. 56 от 30 юни 2023 г., изм. ДВ, бр. 108 от 27 декември 2024 г., изм. и доп. ДВ, бр. 22 от 24 февруари 2026 г., попр. ДВ, бр. 24 от 6 март 2026 г., изм. и доп. ДВ, бр. 49 от 29 май 2026 г.",
    consolidatedThroughBg: "ДВ, бр. 49 от 29.05.2026 г.",
    sourceId: "src-naredba-iz-2539-consolidated-lex",
    units: fromLex("lex2539.html"),
  },
});

for (const a of emitted) {
  const p = path.join(OUT, "acts", a.file);
  writeFileSync(p, JSON.stringify(a.doc, null, 1) + "\n", "utf8");
  const arts = a.doc.units.filter((u) => u.number !== null).length;
  console.log(
    `${a.file.padEnd(46)} units=${String(a.doc.units.length).padStart(3)} ` +
      `(art ${arts}, annex ${a.doc.units.length - arts})  ` +
      `${(statSync(p).size / 1024).toFixed(0)} KB`,
  );
}

for (const f of ["lex2136505166.html", "naredba-si.pdf", "lex2539.html"]) {
  const buf = readFileSync(path.join(SCRATCH, f));
  console.log(`${f.padEnd(26)} bytes=${buf.length}  sha256=${sha256(buf)}`);
}
