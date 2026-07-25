/**
 * modules/auth — password reset (audit 2026-07-24, H-14: there was no reset at
 * all, so a locked-out paying student was an instant refund and a bad review).
 *
 * Every test here names a way the recovery path could hand an account to the
 * wrong person, or fail to hand it back to the right one:
 *
 * - the link works exactly once, and only until it expires
 * - a forged or tampered token gets nothing
 * - the DATABASE never holds the usable secret
 * - the answer is identical for a known and an unknown address (enumeration)
 * - the mail budget cannot be turned into a flood
 * - and, the whole point: the password actually changes afterwards
 *
 * Runs entirely on InMemoryAuthStore + an in-memory mailer — no Postgres, no
 * network, no DATABASE_URL. The mailer fake is what proves the flow is
 * complete end-to-end against the shipped (console) transport: the test reads
 * the token out of the e-mail body exactly like a student would.
 */

import { createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setMailer, type MailMessage } from "@/modules/mail";
import { resetRateLimitState } from "@/modules/security";
import {
  PASSWORD_RESET_EMAIL_LIMIT,
  PASSWORD_RESET_IP_LIMIT,
  requestPasswordReset,
  resetPassword,
  RESET_TOKEN_TTL_MINUTES,
  verifyPasswordResetToken,
} from "../reset";
import {
  InMemoryPasswordResetStore,
  setPasswordResetStore,
  type InMemoryResetToken,
} from "../reset-store";
import { verifyCredentials } from "../service";
import { InMemoryAuthStore, setAuthStore, type AuthUserRecord } from "../store";

const EMAIL = "ivan@mail.bg";
const OLD_PASSWORD = "staraParola1";
const NEW_PASSWORD = "novataParola2";

let users: AuthUserRecord[];
let tokens: InMemoryResetToken[];
let sent: MailMessage[];

/** The link as it arrives in the student's inbox — read out of the plain-text
 *  part, because that is the part the module guarantees always carries it. */
function tokenFromLastMail(): string {
  const last = sent.at(-1);
  if (!last) throw new Error("no e-mail was sent");
  const match = last.text.match(/\/reset\?token=([^\s]+)/);
  if (!match) throw new Error(`no reset link in e-mail:\n${last.text}`);
  return decodeURIComponent(match[1]);
}

beforeEach(async () => {
  users = [
    {
      id: "user-1",
      email: EMAIL,
      name: "Иван",
      // Cost 4 for the seed only — this hash stands in for one bcrypt produced
      // at the real cost 12 during registration; nothing here depends on it.
      passwordHash: await hash(OLD_PASSWORD, 4),
      role: "student",
    },
  ];
  tokens = [];
  sent = [];

  // Both fakes share the SAME `users` array, which is what lets the tests below
  // prove a reset through verifyCredentials instead of through a hash column.
  setAuthStore(new InMemoryAuthStore(users));
  setPasswordResetStore(new InMemoryPasswordResetStore(users, tokens));
  setMailer({
    name: "test",
    async send(message) {
      sent.push(message);
      return { ok: true };
    },
  });
  // The limiter is in-process and shared: without this, test order would
  // decide whether a request is allowed.
  resetRateLimitState();
});

afterEach(() => {
  setAuthStore(null); // back to the Prisma default for anything else
  setPasswordResetStore(null);
  setMailer(null);
  resetRateLimitState();
});

