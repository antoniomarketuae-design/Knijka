/**
 * THE CLAIM GATE — every legal claim a student can read, traced back to law.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS, IN TWO DEFECTS
 * ===========================================================================
 *
 * (1) THE 50-METRE MYTH. The product taught, as law, that stopping is banned
 *     "within 50 metres either side of a level crossing". It is not. ЗДвП
 *     чл. 98, ал. 1, т. 4 bans stopping "върху трамвайни и железопътни линии
 *     или в такава близост до тях, която може да затрудни движението на
 *     релсовите превозни средства" — no metre figure exists in it at all. The
 *     product's OWN question bank keys that answer `correct:false` and calls
 *     the number «ИЗМИСЛЕНО ЧИСЛО, най-тежкият единичен дефект в банката».
 *     So one half of the product convicted a seventeen-year-old under a rule
 *     the other half taught them was invented. Nothing connected the two
 *     halves, because nothing had ever enumerated both.
 *
 * (2) THE PAST-THE-COMMA FAILURE. Four consecutive rounds quoted чл. 51,
 *     ал. 4 and stopped reading at a comma:
 *
 *       „…спират на разстояние не по-малко от 2 метра преди първата релса,
 *        А КОГАТО ИМА БАРИЕРИ - НА 1 МЕТЪР ОТ ТЯХ."
 *
 *     Each round then asserted «единственото разстояние, което законът пише за
 *     прелез, са тези два метра» — a universal negative that the second half of
 *     the very same sentence refutes. On `pk-rail-v1` the authors set
 *     `guarded:true` with the barrier arm at y=197, so the branch that governs
 *     there is the ONE metre, not the two. Every round fixed the surfaces it
 *     was handed, passed its own tests, and was refuted by an adversarial pass
 *     that found the same false claim alive on a surface nobody had listed.
 *     THE CLASS WAS NOT THINNING; IT WAS MOVING.
 *
 * ADR-002 is the governing rule and it is absolute: the product may NEVER
 * free-recall Bulgarian law. Every claim is retrieved from
 * `content/law/acts/*.json` (or `content/signs/signs.json`) and cited.
 *
 * ===========================================================================
 * WHAT MAKES THIS DIFFERENT FROM THE FIVE ROUNDS THAT FAILED
 * ===========================================================================
 *
 * A. IT ENUMERATES FROM THE TREE, NOT FROM A LIST OF FILES. A list of files is
 *    precisely how five rounds each missed a surface — the last one was a trace
 *    replay caption in `platform/public/traces/**`, a directory no human index
 *    named. This walks `content/`, `platform/src/` and the shipped half of
 *    `platform/public/`, treats EVERY Cyrillic string it finds as in scope by
 *    default, and requires every exclusion to be a NAMED rule with a reason
 *    (`FILE_EXCLUSIONS`, `FIELD_EXCLUSIONS`). Default-in, not default-out: a
 *    new directory nobody told the gate about is covered on the day it appears.
 *
 * B. RESOLVING A CITATION IS NOT THE SAME AS CHECKING IT. The existing gate,
 *    `modules/sim/__tests__/law-citations.test.ts`, proves the article EXISTS.
 *    That is necessary and it is not enough: it would have passed all four
 *    past-the-comma rounds, because чл. 51 exists and „2 метра" is quoted
 *    correctly. So this gate checks what the article SAYS:
 *      · a quoted fragment must appear verbatim in the cited unit;
 *      · a metre figure offered as a rule must appear in an article the record
 *        cites;
 *      · and — THE CHECK BUILT FOR DEFECT (2) — if the cited sentence carries a
 *        SECOND branch after „а когато / освен ако / а при …" with a different
 *        figure, the claim must state that branch too. That is `checkCompanion
 *        Branches`, and it is the one check with no allow-list at all.
 *
 * C. A UNIVERSAL NEGATIVE CANNOT BE VERIFIED MECHANICALLY, SO IT IS PINNED.
 *    «единственото разстояние, което законът пише…» is unfalsifiable by any
 *    scanner: proving the law says nothing else about crossings means reading
 *    all 288 articles and knowing what "else" means. So every universal
 *    negative about the law must appear in `content/law/claim-ledger.json`
 *    with a human's reasoning beside it, and a NEW one fails until somebody
 *    adds it deliberately. The ledger distinguishes `accepted` (read and
 *    justified) from `inherited` (frozen at gate creation, NOT reviewed) and
 *    says so in every entry, because a ledger that pretends to be a review is
 *    the same lie one level up.
 *
 * D. THE GATE IS ITSELF UNDER TEST. This repo has been bitten by a census test
 *    that had never run, whose "two-way closure" had never compared anything,
 *    and by an ownership audit that certified a list that had stopped deciding
 *    anything. A scanner that matches nothing passes forever. So:
 *      · floors on files, strings, claims and EVERY surface class;
 *      · a class that vanishes fails BY NAME, and a class that appears and is
 *        not registered fails too;
 *      · negative controls drive each classifier with synthetic claims of the
 *        exact historical shapes, and the gate fails if they PASS;
 *      · the ground truth itself is asserted — if чл. 51's text ever stops
 *        containing „а когато има бариери", the companion check would go quiet
 *        in the reassuring direction, so that is a red too.
 *
 * ===========================================================================
 * WHAT THIS GATE DELIBERATELY DOES NOT DO — read this before widening it
 * ===========================================================================
 *
 * · It does not read code comments or English design notes. Those are
 *   PROVENANCE: they record which article a rule came from so the next person
 *   can check it. The ruling is about what reaches a seventeen-year-old.
 * · It does not judge `correct:false` answer options. A distractor is a false
 *   statement ON PURPOSE; convicting the bank of writing one would be a
 *   category error and would make the gate an enemy of the exam format.
 * · It does not judge an article number on an act the corpus cannot open
 *   (ППЗДвП, Наредба № РД-02-21-1, НК, КЗ …) as TRUE or FALSE — nobody here
 *   can. It COUNTS them per surface against a frozen ceiling, so the
 *   uncheckable population can only shrink. Repairing them is the founder's
 *   standing ruling (keep the rule and the act, drop the number), not this
 *   gate's job.
 * · It does not verify prose against `content/signs/signs.json` sign MEANINGS
 *   yet. All 77 rows are `draft`/`needs-review` and `signClearance` withholds
 *   every one, so there is no student-facing sign prose to check today. The
 *   day one row is signed, the last test in this file („no sign meaning has
 *   gone live behind the gate's back") goes red and names the file to widen.
 *   That is a gate on the ASSUMPTION, not a promise about the prose.
 * · It does not re-check the verbatim-quote invariants that
 *   `content/law/penalties.json` already carries (the loader compares every
 *   `quoteBg` against the act and refuses the file otherwise) — two checkers
 *   of the same fact drift, and the loader's is the one that can refuse a boot.
 * · It does not judge a quotation whose act was only INFERRED. „…(чл. 24,
 *   ал. 2)" with no act beside it could be ЗДвП, ЗАНН or НК; the binder marks
 *   it unpinned and the fidelity check declines. That is a deliberate loss of
 *   recall bought with precision, because the alternative — convicting a
 *   sentence of misquoting an act it never named — is the false red that gets a
 *   gate deleted. The COMPLETENESS half has no such restriction: a fragment
 *   that is verbatim in a cited article IS a quotation of it, whoever named it.
 * · It does not run the arithmetic/figure classifier from `../proseFigures.ts`
 *   over these surfaces. That is a real gap, named here rather than left to be
 *   discovered: `proseFigures` accounts for EVERY digit-run and would be the
 *   right next widening, but it needs per-record evidence bags that only the
 *   penalty bank has today.
 * · It does not read COMPOUND word numerals — „метър и половина" (1,5 m),
 *   „метър и деветнайсет" (1,19 m). WORD_NUMERALS maps whole numbers only;
 *   a fraction would have to be guessed, and guessing figures is the defect
 *   class itself. 282 word-numeral metre phrases live in 143 files and the
 *   compound ones are a minority of them, but this IS the next widening after
 *   proseFigures, and it is written down rather than left to be met.
 *
 * WIDENED 2026-09-10 — WORD NUMERALS, and why it matters more than it sounds.
 * Every check here read digits only, so „законът иска поне ДВА МЕТРА … (чл. 51,
 * ал. 4)" — the fifth surviving copy of the past-the-comma defect, in
 * sc-pk-rail-ban's replay caption — produced no metre hit, and therefore no
 * grounding check and no companion check. The gate written to catch that exact
 * sentence could not see it. The class had not thinned; it had moved one
 * notation sideways, which is the same thing five rounds kept meeting. The
 * widening found it in all three places it lives (the recorded trace, the
 * shipped mirror, and the GENERATOR that writes both) plus three more, and it
 * immediately exposed a second wrong assumption of its own: the acts are not
 * digits-only either (ЗДвП чл. 66, ал. 1 „на ЕДИН МЕТЪР зад трамвая"), so the
 * statute reader had to widen too or it would convict true claims. Both
 * directions are locked by negative controls.
 *
 * Run it alone:  npx vitest run src/lib/content/law/claimGate.test.ts
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACT_IDS, actIdForActName, getArticle, normaliseUnitRef } from "@/lib/content/law";
import { stripStaffAnnotations } from "../sanitize";

// ---------------------------------------------------------------------------
// Where the repo is — discovered, never hardcoded
// ---------------------------------------------------------------------------

/**
 * Walk up from this file until a directory holds BOTH `content/law/acts` and
 * `platform/src`. Two markers, not one: a single marker is satisfied by a
 * fixture directory, and a gate that silently scans a fixture is the "matches
 * nothing, passes forever" failure this file exists to prevent.
 */
function findRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    if (
      fs.existsSync(path.join(dir, "content", "law", "acts")) &&
      fs.existsSync(path.join(dir, "platform", "src"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("claimGate: repo root not found (no ancestor holds content/law/acts + platform/src)");
}

const REPO = findRepoRoot();
const rel = (abs: string): string => path.relative(REPO, abs).replace(/\\/g, "/");
const SELF = rel(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(REPO, "content", "law", "claim-ledger.json");

// ---------------------------------------------------------------------------
// Normalisation — kept byte-identical to the corpus loader's on purpose
// ---------------------------------------------------------------------------

const CYRILLIC = /[А-Яа-яЁё]/;

function norm(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// SCOPE — default IN. Every exclusion is named and carries its reason.
// ---------------------------------------------------------------------------

interface Rule<T> {
  name: string;
  why: string;
  test: (subject: T) => boolean;
}

const FILE_EXCLUSIONS: ReadonlyArray<Rule<string>> = [
  {
    name: "self",
    why: "this file's own negative controls are Bulgarian legal claims by design — the specimen jar is not the specimen",
    test: (p) => p === SELF,
  },
  {
    name: "non-text",
    why: "images, fonts, GLB, CSS: no prose can hide in them",
    test: (p) => !/\.(ts|tsx|json)$/.test(p),
  },
  {
    name: "law-corpus",
    why: "content/law is the RETRIEVAL GROUND — verbatim statute plus the penalty bank the loader already verifies quote-by-quote against it. Checking the ground against itself proves nothing and would fail on the law's own numbers.",
    test: (p) => p.startsWith("content/law/"),
  },
  {
    name: "audit-ledger",
    why: "content/audits/* is the adjudication record: it QUOTES defects verbatim in order to file them. No loader imports it and no route renders it.",
    test: (p) => p.startsWith("content/audits/"),
  },
  {
    name: "review-queue",
    why: "content/review/FLAGGED-FOR-REVIEW is the human queue — its whole content is claims awaiting judgement, stated so a reviewer can judge them",
    test: (p) => p.startsWith("content/review/"),
  },
  {
    name: "tests",
    why: "a test asserting a false claim is a separate (real) hazard, but convicting fixtures here would drown the findings that reach students",
    test: (p) => /(^|\/)__tests__\//.test(p) || /\.test\.(ts|tsx)$/.test(p),
  },
  {
    name: "dev-rigs",
    why: "platform/src/app/dev/* is reachable only at /dev and is not in the student flow (its fixtures ARE copied by hand from real content and do drift — that is a known, named gap)",
    test: (p) => p.startsWith("platform/src/app/dev/"),
  },
  {
    name: "public-not-shipped-text",
    why: "platform/public holds mostly binaries; only traces/, world/ and clips/ carry prose the browser fetches",
    test: (p) =>
      p.startsWith("platform/public/") && !/^platform\/public\/(traces|world|clips)\//.test(p),
  },
];

const FIELD_EXCLUSIONS: ReadonlyArray<Rule<string>> = [
  {
    name: "reviewer-notes",
    why: "notesBg / reviewerCaveat are written TO US, not to a learner — several of them exist precisely to flag a claim as unsafe, and convicting the warning is backwards",
    test: (f) => /(^|\.)notesBg(\[|$|\.)/.test(f) || /(^|\.)reviewerCaveat/.test(f),
  },
  {
    name: "provenance-forBg",
    why: "grounds[].forBg records WHY a beat is grounded in a source. It is authoring provenance; deleting numbers there would destroy the trail back to the source.",
    test: (f) => /(^|\.)forBg(\[|$|\.)/.test(f),
  },
  {
    name: "identifiers",
    why: "ids, slugs and file paths are charset-locked by their schemas and carry no prose",
    test: (f) => /(^|\.)(id|slug|path|template|src|href|file)$/.test(f),
  },
  {
    name: "citation-coordinates",
    why: "lawRefs[].act / .ref and citationBg ARE the citation, not a claim about it. They are checked as citations (checkCitationsResolve) rather than read as sentences.",
    test: (f) =>
      /(^|\.)(lawRef|lawRefs|sourceRefs|grounds|realWorldRefs)(\[\d+\])?\.(ref|act)$/.test(f) ||
      /(^|\.)(lawRef|citationBg)$/.test(f),
  },
  {
    name: "verbatim-source-quote",
    why: "quoteBg / contextQuoteBg are verbatim excerpts of a SOURCE (the act, an ERC guideline, a Червен кръст page). They are evidence, not assertion; the law loader already pins the ones that quote an act.",
    test: (f) => /(^|\.)quoteBg$/.test(f) || /(^|\.)contextQuoteBg$/.test(f),
  },
];

/**
 * SURFACE CLASSES — the anti-neutralisation registry.
 *
 * `min` is a FLOOR measured on 2026-09-10, set below the measurement so that
 * legitimate repair work (which removes claims) does not go red, but a surface
 * DISAPPEARING does. A class in the tree that is not registered here is also a
 * failure: a new surface must be looked at by a human, not absorbed silently.
 */
const SURFACE_CLASSES: ReadonlyArray<{ name: string; min: number; test: (p: string) => boolean }> = [
  { name: "content-questions", min: 700, test: (p) => p.startsWith("content/questions/") },
  { name: "content-lessons", min: 15, test: (p) => p.startsWith("content/lessons/") },
  { name: "content-traces", min: 80, test: (p) => p.startsWith("content/traces/") },
  { name: "public-traces", min: 80, test: (p) => p.startsWith("platform/public/traces/") },
  { name: "content-world", min: 12, test: (p) => p.startsWith("content/world/") },
  { name: "public-world", min: 12, test: (p) => p.startsWith("platform/public/world/") },
  // 0 is MEASURED, not a stub: manifest.json's clips[].titleBg reach the
  // UNAUTHENTICATED marketing page, and today not one of them carries a legal
  // marker. The class is registered so that the day one does, it is covered.
  { name: "public-clips", min: 0, test: (p) => p.startsWith("platform/public/clips/") },
  { name: "content-other", min: 30, test: (p) => p.startsWith("content/") },
  { name: "sim-rules", min: 350, test: (p) => p.startsWith("platform/src/modules/sim/rules/") },
  { name: "sim-lessons", min: 320, test: (p) => p.startsWith("platform/src/modules/sim/lessons/") },
  { name: "sim-traces", min: 80, test: (p) => p.startsWith("platform/src/modules/sim/traces/") },
  { name: "sim-other", min: 35, test: (p) => p.startsWith("platform/src/modules/sim/") },
  { name: "modules-other", min: 40, test: (p) => p.startsWith("platform/src/modules/") },
  { name: "app", min: 10, test: (p) => p.startsWith("platform/src/app/") },
  { name: "components", min: 3, test: (p) => p.startsWith("platform/src/components/") },
  { name: "lib", min: 12, test: (p) => p.startsWith("platform/src/") },
];

function classOf(p: string): string {
  return SURFACE_CLASSES.find((c) => c.test(p))?.name ?? "UNREGISTERED";
}

/**
 * CEILINGS on citations nobody here can check: an article number on an act
 * `content/law/acts` does not hold. Measured 2026-09-10. These are not
 * approvals — the founder's standing ruling is to keep the rule and the act
 * and drop the number — they are a RATCHET, so the uncheckable population can
 * only shrink. Raising one is a deliberate, reviewable act.
 */
const UNCHECKABLE_ACT_CEILINGS: Readonly<Record<string, number>> = {
  // Measured 2026-09-10 and set AT the measurement, not above it: a ceiling
  // with headroom is a licence. 225 of the 251 are question-bank `lawRefs`
  // naming Наредба № РД-02-21-1 (the road-sign наредба), Наредба № 24, ЗАНН,
  // НК and КЗ — real acts, none of them ingested, so no checker in this repo
  // can confirm or deny a single one of those article numbers.
  "content-questions": 225,
  "content-lessons": 13,
  "content-other": 3,
  "modules-other": 4,
  "sim-other": 4,
  "sim-rules": 2,
  app: 1,
  // Zero today, and zero is the ceiling: these surfaces cite only the corpus.
  "content-traces": 0,
  "public-traces": 0,
  "content-world": 0,
  "public-world": 0,
  "public-clips": 0,
  "sim-lessons": 0,
  "sim-traces": 0,
  components: 0,
  lib: 0,
};

// ---------------------------------------------------------------------------
// Citation binding — an article number belongs to the act NAMED BESIDE IT
// ---------------------------------------------------------------------------

/**
 * Act name tokens, deliberately WIDER than the corpus. „чл. 343б" is НК and
 * „чл. 483" is КЗ; a binder that does not know those acts exist hands their
 * article numbers to ЗДвП and reports a red that is false. Measured on this
 * tree before the fix: 40 such false „unit-not-found" rows, every one of them
 * an НК/КЗ/ЗЕС article.
 *
 * `\b` is ASCII-only in JavaScript and cannot anchor a Cyrillic token, so the
 * alternation is ordered longest-first instead (ППЗДвП before ЗДвП).
 */
const ACT_TOKEN_RE =
  /(ППЗДвП|ЗДвП|НСИПМК|НК|КЗ|ЗАНН|ЗАНС|ЗБЛД|ЗЕС|ЗМВР|Наредба(?:та)?(?:\s*№\s*[^\s,;:)"„“]+)?|Кодекс[а-я]*|Закон[а-я]*)/g;
const ARTICLE_RE = /(?<![А-Яа-я])чл\.\s*\d+[а-я]?/g;

export interface BoundCitation {
  act: string;
  ref: string;
  at: number;
  /**
   * TRUE when the act is named IMMEDIATELY beside the article („ЗДвП чл. 5",
   * „чл. 5 ЗДвП", „чл. 5 от ЗДвП"). Only a pinned citation is ever JUDGED;
   * an inferred one may only widen the evidence a claim is checked against,
   * because widening can never invent a verbatim match.
   */
  pinned: boolean;
}

export function bindCitations(text: string): BoundCitation[] {
  const tokens: Array<{ act: string; at: number; end: number }> = [];
  ACT_TOKEN_RE.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = ACT_TOKEN_RE.exec(text)) !== null) {
    tokens.push({ act: t[1].trim(), at: t.index, end: t.index + t[0].length });
  }
  const out: BoundCitation[] = [];
  ARTICLE_RE.lastIndex = 0;
  let a: RegExpExecArray | null;
  while ((a = ARTICLE_RE.exec(text)) !== null) {
    const at = a.index;
    const end = at + a[0].length;
    const trailing = tokens.find((x) => x.at >= end && /^[\s,]*(от\s+)?$/.test(text.slice(end, x.at)));
    const leading = tokens
      .filter((x) => x.end <= at && /^[\s,]*$/.test(text.slice(x.end, at)))
      .sort((x, y) => y.end - x.end)[0];
    const bound = trailing ?? leading ?? null;
    const nearest = tokens.filter((x) => x.end <= at).sort((x, y) => y.end - x.end)[0];
    out.push({
      act: bound ? bound.act : (nearest?.act ?? "ЗДвП"),
      ref: a[0],
      at,
      pinned: bound !== null,
    });
  }
  return out;
}

/** The retrieved text of a citation, or null when nobody here can retrieve it. */
export function unitTextFor(act: string, ref: string): { key: string; text: string } | null {
  const actId = actIdForActName(act);
  if (actId === null) return null;
  const unitRef = normaliseUnitRef(ref);
  if (unitRef === null) return null;
  const found = getArticle(actId, unitRef);
  if (!found.found) return null;
  return { key: `${actId} ${found.unit.ref}`, text: norm(found.unit.textBg) };
}

// ---------------------------------------------------------------------------
// Extraction — JSON by key path, TypeScript by tokenizer
// ---------------------------------------------------------------------------

interface ClaimString {
  file: string;
  cls: string;
  field: string;
  value: string;
  /** Citations from the record's own `lawRefs`/`grounds`, or a nearby `lawRef:`. */
  recordRefs: BoundCitation[];
}

const REF_KEYS = new Set([
  "lawRef",
  "lawRefs",
  "lawRefEcho",
  "sourceRefs",
  "grounds",
  "citationBg",
  "refsBg",
  "realWorldRefs",
]);

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function refsOfRecord(node: { [k: string]: Json }): BoundCitation[] {
  const out: BoundCitation[] = [];
  const visit = (v: Json): void => {
    if (typeof v === "string") {
      out.push(...bindCitations(v));
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v !== null && typeof v === "object") {
      if (typeof v.act === "string" && typeof v.ref === "string") {
        out.push({ act: v.act, ref: v.ref, at: 0, pinned: true });
      } else {
        Object.values(v).forEach(visit);
      }
    }
  };
  for (const [k, v] of Object.entries(node)) if (REF_KEYS.has(k)) visit(v);
  return out;
}

interface RawString {
  field: string;
  value: string;
  recordRefs: BoundCitation[];
  distractor: boolean;
}

function walkJson(
  node: Json,
  keypath: string,
  refs: BoundCitation[],
  distractor: boolean,
  out: RawString[],
): RawString[] {
  if (typeof node === "string") {
    if (CYRILLIC.test(node)) out.push({ field: keypath, value: node, recordRefs: refs, distractor });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkJson(v, `${keypath}[${i}]`, refs, distractor, out));
    return out;
  }
  if (node !== null && typeof node === "object") {
    const here = refsOfRecord(node);
    const next = here.length > 0 ? [...refs, ...here] : refs;
    // A `correct:false` option is a false statement ON PURPOSE.
    const isDistractor = distractor || node.correct === false;
    for (const [k, v] of Object.entries(node)) {
      walkJson(v, keypath === "" ? k : `${keypath}.${k}`, next, isDistractor, out);
    }
    return out;
  }
  return out;
}

/**
 * A character scanner for .ts/.tsx: string and template literals OUT, comments
 * dropped, and whatever Cyrillic survives in the leftover is JSX text — the
 * hard-coded prose inside page components that no content pipeline can see.
 *
 * A line/regex scan was tried first and produced ~2,800 false hits by pairing a
 * quote inside a comment with an unrelated later quote. Regex literals are
 * recognised (a `/` after `( , = : [ ! & | ? { } ;` or a newline) because a
 * character class containing a quote would otherwise open a string that
 * swallows the rest of the file.
 */
function scanTs(src: string): { strings: Array<{ value: string; at: number }>; jsx: Array<{ value: string; at: number }> } {
  const strings: Array<{ value: string; at: number }> = [];
  let rest = "";
  const restMap: number[] = [];
  let i = 0;
  const n = src.length;
  let prevSig = "\n";
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      const at = i;
      i += 1;
      let buf = "";
      while (i < n) {
        if (src[i] === "\\") {
          buf += src[i + 1] === "n" ? "\n" : src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i += 1;
          break;
        }
        if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth += 1;
            if (src[i] === "}") depth -= 1;
            i += 1;
          }
          buf += ""; // an interpolation: a hole, not a word
          continue;
        }
        buf += src[i];
        i += 1;
      }
      strings.push({ value: buf, at });
      continue;
    }
    if (c === "/" && /[(,=:[!&|?{};\n]/.test(prevSig)) {
      let j = i + 1;
      let inClass = false;
      let closed = true;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        else if (src[j] === "\n") {
          closed = false;
          break;
        }
        j += 1;
      }
      if (closed && j < n) {
        i = j + 1;
        while (i < n && /[a-z]/.test(src[i])) i += 1;
        continue;
      }
    }
    rest += c;
    restMap.push(i);
    if (!/\s/.test(c)) prevSig = c;
    i += 1;
  }
  const jsx: Array<{ value: string; at: number }> = [];
  const jsxRe = /[^<>{}\n]*[А-Яа-яЁё][^<>{}\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = jsxRe.exec(rest)) !== null) {
    const text = m[0].trim();
    if (text.length > 3) jsx.push({ value: text, at: restMap[m.index] ?? 0 });
  }
  return { strings: strings.filter((s) => CYRILLIC.test(s.value)), jsx };
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "dist"]);

