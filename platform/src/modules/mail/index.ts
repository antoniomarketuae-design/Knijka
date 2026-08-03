/**
 * mail module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * Owns transactional e-mail: "hand this message to whatever transport this
 * deployment has". Before it, the repo had no way to send anything at all
 * (audit 2026-07-24, H-14) — which is why a forgotten password was
 * unrecoverable and a purchase produced no receipt.
 *
 * The module exists as a SEAM, not as an integration. On the day this was
 * written there is no provider account, so the shipped transport is
 * ConsoleMailer, and it is a first-class one: the password-reset flow is
 * complete and end-to-end tested against it, with the link readable in the
 * server log. Turning on real delivery is `MAIL_TRANSPORT` + `MAIL_API_KEY` +
 * `MAIL_FROM` in the environment (documented in .env.example) — no code change,
 * no redeploy of the flow, nothing to remember.
 *
 * Deliberately NOT here: who is allowed to trigger an e-mail, and how often.
 * That is abuse control and it belongs with the feature that sends
 * (@/modules/auth for password reset, @/modules/security for the budgets).
 */

// Sending
export { sendMail, getMailer, setMailer, resolveMailerFromEnv, resetMailWarnings } from "./factory";

// Readiness — "can this deployment give a locked-out student her account back?"
// mailDeliveryGaps() gates checkout the way legalIdentityGaps() does (see the
// factory.ts docblock); describeMailTransport() is what /api/health reports.
export { mailDeliveryGaps, describeMailTransport } from "./factory";
export type { MailHealth, MailTransportPlan } from "./factory";

// Transports (exported so tests and ops scripts can build one explicitly)
export { ConsoleMailer } from "./console";
export { ProviderMailer, isProviderName } from "./provider";
export type { ProviderName } from "./provider";

// Templates
export { passwordResetEmail } from "./messages";
export type { PasswordResetEmailInput } from "./messages";

// Wire types
export type { Mailer, MailMessage, MailResult, MailSender } from "./types";
