"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

export function ForgotForm({ expiresInMinutes }: { expiresInMinutes: number }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side shape check only; the server re-validates everything.
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Въведи валиден имейл адрес.");
      return;
    }

    setPending(true);
    try {
      const result = await requestPasswordResetAction(email.trim());
      if (result.status === "sent") {
        setSent(true);
        return;
      }
      setError(result.message);
    } catch {
      setError("Нещо се обърка. Опитай отново.");
    } finally {
      setPending(false);
    }
  }

  // The confirmation deliberately says "ако има акаунт" — the same words for an
  // address we know and one we do not (see modules/auth reset.ts). The spam
  // note is not filler: with a brand-new sending domain it is where the first
  // mails land, and a student who does not look there is still locked out.
  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm">
          Ако има акаунт с <strong>{email.trim()}</strong>, изпратихме имейл с
          линк за нова парола.
        </p>
        <p className="text-sm text-muted">
          Линкът важи {expiresInMinutes} минути и работи само веднъж. Ако не го
          виждаш до минута-две, провери и папка „Спам“.
        </p>
        <Link href="/login" className="btn-accent inline-flex w-full justify-center">
          Обратно към входа
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Имейл
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-accent w-full disabled:opacity-50"
      >
        {pending ? "Изпращаме…" : "Изпрати линк за нова парола"}
      </button>
    </form>
  );
}
