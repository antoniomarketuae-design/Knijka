/**
 * LANE 15 — PARKING & MANEUVER DEPTH (doc 86 D11 + L13, and the founder's own
 * three parking complaints).
 *
 * He played the four bay drills and wrote three things:
 *   1. „the lesson states that users will receive two parking tasks, but only
 *      one task is actually presented … major discomfort trust issues";
 *   2. „L2 L3 L4 L5 They have Nothing More" — of the 16 parking-family
 *      templates on the tree before this lane, 10 shipped NO L5 rung at all;
 *   3. „at least ten different parking situations to properly teach students
 *      various real-world parking techniques".
 *
 * This file is the proof for all three, measured rather than asserted in prose.
 *
 * WHY EACH ASSERTION IS SHAPED THE WAY IT IS
 *
 * TASK TRUTH (§1). A „task" in the HUD is a compiled objective — LessonPlayShell
 * renders „Задача n/N" straight off `objectives.length`. Before this lane every
 * bay drill's first objective was a waypoint the student satisfied by driving
 * past it at up to 15 km/h, 4 m off the aisle centre, on the way to the only
 * act the drill graded: the counter said two, the drive delivered one, and he
 * was right. The assertion below is therefore not „there are two objectives" —
 * that was already true and it was the lie. It is that objective 1 of every bay
 * manoeuvre carries a contract a passer-by cannot satisfy: either a HALT (the
 * reverse drills, whose own instruction 2 says „спри") or a LATERAL position
 * the right-hand lane is outside of (the forward drills, whose swing has to be
 * bought from the middle of the aisle).
 *
 * STATED, NEVER HIDDEN (§2). Doc 86 D4/T8: a speed cap the student cannot read
 * is a trap, not a task. Every capped first objective's number is spelled out
 * in the template's own Bulgarian, so the assertion greps the instructions.
 *
 * RUNG DEPTH (§3). Lane 12 landed the seam; this lane pours content into it for
 * this family. S4-distinctness itself is lane 12's test — what is asserted here
 * is the thing S4 cannot see: that the family's rungs are made of CONTENT
 * (a condition, physics, traffic, a tighter rubric), not of the aid table.
 *
 * SITUATION COUNT (§4). „Ten different parking situations" is only meaningful
 * if the ten teach different things, so the census counts DISTINCT graded acts,
 * not template ids.
 *
 * NIGHT/RAIN/FOG HONESTY (§5). Doc 86 L10: 34 of 154 scenarios compiled a
 * night/rain/fog rung while never telling the student to switch the lamps on,
 * and then billed an основна fault for it. Ten of the rungs this lane authors
 * are exactly that kind of rung, so the check rides along with them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRAFFIC_CONFIG } from "../../../traffic/types";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import {
  SC_PARK_PARALLEL_EXIT,
  SC_PARK_PERP_FORWARD,
} from "../templates-parking";
import type { ScenarioSpec } from "../types";
import { recordScParkParallelExitDrive } from "../../../traces/scParkParallelExit";
import { recordScParkPerpForwardDrive } from "../../../traces/scParkPerpForward";
import { recordScParkDepthDrive, type ParkDepthDrillId } from "../../../traces/scParkDepth";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const PARKING = SCENARIO_TEMPLATES.filter((s) => s.family === "parking");
const byId = (id: string): ScenarioSpec => {
  const s = PARKING.find((p) => p.id === id);
  if (!s) throw new Error(`no parking template ${id}`);
  return s;
};

/**
 * THE DRILLS THAT TEACH A PARKING MANOEUVRE — a lesson whose graded act is
 * placing the car into, or extracting it from, a space.
 *
 * THIS LIST USED TO BE WRONG, AND IT WAS THE WRONG ANSWER TO THE FOUNDER.
 * It counted ten by including sc-maneuver-3point and sc-maneuver-uturn, which
 * are TURNS: nothing in either puts a car in a space. He asked for ten that
 * teach parking, the previous wave answered NOT-A-DEFECT on a count of ten,
 * and four of those ten were not parking. The turns are still fine lessons and
 * still carry the „parking" family chip (they are low-speed manoeuvres) — they
 * are simply not what he asked to be counted, so they are counted separately
 * below and never inside this list again.
 */
