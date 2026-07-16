/**
 * Capability-phase unit gate — the recorder's stall channel ({kind:"stall"})
 * and hard-brake override (drive.maxDecelMps2). Proves each channel reaches
 * the rule engine and grades its shipped code, that the DEFAULTS are the
 * recorder's former hardcodes (a script that never touches them stays clean),
 * and the HARSH_BRAKING_NO_CAUSE innocent side: the SAME slam with a hazard
 * cause in the ledger (a pedestrian-crossing zone entered moments before)
 * must NOT fire. This is the VP-04 / SP-11 family unlock; templates ride
 * these channels (sc-vp-stall, sc-sp-harsh-brake).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScriptedDrive, type DriveScript } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const ln = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const pe = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "pe-clear-v1.json"), "utf-8"));

function record(district: unknown, script: DriveScript) {
  return recordScriptedDrive(district, script, { scenarioId: "stall-brake-probe", kind: "mistake", seed: 7 });
}

function violations(d: ReturnType<typeof record>, code: string): number {
  return d.ruleEvents.filter((e) => e.kind === "violation" && e.code === code).length;
}

describe("recorder stall channel ({kind:'stall'} — VP-04)", () => {
  it("DEFAULT: a script that never emits the step records stalled=false — no ENGINE_STALLED", () => {
    const d = record(ln, {
      steps: [
        { kind: "drive", points: [[12.19, 15], [12.19, 200], [12.19, 360]], targetKmh: 40 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "ENGINE_STALLED")).toBe(0);
  });

  it("one stall→restart cycle grades EXACTLY ONE ENGINE_STALLED (the latch's rising edge)", () => {
    const d = record(ln, {
      steps: [
        { kind: "drive", points: [[12.19, 15], [12.19, 120]], targetKmh: 40 },
        { kind: "stall", on: true },
        { kind: "pause", sec: 2, brake: true }, // stalled for 120 ticks — no double bill
        { kind: "stall", on: false },
        { kind: "pause", sec: 1 },
        { kind: "drive", points: [[12.19, 120], [12.19, 360]], targetKmh: 40 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "ENGINE_STALLED")).toBe(1);
  });

  it("each restart re-arms the episode: two stall cycles grade TWO ENGINE_STALLED", () => {
    const d = record(ln, {
      steps: [
        { kind: "drive", points: [[12.19, 15], [12.19, 18]], targetKmh: 6 },
        { kind: "stall", on: true },
        { kind: "pause", sec: 1.5, brake: true },
        { kind: "stall", on: false },
        { kind: "pause", sec: 0.8 },
        { kind: "drive", points: [[12.19, 18], [12.19, 21]], targetKmh: 6 },
        { kind: "stall", on: true },
        { kind: "pause", sec: 1.5, brake: true },
        { kind: "stall", on: false },
        { kind: "pause", sec: 0.8 },
        { kind: "drive", points: [[12.19, 21], [12.19, 200]], targetKmh: 40 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "ENGINE_STALLED")).toBe(2);
  });
});

describe("recorder hard-brake override (drive.maxDecelMps2 — SP-11/VP-09)", () => {
  it("DEFAULT: the 4.6 stop envelope stays under the harsh threshold — no HARSH_BRAKING_NO_CAUSE", () => {
    const d = record(ln, {
      steps: [
        { kind: "drive", points: [[12.19, 15], [12.19, 200]], targetKmh: 47 },
        { kind: "pause", sec: 1, brake: true },
        { kind: "drive", points: [[12.19, 200], [12.19, 360]], targetKmh: 40 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "HARSH_BRAKING_NO_CAUSE")).toBe(0);
  });

  it("a maxDecelMps2:12 slam to rest on an EMPTY street fires HARSH_BRAKING_NO_CAUSE", () => {
    // Mid-block on ln-v1: no lead (ambient 0), no crossing/junction/stop line,
    // lane-centered, onset 47 km/h — every cause positively absent, the ~8.4
    // m/s² envelope sustains far beyond the 0.4 s gate.
    const d = record(ln, {
      steps: [
        { kind: "drive", points: [[12.19, 15], [12.19, 200]], targetKmh: 47, maxDecelMps2: 12 },
        { kind: "pause", sec: 1, brake: true },
        { kind: "drive", points: [[12.19, 200], [12.19, 360]], targetKmh: 40 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "HARSH_BRAKING_NO_CAUSE")).toBe(1);
  });

  it("innocent side: the SAME slam WITH a cause (crossing zone just entered) must NOT fire", () => {
    // pe-clear-v1 has a marked crossing at (0, 90); its ~35 m approach zone is
    // entered around y ≈ 55 and crossingZoneEntered lands in the hazard ledger
    // (harshBrakeHazardCooldownSec = 6 s). The slam starts ~1 s later — an
    // emergency-grade stop 12 m before the zebra is a RESPONSE, not a phantom.
    const d = record(pe, {
      steps: [
        { kind: "drive", points: [[4.06, 15], [4.06, 78]], targetKmh: 45, maxDecelMps2: 12 },
        { kind: "pause", sec: 1.5, brake: true },
        { kind: "drive", points: [[4.06, 78], [4.06, 130]], targetKmh: 30 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(violations(d, "HARSH_BRAKING_NO_CAUSE")).toBe(0);
    // Prove the exemption was really exercised (not a vacuous pass): the same
    // drive DOES enter the crossing zone before the slam.
    const zoneTicks: number[] = [];
    recordScriptedDrive(
      pe,
      {
        steps: [
          { kind: "drive", points: [[4.06, 15], [4.06, 78]], targetKmh: 45, maxDecelMps2: 12 },
          { kind: "pause", sec: 1.5, brake: true },
          { kind: "drive", points: [[4.06, 78], [4.06, 130]], targetKmh: 30 },
          { kind: "pause", sec: 1, brake: true },
        ],
      },
      {
        scenarioId: "stall-brake-probe",
        kind: "mistake",
        seed: 7,
        onTick: (tick) => {
          for (const e of tick.events) if (e.kind === "crossingZoneEntered") zoneTicks.push(tick.t);
        },
      },
    );
    expect(zoneTicks.length).toBeGreaterThan(0);
  });
});
