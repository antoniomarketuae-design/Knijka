/**
 * B15 PROBE — NOT A GATE. Throwaway measuring rig for register row B15
 * („waited at the give-way line, convicted the instant the wheels turned").
 *
 * It rebuilds the production stack the trace recorder builds (worldRuntime +
 * traffic + the template's own staged circulating car), drives the founder's
 * sequence — approach, FULL STOP at the give-way line, wait N seconds, pull
 * away — and prints, per tick: the driver's pose, the STAGED CAR'S measured
 * position and speed, and every rule event with the exact tick it fired on.
 *
 * The browser rig can photograph the card; only this can say where the other
 * car actually was when it fired. Delete once the row is decided.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../worldRuntime";
import { createTrafficSystem } from "../../traffic";
// `traffic/types` exports this as TrafficDistrict — there is no `District`
// there (that name lives on the runtime barrel and is a different shape).
import type { TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../../orchestrator";
import type { StagedEventSpec } from "../../contracts";
import { SC_ROUNDABOUT_ENTRY } from "../../lessons/scenario/templates-flow";
import { createRuleEngine, reduceTick } from "../../rules";
import type { RuleEvent } from "../../rules";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
/**
 * WHERE THIS WRITES, AND WHY IT MOVED — 2026-08-22.
 *
 * This used to be an absolute path into one agent session's scratchpad:
 * `…\Temp\claude\E--AI-driver\8942546c-780e-…\scratchpad\b15\probe.txt`, and the
 * write happens at MODULE LOAD, so the file failed at import — not in a test —
 * on any machine that was not that session, and on that machine the moment the
 * session's temp directory was cleaned up. A committed test that depends on a
 * dead session's temp directory is a landmine with a timer on it.
 *
 * It now writes under the OS temp directory and creates its own parent, so it
 * works anywhere and owns nothing. The probe is still NOT A GATE — see the
 * header — and it should still be deleted once register row B15 is decided.
 */
const OUT = path.join(os.tmpdir(), "knijka-b15-probe", "probe.txt");
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, "");
const DT = 1 / 30;
const X_LANE = 4.06;

const district = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "rb-mini-v1.json"), "utf-8"),
) as unknown;

interface Row {
  t: number;
  y: number;
  v: number;
  carX: number;
  carY: number;
  carV: number;
  /** Signed left-offset of the car in the driver's frame (+ = on the LEFT). */
  leftM: number;
  /** Straight-line driver→car distance. */
  distM: number;
  /** Ring angle φ, degrees from the SOUTH node, CCW through EAST. */
  phiDeg: number;
}

interface Run {
  rows: Row[];
  events: { t: number; code: string; detail: string; y: number; v: number }[];
}

/**
 * Drive: hold 20 km/h north up the south arm, brake to a stop with the front
 * axle at `stopY`, stand still for `waitSec`, then accelerate to 12 km/h.
 */
