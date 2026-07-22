"use client";

/**
 * Headless clip client (DEV ONLY) — the browser half of the offline renderer.
 *
 * Mounts the EXACT CaptureScene the real-time rig uses (same world recipe,
 * staged actors, camera plan, R0 chrome), but instead of MediaRecorder it
 * publishes a deterministic control surface on `window.__clipHeadless`:
 *
 *   state            "loading" | "ready" | "error"           (poll until ready)
 *   error            message when state === "error"
 *   mode             "single" | "list"
 *   pilot            [{ template, mistake, id }]              (list mode only)
 *   meta             { id, view, startSec, endSec, faultTimeSec, keyframeAt … }
 *   frameCount       live getter — rendered-frame counter (fresh-frame gate)
 *   seek(t)          set the shared clock to ONE value; the scene renders it
 *   readChecklist()  the R1 actor checklist (call after stepping past the fault)
 *
 * The Node driver seeks start→end at a fixed dt, waits for frameCount to
 * advance, screenshots the canvas, and stitches with ffmpeg. Everything here is
 * a pure function of the clock (CaptureScene's contract), so the same seek
 * sequence renders the same frames on any machine — the whole point of doc 66.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ClipPilotEntry, ClipPlanEntry } from "@/modules/learning";
import { createTraceClock, type TraceClock } from "@/modules/sim/traces";
import {
  buildActorChecklist,
  createActorPresenceLog,
  type ActorCheck,
  type ActorPresenceLog,
} from "@/lib/clips/capturePlan";
import { loadRun, type ClipRun } from "../clip-capture/clip-capture-client";
import { CAPTURE_H, CAPTURE_W } from "../clip-capture/CaptureScene";

const CaptureScene = dynamic(
  () => import("../clip-capture/CaptureScene").then((m) => ({ default: m.CaptureScene })),
  { ssr: false },
);

/** The manifest-shaping facts the Node driver needs, all off the built run. */
interface HeadlessMeta {
  id: string;
  templateId: string;
  mistakeIndex: number;
  tracePath: string;
  titleBg: string;
  view: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  faultTimeSec: number;
  /** Absolute clock times of the five R0 stills (start, f−2, FAULT, f+2, end). */
  keyframeAt: number[];
  width: number;
  height: number;
}

interface HeadlessApi {
  state: "loading" | "ready" | "error";
  error?: string;
  mode: "single" | "list";
  pilot?: { template: string; mistake: number; id: string }[];
  meta?: HeadlessMeta;
  /** Live rendered-frame counter (defined as a getter over the scene's ref). */
  readonly frameCount: number;
  /** Set the shared clock to one value (the scene renders it on the next tick). */
  seek: (t: number) => void;
  /** R1 checklist for the built run — required actors × the presence log. */
  readChecklist: () => ActorCheck[];
}

declare global {
  interface Window {
    __clipHeadless?: HeadlessApi;
  }
}

function parseSingle(): { template: string; mistake: number } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const template = q.get("template");
    if (!template) return null;
    return { template, mistake: Number(q.get("mistake") ?? "0") };
  } catch {
    return null;
  }
}

