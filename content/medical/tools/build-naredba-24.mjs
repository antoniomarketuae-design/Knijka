/**
 * Emit content/law/acts/naredba-24.json — Наредба № 24/2002, the act that
 * actually sets the first-aid syllabus for Bulgarian driver candidates.
 *
 * This one IS a statute, so it goes in the LAW corpus in the law corpus's own
 * ActSchema shape — not in content/medical/. Only the clinical guidelines
 * needed a new shape (see content/medical/README.md).
 *
 * Source text: lex.bg consolidated through ДВ, бр. 114 от 24.12.2025 г.
 * NOT the ДАБДП PDF, which still serves the pre-2025 redaction.
 *
 * WHERE THE ACT ENDS AND THE WEBSITE BEGINS (fixed 2026-08-09).
 * `naredba24_lex.txt` is the whole lex.bg PAGE flattened to lines, not the act:
 * the first 20 lines are the site's navigation and the last 48 are its sidebar
 * — news headlines with datestamps, forum threads, a „Хумор" section, a
 * newsletter box and the copyright line. The navigation never leaked, because
 * it arrives before the first unit exists to append to. The SIDEBAR did, all
 * 1,062 characters of it, straight into `приложение № 2 към чл. 12` — 10.8% of
 * the emitted act — because that annex is REPEALED and therefore has no body of
 * its own to stop the walk. Emitted, `getArticle("naredba-24", "приложение № 2")`
 * would have handed a student a lex.bg forum post, and `LawActSchema` would not
 * have blinked: it is a valid string.
 *
 * Two independent stops, because one is a guess and two is a rule:
 *   1. A REPEALED UNIT IS COMPLETE at its „(Отм. - ДВ, …)" line. That is what
 *      repealed means on lex.bg — a heading and that line, no body. Structural,
 *      and it is what actually went wrong here.
 *   2. THE PAGE FURNITURE ENDS THE DOCUMENT. Once the act has started, a line
 *      that is exactly one of the sidebar's own headings is the website talking.
 * And then a REFUSAL: the emitted units are scanned for furniture signatures
 * and the build throws rather than write. Same discipline as the „чл. 9 did not
 * parse" guard below — a silent trim is how this got in.
 * `platform/src/lib/content/law/pageFurniture.test.ts` asserts the same
 * property over EVERY act in `content/law/acts/`, loaded or not, so the next
 * ingest cannot reintroduce the class.
 *
 * Usage, from content/medical/tools/:
 *   node build-naredba-24.mjs ../../law
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node build-naredba-24.mjs <content/law dir>");

const lines = readFileSync(path.join(SCRATCH, "naredba24_lex.txt"), "utf8").split("\n");

// lex.bg leaves an HTML comment marker between blocks; it is not act text.
const clean = lines.filter((l) => l !== "-->");

const units = [];
let current = null;
const push = () => {
  if (current) {
    current.textBg = current.lines.join("\n").trim();
    delete current.lines;
    units.push(current);
    current = null;
  }
};

/**
 * The lex.bg sidebar's own section headings, as whole lines. The first one to
 * appear after the act has begun is where the page stops being the act.
 * („НОВИНИ"/„ФОРУМ"/„ХУМОР" in caps are the TOP navigation and appear before
 * any unit exists, so they need no handling — they are listed for the reader.)
 */
const PAGE_FURNITURE_HEADINGS = new Set([
  "Новини",
  "Спектър",
  "Форум",
  "Хумор",
  "Бюлетин",
  "Посети форума",
  "Виж всички",
]);