describe("requestPasswordReset — issuing the link", () => {
  it("e-mails a link that resets the password (the whole point of H-14)", async () => {
    const requested = await requestPasswordReset({ email: EMAIL });
    expect(requested.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);

    const result = await resetPassword({
      token: tokenFromLastMail(),
      password: NEW_PASSWORD,
    });
    expect(result.ok).toBe(true);

    // Not "the hash column changed" — the actual login the student will do.
    expect(await verifyCredentials(EMAIL, NEW_PASSWORD)).not.toBeNull();
    expect(await verifyCredentials(EMAIL, OLD_PASSWORD)).toBeNull();
  });

  it("stores only sha256(token) — a leaked backup grants nobody an account", async () => {
    await requestPasswordReset({ email: EMAIL });
    const token = tokenFromLastMail();

    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(token);
    expect(tokens[0].tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    // And nothing anywhere in the row is the token itself.
    expect(JSON.stringify(tokens[0])).not.toContain(token);
  });

  it("ENUMERATION: an unknown address gets the same answer and no token", async () => {
    const known = await requestPasswordReset({ email: EMAIL });
    resetRateLimitState();
    const unknown = await requestPasswordReset({ email: "nikoi@mail.bg" });

    expect(unknown).toEqual(known); // byte-identical result shape
    expect(tokens).toHaveLength(1); // only the real address produced one
    expect(sent).toHaveLength(1);
  });

  it("normalizes the address, so a shouted e-mail still finds the account", async () => {
    const result = await requestPasswordReset({ email: "  Ivan@Mail.BG " });
    expect(result.ok).toBe(true);
    expect(tokens).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
  });

  it("rejects a malformed address instead of silently doing nothing", async () => {
    const result = await requestPasswordReset({ email: "не-е-имейл" });
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "invalid_input") return;
    expect(result.fieldErrors.email?.[0]).toBeDefined();
    expect(sent).toHaveLength(0);
  });

  it("sets an expiry of exactly the advertised TTL", async () => {
    const now = new Date("2026-07-25T10:00:00Z");
    await requestPasswordReset({ email: EMAIL }, { now });
    expect(tokens[0].expiresAt.getTime()).toBe(
      now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );
  });
});

describe("requestPasswordReset — abuse limits", () => {
  it("caps requests per source IP", async () => {
    for (let i = 0; i < PASSWORD_RESET_IP_LIMIT.limit; i++) {
      // Different addresses so the per-e-mail budget is not what stops us.
      const result = await requestPasswordReset(
        { email: `student${i}@mail.bg` },
        { ip: "1.2.3.4" },
      );
      expect(result.ok, `request ${i + 1}`).toBe(true);
    }

    const blocked = await requestPasswordReset(
      { email: EMAIL },
      { ip: "1.2.3.4" },
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok || blocked.error !== "rate_limited") return;
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    // Another source is unaffected — the limit is per caller, not global.
    expect((await requestPasswordReset({ email: EMAIL }, { ip: "5.6.7.8" })).ok).toBe(
      true,
    );
  });

  it("stops mail-bombing ONE inbox, silently (no oracle) even from many IPs", async () => {
    for (let i = 0; i < PASSWORD_RESET_EMAIL_LIMIT.limit; i++) {
      await requestPasswordReset({ email: EMAIL }, { ip: `10.0.0.${i}` });
    }
    expect(sent).toHaveLength(PASSWORD_RESET_EMAIL_LIMIT.limit);

    const overflow = await requestPasswordReset(
      { email: EMAIL },
      { ip: "10.0.0.99" },
    );
    // Looks exactly like success — but nothing was sent and nothing issued.
    expect(overflow).toEqual({ ok: true });
    expect(sent).toHaveLength(PASSWORD_RESET_EMAIL_LIMIT.limit);
    expect(tokens).toHaveLength(PASSWORD_RESET_EMAIL_LIMIT.limit);
  });
});