const MANEUVER_DRILLS = [
  // The eight that existed before the parking-depth wave.
  "sc-park-perp-rev",
  "sc-park-parallel",
  "sc-park-45",
  "sc-park-narrow",
  "sc-park-perp-forward",
  "sc-park-parallel-exit",
  "sc-park-bay-exit-rev",
  "sc-pk-driveway",
  // The ten the parking-depth wave added, each on its own committed district.
  "sc-park-gap-short",
  "sc-park-gap-long",
  "sc-park-van",
  "sc-park-45-rev",
  "sc-park-left",
  "sc-park-zebra",
  "sc-park-wall",
  "sc-park-night",
  "sc-park-double",
  "sc-park-judge",
] as const;

/** Low-speed manoeuvre drills that are NOT parking: they turn the car around. */
const TURN_DRILLS = ["sc-maneuver-3point", "sc-maneuver-uturn"] as const;

/** The ten the founder asked for, by name — the wave's own contract. */
const PARKING_DEPTH_DRILLS = [
  "sc-park-gap-short",
  "sc-park-gap-long",
  "sc-park-van",
  "sc-park-45-rev",
  "sc-park-left",
  "sc-park-zebra",
  "sc-park-wall",
  "sc-park-night",
  "sc-park-double",
  "sc-park-judge",
] as const;

const LANE15_MANEUVER_DRILLS = MANEUVER_DRILLS;

// ---------------------------------------------------------------------------
// §1 — the two tasks are two tasks (doc 86 D11)
// ---------------------------------------------------------------------------

