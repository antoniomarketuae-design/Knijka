/**
 * Practice option order — the per-session seeded shuffle (audit 2026-07-24,
 * finding H-1a; the bank-side half of the same leak is H-2).
 *
 * WHY THIS EXISTS. Practice used to render the STORED option order verbatim.
 * The bank puts the correct answer at (a) in 45.6% of single-answer questions
 * against a 25% baseline — one topic file sat at 37/37 — so "always pick the
 * first one" is a strategy that works. And `correct` is the SOLE input to
 * mastery, lapses, reps and dueAt (submit.ts), which means any answering
 * strategy correlated with position silently drives mastery toward 1.0 without
 * a single thing being learned. The readiness number this product sells is
 * computed from exactly that signal, so a corruptible order is not cosmetic —
 * it is the metric lying to the student about whether they are ready to drive.
 *
 * The mock exam has shuffled since day one (exam/builder.ts). Practice is
 * where the adaptive signal is actually formed, so it matters MORE here.
 *
 * WHY IT IS SAFE. Grading resolves the correct answer by option ID and never
 * by index (submit.ts: `question.options.filter(o => o.correct).map(o => o.id)`
 * compared as a set). The order a student sees is therefore free to vary
 * without touching a single grading path — and the tests in submit.test.ts
 * pin that down by submitting the option that now occupies the historically
 * correct slot and demanding it grade WRONG.
 *
 * WHY NOT Math.random(). A student must see the same order for the whole of
 * one sitting: an order that changes under a re-render is a question that
 * appears to change its answers while you read it. So the order is a pure
 * function of (session seed, question id) — reproducible for support, for
 * tests, and across every render of the same session.
 */

import type { Question, QuestionOption } from "@/lib/content/types";

/**
 * How long one practice "session" keeps its option order.
 *
 * There is no session ROW to key off: /theory/practice builds a fresh session
 * on every server render, so the only stable identity available is the user
 * plus the wall clock. Bucketing the clock gives both halves of the
 * requirement — a refresh inside the window re-renders the identical order
 * (grading and the student's mental map stay put), while coming back later
 * deals a genuinely different arrangement, so positions cannot be memorised
 * across sittings.
 *
 * 30 minutes: comfortably longer than a 10-question sitting (a few minutes),
 * short enough that a second sitting the same evening is re-randomised. A
 * sitting that straddles a boundary is harmless — the client holds the whole
 * session payload, so nothing re-orders mid-question.
 */
export const OPTION_ORDER_WINDOW_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

type Rng = () => number;

/**
 * mulberry32 — deterministic, fast, not cryptographic (nothing secret rides on
 * the seed: the client never receives `correct` flags, so knowing the
 * permutation tells an attacker nothing they cannot already see).
 *
 * The exam module carries the same two primitives (exam/rng.ts), but they are
 * INTERNAL to it and modules talk only through their index.ts
 * (docs/architecture/05). Twenty lines of arithmetic is a cheaper price than a
 * cross-module internal import; if a third caller ever appears, extract a
 * shared lib/rng instead of widening either module's public API.
 */
function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over `key`, salted with `seed` — a stable sub-seed per string key. */
function deriveSeed(seed: number, key: string): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0; // FNV offset basis, salted
  for (let i = 0; i < key.length; i++) {
    h = (h ^ key.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
  }
  return h >>> 0;
}

/** Fisher–Yates. Returns a NEW array — the content repo is a long-lived
 *  singleton and must never be reordered in place. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The default session seed: stable for one user inside one
 * OPTION_ORDER_WINDOW_MS bucket, different for every other (user, window).
 *
 * Per-USER as well as per-window on purpose — two students sitting side by
 * side see different arrangements, so "it's the third one" cannot be traded
 * across a classroom either.
 */
export function practiceOptionSeed(userId: string, now: Date): number {
  const windowIndex = Math.floor(now.getTime() / OPTION_ORDER_WINDOW_MS) >>> 0;
  return deriveSeed(windowIndex, userId);
}

// ---------------------------------------------------------------------------
// The exception: options whose ORDER carries meaning
// ---------------------------------------------------------------------------

