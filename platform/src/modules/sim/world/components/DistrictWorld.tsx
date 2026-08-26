"use client";

/**
 * <DistrictWorld/> — the drivable Sofia district. Mount INSIDE an R3F
 * <Canvas> (and inside <Physics> unless physics={false}).
 *
 * The component is presentation-only: signal phase logic, zones and speed
 * limits live in sim/runtime (WorldRuntime). Wire the lamp state with
 * `getSignalPhase={(nodeId, bearing) => worldRuntime.signalLampState(nodeId, bearing)}`
 * — the mode- and approach-aware getter (doc 62 S1): dark clusters render
 * unlit, flashing-amber blinks on the runtime clock, and every head lights
 * its own arm's graded axis-group.
 *
 * Lighting is owned by sim/environment — this scene only needs an ambient +
 * directional light to look right; `night` toggles window/streetlight glow
 * to match the environment's time of day.
 *
 * ODbL: any product surface showing this world must also render
 * <OsmAttribution/> in its HUD (docs/simulation/17 §5).
 */

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { getSnowIntensity } from "@/modules/sim/environment";
import type { SignalLampState } from "../../contracts";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { setSnowCover } from "../textures/snowCover";
import type { BuildWorldOptions, District, WorldGeometry, WorldQuality } from "../types";
import { QUALITY_PRESETS } from "./quality";
import { StaticWorld } from "./StaticWorld";
import { WorldColliders } from "./WorldColliders";
import { WorldPropsGroup } from "./WorldProps";
import { WorldSchoolsGroup } from "./WorldSchools";

export interface DistrictWorldProps {
  /** Parsed content/world/district-v1.json (see assertDistrict). */
  district: District;
  /** Render quality preset (default "med"): shadows, texture size, tree density. */
  quality?: WorldQuality;
  /** Night mode: lit windows + streetlight glow. Default false. */
  night?: boolean;
  /** Lamp state per signal head — wire to WorldRuntime.signalLampState
   *  (mode- and approach-aware). Default: all green. */
  getSignalPhase?: (signalNodeId: string, approachBearingDeg: number) => SignalLampState;
  /** Guarded-crossing barrier-arm state (district meters) — wire to
   *  WorldRuntime.railBarrierDownAt so the arm animates in lockstep with the
   *  graded timetable. Default: arms hold the authored down pose. */
  getRailBarrierDown?: (x: number, y: number) => boolean;
  /**
   * Base URL serving content/signs/svg (b1/b2/v26/d11). Default
   * "/content/signs/svg"; pass null to keep the built-in procedural sign
   * faces (visually equivalent).
   */
  signSvgBaseUrl?: string | null;
  /** Include static rapier colliders (default true; needs <Physics> parent). */
  physics?: boolean;
  /** Pure-builder options (hand-polish junction overrides, tree density, seed). */
  buildOptions?: BuildWorldOptions;
  /** Reuse a prebuilt geometry (skips the ~200 ms build; overrides district). */
  prebuilt?: WorldGeometry;
}

export function DistrictWorld({
  district,
  quality = "med",
  night = false,
  getSignalPhase,
  getRailBarrierDown,
  signSvgBaseUrl = "/content/signs/svg",
  physics = true,
  buildOptions,
  prebuilt,
}: DistrictWorldProps) {
  const world = useMemo(
    () => prebuilt ?? buildWorldGeometry(district, buildOptions),
    [district, buildOptions, prebuilt],
  );
  const preset = QUALITY_PRESETS[quality];

  // THE ONE WRITER of the prop snow-cover uniform (textures/snowCover.ts).
  //
  // It lives HERE rather than inside WorldProps because this component is the
  // single mount point both halves of the world share, so „how much snow is
  // lying" is set once per frame for every hooked material at once — a single
  // float store, no re-render, no allocation, and no second writer that could
  // ever disagree with the first.
  //
  // Per FRAME rather than off `useSnowIntensity()`, and the reason is stated
  // exactly rather than dramatically: the React hook quantizes to 0.01, so it
  // would re-render this component ~85 times across the snow channel's 6 s
  // ramp. The instanced prop meshes are `useMemo`d on `world`/`assets`/`preset`
  // and would NOT be rebuilt by that — the cost is 85 reconciliations of the
  // whole world subtree, not 85 rebuilds. It is still the wrong shape: a
  // uniform wants a value, not a render.
  //
  // The value read is the same `getSnowIntensity()` that SkyDome, SnowFlakes
  // and StaticWorld's road mapping already read, so the accumulation on the
  // props, the flakes in the air, the haze and the brightened carriageway all
  // ramp on one channel and can never drift apart.
  useFrame(() => {
    setSnowCover(getSnowIntensity());
  });

  return (
    <group name="district-world">
      <StaticWorld world={world} preset={preset} night={night} />
      <WorldPropsGroup
        world={world}
        preset={preset}
        night={night}
        getSignalPhase={getSignalPhase}
        getRailBarrierDown={getRailBarrierDown}
        signSvgBaseUrl={signSvgBaseUrl}
      />
      {/* School name boards + yard railings (founder item 61). Renders nothing
          at all on the districts that author no `kind: "school"` building. */}
      <WorldSchoolsGroup schools={world.schools} night={night} />
      {physics ? <WorldColliders colliders={world.colliders} /> : null}
    </group>
  );
}
