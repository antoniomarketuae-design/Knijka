"use client";

/**
 * Client island for the password panel on /settings.
 *
 * It replaces a paragraph that told students automatic password change "is not
 * ready yet" and sent them to a contact page — copy that outlived the shipped
 * /forgot flow and made the product look abandoned at the screen where trust is
 * decided.
 *
 * Two controls, deliberately different shapes:
 *  - the change form is closed until asked for, so the settings page stays a
 *    page and not a wall of inputs;
 *  - „Изход от всички устройства" is one button, because it is the thing a
 *    student reaches for while already worried.
 * Both end the current session (that is what „навсякъде" means), and both say
 * so BEFORE the click rather than surprising anyone with a login screen.
 */

import { useActionState, useState } from "react";
import { IconLock, IconLogout } from "@/components/icons";
import { changeMyPassword, signOutEverywhereAction } from "./actions";
import { initialChangePasswordState } from "./password-contract";

/** Keep in sync with modules/auth schemas.ts — the server is what decides. */
const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    changeMyPassword,
    initialChangePasswordState,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost text-sm"
      >
        <IconLock className="h-4 w-4" />
        Смени паролата
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-hair bg-surface-2/40 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current-password" className="hud-label">
          Текущата ти парола
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
          aria-invalid={state.field === "currentPassword" || undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="hud-label">
          Нова парола
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={inputClass}
          aria-invalid={state.field === "password" || undefined}
        />
        <p className="text-xs leading-relaxed text-muted">
          Поне {MIN_PASSWORD_LENGTH} знака. Избери нещо, което не използваш
          другаде.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="hud-label">
          Повтори новата парола
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={inputClass}
          aria-invalid={state.field === "confirm" || undefined}
        />
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.message}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        След смяната те отписваме от всички устройства — включително това — и
        влизаш отново с новата парола.
      </p>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn-accent text-sm">
          {pending ? "Запазваме…" : "Запази новата парола"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="btn-ghost text-sm"
        >
          Откажи
        </button>
      </div>
    </form>
  );
}

function SignOutEverywhereButton() {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async () => {
        setPending(true);
        await signOutEverywhereAction();
      }}
    >
      <button type="submit" disabled={pending} className="btn-ghost text-sm">
        <IconLogout className="h-4 w-4" />
        {pending ? "Отписваме…" : "Изход от всички устройства"}
      </button>
    </form>
  );
}

export function PasswordControls() {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <ChangePasswordForm />
      <div className="border-t border-hair pt-4">
        <SignOutEverywhereButton />
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ако си влизал от чужд компютър и си забравил да излезеш — това
          прекратява всички активни влизания, без да сменяш паролата.
        </p>
      </div>
    </div>
  );
}