function walkTree(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkTree(path.join(dir, e.name), out);
    } else out.push(path.join(dir, e.name));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claim predicates
// ---------------------------------------------------------------------------

const CITE_MARK = /(чл\.\s*\d|§\s*\d|Наредба|ЗДвП|ППЗДвП|приложение\s*№)/;
const LAW_WORD =
  /(чл\.\s*\d|ал\.\s*\d|§\s*\d|ЗДвП|ППЗДвП|Наредба|наредба|закон|Закон|разпоредб|норма|правилник|кодекс)/;

/**
 * WORD NUMERALS — the notation this gate was blind to, and the reason the
 * defect it was built for survived it.
 *
 * Bulgarian teaching prose writes short distances as WORDS („два метра",
 * „един метър"), and every check below read digits only. Measured 2026-09-10:
 * 282 word-numeral metre phrases across 143 files were invisible to this file,
 * and one of them was the FIFTH surviving copy of the past-the-comma defect —
 * sc-pk-rail-ban's replay caption „законът иска поне два метра, а тук са метър
 * и деветнайсет (чл. 51, ал. 4; чл. 54, ал. 1)". The gate written to catch
 * that exact sentence could not see it, because the sentence spells its
 * number. The class had not thinned; it had moved one notation sideways.
 *
 * Statutes always write digits, so a word is mapped to its digits and judged
 * by the same code path — no second predicate to drift.
 *
 * DELIBERATELY NOT PARSED: compound forms („метър и половина" = 1,5 m,
 * „метър и деветнайсет" = 1,19 m) name a fraction this table cannot represent.
 * Guessing them would invent figures, which is the defect class itself, so
 * they stay unread and are named in the header as the next widening.
 */
const WORD_NUMERALS: ReadonlyMap<string, string> = new Map([
  ["един", "1"],
  ["една", "1"],
  ["едно", "1"],
  ["два", "2"],
  ["две", "2"],
  ["три", "3"],
  ["четири", "4"],
  ["пет", "5"],
  ["шест", "6"],
  ["седем", "7"],
  ["осем", "8"],
  ["девет", "9"],
  ["десет", "10"],
  ["единайсет", "11"],
  ["единадесет", "11"],
  ["дванайсет", "12"],
  ["дванадесет", "12"],
  ["петнайсет", "15"],
  ["петнадесет", "15"],
  ["двайсет", "20"],
  ["двадесет", "20"],
  ["трийсет", "30"],
  ["тридесет", "30"],
  ["петдесет", "50"],
  ["сто", "100"],
]);

/**
 * THE DEFINITE FORMS — read as a MENTION, never as an assertion.
 *
 * Bulgarian puts the article on the numeral to refer BACK to a figure already
 * on the table: „СТОТЕ метра са правилото за автомагистрала", „ПЕТТЕ метра се
 * броят само ПРЕДИ нея". That is anaphora, not a fresh legal claim — so these
 * forms belong in the reader that answers „did the author state this figure"
 * (figureIndexIn) and NOT in the one that answers „is a figure being asserted
 * here" (METRE_PATTERN, which stays exactly as it shipped and stays shared with
 * the statute side).
 *
 * MEASURED BOTH WAYS on 2026-09-10, which is why the split exists:
 *  - without the definite forms anywhere, the companion check convicted
 *    content/questions/magistrali-i-izvangradsko.json q-…-041, whose
 *    explanation states the 30-metre branch and then names the other one as
 *    „Стоте метра са правилото за автомагистрала…" — a complete claim reported
 *    as half a rule;
 *  - with them in METRE_PATTERN as well, five anaphoric captions („а ПЕТТЕ
 *    метра се броят само ПРЕДИ нея", after the same sentence has already cited
 *    чл. 98, ал. 1, т. 5) were reported as ungrounded invented figures.
 * Statutes do not use the definite form, so widening the retrieval side costs
 * nothing there.
 */
const MENTION_NUMERALS: ReadonlyMap<string, string> = new Map([
  ...WORD_NUMERALS,
  ["двата", "2"],
  ["двете", "2"],
  ["трите", "3"],
  ["четирите", "4"],
  ["петте", "5"],
  ["шестте", "6"],
  ["десетте", "10"],
  ["петнайсетте", "15"],
  ["петнадесетте", "15"],
  ["двайсетте", "20"],
  ["двадесетте", "20"],
  ["трийсетте", "30"],
  ["тридесетте", "30"],
  ["петдесетте", "50"],
  ["стоте", "100"],
]);
const WORD_ALT = [...WORD_NUMERALS.keys()].join("|");
// THE ABBREVIATED UNIT IS PART OF THE UNIT, and leaving it out left a shipped
// caption unjudged: sc-pk-crossing-ban's shadow-correct annotation says «на него
// и на 5 м …», which this pattern could not see, so the claim was enumerated and
// never checked. `м` is matched only with a following boundary that is not a
// Cyrillic letter, so it cannot swallow the head of «метра», «място» or «мярка`;
// an optional full stop is allowed because the abbreviation is often written «5 м.».
const METRE_UNIT = "(?:метра|метър|метри|см|сантиметра|м\\.?(?![а-яА-Я]))";

/**
 * Two alternatives rather than one, because the two notations need different
 * boundaries: a digit must not be preceded by another digit, and a word must
 * not be the tail of a longer word („стотици метри" is not „сто метри") nor be
 * glued to the unit without a space.
 *
 * ONE pattern, used for both the claim side (METRE_RE) and the statute side
 * (FIGURE_RE), so the two readers cannot drift apart — a gate whose ground
 * truth is read by a different predicate from its claims is comparing two
 * things neither of which is the law.
 */
const METRE_PATTERN =
  `(?<![\\d.,])(\\d+(?:[.,]\\d+)?)\\s*${METRE_UNIT}(?![а-яА-Я])` +
  `|(?<![А-Яа-яЁё])(${WORD_ALT})\\s+${METRE_UNIT}(?![а-яА-Я])`;
const METRE_RE = new RegExp(METRE_PATTERN, "gi");

/** The digits a METRE_RE match stands for, whichever notation it used. */
function digitsOfMetreMatch(m: RegExpExecArray): string | null {
  if (m[1] !== undefined) return m[1];
  const word = (m[2] ?? "").toLowerCase();
  return WORD_NUMERALS.get(word) ?? null;
}

/** The figure is offered as a REQUIREMENT — a distance the law demands. */
const NORMATIVE_NEAR =
  /(забранен|забраняв|задължител|длъжен|не по-малко|най-малко|не повече от|поне|минимум|разрешен|изисква|законът иска|спираш на|спира на|се спира|важи|в зоната|предупредителния триъгълник|поставя се|поставяш)/i;
/**
 * …and the figure is a distance TRAVELLED, not demanded. „При 90 км/ч
 * изминаваш 25 метра за секунда" is arithmetic about physics; holding it to
 * ЗДвП would bury the real findings under the whole bank's stopping-distance
 * teaching, which is exactly how a gate earns its deletion.
 */
const PHYSICS_NEAR =
  /(за секунда|в секунда|секунд|км\/ч|km\/h|скорост|спирачн|реакци|изминава|изминаваш|каране на сляпо|без съзнание|видим|вижда|виждаш|осветен|снопа|стигат|прави|футболно|закъснение|трябват още|се спират)/i;

/**
 * THE VETO'S REACH — the second half of the lesson clauseAround taught.
 *
 * clauseAround stopped a NEIGHBOURING SENTENCE from voting on this sentence's
 * claim. It did nothing about the shape the teaching bank actually favours,
 * which is one sentence built as ‹rule + citation› — ‹why it is that number›:
 *
 *   «Триъгълникът се поставя на не по-малко от 30 метра … (чл. 97 ЗДвП) —
 *    ПРИ 90 КМ/Ч водачите имат нужда от тези метри, за да реагират навреме.»
 *
 * That is a metre figure offered as a legal requirement with the article
 * printed beside it — textbook NORMATIVE_NEAR („не по-малко") — and the gate
 * never judged it, because „км/ч" thirty characters further on, in the
 * RATIONALE rather than in the rule, tripped the physics veto for the whole
 * sentence. Measured 2026-09-10 on content/questions/spirane-i-parkirane.json
 * q-…-025 (status „approved"): the claim was enumerated and 0 metre figures
 * were judged in it. The veto was swallowing the rule because of the reason.
 *
 * So the veto now reads only the DASH SEGMENT the figure sits in. NORMATIVE_NEAR
 * deliberately keeps the whole clause: widening what is judged can only add
 * findings, while narrowing it would silently drop them, and this gate has
 * already been fooled once in the reassuring direction.
 *
 * Split on a SPACED dash only — „по-малко", „не по-малко" and every other
 * hyphenated Bulgarian word must stay in one piece — plus the semicolon, which
 * separates independent statements for the same reason.
 */
const SEGMENT_SPLIT = /(?:\s[—–-]\s|;)/g;

function segmentAround(clause: string, index: number): string {
  SEGMENT_SPLIT.lastIndex = 0;
  let start = 0;
  let end = clause.length;
  let m: RegExpExecArray | null;
  while ((m = SEGMENT_SPLIT.exec(clause)) !== null) {
    const cut = m.index + m[0].length;
    if (cut <= index) start = cut;
    else {
      end = m.index;
      break;
    }
  }
  return clause.slice(start, end);
}

/**
 * A UNIVERSAL NEGATIVE about the law. Both halves are required — the negation
 * operator AND a law word within ±70 characters — so „единствената лента" does
 * not fire while «единственото разстояние, което ЗАКОНЪТ пише» does.
 */
const UNIVERSAL_NEGATIVE_RE =
  /(единствен\w*|няма друг\w*|няма мярка|няма норма|няма разстояние|няма текст|няма разпоредб\w*|законът не|закона не|никъде не|няма такъв|не съществува|само и единствено|нито един\w*|няма изискване)/gi;

interface MetreHit {
  raw: string;
  digits: string;
  index: number;
}
interface NegativeHit {
  trigger: string;
  index: number;
}

/**
 * The two predicates live HERE, as functions, and both the tree scan and the
 * negative controls call them. They used to be inlined in the scan loop, and
 * the control that proves „единствената лента" is not a legal claim was
 * therefore driving a different predicate from the one that judges the tree —
 * a control that cannot fail the way production fails is decoration.
 */
/**
 * Bulgarian legal prose is full of dotted abbreviations („чл. 98, ал. 1, т. 4"),
 * so a naive sentence split shreds exactly the sentences worth reading. These
 * are the stems that do NOT end a sentence.
 */
const ABBREV_STEMS = ["чл", "ал", "т", "б", "бр", "г", "км", "м", "макс", "мин", "стр", "вж", "напр", "бук"];

