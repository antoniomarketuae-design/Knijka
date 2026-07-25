/**
 * The message templates. One function per transactional e-mail the product
 * sends, each returning a ready MailMessage — so the copy is reviewable in one
 * place and no caller ever assembles a subject line by hand.
 *
 * Rules the copy follows (docs: bg-BG is the user-facing language, and it has
 * to read naturally to a 17-year-old):
 * - Second person singular, the same voice as the rest of the app.
 * - Says what happens next and what to do if it was not them — a security
 *   e-mail nobody reads protects nobody.
 * - No PII beyond the address it is sent to (ADR-004, users are minors): no
 *   name, no progress, no purchase history.
 * - The link exists in the plain-text part, always. The HTML part is a bonus.
 */

import type { MailMessage } from "./types";

/** Minimal escaping for the HTML part — the only interpolation is our own URL,
 *  but a template that trusts its input is one refactor away from not being. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PasswordResetEmailInput {
  to: string;
  /** Absolute URL including the single-use token. */
  resetUrl: string;
  expiresInMinutes: number;
}

export function passwordResetEmail({
  to,
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailInput): MailMessage {
  const subject = "Нова парола за Книжка.AI";

  const text = [
    "Здравей!",
    "",
    "Поиска нова парола за акаунта си в Книжка.AI. Отвори този линк и си избери нова:",
    "",
    resetUrl,
    "",
    `Линкът важи ${expiresInMinutes} минути и може да се използва само веднъж.`,
    "",
    "Ако не си ти, просто изтрий този имейл — паролата ти остава същата и никой не е влизал в акаунта ти.",
    "",
    "Успех с подготовката!",
    "Екипът на Книжка.AI",
    "",
    "(Това е автоматично съобщение — няма нужда да отговаряш.)",
  ].join("\n");

  const safeUrl = escapeHtml(resetUrl);
  const html = [
    // Inline styles only, no <head>, no web fonts, no images: anything else is
    // stripped or blocked by the mail clients a Bulgarian teenager actually
    // uses (Gmail app, Abv.bg), and a blocked stylesheet must never hide a link.
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.6;color:#111">',
    "<p>Здравей!</p>",
    "<p>Поиска нова парола за акаунта си в <strong>Книжка.AI</strong>. Натисни бутона и си избери нова:</p>",
    `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700">Смени паролата</a></p>`,
    `<p style="font-size:14px;color:#555">Или копирай този адрес в браузъра си:<br><span style="word-break:break-all">${safeUrl}</span></p>`,
    `<p style="font-size:14px;color:#555">Линкът важи ${expiresInMinutes} минути и може да се използва само веднъж.</p>`,
    "<p style=\"font-size:14px;color:#555\">Ако не си ти, просто изтрий този имейл — паролата ти остава същата и никой не е влизал в акаунта ти.</p>",
    "<p>Успех с подготовката!<br>Екипът на Книжка.AI</p>",
    "</div>",
  ].join("");

  return { to, subject, text, html };
}
