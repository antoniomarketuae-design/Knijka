/**
 * Which transport is live, decided from the environment — and the injection
 * seam tests use instead.
 *
 * Same pattern as the auth/privacy stores: one lazily-resolved singleton, one
 * setter. The reason it matters here is the whole point of the module (audit
 * H-14): the founder has no provider account yet, so the product must ship a
 * complete, tested password-reset flow on the console transport and switch to
 * real delivery by setting env vars — never by editing code.
 *
 * FAIL-SOFT IS DELIBERATE. If MAIL_TRANSPORT names a provider but the
 * credentials are missing or malformed, we log loudly and fall back to the
 * console transport rather than throwing. The alternative — a hard error at
 * resolve time — would take down the password-reset page, i.e. break account
 * recovery precisely when the mail configuration is already broken. A student
 * locked out by our misconfiguration is the exact failure H-14 is about.
 */

import { ConsoleMailer } from "./console";
import { ProviderMailer, isProviderName } from "./provider";
import type { MailMessage, MailResult, MailSender, Mailer } from "./types";

/** Only used by the console transport — a provider always requires MAIL_FROM. */
const DEV_FROM = "Книжка.AI <no-reply@localhost>";

type Env = Record<string, string | undefined>;

/** Printed once per process, not per send: a boot problem, not a per-mail one. */
let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[mail] ${message}`);
}

/** Test-only: forget the once-per-process warning latch. */
export function resetMailWarnings(): void {
  warned = false;
}

function readSender(env: Env): MailSender {
  const from = env.MAIL_FROM?.trim();
  const replyTo = env.MAIL_REPLY_TO?.trim();
  return {
    from: from || DEV_FROM,
    ...(replyTo ? { replyTo } : {}),
  };
}

/**
 * Builds the transport described by `env` (defaults to `process.env`).
 *
 * `MAIL_TRANSPORT` unset — or set to anything other than a known provider —
 * means the console transport. That is the shipped default and it is not an
 * error state: it is what makes the flow work before the provider exists.
 */
export function resolveMailerFromEnv(env: Env = process.env): Mailer {
  const sender = readSender(env);
  const requested = env.MAIL_TRANSPORT?.trim().toLowerCase();

  if (!requested || requested === "console") {
    return new ConsoleMailer(sender);
  }

  if (!isProviderName(requested)) {
    warnOnce(
      `MAIL_TRANSPORT="${requested}" is not a known transport (console|resend|postmark) — falling back to console.`,
    );
    return new ConsoleMailer(sender);
  }

  const apiKey = env.MAIL_API_KEY?.trim();
  if (!apiKey) {
    warnOnce(
      `MAIL_TRANSPORT="${requested}" but MAIL_API_KEY is empty — falling back to console. Password-reset links will appear in this log only.`,
    );
    return new ConsoleMailer(sender);
  }
  if (!env.MAIL_FROM?.trim()) {
    // Every provider rejects a send from an unverified/absent sender, so
    // continuing would produce a 4xx per reset request and no mail at all —
    // strictly worse than a link in the log.
    warnOnce(
      `MAIL_TRANSPORT="${requested}" but MAIL_FROM is empty — falling back to console.`,
    );
    return new ConsoleMailer(sender);
  }

  return new ProviderMailer(requested, apiKey, sender);
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let mailer: Mailer | null = null;

/** Tests inject a fake (or null to reset); production resolves from env. */
export function setMailer(m: Mailer | null): void {
  mailer = m;
}

export function getMailer(): Mailer {
  if (!mailer) mailer = resolveMailerFromEnv();
  return mailer;
}

/**
 * Send one message through the live transport.
 *
 * Callers get a value, never an exception (see the Mailer contract) — but they
 * still have to decide what a failure means for the student in front of them.
 * The failure is logged here, once, with the recipient omitted: a mail server
 * error does not justify writing a minor's address into a log file (ADR-004).
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const active = getMailer();
  const result = await active.send(message);
  if (!result.ok) {
    console.error(`[mail] send failed via ${active.name}: ${result.error}`);
  }
  return result;
}