/**
 * The SENTENCE a figure sits in — not a fixed character window.
 *
 * This was ±70 characters and the difference is not cosmetic. Measured by
 * injecting a fabricated „…забранено на по-малко от 50 метра от прелеза (ЗДвП
 * чл. 98, ал. 1)" into a trace caption whose PREVIOUS sentence happened to
 * contain „реакцията закъснява": the word „реакци" sat 58 characters back,
 * tripped the physics veto, and the gate stayed green over a planted copy of
 * the 50-metre myth. A window that reaches into a neighbouring sentence lets
 * that sentence's vocabulary vote on this sentence's claim.
 */
function clauseBounds(value: string, index: number): { start: number; end: number } {
  const endsSentence = (at: number): boolean => {
    if (value[at] !== "." || !/[\s]/.test(value[at + 1] ?? " ")) return false;
    const before = value.slice(Math.max(0, at - 6), at);
    const word = /([А-Яа-яA-Za-z]+)$/.exec(before)?.[1]?.toLowerCase() ?? "";
    return !ABBREV_STEMS.includes(word);
  };
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (value[i] === "\n" || endsSentence(i)) {
      start = i + 1;
      break;
    }
  }
  let end = value.length;
  for (let i = index; i < value.length; i += 1) {
    if (value[i] === "\n" || endsSentence(i)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function clauseAround(value: string, index: number): string {
  const { start, end } = clauseBounds(value, index);
  return value.slice(start, end);
}

export function findMetreClaims(value: string, hasRecordRefs: boolean): MetreHit[] {
  const out: MetreHit[] = [];
  METRE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METRE_RE.exec(value)) !== null) {
    const digits = digitsOfMetreMatch(m);
    if (digits === null) continue;
    const { start, end } = clauseBounds(value, m.index);
    const clause = value.slice(start, end);
    // Judged on the whole clause, vetoed only by the figure's own segment —
    // see SEGMENT_SPLIT: a rationale after the dash may not veto the rule
    // before it.
    if (!NORMATIVE_NEAR.test(clause)) continue;
    if (PHYSICS_NEAR.test(segmentAround(clause, m.index - start))) continue;
    if (!LAW_WORD.test(value) && !hasRecordRefs) continue;
    out.push({ raw: m[0].trim(), digits, index: m.index });
  }
  return out;
}

export function findUniversalNegatives(value: string): NegativeHit[] {
  const out: NegativeHit[] = [];
  UNIVERSAL_NEGATIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = UNIVERSAL_NEGATIVE_RE.exec(value)) !== null) {
    // Same clause scoping as findMetreClaims, and for the same reason — except
    // here it cuts the other way: a law word in a NEIGHBOURING sentence would
    // turn „единствената свободна лента" into a legal claim and bury the real
    // ones under noise.
    if (LAW_WORD.test(clauseAround(value, m.index))) out.push({ trigger: m[0], index: m.index });
  }
  return out;
}

interface Claim extends ClaimString {
  metres: MetreHit[];
  negatives: NegativeHit[];
}

// ---------------------------------------------------------------------------
// THE SCAN
// ---------------------------------------------------------------------------

export interface ScanResult {
  files: number;
  strings: number;
  claims: Claim[];
  byClass: Record<string, number>;
  fileExclusions: Record<string, number>;
  fieldExclusions: Record<string, number>;
  distractorsSkipped: number;
  unregistered: string[];
}

function scanRepo(): ScanResult {
  const all: string[] = [];
  for (const root of ["content", "platform/src", "platform/public"]) {
    walkTree(path.join(REPO, root), all);
  }
  const fileExclusions: Record<string, number> = Object.fromEntries(
    FILE_EXCLUSIONS.map((r) => [r.name, 0]),
  );
  const fieldExclusions: Record<string, number> = Object.fromEntries(
    FIELD_EXCLUSIONS.map((r) => [r.name, 0]),
  );
  const inScope: string[] = [];
  for (const abs of all) {
    const p = rel(abs);
    const hit = FILE_EXCLUSIONS.find((r) => r.test(p));
    if (hit) fileExclusions[hit.name] += 1;
    else inScope.push(p);
  }

  const claims: Claim[] = [];
  const byClass: Record<string, number> = {};
  const unregistered = new Set<string>();
  let strings = 0;
  let distractorsSkipped = 0;

  for (const p of inScope) {
    const abs = path.join(REPO, p);
    const cls = classOf(p);
    if (cls === "UNREGISTERED") unregistered.add(p);
    let raw: RawString[] = [];
    if (p.endsWith(".json")) {
      let parsed: Json;
      try {
        parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as Json;
      } catch {
        continue; // a malformed JSON is somebody else's gate
      }
      raw = walkJson(parsed, "", [], false, []);
    } else {
      const src = fs.readFileSync(abs, "utf8");
      const scanned = scanTs(src);
      const nearby: Array<{ at: number; value: string }> = [];
      const lawRefLiteral = /lawRef\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = lawRefLiteral.exec(src)) !== null) nearby.push({ at: m.index, value: m[1] });
      const refsNear = (at: number): BoundCitation[] =>
        nearby.filter((x) => Math.abs(x.at - at) < 1200).flatMap((x) => bindCitations(x.value));
      raw = [
        ...scanned.strings.map((s) => ({
          field: "literal",
          value: s.value,
          recordRefs: refsNear(s.at),
          distractor: false,
        })),
        ...scanned.jsx.map((s) => ({
          field: "jsx-text",
          value: s.value,
          recordRefs: refsNear(s.at),
          distractor: false,
        })),
      ];
    }

    for (const item of raw) {
      strings += 1;
      const fx = FIELD_EXCLUSIONS.find((r) => r.test(item.field));
      if (fx) {
        fieldExclusions[fx.name] += 1;
        continue;
      }
      if (item.distractor) {
        distractorsSkipped += 1;
        continue;
      }
      const value = stripStaffAnnotations(item.value);
      const cited = CITE_MARK.test(value);
      const metres = findMetreClaims(value, item.recordRefs.length > 0);
      const negatives = findUniversalNegatives(value);
      if (!cited && metres.length === 0 && negatives.length === 0) continue;
      claims.push({
        file: p,
        cls,
        field: item.field,
        value,
        recordRefs: item.recordRefs,
        metres,
        negatives,
      });
      byClass[cls] = (byClass[cls] ?? 0) + 1;
    }
  }

  return {
    files: inScope.length,
    strings,
    claims,
    byClass,
    fileExclusions,
    fieldExclusions,
    distractorsSkipped,
    unregistered: [...unregistered],
  };
}

/** Everything a claim may be checked against: its own citations plus its record's. */
function evidenceFor(claim: Claim): Array<{ key: string; text: string }> {
  const inline = bindCitations(claim.value);
  const widened = [...inline, ...claim.recordRefs];
  // A bare „чл. N" is also tried against ЗДвП. Widening can only turn a red
  // green when the article really carries the words; it can never invent a
  // verbatim match, because the match is still against real retrieved text.
  const all = [...widened, ...widened.filter((c) => !c.pinned).map((c) => ({ ...c, act: "ЗДвП" }))];
  const seen = new Set<string>();
  const out: Array<{ key: string; text: string }> = [];
  for (const c of all) {
    const got = unitTextFor(c.act, c.ref);
    if (got === null || seen.has(got.key)) continue;
    seen.add(got.key);
    out.push(got);
  }
  return out;
}

// ---------------------------------------------------------------------------
// FINDINGS
// ---------------------------------------------------------------------------

export type FindingKind =
  | "citation-unresolvable"
  | "quote-not-in-source"
  | "quote-truncated-before-exception"
  | "companion-branch-not-stated"
  | "metre-not-in-cited-law"
  | "universal-negative";

export interface Finding {
  kind: FindingKind;
  cls: string;
  where: string;
  /** The exact thing judged — the pin key's payload. */
  subject: string;
  detail: string;
  contextBg: string;
}

const finding = (
  kind: FindingKind,
  claim: Claim,
  subject: string,
  detail: string,
  contextBg: string,
): Finding => ({ kind, cls: claim.cls, where: `${claim.file} :: ${claim.field}`, subject, detail, contextBg });

/** Stable across everything except the thing being judged. */
export function pinId(kind: FindingKind, where: string, subject: string): string {
  return crypto.createHash("sha1").update(`${kind}|${where}|${subject}`).digest("hex").slice(0, 12);
}

// --- 1. every pinned citation must resolve --------------------------------

function checkCitationsResolve(claims: Claim[]): {
  findings: Finding[];
  pinned: number;
  uncheckable: Record<string, number>;
} {
  const findings: Finding[] = [];
  const uncheckable: Record<string, number> = {};
  const seen = new Set<string>();
  let pinned = 0;
  for (const claim of claims) {
    const cites = [...bindCitations(claim.value).filter((c) => c.pinned), ...claim.recordRefs];
    for (const c of cites) {
      const key = `${claim.file}|${c.act}|${c.ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pinned += 1;
      const actId = actIdForActName(c.act);
      if (actId === null) {
        uncheckable[claim.cls] = (uncheckable[claim.cls] ?? 0) + 1;
        continue;
      }
      const unitRef = normaliseUnitRef(c.ref);
      if (unitRef === null) continue; // names an act and no unit — the numberless form
      if (!getArticle(actId, unitRef).found) {
        findings.push(
          finding(
            "citation-unresolvable",
            claim,
            `${c.act} ${c.ref}`,
            `${actId} has no ${unitRef} — the article number is free-recalled, not retrieved`,
            norm(claim.value).slice(0, 160),
          ),
        );
      }
    }
  }
  return { findings, pinned, uncheckable };
}

// --- 2/3. quotation fidelity and completeness -----------------------------

const QUOTE_RE = /[„«]([^„“”«»]{15,400})[”“»]|"([^"]{15,400})"/g;
/** „ЗДвП чл. 103 казва „…"" — the SUBJECT of the saying verb must be an act. */
const SAYS_BY_ACT =
  /(ППЗДвП|ЗДвП|Наредба[^„«"]{0,40}|[Пп]равилник\w*|[Зз]акон\w*)[^„«"]{0,30}(гласи|казва|пише|разпорежда|формулира|изписва)[^„«"]{0,20}$/;
const CITE_COLON = /(чл\.\s*\d+[а-я]?(?:\s*,\s*(?:ал|т|б)\.\s*[^\s,;]+)*)\s*[:—-]?\s*$/;
const CITE_AFTER = /^\s*[)»”“]?\s*[([]?\s*(?:чл\.|ЗДвП|ППЗДвП|Наредба|§)/;
/**
 * THE COMMA. A statute sentence that carries on „…, а когато има бариери - на
 * 1 метър от тях" has a SECOND governing branch, and a quotation that stops
 * before it has published half a rule.
 */
export const EXCEPTION_CONNECTIVE =
  /(а когато|а ако|а при|а за|а извън|освен ако|освен когато|освен при|освен|с изключение на|но когато|както и при)/;
const EXCEPTION_AT_START = new RegExp(`^\\s*[,;-]?\\s*${EXCEPTION_CONNECTIVE.source}`);

/**
 * Every place the quotation could have come from, not the first one.
 *
 * An article is a LIST: чл. 58 forbids „да спира в лентата за принудително
 * спиране, ОСВЕН при повреда…" in т. 3 and „да се движи … в лентата за
 * принудително спиране" — full stop, no exception — in т. 4. Taking the first
 * match convicts a sentence that quoted т. 4 of truncating т. 3. Measured: that
 * bug produced this gate's only truncation finding, and it was false.
 *
 * So all end positions are returned, and the truncation check fires only when
 * EVERY reading of the quotation runs into an exception — i.e. there is no
 * occurrence in the article where the quotation is complete.
 */
function matchSegments(
  sources: Array<{ key: string; text: string }>,
  segments: string[],
): { key: string; text: string; ends: number[] } | null {
  const needles = segments.map((s) => s.toLowerCase());
  const first = needles[0];
  for (const src of sources) {
    const hay = src.text.toLowerCase();
    const ends: number[] = [];
    let from = 0;
    for (;;) {
      const start = hay.indexOf(first, from);
      if (start < 0) break;
      from = start + 1;
      let pos = start + first.length;
      let ok = true;
      for (const needle of needles.slice(1)) {
        const i = hay.indexOf(needle, pos);
        if (i < 0) {
          ok = false;
          break;
        }
        pos = i + needle.length;
      }
      if (ok) ends.push(pos);
    }
    if (ends.length > 0) return { key: src.key, text: src.text, ends };
  }
  return null;
}

function quoteSegments(raw: string): string[] {
  return norm(raw)
    .split(/…|\.\.\./)
    .map((s) => s.replace(/^[.,;:\s"'()]+|[.,;:\s"'()]+$/g, ""))
    .filter((s) => s.length >= 12 && CYRILLIC.test(s));
}

function checkQuotes(claims: Claim[]): { findings: Finding[]; judged: number } {
  const findings: Finding[] = [];
  let judged = 0;
  for (const claim of claims) {
    const evidence = evidenceFor(claim);
    const inline = bindCitations(claim.value);
    QUOTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = QUOTE_RE.exec(claim.value)) !== null) {
      const rawFrag = m[1] !== undefined ? m[1] : m[2];
      const qs = m.index;
      const qe = m.index + m[0].length;
      const segments = quoteSegments(rawFrag);
      if (segments.length === 0) continue;
      const size = segments.join(" ").length;

      // COMPLETENESS. A fragment that IS verbatim in a cited unit is a quote of
      // it, however it was introduced — so this half needs no presentation cue.
      if (size >= 20 && evidence.length > 0) {
        const hit = matchSegments(evidence, segments);
        if (hit !== null) {
          judged += 1;
          const tails = hit.ends.map((end) => hit.text.slice(end));
          if (tails.every((tail) => EXCEPTION_AT_START.test(tail))) {
            findings.push(
              finding(
                "quote-truncated-before-exception",
                claim,
                segments.join(" … ").slice(0, 120),
                `${hit.key} continues „${tails[0].slice(0, 90)}" — the quotation stops before the branch that governs the other case`,
                norm(claim.value.slice(Math.max(0, qs - 60), qe + 40)),
              ),
            );
          }
          continue;
        }
      }

      // FIDELITY. Only when the sentence presents the fragment as the words of
      // a NAMED, RETRIEVABLE article. An act whose name was merely inferred
      // cannot convict a sentence of misquoting it.
      if (size < 25) continue;
      const before = claim.value.slice(Math.max(0, qs - 70), qs);
      const after = claim.value.slice(qe, qe + 40);
      if (!(SAYS_BY_ACT.test(before) || CITE_COLON.test(before) || CITE_AFTER.test(after))) continue;
      let bound: BoundCitation | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const c of inline) {
        if (!c.pinned) continue;
        const d = c.at < qs ? qs - c.at : c.at - qe;
        if (d >= 0 && d < best && d <= 90) {
          best = d;
          bound = c;
        }
      }
      if (bound === null) continue;
      const source = unitTextFor(bound.act, bound.ref);
      if (source === null) continue; // not in the corpus — checkCitationsResolve's territory
      judged += 1;
      if (matchSegments([source], segments) === null) {
        findings.push(
          finding(
            "quote-not-in-source",
            claim,
            segments.join(" … ").slice(0, 120),
            `presented as the words of ${bound.act} ${bound.ref}, but ${source.key} does not contain them`,
            norm(claim.value.slice(Math.max(0, qs - 60), qe + 40)),
          ),
        );
      }
    }
  }
  return { findings, judged };
}

