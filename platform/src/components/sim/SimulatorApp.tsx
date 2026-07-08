"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { createTelemetry, isTouchOnlyDevice, SimInput } from "@/modules/sim/engine";
import type { VehicleSim } from "@/modules/sim/vehicle";
import type { VehicleSample } from "@/modules/sim/contracts";
import { SimHud } from "@/modules/sim/hud";
import { CabinControls } from "./cabin";
import { CabinHud } from "./CabinHud";
import type { CameraMode } from "./CameraRig";
import { SimAudio } from "./simAudio";
import { SimScene } from "./SimScene";
import { createVehicleSample } from "./vehicleSample";

type Support = "blocked" | "ok";

/**
 * Top-level simulator orchestrator (client-only; the /simulator route mounts
 * it via next/dynamic with ssr:false so the rapier wasm never loads during
 * SSR/build). Owns: touch-only gate, pause menu (Esc), restart, input +
 * cabin + audio lifecycles, and the shared mutable refs the R3F scene reads.
 */
export default function SimulatorApp() {
  // Feature-detect touch-only devices (never UA sniffing). Safe to do in the
  // state initializer: this component is client-only (dynamic, ssr:false),
  // so window/matchMedia exist on first render.
  const [support] = useState<Support>(() => (isTouchOnlyDevice() ? "blocked" : "ok"));
  const [paused, setPaused] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  // Mutable channels: written by the render loop, polled by the HUDs.
  // Refs (not state) so 60 writes/s cause zero re-renders.
  const telemetryRef = useRef(createTelemetry());
  const simRef = useRef<VehicleSim | null>(null);
  const chassisGroupRef = useRef<Group | null>(null);
  const cameraModeRef = useRef<CameraMode>("chase");
  const inputRef = useRef<SimInput | null>(null);
  const cabinRef = useRef<CabinControls | null>(null);
  const audioRef = useRef<SimAudio | null>(null);
  // Rule-engine seam: the latest VehicleSample (contracts.ts), refreshed
  // every frame by VehicleRig. The world runtime will consume this.
  const sampleRef = useRef<VehicleSample>(createVehicleSample());

  useEffect(() => {
    if (support !== "ok") return;
    const input = new SimInput({
      onToggleCamera: () => {
        cameraModeRef.current = cameraModeRef.current === "chase" ? "cockpit" : "chase";
      },
      onReset: () => simRef.current?.reset(),
      onTogglePause: () => setPaused((p) => !p),
    });
    inputRef.current = input;

    const audio = new SimAudio();
    audioRef.current = audio;
    const cabin = new CabinControls({
      onSeatbeltToggle: () => audio.click(),
      onToggleMute: () => audio.toggleMute(),
    });
    cabinRef.current = cabin;

    // Autoplay policy: the audio graph may only start from a user gesture.
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      input.dispose();
      inputRef.current = null;
      cabin.dispose();
      cabinRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, [support]);

  if (support === "blocked") {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-surface p-6">
        <div className="max-w-md text-center">
          <p className="text-4xl" aria-hidden>
            ⌨️
          </p>
          <h2 className="mt-4 text-xl font-bold">Симулаторът изисква клавиатура</h2>
          <p className="mt-2 text-sm text-muted">
            Тестовото каране се управлява с клавиши (или геймпад) и още няма
            управление за докосване. Отвори тази страница на компютър, за да
            подкараш колата.
          </p>
          <Link href="/dashboard" className="btn-ghost mt-6">
            Обратно към началото
          </Link>
        </div>
      </div>
    );
  }

  const restart = () => {
    setSessionKey((k) => k + 1);
    setPaused(false);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-surface">
      <div className="aspect-video w-full">
        <SimScene
          paused={paused}
          sessionKey={sessionKey}
          telemetryRef={telemetryRef}
          inputRef={inputRef}
          simRef={simRef}
          chassisGroupRef={chassisGroupRef}
          cameraModeRef={cameraModeRef}
          cabinRef={cabinRef}
          audioRef={audioRef}
          sampleRef={sampleRef}
        />
      </div>

      <SimHud telemetryRef={telemetryRef} />
      <CabinHud cabinRef={cabinRef} audioRef={audioRef} />

      {paused ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Пауза"
        >
          <div className="card flex w-64 flex-col gap-3 p-6 text-center">
            <h2 className="text-xl font-bold">Пауза</h2>
            <button type="button" autoFocus className="btn-accent" onClick={() => setPaused(false)}>
              Продължи
            </button>
            <button type="button" className="btn-ghost" onClick={restart}>
              Рестарт
            </button>
            <Link href="/dashboard" className="btn-ghost">
              Изход
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
