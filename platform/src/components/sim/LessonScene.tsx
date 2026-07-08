"use client";

/**
 * LessonScene — THE integrated 3D world (client-only; mounted by SceneSlot via
 * next/dynamic ssr:false so rapier wasm never runs during SSR/build).
 *
 * Fuses every P5 subsystem into one canvas:
 *   SimEnvironment (sky/light/rain) · DistrictWorld (real Sofia) ·
 *   VehicleRig („Виток" physics car) · TrafficLayer (cars + pedestrians) ·
 *   CameraRig (chase/cockpit) · WorldRuntime (signals + SimTick emission).
 *
 * Per frame: runtime.update → traffic.update → runtime.sample → onTick, which
 * feeds the lesson engine (rules + objectives + HUD) owned by LessonPlayShell.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import type { Group } from "three";
import {
  createTelemetry,
  isTouchOnlyDevice,
  SimInput,
} from "@/modules/sim/engine";
import {
  FIXED_DT,
  GRAVITY,
  SPAWN,
  CHASE_FOV,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  type DifficultyMode,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { LessonSpec } from "@/modules/sim/lessons";
import type { PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { MinimapFrame } from "@/modules/sim/hud";
import { SimEnvironment, WindshieldDroplets } from "@/modules/sim/environment";
import {
  DistrictWorld,
  buildWorldGeometry,
  assertDistrict,
  type WorldGeometry,
} from "@/modules/sim/world";
import { createWorldRuntime } from "@/modules/sim/runtime";
import { createTrafficSystem } from "@/modules/sim/traffic";
import { CabinControls } from "./cabin";
import { SimAudio } from "./simAudio";
import { CameraRig, type CameraMode } from "./CameraRig";
import { VehicleRig, type VehicleSpawn } from "./VehicleRig";
import { createVehicleSample } from "./vehicleSample";
import { buildMinimapPolylines } from "./lessonMinimap";
import type { QualityPreset } from "./lesson-ui/types";

// Minimal structural mirrors of the district shapes we read here — the runtime
// and world modules each validate the full document.
interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading: number;
}

const MINIMAP_MS = 200;
const MINIMAP_PX_PER_M = 0.5;

/** lesson-ui preset ("medium") → world/environment level ("med"). */
function toLevel(q: QualityPreset): "low" | "med" | "high" {
  return q === "medium" ? "med" : q;
}

/** Convert a district spawn (x east, y north, heading cw-from-north) to a
 *  three.js chassis pose. Vertical drop reuses the tested SPAWN.y. */
function spawnPose(
  lesson: LessonSpec,
  spawnPoints: SpawnPointLike[],
): VehicleSpawn {
  const explicit = lesson.spawn.position;
  let x: number;
  let yNorth: number;
  let headingDeg: number;
  if (lesson.spawn.pointId) {
    const p = spawnPoints.find((s) => s.id === lesson.spawn.pointId);
    x = p?.x ?? explicit?.x ?? 0;
    yNorth = p?.y ?? explicit?.y ?? 0;
    headingDeg = p?.heading ?? lesson.spawn.headingDeg ?? 0;
  } else {
    x = explicit?.x ?? 0;
    yNorth = explicit?.y ?? 0;
    headingDeg = lesson.spawn.headingDeg ?? 0;
  }
  // district (x, yNorth) → three.js (x, _, −yNorth); yaw = π − heading.
  return {
    x,
    y: SPAWN.y,
    z: -yNorth,
    yawRad: Math.PI - (headingDeg * Math.PI) / 180,
  };
}

interface Built {
  runtime: ReturnType<typeof createWorldRuntime>;
  geometry: WorldGeometry;
  district: ReturnType<typeof assertDistrict>;
  traffic: ReturnType<typeof createTrafficSystem>;
  minimapPolylines: MinimapFrame["polylines"];
  spawnPoints: SpawnPointLike[];
}

export interface LessonSceneProps {
  lesson: LessonSpec;
  quality: QualityPreset;
  paused: boolean;
  onTick: (tick: SimTick) => void;
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  onMinimapFrame: (frame: MinimapFrame) => void;
}

