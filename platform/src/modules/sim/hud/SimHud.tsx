"use client";

import { useEffect, useState, type RefObject } from "react";
import type { SimTelemetry } from "../engine";

/**
 * In-sim HUD: speed, gear, FPS. Overlays the canvas (absolute, bottom-left)
 * using the dashboard design tokens. Polls the mutable telemetry ref a few
 * times per second instead of re-rendering at frame rate.
 */
export function SimHud({ telemetryRef }: { telemetryRef: RefObject<SimTelemetry> }) {
  const [snap, setSnap] = useState({ speed: 0, gear: "N", fps: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      const telemetry = telemetryRef.current;
      setSnap({
        speed: Math.round(Math.abs(telemetry.speedKmh)),
        gear: telemetry.gear,
        fps: Math.round(telemetry.fps),
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [telemetryRef]);

  const fpsTone =
    snap.fps === 0
      ? "text-muted"
      : snap.fps >= 50
        ? "text-success"
        : snap.fps >= 30
          ? "text-warning"
          : "text-danger";

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-stretch gap-2 select-none">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface/85 px-4 py-2.5 backdrop-blur">
        <span className="text-3xl font-black leading-none tabular-nums text-foreground">
          {snap.speed}
        </span>
        <span className="pb-0.5 text-xs font-semibold text-muted">км/ч</span>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/85 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Предавка</span>
        <span className="text-lg font-black leading-none text-accent">{snap.gear}</span>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/85 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">FPS</span>
        <span className={`text-lg font-black leading-none tabular-nums ${fpsTone}`}>
          {snap.fps || "—"}
        </span>
      </div>
    </div>
  );
}
