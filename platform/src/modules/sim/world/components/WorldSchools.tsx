"use client";

/**
 * <WorldSchoolsGroup/> — the dressing that makes a `kind: "school"` building
 * read as УЧИЛИЩЕ from the driving seat.
 *
 * Founder item 61: *„I see only Normal Buildings living/office building no
 * actual school when the question states there should be School, weak map
 * engineering which must be fixed, either build schools and put and name them
 * school, or find some solutions."* He asked for two things in one sentence —
 * BUILD it and NAME it — so this component draws exactly those two:
 *
 *  1. THE NAME BOARD. A lit panel over the entrance carrying real Bulgarian
 *     text, drawn to a canvas at load (no font asset, no GLB, no network).
 *     The word is the same word the lesson's own question uses.
 *  2. THE YARD RAILING. The green steel fence every Bulgarian school yard has,
 *     with a GATE gap at its centre — which is where the children stand, and
 *     the reason a driver in a зона 30 is being asked to slow down.
 *
 * Cost: ONE canvas texture + THREE meshes per district that has a school
 * (board panel, board frame, railing), and NOTHING AT ALL on the ~89 districts
 * that have none — `world.schools` is empty there and the component returns
 * null before it allocates anything.
 *
 * Geometry is built here rather than in the pure builder on purpose: a railing
 * is a repeated box, and instancing it beats merging 40 balusters into the
 * shared building mesh (which would also have made every district's building
 * buffers non-byte-identical). The PLACEMENTS are pure and testable
 * (builders/schools.ts); only the boxes are three.js.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { SchoolPlacement } from "../types";

/** Panel colours — the deep blue/white plate of a Bulgarian school name board. */
const BOARD_BG = "#123a6b";
const BOARD_INK = "#ffffff";
const BOARD_RULE = "#e8b93b";
/** Railing: the dark green steel of a school yard fence. */
const RAILING_COLOR = 0x2f5d3f;

const BALUSTER_SPACING_M = 1.15;
const BALUSTER_W_M = 0.06;
const RAIL_BAR_H_M = 0.07;

/**
 * The name board's face, drawn to a canvas. Deterministic and client-only
 * (needs `document`), like every other texture in sim/world/textures.
 *
 * Sizing is by MEASUREMENT, not by a guessed font size: the label is fitted to
 * 88 % of the panel width so a longer name (a real school's full name, when a
 * map ever authors one) shrinks instead of overflowing the plate.
 */
function makeSchoolBoardTexture(label: string): THREE.CanvasTexture {
  const W = 1024;
  const H = 192;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, W, H);
  // Gold rule top and bottom — the plate reads as signage, not as a billboard.
  ctx.fillStyle = BOARD_RULE;
  ctx.fillRect(0, 10, W, 6);
  ctx.fillRect(0, H - 16, W, 6);

  ctx.fillStyle = BOARD_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let px = 118;
  const fontAt = (p: number) => `700 ${p}px "Segoe UI", "Noto Sans", Arial, sans-serif`;
  ctx.font = fontAt(px);
  const target = W * 0.88;
  const measured = ctx.measureText(label).width;
  if (measured > target) {
    px = Math.max(40, Math.floor((px * target) / measured));
    ctx.font = fontAt(px);
  }
  ctx.fillText(label, W / 2, H / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

interface RailingBuild {
  geometry: THREE.BufferGeometry;
  count: number;
  matrices: THREE.Matrix4[];
}

/**
 * The yard fence as instanced boxes: vertical balusters at
 * BALUSTER_SPACING_M plus a top and a middle rail, skipping the gate gap.
 * One InstancedMesh for every school on the map.
 */
function buildRailing(schools: readonly SchoolPlacement[]): RailingBuild | null {
  const matrices: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (const s of schools) {
    const from = new THREE.Vector3(...s.railing.from);
    const to = new THREE.Vector3(...s.railing.to);
    const span = from.distanceTo(to);
    if (span < 1) continue;
    const dir = to.clone().sub(from).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    q.setFromAxisAngle(up, yaw);
    const h = s.railing.heightM;
    const gate = s.railing.gateHalfM;

    // Balusters, both halves of the run — the gate gap in the middle stays
    // empty because that is where the children come out.
    for (let d = gate; d <= span / 2; d += BALUSTER_SPACING_M) {
      for (const sgn of [-1, 1] as const) {
        const p = from.clone().addScaledVector(dir, span / 2 + sgn * d);
        matrices.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, h / 2, p.z),
            q,
            new THREE.Vector3(BALUSTER_W_M, h, BALUSTER_W_M),
          ),
        );
      }
    }
    // Two horizontal rails per side of the gate.
    const sideLen = span / 2 - gate;
    if (sideLen > 0.5) {
      for (const sgn of [-1, 1] as const) {
        const mid = from.clone().addScaledVector(dir, span / 2 + sgn * (gate + sideLen / 2));
        for (const y of [h - 0.08, h * 0.5]) {
          matrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(mid.x, y, mid.z),
              q,
              // Box local +Z runs along the railing after the yaw rotation.
              new THREE.Vector3(BALUSTER_W_M, RAIL_BAR_H_M, sideLen),
            ),
          );
        }
      }
    }
  }
  if (matrices.length === 0) return null;
  return { geometry: new THREE.BoxGeometry(1, 1, 1), count: matrices.length, matrices };
}

