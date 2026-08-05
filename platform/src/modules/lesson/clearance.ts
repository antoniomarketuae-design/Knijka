/**
 * THE GATE. One door for every string this module speaks to a student.
 *
 * WHAT WAS WRONG. `narration.ts:87` refuses to speak authored text that is not
 * `approved`. `resolve.ts` read `concept.summaryBg` and returned it, with no
 * check of any kind — so the gated path was silent (no narration provider is
 * registered in production) and the ungated path did all the talking. A
 * verifier ran the real resolver over the real content and the first-aid lesson
 * spoke, verbatim, „Дишащ, но в безсъзнание човек се поставя в стабилно
 * странично положение" — the exact instruction q-ptp-022 now grades as WRONG,
 * because ERC 2025 reads „In cases of not normal breathing or trauma, do NOT
 * move the person into the recovery position."
 * (content/medical/tools/erc2025_layperson.txt:768).
 *
 * WHY A TABLE AND NOT AN `if`. An `if` in `resolveSay` closes the case it was
 * written for. The next `case` added to that switch — and `question` and `sign`
 * were already sitting in it, ungated, waiting for a lesson to speak them —
 * inherits nothing. So the decision moves into `SAY_CLASS`, which is typed
 * `Record<SayRef["src"], SayClass>`: adding a source kind to `types.ts` fails
 * to compile until somebody says what clearance it has. That is the part that
 * cannot be forgotten.
 *
 * THE FIVE CLASSES, and what each one is honestly claiming:
 *
 *   signed     the row carries `status` from content/SCHEMA.md, and only
 *              `approved` is spoken. This is literally narration.ts's check.
 *              → question (questions/*.json), sign (signs/signs.json)
 *
 *   carried    the row is student-facing content whose FILE HAS NO STATUS
 *              FIELD — concepts.json. Nothing can be checked, so what is
 *              carried is pinned by the hash of the sentence itself
 *              (clearanceCarry.ts), under one of two authorities: the dated
 *              FREEZE, which covers only the bytes of one immutable git blob,
 *              or a per-row human CLEARANCE, which is the only thing that can
 *              cover text written after the freeze. Fails closed: unknown id,
 *              new concept, or an edited summary all go quiet.
 *              → concept
 *
 *   catalogue  founder-authored TypeScript in modules/sim — the scenario
 *              templates and the 58-entry rule catalogue. They never entered
 *              the content pipeline, so they have no status to check; they are
 *              reviewed by the founder review that authored them. RESIDUAL,
 *              recorded here so it is not mistaken for a gate: if that
 *              catalogue is ever wrong, this module will speak it.
 *              → mistake, teach, rule
 *
 *   agenda     topics.json `descriptionBg` — the table of contents for a
 *              topic („Какво е ПТП и какво си длъжен да направиш: …"). It
 *              names subjects; it states no rule, no number, no article and no
 *              consequence, which is the same contract frames.ts lives under
 *              and `clearance.test.ts` enforces on both.
 *              → topic
 *
 *   frame      this module's own stage directions (frames.ts).
 *              → frame
 *
 * WHAT A WITHHELD SOURCE DOES. It does not throw and it does not substitute:
 * there is nothing to substitute WITH, because a fallback string about first
 * aid would be the very thing this file exists to prevent. The utterance is
 * dropped, the withholding is recorded (`recentWithheldSources`, the sink is
 * the seam for a persistent one), and if a beat is left with nothing
 * substantive to say, resolve.ts speaks one claim-free frame line telling the
 * student that this part is under review. Silence would be a bare verdict
 * (THEO-4) and an empty bubble would be a lie about what the classroom knows.
 *
 * PRIVACY. A withheld record names the LESSON and the SOURCE, never a user —
 * the same rule interrupt.ts's content-gap ring keeps under ADR-004.
 *
 * SERVER/BUILD ONLY (node:crypto + the content repo).
 */

import { createHash } from "node:crypto";
import type { Concept, LawRef, Question, Sign } from "@/lib/content/types";
import { CARRIED_CONCEPT_SUMMARIES, CLEARED_SINCE_FREEZE } from "./clearanceCarry";
import { CARRIED_CONCEPT_CITATIONS } from "./clearanceCitations";
import { CARRIED_QUESTION_CITATIONS } from "./clearanceQuestionCitations";
import type { SayRef } from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "modules/lesson/clearance is server-only — client code imports @/modules/lesson/client",
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export type SayClass = "signed" | "carried" | "catalogue" | "agenda" | "frame";

/**
 * Every source kind, classified. Exhaustive BY TYPE: a new member of `SayRef`
 * breaks this line until it is classified, which is the only way a rule like
 * this survives the next person in a hurry.
 */
export const SAY_CLASS: Record<SayRef["src"], SayClass> = {
  concept: "carried",
  question: "signed",
  sign: "signed",
  mistake: "catalogue",
  teach: "catalogue",
  rule: "catalogue",
  topic: "agenda",
  frame: "frame",
} as const;