export default function LessonScene(props: LessonSceneProps) {
  const { paused, onTick, onMinimapFrame } = props;

  const [touchBlocked] = useState(() => isTouchOnlyDevice());
  const [built, setBuilt] = useState<Built | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [menuPaused, setMenuPaused] = useState(false);

  // Load the district once, build runtime + geometry + traffic client-side.
  useEffect(() => {
    if (touchBlocked) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/world/district-v1.json");
        if (!res.ok) throw new Error(`district ${res.status}`);
        const raw: unknown = await res.json();
        const runtime = createWorldRuntime(raw);
        const district = assertDistrict(raw);
        const geometry = buildWorldGeometry(district);
        const traffic = createTrafficSystem(
          raw as Parameters<typeof createTrafficSystem>[0],
        );
        runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
        const spawnPoints = (
          (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? []
        );
        if (alive) {
          setBuilt({
            runtime,
            geometry,
            district,
            traffic,
            minimapPolylines: buildMinimapPolylines(district),
            spawnPoints,
          });
        }
      } catch (err) {
        console.error("LessonScene: failed to build world", err);
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [touchBlocked]);

  if (touchBlocked) {
    return (
      <GateCard
        icon="⌨️"
        title="Симулаторът изисква клавиатура"
        body="Управлява се с клавиши (WASD/стрелки). Отвори тази страница на компютър, за да подкараш колата."
      />
    );
  }
  if (loadError) {
    return (
      <GateCard
        icon="⚠️"
        title="Светът не се зареди"
        body="Данните за Студентски град не успяха да се заредят. Провери връзката и опитай пак."
      />
    );
  }
  if (!built) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">Зареждане на Студентски град…</p>
        </div>
      </div>
    );
  }

  return (
    <ReadyScene
      {...props}
      built={built}
      menuPaused={menuPaused}
      setMenuPaused={setMenuPaused}
      physicsPaused={paused || menuPaused}
      onMinimap={onMinimapFrame}
      onTickCb={onTick}
    />
  );
}

