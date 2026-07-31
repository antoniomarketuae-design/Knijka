/**
 * DRIVER-EYE CAMERA for the scene-still rig (DEV ONLY) — `?eye=x,y,h,yaw[,fov]`.
 *
 * WHY IT EXISTS. The still route's own camera is an angled-overhead 3/4 — the
 * right frame for a theory diagram and the wrong one for the only question that
 * matters about a roundabout: „does this read as a circle FROM THE SEAT?" A
 * top-down of a central island proves the island exists; it proves nothing
 * about what the driver meets. This drops the camera to eye height on the
 * carriageway, facing where the driver faces, inside the SAME <DistrictWorld/>
 * the cockpit renders — so the frame is the geometry, not a diagram of it.
 *
 * Pure parsing, no three.js, so the client shell can read the query without
 * pulling the 3D bundle. Nothing on the committed-still path passes `?eye=`,
 * so every rendered question still stays byte-identical.
 */

export interface EyeCam {
  /** District metres, x east / y north. */
  x: number;
  y: number;
  /** Eye height above the road, m (a saloon driver's eye ≈ 1.2). */
  height: number;
  /** Facing, degrees, 0 = north, clockwise — the sim's trace convention. */
  yawDeg: number;
  fov: number;
}

/** `x,y,height,yawDeg[,fov]` → EyeCam, or null when absent/malformed. */
export function parseEyeCam(raw: string | undefined | null): EyeCam | null {
  if (!raw) return null;
  const n = raw.split(",").map((s) => Number(s.trim()));
  if (n.length < 4 || n.slice(0, 4).some((v) => !Number.isFinite(v))) return null;
  return {
    x: n[0]!,
    y: n[1]!,
    height: n[2]!,
    yawDeg: n[3]!,
    fov: Number.isFinite(n[4]) ? n[4]! : 60,
  };
}