describe("D11 — „it states 2 tasks and delivers 1“", () => {
  it("every manoeuvre drill's FIRST task is an act, not a drive-by", () => {
    const offenders: string[] = [];
    for (const id of LANE15_MANEUVER_DRILLS) {
      const spec = byId(id);
      const first = spec.success[0].params;
      if (first.kind !== "reachZone") {
        offenders.push(`${id}: first objective is ${first.kind}, expected a reachZone gate`);
        continue;
      }
      const cap = first.maxSpeedKmh;
      if (cap === undefined || cap > 12) {
        offenders.push(`${id}: first objective cap is ${String(cap)} km/h — a passer-by satisfies it`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the FORWARD drills' first task excludes the right-hand lane — a real lateral act", () => {
    // A forward bay entry has no stopping point, it has a RADIUS, so its first
    // task cannot be a halt; it is „take your room". Both forward gates must
    // therefore be unsatisfiable from the lane centre (x = 4.0625).
    for (const id of ["sc-park-45", "sc-park-perp-forward"]) {
      const first = byId(id).success[0].params;
      if (first.kind !== "reachZone") return expect.unreachable(`${id} first objective kind`);
      const fromLane = Math.hypot(4.0625 - first.x, 0);
      expect(fromLane, `${id}: lane centre is inside its own setup gate`).toBeGreaterThan(
        first.radiusM,
      );
    }
  });

  it("the REVERSE drills' first task is a halt, and their own copy says „спри“", () => {
    for (const id of [
      "sc-park-parallel",
      "sc-park-narrow",
      "sc-pk-driveway",
      "sc-park-parallel-exit",
      ...PARKING_DEPTH_DRILLS,
    ]) {
      const spec = byId(id);
      const first = spec.success[0].params;
      if (first.kind !== "reachZone") return expect.unreachable(`${id} first objective kind`);
      expect(first.maxSpeedKmh, `${id} halt cap`).toBeLessThanOrEqual(6);
      const copy = spec.instructionsBg.map((s) => s.textBg).join(" ");
      expect(copy, `${id}: nothing in the copy asks for the stop the gate demands`).toMatch(
        /спри|СПРИ/,
      );
    }
  });

  it("every manoeuvre drill's objectiveBg NAMES both tasks", () => {
    for (const id of LANE15_MANEUVER_DRILLS) {
      expect(byId(id).objectiveBg, id).toMatch(/Две задачи/);
    }
  });

  it("the P0 in templates.ts carries the same halt gate as its repaired siblings", () => {
    // The reminder this assertion used to be ("FAILS THE DAY SOMEBODY FIXES
    // IT") did its job: catalog position 1 held a 14 m / ≤ 15 km/h drive-by
    // first objective a student satisfied at fourteen km/h without stopping.
    // It is now the same at-rest pull-past gate sc-park-narrow uses, on the
    // pose the committed shadow actually stops at.
    const p0 = byId("sc-park-perp-rev").success[0].params;
    if (p0.kind !== "reachZone") return expect.unreachable("P0 first objective kind");
    expect(p0.maxSpeedKmh).toBe(6);
    expect(Math.hypot(p0.x - 0.9, p0.y - 6)).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// §2 — no hidden speed contracts (doc 86 D4/T8)
// ---------------------------------------------------------------------------

describe("D4 — a capped waypoint must be a contract the student can read", () => {
  it("every numeric cap this lane authored is spelled out in the template's own copy", () => {
    const pairs: Array<[string, string]> = [
      ["sc-park-perp-forward", "8 км/ч"],
      ["sc-park-parallel-exit", "12 км/ч"],
    ];
    for (const [id, phrase] of pairs) {
      const copy = byId(id).instructionsBg.map((s) => s.textBg).join(" ");
      expect(copy, `${id}: the ${phrase} contract is invisible`).toContain(phrase);
    }
  });

  it("no parking waypoint caps a speed the road itself permits", () => {
    // The other half of D4, and the reason sc-pk-smooth-stop's approach
    // checkpoint stays uncapped: a gate that convicts a driver holding the
    // POSTED limit is a trap, and a blown capped waypoint is unrecoverable
    // (B4). Every capped waypoint in this family therefore lives on a
    // manoeuvring surface — a 20 km/h lot aisle or a gate whose own copy names
    // the number — never on a 50 km/h street at cruising speed.
    const smoothStop = byId("sc-pk-smooth-stop").success[0].params;
    if (smoothStop.kind !== "reachZone") return expect.unreachable("kind");
    expect(smoothStop.maxSpeedKmh).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §3 — the rungs are made of content (doc 86 L13/D7)
// ---------------------------------------------------------------------------

describe("L13 — „L2 L3 L4 L5 They have Nothing More“, for this family", () => {
  /**
   * The three templates that still stop at L4, and why each is RIGHT to.
   * A five-rung ladder is not the goal; a rung that means something is. Two of
   * these are refusals lane 15 made after trying the opposite — see the
   * templates' own comments and the in-tree pins named here.
   */
  const NO_L5_BY_DESIGN = new Map<string, string>([
    // sc-park-perp-rev is GONE from this list: the lessons-progression wave
    // owns templates.ts and gave catalog position 1 the night+rain rung its
    // repaired sibling sc-park-narrow ships (doc 87 B2 — every parking card
    // beside it read „L1–L5" while the first one read „L1–L4").
    [
      "sc-pk-busstop-ban",
      "s-w2-bot-completion.ts:304 — „the fault is a DECISION, not a condition; " +
        "rain and night would decorate it without teaching it\". Lane 15 authored " +
        "a rain+wetGrip rung, agreed with the pin and reverted it.",
    ],
    [
      "sc-pk-rail-ban",
      "s-w7-bot-completion.ts:213 — „night would only hide a crossing whose А34 " +
        "post does not render yet anyway\". Lane 15 authored a fog rung, saw it " +
        "would hide a sign the world does not build (doc 86 T13/T15), reverted it.",
    ],
  ]);

  it("every parking template ships an L5 rung, or a reviewed reason not to", () => {
    // Before this lane: 10 of the 16 parking templates had no L5 tile at all —
    // on those the founder was not clicking a dead button, there was nothing to
    // click (doc 86 R4). After it: 15 of 18 carry one and the other three are
    // named above with the evidence.
    const missing = PARKING.filter(
      (s) => !NO_L5_BY_DESIGN.has(s.id) && !s.levels.some((l) => l.level === 5),
    ).map((s) => s.id);
    expect(missing, missing.join(", ")).toEqual([]);
    // …and the exemption list may not rot: an entry that grows an L5 must be
    // deleted from it in the same change.
    for (const [id] of NO_L5_BY_DESIGN) {
      expect(byId(id).levels.some((l) => l.level === 5), `${id} now has an L5`).toBe(false);
    }
  });

  it("every L5 carries a CONTENT complication, not just the missing aid table", () => {
    const bare: string[] = [];
    for (const spec of PARKING) {
      const l5 = spec.levels.find((l) => l.level === 5);
      if (!l5) continue;
      const hasContent =
        l5.conditions !== undefined ||
        l5.physics !== undefined ||
        l5.traffic !== undefined ||
        l5.stagedAdd !== undefined ||
        l5.rubric !== undefined ||
        l5.toleranceScale !== undefined;
      if (!hasContent) bare.push(spec.id);
    }
    expect(bare, bare.join(", ")).toEqual([]);
  });

  it("the family uses at least four DIFFERENT kinds of L5 complication", () => {
    const kinds = new Set<string>();
    for (const spec of PARKING) {
      const l5 = spec.levels.find((l) => l.level === 5);
      if (!l5) continue;
      if (l5.conditions?.night) kinds.add("night");
      if (l5.conditions?.weather && l5.conditions.weather !== "dry") kinds.add(l5.conditions.weather);
      if (l5.physics) kinds.add("physics");
      if (l5.traffic) kinds.add("traffic");
      if (l5.stagedAdd) kinds.add("staged");
      if (l5.toleranceScale !== undefined) kinds.add("tolerance");
    }
    expect([...kinds].sort().join(",")).toBeTruthy();
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it("the exam rung GRADES tighter where a measured channel exists (D7)", () => {
    // Every parking template with a parkInBay/threePointTurn economy channel
    // must tighten it at L4 — „изпитни условия" that only removes the aids is
    // the complaint, not the answer.
    const soft: string[] = [];
    for (const spec of PARKING) {
      const base = spec.rubric?.economy;
      if (!base) continue;
      const l4 = spec.levels.find((l) => l.level === 4);
      const over = l4?.rubric?.economy;
      if (!over || over.attemptsFor2Stars >= base.attemptsFor2Stars) soft.push(spec.id);
    }
    expect(soft, soft.join(", ")).toEqual([]);
  });
});

describe("L12 — an authored ambient count must have somewhere to put the actors", () => {
  it("every parking rung that asks for cars sits on a district with a lane graph", () => {
    // Doc 86 L12's other half: a `traffic` block on a map that cannot host it
    // is a promise of a busy street that renders empty. The lot aisles are
    // class `service` and are EXCLUDED from the lane graph, so a vehicleCount
    // authored there would stage nothing — this proves the two rungs that do
    // ask for cars ask on `residential` edges that the graph actually carries.
    for (const spec of PARKING) {
      for (const rung of spec.levels) {
        const n = rung.traffic?.vehicleCount ?? 0;
        if (n === 0) continue;
        const raw = loadDistrict(spec.map.districtId) as { roads: { edges: Array<{ class: string }> } };
        const drivable = raw.roads.edges.filter(
          (e) => !DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses.includes(e.class),
        );
        expect(
          drivable.length,
          `${spec.id}@L${rung.level} asks for ${n} cars on ${spec.map.districtId}, which has no non-excluded edge`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every parking rung that asks for pedestrians sits on a district with a crossing", () => {
    // The ambient pedestrian system anchors around `district.crossings`; a
    // count on a district with none is a crowd that never appears.
    for (const spec of PARKING) {
      for (const rung of spec.levels) {
        const n = rung.traffic?.pedestrianCount ?? 0;
        if (n === 0) continue;
        const raw = loadDistrict(spec.map.districtId) as { crossings?: unknown[] };
        expect(
          (raw.crossings ?? []).length,
          `${spec.id}@L${rung.level} asks for ${n} pedestrians on ${spec.map.districtId}, which has no crossing to anchor them`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — ten different parking situations, counted
// ---------------------------------------------------------------------------

describe("„at least 10 genuinely different parking situations“", () => {
  it("the parking-depth wave alone is TEN drills that put a car in a space", () => {
    // The literal ask, checked literally — and none of the ten is a turn.
    expect(PARKING_DEPTH_DRILLS).toHaveLength(10);
    for (const id of PARKING_DEPTH_DRILLS) {
      const spec = byId(id);
      const terminal = spec.success[spec.success.length - 1].params;
      expect(terminal.kind, id).toBe("completeManeuver");
      if (terminal.kind !== "completeManeuver") continue;
      expect(terminal.maneuver, `${id} must GRADE a park, not a turn`).toBe("parkInBay");
    }
    for (const id of TURN_DRILLS) {
      const terminal = byId(id).success[byId(id).success.length - 1].params;
      expect(
        terminal.kind === "completeManeuver" && terminal.maneuver === "parkInBay",
        `${id} is a turn — it may never be counted toward the ten`,
      ).toBe(false);
    }
  });

  it("each of the ten rides its OWN committed district — no recolours", () => {
    const maps = PARKING_DEPTH_DRILLS.map((id) => byId(id).map.districtId);
    expect(new Set(maps).size, maps.join(", ")).toBe(10);
    // …and none of them re-uses a map an older parking drill already teaches on.
    const older = new Set(
      PARKING.filter((s) => !PARKING_DEPTH_DRILLS.includes(s.id as never)).map(
        (s) => s.map.districtId,
      ),
    );
    for (const m of maps) expect(older.has(m), `${m} is an older drill's map`).toBe(false);
  });

  it("the ten teach ten different things, measured on what each one CHANGES", () => {
    // A situation is the tuple a learner actually experiences: the geometry of
    // the space, which side of him it is on, which gear takes him into it, and
    // what is standing next to it. Two drills that agree on all four are one
    // drill painted twice.
    const signatures = PARKING_DEPTH_DRILLS.map((id) => {
      const spec = byId(id);
      const terminal = spec.success[spec.success.length - 1].params;
      if (terminal.kind !== "completeManeuver" || terminal.maneuver !== "parkInBay") return id;
      const p = spec.map.params;
      return [
        p.angle,
        String(p.pitchesM ?? "uniform"),
        p.side ?? "east",
        terminal.entry ?? "reverse",
        p.occupancy,
        spec.conditions?.night === true ? "night" : "day",
      ].join("/");
    });
    expect(new Set(signatures).size, signatures.join("\n")).toBe(10);
  });

  it("the whole parking family is 28 lessons and every one of them is traced", () => {
    expect(PARKING).toHaveLength(28);
    for (const spec of PARKING) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) expect(ref.pending, `${spec.id} ${ref.path}`).not.toBe(true);
      expect(spec.mistakes.length, spec.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("the manoeuvre set is 18 distinct graded acts across 18 committed maps", () => {
    expect(MANEUVER_DRILLS.length).toBe(18);
    for (const id of MANEUVER_DRILLS) expect(byId(id).id).toBe(id);
    // Distinct graded ACTS, not distinct ids: a lesson that grades the same
    // contract on the same geometry as another is a skin, not a situation.
    const acts = new Set(
      MANEUVER_DRILLS.map((id) => {
        const spec = byId(id);
        const terminal = spec.success[spec.success.length - 1].params;
        const shape =
          terminal.kind === "completeManeuver"
            ? `${terminal.maneuver}:${"entry" in terminal ? String(terminal.entry ?? "reverse") : "reverse"}`
            : "extract";
        return `${spec.map.districtId}/${shape}`;
      }),
    );
    expect(acts.size, [...acts].join("\n")).toBe(MANEUVER_DRILLS.length);
  });
});

// ---------------------------------------------------------------------------
// §5 — a night/rain/fog rung may not bill a duty its copy never states (L10)
// ---------------------------------------------------------------------------

describe("L10 — lights duty stated wherever this family compiles a dark rung", () => {
  /**
   * The COMPILED briefing per rung (2026-08-02), not `spec.instructionsBg`:
   * the old read consulted a field compileScenario dropped and nothing
   * rendered, so it certified writing rather than teaching. `briefingBg` is
   * what the student is shown — and blocked on — before the wheels turn.
   */
  it("every parking rung with night/rain/fog names the lamps in the briefing it SHOWS", () => {
    const silent: string[] = [];
    for (const spec of PARKING) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level);
        const env = lesson.environment;
        if (!(env?.timeOfDay === "night" || env?.rain === true || env?.fog === true)) continue;
        if (!(lesson.briefingBg ?? []).some((s) => /светлин|фаров/i.test(s.textBg))) {
          silent.push(`${spec.id}@L${rung.level}`);
        }
      }
    }
    expect(silent, silent.join(", ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §6 — the two new drills survive the FULL production pipeline
// ---------------------------------------------------------------------------

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

/** Drive an authored shadow script through a REAL lesson session at a rung. */
function driveThroughSession(
  spec: ScenarioSpec,
  level: 1 | 2 | 3 | 4 | 5,
  record: (district: unknown, onTick: (tick: Parameters<typeof applyTick>[1]) => void) => unknown,
): LessonSessionState {
  const lesson = compileScenario(spec, level);
  let session = createLessonSession(lesson);
  record(loadDistrict(spec.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return session;
}

describe("the two new drills complete through compileScenario → session → result", () => {
  it("sc-park-perp-forward: the shadow completes BOTH tasks at L3, clean", () => {
    const session = driveThroughSession(SC_PARK_PERP_FORWARD, 3, (district, onTick) =>
      recordScParkPerpForwardDrive(district, "shadow-correct", { onTick }),
    );
    const result = buildLessonResult(session);
    expect(result.objectives.map((o) => `${o.id}:${o.done}`)).toEqual([
      "sc-ppf-setup:true",
      "sc-ppf-park:true",
    ]);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("sc-park-parallel-exit: the shadow completes BOTH tasks at L3, clean", () => {
    const session = driveThroughSession(SC_PARK_PARALLEL_EXIT, 3, (district, onTick) =>
      recordScParkParallelExitDrive(district, "shadow-correct", { onTick }),
    );
    const result = buildLessonResult(session);
    expect(result.objectives.map((o) => `${o.id}:${o.done}`)).toEqual([
      "sc-ppx-room:true",
      "sc-ppx-out:true",
    ]);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  /**
   * THE PARKING-DEPTH PROOF. Ten drills is a claim; ten drills a student can
   * actually finish is the thing. Each of the ten authored shadows is driven
   * through compileScenario → createLessonSession → applyTick → the real
   * result, at the unaided rung, and must tick BOTH objectives with no
   * violation anywhere. This is what „it works" means in this repo — the trace
   * gate proves the drive is legal, this proves the LESSON accepts it.
   */
  it("all ten new drills: the shadow completes both tasks at L3, clean", () => {
    const failures: string[] = [];
    for (const id of PARKING_DEPTH_DRILLS) {
      const spec = byId(id);
      const session = driveThroughSession(spec, 3, (district, onTick) =>
        recordScParkDepthDrive(district, id as ParkDepthDrillId, "shadow-correct", { onTick }),
      );
      const result = buildLessonResult(session);
      const done = result.objectives.map((o) => `${o.id}:${o.done}`).join(",");
      const expected = spec.success.map((o) => `${o.id}:true`).join(",");
      if (done !== expected) failures.push(`${id}: ${done} (expected ${expected})`);
      const violations = session.events.filter((e) => e.kind === "violation");
      if (violations.length > 0) {
        failures.push(`${id}: ${violations.map((v) => ("code" in v ? v.code : "?")).join(",")}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("no new drill hands the student a car already standing inside its own first gate", () => {
    // The B4 hazard, checked at EVERY rung: a capped waypoint the spawn already
    // satisfies is a task the HUD counts and the student never performs.
    for (const id of PARKING_DEPTH_DRILLS) {
      const spec = byId(id);
      const raw = loadDistrict(spec.map.districtId) as {
        spawnPoints: Array<{ id: string; x: number; y: number }>;
      };
      const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId);
      expect(spawn, `${id}: unknown spawn ${String(spec.start.spawnPointId)}`).toBeDefined();
      for (const rung of spec.levels) {
        const gate = compileScenario(spec, rung.level).objectives[0];
        const d = Math.hypot(spawn!.x - (gate.params.x as number), spawn!.y - (gate.params.y as number));
        expect(d, `${id}@L${rung.level} spawns inside its own first gate`).toBeGreaterThan(
          gate.params.radiusM as number,
        );
      }
    }
  });

  it("the L1 ladder never swallows a task: the exit drill's start pose stays OUTSIDE its own first gate", () => {
    // The room-buying reverse is only a task if standing still cannot satisfy
    // it — at every rung, including the most forgiving one.
    const start = SC_PARK_PARALLEL_EXIT.start.position!;
    for (const rung of SC_PARK_PARALLEL_EXIT.levels) {
      const gate = compileScenario(SC_PARK_PARALLEL_EXIT, rung.level).objectives[0];
      const r = gate.params.radiusM as number;
      const d = Math.hypot(start.x - (gate.params.x as number), start.y - (gate.params.y as number));
      expect(d, `L${rung.level}: the car starts inside its own first gate (r=${r})`).toBeGreaterThan(r);
    }
  });
});
