// Sim sound v2 — A6 audio pass (doc 68 Pillar 2), fully procedural WebAudio
// (zero audio assets). Audio is ~half of speed perception (audit 03 §7 / B7):
// these layers exist to make speed, braking and nearby traffic *felt*.
//
//   - engine: rpm-mapped saw stack + sub sine + intake noise, idle wobble,
//     start/stop cough on ignition edges — subtle (a driving SCHOOL, not a
//     racing game),
//   - tyre/road: lowpass-swept noise, louder + brighter with speed (#1 cue),
//   - wind rush: brighter noise layer above ~40 km/h that scales harder,
//   - brake: soft friction hiss ∝ brake input × speed (NOT a squeal),
//   - ambient city bed: very quiet murmur + slow distant-traffic swell (LFO),
//   - NPC hum: one shared voice, gain follows the nearest traffic car,
//   - rain patter + rhythmic wiper swish (flags in the update payload),
//   - two-tone emergency siren, gain by distance to the active actor (VU-09),
//   - indicator relay tick-tock, collision thump, seatbelt click.
//
// Autoplay policy: nothing is created until unlock() is called from a real
// user gesture (LessonScene wires pointerdown/keydown). Volume + mute are
// persisted to localStorage. Every layer goes silent while paused.

const VOLUME_KEY = "knijka.sim.volume";
const MUTED_KEY = "knijka.sim.muted";

/** Cosmetic gear speed bands (km/h) — mirrors tuning.GEAR_UPSHIFT_KMH. */
const GEAR_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, 16],
  [16, 34],
  [34, 55],
  [55, 80],
  [80, 135],
];

export const IDLE_RPM = 950;
export const TOP_RPM = 3800;

// --- Curve breakpoints (exported for the unit tests) ------------------------

/** Tyre-noise lowpass sweep: brightness is the other half of the speed cue. */
export const TYRE_LP_MIN_HZ = 300;
export const TYRE_LP_MAX_HZ = 2000;
/** Speed at which tyre noise reaches full volume/brightness. */
export const TYRE_FULL_KMH = 90;
/** Wind rush is inaudible below this and at full force at WIND_FULL_KMH. */
export const WIND_START_KMH = 40;
export const WIND_FULL_KMH = 110;
/** NPC proximity hum is inaudible beyond this distance (meters). */
export const NPC_HEAR_M = 45;
/** Emergency siren is inaudible beyond this distance (meters) — a two-tone
 *  carries far past the engine hum; the player must HEAR the special-regime
 *  vehicle before it fills the mirror (чл. 91 stimulus, VU-09). */
export const SIREN_HEAR_M = 160;
/** Two-tone siren notes (Hz) + per-note hold (s) — fictional two-tone in the
 *  European hi-lo idiom, no real service's signature (ADR-001 discipline). */
export const SIREN_LO_HZ = 435;
export const SIREN_HI_HZ = 580;
export const SIREN_TONE_S = 0.62;
/** Full wiper cycle (out + back) in seconds — two swishes per cycle. */
export const WIPER_PERIOD_S = 1.35;

// --- Tyre protest (doc 82 §4.2 F1) ------------------------------------------
// The sim grades students on grip-limited driving and, until this layer, gave
// them NO sensory evidence that grip was running out — on the ice/aquaplane
// lessons the car simply stopped answering. `simAudio.ts` documented the
// brake layer as explicitly "NOT a squeal" precisely because a squeal at that
// seam would have been a lie; THIS is the honest place for one, driven by
// vehicle/gripSignal.ts's utilisation rather than by pedal position.
/** Utilisation at which the tyre first starts to scrub audibly. */
export const SCRUB_START_UTIL = 0.85;
/** Utilisation at which the layer is at full screech. Above 1 the driver is
 *  asking for grip that does not exist (gripSignal.ts) — the gap 0.85→1.15
 *  therefore spans "working hard" → "past the limit". */
export const SCRUB_FULL_UTIL = 1.15;
/** Bandpass sweep: a dull rubber scrub opens into a bright screech. */
export const SCRUB_LP_MIN_HZ = 900;
export const SCRUB_LP_MAX_HZ = 2400;
/** Below this speed (km/h) the layer is muted — a parking manoeuvre must be
 *  silent, and the measured accelerations are raycast noise down there. */
export const SCRUB_MIN_KMH = 8;

