// On-screen HUD: speed, cosmetic gear, FPS, camera mode, handbrake flag.

export class Hud {
  private readonly speedEl: HTMLSpanElement;
  private readonly gearEl: HTMLSpanElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly camEl: HTMLSpanElement;
  private readonly hbEl: HTMLDivElement;

  private frames = 0;
  private lastFpsStamp = performance.now();

  constructor(parent: HTMLElement) {
    const hud = document.createElement('div');
    hud.className = 'hud';

    const speedRow = document.createElement('div');
    this.speedEl = document.createElement('span');
    this.speedEl.className = 'speed';
    this.speedEl.textContent = '0';
    const unit = document.createElement('small');
    unit.textContent = ' km/h';
    speedRow.appendChild(this.speedEl);
    this.speedEl.appendChild(unit);
    hud.appendChild(speedRow);

    this.gearEl = this.row(hud, 'gear');
    this.fpsEl = this.row(hud, 'fps');
    this.camEl = this.row(hud, 'camera');

    this.hbEl = document.createElement('div');
    this.hbEl.className = 'hb';
    this.hbEl.textContent = 'HANDBRAKE';
    hud.appendChild(this.hbEl);

    const help = document.createElement('div');
    help.className = 'help';
    help.innerHTML =
      'W/S or &uarr;/&darr; &mdash; throttle / brake &amp; reverse<br>' +
      'A/D or &larr;/&rarr; &mdash; steer &middot; Space &mdash; handbrake<br>' +
      'C &mdash; camera &middot; R &mdash; reset';
    parent.appendChild(hud);
    parent.appendChild(help);

    this.setCameraMode('chase');
  }

  setCameraMode(mode: string): void {
    this.camEl.textContent = mode;
  }

  update(now: number, speedKmh: number, gear: string, handbrake: boolean): void {
    const shown = Math.abs(Math.round(speedKmh));
    this.speedEl.firstChild!.textContent = String(shown);
    this.gearEl.textContent = gear;
    this.hbEl.classList.toggle('on', handbrake);

    this.frames++;
    const elapsed = now - this.lastFpsStamp;
    if (elapsed >= 500) {
      this.fpsEl.textContent = String(Math.round((this.frames * 1000) / elapsed));
      this.frames = 0;
      this.lastFpsStamp = now;
    }
  }

  private row(hud: HTMLElement, label: string): HTMLSpanElement {
    const div = document.createElement('div');
    const value = document.createElement('span');
    div.textContent = `${label}: `;
    div.appendChild(value);
    hud.appendChild(div);
    return value;
  }
}