describe("resetPassword — spending the link", () => {
  it("SINGLE USE: the same link cannot be spent twice", async () => {
    await requestPasswordReset({ email: EMAIL });
    const token = tokenFromLastMail();

    expect((await resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);

    const second = await resetPassword({ token, password: "trettaParola3" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("used");

    // The second password never took: the account is on the FIRST reset.
    expect(await verifyCredentials(EMAIL, NEW_PASSWORD)).not.toBeNull();
    expect(await verifyCredentials(EMAIL, "trettaParola3")).toBeNull();
  });

  it("EXPIRY: a link older than the TTL is refused and changes nothing", async () => {
    const issuedAt = new Date("2026-07-25T10:00:00Z");
    await requestPasswordReset({ email: EMAIL }, { now: issuedAt });
    const token = tokenFromLastMail();

    const oneMinuteLate = new Date(
      issuedAt.getTime() + (RESET_TOKEN_TTL_MINUTES + 1) * 60 * 1000,
    );
    const result = await resetPassword(
      { token, password: NEW_PASSWORD },
      { now: oneMinuteLate },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("expired");

    expect(await verifyCredentials(EMAIL, OLD_PASSWORD)).not.toBeNull();
    expect(await verifyCredentials(EMAIL, NEW_PASSWORD)).toBeNull();
    // The row is still unspent — an expired link is dead, not consumed.
    expect(tokens[0].usedAt).toBeNull();
  });

  it("still works one second BEFORE the deadline (the boundary is not off by one)", async () => {
    const issuedAt = new Date("2026-07-25T10:00:00Z");
    await requestPasswordReset({ email: EMAIL }, { now: issuedAt });

    const justInTime = new Date(
      issuedAt.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000 - 1000,
    );
    const result = await resetPassword(
      { token: tokenFromLastMail(), password: NEW_PASSWORD },
      { now: justInTime },
    );
    expect(result.ok).toBe(true);
  });

  it("FORGERY: an invented token, and a one-character edit of a real one, both fail", async () => {
    await requestPasswordReset({ email: EMAIL });
    const real = tokenFromLastMail();

    const invented = await resetPassword({
      token: "definitely-not-a-real-token",
      password: NEW_PASSWORD,
    });
    expect(invented.ok).toBe(false);
    if (!invented.ok) expect(invented.error).toBe("invalid_token");

    // Flip the last character: proves the lookup is on the whole hash and not
    // on a prefix, and that nothing about it is a substring match.
    const tampered = real.slice(0, -1) + (real.at(-1) === "A" ? "B" : "A");
    const edited = await resetPassword({
      token: tampered,
      password: NEW_PASSWORD,
    });
    expect(edited.ok).toBe(false);
    if (!edited.ok) expect(edited.error).toBe("invalid_token");

    expect(await verifyCredentials(EMAIL, OLD_PASSWORD)).not.toBeNull();
    expect(tokens[0].usedAt).toBeNull();
  });

  it("a too-short password is refused WITHOUT burning the link", async () => {
    await requestPasswordReset({ email: EMAIL });
    const token = tokenFromLastMail();

    const rejected = await resetPassword({ token, password: "къс" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok && rejected.error === "invalid_input") {
      expect(rejected.fieldErrors.password?.[0]).toBeDefined();
    }
    expect(tokens[0].usedAt).toBeNull();

    // The student fixes the password and the SAME link still works — anything
    // else turns a typo into "request another e-mail".
    expect((await resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);
  });

  it("burns every other outstanding link for that account", async () => {
    await requestPasswordReset({ email: EMAIL });
    const first = tokenFromLastMail();
    await requestPasswordReset({ email: EMAIL });
    const second = tokenFromLastMail();
    expect(first).not.toBe(second);

    expect((await resetPassword({ token: second, password: NEW_PASSWORD })).ok).toBe(
      true,
    );

    const stale = await resetPassword({ token: first, password: "trettaParola3" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toBe("used");
  });

  it("hashes the new password — the plaintext never reaches the store", async () => {
    await requestPasswordReset({ email: EMAIL });
    await resetPassword({
      token: tokenFromLastMail(),
      password: NEW_PASSWORD,
    });

    expect(users[0].passwordHash).not.toBe(NEW_PASSWORD);
    expect(await compare(NEW_PASSWORD, users[0].passwordHash!)).toBe(true);
  });
});

describe("verifyPasswordResetToken — rendering the form", () => {
  it("does NOT consume the token (a link-prefetching mail client must not burn it)", async () => {
    await requestPasswordReset({ email: EMAIL });
    const token = tokenFromLastMail();

    expect(await verifyPasswordResetToken(token)).toEqual({ ok: true });
    expect(await verifyPasswordResetToken(token)).toEqual({ ok: true });
    expect(tokens[0].usedAt).toBeNull();

    expect((await resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);
  });

  it("tells the three failures apart, so the page can say what to do", async () => {
    const issuedAt = new Date("2026-07-25T10:00:00Z");
    await requestPasswordReset({ email: EMAIL }, { now: issuedAt });
    const token = tokenFromLastMail();

    expect(await verifyPasswordResetToken("")).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(
      await verifyPasswordResetToken(
        token,
        new Date(issuedAt.getTime() + (RESET_TOKEN_TTL_MINUTES + 1) * 60_000),
      ),
    ).toEqual({ ok: false, error: "expired" });

    await resetPassword({ token, password: NEW_PASSWORD }, { now: issuedAt });
    expect(await verifyPasswordResetToken(token, issuedAt)).toEqual({
      ok: false,
      error: "used",
    });
  });
});
