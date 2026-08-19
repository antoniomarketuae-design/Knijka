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
  /**
   * WHEN THIS CARD WAS RAISED — `Date.now()` at `push`, see `stampToasts`.
   *
   * OPTIONAL, AND ABSENT MEANS „NO CLAIM". `app/dev/popup-rig` builds
   * `HudToast` literals by hand and a required field would only teach it to
   * invent a moment; an unstamped card prints no age at all, which is the
   * founder's standing ruling in `FaultCard`'s header — an honest blank beats a
   * guess — and is the one direction that cannot put a false anchor on a
   * verdict. Everything the student actually drives goes through
   * `useHudToastQueue`, which always stamps.
   */
  raisedAtMs?: number;
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

/* ═══════════════════════════════════════════════════════════════════════════
   THE CARD SAYS WHAT, AND FOR EIGHT SECONDS IT DID NOT SAY WHEN.

   MEASURED, deployed build, Chromium 1440 × 900 —
   `.audit-frames/sweep161/sc-junction-stop/pc-wrong/04-t099s.png`. This
   component's own violation card, fully painted, nothing clipped:

     ВТОРОСТЕПЕННА                                     −1 изпитна т.  ✕
     Превишена скорост
     Движеше се над разрешената скорост. Ограничението е таван, не цел …
     ЗДвП чл. 21, ал. 1

   …and the cluster 40 px below it reads **33 км/ч**, under a posted 40 chip and
   a ≤60 mode cap. The catalogue's sentence is honest — «Движеше се» is a past
   tense — but the CARD carries no moment, so from that frame a student cannot
   tell a record of something eight seconds ago from an accusation about the 33
   he is doing now. The auditor could not either, and wrote so: „Either the toast
   outlives its cause with no timestamp shown, or the conviction is wrong; from
   the frame a student cannot tell which."

   BOTH READINGS ARE THE CRIME THIS PROJECT EXISTS TO STOP. If it is live, the
   engine has failed a student who is inside the limit — the founder's own
   roundabout complaint, a FALSE FAILURE. If it is a record, the card taught him
   that 33 under 40 is speeding. The card cannot choose between them, so it must
   stop being ambiguous.

     `sc-sp-curve/mobile-wrong/04-t030s.png` is the same shape with the gap
     opened wider: «Превишена скорост» beside a cluster reading 18 under a
     posted 90, the offence six seconds and a whole open field earlier.

   AND THE DEBRIEF ALREADY DOES IT. `FaultCard` — the same fault, the same
   wording, three minutes later — ends every row with «в 1:39» (`atBg`). So one
   surface of this product anchors the fault in time and the other did not: the
   glass said one thing and the debrief another about one event, which is this
   lane's whole subject.

   WHY RELATIVE AND NOT THE SESSION CLOCK. This column has no session clock and
   may not invent one — `HudEvent` (contracts.ts) carries no `t`, and a
   plausible-looking «в 1:39» composed here would be a fabricated figure on a
   verdict. What the column DOES own is the moment it raised the card, and that
   moment is measured on exactly the clock that will remove it again: the TTL
   above is a `window.setTimeout`, i.e. wall time, and it keeps running while a
   teach moment freezes the drive. So the age and the card's own lifetime are
   read off one clock and cannot disagree — a card that says «преди 8 с» is a
   card about to expire, and that is true by construction rather than by tuning.

   THE SLOT IS ALWAYS PAINTED, «сега» first. An age that appears a second or two
   in would move every card below it on a column the founder has already been
   moved by („elements moving when popups appear"), and a card whose anchor is
   sometimes missing teaches the student to stop looking for it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Below this the card is not a record of anything, it is the present, and
 * «преди 2 с» would be a worse answer than «сега». 2 000 and not 1 500 so that
 * the first figure ever printed is 2 — `Math.round` at a 1 500 boundary skips
 * «преди 1 с» entirely, and a scale whose first step is missing reads as a bug.
 */
export const TOAST_AGE_NOW_MAX_MS = 2000;

/** How often the printed age is refreshed while a teaching card is up, ms. */
export const TOAST_AGE_TICK_MS = 1000;

/**
 * „сега" / „преди 8 с" — the card's own moment, in the card's own words.
 *
 * A clock that has gone backwards (`nowMs < raisedAtMs` — a system-time change
 * mid-drive) yields «сега» rather than a negative or a future age: the anchor
 * may be uninformative, never wrong.
 */