function ReadyScene({
  lesson,
  quality,
  built,
  menuPaused,
  setMenuPaused,
  physicsPaused,
  onMinimap,
  onTickCb,
}: LessonSceneProps & {
  built: Built;
  menuPaused: boolean;
  setMenuPaused: (v: boolean) => void;
  physicsPaused: boolean;
  onMinimap: (f: MinimapFrame) => void;
  onTickCb: (t: SimTick) => void;
}) {
  const { runtime, geometry, district, traffic, minimapPolylines, spawnPoints } =
    built;

  const timeOfDay = lesson.environment?.timeOfDay ?? "day";
  const rain = lesson.environment?.rain ?? false;
  const isNight = timeOfDay === "night";
  const level = toLevel(quality);
  const spawn = useMemo(() => spawnPose(lesson, spawnPoints), [lesson, spawnPoints]);

  // Shared mutable channels (refs → zero re-renders at frame rate).
  const telemetryRef = useRef(createTelemetry());
  const simRef = useRef<VehicleSim | null>(null);
  const chassisGroupRef = useRef<Group | null>(null);
  const cameraModeRef = useRef<CameraMode>("cockpit");
  const inputRef = useRef<SimInput | null>(null);
  const cabinRef = useRef<CabinControls | null>(null);
  const audioRef = useRef<SimAudio | null>(null);
  const sampleRef = useRef<VehicleSample>(createVehicleSample());
  const [cockpit, setCockpit] = useState(true);
  const [difficulty, setDifficulty] = useState<DifficultyMode>(DEFAULT_DIFFICULTY);
  const difficultyRef = useRef<DifficultyMode>(DEFAULT_DIFFICULTY);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  // Input + cabin + audio lifecycle.
  useEffect(() => {
    const input = new SimInput({
      onToggleCamera: () => {
        cameraModeRef.current =
          cameraModeRef.current === "chase" ? "cockpit" : "chase";
        setCockpit(cameraModeRef.current === "cockpit");
      },
      onReset: () => simRef.current?.reset(),
      onTogglePause: () => setMenuPaused(!menuPaused),
    });
    inputRef.current = input;
    const audio = new SimAudio();
    audioRef.current = audio;
    const cabin = new CabinControls({
      onSeatbeltToggle: () => audio.click(),
      onToggleMute: () => audio.toggleMute(),
    });
    cabinRef.current = cabin;
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
    // menuPaused intentionally excluded — the handler reads it via closure at
    // toggle time; re-subscribing every toggle would drop key state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMenuPaused]);

  const getSignalPhase = useCallback(
    (id: string) => runtime.signalPhase(id),
    [runtime],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, level === "low" ? 1 : 1.5]}
        camera={{
          fov: CHASE_FOV,
          near: 0.1,
          far: 900,
          position: [spawn.x - 6, spawn.y + 2.4, spawn.z],
        }}
        gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
      >
        <SimEnvironment timeOfDay={timeOfDay} rain={rain} quality={level} />
        <Suspense fallback={null}>
          <Physics
            gravity={[0, GRAVITY, 0]}
            timeStep={FIXED_DT}
            interpolate
            paused={physicsPaused}
            updateLoop="follow"
          >
            <DistrictWorld
              district={district}
              prebuilt={geometry}
              quality={level}
              night={isNight}
              getSignalPhase={getSignalPhase}
              signSvgBaseUrl={null}
            />
            <VehicleRig
              simRef={simRef}
              chassisGroupRef={chassisGroupRef}
              inputRef={inputRef}
              cabinRef={cabinRef}
              audioRef={audioRef}
              sampleRef={sampleRef}
              paused={physicsPaused}
              spawn={spawn}
              difficultyRef={difficultyRef}
            />
            <RuntimeDriver
              runtime={runtime}
              traffic={traffic}
              sampleRef={sampleRef}
              onTick={onTickCb}
              onMinimap={onMinimap}
              minimapPolylines={minimapPolylines}
              isNight={isNight}
              paused={physicsPaused}
            />
          </Physics>
        </Suspense>
        <CameraRig
          chassisGroupRef={chassisGroupRef}
          simRef={simRef}
          cameraModeRef={cameraModeRef}
          cabinRef={cabinRef}
          telemetryRef={telemetryRef}
        />
        {cockpit && rain ? <WindshieldDroplets /> : null}
      </Canvas>

      {/* Controls hint */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background/70 px-3 py-1 text-[10px] text-muted backdrop-blur">
        WASD — кормуване · C — изглед · R — рестарт · Esc — пауза
      </div>

      {/* Difficulty selector — top right */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur">
        {DIFFICULTY_ORDER.map((mode) => {
          const active = mode === difficulty;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDifficulty(mode)}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {DIFFICULTY_PRESETS[mode].labelBg}
            </button>
          );
        })}
      </div>

      {menuPaused ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Пауза"
        >
          <div className="card flex w-64 flex-col gap-3 p-6 text-center">
            <h2 className="text-xl font-bold">Пауза</h2>
            <button
              type="button"
              autoFocus
              className="btn-accent"
              onClick={() => setMenuPaused(false)}
            >
              Продължи
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

/** In-canvas per-frame driver: signals → traffic → sample → onTick + minimap. */
function RuntimeDriver({
  runtime,
  traffic,
  sampleRef,
  onTick,
  onMinimap,
  minimapPolylines,
  isNight,
  paused,
}: {
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: ReturnType<typeof createTrafficSystem>;
  sampleRef: React.RefObject<VehicleSample>;
  onTick: (t: SimTick) => void;
  onMinimap: (f: MinimapFrame) => void;
  minimapPolylines: MinimapFrame["polylines"];
  isNight: boolean;
  paused: boolean;
}) {
  const tRef = useRef(0);
  const lastMinimapRef = useRef(0);

  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.1);
    tRef.current += dt;
    const sample = sampleRef.current;

    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: sample.position.x, y: sample.position.y },
      playerSpeedKmh: sample.speedKmh,
      playerHeadingDeg: sample.headingDeg,
    });
    const tick = runtime.sample(sample, tRef.current, isNight);
    onTick(tick);

    const nowMs = tRef.current * 1000;
    if (nowMs - lastMinimapRef.current >= MINIMAP_MS) {
      lastMinimapRef.current = nowMs;
      onMinimap({
        polylines: minimapPolylines,
        transform: {
          centerX: sample.position.x,
          centerY: sample.position.y,
          pxPerMeter: MINIMAP_PX_PER_M,
        },
      });
    }
  });

  return null;
}

function GateCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          {icon}
        </p>
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <Link href="/dashboard" className="btn-ghost mt-6">
          Обратно към началото
        </Link>
      </div>
    </div>
  );
}
