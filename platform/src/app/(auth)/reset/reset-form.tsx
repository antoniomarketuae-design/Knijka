"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { resetPasswordAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

/** Keep in sync with modules/auth schemas.ts — the server is what decides. */
const MIN_PASSWORD_LENGTH = 8;

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsNewLink, setNeedsNewLink] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Паролата трябва да е поне ${MIN_PASSWORD_LENGTH} знака.`);
      return;
    }
    // Confirmation is a client-side concern only: the server has no business
    // knowing the student typed it twice, and a mismatch is not a security
    // event — it is a typo we should catch before spending the single-use token.
    if (password !== confirm) {
      setError("Двете пароли не съвпадат.");
      return;
    }

    setPending(true);
    try {
      const result = await resetPasswordAction(token, password);

      if (result.status === "error") {
        setError(result.message);
        setNeedsNewLink(result.needsNewLink);
        return;
      }

      // Straight in, no second login screen: they just proved they control the
      // address AND typed the password, so asking for it again is friction on
      // the exact path that already failed them once (H-14).
      const signInRes = await signIn("credentials", {
        email: result.email,
        password,
        redirect: false,
      });

      if (!signInRes || signInRes.error) {
        // Rare (e.g. the login rate limit is already spent). The password IS
        // changed, so send them to the login screen rather than implying it is
        // not — losing the auto-login is an inconvenience, not a failure.
        router.push("/login?reset=1");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Нещо се обърка. Опитай отново.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Нова парола
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">
          Поне {MIN_PASSWORD_LENGTH} знака. Избери нещо, което не използваш
          другаде.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          Повтори паролата
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <div role="alert" className="space-y-2">
          <p className="text-sm font-medium text-danger">{error}</p>
          {needsNewLink && (
            <Link
              href="/forgot"
              className="inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Поискай нов линк →
            </Link>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-accent w-full disabled:opacity-50"
      >
        {pending ? "Запазваме…" : "Запази новата парола"}
      </button>
    </form>
  );
}
