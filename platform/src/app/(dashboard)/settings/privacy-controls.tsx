"use client";

/**
 * Client island for the two GDPR rights on /settings (audit C-2).
 *
 * Export is a plain button: the action returns the JSON, the browser saves it
 * as a file. Deletion is deliberately two-step — the first click only OPENS a
 * panel; nothing is destroyed until the user has re-typed their password and
 * the confirmation word inside it. Irreversible actions should never be one
 * click away on a phone that gets passed around a classroom.
 */

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconShield, IconX } from "@/components/icons";
import { deleteMyAccount, exportMyData } from "./actions";
import {
  DELETE_CONFIRM_PHRASE,
  initialDeleteAccountState,
} from "./privacy-contract";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

/** „Изтегли данните ми" — Art. 15/20. */
function ExportButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setPending(true);
    try {
      const result = await exportMyData();
      if (!result.ok) {
        setError("Не намерихме данни за този акаунт. Опитай да влезеш отново.");
        return;
      }

      // Save via an object URL rather than a data: URL — a full export can be
      // megabytes and data: URLs hit browser length limits.
      const url = URL.createObjectURL(
        new Blob([result.json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Нещо се обърка при подготовката на файла. Опитай пак.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        className="btn-ghost text-sm"
      >
        <IconShield className="h-4 w-4" />
        {pending ? "Подготвяме файла…" : "Изтегли данните ми (JSON)"}
      </button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** „Изтрий акаунта ми" — Art. 17, behind a password + typed confirmation. */
function DeleteAccountPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteMyAccount,
    initialDeleteAccountState,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost text-sm text-danger"
      >
        <IconX className="h-4 w-4" />
        Изтрий акаунта ми
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-danger/40 bg-surface-2/40 p-4"
    >
      <div>
        <h3 className="font-display text-sm font-extrabold text-danger">
          Сигурен ли си?
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Това изтрива акаунта и целия ти напредък — отговорени въпроси,
          пробни изпити, каране на симулатора, разговори с учителя. Действието
          е окончателно и не можем да го върнем.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="delete-password" className="hud-label">
          Паролата ти
        </label>
        <input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="delete-confirm" className="hud-label">
          Напиши {DELETE_CONFIRM_PHRASE}
        </label>
        <input
          id="delete-confirm"
          name="confirm"
          type="text"
          autoComplete="off"
          required
          placeholder={DELETE_CONFIRM_PHRASE}
          className={inputClass}
        />
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-ghost border-danger/60 text-sm text-danger"
        >
          {pending ? "Изтриваме…" : "Да, изтрий всичко"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            // Drops the error text with the panel: reopening should start
            // clean, not re-accuse the user of a wrong password.
            router.refresh();
          }}
          disabled={pending}
          className="btn-ghost text-sm"
        >
          Откажи
        </button>
      </div>
    </form>
  );
}

export function PrivacyControls() {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <ExportButton />
        <Link href="/privacy#rights" className="btn-ghost text-sm">
          Правата ти върху данните
        </Link>
      </div>
      <div className="border-t border-hair pt-4">
        <DeleteAccountPanel />
      </div>
    </div>
  );
}
