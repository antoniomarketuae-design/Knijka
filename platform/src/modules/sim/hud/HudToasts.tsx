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
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { HudEvent } from "../contracts";

export interface HudToast {
  id: number;
  event: HudEvent;
}

/** Short-lived praise ("Браво") — no body text to read. */
const TOAST_TTL_MS = 4000;
/** Violation/lesson toasts render 1–3 sentences of explanation — give the
 * student time to read them (~15 chars/s reading speed at driving load). */
const TEACHING_TOAST_TTL_MS = 8000;
const MAX_VISIBLE = 4;

function ttlFor(event: HudEvent): number {
  return event.kind === "violation" || event.kind === "lesson"
    ? TEACHING_TOAST_TTL_MS
    : TOAST_TTL_MS;
}

export function useHudToastQueue(): {
  toasts: HudToast[];
  push: (events: ReadonlyArray<HudEvent>) => void;
  clear: () => void;
} {
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const push = useCallback((events: ReadonlyArray<HudEvent>) => {
    if (events.length === 0) return;
    const added: HudToast[] = events.map((event) => ({ id: nextId.current++, event }));
    setToasts((prev) => [...added.reverse(), ...prev].slice(0, MAX_VISIBLE));
    for (const toast of added) {
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, ttlFor(toast.event));
      timers.current.push(timer);
    }
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  return { toasts, push, clear };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SEVERITY_META = {
  opasna: { label: "Опасна грешка", color: "var(--danger)" },
  osnovna: { label: "Основна грешка", color: "var(--warning)" },
  vtorostepenna: { label: "Второстепенна", color: "var(--accent-soft)" },
} as const;

function ToastCard({ event }: { event: HudEvent }) {
  if (event.kind === "violation") {
    const meta = SEVERITY_META[event.severity];
    return (
      <div
        className="hud-toast-in pointer-events-none w-72 rounded-2xl border bg-surface/85 p-3 backdrop-blur-md"
        style={{ borderColor: `color-mix(in srgb, ${meta.color} 55%, transparent)` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-xs font-black tabular-nums" style={{ color: meta.color }}>
            −{event.points} т.
          </span>
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
        {/* The WHY — same layout as the "lesson" teaching toast below (QW7):
            our moat is the law-cited explanation at the moment of learning. */}
        <p className="mt-1 text-xs leading-snug text-muted">{event.explanationBg}</p>
        {event.lawRef ? (
          <span className="mt-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
            {event.lawRef}
          </span>
        ) : null}
      </div>
    );
  }

  if (event.kind === "commendation") {
    return (
      <div
        className="hud-toast-in pointer-events-none w-72 rounded-2xl border bg-surface/85 p-3 backdrop-blur-md"
        style={{ borderColor: "color-mix(in srgb, var(--success) 55%, transparent)" }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-wide"
          style={{ color: "var(--success)" }}
        >
          Браво
        </span>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
      </div>
    );
  }

  if (event.kind === "lesson") {
    // A first, teachable encounter — coached, not scored. Framed to teach, not scold.
    return (
      <div
        className="hud-toast-in pointer-events-none w-72 rounded-2xl border bg-surface/85 p-3 backdrop-blur-md"
        style={{ borderColor: "color-mix(in srgb, var(--accent-2) 55%, transparent)" }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-wide"
          style={{ color: "var(--accent-2)" }}
        >
          📚 Научи
        </span>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
        <p className="mt-1 text-xs leading-snug text-muted">{event.explanationBg}</p>
        {event.lawRef ? (
          <span className="mt-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
            {event.lawRef}
          </span>
        ) : null}
      </div>
    );
  }

  // objectiveComplete is rendered by the banner; quiz belongs to the tutor
  // layer (v2) — neither shows as a toast.
  return null;
}

export function HudToasts({ toasts }: { toasts: HudToast[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none flex flex-col items-end gap-2 select-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} event={t.event} />
      ))}
    </div>
  );
}
