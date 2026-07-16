/**
 * OVERTAKE-RETURN adjudication (doc 72 §10 OV-09 — „ранно прибиране пред
 * изпреварения", the brake-forcing cut back). The tracker watches the pass
 * phases DURING an opposing-bank excursion (mate seen genuinely ahead, then
 * genuinely behind — the same-direction overtakenQuery) and adjudicates ONCE,
 * on the frame the excursion ends as a COMMITTED RETURN to the own bank:
 *  - landing gap < OVERTAKE_RETURN_CONVICT_GAP_SEC (1 s) in front of the
 *    overtaken vehicle → violated "overtake-return" (reducer:
 *    OVERTAKE_RETURN_TOO_EARLY), gap = bumper distance / REFERENCE speed;
 *  - 1–2 s: the honest teach band — silent; ≥ 2 s: clean by silence.
 *
 * THE REFERENCE-SPEED LATCH is the heart of the FP battery here:
 *  - the mate's speed is live-tracked until the cut first enters the forcing
 *    window (ahead ≤ 20 m, lateral < 4 m in the MATE's frame), then frozen —
 *    a guard-rescued victim (slams because of the cut) cannot acquit the
 *    cutter, while a mate that slowed ON ITS OWN before any convergence keeps
 *    lowering the reference and widening the measured gap (the doc's named
 *    FP: „the overtaken car slowing on its own must not convict").
 *
 * FP battery (A12 — bias away from false positives):
 *  1. wide return (≥ 2 s)                       — clean by silence
 *  2. teach-band return (1–2 s)                 — measured country, ungraded
 *  3. the abort (never passed)                  — no return event exists
 *  4. natural mate slowdown before convergence  — live-tracked reference
 *  5. creeping return (≤ the commit bar)        — never grades
 *  6. reverse-gear dissolution                  — discards silently
 *  7. no query installed                        — structurally silent
 *  8. corridor already billed the excursion     — one act, one code
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createWorldRuntime,
  OVERTAKE_RETURN_BODY_M,
  OVERTAKE_RETURN_CONVICT_GAP_SEC,
  OVERTAKE_RETURN_SAFE_GAP_SEC,
  type CyclistConflict,
} from "..";
import { eventsOf, mkVehicle } from "./helpers";
import type { SimTick } from "../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadWorld(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** ov-oncoming-v1 lane centers (meta.scenario — the L7 copy truth). */
const X_OWN = 4.06;
const X_OPP = -2.5; // fully on the oncoming bank (center past the осева)

const DT = 0.05;
/** Player speed for every run below, km/h / m-per-frame. */
const V_KMH = 55;
const V_STEP = (V_KMH / 3.6) * DT; // ≈ 0.764 m/frame
/** The overtaken mate's cruise, m/s / m-per-frame (the ovgLeadCar's 40 km/h). */
const MATE_MPS = 11.1;
const MATE_STEP = MATE_MPS * DT; // ≈ 0.555 m/frame

interface MateSim {
  y: number;
  speedMps: number;
  /** Per-frame hook BEFORE publishing (rescue/natural-slow scripting). */
  onFrame?: (mate: MateSim, playerX: number, playerY: number) => void;
}

const returnsOf = (ticks: SimTick[]) =>
  eventsOf(ticks, "prioritySituation").filter(
    (e) => "situation" in e && e.situation === "overtake-return",
  );

/**
 * Drive `frames` player frames northbound; `frameAt` gives the lateral
 * position (the excursion/return choreography) and optionally a per-frame
 * speed; the mate rides the OWN lane center northward at its own speed. Both
 * advance every frame; the runtime's overtakenQuery reads the mate's live pose.
 */
function runOvertake(
  frames: number,
  frameAt: (frame: number) => { x: number; speedKmh?: number },
  mate: MateSim,
  opts: { gear?: number; playerY0?: number } = {},
): SimTick[] {
  const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
  const live: CyclistConflict = { x: X_OWN, y: mate.y, dirX: 0, dirY: 1, speedMps: mate.speedMps };
  rt.setOvertakenQuery((px, py, _h, r) => {
    if (Math.hypot(live.x - px, live.y - py) > r) return null;
    return { ...live };
  });
  const ticks: SimTick[] = [];
  let py = opts.playerY0 ?? 200;
  let t = 0;
  for (let f = 0; f < frames; f++) {
    const { x: px, speedKmh = V_KMH } = frameAt(f);
    mate.onFrame?.(mate, px, py);
    mate.y += mate.speedMps * DT;
    live.y = mate.y;
    live.speedMps = mate.speedMps;
    t += DT;
    rt.update(DT);
    ticks.push(
      rt.sample(mkVehicle({ x: px, y: py, headingDeg: 0 }, { speedKmh, gear: opts.gear ?? 1 }), t, false),
    );
    py += (speedKmh / 3.6) * DT;
  }
  return ticks;
}

