/**
 * Student-facing text sanitiser — the content loader's last line of defence
 * against internal staff annotations reaching a learner (audit M-6).
 *
 * Authors and auditors leave bracketed notes to themselves inside content
 * strings — `[REVIEW: точният член от ЗДвП да се потвърди?]` prepended to an
 * `explanationBg`, a stray `[TODO: …]` mid-sentence. Those notes admit the
 * platform is unsure of the law it is teaching; a 17-year-old must never see
 * one. The founder review tool already strips the leading `[REVIEW: …]` note
 * (modules/content-admin), but it runs only where the founder works, never on
 * the render path — so a note that survives in a JSON file ships verbatim.
 *
 * This module closes that hole at the boundary: every string that comes off
 * disk passes through sanitizeContentTree() before validation, so no consumer
 * of ContentRepo can ever be handed an annotation, whatever the JSON says.
 * The founder tool is unaffected — it reads the files directly (content-admin/
 * io.ts), so the notes it exists to surface are still there for the founder.
 *
 * Deliberately narrow: only ALL-CAPS Latin marker tokens from a fixed
 * vocabulary count as an annotation, so ordinary Bulgarian prose that happens
 * to use brackets (e.g. „[виж чл. 5]") is left exactly as authored.
 */

/**
 * The annotation markers staff actually use. ALL-CAPS Latin only — the
 * user-facing content is Bulgarian, so an uppercase Latin marker followed by
 * `:` or `]` is unambiguously a note to ourselves, never learner copy.
 */
export const STAFF_ANNOTATION_MARKERS = [
  "REVIEW",
  "TODO",
  "FIXME",
  "TBD",
  "XXX",
  "HACK",
  "NOTE",
  "CHECK",
  "VERIFY",
  "QA",
] as const;

/**
 * One bracketed staff annotation anywhere in a string: `[MARKER]` or
 * `[MARKER: free text]`. The body stops at the first `]` — notes never nest
 * brackets (same assumption as content-admin's REVIEW_PREFIX_RE). Case
 * SENSITIVE on purpose: lowercase `[note: …]` in Bulgarian copy would be the
 * author writing to the reader, not to us.
 */
export const STAFF_ANNOTATION_RE = new RegExp(
  `\\[\\s*(?:${STAFF_ANNOTATION_MARKERS.join("|")})\\s*(?::[^\\]]*)?\\]`,
  "g",
);

/** True if the text carries at least one bracketed staff annotation. */
export function containsStaffAnnotation(text: string): boolean {
  // Fresh lastIndex: STAFF_ANNOTATION_RE is a /g/ regex shared across calls.
  STAFF_ANNOTATION_RE.lastIndex = 0;
  return STAFF_ANNOTATION_RE.test(text);
}

/**
 * Remove every bracketed staff annotation and tidy the seam it leaves behind:
 * the horizontal whitespace that flanked the note collapses to a single space
 * and the string is trimmed. Newlines survive untouched so a multi-paragraph
 * explanation keeps its shape. Idempotent; a no-op on clean text.
 */
export function stripStaffAnnotations(text: string): string {
  if (!text.includes("[")) return text; // overwhelmingly the common case
  STAFF_ANNOTATION_RE.lastIndex = 0;
  if (!STAFF_ANNOTATION_RE.test(text)) return text;
  return text
    .replace(STAFF_ANNOTATION_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Deep-sanitise parsed JSON: every string in the tree loses its staff
 * annotations, structure and non-string values pass through unchanged.
 *
 * Applied to WHOLE files rather than a hand-picked list of learner-facing
 * fields on purpose — a whitelist rots the moment someone adds a field, and
 * the fields that are not learner-facing (ids, slugs, file paths) are charset-
 * locked by their schemas and cannot contain a bracket anyway.
 *
 * Returns the input node itself when nothing changed, so clean content — the
 * normal case — costs no allocations.
 */
export function sanitizeContentTree<T>(node: T): T {
  if (typeof node === "string") {
    return stripStaffAnnotations(node) as T;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((item) => {
      const clean = sanitizeContentTree(item);
      if (clean !== item) changed = true;
      return clean;
    });
    return (changed ? out : node) as T;
  }
  // Plain objects only — `null` is typeof "object", and we never see class
  // instances here (the input is always JSON.parse output or a test fixture).
  if (node !== null && typeof node === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const clean = sanitizeContentTree(value);
      if (clean !== value) changed = true;
      out[key] = clean;
    }
    return (changed ? out : node) as T;
  }
  return node;
}
