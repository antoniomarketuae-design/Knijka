/**
 * TEMPORARY INSTRUMENTATION (B80 sweep) — delete before commit.
 *
 * Sweeps a grid of drives on the LIVE sc-ov-narrow@L1 / ov-narrow-v1 stack and
 * counts, objectively:
 *   BARGE   = at some frame the player is INSIDE the стеснение (y 110..145),
 *             left of the centre line (x < -1.2), while the staged oncoming is
 *             still NORTH of him and within 60 m — i.e. he took the narrowing
 *             against a car that had priority.
 *   SILENT  = a BARGE drive that never raised FAILED_TO_YIELD.
 * Plus the inverse: LAWFUL drives (never in the oncoming lane while the car is
 * inbound) that must stay clean.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec, VehicleSample } from "../../contracts";
import { DEFAULT_LESSON_TRAFFIC } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_OV_NARROW } from "../../lessons/scenario/templates-lanes";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector, lessonSeed } from "../director";

const ID = "ov-narrow-v1";
const DT = 1 / 30;
const X_OWN = 4.06;
const X_ONC = -4.06;
// (The стеснение is y ∈ [110, 145]; the barge test below deliberately does not
// reference it — see the note at the barge predicate.)

function loadRaw(): TrafficDistrict {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${ID}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as TrafficDistrict;
  }
  throw new Error("district not found");
}

interface Leg {
  to: { x: number; y: number };
  kmh: number;
  pauseSec?: number;
}

interface Result {
  barged: boolean;
  bargeFirstT: number | null;
  failedToYield: boolean;
  faultT: number | null;
  collision: boolean;
  commended: boolean;
  codes: string[];
  /** Pose at the frame FAILED_TO_YIELD fired: player + staged oncoming. */
  faultPose: string | null;
  /** Closest the two bodies ever came, m, and where. */
  minGap: string;
}

