// Driver input → normalized VehicleInput. Ported from the spike's keyboard
// reader, extended with an optional standard-mapping gamepad (analog steer +
// triggers). Plain TS, no React — the R3F layer just calls read() every
// physics step and wires the callbacks.

import { IDLE_INPUT, type VehicleInput } from "../vehicle";

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

/** Stick values below this are treated as centre (worn-stick drift). */
const GAMEPAD_DEADZONE = 0.12;

export class SimInput {
  private readonly pressed = new Set<string>();
  private readonly out: VehicleInput = { ...IDLE_INPUT };

  constructor(private readonly callbacks: SimInputCallbacks = {}) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.pressed.clear();
  }

  /**
   * Current combined input (keyboard ∪ gamepad — strongest signal wins per
   * axis). Returns an internal reusable object; consume immediately, do not
   * retain across steps.
   */
  read(): VehicleInput {
    const on = (code: string): boolean => this.pressed.has(code);
    const left = on("KeyA") || on("ArrowLeft");
    const right = on("KeyD") || on("ArrowRight");

    const out = this.out;
    out.throttle = on("KeyW") || on("ArrowUp") ? 1 : 0;
    out.brake = on("KeyS") || on("ArrowDown") ? 1 : 0;
    out.steer = (left ? 1 : 0) - (right ? 1 : 0);
    out.handbrake = on("Space");

    this.mergeGamepad(out);
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
    if (HANDLED_CODES.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.pressed.add(e.code);
    if (e.code === "KeyC") this.callbacks.onToggleCamera?.();
    if (e.code === "KeyR") this.callbacks.onReset?.();
    if (e.code === "Escape") this.callbacks.onTogglePause?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };
}
