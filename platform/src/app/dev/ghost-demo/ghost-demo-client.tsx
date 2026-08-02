"use client";

/**
 * Client half of the S0-View dev harness: ensures `?ghost=demo` is on the
 * URL (LessonScene's flag read), then mounts the real LessonScene with the
 * полигон free-drive spec and no-op shell callbacks. The 3D stack loads
 * client-side only (the SceneSlot ssr:false law — rapier wasm never runs
 * during SSR/build).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SimTick } from "@/modules/sim/rules";
import type { ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";

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
  // `?lesson=<lessonId>` mounts THAT lesson instead of полигон free-drive, so a
  // world-geometry change can be looked at from the real cockpit — dashboard,
  // A-pillars, mirrors and all — without a login or a recorded trace. Doc 66 R0:
  // „fixed" without a frame is not fixed, and the frame has to be the one the
  // student actually sits in. Absent ⇒ the shipped полигон demo, unchanged.
  const [lessonId, setLessonId] = useState<string | null>(null);
  // `?scenario=<templateId>[&level=N]` compiles a SCENARIO rung and mounts it
  // here instead. `?lesson=` can only reach the hand-authored curriculum
  // (lessonById), so before this the 150 scenario templates — i.e. everything
  // the founder actually plays and reviews — had no login-free cockpit at all,
  // and „look at what you built" meant driving the authed /simulator by hand.
  // The sibling harness /dev/hud-ux already accepts ?scenario=; this is the
  // same one-line resolution in the route that mounts the bare LessonScene.
  const [scenarioPick, setScenarioPick] = useState<{ id: string; level: ScenarioLevel } | null>(
    null,
  );
  // `?objective=N` mounts the scene with objective N active instead of 0.
  //
  // The A7 marker (the founder's „зелена линия") is drawn for the ACTIVE
  // objective only, and this harness has no lesson engine to advance it — so
  // without this flag the only marker any login-free frame could ever show was
  // objective 0. Three register rows (B25, B44, B24) are complaints about
  // where the marker of a LATER objective sits — „the green line stops at the
  // middle of the crossroad" — and none of them could be photographed.
  const [objectiveIndex, setObjectiveIndex] = useState(0);

  // The demo flag must be on the URL BEFORE the scene's load effect reads it.
  //
  // The extra render is the POINT and cannot be derived away (audit M-21):
  // effects run child-first, so anything that mounts <LessonScene> in the same
  // commit lets the scene's loader read the URL before this rewrite lands. The
  // gate has to hold the child back for one commit. A hydration-flag hook
  // (lib/hooks/clientEnv) is true on the first client render and would defeat
  // that ordering. Dev-only route; the cascading render costs nothing here.
  useEffect(() => {
    const url = new URL(window.location.href);
    const asked = url.searchParams.get("lesson");
    const scenario = url.searchParams.get("scenario");
    const levelRaw = Number(url.searchParams.get("level") ?? "1");
    // The ghost flag belongs to the полигон demo only — forcing it onto an
    // arbitrary lesson would mount a shadow car that lesson never authored.
    if (!asked && !scenario && url.searchParams.get("ghost") !== "demo") {
      url.searchParams.set("ghost", "demo");
      window.history.replaceState(null, "", url);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (asked) setLessonId(asked);
    if (scenario) {
      const level = ([1, 2, 3, 4, 5] as const).includes(levelRaw as ScenarioLevel)
        ? (levelRaw as ScenarioLevel)
        : 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setScenarioPick({ id: scenario, level });
    }
    const objectiveRaw = Number(url.searchParams.get("objective") ?? "0");
    if (Number.isInteger(objectiveRaw) && objectiveRaw >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setObjectiveIndex(objectiveRaw);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setReady(true);
  }, []);

  /**
   * Dev-only drive telemetry on `window.__ghostDemo`.
   *
   * Register B24 escalated an unanswered question: across three scenarios a
   * scripted drive „never accumulated distance", and nobody could tell whether
   * the teaching card was rewinding the drive or the harness never produced
   * motion at all — because every login-free harness no-ops `onTick`, so the
   * only observable was a speed readout that oscillated. Position is the
   * discriminator: a car that moves accumulates y, a rewound one does not.
   * Last sample + a bounded history, no React state (per-frame callback).
   */
  const telemetryRef = useRef<{ samples: number; first: SimTick | null }>({
    samples: 0,
    first: null,
  });
  const onTick = useCallback((tick: SimTick) => {
    const store = telemetryRef.current;
    store.first ??= tick;
    store.samples += 1;
    const w = window as unknown as { __ghostDemo?: unknown };
    w.__ghostDemo = {
      t: tick.t,
      speedKmh: tick.speedKmh,
      x: tick.position.x,
      y: tick.position.y,
      headingDeg: tick.headingDeg,
      gear: tick.gear,
      seatbeltOn: tick.seatbeltOn,
      samples: store.samples,
      /** Straight-line metres travelled since the first tick — the number that
       *  settles „did the car move" without trusting the speed needle. */
      travelledM: Math.hypot(
        tick.position.x - (store.first?.position.x ?? tick.position.x),
        tick.position.y - (store.first?.position.y ?? tick.position.y),
      ),
    };
  }, []);

  const spec = scenarioPick ? scenarioById(scenarioPick.id) : undefined;
  const lesson =
    spec && scenarioPick
      ? compileScenario(spec, scenarioPick.level)
      : lessonById(lessonId ?? "l0p-poligon-free");
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
          activeObjectiveIndex={objectiveIndex}
          onTick={onTick}
          onPreDriveStep={noop}
          onBlockedDriveAttempt={noop}
          onMinimapFrame={noop}
        />
      ) : null}
    </div>
  );
}
