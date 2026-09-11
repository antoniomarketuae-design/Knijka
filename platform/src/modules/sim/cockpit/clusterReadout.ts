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

import { REVERSE_ASSIST_STANDSTILL_KMH } from "../engine/reverseAssist";
import { DIAL_MAX_KMH, LAMP_KEYS, ODO_DIGIT_COUNT, TICK_COUNT, type LampKey } from "./clusterLayout";

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
  /**
   * Distance driven this attempt, metres — `VehicleSim.tripDistanceM`
   * (sc-pk-stop-vs-park:e788ce46). A mount that has no vehicle to read (the
   * clip rig's parked car, the reel) leaves the 0 `createClusterInputs` writes,
   * which is the honest reading for a car that has not moved.
   */
  tripMetres: number;
  /** N11 (VP-06): the director-staged red warning telltale. */
  tempWarnOn: boolean;
  /** N11 (VP-06): the director-staged AMBER warning telltale — the other half
   *  of the red/amber triage, on the check-engine lamp. */
  cautionWarnOn: boolean;
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
    tripMetres: 0,
    tempWarnOn: false,
    cautionWarnOn: false,
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
  /** Trip-odometer cells, right-aligned and ZERO-padded: 42 m → ["0","4","2"]. */
  odoDigits: string[];
  /** …and which unit those cells are counting in. */
  odoUnit: OdoUnit;
  /** How many dial ticks are lit, counting up from 0 km/h. */
  litTicks: number;
  lamps: LampBank;
}

/** Allocation-free readout target (the per-frame ref pattern used everywhere
 *  in the sim — nothing in a useFrame body may allocate). */
export function createClusterReadout(): ClusterReadout {
  const lamps = {} as LampBank;
  for (const key of LAMP_KEYS) lamps[key] = { tone: "off", pulse: false };
  const odoDigits: string[] = [];
  for (let i = 0; i < ODO_DIGIT_COUNT; i++) odoDigits.push("0");
  return { digits: ["", "", ""], gearChar: "P", odoDigits, odoUnit: "m", litTicks: 1, lamps };
}

/** Which unit the trip readout is currently counting in. */
export type OdoUnit = "m" | "km";

/**
 * The trip odometer's cells AND its unit — one function, because the two
 * cannot be decided separately without the number meaning nothing.
 *
 * ZERO-PADDED where the speed is BLANK-padded, and the difference is the
 * difference between the two instruments. A leading blank on the speed is what
 * stops „7 км/ч" reading as „07"; an odometer is a counter, its leading zeros
 * are how a real trip meter looks, and a blank one would make «  42 м» wander
 * left and right across the face as the distance grows — motion the eye reads
 * as a fault.
 *
 * FLOORED, never rounded, in either unit: 41.8 m is 41 m driven, and a counter
 * that reads 42 before the metre is complete is a counter that can be ahead of
 * the car.
 *
 * THE UNIT CHANGES INSTEAD OF THE NUMBER CLAMPING — the face has room for three
 * legible cells (clusterLayout's ODO block has the arithmetic) and the longest
 * authored route is 1 042.5 m, so a metres-only readout would stop reading on a
 * real lesson. Above 999 m the same three cells count whole kilometres and the
 * caption says so. Only past 999 km — which no drive can reach — is there
 * nothing left to do but hold.
 */
