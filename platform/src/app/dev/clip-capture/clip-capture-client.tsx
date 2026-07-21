"use client";

/**
 * Clip-capture client v2 (DEV ONLY) — drives CaptureScene through the pilot
 * against the GENERATED PLAN (clipPlan.generated.ts — the doc 66 contract:
 * PLAN writes, this rig consumes verbatim):
 *
 *   /dev/clip-capture                      → the pilot list (links per clip)
 *   /dev/clip-capture?template=X&mistake=N → single-clip capture + debug deck
 *   /dev/clip-capture?auto=1               → UNATTENDED batch over the whole
 *                                            pilot list, „ГОТОВО n/N" at end
 *
 * Per clip: plan lookup (NO plan = NO clip — fail loud, doc 66) → fetch +
 * parse the committed mistake trace → v2 window (captureWindowFor: anchored
 * on the ENGINE faultTimeSec, control lead-in, hop-guarded end) → mount the
 * real 3D scene (view per the card) → seek the shared TraceClock → SETTLE
 * (SETTLE_MS + ≥SETTLE_FRAMES fresh rendered frames — never record the seek)
 * → record canvas.captureStream(30) via MediaRecorder over exactly the
 * window, copying the five R0 keyframes off the live canvas as their
 * playback times pass (cheap drawImage during; PNG-serialized after stop, so
 * the recording never hitches) → POST clip + keyframes + the R1 actor
 * checklist to /api/dev/clips. Failures log and the batch continues — the
 * main session re-runs stragglers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ClipPilotEntry, ClipPlanEntry } from "@/modules/learning";
import {
  compileScenario,
  scenarioById,
  scenarioEntryLevel,
  type LessonSpec,
} from "@/modules/sim/lessons";
import {
  createTraceClock,
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import { loadQualityPreset } from "@/components/sim/lesson-ui/QualityPresetSelector";
import { TraceTimeline } from "@/components/sim/lesson-ui/TraceTimeline";
import { traceUrlForRepoPath } from "@/components/theory/whyPanelModel";
import type { RecordingWindow } from "@/lib/clips/trim";
import {
  buildActorChecklist,
  cabinChannelsFor,
  captureWindowFor,
  checklistSummary,
  controlPassTimeSec,
  createActorPresenceLog,
  keyframesDueThrough,
  keyframeTimes,
  type ActorCheck,
  type ActorPresenceLog,
  type CaptureCabinChannels,
} from "@/lib/clips/capturePlan";
import { recordedSignalOffsetsFor, type SignalOffsets } from "@/lib/clips/captureSignalDials";
import {
  CAPTURE_H,
  CAPTURE_W,
  type CaptureControlFraming,
  type CaptureGroundMarker,
} from "./CaptureScene";

const CaptureScene = dynamic(
  () => import("./CaptureScene").then((m) => ({ default: m.CaptureScene })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: CAPTURE_W, height: CAPTURE_H }}
        className="flex items-center justify-center bg-surface text-sm text-muted"
      >
        Зареждане на симулатора…
      </div>
    ),
  },
);

/** Seek settle time before the recorder starts (pose + lamps stabilize)… */
const SETTLE_MS = 600;
/** …plus this many FRESH rendered frames (doc 66 R5 — never record the seek;
 *  a sleep alone proves nothing about the render loop). */
const SETTLE_FRAMES = 3;
const SETTLE_FRAMES_TIMEOUT_MS = 4_000;
/** Warmup/build ceiling per clip before it counts as failed. */
const READY_TIMEOUT_MS = 90_000;
const RECORD_BITS_PER_S = 1_500_000;

type ClipState = "pending" | "loading" | "recording" | "saving" | "done" | "error";

interface ClipStatus {
  state: ClipState;
  note?: string;
}

