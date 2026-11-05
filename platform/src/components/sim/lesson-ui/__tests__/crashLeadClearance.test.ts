/**
 * THE BANNER LEAD FOLLOWS THE CLEARANCE CHECK — lane endings round 4,
 * integrator condition C1 (sc-pk-driveway:7fa8b79e, ruling E11).
 *
 * The card, the peek and the banner lead all read `routeHoldWayOutForSession`,
 * which since E11 names a direction only while the end the move heads toward is
 * more than SWEEP_RESOLUTION_M clear of every listed body (`crashPin.clear`).
 * The card and the peek are pinned at the engine (endings-gate1-runout §7). The
 * LEAD is built by the SHELL: `snapshotOf` copies the way out into
 * `objectiveHoldWayOut`, and the banner mount prints
 * `objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold,
 * snap.objectiveHoldWayOut)`. The round-4 verifier's mutant W5 rewrote the
 * snapshot to hand the way-out function a pin whose `clear` is all-true — a
 * wedged car's lead went back to «назад» into the second wall — and no test
 * failed: every lead fixture with a crash pin had no bodies.
 *
 * So this drives a real compiled session through the engine into the WEDGE
 * (struck by the front, then rolled back to 0.002 m of a second listed wall
 * with no new contact), and reads every hold frame through `snapshotOf` and
 * the banner mount's own expression. The control — the same drive with the
 * rear clear — must keep «назад», so the wedge assertion cannot pass vacuously.
 */
import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "@/modules/sim/collision";
import type { SimTick } from "@/modules/sim/rules";
import {
  SCENARIO_TEMPLATES,
  applyTick,
  compileScenario,
  createLessonSession,
  type LessonSessionState,
} from "@/modules/sim/lessons";
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";
import { bannerObjectiveLineBg, objectiveTitleUnderHold, snapshotOf, type HudSnapshot } from "../LessonPlayShell";

// RE-TAUGHT (lane rbreverse, sc-roundabout-entry:9e85f27e, ruling R6): these were
// «След удара — ако колата опира в удареното, първо леко назад / я отдръпни» — the
// move first, no look. The leads now look first; which one a wedged car gets (the
// clearance fact this file pins, condition 1 / mutant W5) is unchanged.
const LEAD_BACK = "След удара — първо се огледай; ако колата опира, леко назад";
const LEAD_AWAY = "След удара — първо се огледай; ако колата опира, леко я отдръпни";

type Box = NonNullable<LessonSessionState["staticContactBodies"]>[number];

/** A wall across the car's path, `gapM` off its nose ("ahead") or its tail ("behind"). */
function wallAt(pose: { x: number; y: number; headingDeg: number }, where: "ahead" | "behind", gapM: number): Box {
  const h = (pose.headingDeg * Math.PI) / 180;
  const T = 0.15;
  const along = (where === "ahead" ? 1 : -1) * (PLAYER_HALF_LENGTH_M + T + gapM);
  return {
    x: pose.x + Math.sin(h) * along,
    y: pose.y + Math.cos(h) * along,
    headingDeg: pose.headingDeg + 90,
    halfLengthM: 2,
    halfWidthM: T,
  } as Box;
}

/**
 * Forward at 20 km/h into a wall, still, then rolled back 0.1 m (no contact
 * event, so no re-arm) to rest. `secondGapM` puts a second listed wall that far
 * off the REST pose's tail; omitted, the rear stays clear.
 */
function wedge(secondGapM?: number) {
  const lesson = compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!, 1);
  const sp = lesson.spawn.position ?? { x: 0, y: 0 };
  const hdg = lesson.spawn.headingDeg ?? 0;
  const h = (hdg * Math.PI) / 180;
  const p = (d: number) => ({ x: sp.x + Math.sin(h) * d, y: sp.y + Math.cos(h) * d });
  const contact = { ...p(12), headingDeg: hdg };
  const rest = { ...p(11.9), headingDeg: hdg };
  const bodies: Box[] = [wallAt(contact, "ahead", 0.01)];
  if (secondGapM !== undefined) bodies.push(wallAt(rest, "behind", secondGapM));
  const ticks: SimTick[] = [];
  let t = 0;
  for (let i = 0; i < 6; i++, t += 0.5) ticks.push(makeTick({ t, speedKmh: 20, headingDeg: hdg, position: p(2 * i) }));
  ticks.push(makeTick({ t, speedKmh: -2, headingDeg: hdg, position: p(12), events: [{ kind: "collision", withWhat: "staticObject" }] }));
  t += 0.5;
  for (; t < 4.01; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(12) }));
  ticks.push(makeTick({ t, speedKmh: -3.6, headingDeg: hdg, position: p(11.9) }));
  t += 0.5;
  for (; t < 40; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(11.9) }));

  let s = createLessonSession(lesson, { staticContactBodies: bodies });
  let prev: HudSnapshot | null = null;
  const frames: Array<{ t: number; way: string | undefined; lead: string | null }> = [];
  for (const k of ticks) {
    s = applyTick(s, k).state;
    const snap = snapshotOf(s, k, null, prev);
    prev = snap;
    if (s.phase === "driving" && snap.objectiveHold === "crashPinned") {
      frames.push({
        t: k.t,
        way: snap.objectiveHoldWayOut,
        // The banner mount's expression, verbatim (LessonPlayShell `titleBg=`).
        lead: objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold, snap.objectiveHoldWayOut),
      });
    }
  }
  return { s, frames };
}

describe("C1 — the shell's banner lead follows the E11 clearance check (snapshotOf → objectiveHoldWayOut)", () => {
  it("a WEDGED car (struck by the front, rear 0.002 m from a second listed wall) gets the direction-free lead on every hold frame", () => {
    const d = wedge(0.002);
    expect(d.s.crashPin?.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
    expect(d.s.crashPin?.clear).toEqual({ front: false, rear: false });
    expect(d.frames.length).toBeGreaterThan(0);
    const wrong = d.frames.filter((f) => f.way !== "away" || f.lead === null || !f.lead.startsWith(`${LEAD_AWAY}: `));
    expect(wrong).toEqual([]);
  });

  it("CONTROL — the same drive with the rear clear keeps «назад» in the shell's lead (the wedge result is the clearance, not a default)", () => {
    const d = wedge();
    expect(d.s.crashPin?.clear).toEqual({ front: false, rear: true });
    expect(d.frames.length).toBeGreaterThan(0);
    const wrong = d.frames.filter((f) => f.way !== "back" || f.lead === null || !f.lead.startsWith(`${LEAD_BACK}: `));
    expect(wrong).toEqual([]);
  });
});