export function HeadlessClipClient({
  pilot,
  plan,
}: {
  pilot: ClipPilotEntry[];
  plan: readonly ClipPlanEntry[];
}) {
  const [run, setRun] = useState<ClipRun | null>(null);
  const clockRef = useRef<TraceClock>(createTraceClock());
  const presenceRef = useRef<ActorPresenceLog>(createActorPresenceLog());
  const frameCountRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef<ClipRun | null>(null);

  const planById = useMemo(() => new Map(plan.map((p) => [p.id, p])), [plan]);

  /** Install the window surface exactly once; the getter/closures read the
   *  stable refs, so the object never needs replacing on re-render. */
  const publish = useCallback((patch: Partial<Omit<HeadlessApi, "frameCount">>) => {
    const existing = window.__clipHeadless;
    if (existing) {
      Object.assign(existing, patch);
      return;
    }
    const api = {
      state: "loading",
      mode: "single",
      seek: (t: number) => {
        clockRef.current.tSec = t;
      },
      readChecklist: () =>
        runRef.current
          ? buildActorChecklist(runRef.current.plan.requiredActors, presenceRef.current)
          : [],
      ...patch,
    } as HeadlessApi;
    // frameCount is always the live ref value — never a stale snapshot.
    Object.defineProperty(api, "frameCount", { get: () => frameCountRef.current });
    window.__clipHeadless = api;
  }, []);

  const onCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  const onReady = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const meta: HeadlessMeta = {
      id: r.entry.id,
      templateId: r.entry.templateId,
      mistakeIndex: r.entry.mistakeIndex,
      tracePath: r.entry.tracePath,
      titleBg: r.entry.titleBg,
      view: r.plan.view,
      startSec: r.window.startSec,
      endSec: r.window.endSec,
      durationSec: r.window.endSec - r.window.startSec,
      faultTimeSec: r.plan.faultTimeSec,
      keyframeAt: r.keyframeAt,
      width: CAPTURE_W,
      height: CAPTURE_H,
    };
    publish({ state: "ready", meta });
  }, [publish]);

  const onError = useCallback(
    (message: string) => {
      publish({ state: "error", error: message });
    },
    [publish],
  );

  // Boot: publish the surface, then either list the pilot or build one run.
  useEffect(() => {
    publish({});
    const single = parseSingle();
    if (!single) {
      publish({
        mode: "list",
        state: "ready",
        pilot: pilot.map((e) => ({ template: e.templateId, mistake: e.mistakeIndex, id: e.id })),
      });
      return;
    }
    const entry = pilot.find(
      (e) => e.templateId === single.template && e.mistakeIndex === single.mistake,
    );
    if (!entry) {
      publish({ mode: "single", state: "error", error: `не е в пилота: ${single.template} m${single.mistake}` });
      return;
    }
    publish({ mode: "single", state: "loading" });
    let alive = true;
    loadRun(entry, planById.get(entry.id))
      .then((r) => {
        if (!alive) return;
        runRef.current = r;
        presenceRef.current = createActorPresenceLog();
        clockRef.current = createTraceClock();
        clockRef.current.playing = false;
        clockRef.current.speed = 1;
        clockRef.current.tSec = r.window.startSec;
        setRun(r);
        // onReady (fired by the scene) flips state → "ready" + fills meta.
      })
      .catch((err: unknown) => {
        if (!alive) return;
        publish({ mode: "single", state: "error", error: err instanceof Error ? err.message : "грешка" });
      });
    return () => {
      alive = false;
    };
    // Boot once — pilot/plan are stable server props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!run) {
    // list mode / loading / error — a bare marker (Playwright reads the window
    // surface, not the DOM). Kept minimal so nothing steals GPU from the scene.
    return <main data-headless="idle" style={{ width: 1, height: 1 }} />;
  }

  return (
    <main data-headless="scene" style={{ width: CAPTURE_W, height: CAPTURE_H }}>
      <CaptureScene
        key={run.entry.id}
        clipId={run.entry.id}
        lesson={run.lesson}
        trace={run.trace}
        clockRef={clockRef}
        startSec={run.window.startSec}
        faultTimeSec={run.plan.faultTimeSec}
        signalOffsets={run.signalOffsets}
        view={run.plan.view}
        cameraProfile={run.plan.camera}
        controlFraming={run.framing}
        laneHighlight={run.plan.laneHighlight ?? null}
        groundMarker={run.groundMarker}
        cabin={run.cabin}
        presenceRef={presenceRef}
        frameCountRef={frameCountRef}
        onCanvas={onCanvas}
        onReady={onReady}
        onError={onError}
      />
    </main>
  );
}
