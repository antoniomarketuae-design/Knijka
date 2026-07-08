// Sim sound v1 — fully procedural WebAudio (zero audio assets):
//   - engine: rpm-mapped sawtooth + sub sine + filtered noise, deliberately
//     subtle (a driving SCHOOL, not a racing game),
//   - indicator relay tick-tock on blink edges,
//   - collision thump, seatbelt click.
//
// Autoplay policy: nothing is created until unlock() is called from a real
// user gesture (SimulatorApp wires pointerdown/keydown). Volume + mute are
// persisted to localStorage.

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

const IDLE_RPM = 950;
const TOP_RPM = 3800;

export interface EngineFrame {
  speedKmh: number;
  throttle: number;
  /** Indicator relay state this frame (edge-detected internally). */
  indicatorActive: boolean;
  blinkOn: boolean;
  paused: boolean;
}

export class SimAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private noiseGain: GainNode | null = null;

  private rpm = IDLE_RPM;
  private lastBlinkOn = false;
  private lastThumpAt = 0;

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
    this.master = master;

    // --- Engine: saw (body) + sub sine (thump) + noise (intake hiss) --------
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 420;
    lowpass.Q.value = 0.6;
    engineGain.connect(lowpass);
    lowpass.connect(master);
    this.engineGain = engineGain;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 64;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.5;
    osc.connect(oscGain);
    oscGain.connect(engineGain);
    osc.start();
    this.engineOsc = osc;

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 32;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    sub.connect(subGain);
    subGain.connect(engineGain);
    sub.start();
    this.engineSub = sub;

    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(ctx);
    noise.loop = true;
    const noiseBand = ctx.createBiquadFilter();
    noiseBand.type = "bandpass";
    noiseBand.frequency.value = 900;
    noiseBand.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseBand);
    noiseBand.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    this.noiseGain = noiseGain;

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

  /** Per-render-frame update: engine tone + indicator tick edges. */
  update(f: EngineFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineGain || !this.engineOsc || !this.engineSub || !this.noiseGain) return;
    const t = ctx.currentTime;

    // rpm from the cosmetic gearbox: position within the current speed band.
    const v = Math.min(Math.abs(f.speedKmh), 134);
    let frac = 0;
    for (const [lo, hi] of GEAR_BANDS) {
      if (v >= lo && v <= hi) {
        frac = (v - lo) / (hi - lo);
        break;
      }
    }
    const targetRpm = f.paused
      ? IDLE_RPM
      : Math.max(IDLE_RPM + f.throttle * 400, IDLE_RPM + frac * (TOP_RPM - IDLE_RPM));
    this.rpm += (targetRpm - this.rpm) * 0.08; // ~5 Hz smoothing at 60 fps

    // 4-cylinder firing frequency = rpm/60 * 2; saw one octave above.
    const fire = (this.rpm / 60) * 2;
    this.engineSub.frequency.setTargetAtTime(fire, t, 0.05);
    this.engineOsc.frequency.setTargetAtTime(fire * 2, t, 0.05);

    const load = f.paused ? 0 : 0.045 + f.throttle * 0.075 + Math.min(v / 135, 1) * 0.02;
    this.engineGain.gain.setTargetAtTime(load, t, 0.1);
    this.noiseGain.gain.setTargetAtTime(f.paused ? 0 : 0.006 + f.throttle * 0.02, t, 0.15);

    // Indicator relay: tick on lamp-on edge, lower tock on lamp-off edge.
    if (!f.paused && f.indicatorActive && f.blinkOn !== this.lastBlinkOn) {
      this.tick(f.blinkOn ? 1350 : 980, 0.04);
    }
    this.lastBlinkOn = f.indicatorActive ? f.blinkOn : false;
  }

  /** Collision thump; intensity 0..1 (scaled by impact speed upstream). */
  thump(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
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
    g.connect(this.master);
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
    ng.connect(this.master);
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
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.noiseGain = null;
  }

  // ---------------------------------------------------------------------------

  private tick(freq: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
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
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.effectiveVolume(), this.ctx.currentTime, 0.03);
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
