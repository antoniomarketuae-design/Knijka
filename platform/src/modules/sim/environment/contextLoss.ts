// WebGL context-loss telemetry.
//
// doc 82 §2.3 fix 4: there was NO `webglcontextlost` listener anywhere in
// src/. On a 4 GB phone an OOM presents as a silent black canvas — the student
// sees a dead screen, the founder sees nothing, and the "does it run on the
// A16?" gate (§2.4) cannot tell a 12 fps drive from a context that died at
// second 40. That distinction is the whole reason the P1 measurement exists.
//
// WHERE THE TELEMETRY GOES. Nowhere off the device. Users are MINORS
// (ADR-004), so this ships as: a console.error the founder reads over
// chrome://inspect, plus an in-memory log the PerfProbe report embeds — the
// artifact §6.2 asks to commit. No beacon, no endpoint, no identifiers. If a
// server-side counter is ever wanted it needs its own consent story; do not
// add one here by reflex.
//
// Pure module (no DOM, no three.js) so the record/format logic is unit-tested
// in Node; GlContextGuard.tsx is the thin DOM half that attaches the listeners.

/** One context-loss (or restore) event, as recorded on the device. */
export interface ContextLossEvent {
  kind: "lost" | "restored";
  /** ms since page load (performance.now), so entries order themselves. */
  atMs: number;
  /** Render tier at the moment it happened — the first thing to suspect. */
  level: string;
  /**
   * Whatever the driver volunteered. `webglcontextlost` carries a
   * `statusMessage` on some implementations and an empty string on most, so
   * treat this as a bonus, never as the diagnosis.
   */
  statusMessage: string | null;
  /** Drawing-buffer size at the time, "w×h" — the VRAM question in one field. */
  drawingBufferSize: string | null;
}

/**
 * Session log. Capped: a context that flaps (lost → restored → lost) would
 * otherwise grow without bound while the page is left open on a dying phone,
 * and the first few events are the informative ones anyway.
 */
const MAX_EVENTS = 20;
let events: ContextLossEvent[] = [];

/** Append an event to the session log (oldest kept, newest dropped at cap). */
export function recordContextLoss(event: ContextLossEvent): void {
  if (events.length >= MAX_EVENTS) return;
  events.push(event);
}

/** The session's context-loss log, oldest first. */
export function getContextLossLog(): readonly ContextLossEvent[] {
  return events;
}

/** Test seam / new-session reset. */
export function resetContextLossLog(): void {
  events = [];
}

/** One-line console rendering — what the founder actually sees in DevTools. */
export function formatContextLossEvent(event: ContextLossEvent): string {
  const parts = [
    `[sim-gl] context ${event.kind}`,
    `tier=${event.level}`,
    `t=${(event.atMs / 1000).toFixed(1)}s`,
  ];
  if (event.drawingBufferSize) parts.push(`buffer=${event.drawingBufferSize}`);
  if (event.statusMessage) parts.push(`status="${event.statusMessage}"`);
  return parts.join(" ");
}
