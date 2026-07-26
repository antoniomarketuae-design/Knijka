"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  CheckboxField,
  FormError,
  SubmitButton,
  TextField,
  focusFirstError,
} from "../auth-fields";

type FieldErrors = Partial<
  Record<"email" | "password" | "name" | "birthYear" | "consent", string>
>;

/** Field order, so a failed submit reports problems the way the eye reads them. */
const FIELD_ORDER = ["name", "email", "password", "birthYear", "consent"] as const;

// Youngest allowed account: MIN_AGE years old *this* calendar year — computed,
// so the ceiling never drifts (a hardcoded year silently raised the minimum
// age every January). Keep MIN_AGE in sync with modules/auth/schemas.ts.
const MIN_AGE = 14;
const CURRENT_MAX_YEAR = new Date().getFullYear() - MIN_AGE;
const MIN_YEAR = 1950;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Same validation timing as the login form: silent until the first submit,
 * self-correcting afterwards. It matters more here — five fields validated on
 * blur means five red messages collected before the user has finished the
 * form, which reads as a form that dislikes you.
 */
export function RegisterForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = "Въведи валиден имейл адрес.";
    }
    if (!name.trim()) {
      errors.name = "Името е задължително.";
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Паролата трябва да е поне ${MIN_PASSWORD_LENGTH} знака.`;
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

  function revalidate() {
    if (submitted) setFieldErrors(validate());
  }

  /** Server-reported problems, mapped back onto the fields that caused them. */
  function applyServerErrors(
    fieldErrorsFromServer: Partial<Record<keyof FieldErrors, string[]>> | undefined,
  ): boolean {
    const serverErrors: FieldErrors = {};
    for (const key of FIELD_ORDER) {
      const first = fieldErrorsFromServer?.[key]?.[0];
      if (first) serverErrors[key] = first;
    }
    if (Object.keys(serverErrors).length === 0) return false;
    setFieldErrors(serverErrors);
    requestAnimationFrame(() => focusFirstError(formRef.current));
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitted(true);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => focusFirstError(formRef.current));
      return;
    }

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
        requestAnimationFrame(() => focusFirstError(formRef.current));
        return;
      }

      if (res.status === 400) {
        const data: {
          fieldErrors?: Partial<Record<keyof FieldErrors, string[]>>;
        } = await res.json().catch(() => ({}));
        if (!applyServerErrors(data.fieldErrors)) {
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

      // New account → one-time onboarding (it forwards to /dashboard).
      router.push("/onboarding");
      router.refresh();
    } catch {
      setFormError("Нещо се обърка. Опитай отново.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      <TextField
        id="name"
        label="Име"
        autoComplete="name"
        required
        value={name}
        onChange={setName}
        onBlur={revalidate}
        error={fieldErrors.name}
        disabled={pending}
      />

      <TextField
        id="email"
        label="Имейл"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={setEmail}
        onBlur={revalidate}
        error={fieldErrors.email}
        disabled={pending}
      />

      <TextField
        id="password"
        label="Парола"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={setPassword}
        onBlur={revalidate}
        hint={`Поне ${MIN_PASSWORD_LENGTH} знака.`}
        error={fieldErrors.password}
        disabled={pending}
      />

      <TextField
        id="birthYear"
        label="Година на раждане"
        type="number"
        inputMode="numeric"
        min={MIN_YEAR}
        max={CURRENT_MAX_YEAR}
        required
        value={birthYear}
        onChange={setBirthYear}
        onBlur={revalidate}
        error={fieldErrors.birthYear}
        disabled={pending}
      />

      <CheckboxField
        id="consent"
        checked={consent}
        onChange={(next) => {
          setConsent(next);
          // Ticking the box is itself the fix, so clear its error immediately
          // rather than waiting for a blur that a checkbox may never get.
          if (next) setFieldErrors((prev) => ({ ...prev, consent: undefined }));
        }}
        error={fieldErrors.consent}
      >
        {/* GDPR consent — final wording pending legal review */}
        Съгласявам се Книжка.AI да обработва личните ми данни (имейл, име,
        година на раждане) за целите на създаване на акаунт и проследяване на
        учебния ми напредък, съгласно{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded font-semibold text-accent underline-offset-4 hover:underline"
        >
          Политиката за поверителност
        </a>{" "}
        и{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded font-semibold text-accent underline-offset-4 hover:underline"
        >
          Условията за ползване
        </a>
        . Мога да оттегля съгласието си по всяко време.
      </CheckboxField>

      {formError && <FormError>{formError}</FormError>}

      <SubmitButton pending={pending} pendingLabel="Моля, изчакай…">
        Създай акаунт
      </SubmitButton>
    </form>
  );
}
