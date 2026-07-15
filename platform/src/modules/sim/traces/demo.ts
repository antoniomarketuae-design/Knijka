/**
 * The S0-View demo trace (doc 76 §10 P0 proof-of-form): a short, correct
 * drive on the полигон — east along the „Старт-стоп" straight, mirror check,
 * left signal, the corner onto the „Коридор за паркиране" apron, a smooth
 * stop before the bay area. Built AT RUNTIME from the loaded district via
 * the scripted recorder (deterministic, ~25 KB, <100 ms), so the demo can
 * never drift from the production stack it replays through.
 *
 * LessonScene mounts it behind the dev flag `?ghost=demo` on полигон free
 * drive; the recorder test replays the same script headlessly and asserts
 * the shadow contract (finishes, interpolates, grades innocent).
 */

import { recordScriptedDrive, type DriveScript, type RecordedDrive } from "./recorder";

/** Right-lane center offset from the polygon's 2-lane centerlines:
 *  (floor(2/2) − 0.5) × 3.25 m × 2.5 (PERCEPTUAL_ROAD_SCALE). */
const LANE_OFF = 4.0625;
/** South straight pg-e-s3 centerline y = −130 → eastbound lane center. */
const Y_EAST = -130 - LANE_OFF;
/** Parking apron pg-e-apron-bays centerline x = 95 → northbound lane center. */
const X_NORTH = 95 + LANE_OFF;
/** Corner fillet radius, m (junction mouths are 2.5×-scaled). */
const CORNER_R = 10;

function cornerArc(): Array<[number, number]> {
  // Quarter circle from heading-east into heading-north (a left turn in the
  // x-east/y-north plane): center at (X_NORTH − R, Y_EAST + R).
  const cx = X_NORTH - CORNER_R;
  const cy = Y_EAST + CORNER_R;
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * (Math.PI / 2);
    out.push([cx + CORNER_R * Math.cos(a), cy + CORNER_R * Math.sin(a)]);
  }
  return out;
}

/** The authored script — exported so the recorder test replays exactly it. */
export function poligonGhostDemoScript(): DriveScript {
  const arc = cornerArc();
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Следвай синята сянка: огледала → мигач → маневра.",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [
          [24, Y_EAST],
          [75, Y_EAST],
        ],
        targetKmh: 25,
      },
      { kind: "annotation", textBg: "Провери лявото огледало и пусни ляв мигач." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [[75, Y_EAST], [X_NORTH - CORNER_R, Y_EAST], ...arc],
        targetKmh: 20,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Коридорът за паркиране е с ограничение 20 км/ч." },
      {
        kind: "drive",
        points: [
          [X_NORTH, Y_EAST + CORNER_R],
          [X_NORTH, -80],
        ],
        targetKmh: 18,
      },
      { kind: "annotation", textBg: "Плавно спиране: отпусни газта рано и спри меко." },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/** Record the demo against a loaded poligon-v1 district document. */
export function buildPoligonGhostDemo(districtRaw: unknown): RecordedDrive {
  return recordScriptedDrive(districtRaw, poligonGhostDemoScript(), {
    scenarioId: "ghost-demo-poligon",
    kind: "shadow",
    seed: 7,
  });
}
