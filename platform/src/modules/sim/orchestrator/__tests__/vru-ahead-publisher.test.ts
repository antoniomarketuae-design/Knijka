/**
 * =============================================================================
 * THE ACQUITTAL THAT HAD NO WRITER — sc-hz-accident-scene:b6795005, 2026-08-24
 * =============================================================================
 *
 * THE FRAME. `.audit-frames/w10-1/frames/sc-hz-accident-scene__mobile-right/
 * 04-t119s.png` (and 04-t124s.png, the same card again): «ⓘ Спиране в забранена
 * зона · Спря в участък, в който…», the cluster at 0 км/ч, and a bystander
 * standing directly in front of the bonnet — on the lesson whose entire subject
 * is that people are standing in the road. The student is convicted for
 * stopping for a human being.
 *
 * THE PART THAT WAS ALREADY DONE, AND THE PART THAT MADE IT WORTHLESS.
 * `rules/engine.ts`'s ban-zone block reads `tick.vruAheadM` and acquits on it,
 * and `rules/__tests__/ban-zone-person-in-lane.test.ts` pins that behaviour in
 * nine directions including the malformed ones. All of it green since
 * 2026-08-23. NOTHING IN THE PRODUCT EVER WROTE THE FIELD. The block says so
 * itself — „WHAT IT STILL NEEDS, AND THIS FILE CANNOT DO IT: a publisher" — so
 * the acquittal was armed, tested, and unreachable from `/simulator`, and the
 * finding reproduced on the next sweep exactly as before.
 *
 * That is this programme's most expensive failure mode: a repair that is
 * measured and gated but that no path from /simulator reaches. A REPAIR IS NOT
 * FINISHED WHEN IT IS MEASURED AND GATED; IT IS FINISHED WHEN A PATH FROM
 * /simulator REACHES IT.
 *
 * BUT IT HAS TWO DIRECTIONS, AND §3 BELOW ONLY COVERS ONE. Say it plainly so a
 * later round does not lean on cover this file does not give:
 *
 *   . READ BUT NEVER WRITTEN — the law consults a channel nobody publishes.
 *     That is `vruAheadM`, and §3 is the general gate for it.
 *   . WRITTEN/EXPORTED BUT NEVER READ — the other shape, and the one the four
 *     named dead symbols actually had. §3 CANNOT SEE ANY OF THEM, and an
 *     earlier draft of this header wrongly claimed it would have:
 *       `districtWorldEdge`   `runtime/district.ts:426`, consumed only by its
 *                             own sibling below it;
 *       `worldEdgeClearanceM` `runtime/district.ts:461` — and it IS written
 *                             onto the tick (`worldRuntime.ts:1977`) and IS
 *                             read, by `LessonPlayShell.tsx:3257`, never by
 *                             `rules/engine.ts`. §3 would have called it
 *                             healthy, because by its own question it is;
 *       `touchHintShouldHide` `lesson-ui/touchHintLifetime.ts:674`;
 *       `whyIsReachable`      `hud/overlayQueue.ts:505`.
 *     None of the four appears in `rules/engine.ts` at all, so none is in §3's
 *     read set. The write→read sweep is still owed and is not written here.
 *
 * So this file has three parts:
 *
 *   1. THE MEASUREMENT — `vruAheadMeters` says what it claims to say.
 *   2. THE THREAD — the value survives `WorldRuntime.sample` onto the tick, and
 *      its absence still leaves the tick byte-identical.
 *   3. THE ADDRESS — a source walk proving the one file the browser runs
 *      (`components/sim/LessonScene.tsx`) calls the publisher and hands the
 *      result to `runtime.sample`; plus the GENERAL form of that question, put
 *      to every channel the law reads.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PEDESTRIAN_BODY_RADIUS_M,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../../collision";
import { createWorldRuntime } from "../../runtime";
import type { StagedActorView } from "../../traffic/types";
import type { VehicleSample } from "../../contracts";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario";
import { vruAheadMeters } from "../contact";
import type { ContactCastMember, StagedTrafficPort } from "../index";

// ---------------------------------------------------------------------------
// Doubles — a cast of discs at fixed poses, and a port that answers for them
// ---------------------------------------------------------------------------

function person(actorId: string): ContactCastMember {
  return { actorId, ownerId: "ev", withWhat: "pedestrian", body: "disc", minClosingKmh: 2, closing: "player" };
}
function car(actorId: string): ContactCastMember {
  return { actorId, ownerId: "ev", withWhat: "vehicle", body: "box", minClosingKmh: 2, closing: "combined" };
}

function portOf(poses: Record<string, { x: number; y: number }>): StagedTrafficPort {
  return {
    stage: () => null,
    stagedCommand: () => undefined,
    staged: (id: string): StagedActorView | null => {
      const p = poses[id];
      if (p === undefined) return null;
      return {
        id,
        kind: "pedestrian",
        x: p.x,
        y: p.y,
        dirX: 0,
        dirY: 1,
        speedMps: 0,
        s: 0,
        pathLengthM: 0,
        nodeS: [],
        done: false,
      } as unknown as StagedActorView;
    },
  };
}

/** Heading 0 = north (+y). The projection is (sin, cos), like `frontalOnly`. */
const NORTH = 0;

