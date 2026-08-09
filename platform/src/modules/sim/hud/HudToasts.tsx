"use client";

/**
 * Violation / commendation toasts — right side, newest on top.
 * Severity-colored with the official class name and a law-ref chip; the rule
 * engine authors every string (ADR-002 — no free-form AI text in the loop).
 *
 * Violation and lesson toasts carry the catalog's authored explanation + law
 * citation (QW7 — the WHY must be visible at the moment of the mistake), so
 * they live longer than the short commendation praise.
 *
 * `useHudToastQueue` owns ids + expiry; the component is presentational.
 *
 * ---------------------------------------------------------------------------
 * DOC 86 · L14 — THE DESKTOP REWORK
 *
 * The mobile wave routed compact layouts through `overlayQueue.ts` and left
 * this file — the ROOMY path, the one the founder reviewed on — exactly as it
 * was: the column `pointer-events-none`, every card `w-72` (288 px), up to
 * FOUR stacked, expiring only on a TTL. His verdict: „they need to be able to
 * be removed when clicked with the mouse … currently they are much much
 * annoying, important but annoying, we need a complete rework of those
 * notifications."
 *
 * What changed, all four of his asks:
 *  · CLICK REMOVES IT. The card is a real `<button>` — `pointer-events-auto`,
 *    a hit area the size of the whole card, `aria-label` „Скрий известието",
 *    and a ✕ affordance so it LOOKS dismissible before it is clicked.
 *  · TWO, NOT FOUR — `TOAST_MAX_VISIBLE`; one in quiet mode.
 *  · NARROWER — 288 px → 240 px (`TOAST_CARD_WIDTH_CLASS`).
 *  · A SETTING — „По-тихи известия" (persisted; the shell owns the control),
 *    which drops PRAISE only. A violation or a teach card keeps its authored
 *    explanation and its law chip in every mode, because that explanation is
 *    THEO-4's requirement zero and the only reason the toast exists.
 *
 * NO KEYBOARD BINDING HERE, ON PURPOSE. Space is the parking-brake toggle
 * (`engine/input.ts:223`) and a toast fires with the car moving; the Space
 * acknowledgement the founder asked for belongs to the end-of-lesson popup,
 * where the drive is over. See the note at the top of `hudPreferences.ts`.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { HudEvent } from "../contracts";
import { minusPointsBg } from "../rules";
import {
  TOAST_CARD_WIDTH_CLASS,
  TOAST_MAX_VISIBLE,
  visibleToasts,
} from "./hudPreferences";

export interface HudToast {
  id: number;
  event: HudEvent;
}

/** Short-lived praise ("Браво") — no body text to read. */
const TOAST_TTL_MS = 4000;
/** Violation/lesson toasts render 1–3 sentences of explanation — give the
 * student time to read them (~15 chars/s reading speed at driving load). */
const TEACHING_TOAST_TTL_MS = 8000;
/**
 * The queue holds a little more than the column shows: quiet mode filters
 * praise out at render time, and dropping a card from the store as well would
 * make „по-тихи известия" retroactively delete history the debrief still
 * counts. `visibleToasts` is the one place the cap is applied.
 */
const MAX_QUEUED = TOAST_MAX_VISIBLE + 2;

function ttlFor(event: HudEvent): number {
  return event.kind === "violation" || event.kind === "lesson"
    ? TEACHING_TOAST_TTL_MS
    : TOAST_TTL_MS;
}

