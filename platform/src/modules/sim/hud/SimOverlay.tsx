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
  type ReactNode,
} from "react";
import {
  OVERLAY_PEEK_HEIGHT_PX,
  type SimOverlayItem,
  type SimOverlayTone,
} from "./overlayQueue";
import {
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
  /**
   * ── DOC 91 · D4/C4/§I11 — THE SHEET STOOD ON THE DRIVING CONTROLS ─────────
   *
   * The sheet's clearance contract was `bottom: var(--sim-dash-h)` — the 40 px
   * instrument band — and the band it actually has to clear is the THUMB BAND,
   * which is ~216 px on an 852×393 phone. §D4 named the fix and the reason it
   * was never applied: „`TouchControls` already publishes the number that would
   * have prevented it, and `SimOverlay` does not read it."
   *
   * Measured on the DEPLOYED product before this change (tools/mobile/wave6-edges.mjs,
   * authenticated /simulator, live canvas asserted, six-profile ladder, the
   * sheet opened by its own «Защо»/«СПИСЪК» chip exactly as a student opens it):
   *
   *     iPhone 16 landscape  9 680 px² of 44 px controls under the sheet, 3 of 10 DEAD
   *     iPhone 16 portrait   7 920 px²,                                    4 of 10 DEAD
   *
   * „Dead" is `document.elementFromPoint` at a control's own centre answering
   * with the sheet — «Мигач наляво» and «Поглед в дясното огледало» among them,
   * i.e. two GRADED actions.
   *
   * AND §I11 IS HONEST THAT THE CLEARANCE ALONE IS NOT THE FIX. Standing on the
   * thumb band leaves ~137 px, not 244, so a sheet that kept asking for
   * `--sim-vh × 0.62` would simply be pushed off the TOP of the screen. Hence
   * the two halves below, which have to ship together:
   *
   *   1. the height cap is now the smaller of „0.62 of the viewport" and „what
   *      is actually left above the controls", so the sheet can never overrun
   *      either edge, and it already scrolls inside itself — nothing is lost,
   *      it is read by scrolling;
   *   2. an explicit «⤢» expand, because §I11's own ruling is that the tall
   *      case must remain reachable and MAY cover the controls — „because the
   *      student asked for it". Expanded, the sheet drops the clearance and
   *      takes the height above the instrument band, which is the old geometry,
   *      now reached deliberately instead of by default.
   *
   * It resets on close: an expand is a decision about ONE reading, not a mode.
   */
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const tapExpandSheet = useTapActivation(() => setSheetExpanded((v) => !v));
  useEffect(() => {
    if (!open) setSheetExpanded(false);
  }, [open]);
  const tapSheetAck = useTapActivation(acknowledge);

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
    "hud-ghost sim-overlay-in pointer-events-auto touch-manipulation flex w-full min-w-0 flex-col items-stretch gap-0.5 text-left";

  const cardBody = (
    <>
      {/* Row 1 — the tone glyph, the chip, the „+N" badge and (when the whole
          card is the dismiss button) the ✕ that says so. */}
      <div className="flex min-w-0 items-center gap-1.5">
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

      {/* Row 2 — THE LINE. `line-clamp-3` and not `truncate`: in a column the
          sentence has somewhere to go, and „…" after four words is how a THEO-4
          explanation turns back into a bare verdict. `break-words` because
          «Пътнотранспортно» is one unbreakable 16-letter word and the stage
          clips rather than scrolls (hud-card-fit.test.ts). */}
      <span className="line-clamp-3 min-w-0 break-words text-[11px] font-bold leading-tight text-foreground">
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
            · `line-clamp-6` is the ceiling for the long ones (a five-step
              briefing, a teach moment's authored WHY). Six lines ≈ 84 px in
              the RIGHT-EDGE corridor he drew himself — never the middle of the
              road — and the sheet still holds the full text, the lawRef and
              any rich detail. A visible six-line body with more behind a
              labelled control is a „read more"; zero lines with everything
              behind it is what he photographed.
            · `whitespace-pre-line` so an authored list keeps its lines.
          It sits ABOVE the control row on purpose: the words are what the card
          is for, and «Защо» is now „see the citation", not „see the text".
          ══════════════════════════════════════════════════════════════════ */}
      {/* A <p>, deliberately: the UNPANEL register sets the ghost's face to
          MONO for instrument values and hands `:is(p, h1, h2, h3, blockquote)`
          back to the reading face. This is an authored sentence, so it is a
          paragraph — the same split every other authored line in this HUD
          already relies on. */}
      {shown.detailBg ? (
        <p
          data-sim-overlay-body=""
          className="line-clamp-6 min-w-0 whitespace-pre-line break-words text-[11px] font-semibold leading-snug text-muted"
        >
          {shown.detailBg}
        </p>
      ) : null}

      {/* Row 3 — the controls, right-aligned under the words. Absent only on the
          card that IS a control. */}
      {cardIsDismissButton ? null : (
        <div className="mt-0.5 flex items-center justify-end gap-1">
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
            <button
              type="button"
              data-hud-close=""
              {...tapDismissChip}
              aria-label="Скрий известието"
              className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border text-muted"
              style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
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
          right: NOTIFY_COLUMN_RIGHT_CSS,
          width: NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
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
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center"
          // §I11, half 1 — the clearance. `--sim-touch-floor` is published by
          // the play shell from `TOUCH_CONTROLS_FLOOR` (the constant the arc and
          // the pads are laid out from), so this follows the thumb band wherever
          // it goes instead of pinning a copy of today's number — the same rule
          // that constant's own comment states. It is `0px` on every surface
          // without a thumb band, so nothing roomy moves.
          style={{ bottom: sheetExpanded ? "var(--sim-dash-h, 0px)" : "calc(var(--sim-dash-h, 0px) + var(--sim-touch-floor, 0px))" }}
          role="dialog"
          aria-modal="true"
          aria-label={shown.lineBg}
        >
          <section
            className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-t-2xl border-x border-t bg-background/95 px-3 pb-2 pt-2 backdrop-blur"
            style={{
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              // §I11, half 2 — the cap. `min()` of the old budget and the room
              // that is actually there. The 3.5rem is the sheet's own top gutter
              // plus the notification column's first line, so an expanded sheet
              // still cannot bury the line that named it.
              maxHeight: sheetExpanded
                ? "calc(var(--sim-vh, 100dvh) - var(--sim-dash-h, 0px) - 3.5rem)"
                : "min(calc(var(--sim-vh, 100dvh) * 0.62), calc(var(--sim-vh, 100dvh) - var(--sim-dash-h, 0px) - var(--sim-touch-floor, 0px) - 3.5rem))",
            }}
          >
            <div className="flex shrink-0 items-center gap-2">
              <span style={{ color }}>
                <ToneGlyph tone={shown.tone} frozen={false} />
              </span>
              <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold leading-tight">
                {shown.lineBg}
              </h2>
              {/* §I11 — the tall case, on purpose. 44 px in both axes like its
                  neighbour, and it carries its state in `aria-expanded` so a
                  screen reader gets the same fact the glyph gives. */}
              <button
                type="button"
                {...tapExpandSheet}
                aria-expanded={sheetExpanded}
                aria-label={sheetExpanded ? "Смали панела" : "Разгъни панела"}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border text-sm font-black text-muted"
              >
                <span aria-hidden>{sheetExpanded ? "⤡" : "⤢"}</span>
              </button>
              <button
                type="button"
                {...tapCloseSheet}
                aria-label="Затвори"
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border text-sm font-black text-muted"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            <div className="min-w-0 shrink overflow-y-auto">
              {shown.detailBg ? (
                <p className="text-xs leading-snug text-foreground">{shown.detailBg}</p>
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
