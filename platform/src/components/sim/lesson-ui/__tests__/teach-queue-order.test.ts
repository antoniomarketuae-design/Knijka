/**
 * THE ORDER OF A FRAME'S TEACH CARDS REACHES THE GLASS — round-6 verifier V15,
 * carried by the round-7 verifier (C2): «the shell queues a frame's cards in
 * REVERSE» survived every test that imports the shell (191 files, 4,252 tests).
 *
 * The lesson engine hands the shell ONE frame's cards already in the order the
 * student must see them: a lower-class teach card (an uncharged второстепенна
 * card — the task cap is one) YIELDS its place to a charged card landing on the
 * same frame (`lessons/engine.ts orderTeachMoments`, round 6 of the task-cap
 * ruling). The shell shows `teachQueue[0]`, so the yield only exists at the
 * glass if the shell APPENDS the frame's cards in that order. The append lives
 * inside `handleTick`, a React callback no node test can call, so this file
 * reads the updater the callback hands `setTeachQueue` out of the shell's own
 * source and RUNS it — the frame's order is then measured, not grepped.
 *
 * A matcher that cannot read what it was built to read fails (the lane's rule:
 * a source reader returns «unresolved» and fails on it, never green-and-blind):
 * no `handleTick`, no `setTeachQueue` call in it, more than one, or an updater
 * that is not a one-argument arrow function over `teachMoments` all fail here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TeachMoment } from "@/modules/sim/lessons";

const SHELL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../LessonPlayShell.tsx");

/** The text of the balanced (…) argument list starting at `open` (the index of "("). */
function balancedArgs(src: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/** Every `setTeachQueue(…)` argument inside the shell's `handleTick` callback — or the reason it could not be read. */
function handleTickTeachUpdaters(): { updaters: string[] } | { unresolved: string } {
  const src = readFileSync(SHELL, "utf-8");
  const start = src.indexOf("const handleTick = useCallback(");
  if (start < 0) return { unresolved: "no `const handleTick = useCallback(` in the shell" };
  const body = balancedArgs(src, src.indexOf("(", start + "const handleTick = useCallback".length));
  if (body === null) return { unresolved: "handleTick's useCallback(…) is not balanced" };
  const updaters: string[] = [];
  let at = 0;
  for (;;) {
    const i = body.indexOf("setTeachQueue(", at);
    if (i < 0) break;
    const arg = balancedArgs(body, i + "setTeachQueue".length);
    if (arg === null) return { unresolved: "a setTeachQueue(… call in handleTick is not balanced" };
    updaters.push(arg.trim());
    at = i + 1;
  }
  return { updaters };
}

const card = (code: string, t: number, severity: TeachMoment["severity"], charged: boolean): TeachMoment =>
  ({ code, t, severity, charged, titleBg: code, explanationBg: code }) as unknown as TeachMoment;

describe("a frame's teach cards reach the queue in the order the lesson engine yields them (V15)", () => {
  it("handleTick hands setTeachQueue exactly one updater, and it is readable", () => {
    const r = handleTickTeachUpdaters();
    expect("unresolved" in r ? r.unresolved : null).toBeNull();
    if ("unresolved" in r) return;
    expect(r.updaters).toHaveLength(1);
  });
  it("RUN, the shell's updater appends the frame's cards after the queued ones, in the frame's order: the charged card the lower one yielded to is shown first", () => {
    const r = handleTickTeachUpdaters();
    if ("unresolved" in r) throw new Error(r.unresolved);
    const text = r.updaters[0];
    // A one-argument arrow over `teachMoments`, the frame's cards — anything else is unreadable here.
    expect(text).toMatch(/^\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>/u);
    const make = new Function("teachMoments", `"use strict"; return (${text});`) as (m: TeachMoment[]) => (q: TeachMoment[]) => TeachMoment[];
    // The frame the round-6 yield exists for, as `applyTick` hands it over AFTER
    // `orderTeachMoments`: a charged опасна crossing card, then the TASK arrival (an
    // uncharged второстепенна card) that yielded its place to it on the same frame
    // (`lessons/__tests__/task-cap-round6.test.ts` drives that frame end to end).
    const lower = card("TASK_SPEED_CAP_EXCEEDED", 12.3, "vtorostepenna", false);
    const charged = card("PEDESTRIAN_CROSSING_TOO_FAST", 12.3, "opasna", true);
    const frame = [charged, lower];
    // An empty queue: the head the shell shows (`teachQueue[0]`) is the charged card.
    const fresh = make(frame)([]);
    expect(fresh.map((m) => m.code)).toEqual(["PEDESTRIAN_CROSSING_TOO_FAST", "TASK_SPEED_CAP_EXCEEDED"]);
    // A queue already holding a card: the frame's cards follow it, in the frame's order.
    const earlier = card("HEADLIGHTS_OFF_IN_RAIN", 11.9, "vtorostepenna", false);
    const merged = make(frame)([earlier]);
    expect(merged.map((m) => m.code)).toEqual(["HEADLIGHTS_OFF_IN_RAIN", "PEDESTRIAN_CROSSING_TOO_FAST", "TASK_SPEED_CAP_EXCEEDED"]);
    // Three cards on one frame keep their exact order (no reversal, no sort).
    const three = [card("A", 1, "opasna", true), card("B", 1, "osnovna", true), card("C", 1, "vtorostepenna", false)];
    expect(make(three)([]).map((m) => m.code)).toEqual(["A", "B", "C"]);
  });
});
