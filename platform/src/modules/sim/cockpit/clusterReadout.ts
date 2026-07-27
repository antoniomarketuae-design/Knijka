/**
 * Instrument-cluster READOUT — the pure state→display law of the 3D cluster.
 *
 * The cluster is a PRESENTATION rebuild, not a new data model: every field of
 * ClusterInputs already existed (VehicleSim.speedKmh, DrivelineState's
 * engineOn/stalled/gearLabel/parkingBrakeOn, CabinControls.seatbeltOn and its
 * blink clock, the director's telltaleLit channel). Nothing here is graded and
 * nothing here feeds the rule engine — the verdicts are untouched by this file.
 *
 * WHAT IS DECIDED HERE, AND WHY IT IS TESTABLE. Three of the founder's
 * unreadable reels were speed/gear lessons with no visible instrument, and the
 * belt lesson showed a footer label where a warning lamp belongs. The fix is
 * only as good as the law that decides what lights up, so that law is a pure
 * function with tests rather than branches buried in a frame loop.
 */

import { DIAL_MAX_KMH, LAMP_KEYS, TICK_COUNT, type LampKey } from "./clusterLayout";

/** Every channel the cluster draws — all of it pre-existing vehicle state. */
export interface ClusterInputs {
  speedKmh: number;
  /** DrivelineState.gearLabel: "P" "R" "N" "D" or "M2". */
  gearLabel: string;
  seatbeltOn: boolean;
  parkingBrakeOn: boolean;
  engineOn: boolean;
  stalled: boolean;
  /** Lamp level THIS frame — the cabin's real 600 ms blink clock / hazard
   *  relay, never a free-running animation (dashboardStatus.ts's law). */
  indicatorLeftLit: boolean;
  indicatorRightLit: boolean;
  /** N11 (VP-06): the director-staged red warning telltale. */
  tempWarnOn: boolean;
}

export function createClusterInputs(): ClusterInputs {
  // Cold-car defaults — the A1 spawn policy (engine off, P, brake on, unbelted),
  // so the frame or two before the scene first writes shows the honest state.
  return {
    speedKmh: 0,
    gearLabel: "P",
    seatbeltOn: false,
    parkingBrakeOn: true,
    engineOn: false,
    stalled: false,
    indicatorLeftLit: false,
    indicatorRightLit: false,
    tempWarnOn: false,
  };
}

/**
 * Lamp colour classes. `warn` is the red stop-driving class, `caution` the
 * amber attend-to-it class, `go` the green confirmations (turn arrows).
 */
export type LampTone = "off" | "warn" | "caution" | "go";

export interface LampState {
  tone: LampTone;
  /** Pulsing marks the lamp that is the LESSON — it must not be missable in a
   *  1280×720 frame. A steady lamp is information; a pulsing red one is an
   *  instruction, and that difference is the founder's whole complaint. */
  pulse: boolean;
}

export type LampBank = Record<LampKey, LampState>;

export interface ClusterReadout {
  /** Right-aligned mono digits, blank-padded: 7 → [" ", " ", "7"]. */
  digits: string[];
  /** Single glyph for the selector — "M2" shows the mode letter. */
  gearChar: string;
  /** How many dial ticks are lit, counting up from 0 km/h. */
  litTicks: number;
  lamps: LampBank;
}

const OFF: LampState = { tone: "off", pulse: false };

/** Allocation-free readout target (the per-frame ref pattern used everywhere
 *  in the sim — nothing in a useFrame body may allocate). */
export function createClusterReadout(): ClusterReadout {
  const lamps = {} as LampBank;
  for (const key of LAMP_KEYS) lamps[key] = { tone: "off", pulse: false };
  return { digits: ["", "", ""], gearChar: "P", litTicks: 1, lamps };
}

/**
 * Display speed digits, right-aligned into `count` cells.
 * Reverse shows its MAGNITUDE (the dial grammar — a speedometer has no sign),
 * near-zero drift never renders as „-0", and an absurd value clamps rather than
 * overflowing its cells.
 */
