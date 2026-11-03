// Driver input → normalized VehicleInput. Ported from the spike's keyboard
// reader, extended with an optional standard-mapping gamepad (analog steer +
// triggers). Plain TS, no React — the R3F layer just calls read() every
// physics step and wires the callbacks.

import { IDLE_INPUT, type VehicleInput } from "../vehicle";
import type { TouchInputSource } from "./touch";
import type { PedalStamp } from "./pedalTiming";
import { REVERSE_ASSIST_PEDAL_ON } from "./reverseAssist";

export interface SimInputCallbacks {
  /** C — chase ↔ cockpit. */
  onToggleCamera?: () => void;
  /** R — respawn the car. */
  onReset?: () => void;
  /** Escape — pause menu. */
  onTogglePause?: () => void;
}

const HANDLED_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyC",
  "KeyR",
]);

// ---------------------------------------------------------------------------
// e.key fallback channel (founder bug 2026-07-17: "W A S D not working,
// arrows work")
// ---------------------------------------------------------------------------
// The primary match stays e.code (physical key, layout-independent). But some
// input stacks — remote-desktop "translate" modes (the founder drives this PC
// over AnyDesk) and certain Bulgarian layout drivers — deliver the
// layout-translated CHARACTER with a wrong or "Unidentified" e.code. Arrow
// keys survive those stacks (their e.key is layout-independent), letters do
// not — exactly the "arrows work, WASD doesn't" symptom. So pressed keys are
// tracked on TWO channels: by e.code (unchanged) and by normalized-lowercase
// e.key mapped back to the canonical code via this table. Latin w/a/s/d,
// their Bulgarian phonetic equivalents в/а/с/д (В sits on the W key, А on A,
// С on S, Д on D), and the arrow key names.
const KEY_FALLBACKS: Readonly<Record<string, string>> = {
  w: "KeyW",
  a: "KeyA",
  s: "KeyS",
  d: "KeyD",
  в: "KeyW",
  а: "KeyA",
  с: "KeyS",
  д: "KeyD",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

/** Canonical code for the event's e.key fallback channel, or null. Synthetic
 *  events without a `key` (older tests, exotic stacks) resolve to null. */
function keyFallbackCode(e: KeyboardEvent): string | null {
  const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
  return KEY_FALLBACKS[key] ?? null;
}

/** ?debugkeys=1 diagnostic — how many keydown {code,key} pairs to retain. */
export const KEY_LOG_SIZE = 6;

/**
 * Dev-only key diagnostic (never in production builds): `?debugkeys=1` on the
 * URL keeps the last KEY_LOG_SIZE keydown {code, key} pairs on
 * `window.__aidriveKeyLog` (+ one console.info per press), so a future
 * founder report of a dead key yields the EXACT values the input stack
 * delivered — no more guessing which layer ate the event.
 */
function debugKeysEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return new URLSearchParams(window.location.search).get("debugkeys") === "1";
  } catch {
    return false; // headless/node test window has no location — fail closed
  }
}

/** Stick values below this are treated as centre (worn-stick drift). */
const GAMEPAD_DEADZONE = 0.12;