function drive(legs: Leg[], maxSec = 140): Result {
  const raw = loadRaw();
  const lesson = compileScenario(SC_OV_NARROW, 1);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, {
    seed: 7,
    vehicleCount: DEFAULT_LESSON_TRAFFIC.vehicleCount,
    pedestrianCount: DEFAULT_LESSON_TRAFFIC.pedestrianCount,
    anchor: { x: X_OWN, y: 15 },
    anchorRadiusM: DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  const director = createScenarioDirector(staged, traffic, {
    seed: lessonSeed(lesson.id),
    signals: runtime,
  });

  let px = X_OWN;
  let py = 15;
  let v = 0;
  let leg = 0;
  let pauseLeft = 0;
  let heading = 0;
  let rules = createRuleEngine();
  const ruleEvents: RuleEvent[] = [];
  let t = 0;
  let barged = false;
  let bargeFirstT: number | null = null;
  let faultT: number | null = null;
  let faultPose: string | null = null;
  let minGap = Infinity;
  let minGapWhere = "";

  for (let i = 0; i < maxSec * 30; i++) {
    let brakePedal = 0;
    if (pauseLeft > 0) {
      pauseLeft -= DT;
      v = 0;
      brakePedal = 0.6;
    } else if (leg < legs.length) {
      const tgt = legs[leg].to;
      const dx = tgt.x - px;
      const dy = tgt.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 0.35) {
        pauseLeft = legs[leg].pauseSec ?? 0;
        leg++;
      } else {
        heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
        const target = legs[leg].kmh / 3.6;
        v = v < target ? Math.min(target, v + 2.5 * DT) : Math.max(target, v - 5 * DT);
        const step = Math.min(d, v * DT);
        px += (dx / d) * step;
        py += (dy / d) * step;
      }
    } else {
      v = Math.max(0, v - 5 * DT);
    }
    const speedKmh = v * 3.6;

    t += DT;
    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: px, y: py },
      playerSpeedKmh: speedKmh,
      playerHeadingDeg: heading,
    });
    const sample: VehicleSample = {
      position: { x: px, y: py },
      headingDeg: heading,
      speedKmh,
      indicator: "left",
      headlights: "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      mirrorGlance: null,
    };
    const tick = runtime.sample(sample, t, false, false, Infinity);
    const st = director.step({
      tSec: t,
      dtSec: DT,
      x: px,
      y: py,
      speedKmh,
      headingDeg: heading,
      brakePedal,
      tickEvents: tick.events,
    });
    for (const e of st.events) tick.events.push(e);
    const red = reduceTick(rules, tick);
    rules = red.state;
    for (const e of red.events) {
      if (e.kind === "violation" && e.code === "FAILED_TO_YIELD" && faultT === null) {
        faultT = t;
        const a0 = traffic.staged("sc-ovn-meeting");
        faultPose = a0
          ? `P(${px.toFixed(1)},${py.toFixed(1)}) ${speedKmh.toFixed(0)}km/h A(${a0.x.toFixed(1)},${a0.y.toFixed(1)}) gap=${Math.hypot(a0.x - px, a0.y - py).toFixed(1)}m`
          : "no actor";
      }
    }
    ruleEvents.push(...red.events);

    // Objective barge test — independent of anything the runner believes.
    const actor = traffic.staged("sc-ovn-meeting");
    if (actor && !actor.finished) {
      const g = Math.hypot(actor.x - px, actor.y - py);
      if (g < minGap) {
        minGap = g;
        minGapWhere = `t=${t.toFixed(1)} P(${px.toFixed(1)},${py.toFixed(1)}) A(${actor.x.toFixed(1)},${actor.y.toFixed(1)})`;
      }
    }
    // NOTE (B80): this used to also require `py >= SEC_FROM && py <= SEC_TO`,
    // which silently excluded every barge CONSUMMATED just short of the mouth —
    // twelve drives that put the player in the oncoming's lane and drove head-on
    // into it at 0.1–0.2 m were being counted as "lawful". Occupying the
    // oncoming vehicle's lane while it is inbound and close IS "not letting it
    // pass", wherever on the street it happens; the section band was never part
    // of that sentence. Still computed from raw poses only — nothing the runner
    // believes feeds this.
    if (actor && px < -1.2 && actor.y > py && actor.y - py <= 60 && !actor.finished) {
      barged = true;
      if (bargeFirstT === null) bargeFirstT = t;
    }
    if (leg >= legs.length && pauseLeft <= 0 && v <= 0.01) break;
  }

  const codes = [...new Set(ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))];
  return {
    barged,
    bargeFirstT,
    failedToYield: codes.includes("FAILED_TO_YIELD"),
    faultT,
    collision: codes.includes("COLLISION"),
    commended: ruleEvents.some((e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY"),
    faultPose,
    minGap: `${minGap.toFixed(1)}m @ ${minGapWhere}`,
    codes,
  };
}

/** Pull out at `pullY`, hold the oncoming lane through the стеснение. */
function bargeLegs(approachKmh: number, bargeKmh: number, pullY: number, holdSec: number): Leg[] {
  return [
    { to: { x: X_OWN, y: pullY - 4 }, kmh: approachKmh, pauseSec: holdSec },
    { to: { x: X_ONC, y: pullY + 6 }, kmh: bargeKmh },
    { to: { x: X_ONC, y: 148 }, kmh: bargeKmh },
    { to: { x: X_OWN, y: 175 }, kmh: bargeKmh },
  ];
}

describe("B80 sweep", () => {
  it("grid: how many objective barges go unconvicted", () => {
    const rows: string[] = [];
    let barges = 0;
    let silent = 0;
    let lawful = 0;
    let lawfulFalsePositive = 0;
    for (const approach of [8, 14, 20, 28]) {
      for (const bargeKmh of [8, 16, 24]) {
        for (const pullY of [96, 104, 112, 120]) {
          for (const holdSec of [0, 4, 8, 12]) {
            const r = drive(bargeLegs(approach, bargeKmh, pullY, holdSec));
            const tag = `a${approach}/b${bargeKmh}/pull${pullY}/hold${holdSec}`;
            if (r.barged) {
              barges++;
              if (!r.failedToYield) {
                silent++;
                rows.push(
                  `SILENT  ${tag}  bargeAt=${r.bargeFirstT?.toFixed(1)}  codes=${JSON.stringify(r.codes)}  commended=${r.commended}`,
                );
              } else {
                rows.push(`convict ${tag}  bargeAt=${r.bargeFirstT?.toFixed(1)} faultAt=${r.faultT?.toFixed(1)}`);
              }
            } else {
              lawful++;
              if (r.failedToYield) {
                lawfulFalsePositive++;
                rows.push(
                  `FALSE+  ${tag}  codes=${JSON.stringify(r.codes)}
         fault@ ${r.faultPose}
         closest ${r.minGap}`,
                );
              }
            }
          }
        }
      }
    }
    const report =
      `\n===== B80 SWEEP =====\n` +
      rows.join("\n") +
      `\n-> objective barges: ${barges}   SILENT (no FAILED_TO_YIELD): ${silent}` +
      `\n-> non-barge drives: ${lawful}   false positives: ${lawfulFalsePositive}\n`;
    fs.appendFileSync(process.env.B80_LOG ?? "b80.log", report);
    expect(barges).toBeGreaterThan(0);
  }, 300_000);
});
