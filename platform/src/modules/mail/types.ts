/**
 * The wire shape of an outgoing e-mail, and the one method every transport
 * implements. Kept deliberately tiny: the product sends transactional mail to
 * one recipient at a time (password reset today, purchase receipts next), so
 * there is no cc/bcc/attachment surface to get wrong.
 *
 * GDPR (ADR-004, users are minors): a MailMessage carries an e-mail address
 * and nothing else about the person. Templates must keep it that way — no
 * birth year, no progress, no purchase history in a message body.
 */

export interface MailMessage {
  /** Single recipient, already normalized (trimmed + lowercased). */
  to: string;
  subject: string;
  /**
   * Plain text is REQUIRED, HTML is optional — the reverse of what most
   * mailers assume. A reset link that only exists inside an HTML part is
   * unreadable in a text client and, worse, invisible when a provider strips
   * the HTML; the text part is the version that must always work.
   */
  text: string;
  html?: string;
  /** Overrides MAIL_REPLY_TO for this one message; rarely needed. */
  replyTo?: string;
}

export type MailResult =
  | { ok: true; /** Provider message id when it returns one. */ id?: string }
  | {
      ok: false;
      /** Machine-readable cause, for logs only — never shown to a student. */
      error: string;
    };

/**
 * A transport. Implementations MUST NOT throw: a mail failure has to be a
 * value the caller can log and move past, because every caller in this product
 * is on a path (password reset, receipt) where throwing would turn a delivery
 * problem into a broken page.
 */
export interface Mailer {
  /** Stable id for logs and for asserting which transport is live. */
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}

/** Resolved sender identity — see resolveMailerFromEnv(). */
export interface MailSender {
  /** RFC-5322 from address, e.g. `Книжка.AI <no-reply@knijka.ai>`. */
  from: string;
  replyTo?: string;
}
