/**
 * Build the article-addressable law corpus from the extracted plain text.
 * NOTHING here invents text: every unit's `textBg` is a verbatim slice of the
 * lines produced by extract.mjs / pdftotext. The only transformations are
 * (a) joining the source lines of one article with "\n" and
 * (b) deriving the citation `ref` from the article's own "Чл. N." header.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const SCRATCH = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node build-corpus.mjs <content/law dir>");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** "Чл. 179." / "Чл. 189ж." at the very start of an article. */
const ART_HEAD = /Чл\.\s*(\d+)([а-я]?\d*)\.\s/g;

/** Cut markers: a line that opens a structural block, not article prose. */
// NB: JS \b is ASCII-only — it never fires after a Cyrillic letter. Match the
// following whitespace / end-of-line explicitly instead.
const isStructural = (line) =>
  /^(Глава|Раздел|ДОПЪЛНИТЕЛНИ|ПРЕХОДНИ|ЗАКЛЮЧИТЕЛНИ|ПРИЛОЖЕНИ|Приложение)(\s|$)/.test(line) ||
  /^§\s/.test(line);

/**
 * Split a line-oriented text (one paragraph per line) into articles.
 * Used for the .docx-derived ЗДвП where every "Чл. N." starts its own line.
 */
function splitByLines(text) {
  const lines = text.split("\n");
  const units = [];
  let chapter = null;
  let chapterTitle = null;
  let section = null;
  let current = null;
  // The ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ block only. § numbers repeat in every amending
  // act's ПЗР, so ingesting them all would make "§ 7" ambiguous; content cites
  // "§ 6 ДР" (the definitions), which lives here and nowhere else.
  let inSupplementary = false;

  const push = () => {
    if (current) {
      current.textBg = current.lines.join("\n").trim();
      delete current.lines;
      units.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const head = /^Чл\.\s*(\d+)([а-я]?\d*)\.(\s|$)/.exec(line);
    if (head) {
      push();
      const ctx = [chapter, chapterTitle, section].filter(Boolean).join(" · ");
      current = {
        ref: `чл. ${head[1]}${head[2]}`,
        number: Number(head[1]),
        suffixBg: head[2] || null,
        contextBg: ctx || null,
        lines: [line],
      };
      continue;
    }
    const para = inSupplementary ? /^§\s*(\d+)([а-я]?)\.(\s|$)/.exec(line) : null;
    if (para) {
      push();
      current = {
        ref: `§ ${para[1]}${para[2]}`,
        number: null,
        suffixBg: para[2] || null,
        contextBg: "ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ",
        lines: [line],
      };
      continue;
    }
    if (isStructural(line)) {
      push();
      inSupplementary = line === "ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ";
      if (/^Глава(\s|$)/.test(line)) {
        chapter = line;
        chapterTitle = null;
        section = null;
      } else if (/^Раздел(\s|$)/.test(line)) {
        section = line;
      } else if (/^§\s/.test(line)) {
        // a § outside ДР (an amending act's ПЗР) — closes the previous unit,
        // carries no context of its own
      } else {
        // ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ etc. — end of the article body
        chapter = line;
        chapterTitle = null;
        section = null;
      }
      continue;
    }
    if (current) current.lines.push(line);
    else if (chapter && !chapterTitle && /^[А-ЯЁ\s"„“\-–,.]+$/.test(line) && line.length < 120) {
      chapterTitle = line;
    }
  }
  push();
  return units;
}

/**
 * Split a PDF-derived text where "Чл. N." can appear mid-line (pdftotext
 * reflows). Uppercase "Чл." only ever starts an article in these acts;
 * cross-references are lowercase "чл.".
 */
function splitByRegex(text) {
  const marks = [];
  ART_HEAD.lastIndex = 0;
  let m;
  while ((m = ART_HEAD.exec(text)) !== null) {
    marks.push({ index: m.index, number: Number(m[1]), suffixBg: m[2] || null });
  }
  const units = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    units.push({
      ref: `чл. ${marks[i].number}${marks[i].suffixBg ?? ""}`,
      number: marks[i].number,
      suffixBg: marks[i].suffixBg,
      contextBg: null,
      textBg: text.slice(start, end).trim(),
    });
  }
  return units;
}

/** Annex ("Приложение № N към чл. X") blocks, verbatim, for PDF-derived acts. */
function splitAnnexes(text) {
  const re = /Приложение\s+№\s*(\d+[а-я]?)\s+към\s+([^\n]{0,80})/g;
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) marks.push({ index: m.index, no: m[1], toBg: m[2].trim() });
  const units = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length < 40) continue;
    units.push({
      ref: `приложение № ${marks[i].no}`,
      number: null,
      suffixBg: null,
      contextBg: `към ${marks[i].toBg}`,
      textBg: body,
    });
  }
  return units;
}

