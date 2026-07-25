// Driver input → normalized VehicleInput. Ported from the spike's keyboard
// reader, extended with an optional standard-mapping gamepad (analog steer +
// triggers). Plain TS, no React — the R3F layer just calls read() every
// physics step and wires the callbacks.

import { IDLE_INPUT, type VehicleInput } from "../vehicle";
import type { TouchInputSource } from "./touch";

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
/** Wall-clock clamp per read (s): a stalled tab must not slam a pedal. */
export const MAX_RAMP_DT_S = 0.1;

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
    this.touchSource = source;
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

    this.mergeGamepad(out);
    // Touch merges LAST and by priority (active axis replaces) — inside
    // read() so GatedSimInput's raw capture + gate see touch pedals too.
    this.touchSource?.mergeInto(out);
    return out;
  }

  /** Standard mapping: left stick X = steer, RT = throttle, LT = brake, A = handbrake. */
  private mergeGamepad(out: VehicleInput): void {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    let pad: Gamepad | null = null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected && p.mapping === "standard") {
        pad = p;
        break;
      }
    }
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

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const fallback = keyFallbackCode(e);
    // preventDefault stays consistent across both channels: an ArrowDown that
    // arrives with e.code "Unidentified" must still not scroll the page.
    if (HANDLED_CODES.has(e.code) || fallback !== null) e.preventDefault();
    if (e.repeat) return;
    if (this.debugKeys) this.logKey(e);
    this.pressed.add(e.code);
    if (fallback !== null) this.pressedViaKey.add(fallback);
    if (e.code === "KeyC") this.callbacks.onToggleCamera?.();
    if (e.code === "KeyR") this.callbacks.onReset?.();
    if (e.code === "Escape") this.callbacks.onTogglePause?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
    const fallback = keyFallbackCode(e);
    if (fallback !== null) this.pressedViaKey.delete(fallback);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.pressedViaKey.clear();
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