// --- 4. metre figures, and THE PAST-THE-COMMA CHECK ------------------------

/**
 * THE STATUTE'S OWN DIVISION around a figure — the alinea „(4)" the figure sits
 * in, or the enumerated point „3." when the alinea has points. This is what the
 * companion check reads, and it replaces the SENTENCE it used to read.
 *
 * The check below was written for the чл. 51, ал. 4 shape, where the second
 * governing branch arrives PAST A COMMA in the same sentence:
 *
 *   «…спират на разстояние не по-малко от 2 метра преди първата релса,
 *     А КОГАТО ИМА БАРИЕРИ - на 1 метър от тях.»
 *
 * So it scoped itself to the sentence and demanded an EXCEPTION_CONNECTIVE.
 * ЗДвП writes the same two-branch rule a SECOND way — past the FULL STOP,
 * inside one alinea, with no connective at all, the branch opened by naming the
 * case it governs. чл. 97, ал. 4:
 *
 *   «Предупредителният … триъгълник се поставя на разстояние не по-малко от
 *     30 метра … ⟨.⟩ НА АВТОМАГИСТРАЛИ И ПЪТИЩА С РАЗРЕШЕНА СКОРОСТ НА ДВИЖЕНИЕ
 *     НАД 90 km/h … се поставя на разстояние не по-малко от 100 метра.»
 *
 * Measured 2026-09-10: the sentence slice around the 30-metre figure has the
 * figure list ["30 метра"] while ал. 4 has ["30 метра", "100 метра"] — so the
 * second branch was not merely unreported, it was UNREACHABLE, and no wording
 * of the connective list could have found it.
 *
 * WHY THE DIVISION AND NOT THE WHOLE ARTICLE. `unitTextFor` returns
 * `norm(textBg)`, which collapses every newline, so „the alinea" has to be
 * recovered from the numbering rather than from the line breaks — and reading
 * the whole article instead is measurably wrong: it reports чл. 98, ал. 1's
 * т. 5 („5 метра" before a crossing) as hiding т. 7's „3 метра" (the gap to an
 * unbroken line), and чл. 70, ал. 2's т. 1 („150 метра" when meeting) as hiding
 * т. 3's „50 метра" (when following). Those are DIFFERENT prohibitions that
 * merely share an article, not two branches of one rule; convicting them is the
 * true-claim-convicted failure this file's other headers were written about.
 * Measured on the whole corpus: article scope = 39 findings, of which 30 are of
 * that shape; division scope = the 9 that are really two-branch.
 *
 * The corpus holds exactly FIVE divisions carrying two different metre figures
 * (ЗДвП чл. 51 ал. 4, чл. 97 ал. 4, чл. 111 т. 2, чл. 127 ал. 3, чл. 183 т. 3),
 * and each was read by hand before this scope was chosen — the blast radius was
 * enumerated before the change was made, not after it went red.
 */
const DIVISION_OPENER =
  /(?:^|(?<=[\s;:]))(?:\(\d+\)|(?<!(?:чл|ал|т|б|бр|§|буква)\.\s)\d{1,2}\.(?=\s))/g;

function divisionAround(text: string, index: number): { text: string; start: number } {
  DIVISION_OPENER.lastIndex = 0;
  let start = 0;
  let end = text.length;
  let m: RegExpExecArray | null;
  while ((m = DIVISION_OPENER.exec(text)) !== null) {
    if (m.index <= index) start = m.index;
    else {
      end = m.index;
      break;
    }
  }
  return { text: text.slice(start, end), start };
}

/**
 * Figures in STATUTE text — notation-aware, and the reason is MEASURED rather
 * than assumed.
 *
 * This was written digits-only, on the stated belief that the acts always use
 * digits. ЗДвП refuted it on the first run: чл. 66, ал. 1 reads „водачът … е
 * длъжен да спре на ЕДИН МЕТЪР зад трамвая", and чл. 183 is the other one.
 * With a digits-only reader the gate reported q-uyazvimi-041 as an ungrounded
 * invented figure while the cited article says exactly what the question says
 * — a true claim convicted, which is how a gate earns its deletion.
 *
 * It fails the other way too, and that way is worse: a companion branch
 * reading „а когато има бариери - на един метър от тях" would simply not be
 * seen, so the check built to catch the past-the-comma defect would go green
 * on a statute that spells its second figure. A ground-truth reader that
 * cannot read the ground truth fails in the reassuring direction.
 */
const FIGURE_RE = new RegExp(METRE_PATTERN, "gi");
const EXCEPTION_SCAN = new RegExp(EXCEPTION_CONNECTIVE.source, "g");

/** Where this figure appears in `text`, in either notation; -1 if it does not. */
function figureIndexIn(digits: string, text: string): number {
  const asDigits = new RegExp(
    `(?<![\\d.,])${digits.replace(/[.,]/g, "[.,]")}\\s*${METRE_UNIT}(?![а-яА-Я])`,
  );
  const at = text.search(asDigits);
  if (at >= 0) return at;
  // MENTION_NUMERALS, not WORD_NUMERALS: this reader answers „is the figure
  // stated here", which the definite form does („стоте метра") even though it
  // asserts nothing new. See MENTION_NUMERALS for the two measurements.
  const words = [...MENTION_NUMERALS.entries()]
    .filter(([, d]) => d === digits)
    .map(([w]) => w)
    // Longest first: „сто" would otherwise consume the head of „стоте" and then
    // fail on the required whitespace without trying the longer alternative.
    .sort((a, b) => b.length - a.length);
  if (words.length === 0) return -1;
  return text.search(
    new RegExp(`(?<![А-Яа-яЁё])(?:${words.join("|")})\\s+${METRE_UNIT}(?![а-яА-Я])`, "i"),
  );
}

/**
 * Does this text state this figure at all? The companion check asks „did the
 * author mention the other branch", and an author who wrote „на един метър от
 * тях" has stated it as surely as one who wrote „1 метър".
 */
function containsFigure(digits: string, text: string): boolean {
  return figureIndexIn(digits, text) >= 0;
}

/**
 * WHERE THE COMPANION CHECK APPLIES — and the one place it does not.
 *
 * „State the other branch" is a demand on the text that STATES THE RULE. An
 * answer option is not that text: it is a candidate answer under a stem that
 * has already fixed the case („Колата ти се поврежда на АВТОМАГИСТРАЛА…"), and
 * the exam format gives it one line. Demanding that „Не по-малко от 100 метра."
 * also recite the ordinary-road branch would rewrite the official-format answer
 * set to satisfy a scanner — which is the content bending to fit the tool.
 *
 * This is a scope rule, NOT an amnesty, and it is narrow on purpose:
 *  - the option is still read for GROUNDING (metre-not-in-cited-law), which is
 *    the 50-metre-myth check and the one that catches an invented number;
 *  - the item's own explanationBg is NOT excluded, so an item whose teaching
 *    text hides the other branch still convicts — and every option finding this
 *    rule drops belongs to an item whose explanation is judged on the same run.
 * Measured 2026-09-10: 10 of the 20 чл. 97 companion findings were option
 * texts, and every one of their items also produced an explanation finding or
 * already stated both branches.
 *
 * `correct: false` options never reach here at all — walkJson drops them as
 * deliberate falsehoods (scan.distractorsSkipped).
 */
const COMPANION_SCOPE_SKIP = {
  name: "answer-options",
  test: (field: string) => /(^|\.)options\[\d+\]\.textBg$/.test(field),
};