/**
 * Per-layer gain caps — the whole mix's volume discipline lives here.
 * Worst-case sum stays well under 1.0 before the (default 0.5) master gain.
 */
export const LAYER_GAIN = {
  /** Engine bus: idle floor + throttle load + speed load. */
  engineIdle: 0.045,
  engineThrottle: 0.075,
  engineSpeed: 0.02,
  /** Intake hiss floor/throttle terms (part of the engine voice). */
  intakeIdle: 0.006,
  intakeThrottle: 0.02,
  /** Tyre/road noise cap at TYRE_FULL_KMH. */
  tyre: 0.085,
  /** Wind rush cap at WIND_FULL_KMH. */
  wind: 0.07,
  /** Brake friction hiss cap (full pedal at speed). */
  brake: 0.045,
  /** Tyre-protest scrub/screech cap. Below the tyre bed (0.085) on purpose:
   *  this is a driving SCHOOL — the tyre complains, it does not perform. */
  scrub: 0.055,
  /** Ambient city bed base (the swell LFO modulates ±55% around it). */
  ambient: 0.016,
  /** NPC engine hum at point-blank range. */
  npc: 0.035,
  /** Rain patter on the windshield/roof. */
  rain: 0.04,
  /** Wiper swish peak (per stroke). */
  wiper: 0.05,
  /** Horn (A1) — deliberately the loudest voice; a horn must cut through. */
  horn: 0.12,
  /** Emergency siren at point-blank range — second only to the horn; the
   *  whole point of the layer is an unmissable yield stimulus. */
  siren: 0.1,
} as const;

// --- Pure gain curves (unit-tested in simAudio.test.ts) ---------------------

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Tyre/road noise level 0..1 vs speed — the #1 speed cue. Silent parked. */
export function tyreLevel(speedKmh: number): number {
  const v = Math.abs(speedKmh);
  if (v < 1) return 0;
  return Math.pow(Math.min(v / TYRE_FULL_KMH, 1), 0.85);
}

/** Tyre lowpass cutoff: 300 Hz → 2 kHz across 0 → 90 km/h (then flat). */
export function tyreCutoffHz(speedKmh: number): number {
  const x = Math.min(Math.abs(speedKmh) / TYRE_FULL_KMH, 1);
  return TYRE_LP_MIN_HZ + (TYRE_LP_MAX_HZ - TYRE_LP_MIN_HZ) * x;
}

/** Wind rush level 0..1 — zero below ~40 km/h, then scales harder (x²). */
export function windLevel(speedKmh: number): number {
  const v = Math.abs(speedKmh);
  if (v <= WIND_START_KMH) return 0;
  const x = Math.min((v - WIND_START_KMH) / (WIND_FULL_KMH - WIND_START_KMH), 1);
  return x * x;
}

/** Brake friction hiss 0..1 — pedal × speed factor; nothing at standstill. */
export function brakeHissLevel(brake: number, speedKmh: number): number {
  const v = Math.abs(speedKmh);
  if (v < 3) return 0;
  return clamp01(brake) * Math.min(v / 60, 1);
}

/**
 * Tyre-protest level 0..1 from the grip utilisation (vehicle/gripSignal.ts).
 * Silent below SCRUB_START_UTIL — most driving must make no tyre noise at all
 * or the cue stops meaning anything. Silent below SCRUB_MIN_KMH.
 */
export function tyreScrubLevel(gripUtil: number, speedKmh: number): number {
  if (!Number.isFinite(gripUtil)) return 0;
  if (Math.abs(speedKmh) < SCRUB_MIN_KMH) return 0;
  return clamp01((gripUtil - SCRUB_START_UTIL) / (SCRUB_FULL_UTIL - SCRUB_START_UTIL));
}

/** Bandpass centre (Hz) for the scrub layer — dull rubber → bright screech. */
export function tyreScrubCutoffHz(level: number): number {
  return SCRUB_LP_MIN_HZ + (SCRUB_LP_MAX_HZ - SCRUB_LP_MIN_HZ) * clamp01(level);
}

/** NPC proximity hum 0..1 vs distance (m); Infinity/far ⇒ 0, ≤2 m ⇒ 1. */
export function npcHumLevel(nearestNpcM: number): number {
  if (!Number.isFinite(nearestNpcM) || nearestNpcM >= NPC_HEAR_M) return 0;
  const d = Math.max(nearestNpcM, 2);
  const x = 1 - d / NPC_HEAR_M;
  return x * x;
}