// ---------------------------------------------------------------------------
// Analog keyboard pedal ramps (QW8, plan doc 68 — audit finding A9)
// ---------------------------------------------------------------------------
// Keys are binary; real pedals are not. Without ramps, W/S snap 0→1 and the
// only "smoothness" a student can produce is whatever the physics low-pass
// filter grants — i.e. smooth stops were the filter's skill, not theirs.
// With ramps, HOLDING a key presses the pedal progressively and RELEASING
// lifts it progressively, so feathering (tap-tap-tap) yields genuine partial
// pedal input the student controls. Analog gamepad triggers bypass the ramps.
//
// Tuning rationale (founder drive-and-tune session may nudge):
//  - throttle attack is the slowest — flooring it must be a deliberate act;
//  - brake attack is quicker — an emergency stop still reaches full braking
//    in ~a quarter second;
//  - releases are slightly quicker than attacks (lifting a foot is faster
//    than pressing down).
/** Seconds of key-hold to go 0 → full throttle. */
export const THROTTLE_ATTACK_S = 0.35;
/** Seconds after key release for throttle to fall 1 → 0. */
export const THROTTLE_RELEASE_S = 0.25;
/** Seconds of key-hold to go 0 → full brake. */
export const BRAKE_ATTACK_S = 0.25;
/** Seconds after key release for brake to fall 1 → 0. */
export const BRAKE_RELEASE_S = 0.2;
/**
 * Wall-clock clamp per read (s) — and it is the PHYSICS ceiling, not a number
 * of this file's own (2026-08-24, sweep161: sc-ov-oncoming-gap,
 * sc-sig-controller-live).
 *
 * It was 0.1 („a stalled tab must not slam a pedal") while rapier's own frame
 * clamp is 0.5 (PHYSICS_MAX_FRAME_DT, lesson-ui/sessionClock.ts — read out of
 * the shipped bundle, not chosen). read() writes `lastReadMs` on every call,
 * so the FIRST read of a frame takes the whole elapsed wall time and the rest
 * of that frame's reads take ~0 — which means one slow frame used to buy 0.1 s
 * of PEDAL against up to 0.5 s of WORLD. Above 10 fps the two clamps agree and
 * nothing differs; at the 2 fps the mobile sweep leg actually runs at, a held
 * brake key needed 2.5 frames (1.25 s of world) to arrive while the released
 * throttle kept pushing for the same span. That is the sweep's own log line —
 * „the brake is held and the car went 7 -> 10 км/ч — the sim never got the
 * key" — fired 218× across sweep161, 73 of 195 mobile legs against 1 of 189 PC
 * legs. The touch pads are not ramped at all (TouchControls writes position
 * straight through), so the defect could only reach the keyboard channel.
 *
 * Equal clamps make pedal time and world time advance 1:1 at every frame rate:
 * a key held through a stalled frame now delivers exactly the pedal the world
 * moved under. The stalled-tab worry inverts rather than survives — the world
 * steps 0.5 s on that resumed frame regardless, so the 0.1 cap did not stop
 * the slam, it deleted 80 % of the driver's braking during it. The equality is
 * asserted against lesson-ui/sessionClock.ts in __tests__/input.test.ts, so a
 * rapier upgrade that moves the ceiling moves this with it or fails loudly.
 */
export const MAX_RAMP_DT_S = 0.5;

/**
 * Advance one pedal value toward its key-held target along a linear ramp.
 * Pure — unit-tested directly; SimInput integrates it against wall time.
 */
export function stepPedal(
  value: number,
  held: boolean,
  dtSec: number,
  attackS: number,
  releaseS: number,
): number {
  if (held) return Math.min(1, value + dtSec / attackS);
  return Math.max(0, value - dtSec / releaseS);
}

export class SimInput {
  private readonly pressed = new Set<string>();
  /** Second press channel: canonical codes reached via the e.key fallback
   *  table (layout characters / remote-desktop stacks — see KEY_FALLBACKS).
   *  Kept separate from `pressed` so a stack that reports a valid code on
   *  keydown but a different key on keyup (layout switch mid-hold) can never
   *  strand the primary channel; blur clears both. */
  private readonly pressedViaKey = new Set<string>();
  private readonly debugKeys = debugKeysEnabled();
  private readonly out: VehicleInput = { ...IDLE_INPUT };
  // Ramped keyboard pedal state, integrated against wall time in read().
  private throttlePedal = 0;
  private brakePedal = 0;
  private lastReadMs: number | null = null;
  // P1: optional touch overlay source (TouchControls) — merged LAST in read().
  private touchSource: TouchInputSource | null = null;

  // ---- R4 (2026-10-19, sc-turn-left-oncoming:d0017a65): the pedal CHANNELS'
  // transitions, timed by the source that made them (engine/pedalTiming.ts).
  // A channel is the brake role (S/↓, LT, the touch brake) or the throttle
  // role (W/↑, RT, the touch throttle), merged exactly as read() merges the
  // values — touch active replaces, else keyboard ∪ gamepad — except that a
  // key counts as the KEY, not as the ramped pedal the key makes.
  private keyBrake = false;
  private keyThrottle = false;
  private padBrake = false;
  private padThrottle = false;
  private brakeCh = false;
  private throttleCh = false;
  private lastPollMs: number | null = null;
  private lastStampMs = Number.NEGATIVE_INFINITY;
  /**
   * The physics-step clock, s (steps taken × FIXED_DT) — set by the scene.
   * Read ONLY to stamp a STEP-KEYED pad (the drive rig's, ADR-017: its pad
   * object carries `stepKeyed: true`), whose changes happen at physics steps
   * rather than at any wall-clock instant a poll could see.
   */
  stepClockS: (() => number) | null = null;