/** Classes whose strings are checked against something before they are spoken. */
export const GATED_CLASSES: ReadonlySet<SayClass> = new Set<SayClass>(["signed", "carried"]);

/**
 * Classes that must never contain a rule, a number, an article or a
 * consequence — the frames.ts contract, extended to the one content file that
 * is spoken without a status check because it is navigation copy.
 */
export const CLAIM_FREE_CLASSES: ReadonlySet<SayClass> = new Set<SayClass>(["agenda", "frame"]);

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

export type WithheldReason =
  /** concepts.json grew a row the freeze never saw. */
  | "concept-not-carried"
  /** The summary was edited after the freeze — the pin no longer matches it. */
  | "concept-pin-stale"
  /**
   * The SENTENCE is cleared and a `lawRef` beside it was edited. A separate
   * reason because it needs a separate action: nobody has to re-read the
   * sentence, somebody has to open the act. The citation rides out on the same
   * utterance and `Transcript.tsx` prints it, so it is student-facing text and
   * withholding is the only honest response to „we no longer know what this
   * points at".
   */
  | "concept-citation-stale"
  /** No citation pin at all — a row the citation freeze never saw. */
  | "concept-citations-not-carried"
  | "question-not-approved"
  /**
   * The row is `approved` and a `lawRef` beside it was edited. `approved` says
   * a person agreed with the QUESTION; it never said anything about the article
   * number printed next to it, and five surfaces print that number. Same split
   * as the concept pair, for the same reason: the remedy is to open the act,
   * not to re-read the row.
   */
  | "question-citation-stale"
  /** No citation pin at all — a question the citation freeze never saw. */
  | "question-citations-not-carried"
  | "sign-not-approved";

export type Clearance =
  | { cleared: true }
  | { cleared: false; reason: WithheldReason; expected?: string };

/** sha256 of the exact bytes, first 16 hex. What clearanceCarry.ts pins. */
export function summaryFingerprint(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 16);
}

const fingerprintCache = new Map<string, string>();

function cachedFingerprint(text: string): string {
  const hit = fingerprintCache.get(text);
  if (hit !== undefined) return hit;
  const value = summaryFingerprint(text);
  // The corpus is 152 rows; the cache cannot grow unbounded in practice, but
  // pin it anyway so a pathological caller cannot turn it into a leak.
  if (fingerprintCache.size < 512) fingerprintCache.set(text, value);
  return value;
}

/**
 * The exact line the room shows for one citation.
 *
 * `classroom/lessonToRoom.ts` builds „`${first.act} ${first.ref}`" and
 * `Transcript.tsx` renders it in the beat header. Hashing THAT string rather
 * than the JSON is deliberate: a change that cannot reach a student cannot
 * silence a lesson, and a change that can, does.
 */
export function citationLine(ref: LawRef): string {
  return `${ref.act} ${ref.ref}`;
}

/** sha256 of every citation line on a concept, in authored order. */
export function citationFingerprint(lawRefs: readonly LawRef[]): string {
  return cachedFingerprint(lawRefs.map(citationLine).join("\n"));
}

/**
 * May this concept's summary be read to a student?
 *
 * There is no status to consult, so the question is „is this exact sentence one
 * we are knowingly carrying?", and there are exactly two ways it can be
 * (clearanceCarry.ts): the dated FREEZE, which covers only the bytes of one
 * pinned git blob, or a human CLEARANCE, which covers whatever sentence that
 * person actually read.
 *
 * ORDER MATTERS AND THE SIGNATURE GOES FIRST. When a content wave edits a
 * carried summary, the row is stale against the freeze and current against its
 * signature; asking the freeze first would report „stale" for a sentence
 * somebody has read, which is the wrong answer and the wrong instruction to
 * put in the withheld log.
 *
 * Anything else — a concept the freeze never covered, or a summary edited since
 * the last thing that covered it — is withheld. The withheld path is the
 * DEFAULT here, not an exception: both lookups must succeed to speak.
 *
 * THE CITATIONS ARE CHECKED TOO, and they were not. `resolve.ts` hands
 * `concept.lawRefs` out on the same utterance and the room prints
 * „`${act} ${ref}`" beside the sentence, so a citation was student-facing text
 * that no pin covered: 45 of the 113 distinct strings a student could reach
 * carried a QUESTION MARK, and two more named acts this repo does not hold
 * while reading as settled. `clearanceCitations.ts` pins them, and a concept
 * whose citation moved is withheld exactly like one whose sentence moved —
 * with a DIFFERENT reason, because the remedy is different: open the act, not
 * re-read the prose.
 */