// ---------------------------------------------------------------------------
// 1. THE MEASUREMENT
// ---------------------------------------------------------------------------

describe("vruAheadMeters — how far ahead, in my own path, the nearest person is", () => {
  it("a person straight ahead is reported bumper-to-body, not centre-to-centre", () => {
    const d = vruAheadMeters([person("p1")], portOf({ p1: { x: 0, y: 12 } }), 0, 0, NORTH);
    // 12 m between the two centres, less the car's own nose and his own body —
    // the same thing `leadGapM` means one exemption up in the same rule.
    expect(d).toBeCloseTo(12 - PLAYER_HALF_LENGTH_M - PEDESTRIAN_BODY_RADIUS_M, 6);
    expect(d).toBeLessThan(12);
  });

  it("a person BEHIND the car is not why it stopped", () => {
    expect(vruAheadMeters([person("p1")], portOf({ p1: { x: 0, y: -12 } }), 0, 0, NORTH)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("someone on the pavement is not in the path — the corridor is the car's own width", () => {
    // THE HALF THAT KEEPS В27 ALIVE. A channel that acquitted for anyone merely
    // nearby would switch the rule off on every map that has pedestrians on it,
    // which is the mirror of the defect this repair is for: never loosen a
    // check until it excuses everybody. Just inside the band is measured; a
    // hand's breadth outside it is not there at all.
    const band = PLAYER_HALF_WIDTH_M + PEDESTRIAN_BODY_RADIUS_M;
    expect(
      vruAheadMeters([person("p1")], portOf({ p1: { x: band - 0.05, y: 10 } }), 0, 0, NORTH),
    ).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(
      vruAheadMeters([person("p1")], portOf({ p1: { x: band + 0.05, y: 10 } }), 0, 0, NORTH),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("the corridor turns with the car, not with the map", () => {
    // Heading 90° = east (+x). The same body that was straight ahead going
    // north is now abeam, and a body due east is now in front.
    expect(vruAheadMeters([person("p1")], portOf({ p1: { x: 0, y: 12 } }), 0, 0, 90)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(
      vruAheadMeters([person("p1")], portOf({ p1: { x: 12, y: 0 } }), 0, 0, 90),
    ).toBeCloseTo(12 - PLAYER_HALF_LENGTH_M - PEDESTRIAN_BODY_RADIUS_M, 6);
  });

  it("the NEAREST person wins, and a vehicle in the cast is not a person", () => {
    const cast = [person("far"), car("lead"), person("near")];
    const port = portOf({ far: { x: 0, y: 30 }, lead: { x: 0, y: 5 }, near: { x: 0, y: 12 } });
    expect(vruAheadMeters(cast, port, 0, 0, NORTH)).toBeCloseTo(
      12 - PLAYER_HALF_LENGTH_M - PEDESTRIAN_BODY_RADIUS_M,
      6,
    );
    // …and with only the car staged, nobody is reported at all: `leadGapM`
    // already answers for vehicles and this channel must not answer twice.
    expect(vruAheadMeters([car("lead")], port, 0, 0, NORTH)).toBe(Number.POSITIVE_INFINITY);
  });

  it("an empty cast, and a body the port cannot resolve, both mean „I cannot answer\"", () => {
    expect(vruAheadMeters([], portOf({}), 0, 0, NORTH)).toBe(Number.POSITIVE_INFINITY);
    expect(vruAheadMeters([person("gone")], portOf({}), 0, 0, NORTH)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("a body already touching the bumper reports 0, never a negative distance", () => {
    // A negative number would be read by `vruAheadM <= banZoneVruAheadM` as an
    // acquittal too, so the sign is not load-bearing here — but `-Infinity` and
    // `NaN` ARE refused by the reducer's finiteness guard, and a publisher that
    // could emit one would silently switch the acquittal off. This clamp is why
    // it cannot.
    const d = vruAheadMeters([person("p1")], portOf({ p1: { x: 0, y: 0.2 } }), 0, 0, NORTH);
    expect(d).toBe(0);
    expect(Number.isFinite(d)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. THE THREAD — from the measurement onto the tick the law reads
// ---------------------------------------------------------------------------

const REPO_ROOT = path.join(process.cwd(), "..");
const districtJson: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "hz-accident-v1.json"), "utf-8"),
);

function sampleAt(): VehicleSample {
  const spawn = (districtJson as { spawnPoints: Array<{ x: number; y: number; headingDeg?: number }> })
    .spawnPoints[0];
  return {
    position: { x: spawn.x, y: spawn.y },
    headingDeg: spawn.headingDeg ?? 0,
    speedKmh: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: "D",
  } as unknown as VehicleSample;
}

describe("the value survives the runtime onto the tick", () => {
  it("a measured distance is published", () => {
    const runtime = createWorldRuntime(districtJson);
    const tick = runtime.sample(sampleAt(), 1, false, false, Infinity, false, false, 6);
    expect(tick.vruAheadM).toBe(6);
  });

  it("„nobody there\" leaves the tick exactly as it was before the channel existed", () => {
    // The additive discipline every other flag on this tick obeys: absent means
    // the reporter cannot answer, and the reducer convicts on absence. A caller
    // that omits the argument and one that passes Infinity must be
    // indistinguishable downstream.
    const runtime = createWorldRuntime(districtJson);
    const omitted = runtime.sample(sampleAt(), 1, false, false, Infinity, false, false);
    const infinite = runtime.sample(sampleAt(), 1, false, false, Infinity, false, false, Infinity);
    expect("vruAheadM" in omitted).toBe(false);
    expect("vruAheadM" in infinite).toBe(false);
    expect(Object.keys(infinite).sort()).toEqual(Object.keys(omitted).sort());
  });
});

// ---------------------------------------------------------------------------
// 3. THE ADDRESS — is anything the browser runs actually calling this?
// ---------------------------------------------------------------------------

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf-8");

/** Source with block and line comments removed — this file's headers discuss
 *  every symbol it walks for, so a bare `includes` answers wrong. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("the publisher is reachable from the page the student loads", () => {
  const scene = stripComments(read("components/sim/LessonScene.tsx"));

  it("the walk is looking at the real scene file", () => {
    // The self-check first: a path typo or a moved component would make every
    // assertion below vacuous, which is precisely how a dead-code gate reports
    // five live consumers as none.
    expect(scene.length).toBeGreaterThan(50_000);
    expect(scene).toContain("runtime.sample(");
  });

  it("LessonScene imports the publisher through the module's public API", () => {
    // doc 05: a component reaches a module only through its barrel. Importing
    // `../orchestrator/contact` directly would work and would be a boundary
    // violation, so the barrel is what is asserted.
    expect(scene).toContain("vruAheadMeters");
    expect(scene).toContain('from "@/modules/sim/orchestrator"');
  });

  it("…calls it, and hands the RESULT to runtime.sample — the step that was missing", () => {
    // This is the whole assertion. `vruAheadM` was declared, read and tested
    // with no line anywhere doing these two things.
    expect(scene).toContain("vruAheadMeters(");
    const call = scene.slice(scene.indexOf("runtime.sample("));
    const args = call.slice(0, call.indexOf(")"));
    expect(args).toContain("vruAhead");
  });
});

// ---------------------------------------------------------------------------
// …AND THE GENERAL FORM, because one enforced instance is a convention
// ---------------------------------------------------------------------------

/**
 * EVERY CHANNEL THE LAW READS HAS SOMETHING THAT WRITES IT.
 *
 * `vruAheadM` is not the interesting part of this gate; the SHAPE is. A field
 * the rule engine consults, that the one runtime building the tick never sets,
 * is a rule that can never fire in the product — and it looks completely
 * healthy from inside `rules/`, because the reducer's own tests hand it the
 * value by hand. `vruAheadM` shipped that way and stood dead for a day.
 *
 * The walk is deliberately crude and deliberately one-directional: it asks only
 * „does `runtime/worldRuntime.ts` mention this name as something it assigns",
 * which cannot prove the value is CORRECT and is not trying to. It proves the
 * name has a writer, which is the question nobody was asking.
 */
describe("no channel the rule engine reads is written by nothing", () => {
  const engine = stripComments(read("modules/sim/rules/engine.ts"));
  const runtime = stripComments(read("modules/sim/runtime/worldRuntime.ts"));

  const readFields = [...new Set([...engine.matchAll(/tick\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];

  /** Written = assigned onto the tick, or carried as a key/shorthand in the
   *  object literal `sample()` builds. */
  const isWritten = (field: string, source: string): boolean =>
    source.includes(`tick.${field} =`) ||
    new RegExp(`(^|[^A-Za-z0-9_.$])${field}\\s*[,:]`, "m").test(source);

  it("the walk found the channels — an empty read set would pass everything", () => {
    expect(readFields.length).toBeGreaterThan(20);
    expect(readFields).toContain("vruAheadM");
    expect(readFields).toContain("noStopZone");
  });

  it("the predicate has teeth — a name nothing writes is caught", () => {
    expect(isWritten("zzzChannelNobodyWrites", runtime)).toBe(false);
    expect(isWritten("vruAheadM", runtime)).toBe(true);
    // …and it was NOT true before this repair: the only occurrences of the name
    // in that file are the two lines the publisher added.
    expect(isWritten("noStopZone", runtime)).toBe(true);
  });

  it("every field the law consults is set somewhere in the runtime that builds the tick", () => {
    const orphans = readFields.filter((f) => !isWritten(f, runtime));
    expect(orphans, `channels the rule engine reads and nothing publishes: ${orphans.join(", ")}`)
      .toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. …AND THE BLAST RADIUS OF THE ACQUITTAL, WHICH IS THE OTHER DIRECTION
// ---------------------------------------------------------------------------

/**
 * WHO ELSE DID THIS QUIETLY CHANGE?
 *
 * §1–3 prove the acquittal now REACHES the student. They say nothing about how
 * far it reaches, and that is the question this programme's second rule asks:
 * telling a 17-year-old he drove badly when he did not is the worst thing this
 * product can do, and CREDITING A DRIVE THAT WAS WRONG is its mirror. The
 * publisher was verified on hz-accident-v1 and on nothing else, and an
 * adversarial read of it (2026-08-25) named that gap: *"it switches a live
 * acquittal on for every lesson that stages a pedestrian on a district carrying
 * a В27 span, and the lane verified geometry on exactly one of them."*
 *
 * MEASURED RATHER THAN ARGUED, and the answer is much smaller than the fear:
 *
 *   11 districts author a `noStopping` zone …
 *   13 shipped templates are staged on one of them …
 *   4 of those 13 stage a person at all — and a person is the only thing this
 *     publisher can see.
 *
 * So the acquittal is reachable on FOUR lessons, one of which is the lesson it
 * was written for. It is inert on the other nine В27 drills, which is why the
 * parking family's ban-zone bills are untouched.
 *
 * WHY THE THREE NEW ONES ARE SAFE, stated so the next reader can check it and
 * not merely trust it. Conviction already required `s.crossing === null`, so on
 * a district whose crossing zone is armed the student was acquitted before this
 * change ever landed. The marginal case is therefore narrow: a walker who is on
 * the CARRIAGEWAY, inside the ~1.2 m half-corridor the car's own body sweeps,
 * within 20 m ahead, while the crossing is not armed. That is a person standing
 * in your path, and stopping for one is чл. 5, ал. 2 — the acquittal is the
 * correct answer, not a loosened check. At rest the walker is on the FOOTWAY
 * (`PED_REST_PAST_ROAD_M`; `templates-flow.ts` lands her mid-pavement on
 * purpose), which is further from the lane centreline than the corridor reaches.
 *
 * THIS TEST IS A TRIPWIRE, NOT A TRUTH. It cannot prove the geometry of a drive
 * nobody has taken. What it does is make the set VISIBLE: the day a new lesson
 * stages a person on a В27 district, this goes red and somebody has to look at
 * it, instead of a sweep finding it two rounds later.
 */
describe("the В27 acquittal reaches exactly the lessons it was measured for", () => {
  /** Districts authoring a В27 span — read off the committed world documents,
   *  which is what the runtime loads. */
  const banDistricts = new Set(
    readdirSync(path.join(REPO_ROOT, "content", "world"))
      .filter((f) => f.endsWith(".json"))
      .filter((f) => {
        const doc = JSON.parse(
          readFileSync(path.join(REPO_ROOT, "content", "world", f), "utf-8"),
        ) as { zones?: Array<{ kind?: string }> };
        return (doc.zones ?? []).some((z) => z.kind === "noStopping");
      })
      .map((f) => f.replace(/\.json$/, "")),
  );

  /**
   * `pedestrianDartOut` is the ONLY runner that declares a disc body, and
   * `vruAheadMeters` skips everything that is not one — so the runner kind is a
   * faithful stand-in for "this lesson can reach the acquittal". That linkage is
   * asserted rather than assumed below; if a second runner ever declares a disc,
   * this list stops being complete and the assertion says so.
   */
  const stagesAPerson = (s: (typeof SCENARIO_TEMPLATES)[number]): boolean =>
    ((s as unknown as { staged?: ReadonlyArray<{ kind?: string }> }).staged ?? []).some(
      (e) => e.kind === "pedestrianDartOut",
    );

  it("the sweep found the districts and the lessons — an empty reader would pass everything", () => {
    expect(banDistricts.size).toBeGreaterThanOrEqual(11);
    expect(banDistricts).toContain("hz-accident-v1");
    expect(SCENARIO_TEMPLATES.filter((s) => banDistricts.has(s.map.districtId)).length)
      .toBeGreaterThanOrEqual(13);
  });

  it("only `pedestrianDartOut` declares a disc body, so the runner kind is a faithful proxy", () => {
    // If this fails, the exposure list below is under-counting: widen
    // `stagesAPerson` to the new runner in the SAME change.
    const runners = stripComments(read("modules/sim/orchestrator/runners.ts"));
    const discs = [...runners.matchAll(/body:\s*"disc"/g)];
    expect(discs.length, "a second runner now stages a disc body").toBe(1);
    expect(runners).toContain("PedestrianDartOutSpec");
  });

  it("the exposure set is the four measured lessons", () => {
    const exposed = SCENARIO_TEMPLATES.filter(
      (s) => banDistricts.has(s.map.districtId) && stagesAPerson(s),
    )
      .map((s) => s.id)
      .sort();
    expect(
      exposed,
      "a lesson entered or left the В27 acquittal's reach — take a drive on it " +
        "and confirm the student is neither convicted for stopping for a person " +
        "nor credited for a stop that had no human cause, then update this list",
    ).toEqual([
      "sc-crossing-let-pass",
      "sc-crossing-slow-crosser",
      "sc-ed-d2-city-run",
      "sc-hz-accident-scene",
    ]);
  });
});
