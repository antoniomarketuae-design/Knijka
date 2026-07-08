"use client";

import { useEffect, useState, type RefObject } from "react";
import type { CabinControls, HeadlightSetting, IndicatorSetting, MirrorGlanceKind } from "./cabin";
import type { SimAudio } from "./simAudio";

interface Snap {
  indicator: IndicatorSetting;
  headlights: HeadlightSetting;
  seatbeltOn: boolean;
  night: boolean;
  glance: MirrorGlanceKind | null;
  muted: boolean;
  volume: number;
  audioOn: boolean;
}

const IDLE_SNAP: Snap = {
  indicator: "off",
  headlights: "off",
  seatbeltOn: false,
  night: false,
  glance: null,
  muted: false,
  volume: 0.5,
  audioOn: false,
};

function Chip({
  keys,
  label,
  active,
  tone = "accent",
}: {
  keys: string;
  label: string;
  active: boolean;
  tone?: "accent" | "warning" | "danger";
}) {
  const activeTone =
    tone === "warning"
      ? "border-warning text-warning"
      : tone === "danger"
        ? "border-danger text-danger"
        : "border-accent text-accent";
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border bg-surface/85 px-2 py-1 backdrop-blur transition-colors ${
        active ? activeTone : "border-border text-muted"
      }`}
    >
      <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10px] font-bold text-foreground">
        {keys}
      </kbd>
      <span className="text-[11px] font-semibold">{label}</span>
    </span>
  );
}

/**
 * Cabin overlay: key-hint chips (mirror glances, indicators, lights, belt,
 * night preview) reflecting live cabin state, plus the sound controls
 * (mute + volume). Polls the mutable cabin/audio refs a few times per second
 * — same pattern as SimHud, zero re-renders at frame rate.
 */
export function CabinHud({
  cabinRef,
  audioRef,
}: {
  cabinRef: RefObject<CabinControls | null>;
  audioRef: RefObject<SimAudio | null>;
}) {
  const [snap, setSnap] = useState<Snap>(IDLE_SNAP);

  useEffect(() => {
    const id = window.setInterval(() => {
      const cabin = cabinRef.current;
      const audio = audioRef.current;
      setSnap({
        indicator: cabin?.indicator ?? "off",
        headlights: cabin?.headlights ?? "off",
        seatbeltOn: cabin?.seatbeltOn ?? false,
        night: cabin?.nightPreview ?? false,
        glance: cabin?.glanceMirror ?? null,
        muted: audio?.muted ?? false,
        volume: audio?.volume ?? 0.5,
        audioOn: audio?.unlocked ?? false,
      });
    }, 150);
    return () => window.clearInterval(id);
  }, [cabinRef, audioRef]);

  const lightsLabel =
    snap.headlights === "off" ? "фарове" : snap.headlights === "low" ? "къси" : "дълги";

  return (
    <>
      {/* Sound controls — the only interactive part (also an unlock gesture). */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-border bg-surface/85 px-3 py-2 backdrop-blur select-none">
        <button
          type="button"
          className="text-sm font-bold text-foreground"
          aria-label={snap.muted ? "Пусни звука" : "Заглуши звука"}
          title="Звук (M)"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.unlock();
            audio.toggleMute();
          }}
        >
          {snap.muted || !snap.audioOn ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(snap.volume * 100)}
          aria-label="Сила на звука"
          className="h-1 w-20 accent-accent"
          onChange={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.unlock();
            audio.setVolume(Number(e.target.value) / 100);
          }}
        />
        {!snap.audioOn ? (
          <span className="text-[10px] font-semibold text-muted">звук след 1-во действие</span>
        ) : null}
      </div>

      {/* Cabin key chips */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[60%] flex-wrap justify-end gap-1.5 select-none">
        <Chip keys="Q" label="огл. ляво" active={snap.glance === "left"} />
        <Chip keys="F" label="огл. задно" active={snap.glance === "rear"} />
        <Chip keys="E" label="огл. дясно" active={snap.glance === "right"} />
        <Chip keys="," label="◀ мигач" active={snap.indicator === "left"} tone="warning" />
        <Chip keys="." label="мигач ▶" active={snap.indicator === "right"} tone="warning" />
        <Chip keys="L" label={lightsLabel} active={snap.headlights !== "off"} />
        <Chip
          keys="B"
          label={snap.seatbeltOn ? "колан ✓" : "колан!"}
          active
          tone={snap.seatbeltOn ? "accent" : "danger"}
        />
        <Chip keys="N" label={snap.night ? "нощ" : "ден"} active={snap.night} />
      </div>
    </>
  );
}
