"use client";

/**
 * „Поглед отгоре" cue — the visible half of `cameraAidHint.ts` (founder
 * 2026-07-30, ledger 86 D11: „Press G for Eagle View … low brightness and low
 * contrast so it assists new users without distracting experienced ones").
 *
 * Self-contained, the RearProximityCue pattern: it polls the shared
 * DashboardStatus channel the scene already writes each frame (for the gear
 * selector) plus a caller-supplied „am I in top-down" reader, at a low Hz —
 * no frame-loop wiring, no grading read or write, nothing added to the tick
 * stream.
 *
 * MOUSE-FIRST, like everything else in this lane: the founder wrote „Press G",
 * but a lane whose whole subject is demoting the keyboard cannot answer him
 * with a key. The cue is a BUTTON that switches the view; the „G" cap rides
 * along as the advanced alternative. If the host gives no `onEnterTopdown`,
 * it degrades to the plain low-contrast label he described.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createCameraAidHintState,
  observeCameraAidHint,
  type CameraAidHintPhase,
} from "./overheadHint";
import type { DashboardStatus } from "./dashboardStatus";

/** Poll period (ms). The cue reacts to a gear selection, not to a frame. */
const POLL_MS = 200;

/**
 * ── ROW B13, 2026-07-30. THE CUE LANDED ON THE DEMONSTRATION DECK. ──────────
 *
 * The cue itself works — the auditor found it on „Тясно гнездо" L1, on screen
 * the moment R is selected, exactly as asked. Where it landed is the defect:
 * `bottom-[11rem]` is 176 px, and the L1 demonstration player occupies that
 * band, so «ДЕМОНСТРАЦИЯ — СЛЕДВАЙ СЯНКАТА» and «Тясно е — виж мястото отгоре
 * G» were printed on top of each other, character for character, at the cue's
 * 0.62 opacity. Neither was readable. And the cue is only ALLOWED on rungs ≤ 3
 * (overheadHint.ts) — precisely the rungs that carry the demo player, so this
 * was not an unlucky combination, it was the normal case.
 *
 * 176 px is also inside the touch band on a phone: TouchControls' drive pad
 * reaches 176 px + the bottom inset, so the same constant put a `pointer-
 * events-auto` button on the throttle.
 *
 * So the cue stops guessing and measures. Every frame it might collide with,
 * it asks for: the demonstration deck (`data-hud="demo-deck"`, the handle
 * PlayAreaStyles already steers by) and the two touch sliders. It parks itself
 * a gap above the HIGHEST of them, or at 176 px when the screen below it is
 * empty. Measuring beats another hard-coded rem: the deck's own floor already
 * differs between roomy and compact, and a third copy of that number here would
 * be the fourth place it is written down.
 */
const CUE_FALLBACK_BOTTOM_PX = 176;
/** Breathing room between the cue and whatever it is standing on. */
const CUE_GAP_PX = 10;
/** Never climb past this share of the play area — a cue at the horizon is a
 *  different kind of wrong from a cue on the deck. */
const CUE_MAX_BOTTOM_FRACTION = 0.55;

/** Elements this cue must not sit on top of. */
const CUE_OBSTACLES = '[data-hud="demo-deck"], [data-hud="touch-controls"] [role="slider"]';