function dedupeKeepLongest(units) {
  const byRef = new Map();
  for (const u of units) {
    const prev = byRef.get(u.ref);
    if (!prev || u.textBg.length > prev.textBg.length) byRef.set(u.ref, u);
  }
  return [...byRef.values()];
}

// --------------------------------------------------------------------------

const acts = [];

// 1) ЗДвП — from the .docx (line-oriented, highest fidelity source we have).
{
  const raw = readFileSync(path.join(SCRATCH, "zdvp.txt"), "utf8");
  const lines = raw.split("\n");
  const titleBg = lines[0].trim();
  const promulgationBg = lines[1].trim();
  // Articles in numeric order, then the ДР paragraphs.
  const units = dedupeKeepLongest(splitByLines(raw)).sort((a, b) => {
    if ((a.number === null) !== (b.number === null)) return a.number === null ? 1 : -1;
    if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number;
    return (a.ref ?? "").localeCompare(b.ref ?? "", "bg");
  });
  acts.push({
    file: "zdvp.json",
    doc: {
      actId: "zdvp",
      abbrBg: "ЗДвП",
      titleBg,
      promulgationBg,
      consolidatedThroughBg: "ДВ, бр. 55 от 16.06.2026 г.",
      sourceId: "src-zdvp-mtc-16062026",

      units,
    },
  });
}

// 2) Наредба № Iз-2539 — контролни точки.
{
  const raw = readFileSync(path.join(SCRATCH, "iz2539.txt"), "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const units = dedupeKeepLongest([...splitByRegex(raw), ...splitAnnexes(raw)]);
  acts.push({
    file: "naredba-iz-2539.json",
    doc: {
      actId: "naredba-iz-2539",
      abbrBg: "Наредба № Iз-2539/2012",
      titleBg: lines.slice(0, 3).join(" ").replace(/\s+/g, " ").trim(),
      promulgationBg: (lines.find((l) => /Обн\./.test(l)) ?? "").trim(),
      consolidatedThroughBg: null,
      sourceId: "src-naredba-iz-2539-sars",

      units,
    },
  });
}

// 3) Наредба № 38 — изпитни точки (the examiner marking scheme).
{
  const raw = readFileSync(path.join(SCRATCH, "naredba38.txt"), "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const units = dedupeKeepLongest([...splitByRegex(raw), ...splitAnnexes(raw)]);
  acts.push({
    file: "naredba-38.json",
    doc: {
      actId: "naredba-38",
      abbrBg: "Наредба № 38/2004",
      titleBg: lines.slice(0, 3).join(" ").replace(/\s+/g, " ").trim(),
      promulgationBg: (lines.find((l) => /Обн\./.test(l)) ?? "").trim(),
      consolidatedThroughBg: null,
      sourceId: "src-naredba-38-sars",

      units,
    },
  });
}

mkdirSync(path.join(OUT, "acts"), { recursive: true });
for (const a of acts) {
  const p = path.join(OUT, "acts", a.file);
  writeFileSync(p, JSON.stringify(a.doc, null, 1) + "\n", "utf8");
  const arts = a.doc.units.filter((u) => u.number !== null).length;
  const annex = a.doc.units.length - arts;
  console.log(
    `${a.file.padEnd(24)} units=${String(a.doc.units.length).padStart(4)} (art ${arts}, annex ${annex})  ${(statSync(p).size / 1024).toFixed(0)} KB`,
  );
}

for (const f of ["zdvp_16062026.docx", "iz2539.pdf", "naredba38.pdf"]) {
  const buf = readFileSync(path.join(SCRATCH, f));
  console.log(`${f}  bytes=${buf.length}  sha256=${sha256(buf)}`);
}
