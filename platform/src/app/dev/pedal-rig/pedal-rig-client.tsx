"use client";

/**
 * Client half of the pedal rig. See page.tsx for what is real here and what is
 * faked (exactly one boolean).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TouchControls } from "@/components/sim/TouchControls";
import { TouchInputSource } from "@/modules/sim/engine";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import type { VehicleInput } from "@/modules/sim/vehicle";

interface Axis {
  throttle: number;
  brake: number;
  steer: number;
}

interface RigApi {
  axis: () => Axis;
  hidden: () => boolean;
  card: (up: boolean) => void;
  padBox: () => DOMRect | null;
  /** Which build of the component is mounted. Only ever "fixed" today; it is
   *  read back by `tools/mobile/pedal-ab.mjs` so that an A/B run against a
   *  pre-fix build (see that file's header for the four-line recipe) can never
   *  mis-attribute its own result to the wrong arm. */
  variant: () => "fixed" | "prefix";
  log: () => string[];
  clear: () => void;
}

declare global {
  interface Window {
    __pedalRig?: RigApi;
  }
}

const ZERO: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: false };

export function PedalRigClient() {
  const [touch] = useState(() => new TouchInputSource());
  const [cardUp, setCardUp] = useState(false);
  const [axis, setAxis] = useState<Axis>({ throttle: 0, brake: 0, steer: 0 });
  const cabinRef = useRef<CabinControls | null>(null);
  const logRef = useRef<string[]>([]);
  const cardUpRef = useRef(false);
  const armedRef = useRef(false);
  useEffect(() => {
    cardUpRef.current = cardUp;
  }, [cardUp]);

  /** The card's delay after the first throttle, ms. 1200 is the seatbelt teach
   *  moment's own measured timing (doc 91 §C1) — the point being that it fires
   *  while the thumb is still on the gas. `?card=0` disables the auto-raise. */
  const autoMsRef = useRef<number>(1200);
  useEffect(() => {
    const raw = new URL(window.location.href).searchParams.get("card");
    if (raw !== null) autoMsRef.current = Number(raw);
  }, []);

  /** THE A/B'S ONE VARIABLE, and the one thing this page will not guess at.
   *
   *  `?variant=prefix` asks for the PRE-FIX component — the shipped file with
   *  doc 91 §I1 and §I3 reverted and nothing else touched. That build is NOT in
   *  the tree (a 1,600-line copy of a live component rots in a day); the recipe
   *  to recreate it, and the numbers it produced, are in the header of
   *  `tools/mobile/pedal-ab.mjs`. Asking for it without recreating it must be
   *  loud, because a pre-fix arm that silently ran the FIXED build would report
   *  the bug as unreproducible. */
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("variant") === "prefix") {
      console.error(
        "[pedal-rig] ?variant=prefix: the pre-fix build is not in the tree — see " +
          "tools/mobile/pedal-ab.mjs for how to recreate it. This page is the FIXED build.",
      );
    }
  }, []);

  const note = useCallback((line: string) => {
    logRef.current.push(`${performance.now().toFixed(0)} ${line}`);
    if (logRef.current.length > 400) logRef.current.shift();
  }, []);

  // The axis, read exactly the way SimInput.read() reads it.
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const out: VehicleInput = { ...ZERO };
      touch.mergeInto(out);
      const next = { throttle: out.throttle, brake: out.brake, steer: out.steer };
      const key = `${next.throttle.toFixed(2)}/${next.brake.toFixed(2)}/${next.steer.toFixed(2)}`;
      if (key !== last) {
        last = key;
        note(`axis ${key}`);
        setAxis(next);
      }
      // The auto-card: once the student is actually accelerating, interrupt.
      if (!armedRef.current && next.throttle > 0.05 && autoMsRef.current > 0) {
        armedRef.current = true;
        note(`card armed at throttle ${next.throttle.toFixed(2)}`);
        window.setTimeout(() => {
          note("card up (auto)");
          setCardUp(true);
        }, autoMsRef.current);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [touch, note]);

  useEffect(() => {
    const api: RigApi = {
      axis: () => {
        const out: VehicleInput = { ...ZERO };
        touch.mergeInto(out);
        return { throttle: out.throttle, brake: out.brake, steer: out.steer };
      },
      hidden: () => cardUpRef.current,
      card: (up: boolean) => {
        note(`card ${up ? "up" : "down"} (script)`);
        armedRef.current = true; // a scripted card disarms the automatic one
        setCardUp(up);
      },
      padBox: () => {
        const pads = document.querySelectorAll('[data-hud="touch-controls"] [role="slider"]');
        const drive = pads[1] as HTMLElement | undefined;
        return drive ? drive.getBoundingClientRect() : null;
      },
      variant: () => "fixed",
      log: () => [...logRef.current],
      clear: () => {
        logRef.current = [];
        armedRef.current = false;
      },
    };
    window.__pedalRig = api;
    return () => {
      delete window.__pedalRig;
    };
  }, [touch, note]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#20303a] text-foreground">
      {/* Something to look at, so a screenshot shows whether the pads paint. */}
      <div className="absolute inset-x-0 top-0 flex flex-col gap-1 p-3 text-[12px] font-mono">
        <div>ПЕДАЛ-РИГ · the real TouchControls, one faked boolean</div>
        <div data-rig="axis">
          throttle {axis.throttle.toFixed(2)} · brake {axis.brake.toFixed(2)} · steer{" "}
          {axis.steer.toFixed(2)}
        </div>
        <div data-rig="hidden">hidden={String(cardUp)}</div>
        <div data-rig="variant">variant=fixed</div>
        <button
          type="button"
          className="w-32 rounded bg-accent px-2 py-1 text-background"
          onPointerDown={() => setCardUp((v) => !v)}
        >
          картa ⟷
        </button>
      </div>

      <TouchControls
        touch={touch}
        cabinRef={cabinRef}
        hidden={cardUp}
        onToggleCamera={() => undefined}
        onPause={() => setCardUp(true)}
        onReset={() => undefined}
        onToggleFullscreen={null}
      />

      {/* The card. Same shape as the real ones: a full-screen scrim over the
          canvas with a dismiss button, and it is what `hidden` is derived from. */}
      {cardUp ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-surface p-6">
            <p className="text-sm">УЧЕБЕН МОМЕНТ · Движение без предпазен колан</p>
            <button
              type="button"
              data-rig="dismiss"
              className="rounded bg-accent px-4 py-2 text-background"
              onPointerDown={() => {
                note("card down (РАЗБРАХ)");
                setCardUp(false);
              }}
            >
              РАЗБРАХ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