/** Siren loudness 0..1 vs distance (m) — the npcHumLevel curve stretched to
 *  SIREN_HEAR_M. Infinity/far ⇒ 0, ≤2 m ⇒ 1. */
export function sirenLevel(sirenM: number): number {
  if (!Number.isFinite(sirenM) || sirenM >= SIREN_HEAR_M) return 0;
  const d = Math.max(sirenM, 2);
  const x = 1 - d / SIREN_HEAR_M;
  return x * x;
}

/**
 * Cosmetic rpm target from the gear band + throttle. Revs climb quickly early
 * in a band and flatten toward the shift point (pow 0.8) so the pitch curve
 * reads "engine", not "sine sweep".
 */
export function rpmTarget(speedKmh: number, throttle: number): number {
  const v = Math.min(Math.abs(speedKmh), 134);
  let frac = 0;
  for (const [lo, hi] of GEAR_BANDS) {
    if (v >= lo && v <= hi) {
      frac = (v - lo) / (hi - lo);
      break;
    }
  }
  const bandRpm = IDLE_RPM + Math.pow(frac, 0.8) * (TOP_RPM - IDLE_RPM);
  return Math.max(IDLE_RPM + clamp01(throttle) * 420, bandRpm);
}

/** Wiper swish envelope 0..1 over cycle phase 0..1 — two strokes per cycle,
 *  silent at the turnaround points (phase 0, 0.5, 1). */
export function wiperEnvelope(phase: number): number {
  const s = Math.sin(phase * Math.PI * 2);
  return Math.pow(Math.abs(s), 3);
}

// -----------------------------------------------------------------------------

export interface EngineFrame {
  speedKmh: number;
  throttle: number;
  /** Indicator relay state this frame (edge-detected internally). */
  indicatorActive: boolean;
  blinkOn: boolean;
  paused: boolean;
  /** 0..1 brake pedal — drives the friction hiss (default 0). */
  brake?: number;
  /** Tyre grip utilisation from VehicleSim.gripUtilisation (doc 82 F1).
   *  Default 0 ⇒ the scrub layer is silent, so callers that never pass it
   *  (tests, legacy rigs) hear exactly the pre-F1 mix. */
  gripUtil?: number;
  /** Raining — enables the rain-patter layer (default false). */
  rain?: boolean;
  /** Wipers sweeping — rhythmic swish (default false; A1 wires real state). */
  wipersOn?: boolean;
  /** Ignition (default true). Off→on / on→off edges play a start/stop cough. */
  engineOn?: boolean;
  /** Horn held (A1) — dual-tone while true (default false). */
  hornOn?: boolean;
  /** Meters to the nearest traffic vehicle (default Infinity ⇒ silent). */
  nearestNpcM?: number;
  /** Meters to the nearest ACTIVE emergency actor — drives the two-tone
   *  siren loop (default Infinity ⇒ silent). */
  sirenM?: number;
}

/**
 * Scene-level audio state pushed from LessonScene's frame loop (rain flag,
 * nearest-NPC gap). Sticky between calls; a field supplied directly in the
 * per-frame EngineFrame payload always wins over the value stored here.
 */
export interface SceneAudioEnv {
  rain?: boolean;
  nearestNpcM?: number;
  sirenM?: number;
  wipersOn?: boolean;
  engineOn?: boolean;
}

/** Everything unlock() builds — bundled so update() has one null-check. */
interface LayerNodes {
  master: GainNode;
  // engine voice
  engineGain: GainNode;
  engineOsc: OscillatorNode;
  engineOsc3: OscillatorNode;
  engineSub: OscillatorNode;
  intakeGain: GainNode;
  // world layers
  tyreGain: GainNode;
  tyreFilter: BiquadFilterNode;
  windGain: GainNode;
  brakeGain: GainNode;
  scrubGain: GainNode;
  scrubFilter: BiquadFilterNode;
  ambientGain: GainNode;
  npcGain: GainNode;
  npcOsc: OscillatorNode;
  rainGain: GainNode;
  wiperGain: GainNode;
  wiperFilter: BiquadFilterNode;
  hornGain: GainNode;
  sirenGain: GainNode;
  sirenOsc: OscillatorNode;
  sirenOsc2: OscillatorNode;
}

export class SimAudio {
  private ctx: AudioContext | null = null;
  private nodes: LayerNodes | null = null;

