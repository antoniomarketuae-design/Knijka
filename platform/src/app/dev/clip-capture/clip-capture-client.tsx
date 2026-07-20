"use client";

/**
 * Clip-capture client (DEV ONLY) — drives CaptureScene through the pilot:
 *
 *   /dev/clip-capture                      → the pilot list (links per clip)
 *   /dev/clip-capture?template=X&mistake=N → single-clip capture + debug deck
 *   /dev/clip-capture?auto=1               → UNATTENDED batch over the whole
 *                                            pilot list, „ГОТОВО n/N" at end
 *
 * Per clip: fetch + parse the committed mistake trace → trim window
 * (lib/clips/trim — [fault−8, fault+4] grown to ≥10 s) → mount the real 3D
 * scene → seek the shared TraceClock to the window start → record
 * canvas.captureStream(30) via MediaRecorder (vp9 → vp8 → webm fallback,
 * ~1.5 Mbps) over exactly the window → POST to /api/dev/clips (writes the
 * .webm + upserts manifest.json). Failures log and the batch continues —
 * the main session re-runs stragglers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ClipPilotEntry } from "@/modules/learning";
import {
  compileScenario,
  scenarioById,
  scenarioEntryLevel,
  type LessonSpec,
} from "@/modules/sim/lessons";
import {
  createTraceClock,
  parseScenarioTrace,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import { TraceTimeline } from "@/components/sim/lesson-ui/TraceTimeline";
import { traceUrlForRepoPath } from "@/components/theory/whyPanelModel";
import { clipWindowFor, type RecordingWindow } from "@/lib/clips/trim";
import { CAPTURE_H, CAPTURE_W } from "./CaptureScene";

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

/** Seek settle time before the recorder starts (pose + lamps stabilize). */
const SETTLE_MS = 600;
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
  lesson: LessonSpec;
  trace: ScenarioTrace;
  window: RecordingWindow;
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

/** Build the run for one pilot entry: compile the drill + fetch the trace. */
async function loadRun(entry: ClipPilotEntry): Promise<ClipRun> {
  const spec = scenarioById(entry.templateId);
  if (!spec) throw new Error(`непознат шаблон ${entry.templateId}`);
  const lesson = compileScenario(spec, scenarioEntryLevel(spec));
  const res = await fetch(traceUrlForRepoPath(entry.tracePath));
  if (!res.ok) throw new Error(`trace ${res.status}`);
  const trace = parseScenarioTrace(await res.json());
  if (trace === null) throw new Error("невалидна следа");
  return { entry, lesson, trace, window: clipWindowFor(trace) };
}

