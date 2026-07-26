"use client";

// The DOM half of the context-loss telemetry (doc 82 §2.3 fix 4). Mount once
// inside the <Canvas>; it renders nothing.
//
// `preventDefault()` on `webglcontextlost` is not optional — it is what tells
// the browser we intend to come back, and without it `webglcontextrestored`
// never fires at all. Restoring the SCENE is a separate (larger) job: three.js
// re-uploads its own resources on restore, but R3F's tree, the KTX2 transcoder
// output and the Rapier world are not automatically re-created, so this guard
// deliberately does the small honest thing — it makes the failure VISIBLE and
// timestamped — instead of pretending to recover.

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { QualityLevel } from "./quality";
import { formatContextLossEvent, recordContextLoss, type ContextLossEvent } from "./contextLoss";

export interface GlContextGuardProps {
  /** Render tier, recorded with the event — the first thing to suspect. */
  level: QualityLevel;
  /** Optional hook for a UI layer that wants to surface the failure. */
  onContextLost?: (event: ContextLossEvent) => void;
}

export function GlContextGuard({ level, onContextLost }: GlContextGuardProps) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const describe = (kind: ContextLossEvent["kind"], statusMessage: string | null) => {
      // The canvas backing store IS the default framebuffer's drawing buffer,
      // and it survives context loss — three's own getDrawingBufferSize reads
      // renderer state that may already be gone by the time we run.
      const event: ContextLossEvent = {
        kind,
        atMs: typeof performance !== "undefined" ? performance.now() : 0,
        level,
        statusMessage: statusMessage || null,
        drawingBufferSize: canvas.width > 0 ? `${canvas.width}×${canvas.height}` : null,
      };
      recordContextLoss(event);
      return event;
    };

    const onLost = (e: Event) => {
      // Keep the browser willing to hand the context back.
      e.preventDefault();
      const status =
        typeof (e as WebGLContextEvent).statusMessage === "string"
          ? (e as WebGLContextEvent).statusMessage
          : null;
      const event = describe("lost", status);
      // console.error, not warn: this is the one failure the student cannot
      // see past, and it is what a chrome://inspect session is looking for.
      console.error(formatContextLossEvent(event));
      onContextLost?.(event);
    };

    const onRestored = () => {
      const event = describe("restored", null);
      console.info(formatContextLossEvent(event));
    };

    canvas.addEventListener("webglcontextlost", onLost as EventListener, false);
    canvas.addEventListener("webglcontextrestored", onRestored as EventListener, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost as EventListener, false);
      canvas.removeEventListener("webglcontextrestored", onRestored as EventListener, false);
    };
  }, [gl, level, onContextLost]);

  return null;
}