function drive(stopY: number, waitSec: number, totalSec: number): Run {
  const runtime = createWorldRuntime(district);
  const traffic = createTrafficSystem(district as TrafficDistrict, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r, s) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r, s),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
  const staged = [...(SC_ROUNDABOUT_ENTRY.staged ?? [])] as StagedEventSpec[];
  const director =
    staged.length > 0
      ? createScenarioDirector(staged, traffic, { seed: 7, signals: runtime })
      : null;

  let rules = createRuleEngine();
  const rows: Row[] = [];
  const events: Run["events"] = [];

  let y = -93;
  let vMps = 0;
  let stoppedForSec = 0;
  let released = false;

  for (let t = 0; t < totalSec; t += DT) {
    // --- longitudinal program -------------------------------------------
    const target = (() => {
      if (released) return 12 / 3.6;
      const d = stopY - y;
      if (d <= 0) return 0;
      return Math.min(20 / 3.6, Math.sqrt(2 * 2 * d));
    })();
    const dv = target - vMps;
    vMps += Math.max(-3 * DT, Math.min(3 * DT, dv));
    if (vMps < 0) vMps = 0;
    y += vMps * DT;
    if (!released) {
      if (vMps < 0.05 && y >= stopY - 3) stoppedForSec += DT;
      if (stoppedForSec >= waitSec) released = true;
    }

    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: X_LANE, y },
      playerSpeedKmh: vMps * 3.6,
      playerHeadingDeg: 0,
    });
    const leadGap = traffic.leadGapMeters(X_LANE, y, 0);
    const tick = runtime.sample(
      {
        position: { x: X_LANE, y },
        headingDeg: 0,
        speedKmh: vMps * 3.6,
        indicator: "off",
        headlights: "off",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 1,
        mirrorGlance: null,
        stalled: false,
        fogLightsOn: false,
      },
      t,
      false,
      false,
      leadGap,
      false,
      false,
    );
    if (director) {
      const res = director.step({
        tSec: t,
        dtSec: DT,
        x: X_LANE,
        y,
        speedKmh: vMps * 3.6,
        headingDeg: 0,
        brakePedal: 0,
        tickEvents: tick.events,
      });
      for (const e of res.events) tick.events.push(e);
    }
    const reduced = reduceTick(rules, tick);
    rules = reduced.state;
    for (const e of reduced.events as RuleEvent[]) {
      if (e.kind === "violation") {
        events.push({
          t,
          code: e.code,
          detail: (e as { detail?: string }).detail ?? "",
          y,
          v: vMps * 3.6,
        });
      }
    }

    const car = traffic.vehicles[0];
    if (car) {
      // Driver heads north, so LEFT = −x. leftM > 0 ⇒ the car is on the left.
      const leftM = -(car.x - X_LANE);
      const distM = Math.hypot(car.x - X_LANE, car.y - y);
      const phiDeg = (Math.atan2(car.x, -car.y) * 180) / Math.PI;
      rows.push({
        t,
        y,
        v: vMps * 3.6,
        carX: car.x,
        carY: car.y,
        carV: car.speedMps,
        leftM,
        distM,
        phiDeg,
      });
    } else {
      rows.push({ t, y, v: vMps * 3.6, carX: NaN, carY: NaN, carV: NaN, leftM: NaN, distM: NaN, phiDeg: NaN });
    }
  }
  return { rows, events };
}

function report(label: string, run: Run): void {
  const lines: string[] = [`\n=== ${label} ===`];
  lines.push("   t(s)   drvY   drvV |   carX   carY  carV   left   dist    phi");
  for (const r of run.rows) {
    if (Math.round(r.t * 30) % 15 !== 0) continue; // 2 Hz
    lines.push(
      `${r.t.toFixed(2).padStart(7)} ${r.y.toFixed(2).padStart(6)} ${r.v.toFixed(1).padStart(6)} | ` +
        `${r.carX.toFixed(2).padStart(6)} ${r.carY.toFixed(2).padStart(6)} ${r.carV.toFixed(2).padStart(5)} ` +
        `${r.leftM.toFixed(1).padStart(6)} ${r.distM.toFixed(1).padStart(6)} ${r.phiDeg.toFixed(0).padStart(6)}`,
    );
  }
  lines.push("--- violations ---");
  if (run.events.length === 0) lines.push("  (none)");
  for (const e of run.events) {
    const at = run.rows.find((r) => Math.abs(r.t - e.t) < 1e-9);
    lines.push(
      `  t=${e.t.toFixed(2)} ${e.code}[${e.detail}] at drvY=${e.y.toFixed(2)} v=${e.v.toFixed(1)} — ` +
        `car (${at?.carX.toFixed(2)}, ${at?.carY.toFixed(2)}) v=${at?.carV.toFixed(2)} ` +
        `left=${at?.leftM.toFixed(1)} dist=${at?.distM.toFixed(1)} phi=${at?.phiDeg.toFixed(0)}`,
    );
  }
  appendFileSync(OUT, lines.join("\n") + "\n");
}

describe("B15 probe — stop at the give-way line, wait, pull away", () => {
  for (const wait of [0, 2, 4, 8, 20, 40, 60]) {
    it(`wait ${wait}s`, () => {
      const run = drive(-37, wait, wait + 34);
      report(`wait ${wait}s`, run);
      expect(run.rows.length).toBeGreaterThan(100);
    });
  }
});