function checkMetres(claims: Claim[]): {
  ungrounded: Finding[];
  companion: Finding[];
  judged: number;
  grounded: number;
  companionScopeSkipped: number;
} {
  const ungrounded: Finding[] = [];
  const companion: Finding[] = [];
  let judged = 0;
  let grounded = 0;
  let companionScopeSkipped = 0;
  for (const claim of claims) {
    if (claim.metres.length === 0) continue;
    const evidence = evidenceFor(claim);
    for (const metre of claim.metres) {
      judged += 1;
      let source: { key: string; text: string; at: number } | null = null;
      for (const e of evidence) {
        const at = figureIndexIn(metre.digits, e.text);
        if (at >= 0) {
          source = { ...e, at };
          break;
        }
      }
      const contextBg = norm(claim.value.slice(Math.max(0, metre.index - 60), metre.index + 70));
      if (source === null) {
        ungrounded.push(
          finding(
            "metre-not-in-cited-law",
            claim,
            metre.raw,
            evidence.length === 0
              ? "offered as a legal requirement, and the record cites no article this repo can retrieve"
              : `offered as a legal requirement, and no cited article contains it (${evidence.map((e) => e.key).join(", ")})`,
            contextBg,
          ),
        );
        continue;
      }
      grounded += 1;

      // ------------------------------------------------------------------
      // PAST THE COMMA — AND PAST THE FULL STOP. The figure IS in the article.
      // Does the article's own ALINEA carry a SECOND governing branch with a
      // different figure that this claim never mentions? If so, the claim
      // published half a rule.
      //
      // Scoped to the statute's own DIVISION rather than the sentence, and to
      // every other figure in it rather than only ones behind an
      // EXCEPTION_CONNECTIVE, because ЗДвП opens the second branch both ways —
      // see divisionAround. The чл. 51, ал. 4 control below still fires, which
      // is the check that this re-scope did not quietly drop the shape the
      // check was built for.
      // ------------------------------------------------------------------
      const division = divisionAround(source.text, source.at);
      const reported = new Set<string>();
      FIGURE_RE.lastIndex = 0;
      let other: RegExpExecArray | null;
      while ((other = FIGURE_RE.exec(division.text)) !== null) {
        const otherDigits = digitsOfMetreMatch(other);
        if (otherDigits === null) continue;
        const otherRaw = other[0].trim();
        if (otherDigits === metre.digits || reported.has(otherRaw)) continue;
        if (containsFigure(otherDigits, claim.value)) continue;
        if (COMPANION_SCOPE_SKIP.test(claim.field)) {
          companionScopeSkipped += 1;
          continue;
        }
        reported.add(otherRaw);
        // The branch quoted back is the run of text that opens the other
        // case: from its EXCEPTION_CONNECTIVE if it has one (the чл. 51 shape),
        // otherwise from the start of its own sentence (the чл. 97 shape).
        const otherAt = other.index;
        let branchAt = 0;
        EXCEPTION_SCAN.lastIndex = 0;
        let exc: RegExpExecArray | null;
        while ((exc = EXCEPTION_SCAN.exec(division.text)) !== null) {
          if (exc.index < otherAt) branchAt = exc.index;
          else break;
        }
        const sentenceAt = division.text.lastIndexOf(". ", otherAt);
        if (sentenceAt >= 0 && sentenceAt + 2 > branchAt) branchAt = sentenceAt + 2;
        const branch = division.text.slice(branchAt);
        companion.push(
          finding(
            "companion-branch-not-stated",
            claim,
            `${metre.raw} without ${otherRaw}`,
            `${source.key} reads „…${norm(branch).slice(0, 140)}" — the claim states ${metre.raw} and never the companion branch ${otherRaw}`,
            contextBg,
          ),
        );
      }
    }
  }
  return { ungrounded, companion, judged, grounded, companionScopeSkipped };
}

// --- 5. universal negatives -----------------------------------------------

function checkUniversalNegatives(claims: Claim[]): Finding[] {
  const out: Finding[] = [];
  for (const claim of claims) {
    for (const neg of claim.negatives) {
      const contextBg = norm(claim.value.slice(Math.max(0, neg.index - 90), neg.index + 130));
      out.push(
        finding(
          "universal-negative",
          claim,
          `${neg.trigger}::${crypto.createHash("sha1").update(contextBg).digest("hex").slice(0, 8)}`,
          "a claim about what the law does NOT contain — unfalsifiable by any scanner, so it needs a human's reasoning in the ledger",
          contextBg,
        ),
      );
    }
  }
  return out;
}

// --- 6. the mirrors ---------------------------------------------------------

/**
 * `content/traces/**` and `platform/public/traces/**` are byte-identical
 * copies, and only the PUBLIC one is fetched by the browser
 * (MistakeReplay.tsx:291 fetches „/traces/…"). Same shape for
 * content/world ↔ platform/public/world. A repair applied to the copy somebody
 * was handed ships nothing at all — which is mechanism (C) behind five rounds
 * of "fixed it, still there".
 */
