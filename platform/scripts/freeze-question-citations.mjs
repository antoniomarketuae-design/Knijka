#!/usr/bin/env node
/**
 * Freeze the QUESTION BANK's citations — src/modules/lesson/clearanceQuestionCitations.ts.
 *
 * WHY A THIRD PIN. `freeze-lesson-citations.mjs` did this for concepts.json and
 * the neighbouring door was assumed shut, five times over now. It was not.
 * A question's `status` field answers „has a person approved this row?" — the
 * check `narration.ts` makes and `clearance.ts` calls `signed`. It answers
 * NOTHING about the citation printed beside it, and the citation is not an
 * opinion a signature can settle: what settles it is whether the article is in
 * content/law/acts and whether it says this.
 *
 * A question's `lawRefs` are student-facing on FIVE surfaces that do not go
 * through the classroom at all — `components/theory/WhyPanel.tsx`,
 * `components/exam/ExamResultView.tsx`, `sim/lesson-ui/MicroQuizOverlay.tsx`,
 * `components/hazard/HazardReveal.tsx` and `tutor/TutorChatCitations.ts` — so
 * a citation could be edited to anything at all and every existing check stayed
 * green. It had: of the 608 distinct citation strings across the 1,089 rows,
 * 269 NAMED AN ARTICLE THE RESOLVER CANNOT FIND, 110 of them on rows a student
 * is served today. ППЗДвП accounted for 106 and Наредба № РД-02-21-1 for 88 —
 * both catalogued in content/law/sources.json with live URLs, neither ingested,
 * so the product cited an article number in a document it cannot show.
 *
 * THE THREE STATES A PINNED CITATION MAY BE IN, and nothing else:
 *
 *   RESOLVABLE  the act is one we ship full text for and `resolveLawRef` finds
 *               the unit. The article can be quoted at the student.
 *
 *   NUMBERLESS  the act is one we do NOT hold, so the ref names NO article
 *               number — „ППЗДвП надлъжна пътна маркировка", „НК раздел
 *               „Престъпления по транспорта"", „Наредба № РД-02-21-1/23.11.2023
 *               знак Д12". The founder's standing ruling, applied to citations:
 *               show the rule and the act with no number rather than a guessed
 *               one. A question mark is the worst of the three — it neither
 *               informs nor admits, and 45 of them were the exact defect the
 *               concepts wave removed.
 *
 *   PENDING     the act is on disk but not yet wired into `ACT_IDS`
 *               (Наредба № 24). Numbered, read out of the file, listed rather
 *               than blessed so that wiring it in removes the exception.
 *
 * A row that is none of the three is refused here and never reaches the table,
 * so „ППЗДвП чл. 31" and „НК чл. 343б?" cannot be frozen even by accident.
 *
 *   node scripts/freeze-question-citations.mjs            # re-pin
 *   node scripts/freeze-question-citations.mjs --check    # exit 1 if stale
 *
 * WHAT THIS PIN DOES NOT COVER, said out loud rather than left to be discovered
 * a sixth time: `explanationBg` prose. 210 explanations name an article number
 * inside the sentence („…(НК чл. 343б)…"), 62 of them on approved rows. That is
 * the same uncheckable claim in a place no citation pin can see, and the count
 * is printed on every run so it stays visible until somebody rewrites them.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(HERE, "..", "..", "content");
const OUT_FILE = path.resolve(
  HERE, "..", "src", "modules", "lesson", "clearanceQuestionCitations.ts",
);
const check = process.argv.includes("--check");

/** Acts we ship full text for — must mirror lib/content/law/corpus.ts ACT_IDS. */
const ACT_IDS = ["zdvp", "naredba-iz-2539", "naredba-38"];

/** Numbered refs whose act is on disk but not yet wired into ACT_IDS. */
const PENDING_CORPUS = new Set(["Наредба № 24"]);

// Mirrors lib/content/sanitize.ts — the loader strips these before any student
// sees the string, so the pin must cover the sanitised text.
const STAFF_ANNOTATION_RE =
  /\[\s*(?:REVIEW|TODO|FIXME|TBD|XXX|HACK|NOTE|CHECK|VERIFY|QA)\s*(?::[^\]]*)?\]/g;

