"use client";

/**
 * SimOverlay — ONE overlay, at the top rail, one line high.
 *
 * This is the visible half of overlayQueue.ts. The founder's iPhone screenshots
 * (2026-07-29) showed a „ЗАДАЧА" card, a teach card and a red belt warning
 * stacked down the screen before the road got a pixel, because each of them was
 * a separate component that positioned itself. His verdict: „not acceptable it
 * is not playable at all."
 *
 * The grammar here is Gran Turismo's, which he attached as „how it should look
 * like": screen furniture is small, hard against an edge, and the centre of the
 * frame is road. So:
 *
 *   PEEK (default, and what the harness measures)
 *     A small card in the RIGHT-EDGE NOTIFICATION COLUMN (`notifyColumn.ts`).
 *
 *     ── 2026-08-03, HIS THIRD ASKING, AND WHY THE SHAPE CHANGED. ───────────
 *     This was a shrink-to-fit pill spanning the TOP RAIL, from the micro menu
 *     to the right inset — measured at 852×393 it laid out 766 px of an 852 px
 *     screen, a full-width strip across the sky. „you see all this text in the
 *     middle yes, and we said we have to move it from there so it doesnt
 *     bother the view … it must be like a popup notifications going below, it
 *     must be small text so the user can just read it."
 *
 *     A rail is horizontal and a notification column is vertical, and that is
 *     the whole change: the line now WRAPS (to three lines, clamped) inside a
 *     240 px column at the right edge instead of being truncated across the
 *     top of the road. Wrapping is also the THEO-4-friendlier of the two — the
 *     student sees more of the authored sentence, not less.
 *
 *   OPEN (only after a tap)
 *     A bottom sheet above the instrument band with the full authored text, the
 *     law citation, and the acknowledge. This is an EXPLICIT pause, which is
 *     the one case the budget allows to be large.
 *
 * WHY THE PEEK IS USUALLY NOT THERE AT ALL. Most items are transient: a task
 * line speaks when the objective changes and then gets out of the way, because
 * the route is already drawn IN THE WORLD (ghost ribbon, chevrons, objective
 * marker) and a permanent banner restating it is furniture. The ambient state
 * of this layer is an empty screen; „Задача" in the micro menu brings the line
 * back on demand. Only a blocking teach moment and the end-of-session verdict
 * stay until they are answered.
 *
 * THEO-4 — REQUIREMENT ZERO — IS THE CONSTRAINT THIS FILE IS BUILT AROUND.
 * A one-line overlay must never become a bare verdict. Every item that names a
 * mistake carries its authored, law-cited WHY in the sheet behind the „Защо"
 * button, the lawRef chip rides in the pill itself where there is room, and the
 * pill for such an item is ALWAYS interactive — `hasWhy()` in the pure module
 * is the assertion, and `overlayQueue.test.ts` is where it is enforced.
 *
 * ---------------------------------------------------------------------------
 * DOC 87 · A6 — „THOSE POP UPS NEED TO BE ABLE TO BE REMOVED WHEN CLICKED"
 *
 * The roomy half of this row shipped in `HudToasts` (the whole card is a
 * `<button aria-label="Скрий известието">` and a click removes it). THIS FILE
 * IS THE PHONE HALF AND IT WAS STILL DEAD: the peek was
 *
 *     const interactive = hasDetail || blocking;
 *
 * so an ordinary line — a task, a piece of guidance, a „Браво" — got
 * `pointer-events: none`, zero controls, and could only leave when its TTL ran
 * out. The founder's sentence is about exactly that card, and „wait seven
 * seconds" is not an answer to „remove it when I click it".
 *
 * So the peek now has two shapes, and they are the two the desktop column
 * already had:
 *
 *   PLAIN LINE (no WHY behind it, nothing to acknowledge, not blocking)
 *     the WHOLE CARD is the dismiss button — the `HudToasts` grammar, with the
 *     same ✕ glyph and the same „Скрий известието" label.
 *
 *   RICH LINE (carries a WHY, or an acknowledgement, or both)
 *     the card is not a button, because it already holds buttons. It gets a
 *     third 44 px chip — ✕ — beside „Защо" and the acknowledgement.
 *
 * A BLOCKING ITEM IS THE ONE THING WITH NO ✕, and that is the contract, not an
 * oversight: a teach moment holds the drive still until it is answered, and the
 * end-of-session line is the student's route to the debrief. Both keep their
 * acknowledgement instead. Everything else on the glass can be sent away with
 * one tap.
 * ---------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  OVERLAY_PEEK_HEIGHT_PX,
  type SimOverlayItem,
  type SimOverlayTone,
} from "./overlayQueue";
import {
  FLANK_LANE_VAR,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
} from "./notifyColumn";
import { useTapActivation } from "./tapActivation";

/** Tone → the one colour token the pill is tinted with. */
const TONE_COLOR: Record<SimOverlayTone, string> = {
  neutral: "var(--accent)",
  teach: "var(--accent-2)",
  warn: "var(--warning)",
  danger: "var(--danger)",
  good: "var(--success)",
};