function checkMirrors(): string[] {
  const problems: string[] = [];
  const pairs: Array<[string, string]> = [
    ["content/traces", "platform/public/traces"],
    ["content/world", "platform/public/world"],
  ];
  for (const [a, b] of pairs) {
    const listOf = (root: string): Map<string, string> => {
      const map = new Map<string, string>();
      for (const abs of walkTree(path.join(REPO, root))) {
        if (!abs.endsWith(".json")) continue;
        map.set(path.relative(path.join(REPO, root), abs).replace(/\\/g, "/"), fs.readFileSync(abs, "utf8"));
      }
      return map;
    };
    const left = listOf(a);
    const right = listOf(b);
    if (left.size === 0 || right.size === 0) {
      problems.push(`${a} ↔ ${b}: one side is EMPTY (${left.size} vs ${right.size}) — the mirror check is scanning nothing`);
      continue;
    }
    for (const [name, text] of left) {
      const other = right.get(name);
      if (other === undefined) problems.push(`${b}/${name} is missing — the shipped copy does not exist`);
      else if (other !== text) problems.push(`${a}/${name} and ${b}/${name} DISAGREE — the browser reads the second one`);
    }
    for (const name of right.keys()) {
      if (!left.has(name)) problems.push(`${a}/${name} is missing — the shipped copy has no source`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// THE LEDGER — the reviewed allow-list
// ---------------------------------------------------------------------------

/**
 * THREE STATUSES, because two would force a lie.
 *
 *   accepted     a human read the claim AND the article and wrote down why the
 *                claim is safe. This is the only status that means "fine".
 *   open-defect  a human read it and it is WRONG. Recorded with its repair so
 *                the gate stays usable, counted so it cannot multiply. Filing a
 *                known defect as "accepted" is the same lie one level up.
 *   inherited    frozen at gate creation and NOT reviewed by anybody. Honest
 *                about being unreviewed; may only shrink.
 *
 * `accepted` is the only status that does not count against the ratchet.
 */
interface Pin {
  id: string;
  kind: FindingKind;
  where: string;
  subject: string;
  status: "accepted" | "open-defect" | "inherited";
  why: string;
  excerptBg?: string;
}

interface Ledger {
  note: string;
  seededAt: string;
  pins: Pin[];
}

function loadLedger(): Ledger {
  if (!fs.existsSync(LEDGER_PATH)) {
    return { note: "MISSING", seededAt: "", pins: [] };
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) as Ledger;
}

/**
 * SEED MODE. `CLAIM_LEDGER_SEED=1 npx vitest run …/claimGate.test.ts` writes
 * the ledger from the current tree and then fails, on purpose: seeding is a
 * one-time act that produces a file a human has to read. The gate NEVER writes
 * the ledger on an ordinary run — a gate that can silence itself is not a gate.
 */
const SEEDING = process.env.CLAIM_LEDGER_SEED === "1";

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------

const scan = scanRepo();
const citations = checkCitationsResolve(scan.claims);
const quotes = checkQuotes(scan.claims);
const metres = checkMetres(scan.claims);
const negatives = checkUniversalNegatives(scan.claims);
const mirrors = checkMirrors();

/** Everything that needs a human's permission to exist. */
const PINNABLE: Finding[] = [...quotes.findings, ...metres.ungrounded, ...negatives];
const ledger = loadLedger();
const pinsById = new Map(ledger.pins.map((p) => [p.id, p]));
const foundIds = new Set(PINNABLE.map((f) => pinId(f.kind, f.where, f.subject)));
const stalePins = ledger.pins.filter((p) => !foundIds.has(p.id));
const unacceptedPins = ledger.pins.filter((p) => p.status !== "accepted");
const openDefects = ledger.pins.filter((p) => p.status === "open-defect");

/**
 * Seeding MERGES: an existing pin keeps its status and its reasoning, and only
 * findings the ledger has never seen are added as `inherited`. A seed that
 * overwrote the file would delete every sentence a reviewer had written — which
 * would make re-seeding a way to silently un-review the ledger, i.e. the exact
 * shape of neutralisation this gate is built against.
 */
if (SEEDING) {
  const added = PINNABLE.filter((f) => !pinsById.has(pinId(f.kind, f.where, f.subject)));
  const merged: Ledger = {
    note:
      "Claims the gate in platform/src/lib/content/law/claimGate.test.ts cannot verify mechanically. " +
      "status:accepted = a human read the claim AND the retrieved article and wrote down why the claim is safe. " +
      "status:open-defect = a human read it and it is WRONG; the repair is in `why` and the count may only shrink. " +
      "status:inherited = frozen at gate creation and NOT REVIEWED BY ANYBODY; may only shrink. " +
      "A claim of these shapes that is NOT in this file fails the gate.",
    seededAt: ledger.seededAt === "" ? new Date().toISOString().slice(0, 10) : ledger.seededAt,
    pins: [
      ...ledger.pins.filter((p) => foundIds.has(p.id)),
      ...added.map((f) => ({
        id: pinId(f.kind, f.where, f.subject),
        kind: f.kind,
        where: f.where,
        subject: f.subject,
        status: "inherited" as const,
        why: "INHERITED AT GATE CREATION AND NOT REVIEWED. Frozen so that no NEW claim of this shape can be added silently. Replace this line with the reasoning that justifies the claim, or repair the claim and delete this pin.",
        excerptBg: f.contextBg.slice(0, 200),
      })),
    ],
  };
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

const report = (findings: readonly Finding[]): string =>
  findings
    .map(
      (f) =>
        `  [${f.cls}] ${f.where}\n      „${f.subject}"\n      -> ${f.detail}\n      …${f.contextBg}…`,
    )
    .join("\n");

// ---------------------------------------------------------------------------
// THE GATE
// ---------------------------------------------------------------------------

describe("the claim gate: the enumeration itself", () => {
  it("is not seeding (seed mode writes the ledger and must never be a normal run)", () => {
    expect(
      SEEDING,
      SEEDING
        ? `CLAIM_LEDGER_SEED=1 merged ${PINNABLE.length} findings into content/law/claim-ledger.json ` +
            "(existing pins kept their status and reasoning; only unseen findings were added as " +
            "\"inherited\"). Read the new ones, turn the ones you can justify into status:\"accepted\" " +
            "with real reasoning, repair the rest, then re-run WITHOUT the env var."
        : "",
    ).toBe(false);
  });

  // The census is in the TITLE, not in a console.log a reporter may swallow:
  // this project has twice been misled by a number nobody could see.
  it(`actually walked the tree — ${scan.files} files, ${scan.strings} Cyrillic strings, ${scan.claims.length} claim-bearing, ${citations.pinned} pinned citations, ${quotes.judged} quotations and ${metres.judged} metre figures judged (a scanner that matches nothing passes forever)`, () => {
    expect(scan.files, "files in scope").toBeGreaterThan(1800);
    expect(scan.strings, "Cyrillic strings seen").toBeGreaterThan(25_000);
    // The one scope rule the companion check carries must still be matching
    // something. A rule that matches nothing is a rule written for a shape that
    // moved — see COMPANION_SCOPE_SKIP.
    expect(
      metres.companionScopeSkipped,
      "COMPANION_SCOPE_SKIP matched no answer option — either the options moved to a " +
        "different keypath or every option-borne two-branch figure is gone. Confirm which, " +
        "then delete the rule or fix its test.",
    ).toBeGreaterThan(0);
    expect(scan.claims.length, "claim-bearing strings").toBeGreaterThan(1800);
    expect(citations.pinned, "pinned citations judged").toBeGreaterThan(800);
    expect(quotes.judged, "quotations judged against retrieved text").toBeGreaterThan(100);
    expect(metres.judged, "metre figures judged").toBeGreaterThan(40);
  });

  it("every exclusion rule is alive (a dead rule means a surface moved)", () => {
    const deadFiles = FILE_EXCLUSIONS.filter((r) => scan.fileExclusions[r.name] === 0).map((r) => r.name);
    const deadFields = FIELD_EXCLUSIONS.filter((r) => scan.fieldExclusions[r.name] === 0).map((r) => r.name);
    expect(
      [...deadFiles, ...deadFields],
      "an exclusion that matches nothing was written for a path that no longer exists — confirm the surface it excluded did not move somewhere the gate now ignores, then delete the rule",
    ).toEqual([]);
  });

  it("every registered surface class is still there, above its floor", () => {
    const below = SURFACE_CLASSES.filter((c) => (scan.byClass[c.name] ?? 0) < c.min).map(
      (c) => `${c.name}: ${scan.byClass[c.name] ?? 0} claims, floor ${c.min}`,
    );
    expect(
      below,
      below.length === 0
        ? ""
        : "A SURFACE THE GATE USED TO COVER HAS SHRUNK OR VANISHED:\n" +
            `${below.join("\n")}\n\n` +
            "Either the scanner broke (check the tokenizer and the field exclusions) or the surface " +
            "genuinely moved. A gate whose enumeration quietly empties passes forever — that is the " +
            "failure this assertion exists for.",
    ).toEqual([]);
  });

  it("no unregistered surface has appeared", () => {
    expect(
      scan.unregistered.slice(0, 20),
      scan.unregistered.length === 0
        ? ""
        : `${scan.unregistered.length} in-scope file(s) match no SURFACE_CLASS. A new surface must be ` +
            "registered by a human with a floor, not absorbed silently.",
    ).toEqual([]);
  });

  it("the ground truth it checks against is intact", () => {
    // If чл. 51 ever stopped saying this, checkMetres' companion branch would
    // go quiet — silently, and in the reassuring direction.
    const art51 = getArticle("zdvp", "чл. 51");
    expect(art51.found, "ЗДвП чл. 51 must be retrievable").toBe(true);
    if (art51.found) {
      expect(norm(art51.unit.textBg)).toContain("не по-малко от 2 метра преди първата релса");
      expect(norm(art51.unit.textBg)).toContain("а когато има бариери - на 1 метър от тях");
    }
    // The 50 m myth's home article: it must still contain no metre figure in
    // the level-crossing point, or the myth would silently become "grounded".
    const art98 = getArticle("zdvp", "чл. 98");
    expect(art98.found, "ЗДвП чл. 98 must be retrievable").toBe(true);
    if (art98.found) {
      const railPoint = art98.unit.textBg
        .split("\n")
        .find((line) => line.includes("трамвайни и железопътни линии"));
      expect(railPoint, "чл. 98's rail point must still be there").toBeTruthy();
      expect(railPoint ?? "").not.toMatch(/\d+\s*метра/);
    }
    expect(ACT_IDS.length, "the corpus must not be empty").toBeGreaterThan(3);
  });

  it("the classifiers can fail — negative controls", () => {
    // Each control is a synthetic claim in the shape of a defect this product
    // actually shipped. If one of these PASSES, the gate is decorative.
    const control = (value: string, refs: BoundCitation[] = []): Claim => ({
      file: "control.json",
      cls: "content-other",
      field: "control",
      value,
      recordRefs: refs,
      metres: [],
      negatives: [],
    });
    // Drives the SAME predicates the tree scan drives — see findMetreClaims.
    const withScan = (value: string): Claim => ({
      ...control(value),
      metres: findMetreClaims(value, false),
      negatives: findUniversalNegatives(value),
    });

    // 1. THE 50 m MYTH, stated as law under the article that does not contain it.
    const myth = withScan(
      "ЗДвП чл. 98, ал. 1 забранява престоя на железопътния прелез и на по-малко от 50 метра от двете му страни.",
    );
    expect(checkMetres([myth]).ungrounded.length, "the 50 m myth must be refused").toBe(1);

    // 2. THE PAST-THE-COMMA FAILURE, exactly as four rounds shipped it.
    const comma = withScan(
      "Пред железопътния прелез спираш на не по-малко от 2 метра преди първата релса (ЗДвП чл. 51, ал. 4).",
    );
    expect(
      checkMetres([comma]).companion.length,
      "a claim that states 2 метра and never the barrier branch must be refused",
    ).toBe(1);

    // 2b. …and the same sentence WITH the second branch must pass.
    const whole = withScan(
      "Пред железопътния прелез спираш на не по-малко от 2 метра преди първата релса, а когато има бариери - на 1 метър от тях (ЗДвП чл. 51, ал. 4).",
    );
    expect(checkMetres([whole]).companion.length, "the complete sentence must pass").toBe(0);

    // 2c. THE SAME DEFECT SPELLED OUT IN WORDS — the notation that carried the
    // fifth surviving copy past this gate. This is the sc-pk-rail-ban replay
    // caption as it actually shipped, and before the WORD_NUMERALS widening
    // `findMetreClaims` returned NOTHING for it: no metre hit, therefore no
    // grounding check, therefore no companion check. It read as a clean claim.
    const spelled = withScan(
      "Толкова близо до релсите престой няма: законът иска поне два метра, а тук са метър и деветнайсет (чл. 51, ал. 4; чл. 54, ал. 1).",
    );
    expect(spelled.metres.map((h) => h.digits), "the spelled-out numeral must be read as 2").toEqual([
      "2",
    ]);
    expect(
      checkMetres([spelled]).companion.length,
      "the word-numeral spelling of the past-the-comma defect must be refused too",
    ).toBe(1);

    // 2d. …and stating the branch IN WORDS must be accepted, or the check would
    // demand digits and convict a complete sentence.
    const spelledWhole = withScan(
      "Пред прелез спираш на не по-малко от два метра преди първата релса, а когато има бариери — на един метър от тях (ЗДвП чл. 51, ал. 4).",
    );
    expect(
      checkMetres([spelledWhole]).companion.length,
      "the complete sentence, spelled in words, must pass",
    ).toBe(0);

    // 2e. „сто" must not be read out of „стотици", and a compound fraction must
    // stay UNREAD rather than be guessed at (see WORD_NUMERALS).
    expect(
      findMetreClaims("Спирачният път на влака е стотици метри, затова не се спира.", false),
      "the word numeral must not be read out of the tail of a longer word",
    ).toEqual([]);
    expect(
      findMetreClaims("Законът иска най-малко метър и половина странична дистанция.", false),
      "a compound fraction must not be invented into a figure",
    ).toEqual([]);

    // 2f. THE GROUND TRUTH IS SPELLED OUT TOO, and reading it digits-only
    // convicted a true claim. ЗДвП чл. 66, ал. 1 reads „…длъжен да спре на
    // ЕДИН МЕТЪР зад трамвая" (чл. 183 is the other one), so q-uyazvimi-041 —
    // which says exactly that, and cites exactly that — was reported as an
    // invented figure by the first cut of this widening. Both notations must
    // ground against both notations.
    const tram = withScan(
      "Приближаваш ли отдясно спрял на обозначена спирка трамвай, спираш на един метър зад него (ЗДвП, чл. 66, ал. 1).",
    );
    expect(
      checkMetres([tram]).ungrounded.map((f) => f.subject),
      "a figure the statute spells out must ground against the statute",
    ).toEqual([]);
    const tramDigits = withScan(
      "Приближаваш ли отдясно спрял на обозначена спирка трамвай, спираш на 1 метър зад него (ЗДвП, чл. 66, ал. 1).",
    );
    expect(
      checkMetres([tramDigits]).ungrounded.map((f) => f.subject),
      "…and so must the same figure written in digits",
    ).toEqual([]);

    // 2g. THE RATIONALE MAY NOT VETO THE RULE. This is q-spirane-i-parkirane-025
    // EXACTLY AS IT SHIPPED, status „approved", and the gate written to judge
    // metre figures judged NOTHING in it: „км/ч" in the tail after the dash
    // tripped PHYSICS_NEAR for the whole sentence, so a legal minimum with its
    // article printed beside it was enumerated and never checked. Both halves
    // are asserted — that the figure is now READ, and that reading it convicts.
    const rationale = withScan(
      "Триъгълникът се поставя на не по-малко от 30 метра зад автомобила, в заетата от него лента и срещу посоката на движение (чл. 97 ЗДвП) — при 90 км/ч водачите имат нужда от тези метри, за да реагират навреме.",
    );
    expect(
      rationale.metres.map((h) => h.digits),
      "a legal minimum must not be vetoed by the physics in the clause AFTER the dash",
    ).toEqual(["30"]);
    expect(
      checkMetres([rationale]).companion.length,
      "…and once read, the 30 that hides чл. 97, ал. 4's 100 must be refused",
    ).toBe(1);

    // 2h. …and the veto must still work where it belongs: same vocabulary, but
    // the figure sits IN the physics clause, which is arithmetic about stopping
    // distance and not a claim about ЗДвП. If this ever fires, the whole bank's
    // stopping-distance teaching lands in the findings and the gate gets deleted.
    expect(
      findMetreClaims(
        "Не по-малко от 30 метра е минимумът за триъгълника (ЗДвП чл. 97, ал. 4) — при 90 км/ч колата изминава 25 метра за секунда.",
        false,
      ).map((h) => h.digits),
      "the figure inside the physics clause must stay vetoed while the rule's own figure is read",
    ).toEqual(["30"]);

    // 2i. PAST THE FULL STOP. чл. 97, ал. 4 puts its second governing branch in
    // a SECOND SENTENCE of the same alinea, with no connective at all — the
    // shape the sentence-scoped reading could not reach no matter how the
    // connective list was worded.
    const halfOf97 = withScan(
      "Извън населено място триъгълникът застава на не по-малко от 30 метра зад повредената кола (ЗДвП чл. 97, ал. 4).",
    );
    expect(
      checkMetres([halfOf97]).companion.map((f) => f.subject),
      "a claim that states 30 and never the motorway's 100 must be refused",
    ).toEqual(["30 метра without 100 метра"]);
    const wholeOf97 = withScan(
      "Извън населено място триъгълникът застава на не по-малко от 30 метра зад повредената кола; на автомагистрала същата алинея иска не по-малко от 100 метра (ЗДвП чл. 97, ал. 4).",
    );
    expect(
      checkMetres([wholeOf97]).companion.length,
      "…and the claim that states both branches must pass",
    ).toBe(0);

    // 2j. THE DIVISION IS THE SCOPE, and this is what it buys. чл. 98, ал. 1
    // т. 5 („5 метра" before a crossing) and т. 7 („3 метра" to an unbroken
    // line) are DIFFERENT prohibitions sharing an article, as are чл. 70,
    // ал. 2 т. 1 („150 метра" when meeting) and т. 3 („50 метра" when
    // following). Reading the whole article instead of the division reported
    // all four as hiding each other — 30 false findings, measured.
    const crossing = withScan(
      "Престоят и паркирането са забранени върху пешеходната пътека и на по-малко от 5 метра преди нея (ЗДвП чл. 98, ал. 1, т. 5).",
    );
    expect(
      checkMetres([crossing]).companion.map((f) => f.subject),
      "т. 5 and т. 7 are different prohibitions, not two branches of one rule",
    ).toEqual([]);
    const highBeam = withScan(
      "При разминаване слизаш на къси светлини най-късно когато между вас останат не по-малко от 150 метра (ЗДвП чл. 70, ал. 2).",
    );
    expect(
      checkMetres([highBeam]).companion.map((f) => f.subject),
      "чл. 70's meeting branch and following branch are different points",
    ).toEqual([]);

    // 2k. THE DEFINITE FORM IS A MENTION, NOT AN ASSERTION — both directions,
    // because widening the wrong one of the two readers broke the other.
    expect(
      findMetreClaims("Стоте метра са правилото за автомагистрала (ЗДвП чл. 97, ал. 4).", false),
      "„стоте метра“ refers back to a figure; it asserts no new one",
    ).toEqual([]);
    const backReference = withScan(
      "Извън населено място триъгълникът застава на не по-малко от 30 метра зад повредената кола (ЗДвП чл. 97, ал. 4). Стоте метра са мярката за автомагистрала.",
    );
    expect(
      checkMetres([backReference]).companion.length,
      "…but an author who wrote „стоте метра“ HAS stated the companion branch",
    ).toBe(0);

    // 2l. THE ONE SCOPE RULE, and its edge. An answer option is a candidate
    // answer under a stem that already fixed the case; the item's teaching text
    // is not, and must not inherit the option's exemption.
    const asOption = { ...halfOf97, field: "options[3].textBg" };
    expect(
      checkMetres([asOption]).companion.length,
      "an answer option is not the text that states the rule",
    ).toBe(0);
    const asExplanation = { ...halfOf97, field: "explanationBg" };
    expect(
      checkMetres([asExplanation]).companion.length,
      "…and the explanation beside it still has to state the other branch",
    ).toBe(1);

    // 3. A QUOTATION THE ARTICLE DOES NOT CONTAIN.
    const misquote = control(
      "ЗДвП чл. 51 казва „спирането пред прелез е по преценка на водача“.",
    );
    expect(checkQuotes([misquote]).findings.length, "a fabricated quote must be refused").toBe(1);

    // 3b. A REAL quotation of the same article must pass.
    const realQuote = control(
      "ЗДвП чл. 51 казва „Спирането на пътните превозни средства е задължително пред железопътен прелез, който няма бариери“.",
    );
    expect(checkQuotes([realQuote]).findings.length, "a verbatim quote must pass").toBe(0);

    // 3c. THE DELIBERATE LOSS OF RECALL, locked in. „(чл. 24, ал. 2)" names no
    // act, so the fidelity check declines rather than guessing ЗДвП. If a later
    // widening makes this fire, it will also start convicting sentences that
    // quote ЗАНН, НК or a наредба — read the header before changing it.
    const inferredAct = control(
      "Трябва да се убедиш, че „няма да създадеш опасност за останалите участници“ (чл. 24, ал. 2).",
    );
    expect(
      checkQuotes([inferredAct]).findings.length,
      "a quotation beside a citation that names no act must not be judged",
    ).toBe(0);

    // 4. A QUOTATION THAT STOPS AT THE COMMA.
    const truncated = control(
      "Законът е ясен: „спират на разстояние не по-малко от 2 метра преди първата релса“ (ЗДвП чл. 51, ал. 4).",
    );
    const truncFindings = checkQuotes([truncated]).findings;
    expect(
      truncFindings.map((f) => f.kind),
      "a quotation cut off before „а когато има бариери“ must be refused",
    ).toEqual(["quote-truncated-before-exception"]);

    // 5. AN ARTICLE NUMBER THAT DOES NOT EXIST.
    const ghost = control("Виж ЗДвП чл. 9999 за подробности.");
    expect(checkCitationsResolve([ghost]).findings.length, "чл. 9999 must be refused").toBe(1);

    // 6. AN ARTICLE ON AN ACT NOBODY HERE CAN OPEN — counted, never judged true.
    const foreign = control("Виж ППЗДвП чл. 31 за подробности.");
    const foreignResult = checkCitationsResolve([foreign]);
    expect(foreignResult.findings.length, "an unopenable act is not a falsehood").toBe(0);
    expect(foreignResult.uncheckable["content-other"], "…but it IS counted").toBe(1);

    // 7. A NEW UNIVERSAL NEGATIVE — must be found, so the ledger can refuse it.
    const uneg = withScan(
      "Единственото разстояние, което законът пише за прелез, са тези два метра.",
    );
    expect(checkUniversalNegatives([uneg]).length, "a universal negative must be caught").toBe(1);

    // 8. …and a non-legal „единствен" must NOT fire.
    const innocent = withScan("Това е единствената свободна лента вдясно.");
    expect(checkUniversalNegatives([innocent]).length, "„единствената лента“ is not a legal claim").toBe(0);
  });

  it("the ledger is a review, not a rubber stamp", () => {
    expect(ledger.note, "content/law/claim-ledger.json must exist — run CLAIM_LEDGER_SEED=1 once").not.toBe(
      "MISSING",
    );
    expect(ledger.pins.length, "an empty ledger means the scan found nothing").toBeGreaterThan(0);
    const ids = ledger.pins.map((p) => p.id);
    expect(new Set(ids).size, "duplicate pin ids").toBe(ids.length);
    const thin = ledger.pins.filter((p) => p.why.trim().length < 40).map((p) => p.id);
    expect(thin, "every pin must carry reasoning, not a shrug").toEqual([]);
  });

  it(`carries ${unacceptedPins.length} pins that are NOT accepted (${openDefects.length} known-broken), and that number may only shrink`, () => {
    // Frozen 2026-09-10 at the seeded population. Lowering this line is the
    // only way to record review work; raising it is how a gate dies.
    //
    // 130 -> 129 on 2026-09-10. The one open defect was REPAIRED, not
    // re-pinned: rules/n38.ts printed „длъжен е да спре плавно…" inside
    // quotation marks and attributed it to ЗДвП чл. 103, which reads „…е
    // длъжен да спре плавно…". The copy now quotes the statute's own word
    // order, so the pin was dropped as stale rather than kept as tolerated.
    // The eight findings the WORD_NUMERALS widening added were all reviewed
    // and marked accepted in the same pass, so the inherited-unreviewed
    // population is unchanged at 129 and no new claim was tolerated silently.
    const FROZEN = 129;
    expect(
      unacceptedPins.length,
      `${unacceptedPins.length} pins in content/law/claim-ledger.json are inherited-and-unreviewed or ` +
        `filed as open defects. The ceiling is ${FROZEN}. If you added one, you are asking the gate ` +
        "to tolerate a claim nobody has justified — write the reasoning and mark it accepted, or " +
        "repair the claim and delete the pin.\n\nOpen defects on record:\n" +
        openDefects.map((p) => `  ${p.where} „${p.subject}"`).join("\n"),
    ).toBeLessThanOrEqual(FROZEN);
  });

  it("no ledger pin has gone stale (a pin whose claim is gone is a lie about coverage)", () => {
    expect(
      stalePins.map((p) => `${p.id} ${p.kind} ${p.where} „${p.subject}"`),
      stalePins.length === 0
        ? ""
        : `${stalePins.length} ledger pin(s) no longer match anything in the tree. Either the claim ` +
            "was repaired — delete the pin — or the scanner stopped seeing the surface, which is the " +
            "failure mode this whole file is built against. Do not delete pins in bulk without checking which.",
    ).toEqual([]);
  });
});

describe("the claim gate: every citation resolves", () => {
  it("no student-facing sentence cites an article that does not exist", () => {
    expect(
      citations.findings.length,
      citations.findings.length === 0
        ? ""
        : `${citations.findings.length} citation(s) name an article the corpus does not have:\n` +
            `${report(citations.findings)}\n\n` +
            "ADR-002: retrieval or nothing. An article number that resolves to nothing was free-recalled.",
    ).toBe(0);
  });

  it("citations to acts this repo cannot open stay under their frozen ceiling", () => {
    const over = Object.entries(citations.uncheckable)
      .filter(([cls, n]) => n > (UNCHECKABLE_ACT_CEILINGS[cls] ?? 0))
      .map(([cls, n]) => `${cls}: ${n} > ceiling ${UNCHECKABLE_ACT_CEILINGS[cls] ?? 0}`);
    expect(
      over,
      over.length === 0
        ? ""
        : "MORE ARTICLE NUMBERS ON ACTS NOBODY HERE CAN CHECK:\n" +
            `${over.join("\n")}\n\n` +
            "The founder's standing ruling (content/law/README.md): the rule and the act with NO " +
            "ARTICLE NUMBER beats a number nobody can verify. Either ingest the act into " +
            "content/law/acts, or drop the number and keep the subject.",
    ).toEqual([]);
    // …and the ceiling must be measuring something.
    expect(Object.values(citations.uncheckable).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe("the claim gate: quotations say what the law says", () => {
  it("every quotation presented as the law's own words is verbatim in it", () => {
    const rows = quotes.findings.filter(
      (f) => f.kind === "quote-not-in-source" && !pinsById.has(pinId(f.kind, f.where, f.subject)),
    );
    expect(
      rows.length,
      rows.length === 0
        ? ""
        : `${rows.length} quotation(s) do not appear in the article they are attributed to:\n${report(rows)}`,
    ).toBe(0);
  });

  it("no quotation stops before the branch that governs the other case", () => {
    const rows = quotes.findings.filter(
      (f) =>
        f.kind === "quote-truncated-before-exception" &&
        !pinsById.has(pinId(f.kind, f.where, f.subject)),
    );
    expect(
      rows.length,
      rows.length === 0
        ? ""
        : `${rows.length} quotation(s) end at a comma the statute continues past:\n${report(rows)}\n\n` +
            "This is the shape of the чл. 51, ал. 4 defect: the second half of the sentence is the " +
            "half that governs the other case, and cutting it turns a rule into a false universal.",
    ).toBe(0);
  });
});

describe("the claim gate: metre figures come from the law", () => {
  it("every metre figure offered as a legal requirement is in a cited article", () => {
    const rows = metres.ungrounded.filter((f) => !pinsById.has(pinId(f.kind, f.where, f.subject)));
    expect(
      rows.length,
      rows.length === 0
        ? ""
        : `${rows.length} metre figure(s) presented as law appear in no article the record cites:\n` +
            `${report(rows)}\n\n` +
            "This is the 50-metre myth's exact shape. Either cite the article that carries the number, " +
            "or state the rule without a figure.",
    ).toBe(0);
  });

  /**
   * NO ALLOW-LIST. This is the defect the gate was built for; a slot to pin it
   * in would be the neutralisation five rounds of adversarial passes kept
   * finding. If this goes red, the repair is to state the other branch.
   */
  it("no claim states one branch of a two-branch rule and hides the other", () => {
    expect(
      metres.companion.length,
      metres.companion.length === 0
        ? ""
        : `${metres.companion.length} claim(s) quote one figure from a statute sentence that carries a ` +
            `second, governing branch with a different figure:\n${report(metres.companion)}\n\n` +
            "THIS IS THE PAST-THE-COMMA DEFECT. чл. 51, ал. 4 reads „…не по-малко от 2 метра преди " +
            "първата релса, А КОГАТО ИМА БАРИЕРИ - НА 1 МЕТЪР ОТ ТЯХ.“ A claim that states only the " +
            "first half teaches a rule the same sentence refutes — and on a guarded crossing the " +
            "SECOND branch is the one that governs. There is deliberately no allow-list for this " +
            "check: state the other branch.",
    ).toBe(0);
  });
});

describe("the claim gate: universal negatives are pinned by a human", () => {
  it("no unreviewed claim about what the law does NOT contain", () => {
    const rows = negatives.filter((f) => !pinsById.has(pinId(f.kind, f.where, f.subject)));
    expect(
      rows.length,
      rows.length === 0
        ? ""
        : `${rows.length} NEW universal negative(s) about the law:\n${report(rows)}\n\n` +
            "A universal negative cannot be checked mechanically — proving the law says nothing else " +
            "would mean reading all 288 articles and agreeing what „else“ means. So each one needs a " +
            "human: read the article, write down why the claim is safe, and add it to " +
            "content/law/claim-ledger.json with status „accepted“. If you cannot write that " +
            "sentence, the claim should not ship — that is what happened to „единственото " +
            "разстояние, което законът пише за прелез“ four times running.",
    ).toBe(0);
  });
});

describe("the claim gate: the shipped copy is the copy that was fixed", () => {
  it("content/ and platform/public/ mirrors agree", () => {
    expect(
      mirrors.slice(0, 20),
      mirrors.length === 0
        ? ""
        : `${mirrors.length} mirror disagreement(s):\n  ${mirrors.slice(0, 20).join("\n  ")}\n\n` +
            "The browser fetches platform/public. A caption repaired only in content/ ships nothing, " +
            "and a caption repaired only in public/ is invisible to every content gate.",
    ).toEqual([]);
  });

  /**
   * A GATE ON AN ASSUMPTION. Sign MEANINGS are withheld today because 0 of 77
   * rows in content/signs/signs.json are `approved` and `signClearance` refuses
   * anything else — so there is no student-facing sign prose for this gate to
   * check. The day somebody signs a row at /review, 77 meanings with 97 lawRefs
   * go live and this assertion goes red naming the file to widen.
   */
  it("no sign meaning has gone live behind the gate's back", () => {
    const signsPath = path.join(REPO, "content", "signs", "signs.json");
    const signs = JSON.parse(fs.readFileSync(signsPath, "utf8")) as
      | Array<{ status?: string }>
      | { signs?: Array<{ status?: string }> };
    const rows = Array.isArray(signs) ? signs : (signs.signs ?? []);
    expect(rows.length, "signs.json must not be empty").toBeGreaterThan(50);
    const approved = rows.filter((s) => s.status === "approved").length;
    expect(
      approved,
      approved === 0
        ? ""
        : `${approved} sign row(s) in content/signs/signs.json are now „approved", so their meaningBg ` +
            "and lawRefs render in the classroom (modules/lesson/resolve.ts:166). This gate does not " +
            "check sign prose yet — widen it to cover meaningBg before signing rows, or this is a " +
            "surface with no gate on it at all.",
    ).toBe(0);
  });
});
