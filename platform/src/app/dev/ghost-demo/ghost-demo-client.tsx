"use client";

/**
 * Client half of the S0-View dev harness: ensures `?ghost=demo` is on the
 * URL (LessonScene's flag read), then mounts the real LessonScene with the
 * полигон free-drive spec and no-op shell callbacks. The 3D stack loads
 * client-side only (the SceneSlot ssr:false law — rapier wasm never runs
 * during SSR/build).
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { lessonById } from "@/modules/sim/lessons";

const LessonScene = dynamic(() => import("@/components/sim/LessonScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm">Зареждане на симулатора…</p>
      </div>
    </div>
  ),
});

const noop = () => undefined;

export function GhostDemoClient() {
  const [ready, setReady] = useState(false);

  // The demo flag must be on the URL BEFORE the scene's load effect reads it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("ghost") !== "demo") {
      url.searchParams.set("ghost", "demo");
      window.history.replaceState(null, "", url);
    }
    setReady(true);
  }, []);

  const lesson = lessonById("l0p-poligon-free");
  if (!lesson) return null;

  return (
    <div className="h-screen w-screen bg-surface">
      {ready ? (
        <LessonScene
          lesson={lesson}
          quality="medium"
          paused={false}
          driveLocked={false}
          preDriveHighlightStepId={null}
          activeObjectiveIndex={0}
          onTick={noop}
          onPreDriveStep={noop}
          onBlockedDriveAttempt={noop}
          onMinimapFrame={noop}
        />
      ) : null}
    </div>
  );
}
