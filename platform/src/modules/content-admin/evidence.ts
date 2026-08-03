/**
 * Everything the founder needs on screen to clear one row in ten seconds,
 * assembled server-side. Three independent pieces of evidence:
 *
 *  1. THE VERBATIM SOURCE LINE. Every `lawRef` is RETRIEVED from content/law
 *     and shown as act text (ADR-002: retrieval + citation only — this file
 *     never restates a rule, an article number or a figure, and when the
 *     corpus misses it says so instead of filling the gap).
 *
 *  2. THE CLAIM CHECK. Bulgarian quotation marks „…“ inside our explanation are
 *     the author asserting "the statute says this". Each such span is tested,
 *     verbatim, against the retrieved text of the articles the row cites. A
 *     span that appears nowhere in them is the single highest-value thing a
 *     reviewer can be shown: it is how a fabricated 50-metre rule gets caught
 *     (docs/education/90 §4.3).
 *
 *  3. WHAT CHANGED. A field-level before/after against a git baseline, so a row
 *     a fix wave rewrote can be judged as a diff instead of re-read from
 *     scratch. Never fatal: no git, no baseline, no diff — the review continues.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { actIdForActName, normaliseForMatch, normaliseUnitRef, resolveLawRef } from "@/lib/content/law";
import type { Question } from "@/lib/content/types";
import { stripReviewPrefix } from "./logic";
import type {
  FieldChange,
  KeyChange,
  LawRefEvidence,
  QuestionDiff,
  QuotedClaim,
  ReviewRisk,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error("modules/content-admin/evidence is server-only");
}

/** Statute articles run long (чл. 21 is a speed table); keep the page sane. */
const MAX_ARTICLE_CHARS = 4000;

/** Quotes shorter than this are punctuation noise, not a legal claim. */
const MIN_QUOTE_CHARS = 12;

// ---------------------------------------------------------------------------
// 1. Retrieved law
// ---------------------------------------------------------------------------

const MISS_REASON_BG: Record<string, string> = {
  "act-not-in-corpus":
    "Този акт още не е в корпуса (content/law) — текстът не може да бъде показан, значи и не може да бъде проверен тук.",
  "unit-not-found":
    "Актът е зареден, но няма такъв член в него. Или номерът е сгрешен, или членът е отменен.",
};

/**
 * Two refs that resolve to the SAME article — `чл. 5, ал. 1, т. 1` and
 * `чл. 5, ал. 3, т. 1` — would otherwise print чл. 5 twice, at full length,
 * on the same card. Grouping them keeps both citations visible while the
 * statute appears once, which is the difference between a card you can read in
 * ten seconds and one you scroll past.
 */
function groupByResolvedUnit(
  lawRefs: readonly { act: string; ref: string }[],
): { act: string; refs: string[] }[] {
  const groups = new Map<string, { act: string; refs: string[] }>();
  for (const ref of lawRefs) {
    const actId = actIdForActName(ref.act);
    const unit = normaliseUnitRef(ref.ref) ?? ref.ref.trim();
    // Unresolvable acts keep their raw name as the key so two different
    // unknown acts never merge into one card.
    const key = `${actId ?? ref.act.trim()}|${unit}`;
    const existing = groups.get(key);
    if (existing) existing.refs.push(ref.ref);
    else groups.set(key, { act: ref.act, refs: [ref.ref] });
  }
  return [...groups.values()];
}