export function toastAgeBg(raisedAtMs: number, nowMs: number): string {
  const ms = nowMs - raisedAtMs;
  if (!Number.isFinite(ms) || ms < TOAST_AGE_NOW_MAX_MS) return "сега";
  return `преди ${Math.round(ms / 1000)} с`;
}

/**
 * Which kinds carry an age. The two TEACHING kinds — a graded violation and a
 * «Научи» card — because those are the ones that state a verdict about a moment
 * that has passed. „Браво" is a 4 s pat on the back with no explanation and no
 * moment to be wrong about, and dating it would only spend a line.
 */
export function toastCarriesAge(kind: HudEvent["kind"]): boolean {
  return kind === "violation" || kind === "lesson";
}

/**
 * The ONE place a `HudToast` is built, so the stamp cannot be forgotten on some
 * future second path. Pure, and therefore assertable without a DOM —
 * `__tests__/hud-toast-moment.test.tsx` runs it rather than trusting `push`.
 */
export function stampToasts(
  events: ReadonlyArray<HudEvent>,
  firstId: number,
  raisedAtMs: number,
): HudToast[] {
  return events.map((event, i) => ({ id: firstId + i, event, raisedAtMs }));
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
    // The stamp is taken ONCE for the batch: a tick that raises two faults
    // raised them in the same frame, and two ages a millisecond apart on one
    // screen would be a distinction the engine cannot actually make.
    const added = stampToasts(events, nextId.current, Date.now());
    nextId.current += events.length;
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

/**
 * The card's last row: the law chip and the moment, on one line.
 *
 * HERE AND NOT IN THE HEADER, measured rather than preferred. The header row
 * already carries «ОПАСНА ГРЕШКА» (≈86 px at these classes), «−10 изпитни т.»
 * (≈92) and the ✕ inside a 224 px content box; «преди 8 с» is another ≈47 and
 * the row overflows by about 25 px, which on this card means the severity word
 * gets an ellipsis. Trading a legible class for a legible age is not a trade —
 * the class is also carried by the left rule's colour and by the mark's colour,
 * so it survives being small, while the moment exists nowhere else on the glass.
 *
 * `flex-wrap` and not `truncate`: a citation is THEO-4's evidence and may not be
 * shortened to make room for the thing standing next to it. A long ЗДвП ref
 * takes a second line, which costs 10 px on the card at the TOP of a column
 * whose newest card is the top one — so what moves is the older cards below it,
 * never the one being read.
 *
 * The age renders whether or not there is a `lawRef`: an anchor that only
 * appears on cited faults would be missing from exactly the rows that have the
 * least other evidence.
 */
function ToastFooter({ lawRef, ageBg }: { lawRef: string | undefined; ageBg: string | null }) {
  if (lawRef === undefined && ageBg === null) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {lawRef !== undefined ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
          {lawRef}
        </span>
      ) : null}
      {ageBg !== null ? (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted">{ageBg}</span>
      ) : null}
    </div>
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
  ageBg,
  onDismiss,
}: {
  event: HudEvent;
  /** „сега" / „преди 8 с", or null when this card carries no moment. */
  ageBg: string | null;
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
        <ToastFooter lawRef={event.lawRef} ageBg={ageBg} />
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
        {/* A «Научи» card is where the sweep found a live-tense sentence outliving
            its own truth: `sc-merge-from-property/mobile-right/05-stopped.png`
            reads «…а в момента караш 16 км/ч» with the cluster below it at 0.
            The sentence is composed in `lessons/engine.ts` and is that file's to
            fix; the moment is this card's, and with it on the glass the claim is
            at least dated instead of asserted about a present that has moved. */}
        <ToastFooter lawRef={event.lawRef} ageBg={ageBg} />
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

  // ── THE AGE HAS TO MOVE, OR IT IS NOT AN AGE ─────────────────────────────
  // Hooks before the early return below, which is why `shown` is computed
  // first and the `null` is returned after them.
  //
  // The interval exists only while a card that PRINTS an age is up: praise and
  // an empty column cost nothing, and the longest this can run is the 8 s
  // teaching TTL. `Date.now()` and not a counter, so a tab that was
  // backgrounded (WebKit throttles timers hard on a phone) comes back with the
  // true age rather than with the number of ticks it was awake for.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ticking = shown.some((t) => toastCarriesAge(t.event.kind) && t.raisedAtMs !== undefined);
  useEffect(() => {
    if (!ticking) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), TOAST_AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ticking]);

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
          ageBg={
            t.raisedAtMs !== undefined && toastCarriesAge(t.event.kind)
              ? toastAgeBg(t.raisedAtMs, nowMs)
              : null
          }
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
