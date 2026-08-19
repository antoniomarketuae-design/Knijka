/**
 * THE CONTACT QUEUE CARRIES THE BODY'S NAME.
 *
 * The rule engine has keyed its contact episode on the BODY since 2026-08-18,
 * which is what lets a student who hits two cars be told he hit two. That fix
 * landed INERT on the channel a student actually drives: the live rapier
 * handler reached `pushCollision(withWhat)` — no id parameter existed at all —
 * so every browser contact arrived anonymous and the per-body key fell back to
 * a per-KIND latch. Two different bodies struck inside `collisionSeparationSec`
 * billed one accident.
 *
 * MEASURED on the shipped reducer before this wire existed (fixture ticks at
 * 45.9 км/ч, «Пътнотранспортно произшествие» rows counted off the debrief):
 *
 *   two ANONYMOUS vehicle reports 1.0 s apart …………………… 1 bill
 *   the same two, NAMED wreck-a / wreck-b ………………………………… 2 bills
 *   thirteen NAMED reports on ONE body across 6 s ……………… 1 bill
 *   a clean drive ………………………………………………………………………………… 0
 *
 * These tests guard the wire itself: the id survives the queue, an UNNAMED
 * report still emits the exact pre-id event shape, and the two do not leak into
 * each other. The end-to-end („two bodies bill twice on a real drive") lives
 * next to the resolver that names them, in
 * `components/sim/__tests__/liveContactNaming.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";

const POSE = { x: 620.96, y: -215.89, headingDeg: 71.2 };

describe("pushCollision carries the body id", () => {
  const district = loadDistrict();

  it("stamps the name onto the tick event, in push order", () => {
    const rt = createWorldRuntime(district);
    rt.pushCollision("vehicle", "wreck-a");
    rt.pushCollision("pedestrian", "sc-mfp-walker");
    rt.update(0.016);
    const tick = rt.sample(mkVehicle(POSE), 0.016, false);
    expect(tick.events.slice(0, 2)).toEqual([
      { kind: "collision", withWhat: "vehicle", actorId: "wreck-a" },
      { kind: "collision", withWhat: "pedestrian", actorId: "sc-mfp-walker" },
    ]);
  });

  it("an UNNAMED report emits the pre-id shape — no `actorId` key at all", () => {
    // The key is OMITTED rather than set to undefined. `toEqual` ignores an
    // undefined-valued key but the rule engine does not read it that way and
    // neither do the recorder's own comparisons: an anonymous report must be
    // byte-identical to what shipped, because that is the per-category
    // behaviour the wall-scrape and guardrail pins ride on.
    const rt = createWorldRuntime(district);
    rt.pushCollision("staticObject");
    rt.update(0.016);
    const tick = rt.sample(mkVehicle(POSE), 0.016, false);
    expect(Object.keys(tick.events[0])).toEqual(["kind", "withWhat"]);
  });

  it("names and anonymous reports do not leak into each other in one drain", () => {
    const rt = createWorldRuntime(district);
    rt.pushCollision("vehicle", "wreck-a");
    rt.pushCollision("vehicle");
    rt.pushCollision("vehicle", "wreck-b");
    rt.update(0.016);
    const tick = rt.sample(mkVehicle(POSE), 0.016, false);
    expect(tick.events.slice(0, 3)).toEqual([
      { kind: "collision", withWhat: "vehicle", actorId: "wreck-a" },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "collision", withWhat: "vehicle", actorId: "wreck-b" },
    ]);
    // …and the queue is a queue: nothing survives into the next tick.
    rt.update(0.016);
    expect(rt.sample(mkVehicle(POSE), 0.032, false).events).toHaveLength(0);
  });
});
