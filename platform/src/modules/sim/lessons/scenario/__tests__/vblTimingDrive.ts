/**
 * sc-vu-bikelane-turn:9141072b (lane vbltiming) — THE SHARED INSTRUMENT of the
 * with-flow rider's timing tests: one drive of the lesson in the world
 * LessonScene builds (liveChainReplay, director seeded per rung exactly as the
 * live shell seeds it), with every grid point's car pose, both riders' poses
 * and the turn latch recorded, and the car frame (fwd / left from the car's
 * own heading, fwd < 0 behind, left < 0 right) computed the way rig-w3n's
 * analyze.mjs measures it.
 *
 * A drive may stage a MODIFIED copy of the template (the probes and mutants
 * do: hold, cruise, the footprint field) — the compiled lesson keeps the
 * template's id, so the director's seed, and therefore every release draw,
 * stays the rung's own.
 */
import type { StagedEventOutcome } from "../../../contracts";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_VU_BIKELANE_TURN } from "../templates-vru2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { demoTrace } from "./npcContactDrive";
import { loadDistrict } from "./witnessLiveRung";

export const VBL_WF_ID = "sc-vbl-rider-wf";
export const VBL_CF_ID = "sc-vbl-rider-cf";
export const VBL_WF_Y = -6.66;
export const VBL_CF_Y = -8.26;
export const VBL_THROUGH_Y = -4.06;

export type VblTape = "shadow-correct" | "mistake-only-behind" | "mistake-cut-path";

export interface RiderPose {
  x: number;
  y: number;
  /** m/s */
  v: number;
  /** Arc past the junction node (actor.s − nodeS[1]), m. */
  arc: number;
}

export interface VblFrame {
  t: number;
  car: { x: number; y: number; h: number; kmh: number };
  wf: RiderPose | null;
  cf: RiderPose | null;
  /** turnStarted events this grid point's tick carried. */
  turns: Array<"left" | "right">;
  /** The traffic system's arrival-aware right-hand-rule conflict at vu-n-c
   *  (the query the runtime's conviction clock reads, PRIORITY_CONFLICT_RADIUS_M
   *  26), asked after this grid point's step. */
  rc: boolean;
}

export interface VblDrive {
  out: LiveReplayOutcome;
  frames: VblFrame[];
}

type TrafficLike = {
  staged(id: string): { x: number; y: number; speedMps: number; s: number; nodeS: readonly number[] } | null;
  conflictFromRight(jx: number, jy: number, px: number, py: number, h: number, r: number, s?: number): boolean;
};

function pose(traffic: TrafficLike, id: string): RiderPose | null {
  const a = traffic.staged(id);
  if (!a) return null;
  return { x: a.x, y: a.y, v: a.speedMps, arc: a.s - a.nodeS[1] };
}

/** The template with one rider's actor fields replaced (probes and mutants). */
export function withRider(
  id: string,
  actor: Record<string, unknown>,
  base: ScenarioSpec = SC_VU_BIKELANE_TURN,
): ScenarioSpec {
  return {
    ...base,
    staged: (base.staged ?? []).map((s) => {
      if ((s as { id: string }).id !== id) return s;
      const spec = s as unknown as { actor: Record<string, unknown> };
      const next: Record<string, unknown> = { ...spec.actor, ...actor };
      for (const k of Object.keys(actor)) if (actor[k] === undefined) delete next[k];
      return { ...(s as object), actor: next } as unknown as typeof s;
    }),
  } as ScenarioSpec;
}

export function vblDrive(
  level: ScenarioLevel,
  trace: VblTape | ScenarioTrace,
  template: ScenarioSpec = SC_VU_BIKELANE_TURN,
  extra?: { holdAfterSec?: number },
): VblDrive {
  const lesson = compileScenario(template, level);
  const frames: VblFrame[] = [];
  const tape = typeof trace === "string" ? demoTrace("sc-vu-bikelane-turn", `${trace}.trace.json`) : trace;
  const out = liveChainReplay({
    lesson,
    districtRaw: loadDistrict("vu-bikelane-v1"),
    trace: tape,
    ...(extra?.holdAfterSec !== undefined ? { holdAfterSec: extra.holdAfterSec } : {}),
    afterApply: (ctx) => {
      const traffic = ctx.traffic as unknown as TrafficLike;
      const turns: Array<"left" | "right"> = [];
      for (const e of ctx.tick.events) {
        const ev = e as { kind: string; direction?: "left" | "right" };
        if (ev.kind === "turnStarted" && ev.direction) turns.push(ev.direction);
      }
      frames.push({
        t: ctx.t,
        car: { x: ctx.tick.position.x, y: ctx.tick.position.y, h: ctx.tick.headingDeg, kmh: ctx.tick.speedKmh },
        wf: pose(traffic, VBL_WF_ID),
        cf: pose(traffic, VBL_CF_ID),
        turns,
        rc: traffic.conflictFromRight(0, 0, ctx.tick.position.x, ctx.tick.position.y, ctx.tick.headingDeg, 26, Math.abs(ctx.tick.speedKmh)),
      });
    },
  });
  return { out, frames };
}

/** The rider in the car's frame — heading (sin h, cos h); fwd < 0 behind, left < 0 right. */
export function carFrame(f: VblFrame, r: RiderPose): { fwd: number; left: number; dPC: number } {
  const rad = (f.car.h * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const dx = r.x - f.car.x;
  const dy = r.y - f.car.y;
  return { fwd: dx * fx + dy * fy, left: -dx * fy + dy * fx, dPC: Math.hypot(dx, dy) };
}

/** The car's body (CHASSIS 2.02 × 0.85 half-extents) — min distance from any of its points to the rider's centre line y. */
export function bodyToLineM(f: VblFrame, lineY: number): number {
  const rad = (f.car.h * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  // Right of travel = (fy, −fx).
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of [-2.02, 2.02]) {
    for (const c of [-0.85, 0.85]) {
      const y = f.car.y + a * fy - c * fx;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (lineY >= minY && lineY <= maxY) return 0;
  return Math.min(Math.abs(lineY - minY), Math.abs(lineY - maxY));
}

export const r2 = (n: number) => +n.toFixed(2);

export function firstRest(frames: VblFrame[], afterT = 5): VblFrame | undefined {
  return frames.find((f) => f.t > afterT && Math.abs(f.car.kmh) < 0.5);
}

export function rightLatch(frames: VblFrame[]): VblFrame | undefined {
  return frames.find((f) => f.turns.includes("right") && Math.hypot(f.car.x, f.car.y) <= 40);
}

export function releaseT(frames: VblFrame[], who: "wf" | "cf"): number | null {
  const f = frames.find((q) => (q[who]?.v ?? 0) > 1e-6);
  return f ? r2(f.t) : null;
}

export function wfOutcomes(out: LiveReplayOutcome, id = VBL_WF_ID): Array<{ detail: string; t: number }> {
  return out.outcomes
    .filter((o: StagedEventOutcome) => o.eventId === id)
    .map((o) => ({ detail: String(o.detail), t: r2(o.tSec ?? NaN) }));
}

export function eventsList(out: LiveReplayOutcome): string[] {
  return out.session.events.map((e) => {
    const d = (e as { detail?: string }).detail;
    return `${r2(e.t)} ${e.kind}:${(e as { code?: string }).code ?? ""}${d ? `:${d}` : ""}`;
  });
}
