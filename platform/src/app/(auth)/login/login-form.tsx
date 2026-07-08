"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:shadow-glow-sm motion-reduce:transition-none";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side validation (server re-validates everything).
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Въведи валиден имейл адрес.");
      return;
    }
    if (!password) {
      setError("Въведи парола.");
      return;
    }

    setPending(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!res || res.error) {
        // Always generic — must not reveal whether the e-mail exists.
        setError("Грешен имейл или парола.");
        return;
      }

      router.push(callbackUrl);
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
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Имейл
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Парола
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        {pending ? "Моля, изчакай…" : "Влез"}
      </button>
    </form>
  );
}