  constructor(
    private readonly callbacks: SimInputCallbacks = {},
    /** Monotonic clock (ms) — injectable for tests. */
    private readonly nowMs: () => number = () => performance.now(),
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.pressed.clear();
    this.pressedViaKey.clear();
  }

  /**
   * P1: attach (or detach with null) the touch overlay's axis source. Touch
   * merges by PRIORITY inside read() — while a finger owns an axis its value
   * replaces the keyboard∪gamepad result for that axis (see touch.ts) — so
   * every downstream consumer (QW10 gate, difficulty shaping, A2 raw-pedal
   * observers) treats touch exactly like any other device.
   */
  attachTouch(source: TouchInputSource | null): void {
    if (this.touchSource) this.touchSource.onPedalChange = null;
    this.touchSource = source;
    // R4: a touch pedal's transition is stamped with the pointer event's own
    // timeStamp when the overlay passes it (TouchControls / MousePedals do).
    // R8: a write from a pointer SAMPLE also passes the previous sample's
    // time, and the stamp is the interval since it (touch.ts PadSampleClock).
    if (source)
      source.onPedalChange = (atMs, sinceMs) => this.refreshPedalChannels(this.eventStamp(atMs, sinceMs));
    this.refreshPedalChannels(this.eventStamp(undefined));
  }

  /** The input clock now, ms — the clock every pedal stamp is on. */
  clockMs(): number {
    return this.nowMs();
  }

  /** Is the brake-role channel down (raw keys, LT, the touch brake)? */
  get brakeChannelDown(): boolean {
    return this.brakeCh;
  }

  /** Is the throttle-role channel down (raw keys, RT, the touch throttle)? */
  get throttleChannelDown(): boolean {
    return this.throttleCh;
  }

  /** A channel changed state — GatedSimInput turns these into the FUNCTIONAL
   *  brake's log (LessonScene.tsx). */
  protected onPedalChannelEdge(_channel: "brake" | "throttle", _down: boolean, _stamp: PedalStamp): void {}

  /**
   * An event's stamp on the input clock: its own `timeStamp` when that is a
   * time on this clock (finite, not in the future), else now. `atMs` — where
   * a lift or a press is counted FROM — is never before an earlier stamp, so
   * the stamps of one input stay in order (later is the safe side for it);
   * `earliestMs` — where a lift ENDS — keeps the event's own time, never
   * pushed later: an event that happened during a long frame but was
   * dispatched after that frame's reads must not lengthen the lift before it.
   *
   * `sinceMs` (R8): a transition seen in a pointer SAMPLE happened somewhere
   * after the previous sample, so `earliestMs` is taken back to it — never
   * later than the event's own time; −∞ (no earlier sample seen) credits no
   * lift before it. Omitted, the event is a discrete one and exact.
   */
  protected eventStamp(timeStamp: unknown, sinceMs?: unknown): PedalStamp {
    const now = this.nowMs();
    const own = typeof timeStamp === "number" && Number.isFinite(timeStamp) && timeStamp <= now ? timeStamp : now;
    const at = Math.max(own, this.lastStampMs);
    this.lastStampMs = at;
    const since = typeof sinceMs === "number" && !Number.isNaN(sinceMs) ? Math.min(sinceMs, own) : own;
    return { atMs: at, earliestMs: since };
  }

  private refreshPedalChannels(stamp: PedalStamp): void {
    const touchBrake = this.touchSource?.brakeAxis ?? null;
    const touchThrottle = this.touchSource?.throttleAxis ?? null;
    const brake = touchBrake !== null ? touchBrake > REVERSE_ASSIST_PEDAL_ON : this.keyBrake || this.padBrake;
    const throttle =
      touchThrottle !== null ? touchThrottle > REVERSE_ASSIST_PEDAL_ON : this.keyThrottle || this.padThrottle;
    if (brake !== this.brakeCh) {
      this.brakeCh = brake;
      this.onPedalChannelEdge("brake", brake, stamp);
    }
    if (throttle !== this.throttleCh) {
      this.throttleCh = throttle;
      this.onPedalChannelEdge("throttle", throttle, stamp);
    }
  }