  private rpm = IDLE_RPM;
  private lastBlinkOn = false;
  private lastThumpAt = 0;
  private lastEngineOn = true;
  /** First-update latch: prime lastEngineOn without an ignition edge sound. */
  private enginePrimed = false;
  private lastUpdateT = 0;
  private wiperPhase = 0;
  /** Two-tone siren note currently sounding (0 lo / 1 hi; -1 = silent). */
  private sirenTone = -1;
  /** Post-ignition rev flare deadline (ctx time, seconds). */
  private flareUntil = 0;
  private env: SceneAudioEnv = {};

  private volumeValue = 0.5;
  private mutedValue = false;

  constructor() {
    try {
      const v = window.localStorage.getItem(VOLUME_KEY);
      if (v !== null) this.volumeValue = Math.min(1, Math.max(0, Number(v) || 0));
      this.mutedValue = window.localStorage.getItem(MUTED_KEY) === "1";
    } catch {
      // Storage blocked (private mode) — session-only settings.
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get volume(): number {
    return this.volumeValue;
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  /** Build the audio graph. MUST be called from a user-gesture handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.effectiveVolume();
    master.connect(ctx.destination);

    // One shared noise buffer; each looped source gets its own playbackRate so
    // the parallel layers decorrelate instead of phasing.
    const noiseBuf = this.makeNoiseBuffer(ctx, 1.5);
    const noiseSource = (rate: number): AudioBufferSourceNode => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      src.playbackRate.value = rate;
      src.start();
      return src;
    };
    /** filter(type/freq/Q) → zero-gain layer bus → master; returns the bus. */
    const layer = (
      src: AudioNode,
      type: BiquadFilterType,
      freq: number,
      q: number,
    ): { gain: GainNode; filter: BiquadFilterNode } => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      return { gain, filter };
    };

    // --- Engine: saw (body) + 3rd-harmonic saw (texture) + sub sine (thump) —
    // all through one gain into a lowpass so it stays a hum, not a buzz.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineLp = ctx.createBiquadFilter();
    engineLp.type = "lowpass";
    engineLp.frequency.value = 420;
    engineLp.Q.value = 0.6;
    engineGain.connect(engineLp);
    engineLp.connect(master);

    const mkOsc = (type: OscillatorType, freq: number, g: number): OscillatorNode => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(engineGain);
      osc.start();
      return osc;
    };
    const engineOsc = mkOsc("sawtooth", 64, 0.5);
    const engineOsc3 = mkOsc("sawtooth", 96, 0.16);
    const engineSub = mkOsc("sine", 32, 0.6);

    // Intake hiss (part of the engine voice).
    const intake = layer(noiseSource(1), "bandpass", 900, 0.8);

    // --- Tyre/road noise: lowpass swept 300 Hz → 2 kHz with speed. ----------
    const tyre = layer(noiseSource(1.0), "lowpass", TYRE_LP_MIN_HZ, 0.4);

    // --- Wind rush: brighter, kicks in above ~40 km/h. ----------------------
    const wind = layer(noiseSource(1.11), "highpass", 700, 0.5);

    // --- Brake friction hiss. -----------------------------------------------
    const brake = layer(noiseSource(0.93), "bandpass", 2600, 1.2);

    // --- Tyre protest (F1): narrow-Q bandpass noise swept 900 Hz → 2.4 kHz.
    // A high Q is what turns filtered noise into a *tonal* scrub instead of
    // one more hiss layer — it must be distinguishable from the brake hiss
    // and the wind, which are the two sounds already living around it.
    const scrub = layer(noiseSource(1.07), "bandpass", SCRUB_LP_MIN_HZ, 4.5);

    // --- Ambient city bed: dark murmur + slow distant-traffic swell. --------
    // LFO adds ±(swellDepth) around the swell bus's base gain of 1, so the bed
    // breathes every ~16 s; ambientGain stays the on/off + level control.
    const ambientSrc = noiseSource(0.8);
    const ambientLp = ctx.createBiquadFilter();
    ambientLp.type = "lowpass";
    ambientLp.frequency.value = 420;
    ambientLp.Q.value = 0.3;
    const swell = ctx.createGain();
    swell.gain.value = 1;
    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientSrc.connect(ambientLp);
    ambientLp.connect(swell);
    swell.connect(ambientGain);
    ambientGain.connect(master);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.55;
    lfo.connect(lfoDepth);
    lfoDepth.connect(swell.gain);
    lfo.start();

    // --- NPC proximity hum: one shared low voice, gain ∝ closeness. ---------
    const npcGain = ctx.createGain();
    npcGain.gain.value = 0;
    const npcLp = ctx.createBiquadFilter();
    npcLp.type = "lowpass";
    npcLp.frequency.value = 240;
    npcLp.Q.value = 0.5;
    const mkNpcOsc = (freq: number, g: number): OscillatorNode => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(npcLp);
      osc.start();
      return osc;
    };
    const npcOsc = mkNpcOsc(52, 0.6);
    mkNpcOsc(79, 0.3);
    npcLp.connect(npcGain);
    npcGain.connect(master);

