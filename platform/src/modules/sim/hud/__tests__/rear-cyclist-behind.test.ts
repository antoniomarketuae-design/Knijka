/**
 * =============================================================================
 * «КОЛА ОТЗАД» OVER A BICYCLE — the rear badge names the body it is about.
 *
 * THE FRAME. `.audit-frames/sweep161/sc-vu-cyclist-hook/mobile-right/
 * 04-t184s.png` (the frame `sc-vu-cyclist-hook:d867ca4c` was filed on) carries
 * the pill «Кола отзад · 12 м», and the same run's log carries «Кола отзад ·
 * 0 м» eleven seconds earlier. There is no car on that map. `vu-cyclist-v1`
 * authors one building, no parking bays and nothing else that moves;
 * `SC_VU_CYCLIST_HOOK` authors no `traffic`, so ambient traffic is zero; and
 * `scene/scenarioSceneryProps` mounts no held scenery for the rung. The ONLY
 * body `rearGapMeters` could ever have returned there is the staged cyclist —
 * `extraRightOffsetM 2.6` against a 4.0 m rear corridor — and the badge called
 * him a car.
 *
 * WHY IT IS NOT A TYPO. `RearProximityCue.tsx` already refuses to feed this
 * channel a wall, in its own words, because „«Кола отзад · 1 м» about a
 * concrete wall is the badge stating something false, which is the failure this
 * whole channel exists to prevent". That care went into the STATIC half only.
 * The MOVING half sweeps `this.vehicles`, and a v1 cyclist IS a narrow
 * curb-riding staged vehicle agent in that array (audit C3) — so the one lesson
 * whose entire subject is the rider beside you sent the student to the mirror
 * looking for a car.
 *
 * WHAT THIS FILE PINS, in both directions:
 *   1. THE PRECONDITIONS ARE THE PRODUCT'S, not this file's — the rung really
 *      does author zero ambient traffic and the map really has no bays, so the
 *      mislabel was TOTAL on that lesson rather than occasional. A probe that
 *      asserted the label without this would be asserting a hypothetical.
 *   2. The shipped stack, staged the way `CyclistRightHookRunner` stages it,
 *      reports kind "cyclist" and the rider's own sentence.
 *   3. ONE SWEEP: `rearGapMeters` and `rearBodyBehind().gapM` are the same
 *      number, so the metres on the glass and the noun beside them cannot come
 *      from two passes. Mutating `rearGapMeters` back to its own sweep is not
 *      caught by a number — it is caught by deleting the delegation.
 *   4. THE NEGATIVE CONTROL: a staged CAR in the same place still reads «Кола
 *      отзад». A repair that renamed everything would pass every assertion in
 *      2 and is refused here.
 *   5. Nothing behind is still no badge — the honesty contract this channel
 *      opens on, unmoved by the new field.
 *   6. The GLYPH follows the noun. A bicycle under a car icon is the same false
 *      claim in the channel a driver reads faster than text.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RearProximityBadge } from "../RearProximityCue";
import { rearCueLabelBg, stepRearCue, type RearCue } from "../rearProximity";
import { createTrafficSystem } from "../../traffic/system";
import type { StagedVehicleSpec, TrafficDistrict } from "../../traffic/types";
import { SC_VU_CYCLIST_HOOK } from "../../lessons/scenario/templates-vru";

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function district(id: string): TrafficDistrict {
  const file = path.join(repoRoot(), "content", "world", `${id}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as TrafficDistrict;
}

/**
 * The lesson's own staged rider spec, NARROWED off the shipped template rather
 * than retyped here — if the rung ever stops staging a `cyclistRightHook` this
 * file goes red instead of asserting against a fixture of its own invention.
 */
const RIDER = (() => {
  const staged = (SC_VU_CYCLIST_HOOK.staged ?? []).find((s) => s.kind === "cyclistRightHook");
  if (staged === undefined) throw new Error("sc-vu-cyclist-hook stages no cyclistRightHook");
  return staged;
})();

/**
 * Stage the actor exactly as `orchestrator/runners.ts CyclistRightHookRunner`
 * does — same fields, same `profile: actor.profile ?? "cyclist"` default. If
 * that call ever stops passing `extraRightOffsetM`, the A11 tag disappears and
 * this file goes red rather than quietly passing on a car.
 */
