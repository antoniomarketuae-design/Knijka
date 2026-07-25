/**
 * modules/mail — the transport seam (audit 2026-07-24, H-14: the repo could
 * not send an e-mail at all, which is why a forgotten password was
 * unrecoverable).
 *
 * What these tests are really guarding is the FOUNDER HANDOVER: the flow ships
 * on the console transport, and the only remaining step is adding credentials.
 * So the two things worth proving are (a) the console transport really carries
 * the reset link where a human can read it, and (b) the moment the env vars
 * exist, a correctly-shaped provider request goes out — nobody wants to
 * discover a swapped field name on launch day, from a student's support mail.
 *
 * No network is touched: the provider transport takes its `fetch` by injection.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMailer } from "../console";
import { resetMailWarnings, resolveMailerFromEnv } from "../factory";
import { passwordResetEmail } from "../messages";
import { ProviderMailer } from "../provider";
import type { MailMessage } from "../types";

const MESSAGE: MailMessage = {
  to: "ivan@mail.bg",
  subject: "Нова парола за Книжка.AI",
  text: "Отвори: https://knijka.ai/reset?token=abc123",
  html: "<p>Отвори</p>",
};

/** A `fetch` that records the call and answers with `response`. */
function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

afterEach(() => {
  resetMailWarnings();
  vi.restoreAllMocks();
});

describe("resolveMailerFromEnv — which transport is live", () => {
  it("ships with the console transport when nothing is configured", () => {
    expect(resolveMailerFromEnv({}).name).toBe("console");
    expect(resolveMailerFromEnv({ MAIL_TRANSPORT: "console" }).name).toBe("console");
  });

  it("switches to a provider the moment the credentials exist — no code change", () => {
    for (const provider of ["resend", "postmark"]) {
      const mailer = resolveMailerFromEnv({
        MAIL_TRANSPORT: provider,
        MAIL_API_KEY: "key_123",
        MAIL_FROM: "Книжка.AI <no-reply@knijka.ai>",
      });
      expect(mailer.name).toBe(provider);
      resetMailWarnings();
    }
  });

  it("FAILS SOFT: a provider without credentials degrades to console, loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // A hard throw here would take down /forgot — i.e. break account recovery
    // exactly when the mail config is already wrong.
    expect(resolveMailerFromEnv({ MAIL_TRANSPORT: "resend" }).name).toBe("console");
    expect(warn).toHaveBeenCalledTimes(1);

    resetMailWarnings();
    expect(
      resolveMailerFromEnv({ MAIL_TRANSPORT: "resend", MAIL_API_KEY: "k" }).name,
    ).toBe("console"); // MAIL_FROM missing — every provider would 4xx
    resetMailWarnings();
    expect(resolveMailerFromEnv({ MAIL_TRANSPORT: "sendgrid" }).name).toBe("console");
  });
});

describe("ConsoleMailer — the transport that ships today", () => {
  it("prints the whole body, so the reset link is readable in the server log", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer(
      { from: "Книжка.AI <no-reply@localhost>" },
      (line) => lines.push(line),
    );

    const result = await mailer.send(MESSAGE);

    expect(result.ok).toBe(true);
    expect(lines).toHaveLength(1); // one atomic block, never interleaved
    expect(lines[0]).toContain("https://knijka.ai/reset?token=abc123");
    expect(lines[0]).toContain("ivan@mail.bg");
    expect(lines[0]).toContain(MESSAGE.subject);
  });
});

describe("ProviderMailer — the transport that turns on with credentials", () => {
  it("posts Resend's exact field names and returns the message id", async () => {
    const { impl, calls } = fakeFetch(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }),
    );
    const mailer = new ProviderMailer(
      "resend",
      "re_key",
      { from: "Книжка.AI <no-reply@knijka.ai>", replyTo: "help@knijka.ai" },
      impl,
    );

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ ok: true, id: "msg_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "Книжка.AI <no-reply@knijka.ai>",
      to: ["ivan@mail.bg"], // an array for Resend, a string for Postmark
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
      reply_to: "help@knijka.ai",
    });
  });

  it("posts Postmark's differently-cased fields on the transactional stream", async () => {
    const { impl, calls } = fakeFetch(
      new Response(JSON.stringify({ MessageID: "pm_1" }), { status: 200 }),
    );
    const mailer = new ProviderMailer(
      "postmark",
      "pm_token",
      { from: "Книжка.AI <no-reply@knijka.ai>" },
      impl,
    );

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ ok: true, id: "pm_1" });
    expect(calls[0].url).toBe("https://api.postmarkapp.com/email");
    expect(
      (calls[0].init.headers as Record<string, string>)["X-Postmark-Server-Token"],
    ).toBe("pm_token");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.To).toBe("ivan@mail.bg");
    expect(body.TextBody).toBe(MESSAGE.text);
    // Wrong stream = account-recovery mail queued behind marketing.
    expect(body.MessageStream).toBe("outbound");
    expect(body.ReplyTo).toBeUndefined(); // none configured, none sent
  });

  it("NEVER THROWS: a rejected send and a dead network are both values", async () => {
    const rejected = new ProviderMailer(
      "resend",
      "re_key",
      { from: "x@y.bg" },
      fakeFetch(new Response("domain is not verified", { status: 422 })).impl,
    );
    const result = await rejected.send(MESSAGE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("422");
      // The provider's own words are the only thing that ever explains this.
      expect(result.error).toContain("domain is not verified");
    }

    const offline = new ProviderMailer(
      "resend",
      "re_key",
      { from: "x@y.bg" },
      (async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }) as unknown as typeof fetch,
    );
    const down = await offline.send(MESSAGE);
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.error).toContain("ENOTFOUND");
  });
});

describe("passwordResetEmail — the copy a locked-out student reads", () => {
  const built = passwordResetEmail({
    to: "ivan@mail.bg",
    resetUrl: "https://knijka.ai/reset?token=A-b_1",
    expiresInMinutes: 60,
  });

  it("carries the link in the PLAIN-TEXT part (the part that always survives)", () => {
    expect(built.text).toContain("https://knijka.ai/reset?token=A-b_1");
    expect(built.to).toBe("ivan@mail.bg");
    expect(built.subject).toContain("Книжка.AI");
  });

  it("says how long it lasts and what to do if it was not them", () => {
    expect(built.text).toContain("60 минути");
    expect(built.text).toContain("само веднъж");
    expect(built.text).toContain("Ако не си ти");
  });

  it("GDPR: nothing but the address — no name, no progress, no purchases", () => {
    // The template takes no user record at all; this pins that down so a
    // future „Здравей, {name}" cannot slip in unnoticed (ADR-004, minors).
    const body = `${built.text}${built.html ?? ""}`;
    expect(body).not.toContain("Иван");
    expect(Object.keys(built).sort()).toEqual(["html", "subject", "text", "to"]);
  });

  it("escapes the URL in the HTML part rather than trusting it", () => {
    const evil = passwordResetEmail({
      to: "ivan@mail.bg",
      resetUrl: 'https://knijka.ai/reset?token="><script>alert(1)</script>',
      expiresInMinutes: 60,
    });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });
});
