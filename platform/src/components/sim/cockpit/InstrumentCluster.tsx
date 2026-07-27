"use client";

/**
 * „Виток" 3D instrument cluster — the founder's headline call after reviewing
 * every reel: „Dashboard needs complete futuristic 3d redesign".
 *
 * WHAT CHANGED, AND WHY IT IS THIS. The cluster used to be a 512×256 canvas
 * face painted onto a flat quad, plus — in the clips — a footer strip with the
 * word „КОЛАН" beside a red icon. The founder's verdict on that was exact: a
 * label is not a telltale („unacceptable"), and three speed/gear reels were
 * unreadable because an exterior clip has no instrument in it at all. So the
 * cluster is now REAL GEOMETRY with emissive faces:
 *
 *   - a bezel with depth and a lit top edge (doc 83 §3 — on a black ground,
 *     elevation is a lit edge and a hairline, never a drop shadow);
 *   - a sweeping needle AND an exact mono readout on the same dial;
 *   - a big gear glyph — the thing three unreadable reels were teaching;
 *   - a telltale rail whose lit lamps throw a halo, so a red belt warning
 *     reads as a WARNING from across a 1280×720 frame.
 *
 * It mounts two ways from one implementation, which is the point: portalled
 * onto the interior GLB's `screen_cluster` quad for the cockpit view, and
 * pinned in front of the capture camera for the „exterior+dashboard" reels.
 * Same instrument, same law, same look — so what the founder reviews in a reel
 * is what the student sees in the car.
 *
 * COST. Three draw calls (housing · atlas face · needle) and ~200 triangles
 * against perfBudget.ts's phone column of 70 draws / 250k tris. The face is one
 * atlas: ticks, lamps, halos, digits, captions and rules all share it, and the
 * per-frame work is writing floats into two attributes — the atlas canvas is
 * painted once at mount and never again.
 *
 * NOT A GRADING PATH. Everything here is presentation over state that already
 * existed. No rule-engine input is read or written; no verdict can move.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  LinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Group,
  type Object3D,
} from "three";
import {
  ATLAS_H,
  ATLAS_W,
  CLUSTER_PALETTE,
  DIAL_CX,
  DIAL_CY,
  FACE_W,
  LAMP_KEYS,
  NEEDLE_Z,
  buildClusterFaceMesh,
  buildClusterHousingMesh,
  buildClusterNeedleMesh,
  cellUv,
  charCell,
  clusterReadout,
  clusterReadoutHash,
  createClusterInputs,
  createClusterReadout,
  dialAngleRad,
  drawClusterAtlas,
  hexRgba,
  writeQuadColor,
  writeQuadUv,
  type ClusterInputs,
  type LampTone,
  type Rgba,
} from "@/modules/sim/cockpit";

/** Telltale pulse rate. Slow enough to read as an instrument warning, fast
 *  enough that a 3-second reel beat contains a full cycle. */
const PULSE_HZ = 1.4;
/** How far a pulsing lamp dips — never to nothing: a warning that blinks OUT
 *  can be missed between two frames of a 30 fps recording. */
const PULSE_FLOOR = 0.42;

/** Lit colour + halo strength per tone. The halo is the thing that makes a lamp
 *  legible at reel scale; the founder's complaint was a lamp he had to look for. */
const TONE: Record<Exclude<LampTone, "off">, { color: Rgba; halo: number }> = {
  warn: { color: hexRgba(CLUSTER_PALETTE.warn), halo: 0.62 },
  caution: { color: hexRgba(CLUSTER_PALETTE.caution), halo: 0.46 },
  go: { color: hexRgba(CLUSTER_PALETTE.go), halo: 0.5 },
};

/** An unlit lamp is still there — a dark glyph in its housing, like a real
 *  cluster at night. Reading "nothing is wrong" is information too. */
const LAMP_DARK = hexRgba(CLUSTER_PALETTE.rule);
const HALO_CLEAR = hexRgba("#000000", 0);
const TICK_DARK = hexRgba(CLUSTER_PALETTE.rule);
const TICK_LIT = hexRgba(CLUSTER_PALETTE.accent);
const TICK_HEAD = hexRgba(CLUSTER_PALETTE.accentSoft);