export function CameraAidHint({
  statusRef,
  /** True while the cue may run at all (`cameraAidHintEligible`, hoisted to
   *  the caller so this component never re-derives it per poll). */
  eligible,
  /** Live read of the camera view — LessonScene owns the mode ref. */
  readIsTopdown,
  /** Hidden while any pause/quiz/teach/end overlay is up. */
  hidden,
  /** Switch to the overhead view with the mouse. Absent = label only. */
  onEnterTopdown,
  /** Show the keyboard alternative (suppressed on touch-only devices). */
  showKeyHint = true,
}: {
  statusRef: RefObject<DashboardStatus | null>;
  eligible: boolean;
  readIsTopdown: () => boolean;
  hidden: boolean;
  onEnterTopdown?: () => void;
  showKeyHint?: boolean;
}) {
  const stateRef = useRef(createCameraAidHintState());
  const readRef = useRef(readIsTopdown);
  readRef.current = readIsTopdown;
  const [phase, setPhase] = useState<CameraAidHintPhase>("off");

  useEffect(() => {
    if (!eligible) return;
    const dtSec = POLL_MS / 1000;
    const s = stateRef.current;
    const id = window.setInterval(() => {
      const status = statusRef.current;
      if (status === null) return;
      const changed = observeCameraAidHint(s, {
        gearLabel: status.gearLabel,
        topdown: readRef.current(),
        dtSec,
      });
      if (changed) setPhase(s.phase);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [eligible, statusRef]);

  // ── B13: park above whatever is already in the bottom band. ───────────────
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [bottomPx, setBottomPx] = useState(CUE_FALLBACK_BOTTOM_PX);
  const measure = useCallback(() => {
    const host = hostRef.current;
    const parent = host?.offsetParent as HTMLElement | null;
    if (!host || !parent) return;
    const area = parent.getBoundingClientRect();
    if (area.height <= 0) return;
    let want = CUE_FALLBACK_BOTTOM_PX;
    for (const el of Array.from(parent.querySelectorAll(CUE_OBSTACLES))) {
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      want = Math.max(want, area.bottom - r.top + CUE_GAP_PX);
    }
    const next = Math.round(Math.min(want, area.height * CUE_MAX_BOTTOM_FRACTION));
    setBottomPx((prev) => (prev === next ? prev : next));
  }, []);

  const visible = !hidden && phase !== "off";
  useEffect(() => {
    if (!visible) return;
    measure();
    // The deck opens, closes and changes floor between roomy and compact, and
    // the pads resize with the viewport. Cheap poll, transitions only.
    const id = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [visible, measure]);

  if (!visible) return null;
  const done = phase === "done";

  return (
    <div
      ref={hostRef}
      style={{ bottom: `${bottomPx}px` }}
      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 select-none"
      role="status"
      aria-label={
        done
          ? "Изгледът отгоре е включен"
          : "Съвет: включи изглед отгоре, за да виждаш мястото за паркиране"
      }
    >
      <style>{`
        @keyframes camera-aid-in { from { opacity: 0; } to { opacity: 0.62; } }
        @keyframes camera-aid-out { from { opacity: 0.75; } to { opacity: 0; visibility: hidden; } }
        .camera-aid-in  { animation: camera-aid-in 0.9s ease-out both; }
        .camera-aid-out { animation: camera-aid-out 1.4s ease-out 0.5s both; }
        @media (prefers-reduced-motion: reduce) {
          .camera-aid-in  { animation: none; opacity: 0.62; }
          .camera-aid-out { animation: none; opacity: 0; visibility: hidden; }
        }
      `}</style>
      {done ? (
        <div className="hud-ghost camera-aid-out flex items-center gap-1.5 rounded-full border border-success/50 px-3 py-1.5 text-[11px] font-bold text-success">
          <span aria-hidden>✓</span>
          <span>изглед отгоре</span>
        </div>
      ) : (
        <button
          type="button"
          disabled={onEnterTopdown === undefined}
          onClick={onEnterTopdown}
          // Low brightness / low contrast by request: 0.62 opacity, muted ink,
          // no glow. It brightens only under the pointer.
          className="hud-ghost camera-aid-in pointer-events-auto flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:!opacity-100 hover:border-accent/60 hover:text-foreground disabled:cursor-default motion-reduce:transition-none"
        >
          <span aria-hidden>⌖</span>
          <span>Тясно е — виж мястото отгоре</span>
          {showKeyHint ? (
            <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold">
              G
            </kbd>
          ) : null}
        </button>
      )}
    </div>
  );
}
