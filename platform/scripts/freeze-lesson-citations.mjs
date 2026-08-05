#!/usr/bin/env node
/**
 * Freeze the classroom's CITATIONS — src/modules/lesson/clearanceCitations.ts.
 *
 * WHY A SECOND PIN. `clearanceCarry.ts` pins `summaryBg`, and only `summaryBg`.
 * A concept's `lawRefs` ride out of `resolve.ts` on the same utterance, get
 * assembled by `classroom/lessonToRoom.ts` into „`${act} ${ref}`" and rendered
 * by `Transcript.tsx` beside the sentence — so a citation could be edited to
 * anything at all and every existing check would stay green. It happened: 45 of
 * the 113 distinct citation strings a student could see carried a QUESTION MARK
 * („ЗДвП чл. 25?", „ППЗДвП чл. 31?"), and two more pointed at acts this repo
 * does not hold while reading as settled — c-railway-crossing cited „ППЗДвП
 * чл. 109" for a mandatory-stop list, and ЗДвП чл. 51, ал. 3 covers only a
 * crossing WITHOUT barriers.
 *
 * WHAT THIS PIN CLAIMS, and it is not what the carry claims. The carry says „a
 * person read this sentence". A citation cannot be settled that way, because
 * the thing that settles it is not an opinion — it is whether the article is
 * really in content/law/acts and really says this. So the authority here is the
 * CORPUS, and it is re-proved on every test run
 * (`__tests__/clearanceCitations.test.ts`), not trusted from a signature:
 *
 *   RESOLVABLE  the act is one we ship full text for (zdvp, naredba-iz-2539,
 *               naredba-38) and `resolveLawRef` finds the unit. 179 of 213.
 *
 *   NUMBERLESS  the act is one we do NOT hold, and the ref therefore names no
 *               article number at all — „ППЗДвП светлинни сигнали за
 *               регулиране на движението", „Наредба № РД-02-21-1/2023 група
 *               А". This is the founder's standing ruling, applied to
 *               citations: show the rule and the article with NO NUMBER rather
 *               than a guessed one. A question mark is the worst of both — it
 *               neither informs nor admits.
 *
 * A row that is neither is refused by this script and never reaches the table,
 * so „ЗДвП чл. 999" and „ППЗДвП чл. 31?" cannot be frozen even by accident.
 *
 *   node scripts/freeze-lesson-citations.mjs            # re-pin
 *   node scripts/freeze-lesson-citations.mjs --check    # exit 1 if stale
 *
 * The exception the rule has to admit: `Наредба № 24` ships as
 * content/law/acts/naredba-24.json but is not yet registered in sources.json,
 * so `ACT_IDS` cannot load it and its six first-aid curriculum refs resolve to
 * nothing. They are numbered, they are correct (чл. 9 lists exactly those
 * curriculum points, verbatim in that file), and they belong to the first-aid
 * wave — so they are listed in PENDING_CORPUS below rather than silently
 * blessed or silently stripped.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(HERE, "..", "..", "content");
const OUT_FILE = path.resolve(HERE, "..", "src", "modules", "lesson", "clearanceCitations.ts");
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

/** The exact line a student sees (lessonToRoom.ts `${first.act} ${first.ref}`). */
const citationLine = (ref) => sanitize(`${ref.act} ${ref.ref}`);

const fingerprint = (text) =>
  createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 16);

const citationPin = (concept) => fingerprint(concept.lawRefs.map(citationLine).join("\n"));

// --- the corpus, read the same way corpus.ts reads it -----------------------

const acts = new Map();
for (const id of ACT_IDS) {
  acts.set(id, JSON.parse(readFileSync(path.join(CONTENT, "law", "acts", `${id}.json`), "utf8")));
}

/**
 * The act-name aliases, LIFTED FROM corpus.ts rather than retyped.
 *
 * Retyping them is how this script gets silently wrong: the alias for
 * Наредба № Iз-2539 is written with a LATIN „i" glued to a Cyrillic „з", and
 * the concepts.json rows spell it with a LATIN capital „I". Two confusables in
 * one token — а hand copy that looks identical resolves nothing, and the script
 * would then „refuse" a citation the real resolver accepts. Reading the literal
 * out of the module that owns it cannot drift.
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

// --- run --------------------------------------------------------------------

const concepts = JSON.parse(readFileSync(path.join(CONTENT, "concepts.json"), "utf8"));
const source = readFileSync(OUT_FILE, "utf8");
const current = new Map();
for (const [, id, hash] of source.matchAll(/^ {2}"(c-[a-z0-9-]+)": "([0-9a-f]{16})",/gm)) {
  current.set(id, hash);
}

const refused = [];
const counts = { RESOLVABLE: 0, NUMBERLESS: 0, PENDING: 0 };
for (const concept of concepts) {
  for (const lawRef of concept.lawRefs) {
    const [verdict, why] = classify(lawRef);
    if (verdict === "REFUSED") refused.push(`${concept.id}: „${citationLine(lawRef)}" — ${why}`);
    else counts[verdict] += 1;
  }
}

if (refused.length > 0) {
  console.error(`refusing to freeze — ${refused.length} citation(s) are neither resolvable nor numberless:`);
  for (const line of refused) console.error(`  ${line}`);
  process.exit(1);
}

const moved = [];
for (const concept of concepts) {
  const pin = citationPin(concept);
  if (current.get(concept.id) === pin) continue;
  moved.push({ concept, from: current.get(concept.id) ?? "(new)", to: pin });
}

for (const m of moved) {
  console.log(`\nRE-PIN ${m.concept.id}  ${m.from} → ${m.to}`);
  console.log("  READ THESE AGAINST THE ACT BEFORE YOU COMMIT — a student sees them:");
  for (const lawRef of m.concept.lawRefs) {
    const [verdict] = classify(lawRef);
    console.log(`    ${verdict.padEnd(11)} „${citationLine(lawRef)}"`);
  }
}

console.log(
  `\n${counts.RESOLVABLE} resolvable, ${counts.NUMBERLESS} numberless, ${counts.PENDING} pending corpus`,
);

if (check) {
  if (moved.length === 0) {
    console.log(`citations are current: ${current.size} pinned`);
    process.exit(0);
  }
  console.error(`\n${moved.length} stale. Run without --check to re-freeze.`);
  process.exit(1);
}

if (moved.length === 0 && current.size === concepts.length) {
  console.log(`nothing to do: ${current.size} pinned, all current`);
  process.exit(0);
}

const body = [...concepts]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((c) => `  "${c.id}": "${citationPin(c)}", // ${c.lawRefs.map(citationLine).join(" · ")}`)
  .join("\n");
const rewritten = source.replace(
  /(CARRIED_CONCEPT_CITATIONS: Readonly<Record<string, string>> = \{\n)[\s\S]*?(\n\} as const;)/,
  (_m, head, tail) => `${head}${body}${tail}`,
);
if (rewritten === source) {
  console.error("could not splice the table — clearanceCitations.ts shape changed");
  process.exit(1);
}
writeFileSync(OUT_FILE, rewritten, "utf8");
console.log(`wrote ${concepts.length} citation pins to ${path.relative(process.cwd(), OUT_FILE)}`);