  private isHeld(code: string): boolean {
    return this.pressed.has(code) || this.pressedViaKey.has(code);
  }

  /** The RAW pedal keys changed (or may have): restamp the channels. */
  private keyPedalsChanged(timeStamp: unknown): void {
    const brake = this.isHeld("KeyS") || this.isHeld("ArrowDown");
    const throttle = this.isHeld("KeyW") || this.isHeld("ArrowUp");
    if (brake === this.keyBrake && throttle === this.keyThrottle) return;
    this.keyBrake = brake;
    this.keyThrottle = throttle;
    this.refreshPedalChannels(this.eventStamp(timeStamp));
  }

  /**
   * Current combined input (keyboard ∪ gamepad — strongest signal wins per
   * axis). Returns an internal reusable object; consume immediately, do not
   * retain across steps.
   *
   * Keyboard throttle/brake are RAMPED (see the pedal constants above),
   * integrated against wall time — read() is called by several consumers per
   * frame (physics step + render glue + cabin visuals), and wall-clock deltas
   * make the ramp advance by real elapsed time regardless of call frequency.
   */
  read(): VehicleInput {
    // A key counts as held when EITHER channel saw it: physical e.code
    // (primary) or the normalized e.key fallback (layout/remote-desktop
    // stacks that mangle e.code — see KEY_FALLBACKS).
    const on = (code: string): boolean =>
      this.pressed.has(code) || this.pressedViaKey.has(code);
    const left = on("KeyA") || on("ArrowLeft");
    const right = on("KeyD") || on("ArrowRight");

    const now = this.nowMs();
    const dt =
      this.lastReadMs === null
        ? 0
        : Math.min(Math.max((now - this.lastReadMs) / 1000, 0), MAX_RAMP_DT_S);
    this.lastReadMs = now;

    this.throttlePedal = stepPedal(
      this.throttlePedal,
      on("KeyW") || on("ArrowUp"),
      dt,
      THROTTLE_ATTACK_S,
      THROTTLE_RELEASE_S,
    );
    this.brakePedal = stepPedal(
      this.brakePedal,
      on("KeyS") || on("ArrowDown"),
      dt,
      BRAKE_ATTACK_S,
      BRAKE_RELEASE_S,
    );

    const out = this.out;
    out.throttle = this.throttlePedal;
    out.brake = this.brakePedal;
    out.steer = (left ? 1 : 0) - (right ? 1 : 0);
    // A1: keyboard Space is now the stateful parking-brake TOGGLE, handled by
    // CabinControls → DrivelineState (sim/scene/cabin.ts). The momentary
    // sport handbrake stays reachable on gamepad A only; Space remains in
    // HANDLED_CODES so it never scrolls the page.
    out.handbrake = false;

    this.mergeGamepad(out, now);
    // Touch merges LAST and by priority (active axis replaces) — inside
    // read() so GatedSimInput's raw capture + gate see touch pedals too.
    this.touchSource?.mergeInto(out);
    return out;
  }