function stagedRider(): StagedVehicleSpec {
  const actor = RIDER.actor;
  return {
    kind: "vehicle",
    id: "sc-vu-cyclist",
    pathNodes: actor.pathNodes,
    hold: actor.hold,
    cruiseSpeedMps: actor.cruiseSpeedMps,
    extraRightOffsetM: actor.extraRightOffsetM,
    colorIndex: actor.colorIndex,
    profile: actor.profile ?? "cyclist",
  };
}

/** The lesson's world with nothing in it but the rider — the rung's own state. */
function worldWithRider() {
  const traffic = createTrafficSystem(district("vu-cyclist-v1"), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const view = traffic.stage(stagedRider());
  expect(view, "the eastbound path must resolve for the staged rider").not.toBeNull();
  return { traffic, view: view! };
}

/**
 * Eastbound lane centre of the through road; heading 90° = east (0 = north).
 *
 * −4.0625 and not the template's rounded −4.06: the lane graph puts it at half
 * the 8.125 m drawn lane pitch, and the staged rider lands at exactly
 * −4.0625 − 2.6. Rounding here would make the corridor arithmetic below approximate.
 */
const LANE_Y = -4.0625;
const EAST = 90;

const badgeMarkup = (cue: RearCue): string =>
  renderToStaticMarkup(RearProximityBadge({ cue }) as never);

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE PRECONDITIONS — the mislabel was total on this rung, not occasional
// ───────────────────────────────────────────────────────────────────────────

describe("on sc-vu-cyclist-hook the badge can ONLY ever be about the rider", () => {
  it("the rung authors no ambient traffic and the map authors no parking bays", () => {
    // Both halves of „the only body in the world is the cyclist". If either
    // ever stops holding, the frame's «Кола отзад · 12 м» acquires an innocent
    // explanation and this file must be re-derived rather than trusted.
    expect(SC_VU_CYCLIST_HOOK.traffic, "ambient traffic override").toBeUndefined();
    const raw = district("vu-cyclist-v1") as unknown as {
      meta?: { scenario?: { bays?: unknown[] } };
    };
    expect(raw.meta?.scenario?.bays ?? []).toHaveLength(0);
  });

  it("the staged rider is the whole population, and the product already knows he is a rider", () => {
    const { traffic } = worldWithRider();
    expect(traffic.vehicles).toHaveLength(1);
    // The A11 marker the rapier shell is tagged with and «Удар във
    // велосипедист» is billed from. The kind was never missing — only the
    // badge's access to it was.
    expect(traffic.vehicleCollisionKind(traffic.vehicles[0].id)).toBe("cyclist");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · THE READ, AND THE SENTENCE IT PRODUCES
// ───────────────────────────────────────────────────────────────────────────

describe("a rider behind is reported as a rider", () => {
  it("rearBodyBehind names the cyclist, and rearGapMeters is the SAME number", () => {
    const { traffic, view } = worldWithRider();
    // The rider holds 30 m short of the junction, curb-side of the eastbound
    // lane: 2.6 m right of the centreline, i.e. inside the 4.0 m corridor.
    expect(view.x).toBeCloseTo(-30, 4);
    expect(view.y).toBeCloseTo(LANE_Y - 2.6, 4);

    // The student 12 m up the lane, having just passed him — the geometry of
    // the photographed frame.
    const px = -18;
    const behind = traffic.rearBodyBehind(px, LANE_Y, EAST);
    expect(behind, "the rider is behind and in the corridor").not.toBeNull();
    expect(behind!.kind).toBe("cyclist");
    // THE TWO SURFACES AGREE, EXACTLY — `toBe`, not `toBeCloseTo`. This is the
    // weakest assertion in the file and it is written down as such: today
    // `rearGapMeters` DELEGATES here, so a second sweep restored by a later
    // hand would still agree at this pose and slip past. What it does catch is
    // the thing that actually happened to this channel twice (`bodies.ts`
    // records both): the two answers drifting apart — a corridor widened on one
    // side, a subtrahend changed on one side — which is how a student ends up
    // reading a distance about one body under a noun about another.
    expect(traffic.rearGapMeters(px, LANE_Y, EAST)).toBe(behind!.gapM);
    // …and it is a real, badge-raising distance rather than a clamped 0:
    // 12 m of centres less `bumperSubtrahendM`, which floors at the 4.1 m
    // fleet car length even for a 1.8 m bicycle. 7.9 m is inside
    // REAR_CUE_WARN_M, so this pose raises an AMBER badge — the student is
    // being told something, and until now he was told the wrong noun.
    expect(behind!.gapM).toBeCloseTo(7.9, 4);
  });

  it("the badge says «Велосипедист отзад», not «Кола отзад»", () => {
    const { traffic } = worldWithRider();
    const behind = traffic.rearBodyBehind(-18, LANE_Y, EAST)!;
    const cue = stepRearCue(null, behind.gapM, 18, behind.kind);
    expect(cue).not.toBeNull();
    expect(cue!.kind).toBe("cyclist");
    expect(rearCueLabelBg(cue!)).toBe(`Велосипедист отзад · ${cue!.meters} м`);
    // The screen-reader name and the printed text are the same string, which is
    // the rule the badge's own test file already holds it to.
    const markup = badgeMarkup(cue!);
    expect(markup).toContain(rearCueLabelBg(cue!));
    expect(markup).toMatch(/aria-label="Велосипедист отзад · \d+ м"/);
    // MUTATION: revert `rearCueLabelBg` to the single pooled sentence and both
    // of the above fail on the exact string the frame photographed.
    expect(markup).not.toContain("Кола отзад");
  });

  it("the GLYPH follows the noun — a bicycle, not a car", () => {
    const rider: RearCue = { level: "warn", meters: 6, kind: "cyclist" };
    const car: RearCue = { level: "warn", meters: 6, kind: "vehicle" };
    // The car glyph is a body rect; the rider glyph is two 3.2 r wheels. Each
    // marker is asserted present on its own kind AND absent on the other, so a
    // renderer that drew both would fail rather than pass twice.
    expect(badgeMarkup(rider)).toContain('r="3.2"');
    expect(badgeMarkup(rider)).not.toContain('x="3.5"');
    expect(badgeMarkup(car)).toContain('x="3.5"');
    expect(badgeMarkup(car)).not.toContain('r="3.2"');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE TWO DIRECTIONS A RENAME WOULD BREAK
// ───────────────────────────────────────────────────────────────────────────

describe("nothing else moved", () => {
  it("a staged CAR in the rider's place still reads «Кола отзад»", () => {
    // Same path, same hold, same speed — only the curb offset and the profile
    // differ, which is exactly the A11 marker. A repair that renamed the badge
    // outright would pass every assertion above and fail this one.
    const traffic = createTrafficSystem(district("vu-cyclist-v1"), {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const view = traffic.stage({
      kind: "vehicle",
      id: "plain-car",
      pathNodes: ["vu-n-w", "vu-n-c", "vu-n-e"],
      hold: { nodeIndex: 1, offsetM: -30 },
      cruiseSpeedMps: 3,
    });
    expect(view).not.toBeNull();
    expect(traffic.vehicleCollisionKind(traffic.vehicles[0].id)).toBe("vehicle");
    const behind = traffic.rearBodyBehind(-18, LANE_Y, EAST);
    expect(behind).not.toBeNull();
    expect(behind!.kind).toBe("vehicle");
    const cue = stepRearCue(null, behind!.gapM, 18, behind!.kind)!;
    expect(rearCueLabelBg(cue)).toBe(`Кола отзад · ${cue.meters} м`);
  });

  it("nothing behind is still no badge, and no kind can conjure one", () => {
    const { traffic } = worldWithRider();
    // Standing 100 m west of the rider: he is AHEAD, not behind.
    expect(traffic.rearBodyBehind(-130, LANE_Y, EAST)).toBeNull();
    expect(traffic.rearGapMeters(-130, LANE_Y, EAST)).toBe(Infinity);
    expect(stepRearCue(null, Infinity, 30, "cyclist")).toBeNull();
    // …and it drops a LIVE badge, from the cyclist state too.
    expect(
      stepRearCue({ level: "danger", meters: 2, kind: "cyclist" }, Infinity, 30, "cyclist"),
    ).toBeNull();
  });

  it("a rider who replaces a car at the same distance gets a NEW snapshot", () => {
    // The identity bail-out exists for allocation, not for truth: `prev` is
    // returned only when nothing VISIBLE changed, and the noun is visible.
    const asCar = stepRearCue(null, 6, 20, "vehicle")!;
    const asRider = stepRearCue(asCar, 6, 20, "cyclist");
    expect(asRider).not.toBe(asCar);
    expect(asRider!.kind).toBe("cyclist");
    // …and a genuinely unchanged poll still bails out.
    expect(stepRearCue(asCar, 6, 20, "vehicle")).toBe(asCar);
  });
});