export function speedDigits(speedKmh: number, count = 3): string[] {
  const max = Math.pow(10, count) - 1;
  const v = Math.min(max, Math.max(0, Math.round(Math.abs(speedKmh))));
  const text = String(v).padStart(count, " ");
  return text.split("");
}

/**
 * Selector label → the one glyph the readout draws. "M2" (manual mode, gear 2)
 * shows "M": the cluster's job is which GATE the driver is in; the ratio is a
 * detail the big letter must not lose legibility to.
 */
export function gearGlyph(gearLabel: string): string {
  return gearLabel.length > 0 ? gearLabel[0] : "N";
}

/**
 * Ticks lit from 0 up to the current speed — the sweeping arc that gives the
 * dial a RATE reading even when the reel is too small to resolve the needle.
 * Tick 0 (0 km/h) is always lit so the dial never reads as a dead instrument.
 */
export function litTickCount(speedKmh: number, tickCount = TICK_COUNT): number {
  const v = Math.min(Math.max(Math.abs(speedKmh), 0), DIAL_MAX_KMH);
  const spans = tickCount - 1;
  return Math.min(tickCount, Math.floor((v / DIAL_MAX_KMH) * spans) + 1);
}

/**
 * The lamp bank.
 *
 * The oil-pressure and battery-charge lamps are driven by `engineOn` because
 * that is what a real car does — ignition on, engine not running, both red
 * lamps lit, extinguishing the moment it fires. It is exactly the pre-drive
 * fact the readiness lesson teaches, and it needs no new data channel.
 */
export function lampBank(input: ClusterInputs, out: LampBank): LampBank {
  set(out.belt, !input.seatbeltOn ? "warn" : "off", !input.seatbeltOn);
  set(out.brake, input.parkingBrakeOn ? "warn" : "off", false);
  // Amber check-engine while the engine is not turning; pulsing once it has
  // STALLED, because a stall is something that just happened to the driver.
  set(out.engine, input.engineOn ? "off" : "caution", input.stalled);
  set(out.oil, input.engineOn ? "off" : "warn", false);
  set(out.battery, input.engineOn ? "off" : "warn", false);
  set(out.temp, input.tempWarnOn ? "warn" : "off", input.tempWarnOn);
  // The arrows are already gated by the cabin's real blink clock — pulsing
  // them again would beat against it.
  set(out.arrowLeft, input.indicatorLeftLit ? "go" : "off", false);
  set(out.arrowRight, input.indicatorRightLit ? "go" : "off", false);
  return out;
}

function set(lamp: LampState, tone: LampTone, pulse: boolean): void {
  lamp.tone = tone;
  lamp.pulse = tone === "off" ? false : pulse;
}

/** Fill the whole readout from vehicle state (mutates `out`, allocates never). */
export function clusterReadout(input: ClusterInputs, out: ClusterReadout): ClusterReadout {
  const digits = speedDigits(input.speedKmh, out.digits.length);
  for (let i = 0; i < out.digits.length; i++) out.digits[i] = digits[i];
  out.gearChar = gearGlyph(input.gearLabel);
  out.litTicks = litTickCount(input.speedKmh);
  lampBank(input, out.lamps);
  return out;
}

/**
 * Change detector for the parts of the readout that cost a GPU upload (the
 * digit/gear UV rewrite and the tick-fill rewrite). Lamp tones are cheap and
 * pulse continuously, so they are deliberately NOT in the hash — the frame loop
 * repaints colours every frame and re-points UVs only when this string moves.
 */
export function clusterReadoutHash(r: ClusterReadout): string {
  return `${r.digits.join("")}|${r.gearChar}|${r.litTicks}`;
}

/** Unlit lamps still exist — a dark glyph in its housing, like a real cluster
 *  at night. Exported so the geometry builder and the tests agree on it. */
export const LAMP_OFF: LampState = OFF;
