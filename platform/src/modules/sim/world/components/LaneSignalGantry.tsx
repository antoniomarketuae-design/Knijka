"use client";

/**
 * LaneSignalGantry — the overhead lane-control signal gantry (doc 72 LC „сигнал
 * над лентата"). A code-built structure (no new engine): two galvanised posts
 * carrying a horizontal beam across the carriageway, with two EMISSIVE face
 * panels — a red ✕ over the CLOSED lane and a green ↓ over the OPEN lane. The
 * glyphs are painted onto a CanvasTexture and shown on an unlit (toneMapped:
 * false) MeshBasicMaterial — the same lit-quad trick TrafficLayer uses for the
 * indicator / strobe lamps, so the panels read as backlit signs at any hour.
 *
 * Render-ONLY, gated entirely on `district.meta.scenario.laneGantry` — a
 * passthrough meta block; NO shipped map carries it, so this component mounts
 * ZERO geometry everywhere else (additive/bit-identity, like the zone signs).
 * Per the LOCKED lane-control decision, the gantry adds NO lane-signal engine
 * code: it is the VISUAL WHY for the WRONG_WAY drill (the X-closed lane is
 * modelled as oncoming traffic, graded by the existing WRONG_WAY detector).
 *
 * District→three mapping (the district-v1 law): (x east, y north) → (x, h, −y).
 */

import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

/** Passthrough meta the scenario map authors under meta.scenario.laneGantry. */
export interface LaneGantrySpec {
  /** District-space arclength (north metres) the gantry beam crosses at. */
  y: number;
  /** Lateral centre of the beam span, district metres east (default 0). */
  x?: number;
  /** Half-span of the beam either side of `x`, metres (default 9). */
  halfSpanM?: number;
  /** Beam clearance height above the road, metres (default 5.6). */
  heightM?: number;
  /** East offset of the CLOSED-lane ✕ panel (default −4). */
  closedLaneX?: number;
  /** East offset of the OPEN-lane ↓ panel (default +4). */
  openLaneX?: number;
}

/** Read the (optional) gantry spec off a loaded district's scenario meta. */
export function laneGantryOf(district: {
  meta?: { scenario?: unknown } | Record<string, unknown>;
}): LaneGantrySpec | null {
  const scenario = (district.meta as { scenario?: unknown } | undefined)?.scenario as
    | { laneGantry?: LaneGantrySpec }
    | undefined;
  const g = scenario?.laneGantry;
  if (!g || typeof g.y !== "number") return null;
  return g;
}

/** Paint a lane-signal glyph ("cross" red ✕ / "arrow" green ↓) onto a canvas. */
function glyphTexture(glyph: "cross" | "arrow"): CanvasTexture {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0d12"; // dark backing so the lit glyph pops
  ctx.fillRect(0, 0, S, S);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (glyph === "cross") {
    ctx.strokeStyle = "#ff2f2a"; // signal red
    ctx.lineWidth = 18;
    const m = 30;
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(S - m, S - m);
    ctx.moveTo(S - m, m);
    ctx.lineTo(m, S - m);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#2fd968"; // signal green
    ctx.fillStyle = "#2fd968";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(S / 2, 26);
    ctx.lineTo(S / 2, S - 40);
    ctx.stroke();
    ctx.beginPath(); // arrow head
    ctx.moveTo(S / 2, S - 22);
    ctx.lineTo(S / 2 - 30, S - 58);
    ctx.lineTo(S / 2 + 30, S - 58);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The gantry rig, built once from the spec. Owns all geometry/materials/
 * textures it creates (disposed on unmount). Returns null on the server / when
 * the district carries no laneGantry meta.
 */
export function LaneSignalGantry({
  district,
}: {
  district: { meta?: { scenario?: unknown } | Record<string, unknown> };
}) {
  const spec = laneGantryOf(district);

  const rig = useMemo(() => {
    if (!spec || typeof document === "undefined") return null;
    const x = spec.x ?? 0;
    const halfSpan = spec.halfSpanM ?? 9;
    const height = spec.heightM ?? 5.6;
    const closedX = spec.closedLaneX ?? -4;
    const openX = spec.openLaneX ?? 4;

    const group = new Group();
    group.name = "lane-signal-gantry";
    // District (x, y) → three (x, h, −y): the beam sits over y = spec.y.
    group.position.set(x, 0, -spec.y);

    const steel = new MeshStandardMaterial({
      color: 0x8b9199,
      metalness: 0.6,
      roughness: 0.45,
      envMapIntensity: 1.3,
    });
    steel.name = "gantry_steel";

    // Two posts (reuse of the barrier-arm silhouette — plain galvanised box
    // uprights) + the horizontal beam across the carriageway.
    const postGeo = new BoxGeometry(0.32, height, 0.32);
    const beamGeo = new BoxGeometry(halfSpan * 2 + 0.6, 0.42, 0.42);
    const postL = new Mesh(postGeo, steel);
    postL.position.set(-halfSpan, height / 2, 0);
    postL.castShadow = true;
    const postR = new Mesh(postGeo, steel);
    postR.position.set(halfSpan, height / 2, 0);
    postR.castShadow = true;
    const beam = new Mesh(beamGeo, steel);
    beam.position.set(0, height + 0.2, 0);
    beam.castShadow = true;
    group.add(postL, postR, beam);

    // Two emissive face panels hanging under the beam, facing the approaching
    // driver (local −Z faces south / the driver; district maps travel north).
    const crossTex = glyphTexture("cross");
    const arrowTex = glyphTexture("arrow");
    // DoubleSide: the driver (and the review chase-cam) approach the gantry
    // from the SOUTH (+Z) heading north, so the panel must be visible from the
    // +Z side; a single-sided plane facing −Z is culled from behind and reads
    // as a bare beam (R0 fault). Double-sided shows the backlit glyph from
    // either approach — the ✕/↓ stay legible mirrored.
    const crossMat = new MeshBasicMaterial({ map: crossTex, toneMapped: false, side: DoubleSide });
    crossMat.name = "gantry_cross";
    const arrowMat = new MeshBasicMaterial({ map: arrowTex, toneMapped: false, side: DoubleSide });
    arrowMat.name = "gantry_arrow";
    const panelGeo = new PlaneGeometry(2.2, 2.2); // read at chase-cam distance
    const panelY = height - 1.2;
    const crossPanel = new Mesh(panelGeo, crossMat); // over the CLOSED lane
    crossPanel.position.set(closedX, panelY, -0.28);
    const arrowPanel = new Mesh(panelGeo, arrowMat); // over the OPEN lane
    arrowPanel.position.set(openX, panelY, -0.28);
    group.add(crossPanel, arrowPanel);

    return {
      group,
      dispose: () => {
        postGeo.dispose();
        beamGeo.dispose();
        panelGeo.dispose();
        steel.dispose();
        crossMat.dispose();
        arrowMat.dispose();
        crossTex.dispose();
        arrowTex.dispose();
      },
    };
  }, [spec]);

  useEffect(() => () => rig?.dispose(), [rig]);

  if (!rig) return null;
  return <primitive object={rig.group} />;
}
