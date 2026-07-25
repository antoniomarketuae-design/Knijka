/**
 * The development transport: it "delivers" by printing the message to the
 * server log.
 *
 * This is not a stub — it is the transport the product ships with until the
 * founder opens an e-mail provider account (audit 2026-07-24, H-14). The whole
 * password-reset flow therefore has to be genuinely usable through it, which
 * is why the body is printed in full: the reset link is right there in
 * `pm2 logs` / the `npm run dev` console, so recovery works on staging today
 * and switching to a real provider is two env vars, not a rewrite.
 */

import type { MailMessage, MailResult, MailSender, Mailer } from "./types";

export class ConsoleMailer implements Mailer {
  readonly name = "console";

  constructor(
    private readonly sender: MailSender,
    /** Injectable so tests can capture output instead of printing it. */
    private readonly log: (line: string) => void = (line) => console.info(line),
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    // One block, one console call: interleaved lines from concurrent requests
    // would split a reset link across other output and make it unusable.
    this.log(
      [
        "",
        "──────────────────────────────────────────────────────────────",
        "[mail:console] NOT SENT — no provider configured (see .env.example)",
        `  from:    ${this.sender.from}`,
        `  to:      ${message.to}`,
        this.sender.replyTo || message.replyTo
          ? `  replyTo: ${message.replyTo ?? this.sender.replyTo}`
          : null,
        `  subject: ${message.subject}`,
        "──────────────────────────────────────────────────────────────",
        message.text,
        "──────────────────────────────────────────────────────────────",
        "",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    );

    // `ok: true` on purpose: from the caller's point of view the message was
    // handed off successfully. A false here would make every dev run look like
    // an outage and would train us to ignore real send failures.
    return { ok: true, id: "console" };
  }
}
