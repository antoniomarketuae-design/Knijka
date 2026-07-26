"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  FormError,
  SubmitButton,
  TextField,
  focusFirstError,
} from "../auth-fields";

type FieldErrors = Partial<Record<"email" | "password", string>>;

/**
 * VALIDATION TIMING. Nothing is marked wrong until the user has tried to
 * submit once ("submitted" below). Validating on the first blur means telling
 * a student their e-mail is invalid while they are still typing it — the field
 * is empty-then-partial for the whole time they are in it. After a failed
 * submit the rules flip on: from then on blur re-checks and typing clears,
 * so the form corrects itself as it is fixed rather than scolding ahead of it.
 */
export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  // Client-side shape checks only; the server re-validates everything.
  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = "Въведи валиден имейл адрес.";
    }
    if (!password) {
      errors.password = "Въведи парола.";
    }
    return errors;
  }

  /** Re-check on leave, but only once the user has already tried to submit. */
  function revalidate() {
    if (submitted) setFieldErrors(validate());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitted(true);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // The attributes land with this render, so the focus move waits a frame.
      requestAnimationFrame(() => focusFirstError(formRef.current));
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
        setFormError("Грешен имейл или парола.");
        return;
      }

      router.push(callbackUrl);
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
        autoComplete="current-password"
        required
        value={password}
        onChange={setPassword}
        onBlur={revalidate}
        error={fieldErrors.password}
        disabled={pending}
      />

      {formError && <FormError>{formError}</FormError>}

      <SubmitButton pending={pending} pendingLabel="Моля, изчакай…">
        Влез
      </SubmitButton>
    </form>
  );
}