export function lawEvidenceFor(lawRefs: readonly { act: string; ref: string }[]): LawRefEvidence[] {
  return groupByResolvedUnit(lawRefs).map((group) => {
    const ref = { act: group.act, ref: group.refs[0] };
    const label = group.refs.join(" · ");
    const unverified = group.refs.some((r) => /\?\s*$/.test(r));
    const lookup = resolveLawRef(ref);
    if (!lookup.found) {
      return {
        act: ref.act,
        ref: label,
        unverified,
        found: false,
        citationBg: null,
        contextBg: null,
        textBg: null,
        truncated: false,
        missReasonBg: MISS_REASON_BG[lookup.reason] ?? "Неуспешно извличане.",
        sourceUrl: null,
        sourceVersionBg: null,
      };
    }
    const full = lookup.unit.textBg;
    const truncated = full.length > MAX_ARTICLE_CHARS;
    return {
      act: ref.act,
      ref: label,
      unverified,
      found: true,
      citationBg: lookup.citationBg,
      contextBg: lookup.unit.contextBg,
      textBg: truncated ? `${full.slice(0, MAX_ARTICLE_CHARS)}…` : full,
      truncated,
      missReasonBg: null,
      sourceUrl: lookup.source?.url ?? null,
      sourceVersionBg: lookup.source?.versionBg ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Quoted claims
// ---------------------------------------------------------------------------

/** Bulgarian „…“ plus the ASCII and guillemet variants that creep in. */
const QUOTE_RE = /„([^“”"»]{4,400})[“”]|«([^»]{4,400})»|"([^"]{4,400})"/g;

export function quotedSpans(text: string): string[] {
  const out: string[] = [];
  QUOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_RE.exec(text)) !== null) {
    const span = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (span.length >= MIN_QUOTE_CHARS) out.push(span);
  }
  return [...new Set(out)];
}

/**
 * Check each quoted span against the retrieved articles. Matching runs through
 * `normaliseForMatch` — the .docx carries soft hyphens and non-breaking spaces
 * that would otherwise turn a correct quote into a false alarm.
 */
export function checkQuotedClaims(
  explanationBg: string,
  evidence: readonly LawRefEvidence[],
): QuotedClaim[] {
  const haystacks = evidence
    .filter((e) => e.found && e.textBg !== null)
    .map((e) => ({ ref: e.ref, text: normaliseForMatch(e.textBg as string) }));

  return quotedSpans(explanationBg).map((quote) => {
    const needle = normaliseForMatch(quote);
    const hit = haystacks.find((h) => h.text.includes(needle));
    return { quote, foundInRef: hit ? hit.ref : null };
  });
}

// ---------------------------------------------------------------------------
// 3. What changed
// ---------------------------------------------------------------------------

const DEFAULT_BASE_REF = process.env.REVIEW_DIFF_BASE ?? "HEAD";

type RawQuestion = Record<string, unknown>;

/**
 * The baseline copy of every question file, read from git.
 *
 * CACHING, AND THE OBJECTION THAT USED TO FORBID IT. This was built fresh per
 * request because a cache keyed by (repoRoot, baseRef, slug) outlives the
 * request in dev's module registry and goes stale the moment the lead commits.
 * That objection is answered by keying on the RESOLVED COMMIT SHA instead of on
 * the symbolic ref: `git rev-parse HEAD` costs ~0.36 s, and the moment a commit
 * lands the key changes and the cache is simply missed.
 *
 * It has to be cached now because ranking the queue by risk needs the baseline
 * for EVERY queued row, not just the twenty on screen — measured 7.2 s for all
 * sixteen files on this box's spinning E: drive, which is not a per-request
 * cost anyone would pay twice.
 */
export interface DiffBaseline {
  baseRef: string;
  available: boolean;
  unavailableReasonBg: string | null;
  /** questionId -> the row as it stood at baseRef. */
  rows: Map<string, RawQuestion>;
}

/**
 * Read many blobs out of git in ONE process.
 *
 * `git show` per file cost 0.45 s a piece on this box's spinning E: drive —
 * fine for the four topics on a page, 7.2 s once the risk ranking needed all
 * sixteen, which is past vitest's default 5 s timeout and well past what a page
 * load should spend. `cat-file --batch` takes the paths on stdin and streams
 * back `<sha> <type> <size>\n<bytes>\n` frames: 0.80 s for the same sixteen.
 *
 * Missing paths come back as `<name> missing` (no size, no body) and are simply
 * absent from the returned map — a topic that did not exist at the baseline is
 * not an error, it is a topic whose rows are all "new".
 */
function gitReadBlobs(
  repoRoot: string,
  baseRef: string,
  relPaths: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (relPaths.length === 0) return out;

  let buf: Buffer;
  try {
    buf = execFileSync("git", ["cat-file", "--batch"], {
      cwd: repoRoot,
      input: relPaths.map((rel) => `${baseRef}:${rel}`).join("\n") + "\n",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    return out;
  }

  // Frames come back in request order, so the path is positional — the header
  // carries the object's sha, not the name we asked for.
  let offset = 0;
  let index = 0;
  while (offset < buf.length && index < relPaths.length) {
    const nl = buf.indexOf(10, offset);
    if (nl < 0) break;
    const header = buf.toString("utf8", offset, nl);
    offset = nl + 1;
    const match = /^[0-9a-f]{40,64} \w+ (\d+)$/.exec(header);
    if (match === null) {
      // "<name> missing" / "<name> ambiguous" — one line, no body.
      index += 1;
      continue;
    }
    const size = Number(match[1]);
    out.set(relPaths[index], buf.toString("utf8", offset, offset + size));
    offset += size + 1; // trailing newline after each blob
    index += 1;
  }
  return out;
}

/** The commit a symbolic ref points at, or null when this is not a repo. */
function resolveRef(repoRoot: string, baseRef: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", baseRef], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

/** Keyed by repoRoot + the RESOLVED sha + the slug set — never by "HEAD". */
const baselineCache = new Map<string, DiffBaseline>();

/**
 * Load the baseline rows for the given topic slugs. `repoRoot` is the directory
 * that holds `content/` — git is invoked there, so a checkout that is not a
 * repo simply yields `available: false`.
 */
export function loadDiffBaseline(
  repoRoot: string,
  slugs: readonly string[],
  baseRef: string = DEFAULT_BASE_REF,
): DiffBaseline {
  const wanted = [...new Set(slugs)].sort();
  const sha = resolveRef(repoRoot, baseRef);
  const cacheKey = sha === null ? null : `${repoRoot}|${sha}|${wanted.join(",")}`;
  if (cacheKey !== null) {
    const hit = baselineCache.get(cacheKey);
    if (hit !== undefined) return hit;
  }

  const rows = new Map<string, RawQuestion>();
  // git wants forward slashes in a pathspec even on Windows.
  const blobs = gitReadBlobs(
    repoRoot,
    baseRef,
    wanted.map((slug) => `content/questions/${slug}.json`),
  );
  const anyFile = blobs.size > 0;

  for (const text of blobs.values()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed as RawQuestion[]) {
        if (typeof row?.id === "string") rows.set(row.id, row);
      }
    } catch {
      /* a malformed baseline is simply no baseline */
    }
  }

  const result: DiffBaseline = anyFile
    ? { baseRef, available: true, unavailableReasonBg: null, rows }
    : {
        baseRef,
        available: false,
        unavailableReasonBg: `Няма git сравнение спрямо „${baseRef}“ (не е репо, или файловете липсват там). Прегледай реда както си е.`,
        rows,
      };

  // Only a resolvable ref is cacheable: without a sha there is no key that a
  // later commit can invalidate, and a stale baseline is worse than a slow one.
  if (cacheKey !== null) {
    // The working tree changes constantly here; the BASELINE does not. One
    // entry per (sha, slug-set) is a handful of maps — but bound it anyway so a
    // long dev session cannot grow it without limit.
    if (baselineCache.size > 8) baselineCache.clear();
    baselineCache.set(cacheKey, result);
  }
  return result;
}

function renderOptions(row: RawQuestion): string {
  const options = Array.isArray(row.options) ? (row.options as RawQuestion[]) : [];
  return options
    .map((o) => `${o.correct === true ? "✔" : "✘"} (${String(o.id)}) ${String(o.textBg ?? "")}`)
    .join("\n");
}

function renderLawRefs(row: RawQuestion): string {
  const refs = Array.isArray(row.lawRefs) ? (row.lawRefs as RawQuestion[]) : [];
  return refs.map((l) => `${String(l.act ?? "")} ${String(l.ref ?? "")}`).join(" · ");
}

/**
 * The explanation MINUS any leading `[REVIEW: …]`, on both sides of the diff.
 *
 * Without this the auditor's note is printed twice on every card — once in its
 * own „Бележка от одитор" box and again, in full, as the diff's "after". The
 * notes this wave wrote run 600–1,000 characters, so the founder was re-reading
 * a paragraph of agent working-notes on all 252 rows for nothing, and the
 * sentence that ACTUALLY changed was buried inside it.
 */
function renderExplanation(row: RawQuestion): string {
  return stripReviewPrefix(String(row.explanationBg ?? ""));
}

const FIELDS: { field: string; labelBg: string; render: (row: RawQuestion) => string }[] = [
  { field: "textBg", labelBg: "Текст на въпроса", render: (r) => String(r.textBg ?? "") },
  { field: "options", labelBg: "Отговори и ключ", render: renderOptions },
  { field: "explanationBg", labelBg: "Обяснение", render: renderExplanation },
  { field: "lawRefs", labelBg: "Правни основания", render: renderLawRefs },
  { field: "type", labelBg: "Тип", render: (r) => String(r.type ?? "") },
  { field: "points", labelBg: "Точки", render: (r) => String(r.points ?? "") },
];

// ---------------------------------------------------------------------------
// Risk — which of these 252 rows could actually fail a student
// ---------------------------------------------------------------------------

/**
 * The set of option ids marked correct, as a stable string. This — not the
 * `options` field as a whole — is the answer key. A wave that rewords option
 * (c) and a wave that moves the ✔ off it both show up as "options changed";
 * only the second one can mark a right answer wrong on an exam.
 */
function answerKey(row: RawQuestion): string {
  const options = Array.isArray(row.options) ? (row.options as RawQuestion[]) : [];
  return options
    .filter((o) => o.correct === true)
    .map((o) => String(o.id))
    .sort()
    .join(",");
}

/**
 * Rank a queued row by what a wrong decision on it would cost a student.
 *
 * The order is deliberate and is the whole point of the band:
 *   key-flip     the graded answer moved. Approve it wrong and every student
 *                who picks the old answer is marked down — or the other way
 *                round. There are six of these in 252.
 *   answer-text  a graded option's WORDING changed; the key is the same letter
 *                but it may no longer mean the same thing.
 *   stem         the question itself was re-asked.
 *   explanation  only the teaching text moved (THEO-4 still applies, but a
 *                student is not graded on it).
 *   citation     article numbers were tidied. Real work, zero exam risk.
 *   untouched    already in the queue before this wave; nothing changed.
 */
const RISK_ORDER: Record<ReviewRisk, number> = {
  "key-flip": 0,
  "answer-text": 1,
  stem: 2,
  explanation: 3,
  citation: 4,
  untouched: 5,
};

export function compareRisk(a: ReviewRisk, b: ReviewRisk): number {
  return RISK_ORDER[a] - RISK_ORDER[b];
}

export const RISK_LABEL_BG: Record<ReviewRisk, string> = {
  "key-flip": "Сменен ключ",
  "answer-text": "Променен отговор",
  stem: "Променен въпрос",
  explanation: "Само обяснение",
  citation: "Само цитати",
  untouched: "Без промяна",
};

function classifyRisk(changes: readonly FieldChange[], keyChange: KeyChange | null): ReviewRisk {
  if (keyChange !== null) return "key-flip";
  const touched = new Set(changes.map((c) => c.field));
  if (touched.has("options") || touched.has("type") || touched.has("points")) return "answer-text";
  if (touched.has("textBg")) return "stem";
  if (touched.has("explanationBg")) return "explanation";
  if (touched.has("lawRefs")) return "citation";
  return "untouched";
}

export function diffAgainstBaseline(q: Question, baseline: DiffBaseline): QuestionDiff {
  if (!baseline.available) {
    return {
      baseRef: baseline.baseRef,
      kind: "unavailable",
      changes: [],
      beforeStatus: null,
      unavailableReasonBg: baseline.unavailableReasonBg,
      // No baseline, no evidence of safety — an unrankable row must not sort
      // below a merely-tidied citation, so it rides with the answer-text band.
      risk: "answer-text",
      keyChange: null,
    };
  }
  const before = baseline.rows.get(q.id);
  if (before === undefined) {
    return {
      baseRef: baseline.baseRef,
      kind: "new",
      changes: [],
      beforeStatus: null,
      unavailableReasonBg: null,
      // A brand-new row has never been read by anyone. Its key is unexamined,
      // which is the same exposure as one that just moved.
      risk: "key-flip",
      keyChange: null,
    };
  }

  const now = q as unknown as RawQuestion;
  const changes: FieldChange[] = [];
  for (const { field, labelBg, render } of FIELDS) {
    const a = render(before);
    const b = render(now);
    if (a !== b) changes.push({ field, labelBg, before: a, after: b });
  }

  const keyBefore = answerKey(before);
  const keyAfter = answerKey(now);
  const keyChange: KeyChange | null =
    keyBefore === keyAfter ? null : { before: keyBefore, after: keyAfter };

  return {
    baseRef: baseline.baseRef,
    kind: changes.length === 0 ? "unchanged" : "changed",
    changes,
    beforeStatus: typeof before.status === "string" ? before.status : null,
    unavailableReasonBg: null,
    risk: classifyRisk(changes, keyChange),
    keyChange,
  };
}

/** The repo root that holds `content/` — git's cwd. */
export function repoRootFor(contentDir: string): string {
  return path.resolve(contentDir, "..");
}