    // --- Rain patter + wiper swish. -----------------------------------------
    const rain = layer(noiseSource(1.23), "bandpass", 3200, 0.4);
    const wiper = layer(noiseSource(0.87), "bandpass", 650, 2.2);

    // --- Horn (A1): the classic two-note chord (~400+500 Hz), slightly
    // detuned triangles through a bandpass so it honks instead of beeping.
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    const hornBp = ctx.createBiquadFilter();
    hornBp.type = "bandpass";
    hornBp.frequency.value = 450;
    hornBp.Q.value = 0.7;
    const mkHornOsc = (freq: number, g: number): void => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(hornBp);
      osc.start();
    };
    mkHornOsc(400, 0.55);
    mkHornOsc(501, 0.5);
    hornBp.connect(hornGain);
    hornGain.connect(master);

    // --- Siren: two-tone „специален режим" loop (VU-09) — a fundamental
    // triangle + a quiet octave shimmer through a bandpass so it wails
    // instead of beeping. Both notes are retuned on the tone clock in
    // update(); gain follows the emergency actor's distance.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenBp = ctx.createBiquadFilter();
    sirenBp.type = "bandpass";
    sirenBp.frequency.value = 950;
    sirenBp.Q.value = 0.6;
    const mkSirenOsc = (freq: number, g: number): OscillatorNode => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(sirenBp);
      osc.start();
      return osc;
    };
    const sirenOsc = mkSirenOsc(SIREN_LO_HZ, 0.6);
    const sirenOsc2 = mkSirenOsc(SIREN_LO_HZ * 2, 0.18);
    sirenBp.connect(sirenGain);
    sirenGain.connect(master);

    this.nodes = {
      master,
      engineGain,
      engineOsc,
      engineOsc3,
      engineSub,
      intakeGain: intake.gain,
      tyreGain: tyre.gain,
      tyreFilter: tyre.filter,
      windGain: wind.gain,
      brakeGain: brake.gain,
      scrubGain: scrub.gain,
      scrubFilter: scrub.filter,
      ambientGain,
      npcGain,
      npcOsc,
      rainGain: rain.gain,
      wiperGain: wiper.gain,
      wiperFilter: wiper.filter,
      hornGain,
      sirenGain,
      sirenOsc,
      sirenOsc2,
    };

    if (ctx.state === "suspended") void ctx.resume();
  }

  setVolume(v: number): void {
    this.volumeValue = Math.min(1, Math.max(0, v));
    this.applyMaster();
    this.persist();
  }

  toggleMute(): void {
    this.mutedValue = !this.mutedValue;
    this.applyMaster();
    this.persist();
  }

  /**
   * Scene-level state (rain, nearest-NPC gap, later wipers/ignition) pushed
   * from LessonScene's frame loop. Sticky: values persist until overwritten;
   * fields passed directly in the update() payload take precedence.
   */
  setEnvironment(env: SceneAudioEnv): void {
    Object.assign(this.env, env);
  }

  /** Per-render-frame update: drives every continuous layer + tick edges. */
  update(f: EngineFrame): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n) return;
    const t = ctx.currentTime;
    const dt = this.lastUpdateT > 0 ? Math.min(Math.max(t - this.lastUpdateT, 0), 0.1) : 1 / 60;
    this.lastUpdateT = t;

    // Payload field > sticky scene env > default.
    const rain = f.rain ?? this.env.rain ?? false;
    const wipersOn = f.wipersOn ?? this.env.wipersOn ?? false;
    const engineOn = f.engineOn ?? this.env.engineOn ?? true;
    const hornOn = f.hornOn ?? false;
    const nearestNpcM = f.nearestNpcM ?? this.env.nearestNpcM ?? Infinity;
    const sirenM = f.sirenM ?? this.env.sirenM ?? Infinity;
    const brake = f.brake ?? 0;
    const gripUtil = f.gripUtil ?? 0;
    const live = !f.paused;
    const v = Math.abs(f.speedKmh);

    // --- Ignition edges: starter cough / shut-off shudder. ------------------
    // The first update PRIMES the state (a cold-spawned car must not play a
    // phantom shut-off shudder on mount).
    if (!this.enginePrimed) {
      this.enginePrimed = true;
      this.lastEngineOn = engineOn;
      if (!engineOn) this.rpm = 0;
    } else if (engineOn !== this.lastEngineOn) {
      this.lastEngineOn = engineOn;
      if (engineOn) {
        this.startCough();
        this.rpm = 260;
        this.flareUntil = t + 0.9;
      } else {
        this.stopCough();
      }
    }

    // --- Engine: rpm curve + idle wobble so it doesn't read "test tone". ----
    let targetRpm = 0;
    if (engineOn) {
      targetRpm = f.paused ? IDLE_RPM : rpmTarget(f.speedKmh, f.throttle);
      if (t < this.flareUntil) targetRpm = Math.max(targetRpm, 1400);
    }
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 5); // ≈0.08/frame @60fps

    const idleness = engineOn ? clamp01(1 - (this.rpm - IDLE_RPM) / 500) : 0;
    const wobble = Math.sin(t * 2 * Math.PI * 4.3) * 14 * idleness; // lumpy idle
    // 4-cylinder firing frequency = rpm/60 * 2; saw an octave above.
    const fire = Math.max((this.rpm + wobble) / 60, 0) * 2;
    n.engineSub.frequency.setTargetAtTime(fire, t, 0.05);
    n.engineOsc.frequency.setTargetAtTime(fire * 2, t, 0.05);
    n.engineOsc3.frequency.setTargetAtTime(fire * 3 + 2, t, 0.05); // slight detune

    const load =
      !live || !engineOn
        ? 0
        : LAYER_GAIN.engineIdle +
          f.throttle * LAYER_GAIN.engineThrottle +
          Math.min(v / 135, 1) * LAYER_GAIN.engineSpeed;
    n.engineGain.gain.setTargetAtTime(load, t, 0.1);
    n.intakeGain.gain.setTargetAtTime(
      !live || !engineOn ? 0 : LAYER_GAIN.intakeIdle + f.throttle * LAYER_GAIN.intakeThrottle,
      t,
      0.15,
    );

    // --- Tyre/road (#1 speed cue): louder AND brighter with speed. ----------
    n.tyreGain.gain.setTargetAtTime(live ? LAYER_GAIN.tyre * tyreLevel(v) : 0, t, 0.1);
    n.tyreFilter.frequency.setTargetAtTime(tyreCutoffHz(v), t, 0.15);

    // --- Wind rush above ~40 km/h. -------------------------------------------
    n.windGain.gain.setTargetAtTime(live ? LAYER_GAIN.wind * windLevel(v) : 0, t, 0.15);

    // --- Brake friction hiss (fast attack so it tracks the pedal). ----------
    n.brakeGain.gain.setTargetAtTime(
      live ? LAYER_GAIN.brake * brakeHissLevel(brake, v) : 0,
      t,
      0.06,
    );

    // --- Tyre protest (F1): the ONLY evidence a muted-eyed student gets that
    // grip is running out. Fast attack (0.05) so the scrub arrives with the
    // slide, not a beat after it; the filter sweep carries the severity.
    const scrubLevel = tyreScrubLevel(gripUtil, v);
    n.scrubGain.gain.setTargetAtTime(live ? LAYER_GAIN.scrub * scrubLevel : 0, t, 0.05);
    if (scrubLevel > 0) {
      n.scrubFilter.frequency.setTargetAtTime(tyreScrubCutoffHz(scrubLevel), t, 0.08);
    }

    // --- Ambient city bed: standing still isn't dead silence. ---------------
    n.ambientGain.gain.setTargetAtTime(live ? LAYER_GAIN.ambient : 0, t, 0.4);

    // --- NPC proximity hum + slight pitch rise as the car closes in. --------
    const npcLevel = npcHumLevel(nearestNpcM);
    n.npcGain.gain.setTargetAtTime(live ? LAYER_GAIN.npc * npcLevel : 0, t, 0.2);
    n.npcOsc.frequency.setTargetAtTime(52 + 12 * npcLevel, t, 0.3);

    // --- Rain patter. ---------------------------------------------------------
    n.rainGain.gain.setTargetAtTime(live && rain ? LAYER_GAIN.rain : 0, t, 0.5);

    // --- Wiper: rhythmic swish, filter swept with the stroke. ---------------
    if (live && wipersOn) {
      this.wiperPhase = (this.wiperPhase + dt / WIPER_PERIOD_S) % 1;
      const env = wiperEnvelope(this.wiperPhase);
      n.wiperGain.gain.setTargetAtTime(LAYER_GAIN.wiper * env, t, 0.02);
      n.wiperFilter.frequency.setTargetAtTime(520 + 480 * env, t, 0.02);
    } else {
      this.wiperPhase = 0;
      n.wiperGain.gain.setTargetAtTime(0, t, 0.05);
    }

    // --- Horn: fast attack, quick release — it must track the key. ----------
    n.hornGain.gain.setTargetAtTime(live && hornOn ? LAYER_GAIN.horn : 0, t, 0.015);

    // --- Emergency siren: two-tone loop, volume by distance (чл. 91). -------
    // The note flips on the ctx-time tone clock; retune only on the flip edge
    // (one cached-int compare per frame, zero allocations).
    const siren = sirenLevel(sirenM);
    n.sirenGain.gain.setTargetAtTime(live ? LAYER_GAIN.siren * siren : 0, t, 0.12);
    if (live && siren > 0) {
      const tone = Math.floor(t / SIREN_TONE_S) & 1;
      if (tone !== this.sirenTone) {
        this.sirenTone = tone;
        const hz = tone === 0 ? SIREN_LO_HZ : SIREN_HI_HZ;
        n.sirenOsc.frequency.setTargetAtTime(hz, t, 0.02);
        n.sirenOsc2.frequency.setTargetAtTime(hz * 2, t, 0.02);
      }
    } else {
      this.sirenTone = -1; // re-arm the note clock for the next approach
    }

    // Indicator relay: tick on lamp-on edge, lower tock on lamp-off edge.
    if (!f.paused && f.indicatorActive && f.blinkOn !== this.lastBlinkOn) {
      this.tick(f.blinkOn ? 1350 : 980, 0.04);
    }
    this.lastBlinkOn = f.indicatorActive ? f.blinkOn : false;
  }

  /** Collision thump; intensity 0..1 (scaled by impact speed upstream). */
  thump(intensity: number): void {
    const ctx = this.ctx;
    const master = this.nodes?.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    if (now - this.lastThumpAt < 0.12) return; // multi-contact rate limit
    this.lastThumpAt = now;
    const k = Math.min(1, Math.max(0.12, intensity));

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * k, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.25);

    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(ctx, 0.12);
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3 * k, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(now);
  }

  /** Seatbelt buckle click. */
  click(): void {
    this.tick(2200, 0.025);
    this.tick(700, 0.05);
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.nodes = null;
  }

  // ---------------------------------------------------------------------------

  /** Ignition on: brief starter churn + intake gulp (kept very quiet). */
  private startCough(): void {
    const ctx = this.ctx;
    const master = this.nodes?.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;

    const churn = ctx.createOscillator();
    churn.type = "square";
    churn.frequency.value = 23;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.045, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    churn.connect(cg);
    cg.connect(master);
    churn.start(now);
    churn.stop(now + 0.55);

    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(ctx, 0.5);
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 300;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(now);
  }

  /** Ignition off: soft low shudder as the engine dies. */
  private stopCough(): void {
    const ctx = this.ctx;
    const master = this.nodes?.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  private tick(freq: number, dur: number): void {
    const ctx = this.ctx;
    const master = this.nodes?.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private effectiveVolume(): number {
    return this.mutedValue ? 0 : this.volumeValue;
  }

  private applyMaster(): void {
    if (this.nodes && this.ctx) {
      this.nodes.master.gain.setTargetAtTime(this.effectiveVolume(), this.ctx.currentTime, 0.03);
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(this.volumeValue));
      window.localStorage.setItem(MUTED_KEY, this.mutedValue ? "1" : "0");
    } catch {
      // non-fatal
    }
  }
}