interface ClipRun {
  entry: ClipPilotEntry;
  plan: ClipPlanEntry;
  lesson: LessonSpec;
  trace: ScenarioTrace;
  window: RecordingWindow;
  /** The five R0 still times (window start, fault−2, fault, fault+2, end). */
  keyframeAt: number[];
  /** R2 control framing (positioned governing control only). */
  framing: CaptureControlFraming | null;
  /** Ground ❌ at the ENGINE fault position — lot maps only, where the roof
   *  badge parallax-reads as a detached marker (pilot v2 "X on the grass"). */
  groundMarker: CaptureGroundMarker | null;
  /** Honest R4 cabin channels from the mistake's graded codeRefs. */
  cabin: CaptureCabinChannels;
  /** The RECORDING's signal pins (captureSignalDials; null = natural). */
  signalOffsets: SignalOffsets | null;
}

interface Mode {
  kind: "list" | "single" | "auto";
  templateId?: string;
  mistakeIndex?: number;
}

function parseMode(): Mode {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("auto") === "1") return { kind: "auto" };
    const templateId = q.get("template");
    const mistake = q.get("mistake");
    if (templateId) {
      return { kind: "single", templateId, mistakeIndex: Number(mistake ?? "0") };
    }
  } catch {
    // fall through to the list
  }
  return { kind: "list" };
}