/** Frame at which the player→mate along-track offset reaches `alongM`
 *  (player at 55, mate at 11.1, mate starts +15 ahead). */
function frameAtAlong(alongM: number): number {
  return Math.ceil((15 - alongM) / (V_STEP - MATE_STEP));
}

describe("overtake-return adjudication (OV-09) — the convict band", () => {
  it("bands are ordered as documented (convict < safe)", () => {
    expect(OVERTAKE_RETURN_CONVICT_GAP_SEC).toBeLessThan(OVERTAKE_RETURN_SAFE_GAP_SEC);
  });

  it("convicts the ~0.6 s cut back, once, with the measured landing gap", () => {
    // Return when the mate is ~10.8 m of centers behind → ~6.7 m of bumper
    // at 11.1 m/s ≈ 0.6 s — squarely under the 1 s bar.
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      cutFrame + 40,
      (f) => ({ x: f < cutFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    const events = returnsOf(ticks);
    expect(events).toHaveLength(1);
    const e = events[0] as { violated: boolean; gapSec?: number };
    expect(e.violated).toBe(true);
    expect(e.gapSec).toBeDefined();
    expect(e.gapSec!).toBeGreaterThan(0);
    expect(e.gapSec!).toBeLessThan(OVERTAKE_RETURN_CONVICT_GAP_SEC);
  });

  it("one bill per overtake — a second pass+cut is a second act and bills again", () => {
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    // First guilty overtake…
    const first = runOvertake(
      cutFrame + 40,
      (f) => ({ x: f < cutFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    // …and an independent second one (fresh runtime = fresh act — the
    // per-excursion reset is proven by the abort/teach cases staying silent).
    const second = runOvertake(
      cutFrame + 40,
      (f) => ({ x: f < cutFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    expect(returnsOf(first)).toHaveLength(1);
    expect(returnsOf(second)).toHaveLength(1);
  });

  it("guard-rescue honesty: the mate slamming BECAUSE of the cut cannot acquit it", () => {
    // The mate slams to 1 m/s the moment the player converges inside the
    // staged guard corridor (lateral < 3 m). The forcing window (4 m) is
    // strictly wider, so the reference froze at the honest 11.1 m/s one
    // frame earlier — the LIVE measure would read ~8 s (a phantom acquittal);
    // the frozen reference convicts the ~0.7 s landing.
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      cutFrame + 40,
      (f) => ({ x: f < cutFrame ? X_OPP : X_OWN }),
      {
        y: 215,
        speedMps: MATE_MPS,
        onFrame: (m, px) => {
          if (Math.abs(px - X_OWN) < 3) m.speedMps = 1.0; // the guard slam
        },
      },
    );
    const events = returnsOf(ticks);
    expect(events).toHaveLength(1);
    const e = events[0] as { violated: boolean; gapSec?: number };
    expect(e.violated).toBe(true);
    expect(e.gapSec!).toBeLessThan(OVERTAKE_RETURN_CONVICT_GAP_SEC);
  });
});

describe("overtake-return — FP battery (A12: err innocent)", () => {
  it("FP-1: the wide return (≥ 2 s of landing gap) is clean by silence", () => {
    const wideFrame = frameAtAlong(-(2.4 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      wideFrame + 40,
      (f) => ({ x: f < wideFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-2: the 1–2 s teach band is measured country, never graded", () => {
    const bandFrame = frameAtAlong(-(1.45 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      bandFrame + 40,
      (f) => ({ x: f < bandFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-3: the abort — never got ahead of the mate — has no return event at all", () => {
    // Tuck back while the mate is still AHEAD (the OV-08 sacred abort).
    const abortFrame = frameAtAlong(6); // mate still +6 m of centers ahead
    const ticks = runOvertake(
      abortFrame + 40,
      (f) => ({ x: f < abortFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
    );
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-4: the mate slowing ON ITS OWN before any convergence widens the gap — innocent", () => {
    // The mate eases from 11.1 to 4 m/s long before the player converges
    // (lateral still a full lane — never forced). The same landing DISTANCE
    // that convicts at 11.1 reads ~1.5 s against the live-tracked 4 m/s
    // reference — the doc's named FP stays structurally innocent.
    let slowed = false;
    const mate: MateSim = {
      y: 215,
      speedMps: MATE_MPS,
      onFrame: (m, px, py) => {
        if (!slowed && py > 215 && Math.abs(px - X_OWN) > 5) {
          // Natural decision, taken while the player is still far out left.
          if (m.y - py < 4) {
            m.speedMps = 4.0;
            slowed = true;
          }
        }
      },
    };
    // Land ~6 m of bumper in front — guilty at 11.1, teach-band at 4 m/s.
    const target = -(6 + OVERTAKE_RETURN_BODY_M);
    // Recompute the cut frame against the slowed relative rate is messy —
    // just run long segments and flip once the along offset is past target.
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    const live: CyclistConflict = { x: X_OWN, y: mate.y, dirX: 0, dirY: 1, speedMps: mate.speedMps };
    rt.setOvertakenQuery((px, py, _h, r) =>
      Math.hypot(live.x - px, live.y - py) > r ? null : { ...live },
    );
    const ticks: SimTick[] = [];
    let py = 200;
    let t = 0;
    let returned = false;
    for (let f = 0; f < 260; f++) {
      mate.onFrame?.(mate, returned ? X_OWN : X_OPP, py);
      mate.y += mate.speedMps * DT;
      live.y = mate.y;
      live.speedMps = mate.speedMps;
      if (!returned && mate.y - py <= target) returned = true;
      t += DT;
      rt.update(DT);
      ticks.push(
        rt.sample(
          mkVehicle({ x: returned ? X_OWN : X_OPP, y: py, headingDeg: 0 }, { speedKmh: V_KMH, gear: 1 }),
          t,
          false,
        ),
      );
      py += V_STEP;
    }
    expect(slowed).toBe(true);
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-5: a creeping return (at/under the commit bar) never grades", () => {
    // The pass itself runs at 55; the RETURN happens at a crawl (18 km/h —
    // under the corridor commit bar): guilty landing geometry, but a creeping
    // slot-in is anything but a pressed pass — the episode discards (A12).
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      cutFrame + 40,
      (f) =>
        f < cutFrame ? { x: X_OPP } : { x: X_OWN, speedKmh: 18 },
      { y: 215, speedMps: MATE_MPS },
    );
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-6: the excursion dissolving in REVERSE discards the episode silently", () => {
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks = runOvertake(
      cutFrame + 40,
      (f) => ({ x: f < cutFrame ? X_OPP : X_OWN }),
      { y: 215, speedMps: MATE_MPS },
      { gear: -1 }, // reverse maneuvering — the A12 exemption
    );
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-8: one act, one code — an excursion the corridor already billed never re-bills at the return", () => {
    // The same guilty ~0.6 s cut, but the excursion ALSO ran against a
    // convict-tight oncoming: the corridor bills OVERTAKE_INSUFFICIENT_GAP
    // mid-excursion, and the tight slot-back is that same act's tail (the
    // sc-ov-abort demos' „metres to spare") — the return stands down.
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => ({ distM: 42, closingMps: 14 })); // 3 s — convict band
    const mate: MateSim = { y: 215, speedMps: MATE_MPS };
    const live: CyclistConflict = { x: X_OWN, y: mate.y, dirX: 0, dirY: 1, speedMps: mate.speedMps };
    rt.setOvertakenQuery((px, py, _h, r) =>
      Math.hypot(live.x - px, live.y - py) > r ? null : { ...live },
    );
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks: SimTick[] = [];
    let py = 200;
    let t = 0;
    for (let f = 0; f < cutFrame + 40; f++) {
      mate.y += mate.speedMps * DT;
      live.y = mate.y;
      t += DT;
      rt.update(DT);
      ticks.push(
        rt.sample(
          mkVehicle(
            { x: f < cutFrame ? X_OPP : X_OWN, y: py, headingDeg: 0 },
            { speedKmh: V_KMH, gear: 1 },
          ),
          t,
          false,
        ),
      );
      py += V_STEP;
    }
    // The corridor billed the gamble…
    expect(
      eventsOf(ticks, "prioritySituation").filter(
        (e) => "situation" in e && e.situation === "overtake-oncoming",
      ),
    ).toHaveLength(1);
    // …so the return tracker stands down on the same excursion.
    expect(returnsOf(ticks)).toHaveLength(0);
  });

  it("FP-7: no overtakenQuery installed → structurally silent on the same guilty geometry", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    const cutFrame = frameAtAlong(-(0.6 * MATE_MPS + OVERTAKE_RETURN_BODY_M));
    const ticks: SimTick[] = [];
    let py = 200;
    let t = 0;
    for (let f = 0; f < cutFrame + 40; f++) {
      t += DT;
      rt.update(DT);
      ticks.push(
        rt.sample(
          mkVehicle(
            { x: f < cutFrame ? X_OPP : X_OWN, y: py, headingDeg: 0 },
            { speedKmh: V_KMH, gear: 1 },
          ),
          t,
          false,
        ),
      );
      py += V_STEP;
    }
    expect(returnsOf(ticks)).toHaveLength(0);
  });
});