export function conceptClearance(concept: Concept): Clearance {
  const actual = cachedFingerprint(concept.summaryBg);

  const citations = Object.hasOwn(CARRIED_CONCEPT_CITATIONS, concept.id)
    ? CARRIED_CONCEPT_CITATIONS[concept.id]
    : undefined;
  if (citations === undefined) {
    return { cleared: false, reason: "concept-citations-not-carried" };
  }
  const citationsNow = citationFingerprint(concept.lawRefs);
  if (citations !== citationsNow) {
    return { cleared: false, reason: "concept-citation-stale", expected: citationsNow };
  }

  const signature = Object.hasOwn(CLEARED_SINCE_FREEZE, concept.id)
    ? CLEARED_SINCE_FREEZE[concept.id]
    : undefined;
  if (signature !== undefined && signature.pin === actual) return { cleared: true };

  const pinned = Object.hasOwn(CARRIED_CONCEPT_SUMMARIES, concept.id)
    ? CARRIED_CONCEPT_SUMMARIES[concept.id]
    : undefined;
  if (pinned === undefined && signature === undefined) {
    return { cleared: false, reason: "concept-not-carried" };
  }
  if (pinned !== actual) {
    // Covered once, edited since. The instruction the log carries is „a person
    // must read the new sentence", and `expected` is the fingerprint they will
    // transcribe into `--clear`.
    return { cleared: false, reason: "concept-pin-stale", expected: actual };
  }
  return { cleared: true };
}

/**
 * The same check narration.ts:87 makes, on the bank's own status field — AND
 * the citation pin, which `approved` never covered.
 *
 * WHY STATUS IS NOT ENOUGH, and this is the fifth door of the same shape. A
 * question's `status` answers „has a person approved this row?". It answers
 * nothing about the article number printed beside it, and that number is
 * student-facing on five surfaces that never enter this module —
 * `theory/WhyPanel.tsx`, `exam/ExamResultView.tsx`,
 * `sim/lesson-ui/MicroQuizOverlay.tsx`, `hazard/HazardReveal.tsx`,
 * `tutor/TutorChatCitations.ts`. So a citation could be edited to anything and
 * every existing check stayed green: 269 of the bank's citation strings named
 * an article no resolver here can find, 110 of them on approved rows.
 *
 * STATUS IS ASKED FIRST on purpose, and the concept version asks the other way
 * round. A concept has no status, so its citation is the only thing to ask
 * about. A question has one, and „not approved" is both the commoner answer and
 * the more actionable instruction — reporting „citations-not-carried" for a
 * draft row would send somebody to the wrong file.
 */
export function questionClearance(question: Question): Clearance {
  if (question.status !== "approved") {
    return { cleared: false, reason: "question-not-approved" };
  }
  const pinned = Object.hasOwn(CARRIED_QUESTION_CITATIONS, question.id)
    ? CARRIED_QUESTION_CITATIONS[question.id]
    : undefined;
  if (pinned === undefined) {
    return { cleared: false, reason: "question-citations-not-carried" };
  }
  const now = citationFingerprint(question.lawRefs);
  if (pinned !== now) {
    return { cleared: false, reason: "question-citation-stale", expected: now };
  }
  return { cleared: true };
}

/**
 * Signs, same check. Nothing in the sign catalogue is `approved` today (71
 * draft, 6 needs-review) and no composed beat speaks one, so this costs zero
 * words now — which is exactly why it has to go in now rather than the day a
 * lesson first puts a sign meaning in a student's ear.
 */
export function signClearance(sign: Sign): Clearance {
  return sign.status === "approved"
    ? { cleared: true }
    : { cleared: false, reason: "sign-not-approved" };
}

// ---------------------------------------------------------------------------
// The withheld log — the part that makes a refusal visible to US
// ---------------------------------------------------------------------------

export interface WithheldSource {
  lessonId: string;
  beatId: string;
  /** Which `SayRef` kind was refused. */
  src: SayRef["src"];
  /** The id inside that corpus (conceptId, questionId, sign code). */
  id: string;
  reason: WithheldReason;
  /** For a stale pin: the fingerprint the row has NOW. */
  expected?: string;
  ts: number;
}

const RING_SIZE = 200;
const ring: WithheldSource[] = [];
let sink: ((record: WithheldSource) => void) | null = null;

/** Seam for a persistent sink (logging, an admin page). Never given a user id. */
export function setWithheldSink(next: ((record: WithheldSource) => void) | null): void {
  sink = next;
}

export function recentWithheldSources(): readonly WithheldSource[] {
  return ring;
}

export function resetWithheldSources(): void {
  ring.length = 0;
}

/**
 * Record a refusal. Deduplicated on (lesson, beat, src, id) so a student
 * walking a muted lesson twice does not bury the ring — the fact that a source
 * is withheld is the artifact, not how many times it was asked for.
 */
export function noteWithheld(record: Omit<WithheldSource, "ts">): void {
  const key = `${record.lessonId}|${record.beatId}|${record.src}|${record.id}`;
  const seen = ring.some(
    (r) => `${r.lessonId}|${r.beatId}|${r.src}|${r.id}` === key,
  );
  if (seen) return;
  const full: WithheldSource = { ...record, ts: Date.now() };
  ring.push(full);
  if (ring.length > RING_SIZE) ring.shift();
  if (sink !== null) {
    try {
      sink(full);
    } catch {
      // A logging failure must never take the classroom down with it.
    }
  }
}