/** A repealed unit is a heading and this line. Nothing follows it. */
const REPEALED_RE = /^\(Отм\.\s*[-–—]/;

let context = null;
let ended = false;
for (const line of clean) {
  if (ended) continue;
  if (units.length > 0 && PAGE_FURNITURE_HEADINGS.has(line)) {
    push();
    ended = true;
    continue;
  }
  if (current && REPEALED_RE.test(line)) {
    // Close it HERE: whatever comes next belongs to the next unit or to the
    // website, never to a repealed one.
    current.lines.push(line);
    push();
    continue;
  }
  if (/^(Заключителни разпоредби|КЪМ НАРЕДБА ЗА ИЗМЕНЕНИЕ)/.test(line)) {
    push();
    context = "Заключителни разпоредби";
    continue;
  }
  if (/^Приложение № /.test(line)) {
    push();
    context = "Приложения";
    current = { ref: line.split(" (")[0].toLowerCase().trim(), number: null, suffixBg: null, contextBg: context, lines: [line] };
    continue;
  }
  const art = /^Чл\.\s*(\d+)([а-я]?)\.(\s|$)/.exec(line);
  if (art) {
    push();
    current = {
      ref: `чл. ${art[1]}${art[2]}`,
      number: Number(art[1]),
      suffixBg: art[2] || null,
      contextBg: context,
      lines: [line],
    };
    continue;
  }
  const para = /^§\s*(\d+)\.(\s|$)/.exec(line);
  if (para && context === "Заключителни разпоредби") {
    push();
    current = { ref: `§ ${para[1]}`, number: Number(para[1]), suffixBg: null, contextBg: context, lines: [line] };
    continue;
  }
  if (current) current.lines.push(line);
}
push();

// § numbers repeat between the original ЗР and the amending act's ЗР; keep the
// first occurrence only, exactly as the ЗДвП ingest does, so a citation
// addresses one unit.
const seen = new Set();
const deduped = units.filter((u) => (seen.has(u.ref) ? false : (seen.add(u.ref), true)));

const act = {
  actId: "naredba-24",
  abbrBg: "Наредба № 24",
  titleBg:
    "НАРЕДБА № 24 от 2 декември 2002 г. за условията и реда за обучение за оказване на първа долекарска помощ от водачи на моторни превозни средства",
  promulgationBg: "Обн. ДВ, бр. 116 от 13 декември 2002 г.",
  consolidatedThroughBg: "изм. и доп. ДВ, бр. 114 от 24 декември 2025 г., в сила от 26.01.2026 г.",
  sourceId: "src-naredba-24-lex",
  units: deduped,
};

if (!act.units.some((u) => u.ref === "чл. 9")) throw new Error("чл. 9 (the syllabus) did not parse — refusing to emit");

/**
 * THE REFUSAL. Signatures of a web page rather than a statute. Each one was
 * present in the 1,062 characters that shipped, and none of them can occur in
 * the text of a наредба.
 */
const FURNITURE_SIGNATURES = [
  [/\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/, "a news datestamp (dd.mm.yyyy hh:mm)"],
  [/^\d{4}-\d{2}-\d{2}$/m, "an ISO date on its own line"],
  // NOT `\bмнения\b`: JavaScript's `\b` is ASCII-only, so it never fires on a
  // Cyrillic word and this signature silently matched nothing. Caught by the
  // negative control in pageFurniture.test.ts, which is what it is for.
  [/(?<![А-Яа-яA-Za-z])мнения(?![А-Яа-яA-Za-z])/, "a forum thread's reply count"],
  [/Посети форума|Виж всички|Отписване/, "a sidebar call to action"],
  [/Lex\.bg|политика за поверителност|общи условия/, "the site footer"],
  [/^Хумор$/m, "the „Хумор“ section"],
  [/информационен e-mail бюлетин/, "the newsletter box"],
];
const dirty = [];
for (const u of act.units) {
  for (const [re, what] of FURNITURE_SIGNATURES) {
    if (re.test(u.textBg)) dirty.push(`  ${u.ref}: ${what}`);
  }
}
if (dirty.length > 0) {
  throw new Error(
    `page furniture in ${dirty.length} place(s) — refusing to emit an act that would ` +
      `hand a student a lex.bg forum post:\n${dirty.join("\n")}`,
  );
}
writeFileSync(path.join(OUT, "acts", "naredba-24.json"), JSON.stringify(act, null, 1) + "\n", "utf8");
console.log(`acts/naredba-24.json: ${act.units.length} units — ${act.units.map((u) => u.ref).join(", ")}`);
