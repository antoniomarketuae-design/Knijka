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

let context = null;
for (const line of clean) {
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
writeFileSync(path.join(OUT, "acts", "naredba-24.json"), JSON.stringify(act, null, 1) + "\n", "utf8");
console.log(`acts/naredba-24.json: ${act.units.length} units — ${act.units.map((u) => u.ref).join(", ")}`);