/** Scratch colour written by the frame loop (allocation-free useFrame). */
const scratchColor: Rgba = { r: 0, g: 0, b: 0, a: 1 };

export interface InstrumentClusterProps {
  /** Face-plate width in metres; the 2:1 face and everything on it scale with
   *  it (0.30 m = the interior GLB's cluster quad). */
  widthM: number;
  /** Fill the shared inputs object for THIS frame. Called once per frame and
   *  must not allocate — the sim's ref-feed grammar. */
  sample: (out: ClusterInputs) => void;
  /**
   * Camera-pinned chrome rather than an object in the cabin: depth-test off so
   * the cluster is never occluded by the world in front of it. Quad order in
   * the geometry builder is back-to-front precisely so this stays correct.
   */
  overlay?: boolean;
  /** Render layer for every mesh (the cabin uses INTERIOR_LAYER so the mirror
   *  render-to-texture cameras never see the cluster). */
  layer?: number;
  /** Base renderOrder; the three meshes take base, base+1, base+2. */
  renderOrder?: number;
}

export function InstrumentCluster({
  widthM,
  sample,
  overlay = false,
  layer,
  renderOrder = 0,
}: InstrumentClusterProps) {
  const groupRef = useRef<Group>(null);
  const needleRef = useRef<Object3D>(null);

  // --- Atlas: painted once, never redrawn ---------------------------------
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const ctx = canvas.getContext("2d");
    if (ctx) drawClusterAtlas(ctx);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    // No mipmaps: the atlas packs unrelated cells side by side, and a deep mip
    // bleeds a neighbouring glyph into a lamp. The cluster is never minified
    // hard enough for aliasing to be the worse trade.
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  // --- Geometry: built once from the pure builders --------------------------
  const built = useMemo(() => {
    const face = buildClusterFaceMesh();
    const housing = buildClusterHousingMesh();
    const needle = buildClusterNeedleMesh();

    const faceGeometry = new BufferGeometry();
    const faceColors = new BufferAttribute(face.colors, 4);
    const faceUvs = new BufferAttribute(face.uvs, 2);
    // Both are rewritten in the frame loop — colours every frame (the pulse),
    // UVs only when the readout's digits/gear/tick-fill actually change.
    faceColors.setUsage(DynamicDrawUsage);
    faceUvs.setUsage(DynamicDrawUsage);
    faceGeometry.setAttribute("position", new BufferAttribute(face.positions, 3));
    faceGeometry.setAttribute("uv", faceUvs);
    faceGeometry.setAttribute("color", faceColors);
    faceGeometry.setIndex(new BufferAttribute(face.indices, 1));

    const housingGeometry = new BufferGeometry();
    housingGeometry.setAttribute("position", new BufferAttribute(housing.positions, 3));
    housingGeometry.setAttribute("color", new BufferAttribute(housing.colors, 4));
    housingGeometry.setIndex(new BufferAttribute(housing.indices, 1));

    const needleGeometry = new BufferGeometry();
    needleGeometry.setAttribute("position", new BufferAttribute(needle.positions, 3));
    needleGeometry.setAttribute("uv", new BufferAttribute(needle.uvs, 2));
    needleGeometry.setAttribute("color", new BufferAttribute(needle.colors, 4));
    needleGeometry.setIndex(new BufferAttribute(needle.indices, 1));

    return { face, faceGeometry, housingGeometry, needleGeometry, faceColors, faceUvs };
  }, []);

  useEffect(() => {
    const { faceGeometry, housingGeometry, needleGeometry } = built;
    return () => {
      faceGeometry.dispose();
      housingGeometry.dispose();
      needleGeometry.dispose();
    };
  }, [built]);

  const materials = useMemo(() => {
    const housing = new MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      depthTest: !overlay,
    });
    const shared = {
      map: texture,
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      // The emissive art is chrome ON the face plate; it must never write depth
      // over the needle or over the halo behind a glyph.
      depthWrite: false,
      depthTest: !overlay,
    } as const;
    return {
      housing,
      face: new MeshBasicMaterial(shared),
      needle: new MeshBasicMaterial(shared),
    };
  }, [texture, overlay]);

  useEffect(() => {
    const { housing, face, needle } = materials;
    return () => {
      housing.dispose();
      face.dispose();
      needle.dispose();
    };
  }, [materials]);

  // Render layer (cabin) — applied to the whole subtree after mount.
  useEffect(() => {
    const group = groupRef.current;
    if (!group || layer === undefined) return;
    group.traverse((o) => o.layers.set(layer));
  }, [layer]);

  // --- Per-frame state (refs only — nothing here may re-render React) -------
  const runtime = useRef({
    inputs: createClusterInputs(),
    readout: createClusterReadout(),
    lastHash: "",
    elapsed: 0,
  });

  useFrame((_, delta) => {
    const rt = runtime.current;
    rt.elapsed += delta;
    sample(rt.inputs);
    const readout = clusterReadout(rt.inputs, rt.readout);

    // Needle sweeps at frame rate — it is the one thing that must never be
    // quantised to the readout's change detector.
    const needle = needleRef.current;
    if (needle) needle.rotation.z = dialAngleRad(rt.inputs.speedKmh);

    const colors = built.faceColors.array as Float32Array;
    const pulse =
      PULSE_FLOOR +
      (1 - PULSE_FLOOR) * (0.5 + 0.5 * Math.sin(rt.elapsed * PULSE_HZ * 2 * Math.PI));

    // Telltales: glyph tinted toward its tone, halo opened behind it.
    for (const key of LAMP_KEYS) {
      const lamp = readout.lamps[key];
      const glyphQuad = built.face.lampGlyphQuad[key];
      const haloQuad = built.face.lampHaloQuad[key];
      if (lamp.tone === "off") {
        writeQuadColor(colors, glyphQuad, LAMP_DARK);
        writeQuadColor(colors, haloQuad, HALO_CLEAR);
        continue;
      }
      const spec = TONE[lamp.tone];
      const k = lamp.pulse ? pulse : 1;
      // Lerp from the dark housing colour so a dimmed lamp reads as a lamp
      // turning down, not as a lamp fading into the background.
      scratchColor.r = LAMP_DARK.r + (spec.color.r - LAMP_DARK.r) * k;
      scratchColor.g = LAMP_DARK.g + (spec.color.g - LAMP_DARK.g) * k;
      scratchColor.b = LAMP_DARK.b + (spec.color.b - LAMP_DARK.b) * k;
      scratchColor.a = 1;
      writeQuadColor(colors, glyphQuad, scratchColor);
      scratchColor.r = spec.color.r;
      scratchColor.g = spec.color.g;
      scratchColor.b = spec.color.b;
      scratchColor.a = spec.halo * k;
      writeQuadColor(colors, haloQuad, scratchColor);
    }

    // Dial fill — the arc lights up to the current speed, so the reel reads a
    // rate even at a size where the needle is a few pixels.
    for (let i = 0; i < built.face.tickQuad.length; i++) {
      const lit = i < readout.litTicks;
      const head = lit && i === readout.litTicks - 1;
      writeQuadColor(colors, built.face.tickQuad[i], head ? TICK_HEAD : lit ? TICK_LIT : TICK_DARK);
    }
    built.faceColors.needsUpdate = true;

    // Digits + gear: an atlas re-point, so gated on the change detector.
    const hash = clusterReadoutHash(readout);
    if (hash !== rt.lastHash) {
      rt.lastHash = hash;
      const uvs = built.faceUvs.array as Float32Array;
      for (let i = 0; i < built.face.digitQuad.length; i++) {
        writeQuadUv(uvs, built.face.digitQuad[i], cellUv(charCell(readout.digits[i])));
      }
      writeQuadUv(uvs, built.face.gearQuad, cellUv(charCell(readout.gearChar)));
      built.faceUvs.needsUpdate = true;
    }
  });

  const scale = widthM / FACE_W;

  return (
    <group ref={groupRef} scale={scale}>
      <mesh
        geometry={built.housingGeometry}
        material={materials.housing}
        renderOrder={renderOrder}
        frustumCulled={false}
      />
      <mesh
        geometry={built.faceGeometry}
        material={materials.face}
        renderOrder={renderOrder + 1}
        frustumCulled={false}
      />
      <group ref={needleRef} position={[DIAL_CX, DIAL_CY, NEEDLE_Z]}>
        <mesh
          geometry={built.needleGeometry}
          material={materials.needle}
          renderOrder={renderOrder + 2}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}