export function odoCells(
  metres: number,
  count = ODO_DIGIT_COUNT,
): { digits: string[]; unit: OdoUnit } {
  const max = Math.pow(10, count) - 1;
  const safe = Number.isFinite(metres) ? Math.max(0, metres) : 0;
  const km = safe > max;
  const v = Math.min(max, Math.floor(km ? safe / 1000 : safe));
  return { digits: String(v).padStart(count, "0").split(""), unit: km ? "km" : "m" };
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
 * Selector label → the one glyph the readout draws. P, R, N and D are drawn as
 * themselves; "M2" (manual mode, gear 2) draws the RATIO, "2".
 *
 * WHY THE RATIO AND NOT THE "M" — sc-pk-stop-vs-park:e788ce46, „one analogue
 * dial, a digital км/ч and a gear letter". This cell used to take the first
 * character, so all five manual gears drew the same glyph, and in the cockpit
 * camera that is the ONLY gear surface there is: `StatusDashboard` renders the
 * whole `gearLabel` ("M2") but `PlayAreaStyles` folds its `data-hud="speed-block"`
 * away under `html[data-sim-camera="cockpit"]` — the camera every lesson opens
 * in — on the recorded trade that „the cluster is also a speedometer". The
 * trade holds for the speed and it did not hold here: the cluster was showing
 * strictly less than the label it replaced.
 *
 * The half that was dropped is the half that moves. "M" is a constant for the
 * whole drive — the student chose the „Напреднал" tier and is looking at a
 * clutch pedal — while the ratio changes every shift and changes what the car
 * DOES: `vehicle/driveline.ts MANUAL_GEAR_MAX_KMH` revs each gear out at
 * 30/55/85/115/190 км/ч, and the stall model is manual-only. Bulgarian
 * category B is examined on a manual (same file), so which gear you are in is
 * the lesson, not a detail. A real manual's indicator reads P R N 1 2 3 4 5,
 * and every one of those glyphs is already in `CHAR_SET` — no geometry, no
 * atlas, one quad, as before.
 */
export function gearGlyph(gearLabel: string): string {
  if (gearLabel.length === 0) return "N";
  const ratio = gearLabel[1];
  // Guarded so an unknown label can never point the quad at a blank cell: a
  // gear cell drawing nothing reads as a broken instrument (the fallback below
  // is the same reason "" answers "N").
  if (gearLabel[0] === "M" && ratio >= "1" && ratio <= "9") return ratio;
  return gearLabel[0];
}

/**
 * Ticks lit from 0 up to the current speed — the sweeping arc that gives the
 * dial a RATE reading even when the reel is too small to resolve the needle.
 * Tick 0 (0 km/h) is always lit so the dial never reads as a dead instrument.
 *
 * ── A MOVING CAR MUST NEVER DRAW ITSELF AS A STOPPED ONE ───────────────────
 * `sc-vp-readiness:14d53c24`, read off `sweep161/sc-vp-readiness/mobile-right/
 * 04-t102s.png` (iPhone-16 landscape): the car is doing 8 км/ч, the digital
 * readout says «8», and the dial is byte-identical to the one at the traffic
 * light behind it. Both halves the row was FILED as are refuted by
 * measurement — `dialAngleRad` moves 1.6875°/км/ч, so 0→15 км/ч is 25.3° of
 * needle and not „a few degrees", and the missing numerals are a MOUNT
 * decision with arithmetic behind it (`dialNumeralsLegibleAt`, and
 * `VitokCockpit.tsx`'s `dialNumerals={false}` block: 5.6 px of ink at the
 * cockpit's 158 CSS px of face). What survives is this function.
 *
 * The mount that dropped the numerals kept THE ARC as the dial's rate channel
 * („the DIAL keeps what it is actually good at here — needle angle, tick band,
 * the arc filling with speed"). `floor` spent that channel on nothing below
 * one tick: with DIAL_TICK_STEP_KMH = 10 the whole 0–9.9 км/ч band lit exactly
 * the one tick standstill lights, and TICK_HEAD — the brightest quad on the
 * face — sat on the 0 mark while the car rolled. That band is not an edge
 * case; it is the move-off, the creep, and every parking manoeuvre.
 *
 * TWO CHANGES, and the second is the honest cost of the first:
 *  1. The head tick is now the tick the NEEDLE IS NEAREST (`round`), not the
 *     last one it has fully passed. Arc and needle then state one speed by
 *     construction — the same rule `dialAngleRad`'s docstring gives for the
 *     needle and its own dial. It does not add STATES (17 ticks are 17 ticks);
 *     it bounds the arc's error at half a step in both directions, where
 *     `floor` could only under-read and did so by up to a full step — at
 *     59 км/ч the brightest quad on the face sat on the 50 mark.
 *  2. Any motion at all lights at least TWO ticks. This is the one place the
 *     arc may over-state, and it over-states by at most half a tick at a
 *     crawl; the exact value is on the digital readout beside it, which is 3×
 *     the height and the one element this mount MEASURED legible. Reading „the
 *     car is stopped" off a moving car is the failure that cannot be traded
 *     for precision; reading „4" as „nearly 10" while the digits say 4 is.
 *
 * Standstill is untouched: exactly one tick, so the arc still distinguishes
 * stopped from moving in the direction that matters.
 *
 * …AND THAT LAST SENTENCE WAS A PROMISE THIS FUNCTION DID NOT KEEP — 2026-08-28.
 *
 * "Standstill" was coded as `v <= 0`, and THE SIM NEVER PRODUCES AN EXACT ZERO.
 * Measured on the running simulator over 600 frames, a car at rest reports
 * `|speedKmh|` = 0.001045. So the one-tick branch was unreachable on any live
 * drive: a parked car drew TWO ticks, which is the same arc as a car creeping at
 * 8 км/ч, and the arc stopped distinguishing stopped from moving in exactly the
 * direction the header says matters. That is `sc-vp-readiness:14d53c24`.
 *
 * The floor is now the machine's OWN standstill test —
 * `REVERSE_ASSIST_STANDSTILL_KMH` (0.6), `engine/reverseAssist.ts:143`, the
 * threshold the reverse gate already uses to decide whether a car is stopped
 * enough to select R. Using the same number means the dial and the engine cannot
 * disagree about whether the car is moving, which is a stronger property than
 * any constant local to this file would have.
 *
 * `<`, not `<=`: 0.6 itself is motion by the engine's own reckoning, so it must
 * light two.
 */
export function litTickCount(speedKmh: number, tickCount = TICK_COUNT): number {
  const v = Math.min(Math.max(Math.abs(speedKmh), 0), DIAL_MAX_KMH);
  const spans = tickCount - 1;
  if (v < REVERSE_ASSIST_STANDSTILL_KMH) return 1;
  const nearest = Math.round((v / DIAL_MAX_KMH) * spans);
  return Math.min(tickCount, Math.max(2, nearest + 1));
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
  //
  // …AND WHILE A STAGED AMBER CUE IS RAISED (2026-09-02,
  // sc-vp-telltale-red:775b58cc). This lamp is the cluster's ONLY „caution"
  // tone, so before the director could raise it mid-drive no amber existed
  // anywhere on the glass — and „цветът на лампата решава какво правиш" is
  // unlearnable when only one colour can appear. It pulses like the staged red
  // one does: a lit lamp that is the LESSON must not be missable.
  set(
    out.engine,
    input.cautionWarnOn || !input.engineOn ? "caution" : "off",
    input.cautionWarnOn || input.stalled,
  );
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
  const odo = odoCells(input.tripMetres, out.odoDigits.length);
  for (let i = 0; i < out.odoDigits.length; i++) out.odoDigits[i] = odo.digits[i];
  out.odoUnit = odo.unit;
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
  return `${r.digits.join("")}|${r.gearChar}|${r.odoDigits.join("")}${r.odoUnit}|${r.litTicks}`;
}
