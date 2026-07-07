"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

type FieldErrors = Partial<
  Record<"email" | "password" | "name" | "birthYear" | "consent", string>
>;

const CURRENT_MAX_YEAR = 2012;
const MIN_YEAR = 1950;

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = "Въведи валиден имейл адрес.";
    }
    if (!name.trim()) {
      errors.name = "Името е задължително.";
    }
    if (password.length < 8) {
      errors.password = "Паролата трябва да е поне 8 знака.";
    }
    const year = Number(birthYear);
    if (!birthYear || !Number.isInteger(year) || year < MIN_YEAR || year > CURRENT_MAX_YEAR) {
      errors.birthYear = `Годината на раждане трябва да е между ${MIN_YEAR} и ${CURRENT_MAX_YEAR}.`;
    }
    if (!consent) {
      errors.consent = "Трябва да се съгласиш с обработката на личните ти данни.";
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          password,
          birthYear: Number(birthYear),
          consent,
        }),
      });

      if (res.status === 409) {
        setFieldErrors({ email: "Вече има акаунт с този имейл." });
        return;
      }

      if (res.status === 400) {
        const data: {
          fieldErrors?: Partial<Record<keyof FieldErrors, string[]>>;
        } = await res.json().catch(() => ({}));
        const serverErrors: FieldErrors = {};
        for (const key of ["email", "password", "name", "birthYear", "consent"] as const) {
          const first = data.fieldErrors?.[key]?.[0];
          if (first) serverErrors[key] = first;
        }
        if (Object.keys(serverErrors).length > 0) {
          setFieldErrors(serverErrors);
        } else {
          setFormError("Невалидни данни. Провери полетата и опитай отново.");
        }
        return;
      }

      if (!res.ok) {
        setFormError("Нещо се обърка. Опитай отново по-късно.");
        return;
      }

      // Account created — sign in and go to the dashboard.
      const signInRes = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!signInRes || signInRes.error) {
        // Rare (e.g. race) — the account exists, let them log in manually.
        router.push("/login");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setFormError("Нещо се обърка. Опитай отново.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Име
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        {fieldErrors.name && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>
        )}
      </div>

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
        {fieldErrors.email && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Парола
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs opacity-60">Поне 8 знака.</p>
        {fieldErrors.password && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>
        )}
      </div>

      <div>
        <label htmlFor="birthYear" className="mb-1 block text-sm font-medium">
          Година на раждане
        </label>
        <input
          id="birthYear"
          name="birthYear"
          type="number"
          inputMode="numeric"
          min={MIN_YEAR}
          max={CURRENT_MAX_YEAR}
          required
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className={inputClass}
        />
        {fieldErrors.birthYear && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.birthYear}</p>
        )}
      </div>

      <div>
        <label className="flex items-start gap-2 text-xs leading-relaxed opacity-90">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            {/* GDPR consent stub — final wording pending legal review */}
            Съгласявам се AI Driving Academy да обработва личните ми данни
            (имейл, име, година на раждане) за целите на създаване на акаунт и
            проследяване на учебния ми напредък, в съответствие с GDPR. Мога да
            оттегля съгласието си по всяко време.
          </span>
        </label>
        {fieldErrors.consent && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.consent}</p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Моля, изчакай…" : "Създай акаунт"}
      </button>
    </form>
  );
}