export function useHudToastQueue(): {
  toasts: HudToast[];
  /** `ttlMs` overrides the kind-derived TTL — short control hints (e.g. the
   *  driveline-rejection feedback) live 3–4 s, not the 8 s teaching TTL. */
  push: (events: ReadonlyArray<HudEvent>, ttlMs?: number) => void;
  /** L14: the student clicked a card away before its TTL ran out. */
  dismiss: (id: number) => void;
  clear: () => void;
} {
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const push = useCallback((events: ReadonlyArray<HudEvent>, ttlMs?: number) => {
    if (events.length === 0) return;
    const added: HudToast[] = events.map((event) => ({ id: nextId.current++, event }));
    setToasts((prev) => [...added.reverse(), ...prev].slice(0, MAX_QUEUED));
    for (const toast of added) {
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, ttlMs ?? ttlFor(toast.event));
      timers.current.push(timer);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  return { toasts, push, dismiss, clear };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SEVERITY_META = {
  opasna: { label: "Опасна грешка", color: "var(--danger)" },
  osnovna: { label: "Основна грешка", color: "var(--warning)" },
  vtorostepenna: { label: "Второстепенна", color: "var(--accent-soft)" },
} as const;

/**
 * The dismissible shell every card shares.
 *
 * A `<button>` and not a `<div onClick>`: the whole card is the hit area, it is
 * reachable by keyboard and by screen reader, and the accessible name says what
 * clicking does. `text-left` because a button centres its content by default
 * and this one holds a paragraph.
 */
function ToastShell({
  color,
  onDismiss,
  children,
}: {
  color: string;
  onDismiss: (() => void) | null;
  children: ReactNode;
}) {
  const interactive = onDismiss !== null;
  // `hud-ghost` — the founder's words about this exact column were „those pop
  // ups … are much much annoying, important but annoying". The information is
  // not the annoyance; the opaque blurred card that parks itself on his road is.
  // In the reference the equivalent lane — sector times, position deltas — is a
  // stack of coloured numbers straight on the image. So the card goes and the
  // authored explanation and its law chip stay exactly as they are (THEO-4):
  // the toast still says WHY, it just no longer paints a box to say it in.
  // A left rule in the fault's own colour replaces the border-on-a-fill so the
  // severity is still readable at a glance.
  const className =
    `hud-ghost hud-toast-in ${TOAST_CARD_WIDTH_CLASS} border-l-2 py-1 pl-2.5 pr-1 text-left ` +
    (interactive
      ? "pointer-events-auto cursor-pointer opacity-90 transition hover:opacity-100 motion-reduce:transition-none"
      : "pointer-events-none");
  const style = { borderColor: color };

  if (!interactive) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Скрий известието"
      title="Щракни, за да го скриеш"
      className={className}
      style={style}
    >
      {children}
    </button>
  );
}

/** The ✕ hint in the card's header row — it must LOOK dismissible. */
function DismissGlyph({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden className="ml-1 shrink-0 text-[11px] font-black leading-none text-muted">
      ✕
    </span>
  );
}

function ToastCard({
  event,
  onDismiss,
}: {
  event: HudEvent;
  onDismiss: (() => void) | null;
}) {
  if (event.kind === "violation") {
    const meta = SEVERITY_META[event.severity];
    return (
      <ToastShell color={meta.color} onDismiss={onDismiss}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="flex items-center gap-1">
            {/* The unit rides ON the number. A bare „−10 т." on a toast is the
                same misreading as on the result screen, three minutes earlier. */}
            <span
              className="whitespace-nowrap text-xs font-black tabular-nums"
              style={{ color: meta.color }}
            >
              {minusPointsBg("exam", event.points)}
            </span>
            <DismissGlyph show={onDismiss !== null} />
          </span>
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
        {/* The WHY — same layout as the "lesson" teaching toast below (QW7):
            our moat is the law-cited explanation at the moment of learning.
            Quiet mode NEVER removes this; it removes praise. */}
        <p className="mt-1 text-xs leading-snug text-muted">{event.explanationBg}</p>
        {event.lawRef ? (
          <span className="mt-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
            {event.lawRef}
          </span>
        ) : null}
      </ToastShell>
    );
  }

  if (event.kind === "commendation") {
    return (
      <ToastShell color="var(--success)" onDismiss={onDismiss}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: "var(--success)" }}
          >
            Браво
          </span>
          <DismissGlyph show={onDismiss !== null} />
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
      </ToastShell>
    );
  }

  if (event.kind === "lesson") {
    // A first, teachable encounter — coached, not scored. Framed to teach, not scold.
    return (
      <ToastShell color="var(--accent-2)" onDismiss={onDismiss}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: "var(--accent-2)" }}
          >
            📚 Научи
          </span>
          <DismissGlyph show={onDismiss !== null} />
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
        <p className="mt-1 text-xs leading-snug text-muted">{event.explanationBg}</p>
        {event.lawRef ? (
          <span className="mt-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
            {event.lawRef}
          </span>
        ) : null}
      </ToastShell>
    );
  }

  // objectiveComplete is rendered by the banner; quiz belongs to the tutor
  // layer (v2) — neither shows as a toast.
  return null;
}

export function HudToasts({
  toasts,
  quiet = false,
  onDismiss,
  onDismissAll,
}: {
  toasts: HudToast[];
  /** „По-тихи известия": one card at a time, and no praise. */
  quiet?: boolean;
  /** L14: omit and the column stays inert (the pre-rework behaviour). */
  onDismiss?: (id: number) => void;
  /** Shown only while more than one card is up — one click clears the lot. */
  onDismissAll?: () => void;
}) {
  const shown = visibleToasts(toasts, quiet);
  if (shown.length === 0) return null;
  return (
    // The WRAPPER stays inert so the column never eats a click meant for the
    // road behind it; only the cards themselves are `pointer-events-auto`.
    <div
      aria-live="polite"
      data-hud="toasts"
      className="pointer-events-none flex flex-col items-end gap-2 select-none"
    >
      {shown.map((t) => (
        <ToastCard
          key={t.id}
          event={t.event}
          onDismiss={onDismiss ? () => onDismiss(t.id) : null}
        />
      ))}
      {onDismissAll && shown.length > 1 ? (
        <button
          type="button"
          onClick={onDismissAll}
          className="hud-ghost pointer-events-auto rounded-full border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
        >
          Изчисти известията
        </button>
      ) : null}
    </div>
  );
}
