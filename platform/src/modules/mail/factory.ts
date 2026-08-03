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
import { ProviderMailer, isProviderName, type ProviderName } from "./provider";
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
 * What `env` resolves to — computed ONCE and consumed by both the builder and
 * the health probe, because the failure this module exists to prevent is
 * exactly the two of them disagreeing.
 *
 * A second, independent "is mail configured?" predicate looks harmless and is
 * the worst possible bug here: it lets /api/health report a live transport
 * while `resolveMailerFromEnv` quietly hands back a ConsoleMailer, and the
 * first person to notice is a student who never got her reset link.
 */
export interface MailTransportPlan {
  /** The transport that WILL be built from this env. */
  transport: "console" | ProviderName;
  /**
   * Environment variables still missing before mail can reach a real inbox,
   * by name. Empty ⇔ this deployment can actually deliver.
   *
   * Deliberately parallel to `legalIdentityGaps()` in lib/legal/identity.ts —
   * see mailDeliveryGaps() below for why the two are used the same way.
   */
  gaps: string[];
  /** Printed once when a provider was asked for but cannot be built. */
  warning?: string;
}

function planMailTransport(env: Env): MailTransportPlan {
  const requested = env.MAIL_TRANSPORT?.trim().toLowerCase();

  if (!requested || requested === "console") {
    // Not a misconfiguration — it is the shipped default, and it is what makes
    // the reset flow work before a provider account exists. It is still a GAP:
    // nothing leaves the process.
    return { transport: "console", gaps: ["MAIL_TRANSPORT"] };
  }

  if (!isProviderName(requested)) {
    return {
      transport: "console",
      gaps: ["MAIL_TRANSPORT"],
      warning: `MAIL_TRANSPORT="${requested}" is not a known transport (console|resend|postmark) — falling back to console.`,
    };
  }

  // Report every missing fact at once so the founder fixes it in one pass
  // rather than discovering them one redeploy at a time.
  const gaps: string[] = [];
  if (!env.MAIL_API_KEY?.trim()) gaps.push("MAIL_API_KEY");
  // Every provider rejects a send from an unverified/absent sender, so building
  // one anyway would produce a 4xx per reset request and no mail at all —
  // strictly worse than a link in the log.
  if (!env.MAIL_FROM?.trim()) gaps.push("MAIL_FROM");

  if (gaps.length > 0) {
    return {
      transport: "console",
      gaps,
      warning: `MAIL_TRANSPORT="${requested}" but ${gaps.join(" + ")} missing — falling back to console. Password-reset links will appear in this log only.`,
    };
  }

  return { transport: requested, gaps: [] };
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
  const plan = planMailTransport(env);

  if (plan.transport === "console") {
    if (plan.warning) warnOnce(plan.warning);
    return new ConsoleMailer(sender);
  }

  return new ProviderMailer(
    plan.transport,
    (env.MAIL_API_KEY as string).trim(),
    sender,
  );
}

/**
 * PUBLIC API: can this deployment give a locked-out student her account back?
 *
 * Empty array = yes. Otherwise the names of the environment variables that are
 * still missing.
 *
 * WHY THIS EXISTS AS A GATE AND NOT ONLY AS A LOG LINE. The console transport
 * fails SOFT (see the module header) — five separate paths fall back to it and
 * it warns once per process, which on a long-lived pm2 process means one line
 * nobody will ever scroll back to. The live environment has no MAIL_* variables
 * at all. So the shipped product would take EUR 12.99 from a 17-year-old in
 * September, and when she comes back in October having forgotten her password,
 * show her a reassuring Bulgarian success screen while the reset link goes to a
 * server log — and then point her at a contact page that renders the literal
 * string "[ИМЕЙЛ ЗА КОНТАКТ]". Locked out of something she paid for, with no
 * channel to a human.
 *
 * `legalIdentityGaps()` already refuses to take money without a real seller
 * identity. This is the same refusal for the other half of the same promise:
 * the product must not take money without a way to GIVE THE ACCOUNT BACK.
 * `isStripeConfigured()` checks both, so this class of failure cannot recur —
 * a deployment that can charge is a deployment that can send mail, structurally.
 */
export function mailDeliveryGaps(env: Env = process.env): string[] {
  return planMailTransport(env).gaps;
}

/** What `/api/health` reports under `checks.mail`. Never includes the API key. */
export interface MailHealth {
  transport: "console" | ProviderName;
  ok: boolean;
  /** Missing env var NAMES only — values are secrets and never leave here. */
  gaps: string[];
}

/** PUBLIC API: the health probe's view of the transport. Pure; never warns. */
export function describeMailTransport(env: Env = process.env): MailHealth {
  const plan = planMailTransport(env);
  return { transport: plan.transport, ok: plan.gaps.length === 0, gaps: plan.gaps };
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
