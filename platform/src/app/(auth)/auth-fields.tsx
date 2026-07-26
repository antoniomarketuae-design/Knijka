"use client";

import { useState, type ReactNode } from "react";

/**
 * Form controls for the (auth) route group — the one place login, register,
 * forgot and reset agree on what an input is.
 *
 * WHY A COMPONENT AND NOT A SHARED CLASS STRING. All four forms carried their
 * own copy of the same 200-character Tailwind string, and not one of them
 * wired `aria-invalid` or `aria-describedby`: the red line under a field was
 * visible but silent, so a screen-reader user was told a submit had failed and
 * never told which field or why. Moving the control into a component is what
 * makes that wiring impossible to forget — the ids are derived HERE, from the
 * field's own id, instead of at four call sites that each have to remember.
 *
 * A LOGIN FORM IS A TOOL. Everything below is chosen for speed of use rather
 * than atmosphere: real <label>s (never a placeholder standing in for one),
 * native `autocomplete` so the phone's password manager fills it, a reveal
 * toggle because this audience types passwords on a soft keyboard where a
 * typo is invisible, and errors placed where the eye already is.
 *
 * Field errors are deliberately NOT role="alert". A failed register submit
 * produces up to five of them at once, and five simultaneous live-region
 * announcements are noise. They are announced instead by being the field's
 * accessible description, at the moment focus lands on it (the forms move
 * focus to the first invalid field) — one message, in context, in order.
 */

type FieldType = "text" | "email" | "password" | "number";

interface TextFieldProps {
  /** Unique; also seeds the hint/error ids. */
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: FieldType;
  /** Standing rule for the field ("Поне 8 знака") — shown whether or not it errs. */
  hint?: ReactNode;
  /** Current problem with the value. Sets aria-invalid and paints the box. */
  error?: string;
  autoComplete?: string;
  inputMode?: "numeric";
  min?: number;
  max?: number;
  minLength?: number;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Re-validate on leave. The forms only pass this AFTER a first submit. */
  onBlur?: () => void;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  hint,
  error,
  autoComplete,
  inputMode,
  min,
  max,
  minLength,
  required,
  autoFocus,
  disabled,
  onBlur,
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  // Error first: the problem before the rule is the order a person needs them.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          inputMode={inputMode}
          min={min}
          max={max}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`field ${isPassword ? "pr-20" : ""}`}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            // aria-pressed rather than a changing label alone: the control is a
            // toggle, and its name should stay stable while its STATE changes.
            aria-pressed={revealed}
            aria-controls={id}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-xs font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            {revealed ? "Скрий" : "Покажи"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId ?? undefined} className="mt-1.5 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId ?? undefined} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Consent checkbox. The whole paragraph is the label, which is what gives a
 * touch user a target bigger than a 16px square — but the links inside it must
 * stay clickable, so they stop the click from reaching the label.
 */
export function CheckboxField({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted"
      >
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 h-[1.1rem] w-[1.1rem] shrink-0 accent-accent"
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form-level failure — the one place a live region is right, because there is
 * at most one of them and it carries news the user cannot see anywhere else
 * ("wrong e-mail or password", "something broke").
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger"
    >
      {children}
    </div>
  );
}

/**
 * Submit. `aria-busy` rather than only swapping the label: the label change is
 * for the eye, and a disabled button with no busy state reads to assistive
 * tech as "unavailable" rather than "working".
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn-accent w-full">
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Focus the first control the browser considers invalid, after a failed
 *  submit. Without it a long form scrolls the user back up to hunt for red. */
export function focusFirstError(form: HTMLFormElement | null): void {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