function sanitize(text) {
  if (!text.includes("[")) return text;
  STAFF_ANNOTATION_RE.lastIndex = 0;
  if (!STAFF_ANNOTATION_RE.test(text)) return text;
  return text.replace(STAFF_ANNOTATION_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

/** The exact line a student sees (`${ref.act} ${ref.ref}`, every surface). */
const citationLine = (ref) => sanitize(`${ref.act} ${ref.ref}`);

const fingerprint = (text) =>
  createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 16);

const citationPin = (row) => fingerprint(row.lawRefs.map(citationLine).join("\n"));

// --- the corpus, read the same way corpus.ts reads it -----------------------

const acts = new Map();
for (const id of ACT_IDS) {
  acts.set(id, JSON.parse(readFileSync(path.join(CONTENT, "law", "acts", `${id}.json`), "utf8")));
}

/**
 * The act-name aliases, LIFTED FROM corpus.ts rather than retyped — the alias
 * for Наредба № Iз-2539 glues a LATIN „i" to a Cyrillic „з" and the content
 * spells it with a LATIN capital „I". A hand copy that looks identical resolves
 * nothing, and this script would then „refuse" a citation the real resolver
 * accepts.
 */
function actAliasesFromCorpus() {
  const src = readFileSync(
    path.resolve(HERE, "..", "src", "lib", "content", "law", "corpus.ts"),
    "utf8",
  );
  const block = /const ACT_ALIASES[\s\S]*?\n\];/.exec(src);
  if (block === null) throw new Error("corpus.ts: could not find ACT_ALIASES");
  const out = [];
  for (const m of block[0].matchAll(/\[\/(.*?)\/(i?),\s*"([a-z0-9-]+)"\]/g)) {
    out.push([new RegExp(m[1], m[2]), m[3]]);
  }
  if (out.length === 0) throw new Error("corpus.ts: ACT_ALIASES parsed to nothing");
  return out;
}

const ACT_ALIASES = actAliasesFromCorpus();

function actIdFor(name) {
  const trimmed = name.trim();
  for (const [re, id] of ACT_ALIASES) if (re.test(trimmed)) return id;
  return null;
}

function normaliseUnitRef(ref) {
  const s = ref.trim().replace(/\?+\s*$/, "").trim();
  const art = /^(?:чл|Чл|ЧЛ)\.?\s*(\d+)((?:[а-я]\d*)?)(?![а-яА-Я])/.exec(s);
  if (art) return `чл. ${art[1]}${art[2] ?? ""}`;
  const para = /^§\s*(\d+)([а-я]?)(?![а-яА-Я])/.exec(s);
  if (para) return `§ ${para[1]}${para[2] ?? ""}`;
  const annex = /^(?:приложение|Приложение|ПРИЛОЖЕНИЕ)\s*№?\s*(\d+[а-я]?)(?![а-яА-Я])/.exec(s);
  if (annex) return `приложение № ${annex[1]}`;
  return null;
}

/** An article/annex/§ NUMBER — the thing the founder's ruling forbids guessing. */
const namesAnArticle = (ref) => normaliseUnitRef(ref) !== null;

function resolves(lawRef) {
  const actId = actIdFor(lawRef.act);
  if (actId === null) return false;
  const unit = normaliseUnitRef(lawRef.ref);
  if (unit === null) return false;
  return acts.get(actId).units.some((u) => u.ref === unit);
}

/** RESOLVABLE | NUMBERLESS | PENDING | REFUSED — with the reason, for the log. */
function classify(lawRef) {
  if (`${lawRef.act} ${lawRef.ref}`.includes("?")) return ["REFUSED", "carries a question mark"];
  if (resolves(lawRef)) return ["RESOLVABLE", null];
  if (PENDING_CORPUS.has(lawRef.act.trim())) return ["PENDING", "act on disk, not in ACT_IDS"];
  if (!namesAnArticle(lawRef.ref)) return ["NUMBERLESS", null];
  return ["REFUSED", "names an article we cannot resolve — drop the number"];
}

