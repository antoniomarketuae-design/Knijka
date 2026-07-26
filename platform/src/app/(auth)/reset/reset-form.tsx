"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  FormError,
  SubmitButton,
  TextField,
  focusFirstError,
} from "../auth-fields";
import { resetPasswordAction } from "./actions";

/** Keep in sync with modules/auth schemas.ts — the server is what decides. */
const MIN_PASSWORD_LENGTH = 8;

type FieldErrors = Partial<Record<"password" | "confirm", string>>;

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needsNewLink, setNeedsNewLink] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Паролата трябва да е поне ${MIN_PASSWORD_LENGTH} знака.`;
    }
    // Confirmation is a client-side concern only: the server has no business
    // knowing the student typed it twice, and a mismatch is not a security
    // event — it is a typo we should catch before spending the single-use token.
    if (password !== confirm) {
      errors.confirm = "Двете пароли не съвпадат.";
    }
    return errors;
  }

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
      requestAnimationFrame(() => focusFirstError(formRef.current));
      return;
    }

    setPending(true);
    try {
      const result = await resetPasswordAction(token, password);

      if (result.status === "error") {
        setFormError(result.message);
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
      setFormError("Нещо се обърка. Опитай отново.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      <TextField
        id="password"
        label="Нова парола"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={setPassword}
        onBlur={revalidate}
        hint={`Поне ${MIN_PASSWORD_LENGTH} знака. Избери нещо, което не използваш другаде.`}
        error={fieldErrors.password}
        disabled={pending}
      />

      <TextField
        id="confirm"
        label="Повтори паролата"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={setConfirm}
        onBlur={revalidate}
        error={fieldErrors.confirm}
        disabled={pending}
      />

      {formError && (
        <FormError>
          <p>{formError}</p>
          {needsNewLink && (
            <Link
              href="/forgot"
              className="mt-1.5 inline-block rounded font-semibold text-accent underline-offset-4 hover:underline"
            >
              Поискай нов линк →
            </Link>
          )}
        </FormError>
      )}

      <SubmitButton pending={pending} pendingLabel="Запазваме…">
        Запази новата парола
      </SubmitButton>
    </form>
  );
}