/**
 * Options that talk about the other options — "всички изброени", "нито едно от
 * посочените", "отговори а) и б)". Shuffling these does not merely read badly:
 * it makes the question unanswerable, because the thing an option points at is
 * no longer where it points.
 *
 * The negative lookaheads matter: `отговор` must not fire on `отговорност`
 * ("Гражданска отговорност" appears in ~20 perfectly ordinary options), which
 * is why the word endings are enumerated instead of using \b — JavaScript's \b
 * is ASCII-only and matches between any two Cyrillic letters.
 */
const ANSWER_NOUN = "(?:отговор(?:ите|и|ът|а)?|вариант(?:ите|и|ът|а)?|твърдени(?:ето|ята|е|я))(?![а-яА-Я])";

const CROSS_REFERENCE: readonly RegExp[] = [
  // "Всички изброени", "Нито едно от посочените", "Всички горни отговори"
  new RegExp(
    `(?:всички|нито\\s+(?:едно|един|една))[^.;!?]{0,30}(?:изброен|посочен|горн|по-горе|предходн|${ANSWER_NOUN})`,
    "iu",
  ),
  // "отговори а) и б)" / "вариант б)"
  new RegExp(`${ANSWER_NOUN}[^.;!?]{0,12}[абвгАБВГ]\\s*\\)`, "iu"),
  // "а) и б)" on its own
  /[абвгАБВГ]\s*\)\s*(?:и|или|,)\s*[абвгАБВГ]\s*\)/u,
  // "първият отговор", "горното твърдение", "предходния вариант"
  new RegExp(
    `(?:първи|втори|трети|четвърти|последни|предходни|горни|долни)[а-яА-Я]*\\s+${ANSWER_NOUN}`,
    "iu",
  ),
];

/** Leading quantity of an option: "До 0,5 промила" → 0.5, "Знак 3" → 3. */
const LEADING_QUANTITY = /^[^0-9]{0,12}?(\d+(?:[.,]\d+)?)/u;

/**
 * A monotone ladder — "До 0,0 / До 0,5 / До 0,8 / До 1,2 промила",
 * "150 / 140 / 130 / 120 км/ч", "Знак 1 … Знак 4" (which index into the
 * question's own artwork). 26 of the bank's 1,089 questions are ladders.
 *
 * These are ordered SEQUENCES: the author's order is part of how the option
 * set is read, and scrambling it looks to a 17-year-old like a broken app
 * rather than a fair test. The cost is that those 26 keep whatever position
 * tell they carry — which is the content lane's job to fix in the bank (the
 * position-bias gate in tools/theory/answer_bias.mjs still measures them), not
 * something a presentation-layer shuffle should paper over.
 */
function isMonotoneLadder(texts: readonly string[]): boolean {
  if (texts.length < 3) return false;
  const values: number[] = [];
  for (const t of texts) {
    const m = LEADING_QUANTITY.exec(t);
    if (m === null) return false;
    values.push(Number.parseFloat(m[1].replace(",", ".")));
  }
  const ascending = values.every((v, i) => i === 0 || v > values[i - 1]);
  const descending = values.every((v, i) => i === 0 || v < values[i - 1]);
  return ascending || descending;
}

/**
 * True when the stored option order must be preserved — the shuffle's one
 * exception (the content lane applies the identical rule to the bank).
 *
 * Deliberately conservative in the safe direction: skipping a shuffle costs a
 * little position entropy on a handful of questions, while shuffling a
 * position-dependent question ships a question nobody can answer.
 */
export function optionOrderIsFixed(question: Question): boolean {
  const texts = question.options.map((o) => o.textBg);
  return (
    texts.some((t) => CROSS_REFERENCE.some((re) => re.test(t))) ||
    isMonotoneLadder(texts)
  );
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

/**
 * This session's presentation order for one question's options.
 *
 * Keyed off (session seed, question id) rather than drawn from one stream
 * threaded through the session: a shared stream would make question #7's order
 * depend on how many questions came before it, so the same session rebuilt
 * after a content edit would deal a different arrangement. Keying per question
 * makes each order independent of everything else in the session.
 *
 * Returns the stored array itself (same reference) when the order is fixed, so
 * callers can cheaply tell "unchanged" from "reordered".
 */
export function orderOptionsForPractice(
  question: Question,
  sessionSeed: number,
): QuestionOption[] {
  if (optionOrderIsFixed(question)) return question.options;
  return shuffle(question.options, createRng(deriveSeed(sessionSeed, question.id)));
}