/** A tiny leading glyph, so the tone reads before the words do. */
function ToneGlyph({ tone, frozen }: { tone: SimOverlayTone; frozen: boolean }) {
  if (frozen) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
        <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      {tone === "danger" || tone === "warn" ? (
        <path
          d="M12 4 L21 19 H3 Z M12 10 v4 M12 16.4 v.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : tone === "good" ? (
        <path
          d="M5 12.5 L10 17.5 L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M12 3.5 a8.5 8.5 0 1 0 0 17 a8.5 8.5 0 0 0 0-17 M12 10.5 v6 M12 7.2 v.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** A6: the ✕ the desktop toast column already shows. */
function DismissGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden>
      <path
        d="M6 6 L18 18 M18 6 L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SimOverlay({
  item,
  queued,
  frozen = false,
  renderDetail,
  onOpenChange,
  onDismiss,
}: {
  /** The ONE item selected by `selectOverlay`, or null for a clean screen. */
  item: SimOverlayItem | null;
  /** Non-ambient items waiting behind it — the „+N" badge. */
  queued: number;
  /** The drive is held still by this item (teach pause / session over). */
  frozen?: boolean;
  /** Rich detail for items that carry more than text (checklist, result). */
  renderDetail?: (item: SimOverlayItem) => ReactNode;
  /** The shell dims scene chrome while a sheet is open. */
  onOpenChange?: (open: boolean) => void;
  /**
   * A6: the student sent a non-blocking line away. The owner is told so it can
   * stop offering the item — a card that reappears on the next 150 ms HUD poll
   * has not been dismissed, it has blinked. The local guard below covers the
   * owner that does not care (the dev rig), so the ✕ is never a dead control.
   */
  onDismiss?: (item: SimOverlayItem) => void;
}) {
  // THE OPEN ITEM, not a boolean, and held as a COPY.
  //
  // Two bugs this shape prevents, both of which turn a „one line" system back
  // into the thing it replaced:
  //  · paging from one queued teach moment to the next must fold the sheet back
  //    down. An inherited `open === true` would greet the second mistake with
  //    a half-screen card nobody asked for.
  //  · a violation line is on a TTL. Holding a copy means a student who taps
  //    „Защо" keeps reading after the toast behind it expires — the alternative
  //    is a law citation that vanishes mid-sentence, which is a THEO-4 problem,
  //    not a cosmetic one.
  const [openItem, setOpenItem] = useState<SimOverlayItem | null>(null);
  const open = openItem !== null;

  // A6: the id the student last sent away. Kept by ID and not as a boolean so a
  // NEW line (the objective changed, another mistake fired) speaks immediately
  // — dismissing „Задача 2/3" must not silence „Задача 3/3".
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const live = item !== null && item.id !== dismissedId ? item : null;

  // While a sheet is open it IS the one overlay; a newly arrived line waits.
  const shown = openItem ?? live;

  // The acknowledgement handler behind a ref, refreshed after every render:
  // `acknowledge` then has a STABLE identity, which is what keeps the window
  // key listener below from being torn down and re-registered six times a
  // second by the shell's 150 ms HUD poll.
  const ackRef = useRef<(() => void) | null>(null);
  // A6: the same trick for the dismiss handler and for the item it acts on, so
  // the ✕ has a stable identity too.
  const dismissRef = useRef<((it: SimOverlayItem) => void) | null>(null);
  const shownRef = useRef<SimOverlayItem | null>(null);
  useEffect(() => {
    ackRef.current = shown?.onAck ?? null;
    shownRef.current = shown;
    dismissRef.current = onDismiss ?? null;
  });

  const acknowledge = useCallback(() => {
    setOpenItem(null);
    ackRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    const it = shownRef.current;
    if (it === null) return;
    setOpenItem(null);
    setDismissedId(it.id);
    dismissRef.current?.(it);
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Space (and Enter) acknowledges a blocking item; Escape folds the sheet.
  //
  // CAPTURE PHASE + stopPropagation, exactly as TeachMomentOverlay does it and
  // for the same measured reason: Space is the parking-brake toggle on the
  // cabin's own window listener (bubble phase, live while paused), so without
  // this, dismissing a belt warning would also yank the handbrake. This is the
  // desktop acknowledgement the brief asks to keep — it costs nothing on a
  // phone and it is the only way to clear a card without a mouse.
  const blocking = shown?.blocking === true;
  const speaking = shown !== null;
  useEffect(() => {
    if (!speaking) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        setOpenItem(null);
        return;
      }
      if (e.code !== "Space" && e.key !== "Enter") return;
      if (!blocking && !open) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (e.key === "Enter" && (tag === "BUTTON" || tag === "A")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (blocking) acknowledge();
      else setOpenItem(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [speaking, blocking, open, acknowledge]);

  // ── DOC 91 · C2 — THE CARD'S OWN CONTROLS WERE DEAD WHILE HE WAS DRIVING ──
  //
  // Every control below was `onClick`-only, and a `click` born of a touch is a
  // compatibility mouse event that only the PRIMARY touch point gets. With a
  // thumb on the throttle — which is the entire time a teach moment or a
  // consequence card can appear — «РАЗБРАХ», «ЗАЩО» and the ✕ fired nothing.
  // Together with C1 that is his whole story: the popup arrives, the pedal
  // dies, and the button that would clear the popup does not answer either.
  //
  // One hook per BUTTON, never one shared between two of them: the mark that
  // de-duplicates the compatibility click belongs to the element that earned
  // it. They sit above the early return because they are hooks.
  const tapWhy = useTapActivation(() => setOpenItem(open ? null : shown));
  const tapAck = useTapActivation(acknowledge);
  const tapDismissChip = useTapActivation(dismiss);
  const tapDismissCard = useTapActivation(dismiss);
  const tapCloseSheet = useTapActivation(() => setOpenItem(null));
  const tapSheetAck = useTapActivation(acknowledge);

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * THE OPEN SHEET IS A READ MODE, AND IT SAYS SO TO THE WHOLE DOCUMENT.
   * 2026-08-13, doc 91 §I11 + §W2 — the founder's „the buttons need absolute
   * redesign", answered at the one place the contention actually lives.
   *
   * WHAT WAS MEASURED, deployed `/simulator`, WebKit, six profiles, canvas and
   * `[data-hud="touch-controls"]` asserted, the panel expanded from the
   * INSTRUCTION hint (not the belt warning — that confound is the previous
   * commit's whole subject):
   *
   *   iphone16-L  852×88 at y 8, FULL-BLEED, 22.4 % — 7 controls dead, 5 of 5
   *               in the top rail, «Разбрах» CLIPPED by the panel's own height
   *   small-L / galaxy-L   88 px strips at y −4 / y −28 — 6 dead, 5 of 5 rail
   *   all three portraits  294–327 px, 34.5–41.9 % — 3 dead, 3 of 5 rail
   *
   * «Закопчай предпазния колан» and «Контроли на автомобила» were buried on
   * 6 of 6 profiles in both orientations: the card telling a student to fasten
   * the belt was standing on the button that fastens it.
   *
   * THE TRAP §I11 NAMES, AND WHY THE OBVIOUS FIX IS WRONG. „Hide the rail" is
   * self-defeating — «КОЛАН» LIVES in that rail while the belt is unfastened,
   * so hiding the rail hides the thing the panel is pointing at. And the other
   * obvious fix, „give the sheet a bigger clearance", is what the code did
   * until today: it stood on `--sim-touch-floor`, which on a 393 px-tall stage
   * leaves 95 px — a two-line box whose own «Разбрах» does not fit inside it.
   *
   * SO NEITHER YIELDS, BECAUSE THE PREMISE IS WRONG. A paragraph of Bulgarian
   * legal prose and a row of driving controls are not two things competing for
   * one strip; they are two things that belong to DIFFERENT DURATIONS:
   *
   *   THE RIBBON  the peek. One line, `pointer-events: none`, in the right
   *               corridor, on screen ~99 % of a lesson. Measured over 40 s of
   *               unattended driving it buries 0 controls on 6 of 6. Unchanged
   *               by this commit except that it no longer has an in-place
   *               expanded state to grow into.
   *   THE READ    this sheet. It takes the screen above the instrument band —
   *               and it MAY, because opening it STOPS THE CAR (the shell adds
   *               `overlaySheetOpen` to `SceneSlot`'s `paused`, which reaches
   *               `TouchControls` as `hidden` and makes every control inert).
   *               Nothing is buried, because while the clock is stopped there
   *               is nothing on the glass to bury.
   *
   * THE INVARIANT, stated so it can be tested rather than promised:
   *   ► WHILE THE SIM CLOCK IS RUNNING, NO LAYER OUTSIDE THE RIBBON'S CORRIDOR
   *     MAY INTERSECT THE CONTROL EDGES. The read mode is the only layer that
   *     covers them, and it exists only when the clock is stopped.
   * `shellViewportContract.test.ts` asserts both halves ship together; if a
   * future edit removes the pause, the test that guards the full-bleed geometry
   * fails with it, because the geometry is only legitimate WITH the pause.
   *
   * THE `⤢` EXPAND IS GONE. It existed to reach the tall case past a cap that
   * only existed because of the clearance; with neither, a toggle between „the
   * whole reading surface" and „the whole reading surface" is a control that
   * does nothing — which is one of the founder's own three complaints.
   *
   * WHY AN ATTRIBUTE ON <html> AND NOT A PROP. Two surfaces that must stand
   * down for this one live in trees this component cannot reach: the shell's
   * «Меню» button (measured buried on both 852 and 780 landscape profiles) and
   * anything a later wave adds to the same corner. `html[data-sim-*]` is the
   * grammar `data-sim-car-sheet`, `data-sim-camera` and `data-sim-glance`
   * already use for exactly this, and PlayAreaStyles is where the arbitration
   * is written down. It is BELT AND BRACES, not the mechanism: the pause is
   * the mechanism, and this covers the one control the pause cannot reach.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      delete root.dataset.simOverlayRead;
      return;
    }
    root.dataset.simOverlayRead = "open";
    return () => {
      delete root.dataset.simOverlayRead;
    };
  }, [open]);

  if (shown === null) return null;

  const color = TONE_COLOR[shown.tone];
  const hasDetail =
    (typeof shown.detailBg === "string" && shown.detailBg.trim().length > 0) ||
    shown.hasRichDetail === true;
  const hasAck = typeof shown.onAck === "function";
  // A6: the ✕ exists for everything the student is allowed to send away, which
  // is everything that is not holding the drive still…
  //
  // …AND IS NOT THE TASK ITSELF (doc 91 · C5/§I5(a)). The pre-drive line sat
  // 4 px from that ✕ and one miss removed it permanently — see `noDismiss` in
  // overlayQueue.ts for the measurement and for why `blocking` could not be
  // used instead. This is deliberately a property of the ITEM and not a new
  // rule about kinds: the owner declares „this one has no way back", which is
  // the only party that knows.
  const closable = !blocking && shown.noDismiss !== true;
  // …and when a card holds no OTHER control, the card itself is the button —
  // the `HudToasts` grammar, so the phone and the desktop dismiss the same way.
  const cardIsDismissButton = closable && !hasDetail && !hasAck;
  // There is no `interactive` flag any more, and its absence IS row A6's phone
  // half. It used to read `hasDetail || blocking`, and an ordinary line — a
  // task, a piece of guidance, a „Браво" — matched neither arm, so it rendered
  // with `pointer-events: none`, no control of any kind, and left only when its
  // TTL expired. Every peek is pointer-interactive now; `CARD_CLASS` carries
  // `pointer-events-auto touch-manipulation` unconditionally.
  //
  // The card is a COLUMN item, so this is a floor, not a fixed height: a wrapped
  // two-line task grows downward (which is what a notification does) instead of
  // clipping. Every card now carries at least a 44 px dismiss target, so the
  // floor is the thumb rule for all of them — `OVERLAY_PEEK_STATUS_HEIGHT_PX`
  // (30) described the card that could not be touched, and there is no longer
  // one.
  const minHeight = OVERLAY_PEEK_HEIGHT_PX;

  // `hud-ghost` — this is the peek, and the peek is an instrument line. It is
  // the direct counterpart of the reference's „Lap 1/1" and „Lap Time
  // 00:02.060": the words on the image, nothing behind them. The OPEN sheet
  // below is deliberately not a ghost — that one is the explicit pause where
  // the authored WHY and its law citation are read.
  //
  // ── 2026-08-03: THE OUTLINE CAME OFF. ─────────────────────────────────────
  // The review's first named piece of web furniture was this element: „the
  // briefing bar — a full-width rounded strip ending in a SOLID BRAND-BLUE
  // «Разбрах» button. THAT IS A COOKIE BANNER. His reference has PAUSE and VIEW
  // as two small translucent chips." He is not describing the words; he is
  // describing the STRIP. So the box went instead of the words: no border, no
  // radius to outline — a coloured tone glyph, a coloured chip and a line of
  // type on the road.
  const CARD_CLASS =
    "hud-ghost sim-overlay-in pointer-events-auto touch-manipulation flex w-full min-w-0 min-h-0 flex-col items-stretch gap-0.5 text-left";

  /* ══════════════════════════════════════════════════════════════════════════
     THE TEXT WINDOW — 2026-08-14. WHY THE LETTERS WERE CUT THROUGH THE WAIST.

     FOUNDER, BOTH ORIENTATIONS, HIS OWN PHONE: «Потегли по улицата и се движи»
     renders whole, and the line under it is a row of decapitated glyph-tops.
     Reproduced on all six profiles. It is NOT the screen's top edge — zero of
     432 text nodes have any rect above y = 0, and the top-edge band at device
     scale cuts nothing. The card does it to itself, and here is the chain,
     measured on the deployed build (852 × 393, `wave11-why-sliced.mjs`):

       [data-hud="notify-column"]  max-height 128 px
         └ the card                 flex column, height 128, shortfall 0
             ├ row 1  chip          ~18 px
             ├ row 2  `line-clamp-3`  wants  96 px · GIVEN 19.1 px
             ├ row 2b `line-clamp-6`  wants 257 px · GIVEN 41.9 px
             └ row 3  two 44 px chips

     The two text rows were the ONLY shrinkable items in that column, and they
     were shrinkable for a reason nobody had noticed: `line-clamp` compiles to
     `overflow: hidden`, and an overflow other than `visible` zeroes a flex
     item's AUTOMATIC MINIMUM SIZE. So the entire 353 px shortfall landed on
     them. 19.1 px of a 13.75 px line box is 1.38 lines — line 2 keeps 0.38 of
     its height and `overflow: hidden` guillotines it through the middle of the
     glyphs. On the 780 × 360 Samsung the headline is a 2.6 px sliver: gone.

     THREE THINGS CHANGE, AND EACH ONE IS LOAD-BEARING.

     1. THE SHORTFALL MOVES INTO A SCROLLER. The two rows go inside one
        `min-h-0 shrink overflow-y-auto` window and become `shrink-0`
        themselves. A flex item that cannot shrink is laid out at its natural
        height — a WHOLE number of line boxes — so nothing is ever asked to be
        1.38 lines tall again. Whatever does not fit is BELOW the fold instead
        of amputated, which is the difference between „there is more" and „this
        product is broken".

     2. THE CUT IS FADED, NOT GUILLOTINED. A scroller still ends where it ends,
        and its own bottom edge would cut the next line exactly as before. The
        mask turns those last 10 px into a fade, so a partly visible line reads
        as CONTINUING rather than as a rendering fault — and `padding-bottom`
        is the same 10 px, which is what keeps a text that FITS from being
        faded at all: scrolled to the end, the last line's box bottom sits on
        the fade's opaque edge. (Bottom padding joins the scrollable overflow
        in every engine this ships on; that is what makes the two numbers agree.)

     3. THE ELLIPSIS GOES WITH THE CLAMP. `line-clamp-3` / `line-clamp-6` were
        hiding 77 px and 215 px of authored Bulgarian behind „…" and telling
        the student nothing — 110 px of a 219-character headline and 333 px of
        a 556-character body on the founder's own frame. An ellipsis is a claim
        that the rest is not worth the space; under THEO-4 the rest is the
        lesson. A scroll window makes the same content REACHABLE, and «ПРОЧЕТИ»
        beside it opens the whole thing with the car stopped.

     WHY NOT „JUST GIVE THE CARD MORE ROOM". Because there is none, and the
     arithmetic is not arguable: in landscape the column's cap is
     `100% − TOUCH_CONTROLS_FLOOR − top` = 128 px of a 393 px stage, and what
     it is standing off is the DRIVING CONTROLS — this peek does not stop the
     car, so it may not paint over them. The cap's own comment says it was
     „measured against the 106.3 px worst card"; the card a scenario lesson
     actually raises wants ~400. The cap is correct arithmetic against content
     that does not ship, and the answer to that is not a bigger box on top of
     the road — the founder's note on this very defect ends „an instruction he
     can read but which hides the hazard it is about is a different failure."
     ══════════════════════════════════════════════════════════════════════════ */
  const TEXT_FADE_PX = 10;
  const textWindowStyle: CSSProperties = {
    // ── AND IT IS STILL A PEEK — 2026-08-14, the other half of his note.
    //
    // „AND MIND WHERE IT SITS: it is over the road. The founder's reference
    // keeps the centre clear. An instruction he can read but which hides the
    // hazard it is about is a different failure."
    //
    // Without a ceiling this window would take everything the column's cap
    // allows, and in PORTRAIT that cap is 403 px — 47 % of an 852 px screen,
    // because portrait has height to spare and the landscape arithmetic that
    // produced 128 never bit there. The card would go from 106 px to the full
    // 403 and hang down past the horizon (measured off his own frame: the road
    // starts at y ≈ 205), in the corridor beside the lane he is driving in.
    // Readable and in the way is not the trade he asked for.
    //
    // 8 rem = 128 px, and it is deliberately THE SAME NUMBER as the landscape
    // column cap (`100% − TOUCH_CONTROLS_FLOOR − top` at 852 × 393). One
    // constant, both orientations: the peek is never taller than the tightest
    // budget it has to survive, so it cannot grow into the picture on the
    // roomier axis. In landscape it does not bind — the column's own cap is
    // already the smaller of the two — so nothing about that orientation
    // changes except that the glyphs are whole.
    maxHeight: "8rem",
    // Both spellings: `mask-image` is unprefixed in current WebKit and
    // prefixed in the versions still on phones in this market.
    WebkitMaskImage: `linear-gradient(to bottom, #000 calc(100% - ${TEXT_FADE_PX}px), transparent)`,
    maskImage: `linear-gradient(to bottom, #000 calc(100% - ${TEXT_FADE_PX}px), transparent)`,
    paddingBottom: `${TEXT_FADE_PX}px`,
    // The card carries `touch-manipulation`; a window that scrolls has to say
    // which axis it owns, or the stage's gesture handling keeps the drag.
    touchAction: "pan-y",
    overscrollBehavior: "contain",
  };

  const cardBody = (
    <>
      {/* Row 1 — the tone glyph, the chip, the „+N" badge and (when the whole
          card is the dismiss button) the ✕ that says so. `shrink-0`: this row
          is 18 px of label and it is never what gives when the column is
          short — see THE TEXT WINDOW above. */}
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <ToneGlyph tone={shown.tone} frozen={frozen} />
        {shown.chipBg ? (
          <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-wider">
            {shown.chipBg}
          </span>
        ) : null}
        {queued > 0 ? (
          <span
            className="ml-auto shrink-0 rounded-full border border-border px-1.5 text-[10px] font-bold leading-[18px] text-muted"
            aria-label={`още ${queued} съобщения`}
          >
            +{queued}
          </span>
        ) : null}
        {cardIsDismissButton ? (
          <span className={`${queued > 0 ? "" : "ml-auto"} shrink-0 opacity-70`}>
            <DismissGlyph />
          </span>
        ) : null}
      </div>

      {/* ── THE TEXT WINDOW. Rows 2 and 2b live inside it and neither of them
             shrinks any more; the WINDOW is what gives when the column is
             short, and it gives by scrolling. The long block above this
             component's `cardBody` has the measurements. */}
      <div
        data-sim-overlay-text=""
        className="flex min-h-0 min-w-0 shrink flex-col gap-0.5 overflow-y-auto"
        style={textWindowStyle}
      >
        {/* Row 2 — THE LINE. No clamp: it is `shrink-0` inside the window, so it
            lays out at a whole number of line boxes and the window scrolls past
            it. „…" after four words is how a THEO-4 explanation turns back into
            a bare verdict, and `line-clamp-3` was doing exactly that to a
            219-character authored instruction. `break-words` because
            «Пътнотранспортно» is one unbreakable 16-letter word and the stage
            clips rather than scrolls (hud-card-fit.test.ts). */}
        <span className="min-w-0 shrink-0 break-words text-[11px] font-bold leading-tight text-foreground">
          {shown.lineBg}
        </span>

        {/* ══ ROW 2b — THE BODY, ON THE SCREEN, NOT BEHIND «ЗАЩО» ═══════════════
          *** THEO-4 — REQUIREMENT ZERO. THIS IS THE ROW THAT BREACHED IT. ***

          HIS WORDS: „THE CARDS SHOW BUTTONS AND NO TEXT." What he was looking
          at was this card with `detailBg` rendered NOWHERE — it appeared only
          inside the sheet at the bottom of this file, i.e. behind one press of
          «ЗАЩО» / «СПИСЪК». On a DESKTOP the same content renders inline (the
          pre-drive panel prints `instructionBg` in the pending-step card; the
          toast column prints the explanation under the line), so the phone was
          the one device where the reasoning was hidden — and it is the device
          with the least discoverable affordance for finding it.

          Requirement zero is founder-ratified and unconditional: no bare
          verdicts, ever; the student is owed the reasoning. A card whose BODY
          IS THE INSTRUCTION, hiding the instruction, is the plainest breach of
          it in the product. Wave 4 measured the collapse and never escalated
          it. It is not a layout preference and it is not negotiable against a
          height budget.

          SO THE BUDGET WAS SOLVED RATHER THAN PAID FOR WITH THE TEXT:
            · The column is ≤240 px on compact (`notifyColumn.ts`), and all
              thirteen pre-drive instructions are 55–95 characters — three
              lines at 11 px. They fit whole. Nothing is truncated in the case
              that produced the complaint.
            · `line-clamp-6` WAS the ceiling for the long ones — and it is gone
              as of 2026-08-14, because it was hiding 215 px of a 257 px body
              behind „…" and saying nothing. Six lines is not a „read more"
              when the reader is not told there are seventeen. The window
              above scrolls instead, and «ПРОЧЕТИ» opens the lot with the car
              stopped.
            · `whitespace-pre-line` so an authored list keeps its lines.
          It sits ABOVE the control row on purpose: the words are what the card
          is for, and the control beside it names what it opens.
          ══════════════════════════════════════════════════════════════════ */}
        {/* A <p>, deliberately: the UNPANEL register sets the ghost's face to
            MONO for instrument values and hands `:is(p, h1, h2, h3, blockquote)`
            back to the reading face. This is an authored sentence, so it is a
            paragraph — the same split every other authored line in this HUD
            already relies on. */}
        {shown.detailBg ? (
          <p
            data-sim-overlay-body=""
            className="min-w-0 shrink-0 whitespace-pre-line break-words text-[11px] font-semibold leading-snug text-muted"
          >
            {shown.detailBg}
          </p>
        ) : null}
      </div>

      {/* Row 3 — the controls, right-aligned under the words. Absent only on the
          card that IS a control. `shrink-0`, and that is the half of this fix
          that keeps it from being a trap: these two 44 px chips are the only
          way out of a blocking briefing, and a flex row that shrinks would put
          them under the fold of a card the student cannot scroll past. */}
      {cardIsDismissButton ? null : (
        <div className="mt-0.5 flex shrink-0 items-center justify-end gap-1">
          {hasDetail ? (
            <button
              type="button"
              {...tapWhy}
              aria-expanded={open}
              // 44 px in BOTH axes. A 24 px chip with a big label is the
              // touch-target violation this project already counts 19 of. This
              // and the ack beside it are a matched PAIR — same height, same
              // radius, same weight, one outlined and one lightly tinted.
              className="flex h-11 min-w-[2.75rem] shrink-0 touch-manipulation items-center justify-center rounded-full border px-2 text-[11px] font-black uppercase tracking-wider"
              style={{
                color,
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              }}
            >
              {open ? "▾" : (shown.openLabelBg ?? "Защо")}
            </button>
          ) : null}
          {blocking || hasAck ? (
            // THE ACK, as one of the reference's „two small translucent chips".
            //
            // `data-hud-ink` STAYS, and it is load-bearing: it exempts this
            // element from the UNPANEL sweep so the 18 % tint below survives
            // (`background-color: transparent !important` would otherwise win)
            // and the one control that clears a blocking line never becomes
            // invisible. Doc 87 rows C1/C2 are literally „«Разбрах» was not
            // tappable" — this must read as pressable.
            //
            // A6 widened the condition from `blocking` to „has an onAck": the
            // end-of-session line keeps its „Резултат" chip even after the
            // student has turned the automatic debrief off and the line has
            // stopped freezing the screen.
            <button
              type="button"
              data-hud-ink=""
              {...tapAck}
              className="flex h-11 min-w-[2.75rem] shrink-0 touch-manipulation items-center justify-center rounded-full border px-3 text-[11px] font-black uppercase tracking-wider text-foreground"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
              }}
            >
              {shown.ackLabelBg ?? "Разбрах"}
            </button>
          ) : null}
          {closable ? (
            // A6, the rich-card half: the ✕ as a third chip, the same 44 px in
            // both axes as its two neighbours. A blocking item never gets one —
            // it has an acknowledgement, and that is what clears it.
            //
            // ── IT PAINTED 0 % OF ITS OWN BOX, AND 0 % IS NOT QUIET, IT IS
            //    ABSENT — 2026-08-13, the control census.
            //
            // Every graded control on this screen is a GHOST: ~22 % ink of its
            // own box at 0.82 effective opacity, which is the register that lets
            // a control be findable without costing the road. This one measured
            // 0.0 % in both orientations, sitting next to «Защо» at 81.8 % — a
            // 44 px target a student has no way to see. The census's rule for it
            // is „give it ink or delete it": it is not graded, so it is allowed
            // to be quiet, but it is not allowed to be invisible.
            //
            // 12 % of the card's own tone, which is the ack chip's 18 % one step
            // down — the same colour, one register quieter, so the pair still
            // reads as „the loud one clears the line, the quiet one hides it".
            // `data-hud-ink` is what exempts it from the UNPANEL sweep, exactly
            // as the acknowledgement beside it does; without it the sweep's
            // `background-color: transparent !important` would put the 0 % back.
            <button
              type="button"
              data-hud-close=""
              data-hud-ink=""
              {...tapDismissChip}
              aria-label="Скрий известието"
              className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border text-muted"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              }}
            >
              <DismissGlyph />
            </button>
          ) : null}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* The compact overlay layer owns the rail while it speaks. A piece of
          SCENE chrome sits in the same corner and would put a second panel back
          on the screen the moment this one appeared — the exact bug being
          fixed. A CSS rule keyed on the shell's own attributes (the
          PlayAreaStyles precedent) keeps ONE definition of "compact" and needs
          no prop drilled through the 3D tree. It comes straight back when the
          line clears, which is most of the time.

          THE TIER PICKER USED TO BE THE SECOND SELECTOR HERE and is not any
          more: as of J-WAVE-3 it is `display: none` on every compact stage
          unconditionally (PlayAreaStyles — 255 px of segmented control does not
          fit a 167.5 px rail lane), so a rule that stood it down for a second
          could never match. Removed rather than left as dead CSS that reads
          like a live arbitration. The tier lives in the ⚙ sheet on a phone. */}
      <style>{`
        [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="telltale-pings"] {
          display: none;
        }
        @keyframes sim-overlay-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: none; }
        }
        .sim-overlay-in { animation: sim-overlay-in 180ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .sim-overlay-in { animation: none; }
        }
      `}</style>

      {/* ------------------------------------------------------------------
          PEEK — the RIGHT-EDGE NOTIFICATION COLUMN, small text, stacking down.

          It used to run `left: <menu button> … right: <inset>` — a rail. At
          852×393 that laid out 766 px of an 852 px screen: a strip of type
          across the whole top of the road, which is the thing the founder has
          now asked three times to have moved. The geometry comes from
          `notifyColumn.ts` so the shell's roomy column, this one and the CSS
          that pulls the scene-owned panels over are all the same numbers.

          It is replaced by, not stacked with, the open sheet: the sheet's own
          header already carries the same glyph and the same line, and „ONE
          overlay at a time" has to be true of this component before it can be
          true of the screen.
          ------------------------------------------------------------------ */}
      {open ? null : (
      <div
        data-sim-overlay={shown.kind}
        data-sim-overlay-state="peek"
        data-hud="notify-column"
        className="pointer-events-none absolute z-30 flex flex-col items-end"
        style={{
          top: NOTIFY_COLUMN_TOP_CSS_COMPACT,
          // ── THE FLANK LANE, 2026-08-14 · „FIX · FLANKS" ────────────────────
          // This column is the ONE surface that shares the throttle band's
          // corner, and „NOTHING may ever cover them" is a hard constraint on
          // that band. Sideways the two boxes shared x 741–785 on the founder's
          // phone and `elementFromPoint` answered THIS CARD at the centre of
          // all four mirror/dock stations — a thumb aimed at a graded mirror
          // glance pressed the briefing.
          //
          // The width the column gives up here it gets back in height:
          // PlayAreaStyles caps it against `notifyColumnFloorCss()`, which no
          // longer has to clear the band now that the lanes are disjoint. Its
          // LEFT edge does not move at all, so notifyColumn.ts's 0.60 contract
          // is untouched.
          //
          // A VARIABLE AND NOT A CONSTANT, and not a stylesheet rule either:
          // these two declarations are INLINE, so they outrank every selector —
          // the first attempt at this wave shipped a `@media` override that was
          // applied and then discarded by the cascade, and the sweep caught it.
          // The orientation split lives in TOUCH_BAND_CSS_VARS, where a media
          // query can exist; upright the lane is 0 and the separation is bought
          // with height instead.
          right: `calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${FLANK_LANE_VAR})`,
          width: `calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR})`,
        }}
      >
        {/* A6 — TWO SHAPES, AND THEY ARE THE DESKTOP'S TWO.
            A card with nothing else to press IS the dismiss button
            (`HudToasts`' grammar, same ✕ glyph, same „Скрий известието"); a card
            that already holds „Защо" / „Разбрах" cannot nest a button, so it
            gets the ✕ as a third chip in the control row instead. */}
        {cardIsDismissButton ? (
          <button
            type="button"
            data-hud-close=""
            data-sim-overlay-card="button"
            {...tapDismissCard}
            aria-label={`Скрий известието: ${shown.lineBg}`}
            className={CARD_CLASS}
            style={{ minHeight: `${minHeight}px`, color }}
          >
            {cardBody}
          </button>
        ) : (
          <div
            data-sim-overlay-card="panel"
            className={CARD_CLASS}
            style={{ minHeight: `${minHeight}px`, color }}
            role={blocking ? "alertdialog" : "status"}
            aria-live={blocking ? "assertive" : "polite"}
            aria-label={`${shown.chipBg ? `${shown.chipBg} — ` : ""}${shown.lineBg}`}
          >
            {cardBody}
          </div>
        )}
      </div>
      )}

      {/* ------------------------------------------------------------------
          OPEN — the explicit pause. A bottom sheet that stops ABOVE the
          instrument band (`--sim-dash-h`, written by the play shell from the
          same constant the band is sized with, so the two cannot drift), never
          a full-bleed modal, and it scrolls inside itself rather than growing.
          Reached only by a tap, which is the one case the budget allows to be
          large — and it is where THEO-4's authored WHY lives in full.
          ------------------------------------------------------------------ */}
      {open ? (
        <div
          data-sim-overlay={shown.kind}
          data-sim-overlay-state="open"
          data-hud="overlay-read"
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center"
          // ── THE READ MODE'S ONE CLEARANCE: the instrument band, and nothing
          // else. See the block at `data-sim-overlay-read` above for why.
          //
          // It used to be `calc(var(--sim-dash-h) + var(--sim-touch-floor))` —
          // standing clear of the thumb band. That was the right answer to the
          // wrong question: it left 95 px on his phone sideways, which is a box
          // whose own «Разбрах» is clipped by it (measured, screenshot in
          // tools/mobile/.out/wave8-census/shots/), and it STILL buried the top
          // rail on 6 of 6 profiles because an 88 px box anchored at the bottom
          // and grown upward lands exactly on the rail's band.
          //
          // There is no thumb band to clear now: opening this sheet stops the
          // car, and a stopped car's controls are inert. The instrument band
          // stays because the speed and the gear are what a student checks the
          // sentence AGAINST — and because it is 40 px, not 260.
          style={{ bottom: "var(--sim-dash-h, 0px)" }}
          role="dialog"
          aria-modal="true"
          aria-label={shown.lineBg}
        >
          <section
            className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 overflow-hidden rounded-t-2xl border-x border-t bg-background/95 px-3 pb-2 pt-2 backdrop-blur"
            style={{
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              // ── §I11, half 2 — THE CAP, AND THE `max()` IS THE HONEST PART.
              //
              // The clearance alone is not the fix and the first attempt at it
              // proved the point the hard way: standing on the thumb band and
              // still asking for `--sim-vh × 0.62` pushed the sheet off the TOP
              // instead of the bottom. Measured on the deployed product with
              // the clearance in and this cap not yet right — iPhone 16
              // landscape, «Затвори» and «Разгъни панела» 123.5 px ABOVE the
              // safe-area box, and the overlap with the controls went UP
              // (9 680 → 12 276 px²) because a box anchored only by `bottom:`
              // grows upward and the header row cannot shrink.
              //
              // ONE CAP NOW, AND IT IS THE WHOLE SCREEN ABOVE THE INSTRUMENTS.
              // The old one was `max(5.5rem, min(0.62 × vh, vh − dash − touch
              // floor − 0.75rem))`, i.e. 95.5 px on his phone sideways: a
              // header and one scrolling line, with «Разбрах» clipped off the
              // bottom. Both of the numbers that made it small are gone — 0.62
              // was a budget against a road the student is no longer driving,
              // and `--sim-touch-floor` was a clearance against controls that
              // are inert while this is up. `--sim-vh` is the shell's measured
              // visual-viewport height, so this cannot overrun the top edge the
              // way the first attempt at §I11 did (measured once, deployed:
              // «Затвори» 123.5 px above the safe-area box).
              maxHeight: "calc(var(--sim-vh, 100dvh) - var(--sim-dash-h, 0px) - 0.75rem)",
            }}
          >
            {/* ══ THE READ MODE'S OWN HEADER WAS A FRAGMENT — 2026-08-14 ══════
                This row used to carry the line as a `truncate`-d heading, and
                on the deployed build it ate 146 of the 219 characters of the
                instruction it was heading — «…По тъмно първо про…», one third
                of the line, with an ellipsis. This is the surface a student is
                SENT TO because the peek could not finish printing; a read mode
                whose title is itself cut off is the defect one level deeper,
                and it was in the frame nobody had opened.

                So the title stops living in a fixed-height row and joins the
                SCROLLING body below, where a 412-character exam complication
                (the worst in the shipped corpus) is simply the first paragraph
                of what the student came here to read. What stays here is the
                tone glyph, the card's own chip — «ИНСТРУКЦИИ», a label, always
                short — and the ✕. Nothing in this row can now be too long for
                it, which is the only way a header row is honest.

                The dialog keeps `aria-label={lineBg}`, so a screen reader still
                announces the sheet by its sentence and loses nothing. ══════ */}
            <div className="flex shrink-0 items-center gap-2">
              <span style={{ color }}>
                <ToneGlyph tone={shown.tone} frozen={false} />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-wider"
                style={{ color }}
              >
                {shown.chipBg ?? ""}
              </span>
              {/* «⤢ Разгъни панела» STOOD HERE AND IS DELETED, NOT MOVED.
                  It was the escape hatch from a height cap, and the cap is
                  gone: this surface is already the whole screen above the
                  instrument band. A 44 px control that toggles between one
                  size and the same size is the founder's own „a button that
                  does nothing and says nothing about why", and it was costing
                  the header a third of its width on a 360 px phone. */}
              <button
                type="button"
                {...tapCloseSheet}
                aria-label="Затвори"
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border text-sm font-black text-muted"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {/* `min-h-0` is what makes the cap above real: without it a flex
                column item refuses to shrink below its content, so the section
                overflows its own `max-height` and the box grows off the top of
                the screen — which is precisely the regression measured when
                this clearance first shipped. */}
            <div className="min-h-0 min-w-0 shrink overflow-y-auto">
              {/* The sentence the peek could not finish, in full and first. */}
              <h2 className="break-words text-sm font-extrabold leading-snug text-foreground">
                {shown.lineBg}
              </h2>
              {/* ── `whitespace-pre-line`, AND IT WAS MISSING HERE FOR THE WHOLE
                     LIFE OF THIS SHEET. The card's own body has carried it since
                     row 2b landed; this copy did not, so a five-step briefing
                     arrived as ONE run-on paragraph — photographed 2026-08-13,
                     iPhone 16 landscape: „…дали да стъпи. 2. Видиш ли пешеходната
                     пътека, вдигни… 3. Стъпи ли пешеходец…" with no break
                     anywhere. The steps are authored as a numbered list and the
                     one surface that shows all of them was the one that threw
                     the numbering's shape away. */}
              {shown.detailBg ? (
                <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-snug text-foreground">
                  {shown.detailBg}
                </p>
              ) : null}
              {shown.lawRef ? (
                <span className="mt-1.5 inline-block rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                  {shown.lawRef}
                </span>
              ) : null}
              {renderDetail ? <div className="mt-2">{renderDetail(shown)}</div> : null}
            </div>

            {blocking ? (
              <button
                type="button"
                {...tapSheetAck}
                className="btn-accent w-full shrink-0 justify-center py-3 text-sm"
              >
                {shown.ackLabelBg ?? "Разбрах"}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
