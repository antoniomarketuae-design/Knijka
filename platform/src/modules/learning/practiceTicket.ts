/**
 * Practice-session tickets — proof that a question was actually dealt to this
 * user by the practice engine.
 *
 * WHY THIS EXISTS (audit M-10). `submitAnswer(context: "practice")` returns the
 * full answer key: `correctOptionIds`, the explanation and the citations. The
 * server action in front of it took a bare `questionId`, so any id in the bank
 * could be exchanged for its key — including the 45 ids sitting in the DOM of a
 * mock exam the same user had open in another tab. The exam module's stated
 * "nothing leaks mid-exam" invariant (builder.ts strips every `correct` flag,
 * restore.ts re-strips them on resume) was therefore enforceable only on the
 * exam's own routes, and practice was a side door around it.
 *
 * The fix is to make the *session*, not the question id, the unit of trust: the
 * engine hands out a signed list of the questions it just dealt, and a
 * submission is only graded — and only answered — for a question on that list.
 * An exam question never appears on a practice list, so the side door closes
 * without teaching the learning module anything about exams.
 *
 * WHY A SIGNED TOKEN AND NOT A TABLE. A practice session is ~10 question ids
 * that live for one sitting; persisting them would mean a schema migration, a
 * write on every session build and a row nobody ever reads again. An HMAC over
 * (user, questions, expiry) is stateless, survives a restart and cannot be
 * forged without AUTH_SECRET. It is a capability, not a secret: it says
 * "these questions, this user, until then" and nothing else.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** How long a dealt session stays answerable. One sitting, generously. */
export const PRACTICE_TICKET_TTL_MS = 6 * 60 * 60 * 1000;

/** Ticket format version — bump when the payload shape changes. */
const TICKET_VERSION = "p1";

export type PracticeTicketFailure =
  /** No ticket presented at all. */
  | "MISSING"
  /** Unparseable, wrong version, or the signature does not verify. */
  | "INVALID"
  /** Signed correctly, but past its expiry. */
  | "EXPIRED"
  /** Signed for a different user. */
  | "WRONG_USER"
  /** Signed for a session that never contained this question — the M-10 attack. */
  | "QUESTION_NOT_IN_SESSION";

export class PracticeTicketError extends Error {
  constructor(
    readonly reason: PracticeTicketFailure,
    message: string,
  ) {
    super(message);
    this.name = "PracticeTicketError";
  }
}

interface TicketPayload {
  /** userId the session was dealt to. */
  u: string;
  /** question ids dealt in that session. */
  q: string[];
  /** expiry, epoch milliseconds. */
  x: number;
}

/**
 * Sign a dealt session. Call it with exactly the questions the engine returned
 * — anything wider than that hands out capability the student did not earn.
 */
