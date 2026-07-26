"use client";

import { useState } from "react";
import Link from "next/link";
import { FormError, SubmitButton, TextField } from "../auth-fields";
import { requestPasswordResetAction } from "./actions";

export function ForgotForm({ expiresInMinutes }: { expiresInMinutes: number }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    // Client-side shape check only; the server re-validates everything.
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldError("Въведи валиден имейл адрес.");
      return;
    }

    setPending(true);
    try {
      const result = await requestPasswordResetAction(email.trim());
      if (result.status === "sent") {
        setSent(true);
        return;
      }
      setFormError(result.message);
    } catch {
      setFormError("Нещо се обърка. Опитай отново.");
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
        <div className="panel-inset px-4 py-3.5">
          <p className="text-sm leading-relaxed">
            Ако има акаунт с <strong className="font-bold">{email.trim()}</strong>,
            изпратихме имейл с линк за нова парола.
          </p>
        </div>
        <p className="text-sm leading-relaxed text-muted">
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
      <TextField
        id="email"
        label="Имейл"
        type="email"
        autoComplete="email"
        required
        autoFocus
        value={email}
        onChange={setEmail}
        error={fieldError ?? undefined}
        disabled={pending}
      />

      {formError && <FormError>{formError}</FormError>}

      <SubmitButton pending={pending} pendingLabel="Изпращаме…">
        Изпрати линк за нова парола
      </SubmitButton>
    </form>
  );
}
