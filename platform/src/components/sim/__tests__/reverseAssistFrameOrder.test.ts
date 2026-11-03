/**
 * R5 (integrator ruling 2026-10-19, sc-turn-left-oncoming:d0017a65) — THE
 * AUTO-REVERSE ASSIST DECIDES BEFORE THE FRAME'S PHYSICS READS THE PEDALS.
 *
 * The founder's 2026-08-11 ruling: ↓ at a standstill after a real lift takes R
 * AND moves the car on that same press. The assist used to be stepped in
 * RuntimeDriver's frame callback, which runs AFTER rapier's stepper — so the
 * shift reached the physics one frame late, and a press that ended before the
 * next frame's reads left the car standing in R (round-1 verifier, F1). It now
 * runs in ReverseAssistDriver, whose useFrame is registered BELOW rapier's
 * stepper priority. What cannot be executed here (R3F's loop needs a canvas)
 * is read off the sources it rests on, the scene's and the two libraries':
 *
 *  · LessonScene: the ONE call of `reverseAssistFrameStart` is in a useFrame
 *    closed by `REVERSE_ASSIST_FRAME_PRIORITY`, which is negative; it returns
 *    on `paused` first and is fed `sessionClockAdvance(delta)`; nothing in
 *    RuntimeDriver steps the assist; the driver is mounted once, paused by the
 *    SAME prop as the physics;
 *  · @react-three/fiber: `useFrame`'s default priority is 0, subscribers are
 *    sorted by priority ascending and run in that order, and only a POSITIVE
 *    priority takes rendering over;
 *  · @react-three/rapier: the stepper subscribes at `updatePriority`, which
 *    <Physics> in the scene does not set (so 0).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REVERSE_ASSIST_FRAME_PRIORITY } from "../LessonScene";

const SIM = path.resolve(__dirname, "..");
const SCENE = readFileSync(path.join(SIM, "LessonScene.tsx"), "utf8").replace(/\r\n/g, "\n");
const NM = path.resolve(__dirname, "../../../../node_modules/@react-three");

function body(fromMarker: string): string {
  const at = SCENE.indexOf(fromMarker);
  expect(at, `UNREADABLE: ${fromMarker}`).toBeGreaterThan(0);
  return SCENE.slice(at, SCENE.indexOf("\n}\n", at) + 3);
}

describe("R5 — the assist's turn is the first of every frame", () => {
  it("the priority is below rapier's stepper (0) and does not take rendering over (> 0 would)", () => {
    expect(REVERSE_ASSIST_FRAME_PRIORITY).toBeLessThan(0);
    expect(SCENE).toContain("export const REVERSE_ASSIST_FRAME_PRIORITY = -1;");
  });

  it("the ONE call of reverseAssistFrameStart is ReverseAssistDriver's useFrame at that priority, after the pause guard, on the frame's clamped delta", () => {
    const calls = SCENE.split("reverseAssistFrameStart({").length - 1;
    expect(calls).toBe(1);
    const driver = body("function ReverseAssistDriver(");
    expect(driver.split("useFrame(").length - 1).toBe(1);
    const frame = driver.slice(driver.indexOf("useFrame((_, delta) => {"));
    expect(frame).toMatch(/^useFrame\(\(_, delta\) => \{\s*if \(paused\) return;\s*reverseAssistFrameStart\(\{[\s\S]*?dtSec: sessionClockAdvance\(delta\),[\s\S]*?\}\);\s*\}, REVERSE_ASSIST_FRAME_PRIORITY\);/);
    // …and nothing else in the scene's components steps the machine.
    const others = SCENE.split("assist.update({").length - 1;
    expect(others).toBe(1); // the one inside reverseAssistFrameStart
    expect(body("export function reverseAssistFrameStart(")).toContain("const cmd = s.assist.update({");
  });

  it("RuntimeDriver — the callback that runs AFTER rapier's stepper — does not step, read or hold the assist", () => {
    // (code only: its comments point at where the assist went)
    const runtime = body("function RuntimeDriver({")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(runtime).not.toMatch(/\breverseAssist\b/);
    expect(runtime).not.toMatch(/\bassistShiftingRef\b/);
    expect(runtime).not.toContain("reverseAssistFrameStart");
  });

  it("the driver is mounted once, paused by the same prop as the physics", () => {
    expect(SCENE.split("<ReverseAssistDriver").length - 1).toBe(1);
    const at = SCENE.indexOf("<ReverseAssistDriver");
    const tag = SCENE.slice(at, SCENE.indexOf("/>", at));
    expect(tag).toContain("paused={physicsPaused}");
    expect(tag).toContain("reverseAssistEnabled={reverseAssistEnabled}");
    expect(tag).toContain("assistShiftingRef={assistShiftingRef}");
    const physics = SCENE.slice(SCENE.indexOf("<Physics"), SCENE.indexOf(">", SCENE.indexOf("<Physics")));
    expect(physics).toContain("paused={physicsPaused}");
    expect(physics).not.toContain("updatePriority");
  });

  it("@react-three/fiber: default priority 0, sorted ascending, run in order, only a positive priority takes rendering over", () => {
    const dist = path.join(NM, "fiber", "dist");
    const events = readdirSync(dist).filter((f) => /^events-[0-9a-f]+\.esm\.js$/.test(f));
    expect(events).toHaveLength(1);
    const fiber = readFileSync(path.join(dist, events[0]!), "utf8").replace(/\r/g, "");
    expect(fiber).toMatch(/function useFrame\(callback, renderPriority = 0\) \{/);
    expect(fiber).toContain("internal.priority = internal.priority + (priority > 0 ? 1 : 0);");
    expect(fiber).toContain("internal.subscribers = internal.subscribers.sort((a, b) => a.priority - b.priority);");
    expect(fiber).toMatch(/subscribers = state\.internal\.subscribers;\s*for \(let i = 0; i < subscribers\.length; i\+\+\) \{\s*subscription = subscribers\[i\];\s*subscription\.ref\.current\(subscription\.store\.getState\(\), delta, frame\);/);
  });

  it("@react-three/rapier: the stepper subscribes at <Physics updatePriority>", () => {
    const rapier = readFileSync(path.join(NM, "rapier", "dist", "react-three-rapier.esm.js"), "utf8").replace(/\r/g, "");
    expect(rapier).toMatch(/useFrame\(\(_, dt\) => \{\s*onStep\(dt\);\s*\}, updatePriority\);/);
  });
});