export function issuePracticeTicket(
  userId: string,
  questionIds: readonly string[],
  now: Date = new Date(),
): string {
  const payload: TicketPayload = {
    u: userId,
    q: [...questionIds],
    x: now.getTime() + PRACTICE_TICKET_TTL_MS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${TICKET_VERSION}.${body}.${sign(body)}`;
}

export type PracticeTicketCheck =
  | { ok: true }
  | { ok: false; reason: PracticeTicketFailure };

/**
 * Does this ticket entitle this user to answer this question right now?
 *
 * Every failure mode returns the same shape and none of them says anything the
 * caller did not already know — a forged ticket learns nothing from being told
 * it is forged, and the honest failures (expired session, stale tab) need to be
 * distinguishable so the UI can tell a student to start a new session.
 */
export function verifyPracticeTicket(
  ticket: string,
  opts: { userId: string; questionId: string; now?: Date },
): PracticeTicketCheck {
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== TICKET_VERSION) {
    return { ok: false, reason: "INVALID" };
  }
  const [, body, signature] = parts;
  if (!verifySignature(body, signature)) return { ok: false, reason: "INVALID" };

  let payload: TicketPayload;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    if (!isPayload(parsed)) return { ok: false, reason: "INVALID" };
    payload = parsed;
  } catch {
    return { ok: false, reason: "INVALID" };
  }

  // User before expiry before membership: a ticket that is not yours is not
  // yours whether or not it has expired, and the order keeps the messages true.
  if (payload.u !== opts.userId) return { ok: false, reason: "WRONG_USER" };
  const now = (opts.now ?? new Date()).getTime();
  if (payload.x <= now) return { ok: false, reason: "EXPIRED" };
  if (!payload.q.includes(opts.questionId)) {
    return { ok: false, reason: "QUESTION_NOT_IN_SESSION" };
  }
  return { ok: true };
}

/**
 * Enforcement point used by submitAnswer for `context: "practice"`.
 *
 * A presented ticket is ALWAYS verified strictly — a bad one is rejected here
 * and now, whatever the policy says. The policy only decides what happens when
 * no ticket is presented at all, which is the state the UI is in until the
 * practice page starts passing one (see PRACTICE_TICKET_REQUIRED below).
 */
export function assertPracticeTicket(
  userId: string,
  questionId: string,
  ticket: string | null | undefined,
  now?: Date,
): void {
  if (ticket === null || ticket === undefined || ticket === "") {
    if (isPracticeTicketRequired()) {
      throw new PracticeTicketError(
        "MISSING",
        "practice submission without a session ticket — call issuePracticeTicket() when the session is dealt and pass it back on submit",
      );
    }
    warnUnbound();
    return;
  }

  const check = verifyPracticeTicket(ticket, { userId, questionId, now });
  if (!check.ok) {
    throw new PracticeTicketError(
      check.reason,
      `practice submission rejected (${check.reason}) for question "${questionId}"`,
    );
  }
}

/**
 * TRANSITIONAL, and deliberately an env var rather than a constant.
 *
 * Enforcement can only be switched on once the practice page issues a ticket
 * and the client sends it back; flipping it before that would reject every
 * legitimate answer. `PRACTICE_TICKET_REQUIRED=1` belongs in the same deploy
 * that lands the wiring — and being an env var means it can also be switched
 * off in seconds if the wiring turns out to be wrong, without a rebuild.
 *
 * Until then an unbound submission is graded, and logged once per process so
 * the gap is visible in any log anyone actually reads.
 */
export function isPracticeTicketRequired(): boolean {
  return process.env.PRACTICE_TICKET_REQUIRED === "1";
}

let warnedUnbound = false;

function warnUnbound(): void {
  if (warnedUnbound) return;
  warnedUnbound = true;
  console.warn(
    "learning: practice answers are being graded without a session ticket (audit M-10). Wire issuePracticeTicket() through the practice page and set PRACTICE_TICKET_REQUIRED=1.",
  );
}

/** Test hook: the once-per-process warning must not hide a second suite's gap. */
export function resetPracticeTicketWarning(): void {
  warnedUnbound = false;
}

// ---------------------------------------------------------------------------
// signing
// ---------------------------------------------------------------------------

/**
 * The signing key. AUTH_SECRET is already the deployment's root secret (it
 * signs the session JWT), so a ticket is exactly as forgeable as a login —
 * which is the right bar. The key is DERIVED from it rather than used raw so
 * that a ticket can never be confused for, or replayed as, a session token.
 *
 * Outside production a fixed development key keeps `npm run dev` working with
 * an empty .env; in production a missing AUTH_SECRET is a deployment error and
 * must not silently become "everyone shares the same key".
 */
function signingKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "learning/practiceTicket: AUTH_SECRET is required in production to sign practice session tickets",
      );
    }
    return createHmac("sha256", "knizhka-dev-only").update("practice-ticket").digest();
  }
  return createHmac("sha256", secret).update("practice-ticket").digest();
}

function sign(body: string): string {
  return b64url(createHmac("sha256", signingKey()).update(body).digest());
}

function verifySignature(body: string, signature: string): boolean {
  const expected = Buffer.from(sign(body), "utf8");
  const given = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch, and the
  // length of a signature is not a secret.
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isPayload(v: unknown): v is TicketPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.u === "string" &&
    typeof o.x === "number" &&
    Array.isArray(o.q) &&
    o.q.every((x) => typeof x === "string")
  );
}
