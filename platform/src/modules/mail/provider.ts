/**
 * The real transport: an HTTPS call to a transactional-mail provider.
 *
 * WHY HTTP AND NOT SMTP. SMTP would mean adding nodemailer (plus its transitive
 * tree) to a repo whose whole discipline is "no dependency we can avoid" — and
 * it buys nothing here: both providers below expose exactly one JSON endpoint,
 * `fetch` is built in, and the HTTP API is what returns a message id and a
 * readable error instead of a numeric SMTP code. Resend and Postmark both also
 * offer SMTP, so nothing about this choice locks the founder out of it later:
 * a third transport implementing `Mailer` is ~40 lines whenever it is wanted.
 *
 * Both providers are supported because the founder has not picked one yet
 * (H-14) and the difference between them is a URL, an auth header and the
 * casing of four field names. Choosing later must not be a code change.
 */

import type { MailMessage, MailResult, MailSender, Mailer } from "./types";

export type ProviderName = "resend" | "postmark";

/**
 * Hard ceiling on one send. A provider that hangs must not hold a server
 * action open: the caller (password reset) answers the student the same way
 * whether the mail went or not, so waiting longer helps nobody.
 */
const SEND_TIMEOUT_MS = 10_000;

interface ProviderShape {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  body: (message: MailMessage, sender: MailSender) => Record<string, unknown>;
  /** Pull the provider's message id out of its (differently shaped) response. */
  messageId: (payload: unknown) => string | undefined;
}

const PROVIDERS: Record<ProviderName, ProviderShape> = {
  resend: {
    url: "https://api.resend.com/emails",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
    body: (message, sender) => ({
      from: sender.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ?? sender.replyTo
        ? { reply_to: message.replyTo ?? sender.replyTo }
        : {}),
    }),
    messageId: (payload) =>
      typeof payload === "object" && payload !== null && "id" in payload
        ? String((payload as { id: unknown }).id)
        : undefined,
  },
  postmark: {
    url: "https://api.postmarkapp.com/email",
    headers: (apiKey) => ({
      "X-Postmark-Server-Token": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: (message, sender) => ({
      From: sender.from,
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      ...(message.html ? { HtmlBody: message.html } : {}),
      ...(message.replyTo ?? sender.replyTo
        ? { ReplyTo: message.replyTo ?? sender.replyTo }
        : {}),
      // Postmark separates transactional from bulk streams; a password reset
      // is transactional, and putting it on the wrong stream is what gets
      // account-recovery mail delayed behind a marketing queue.
      MessageStream: "outbound",
    }),
    messageId: (payload) =>
      typeof payload === "object" && payload !== null && "MessageID" in payload
        ? String((payload as { MessageID: unknown }).MessageID)
        : undefined,
  },
};

export class ProviderMailer implements Mailer {
  readonly name: ProviderName;

  constructor(
    provider: ProviderName,
    private readonly apiKey: string,
    private readonly sender: MailSender,
    /** Injectable so tests never touch the network. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.name = provider;
  }

  async send(message: MailMessage): Promise<MailResult> {
    const shape = PROVIDERS[this.name];

    try {
      const response = await this.fetchImpl(shape.url, {
        method: "POST",
        headers: shape.headers(this.apiKey),
        body: JSON.stringify(shape.body(message, this.sender)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // The provider's own message is the only thing that ever explains a
        // rejected sender domain or a revoked key, so keep it — truncated,
        // because some providers echo the whole request back.
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        return {
          ok: false,
          error: `${this.name} responded ${response.status}: ${detail}`,
        };
      }

      const payload: unknown = await response.json().catch(() => null);
      return { ok: true, id: shape.messageId(payload) };
    } catch (err) {
      // Network down, DNS failure, timeout. Never rethrown: see Mailer's
      // contract — a delivery problem must not become a broken page.
      return {
        ok: false,
        error: `${this.name} request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }
}

/** Type guard used by the env resolver (and by its test). */
export function isProviderName(value: string): value is ProviderName {
  return value === "resend" || value === "postmark";
}
