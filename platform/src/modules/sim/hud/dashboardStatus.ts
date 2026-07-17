/**
 * Dashboard status — the per-frame channel between the scene and the DOM
 * StatusDashboard bar (the founder's „табло като на кола", 2026-07-17).
 *
 * Perf grammar: the SCENE mutates one shared DashboardStatus object per frame
 * (zero allocation, zero React state — the hazardActiveRef pattern); the bar
 * samples it on a low-Hz interval and re-renders only when `dashboardHash`
 * changes — the cluster-canvas 10 Hz redraw precedent (vitok/cluster.ts).
 * That is what makes the blinker arrows follow the REAL 600 ms blink clock
 * (CabinControls.blinkOn / hazardBlinkOn) instead of a free-running CSS
 * animation that drifts out of phase with the in-car cluster.
 */

export type DashboardHeadlights = "off" | "low" | "high";
export type DashboardIndicator = "off" | "left" | "right";

export interface DashboardStatus {
  /** Real lamp levels THIS frame — the cabin blink clock + hazard relay
   *  (the same truth the 3D cluster draws), not an approximation. */
  leftLampLit: boolean;
  rightLampLit: boolean;
  /** Stalk setting (aria/labels — the lamps above carry the visuals). */
  indicator: DashboardIndicator;
  hazardsOn: boolean;
  engineOn: boolean;
  stalled: boolean;
  /** Selector display label: "P" "R" "N" "D" or "M2" (DrivelineState). */
  gearLabel: string;
  parkingBrakeOn: boolean;
  seatbeltOn: boolean;
  headlights: DashboardHeadlights;
  fogLightsOn: boolean;
  wipersOn: boolean;
  speedKmh: number;
}

/** Cold-car defaults (engine off, P, parking brake on — the A1 spawn policy):
 *  what the bar shows for the frame or two before the scene first writes. */
export function createDashboardStatus(): DashboardStatus {
  return {
    leftLampLit: false,
    rightLampLit: false,
    indicator: "off",
    hazardsOn: false,
    engineOn: false,
    stalled: false,
    gearLabel: "P",
    parkingBrakeOn: true,
    seatbeltOn: false,
    headlights: "off",
    fogLightsOn: false,
    wipersOn: false,
    speedKmh: 0,
  };
}

/** Rounded non-negative display speed (dial grammar — reverse shows its
 *  magnitude, and near-zero drift never renders as „-0"). */
export function displaySpeedKmh(speedKmh: number): number {
  return Math.max(0, Math.round(Math.abs(speedKmh)));
}

/** Headlight state label (BG) — off stays a dash like the old telltale. */
export const HEADLIGHT_LABEL_BG: Record<DashboardHeadlights, string> = {
  off: "—",
  low: "Къси",
  high: "Дълги",
};

export type SpeedTone = "ok" | "over" | "danger";

/** Speed legality tone against the limit — the SpeedCard bands (doc 32):
 *  accent under the limit, amber over it, red beyond +10 km/h. Compares the
 *  ROUNDED display speed so the number and its color never disagree. */
export function speedTone(speedKmh: number, limitKmh: number): SpeedTone {
  const s = displaySpeedKmh(speedKmh);
  const limit = Math.max(1, Math.round(limitKmh));
  if (s > limit + 10) return "danger";
  if (s > limit) return "over";
  return "ok";
}

/** Cheap change detector for the low-Hz poll — every field the bar renders,
 *  with the speed pre-rounded so sub-km/h jitter never causes a re-render. */
export function dashboardHash(s: DashboardStatus): string {
  return (
    `${s.leftLampLit ? 1 : 0}${s.rightLampLit ? 1 : 0}${s.indicator}|` +
    `${s.hazardsOn ? 1 : 0}${s.engineOn ? 1 : 0}${s.stalled ? 1 : 0}|` +
    `${s.gearLabel}|${s.parkingBrakeOn ? 1 : 0}${s.seatbeltOn ? 1 : 0}|` +
    `${s.headlights}|${s.fogLightsOn ? 1 : 0}${s.wipersOn ? 1 : 0}|` +
    `${displaySpeedKmh(s.speedKmh)}`
  );
}
