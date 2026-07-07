// Keyboard input → normalized vehicle input. Kept analog-shaped (0..1 axes)
// so the platform can swap in gamepad/touch input without touching vehicle.ts.

export interface VehicleInput {
  /** 0..1 accelerator. */
  throttle: number;
  /** 0..1 brake pedal (doubles as reverse when stopped). */
  brake: number;
  /** -1..1 steering, POSITIVE = LEFT (positive yaw about +Y). */
  steer: number;
  handbrake: boolean;
}

export interface KeyboardCallbacks {
  onToggleCamera?: () => void;
  onReset?: () => void;
}

const HANDLED_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyC',
  'KeyR',
]);

export class Keyboard {
  private readonly pressed = new Set<string>();

  constructor(private readonly callbacks: KeyboardCallbacks = {}) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  read(): VehicleInput {
    const on = (code: string): boolean => this.pressed.has(code);
    const left = on('KeyA') || on('ArrowLeft');
    const right = on('KeyD') || on('ArrowRight');
    return {
      throttle: on('KeyW') || on('ArrowUp') ? 1 : 0,
      brake: on('KeyS') || on('ArrowDown') ? 1 : 0,
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      handbrake: on('Space'),
    };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (HANDLED_CODES.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.pressed.add(e.code);
    if (e.code === 'KeyC') this.callbacks.onToggleCamera?.();
    if (e.code === 'KeyR') this.callbacks.onReset?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };
}