  /** Standard mapping: left stick X = steer, RT = throttle, LT = brake, A = handbrake. */
  /** The first connected standard-mapping pad, or null. */
  private findPad(): Gamepad | null {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected && p.mapping === "standard") return p;
    }
    return null;
  }

  /**
   * Poll the pads' pedal channels NOW, without advancing the keyboard ramps or
   * producing a VehicleInput. A machine that reads the pedal log first asks for
   * this (GatedSimInput.brakeTiming): an event source has already told the log
   * everything up to now, a polled pad has told it only up to its last poll —
   * so without a fresh poll a pad released since then would still look held.
   */
  protected pollPads(): void {
    this.pollPadPedals(this.findPad(), this.nowMs());
  }

  private mergeGamepad(out: VehicleInput, nowMs: number): void {
    const pad = this.findPad();
    this.pollPadPedals(pad, nowMs);
    if (!pad) return;

    const rawSteer = pad.axes[0] ?? 0;
    // Pad axis: +1 = stick right; VehicleInput steer: +1 = LEFT.
    const steer = Math.abs(rawSteer) < GAMEPAD_DEADZONE ? 0 : -rawSteer;
    const throttle = pad.buttons[7]?.value ?? 0;
    const brake = pad.buttons[6]?.value ?? 0;
    const handbrake = pad.buttons[0]?.pressed ?? false;

    if (Math.abs(steer) > Math.abs(out.steer)) out.steer = steer;
    if (throttle > out.throttle) out.throttle = throttle;
    if (brake > out.brake) out.brake = brake;
    out.handbrake = out.handbrake || handbrake;
  }

  /**
   * R4 for the gamepad: a poll sees only that a trigger changed SINCE the
   * previous poll, so its edge is stamped [the previous poll, this poll] —
   * except a STEP-KEYED pad (the drive rig's, ADR-017), whose change happens at
   * the physics step being read and is stamped there, on the step clock.
   */
  private pollPadPedals(pad: Gamepad | null, nowMs: number): void {
    const brake = (pad?.buttons[6]?.value ?? 0) > REVERSE_ASSIST_PEDAL_ON;
    const throttle = (pad?.buttons[7]?.value ?? 0) > REVERSE_ASSIST_PEDAL_ON;
    const previousPoll = this.lastPollMs ?? nowMs;
    this.lastPollMs = nowMs;
    if (brake === this.padBrake && throttle === this.padThrottle) return;
    this.padBrake = brake;
    this.padThrottle = throttle;
    const stepKeyed = pad !== null && (pad as unknown as { stepKeyed?: unknown }).stepKeyed === true;
    const at = Math.max(nowMs, this.lastStampMs);
    const stamp: PedalStamp =
      stepKeyed && this.stepClockS !== null
        ? { atMs: at, earliestMs: at, stepS: this.stepClockS() }
        : { atMs: at, earliestMs: Math.min(at, previousPoll) };
    this.lastStampMs = at;
    this.refreshPedalChannels(stamp);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const fallback = keyFallbackCode(e);
    // preventDefault stays consistent across both channels: an ArrowDown that
    // arrives with e.code "Unidentified" must still not scroll the page.
    if (HANDLED_CODES.has(e.code) || fallback !== null) e.preventDefault();
    // THE AUTO-REPEAT STREAM IS THE OS SAYING „THIS KEY IS STILL DOWN", so the
    // hold is recorded BEFORE the one-shot guard below rather than after it.
    //
    // It used to be dropped whole, and that made `onBlur`'s clear PERMANENT.
    // Blur is not exotic — alt-tab, a notification stealing focus, a click in
    // the URL bar — and the key goes on being physically held across it. The
    // set was cleared, the repeats that say otherwise were discarded, and
    // nothing else could heal it: `read()` asks this set and no other, so the
    // student stood on a brake the sim did not believe in until they lifted the
    // foot and pressed again. On a brake, at a junction, that is the crash.
    // (The one-shots keep the guard: not re-firing on repeat is what it is for.)
    this.pressed.add(e.code);
    if (fallback !== null) this.pressedViaKey.add(fallback);
    this.keyPedalsChanged(e.timeStamp);
    if (e.repeat) return;
    if (this.debugKeys) this.logKey(e);
    if (e.code === "KeyC") this.callbacks.onToggleCamera?.();
    if (e.code === "KeyR") this.callbacks.onReset?.();
    if (e.code === "Escape") this.callbacks.onTogglePause?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
    const fallback = keyFallbackCode(e);
    if (fallback !== null) this.pressedViaKey.delete(fallback);
    this.keyPedalsChanged(e.timeStamp);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.pressedViaKey.clear();
    this.keyPedalsChanged(undefined);
  };

  /** ?debugkeys=1: ring-buffer the press on window.__aidriveKeyLog + one
   *  console.info line. Non-repeat presses only — human rate, no throttle
   *  needed. */
  private logKey(e: KeyboardEvent): void {
    const w = window as { __aidriveKeyLog?: Array<{ code: string; key: string }> };
    const log = (w.__aidriveKeyLog ??= []);
    log.push({ code: e.code, key: e.key });
    if (log.length > KEY_LOG_SIZE) log.shift();
    console.info(`[sim-keys] code=${e.code} key=${e.key}`);
  }
}
