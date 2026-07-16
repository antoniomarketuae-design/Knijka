/**
 * Capability-phase unit gate — the recorder's cockpit-state channels
 * (headlights / seatbelt / handbrake DriveStep kinds). Proves each channel
 * reaches the rule engine and grades its shipped code, and that the DEFAULTS
 * are the recorder's former hardcodes (a script that never touches them stays
 * clean). This is the AC/VP family unlock; templates ride these channels.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScriptedDrive, type DriveScript } from "../recorder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const ln = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));

/** A long steady cruise in the right lane (x = 12.19, y 15 → 360 at 40 km/h). */
function cruise(extra: DriveScript["steps"]): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пробно каране." },
      ...extra,
      { kind: "drive", points: [[12.19, 15], [12.19, 120], [12.19, 240], [12.19, 360]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

function record(script: DriveScript, isNight = false, rain = false, fog = false) {
  return recordScriptedDrive(ln, script, { scenarioId: "cockpit-probe", kind: "mistake", seed: 7, isNight, rain, fog });
}

function codes(d: ReturnType<typeof record>): string[] {
  return [...new Set(d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))];
}

describe("recorder cockpit-state channels", () => {
  it("DEFAULT: no cockpit-state step → belt on, handbrake off, day lights off — no cockpit fault", () => {
    const c = codes(record(cruise([])));
    expect(c).not.toContain("SEATBELT_OFF_WHILE_MOVING");
    expect(c).not.toContain("HANDBRAKE_LEFT_ON");
    expect(c).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(c).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("seatbelt off while moving → SEATBELT_OFF_WHILE_MOVING", () => {
    expect(codes(record(cruise([{ kind: "seatbelt", on: false }])))).toContain("SEATBELT_OFF_WHILE_MOVING");
  });

  it("handbrake left on while moving → HANDBRAKE_LEFT_ON", () => {
    expect(codes(record(cruise([{ kind: "handbrake", on: true }])))).toContain("HANDBRAKE_LEFT_ON");
  });

  it("lights off at night → HEADLIGHTS_OFF_AT_NIGHT (default night lights are on → clean)", () => {
    expect(codes(record(cruise([{ kind: "headlights", setting: "off" }]), true))).toContain("HEADLIGHTS_OFF_AT_NIGHT");
    // The DEFAULT at night keeps the former hardcode (low beams on) → no fault.
    expect(codes(record(cruise([]), true))).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("lights off in rain → HEADLIGHTS_OFF_IN_RAIN", () => {
    expect(codes(record(cruise([{ kind: "headlights", setting: "off" }]), false, true))).toContain(
      "HEADLIGHTS_OFF_IN_RAIN",
    );
  });

  it("fogLights channel: default OFF in fog → FOG_LIGHTS_OFF_IN_FOG; {on:true} → clean", () => {
    // The 25 km/h cruise sits under the fog conditions envelope (0.6 × 50 =
    // 30) so the ONLY gradable channel is the fog lamps. Default (no step) is
    // the former hardcode — off — which in fog grades the fog-lamp duty…
    const slow = (extra: DriveScript["steps"]): DriveScript => ({
      steps: [
        ...extra,
        { kind: "drive", points: [[12.19, 15], [12.19, 240]], targetKmh: 25 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    expect(codes(record(slow([]), false, false, true))).toContain("FOG_LIGHTS_OFF_IN_FOG");
    // …and switching the channel on drives clean.
    const lit = codes(record(slow([{ kind: "fogLights", on: true }]), false, false, true));
    expect(lit).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    expect(lit).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("fogLights step without fog stays inert (no fog code on a clear road)", () => {
    expect(codes(record(cruise([{ kind: "fogLights", on: false }])))).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    expect(codes(record(cruise([{ kind: "fogLights", on: true }])))).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });
});
