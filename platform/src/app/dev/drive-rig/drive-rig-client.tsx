"use client";

/**
 * Client half of THE DRIVE RIG. The real LessonPlayShell — every fault card,
 * teach moment and objective banner exactly as the founder sees them — with the
 * per-tick telemetry tap wired into `window.__driveRig`, plus an on-screen
 * readout so a SINGLE SCREENSHOT carries the car's state next to the card.
 *
 * That last part is the whole point of the instrument. „Was that conviction
 * correct?" was unanswerable because the card and the speed lived on different
 * routes; now the frame that shows the card also shows 37.2 km/h at x/y, and
 * the ring buffer behind it holds the whole approach.
 *
 * URL:
 *   ?scenario=<templateId>[&level=1..5]   compile a scenario rung (default)
 *   ?lesson=<lessonId>                    a hand-authored curriculum lesson
 *   ?quality=low|medium|high              scene preset (default medium)
 *   ?script=<url-encoded JSON DriveStep[]> run this drive as soon as ticks start
 *   ?buf=<samples>                        ring-buffer depth (default 20000)
 *   ?readout=0                            hide the on-screen readout
 *
 * Client-only: the shell pulls the 3D stack through SceneSlot's ssr:false
 * dynamic import (rapier wasm must never run during SSR/build).
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import { DriveRig, parseDriveScript, type DriveStep } from "@/modules/sim/devrig";
import { LessonPlayShell } from "@/components/sim/lesson-ui/LessonPlayShell";
import type { QualityPreset } from "@/components/sim/lesson-ui/types";

const noop = () => undefined;

interface RigConfig {
  scenario: string | null;
  level: ScenarioLevel;
  lesson: string | null;
  quality: QualityPreset;
  script: DriveStep[] | null;
  scriptError: string | null;
  buffer: number;
  readout: boolean;
}

function readConfig(): RigConfig {
  const p = new URL(window.location.href).searchParams;
  const levelRaw = Number(p.get("level") ?? "1");
  const level = ([1, 2, 3, 4, 5] as const).includes(levelRaw as ScenarioLevel)
    ? (levelRaw as ScenarioLevel)
    : 1;
  const q = p.get("quality");
  const rawScript = p.get("script");
  const script = rawScript === null ? null : parseDriveScript(rawScript);
  const bufRaw = Number(p.get("buf") ?? "0");
  return {
    scenario: p.get("scenario"),
    level,
    lesson: p.get("lesson"),
    quality: q === "low" || q === "high" ? q : "medium",
    script,
    scriptError: rawScript !== null && script === null ? "?script= is not a valid DriveStep[]" : null,
    buffer: Number.isFinite(bufRaw) && bufRaw > 0 ? bufRaw : 0,
    readout: p.get("readout") !== "0",
  };
}

export function DriveRigClient() {
  // The URL is read in an effect (not useSearchParams) for the same reason
  // /dev/ghost-demo does it: the shell must not mount until the lesson it will
  // mount is known, and the extra commit costs nothing on a dev route.
  const [cfg, setCfg] = useState<RigConfig | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setCfg(readConfig());
  }, []);
  if (cfg === null) return null;
  return <Mounted cfg={cfg} />;
}

function Mounted({ cfg }: { cfg: RigConfig }) {
  const lesson = useMemo(() => {
    const spec = cfg.scenario !== null ? scenarioById(cfg.scenario) : undefined;
    if (spec !== undefined) return compileScenario(spec, cfg.level);
    return lessonById(cfg.lesson ?? "l0p-poligon-free") ?? lessonById("l0p-poligon-free") ?? null;
  }, [cfg.scenario, cfg.level, cfg.lesson]);

  const [rig] = useState(
    () =>
      new DriveRig({
        lessonId: lesson?.id ?? "(none)",
        lessonTitleBg: lesson?.titleBg ?? "",
        ...(cfg.buffer > 0 ? { buffer: cfg.buffer } : {}),
        ...(cfg.script !== null ? { autorun: cfg.script } : {}),
      }),
  );

  useEffect(() => {
    rig.publish();
    return () => rig.dispose();
  }, [rig]);

  if (lesson === null) return null;

  return (
    <div className="min-h-screen bg-background p-2">
      <LessonPlayShell
        lesson={lesson}
        quality={cfg.quality}
        nextLesson={null}
        onExitToSelect={noop}
        onStartLesson={noop}
        onDevTelemetry={rig.onTick}
      />
      {cfg.readout ? <Readout rig={rig} scriptError={cfg.scriptError} /> : null}
    </div>
  );
}

/**
 * THE FRAME'S OWN INSTRUMENTS. Polled at 5 Hz off the rig's last sample — never
 * per frame, and never through React state on the tick path.
 *
 * PORTALLED INTO `[data-sim-shell]`, and that is not a detail. The shell's root
 * is the FULLSCREEN element, and a browser paints the fullscreen element in the
 * TOP LAYER — so a readout rendered as its sibling vanishes from every frame
 * the moment the session goes fullscreen, whatever its z-index. The first
 * held-glance frame this rig shot came back with no readout at all for exactly
 * that reason. The shell marks this node as the portal host for precisely this
 * problem (see the comment on `rootRef` in LessonPlayShell); body is the
 * fallback for the frames shot before the shell has mounted.
 *
 * Bottom-LEFT and pointer-events-none: the cards live in the top rail and the
 * centre, so this cannot cover the thing being photographed. Lifted clear of
 * the bottom edge because Next's dev-tools badge parks there and its
 * „Compiling" pill sat on the speed readout in the first frame produced here.
 */