export function ClipCaptureClient({ pilot }: { pilot: ClipPilotEntry[] }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [run, setRun] = useState<ClipRun | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ClipStatus>>({});
  const [batchDone, setBatchDone] = useState<{ ok: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const clockRef = useRef<TraceClock>(createTraceClock());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const startedRef = useRef(false);

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

  /** Record the CURRENTLY MOUNTED scene over the run's trim window. */
  const recordMounted = useCallback(async (r: ClipRun): Promise<void> => {
    // rAF (rendering + captureStream frames) is PAUSED in hidden tabs —
    // fail fast with a clear message instead of hanging to the deadline.
    if (document.visibilityState === "hidden") {
      throw new Error("разделът е на заден план — дръж го видим по време на запис");
    }
    const clock = clockRef.current;
    // Seek to the window start, paused; let the pose/lamps settle.
    clock.playing = false;
    clock.speed = 1;
    clock.loop = null;
    clock.tSec = r.window.startSec;
    await sleep(SETTLE_MS);

    const canvas = canvasRef.current;
    if (!canvas) throw new Error("няма канава");
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
    // Watch the shared clock; stop at the window end. Wrap detection is the
    // backstop for windows ending exactly at the trace end (ShadowCar loops
    // the clock to 0 there).
    const spanMs = (r.window.endSec - r.window.startSec) * 1000;
    const deadline = performance.now() + spanMs + 20_000;
    let lastT = clock.tSec;
    try {
      await new Promise<void>((resolve, reject) => {
        const iv = window.setInterval(() => {
          const t = clockRef.current.tSec;
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
      recorder.stop();
      for (const track of stream.getTracks()) track.stop();
    }
    await stopped;

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    if (blob.size === 0) throw new Error("празен запис");

    const fd = new FormData();
    fd.set("id", r.entry.id);
    fd.set("templateId", r.entry.templateId);
    fd.set("mistakeIndex", String(r.entry.mistakeIndex));
    fd.set("tracePath", r.entry.tracePath);
    fd.set("titleBg", r.entry.titleBg);
    fd.set("durationSec", String(r.window.endSec - r.window.startSec));
    fd.set("file", blob, `${r.entry.id}.webm`);
    const res = await fetch("/api/dev/clips", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`API ${res.status}`);
  }, []);

  /** Full pipeline for one entry: load → mount → ready → record → save. */
  const captureEntry = useCallback(
    async (entry: ClipPilotEntry): Promise<void> => {
      setStatus(entry.id, { state: "loading" });
      const r = await loadRun(entry);
      // Arm readiness BEFORE the scene mounts (onReady may fire fast).
      const ready = new Promise<void>((resolve, reject) => {
        readyRef.current = { resolve, reject };
      });
      const timeout = sleep(READY_TIMEOUT_MS).then(() => {
        throw new Error("светът не се зареди навреме");
      });
      canvasRef.current = null;
      clockRef.current = createTraceClock();
      clockRef.current.playing = false;
      clockRef.current.tSec = r.window.startSec;
      setRun(r);
      await Promise.race([ready, timeout]);
      setStatus(entry.id, { state: "recording" });
      await recordMounted(r);
      setStatus(entry.id, {
        state: "done",
        note: `${(r.window.endSec - r.window.startSec).toFixed(1)} с`,
      });
    },
    [recordMounted, setStatus],
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
          <h1 className="font-display text-2xl font-black">Запис на клипове — пилот</h1>
          <p className="mt-1 text-sm text-muted">
            Dev-only: {pilot.length} представителни грешки (изведени от why-panel
            индекса). Записът е 1280×720, 10–20 с около момента на грешката.
            Разделът трябва да остане ВИДИМ по време на запис (скрит раздел не
            рендира кадри).
          </p>
        </header>
        <a
          href="/dev/clip-capture?auto=1"
          className="btn-accent self-start"
        >
          ▶ Автоматичен запис — всичките {pilot.length}
        </a>
        <ol className="flex flex-col gap-1.5">
          {pilot.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.titleBg}</p>
                <p className="truncate font-mono text-[11px] text-muted">
                  {e.id} · {e.eventTypes.join(", ")}
                </p>
              </div>
              <a
                href={`/dev/clip-capture?template=${encodeURIComponent(e.templateId)}&mistake=${e.mistakeIndex}`}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
              >
                Запиши
              </a>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  // ---- single mode ---------------------------------------------------------
  if (mode.kind === "single") {
    const spec = mode.templateId ? scenarioById(mode.templateId) : undefined;
    const mi = mode.mistakeIndex ?? 0;
    const mistake = spec?.mistakes[mi];
    if (!spec || !mistake || mistake.traceRef.pending === true) {
      return (
        <main className="p-6 text-sm text-danger">
          Непознат шаблон/грешка: {mode.templateId} m{mi}
        </main>
      );
    }
    // Same id format as clipIdFor (learning/clipPilot) — the manifest law.
    const entry: ClipPilotEntry = {
      id: `${spec.id}__m${mi}`,
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
          <span className="font-mono text-xs text-muted">{entry.id}</span>
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
              следа {run.trace.meta.durationSec.toFixed(1)} с
            </p>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost self-start px-3 py-2 text-sm"
            onClick={() => {
              loadRun(entry)
                .then((r) => {
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