/**
 * A RESOLVABLE citation names an article we hold; it may still name an ал./т./б.
 * that article does not have, and `resolveLawRef` would never notice because it
 * truncates „чл. 21, ал. 3" to „чл. 21". So the sub-reference is checked against
 * the verbatim text: the alineas an article really has are its bare „(N)"
 * markers, its points the „N." that open a line, its letters the „а)" forms.
 * Returns a problem string, or null when the sub-refs are real.
 *
 * (JS \b is ASCII-only and never fires next to Cyrillic — the separators are
 * matched explicitly. Written the other way this check silently passes on
 * everything, which is how it read on its first run.)
 */
function subRefProblem(lawRef) {
  const actId = actIdFor(lawRef.act);
  if (actId === null) return null;
  const unitRef = normaliseUnitRef(lawRef.ref);
  if (unitRef === null) return null;
  const unit = acts.get(actId).units.find((u) => u.ref === unitRef);
  if (unit === undefined) return null;
  const text = unit.textBg
    .replace(/­/g, "")
    .replace(/[   ]/g, " ");
  const flat = text.replace(/\s+/g, " ").trim();

  const problems = [];
  const al = /ал\.\s*(\d+)/.exec(lawRef.ref);
  if (al !== null) {
    const have = new Set([...flat.matchAll(/\((\d{1,2})\)/g)].map((m) => Number(m[1])));
    if (have.size === 0) have.add(1); // single-alinea prose carries no "(1)"
    if (!have.has(Number(al[1]))) {
      problems.push(`no ал. ${al[1]} (has ${[...have].sort((a, b) => a - b).join(",")})`);
    }
  }
  const pt = /(?:^|[\s,;])т\.\s*(\d+)/.exec(lawRef.ref);
  if (pt !== null) {
    const have = new Set();
    for (const line of text.split("\n")) {
      const m = /^\s*(\d{1,3})\.\s/.exec(line.replace(/\s+/g, " ").trim());
      if (m) have.add(Number(m[1]));
    }
    for (const m of flat.matchAll(/(?:;|:)\s*(\d{1,3})\.\s/g)) have.add(Number(m[1]));
    if (!have.has(Number(pt[1]))) problems.push(`no т. ${pt[1]}`);
  }
  const lt = /(?:^|[\s,;])б\.\s*[„"']?([а-я])/.exec(lawRef.ref);
  if (lt !== null) {
    const have = new Set([...flat.matchAll(/(?:^|[\s;:])([а-я])\)\s/g)].map((m) => m[1]));
    if (!have.has(lt[1])) problems.push(`no б. „${lt[1]}" (has ${[...have].join(",") || "none"})`);
  }
  return problems.length > 0 ? problems.join("; ") : null;
}

// --- run --------------------------------------------------------------------