export interface WorldSchoolsProps {
  schools: readonly SchoolPlacement[];
  /** Lit board at night — a school name board is illuminated. */
  night?: boolean;
}

export function WorldSchoolsGroup({ schools, night = false }: WorldSchoolsProps) {
  const board = useMemo(() => {
    if (schools.length === 0 || typeof window === "undefined") return null;
    // One texture per DISTINCT label, not per school.
    const byLabel = new Map<string, THREE.CanvasTexture>();
    for (const s of schools) {
      if (!byLabel.has(s.labelBg)) byLabel.set(s.labelBg, makeSchoolBoardTexture(s.labelBg));
    }
    return byLabel;
  }, [schools]);

  const railing = useMemo(() => (schools.length === 0 ? null : buildRailing(schools)), [schools]);

  useEffect(() => {
    return () => {
      if (board) for (const t of board.values()) t.dispose();
      railing?.geometry.dispose();
    };
  }, [board, railing]);

  if (schools.length === 0) return null;

  return (
    <group name="world-schools">
      {schools.map((s) => {
        const tex = board?.get(s.labelBg) ?? null;
        return (
          <group key={s.buildingId} position={s.board.position} rotation={[0, s.board.yaw, 0]}>
            {/* The plate itself. */}
            <mesh name={`school-board-${s.buildingId}`} castShadow={false}>
              <boxGeometry args={[s.board.widthM, s.board.heightM, 0.18]} />
              {tex ? (
                <meshStandardMaterial
                  map={tex}
                  color="#ffffff"
                  roughness={0.55}
                  metalness={0}
                  emissiveMap={tex}
                  emissive={new THREE.Color(night ? 0x9fb4d6 : 0x33445e)}
                  emissiveIntensity={night ? 1.5 : 0.55}
                />
              ) : (
                <meshStandardMaterial color={BOARD_BG} roughness={0.6} metalness={0} />
              )}
            </mesh>
            {/* Frame, so the plate reads as mounted rather than painted on. */}
            <mesh position={[0, 0, -0.11]}>
              <boxGeometry args={[s.board.widthM + 0.24, s.board.heightM + 0.24, 0.08]} />
              <meshStandardMaterial color="#d8d2c4" roughness={0.75} metalness={0} />
            </mesh>
          </group>
        );
      })}
      {railing ? (
        <instancedMesh
          key={`school-railing-${railing.count}`}
          args={[railing.geometry, undefined, railing.count]}
          name="school-railing"
          ref={(mesh) => {
            if (!mesh) return;
            for (let i = 0; i < railing.matrices.length; i++) {
              mesh.setMatrixAt(i, railing.matrices[i]!);
            }
            mesh.instanceMatrix.needsUpdate = true;
            // An InstancedMesh culls on its OWN instance-aware bounding sphere
            // in three r185 — the base geometry's origin sphere never gets a
            // look in. See three-helpers.createInstancedMesh for the measured
            // cost of believing otherwise.
            mesh.frustumCulled = true;
            mesh.computeBoundingSphere();
          }}
        >
          <meshStandardMaterial color={RAILING_COLOR} roughness={0.5} metalness={0.35} />
        </instancedMesh>
      ) : null}
    </group>
  );
}
