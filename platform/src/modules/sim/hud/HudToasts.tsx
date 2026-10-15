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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { HudEvent } from "../contracts";
import { minusPointsBg } from "../rules";
import {
  TOAST_CARD_WIDTH_CLASS,
  TOAST_MAX_VISIBLE,
  hudToastCarriesWhy,
  visibleToasts,
  waitingToasts,
  type ToastReading,
} from "./hudPreferences";
// THE SHADE, TAKEN AND NOT RESTATED — same module, same lane. `SimOverlay`
// owns the derivation of α 0.80 and of the feather, and its own test derives
// its assertions from these exports; a second copy of either number here is
// how the roomy card and the phone's peek would drift apart again. See the
// block above `ToastGround`.
import {
  PEEK_SCRIM_FEATHER_PX,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "./SimOverlay";

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
   THE PRESS BOUGHT NO TIME — sc-roundabout-entry:fe081cf1, the clauses rig-w3d
   left open (2026-10-12), item 2.

   THE FRAME, and the sidecar beside it: `.audit-frames/rig-w3d/
   sc-roundabout-entry/fe081cf1/pc-L3-F-ON-WHY-30-why-card-gone.png`. A real
   pointer press on «ЗАЩО» at contact +2.233 s opened the 323-character
   paragraph of «Удар в неподвижно препятствие». The card left at +8.017 s —
   its eight seconds from the moment it was RAISED — i.e. 5.8 s after the
   student asked to read it. By the figure two constants up («~15 chars/s
   reading speed at driving load») 323 characters are 21.5 s of reading: the
   product handed over a text and took it back after a quarter of the time its
   own rule says the text needs.

   THE RULE IS THE ONE THIS FILE ALREADY SPENDS, NOT A NEW NUMBER.
   `TEACHING_TOAST_TTL_MS` is 8 000 ms for „1–3 sentences", which at 15
   characters a second is 120 characters. `toastReadMs` is that same division
   for a text of any length, and `toast-why-room.test.ts` holds
   `toastReadMs(120)` to the TTL literal so the two cannot drift.

   WHAT THE PRESS DOES: the card may not leave before `now + toastReadMs(the
   paragraph the press put on the glass)`. It never SHORTENS a life
   (`Math.max`), so a card opened in its first instant still has at least what
   it had. Closing the explanation gives nothing back and takes nothing away;
   opening it again re-reads from that moment.

   …AND THE AGE STAYS TRUE. The block below («THE CARD SAYS WHAT, AND FOR EIGHT
   SECONDS IT DID NOT SAY WHEN») prints «преди N с» off the wall clock that
   also removes the card, and `LessonPlayShell` (above `revealMoreToasts`)
   declined to extend the TTL on its fold row for that reason: «преди 25 с» on
   a card still up could be read as an accusation about now. On THIS path the
   card is up because the student opened it and its age says exactly how old
   the fault is — the sentence is true on every frame it shows on. What stops
   being true is only the inference „«преди 8 с» means about to expire", which
   no surface prints.

   …AND THE END OF THE DRIVE NO LONGER TAKES IT AWAY (round 2, integrator
   decision W3). A fault that pins the car ends the lesson ten seconds after
   the standstill (`lessons/finish.ts` `CRASH_PIN_STUCK_S`, on the graded clock
   — not this file's to hold, and not moved). In the rig cell that end came at
   contact +10.084 s and the full-frame debrief replaced the stage 7.85 s into
   the 21.5 s this rule gives the paragraph. The END is where it was; the
   OVERLAY now waits for this card (`hudPreferences.shouldShowDebrief`,
   `reading`) and opens the moment the card's life — the time derived here — is
   over, or the student closes it, or asks for the debrief himself.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The product's reading pace at driving load — the figure `TEACHING_TOAST_TTL_MS`
 *  was sized on (120 characters in its 8 000 ms). */
export const TOAST_READ_CHARS_PER_SEC = 15;

/** How long a text of `chars` characters takes to read at that pace, ms. An
 *  unreadable count (non-finite, zero, negative) asks for no time at all. */
export function toastReadMs(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil((chars / TOAST_READ_CHARS_PER_SEC) * 1000);
}

/**
 * When a card whose «Защо» was just opened may leave: not before the paragraph
 * can be read from this moment, and never earlier than it was already going to.
 */
export function toastExpiryAfterWhy(expiresAtMs: number, nowMs: number, paragraphChars: number): number {
  return Math.max(expiresAtMs, nowMs + toastReadMs(paragraphChars));
}

/**
 * The queue's cap, with the cards in `keep` exempt from it. `MAX_QUEUED` drops
 * the OLDEST cards, and the one the student has open is by then usually the
 * oldest — so the cap alone would delete the paragraph under its reader the
 * moment enough newer cards arrived. Round 3 (W5): the judged cards waiting
 * behind it are in `keep` as well (`createToastLives.capExempt`). Order is
 * kept; nothing newer is dropped to make their place.
 */
export function capToastQueue<T extends { id: number }>(
  toasts: readonly T[],
  max: number,
  keep: ReadonlySet<number>,
): T[] {
  return toasts.filter((t, i) => i < max || keep.has(t.id));
}

/** What a toast's own paragraph is, in characters — the text «Защо» opens. */
function toastParagraphChars(event: HudEvent): number {
  return event.kind === "violation" ? event.explanationBg.length : 0;
}

/** One card's life: the timer that will remove it, or — while it waits off the
 *  glass — how much of its life is left to run when the column paints it. */
interface ToastLife {
  timer: number | null;
  expiresAtMs: number;
  pausedLeftMs: number | null;
  paragraphChars: number;
  /** A card the student is judged or taught by — it carries a WHY
   *  (`hudToastCarriesWhy`): a graded fault or a «Научи» card. Only these wait
   *  behind an opened explanation (round 3, W5). */
  waits: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOTHING THE STUDENT IS JUDGED BY IS LOST — sc-roundabout-entry:fe081cf1,
   round 3 (2026-10-14), integrator decision W5.

   WHAT ROUND 2 DID, AND WHAT IT COST. While an explanation was open every other
   card's clock stopped (W1), praise included, and only the opened card was
   exempt from `MAX_QUEUED`. The round-2 verifier raised a graded fault F
   behind an opened card, then four more cards of any kind, one a second: the
   four «Браво» kept their slots (their 4 s no longer ran), the cap dropped the
   oldest waiting card — F — and F never reached the glass. The badge read «+4».
   And a second way to lose it, found building this: on release EVERY waiting
   card started its clock at once, so with more of them than the column paints
   (`TOAST_MAX_VISIBLE` = 2, quiet 1) the ones below its capacity ran their
   lives out where nobody could see them.

   THE RULE, the smallest change that makes the sentence true:
     · a card that carries a WHY (`hudToastCarriesWhy` — a graded fault or a
       «Научи» card) and is off the glass behind an opened explanation keeps
       its clock STOPPED and is EXEMPT from the cap (`capExempt`), like the
       opened card itself. Bounded: a session raises finitely many;
     · it stays stopped until the column PAINTS it again — `painted`, the
       column's own report of what it rendered — so the whole of what it had
       left is spent on the glass, never below the column's capacity. The
       column's order decides which comes first: newest on top, as every card
       has always been stacked, each one as the cards above it leave;
     · praise and info keep their OWN clocks: no WHY, nothing the student is
       judged by, and they may leave unread. They — and only they — are what
       the cap may still evict while judged cards wait;
     · with nothing open nothing here runs: no card is ever stopped, so the
       queue, the cap and the clocks are the ones the product always had.
   Nothing graded reads any of this; it decides only what is on the glass.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE QUEUE'S CLOCKS — one life per card, keyed by its id. A ledger and not the
 * bare list of timer handles this used to be, because two things now have to
 * find ONE card's timer: the «Защо» press that extends it and the hold that
 * stops it. Plain object, no React: `useHudToastQueue` keeps one for its whole
 * life and only ever calls it from handlers and effects.
 *
 * `onExpire` is called when a card's own clock runs out — after the ledger has
 * forgotten it, so a late reader never finds a life for a card that is gone.
 *
 * ROUND 2 (2026-10-13, integrator decision W1). The hold used to stop the
 * OLDER cards only, because a newer card was painted on top of the opened one.
 * It no longer is (`hudPreferences.visibleToasts`): while an explanation is
 * open every other card is off the glass. ROUND 3 (W5, above): of those, the
 * cards that carry a WHY stop their clocks — `holdAllBut` — including one
 * RAISED while the hold stands, which starts its life stopped; and each
 * restarts only when the column paints it (`painted`).
 */
function createToastLives(onExpire: (id: number) => void) {
  const lives = new Map<number, ToastLife>();
  /** Cards whose «Защо» is open — exempt from the queue's cap (`capToastQueue`). */
  const reading = new Set<number>();
  /** The card the column is held for — every other judged card waits. */
  let heldFor: number | null = null;

  const arm = (id: number, life: ToastLife, ms: number) => {
    if (life.timer !== null) window.clearTimeout(life.timer);
    life.pausedLeftMs = null;
    life.expiresAtMs = Date.now() + ms;
    life.timer = window.setTimeout(() => {
      lives.delete(id);
      reading.delete(id);
      onExpire(id);
    }, ms);
  };
  const forget = (id: number) => {
    const life = lives.get(id);
    if (life !== undefined && life.timer !== null) window.clearTimeout(life.timer);
    lives.delete(id);
    reading.delete(id);
  };

  return {
    reading: reading as ReadonlySet<number>,
    /** What the queue's cap may not drop: the card being read, and every
     *  judged card that waits with its clock stopped (W5). */
    capExempt(): ReadonlySet<number> {
      const keep = new Set<number>(reading);
      for (const [id, life] of lives) if (life.waits && life.pausedLeftMs !== null) keep.add(id);
      return keep;
    },
    /** A card was raised: start its clock — unless the column is held for
     *  another card's explanation and this one carries a WHY. Then it is not on
     *  the glass, so its life is kept whole (`pausedLeftMs`) and starts when the
     *  column paints it. Praise starts its clock regardless (W5). */
    add(id: number, event: HudEvent, ms: number) {
      const waits = hudToastCarriesWhy(event.kind);
      const life: ToastLife = { timer: null, expiresAtMs: 0, pausedLeftMs: null, paragraphChars: toastParagraphChars(event), waits };
      lives.set(id, life);
      if (waits && heldFor !== null && heldFor !== id) life.pausedLeftMs = ms;
      else arm(id, life, ms);
    },
    forget,
    forgetAll() {
      for (const id of [...lives.keys()]) forget(id);
    },
    whyChanged(id: number, open: boolean) {
      if (!open) {
        reading.delete(id);
        return;
      }
      const life = lives.get(id);
      if (life === undefined) return;
      reading.add(id);
      if (life.pausedLeftMs !== null) {
        // Opened while it waits: its clock is stopped, so the time is added to
        // what it will run when the column paints it. (The column cannot
        // deliver this press — a waiting card is not on the glass — but the
        // ledger answers it rather than dropping the time.)
        life.pausedLeftMs = Math.max(life.pausedLeftMs, toastReadMs(life.paragraphChars));
        return;
      }
      const now = Date.now();
      const expiresAtMs = toastExpiryAfterWhy(life.expiresAtMs, now, life.paragraphChars);
      if (expiresAtMs > life.expiresAtMs) arm(id, life, expiresAtMs - now);
    },
    holdAllBut(id: number | null) {
      if (heldFor === id) return;
      heldFor = id;
      // A card that is made to wait is no longer being read: it leaves the
      // glass, and its «Защо» is closed when it comes back. Without this the
      // cap exemption of a card opened earlier would outlive its reading.
      if (id !== null) for (const other of [...reading]) if (other !== id) reading.delete(other);
      const now = Date.now();
      for (const [toastId, life] of lives) {
        if (id !== null && toastId !== id && life.waits && life.timer !== null) {
          window.clearTimeout(life.timer);
          life.timer = null;
          life.pausedLeftMs = Math.max(0, life.expiresAtMs - now);
        }
      }
      // NOTHING restarts here — not on release, and not the card held for. A
      // stopped card restarts when the column paints it (`painted`): on this
      // commit for the cards the column now shows (the held card is the one
      // card it shows), later for the ones below its capacity.
    },
    /** The column painted exactly these cards (`HudToasts`' `onPainted`). A
     *  stopped card among them is on the glass, so it runs out what it had.
     *  While an explanation is open the column paints that card alone
     *  (`visibleToasts`), so no waiting card is reported before the reading
     *  ends — and the report and the reader's release may come in either order
     *  (React runs the column's effect, a child's, first). */
    painted(ids: readonly number[]) {
      for (const id of ids) {
        const life = lives.get(id);
        if (life !== undefined && life.pausedLeftMs !== null) arm(id, life, life.pausedLeftMs);
      }
    },
  };
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
  /**
   * The student opened (`true`) or closed (`false`) this card's «Защо». Opening
   * gives the card the time its paragraph takes to read and exempts it from the
   * queue's cap; see „THE PRESS BOUGHT NO TIME".
   */
  whyChanged: (id: number, open: boolean) => void;
  /**
   * The column is held for the card with this id: every other card that
   * carries a WHY — older, newer, and any raised while the hold stands — stops
   * its clock and is kept from the cap until the column paints it again, and
   * then runs out what it had left. A card made to wait is not on the glass
   * (`visibleToasts`), and a card that is not on the glass may not spend its
   * reading time there. Praise keeps its own clock (W5).
   */
  holdAllBut: (id: number | null) => void;
  /**
   * The column painted exactly these cards — `HudToasts`' `onPainted`. A card
   * that waited restarts its clock here and nowhere else (W5).
   */
  painted: (ids: readonly number[]) => void;
} {
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const nextId = useRef(1);
  // ONE ledger for this queue's whole life (`createToastLives`). Held in state
  // with a lazy initialiser — never set again — so it is made once and is not a
  // ref read during render.
  const [lives] = useState(() =>
    createToastLives((id) => setToasts((prev) => prev.filter((t) => t.id !== id))),
  );

  useEffect(() => () => lives.forgetAll(), [lives]);

  const push = useCallback(
    (events: ReadonlyArray<HudEvent>, ttlMs?: number) => {
      if (events.length === 0) return;
      // The stamp is taken ONCE for the batch: a tick that raises two faults
      // raised them in the same frame, and two ages a millisecond apart on one
      // screen would be a distinction the engine cannot actually make.
      const added = stampToasts(events, nextId.current, Date.now());
      nextId.current += events.length;
      // The lives first: a card raised behind an opened explanation is one the
      // cap may not drop (`capExempt`), and the updater may run at once.
      for (const toast of added) lives.add(toast.id, toast.event, ttlMs ?? ttlFor(toast.event));
      setToasts((prev) => capToastQueue([...added.reverse(), ...prev], MAX_QUEUED, lives.capExempt()));
    },
    [lives],
  );

  const dismiss = useCallback(
    (id: number) => {
      lives.forget(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [lives],
  );

  const clear = useCallback(() => {
    lives.forgetAll();
    setToasts([]);
  }, [lives]);

  const whyChanged = useCallback((id: number, open: boolean) => lives.whyChanged(id, open), [lives]);
  const holdAllBut = useCallback((id: number | null) => lives.holdAllBut(id), [lives]);
  const painted = useCallback((ids: readonly number[]) => lives.painted(ids), [lives]);

  return { toasts, push, dismiss, clear, whyChanged, holdAllBut, painted };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SEVERITY_META = {
  opasna: { label: "Опасна грешка", color: "var(--danger)" },
  osnovna: { label: "Основна грешка", color: "var(--warning)" },
  vtorostepenna: { label: "Второстепенна", color: "var(--accent-soft)" },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   THE ROOMY CARD NEVER GOT THE GROUND THE PHONE'S DID — 2026-08-27, wave 6.

   TWO DEFECTS, ONE SENTENCE OF ARITHMETIC, and they compound rather than sit
   side by side.

   1 · NO GROUND. `SimOverlay`'s 2026-08-19 block („THE CARD HAD NO GROUND, AND
       ON A BRIGHT WORLD THAT IS 1.3 : 1") measured the world this HUD's cards
       stand on across four filed frames and found the brightest pixel to be
       rgb(204, 205, 206) — render-white facade. It then gave the PHONE's peek a
       shade at α 0.80 and proved the number from both sides. THIS card is the
       same card on the roomy leg, it is on the same `GHOST_SURFACES` list (so
       `PlayAreaStyles`' UNPANEL sweep strips its fill to `transparent
       !important`), and it was left standing on bare world. Against that pixel:

                                    bare world   under the 0.80 ground
         --foreground  the title       1.47 : 1        11.87 : 1
         --muted       the WHY         1.01 : 1         8.18 : 1   ← THE ROW
         --danger      ОПАСНА ГРЕШКА   1.77 : 1         4.57 : 1     THAT IS
         --warning     Основна грешка  1.01 : 1         8.01 : 1     THE POINT
         --accent-2    📚 Научи         1.05 : 1         7.73 : 1

       1.01 : 1 is not „low contrast". The authored explanation — the half of
       this card THEO-4 requirement zero exists for, the reason the toast is not
       a bare verdict — and the facade behind it are the same colour to a
       hundredth. `sc-roundabout-entry/pc-right/04-t090s.png` and
       `sc-ov-solid-return/mobile-right/04-t041s.png` are the same reading with
       and without the shade, twelve hours apart on the same build.

   2 · AND THE CARD DIMMED ITSELF ON TOP OF IT. `opacity-90` rode on the
       INTERACTIVE arm of the class list — i.e. on every card in production,
       because the shell passes `onDismiss={dismiss}` (`LessonPlayShell.tsx`,
       the `<HudToasts …>` mount). It is a tenth off the whole subtree: the
       class word, the «−10 изпитни т.», the fault name, the explanation, the
       law chip and the two-stop black text-shadow the UNPANEL register uses to
       buy contrast without a box — so the thing that restores legibility is
       dimmed in lockstep with the ink it is restoring. `hover:opacity-100` was
       the remedy, on a card the student reads with both hands on the wheel.

       `SimOverlay` has already ruled on this exact class, on this exact token:
       „AND IT IS AT FULL OPACITY, 2026-08-19. It carried `opacity-90` … on a
       ГРУБА violation that is `--danger`, so 0.9 of it over the shade below
       reads 3.97 : 1 — under AA". `sim-overlay-scrim.test.ts` wrote that up as
       a rule with a name — „no element on this card knocks its own ink back
       under the floor" — and this card was knocking ALL of its ink back, over
       no shade at all.

   THE TWO ARE ONE REPAIR AND NOT TWO, which is why they land together: with
   the ground added and `opacity-90` left in place, `--danger` reads 3.95 : 1 —
   still under AA. The dimming has to go for the ground to deliver anything.

   THE SHADE IS THE PEEK'S, IMPORTED RATHER THAN RESTATED. `PEEK_SCRIM_*` and
   its two CSS builders are exported from `SimOverlay.tsx` — the same lane, the
   same module — and they carry the whole derivation with them: α 0.80 is the
   alpha at which the quietest ink clears AA against the brightest world the
   sweep photographed, capped by the founder's other rule that the world under
   it must stay „dimmed, and still plainly two different things" (1.37 : 1), so
   a hazard is never hidden. A second copy of 0.80 here is how the two would
   drift, and `sim-overlay-scrim.test.ts` derives its assertions from those
   exports, so this card inherits that guard instead of needing its own.

   AND IT IS STILL NOT A PANEL — the 2026-08-03 ruling that took the box off
   this column („a full-width rounded strip ending in a SOLID BRAND-BLUE
   «Разбрах» button. THAT IS A COOKIE BANNER") is about a SHAPE: a border, a
   radius, an edge. The shade has none of the three, every side ramps to alpha
   0 outside the card's own box, and it claims not one pixel the card was not
   already standing on. The left rule in the fault's colour still paints ABOVE
   it, so the severity glance is unchanged.

   WHAT REPLACES THE DIMMING AS THE „THIS IS CLICKABLE" CUE: the ✕ that is
   already in the header row brightens on hover (`group` here,
   `group-hover:text-foreground` on `DismissGlyph`). The affordance moves onto
   the one glyph whose whole job is to say „press me" and off the verdict.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The column's own gap, as a number — `gap-2` on the `<div>` at the bottom of
 * this file, restated here because the shade has to know it and Tailwind class
 * strings are not readable at runtime. `hud-toast-ground.test.ts` asserts the
 * class is still what this says it is, so the two cannot drift silently.
 */
const TOAST_COLUMN_GAP_PX = 8;

/**
 * The shade's bleed, and the ONE number that is not the peek's.
 *
 * THE PEEK IS A COLUMN OF ONE; THIS IS A COLUMN OF TWO. `TOAST_MAX_VISIBLE`
 * stacks cards 8 px apart, and the peek's 16 px bottom feather would put the
 * older card's ramp 8 px INSIDE the newer one's flat 0.80 core — two shades on
 * one pixel, i.e. 1 − (1 − 0.8)(1 − 0.4) ≈ 0.88 in an 8 px band across the top
 * of every card below the first. That is past the 0.80 the block above spends
 * two paragraphs deriving, and past it in the one direction the founder's
 * „still plainly two different things" rule bounds. So the bottom bleed is
 * clamped to the gap: the ramp still lives entirely OUTSIDE the card's own box
 * (feather === bleed, which is what keeps the flat core coincident with the box
 * — see `peekScrimMaskCss`), and it now stops before it reaches anything else's.
 *
 * `Math.min` and not a literal 8: if a later wave narrows the peek's feather
 * below the gap, this follows it down rather than quietly becoming the larger
 * of the two. The other three sides are the peek's, untouched — left faces the
 * road and is the long ramp, right and top face the stage's own edge.
 */
const TOAST_SCRIM_FEATHER_PX = {
  ...PEEK_SCRIM_FEATHER_PX,
  bottom: Math.min(PEEK_SCRIM_FEATHER_PX.bottom, TOAST_COLUMN_GAP_PX),
} as const;

/**
 * The card's ground: the peek's shade, on the card that never got one.
 *
 * `aria-hidden` + `pointer-events: none` — it is a shade. It must not be
 * announced and it must not eat the click that dismisses the card, which on
 * this surface IS the whole `<button>`.
 *
 * `data-hud-ink` IS WHAT LETS IT PAINT AT ALL, and is not tidiness: the UNPANEL
 * sweep is `[data-sim-stage] .hud-ghost :is(div, …):not([data-hud-ink])` with
 * `background-image: none !important`, and this element is a `<div>` inside a
 * `.hud-ghost`. Without the attribute this whole component would be a diff that
 * changes no pixel — the way the tier picker's filled segment survived a whole
 * unpanel pass. `unpanelInkExemption.test.ts` holds the stylesheet end of the
 * same contract for the peek's shade and the touch hint's.
 */
function ToastGround() {
  return (
    <div
      data-hud="toast-scrim"
      data-hud-ink=""
      aria-hidden
      style={{
        position: "absolute",
        top: `${-TOAST_SCRIM_FEATHER_PX.top}px`,
        right: `${-TOAST_SCRIM_FEATHER_PX.right}px`,
        // NO overhang term, unlike the peek's. That card is `max-height`-capped
        // by its column and paints rows past its own border box, so its shade
        // has to be measured. This column caps nothing — `LessonPlayShell`
        // scrolls it instead — so the card's box IS what the card paints, and a
        // measured inset here would be arithmetic with no question behind it.
        bottom: `${-TOAST_SCRIM_FEATHER_PX.bottom}px`,
        left: `${-TOAST_SCRIM_FEATHER_PX.left}px`,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: peekScrimBackgroundCss(TOAST_SCRIM_FEATHER_PX),
        // Both spellings: `mask-image` is unprefixed in current WebKit and
        // prefixed in the versions still on phones in this market.
        WebkitMaskImage: peekScrimMaskCss(TOAST_SCRIM_FEATHER_PX),
        maskImage: peekScrimMaskCss(TOAST_SCRIM_FEATHER_PX),
      }}
    />
  );
}

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
  onWhy,
  cardRef,
  read = false,
  children,
}: {
  color: string;
  onDismiss: (() => void) | null;
  /** This card's «Защо» is open and the column is reading it: the card is a
   *  flex column that may shrink to the window, and its body box is the one
   *  child that gives (W2 — see „THE EXPLANATION HE ASKED FOR WAS CUT"). */
  read?: boolean;
  /** Present only on a card that prints a «Защо» chip — a press that lands on
   *  the chip runs this instead of the card's own activation. See „…AND ON PC
   *  THE SUMMARY BECAME THE LAST WORD" for why it is a region and not a
   *  nested `<button>`. */
  onWhy?: () => void;
  /** The card's root element, for the fit measurement `ViolationToast` makes —
   *  see „THE CARD PRINTED A PARAGRAPH IT HAD NO ROOM AND NO TIME FOR". */
  cardRef?: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const interactive = onDismiss !== null;
  const hasWhy = onWhy !== undefined;
  // ONE composition, exported and asserted (`toastCardPressAction`), so the
  // gate runs the branch the card runs instead of a transcription of it —
  // `SimOverlay`'s ✕ shipped green twice on exactly that difference.
  const press = (e: MouseEvent<HTMLElement>) => {
    const action = toastCardPressAction(e.target, { interactive, hasWhy });
    if (action === "why") onWhy?.();
    else if (action === "dismiss") onDismiss?.();
  };
  // THE KEYBOARD DRIVES THE CAR, so a press of «Защо» may not leave focus on a
  // card whose own activation is DISMISS: Chromium focuses a `<button>` on
  // mousedown, and the next Enter would then delete the paragraph the student
  // just asked for. Cancelling the mousedown keeps focus where it was; the
  // `click` that toggles still fires. Presses anywhere else are untouched.
  const holdFocus = (e: MouseEvent<HTMLElement>) => {
    if (hasWhy && pressLandedOnToastWhy(e.target)) e.preventDefault();
  };
  // `hud-ghost` — the founder's words about this exact column were „those pop
  // ups … are much much annoying, important but annoying". The information is
  // not the annoyance; the opaque blurred card that parks itself on his road is.
  // In the reference the equivalent lane — sector times, position deltas — is a
  // stack of coloured numbers straight on the image. So the card goes and the
  // authored explanation and its law chip stay exactly as they are (THEO-4):
  // the toast still says WHY, it just no longer paints a box to say it in.
  // A left rule in the fault's own colour replaces the border-on-a-fill so the
  // severity is still readable at a glance.
  //
  // ── `relative isolate`, AND NEITHER IS A BOX. 2026-08-27, wave 6. They are
  //    what the shade below needs and nothing else: `relative` makes this card
  //    the containing block for it, `isolate` makes it the shade's STACKING
  //    CONTEXT so a `z-index: -1` child cannot climb past this card and sink
  //    behind the WebGL backdrop. `SimOverlay`'s own block on the peek's shade
  //    has the WebKit screenshot where that exact escape produced a fix which
  //    changed no pixel while every unit assertion stayed green. Still no
  //    border, no radius, no blur, no `backdrop-filter` on this element.
  //
  // ── AND `opacity-90` IS GONE FROM THE INTERACTIVE ARM. See the block above
  //    `ToastGround` for the arithmetic; the short version is that it was a
  //    tenth off the WHOLE card — the class word, the points, the fault name
  //    and the authored explanation — applied for no reason except that the
  //    card happens to be clickable, with `hover:opacity-100` as the remedy on
  //    a surface the student reads while driving and never hovers.
  const className =
    `hud-ghost hud-toast-in ${TOAST_CARD_WIDTH_CLASS} relative isolate border-l-2 py-1 pl-2.5 pr-1 text-left ` +
    (interactive ? "group pointer-events-auto cursor-pointer" : "pointer-events-none") +
    // W2: only the card being read. `min-h-0` lets it shrink to the window the
    // column has; as a flex column its fixed rows keep their height and the
    // body box takes the whole of the squeeze.
    (read ? " flex min-h-0 flex-col" : "");
  const style = { borderColor: color };

  if (!interactive) {
    // The inert column (no `onDismiss`) still owes a «Защо» chip its press:
    // the chip is `pointer-events-auto`, and its click bubbles to here.
    return (
      <div
        ref={cardRef}
        onClick={hasWhy ? press : undefined}
        onMouseDown={hasWhy ? holdFocus : undefined}
        className={className}
        style={style}
      >
        <ToastGround />
        {children}
      </div>
    );
  }
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={press}
      onMouseDown={hasWhy ? holdFocus : undefined}
      aria-label="Скрий известието"
      title="Щракни, за да го скриеш"
      className={className}
      style={style}
    >
      <ToastGround />
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
function ToastFooter({
  lawRef,
  ageBg,
  waiting = 0,
}: {
  lawRef: string | undefined;
  ageBg: string | null;
  /** Cards waiting behind this one while its explanation is open — «+N». */
  waiting?: number;
}) {
  // The «Защо» chip used to ride this row as a third item and is now beside the
  // sentence it opens — see „…AND THE CHIP MOVED UP BESIDE THE SENTENCE".
  if (lawRef === undefined && ageBg === null && waiting <= 0) return null;
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
      {/* THE CARDS WAITING BEHIND AN OPENED EXPLANATION, COUNTED (W1). The
          phone card's own badge — `SimOverlay`'s «+N», class for class — so
          one product has one mark for „more is queued behind this". HERE and
          not in the header row, measured: «ОПАСНА ГРЕШКА» (88.7 px) and
          «−10 изпитни т. ✕» (111.3) leave 24 px of the 224 px row, 8 of them
          the row's own gap, and the badge is 26. On this row it stands beside
          the law chip and the age at the row's own height (20 px against the
          chip's 21 — the card does not grow when a fault starts to wait);
          a citation long enough to fill the row puts it on a line of its own.
          `ml-auto` sets it apart from the two things it is not: it is neither
          part of the citation nor of the moment. */}
      {waiting > 0 ? (
        <span
          data-hud-toast-waiting=""
          aria-label={toastWaitingLabelBg(waiting)}
          className="ml-auto shrink-0 rounded-full border border-border px-1.5 text-[10px] font-bold leading-[18px] text-muted"
        >
          +{waiting}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The ✕ hint in the card's header row — it must LOOK dismissible.
 *
 * AND IT IS NOW WHERE THE HOVER FEEDBACK LIVES. 2026-08-27: the card used to
 * say „clickable" by sitting at `opacity-90` and going to 100 on hover, i.e. by
 * dimming the verdict, the points and the authored explanation by a tenth for
 * the whole of every drive to buy a mouse-over cue nobody driving ever
 * collects. The cue moves onto this glyph, whose only job is to say „press me":
 * `group` is on the card (`ToastShell`), so the ink change is the same
 * interaction with none of the cost. `text-muted → text-foreground` is a
 * brighten, so the glyph never gets quieter than it is now, and `motion-reduce`
 * drops the transition rather than the change.
 */
function DismissGlyph({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="ml-1 shrink-0 text-[11px] font-black leading-none text-muted transition group-hover:text-foreground motion-reduce:transition-none"
    >
      ✕
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CARD PRINTED A PARAGRAPH IT HAD NO ROOM AND NO TIME FOR —
   sc-roundabout-entry:fe081cf1, re-judged STILL on w47.

   THE FRAME, opened before anything here was written:
   `.audit-frames/w47/frames/sc-roundabout-entry__pc-right/04-t058s.png`
   (1440 × 900, swept on 7648edf; this file, the shell's column and the
   catalogue row are byte-identical from there to 4209dad). −10 ОПАСНА ГРЕШКА
   «Влизане без пропускане», and the body is `FAILED_TO_YIELD_SITUATION_COPY`'s
   ring paragraph: 674 characters. The column's reading window holds about ten
   body lines of it, and the glass ends at «…или Б2» — character 322 — faded
   under «↓ обяснението продължава — покажи». The same leg at `04-t107s` cuts
   the 305-character «Удар в пешеходец» paragraph at «…а не след това». The
   judge's ruling on the control is the one this block accepts: a renamed
   teaser over a severed explanation is chrome, not a repair.

   TWO BUDGETS, AND THE PARAGRAPH BROKE BOTH.
     · SPACE. The window is the shell's (`notifyColumnCapPx`, less the banner,
       the recall pill and whatever the briefing still holds), and nothing in
       this file can make it taller.
     · TIME. `TEACHING_TOAST_TTL_MS` at the top of this file is 8 000 ms, sized
       for „1–3 sentences … ~15 chars/s at driving load" — 120 characters. The
       card removes itself after about a sixth of the ring paragraph however it
       is laid out, so paging the column with «покажи» was never a route to its
       end.

   THE CATALOGUE HAS ALREADY AUTHORED WHAT FITS BOTH, AND THE JUDGE CREDITED IT.
   `peekBg` is REQUIRED on every row (`rules/catalog.ts`, since 2026-09-11) and
   rides this very event (`lessons/engine.ts` → `HudEvent.peekBg`). The phone
   card prints it in preference to the paragraph
   (`overlayQueue.overlayPeekBodyBg`), and the w47 judge read that card whole
   and ruled the structure „not to be undone". For the ring act it is «Колата в
   кръга има предимство и идва отляво.» — WHO has the right and WHERE to look,
   44 characters. ADR-002: retrieved from the catalogue, not written here.
   THEO-4: it is a reason, not a verdict, and the law chip stays beside it.

   BUT ONLY WHERE THE PARAGRAPH IS ACTUALLY CUT — which is why this is a
   measurement and not `overlayPeekBodyBg` copied across. Measured against the
   catalogue, the median pooled paragraph is 206 characters and fits this
   window whole, and `lessons/engine.ts` writes figures into some of them that
   the summary does not carry («Отчетена скорост 58 км/ч при разрешени 50
   км/ч», «Дистанция в момента: 0,8 с»). Swapping every card would spend that
   evidence on ~50 codes to repair the ten or so pooled rows (plus the per-act
   copies) whose paragraphs overflow a window this size. So the card keeps the
   paragraph whenever it can be seen whole, and prints the summary only when it
   cannot. The gap readout is a SUFFIX, i.e. the part the column already cut
   first on any card long enough to fall back, so nothing legible is lost
   there; SPEEDING_OVER_LIMIT/_DANGEROUS carry their readout as a PREFIX on a
   paragraph under 130 characters that fits. SPEED_TOO_FAST_FOR_CURVE is the
   exception and is named rather than hidden: 266 characters plus its ~65
   character prefix can fall back in a window this tight and take a readout
   that WAS on its first line with it.

   HOW IT IS MEASURED, and the four choices that are not arbitrary:
     · AT ARRIVAL, BEFORE PAINT (`useLayoutEffect`), THEN LATCHED AGAINST
       GROWTH. A body that changes while it is being read is the founder's
       „elements moving" complaint; the age tick re-rendering the card every
       second cannot re-open the question, and nothing but the student's own
       «Защо» press ever puts a paragraph back. The ONE later move is the
       shrinking one — paragraph → summary when the window closes in on a
       card that fitted — and „THE WINDOW SHRANK UNDER A CARD THAT FITTED"
       below has why that move, and only that one, is allowed.
     · `offsetHeight`, NOT `getBoundingClientRect`. `hud-toast-in`
       (`HudStyles.tsx`) enters from `scale(0.96)` and this effect runs on the
       animation's first frame, so a transformed rect under-reads a tall card by
       4 % — a cut card measured as one that fits.
     · AGAINST `[data-hud-toast-scroller]`'s `clientHeight` — the shell's box,
       named by its attribute exactly as the shell names `[data-hud="toasts"]`
       in this file. No such ancestor (`app/dev/popup-rig`, a server render, a
       test) or an unlaid box (0 px) is NO CLAIM, and no claim keeps the
       paragraph: the one direction that is exactly the card as it shipped.
     · …AND THE PARAGRAPH TAKES NO HEIGHT UNTIL THE CHOICE IS MADE — see
       „THE SHELL SAW THE PARAGRAPH FOR ONE FRAME" below for the frame that
       made this necessary and the arithmetic that makes it exact.

   WHAT IT COSTS, stated rather than found later:
     · On a card that falls back, the paragraph is one press away rather than
       on the glass — the «Защо» chip, see „…AND ON PC THE SUMMARY BECAME THE
       LAST WORD". It is also whole in the debrief (`FaultCard` prints
       `event.explanationBg`). A measured readout riding that paragraph (the
       curve case above) goes behind the chip with it; carrying a readout as
       its own field is a `contracts.ts` + `lessons/engine.ts` change, not this
       file's.
     · (Retired 2026-09-17.) This line used to accept that a window which
       SHRINKS after arrival „can still cut a card that fitted", as „a line or
       two". Measured, it is not a line or two: a fault that pins the car grows
       the banner to three lines and posts a recovery card in the same second,
       and the room under them drops from 242 px to 110 (81 with the fold row).
       The card now follows the window down — see „THE WINDOW SHRANK UNDER A
       CARD THAT FITTED".
     · The roomy leg still has no car-stopping route to the whole text, and the
       chip does not add one: it expands the card inside the same eight-second
       TTL. The shell records that as an open decision about what this column
       IS (`LessonPlayShell.tsx`, the block above `revealMoreToasts`); this
       does not make it.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   THE SHELL SAW THE PARAGRAPH FOR ONE FRAME — the verifier's third item on the
   repair above, 5 of 5 trials.

   WHAT HAPPENED, in React's own order. The arrival commit painted nothing
   wrong: the layout effect chose the summary and its state update is
   processed before the browser paints. But React flushes the PREVIOUS
   commit's passive effects before it starts that synchronous re-render, and
   the shell's arrival effect (`LessonPlayShell.tsx`, the `newestToastId`
   effect → `measureToastFold`) is one of them. So the shell measured the card
   while it still held the 674-character paragraph, counted it cut, and
   scheduled «↓ обяснението продължава — покажи». Its `ResizeObserver` then
   read the summary card and took the row away again — one painted frame
   later. Recorded per animation frame in the verifier's rig:
   `summary|fold summary|- summary|- …`, on every trial of both long rows.

   A LAYOUT EFFECT CANNOT WIN THAT RACE, and a lasting DOM write behind
   React's back (swapping the text in the effect) would, at the cost of a node
   React believes it owns. So the card does the declarative thing instead:
   until the choice is made it renders nothing the shell can measure. The body
   `<p>` is in the tree at its true width — but at `height: 0; overflow:
   hidden`, so the card the shell's passive effect reads is the card WITHOUT
   its body. That undercounts, and undercounting is the safe direction for a
   fold row: the worst it can do is appear one frame late when a real fold
   exists, never announce a cut that does not.

   THE FIT TEST IS THE SAME TWO READS IT WAS VERIFIED ON — card `offsetHeight`
   against scroller `clientHeight`, with the paragraph in flow. The effect lets
   the body back into flow for exactly those two reads and collapses it again
   before it returns (`measureToastBodyChoice` has why that is not optional:
   the scroller's height FOLLOWS its content, so a collapsed card cannot be
   measured against it).

   `"pending"` IS NEVER PAINTED — it is resolved inside the same layout effect
   the choice always lived in. It is printed on `data-hud-toast-body` anyway,
   so a frame-by-frame probe can prove that rather than assume it. A server
   render (no `document`) starts at `"paragraph"`, because there is nothing to
   measure there and no claim keeps the paragraph whole; no toast is ever
   server-rendered in the product (`useHudToastQueue` starts empty, and the
   popup rig's literal cards carry no `peekBg`), so the two starting states
   cannot meet in a hydration.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The shell's toast scroller — the box whose height is this card's window. */
export const TOAST_SCROLLER_SELECTOR = "[data-hud-toast-scroller]";

/** The attribute on the body `<p>` — the one element whose text the choice swaps. */
const TOAST_BODY_ATTR = "data-hud-toast-body";

/**
 * Rounding slack for the fit test, px. `offsetHeight` and `clientHeight` are
 * both integer-rounded layout reads, so a card that exactly fills its window
 * can read one pixel over. Anything past that is a cut, and is called one.
 */
export const TOAST_FIT_SLACK_PX = 1;

/**
 * Can a card of this height be seen whole in a window of this height?
 *
 * Unmeasurable input — a non-finite read, or a zero from a box that has not
 * been laid out (a server render, a test DOM) — answers TRUE. That is not
 * optimism: `true` keeps the paragraph, i.e. the card exactly as it shipped,
 * so an instrument that cannot read never changes what the student is shown.
 */
export function toastCardFitsWindow(cardHeightPx: number, windowHeightPx: number): boolean {
  if (!Number.isFinite(cardHeightPx) || !Number.isFinite(windowHeightPx)) return true;
  if (cardHeightPx <= 0 || windowHeightPx <= 0) return true;
  return cardHeightPx <= windowHeightPx + TOAST_FIT_SLACK_PX;
}

/**
 * The violation card's body: the authored paragraph while it fits (or once the
 * student has opened it with «Защо»), the catalogue's summary otherwise. A
 * missing or blank summary keeps the paragraph — a cut sentence is a defect, a
 * blank body is a bare verdict, and only the first is allowed to survive this
 * function.
 */
export function violationToastBodyBg(
  event: { explanationBg: string; peekBg?: string },
  showParagraph: boolean,
): string {
  if (showParagraph) return event.explanationBg;
  const peek = event.peekBg;
  return typeof peek === "string" && peek.trim().length > 0 ? peek : event.explanationBg;
}

/**
 * Where the card's body stands. `"pending"` exists for exactly one commit and
 * is never painted — see „THE SHELL SAW THE PARAGRAPH FOR ONE FRAME".
 */
export type ToastBodyChoice = "pending" | "paragraph" | "summary";

/**
 * The body a card starts from. Only a card that HAS a summary to fall back to
 * and a DOM to measure in waits for the measurement; every other card is the
 * paragraph from its first render, exactly as it shipped.
 */
export function initialToastBodyChoice(
  canSummarise: boolean,
  canMeasure: boolean,
): ToastBodyChoice {
  return canSummarise && canMeasure ? "pending" : "paragraph";
}

/**
 * The pending body: in the tree at its true width, contributing no height and
 * painting no line. `overflow: hidden` is what keeps a zero-height paragraph
 * from spilling its lines over the footer — and whatever the pending card's
 * margins then do, it can only be SHORTER than the card that follows it, which
 * is the direction the shell's fold count may safely be wrong in.
 */
const TOAST_BODY_PENDING_STYLE = { height: 0, overflow: "hidden" } as const;

/**
 * The measurement itself, on a card whose body is still pending. No card, no
 * body or no scroller is no claim: paragraph.
 *
 * THE BODY IS LET BACK INTO FLOW FOR THE TWO READS AND COLLAPSED AGAIN BEFORE
 * THIS RETURNS — and that is the only way to ask the question at all, found by
 * getting it wrong first. The scroller is not a fixed box: it is a flex item
 * that grows with its content up to the column's cap, so its `clientHeight`
 * against a COLLAPSED card is the collapsed card's height, and the first draft
 * of this function (body-less card + `body.scrollHeight` against that) called
 * the 127-character SPEEDING_OVER_LIMIT paragraph „cut" in the verifier's
 * Chromium rig, 5 of 5, on a card that fits with room to spare. With the body
 * in flow the two reads are the same two reads the repair was verified on:
 * the card's `offsetHeight` against the window the column actually gives it.
 *
 * The writes are to the inline style React set for `"pending"` and are put
 * back to the exact strings read, synchronously, with no paint and no
 * `ResizeObserver` delivery in between — so the DOM React committed is the DOM
 * the shell's passive effect then reads. `offsetHeight`/`clientHeight` here
 * force the layout; nothing is left changed by it.
 */
function measureToastBodyChoice(
  card: HTMLElement | null,
  body: HTMLElement | null,
): "paragraph" | "summary" {
  if (card === null || body === null) return "paragraph";
  const scroller = card.closest(TOAST_SCROLLER_SELECTOR);
  if (!(scroller instanceof HTMLElement)) return "paragraph";
  const collapsed = { height: body.style.height, overflow: body.style.overflow };
  body.style.height = "";
  body.style.overflow = "";
  const fits = toastCardFitsWindow(card.offsetHeight, scroller.clientHeight);
  body.style.height = collapsed.height;
  body.style.overflow = collapsed.overflow;
  return fits ? "paragraph" : "summary";
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE WINDOW SHRANK UNDER A CARD THAT FITTED — sc-roundabout-entry:fe081cf1,
   the w49 verifier's overturn of the arrival-only repair above.

   THE MECHANISM, measured before a line here was written, in a copy of the
   verifier's rig (the real `HudToasts`, `ObjectiveBanner` and `AdvisorCard`
   in the shell's roomy column, copied class for class, at the w49 stage,
   1166 × 656, with the app's own faces and `lang="bg"` — without the last two
   the advisor sets three lines where the frame shows four). A −10 «Удар в
   неподвижно препятствие» arrives into a column holding a one-line task and
   the recall pill, with 242 px of room below them — `04-t011s.png` on the
   pc-wrong leg, card whole. The crash then pins the car. In the same second
   the banner grows to three lines («Колата е притисната след удара — …») and
   the advisor posts its recovery card, and the room below them is 110 px, 81
   once the shell's fold row takes its share. Nothing re-asked the question
   the arrival measurement had answered: measured on HEAD, a 144 px
   SPEEDING_OVER_LIMIT paragraph that arrived whole stayed a paragraph in a
   111 px window, cut, for as long as it lived.

   SO THE QUESTION IS RE-ASKED WHEN THE WINDOW MOVES — AND ONLY ONE ANSWER MAY
   CHANGE THE CARD. `toastBodyChoiceAfterResize` is the one-way half of the
   rule, `toastSummaryMendsCut` the geometric half (round 3 narrowed it — see
   „…BUT ONLY A CARD THE WINDOW ITSELF CUT, INTO A SUMMARY THAT IS WHOLE"):
     · paragraph → summary, only when the window has cut THIS card where it
       stands and the summary would be whole there. Any time in the card's
       life. The card gets SHORTER, which is the one direction a change under
       a reader cannot hide anything he has not been offered: the paragraph is
       one «Защо» press away, exactly as on a card that fell back at arrival.
     · summary → paragraph: NEVER here. Only the student's own «Защо» press
       brings the paragraph back (`whyOpen`, in `ViolationToast`). A window
       that grows again — the recovery card dismissed, the banner back to one
       line — leaves the summary where it is; a card that swells by itself is
       the founder's „elements moving" complaint in its purest form.
     · an OPEN chip stays open. It rides on a card whose choice is already
       `"summary"`, and the observer below exists only while the choice is
       `"paragraph"`, so no resize can reach it.
     · pending stays pending: that is the arrival effect's to resolve.

   WHAT IS OBSERVED, AND WHY NOT A TIMER. A `ResizeObserver` on the shell's
   scroller — the box whose height IS the window — and on the card itself,
   whose own height would move if a citation long enough to share its row
   with the ticking age wrapped (none in today's catalogue does, 0 of 73), and
   which the scroller cannot report once it is at its cap. Unmeasurable is
   still no claim: a window squeezed to 0 px keeps the paragraph, because a
   summary in a 0 px box is not a summary anyone can read, and the next resize
   that gives the box height asks again. (Round 2 wrote here that the callback
   „reads the same two layout values the arrival test reads". It no longer
   does, on purpose, and the section below has why: height against height was
   the regression.)

   WHAT IT DOES NOT DO, stated rather than found later — and it is most of
   what the w49 frames photographed:
     · IT DOES NOT MOVE THE SHELL'S FOLD ROW. The −3 «Излизане от платното за
       движение» at pc-right `04-t090s.png` and the −10 above both arrived as
       summaries, so this switch had nothing to switch on either leg. Below the
       recall pill that column has 119.7 px, and the summary card — 117 px now,
       see „…AND THE CHIP MOVED UP BESIDE THE SENTENCE" — fits it. But while
       `LessonPlayShell.tsx`'s fold row («↓ обяснението продължава — покажи»,
       23.5 px + the 6 px gap) is up the window is 90, whose last 28 px are the
       shell's fade: header and title legible, summary under the fade, which is
       the frame. That row was up for the PREVIOUS card («📚 Научи», cut), and
       it only leaves when nothing is cut — so a card between 90 and 119.7 px
       is kept cut by the row that announces the cut. Measured: the same card
       arriving with no row up is whole; arriving under the row, it stays cut
       after the older card expires, until it expires itself. The shell's, and
       no third, smaller card is invented here to hide it — a card without its
       citation row is a bare verdict (THEO-4), and one without its title is
       not a card.
     · IT CANNOT PREVENT ONE FALSE FRAME OF THAT ROW ON THE SWITCH ITSELF. The
       shell's observer and this one fire in the same delivery, before either
       update commits, so it counts the paragraph that is about to go: the row
       mounts with the summary and leaves on the next frame (rig, 10 of 10,
       both engines). Committing the switch synchronously inside the callback
       does remove it — and raised „ResizeObserver loop completed with
       undelivered notifications" on 10 of 10, an error event on every page
       that switches. One frame of a row that was true a frame earlier is the
       cheaper defect.
     · The pc-wrong `04-t016s.png` „zero-height column" is not a squeezed live
       card. The column there ends 90 px above its cap, which a live card
       would have filled (the same card and column measure 81 px of window,
       not 0): the card had EXPIRED — its eight seconds are wall time, and it
       read «сега» on `05-stopped.png` at the t = 9 s rest — and the fold row
       is the shell's state from the frame before — one animation frame in the
       rig, on 5 of 5 expiries. Also the shell's.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   …BUT ONLY A CARD THE WINDOW ITSELF CUT, INTO A SUMMARY THAT IS WHOLE —
   round 3 of sc-roundabout-entry:fe081cf1, the w49 verifier's regression
   finding on round 2's switch above.

   ROUND 2 ASKED THE WRONG QUESTION. It compared the card's HEIGHT to the
   window's height — `toastCardFitsWindow(card.offsetHeight,
   scroller.clientHeight)` — which is the arrival test's question, and at
   arrival it is the right one, because the newest card is always at the top
   of the stack. Later in a card's life it is not: HOW TALL the card is says
   nothing about WHERE it is, and a card can stop „fitting" by that test
   without the window having done anything to it. The verifier's case: a
   second fault arrives, the new card goes ON TOP (newest first), the paragraph
   that was whole on the glass is pushed down under it, the shell's fold row
   mounts for the push and takes the scroller from 243 px to 213 — and the
   height test, seeing a 243 px card in a 213 px window, collapsed the
   paragraph under its reader. COLLISION / pedestrian went 243 px → the 111 px
   «Човекът няма ламарина и колан.» with 88 px of it visible, still cut;
   FOLLOWING_TOO_CLOSE_FOR_RAIN 234 → 138, still cut. Nothing was gained on
   the glass, and the card he was reading changed under him — the founder's
   standing „elements moving" complaint, produced by the repair for it.

   SO THE SWITCH NOW NEEDS FOUR THINGS, and each one is a way round 2 was wrong
   (`toastSummaryMendsCut`, and section 6 of `hud-toast-fit.test.ts` turns red
   when any one of them is removed):
     1 · THE CARD IS CUT WHERE IT STANDS. Its top in the window (its place in
         the stack less `scrollTop`) plus its height, against the window — not
         its height against the window. A card fully on the glass is never
         touched, however the window moved.
     2 · THE WINDOW DID THE CUTTING, NOT A NEWER CARD. The card must be no
         lower in the stack than where it was last seen whole; the top of the
         stack, where every card arrives, is the baseline for one that has not
         been seen whole yet. A card pushed down by a newer one keeps its
         paragraph, and the shell's fold row — «↓ обяснението продължава» — is
         the honest answer there: it says the card continues, and the student
         can page to it. When the newer card leaves and this one rises back,
         the question is asked again from where it stands.
     3 · THE FOLD ROW IS NOT THE WINDOW. While `[data-hud-toast-more]` is up
         the window is read as it would be WITHOUT the row: the row is the
         shell's statement ABOUT the cards, and if its height counted as a
         shrink, the row raised for a push would collapse the card it was
         raised for — which is exactly the 243 → 213 above. Read, not added
         up: the row is taken out of flow for one `clientHeight` read and put
         back — see `readToastWindow` for why `clientHeight` plus the row plus
         the gap is the wrong number whenever the briefing is open.
     4 · THE SUMMARY WOULD BE WHOLE THERE — in the window IT would get.
         Measured, not inferred: a hidden, `aria-hidden` copy of the card, with
         the summary and its «Защо» chip in the body box exactly as
         `ViolationToast` would render them, is put into the column for one
         read of its `offsetHeight` and removed (`measureToastSummaryCardPx`).
         And the window is read again with the live card holding the summary's
         room, because the window depends on it: the scroller is a flex item
         whose base size is its content, and a shorter card hands part of the
         column back to the briefing. Measured with the briefing open, the
         no-row window was 110 px beside a 144 px paragraph and 106 px beside
         its 111 px summary — the first read called that summary whole, the
         shell's fold count then called it cut, and the row stayed over it
         (`readToastSummaryFit`). A summary that would still be cut is no gain,
         so the paragraph stays — the student's text does not change for a card
         that stays cut either way.

   AND ALL FOUR ARE ASKED IN THE SHELL'S OWN ARITHMETIC — the reason this is a
   rule and not a guess. „Whole" here decides whether the student gets a
   summary; the shell's fold count (`LessonPlayShell.tsx`,
   `measureToastColumnFold`, as the shell's lane rewrote it in this same round
   — at HEAD it counted off rects and kept its row up while it cut anything,
   which no rule in this file can change) then decides, from its own reads,
   whether the row goes. If the two disagree by a pixel, a summary this called
   whole is cut by the shell's count, the row stays up and takes ~30 px more of
   it, and the summary's last line goes under the edge: a collapse for no gain, the
   regression itself, at the margin. That is not hypothetical. Measured on all
   73 catalogue codes, each shrunk from a whole paragraph to six windows (its
   summary's height +1, 0, −1, −2, −3, −4 px): a draft of this rule that read
   the row back as `offsetTop + offsetHeight` spans, against the round-2
   arithmetic for the shell's row, switched 44 of the 438 in Chromium and 108
   in WebKit into a summary that then went under the edge (26.5 px, worst). So
   this reads what the shell's fold reads, the way it reads them: a card's
   place as an `offsetTop` difference and its height as `offsetHeight`
   (layout px, blind to the entry animation), the window as `clientHeight`
   with the row taken out of flow while it is up, and „cut" as more than
   `TOAST_FIT_SLACK_PX` past the foot — which is also `toastCardFitsWindow`'s
   rule at arrival. The copy's `offsetHeight` equals the rendered summary
   card's on all 73 codes, in Chromium and in WebKit.

   WHAT DID NOT CHANGE: one-way (only `"paragraph"` is ever moved, and nothing
   but «Защо» brings a paragraph back); the observer lives only while there is
   a paragraph to give up; an open chip is out of its reach; an unmeasurable
   read — a 0 px window, a card whose `offsetParent` is not the scroller's —
   is no claim and keeps the paragraph.

   WHAT IT STILL DOES NOT DO, stated: the NEWEST card, cut at its foot only by
   a fold row that was raised for an OLDER card below it, keeps its paragraph
   under the row's fade (rule 3 gives the row back, so to this rule it is
   whole). That is HEAD's behaviour for that card, not a new one, and the row
   over it is true — the older card really is cut.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The shell's fold row («↓ обяснението продължава — покажи» / «↓ още N
 * известия»), a sibling of the scroller in the notify column. Read only to give
 * its box back to the window — see rule 3 above.
 */
export const TOAST_MORE_SELECTOR = "[data-hud-toast-more]";

/** Where a card stands against its window. */
export type ToastWindowFit = "whole" | "cut" | "unmeasured";

/**
 * Is the card whole in the window where it stands? Its top below the window's
 * top and its foot above the window's foot, each with the rounding slack — the
 * same `TOAST_FIT_SLACK_PX` the arrival test and the shell's fold count allow.
 * A non-finite read, a card of no height or a window of no height is
 * `"unmeasured"` — no claim, which every caller treats as keeping the card as
 * it is.
 */
export function toastCardInWindow(topPx: number, cardPx: number, windowPx: number): ToastWindowFit {
  if (!Number.isFinite(topPx) || !Number.isFinite(cardPx) || !Number.isFinite(windowPx)) return "unmeasured";
  if (cardPx <= 0 || windowPx <= 0) return "unmeasured";
  return topPx >= -TOAST_FIT_SLACK_PX && topPx + cardPx <= windowPx + TOAST_FIT_SLACK_PX ? "whole" : "cut";
}

/** One read of a paragraph card against its window, in layout px. */
export interface ToastWindowRead {
  /** The card's top in the scroller's CONTENT — its place in the stack, whatever the scroll. */
  contentTopPx: number;
  /** The scroller's `scrollTop`: the student paging the stack. */
  scrollTopPx: number;
  /** The card as it stands, paragraph in flow. */
  cardPx: number;
  /** The scroller's `clientHeight` — as it would be without the fold row, while the row is up. */
  windowPx: number;
}

/** The summary as it would stand: its card's height, and the window the scroller would give that card. */
export interface ToastSummaryRead {
  cardPx: number;
  windowPx: number;
}

/**
 * THE GEOMETRIC HALF OF THE SWITCH — the four rules above, in order, cheapest
 * first; `readSummary` is only called (and the hidden copy only built) once
 * the first three have passed.
 *
 * `wholeContentTopPx` is where in the stack this card was last seen whole; 0,
 * the top of the stack, for a card not yet seen whole.
 */
export function toastSummaryMendsCut(
  read: ToastWindowRead,
  wholeContentTopPx: number,
  readSummary: () => ToastSummaryRead,
): boolean {
  const topPx = read.contentTopPx - read.scrollTopPx;
  // 1 · cut where it stands. A whole card, and an unmeasurable one, stay.
  if (toastCardInWindow(topPx, read.cardPx, read.windowPx) !== "cut") return false;
  // 2 · the window did it, not a newer card pushing this one down the stack.
  if (!(read.contentTopPx <= wholeContentTopPx + TOAST_FIT_SLACK_PX)) return false;
  // 4 · the summary, where the card stands, is whole in the window it would
  // get — rule 3 is in both windows. (A card whose top the student has scrolled
  // past cannot pass this: no card with its top above the window is whole in it.)
  const summary = readSummary();
  return toastCardInWindow(topPx, summary.cardPx, summary.windowPx) === "whole";
}

/**
 * The body after the window moved. One-way by construction: the only change
 * it can make is a paragraph becoming its summary, and only when
 * `toastSummaryMendsCut` said so. `"summary"` is returned as-is whatever the
 * window does — growing back is the student's «Защо» press and nothing else —
 * and `"pending"` is the arrival measurement's to resolve.
 */
export function toastBodyChoiceAfterResize(
  current: ToastBodyChoice,
  summaryMendsCut: boolean,
): ToastBodyChoice {
  return current === "paragraph" && summaryMendsCut ? "summary" : current;
}

/**
 * The read `toastSummaryMendsCut` judges — layout px throughout, and never a
 * rect: the card enters from `scale(0.96)`, and a rect read during that
 * animation puts its top 2–3 px low, which rule 2 would read as a push.
 *
 * THE WINDOW WITH THE ROW UP IS PROBED, NOT ADDED UP. The row is a `shrink-0`
 * sibling of the scroller in a flex column, and when it goes the freed pixels
 * are shared by every item that was shrunk — and the briefing card is
 * `[flex-shrink:20]` in the same column, so with the briefing open the
 * scroller gets back only a small part of the row and its gap. `clientHeight`
 * + the row + the gap promises the scroller the whole of it, calls a summary
 * whole that is not, and the row that stays then cuts it by its own 30 px.
 * (`LessonPlayShell.tsx` measured the same trap for its fold count and
 * replaced the same sum with the same read.) So the row is taken out of flow —
 * `position: absolute` removes a flex item and its gap exactly as unmounting
 * it would, and keeps it rendered, so a focused «покажи» keeps focus — the
 * scroller's `clientHeight` is read, and the row's inline style and the
 * scroller's `scrollTop` (which the grown box can clamp) are put back before
 * this returns. Every box ends the call at the size it started, so no
 * `ResizeObserver` gathers anything from it.
 *
 * `offsetTop` is measured from the nearest POSITIONED ancestor, and the
 * scroller is not one, so the card and the scroller share an `offsetParent`
 * (the notify column) and the difference is the card's place in the scroller's
 * content. Measured in Chromium and WebKit both: that `offsetTop` does NOT
 * move when the scroller scrolls, which is why `scrollTop` is subtracted here
 * and nowhere else. A card whose `offsetParent` is anything else — a
 * positioned box put between them by a later edit — is unmeasured, not
 * guessed at.
 */
function readToastWindow(card: HTMLElement, scroller: HTMLElement): ToastWindowRead {
  const sharedParent = card.offsetParent !== null && card.offsetParent === scroller.offsetParent;
  return {
    contentTopPx: sharedParent ? card.offsetTop - scroller.offsetTop - scroller.clientTop : Number.NaN,
    scrollTopPx: scroller.scrollTop,
    cardPx: card.offsetHeight,
    windowPx: readToastScrollerWindow(scroller),
  };
}

/** The scroller's `clientHeight`, with the fold row out of flow for the read while it is up — rule 3. */
function readToastScrollerWindow(scroller: HTMLElement): number {
  const clientPx = scroller.clientHeight;
  const more = scroller.parentElement?.querySelector(TOAST_MORE_SELECTOR) ?? null;
  if (!(more instanceof HTMLElement) || clientPx <= 0) return clientPx;
  const position = more.style.position;
  const scrollTop = scroller.scrollTop;
  more.style.position = "absolute";
  const windowPx = scroller.clientHeight;
  more.style.position = position;
  if (scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;
  return windowPx;
}

/**
 * Rule 4's read: the summary card's height (`measureToastSummaryCardPx`), and
 * the window the scroller would give the card AT that height.
 *
 * THE SECOND READ IS THE ARRIVAL TEST'S OWN TECHNIQUE (`measureToastBodyChoice`),
 * run the other way: the live body's inline `height` and `overflow` are set so
 * the live card takes exactly the summary card's room, the window is read, and
 * both are put back to the exact strings they held before this returns. No text
 * in the `aria-live` stack changes — only a height, for one read — and every
 * box ends the call at the size it started, so no observer gathers anything. If
 * the squeezed card does not come out at the summary's height (a layout this
 * does not understand), it is unmeasured and the paragraph stays.
 */
function readToastSummaryFit(
  card: HTMLElement,
  body: HTMLElement | null,
  scroller: HTMLElement,
  summaryBg: string,
): ToastSummaryRead {
  const unmeasured = { cardPx: Number.NaN, windowPx: Number.NaN };
  const cardPx = measureToastSummaryCardPx(card, scroller, summaryBg);
  if (body === null || !Number.isFinite(cardPx) || cardPx <= 0) return unmeasured;
  const shorterByPx = card.offsetHeight - cardPx;
  if (shorterByPx <= 0) return { cardPx, windowPx: readToastScrollerWindow(scroller) };
  // The squeeze shortens the scroller's CONTENT, and a scroller whose content
  // shrinks under a `scrollTop` clamps it — a clamp that putting the height
  // back does not undo. Measured: without this, Chromium raised
  // „ResizeObserver loop completed with undelivered notifications" on the
  // second-card case, because the clamp fires a `scroll` the shell answers
  // with a fold measurement inside the same delivery.
  const kept = { height: body.style.height, overflow: body.style.overflow, scrollTop: scroller.scrollTop };
  body.style.height = `${Math.max(0, body.offsetHeight - shorterByPx)}px`;
  body.style.overflow = "hidden";
  try {
    if (Math.abs(card.offsetHeight - cardPx) > TOAST_FIT_SLACK_PX) return unmeasured;
    return { cardPx, windowPx: readToastScrollerWindow(scroller) };
  } finally {
    body.style.height = kept.height;
    body.style.overflow = kept.overflow;
    if (scroller.scrollTop !== kept.scrollTop) scroller.scrollTop = kept.scrollTop;
  }
}

/**
 * How tall this card would be showing its summary — rule 4. A deep copy of the
 * card (so every class, the title and the footer are the card's own), its body
 * set to the summary and the «Защо» chip put at the head of the body box as
 * `ViolationToast` renders it, laid out once in the notify column and removed.
 *
 * THE COPY, AND NOT THE CARD ITSELF, because the card is inside
 * `[data-hud="toasts"]`, which is `aria-live`: swapping the text of the live
 * card for one read, even undone synchronously, re-inserts text into a live
 * region, and whether a screen reader announces that is not something a
 * headless rig can prove. The copy goes into the COLUMN — outside the live
 * region and outside the scroller, `position: absolute` so it takes no place in
 * the column's flow and adds nothing to the scroller's overflow —
 * `visibility: hidden` and `aria-hidden`, and it is gone before the callback
 * returns, so no paint, no observer and no query ever meets it. Its width is
 * the card's own: `TOAST_CARD_WIDTH_CLASS` is `w-60` capped by the viewport,
 * which does not depend on the parent it is laid out in.
 *
 * Anything missing — no column, no body in the copy — is `NaN`: unmeasured,
 * and the paragraph stays.
 */
function measureToastSummaryCardPx(card: HTMLElement, scroller: HTMLElement, summaryBg: string): number {
  const column = scroller.parentElement;
  if (column === null || typeof document === "undefined") return Number.NaN;
  const copy = card.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return Number.NaN;
  const body = copy.querySelector(`[${TOAST_BODY_ATTR}]`);
  const box = body instanceof HTMLElement ? body.parentElement : null;
  if (!(body instanceof HTMLElement) || box === null) return Number.NaN;
  const chip = document.createElement("span");
  chip.className = TOAST_WHY_CHIP_CLASS;
  chip.textContent = TOAST_WHY_LABEL_BG.closed;
  box.insertBefore(chip, body);
  body.textContent = summaryBg;
  copy.setAttribute("aria-hidden", "true");
  copy.style.position = "absolute";
  copy.style.top = "0";
  copy.style.left = "0";
  copy.style.visibility = "hidden";
  column.appendChild(copy);
  try {
    return copy.offsetHeight;
  } finally {
    column.removeChild(copy);
  }
}

/**
 * The measurement. A card with a summary starts `"pending"` and leaves it in
 * its arrival commit's layout effect, before paint. That effect keys on
 * `choice` alone, so neither the age tick's once-a-second re-render nor the
 * student opening «Защо» can re-run it. After that, only a window that closes
 * in on a paragraph moves it — see „THE WINDOW SHRANK UNDER A CARD THAT
 * FITTED".
 */
function useToastBodyChoice(
  canSummarise: boolean,
  summaryBg: string,
): {
  setCard: (el: HTMLElement | null) => void;
  bodyRef: { current: HTMLParagraphElement | null };
  choice: ToastBodyChoice;
} {
  const cardRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  // A stable callback ref: an inline one would be detached and re-attached on
  // every tick of the age clock.
  const setCard = useCallback((el: HTMLElement | null) => {
    cardRef.current = el;
  }, []);
  const [choice, setChoice] = useState<ToastBodyChoice>(() =>
    initialToastBodyChoice(canSummarise, typeof document !== "undefined"),
  );
  useLayoutEffect(() => {
    if (choice !== "pending") return;
    setChoice(measureToastBodyChoice(cardRef.current, bodyRef.current));
  }, [choice]);
  // THE WINDOW, WATCHED — only while there is a paragraph to give up and a
  // summary to give it up for. The moment the choice is `"summary"` this
  // disconnects, which is the second lock on the one-way rule: nothing is
  // listening that could put the paragraph back. No scroller (the popup rig)
  // or no `ResizeObserver` is no claim, i.e. the arrival choice as shipped.
  const watchesWindow = canSummarise && choice === "paragraph";
  useEffect(() => {
    if (!watchesWindow) return;
    const card = cardRef.current;
    if (card === null || typeof ResizeObserver === "undefined") return;
    const scroller = card.closest(TOAST_SCROLLER_SELECTOR);
    if (!(scroller instanceof HTMLElement)) return;
    // Where in the stack this card was last seen whole — rule 2 of „…BUT ONLY A
    // CARD THE WINDOW ITSELF CUT". It starts at the top of the stack, where
    // every card arrives, and follows the card only through reads that SAW it
    // whole, so neither a push nor an unmeasurable read can move the baseline.
    let wholeContentTopPx = 0;
    const observer = new ResizeObserver(() => {
      // Decided HERE, synchronously, against the layout this delivery is
      // about — never inside a state updater, which runs at render time
      // against whatever the DOM has become by then.
      const read = readToastWindow(card, scroller);
      if (toastCardInWindow(read.contentTopPx - read.scrollTopPx, read.cardPx, read.windowPx) === "whole") {
        wholeContentTopPx = read.contentTopPx;
      }
      const mends = toastSummaryMendsCut(read, wholeContentTopPx, () =>
        readToastSummaryFit(card, bodyRef.current, scroller, summaryBg),
      );
      setChoice((current) => toastBodyChoiceAfterResize(current, mends));
    });
    observer.observe(scroller);
    observer.observe(card);
    return () => observer.disconnect();
  }, [watchesWindow, summaryBg]);
  return { setCard, bodyRef, choice };
}

/* ═══════════════════════════════════════════════════════════════════════════
   …AND ON PC THE SUMMARY BECAME THE LAST WORD — the verifier's second item.

   The w48 re-route that sent this row here specified „render event.peekBg ??
   event.explanationBg with the paragraph behind an in-card toggle", and the
   repair above shipped the first half. The phone's card has carried that
   toggle all along: «ЗАЩО» (`SimOverlay`) opens the whole authored paragraph
   from the summary. On PC the summary was all there was until the debrief —
   a reason, but the SHORT reason, with the law and the explanation it
   compresses unreachable for the eight seconds the fault is live. THEO-4 does
   not accept „it is in the debrief" for the moment of the mistake; the chip is
   what keeps the summary a summary rather than a verdict with a caption.

   THE SHAPE, and each property is a constraint rather than a taste:
     · THE PHONE'S WORD. «Защо» set `uppercase`, the same label `SimOverlay`
       prints, with ↓ closed / ↑ open. One product, one name for „the rest of
       the reason".
     · ONLY ON A SUMMARISED CARD. A card showing its paragraph has nothing
       behind a chip, and a control that opens what is already open is chrome.
     · A POINTER TARGET, NOT A KEY. The keyboard drives the car (see the file
       header: no binding here, on purpose). The chip is sized like the
       shell's own «покажи» fold row — `rounded-full border px-2.5 py-1
       text-[9px]` — because that is the affordance this column already
       teaches for „there is more, press here".
     · A REGION OF THE CARD, NOT A `<button>` IN A `<button>`. The interactive
       card IS a `<button>` (click removes it — the founder's A6). A second
       button inside it is invalid HTML, React warns on it, and `SimOverlay`
       has already refused that nesting once and solved the same problem by
       asking WHERE the press landed (`pressOnDismissGlyph`). Here the target
       is the chip's own element, so `closest` answers it without geometry:
       a press on the chip toggles, a press anywhere else still dismisses.
     · IT DOES NOT RE-OPEN THE FIT QUESTION, AND IT SURVIVES THE CLOCK. The
       open state is this component's own `useState`, keyed by the toast id,
       so the age tick re-renders it without resetting it; the measurement
       keys on `choice` and never sees it.

   WHAT OPENING IT DOES TO THE COLUMN, stated: the paragraph comes back at the
   size it has, which on the ring row is taller than the window. That is the
   student's explicit choice, the shell's `ResizeObserver` on
   `[data-hud="toasts"]` sees the card grow, and its fold row then offers
   «↓ обяснението продължава — покажи» to page through it, exactly as it did
   for every long card before the repair above.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE CHIP MOVED UP BESIDE THE SENTENCE — 2026-09-17, found measuring
   sc-roundabout-entry:fe081cf1's summary card against the w49 column.

   IT USED TO BE THE THIRD ITEM ON THE FOOTER ROW — the law chip, the age, the
   chip — and that row is `flex-wrap` in a 224 px content box. The three fit
   beside «сега» and do not beside «преди 2 с», so two seconds into its life
   the chip dropped to a row of its own and the card grew under its reader
   with nothing new to read. MEASURED, the real card in a copy of the shell's
   column with the app's faces and `lang="bg"`, Chromium and WebKit alike:

     OFF_CARRIAGEWAY (the w49 −3)   114 px «сега» → 139 px «преди 2 с»
     COLLISION / staticObject       114 px        → 139 px
     FAILED_TO_YIELD / roundabout   111 px        → 136 px

   and 35 of the catalogue's 73 codes, each summarised, grew the same 25 px
   between «сега» and «преди 9 с». THE ROW IS WHY IT MATTERS: pc-right
   `04-t090s.png` gives the −3 card 119.7 px of column below the recall pill.
   At 139 px the whole summary card cannot be on the glass however the shell
   arranges its fold row; at the height it has now it can.

   NOW IT FLOATS RIGHT, AT THE START OF THE BODY BOX. On a summary — one short
   catalogue sentence — it sits on the sentence's first line and costs the
   2.5 px by which it is taller than that line: the −3 card is 117 px (116 in
   WebKit) from arrival to expiry, and 0 of the 73 codes grow. A float and not
   a flex row, because the chip stays when the student opens the paragraph: a
   row would narrow EVERY line of a 674-character explanation by the chip's
   63 px (measured on the ring paragraph: 24 characters on its first line
   against 38, and about a third fewer on every line after it, on a card that
   pages against an eight-second clock), where a float narrows only the
   lines beside it and the rest take the full width. `flow-root` on the box is
   what makes the box contain the float, so the footer below never slides up
   under it. The chip also stays where it was pressed when the paragraph
   opens — at the top of the card, above the fold, which is where the student
   who wants it closed again will look.

   What did not change: the chip's size and word (the shape above), its press
   region (`closest`, not geometry), and the body `<p>` — still the one
   element carrying `data-hud-toast-body`, still the one the fit test lets
   into flow and collapses again. A paragraph card renders no chip, so its
   body box is the `<p>` alone at full width and the fit test measures exactly
   the card it measured before.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The attribute that marks the «Защо» chip — and the press region it is. */
export const TOAST_WHY_ATTR = "data-hud-toast-why";

/**
 * The chip's classes — ONE string, because two things lay it out: the chip
 * itself, and the hidden copy `measureToastSummaryCardPx` measures a summary
 * card with. A copy with a different chip would measure a different card.
 */
const TOAST_WHY_CHIP_CLASS =
  "pointer-events-auto float-right ml-1.5 cursor-pointer rounded-full border px-2.5 py-1 text-[9px] font-black uppercase leading-none tracking-wider";

/** The chip's label, in the phone card's word (`SimOverlay`: „Защо"). */
export const TOAST_WHY_LABEL_BG = { closed: "Защо ↓", open: "Защо ↑" } as const;

/**
 * Did this press land on a «Защо» chip? Structural rather than `instanceof
 * Element`, so the gate can ask it of a stand-in without a DOM; anything that
 * cannot answer `closest` (a text node, `null`) is not on the chip.
 */
export function pressLandedOnToastWhy(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return (target as Pick<Element, "closest">).closest(`[${TOAST_WHY_ATTR}]`) !== null;
}

/** What one press of a card does. `"none"` is the inert column off the chip. */
export type ToastPressAction = "why" | "dismiss" | "none";

/**
 * THE CARD'S PRESS, AS ONE FUNCTION THE COMPONENT CALLS AND THE GATE RUNS. A
 * card with a chip toggles when the press lands on it; otherwise an
 * interactive card dismisses, as it always has, and an inert one does nothing.
 */
export function toastCardPressAction(
  target: unknown,
  card: { interactive: boolean; hasWhy: boolean },
): ToastPressAction {
  if (card.hasWhy && pressLandedOnToastWhy(target)) return "why";
  return card.interactive ? "dismiss" : "none";
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE EXPLANATION HE ASKED FOR WAS CUT BY WHAT ARRIVED AFTER IT —
   sc-roundabout-entry:fe081cf1, the clauses rig-w3d left open (2026-10-12),
   item 1; REBUILT in round 2 (2026-10-13) on the integrator's decisions W1/W2
   after the round-1 verifier refuted the first hold.

   THE FRAME, and the sidecar's own boxes (`.audit-frames/rig-w3d/
   sc-roundabout-entry/fe081cf1/pc-L3-F-ON-WHY-28-why-plus4_3s.png`, Chromium
   1440 × 900, advisor on, 8cb0707). The column is 260.5 → 728 (467.5 px).

     press +0.3 s   banner 48.7 · pill 23.5 · scroller 344.7 → 698.5
                    the opened card 295.5 px at 344.7 → 640.2 — WHOLE, law chip
                    «ЗДвП чл. 20, ал. 2» at 615.2 → 636.2
     contact +5.03  the crash pins the car: the banner grows to 76.2 px and the
                    advisor posts its recovery card, 98.3 px, above the pill
                    → scroller 476.5 → 698.5 (222 px, 251.5 without the fold row)
                    → the card stands 476.5 → 772: body cut 42.5 px inside «…
                    Излизането от платното», law chip 69.5 px below the window,
                    for the 3.0 s the card had left.

   WHY NOTHING ANSWERED. Two rules in this file follow a window down, and both
   stop at the opened card on purpose: the arrival fit and the shrink switch
   („THE WINDOW SHRANK UNDER A CARD THAT FITTED") only ever act on a card whose
   choice is `"paragraph"`, and an opened card's choice is `"summary"` with
   `whyOpen` on top — «an OPEN chip stays open … no resize can reach it». That
   was written so that a window could not close a text under its reader. It
   also meant the window could CUT that text and nothing would ask.

   WHAT ROUND 1 BUILT, AND WHERE IT WAS REFUTED. A hold that made the advisor's
   card and the OLDER cards wait when the opened card was measured cut. It
   repaired the rig's bare immersive stage and nothing shorter: on the stage a
   student actually gets (`/simulator`, 1165 × 650 at a 1440 × 900 window — cap
   322) the column has 267.3 px for that 295.5 px card with only the one-line
   banner standing, so the card was still cut 114.7 px with the hold taken; an
   immersive 1366 × 768 viewport cut it 69.5 px; and on the rig stage itself a
   second fault arriving ON TOP cut it 93.7 px. (Verifier probe V2/V3,
   `lesson-ui/__tests__/whycut-verify-probe.test.ts` keeps its rows.)

   SO, WHILE AN EXPLANATION IS OPEN IT OWNS THE COLUMN (W1):
     · IT IS THE ONLY CARD PAINTED. `hudPreferences.visibleToasts` returns the
       opened card alone; every other card — the «Научи» card under it, a fault
       raised after it — waits with its clock stopped
       (`useHudToastQueue.holdAllBut`) and takes its place the moment the
       opened card is closed, dismissed or out of reading time. So nothing can
       arrive on top of the paragraph and move it under its reader, in quiet
       mode there is still one card on the glass, and the waiting cards are
       COUNTED on the opened card: «+N», the phone card's own badge
       (`SimOverlay`), in the footer beside the law chip.
     · WHAT STANDS ABOVE IT GIVES WAY, IN TWO STEPS, ONLY AS FAR AS THE CARD IS
       STILL SHORT (`toastColumnYieldNext`): first the advisor's card waits
       (`held`), then the banner — when a route hold has grown it to three
       lines — sets its sentence on one (`bannerYields`, `ObjectiveBanner`'s
       `oneLine`): the start of the hold's own lead — measured in Chromium at
       the rig's column width, «Колата е притисната след удара — измъкни се
       назад,…», 76.25 → 48.75 px — with the sentence whole in the DOM. Measured before paint, latched while he reads, and
       released only by him — re-asking on every layout would let the advisor's
       card back the moment its absence made the paragraph fit, which cuts it
       again. On the rig's stage step one is enough (the card stands
       372.2 → 667.7 in a window to 728) and the banner keeps its recovery
       order; a stage with room for everything gives up nothing.
       A BANNER WITH NO HOLD LEAD IS NEVER CUT. One line of the task itself
       would take its «дръж под N км/ч» off the glass — the figure the founder
       ruled on 2026-09-22 must be said in the banner — so the one-line form is
       taken only while a hold's lead stands in front of the task
       (`LessonPlayShell.bannerOneLineWhileReading`), and the lead is not
       withheld either: that would put the w49 defect back (the task standing
       over a car that cannot obey it) for the length of a reading.

   AND WHERE EVEN THE BARE COLUMN CANNOT HOLD IT, THE BODY SCROLLS INSIDE THE
   CARD (W2). While it is being read the card is a flex column whose ONE
   shrinkable child is the body box (`TOAST_READ_ATTR`): the header, the title
   and the footer — the law chip — keep their height, so they are on the glass
   on every frame, and the paragraph scrolls between them. No number decides
   it: the shell's scroller is already the column's last-resort yielder, the
   wrapper and the stack below take `min-h-0` for the reading, and flexbox
   hands the card exactly the window the column has. Laid out with the app's
   compiled CSS in Chromium and in WebKit (2026-10-13, the 295.5 px card):

     stage                       window   card      body shown / whole
     rig, 1440 × 900 immersive    383.3   295.5     198 / 198   (not scrolling)
     /simulator 1165 × 650        237.8   237.8     140 / 198   law chip in
       …with the fold row up      208.3   208.3     111 / 198   law chip in
     immersive 1366 × 768         283.0   283.0     185 / 198   law chip in

   The hidden part is ANNOUNCED AND REACHABLE: the shell's fold row («↓
   обяснението продължава — покажи») is raised for it and pages THIS box
   (`LessonPlayShell.measureToastColumnFold`, `pageToastRead`), the box fades
   at its foot while more is below, a wheel over the card scrolls it (the card
   takes pointer events; the shell's scroller never could be dragged), and its
   thin scrollbar can be dragged. The law chip did not move by a pixel while
   the box scrolled, in either engine.

   WHAT IT COSTS, stated rather than found later:
     · THE «ЗАЩО ↑» CHIP SCROLLS WITH THE TEXT. It floats at the head of the
       body box, so paging down takes it out of sight; the ✕ on the card and
       the text's own end are still there, and paging back up brings it back.
     · A CARD THAT WAITS IS OFF THE GLASS FOR THE WHOLE READING — up to the
       88 s `toastReadMs` gives the longest paragraph (1 320 characters). That
       includes a graded fault raised meanwhile: it is counted («+1») and not
       shown until the explanation is closed or its time is over.
     · WHILE THE COLUMN HAS YIELDED, THE ADVISOR'S SENTENCE IS NOT ON THE GLASS
       (the advisor has no voice; its card is its only channel on this leg),
       and on a stage where that was not enough the banner under a hold shows
       the first line of its sentence only — the hold's condition and order;
       the task behind it, and any speed cap in it, are off the glass until
       the explanation is closed. The student chose the explanation and gives
       the column back at once with «Защо ↑» or the ✕.
     · A WINDOW SHORTER THAN THE CARD'S PINNED ROWS PLUS ONE BODY LINE
       (`TOAST_READ_FLOOR_PX`) cannot pin anything: the card then overflows the
       shell's scroller as every long card did before, and the fold row
       announces and pages that. For this card that is a stage under 526 px
       (0.76·H − 172 − banner − pill − fold row < 97.5 + 16.5).
     · It does not touch a card nobody opened. An un-pressed paragraph follows
       its window down by the shrink switch above, as before.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The attribute on the opened card's body box while it is being read — the one
 *  box that scrolls inside the card (W2). The shell's fold row reads and pages it. */
export const TOAST_READ_ATTR = "data-hud-toast-read";
export const TOAST_READ_SELECTOR = `[${TOAST_READ_ATTR}]`;

/** The attribute on the «+N» badge the opened card prints for the cards waiting behind it. */
export const TOAST_WAITING_ATTR = "data-hud-toast-waiting";

/**
 * The body box never shrinks under ONE line of its own type, px — `text-xs
 * leading-snug` is 12 px × 1.375. A window under one line can show no sentence
 * whole, so below it the card stops shrinking and overflows the shell's
 * scroller instead (the pre-existing, announced fallback). Never taller than
 * the box's own content: the «Защо» chip alone is 19 px.
 */
export const TOAST_READ_FLOOR_PX = 16.5;

/** «още 1 известие» / «още 3 известия» — the badge's accessible name, in the
 *  words the shell's fold row already prints for the same count. */
export function toastWaitingLabelBg(waiting: number): string {
  return `още ${waiting} ${waiting === 1 ? "известие" : "известия"}`;
}

/** How far the column has yielded to the opened card: 0 nothing above it gave
 *  way · 1 the advisor's card waits · 2 a banner under a hold is also set on one line. */
export const TOAST_YIELD_ADVISOR = 1;
export const TOAST_YIELD_BANNER = 2;

/**
 * The yield after one look at the column. One step further each time the
 * opened card is still short, never back while it is being read (the latch),
 * and nothing at all the moment nobody is reading.
 */
export function toastColumnYieldNext(level: number, reading: boolean, short: boolean): number {
  if (!reading) return 0;
  return short ? Math.min(TOAST_YIELD_BANNER, level + 1) : level;
}

/**
 * How much of the opened paragraph its body box cannot show at once, px — the
 * read the yield is decided on. `null` is NO CLAIM (nothing is being read in
 * this scroller, or the box has not been laid out), and no claim yields
 * nothing.
 *
 * ASKED OF THE COLUMN WITHOUT THE FOLD ROW, for the reason
 * `readToastScrollerWindow` gives: the row is the shell's statement ABOUT the
 * cards, and a row that is only needed because it is up is not a shortage of
 * room. Read, not added up — the row is taken out of flow for the two reads
 * and put back, and the scroll positions the grown boxes can clamp are
 * restored, so every box ends the call at the size it started.
 */
export function readOpenedToastShortPx(scroller: HTMLElement): number | null {
  const box = scroller.querySelector(TOAST_READ_SELECTOR);
  if (box === null) return null;
  const read = box as HTMLElement;
  const shortPx = () => (read.clientHeight > 0 ? Math.max(0, read.scrollHeight - read.clientHeight) : null);
  const asItStands = shortPx();
  if (asItStands === null || asItStands <= TOAST_FIT_SLACK_PX) return asItStands;
  const more = scroller.parentElement?.querySelector(TOAST_MORE_SELECTOR) ?? null;
  if (more === null) return asItStands;
  const row = more as HTMLElement;
  const kept = { position: row.style.position, scrollTop: scroller.scrollTop, readTop: read.scrollTop };
  row.style.position = "absolute";
  const withoutRow = shortPx();
  row.style.position = kept.position;
  if (scroller.scrollTop !== kept.scrollTop) scroller.scrollTop = kept.scrollTop;
  if (read.scrollTop !== kept.readTop) read.scrollTop = kept.readTop;
  return withoutRow;
}

/** What `useToastReader` hands the shell. */
export interface ToastReader {
  /** For `HudToasts` and `visibleToasts`: the opened card, and whether the column above it has yielded. */
  reading: ToastReading | null;
  /** The advisor's card waits (yield step 1 or 2). */
  held: boolean;
  /** A banner under a route hold sets its sentence on one line (yield step 2). */
  bannerYields: boolean;
  /** `HudToasts`' report of a «Защо» press. */
  onWhyChange: (id: number, open: boolean) => void;
  /** Ask again — for layout changes no commit announces (the shell's `ResizeObserver`). */
  recheck: () => void;
}

/**
 * THE READER'S HOLD ON THE COLUMN — the state machine of the block above, in
 * one hook so it can be mounted and run by a test rather than read off the
 * shell's source.
 *
 * `scroller` is the shell's `[data-hud-toast-scroller]`; `whyChanged` and
 * `holdAllBut` are the queue's (`useHudToastQueue`).
 */
export function useToastReader({
  toasts,
  scroller,
  whyChanged,
  holdAllBut,
}: {
  toasts: ReadonlyArray<{ id: number }>;
  scroller: { readonly current: HTMLElement | null };
  whyChanged: (id: number, open: boolean) => void;
  holdAllBut: (id: number | null) => void;
}): ToastReader {
  const [openId, setOpenId] = useState<number | null>(null);
  // How far the column has yielded to the card `openId` names. It belongs to
  // that card: a new press starts from nothing (`onWhyChange`), because a yield
  // taken for one card is not a measurement of the next one the student opens.
  const [yieldLevel, setYieldLevel] = useState(0);
  // A card that has left takes its open explanation with it — derived, so there
  // is no unmount report to forget.
  const readingId = openId !== null && toasts.some((t) => t.id === openId) ? openId : null;
  const level = readingId === null ? 0 : yieldLevel;

  /** The yield the column should stand at, by one look at it as it now is. */
  const yieldTarget = (el: HTMLElement | null): number => {
    let short = false;
    if (readingId !== null && level < TOAST_YIELD_BANNER && el !== null) {
      const shortPx = readOpenedToastShortPx(el);
      short = shortPx !== null && shortPx > TOAST_FIT_SLACK_PX;
    }
    return toastColumnYieldNext(level, readingId !== null, short);
  };
  // The shell's ref, under a ref's name: the value the layout effect below sets
  // is read straight off it, which is the one shape of „measure, then set" this
  // file already uses (`useToastBodyChoice`).
  const scrollerRef = scroller;
  const recheck = () => {
    const next = yieldTarget(scrollerRef.current);
    if (next !== yieldLevel) setYieldLevel(next);
  };

  // After EVERY commit, before paint: the banner growing and the advisor's card
  // arriving are commits of the shell, and the re-render this may ask for is
  // flushed before the browser paints either — one step per pass, so a column
  // that needs both steps takes two passes and still paints once. With nothing
  // open it reads no DOM, and setting the value the state already holds is not
  // an update — which is also why this effect needs no dependency list and
  // must not have one: the layout it answers to changes on commits none of its
  // own inputs take part in.
  useLayoutEffect(() => {
    setYieldLevel(yieldTarget(scrollerRef.current));
  });

  // Every other card waits for as long as this one is being read — and only
  // that long.
  useEffect(() => {
    holdAllBut(readingId);
  }, [readingId, holdAllBut]);

  const onWhyChange = useCallback(
    (id: number, open: boolean) => {
      whyChanged(id, open);
      if (open) setYieldLevel(0);
      setOpenId((current) => (open ? id : current === id ? null : current));
    },
    [whyChanged],
  );

  const held = level >= TOAST_YIELD_ADVISOR;
  return {
    reading: readingId === null ? null : { id: readingId, held },
    held,
    bannerYields: level >= TOAST_YIELD_BANNER,
    onWhyChange,
    recheck,
  };
}

/**
 * The chip. `pointer-events-auto` because the inert column's card is
 * `pointer-events-none`; `title` because the card's own „Щракни, за да го
 * скриеш" would otherwise be the tooltip over the one spot where it is false.
 * Its colour is the fault's, as the phone's «Защо» label is.
 */
function ToastWhyChip({ open, color }: { open: boolean; color: string }) {
  return (
    <span
      data-hud-toast-why={open ? "open" : "closed"}
      title={open ? "Свий обяснението" : "Покажи цялото обяснение"}
      className={TOAST_WHY_CHIP_CLASS}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {open ? TOAST_WHY_LABEL_BG.open : TOAST_WHY_LABEL_BG.closed}
    </span>
  );
}

/**
 * The body box's style while the card is being read (W2) — what makes it the
 * one box that scrolls inside the card:
 *   · `overflowY: auto` makes it a scroll container, so its flex minimum is 0
 *     and it — alone — takes the card's squeeze (the header, the title and the
 *     footer are not scroll containers and cannot shrink under their content);
 *     it still contains the chip's float, which is all `flow-root` was for;
 *   · `minHeight` is the one-line floor (`TOAST_READ_FLOOR_PX`);
 *   · `overscrollBehavior: contain` — a wheel that reaches the end of the
 *     paragraph stops there instead of scrolling the page behind the stage;
 *   · the scrollbar pair is the shell scroller's own
 *     (`[scrollbar-color:var(--border-strong)_transparent]
 *     [scrollbar-width:thin]`), and on THIS box it can be dragged: the card
 *     takes pointer events, the shell's scroller never did;
 *   · and — only while more of the paragraph is below — the fade at its foot.
 *     The mask is the shell's (`readMaskCss` is
 *     `LessonPlayShell.TOAST_FADE_MASK_CSS`, derived there from this card's
 *     own type), handed in rather than restated.
 */
export function toastReadBoxStyle(readMaskCss: string | null): {
  minHeight: number;
  overflowY: "auto";
  overscrollBehavior: "contain";
  scrollbarWidth: "thin";
  scrollbarColor: string;
  WebkitMaskImage?: string;
  maskImage?: string;
} {
  const box = {
    minHeight: TOAST_READ_FLOOR_PX,
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--border-strong) transparent",
  } as const;
  return readMaskCss === null ? box : { ...box, WebkitMaskImage: readMaskCss, maskImage: readMaskCss };
}

function ViolationToast({
  event,
  ageBg,
  onDismiss,
  onWhyChange,
  reading = false,
  waiting = 0,
  readMaskCss = null,
  onReadScroll,
}: {
  event: Extract<HudEvent, { kind: "violation" }>;
  ageBg: string | null;
  onDismiss: (() => void) | null;
  /** The student opened or closed this card's «Защо» — see `useToastReader`. */
  onWhyChange?: (open: boolean) => void;
  /** The column is reading THIS card (`useToastReader`'s `reading.id`). */
  reading?: boolean;
  /** Cards waiting behind it while it is read — the «+N» in its footer. */
  waiting?: number;
  /** The fade for the body box's foot while more of the paragraph is below it; null when none is. */
  readMaskCss?: string | null;
  /** The body box scrolled (a wheel, a drag of its bar) — a `scroll` does not
   *  bubble, so the shell's fold row hears it only through this. */
  onReadScroll?: () => void;
}) {
  const meta = SEVERITY_META[event.severity];
  const canSummarise = typeof event.peekBg === "string" && event.peekBg.trim().length > 0;
  const { setCard, bodyRef, choice } = useToastBodyChoice(canSummarise, violationToastBodyBg(event, false));
  const [whyOpen, setWhyOpen] = useState(false);
  // The press is REPORTED as well as kept: the column has to make room for the
  // paragraph and the queue has to give it the time to be read, and neither can
  // see this component's state. Reported from the handler, with the value the
  // press produced — never from inside the state updater, which React may run
  // twice.
  const toggleWhy = useCallback(() => {
    const open = !whyOpen;
    setWhyOpen(open);
    onWhyChange?.(open);
  }, [whyOpen, onWhyChange]);
  const summarised = choice === "summary";
  const showParagraph = !summarised || whyOpen;
  // W2 — the read layout, and it needs BOTH: the column says this is the card
  // it is reading, and this card's own chip is open. With no reader mounted
  // (`app/dev/popup-rig`, a test) `reading` is never true and the card is laid
  // out exactly as it shipped.
  const read = reading && summarised && whyOpen;
  return (
    <ToastShell
      color={meta.color}
      onDismiss={onDismiss}
      onWhy={summarised ? toggleWhy : undefined}
      cardRef={setCard}
      read={read}
    >
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
          Quiet mode NEVER removes this; it removes praise. What CAN change it
          is the fit test above: a paragraph the column would cut is replaced
          by the catalogue's own summary of it, never by nothing — and the
          «Защо» chip beside it brings the paragraph back on request.
          `data-hud-toast-body` names which one is in the box, so a sweep can
          read the choice off the DOM instead of inferring it from a crop;
          `"pending"` there is the one commit before the choice, never painted.
          The chip comes FIRST in this box because it floats: see „…AND THE
          CHIP MOVED UP BESIDE THE SENTENCE" for why a float and not a row.

          WHILE IT IS BEING READ THIS BOX IS THE ONE THAT SCROLLS (W2): the
          title above it and the law chip below it keep their height (a flex
          item that is not a scroll container cannot shrink under its content),
          and the paragraph moves between them. `toastReadBoxStyle` is the
          whole of it, as a style on this box and not a second class list, so
          that the box of a card NOT being read is this element exactly as it
          shipped — one `className`, no `style`, no attribute. */}
      <div className="mt-1 flow-root" data-hud-toast-read={read ? "" : undefined} style={read ? toastReadBoxStyle(readMaskCss) : undefined} onScroll={read ? onReadScroll : undefined}>
        {summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}
        <p
          ref={bodyRef}
          data-hud-toast-body={choice === "pending" ? "pending" : showParagraph ? "paragraph" : "summary"}
          className="text-xs leading-snug text-muted"
          style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}
        >
          {violationToastBodyBg(event, showParagraph)}
        </p>
      </div>
      <ToastFooter lawRef={event.lawRef} ageBg={ageBg} waiting={read ? waiting : 0} />
    </ToastShell>
  );
}

function ToastCard({
  event,
  ageBg,
  onDismiss,
  onWhyChange,
  reading = false,
  waiting = 0,
  readMaskCss = null,
  onReadScroll,
}: {
  event: HudEvent;
  /** „сега" / „преди 8 с", or null when this card carries no moment. */
  ageBg: string | null;
  onDismiss: (() => void) | null;
  onWhyChange?: (open: boolean) => void;
  reading?: boolean;
  waiting?: number;
  readMaskCss?: string | null;
  onReadScroll?: () => void;
}) {
  if (event.kind === "violation") {
    // Its own component because it holds hooks (the fit measurement), and a
    // hook called in one arm of this `if` chain is outside the rules of hooks.
    return (
      <ViolationToast
        event={event}
        ageBg={ageBg}
        onDismiss={onDismiss}
        onWhyChange={onWhyChange}
        reading={reading}
        waiting={waiting}
        readMaskCss={readMaskCss}
        onReadScroll={onReadScroll}
      />
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
  reading = null,
  onWhyChange,
  readMaskCss = null,
  onReadScroll,
  onPainted,
}: {
  toasts: HudToast[];
  /** „По-тихи известия": one card at a time, and no praise. */
  quiet?: boolean;
  /** L14: omit and the column stays inert (the pre-rework behaviour). */
  onDismiss?: (id: number) => void;
  /** Shown only while more than one card is up — one click clears the lot. */
  onDismissAll?: () => void;
  /** The card whose «Защо» is open and whether the column is held for it
   *  (`useToastReader`). Omitted: nothing is being read, the column as shipped. */
  reading?: ToastReading | null;
  /** A «Защо» press, by toast id — the shell hands it to `useToastReader`. */
  onWhyChange?: (id: number, open: boolean) => void;
  /** The fade for the foot of the opened card's body box, while the shell's
   *  fold measure says more of the paragraph is below it; null otherwise. */
  readMaskCss?: string | null;
  /** The opened card's body box scrolled — the shell re-measures its fold row. */
  onReadScroll?: () => void;
  /** After every change of what is on the glass: the ids this column painted,
   *  for the queue (`useHudToastQueue.painted`) — a card that waited behind an
   *  explanation restarts its clock only when it is painted (round 3, W5). */
  onPainted?: (ids: readonly number[]) => void;
}) {
  const shown = visibleToasts(toasts, quiet, reading);
  // W5: tell the queue what is on the glass — every time it changes, and once
  // on mount. Keyed on the ids, so a re-render that paints the same cards says
  // nothing new.
  const paintedKey = shown.map((t) => t.id).join(",");
  useEffect(() => {
    onPainted?.(paintedKey === "" ? [] : paintedKey.split(",").map(Number));
  }, [paintedKey, onPainted]);
  // W1/W2 — the card the column is reading, when it is the one on the glass.
  // `visibleToasts` then returns it alone, so the stack below is a stack of
  // one, and `readingRoom` is what lets that one card be handed the window:
  // `min-h-0` on the two boxes between the shell's scroller and the card, for
  // the reading and not a frame longer — with nothing open neither box may
  // shrink, and the stack scrolls in the shell's scroller as it always has.
  const readId = reading !== null && shown.some((t) => t.id === reading.id) ? reading.id : null;
  const readingRoom = readId !== null;
  const waiting = waitingToasts(toasts, quiet, reading);

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
      className={
        readingRoom
          ? "pointer-events-none flex min-h-0 flex-col items-end gap-2 select-none"
          : "pointer-events-none flex flex-col items-end gap-2 select-none"
      }
    >
      {/* ═══════════════════════════════════════════════════════════════════
          `[data-hud="toasts"]` HOLDS CARDS AND ONLY CARDS — 2026-08-28, w8.

          THE BOX IS NOT DECORATION, IT IS A MEASURING INSTRUMENT. The shell
          counts the fold off THIS element's children and says so at its own
          site: „The rows are read off `[data-hud="toasts"]`'s children —
          `HudToasts` owns that box, so this measures what is actually painted"
          (`LessonPlayShell.tsx`, `measureToastFold`, ~5185). Those children
          then go through `rowsFullyBelowFold`, whose count picks the SENTENCE
          the fold control prints, and that sentence is a claim about GRADED
          FAULTS: „N is the number of graded faults the student has not seen a
          pixel of" (`LessonPlayShell.tsx`, the label, ~6531).

          «Изчисти известията» WAS THE LAST OF THOSE CHILDREN. It renders
          exactly when `shown.length > 1`, i.e. on the busiest moment the column
          has, and it is a CONTROL — so from the moment a second fault arrives
          the counter had one more „graded fault" in it than the drive
          contained, and the miscount was always in the direction of alarm.

          MEASURED, AND THE FRAME PROVES IT ARITHMETICALLY RATHER THAN BY EYE.
          `.audit-frames/w14/frames/sc-ac-crosswind__pc-wrong/04-t021s.png`
          (1440 × 900, driven on 6399a8d, and this file is byte-identical from
          there to HEAD) prints «↓ ОЩЕ 2 ИЗВЕСТИЯ — ПОКАЖИ» under a single
          «Удар в пешеходец» card. `TOAST_MAX_VISIBLE` is 2. One card is on the
          glass, so AT MOST ONE other notification can exist — «още 2 известия»
          is not a debatable reading, it is impossible. The third child was this
          button. Same sentence on
          `w14/frames/sc-junction-rhr__pc-wrong/04-t016s.png`.

          WHY IT IS WORTH A WAVE. The student is seventeen and the card he is
          reading is cut mid-clause («…Затова към пешеходците се кара с»). The
          one control offered to him announces OTHER notifications, and it
          over-announces them. He presses it expecting a second fault, gets the
          rest of a sentence and a button, and learns that the count on a fault
          column is not to be trusted — on the surface whose entire job is to
          make him believe the verdict enough to change how he drives.

          THE FIX IS THE BOX AND NOT THE ARITHMETIC. `rowsFullyBelowFold` is
          right; it was fed a control. Nothing about the button changes — same
          markup, same classes, same place on the screen, still inside the
          shell's scroller so a wheel still reaches it — it simply stops being a
          row in the list the instrument reads. The one thing that moves is
          `aria-live`, which follows the cards: a polite region should announce
          faults, not the appearance of the control that clears them.
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        aria-live="polite"
        data-hud="toasts"
        className={readingRoom ? "flex min-h-0 w-full flex-col items-end gap-2" : "flex w-full flex-col items-end gap-2"}
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
            onWhyChange={onWhyChange ? (open) => onWhyChange(t.id, open) : undefined}
            reading={t.id === readId}
            waiting={t.id === readId ? waiting : 0}
            readMaskCss={t.id === readId ? readMaskCss : null}
            onReadScroll={t.id === readId ? onReadScroll : undefined}
          />
        ))}
      </div>
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