function Readout({ rig, scriptError }: { rig: DriveRig; scriptError: string | null }) {
  const [, force] = useState(0);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      force((n) => n + 1);
      // The shell mounts (and remounts) asynchronously; re-resolve the host
      // rather than caching a node that a scene epoch bump has replaced.
      setHost((h) => {
        const next = document.querySelector("[data-sim-shell]") ?? document.body;
        return h === next ? h : next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  const s = rig.handle.last;
  const st = rig.handle.status();
  if (host === null) return null;
  return createPortal(
    <div
      data-testid="drive-rig-readout"
      className="pointer-events-none fixed bottom-12 left-1 z-[60] rounded bg-black/75 px-2 py-1 font-mono text-[11px] leading-tight text-lime-300"
    >
      {scriptError !== null ? <div className="text-red-400">{scriptError}</div> : null}
      {s === null ? (
        <div>drive-rig: waiting for first tick…</div>
      ) : (
        <>
          <div>
            t={s.tSec.toFixed(2)}s v={s.speedKmh.toFixed(1)}km/h x={s.x.toFixed(1)} y=
            {s.y.toFixed(1)} hdg={s.headingDeg.toFixed(0)}°
          </div>
          <div>
            gear={s.gear} phase={s.phase} obj={s.activeObjective}/{s.objectiveCount} events=
            {s.eventCount}
          </div>
          {/* B69 — a FOLLOWING drill is graded in seconds and staged in metres,
              so the frame has to carry both or it cannot settle whether the
              demonstration obeys the instruction it prints. */}
          {s.leadGapM !== undefined && Number.isFinite(s.leadGapM) ? (
            <div>
              lead={s.leadGapM.toFixed(1)}m
              {s.speedKmh > 1
                ? ` = ${(s.leadGapM / (s.speedKmh / 3.6)).toFixed(2)}s @ ${s.speedKmh.toFixed(0)}km/h`
                : ""}
            </div>
          ) : null}
          <div>
            thr={s.throttle.toFixed(2)} brk={s.brake.toFixed(2)} str={s.steer.toFixed(2)} step=
            {st.stepIndex}
            {st.stepLabel !== "" ? ` "${st.stepLabel}"` : ""}
            {st.heldKeys.length > 0 ? ` keys=${st.heldKeys.join("+")}` : ""}
          </div>
        </>
      )}
    </div>,
    host,
  );
}
