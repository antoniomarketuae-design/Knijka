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

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createCameraAidHintState,
  observeCameraAidHint,
  type CameraAidHintPhase,
} from "./overheadHint";
import type { DashboardStatus } from "./dashboardStatus";

/** Poll period (ms). The cue reacts to a gear selection, not to a frame. */
const POLL_MS = 200;

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

  if (hidden || phase === "off") return null;
  const done = phase === "done";

  return (
    <div
      className="pointer-events-none absolute bottom-[11rem] left-1/2 z-10 -translate-x-1/2 select-none"
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
        <div className="camera-aid-out flex items-center gap-1.5 rounded-full border border-success/50 bg-background/70 px-3 py-1.5 text-[11px] font-bold text-success backdrop-blur">
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
          className="camera-aid-in pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 text-[11px] font-semibold text-muted backdrop-blur transition hover:!opacity-100 hover:border-accent/60 hover:text-foreground disabled:cursor-default motion-reduce:transition-none"
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