const questionsDir = path.join(CONTENT, "questions");
const rows = [];
for (const file of readdirSync(questionsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  for (const q of JSON.parse(readFileSync(path.join(questionsDir, file), "utf8"))) {
    rows.push(q);
  }
}
rows.sort((a, b) => a.id.localeCompare(b.id));

const source = readFileSync(OUT_FILE, "utf8");
const current = new Map();
for (const [, id, hash] of source.matchAll(/^ {2}"(q-[a-z0-9-]+)": "([0-9a-f]{16})",/gm)) {
  current.set(id, hash);
}

const refused = [];
const counts = { RESOLVABLE: 0, NUMBERLESS: 0, PENDING: 0 };
for (const row of rows) {
  for (const lawRef of row.lawRefs ?? []) {
    const [verdict, why] = classify(lawRef);
    if (verdict === "REFUSED") {
      refused.push(`${row.id} [${row.status}]: „${citationLine(lawRef)}" — ${why}`);
      continue;
    }
    counts[verdict] += 1;
    const sub = subRefProblem(lawRef);
    if (sub !== null) {
      refused.push(`${row.id} [${row.status}]: „${citationLine(lawRef)}" — ${sub}`);
    }
  }
}

if (refused.length > 0) {
  console.error(
    `refusing to freeze — ${refused.length} citation(s) are neither resolvable nor numberless:`,
  );
  for (const line of refused) console.error(`  ${line}`);
  process.exit(1);
}

const moved = [];
for (const row of rows) {
  const pin = citationPin(row);
  if (current.get(row.id) === pin) continue;
  moved.push({ row, from: current.get(row.id) ?? "(new)", to: pin });
}

for (const m of moved) {
  console.log(`\nRE-PIN ${m.row.id}  ${m.from} → ${m.to}`);
  console.log("  READ THESE AGAINST THE ACT BEFORE YOU COMMIT — a student sees them:");
  for (const lawRef of m.row.lawRefs) {
    const [verdict] = classify(lawRef);
    console.log(`    ${verdict.padEnd(11)} „${citationLine(lawRef)}"`);
  }
}

console.log(
  `\n${counts.RESOLVABLE} resolvable, ${counts.NUMBERLESS} numberless, ${counts.PENDING} pending corpus`,
);

// The two things this pin CANNOT cover, counted so they stay visible.
const UNHELD_ACTS = [
  "ППЗДвП", "Правилника за прилагане", "Правилник за прилагане",
  "Наредба № РД-02-21-1", "Наредба РД-02-21-1", "РД-02-21-1",
  "НК", "Наказателния кодекс", "Наказателен кодекс",
  "Кодекс за застраховането", "Кодекса за застраховането",
  "Закон за пътищата", "Закона за пътищата",
  "ЗБЛД", "ЗАНН", "Наредба № 37", "Наредба № 2/2001", "Наредба № 3/2011",
  "Наредба № 3/2010", "Наредба № I-157", "Наредба № Iз-41", "Наредба № 24",
  "Закон за закрила на детето", "Закона за закрила на детето",
];
const NUM = "(?:чл\\.|§|[Пп]риложение)\\s*№?\\s*\\d+[а-я]?";
const UNHELD_INLINE = UNHELD_ACTS.flatMap((act) => {
  const a = act.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [new RegExp(`${NUM}[^.!?]{0,45}?(?:от\\s+)?${a}`), new RegExp(`${a}[^.!?]{0,45}?${NUM}`)];
});
const namesArticleInProse = (row) => {
  const texts = [row.textBg, row.explanationBg, ...(row.options ?? []).map((o) => o.textBg)];
  return texts.some((t) => t && UNHELD_INLINE.some((re) => re.test(sanitize(t))));
};
const prose = rows.filter(namesArticleInProse);
console.log(
  `NOT COVERED BY THIS PIN: ${prose.length} rows name an article number of an un-held act ` +
  `INSIDE student-facing prose (${prose.filter((r) => r.status === "approved").length} approved) — ` +
  `no citation pin can see inside a sentence`,
);
const annexLocators = rows.flatMap((r) =>
  (r.lawRefs ?? []).filter((l) => /^\s*прил\.\s*№?\s*\d/.test(l.ref)),
);
console.log(
  `NOT COVERED BY THE „no number" RULE: ${annexLocators.length} refs use the abbreviated ` +
  `„прил. № N" form, which names an annex we cannot open`,
);

if (check) {
  if (moved.length === 0) {
    console.log(`\ncitations are current: ${current.size} pinned`);
    process.exit(0);
  }
  console.error(`\n${moved.length} stale. Run without --check to re-freeze.`);
  process.exit(1);
}

if (moved.length === 0 && current.size === rows.length) {
  console.log(`\nnothing to do: ${current.size} pinned, all current`);
  process.exit(0);
}

const body = rows
  .map((r) => `  ${JSON.stringify(r.id)}: "${citationPin(r)}", // ${r.lawRefs.map(citationLine).join(" · ")}`)
  .join("\n");
const rewritten = source.replace(
  /(CARRIED_QUESTION_CITATIONS: Readonly<Record<string, string>> = \{)[\s\S]*?(\n\};)/,
  (_m, head, tail) => `${head}\n${body}${tail}`,
);
if (rewritten === source) {
  console.error("could not splice the table — clearanceQuestionCitations.ts shape changed");
  process.exit(1);
}
writeFileSync(OUT_FILE, rewritten, "utf8");
console.log(`\nwrote ${rows.length} citation pins to ${path.relative(process.cwd(), OUT_FILE)}`);