/** vp9 → vp8 → plain webm (the founder machine records vp9). */
function pickMimeType(): string {
  for (const c of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Build the run for one pilot entry: plan card + compiled drill + trace. */
async function loadRun(entry: ClipPilotEntry, plan: ClipPlanEntry | undefined): Promise<ClipRun> {
  // Doc 66: the requirements card IS the recording order — no card, no clip.
  if (!plan) throw new Error("липсва в генерирания план (clipPlan)");
  const spec = scenarioById(entry.templateId);
  if (!spec) throw new Error(`непознат шаблон ${entry.templateId}`);
  const mistake = spec.mistakes[entry.mistakeIndex];
  if (!mistake) throw new Error(`непозната грешка m${entry.mistakeIndex}`);
  const lesson = compileScenario(spec, scenarioEntryLevel(spec));
  const res = await fetch(traceUrlForRepoPath(entry.tracePath));
  if (!res.ok) throw new Error(`trace ${res.status}`);
  const trace = parseScenarioTrace(await res.json());
  if (trace === null) throw new Error("невалидна следа");
  const control = plan.governingControl;
  const hasPositionedControl = control.kind !== "none" && control.approxPos !== undefined;
  // Control pass time over the WHOLE trace (startSec 0) — the window contract:
  // captureWindowFor opens early enough that the control is still AHEAD for
  // CONTROL_APPROACH_S before the ghost passes it (doc 66 R2, data-anchored).
  const passTSec = hasPositionedControl
    ? controlPassTimeSec(trace, control.approxPos!, 0, plan.faultTimeSec)
    : null;
  const window = captureWindowFor(
    trace.meta.durationSec,
    plan.faultTimeSec,
    passTSec !== null ? { passTSec } : null,
  );
  const framing: CaptureControlFraming | null =
    hasPositionedControl && passTSec !== null
      ? { x: control.approxPos!.x, y: control.approxPos!.y, passTSec }
      : null;
  // Lot maps: the roof ❌ badge floats ~camera height and parallax-projects
  // onto near backgrounds — swap it for a ground ❌ at the ENGINE fault pose.
  let groundMarker: CaptureGroundMarker | null = null;
  if (spec.map.archetype === "parking-lot") {
    const faultPt = createTracePoint();
    sampleAt(trace, plan.faultTimeSec, faultPt);
    groundMarker = { x: faultPt.x, y: faultPt.y };
  }
  const isNight = (lesson.environment?.timeOfDay ?? "day") === "night";
  return {
    entry,
    plan,
    lesson,
    trace,
    window,
    keyframeAt: keyframeTimes(window, plan.faultTimeSec),
    framing,
    groundMarker,
    cabin: cabinChannelsFor(mistake.codeRefs, isNight),
    // The signal pins THIS recording ran with (CAUSE-4): resolved per
    // (template, trace) — null = the map's natural offsets, apply nothing.
    signalOffsets: recordedSignalOffsetsFor(entry.templateId, entry.tracePath),
  };
}

export function ClipCaptureClient({
  pilot,
  plan,
}: {
  pilot: ClipPilotEntry[];
  plan: readonly ClipPlanEntry[];
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [run, setRun] = useState<ClipRun | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ClipStatus>>({});
  const [batchDone, setBatchDone] = useState<{ ok: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const clockRef = useRef<TraceClock>(createTraceClock());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const startedRef = useRef(false);
  /** R1 presence log — reset per run, filled by the mounted scene. */
  const presenceRef = useRef<ActorPresenceLog>(createActorPresenceLog());
  /** Rendered-frame counter (the settle gate) — incremented by the scene. */
  const frameCountRef = useRef(0);

  const planById = useMemo(() => new Map(plan.map((p) => [p.id, p])), [plan]);

  // Mode comes off window.location AFTER mount (SSR renders null — the
  // ghost-demo URL-read pattern). setTimeout, not rAF: rAF never fires in a
  // background tab and the batch page may well sit unfocused.
  useEffect(() => {
    const id = window.setTimeout(() => setMode(parseMode()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const setStatus = useCallback((id: string, status: ClipStatus) => {
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  // Scene callbacks — resolve/reject the per-clip readiness promise.
  const onSceneReady = useCallback(() => {
    readyRef.current?.resolve();
  }, []);
  const onSceneError = useCallback((message: string) => {
    readyRef.current?.reject(new Error(message));
  }, []);
  const onCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  /** Wait for `count` FRESH rendered frames (the settle law). */
  const awaitFreshFrames = useCallback(async (count: number): Promise<void> => {
    const start = frameCountRef.current;
    const deadline = performance.now() + SETTLE_FRAMES_TIMEOUT_MS;
    while (frameCountRef.current < start + count) {
      if (performance.now() > deadline) {
        throw new Error("сцената не рендира кадри — разделът видим ли е?");
      }
      await sleep(16);
    }
  }, []);

  /** Record the CURRENTLY MOUNTED scene over the run's trim window,
   *  keyframes + actor checklist included. */
  const recordMounted = useCallback(
    async (r: ClipRun): Promise<ActorCheck[]> => {
      // rAF (rendering + captureStream frames) is PAUSED in hidden tabs —
      // fail fast with a clear message instead of hanging to the deadline.
      if (document.visibilityState === "hidden") {
        throw new Error("разделът е на заден план — дръж го видим по време на запис");
      }
      const clock = clockRef.current;
      // Seek to the window start, paused; let the pose/lamps settle: the
      // sleep, then ≥SETTLE_FRAMES fresh frames at the settled pose (R5 —
      // the recording can never contain the seek).
      clock.playing = false;
      clock.speed = 1;
      clock.loop = null;
      clock.tSec = r.window.startSec;
      await sleep(SETTLE_MS);
      await awaitFreshFrames(SETTLE_FRAMES);

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("няма канава");
      // R0 keyframe copy targets — drawImage during recording is cheap
      // (GPU-side); PNG serialization waits until after recorder.stop so
      // the recording itself never hitches.
      const shots = r.keyframeAt.map(() => {
        const c = document.createElement("canvas");
        c.width = CAPTURE_W;
        c.height = CAPTURE_H;
        return c;
      });
      let nextShot = 0;
      const copyDueShots = (tSec: number) => {
        const due = keyframesDueThrough(r.keyframeAt, nextShot, tSec);
        for (; nextShot < due; nextShot++) {
          shots[nextShot].getContext("2d")?.drawImage(canvas, 0, 0);
        }
      };

      const mimeType = pickMimeType();
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORD_BITS_PER_S,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start(250);
      clock.tSec = r.window.startSec;
      clock.playing = true;
      // Watch the shared clock; stop at the window end. Wrap detection stays
      // as a backstop only — the v2 window never touches the trace end
      // (WINDOW_END_GUARD_S, the v1 №6 hop fix).
      const spanMs = (r.window.endSec - r.window.startSec) * 1000;
      const deadline = performance.now() + spanMs + 20_000;
      let lastT = clock.tSec;
      try {
        await new Promise<void>((resolve, reject) => {
          const iv = window.setInterval(() => {
            const t = clockRef.current.tSec;
            copyDueShots(t);
            if (t >= r.window.endSec - 0.1 || t < lastT - 1) {
              window.clearInterval(iv);
              resolve();
            } else if (performance.now() > deadline) {
              window.clearInterval(iv);
              reject(new Error("времето за запис изтече"));
            }
            lastT = t;
          }, 50);
        });
      } finally {
        clock.playing = false;
        // Flush any stills not yet copied (the window-end frame).
        copyDueShots(Number.POSITIVE_INFINITY);
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      }
      await stopped;

      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      if (blob.size === 0) throw new Error("празен запис");

      // Serialize the five stills (post-recording — see above).
      const stillBlobs: Blob[] = [];
      for (const shot of shots) {
        const still = await new Promise<Blob | null>((resolve) =>
          shot.toBlob((b) => resolve(b), "image/png"),
        );
        if (still === null || still.size === 0) throw new Error("празен ключов кадър");
        stillBlobs.push(still);
      }

      // The R1 checklist — what the capture actually staged vs the card.
      const actors = buildActorChecklist(r.plan.requiredActors, presenceRef.current);
      // R1 MACHINE PRE-CHECK (doc 66 — pilot-v2 hardening): a clip whose
      // required actors never appeared is FALSE by definition. FAIL the clip
      // here — nothing is posted, the batch logs the error and moves on. The
      // sink enforces the same gate server-side (422 r1_actor_missing), so a
      // silent success is impossible from either end.
      const missingActors = actors.filter((a) => !a.present);
      if (missingActors.length > 0) {
        throw new Error(`R1: липсва ${missingActors.map((m) => m.kind).join(", ")}`);
      }

      const fd = new FormData();
      fd.set("id", r.entry.id);
      fd.set("templateId", r.entry.templateId);
      fd.set("mistakeIndex", String(r.entry.mistakeIndex));
      fd.set("tracePath", r.entry.tracePath);
      fd.set("titleBg", r.entry.titleBg);
      fd.set("durationSec", String(r.window.endSec - r.window.startSec));
      fd.set("view", r.plan.view);
      fd.set("actors", JSON.stringify(actors));
      // R5 audit: the level this recording ACTUALLY rendered (doc 66 — "the
      // founder's own preset" only holds when the founder's browser records;
      // recording it makes a preset mismatch machine-visible in R0).
      const preset = loadQualityPreset();
      fd.set("quality", preset === "medium" ? "med" : preset);
      fd.set("file", blob, `${r.entry.id}.webm`);
      stillBlobs.forEach((still, i) => {
        fd.set(`k${i}`, still, `${r.entry.id}.k${i}.png`);
      });
      const res = await fetch("/api/dev/clips", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return actors;
    },
    [awaitFreshFrames],
  );

  /** Full pipeline for one entry: load → mount → ready → record → save. */
  const captureEntry = useCallback(
    async (entry: ClipPilotEntry): Promise<void> => {
      setStatus(entry.id, { state: "loading" });
      const r = await loadRun(entry, planById.get(entry.id));
      // Arm readiness BEFORE the scene mounts (onReady may fire fast).
      const ready = new Promise<void>((resolve, reject) => {
        readyRef.current = { resolve, reject };
      });
      const timeout = sleep(READY_TIMEOUT_MS).then(() => {
        throw new Error("светът не се зареди навреме");
      });
      canvasRef.current = null;
      presenceRef.current = createActorPresenceLog();
      clockRef.current = createTraceClock();
      clockRef.current.playing = false;
      clockRef.current.tSec = r.window.startSec;
      setRun(r);
      await Promise.race([ready, timeout]);
      setStatus(entry.id, { state: "recording" });
      // recordMounted THROWS on any missing required actor (R1 pre-check),
      // so a "done" pill always means the full card staged.
      const actors = await recordMounted(r);
      const summary = checklistSummary(actors);
      setStatus(entry.id, {
        state: "done",
        note:
          `${(r.window.endSec - r.window.startSec).toFixed(1)} с` +
          (summary ? ` · актьори ${summary}` : ""),
      });
    },
    [recordMounted, setStatus, planById],
  );

  /** The unattended batch: every pilot entry, failures logged + skipped. */
  const runBatch = useCallback(async () => {
    setBusy(true);
    let ok = 0;
    for (const entry of pilot) {
      try {
        await captureEntry(entry);
        ok++;
      } catch (err) {
        console.error(`clip-capture: ${entry.id} failed`, err);
        setStatus(entry.id, {
          state: "error",
          note: err instanceof Error ? err.message : "грешка",
        });
      }
    }
    setRun(null);
    setBatchDone({ ok, total: pilot.length });
    setBusy(false);
  }, [pilot, captureEntry, setStatus]);

  // ?auto=1 runs unattended (guarded against the dev double-effect).
  useEffect(() => {
    if (mode?.kind !== "auto" || startedRef.current) return;
    startedRef.current = true;
    void runBatch();
  }, [mode, runBatch]);

  if (mode === null) return null;

  // ---- list mode -----------------------------------------------------------
  if (mode.kind === "list") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
        <header>
          <h1 className="font-display text-2xl font-black">Запис на клипове — пилот v2</h1>
          <p className="mt-1 text-sm text-muted">
            Dev-only: {pilot.length} представителни грешки, записвани по
            генерирания план (doc 66): актьорите се разиграват отново, камерата
            следва изискването на картата, петте ключови кадъра се запазват за
            R0 проверката. Записът е 1280×720. Разделът трябва да остане ВИДИМ
            по време на запис (скрит раздел не рендира кадри).
          </p>
        </header>
        <a
          href="/dev/clip-capture?auto=1"
          className="btn-accent self-start"
        >
          ▶ Автоматичен запис — всичките {pilot.length}
        </a>
        <ol className="flex flex-col gap-1.5">
          {pilot.map((e, i) => {
            const p = planById.get(e.id);
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                <span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{e.titleBg}</p>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {e.id}
                    {p ? ` · ${p.view} · грешка @${p.faultTimeSec.toFixed(1)}с` : " · ⚠ БЕЗ ПЛАН"}
                  </p>
                </div>
                <a
                  href={`/dev/clip-capture?template=${encodeURIComponent(e.templateId)}&mistake=${e.mistakeIndex}`}
                  className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                >
                  Запиши
                </a>
              </li>
            );
          })}
        </ol>
      </main>
    );
  }

  // ---- single mode ---------------------------------------------------------
  if (mode.kind === "single") {
    const spec = mode.templateId ? scenarioById(mode.templateId) : undefined;
    const mi = mode.mistakeIndex ?? 0;
    const mistake = spec?.mistakes[mi];
    // Same id format as clipIdFor (learning/clipPilot) — the manifest law.
    const singleId = spec ? `${spec.id}__m${mi}` : "";
    const singlePlan = planById.get(singleId);
    if (!spec || !mistake || mistake.traceRef.pending === true) {
      return (
        <main className="p-6 text-sm text-danger">
          Непознат шаблон/грешка: {mode.templateId} m{mi}
        </main>
      );
    }
    if (!singlePlan) {
      return (
        <main className="p-6 text-sm text-danger">
          {singleId} липсва в генерирания план (tools/clips/gen_clip_plan.mjs)
          — без карта с изисквания не се записва (doc 66).
        </main>
      );
    }
    const entry: ClipPilotEntry = {
      id: singleId,
      templateId: spec.id,
      mistakeIndex: mi,
      tracePath: mistake.traceRef.path,
      titleBg: mistake.titleBg,
      eventTypes: [],
    };
    const status = statuses[entry.id];
    return (
      <main className="flex flex-col gap-4 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-black">{mistake.titleBg}</h1>
          <span className="font-mono text-xs text-muted">
            {entry.id} · {singlePlan.view} · грешка @{singlePlan.faultTimeSec.toFixed(1)}с
          </span>
          <button
            type="button"
            disabled={busy}
            className="btn-accent px-4 py-2 text-sm disabled:opacity-50"
            onClick={() => {
              setBusy(true);
              captureEntry(entry)
                .catch((err: unknown) => {
                  setStatus(entry.id, {
                    state: "error",
                    note: err instanceof Error ? err.message : "грешка",
                  });
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Записва…" : "🎬 Запиши клипа"}
          </button>
          {status ? <StatusPill status={status} /> : null}
          <a href="/dev/clip-capture" className="btn-ghost px-3 py-1.5 text-xs">
            ← Списък
          </a>
        </header>
        {run ? (
          <>
            <CaptureScene
              key={run.entry.id}
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
              onReady={onSceneReady}
              onError={onSceneError}
            />
            {/* Debug deck — DOM only, never reaches the canvas recording. */}
            <div className="max-w-xl">
              <TraceTimeline trace={run.trace} clockRef={clockRef} compact />
            </div>
            <p className="font-mono text-xs text-muted">
              прозорец {run.window.startSec.toFixed(1)}–{run.window.endSec.toFixed(1)} с ·
              следа {run.trace.meta.durationSec.toFixed(1)} с · кадри при{" "}
              {run.keyframeAt.map((t) => t.toFixed(1)).join(" / ")} с
            </p>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost self-start px-3 py-2 text-sm"
            onClick={() => {
              loadRun(entry, singlePlan)
                .then((r) => {
                  presenceRef.current = createActorPresenceLog();
                  clockRef.current = createTraceClock();
                  clockRef.current.playing = false;
                  clockRef.current.tSec = r.window.startSec;
                  readyRef.current = { resolve: () => undefined, reject: () => undefined };
                  setRun(r);
                })
                .catch((err: unknown) => {
                  setStatus(entry.id, {
                    state: "error",
                    note: err instanceof Error ? err.message : "грешка",
                  });
                });
            }}
          >
            Само преглед (без запис)
          </button>
        )}
      </main>
    );
  }

  // ---- auto (batch) mode ---------------------------------------------------
  const done = Object.values(statuses).filter((s) => s.state === "done").length;
  return (
    <main className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-black">Автоматичен запис</h1>
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-sm">
          {done}/{pilot.length}
        </span>
        {batchDone ? (
          <span
            className={`rounded-full px-3 py-1 text-sm font-black ${
              batchDone.ok === batchDone.total
                ? "border border-success/50 bg-success/10 text-success"
                : "border border-danger/50 bg-danger/10 text-danger"
            }`}
          >
            ГОТОВО {batchDone.ok}/{batchDone.total}
          </span>
        ) : null}
      </header>
      {run ? (
        <CaptureScene
          key={run.entry.id}
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
          onReady={onSceneReady}
          onError={onSceneError}
        />
      ) : null}
      <ol className="flex max-w-2xl flex-col gap-1">
        {pilot.map((e) => {
          const s = statuses[e.id] ?? { state: "pending" as const };
          return (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <StatusPill status={s} />
              <span className="font-mono text-xs">{e.id}</span>
              <span className="truncate text-muted">{e.titleBg}</span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

const STATE_LABEL_BG: Record<ClipState, string> = {
  pending: "чака",
  loading: "зарежда",
  recording: "запис",
  saving: "запазва",
  done: "записан",
  error: "грешка",
};

function StatusPill({ status }: { status: ClipStatus }) {
  const tone =
    status.state === "done"
      ? "border-success/50 bg-success/10 text-success"
      : status.state === "error"
        ? "border-danger/50 bg-danger/10 text-danger"
        : status.state === "pending"
          ? "border-border text-muted"
          : "border-accent/50 bg-accent/10 text-accent";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {STATE_LABEL_BG[status.state]}
      {status.note ? ` · ${status.note}` : ""}
    </span>
  );
}
